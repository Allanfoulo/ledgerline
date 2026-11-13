import type { Trade } from '../types'

export type PrintCandle = { time: string; open: number; high: number; low: number; close: number }
export type PrintChartSource = 'mt5_candles' | 'twelve_data_candles'
export type PrintChartMarker = { time: string; action: 'Buy' | 'Sell'; price: number; lots: number; precision: 'minute' }
export type PrintChartSpec = { version: 1; pair: Trade['pair']; brokerSymbol?: string; source: PrintChartSource; sourceRetrievedAt: string; interval: '1m'; quality: 'complete' | 'partial'; candles: PrintCandle[]; markers: PrintChartMarker[] }

const minuteMs = 60_000
const maxTradeMs = 72 * 60 * minuteMs
const maxCandles = 5000
function parseMinute(value: string): number {
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:00$/.test(value)) throw new Error('Invalid UTC candle time.')
  const ms = Date.parse(`${value}Z`)
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 19) !== value) throw new Error('Invalid UTC candle time.')
  return ms
}

/** Build a source-labeled chart using only observed candles and recorded executions. */
export function buildPrintChart(trade: Trade, candles: PrintCandle[], source: PrintChartSource, sourceRetrievedAt: string): PrintChartSpec {
  if (source !== 'mt5_candles' && source !== 'twelve_data_candles') throw new Error('Unsupported candle source.')
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(sourceRetrievedAt) || !Number.isFinite(Date.parse(sourceRetrievedAt))) throw new Error('Invalid source retrieval time.')
  const start = parseMinute(`${trade.date}T${trade.entryTime}:00`)
  const end = parseMinute(`${trade.exitDate ?? trade.date}T${trade.exitTime}:00`)
  if (end <= start || end - start > maxTradeMs) throw new Error('Chart supports trades up to 72 hours.')
  if (!candles.length || candles.length > maxCandles) throw new Error('Candle data is unavailable or exceeds the limit.')
  const min = start - 60 * minuteMs; const max = end + 60 * minuteMs
  const sorted = candles.map((c) => ({ ...c, ms: parseMinute(c.time) })).sort((a, b) => a.ms - b.ms)
  for (let i = 0; i < sorted.length; i++) {
    const c = sorted[i]
    if (c.ms < min || c.ms > max || (i > 0 && sorted[i - 1].ms === c.ms) || ![c.open, c.high, c.low, c.close].every((x) => Number.isFinite(x) && x > 0) || c.high < Math.max(c.open, c.close, c.low) || c.low > Math.min(c.open, c.close, c.high)) throw new Error('Candle data is invalid or outside the permitted window.')
  }
  if (!trade.executions.length || trade.executions.length > 50) throw new Error('Recorded executions are unavailable.')
  const markers = trade.executions.map((fill): PrintChartMarker => {
    if (!fill.date && trade.exitDate && trade.exitDate !== trade.date) throw new Error('An overnight execution is missing its date.')
    const time = `${fill.date ?? trade.date}T${fill.time}:00`
    const ms = parseMinute(time)
    if (ms < start || ms > end || !['Buy', 'Sell'].includes(fill.action) || !Number.isFinite(fill.price) || fill.price <= 0 || !Number.isFinite(fill.lots) || fill.lots <= 0) throw new Error('Recorded execution is invalid.')
    return { time, action: fill.action, price: fill.price, lots: fill.lots, precision: 'minute' }
  }).sort((a, b) => a.time.localeCompare(b.time))
  const tradeCandles = sorted.filter((c) => c.ms >= start && c.ms <= end)
  const hasGaps = tradeCandles.some((c, i) => i > 0 && c.ms - tradeCandles[i - 1].ms > minuteMs)
  const complete = tradeCandles.length > 0 && tradeCandles[0].ms === start && tradeCandles[tradeCandles.length - 1].ms === end && !hasGaps
  return { version: 1, pair: trade.pair, ...(trade.brokerSymbol ? { brokerSymbol: trade.brokerSymbol } : {}), source, sourceRetrievedAt, interval: '1m', quality: complete ? 'complete' : 'partial', candles: sorted.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })), markers }
}
