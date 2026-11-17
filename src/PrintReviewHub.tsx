import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useConvexPrintReviews, type NoTradeReviewWorkspace, type TradeReviewWorkspace } from './adapters/useConvexPrintReviews'
import type { NoTradeReviewContent, ReviewAdherence, ReviewQueueItem, TradePrintReviewContent } from './domain/printReview'
import { forexPnl } from './domain/trade'
import TradePrintArtifact from './TradePrintArtifact'

type Target = { kind: 'trade'; printId: string } | { kind: 'no_trade'; planId: string }

const blankTradeReview: TradePrintReviewContent = { kind: 'trade', entryAdherence: 'unanswered', exitAdherence: 'unanswered', riskAdherence: 'unanswered', deviationReason: '', takeaway: '' }
const blankNoTradeReview: NoTradeReviewContent = { kind: 'no_trade', outcome: 'unanswered', explanation: '', takeaway: '' }
const adherenceOptions: Array<{ value: ReviewAdherence; label: string }> = [
  { value: 'unanswered', label: 'Choose a response' },
  { value: 'followed', label: 'Followed' },
  { value: 'deviated', label: 'Deviated' },
  { value: 'uncertain', label: 'Uncertain' },
  { value: 'not_applicable', label: 'Not applicable' },
]
const queueLabels: Record<ReviewQueueItem['kind'], string> = {
  link_decision: 'Plan link', print_review: 'Review', deviation_follow_up: 'Deviation follow-up', chart_issue: 'Chart issue', plan_draft: 'Plan draft', weekly_review: 'Weekly review',
}

function money(value: number) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value)
}

function utcDate(date: string, time?: string) { return `${date}${time ? ` · ${time}` : ''} UTC` }

function timeLabel(value: 'before_entry_minute' | 'timing_uncertain' | 'after_entry_minute' | 'unknown') {
  return value === 'before_entry_minute' ? 'Before recorded entry minute' : value === 'timing_uncertain' ? 'Timing uncertain · minute precision' : value === 'after_entry_minute' ? 'Added after recorded entry minute' : 'Timing unknown'
}

function candidateKey(planId: string, versionId: string) { return `${planId}:${versionId}` }

function candidateLabel(candidate: TradeReviewWorkspace['candidates'][number]) {
  return `${candidate.planTitle} · v${candidate.version} · ${timeLabel(candidate.timing)}`
}

function initialTradeReview(workspace?: TradeReviewWorkspace): TradePrintReviewContent {
  const latest = workspace?.review?.versions.at(-1)?.content
  return latest?.kind === 'trade' ? latest : blankTradeReview
}

function initialNoTradeReview(workspace?: NoTradeReviewWorkspace): NoTradeReviewContent {
  const latest = workspace?.review?.versions.at(-1)?.content
  return latest?.kind === 'no_trade' ? latest : blankNoTradeReview
}

