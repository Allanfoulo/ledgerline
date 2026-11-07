import { useEffect, useMemo, useRef, useState } from 'react'
import { dayNotes, trades as tradeFixtures } from './data/trades'
import { byDay, calendarTotals, enrichedTrades, equitySeries, formatMoney, formatPrice, formatSignedMoney, monthLabel, shortDate, summarize, weekDates, weekStart, weekday } from './lib/analytics'
import type { TradeWithPnl } from './types'
import Replay from './Replay'
import { useBackend } from './Backend'
import { tradeSignature } from './application/alignSamples'
import JournalEditor from './JournalEditor'
import { StrategyPage, TradeStrategy } from './StrategyPage'
import Reports from './Reports'
import Backtest from './Backtest'

type Page = 'dashboard' | 'trades' | 'notes' | 'detail' | 'settings' | 'manage' | 'strategies' | 'reports' | 'backtest'
type TradesTab = 'Day' | 'Week' | 'All'
const latestSampleDate = tradeFixtures.map((trade) => trade.date).sort().at(-1) ?? ''

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const }
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="3.5" width="7" height="7" rx="1.5"/><rect x="3.5" y="13.5" width="7" height="7" rx="1.5"/><rect x="13.5" y="13.5" width="7" height="7" rx="1.5"/></>,
    chart: <><path d="M4 19V5"/><path d="M4 19h16"/><path d="m7 15 4-4 3 2 5-6"/><path d="M16 7h3v3"/></>,
    book: <><path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H20v18H7.5A2.5 2.5 0 0 0 5 22z"/><path d="M5 4.5v15A2.5 2.5 0 0 1 7.5 17H20"/><path d="M9 7h7"/></>,
    search: <><circle cx="10.8" cy="10.8" r="6.3"/><path d="m16 16 4.5 4.5"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    down: <path d="m7 10 5 5 5-5"/>,
    left: <path d="m15 18-6-6 6-6"/>,
    right: <path d="m9 18 6-6-6-6"/>,
    plus: <><path d="M12 5v14"/><path d="M5 12h14"/></>,
    filter: <><path d="M4 6h16"/><path d="M7 12h10"/><path d="M10 18h4"/></>,
    download: <><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></>,
    more: <><circle cx="5" cy="12" r=".8" fill="currentColor"/><circle cx="12" cy="12" r=".8" fill="currentColor"/><circle cx="19" cy="12" r=".8" fill="currentColor"/></>,
    arrow: <><path d="M5 12h14"/><path d="m13 6 6 6-6 6"/></>,
    close: <><path d="m6 6 12 12"/><path d="M18 6 6 18"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
  }
  return <svg {...common}>{paths[name] ?? paths.grid}</svg>
}

function currencyClass(value: number) { return value > 0 ? 'positive' : value < 0 ? 'negative' : 'neutral' }

function ProfileMenu({ signOut, openSettings }: { signOut: () => Promise<void>; openSettings: () => void }) {
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const menu = useRef<HTMLDivElement>(null)
  const trigger = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => { if (!menu.current?.contains(event.target as Node)) setOpen(false) }
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); trigger.current?.focus() } }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => { document.removeEventListener('pointerdown', onPointerDown); document.removeEventListener('keydown', onKeyDown) }
  }, [open])
  return <div className="profile-menu" ref={menu}>
    <button ref={trigger} className="profile-button" type="button" aria-label="Account menu" aria-expanded={open} aria-controls="profile-menu-content" onClick={() => { setOpen((value) => !value); setError('') }}><span className="profile-avatar">M</span><span>My journal</span><Icon name="down" size={14}/></button>
    {open && <div className="profile-menu-content" id="profile-menu-content" aria-label="Account options">
      <button type="button" onClick={() => { setOpen(false); openSettings() }}>Settings</button>
      <button type="button" disabled={busy} onClick={() => { setError(''); setBusy(true); void signOut().catch(() => setError('Could not sign out. Check your connection and try again.')).finally(() => setBusy(false)) }}>{busy ? 'Signing out…' : 'Sign out'}</button>
      {error && <p role="alert">{error}</p>}
    </div>}
  </div>
}

