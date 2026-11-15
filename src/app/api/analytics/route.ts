import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {getSession} from '@/lib/auth';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const ranges:Record<string,number>={today:1,yesterday:1,'7d':7,'30d':30,'90d':90};
export async function GET(req:Request){
 if(!await getSession())return NextResponse.json({error:'Unauthorized'},{status:401});
 const url=new URL(req.url),period=url.searchParams.get('period')||'7d';
 const now=new Date(),start=new Date(now),end=new Date(now);
 if(period==='today'){start.setHours(0,0,0,0)}
 else if(period==='yesterday'){start.setDate(start.getDate()-1);start.setHours(0,0,0,0);end.setHours(0,0,0,0)}
 else if(period==='lifetime'){start.setTime(0)}
 else {start.setDate(start.getDate()-(ranges[period]||7));}
 const where={connectedAt:{gte:start,lt:end}};
 try{
 const [servers,sessions,installations,events,totalInstallations]=await Promise.all([
  db.vpnServer.findMany({select:{id:true,name:true,country:true,countryCode:true,city:true,tier:true,deployedOn:true,enabled:true},orderBy:{name:'asc'}}),
  db.vpnUsageSession.findMany({where,select:{serverId:true,connectedAt:true,disconnectedAt:true,bytesIn:true,bytesOut:true,outcome:true},orderBy:{connectedAt:'asc'},take:50000}),
  db.appInstallation.findMany({where:{lastSeenAt:{gte:start,lt:end}},select:{countryCode:true,appVersion:true,androidVersion:true,plan:true},take:50000}),
  db.installationEvent.groupBy({by:['kind'],where:{createdAt:{gte:start,lt:end}},_count:{_all:true}}),
  db.appInstallation.count()
 ]);
 const perServer=new Map(servers.map(s=>[s.id,{...s,sessions:0,active:0,bytesIn:0,bytesOut:0,failed:0}]));
 const daily=new Map<string,{date:string,sessions:number,bytesIn:number,bytesOut:number}>();
 let totalIn=0,totalOut=0,active=0,failed=0;
 for(const s of sessions){
  const inbound=Number(s.bytesIn),outbound=Number(s.bytesOut);
  totalIn+=inbound;totalOut+=outbound;
  if(!s.disconnectedAt)active++;
  if(s.outcome==='FAILED')failed++;
  const item=perServer.get(s.serverId);
  if(item){item.sessions++;item.bytesIn+=inbound;item.bytesOut+=outbound;if(!s.disconnectedAt)item.active++;if(s.outcome==='FAILED')item.failed++}
  const date=s.connectedAt.toISOString().slice(0,10);
  const point=daily.get(date)||{date,sessions:0,bytesIn:0,bytesOut:0};
  point.sessions++;point.bytesIn+=inbound;point.bytesOut+=outbound;daily.set(date,point);
 }
 const countries=new Map<string,number>(),versions=new Map<string,number>();
 for(const d of installations){const c=d.countryCode||'Unknown',v=d.appVersion||'Unknown';countries.set(c,(countries.get(c)||0)+1);versions.set(v,(versions.get(v)||0)+1)}
 return NextResponse.json({period,generatedAt:now.toISOString(),sampled:sessions.length===50000||installations.length===50000,collectorConnected:false,totals:{servers:servers.length,connections:sessions.length,activeSessionRecords:active,bytesIn:totalIn,bytesOut:totalOut,failed,installations:installations.length,totalInstallations,plusInstallations:installations.filter(x=>x.plan==='PLUS').length},servers:[...perServer.values()],trend:[...daily.values()],countries:[...countries].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count),versions:[...versions].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count),events:events.map(e=>({kind:e.kind,count:e._count._all}))},{headers:{'Cache-Control':'no-store'}});
 }catch(e){console.error('Analytics query failed',e);return NextResponse.json({error:'Analytics unavailable'},{status:500})}
}