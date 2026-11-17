import {NextResponse} from 'next/server';
import {z} from 'zod';
import {db} from '@/lib/db';
import {jsonBody,mobileNoStore,mobileRateLimit,requireMobile} from '@/lib/mobile-auth';
export const runtime='nodejs';
const schema=z.object({event:z.enum(['INSTALL','OPEN','CONNECTION_ATTEMPT','CONNECTION_FAILED','APP_HEARTBEAT']),
 deviceModel:z.string().max(100).optional(),manufacturer:z.string().max(80).optional(),
 androidVersion:z.string().max(40).optional(),appVersion:z.string().max(40).optional(),
 countryCode:z.string().regex(/^[A-Z]{2}$/).optional()});
function detectRateAction(event:string){return event==='APP_HEARTBEAT'?'mobile-presence':'mobile-event'}
export async function POST(req:Request){
 const installation=await requireMobile(req);
 if(!installation)return NextResponse.json({error:'Unauthorized'},{status:401,headers:mobileNoStore});
 try{
  const parsed=schema.safeParse(await jsonBody(req));
  if(!parsed.success)return NextResponse.json({error:'Invalid event'},{status:400,headers:mobileNoStore});
  if(!await mobileRateLimit(detectRateAction(parsed.data.event),installation.installationId,parsed.data.event==='APP_HEARTBEAT'?180:100,60))
   return NextResponse.json({error:'Event rate limit'},{status:429,headers:mobileNoStore});
  const d=parsed.data;
  const update=db.appInstallation.update({where:{installationId:installation.installationId},data:{lastSeenAt:new Date(),
    ...(d.deviceModel?{deviceModel:d.deviceModel}:{}),...(d.manufacturer?{manufacturer:d.manufacturer}:{}),
    ...(d.androidVersion?{androidVersion:d.androidVersion}:{}),...(d.appVersion?{appVersion:d.appVersion}:{}),
    ...(d.countryCode?{countryCode:d.countryCode}:{})}});
  // Presence heartbeats update only lastSeenAt; they do NOT imply a VPN tunnel.
  if(d.event==='APP_HEARTBEAT')await update;
  else await db.$transaction([update,db.installationEvent.create({data:{installationId:installation.installationId,kind:d.event,countryCode:d.countryCode||''}})]);
  return NextResponse.json({ok:true},{status:202,headers:mobileNoStore});
 }catch{return NextResponse.json({error:'Event reporting unavailable'},{status:503,headers:mobileNoStore})}
}
