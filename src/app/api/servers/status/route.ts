import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {getSession} from '@/lib/auth';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

export const runtime='nodejs';
export const dynamic='force-dynamic';
const execFileAsync=promisify(execFile);

// Checks ICMP reachability from the Coolify application container.
// Some providers block ICMP, so an unsuccessful ping is not proof that OpenVPN is down.
async function check(host:string){
  if(!/^[a-zA-Z0-9][a-zA-Z0-9.:-]{0,253}$/.test(host))return 'unknown';
  try{
    await execFileAsync('ping',['-c','1','-W','2',host],{timeout:3500,windowsHide:true});
    return 'online';
  }catch(error){
    const e=error as NodeJS.ErrnoException & {killed?:boolean};
    if(e.code==='ENOENT'||e.killed)return 'unknown';
    return 'unreachable';
  }
}
export async function GET(){
  if(!await getSession())return NextResponse.json({error:'Unauthorized'},{status:401});
  const servers=await db.vpnServer.findMany({select:{id:true,host:true}});
  const results:Record<string,string>={};
  for(let i=0;i<servers.length;i+=8){
    const batch=servers.slice(i,i+8);
    await Promise.all(batch.map(async s=>{results[s.id]=await check(s.host)}));
  }
  return NextResponse.json({statuses:results,checkedAt:new Date().toISOString(),method:'icmp'},{headers:{'Cache-Control':'no-store'}});
}
