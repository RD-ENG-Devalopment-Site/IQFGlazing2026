import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const root = fileURLToPath(new URL('../', import.meta.url));
const pages = [
  'index.html', 'Order2026_Restored.html', 'order_ivqf_dashboard_2026_corrected.html',
  'ivqf_experiment_4_summary.html', 'ivqf_experiment_5_summary.html', 'ivqf_experiment_6_summary.html',
  'ivqf_capacity_flow_simulator.html', 'line_balancing_simulator.html',
  'line_balancing_simulator_manual.html',
];
const assets = new Map([
  ['ivqf_report_assets/image1.png', '8a38d88b969164d0e63b6939b06a3da1b7701b08fa8072ac46e4f79a76b2f344'],
  ['ivqf_report_assets/image14.png', '14e3889989c548d56267c70b564d800488077efb3806d66d71005a6ffe799827'],
  ['ivqf_report_assets/image1.webp', '00d54585d3f1e62d231639f5b52efac4c7d4c84a142c77a65d59bbdb531d95a0'],
  ['ivqf_report_assets/image14.webp', '869b6e81f13b5d36887be7db0fe5844b2b701c257e95ba959921e972dfcc9016'],
]);
const support = new Set(['main_focus_data.js', 'IVQF_Capacity_Flow_Simulator_User_Manual_TH.pdf']);
const candidate = new Set([...pages, ...assets.keys(), ...support]);
const documents = new Map(pages.map(name => [name, fs.readFileSync(path.join(root, name), 'utf8')]));
// Use exact Git/filesystem inventory strings, never Windows existsSync for filename case.
const inventory = new Set(execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'],
  { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean));