function App() {
  const backend = useBackend()
  const [dataset, setDataset] = useState<'sample' | 'real'>('sample')
  const sampleTrades = useMemo(() => enrichedTrades(tradeFixtures.map((trade) => {
    const prices = backend.samplePrices[trade.id]
    if (!prices || prices.signature !== tradeSignature(trade)) return { ...trade, source: 'sample' as const }
    return { ...trade, source: 'sample' as const, historicalAligned: true, entry: prices.entry, exit: prices.exit, note: 'Sample trade aligned to historical candle prices. Add your own review.', executions: trade.executions.map((execution, index) => ({ ...execution, price: index === 0 ? prices.entry : prices.exit })) }
  })), [backend.samplePrices])
  const allTrades = useMemo(() => dataset === 'sample' ? sampleTrades : enrichedTrades(backend.realTrades.map((trade) => { const review = backend.reviews.find((item) => item.tradeId === trade.id); const strategy = backend.strategies.find((item) => item.id === review?.strategyId); return strategy ? { ...trade, setup: strategy.name } : trade })), [dataset, sampleTrades, backend.realTrades, backend.reviews, backend.strategies])
  const [page, setPage] = useState<Page>('dashboard')
  const [activeTab, setActiveTab] = useState<TradesTab>('All')
  const [selectedTradeId, setSelectedTradeId] = useState<string | null>(null)
  const [selectedDate, setSelectedDate] = useState(latestSampleDate)
  const [search, setSearch] = useState('')
  const [pairFilter, setPairFilter] = useState('All pairs')
  const [dayNoteEdits, setDayNoteEdits] = useState<Record<string, string>>({})
  const [tradeNoteEdits, setTradeNoteEdits] = useState<Record<string, string>>({})
  const [noteSaved, setNoteSaved] = useState(false)
  const [calendarMonth, setCalendarMonth] = useState(new Date(2026, 10, 1))
  const [sortNewest, setSortNewest] = useState(true)

  const groups = useMemo(() => byDay(allTrades), [allTrades])
  const dayKey = (date: string) => dataset === 'sample' ? date : `real:${backend.accountId}:${date}`
  const dayNoteFor = (date: string) => dayNoteEdits[dayKey(date)] ?? backend.dayNotes[dayKey(date)] ?? (dataset === 'sample' ? dayNotes[date] : '') ?? ''
  const currentDayNotes = Object.fromEntries(Object.keys(groups).map((date) => [date, dayNoteFor(date)]))
  const selectedTrade = allTrades.find((trade) => trade.id === selectedTradeId) ?? null
  const visibleTrades = allTrades
    .filter((trade) => pairFilter === 'All pairs' || trade.pair === pairFilter)
    .filter((trade) => `${trade.pair} ${trade.setup} ${trade.tags.join(' ')}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (sortNewest ? b.date.localeCompare(a.date) || b.entryTime.localeCompare(a.entryTime) : a.date.localeCompare(b.date) || a.entryTime.localeCompare(b.entryTime)))

  function goToTrade(trade: TradeWithPnl) {
    setSelectedTradeId(trade.id)
    setSelectedDate(trade.exitDate ?? trade.date)
    setPage('detail')
    setNoteSaved(false)
  }

  function selectDay(date: string) {
    setSelectedDate(date)
    setActiveTab('Day')
    setPage('trades')
  }
  useEffect(() => {
    if (dataset === 'real' && backend.tradesLoading) return
    const latestTrade = [...allTrades].sort((a, b) => (b.exitDate ?? b.date).localeCompare(a.exitDate ?? a.date))[0]
    const latest = latestTrade?.exitDate ?? latestTrade?.date ?? new Date().toISOString().slice(0, 10)
    setSelectedDate(latest)
    setCalendarMonth(new Date(`${latest}T12:00:00`))
    setSelectedTradeId(null)
  }, [dataset, backend.accountId, backend.tradesLoading])

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-lockup">
          <div className="brand-symbol"><span/><span/><span/></div>
          <div className="brand-copy"><strong>Ledgerline</strong><small>PERSONAL FX JOURNAL</small></div>
        </div>
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="primary-nav" aria-label="Main navigation">
          <button className={`nav-item ${page === 'dashboard' ? 'active' : ''}`} onClick={() => setPage('dashboard')}><Icon name="grid"/><span>Dashboard</span></button>
          <button className={`nav-item ${page === 'trades' || page === 'detail' ? 'active' : ''}`} onClick={() => { setPage('trades'); setActiveTab('All') }}><Icon name="chart"/><span>Trades</span><span className="nav-count">{allTrades.length}</span></button>
          <button className={`nav-item ${page === 'notes' ? 'active' : ''}`} onClick={() => setPage('notes')}><Icon name="book"/><span>Notebook</span></button>
          <button className={`nav-item ${page === 'manage' ? 'active' : ''}`} onClick={() => setPage('manage')}><Icon name="plus"/><span>Add trades</span></button>
          <button className={`nav-item ${page === 'strategies' ? 'active' : ''}`} onClick={() => setPage('strategies')}><Icon name="book"/><span>Strategies</span></button>
          <button className={`nav-item ${page === 'reports' ? 'active' : ''}`} onClick={() => setPage('reports')}><Icon name="chart"/><span>Reports</span></button>
          <button className={`nav-item ${page === 'backtest' ? 'active' : ''}`} onClick={() => setPage('backtest')}><Icon name="chart"/><span>Backtest</span></button>
          <button className={`nav-item ${page === 'settings' ? 'active' : ''}`} onClick={() => setPage('settings')}><Icon name="filter"/><span>Settings</span></button>
        </nav>
        <div className="sidebar-bottom">
          <div className="account-card">
            <div className="avatar">FX</div>
            <div className="account-copy"><strong>{dataset === 'sample' ? 'Sample account' : backend.accounts.find((account) => account.id === backend.accountId)?.name ?? 'Select an account'}</strong><span>USD · {dataset === 'sample' ? 'Demo journal' : 'Personal journal'}</span></div>
            <Icon name="down" size={15}/>
          </div>
          <div className="sidebar-footnote"><span className="status-dot"/> {dataset === 'sample' ? 'Sample journal' : 'Personal journal'}</div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumb"><span>Journal</span><Icon name="chevron" size={14}/><strong>{page === 'detail' ? 'Trade detail' : pageTitle(page)}</strong></div>
          <div className="topbar-actions"><label className="dataset-picker"><span className="sr-only">Journal data</span><select value={dataset} onChange={(event) => { setDataset(event.target.value as 'sample' | 'real'); if (page === 'detail') setPage('trades') }}><option value="sample">Sample trades</option><option value="real" disabled={!backend.authenticated}>My trades</option></select></label>{dataset === 'real' && <label className="dataset-picker"><span className="sr-only">Trading account</span><select value={backend.accountId} onChange={(event) => { backend.setAccountId(event.target.value); if (page === 'detail') setPage('trades') }}><option value="">Choose account</option>{backend.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>}<button className="icon-button mobile-menu" aria-label="Open menu"><Icon name="grid"/></button><ProfileMenu signOut={backend.signOut} openSettings={() => setPage('settings')}/></div>
        </header>
        {backend.error && page !== 'settings' && <div className="page-content replay-error" role="alert">{backend.error}</div>}

        {page === 'dashboard' && <Dashboard sample={dataset === 'sample'} trades={allTrades} month={calendarMonth} setMonth={setCalendarMonth} onSelectDay={selectDay} onOpenTrade={goToTrade} onOpenAll={() => { setPage('trades'); setActiveTab('All') }} />}
        {page === 'trades' && <TradesPage trades={allTrades} visibleTrades={visibleTrades} groups={groups} selectedDate={selectedDate} setSelectedDate={setSelectedDate} activeTab={activeTab} setActiveTab={setActiveTab} search={search} setSearch={setSearch} pairFilter={pairFilter} setPairFilter={setPairFilter} sortNewest={sortNewest} setSortNewest={setSortNewest} dayNote={dayNoteFor(selectedDate)} setDayNote={(value) => { const key = dayKey(selectedDate); setDayNoteEdits((notes) => ({ ...notes, [key]: value })); if (dataset === 'sample' || backend.accountId) backend.saveNote('day', key, value) }} onOpenTrade={goToTrade} onSelectDay={selectDay} />}
        {page === 'detail' && selectedTrade && <TradeDetail trade={selectedTrade} dayNote={dayNoteFor(selectedTrade.exitDate ?? selectedTrade.date)} tradeNote={tradeNoteEdits[selectedTrade.id] ?? backend.tradeNotes[selectedTrade.id] ?? selectedTrade.note} setTradeNote={(value) => { setTradeNoteEdits((notes) => ({ ...notes, [selectedTrade.id]: value })); setNoteSaved(false) }} noteSaved={noteSaved} onSaveNote={() => { backend.saveNote('trade', selectedTrade.id, tradeNoteEdits[selectedTrade.id] ?? backend.tradeNotes[selectedTrade.id] ?? selectedTrade.note); setNoteSaved(backend.authenticated) }} onBack={() => { setPage('trades'); setActiveTab('All') }} />}
        {page === 'notes' && <Notebook trades={allTrades} dayNoteEdits={currentDayNotes} onSelectDay={selectDay} />}
        {page === 'manage' && <JournalEditor onViewTrades={() => { setDataset('real'); setPage('trades'); setActiveTab('All') }} />}
        {page === 'strategies' && <StrategyPage />}
        {page === 'reports' && <Reports trades={allTrades} />}
        {page === 'backtest' && <Backtest />}
        {page === 'settings' && <div className="page-content"><PageHeading title="Settings" description="Manage your account and market data connection."/><section className="panel settings-panel">{backend.settings}{backend.error && <p className="replay-error" role="alert">{backend.error}</p>}</section></div>}
      </main>
    </div>
  )
}

function pageTitle(page: Page) { return page === 'dashboard' ? 'Dashboard' : page === 'trades' ? 'Trades' : page === 'notes' ? 'Notebook' : page === 'settings' ? 'Settings' : page === 'manage' ? 'Accounts & trades' : page === 'strategies' ? 'Strategies' : page === 'reports' ? 'Reports' : page === 'backtest' ? 'Backtest' : 'Trade detail' }

function PageHeading({ title, description, actions }: { title: string; description: string; actions?: React.ReactNode }) {
  return <div className="page-heading"><div><h1>{title}</h1><p>{description}</p></div>{actions && <div className="heading-actions">{actions}</div>}</div>
}

function Metric({ label, value, detail, tone = 'neutral', icon }: { label: string; value: string; detail: string; tone?: string; icon: string }) {
  return <div className="metric"><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon name={icon} size={17}/></span></div><div className={`metric-value ${tone}`}>{value}</div><div className="metric-detail">{detail}</div></div>
}

function Dashboard({ sample, trades, month, setMonth, onSelectDay, onOpenTrade, onOpenAll }: { sample: boolean; trades: TradeWithPnl[]; month: Date; setMonth: (date: Date) => void; onSelectDay: (date: string) => void; onOpenTrade: (trade: TradeWithPnl) => void; onOpenAll: () => void }) {
  const [period, setPeriod] = useState('all'); const [pair, setPair] = useState('all')
  const now = new Date(); const today = now.toISOString().slice(0, 10); const cutoff = new Date(now); cutoff.setUTCDate(cutoff.getUTCDate() - 29)
  const shownTrades = trades.filter((trade) => (pair === 'all' || trade.pair === pair) && (period === 'all' || ((trade.exitDate ?? trade.date) >= cutoff.toISOString().slice(0, 10) && (trade.exitDate ?? trade.date) <= today)))
  const groups = byDay(shownTrades); const totals = calendarTotals(shownTrades)
  const summary = summarize(shownTrades)
  const curve = equitySeries(shownTrades)
  const firstDate = curve[0]?.date ?? ''
  const lastDate = curve.at(-1)?.date ?? ''
  return <div className="page-content">
    <PageHeading title="Your trading, in focus." description="A clear read on the decisions behind your results." actions={<><label className="dataset-picker"><span className="sr-only">Dashboard period</span><select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="all">All time</option><option value="30">Last 30 days</option></select></label><label className="dataset-picker"><span className="sr-only">Dashboard pair</span><select value={pair} onChange={(event) => setPair(event.target.value)}><option value="all">All pairs</option><option>EUR/USD</option><option>GBP/USD</option><option>AUD/USD</option><option>XAU/USD</option></select></label></>}/>
    <section className="metrics-row" aria-label="Performance summary">
      <Metric label="Net P&L" value={formatSignedMoney(summary.netPnl)} detail={`${summary.trades} closed trades · after fees`} tone={currencyClass(summary.netPnl)} icon="chart"/>
      <Metric label="Win rate" value={`${summary.winRate.toFixed(1)}%`} detail={`${summary.winners} wins of ${summary.trades} trades`} icon="grid"/>
      <Metric label="Profit factor" value={Number.isFinite(summary.profitFactor) ? summary.profitFactor.toFixed(2) : '∞'} detail="Net winning trades ÷ net losing trades" icon="book"/>
      <Metric label="Average win / loss" value={`${formatMoney(summary.averageWin, true)} / ${formatMoney(summary.averageLoss, true)}`} detail="Per winning / losing trade" icon="chart"/>
    </section>
    <section className="primary-grid">
      <PnlCalendar month={month} setMonth={setMonth} totals={totals} groups={groups} onSelectDay={onSelectDay}/>
      <EquityPanel trades={shownTrades} curve={curve} firstDate={firstDate} lastDate={lastDate}/>
    </section>
    <section className="panel recent-panel">
      <div className="panel-heading"><div><h2>Recent trades</h2><p>Your latest decisions, with the result attached.</p></div><button className="text-button" onClick={onOpenAll}>View all trades <Icon name="arrow" size={15}/></button></div>
      <TradeTable trades={[...shownTrades].sort((a, b) => b.date.localeCompare(a.date) || b.entryTime.localeCompare(a.entryTime)).slice(0, 5)} onOpenTrade={onOpenTrade}/>
    </section>
    <div className="demo-note"><span className="status-dot"/>{sample ? 'Illustrative sample trades.' : 'Your selected account.'} Results are calculated from the displayed Forex fills and fees.</div>
  </div>
}

function PnlCalendar({ month, setMonth, totals, groups, onSelectDay }: { month: Date; setMonth: (date: Date) => void; totals: Record<string, number>; groups: Record<string, TradeWithPnl[]>; onSelectDay: (date: string) => void }) {
  const year = month.getFullYear()
  const monthIndex = month.getMonth()
  const start = new Date(year, monthIndex, 1)
  const offset = (start.getDay() + 6) % 7
  const totalDays = new Date(year, monthIndex + 1, 0).getDate()
  const cells = Array.from({ length: Math.ceil((offset + totalDays) / 7) * 7 }, (_, i) => {
    const dayNumber = i - offset + 1
    if (dayNumber < 1 || dayNumber > totalDays) return null
    const date = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`
    return { date, dayNumber, value: totals[date], count: groups[date]?.length ?? 0 }
  })
  const monthNet = Object.entries(totals).filter(([date]) => date.startsWith(`${year}-${String(monthIndex + 1).padStart(2, '0')}`)).reduce((sum, [, value]) => sum + value, 0)
  return <div className="panel calendar-panel">
    <div className="panel-heading calendar-heading"><div><h2>Daily P&L</h2><p>Each session, in context.</p></div><div className="calendar-tools"><button className="text-button" aria-label="Previous month" onClick={() => setMonth(new Date(year, monthIndex - 1, 1))}><Icon name="left" size={16}/></button><strong>{monthLabel(month)}</strong><button className="text-button" aria-label="Next month" onClick={() => setMonth(new Date(year, monthIndex + 1, 1))}><Icon name="right" size={16}/></button></div></div>
    <div className="calendar-weekdays">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <span key={day}>{day}</span>)}</div>
    <div className="calendar-grid">{cells.map((cell, index) => cell ? <button className={`calendar-day ${cell.value !== undefined ? currencyClass(cell.value) : 'no-trades'} ${cell.date === Object.keys(groups).sort().at(-1) ? 'latest-day' : ''}`} key={cell.date} onClick={() => onSelectDay(cell.date)} aria-label={`${cell.date}, ${cell.count} trades, ${cell.value === undefined ? 'no result' : formatSignedMoney(cell.value)}`}>
      <span className="day-number">{cell.dayNumber}</span>{cell.value !== undefined ? <><span className="day-pnl">{formatSignedMoney(cell.value)}</span><span className="day-trades">{cell.count} {cell.count === 1 ? 'trade' : 'trades'}</span></> : <span className="day-empty">—</span>}
    </button> : <div className="calendar-blank" key={`blank-${index}`}/>)}</div>
    <div className="calendar-footer"><div><span className="legend-mark profit-mark"/>Profit <span className="legend-mark loss-mark"/>Loss</div><div>Month net <strong className={currencyClass(monthNet)}>{formatSignedMoney(monthNet)}</strong></div></div>
  </div>
}

