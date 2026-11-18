import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseChartAnalysis } from '../src/domain/chartAnalysis'

test('analysis keeps invalidation and protective stop separate and preserves provenance', () => {
  const result = parseChartAnalysis({
    invalidation: { value: '3983.15', basis: 'visible', evidence: 'Red line marked inv', priceRange: { low: 3983.15, high: 3983.15 }, location: { xPercent: 63, yPercent: 80 } },
    protectiveStop: { value: '3993.546', basis: 'interpretation', evidence: 'Lower boundary of position box' },
    signals: [{ value: 'S2', basis: 'visible', evidence: 'S2 label', signalName: 'S2', location: { xPercent: 72, yPercent: 55 } }],
  })
  assert.equal(result.invalidation?.value, '3983.15')
  assert.deepEqual(result.invalidation?.priceRange, { low: 3983.15, high: 3983.15 })
  assert.deepEqual(result.invalidation?.location, { xPercent: 63, yPercent: 80 })
  assert.equal(result.protectiveStop?.value, '3993.546')
  assert.equal(result.protectiveStop?.basis, 'interpretation')
  assert.equal(result.signals[0].value, 'S2')
  assert.equal(result.signals[0].signalName, 'S2')
})

test('analysis rejects malformed output and leaves missing fields empty', () => {
  assert.deepEqual(parseChartAnalysis({}).signals, [])
  assert.equal(parseChartAnalysis({}).entry, undefined)
  assert.throws(() => parseChartAnalysis({ bias: { value: 'certain profit', basis: 'visible', evidence: '' } }), /bias/)
  assert.throws(() => parseChartAnalysis({ signals: Array(21).fill({}) }), /signal/)
  assert.throws(() => parseChartAnalysis({ target: { value: '4000', basis: 'verified', evidence: '' } }), /target/)
  assert.throws(() => parseChartAnalysis({ entry: { value: '4000', basis: 'visible', evidence: 'Zone', priceRange: { low: 4001, high: 3999 } } }), /price range/)
  assert.throws(() => parseChartAnalysis({ signals: [{ value: 'S1', basis: 'visible', evidence: 'label', location: { xPercent: 101, yPercent: 50 } }] }), /image location/)
})
