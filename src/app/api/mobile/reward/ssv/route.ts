import {NextResponse} from 'next/server';
import {createPublicKey,verify as verifySignature} from 'node:crypto';
import {db} from '@/lib/db';
import {eligibleRewardedUnitIds,readAdConfig} from '@/lib/mobile-ads';
export const runtime='nodejs';
export const dynamic='force-dynamic';
type Key={keyId:number;pem:string};
let keysCache:{expires:number;keys:Key[]}|null=null;
async function googleKeys(){
 if(keysCache&&keysCache.expires>Date.now())return keysCache.keys;
 const res=await fetch('https://www.gstatic.com/admob/reward/verifier-keys.json',{cache:'no-store',signal:AbortSignal.timeout(8000)});
 if(!res.ok)throw new Error('AdMob verification keys unavailable');
 const payload=await res.json() as {keys?:Key[]};
 if(!Array.isArray(payload.keys)||!payload.keys.length)throw new Error('Invalid AdMob keys');
 keysCache={keys:payload.keys,expires:Date.now()+6*3600000};
 return payload.keys;
}
export async function GET(req:Request){
 try{
  const query=new URL(req.url).search.slice(1);
  if(query.length>8192)return new NextResponse('Invalid callback',{status:400});
  // Google signs the *original* query bytes preceding the final signature/key_id parameters.
  const match=/^(.*)&signature=([A-Za-z0-9_-]+=*)&key_id=([0-9]+)$/.exec(query);
  if(!match||match[1].includes('&signature=')||match[1].includes('&key_id='))return new NextResponse('Invalid signature fields',{status:400});
  const params=new URLSearchParams(match[1]);
  const rawTimestamp=Number(params.get('timestamp'));
  // AdMob callback timestamps have appeared in both milliseconds and microseconds.
  const timestamp=rawTimestamp>1e14?rawTimestamp/1000:rawTimestamp;
  const txid=params.get('transaction_id')||'';
  const pendingId=params.get('custom_data')||'';
  const adUnit=params.get('ad_unit')||'';
  const userId=params.get('user_id')||'';
  if(!Number.isFinite(timestamp)||Math.abs(Date.now()-timestamp)>10*60000||!params.get('reward_amount')
     ||txid.length<8||txid.length>200||!pendingId||!adUnit)return new NextResponse('Invalid reward information',{status:400});
  const keys=await googleKeys();
  const selected=keys.find(k=>String(k.keyId)===match[3]);
  if(!selected)return new NextResponse('Unknown signing key',{status:403});
  const valid=verifySignature('sha256',Buffer.from(match[1],'utf8'),createPublicKey(selected.pem),Buffer.from(match[2],'base64url'));
  if(!valid)return new NextResponse('Invalid callback signature',{status:403});
  const eligible=eligibleRewardedUnitIds(await readAdConfig());
  // AdMob SSV may send the numeric ad-unit suffix rather than a ca-app-pub-* path.
  if(![...eligible].some(unit=>unit===adUnit||unit.split('/').pop()===adUnit))return new NextResponse('Reward ad unit not enabled',{status:403});
  const previous=await db.mobileRewardReceipt.findUnique({where:{transactionId:txid}});
  if(previous)return new NextResponse('OK',{status:200});
  const pending=await db.mobileRewardPending.findUnique({where:{id:pendingId}});
  if(!pending||pending.consumedAt||pending.expiresAt<=new Date()||userId&&userId!==pending.installationId)
   return new NextResponse('Invalid or expired reward request',{status:403});
  try{
   await db.$transaction(async tx=>{
    const used=await tx.mobileRewardPending.updateMany({where:{id:pendingId,consumedAt:null,expiresAt:{gt:new Date()}},data:{consumedAt:new Date()}});
    if(used.count!==1)throw new Error('Reward already consumed');
    await tx.mobileRewardReceipt.create({data:{transactionId:txid,installationId:pending.installationId,adUnit}});
    await tx.appInstallation.update({where:{installationId:pending.installationId},data:{rewardedUntil:new Date(Date.now()+30*60000)}});
   });
  }catch{
   const duplicate=await db.mobileRewardReceipt.findUnique({where:{transactionId:txid}});
   if(duplicate)return new NextResponse('OK',{status:200});
   return new NextResponse('Unable to apply verified reward',{status:503});
  }
  return new NextResponse('OK',{status:200});
 }catch(e){
  console.error('Reward verification temporarily unavailable',e instanceof Error?e.message:'unknown');
  return new NextResponse('SSV verification unavailable',{status:503});
 }
}