function EquityPanel({ trades, curve, firstDate, lastDate }: { trades: TradeWithPnl[]; curve: { id: string; date: string; value: number }[]; firstDate: string; lastDate: string }) {
  const width = 590; const height = 204; const pad = { left: 3, right: 10, top: 15, bottom: 18 }
  const values = curve.map((item) => item.value)
  const min = Math.min(0, ...values); const max = Math.max(1, ...values); const range = max - min || 1
  const points = curve.map((item, i) => ({ x: pad.left + (i / Math.max(curve.length - 1, 1)) * (width - pad.left - pad.right), y: pad.top + ((max - item.value) / range) * (height - pad.top - pad.bottom), ...item }))
  const line = points.map((point, i) => `${i ? 'L' : 'M'} ${point.x} ${point.y}`).join(' ')
  const area = `${line} L ${points.at(-1)?.x ?? width} ${height - pad.bottom} L ${points[0]?.x ?? 0} ${height - pad.bottom} Z`
  const summary = summarize(trades)
  return <div className="panel equity-panel">
    <div className="panel-heading"><div><h2>Equity curve</h2><p>Cumulative net P&L across your trades.</p></div><span className="chart-period">ALL TRADES</span></div>
    <div className="equity-summary"><strong className={currencyClass(summary.netPnl)}>{formatSignedMoney(summary.netPnl)}</strong><span>Net performance</span></div>
    <div className="chart-wrap"><svg className="equity-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Equity curve from ${formatSignedMoney(values[0] ?? 0)} to ${formatSignedMoney(values.at(-1) ?? 0)}`}>
      {[0, 1, 2, 3].map((i) => { const y = pad.top + i * ((height - pad.top - pad.bottom) / 3); const v = max - i * range / 3; return <g key={i}><line x1="0" x2={width} y1={y} y2={y} className="chart-gridline"/><text x="0" y={y - 5} className="chart-axis-label">{formatMoney(v, true)}</text></g> })}
      {points.length > 0 && <><path d={area} className="chart-area"/><path d={line} className="chart-line"/></>}
      {points.map((point, i) => <circle key={point.id} cx={point.x} cy={point.y} r={i === points.length - 1 ? 4 : 2.2} className="chart-point"/>)}
    </svg></div>
    <div className="chart-dates"><span>{shortDate(firstDate)}</span><span>{shortDate(lastDate)}</span></div>
    <div className="equity-foot"><span><i className="line-key"/>Account equity</span><span>{trades.length} trades logged</span></div>
  </div>
}

