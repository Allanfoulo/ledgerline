import { v } from 'convex/values'
import { query, mutation } from './_generated/server'
import { belongsTo, requireOwner } from './identity'

export const list = query({ args: {}, handler: async (ctx) => {
  const user = await requireOwner(ctx)
  const rows = (await ctx.db.query('notes').withIndex('by_owner', (q) => q.gte('owner', user).lt('owner', `${user}}`)).collect()).filter((row) => belongsTo(row.owner, user))
  rows.sort((a, b) => Number(a.owner === user) - Number(b.owner === user) || a._creationTime - b._creationTime)
  return rows.map(({ kind, key, text }) => ({ kind, key, text }))
} })
export const save = mutation({ args: { kind: v.union(v.literal('day'), v.literal('trade')), key: v.string(), text: v.string() }, handler: async (ctx, args) => {
  const user = await requireOwner(ctx)
  if (args.key.length > 100 || args.text.length > 20000) throw new Error('Note is too long')
  const rows = await ctx.db.query('notes').withIndex('by_owner', (q) => q.eq('owner', user)).collect()
  const old = rows.find((row) => row.kind === args.kind && row.key === args.key)
  if (old) await ctx.db.patch(old._id, { text: args.text })
  else await ctx.db.insert('notes', { owner: user, ...args })
} })
