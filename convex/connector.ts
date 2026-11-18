import { v } from 'convex/values'
import { action, internalMutation, internalQuery, mutation, query } from './_generated/server'
import { internal } from './_generated/api'
import { tradeFingerprint, validateTrade } from '../src/domain/trade'
import { buildPrintChart } from '../src/domain/printChart'
import { belongsTo, requireOwner } from './identity'

const hex = (bytes: Uint8Array) => Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
const fill = v.object({ date: v.optional(v.string()), time: v.string(), action: v.union(v.literal('Buy'), v.literal('Sell')), price: v.number(), lots: v.number() })
const incoming = v.object({ sourceKey: v.string(), brokerSymbol: v.optional(v.string()), date: v.string(), exitDate: v.optional(v.string()), pair: v.union(v.literal('EUR/USD'), v.literal('GBP/USD'), v.literal('AUD/USD'), v.literal('XAU/USD')), side: v.union(v.literal('Long'), v.literal('Short')), lots: v.number(), entry: v.number(), exit: v.number(), entryTime: v.string(), exitTime: v.string(), commission: v.number(), swap: v.number(), setup: v.string(), executions: v.array(fill) })

export const ownedAccount = internalQuery({ args: { owner: v.string(), accountId: v.id('tradingAccounts') }, handler: async (ctx, { owner, accountId }) => { const account = await ctx.db.get(accountId); return account && belongsTo(account.owner, owner) ? account.owner : null } })
export const status = query({ args: { accountId: v.id('tradingAccounts') }, handler: async (ctx, { accountId }) => {
  const user = await requireOwner(ctx)
  const account = await ctx.db.get(accountId); if (!account || !belongsTo(account.owner, user)) throw new Error('Account not found')
  const token = await ctx.db.query('connectorTokens').withIndex('by_owner_account', (q) => q.eq('owner', account.owner).eq('accountId', accountId)).unique()
  return token ? { expiresAt: token.expiresAt } : null
} })
export const storeToken = internalMutation({ args: { owner: v.string(), accountId: v.id('tradingAccounts'), hash: v.string(), createdAt: v.number(), expiresAt: v.number() }, handler: async (ctx, args) => {
  const account = await ctx.db.get(args.accountId); if (!account || account.owner !== args.owner) throw new Error('Account not found')
  const old = await ctx.db.query('connectorTokens').withIndex('by_owner_account', (q) => q.eq('owner', args.owner).eq('accountId', args.accountId)).unique()
  if (old) await ctx.db.delete(old._id)
  await ctx.db.insert('connectorTokens', args)
} })
export const issue = action({ args: { accountId: v.id('tradingAccounts') }, handler: async (ctx, { accountId }) => {
  const user = await requireOwner(ctx)
  const accountOwner = await ctx.runQuery(internal.connector.ownedAccount, { owner: user, accountId })
  if (!accountOwner) throw new Error('Account not found')
  const token = hex(crypto.getRandomValues(new Uint8Array(32)))
  const hash = hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))))
  const createdAt = Date.now(); await ctx.runMutation(internal.connector.storeToken, { owner: accountOwner, accountId, hash, createdAt, expiresAt: createdAt + 30 * 86400000 })
  return token
} })
export const revoke = mutation({ args: { accountId: v.id('tradingAccounts') }, handler: async (ctx, { accountId }) => {
  const user = await requireOwner(ctx)
  const account = await ctx.db.get(accountId); if (!account || !belongsTo(account.owner, user)) throw new Error('Account not found')
  const token = await ctx.db.query('connectorTokens').withIndex('by_owner_account', (q) => q.eq('owner', account.owner).eq('accountId', accountId)).unique()
  if (token) await ctx.db.delete(token._id)
} })
export const importDeals = internalMutation({ args: { hash: v.string(), brokerKey: v.string(), trades: v.array(incoming) }, handler: async (ctx, { hash, brokerKey, trades }) => {
  const token = await ctx.db.query('connectorTokens').withIndex('by_hash', (q) => q.eq('hash', hash)).unique()
  if (!token || token.expiresAt <= Date.now()) throw new Error('Unauthorized')
  const account = await ctx.db.get(token.accountId); if (!account || account.owner !== token.owner) throw new Error('Unauthorized')
  if (!/^[0-9a-f]{64}$/.test(brokerKey) || (account.brokerKey && account.brokerKey !== brokerKey)) throw new Error('This journal account is already connected to another MT5 account')
  if (!trades.length || trades.length > 100) throw new Error('Invalid batch')
  if (!account.brokerKey) await ctx.db.patch(account._id, { brokerKey })
  const existing = await ctx.db.query('journalTrades').withIndex('by_owner_account', (q) => q.eq('owner', token.owner).eq('accountId', token.accountId)).collect()
  const knownSources = new Set(existing.flatMap((trade) => trade.sourceKey ? [trade.sourceKey] : []))
  // Preserve conservative matching against manual imports; distinct MT5 position IDs are separate positions.
  const manualFills = new Set(existing.filter((trade) => !trade.sourceKey).map((trade) => trade.fingerprint))
  let inserted = 0; let duplicates = 0
  for (const item of trades) {
    const { sourceKey, brokerSymbol, executions, ...trade } = item
    if (!/^mt5:[0-9a-f]{64}$/.test(sourceKey) || (brokerSymbol !== undefined && !/^[A-Za-z0-9._-]{1,64}$/.test(brokerSymbol)) || validateTrade(trade).length || executions.length < 2 || executions.length > 50) throw new Error('Invalid trade')
    const opening = executions.filter((fill) => fill.action === (trade.side === 'Long' ? 'Buy' : 'Sell')); const closing = executions.filter((fill) => fill.action !== (trade.side === 'Long' ? 'Buy' : 'Sell'))
    const aggregate = (fills: typeof executions) => ({ lots: fills.reduce((sum, fill) => sum + fill.lots, 0), value: fills.reduce((sum, fill) => sum + fill.price * fill.lots, 0) })
    if (executions.some((fill) => !Number.isFinite(fill.price) || fill.price <= 0 || !Number.isFinite(fill.lots) || fill.lots <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(fill.date ?? trade.date) || `${fill.date ?? trade.date}T${fill.time}` < `${trade.date}T${trade.entryTime}` || `${fill.date ?? trade.date}T${fill.time}` > `${trade.exitDate ?? trade.date}T${trade.exitTime}` || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(fill.time))) throw new Error('Invalid execution')
    const open = aggregate(opening); const close = aggregate(closing)
    if (Math.abs(open.lots - trade.lots) > 1e-6 || Math.abs(close.lots - trade.lots) > 1e-6 || Math.abs(open.value / open.lots - trade.entry) > 1e-7 || Math.abs(close.value / close.lots - trade.exit) > 1e-7) throw new Error('Invalid execution totals')
    const fingerprint = tradeFingerprint(trade)
    if (knownSources.has(sourceKey) || manualFills.has(fingerprint)) { duplicates++; continue }
    const tradeId = await ctx.db.insert('journalTrades', { owner: token.owner, accountId: token.accountId, sourceKey, ...(brokerSymbol ? { brokerSymbol } : {}), fingerprint, ...trade })
    for (const execution of executions) await ctx.db.insert('tradeExecutions', { owner: token.owner, accountId: token.accountId, tradeId, ...execution })
    // Queue durable work in the same transaction; no provider or renderer runs here.
    const createdAt = Date.now()
    const printId = await ctx.db.insert('tradePrints', { owner: token.owner, accountId: token.accountId, tradeId, origin: 'mt5', timePrecision: 'minute', status: 'pending_chart', createdAt, schemaVersion: 1 })
    await ctx.db.insert('printJobs', { owner: token.owner, accountId: token.accountId, tradeId, printId, status: 'queued', attempts: 0, createdAt, schemaVersion: 1 })
    knownSources.add(sourceKey); inserted++
  }
  return { inserted, duplicates }
} })

