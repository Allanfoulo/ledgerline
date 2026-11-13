import { v, type Infer } from 'convex/values'
import { mutation, query } from './_generated/server'
import type { MutationCtx, QueryCtx } from './_generated/server'
import type { Id } from './_generated/dataModel'
import { belongsTo, requireOwner } from './identity'

const planContent = v.object({
  title: v.string(),
  instrument: v.union(v.literal('EUR/USD'), v.literal('GBP/USD'), v.literal('AUD/USD'), v.literal('XAU/USD')),
  timeframe: v.string(),
  hypothesis: v.union(v.literal('bullish'), v.literal('bearish'), v.literal('neutral'), v.literal('conditional')),
  thesis: v.string(), context: v.string(),
  confirmations: v.array(v.object({ condition: v.string(), role: v.union(v.literal('required'), v.literal('supporting')), threshold: v.optional(v.string()), price: v.optional(v.number()), timeframe: v.optional(v.string()), status: v.union(v.literal('not_seen'), v.literal('satisfied'), v.literal('failed'), v.literal('not_applicable')), source: v.union(v.literal('user'), v.literal('verified')), sourceReference: v.optional(v.string()) })),
  invalidationCondition: v.string(), invalidationLevel: v.optional(v.number()), invalidationAction: v.string(),
  entryConditions: v.string(), orderApproach: v.union(v.literal('market'), v.literal('limit'), v.literal('stop'), v.literal('unspecified')),
  managementPlan: v.string(), exitRationale: v.string(), abortConditions: v.string(),
  maxLossUsd: v.optional(v.number()), maxLossPercent: v.optional(v.number()), protectiveStop: v.optional(v.number()), positionSizeNote: v.string(),
})
type Content = Infer<typeof planContent>
type PlanId = Id<'executionPlans'>

type ReadContext = QueryCtx | MutationCtx

async function assertAccountOwner(ctx: ReadContext, accountId: Id<'tradingAccounts'> | undefined, owner: string) {
  if (!accountId) return
  const account = await ctx.db.get(accountId)
  if (!account || !belongsTo(account.owner, owner)) throw new Error('Account not found')
}

async function ownedPlan(ctx: ReadContext, planId: PlanId, owner: string) {
  const plan = await ctx.db.get(planId)
  if (!plan || !belongsTo(plan.owner, owner)) throw new Error('Plan not found')
  await assertAccountOwner(ctx, plan.accountId, owner)
  return plan
}

function validateContent(content: Content): string[] {
  const errors: string[] = []
  if (!content.title.trim() || content.title.trim().length > 120) errors.push('Give this plan a title (up to 120 characters).')
  if (!content.timeframe.trim() || content.timeframe.length > 24) errors.push('Choose a timeframe.')
  if (!content.thesis.trim() || content.thesis.length > 2000) errors.push('Write a thesis (up to 2,000 characters).')
  if (content.context.length > 1000) errors.push('Keep context under 1,000 characters.')
  if (content.confirmations.length > 20) errors.push('Use up to 20 confirmation conditions.')
  if (content.confirmations.some((item) => !item.condition.trim() || item.condition.length > 280 || (item.threshold?.length ?? 0) > 120 || (item.timeframe?.length ?? 0) > 24)) errors.push('Each confirmation needs a condition and concise optional details.')
  if (content.confirmations.some((item) => item.source === 'verified')) errors.push('Verified confirmations need a linked evidence source, which is not available in this milestone.')
  if (!content.invalidationCondition.trim() || content.invalidationCondition.length > 1000) errors.push('Describe what would invalidate the thesis before entry.')
  if (!content.invalidationAction.trim() || content.invalidationAction.length > 500) errors.push('State what you will do if the thesis is invalidated.')
  if (!content.entryConditions.trim() || content.entryConditions.length > 1000) errors.push('Describe the entry conditions.')
  if (!content.managementPlan.trim() || content.managementPlan.length > 1000) errors.push('Describe how you intend to manage the position.')
  if (!content.exitRationale.trim() || content.exitRationale.length > 1000) errors.push('Describe the planned exit rationale.')
  if (content.abortConditions.length > 1000) errors.push('Keep abort conditions under 1,000 characters.')
  if (content.positionSizeNote.length > 500) errors.push('Keep the position-size note under 500 characters.')
  const amount = content.maxLossUsd
  const percent = content.maxLossPercent
  if ((amount === undefined || !Number.isFinite(amount) || amount <= 0) && (percent === undefined || !Number.isFinite(percent) || percent <= 0 || percent > 100)) errors.push('Set an intended maximum loss in USD or account percentage (or both).')
  if (amount !== undefined && (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000)) errors.push('USD maximum loss must be a positive amount.')
  if (percent !== undefined && (!Number.isFinite(percent) || percent <= 0 || percent > 100)) errors.push('Maximum loss percentage must be above 0 and at most 100%.')
  for (const [label, value] of [['Invalidation level', content.invalidationLevel], ['Protective stop', content.protectiveStop]] as const) {
    if (value !== undefined && (!Number.isFinite(value) || value <= 0)) errors.push(`${label} must be a positive price.`)
  }
  for (const item of content.confirmations) if (item.price !== undefined && (!Number.isFinite(item.price) || item.price <= 0)) errors.push('Confirmation prices must be positive.')
  return errors
}

