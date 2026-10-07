// Regression checks: executes selected real application functions in a VM.
// Does not touch localStorage on disk, use a browser/server, or make network calls.
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(base, 'ivqf_capacity_flow_simulator.html'), 'utf8');
const lines = html.split('\n');
const line = needle => {
  const found = lines.filter(x => x.includes(needle));
  assert.equal(found.length, 1, needle);
  return found[0];
};
const func = name => {
  const start = lines.findIndex(l => l.includes('function ' + name + '('));
  assert.ok(start >= 0, name);
  let end = start + 1;
  while (end < lines.length && !/^  (function |const |try\{|p\(|\[|document\.)/.test(lines[end])) end++;
  return lines.slice(start, end).join('\n');
};
const nodes = new Map();
const node = id => {
  if (!nodes.has(id)) nodes.set(id, {value:'', checked:false, style:{}, dataset:{}, max:10000,
    classList:{toggle(){}}, querySelector(){return {textContent:''}}});
  return nodes.get(id);
};
const timers = [];
let sequence = 0;
let restoreListener;
const context = vm.createContext({
  console,
  document:{dispatchEvent(e){if(e.type === 'ivqf:packaging-restore') vm.runInContext(restoreListener, context)(e)}},
  CustomEvent:class{constructor(type, options){this.type=type;this.detail=options?.detail}},
  el:node, p:node, localStorage:{setItem(){}},
  setTimeout(fn,ms){timers.push({id:++sequence,fn,ms});return sequence},
  clearTimeout(id){const x=timers.find(x=>x.id===id);if(x)x.cancelled=true},
  renderAll(){}, renderScenarios(){}, savePalletState(){},
  format:x=>String(x), compact:x=>String(x),
  displayCapacity:(x,k)=>({kg:String(x),boxes:String(x/k)}),
  renderPackagingSummary(){}, deriveNextId:()=>1,
  window:{__ivqf:{}}, fmt:x=>String(x),
});
const item={code:'111117309',product:'P',part:'BLK',palletCartons:32,kgPerCarton:10,cartonsPerHour:55.2,cycleSort:10};
vm.runInContext(`
let stations=[],feedRates={},feedMax={},autoMode='safe',nextId=1,validatedSettings={},scenarioA=null;
const num=(v,f=0)=>Number.isFinite(Number(v))?Number(v):f;
let suppress=false,restoringPallet=false,packagingOverrides={},lastPayload=null,linkTimer=null;
const fields=['palletCode','palletProduct','palletPart','palletCycle','palletCap','palletKg','palletSpeed','palletRateBasis','palletElapsed','palletChangeLoss'];
const PALLET_DATA=${JSON.stringify([item])},FIXED_PALLET_CODE='111117309';
` + [line('function settings(){'), line('function syncFeedMode(){'),
  line('function loadSnapshot(snap){'),line('function snapshot(){'),line('function validModelPayload('),
  line('function applyPalletTransfer('),line('function validPalletPayload('),func('restorePalletState'),func('palletState'),func('inferredPackaging'),line('function packagingRecord('),
  func('loadPackaging'),func('setItem'),func('applyToLine'),func('calculate')].join('\n') + `
window.__ivqf.validateModel=validModelPayload;
window.__ivqf.applyPalletTransfer=applyPalletTransfer;
`,context);
restoreListener='event=>'+line("document.addEventListener('ivqf:packaging-restore'").match(/,event=>(.*)\);/)[1];
for(const [id,val] of Object.entries({packagingItem:item.code,productName:'P',packWeight:500,
  bagsPerCarton:20,cartonsPerPallet:32,packagingSource:'standard',targetInput:700,bufferInput:10,
  baselineMp:19,trayWeight:5,feedMode:'arrange',palletRateBasis:'line',palletChangeLoss:5}))node(id).value=String(val);
node('palletAutoLink').checked=true;
const settings={productCode:item.code,product:'P',packG:500,bagsPerCarton:20,cartonsPerPallet:32,
  packagingSource:'standard',target:700,buffer:10,baseline:19,feedMode:'arrange',trayWeight:5};
const savedRate=700*10/10.5;
const scenario={settings,stations:[{id:'pallet-capacity',name:'Pallet',people:0,minPeople:0,maxPeople:0,
  teamSize:1,rate:savedRate,maxRate:1000,unit:'kg',include:true,lockAuto:true,source:'Target',
  integration:{type:'pallet-capacity',palletChangeLossMinutes:.5}}]};
assert.equal(context.validModelPayload(scenario),true);
context.loadSnapshot(scenario);
assert.equal(vm.runInContext('stations[0].rate',context),savedRate);
while(timers.length){const x=timers.shift();if(!x.cancelled)x.fn()}
const actualRate=vm.runInContext('stations[0].rate',context);
assert.equal(actualRate,savedRate);
assert.equal(vm.runInContext('stations[0].integration.palletChangeLossMinutes',context),.5);
assert.equal(node('palletAutoLink').checked,false);
console.log('PASS legacy Scenario Load preserves saved pallet capacity and pauses auto-link:',{savedRate,actualRate,savedLoss:.5,actualLoss:5});

const ordinary={id:'x',name:'X',people:1,minPeople:1,maxPeople:8,teamSize:1,rate:200,maxRate:500,
  unit:'kg',include:true,lockAuto:false,source:'Actual'};
const sixty=Array.from({length:60},(_,i)=>({...ordinary,id:'x'+i}));
context.sixty=sixty;
vm.runInContext('stations=sixty;',context);
assert.equal(context.validModelPayload({settings,stations:sixty}),true);
const transfer={schema:'ivqf-pallet-capacity',version:1,capacityKgHr:700,targetSpeedCartonsHr:70,
  kgPerCarton:10,palletCapacityBoxes:32,calculationMinutes:10,fullPalletMinutes:34,
  scenarioFullPalletMinutes:27,palletChangeLossMinutes:0};
assert.equal(context.applyPalletTransfer(transfer,{live:true}),false);
assert.equal(vm.runInContext('stations.length',context),60);
assert.equal(context.validModelPayload({settings,stations:vm.runInContext('stations',context)}),true);
console.log('PASS live pallet transfer rejects station 61 without changing the model.');

node('palletAutoLink').checked=true;
const pallet={item:item.code,auto:true,values:{palletCycle:'10',palletElapsed:'10',palletChangeLoss:'.5',palletCap:'32',palletKg:'10',palletSpeed:'55.2',palletRateBasis:'line'},packagingMaster:{}};
const modern={...scenario,pallet};
assert.equal(context.validModelPayload(modern),true);
assert.equal(context.loadSnapshot(modern),true);
while(timers.length){const x=timers.shift();if(!x.cancelled)x.fn()}
assert.equal(vm.runInContext('stations[0].rate',context),savedRate);
assert.equal(Number(node('palletChangeLoss').value),.5);
assert.equal(node('palletAutoLink').checked,true);
assert.equal(context.validModelPayload({...modern,pallet:{...pallet,values:{...pallet.values,palletElapsed:'bad'}}}),false);
console.log('PASS modern Scenario restores calculator controls without overwriting saved stations.');
// Startup render must not turn saved Actual evidence into Target merely on opening.
vm.runInContext("stations[0].source='Actual';", context);
context.calculate(); // Pending auto-link from an earlier edit must also be cancelled.
context.restorePalletState(pallet);
const restoredStartup = line('}else{restoringPallet=true;try{calculate()}finally{restoringPallet=false}}');
vm.runInContext(restoredStartup.slice(restoredStartup.indexOf('else') + 4), context);
while(timers.length){const x=timers.shift();if(!x.cancelled)x.fn()}
assert.equal(vm.runInContext('stations[0].source', context), 'Actual');
assert.equal(vm.runInContext('stations[0].rate', context), savedRate);
// A new intentional edit is allowed to apply a planning Target again.
context.calculate();
while(timers.length){const x=timers.shift();if(!x.cancelled)x.fn()}
assert.equal(vm.runInContext('stations[0].source', context), 'Target');
console.log('PASS startup preserves Actual metadata; a subsequent calculator edit still applies Target.');
assert.ok(!line("['resetBtn']").includes('loadA'));
for(const filename of ['ivqf_capacity_flow_simulator.html','line_balancing_simulator.html']){
  const source=fs.readFileSync(path.join(base,filename),'utf8');
  const pick=needle=>source.split('\n').find(x=>x.includes(needle));
  const c=vm.createContext({});
  vm.runInContext([pick('const packKg='),pick('function rateKgPerTeam('),pick('function stationCalc(st,'),
    pick('function stationCalcWith('),pick('function validModelPayload(')].join('\n'),c);
  const traySettings={...settings,trayWeight:.001,feedMode:'tray'},feed={...ordinary,id:'feed',rate:1000,maxRate:1000};
  assert.equal(c.validModelPayload({settings:traySettings,stations:[feed]}),true);
  assert.equal(c.stationCalc(feed,traySettings).kg,1);
  assert.equal(c.stationCalcWith(feed,traySettings).kg,1);
  console.log('PASS',filename,'trayWeight .001 produces matching live and scenario results.');
}
console.log('VM checks complete. Workspace apply() wrappers and real browser rendering are NOT covered by this test file.');
