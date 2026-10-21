// On-screen controls for touch devices (phones / tablets), driven entirely by Pointer Events.
//
// How it talks to the rest of the game: it writes into the existing Input snapshot rather than being a parallel
// device. Look deltas land in `mouse.dx/dy` — the same field the map cursors read (src/ui/diorama.js, src/ui/hud.js)
// — so those two UIs work on a phone without knowing touch exists, and the camera reads the same field with its own
// gain (touch deltas are screen-bounded pixels; pointer-lock counts are unbounded). Buttons land in `input.touch.*`
// and are folded into the mouse fields by Input.pollTouch().
//
// Two rules this file exists to respect:
//   * ONE listener layer, with geometric hit-testing. Chrome applies implicit pointer capture to whatever element
//     received `pointerdown`, so listeners spread across buttons + canvas would retarget pointermove as soon as a
//     thumb slides off a button. One layer plus maths keeps every gesture correct and makes zones trivially
//     recomputable on resize. Deliberately no setPointerCapture: it does not stop browser gestures and it would
//     steal events from the menus.
//   * Every control stays clear of the screen edges. Android 10+ gesture navigation owns edge swipes, and it wins:
//     a control within ~32dp of an edge eats a `pointercancel` instead of a tap.
import { G } from './ctx.js';
import { TOUCH } from '../config.js';
import { t as tx } from '../ui/i18n.js';   // 中文化 (docs/LEARN.md §15): the portrait gate's words
import { PlayKeys } from '../ui/play-keys.js';   // 题即玩法 (docs/PLAY.md §6.4): the game keyboard owns its own touches
import { ReadStrip } from '../learn/play/board/strip.js';   // … and the reading strip its own (scroll, ✕)
import { safeInsets, forgetInsets } from '../ui/safe-area.js';   // LEARN §48: the notch, the Dynamic Island, the home bar

// Left share of the screen that owns the movement stick. The rest is look / fire / buttons.
const MOVE_ZONE = 0.44;

// 关卡学习 (docs/LEARN.md §16): opened from the IELTS-Base App (?from=app), a WKWebView whose other pages are portrait; only the
// game page may turn (play-7, PLAY §8), and the learning levels play in both orientations (PLAY §1 rule 10), so the portrait
// gate there would be a dead end — over the pause menu when the App comes back from the background, over the menus after a
// level — and the controls stay live in portrait for whatever she starts from the menu.
const FROM_APP = typeof location !== 'undefined' && new URLSearchParams(location.search).get('from') === 'app';
// menu screens with an upright layout of their own (styles/ui.css, the 关卡学习 G and I portrait blocks): no banner over them
const PORTRAIT_SCREENS = new Set(['howto', 'credits', 'online', 'lobby', 'loadout', 'locker', 'results', 'pause', 'map', 'book']);   // (map: 游戏为主体 第二期, LEARN §34; book: 课本, §37)

// Button layout, anchored to the bottom-right corner (the right thumb's natural arc). x/y are distances from the
// right / bottom edge in units of the step `u`, r is the radius in the same units, so the whole cluster scales
// together. +x = left, +y = up. Tuned on device — these are the numbers to move.
const LAYOUT = [
  { name: 'fire', label: '', x: 1.50, y: 1.50, r: 1.50, cls: 'is-fire' },
  { name: 'jump', label: tx('tc.jump'), x: 4.55, y: 1.20, r: 1.05 },
  { name: 'squid', label: tx('tc.squid'), x: 4.55, y: 3.40, r: 1.05 },
  { name: 'sub', label: tx('tc.sub'), x: 1.50, y: 4.35, r: 1.05 },
  { name: 'special', label: tx('tc.sp'), x: 4.20, y: 5.30, r: 1.05 },
];
// Top-right row: not thumb-arc controls, so they sit on their own line. `top: true` anchors them to the top edge.
const TOP_LAYOUT = [
  { name: 'map', label: tx('tc.map'), x: 1.10, y: 1.10, r: 0.90, cls: 'is-small', top: true },
  { name: 'cheer', label: tx('tc.cheer'), x: 2.95, y: 1.10, r: 0.90, cls: 'is-small', top: true },
  { name: 'pause', label: 'II', x: 4.80, y: 1.10, r: 0.90, cls: 'is-small', top: true },
];

