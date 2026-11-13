import type { OpenPosition } from './domain/backtest'
import type { Pair } from './domain/trade'

export type ReplayPosition = { id: string; position: OpenPosition }

export default function BacktestPositions({ positions, pair, currentTime, disabled, closeOne, closeAll }: { positions: ReplayPosition[]; pair: Pair; currentTime: string; disabled: boolean; closeOne: (id: string) => void; closeAll: () => void }) {
  if (!positions.length) return <p>No open simulated positions.</p>
  const precision = pair === 'XAU/USD' ? 3 : 5
  const canCloseAll = positions.every(({ position }) => position.entryTime < currentTime)
  return <div className="backtest-positions">
    <div className="backtest-positions-heading"><strong>Open positions ({positions.length})</strong><button type="button" className="button button-quiet" disabled={disabled || !canCloseAll} onClick={closeAll}>Close all</button></div>
    {!canCloseAll && <p>Advance to a later candle before closing a position opened on this candle.</p>}
    <div className="table-scroll"><table className="trade-table"><thead><tr><th>Side</th><th>Lots</th><th>Entry</th><th>Time (UTC)</th><th><span className="sr-only">Action</span></th></tr></thead><tbody>{positions.map(({ id, position }, index) => <tr key={id}><td>{position.side}</td><td>{position.lots}</td><td>{position.entry.toFixed(precision)}</td><td>{position.entryTime}</td><td><button type="button" className="button button-quiet" disabled={disabled || position.entryTime >= currentTime} onClick={() => closeOne(id)} aria-label={`Close position ${index + 1}, ${position.side.toLowerCase()} opened at ${position.entryTime} for ${position.lots} lots`}>Close</button></td></tr>)}</tbody></table></div>
  </div>
}
