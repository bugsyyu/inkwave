// 往前走 (LEARN §48, wf-softlock): while no question is up a learning level always shows her way on —
//   · the HUD (src/ui/hud-learn.js): walking, the walk bar's 「自动走」; a board framed, the walk bar turns into its keys —
//     「看全文」 (when the board has more) and 「继续 ›」 (the station's way on), 继续 lit with one hop once the board is read;
//     a question's own strip (playMode) never hides them; on a phone turned they stand in a column the framing keeps clear
//   · the stations hand the keys over: the puzzle's boards (继续 = the auto-walk on), the exit's booth and signs, the boss's
//     booth (framed where she stands, 继续 = 说完了)
//   · the board's 「读全文」 is 「看全文」 (she read it as "read it aloud"); the strip opens from the DOM key as from the hotspot
//   · no 地图 key and no corner map in a level (it never answered while a board held the lens); versus2 keeps them
//   · the safe area: the HUD's top row and the touch keys come out of the notch / the Dynamic Island / the home bar; a key the
//     level hides takes no touch
// A small DOM below stands in for the page (elements, classes, styles, clicks, computed display / padding).
// 用法：node --test tests/learn/*.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWeek, daySteps } from '../../src/learn/content.js';
import { LEARN, TOUCH } from '../../src/config.js';
import { frameBoard, boardBand, keysBand, KEYS } from '../../src/learn/play/board/frame.js';

