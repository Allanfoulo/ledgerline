import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '../../convex/_generated/api'
import type { Id } from '../../convex/_generated/dataModel'

export function useConvexConnector(authenticated: boolean, accountId: string) {
  const status = useQuery(api.connector.status, authenticated && accountId ? { accountId: accountId as Id<'tradingAccounts'> } : 'skip') as { expiresAt: number } | null | undefined
  const issue = useAction(api.connector.issue)
  const revoke = useMutation(api.connector.revoke)
  return { connectorStatus: status, issueConnector: async () => issue({ accountId: accountId as Id<'tradingAccounts'> }) as Promise<string>, revokeConnector: async () => { await revoke({ accountId: accountId as Id<'tradingAccounts'> }) } }
}
