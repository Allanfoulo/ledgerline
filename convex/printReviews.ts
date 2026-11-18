import { v, type Infer } from 'convex/values'
import type { FieldTypeFromFieldPath, GenericDocument, IndexRangeBuilder } from 'convex/server'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Doc, Id } from './_generated/dataModel'
import { belongsTo, requireOwner } from './identity'
import { classifyPlanTiming, orderReviewQueue, previousUtcWeekStart, rankPlanCandidates, validatePrintReview, type CandidatePlan, type PrintReviewContent, type RankedPlanCandidate, type ReviewQueueItem } from '../src/domain/printReview'

const adherence = v.union(v.literal('unanswered'), v.literal('followed'), v.literal('deviated'), v.literal('uncertain'), v.literal('not_applicable'))
const reviewContent = v.union(
  v.object({ kind: v.literal('trade'), entryAdherence: adherence, exitAdherence: adherence, riskAdherence: adherence, deviationReason: v.string(), takeaway: v.string() }),
  v.object({ kind: v.literal('no_trade'), outcome: v.union(v.literal('unanswered'), v.literal('not_triggered'), v.literal('aborted'), v.literal('missed'), v.literal('other')), explanation: v.string(), takeaway: v.string() }),
)
const ownerRange = (owner: string) => <Document extends GenericDocument & { owner: string }, IndexFields extends ['owner', ...string[]]>(q: IndexRangeBuilder<Document, IndexFields>) => q.gte('owner', owner as FieldTypeFromFieldPath<Document, IndexFields[0]>).lt('owner', `${owner}}` as FieldTypeFromFieldPath<Document, IndexFields[0]>)
type Ctx = QueryCtx | MutationCtx
type Content = Infer<typeof reviewContent>
type AccountId = Id<'tradingAccounts'>
type PrintId = Id<'tradePrints'>
type PlanId = Id<'executionPlans'>
type ReviewId = Id<'printReviews'>
type ReviewVersionId = Id<'printReviewVersions'>
type PlanDecisionDoc = Doc<'printPlanDecisions'>
type PrintReviewDoc = Doc<'printReviews'>
type ReviewVersionDoc = Doc<'printReviewVersions'>
type QueueActionDoc = Doc<'reviewQueueActionStates'>

async function ownedPrint(ctx: Ctx, printId: PrintId, owner: string) {
  const print = await ctx.db.get(printId)
  const trade = print ? await ctx.db.get(print.tradeId) : null
  const account = print ? await ctx.db.get(print.accountId) : null
  if (!print || !trade || !account || print.origin !== 'mt5' || trade.accountId !== print.accountId || !belongsTo(print.owner, owner) || !belongsTo(trade.owner, owner) || !belongsTo(account.owner, owner)) throw new Error('Trade Print not found')
  return { print, trade, account }
}

async function ownedPlan(ctx: Ctx, planId: PlanId, owner: string) {
  const plan = await ctx.db.get(planId)
  if (!plan || !belongsTo(plan.owner, owner)) throw new Error('Plan not found')
  const account = plan.accountId ? await ctx.db.get(plan.accountId) : null
  if (plan.accountId && (!account || !belongsTo(account.owner, owner))) throw new Error('Plan not found')
  return { plan, account }
}

async function latestDecision(ctx: Ctx, printId: PrintId, owner: string) {
  const rows = await ctx.db.query('printPlanDecisions').withIndex('by_owner_print', (q) => q.eq('owner', owner).eq('printId', printId)).collect() as PlanDecisionDoc[]
  return rows.filter((row) => belongsTo(row.owner, owner)).sort((a, b) => b.version - a.version || String(b._id).localeCompare(String(a._id)))[0] ?? null
}

async function latestPrintReview(ctx: Ctx, printId: PrintId, owner: string) {
  const rows = await ctx.db.query('printReviews').withIndex('by_owner_print', (q) => q.eq('owner', owner).eq('printId', printId)).collect() as PrintReviewDoc[]
  return rows.filter((row) => belongsTo(row.owner, owner)).sort((a, b) => b.revision - a.revision || String(b._id).localeCompare(String(a._id)))[0] ?? null
}

async function latestNoTradeReview(ctx: Ctx, planId: PlanId, owner: string) {
  const rows = await ctx.db.query('printReviews').withIndex('by_owner_plan', (q) => q.eq('owner', owner).eq('planId', planId)).collect() as PrintReviewDoc[]
  return rows.filter((row) => row.targetKind === 'no_trade_plan' && belongsTo(row.owner, owner)).sort((a, b) => b.revision - a.revision || String(b._id).localeCompare(String(a._id)))[0] ?? null
}

