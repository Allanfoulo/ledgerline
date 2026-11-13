import type { PrintChartSpec } from '../domain/printChart'
import { formatSignedMoney } from '../lib/analytics'

/** Compose an image from a rendered chart; scheduling, storage and authorization are the caller's responsibility. */
export async function renderTradePrintPng(chart: HTMLCanvasElement, spec: PrintChartSpec, capturedAt: string): Promise<Blob> {
  const time = new Date(capturedAt)
  if (!Number.isFinite(time.getTime()) || time.toISOString() !== capturedAt) throw new Error('Capture time must be an ISO UTC timestamp.')
  if (!chart.width || !chart.height) throw new Error('Chart image is unavailable.')
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 704 + spec.markers.length * 28
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Image renderer is unavailable.')
  ctx.fillStyle = '#101512'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = '#a8e2ba'; ctx.font = 'bold 22px sans-serif'; ctx.fillText('SidePrint · Trade Print', 40, 48)
  ctx.fillStyle = '#e9eee9'; ctx.font = 'bold 20px sans-serif'; ctx.fillText(`${spec.pair}${spec.brokerSymbol ? ` · ${spec.brokerSymbol}` : ''} · ${spec.direction} · Net ${formatSignedMoney(spec.netPnl)}`, 40, 82)
  ctx.fillStyle = '#b8c8bb'; ctx.font = '15px sans-serif'; ctx.fillText(`${spec.source === 'mt5_candles' ? 'MT5 candle history' : 'Twelve Data history'} · 1 minute · UTC · ${spec.quality} coverage`, 40, 110)
  ctx.drawImage(chart, 40, 130, 1120, 400)
  ctx.fillStyle = '#e9eee9'; ctx.font = 'bold 17px sans-serif'; ctx.fillText('Recorded executions', 40, 565)
  ctx.font = '15px sans-serif'
  spec.markers.forEach((marker, i) => ctx.fillText(`${marker.time.replace('T', ' ')} UTC   ${marker.role} · ${marker.action}   ${marker.price.toFixed(spec.pair === 'XAU/USD' ? 3 : 5)}   ${marker.lots} lots`, 40, 594 + i * 28))
  ctx.fillStyle = '#b8c8bb'; ctx.font = '14px sans-serif'
  ctx.fillText(`Captured ${capturedAt} · Source retrieved ${spec.sourceRetrievedAt}`, 40, canvas.height - 62)
  ctx.fillText('Reconstructed chart; historical candles and broker executions are separate records.', 40, canvas.height - 39)
  ctx.fillText('Charting by TradingView · Lightweight Charts™ · https://www.tradingview.com/', 40, canvas.height - 16)
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not encode PNG.')), 'image/png'))
}