function attributes(source) {
  const result = {};
  const pattern = /([^\s=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  for (const match of source.matchAll(pattern)) {
    result[match[1].toLowerCase()] = (match[2] ?? match[3] ?? match[4] ?? '').replace(/&amp;/g, '&');
  }
  return result;
}

function markup(source) {
  return source.replace(/<!--[\s\S]*?-->/g, '').replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1</script>');
}

function tags(source) {
  return [...markup(source).matchAll(/<([a-z][\w:-]*)\b([^>]*?)>/gi)]
    .map(match => ({ name: match[1].toLowerCase(), attrs: attributes(match[2]) }));
}

function documentErrors(source) {
  const errors = [];
  if (!/^\uFEFF?<!doctype html>/i.test(source)) errors.push('DOCTYPE must be first');
  if (/(?:^|\n)\s*(?:Exit code:|Wall time:|Output:)/m.test(source)) errors.push('terminal output');
  if (source.includes('\uFFFD')) errors.push('replacement character');
  return errors;
}

function references(source) {
  const result = [];
  for (const { attrs } of tags(source)) {
    for (const key of ['href', 'src', 'poster', 'xlink:href']) if (attrs[key]) result.push(attrs[key]);
    if (attrs.srcset) result.push(...attrs.srcset.split(',').map(item => item.trim().split(/\s+/)[0]));
  }
  // Current pages use inline CSS; include CSS resources as well as HTML attributes.
  for (const css of markup(source).matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    for (const match of css[1].matchAll(/url\(\s*['"]?([^'"\s)]+)['"]?\s*\)/gi)) result.push(match[1]);
  }
  return result;
}

function referenceErrors(name, source, files, docs) {
  const errors = [];
  for (const reference of references(source)) {
    if (/^(?:https?:|data:|mailto:|tel:|blob:|\/\/)/i.test(reference)) continue;
    if (/^[a-z][a-z\d+.-]*:/i.test(reference) || reference.startsWith('/') || reference.includes('\\')) {
      errors.push(`not a portable relative URL: ${reference}`); continue;
    }
    const [urlPath, ...fragmentParts] = reference.split('#');
    let destination, fragment;
    try {
      destination = urlPath ? path.posix.normalize(path.posix.join(path.posix.dirname(name), decodeURIComponent(urlPath.split('?')[0]))) : name;
      fragment = decodeURIComponent(fragmentParts.join('#'));
    } catch { errors.push(`invalid URL encoding: ${reference}`); continue; }
    if (!files.has(destination)) { errors.push(`missing or wrong-case path: ${destination}`); continue; }
    if (fragment && docs.has(destination)) {
      const destinationTags = tags(docs.get(destination));
      const targets = new Set(destinationTags.flatMap(tag => [tag.attrs.id, tag.attrs['data-route']]).filter(Boolean));
      if (!targets.has(fragment)) errors.push(`missing fragment: ${destination}#${fragment}`);
    }
  }
  return errors;
}

test('candidate files exist in exact-case Git inventory; no conditional reports are included', () => {
  for (const name of candidate) {
    assert.ok(inventory.has(name), `${name} missing from inventory`);
    assert.ok(fs.statSync(path.join(root, name)).isFile());
  }
  for (const name of ['Glazing.html', 'Glazing_Trial_3_Summary.html']) {
    assert.ok(!candidate.has(name));
  }
});

test('all nine candidate HTML documents start in standards mode without terminal pollution', () => {
  for (const [name, source] of documents) assert.deepEqual(documentErrors(source), [], name);
});

test('all candidate relative resources and fragments resolve with exact case', () => {
  for (const [name, source] of documents) assert.deepEqual(referenceErrors(name, source, candidate, documents), [], name);
});

test('pending reports have readable status, no href and no embed handler', () => {
  for (const [name, source] of documents) {
    for (const line of source.split('\n').filter(line => line.includes('data-pending='))) {
      assert.ok(line.includes('เตรียมข้อมูล'), name);
      const pending = tags(line).find(tag => tag.attrs['data-pending']);
      assert.equal(pending?.name, 'span', name);
      assert.equal(pending.attrs['aria-disabled'], 'true', name);
      assert.ok(!('href' in pending.attrs), name);
      assert.ok(!('data-embed' in pending.attrs), name);
      assert.ok(!('tabindex' in pending.attrs), name);
    }
  }
  const pendingKeys = tags(documents.get('index.html')).map(tag => tag.attrs['data-pending']).filter(Boolean);
  assert.deepEqual(pendingKeys, ['glazing-plan', 'glazing-experiment', 'experiment-1', 'experiment-2', 'experiment-3']);
  const main = documents.get('index.html');
  assert.ok(main.indexOf('href="ivqf_experiment_6_summary.html"') > main.indexOf('href="ivqf_experiment_5_summary.html"'));
});

test('trial backlinks use the current Glazing standard and lowercase index', () => {
  for (const name of ['ivqf_experiment_4_summary.html', 'ivqf_experiment_5_summary.html']) {
    const source = documents.get(name);
    assert.ok(source.includes('href="index.html"'));
    assert.ok(source.includes('href="order_ivqf_dashboard_2026_corrected.html"'));
    assert.ok(!source.includes('href="Glazing_Trial_3_Summary.html"'));
    assert.ok(source.includes('data-pending="experiment-3"'));
  }
});

test('inline classic JavaScript compiles and static element IDs are unique', () => {
  for (const [name, source] of documents) {
    const ids = tags(source).map(tag => tag.attrs.id).filter(Boolean);
    assert.equal(new Set(ids).size, ids.length, `${name}: duplicate IDs`);
    for (const [i, match] of [...source.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].entries()) {
      const attrs = attributes(match[1]);
      if (attrs.src || (attrs.type && !/^(?:text|application)\/javascript$/i.test(attrs.type))) continue;
      assert.doesNotThrow(() => new vm.Script(match[2], { filename: `${name}:script-${i}` }));
    }
  }
});

test('both evidence PNGs retain source bytes and positive intrinsic dimensions', () => {
  for (const [name, expected] of assets) {
    const bytes = fs.readFileSync(path.join(root, name));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), expected, name);
    if (name.endsWith('.webp')) {
      assert.equal(bytes.toString('ascii', 0, 4), 'RIFF', name);
      assert.equal(bytes.toString('ascii', 8, 12), 'WEBP', name);
      continue;
    }
    assert.equal(bytes.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', name);
    assert.equal(bytes.toString('ascii', 12, 16), 'IHDR', name);
    assert.ok(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0, name);
  }
});

test('checker regression: rejects terminal pollution and misplaced DOCTYPE', () => {
  assert.deepEqual(documentErrors('<!doctype html><html></html>'), []);
  assert.ok(documentErrors('Exit code: 0\nWall time: 0.2 seconds\nOutput:\n<!doctype html>').length >= 2);
  assert.ok(documentErrors('hello<!doctype html>').length > 0);
});

test('checker regression: wrong filename case fails even on Windows', () => {
  const files = new Set(['index.html']);
  assert.ok(referenceErrors('index.html', '<a href="Index.html">Home</a>', files, new Map()).length > 0);
  assert.deepEqual(referenceErrors('index.html', '<a href="index.html">Home</a>', files, new Map()), []);
});

test('checker regression: missing file, missing fragment and unsafe local paths fail', () => {
  const files = new Set(['index.html']);
  const docs = new Map([['index.html', '<section id="known"></section>']]);
  for (const href of ['absent.html', '#missing', 'file:///C:/data.html', '../private.html']) {
    assert.ok(referenceErrors('index.html', `<a href="${href}">test</a>`, files, docs).length > 0, href);
  }
  assert.deepEqual(referenceErrors('index.html', '<a href="#known">test</a>', files, docs), []);
});

test('checker regression: URL queries, encoded names and CSS assets are checked', () => {
  const files = new Set(['index.html', 'image one.png']);
  assert.deepEqual(referenceErrors('index.html', '<img src="image%20one.png?v=1">', files, new Map()), []);
  assert.ok(referenceErrors('index.html', '<style>.photo { background: url(missing.png) }</style>', files, new Map()).length > 0);
});