async function allOwnedAccounts(ctx: Ctx, owner: string) {
  const accounts = await ctx.db.query('tradingAccounts').withIndex('by_owner', ownerRange(owner)).collect()
  return accounts.filter((account) => belongsTo(account.owner, owner)).sort((a, b) => a.name.localeCompare(b.name) || String(a._id).localeCompare(String(b._id)))
}

async function allOwnedPlans(ctx: Ctx, owner: string) {
  const [plans, versions, accounts] = await Promise.all([
    ctx.db.query('executionPlans').withIndex('by_owner', ownerRange(owner)).collect(),
    ctx.db.query('executionPlanVersions').withIndex('by_owner', ownerRange(owner)).collect(),
    allOwnedAccounts(ctx, owner),
  ])
  const accountIds = new Set(accounts.map((account) => String(account._id)))
  const validPlans = plans.filter((plan) => belongsTo(plan.owner, owner) && (!plan.accountId || accountIds.has(String(plan.accountId))))
  const planIds = new Set(validPlans.map((plan) => String(plan._id)))
  const versionsByPlan = new Map<string, Doc<'executionPlanVersions'>[]>()
  for (const version of versions) {
    if (!belongsTo(version.owner, owner) || !planIds.has(String(version.planId))) continue
    const values = versionsByPlan.get(String(version.planId)) ?? []
    values.push(version)
    versionsByPlan.set(String(version.planId), values)
  }
  for (const values of versionsByPlan.values()) values.sort((a, b) => a.version - b.version)
  return { plans: validPlans, versionsByPlan }
}

function asCandidatePlans(plans: Doc<'executionPlans'>[], versionsByPlan: Map<string, Doc<'executionPlanVersions'>[]>): CandidatePlan[] {
  return plans.map((plan) => ({
    id: String(plan._id),
    ...(plan.accountId ? { accountId: String(plan.accountId) } : {}),
    status: plan.status,
    versions: (versionsByPlan.get(String(plan._id)) ?? []).map((version) => ({ id: String(version._id), version: version.version, committedAt: version.committedAt, instrument: version.content.instrument, hypothesis: version.content.hypothesis })),
  }))
}

function rankCandidates(print: Doc<'tradePrints'>, trade: Doc<'journalTrades'>, plans: CandidatePlan[]) {
  return rankPlanCandidates({ accountId: String(print.accountId), pair: trade.pair, side: trade.side, entryDate: trade.date, entryTime: trade.entryTime }, plans)
}

function candidateDetail(ranked: RankedPlanCandidate, plans: Doc<'executionPlans'>[], versionsByPlan: Map<string, Doc<'executionPlanVersions'>[]>) {
  const plan = plans.find((row) => String(row._id) === ranked.planId)
  const version = versionsByPlan.get(ranked.planId)?.find((row) => String(row._id) === ranked.id)
  if (!plan || !version) return null
  return { planId: String(plan._id), planTitle: version.content.title, planStatus: plan.status, planAccountId: plan.accountId ? String(plan.accountId) : undefined, versionId: String(version._id), version: version.version, content: version.content, committedAt: version.committedAt, timing: ranked.timing, directionRank: ranked.directionRank }
}

function latestReviewVersion(review: PrintReviewDoc | null, versions: ReviewVersionDoc[]) {
  if (!review?.latestVersionId) return null
  return versions.find((version) => version._id === review.latestVersionId) ?? null
}

function printDecisionView(decision: PlanDecisionDoc | null) {
  if (!decision) return null
  return { id: String(decision._id), version: decision.version, decision: decision.decision, planId: decision.planId ? String(decision.planId) : undefined, planVersionId: decision.planVersionId ? String(decision.planVersionId) : undefined, reason: decision.reason, createdAt: decision.createdAt }
}

function reviewView(review: PrintReviewDoc | null, versions: ReviewVersionDoc[]) {
  if (!review) return null
  return {
    id: String(review._id), targetKind: review.targetKind, status: review.status, revision: review.revision,
    versions: versions.filter((version) => version.reviewId === review._id).sort((a, b) => a.version - b.version).map((version) => ({ id: String(version._id), version: version.version, content: version.content, planVersionId: version.planVersionId ? String(version.planVersionId) : undefined, status: version.status, createdAt: version.createdAt, previousVersionId: version.previousVersionId ? String(version.previousVersionId) : undefined })),
  }
}

