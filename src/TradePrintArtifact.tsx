import { useAction, useQuery } from 'convex/react'
import { useEffect, useState } from 'react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'
import PrintChart from './PrintChart'

const statusText = {
  pending_chart: 'Waiting for the MT5 connector to send candle history.',
  pending_capture: 'MT5 candles are ready. The image is captured automatically while your journal is open.',
  captured: 'A timestamped chart image is saved with this trade.',
  needs_data: 'MT5 did not provide usable history for this trade. No candles or executions were invented.',
  failed: 'Automatic chart processing reached its retry limit. The trade and its recorded fills are still saved.',
} as const

export default function TradePrintArtifact({ tradeId }: { tradeId: string }) {
  const id = tradeId as Id<'journalTrades'>
  const artifact = useQuery(api.prints.artifact, { tradeId: id })
  const getImage = useAction(api.prints.getImage)
  const [image, setImage] = useState<string | null>(null)
  const [loadingImage, setLoadingImage] = useState(false)

  useEffect(() => {
    let cancelled = false
    setImage(null)
    if (!artifact?.imageAvailable) return () => { cancelled = true }
    setLoadingImage(true)
    void getImage({ tradeId: id }).then((value) => { if (!cancelled) setImage(value) }).catch(() => { if (!cancelled) setImage(null) }).finally(() => { if (!cancelled) setLoadingImage(false) })
    return () => { cancelled = true }
  }, [artifact?.imageAvailable, getImage, id])

  if (!artifact) return null
  return <section className="trade-print-artifact" aria-label="Trade Print">
    <div className="panel print-artifact-status"><div><span className="record-label">TRADE PRINT</span><p role="status">{statusText[artifact.status]}</p></div>{artifact.capturedAt !== undefined && <time dateTime={new Date(artifact.capturedAt).toISOString()}>Captured {new Date(artifact.capturedAt).toLocaleString('en-ZA', { timeZone: 'UTC', dateStyle: 'medium', timeStyle: 'short' })} UTC</time>}</div>
    {artifact.chart && <PrintChart spec={artifact.chart} imageStatus={artifact.status === 'captured' ? 'saved' : artifact.status === 'failed' ? 'failed' : 'capturing'}/>}
    {artifact.imageAvailable && <section className="panel print-saved-image"><div className="panel-heading"><div><h2>Saved chart image</h2><p>Private to your signed-in journal account.</p></div></div>{loadingImage && <p role="status">Loading saved imageâ€¦</p>}{image && <img src={image} alt={`Timestamped ${artifact.chart?.pair ?? 'trade'} chart with recorded entry and exit executions`}/>}</section>}
  </section>
}
