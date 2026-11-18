import { useState } from 'react'
import { useBackend } from './Backend'
import StrategyVersions from './StrategyVersions'

export function StrategyPage() {
  const backend = useBackend()
  const [id, setId] = useState<string | undefined>()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rules, setRules] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  if (!backend.authenticated) return <div className="page-content"><h1>Strategies</h1><p>Sign in to create strategies.</p></div>
  return <div className="page-content journal-editor">
    <div className="page-heading"><div><h1>Strategies</h1><p>Define your setups, signals, and the rules you want to follow.</p></div></div>
    <section className="panel editor-section workspace-section">
      <h2>{id ? 'Edit strategy' : 'New strategy'}</h2>
      <p>Describe the approach in your own terms. The chart analyzer uses these definitions as context and never assumes one trading method.</p>
      <form className="settings-form" onSubmit={(event) => {
        event.preventDefault(); setBusy(true); setMessage('')
        void backend.saveStrategy(id, name, description, rules.split('\n').map((rule) => rule.trim()).filter(Boolean))
          .then((savedId) => { setId(savedId); setMessage('Strategy saved. Commit a version after defining its signals.') })
          .catch(() => setMessage('Could not save. Use a unique name, a description under 1,000 characters, and up to 20 distinct rules.'))
          .finally(() => setBusy(false))
      }}>
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required/></label>
        <label>Description (optional)<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={3} placeholder="What defines this approach?"/></label>
        <label>Rules, one per line<textarea value={rules} onChange={(event) => setRules(event.target.value)} rows={5} placeholder="e.g. Wait for the retest"/></label>
        <div className="settings-actions"><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save strategy'}</button>{id && <button className="button button-quiet" type="button" onClick={() => { setId(undefined); setName(''); setDescription(''); setRules(''); setMessage('') }}>New strategy</button>}</div>
      </form>
    </section>
    <section className="panel editor-section workspace-section">
      <h2>My strategies</h2>
      {backend.strategies.length ? backend.strategies.map((strategy) => <div className="strategy-item" key={strategy.id}><div><strong>{strategy.name}</strong><p>{strategy.description || `${strategy.rules.length} rules`}</p></div><button className="text-button" type="button" onClick={() => { setId(strategy.id); setName(strategy.name); setDescription(strategy.description); setRules(strategy.rules.join('\n')); setMessage('') }}>Edit</button></div>) : <p>No strategies yet. Add a name and your decision rules above to create one.</p>}
    </section>
    {id && <StrategyVersions strategyId={id}/>}
    {message && <p role="status">{message}</p>}
  </div>
}

export function TradeStrategy({ tradeId }: { tradeId: string }) {
  const backend = useBackend(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const review = backend.reviews.find((item) => item.tradeId === tradeId)
  const strategy = backend.strategies.find((item) => item.id === review?.strategyId)
  async function save(strategyId: string, checked: string[]) { setBusy(true); setError(''); try { await backend.saveReview(tradeId, strategyId, checked) } catch { setError('Could not save the checklist.') } finally { setBusy(false) } }
  return <section className="panel editor-section"><h2>Strategy checklist</h2>{backend.strategies.length ? <><label className="strategy-select">Strategy<select value={strategy?.id ?? ''} disabled={busy} onChange={(event) => { if (event.target.value) void save(event.target.value, []) }}><option value="">Choose a strategy</option>{backend.strategies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{strategy && <div className="strategy-rules">{strategy.rules.length ? strategy.rules.map((rule) => <label key={rule}><input type="checkbox" disabled={busy} checked={review?.checked.includes(rule) ?? false} onChange={(event) => { const existing = (review?.checked ?? []).filter((item) => strategy.rules.includes(item)); void save(strategy.id, event.target.checked ? [...existing, rule] : existing.filter((item) => item !== rule)) }}/>{rule}</label>) : <p>This strategy has no rules yet.</p>}</div>}</> : <p>Create a strategy first from the Strategies page.</p>}{error && <p role="alert" className="negative">{error}</p>}</section>
}