function actionSuppresses(item: ReviewQueueItem, actions: QueueActionDoc[], owner: string, now: number) {
  const state = actions.find((row) => row.itemKey === item.itemKey && row.issueFingerprint === item.issueFingerprint && belongsTo(row.owner, owner))
  if (!state) return false
  if (state.action === 'dismiss' || state.action === 'complete') return true
  return state.action === 'snooze' && (state.snoozedUntil ?? 0) > now
}

async function activeLinkForPlan(ctx: Ctx, planId: PlanId, owner: string) {
  const accounts = await allOwnedAccounts(ctx, owner)
  for (const account of accounts) {
    const rows = await ctx.db.query('printPlanDecisions').withIndex('by_owner_account', (q) => q.eq('owner', account.owner).eq('accountId', account._id)).collect() as PlanDecisionDoc[]
    const latestByPrint = new Map<string, PlanDecisionDoc>()
    for (const row of rows.filter((item) => belongsTo(item.owner, owner))) {
      const key = String(row.printId)
      const previous = latestByPrint.get(key)
      if (!previous || previous.version < row.version) latestByPrint.set(key, row)
    }
    if ([...latestByPrint.values()].some((row) => row.decision === 'linked' && row.planId === planId)) return true
  }
  return false
}

async function buildQueueItems(ctx: Ctx, owner: string, selectedAccountId?: AccountId) {
  const allAccounts = await allOwnedAccounts(ctx, owner)
  if (selectedAccountId && !allAccounts.some((account) => account._id === selectedAccountId)) throw new Error('Account not found')
  const accounts = selectedAccountId ? allAccounts.filter((account) => account._id === selectedAccountId) : allAccounts
  const accountNames = new Map(accounts.map((account) => [String(account._id), account.name]))
  const { plans: allPlans, versionsByPlan } = await allOwnedPlans(ctx, owner)
  const plans = allPlans.filter((plan) => !plan.accountId || accounts.some((account) => account._id === plan.accountId))
  const planCandidates = asCandidatePlans(plans, versionsByPlan)
  const allItems: ReviewQueueItem[] = []
  const allActions: QueueActionDoc[] = []
  const allDecisions: PlanDecisionDoc[] = []
  const allReviewAggregates = (await ctx.db.query('printReviews').withIndex('by_owner', ownerRange(owner)).collect() as PrintReviewDoc[]).filter((row) => belongsTo(row.owner, owner))
  const allReviewVersions = (await ctx.db.query('printReviewVersions').withIndex('by_owner', ownerRange(owner)).collect() as ReviewVersionDoc[]).filter((row) => belongsTo(row.owner, owner))
  const now = Date.now()
  const previousWeek = previousUtcWeekStart(now)
  const previousWeekStart = Date.parse(`${previousWeek}T00:00:00.000Z`)
  const previousWeekEnd = previousWeekStart + 7 * 24 * 60 * 60 * 1000

  for (const account of accounts) {
    const [prints, decisions, reviews, actions] = await Promise.all([
      ctx.db.query('tradePrints').withIndex('by_owner_account', (q) => q.eq('owner', account.owner).eq('accountId', account._id)).collect(),
      ctx.db.query('printPlanDecisions').withIndex('by_owner_account', (q) => q.eq('owner', account.owner).eq('accountId', account._id)).collect() as Promise<PlanDecisionDoc[]>,
      ctx.db.query('printReviews').withIndex('by_owner_account', (q) => q.eq('owner', account.owner).eq('accountId', account._id)).collect() as Promise<PrintReviewDoc[]>,
      ctx.db.query('reviewQueueActionStates').withIndex('by_owner_account', (q) => q.eq('owner', account.owner).eq('accountId', account._id)).collect() as Promise<QueueActionDoc[]>,
    ])
    const safePrints = prints.filter((row) => row.origin === 'mt5' && belongsTo(row.owner, owner))
    const safeDecisions = decisions.filter((row) => belongsTo(row.owner, owner))
    const safeReviews = reviews.filter((row) => belongsTo(row.owner, owner))
    const safeActions = actions.filter((row) => belongsTo(row.owner, owner))
    allDecisions.push(...safeDecisions)
    allActions.push(...safeActions)
    const decisionsByPrint = new Map<string, PlanDecisionDoc>()
    for (const row of safeDecisions) {
      const key = String(row.printId)
      const previous = decisionsByPrint.get(key)
      if (!previous || previous.version < row.version) decisionsByPrint.set(key, row)
    }
    const reviewsByPrint = new Map(safeReviews.filter((row) => row.targetKind === 'trade_print' && row.printId).map((row) => [String(row.printId), row]))
    for (const print of safePrints) {
      const trade = await ctx.db.get(print.tradeId)
      if (!trade || trade.accountId !== account._id || !belongsTo(trade.owner, owner)) continue
      const printKey = String(print._id)
      const decision = decisionsByPrint.get(printKey) ?? null
      const review = reviewsByPrint.get(printKey) ?? null
      const reviewVersion = latestReviewVersion(review, allReviewVersions)
      const ranked = rankCandidates(print, trade, planCandidates)
      const candidateFingerprint = ranked.map((candidate) => `${candidate.planId}.${candidate.id}`).join('|')
      if ((!decision || decision.decision === 'unlinked') && ranked.length) {
        allItems.push({ itemKey: `link:${printKey}`, issueFingerprint: candidateFingerprint, kind: 'link_decision', priority: 1, occurredAt: print.createdAt, targetId: printKey, accountId: String(account._id), accountName: account.name, title: `${trade.pair} · ${trade.side === 'Long' ? 'Buy' : 'Sell'}`, rationale: `${ranked.length} committed plan version${ranked.length === 1 ? '' : 's'} may match. Confirm a link or record no pre-trade plan.`, printId: printKey, tradeId: String(trade._id), candidateCount: ranked.length })
      }
      if (!review || review.status !== 'complete') {
        allItems.push({ itemKey: `review:print:${printKey}`, issueFingerprint: String(review?.revision ?? 0), kind: 'print_review', priority: 2, occurredAt: print.createdAt, targetId: printKey, accountId: String(account._id), accountName: account.name, title: `${trade.pair} · ${trade.side === 'Long' ? 'Buy' : 'Sell'}`, rationale: decision?.decision === 'no_pretrade_plan' ? 'Retrospective review is unfinished.' : decision?.decision === 'linked' ? 'Plan-versus-execution review is unfinished.' : 'Review this imported trade and record your observations.', printId: printKey, tradeId: String(trade._id) })
      }
      if (review?.status === 'complete' && reviewVersion?.content.kind === 'trade' && [reviewVersion.content.entryAdherence, reviewVersion.content.exitAdherence, reviewVersion.content.riskAdherence].includes('deviated')) {
        allItems.push({ itemKey: `deviation:${String(review._id)}`, issueFingerprint: String(reviewVersion._id), kind: 'deviation_follow_up', priority: 3, occurredAt: reviewVersion.createdAt, targetId: String(review._id), accountId: String(account._id), accountName: account.name, title: `${trade.pair} rule deviation`, rationale: 'You reported a deviation. Acknowledge it or add a reason to revisit it.', printId: printKey, tradeId: String(trade._id) })
      }
      if (print.status === 'failed' || print.status === 'needs_data') {
        allItems.push({ itemKey: `chart:${printKey}`, issueFingerprint: print.status, kind: 'chart_issue', priority: 4, occurredAt: print.createdAt, targetId: printKey, accountId: String(account._id), accountName: account.name, title: `${trade.pair} chart unavailable`, rationale: print.status === 'needs_data' ? 'No supported MT5 candle history was received for this Print.' : 'Chart capture reached its retry limit.', printId: printKey, tradeId: String(trade._id) })
      }
      const entryAt = Date.parse(`${trade.date}T${trade.entryTime}:00.000Z`)
      if (Number.isFinite(entryAt) && entryAt >= previousWeekStart && entryAt < previousWeekEnd) {
        const weekKey = `${String(account._id)}:${previousWeek}`
        allItems.push({ itemKey: `weekly:${weekKey}`, issueFingerprint: previousWeek, kind: 'weekly_review', priority: 6, occurredAt: previousWeekEnd, targetId: weekKey, accountId: String(account._id), accountName: account.name, title: `Review week of ${previousWeek}`, rationale: 'Look back on the MT5 trades from the previous UTC week.', weekStart: previousWeek })
      }
    }
    for (const plan of plans.filter((row) => row.status === 'draft' && row.accountId === account._id)) {
      allItems.push({ itemKey: `draft:${String(plan._id)}`, issueFingerprint: String(plan.revision), kind: 'plan_draft', priority: 5, occurredAt: plan.updatedAt, targetId: String(plan._id), ...(plan.accountId ? { accountId: String(plan.accountId) } : {}), accountName: plan.accountId ? accountNames.get(String(plan.accountId)) ?? 'Trading account' : 'Unassigned plan', title: plan.title, rationale: 'Continue or discard this unfinished Execution Plan.', planId: String(plan._id) })
    }
  }

  const reviewsByPlan = new Map(allReviewAggregates.filter((row) => row.targetKind === 'no_trade_plan' && row.planId).map((row) => [String(row.planId), row]))
  const linkedPlanIds = new Set<string>()
  const latestDecisionByPrint = new Map<string, PlanDecisionDoc>()
  for (const row of allDecisions) {
    const key = String(row.printId)
    const previous = latestDecisionByPrint.get(key)
    if (!previous || previous.version < row.version) latestDecisionByPrint.set(key, row)
  }
  for (const row of latestDecisionByPrint.values()) if (row.decision === 'linked' && row.planId) linkedPlanIds.add(String(row.planId))
  const closedPlans = plans.filter((plan) => (plan.status === 'cancelled' || plan.status === 'expired') && !linkedPlanIds.has(String(plan._id)) && (!selectedAccountId || !plan.accountId || plan.accountId === selectedAccountId))
  for (const plan of closedPlans) {
    const review = reviewsByPlan.get(String(plan._id)) ?? null
    if (review?.status === 'complete') continue
    const accountId = plan.accountId ? String(plan.accountId) : undefined
    allItems.push({ itemKey: `review:plan:${String(plan._id)}`, issueFingerprint: String(review?.revision ?? 0), kind: 'print_review', priority: 2, occurredAt: plan.closedAt ?? plan.updatedAt, targetId: String(plan._id), ...(accountId ? { accountId } : {}), accountName: accountId ? accountNames.get(accountId) ?? 'Trading account' : 'Unassigned plan', title: plan.title, rationale: 'Record what happened with this cancelled or expired plan, without attributing a trade result.', planId: String(plan._id) })
  }

  for (const plan of plans.filter((row) => row.status === 'draft' && !row.accountId)) {
    allItems.push({ itemKey: `draft:${String(plan._id)}`, issueFingerprint: String(plan.revision), kind: 'plan_draft', priority: 5, occurredAt: plan.updatedAt, targetId: String(plan._id), accountName: 'Unassigned plan', title: plan.title, rationale: 'Continue or discard this unfinished Execution Plan.', planId: String(plan._id) })
  }

  // Unassigned plan tasks have no account-indexed action rows, so load their state by stable key.
  const unassignedItems = allItems.filter((item) => !item.accountId)
  for (const item of unassignedItems) {
    const rows = await ctx.db.query('reviewQueueActionStates').withIndex('by_owner_item', (q) => q.eq('owner', owner).eq('itemKey', item.itemKey)).collect() as QueueActionDoc[]
    allActions.push(...rows.filter((row) => belongsTo(row.owner, owner)))
  }
  const itemsByKey = new Map<string, ReviewQueueItem>()
  for (const item of allItems) {
    const existing = itemsByKey.get(item.itemKey)
    if (!existing || item.occurredAt < existing.occurredAt) itemsByKey.set(item.itemKey, item)
  }
  const eligibleItems = [...itemsByKey.values()].filter((item) => !actionSuppresses(item, allActions, owner, now))
  return { items: orderReviewQueue(eligibleItems), totalActionable: eligibleItems.length, eligibleItems }
}

