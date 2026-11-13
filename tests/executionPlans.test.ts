import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blankExecutionPlan, validateExecutionPlan } from '../src/domain/executionPlan'
import { close, commit, createDraft, get, revise, saveDraft } from '../convex/executionPlans'

function completePlan() {
  return { ...blankExecutionPlan(), title: 'London continuation', thesis: 'Price holds above the prior session range.', invalidationCondition: 'A close below the range invalidates the thesis.', invalidationAction: 'Stand aside and reassess.', entryConditions: 'Wait for a retest and rejection.', managementPlan: 'Protect the position at the planned stop.', exitRationale: 'Exit at the next planned level.', maxLossUsd: 50 }
}

test('a plan may commit without a fixed number of confirmations and keeps invalidation separate from its stop', () => {
  const content = { ...completePlan(), protectiveStop: 1.08 }
  assert.deepEqual(validateExecutionPlan(content), [])
  assert.equal(content.confirmations.length, 0)
  assert.notEqual(content.invalidationCondition, String(content.protectiveStop))
})

test('committed plans require a positive max-loss amount or a percentage no greater than 100', () => {
  assert.ok(validateExecutionPlan({ ...completePlan(), maxLossUsd: undefined, maxLossPercent: undefined }).some((error) => error.includes('maximum loss')))
  assert.ok(validateExecutionPlan({ ...completePlan(), maxLossUsd: undefined, maxLossPercent: 101 }).some((error) => error.includes('percentage')))
  assert.deepEqual(validateExecutionPlan({ ...completePlan(), maxLossUsd: undefined, maxLossPercent: 1.5 }), [])
})

function mockContext(subject: string | null, accountOwner = 'user-a') {
  const rows = new Map<string, Record<string, any>>([['account', { _id: 'account', owner: accountOwner }]])
  const writes: Array<{ kind: 'insert' | 'patch'; id: string; table?: string; value: Record<string, unknown> }> = []
  let next = 0
  const ctx = {
    auth: { getUserIdentity: async () => subject ? { subject } : null },
    db: {
      get: async (id: string) => rows.get(id) ?? null,
      query: (table: string) => ({ withIndex: (_index: string, callback: (query: any) => unknown) => {
        const query = { gte: () => query, lt: () => query, eq: () => query }
        callback(query)
        return { collect: async () => [...rows.values()].filter((row) => row._table === table || (!row._table && table === 'tradingAccounts')) }
      } }),
      insert: async (table: string, value: Record<string, unknown>) => {
        const id = `${table}-${++next}`
        rows.set(id, { ...value, _id: id, _table: table })
        writes.push({ kind: 'insert', id, table, value })
        return id
      },
      patch: async (id: string, value: Record<string, unknown>) => {
        const current = rows.get(id)
        if (!current) throw new Error('Not found')
        const nextValue = { ...current, ...value }
        for (const [key, entry] of Object.entries(value)) if (entry === undefined) delete nextValue[key]
        rows.set(id, nextValue)
        writes.push({ kind: 'patch', id, value })
      },
    },
  }
  return { ctx, rows, writes }
}

test('plan mutations require authentication and account ownership', async () => {
  const unauthenticated = mockContext(null)
  await assert.rejects(() => (createDraft as any)._handler(unauthenticated.ctx, { content: completePlan() }), /Sign in required/)
  const foreignAccount = mockContext('user-a', 'user-b')
  await assert.rejects(() => (createDraft as any)._handler(foreignAccount.ctx, { accountId: 'account', content: completePlan() }), /Account not found/)
  assert.equal(foreignAccount.writes.length, 0)
})

test('draft revisions reject stale writes and commit with a server timestamped immutable version chain', async () => {
  const { ctx, rows, writes } = mockContext('user-a')
  const content = completePlan()
  const planId = await (createDraft as any)._handler(ctx, { accountId: 'account', content })
  await assert.rejects(() => (saveDraft as any)._handler(ctx, { planId, expectedRevision: 2, content }), /changed in another session/)
  await assert.rejects(() => (commit as any)._handler(ctx, { planId, expectedRevision: 2, content }), /changed in another session/)
  const original = await (commit as any)._handler(ctx, { planId, expectedRevision: 0, content })
  const firstVersion = rows.get(original.versionId)
  assert.equal(firstVersion?.version, 1)
  assert.equal(firstVersion?.kind, 'original')
  assert.ok(Number(firstVersion?.committedAt) > 0)
  assert.equal(rows.get(planId)?.status, 'committed')
  assert.equal(rows.get(planId)?.draft, undefined)
  await assert.rejects(() => (saveDraft as any)._handler(ctx, { planId, expectedRevision: 1, content }), /Only a draft/)
  const revised = { ...content, title: 'Revised London continuation' }
  const second = await (revise as any)._handler(ctx, { planId, expectedVersion: 1, reason: 'Updated after reviewing the session context.', content: revised })
  assert.equal(rows.get(second.versionId)?.version, 2)
  assert.equal(rows.get(second.versionId)?.previousVersionId, original.versionId)
  assert.equal(rows.get(original.versionId)?.content.title, 'London continuation')
  assert.equal(rows.get(planId)?.latestVersionId, second.versionId)
  assert.equal(writes.filter((write) => write.kind === 'patch' && write.id === original.versionId).length, 0)
  await assert.rejects(() => (revise as any)._handler(ctx, { planId, expectedVersion: 1, reason: 'Stale revision', content: revised }), /newer plan revision/)
})

test('plan details and close states stay owner scoped and require a reason', async () => {
  const own = mockContext('user-a')
  const planId = await (createDraft as any)._handler(own.ctx, { content: completePlan() })
  const foreign = mockContext('user-b')
  foreign.rows.set(planId, own.rows.get(planId)!)
  await assert.rejects(() => (get as any)._handler(foreign.ctx, { planId }), /Plan not found/)
  await assert.rejects(() => (close as any)._handler(own.ctx, { planId, status: 'cancelled', reason: '  ' }), /Add a reason/)
  await (close as any)._handler(own.ctx, { planId, status: 'cancelled', reason: 'Setup no longer applies.' })
  assert.equal(own.rows.get(planId)?.status, 'cancelled')
  assert.equal(own.rows.get(planId)?.closeReason, 'Setup no longer applies.')
})
