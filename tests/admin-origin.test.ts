import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {isAllowedAdminMutationOrigin} from '../src/lib/admin-origin';

const configured='https://vpn2.t2dev.in';
function request(origin?:string,forwardedHost='vpn2.t2dev.in'){
 const headers=new Headers({'host':'app:3000','x-forwarded-host':forwardedHost});
 if(origin)headers.set('origin',origin);
 return new Request('http://app:3000/api/ad-management',{method:'PUT',headers});
}
test('accepts Coolify HTTPS public origin with internal HTTP request URL',()=>{
 assert.equal(isAllowedAdminMutationOrigin(request(configured),configured),true);
});
test('rejects malicious browser origins even when forwarded host claims to be trusted',()=>{
 assert.equal(isAllowedAdminMutationOrigin(request('https://example.attacker', 'vpn2.t2dev.in'),configured),false);
 assert.equal(isAllowedAdminMutationOrigin(request('http://vpn2.t2dev.in'),configured),false);
 assert.equal(isAllowedAdminMutationOrigin(request('https://vpn2.t2dev.in.attacker'),configured),false);
});
test('rejects missing or malformed origin headers',()=>{
 assert.equal(isAllowedAdminMutationOrigin(request(),configured),false);
 assert.equal(isAllowedAdminMutationOrigin(request('null'),configured),false);
 assert.equal(isAllowedAdminMutationOrigin(request('https://vpn2.t2dev.in:4443'),configured),false);
});
