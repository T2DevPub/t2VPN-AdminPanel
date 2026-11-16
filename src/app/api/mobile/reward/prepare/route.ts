import {NextResponse} from 'next/server';
import {db} from '@/lib/db';
import {eligibleRewardedUnitIds,readAdConfig} from '@/lib/mobile-ads';
import {mobileNoStore,mobileRateLimit,requireMobile} from '@/lib/mobile-auth';
export const runtime='nodejs';
export async function POST(req:Request){
 const installation=await requireMobile(req);
 if(!installation)return NextResponse.json({error:'Unauthorized'},{status:401,headers:mobileNoStore});
 try{
  if(!await mobileRateLimit('reward-prepare',installation.installationId,12,30))
   return NextResponse.json({error:'Too many reward attempts'},{status:429,headers:mobileNoStore});
  if(eligibleRewardedUnitIds(await readAdConfig()).size===0)return NextResponse.json({error:'Verified rewarded unlock is disabled'},{status:503,headers:mobileNoStore});
  const pending=await db.mobileRewardPending.create({data:{installationId:installation.installationId,expiresAt:new Date(Date.now()+10*60000)}});
  return NextResponse.json({schemaVersion:2,provider:'ADX',customData:pending.id,
   ssvCallbackUrl:'https://vpn2.t2dev.in/api/mobile/reward/ssv',expiresAt:pending.expiresAt.toISOString(),
   instruction:'Set ServerSideVerificationOptions.customData before showing rewarded ad; wait for Google SSV verification.'},{headers:mobileNoStore});
 }catch{return NextResponse.json({error:'Reward preparation unavailable'},{status:503,headers:mobileNoStore})}
}
