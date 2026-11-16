import {NextResponse} from 'next/server';
import {requireMobile,entitlement,mobileNoStore} from '@/lib/mobile-auth';
export const runtime='nodejs';
export async function GET(req:Request){
 const install=await requireMobile(req);
 if(!install)return NextResponse.json({error:'Unauthorized'},{status:401,headers:mobileNoStore});
 const rights=entitlement(install);
 return NextResponse.json({schemaVersion:2,installationId:install.installationId,plan:rights.plus?'PLUS':'FREE',
  plusVerified:rights.plus,rewardedUnlocked:rights.reward,
  subscriptionExpiresAt:install.subscriptionExpiresAt?.toISOString()||null,
  rewardedUntil:install.rewardedUntil?.toISOString()||null,
  entitlementMustRefresh:install.plan==='PLUS'&&!rights.plus
 },{headers:mobileNoStore});
}