export default function PrintReviewHub({ authenticated, accountId, initialPlanId, onOpenPlans }: { authenticated: boolean; accountId: string | undefined; initialPlanId?: string; onOpenPlans: (planId: string, accountId?: string) => void }) {
  const [target, setTarget] = useState<Target | null>(null)
  const printId = target?.kind === 'trade' ? target.printId : null
  const planId = target?.kind === 'no_trade' ? target.planId : null
  const data = useConvexPrintReviews(authenticated, accountId, printId, planId)
  const [selectedCandidate, setSelectedCandidate] = useState('')
  const [decisionReason, setDecisionReason] = useState('')
  const [tradeReview, setTradeReview] = useState<TradePrintReviewContent>(blankTradeReview)
  const [noTradeReview, setNoTradeReview] = useState<NoTradeReviewContent>(blankNoTradeReview)
  const [actionTarget, setActionTarget] = useState<string | null>(null)
  const [actionKind, setActionKind] = useState<'snooze' | 'dismiss'>('snooze')
  const [actionReason, setActionReason] = useState('')
  const [snoozeDays, setSnoozeDays] = useState(1)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const workspace = data.tradeWorkspace
  const noTradeWorkspace = data.noTradeWorkspace
  const latestCandidates = workspace?.candidates ?? []
  const selectedCandidateDetail = latestCandidates.find((candidate) => candidateKey(candidate.planId, candidate.versionId) === selectedCandidate)

  useEffect(() => { setTarget(initialPlanId ? { kind: 'no_trade', planId: initialPlanId } : null) }, [initialPlanId])

  useEffect(() => {
    if (!latestCandidates.length) { setSelectedCandidate(''); return }
    if (!latestCandidates.some((candidate) => candidateKey(candidate.planId, candidate.versionId) === selectedCandidate)) {
      setSelectedCandidate(candidateKey(latestCandidates[0].planId, latestCandidates[0].versionId))
    }
  }, [latestCandidates, selectedCandidate])

  useEffect(() => {
    setTradeReview(initialTradeReview(workspace))
    setNoTradeReview(initialNoTradeReview(noTradeWorkspace))
    setDecisionReason('')
    setError('')
    setMessage('')
  }, [workspace?.print.id, workspace?.review?.revision, noTradeWorkspace?.plan.id, noTradeWorkspace?.review?.revision])

  const reviewQueue = data.queue?.items ?? []
  const queueDescription = data.queue ? `${reviewQueue.length} shown · ${data.queue.totalActionable} actionable` : 'Loading your review tasks…'

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true)
    setError('')
    setMessage('')
    try { await action(); setMessage(success) }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'The action could not be saved. Check your connection and try again.') }
    finally { setBusy(false) }
  }

  function openItem(item: ReviewQueueItem) {
    setError('')
    setMessage('')
    setActionTarget(null)
    if (item.kind === 'plan_draft' && item.planId) { onOpenPlans(item.planId, item.accountId); return }
    if (item.planId && item.kind === 'print_review') setTarget({ kind: 'no_trade', planId: item.planId })
    else if (item.printId) setTarget({ kind: 'trade', printId: item.printId })
  }

  async function actOnItem(item: ReviewQueueItem, action: 'snooze' | 'dismiss' | 'complete', reason?: string) {
    const snoozedUntil = action === 'snooze' ? Date.now() + snoozeDays * 24 * 60 * 60 * 1000 : undefined
    await run(() => data.actOnQueueItem({ itemKey: item.itemKey, issueFingerprint: item.issueFingerprint, action, reason, snoozedUntil }), action === 'complete' ? 'Marked reviewed.' : action === 'dismiss' ? 'Task dismissed.' : `Task snoozed for ${snoozeDays} day${snoozeDays === 1 ? '' : 's'}.`)
    setActionTarget(null)
    setActionReason('')
  }

  function submitQueueAction(event: FormEvent, item: ReviewQueueItem) {
    event.preventDefault()
    if (!actionReason.trim()) { setError('Add a short reason before saving this task action.'); return }
    void actOnItem(item, actionKind, actionReason)
  }

  const pageTitle = target?.kind === 'trade' ? 'Print Review' : target?.kind === 'no_trade' ? 'No-trade review' : 'Review Queue'

  return <div className="page-content print-review-page">
    {target && <button className="back-button" type="button" onClick={() => { setTarget(null); setError(''); setMessage('') }}>Back to Review Queue</button>}
    <div className="page-heading"><div><h1>{pageTitle}</h1><p>{target ? target.kind === 'trade' ? 'Review what happened using the recorded execution and your own observations.' : 'Reflect on the closed plan without attributing a trade or result.' : 'Work through the next decisions and reviews from your MT5 trade record.'}</p></div>{!target && <div className="review-queue-count" role="status">{queueDescription}</div>}</div>

    {error && <p className="review-feedback review-feedback-error" role="alert">{error}</p>}
    {message && <p className="review-feedback" role="status">{message}</p>}

    {!target && <ReviewQueue items={reviewQueue} loading={!data.queue && authenticated} authenticated={authenticated} onOpen={openItem} actionTarget={actionTarget} setActionTarget={setActionTarget} actionKind={actionKind} setActionKind={setActionKind} actionReason={actionReason} setActionReason={setActionReason} snoozeDays={snoozeDays} setSnoozeDays={setSnoozeDays} onSubmitAction={submitQueueAction} onComplete={(item) => { void actOnItem(item, 'complete') }} busy={busy}/>}

    {target?.kind === 'trade' && <TradeReview workspace={workspace} loading={!workspace && authenticated} selectedCandidate={selectedCandidate} setSelectedCandidate={setSelectedCandidate} selectedCandidateDetail={selectedCandidateDetail} decisionReason={decisionReason} setDecisionReason={setDecisionReason} review={tradeReview} setReview={setTradeReview} busy={busy} onLink={() => {
      if (!workspace || !selectedCandidateDetail) return
      void run(() => data.linkPlan({ printId: workspace.print.id, planId: selectedCandidateDetail.planId, planVersionId: selectedCandidateDetail.versionId, reason: workspace.decision ? decisionReason : undefined }), `Linked ${selectedCandidateDetail.planTitle} version ${selectedCandidateDetail.version}.`)
    }} onNoPlan={() => {
      if (!workspace) return
      void run(() => data.recordNoPlan({ printId: workspace.print.id, reason: workspace.decision ? decisionReason : undefined }), 'Recorded that there was no pre-trade plan.')
    }} onUnlink={() => {
      if (!workspace || !decisionReason.trim()) { setError('Add a reason before removing this plan link.'); return }
      void run(() => data.unlinkPlan({ printId: workspace.print.id, reason: decisionReason }), 'Plan link removed. Earlier decisions remain in the record.')
    }} onSave={(action) => {
      if (!workspace) return
      void run(() => data.saveReview({ targetKind: 'trade_print', printId: workspace.print.id, expectedRevision: workspace.review?.revision ?? 0, action, content: tradeReview }), action === 'complete' ? 'Review completed and saved as a new version.' : 'Review draft saved as a new version.')
    }}/ >}

    {target?.kind === 'no_trade' && <NoTradeReview workspace={noTradeWorkspace} loading={!noTradeWorkspace && authenticated} review={noTradeReview} setReview={setNoTradeReview} busy={busy} onSave={(action) => {
      if (!noTradeWorkspace) return
      void run(() => data.saveReview({ targetKind: 'no_trade_plan', planId: noTradeWorkspace.plan.id, expectedRevision: noTradeWorkspace.review?.revision ?? 0, action, content: noTradeReview }), action === 'complete' ? 'No-trade review completed and saved as a new version.' : 'No-trade review draft saved as a new version.')
    }}/ >}
  </div>
}