function TradeTable({ trades, onOpenTrade, compact = false }: { trades: TradeWithPnl[]; onOpenTrade: (trade: TradeWithPnl) => void; compact?: boolean }) {
  return <div className="table-scroll"><table className={`trade-table ${compact ? 'compact' : ''}`}>
    <thead><tr><th>Date</th><th>Pair / setup</th><th>Side</th><th>Lots</th><th>Entry → exit</th><th>Move</th><th>Net P&L</th><th><span className="sr-only">Open trade</span></th></tr></thead>
    <tbody>{trades.length ? trades.map((trade) => <tr key={trade.id} onClick={() => onOpenTrade(trade)} tabIndex={0} onKeyDown={(event) => event.key === 'Enter' && onOpenTrade(trade)}>
      <td><span className="table-date">{shortDate(trade.date)}</span><small>{trade.entryTime}</small></td>
      <td><span className="pair-name">{trade.pair}</span><small>{trade.setup}</small></td>
      <td><span className={`side-tag ${trade.side.toLowerCase()}`}>{trade.side}</span></td>
      <td className="numeric">{trade.lots.toFixed(2)}</td>
      <td className="numeric price-range">{formatPrice(trade.entry)} <span>→</span> {formatPrice(trade.exit)}</td>
      <td className={`numeric ${currencyClass(trade.pips)}`}>{trade.pips > 0 ? '+' : ''}{trade.pips.toFixed(1)} {trade.pair === 'XAU/USD' ? 'ticks' : 'pips'}</td>
      <td className={`numeric pnl-cell ${currencyClass(trade.netPnl)}`}>{formatSignedMoney(trade.netPnl)}</td>
      <td><button className="row-open" aria-label={`Open ${trade.pair} trade`} onClick={(event) => { event.stopPropagation(); onOpenTrade(trade) }}><Icon name="chevron" size={15}/></button></td>
    </tr>) : <tr><td colSpan={8} className="empty-state">No trades match these filters.</td></tr>}</tbody>
  </table></div>
}

