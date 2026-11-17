'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Activity,HardDriveDownload,HardDriveUpload,RefreshCw,Server,Wifi,AlertCircle} from 'lucide-react';
import {ResponsiveContainer,BarChart,Bar,CartesianGrid,XAxis,YAxis,Tooltip,Legend} from 'recharts';
import {countryLabel,countryFlag,serverLocation} from '@/lib/country';

type ServerRow={id:string;name:string;country:string;countryCode:string;city:string;tier:string;enabled:boolean;sessions:number;active:number;bytesIn:number;bytesOut:number;failed:number};
type Payload={generatedAt:string;sampled:boolean;collectorConfigured:boolean;totals:{connections:number;activeSessionRecords:number;bytesIn:number;bytesOut:number;failed:number};servers:ServerRow[]};
const ranges=[['today','Today'],['yesterday','Yesterday'],['7d','7 days'],['30d','30 days'],['lifetime','Lifetime']] as const;
const human=(value:number)=>{if(!value)return '0 B';const units=['B','KB','MB','GB','TB'];const i=Math.min(units.length-1,Math.floor(Math.log(value)/Math.log(1024)));return (value/1024**i).toFixed(i>1?2:0)+' '+units[i]};

export default function NetworkTraffic(){
 const [period,setPeriod]=useState('today'),[rows,setRows]=useState<Payload|null>(null),[busy,setBusy]=useState(true),[error,setError]=useState(''),[search,setSearch]=useState(''),[tier,setTier]=useState('all');
 const load=useCallback(async()=>{
  try{const response=await fetch('/api/analytics?period='+encodeURIComponent(period),{cache:'no-store'});
   if(!response.ok)throw new Error('Network report unavailable');
   setRows(await response.json());setError('');
  }catch(e){setError(e instanceof Error?e.message:'Unable to load traffic')}finally{setBusy(false)}
 },[period]);
 useEffect(()=>{setBusy(true);void load();const timer=setInterval(()=>{if(document.visibilityState==='visible')void load()},15000);return ()=>clearInterval(timer)},[load]);
 const filtered=useMemo(()=>rows?.servers.filter(s=>(tier==='all'||s.tier===tier)&&([s.name,s.country,s.city,s.countryCode].join(' ').toLowerCase().includes(search.toLowerCase())))||[],[rows,tier,search]);
 const totals=filtered.reduce((a,s)=>({traffic:a.traffic+s.bytesIn+s.bytesOut,in:a.in+s.bytesIn,out:a.out+s.bytesOut,live:a.live+s.active,sessions:a.sessions+s.sessions,failed:a.failed+s.failed}),{traffic:0,in:0,out:0,live:0,sessions:0,failed:0});
 const chartData=filtered.map(s=>({name:serverLocation(s.country,s.city,s.countryCode).slice(0,25),upload:+(s.bytesIn/1024**3).toFixed(3),download:+(s.bytesOut/1024**3).toFixed(3)})).sort((a,b)=>(b.upload+b.download)-(a.upload+a.download)).slice(0,12);
 return <div className="mx-auto max-w-7xl space-y-5 pb-10">
  <header className="flex flex-wrap items-center justify-between gap-3">
   <div><p className="text-xs uppercase font-semibold tracking-widest text-slate-500">VPN infrastructure</p><h1 className="mt-2 text-2xl font-semibold text-slate-900">Network Traffic</h1><p className="mt-2 text-sm text-slate-500">Gateway-reported heartbeats and measured VPN traffic; defaults to today (IST).</p></div>
   <button type="button" onClick={()=>{setBusy(true);void load()}} disabled={busy} className="ui-btn ui-btn-secondary"><RefreshCw size={16}/>{busy?'Refreshing…':'Refresh'}</button>
  </header>
  <div className="card p-4 flex flex-wrap items-center gap-2"><span className="text-xs font-semibold text-slate-500 mr-1">Period · IST</span>
   {ranges.map(([id,label])=><button type="button" key={id} className={'ui-tab '+(period===id?'ui-tab-active':'')} onClick={()=>setPeriod(id)}>{label}</button>)}
   <span className="ml-auto text-xs text-slate-500">Auto refresh: 15s · {rows?new Date(rows.generatedAt).toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata'})+' IST':'Awaiting data'}</span>
  </div>
  {error&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
  {!rows?.collectorConfigured&&<div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><AlertCircle size={18} className="shrink-0"/>A trusted VPN gateway collector has not been configured. Existing usage is not inferred from connection counts.</div>}
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
   {[
    {name:'Live heartbeat sessions',value:totals.live.toLocaleString(),detail:'Reported in last 60 seconds',Icon:Wifi},
    {name:'Total bandwidth',value:human(totals.traffic),detail:'Recorded counters · selected period',Icon:Activity},
    {name:'Received bytes',value:human(totals.in),detail:'From trusted VPN accounting',Icon:HardDriveDownload},
    {name:'Sent bytes',value:human(totals.out),detail:'From trusted VPN accounting',Icon:HardDriveUpload}
   ].map(({name,value,detail,Icon})=><section key={name} className="card p-5"><div className="flex items-center justify-between text-sm text-slate-500"><span>{name}</span><Icon size={19}/></div><p className="mt-3 text-3xl font-semibold text-slate-900">{value}</p><p className="mt-1 text-xs text-slate-500">{detail}</p></section>)}
  </div>
  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
   <section className="card min-w-0 p-5"><h2 className="font-semibold">Bandwidth by VPN server</h2><p className="mt-1 text-xs text-slate-500">Recorded bytes in GB · Top 12</p>{chartData.some(x=>x.upload+x.download>0)?<div className="h-72 mt-5"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3" vertical={false}/><XAxis dataKey="name" tick={{fontSize:10}} angle={-20} textAnchor="end" height={70}/><YAxis tick={{fontSize:11}}/><Tooltip/><Legend/><Bar name="Received (GB)" dataKey="upload" fill="#64748b"/><Bar name="Sent (GB)" dataKey="download" fill="#0f172a"/></BarChart></ResponsiveContainer></div>:<p className="py-24 text-center text-sm text-slate-500">No measured traffic for the selected period.</p>}</section>
   <section className="card p-5"><h2 className="font-semibold">Connection health</h2><p className="text-sm text-slate-500 mt-2">Reported sessions within this time range.</p><div className="divide-y divide-slate-100 mt-6">{[['Sessions recorded',totals.sessions],['Failed connection records',totals.failed],['Active heartbeat sessions',totals.live],['Configured servers',filtered.length]].map(([key,val])=><div key={String(key)} className="flex justify-between gap-4 py-4 text-sm"><span className="text-slate-500">{key}</span><strong>{Number(val).toLocaleString()}</strong></div>)}</div></section>
  </div>
  <section className="card overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 p-5"><div><h2 className="font-semibold flex items-center gap-2"><Server size={18}/> Individual server usage</h2><p className="mt-1 text-xs text-slate-500">Status reports are independent of ICMP reachability.</p></div><div className="flex flex-wrap gap-2"><input aria-label="Search servers" className="input max-w-56" placeholder="Search servers" value={search} onChange={e=>setSearch(e.target.value)}/><select aria-label="Filter tier" className="input max-w-32" value={tier} onChange={e=>setTier(e.target.value)}><option value="all">All tiers</option><option value="FREE">Free</option><option value="PLUS">Plus</option></select></div></div>
   <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-slate-50 text-slate-500"><tr>{['Server','Tier','Live (60s)','Sessions','Received','Sent','Failures'].map(h=><th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr></thead><tbody>{filtered.map(s=><tr key={s.id} className="border-t border-slate-100"><td className="px-4 py-4 font-medium">{countryFlag(s.countryCode)} {serverLocation(s.country,s.city,s.countryCode)}<p className="text-xs font-normal text-slate-500 mt-1">{s.name}</p></td><td className="px-4 py-4">{s.tier}</td><td className="px-4 py-4 font-semibold">{s.active.toLocaleString()}</td><td className="px-4 py-4">{s.sessions.toLocaleString()}</td><td className="px-4 py-4">{human(s.bytesIn)}</td><td className="px-4 py-4">{human(s.bytesOut)}</td><td className="px-4 py-4">{s.failed.toLocaleString()}</td></tr>)}</tbody></table>{filtered.length===0&&<p className="p-10 text-center text-sm text-slate-500">No matching servers configured.</p>}</div>
  </section>
  {rows?.sampled&&<p className="text-xs text-amber-700">The report reached its 50,000-record limit; historical totals may be incomplete.</p>}
  <p className="text-xs leading-5 text-slate-500">Live counts require authenticated VPN-side heartbeats within 60 seconds. Traffic numbers depend on the last cumulative counters received for each session. These counters are never fabricated from active user counts.</p>
 </div>
}
