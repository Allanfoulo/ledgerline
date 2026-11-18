import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { belongsTo, requireOwner } from './identity'

export const versions = query({ args: { strategyId: v.id('strategies') }, handler: async (ctx, { strategyId }) => {
  const owner = await requireOwner(ctx)
  const strategy = await ctx.db.get(strategyId)
  if (!strategy || !belongsTo(strategy.owner, owner)) throw new Error('Strategy not found')
  return (await ctx.db.query('strategyVersions').withIndex('by_strategy', (q) => q.eq('strategyId', strategyId)).collect()).filter((row) => belongsTo(row.owner, owner)).sort((a, b) => b.version - a.version)
} })

export const commitVersion = mutation({ args: { strategyId: v.id('strategies'), expectedVersion: v.number(), signals: v.array(v.object({ name: v.string(), description: v.string() })) }, handler: async (ctx, { strategyId, expectedVersion, signals }) => {
  const owner = await requireOwner(ctx)
  const strategy = await ctx.db.get(strategyId)
  if (!strategy || !belongsTo(strategy.owner, owner)) throw new Error('Strategy not found')
  const versions = await ctx.db.query('strategyVersions').withIndex('by_strategy', (q) => q.eq('strategyId', strategyId)).collect()
  const latest = versions.reduce((max, version) => Math.max(max, version.version), 0)
  if (latest !== expectedVersion) throw new Error('Strategy version changed. Reload before committing.')
  const clean = signals.map((signal) => ({ name: signal.name.trim(), description: signal.description.trim() }))
  if (clean.length > 20 || clean.some((signal) => !signal.name || signal.name.length > 80 || !signal.description || signal.description.length > 500) || new Set(clean.map((signal) => signal.name.toLowerCase())).size !== clean.length) throw new Error('Provide up to 20 distinct signals with names and descriptions.')
  return await ctx.db.insert('strategyVersions', { owner, strategyId, version: latest + 1, name: strategy.name, description: strategy.description ?? '', rules: strategy.rules, signals: clean, committedAt: Date.now() })
} })

export const list = query({ args: {}, handler: async (ctx) => {
  const user = await requireOwner(ctx)
  return (await ctx.db.query('strategies').withIndex('by_owner', (q) => q.gte('owner', user).lt('owner', `${user}}`)).collect()).filter((item) => belongsTo(item.owner, user)).map(({ _id, name, description, rules }) => ({ id: _id, name, description: description ?? '', rules }))
} })
export const save = mutation({ args: { id: v.optional(v.id('strategies')), name: v.string(), description: v.optional(v.string()), rules: v.array(v.string()) }, handler: async (ctx, args) => {
  const user = await requireOwner(ctx)
  const name = args.name.trim(); const description = args.description?.trim() ?? ''; const rules = args.rules.map((rule) => rule.trim()).filter(Boolean)
  if (!name || name.length > 120 || description.length > 1000 || rules.length > 20 || rules.some((rule) => rule.length > 200) || new Set(rules).size !== rules.length) throw new Error('Check the strategy name, description, and rules (up to 20 distinct rules).')
  const existing = (await ctx.db.query('strategies').withIndex('by_owner', (q) => q.gte('owner', user).lt('owner', `${user}}`)).collect()).filter((item) => belongsTo(item.owner, user))
  if (existing.some((strategy) => strategy.name.toLowerCase() === name.toLowerCase() && strategy._id !== args.id)) throw new Error('A strategy with this name already exists.')
  if (args.id) { const current = await ctx.db.get(args.id); if (!current || !belongsTo(current.owner, user)) throw new Error('Strategy not found'); await ctx.db.patch(args.id, { name, description, rules }); return args.id }
  return ctx.db.insert('strategies', { owner: user, name, description, rules })
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
