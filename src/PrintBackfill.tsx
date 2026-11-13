import { useState } from 'react'
import { useMutation } from 'convex/react'
import { api } from '../convex/_generated/api'
import type { Id } from '../convex/_generated/dataModel'

type BackfillResult = { created: number; isDone: boolean; continueCursor: string }

export default function PrintBackfill({ accountId }: { accountId: string }) {
  const backfill = useMutation(api.journal.backfillPrints)
  return <PrintBackfillView accountId={accountId} backfill={(cursor) => backfill({ accountId: accountId as Id<'tradingAccounts'>, cursor })}/>
}

// One bounded page per click; starting over is safe because the server checks each trade.
export function PrintBackfillView({ accountId, backfill }: { accountId: string; backfill: (cursor: string | null) => Promise<BackfillResult> }) {
  const [cursor, setCursor] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [message, setMessage] = useState('')
  async function run() {
    if (!accountId) return
    setBusy(true); setMessage('')
    try {
      const result = await backfill(cursor)
      setCursor(result.continueCursor); setDone(result.isDone)
      setMessage(`${result.created} pending ${result.created === 1 ? 'print' : 'prints'} created in this batch.${result.isDone ? ' Existing MT5 trades have been checked.' : ' Continue to check the next batch.'}`)
    } catch { setMessage('Could not check previous trades. Try again.') }
    finally { setBusy(false) }
  }
  return <section className="print-backfill" aria-label="Trade Print setup">
    <div><strong>Trade Prints</strong><p>New MT5 imports receive a Print automatically. Create missing records for earlier MT5 trades; charts are not available yet.</p></div>
    <button className="button button-quiet" type="button" disabled={busy || done} onClick={() => void run()}>{busy ? 'Checking…' : done ? 'Trades checked' : cursor ? 'Check next batch' : 'Check earlier trades'}</button>
    {message && <p role="status">{message}</p>}
  </section>
}
