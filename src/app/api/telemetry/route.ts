import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
export const runtime='nodejs';
const schema=z.object({installationId:z.string().uuid(),deviceModel:z.string().max(100).optional(),manufacturer:z.string().max(80).optional(),androidVersion:z.string().max(40).optional(),appVersion:z.string().max(40).optional(),countryCode:z.string().regex(/^[A-Z]{2}$/).optional(),event:z.enum(['INSTALL','OPEN','CONNECT','DISCONNECT','CONNECTION_FAILED','REWARDED_UNLOCK']).optional(),serverId:z.string().max(100).optional(),sessionId:z.string().cuid().optional(),bytesIn:z.number().int().nonnegative().safe().optional(),bytesOut:z.number().int().nonnegative().safe().optional()});
export async function POST(req:Request){
 const secret=process.env.TELEMETRY_INGEST_SECRET;
 if(!secret||secret.length<32)return NextResponse.json({error:'Collector not configured'},{status:503});
 const supplied=req.headers.get('authorization')?.replace(/^Bearer /,'')||'';
 const a=Buffer.from(secret),b=Buffer.from(supplied);
 if(a.length!==b.length||!timingSafeEqual(a,b))return NextResponse.json({error:'Unauthorized'},{status:401});
 const size=Number(req.headers.get('content-length')||0);if(size>8192)return NextResponse.json({error:'Payload too large'},{status:413});
 let parsed;try{parsed=schema.safeParse(await req.json())}catch{return NextResponse.json({error:'Invalid JSON'},{status:400})}
 if(!parsed.success)return NextResponse.json({error:'Invalid telemetry'},{status:400});
 const d=parsed.data;
 try{
 await db.$transaction(async tx=>{
 await tx.appInstallation.upsert({where:{installationId:d.installationId},create:{installationId:d.installationId,deviceModel:d.deviceModel||'',manufacturer:d.manufacturer||'',androidVersion:d.androidVersion||'',appVersion:d.appVersion||'',countryCode:d.countryCode||''},update:{lastSeenAt:new Date(),...(d.deviceModel?{deviceModel:d.deviceModel}:{}),...(d.manufacturer?{manufacturer:d.manufacturer}:{}),...(d.androidVersion?{androidVersion:d.androidVersion}:{}),...(d.appVersion?{appVersion:d.appVersion}:{}),...(d.countryCode?{countryCode:d.countryCode}:{})}});
 if(d.event)await tx.installationEvent.create({data:{installationId:d.installationId,kind:d.event,countryCode:d.countryCode||''}});
 if(d.event==='CONNECT'&&d.serverId)await tx.vpnUsageSession.create({data:{installationId:d.installationId,serverId:d.serverId}});
 if(d.event==='DISCONNECT'&&d.sessionId)await tx.vpnUsageSession.updateMany({where:{id:d.sessionId,installationId:d.installationId,disconnectedAt:null},data:{disconnectedAt:new Date(),bytesIn:BigInt(d.bytesIn||0),bytesOut:BigInt(d.bytesOut||0)}});
 });
 return NextResponse.json({ok:true},{status:202});
 }catch{return NextResponse.json({error:'Unable to process telemetry'},{status:400})}
}
