// LEARN §55 (wf-input): the three left of the read-only sweep X1 (10-21) — what she can press, and what it says back:
//   · O — on a desktop the board's keys were out of reach: the mouse is the camera's (pointer lock), the keys 「看全文 · 继续 ›」
//     and the board's 听全文 are DOM / hotspots, and Esc (to free the mouse) is the pause menu. Now, with no touch layer, the
//     keyboard has them while a board / a sign / the booth is framed: Enter = 继续 ›, R = 看全文, L = the board's sound (听全文 /
//     再听 / 跟读, a DOM key of its own on a desktop), each key wearing its key's name; the duel's 备战 and the runner's start
//     line take R / L too. Under a finger nothing changes.
//   · R — versus2 keeps INKWAVE's 地图 key, but while a station (the typewriter, a flip card) holds the lens the overhead map
//     cannot open: the key lit up and nothing came, and it sprang overhead when the lens came back. Now it dims, a press of it
//     says why instead of latching, and Tab on a desktop says the same.
//   · S — coop2: a partner who walked off left her waiting for good (only ⏸ → 离开这一关). After LEARN.coop2.partnerIdle s of
//     waiting — her pad held and theirs empty, or the clue said and no answer in — one line says so; it goes when they are back.
//     Nobody is kicked, nothing new goes over the wire.
// A small DOM stands in for the page (elements, classes, clicks) and a window for its key listeners (capture, then bubble).
// 用法：node --test tests/learn/*.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEARN } from '../../src/config.js';

const src = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// ------------------------------------------------------------------------------------------------ a small DOM
class ClassList {
  constructor() { this.s = new Set(); }
  add(...c) { for (const x of c) this.s.add(x); }
  remove(...c) { for (const x of c) this.s.delete(x); }
  toggle(c, on) { const v = on === undefined ? !this.s.has(c) : !!on; if (v) this.s.add(c); else this.s.delete(c); return v; }
  contains(c) { return this.s.has(c); }
}
class El {
  constructor(tag) { this.tagName = String(tag).toUpperCase(); this.classList = new ClassList(); this.children = []; this.attrs = {}; this.dataset = {}; this.listeners = {}; this.hidden = false; this._text = ''; this._html = ''; this.parentElement = null;
    const st = {}; Object.defineProperty(st, 'setProperty', { value: (k, v) => { st[k] = String(v); } }); Object.defineProperty(st, 'getPropertyValue', { value: (k) => st[k] || '' }); Object.defineProperty(st, 'removeProperty', { value: (k) => { delete st[k]; } }); st.cssText = ''; this.style = st; }
  get className() { return [...this.classList.s].join(' '); }
  set className(v) { this.classList.s = new Set(String(v).split(/\s+/).filter(Boolean)); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'hidden') this.hidden = true; }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; if (k === 'hidden') this.hidden = false; }
  appendChild(c) { if (c) { this.children.push(c); c.parentElement = this; } return c; }
  append(...cs) { for (const c of cs) this.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c); }
  remove() { const p = this.parentElement; if (p) { p.children = p.children.filter((c) => c !== this); this.parentElement = null; } }
  get firstChild() { return this.children[0] || null; }
  get lastChild() { return this.children[this.children.length - 1] || null; }
  addEventListener(t, f) { (this.listeners[t] || (this.listeners[t] = [])).push(f); }
  removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter((x) => x !== f); }
  click() { for (const f of this.listeners.click || []) f({ target: this, type: 'click', stopPropagation() {} }); }
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
  documentElement: new El('html'), head: new El('head'), body: new El('body'), title: '', activeElement: null,
  createElement: (t) => new El(t), createTextNode: (t) => new Text(t), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
};
globalThis.document = doc;
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {};

const THREE = await import('three');
const { G } = await import('../../src/core/ctx.js');
const { LearnHud } = await import('../../src/ui/hud-learn.js');
const { BoardWalk } = await import('../../src/learn/play/board/walk.js');
const { PrepStation } = await import('../../src/learn/play/arena/prep.js');
const { passageSpec, wordsSpec, lessonSpec, echoSpec } = await import('../../src/learn/play/board/paint.js');
const { boardSpots } = await import('../../src/learn/play/board/frame.js');

