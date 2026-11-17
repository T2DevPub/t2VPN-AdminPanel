import {strict as assert} from 'node:assert';
import {generateKeyPairSync,randomUUID,sign} from 'node:crypto';

const base=process.env.SMOKE_BASE_URL||'http://localhost:3000';
async function call(path,options={}){
 const response=await fetch(base+path,options);
 const text=await response.text();
 let data;try{data=JSON.parse(text)}catch{data={raw:text}}
 return {status:response.status,data,headers:response.headers};
}
const json=(body,headers={})=>({method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
const health=await call('/api/health');
assert.equal(health.status,200,'Database health should return 200');
const unauth=await call('/api/servers');
assert.equal(unauth.status,401,'Admin API must require a session');
const initial=await call('/api/mobile/servers');
assert.equal(initial.status,200);
assert.ok(Array.isArray(initial.data.servers));
const ads=await call('/api/mobile/ads?country=RU');
assert.equal(ads.status,200);
assert.equal(ads.data.placements.length,8);
const id=randomUUID();
const {publicKey,privateKey}=generateKeyPairSync('ec',{namedCurve:'prime256v1'});
const spki=publicKey.export({type:'spki',format:'der'}).toString('base64');
const challenge=await call('/api/mobile/auth/challenge',json({installationId:id,publicKeySpki:spki}));
assert.equal(challenge.status,200,JSON.stringify(challenge.data));
const signature=sign('sha256',Buffer.from(challenge.data.signingPayload,'utf8'),privateKey).toString('base64');
const tokenResult=await call('/api/mobile/auth/token',json({installationId:id,challengeId:challenge.data.challengeId,signature}));
assert.equal(tokenResult.status,200,JSON.stringify(tokenResult.data));
const auth={Authorization:'Bearer '+tokenResult.data.accessToken};
const current=await call('/api/mobile/me',{headers:auth});
assert.equal(current.status,200);
assert.equal(current.data.plan,'FREE');
const ping=await call('/api/mobile/events',json({event:'APP_HEARTBEAT',countryCode:'IN'},auth));
assert.equal(ping.status,202,'Authenticated mobile presence heartbeat should succeed');

const repeated=await call('/api/mobile/auth/token',json({installationId:id,challengeId:challenge.data.challengeId,signature}));
assert.equal(repeated.status,401,'Replayed challenge must fail');
const reward=await call('/api/mobile/reward/verify',{method:'POST',headers:auth});
assert.equal(reward.status,200);
assert.equal(reward.data.verified,false);
const login=await call('/api/auth/login',json({username:process.env.ADMIN_USERNAME,password:process.env.ADMIN_PASSWORD}));
assert.equal(login.status,200,JSON.stringify(login.data));
const cookie=(login.headers.get('set-cookie')||'').split(';')[0];
assert.ok(cookie.startsWith('t2vpn_admin_session='));
const report=await call('/api/analytics?period=today',{headers:{Cookie:cookie}});
assert.equal(report.status,200);
assert.equal(report.data.period,'today');
assert.equal(report.data.timezone,'Asia/Kolkata');
assert.ok(report.data.totals.activeInstallationsNow>=1);
assert.equal(report.data.totals.activeSessionRecords,0,'App heartbeat is not a verified VPN session');
const devices=await call('/api/devices',{headers:{Cookie:cookie}});
assert.equal(devices.status,200);
assert.ok(devices.data.summary.activeNow>=1);


const savedAds=await call('/api/ad-management',{headers:{Cookie:cookie}});
assert.equal(savedAds.status,200);
const testUnit={id:'ci_adfox_01',name:'CI Yandex Banner',provider:'ADFOX',format:'BANNER',unitId:'R-M-9999999-1',enabled:true};
const yandexUnits=[
 {id:'ci_yandex_native',name:'CI Yandex Native',provider:'ADFOX',format:'NATIVE',unitId:'R-M-9999999-2',enabled:true},
 {id:'ci_yandex_interstitial',name:'CI Yandex Interstitial',provider:'ADFOX',format:'INTERSTITIAL',unitId:'R-M-9999999-3',enabled:true},
 {id:'ci_yandex_rewarded',name:'CI Yandex Rewarded',provider:'ADFOX',format:'REWARDED',unitId:'R-M-9999999-4',enabled:true},
 {id:'ci_yandex_app_open',name:'CI Yandex App Open',provider:'ADFOX',format:'APP_OPEN',unitId:'R-M-9999999-5',enabled:true}
];
const newAds={...savedAds.data,adsEnabled:true,
 providers:{...savedAds.data.providers,ADFOX:{enabled:true,appId:''}},
 units:[...savedAds.data.units,testUnit,...yandexUnits],
 placements:savedAds.data.placements.map(p=>p.key==='home_banner'?{...p,enabled:true,unitRef:testUnit.id,fallbackRef:''}:p.key==='app_open'?{...p,enabled:true,unitRef:'ci_yandex_app_open',fallbackRef:''}:p)
};
const rejectOrigin=await call('/api/ad-management',{method:'PUT',headers:{
 Cookie:cookie,Origin:'https://attacker.invalid','Content-Type':'application/json'
},body:JSON.stringify(newAds)});
assert.equal(rejectOrigin.status,403,'Third-party browser origin should not save admin settings');
const allowOrigin=await call('/api/ad-management',{method:'PUT',headers:{
 Cookie:cookie,Origin:'https://vpn2.t2dev.in','Content-Type':'application/json'
},body:JSON.stringify(newAds)});
assert.equal(allowOrigin.status,200,JSON.stringify(allowOrigin.data));
const persistedAds=await call('/api/ad-management',{headers:{Cookie:cookie}});
assert.equal(persistedAds.data.units.find(u=>u.id===testUnit.id)?.unitId,testUnit.unitId);
const mobileAd=await call('/api/mobile/ads?country=RU');
assert.equal(mobileAd.data.placements.find(p=>p.key==='home_banner')?.primary?.unitId,testUnit.unitId);

assert.equal(mobileAd.data.placements.find(p=>p.key==='app_open')?.primary?.unitId,'R-M-9999999-5','Yandex App Open must reach Android');
assert.equal(persistedAds.data.units.filter(u=>u.provider==='ADFOX').length,5,'All five Yandex ad formats must be persisted');
// Yandex rewarded is configurable for ad display, but never grants Plus.
const yandexRewardConfig={...newAds,rewardedUnlockEnabled:true,placements:newAds.placements.map(p=>
 p.key==='rewarded_unlock'?{...p,enabled:true,unitRef:'ci_yandex_rewarded',fallbackRef:''}:p)};
const savedReward=await call('/api/ad-management',{method:'PUT',headers:{
 Cookie:cookie,Origin:'https://vpn2.t2dev.in','Content-Type':'application/json'
},body:JSON.stringify(yandexRewardConfig)});
assert.equal(savedReward.status,200,JSON.stringify(savedReward.data));
const yandexRewardApi=await call('/api/mobile/ads?country=IN');
assert.equal(yandexRewardApi.status,200);
assert.equal(yandexRewardApi.data.placements.find(p=>p.key==='rewarded_unlock')?.primary?.provider,'ADFOX');
assert.equal(yandexRewardApi.data.placements.find(p=>p.key==='rewarded_unlock')?.primary?.unitId,'R-M-9999999-4');
assert.equal(yandexRewardApi.data.verifiedPlusUnlockAvailable,false,'Yandex callbacks are not Google SSV');
const rejectedUnverified=await call('/api/mobile/reward/prepare',json({},auth));
assert.equal(rejectedUnverified.status,503,'No Google SSV means Plus unlock must stay disabled');
// A country override with Yandex rewarded must be stored without bypassing Google reward verification.
const yandexRewardCountry={...yandexRewardConfig,countryRules:[...newAds.countryRules,{
 id:'ci_ru_reward',country:'RU',placement:'rewarded_unlock',unitRef:'ci_yandex_rewarded',enabled:true}]};
const countrySaved=await call('/api/ad-management',{method:'PUT',headers:{
 Cookie:cookie,Origin:'https://vpn2.t2dev.in','Content-Type':'application/json'
},body:JSON.stringify(yandexRewardCountry)});
assert.equal(countrySaved.status,200,JSON.stringify(countrySaved.data));
assert.equal((await call('/api/mobile/ads?country=RU')).data.placements.find(p=>p.key==='rewarded_unlock')?.primary?.provider,'ADFOX');

const metadata={name:'CI Server',country:'Germany',countryCode:'DE',city:'Berlin',host:'ci-vpn.example.com',
 deployedOn:'CI',tier:'FREE',visibility:'BOTH',enabled:true,freeProfile:1,plusProfile:1};
const form=new FormData();
form.set('metadata',JSON.stringify(metadata));
form.set('file1',new Blob(['client\ndev tun\nproto udp\nremote ci-vpn.example.com 1194\n'],{type:'application/octet-stream'}),'ci.ovpn');
form.set('username1','ci-test');
form.set('password1','ci-only-secret');
form.set('protocol1','UDP');
form.set('port1','1194');
const made=await call('/api/servers',{method:'POST',headers:{Cookie:cookie},body:form});
assert.equal(made.status,201,JSON.stringify(made.data));
const directory=await call('/api/mobile/servers');
assert.equal(directory.status,200);
assert.equal(directory.data.servers.length,1);
assert.equal(directory.data.servers[0].countryCode,'DE');
assert.equal(directory.data.servers[0].name,'Germany','Android primary name must be the country');
assert.equal(directory.data.servers[0].displayName,'CI Server','Admin display name is preserved');
assert.equal(directory.data.servers[0].countryFlag,'🇩🇪');
assert.equal(directory.data.servers[0].locationLabel,'Germany · Berlin');

const published=JSON.stringify(directory.data);
assert.ok(!published.includes('ci-only-secret'));
assert.ok(!published.includes('ovpnConfig'));
assert.ok(!published.includes('passwordEncrypted'));
const disabled=await call('/api/mobile/connect',json({serverId:made.data.id},auth));
assert.equal(disabled.status,503,'Profile distribution must be off by default');
console.log('V2 API smoke tests passed: auth, replay protection, public metadata, Yandex rewarded selection without unverified Plus grants, ad config persistence behind proxy, CSRF defense, admin CRUD, provisioning gate.');
