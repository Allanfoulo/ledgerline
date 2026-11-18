import { useEffect, useRef, useState } from 'react'
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import { chartAnalysisProviderCatalog, parseChartAnalysis, type ChartAnalysisDraft, type ChartSuggestion } from './domain/chartAnalysis'

const imageApi = (api as any).planImages
const maxOriginalBytes = 8 * 1024 * 1024
const maxPreviewBytes = 450_000
const suggestionFields = [
  ['instrument', 'Instrument'], ['timeframe', 'Timeframe'], ['bias', 'Directional bias'],
  ['entry', 'Entry area'], ['protectiveStop', 'Protective stop'], ['target', 'Target area'], ['invalidation', 'Invalidation area'],
] as const
type SuggestionField = (typeof suggestionFields)[number][0]

type ImageItem = { id: Id<'planImages'>; createdAt: number; mimeType: string; size: number }
type StrategyChoice = { id: Id<'strategyVersions'>; strategyId: Id<'strategies'>; name: string; version: number; description: string; signals: Array<{ name: string; description: string }> }
type PendingAnalysis = { imageId: Id<'planImages'>; provider: string; model: string }

function fileDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not prepare a chart preview.'))
    reader.onload = () => resolve(String(reader.result))
    reader.readAsDataURL(blob)
  })
}

async function makePreview(file: File) {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, 1600 / bitmap.width, 1200 / bitmap.height)
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(bitmap.width * scale))
    canvas.height = Math.max(1, Math.round(bitmap.height * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not prepare a chart preview.')
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    for (const quality of [0.88, 0.8, 0.72, 0.64, 0.56, 0.48]) {
      const preview = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality))
      if (preview && preview.size <= maxPreviewBytes) return (await fileDataUrl(preview)).split(',')[1]
    }
    throw new Error('This image could not be reduced to a safe preview size. Choose a smaller chart image.')
  } finally {
    bitmap.close()
  }
}

