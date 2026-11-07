import { createContext, useContext, useEffect, useRef, useState } from 'react'
import { useAction, useConvexAuth, useMutation, useQuery } from 'convex/react'
import { useAuthActions } from '@convex-dev/auth/react'
import { api } from '../convex/_generated/api'
import { trades } from './data/trades'
import type { Trade } from './types'
import type { TradeInput } from './domain/trade'
import { useConvexJournal } from './adapters/useConvexJournal'
import { useConvexStrategies } from './adapters/useConvexStrategies'
import type { Strategy, StrategyReview } from './adapters/useConvexStrategies'
import { useConvexBacktests } from './adapters/useConvexBacktests'
import type { BacktestDraft, BacktestSession } from './adapters/useConvexBacktests'
import { useConvexConnector } from './adapters/useConvexConnector'
import SettingsView from './SettingsView'
import { alignSamples, tradeSignature } from './application/alignSamples'
import type { Candle, SamplePrice } from './application/alignSamples'

type Backend = {
  configured: boolean; authenticated: boolean; keyConfigured: boolean; error: string
  signOut: () => Promise<void>
  dayNotes: Record<string, string>; tradeNotes: Record<string, string>
  samplePrices: Record<string, SamplePrice>
  accounts: Array<{ id: string; name: string; currency: 'USD' }>; accountId: string; setAccountId: (id: string) => void
  realTrades: Trade[]; tradesLoading: boolean
  strategies: Strategy[]; reviews: StrategyReview[]
  backtests: BacktestSession[]; saveBacktest: (draft: BacktestDraft) => Promise<void>
  saveStrategy: (id: string | undefined, name: string, rules: string[]) => Promise<void>; saveReview: (tradeId: string, strategyId: string, checked: string[]) => Promise<void>
  createAccount: (name: string) => Promise<void>; saveTrades: (accountId: string, trades: TradeInput[], allowDuplicates: boolean) => Promise<{ inserted: number; duplicates: number }>
  saveNote: (kind: 'day' | 'trade', key: string, text: string) => void
  candles: (args: { pair: string; date: string; exitDate?: string; entryTime: string; exitTime: string }) => Promise<Candle[]>
  settings: React.ReactNode
}
const unavailable = async (): Promise<never> => { throw new Error('Connect Convex and sign in first') }
const empty: Backend = { configured: false, authenticated: false, keyConfigured: false, error: '', signOut: unavailable, dayNotes: {}, tradeNotes: {}, samplePrices: {}, accounts: [], accountId: '', setAccountId: () => {}, realTrades: [], tradesLoading: false, strategies: [], reviews: [], backtests: [], saveBacktest: unavailable, saveStrategy: unavailable, saveReview: unavailable, createAccount: unavailable, saveTrades: unavailable, saveNote: () => {}, candles: unavailable, settings: <p>Connect a Convex deployment to enable sign-in and API key settings. See the project README for setup.</p> }
const BackendContext = createContext<Backend>(empty)
export const useBackend = () => useContext(BackendContext)

export function ConnectedBackend({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useConvexAuth()
  const { signOut } = useAuthActions()
  const journal = useConvexJournal(isAuthenticated)
  const strategyData = useConvexStrategies(isAuthenticated, journal.accountId)
  const backtestData = useConvexBacktests(isAuthenticated, journal.accountId)
  const connector = useConvexConnector(isAuthenticated, journal.accountId)
  const storedNotes = useQuery(api.notes.list, isAuthenticated ? {} : 'skip') as Array<{ kind: 'day' | 'trade'; key: string; text: string }> | undefined
  const keyConfigured = useQuery(api.secrets.status, isAuthenticated ? {} : 'skip') as boolean | undefined
  const savedPrices = useQuery(api.samplePrices.list, isAuthenticated ? {} : 'skip') as SamplePrice[] | undefined
  const saveNoteMutation = useMutation(api.notes.save)
  const saveKey = useAction(api.secrets.save)
  const removeKey = useAction(api.secrets.remove)
  const getCandles = useAction(api.secrets.candles)
  const savePrice = useMutation(api.samplePrices.save)
  const [error, setError] = useState('')
  const [syncing, setSyncing] = useState(false)
  const [progress, setProgress] = useState('')
  const autoStarted = useRef(false)
  const syncRunning = useRef(false)
  const timers = useRef<Record<string, number>>({})
  const dayNotes: Record<string, string> = {}; const tradeNotes: Record<string, string> = {}
  const samplePrices = Object.fromEntries((savedPrices ?? []).map((row) => [row.tradeId, row]))
  for (const note of storedNotes ?? []) (note.kind === 'day' ? dayNotes : tradeNotes)[note.key] = note.text
  function saveNote(kind: 'day' | 'trade', noteKey: string, text: string) {
    if (!isAuthenticated) return
    const timerKey = `${kind}:${noteKey}`
    window.clearTimeout(timers.current[timerKey])
    timers.current[timerKey] = window.setTimeout(() => { void saveNoteMutation({ kind, key: noteKey, text }).catch(() => setError('Could not save note. Check your connection.')) }, 600)
  }
  async function alignTrades() {
    if (!keyConfigured || !savedPrices || syncRunning.current) return
    syncRunning.current = true
    setSyncing(true); setError(''); setProgress('Starting…')
    const result = await alignSamples({ candles: async (args) => getCandles(args) as Promise<Candle[]>, save: async (price) => savePrice(price), wait: () => new Promise((resolve) => window.setTimeout(resolve, 9000)) }, trades, samplePrices, (current, total) => setProgress(`Aligning ${current} of ${total} sample trades…`))
    setProgress(result.attempted ? `Aligned ${result.completed} trades.${result.failed ? ` ${result.failed} could not be aligned; retry after checking data access.` : ''}` : 'All sample trades are already aligned.')
    setSyncing(false)
    syncRunning.current = false
  }
  useEffect(() => {
    if (!autoStarted.current && isAuthenticated && keyConfigured && savedPrices) {
      autoStarted.current = true
      if (trades.some((trade) => !savedPrices.some((row) => row.tradeId === trade.id && row.signature === tradeSignature(trade)))) void alignTrades()
    }
  }, [isAuthenticated, keyConfigured, savedPrices])
  const alignedCount = trades.filter((trade) => samplePrices[trade.id]?.signature === tradeSignature(trade)).length
  const settingsWithAlignment = <SettingsView keyConfigured={keyConfigured} signOut={async () => { await signOut() }} saveKey={async (key) => { await saveKey({ key }) }} removeKey={async () => { await removeKey({}) }} aligned={alignedCount} total={trades.length} syncing={syncing} progress={progress} canAlign={!!keyConfigured && !!savedPrices} align={() => { void alignTrades() }} accountId={journal.accountId} accounts={journal.accounts} setAccountId={journal.setAccountId} connectorStatus={connector.connectorStatus} issueConnector={connector.issueConnector} revokeConnector={connector.revokeConnector}/>
  return <BackendContext.Provider value={{ configured: true, authenticated: isAuthenticated, keyConfigured: !!keyConfigured, error, signOut, dayNotes, tradeNotes, samplePrices, ...journal, ...strategyData, ...backtestData, saveNote, candles: async (args) => getCandles(args) as Promise<Candle[]>, settings: settingsWithAlignment }}>{children}</BackendContext.Provider>
}