const printCandle = v.object({ time: v.string(), open: v.number(), high: v.number(), low: v.number(), close: v.number() })

// The local MT5 connector is the only candle source in this milestone. It can
// claim work only for the account bound to its hashed connector token.
export const claimNextPrint = internalMutation({ args: { hash: v.string(), brokerKey: v.string(), leaseToken: v.string() }, handler: async (ctx, args) => {
  const token = await ctx.db.query('connectorTokens').withIndex('by_hash', (q) => q.eq('hash', args.hash)).unique()
  const now = Date.now()
  if (!token || token.expiresAt <= now) throw new Error('Unauthorized')
  const account = await ctx.db.get(token.accountId)
  if (!account || account.owner !== token.owner || account.brokerKey !== args.brokerKey) throw new Error('Unauthorized')
  const jobs = await ctx.db.query('printJobs').withIndex('by_owner_account', (q) => q.eq('owner', token.owner).eq('accountId', token.accountId)).collect()
  const candidates = jobs.filter((job) => job.status === 'queued' || (job.status === 'retry_wait' && (job.nextAttemptAt ?? 0) <= now) || (job.status === 'acquiring' && (job.leaseUntil ?? 0) <= now)).sort((a, b) => a.createdAt - b.createdAt)
  for (const job of candidates) {
    const attempts = job.attempts ?? 0
    if (attempts >= 3) {
      await ctx.db.patch(job._id, { status: 'failed', leaseToken: undefined, leaseUntil: undefined, errorCode: job.errorCode ?? 'source_unavailable' })
      await ctx.db.patch(job.printId, { status: 'failed' })
      continue
    }
    const trade = await ctx.db.get(job.tradeId)
    if (!trade || !trade.sourceKey || !trade.brokerSymbol) {
      await ctx.db.patch(job._id, { status: 'needs_data', errorCode: 'trade_source_missing' })
      await ctx.db.patch(job.printId, { status: 'needs_data' })
      continue
    }
    await ctx.db.patch(job._id, { status: 'acquiring', attempts: attempts + 1, leaseToken: args.leaseToken, leaseUntil: now + 120_000, nextAttemptAt: undefined, errorCode: undefined })
    const executions = await ctx.db.query('tradeExecutions').withIndex('by_owner_trade', (q) => q.eq('owner', token.owner).eq('tradeId', trade._id)).collect()
    return { jobId: job._id, leaseToken: args.leaseToken, sourceKey: trade.sourceKey, symbol: trade.brokerSymbol, trade: { date: trade.date, ...(trade.exitDate ? { exitDate: trade.exitDate } : {}), entryTime: trade.entryTime, exitTime: trade.exitTime }, executions: executions.map(({ date, time, action, price, lots }) => ({ ...(date ? { date } : {}), time, action, price, lots })) }
  }
  return null
} })

