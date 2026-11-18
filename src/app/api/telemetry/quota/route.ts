import {NextResponse} from 'next/server';
import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {db} from '@/lib/db';
import {istDay,quotaDecision,quotaBytes,readQuotaSettings} from '@/lib/device-bandwidth';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const noStore={'Cache-Control':'no-store'};
const ackSchema=z.object({
  installationId:z.string().uuid(),
  policyRevision:z.string().regex(/^[a-f0-9]{32}$/),
  appliedLimitMbps:z.number().int().min(1).max(1000).nullable()
}).strict();

function isTrustedGateway(req:Request){
  const secret=process.env.TELEMETRY_INGEST_SECRET;
  if(!secret||secret.length<32)return false;
  const supplied=req.headers.get('authorization')?.replace(/^Bearer /,'')||'';
  const a=Buffer.from(secret),b=Buffer.from(supplied);
  return a.length===b.length&&timingSafeEqual(a,b);
}
export async function GET(req:Request){
  if(!process.env.TELEMETRY_INGEST_SECRET||process.env.TELEMETRY_INGEST_SECRET.length<32)
    return NextResponse.json({error:'Collector not configured'},{status:503,headers:noStore});
  if(!isTrustedGateway(req))return NextResponse.json({error:'Unauthorized'},{status:401,headers:noStore});
  const id=new URL(req.url).searchParams.get('installationId')||'';
  if(!z.string().uuid().safeParse(id).success)
    return NextResponse.json({error:'Invalid installation ID'},{status:400,headers:noStore});
  const day=istDay();
  const [installation,row,settings]=await Promise.all([
    db.appInstallation.findUnique({where:{installationId:id},select:{installationId:true}}),
    db.deviceBandwidthDay.findUnique({where:{installationId_day:{installationId:id,day}}}),
    readQuotaSettings()
  ]);
  if(!installation)return NextResponse.json({error:'Unknown installation'},{status:404,headers:noStore});
  const decision=quotaDecision(settings,day,row?.bytesMeasured||0n,row?.quotaBaselineBytes||0n,row?.resetAt||null);
  return NextResponse.json({
    schemaVersion:1,installationId:id,date:day,timezone:'Asia/Kolkata',
    enforcementEnabled:settings.enforcementEnabled,
    dailyLimitBytes:quotaBytes(settings).toString(),accountedBytes:decision.effective.toString(),
    overQuota:decision.overQuota,targetLimitMbps:decision.targetLimitMbps,
    action:decision.targetLimitMbps===null?'UNTHROTTLE':'THROTTLE',
    policyRevision:decision.policyRevision,
    note:'This is the desired policy only. Gateway must apply shaping and POST an acknowledgement.'
  },{headers:noStore});
}
export async function POST(req:Request){
  if(!process.env.TELEMETRY_INGEST_SECRET||process.env.TELEMETRY_INGEST_SECRET.length<32)
    return NextResponse.json({error:'Collector not configured'},{status:503,headers:noStore});
  if(!isTrustedGateway(req))return NextResponse.json({error:'Unauthorized'},{status:401,headers:noStore});
  const raw=await req.text();
  if(Buffer.byteLength(raw)>4096)return NextResponse.json({error:'Payload too large'},{status:413,headers:noStore});
  let input:unknown;try{input=JSON.parse(raw)}catch{return NextResponse.json({error:'Invalid JSON'},{status:400,headers:noStore})}
  const parsed=ackSchema.safeParse(input);
  if(!parsed.success)return NextResponse.json({error:'Invalid acknowledgement'},{status:400,headers:noStore});
  const {installationId,policyRevision,appliedLimitMbps}=parsed.data;
  const day=istDay();
  try{
    const result=await db.$transaction(async tx=>{
      const installation=await tx.appInstallation.findUnique({where:{installationId},select:{installationId:true}});
      if(!installation)return 'unknown';
      const row=await tx.deviceBandwidthDay.findUnique({where:{installationId_day:{installationId,day}}});
      const settings=await tx.appSetting.findUnique({where:{key:'device_bandwidth_policy_v2'},select:{value:true}});
      const currentPolicy=settings?JSON.parse(settings.value):{enforcementEnabled:false,dailyLimitGiB:2,throttleMbps:3};
      const policy=(await import('@/lib/device-bandwidth')).quotaSettingsSchema.parse(currentPolicy);
      const expected=quotaDecision(policy,day,row?.bytesMeasured||0n,row?.quotaBaselineBytes||0n,row?.resetAt||null);
      if(expected.policyRevision!==policyRevision||expected.targetLimitMbps!==appliedLimitMbps)return 'stale';
      // Only a trusted gateway agent calls this after actually applying the
      // requested network shaping. Android cannot report applied limits.
      await tx.deviceBandwidthDay.upsert({
        where:{installationId_day:{installationId,day}},
        create:{installationId,day,gatewayAppliedMbps:appliedLimitMbps,
          gatewayPolicyRevision:policyRevision,gatewayReportedAt:new Date()},
        update:{gatewayAppliedMbps:appliedLimitMbps,
          gatewayPolicyRevision:policyRevision,gatewayReportedAt:new Date()}
      });
      return 'ok';
    });
    if(result==='unknown')return NextResponse.json({error:'Unknown installation'},{status:404,headers:noStore});
    if(result==='stale')return NextResponse.json({error:'Policy changed; fetch latest policy before applying'},{status:409,headers:noStore});
    return NextResponse.json({ok:true},{status:202,headers:noStore});
  }catch(e){
    console.error('Gateway quota acknowledgement failed',e instanceof Error?e.message:'unknown');
    return NextResponse.json({error:'Unable to record enforcement status'},{status:500,headers:noStore});
  }
}
