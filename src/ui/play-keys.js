// 字弹 M4 (docs/PLAY.md §3 M4, §6.4) — the game's own keyboard. Never the system keyboard: in landscape iOS's eats
// half the screen and it autocorrects. a–z, space, ' -, ⌫, 射 (Enter) — plus . , ? for sentences — 提示 and an optional
// ▶. iOS-sized keys in portrait (≈ 34 × 50 at 390 wide), a wider three-row layout in landscape (≈ 50 × 44 at 844);
// the rects come from the pure keyboardLayout() (src/learn/play/type/keys.js), so the Node tests measure what is
// drawn. Built once per mode; a press only toggles classes. Physical keyboards type too (a capture-phase keydown that
// only swallows typing keys, and only while the keyboard is up — never Escape).
//
//   const keys = new PlayKeys(root, { mode: 'word' | 'sentence', color: '#ff8a14', replay: true })
//   keys.onKey = (k) => {}        a typed character ('a'…'z', ' ', "'", '-', '.', ',', '?')
//   keys.onBackspace = () => {}   ⌫
//   keys.onSubmit = (text) => {}  射 / Enter with what was typed (never empty)
//   keys.onHint = () => {}        提示 (the flow records H, per the host's rules)
//   keys.onReplay = () => {}      ▶
//   keys.show() · keys.hide() · keys.setMode(mode) · keys.setColor(hex) · keys.setText(text) · keys.clear()
//   keys.setHintUsed(bool) · keys.layout() · keys.destroy() · keys.text · keys.frac (share of the screen it covers)
//   keys.rect() — play-7: where it is on the screen (CSS px): { top, h, split, mid: { x0, x1 } | null, halves } — on a
//                 landscape screen the keyboard is two pads docked to the sides and the column mid.x0…mid.x1 is open
//                 from the top of the screen to the bottom (the typing frame goes there: src/learn/play/type/split.js)
//   PlayKeys.owns(event) — true for a pointer event on the keyboard (the touch layer must skip those, see §19)
// Nothing here knows an answer: no key, no text, no colour depends on whether anything is right (PLAY §1.3).
import { h, prefersReducedMotion } from './ui-util.js';
import { keyboardLayout, keyLabel, keyOfEvent, keysFor } from '../learn/play/type/keys.js';

