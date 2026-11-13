import { v } from 'convex/values'
import { action, internalQuery, mutation, query } from './_generated/server'
import { internal } from './_generated/api'
import type { Doc } from './_generated/dataModel'
import { requireOwner, belongsTo } from './identity'
import { buildPrintChart } from '../src/domain/printChart'

function chartTrade(trade: Doc<'journalTrades'>, executions: Doc<'tradeExecutions'>[]) {
  return { id: String(trade._id), date: trade.date, ...(trade.exitDate ? { exitDate: trade.exitDate } : {}), pair: trade.pair, side: trade.side, lots: trade.lots, entry: trade.entry, exit: trade.exit, entryTime: trade.entryTime, exitTime: trade.exitTime, commission: trade.commission, swap: trade.swap, setup: trade.setup, tags: [], note: '', executions: executions.map(({ date, time, action, price, lots }) => ({ ...(date ? { date } : {}), time, action, price, lots })) }
}

// Browser capture work contains only candle data the connector has validated
// and only rows belonging to the authenticated owner.
export const captureQueue = query({ args: { refresh: v.optional(v.number()) }, handler: async (ctx) => {
  const owner = await requireOwner(ctx)
  const now = Date.now()
  const [ready, retry, rendering] = await Promise.all([
    ctx.db.query('printJobs').withIndex('by_owner_status', (q) => q.eq('owner', owner).eq('status', 'ready_to_render')).take(10),
    ctx.db.query('printJobs').withIndex('by_owner_status', (q) => q.eq('owner', owner).eq('status', 'retry_wait')).take(10),
    ctx.db.query('printJobs').withIndex('by_owner_status', (q) => q.eq('owner', owner).eq('status', 'rendering')).take(10),
  ])
  const candidates = [...ready, ...retry.filter((job) => (job.nextAttemptAt ?? 0) <= now), ...rendering.filter((job) => (job.leaseUntil ?? 0) <= now)].sort((a, b) => a.createdAt - b.createdAt)
  const pending = []
  for (const job of candidates) {
    const print = await ctx.db.get(job.printId)
    if (!print || !print.candles?.length || print.status !== 'pending_capture') continue
    const trade = await ctx.db.get(print.tradeId)
    if (!trade || trade.accountId !== print.accountId || !belongsTo(trade.owner, owner) || !belongsTo(print.owner, owner)) continue
    const executions = await ctx.db.query('tradeExecutions').withIndex('by_owner_trade', (q) => q.eq('owner', print.owner).eq('tradeId', trade._id)).collect()
    pending.push({ printId: print._id, tradeId: trade._id, pair: trade.pair, date: trade.date, ...(trade.exitDate ? { exitDate: trade.exitDate } : {}), side: trade.side, lots: trade.lots, entry: trade.entry, exit: trade.exit, entryTime: trade.entryTime, exitTime: trade.exitTime, commission: trade.commission, swap: trade.swap, setup: trade.setup, brokerSymbol: trade.brokerSymbol, executions: executions.map(({ date, time, action, price, lots }) => ({ ...(date ? { date } : {}), time, action, price, lots })), candles: print.candles, sourceRetrievedAt: print.sourceRetrievedAt, coverage: print.coverage })
    if (pending.length >= 3) break
  }
  return pending
} })

export const claimCapture = mutation({ args: { printId: v.id('tradePrints'), leaseToken: v.string() }, handler: async (ctx, { printId, leaseToken }) => {
  const owner = await requireOwner(ctx)
  if (!/^[0-9a-f]{32,64}$/.test(leaseToken)) throw new Error('Invalid capture lease')
  const print = await ctx.db.get(printId)
  if (!print || !belongsTo(print.owner, owner)) throw new Error('Print not found')
  const account = await ctx.db.get(print.accountId)
  if (!account || !belongsTo(account.owner, owner)) throw new Error('Print not found')
  const job = await ctx.db.query('printJobs').withIndex('by_print', (q) => q.eq('printId', printId)).unique()
  if (!job || job.owner !== print.owner || !print.candles?.length || print.status !== 'pending_capture') throw new Error('Print capture is not ready')
  const now = Date.now()
  const claimable = job.status === 'ready_to_render' || (job.status === 'retry_wait' && (job.nextAttemptAt ?? 0) <= now) || (job.status === 'rendering' && (job.leaseUntil ?? 0) <= now)
  if (!claimable) throw new Error('Print capture is already claimed')
  const attempts = job.attempts ?? 0
  if (attempts >= 3) {
    await ctx.db.patch(job._id, { status: 'failed', leaseToken: undefined, leaseUntil: undefined, errorCode: job.errorCode ?? 'capture_failed' })
    await ctx.db.patch(print._id, { status: 'failed' })
    return null
  }
  await ctx.db.patch(job._id, { status: 'rendering', attempts: attempts + 1, leaseToken, leaseUntil: now + 120_000, nextAttemptAt: undefined, errorCode: undefined, captureTime: undefined })
  return { claimed: true }
} })

export const timestampCapture = mutation({ args: { printId: v.id('tradePrints'), leaseToken: v.string() }, handler: async (ctx, { printId, leaseToken }) => {
  const owner = await requireOwner(ctx)
  const print = await ctx.db.get(printId)
  if (!print || !belongsTo(print.owner, owner)) throw new Error('Print not found')
  const job = await ctx.db.query('printJobs').withIndex('by_print', (q) => q.eq('printId', printId)).unique()
  if (!job || job.status !== 'rendering' || job.leaseToken !== leaseToken || (job.leaseUntil ?? 0) <= Date.now()) throw new Error('Capture lease expired')
  const capturedAt = Date.now()
  await ctx.db.patch(job._id, { captureTime: capturedAt })
  return capturedAt
} })

