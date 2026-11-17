import { test } from 'node:test'
import assert from 'node:assert/strict'
import { classifyPlanTiming, orderReviewQueue, previousUtcWeekStart, rankPlanCandidates, validatePrintReview, type CandidatePlan, type ReviewQueueItem, type TradePrintReviewContent } from '../src/domain/printReview'

const entryStart = Date.parse('2026-11-09T08:15:00.000Z')

test('plan timing classification is conservative at minute boundaries and rejects malformed timestamps', () => {
  assert.equal(classifyPlanTiming(entryStart - 1, '2026-11-09', '08:15'), 'before_entry_minute')
  assert.equal(classifyPlanTiming(entryStart, '2026-11-09', '08:15'), 'timing_uncertain')
  assert.equal(classifyPlanTiming(entryStart + 59_999, '2026-11-09', '08:15'), 'timing_uncertain')
  assert.equal(classifyPlanTiming(entryStart + 60_000, '2026-11-09', '08:15'), 'after_entry_minute')
  assert.equal(classifyPlanTiming(entryStart, '2026-02-30', '08:15'), 'unknown')
  assert.equal(classifyPlanTiming(entryStart, '2026-11-09', '25:75'), 'unknown')
  assert.equal(classifyPlanTiming(Number.NaN, '2026-11-09', '08:15'), 'unknown')
})

test('candidate ranking filters ineligible plans and ranks direction, time, then stable identifiers', () => {
  const plans: CandidatePlan[] = [
    { id: 'opposite', accountId: 'account', status: 'committed', versions: [{ id: 'v1', version: 1, committedAt: entryStart - 10, instrument: 'EUR/USD', hypothesis: 'bearish' }] },
    { id: 'neutral', accountId: undefined, status: 'committed', versions: [{ id: 'v1', version: 1, committedAt: entryStart - 20, instrument: 'EUR/USD', hypothesis: 'neutral' }] },
    { id: 'near', accountId: 'account', status: 'committed', versions: [{ id: 'v1', version: 1, committedAt: entryStart - 30, instrument: 'EUR/USD', hypothesis: 'bullish' }] },
    { id: 'far', accountId: 'account', status: 'committed', versions: [{ id: 'v1', version: 1, committedAt: entryStart - 500, instrument: 'EUR/USD', hypothesis: 'bullish' }] },
    { id: 'wrong-account', accountId: 'other', status: 'committed', versions: [{ id: 'v1', version: 1, committedAt: entryStart, instrument: 'EUR/USD', hypothesis: 'bullish' }] },
    { id: 'wrong-pair', accountId: 'account', status: 'committed', versions: [{ id: 'v1', version: 1, committedAt: entryStart, instrument: 'GBP/USD', hypothesis: 'bullish' }] },
    { id: 'draft', accountId: 'account', status: 'draft', versions: [{ id: 'v1', version: 1, committedAt: entryStart, instrument: 'EUR/USD', hypothesis: 'bullish' }] },
  ]
  const results = rankPlanCandidates({ accountId: 'account', pair: 'EUR/USD', side: 'Long', entryDate: '2026-11-09', entryTime: '08:15' }, plans)
  assert.deepEqual(results.map((item) => item.planId), ['near', 'far', 'neutral', 'opposite'])
  assert.equal(results[0].timing, 'before_entry_minute')
  assert.equal(results[2].directionRank, 1)
})

test('trade review completion requires all answers and a takeaway while preserving uncertainty', () => {
  const draft: TradePrintReviewContent = { kind: 'trade', entryAdherence: 'followed', exitAdherence: 'uncertain', riskAdherence: 'not_applicable', deviationReason: '', takeaway: '' }
  assert.deepEqual(validatePrintReview(draft, false), [])
  assert.deepEqual(validatePrintReview(draft, true), ['Add a takeaway to complete this review.'])
  const deviated = { ...draft, exitAdherence: 'deviated' as const }
  assert.ok(validatePrintReview(deviated, false).some((error) => error.includes('Explain the deviation')))
})

test('no-trade reviews can be saved incomplete and completed only with an outcome and takeaway', () => {
  const draft = { kind: 'no_trade' as const, outcome: 'unanswered' as const, explanation: '', takeaway: '' }
  assert.deepEqual(validatePrintReview(draft, false), [])
  assert.deepEqual(validatePrintReview(draft, true), ['Choose what happened with this plan.', 'Add a takeaway to complete this review.'])
  assert.deepEqual(validatePrintReview({ ...draft, outcome: 'aborted', takeaway: 'Wait for a cleaner setup.' }, true), [])
})

function queueItem(priority: ReviewQueueItem['priority'], targetId: string, occurredAt = 1): ReviewQueueItem {
  return { itemKey: targetId, issueFingerprint: 'state', kind: 'print_review', priority, occurredAt, targetId, accountId: 'account', accountName: 'FX', title: targetId, rationale: 'Review this record.' }
}

test('queue ordering is deterministic and always capped at five tasks', () => {
  const items = [queueItem(6, 'week'), queueItem(2, 'review-b', 2), queueItem(1, 'link'), queueItem(2, 'review-a', 1), queueItem(4, 'chart'), queueItem(3, 'deviation'), queueItem(5, 'draft')]
  assert.deepEqual(orderReviewQueue(items).map((item) => item.targetId), ['link', 'review-a', 'review-b', 'deviation', 'chart'])
  assert.deepEqual(orderReviewQueue(items, 99).map((item) => item.targetId), ['link', 'review-a', 'review-b', 'deviation', 'chart'])
  assert.deepEqual(orderReviewQueue(items, 0), [])
})

test('weekly reminder uses Monday UTC week boundaries', () => {
  assert.equal(previousUtcWeekStart(Date.parse('2026-11-08T23:59:00Z')), '2026-10-26')
  assert.equal(previousUtcWeekStart(Date.parse('2026-11-09T00:00:00Z')), '2026-11-02')
  assert.equal(previousUtcWeekStart(Date.parse('2026-11-13T18:30:00Z')), '2026-11-02')
})
