import { useMutation, useQuery } from 'convex/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { buildPrintChart, type PrintChartSpec, type PrintCandle } from './domain/printChart'
import PrintChart from './PrintChart'

type CaptureJob = { printId: Id<'tradePrints'>; tradeId: Id<'journalTrades'>; pair: 'EUR/USD' | 'GBP/USD' | 'AUD/USD' | 'XAU/USD'; brokerSymbol?: string; date: string; exitDate?: string; side: 'Long' | 'Short'; lots: number; entry: number; exit: number; entryTime: string; exitTime: string; commission: number; swap: number; setup: string; executions: { date?: string; time: string; action: 'Buy' | 'Sell'; price: number; lots: number }[]; candles: PrintCandle[]; sourceRetrievedAt?: number }
type Capture = (capturedAt?: string) => Promise<Blob>

function toBase64(blob: Blob) {
  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer)
    if (bytes.length > 675_000) throw new Error('image_too_large')
    let binary = ''
    for (let start = 0; start < bytes.length; start += 0x8000) binary += String.fromCharCode(...bytes.subarray(start, start + 0x8000))
    return btoa(binary)
  })
}
export default function TradePrintCaptureWorker({ enabled }: { enabled: boolean }) {
  const [refresh, setRefresh] = useState(0)
  const [active, setActive] = useState<{ job: CaptureJob; leaseToken: string; spec: PrintChartSpec } | null>(null)
  const [capture, setCapture] = useState<Capture | null>(null)
  const inFlight = useRef(false)
  const processed = useRef<string | null>(null)
  const jobs = useQuery(api.prints.captureQueue, enabled ? { refresh } : 'skip')
  const claim = useMutation(api.prints.claimCapture)
  const timestamp = useMutation(api.prints.timestampCapture)
  const complete = useMutation(api.prints.completeCapture)
  const fail = useMutation(api.prints.failCapture)

  useEffect(() => {
    if (!enabled) return
    const timer = window.setInterval(() => setRefresh((value) => value + 1), 15_000)
    return () => window.clearInterval(timer)
  }, [enabled])

  useEffect(() => {
    const job = jobs?.[0]
    if (!enabled || !job || active || inFlight.current) return
    const leaseToken = crypto.randomUUID().replaceAll('-', '')
    inFlight.current = true
    void (async () => {
      let claimed = false
      try {
        const result = await claim({ printId: job.printId, leaseToken })
        if (!result) return
        claimed = true
        const sourceRetrievedAt = job.sourceRetrievedAt
        if (sourceRetrievedAt === undefined) throw new Error('invalid_chart')
        const spec = buildPrintChart({ id: String(job.tradeId), source: 'real', date: job.date, ...(job.exitDate ? { exitDate: job.exitDate } : {}), pair: job.pair, brokerSymbol: job.brokerSymbol, side: job.side, lots: job.lots, entry: job.entry, exit: job.exit, entryTime: job.entryTime, exitTime: job.exitTime, commission: job.commission, swap: job.swap, setup: job.setup, tags: [], note: '', executions: job.executions }, job.candles, 'mt5_candles', new Date(sourceRetrievedAt).toISOString())
        setCapture(null)
        setActive({ job, leaseToken, spec })
      } catch {
        // Claim/build errors are stored as a redacted reason; capture retries
        // are capped by the server-side attempt counter.
        if (claimed) await fail({ printId: job.printId, leaseToken, reason: 'invalid_chart' }).catch(() => undefined)
      } finally {
        inFlight.current = false
      }
    })()
  }, [enabled, jobs, active, claim, fail])

  const onCaptureReady = useCallback((ready: Capture | null) => setCapture(() => ready), [])

  useEffect(() => {
    if (!active || !capture || inFlight.current || processed.current === String(active.job.printId)) return
    inFlight.current = true
    processed.current = String(active.job.printId)
    void (async () => {
      try {
        const capturedAt = await timestamp({ printId: active.job.printId, leaseToken: active.leaseToken })
        const blob = await capture(new Date(capturedAt).toISOString())
        const pngBase64 = await toBase64(blob)
        await complete({ printId: active.job.printId, leaseToken: active.leaseToken, pngBase64, capturedAt })
      } catch (error) {
        const reason = error instanceof Error && error.message === 'invalid_chart' ? 'invalid_chart' : 'render_failed'
        await fail({ printId: active.job.printId, leaseToken: active.leaseToken, reason }).catch(() => undefined)
      } finally {
        processed.current = null
        inFlight.current = false
        setCapture(null)
        setActive(null)
      }
    })()
  }, [active, capture, timestamp, complete, fail])

  return active ? <div className="print-capture-stage" aria-hidden="true" inert><PrintChart spec={active.spec} onCaptureReady={onCaptureReady}/></div> : null
}

