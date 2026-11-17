import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import type { ExecutionPlanContent } from '../domain/executionPlan'
import type { NoTradeReviewContent, PrintReviewContent } from '../domain/printReview'

const printReviewsApi = api.printReviews

type ReviewVersion = { id: string; version: number; content: PrintReviewContent; planVersionId?: string; status: 'draft' | 'complete'; createdAt: number; previousVersionId?: string }
type ReviewRecord = { id: string; targetKind: 'trade_print' | 'no_trade_plan'; status: 'draft' | 'complete'; revision: number; versions: ReviewVersion[] }

export type TradeReviewWorkspace = {
  print: { id: string; accountId: string; origin: 'mt5'; status: 'pending_chart' | 'pending_capture' | 'captured' | 'needs_data' | 'failed'; timePrecision: 'minute'; createdAt: number; sourceRetrievedAt?: number; capturedAt?: number; coverage?: 'complete' | 'partial' }
  account: { id: string; name: string }
  trade: { id: string; date: string; exitDate?: string; pair: 'EUR/USD' | 'GBP/USD' | 'AUD/USD' | 'XAU/USD'; side: 'Long' | 'Short'; lots: number; entry: number; exit: number; entryTime: string; exitTime: string; commission: number; swap: number; setup: string; brokerSymbol?: string; executions: Array<{ date?: string; time: string; action: 'Buy' | 'Sell'; price: number; lots: number }> }
  decision: { id: string; version: number; decision: 'linked' | 'no_pretrade_plan' | 'unlinked'; planId?: string; planVersionId?: string; reason?: string; createdAt: number } | null
  linkedPlan: { id: string; title: string; accountId?: string; versionId: string; version: number; content: ExecutionPlanContent; committedAt: number; timing: 'before_entry_minute' | 'timing_uncertain' | 'after_entry_minute' | 'unknown' } | null
  candidates: Array<{ planId: string; planTitle: string; planStatus: string; planAccountId?: string; versionId: string; version: number; content: ExecutionPlanContent; committedAt: number; timing: 'before_entry_minute' | 'timing_uncertain' | 'after_entry_minute' | 'unknown'; directionRank: number }>
  review: ReviewRecord | null
}

export type NoTradeReviewWorkspace = {
  plan: { id: string; title: string; status: 'cancelled' | 'expired'; closeReason?: string; accountId?: string; accountName: string; versions: Array<{ id: string; version: number; content: ExecutionPlanContent; committedAt: number }> }
  review: ReviewRecord | null
}

export function useConvexPrintReviews(authenticated: boolean, accountId: string | undefined, printId: string | null, planId: string | null) {
  const account = accountId ? { accountId: accountId as Id<'tradingAccounts'> } : {}
  const queue = useQuery(printReviewsApi.queue, authenticated ? account : 'skip')
  const tradeWorkspace = useQuery(printReviewsApi.tradeWorkspace, authenticated && printId ? { printId: printId as Id<'tradePrints'> } : 'skip')
  const noTradeWorkspace = useQuery(printReviewsApi.noTradeWorkspace, authenticated && planId ? { planId: planId as Id<'executionPlans'> } : 'skip')

  const link = useMutation(printReviewsApi.linkPlan)
  const recordNoPlanMutation = useMutation(printReviewsApi.recordNoPlan)
  const unlink = useMutation(printReviewsApi.unlinkPlan)
  const save = useMutation(printReviewsApi.saveReview)
  const act = useMutation(printReviewsApi.actOnQueueItem)

  return {
    queue,
    tradeWorkspace,
    noTradeWorkspace,
    linkPlan: (input: { printId: string; planId: string; planVersionId: string; reason?: string }) => link({ printId: input.printId as Id<'tradePrints'>, planId: input.planId as Id<'executionPlans'>, planVersionId: input.planVersionId as Id<'executionPlanVersions'>, reason: input.reason }),
    recordNoPlan: (input: { printId: string; reason?: string }) => recordNoPlanMutation({ printId: input.printId as Id<'tradePrints'>, reason: input.reason }),
    unlinkPlan: (input: { printId: string; reason: string }) => unlink({ printId: input.printId as Id<'tradePrints'>, reason: input.reason }),
    saveReview: (input: { targetKind: 'trade_print' | 'no_trade_plan'; printId?: string; planId?: string; expectedRevision: number; action: 'save' | 'complete'; content: PrintReviewContent | NoTradeReviewContent }) => save({ targetKind: input.targetKind, printId: input.printId as Id<'tradePrints'> | undefined, planId: input.planId as Id<'executionPlans'> | undefined, expectedRevision: input.expectedRevision, action: input.action, content: input.content }),
    actOnQueueItem: (input: { itemKey: string; issueFingerprint: string; action: 'snooze' | 'dismiss' | 'complete'; reason?: string; snoozedUntil?: number }) => act(input),
  }
}
