// Deliberately small DOM stub for executing this project's inline handlers.
// It is not a browser renderer, accessibility engine, or keyboard E2E test.
export function attrs(text) {
  const result = {};
  for (const m of text.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) result[m[1]] = m[2];
  return result;
}
export class Element {
  constructor(tag = 'div', attributes = {}) {
    this.tagName = tag.toUpperCase(); this.attributes = { ...attributes };
    this.dataset = {}; this.listeners = {}; this.value = ''; this.textContent = ''; this.children = [];
    for (const [key, value] of Object.entries(attributes)) if (key.startsWith('data-')) {
      this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    }
    const classes = new Set((attributes.class || '').split(' '));
    this.classList = {
      add: key => classes.add(key), remove: key => classes.delete(key), contains: key => classes.has(key),
      toggle: (key, force) => { const on = force ?? !classes.has(key); on ? classes.add(key) : classes.delete(key); return on; },
    };
  }
  set innerHTML(value) {
    this.html = value; this.children = [];
    for (const m of value.matchAll(/<(option|button)\b([^>]*)>([\s\S]*?)<\/\1>/g)) {
      const child = new Element(m[1], attrs(m[2])); child.value = child.attributes.value || '';
      child.textContent = m[3].replace(/<[^>]+>/g, ''); this.children.push(child);
    }
    if (this.tagName === 'SELECT') this.value = this.children[0]?.value || '';
  }
  get innerHTML() { return this.html || ''; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key] ?? null; }
  removeAttribute(key) { delete this.attributes[key]; if (key === 'src') delete this.src; }
  addEventListener(key, fn) { this.listeners[key] = fn; }
  focus() { this.focused = true; }
  closest(selector) { return selector === 'details' ? this.group : null; }
  querySelectorAll(selector) {
    if (selector === 'option') return this.children.filter(c => c.tagName === 'OPTION');
    const m = selector.match(/^\[data-([\w-]+)(?:="([^"]+)")?\]$/);
    if (!m) return [];
    return this.children.filter(c => c.getAttribute('data-' + m[1]) != null && (m[2] == null || c.getAttribute('data-' + m[1]) === m[2]));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}
