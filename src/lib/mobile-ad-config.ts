import {db} from '@/lib/db';

type Unit={id:string;provider:'ADX'|'META'|'ADFOX';format:string;unitId:string;enabled:boolean};
type Placement={key:string;enabled:boolean;unitRef:string;fallbackRef:string};
type Rule={country:string;placement:string;unitRef:string;enabled:boolean};
type Config={version:number;adsEnabled:boolean;providers:Record<string,{enabled:boolean;appId:string}>;units:Unit[];placements:Placement[];countryRules:Rule[];appOpenCooldownMinutes:number;rewardedUnlockEnabled:boolean};
export type PublicUnit={provider:string;format:string;unitId:string};
const defaults:Config={version:2,adsEnabled:false,providers:{},units:[],placements:[],countryRules:[],appOpenCooldownMinutes:30,rewardedUnlockEnabled:false};
export async function readMobileAdConfig():Promise<Config>{
  const row=await db.appSetting.findUnique({where:{key:'ad_management_v2'}});
  if(!row)return defaults;
  const v=JSON.parse(row.value) as Config;
  if(v.version!==2||!Array.isArray(v.units)||!Array.isArray(v.placements)||!Array.isArray(v.countryRules)||!v.providers)throw new Error('Invalid ad configuration');
  const keys=['app_open','home_banner','usage_banner','region_native','rewarded_unlock','connect_interstitial','disconnect_interstitial','free_server_interstitial'];
  return {...v,placements:keys.map(key=>v.placements.find(p=>p.key===key)||{key,enabled:false,unitRef:'',fallbackRef:''})};
}
export function getPublicPlacements(c:Config,countryCode:string){
  const country=/^[A-Z]{2}$/.test(countryCode)?countryCode:'';
  const units=new Map(c.units.map(u=>[u.id,u]));
  const select=(id:string):PublicUnit|null=>{
    const u=units.get(id);
    if(!u||!u.enabled||!c.providers[u.provider]?.enabled||!u.unitId)return null;
    return {provider:u.provider,format:u.format,unitId:u.unitId};
  };
  return c.placements.map(p=>{
    const rule=c.countryRules.find(r=>r.country===country&&r.placement===p.key&&r.enabled);
    const primary=rule?.unitRef?select(rule.unitRef):select(p.unitRef);
    const fallback=select(p.fallbackRef);
    return {key:p.key,enabled:Boolean(c.adsEnabled&&p.enabled&&(primary||fallback)),primary:primary||fallback,fallback:primary?fallback:null};
  });
}
export async function getMobileAds(countryCode:string){
  const c=await readMobileAdConfig();
  return {schemaVersion:2,adsEnabled:c.adsEnabled,placements:getPublicPlacements(c,countryCode),rewardedUnlockEnabled:c.rewardedUnlockEnabled,appOpenCooldownMinutes:c.appOpenCooldownMinutes};
}
