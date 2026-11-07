import { useEffect, useMemo, useState } from 'react'
import { columns, parseCsv, previewCsv, suggestMapping } from './application/tradeImport'
import type { Column, Mapping } from './application/tradeImport'
import { saveTrades } from './application/journal'
import { useBackend } from './Backend'
import { supportedPairs, validateTrade } from './domain/trade'
import type { TradeInput } from './domain/trade'

const labels: Record<Column, string> = { date: 'Entry date (YYYY-MM-DD)', exitDate: 'Exit date (optional)', pair: 'Pair', side: 'Side', lots: 'Lots', entry: 'Entry price', exit: 'Exit price', entryTime: 'Entry time (UTC)', exitTime: 'Exit time (UTC)', commission: 'Commission (USD)', swap: 'Swap cost (USD)', setup: 'Strategy' }
const blankMapping = Object.fromEntries(columns.map((column) => [column, -1])) as Mapping

export default function JournalEditor({ onViewTrades }: { onViewTrades: () => void }) {
  const backend = useBackend()
  const [accountName, setAccountName] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState<string[][]>([])
  const [mapping, setMapping] = useState<Mapping>(blankMapping)
  const [fileError, setFileError] = useState('')
  const [keepMatches, setKeepMatches] = useState(false)
  useEffect(() => { setKeepMatches(false) }, [backend.accountId])
  const preview = useMemo(() => {
    if (rows.length < 2) return { rows: [], error: '' }
    try { return { rows: previewCsv(rows, mapping, backend.realTrades), error: '' } }
    catch (error) { return { rows: [], error: error instanceof Error ? error.message : 'Could not preview CSV.' } }
  }, [rows, mapping, backend.realTrades])
  const valid = preview.rows.filter((row) => row.input && !row.errors.length && !row.duplicate)
  const invalid = preview.rows.filter((row) => row.errors.length)
  const duplicates = preview.rows.filter((row) => row.duplicate)
  const selected = keepMatches ? [...valid, ...duplicates].sort((a, b) => a.line - b.line) : valid

  async function submit(items: TradeInput[], allowDuplicates = false, previewSkipped = 0) {
    setMessage(''); setBusy(true)
    try { const result = await saveTrades({ save: backend.saveTrades }, backend.accountId, items, allowDuplicates); setMessage(`Saved ${result.inserted} trade${result.inserted === 1 ? '' : 's'}; skipped ${result.duplicates + previewSkipped} matching trades.`); return result }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save trades.'); return null }
    finally { setBusy(false) }
  }
  if (!backend.authenticated) return <div className="page-content"><h1>Accounts &amp; trades</h1><p>Sign in under Settings to add your trading account and save trades.</p></div>

  return <div className="page-content journal-editor"><div className="page-heading"><div><h1>Accounts &amp; trades</h1><p>Add real Forex trades to your journal.</p></div></div>
    <section className="panel editor-section"><h2>Trading account</h2><div className="editor-fields"><label>Selected account<select value={backend.accountId} onChange={(event) => backend.setAccountId(event.target.value)}><option value="">Choose an account</option>{backend.accounts.map((account) => <option key={account.id} value={account.id}>{account.name} · USD</option>)}</select></label><form onSubmit={(event) => { event.preventDefault(); setMessage(''); setBusy(true); void backend.createAccount(accountName).then(() => { setAccountName(''); setMessage('Account created.') }).catch(() => setMessage('Could not create the account.')).finally(() => setBusy(false)) }}><label>New USD account<input value={accountName} onChange={(event) => setAccountName(event.target.value)} maxLength={80} placeholder="e.g. My trading account" required/></label><button className="button button-quiet" disabled={busy}>Create account</button></form></div></section>
    {backend.accountId && <>
      <section className="panel editor-section"><h2>Add a trade</h2><p>Times are UTC. Leave exit date blank for a same-day trade; swap is a cost (use a negative value for a credit).</p><form className="editor-form" onSubmit={(event) => {
        event.preventDefault(); const form = event.currentTarget; const data = new FormData(form)
        const exitDate = String(data.get('exitDate') ?? '')
        const item: TradeInput = { date: String(data.get('date')), ...(exitDate ? { exitDate } : {}), pair: String(data.get('pair')) as TradeInput['pair'], side: String(data.get('side')) as TradeInput['side'], lots: Number(data.get('lots')), entry: Number(data.get('entry')), exit: Number(data.get('exit')), entryTime: String(data.get('entryTime')), exitTime: String(data.get('exitTime')), commission: Number(data.get('commission')), swap: Number(data.get('swap')), setup: String(data.get('setup') ?? '').trim() }
        const errors = validateTrade(item); if (errors.length) { setMessage(errors.join(' ')); return }
        void submit([item], data.has('allowDuplicates')).then((result) => { if (result?.inserted) form.reset() })
      }}><label>Entry date<input name="date" type="date" required/></label><label>Exit date (optional)<input name="exitDate" type="date"/></label><label>Pair<select name="pair">{supportedPairs.map((pair) => <option key={pair}>{pair}</option>)}</select></label><label>Side<select name="side"><option>Long</option><option>Short</option></select></label><label>Lots<input name="lots" type="number" min="0.01" step="any" required/></label><label>Entry price<input name="entry" type="number" min="0.00001" step="any" required/></label><label>Exit price<input name="exit" type="number" min="0.00001" step="any" required/></label><label>Entry time (UTC)<input name="entryTime" type="time" required/></label><label>Exit time (UTC)<input name="exitTime" type="time" required/></label><label>Commission (USD)<input name="commission" type="number" min="0" step="any" defaultValue="0" required/></label><label>Swap cost (USD)<input name="swap" type="number" step="any" defaultValue="0" required/></label><label>Strategy<input name="setup" maxLength={120} placeholder="Optional"/></label><label className="duplicate-choice"><input name="allowDuplicates" type="checkbox"/>Keep this trade even if its details match an existing trade</label><button className="button button-primary" disabled={busy || backend.tradesLoading}>Save trade</button></form></section>
      <section className="panel editor-section"><h2>Import CSV</h2><p>Map your columns, then review the rows before importing. Dates must be YYYY-MM-DD and times HH:MM UTC. Exit date is optional for same-day trades. Up to 100 closed trades per file.</p><label className="file-label">Choose CSV<input type="file" accept=".csv,text/csv" onChange={(event) => { const file = event.target.files?.[0]; setFileError(''); setRows([]); setKeepMatches(false); if (!file) return; if (file.size > 1048576) { setFileError('File must be under 1 MB.'); return } void file.text().then((text) => { const parsed = parseCsv(text); if (parsed.length < 2) throw new Error('Add at least one trade row.'); setRows(parsed); setMapping(suggestMapping(parsed[0])) }).catch((error) => setFileError(error instanceof Error ? error.message : 'Could not read file.')) }}/></label>
        {fileError && <p className="negative" role="alert">{fileError}</p>}{rows.length > 1 && <><div className="mapping-grid">{columns.map((column) => <label key={column}>{labels[column]}<select value={mapping[column]} onChange={(event) => { setKeepMatches(false); setMapping((old) => ({ ...old, [column]: Number(event.target.value) })) }}><option value={-1}>Not mapped</option>{rows[0].map((header, index) => <option value={index} key={index}>{header || `Column ${index + 1}`}</option>)}</select></label>)}</div>{preview.error ? <p className="negative" role="alert">{preview.error}</p> : <><p>{valid.length} ready · {duplicates.length} matches · {invalid.length} need correction</p>{duplicates.length > 0 && <label className="duplicate-choice"><input type="checkbox" checked={keepMatches} onChange={(event) => setKeepMatches(event.target.checked)}/>Keep matching rows as separate trades for this import</label>}<div className="table-scroll"><table className="trade-table"><thead><tr><th>Row</th><th>Date</th><th>Pair</th><th>Side</th><th>Result</th></tr></thead><tbody>{preview.rows.map((row) => <tr key={row.line}><td>{row.line}</td><td>{row.input?.date}</td><td>{row.input?.pair}</td><td>{row.input?.side}</td><td>{row.errors.length ? row.errors.join(' ') : row.duplicate ? keepMatches ? 'Matching trade, will be kept' : 'Matching trade, skipped' : 'Ready'}</td></tr>)}</tbody></table></div><button className="button button-primary" disabled={busy || backend.tradesLoading || !!invalid.length || !selected.length} onClick={() => void submit(selected.map((row) => row.input!), keepMatches, keepMatches ? 0 : duplicates.length).then((result) => { if (result && (result.inserted || result.duplicates)) { setRows([]); setKeepMatches(false) } })}>Import {selected.length} trades</button></>}</>}
      </section>
    </>}
    {message && <p role="status" className="editor-message">{message}</p>}{backend.accountId && <button className="button button-quiet" onClick={onViewTrades}>View my trades</button>}
  </div>
}