// Buttons whose press must also reach the game as a one-frame key edge (the controller reads those via wasPressed).
// Levels must NOT go through that path: a synthesized `KeyM` would open and close the map inside a single frame,
// because the controller reads the map as a HELD key.
const EDGE_CODES = { cheer: 'KeyC' };

// Controls that are NOT levels, so lifting the finger must not clear them: `map` is a latch (nobody has a thumb free
// to hold a map button while dragging) and `pause` is a one-shot action. Every other button is hold-to-use.
const NOT_LEVEL = new Set(['map', 'pause']);

// Is the PRIMARY pointer a finger? A touchscreen laptop reports maxTouchPoints > 0 but `pointer: fine`, and it wants
// the mouse path — only a device whose main input is a thumb gets on-screen controls.
export function isTouchDevice() {
  return typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && (navigator.maxTouchPoints || 0) > 0;
}

// settings.touchControls: 'on' | 'off' force it, 'auto' decides by device.
export function shouldUseTouch(settings) {
  const mode = settings?.touchControls ?? 'auto';
  if (mode === 'on') return true;
  if (mode === 'off') return false;
  return isTouchDevice();
}

export class TouchControls {
  constructor(input) {
    this.input = input;
    this.roles = new Map();        // pointerId -> 'move' | 'look' | 'fire' | 'btn:<name>'
    this.look = { id: null, x: 0, y: 0 };
    this.move = { id: null, ox: 0, oy: 0 };
    this.buttons = [];             // { name, el, ux, uy, ur, top, cx, cy, r }
    this.u = TOUCH.minStep;
    this.stickR = 1;
    this.enabled = false;          // the game layer is live (in a match, no menu open)
  }

  // ---- lifecycle -------------------------------------------------------------------------------------------------
  mount(parent) {
    const el = (this.el = document.createElement('div'));
    el.className = 'iw-touch';
    for (const b of [...LAYOUT, ...TOP_LAYOUT]) {
      const d = document.createElement('div');
      d.className = 'iw-touch__btn' + (b.cls ? ' ' + b.cls : '');
      if (b.label) d.textContent = b.label;
      el.appendChild(d);
      this.buttons.push({ name: b.name, el: d, ux: b.x, uy: b.y, ur: b.r, top: !!b.top, cx: 0, cy: 0, r: 0 });
    }
    const stick = (this.stick = document.createElement('div'));
    stick.className = 'iw-touch__stick';
    stick.innerHTML = '<i></i>';
    el.appendChild(stick);
    this.knob = stick.firstChild;
    parent.appendChild(el);
    // Portrait gate: CSS shows this only when the viewport is taller than it is wide (styles/touch.css). It is not a
    // suggestion — a portrait 4v4 shooter has no horizontal field of view and nowhere to put two thumbs. Mounted as a
    // SIBLING of the control layer, not a child of it: the layer sits at z-index 15 and the menu layer at 20, so a
    // child can never paint over the menus — and the portrait menu is exactly what the gate exists to replace.
    const rotate = document.createElement('div');
    rotate.className = 'iw-touch-rotate';
    rotate.innerHTML = `<div><i>▭</i><b>${tx('rot.title')}</b><span>${tx('rot.text')}</span></div>`;
    parent.appendChild(rotate);
    this.rotateEl = rotate;

    this._bind();
    this._layout();
    return el;
  }