function ReviewQueue({ items, loading, authenticated, onOpen, actionTarget, setActionTarget, actionKind, setActionKind, actionReason, setActionReason, snoozeDays, setSnoozeDays, onSubmitAction, onComplete, busy }: {
  items: ReviewQueueItem[]; loading: boolean; authenticated: boolean; onOpen: (item: ReviewQueueItem) => void; actionTarget: string | null; setActionTarget: (key: string | null) => void; actionKind: 'snooze' | 'dismiss'; setActionKind: (value: 'snooze' | 'dismiss') => void; actionReason: string; setActionReason: (value: string) => void; snoozeDays: number; setSnoozeDays: (value: number) => void; onSubmitAction: (event: FormEvent, item: ReviewQueueItem) => void; onComplete: (item: ReviewQueueItem) => void; busy: boolean
}) {
  if (!authenticated) return <section className="panel review-empty"><h2>Sign in to review your trades</h2><p>The Review Queue contains only records from your authenticated journal.</p></section>
  if (loading) return <section className="panel review-empty" role="status">Loading your Review Queue…</section>
  if (!items.length) return <section className="panel review-empty"><h2>Nothing needs review right now</h2><p>New MT5 Prints, closed plans, and unfinished drafts will appear here when there is a clear next action.</p></section>

  return <section className="review-queue-list" aria-label="Next review tasks">
    {items.map((item) => <article className="review-task" key={item.itemKey}>
      <div className="review-task-main"><div className="review-task-meta"><span>{queueLabels[item.kind]}</span><span>{item.accountName}</span></div><h2>{item.title}</h2><p>{item.rationale}</p>{item.weekStart && <time dateTime={item.weekStart}>{utcDate(item.weekStart)}</time>}</div>
      <div className="review-task-actions">
        {item.kind === 'weekly_review' || item.kind === 'deviation_follow_up' ? <button className="button button-primary" type="button" disabled={busy} onClick={() => onComplete(item)}>{item.kind === 'weekly_review' ? 'Mark week reviewed' : 'Acknowledge deviation'}</button> : <button className="button button-primary" type="button" onClick={() => onOpen(item)}>{item.kind === 'plan_draft' ? 'Continue plan' : item.kind === 'chart_issue' ? 'Open Trade Print' : item.kind === 'link_decision' ? 'Choose a plan' : 'Review trade'}</button>}
        {item.kind !== 'weekly_review' && <div className="review-task-secondary"><button type="button" className="text-button" aria-expanded={actionTarget === item.itemKey} onClick={() => { setActionTarget(actionTarget === item.itemKey ? null : item.itemKey); setActionKind('snooze'); setActionReason('') }}>Snooze</button><button type="button" className="text-button" aria-expanded={actionTarget === item.itemKey} onClick={() => { setActionTarget(actionTarget === item.itemKey ? null : item.itemKey); setActionKind('dismiss'); setActionReason('') }}>Dismiss</button></div>}
      </div>
      {actionTarget === item.itemKey && <form className="review-task-action-form" onSubmit={(event) => onSubmitAction(event, item)}>
        <label><span>Task action</span><select value={actionKind} onChange={(event) => setActionKind(event.target.value as 'snooze' | 'dismiss')}><option value="snooze">Snooze</option><option value="dismiss">Dismiss</option></select></label>
        {actionKind === 'snooze' && <label><span>Remind me in</span><select value={snoozeDays} onChange={(event) => setSnoozeDays(Number(event.target.value))}><option value={1}>1 day</option><option value={7}>7 days</option><option value={30}>30 days</option></select></label>}
        <label className="review-action-reason"><span>Reason</span><input value={actionReason} maxLength={500} onChange={(event) => setActionReason(event.target.value)} required placeholder={actionKind === 'dismiss' ? 'Why should this task stay hidden?' : 'Why should this wait?'}/></label>
        <div><button className="button button-quiet" type="button" onClick={() => setActionTarget(null)}>Cancel</button><button className="button button-primary" type="submit" disabled={busy || !actionReason.trim()}>{busy ? 'Saving…' : 'Save task action'}</button></div>
      </form>}
    </article>)}
  </section>
}

