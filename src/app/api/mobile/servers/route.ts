import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
// Public discovery is metadata only. Do NOT leak OpenVPN credentials, private keys, or configs.
export async function GET(){
 try{
  const servers=await db.vpnServer.findMany({
   where:{enabled:true},
   orderBy:[{country:'asc'},{city:'asc'}],
   select:{id:true,name:true,country:true,countryCode:true,city:true,host:true,tier:true,enabled:true,
    profiles:{select:{slot:true,protocol:true,port:true},orderBy:{slot:'asc'}}}
  });
  return NextResponse.json({schemaVersion:2,servers:servers.map(s=>({
   id:s.id,name:s.name,country:s.country,countryCode:s.countryCode,city:s.city,
   host:s.host,ipAddress:s.host,enabled:s.enabled,tier:s.tier,isPlusOnly:s.tier==='PLUS',
   profiles:s.profiles,requiresAuthorization:s.tier==='PLUS'
  }))},{headers:{'Cache-Control':'public, max-age=30, s-maxage=30','X-Content-Type-Options':'nosniff'}});
 }catch{return NextResponse.json({error:'Server directory unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
