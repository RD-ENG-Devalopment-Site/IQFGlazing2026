import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Element, attrs } from './dom_stub.mjs';
const html = fs.readFileSync(new URL('../Order2026_Restored.html', import.meta.url), 'utf8');
function setup() {
  const nodes = new Map([...html.matchAll(/<([\w-]+)\b([^>]*\bid="[^"]+"[^>]*)>/g)].map(m => { const a = attrs(m[2]); return [a.id, new Element(m[1], a)]; }));
  const document = { getElementById: id => nodes.get(id), querySelectorAll: selector => {
    if (selector === '[data-summary-type]') return nodes.get('summary').querySelectorAll(selector);
    if (selector === '[data-month]') return nodes.get('monthTabs').querySelectorAll(selector);
    return [];
  } };
  const context = vm.createContext({ document, Date });
  vm.runInContext(html.match(/<script>([\s\S]*?)<\/script>/)[1] + '\n globalThis.order = {rows,filtered,monthlyTop,render,renderMonthlyTop,setMonth:i=>{activeMonth=i}};', context);
  return { nodes, core: context.order };
}
test('source data retains 54 rows and the original 1655.56848 MT total', () => {
  const { core } = setup(); assert.equal(core.rows.length, 54);
  assert.ok(Math.abs(core.rows.reduce((s, r) => s + r.total, 0) - 1655.56848) < 1e-8);
});
test('Top5, monthly totals and rendered context use the same filters across all types and 12 months', () => {
  const { nodes, core } = setup();
  for (const type of ['', 'ivqf', 'marinade', 'ytr']) for (let month = 0; month < 12; month++) {
    nodes.get('typeFilter').value = type; core.setMonth(month); core.render();
    const data = core.filtered(), top = core.monthlyTop();
    const names = new Set(data.filter(r => r.m[month] > 0).map(r => r.type + '|' + r.name));
    assert.equal(top.length, Math.min(5, names.size));
    assert.ok(top.every(item => !type || item.type === type));
    assert.ok(top.every(item => names.has(item.type + '|' + item.name)));
    assert.ok(top.every((item, i) => i === 0 || top[i - 1].value >= item.value));
    assert.ok(nodes.get('monthlyTopInfo').textContent.includes('ยอด Order รวม'));
    assert.ok(!nodes.get('monthlyTopList').innerHTML.includes('NaN'));
  }
});
test('category/product filters, empty results, summary selection and reset execute actual handlers', () => {
  const { nodes, core } = setup();
  nodes.get('categoryFilter').value = '01 BL'; nodes.get('productFilter').value = core.rows[0].name; core.render();
  assert.ok(core.filtered().every(r => r.category === '01 BL' && r.name === core.rows[0].name));
  nodes.get('productFilter').value = 'no matching product'; core.render();
  assert.equal(core.filtered().length, 0); assert.equal(core.monthlyTop().length, 0);
  assert.ok(nodes.get('monthlyTopList').innerHTML.includes('ไม่มียอด Order'));
  nodes.get('typeFilter').value = 'ytr';
  const ivqf = nodes.get('summary').children.find(b => b.dataset.summaryType === 'ivqf');
  assert.equal(ivqf.tagName, 'BUTTON'); ivqf.onclick();
  assert.equal(nodes.get('typeFilter').value, 'ivqf'); assert.ok(core.filtered().every(r => r.type === 'ivqf'));
  nodes.get('categoryFilter').value = '01 BL'; nodes.get('reset').onclick();
  assert.equal(nodes.get('categoryFilter').value, ''); assert.equal(nodes.get('productFilter').value, '');
  assert.equal(core.filtered().length, 54);
});
test('month buttons use native pressed-button semantics and labels are explicitly associated', () => {
  const { nodes } = setup();
  for (const id of ['typeFilter', 'categoryFilter', 'productFilter']) assert.ok(html.includes('for="' + id + '"'));
  const button = nodes.get('monthTabs').children[0]; assert.equal(button.tagName, 'BUTTON');
  assert.equal(button.getAttribute('role'), null); button.onclick();
  assert.equal(nodes.get('monthTabs').children[0].getAttribute('aria-pressed'), 'true');
  assert.equal(nodes.get('monthTabs').children[0].focused, true);
});
