import { v } from 'convex/values'

export const priceRange = v.object({ low: v.optional(v.number()), high: v.optional(v.number()) })

export const planContent = v.object({
  title: v.string(),
  instrument: v.string(),
  timeframe: v.string(),
  hypothesis: v.union(v.literal('bullish'), v.literal('bearish'), v.literal('neutral'), v.literal('conditional')),
  thesis: v.string(),
  context: v.string(),
  confirmations: v.array(v.object({
    condition: v.string(), role: v.union(v.literal('required'), v.literal('supporting')),
    threshold: v.optional(v.string()), price: v.optional(v.number()), timeframe: v.optional(v.string()),
    status: v.union(v.literal('not_seen'), v.literal('satisfied'), v.literal('failed'), v.literal('not_applicable')),
    source: v.union(v.literal('user'), v.literal('verified')), sourceReference: v.optional(v.string()),
  })),
  entryRange: v.optional(priceRange),
  targetRange: v.optional(priceRange),
  invalidationRange: v.optional(priceRange),
  invalidationCondition: v.string(), invalidationLevel: v.optional(v.number()), invalidationAction: v.string(),
  entryConditions: v.string(), orderApproach: v.union(v.literal('market'), v.literal('limit'), v.literal('stop'), v.literal('unspecified')),
  managementPlan: v.string(), exitRationale: v.string(), abortConditions: v.string(),
  maxLossUsd: v.optional(v.number()), maxLossPercent: v.optional(v.number()), protectiveStop: v.optional(v.number()), positionSizeNote: v.string(),
})

export const chartSuggestion = v.object({
  value: v.string(),
  basis: v.union(v.literal('visible'), v.literal('interpretation')),
  evidence: v.string(),
  priceRange: v.optional(priceRange),
  location: v.optional(v.object({ xPercent: v.number(), yPercent: v.number() })),
  signalName: v.optional(v.string()),
})

export const chartAnalysisSuggestions = v.object({
  instrument: v.optional(chartSuggestion),
  timeframe: v.optional(chartSuggestion),
  bias: v.optional(chartSuggestion),
  entry: v.optional(chartSuggestion),
  protectiveStop: v.optional(chartSuggestion),
  target: v.optional(chartSuggestion),
  invalidation: v.optional(chartSuggestion),
  signals: v.array(chartSuggestion),
})
