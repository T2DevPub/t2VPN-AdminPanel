import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {getSession} from '@/lib/auth';
import {encrypt} from '@/lib/profile-crypto';
export const runtime='nodejs';

function sameOrigin(req:Request){
 const origin=req.headers.get('origin');if(!origin)return true;
 try{const source=new URL(origin);return ['http:','https:'].includes(source.protocol)&&[req.headers.get('host'),req.headers.get('x-forwarded-host')?.split(',')[0]?.trim(),new URL(req.url).host].includes(source.host)}catch{return false}
}
// Replaces one encrypted OpenVPN slot without exposing existing credentials to the browser.
export async function PUT(req:Request,{params}:{params:Promise<{id:string}>}){
 const actor=await getSession();if(!actor)return NextResponse.json({error:'Unauthorized'},{status:401});
 if(!sameOrigin(req))return NextResponse.json({error:'Invalid origin'},{status:403});
 const {id}=await params;
 try{
  const server=await db.vpnServer.findUnique({where:{id},select:{id:true}});
  if(!server)return NextResponse.json({error:'Server not found'},{status:404});
  const form=await req.formData();
  const slot=Number(form.get('slot')),port=Number(form.get('port')),protocol=form.get('protocol');
  const username=form.get('username'),password=form.get('password'),file=form.get('file');
  if(![1,2].includes(slot)||!Number.isInteger(port)||port<1||port>65535||!['UDP','TCP'].includes(String(protocol)))return NextResponse.json({error:'Invalid profile slot or connection settings'},{status:400});
  if(typeof username!=='string'||username.length<1||username.length>200||typeof password!=='string'||password.length<1||password.length>500)return NextResponse.json({error:'Username and password required for this profile'},{status:400});
  if(!(file instanceof File)||file.size<1||file.size>1024*1024||!file.name.toLowerCase().endsWith('.ovpn'))return NextResponse.json({error:'Upload a valid .ovpn profile under 1 MB'},{status:400});
  const ovpn=await file.text();
  if(ovpn.includes('\0')||!/^\s*(?:#|client|dev|proto|remote|\s)/m.test(ovpn))return NextResponse.json({error:'Invalid OpenVPN configuration'},{status:400});
  const data={protocol:String(protocol),port,usernameEncrypted:encrypt(username),passwordEncrypted:encrypt(password),ovpnEncrypted:encrypt(ovpn),fileName:file.name.slice(0,255)};
  await db.$transaction(async tx=>{
   await tx.vpnProfile.upsert({where:{serverId_slot:{serverId:id,slot}},create:{serverId:id,slot,...data},update:data});
   // Free locations use Config 2 for free users when it exists.
   const slots=await tx.vpnProfile.findMany({where:{serverId:id},select:{slot:true}});
   const tier=await tx.vpnServer.findUnique({where:{id},select:{tier:true}});
   await tx.vpnServer.update({where:{id},data:{freeProfile:tier?.tier==='FREE'&&slots.some(p=>p.slot===2)?2:1,plusProfile:1}});
   await tx.auditLog.create({data:{actor,action:'server.profile.replace',detail:id+':slot:'+slot}});
  });
  return NextResponse.json({ok:true,slot});
 }catch(e){
  console.error('Unable to replace VPN profile',e instanceof Error?e.message:'unknown');
  return NextResponse.json({error:'Profile replacement failed; check encryption settings'},{status:400});
 }
}
