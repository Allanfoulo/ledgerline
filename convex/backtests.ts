import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { validateTrade } from '../src/domain/trade'
import { belongsTo, requireOwner } from './identity'

const pair = v.union(v.literal('EUR/USD'), v.literal('GBP/USD'), v.literal('AUD/USD'), v.literal('XAU/USD'))
const trade = v.object({ date: v.string(), pair, side: v.union(v.literal('Long'), v.literal('Short')), lots: v.number(), entry: v.number(), exit: v.number(), entryTime: v.string(), exitTime: v.string(), commission: v.number(), swap: v.number(), setup: v.string() })
export const list = query({ args: { accountId: v.id('tradingAccounts') }, handler: async (ctx, { accountId }) => {
  const user = await requireOwner(ctx)
  const account = await ctx.db.get(accountId); if (!account || !belongsTo(account.owner, user)) throw new Error('Account not found')
  return (await ctx.db.query('backtestSessions').withIndex('by_owner_account', (q) => q.eq('owner', account.owner).eq('accountId', accountId)).order('desc').take(30)).map(({ _id, date, pair: symbol, startTime, endTime, trades }) => ({ id: _id, date, pair: symbol, startTime, endTime, trades }))
} })
export const save = mutation({ args: { accountId: v.id('tradingAccounts'), sessionKey: v.string(), date: v.string(), pair, startTime: v.string(), endTime: v.string(), trades: v.array(trade) }, handler: async (ctx, args) => {
  const user = await requireOwner(ctx)
  const account = await ctx.db.get(args.accountId); if (!account || !belongsTo(account.owner, user)) throw new Error('Account not found')
  if (!/^[0-9a-f-]{36}$/i.test(args.sessionKey) || !args.trades.length || args.trades.length > 100 || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(args.startTime) || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(args.endTime) || args.endTime <= args.startTime) throw new Error('Invalid session')
  for (const item of args.trades) if (item.date !== args.date || item.pair !== args.pair || item.entryTime < args.startTime || item.exitTime > args.endTime || validateTrade(item).length) throw new Error('Invalid simulated trade')
  const old = (await ctx.db.query('backtestSessions').withIndex('by_owner_account', (q) => q.eq('owner', account.owner).eq('accountId', args.accountId)).collect()).find((session) => session.sessionKey === args.sessionKey)
  if (old) return old._id
  return ctx.db.insert('backtestSessions', { owner: account.owner, ...args })
} })
