import { v } from 'convex/values'
import { action, internalMutation, internalQuery, query } from './_generated/server'
import { internal } from './_generated/api'
import { belongsTo, requireOwner } from './identity'

const hex = (bytes: Uint8Array) => Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('')
const bytes = (value: string) => Uint8Array.from(value.match(/.{2}/g) ?? [], (x) => parseInt(x, 16))
async function encryptionKey() {
  const value = process.env.JOURNAL_ENCRYPTION_KEY
  if (!value || !/^[0-9a-fA-F]{64}$/.test(value)) throw new Error('Server encryption key is not configured')
  return crypto.subtle.importKey('raw', bytes(value), 'AES-GCM', false, ['encrypt', 'decrypt'])
}
export const status = query({ args: {}, handler: async (ctx) => {
  const user = await requireOwner(ctx)
  return (await ctx.db.query('secrets').withIndex('by_owner', (q) => q.gte('owner', user).lt('owner', `${user}}`)).collect()).some((row) => belongsTo(row.owner, user))
} })
export const readInternal = internalQuery({ args: { owner: v.string() }, handler: async (ctx, { owner }) => {
  const rows = (await ctx.db.query('secrets').withIndex('by_owner', (q) => q.gte('owner', owner).lt('owner', `${owner}}`)).collect()).filter((row) => belongsTo(row.owner, owner))
  rows.sort((a, b) => Number(b.owner === owner) - Number(a.owner === owner) || b._creationTime - a._creationTime)
  return rows[0] ?? null
} })
export const writeInternal = internalMutation({ args: { owner: v.string(), ciphertext: v.string(), iv: v.string() }, handler: async (ctx, args) => {
  const old = await ctx.db.query('secrets').withIndex('by_owner', (q) => q.eq('owner', args.owner)).unique()
  if (old) await ctx.db.patch(old._id, { ciphertext: args.ciphertext, iv: args.iv })
  else await ctx.db.insert('secrets', args)
} })
export const deleteInternal = internalMutation({ args: { owner: v.string() }, handler: async (ctx, { owner }) => {
  const rows = (await ctx.db.query('secrets').withIndex('by_owner', (q) => q.gte('owner', owner).lt('owner', `${owner}}`)).collect()).filter((row) => belongsTo(row.owner, owner))
  for (const row of rows) await ctx.db.delete(row._id)
} })
export const save = action({ args: { key: v.string() }, handler: async (ctx, { key }) => {
  const user = await requireOwner(ctx)
  if (!key.trim() || key.length > 256) throw new Error('Invalid key')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(user) }, await encryptionKey(), new TextEncoder().encode(key.trim()))
  await ctx.runMutation(internal.secrets.writeInternal, { owner: user, iv: hex(iv), ciphertext: hex(new Uint8Array(ciphertext)) })
} })
export const remove = action({ args: {}, handler: async (ctx) => {
  const user = await requireOwner(ctx)
  await ctx.runMutation(internal.secrets.deleteInternal, { owner: user })
} })
export const candles = action({ args: { pair: v.string(), date: v.string(), exitDate: v.optional(v.string()), entryTime: v.string(), exitTime: v.string() }, handler: async (ctx, args) => {
  const user = await requireOwner(ctx)
  if (!['EUR/USD', 'GBP/USD', 'AUD/USD', 'XAU/USD'].includes(args.pair) || !/^\d{4}-\d{2}-\d{2}$/.test(args.date) || (args.exitDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(args.exitDate)) || !/^\d{2}:\d{2}$/.test(args.entryTime) || !/^\d{2}:\d{2}$/.test(args.exitTime)) throw new Error('Invalid trade')
  const record = await ctx.runQuery(internal.secrets.readInternal, { owner: user })
  if (!record) throw new Error('Add a Twelve Data key in Settings first')
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(record.iv), additionalData: new TextEncoder().encode(record.owner) }, await encryptionKey(), bytes(record.ciphertext))
  const start = new Date(`${args.date}T${args.entryTime}:00Z`); const end = new Date(`${args.exitDate ?? args.date}T${args.exitTime}:00Z`)
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start || end.getTime() - start.getTime() > 72 * 3600000) throw new Error('Replay supports up to 72 hours')
  start.setUTCMinutes(start.getUTCMinutes() - 15); end.setUTCMinutes(end.getUTCMinutes() + 15)
  const params = new URLSearchParams({ symbol: args.pair, interval: '1min', start_date: start.toISOString().slice(0, 19), end_date: end.toISOString().slice(0, 19), timezone: 'UTC', outputsize: '5000', apikey: new TextDecoder().decode(plain) })
  const response = await fetch(`https://api.twelvedata.com/time_series?${params}`)
  const data = await response.json()
  if (!response.ok || data.status === 'error' || !Array.isArray(data.values)) throw new Error('Historical candles are unavailable; check your data plan and date')
  return data.values.map((row: { datetime: string; open: string; high: string; low: string; close: string }) => ({ time: row.datetime.replace(' ', 'T'), open: Number(row.open), high: Number(row.high), low: Number(row.low), close: Number(row.close) })).filter((row: { time: string; open: number; high: number; low: number; close: number }) => [row.open, row.high, row.low, row.close].every(Number.isFinite) && !Number.isNaN(Date.parse(`${row.time}Z`))).sort((a: { time: string }, b: { time: string }) => a.time.localeCompare(b.time))
} })
