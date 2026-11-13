import { useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import type { Trade } from '../types'
import type { TradeInput } from '../domain/trade'
import { tradePrintsEnabled } from '../config/features'

export function useConvexJournal(authenticated: boolean) {
  const [accountId, setAccountId] = useState('')
  const accounts = useQuery(api.journal.accounts, authenticated ? {} : 'skip') as Array<{ id: string; name: string; currency: 'USD' }> | undefined
  const rows = useQuery(api.journal.list, authenticated && accountId ? { accountId: accountId as Id<'tradingAccounts'> } : 'skip')
  const prints = useQuery(api.journal.listPrints, tradePrintsEnabled && authenticated && accountId ? { accountId: accountId as Id<'tradingAccounts'> } : 'skip')
  const printStates = new Map((prints ?? []).map((item) => [item.tradeId as string, item.status]))
  const create = useMutation(api.journal.createAccount)
  const save = useMutation(api.journal.save)
  const realTrades: Trade[] = (rows ?? []).map((trade) => ({ ...trade, source: 'real', printStatus: printStates.get(trade.id), note: '', tags: [], executions: trade.executions.length ? trade.executions : [{ time: trade.entryTime, action: trade.side === 'Long' ? 'Buy' : 'Sell', price: trade.entry, lots: trade.lots }, { time: trade.exitTime, action: trade.side === 'Long' ? 'Sell' : 'Buy', price: trade.exit, lots: trade.lots }] }))
  return {
    accounts: accounts ?? [], accountId, setAccountId, realTrades, tradesLoading: !!accountId && rows === undefined,
    createAccount: async (name: string) => { const id = await create({ name }); setAccountId(id) },
    saveTrades: async (id: string, trades: TradeInput[], allowDuplicates: boolean) => save({ accountId: id as Id<'tradingAccounts'>, trades, allowDuplicates }),
  }
}
