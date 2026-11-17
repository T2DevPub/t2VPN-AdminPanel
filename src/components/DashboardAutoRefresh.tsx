'use client';
import {useEffect,useState} from 'react';
import {useRouter} from 'next/navigation';
import {RefreshCw,Radio} from 'lucide-react';

/** Refresh server-rendered overview data; no simulated connections or bytes. */
export default function DashboardAutoRefresh(){
 const router=useRouter();
 const [updated,setUpdated]=useState(()=>new Date());
 useEffect(()=>{
  const refresh=()=>{if(document.visibilityState==='visible'){router.refresh();setUpdated(new Date())}};
  const timer=setInterval(refresh,15000);
  const onFocus=()=>refresh();
  window.addEventListener('focus',onFocus);
  return ()=>{clearInterval(timer);window.removeEventListener('focus',onFocus)};
 },[router]);
 return <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500" aria-label="Overview refresh controls">
  <span className="inline-flex min-h-9 items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3"><Radio size={14} className="text-emerald-600"/> Today · IST · refresh 15s</span>
  <button type="button" className="ui-btn ui-btn-secondary" onClick={()=>{router.refresh();setUpdated(new Date())}} aria-label="Refresh dashboard now"><RefreshCw size={15}/>Refresh</button>
  <span className="sr-only" aria-live="polite">Refreshed {updated.toLocaleTimeString('en-IN',{timeZone:'Asia/Kolkata'})} IST</span>
 </div>;
}
