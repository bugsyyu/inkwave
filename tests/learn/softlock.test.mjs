// 往前走 (LEARN §48, wf-softlock): while no question is up a learning level always shows her way on —
//   · the HUD (src/ui/hud-learn.js): walking, the walk bar's 「自动走」; a board framed, the walk bar turns into its keys —
//     「看全文」 (when the board has more) and 「继续 ›」 (the station's way on), 继续 lit with one hop once the board is read;
//     a question's own strip (playMode) never hides them; on a phone turned they stand in a column the framing keeps clear
//   · the stations hand the keys over: the puzzle's boards (继续 = the auto-walk on), the exit's booth and signs, the boss's
//     booth (framed where she stands, 继续 = 说完了); 继续 always does something — before a board counts as read too, in
//     front of the check-in pad (the step onto it)
//   · a form with no route (the duel, the boss, versus2) shows no 「自动走」 that walks nowhere; the duel's 备战 strip and
//     the runner's start line have 看全文 too, and the start line's board takes its taps (the swipe hook asks it first)
//   · 「自动走」 always gets somewhere: no node near her (it threw and froze the screen), a board's stop where no board
//     frames, no nearer for LEARN.puzzle.walkStuckMax s
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
const { Signs } = await import('../../src/learn/play/board/signs.js');
const { ExitStation } = await import('../../src/learn/play/wire/exit.js');
const { PrepStation } = await import('../../src/learn/play/arena/prep.js');
const { LearnFlow } = await import('../../src/learn/flow.js');
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
  // the runner (and the review run on it) has no walk bar of hud-learn's: it hides the corner map itself, and lays the
  // touch layer out again so the keys it hides take no touch
  const r = src('src/learn/play/runner/runner.js');
  assert.match(r, /G\.hud\?\.el\?\.classList\.add\('is-nomap'\); G\.touch\?\.relayout\?\.\(\);/);
  assert.match(r, /classList\.remove\('is-learn', 'is-runner', 'is-nomap'\);\s*G\.touch\?\.el\?\.classList\.remove\('is-runner'\); G\.touch\?\.relayout\?\.\(\);/);
});

