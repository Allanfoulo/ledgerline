import { test } from 'node:test'
import assert from 'node:assert/strict'
import { blankExecutionPlan, validateExecutionPlan } from '../src/domain/executionPlan'
import { close, commit, createDraft, get, revise, saveDraft } from '../convex/executionPlans'

function completePlan() {
  return { ...blankExecutionPlan(), title: 'London continuation', thesis: 'Price holds above the prior session range.', invalidationCondition: 'A close below the range invalidates the thesis.', invalidationAction: 'Stand aside and reassess.', entryConditions: 'Wait for a retest and rejection.', managementPlan: 'Protect the position at the planned stop.', exitRationale: 'Exit at the next planned level.', maxLossUsd: 50 }
}

test('a plan may commit without a fixed number of confirmations and keeps invalidation separate from its stop', () => {
  const content = { ...completePlan(), protectiveStop: 1.08, entryRange: { low: 1.07, high: 1.071 }, targetRange: { low: 1.09, high: 1.091 }, invalidationRange: { low: 1.06, high: 1.061 } }
  assert.deepEqual(validateExecutionPlan(content), [])
  assert.equal(content.confirmations.length, 0)
  assert.notEqual(content.invalidationCondition, String(content.protectiveStop))
  assert.ok(validateExecutionPlan({ ...content, invalidationRange: { low: 1.06 } }).some((error) => error.includes('Invalidation area')))
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
        const conditions: Array<{ field: string; operation: 'eq' | 'gte' | 'lt'; value: unknown }> = []
        const query = {
          gte: (field: string, value: unknown) => { conditions.push({ field, operation: 'gte', value }); return query },
          lt: (field: string, value: unknown) => { conditions.push({ field, operation: 'lt', value }); return query },
          eq: (field: string, value: unknown) => { conditions.push({ field, operation: 'eq', value }); return query },
        }
        callback(query)
        const matches = () => [...rows.values()].filter((row) => (row._table === table || (!row._table && table === 'tradingAccounts')) && conditions.every(({ field, operation, value }) => {
          const actual = row[field]
          if (operation === 'eq') return actual === value
          if (operation === 'gte') return String(actual) >= String(value)
          return String(actual) < String(value)
        }))
        return { collect: async () => matches(), unique: async () => matches()[0] ?? null }
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

test('committed plan revisions snapshot private chart, selected strategy version, and analysis provenance', async () => {
  const { ctx, rows } = mockContext('user-a')
  const content = { ...completePlan(), instrument: 'XAU/USD', invalidationRange: { low: 3983.15, high: 3984.5 }, entryRange: { low: 3996.3, high: 4003.8 }, targetRange: { low: 4026.1, high: 4030.1 } }
  const planId = await (createDraft as any)._handler(ctx, { content })
  rows.set('strategy', { _id: 'strategy', _table: 'strategies', owner: 'user-a', name: 'ISX', description: 'Structure shifts', rules: ['Wait for S2'] })
  rows.set('strategy-version', { _id: 'strategy-version', _table: 'strategyVersions', owner: 'user-a', strategyId: 'strategy', version: 1, name: 'ISX', description: 'Structure shifts', rules: ['Wait for S2'], signals: [{ name: 'S1', description: 'Retracement shift' }], committedAt: 1 })
  rows.set('chart-image', { _id: 'chart-image', _table: 'planImages', owner: 'user-a', planId, storageId: 'storage', previewStorageId: 'preview', mimeType: 'image/png', size: 10, createdAt: 1 })
  rows.set('analysis', { _id: 'analysis', _table: 'planAnalysisRuns', owner: 'user-a', planId, imageId: 'chart-image', strategyVersionId: 'strategy-version', provider: 'google', model: 'gemma-4-26b-a4b-it', suggestions: { signals: [] }, createdAt: 2 })
  rows.set('selection', { _id: 'selection', _table: 'planStrategySelections', owner: 'user-a', planId, strategyVersionId: 'strategy-version', analysisRunId: 'analysis' })

  const original = await (commit as any)._handler(ctx, { planId, expectedRevision: 0, content })
  const committedImages = [...rows.values()].filter((row) => row._table === 'planVersionImages' && row.planVersionId === original.versionId)
  const committedStrategy = [...rows.values()].find((row) => row._table === 'planVersionStrategies' && row.planVersionId === original.versionId)
  const committedAnalysis = [...rows.values()].find((row) => row._table === 'planVersionAnalyses' && row.planVersionId === original.versionId)
  assert.equal(committedImages[0]?.imageId, 'chart-image')
  assert.equal(committedStrategy?.strategyVersionId, 'strategy-version')
  assert.equal(committedAnalysis?.analysisRunId, 'analysis')
  assert.deepEqual(rows.get(original.versionId)?.content.invalidationRange, { low: 3983.15, high: 3984.5 })

  const second = await (revise as any)._handler(ctx, { planId, expectedVersion: 1, reason: 'Clarified the entry area.', content: { ...content, entryRange: { low: 3997, high: 4002 } } })
  assert.ok([...rows.values()].some((row) => row._table === 'planVersionImages' && row.planVersionId === second.versionId && row.imageId === 'chart-image'))
  assert.ok([...rows.values()].some((row) => row._table === 'planVersionStrategies' && row.planVersionId === second.versionId && row.strategyVersionId === 'strategy-version'))
  assert.ok([...rows.values()].some((row) => row._table === 'planVersionAnalyses' && row.planVersionId === second.versionId && row.analysisRunId === 'analysis'))
  assert.deepEqual(rows.get(original.versionId)?.content.entryRange, { low: 3996.3, high: 4003.8 })
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
