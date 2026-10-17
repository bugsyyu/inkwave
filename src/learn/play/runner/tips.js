// 墨浪跑酷 — the little that is the runner's own on the screen, beside play-1's question strip (src/ui/play-strip.js:
// the question, ▶ 再听, the lanes' cells, the verdict — one strip for every play kind, play-4):
//   · the controls hint at the start (swipes on a phone, keys on a keyboard), a few seconds
//   · the one-time 「横过来更好玩」 upright on a phone (PLAY §8: once, dismissable, never again — localStorage, wrapped)
//   · CSS for the runner's screen: the strip under the standings upright (and the standings down to her own line), no
//     crosshair, only ⏸ of the thumb cluster (swipes steer: src/core/touch.js's swipe hook)
// Nothing here takes a touch except the ✕ of the rotate prompt.
import { h } from '../../../ui/ui-util.js';
import { GLYPHS } from '../../../ui/ui-icons.js';
import { G } from '../../../core/ctx.js';

const HINT_KEY = 'inkwave:runner:rotateHint';
const CSS = `
.iw-run { position: absolute; inset: 0; pointer-events: none; z-index: 16; font-family: 'Rubik', system-ui, sans-serif; color: #fff;
  --k: #15121c; --lk: linear-gradient(170deg, rgba(40, 33, 60, .94), rgba(22, 18, 32, .94)); }
.iw-run * { box-sizing: border-box; }
.iw-run svg { display: block; width: 100%; height: 100%; }
/* (INKWAVE's sticker look, styles/hud.css: an ink outline and a solid ink shadow under it) */
.iw-run__hint { position: absolute; left: 50%; bottom: 28px; translate: -50% 0; padding: 10px 18px; border-radius: 999px; background: var(--lk); border: 1.5px solid rgba(255,255,255,.2);
  box-shadow: 0 0 0 2px var(--k), 0 3px 0 2px var(--k); font-size: 15px; font-weight: 700; white-space: nowrap; opacity: 0; transition: opacity .4s; }
.iw-run__hint.is-on { opacity: 1; }
.iw-run__rotate { position: absolute; left: 50%; bottom: 14px; translate: -50% 0; display: none; align-items: center; gap: 6px; padding: 0 0 0 16px; border-radius: 999px; background: var(--lk); border: 1.5px solid rgba(255,255,255,.2);
  box-shadow: 0 0 0 2px var(--k), 0 3px 0 2px var(--k); font-size: 15px; font-weight: 700; white-space: nowrap; pointer-events: auto; }
.iw-run__rotate.is-on { display: flex; }
.iw-run__rotate i { font-style: normal; font-size: 18px; }
.iw-run__rotate button { width: 44px; height: 44px; border: 0; background: none; color: #cfc9dc; padding: 13px; cursor: pointer; }
@media (max-height: 460px) and (orientation: landscape) { .iw-run__hint { bottom: 14px; } }
/* the strip (play-strip.js) in the runner: under the standings upright, narrower than the standings' column in landscape */
@media (max-width: 640px) and (orientation: portrait) { .iw-ps.is-runner .iw-ps__box { top: 122px; } .iw-lf.is-runner .iw-lf__rank { top: 84px; } .iw-lf.is-runner .iw-lf__rank div:not(.is-me) { display: none; } }
@media (max-height: 460px) and (orientation: landscape) { .iw-ps.is-runner .iw-ps__box { max-width: min(560px, calc(100vw - 300px)); padding: 6px 12px 6px 6px; } .iw-ps.is-runner .iw-ps__q { font-size: 17px; } .iw-ps.is-runner .iw-ps__zh { font-size: 15px; } }
/* the 滑行段 on a landscape phone (play-4): the band between the strip and the game keyboard (44 % of the height) is what
   the typewriter gets — the strip goes up to the top edge, one tight line, no ▶ (the keyboard has its own ▶ and 提示 at
   the start of its rows), so the rig is framed about twice as tall (glide.js frames to the strip's real bottom edge) */
@media (max-height: 460px) and (orientation: landscape) {
  .iw-ps.is-runner.is-typing .iw-ps__box { top: 6px; padding: 4px 12px; gap: 8px; border-radius: 16px; }
  .iw-ps.is-runner.is-typing .iw-ps__play { display: none; }
  .iw-ps.is-runner.is-typing .iw-ps__q, .iw-ps.is-runner.is-typing .iw-ps__head { font-size: 17px; }
  .iw-ps.is-runner.is-typing .iw-ps__zh, .iw-ps.is-runner.is-typing .iw-ps__why { font-size: 15px; }
}
/* nothing is aimed in the runner: no crosshair / ink tank cluster */
.iw-hud.is-runner .iw-xh { display: none; }
/* the thumb cluster is not used here: swipes steer (src/core/touch.js swipe hook); only ⏸ stays */
.iw-touch.is-runner .iw-touch__btn:not(:nth-child(8)) { display: none; }
`;
let cssDone = false;
function ensureCss() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  document.head.appendChild(h('style', { id: 'iw-run-css' }, CSS));
}
const store = { get: (k) => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } } };

export class RunnerTips {
  constructor(hud) {
    ensureCss();
    this.hint = h('div', { class: 'iw-run__hint' });
    const x = h('button', { type: 'button', 'aria-label': '知道了' }, h('i', { html: GLYPHS.close }));
    x.addEventListener('click', () => this.dismissRotate());
    this.rotate = h('div', { class: 'iw-run__rotate' }, h('i', null, '⟲'), h('span', null, '横过来更好玩'), x);
    this.el = h('div', { class: 'iw-run' }, this.hint, this.rotate);
    (hud && hud.root ? hud.root : document.body).appendChild(this.el);
    this._hT = 0; this._rT = 0;
  }
  showHint(text, s = 4.5) { this.hint.textContent = text; this.hint.classList.add('is-on'); this._hT = s; }

  // 「横过来更好玩」: once, upright only, gone on ✕ or after 9 s; never again (localStorage, wrapped)
  maybeRotate() {
    if (typeof innerWidth === 'undefined' || innerHeight <= innerWidth || store.get(HINT_KEY)) return false;
    store.set(HINT_KEY, '1');
    this.rotate.classList.add('is-on'); this._rT = 9;
    return true;
  }
  dismissRotate() { this.rotate.classList.remove('is-on'); this._rT = 0; G.hud?.playSound?.('ui_click'); }

  update(dt) {
    if (this._hT > 0 && (this._hT -= dt) <= 0) this.hint.classList.remove('is-on');
    if (this._rT > 0 && (this._rT -= dt) <= 0) this.rotate.classList.remove('is-on');
    if (this.rotate.classList.contains('is-on') && innerWidth > innerHeight) this.rotate.classList.remove('is-on');
  }
  end() { this.el.remove(); }
}
