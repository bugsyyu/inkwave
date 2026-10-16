// 题即玩法 — the question strip (docs/PLAY.md §2.2): the one new piece of DOM. One or two lines at the top — the
// question as engine.prompt words it (its line, and its Chinese / instruction under it) and ▶ to hear it again — and,
// once she has answered, the verdict in the same place: 「答对了」 in her ink, or 「差一点：是 ___」 in coral with the first
// sentence of 为什么. It is not a card: it covers none of the stage below it, takes no focus, and only its button takes a
// touch (pointer-events on the button alone). Upright on a phone it sits under the HUD's clock row (where the walk bar
// is); otherwise top-centre under the clock. Text ≥ 17 pt, the button 44 pt. Styles from JS (as forms/ui.js does).
//
//   const S = new PlayStrip(hud)   (hud.root: #ui-root)
//   S.show(p, { replay })          p = the prompt ({ text, zh, tts }); replay() is ▶ (shown only when p.tts)
//   S.verdict({ ok, head, why })   S.question()  (back to the question line, e.g. for a retry)   S.hide()
//   S.rect() → the strip's box (CSS px) or null when hidden — the top of the safe area under it (src/learn/play/run.js)
//   S.fit(keys)                    clear of the touch layer's top-row keys (pause / map) — run.js calls it after show() / verdict
//   S.setInk(hex)                  her team colour
import { h, prefersReducedMotion, restartAnim, colorVars } from './ui-util.js';
import { GLYPHS } from './ui-icons.js';

const CSS = `
.iw-ps { position: absolute; inset: 0; pointer-events: none; z-index: 18; color: #fff;
  font-family: 'Rubik', system-ui, -apple-system, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif; -webkit-font-smoothing: antialiased;
  --self: #ff8a14; --self-ink: #15121c; --coral: #f08a7a; --lk: rgba(14, 12, 22, .9); --muted: #c3bdd6; }
.iw-ps.is-off { display: none; }
.iw-ps * { box-sizing: border-box; }
.iw-ps__box { position: absolute; left: 50%; top: calc(min(1vw, 1.7778vh) * 7.4); translate: -50% 0; width: max-content; max-width: min(680px, calc(100vw - 32px));
  display: flex; align-items: center; gap: 12px; padding: 8px 18px 8px 8px; border-radius: 22px; background: var(--lk);
  border: 1.5px solid rgba(255, 255, 255, .14); box-shadow: 0 6px 24px rgba(0, 0, 0, .35); }
.iw-ps__box.is-noplay { padding-left: 18px; }
.iw-ps__box.is-enter { animation: iw-ps-in .35s cubic-bezier(.34, 1.56, .64, 1) backwards; }
@keyframes iw-ps-in { from { opacity: 0; translate: -50% -8px; } }
.iw-ps__play { pointer-events: auto; flex: 0 0 auto; width: 44px; height: 44px; border-radius: 50%; border: 0; padding: 11px; cursor: pointer;
  background: rgba(255, 255, 255, .12); color: #fff; -webkit-tap-highlight-color: transparent; }
.iw-ps__play svg { display: block; width: 100%; height: 100%; }
.iw-ps__play.is-playing { background: var(--self); color: var(--self-ink); }
.iw-ps__play:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
.iw-ps__text, .iw-ps__verdict { display: block; flex: 1 1 auto; min-width: 0; line-height: 1.28; }
.iw-ps__q { display: block; font-size: 19px; font-weight: 800; letter-spacing: .01em; overflow-wrap: anywhere; }
.iw-ps__zh { display: block; margin-top: 2px; font-size: 17px; font-weight: 600; color: var(--muted); overflow-wrap: anywhere; }
.iw-ps__zh:empty { display: none; }
.iw-ps__verdict { display: none; }
.iw-ps__head { display: block; font-size: 19px; font-weight: 800; }
.iw-ps__why { display: block; margin-top: 2px; font-size: 17px; font-weight: 600; color: #e9e5f4; overflow-wrap: anywhere; }
.iw-ps__why:empty { display: none; }
.iw-ps.is-verdict .iw-ps__text { display: none; }
.iw-ps.is-verdict .iw-ps__verdict { display: block; }
.iw-ps.is-ok .iw-ps__box { border-color: var(--self); }
.iw-ps.is-ok .iw-ps__head { color: var(--self); }
.iw-ps.is-bad .iw-ps__box { border-color: var(--coral); }
.iw-ps.is-bad .iw-ps__head { color: var(--coral); }
.iw-ps__box.is-flash { animation: iw-ps-flash .5s ease-out; }
@keyframes iw-ps-flash { 0% { box-shadow: 0 0 0 0 var(--self), 0 6px 24px rgba(0,0,0,.35); } 100% { box-shadow: 0 0 0 14px transparent, 0 6px 24px rgba(0,0,0,.35); } }
@media (orientation: portrait) and (max-width: 640px) {
  .iw-ps__box { left: 10px; right: 10px; translate: none; width: auto; max-width: none; top: calc(var(--hudtop, 58px) + env(safe-area-inset-top)); }
  .iw-ps__box.is-enter { animation-name: iw-ps-in-up; }
  @keyframes iw-ps-in-up { from { opacity: 0; translate: 0 -8px; } }
}
@media (prefers-reduced-motion: reduce) { .iw-ps__box.is-enter, .iw-ps__box.is-flash { animation: none; } }
`;

