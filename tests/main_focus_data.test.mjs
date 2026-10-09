import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const code = fs.readFileSync(new URL('../main_focus_data.js', import.meta.url), 'utf8');
const context = { window: {} };
vm.runInNewContext(code, context);
const data = context.window.IVQF_MAIN_DATA;

assert.equal(data.schema, 'ivqf-main-focus');
assert.equal(data.months.length, 12);
assert.equal(data.orderRows.length, 46);
assert.equal(data.trials.length, 3);

const totals = data.months.map((_, month) => data.orderRows.reduce((sum, row) => sum + row.months[month], 0));
const expectedTotals = [130.238,119.342,179.85824,192.95608,177.39,238.32208,213.47008,147.2,88.912,101.32,33.28,33.28];
totals.forEach((value,index)=>assert.ok(Math.abs(value-expectedTotals[index])<1e-9,`${data.months[index]} total ${value}`));
assert.ok(Math.abs(totals[9] - 101.32) < 1e-9, `October total ${totals[9]}`);
assert.ok(Math.abs(totals.reduce((sum, value) => sum + value, 0) - 1655.56848) < 1e-9);
assert.equal(data.orderRows.filter(row => row.months[9] > 0).length, 3);

for (const row of data.orderRows) {
  assert.equal(row.months.length, 12);
  assert.ok(row.months.every(value => Number.isFinite(value) && value >= 0));
  assert.ok(['name-candidate', 'alias-candidate', 'unmatched'].includes(row.productMatch.level));
}

const october = data.orderRows.filter(row => row.months[9] > 0);
assert.equal(october.length, 3, 'October legitimately has only three products with positive Order');
assert.ok(october.every(row => row.productMatch.level.endsWith('candidate')));
assert.deepEqual([...october.map(row => row.productMatch.code)].sort(), ['111117302','111117317','111117318']);

for (const trial of data.trials) {
  assert.ok(trial.groups.length > 0);
  assert.ok(trial.href.endsWith('.html'));
  assert.ok(trial.criteria);
}

const index = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
assert.ok(index.includes('<option value="5">สูงสุด 5 รายการ</option>'));
assert.ok(index.includes("shown.length===rows.length?'แสดงครบทั้งหมด'"));

console.log('main focus data: PASS');
