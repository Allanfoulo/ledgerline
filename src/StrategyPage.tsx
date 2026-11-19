import { useState } from 'react'
import { useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { useBackend } from './Backend'
import StrategyVersions from './StrategyVersions'
import StrategyExamples from './StrategyExamples'
import type { StrategyPlaybook } from './adapters/useConvexStrategies'

const emptyPlaybook = (): StrategyPlaybook => ({ markets: '', timeframes: '', context: '', signalSequence: '', entry: '', invalidation: '', protectiveStop: '', targets: '', management: '' })
const playbookFields: Array<{ key: keyof StrategyPlaybook; label: string; placeholder: string }> = [
  { key: 'markets', label: 'Markets', placeholder: 'e.g. XAU/USD' },
  { key: 'timeframes', label: 'Timeframes', placeholder: 'e.g. H4 context, M15 entry' },
  { key: 'context', label: 'Setup and context', placeholder: 'When does this setup apply?' },
  { key: 'signalSequence', label: 'Signal sequence', placeholder: 'What signals do you look for, and in what order?' },
  { key: 'entry', label: 'Entry conditions', placeholder: 'What must happen before entry?' },
  { key: 'invalidation', label: 'Invalidation', placeholder: 'What makes the setup invalid?' },
  { key: 'protectiveStop', label: 'Protective stop', placeholder: 'How do you choose a protective stop?' },
  { key: 'targets', label: 'Targets', placeholder: 'How do you define targets?' },
  { key: 'management', label: 'Trade management', placeholder: 'How do you manage an open trade?' },
]

export function StrategyPage() {
  const backend = useBackend()
  const [editing, setEditing] = useState(false)
  const [id, setId] = useState<string | undefined>()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [rules, setRules] = useState('')
  const [playbook, setPlaybook] = useState<StrategyPlaybook>(emptyPlaybook)
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  if (!backend.authenticated) return <div className="page-content"><h1>Strategies</h1><p>Sign in to create strategies.</p></div>
  return <div className="page-content journal-editor strategies-page">
    <div className="page-heading strategy-page-heading"><div><h1>Strategies</h1><p>Build a playbook for the setups you trade and the decisions behind them.</p></div><div className="strategy-heading-note"><strong>Your playbook</strong><span>Rules, context and chart examples in one place</span></div></div>
    <div className="strategy-workspace">
    <section className="panel editor-section workspace-section strategy-library">
      <div className="strategy-section-heading"><div><h2>My strategies</h2><p>Choose a playbook to review.</p></div><span>{backend.strategies.length}</span></div>
      <button className="button button-quiet strategy-new" type="button" onClick={() => { if (editing && !window.confirm('Discard unsaved changes?')) return; setId(undefined); setName(''); setDescription(''); setRules(''); setPlaybook(emptyPlaybook()); setMessage(''); setEditing(true) }}>Create strategy</button>
      <div className="strategy-library-list">{backend.strategies.map((strategy) => <button type="button" key={strategy.id} className={`strategy-library-item${id === strategy.id && !editing ? ' is-selected' : ''}`} aria-pressed={id === strategy.id && !editing} onClick={() => { if (editing && !window.confirm('Discard unsaved changes?')) return; setId(strategy.id); setName(strategy.name); setDescription(strategy.description); setRules(strategy.rules.join('\n')); setPlaybook({ ...emptyPlaybook(), ...strategy.playbook }); setMessage(''); setEditing(false) }}><strong>{strategy.name}</strong><span>{[strategy.playbook?.markets, strategy.playbook?.timeframes].filter(Boolean).join(' · ') || `${strategy.rules.length} rules`}</span></button>)}</div>
      {!backend.strategies.length && <p>No strategies yet. Create one to start your playbook.</p>}
    </section>
    {!editing && id && backend.strategies.find((item) => item.id === id) ? <StrategyOverview strategy={backend.strategies.find((item) => item.id === id)!} onEdit={() => setEditing(true)}/> : !editing && !id ? <section className="panel workspace-section strategy-empty"><h2>Choose a strategy</h2><p>Select a playbook to see its rules, context, and chart examples.</p></section> : null}
    {editing &&     <section className="panel editor-section workspace-section strategy-editor">
      <div className="strategy-editor-heading"><div><h2>{id ? 'Edit strategy' : 'New strategy'}</h2><span>{id ? 'Editing saved strategy' : 'Draft playbook'}</span></div></div>
      <p>Describe the approach in your own terms. The chart analyzer uses these definitions as context and never assumes one trading method.</p>
      <form className="settings-form" onSubmit={(event) => {
        event.preventDefault(); setBusy(true); setMessage('')
        void backend.saveStrategy(id, name, description, rules.split('\n').map((rule) => rule.trim()).filter(Boolean), playbook)
          .then((savedId) => { setId(savedId); setMessage('Strategy saved. Save a version to preserve your changes.'); setEditing(false) })
          .catch(() => setMessage('Could not save. Use a unique name, a description under 1,000 characters, and up to 20 distinct rules.'))
          .finally(() => setBusy(false))
      }}>
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} required/></label>
        <label>Description (optional)<textarea value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={3} placeholder="What defines this approach?"/></label>
        <label>Rules, one per line<textarea value={rules} onChange={(event) => setRules(event.target.value)} rows={5} placeholder="e.g. Wait for the retest"/></label>
        <div className="playbook-fields"><div><h3>Strategy playbook</h3><p>Describe your approach in your own words. These details are saved with each strategy version.</p></div>{[
          { title: 'Setup', description: 'Where and when this approach applies.', keys: ['markets', 'timeframes', 'context', 'signalSequence'] },
          { title: 'Execution', description: 'The conditions for entering and managing a trade.', keys: ['entry', 'management'] },
          { title: 'Risk and targets', description: 'Where the idea fails and how you plan the exit.', keys: ['invalidation', 'protectiveStop', 'targets'] },
        ].map((group) => <section className="playbook-group" key={group.title}><div><h4>{group.title}</h4><p>{group.description}</p></div><div className="playbook-field-grid">{playbookFields.filter(({ key }) => group.keys.includes(key)).map(({ key, label, placeholder }) => <label key={key}>{label}<textarea value={playbook[key]} onChange={(event) => setPlaybook((current) => ({ ...current, [key]: event.target.value }))} maxLength={1000} rows={key === 'markets' || key === 'timeframes' ? 2 : 3} placeholder={placeholder}/></label>)}</div></section>)}</div>
        <div className="settings-actions"><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Save strategy'}</button><button className="button button-quiet" type="button" onClick={() => { if (window.confirm('Discard unsaved changes?')) { setEditing(false); setMessage('') } }}>Cancel</button></div>
      </form>
    </section>}
    </div>
    {id && !editing && <div className="strategy-evidence"><StrategyVersions key={`versions-${id}`} strategyId={id}/><StrategyExamples key={`examples-${id}`} strategyId={id}/></div>}
    {message && <p role="status">{message}</p>}
  </div>
}


