import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {countryFlag,countryName,serverLocation} from '@/lib/country';
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
   id:s.id,
   // 'name' is the public country label for existing Android list models.
   // Preserve the admin's custom display label separately for backward-compatible detail screens.
   name:countryName(s.countryCode,s.country),displayName:s.name,
   country:countryName(s.countryCode,s.country),countryName:countryName(s.countryCode,s.country),
   countryCode:s.countryCode,countryFlag:countryFlag(s.countryCode),city:s.city,
   locationLabel:serverLocation(s.country,s.city,s.countryCode),
   host:s.host,ipAddress:s.host,enabled:s.enabled,tier:s.tier,isPlusOnly:s.tier==='PLUS',
   profiles:s.profiles,requiresAuthorization:s.tier==='PLUS'
  }))},{headers:{'Cache-Control':'public, max-age=30, s-maxage=30','X-Content-Type-Options':'nosniff'}});
 }catch{return NextResponse.json({error:'Server directory unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
