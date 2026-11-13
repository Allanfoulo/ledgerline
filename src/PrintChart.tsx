import { useEffect, useRef } from 'react'
import { CandlestickSeries, ColorType, createChart, createSeriesMarkers, type UTCTimestamp } from 'lightweight-charts'
import type { PrintChartSpec } from './domain/printChart'

/** Presentation only: data acquisition and authorization belong to the caller. */
export default function PrintChart({ spec }: { spec: PrintChartSpec }) {
  const host = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!host.current) return
    const light = document.documentElement.dataset.theme === 'light'
    const chart = createChart(host.current, { autoSize: true, height: 360, layout: { background: { type: ColorType.Solid, color: light ? '#f9fcf7' : '#131a15' }, textColor: light ? '#405d48' : '#c0cec3', attributionLogo: true }, grid: { vertLines: { color: light ? '#e5ede3' : '#243128' }, horzLines: { color: light ? '#e5ede3' : '#243128' } }, timeScale: { timeVisible: true, secondsVisible: false }, rightPriceScale: { scaleMargins: { top: .15, bottom: .15 } } })
    const series = chart.addSeries(CandlestickSeries, { upColor: light ? '#2b8652' : '#8dd8a4', downColor: light ? '#bd5950' : '#e8998e', wickUpColor: light ? '#2b8652' : '#8dd8a4', wickDownColor: light ? '#bd5950' : '#e8998e', borderVisible: false, priceFormat: { type: 'price', precision: spec.pair === 'XAU/USD' ? 3 : 5, minMove: spec.pair === 'XAU/USD' ? .001 : .00001 } })
    const asTime = (time: string) => Math.floor(Date.parse(`${time}Z`) / 1000) as UTCTimestamp
    series.setData(spec.candles.map(({ time, open, high, low, close }) => ({ time: asTime(time), open, high, low, close })))
    const candleTimes = new Set(spec.candles.map((candle) => candle.time))
    const available = spec.markers.filter((marker) => candleTimes.has(marker.time))
    const markers = createSeriesMarkers(series, available.map((marker) => ({ time: asTime(marker.time), position: marker.action === 'Buy' ? 'belowBar' as const : 'aboveBar' as const, shape: marker.action === 'Buy' ? 'arrowUp' as const : 'arrowDown' as const, color: marker.action === 'Buy' ? '#2b8652' : '#bd5950', text: marker.action })))
    chart.timeScale().setVisibleLogicalRange({ from: -3, to: spec.candles.length + 2 })
    const observer = new MutationObserver(() => {
      const isLight = document.documentElement.dataset.theme === 'light'
      chart.applyOptions({ layout: { background: { type: ColorType.Solid, color: isLight ? '#f9fcf7' : '#131a15' }, textColor: isLight ? '#405d48' : '#c0cec3' }, grid: { vertLines: { color: isLight ? '#e5ede3' : '#243128' }, horzLines: { color: isLight ? '#e5ede3' : '#243128' } } })
      series.applyOptions({ upColor: isLight ? '#2b8652' : '#8dd8a4', downColor: isLight ? '#bd5950' : '#e8998e', wickUpColor: isLight ? '#2b8652' : '#8dd8a4', wickDownColor: isLight ? '#bd5950' : '#e8998e' })
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => { observer.disconnect(); markers.detach(); chart.remove() }
  }, [spec])
  const visibleTimes = new Set(spec.candles.map((candle) => candle.time))
  const missingMarkers = spec.markers.filter((marker) => !visibleTimes.has(marker.time)).length
  return <section className="panel print-chart" aria-label="Trade Print chart">
    <div className="panel-heading"><div><h2>Trade Print chart</h2><p>{spec.source === 'mt5_candles' ? 'MT5 candle history' : 'Twelve Data history'} · 1 minute · UTC</p></div><strong>{spec.quality === 'complete' ? 'Complete in-trade coverage' : 'Partial candle coverage'}</strong></div>
    <div className="print-chart-body"><p>Arrows indicate execution times; exact fill prices and sizes are listed below. Historical candles are a separate source and are not a screenshot of your trading terminal.</p><div ref={host} className="print-chart-canvas"/><div className="table-scroll"><table className="trade-table"><thead><tr><th>Time (UTC)</th><th>Action</th><th>Price</th><th>Lots</th></tr></thead><tbody>{spec.markers.map((marker, index) => <tr key={`${marker.time}-${index}`}><td>{marker.time.replace('T', ' ')}</td><td>{marker.action}</td><td>{marker.price.toFixed(spec.pair === 'XAU/USD' ? 3 : 5)}</td><td>{marker.lots}</td></tr>)}</tbody></table></div>{missingMarkers > 0 && <p role="status">{missingMarkers} recorded {missingMarkers === 1 ? 'execution is' : 'executions are'} outside the available candles and cannot be plotted.</p>}<p>Source retrieved {spec.sourceRetrievedAt} · execution timestamps have minute precision.</p><p>Charting by <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">TradingView</a> · Lightweight Charts™</p></div>
  </section>
}