// ------------------------------------------------------------------------------------------------ a window for key listeners
// (capture listeners first, then bubble — in the order they were added; stopPropagation ends the dispatch after the current
// phase's listener, stopImmediatePropagation at once — what a browser does for a keydown that reaches window)
const KL = { capture: [], bubble: [] };
const phaseOf = (c) => (c === true || (c && c.capture) ? 'capture' : 'bubble');
globalThis.window = {
  addEventListener(t, f, c) { if (t === 'keydown' && !KL[phaseOf(c)].includes(f)) KL[phaseOf(c)].push(f); },
  removeEventListener(t, f, c) { if (t === 'keydown') KL[phaseOf(c)] = KL[phaseOf(c)].filter((x) => x !== f); },
};
const press = (code, o = {}) => {
  const e = { code, key: code === 'Enter' || code === 'NumpadEnter' ? 'Enter' : code.replace(/^Key/, '').toLowerCase(), repeat: false, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, defaultPrevented: false, ...o,
    preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this._stop = true; }, stopImmediatePropagation() { this._stop = this._now = true; } };
  for (const ph of ['capture', 'bubble']) {
    for (const f of [...KL[ph]]) { f(e); if (e._now) return e; }
    if (e._stop) return e;
  }
  return e;
};
const desktop = () => { G.input = { touch: { active: false } }; };
const phone = () => { G.input = { touch: { active: true } }; };
const hudOf = () => { const root = new El('div'), hud = { root, el: new El('div'), timerTxt: new El('span'), playSound() {} }; return new LearnHud(hud); };
const flowOf = () => ({ week: 2, day: 3, auto: false, calls: [], autoWalk(on = true) { this.auto = !!on; this.calls.push(!!on); return this.auto; } });
const framedInfo = (did) => ({ key: {}, more: true, read: true, sound: { id: 'listen', label: '听全文' }, onMore: () => did.push('more'), onGo: () => did.push('go'), onSound: () => did.push('sound') });

// ================================================================================================ O · the board's keys on a desktop
test('O · desktop: while a board is framed the keyboard has its keys — Enter = 继续 ›, R = 看全文, L = its sound (there was no way to press 继续 under pointer lock)', () => {
  desktop(); G.menus = null; G.match = { paused: false };
  const L = hudOf(), F = flowOf(), did = [];
  G.touch = { el: new El('div'), relayout() {} };
  L.start(F);
  L.framed(framedInfo(did));
  const e = press('Enter');
  assert.deepEqual(did, ['go'], 'Enter: 继续 › — the station\'s way on');
  assert.equal(e.defaultPrevented, true, 'its default stopped (a DOM key she clicked keeps the focus: Enter would press it again)');
  press('NumpadEnter'); press('KeyR'); press('KeyL');
  assert.deepEqual(did, ['go', 'go', 'more', 'sound'], 'the keypad\'s Enter too; R: 看全文; L: 听全文');
  // without the station's onGo, Enter is the auto-walk on (as the DOM key)
  L.framed({ key: {}, more: false, read: false });
  press('Enter');
  assert.deepEqual(F.calls, [true]);
  // R where the board has nothing more, L where it has no sound: nothing
  press('KeyR'); press('KeyL');
  assert.deepEqual(did, ['go', 'go', 'more', 'sound']);
  // not framed (walking): the keys are not the board's
  L.framed(null);
  press('Enter'); press('KeyR');
  assert.deepEqual([did.length, F.calls.length], [4, 1], 'walking: Enter / R do nothing here');
  L.end();
});