const src = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// ------------------------------------------------------------------------------------------------ a small DOM
class ClassList {
  constructor(el) { this.el = el; this.s = new Set(); }
  add(...c) { for (const x of c) this.s.add(x); }
  remove(...c) { for (const x of c) this.s.delete(x); }
  toggle(c, on) { const v = on === undefined ? !this.s.has(c) : !!on; if (v) this.s.add(c); else this.s.delete(c); return v; }
  contains(c) { return this.s.has(c); }
}
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.classList = new ClassList(this); this.children = []; this.attrs = {}; this.dataset = {}; this.listeners = {}; this.hidden = false; this._text = ''; this._html = ''; this.parentElement = null;
    const st = {}; Object.defineProperty(st, 'setProperty', { value: (k, v) => { st[k] = String(v); } }); Object.defineProperty(st, 'getPropertyValue', { value: (k) => st[k] || '' }); st.cssText = ''; this.style = st; }
  get className() { return [...this.classList.s].join(' '); }
  set className(v) { this.classList.s = new Set(String(v).split(/\s+/).filter(Boolean)); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'hidden') this.hidden = true; }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; if (k === 'hidden') this.hidden = false; }
  appendChild(c) { if (c) { this.children.push(c); c.parentElement = this; } return c; }
  append(...cs) { for (const c of cs) this.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); }
  remove() { const p = this.parentElement; if (p) { p.children = p.children.filter((c) => c !== this); this.parentElement = null; } }
  get firstChild() { return this.children[0] || new El('i'); }
  addEventListener(t, f) { (this.listeners[t] || (this.listeners[t] = [])).push(f); }
  removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter((x) => x !== f); }
  click() { for (const f of this.listeners.click || []) f({ target: this, type: 'click' }); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  get innerHTML() { return this._html; }
  get offsetWidth() { return 0; }
  focus() {}
  closest() { return null; }
  querySelector() { return null; }
  querySelectorAll() { return []; }
  getBoundingClientRect() { return { left: 0, top: 0, width: 0, height: 0, right: 0, bottom: 0 }; }
}
class Text extends El { constructor(t) { super('#text'); this._text = String(t); } }
const doc = {
  documentElement: new El('html'), head: new El('head'), body: new El('body'), title: '',
  createElement: (t) => new El(t), createTextNode: (t) => new Text(t), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
};
globalThis.document = doc;
// computed styles: the touch layer's keys a level hides (styles/hud.css — checked against the file below), and the safe
// area's probe (src/ui/safe-area.js: its padding is the insets)
let INSETS = { top: 0, right: 0, bottom: 0, left: 0 };
const HIDDEN_IN_LEVEL = [1, 4, 5, 7], HIDDEN_NOMAP = 6;
globalThis.getComputedStyle = (el) => {
  if (/padding:var\(--iw-sat/.test(el.style.cssText || '')) return { paddingTop: INSETS.top + 'px', paddingRight: INSETS.right + 'px', paddingBottom: INSETS.bottom + 'px', paddingLeft: INSETS.left + 'px', display: 'block' };
  const p = el.parentElement, k = p ? p.children.indexOf(el) + 1 : 0;
  const off = p && el.classList.contains('iw-touch__btn') && p.classList.contains('is-learn') && (HIDDEN_IN_LEVEL.includes(k) || (k === HIDDEN_NOMAP && p.classList.contains('is-nomap')));
  return { display: off ? 'none' : 'grid', paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px' };
};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {};

const THREE = await import('three');
const { G } = await import('../../src/core/ctx.js');
const { LearnHud } = await import('../../src/ui/hud-learn.js');
const { BoardWalk } = await import('../../src/learn/play/board/walk.js');
const { BoardStation } = await import('../../src/learn/play/wire/boards.js');
const { EchoBooth } = await import('../../src/learn/play/echo/booth.js');
const { layoutBoard, wordsSpec, lessonSpec, passageSpec, echoSpec, soundsSpec, noteSpec } = await import('../../src/learn/play/board/paint.js');
const { boardSpots } = await import('../../src/learn/play/board/frame.js');
const { forgetInsets } = await import('../../src/ui/safe-area.js');
const W2 = await loadWeek(2);   // (before a window: the course's engine registers on window when there is one)
// (the touch layer listens on window: a window comes in only now — audio.js, imported above, set nothing up without one)
globalThis.window = { addEventListener() {}, removeEventListener() {} };
globalThis.visualViewport = { addEventListener() {}, removeEventListener() {} };
const { TouchControls } = await import('../../src/core/touch.js');

const lessonOf = (w, d) => daySteps(w, d).find((s) => s.meta && s.meta.lesson && s.meta.lesson.length);
const hudOf = () => { const root = new El('div'), hud = { root, el: new El('div'), timerTxt: new El('span'), playSound() {} }; return new LearnHud(hud); };
const flowOf = () => ({ week: 2, day: 3, auto: false, calls: [], autoWalk(on = true) { this.auto = !!on; this.calls.push(!!on); return this.auto; } });

// ------------------------------------------------------------------------------------------------ the HUD
test('the HUD: the walk bar walking, its keys while a board is framed — 看全文 when there is more, 继续 that goes on; a question never hides them', () => {
  const L = hudOf(), F = flowOf();
  const touchEl = new El('div'); let relaid = 0;
  G.touch = { el: touchEl, relayout() { relaid++; } };
  L.start(F);
  const cls = () => L.el.classList;
  assert.ok(cls().contains('is-walk') && !cls().contains('is-framed'), 'walking: the walk bar');
  // a board framed (the puzzle's station: unread yet)
  let more = 0, go = 0;
  const key = {};
  L.framed({ key, more: true, read: false, onMore: () => more++, onGo: () => go++ });
  assert.ok(cls().contains('is-framed'), 'framed: the walk bar turns into the board\'s keys');
  assert.equal(L.moreBtn.hidden, false, '看全文: the board has more');
  assert.equal(L.moreBtn.textContent.trim(), '看全文');
  assert.match(L.goBtn.textContent, /继续/);
  assert.ok(!L.goBtn.classList.contains('is-ready'), 'unread: 继续 dark');
  // read (LEARN.board.readS framed): lit, one hop
  L.framed({ key, more: true, read: true, onMore: () => more++, onGo: () => go++ });
  assert.ok(L.goBtn.classList.contains('is-ready') && L.goBtn.classList.contains('is-hop'), 'read: 继续 lit, one hop');
  L.moreBtn.click(); L.goBtn.click();
  assert.deepEqual([more, go], [1, 1], 'the keys do what the station said');
  // a question's strip (playMode) never hides the board's keys
  L.playMode(true);
  assert.ok(cls().contains('is-play') && cls().contains('is-framed'), 'is-play and is-framed together: the CSS keeps the keys');
  L.playMode(false);
  // let go: the walk bar is back
  L.framed(null);
  assert.ok(!cls().contains('is-framed') && L.moreBtn.hidden && cls().contains('is-walk'));
  // another board, read before: ready at once, no hop; no onGo → the auto-walk on
  L.framed({ key: {}, more: false, read: true });
  assert.ok(L.goBtn.classList.contains('is-ready') && !L.goBtn.classList.contains('is-hop'), 'read before: lit, no hop');
  assert.equal(L.moreBtn.hidden, true, 'nothing more: no 看全文');
  L.goBtn.click();
  assert.deepEqual(F.calls, [true], 'without the station\'s onGo, 继续 is the auto-walk on');
  // the results card: no keys
  L.results({ done: 1, total: 2, due: [] }, {});
  assert.ok(!cls().contains('is-framed') && cls().contains('is-done'));
  L.end();
  assert.ok(!cls().contains('is-framed') && !touchEl.classList.contains('is-nomap'));
  assert.ok(relaid >= 2, 'the touch layer laid out again when the level\'s keys changed');
});

test('the HUD: no 地图 key and no corner map in a level — versus2 (a Zone Control match with a team) keeps them', () => {
  const L = hudOf(), touchEl = new El('div');
  G.touch = { el: touchEl, relayout() {} };
  L.start(flowOf());
  assert.ok(L.hud.el.classList.contains('is-nomap') && touchEl.classList.contains('is-nomap'));
  L.end();
  L.start({ ...flowOf(), mapKey: true });
  assert.ok(!L.hud.el.classList.contains('is-nomap') && !touchEl.classList.contains('is-nomap'));
  L.end();
  assert.match(src('src/learn/forms/versus2.js'), /get mapKey\(\) \{ return true; \}/);
});

test('the CSS: the keys stay visible while framed whatever else the layer says; turned they stand in a column at the left; 44 pt; transform-only hop', () => {
  const css = src('styles/hud.css'), at = css.indexOf('往前走 · the safe area (LEARN §48)'), S = css.slice(at);
  assert.ok(at > 0);
  assert.match(S, /\.iw-learn\.is-framed \.iw-learn__walk \{ opacity: 1; visibility: visible;/, 'framed: visible (is-play or not)');
  assert.match(S, /\.iw-learn\.is-framed \.iw-learn__arrow, \.iw-learn\.is-framed \.iw-learn__walkmain, \.iw-learn\.is-framed \.iw-learn__gate, \.iw-learn\.is-framed \.iw-learn__auto \{ display: none; \}/);
  assert.match(S, /\.iw-learn\.is-framed \.iw-learn__go, \.iw-learn\.is-framed \.iw-learn__more:not\(\[hidden\]\) \{ display: inline-flex; \}/);
  assert.match(S, /@media \(orientation: landscape\) \{\s*\.iw-learn\.is-framed \.iw-learn__walk \{ left: calc\(16px \+ var\(--iw-sal\)\); right: auto; top: 50%; transform: translateY\(-50%\);[^}]*flex-direction: column;/);
  // the hop: transform only, once
  const hop = S.match(/@keyframes iw-learn-hop \{([^}]*\}){4} \}/);
  assert.ok(hop && !/opacity|top|left|width|height|margin/.test(hop[0].replace(/transform/g, '')), 'the hop moves only transform');
  assert.match(S, /\.iw-learn__go\.is-hop \{ animation: iw-learn-hop \.62s var\(--spring2\) 1; \}/);
  // (every key of the learn layer is a .iw-learn__btn: min 44 × 44)
  assert.match(css, /\.iw-learn__btn \{[^}]*min-height: 44px; min-width: 44px;/);
  // the keys' column fits in the margin the framing keeps: the bar's padding + the widest key (看全文: an icon, three
  // characters at 16 px, its padding) + the gap, inside KEYS.col
  const col = 16 + 10 * 2 + 3 + (14 + 20 + 8 + 3 * 16 + 14 + 4);
  assert.ok(col + 8 <= KEYS.col, `the column (${col} px) inside KEYS.col (${KEYS.col})`);
  // reduced motion: the layer's animations are off (the hop with them)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\) \{\s*\.iw-learn \*, \.iw-learn \*::before, \.iw-learn \*::after \{ animation: none !important; transition: none !important; \}/);
});

test('the CSS: the HUD\'s top row and the walk bar come out of the safe area; the level hides its 地图 key and its corner map', () => {
  const S = src('styles/hud.css').slice(src('styles/hud.css').indexOf('往前走 · the safe area (LEARN §48)'));
  assert.match(S, /:root \{ --iw-sat: env\(safe-area-inset-top, 0px\); --iw-sar: env\(safe-area-inset-right, 0px\); --iw-sab: env\(safe-area-inset-bottom, 0px\); --iw-sal: env\(safe-area-inset-left, 0px\); \}/);
  for (const sel of ['iw-hud__top', 'iw-sp', 'iw-sb', 'iw-turf', 'iw-feed', 'iw-bb']) assert.match(S, new RegExp(`\\.iw-hud \\.${sel} \\{ top: calc\\(var\\(--u\\) \\* [\\d.]+ \\+ var\\(--iw-sat\\)\\)`), `${sel} under the top inset`);
  assert.match(S, /\.iw-learn \.iw-learn__walk \{ top: calc\(var\(--hudtop, 58px\) \+ var\(--iw-sat\)\); \}/);
  // the keys a level hides: the 1st, 4th, 5th and 7th of the touch layer (fire, sub, special, cheer: as before) and now the 6th (map)
  const css = src('styles/hud.css');
  assert.match(css, /\.iw-touch\.is-learn \.iw-touch__btn:nth-child\(1\), \.iw-touch\.is-learn \.iw-touch__btn:nth-child\(4\),\s*\.iw-touch\.is-learn \.iw-touch__btn:nth-child\(5\), \.iw-touch\.is-learn \.iw-touch__btn:nth-child\(7\) \{ display: none; \}/);
  assert.match(S, /\.iw-touch\.is-learn\.is-nomap \.iw-touch__btn:nth-child\(6\) \{ display: none; \}/);
  assert.match(S, /\.iw-hud\.is-learn\.is-nomap \.iw-map \{ display: none !important; \}/);
  const t = src('src/core/touch.js'), lay = t.slice(t.indexOf('const LAYOUT = ['), t.indexOf('const EDGE_CODES'));
  const names = [...lay.matchAll(/\{ name: '(\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(names, ['fire', 'jump', 'squid', 'sub', 'special', 'map', 'cheer', 'pause'], 'the 6th key is the map');
  // the reading strip, turned, leaves the keys' column free
  assert.match(src('src/learn/play/board/strip.js'), /@media \(orientation: landscape\) and \(max-height: 460px\) \{ \.iw-read__box \{ left: calc\(var\(--iw-sal, 0px\) \+ 168px\);/);
});

// ------------------------------------------------------------------------------------------------ the touch layer
function touchOf(w, h, ins, learn = false, nomap = false) {
  globalThis.innerWidth = w; globalThis.innerHeight = h; INSETS = ins; forgetInsets();
  const input = { touch: { active: true, map: false, mx: 0, mz: 0, fingers: 0 }, mouse: { dx: 0, dy: 0 }, touchDown() {}, touchUp() {}, touchMapToggle() {}, pressCode() {} };
  const T = new TouchControls(input), parent = new El('div');
  T.mount(parent);
  if (learn) { T.el.classList.add('is-learn'); if (nomap) T.el.classList.add('is-nomap'); T.relayout(); }
  return T;
}
const btn = (T, n) => T.buttons.find((b) => b.name === n);

test('the touch layer: the top row under the top inset, the clusters out of the side / bottom insets', () => {
  const plain = touchOf(390, 844, { top: 0, right: 0, bottom: 0, left: 0 }), notch = touchOf(390, 844, { top: 59, right: 0, bottom: 34, left: 0 });
  for (const n of ['map', 'cheer', 'pause']) assert.ok(Math.abs(btn(notch, n).cy - btn(plain, n).cy - 59) < 0.01, `${n}: down by the top inset`);
  const m = Math.max(plain.u * TOUCH.edgeSteps, TOUCH.edgeMin);
  assert.ok(Math.abs((btn(plain, 'jump').cy - btn(notch, 'jump').cy) - Math.max(0, 34 + 8 - m)) < 0.01, 'the thumb cluster clears the home bar');
  const turned = touchOf(844, 390, { top: 0, right: 59, bottom: 21, left: 59 });
  for (const b of turned.buttons) assert.ok(b.cx + b.r <= 844 - 59 + 1e-6 || b.name === 'fire', `${b.name}: clear of the right inset (${(b.cx + b.r).toFixed(1)})`);
  assert.ok(btn(turned, 'fire').cx + btn(turned, 'fire').r <= 844 - 59 + 1e-6, 'the fire key too');
});

test('the touch layer: a key the level hides takes no touch (the unseen fire key fired); the top row closes up from the corner', () => {
  const T = touchOf(390, 844, { top: 59, right: 0, bottom: 34, left: 0 }, true, true);
  for (const n of ['fire', 'sub', 'special', 'cheer', 'map']) { const b = btn(T, n); assert.ok(b.off, `${n} hidden`); assert.notEqual(T._btnAt(b.cx, b.cy)?.name, n, `${n}: no touch where it would be`); }
  for (const n of ['jump', 'squid', 'pause']) { const b = btn(T, n); assert.ok(!b.off); assert.equal(T._btnAt(b.cx, b.cy).name, n); }
  // the pause key takes the corner slot (the map's), not the far one with two empty places beside it
  const plain = touchOf(390, 844, { top: 59, right: 0, bottom: 34, left: 0 });
  assert.ok(Math.abs(btn(T, 'pause').cx - btn(plain, 'map').cx) < 0.01, 'pause in the corner');
  // versus2: the map stays, the pause next to it
  const v2 = touchOf(390, 844, { top: 59, right: 0, bottom: 34, left: 0 }, true, false);
  assert.ok(!btn(v2, 'map').off && Math.abs(btn(v2, 'map').cx - btn(plain, 'map').cx) < 0.01 && Math.abs(btn(v2, 'pause').cx - btn(plain, 'cheer').cx) < 0.01);
  // outside a level nothing moves
  assert.ok(Math.abs(btn(plain, 'pause').cx - (390 - Math.max(plain.u * TOUCH.edgeSteps, TOUCH.edgeMin) - 4.8 * plain.u)) < 0.01);
});

// ------------------------------------------------------------------------------------------------ the framing
const SPECS = (() => {
  const out = [];
  for (const w of [W2]) for (let d = 1; d <= 7; d++) for (const s of daySteps(w, d)) {
    const t = s.meta.type;
    if (t === 'words') { const rows = s.items.map((it) => ({ en: it.en, ipa: it.meta.ipaUs || it.meta.ipa, zh: it.meta.zhFull || it.zh })); for (let k = 0; k < rows.length; k += 5) out.push([`w2d${d} ${s.id}`, wordsSpec(rows.slice(k, k + 5))]); }
    if (t === 'symbols') { const rows = s.items.map((it) => ({ ipa: it.en, name: it.meta.name, tip: it.meta.tip, examples: it.meta.examples })); for (let k = 0; k < rows.length; k += 2) out.push([`w2d${d} ${s.id}`, soundsSpec(rows.slice(k, k + 2))]); }
    if (s.meta.lesson && s.meta.lesson.length) out.push([`w2d${d} ${s.id}`, lessonSpec(s.title, s.meta.lesson)]);
    if (t === 'reading' && s.meta.passage) out.push([`w2d${d} ${s.id}`, passageSpec(s.meta.passage)]);
    if (t === 'speak') out.push([`w2d${d} ${s.id}`, echoSpec(s.items[0])]);
    if (t === 'checkin') out.push([`w2d${d} ${s.id}`, noteSpec(s.title, s.items[0].zh)]);
  }
  return out;
})();

test('keysBand: upright under the keys\' row, turned right of their column; both inside the safe area; the board centred in it, the text frontal', () => {
  const up = keysBand(390 / 844, 390, 844, { top: 59, bottom: 34 }), turned = keysBand(844 / 390, 844, 390, { left: 59, right: 59, bottom: 21 });
  assert.equal(up.top, 59 + KEYS.row); assert.equal(up.bottom, boardBand(390 / 844, 390, 844).bottom + 34);
  assert.equal(turned.left, 59 + KEYS.col); assert.equal(turned.right, boardBand(844 / 390, 844, 390).side + 59); assert.equal(turned.bottom, boardBand(844 / 390, 844, 390).bottom + 21);
  // no insets, no band: frameBoard as it was (the camera straight in front, x 0)
  const plain = frameBoard({ w: 2.44, h: 1.5 }, 844 / 390, { W: 844, H: 390 });
  assert.equal(plain.pos[0], 0); assert.equal(plain.look[0], 0);
  // a lopsided band: the camera that much to the side, looking as straight ahead — the board's middle at the band's middle
  for (const [w, h] of [[2.44, 1.0], [2.44, 2.04]]) {
    const f = frameBoard({ w, h }, 844 / 390, { W: 844, H: 390, band: turned });
    assert.equal(f.pos[0], f.look[0], 'straight ahead (frontal)');
    const t = Math.tan((f.fov * Math.PI) / 360), ndc = -f.pos[0] / (f.d * t * (844 / 390)), x = ((ndc + 1) / 2) * 844;
    const L = turned.left, bandW = 844 - turned.left - turned.right;
    assert.ok(Math.abs(x - (L + bandW / 2)) < 0.6, `the board's middle at ${x.toFixed(1)} (the band's ${L + bandW / 2})`);
    assert.ok(Math.abs(f.rect.x + f.rect.w / 2 - x) < 0.6 && f.rect.x >= L - 0.5 && f.rect.x + f.rect.w <= 844 - turned.right + 0.5, 'its rect in the band');
  }
});

test('every week-2 board, framed in the keys\' band on an iPhone either way (Dynamic Island insets), fits, reads at ≥ 17 px and keeps clear of the keys', () => {
  const W0 = LEARN.board.w;
  const views = [[390, 844, { top: 59, bottom: 34 }], [844, 390, { left: 59, right: 59, bottom: 21 }], [390, 844, {}], [844, 390, {}]];
  for (const [tag, spec] of SPECS) {
    const Lb = layoutBoard(spec), h = (W0 * Lb.H) / Lb.W;
    for (const [Wd, Hd, ins] of views) {
      const band = keysBand(Wd / Hd, Wd, Hd, ins), f = frameBoard({ w: W0 + 0.14, h: h + 0.14, bottom: LEARN.board.bottom - 0.07 }, Wd / Hd, { W: Wd, H: Hd, band });
      assert.ok(f.fits, `${tag} ${Wd}×${Hd}: fits`);
      const font = Lb.minFont * ((f.rect.w * (W0 / (W0 + 0.14))) / Lb.W);
      assert.ok(font >= LEARN.board.font - 0.01, `${tag} ${Wd}×${Hd}: ${font.toFixed(1)} px`);
      if (Wd < Hd) assert.ok(f.rect.y >= (ins.top || 0) + KEYS.row - 0.5, `${tag}: under the keys' row`);
      else assert.ok(f.rect.x >= (ins.left || 0) + KEYS.col - 0.5 && f.rect.x + f.rect.w <= Wd - (ins.right || 0) - 15.5, `${tag}: right of the keys' column, inside the right inset`);
    }
  }
});

// ------------------------------------------------------------------------------------------------ the stations
// (the boards paint the Node way — a data texture, no canvas — so these run without the small DOM)
const noDom = (fn) => () => { const d = globalThis.document; delete globalThis.document; try { return fn(); } finally { globalThis.document = d; } };
test('看全文: the board\'s footer key is 看全文 (not 读全文); keysOf says so, and its onMore opens the same strip as the hotspot', noDom(() => {
  const lesson = lessonOf(W2, 3), spec = lessonSpec(lesson.title, lesson.meta.lesson), Lb = layoutBoard(spec);
  assert.ok(Lb.cut, 'w2d3\'s lesson board holds more than it shows');
  const pill = Lb.ops.find((o) => o.op === 'pill' && Lb.hotspots.some((h) => h.id === 'more' && h.x === o.x && h.y === o.y));
  assert.equal(pill.label, '看全文');
  assert.ok(!/读全文/.test(src('src/learn/play/board/paint.js').replace(/\/\/.*$/gm, '')), 'no 读全文 left in the board\'s code');
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(52, 390 / 844, 0.1, 300);
  const W = new BoardWalk({ scene, camera });
  W.prepare('g', [spec, wordsSpec([{ en: 'rice', ipa: 'raɪs', zh: '米饭' }])]);
  const route = []; for (let z = 0; z <= 30; z++) route.push({ x: 0, y: 0, z });
  W.place('g', boardSpots(route, 2));
  const her = new THREE.Vector3(W.list[0].view.x, 0, W.list[0].view.z);
  for (let k = 0; k < 30; k++) W.update(1 / 60, her, { aspect: 390 / 844, speed: 0 });
  const i = W.framed, k0 = W.keysOf(i);
  assert.ok(i >= 0 && k0.more === W.list[i].b.entry.layout.hotspots.some((h) => h.id === 'more'));
  assert.equal(W.keysOf(1).more, false, 'a one-word board: nothing more');
  if (k0.more) { k0.onMore(); assert.equal(W.strip.isOpen, true, 'the DOM key opens the reading strip'); }
}));

test('the puzzle\'s boards hand the HUD their keys: framed → 看全文 / 继续 (the auto-walk on), read → lit, let go → the walk bar; framed in the keys\' band', noDom(() => {
  G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera(52, 390 / 844, 0.1, 300); G.renderer = null; G.hud = { root: {} };
  const got = [];
  const F = { ...flowOf(), t: 0, phase: 'walk', level: {}, hud: { framed: (x) => got.push(x), playMode() {} } };
  const S = new BoardStation({ flow: F, match: { local: null }, reduced: false, say() {} });
  S.warm();
  assert.equal(typeof S.walk.bandFor, 'function', 'the station frames in the keys\' band');
  const lesson = lessonOf(W2, 3);
  S.walk.prepare('g', [lessonSpec(lesson.title, lesson.meta.lesson)]);
  const route = []; for (let z = 0; z <= 20; z++) route.push({ x: 0, y: 0, z });
  S.walk.place('g', boardSpots(route, 1));
  const her = new THREE.Vector3(S.walk.list[0].view.x, 0, S.walk.list[0].view.z);
  for (let k = 0; k < 20; k++) S.walk.update(1 / 60, her, { aspect: 390 / 844, speed: 0 });
  assert.ok(got.length >= 1 && got[0] && got[0].more === true && got[0].read === false, 'framed: the keys, 看全文 with them');
  got[0].onGo();
  assert.deepEqual(F.calls, [true], '继续: the auto-walk on (to the next board, the gate)');
  F.auto = false;
  for (let k = 0; k < Math.ceil(LEARN.board.readS * 60) + 4; k++) S.walk.update(1 / 60, her, { aspect: 390 / 844, speed: 0 });
  assert.ok(got.some((x) => x && x.read === true), 'read: the keys again, lit');
  her.z += 12; for (let k = 0; k < 4; k++) S.walk.update(1 / 60, her, { aspect: 390 / 844, speed: 3 });
  assert.equal(got[got.length - 1], null, 'walked on: the keys let go');
  // the exit's booth and signs, the same keys (wire/exit.js)
  const ex = src('src/learn/play/wire/exit.js');
  assert.match(ex, /this\._keysOn\(this\.echo\.walk\);/); assert.match(ex, /this\._keysOn\(this\.signs\.walk\);/);
  assert.match(ex, /W\.bandFor = \(aspect, w, h\) => keysBand\(aspect, w, h, safeInsets\(\)\);/);
  assert.ok(!/playMode\?\.\(true\)/.test(ex), 'the exit no longer hides the walk bar for a framed board');
  assert.ok(!/playMode\?\.\(true\)/.test(src('src/learn/play/wire/boards.js')), 'nor the boards');
}));

test('the boss\'s booth: framed where she stands (a phone upright has no stick to walk into its ring); the sample plays; walking does not end it, 继续 = 说完了 does', noDom(() => {
  const E = new EchoBooth({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(52, 390 / 844, 0.1, 300) });
  const item = daySteps(W2, 3).find((s) => s.meta.type === 'speak').items[0], spoken = [], done = [];
  E.on.speak = (t, o) => { spoken.push(t); o?.onEnd?.(); }; E.on.done = (d) => done.push(d.how);
  E.here = true;
  E.open({ key: 'k', item, at: new THREE.Vector3(0, 0, 0), yaw: 0 });
  const her = new THREE.Vector3(0, 0, -(LEARN.arena.echoAhead + 1));   // (further than the booth's ring and its zone)
  let t = 0; for (let k = 0; k < Math.round((LEARN.echo.sampleGap + 0.3) * 60); k++) { t += 1 / 60; E.update(1 / 60, t, her, { aspect: 390 / 844, speed: 0 }); }
  assert.equal(E.walk.framed, 0, 'framed where she stands');
  assert.equal(E.state, 'in'); assert.equal(spoken.length, 1, 'the sample, once');
  her.z -= 5; for (let k = 0; k < 30; k++) { t += 1 / 60; E.update(1 / 60, t, her, { aspect: 390 / 844, speed: 2 }); }
  assert.deepEqual(done, [], 'walking off does not end it here');
  E._hot('done');
  assert.deepEqual(done, ['button'], '说完了');
  const host = src('src/learn/play/arena/host.js');
  assert.match(host, /this\.echo\.here = true;/);
  assert.match(host, /onGo: \(\) => this\.echo\?\._done\('button'\)/, 'the HUD\'s 继续 is 说完了');
  // without `here` (the puzzle's exit: the auto-walk takes her into the ring) nothing changed
  const E2 = new EchoBooth({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera() });
  E2.open({ key: 'k', item, at: new THREE.Vector3(0, 0, 0), yaw: 0 });
  for (let k = 0; k < 30; k++) E2.update(1 / 60, k / 60, her, { aspect: 1, speed: 0 });
  assert.equal(E2.walk.framed, -1); assert.equal(E2.state, 'ready');
}));

// ------------------------------------------------------------------------------------------------ the main thread (item 6)
test('the boards ahead are painted a board a frame (prepareSoon), what place() needs at once; their faces go up a frame each before they rise', noDom(() => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(52, 390 / 844, 0.1, 300);
  const W = new BoardWalk({ scene, camera, max: 6 });
  const painted = [], paint = W.set.paint.bind(W.set);
  W.set.paint = (spec) => { painted.push(spec.title); return paint(spec); };
  const words = daySteps(W2, 3).find((s) => s.meta.type === 'words').items.map((it) => ({ en: it.en, ipa: it.meta.ipaUs || it.meta.ipa, zh: it.zh }));
  const specs = [0, 1, 2, 3, 4].map((k) => wordsSpec(words.slice(k * 5, k * 5 + 5), k + 1, 5));
  W.prepareSoon('g3', specs); W.prepareSoon('g4', specs.slice(0, 2));
  assert.equal(painted.length, 0, 'nothing painted as the gates are queued');
  const her = new THREE.Vector3(0, 0, -50);
  W.update(1 / 60, her, {}); assert.equal(painted.length, 1, 'one board a frame');
  W.update(1 / 60, her, {}); assert.equal(painted.length, 2);
  const route = []; for (let z = 0; z <= 40; z++) route.push({ x: 0, y: 0, z });
  W.place('g3', boardSpots(route, 5));
  assert.equal(painted.length, 5, 'placing a gate paints what it still owes at once');
  assert.equal(W.list.length, 5);
  for (let k = 0; k < 2; k++) W.update(1 / 60, her, {});
  assert.equal(painted.length, 7, 'the next gate, a frame each');
  W.prepareSoon('g5', specs.slice(0, 3)); W.update(1 / 60, her, {}); W.free('g5');
  for (let k = 0; k < 4; k++) W.update(1 / 60, her, {});
  assert.equal(painted.length, 8, 'a freed gate owes nothing');
  // the faces: with a renderer, hidden until their upload — one a frame — and only then do they rise
  const ups = [];
  G.renderer = { initTexture: (t) => ups.push(t) };
  try {
    const S2 = new BoardWalk({ scene, camera, max: 6 });
    S2.prepare('g', specs.slice(0, 3));
    for (const e of S2.entries.get('g')) e.canvas = e.canvas || {};   // (Node paints no canvas: stand one in, as on the page)
    S2.place('g', boardSpots(route, 3));
    assert.ok(S2.set.boards.every((b) => !b.face.visible && !b.up), 'not shown before the upload');
    S2.update(1 / 60, her, {});
    assert.equal(ups.length, 1, 'one upload a frame'); assert.ok(S2.set.boards[0].face.visible && !S2.set.boards[1].face.visible);
    for (let k = 0; k < 2; k++) S2.update(1 / 60, her, {});
    assert.equal(ups.length, 3);
    for (let k = 0; k < 60; k++) S2.update(1 / 60, her, {});
    assert.ok(S2.set.boards.every((b) => b.face.visible && b.pop === 1), 'all up and risen');
  } finally { G.renderer = null; }
}));

test('the puzzle\'s boards station queues the gates ahead (a board a frame) — PlayHost._prep paints none at once', () => {
  assert.match(src('src/learn/play/wire/boards.js'), /if \(specs\.length\) this\.walk\.prepareSoon\(g\.id, specs\);/);
  assert.match(src('src/learn/play/board/walk.js'), /update\(dt, her, o = \{\}\) \{\s*if \(this\._owed\.length\) this\._paintOne\(\);/);
});
