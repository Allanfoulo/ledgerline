import { v } from 'convex/values'
import { action, internalMutation, internalQuery, query } from './_generated/server'
import { internal } from './_generated/api'
import { requireOwner } from './identity'
import { supportsChartAnalysisProvider } from '../src/domain/chartAnalysis'

const hex = (bytes: Uint8Array) => Array.from(bytes, (x) => x.toString(16).padStart(2, '0')).join('')
const bytes = (value: string) => Uint8Array.from(value.match(/.{2}/g) ?? [], (x) => parseInt(x, 16))
export async function encryptionKey() {
  const value = process.env.JOURNAL_ENCRYPTION_KEY
  if (!value || !/^[0-9a-fA-F]{64}$/.test(value)) throw new Error('Server encryption key is not configured')
  return crypto.subtle.importKey('raw', bytes(value), 'AES-GCM', false, ['encrypt', 'decrypt'])
}
export async function decryptKey(row: { owner: string; provider: string; ciphertext: string; iv: string }) {
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes(row.iv), additionalData: new TextEncoder().encode(`${row.owner}:${row.provider}`) }, await encryptionKey(), bytes(row.ciphertext))
  return new TextDecoder().decode(plain)
}
export const status = query({ args: { provider: v.string() }, handler: async (ctx, { provider }) => {
  const owner = await requireOwner(ctx)
  if (!supportsChartAnalysisProvider(provider)) throw new Error('Chart analysis provider is not configured')
  return !!(await ctx.db.query('providerKeys').withIndex('by_owner_provider', (q) => q.eq('owner', owner).eq('provider', provider)).unique())
} })
export const readInternal = internalQuery({ args: { owner: v.string(), provider: v.string() }, handler: async (ctx, { owner, provider }) => ctx.db.query('providerKeys').withIndex('by_owner_provider', (q) => q.eq('owner', owner).eq('provider', provider)).unique() })
export const writeInternal = internalMutation({ args: { owner: v.string(), provider: v.string(), ciphertext: v.string(), iv: v.string() }, handler: async (ctx, args) => {
  const previous = await ctx.db.query('providerKeys').withIndex('by_owner_provider', (q) => q.eq('owner', args.owner).eq('provider', args.provider)).unique()
  if (previous) await ctx.db.patch(previous._id, { ciphertext: args.ciphertext, iv: args.iv })
  else await ctx.db.insert('providerKeys', args)
} })
export const deleteInternal = internalMutation({ args: { owner: v.string(), provider: v.string() }, handler: async (ctx, { owner, provider }) => {
  const previous = await ctx.db.query('providerKeys').withIndex('by_owner_provider', (q) => q.eq('owner', owner).eq('provider', provider)).unique()
  if (previous) await ctx.db.delete(previous._id)
} })
export const save = action({ args: { provider: v.string(), key: v.string() }, handler: async (ctx, { provider, key }) => {
  const owner = await requireOwner(ctx)
  if (!supportsChartAnalysisProvider(provider) || !key.trim() || key.length > 256) throw new Error('Invalid API key or provider')
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(`${owner}:${provider}`) }, await encryptionKey(), new TextEncoder().encode(key.trim()))
  await ctx.runMutation((internal as any).providerKeys.writeInternal, { owner, provider, iv: hex(iv), ciphertext: hex(new Uint8Array(ciphertext)) })
} })
export const remove = action({ args: { provider: v.string() }, handler: async (ctx, { provider }) => {
  const owner = await requireOwner(ctx)
  if (!supportsChartAnalysisProvider(provider)) throw new Error('Chart analysis provider is not configured')
  await ctx.runMutation((internal as any).providerKeys.deleteInternal, { owner, provider })
} })
