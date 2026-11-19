import { v } from 'convex/values'

export const playbook = v.object({ markets: v.string(), timeframes: v.string(), context: v.string(), signalSequence: v.string(), entry: v.string(), invalidation: v.string(), protectiveStop: v.string(), targets: v.string(), management: v.string() })
