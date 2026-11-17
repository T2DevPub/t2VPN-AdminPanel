'use client';
import {useEffect,useMemo,useState} from 'react';
import {AlertCircle,CheckCircle2,ChevronDown,ChevronUp,ExternalLink,Plus,RefreshCw,Save,Settings2,Trash2} from 'lucide-react';

type Provider='ADX'|'META'|'ADFOX';
type Format='APP_OPEN'|'BANNER'|'NATIVE'|'REWARDED'|'INTERSTITIAL';
type Key='app_open'|'home_banner'|'usage_banner'|'region_native'|'rewarded_unlock'|'connect_interstitial'|'disconnect_interstitial'|'free_server_interstitial';
type Unit={id:string;name:string;provider:Provider;format:Format;unitId:string;enabled:boolean};
type Placement={key:Key;enabled:boolean;unitRef:string;fallbackRef:string};
type Rule={id:string;country:string;placement:Key;unitRef:string;enabled:boolean};
type Config={version:2;adsEnabled:boolean;providers:Record<Provider,{enabled:boolean;appId:string}>;units:Unit[];placements:Placement[];countryRules:Rule[];appOpenCooldownMinutes:number;rewardedUnlockEnabled:boolean};
type Tab='placements'|'units'|'countries';
const providers:Provider[]=['ADX','META','ADFOX'];
const names:Record<Provider,string>={ADX:'Google AdMob / AdX',META:'Meta Audience Network',ADFOX:'Yandex Ads / Adfox'};
const definitions:{key:Key;label:string;format:Format;detail:string}[]=[
 {key:'home_banner',label:'Home banner',format:'BANNER',detail:'On the VPN home screen'},
 {key:'usage_banner',label:'Usage statistics banner',format:'BANNER',detail:'On the usage screen'},
 {key:'region_native',label:'Region selection native',format:'NATIVE',detail:'Inside the server selection overlay'},
 {key:'rewarded_unlock',label:'Rewarded unlock',format:'REWARDED',detail:'Plus access after a verified rewarded ad'},
 {key:'app_open',label:'App open',format:'APP_OPEN',detail:'On app launch or return'},
 {key:'connect_interstitial',label:'After connection',format:'INTERSTITIAL',detail:'When the VPN connects'},
 {key:'disconnect_interstitial',label:'After disconnection',format:'INTERSTITIAL',detail:'When the VPN disconnects'},
 {key:'free_server_interstitial',label:'Free server selection',format:'INTERSTITIAL',detail:'After selecting a Free server'}
];
const defaults:Config={version:2,adsEnabled:false,providers:{ADX:{enabled:false,appId:''},META:{enabled:false,appId:''},ADFOX:{enabled:false,appId:''}},units:[],placements:definitions.map(d=>({key:d.key,enabled:false,unitRef:'',fallbackRef:''})),countryRules:[],appOpenCooldownMinutes:30,rewardedUnlockEnabled:false};
const regions=[['RU','Russia'],['KZ','Kazakhstan'],['BY','Belarus'],['UZ','Uzbekistan'],['IN','India'],['US','United States'],['GB','United Kingdom'],['DE','Germany'],['FR','France'],['BR','Brazil']];
const fmtList:Format[]=['BANNER','NATIVE','INTERSTITIAL','REWARDED','APP_OPEN'];
const labelFor=(key:Key)=>definitions.find(d=>d.key===key)?.label||key;
const yandexLabels:Record<Format,string>={APP_OPEN:'App Open',REWARDED:'Rewarded',INTERSTITIAL:'Interstitial',NATIVE:'Native',BANNER:'Banner'};
const yandexOrder:Format[]=['APP_OPEN','REWARDED','INTERSTITIAL','NATIVE','BANNER'];

