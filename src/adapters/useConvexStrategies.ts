import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export type StrategyPlaybook = { markets: string; timeframes: string; context: string; signalSequence: string; entry: string; invalidation: string; protectiveStop: string; targets: string; management: string }
export type Strategy = { id: string; name: string; description: string; rules: string[]; playbook?: StrategyPlaybook }
export type StrategyReview = { tradeId: string; strategyId: string; checked: string[] }
export function useConvexStrategies(authenticated: boolean, accountId: string) {
  const strategies = useQuery(api.strategies.list, authenticated ? {} : 'skip') as Strategy[] | undefined
  const reviews = useQuery(api.strategies.reviews, authenticated && accountId ? { accountId: accountId as Id<'tradingAccounts'> } : 'skip') as StrategyReview[] | undefined
  const save = useMutation(api.strategies.save)
  const review = useMutation(api.strategies.review)
  return {
    strategies: strategies ?? [], reviews: reviews ?? [],
    saveStrategy: async (id: string | undefined, name: string, description: string, rules: string[], playbook: StrategyPlaybook) => { return await (save as any)({ id: id as Id<'strategies'> | undefined, name, description, rules, playbook }) as string },
    saveReview: async (tradeId: string, strategyId: string, checked: string[]) => { await review({ accountId: accountId as Id<'tradingAccounts'>, tradeId: tradeId as Id<'journalTrades'>, strategyId: strategyId as Id<'strategies'>, checked }) },
  }
}
