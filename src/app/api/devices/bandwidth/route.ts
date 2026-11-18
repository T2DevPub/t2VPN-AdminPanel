import {NextResponse} from 'next/server';
import {z} from 'zod';
import {getSession} from '@/lib/auth';
import {isAllowedAdminMutationOrigin} from '@/lib/admin-origin';
import {db} from '@/lib/db';
import {
  anonymousDeviceId,billableBytes,DEFAULT_QUOTA_SETTINGS,istDay,
  quotaDecision,quotaDisplayStatus,quotaSettingsSchema,quotaBytes,
  QUOTA_SETTINGS_KEY,readQuotaSettings,validIstDate
} from '@/lib/device-bandwidth';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const noStore={'Cache-Control':'no-store'};
const resetSchema=z.object({
  action:z.literal('resetQuota'),installationRecordId:z.string().cuid(),date:z.string()
}).strict();

export async function GET(req:Request){
  if(!await getSession())return NextResponse.json({error:'Unauthorized'},{status:401,headers:noStore});
  const q=new URL(req.url).searchParams;
  const day=q.get('date')||istDay(),status=q.get('status')||'all';
  if(!validIstDate(day))return NextResponse.json({error:'Date must be YYYY-MM-DD'},{status:400,headers:noStore});
  if(!['all','normal','over_quota','throttled','pending'].includes(status))
    return NextResponse.json({error:'Invalid bandwidth status'},{status:400,headers:noStore});
  const page=Math.max(1,Math.min(10000,Math.floor(Number(q.get('page'))||1))),pageSize=25;
  try{
    const [settings,rows,collector]=await Promise.all([
      readQuotaSettings(),
      db.deviceBandwidthDay.findMany({
        where:{day},orderBy:[{bytesMeasured:'desc'},{installationId:'asc'}],
        take:20001,
        select:{installationId:true,day:true,bytesMeasured:true,quotaBaselineBytes:true,resetAt:true,
          gatewayAppliedMbps:true,gatewayPolicyRevision:true,gatewayReportedAt:true,
          installation:{select:{id:true,deviceModel:true,manufacturer:true,countryCode:true,plan:true}}}
      }),
      db.appSetting.findUnique({where:{key:'vpn_collector_last_seen'},select:{value:true}})
    ]);
    const now=new Date(),sampled=rows.length>20000;
    const mapped=rows.slice(0,20000).map(r=>{
      const decision=quotaDecision(settings,day,r.bytesMeasured,r.quotaBaselineBytes,r.resetAt);
      const displayStatus=day===istDay(now)
        ?quotaDisplayStatus({decision,settings,gatewayAppliedMbps:r.gatewayAppliedMbps,
           gatewayPolicyRevision:r.gatewayPolicyRevision,gatewayReportedAt:r.gatewayReportedAt,now})
        :decision.overQuota?'over_quota':'normal';
      return {
        installationRecordId:r.installation.id,anonymousId:anonymousDeviceId(r.installationId),
        deviceModel:r.installation.deviceModel,manufacturer:r.installation.manufacturer,
        countryCode:r.installation.countryCode,plan:r.installation.plan,date:day,
        measuredBytes:r.bytesMeasured.toString(),
        countedBytes:decision.effective.toString(),
        quotaLimitBytes:quotaBytes(settings).toString(),
        quotaBaselineBytes:r.quotaBaselineBytes.toString(),
        resetAt:r.resetAt?.toISOString()||null,
        overQuota:decision.overQuota,status:displayStatus,
        targetLimitMbps:decision.targetLimitMbps,
        gatewayAppliedMbps:r.gatewayAppliedMbps,
        gatewayReportedAt:r.gatewayReportedAt?.toISOString()||null
      };
    }).filter(r=>status==='all'||r.status===status);
    return NextResponse.json({
      date:day,timezone:'Asia/Kolkata',page,pageSize,total:mapped.length,sampled,
      items:mapped.slice((page-1)*pageSize,page*pageSize),
      policy:settings,trackingSource:'trusted-vpn-gateway-only',
      collectorConfigured:Boolean(process.env.TELEMETRY_INGEST_SECRET&&process.env.TELEMETRY_INGEST_SECRET.length>=32),
      collectorOnline:Boolean(collector?.value&&Date.parse(collector.value)>now.getTime()-120000),
      note:'Only measured gateway byte deltas are counted. Collection begins when trusted VPN gateway telemetry is connected. No historical estimates are generated.'
    },{headers:noStore});
  }catch(e){
    console.error('Device bandwidth reporting failed',e instanceof Error?e.message:'unknown');
    return NextResponse.json({error:'Bandwidth reporting unavailable'},{status:500,headers:noStore});
  }
}
export async function PATCH(req:Request){
  const actor=await getSession();
  if(!actor)return NextResponse.json({error:'Unauthorized'},{status:401,headers:noStore});
  if(!isAllowedAdminMutationOrigin(req))return NextResponse.json({error:'Invalid origin'},{status:403,headers:noStore});
  let input:unknown;
  try{input=await req.json()}catch{return NextResponse.json({error:'Invalid JSON'},{status:400,headers:noStore})}
  const parsed=resetSchema.safeParse(input);
  if(!parsed.success)return NextResponse.json({error:'Invalid reset request'},{status:400,headers:noStore});
  if(parsed.data.date!==istDay())
    return NextResponse.json({error:'Only today’s quota can be reset; historical usage is immutable'},{status:409,headers:noStore});
  try{
    const reset=await db.$transaction(async tx=>{
      const installation=await tx.appInstallation.findUnique({where:{id:parsed.data.installationRecordId},select:{installationId:true}});
      if(!installation)return false;
      const day=parsed.data.date,id=installation.installationId;
      // Lock the row, so gateway byte increments and reset baseline cannot race.
      await tx.$queryRaw`SELECT "installationId" FROM "DeviceBandwidthDay" WHERE "installationId"=${id} AND "day"=${day} FOR UPDATE`;
      const row=await tx.deviceBandwidthDay.findUnique({where:{installationId_day:{installationId:id,day}}});
      if(!row)return false;
      await tx.deviceBandwidthDay.update({
        where:{installationId_day:{installationId:id,day}},
        data:{quotaBaselineBytes:row.bytesMeasured,resetAt:new Date()}
      });
      await tx.auditLog.create({
        data:{actor,action:'device_bandwidth.reset_quota',detail:anonymousDeviceId(id)+' / '+day}
      });
      return true;
    });
    if(!reset)return NextResponse.json({error:'No measured quota record for this device today'},{status:404,headers:noStore});
    return NextResponse.json({ok:true,notice:'Daily quota baseline reset. Historical usage is preserved. VPN gateway must poll the policy to release any active throttle.'},{headers:noStore});
  }catch(e){
    console.error('Device quota reset failed',e instanceof Error?e.message:'unknown');
    return NextResponse.json({error:'Could not reset daily quota'},{status:500,headers:noStore});
  }
}
export async function PUT(req:Request){
  const actor=await getSession();
  if(!actor)return NextResponse.json({error:'Unauthorized'},{status:401,headers:noStore});
  if(!isAllowedAdminMutationOrigin(req))return NextResponse.json({error:'Invalid origin'},{status:403,headers:noStore});
  let input:unknown;try{input=await req.json()}catch{return NextResponse.json({error:'Invalid JSON'},{status:400,headers:noStore})}
  const parsed=quotaSettingsSchema.safeParse(input);
  if(!parsed.success)return NextResponse.json({error:'Invalid policy settings'},{status:400,headers:noStore});
  const settings=parsed.data;
  // Re-enabling enforcement requires an actual VPN gateway policy agent.
  await db.$transaction([
    db.appSetting.upsert({where:{key:QUOTA_SETTINGS_KEY},
      create:{key:QUOTA_SETTINGS_KEY,value:JSON.stringify(settings)},
      update:{value:JSON.stringify(settings)}}),
    db.auditLog.create({data:{actor,action:'device_bandwidth.update_policy',
      detail:JSON.stringify({enforcementEnabled:settings.enforcementEnabled,
        dailyLimitGiB:settings.dailyLimitGiB,throttleMbps:settings.throttleMbps})}})
  ]);
  return NextResponse.json({ok:true,policy:settings},{headers:noStore});
}
