import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const html = fs.readFileSync(new URL('../ivqf_capacity_flow_simulator.html', import.meta.url), 'utf8');
function implementationLine(needle) {
  const found = html.split('\n').filter(line => line.includes(needle));
  assert.equal(found.length, 1, `Expected one implementation line: ${needle}`);
  return found[0];
}
function station(id, people, rate, teamSize = 1) {
  return { id, name: id, people, minPeople: 1, maxPeople: 8, teamSize, rate, maxRate: 1000,
    unit: 'kg', include: true, lockAuto: false, source: 'Actual' };
}
function fixture() {
  const stations = [station('feed', 4, 200), station('bag', 6, 340, 2)];
  return {
    settings: { product: 'Test', packG: 500, bagsPerCarton: 20, cartonsPerPallet: 32,
      packagingSource: 'standard', target: 700, buffer: 10, baseline: 19, feedMode: 'arrange', trayWeight: 5 },
    stations, autoMode: 'safe', nextId: 1,
    evidence: Object.fromEntries(stations.map(st => [st.id, { basis: 'time-study', date: '2026-10-06', sample: 10, owner: 'Fixture' }])),
    trial: { status: 'passed', testedDate: '2026-10-06', approvedBy: 'Fixture', checks: { wip: true, delays: true, breaks: true, ergonomics: true } },
  };
}
function setup() {
  const current = fixture(); current.settings.target = 3000;
  const window = { __ivqf: { snapshot: current, stations: current.stations } };
  const context = vm.createContext({ window, allValid: () => true, evidenceComplete: () => false, trialState: () => ({}) });
  const source = [
    implementationLine('const packKg='), implementationLine('function rateKgPerTeam('),
    implementationLine('function stationCalc(st,'), implementationLine('function recommend('),
    implementationLine('function validModelPayload('), implementationLine('function snapshotMetrics('),
    implementationLine('function scenarioLog('), implementationLine('function decisionState(scenario='),
    implementationLine('const governanceDecisionState='), implementationLine('function capacityDecisionState('),
    implementationLine('decisionState=scenario=>'),
    'window.__ivqf.stationCapacity=(st,s)=>stationCalc(st,s).kg; window.__ivqf.decisionState=decisionState;',
  ].join('\n');
  vm.runInContext(source, context);
  return context;
}
test('saved A/B status is evaluated from its own capacity, evidence and Trial snapshot', () => {
  const core = setup(), a = fixture(), b = fixture(); a.stations[0].source = 'Assumption';
  assert.equal(core.scenarioLog('scenarioA', a).decisionStatus, 'ใช้เพื่อวางแผน');
  assert.equal(core.scenarioLog('scenarioB', b).decisionStatus, 'พร้อมทบทวน');
  assert.equal(core.decisionState().badge, 'Capacity not ready');
  b.trial.status = 'failed'; assert.equal(core.scenarioLog('scenarioB', b).decisionStatus, 'Trial ไม่ผ่าน');
  b.evidence = {}; assert.equal(core.scenarioLog('scenarioB', b).decisionStatus, 'หลักฐานไม่ครบ');
});
test('Scenario JSON roundtrip retains its governance and does not borrow current metadata', () => {
  const core = setup(), saved = fixture();
  const restored = JSON.parse(JSON.stringify(saved));
  assert.equal(core.validModelPayload(restored), true);
  assert.equal(core.scenarioLog('scenarioA', restored).decisionStatus, 'พร้อมทบทวน');
  delete restored.trial; assert.equal(core.scenarioLog('scenarioA', restored).decisionStatus, 'ต้องทำ Trial');
});
test('invalid saved data, duplicate IDs and impossible targets are rejected by the actual validator', () => {
  const core = setup();
  for (const target of [0, -100, NaN, Infinity]) {
    const snap = fixture(); snap.settings.target = target;
    assert.equal(core.validModelPayload(snap), false);
    assert.equal(core.decisionState(snap).key, 'invalid');
  }
  const duplicate = fixture(); duplicate.stations[1].id = duplicate.stations[0].id;
  assert.equal(core.validModelPayload(duplicate), false);
});
test('actual station implementation preserves Feed 800 and Bag 1020 kg/hr', () => {
  const core = setup(), snap = fixture();
  assert.equal(core.stationCalc(snap.stations[0], snap.settings).kg, 800);
  assert.equal(core.stationCalc(snap.stations[1], snap.settings).kg, 1020);
  snap.stations[0].include = false;
  assert.equal(core.recommend(snap.stations[0], snap.settings, 'safe').locked, true);
  snap.stations[1].lockAuto = true;
  assert.equal(core.recommend(snap.stations[1], snap.settings, 'safe').people, 6);
});
test('policy fixture: actual recommendation requires 17 people at target 3000 with 10% buffer', () => {
  const core = setup(), snap = fixture(); snap.settings.target = 3000;
  const result = core.recommend(snap.stations[0], snap.settings, 'safe');
  assert.equal(result.people, 17); assert.equal(snap.stations[0].maxPeople, 8);
  assert.equal(core.validModelPayload(snap), true);
  // This checks the unresolved input, not an Apply/Save/Reload acceptance claim.
});
