import { useEffect, useState } from 'react'
import { useAction, useQuery } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { ChartAnalysisDraft } from './domain/chartAnalysis'

const imagesApi = (api as any).planImages

function ImagePreview({ id }: { id: string }) {
  const get = useAction(imagesApi.get)
  const [src, setSrc] = useState('')
  const [error, setError] = useState(false)
  useEffect(() => {
    let active = true
    void get({ imageId: id }).then((value: unknown) => {
      if (active && typeof value === 'string') setSrc(value)
      else if (active) setError(true)
    }).catch(() => { if (active) setError(true) })
    return () => { active = false }
  }, [get, id])
  return <div className="plan-image-preview">{src ? <img src={src} alt="Chart attached to execution plan" /> : <p role="status">{error ? 'Could not load chart.' : 'Loading chart preview…'}</p>}</div>
}

export function PlanVersionEvidence({ versionId }: { versionId: string }) {
  const evidence = useQuery(imagesApi.versionEvidence, { planVersionId: versionId }) as {
    imageIds: string[]
    strategy: { name: string; description: string; version: number; rules: string[]; signals: Array<{ name: string; description: string }> } | null
    analysis: { provider: string; model: string; createdAt: number; suggestions: ChartAnalysisDraft } | null
  } | undefined
  if (!evidence) return <p role="status">Loading plan evidence...</p>
  if (!evidence.strategy && !evidence.imageIds.length && !evidence.analysis) return null
  return <section className="plan-images"><h3>Plan evidence</h3>
    {evidence.strategy && <div className="plan-strategy-snapshot"><strong>{evidence.strategy.name} · version {evidence.strategy.version}</strong>{evidence.strategy.description && <p>{evidence.strategy.description}</p>}<h4>Rules used</h4>{evidence.strategy.rules.map((rule, index) => <p key={`${index}-${rule}`}>{rule}</p>)}<h4>Signal definitions used</h4>{evidence.strategy.signals.map((signal) => <p key={signal.name}><strong>{signal.name}:</strong> {signal.description}</p>)}</div>}
    {evidence.analysis && <p className="plan-analysis-provenance">Chart suggestions analyzed with {evidence.analysis.provider} / {evidence.analysis.model} on {new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }).format(new Date(evidence.analysis.createdAt))}. Suggestions were user-editable before applying.</p>}
    {evidence.imageIds.map((id) => <ImagePreview key={id} id={id}/>)}
  </section>
}
