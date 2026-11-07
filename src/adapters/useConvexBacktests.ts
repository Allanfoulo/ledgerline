import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import type { TradeInput, Pair } from '../domain/trade'

export type BacktestSession = { id: string; date: string; pair: Pair; startTime: string; endTime: string; trades: TradeInput[] }
export type BacktestDraft = Omit<BacktestSession, 'id'> & { sessionKey: string }
export function useConvexBacktests(authenticated: boolean, accountId: string) {
  const sessions = useQuery(api.backtests.list, authenticated && accountId ? { accountId: accountId as Id<'tradingAccounts'> } : 'skip') as BacktestSession[] | undefined
  const save = useMutation(api.backtests.save)
  return { backtests: sessions ?? [], saveBacktest: async (draft: BacktestDraft) => { await save({ accountId: accountId as Id<'tradingAccounts'>, ...draft }) } }
}