test('the HUD: a form with no route to walk (the duel, the boss, versus2) shows no walk bar — no 「自动走」 that walks nowhere; a board framed there still has its keys', () => {
  const L = hudOf(); G.touch = { el: new El('div'), relayout() {} };
  const cls = () => L.el.classList;
  L.start({ ...flowOf(), walkBar: false });
  assert.ok(!cls().contains('is-walk'), 'no walk bar');
  L.playMode(true); L.playMode(false);
  assert.ok(!cls().contains('is-walk'), 'not after a question either');
  L.hide();
  assert.ok(!cls().contains('is-walk'), 'nor after hide()');
  L.framed({ key: {}, more: false, read: false, onGo() {} });
  assert.ok(cls().contains('is-framed'), 'the boss\'s booth: its keys (is-framed shows the bar on its own — the CSS)');
  L.framed(null);
  assert.ok(!cls().contains('is-walk'));
  L.end();
  L.start(flowOf());
  assert.ok(cls().contains('is-walk'), 'a route to walk: the walk bar');
  L.playMode(true); L.playMode(false); assert.ok(cls().contains('is-walk'));
  L.end();
  for (const f of ['duel', 'boss', 'versus2']) assert.match(src(`src/learn/forms/${f}.js`), /get walkBar\(\) \{ return false; \}/, `${f}: no walk bar`);
  assert.match(src('styles/hud.css'), /\.iw-learn\.is-framed \.iw-learn__walk \{ opacity: 1; visibility: visible;/);
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
  // turned on a phone: clear of the touch layer's live keys at the right (what they reach in from the edge)
  assert.equal(keysBand(844 / 390, 844, 390, { left: 59, right: 59, reach: 203 }).right, 211);
  assert.equal(keysBand(844 / 390, 844, 390, { left: 59, right: 59, reach: 40 }).right, boardBand(844 / 390, 844, 390).side + 59, 'the inset when the keys reach less');
  assert.equal(keysBand(390 / 844, 390, 844, { top: 59, reach: 203 }).side, boardBand(390 / 844, 390, 844).side, 'upright: the keys are under the board, no reach');
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
  const views = [[390, 844, { top: 59, bottom: 34 }], [844, 390, { left: 59, right: 59, bottom: 21 }], [844, 390, { left: 59, right: 59, bottom: 21, reach: 203 }], [390, 844, {}], [844, 390, {}]];
  for (const [tag, spec] of SPECS) {
    const Lb = layoutBoard(spec), h = (W0 * Lb.H) / Lb.W;
    for (const [Wd, Hd, ins] of views) {
      const band = keysBand(Wd / Hd, Wd, Hd, ins), f = frameBoard({ w: W0 + 0.14, h: h + 0.14, bottom: LEARN.board.bottom - 0.07 }, Wd / Hd, { W: Wd, H: Hd, band });
      assert.ok(f.fits, `${tag} ${Wd}×${Hd}: fits`);
      const font = Lb.minFont * ((f.rect.w * (W0 / (W0 + 0.14))) / Lb.W);
      assert.ok(font >= LEARN.board.font - 0.01, `${tag} ${Wd}×${Hd}: ${font.toFixed(1)} px`);
      if (Wd < Hd) assert.ok(f.rect.y >= (ins.top || 0) + KEYS.row - 0.5, `${tag}: under the keys' row`);
      else assert.ok(f.rect.x >= (ins.left || 0) + KEYS.col - 0.5 && f.rect.x + f.rect.w <= Wd - Math.max((ins.right || 0) + 16, (ins.reach || 0) + 8) + 0.5, `${tag}: right of the keys' column, left of the right inset and the touch keys`);
    }
  }
});

test('a board\'s footer keys keep their labels inside them: one row while the labels shrink with it, else rows at minFont (the booth\'s four spilled over each other and off the board)', async () => {
  const { approxMeasure } = await import('../../src/learn/play/board/text.js');
  const { signBoard } = await import('../../src/learn/play/board/signs.js');
  const { BOARD } = await import('../../src/learn/play/board/paint.js');
  let echo = 0;
  for (const wk of [1, 2, 3]) {
    const W = await loadWeek(wk);
    for (let d = 1; d <= 7; d++) for (const s of daySteps(W, d)) {
      const t = s.meta.type, specs = [];
      if (s.meta.lesson && s.meta.lesson.length) specs.push(lessonSpec(s.title, s.meta.lesson));
      if (t === 'reading' && s.meta.passage) specs.push(passageSpec(s.meta.passage));
      if (t === 'speak') specs.push(echoSpec(s.items[0]));
      if (t === 'checkin') specs.push(signBoard({ kind: 'checkin', title: s.title, text: s.items[0].zh }));
      if (t === 'weekly' || t === 'placement') specs.push(signBoard({ kind: t, title: s.title }));
      for (const sp of specs) {
        const L = layoutBoard(sp), pills = L.ops.filter((o) => o.op === 'pill');
        for (const o of pills) {
          const need = approxMeasure(o.label, o.px) + (o.icon ? o.h * 0.5 + 14 : 0) + 20;
          assert.ok(need <= o.w + 0.5, `w${wk}d${d} ${sp.kind} 「${o.label}」: ${need.toFixed(0)} px of label in a ${o.w.toFixed(0)} px key`);
          assert.ok(o.px >= BOARD.minFont && o.x >= BOARD.pad - 0.5 && o.x + o.w <= L.W - BOARD.pad + 0.5, `w${wk}d${d} ${sp.kind} 「${o.label}」 on the board`);
        }
        for (let i = 0; i < pills.length; i++) for (let j = i + 1; j < pills.length; j++) { const p = pills[i], q = pills[j]; assert.ok(p.x + p.w <= q.x + 0.5 || q.x + q.w <= p.x + 0.5 || p.y + p.h <= q.y + 0.5 || q.y + q.h <= p.y + 0.5, `w${wk}d${d} ${sp.kind}: 「${p.label}」 and 「${q.label}」 apart`); }
        if (sp.kind === 'echo') { echo++; assert.equal(new Set(pills.map((o) => o.y)).size, 2, 'the booth: two rows of keys'); assert.ok(pills.find((o) => o.label === '说完了').y === pills[0].y, '说完了 in the first row'); }
      }
    }
  }
  assert.ok(echo >= 21, `every day's booth (${echo})`);
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
  for (let k = 0; k < Math.ceil(LEARN.board.readS * 60) + 4; k++) S.walk.update(1 / 60, her, { aspect: 390 / 844, speed: 0 });
  const lit = got.find((x) => x && x.read === true);
  assert.ok(lit, 'read: the keys again, lit');
  lit.onGo();
  assert.deepEqual(F.calls, [true], '继续: the auto-walk on (to the next board, the gate)');
  F.auto = false;
  her.z += 12; for (let k = 0; k < 4; k++) S.walk.update(1 / 60, her, { aspect: 390 / 844, speed: 3 });
  assert.equal(got[got.length - 1], null, 'walked on: the keys let go');
  // the exit's booth and signs, the same keys (wire/exit.js)
  const ex = src('src/learn/play/wire/exit.js');
  assert.match(ex, /this\._keysOn\(this\.echo\.walk\);/); assert.match(ex, /this\._keysOn\(this\.signs\.walk\);/);
  assert.match(ex, /W\.bandFor = keysBandNow;/);
  assert.match(src('src/learn/play/wire/boards.js'), /W\.bandFor = keysBandNow;/);
  assert.ok(!/playMode\?\.\(true\)/.test(ex), 'the exit no longer hides the walk bar for a framed board');
  assert.ok(!/playMode\?\.\(true\)/.test(src('src/learn/play/wire/boards.js')), 'nor the boards');
}));

