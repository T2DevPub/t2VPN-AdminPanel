import {NextResponse} from 'next/server';
import {z} from 'zod';
import {db} from '@/lib/db';
import {decrypt} from '@/lib/profile-crypto';
import {entitlement,jsonBody,mobileNoStore,mobileRateLimit,requireMobile} from '@/lib/mobile-auth';
export const runtime='nodejs';
const input=z.object({serverId:z.string().cuid()});
export async function POST(req:Request){
 const installation=await requireMobile(req);
 if(!installation)return NextResponse.json({error:'Unauthorized'},{status:401,headers:mobileNoStore});
 if(process.env.MOBILE_PROVISIONING_ENABLED!=='true')
  return NextResponse.json({error:'VPN provisioning not enabled by server administrator'},{status:503,headers:mobileNoStore});
 try{
  const data=input.safeParse(await jsonBody(req));
  if(!data.success)return NextResponse.json({error:'Invalid server ID'},{status:400,headers:mobileNoStore});
  if(!await mobileRateLimit('mobile-profile',installation.installationId,30,10))
   return NextResponse.json({error:'Profile request rate limited'},{status:429,headers:mobileNoStore});
  const server=await db.vpnServer.findUnique({where:{id:data.data.serverId},include:{profiles:true}});
  if(!server||!server.enabled)return NextResponse.json({error:'Server unavailable'},{status:404,headers:mobileNoStore});
  const rights=entitlement(installation);
  if(server.tier==='PLUS'&&!rights.plus&&!rights.reward)return NextResponse.json({error:'Plus subscription or verified reward required'},{status:403,headers:mobileNoStore});
  // Plus server always Config 1. On a Free server, paid Plus uses Config 1,
  // free and rewarded-only installations use Config 2 when available.
  const slot=server.tier==='PLUS'||rights.plus?1:server.profiles.some(p=>p.slot===2)?2:1;
  const profile=server.profiles.find(p=>p.slot===slot);
  if(!profile)return NextResponse.json({error:'VPN profile not configured'},{status:503,headers:mobileNoStore});
  return NextResponse.json({schemaVersion:2,serverId:server.id,countryCode:server.countryCode,
   slot:profile.slot,protocol:profile.protocol,port:profile.port,
   host:server.host,
   ovpnConfig:decrypt(profile.ovpnEncrypted),
   username:decrypt(profile.usernameEncrypted),
   password:decrypt(profile.passwordEncrypted),
   issuedAt:new Date().toISOString(),cacheSeconds:0,
   // Delivery does not create an active VPN session. Server-side accounting does.
   telemetryMode:'trusted-gateway-only'
  },{headers:mobileNoStore});
 }catch(e){
  console.error('Mobile profile provisioning failed',e instanceof Error?e.message:'unknown');
  return NextResponse.json({error:'Profile temporarily unavailable'},{status:503,headers:mobileNoStore});
 }
}
