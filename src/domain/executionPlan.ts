export type PlanInstrument = string
export type PlanHypothesis = 'bullish' | 'bearish' | 'neutral' | 'conditional'
export type ConfirmationRole = 'required' | 'supporting'
export type ConfirmationStatus = 'not_seen' | 'satisfied' | 'failed' | 'not_applicable'
export type OrderApproach = 'market' | 'limit' | 'stop' | 'unspecified'
export type PriceRange = { low?: number; high?: number }

export type PlanConfirmation = {
  condition: string
  role: ConfirmationRole
  threshold?: string
  price?: number
  timeframe?: string
  status: ConfirmationStatus
  source: 'user' | 'verified'
  sourceReference?: string
}

export type ExecutionPlanContent = {
  title: string
  instrument: PlanInstrument
  timeframe: string
  hypothesis: PlanHypothesis
  thesis: string
  context: string
  confirmations: PlanConfirmation[]
  entryRange?: PriceRange
  targetRange?: PriceRange
  invalidationRange?: PriceRange
  invalidationCondition: string
  invalidationLevel?: number
  invalidationAction: string
  entryConditions: string
  orderApproach: OrderApproach
  managementPlan: string
  exitRationale: string
  abortConditions: string
  maxLossUsd?: number
  maxLossPercent?: number
  protectiveStop?: number
  positionSizeNote: string
}

export function blankExecutionPlan(): ExecutionPlanContent {
  return {
    title: '', instrument: 'EUR/USD', timeframe: '15m', hypothesis: 'conditional', thesis: '', context: '',
    confirmations: [], invalidationCondition: '', invalidationAction: '', entryConditions: '',
    orderApproach: 'unspecified', managementPlan: '', exitRationale: '', abortConditions: '', positionSizeNote: '',
  }
}

export function validateExecutionPlan(content: ExecutionPlanContent): string[] {
  const errors: string[] = []
  if (!content.title.trim() || content.title.trim().length > 120) errors.push('Give this plan a title (up to 120 characters).')
  if (!content.instrument.trim() || content.instrument.length > 32) errors.push('Enter an instrument symbol (up to 32 characters).')
  if (!content.timeframe.trim() || content.timeframe.length > 24) errors.push('Choose a timeframe.')
  if (!content.thesis.trim() || content.thesis.length > 2000) errors.push('Write a thesis (up to 2,000 characters).')
  if (content.context.length > 1000) errors.push('Keep context under 1,000 characters.')
  if (content.confirmations.length > 20) errors.push('Use up to 20 confirmation conditions.')
  if (content.confirmations.some((item) => !item.condition.trim() || item.condition.length > 280 || item.threshold && item.threshold.length > 120 || item.timeframe && item.timeframe.length > 24)) errors.push('Each confirmation needs a condition and concise optional details.')
  if (content.confirmations.some((item) => item.source === 'verified')) errors.push('Verified confirmations need a linked evidence source, which is not available in this milestone.')
  if (!content.invalidationCondition.trim() || content.invalidationCondition.length > 1000) errors.push('Describe what would invalidate the thesis before entry.')
  if (!content.invalidationAction.trim() || content.invalidationAction.length > 500) errors.push('State what you will do if the thesis is invalidated.')
  if (!content.entryConditions.trim() || content.entryConditions.length > 1000) errors.push('Describe the entry conditions.')
  if (!content.managementPlan.trim() || content.managementPlan.length > 1000) errors.push('Describe how you intend to manage the position.')
  if (!content.exitRationale.trim() || content.exitRationale.length > 1000) errors.push('Describe the planned exit rationale.')
  if (content.abortConditions.length > 1000) errors.push('Keep abort conditions under 1,000 characters.')
  if (content.positionSizeNote.length > 500) errors.push('Keep the position-size note under 500 characters.')
  const amount = content.maxLossUsd
  const percent = content.maxLossPercent
  if ((amount === undefined || !Number.isFinite(amount) || amount <= 0) && (percent === undefined || !Number.isFinite(percent) || percent <= 0 || percent > 100)) errors.push('Set an intended maximum loss in USD or account percentage (or both).')
  if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000)) errors.push('USD maximum loss must be a positive amount.')
  if (percent !== undefined && (!Number.isFinite(percent) || percent <= 0 || percent > 100)) errors.push('Maximum loss percentage must be above 0 and at most 100%.')
  for (const [label, value] of [['Invalidation level', content.invalidationLevel], ['Protective stop', content.protectiveStop]] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) errors.push(`${label} must be a positive price.`)
  }
  for (const [label, range] of [['Entry area', content.entryRange], ['Target area', content.targetRange], ['Invalidation area', content.invalidationRange]] as const) {
    if (range && (range.low === undefined || range.high === undefined || !Number.isFinite(range.low) || !Number.isFinite(range.high) || range.low <= 0 || range.high <= 0 || range.high < range.low)) errors.push(`${label} must have positive prices with the lower bound first.`)
  }
  return errors
}