let cssDone = false;
function ensureCss() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  document.head.appendChild(h('style', { id: 'iw-ps-css' }, CSS));
}

export class PlayStrip {
  constructor(hud) {
    ensureCss();
    this.hud = hud;
    this.q = h('b', { class: 'iw-ps__q' });
    this.zh = h('span', { class: 'iw-ps__zh' });
    this.play = h('button', { class: 'iw-ps__play', type: 'button', 'aria-label': '再听一遍', html: GLYPHS.speaker });
    this.play.addEventListener('click', (e) => { e.stopPropagation(); this._replay?.(); });
    this.head = h('b', { class: 'iw-ps__head' });
    this.why = h('span', { class: 'iw-ps__why' });
    this.text = h('div', { class: 'iw-ps__text' }, this.q, this.zh);
    this.verd = h('div', { class: 'iw-ps__verdict' }, this.head, this.why);
    this.box = h('div', { class: 'iw-ps__box' }, this.play, this.text, this.verd);
    this.el = h('div', { class: 'iw-ps is-off', role: 'status', 'aria-live': 'polite' }, this.box);
    (hud && hud.root ? hud.root : document.body).appendChild(this.el);
    this.on = false;
  }
  setInk(hex) { colorVars(this.el, 'self', hex || '#ff8a14'); }

  // keep clear of the touch layer's top-row keys (pause / map: `keys` = [{ x, y, w, h }], CSS px), which draw under it:
  // upright, where the strip spans the screen, a strip too tall for the room above them drops below them; otherwise the
  // centred strip is narrowed so it never reaches one beside the band it sits in
  fit(keys) {
    this._keys = keys || [];
    this.box.style.maxWidth = ''; this.box.style.top = '';
    if (!this.on || !this._keys.length) return;
    const b = this.box.getBoundingClientRect(), mid = b.left + b.width / 2;
    const upright = typeof matchMedia === 'function' && matchMedia('(orientation: portrait) and (max-width: 640px)').matches;
    if (upright) {
      let top = Infinity, bot = -Infinity;
      for (const k of this._keys) if (k.x < b.right && k.x + k.w > b.left && k.y + k.h > b.top) { top = Math.min(top, k.y); bot = Math.max(bot, k.y + k.h); }
      if (top < Infinity && b.bottom > top - 4) this.box.style.top = `${Math.round(bot + 6)}px`;
      return;
    }
    let half = Infinity;
    for (const k of this._keys) if (k.y < b.top + 140 && k.y + k.h > b.top) half = Math.min(half, k.x > mid ? k.x - mid - 10 : mid - (k.x + k.w) - 10);
    if (half < Infinity) this.box.style.maxWidth = `${Math.max(260, Math.floor(half * 2))}px`;
  }

  show(p, { replay } = {}) {
    this._replay = replay || null;
    this.q.textContent = p.text || '';
    this.zh.textContent = p.zh && p.zh !== p.text ? p.zh : '';
    const canPlay = !!(p.tts && replay);
    this.play.style.display = canPlay ? '' : 'none';
    this.box.classList.toggle('is-noplay', !canPlay);
    this.el.classList.remove('is-off', 'is-verdict', 'is-ok', 'is-bad');
    this.on = true;
    if (!prefersReducedMotion()) restartAnim(this.box, 'is-enter');
  }
  question() { this.el.classList.remove('is-verdict', 'is-ok', 'is-bad'); }
  verdict(v) {
    this.head.textContent = v.head || '';
    this.why.textContent = v.why || '';
    this.el.classList.add('is-verdict');
    this.el.classList.toggle('is-ok', !!v.ok); this.el.classList.toggle('is-bad', !v.ok);
    if (v.ok && !prefersReducedMotion()) restartAnim(this.box, 'is-flash');
    this.fit(this._keys);
  }
  playing(on) { this.play.classList.toggle('is-playing', !!on); }
  hide() { this.on = false; this.el.classList.add('is-off'); this._replay = null; }
  rect() {
    if (!this.on) return null;
    const b = this.box.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height, bottom: b.bottom };
  }
  dispose() { this.el.remove(); }
}
