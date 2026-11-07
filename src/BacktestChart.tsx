import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, LineSeries } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, ISeriesMarkersPluginApi, SeriesMarker, UTCTimestamp, Time } from 'lightweight-charts'
import { replayCandles } from './domain/backtest'
import type { OpenPosition } from './domain/backtest'
import type { TradeInput } from './domain/trade'
import { orderedLine } from './domain/chartDrawing'
import type { ChartPoint } from './domain/chartDrawing'

type Candle = { time: string; open: number; high: number; low: number; close: number }

export default function BacktestChart({ candles, index, pair, interval, date, position, trades, canEnter, onBuy, onSell, onPause, children }: { candles: Candle[]; index: number; pair: string; interval: number; date: string; position: OpenPosition | null; trades: TradeInput[]; canEnter: boolean; onBuy: () => boolean; onSell: () => boolean; onPause: () => void; children: ReactNode }) {
  const shell = useRef<HTMLDivElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const series = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const [fullScreen, setFullScreen] = useState(false)
  const [fallback, setFallback] = useState(false)
  const [hovered, setHovered] = useState<Candle | null>(null)
  const [tool, setTool] = useState<'line' | 'buy' | 'sell' | null>(null)
  const [pendingPoint, setPendingPoint] = useState<ChartPoint | null>(null)
  const [lineCount, setLineCount] = useState(0)
  const [drawingMessage, setDrawingMessage] = useState('')
  const toolRef = useRef<'line' | 'buy' | 'sell' | null>(null)
  const tradeActions = useRef({ onBuy, onSell, canEnter })
  tradeActions.current = { onBuy, onSell, canEnter }
  const pendingRef = useRef<ChartPoint | null>(null)
  const lines = useRef<Array<ISeriesApi<'Line'>>>([])
  const markerApi = useRef<ISeriesMarkersPluginApi<Time> | null>(null)

  useEffect(() => {
    if (!container.current) return
    const instance = createChart(container.current, { autoSize: true, layout: { background: { type: ColorType.Solid, color: '#131a15' }, textColor: '#c0cec3', attributionLogo: true }, grid: { vertLines: { color: '#243128' }, horzLines: { color: '#243128' } }, timeScale: { timeVisible: true, secondsVisible: false, barSpacing: 12, minBarSpacing: 2, rightOffset: 8 }, rightPriceScale: { borderColor: '#344239', scaleMargins: { top: 0.15, bottom: 0.2 } }, crosshair: { vertLine: { color: '#718c78' }, horzLine: { color: '#718c78' } } })
    chart.current = instance
    series.current = instance.addSeries(CandlestickSeries, { upColor: '#8dd8a4', downColor: '#e8998e', wickUpColor: '#8dd8a4', wickDownColor: '#e8998e', borderVisible: false, priceFormat: { type: 'price', precision: pair === 'XAU/USD' ? 3 : 5, minMove: pair === 'XAU/USD' ? 0.001 : 0.00001 } })
    const candleSeries = series.current
    markerApi.current = createSeriesMarkers(candleSeries, [])
    instance.subscribeClick((event) => {
      if (!toolRef.current || !event.point || typeof event.time !== 'number') return
      if (toolRef.current === 'buy' || toolRef.current === 'sell') {
        if (!tradeActions.current.canEnter) return
        const opened = toolRef.current === 'buy' ? tradeActions.current.onBuy() : tradeActions.current.onSell()
        toolRef.current = null; setTool(null); setDrawingMessage(opened ? 'Simulated position opened at the current replay price.' : 'Could not open the simulated position. Check the session message.')
        return
      }
      const price = candleSeries.coordinateToPrice(event.point.y)
      if (price === null) return
      const point = { time: event.time, price }
      if (!pendingRef.current) { pendingRef.current = point; setPendingPoint(point); setDrawingMessage('Choose the end point on a different candle.'); return }
      const endpoints = orderedLine(pendingRef.current, point)
      if (!endpoints) { setDrawingMessage('Choose an end point on a different candle.'); return }
      const line = instance.addSeries(LineSeries, { color: '#d59a38', lineWidth: 2, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false, autoscaleInfoProvider: () => null })
      line.setData(endpoints.map((item) => ({ time: item.time as UTCTimestamp, value: item.price })))
      lines.current.push(line)
      setLineCount(lines.current.length)
      pendingRef.current = null; setPendingPoint(null); setDrawingMessage('Line added. Choose a start point for another line.')
    })
    const applyTheme = () => {
      const light = document.documentElement.dataset.theme === 'light'
      instance.applyOptions({ layout: { background: { type: ColorType.Solid, color: light ? '#f9fcf7' : '#131a15' }, textColor: light ? '#405d48' : '#c0cec3' }, grid: { vertLines: { color: light ? '#e5ede3' : '#243128' }, horzLines: { color: light ? '#e5ede3' : '#243128' } }, rightPriceScale: { borderColor: light ? '#d0ded0' : '#344239' } })
      candleSeries.applyOptions({ upColor: light ? '#2b8652' : '#8dd8a4', downColor: light ? '#bd5950' : '#e8998e', wickUpColor: light ? '#2b8652' : '#8dd8a4', wickDownColor: light ? '#bd5950' : '#e8998e' })
    }
    applyTheme()
    const themeObserver = new MutationObserver(applyTheme)
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    instance.subscribeCrosshairMove((event) => {
      const value = event.seriesData.get(candleSeries)
      if (!event.time || !value || !('open' in value) || typeof event.time !== 'number') { setHovered(null); return }
      setHovered({ time: new Date(event.time * 1000).toISOString().slice(0, 19), open: value.open, high: value.high, low: value.low, close: value.close })
    })
    return () => { themeObserver.disconnect(); markerApi.current?.detach(); markerApi.current = null; instance.remove(); lines.current = []; chart.current = null; series.current = null }
  }, [pair])

  useEffect(() => {
    if (!series.current || !candles[index]) return
    const bars = replayCandles(candles, index, interval)
    series.current.setData(bars.map((bar) => ({ ...bar, time: (Date.parse(`${bar.time}Z`) / 1000) as UTCTimestamp })))
  }, [candles, index, pair, interval])

  useEffect(() => {
    const toBucket = (time: string) => (Math.floor(Date.parse(`${date}T${time}:00Z`) / (interval * 60000)) * interval * 60) as UTCTimestamp
    const markers: SeriesMarker<Time>[] = []
    const add = (time: string, side: 'Long' | 'Short', entry: boolean) => {
      const isBuy = (side === 'Long') === entry
      markers.push({ time: toBucket(time), position: isBuy ? 'belowBar' : 'aboveBar', color: isBuy ? '#2b8652' : '#bd5950', shape: isBuy ? 'arrowUp' : 'arrowDown', text: `${isBuy ? 'Buy' : 'Sell'}${entry ? '' : ' · close'}` })
    }
    for (const trade of trades) { add(trade.entryTime, trade.side, true); add(trade.exitTime, trade.side, false) }
    if (position) add(position.entryTime, position.side, true)
    markers.sort((a, b) => Number(a.time) - Number(b.time))
    markerApi.current?.setMarkers(markers)
  }, [date, interval, pair, position, trades])

  useEffect(() => {
    const onChange = () => setFullScreen(document.fullscreenElement === shell.current)
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { setFallback(false); toolRef.current = null; setTool(null); pendingRef.current = null; setPendingPoint(null); setDrawingMessage('') } }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('fullscreenchange', onChange); document.removeEventListener('keydown', onKeyDown) }
  }, [])

  useEffect(() => {
    if (!canEnter && (toolRef.current === 'buy' || toolRef.current === 'sell')) {
      toolRef.current = null; setTool(null); setDrawingMessage('')
    }
  }, [canEnter])

  const zoom = (factor: number) => {
    const scale = chart.current?.timeScale()
    const range = scale?.getVisibleLogicalRange()
    if (!scale || !range) return
    const width = Math.min(500, Math.max(15, (range.to - range.from) * factor))
    scale.setVisibleLogicalRange({ from: range.to - width, to: range.to })
  }

  const resetView = () => {
    const scale = chart.current?.timeScale()
    if (!scale) return
    scale.applyOptions({ barSpacing: 12, rightOffset: 8 })
    scale.scrollToRealTime()
    chart.current?.priceScale('right').applyOptions({ autoScale: true })
  }

  const chooseTool = (selected: 'line' | 'buy' | 'sell') => {
    const next = toolRef.current === selected ? null : selected
    toolRef.current = next; setTool(next)
    pendingRef.current = null; setPendingPoint(null)
    if (next === 'buy' || next === 'sell') onPause()
    setDrawingMessage(next === 'line' ? 'Select two points on different candles to draw a line.' : next ? `Click a candle to ${next} at the current replay open.` : '')
  }

  const undoLine = () => {
    if (pendingRef.current) { pendingRef.current = null; setPendingPoint(null); setDrawingMessage('Start point cleared. Choose a new start point.'); return }
    const last = lines.current.pop()
    if (last && chart.current) chart.current.removeSeries(last)
    setLineCount(lines.current.length)
    setDrawingMessage(toolRef.current === 'line' ? 'Select two points on different candles to draw a line.' : '')
  }

  const toggleFullScreen = async () => {
    if (fallback) { setFallback(false); return }
    if (document.fullscreenElement === shell.current) { await document.exitFullscreen(); return }
    try {
      if (!shell.current?.requestFullscreen) throw new Error('Fullscreen unavailable')
      await shell.current.requestFullscreen()
    } catch { setFallback(true) }
  }

  const expanded = fullScreen || fallback
  const displayed = hovered ?? replayCandles(candles, index, interval).at(-1)
  const precision = pair === 'XAU/USD' ? 3 : 5
  return <div ref={shell} className={`backtest-chart-shell${expanded ? ' is-expanded' : ''}${fallback ? ' fullscreen-fallback' : ''}`}>
    <div className="backtest-drawing-tools" role="group" aria-label="Chart drawing tools">
      <button className="button button-quiet" type="button" disabled={!canEnter} aria-pressed={tool === 'buy'} onClick={() => chooseTool('buy')}>Buy</button>
      <button className="button button-quiet" type="button" disabled={!canEnter} aria-pressed={tool === 'sell'} onClick={() => chooseTool('sell')}>Sell</button>
      <button className="button button-quiet" type="button" aria-pressed={tool === 'line'} onClick={() => chooseTool('line')}>{tool === 'line' ? 'Finish drawing' : 'Draw line'}</button>
      <button className="button button-quiet" type="button" disabled={!lineCount && !pendingPoint} onClick={undoLine}>Undo line</button>
      <span role="status">{drawingMessage || `${lineCount} ${lineCount === 1 ? 'line' : 'lines'} · Drawings last for this session`}</span>
    </div>
    <div className="backtest-chart-toolbar" role="group" aria-label="Chart view controls">
      <button className="button button-quiet" type="button" onClick={() => zoom(1.4)} aria-label="Zoom out">−</button>
      <button className="button button-quiet" type="button" onClick={() => zoom(1 / 1.4)} aria-label="Zoom in">+</button>
      <button className="button button-quiet" type="button" onClick={resetView}>Reset view</button>
      <button className="button button-quiet" type="button" onClick={() => void toggleFullScreen()}>{expanded ? 'Exit full screen' : 'Full screen'}</button>
    </div>
    <div className="backtest-chart-area">
      <div ref={container} className="backtest-light-chart" role="img" aria-label={`${pair} completed historical candles and current open`}/>
      {displayed && <div className="backtest-candle-readout" aria-live="off"><strong>{pair} · {interval}m</strong><span>{displayed.time.replace('T', ' ')} UTC</span><span>O {displayed.open.toFixed(precision)}</span><span>H {displayed.high.toFixed(precision)}</span><span>L {displayed.low.toFixed(precision)}</span><span>C {displayed.close.toFixed(precision)}</span></div>}
    </div>
    <p className="chart-attribution">Charting by <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView</a> · Lightweight Charts™</p>
    <div className="backtest-chart-controls">{children}</div>
  </div>
}
