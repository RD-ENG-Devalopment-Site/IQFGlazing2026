import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { Element, attrs } from './dom_stub.mjs';

const root = new URL('../', import.meta.url);
const html = fs.readFileSync(new URL('index.html', root), 'utf8');
const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)[1];
const settle = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function setup(hash = '', fetchMock) {
  const nodes = new Map([...html.matchAll(/<([\w-]+)\b([^>]*\bid="[^"]+"[^>]*)>/g)].map(m => {
    const a = attrs(m[2]); return [a.id, new Element(m[1], a)];
  }));
  const links = [...html.matchAll(/<a\b([^>]*data-route="[^"]+"[^>]*)>/g)].map(m => new Element('a', attrs(m[1])));
  const pending = html.split('\n').filter(l => l.includes('data-pending=')).map(line => {
    const e = new Element('span', attrs(line)); e.textContent = line.replace(/<[^>]+>/g, '').trim(); return e;
  });
  const sidebar = new Element('aside', { 'data-menu-open': 'false' });
  links.forEach(link => { link.group = new Element('details'); });
  const events = {}, documentEvents = {}, timers = new Map(), requests = [];
  let timerId = 0;
  const location = { protocol: 'https:', pathname: '/IQFGlazing2026/', search: '', hash, href: 'https://example.test/IQFGlazing2026/' + hash, replaced: [], replace(next) { this.replaced.push(next); this.href = new URL(next, this.href).href; } };
  const document = {
    getElementById: id => nodes.get(id),
    querySelector: selector => selector === '.sidebar' ? sidebar : null,
    querySelectorAll: selector => selector === '[data-route]' ? links : pending,
    addEventListener: (event, fn) => { documentEvents[event] = fn; },
  };
  const history = { pushes: [], pushState: (_, __, url) => {
    history.pushes.push(url); const next = new URL(url, location.href);
    location.hash = next.hash; location.href = next.href;
  } };
  const fetch = async (...args) => {
    requests.push(args); if (fetchMock) return fetchMock(...args);
    return { ok: true, text: async () => fs.readFileSync(new URL(args[0], root), 'utf8') };
  };
  const window = { location, addEventListener: (event, fn) => { events[event] = fn; } };
  vm.runInNewContext(script, { document, window, location, history, fetch, AbortController,
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id) });
  const click = key => links.find(l => l.dataset.route === key).listeners.click({ button: 0, preventDefault() {} });
  const complete = () => {
    const frame = nodes.get('embed-frame'), name = frame.src.split('#')[0];
    const source = fs.readFileSync(new URL(name, root), 'utf8');
    frame.contentDocument = { location: { pathname: '/IQFGlazing2026/' + name }, compatMode: 'CSS1Compat',
      documentElement: { textContent: source.replace(/<[^>]*>/g, '') },
      getElementById: id => source.includes('id="' + id + '"') ? {} : null };
    frame.onload();
  };
  return { nodes, links, events, documentEvents, location, history, requests, timers, sidebar, click, complete };
}

test('every available deep link loads the intended file/section and has correct active navigation', async () => {
  for (const key of ['order-dashboard', 'order-top5', 'order-chart', 'order-table', 'glazing-standard', 'experiment-4', 'experiment-5', 'experiment-6', 'capacity-flow']) {
    const app = setup('#' + key); await settle(); app.complete();
    assert.equal(app.nodes.get('embed-frame').hidden, false, key);
    assert.equal(app.nodes.get('embed-retry').hidden, true, key);
    assert.ok(app.links.filter(l => l.getAttribute('aria-current') === 'page').every(l => l.dataset.route === key));
    if (key === 'order-top5') assert.ok(app.nodes.get('embed-frame').src.endsWith('#monthlyTop'));
  }
});
test('manual deep link redirects to the PDF without trying to load it as HTML', async () => {
  const app = setup('#manual'); await settle();
  assert.deepEqual(app.location.replaced, ['IVQF_Capacity_Flow_Simulator_User_Manual_TH.pdf']);
  assert.equal(app.nodes.get('embed-frame').src, undefined);
});
test('click, refresh, back/forward, Home, and menu Escape execute real handlers', async () => {
  const app = setup(); app.click('experiment-4'); await settle(); app.complete();
  assert.equal(app.location.hash, '#experiment-4'); assert.equal(app.history.pushes.length, 1);
  app.location.hash = '#order-table'; app.events.popstate(); await settle(); app.complete();
  assert.ok(app.nodes.get('embed-frame').src.endsWith('#table'));
  const fresh = setup(app.location.hash); await settle(); fresh.complete();
  assert.ok(fresh.nodes.get('embed-frame').src.endsWith('#table'));
  app.nodes.get('back-home').listeners.click(); assert.equal(app.location.hash, '');
  assert.equal(app.nodes.get('workspace-main').classList.contains('is-embedded'), false);
  app.nodes.get('menu-toggle').listeners.click(); assert.equal(app.sidebar.dataset.menuOpen, 'true');
  app.documentEvents.keydown({ key: 'Escape' }); assert.equal(app.sidebar.dataset.menuOpen, 'false');
  assert.equal(app.nodes.get('menu-toggle').focused, true);
});
test('trial 6 click and refresh load the supplied report with active navigation', async () => {
  const app = setup(); app.click('experiment-6'); await settle(); app.complete();
  assert.equal(app.location.hash, '#experiment-6');
  assert.equal(app.nodes.get('embed-frame').src, 'ivqf_experiment_6_summary.html');
  assert.equal(app.nodes.get('embed-title').textContent, 'การทดลองครั้งที่ 6');
  assert.equal(app.links.find(l => l.dataset.route === 'experiment-6').getAttribute('aria-current'), 'page');
  const fresh = setup(app.location.hash); await settle(); fresh.complete();
  assert.equal(fresh.nodes.get('embed-frame').src, 'ivqf_experiment_6_summary.html');
  assert.equal(fresh.nodes.get('embed-retry').hidden, true);
});
test('pending and malformed URLs never load a fake report', async () => {
  for (const key of ['experiment-1', 'experiment-2', 'experiment-3', 'glazing-plan', 'glazing-experiment', 'unknown', '%E0%A4%A']) {
    const app = setup('#' + key); await settle();
    assert.equal(app.requests.length, 0); assert.equal(app.nodes.get('embed-frame').src, undefined);
    assert.equal(app.nodes.get('embed-frame').hidden, true);
  }
});
test('HTTP 404, wrong document, network errors and timeout show retry, never success', async () => {
  const mocks = [async () => ({ ok: false, status: 404 }), async () => ({ ok: true, text: async () => '<!doctype html><h1>404</h1>' }), async () => { throw new Error('offline'); }];
  for (const mock of mocks) {
    const app = setup('#experiment-4', mock); await settle();
    assert.equal(app.nodes.get('embed-retry').hidden, false);
    assert.equal(app.nodes.get('embed-frame').hidden, true);
    assert.ok(app.nodes.get('embed-status').textContent.includes('ไม่สำเร็จ'));
  }
  const slow = setup('#experiment-4', () => new Promise(() => {}));
  [...slow.timers.values()][0](); assert.equal(slow.nodes.get('embed-retry').hidden, false);
});
test('retry recovers and a stale response cannot replace the latest report', async () => {
  let fail = true;
  const app = setup('#experiment-4', async name => fail ? { ok: false, status: 500 } : { ok: true, text: async () => fs.readFileSync(new URL(name, root), 'utf8') });
  await settle(); fail = false; app.nodes.get('embed-retry').listeners.click(); await settle(); app.complete();
  assert.equal(app.nodes.get('embed-frame').hidden, false);
  let release;
  const stale = setup('#experiment-4', name => name.includes('_4_') ? new Promise(resolve => { release = resolve; }) : Promise.resolve({ ok: true, text: async () => fs.readFileSync(new URL(name, root), 'utf8') }));
  stale.click('experiment-5'); await settle(); stale.complete();
  release({ ok: true, text: async () => fs.readFileSync(new URL('ivqf_experiment_4_summary.html', root), 'utf8') }); await settle();
  assert.equal(stale.nodes.get('embed-frame').src, 'ivqf_experiment_5_summary.html');
});
test('responsive source has one breakpoint, auto-height mobile sidebar and a collapsed inline menu', () => {
  assert.equal((html.match(/max-width: 1000px/g) || []).length, 1);
  assert.ok(!html.includes('max-width: 920px'));
  assert.match(html, /@media \(max-width: 1000px\)[\s\S]*?height: auto/);
  assert.ok(html.includes('.sidebar[data-menu-open="false"] nav { display: none; }'));
  assert.ok(html.includes('prefers-reduced-motion: reduce'));
});
