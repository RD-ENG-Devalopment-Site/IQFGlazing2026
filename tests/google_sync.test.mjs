import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../ivqf_capacity_flow_simulator.html',import.meta.url),'utf8');
const line=needle=>{const found=html.split('\n').filter(l=>l.includes(needle));assert.equal(found.length,1,needle);return found[0]};
function setup(fetch,fastTimeout=false){
 const nodes=new Map(),$=id=>{if(!nodes.has(id))nodes.set(id,{textContent:'',dataset:{}});return nodes.get(id)};
 const states=[];const context=vm.createContext({$,fetch,AbortController,Date,Math,allValid:()=>true,validWorkspacePayload:()=>true,workspace:()=>({}),syncConfig:()=>({url:'https://mock.invalid',token:'fixture-only'}),sessionId:()=> 'fixture',googlePayload:()=>({workspace:{}}),setTimeout:(fn,ms)=>setTimeout(fn,fastTimeout?1:ms),clearTimeout});
 vm.runInContext([line('let lastConfirmedSync='),line('function setSyncStatus('),line('function verifiedSyncAcknowledgment('),line('async function syncGoogleNow(')].join('\n'),context);
 const original=context.setSyncStatus;context.setSyncStatus=(message,state)=>{states.push(state);original(message,state)};
 return {context,states,nodes};
}
test('no-cors opaque response is sent-but-unconfirmed, never Connected or confirmed',async()=>{
 const {context:c,states,nodes}=setup(async(_,options)=>{assert.equal(options.mode,'no-cors');return {type:'opaque',ok:false}});
 assert.equal(await c.syncGoogleNow(),false);assert.deepEqual(states,['pending','unconfirmed']);assert.equal(nodes.get('#googleSyncBadge').dataset.syncState,'unconfirmed');assert.ok(!nodes.get('#googleSyncStatus').textContent.includes('ยืนยันล่าสุด'));
});
test('mock readable acknowledgment must match request ID, accepted and written',async()=>{
 const {context:c,states}=setup(async(_,options)=>({type:'cors',ok:true,json:async()=>({requestId:JSON.parse(options.body).requestId,accepted:true,written:true})}));
 assert.equal(await c.syncGoogleNow(),true);assert.deepEqual(states,['pending','confirmed']);
 assert.equal(c.verifiedSyncAcknowledgment({type:'opaque',ok:true},{requestId:'x',accepted:true,written:true},'x'),false);
 assert.equal(c.verifiedSyncAcknowledgment({type:'cors',ok:true},{requestId:'other',accepted:true,written:true},'x'),false);
});
test('invalid token, network error and timeout mocks cannot report confirmed',async()=>{
 for(const fetch of [async()=>({type:'cors',ok:false,status:403}),async()=>{throw Error('offline')},()=>new Promise(()=>{})]){
  const {context:c,states}=setup(fetch,true);assert.equal(await c.syncGoogleNow(),false);assert.deepEqual(states,['pending','failed']);
 }
});
test('invalid workspace and missing settings do not send any request',async()=>{
 let calls=0;const {context:c,states}=setup(async()=>{calls++;return {type:'opaque'}});c.validWorkspacePayload=()=>false;assert.equal(await c.syncGoogleNow(),false);assert.equal(calls,0);assert.deepEqual(states,['failed']);
 c.syncConfig=()=>({});await c.syncGoogleNow();assert.equal(calls,0);assert.equal(states.at(-1),'unconfigured');
});
