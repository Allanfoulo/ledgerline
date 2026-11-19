import { useEffect, useRef, useState } from 'react'
import type { ExecutionPlanContent, PlanConfirmation, PriceRange } from './domain/executionPlan'
import { blankExecutionPlan, validateExecutionPlan } from './domain/executionPlan'
import { useBackend } from './Backend'
import { useConvexExecutionPlans } from './adapters/useConvexExecutionPlans'
import type { ExecutionPlanDetail, ExecutionPlanStatus } from './adapters/useConvexExecutionPlans'
import PlanImageWorkflow from './PlanImageWorkflow'
import { PlanVersionEvidence } from './PlanImages'

type Mode = 'guided' | 'quick'
type EditMode = 'draft' | 'revision' | 'view'
const steps = ['Bias', 'Confirmations', 'Invalidation', 'Execution', 'Risk']

function timestamp(value: number) {
  return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(value))
}

function accountName(accountId: string | undefined, accounts: Array<{ id: string; name: string }>) {
  return accountId ? accounts.find((account) => account.id === accountId)?.name ?? 'Account unavailable' : 'Unlinked'
}

function statusLabel(status: ExecutionPlanStatus) {
  return status === 'draft' ? 'Draft' : status === 'committed' ? 'Committed' : status === 'cancelled' ? 'Cancelled' : 'Expired'
}

function numberValue(value: string) {
  if (!value.trim()) return undefined
  const result = Number(value)
  return Number.isFinite(result) ? result : undefined
}

function priceValue(value: string) {
  if (!value.trim()) return undefined
  const result = Number(value.replaceAll(',', '').trim())
  return Number.isFinite(result) && result > 0 ? result : undefined
}

