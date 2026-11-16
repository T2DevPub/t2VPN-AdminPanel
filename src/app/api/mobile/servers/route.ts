import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
export const runtime='nodejs';export const dynamic='force-dynamic';
// This endpoint is deliberately metadata-only. Never expose .ovpn files, passwords,
// server provisioning tokens or encrypted profile values to anonymous clients.
export async function GET(){
  try{
    const servers=await db.vpnServer.findMany({where:{enabled:true},orderBy:[{country:'asc'},{city:'asc'}],select:{
      id:true,name:true,country:true,countryCode:true,city:true,host:true,tier:true,freeProfile:true,plusProfile:true,
      profiles:{select:{slot:true,protocol:true,port:true}}
    }});
    return NextResponse.json({schemaVersion:2,servers:servers.map(s=>({
      id:s.id,name:s.name,country:s.country,countryCode:s.countryCode,city:s.city,host:s.host,ipAddress:s.host,
      isPlusOnly:s.tier==='PLUS',tier:s.tier,
      freeProfile:s.freeProfile,plusProfile:s.plusProfile,
      profiles:s.profiles.sort((a,b)=>a.slot-b.slot),
      // Legacy metadata: no credentials or inline OpenVPN configuration.
      protocol:s.profiles.find(p=>p.slot===1)?.protocol||null,
      port:s.profiles.find(p=>p.slot===1)?.port||null
    }))},{headers:{'Cache-Control':'public, max-age=30, s-maxage=30'}});
  }catch{return NextResponse.json({error:'Server directory unavailable'},{status:503})}
}
