import { Password } from '@convex-dev/auth/providers/Password'
import { convexAuth } from '@convex-dev/auth/server'
import { passwordRecovery } from './passwordRecovery'
export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({ providers: [Password({ reset: passwordRecovery })] })
