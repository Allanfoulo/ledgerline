export type ReportTrade = { pair: string; side: string; setup: string; date: string; netPnl: number }
export type ReportRow = { label: string; trades: number; netPnl: number; winners: number; winRate: number; profitFactor: number | null }

export function groupPerformance(trades: ReportTrade[], dimension: 'pair' | 'side' | 'setup'): ReportRow[] {
  const groups = new Map<string, ReportTrade[]>()
  for (const trade of trades) { const label = trade[dimension].trim() || 'Unassigned'; const group = groups.get(label) ?? []; group.push(trade); groups.set(label, group) }
  return [...groups.entries()].map(([label, items]) => {
    const winners = items.filter((item) => item.netPnl > 0)
    const winningTotal = winners.reduce((sum, item) => sum + item.netPnl, 0)
    const losingTotal = Math.abs(items.filter((item) => item.netPnl < 0).reduce((sum, item) => sum + item.netPnl, 0))
    return { label, trades: items.length, netPnl: items.reduce((sum, item) => sum + item.netPnl, 0), winners: winners.length, winRate: winners.length / items.length * 100, profitFactor: losingTotal ? winningTotal / losingTotal : null }
  }).sort((a, b) => b.netPnl - a.netPnl)
}
