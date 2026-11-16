import {db} from '@/lib/db';
export const adKeys=['app_open','home_banner','usage_banner','region_native','rewarded_unlock',
 'connect_interstitial','disconnect_interstitial','free_server_interstitial'] as const;
type Key=typeof adKeys[number];
export type AdUnit={id:string;name:string;provider:'ADX'|'META'|'ADFOX';format:string;unitId:string;enabled:boolean};
export type AdPlacement={key:Key;enabled:boolean;unitRef:string;fallbackRef:string};
export type AdCountryRule={country:string;placement:Key;unitRef:string;enabled:boolean};
export type AdConfig={version:2;adsEnabled:boolean;providers:Record<string,{enabled:boolean;appId:string}>;units:AdUnit[];placements:AdPlacement[];countryRules:AdCountryRule[];appOpenCooldownMinutes:number;rewardedUnlockEnabled:boolean};
const defaultProviders={ADX:{enabled:false,appId:''},META:{enabled:false,appId:''},ADFOX:{enabled:false,appId:''}};
const defaults:AdConfig={version:2,adsEnabled:false,providers:defaultProviders,units:[],placements:adKeys.map(key=>({key,enabled:false,unitRef:'',fallbackRef:''})),countryRules:[],appOpenCooldownMinutes:30,rewardedUnlockEnabled:false};
export async function readAdConfig():Promise<AdConfig>{
 const item=await db.appSetting.findUnique({where:{key:'ad_management_v2'}});
 if(!item)return defaults;
 const raw=JSON.parse(item.value) as Partial<AdConfig>;
 if(raw.version!==2||!Array.isArray(raw.units)||!Array.isArray(raw.placements)||!Array.isArray(raw.countryRules))throw new Error('Invalid ad configuration');
 return {...defaults,...raw,providers:{...defaultProviders,...raw.providers},placements:adKeys.map(key=>
  raw.placements!.find(p=>p.key===key)||{key,enabled:false,unitRef:'',fallbackRef:''})};
}
export function publicAdConfig(c:AdConfig,countryCode:string){
 const country=/^[A-Z]{2}$/.test(countryCode)?countryCode:'';
 const units=new Map(c.units.map(u=>[u.id,u]));
 const unit=(id:string)=>{
  const u=units.get(id);
  return u&&u.enabled&&c.providers[u.provider]?.enabled&&u.unitId
   ?{provider:u.provider,format:u.format,unitId:u.unitId}:null;
 };
 return {schemaVersion:2,adsEnabled:c.adsEnabled,providers:Object.fromEntries(Object.entries(c.providers).map(([provider,x])=>[provider,{enabled:x.enabled,appId:x.appId}])),
  rewardedUnlockEnabled:c.rewardedUnlockEnabled,appOpenCooldownMinutes:c.appOpenCooldownMinutes,
  placements:c.placements.map(p=>{
   const override=c.countryRules.find(r=>r.country===country&&r.placement===p.key&&r.enabled);
   const primary=(override?.unitRef?unit(override.unitRef):null)||unit(p.unitRef);
   const fallback=unit(p.fallbackRef);
   return {key:p.key,enabled:Boolean(c.adsEnabled&&p.enabled&&(primary||fallback)),primary, fallback:primary?fallback:null};
  })};
}
export function eligibleRewardedUnitIds(c:AdConfig){
 if(!c.adsEnabled||!c.rewardedUnlockEnabled||!c.providers.ADX?.enabled)return new Set<string>();
 const placement=c.placements.find(p=>p.key==='rewarded_unlock');
 if(!placement?.enabled)return new Set<string>();
 const ids=new Set([placement.unitRef,placement.fallbackRef,
  ...c.countryRules.filter(r=>r.enabled&&r.placement==='rewarded_unlock').map(r=>r.unitRef)]);
 return new Set(c.units.filter(u=>ids.has(u.id)&&u.enabled&&u.provider==='ADX'&&u.format==='REWARDED').map(u=>u.unitId));
}
