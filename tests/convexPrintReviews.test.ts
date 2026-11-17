import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actOnQueueItem, linkPlan, noTradeWorkspace, queue, recordNoPlan, saveReview, tradeWorkspace, unlinkPlan } from '../convex/printReviews'
import { previousUtcWeekStart } from '../src/domain/printReview'

const now = Date.now()
const entryStart = Date.parse('2026-11-09T08:15:00.000Z')
const tradeContent = { kind: 'trade' as const, entryAdherence: 'followed' as const, exitAdherence: 'uncertain' as const, riskAdherence: 'not_applicable' as const, deviationReason: '', takeaway: 'Wait for the session close next time.' }
const account = { _id: 'account-a', owner: 'user-a', name: 'Primary', currency: 'USD' }

function trade(id: string, pair: 'EUR/USD' | 'GBP/USD' | 'AUD/USD' | 'XAU/USD' = 'EUR/USD', date = '2026-11-09') {
  return { _id: id, owner: 'user-a', accountId: account._id, date, pair, side: 'Long' as const, lots: 0.2, entry: 1.08, exit: 1.081, entryTime: '08:15', exitTime: '09:10', commission: 1, swap: 0, setup: 'London range', fingerprint: id }
}

function print(id: string, tradeId: string, status: 'pending_chart' | 'pending_capture' | 'captured' | 'needs_data' | 'failed' = 'captured', createdAt = now) {
  return { _id: id, owner: 'user-a', accountId: account._id, tradeId, origin: 'mt5' as const, timePrecision: 'minute' as const, status, createdAt, schemaVersion: 1 as const }
}

function plan(id: string, accountId?: string, status: 'draft' | 'committed' | 'cancelled' | 'expired' = 'committed', revision = 1) {
  return { _id: id, owner: 'user-a', accountId, title: `Plan ${id}`, status, revision, latestVersionId: status === 'draft' ? undefined : `version-${id}`, createdAt: now - 5000, updatedAt: now - 1000, closedAt: status === 'cancelled' || status === 'expired' ? now - 1000 : undefined, closeReason: status === 'cancelled' ? 'Setup invalidated.' : undefined }
}

function planVersion(id: string, planId: string, instrument: 'EUR/USD' | 'GBP/USD' | 'AUD/USD' | 'XAU/USD' = 'EUR/USD', hypothesis: 'bullish' | 'bearish' | 'neutral' | 'conditional' = 'bullish', committedAt = entryStart - 120_000, accountId?: string) {
  return { _id: id, owner: 'user-a', planId, accountId, version: 1, content: { title: `Snapshot ${id}`, instrument, hypothesis, timeframe: '15m', thesis: 'Synthetic test thesis.' }, committedAt, kind: 'original' as const }
}

function memory(subject: string | null = 'user-a|session', seeded: Record<string, any[]> = {}) {
  const rows: Record<string, any[]> = {
    tradingAccounts: [account], journalTrades: [], tradePrints: [], tradeExecutions: [], executionPlans: [], executionPlanVersions: [], printPlanDecisions: [], printReviews: [], printReviewVersions: [], reviewQueueActionStates: [], backtestSessions: [],
    ...seeded,
  }
  let sequence = 0
  const ctx = {
    auth: { getUserIdentity: async () => subject ? { subject } : null },
    db: {
      get: async (id: string) => Object.values(rows).flat().find((row) => row._id === id) ?? null,
      query: (table: string) => ({ withIndex: (_index: string, callback: (query: any) => unknown) => {
        const filters: Array<[string, 'eq' | 'gte' | 'lt', unknown]> = []
        const q = { eq: (field: string, value: unknown) => { filters.push([field, 'eq', value]); return q }, gte: (field: string, value: unknown) => { filters.push([field, 'gte', value]); return q }, lt: (field: string, value: unknown) => { filters.push([field, 'lt', value]); return q } }
        callback(q)
        const select = () => (rows[table] ?? []).filter((row) => filters.every(([field, operator, value]) => operator === 'eq' ? row[field] === value : operator === 'gte' ? String(row[field]) >= String(value) : String(row[field]) < String(value)))
        return { collect: async () => select(), unique: async () => select()[0] ?? null }
      } }),
      insert: async (table: string, value: Record<string, unknown>) => { const id = `${table}-${++sequence}`; (rows[table] ??= []).push({ ...value, _id: id }); return id },
      patch: async (id: string, value: Record<string, unknown>) => { const row = Object.values(rows).flat().find((item) => item._id === id); if (!row) throw new Error('Not found'); for (const [key, entry] of Object.entries(value)) { if (entry === undefined) delete row[key]; else row[key] = entry } },
    },
  }
  return { ctx, rows }
}

