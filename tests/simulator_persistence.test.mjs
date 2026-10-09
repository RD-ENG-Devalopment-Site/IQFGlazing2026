import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const files=['ivqf_capacity_flow_simulator.html','line_balancing_simulator.html'];
export function fixture(){return {settings:{product:'Fixture',productCode:'test',packG:500,bagsPerCarton:20,cartonsPerPallet:32,packagingSource:'standard',target:3000,buffer:10,baseline:19,feedMode:'arrange',trayWeight:5},stations:[{id:'feed',name:'Feed',people:4,minPeople:1,maxPeople:8,teamSize:1,rate:200,maxRate:500,include:true,lockAuto:false,unit:'kg',source:'Actual'}],autoMode:'safe',nextId:1,feedRates:{arrange:200,tray:35},feedMax:{arrange:500,tray:100}}}
export function line(html,needle){const found=html.split('\n').filter(l=>l.includes(needle));assert.equal(found.length,1,needle);return found[0]}
export function validationSource(html){return ['function validModelPayload(','function validLegacyPayload(','function validPalletPayload(','function validWorkspacePayload(','function migrateWorkspace('].map(n=>line(html,n)).join('\n')}
for(const file of files){
 const html=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8');
 const versionMatch=html.match(/\bVER=(\d+)\b/);assert.ok(versionMatch,`${file}: schema version`);const schemaVersion=Number(versionMatch[1]);
 function setup(){
  const initial=fixture(),nodes=new Map(),handlers=new Map(),exports=[]; const mapping={productName:'product',packWeight:'packG',targetInput:'target',bufferInput:'buffer',baselineMp:'baseline',feedMode:'feedMode',trayWeight:'trayWeight',packagingItem:'productCode',bagsPerCarton:'bagsPerCarton',cartonsPerPallet:'cartonsPerPallet',packagingSource:'packagingSource'};
  const el=id=>{if(!nodes.has(id))nodes.set(id,{value:String(initial.settings[mapping[id]]??''),max:'10000',type:'text',dispatchEvent(){},click(){},addEventListener:(type,fn)=>handlers.set(id+':'+type,fn)});return nodes.get(id)};
  const storage=new Map(),localStorage={getItem:k=>storage.get(k)??null,setItem:(k,v)=>storage.set(k,v)};
  const context=vm.createContext({el,$:s=>el(s.slice(1)),localStorage,structuredClone:globalThis.structuredClone,document:{dispatchEvent(){},createElement:()=>({click(){}})},Blob:class{constructor(parts){exports.push(parts.join(''))}},URL:{createObjectURL:()=> 'blob:fixture',revokeObjectURL(){}},Event:class{},CustomEvent:class{},window:{__ivqf:{}},allValid:()=>true,say:()=>{},syncFeedMode:()=>{},renderAll:()=>{},deriveNextId:()=>1,queueGoogleSync:()=>{},setTimeout:fn=>{fn();return 0},clearTimeout,Intl,Date,form:()=>({productName:'Fixture'}),normalizeEvidenceStore:x=>x,askConfirm:async()=>true,remember(){},evidence(){},readiness(){}});
  const source=`const K='workspace',VER=${schemaVersion};let storageOK=true,restoring=false,timer,stations=${JSON.stringify(initial.stations)},validatedSettings=${JSON.stringify(initial.settings)},feedRates={},feedMax={},autoMode='safe',nextId=1,evidenceStore={},scenarioA=null,scenarioB=null;\n`+
   ['function settings(','const packKg=','function rateKgPerTeam(','function stationCalc(st,','function recommend(','function snapshot(){','function recommendedSnapshot(','function applyRecommendation(','function addStation(){','function loadSnapshot(snap){','function workspace(){','function storeWorkspaceSafely(','function writeWorkspace('].map(n=>line(html,n)).join('\n')+'\n'+validationSource(html)+
   '\nwindow.__ivqf={validateModel:validModelPayload,loadSnapshot,renderAll,renderScenarios(){},renderSummary(){},get snapshot(){return snapshot()},get scenarioA(){return scenarioA},set scenarioA(v){scenarioA=v},get scenarioB(){return scenarioB},set scenarioB(v){scenarioB=v}};function setScenarios(a,b){scenarioA=a;scenarioB=b}function setEvidence(v){evidenceStore=v}let apply=()=>false;\n'+
   line(html,'const applyOld=apply;apply=w=>')+'\n'+line(html,'const applyModel=apply;')+'\n'+line(html,'apply=w=>{if(!validWorkspacePayload')+'\n'+line(html,"$('#exportBtn').addEventListener")+'\n'+line(html,"$('#importFile').addEventListener");
  vm.runInContext(source,context);return {context,storage,localStorage,handlers,exports};
 }
 test(file+': actual Apply expands maxPeople to 17, Save/Reload and JSON roundtrip stay valid',()=>{
  const {context:c,storage}=setup();assert.equal(c.applyRecommendation(),true);
  let snap=c.snapshot();assert.equal(snap.stations[0].people,17);assert.equal(snap.stations[0].maxPeople,17);assert.equal(c.validModelPayload(snap),true);
  const a=JSON.parse(JSON.stringify(snap)),b=JSON.parse(JSON.stringify(snap));a.evidence={feed:{owner:'Fixture'}};b.trial={status:'passed'};c.setScenarios(a,b);
  assert.equal(c.writeWorkspace(),true);const saved=JSON.parse(storage.get('workspace'));assert.equal(c.validWorkspacePayload(saved),true);
  c.loadSnapshot(fixture());c.loadSnapshot(saved.model);assert.equal(c.snapshot().stations[0].people,17);assert.deepEqual(saved.scenarioA.evidence,a.evidence);assert.deepEqual(saved.scenarioB.trial,b.trial);
  assert.equal(c.validWorkspacePayload(JSON.parse(JSON.stringify(saved))),true);
 });
 test(file+': actual Export and Import handlers retain model, evidence and A/B; reject malformed/newer/oversize files',async()=>{
  const {context:c,handlers,exports}=setup();c.applyRecommendation();const snap=JSON.parse(JSON.stringify(c.snapshot()));snap.evidence={feed:{owner:'Fixture'}};snap.trial={status:'passed'};c.setScenarios(snap,snap);c.setEvidence(snap.evidence);
  handlers.get('exportBtn:click')();const saved=exports[0];c.loadSnapshot(fixture());c.setScenarios(null,null);c.setEvidence({});
  const importFile=async(text,size=text.length)=>handlers.get('importFile:change')({target:{files:[{size,text:async()=>text}],value:'fixture'}});
  await importFile(saved);assert.equal(c.snapshot().stations[0].people,17);assert.deepEqual(JSON.parse(JSON.stringify(c.workspace().evidence)),snap.evidence);assert.equal(c.workspace().scenarioA.trial.status,'passed');assert.equal(c.workspace().scenarioB.stations[0].maxPeople,17);
  const stable=()=>{const state=c.workspace();delete state.savedAt;return JSON.stringify(state)};
  const before=stable();for(const text of ['{broken',JSON.stringify({...JSON.parse(saved),schemaVersion:99})]){await importFile(text);assert.equal(stable(),before)}
  await importFile(saved,500001);assert.equal(stable(),before);
 });
 test(file+': locked/excluded, zero rate and complete teams use actual recommendation code',()=>{
  const {context:c}=setup();for(const key of ['lockAuto','include']){const x=fixture();x.stations[0][key]=key==='lockAuto';assert.equal(c.recommendedSnapshot(x).stations[0].people,4)}
  const x=fixture();x.stations[0].rate=0;assert.equal(c.recommendedSnapshot(x).stations[0].people,4);x.stations[0].rate=200;x.stations[0].teamSize=2;assert.equal(c.recommendedSnapshot(x).stations[0].people,34);
 });
 test(file+': station limit rejects the 61st addition without losing the valid workspace',()=>{
  const {context:c}=setup();for(let i=1;i<60;i++)assert.equal(c.addStation(),true);
  const before=JSON.stringify(c.snapshot());assert.equal(c.addStation(),false);assert.equal(JSON.stringify(c.snapshot()),before);assert.equal(c.validModelPayload(c.snapshot()),true);
 });
 test(file+': invalid actions and newer/corrupt storage never overwrite original payload',()=>{
  const {context:c,storage}=setup(),before=JSON.stringify(c.snapshot());const bad=fixture();bad.stations[0].people=-1;c.loadSnapshot(bad);assert.equal(JSON.stringify(c.snapshot()),before);
  for(const value of [null,'',NaN,Infinity,-1]){const x=fixture();x.stations[0].rate=value;assert.equal(c.validModelPayload(x),false)}
  const duplicate=fixture();duplicate.stations.push({...duplicate.stations[0]});assert.equal(c.validModelPayload(duplicate),false);
  storage.set('workspace','{corrupt');assert.equal(c.writeWorkspace(),false);assert.equal(storage.get('workspace'),'{corrupt');
  const other=setup();const raw=JSON.stringify({schemaVersion:99,workspace:{},model:fixture()});other.storage.set('workspace',raw);assert.equal(other.context.writeWorkspace(),false);assert.equal(other.storage.get('workspace'),raw);
 });
 test(file+': migration retains byte-for-byte backup, including quota/write failure',()=>{
  const {context:c,storage,localStorage}=setup();const raw=JSON.stringify({schemaVersion:1,workspace:{},model:fixture()});storage.set('workspace',raw);
  assert.equal(c.writeWorkspace(),true);assert.ok([...storage].some(([k,v])=>k.startsWith('workspace.backup.schema1.')&&v===raw));
  const other=setup();other.storage.set('workspace',raw);other.localStorage.setItem=()=>{throw Error('quota')};assert.equal(other.context.writeWorkspace(),false);assert.equal(other.storage.get('workspace'),raw);
  // An already-open v3 tab must re-check storage after another tab has written v4.
  if(file.startsWith('line_')){const old=setup();old.storage.set('workspace',JSON.stringify({schemaVersion:4,workspace:{},model:fixture()}));assert.equal(old.context.writeWorkspace(),false)}
 });
}
