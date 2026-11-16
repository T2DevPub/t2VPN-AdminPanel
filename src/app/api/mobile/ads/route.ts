import {NextResponse} from 'next/server';
import {publicAdConfig,readAdConfig} from '@/lib/mobile-ads';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 try{
  const country=(new URL(req.url).searchParams.get('country')||'').toUpperCase();
  return NextResponse.json(publicAdConfig(await readAdConfig(),country),{headers:{'Cache-Control':'public, max-age=30, s-maxage=30'}});
 }catch{return NextResponse.json({error:'Ad settings unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
