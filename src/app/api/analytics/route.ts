import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {getSession} from '@/lib/auth';
export const runtime='nodejs';
export const dynamic='force-dynamic';

const days:Record<string,number>={'7d':7,'30d':30,'90d':90};
function getPeriod(period:string,now:Date){
  const end=new Date(now),start=new Date(now);
  // Calendar-day filters follow the Admin Panel's Asia/Kolkata (IST) timezone.
  const istDay=new Date(now.getTime()+330*60000).toISOString().slice(0,10);
  if(period==='today')return {start:new Date(istDay+'T00:00:00+05:30'),end};
  if(period==='yesterday'){
    const todayStart=new Date(istDay+'T00:00:00+05:30');
    return {start:new Date(todayStart.getTime()-86400000),end:todayStart};
  }
  if(period==='lifetime')return {start:new Date(0),end};
  start.setTime(now.getTime()-(days[period]||7)*86400000);
  return {start,end};
}
export async function GET(req:Request){
  if(!await getSession())return NextResponse.json({error:'Unauthorized'},{status:401});
  const now=new Date(),period=new URL(req.url).searchParams.get('period')||'7d';
  const {start,end}=getPeriod(period,now);
  const where={connectedAt:{gte:start,lt:end}};
  try{
    const [servers,sessions,installations,events,totalInstallations,liveGroups]=await Promise.all([
      db.vpnServer.findMany({select:{id:true,name:true,country:true,countryCode:true,city:true,tier:true,deployedOn:true,enabled:true},orderBy:{name:'asc'}}),
      db.vpnUsageSession.findMany({where,select:{serverId:true,connectedAt:true,disconnectedAt:true,bytesIn:true,bytesOut:true,outcome:true},orderBy:{connectedAt:'asc'},take:50000}),
      db.appInstallation.findMany({where:{lastSeenAt:{gte:start,lt:end}},select:{countryCode:true,appVersion:true,androidVersion:true,plan:true},take:50000}),
      db.installationEvent.groupBy({by:['kind'],where:{createdAt:{gte:start,lt:end}},_count:{_all:true}}),
      db.appInstallation.count(),
      db.vpnUsageSession.groupBy({by:['serverId'],where:{disconnectedAt:null,lastHeartbeatAt:{gte:new Date(now.getTime()-60000)}},_count:{_all:true}})
    ]);
    const liveByServer=new Map(liveGroups.map(g=>[g.serverId,g._count._all]));
    const liveCount=liveGroups.reduce((a,g)=>a+g._count._all,0);
    const perServer=new Map(servers.map(s=>[s.id,{...s,sessions:0,active:liveByServer.get(s.id)||0,bytesIn:0,bytesOut:0,failed:0}]));
    const daily=new Map<string,{date:string,sessions:number,bytesIn:number,bytesOut:number}>();
    let totalIn=0,totalOut=0,failed=0;
    for(const s of sessions){
      const inbound=Number(s.bytesIn),outbound=Number(s.bytesOut);
      totalIn+=inbound;totalOut+=outbound;
      if(s.outcome==='FAILED')failed++;
      const item=perServer.get(s.serverId);
      if(item){item.sessions++;item.bytesIn+=inbound;item.bytesOut+=outbound;if(s.outcome==='FAILED')item.failed++}
      const date=new Date(s.connectedAt.getTime()+330*60000).toISOString().slice(0,10);
      const point=daily.get(date)||{date,sessions:0,bytesIn:0,bytesOut:0};
      point.sessions++;point.bytesIn+=inbound;point.bytesOut+=outbound;daily.set(date,point);
    }
    const countries=new Map<string,number>(),versions=new Map<string,number>();
    for(const d of installations){
      const c=d.countryCode||'Unknown',v=d.appVersion||'Unknown';
      countries.set(c,(countries.get(c)||0)+1);
      versions.set(v,(versions.get(v)||0)+1);
    }
    return NextResponse.json({
      period,generatedAt:now.toISOString(),sampled:sessions.length===50000||installations.length===50000,
      collectorConfigured:Boolean(process.env.TELEMETRY_INGEST_SECRET&&process.env.TELEMETRY_INGEST_SECRET.length>=32),
      collectorConnected:false,
      totals:{servers:servers.length,connections:sessions.length,activeSessionRecords:liveCount,bytesIn:totalIn,bytesOut:totalOut,failed,installations:installations.length,totalInstallations,plusInstallations:installations.filter(x=>x.plan==='PLUS').length},
      servers:[...perServer.values()],trend:[...daily.values()].sort((a,b)=>a.date.localeCompare(b.date)),
      countries:[...countries].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count),
      versions:[...versions].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count),
      events:events.map(e=>({kind:e.kind,count:e._count._all}))
    },{headers:{'Cache-Control':'no-store'}});
  }catch(e){console.error('Analytics query failed',e);return NextResponse.json({error:'Analytics unavailable'},{status:500})}
}
