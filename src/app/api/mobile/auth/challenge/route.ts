import {NextResponse} from 'next/server';
import {z} from 'zod';
import {createPublicKey} from 'node:crypto';
import {db} from '@/lib/db';
import {jsonBody,mobileNoStore,mobileRateLimit,randomChallenge,requestIp} from '@/lib/mobile-auth';
export const runtime='nodejs';
const schema=z.object({installationId:z.string().uuid(),publicKeySpki:z.string().min(80).max(512)});
export async function POST(req:Request){
  try{
    const parsed=schema.safeParse(await jsonBody(req));
    if(!parsed.success)return NextResponse.json({error:'Invalid installation or public key'},{status:400,headers:mobileNoStore});
    const {installationId,publicKeySpki}=parsed.data;
    const key=createPublicKey({key:Buffer.from(publicKeySpki,'base64'),type:'spki',format:'der'});
    if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1')return NextResponse.json({error:'P-256 key required'},{status:400});
    const permitted=await mobileRateLimit('mobile-challenge-ip',requestIp(req),30,10)&&await mobileRateLimit('mobile-challenge-install',installationId,10,10);
    if(!permitted)return NextResponse.json({error:'Too many attempts'},{status:429,headers:mobileNoStore});
    const existing=await db.appInstallation.findUnique({where:{installationId},select:{publicKeySpki:true,revoked:true}});
    if(existing?.revoked||existing?.publicKeySpki&&existing.publicKeySpki!==publicKeySpki)return NextResponse.json({error:'Installation key is already registered or revoked'},{status:403,headers:mobileNoStore});
    const challenge=await db.mobileAuthChallenge.create({data:{installationId,publicKeySpki,nonce:randomChallenge(),expiresAt:new Date(Date.now()+2*60000)}});
    return NextResponse.json({schemaVersion:2,challengeId:challenge.id,nonce:challenge.nonce,expiresAt:challenge.expiresAt.toISOString(),signingPayload:'t2vpn-v2:'+installationId+':'+challenge.nonce+':'+challenge.id},{headers:mobileNoStore});
  }catch{return NextResponse.json({error:'Challenge unavailable'},{status:503,headers:mobileNoStore})}
}