test('继续 › always does something: before a board counts as read it goes on (that board and the ones she walked past read), in the booth it is 说完了, at the check-in board the step onto the pad', noDom(() => {
  G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera(52, 390 / 844, 0.1, 300); G.renderer = null; G.hud = { root: {} };
  const got = [], emitted = [];
  const F = { ...flowOf(), t: 0, phase: 'walk', level: {}, hud: { framed: (x) => got.push(x), playMode() {} }, _emit: (n, p) => emitted.push(n) };
  const O = { aspect: 390 / 844, speed: 0 };
  // the puzzle's boards: three along the way; she walked past the first on her own and stands at the second
  const S = new BoardStation({ flow: F, match: { local: null }, reduced: false, say() {} });
  S.warm();
  const words = daySteps(W2, 3).find((s) => s.meta.type === 'words').items.map((it) => ({ en: it.en, ipa: it.meta.ipaUs || it.meta.ipa, zh: it.zh }));
  S.walk.prepare('g', [0, 1, 2].map((k) => wordsSpec(words.slice(k * 5, k * 5 + 5), k + 1, 3)));
  const route = []; for (let z = 0; z <= 40; z++) route.push({ x: 0, y: 0, z });
  S.walk.place('g', boardSpots(route, 3));
  const her = new THREE.Vector3(S.walk.list[1].view.x, 0, S.walk.list[1].view.z);
  for (let k = 0; k < 10; k++) S.walk.update(1 / 60, her, O);
  assert.equal(S.walk.framed, 1);
  const k1 = got[got.length - 1];
  assert.ok(k1 && k1.read === false, 'framed 1/6 s: not read yet (LEARN.board.readS)');
  assert.equal(S.nextSpot().i, 0, 'before: the auto-walk\'s next stop was the board behind her');
  k1.onGo();
  assert.deepEqual(F.calls, [true], '继续: the auto-walk on');
  assert.ok(S.walk.read(0) && S.walk.read(1) && !S.walk.read(2), 'this board and the one she walked past count as read');
  assert.equal(S.nextSpot().i, 2, 'the next stop: the board ahead, never back');
  // the exit: the booth (wire/exit.js _keysOn — the same keys)
  const X = new ExitStation({ flow: F, match: { local: null } });
  const item = daySteps(W2, 3).find((s) => s.meta.type === 'speak').items[0], said = [];
  X.echo = new EchoBooth({ scene: G.scene, camera: G.camera });
  X.echo.on.speak = (t, o) => o?.onEnd?.(); X.echo.on.done = (d) => { X.spoke = true; said.push(d.how); };
  X._keysOn(X.echo.walk);
  X.echo.open({ key: 'e', item, at: new THREE.Vector3(20, 0, 0), yaw: 0 });
  const near = new THREE.Vector3(20, 0, -1.8);   // (in the board's zone, not yet on the booth's pad)
  got.length = 0; let t = 0;
  for (let k = 0; k < 10; k++) { t += 1 / 60; X.echo.update(1 / 60, t, near, O); }
  assert.equal(X.echo.state, 'ready'); assert.ok(got[got.length - 1], 'the booth\'s board framed: its keys');
  got[got.length - 1].onGo();
  assert.deepEqual(F.calls, [true, true], 'before the booth: 继续 walks her in (the auto-walk\'s next stop is the booth)');
  near.set(20, 0, -0.4);
  for (let k = 0; k < 40; k++) { t += 1 / 60; X.echo.update(1 / 60, t, near, O); }
  assert.equal(X.echo.state, 'in');
  got[got.length - 1].onGo();
  assert.deepEqual(said, ['button'], 'in the booth: 继续 = 说完了');
  assert.equal(F.calls.length, 3, 'and the auto-walk on to the next stop');
  // the signs: a weekly board, then the check-in pad (at its board's viewing spot) — the exit's stops in their order
  X.signs = new Signs({ scene: G.scene, camera: G.camera });
  X.signs.on.checkin = (sg) => X._checkin(sg);
  X._keysOn(X.signs.walk);
  X.signs.prepare('exit', [{ id: 'wk', kind: 'weekly', title: '周复盘' }, { id: 'ci', kind: 'checkin', title: '今天的打卡', text: '今天走完了。' }]);
  X.signs.place('exit', [{ x: -20, y: 0, z: 0, yaw: 0, view: { x: -20, y: 0, z: 1.7 } }, { x: -30, y: 0, z: 0, yaw: 0, view: { x: -30, y: 0, z: 1.7 } }]);
  X.on = true; X.skipped = new Set(); X.visited = new Set();
  X.spots = [{ kind: 'echo', x: 20, y: 0, z: 0, node: -1 }, { kind: 'weekly', sign: 0, x: -20, y: 0, z: 1.7, node: -1 }, { kind: 'checkin', sign: 1, x: -30, y: 0, z: 1.7, node: -1 }];
  X.echoAt = X.spots[0]; X.padAt = { x: -30, y: 0, z: 1.7 };
  const me = { pos: new THREE.Vector3(-30, 0, 1.7), vel: { x: 0, z: 0 } }, step = (s) => { for (let k = 0; k < Math.round(s * 60); k++) X.update(1 / 60); };
  X.match.local = me; G.time = 0;
  // on the pad while the weekly board is still to come (the write wall's gate at the route's end: she can stand on it as
  // the exit opens): nothing — the pad is the last stop
  step(0.5);
  assert.equal(X.checked, false, 'the pad counts only as the last stop');
  got.length = 0; got.push(X.signs.walk.keysOf(1)); got[0].onGo = () => X._go(X.signs.walk, X.signs.walk.list[1]);
  got[0].onGo();
  assert.equal(X.checked, false, '继续 at the check-in board before the last stop: the walk goes to the next stop');
  assert.equal(F.calls.length, 4);
  me.pos.set(-20, 0, 1.7); step(0.2);
  assert.equal(X.signs.walk.framed, 0);
  got[got.length - 1].onGo();
  assert.ok(X.signs.walk.read(0), 'the weekly board counts as read (the exit\'s next stop moves on)');
  assert.equal(X.nextSpot().kind, 'checkin');
  assert.equal(F.calls.length, 5);
  // in front of the pad, not on it (the walk's nav node stood off its centre): framed, nothing happened
  me.pos.set(-30, 0, 1.7 + 1.6); step(0.6);
  assert.equal(X.signs.walk.framed, 1); assert.equal(X.checked, false, 'not on the pad');
  got[got.length - 1].onGo();
  assert.ok(X.signs.checked && X.checked, '继续 at the check-in board: the step onto the pad — the day ends');
  assert.ok(emitted.includes('learn:sign'));
  assert.equal(F.calls.length, 5, '(no auto-walk: the day is over)');
  assert.equal(X.signs.checkIn(), false, 'once');
  X.match.local = null;
  // (and the pad's 「这一天走完了 ★」 goes when the cards come — it had no end and stood over them)
  assert.match(src('src/learn/flow.js'), /_results\(\) \{\s*this\.finishT = -1;\s*this\.match\.paused = true;\s*G\.input\?\.exitLock\?\.\(\);\s*this\.play\?\.strip\?\.hide\?\.\(\);/);
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
  assert.match(host, /this\.echo\.walk\.bandFor = \(aspect, w, h\) => \{ const a = hudBand\(aspect, w, h\), k = keysBandNow\(aspect, w, h\); return \{ \.\.\.k, top: Math\.max\(a\.top, k\.top\) \}; \};/);
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
  // (a frame: the game's clock moves once, then the match updates — twice on a slow frame, its two sub-steps)
  const frame = (X, subs = 1) => { G.time = (G.time || 0) + 1 / 60; for (let k = 0; k < subs; k++) X.update(1 / 60 / subs, her, {}); };
  frame(W); assert.equal(painted.length, 1, 'one board a frame');
  frame(W, 2); assert.equal(painted.length, 2, 'a slow frame\'s two sub-steps: still one');
  const route = []; for (let z = 0; z <= 40; z++) route.push({ x: 0, y: 0, z });
  W.place('g3', boardSpots(route, 5));
  assert.equal(painted.length, 5, 'placing a gate paints what it still owes at once');
  assert.equal(W.list.length, 5);
  W.update(1 / 60, her, {});
  assert.equal(painted.length, 5, 'and the queue waits for the next frame');
  for (let k = 0; k < 2; k++) frame(W);
  assert.equal(painted.length, 7, 'the next gate, a frame each');
  W.prepareSoon('g5', specs.slice(0, 3)); frame(W); W.free('g5');
  for (let k = 0; k < 4; k++) frame(W);
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
    frame(S2, 2);
    assert.equal(ups.length, 1, 'one upload a frame (a slow frame\'s two sub-steps too)'); assert.ok(S2.set.boards[0].face.visible && !S2.set.boards[1].face.visible);
    for (let k = 0; k < 2; k++) frame(S2);
    assert.equal(ups.length, 3);
    for (let k = 0; k < 60; k++) frame(S2);
    assert.ok(S2.set.boards.every((b) => b.face.visible && b.pop === 1), 'all up and risen');
  } finally { G.renderer = null; }
}));