function TradeReview({ workspace, loading, selectedCandidate, setSelectedCandidate, selectedCandidateDetail, decisionReason, setDecisionReason, review, setReview, busy, onLink, onNoPlan, onUnlink, onSave }: {
  workspace?: TradeReviewWorkspace; loading: boolean; selectedCandidate: string; setSelectedCandidate: (value: string) => void; selectedCandidateDetail?: TradeReviewWorkspace['candidates'][number]; decisionReason: string; setDecisionReason: (value: string) => void; review: TradePrintReviewContent; setReview: (value: TradePrintReviewContent) => void; busy: boolean; onLink: () => void; onNoPlan: () => void; onUnlink: () => void; onSave: (action: 'save' | 'complete') => void
}) {
  if (loading || !workspace) return <section className="panel review-empty" role="status">Loading the Trade Print and its review history…</section>
  const trade = workspace.trade
  const pnl = forexPnl(trade)
  const previousDecision = !!workspace.decision
  const isLinked = !!workspace.linkedPlan
  const linked = workspace.linkedPlan
  return <div className="review-workspace">
    <div className="review-record-heading"><div><h2>{trade.pair} <span className={trade.side === 'Long' ? 'review-long' : 'review-short'}>{trade.side === 'Long' ? 'Buy' : 'Sell'}</span></h2><p>MT5 import · {workspace.account.name} · Entry {utcDate(trade.date, trade.entryTime)} · Exit {utcDate(trade.exitDate ?? trade.date, trade.exitTime)}</p></div><span className="review-record-tag">Real execution</span></div>

    <div className="review-compare">
      <section className="review-column review-plan-column" aria-labelledby="review-plan-heading">
        <div className="review-column-heading"><h2 id="review-plan-heading">Plan</h2><p>Only a confirmed link is shown as associated.</p></div>
        {linked ? <>
          <div className="review-linked-plan"><div className="review-linked-title"><strong>{linked.title}</strong><span>Version {linked.version}</span></div><time dateTime={new Date(linked.committedAt).toISOString()}>Committed {utcDate(new Date(linked.committedAt).toISOString().slice(0, 10), new Date(linked.committedAt).toISOString().slice(11, 16))}</time><p className="review-timing-label">{timeLabel(linked.timing)}</p>
            <dl className="review-plan-facts"><div><dt>Thesis</dt><dd>{linked.content.thesis}</dd></div><div><dt>Bias · timeframe</dt><dd>{linked.content.hypothesis} · {linked.content.timeframe}</dd></div><div><dt>Entry conditions</dt><dd>{linked.content.entryConditions}</dd></div><div><dt>Invalidation</dt><dd>{linked.content.invalidationCondition}</dd></div><div><dt>Management</dt><dd>{linked.content.managementPlan}</dd></div><div><dt>Planned exit</dt><dd>{linked.content.exitRationale}</dd></div><div><dt>Maximum loss</dt><dd>{linked.content.maxLossUsd !== undefined ? money(linked.content.maxLossUsd) : '—'}{linked.content.maxLossPercent !== undefined ? ` · ${linked.content.maxLossPercent}%` : ''}</dd></div></dl>
          </div>
          <label className="review-change-reason"><span>Reason to change this link</span><input value={decisionReason} maxLength={500} onChange={(event) => setDecisionReason(event.target.value)} placeholder="Explain why this link should change"/></label>
          <button className="button button-quiet" type="button" disabled={busy || !decisionReason.trim()} onClick={onUnlink}>Remove confirmed link</button>
        </> : <>
          <p className="review-plan-state">{workspace.decision?.decision === 'no_pretrade_plan' ? 'You recorded that no plan was made before entry.' : workspace.decision?.decision === 'unlinked' ? `The previous association was removed${workspace.decision.reason ? `: ${workspace.decision.reason}` : '.'}` : 'No plan has been confirmed for this Print.'}</p>
          {workspace.candidates.length ? <>
            <label className="review-candidate-picker"><span>Possible plan version · {workspace.candidates.length} candidate{workspace.candidates.length === 1 ? '' : 's'}</span><select value={selectedCandidate} onChange={(event) => setSelectedCandidate(event.target.value)}>{workspace.candidates.map((candidate) => <option key={candidate.versionId} value={candidateKey(candidate.planId, candidate.versionId)}>{candidateLabel(candidate)}</option>)}</select></label>
            {selectedCandidateDetail && <div className="review-candidate-preview"><strong>{selectedCandidateDetail.planTitle} · Version {selectedCandidateDetail.version}</strong><p>{selectedCandidateDetail.content.thesis}</p><time>Committed {utcDate(new Date(selectedCandidateDetail.committedAt).toISOString().slice(0, 10), new Date(selectedCandidateDetail.committedAt).toISOString().slice(11, 16))}</time><span className="review-timing-label">{timeLabel(selectedCandidateDetail.timing)}</span></div>}
            {previousDecision && <label className="review-change-reason"><span>Reason for changing the previous decision</span><input value={decisionReason} maxLength={500} onChange={(event) => setDecisionReason(event.target.value)} required/></label>}
            <button className="button button-primary" type="button" disabled={busy || !selectedCandidateDetail || (previousDecision && !decisionReason.trim())} onClick={onLink}>Confirm plan link</button>
          </> : <p className="review-plan-state">No committed plan version matches this instrument and account. You can still complete a retrospective review.</p>}
          {workspace.decision?.decision !== 'no_pretrade_plan' && <div className="review-no-plan-action">{previousDecision && <label className="review-change-reason"><span>Reason for recording no pre-trade plan</span><input value={decisionReason} maxLength={500} onChange={(event) => setDecisionReason(event.target.value)} required/></label>}<button className="button button-quiet" type="button" disabled={busy || (previousDecision && !decisionReason.trim())} onClick={onNoPlan}>Record no pre-trade plan</button></div>}
        </>}
      </section>

      <section className="review-column review-execution-column" aria-labelledby="review-execution-heading">
        <div className="review-column-heading"><h2 id="review-execution-heading">Execution</h2><p>Broker-imported facts and recorded costs.</p></div>
        <dl className="review-execution-facts"><div><dt>Position</dt><dd>{trade.side} · {trade.lots} lots</dd></div><div><dt>Entry price</dt><dd>{trade.entry}</dd></div><div><dt>Exit price</dt><dd>{trade.exit}</dd></div><div><dt>Gross P&amp;L</dt><dd>{money(pnl.grossPnl)}</dd></div><div><dt>Commission</dt><dd>{money(trade.commission)}</dd></div><div><dt>Swap</dt><dd>{money(trade.swap)}</dd></div><div className="review-net-pnl"><dt>Net P&amp;L</dt><dd>{money(pnl.netPnl)}</dd></div></dl>
        <div className="review-fill-list"><h3>Recorded fills</h3>{trade.executions.length ? <div className="review-fill-table"><div className="review-fill-row review-fill-head"><span>Action</span><span>UTC time</span><span>Price</span><span>Lots</span></div>{trade.executions.map((execution, index) => <div className="review-fill-row" key={`${execution.date ?? trade.date}-${execution.time}-${index}`}><span>{execution.action}</span><span>{execution.date ?? trade.date} {execution.time}</span><span>{execution.price}</span><span>{execution.lots}</span></div>)}</div> : <p>No individual fills were stored for this position.</p>}</div>
      </section>
    </div>

    <TradePrintArtifact tradeId={trade.id}/>

    <ReviewForm review={review} setReview={setReview} status={workspace.review?.status} revision={workspace.review?.revision ?? 0} versions={workspace.review?.versions ?? []} planLinked={isLinked} busy={busy} onSave={onSave}/>
  </div>
}

