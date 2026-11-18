import { useEffect, useState } from 'react'
import { useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'

export default function StrategyVersions({ strategyId }: { strategyId: string }) {
  const versions = useQuery(api.strategies.versions, { strategyId: strategyId as never })
  const commit = useMutation(api.strategies.commitVersion)
  const [text, setText] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const latest = versions?.[0]
  useEffect(() => {
    if (!latest) return
    setText(latest.signals.map((signal: { name: string; description: string }) => `${signal.name}: ${signal.description}`).join('\n'))
  }, [latest?._id])
  return <section className="panel editor-section workspace-section strategy-version-editor"><h2>Strategy versions</h2><p>Define chart signals as one name and description per line, separated by a colon. Committing saves a new immutable version of the current strategy name, description, rules, and signals.</p><label>Signal definitions<textarea value={text} onChange={(event) => setText(event.target.value)} rows={4} placeholder="S1: The first shift indicates a retracement"/></label><button className="button button-quiet" type="button" disabled={busy || !versions} onClick={() => { const signals = text.split('\n').filter((line) => line.trim()).map((line) => { const colon = line.indexOf(':'); return { name: colon < 0 ? line.trim() : line.slice(0, colon).trim(), description: colon < 0 ? '' : line.slice(colon + 1).trim() } }); setBusy(true); setMessage(''); void commit({ strategyId: strategyId as never, expectedVersion: versions?.[0]?.version ?? 0, signals }).then(() => { setMessage('Strategy version committed.'); setText('') }).catch((error: Error) => setMessage(error.message)).finally(() => setBusy(false)) }}>{busy ? 'Committing...' : 'Commit strategy version'}</button>{message && <p role="status">{message}</p>}<div className="strategy-version-list"><h3>Immutable history</h3>{versions?.map((version) => <details key={version._id}><summary>Version {version.version} · {version.name}</summary><p>{version.description || 'No description saved for this version.'}</p><h4>Rules</h4>{version.rules.map((rule: string, index: number) => <p key={`${index}-${rule}`}>{rule}</p>)}<h4>Signal definitions</h4>{version.signals.length ? version.signals.map((signal: { name: string; description: string }) => <p key={signal.name}><strong>{signal.name}:</strong> {signal.description}</p>) : <p>No signals defined for this version.</p>}</details>)}</div></section>
}
