import { test } from 'node:test'
import assert from 'node:assert/strict'
import { list, save } from '../convex/journal'
import { belongsTo } from '../convex/identity'
import { candles, readInternal } from '../convex/secrets'
import { passwordRecovery } from '../convex/passwordRecovery'

test('recovery email sends the code through Resend without exposing the key in the message', async () => {
  const originalFetch = globalThis.fetch
  const oldKey = process.env.RESEND_API_KEY
  const oldFrom = process.env.AUTH_EMAIL_FROM
  process.env.RESEND_API_KEY = 'test-secret'
  process.env.AUTH_EMAIL_FROM = 'Journal <journal@example.com>'
  let sent: RequestInit | undefined
  globalThis.fetch = (async (_url: RequestInfo | URL, options?: RequestInit) => { sent = options; return new Response('{}', { status: 200 }) }) as typeof fetch
  try {
    await passwordRecovery.sendVerificationRequest({ identifier: 'person@example.com', token: 'recovery-code' } as Parameters<typeof passwordRecovery.sendVerificationRequest>[0])
    const body = JSON.parse(String(sent?.body))
    assert.deepEqual(body.to, ['person@example.com'])
    assert.match(body.text, /recovery-code/)
    assert.doesNotMatch(body.text, /test-secret/)
    assert.equal(passwordRecovery.options?.maxAge, 900)
    globalThis.fetch = (async () => new Response('', { status: 500 })) as typeof fetch
    await assert.rejects(() => passwordRecovery.sendVerificationRequest({ identifier: 'person@example.com', token: 'code' } as Parameters<typeof passwordRecovery.sendVerificationRequest>[0]), /Unable to send/)
  } finally {
    globalThis.fetch = originalFetch
    if (oldKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = oldKey
    if (oldFrom === undefined) delete process.env.AUTH_EMAIL_FROM; else process.env.AUTH_EMAIL_FROM = oldFrom
  }
})

const item = { date: '2026-11-02', pair: 'EUR/USD', side: 'Long', lots: 0.5, entry: 1.1, exit: 1.102, entryTime: '08:00', exitTime: '09:00', commission: 1, swap: 0, setup: '' }
function context(subject: string | null, owner = 'user-a', existing: unknown[] = []) {
  const writes: Array<{ table: string; value: unknown }> = []
  const ctx = {
    auth: { getUserIdentity: async () => subject ? { subject } : null },
    db: {
      get: async () => ({ _id: 'account', owner }),
      query: () => ({ withIndex: (_name: string, callback: (query: { eq: () => unknown }) => unknown) => { const query = { eq: () => query }; callback(query); return { collect: async () => existing } } }),
      insert: async (table: string, value: unknown) => { writes.push({ table, value }); return 'trade-id' },
    },
  }
  return { ctx, writes }
}
test('journal account access requires authentication and ownership', async () => {
  await assert.rejects(() => (list as any)._handler(context(null).ctx, { accountId: 'account' }), /Sign in required/)
  await assert.rejects(() => (list as any)._handler(context('user-b').ctx, { accountId: 'account' }), /Account not found/)
  const wrongOwner = context('user-b')
  await assert.rejects(() => (save as any)._handler(wrongOwner.ctx, { accountId: 'account', trades: [item] }), /Account not found/)
  assert.equal(wrongOwner.writes.length, 0)
})
test('ownership survives a new login while rejecting another user', async () => {
  assert.equal(belongsTo('user-a|old-session', 'user-a'), true)
  assert.equal(belongsTo('user-ab|old-session', 'user-a'), false)
  const oldSessionAccount = context('user-a|new-session', 'user-a|old-session')
  const result = await (save as any)._handler(oldSessionAccount.ctx, { accountId: 'account', trades: [item] })
  assert.deepEqual(result, { inserted: 1, duplicates: 0 })
  assert.equal((oldSessionAccount.writes[0].value as { owner: string }).owner, 'user-a|old-session')
})
test('legacy encrypted keys remain available and canonical keys take priority', async () => {
  const makeContext = (rows: unknown[]) => ({ db: { query: () => ({ withIndex: (_name: string, callback: (q: { gte: () => unknown; lt: () => unknown }) => unknown) => { const q = { gte: () => q, lt: () => q }; callback(q); return { collect: async () => rows } } }) } })
  const old = { owner: 'user-a|session-1', _creationTime: 1, ciphertext: 'legacy' }
  const other = { owner: 'user-ab|session-1', _creationTime: 99, ciphertext: 'other' }
  assert.equal((await (readInternal as any)._handler(makeContext([old, other]), { owner: 'user-a' })).ciphertext, 'legacy')
  const canonical = { owner: 'user-a', _creationTime: 0, ciphertext: 'new' }
  assert.equal((await (readInternal as any)._handler(makeContext([old, other, canonical]), { owner: 'user-a' })).ciphertext, 'new')
})
test('a legacy encrypted key can be used after signing in on a new session', async () => {
  const oldFetch = globalThis.fetch; const oldKey = process.env.JOURNAL_ENCRYPTION_KEY
  const raw = new Uint8Array(32).fill(7); const iv = new Uint8Array(12).fill(9)
  const hex = (bytes: Uint8Array) => Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  try {
    process.env.JOURNAL_ENCRYPTION_KEY = hex(raw)
    const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt'])
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode('user-a|old-session') }, key, new TextEncoder().encode('dummy-key'))
    const ctx = { auth: { getUserIdentity: async () => ({ subject: 'user-a|new-session' }) }, runQuery: async () => ({ owner: 'user-a|old-session', iv: hex(iv), ciphertext: hex(new Uint8Array(encrypted)) }) }
    globalThis.fetch = (async (input: string | URL | Request) => { assert.ok(String(input).includes('apikey=dummy-key')); return new Response(JSON.stringify({ values: [{ datetime: '2026-11-02 08:00:00', open: '1.1', high: '1.2', low: '1.0', close: '1.15' }] })) }) as typeof fetch
    const result = await (candles as any)._handler(ctx, { pair: 'EUR/USD', date: '2026-11-02', entryTime: '08:00', exitTime: '09:00' })
    assert.equal(result[0].time, '2026-11-02T08:00:00'); assert.equal(result[0].open, 1.1)
    const overnight = await (candles as any)._handler(ctx, { pair: 'XAU/USD', date: '2026-11-02', exitDate: '2026-11-03', entryTime: '23:00', exitTime: '01:00' })
    assert.equal(overnight[0].open, 1.1)
    await assert.rejects(() => (candles as any)._handler(ctx, { pair: 'XAU/USD', date: '2026-11-02', exitDate: '2026-11-06', entryTime: '08:00', exitTime: '09:00' }), /72 hours/)
  } finally { globalThis.fetch = oldFetch; if (oldKey === undefined) delete process.env.JOURNAL_ENCRYPTION_KEY; else process.env.JOURNAL_ENCRYPTION_KEY = oldKey }
})
test('saving repeated rows creates one trade and its two executions', async () => {
  const { ctx, writes } = context('user-a')
  const result = await (save as any)._handler(ctx, { accountId: 'account', trades: [item, item] })
  assert.deepEqual(result, { inserted: 1, duplicates: 1 })
  assert.deepEqual(writes.map((entry) => entry.table), ['journalTrades', 'tradeExecutions', 'tradeExecutions'])
})
test('explicit duplicate approval keeps both trades and their executions', async () => {
  const { ctx, writes } = context('user-a')
  const result = await (save as any)._handler(ctx, { accountId: 'account', trades: [item, item], allowDuplicates: true })
  assert.deepEqual(result, { inserted: 2, duplicates: 0 })
  assert.deepEqual(writes.map((entry) => entry.table), ['journalTrades', 'tradeExecutions', 'tradeExecutions', 'journalTrades', 'tradeExecutions', 'tradeExecutions'])
})
test('duplicate approval does not bypass account ownership', async () => {
  const { ctx, writes } = context('user-b')
  await assert.rejects(() => (save as any)._handler(ctx, { accountId: 'account', trades: [item], allowDuplicates: true }), /Account not found/)
  assert.equal(writes.length, 0)
})
test('invalid rows are rejected before any writes', async () => {
  const { ctx, writes } = context('user-a')
  await assert.rejects(() => (save as any)._handler(ctx, { accountId: 'account', trades: [item, { ...item, exitTime: '07:00' }] }))
  assert.equal(writes.length, 0)
})
