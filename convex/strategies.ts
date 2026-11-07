import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { belongsTo, requireOwner } from './identity'

export const list = query({ args: {}, handler: async (ctx) => {
  const user = await requireOwner(ctx)
  return (await ctx.db.query('strategies').withIndex('by_owner', (q) => q.gte('owner', user).lt('owner', `${user}}`)).collect()).filter((item) => belongsTo(item.owner, user)).map(({ _id, name, rules }) => ({ id: _id, name, rules }))
} })
export const save = mutation({ args: { id: v.optional(v.id('strategies')), name: v.string(), rules: v.array(v.string()) }, handler: async (ctx, args) => {
  const user = await requireOwner(ctx)
  const name = args.name.trim(); const rules = args.rules.map((rule) => rule.trim()).filter(Boolean)
  if (!name || name.length > 120 || rules.length > 20 || rules.some((rule) => rule.length > 200) || new Set(rules).size !== rules.length) throw new Error('Check the strategy name and rules (up to 20 distinct rules).')
  const existing = (await ctx.db.query('strategies').withIndex('by_owner', (q) => q.gte('owner', user).lt('owner', `${user}}`)).collect()).filter((item) => belongsTo(item.owner, user))
  if (existing.some((strategy) => strategy.name.toLowerCase() === name.toLowerCase() && strategy._id !== args.id)) throw new Error('A strategy with this name already exists.')
  if (args.id) { const current = await ctx.db.get(args.id); if (!current || !belongsTo(current.owner, user)) throw new Error('Strategy not found'); await ctx.db.patch(args.id, { name, rules }); return args.id }
  return ctx.db.insert('strategies', { owner: user, name, rules })
} })
export const reviews = query({ args: { accountId: v.id('tradingAccounts') }, handler: async (ctx, { accountId }) => {
  const user = await requireOwner(ctx)
  const account = await ctx.db.get(accountId); if (!account || !belongsTo(account.owner, user)) throw new Error('Account not found')
  return (await ctx.db.query('tradeReviews').withIndex('by_owner_account', (q) => q.eq('owner', account.owner).eq('accountId', accountId)).collect()).map(({ tradeId, strategyId, checked }) => ({ tradeId, strategyId, checked }))
} })
export const review = mutation({ args: { accountId: v.id('tradingAccounts'), tradeId: v.id('journalTrades'), strategyId: v.id('strategies'), checked: v.array(v.string()) }, handler: async (ctx, args) => {
  const user = await requireOwner(ctx)
  const account = await ctx.db.get(args.accountId); const trade = await ctx.db.get(args.tradeId); const strategy = await ctx.db.get(args.strategyId)
  if (!account || !belongsTo(account.owner, user) || !trade || trade.owner !== account.owner || trade.accountId !== args.accountId || !strategy || !belongsTo(strategy.owner, user)) throw new Error('Trade or strategy not found')
  if (args.checked.length > 20 || new Set(args.checked).size !== args.checked.length || args.checked.some((rule) => !strategy.rules.includes(rule))) throw new Error('Invalid checklist')
  const existing = await ctx.db.query('tradeReviews').withIndex('by_owner_account', (q) => q.eq('owner', account.owner).eq('accountId', args.accountId)).collect()
  const old = existing.find((item) => item.tradeId === args.tradeId)
  if (old) await ctx.db.patch(old._id, { strategyId: args.strategyId, checked: args.checked })
  else await ctx.db.insert('tradeReviews', { owner: account.owner, ...args })
} })
