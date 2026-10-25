// 射 with nothing typed (src/ui/play-keys.js, LEARN §53): it did nothing at all — now the keyboard shakes once (not with
// reduced motion) and the strip — turned, a tip over the pad that holds 射 — says what to do; nothing is sent.
// A small DOM below stands in for the page (elements, classes, styles, text, querySelector by tag or class).
// 用法：node --test tests/learn/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// iPhone 13 (her phone): upright the island's 47 px on top and the home bar's 34 below; turned 47 px either side, 21 below
const UP = { w: 390, h: 844, ins: { '--iw-sat': 47, '--iw-sar': 0, '--iw-sab': 34, '--iw-sal': 0 } };
const TURNED = { w: 844, h: 390, ins: { '--iw-sat': 0, '--iw-sar': 47, '--iw-sab': 21, '--iw-sal': 47 } };

// ------------------------------------------------------------------------------------------------ a small DOM
class ClassList {
  constructor() { this.s = new Set(); }
  add(...c) { for (const x of c) this.s.add(x); }
  remove(...c) { for (const x of c) this.s.delete(x); }
  toggle(c, on) { const v = on === undefined ? !this.s.has(c) : !!on; if (v) this.s.add(c); else this.s.delete(c); return v; }
  contains(c) { return this.s.has(c); }
}
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.classList = new ClassList(); this.children = []; this.attrs = {}; this.dataset = {}; this.listeners = {}; this._text = ''; this.parentElement = null;
    const st = {}; Object.defineProperty(st, 'setProperty', { value: (k, v) => { st[k] = String(v); } }); st.cssText = ''; this.style = st; }
  get className() { return [...this.classList.s].join(' '); }
  set className(v) { this.classList.s = new Set(String(v).split(/\s+/).filter(Boolean)); }
  setAttribute(k, v) { this.attrs[k] = String(v); }
  appendChild(c) { if (c) { this.children.push(c); c.parentElement = this; } return c; }
  remove() { const p = this.parentElement; if (p) { p.children = p.children.filter((c) => c !== this); this.parentElement = null; } }
  addEventListener(t, f) { (this.listeners[t] || (this.listeners[t] = [])).push(f); }
  removeEventListener() {}
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this.children = []; this._text = ''; }
  get offsetWidth() { return 0; }
  closest() { return null; }
  querySelector(sel) {
    const ok = (n) => (sel[0] === '.' ? n.classList.contains(sel.slice(1)) : n.tagName === sel.toUpperCase());
    for (const c of this.children) { if (ok(c)) return c; const d = c.querySelector(sel); if (d) return d; }
    return null;
  }
}
class Text extends El { constructor(t) { super('#text'); this._text = String(t); } }
globalThis.document = { documentElement: new El('html'), head: new El('head'), body: new El('body'), activeElement: null, createElement: (t) => new El(t), createTextNode: (t) => new Text(t) };
globalThis.addEventListener = () => {}; globalThis.removeEventListener = () => {};
let INS = { top: 0, right: 0, bottom: 0, left: 0 }, REDUCED = false;
globalThis.getComputedStyle = () => ({ paddingTop: INS.top + 'px', paddingRight: INS.right + 'px', paddingBottom: INS.bottom + 'px', paddingLeft: INS.left + 'px' });
globalThis.matchMedia = (q) => ({ matches: /reduced-motion/.test(q) && REDUCED });
const { PlayKeys, EMPTY, NOPE, NOPE_MS } = await import('../../src/ui/play-keys.js');
const { forgetInsets } = await import('../../src/ui/safe-area.js');
const view = ({ w, h, ins }) => { globalThis.innerWidth = w; globalThis.innerHeight = h; INS = { top: ins['--iw-sat'], right: ins['--iw-sar'], bottom: ins['--iw-sab'], left: ins['--iw-sal'] }; forgetInsets(); };

