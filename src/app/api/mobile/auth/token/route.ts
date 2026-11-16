import {NextResponse} from 'next/server';
import {z} from 'zod';
import {db} from '@/lib/db';
import {createMobileToken,jsonBody,mobileNoStore,mobileRateLimit,requestIp,verifyPublicKey} from '@/lib/mobile-auth';
export const runtime='nodejs';
const schema=z.object({installationId:z.string().uuid(),challengeId:z.string().uuid(),signature:z.string().min(64).max(512)});
export async function POST(req:Request){
  try{
    const parsed=schema.safeParse(await jsonBody(req));
    if(!parsed.success)return NextResponse.json({error:'Invalid request'},{status:400,headers:mobileNoStore});
    const {installationId,challengeId,signature}=parsed.data;
    if(!await mobileRateLimit('mobile-token-ip',requestIp(req),60,10)||!await mobileRateLimit('mobile-token-install',installationId,20,10))
      return NextResponse.json({error:'Rate limit exceeded'},{status:429,headers:mobileNoStore});
    const challenge=await db.mobileAuthChallenge.findUnique({where:{id:challengeId}});
    if(!challenge||challenge.consumedAt||challenge.expiresAt<=new Date()||challenge.installationId!==installationId)
      return NextResponse.json({error:'Expired or invalid challenge'},{status:401,headers:mobileNoStore});
    const message='t2vpn-v2:'+installationId+':'+challenge.nonce+':'+challenge.id;
    if(!verifyPublicKey(challenge.publicKeySpki,message,signature))
      return NextResponse.json({error:'Invalid key signature'},{status:401,headers:mobileNoStore});
    await db.$transaction(async tx=>{
      const consumed=await tx.mobileAuthChallenge.updateMany({where:{id:challengeId,consumedAt:null,expiresAt:{gt:new Date()}},data:{consumedAt:new Date()}});
      if(consumed.count!==1)throw new Error('Challenge already consumed');
      const existing=await tx.appInstallation.findUnique({where:{installationId}});
      if(existing?.revoked||existing?.publicKeySpki&&existing.publicKeySpki!==challenge.publicKeySpki)throw new Error('Key mismatch');
      if(existing){
        await tx.appInstallation.update({where:{installationId},data:{publicKeySpki:challenge.publicKeySpki,lastSeenAt:new Date()}});
      }else{
        await tx.appInstallation.create({data:{installationId,publicKeySpki:challenge.publicKeySpki}});
      }
    });
    const token=await createMobileToken(installationId);
    return NextResponse.json({schemaVersion:2,accessToken:token,tokenType:'Bearer',expiresInSeconds:900},{headers:mobileNoStore});
  }catch{return NextResponse.json({error:'Authentication failed'},{status:401,headers:mobileNoStore})}
}