export const queue = query({ args: { accountId: v.optional(v.id('tradingAccounts')) }, handler: async (ctx, { accountId }) => {
  const owner = await requireOwner(ctx)
  const { items, totalActionable } = await buildQueueItems(ctx, owner, accountId)
  return { items, totalActionable }
} })

export const tradeWorkspace = query({ args: { printId: v.id('tradePrints') }, handler: async (ctx, { printId }) => {
  const owner = await requireOwner(ctx)
  const { print, trade, account } = await ownedPrint(ctx, printId, owner)
  const [decision, review, executions, { plans, versionsByPlan }] = await Promise.all([
    latestDecision(ctx, printId, owner),
    latestPrintReview(ctx, printId, owner),
    ctx.db.query('tradeExecutions').withIndex('by_owner_trade', (q) => q.eq('owner', trade.owner).eq('tradeId', trade._id)).collect(),
    allOwnedPlans(ctx, owner),
  ])
  const planCandidates = asCandidatePlans(plans, versionsByPlan)
  const candidates = rankCandidates(print, trade, planCandidates).map((candidate) => candidateDetail(candidate, plans, versionsByPlan)).filter((row) => row !== null)
  const linkedPlan = decision?.decision === 'linked' && decision.planId ? plans.find((plan) => plan._id === decision.planId) : null
  const linkedVersion = decision?.decision === 'linked' && decision.planVersionId ? versionsByPlan.get(String(decision.planId))?.find((version) => version._id === decision.planVersionId) : null
  const reviewVersions = review ? await ctx.db.query('printReviewVersions').withIndex('by_review', (q) => q.eq('reviewId', review._id)).collect() as ReviewVersionDoc[] : []
  return {
    print: { id: String(print._id), accountId: String(print.accountId), origin: print.origin, status: print.status, timePrecision: print.timePrecision, createdAt: print.createdAt, sourceRetrievedAt: print.sourceRetrievedAt, capturedAt: print.capturedAt, coverage: print.coverage },
    account: { id: String(account._id), name: account.name },
    trade: { id: String(trade._id), date: trade.date, exitDate: trade.exitDate, pair: trade.pair, side: trade.side, lots: trade.lots, entry: trade.entry, exit: trade.exit, entryTime: trade.entryTime, exitTime: trade.exitTime, commission: trade.commission, swap: trade.swap, setup: trade.setup, brokerSymbol: trade.brokerSymbol, executions: executions.filter((row) => belongsTo(row.owner, owner)).sort((a, b) => `${a.date ?? trade.date}T${a.time}`.localeCompare(`${b.date ?? trade.date}T${b.time}`)).map(({ date, time, action, price, lots }) => ({ date, time, action, price, lots })) },
    decision: printDecisionView(decision),
    linkedPlan: linkedPlan && linkedVersion ? { id: String(linkedPlan._id), title: linkedVersion.content.title, accountId: linkedPlan.accountId ? String(linkedPlan.accountId) : undefined, versionId: String(linkedVersion._id), version: linkedVersion.version, content: linkedVersion.content, committedAt: linkedVersion.committedAt, timing: classifyPlanTiming(linkedVersion.committedAt, trade.date, trade.entryTime) } : null,
    candidates,
    review: reviewView(review, reviewVersions.filter((row) => belongsTo(row.owner, owner))),
  }
} })