test('射 with nothing typed: the keyboard shakes once and the strip says what to do — nothing is sent; typing puts her text back', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  view(UP); REDUCED = false;
  const k = new PlayKeys(new El('div'), { mode: 'word' }), b = () => k.strip.querySelector('b');
  let sent = 0; k.onSubmit = () => sent++;
  assert.equal(b().textContent, EMPTY);
  k._press('fire', k.keyEls.get('fire'));
  assert.equal(sent, 0, 'nothing sent');
  assert.ok(k.panel.classList.contains('is-nope'), 'the keyboard shakes');
  assert.ok(k.strip.classList.contains('is-nope') && b().textContent === NOPE, 'the strip says it: ' + b().textContent);
  assert.ok(!k.tip.classList.contains('is-nope'), 'upright: no tip (the strip is there)');
  // (short: two lines that fit the strip of a 320 px phone at the hint's 13 px — keys.js gives it 186 px less 2 × 14 padding)
  for (const line of NOPE.split('\n')) assert.ok(line.length * 13 <= 186 - 28, 'fits: ' + line);
  assert.ok(NOPE.includes('提示'), 'the way out is the 提示 key every layout has');
  // she types: her text is back, the hint gone; 射 now sends
  k._press('c', k.keyEls.get('c'));
  assert.ok(!k.strip.classList.contains('is-nope') && !k.panel.classList.contains('is-nope'));
  assert.equal(b().textContent, 'c');
  k._press('fire', k.keyEls.get('fire'));
  assert.equal(sent, 1);
  // a second empty 射 after clearing: the hint again, and by itself it goes after NOPE_MS (back to the empty strip's words)
  k.clear(); k._press('fire', k.keyEls.get('fire'));
  assert.equal(b().textContent, NOPE);
  t.mock.timers.tick(NOPE_MS + 1);
  assert.equal(b().textContent, EMPTY);
  assert.ok(!k.strip.classList.contains('is-nope') && !k.panel.classList.contains('is-nope'));
  k.destroy();
});

test('射 with nothing typed, turned (the split keyboard has no strip): a tip over the pad that holds 射, inside the screen; reduced motion: no shake', () => {
  view(TURNED); REDUCED = false;
  const k = new PlayKeys(new El('div'), { mode: 'word' }), L = k._layout;
  assert.ok(L.split && !L.strip, 'the split layout');
  k._press('fire', k.keyEls.get('fire'));
  assert.ok(k.tip.classList.contains('is-nope') && k.tip.textContent === NOPE, 'the tip says it');
  assert.ok(k.panel.classList.contains('is-nope'), 'the keyboard shakes');
  const fire = L.keys.find((r) => r.key === 'fire'), pad = L.halves.find((r) => fire.x >= r.x && fire.x < r.x + r.w);
  assert.ok(pad && pad.x > TURNED.w / 2, '射 is on the right pad');
  // (flush with 射's right edge, its bottom 8 px over the pad's top: on the world, not on a key; out of the right inset)
  assert.equal(parseFloat(k.tip.style.right), TURNED.w - fire.x - fire.w);
  assert.equal(parseFloat(k.tip.style.top), pad.y - L.top - 8);
  assert.ok(parseFloat(k.tip.style.right) >= TURNED.ins['--iw-sar'], 'out of the right inset: right ' + k.tip.style.right);
  assert.match(src('src/ui/play-keys.js'), /\.iw-pk__tip \{[^}]*translate: 0 -100%;[^}]*pointer-events: none;/, 'over the pad, taps go through');
  k.destroy();
  // reduced motion: it only says it
  view(UP); REDUCED = true;
  const r = new PlayKeys(new El('div'), { mode: 'sentence' });
  r._press('fire', r.keyEls.get('fire'));
  assert.ok(!r.panel.classList.contains('is-nope'), 'no shake');
  assert.equal(r.strip.querySelector('b').textContent, NOPE);
  r.destroy(); REDUCED = false;
  // the CSS: the shake moves only transform, once; off with reduced motion
  const C = src('src/ui/play-keys.js');
  assert.match(C, /\.iw-pk__panel\.is-nope \{ animation: iw-pk-nope \.34s linear; \}/);
  const kf = /@keyframes iw-pk-nope \{(.*)\}\n/.exec(C);
  assert.ok(kf && !/opacity|left|top|width|margin/.test(kf[1]) && /transform/.test(kf[1]), 'transform only');
  assert.match(C, /@media \(prefers-reduced-motion: reduce\) \{[^@]*\.iw-pk__panel\.is-nope \{ animation: none; \}/);
});
