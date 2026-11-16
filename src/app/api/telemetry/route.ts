import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
export const runtime='nodejs';
const schema=z.object({
 installationId:z.string().uuid(),deviceModel:z.string().max(100).optional(),manufacturer:z.string().max(80).optional(),
 androidVersion:z.string().max(40).optional(),appVersion:z.string().max(40).optional(),
 countryCode:z.string().regex(/^[A-Z]{2}$/).optional(),
 event:z.enum(['INSTALL','OPEN','CONNECT','HEARTBEAT','DISCONNECT','CONNECTION_FAILED','REWARDED_UNLOCK']).optional(),
 serverId:z.string().max(100).optional(),sessionId:z.string().cuid().optional(),
 // Server-side measured cumulative byte counters; NOT client assertions.
 bytesIn:z.number().int().nonnegative().safe().optional(),bytesOut:z.number().int().nonnegative().safe().optional()
});
export async function POST(req:Request){
 const secret=process.env.TELEMETRY_INGEST_SECRET;
 if(!secret||secret.length<32)return NextResponse.json({error:'Collector not configured'},{status:503});
 const supplied=req.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 const a=Buffer.from(secret),b=Buffer.from(supplied);
 if(a.length!==b.length||!timingSafeEqual(a,b))return NextResponse.json({error:'Unauthorized'},{status:401});
 const size=Number(req.headers.get('content-length')||0);
 if(size>8192)return NextResponse.json({error:'Payload too large'},{status:413});
 let parsed;
 try{const raw=await req.text();if(Buffer.byteLength(raw)>8192)throw Error('Size');parsed=schema.safeParse(JSON.parse(raw))}
 catch{return NextResponse.json({error:'Invalid JSON'},{status:400})}
 if(!parsed.success)return NextResponse.json({error:'Invalid telemetry'},{status:400});
 const d=parsed.data;
 if(d.event==='CONNECT'&&!d.serverId)return NextResponse.json({error:'Server required'},{status:400});
 if((d.event==='HEARTBEAT'||d.event==='DISCONNECT')&&!d.sessionId)return NextResponse.json({error:'Session ID required'},{status:400});
 try{
  let sessionId:string|undefined;
  await db.$transaction(async tx=>{
   await tx.appInstallation.upsert({where:{installationId:d.installationId},
    create:{installationId:d.installationId,deviceModel:d.deviceModel||'',manufacturer:d.manufacturer||'',androidVersion:d.androidVersion||'',appVersion:d.appVersion||'',countryCode:d.countryCode||''},
    update:{lastSeenAt:new Date(),...(d.deviceModel?{deviceModel:d.deviceModel}:{}),...(d.manufacturer?{manufacturer:d.manufacturer}:{}),...(d.androidVersion?{androidVersion:d.androidVersion}:{}),...(d.appVersion?{appVersion:d.appVersion}:{}),...(d.countryCode?{countryCode:d.countryCode}:{})}});
   const recordedAt=new Date().toISOString();
   await tx.appSetting.upsert({where:{key:'vpn_collector_last_seen'},create:{key:'vpn_collector_last_seen',value:recordedAt},update:{value:recordedAt}});
   if(d.event&&d.event!=='HEARTBEAT')await tx.installationEvent.create({data:{installationId:d.installationId,kind:d.event,countryCode:d.countryCode||''}});
   if(d.event==='CONNECT'&&d.serverId){
    const server=await tx.vpnServer.findUnique({where:{id:d.serverId}});
    if(!server)throw new Error('Server not found');
    const s=await tx.vpnUsageSession.create({data:{installationId:d.installationId,serverId:d.serverId,lastHeartbeatAt:new Date()}});
    sessionId=s.id;
   }
   if((d.event==='HEARTBEAT'||d.event==='DISCONNECT')&&d.sessionId){
    const current=await tx.vpnUsageSession.findFirst({where:{id:d.sessionId,installationId:d.installationId,disconnectedAt:null},select:{id:true,bytesIn:true,bytesOut:true}});
    if(!current)throw new Error('Unknown or closed session');
    const bytesIn=d.bytesIn===undefined?current.bytesIn:BigInt(d.bytesIn);
    const bytesOut=d.bytesOut===undefined?current.bytesOut:BigInt(d.bytesOut);
    await tx.vpnUsageSession.update({where:{id:current.id},data:{lastHeartbeatAt:new Date(),
     bytesIn:bytesIn>current.bytesIn?bytesIn:current.bytesIn,
     bytesOut:bytesOut>current.bytesOut?bytesOut:current.bytesOut,
     ...(d.event==='DISCONNECT'?{disconnectedAt:new Date()}:{})}});
   }
   if(d.event==='CONNECTION_FAILED'&&d.serverId){
    const server=await tx.vpnServer.findUnique({where:{id:d.serverId}});
    if(!server)throw new Error('Server not found');
    await tx.vpnUsageSession.create({data:{installationId:d.installationId,serverId:d.serverId,lastHeartbeatAt:new Date(),disconnectedAt:new Date(),outcome:'FAILED'}});
   }
  });
  return NextResponse.json({ok:true,...(sessionId?{sessionId}:{})},{status:202,headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('Trusted telemetry failed',e instanceof Error?e.message:'unknown');return NextResponse.json({error:'Invalid session update'},{status:400})}
}
