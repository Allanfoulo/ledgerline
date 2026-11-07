import { validateTrade } from './trade'
import type { Pair, TradeInput } from './trade'

export type OpenPosition = { side: TradeInput['side']; lots: number; entry: number; entryTime: string }
// The current candle's high, low and close are not known at its open.
export function completedCandles<T>(candles: T[], index: number): T[] { return candles.slice(0, index) }
export type ReplayCandle = { time: string; open: number; high: number; low: number; close: number }

// Calendar guidance only: broker sessions, holidays, and Sunday reopening vary.
export function weekendSuggestion(date: string): { nextMonday: string } | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
  const day = new Date(`${date}T00:00:00Z`)
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) return null
  const weekday = day.getUTCDay()
  if (weekday !== 0 && weekday !== 6) return null
  day.setUTCDate(day.getUTCDate() + (weekday === 6 ? 2 : 1))
  return { nextMonday: day.toISOString().slice(0, 10) }
}

// Aggregate only known minutes, adding the current minute's open without its future range.
export function replayCandles(candles: ReplayCandle[], index: number, interval: number): ReplayCandle[] {
  const current = candles[index]
  if (!current) return []
  const known = [...completedCandles(candles, index), { time: current.time, open: current.open, high: current.open, low: current.open, close: current.open }]
  const result: ReplayCandle[] = []
  for (const candle of known) {
    const bucket = Math.floor(Date.parse(`${candle.time}Z`) / (interval * 60000)) * interval * 60000
    const time = new Date(bucket).toISOString().slice(0, 19)
    const previous = result[result.length - 1]
    if (previous?.time === time) {
      previous.high = Math.max(previous.high, candle.high)
      previous.low = Math.min(previous.low, candle.low)
      previous.close = candle.close
    } else result.push({ ...candle, time })
  }
  return result
}

export function hasRepeatedPrices(candles: ReplayCandle[]): boolean {
  if (candles.length < 20) return false
  const unique = new Set(candles.map(({ open, high, low, close }) => `${open}/${high}/${low}/${close}`))
  const opens = new Map<number, number>()
  for (const candle of candles) opens.set(candle.open, (opens.get(candle.open) ?? 0) + 1)
  const mostCommonOpen = Math.max(...opens.values())
  return unique.size <= Math.max(3, Math.floor(candles.length * 0.15)) || mostCommonOpen / candles.length >= 0.6
}
export function openPosition(side: TradeInput['side'], lots: number, price: number, time: string): OpenPosition {
  if (!Number.isFinite(lots) || lots <= 0 || lots > 10000 || !Number.isFinite(price) || price <= 0 || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new Error('Enter a valid position size.')
  return { side, lots, entry: price, entryTime: time }
}
export function closePosition(position: OpenPosition, date: string, pair: Pair, price: number, time: string, commission: number): TradeInput {
  const trade: TradeInput = { date, pair, ...position, exit: price, exitTime: time, commission, swap: 0, setup: 'Backtest' }
  const errors = validateTrade(trade)
  if (errors.length) throw new Error(errors.join(' '))
  return trade
}