test('the puzzle\'s boards station queues the gates ahead (a board a frame) — PlayHost._prep paints none at once', () => {
  assert.match(src('src/learn/play/wire/boards.js'), /if \(specs\.length\) this\.walk\.prepareSoon\(g\.id, specs\);/);
  assert.match(src('src/learn/play/board/walk.js'), /update\(dt, her, o = \{\}\) \{\s*if \(this\._owed\.length\) this\._paintOne\(\);/);
});

// ------------------------------------------------------------------------------------------------ the start line, the 备战 boards
test('the duel\'s 备战 board and the runner\'s start line: 看全文 on the strip too (the same reading strip); the start line\'s board takes its taps', noDom(() => {
  globalThis.innerWidth = 390; globalThis.innerHeight = 844;
  G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera(52, 390 / 844, 0.1, 300); G.renderer = null; G.level = null; G.physics = null; G.hud = { root: {} };
  const shown = [];
  const strip = { show() {}, fit() {}, verdict: (v) => shown.push(v), hide() {} };
  const a = { pos: new THREE.Vector3(0, 0, 0), vel: { x: 0, z: 0 }, yaw: 0 };
  const P = new PrepStation({ flow: { t: 0 }, match: { local: a }, strip, m1: { _topKeys: () => [] }, facingYaw: () => 0, reduced: false, say() {} });
  P.board = new BoardWalk({ scene: G.scene, camera: G.camera, max: 2 });
  const lesson = lessonOf(W2, 3);
  P.show([lessonSpec(lesson.title, lesson.meta.lesson)], { head: '起跑前读一读', go: '出发！' });
  const acts = () => shown[shown.length - 1].actions.map((x) => x.text);
  assert.deepEqual(acts(), ['看全文', '出发！'], 'the strip: 看全文 and the way on');
  for (let k = 0; k < 10; k++) P.update(1 / 60);
  assert.ok(P.board.framed >= 0 && P.tapApi, 'framed as it rises: its taps are on');
  shown[shown.length - 1].actions[0].onTap();
  assert.equal(P.board.strip.isOpen, true, '看全文 opens the reading strip');
  assert.deepEqual(acts(), ['看全文', '出发！'], 'and the strip\'s keys come back');
  // a board with nothing more: no 看全文
  P.show([wordsSpec([{ en: 'rice', ipa: 'raɪs', zh: '米饭' }])], { go: '开始这一轮' });
  assert.deepEqual(acts(), ['开始这一轮']);
  P.dispose();
  // the runner hands the start line's board to G.playTap before the start, and takes it back after
  const r = src('src/learn/play/runner/runner.js');
  assert.match(r, /if \(!this\.started\) \{ this\._start\(\); this\.prepS\?\.update\(dt\); G\.playTap = \(this\.prepS && this\.prepS\.tapApi\) \|\| null;/);
  assert.match(r, /if \(this\.prepS && G\.playTap === this\.prepS\.board\?\.tapApi\) G\.playTap = null;/);
}));

test('the swipe hook (the runner) asks G.playTap first: a finger on the framed board\'s hotspot is a tap on it, anywhere else a swipe as before', () => {
  const T = touchOf(390, 844, { top: 59, right: 0, bottom: 34, left: 0 }, true, true);
  T.enabled = true;
  const swiped = [], taps = [], was = G.match;
  G.match = { learn: { swipe: (d) => swiped.push(d) } };
  G.playTap = { down: (x, y) => { const on = x > 100 && x < 200 && y > 300 && y < 360; if (on) taps.push('down'); return on; }, up: (x, y, id) => { taps.push('up:' + id); return true; } };
  const ev = (type, x, y, id) => ({ type, pointerType: 'touch', clientX: x, clientY: y, pointerId: id, target: { closest: () => null }, preventDefault() {} });
  try {
    T._down(ev('pointerdown', 150, 330, 1)); T._up(ev('pointerup', 150, 330, 1));
    assert.deepEqual(swiped, []); assert.deepEqual(taps, ['down', 'up:1'], 'the board\'s hotspot: a tap');
    T._down(ev('pointerdown', 150, 700, 2)); T._move(ev('pointermove', 150, 700 - TOUCH.swipe - 30, 2)); T._up(ev('pointerup', 150, 700 - TOUCH.swipe - 30, 2));
    assert.deepEqual(swiped, ['up'], 'elsewhere: a swipe');
  } finally { G.match = was; G.playTap = null; }
});

// ------------------------------------------------------------------------------------------------ the auto-walk
test('「自动走」 always gets somewhere: no node near her walks straight at it (nav.edge(−1) threw, the screen froze); a board\'s stop where no board frames is passed after 1.5 s; no nearer along the path for walkStuckMax s — a board passed, the gate by a super jump', () => {
  const nodes = []; for (let i = 0; i < 20; i++) nodes.push({ x: 0, y: 0, z: i * 2 });
  const nav = {
    nodes,
    nearest: (p) => { if (p.y > 5) return -1; let b = -1, bd = 1e9; nodes.forEach((n, i) => { const d = Math.hypot(n.x - p.x, n.z - p.z); if (d < bd) { bd = d; b = i; } }); return bd < 3 ? b : -1; },
    path: (a, b) => { const o = []; for (let i = a; a <= b ? i <= b : i >= b; i += a <= b ? 1 : -1) o.push(i); return o; },
    edge: (a) => { if (a < 0) throw new TypeError('nodes[-1] is undefined'); return { type: 'walk' }; },
  };
  const was = G.nav; G.nav = nav;
  const flow = (play) => { const F = Object.assign(Object.create(LearnFlow.prototype), { P: LEARN.puzzle, phase: 'walk', auto: true, autoPath: null, autoK: 0, autoStall: 0, log: [], t: 0, hud: null, match: { local: null }, play }); F._emit = (n, p) => F.log.push({ name: n, ...p }); return F; };
  const her = (x, y, z) => ({ pos: new THREE.Vector3(x, y, z), vel: new THREE.Vector3(), intent: { move: new THREE.Vector3(), jump: false, squid: false, fire: false }, jumps: [], canSuperJump() { return true; }, superJump(t) { this.jumps.push([t.x, t.y, t.z]); return true; } });
  const run = (F, a, g, s, step = 0) => { for (let k = 0; k < Math.round(s * 30); k++) { F._autoWalk(a, g, 1 / 30); a.pos.z += step; } };
  try {
    // no node near her (up on a roof): straight at the gate, nothing thrown
    let F = flow(null), a = her(0, 9, 3);
    assert.doesNotThrow(() => run(F, a, { node: 10 }, 2));
    assert.ok(a.intent.move.z > 0 && F.auto, 'walking at the gate');
    // a board's stop she has reached where no board frames: held 1.5 s, then the board is passed (the walk goes on)
    const passed = [];
    let framed = -1;
    const play = { autoTarget: () => ({ node: 5, stop: true, board: 0 }), boardFramed: () => framed, boardPass: (i) => passed.push(i) };
    F = flow(play); a = her(0, 0, 10);
    run(F, a, { node: 15 }, 1.2);
    assert.ok(F.auto && passed.length === 0 && a.intent.move.lengthSq() === 0, 'standing at the stop, the walk still on');
    run(F, a, { node: 15 }, 0.4);
    assert.deepEqual(passed, [0], 'passed after 1.5 s');
    assert.ok(F.log.some((e) => e.name === 'learn:unstick' && e.why === 'unframed'));
    // a board framed there: the walk ends (its keys go on), as before
    framed = 0; F = flow(play); a = her(0, 0, 10);
    run(F, a, { node: 15 }, 0.1);
    assert.equal(F.auto, false, 'framed: the walk stops, 继续 › takes over');
    // no nearer along the path for walkStuckMax s: a board's stop is passed …
    const stuck = []; F = flow({ autoTarget: () => ({ node: 15, stop: true, board: 2 }), boardFramed: () => -1, boardPass: (i) => stuck.push(i) }); a = her(0, 0, 0);
    run(F, a, { node: 15 }, LEARN.puzzle.walkStuckMax - 0.5);
    assert.deepEqual(stuck, [], 'not before walkStuckMax s');
    run(F, a, { node: 15 }, 1);
    assert.deepEqual(stuck, [2], 'the board passed');
    // … the gate: the game's own super jump onto its node
    F = flow({ autoTarget: () => null }); a = her(0, 0, 0);
    run(F, a, { node: 15 }, LEARN.puzzle.walkStuckMax + 0.5);
    assert.deepEqual(a.jumps, [[0, 0, 30]], 'a super jump onto the gate\'s node');
    assert.ok(F.log.some((e) => e.name === 'learn:unstick' && e.node === 15));
    // walking on (3 m/s along the path): never helped
    F = flow({ autoTarget: () => null }); a = her(0, 0, 0);
    run(F, a, { node: 19 }, 12, 0.1);
    assert.deepEqual(a.jumps, [], 'a walk that gets nearer is left alone');
    // the exit area keeps its own timer (exitWalkMax): no help there from this one
    F = flow({ autoTarget: () => null }); F.phase = 'exit'; a = her(0, 0, 0);
    run(F, a, { node: 15 }, LEARN.puzzle.walkStuckMax + 1);
    assert.deepEqual(a.jumps, []);
  } finally { G.nav = was; }
});