function TradesPage({ trades, visibleTrades, groups, selectedDate, setSelectedDate, activeTab, setActiveTab, search, setSearch, pairFilter, setPairFilter, sortNewest, setSortNewest, dayNote, setDayNote, onOpenTrade, onSelectDay }: { trades: TradeWithPnl[]; visibleTrades: TradeWithPnl[]; groups: Record<string, TradeWithPnl[]>; selectedDate: string; setSelectedDate: (date: string) => void; activeTab: TradesTab; setActiveTab: (tab: TradesTab) => void; search: string; setSearch: (value: string) => void; pairFilter: string; setPairFilter: (value: string) => void; sortNewest: boolean; setSortNewest: (value: boolean) => void; dayNote: string; setDayNote: (value: string) => void; onOpenTrade: (trade: TradeWithPnl) => void; onSelectDay: (date: string) => void }) {
  const [weekOffset, setWeekOffset] = useState(0)
  const days = Object.keys(groups).sort((a, b) => a.localeCompare(b))
  const selectedDay = groups[selectedDate] ?? []
  const daySummary = summarize(selectedDay)
  const weekStarts = [...new Set(days.map(weekStart))].sort((a, b) => b.localeCompare(a))
  const activeWeekStart = weekStarts[weekOffset]
  const week = activeWeekStart ? weekDates(activeWeekStart) : []
  const weekTrades = week.flatMap((date) => groups[date] ?? [])
  const weekSummary = summarize(weekTrades)
  const weekGross = weekTrades.reduce((sum, trade) => sum + trade.grossPnl, 0)
  const weekCommission = weekTrades.reduce((sum, trade) => sum + trade.commission, 0)
  const weekStats = [
    { label: 'Net P&L', value: formatSignedMoney(weekSummary.netPnl), tone: currencyClass(weekSummary.netPnl) },
    { label: 'Gross P&L', value: formatSignedMoney(weekGross), tone: currencyClass(weekGross) },
    { label: 'Trades', value: String(weekSummary.trades), tone: '' },
    { label: 'Win rate', value: `${weekSummary.winRate.toFixed(1)}%`, tone: '' },
    { label: 'Winners / losers', value: `${weekSummary.winners} / ${weekSummary.trades - weekSummary.winners}`, tone: '' },
    { label: 'Commissions', value: formatMoney(weekCommission), tone: '' },
    { label: 'Profit factor', value: Number.isFinite(weekSummary.profitFactor) ? weekSummary.profitFactor.toFixed(2) : '∞', tone: '' },
  ]
  return <div className="page-content">
    <PageHeading title="Trade review" description="Find the pattern in the trades you have taken." actions={<button className="button button-quiet"><Icon name="download" size={16}/> Export view</button>}/>
    <div className="tabs" role="tablist" aria-label="Trade review view">{(['Day', 'Week', 'All'] as TradesTab[]).map((tab) => <button key={tab} className={activeTab === tab ? 'selected' : ''} role="tab" aria-selected={activeTab === tab} onClick={() => setActiveTab(tab)}>{tab}{tab === 'All' && <span className="tab-count">{trades.length}</span>}</button>)}</div>
    {activeTab === 'Day' && <>
      <section className="day-toolbar"><div><span className="section-label">SESSION</span><label className="date-select"><Icon name="calendar" size={16}/><select value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)}>{!days.includes(selectedDate) && <option value={selectedDate}>{days.length ? `${weekday(selectedDate, true)}, ${shortDate(selectedDate)} · No trades` : 'No trading sessions yet'}</option>}{days.map((date) => <option value={date} key={date}>{weekday(date, true)}, {shortDate(date)}</option>)}</select><Icon name="down" size={14}/></label></div><div className="day-nudge"><button className="text-button" disabled={!days.length || days.indexOf(selectedDate) === 0} onClick={() => setSelectedDate(days[Math.max(0, days.indexOf(selectedDate) - 1)])}><Icon name="left" size={16}/> Previous</button><button className="text-button" disabled={!days.length || days.indexOf(selectedDate) === days.length - 1} onClick={() => setSelectedDate(days[Math.min(days.length - 1, days.indexOf(selectedDate) + 1)])}>Next <Icon name="right" size={16}/></button></div></section>
      <section className="metrics-row day-metrics"><Metric label="Net P&L" value={formatSignedMoney(daySummary.netPnl)} detail="After commissions and swap" tone={currencyClass(daySummary.netPnl)} icon="chart"/><Metric label="Trades" value={`${daySummary.trades}`} detail={`${daySummary.winners} winners · ${daySummary.trades - daySummary.winners} non-winners`} icon="grid"/><Metric label="Win rate" value={`${daySummary.winRate.toFixed(1)}%`} detail="For this session" icon="book"/></section>
      <div className="review-grid"><section className="panel day-trades-panel"><div className="panel-heading"><div><h2>{weekday(selectedDate, true)} · {shortDate(selectedDate)}</h2><p>{selectedDay.length} closed {selectedDay.length === 1 ? 'trade' : 'trades'} in this session</p></div><span className={`session-result ${currencyClass(daySummary.netPnl)}`}>{formatSignedMoney(daySummary.netPnl)}</span></div><TradeTable trades={selectedDay} onOpenTrade={onOpenTrade}/></section><DayNote note={dayNote} setNote={setDayNote}/></div>
    </>}
    {activeTab === 'Week' && <section className="panel week-panel">
      <div className="panel-heading"><div><h2>Weekly rhythm</h2><p>Daily results across the calendar week.</p></div><div className="calendar-tools"><button className="text-button" onClick={() => setWeekOffset((offset) => offset + 1)} disabled={weekOffset >= weekStarts.length - 1} aria-label="Previous week"><Icon name="left" size={16}/></button><strong>{week.length ? `${shortDate(week[0])} – ${shortDate(week.at(-1)!)}` : 'No sessions'}</strong><button className="text-button" onClick={() => setWeekOffset((offset) => Math.max(0, offset - 1))} disabled={weekOffset === 0} aria-label="Next week"><Icon name="right" size={16}/></button></div></div>
      <div className="week-grid">{week.map((date) => { const items = groups[date] ?? []; const dayTotal = summarize(items).netPnl; return items.length ? <button className={`week-day ${currencyClass(dayTotal)}`} key={date} onClick={() => onSelectDay(date)}><span className="week-day-name">{weekday(date)}</span><strong>{shortDate(date)}</strong><span className="week-day-value">{formatSignedMoney(dayTotal)}</span><span className="week-day-trades">{items.length} {items.length === 1 ? 'trade' : 'trades'}</span><span className="week-bar"><i style={{ width: `${Math.min(100, Math.max(14, Math.abs(dayTotal) / 4))}%` }}/></span></button> : <div className="week-day empty" key={date} aria-label={`${weekday(date, true)}, ${shortDate(date)}, no trades`}><span className="week-day-name">{weekday(date)}</span><strong>{shortDate(date)}</strong><span className="week-day-value">—</span><span className="week-day-trades">No trades</span><span className="week-bar"/></div> })}</div>
      <div className="week-stats">{weekStats.map((stat) => <div key={stat.label}><span>{stat.label}</span><strong className={stat.tone}>{stat.value}</strong></div>)}</div>
      <div className="week-table"><div className="panel-heading"><div><h2>Trades this week</h2><p>{weekTrades.length} closed trades, sorted by date.</p></div></div><TradeTable trades={weekTrades} onOpenTrade={onOpenTrade}/></div>
    </section>}
    {activeTab === 'All' && <section className="panel all-trades-panel"><div className="panel-heading"><div><h2>All trades</h2><p>{visibleTrades.length} of {trades.length} trades · click a row to open details</p></div></div><div className="table-controls"><label className="search-field"><Icon name="search" size={16}/><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search pair, setup, or tag"/></label><label className="select-control"><select value={pairFilter} onChange={(event) => setPairFilter(event.target.value)}><option>All pairs</option><option>EUR/USD</option><option>GBP/USD</option><option>AUD/USD</option><option>XAU/USD</option></select><Icon name="down" size={14}/></label><button className="text-button" onClick={() => setSortNewest(!sortNewest)}>{sortNewest ? 'Newest first' : 'Oldest first'} <Icon name="down" size={14}/></button></div><TradeTable trades={visibleTrades} onOpenTrade={onOpenTrade}/><div className="table-footer">Showing {visibleTrades.length} trades</div></section>}
  </div>
}