export const completeCapture = mutation({ args: { printId: v.id('tradePrints'), leaseToken: v.string(), pngBase64: v.string(), capturedAt: v.number() }, handler: async (ctx, args) => {
  const owner = await requireOwner(ctx)
  const print = await ctx.db.get(args.printId)
  if (!print || !belongsTo(print.owner, owner)) throw new Error('Print not found')
  const job = await ctx.db.query('printJobs').withIndex('by_print', (q) => q.eq('printId', args.printId)).unique()
  const validLease = job?.status === 'rendering' && job.leaseToken === args.leaseToken && job.captureTime === args.capturedAt && (job.leaseUntil ?? 0) > Date.now()
  if (!validLease || args.pngBase64.length > 900_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(args.pngBase64)) throw new Error('Captured image could not be saved')
  const binary = atob(args.pngBase64)
  if (binary.length < 8 || binary.length > 675_000 || binary.slice(0, 8) !== '\x89PNG\r\n\x1a\n') throw new Error('Captured image is not a supported PNG')
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index)
  const storageId = await ctx.storage.store(new Blob([bytes], { type: 'image/png' }))
  const previous = print.imageStorageId
  await ctx.db.patch(print._id, { status: 'captured', imageStorageId: storageId, capturedAt: args.capturedAt })
  await ctx.db.patch(job!._id, { status: 'complete', leaseToken: undefined, leaseUntil: undefined, captureTime: undefined, errorCode: undefined })
  if (previous && previous !== storageId) await ctx.storage.delete(previous)
} })

export const failCapture = mutation({ args: { printId: v.id('tradePrints'), leaseToken: v.string(), reason: v.union(v.literal('invalid_chart'), v.literal('render_failed'), v.literal('upload_failed')) }, handler: async (ctx, { printId, leaseToken, reason }) => {
  const owner = await requireOwner(ctx)
  const print = await ctx.db.get(printId)
  if (!print || !belongsTo(print.owner, owner)) throw new Error('Print not found')
  const job = await ctx.db.query('printJobs').withIndex('by_print', (q) => q.eq('printId', printId)).unique()
  if (!job || job.status !== 'rendering' || job.leaseToken !== leaseToken) throw new Error('Capture lease expired')
  const attempts = job.attempts ?? 1
  const retry = attempts < 3
  const delayMs = Math.min(300_000, 30_000 * (2 ** Math.max(0, attempts - 1)))
  await ctx.db.patch(job._id, { status: retry ? 'retry_wait' : 'failed', nextAttemptAt: retry ? Date.now() + delayMs : undefined, leaseToken: undefined, leaseUntil: undefined, captureTime: undefined, errorCode: reason })
  if (!retry) await ctx.db.patch(print._id, { status: 'failed' })
} })

export const artifact = query({ args: { tradeId: v.id('journalTrades') }, handler: async (ctx, { tradeId }) => {
  const owner = await requireOwner(ctx)
  const print = await ctx.db.query('tradePrints').withIndex('by_trade', (q) => q.eq('tradeId', tradeId)).unique()
  const trade = await ctx.db.get(tradeId)
  if (!print || !trade || trade.accountId !== print.accountId || !belongsTo(print.owner, owner) || !belongsTo(trade.owner, owner)) return null
  const account = await ctx.db.get(print.accountId)
  if (!account || !belongsTo(account.owner, owner)) return null
  const executions = await ctx.db.query('tradeExecutions').withIndex('by_owner_trade', (q) => q.eq('owner', print.owner).eq('tradeId', tradeId)).collect()
  const capturedAt = print.capturedAt
  const sourceRetrievedAt = print.sourceRetrievedAt
  const chart = print.candles?.length && sourceRetrievedAt !== undefined ? buildPrintChart(chartTrade(trade, executions), print.candles, 'mt5_candles', new Date(sourceRetrievedAt).toISOString()) : null
  return { status: print.status, imageAvailable: !!print.imageStorageId, capturedAt, sourceRetrievedAt, coverage: print.coverage, chart }
} })

export const ownedImage = internalQuery({ args: { owner: v.string(), tradeId: v.id('journalTrades') }, handler: async (ctx, { owner, tradeId }) => {
  const print = await ctx.db.query('tradePrints').withIndex('by_trade', (q) => q.eq('tradeId', tradeId)).unique()
  const trade = await ctx.db.get(tradeId)
  const account = print ? await ctx.db.get(print.accountId) : null
  return print && trade && account && trade.accountId === print.accountId && belongsTo(print.owner, owner) && belongsTo(trade.owner, owner) && belongsTo(account.owner, owner) ? print.imageStorageId ?? null : null
} })

// Return bytes only to the signed-in owner. Storage URLs are bearer links and
// are deliberately never returned to the browser.
export const getImage = action({ args: { tradeId: v.id('journalTrades') }, handler: async (ctx, { tradeId }) => {
  const owner = await requireOwner(ctx)
  const storageId = await ctx.runQuery(internal.prints.ownedImage, { owner, tradeId })
  if (!storageId) return null
  const blob = await ctx.storage.get(storageId)
  if (!blob || blob.type !== 'image/png' || blob.size > 3_000_000) return null
  const bytes = new Uint8Array(await blob.arrayBuffer())
  let binary = ''
  for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
  return `data:image/png;base64,${btoa(binary)}`
} })
