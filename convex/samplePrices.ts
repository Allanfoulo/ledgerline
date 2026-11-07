import { v } from 'convex/values'
import { query, mutation } from './_generated/server'
import { belongsTo, requireOwner } from './identity'

export const list = query({ args: {}, handler: async (ctx) => {
  const user = await requireOwner(ctx)
  const rows = (await ctx.db.query('samplePrices').withIndex('by_owner', (q) => q.gte('owner', user).lt('owner', `${user}}`)).collect()).filter((row) => belongsTo(row.owner, user))
  rows.sort((a, b) => Number(a.owner === user) - Number(b.owner === user) || a._creationTime - b._creationTime)
  return rows.map(({ tradeId, signature, entry, exit }) => ({ tradeId, signature, entry, exit }))
} })

export const save = mutation({ args: { tradeId: v.string(), signature: v.string(), entry: v.number(), exit: v.number() }, handler: async (ctx, args) => {
  const user = await requireOwner(ctx)
  if (!/^fx-[a-z0-9-]{1,30}$/.test(args.tradeId) || args.signature.length > 100 || !Number.isFinite(args.entry) || !Number.isFinite(args.exit) || args.entry <= 0 || args.exit <= 0) throw new Error('Invalid sample prices')
  const rows = await ctx.db.query('samplePrices').withIndex('by_owner', (q) => q.eq('owner', user)).collect()
  const old = rows.find((row) => row.tradeId === args.tradeId)
  if (old) await ctx.db.patch(old._id, args)
  else await ctx.db.insert('samplePrices', { owner: user, ...args })
} })