  dispose() {
    this.releaseAll();
    this.el?.remove();
    this.rotateEl?.remove();
    window.removeEventListener('pointerdown', this._onDown, true);
    window.removeEventListener('pointermove', this._onMove, true);
    window.removeEventListener('pointerup', this._onUp, true);
    window.removeEventListener('pointercancel', this._onUp, true);
    window.removeEventListener('resize', this._onResize);
    window.removeEventListener('orientationchange', this._onOrient);
    visualViewport?.removeEventListener?.('resize', this._onResize);
  }

  _bind() {
    this._onDown = (e) => this._down(e);
    this._onMove = (e) => this._move(e);
    this._onUp = (e) => this._up(e);
    this._onResize = () => this._layout();
    this._onOrient = () => { forgetInsets(); this.releaseAll(); this._layout(); };   // otherwise the zones move under the thumb
    // Listeners live on window but every handler bails on `pointerType !== 'touch'`, so a Bluetooth mouse on a tablet
    // stays on the normal pointer-lock path and menu taps (pointerType touch, no button hit, layer not live) pass
    // straight through — nothing here calls preventDefault outside a live match.
    window.addEventListener('pointerdown', this._onDown, true);
    window.addEventListener('pointermove', this._onMove, true);
    window.addEventListener('pointerup', this._onUp, true);
    window.addEventListener('pointercancel', this._onUp, true);
    window.addEventListener('resize', this._onResize);
    window.addEventListener('orientationchange', this._onOrient);
    visualViewport?.addEventListener?.('resize', this._onResize);
  }

  // ---- geometry --------------------------------------------------------------------------------------------------
  _layout() {
    const w = innerWidth, h = innerHeight;
    // Portrait is gated (styles/touch.css draws a "turn your device" card over everything). The card is DOM, but input
    // here is geometric hit-testing on window, which no DOM element can block — so refuse it explicitly.
    this.portrait = h > w;
    // Step unit: driven by the short edge so the cluster keeps its proportions in landscape. Floored at
    // TOUCH.minStep so targets stay thumb-sized rather than being scaled by the UI's --u, which collapses to under
    // half its design size on a phone.
    const u = (this.u = Math.max(TOUCH.minStep, Math.min(TOUCH.maxStep, Math.min(w, h) * TOUCH.stepFrac)));
    this.stickR = u * TOUCH.stickR;
    const m = Math.max(u * TOUCH.edgeSteps, TOUCH.edgeMin);   // absolute floor: the gesture-nav strip is fixed in dp, not in steps
    // 关卡学习 I (LEARN §17): upright, the top row (pause · cheer · map) sits under the HUD's top band and a level's next-gate
    // bar (the clock, the special gauge and the turf count are up there on a phone held this way), and every button is at
    // least 44 pt across; the thumb cluster stays where it is
    const topOff = this.portrait ? Math.round(Math.min(w, h) * 0.235) : 0;
    // LEARN §48: out of the safe area (her App draws under the notch / the Dynamic Island and the home bar): the top row
    // comes down with the HUD's top row, the clusters keep clear of a side / bottom inset wider than their margin. A key the
    // level hides (styles: display none — a learning level's fire, sub, special, cheer, map) takes no touch — before, an
    // unseen fire key still fired — and the top row closes up from the corner over the keys that are left
    const ins = safeInsets(), mr = Math.max(m, ins.right + 8), mb = Math.max(m, ins.bottom + 8), mt = m + ins.top;
    const slots = TOP_LAYOUT.map((t) => t.x);
    let k = 0;
    for (const b of this.buttons) {
      b.off = typeof getComputedStyle === 'function' && getComputedStyle(b.el).display === 'none';
      const ux = b.top ? (b.off ? b.ux : slots[Math.min(k++, slots.length - 1)]) : b.ux;
      b.cx = w - mr - ux * u;
      b.cy = b.top ? mt + topOff + b.uy * u : h - mb - b.uy * u;
      b.r = this.portrait ? Math.max(b.ur * u, 22) : b.ur * u;
      b.el.style.width = b.el.style.height = `${(b.r * 2).toFixed(1)}px`;
      b.el.style.transform = `translate3d(${(b.cx - b.r).toFixed(1)}px,${(b.cy - b.r).toFixed(1)}px,0)`;
    }
    if (this.move.id === null) this._hideStick();
  }
  // (the level's keys changed — hud-learn start / end toggle what the layer shows)
  relayout() { if (this.el) this._layout(); }

