export const dynamic = 'force-dynamic';
import Link from 'next/link';
import {db} from '@/lib/db';
import {Activity,ArrowRight,Globe2,Server,ShieldCheck,Wifi,WifiOff,Info,Layers3} from 'lucide-react';

export default async function Overview(){
 const [total,free,plus,enabled,locations,latest]=await Promise.all([
  db.vpnServer.count(),
  db.vpnServer.count({where:{tier:'FREE'}}),
  db.vpnServer.count({where:{tier:'PLUS'}}),
  db.vpnServer.count({where:{enabled:true}}),
  db.vpnServer.groupBy({by:['countryCode']}),
  db.vpnServer.findMany({select:{id:true,name:true,city:true,countryCode:true,tier:true,enabled:true},orderBy:{createdAt:'desc'},take:5})
 ]);
 const metrics=[
  {label:'Total servers',value:total,Icon:Server,detail:'Configured locations',tone:'bg-slate-100 text-slate-700'},
  {label:'Free servers',value:free,Icon:Wifi,detail:'Available on the free tier',tone:'bg-sky-50 text-sky-700'},
  {label:'Plus servers',value:plus,Icon:ShieldCheck,detail:'Premium access locations',tone:'bg-violet-50 text-violet-700'},
  {label:'Enabled servers',value:enabled,Icon:Activity,detail:total?Math.round(enabled/total*100)+'% of configured servers':'No servers configured',tone:'bg-emerald-50 text-emerald-700'}
 ];
 return <div className="mx-auto max-w-7xl space-y-6 pb-10">
  <div className="flex flex-wrap items-start justify-between gap-4">
   <div><p className="mb-2 text-xs font-semibold uppercase tracking-[.17em] text-slate-500">T2VPN · Control center</p><h1 className="text-3xl font-semibold tracking-tight text-slate-900">Overview</h1><p className="mt-2 text-sm text-slate-500">Your infrastructure and operations in one place.</p></div>
   <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800"><span className="h-2 w-2 rounded-full bg-amber-500"/>Live telemetry not connected</div>
  </div>
  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">{metrics.map(({label,value,Icon,detail,tone})=><div key={label} className="card min-w-0 p-4 transition-shadow duration-200 hover:shadow-md sm:p-5"><div className="flex items-start justify-between gap-2"><p className="text-sm font-medium text-slate-500">{label}</p><span className={'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl '+tone}><Icon size={18}/></span></div><p className="mt-4 text-3xl font-semibold tracking-tight text-slate-900">{value}</p><p className="mt-2 text-xs text-slate-500">{detail}</p></div>)}</div>
  <div className="grid gap-4 lg:grid-cols-[minmax(0,1.7fr)_minmax(290px,1fr)]">
   <section className="card min-w-0 overflow-hidden"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 p-5"><div><h2 className="text-base font-semibold text-slate-900">Server inventory</h2><p className="mt-1 text-xs text-slate-500">Recently configured VPN locations</p></div><Link href="/dashboard/servers" className="inline-flex items-center gap-1 text-sm font-medium text-slate-700 transition-colors hover:text-slate-950">View servers <ArrowRight size={15}/></Link></div>
   {latest.length?<div className="divide-y divide-slate-100">{latest.map(s=><div key={s.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 transition-colors hover:bg-slate-50"><div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Server size={18}/></div><div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{s.name}</p><p className="mt-0.5 text-xs text-slate-500">{s.countryCode}{s.city?' · '+s.city:''}</p></div></div><div className="flex items-center gap-2"><span className={'rounded-full px-2.5 py-1 text-xs font-medium '+(s.tier==='PLUS'?'bg-violet-50 text-violet-700':'bg-sky-50 text-sky-700')}>{s.tier==='PLUS'?'Plus':'Free'}</span><span className={'rounded-full px-2.5 py-1 text-xs font-medium '+(s.enabled?'bg-emerald-50 text-emerald-700':'bg-slate-100 text-slate-500')}>{s.enabled?'Enabled':'Disabled'}</span></div></div>)}</div>:<div className="flex flex-col items-center justify-center px-6 py-14 text-center"><Layers3 className="mb-3 text-slate-400" size={28}/><p className="text-sm font-medium text-slate-700">No servers configured</p><p className="mt-1 text-xs text-slate-500">Add your first VPN server to get started.</p><Link href="/dashboard/servers" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800">Manage servers <ArrowRight size={15}/></Link></div>}</section>
   <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
    <section className="card p-5"><div className="flex items-center justify-between"><h2 className="text-base font-semibold text-slate-900">Network coverage</h2><Globe2 size={19} className="text-slate-500"/></div><p className="mt-5 text-3xl font-semibold text-slate-900">{locations.length}</p><p className="mt-1 text-xs text-slate-500">Countries with configured servers</p><div className="mt-5 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-slate-800 transition-all duration-500" style={{width:total?Math.round(enabled/total*100)+'%':'0%'}}/></div><div className="mt-2 flex justify-between text-xs text-slate-500"><span>{enabled} enabled</span><span>{total-enabled} disabled</span></div></section>
    <section className="card p-5"><div className="flex items-center justify-between"><h2 className="text-base font-semibold text-slate-900">Live network activity</h2><WifiOff size={19} className="text-amber-600"/></div><div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-5"><p className="text-sm font-medium text-slate-800">Awaiting VPN agent integration</p><p className="mt-2 text-xs leading-5 text-slate-500">Real-time sessions, traffic and bandwidth will appear after your OpenVPN servers send verified telemetry.</p></div><Link href="/dashboard/analytics" className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-slate-700 hover:text-slate-950">Explore analytics <ArrowRight size={15}/></Link></section>
   </div>
  </div>
  <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 text-xs leading-5 text-slate-500"><Info size={17} className="mt-0.5 shrink-0 text-slate-500"/><p>Server counts and tier assignments come from your database. Enabled means administratively enabled, not verified online. Live usage and bandwidth require server-side telemetry.</p></div>
 </div>
}