export const noTradeWorkspace = query({ args: { planId: v.id('executionPlans') }, handler: async (ctx, { planId }) => {
  const owner = await requireOwner(ctx)
  const { plan, account } = await ownedPlan(ctx, planId, owner)
  if (plan.status !== 'cancelled' && plan.status !== 'expired') throw new Error('Only cancelled or expired plans can receive a no-trade review.')
  if (await activeLinkForPlan(ctx, planId, owner)) throw new Error('This plan is linked to a Trade Print and cannot receive a no-trade review.')
  const [versions, review] = await Promise.all([
    ctx.db.query('executionPlanVersions').withIndex('by_plan', (q) => q.eq('planId', planId)).collect(),
    latestNoTradeReview(ctx, planId, owner),
  ])
  const safeVersions = versions.filter((row) => belongsTo(row.owner, owner)).sort((a, b) => a.version - b.version)
  const reviewVersions = review ? await ctx.db.query('printReviewVersions').withIndex('by_review', (q) => q.eq('reviewId', review._id)).collect() as ReviewVersionDoc[] : []
  return { plan: { id: String(plan._id), title: plan.title, status: plan.status, closeReason: plan.closeReason, accountId: plan.accountId ? String(plan.accountId) : undefined, accountName: account?.name ?? 'Unassigned', versions: safeVersions.map(({ _id, version, content, committedAt }) => ({ id: String(_id), version, content, committedAt })) }, review: reviewView(review, reviewVersions.filter((row) => belongsTo(row.owner, owner))) }
} })

