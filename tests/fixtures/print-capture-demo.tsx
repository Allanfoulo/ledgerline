import { useCallback, useState } from 'react'
import { createRoot } from 'react-dom/client'
import PrintChart from '../../src/PrintChart'
import { buildPrintChart } from '../../src/domain/printChart'
import { trades } from '../../src/data/trades'
import '../../src/styles.css'
const candles=Array.from({length:34},(_,i)=>{const time=new Date(Date.parse('2026-11-02T08:14:00Z')+i*60000).toISOString().slice(0,19);const open=1.1512+i*.000045+Math.sin(i/2)*.0001;const close=open+(i%2?.00007:-.00004);return {time,open,high:Math.max(open,close)+.00006,low:Math.min(open,close)-.00006,close}})
const spec=buildPrintChart(trades[0],candles,'mt5_candles','2026-11-13T12:00:00Z')
function Demo(){ const [url,setUrl]=useState(''); const [meta,setMeta]=useState(''); const ready=useCallback((capture:(()=>Promise<Blob>)|null)=>{if(!capture)return;requestAnimationFrame(()=>requestAnimationFrame(()=>{void capture().then(blob=>{setUrl(URL.createObjectURL(blob));setMeta(`${blob.type} ${blob.size}`)}).catch(e=>setMeta(e.message))}))},[]);return <main><h1>Synthetic PNG capture test</h1><PrintChart spec={spec} onCaptureReady={ready}/><p id="capture-result">{meta}</p>{url&&<img alt="Synthetic timestamped Print" src={url}/>}</main>}
createRoot(document.getElementById('root')!).render(<Demo/>)
