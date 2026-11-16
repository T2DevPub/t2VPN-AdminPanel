import {NextResponse} from 'next/server';
import {requireMobile,mobileNoStore} from '@/lib/mobile-auth';
export const runtime='nodejs';
// This endpoint checks the result of Google's SSV; it never grants rewards based on client input.
export async function POST(req:Request){
 const installation=await requireMobile(req);
 if(!installation)return NextResponse.json({error:'Unauthorized'},{status:401,headers:mobileNoStore});
 const active=Boolean(installation.rewardedUntil&&installation.rewardedUntil>new Date());
 return NextResponse.json({schemaVersion:2,verified:active,rewardedUnlocked:active,
  expiresAt:installation.rewardedUntil?.toISOString()||null},{headers:mobileNoStore});
}