const CSS = `
.iw-pk { position: fixed; left: 0; right: 0; bottom: 0; z-index: 19; pointer-events: none; --self: #ff8a14; --self-ink: #15121c; --k: #15121c; --k3: #2c2540;
  font-family: 'Titan One', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'WenQuanYi Zen Hei', sans-serif;
  -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; touch-action: manipulation; }
.iw-pk__panel { position: absolute; left: 0; right: 0; bottom: 0; pointer-events: auto; border-radius: 22px 22px 0 0;
  background: linear-gradient(180deg, rgba(31,27,42,.9), rgba(17,15,24,.94)); box-shadow: 0 -10px 34px rgba(0,0,0,.28), inset 0 1px 0 rgba(255,255,255,.12);
  transform: translateY(0); transition: transform .42s cubic-bezier(.2,1.3,.4,1), opacity .2s; }
.iw-pk.is-off .iw-pk__panel { transform: translateY(110%); pointer-events: none; }
.iw-pk__panel::before { content: ''; position: absolute; left: 50%; top: 5px; width: 38px; height: 4px; margin-left: -19px; border-radius: 3px; background: rgba(255,255,255,.16); }
/* the keycaps are the original's input glyphs (styles/ui.css .iw-key): a cool white cap, an ink outline, a solid ink drop
   under it, a lilac lip at its foot; a press sinks it into its drop on the same frame (and lights it in her ink), the
   release springs back. Outline and drop are box-shadows: the keys' boxes (keyboardLayout) do not move a pixel */
.iw-pk__k { position: absolute; display: grid; place-items: center; box-sizing: border-box; border: 0; padding: 0; margin: 0; cursor: pointer;
  border-radius: 11px; background: linear-gradient(180deg, #fff, #ebe8f3); color: var(--k); font-size: 23px; line-height: 1; font-weight: 400; font-family: inherit;
  box-shadow: 0 0 0 2px var(--k), 0 3px 0 2px var(--k), inset 0 -3px 0 #c9c4d8; transform: translateY(0) scale(1); transition: transform .16s cubic-bezier(.2,1.6,.4,1), box-shadow .16s, background-color .1s;
  -webkit-tap-highlight-color: transparent; touch-action: manipulation; }
.iw-pk__k span { pointer-events: none; transform: translateY(-1px); }
.iw-pk__k.is-wide { font-size: 19px; }
.iw-pk__k.is-space::after { content: ''; width: 34%; height: 5px; border-radius: 3px; background: rgba(21,18,28,.16); }
.iw-pk__k.is-back { background: linear-gradient(180deg, #3a3350, var(--k3)); color: #fff; box-shadow: 0 0 0 2px var(--k), 0 3px 0 2px var(--k), inset 0 2px 0 rgba(255,255,255,.14); }
.iw-pk__k.is-fire { background: linear-gradient(180deg, color-mix(in srgb, var(--self) 82%, #fff), var(--self)); color: var(--self-ink); font-size: 24px;
  box-shadow: 0 0 0 2px var(--k), 0 3px 0 2px var(--k), inset 0 -3px 0 color-mix(in srgb, var(--self) 72%, #000); gap: 6px; grid-auto-flow: column; }
.iw-pk__k.is-fire svg { width: 22px; height: 22px; }
.iw-pk__k svg { display: block; width: 26px; height: 26px; pointer-events: none; }
.iw-pk__k.is-down { transform: translateY(3px) scale(.97); box-shadow: 0 0 0 2px var(--k), 0 0 0 2px var(--k), inset 0 -1px 0 rgba(0,0,0,.12); background: var(--self); color: var(--self-ink); transition-duration: 0s; }
.iw-pk__k.is-back.is-down { background: #231d33; color: #fff; }
.iw-pk__k.is-pop { animation: iw-pk-pop .32s cubic-bezier(.2,1.6,.4,1); }
@keyframes iw-pk-pop { 0% { transform: translateY(3px) scale(.92); } 60% { transform: translateY(-2px) scale(1.04); } 100% { transform: none; } }
.iw-pk__b { position: absolute; box-sizing: border-box; border-radius: 999px; border: 2px solid rgba(255,255,255,.22); background: #2c2540; color: #fff;
  display: grid; place-items: center; cursor: pointer; font-size: 17px; line-height: 1; font-weight: 400; font-family: inherit; padding: 0; -webkit-tap-highlight-color: transparent;
  box-shadow: 0 0 0 2px #15121c, 0 3px 0 2px #15121c; }
.iw-pk__b.is-hint { color: #ffd76a; border-color: rgba(255,215,106,.55); }
.iw-pk__b.is-hint.is-used { opacity: .45; }
.iw-pk__b.is-down { transform: translateY(2px) scale(.96); background: #3a3152; box-shadow: 0 0 0 2px #15121c, 0 1px 0 2px #15121c; }
.iw-pk__b svg { width: 20px; height: 20px; }
.iw-pk__strip { position: absolute; box-sizing: border-box; border-radius: 14px; background: rgba(0,0,0,.32); box-shadow: inset 0 2px 4px rgba(0,0,0,.35);
  display: flex; align-items: center; justify-content: flex-end; padding: 0 14px; overflow: hidden; white-space: pre; color: #fff; font-size: 21px; line-height: 1; font-weight: 400; font-family: inherit; letter-spacing: .03em; }
.iw-pk__strip i { display: inline-block; width: 3px; height: 24px; margin-left: 3px; border-radius: 2px; background: var(--self); animation: iw-pk-caret 1s steps(1) infinite; }
.iw-pk__strip b { font-weight: 400; }
.iw-pk__strip.is-empty b { color: rgba(255,255,255,.35); font-family: 'Rubik', 'PingFang SC', system-ui, sans-serif; font-size: 15px; font-weight: 600; letter-spacing: 0; }
@keyframes iw-pk-caret { 50% { opacity: 0; } }
.iw-pk.is-off .iw-pk__strip i { animation-play-state: paused; }   /* (the keyboard away: the caret stops blinking — LEARN §50) */
.iw-pk.is-landscape .iw-pk__k { font-size: 21px; border-radius: 10px; }
/* play-7: the landscape split — the panel is only a frame for two pads docked to the sides; the column between them is
   the world's (no background, no touches: they go on to the game) */
.iw-pk__half { position: absolute; display: none; pointer-events: auto; background: linear-gradient(180deg, rgba(31,27,42,.9), rgba(17,15,24,.94));
  box-shadow: 0 -8px 26px rgba(0,0,0,.26), inset 0 1px 0 rgba(255,255,255,.12); }
.iw-pk__half.is-l { border-radius: 0 22px 0 0; } .iw-pk__half.is-r { border-radius: 22px 0 0 0; }
.iw-pk.is-split .iw-pk__panel { background: none; box-shadow: none; border-radius: 0; pointer-events: none; }
.iw-pk.is-split .iw-pk__panel::before { display: none; }
.iw-pk.is-split .iw-pk__half { display: block; }
.iw-pk.is-split .iw-pk__k, .iw-pk.is-split .iw-pk__b { pointer-events: auto; }
.iw-pk.is-split.is-off .iw-pk__half, .iw-pk.is-split.is-off .iw-pk__k, .iw-pk.is-split.is-off .iw-pk__b { pointer-events: none; }
@media (prefers-reduced-motion: reduce) {
  .iw-pk__panel { transition: opacity .2s; } .iw-pk.is-off .iw-pk__panel { transform: none; opacity: 0; }
  .iw-pk__k, .iw-pk__k.is-pop { transition: none; animation: none; } .iw-pk__strip i { animation: none; } }
`;

