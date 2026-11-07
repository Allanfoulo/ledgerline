import { httpRouter } from 'convex/server'
import { auth } from './auth'
import { httpAction } from './_generated/server'
import { internal } from './_generated/api'
const http = httpRouter()
auth.addHttpRoutes(http)
http.route({ path: '/mt5/sync', method: 'POST', handler: httpAction(async (ctx, request) => {
  const authorization = request.headers.get('authorization') ?? ''
  if (!/^Bearer [0-9a-f]{64}$/.test(authorization)) return new Response('Unauthorized', { status: 401 })
  try {
    const body = await request.text(); if (body.length > 1000000) return new Response('Batch too large', { status: 413 })
    const data: unknown = JSON.parse(body)
    if (!data || typeof data !== 'object' || !('brokerKey' in data) || typeof data.brokerKey !== 'string' || !('trades' in data) || !Array.isArray(data.trades) || !data.trades.length || data.trades.length > 100) return new Response('Invalid batch', { status: 400 })
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(authorization.slice(7)))), (byte) => byte.toString(16).padStart(2, '0')).join('')
    const result = await ctx.runMutation(internal.connector.importDeals, { hash, brokerKey: data.brokerKey, trades: data.trades })
    return Response.json(result)
  } catch { return new Response('Unable to import batch. Check token and trade data.', { status: 400 }) }
}) })
export default http
