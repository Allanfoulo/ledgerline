import type { Trade } from '../types'

export type SamplePrice = { tradeId: string; signature: string; entry: number; exit: number }
export type Candle = { time: string; open: number; high: number; low: number; close: number }
export const tradeSignature = (trade: Trade) => [trade.pair, trade.date, trade.entryTime, trade.exitTime].join('|')
export interface SampleAlignmentPort {
  candles(args: { pair: string; date: string; entryTime: string; exitTime: string }): Promise<Candle[]>
  save(price: SamplePrice): Promise<unknown>
  wait(): Promise<void>
}
export async function alignSamples(port: SampleAlignmentPort, trades: Trade[], existing: Record<string, SamplePrice>, progress: (current: number, total: number) => void) {
  const pending = trades.filter((trade) => existing[trade.id]?.signature !== tradeSignature(trade))
  let completed = 0; let failed = 0
  for (let i = 0; i < pending.length; i++) {
    const trade = pending[i]; progress(i + 1, pending.length)
    try {
      const candles = await port.candles({ pair: trade.pair, date: trade.date, entryTime: trade.entryTime, exitTime: trade.exitTime })
      const entry = candles.find((candle) => candle.time === `${trade.date}T${trade.entryTime}:00`)?.open
      const exit = candles.find((candle) => candle.time === `${trade.date}T${trade.exitTime}:00`)?.open
      if (entry === undefined || exit === undefined || !Number.isFinite(entry) || !Number.isFinite(exit) || entry <= 0 || exit <= 0) throw new Error('Missing exact candles')
      await port.save({ tradeId: trade.id, signature: tradeSignature(trade), entry, exit }); completed++
    } catch { failed++ }
    if (i < pending.length - 1) await port.wait()
  }
  return { attempted: pending.length, completed, failed }
}
