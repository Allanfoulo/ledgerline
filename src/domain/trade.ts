export const supportedPairs = ['EUR/USD', 'GBP/USD', 'AUD/USD', 'XAU/USD'] as const
export type Pair = typeof supportedPairs[number]
export type TradeInput = { date: string; exitDate?: string; pair: Pair; side: 'Long' | 'Short'; lots: number; entry: number; exit: number; entryTime: string; exitTime: string; commission: number; swap: number; setup: string }

export function validateTrade(input: TradeInput): string[] {
  const errors: string[] = []
  const validDate = (value: string) => { const date = new Date(`${value}T00:00:00Z`); return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value }
  const exitDate = input.exitDate ?? input.date
  if (!validDate(input.date) || !validDate(exitDate)) errors.push('Use valid dates (YYYY-MM-DD).')
  if (!supportedPairs.includes(input.pair)) errors.push('Choose a supported Forex pair or XAU/USD.')
  if (!['Long', 'Short'].includes(input.side)) errors.push('Side must be Long or Short.')
  const timeValid = (time: string) => /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)
  if (!timeValid(input.entryTime) || !timeValid(input.exitTime) || `${exitDate}T${input.exitTime}` <= `${input.date}T${input.entryTime}`) errors.push('Use valid UTC dates and times with exit after entry.')
  if (!Number.isFinite(input.lots) || input.lots <= 0 || input.lots > 10000) errors.push('Lots must be greater than zero.')
  if (![input.entry, input.exit].every((price) => Number.isFinite(price) && price > 0 && price < (input.pair === 'XAU/USD' ? 1000000 : 1000))) errors.push('Entry and exit prices must be positive and within the supported range.')
  if (!Number.isFinite(input.commission) || input.commission < 0 || !Number.isFinite(input.swap)) errors.push('Commission must be nonnegative and swap must be a number.')
  if (input.setup.length > 120) errors.push('Strategy name is too long.')
  return errors
}

// This fingerprint deliberately excludes notes and setup so repeat CSV imports remain idempotent.
export function tradeFingerprint(input: TradeInput): string {
  const values = [input.date, input.pair, input.side, input.lots, input.entry, input.exit, input.entryTime, input.exitTime, input.commission, input.swap]
  if (input.exitDate && input.exitDate !== input.date) values.push(input.exitDate)
  return JSON.stringify(values)
}

export function forexPnl(input: Pick<TradeInput, 'pair' | 'side' | 'lots' | 'entry' | 'exit' | 'commission' | 'swap'>) {
  const gold = input.pair === 'XAU/USD'
  const change = (input.exit - input.entry) * (input.side === 'Long' ? 1 : -1)
  const pips = change / (gold ? 0.001 : 0.0001)
  const grossPnl = change * (gold ? 100 : 100000) * input.lots
  return { pips, grossPnl, netPnl: grossPnl - input.commission - input.swap }
}