test('confirmed link binds an unassigned plan to the Print account and pins an immutable version', async () => {
  const fixture = memory('user-a|session', {
    journalTrades: [trade('trade-a')], tradePrints: [print('print-a', 'trade-a')],
    executionPlans: [plan('plan-a', undefined)], executionPlanVersions: [planVersion('version-plan-a', 'plan-a')],
  })
  const linkId = await (linkPlan as any)._handler(fixture.ctx, { printId: 'print-a', planId: 'plan-a', planVersionId: 'version-plan-a' })
  const link = fixture.rows.printPlanDecisions[0]
  assert.equal(String(linkId), link._id)
  assert.equal(link.accountId, 'account-a')
  assert.equal(link.planVersionId, 'version-plan-a')
  assert.equal(fixture.rows.executionPlans[0].accountId, undefined)
  assert.equal(fixture.rows.executionPlanVersions[0].content.title, 'Snapshot version-plan-a')
  const workspace = await (tradeWorkspace as any)._handler(fixture.ctx, { printId: 'print-a' })
  assert.equal(workspace.linkedPlan.versionId, 'version-plan-a')
  assert.equal(workspace.linkedPlan.timing, 'before_entry_minute')
})

test('plan linking rejects another owner, wrong account, wrong instrument, and stale replacement decisions', async () => {
  const fixture = memory('user-a|session', {
    journalTrades: [trade('trade-a')], tradePrints: [print('print-a', 'trade-a')],
    tradingAccounts: [account, { _id: 'account-b', owner: 'user-a', name: 'Other', currency: 'USD' }],
    executionPlans: [plan('wrong-account', 'account-b'), plan('wrong-pair')],
    executionPlanVersions: [planVersion('version-account', 'wrong-account', 'EUR/USD', 'bullish', entryStart, 'account-b'), planVersion('version-pair', 'wrong-pair', 'GBP/USD')],
  })
  await assert.rejects(() => (linkPlan as any)._handler(fixture.ctx, { printId: 'print-a', planId: 'wrong-account', planVersionId: 'version-account' }), /trading account/)
  await assert.rejects(() => (linkPlan as any)._handler(fixture.ctx, { printId: 'print-a', planId: 'wrong-pair', planVersionId: 'version-pair' }), /does not match/)
  const foreign = memory('user-b|session', { journalTrades: [trade('trade-a')], tradePrints: [print('print-a', 'trade-a')], executionPlans: [plan('plan-a')], executionPlanVersions: [planVersion('version-plan-a', 'plan-a')] })
  await assert.rejects(() => (linkPlan as any)._handler(foreign.ctx, { printId: 'print-a', planId: 'plan-a', planVersionId: 'version-plan-a' }), /not found/)
  const first = await (recordNoPlan as any)._handler(fixture.ctx, { printId: 'print-a' })
  await assert.rejects(() => (linkPlan as any)._handler(fixture.ctx, { printId: 'print-a', planId: 'wrong-pair', planVersionId: 'version-pair' }), /does not match/)
  assert.equal(fixture.rows.printPlanDecisions[0]._id, first)
})

test('no-plan decisions are explicit and a later link requires a reason while preserving history', async () => {
  const fixture = memory('user-a|session', { journalTrades: [trade('trade-a')], tradePrints: [print('print-a', 'trade-a')], executionPlans: [plan('plan-a')], executionPlanVersions: [planVersion('version-plan-a', 'plan-a')] })
  const noPlanId = await (recordNoPlan as any)._handler(fixture.ctx, { printId: 'print-a' })
  assert.equal(fixture.rows.printPlanDecisions[0].decision, 'no_pretrade_plan')
  await assert.rejects(() => (linkPlan as any)._handler(fixture.ctx, { printId: 'print-a', planId: 'plan-a', planVersionId: 'version-plan-a' }), /reason/)
  await (linkPlan as any)._handler(fixture.ctx, { printId: 'print-a', planId: 'plan-a', planVersionId: 'version-plan-a', reason: 'I found the plan I committed before entry.' })
  assert.equal(fixture.rows.printPlanDecisions.length, 2)
  assert.equal(fixture.rows.printPlanDecisions[1].previousDecisionId, noPlanId)
  await (unlinkPlan as any)._handler(fixture.ctx, { printId: 'print-a', reason: 'Correct the link after review.' })
  assert.equal(fixture.rows.printPlanDecisions.length, 3)
  assert.equal(fixture.rows.printPlanDecisions[2].decision, 'unlinked')
  assert.equal(fixture.rows.printPlanDecisions[0].decision, 'no_pretrade_plan')
})

