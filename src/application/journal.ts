import { validateTrade } from '../domain/trade'
import type { TradeInput } from '../domain/trade'

export interface JournalPort {
  save(accountId: string, trades: TradeInput[], allowDuplicates: boolean): Promise<{ inserted: number; duplicates: number }>
}

export async function saveTrades(port: JournalPort, accountId: string, trades: TradeInput[], allowDuplicates = false) {
  if (!accountId) throw new Error('Choose an account first.')
  if (!trades.length || trades.length > 100) throw new Error('Submit 1–100 trades at a time.')
  for (const trade of trades) { const errors = validateTrade(trade); if (errors.length) throw new Error(errors.join(' ')) }
  return port.save(accountId, trades, allowDuplicates)
}