async function appendDecision(ctx: MutationCtx, input: { owner: string; accountId: AccountId; printId: PrintId; decision: 'linked' | 'no_pretrade_plan' | 'unlinked'; planId?: PlanId; planVersionId?: Id<'executionPlanVersions'>; previous?: PlanDecisionDoc | null; reason?: string }) {
  const rows = await ctx.db.query('printPlanDecisions').withIndex('by_owner_print', (q) => q.eq('owner', input.owner).eq('printId', input.printId)).collect() as PlanDecisionDoc[]
  const latest = rows.filter((row) => belongsTo(row.owner, input.owner)).sort((a, b) => b.version - a.version)[0] ?? null
  if ((latest?._id ?? null) !== (input.previous?._id ?? null)) throw new Error('The link decision changed in another session. Reload the Print.')
  const version = (latest?.version ?? 0) + 1
  return await ctx.db.insert('printPlanDecisions', { owner: input.owner, accountId: input.accountId, printId: input.printId, version, decision: input.decision, planId: input.planId, planVersionId: input.planVersionId, previousDecisionId: latest?._id, reason: input.reason?.trim(), createdAt: Date.now() })
}

export const linkPlan = mutation({ args: { printId: v.id('tradePrints'), planId: v.id('executionPlans'), planVersionId: v.id('executionPlanVersions'), reason: v.optional(v.string()) }, handler: async (ctx, { printId, planId, planVersionId, reason }) => {
  const owner = await requireOwner(ctx)
  const { print, trade, account } = await ownedPrint(ctx, printId, owner)
  const { plan } = await ownedPlan(ctx, planId, owner)
  if (plan.status !== 'committed' || (plan.accountId && plan.accountId !== print.accountId)) throw new Error('Choose a committed plan for this trading account or an unassigned plan.')
  const version = await ctx.db.get(planVersionId)
  if (!version || version.planId !== plan._id || version.accountId !== plan.accountId || !belongsTo(version.owner, owner) || version.content.instrument !== trade.pair) throw new Error('Plan version does not match this Trade Print.')
  const previous = await latestDecision(ctx, printId, owner)
  if (previous?.decision === 'linked' && previous.planVersionId === version._id) return String(previous._id)
  const cleanReason = reason?.trim()
  if (previous && (!cleanReason || cleanReason.length > 500)) throw new Error('Add a reason when changing a previous link decision (up to 500 characters).')
  return await appendDecision(ctx, { owner, accountId: account._id, printId, decision: 'linked', planId, planVersionId, previous, reason: cleanReason })
} })

