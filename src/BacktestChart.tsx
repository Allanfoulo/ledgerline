import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { CandlestickSeries, ColorType, createChart } from 'lightweight-charts'
import type { IChartApi, ISeriesApi, UTCTimestamp } from 'lightweight-charts'
import { replayCandles } from './domain/backtest'

type Candle = { time: string; open: number; high: number; low: number; close: number }

export default function BacktestChart({ candles, index, pair, interval, children }: { candles: Candle[]; index: number; pair: string; interval: number; children: ReactNode }) {
  const shell = useRef<HTMLDivElement>(null)
  const container = useRef<HTMLDivElement>(null)
  const chart = useRef<IChartApi | null>(null)
  const series = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const [fullScreen, setFullScreen] = useState(false)
  const [fallback, setFallback] = useState(false)
  const [hovered, setHovered] = useState<Candle | null>(null)

  useEffect(() => {
    if (!container.current) return
    const instance = createChart(container.current, { autoSize: true, layout: { background: { type: ColorType.Solid, color: '#131a15' }, textColor: '#c0cec3', attributionLogo: true }, grid: { vertLines: { color: '#243128' }, horzLines: { color: '#243128' } }, timeScale: { timeVisible: true, secondsVisible: false, barSpacing: 12, minBarSpacing: 2, rightOffset: 8 }, rightPriceScale: { borderColor: '#344239', scaleMargins: { top: 0.15, bottom: 0.2 } }, crosshair: { vertLine: { color: '#718c78' }, horzLine: { color: '#718c78' } } })
    chart.current = instance
    series.current = instance.addSeries(CandlestickSeries, { upColor: '#8dd8a4', downColor: '#e8998e', wickUpColor: '#8dd8a4', wickDownColor: '#e8998e', borderVisible: false, priceFormat: { type: 'price', precision: pair === 'XAU/USD' ? 3 : 5, minMove: pair === 'XAU/USD' ? 0.001 : 0.00001 } })
    const candleSeries = series.current
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
    return () => { themeObserver.disconnect(); instance.remove(); chart.current = null; series.current = null }
  }, [pair])

  useEffect(() => {
    if (!series.current || !candles[index]) return
    const bars = replayCandles(candles, index, interval)
    series.current.setData(bars.map((bar) => ({ ...bar, time: (Date.parse(`${bar.time}Z`) / 1000) as UTCTimestamp })))
  }, [candles, index, pair, interval])

  useEffect(() => {
    const onChange = () => setFullScreen(document.fullscreenElement === shell.current)
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setFallback(false) }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('fullscreenchange', onChange); document.removeEventListener('keydown', onKeyDown) }
  }, [])

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
