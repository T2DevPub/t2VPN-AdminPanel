import {strict as assert} from 'node:assert';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

const raw=execFileSync('docker',['compose','config','--format','json'],{encoding:'utf8'});
const config=JSON.parse(raw);
for(const name of ['t2vpn_pgdata','t2vpn_secrets','t2vpn_backups']){
 assert.ok(Object.hasOwn(config.volumes,name),'Required durable volume missing: '+name);
}
function hasVolume(service,target,volume){
 const items=config.services[service]?.volumes||[];
 return items.some(v=>v.type==='volume'&&v.target===target&&(v.source===volume||v.source.endsWith('_'+volume)));
}
assert.ok(hasVolume('db','/var/lib/postgresql/data','t2vpn_pgdata'),'PostgreSQL must keep the ORIGINAL data volume');
assert.ok(hasVolume('db','/run/t2vpn','t2vpn_secrets'),'Database must keep the ORIGINAL secrets volume');
assert.ok(hasVolume('app','/run/t2vpn','t2vpn_secrets'),'App must keep its original VPN encryption key volume');
assert.ok(hasVolume('app','/backups','t2vpn_backups'),'App must write backup archives to a persistent volume');
assert.ok(hasVolume('secrets-init','/pgdata','t2vpn_pgdata'),'Volume guard must inspect existing PostgreSQL data');
assert.ok(hasVolume('secrets-init','/backups','t2vpn_backups'),'Volume guard must read the startup sentinel');
assert.ok(JSON.stringify(config.services['secrets-init']?.command||'').includes('STORAGE GUARD'),'Missing fail-closed storage protection');
const startup=readFileSync('scripts/docker-start.sh','utf8');
const first=startup.indexOf('sh scripts/backup-before-migration.sh');
const schema=startup.indexOf('npm run db:prepare');
const push=startup.indexOf('npx prisma db push');
const seed=startup.indexOf('npm run db:seed');
assert.ok(first>0&&first<schema&&schema<push&&push<seed,'Backups must complete before any database mutation');
assert.ok(!startup.includes('--accept-data-loss'),'Dangerous automatic destructive-schema flag detected');
console.log('Persistent PostgreSQL, secrets, backup mounts and safe startup ordering verified.');