export const recordNoPlan = mutation({ args: { printId: v.id('tradePrints'), reason: v.optional(v.string()) }, handler: async (ctx, { printId, reason }) => {
  const owner = await requireOwner(ctx)
  const { account } = await ownedPrint(ctx, printId, owner)
  const previous = await latestDecision(ctx, printId, owner)
  if (previous?.decision === 'no_pretrade_plan') return String(previous._id)
  if (previous?.decision === 'linked') throw new Error('Remove the current plan link before recording no pre-trade plan.')
  const cleanReason = reason?.trim()
  if (previous && (!cleanReason || cleanReason.length > 500)) throw new Error('Add a reason when changing a previous link decision (up to 500 characters).')
  return await appendDecision(ctx, { owner, accountId: account._id, printId, decision: 'no_pretrade_plan', previous, reason: cleanReason })
} })

export const unlinkPlan = mutation({ args: { printId: v.id('tradePrints'), reason: v.string() }, handler: async (ctx, { printId, reason }) => {
  const owner = await requireOwner(ctx)
  const { account } = await ownedPrint(ctx, printId, owner)
  const previous = await latestDecision(ctx, printId, owner)
  if (previous?.decision !== 'linked') throw new Error('There is no confirmed plan link to remove.')
  const cleanReason = reason.trim()
  if (!cleanReason || cleanReason.length > 500) throw new Error('Add a reason for removing this plan link (up to 500 characters).')
  return await appendDecision(ctx, { owner, accountId: account._id, printId, decision: 'unlinked', previous, reason: cleanReason })
} })

