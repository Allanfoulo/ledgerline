import { useState } from 'react'
import { useConvexAuth } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import ThemeToggle from './ThemeToggle'
import BrandLockup from './BrandLockup'
import { brand } from './config/brand'

export function AuthGate({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const { signIn } = useAuthActions()
  const [mode, setMode] = useState<'signUp' | 'signIn' | 'reset' | 'reset-verification'>('signUp')
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  if (isLoading) return <main className="auth-shell"><div className="auth-loading" role="status">Loading your journal…</div></main>
  if (isAuthenticated) return <>{children}</>

  return <main className="auth-shell">
    <section className="auth-intro" aria-label={`About ${brand.productName}`}>
      <BrandLockup intro/>
      <div className="auth-intro-content"><span className="auth-eyebrow">PERSONAL TRADING WORKSPACE</span><h1>The result isn't<br/><em>the whole story.</em></h1><p>{brand.tagline} Bring your trading history, strategies and reviews into one focused workspace.</p><div className="auth-features"><div><span>01</span><strong>See the record behind the result</strong><small>Keep the details of each trade together.</small></div><div><span>02</span><strong>Review trades with purpose</strong><small>Revisit your decisions and your process.</small></div></div></div>
      <p className="auth-footer">Record. Review. Refine.</p>
    </section>
    <section className="auth-content"><div className="auth-theme"><ThemeToggle/></div><div className="auth-card"><span className="auth-card-kicker">{mode === 'signUp' ? 'GET STARTED' : mode === 'signIn' ? 'WELCOME BACK' : 'ACCOUNT RECOVERY'}</span><h2>{mode === 'signUp' ? 'Create your account' : mode === 'signIn' ? 'Sign in to your journal' : mode === 'reset' ? 'Reset your password' : 'Enter your recovery code'}</h2><p>{mode === 'signUp' ? 'Start building a clearer picture of your trading.' : mode === 'signIn' ? 'Pick up where you left off.' : mode === 'reset' ? 'Enter the email address you used for your journal.' : 'If an account exists for this email and recovery is configured, a code will arrive. It expires after 15 minutes.'}</p>
      <form className="auth-form" onSubmit={(event) => { event.preventDefault(); setError(''); setBusy(true); const form = new FormData(event.currentTarget); form.set('flow', mode); if (mode === 'reset') { void signIn('password', form).catch(() => {}).finally(() => { setMode('reset-verification'); setBusy(false) }); return } void signIn('password', form).catch(() => setError(mode === 'reset-verification' ? 'Could not reset password. Check the email and code, or request a new code.' : mode === 'signIn' ? 'Could not sign in. Check your email and password.' : 'Could not create your account. Check your details or try signing in.')).finally(() => setBusy(false)) }}>
        <label htmlFor="auth-email">Email address</label><input id="auth-email" name="email" type="email" required autoComplete="email" placeholder="you@example.com" value={email} onChange={(event) => setEmail(event.target.value)}/>
        {mode === 'reset-verification' && <><label htmlFor="auth-code">Recovery code</label><input id="auth-code" name="code" type="text" required autoComplete="one-time-code" placeholder="Paste the code from your email"/></>}
        {mode !== 'reset' && <><label htmlFor="auth-password">{mode === 'reset-verification' ? 'New password' : 'Password'}</label><input id="auth-password" name={mode === 'reset-verification' ? 'newPassword' : 'password'} type="password" required minLength={8} autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'} placeholder={mode === 'signIn' ? 'Enter your password' : 'At least 8 characters'}/></>}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="button button-primary auth-submit" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signUp' ? 'Create account' : mode === 'signIn' ? 'Sign in' : mode === 'reset' ? 'Send recovery code' : 'Reset password'}</button>
      </form>
      {(mode === 'signIn' || mode === 'reset-verification') && <p className="auth-switch"><button type="button" disabled={busy} onClick={() => { setMode('reset'); setError('') }}>{mode === 'signIn' ? 'Forgot password?' : 'Request another code'}</button></p>}
      <p className="auth-switch">{mode === 'signUp' ? 'Already have an account?' : mode === 'signIn' ? `New to ${brand.productName}?` : 'Remembered your password?'} <button type="button" disabled={busy} onClick={() => { setMode(mode === 'signIn' ? 'signUp' : 'signIn'); setError('') }}>{mode === 'signIn' ? 'Create account' : 'Sign in'}</button></p>
    </div></section>
  </main>
}

export function SetupRequired() {
  return <main className="auth-shell"><div className="auth-loading"><h1>Journal setup required</h1><p>Connect your Convex deployment using the project README, then reload.</p></div></main>
}