test('Print reviews append versions, enforce completion, and preserve plan version evidence', async () => {
  const fixture = memory('user-a|session', {
    journalTrades: [trade('trade-a')], tradePrints: [print('print-a', 'trade-a')],
    executionPlans: [plan('plan-a')], executionPlanVersions: [planVersion('version-plan-a', 'plan-a')],
  })
  await (linkPlan as any)._handler(fixture.ctx, { printId: 'print-a', planId: 'plan-a', planVersionId: 'version-plan-a' })
  const draft = { ...tradeContent, takeaway: '' }
  await (saveReview as any)._handler(fixture.ctx, { targetKind: 'trade_print', printId: 'print-a', expectedRevision: 0, action: 'save', content: draft })
  assert.equal(fixture.rows.printReviews[0].status, 'draft')
  await assert.rejects(() => (saveReview as any)._handler(fixture.ctx, { targetKind: 'trade_print', printId: 'print-a', expectedRevision: 1, action: 'complete', content: draft }), /takeaway/)
  const completed = await (saveReview as any)._handler(fixture.ctx, { targetKind: 'trade_print', printId: 'print-a', expectedRevision: 1, action: 'complete', content: tradeContent })
  assert.equal(completed.status, 'complete')
  assert.equal(fixture.rows.printReviewVersions.length, 2)
  assert.equal(fixture.rows.printReviewVersions[1].previousVersionId, fixture.rows.printReviewVersions[0]._id)
  assert.equal(fixture.rows.printReviewVersions[1].planVersionId, 'version-plan-a')
  assert.equal(fixture.rows.printReviews[0].revision, 2)
})

test('cancelled accountless plans support no-trade reviews without a Print or invented P&L', async () => {
  const fixture = memory('user-a|session', { executionPlans: [plan('plan-closed', undefined, 'cancelled')], executionPlanVersions: [planVersion('version-plan-closed', 'plan-closed')] })
  const workspace = await (noTradeWorkspace as any)._handler(fixture.ctx, { planId: 'plan-closed' })
  assert.equal(workspace.plan.accountName, 'Unassigned')
  const content = { kind: 'no_trade', outcome: 'aborted', explanation: 'The setup invalidated before entry.', takeaway: 'Wait for a new structure.' }
  await (saveReview as any)._handler(fixture.ctx, { targetKind: 'no_trade_plan', planId: 'plan-closed', expectedRevision: 0, action: 'complete', content })
  const review = fixture.rows.printReviews[0]
  const version = fixture.rows.printReviewVersions[0]
  assert.equal(review.targetKind, 'no_trade_plan')
  assert.equal(review.printId, undefined)
  assert.equal(review.accountId, undefined)
  assert.equal(version.planVersionId, 'version-plan-closed')
  assert.equal(version.content.kind, 'no_trade')
})

function reviewAggregate(id: string, tradeId: string, status: 'draft' | 'complete', versionId: string) {
  return { _id: `review-${id}`, owner: 'user-a', accountId: account._id, targetKind: 'trade_print', printId: `print-${id}`, status, revision: 1, latestVersionId: versionId, createdAt: now - 5000, updatedAt: now - 1000 }
}

