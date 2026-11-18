import { httpRouter } from 'convex/server'
import { auth } from './auth'
import { httpAction } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { internal } from './_generated/api'
const http = httpRouter()
auth.addHttpRoutes(http)
const tokenHash = async (authorization: string) => Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(authorization.slice(7)))), (byte) => byte.toString(16).padStart(2, '0')).join('')
const lease = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (byte) => byte.toString(16).padStart(2, '0')).join('')
http.route({ path: '/mt5/sync', method: 'POST', handler: httpAction(async (ctx, request) => {
  const authorization = request.headers.get('authorization') ?? ''
  if (!/^Bearer [0-9a-f]{64}$/.test(authorization)) return new Response('Unauthorized', { status: 401 })
  try {
    const body = await request.text(); if (body.length > 1000000) return new Response('Batch too large', { status: 413 })
    const data: unknown = JSON.parse(body)
    if (!data || typeof data !== 'object' || !('brokerKey' in data) || typeof data.brokerKey !== 'string' || !('trades' in data) || !Array.isArray(data.trades) || !data.trades.length || data.trades.length > 100) return new Response('Invalid batch', { status: 400 })
    const hash = await tokenHash(authorization)
    const result = await ctx.runMutation(internal.connector.importDeals, { hash, brokerKey: data.brokerKey, trades: data.trades })
    return Response.json(result)
  } catch { return new Response('Unable to import batch. Check token and trade data.', { status: 400 }) }
}) })
http.route({ path: '/mt5/prints/claim', method: 'POST', handler: httpAction(async (ctx, request) => {
  const authorization = request.headers.get('authorization') ?? ''
  if (!/^Bearer [0-9a-f]{64}$/.test(authorization)) return new Response('Unauthorized', { status: 401 })
  try {
    const text = await request.text(); if (text.length > 2048) return new Response('Request too large', { status: 413 })
    const data: unknown = JSON.parse(text)
    if (!data || typeof data !== 'object' || !('brokerKey' in data) || typeof data.brokerKey !== 'string' || !/^[0-9a-f]{64}$/.test(data.brokerKey)) return new Response('Invalid request', { status: 400 })
    const result = await ctx.runMutation(internal.connector.claimNextPrint, { hash: await tokenHash(authorization), brokerKey: data.brokerKey, leaseToken: lease() })
    return Response.json(result)
  } catch { return new Response('Unable to claim chart work.', { status: 400 }) }
}) })
http.route({ path: '/mt5/prints/candles', method: 'POST', handler: httpAction(async (ctx, request) => {
  const authorization = request.headers.get('authorization') ?? ''
  if (!/^Bearer [0-9a-f]{64}$/.test(authorization)) return new Response('Unauthorized', { status: 401 })
  try {
    const text = await request.text(); if (text.length > 800_000) return new Response('Candle batch too large', { status: 413 })
    const data: unknown = JSON.parse(text)
    if (!data || typeof data !== 'object' || !('brokerKey' in data) || typeof data.brokerKey !== 'string' || !/^[0-9a-f]{64}$/.test(data.brokerKey) || !('jobId' in data) || typeof data.jobId !== 'string' || !('leaseToken' in data) || typeof data.leaseToken !== 'string' || !('sourceKey' in data) || typeof data.sourceKey !== 'string' || !('symbol' in data) || typeof data.symbol !== 'string' || !('quality' in data) || !['complete', 'partial', 'unavailable'].includes(String(data.quality)) || !('candles' in data) || !Array.isArray(data.candles) || data.candles.length > 5000) return new Response('Invalid candle data', { status: 400 })
    const candles = data.candles as { time: string; open: number; high: number; low: number; close: number }[]
    const result = await ctx.runMutation(internal.connector.storePrintCandles, { hash: await tokenHash(authorization), brokerKey: data.brokerKey, jobId: data.jobId as Id<'printJobs'>, leaseToken: data.leaseToken, sourceKey: data.sourceKey, symbol: data.symbol, quality: data.quality as 'complete' | 'partial' | 'unavailable', candles })
    return Response.json(result)
  } catch { return new Response('Unable to save candle data. Check the connector token and chart window.', { status: 400 }) }
}) })
export default http
