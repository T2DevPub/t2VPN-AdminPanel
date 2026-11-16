import {NextResponse} from 'next/server';
import {createHmac} from 'node:crypto';
import {GoogleAuth} from 'google-auth-library';
import {z} from 'zod';
import {db} from '@/lib/db';
import {jsonBody,mobileNoStore,mobileRateLimit,requireMobile} from '@/lib/mobile-auth';
export const runtime='nodejs';
const input=z.object({purchaseToken:z.string().min(20).max(2048)});
type PlayResult={subscriptionState?:string;lineItems?:{productId?:string;expiryTime?:string}[]};
export async function POST(req:Request){
 const installation=await requireMobile(req);
 if(!installation)return NextResponse.json({error:'Unauthorized'},{status:401,headers:mobileNoStore});
 const cred=process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON_BASE64,ids=process.env.PLAY_PLUS_PRODUCT_IDS;
 if(!cred||!ids)return NextResponse.json({error:'Google Play verification not configured'},{status:503,headers:mobileNoStore});
 try{
  const parsed=input.safeParse(await jsonBody(req,4096));
  if(!parsed.success)return NextResponse.json({error:'Invalid purchase token'},{status:400,headers:mobileNoStore});
  if(!await mobileRateLimit('play-purchase',installation.installationId,15,30))
   return NextResponse.json({error:'Too many verification requests'},{status:429,headers:mobileNoStore});
  const token=parsed.data.purchaseToken;
  const credentials=JSON.parse(Buffer.from(cred,'base64').toString('utf8')) as Record<string,unknown>;
  const auth=new GoogleAuth({credentials,scopes:['https://www.googleapis.com/auth/androidpublisher']});
  const access=await auth.getAccessToken();
  if(!access)return NextResponse.json({error:'Google Play authorization unavailable'},{status:503,headers:mobileNoStore});
  const url='https://androidpublisher.googleapis.com/androidpublisher/v3/applications/app.t2dev.vpn/purchases/subscriptionsv2/tokens/'+encodeURIComponent(token);
  const response=await fetch(url,{headers:{Authorization:'Bearer '+access,Accept:'application/json'},signal:AbortSignal.timeout(10000),cache:'no-store'});
  if(!response.ok){
   return NextResponse.json({error:response.status===404||response.status===410?'Invalid or expired purchase token':'Google Play verification unavailable'},{status:response.status===404||response.status===410?403:503,headers:mobileNoStore});
  }
  const purchase=await response.json() as PlayResult;
  const accepted=new Set(ids.split(',').map(x=>x.trim()).filter(Boolean));
  const validStates=['SUBSCRIPTION_STATE_ACTIVE','SUBSCRIPTION_STATE_IN_GRACE_PERIOD','SUBSCRIPTION_STATE_CANCELED'];
  const allowed=validStates.includes(purchase.subscriptionState||'');
  const qualifying=(purchase.lineItems||[]).filter(x=>x.productId&&accepted.has(x.productId)&&x.expiryTime&&Date.parse(x.expiryTime)>Date.now());
  if(!allowed||!qualifying.length)return NextResponse.json({verified:false,error:'No currently valid Plus subscription'},{status:403,headers:mobileNoStore});
  const expiry=new Date(Math.max(...qualifying.map(x=>Date.parse(x.expiryTime!))));
  const hash=createHmac('sha256',process.env.AUTH_SECRET!).update(token).digest('hex');
  const bound=await db.appInstallation.findFirst({where:{subscriptionTokenHash:hash,installationId:{not:installation.installationId}}});
  if(bound)return NextResponse.json({error:'Purchase token already bound to a different installation'},{status:409,headers:mobileNoStore});
  await db.appInstallation.update({where:{installationId:installation.installationId},
   data:{plan:'PLUS',subscriptionExpiresAt:expiry,subscriptionCheckedAt:new Date(),subscriptionTokenHash:hash}});
  return NextResponse.json({verified:true,plan:'PLUS',expiresAt:expiry.toISOString(),refreshAfterSeconds:600},{headers:mobileNoStore});
 }catch(e){
  console.error('Play entitlement verification unavailable',e instanceof Error?e.message:'unknown');
  return NextResponse.json({error:'Purchase verification unavailable'},{status:503,headers:mobileNoStore});
 }
}
