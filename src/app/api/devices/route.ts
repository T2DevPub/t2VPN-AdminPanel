import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {getSession} from '@/lib/auth';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 if(!await getSession())return NextResponse.json({error:'Unauthorized'},{status:401});
 const u=new URL(req.url);const filter=u.searchParams.get('filter')||'all';const q=(u.searchParams.get('q')||'').slice(0,100);
 const page=Math.max(1,Math.min(10000,Number(u.searchParams.get('page'))||1));const limit=25;
 const where:any={...(filter==='plus'?{plan:'PLUS'}:filter==='revoked'?{revoked:true}:filter==='active'?{lastSeenAt:{gte:new Date(Date.now()-24*3600000)}}:{}),...(q?{OR:[{installationId:{contains:q,mode:'insensitive'}},{deviceModel:{contains:q,mode:'insensitive'}},{countryCode:{contains:q,mode:'insensitive'}}]}:{})};
 const [total,items,installations,plus,activeToday,revoked,countries,versions]=await Promise.all([
 db.appInstallation.count({where}),db.appInstallation.findMany({where,orderBy:{lastSeenAt:'desc'},take:limit,skip:(page-1)*limit,select:{id:true,installationId:true,deviceModel:true,manufacturer:true,androidVersion:true,appVersion:true,countryCode:true,plan:true,subscriptionExpiresAt:true,revoked:true,firstSeenAt:true,lastSeenAt:true}}),
 db.appInstallation.count(),db.appInstallation.count({where:{plan:'PLUS'}}),db.appInstallation.count({where:{lastSeenAt:{gte:new Date(Date.now()-86400000)}}}),db.appInstallation.count({where:{revoked:true}}),
 db.appInstallation.groupBy({by:['countryCode'],_count:{_all:true},orderBy:{_count:{countryCode:'desc'}},take:20}),
 db.appInstallation.groupBy({by:['appVersion'],_count:{_all:true},orderBy:{_count:{appVersion:'desc'}},take:12})]);
 return NextResponse.json({total,page,limit,items,summary:{installations,plus,activeToday,revoked},countries:countries.map(x=>({name:x.countryCode||'Unknown',count:x._count._all})),versions:versions.map(x=>({name:x.appVersion||'Unknown',count:x._count._all}))});
}
export async function PATCH(req:Request){
 const actor=await getSession();if(!actor)return NextResponse.json({error:'Unauthorized'},{status:401});
 const origin=req.headers.get('origin');if(origin){try{const h=new URL(origin).host;const hosts=[req.headers.get('host'),req.headers.get('x-forwarded-host')?.split(',')[0]?.trim()];if(!hosts.includes(h))return NextResponse.json({error:'Invalid origin'},{status:403})}catch{return NextResponse.json({error:'Invalid origin'},{status:403})}}
 let body:any;try{body=await req.json()}catch{return NextResponse.json({error:'Invalid JSON'},{status:400})}
 if(typeof body.id!=='string'||typeof body.revoked!=='boolean')return NextResponse.json({error:'Invalid request'},{status:400});
 try{await db.$transaction(async tx=>{await tx.appInstallation.update({where:{id:body.id},data:{revoked:body.revoked}});await tx.auditLog.create({data:{actor,action:body.revoked?'installation.revoke':'installation.restore',detail:body.id}})});return NextResponse.json({ok:true})}catch{return NextResponse.json({error:'Installation not found'},{status:404})}
}
