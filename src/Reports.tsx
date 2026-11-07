import { useMemo, useState } from 'react'
import { groupPerformance } from './domain/report'
import { formatSignedMoney } from './lib/analytics'
import type { TradeWithPnl } from './types'

export default function Reports({ trades }: { trades: TradeWithPnl[] }) {
  const [dimension, setDimension] = useState<'pair' | 'side' | 'setup'>('pair')
  const [from, setFrom] = useState(''); const [to, setTo] = useState('')
  const selected = useMemo(() => trades.filter((trade) => (!from || (trade.exitDate ?? trade.date) >= from) && (!to || (trade.exitDate ?? trade.date) <= to)), [trades, from, to])
  const rows = useMemo(() => groupPerformance(selected, dimension), [selected, dimension])
  return <div className="page-content journal-editor"><div className="page-heading"><div><h1>Reports</h1><p>Compare your results across the selected journal and account.</p></div></div><section className="panel editor-section"><div className="editor-form"><label>Group by<select value={dimension} onChange={(event) => setDimension(event.target.value as typeof dimension)}><option value="pair">Pair</option><option value="side">Direction</option><option value="setup">Strategy</option></select></label><label>From<input type="date" value={from} onChange={(event) => setFrom(event.target.value)}/></label><label>To<input type="date" value={to} onChange={(event) => setTo(event.target.value)}/></label></div>{from && to && from > to ? <p role="alert" className="negative">The start date must be before the end date.</p> : <><p>{selected.length} trades in this period. Profit factor uses net winning and losing trades; — means there are no losing trades.</p><div className="table-scroll"><table className="trade-table"><thead><tr><th>Group</th><th>Trades</th><th>Net P&amp;L</th><th>Win rate</th><th>Profit factor</th></tr></thead><tbody>{rows.length ? rows.map((row) => <tr key={row.label}><td>{row.label}</td><td>{row.trades}</td><td className={row.netPnl >= 0 ? 'positive' : 'negative'}>{formatSignedMoney(row.netPnl)}</td><td>{row.winRate.toFixed(1)}%</td><td>{row.profitFactor === null ? '—' : row.profitFactor.toFixed(2)}</td></tr>) : <tr><td colSpan={5}>No trades in this period.</td></tr>}</tbody></table></div></>}</section></div>
}