function requireValid(content: Content) {
  const errors = validateContent(content)
  if (errors.length) throw new Error(errors.join(' '))
}

function requireDraftBounds(content: Content) {
  if (content.title.length > 120 || content.timeframe.length > 24 || content.thesis.length > 2000 || content.context.length > 1000 || content.confirmations.length > 20 || content.invalidationCondition.length > 1000 || content.invalidationAction.length > 500 || content.entryConditions.length > 1000 || content.managementPlan.length > 1000 || content.exitRationale.length > 1000 || content.abortConditions.length > 1000 || content.positionSizeNote.length > 500 || content.confirmations.some((item) => item.condition.length > 280 || (item.threshold?.length ?? 0) > 120 || (item.timeframe?.length ?? 0) > 24 || (item.sourceReference?.length ?? 0) > 500)) throw new Error('Some draft fields are too long.')
  if (content.confirmations.some((item) => item.source === 'verified')) throw new Error('Verified confirmations need a linked evidence source, which is not available in this milestone.')
}

export const list = query({ args: {}, handler: async (ctx) => {
  const owner = await requireOwner(ctx)
  const plans = (await ctx.db.query('executionPlans').withIndex('by_owner', (q) => q.gte('owner', owner).lt('owner', `${owner}}`)).collect()).filter((plan) => belongsTo(plan.owner, owner))
  const visible = []
  for (const plan of plans) {
    if (plan.accountId) {
      const account = await ctx.db.get(plan.accountId)
      if (!account || !belongsTo(account.owner, owner)) continue
    }
    visible.push(plan)
  }
  return visible.sort((a, b) => b.updatedAt - a.updatedAt).map(({ _id, accountId, title, status, revision, latestVersionId, createdAt, updatedAt, closedAt, closeReason }) => ({ id: _id, accountId, title, status, revision, latestVersionId, createdAt, updatedAt, closedAt, closeReason }))
} })

export const get = query({ args: { planId: v.id('executionPlans') }, handler: async (ctx, { planId }) => {
  const owner = await requireOwner(ctx)
  const plan = await ownedPlan(ctx, planId, owner)
  const versions = (await ctx.db.query('executionPlanVersions').withIndex('by_plan', (q) => q.eq('planId', planId)).collect()).filter((version) => belongsTo(version.owner, owner)).sort((a, b) => a.version - b.version)
  return { id: plan._id, accountId: plan.accountId, title: plan.title, status: plan.status, draft: plan.draft, revision: plan.revision, latestVersionId: plan.latestVersionId, createdAt: plan.createdAt, updatedAt: plan.updatedAt, closedAt: plan.closedAt, closeReason: plan.closeReason, versions: versions.map(({ _id, version, content, committedAt, kind, reason, previousVersionId }) => ({ id: _id, version, content, committedAt, kind, reason, previousVersionId })) }
} })

