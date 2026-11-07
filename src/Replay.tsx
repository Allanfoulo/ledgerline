import { useEffect, useState } from 'react'
import type { TradeWithPnl } from './types'
import { useBackend } from './Backend'

type Candle = { time: string; open: number; high: number; low: number; close: number }

export default function Replay({ trade }: { trade: TradeWithPnl }) {
  const backend = useBackend()
  const [candles, setCandles] = useState<Candle[]>([])
  const [position, setPosition] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [status, setStatus] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    setCandles([]); setPosition(0); setPlaying(false); setStatus('')
  }, [trade.id])

  useEffect(() => {
    if (!playing || !candles.length) return
    const timer = window.setInterval(() => setPosition((current) => {
      if (current >= candles.length - 1) { setPlaying(false); return current }
      return current + 1
    }), 1000 / speed)
    return () => window.clearInterval(timer)
  }, [playing, speed, candles.length])

  async function loadCandles() {
    if (!backend.configured || !backend.authenticated || !backend.keyConfigured) { setStatus('Connect Convex, sign in, and add your Twelve Data key in Settings first.'); return }
    const duration = Date.parse(`${trade.exitDate ?? trade.date}T${trade.exitTime}:00Z`) - Date.parse(`${trade.date}T${trade.entryTime}:00Z`)
    if (duration > 72 * 3600000) { setStatus('Replay currently supports trades up to 72 hours. This trade remains available in your journal.'); return }
    setLoading(true); setPlaying(false); setCandles([]); setStatus('')
    try {
      const rows = await backend.candles({ pair: trade.pair, date: trade.date, ...(trade.exitDate ? { exitDate: trade.exitDate } : {}), entryTime: trade.entryTime, exitTime: trade.exitTime })
      if (!rows.length) throw new Error('unavailable')
      setCandles(rows); setPosition(0)
    } catch {
      setStatus('Could not load candles. Check your API key, provider access, date coverage and network connection, then try again.')
    } finally { setLoading(false) }
  }

  const visible = candles.slice(0, position + 1)
  const markerTimes = [{ label: 'Entry', time: `${trade.date}T${trade.entryTime}:00`, price: trade.entry }, { label: 'Exit', time: `${trade.exitDate ?? trade.date}T${trade.exitTime}:00`, price: trade.exit }]
  const markers = markerTimes.map((marker) => ({ ...marker, index: candles.findIndex((candle) => candle.time >= marker.time) })).filter((marker) => marker.index >= 0 && marker.index <= position)
  const prices = [...visible.flatMap((candle) => [candle.high, candle.low]), ...markers.map((marker) => marker.price)]
  const min = Math.min(...prices); const max = Math.max(...prices); const range = max - min || 0.0001
  const y = (price: number) => 18 + (max - price) / range * 190
  const x = (index: number) => 25 + (index / Math.max(candles.length - 1, 1)) * 650
  const candleWidth = Math.max(1, Math.min(8, 500 / Math.max(candles.length, 1)))

  return <section className="panel replay-panel" aria-label="Trade replay">
    <div className="panel-heading"><div><h2>Trade replay</h2><p>Historical one-minute candles · times in UTC</p></div></div>
    <div className="replay-body">
      <p className="replay-notice">{trade.source === 'real' ? 'Your fills come from the trade you entered. Broker prices may differ from the historical data provider.' : trade.historicalAligned ? 'Sample fills use the open of matching historical one-minute candles.' : 'This sample trade has invented fills. To align it with historical prices, use Align sample trades in Settings.'} One-minute candles do not show movement within each minute.</p>
      <div className="replay-load"><button className="button button-primary" onClick={loadCandles} disabled={loading}>{loading ? 'Loading…' : 'Load historical candles'}</button></div>
      <p className="replay-hint">Manage your Twelve Data key in Settings. Trade times are interpreted as UTC.</p>
      {status && <p className="replay-error" role="alert">{status}</p>}
      {candles.length > 0 && <>
        <div className="replay-chart-wrap"><svg className="replay-chart" viewBox="0 0 700 235" role="img" aria-label={`Candlestick replay for ${trade.pair}, ${position + 1} of ${candles.length} minutes shown`}>
          {[0, 1, 2, 3].map((i) => <g key={i}><line x1="25" x2="675" y1={18 + i * 190 / 3} y2={18 + i * 190 / 3} className="chart-gridline"/><text x="25" y={14 + i * 190 / 3} className="chart-axis-label">{(max - range * i / 3).toFixed(5)}</text></g>)}
          {visible.map((candle, index) => <g key={candle.time} className={candle.close >= candle.open ? 'replay-up' : 'replay-down'}><line x1={x(index)} x2={x(index)} y1={y(candle.high)} y2={y(candle.low)}/><rect x={x(index) - candleWidth / 2} y={Math.min(y(candle.open), y(candle.close))} width={candleWidth} height={Math.max(1, Math.abs(y(candle.open) - y(candle.close)))}/></g>)}
          {markers.map((marker) => <g key={marker.label}><circle cx={x(marker.index)} cy={y(marker.price)} r="4" className="replay-marker"/><text x={Math.min(x(marker.index) + 6, 625)} y={Math.max(y(marker.price) - 7, 12)} className="replay-marker-label">{marker.label} {marker.price.toFixed(5)}</text></g>)}
        </svg></div>
        <div className="replay-controls"><button className="button button-quiet" onClick={() => { if (position === candles.length - 1) setPosition(0); setPlaying(!playing) }}>{playing ? 'Pause' : 'Play'}</button><button className="button button-quiet" onClick={() => { setPlaying(false); setPosition(Math.max(0, position - 1)) }} disabled={position === 0}>Back</button><button className="button button-quiet" onClick={() => { setPlaying(false); setPosition(Math.min(candles.length - 1, position + 1)) }} disabled={position === candles.length - 1}>Step</button><label>Speed <select value={speed} onChange={(event) => setSpeed(Number(event.target.value))}><option value={1}>1×</option><option value={2}>2×</option><option value={5}>5×</option></select></label><span>{candles[position].time.replace('T', ' ')} UTC</span></div>
        <input className="replay-timeline" aria-label="Replay timeline" type="range" min={0} max={candles.length - 1} value={position} onChange={(event) => { setPlaying(false); setPosition(Number(event.target.value)) }}/>
      </>}
    </div>
  </section>
}
