import { v } from 'convex/values'
import { action, internalQuery, mutation, query } from './_generated/server'
import { internal } from './_generated/api'
import { belongsTo, requireOwner } from './identity'
import { decryptKey } from './providerKeys'
import { analyzeChart } from './chartAnalysisProviders'
import { chartAnalysisSuggestions } from './planValidators'
import { parseChartAnalysis, supportsChartAnalysisProvider } from '../src/domain/chartAnalysis'

const MAX_IMAGE_BYTES = 8 * 1024 * 1024
const MAX_PREVIEW_BYTES = 450_000
const UPLOAD_RESERVATION_MS = 60 * 60 * 1000

export const list = query({ args: { planId: v.id('executionPlans') }, handler: async (ctx, { planId }) => {
  const owner = await requireOwner(ctx)
  const plan = await ctx.db.get(planId)
  if (!plan || !belongsTo(plan.owner, owner)) throw new Error('Plan not found')
  const images = await ctx.db.query('planImages').withIndex('by_plan', (q) => q.eq('planId', planId)).collect()
  return images.filter((image) => belongsTo(image.owner, owner)).map(({ _id, createdAt, mimeType, size }) => ({ id: _id, createdAt, mimeType, size }))
} })

export const versionEvidence = query({ args: { planVersionId: v.id('executionPlanVersions') }, handler: async (ctx, { planVersionId }) => {
  const owner = await requireOwner(ctx)
  const version = await ctx.db.get(planVersionId)
  const plan = version && await ctx.db.get(version.planId)
  if (!version || !plan || !belongsTo(version.owner, owner) || !belongsTo(plan.owner, owner)) throw new Error('Plan version not found')
  const [links, selection, analysisLink] = await Promise.all([
    ctx.db.query('planVersionImages').withIndex('by_plan_version', (q) => q.eq('planVersionId', planVersionId)).collect(),
    ctx.db.query('planVersionStrategies').withIndex('by_plan_version', (q) => q.eq('planVersionId', planVersionId)).unique(),
    ctx.db.query('planVersionAnalyses').withIndex('by_plan_version', (q) => q.eq('planVersionId', planVersionId)).unique(),
  ])
  const strategy = selection && selection.planId === plan._id && selection.planVersionId === version._id && selection.strategyVersionId && belongsTo(selection.owner, owner) ? await ctx.db.get(selection.strategyVersionId) : null
  const strategyOwner = strategy ? await ctx.db.get(strategy.strategyId) : null
  const imageIds: string[] = []
  for (const link of links) {
    if (!belongsTo(link.owner, owner) || link.planVersionId !== version._id) continue
    const image = await ctx.db.get(link.imageId)
    if (image && image.planId === plan._id && belongsTo(image.owner, owner)) imageIds.push(image._id)
  }
  const analysis = analysisLink && analysisLink.planId === plan._id && analysisLink.planVersionId === version._id && belongsTo(analysisLink.owner, owner) ? await ctx.db.get(analysisLink.analysisRunId) : null
  return {
    imageIds,
    strategy: strategy && strategyOwner && belongsTo(strategy.owner, owner) && belongsTo(strategyOwner.owner, owner) ? { name: strategy.name, description: strategy.description, version: strategy.version, rules: strategy.rules, signals: strategy.signals } : null,
    analysis: analysis && belongsTo(analysis.owner, owner) && analysis.planId === plan._id && imageIds.includes(analysis.imageId) && (!strategy || analysis.strategyVersionId === strategy._id) ? { provider: analysis.provider, model: analysis.model, createdAt: analysis.createdAt, suggestions: analysis.suggestions } : null,
  }
} })

export const strategyChoices = query({ args: {}, handler: async (ctx) => {
  const owner = await requireOwner(ctx)
  const versions = await ctx.db.query('strategyVersions').withIndex('by_owner', (q) => q.gte('owner', owner).lt('owner', `${owner}}`)).collect()
  return versions.filter((version) => belongsTo(version.owner, owner)).sort((a, b) => a.name.localeCompare(b.name) || b.version - a.version).map(({ _id, strategyId, name, version, description, signals, rules, playbook }) => ({ id: _id, strategyId, name, version, description, signals, rules, playbook }))
} })