export const createDraft = mutation({ args: { accountId: v.optional(v.id('tradingAccounts')), content: planContent }, handler: async (ctx, { accountId, content }) => {
  const owner = await requireOwner(ctx)
  await assertAccountOwner(ctx, accountId, owner)
  requireDraftBounds(content)
  const now = Date.now()
  return await ctx.db.insert('executionPlans', { owner, accountId, title: content.title.trim().slice(0, 120) || 'Untitled plan', status: 'draft', draft: content, revision: 0, createdAt: now, updatedAt: now })
} })

export const saveDraft = mutation({ args: { planId: v.id('executionPlans'), expectedRevision: v.number(), content: planContent }, handler: async (ctx, { planId, expectedRevision, content }) => {
  const owner = await requireOwner(ctx)
  const plan = await ownedPlan(ctx, planId, owner)
  if (plan.status !== 'draft') throw new Error('Only a draft can be edited. Start a revision from the committed plan instead.')
  if (plan.revision !== expectedRevision) throw new Error('This draft changed in another session. Reload it before saving.')
  await assertAccountOwner(ctx, plan.accountId, owner)
  requireDraftBounds(content)
  await ctx.db.patch(planId, { title: content.title.trim().slice(0, 120) || 'Untitled plan', draft: content, revision: plan.revision + 1, updatedAt: Date.now() })
} })

export const commit = mutation({ args: { planId: v.id('executionPlans'), expectedRevision: v.number(), content: planContent }, handler: async (ctx, { planId, expectedRevision, content }) => {
  const owner = await requireOwner(ctx)
  const plan = await ownedPlan(ctx, planId, owner)
  if (plan.status !== 'draft') throw new Error('This draft has already been committed.')
  if (plan.revision !== expectedRevision) throw new Error('This draft changed in another session. Reload it before committing.')
  await assertAccountOwner(ctx, plan.accountId, owner)
  requireValid(content)
  const committedAt = Date.now()
  const versionId = await ctx.db.insert('executionPlanVersions', { owner, planId, accountId: plan.accountId, version: 1, content, committedAt, kind: 'original' })
  await ctx.db.patch(planId, { title: content.title.trim(), status: 'committed', draft: undefined, revision: plan.revision + 1, latestVersionId: versionId, updatedAt: committedAt })
  return { versionId, committedAt }
} })

export const revise = mutation({ args: { planId: v.id('executionPlans'), expectedVersion: v.number(), reason: v.string(), content: planContent }, handler: async (ctx, { planId, expectedVersion, reason, content }) => {
  const owner = await requireOwner(ctx)
  const plan = await ownedPlan(ctx, planId, owner)
  if (plan.status !== 'committed' || !plan.latestVersionId) throw new Error('Only an active committed plan can be revised.')
  if (!reason.trim() || reason.trim().length > 500) throw new Error('Add a revision reason (up to 500 characters).')
  const previous = await ctx.db.get(plan.latestVersionId)
  if (!previous || !belongsTo(previous.owner, owner)) throw new Error('Latest plan version not found')
  if (previous.version !== expectedVersion) throw new Error('A newer plan revision exists. Reload it before committing another revision.')
  await assertAccountOwner(ctx, plan.accountId, owner)
  requireValid(content)
  const committedAt = Date.now()
  const versionId = await ctx.db.insert('executionPlanVersions', { owner, planId, accountId: plan.accountId, version: previous.version + 1, content, committedAt, kind: 'revision', reason: reason.trim(), previousVersionId: previous._id })
  await ctx.db.patch(planId, { title: content.title.trim(), latestVersionId: versionId, revision: plan.revision + 1, updatedAt: committedAt })
  return { versionId, committedAt }
} })

export const close = mutation({ args: { planId: v.id('executionPlans'), status: v.union(v.literal('cancelled'), v.literal('expired')), reason: v.string() }, handler: async (ctx, { planId, status, reason }) => {
  const owner = await requireOwner(ctx)
  const plan = await ownedPlan(ctx, planId, owner)
  if (plan.status !== 'draft' && plan.status !== 'committed') throw new Error('This plan is already closed.')
  if (!reason.trim() || reason.trim().length > 500) throw new Error('Add a reason (up to 500 characters).')
  const now = Date.now()
  await ctx.db.patch(planId, { status, closedAt: now, closeReason: reason.trim(), updatedAt: now })
} })
