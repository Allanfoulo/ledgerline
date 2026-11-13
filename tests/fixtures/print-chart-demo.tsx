import { createRoot } from 'react-dom/client'
import PrintChart from '../../src/PrintChart'
import { buildPrintChart } from '../../src/domain/printChart'
import { trades } from '../../src/data/trades'
import '../../src/styles.css'
import '../../src/light-theme.css'
const trade=trades[0]
const candles=Array.from({length:34},(_,i)=>{const time=new Date(Date.parse('2026-11-02T08:14:00Z')+i*60000).toISOString().slice(0,19);const open=1.1512+i*.000045+Math.sin(i/2)*.0001;const close=open+(i%2?.00007:-.00004);return {time,open,high:Math.max(open,close)+.00006,low:Math.min(open,close)-.00006,close}})
const spec=buildPrintChart(trade,candles,'mt5_candles','2026-11-13T12:00:00Z')
createRoot(document.getElementById('root')!).render(<main className="page-content"><h1>Synthetic chart demonstration</h1><p>Sample candles and trades for interface testing.</p><PrintChart spec={spec}/></main>)