export const draftContext = query({ args: { planId: v.id('executionPlans') }, handler: async (ctx, { planId }) => {
  const owner = await requireOwner(ctx)
  const plan = await ctx.db.get(planId)
  if (!plan || !belongsTo(plan.owner, owner)) throw new Error('Plan not found')
  const selection = await ctx.db.query('planStrategySelections').withIndex('by_plan', (q) => q.eq('planId', planId)).unique()
  if (!selection || !belongsTo(selection.owner, owner)) return null
  const strategyVersion = selection.strategyVersionId ? await ctx.db.get(selection.strategyVersionId) : null
  const analysis = selection.analysisRunId ? await ctx.db.get(selection.analysisRunId) : null
  return {
    strategyVersionId: strategyVersion && belongsTo(strategyVersion.owner, owner) ? strategyVersion._id : null,
    strategyId: strategyVersion && belongsTo(strategyVersion.owner, owner) ? strategyVersion.strategyId : null,
    analysis: analysis && belongsTo(analysis.owner, owner) && analysis.planId === planId ? { provider: analysis.provider, model: analysis.model, createdAt: analysis.createdAt } : null,
  }
} })

export const setDraftContext = mutation({ args: { planId: v.id('executionPlans'), expectedRevision: v.number(), strategyVersionId: v.optional(v.id('strategyVersions')), analysis: v.optional(v.object({ imageId: v.id('planImages'), provider: v.string(), model: v.string(), suggestions: chartAnalysisSuggestions })) }, handler: async (ctx, { planId, expectedRevision, strategyVersionId, analysis }) => {
  const owner = await requireOwner(ctx)
  const plan = await ctx.db.get(planId)
  if (!plan || !belongsTo(plan.owner, owner) || plan.status !== 'draft') throw new Error('Draft plan not found')
  if (plan.revision !== expectedRevision) throw new Error('This draft changed in another session. Reload it before changing its evidence.')
  if (strategyVersionId) {
    const version = await ctx.db.get(strategyVersionId)
    const strategy = version && await ctx.db.get(version.strategyId)
    if (!version || !strategy || !belongsTo(version.owner, owner) || !belongsTo(strategy.owner, owner)) throw new Error('Strategy version not found')
  }
  let analysisRunId: import('./_generated/dataModel').Id<'planAnalysisRuns'> | undefined
  if (analysis) {
    const image = await ctx.db.get(analysis.imageId)
    if (!image || image.planId !== planId || !belongsTo(image.owner, owner)) throw new Error('Chart image not found for this plan')
    if (!supportsChartAnalysisProvider(analysis.provider, analysis.model)) throw new Error('Chart analysis provider or model is not configured')
    const suggestions = parseChartAnalysis(analysis.suggestions)
    analysisRunId = await ctx.db.insert('planAnalysisRuns', { owner, planId, imageId: analysis.imageId, strategyVersionId, provider: analysis.provider, model: analysis.model, suggestions, createdAt: Date.now() })
  }
  const existing = await ctx.db.query('planStrategySelections').withIndex('by_plan', (q) => q.eq('planId', planId)).unique()
  if (existing && !belongsTo(existing.owner, owner)) throw new Error('Plan not found')
  if (!strategyVersionId && !analysisRunId) {
    if (existing) await ctx.db.delete(existing._id)
  } else if (existing) {
    await ctx.db.patch(existing._id, { strategyVersionId, analysisRunId })
  } else {
    await ctx.db.insert('planStrategySelections', { owner, planId, strategyVersionId, analysisRunId })
  }
  const revision = plan.revision + 1
  await ctx.db.patch(planId, { revision, updatedAt: Date.now() })
  return revision
} })

export const createUploadUrl = mutation({ args: { planId: v.id('executionPlans') }, handler: async (ctx, { planId }) => {
  const owner = await requireOwner(ctx)
  const plan = await ctx.db.get(planId)
  if (!plan || !belongsTo(plan.owner, owner) || plan.status !== 'draft') throw new Error('Draft plan not found')
  const now = Date.now()
  const pending = await ctx.db.query('pendingPlanUploads').withIndex('by_plan', (q) => q.eq('planId', planId)).collect()
  for (const row of pending) if (row.expiresAt <= now && belongsTo(row.owner, owner)) await ctx.db.delete(row._id)
  if (pending.filter((row) => row.expiresAt > now && belongsTo(row.owner, owner)).length >= 5) throw new Error('Finish or wait for an existing upload before starting another.')
  const uploadUrl = await ctx.storage.generateUploadUrl()
  const reservationId = await ctx.db.insert('pendingPlanUploads', { owner, planId, createdAt: now, expiresAt: now + UPLOAD_RESERVATION_MS })
  return { uploadUrl, reservationId }
} })

