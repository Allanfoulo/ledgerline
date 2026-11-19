import { useEffect, useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'

const strategyApi = (api as any).strategies

type Example = { id: string; label: string; kind: 'qualifies' | 'does_not_qualify'; notes: string; locked?: boolean; archived?: boolean }

export function ExampleImage({ exampleId }: { exampleId: string }) {
  const getImage = useAction(strategyApi.exampleImage)
  const [image, setImage] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    void getImage({ exampleId }).then((url: string | null) => { if (active) { if (url) setImage(url); else setFailed(true) } }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [exampleId, getImage])
  return image ? <img src={image} alt="Strategy chart example" /> : <p role="status">{failed ? 'Could not load the chart image.' : 'Loading chart…'}</p>
}

export default function StrategyExamples({ strategyId }: { strategyId: string }) {
  const examples = useQuery(strategyApi.examples, { strategyId }) as Example[] | undefined
  const uploadExample = useAction(strategyApi.uploadExample)
  const removeExample = useMutation(strategyApi.removeExample)
  const [file, setFile] = useState<File | null>(null)
  const [fileKey, setFileKey] = useState(0)
  const [label, setLabel] = useState('')
  const [kind, setKind] = useState<'qualifies' | 'does_not_qualify'>('qualifies')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')

  async function save() {
    if (!file || !label.trim()) { setMessage('Choose a chart image and give this example a name.'); return }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size <= 0 || file.size > 700 * 1024) { setMessage('Choose a PNG, JPEG, or WebP image up to 700 KB.'); return }
    setBusy(true); setMessage('')
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader()
        reader.onerror = () => reject(new Error('Could not read the chart image.'))
        reader.onload = () => resolve(String(reader.result).split(',')[1])
        reader.readAsDataURL(file)
      })
      await uploadExample({ strategyId, base64, mimeType: file.type, label: label.trim(), kind, notes: notes.trim() })
      setFile(null); setFileKey((value) => value + 1); setLabel(''); setNotes(''); setMessage('Example added. Save a strategy version to preserve it in the playbook.')
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not save the example. Try again.') }
    finally { setBusy(false) }
  }

  return <section className="panel editor-section workspace-section strategy-examples">
    <h2>Chart examples</h2>
    <p>Keep examples of setups that qualified and those you passed on. Save a strategy version to preserve the examples with your rules.</p>
    <details className="strategy-add-example"><summary>Add a chart example</summary><div className="strategy-example-form">
      <label>Example name<input value={label} onChange={(event) => setLabel(event.target.value)} maxLength={120} placeholder="e.g. Retest after the second shift"/></label>
      <label>Example type<select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="qualifies">Qualified setup</option><option value="does_not_qualify">Did not qualify</option></select></label>
      <label className="strategy-example-wide">What should you notice?<textarea value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1000} rows={3} placeholder="Describe the signals or why this setup did not qualify."/></label>
      <label className="strategy-example-wide">Chart image <small>PNG, JPEG, or WebP up to 700 KB</small><input key={fileKey} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)}/></label>
      <button className="button button-quiet" type="button" onClick={() => void save()} disabled={busy}>{busy ? 'Saving example…' : 'Add chart example'}</button>
    </div>
    {message && <p role="status">{message}</p>}</details>
    <div className="strategy-example-list">{examples === undefined ? <p>Loading examples…</p> : examples.filter((example) => !example.archived).length === 0 ? <p>No chart examples yet.</p> : examples.filter((example) => !example.archived).map((example) => <article key={example.id} className="strategy-example-item"><div><strong>{example.label}</strong><p>{example.kind === 'qualifies' ? 'Qualified setup' : 'Did not qualify'}</p>{example.notes && <p>{example.notes}</p>}<button className="text-button" type="button" disabled={busy} onClick={() => { setBusy(true); setMessage(''); void removeExample({ exampleId: example.id }).then(() => setMessage(example.locked ? 'Example removed from future versions; it remains in saved versions.' : 'Example removed.')).catch((error: Error) => setMessage(error.message)).finally(() => setBusy(false)) }}>{example.locked ? 'Remove from future versions' : 'Remove example'}</button>{example.locked && <small> This example remains in saved versions.</small>}</div><details className="strategy-example-chart"><summary>View chart</summary><ExampleImage exampleId={example.id}/></details></article>)}</div>
  </section>
}
