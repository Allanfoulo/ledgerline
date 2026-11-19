import { v } from 'convex/values'
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server'
import { belongsTo, requireOwner } from './identity'
import { internal } from './_generated/api'
import { playbook } from './strategyValidators'

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
  const examples = await ctx.db.query('strategyExamples').withIndex('by_strategy', (q) => q.eq('strategyId', strategyId)).collect()
  return await ctx.db.insert('strategyVersions', { owner, strategyId, version: latest + 1, name: strategy.name, description: strategy.description ?? '', rules: strategy.rules, signals: clean, playbook: strategy.playbook, exampleIds: examples.filter((example) => belongsTo(example.owner, owner) && !example.archived).map((example) => example._id), committedAt: Date.now() })
} })

export const list = query({ args: {}, handler: async (ctx) => {
  const user = await requireOwner(ctx)
  return (await ctx.db.query('strategies').withIndex('by_owner', (q) => q.gte('owner', user).lt('owner', `${user}}`)).collect()).filter((item) => belongsTo(item.owner, user)).map(({ _id, name, description, rules, playbook }) => ({ id: _id, name, description: description ?? '', rules, playbook }))
} })
export const save = mutation({ args: { id: v.optional(v.id('strategies')), name: v.string(), description: v.optional(v.string()), rules: v.array(v.string()), playbook: v.optional(playbook) }, handler: async (ctx, args) => {
  const user = await requireOwner(ctx)
  const name = args.name.trim(); const description = args.description?.trim() ?? ''; const rules = args.rules.map((rule) => rule.trim()).filter(Boolean)
  if (!name || name.length > 120 || description.length > 1000 || rules.length > 20 || rules.some((rule) => rule.length > 200) || new Set(rules).size !== rules.length) throw new Error('Check the strategy name, description, and rules (up to 20 distinct rules).')
  if (args.playbook && Object.values(args.playbook).some((value) => value.length > 1000)) throw new Error('Keep each playbook field under 1,000 characters.')
  const existing = (await ctx.db.query('strategies').withIndex('by_owner', (q) => q.gte('owner', user).lt('owner', `${user}}`)).collect()).filter((item) => belongsTo(item.owner, user))
  if (existing.some((strategy) => strategy.name.toLowerCase() === name.toLowerCase() && strategy._id !== args.id)) throw new Error('A strategy with this name already exists.')
  if (args.id) { const current = await ctx.db.get(args.id); if (!current || !belongsTo(current.owner, user)) throw new Error('Strategy not found'); await ctx.db.patch(args.id, { name, description, rules, ...(args.playbook !== undefined ? { playbook: args.playbook } : {}) }); return args.id }
  return ctx.db.insert('strategies', { owner: user, name, description, rules, playbook: args.playbook })
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

const EXAMPLE_MAX_BYTES = 700 * 1024

export const examples = query({ args: { strategyId: v.id('strategies') }, handler: async (ctx, { strategyId }) => {
  const owner = await requireOwner(ctx)
  const strategy = await ctx.db.get(strategyId)
  if (!strategy || !belongsTo(strategy.owner, owner)) throw new Error('Strategy not found')
  const [examples, versions] = await Promise.all([ctx.db.query('strategyExamples').withIndex('by_strategy', (q) => q.eq('strategyId', strategyId)).collect(), ctx.db.query('strategyVersions').withIndex('by_strategy', (q) => q.eq('strategyId', strategyId)).collect()])
  const locked = new Set(versions.filter((version) => belongsTo(version.owner, owner)).flatMap((version) => version.exampleIds ?? []))
  return examples.filter((example) => belongsTo(example.owner, owner)).map(({ _id, label, kind, notes, createdAt, archived }) => ({ id: _id, label, kind, notes, createdAt, archived: !!archived, locked: locked.has(_id) }))
} })

export const verifyExampleStrategy = internalQuery({ args: { owner: v.string(), strategyId: v.id('strategies') }, handler: async (ctx, { owner, strategyId }) => {
  const strategy = await ctx.db.get(strategyId)
  return !!strategy && belongsTo(strategy.owner, owner)
} })

export const attachExample = internalMutation({ args: { owner: v.string(), strategyId: v.id('strategies'), storageId: v.id('_storage'), label: v.string(), kind: v.union(v.literal('qualifies'), v.literal('does_not_qualify')), notes: v.string(), mimeType: v.string(), size: v.number() }, handler: async (ctx, args) => {
  const strategy = await ctx.db.get(args.strategyId)
  if (!strategy || !belongsTo(strategy.owner, args.owner)) throw new Error('Strategy not found')
  const existing = await ctx.db.query('strategyExamples').withIndex('by_strategy', (q) => q.eq('strategyId', args.strategyId)).collect()
  if (existing.filter((example) => belongsTo(example.owner, args.owner) && !example.archived).length >= 20) throw new Error('A strategy can have up to 20 chart examples.')
  return await ctx.db.insert('strategyExamples', { ...args, createdAt: Date.now() })
} })

export const uploadExample = action({ args: { strategyId: v.id('strategies'), base64: v.string(), mimeType: v.union(v.literal('image/png'), v.literal('image/jpeg'), v.literal('image/webp')), label: v.string(), kind: v.union(v.literal('qualifies'), v.literal('does_not_qualify')), notes: v.string() }, handler: async (ctx, args): Promise<{ exampleId: import('./_generated/dataModel').Id<'strategyExamples'> }> => {
  const owner = await requireOwner(ctx)
  const refs = (internal as any).strategies
  if (!await ctx.runQuery(refs.verifyExampleStrategy, { owner, strategyId: args.strategyId })) throw new Error('Strategy not found')
  const label = args.label.trim(); const notes = args.notes.trim()
  if (!label || label.length > 120 || notes.length > 1000) throw new Error('Add a title and keep notes under 1,000 characters.')
  if (args.base64.length > Math.ceil(EXAMPLE_MAX_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(args.base64)) throw new Error('Choose a PNG, JPEG, or WebP image under 700 KB.')
  let bytes: Uint8Array
  try { bytes = Uint8Array.from(atob(args.base64), (character) => character.charCodeAt(0)) } catch { throw new Error('Could not read the selected image.') }
  const valid = bytes.length > 0 && bytes.length <= EXAMPLE_MAX_BYTES && ((args.mimeType === 'image/png' && bytes.length >= 8 && [137,80,78,71,13,10,26,10].every((byte, i) => bytes[i] === byte)) || (args.mimeType === 'image/jpeg' && bytes.length >= 3 && bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255) || (args.mimeType === 'image/webp' && bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'))
  if (!valid) throw new Error('The selected file is not a supported image.')
  const buffer = new ArrayBuffer(bytes.length); new Uint8Array(buffer).set(bytes)
  const storageId = await ctx.storage.store(new Blob([buffer], { type: args.mimeType }))
  try {
    const exampleId = await ctx.runMutation(refs.attachExample, { owner, strategyId: args.strategyId, storageId, label, kind: args.kind, notes, mimeType: args.mimeType, size: bytes.length })
    return { exampleId }
  } catch (error) { await ctx.storage.delete(storageId); throw error }
} })

export const removeExample = mutation({ args: { exampleId: v.id('strategyExamples') }, handler: async (ctx, { exampleId }) => {
  const owner = await requireOwner(ctx)
  const example = await ctx.db.get(exampleId)
  const strategy = example && await ctx.db.get(example.strategyId)
  if (!example || !strategy || !belongsTo(example.owner, owner) || !belongsTo(strategy.owner, owner)) throw new Error('Chart example not found')
  const versions = await ctx.db.query('strategyVersions').withIndex('by_strategy', (q) => q.eq('strategyId', strategy._id)).collect()
  if (versions.some((version) => belongsTo(version.owner, owner) && version.exampleIds?.includes(exampleId))) { await ctx.db.patch(exampleId, { archived: true }); return }
  await ctx.storage.delete(example.storageId)
  await ctx.db.delete(exampleId)
} })

export const ownedExample = internalQuery({ args: { owner: v.string(), exampleId: v.id('strategyExamples') }, handler: async (ctx, { owner, exampleId }) => {
  const example = await ctx.db.get(exampleId)
  const strategy = example && await ctx.db.get(example.strategyId)
  return example && strategy && belongsTo(example.owner, owner) && belongsTo(strategy.owner, owner) ? { storageId: example.storageId, mimeType: example.mimeType, size: example.size } : null
} })

export const exampleImage = action({ args: { exampleId: v.id('strategyExamples') }, handler: async (ctx, { exampleId }): Promise<string | null> => {
  const owner = await requireOwner(ctx)
  const example = await ctx.runQuery((internal as any).strategies.ownedExample, { owner, exampleId }) as { storageId: import('./_generated/dataModel').Id<'_storage'>; mimeType: string; size: number } | null
  if (!example) return null
  const blob = await ctx.storage.get(example.storageId)
  if (!blob || blob.size !== example.size || blob.type !== example.mimeType || blob.size > EXAMPLE_MAX_BYTES) return null
  const bytes = new Uint8Array(await blob.arrayBuffer()); let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  return `data:${example.mimeType};base64,${btoa(binary)}`
} })