export const storePrintCandles = internalMutation({ args: { hash: v.string(), brokerKey: v.string(), jobId: v.id('printJobs'), leaseToken: v.string(), sourceKey: v.string(), symbol: v.string(), quality: v.union(v.literal('complete'), v.literal('partial'), v.literal('unavailable')), candles: v.array(printCandle) }, handler: async (ctx, args) => {
  const token = await ctx.db.query('connectorTokens').withIndex('by_hash', (q) => q.eq('hash', args.hash)).unique()
  if (!token || token.expiresAt <= Date.now()) throw new Error('Unauthorized')
  const account = await ctx.db.get(token.accountId)
  const job = await ctx.db.get(args.jobId)
  if (!account || account.owner !== token.owner || account.brokerKey !== args.brokerKey || !job || job.owner !== token.owner || job.accountId !== token.accountId || job.status !== 'acquiring' || job.leaseToken !== args.leaseToken || (job.leaseUntil ?? 0) <= Date.now()) throw new Error('Unauthorized')
  const trade = await ctx.db.get(job.tradeId)
  if (!trade || trade.sourceKey !== args.sourceKey || trade.brokerSymbol !== args.symbol) throw new Error('Invalid print source')
  if (args.quality === 'unavailable' || !args.candles.length) {
    await ctx.db.patch(job._id, { status: 'needs_data', leaseToken: undefined, leaseUntil: undefined, errorCode: 'mt5_history_unavailable' })
    await ctx.db.patch(job.printId, { status: 'needs_data' })
    return { status: 'needs_data' as const }
  }
  if (args.candles.length > 5000) throw new Error('Too many candles')
  const executions = await ctx.db.query('tradeExecutions').withIndex('by_owner_trade', (q) => q.eq('owner', token.owner).eq('tradeId', trade._id)).collect()
  const chartTrade = { id: String(trade._id), date: trade.date, ...(trade.exitDate ? { exitDate: trade.exitDate } : {}), pair: trade.pair, side: trade.side, lots: trade.lots, entry: trade.entry, exit: trade.exit, entryTime: trade.entryTime, exitTime: trade.exitTime, commission: trade.commission, swap: trade.swap, setup: trade.setup, tags: [], note: '', executions: executions.map(({ date, time, action, price, lots }) => ({ ...(date ? { date } : {}), time, action, price, lots })) }
  const sourceRetrievedAt = new Date().toISOString()
  const chart = buildPrintChart(chartTrade, args.candles, 'mt5_candles', sourceRetrievedAt)
  const print = await ctx.db.get(job.printId)
  if (!print || print.owner !== token.owner || print.tradeId !== trade._id) throw new Error('Print not found')
  await ctx.db.patch(print._id, { status: 'pending_capture', candles: chart.candles, sourceRetrievedAt: Date.parse(sourceRetrievedAt), coverage: chart.quality })
  await ctx.db.patch(job._id, { status: 'ready_to_render', leaseToken: undefined, leaseUntil: undefined, errorCode: undefined })
  return { status: 'ready_to_render' as const }
} })
