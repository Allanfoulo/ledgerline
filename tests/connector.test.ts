import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { importDeals, issue } from '../convex/connector'

const base = { sourceKey: `mt5:${'a'.repeat(64)}`, date: '2026-11-02', pair: 'EUR/USD', side: 'Long', lots: 1, entry: 1.1, exit: 1.102, entryTime: '08:00', exitTime: '09:00', commission: 2, swap: 0, setup: 'MT5', executions: [{ time: '08:00', action: 'Buy', price: 1.1, lots: 1 }, { time: '09:00', action: 'Sell', price: 1.102, lots: 1 }] }
test('issued connector tokens are random, scoped and stored only as a hash', async () => {
  let saved: any
  const ctx = { auth: { getUserIdentity: async () => ({ subject: 'user-a|session' }) }, runQuery: async () => 'user-a', runMutation: async (_ref: unknown, args: unknown) => { saved = args } }
  const token = await (issue as any)._handler(ctx, { accountId: 'account' })
  assert.match(token, /^[0-9a-f]{64}$/)
  assert.equal(saved.hash, createHash('sha256').update(token).digest('hex'))
  assert.equal(saved.owner, 'user-a'); assert.equal(saved.expiresAt - saved.createdAt, 30 * 86400000)
  assert.equal(JSON.stringify(saved).includes(token), false)
})
function context(token: unknown, account: unknown, existing: unknown[] = []) {
  const writes: string[] = []
  const ctx = { db: {
    get: async () => account,
    patch: async () => { writes.push('patch') },
    insert: async (table: string) => { writes.push(table); return 'trade-id' },
    query: (table: string) => ({ withIndex: (_name: string, callback: (q: { eq: () => unknown }) => unknown) => { const q = { eq: () => q }; callback(q); return { unique: async () => token, collect: async () => table === 'journalTrades' ? existing : [] } } }),
  } }
  return { ctx, writes }
}
test('connector rejects invalid token, wrong broker and malformed fills before import', async () => {
  const absent = context(null, null)
  await assert.rejects(() => (importDeals as any)._handler(absent.ctx, { hash: 'bad', brokerKey: 'b'.repeat(64), trades: [base] }), /Unauthorized/)
  const mismatch = context({ owner: 'u', accountId: 'a', expiresAt: Date.now() + 10000 }, { owner: 'u', brokerKey: 'c'.repeat(64) })
  await assert.rejects(() => (importDeals as any)._handler(mismatch.ctx, { hash: 'good', brokerKey: 'b'.repeat(64), trades: [base] }), /another MT5 account/)
  assert.deepEqual(mismatch.writes, [])
  const invalid = context({ owner: 'u', accountId: 'a', expiresAt: Date.now() + 10000 }, { owner: 'u', brokerKey: 'b'.repeat(64) })
  await assert.rejects(() => (importDeals as any)._handler(invalid.ctx, { hash: 'good', brokerKey: 'b'.repeat(64), trades: [{ ...base, executions: [base.executions[0], { ...base.executions[1], lots: 0.5 }] }] }), /Invalid execution totals/)
  assert.deepEqual(invalid.writes, [])
})
test('connector stores individual fills and avoids importing a source twice', async () => {
  const token = { owner: 'u', accountId: 'a', expiresAt: Date.now() + 10000 }; const account = { owner: 'u', brokerKey: 'b'.repeat(64) }
  const first = context(token, account)
  assert.deepEqual(await (importDeals as any)._handler(first.ctx, { hash: 'good', brokerKey: 'b'.repeat(64), trades: [base, base] }), { inserted: 1, duplicates: 1 })
  assert.deepEqual(first.writes, ['journalTrades', 'tradeExecutions', 'tradeExecutions'])
})
test('distinct MT5 position IDs with matching details remain distinct; manual matches stay protected', async () => {
  const token = { owner: 'u', accountId: 'a', expiresAt: Date.now() + 10000 }; const account = { owner: 'u', brokerKey: 'b'.repeat(64) }
  const first = context(token, account)
  const second = { ...base, sourceKey: `mt5:${'c'.repeat(64)}` }
  assert.deepEqual(await (importDeals as any)._handler(first.ctx, { hash: 'good', brokerKey: 'b'.repeat(64), trades: [base, second, base] }), { inserted: 2, duplicates: 1 })
  const fingerprint = JSON.stringify([base.date, base.pair, base.side, base.lots, base.entry, base.exit, base.entryTime, base.exitTime, base.commission, base.swap])
  const manual = context(token, account, [{ fingerprint }])
  assert.deepEqual(await (importDeals as any)._handler(manual.ctx, { hash: 'good', brokerKey: 'b'.repeat(64), trades: [base] }), { inserted: 0, duplicates: 1 })
})
test('connector accepts verified gold fills spanning two dates', async () => {
  const gold = { ...base, brokerSymbol: 'XAUUSDz', date: '2026-11-02', exitDate: '2026-11-03', pair: 'XAU/USD', entry: 4000, exit: 4002, entryTime: '23:00', exitTime: '01:00', executions: [{ date: '2026-11-02', time: '23:00', action: 'Buy', price: 4000, lots: 1 }, { date: '2026-11-03', time: '01:00', action: 'Sell', price: 4002, lots: 1 }] }
  const token = { owner: 'u', accountId: 'a', expiresAt: Date.now() + 10000 }; const account = { owner: 'u', brokerKey: 'b'.repeat(64) }; const first = context(token, account)
  assert.deepEqual(await (importDeals as any)._handler(first.ctx, { hash: 'good', brokerKey: 'b'.repeat(64), trades: [gold] }), { inserted: 1, duplicates: 0 })
})
