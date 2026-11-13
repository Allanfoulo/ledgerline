import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import App from '../../src/App'
import { BackendContext } from '../../src/Backend'
import SettingsView from '../../src/SettingsView'
import { trades as sample } from '../../src/data/trades'
import '../../src/styles.css'
import '../../src/light-theme.css'
function Fixture() {
 const [realTrades,setTrades]=useState(sample.slice(0,1).map(t=>({...t,source:'real'})))
 const [strategies,setStrategies]=useState<any[]>([]); const [backtests,setBacktests]=useState<any[]>([]); const [reviews,setReviews]=useState<any[]>([])
 const [status,setStatus]=useState<any>(null); const [keyConfigured,setKeyConfigured]=useState(true); const [dayNotes,setDayNotes]=useState({}); const [tradeNotes,setTradeNotes]=useState({})
 const accountId='fixture-account'; const accounts=[{id:accountId,name:'Synthetic account',currency:'USD' as const}]; const noop=async()=>{}
 const createAccount=async()=>{}; const issue=async()=>{setStatus({expiresAt:Date.now()+86400000});return 'fixture-token'}; const revoke=async()=>setStatus(null)
 const settings=<SettingsView keyConfigured={keyConfigured} signOut={noop} saveKey={async()=>setKeyConfigured(true)} removeKey={async()=>setKeyConfigured(false)} aligned={0} total={15} syncing={false} progress="" canAlign={true} align={()=>{}} accountId={accountId} accounts={accounts} setAccountId={()=>{}} connectorStatus={status} issueConnector={issue} revokeConnector={revoke}/>
 const backend:any={ configured:true,authenticated:true,keyConfigured,error:'',signOut:noop,dayNotes,tradeNotes,samplePrices:{},accounts,accountId,setAccountId:()=>{},realTrades,tradesLoading:false,strategies,reviews,backtests,settings,createAccount,
 saveTrades:async(_id:any,items:any[])=>{setTrades(old=>[...old,...items.map((t:any,i:number)=>({...t,id:`fixture-${Date.now()}-${i}`,source:'real',tags:[],note:'',executions:[{time:t.entryTime,price:t.entry,lots:t.lots,action:t.side==='Long'?'Buy':'Sell'},{time:t.exitTime,price:t.exit,lots:t.lots,action:t.side==='Long'?'Sell':'Buy'}]}))]);return {inserted:items.length,duplicates:0}},
 saveStrategy:async(id:any,name:any,rules:any)=>setStrategies(old=>[...old,{id:id||crypto.randomUUID(),name,rules}]),saveReview:async(tradeId:any,strategyId:any,checked:any)=>setReviews(old=>[...old.filter(r=>r.tradeId!==tradeId),{tradeId,strategyId,checked}]),saveBacktest:async(d:any)=>setBacktests(old=>[...old,{...d,id:crypto.randomUUID()}]),saveNote:(kind:any,key:any,value:any)=>kind==='day'?setDayNotes(old=>({...old,[key]:value})):setTradeNotes(old=>({...old,[key]:value})),
 candles:async({date}:any)=>Array.from({length:240},(_,i)=>{const time=new Date(Date.parse(date+'T08:00:00Z')+i*60000).toISOString().slice(0,19);const open=1.1+i*.0001;return {time,open,high:open+.0002,low:open-.0001,close:open+.0001}})}
 return <BackendContext.Provider value={backend}><App/></BackendContext.Provider>
}
document.documentElement.dataset.theme=localStorage.getItem('sideprint-theme')||'dark'
createRoot(document.getElementById('root')!).render(<Fixture/>)
