import {NextResponse} from 'next/server';
import {getMobileAds} from '@/lib/mobile-ad-config';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function GET(req:Request){
  try{
    const country=(new URL(req.url).searchParams.get('country')||'').toUpperCase();
    return NextResponse.json(await getMobileAds(country),{headers:{'Cache-Control':'public, max-age=30, s-maxage=30'}});
  }catch{return NextResponse.json({error:'Advertising configuration unavailable'},{status:503,headers:{'Cache-Control':'no-store'}})}
}
