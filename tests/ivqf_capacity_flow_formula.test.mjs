import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const htmlPath = new URL('../ivqf_capacity_flow_simulator.html', import.meta.url);
const html = fs.readFileSync(htmlPath, 'utf8');

const extractArrowFunction = (name, dependencies = {}) => {
  const line = html.split(/\r?\n/).find((candidate) => candidate.trimStart().startsWith(`const ${name}=`));
  assert.ok(line, `Expected ${name} in the application source`);
  const expression = line.trim().slice(`const ${name}=`.length).replace(/;$/, '');
  return new Function(...Object.keys(dependencies), `return (${expression})`)(...Object.values(dependencies));
};

const appPackKg = (settings) => settings.packG / 1000;
const appPackagingMetrics = extractArrowFunction('packagingMetrics', {
  settings: () => ({ packG: 500, bagsPerCarton: 20, cartonsPerPallet: 32 }),
  packKg: appPackKg,
});
const appPaceFromCapacity = extractArrowFunction('paceFromCapacity', {
  settings: () => ({ packG: 500 }),
  packKg: appPackKg,
});

const packaging = ({ packG, bagsPerCarton, cartonsPerPallet }) => {
  const kgBag = packG / 1000;
  const kgCarton = kgBag * bagsPerCarton;
  return { kgBag, kgCarton, kgPallet: kgCarton * cartonsPerPallet };
};

const pace = ({ capacityKgHr, packG }) => {
  const bagsHr = capacityKgHr / (packG / 1000);
  return { bagsHr, bagsMin: bagsHr / 60, secPerBag: 3600 / bagsHr };
};

const palletScenario = ({ capacityKgHr, kgPerCarton, cartonsPerPallet, releaseMinutes, changeLossMinutes = 0 }) => {
  const cartonsHr = capacityKgHr / kgPerCarton;
  const exactCartons = Math.min(cartonsPerPallet, cartonsHr * releaseMinutes / 60);
  const completedCartons = Math.floor(exactCartons + 1e-9);
  return {
    fullPalletMinutes: cartonsPerPallet / cartonsHr * 60,
    exactCartons,
    completedCartons,
    completedWeightKg: completedCartons * kgPerCarton,
    theoreticalWeightKg: exactCartons * kgPerCarton,
    effectiveCapacityKgHr: capacityKgHr * releaseMinutes / (releaseMinutes + changeLossMinutes),
  };
};

test('all inline scripts compile and HTML ids are unique', () => {
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.equal(scripts.length, 3);
  scripts.forEach((script) => assert.doesNotThrow(() => new Function(script)));

  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], []);
});

test('Product Packaging Master derives kg per bag, carton and pallet', () => {
  const input = { packG: 500, bagsPerCarton: 20, cartonsPerPallet: 32 };
  assert.deepEqual(packaging(input), {
    kgBag: 0.5,
    kgCarton: 10,
    kgPallet: 320,
  });
  assert.deepEqual(appPackagingMetrics(input), {
    kgBag: 0.5,
    kgCarton: 10,
    kgPallet: 320,
  });
});

test('840 kg/hr at 500 g per bag equals 28 bags/min and 2.14 sec/bag', () => {
  const result = pace({ capacityKgHr: 840, packG: 500 });
  const applicationResult = appPaceFromCapacity(840, { packG: 500 });
  assert.equal(result.bagsHr, 1680);
  assert.equal(result.bagsMin, 28);
  assert.ok(Math.abs(result.secPerBag - 2.1428571429) < 1e-9);
  assert.equal(applicationResult.bagHr, 1680);
  assert.equal(applicationResult.bagMin, 28);
  assert.ok(Math.abs(applicationResult.secPerBag - 2.1428571429) < 1e-9);
});

test('safe target pace conversion remains dimensionally consistent', () => {
  const result = pace({ capacityKgHr: 770, packG: 500 });
  assert.ok(Math.abs(result.bagsMin - 25.6666666667) < 1e-9);
  assert.ok(Math.abs(result.secPerBag - 2.3376623377) < 1e-9);
});

test('111117309 baseline and 10-minute release calculations are correct', () => {
  const baseline = palletScenario({ capacityKgHr: 552, kgPerCarton: 10, cartonsPerPallet: 32, releaseMinutes: 10 });
  assert.ok(Math.abs(baseline.fullPalletMinutes - 34.7826086957) < 1e-9);

  const target = palletScenario({ capacityKgHr: 700, kgPerCarton: 10, cartonsPerPallet: 32, releaseMinutes: 10 });
  assert.ok(Math.abs(target.exactCartons - 11.6666666667) < 1e-9);
  assert.equal(target.completedCartons, 11);
  assert.equal(target.completedWeightKg, 110);
  assert.ok(Math.abs(target.theoreticalWeightKg - 116.6666666667) < 1e-9);
  assert.equal(target.effectiveCapacityKgHr, 700);
});

test('pallet change loss reduces effective capacity without changing rated capacity', () => {
  const result = palletScenario({ capacityKgHr: 700, kgPerCarton: 10, cartonsPerPallet: 32, releaseMinutes: 10, changeLossMinutes: 0.5 });
  assert.ok(Math.abs(result.effectiveCapacityKgHr - 666.6666666667) < 1e-9);
});

test('new master and pace fields are wired into the web app', () => {
  for (const id of ['packagingItem', 'packWeight', 'bagsPerCarton', 'cartonsPerPallet', 'packagingSource', 'derivedKgCarton', 'derivedKgPallet']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /paceFromCapacity/);
  assert.match(html, /data-auto-bag-min/);
  assert.match(html, /data-auto-sec-bag/);
  assert.match(html, /schemaVersion:VER/);
  assert.match(html, /VER=4/);
});