const ICON = {
  back: '<svg viewBox="0 0 32 32"><path d="M12.5 7h13a3.5 3.5 0 0 1 3.5 3.5v11a3.5 3.5 0 0 1-3.5 3.5h-13L3 16z" fill="currentColor"/><path d="M15 12l7 8M22 12l-7 8" stroke="#2f2944" stroke-width="3" stroke-linecap="round"/></svg>',
  fire: '<svg viewBox="0 0 32 32"><path d="M29 15c0-6-8-9-12-5-3 3-3 8 1 11 4 3 11 1 11-6z" fill="currentColor"/><path d="M11 10H3M11 16H1M12 22H4" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>',
  replay: '<svg viewBox="0 0 24 24"><path d="M7 4.5v15l12.5-7.5z" fill="currentColor"/></svg>',
};

let cssDone = false;
function ensureCss() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  document.head.appendChild(h('style', { id: 'iw-pk-css' }, CSS));
}

/** env(safe-area-inset-*) in px, read through a probe element */
function safeInsets() {
  if (typeof document === 'undefined') return { top: 0, right: 0, bottom: 0, left: 0 };
  const p = h('div', { style: 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)' });
  document.body.appendChild(p);
  const cs = getComputedStyle(p), r = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
  p.remove();
  return r;
}

export class PlayKeys {
  constructor(root = (typeof document !== 'undefined' && (document.getElementById('ui-root') || document.body)), o = {}) {
    ensureCss();
    this.mode = o.mode === 'sentence' ? 'sentence' : 'word';
    this.replay = o.replay !== false;
    this.text = '';
    this.enabled = true; this.visible = true;
    this.onKey = null; this.onBackspace = null; this.onSubmit = null; this.onHint = null; this.onReplay = null;
    this.el = h('div', { class: 'iw-pk', role: 'group', 'aria-label': '键盘' });
    this.panel = h('div', { class: 'iw-pk__panel' });
    this.el.appendChild(this.panel);
    // (play-7: the split's two pads, behind the keys; shown only in landscape)
    this.halfEls = [h('div', { class: 'iw-pk__half is-l' }), h('div', { class: 'iw-pk__half is-r' })];
    for (const el of this.halfEls) this.panel.appendChild(el);
    this.strip = h('div', { class: 'iw-pk__strip is-empty', 'aria-live': 'polite' }, h('b', null, '打字，按「射」发射'), h('i'));
    this.panel.appendChild(this.strip);
    this.keyEls = new Map(); this.btnEls = new Map();
    // every key either mode can need, built once; a layout only places / hides them
    for (const k of keysFor('sentence')) {
      const wide = k === 'back' || k === 'fire' || k === ' ';
      const el = h('button', { type: 'button', class: 'iw-pk__k' + (wide ? ' is-wide' : '') + (k === ' ' ? ' is-space' : '') + (k === 'back' ? ' is-back' : '') + (k === 'fire' ? ' is-fire' : ''),
        'aria-label': k === ' ' ? '空格' : k === 'back' ? '删除' : k === 'fire' ? '射' : k, tabindex: '-1', data: { k } });
      if (k === 'back') el.innerHTML = ICON.back;
      else if (k === 'fire') el.innerHTML = '<span>射</span>' + ICON.fire;
      else if (k !== ' ') el.appendChild(h('span', null, keyLabel(k)));
      this.keyEls.set(k, el); this.panel.appendChild(el);
    }
    for (const id of ['hint', 'replay']) {
      const el = h('button', { type: 'button', class: 'iw-pk__b is-' + id, 'aria-label': id === 'hint' ? '提示' : '再听', tabindex: '-1', data: { b: id } });
      if (id === 'hint') el.textContent = '提示'; else el.innerHTML = ICON.replay;
      this.btnEls.set(id, el); this.panel.appendChild(el);
    }
    // pointerdown, not click: the key acts the moment the finger lands (two-thumb typing)
    this._down = (e) => {
      const t = e.target.closest && e.target.closest('[data-k],[data-b]');
      if (!t || !this.enabled || !this.visible) return;
      e.preventDefault(); e.stopPropagation();
      if (t.dataset.k != null) this._press(t.dataset.k, t, e.pointerId);
      else this._button(t.dataset.b, t);
    };
    this._up = (e) => { if (e.pointerId === this._repeatId) this._stopRepeat(); };
    this.panel.addEventListener('pointerdown', this._down);
    addEventListener('pointerup', this._up, true); addEventListener('pointercancel', this._up, true);
    this.panel.addEventListener('contextmenu', (e) => e.preventDefault());
    // physical keys (capture phase: before the game's own key handling sees a letter as a move key)
    this._kd = (e) => {
      if (!this.enabled || !this.visible) return;
      const a = document.activeElement; if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return;
      const k = keyOfEvent(e, this.mode); if (!k) return;
      e.preventDefault(); e.stopImmediatePropagation();
      if (e.repeat && k !== 'back') return;
      this._press(k, this.keyEls.get(k));
    };
    addEventListener('keydown', this._kd, true);
    this._rs = () => this.layout();
    addEventListener('resize', this._rs); addEventListener('orientationchange', this._rs);
    if (o.color) this.setColor(o.color);
    if (root) root.appendChild(this.el);
    this.layout();
  }

  /** is this pointer event on the keyboard? (the touch layer must not treat it as a stick / look drag) */
  static owns(e) { return !!(e && e.target && e.target.closest && e.target.closest('.iw-pk__panel')); }

  get frac() { return this._layout && typeof innerHeight !== 'undefined' ? this._layout.h / innerHeight : 0.4; }
  /** play-7: where the keyboard is (CSS px) — { top, h, split, mid: { x0, x1 } | null, halves } (null before a layout) */
  rect() {
    const L = this._layout; if (!L) return null;
    return { top: L.top, h: L.h, split: !!L.split, mid: L.mid ? { x0: L.mid.x0, x1: L.mid.x1 } : null, halves: L.halves ? L.halves.map((r) => ({ ...r })) : null };
  }

  layout() {
    if (typeof innerWidth === 'undefined') return null;
    const L = keyboardLayout({ w: innerWidth, h: innerHeight }, safeInsets(), this.mode, { replay: this.replay });
    this._layout = L;
    this.el.classList.toggle('is-landscape', L.orient === 'landscape');
    this.el.classList.toggle('is-split', !!L.split);
    this.panel.style.height = L.h + 'px';
    const top = L.top, place = (el, r) => { el.style.left = r.x + 'px'; el.style.top = (r.y - top) + 'px'; el.style.width = r.w + 'px'; el.style.height = r.h + 'px'; el.style.display = ''; };
    if (L.halves) L.halves.forEach((r, i) => place(this.halfEls[i], r));
    // (play-7: the left pad's inner edge, for the typing strip that sits over it — src/learn/play/landscape.js)
    if (typeof document !== 'undefined') document.documentElement.style.setProperty('--iw-pk-side', L.mid ? L.mid.x0 + 'px' : '0px');
    const used = new Set();
    for (const r of L.keys) { const el = this.keyEls.get(r.key); if (el) { place(el, r); used.add(r.key); } }
    for (const [k, el] of this.keyEls) if (!used.has(k)) el.style.display = 'none';
    const ub = new Set();
    for (const b of L.buttons) { const el = this.btnEls.get(b.id); if (el) { place(el, b); ub.add(b.id); } }
    for (const [id, el] of this.btnEls) if (!ub.has(id)) el.style.display = 'none';
    if (L.strip) { place(this.strip, L.strip); } else this.strip.style.display = 'none';
    return L;
  }

  setMode(mode) { const m = mode === 'sentence' ? 'sentence' : 'word'; if (m !== this.mode) { this.mode = m; this.layout(); } return this; }
  setColor(hex) {
    this.el.style.setProperty('--self', hex);
    const n = parseInt(String(hex).replace('#', ''), 16), r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    this.el.style.setProperty('--self-ink', (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.55 ? '#15121c' : '#ffffff');
    return this;
  }
  setText(text) {
    this.text = String(text || '');
    const b = this.strip.querySelector('b');
    this.strip.classList.toggle('is-empty', !this.text);
    b.textContent = this.text || '打字，按「射」发射';
    return this;
  }
  clear() { return this.setText(''); }
  setHintUsed(used) { this.btnEls.get('hint').classList.toggle('is-used', !!used); return this; }
  show() { this.visible = true; this.el.classList.remove('is-off'); return this; }
  hide() { this.visible = false; this.el.classList.add('is-off'); this._stopRepeat(); return this; }

  _flash(el) {
    if (!el) return;
    el.classList.remove('is-pop'); el.classList.add('is-down');
    clearTimeout(el._t);
    el._t = setTimeout(() => { el.classList.remove('is-down'); if (!prefersReducedMotion()) { void el.offsetWidth; el.classList.add('is-pop'); } }, 90);
  }
  _press(k, el, pointerId) {
    this._flash(el);
    if (k === 'back') {
      this.text = this.text.slice(0, -1); this.setText(this.text);
      this.onBackspace && this.onBackspace();
      if (pointerId != null) this._startRepeat(pointerId);
      return;
    }
    if (k === 'fire') {
      if (!this.text.trim()) return;
      const t = this.text;
      this.onSubmit && this.onSubmit(t);
      return;
    }
    if (k.length !== 1) return;
    this.setText(this.text + k);
    this.onKey && this.onKey(k);
  }
  _button(id, el) {
    el.classList.add('is-down'); setTimeout(() => el.classList.remove('is-down'), 120);
    if (id === 'hint') this.onHint && this.onHint();
    else if (id === 'replay') this.onReplay && this.onReplay();
  }
  // holding ⌫ repeats (like the system keyboard): after 0.42 s, every 0.085 s
  _startRepeat(id) {
    this._stopRepeat(); this._repeatId = id;
    this._rt = setTimeout(() => { this._ri = setInterval(() => { if (!this.text) return this._stopRepeat(); this._press('back', this.keyEls.get('back')); }, 85); }, 420);
  }
  _stopRepeat() { clearTimeout(this._rt); clearInterval(this._ri); this._repeatId = null; }

  destroy() {
    this._stopRepeat();
    removeEventListener('keydown', this._kd, true); removeEventListener('resize', this._rs); removeEventListener('orientationchange', this._rs);
    removeEventListener('pointerup', this._up, true); removeEventListener('pointercancel', this._up, true);
    this.el.remove();
  }
}
