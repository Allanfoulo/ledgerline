import { useState } from 'react'
import { useAction, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import { chartAnalysisProviderCatalog } from './domain/chartAnalysis'

const providerApi = (api as any).providerKeys

export default function ProviderSettings() {
  return <section className="settings-form connector-settings"><h2>Chart analysis providers</h2><p>Choose and configure a provider here. Keys are encrypted on the server and are never returned to the browser.</p>{chartAnalysisProviderCatalog.map((provider) => <ProviderKeySetting key={provider.id} provider={provider}/>)}</section>
}

function ProviderKeySetting({ provider }: { provider: (typeof chartAnalysisProviderCatalog)[number] }) {
  const configured = useQuery(providerApi.status, { provider: provider.id }) as boolean | undefined
  const save = useAction(providerApi.save)
  const remove = useAction(providerApi.remove)
  const [key, setKey] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  async function run(operation: () => Promise<unknown>, success: string) {
    setBusy(true); setMessage('')
    try { await operation(); setKey(''); setMessage(success) } catch { setMessage('Could not update the key. Check the connection and server configuration.') } finally { setBusy(false) }
  }
  return <div className="provider-key-card"><h3>{provider.label}</h3><p>{configured === undefined ? 'Checking connection…' : configured ? 'API key saved' : 'No API key saved'}</p><label>{provider.keyLabel}<input type="password" autoComplete="new-password" value={key} onChange={(event) => setKey(event.target.value)} maxLength={256}/></label><div className="settings-actions"><button type="button" className="button button-primary" disabled={busy || !key.trim()} onClick={() => { void run(() => (save as any)({ provider: provider.id, key }), 'API key saved.') }}>Save key</button><button type="button" className="button button-quiet" disabled={busy || !configured} onClick={() => { void run(() => (remove as any)({ provider: provider.id }), 'API key removed.') }}>Remove key</button></div><p>Before analysis, the selected chart image and strategy version are sent to {provider.label}. {provider.dataUseNotice} Check the provider’s current terms.</p>{message && <p role="status">{message}</p>}</div>
}