  _btnAt(x, y) {
    for (const b of this.buttons) if (!b.off && Math.hypot(x - b.cx, y - b.cy) <= b.r) return b;
    return null;
  }

  _taken(role) {
    for (const r of this.roles.values()) if (r === role) return true;
    return false;
  }

  // ---- pointer handling ------------------------------------------------------------------------------------------
  _down(e) {
    if (e.pointerType !== 'touch' || !this.input.touch.active || (this.portrait && !G.match?.learn && !FROM_APP)) return;
    // The controls are invisible unless the layer is live, so they must be untouchable too — a hidden control that
    // still fires is how a tap lands on a button nobody can see (and, for the map latch, one that then gets wiped).
    if (!this.enabled) return;
    // 题即玩法 (play-wire, LEARN §19 / §21): a finger on the game keyboard or on the reading strip is theirs — never a stick, a look or a tap-shot
    if (PlayKeys.owns(e) || ReadStrip.owns(e) || (G.match?.learn && e.target && e.target.closest && e.target.closest('.iw-ps__play, .iw-ps__act, .iw-learn__btn'))) return;   // (nor the strip's ▶ / its buttons or the level's own buttons)
    // ---- 墨浪跑酷 swipe hook (src/learn/play/runner, docs/LEARN.md §20): a level that steers by swipes exposes
    // match.learn.swipe(dir). Then a finger is a swipe wherever it lands — no stick, no look — except on ⏸ and on the
    // level's own DOM buttons (▶ 再听, the prop bag), which keep their click.
    const swipeTo = G.match?.learn?.swipe ? G.match.learn : null;
    if (swipeTo) {
      if (e.target && e.target.closest && e.target.closest('button')) return;
      const pb = this._btnAt(e.clientX, e.clientY);
      if (!(pb && pb.name === 'pause')) { this.roles.set(e.pointerId, 'swipe'); (this._sw || (this._sw = new Map())).set(e.pointerId, { x: e.clientX, y: e.clientY }); e.preventDefault(); return; }
    }
    // ---- (end of the swipe hook)
    const b = this._btnAt(e.clientX, e.clientY);
    if (b) {
      // The fire button is also a look origin: touch it and drag, and you fire while aiming with the same thumb.
      const role = b.name === 'fire' ? 'fire' : 'btn:' + b.name;
      if (this._taken(role)) { e.preventDefault(); return; }   // a second finger on a live control is inert
      this.roles.set(e.pointerId, role);
      b.el.classList.add('is-down');
      if (b.name === 'fire') { this.look.id = e.pointerId; this.look.x = e.clientX; this.look.y = e.clientY; }
      this._press(b.name);
      e.preventDefault();                                        // also suppresses the synthesized mouse events
      return;
    }
    // 题即玩法 (docs/PLAY.md §6.1): a finger landing on a question object is the level's tap-shot (G.playTap, src/learn/play/run.js
    // — it decides on the way up whether it was a tap), not the stick; dragged, it looks round like the right half does
    if (G.playTap && G.playTap.down(e.clientX, e.clientY, e.pointerId)) {
      if (this.look.id === null) { this.roles.set(e.pointerId, 'look'); this.look.id = e.pointerId; this.look.x = e.clientX; this.look.y = e.clientY; }
      else this.roles.set(e.pointerId, 'tap');
      e.preventDefault(); return;
    }
    const inLeft = e.clientX < innerWidth * MOVE_ZONE && e.clientY > innerHeight * TOUCH.topGuard;
    if (inLeft && this.move.id === null) {
      this.roles.set(e.pointerId, 'move');
      this.move.id = e.pointerId;
      this.move.ox = e.clientX; this.move.oy = e.clientY;
      this._showStick(e.clientX, e.clientY, e.clientX, e.clientY);
    } else if (!inLeft && this.look.id === null) {
      this.roles.set(e.pointerId, 'look');
      this.look.id = e.pointerId;
      this.look.x = e.clientX; this.look.y = e.clientY;
    } else { e.preventDefault(); return; }                       // an axis is already owned: this finger is inert
    e.preventDefault();
  }