export const add = mutation({ args: { planId: v.id('executionPlans'), reservationId: v.id('pendingPlanUploads'), storageId: v.id('_storage'), previewBase64: v.string() }, handler: async (ctx, { planId, reservationId, storageId, previewBase64 }) => {
  const owner = await requireOwner(ctx)
  const reservation = await ctx.db.get(reservationId)
  if (!reservation || !belongsTo(reservation.owner, owner) || reservation.planId !== planId) throw new Error('Upload reservation not found')
  const images = await ctx.db.query('planImages').withIndex('by_plan', (q) => q.eq('planId', planId)).collect()
  const plan = await ctx.db.get(planId)
  const discardUpload = async (message: string) => {
    await ctx.storage.delete(storageId)
    await ctx.db.delete(reservationId)
    return { error: message }
  }
  if (!plan || !belongsTo(plan.owner, owner) || plan.status !== 'draft') return await discardUpload('Draft plan not found')
  if (reservation.expiresAt <= Date.now()) return await discardUpload('Upload expired. Choose the chart again.')
  if (images.filter((image) => belongsTo(image.owner, owner)).length >= 5) return await discardUpload('A draft can have at most five images.')
  const metadata = await ctx.db.system.get('_storage', storageId)
  if (!metadata || metadata.size <= 0 || metadata.size > MAX_IMAGE_BYTES || !['image/png', 'image/jpeg', 'image/webp'].includes(metadata.contentType ?? '')) return await discardUpload('Choose a PNG, JPEG, or WebP chart image smaller than 8 MB.')
  if (previewBase64.length > 620_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(previewBase64)) return await discardUpload('Could not prepare the chart preview. Please choose it again.')
  let previewBytes: Uint8Array
  try { previewBytes = Uint8Array.from(atob(previewBase64), (character) => character.charCodeAt(0)) } catch { return await discardUpload('Could not prepare the chart preview. Please choose it again.') }
  if (previewBytes.length > MAX_PREVIEW_BYTES || previewBytes.length < 3 || previewBytes[0] !== 0xff || previewBytes[1] !== 0xd8 || previewBytes[2] !== 0xff) return await discardUpload('Could not prepare the chart preview. Please choose it again.')
  const original = await ctx.storage.get(storageId)
  const bytes = original && new Uint8Array(await original.arrayBuffer())
  if (!bytes || !hasImageSignature(bytes, metadata.contentType ?? '')) return await discardUpload('The selected file is not a supported image.')
  const previewBuffer = new ArrayBuffer(previewBytes.length)
  new Uint8Array(previewBuffer).set(previewBytes)
  const previewStorageId = await ctx.storage.store(new Blob([previewBuffer], { type: 'image/jpeg' }))
  const imageId = await ctx.db.insert('planImages', { owner, planId, storageId, previewStorageId, mimeType: metadata.contentType as 'image/png' | 'image/jpeg' | 'image/webp', size: metadata.size, createdAt: Date.now() })
  await ctx.db.delete(reservationId)
  return { imageId }
} })

