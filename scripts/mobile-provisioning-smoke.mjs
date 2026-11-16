import {strict as assert} from 'node:assert';
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto';
const base=process.env.SMOKE_BASE_URL||'http://localhost:3001';
async function req(path,options={}){
 const r=await fetch(base+path,options),text=await r.text();
 let d;try{d=JSON.parse(text)}catch{d={raw:text}}
 return {status:r.status,data:d,headers:r.headers};
}
const json=(data,token)=>({method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});
const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const installationId=randomUUID(),publicKeySpki=publicKey.export({type:'spki',format:'der'}).toString('base64');
const challenge=await req('/api/mobile/auth/challenge',json({installationId,publicKeySpki}));
assert.equal(challenge.status,200);
const signature=sign('sha256',Buffer.from(challenge.data.signingPayload),privateKey).toString('base64');
const issued=await req('/api/mobile/auth/token',json({installationId,challengeId:challenge.data.challengeId,signature}));
assert.equal(issued.status,200);
const token=issued.data.accessToken;
const directory=await req('/api/mobile/servers');
assert.equal(directory.status,200);
const free=directory.data.servers.find(s=>s.tier==='FREE');
assert.ok(free,'CI DB must contain a Free server');
const profile=await req('/api/mobile/connect',json({serverId:free.id},token));
assert.equal(profile.status,200,JSON.stringify(profile.data));
assert.equal(profile.data.slot,1);
assert.equal(profile.data.username,'ci-test');
assert.equal(profile.data.password,'ci-only-secret');
assert.ok(profile.data.ovpnConfig.includes('remote ci-vpn.example.com'));
assert.ok((profile.headers.get('cache-control')||'').includes('no-store'));
const anon=await req('/api/mobile/connect',json({serverId:free.id}));
assert.equal(anon.status,401);
console.log('Secure mobile profile authorization smoke test passed (CI-only test credential).');
