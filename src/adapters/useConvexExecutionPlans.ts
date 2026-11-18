import { useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'
import type { ExecutionPlanContent } from '../domain/executionPlan'

export type ExecutionPlanStatus = 'draft' | 'committed' | 'cancelled' | 'expired'
export type ExecutionPlanSummary = { id: string; accountId?: string; title: string; status: ExecutionPlanStatus; revision: number; latestVersionId?: string; createdAt: number; updatedAt: number; closedAt?: number; closeReason?: string }
export type ExecutionPlanVersion = { id: string; version: number; content: ExecutionPlanContent; committedAt: number; kind: 'original' | 'revision'; reason?: string; previousVersionId?: string }
export type ExecutionPlanDetail = ExecutionPlanSummary & { draft?: ExecutionPlanContent; versions: ExecutionPlanVersion[] }

export function useConvexExecutionPlans(authenticated: boolean, selectedPlanId: string | null) {
  const planRows = useQuery(api.executionPlans.list, authenticated ? {} : 'skip') as ExecutionPlanSummary[] | undefined
  const detail = useQuery(api.executionPlans.get, authenticated && selectedPlanId ? { planId: selectedPlanId as Id<'executionPlans'> } : 'skip') as ExecutionPlanDetail | undefined
  const createDraft = useMutation(api.executionPlans.createDraft)
  const saveDraft = useMutation(api.executionPlans.saveDraft)
  const commit = useMutation(api.executionPlans.commit)
  const revise = useMutation(api.executionPlans.revise)
  const close = useMutation(api.executionPlans.close)

  return {
    plans: planRows ?? [],
    detail,
    createDraft: (accountId: string | undefined, content: ExecutionPlanContent) => createDraft({ accountId: accountId as Id<'tradingAccounts'> | undefined, content }),
    saveDraft: (planId: string, expectedRevision: number, content: ExecutionPlanContent) => saveDraft({ planId: planId as Id<'executionPlans'>, expectedRevision, content }),
    commit: (planId: string, expectedRevision: number, content: ExecutionPlanContent) => commit({ planId: planId as Id<'executionPlans'>, expectedRevision, content }),
    revise: (planId: string, expectedVersion: number, reason: string, content: ExecutionPlanContent) => revise({ planId: planId as Id<'executionPlans'>, expectedVersion, reason, content }),
    close: (planId: string, status: 'cancelled' | 'expired', reason: string) => close({ planId: planId as Id<'executionPlans'>, status, reason }),
  }
}
