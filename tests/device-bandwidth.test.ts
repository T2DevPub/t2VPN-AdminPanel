import {test} from 'node:test';
import {strict as assert} from 'node:assert';
import {
 DEFAULT_QUOTA_SETTINGS,billableBytes,istDay,validIstDate,
 quotaDecision,quotaDisplayStatus,quotaRevision,quotaBytes,anonymousDeviceId
} from '../src/lib/device-bandwidth';

test('date filtering follows IST calendar boundaries',()=>{
 assert.equal(istDay(new Date('2026-11-17T18:29:59.000Z')),'2026-11-17');
 assert.equal(istDay(new Date('2026-11-17T18:30:00.000Z')),'2026-11-18');
 assert.equal(validIstDate('2026-11-18'),true);
 assert.equal(validIstDate('2026-02-30'),false);
 assert.equal(validIstDate('18-11-2026'),false);
});
test('2 GiB quota with measured gateway deltas, reset baseline and idempotent count',()=>{
 const settings={...DEFAULT_QUOTA_SETTINGS,enforcementEnabled:true};
 const limit=quotaBytes(settings);
 assert.equal(limit,BigInt(2147483648));
 const measured=limit+BigInt(1000000);
 assert.equal(billableBytes(measured,BigInt(0)),measured);
 const over=quotaDecision(settings,'2026-11-18',measured,BigInt(0),null);
 assert.equal(over.overQuota,true);
 assert.equal(over.targetLimitMbps,3);
 assert.equal(quotaDisplayStatus({
  decision:over,settings,gatewayAppliedMbps:null,gatewayPolicyRevision:null,gatewayReportedAt:null
 }),'pending');
 const reset=new Date('2026-11-18T05:30:00Z');
 const cleared=quotaDecision(settings,'2026-11-18',measured,measured,reset);
 assert.equal(cleared.effective,BigInt(0));
 assert.equal(cleared.targetLimitMbps,null);
 assert.notEqual(cleared.policyRevision,over.policyRevision);
 assert.equal(quotaDisplayStatus({
  decision:over,settings,gatewayAppliedMbps:3,gatewayPolicyRevision:over.policyRevision,
  gatewayReportedAt:new Date('2026-11-18T07:00:00Z'),now:new Date('2026-11-18T07:00:20Z')
 }),'throttled');
 assert.equal(quotaDisplayStatus({
  decision:cleared,settings,gatewayAppliedMbps:3,gatewayPolicyRevision:over.policyRevision,
  gatewayReportedAt:new Date('2026-11-18T07:00:00Z'),now:new Date('2026-11-18T07:00:20Z')
 }),'pending','Gateway must acknowledge throttle release after quota reset');
 const after=quotaDecision(settings,'2026-11-18',measured+BigInt(500),measured,reset);
 assert.equal(after.effective,BigInt(500));
 assert.equal(quotaDisplayStatus({
  decision:after,settings,gatewayAppliedMbps:null,gatewayPolicyRevision:after.policyRevision,
  gatewayReportedAt:new Date('2026-11-18T07:00:00Z'),now:new Date('2026-11-18T07:00:20Z')
 }),'normal');
});
test('monitor-only remains over quota, not falsely marked as throttled',()=>{
 const decision=quotaDecision(DEFAULT_QUOTA_SETTINGS,'2026-11-18',BigInt(3000000000),BigInt(0),null);
 assert.equal(decision.overQuota,true);
 assert.equal(decision.targetLimitMbps,null);
 assert.equal(quotaDisplayStatus({
  decision,settings:DEFAULT_QUOTA_SETTINGS,gatewayAppliedMbps:null,
  gatewayPolicyRevision:null,gatewayReportedAt:null
 }),'over_quota');
});
test('anonymous device label is stable and does not expose installation UUID',()=>{
 const before=process.env.AUTH_SECRET;
 process.env.AUTH_SECRET='ci-secret-long-enough-for-stable-pseudonyms-1234';
 try{
  const id='7a0cc63d-880f-43f2-9d61-84b7319d8510';
  const pseudonym=anonymousDeviceId(id);
  assert.equal(pseudonym.length,16);
  assert.match(pseudonym,/^[0-9a-f]{16}$/);
  assert.notEqual(pseudonym,id.slice(0,16));
  assert.equal(pseudonym,anonymousDeviceId(id));
 }finally{if(before===undefined)delete process.env.AUTH_SECRET;else process.env.AUTH_SECRET=before}
});