  _move(e) {
    const role = this.roles.get(e.pointerId);
    if (role === undefined) return;
    if (role === 'swipe') {   // 墨浪跑酷 swipe hook: past TOUCH.swipe px → one swipe; a flick is one, a long drag on (3.5× as far again) one more
      const o = this._sw && this._sw.get(e.pointerId), L = G.match?.learn;
      if (!o || !L || !L.swipe) return;
      const dx = e.clientX - o.x, dy = e.clientY - o.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < TOUCH.swipe * (o.n ? 3.5 : 1)) return;
      L.swipe(Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down'));
      o.x = e.clientX; o.y = e.clientY; o.n = (o.n || 0) + 1;
      return;
    }
    if (role === 'look' || role === 'fire') {
      // Raw pixels into the field the camera and both map cursors read. The camera applies the touch gain itself
      // (see player.js), which keeps the map cursors' existing screen-normalized feel intact.
      this.input.mouse.dx += e.clientX - this.look.x;
      this.input.mouse.dy += e.clientY - this.look.y;
      this.look.x = e.clientX; this.look.y = e.clientY;
      return;
    }
    if (role === 'move') {
      const dx = e.clientX - this.move.ox, dy = e.clientY - this.move.oy;
      const m = Math.hypot(dx, dy), r = this.stickR;
      const k = m > r ? r / m : 1;                               // clamp to the rim; no runaway past the edge
      this.move.x = (dx / r) * k; this.move.y = (dy / r) * k;
      this.input.touch.mx = this.move.x;
      this.input.touch.mz = -this.move.y;                        // screen-up is forward
      this._showStick(this.move.ox, this.move.oy, this.move.ox + dx * k, this.move.oy + dy * k);
    }
  }

  _up(e) {
    const role = this.roles.get(e.pointerId);
    if (role === undefined) return;
    G.playTap?.up(e.clientX, e.clientY, e.pointerId, e.type === 'pointercancel');   // (题即玩法: was it a tap on a question object?)
    this.roles.delete(e.pointerId);
    if (role === 'swipe') { this._sw?.delete(e.pointerId); this.input.touch.fingers = this.roles.size; return; }   // (墨浪跑酷 swipe hook)
    if (role === 'move') {
      this.move.id = null;
      this.input.touch.mx = 0; this.input.touch.mz = 0;
      this._hideStick();
    } else if (role === 'look' || role === 'fire') {
      if (this.look.id === e.pointerId) this.look.id = null;
      if (role === 'fire') this.input.touchUp('fire');           // pointercancel lands here too, and is a release
      for (const b of this.buttons) if (b.name === 'fire') b.el.classList.remove('is-down');
    } else if (role.startsWith('btn:')) {
      const name = role.slice(4);
      if (!NOT_LEVEL.has(name)) this.input.touchUp(name);   // a latch/one-shot is set on press and only press changes it
      for (const b of this.buttons) if (b.name === name) b.el.classList.remove('is-down');
    }
    this.input.touch.fingers = this.roles.size;
  }

  // Press side effects. `fire` is the only level that must survive past the event (it is polled per frame);
  // the movement values are written in _move. Everything else is a toggle or a one-shot.
  _press(name) {
    this.input.touch.fingers = this.roles.size;
    switch (name) {
      case 'fire': this.input.touchDown('fire'); break;
      case 'map': this.input.touchMapToggle(); this._syncMap(); break;
      case 'pause': this.input.onPause?.(); break;
      default:
        this.input.touchDown(name);
        if (EDGE_CODES[name]) this.input.pressCode(EDGE_CODES[name]);
        break;
    }
  }

