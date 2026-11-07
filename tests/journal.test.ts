import { test } from 'node:test'
import assert from 'node:assert/strict'
import { forexPnl, tradeFingerprint, validateTrade } from '../src/domain/trade'
import type { TradeInput } from '../src/domain/trade'
import { parseCsv, previewCsv, suggestMapping } from '../src/application/tradeImport'
import { saveTrades } from '../src/application/journal'
import { closePosition, completedCandles, hasRepeatedPrices, openPosition, replayCandles, weekendSuggestion } from '../src/domain/backtest'
import { orderedLine } from '../src/domain/chartDrawing'
import { groupPerformance } from '../src/domain/report'
import { alignSamples, tradeSignature } from '../src/application/alignSamples'
import type { Trade } from '../src/types'
import { byDay, enrichedTrades, equitySeries } from '../src/lib/analytics'

const trade: TradeInput = { date: '2026-11-02', pair: 'EUR/USD', side: 'Long', lots: 0.5, entry: 1.1, exit: 1.102, entryTime: '08:00', exitTime: '09:00', commission: 3.5, swap: -1, setup: 'Breakout' }
test('USD forex P&L handles direction, commission, and swap credit', () => {
  assert.ok(Math.abs(forexPnl(trade).netPnl - 97.5) < 0.00001)
  assert.ok(Math.abs(forexPnl({ ...trade, side: 'Short' }).netPnl - -102.5) < 0.00001)
})
test('gold P&L uses the verified 100-ounce contract and 0.001 tick', () => {
  const gold: TradeInput = { ...trade, pair: 'XAU/USD', entry: 4000, exit: 4002, lots: 0.1, commission: 1, swap: 0 }
  assert.deepEqual(validateTrade(gold), [])
  assert.ok(Math.abs(forexPnl(gold).grossPnl - 20) < 1e-8)
  assert.ok(Math.abs(forexPnl(gold).pips - 2000) < 1e-8)
  assert.ok(Math.abs(forexPnl({ ...gold, side: 'Short' }).netPnl - -21) < 1e-8)
})
test('overnight trades validate and report on their exit date without changing same-day fingerprints', () => {
  const overnight: TradeInput = { ...trade, date: '2026-11-02', exitDate: '2026-11-03', entryTime: '23:30', exitTime: '01:00' }
  assert.deepEqual(validateTrade(overnight), [])
  assert.ok(validateTrade({ ...overnight, exitDate: '2026-11-01' }).length)
  assert.equal(tradeFingerprint(trade), tradeFingerprint({ ...trade, exitDate: trade.date }))
  assert.notEqual(tradeFingerprint(overnight), tradeFingerprint({ ...overnight, exitDate: overnight.date }))
  const item: Trade = { ...overnight, id: 'overnight', tags: [], note: '', executions: [] }
  const calculated = enrichedTrades([item])
  assert.equal(byDay(calculated)['2026-11-03'].length, 1)
  assert.equal(equitySeries(calculated)[0].date, '2026-11-03')
})
test('CSV maps XAUUSDz and optional exit dates to gold', () => {
  const rows = parseCsv('date,exitDate,pair,side,lots,entry,exit,entryTime,exitTime\n2026-11-02,2026-11-03,XAUUSDz,Buy,0.1,4000,4002,23:00,01:00')
  const result = previewCsv(rows, suggestMapping(rows[0]), [])[0]
  assert.deepEqual(result.errors, []); assert.equal(result.input?.pair, 'XAU/USD'); assert.equal(result.input?.exitDate, '2026-11-03')
})
test('validation rejects invalid dates, times, unsupported markets and invalid numbers', () => {
  assert.deepEqual(validateTrade(trade), [])
  assert.ok(validateTrade({ ...trade, date: '2026-02-30' }).length)
  assert.ok(validateTrade({ ...trade, exitTime: '07:00' }).length)
  assert.ok(validateTrade({ ...trade, pair: 'USD/JPY' as TradeInput['pair'] }).length)
  assert.ok(validateTrade({ ...trade, lots: Infinity }).length)
})
test('CSV handles quoted fields and reports duplicates against account and file', () => {
  const csv = 'date,pair,side,lots,entry,exit,entryTime,exitTime,commission,swap,setup\r\n2026-11-02,EURUSD,buy,0.5,1.1,1.102,08:00,09:00,3.5,-1,"Breakout, London"\r\n2026-11-02,EUR/USD,Long,0.5,1.1,1.102,08:00,09:00,3.5,-1,Other'
  const rows = parseCsv(csv); const preview = previewCsv(rows, suggestMapping(rows[0]), [])
  assert.equal(preview[0].input?.setup, 'Breakout, London')
  assert.equal(preview[0].duplicate, false); assert.equal(preview[1].duplicate, true)
  assert.equal(previewCsv(rows, suggestMapping(rows[0]), [trade])[0].duplicate, true)
  assert.equal(tradeFingerprint(trade), tradeFingerprint({ ...trade, setup: 'Other' }))
})
test('CSV refuses malformed structure and flags invalid rows', () => {
  assert.throws(() => parseCsv('a,b\n"unfinished,b'))
  assert.throws(() => parseCsv('a,b\n1'))
  const rows = parseCsv('date,pair,side,lots,entry,exit,entryTime,exitTime\n2026-11-02,EURUSD,long,,1.1,1.2,08:00,09:00')
  assert.ok(previewCsv(rows, suggestMapping(rows[0]), [])[0].errors.length)
})
test('save use case validates before calling repository', async () => {
  let called = false
  const port = { save: async () => { called = true; return { inserted: 1, duplicates: 0 } } }
  await assert.rejects(() => saveTrades(port, 'account', [{ ...trade, lots: 0 }]))
  assert.equal(called, false)
  assert.deepEqual(await saveTrades(port, 'account', [trade]), { inserted: 1, duplicates: 0 })
})
test('duplicate handling remains off unless explicitly approved for the save', async () => {
  const flags: boolean[] = []
  const port = { save: async (_account: string, _trades: TradeInput[], allowDuplicates: boolean) => { flags.push(allowDuplicates); return { inserted: 1, duplicates: 0 } } }
  await saveTrades(port, 'account', [trade])
  await saveTrades(port, 'account', [trade], true)
  assert.deepEqual(flags, [false, true])
})
test('backtesting hides the current candle and forbids closing before a later minute', () => {
  assert.deepEqual(completedCandles(['first', 'current', 'future'], 1), ['first'])
  const position = openPosition('Long', 0.5, 1.1, '08:00')
  assert.throws(() => closePosition(position, '2026-11-02', 'EUR/USD', 1.102, '08:00', 0))
  const result = closePosition(position, '2026-11-02', 'EUR/USD', 1.102, '08:01', 2)
  assert.ok(Math.abs(forexPnl(result).netPnl - 98) < 0.00001)
})
test('weekend guidance suggests the next Monday without declaring Sunday universally closed', () => {
  assert.deepEqual(weekendSuggestion('2026-10-31'), { nextMonday: '2026-11-02' })
  assert.deepEqual(weekendSuggestion('2026-11-01'), { nextMonday: '2026-11-02' })
  assert.equal(weekendSuggestion('2026-11-02'), null)
  assert.equal(weekendSuggestion('2026-02-30'), null)
  assert.equal(weekendSuggestion(''), null)
})
test('replay builds higher timeframe candles using only completed minutes and current open', () => {
  const rows = [
    { time: '2026-11-02T08:00:00', open: 100, high: 105, low: 99, close: 104 },
    { time: '2026-11-02T08:01:00', open: 104, high: 110, low: 102, close: 108 },
    { time: '2026-11-02T08:02:00', open: 108, high: 999, low: 1, close: 900 },
    { time: '2026-11-02T08:15:00', open: 111, high: 999, low: 1, close: 900 },
  ]
  assert.deepEqual(replayCandles(rows, 2, 15), [{ time: '2026-11-02T08:00:00', open: 100, high: 110, low: 99, close: 108 }])
  assert.deepEqual(replayCandles(rows, 3, 15)[1], { time: '2026-11-02T08:15:00', open: 111, high: 111, low: 111, close: 111 })
  assert.equal(hasRepeatedPrices(Array.from({ length: 30 }, () => rows[0])), true)
  assert.equal(hasRepeatedPrices(rows), false)
  const staleOpens = Array.from({ length: 30 }, (_, i) => ({ ...rows[0], high: 105 + i / 100, low: 99 - i / 100 }))
  assert.equal(hasRepeatedPrices(staleOpens), true)
  assert.equal(hasRepeatedPrices(Array.from({ length: 30 }, (_, i) => ({ ...rows[0], open: 100 + i / 100 }))), false)
})
test('replay retains absolute price changes instead of flattening candles', () => {
  const prices = [
    { time: '2026-11-02T08:00:00', open: 3900, high: 3911, low: 3899, close: 3910 },
    { time: '2026-11-02T08:01:00', open: 3910, high: 3912, low: 3894, close: 3895 },
    { time: '2026-11-02T08:02:00', open: 3895, high: 4000, low: 3800, close: 4000 },
  ]
  const displayed = replayCandles(prices, 2, 1)
  assert.deepEqual(displayed.slice(0, 2), prices.slice(0, 2))
  assert.deepEqual(displayed[2], { ...prices[2], high: 3895, low: 3895, close: 3895 })
  assert.ok(displayed[0].close > displayed[0].open)
  assert.ok(displayed[1].close < displayed[1].open)
})
test('chart lines preserve prices and put endpoints in chronological order', () => {
  const earlier = { time: 100, price: 3910 }
  const later = { time: 200, price: 3890 }
  assert.deepEqual(orderedLine(later, earlier), [earlier, later])
  assert.equal(orderedLine(earlier, { time: 100, price: 3890 }), null)
  assert.equal(orderedLine(earlier, { time: 200, price: NaN }), null)
})
test('reports group trades and preserve undefined profit factor for zero losses', () => {
  const rows = groupPerformance([{ pair: 'EUR/USD', side: 'Long', setup: '', date: '2026-11-02', netPnl: 100 }, { pair: 'EUR/USD', side: 'Short', setup: 'A', date: '2026-11-02', netPnl: -50 }, { pair: 'GBP/USD', side: 'Long', setup: 'A', date: '2026-11-03', netPnl: 20 }], 'pair')
  assert.equal(rows[0].label, 'EUR/USD'); assert.equal(rows[0].profitFactor, 2); assert.equal(rows[0].winRate, 50)
  assert.equal(rows[1].profitFactor, null)
})
test('sample alignment uses exact candle opens, skips aligned trades and preserves missing matches', async () => {
  const sample: Trade = { ...trade, id: 'fx-a', tags: [], note: '', executions: [] }
  const second: Trade = { ...sample, id: 'fx-b', entryTime: '08:01' }
  const saved: unknown[] = []; let waits = 0
  const result = await alignSamples({ candles: async () => [{ time: '2026-11-02T08:00:00', open: 1.1, high: 1.2, low: 1.0, close: 1.15 }, { time: '2026-11-02T09:00:00', open: 1.2, high: 1.3, low: 1.1, close: 1.25 }], save: async (price) => { saved.push(price) }, wait: async () => { waits++ } }, [sample, second], {}, () => {})
  assert.deepEqual(result, { attempted: 2, completed: 1, failed: 1 }); assert.equal(saved.length, 1); assert.equal(waits, 1)
  const skipped = await alignSamples({ candles: async () => { throw new Error('should not fetch') }, save: async () => {}, wait: async () => {} }, [sample], { 'fx-a': { tradeId: 'fx-a', signature: tradeSignature(sample), entry: 1.1, exit: 1.2 } }, () => {})
  assert.equal(skipped.attempted, 0)
})
