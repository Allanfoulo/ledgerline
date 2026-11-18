/** A model suggestion is evidence for a draft, never a confirmed market fact. */
export type ChartSuggestion<T> = {
  value: T
  basis: 'visible' | 'interpretation'
  evidence: string
  priceRange?: { low?: number; high?: number }
  /** Approximate point in the original image, normalized from its top-left corner. */
  location?: { xPercent: number; yPercent: number }
  signalName?: string
}

export type ChartAnalysisDraft = {
  instrument?: ChartSuggestion<string>
  timeframe?: ChartSuggestion<string>
  bias?: ChartSuggestion<'bullish' | 'bearish' | 'neutral' | 'conditional'>
  entry?: ChartSuggestion<string>
  protectiveStop?: ChartSuggestion<string>
  target?: ChartSuggestion<string>
  invalidation?: ChartSuggestion<string>
  signals: Array<ChartSuggestion<string>>
}

export type StrategyContext = {
  name: string
  description?: string
  rules: string[]
  signals: Array<{ name: string; description: string }>
}

export type ChartAnalysisRequest = {
  image: Uint8Array
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  strategy?: StrategyContext
}

export type AnalysisProviderSelection = {
  providerId: string
  modelId: string
}

/** Client-visible catalog; secrets and provider transport remain server-side. */
export const chartAnalysisProviderCatalog = [{
  id: 'google', label: 'Google AI', keyLabel: 'Google AI API key',
  dataUseNotice: 'On Google’s free tier, submitted prompts and responses may be used to improve Google products.',
  models: [{ id: 'gemma-4-26b-a4b-it', label: 'Gemma 4 26B A4B' }],
}] as const

export function supportsChartAnalysisProvider(providerId: string, modelId?: string) {
  const provider = chartAnalysisProviderCatalog.find((item) => item.id === providerId)
  return !!provider && (!modelId || provider.models.some((model) => model.id === modelId))
}

/** The application depends on this contract; an external provider implements it. */
export interface ChartAnalysisProvider {
  analyze(input: ChartAnalysisRequest, selection: AnalysisProviderSelection): Promise<ChartAnalysisDraft>
}

/** Reject malformed or oversized provider output before it reaches a plan editor. */
export function parseChartAnalysis(value: unknown): ChartAnalysisDraft {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('The analysis response is invalid.')
  const record = value as Record<string, unknown>
  const allowedKeys = new Set(['instrument', 'timeframe', 'bias', 'entry', 'protectiveStop', 'target', 'invalidation', 'signals'])
  if (Object.keys(record).some((key) => !allowedKeys.has(key))) throw new Error('The analysis response contains unsupported fields.')
  const read = (key: string): ChartSuggestion<string> | undefined => {
    const raw = record[key]
    if (raw == null) return undefined
    if (typeof raw !== 'object' || Array.isArray(raw)) throw new Error(`Invalid ${key} suggestion.`)
    const item = raw as Record<string, unknown>
    return parseSuggestion(item, key)
  }
  const bias = read('bias')
  if (bias && !['bullish', 'bearish', 'neutral', 'conditional'].includes(bias.value)) throw new Error('Invalid bias suggestion.')
  if (record.signals !== undefined && (!Array.isArray(record.signals) || record.signals.length > 20)) throw new Error('Invalid signal suggestions.')
  const signals = (record.signals as unknown[] | undefined ?? []).map((signal) => parseSignal(signal))
  return { instrument: read('instrument'), timeframe: read('timeframe'), bias: bias as ChartAnalysisDraft['bias'], entry: read('entry'), protectiveStop: read('protectiveStop'), target: read('target'), invalidation: read('invalidation'), signals }
}

function parseSignal(value: unknown): ChartSuggestion<string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid signal suggestion.')
  const item = value as Record<string, unknown>
  return parseSuggestion(item, 'signal')
}

function parseSuggestion(item: Record<string, unknown>, label: string): ChartSuggestion<string> {
  const allowedKeys = new Set(['value', 'basis', 'evidence', 'priceRange', 'location', 'signalName'])
  if (Object.keys(item).some((key) => !allowedKeys.has(key)) || typeof item.value !== 'string' || !item.value.trim() || item.value.length > 500 || (item.basis !== 'visible' && item.basis !== 'interpretation') || typeof item.evidence !== 'string' || !item.evidence.trim() || item.evidence.length > 500) throw new Error(`Invalid ${label} suggestion.`)
  let priceRange: ChartSuggestion<string>['priceRange']
  if (item.priceRange !== undefined) {
    if (!item.priceRange || typeof item.priceRange !== 'object' || Array.isArray(item.priceRange)) throw new Error(`Invalid ${label} price range.`)
    const range = item.priceRange as Record<string, unknown>
    if (typeof range.low !== 'number' || typeof range.high !== 'number' || !Number.isFinite(range.low) || !Number.isFinite(range.high) || range.low <= 0 || range.high < range.low) throw new Error(`Invalid ${label} price range.`)
    priceRange = { low: range.low, high: range.high }
  }
  let location: ChartSuggestion<string>['location']
  if (item.location !== undefined) {
    if (!item.location || typeof item.location !== 'object' || Array.isArray(item.location)) throw new Error(`Invalid ${label} image location.`)
    const point = item.location as Record<string, unknown>
    if (typeof point.xPercent !== 'number' || typeof point.yPercent !== 'number' || !Number.isFinite(point.xPercent) || !Number.isFinite(point.yPercent) || point.xPercent < 0 || point.xPercent > 100 || point.yPercent < 0 || point.yPercent > 100) throw new Error(`Invalid ${label} image location.`)
    location = { xPercent: point.xPercent, yPercent: point.yPercent }
  }
  if (item.signalName !== undefined && (typeof item.signalName !== 'string' || !item.signalName.trim() || item.signalName.length > 80)) throw new Error(`Invalid ${label} signal name.`)
  return { value: item.value.trim(), basis: item.basis, evidence: item.evidence.trim(), priceRange, location, signalName: typeof item.signalName === 'string' ? item.signalName.trim() : undefined }
}