export default function AdManagement(){
 const [data,setData]=useState<Config>(defaults);
 const [saved,setSaved]=useState<string|null>(null);
 const [tab,setTab]=useState<Tab>('placements');
 const [loading,setLoading]=useState(true);
 const [saving,setSaving]=useState(false);
 const [notice,setNotice]=useState<{kind:'success'|'error'|'info';text:string}|null>(null);
 const [advanced,setAdvanced]=useState(false);
 const [morePlacements,setMorePlacements]=useState(false);
 const [previewCountry,setPreviewCountry]=useState('RU');
 const [newUnit,setNewUnit]=useState({name:'',provider:'ADFOX' as Provider,format:'BANNER' as Format,unitId:''});
 const [newRule,setNewRule]=useState({country:'RU',placement:'home_banner' as Key,unitRef:''});
 const [yandexUnitInputs,setYandexUnitInputs]=useState<Record<Format,string>>({APP_OPEN:'',REWARDED:'',INTERSTITIAL:'',NATIVE:'',BANNER:''});
 const dirty=saved!==null&&JSON.stringify(data)!==saved;
 const unitMap=useMemo(()=>new Map(data.units.map(u=>[u.id,u])),[data.units]);
 const countryValid=/^[A-Z]{2}$/.test(previewCountry);
 const pendingCount=data.placements.filter(p=>p.enabled&&(!p.unitRef||!unitMap.get(p.unitRef)?.enabled||!data.providers[unitMap.get(p.unitRef)?.provider||'ADX'].enabled)).length;

 async function load(force=false){
  if(!force&&dirty&&!window.confirm('Discard unsaved ad changes and reload?'))return;
  setLoading(true);
  try{
   const response=await fetch('/api/ad-management',{cache:'no-store'});
   const body=await response.json();
   if(!response.ok)throw new Error(body.error||'Failed to load ad settings');
   setData(body as Config);
   setSaved(JSON.stringify(body));
   if(!force)setNotice({kind:'info',text:'Saved settings reloaded.'});else setNotice(null);
   if((body as Config).placements.some(p=>p.enabled&&['connect_interstitial','disconnect_interstitial','free_server_interstitial','app_open'].includes(p.key)))setMorePlacements(true);
  }catch(e){setNotice({kind:'error',text:e instanceof Error?e.message:'Unable to load ad settings'})}
  finally{setLoading(false)}
 }
 useEffect(()=>{void load(true)},[]);
 async function save(){
  if(!dirty)return;
  setSaving(true);setNotice(null);
  try{
   const response=await fetch('/api/ad-management',{method:'PUT',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
   const body=await response.json();
   if(!response.ok)throw new Error(body.error||'Unable to save settings');
   setData(body as Config);
   setSaved(JSON.stringify(body));
   setNotice({kind:'success',text:'Saved successfully. Android clients will receive this configuration on their next refresh.'});
  }catch(e){
   const reason=e instanceof Error?e.message:'Unable to save settings';
   setNotice({kind:'error',text:reason+' Your unsaved changes are still here; do not reload until the issue is resolved.'});
  }finally{setSaving(false)}
 }
 function changePlacement(key:Key,patch:Partial<Placement>){
  setData(d=>({...d,placements:d.placements.map(p=>p.key===key?{...p,...patch}:p)}));
 }
 function unitOptions(format:Format,plusUnlock=false){
  return providers.map(provider=>{
   const eligible=data.units.filter(u=>u.provider===provider&&u.format===format&&(!plusUnlock||u.provider==='ADX'));
   if(eligible.length===0)return null;
   return <optgroup key={provider} label={names[provider]}>{eligible.map(u=><option key={u.id} value={u.id}>{u.name}{!u.enabled?' (disabled)':''}</option>)}</optgroup>;
  });
 }
 function addUnit(){
  const name=newUnit.name.trim(),unitId=newUnit.unitId.trim();
  if(!name||!unitId){setNotice({kind:'error',text:'Enter an ad unit name and its ID.'});return}
  if(data.units.some(u=>u.provider===newUnit.provider&&u.unitId===unitId)){
   setNotice({kind:'error',text:'This provider and ad-unit ID are already in the library.'});return
  }
  const unit:Unit={...newUnit,name,unitId,id:'unit_'+Date.now()+'_'+Math.random().toString(36).slice(2,8),enabled:true};
  setData(d=>({...d,units:[...d.units,unit]}));
  setNewUnit({name:'',provider:newUnit.provider,format:'BANNER',unitId:''});
  setNotice({kind:'info',text:'Ad unit added. Assign it to a placement, then Save changes.'});
 }
 function addYandexUnits(){
  const entries=yandexOrder.map(format=>({format,unitId:yandexUnitInputs[format].trim()})).filter(x=>x.unitId);
  if(entries.length===0){setNotice({kind:'error',text:'Enter at least one Yandex ad unit ID.'});return}
  if(entries.some(x=>!/^R-M-\\d+-\\d+$/.test(x.unitId))){setNotice({kind:'error',text:'Yandex mobile IDs should look like R-M-1234567-1. Correct any invalid IDs before adding.'});return}
  if(new Set(entries.map(x=>x.unitId)).size!==entries.length){setNotice({kind:'error',text:'Use a separate mobile unit ID for each Yandex ad format.'});return}
  const conflicts=entries.filter(e=>data.units.some(u=>u.provider==='ADFOX'&&u.unitId===e.unitId&&u.format!==e.format));
  if(conflicts.length){setNotice({kind:'error',text:'One of these Yandex unit IDs already exists under a different format.'});return}
  const additions:Unit[]=entries.filter(e=>!data.units.some(u=>u.provider==='ADFOX'&&u.unitId===e.unitId)).map((e,i)=>({
   id:'unit_yandex_'+Date.now()+'_'+i+'_'+Math.random().toString(36).slice(2,6),
   name:'Yandex '+yandexLabels[e.format],provider:'ADFOX',format:e.format,unitId:e.unitId,enabled:true
  }));
  if(!additions.length){setNotice({kind:'info',text:'Those Yandex units are already in your library.'});return}
  setData(d=>({...d,units:[...d.units,...additions]}));
  setYandexUnitInputs({APP_OPEN:'',REWARDED:'',INTERSTITIAL:'',NATIVE:'',BANNER:''});
  setNotice({kind:'info',text:additions.length+' Yandex ad unit(s) added. Choose their placement(s), then click Save changes.'});
 }
 function removeUnit(id:string){
  const u=unitMap.get(id);if(!u||!window.confirm('Remove '+u.name+'? Its placement and country assignments will also be cleared.'))return;
  setData(d=>({...d,units:d.units.filter(u=>u.id!==id),
   placements:d.placements.map(p=>({...p,unitRef:p.unitRef===id?'':p.unitRef,fallbackRef:p.fallbackRef===id?'':p.fallbackRef})),
   countryRules:d.countryRules.filter(r=>r.unitRef!==id)}));
 }
 function addRule(){
  const country=newRule.country.trim().toUpperCase();
  if(!/^[A-Z]{2}$/.test(country)){setNotice({kind:'error',text:'Enter a two-letter country code, such as RU or KZ.'});return}
  if(!newRule.unitRef){setNotice({kind:'error',text:'Choose an ad unit for this country rule.'});return}
  if(data.countryRules.some(r=>r.country===country&&r.placement===newRule.placement)){
   setNotice({kind:'error',text:'This country and placement already have a rule. Remove it before replacing it.'});return
  }
  setData(d=>({...d,countryRules:[...d.countryRules,{id:'rule_'+Date.now(),country,placement:newRule.placement,unitRef:newRule.unitRef,enabled:true}]}));
  setNotice({kind:'info',text:'Country rule added. Save changes to apply it.'});
 }
 function renderPlacement(def:typeof definitions[number]){
  const p=data.placements.find(x=>x.key===def.key);
  if(!p)return null;
  const chosen=unitMap.get(p.unitRef);
  const ineligible=p.enabled&&(!chosen||!chosen.enabled||!data.providers[chosen.provider].enabled);
  return <div key={def.key} className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
   <div className="flex flex-wrap items-center justify-between gap-3">
    <div><h3 className="font-semibold text-sm text-slate-900">{def.label}</h3><p className="mt-1 text-xs text-slate-500">{def.detail}</p></div>
    <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer"><span>{p.enabled?'On':'Off'}</span><input aria-label={def.label+' advertising'} type="checkbox" className="ui-switch" checked={p.enabled} onChange={e=>changePlacement(def.key,{enabled:e.target.checked})}/></label>
   </div>
   {p.enabled&&<div className="grid gap-3 sm:grid-cols-2">
    <label className="block text-xs text-slate-600">Ad unit<select aria-label={def.label+' primary ad unit'} className="input mt-1 w-full" value={p.unitRef} onChange={e=>changePlacement(def.key,{unitRef:e.target.value})}><option value="">Choose an ad unit</option>{unitOptions(def.format,def.key==='rewarded_unlock')}</select></label>
    <label className="block text-xs text-slate-600">Fallback (optional)<select aria-label={def.label+' fallback ad unit'} className="input mt-1 w-full" value={p.fallbackRef} onChange={e=>changePlacement(def.key,{fallbackRef:e.target.value})}><option value="">No fallback</option>{unitOptions(def.format)}</select></label>
   </div>}
   {def.key==='rewarded_unlock'&&<p className="text-xs text-amber-700">Plus unlock requires server-verified Google rewarded ads. A Yandex rewarded unit can be stored in the library, but cannot be assigned here.</p>}
   {ineligible&&<p className="flex gap-2 items-start text-xs text-amber-700"><AlertCircle size={14} className="shrink-0 mt-0.5"/>Choose an enabled unit from an enabled network. Otherwise no ad will load.</p>}
  </div>;
 }

 return <div className="mx-auto max-w-7xl space-y-5 pb-10">
  <header className="flex flex-wrap items-center justify-between gap-3">
   <div><p className="text-xs uppercase tracking-widest font-semibold text-slate-500">T2VPN monetization</p><h1 className="text-3xl font-semibold text-slate-900 mt-1">Ad Management</h1><p className="text-sm text-slate-500 mt-1">Turn on networks, add ad IDs, then choose where ads appear.</p></div>
   <div className="flex flex-wrap items-center gap-2">
    {dirty&&<span className="text-xs font-medium text-amber-700">Unsaved changes</span>}
    <button type="button" className="ui-btn ui-btn-secondary" onClick={()=>void load()} disabled={loading||saving}><RefreshCw size={16}/>Reload</button>
    <button type="button" className="ui-btn ui-btn-primary" onClick={()=>void save()} disabled={!dirty||loading||saving}><Save size={16}/>{saving?'Saving…':'Save changes'}</button>
   </div>
  </header>
  {notice&&<div role="status" aria-live="polite" className={'rounded-xl border px-4 py-3 text-sm flex items-start gap-2 '+(notice.kind==='error'?'border-red-200 bg-red-50 text-red-800':notice.kind==='success'?'border-emerald-200 bg-emerald-50 text-emerald-800':'border-slate-200 bg-white text-slate-700')}>{notice.kind==='success'?<CheckCircle2 size={17} className="shrink-0"/>:<AlertCircle size={17} className="shrink-0"/>}{notice.text}</div>}
  <section className="card p-4 sm:p-5 space-y-4">
   <div className="flex justify-between items-center gap-4"><div><h2 className="font-semibold">Advertising</h2><p className="text-xs text-slate-500 mt-1">Master switch for all ad placements</p></div><label className="flex items-center gap-2 text-sm"><span>{data.adsEnabled?'On':'Off'}</span><input aria-label="Enable all advertising" type="checkbox" className="ui-switch" checked={data.adsEnabled} onChange={e=>setData(d=>({...d,adsEnabled:e.target.checked}))}/></label></div>
   <div className="grid gap-3 md:grid-cols-3">{providers.map(provider=><label key={provider} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 cursor-pointer"><span className="min-w-0"><span className="block text-sm font-semibold">{names[provider]}</span><span className="block text-xs text-slate-500 mt-1">{data.units.filter(u=>u.provider===provider).length} saved ad units</span></span><input aria-label={'Enable '+names[provider]} type="checkbox" className="ui-switch" checked={data.providers[provider].enabled} onChange={e=>setData(d=>({...d,providers:{...d.providers,[provider]:{...d.providers[provider],enabled:e.target.checked}}}))}/></label>)}</div>
   {!data.adsEnabled&&<p className="text-xs text-amber-700">Advertising is off globally. No ad units will be delivered until you enable it and save.</p>}
  </section>
  <nav className="flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-slate-100 p-1 w-fit" aria-label="Ad setup steps">
   {([['placements','1. Where to show ads'],['units','2. Ad unit IDs'],['countries','3. Countries (optional)']] as const).map(([id,label])=><button key={id} role="tab" aria-selected={tab===id} onClick={()=>setTab(id)} className={'rounded-lg px-4 py-2 text-sm font-medium '+(tab===id?'bg-white text-slate-900 shadow-sm':'text-slate-600 hover:bg-white/70')}>{label}</button>)}
  </nav>
  {tab==='placements'&&<div className="space-y-4">
   <div className="flex flex-wrap items-center justify-between gap-2"><div><h2 className="text-lg font-semibold">Choose where ads appear</h2><p className="text-xs text-slate-500">Each placement needs a saved, enabled ad unit. Fallbacks are optional.</p></div><button type="button" onClick={()=>setTab('units')} className="ui-btn ui-btn-secondary"><Plus size={16}/>Add ad unit</button></div>
   {pendingCount>0&&<p className="text-xs text-amber-700">{pendingCount} enabled placement{pendingCount===1?' has':'s have'} no eligible primary unit.</p>}
   <div className="grid gap-3 lg:grid-cols-2">{definitions.slice(0,4).map(renderPlacement)}</div>
   <button type="button" className="ui-btn ui-btn-secondary w-full justify-between" onClick={()=>setMorePlacements(v=>!v)}><span>Other placements: App Open and Interstitials</span>{morePlacements?<ChevronUp size={17}/>:<ChevronDown size={17}/>}</button>
   {morePlacements&&<div className="grid gap-3 lg:grid-cols-2">{definitions.slice(4).map(renderPlacement)}</div>}
   <div className="flex justify-end"><button type="button" onClick={()=>setTab('countries')} className="ui-btn ui-btn-secondary">Optional: Country rules</button></div>
  </div>}
  {tab==='units'&&<div className="space-y-4">
   <section className="card p-5 space-y-4">
    <div><h2 className="text-lg font-semibold">Yandex ad units · Quick add</h2>
     <p className="text-sm text-slate-500 mt-1">Enter any or all five Yandex Advertising Network IDs from your publisher dashboard. Blank formats are skipped; existing units are kept.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
     {yandexOrder.map(format=><label className="block text-sm" key={format}>{yandexLabels[format]} ad unit
      <input className="input mt-1 w-full" aria-label={'Yandex '+yandexLabels[format]+' unit ID'} value={yandexUnitInputs[format]} onChange={e=>setYandexUnitInputs(v=>({...v,[format]:e.target.value}))} placeholder="R-M-…" autoComplete="off"/>
     </label>)}
    </div>
    <p className="text-xs text-amber-700">App Open and Rewarded are Yandex Advertising Network formats, not Adfox direct-sales units. Yandex Rewarded cannot verify T2VPN Plus access; use Google rewarded with SSV for that placement.</p>
    <div className="flex flex-wrap gap-2">
     <button type="button" className="ui-btn ui-btn-primary" onClick={addYandexUnits}><Plus size={16}/>Add Yandex IDs</button>
     <button type="button" className="ui-btn ui-btn-secondary" onClick={()=>setTab('placements')}>Configure placements</button>
    </div>
   </section>
   <section className="card p-5 space-y-4"><div><h2 className="text-lg font-semibold">Add an ad unit</h2><p className="text-xs text-slate-500 mt-1">Copy the real placement ID from your ad network dashboard. Yandex IDs usually start with R-M-.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
     <label className="text-sm">Network<select className="input mt-1 w-full" value={newUnit.provider} onChange={e=>setNewUnit(v=>({...v,provider:e.target.value as Provider,format:'BANNER'}))}>{providers.map(p=><option key={p} value={p}>{names[p]}</option>)}</select></label>
     <label className="text-sm">Format<select className="input mt-1 w-full" value={newUnit.format} onChange={e=>setNewUnit(v=>({...v,format:e.target.value as Format}))}>{fmtList.map(x=><option key={x} value={x}>{x.replace('_',' ')}</option>)}</select></label>
     <label className="text-sm">Name<input className="input mt-1 w-full" value={newUnit.name} onChange={e=>setNewUnit(v=>({...v,name:e.target.value}))} placeholder="Home Adfox"/></label>
     <label className="text-sm">Ad unit ID<input className="input mt-1 w-full" value={newUnit.unitId} onChange={e=>setNewUnit(v=>({...v,unitId:e.target.value}))} placeholder="R-M-..."/></label>
    </div><button type="button" className="ui-btn ui-btn-primary" onClick={addUnit}><Plus size={16}/>Add unit</button>
   </section>
   <section className="card overflow-hidden"><div className="p-4 flex flex-wrap justify-between items-center gap-2"><h2 className="font-semibold">Ad units ({data.units.length})</h2><p className="text-xs text-slate-500">Disable an ID without deleting it.</p></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead className="bg-slate-50 text-slate-600"><tr>{['Name','Network','Format','Ad unit ID','Active',''].map(x=><th className="p-3 text-left font-medium" key={x}>{x}</th>)}</tr></thead><tbody>{data.units.map(u=><tr key={u.id} className="border-t border-slate-100"><td className="p-3 font-medium">{u.name}</td><td className="p-3 text-slate-600">{names[u.provider]}</td><td className="p-3">{u.format}</td><td className="p-3 max-w-52 truncate" title={u.unitId}>{u.unitId}</td><td className="p-3"><input aria-label={'Enable '+u.name} type="checkbox" className="ui-switch" checked={u.enabled} onChange={e=>setData(d=>({...d,units:d.units.map(x=>x.id===u.id?{...x,enabled:e.target.checked}:x)}))}/></td><td className="p-3"><button type="button" className="ui-icon-danger" aria-label={'Delete '+u.name} onClick={()=>removeUnit(u.id)}><Trash2 size={17}/></button></td></tr>)}</tbody></table></div>
    {data.units.length===0&&<div className="p-8 text-center text-sm text-slate-500">No units are saved yet. You can add all five Yandex mobile ad formats above.</div>}
   </section>
   <button type="button" className="ui-btn ui-btn-secondary" onClick={()=>setTab('placements')}>Assign units to pages</button>
  </div>}
  {tab==='countries'&&<div className="space-y-4">
   <section className="card p-5 space-y-4"><h2 className="text-lg font-semibold">Country overrides (optional)</h2><p className="text-sm text-slate-500">Use a different ad unit for visitors in a particular country. Without an override, the normal placement unit applies.</p>
    <div className="grid gap-3 sm:grid-cols-3">
     <label className="text-sm">Country code<input list="ad-countries" maxLength={2} className="input mt-1 w-full uppercase" placeholder="RU" value={newRule.country} onChange={e=>setNewRule(v=>({...v,country:e.target.value.toUpperCase()}))}/><datalist id="ad-countries">{regions.map(([code,name])=><option key={code} value={code}>{name}</option>)}</datalist></label>
     <label className="text-sm">Placement<select className="input mt-1 w-full" value={newRule.placement} onChange={e=>setNewRule(v=>({...v,placement:e.target.value as Key,unitRef:''}))}>{definitions.map(d=><option key={d.key} value={d.key}>{d.label}</option>)}</select></label>
     <label className="text-sm">Use this ad unit<select className="input mt-1 w-full" value={newRule.unitRef} onChange={e=>setNewRule(v=>({...v,unitRef:e.target.value}))}><option value="">Choose unit</option>{unitOptions(definitions.find(d=>d.key===newRule.placement)?.format||'BANNER',newRule.placement==='rewarded_unlock')}</select></label>
    </div><button type="button" className="ui-btn ui-btn-primary" onClick={addRule}><Plus size={16}/>Add country rule</button>
   </section>
   <section className="card p-5 space-y-3"><h2 className="font-semibold">Existing rules ({data.countryRules.length})</h2>
    {data.countryRules.length===0&&<p className="text-sm text-slate-500">No country rules. Your normal page assignments will apply everywhere.</p>}
    {data.countryRules.map(rule=><div key={rule.id} className="flex flex-wrap justify-between items-center gap-3 border-b border-slate-100 py-3 text-sm">
     <div><p className="font-semibold">{regions.find(r=>r[0]===rule.country)?.[1]||rule.country} ({rule.country}) · {labelFor(rule.placement)}</p><p className="text-xs text-slate-500 mt-1">{unitMap.get(rule.unitRef)?.name||'Unknown ad unit'}</p></div>
     <div className="flex items-center gap-3"><label className="flex items-center gap-2 text-xs text-slate-500"><span>{rule.enabled?'On':'Off'}</span><input aria-label={'Enable '+rule.country+' '+rule.placement} className="ui-switch" type="checkbox" checked={rule.enabled} onChange={e=>setData(d=>({...d,countryRules:d.countryRules.map(r=>r.id===rule.id?{...r,enabled:e.target.checked}:r)}))}/></label><button type="button" aria-label={'Delete '+rule.country+' '+rule.placement} className="ui-icon-danger" onClick={()=>setData(d=>({...d,countryRules:d.countryRules.filter(r=>r.id!==rule.id)}))}><Trash2 size={16}/></button></div>
    </div>)}
   </section>
   <section className="card p-4 flex flex-wrap items-center gap-3"><p className="text-sm text-slate-600">Check the Android-facing ad settings for a country:</p><input className="input w-24" aria-label="Preview country" maxLength={2} value={previewCountry} onChange={e=>setPreviewCountry(e.target.value.toUpperCase())}/><a className={'ui-btn ui-btn-secondary '+(!countryValid?'pointer-events-none opacity-50':'')} href={countryValid?'/api/mobile/ads?country='+previewCountry:'#'} target="_blank" rel="noreferrer"><ExternalLink size={15}/>View API</a></section>
   <p className="text-xs text-slate-500">Android must request the appropriate user country code. Changes are not applied until you click Save changes.</p>
  </div>}
  <section className="card p-4 space-y-4">
   <button type="button" aria-expanded={advanced} className="w-full flex items-center justify-between gap-2 text-sm font-semibold" onClick={()=>setAdvanced(v=>!v)}><span className="flex items-center gap-2"><Settings2 size={17}/>Advanced settings</span>{advanced?<ChevronUp size={17}/>:<ChevronDown size={17}/>}</button>
   {advanced&&<div className="space-y-4 border-t border-slate-100 pt-4">
    <label className="flex justify-between items-center gap-4 text-sm">Enable rewarded Plus unlock<input type="checkbox" className="ui-switch" checked={data.rewardedUnlockEnabled} onChange={e=>setData(d=>({...d,rewardedUnlockEnabled:e.target.checked}))}/></label>
    <label className="block max-w-xs text-sm">App Open cooldown (minutes)<input type="number" min={0} max={1440} className="input mt-2 w-full" value={data.appOpenCooldownMinutes} onChange={e=>setData(d=>({...d,appOpenCooldownMinutes:Number(e.target.value)}))}/></label>
    <div className="grid gap-3 lg:grid-cols-3">{providers.map(provider=><label key={provider} className="block text-sm">{names[provider]} · Optional provider app ID<input className="input mt-1 w-full" value={data.providers[provider].appId} onChange={e=>setData(d=>({...d,providers:{...d.providers,[provider]:{...d.providers[provider],appId:e.target.value}}}))} placeholder="Only if your SDK requires one"/></label>)}</div>
    <p className="text-xs text-slate-500">Yandex ad units typically use their R-M- placement ID; do not enter that ID in the optional provider app ID field. Verified rewarded unlock currently requires Google server-side verification.</p>
   </div>}
  </section>
  <footer className="flex flex-wrap gap-3 items-center justify-between">
   <p className="text-xs text-slate-500">The admin stores settings; the Android SDK requests and displays the ads. Network fill is not guaranteed.</p>
   <button type="button" className="ui-btn ui-btn-primary" disabled={!dirty||loading||saving} onClick={()=>void save()}><Save size={16}/>{saving?'Saving…':'Save changes'}</button>
  </footer>
 </div>;
}
