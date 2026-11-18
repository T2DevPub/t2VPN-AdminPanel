import {createHash,createHmac} from 'node:crypto';
import {z} from 'zod';
import {db} from '@/lib/db';
import {IST_OFFSET_MS} from '@/lib/time-period';

export const quotaSettingsSchema=z.object({
  enforcementEnabled:z.boolean(),
  dailyLimitGiB:z.number().int().min(1).max(1024),
  throttleMbps:z.number().int().min(1).max(1000)
}).strict();
export type QuotaSettings=z.infer<typeof quotaSettingsSchema>;
export const DEFAULT_QUOTA_SETTINGS:QuotaSettings={
  enforcementEnabled:false,dailyLimitGiB:2,throttleMbps:3
};
export const QUOTA_SETTINGS_KEY='device_bandwidth_policy_v2';
export function istDay(now:Date=new Date()):string{
  return new Date(now.getTime()+IST_OFFSET_MS).toISOString().slice(0,10);
}
export function validIstDate(value:string):boolean{
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
  const date=new Date(value+'T00:00:00+05:30');
  return !Number.isNaN(date.getTime())&&istDay(date)===value;
}
export function quotaBytes(settings:QuotaSettings):bigint{
  return BigInt(settings.dailyLimitGiB)*1024n*1024n*1024n;
}
export function billableBytes(measured:bigint,baseline:bigint):bigint{
  return measured>baseline?measured-baseline:0n;
}
export function quotaRevision(args:{
  day:string;settings:QuotaSettings;resetAt:Date|null;overQuota:boolean
}):string{
 const raw=[args.day,args.settings.enforcementEnabled,args.settings.dailyLimitGiB,
   args.settings.throttleMbps,args.overQuota,args.resetAt?.toISOString()||''].join('|');
 return createHash('sha256').update(raw).digest('hex').slice(0,32);
}
export function quotaDecision(
 settings:QuotaSettings,day:string,measured:bigint,baseline:bigint,resetAt:Date|null
){
 const effective=billableBytes(measured,baseline);
 const overQuota=effective>=quotaBytes(settings);
 const targetLimitMbps=settings.enforcementEnabled&&overQuota?settings.throttleMbps:null;
 const policyRevision=quotaRevision({day,settings,resetAt,overQuota});
 return {effective,overQuota,targetLimitMbps,policyRevision};
}
export function quotaDisplayStatus(args:{
  decision:ReturnType<typeof quotaDecision>;
  settings:QuotaSettings;
  gatewayAppliedMbps:number|null;
  gatewayPolicyRevision:string|null;
  gatewayReportedAt:Date|null;
  now?:Date;
}):'normal'|'over_quota'|'pending'|'throttled'{
 const {decision,settings,gatewayAppliedMbps,gatewayPolicyRevision,gatewayReportedAt}=args;
 const fresh=Boolean(gatewayReportedAt&&((args.now||new Date()).getTime()-gatewayReportedAt.getTime())<=120000);
 const acknowledged=fresh&&gatewayPolicyRevision===decision.policyRevision&&gatewayAppliedMbps===decision.targetLimitMbps;
 if(decision.targetLimitMbps!==null)return acknowledged?'throttled':'pending';
 if(settings.enforcementEnabled&&!acknowledged&&gatewayAppliedMbps!==null)return 'pending';
 return decision.overQuota?'over_quota':'normal';
}
export function anonymousDeviceId(id:string):string{
 const secret=process.env.AUTH_SECRET;
 if(!secret||secret.length<32)throw new Error('AUTH_SECRET is not configured');
 return createHmac('sha256',secret).update(id).digest('hex').slice(0,16);
}
export async function readQuotaSettings():Promise<QuotaSettings>{
 const row=await db.appSetting.findUnique({where:{key:QUOTA_SETTINGS_KEY},select:{value:true}});
 if(!row)return DEFAULT_QUOTA_SETTINGS;
 return quotaSettingsSchema.parse(JSON.parse(row.value));
}
