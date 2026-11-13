import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildPrintChart, type PrintCandle } from '../src/domain/printChart'
import type { Trade } from '../src/types'
import { renderTradePrintPng } from '../src/application/renderTradePrintPng'

const trade: Trade = { id: 'trade', date: '2026-11-02', exitDate: '2026-11-03', pair: 'XAU/USD', brokerSymbol: 'XAUUSDz', side: 'Long', lots: 1, entry: 4000, exit: 4002, entryTime: '23:59', exitTime: '00:01', commission: 2, swap: 0, setup: '', note: '', tags: [], executions: [{ date: '2026-11-02', time: '23:59', action: 'Buy', price: 4000, lots: .4 }, { date: '2026-11-02', time: '23:59', action: 'Buy', price: 4000, lots: .6 }, { date: '2026-11-03', time: '00:01', action: 'Sell', price: 4002, lots: 1 }] }
const row = (time: string): PrintCandle => ({ time, open: 4000, high: 4003, low: 3999, close: 4002 })
const rows = [row('2026-11-02T23:59:00'), row('2026-11-03T00:00:00'), row('2026-11-03T00:01:00')]
const retrieved = '2026-11-13T12:00:00Z'

test('chart specification preserves every actual partial fill and overnight date', () => {
  const spec = buildPrintChart(trade, [...rows].reverse(), 'mt5_candles', retrieved)
  assert.equal(spec.quality, 'complete'); assert.equal(spec.source, 'mt5_candles'); assert.equal(spec.brokerSymbol, 'XAUUSDz'); assert.equal(spec.direction, 'Long'); assert.equal(spec.netPnl, 198); assert.deepEqual(spec.markers.map(m => m.role), ['Entry', 'Entry', 'Exit'])
  assert.deepEqual(spec.markers.map((m) => [m.time, m.action, m.price, m.lots, m.precision]), [['2026-11-02T23:59:00', 'Buy', 4000, .4, 'minute'], ['2026-11-02T23:59:00', 'Buy', 4000, .6, 'minute'], ['2026-11-03T00:01:00', 'Sell', 4002, 1, 'minute']])
  assert.equal(spec.candles[0].time, '2026-11-02T23:59:00')
})
test('chart specification labels missing candles and rejects fabricated or ambiguous data', () => {
  assert.equal(buildPrintChart(trade, [rows[0], rows[2]], 'twelve_data_candles', retrieved).quality, 'partial')
  assert.throws(() => buildPrintChart(trade, [], 'mt5_candles', retrieved), /unavailable/)
  assert.throws(() => buildPrintChart(trade, [rows[0], rows[0]], 'mt5_candles', retrieved), /invalid/)
  assert.throws(() => buildPrintChart(trade, [{ ...rows[0], high: 3998 }], 'mt5_candles', retrieved), /invalid/)
  assert.throws(() => buildPrintChart({ ...trade, executions: trade.executions.map(({ date: _date, ...fill }) => fill) }, rows, 'mt5_candles', retrieved), /missing its date/)
  assert.throws(() => buildPrintChart(trade, [row('2026-11-01T00:00:00')], 'mt5_candles', retrieved), /outside/)
})


test('short execution markers and net result follow recorded direction and fees', () => {
  const shortTrade: Trade = { ...trade, side: 'Short', executions: trade.executions.map((fill) => ({ ...fill, action: fill.action === 'Buy' ? 'Sell' : 'Buy' })) }
  const spec = buildPrintChart(shortTrade, rows, 'mt5_candles', retrieved)
  assert.equal(spec.direction, 'Short'); assert.equal(spec.netPnl, -202)
  assert.deepEqual(spec.markers.map((marker) => [marker.role, marker.action, marker.price]), [['Entry', 'Sell', 4000], ['Entry', 'Sell', 4000], ['Exit', 'Buy', 4002]])
})


test('PNG compositor requires a valid capture timestamp and nonempty chart', async () => {
  const spec = buildPrintChart(trade, rows, 'mt5_candles', retrieved)
  await assert.rejects(() => renderTradePrintPng({} as HTMLCanvasElement, spec, 'invalid'), /ISO UTC/)
  await assert.rejects(() => renderTradePrintPng({ width: 0, height: 0 } as HTMLCanvasElement, spec, '2026-11-13T12:00:00.000Z'), /unavailable/)
})