test('queue is owner-scoped, priority ordered, deduplicated, and capped at five', async () => {
  const lastWeek = previousUtcWeekStart(Date.now())
  const prints = [print('print-link', 'trade-link'), print('print-review', 'trade-review'), print('print-deviation', 'trade-deviation'), print('print-chart', 'trade-chart', 'failed'), print('print-week', 'trade-week')]
  const trades = [trade('trade-link', 'EUR/USD'), trade('trade-review', 'GBP/USD'), trade('trade-deviation', 'AUD/USD'), trade('trade-chart', 'XAU/USD'), trade('trade-week', 'GBP/USD', lastWeek)]
  const plans = [plan('plan-match'), plan('plan-draft', 'account-a', 'draft')]
  const versions = [planVersion('version-plan-match', 'plan-match', 'EUR/USD')]
  const aggregates = [reviewAggregate('link', 'trade-link', 'complete', 'version-link'), reviewAggregate('deviation', 'trade-deviation', 'complete', 'version-deviation'), reviewAggregate('chart', 'trade-chart', 'complete', 'version-chart'), reviewAggregate('week', 'trade-week', 'complete', 'version-week')]
  const versionsForReviews = aggregates.map((review, index) => ({ _id: `version-${['link', 'deviation', 'chart', 'week'][index]}`, owner: 'user-a', reviewId: review._id, version: 1, content: { kind: 'trade', entryAdherence: index === 1 ? 'deviated' : 'followed', exitAdherence: 'followed', riskAdherence: 'followed', deviationReason: index === 1 ? 'Moved the stop too early.' : '', takeaway: 'Synthetic fixture.' }, status: 'complete', createdAt: now - 4000 }))
  const fixture = memory('user-a|session', { journalTrades: trades, tradePrints: prints, executionPlans: plans, executionPlanVersions: versions, printReviews: aggregates, printReviewVersions: versionsForReviews })
  const result = await (queue as any)._handler(fixture.ctx, { accountId: 'account-a' })
  assert.equal(result.totalActionable, 6)
  assert.deepEqual(result.items.map((item: any) => item.kind), ['link_decision', 'print_review', 'deviation_follow_up', 'chart_issue', 'plan_draft'])
  assert.equal(result.items.length, 5)
  assert.equal(result.items[0].printId, 'print-link')
  assert.equal(result.items[0].candidateCount, 1)
})

test('queue snooze needs a reason, suppresses the matching item, and expires by time', async () => {
  const fixture = memory('user-a|session', { journalTrades: [trade('trade-a', 'GBP/USD')], tradePrints: [print('print-a', 'trade-a')] })
  const initial = await (queue as any)._handler(fixture.ctx, { accountId: 'account-a' })
  const item = initial.items[0]
  await assert.rejects(() => (actOnQueueItem as any)._handler(fixture.ctx, { itemKey: item.itemKey, issueFingerprint: item.issueFingerprint, action: 'snooze', snoozedUntil: now + 3600000 }), /reason/)
  await (actOnQueueItem as any)._handler(fixture.ctx, { itemKey: item.itemKey, issueFingerprint: item.issueFingerprint, action: 'snooze', reason: 'Review it after work.', snoozedUntil: Date.now() + 3600000 })
  const next = await (queue as any)._handler(fixture.ctx, { accountId: 'account-a' })
  assert.equal(next.items.some((row: any) => row.itemKey === item.itemKey), false)
  fixture.rows.reviewQueueActionStates[0].snoozedUntil = Date.now() - 1
  const expired = await (queue as any)._handler(fixture.ctx, { accountId: 'account-a' })
  assert.equal(expired.items.some((row: any) => row.itemKey === item.itemKey), true)
})

test('queue dismissal persists its reason and suppresses only the matching issue', async () => {
  const fixture = memory('user-a|session', { journalTrades: [trade('trade-a', 'GBP/USD')], tradePrints: [print('print-a', 'trade-a')] })
  const initial = await (queue as any)._handler(fixture.ctx, { accountId: 'account-a' })
  const item = initial.items[0]
  await assert.rejects(() => (actOnQueueItem as any)._handler(fixture.ctx, { itemKey: item.itemKey, issueFingerprint: item.issueFingerprint, action: 'dismiss' }), /reason/)
  await (actOnQueueItem as any)._handler(fixture.ctx, { itemKey: item.itemKey, issueFingerprint: item.issueFingerprint, action: 'dismiss', reason: 'This import is already reviewed elsewhere.' })
  assert.equal(fixture.rows.reviewQueueActionStates[0].reason, 'This import is already reviewed elsewhere.')
  const dismissed = await (queue as any)._handler(fixture.ctx, { accountId: 'account-a' })
  assert.equal(dismissed.items.some((row: any) => row.itemKey === item.itemKey), false)
})
