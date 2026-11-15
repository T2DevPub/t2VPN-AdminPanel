import {NextResponse} from 'next/server';
import {db} from '@/lib/db';import {getSession} from '@/lib/auth';import {encrypt} from '@/lib/profile-crypto';import {z} from 'zod';
export const runtime='nodejs';
const input=z.object({name:z.string().min(2).max(80),country:z.string().min(2).max(80),countryCode:z.string().regex(/^[A-Z]{2}$/),city:z.string().min(1).max(80),host:z.string().min(3).max(255),deployedOn:z.string().max(100).optional(),visibility:z.enum(['BOTH','FREE','PLUS']),enabled:z.boolean(),freeProfile:z.number().int().min(1).max(2),plusProfile:z.number().int().min(1).max(2)});
function sameOrigin(req:Request){
  const origin=req.headers.get('origin');
  if(!origin)return true;
  try{
    const source=new URL(origin);
    if(!['http:','https:'].includes(source.protocol))return false;
    const forwardedHost=req.headers.get('x-forwarded-host')?.split(',')[0]?.trim();
    const host=req.headers.get('host');
    const allowedHosts=[forwardedHost,host,new URL(req.url).host].filter(Boolean);
    return allowedHosts.includes(source.host);
  }catch{return false}
}
export async function GET(){if(!await getSession())return NextResponse.json({error:'Unauthorized'},{status:401});const servers=await db.vpnServer.findMany({orderBy:{createdAt:'desc'},include:{profiles:{select:{slot:true,protocol:true,port:true,fileName:true}}}});return NextResponse.json(servers)}
export async function POST(req:Request){const actor=await getSession();if(!actor)return NextResponse.json({error:'Unauthorized'},{status:401});if(!sameOrigin(req))return NextResponse.json({error:'Invalid origin'},{status:403});try{
const form=await req.formData();const raw=form.get('metadata');if(typeof raw!=='string')return NextResponse.json({error:'Missing metadata'},{status:400});const parsed=input.safeParse(JSON.parse(raw));if(!parsed.success)return NextResponse.json({error:'Invalid server details'},{status:400});
const profiles:Array<{slot:number;protocol:string;port:number;usernameEncrypted:string;passwordEncrypted:string;ovpnEncrypted:string;fileName:string}>=[];for(const slot of [1,2]){const file=form.get('file'+slot);const username=form.get('username'+slot);const password=form.get('password'+slot);const protocol=form.get('protocol'+slot);const port=Number(form.get('port'+slot));const present=file instanceof File&&file.size>0;
if(!present){if(username||password)return NextResponse.json({error:'Profile '+slot+' needs an .ovpn file'},{status:400});continue}
if(!file.name.toLowerCase().endsWith('.ovpn')||file.size>1024*1024)return NextResponse.json({error:'Profile '+slot+' must be an .ovpn file under 1 MB'},{status:400});
if(typeof username!=='string'||!username||username.length>200||typeof password!=='string'||!password||password.length>500||!['UDP','TCP'].includes(String(protocol))||!Number.isInteger(port)||port<1||port>65535)return NextResponse.json({error:'Invalid profile '+slot},{status:400});
const ovpn=await file.text();if(ovpn.includes('\0')||!/^\s*(?:#|client|dev|proto|remote|\s)/m.test(ovpn))return NextResponse.json({error:'Invalid OpenVPN file '+slot},{status:400});
profiles.push({slot,protocol:String(protocol),port,usernameEncrypted:encrypt(username),passwordEncrypted:encrypt(password),ovpnEncrypted:encrypt(ovpn),fileName:file.name.slice(0,255)})}
if(!profiles.length)return NextResponse.json({error:'Upload at least one .ovpn file'},{status:400});
const available=profiles.map(p=>p.slot);if(!available.includes(parsed.data.freeProfile)||!available.includes(parsed.data.plusProfile))return NextResponse.json({error:'Assigned configuration has no uploaded file'},{status:400});
const d=parsed.data;const server=await db.$transaction(async tx=>{const s=await tx.vpnServer.create({data:{name:d.name,country:d.country,countryCode:d.countryCode,city:d.city,host:d.host,deployedOn:d.deployedOn||"",visibility:d.visibility,freeProfile:d.freeProfile,plusProfile:d.plusProfile,enabled:d.enabled,profiles:{create:profiles}}});await tx.auditLog.create({data:{actor,action:'server.create',detail:s.id}});return s});
return NextResponse.json({id:server.id,ok:true},{status:201})
}catch(e){console.error('Server creation failed',e instanceof Error?e.message:'unknown');return NextResponse.json({error:'Unable to save server; verify settings and encryption key'},{status:400})}}
