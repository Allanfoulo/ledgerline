import { getAuthUserId } from '@convex-dev/auth/server'

export async function requireOwner(ctx: Parameters<typeof getAuthUserId>[0]): Promise<string> {
  const id = await getAuthUserId(ctx)
  if (!id) throw new Error('Sign in required')
  return String(id)
}
// Earlier prototypes stored Convex Auth's session-specific subject. Keep those records accessible.
export function belongsTo(owner: string, userId: string): boolean { return owner === userId || owner.startsWith(`${userId}|`) }