export default function PlanImageWorkflow({ planId, revision, onRevisionChange, onApply }: {
  planId: string
  revision: number
  onRevisionChange: (revision: number) => void
  onApply: (draft: ChartAnalysisDraft) => void
}) {
  const images = useQuery(imageApi.list, { planId: planId as Id<'executionPlans'> }) as ImageItem[] | undefined
  const context = useQuery(imageApi.draftContext, { planId: planId as Id<'executionPlans'> }) as { strategyVersionId: Id<'strategyVersions'> | null; strategyId: Id<'strategies'> | null; analysis: { provider: string; model: string; createdAt: number } | null } | null | undefined
  const strategies = useQuery(imageApi.strategyChoices, {}) as StrategyChoice[] | undefined
  const createUploadUrl = useMutation(imageApi.createUploadUrl)
  const attach = useMutation(imageApi.add)
  const remove = useMutation(imageApi.remove)
  const setDraftContext = useMutation(imageApi.setDraftContext)
  const analyze = useAction(imageApi.analyze)
  const initializedPlan = useRef('')
  const [strategyVersionId, setStrategyVersionId] = useState('')
  const [providerId, setProviderId] = useState<string>(chartAnalysisProviderCatalog[0].id)
  const [modelId, setModelId] = useState<string>(chartAnalysisProviderCatalog[0].models[0].id)
  const [pendingAnalysis, setPendingAnalysis] = useState<PendingAnalysis | null>(null)
  const [draft, setDraft] = useState<ChartAnalysisDraft | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const provider = chartAnalysisProviderCatalog.find((item) => item.id === providerId) ?? chartAnalysisProviderCatalog[0]
  let suggestionsReady = false
  if (draft) {
    try { parseChartAnalysis(draft); suggestionsReady = true } catch { suggestionsReady = false }
  }

  useEffect(() => {
    if (context === undefined || initializedPlan.current === planId) return
    initializedPlan.current = planId
    setStrategyVersionId(context?.strategyVersionId ?? '')
  }, [context, planId])

  async function upload(file: File | undefined) {
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size <= 0 || file.size > maxOriginalBytes) {
      setError('Choose a PNG, JPEG, or WebP chart image smaller than 8 MB.')
      return
    }
    setBusy(true); setError(''); setMessage('Preparing the private chart upload…')
    try {
      const previewBase64 = await makePreview(file)
      const reservation = await createUploadUrl({ planId }) as { uploadUrl: string; reservationId: Id<'pendingPlanUploads'> }
      const response = await fetch(reservation.uploadUrl, { method: 'POST', headers: { 'Content-Type': file.type }, body: file })
      if (!response.ok) throw new Error('The chart could not be uploaded. Check your connection and try again.')
      const result = await response.json() as { storageId: Id<'_storage'> }
      const attached = await attach({ planId, reservationId: reservation.reservationId, storageId: result.storageId, previewBase64 }) as { imageId?: string; error?: string }
      if (attached.error || !attached.imageId) throw new Error(attached.error ?? 'The chart could not be attached to this draft.')
      setMessage('Original chart saved privately. A smaller preview is used inside the journal.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The chart could not be uploaded.')
      setMessage('')
    } finally { setBusy(false) }
  }

  async function saveContext(nextStrategyVersionId: string, analysis?: PendingAnalysis & { suggestions: ChartAnalysisDraft }) {
    setBusy(true); setError(''); setMessage('')
    try {
      const nextRevision = await setDraftContext({ planId, expectedRevision: revision, strategyVersionId: nextStrategyVersionId ? nextStrategyVersionId as Id<'strategyVersions'> : undefined, analysis }) as number
      onRevisionChange(nextRevision)
      setStrategyVersionId(nextStrategyVersionId)
      return true
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The strategy context could not be saved.')
      return false
    } finally { setBusy(false) }
  }

  async function chooseStrategy(value: string) {
    if (value === strategyVersionId) return
    const saved = await saveContext(value)
    if (saved) { setDraft(null); setPendingAnalysis(null); setMessage(value ? 'Strategy version saved to the draft.' : 'Strategy context cleared from the draft.') }
  }

  async function analyzeImage(imageId: Id<'planImages'>) {
    setBusy(true); setError(''); setMessage(''); setDraft(null); setPendingAnalysis(null)
    try {
      const result = await analyze({ imageId, strategyVersionId: strategyVersionId || undefined, provider: providerId, model: modelId }) as { provider: string; model: string; suggestions: ChartAnalysisDraft }
      setDraft(result.suggestions)
      setPendingAnalysis({ imageId, provider: result.provider, model: result.model })
      setMessage('Suggestions are ready. Review and edit them before applying anything to the plan.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Chart analysis failed. Manual planning is still available.')
    } finally { setBusy(false) }
  }

  function updateSuggestion(field: SuggestionField, value: string) {
    setDraft((current) => current?.[field] ? { ...current, [field]: { ...current[field]!, value } } : current)
  }

  function updateRange(field: SuggestionField, edge: 'low' | 'high', raw: string) {
    setDraft((current) => {
      const item = current?.[field]
      if (!item) return current
      const priceRange = { ...(item.priceRange ?? {}), [edge]: raw === '' ? undefined : Number(raw) }
      if (priceRange.low === undefined && priceRange.high === undefined) return { ...current!, [field]: { ...item, priceRange: undefined } }
      return { ...current!, [field]: { ...item, priceRange } }
    })
  }

  async function applySuggestions() {
    if (!draft || !pendingAnalysis) return
    setBusy(true); setError('')
    try {
      const saved = await saveContext(strategyVersionId, { ...pendingAnalysis, suggestions: draft })
      if (!saved) return
      onApply(draft)
      setDraft(null); setPendingAnalysis(null)
      setMessage('Suggestions copied into the editable plan. Check every value before committing.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'The suggestions could not be applied. Your plan was not changed.')
    } finally { setBusy(false) }
  }

  return <section className="plan-images" aria-labelledby="plan-images-title">
    <div className="plan-image-heading"><div><h3 id="plan-images-title">Chart evidence and extraction</h3><p>Attach the original pre-market chart and optionally use a saved strategy version as context.</p></div></div>
    <div className="plan-image-controls">
      <label>Choose chart image<input type="file" accept="image/png,image/jpeg,image/webp" disabled={busy} onChange={(event) => { void upload(event.target.files?.[0]); event.target.value = '' }}/><small>Original file stays in private Convex storage, up to 8 MB. A compressed preview is shown here.</small></label>
      <label>Strategy version for this plan<select value={strategyVersionId} disabled={busy || !strategies} onChange={(event) => { void chooseStrategy(event.target.value) }}><option value="">No strategy</option>{strategies?.map((choice) => <option key={choice.id} value={choice.id}>{choice.name} · v{choice.version}</option>)}</select><small>Choose an immutable version; later strategy edits will not change this plan snapshot.</small></label>
      <label>Analysis provider<select value={providerId} disabled={busy} onChange={(event) => { const next = chartAnalysisProviderCatalog.find((item) => item.id === event.target.value); if (next) { setProviderId(next.id); setModelId(next.models[0].id) } }}>{chartAnalysisProviderCatalog.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
      <label>Model<select value={modelId} disabled={busy} onChange={(event) => setModelId(event.target.value)}>{provider.models.map((item) => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    </div>
    <p className="plan-image-consent">Analysis sends the selected original chart and the chosen strategy version to {provider.label}. It does not submit trades or place orders. {provider.dataUseNotice} Check the provider’s current data terms before continuing.</p>
    {message && <p role="status">{message}</p>}{error && <p role="alert" className="plan-image-error">{error}</p>}
    <div className="plan-image-gallery">{images === undefined ? <p role="status">Loading attached charts…</p> : images.length ? images.map((image) => <article className="plan-image-card" key={image.id}>
      <ImagePreview id={image.id}/><div className="plan-image-meta"><span>{image.mimeType.replace('image/', '').toUpperCase()} · {(image.size / 1024 / 1024).toFixed(1)} MB original</span><div className="settings-actions"><button className="button button-quiet" type="button" disabled={busy} onClick={() => { void analyzeImage(image.id) }}>{busy ? 'Working…' : `Analyze with ${provider.label}`}</button><button className="button button-quiet" type="button" disabled={busy} onClick={() => { void remove({ imageId: image.id }).then(() => { setMessage('Chart removed from this draft.'); if (pendingAnalysis?.imageId === image.id) { setDraft(null); setPendingAnalysis(null) } }).catch(() => setError('Could not remove this chart.')) }}>Remove</button></div></div>
    </article>) : <p>No chart attached yet. You can still build and commit a plan manually.</p>}</div>
    {draft && <div className="chart-suggestion-review"><div><h4>Suggested details</h4><p>These are unverified suggestions. Edit what you want to keep, then apply them to the draft.</p></div>
      {suggestionFields.map(([field, label]) => {
        const suggestion = draft[field] as ChartSuggestion<string> | undefined
        if (!suggestion) return null
        return <div className="chart-suggestion" key={field}><label>{label}{field === 'bias' ? <select value={suggestion.value} onChange={(event) => updateSuggestion(field, event.target.value)}><option value="bullish">Bullish</option><option value="bearish">Bearish</option><option value="neutral">Neutral</option><option value="conditional">Conditional</option></select> : <input value={suggestion.value} maxLength={field === 'instrument' ? 32 : field === 'timeframe' ? 24 : 500} onChange={(event) => updateSuggestion(field, event.target.value)}/>}</label>
          {suggestion.priceRange && <div className="plan-field-grid"><label>{label} lower price<input type="number" step="any" value={suggestion.priceRange.low ?? ''} onChange={(event) => updateRange(field, 'low', event.target.value)}/></label><label>{label} upper price<input type="number" step="any" value={suggestion.priceRange.high ?? ''} onChange={(event) => updateRange(field, 'high', event.target.value)}/></label></div>}
          <small>{suggestion.basis === 'visible' ? 'Visible on chart' : 'Interpretation'} · {suggestion.evidence}{suggestion.location ? ` · Approx. image location ${Math.round(suggestion.location.xPercent)}% from left, ${Math.round(suggestion.location.yPercent)}% from top` : ''}</small>
        </div>
      })}
      {draft.signals.map((signal, index) => <div className="chart-suggestion" key={index}><label>Strategy signal label<input value={signal.signalName ?? ''} maxLength={80} onChange={(event) => setDraft((current) => current ? { ...current, signals: current.signals.map((item, position) => position === index ? { ...item, signalName: event.target.value.trim() ? event.target.value : undefined } : item) } : current)}/></label><label>Signal observation<input value={signal.value} maxLength={500} onChange={(event) => setDraft((current) => current ? { ...current, signals: current.signals.map((item, position) => position === index ? { ...item, value: event.target.value } : item) } : current)}/></label><small>{signal.basis === 'visible' ? 'Visible on chart' : 'Interpretation'} · {signal.evidence}{signal.location ? ` · Approx. image location ${Math.round(signal.location.xPercent)}% from left, ${Math.round(signal.location.yPercent)}% from top` : ''}</small></div>)}
      {!suggestionsReady && <p className="plan-image-error" role="status">Complete each suggestion and both bounds of any price range before applying.</p>}
      <div className="settings-actions"><button type="button" className="button button-primary" disabled={busy || !pendingAnalysis || !suggestionsReady} onClick={() => { void applySuggestions() }}>Apply suggestions to editable plan</button><button type="button" className="button button-quiet" disabled={busy} onClick={() => { setDraft(null); setPendingAnalysis(null); setMessage('Suggestions discarded. Your plan was not changed.') }}>Discard suggestions</button></div>
    </div>}
  </section>
}

function ImagePreview({ id }: { id: string }) {
  const get = useAction(imageApi.get)
  const [src, setSrc] = useState('')
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let active = true
    void get({ imageId: id }).then((value: unknown) => { if (active && typeof value === 'string') setSrc(value); else if (active) setFailed(true) }).catch(() => { if (active) setFailed(true) })
    return () => { active = false }
  }, [get, id])
  return <div className="plan-image-preview">{src ? <img src={src} alt="Private chart image attached to the plan"/> : <p role="status">{failed ? 'Could not load this chart preview.' : 'Loading chart preview…'}</p>}</div>
}