function DayNote({ note, setNote }: { note: string; setNote: (value: string) => void }) {
  return <section className="panel day-note-panel"><div className="panel-heading"><div><h2>Day note</h2><p>Plan and reflection for this session.</p></div></div><textarea aria-label="Day note" value={note} onChange={(event) => setNote(event.target.value)} placeholder="What was your plan? What did you notice?"/><div className="note-hint">Notes save when signed in. Otherwise, changes reset on reload.</div></section>
}

function TradeDetail({ trade, dayNote, tradeNote, setTradeNote, noteSaved, onSaveNote, onBack }: { trade: TradeWithPnl; dayNote: string; tradeNote: string; setTradeNote: (value: string) => void; noteSaved: boolean; onSaveNote: () => void; onBack: () => void }) {
  const backend = useBackend()
  return <div className="page-content detail-content">
    <button className="back-button" onClick={onBack}><Icon name="left" size={16}/> Back to trades</button>
    <PageHeading title={`${trade.pair} · ${trade.side}`} description={`${shortDate(trade.date)} ${trade.entryTime} – ${shortDate(trade.exitDate ?? trade.date)} ${trade.exitTime} UTC`} actions={<button className="button button-quiet"><Icon name="more" size={17}/> More</button>}/>
    <section className="detail-hero panel"><div className="detail-instrument"><span className={`side-tag ${trade.side.toLowerCase()}`}>{trade.side}</span><span>{trade.lots.toFixed(2)} lots</span><span className="detail-sep"/><span>{trade.setup}</span></div><div className="detail-pnl"><span>NET RESULT</span><strong className={currencyClass(trade.netPnl)}>{formatSignedMoney(trade.netPnl)}</strong></div><div className="detail-breakdown"><div><span>{trade.pair === 'XAU/USD' ? 'Ticks (0.001)' : 'Pips'}</span><strong className={currencyClass(trade.pips)}>{trade.pips > 0 ? '+' : ''}{trade.pips.toFixed(1)}</strong></div><div><span>Gross P&L</span><strong>{formatSignedMoney(trade.grossPnl)}</strong></div><div><span>Commission</span><strong className="negative">−{formatMoney(trade.commission)}</strong></div><div><span>Swap</span><strong>{trade.swap ? formatSignedMoney(-trade.swap) : formatMoney(0)}</strong></div></div></section>
    <Replay key={trade.id} trade={trade}/>
    <div className="detail-columns"><div className="detail-main-column">
      {trade.source === 'real' && <TradeStrategy tradeId={trade.id}/>}
      <section className="panel execution-panel"><div className="panel-heading"><div><h2>Execution</h2><p>Entry and exit fills for this trade.</p></div><span className="execution-count">{trade.executions.length} fills</span></div><div className="execution-table"><div className="execution-row execution-head"><span>Time</span><span>Action</span><span>Price</span><span>Size</span></div>{trade.executions.map((execution, index) => <div className="execution-row" key={`${trade.id}-${index}`}><span>{trade.exitDate && trade.exitDate !== trade.date ? `${shortDate(execution.date ?? trade.date)} ` : ""}{execution.time}</span><span><i className={`execution-dot ${execution.action.toLowerCase()}`}/>{execution.action}</span><strong>{formatPrice(execution.price)}</strong><span>{execution.lots.toFixed(2)} lots</span></div>)}</div><div className="entry-exit-line"><div><span>Entry</span><strong>{formatPrice(trade.entry)}</strong><small>{shortDate(trade.date)} {trade.entryTime}</small></div><div className="price-track"><span/><i/></div><div><span>Exit</span><strong>{formatPrice(trade.exit)}</strong><small>{shortDate(trade.exitDate ?? trade.date)} {trade.exitTime}</small></div></div></section>
      <section className="panel detail-note"><div className="panel-heading"><div><h2>Trade note</h2><p>Keep the context attached to the decision.</p></div><span className="note-state">{!backend.authenticated ? 'SIGN IN TO SAVE' : noteSaved ? 'SAVE REQUESTED' : 'EDITING'}</span></div><textarea aria-label="Trade note" value={tradeNote} onChange={(event) => setTradeNote(event.target.value)} placeholder="Add your observation about this trade…"/><div className="note-actions"><div className="tag-list">{trade.tags.map((tag) => <span className="trade-tag" key={tag}>{tag}</span>)}</div><button className="button button-primary" onClick={onSaveNote} disabled={!backend.authenticated}>Save note</button></div></section>
    </div><aside className="detail-side-column"><section className="panel trade-context"><div className="panel-heading"><div><h2>Trade context</h2><p>Setup and process tags.</p></div></div><div className="context-row"><span>Strategy</span><strong>{trade.setup}</strong></div>{trade.brokerSymbol && <div className="context-row"><span>Broker symbol</span><strong>{trade.brokerSymbol}</strong></div>}<div className="context-row"><span>Direction</span><strong>{trade.side}</strong></div><div className="context-row"><span>Position size</span><strong>{trade.lots.toFixed(2)} lots</strong></div><div className="context-row"><span>Duration</span><strong>{duration(trade.date, trade.entryTime, trade.exitDate ?? trade.date, trade.exitTime)}</strong></div><div className="context-tags">{trade.tags.map((tag) => <span className="trade-tag" key={tag}>{tag}</span>)}</div></section><section className="panel day-context"><div className="panel-heading"><div><h2>Day note</h2><p>{shortDate(trade.exitDate ?? trade.date)}</p></div></div><p>{dayNote || 'No note for this trading day yet.'}</p></section></aside></div>
    <div className="demo-note"><span className="status-dot"/>{trade.source === 'real' ? 'Your saved execution details.' : 'Sample execution details.'} P&L is calculated for USD-quoted pairs.</div>
  </div>
}