  _syncMap() {
    for (const b of this.buttons) if (b.name === 'map') b.el.classList.toggle('is-on', !!this.input.touch.map);
  }

  // Drop every gesture and every held control. Called whenever the layer is invalidated: menu opened, orientation
  // changed, match ended, app backgrounded.
  releaseAll() {
    for (const b of this.buttons) b.el.classList.remove('is-down');
    this.roles.clear();
    this._sw?.clear();   // (墨浪跑酷 swipe hook)
    this.move.id = null; this.look.id = null;
    this.input.touch.mx = 0; this.input.touch.mz = 0;
    this.input.touch.fingers = 0;
    this.input.touch.fire = false;
    this._hideStick();
  }

  // Force the map latch off — a menu opening must not leave it latched, or it springs back open when the menu closes.
  clearMap() { this.input.touch.map = false; this._syncMap(); }

  _showStick(ox, oy, kx, ky) {
    const st = this.stick, r = this.stickR;
    st.classList.add('is-on');
    st.style.width = st.style.height = `${(r * 2).toFixed(1)}px`;
    st.style.transform = `translate3d(${(ox - r).toFixed(1)}px,${(oy - r).toFixed(1)}px,0)`;
    this.knob.style.transform = `translate3d(${(kx - ox).toFixed(1)}px,${(ky - oy).toFixed(1)}px,0)`;
  }
  _hideStick() { this.stick?.classList.remove('is-on'); }

  // ---- per-frame -------------------------------------------------------------------------------------------------
  // Gate: a live match with no menu open. Deliberately NOT match.controller.enabled — that clears when the local
  // player is splatted, which is exactly when the map (and super-jump planning) must still work.
  update() {
    // 关卡学习 (docs/LEARN.md): a level plays in portrait too (auto-walk stands in for the stick), so the gate stays down
    // there. (题即玩法, play-8: a level never holds the match or her for a question — only her own pause stops the controls)
    const learn = !!G.match?.learn;
    const live = G.mode === 'match' && !!G.match && !G.menus?.current && !(this.portrait && !learn && !FROM_APP) && !G.match.paused;
    // Arm the portrait gate only when there is something unusable underneath it — a real menu screen or a match.
    // NOT the loading screen: that is where a player looks to see whether the game is coming up at all, and covering
    // it turns "still loading" into "broken" (which is exactly what an earlier version of this gate did). The title
    // screen is left alone too — it advances on a tap anywhere, which portrait does fine.
    // 关卡学习 G: the screens on her path have a portrait layout (styles/ui.css, the portrait block) — the main menu, the
    // learn screen, the settings, and a level's own pause — so the banner stays down over those; H: never from the App
    // (portrait-only; the App comes back from the background into a level's pause)
    const cur = G.menus?.current;
    // I (LEARN §17): and every other screen she can reach from the App's main menu — the online hub and the room, the
    // loadout, the locker, how to play, the credits, a match's pause and its results; only PLAY's own (mode / setup) are left
    const portraitOk = cur === 'main' || cur === 'learn' || cur === 'settings' || (cur === 'pause' && learn) || PORTRAIT_SCREENS.has(cur);
    const armed = !FROM_APP && ((G.mode === 'match' && !!G.match && !learn) || (!!cur && cur !== 'loading' && cur !== 'title' && !portraitOk));
    // Guarded: this runs before the gate below, so an unguarded toggle here is a DOM write every frame of the match
    // whether or not anything changed. classList.toggle is cheap but it is not free, and it is not on the only path.
    if (armed !== this._armed) { this._armed = armed; this.rotateEl?.classList.toggle('is-armed', armed); }
    if (live === this.enabled) return;
    this.enabled = live;
    this.el.classList.toggle('is-live', live);
    this.releaseAll();
    if (!live) this.clearMap();     // otherwise the map latch survives and springs open on the next match
  }
}
