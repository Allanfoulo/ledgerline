import { defineSchema, defineTable } from 'convex/server'
import { v } from 'convex/values'
import { authTables } from '@convex-dev/auth/server'

export default defineSchema({
  ...authTables,
  secrets: defineTable({ owner: v.string(), ciphertext: v.string(), iv: v.string() }).index('by_owner', ['owner']),
  notes: defineTable({ owner: v.string(), kind: v.union(v.literal('day'), v.literal('trade')), key: v.string(), text: v.string() }).index('by_owner', ['owner']),
  samplePrices: defineTable({ owner: v.string(), tradeId: v.string(), signature: v.string(), entry: v.number(), exit: v.number() }).index('by_owner', ['owner']),
  tradingAccounts: defineTable({ owner: v.string(), name: v.string(), currency: v.literal('USD'), brokerKey: v.optional(v.string()) }).index('by_owner', ['owner']),
  journalTrades: defineTable({ owner: v.string(), accountId: v.id('tradingAccounts'), fingerprint: v.string(), sourceKey: v.optional(v.string()), brokerSymbol: v.optional(v.string()), date: v.string(), exitDate: v.optional(v.string()), pair: v.union(v.literal('EUR/USD'), v.literal('GBP/USD'), v.literal('AUD/USD'), v.literal('XAU/USD')), side: v.union(v.literal('Long'), v.literal('Short')), lots: v.number(), entry: v.number(), exit: v.number(), entryTime: v.string(), exitTime: v.string(), commission: v.number(), swap: v.number(), setup: v.string() }).index('by_owner_account', ['owner', 'accountId']),
  tradeExecutions: defineTable({ owner: v.string(), accountId: v.id('tradingAccounts'), tradeId: v.id('journalTrades'), date: v.optional(v.string()), time: v.string(), action: v.union(v.literal('Buy'), v.literal('Sell')), price: v.number(), lots: v.number() }).index('by_owner_trade', ['owner', 'tradeId']),
  strategies: defineTable({ owner: v.string(), name: v.string(), rules: v.array(v.string()) }).index('by_owner', ['owner']),
  tradeReviews: defineTable({ owner: v.string(), accountId: v.id('tradingAccounts'), tradeId: v.id('journalTrades'), strategyId: v.id('strategies'), checked: v.array(v.string()) }).index('by_owner_account', ['owner', 'accountId']),
  backtestSessions: defineTable({ owner: v.string(), accountId: v.id('tradingAccounts'), sessionKey: v.string(), date: v.string(), pair: v.union(v.literal('EUR/USD'), v.literal('GBP/USD'), v.literal('AUD/USD'), v.literal('XAU/USD')), startTime: v.string(), endTime: v.string(), trades: v.array(v.object({ date: v.string(), pair: v.union(v.literal('EUR/USD'), v.literal('GBP/USD'), v.literal('AUD/USD'), v.literal('XAU/USD')), side: v.union(v.literal('Long'), v.literal('Short')), lots: v.number(), entry: v.number(), exit: v.number(), entryTime: v.string(), exitTime: v.string(), commission: v.number(), swap: v.number(), setup: v.string() })) }).index('by_owner_account', ['owner', 'accountId']),
  connectorTokens: defineTable({ owner: v.string(), accountId: v.id('tradingAccounts'), hash: v.string(), createdAt: v.number(), expiresAt: v.number() }).index('by_hash', ['hash']).index('by_owner_account', ['owner', 'accountId']),
})
