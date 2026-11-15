import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
export const runtime='nodejs';
export async function GET(){try{const row=await db.appSetting.findUnique({where:{key:'app_control_v1'}});const config=row?JSON.parse(row.value):null;return NextResponse.json({schemaVersion:1,config:config||{}},{headers:{'Cache-Control':'public, max-age=60, s-maxage=60'}})}catch{return NextResponse.json({error:'App configuration unavailable'},{status:503})}}
