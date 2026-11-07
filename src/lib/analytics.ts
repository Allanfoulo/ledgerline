import type { Trade, TradeWithPnl } from '../types'
import { forexPnl } from '../domain/trade'

export function enrichTrade(trade: Trade): TradeWithPnl {
  return { ...trade, ...forexPnl(trade) }
}

export const enrichedTrades = (items: Trade[]) => items.map(enrichTrade)

export function summarize(items: TradeWithPnl[]) {
  const netPnl = items.reduce((sum, trade) => sum + trade.netPnl, 0)
  const winners = items.filter((trade) => trade.netPnl > 0)
  const losers = items.filter((trade) => trade.netPnl < 0)
  const grossWins = winners.reduce((sum, trade) => sum + trade.netPnl, 0)
  const grossLosses = Math.abs(losers.reduce((sum, trade) => sum + trade.netPnl, 0))
  return {
    netPnl,
    trades: items.length,
    winners: winners.length,
    winRate: items.length ? (winners.length / items.length) * 100 : 0,
    profitFactor: grossLosses ? grossWins / grossLosses : grossWins ? Infinity : 0,
    averageWin: winners.length ? grossWins / winners.length : 0,
    averageLoss: losers.length ? grossLosses / losers.length : 0,
    grossWins,
    grossLosses,
  }
}

export function byDay(items: TradeWithPnl[]) {
  return items.reduce<Record<string, TradeWithPnl[]>>((groups, trade) => {
    const closeDate = trade.exitDate ?? trade.date
    groups[closeDate] ??= []
    groups[closeDate].push(trade)
    return groups
  }, {})
}

export function calendarTotals(items: TradeWithPnl[]) {
  return Object.entries(byDay(items)).reduce<Record<string, number>>((totals, [date, dayTrades]) => {
    totals[date] = dayTrades.reduce((sum, trade) => sum + trade.netPnl, 0)
    return totals
  }, {})
}

export function equitySeries(items: TradeWithPnl[]) {
  let balance = 0
  return [...items].sort((a, b) => (a.exitDate ?? a.date).localeCompare(b.exitDate ?? b.date) || a.exitTime.localeCompare(b.exitTime)).map((trade) => {
    balance += trade.netPnl
    return { id: trade.id, date: trade.exitDate ?? trade.date, value: balance }
  })
}

export function formatMoney(value: number, compact = false) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD', maximumFractionDigits: compact ? 0 : 2,
    notation: compact ? 'compact' : 'standard',
  }).format(value)
}

export function formatSignedMoney(value: number) {
  return `${value >= 0 ? '+' : '−'}${formatMoney(Math.abs(value))}`
}

export function formatPrice(value: number) {
  return value.toFixed(5)
}

export function monthLabel(date: Date) {
  return new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(date)
}

export function shortDate(iso: string) {
  return iso ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(new Date(`${iso}T12:00:00`)) : '—'
}

export function weekday(iso: string, long = false) {
  return new Intl.DateTimeFormat('en-US', { weekday: long ? 'long' : 'short' }).format(new Date(`${iso}T12:00:00`))
}

export function weekStart(iso: string) {
  const date = new Date(`${iso}T12:00:00`)
  date.setDate(date.getDate() - date.getDay())
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function weekDates(start: string) {
  const date = new Date(`${start}T12:00:00`)
  return Array.from({ length: 7 }, () => {
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
    date.setDate(date.getDate() + 1)
    return iso
  })
}