function PlanField({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return <label className="plan-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>
}

function PriceRangeFields({ label, value, disabled, onChange }: { label: string; value?: PriceRange; disabled: boolean; onChange: (range: PriceRange | undefined) => void }) {
  function update(edge: 'low' | 'high', raw: string) {
    const next = { ...(value ?? {}), [edge]: raw === '' ? undefined : Number(raw) }
    onChange(next.low === undefined && next.high === undefined ? undefined : next)
  }
  return <fieldset className="plan-price-range"><legend>{label} (optional)</legend><div className="plan-field-grid"><label className="plan-field"><span>Lower price</span><input type="number" min="0" step="any" value={value?.low ?? ''} disabled={disabled} onChange={(event) => update('low', event.target.value)}/></label><label className="plan-field"><span>Upper price</span><input type="number" min="0" step="any" value={value?.high ?? ''} disabled={disabled} onChange={(event) => update('high', event.target.value)}/></label></div><small>Enter both bounds. The area is a user-checked level, not a verified quote.</small></fieldset>
}

export default function ExecutionPlans({ initialPlanId, onReviewNoTrade }: { initialPlanId?: string; onReviewNoTrade?: (planId: string) => void }) {
  const backend = useBackend()
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const data = useConvexExecutionPlans(backend.authenticated, selectedPlanId)
  const [newAccountId, setNewAccountId] = useState('')
  const [mode, setMode] = useState<Mode>('guided')
  const [editMode, setEditMode] = useState<EditMode>('view')
  const [step, setStep] = useState(0)
  const [content, setContent] = useState<ExecutionPlanContent>(blankExecutionPlan)
  const [revision, setRevision] = useState(0)
  const [dirty, setDirty] = useState(false)
  const [revisionReason, setRevisionReason] = useState('')
  const [closeReason, setCloseReason] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const loadedPlan = useRef<string | null>(null)
  const active = data.detail?.id === selectedPlanId ? data.detail : undefined
  const latest = active?.versions.at(-1)

  useEffect(() => {
    if (initialPlanId && data.plans.some((plan) => plan.id === initialPlanId)) setSelectedPlanId(initialPlanId)
  }, [initialPlanId, data.plans])

  useEffect(() => {
    if (!active) return
    if (loadedPlan.current !== active.id) {
      loadedPlan.current = active.id
      setEditMode(active.status === 'draft' ? 'draft' : 'view')
      setContent(active.draft ?? latestContent(active))
      setRevision(active.revision)
      setDirty(false)
      setErrors([])
      setMessage('')
    } else if (!dirty && active.status === 'draft' && editMode === 'draft') {
      setContent(active.draft ?? blankExecutionPlan())
      setRevision(active.revision)
    }
  }, [active, dirty, editMode])

  function update<K extends keyof ExecutionPlanContent>(key: K, value: ExecutionPlanContent[K]) {
    setContent((current) => ({ ...current, [key]: value }))
    setDirty(true)
    setErrors([])
    setMessage('')
  }

  async function perform(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    setErrors([])
    setMessage('')
    try {
      await action()
      setDirty(false)
      setMessage(success)
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'The plan could not be saved. Check your connection and try again.'])
    } finally {
      setBusy(false)
    }
  }

  async function createPlan() {
    setBusy(true)
    setErrors([])
    setMessage('')
    try {
      const blank = blankExecutionPlan()
      const id = await data.createDraft(newAccountId || undefined, blank)
      loadedPlan.current = null
      setSelectedPlanId(id)
      setMode('guided')
      setStep(0)
      setEditMode('draft')
      setContent(blank)
      setRevision(0)
      setDirty(false)
    } catch (error) {
      setErrors([error instanceof Error ? error.message : 'Could not start a draft. Check your connection and try again.'])
    } finally {
      setBusy(false)
    }
  }

  function startRevision(plan: ExecutionPlanDetail) {
    const version = plan.versions.at(-1)
    if (!version) return
    setContent(version.content)
    setRevision(version.version)
    setRevisionReason('')
    setEditMode('revision')
    setDirty(false)
    setErrors([])
    setMessage('')
    setMode('guided')
    setStep(0)
  }

  async function commitPlan() {
    if (!selectedPlanId) return
    const validation = validateExecutionPlan(content)
    if (validation.length) { setErrors(validation); return }
    await perform(async () => {
      await data.commit(selectedPlanId, revision, content)
      setEditMode('view')
    }, 'Plan committed as version 1.')
  }

  async function commitRevision() {
    if (!selectedPlanId || !active) return
    const validation = validateExecutionPlan(content)
    if (validation.length) { setErrors(validation); return }
    await perform(async () => {
      await data.revise(selectedPlanId, revision, revisionReason, content)
      setEditMode('view')
    }, 'Revision committed. Earlier versions remain unchanged.')
  }

  async function closePlan(status: 'cancelled' | 'expired') {
    if (!selectedPlanId) return
    await perform(async () => {
      await data.close(selectedPlanId, status, closeReason)
      setEditMode('view')
      setCloseReason('')
    }, status === 'cancelled' ? 'Plan cancelled.' : 'Plan marked expired.')
  }

  function addConfirmation() {
    const confirmation: PlanConfirmation = { condition: '', role: 'required', status: 'not_seen', source: 'user' }
    update('confirmations', [...content.confirmations, confirmation])
  }

  function patchConfirmation(index: number, values: Partial<PlanConfirmation>) {
    update('confirmations', content.confirmations.map((confirmation, position) => position === index ? { ...confirmation, ...values } : confirmation))
  }

  function renderStep(index: number, value: ExecutionPlanContent, onChange: <K extends keyof ExecutionPlanContent>(key: K, next: ExecutionPlanContent[K]) => void, readOnly: boolean) {
    const fieldProps = { disabled: readOnly }
    if (index === 0) return <div className="plan-fields">
      <PlanField label="Plan title"><input value={value.title} maxLength={120} disabled={readOnly} onChange={(event) => onChange('title', event.target.value)}/></PlanField>
      <div className="plan-field-grid">
        <PlanField label="Instrument"><input list="plan-instrument-options" value={value.instrument} maxLength={32} disabled={readOnly} onChange={(event) => onChange('instrument', event.target.value)}/><datalist id="plan-instrument-options">{['EUR/USD', 'GBP/USD', 'AUD/USD', 'XAU/USD'].map((symbol) => <option key={symbol} value={symbol}/>)}</datalist></PlanField>
        <PlanField label="Timeframe"><input list="plan-timeframe-options" value={value.timeframe} maxLength={24} disabled={readOnly} onChange={(event) => onChange('timeframe', event.target.value)}/><datalist id="plan-timeframe-options">{['1m', '5m', '15m', '30m', '1h', '2h', '4h', '1D', '1W', '1M'].map((frame) => <option key={frame} value={frame}/>)}</datalist></PlanField>
        <PlanField label="Directional hypothesis"><select value={value.hypothesis} {...fieldProps} onChange={(event) => onChange('hypothesis', event.target.value as ExecutionPlanContent['hypothesis'])}><option value="bullish">Bullish</option><option value="bearish">Bearish</option><option value="neutral">Neutral</option><option value="conditional">Conditional</option></select></PlanField>
      </div>
      <PlanField label="Thesis"><textarea value={value.thesis} maxLength={2000} rows={4} disabled={readOnly} onChange={(event) => onChange('thesis', event.target.value)} placeholder="What is the market context behind this idea?"/></PlanField>
      <PlanField label="Context" hint="Optional. Keep observations separate from verified trade data."><textarea value={value.context} maxLength={1000} rows={3} disabled={readOnly} onChange={(event) => onChange('context', event.target.value)} placeholder="Session, levels, or other context you want to remember"/></PlanField>
    </div>
    if (index === 1) return <div className="plan-fields">
      <div className="plan-section-copy"><p>Record the conditions you want to see. You can add none, one, or several; this form does not prescribe a confirmation count.</p></div>
      {value.confirmations.map((confirmation, itemIndex) => <div className="plan-confirmation" key={itemIndex}>
        <div className="plan-confirmation-heading"><strong>Condition {itemIndex + 1}</strong>{!readOnly && <button className="text-button" type="button" onClick={() => onChange('confirmations', value.confirmations.filter((_, position) => position !== itemIndex))}>Remove condition</button>}</div>
        <PlanField label="Condition"><input value={confirmation.condition} maxLength={280} disabled={readOnly} onChange={(event) => patchConfirmation(itemIndex, { condition: event.target.value })}/></PlanField>
        <div className="plan-field-grid">
          <PlanField label="Importance"><select value={confirmation.role} disabled={readOnly} onChange={(event) => patchConfirmation(itemIndex, { role: event.target.value as PlanConfirmation['role'] })}><option value="required">Required</option><option value="supporting">Supporting</option></select></PlanField>
          <PlanField label="Observed status"><select value={confirmation.status} disabled={readOnly} onChange={(event) => patchConfirmation(itemIndex, { status: event.target.value as PlanConfirmation['status'] })}><option value="not_seen">Not seen</option><option value="satisfied">Satisfied</option><option value="failed">Failed</option><option value="not_applicable">Not applicable</option></select></PlanField>
          <PlanField label="Threshold or level"><input value={confirmation.threshold ?? ''} maxLength={120} disabled={readOnly} onChange={(event) => patchConfirmation(itemIndex, { threshold: event.target.value || undefined })}/></PlanField>
          <PlanField label="Price (optional)"><input type="number" min="0" step="any" value={confirmation.price ?? ''} disabled={readOnly} onChange={(event) => patchConfirmation(itemIndex, { price: numberValue(event.target.value) })}/></PlanField>
          <PlanField label="Timeframe (optional)"><input value={confirmation.timeframe ?? ''} maxLength={24} disabled={readOnly} onChange={(event) => patchConfirmation(itemIndex, { timeframe: event.target.value || undefined })}/></PlanField>
        </div>
        <small>Source: User-authored</small>
      </div>)}
      {!readOnly && <button className="button button-quiet plan-add-condition" type="button" onClick={addConfirmation}>Add a condition</button>}
      {!value.confirmations.length && <p className="plan-empty-conditions">No confirmation conditions recorded.</p>}
    </div>
    if (index === 2) return <div className="plan-fields">
      <div className="plan-section-copy"><p>Invalidation describes when the thesis is wrong before entry. It is recorded separately from a protective stop.</p></div>
      <PlanField label="What would invalidate the thesis before entry?"><textarea value={value.invalidationCondition} maxLength={1000} rows={3} disabled={readOnly} onChange={(event) => onChange('invalidationCondition', event.target.value)}/></PlanField>
      <div className="plan-field-grid">
        <PlanField label="Invalidation level (optional)"><input type="number" min="0" step="any" value={value.invalidationLevel ?? ''} disabled={readOnly} onChange={(event) => onChange('invalidationLevel', numberValue(event.target.value))}/></PlanField>
        <PlanField label="What will you do if it occurs?"><input value={value.invalidationAction} maxLength={500} disabled={readOnly} onChange={(event) => onChange('invalidationAction', event.target.value)}/></PlanField>
      </div>
      <PriceRangeFields label="Invalidation area" value={value.invalidationRange} disabled={readOnly} onChange={(range) => onChange('invalidationRange', range)}/>
    </div>
    if (index === 3) return <div className="plan-fields">
      <PlanField label="Planned entry conditions"><textarea value={value.entryConditions} maxLength={1000} rows={3} disabled={readOnly} onChange={(event) => onChange('entryConditions', event.target.value)}/></PlanField>
      <PriceRangeFields label="Entry area" value={value.entryRange} disabled={readOnly} onChange={(range) => onChange('entryRange', range)}/>
      <PlanField label="Target description and exit rationale"><textarea value={value.exitRationale} maxLength={1000} rows={2} disabled={readOnly} onChange={(event) => onChange('exitRationale', event.target.value)}/></PlanField>
      <PriceRangeFields label="Target area" value={value.targetRange} disabled={readOnly} onChange={(range) => onChange('targetRange', range)}/>
      <div className="plan-field-grid">
        <PlanField label="Order approach"><select value={value.orderApproach} disabled={readOnly} onChange={(event) => onChange('orderApproach', event.target.value as ExecutionPlanContent['orderApproach'])}><option value="unspecified">Not specified</option><option value="market">Market</option><option value="limit">Limit</option><option value="stop">Stop</option></select></PlanField>
        <PlanField label="Abort or cancel conditions"><input value={value.abortConditions} maxLength={1000} disabled={readOnly} onChange={(event) => onChange('abortConditions', event.target.value)}/></PlanField>
      </div>
      <PlanField label="Management plan"><textarea value={value.managementPlan} maxLength={1000} rows={3} disabled={readOnly} onChange={(event) => onChange('managementPlan', event.target.value)}/></PlanField>
    </div>
    return <div className="plan-fields">
      <div className="plan-field-grid">
        <PlanField label="Maximum loss in USD"><input type="number" min="0" step="any" value={value.maxLossUsd ?? ''} disabled={readOnly} onChange={(event) => onChange('maxLossUsd', numberValue(event.target.value))}/></PlanField>
        <PlanField label="Maximum loss as % of account"><input type="number" min="0" max="100" step="any" value={value.maxLossPercent ?? ''} disabled={readOnly} onChange={(event) => onChange('maxLossPercent', numberValue(event.target.value))}/></PlanField>
      </div>
      <PlanField label="Protective stop price (optional)" hint="This is a planned protective stop, not the thesis invalidation condition."><input type="number" min="0" step="any" value={value.protectiveStop ?? ''} disabled={readOnly} onChange={(event) => onChange('protectiveStop', numberValue(event.target.value))}/></PlanField>
      <PlanField label="Position-size note (optional)" hint="No size is calculated from unverified contract or conversion data."><input value={value.positionSizeNote} maxLength={500} disabled={readOnly} onChange={(event) => onChange('positionSizeNote', event.target.value)} placeholder="Record your own calculation source, if useful"/></PlanField>
    </div>
  }

  function renderContent(value: ExecutionPlanContent, readOnly: boolean) {
    const onChange = <K extends keyof ExecutionPlanContent>(key: K, next: ExecutionPlanContent[K]) => update(key, next)
    if (mode === 'guided') return <div className="plan-guided">
      <nav className="plan-step-nav" aria-label="Execution plan sections">{steps.map((name, index) => <button key={name} type="button" className={step === index ? 'selected' : ''} aria-current={step === index ? 'step' : undefined} onClick={() => setStep(index)}><span>{String(index + 1).padStart(2, '0')}</span>{name}</button>)}</nav>
      <section className="plan-step-body"><h3>{steps[step]}</h3>{renderStep(step, value, onChange, readOnly)}</section>
      <div className="plan-step-actions">{step > 0 && <button className="button button-quiet" type="button" onClick={() => setStep((current) => current - 1)}>Previous section</button>}{step < steps.length - 1 && <button className="button button-quiet" type="button" onClick={() => setStep((current) => current + 1)}>Next section</button>}</div>
    </div>
    return <div className="plan-quick">
      {steps.map((name, index) => <section className="plan-quick-section" key={name}><h3>{name}</h3>{renderStep(index, value, onChange, readOnly)}</section>)}
    </div>
  }

  if (!backend.authenticated) return <div className="page-content execution-plans-page"><div className="page-heading"><div><h1>Execution Plans</h1><p>Write down the conditions, invalidation, execution, and risk you intend to follow.</p></div></div><section className="panel plan-sign-in"><h2>Sign in to save plans</h2><p>Execution plans are private records saved to your journal.</p></section></div>

  const selectedSummary = data.plans.find((plan) => plan.id === selectedPlanId)
  const displayedVersion = editMode === 'view' ? latest : undefined
  const displayedContent = editMode === 'view' ? displayedVersion?.content : content
  const readOnly = editMode === 'view'

  return <div className="page-content execution-plans-page">
    <div className="page-heading"><div><h1>Execution Plans</h1><p>Record the thinking behind a possible trade. Plans do not place orders.</p></div><div className="heading-actions">
      <label className="plan-account-picker"><span>New plan account</span><select value={newAccountId} onChange={(event) => setNewAccountId(event.target.value)}><option value="">Unlinked plan</option>{backend.accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
      <button className="button button-primary" type="button" disabled={busy} onClick={() => { void createPlan() }}>New plan</button>
    </div></div>

    <div className="plan-layout">
      <aside className="panel plan-list-panel" aria-label="Your plans">
        <div className="panel-heading"><div><h2>Your plans</h2><p>Drafts and committed snapshots</p></div><span>{data.plans.length}</span></div>
        {data.plans.length ? <div className="plan-list">{data.plans.map((plan) => <button key={plan.id} type="button" className={`plan-list-item ${selectedPlanId === plan.id ? 'selected' : ''}`} aria-current={selectedPlanId === plan.id ? 'true' : undefined} onClick={() => { setSelectedPlanId(plan.id); setStep(0); setMessage(''); setErrors([]) }}>
          <span className={`plan-status plan-status-${plan.status}`}>{statusLabel(plan.status)}</span><strong>{plan.title || 'Untitled plan'}</strong><small>{accountName(plan.accountId, backend.accounts)} · Updated {timestamp(plan.updatedAt)}</small>
        </button>)}</div> : <div className="plan-list-empty"><strong>No plans yet</strong><p>Start with a draft. It stays editable until you commit it.</p></div>}
      </aside>

      <section className="panel plan-editor-panel" aria-label="Execution plan editor">
        {!selectedPlanId ? <div className="plan-editor-empty"><h2>Give the idea a record</h2><p>Create a draft to work through the same five sections in Guided or Quick mode.</p><button className="button button-primary" disabled={busy} type="button" onClick={() => { void createPlan() }}>Start a plan</button></div> : !active ? <div className="plan-editor-empty" role="status">Loading plan…</div> : <>
          <div className="plan-editor-heading"><div><span className={`plan-status plan-status-${active.status}`}>{statusLabel(active.status)}</span><h2>{displayedContent?.title || active.title || 'Untitled plan'}</h2><p>{displayedContent?.instrument ?? latest?.content.instrument ?? 'Choose an instrument'} · {accountName(active.accountId, backend.accounts)}</p></div>
            {editMode === 'view' && active.status === 'committed' && <button className="button button-quiet" type="button" onClick={() => startRevision(active)}>Create revision</button>}
          </div>
          {editMode !== 'view' && <div className="plan-mode-switch" role="group" aria-label="Plan editing mode"><button className={mode === 'guided' ? 'selected' : ''} type="button" aria-pressed={mode === 'guided'} onClick={() => setMode('guided')}>Guided</button><button className={mode === 'quick' ? 'selected' : ''} type="button" aria-pressed={mode === 'quick'} onClick={() => setMode('quick')}>Quick</button><span>{mode === 'guided' ? 'One section at a time' : 'All sections together'}</span></div>}

          <div className={active.status === 'draft' ? 'plan-draft-workspace' : ''}>
          <div className={active.status === 'draft' ? 'plan-draft-image-column' : ''}>
          {active.status === 'draft' && <PlanImageWorkflow planId={active.id} revision={revision} onRevisionChange={setRevision} onAddRules={(rules) => {
            const existing = new Set(content.confirmations.map((item) => item.condition.trim().toLocaleLowerCase()))
            const unique = rules.map((rule) => rule.trim()).filter((rule) => { const key = rule.toLocaleLowerCase(); if (!rule || existing.has(key)) return false; existing.add(key); return true })
            const available = Math.max(0, 20 - content.confirmations.length)
            const additions: PlanConfirmation[] = unique.slice(0, available).map((condition) => ({ condition, role: 'required', status: 'not_seen', source: 'user' }))
            if (additions.length) { update('confirmations', [...content.confirmations, ...additions]); setMessage(`${additions.length} rules added. Save the draft to keep them.`) }
            else setMessage(unique.length ? 'The plan already has 20 conditions. Remove one to add more.' : 'These rules are already in the plan.')
            if (unique.length > available && additions.length) setMessage(`Added ${additions.length} rules. Remove conditions to make room for the remaining rules.`)
          }} onApply={(draft) => {
            setContent((current) => {
              const availableSlots = Math.max(0, 20 - current.confirmations.length)
              const suggestedSignals = draft.signals.slice(0, availableSlots).map((signal): PlanConfirmation => ({
                condition: signal.signalName?.trim() ? `${signal.signalName.trim()}: ${signal.value}` : signal.value,
                role: 'supporting', status: 'not_seen', source: 'user',
                sourceReference: `${signal.location ? `Approx. chart location ${Math.round(signal.location.xPercent)}% from left and ${Math.round(signal.location.yPercent)}% from top. ` : ''}${signal.basis}: ${signal.evidence}`.slice(0, 500),
              }))
              const invalidationRange = draft.invalidation?.priceRange
              return {
                ...current,
                instrument: draft.instrument?.value.trim() && draft.instrument.value.length <= 32 ? draft.instrument.value.trim() : current.instrument,
                timeframe: draft.timeframe?.value.trim() && draft.timeframe.value.length <= 24 ? draft.timeframe.value.trim() : current.timeframe,
                hypothesis: draft.bias?.value ?? current.hypothesis,
                entryConditions: draft.entry?.value ?? current.entryConditions,
                entryRange: draft.entry?.priceRange ?? current.entryRange,
                invalidationCondition: draft.invalidation?.value ?? current.invalidationCondition,
                invalidationRange: draft.invalidation?.priceRange ?? current.invalidationRange,
                invalidationLevel: invalidationRange && invalidationRange.low === invalidationRange.high ? invalidationRange.low : current.invalidationLevel,
                targetRange: draft.target?.priceRange ?? current.targetRange,
                exitRationale: draft.target?.value ?? current.exitRationale,
                protectiveStop: priceValue(draft.protectiveStop?.value ?? '') ?? current.protectiveStop,
                confirmations: [...current.confirmations, ...suggestedSignals],
              }
            })
            setDirty(true)
            if (draft.signals.length > Math.max(0, 20 - content.confirmations.length)) setMessage('Suggestions applied. Remove unused conditions to make room for the remaining strategy signal matches.')
            else setMessage('Suggestions copied into the editable plan. Check every value before committing.')
          }}/>} {active.status !== 'draft' && displayedVersion && <PlanVersionEvidence versionId={displayedVersion.id}/>}
          </div><div className={active.status === 'draft' ? 'plan-draft-fields-column' : ''}>
          {displayedContent && renderContent(displayedContent, readOnly)}
          </div></div>

          {editMode === 'view' && active.status === 'committed' && displayedVersion && <div className="plan-version-meta"><strong>Version {displayedVersion.version} · {displayedVersion.kind === 'original' ? 'Original snapshot' : 'Revision'}</strong><time dateTime={new Date(displayedVersion.committedAt).toISOString()}>Committed {timestamp(displayedVersion.committedAt)}</time>{displayedVersion.reason && <p>Revision reason: {displayedVersion.reason}</p>}<p>This plan is not linked to an execution. Its commit time alone does not establish that it was written before a trade.</p></div>}
          {editMode === 'view' && active.status === 'draft' && <div className="plan-version-meta"><strong>Draft · Not committed</strong><p>No frozen version or server commit timestamp exists yet.</p></div>}
          {editMode === 'view' && active.status === 'cancelled' && <div className="plan-version-meta"><strong>Cancelled · No trade recorded here</strong><p>{active.closeReason}</p>{onReviewNoTrade && <button className="button button-quiet" type="button" onClick={() => onReviewNoTrade(active.id)}>Review no-trade outcome</button>}</div>}
          {editMode === 'view' && active.status === 'expired' && <div className="plan-version-meta"><strong>Expired · No trade recorded here</strong><p>{active.closeReason}</p>{onReviewNoTrade && <button className="button button-quiet" type="button" onClick={() => onReviewNoTrade(active.id)}>Review no-trade outcome</button>}</div>}

          {editMode === 'revision' && <PlanField label="Why is this plan changing?"><textarea value={revisionReason} maxLength={500} rows={2} onChange={(event) => setRevisionReason(event.target.value)}/></PlanField>}
          {editMode === 'view' && (active.status === 'draft' || active.status === 'committed') && <div className="plan-close-controls"><PlanField label="Reason to close this plan"><input maxLength={500} value={closeReason} onChange={(event) => setCloseReason(event.target.value)} placeholder="For example, the setup no longer applies"/></PlanField><button className="button button-quiet" type="button" disabled={busy || !closeReason.trim()} onClick={() => { void closePlan('cancelled') }}>Cancel plan</button><button className="button button-quiet" type="button" disabled={busy || !closeReason.trim()} onClick={() => { void closePlan('expired') }}>Mark expired</button></div>}

          {editMode === 'draft' && <div className="plan-commit-note"><strong>Commit saves a frozen snapshot.</strong><span>Later edits become a new numbered revision. The recorded server time does not prove this plan predates an execution.</span></div>}
          {errors.length > 0 && <div className="plan-errors" role="alert"><strong>Plan could not be saved</strong><ul>{errors.map((error) => <li key={error}>{error}</li>)}</ul></div>}
          {message && <p className="plan-message" role="status">{message}</p>}
          {editMode !== 'view' && <div className="plan-form-actions">
            {editMode === 'draft' && <button className="button button-quiet" type="button" disabled={busy} onClick={() => { if (!selectedPlanId) return; void perform(() => data.saveDraft(selectedPlanId, revision, content), 'Draft saved. It is still editable and has no committed snapshot.') }}>Save draft</button>}
            <button className="button button-primary" type="button" disabled={busy || (editMode === 'revision' && !revisionReason.trim())} onClick={() => { void (editMode === 'draft' ? commitPlan() : commitRevision()) }}>{busy ? 'Saving…' : editMode === 'draft' ? 'Commit plan' : 'Commit revision'}</button>
            <button className="button button-quiet" type="button" disabled={busy} onClick={() => { setEditMode(active.status === 'draft' ? 'draft' : 'view'); setErrors([]); setMessage(''); if (active.status === 'committed' && latest) setContent(latest.content); else if (active.draft) setContent(active.draft); setDirty(false) }}>Discard edits</button>
          </div>}
          {editMode === 'view' && active.status === 'committed' && <div className="plan-history"><h3>Version history</h3><ol>{active.versions.map((version) => <li key={version.id}><strong>Version {version.version}</strong><span>{version.kind === 'original' ? 'Original snapshot' : version.reason}</span><time>{timestamp(version.committedAt)}</time></li>)}</ol></div>}
        </>}
      </section>
    </div>
    {busy && <p className="sr-only" role="status">Saving execution plan</p>}
    {selectedSummary && <span className="sr-only">Selected plan status: {statusLabel(selectedSummary.status)}</span>}
  </div>
}

function latestContent(plan: ExecutionPlanDetail) {
  return plan.versions.at(-1)?.content ?? blankExecutionPlan()
}
