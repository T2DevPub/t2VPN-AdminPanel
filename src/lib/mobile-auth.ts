import {createHash,createPublicKey,randomBytes,verify as verifySignature} from 'node:crypto';
import {jwtVerify,SignJWT} from 'jose';
import {db} from '@/lib/db';
const issuer='t2vpn-admin-v2', audience='t2vpn-android-v2';
const now=()=>new Date();

function tokenKey(){
  const value=process.env.AUTH_SECRET;
  if(!value||value.length<32)throw new Error('AUTH_SECRET must have 32+ characters');
  return new TextEncoder().encode(value);
}
export const mobileNoStore={'Cache-Control':'no-store, private','Pragma':'no-cache','X-Content-Type-Options':'nosniff'};

export async function jsonBody(request:Request,max=8192):Promise<unknown>{
  const claimed=Number(request.headers.get('content-length')||0);
  if(claimed>max)throw new Error('Request too large');
  const raw=await request.text();
  if(Buffer.byteLength(raw)>max)throw new Error('Request too large');
  return JSON.parse(raw) as unknown;
}
export function verifyPublicKey(spki:string,message:string,signature:string):boolean{
  try{
    if(spki.length>512||signature.length>512||!spki||!signature)return false;
    const key=createPublicKey({key:Buffer.from(spki,'base64'),type:'spki',format:'der'});
    if(key.asymmetricKeyType!=='ec'||key.asymmetricKeyDetails?.namedCurve!=='prime256v1')return false;
    return verifySignature('sha256',Buffer.from(message,'utf8'),key,Buffer.from(signature,'base64'));
  }catch{return false}
}
export function randomChallenge(){return randomBytes(32).toString('base64url')}
export async function createMobileToken(installationId:string){
  return new SignJWT({scope:'mobile',sub:installationId}).setProtectedHeader({alg:'HS256'})
    .setIssuer(issuer).setAudience(audience).setIssuedAt().setExpirationTime('15m').sign(tokenKey());
}
export async function requireMobile(request:Request){
  const header=request.headers.get('authorization')||'';
  const match=/^Bearer ([A-Za-z0-9_\-.]+)$/.exec(header);
  if(!match)return null;
  try{
    const {payload}=await jwtVerify(match[1],tokenKey(),{issuer,audience,algorithms:['HS256']});
    if(payload.scope!=='mobile'||typeof payload.sub!=='string')return null;
    const installation=await db.appInstallation.findUnique({where:{installationId:payload.sub}});
    return installation?.publicKeySpki&&!installation.revoked?installation:null;
  }catch{return null}
}
export async function mobileRateLimit(action:string,key:string,maxHits:number,minutes:number){
  const hashed=createHash('sha256').update(key).digest('hex');
  const id=action+':'+hashed,cutoff=new Date(Date.now()-minutes*60000),time=now();
  const prior=await db.mobileRateLimit.findUnique({where:{key:id}});
  if(!prior){
    try{await db.mobileRateLimit.create({data:{key:id,windowStart:time,hits:1}});return true}
    catch{/* Concurrent registration: use the conditional increment below. */}
  }
  if(prior&&prior.windowStart<cutoff){
    const changed=await db.mobileRateLimit.updateMany({where:{key:id,windowStart:{lt:cutoff}},data:{windowStart:time,hits:1}});
    if(changed.count===1)return true;
  }
  const changed=await db.mobileRateLimit.updateMany({where:{key:id,windowStart:{gte:cutoff},hits:{lt:maxHits}},data:{hits:{increment:1}}});
  return changed.count===1;
}
export function requestIp(req:Request){
  // Configure Coolify/reverse proxy to overwrite X-Real-IP and strip spoofed client headers.
  return (req.headers.get('x-real-ip')||req.headers.get('cf-connecting-ip')||'unidentified').slice(0,100);
}
export function entitlement(inst:{plan:string;subscriptionExpiresAt:Date|null;subscriptionCheckedAt:Date|null;rewardedUntil:Date|null}){
  const nowMs=Date.now();
  const plus=inst.plan==='PLUS'&&Boolean(inst.subscriptionExpiresAt&&inst.subscriptionExpiresAt.getTime()>nowMs)
    &&Boolean(inst.subscriptionCheckedAt&&inst.subscriptionCheckedAt.getTime()>nowMs-15*60000);
  const reward=Boolean(inst.rewardedUntil&&inst.rewardedUntil.getTime()>nowMs);
  return {plus,reward};
}