test('O · desktop: the keys wear their names (data-kbd, drawn only with no touch layer), the board\'s sound is a DOM key there too — a free mouse (the 学习版\'s sandbox, LEARN §51) clicks the same keys', () => {
  desktop(); G.menus = null; G.match = { paused: false };
  const L = hudOf(), did = [];
  G.touch = { el: new El('div'), relayout() {} };
  L.start(flowOf());
  assert.ok(L.el.classList.contains('is-kbd'), 'a desktop: the key names show');
  assert.deepEqual([L.goBtn.dataset.kbd, L.moreBtn.dataset.kbd, L.soundBtn.dataset.kbd], ['Enter', 'R', 'L']);
  assert.deepEqual([L.goBtn.getAttribute('aria-keyshortcuts'), L.moreBtn.getAttribute('aria-keyshortcuts'), L.soundBtn.getAttribute('aria-keyshortcuts')], ['Enter', 'R', 'L']);
  assert.ok(L.soundBtn.hidden, 'nothing framed: no sound key');
  L.framed(framedInfo(did));
  assert.equal(L.soundBtn.hidden, false, 'a board with 听全文: its key');
  assert.equal(L.soundBtn.textContent, '听全文');
  L.framed({ ...framedInfo(did), sound: { id: 'replay', label: '再听' } });
  assert.equal(L.soundBtn.textContent, '再听', 'the board\'s own label (the booth\'s 再听)');
  L.soundBtn.click(); L.moreBtn.click(); L.goBtn.click();
  assert.deepEqual(did, ['sound', 'more', 'go'], 'clicked (a mouse the page may not lock): the same as the keys');
  L.framed({ key: {}, more: false, read: true, onGo() {} });
  assert.ok(L.soundBtn.hidden, 'a board with no sound: no sound key');
  L.end();
  // the CSS: the key names only on a desktop, over the key's corner, out of the flow (the column keeps KEYS.col); the sound key
  // only framed and only on a desktop; flat (no ink rim, no dropped shadow), never animated
  const css = src('styles/hud.css');
  assert.match(css, /\.iw-learn\.is-kbd \.iw-learn__btn\[data-kbd\] \{ position: relative; \}/);
  const tag = css.match(/\.iw-learn\.is-kbd \.iw-learn__btn\[data-kbd\]::after \{([^}]*)\}/);
  assert.ok(tag, 'the key\'s name: drawn by the CSS');
  assert.match(tag[1], /content: attr\(data-kbd\);/);
  assert.match(tag[1], /position: absolute;/, 'out of the flow: the key keeps its width');
  assert.match(tag[1], /background: #15121c; color: #fff;/, 'its own colour: ≈ 18 : 1 on any key');
  assert.ok(!/animation|transition|0 \d+px 0/.test(tag[1]), 'no animation, no dropped shadow');
  assert.match(css, /\.iw-learn__sound \{ display: none;/);
  assert.match(css, /\.iw-learn\.is-framed\.is-kbd \.iw-learn__sound:not\(\[hidden\]\) \{ display: inline-flex; \}/);
});

test('O · desktop: the keys wait for a menu, the pause, a repeat, a modifier, a text field — and come off with the level', () => {
  desktop(); G.match = { paused: false };
  const L = hudOf(), did = [];
  G.touch = { el: new El('div'), relayout() {} };
  L.start(flowOf());
  L.framed(framedInfo(did));
  G.menus = { current: 'pause' };
  press('Enter');
  assert.deepEqual(did, [], 'the pause menu\'s Enter is the menu\'s, not 继续 › as well');
  G.menus = null; G.match.paused = true;
  press('Enter'); G.match.paused = false;
  press('Enter', { repeat: true }); press('KeyR', { ctrlKey: true }); press('KeyL', { metaKey: true }); press('KeyR', { altKey: true });
  doc.activeElement = { tagName: 'INPUT' }; press('KeyR'); doc.activeElement = null;
  assert.deepEqual(did, [], 'paused, a held key, ⌘ / Ctrl / Alt, typing in a field: nothing');
  L.end();
  press('Enter');
  assert.deepEqual(did, [], 'after the level: the listener is gone');
  assert.equal(KL.bubble.length + KL.capture.length, 0, 'nothing left on window');
});

test('O · the typing keyboard and the duel\'s 备战 keep their keys: the board\'s keys listen on window\'s bubble phase, so a capture-phase owner that stops the key wins', () => {
  desktop(); G.menus = null; G.match = { paused: false };
  const L = hudOf(), did = [];
  G.touch = { el: new El('div'), relayout() {} };
  // (play-keys.js: a capture-phase keydown that swallows its keys — stopImmediatePropagation — while the keyboard is up)
  const typed = [], pk = (e) => { if (e.code === 'Enter' || e.code === 'KeyR' || e.code === 'KeyL') { typed.push(e.code); e.preventDefault(); e.stopImmediatePropagation(); } };
  L.start(flowOf());
  window.addEventListener('keydown', pk, true);
  L.framed(framedInfo(did));
  press('Enter'); press('KeyR'); press('KeyL');
  assert.deepEqual([typed, did], [['Enter', 'KeyR', 'KeyL'], []], 'the typing keyboard took them; the board\'s keys did nothing');
  window.removeEventListener('keydown', pk, true);
  press('Enter');
  assert.deepEqual(did, ['go']);
  L.end();
  assert.match(src('src/ui/play-keys.js'), /addEventListener\('keydown', this\._kd, true\)/, 'the typing keyboard: capture phase');
  assert.match(src('src/ui/play-keys.js'), /e\.preventDefault\(\); e\.stopImmediatePropagation\(\);/);
  assert.match(src('src/learn/play/arena/prep.js'), /window\.addEventListener\('keydown', this\._onKey, true\)/, 'the 备战: capture phase');
  // the keys that were taken: not one of the board's
  const ctl = src('src/game/player.js');
  for (const k of ['KeyE', 'Space', 'KeyF', 'KeyQ', 'KeyC', 'Tab', 'KeyM', 'Digit1']) assert.ok(ctl.includes(`'${k}'`), `${k} is the controller's`);
  for (const k of ['KeyR', 'KeyL', 'Enter']) assert.ok(!ctl.includes(`'${k}'`), `${k} is not`);
  assert.match(src('src/main.js'), /e\.code === 'KeyL' && this\.match\.practice/, 'L is only practice\'s loadout (a level is never practice)');
});

test('O · under a finger nothing changes: no key names, no sound key (the board\'s hotspot has it), the keys\' clicks as before, the keyboard ignored (passes before §55 as after)', () => {
  phone(); G.menus = null; G.match = { paused: false };
  const L = hudOf(), did = [];
  G.touch = { el: new El('div'), relayout() {} };
  L.start(flowOf());
  assert.ok(!L.el.classList.contains('is-kbd'), 'no key names');
  L.framed(framedInfo(did));
  assert.ok(!L.el.classList.contains('is-kbd'));
  assert.ok(!L.soundBtn || L.soundBtn.hidden, 'no sound key: a finger has the board\'s own 听全文');   // (true before §55 too: an invariant)
  assert.equal(L.moreBtn.hidden, false, '看全文 as before');
  press('Enter'); press('KeyR'); press('KeyL');
  assert.deepEqual(did, [], 'a keyboard paired to a tablet in touch mode: the keys are the screen\'s');
  L.moreBtn.click(); L.goBtn.click();
  assert.deepEqual(did, ['more', 'go'], 'the keys\' taps as before');
  L.end();
});

// (the boards paint the Node way — a data texture, no canvas — so these run without the small DOM)
const noDom = (fn) => () => { const d = globalThis.document; delete globalThis.document; try { return fn(); } finally { globalThis.document = d; } };
const PASSAGE = { title: 'A day at the market', titleZh: '市场的一天', en: 'Tom goes to the market every Saturday.\nHe buys rice and fish.', zh: '汤姆每周六去市场。他买米和鱼。' };

test('O · keysOf names the board\'s sound — the passage\'s 听全文, the booth\'s 再听, a word board\'s 跟读, none on a lesson — and onSound is the board\'s own button', noDom(() => {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(52, 1280 / 720, 0.1, 300);
  const W = new BoardWalk({ scene, camera });
  const spoken = [];
  W.on.speak = (t) => spoken.push(t);
  const item = { id: 'sp:1', en: 'Describe your weekend.', zh: '说说你的周末。', meta: { model: 'I usually rest at home.', modelZh: '我通常在家休息。' } };
  W.prepare('g', [passageSpec(PASSAGE), wordsSpec([{ en: 'rice', ipa: 'raɪs', zh: '米饭' }]), lessonSpec('讲解', [['p', '一般现在时：每天做的事。']]), echoSpec(item)]);
  const route = []; for (let z = 0; z <= 40; z++) route.push({ x: 0, y: 0, z });
  W.place('g', boardSpots(route, 4));
  assert.deepEqual(W.keysOf(0).sound, { id: 'listen', label: '听全文' });
  assert.deepEqual(W.keysOf(1).sound, { id: 'follow', label: '跟读' });
  assert.equal(W.keysOf(2).sound, null, 'a lesson board has no sound');
  assert.deepEqual(W.keysOf(3).sound, { id: 'replay', label: '再听' });
  // frame the passage: L (onSound) plays it, as its 听全文 hotspot does; a board not framed does nothing
  const her = new THREE.Vector3(W.list[0].view.x, 0, W.list[0].view.z);
  for (let k = 0; k < 30; k++) W.update(1 / 60, her, { aspect: 16 / 9, speed: 0 });
  assert.equal(W.framed, 0);
  W.keysOf(1).onSound();
  assert.deepEqual(spoken, [], 'a board she is not at: nothing');
  W.keysOf(0).onSound();
  assert.deepEqual(spoken, [PASSAGE.en], '听全文: the whole passage');
  W.dispose();
}));

test('O · the duel\'s 备战 and the runner\'s start line: R = 看全文, L = 听全文 on a desktop (Enter = 开始 as before), and the line says so; under a finger, no', noDom(() => {
  globalThis.innerWidth = 1280; globalThis.innerHeight = 720;
  G.scene = new THREE.Scene(); G.camera = new THREE.PerspectiveCamera(52, 1280 / 720, 0.1, 300); G.renderer = null; G.level = null; G.physics = null; G.hud = { root: {} };
  desktop(); G.menus = null;
  const shown = [], spoken = [];
  const strip = { show() {}, fit() {}, verdict: (v) => shown.push(v), hide() {} };
  const a = { pos: new THREE.Vector3(0, 0, 0), vel: { x: 0, z: 0 }, yaw: 0 };
  let went = null;
  const P = new PrepStation({ flow: { t: 0 }, match: { local: a }, strip, m1: { _topKeys: () => [] }, facingYaw: () => 0, reduced: false, say: (t) => spoken.push(t) });
  P.board = new BoardWalk({ scene: G.scene, camera: G.camera, max: 2 });
  P.board.on.speak = (t) => spoken.push(t);
  P.show([passageSpec(PASSAGE)], { head: '起跑前读一读', go: '出发！', onGo: (how) => { went = how; } });
  for (let k = 0; k < 10; k++) P.update(1 / 60);
  assert.ok(P.board.framed >= 0, 'framed as it rises');
  const line = shown[shown.length - 1].why;
  assert.match(line, /按回车：出发！/);
  assert.ok(/L 听全文/.test(line), `the line names L: ${line}`);
  press('KeyL');
  assert.deepEqual(spoken, [PASSAGE.en], 'L: 听全文');
  const k = P.board.keysOf(P.board.framed);
  if (k.more) { press('KeyR'); assert.equal(P.board.strip.isOpen, true, 'R: 看全文'); assert.match(shown[shown.length - 1].why, /R 看全文/); }
  press('Enter');
  assert.equal(went, 'key', 'Enter: 开始 / 出发 as before');
  // under a finger: the keys do nothing, the line says 点
  phone();
  spoken.length = 0;
  P.show([passageSpec(PASSAGE)], { go: '出发！' });
  for (let k2 = 0; k2 < 10; k2++) P.update(1 / 60);
  press('KeyL');
  assert.deepEqual(spoken, [], 'touch: L does nothing');
  assert.ok(!/L 听全文/.test(shown[shown.length - 1].why) && /点「出发！」/.test(shown[shown.length - 1].why));
  P.dispose();
  assert.equal(KL.capture.length, 0, 'its listener comes off with it');
}));

// ================================================================================================ R · versus2's 地图 while the lens is held
// (the touch layer: a window is already here; the safe area's probe and the keys' display read computed styles — every key shown)
globalThis.visualViewport = { addEventListener() {}, removeEventListener() {} };
globalThis.getComputedStyle = () => ({ display: 'grid', paddingTop: '0px', paddingRight: '0px', paddingBottom: '0px', paddingLeft: '0px' });
const { TouchControls } = await import('../../src/core/touch.js');
const { forgetInsets } = await import('../../src/ui/safe-area.js');
const { Versus2Flow } = await import('../../src/learn/forms/versus2.js');
const { Coop2Flow } = await import('../../src/learn/forms/coop2.js');
const { partnerWait, PARTNER_IDLE_LINE } = await import('../../src/learn/forms/duo.js');
const { FormsUi } = await import('../../src/learn/forms/ui.js');

test('R · versus2: while a station holds the lens the 地图 key dims, drops its latch and a press says why — it latched a map that could not open, and sprang overhead when the lens came back', () => {
  globalThis.innerWidth = 844; globalThis.innerHeight = 390; forgetInsets();
  const input = { touch: { active: true, map: false, mx: 0, mz: 0, fingers: 0 }, mouse: { dx: 0, dy: 0 }, touchDown() {}, touchUp() {}, touchMapToggle() { this.touch.map = !this.touch.map; }, pressCode() {} };
  const T = new TouchControls(input);
  T.mount(new El('div'));
  T.el.classList.add('is-learn'); T.relayout();
  const why = [], V = { mapHold: false, mapWhy: () => why.push('why') };
  G.mode = 'match'; G.menus = null; G.match = { learn: V, paused: false };
  T.update();
  const m = T.buttons.find((b) => b.name === 'map');
  let id = 0;
  const tap = () => { const e = { pointerType: 'touch', pointerId: ++id, clientX: m.cx, clientY: m.cy, target: new El('div'), type: 'pointerdown', preventDefault() {} }; T._down(e); T._up({ ...e, type: 'pointerup' }); };
  tap();
  assert.equal(input.touch.map, true, 'the follow camera: the key latches the map, as before');
  // the 打字蟹 takes the lens: the key dims, the latch drops (it would swoop overhead the moment the lens came back)
  V.mapHold = true; T.update();
  assert.ok(m.el.classList.contains('is-held'), 'dimmed');
  assert.equal(input.touch.map, false, 'the latch dropped');
  assert.ok(!m.el.classList.contains('is-on'), 'not lit');
  tap();
  assert.equal(input.touch.map, false, 'a press does not latch a map that cannot open');
  assert.deepEqual(why, ['why'], 'it says why');
  assert.equal(T._btnAt(m.cx, m.cy)?.name, 'map', 'and the finger is the key\'s (no look, no tap-shot under it)');
  // the lens back to her: the key as before
  V.mapHold = false; T.update();
  assert.ok(!m.el.classList.contains('is-held'));
  tap();
  assert.equal(input.touch.map, true);
  // a level that never holds it (no mapHold) and the match ending: never dimmed
  G.match = { learn: {}, paused: false }; T.update(); assert.ok(!m.el.classList.contains('is-held'));
  V.mapHold = true; G.match = { learn: V, paused: false }; T.update(); assert.ok(m.el.classList.contains('is-held'));
  G.mode = 'menu'; T.update();
  assert.ok(!m.el.classList.contains('is-held'), 'out of the match: not dimmed');
  // the CSS dims it as 跳 / 潜墨 are dimmed while a station holds her still
  assert.match(src('styles/hud.css'), /\.iw-touch\.is-learn \.iw-touch__btn\.is-held \{ opacity: \.32; transition: opacity \.2s; \}/);
  T.dispose();
});

test('R · versus2: mapHold is the arena\'s lens held; mapWhy says one line a press (not a line a frame); Tab / M on a desktop ask it too', () => {
  const d = Object.getOwnPropertyDescriptor(Versus2Flow.prototype, 'mapHold');
  assert.ok(d && d.get, 'versus2 says when the map is held');
  assert.equal(d.get.call({ arena: { cam: { on: true } } }), true, 'a station holds the lens');
  assert.equal(d.get.call({ arena: { cam: { on: false } } }), false, 'the follow camera');
  assert.equal(d.get.call({ arena: null }), false);
  const said = [], F = { t: 10, ui: { say: (s) => said.push(s) } };
  Versus2Flow.prototype.mapWhy.call(F); F.t += 0.4; Versus2Flow.prototype.mapWhy.call(F);
  assert.deepEqual(said, ['镜头正对着这道题 · 答完再看地图'], 'once for a press');
  F.t += 1.2; Versus2Flow.prototype.mapWhy.call(F);
  assert.equal(said.length, 2, 'a press later: again');
  assert.match(src('src/learn/forms/versus2.js'), /if \(this\.mapHold && G\.input && \(G\.input\.wasPressed\('Tab'\) \|\| G\.input\.wasPressed\('KeyM'\)\)\) this\.mapWhy\(\);/);
  // (the edge is read inside match.update: main.js polls the input before it and clears the edges after it)
  const main = src('src/main.js'), loop = main.slice(main.indexOf('this.input.pollPad();'));
  assert.ok(loop.indexOf('m.update(dt') > 0 && loop.indexOf('this.input.endFrame();') > loop.indexOf('m.update(dt'), 'endFrame after the match\'s update');
  // the overhead map still opens only from the follow camera (the rig is not changed: it is the key that says so now)
  assert.match(src('src/game/cameraRig.js'), /const inPlay = this\.mode === 'follow' \|\| this\.mode === 'spectate';/);
});