function Notebook({ trades, dayNoteEdits, onSelectDay }: { trades: TradeWithPnl[]; dayNoteEdits: Record<string, string>; onSelectDay: (date: string) => void }) {
  const groups = byDay(trades)
  const dates = Object.keys(groups).sort((a, b) => b.localeCompare(a))
  return <div className="page-content"><PageHeading title="Notebook" description="Plans and reflections, kept alongside each session."/><section className="notes-list">{dates.map((date) => { const note = dayNoteEdits[date] ?? dayNotes[date] ?? ''; const summary = summarize(groups[date]); return <button className="note-entry" key={date} onClick={() => onSelectDay(date)}><span className="note-date"><strong>{new Date(`${date}T12:00:00`).getDate()}</strong><small>{weekday(date)} · {new Date(`${date}T12:00:00`).toLocaleString('en-US', { month: 'short' })}</small></span><span className="note-entry-copy"><strong>{note || 'No session note yet'}</strong><small>{groups[date].length} trades · <span className={currencyClass(summary.netPnl)}>{formatSignedMoney(summary.netPnl)}</span></small></span><Icon name="chevron" size={16}/></button> })}</section><div className="demo-note"><span className="status-dot"/>Sign in to save notes across devices.</div></div>
}

function duration(startDate: string, start: string, endDate: string, end: string) {
  const minutes = Math.max(0, Math.round((Date.parse(`${endDate}T${end}:00Z`) - Date.parse(`${startDate}T${start}:00Z`)) / 60000))
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`
}

export default App
