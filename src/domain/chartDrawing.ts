export type ChartPoint = { time: number; price: number }

// Lightweight Charts requires strictly increasing times for line-series data.
export function orderedLine(a: ChartPoint, b: ChartPoint): [ChartPoint, ChartPoint] | null {
  if (!Number.isFinite(a.time) || !Number.isFinite(b.time) || !Number.isFinite(a.price) || !Number.isFinite(b.price) || a.time === b.time) return null
  return a.time < b.time ? [a, b] : [b, a]
}
