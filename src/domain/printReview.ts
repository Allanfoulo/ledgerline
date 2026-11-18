import type { PlanHypothesis, PlanInstrument } from './executionPlan'

export type ReviewAdherence = 'unanswered' | 'followed' | 'deviated' | 'uncertain' | 'not_applicable'
export type NoTradeOutcome = 'unanswered' | 'not_triggered' | 'aborted' | 'missed' | 'other'

export type TradePrintReviewContent = {
  kind: 'trade'
  entryAdherence: ReviewAdherence
  exitAdherence: ReviewAdherence
  riskAdherence: ReviewAdherence
  deviationReason: string
  takeaway: string
}

export type NoTradeReviewContent = {
  kind: 'no_trade'
  outcome: NoTradeOutcome
  explanation: string
  takeaway: string
}

export type PrintReviewContent = TradePrintReviewContent | NoTradeReviewContent

export type TimingLabel = 'before_entry_minute' | 'timing_uncertain' | 'after_entry_minute' | 'unknown'

export type CandidatePrint = {
  accountId: string
  pair: PlanInstrument
  side: 'Long' | 'Short'
  entryDate: string
  entryTime: string
}

export type CandidatePlanVersion = {
  id: string
  version: number
  committedAt: number
  instrument: PlanInstrument
  hypothesis: PlanHypothesis
}

export type CandidatePlan = {
  id: string
  accountId?: string
  status: 'draft' | 'committed' | 'cancelled' | 'expired'
  versions: CandidatePlanVersion[]
}

export type RankedPlanCandidate = CandidatePlanVersion & {
  planId: string
  timing: TimingLabel
  directionRank: number
  timeDistance: number
}

export const reviewAdherenceValues: ReviewAdherence[] = ['unanswered', 'followed', 'deviated', 'uncertain', 'not_applicable']
export const noTradeOutcomeValues: NoTradeOutcome[] = ['unanswered', 'not_triggered', 'aborted', 'missed', 'other']

function entryMinuteStart(date: string, time: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) return null
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute] = time.split(':').map(Number)
  const timestamp = Date.UTC(year, month - 1, day, hour, minute)
  const parsed = new Date(timestamp)
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day || parsed.getUTCHours() !== hour || parsed.getUTCMinutes() !== minute) return null
  return timestamp
}

export function classifyPlanTiming(committedAt: number, entryDate: string, entryTime: string): TimingLabel {
  const start = entryMinuteStart(entryDate, entryTime)
  if (start === null || !Number.isFinite(committedAt)) return 'unknown'
  if (committedAt < start) return 'before_entry_minute'
  if (committedAt < start + 60_000) return 'timing_uncertain'
  return 'after_entry_minute'
}

function directionRank(hypothesis: PlanHypothesis, side: CandidatePrint['side']): number {
  if ((hypothesis === 'bullish' && side === 'Long') || (hypothesis === 'bearish' && side === 'Short')) return 0
  if (hypothesis === 'neutral' || hypothesis === 'conditional') return 1
  return 2
}

export function rankPlanCandidates(print: CandidatePrint, plans: CandidatePlan[]): RankedPlanCandidate[] {
  const entryStart = entryMinuteStart(print.entryDate, print.entryTime)
  return plans
    .filter((plan) => plan.status === 'committed' && (!plan.accountId || plan.accountId === print.accountId))
    .flatMap((plan) => plan.versions
      .filter((version) => version.instrument === print.pair)
      .map((version) => ({
        ...version,
        planId: plan.id,
        timing: classifyPlanTiming(version.committedAt, print.entryDate, print.entryTime),
        directionRank: directionRank(version.hypothesis, print.side),
        timeDistance: entryStart === null || !Number.isFinite(version.committedAt) ? Number.POSITIVE_INFINITY : Math.abs(version.committedAt - entryStart),
      })))
    .sort((a, b) => a.directionRank - b.directionRank || a.timeDistance - b.timeDistance || a.planId.localeCompare(b.planId) || a.version - b.version || a.id.localeCompare(b.id))
}

export function validatePrintReview(content: PrintReviewContent, complete: boolean): string[] {
  const errors: string[] = []
  if (content.kind === 'trade') {
    if (![...reviewAdherenceValues].includes(content.entryAdherence) || ![...reviewAdherenceValues].includes(content.exitAdherence) || ![...reviewAdherenceValues].includes(content.riskAdherence)) errors.push('Choose a valid response for each adherence question.')
    if (content.deviationReason.length > 1200) errors.push('Keep the deviation explanation under 1,200 characters.')
    if (content.takeaway.length > 1200) errors.push('Keep the takeaway under 1,200 characters.')
    if ((content.entryAdherence === 'deviated' || content.exitAdherence === 'deviated' || content.riskAdherence === 'deviated') && !content.deviationReason.trim()) errors.push('Explain the deviation you reported.')
    if (complete) {
      if (content.entryAdherence === 'unanswered' || content.exitAdherence === 'unanswered' || content.riskAdherence === 'unanswered') errors.push('Answer each adherence question or mark it not applicable.')
      if (!content.takeaway.trim()) errors.push('Add a takeaway to complete this review.')
    }
  } else {
    if (!noTradeOutcomeValues.includes(content.outcome)) errors.push('Choose a valid no-trade outcome.')
    if (content.explanation.length > 1200) errors.push('Keep the explanation under 1,200 characters.')
    if (content.takeaway.length > 1200) errors.push('Keep the takeaway under 1,200 characters.')
    if (complete) {
      if (content.outcome === 'unanswered') errors.push('Choose what happened with this plan.')
      if (!content.takeaway.trim()) errors.push('Add a takeaway to complete this review.')
    }
  }
  return errors
}

export type ReviewQueuePriority = 1 | 2 | 3 | 4 | 5 | 6
export type ReviewQueueKind = 'link_decision' | 'print_review' | 'deviation_follow_up' | 'chart_issue' | 'plan_draft' | 'weekly_review'

export type ReviewQueueItem = {
  itemKey: string
  issueFingerprint: string
  kind: ReviewQueueKind
  priority: ReviewQueuePriority
  occurredAt: number
  targetId: string
  accountId?: string
  accountName: string
  title: string
  rationale: string
  printId?: string
  tradeId?: string
  planId?: string
  candidateCount?: number
  weekStart?: string
}

export function orderReviewQueue(items: ReviewQueueItem[], limit = 5): ReviewQueueItem[] {
  return [...items]
    .sort((a, b) => a.priority - b.priority || a.occurredAt - b.occurredAt || a.targetId.localeCompare(b.targetId) || a.itemKey.localeCompare(b.itemKey))
    .slice(0, Math.max(0, Math.min(5, Math.trunc(limit))))
}

export function utcWeekStart(timestamp: number): string {
  const date = new Date(timestamp)
  const day = date.getUTCDay()
  date.setUTCDate(date.getUTCDate() - ((day + 6) % 7))
  return date.toISOString().slice(0, 10)
}

export function previousUtcWeekStart(now: number): string {
  const currentWeekStart = utcWeekStart(now)
  const previous = new Date(`${currentWeekStart}T00:00:00.000Z`)
  previous.setUTCDate(previous.getUTCDate() - 7)
  return previous.toISOString().slice(0, 10)
}