function ReviewForm({ review, setReview, status, revision, versions, planLinked, busy, onSave }: { review: TradePrintReviewContent; setReview: (value: TradePrintReviewContent) => void; status?: 'draft' | 'complete'; revision: number; versions: NonNullable<TradeReviewWorkspace['review']>['versions']; planLinked: boolean; busy: boolean; onSave: (action: 'save' | 'complete') => void }) {
  const hasDeviation = review.entryAdherence === 'deviated' || review.exitAdherence === 'deviated' || review.riskAdherence === 'deviated'
  const questionLead = planLinked ? 'Did you follow the linked plan?' : 'Did you follow your own entry, exit, and risk rules?'
  return <section className="review-reflection" aria-labelledby="review-reflection-heading">
    <div className="review-reflection-heading"><div><h2 id="review-reflection-heading">Your review</h2><p>These answers are self-reported and are saved separately from execution facts.</p></div><span>{status === 'complete' ? `Complete · v${revision}` : revision ? `Draft · v${revision}` : 'Not started'}</span></div>
    <div className="review-adherence-grid">
      {([['entryAdherence', 'Entry'], ['exitAdherence', 'Exit'], ['riskAdherence', 'Risk']] as const).map(([key, label]) => <label className="review-answer-field" key={key}><span>{questionLead} · {label}</span><select value={review[key]} onChange={(event) => setReview({ ...review, [key]: event.target.value as ReviewAdherence })}>{adherenceOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>)}
    </div>
    {hasDeviation && <label className="review-answer-field review-answer-wide"><span>What did you deviate from?</span><textarea value={review.deviationReason} maxLength={1200} rows={3} onChange={(event) => setReview({ ...review, deviationReason: event.target.value })} placeholder="Describe the rule you chose not to follow"/></label>}
    <label className="review-answer-field review-answer-wide"><span>What will you carry into the next trade?</span><textarea value={review.takeaway} maxLength={1200} rows={3} onChange={(event) => setReview({ ...review, takeaway: event.target.value })} placeholder="Keep the takeaway tied to your own decision process"/></label>
    <div className="review-form-footer"><span>Saving creates a new immutable review version. Previous answers remain in history.</span><div><button className="button button-quiet" type="button" disabled={busy} onClick={() => onSave('save')}>Save review draft</button><button className="button button-primary" type="button" disabled={busy} onClick={() => onSave('complete')}>{busy ? 'Saving…' : 'Complete review'}</button></div></div>
    {versions.length > 0 && <details className="review-version-history"><summary>Review version history · {versions.length}</summary><ol>{[...versions].reverse().map((version) => <li key={version.id}><strong>Version {version.version} · {version.status === 'complete' ? 'Complete' : 'Draft'}</strong><time>{new Date(version.createdAt).toLocaleString(undefined, { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC</time><p>{version.content.kind === 'trade' ? `Entry ${version.content.entryAdherence} · Exit ${version.content.exitAdherence} · Risk ${version.content.riskAdherence}` : `No-trade outcome: ${version.content.outcome}`}</p><p>{version.content.takeaway || 'No takeaway recorded.'}</p>{version.planVersionId && <small>Compared with pinned plan version {version.planVersionId}</small>}</li>)}</ol></details>}
  </section>
}

function NoTradeReview({ workspace, loading, review, setReview, busy, onSave }: { workspace?: NoTradeReviewWorkspace; loading: boolean; review: NoTradeReviewContent; setReview: (value: NoTradeReviewContent) => void; busy: boolean; onSave: (action: 'save' | 'complete') => void }) {
  if (loading || !workspace) return <section className="panel review-empty" role="status">Loading the closed plan…</section>
  const latest = workspace.plan.versions.at(-1)
  return <div className="no-trade-review-workspace">
    <section className="panel no-trade-plan-summary"><div><span className={`plan-status plan-status-${workspace.plan.status}`}>{workspace.plan.status === 'cancelled' ? 'Cancelled' : 'Expired'}</span><h2>{workspace.plan.title}</h2><p>{workspace.plan.accountName} · No trade is attached to this review.</p></div>{workspace.plan.closeReason && <p>{workspace.plan.closeReason}</p>}{latest && <div className="no-trade-plan-snapshot"><strong>Last committed snapshot · Version {latest.version}</strong><time>{utcDate(new Date(latest.committedAt).toISOString().slice(0, 10), new Date(latest.committedAt).toISOString().slice(11, 16))}</time><p>{latest.content.thesis}</p><p>{latest.content.invalidationCondition}</p></div>}</section>
    <section className="review-reflection" aria-labelledby="no-trade-review-heading"><div className="review-reflection-heading"><div><h2 id="no-trade-review-heading">Your no-trade review</h2><p>Describe the plan outcome. No trade, execution, or P&amp;L is inferred.</p></div><span>{workspace.review?.status === 'complete' ? `Complete · v${workspace.review.revision}` : workspace.review?.revision ? `Draft · v${workspace.review.revision}` : 'Not started'}</span></div>
      <div className="no-trade-review-fields"><label className="review-answer-field"><span>What happened?</span><select value={review.outcome} onChange={(event) => setReview({ ...review, outcome: event.target.value as NoTradeReviewContent['outcome'] })}><option value="unanswered">Choose an outcome</option><option value="not_triggered">Entry was not triggered</option><option value="aborted">I aborted the plan</option><option value="missed">I missed the opportunity</option><option value="other">Other</option></select></label><label className="review-answer-field review-answer-wide"><span>What led to that outcome?</span><textarea value={review.explanation} maxLength={1200} rows={3} onChange={(event) => setReview({ ...review, explanation: event.target.value })} placeholder="Record what happened without creating an execution record"/></label><label className="review-answer-field review-answer-wide"><span>What will you carry into the next plan?</span><textarea value={review.takeaway} maxLength={1200} rows={3} onChange={(event) => setReview({ ...review, takeaway: event.target.value })} placeholder="A useful lesson or next step"/></label></div>
      <div className="review-form-footer"><span>Saving creates a new immutable review version.</span><div><button className="button button-quiet" type="button" disabled={busy} onClick={() => onSave('save')}>Save review draft</button><button className="button button-primary" type="button" disabled={busy} onClick={() => onSave('complete')}>{busy ? 'Saving…' : 'Complete no-trade review'}</button></div></div>
      {!!workspace.review?.versions.length && <details className="review-version-history"><summary>No-trade review history · {workspace.review.versions.length}</summary><ol>{[...workspace.review.versions].reverse().map((version) => <li key={version.id}><strong>Version {version.version} · {version.status === 'complete' ? 'Complete' : 'Draft'}</strong><time>{new Date(version.createdAt).toLocaleString(undefined, { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC</time>{version.content.kind === 'no_trade' && <><p>Outcome: {version.content.outcome}</p><p>{version.content.takeaway || 'No takeaway recorded.'}</p></>}</li>)}</ol></details>}
    </section>
  </div>
}
