import { v } from 'convex/values'
import { mutation, query } from './_generated/server'
import { tradeFingerprint, validateTrade } from '../src/domain/trade'
import { belongsTo, requireOwner } from './identity'

const trade = v.object({ date: v.string(), exitDate: v.optional(v.string()), pair: v.union(v.literal('EUR/USD'), v.literal('GBP/USD'), v.literal('AUD/USD'), v.literal('XAU/USD')), side: v.union(v.literal('Long'), v.literal('Short')), lots: v.number(), entry: v.number(), exit: v.number(), entryTime: v.string(), exitTime: v.string(), commission: v.number(), swap: v.number(), setup: v.string() })

export const accounts = query({ args: {}, handler: async (ctx) => {
  const user = await requireOwner(ctx)
  return (await ctx.db.query('tradingAccounts').withIndex('by_owner', (q) => q.gte('owner', user).lt('owner', `${user}}`)).collect()).filter((account) => belongsTo(account.owner, user)).map(({ _id, name, currency }) => ({ id: _id, name, currency }))
} })
export const createAccount = mutation({ args: { name: v.string() }, handler: async (ctx, { name }) => {
  const user = await requireOwner(ctx)
  const clean = name.trim()
  if (!clean || clean.length > 80) throw new Error('Account name must be 1–80 characters')
  return ctx.db.insert('tradingAccounts', { owner: user, name: clean, currency: 'USD' })
} })
export const list = query({ args: { accountId: v.id('tradingAccounts') }, handler: async (ctx, { accountId }) => {
  const user = await requireOwner(ctx)
  const account = await ctx.db.get(accountId)
  if (!account || !belongsTo(account.owner, user)) throw new Error('Account not found')
  const trades = await ctx.db.query('journalTrades').withIndex('by_owner_account', (q) => q.eq('owner', account.owner).eq('accountId', accountId)).collect()
  return Promise.all(trades.map(async ({ _id, date, exitDate, brokerSymbol, pair, side, lots, entry, exit, entryTime, exitTime, commission, swap, setup }) => {
    const fills = await ctx.db.query('tradeExecutions').withIndex('by_owner_trade', (q) => q.eq('owner', account.owner).eq('tradeId', _id)).collect()
    return { id: _id, date, ...(exitDate ? { exitDate } : {}), ...(brokerSymbol ? { brokerSymbol } : {}), pair, side, lots, entry, exit, entryTime, exitTime, commission, swap, setup, executions: fills.map(({ date: fillDate, time, action, price, lots: size }) => ({ ...(fillDate ? { date: fillDate } : {}), time, action, price, lots: size })) }
  }))
} })
export const save = mutation({ args: { accountId: v.id('tradingAccounts'), trades: v.array(trade), allowDuplicates: v.optional(v.boolean()) }, handler: async (ctx, { accountId, trades, allowDuplicates }) => {
  const user = await requireOwner(ctx)
  const account = await ctx.db.get(accountId)
  if (!account || !belongsTo(account.owner, user)) throw new Error('Account not found')
  if (!trades.length || trades.length > 100) throw new Error('Submit 1–100 trades at a time')
  for (const item of trades) { const errors = validateTrade(item); if (errors.length) throw new Error(errors.join(' ')) }
  const existing = await ctx.db.query('journalTrades').withIndex('by_owner_account', (q) => q.eq('owner', account.owner).eq('accountId', accountId)).collect()
  const known = new Set(existing.map((item) => item.fingerprint))
  let inserted = 0; let duplicates = 0
  for (const item of trades) {
    const fingerprint = tradeFingerprint(item)
    if (known.has(fingerprint) && allowDuplicates !== true) { duplicates++; continue }
    const tradeId = await ctx.db.insert('journalTrades', { owner: account.owner, accountId, fingerprint, ...item })
    await ctx.db.insert('tradeExecutions', { owner: account.owner, accountId, tradeId, date: item.date, time: item.entryTime, action: item.side === 'Long' ? 'Buy' : 'Sell', price: item.entry, lots: item.lots })
    await ctx.db.insert('tradeExecutions', { owner: account.owner, accountId, tradeId, date: item.exitDate ?? item.date, time: item.exitTime, action: item.side === 'Long' ? 'Sell' : 'Buy', price: item.exit, lots: item.lots })
    known.add(fingerprint); inserted++
  }
  return { inserted, duplicates }
} })
