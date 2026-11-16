import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){
 try{await db.appSetting.findFirst({select:{key:true}});return NextResponse.json({status:'ok',service:'t2vpn-v2'},{headers:{'Cache-Control':'no-store'}})}
 catch{return NextResponse.json({status:'unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