export const remove = mutation({ args: { imageId: v.id('planImages') }, handler: async (ctx, { imageId }) => {
  const owner = await requireOwner(ctx)
  const image = await ctx.db.get(imageId)
  const plan = image && await ctx.db.get(image.planId)
  if (!image || !plan || !belongsTo(image.owner, owner) || !belongsTo(plan.owner, owner) || plan.status !== 'draft') throw new Error('Draft image not found')
  await ctx.storage.delete(image.storageId)
  await ctx.storage.delete(image.previewStorageId)
  const analyses = await ctx.db.query('planAnalysisRuns').withIndex('by_plan', (q) => q.eq('planId', plan._id)).collect()
  const removedAnalysisIds = new Set(analyses.filter((analysis) => analysis.imageId === imageId && belongsTo(analysis.owner, owner)).map((analysis) => analysis._id))
  for (const analysisId of removedAnalysisIds) await ctx.db.delete(analysisId)
  const selection = await ctx.db.query('planStrategySelections').withIndex('by_plan', (q) => q.eq('planId', plan._id)).unique()
  if (selection && belongsTo(selection.owner, owner) && selection.analysisRunId && removedAnalysisIds.has(selection.analysisRunId)) {
    if (selection.strategyVersionId) await ctx.db.patch(selection._id, { analysisRunId: undefined })
    else await ctx.db.delete(selection._id)
  }
  await ctx.db.delete(imageId)
} })

export const owned = internalQuery({ args: { owner: v.string(), imageId: v.id('planImages') }, handler: async (ctx, { owner, imageId }) => {
  const image = await ctx.db.get(imageId)
  const plan = image && await ctx.db.get(image.planId)
  return image && plan && belongsTo(image.owner, owner) && belongsTo(plan.owner, owner) ? { storageId: image.storageId, previewStorageId: image.previewStorageId, mimeType: image.mimeType, size: image.size, planId: image.planId, status: plan.status } : null
} })

export const get = action({ args: { imageId: v.id('planImages') }, handler: async (ctx, { imageId }): Promise<string | null> => {
  const owner = await requireOwner(ctx)
  const image = await ctx.runQuery((internal as any).planImages.owned, { owner, imageId }) as { previewStorageId: import('./_generated/dataModel').Id<'_storage'> } | null
  if (!image) return null
  const blob = await ctx.storage.get(image.previewStorageId)
  if (!blob || blob.type !== 'image/jpeg' || blob.size > MAX_PREVIEW_BYTES) return null
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  return `data:image/jpeg;base64,${btoa(binary)}`
} })

export const strategyContext = internalQuery({ args: { owner: v.string(), versionId: v.id('strategyVersions') }, handler: async (ctx, { owner, versionId }) => {
  const version = await ctx.db.get(versionId)
  const strategy = version && await ctx.db.get(version.strategyId)
  if (!version || !strategy || !belongsTo(version.owner, owner) || !belongsTo(strategy.owner, owner)) throw new Error('Strategy version not found')
  return { name: version.name, description: version.description, rules: version.rules, signals: version.signals, version: version.version }
} })

export const analyze = action({ args: { imageId: v.id('planImages'), strategyVersionId: v.optional(v.id('strategyVersions')), provider: v.string(), model: v.string() }, handler: async (ctx, { imageId, strategyVersionId, provider, model }) => {
  const owner = await requireOwner(ctx)
  const refs = (internal as any).planImages
  const image = await ctx.runQuery(refs.owned, { owner, imageId }) as { storageId: import('./_generated/dataModel').Id<'_storage'>; mimeType: 'image/png' | 'image/jpeg' | 'image/webp'; size: number; planId: import('./_generated/dataModel').Id<'executionPlans'>; status: string } | null
  if (!image || image.status !== 'draft') throw new Error('Plan image not found in an editable draft')
  const strategy = strategyVersionId ? await ctx.runQuery(refs.strategyContext, { owner, versionId: strategyVersionId }) : null
  const keyRecord = await ctx.runQuery((internal as any).providerKeys.readInternal, { owner, provider }) as { owner: string; provider: string; ciphertext: string; iv: string } | null
  if (!keyRecord) throw new Error(`Add a ${provider} API key in Settings first.`)
  const key = await decryptKey(keyRecord)
  const blob = await ctx.storage.get(image.storageId)
  if (!blob || blob.type !== image.mimeType || blob.size !== image.size || blob.size > MAX_IMAGE_BYTES) throw new Error('Plan image is unavailable')
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const suggestions = await analyzeChart(provider, model, { image: bytes, mimeType: image.mimeType, strategy: strategy ?? undefined, apiKey: key })
  return { provider, model, suggestions }
} })

function hasImageSignature(bytes: Uint8Array, mimeType: string) {
  if (mimeType === 'image/png') return bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 && bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a
  if (mimeType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mimeType === 'image/webp') return bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  return false
}