function StrategyOverview({ strategy, onEdit }: { strategy: ReturnType<typeof useBackend>['strategies'][number]; onEdit: () => void }) {
  const versions = useQuery(api.strategies.versions, { strategyId: strategy.id as never })
  const details = playbookFields.filter(({ key }) => strategy.playbook?.[key])
  return <section className="panel workspace-section strategy-overview">
    <div className="strategy-overview-header"><div><p className="strategy-version-label">{versions === undefined ? 'Loading versions…' : versions.length ? `Latest saved version · v${versions[0].version}` : 'No saved version yet'}</p><h2>{strategy.name}</h2><p>{strategy.description || 'Add a description to capture the idea behind this strategy.'}</p></div><button type="button" className="button button-primary" onClick={onEdit}>Edit playbook</button></div>
    <div className="strategy-overview-context">{(['markets', 'timeframes'] as const).map((key) => strategy.playbook?.[key] && <div key={key}><span>{key === 'markets' ? 'Markets' : 'Timeframes'}</span><strong>{strategy.playbook[key]}</strong></div>)}</div>
    <div className="strategy-overview-body"><div><h3>Rules</h3>{strategy.rules.length ? <ol className="strategy-review-rules">{strategy.rules.map((rule, index) => <li key={`${index}-${rule}`}><span>{String(index + 1).padStart(2, '0')}</span><p>{rule}</p></li>)}</ol> : <p className="strategy-overview-empty">No rules yet. Edit this playbook to add them.</p>}</div><div><h3>Playbook</h3>{details.length ? <dl className="strategy-review-details">{details.filter(({ key }) => key !== 'markets' && key !== 'timeframes').map(({ key, label }) => <div key={key}><dt>{label}</dt><dd>{strategy.playbook?.[key]}</dd></div>)}</dl> : <p className="strategy-overview-empty">Add your setup, signals, and risk plan to make this playbook your own.</p>}</div></div>
  </section>
}

export function TradeStrategy({ tradeId }: { tradeId: string }) {
  const backend = useBackend(); const [error, setError] = useState(''); const [busy, setBusy] = useState(false)
  const review = backend.reviews.find((item) => item.tradeId === tradeId)
  const strategy = backend.strategies.find((item) => item.id === review?.strategyId)
  async function save(strategyId: string, checked: string[]) { setBusy(true); setError(''); try { await backend.saveReview(tradeId, strategyId, checked) } catch { setError('Could not save the checklist.') } finally { setBusy(false) } }
  return <section className="panel editor-section"><h2>Strategy checklist</h2>{backend.strategies.length ? <><label className="strategy-select">Strategy<select value={strategy?.id ?? ''} disabled={busy} onChange={(event) => { if (event.target.value) void save(event.target.value, []) }}><option value="">Choose a strategy</option>{backend.strategies.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>{strategy && <div className="strategy-rules">{strategy.rules.length ? strategy.rules.map((rule) => <label key={rule}><input type="checkbox" disabled={busy} checked={review?.checked.includes(rule) ?? false} onChange={(event) => { const existing = (review?.checked ?? []).filter((item) => strategy.rules.includes(item)); void save(strategy.id, event.target.checked ? [...existing, rule] : existing.filter((item) => item !== rule)) }}/>{rule}</label>) : <p>This strategy has no rules yet.</p>}</div>}</> : <p>Create a strategy first from the Strategies page.</p>}{error && <p role="alert" className="negative">{error}</p>}</section>
}
