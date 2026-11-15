import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
const name='t2vpn_admin_session';
function secret(){const s=process.env.AUTH_SECRET;if(!s || s.length<32)throw new Error('AUTH_SECRET must be at least 32 characters');return new TextEncoder().encode(s);}
export async function createSession(username:string){return new SignJWT({username,role:'admin'}).setProtectedHeader({alg:'HS256'}).setIssuedAt().setExpirationTime('12h').sign(secret());}
export async function getSession(){try{const token=(await cookies()).get(name)?.value;if(!token)return null;const {payload}=await jwtVerify(token,secret());return payload.role==='admin'?String(payload.username):null;}catch{return null;}}
export const sessionCookie=name;
