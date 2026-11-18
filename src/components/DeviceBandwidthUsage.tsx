'use client';
import {useCallback,useEffect,useMemo,useState} from 'react';
import {Activity,AlertTriangle,CheckCircle2,Filter,Gauge,RefreshCw,RotateCcw,Save} from 'lucide-react';
import {CountryLabel} from '@/components/CountryFlag';

type Status='normal'|'over_quota'|'throttled'|'pending';
type Policy={enforcementEnabled:boolean;dailyLimitGiB:number;throttleMbps:number};
type BandwidthRow={
 installationRecordId:string;anonymousId:string;deviceModel:string;manufacturer:string;
 countryCode:string;plan:string;date:string;measuredBytes:string;countedBytes:string;
 quotaLimitBytes:string;quotaBaselineBytes:string;resetAt:string|null;
 overQuota:boolean;status:Status;targetLimitMbps:number|null;
 gatewayAppliedMbps:number|null;gatewayReportedAt:string|null;
};
type Result={date:string;timezone:string;page:number;pageSize:number;total:number;sampled:boolean;
 items:BandwidthRow[];policy:Policy;trackingSource:string;collectorConfigured:boolean;collectorOnline:boolean;note:string};
const msIST=330*60000;
const currentDay=()=>new Date(Date.now()+msIST).toISOString().slice(0,10);
function bytesFormat(bytes:string){
 const size=Number(bytes);
 if(!Number.isFinite(size))return bytes+' B';
 if(size<1024)return Math.round(size)+' B';
 const units=['KB','MB','GB','TB','PB'];
 const exponent=Math.min(units.length,Math.floor(Math.log(size)/Math.log(1024)));
 return (size/Math.pow(1024,exponent)).toLocaleString('en-IN',{maximumFractionDigits:2,minimumFractionDigits:exponent>1?2:0})+' '+units[exponent-1];
}
function statusStyle(status:Status){
 if(status==='throttled')return 'bg-red-50 text-red-700 border-red-200';
 if(status==='pending')return 'bg-amber-50 text-amber-800 border-amber-200';
 if(status==='over_quota')return 'bg-orange-50 text-orange-700 border-orange-200';
 return 'bg-emerald-50 text-emerald-700 border-emerald-200';
}
function statusText(row:BandwidthRow){
 if(row.status==='throttled')return 'THROTTLED ('+row.gatewayAppliedMbps+' MBPS)';
 if(row.status==='pending')return row.overQuota?'THROTTLE PENDING':'RELEASE PENDING';
 if(row.status==='over_quota')return 'OVER QUOTA · NOT THROTTLED';
 return 'NORMAL';
}
export default function DeviceBandwidthUsage(){
 const [selectedDate,setSelectedDate]=useState(currentDay);
 const [selectedStatus,setSelectedStatus]=useState('all');
 const [filterDate,setFilterDate]=useState(currentDay);
 const [filterStatus,setFilterStatus]=useState('all');
 const [page,setPage]=useState(1);
 const [report,setReport]=useState<Result|null>(null);
 const [policyDraft,setPolicyDraft]=useState<Policy|null>(null);
 const [loading,setLoading]=useState(true),[saving,setSaving]=useState(false);
 const [resetting,setResetting]=useState<string|null>(null);
 const [error,setError]=useState(''),[success,setSuccess]=useState('');
 const load=useCallback(async()=>{
  try{
   const params=new URLSearchParams({date:filterDate,status:filterStatus,page:String(page)});
   const res=await fetch('/api/devices/bandwidth?'+params,{cache:'no-store'});
   const data=await res.json();
   if(!res.ok)throw new Error(data.error||'Unable to fetch bandwidth usage');
   setReport(data as Result);
   setPolicyDraft(old=>old||data.policy);
   setError('');
  }catch(e){setError(e instanceof Error?e.message:'Bandwidth report failed')}
  finally{setLoading(false)}
 },[filterDate,filterStatus,page]);
 useEffect(()=>{
  void load();
  const refresh=setInterval(()=>{if(document.visibilityState==='visible')void load()},15000);
  return ()=>clearInterval(refresh);
 },[load]);
 const policyChanged=useMemo(()=>Boolean(policyDraft&&report&&JSON.stringify(policyDraft)!==JSON.stringify(report.policy)),[policyDraft,report]);
 const onFilter=()=>{
  setError('');setSuccess('');setPage(1);setFilterDate(selectedDate);setFilterStatus(selectedStatus);setLoading(true);
 };
 async function savePolicy(){
  if(!policyDraft||!policyChanged)return;
  setSaving(true);setSuccess('');
  try{
   const res=await fetch('/api/devices/bandwidth',{method:'PUT',
    headers:{'Content-Type':'application/json'},body:JSON.stringify(policyDraft)});
   const d=await res.json();
   if(!res.ok)throw new Error(d.error||'Unable to update quota policy');
   setSuccess('Quota policy saved. Gateway enforcement requires a configured trusted gateway agent.');
   await load();
  }catch(e){setError(e instanceof Error?e.message:'Unable to save quota policy')}
  finally{setSaving(false)}
 }
 async function reset(row:BandwidthRow){
  if(filterDate!==currentDay())return;
  if(!confirm('Reset today’s quota baseline for device '+row.anonymousId+'? This does not erase measured bandwidth history and the gateway must release any active throttle.'))return;
  setResetting(row.installationRecordId);setSuccess('');setError('');
  try{
   const res=await fetch('/api/devices/bandwidth',{method:'PATCH',
     headers:{'Content-Type':'application/json'},
     body:JSON.stringify({action:'resetQuota',installationRecordId:row.installationRecordId,date:filterDate})});
   const d=await res.json();
   if(!res.ok)throw new Error(d.error||'Unable to reset quota');
   setSuccess(d.notice||'Quota reset recorded');await load();
  }catch(e){setError(e instanceof Error?e.message:'Quota reset failed')}
  finally{setResetting(null)}
 }
 const items=report?.items||[];
 return <div className="space-y-4">
  <div className="flex flex-wrap items-start justify-between gap-4">
   <div><h2 className="text-xl font-semibold tracking-tight text-slate-900">Device Bandwidth Usage</h2>
    <p className="mt-1 text-sm text-slate-500">Actual VPN gateway counters · Today in IST by default · refresh every 15 seconds</p></div>
   <div className="flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
    <label className="text-xs font-medium text-slate-600">Date
     <input aria-label="Bandwidth date" type="date" max={currentDay()} value={selectedDate}
      onChange={e=>setSelectedDate(e.target.value)} className="input mt-1 w-40"/></label>
    <label className="text-xs font-medium text-slate-600">Status
     <select aria-label="Bandwidth status" className="input mt-1 w-40" value={selectedStatus} onChange={e=>setSelectedStatus(e.target.value)}>
      <option value="all">All</option><option value="normal">Normal</option>
      <option value="over_quota">Over quota</option><option value="throttled">Throttled</option>
      <option value="pending">Pending gateway</option>
     </select></label>
    <button type="button" onClick={onFilter} className="ui-btn ui-btn-primary" disabled={loading}><Filter size={15}/>Filter</button>
    <button type="button" onClick={()=>void load()} className="ui-btn ui-btn-secondary" aria-label="Refresh bandwidth" disabled={loading}><RefreshCw size={15}/></button>
   </div>
  </div>
  {error&&<div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
  {success&&<div role="status" className="flex items-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-700"><CheckCircle2 size={16}/>{success}</div>}
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
   <div className="card p-4"><p className="text-xs text-slate-500">Measured devices</p><p className="mt-2 text-2xl font-semibold">{report?.total??'—'}</p></div>
   <div className="card p-4"><p className="text-xs text-slate-500">Daily quota</p><p className="mt-2 text-2xl font-semibold">{report?.policy.dailyLimitGiB??'—'} GB</p></div>
   <div className="card p-4"><p className="text-xs text-slate-500">Throttle target</p><p className="mt-2 text-2xl font-semibold">{report?.policy.throttleMbps??'—'} Mbps</p></div>
   <div className="card p-4"><p className="text-xs text-slate-500">Gateway telemetry</p><p className="mt-2 text-sm font-semibold">{report?.collectorOnline?'Recently received':report?.collectorConfigured?'Not reporting':'Not configured'}</p></div>
  </div>
  <section className="card overflow-hidden">
   <div className="overflow-x-auto">
    <table className="w-full min-w-[870px] text-sm">
     <thead className="bg-slate-50"><tr>{['Device ID (Anonymous)','Bandwidth Consumed ('+(filterDate||'Today')+')','Throttle Status','Action'].map(x=><th key={x} className="px-4 py-3 text-left font-semibold text-slate-600">{x}</th>)}</tr></thead>
     <tbody>{items.map(row=>{
      const used=Number(row.countedBytes),limit=Number(row.quotaLimitBytes);
      const ratio=limit>0?Math.min(100,used/limit*100):0;
      return <tr key={row.installationRecordId} className="border-t border-slate-200">
       <td className="px-4 py-4">
        <span className="font-mono text-xs text-slate-700">{row.anonymousId}</span>
        <p className="mt-1 text-xs text-slate-500">{[row.manufacturer,row.deviceModel].filter(Boolean).join(' ')||'VPN device'} · <CountryLabel code={row.countryCode}/></p>
       </td>
       <td className="px-4 py-4 min-w-72">
        <div><span className="font-bold text-slate-900">{bytesFormat(row.countedBytes)}</span><span className="text-xs text-slate-500"> / {report?.policy.dailyLimitGiB} GB</span></div>
        <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
         <div className={'h-full rounded-full '+(row.overQuota?'bg-red-500':'bg-slate-600')} style={{width:ratio+'%'}}/>
        </div>
        {row.resetAt&&<p className="mt-1 text-xs text-slate-500">Quota reset today · total measured {bytesFormat(row.measuredBytes)}</p>}
       </td>
       <td className="px-4 py-4"><span className={'inline-flex rounded-md border px-2 py-1 text-xs font-semibold '+statusStyle(row.status)}>{statusText(row)}</span>
        {row.status==='pending'&&<p className="mt-1 max-w-40 text-xs text-slate-500">Waiting for gateway acknowledgement</p>}
       </td>
       <td className="px-4 py-4"><button type="button" className="ui-btn ui-btn-secondary" disabled={filterDate!==currentDay()||resetting!==null||loading} onClick={()=>void reset(row)}><RotateCcw size={14}/>{resetting===row.installationRecordId?'Resetting…':'Reset Quota'}</button></td>
      </tr>
     })}</tbody>
    </table>
    {items.length===0&&<div className="p-10 text-center">
     <Activity size={23} className="mx-auto text-slate-400"/>
     <p className="mt-3 font-semibold text-slate-700">{loading?'Loading device bandwidth…':'No verified device bandwidth for these filters'}</p>
     <p className="mx-auto mt-2 max-w-lg text-sm text-slate-500">This report requires trusted OpenVPN server accounting. Existing Android app activity or VPN connection attempts cannot be converted into actual device traffic.</p>
    </div>}
   </div>
   <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 p-3 text-xs text-slate-500">
    <span>{report?.sampled?'Showing the first 20,000 measured devices · refine filters':'Showing '+items.length+' of '+(report?.total||0)+' devices'} · IST</span>
    <div className="flex items-center gap-2"><button type="button" className="ui-btn ui-btn-secondary" disabled={page<=1||loading} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page}</span><button type="button" className="ui-btn ui-btn-secondary" disabled={!report||page*report.pageSize>=report.total||loading} onClick={()=>setPage(p=>p+1)}>Next</button></div>
   </div>
  </section>
  <section className="card p-5 space-y-4">
   <div className="flex items-center gap-2"><Gauge size={18} className="text-slate-600"/><h3 className="font-semibold">Daily quota policy</h3></div>
   <div className="grid gap-3 sm:grid-cols-3">
    <label className="block text-sm text-slate-600">Daily quota (GiB)
     <input className="input mt-1 w-full" type="number" min={1} max={1024} value={policyDraft?.dailyLimitGiB??2}
      onChange={e=>setPolicyDraft(p=>({...p!,dailyLimitGiB:Number(e.target.value)}))}/></label>
    <label className="block text-sm text-slate-600">Throttle speed (Mbps)
     <input className="input mt-1 w-full" type="number" min={1} max={1000} value={policyDraft?.throttleMbps??3}
      onChange={e=>setPolicyDraft(p=>({...p!,throttleMbps:Number(e.target.value)}))}/></label>
    <label className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3 text-sm text-slate-700">
     <span>Enable gateway throttling</span>
     <input type="checkbox" className="ui-switch" checked={policyDraft?.enforcementEnabled||false}
      onChange={e=>setPolicyDraft(p=>({...p!,enforcementEnabled:e.target.checked}))}/></label>
   </div>
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="flex max-w-3xl items-start gap-2 text-xs text-amber-700"><AlertTriangle size={16} className="shrink-0"/>
     <span>Enabling the policy does not throttle devices by itself. A trusted OpenVPN gateway agent must fetch policy, enforce the limit, and acknowledge it. Otherwise devices will show a pending status.</span>
    </div>
    <button className="ui-btn ui-btn-primary" type="button" disabled={!policyChanged||saving||!policyDraft} onClick={()=>void savePolicy()}><Save size={15}/>{saving?'Saving…':'Save policy'}</button>
   </div>
  </section>
  <p className="text-xs text-slate-500">{report?.note} A quota reset preserves total bandwidth records; the reported day of a byte delta is when the gateway delivered it (IST). No usage or throttling status is simulated.</p>
 </div>;
}
