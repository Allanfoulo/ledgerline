import { useState } from 'react'
import { useConvexAuth } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import ThemeToggle from './ThemeToggle'

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
    <section className="auth-intro" aria-label="About Ledgerline">
      <div className="auth-brand"><div className="brand-symbol"><span/><span/><span/></div><strong>Ledgerline</strong></div>
      <div className="auth-intro-content"><span className="auth-eyebrow">YOUR PERSONAL TRADING JOURNAL</span><h1>Make every trade<br/><em>count for more.</em></h1><p>Bring your trades, notes, and reviews together in one clear view.</p><div className="auth-features"><div><span>01</span><strong>See the whole picture</strong><small>Track the results behind your decisions.</small></div><div><span>02</span><strong>Review with purpose</strong><small>Revisit trades and build a process you trust.</small></div></div></div>
      <p className="auth-footer">A little more clarity, every session.</p>
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
      <p className="auth-switch">{mode === 'signUp' ? 'Already have an account?' : mode === 'signIn' ? 'New to Ledgerline?' : 'Remembered your password?'} <button type="button" disabled={busy} onClick={() => { setMode(mode === 'signIn' ? 'signUp' : 'signIn'); setError('') }}>{mode === 'signIn' ? 'Create account' : 'Sign in'}</button></p>
    </div></section>
  </main>
}

export function SetupRequired() {
  return <main className="auth-shell"><div className="auth-loading"><h1>Journal setup required</h1><p>Connect your Convex deployment using the project README, then reload.</p></div></main>
}
