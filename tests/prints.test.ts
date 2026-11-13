import { test } from 'node:test'
import assert from 'node:assert/strict'
import { importDeals } from '../convex/connector'
import { backfillPrints, listPrints } from '../convex/journal'

const account = { _id: 'account-a', owner: 'user-a', brokerKey: 'b'.repeat(64) }
const token = { owner: 'user-a', accountId: 'account-a', expiresAt: Date.now() + 60000 }
const deal = (n: number) => ({ sourceKey: `mt5:${n.toString(16).padStart(64, '0')}`, brokerSymbol: 'XAUUSDz', date: '2026-11-02', exitDate: '2026-11-03', pair: 'XAU/USD', side: 'Long', lots: 1, entry: 4000, exit: 4002, entryTime: '23:00', exitTime: '01:00', commission: 2, swap: 0, setup: 'MT5', executions: [{ date: '2026-11-02', time: '23:00', action: 'Buy', price: 4000, lots: 0.4 }, { date: '2026-11-02', time: '23:00', action: 'Buy', price: 4000, lots: 0.6 }, { date: '2026-11-03', time: '01:00', action: 'Sell', price: 4002, lots: 1 }] })

function memory(subject = 'user-a|session') {
  const rows: Record<string, any[]> = { journalTrades: [], tradeExecutions: [], tradePrints: [], printJobs: [], connectorTokens: [token] }
  let seq = 0
  const db = {
    get: async (id: string) => id === account._id ? account : null,
    patch: async () => {},
    insert: async (table: string, value: any) => { const id = `${table}-${++seq}`; rows[table].push({ _id: id, ...value }); return id },
    query: (table: string) => ({ withIndex: (_name: string, callback: (q: any) => unknown) => {
      const filters: Array<[string, unknown]> = []; const q = { eq: (field: string, value: unknown) => { filters.push([field, value]); return q } }; callback(q)
      // The test token has a fixed hash, while all other filters match stored records.
      const select = () => rows[table].filter((row) => filters.every(([field, value]) => field === 'hash' || row[field] === value))
      return { unique: async () => select()[0] ?? null, collect: async () => select(), paginate: async ({ cursor, numItems }: { cursor: string | null; numItems: number }) => { const start = Number(cursor ?? 0); const all = select(); const end = Math.min(start + numItems, all.length); return { page: all.slice(start, end), isDone: end === all.length, continueCursor: String(end) } } }
    } }),
  }
  return { rows, ctx: { db, auth: { getUserIdentity: async () => ({ subject }) } } }
}
const request = (trades: ReturnType<typeof deal>[]) => ({ hash: 'test', brokerKey: 'b'.repeat(64), trades })

test('five MT5 syncs produce one private pending Print with original gold symbol and fills', async () => {
  const m = memory()
  for (let i = 0; i < 5; i++) assert.deepEqual(await (importDeals as any)._handler(m.ctx, request([deal(1)])), i ? { inserted: 0, duplicates: 1 } : { inserted: 1, duplicates: 0 })
  assert.equal(m.rows.journalTrades.length, 1); assert.equal(m.rows.tradeExecutions.length, 3); assert.equal(m.rows.tradePrints.length, 1); assert.equal(m.rows.printJobs.length, 1)
  assert.equal(m.rows.journalTrades[0].brokerSymbol, 'XAUUSDz')
  assert.deepEqual((({ owner, accountId, tradeId, origin, timePrecision, status, schemaVersion }) => ({ owner, accountId, tradeId, origin, timePrecision, status, schemaVersion }))(m.rows.tradePrints[0]), { owner: 'user-a', accountId: 'account-a', tradeId: m.rows.journalTrades[0]._id, origin: 'mt5', timePrecision: 'minute', status: 'pending_chart', schemaVersion: 1 })
})

test('100 distinct MT5 positions produce 100 Prints; expired tokens create none', async () => {
  const m = memory(); assert.deepEqual(await (importDeals as any)._handler(m.ctx, request(Array.from({ length: 100 }, (_, i) => deal(i + 1)))), { inserted: 100, duplicates: 0 })
  assert.equal(m.rows.tradePrints.length, 100); assert.equal(m.rows.printJobs.length, 100)
  const expired = memory(); expired.rows.connectorTokens[0] = { ...token, expiresAt: Date.now() - 1 }
  await assert.rejects(() => (importDeals as any)._handler(expired.ctx, request([deal(1)])), /Unauthorized/); assert.equal(expired.rows.tradePrints.length, 0)
})

test('backfill is bounded, owner scoped, repeatable and ignores rows without MT5 provenance', async () => {
  const m = memory()
  for (let i = 0; i < 101; i++) m.rows.journalTrades.push({ _id: `old-${i}`, owner: 'user-a', accountId: 'account-a', sourceKey: deal(i + 1).sourceKey })
  m.rows.journalTrades.push({ _id: 'manual', owner: 'user-a', accountId: 'account-a' })
  const first = await (backfillPrints as any)._handler(m.ctx, { accountId: 'account-a', cursor: null })
  assert.equal(first.created, 100); assert.equal(first.isDone, false)
  const second = await (backfillPrints as any)._handler(m.ctx, { accountId: 'account-a', cursor: first.continueCursor })
  assert.equal(second.created, 1); assert.equal(second.isDone, true); assert.equal(m.rows.tradePrints.length, 101); assert.equal(m.rows.printJobs.length, 101)
  assert.equal((await (backfillPrints as any)._handler(m.ctx, { accountId: 'account-a', cursor: null })).created, 0); assert.equal(m.rows.printJobs.length, 101)
  assert.equal((await (listPrints as any)._handler(m.ctx, { accountId: 'account-a' })).length, 101)
  const other = memory('user-b|session'); other.rows.tradePrints.push(...m.rows.tradePrints)
  await assert.rejects(() => (listPrints as any)._handler(other.ctx, { accountId: 'account-a' }), /Account not found/)
  await assert.rejects(() => (backfillPrints as any)._handler(other.ctx, { accountId: 'account-a', cursor: null }), /Account not found/)
})