export const saveReview = mutation({ args: { targetKind: v.union(v.literal('trade_print'), v.literal('no_trade_plan')), printId: v.optional(v.id('tradePrints')), planId: v.optional(v.id('executionPlans')), expectedRevision: v.number(), action: v.union(v.literal('save'), v.literal('complete')), content: reviewContent }, handler: async (ctx, { targetKind, printId, planId, expectedRevision, action, content }) => {
  const owner = await requireOwner(ctx)
  let accountId: AccountId | undefined
  let planVersionId: Id<'executionPlanVersions'> | undefined
  let review: PrintReviewDoc | null = null
  if (targetKind === 'trade_print') {
    if (!printId || planId) throw new Error('Choose a Trade Print review target.')
    const owned = await ownedPrint(ctx, printId, owner)
    if (content.kind !== 'trade') throw new Error('Use trade review answers for a Trade Print.')
    accountId = owned.account._id
    const decision = await latestDecision(ctx, printId, owner)
    if (decision?.decision === 'linked' && decision.planVersionId) planVersionId = decision.planVersionId as Id<'executionPlanVersions'>
    review = await latestPrintReview(ctx, printId, owner)
    if (review && (review.targetKind !== 'trade_print' || review.accountId !== accountId)) throw new Error('Trade review target changed. Reload it before saving.')
  } else {
    if (!planId || printId) throw new Error('Choose a no-trade plan review target.')
    const { plan, account } = await ownedPlan(ctx, planId, owner)
    if ((plan.status !== 'cancelled' && plan.status !== 'expired') || await activeLinkForPlan(ctx, planId, owner)) throw new Error('This plan is not eligible for a no-trade review.')
    if (content.kind !== 'no_trade') throw new Error('Use no-trade answers for a no-trade plan review.')
    accountId = account?._id
    planVersionId = plan.latestVersionId
    review = await latestNoTradeReview(ctx, planId, owner)
    if (review && (review.targetKind !== 'no_trade_plan' || review.accountId !== accountId)) throw new Error('No-trade review target changed. Reload it before saving.')
  }
  if (!accountId && targetKind === 'trade_print') throw new Error('Trading account not found')
  if (review && review.revision !== expectedRevision) throw new Error('This review changed in another session. Reload it before saving.')
  if (!review && expectedRevision !== 0) throw new Error('This review changed in another session. Reload it before saving.')
  const errors = validatePrintReview(content as PrintReviewContent, action === 'complete')
  if (errors.length) throw new Error(errors.join(' '))
  const now = Date.now()
  const status = action === 'complete' ? 'complete' : 'draft'
  const reviewId: ReviewId = review?._id ?? await ctx.db.insert('printReviews', { owner, ...(accountId ? { accountId } : {}), targetKind, ...(printId ? { printId } : {}), ...(planId ? { planId } : {}), status: 'draft', revision: 0, createdAt: now, updatedAt: now })
  const version = (review?.revision ?? 0) + 1
  const versionId: ReviewVersionId = await ctx.db.insert('printReviewVersions', { owner, reviewId, version, content: content as Content, ...(planVersionId ? { planVersionId } : {}), status, createdAt: now, previousVersionId: review?.latestVersionId })
  await ctx.db.patch(reviewId, { status, revision: version, latestVersionId: versionId, updatedAt: now })
  return { reviewId: String(reviewId), versionId: String(versionId), revision: version, status }
} })

export const actOnQueueItem = mutation({ args: { itemKey: v.string(), issueFingerprint: v.string(), action: v.union(v.literal('snooze'), v.literal('dismiss'), v.literal('complete')), reason: v.optional(v.string()), snoozedUntil: v.optional(v.number()) }, handler: async (ctx, { itemKey, issueFingerprint, action, reason, snoozedUntil }) => {
  const owner = await requireOwner(ctx)
  if (!itemKey.trim() || itemKey.length > 500 || !issueFingerprint || issueFingerprint.length > 4000) throw new Error('Review task is invalid. Reload the queue.')
  const { eligibleItems } = await buildQueueItems(ctx, owner)
  const target = eligibleItems.find((item) => item.itemKey === itemKey)
  if (!target || target.issueFingerprint !== issueFingerprint) throw new Error('This review task changed. Reload the queue before acting.')
  if (action === 'complete' && target.kind !== 'deviation_follow_up' && target.kind !== 'weekly_review') throw new Error('Complete this task from its review workflow.')
  const cleanReason = reason?.trim()
  if ((action === 'dismiss' || action === 'snooze') && (!cleanReason || cleanReason.length > 500)) throw new Error('Add a reason (up to 500 characters).')
  if (action === 'snooze' && (!snoozedUntil || snoozedUntil < Date.now() + 60_000 || snoozedUntil > Date.now() + 90 * 24 * 60 * 60 * 1000)) throw new Error('Choose a snooze time within the next 90 days.')
  if (action !== 'snooze' && snoozedUntil !== undefined) throw new Error('A snooze time is only valid for a snoozed task.')
  const rows = await ctx.db.query('reviewQueueActionStates').withIndex('by_owner_item', (q) => q.eq('owner', owner).eq('itemKey', itemKey)).collect() as QueueActionDoc[]
  const existing = rows.filter((row) => belongsTo(row.owner, owner))[0]
  const value = { issueFingerprint, action, reason: cleanReason, snoozedUntil: action === 'snooze' ? snoozedUntil : undefined, updatedAt: Date.now() }
  if (existing) {
    if (String(existing.accountId ?? '') !== String(target.accountId ?? '')) throw new Error('Review task account changed. Reload the queue.')
    await ctx.db.patch(existing._id, value)
    return String(existing._id)
  }
  return await ctx.db.insert('reviewQueueActionStates', { owner, ...(target.accountId ? { accountId: target.accountId as AccountId } : {}), itemKey, ...value })
} })
