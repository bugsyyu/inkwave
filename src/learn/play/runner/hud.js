// 墨浪跑酷 — the little DOM the runner needs, until play-1's question strip (src/ui/play-strip.js, PLAY §2.2) lands:
//   · the strip (a STAND-IN for play-strip.js): the question in Chinese (+ the English it asks about), ▶ 再听 (44 pt);
//     for banner rows the options by lane letter (左 A · B · C 右) — a 41-character option cannot be read off a curtain
//     at 390 px until the last second, so the strip carries it at 15 px+
//   · the verdict line under it: 「差一点：是 ___」 in coral, or her ink for a right one
//   · the controls hint at the start (swipes on a phone, keys on a keyboard) and the one-time 「横过来更好玩」 in portrait
//   · the 滑行段 tag (typed items: clearly a placeholder — the typing weapon is the next workstream's)
// Nothing here takes a touch except its own buttons (pointer-events only on them); it never covers the road's middle.
import { h, colorVars } from '../../../ui/ui-util.js';
import { GLYPHS } from '../../../ui/ui-icons.js';
import { G } from '../../../core/ctx.js';
import { say, stop } from '../../audio.js';

const HINT_KEY = 'inkwave:runner:rotateHint';
const CSS = `
.iw-run { position: absolute; inset: 0; pointer-events: none; z-index: 16; font-family: 'Rubik', system-ui, sans-serif; color: #fff; --self: #ff8a14; --self-ink: #15121c; --coral: #f08a7a; }
.iw-run * { box-sizing: border-box; }
.iw-run svg { display: block; width: 100%; height: 100%; }
.iw-run__strip { position: absolute; left: 50%; top: 70px; translate: -50% 0; width: min(640px, calc(100vw - 32px)); display: none; flex-direction: column; gap: 6px; padding: 10px 12px 10px 16px; border-radius: 18px; background: rgba(21,18,28,.78); border: 1px solid rgba(255,255,255,.12); box-shadow: 0 10px 30px rgba(0,0,0,.35); }
.iw-run__strip.is-on { display: flex; animation: iw-run-in .32s cubic-bezier(.2,1.4,.4,1) backwards; }
@keyframes iw-run-in { from { opacity: 0; translate: -50% -10px; } }
.iw-run__row { display: flex; align-items: center; gap: 10px; }
.iw-run__tag { flex: none; padding: 4px 9px; border-radius: 999px; background: var(--self); color: var(--self-ink); font-size: 12px; font-weight: 800; letter-spacing: .04em; }
.iw-run__tag.is-beat { background: #ffd21a; color: #15121c; }
.iw-run__tag.is-stub { background: repeating-linear-gradient(135deg, #3a3550 0 6px, #2a2540 6px 12px); color: #e9e5f4; border: 1px dashed #a9a3b8; }
.iw-run__q { flex: 1; min-width: 0; font-size: 19px; font-weight: 800; line-height: 1.25; }
.iw-run__zh { font-size: 15px; font-weight: 600; color: #cfc9dc; line-height: 1.35; }
.iw-run__play { flex: none; width: 44px; height: 44px; border-radius: 50%; border: 0; background: rgba(255,255,255,.14); color: #fff; padding: 11px; cursor: pointer; pointer-events: auto; }
.iw-run__play.is-playing { background: var(--self); color: var(--self-ink); }
.iw-run__opts { display: flex; gap: 6px; align-items: stretch; }
.iw-run__opts span { flex: 1; min-width: 0; padding: 5px 8px; border-radius: 10px; background: rgba(255,255,255,.08); font-size: 14px; line-height: 1.3; font-weight: 700; }
.iw-run__opts span b { color: var(--self); margin-right: 4px; }
.iw-run__opts span small { display: block; color: #a9a3b8; font-size: 12px; font-weight: 600; }
.iw-run__opts span.is-here { background: rgba(255,255,255,.2); }
.iw-run__verdict { position: absolute; left: 50%; top: 0; translate: -50% 0; max-width: calc(100vw - 32px); padding: 8px 16px; border-radius: 999px; background: rgba(21,18,28,.82); font-size: 17px; font-weight: 800; opacity: 0; transition: opacity .2s; text-align: center; }
.iw-run__verdict.is-on { opacity: 1; }
.iw-run__verdict.is-coral { color: var(--coral); }
.iw-run__verdict.is-ok { color: var(--self); }
.iw-run__verdict small { display: block; font-size: 13px; font-weight: 600; color: #cfc9dc; }
.iw-run__hint { position: absolute; left: 50%; bottom: 28px; translate: -50% 0; padding: 10px 18px; border-radius: 999px; background: rgba(21,18,28,.72); font-size: 15px; font-weight: 700; white-space: nowrap; opacity: 0; transition: opacity .4s; }
.iw-run__hint.is-on { opacity: 1; }
.iw-run__rotate { position: absolute; left: 50%; bottom: 14px; translate: -50% 0; display: none; align-items: center; gap: 6px; padding: 0 0 0 16px; border-radius: 999px; background: rgba(21,18,28,.82); border: 1px solid rgba(255,255,255,.14); font-size: 15px; font-weight: 700; white-space: nowrap; pointer-events: auto; }
.iw-run__rotate.is-on { display: flex; }
.iw-run__rotate i { font-style: normal; font-size: 18px; }
.iw-run__rotate button { width: 44px; height: 44px; border: 0; background: none; color: #cfc9dc; padding: 13px; cursor: pointer; }
@media (max-width: 640px) and (orientation: portrait) { .iw-run__strip { top: 122px; } .iw-run__q { font-size: 18px; } }
/* the options by lane: always for banner rows; for short labels only upright (a phone held upright sees the curtains
   small until the last second; turned, the curtains read on their own) */
@media (orientation: landscape) { .iw-run__opts.is-lite { display: none !important; } }
/* the race standings (forms/ui.js) upright: just her own line, so it never runs into the strip */
@media (max-width: 640px) and (orientation: portrait) { .iw-lf.is-runner .iw-lf__rank { top: 84px; } .iw-lf.is-runner .iw-lf__rank div:not(.is-me) { display: none; } }
@media (max-height: 460px) and (orientation: landscape) { .iw-run__strip { top: 52px; width: min(560px, calc(100vw - 380px)); padding: 6px 10px 6px 12px; } .iw-run__q { font-size: 17px; } .iw-run__zh { font-size: 14px; } .iw-run__hint { bottom: 14px; } }
@media (prefers-reduced-motion: reduce) { .iw-run__strip.is-on { animation: none; } }
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

export class RunnerHud {
  constructor(hud) {
    ensureCss();
    this.hud = hud;
    this.tag = h('span', { class: 'iw-run__tag' });
    this.q = h('div', { class: 'iw-run__q' });
    this.zh = h('div', { class: 'iw-run__zh' });
    this.playBtn = h('button', { class: 'iw-run__play', type: 'button', 'aria-label': '再听' }, h('i', { html: GLYPHS.speaker }));
    this.playBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); });
    this.playBtn.addEventListener('click', () => this.replay());
    this.opts = h('div', { class: 'iw-run__opts' });
    this.strip = h('div', { class: 'iw-run__strip', role: 'status', 'aria-live': 'polite' },
      h('div', { class: 'iw-run__row' }, this.tag, h('div', { class: 'iw-run__q' }), this.playBtn), this.zh, this.opts);
    this.strip.querySelector('.iw-run__q').replaceWith(this.q);
    this.verdict = h('div', { class: 'iw-run__verdict' });
    this.hint = h('div', { class: 'iw-run__hint' });
    const x = h('button', { type: 'button', 'aria-label': '知道了' }, h('i', { html: GLYPHS.close }));
    x.addEventListener('click', () => this.dismissRotate());
    this.rotate = h('div', { class: 'iw-run__rotate' }, h('i', null, '⟲'), h('span', null, '横过来更好玩'), x);
    this.el = h('div', { class: 'iw-run' }, this.strip, this.verdict, this.hint, this.rotate);
    (hud && hud.root ? hud.root : document.body).appendChild(this.el);
    colorVars(this.el, 'self', (G.teamHex || [])[0] || '#ff8a14');
    this.tts = null; this._vT = 0; this._hT = 0; this._rT = 0;
  }

  // a row's question: tag ('lane' | 'beat' | 'glide'), p (the row's prompt), opts: [{ tag, en, zh }] in lane order,
  // banner: long labels (the options always show then; otherwise only upright — CSS)
  ask(kind, p, opts = null, banner = false) {
    this.tag.className = 'iw-run__tag' + (kind === 'beat' ? ' is-beat' : kind === 'glide' ? ' is-stub' : '');
    this.tag.textContent = kind === 'beat' ? '踩拍换道' : kind === 'glide' ? '滑行段 · 占位' : '选一条道';
    this.q.textContent = p.text || '';
    this.zh.textContent = p.zh || '';
    this.zh.style.display = p.zh ? '' : 'none';
    this.tts = p.tts || null;
    this.playBtn.style.display = this.tts ? '' : 'none';
    this.opts.innerHTML = '';
    if (opts && opts.length) for (const o of opts) this.opts.append(h('span', null, h('b', null, o.tag), o.en, o.zh ? h('small', null, o.zh) : null));
    this.opts.style.display = opts && opts.length ? '' : 'none';
    this.opts.classList.toggle('is-lite', !banner);
    this.strip.classList.remove('is-on'); void this.strip.offsetWidth; this.strip.classList.add('is-on');
    this._place();
  }
  here(lane) { [...this.opts.children].forEach((c, i) => c.classList.toggle('is-here', i === lane)); }
  clear() { this.strip.classList.remove('is-on'); this.tts = null; }
  speak(text, o) {
    if (!text) return;
    this.playBtn.classList.add('is-playing');
    say(text, { slow: !!(o && o.slow), onEnd: () => this.playBtn.classList.remove('is-playing') });
  }
  replay() { if (this.tts) { G.hud?.playSound?.('ui_click'); this.speak(this.tts); } }

  // the verdict line: ok → her ink; else coral 「差一点：是 ___」 (+ the why, small)
  say(ok, text, why = '', ms = 2400) {
    this.verdict.className = 'iw-run__verdict is-on ' + (ok ? 'is-ok' : 'is-coral');
    this.verdict.innerHTML = '';
    this.verdict.append(h('span', null, text));
    if (why) this.verdict.append(h('small', null, why));
    this._place();
    this._vT = ms / 1000;
  }
  _place() {   // under the strip
    const r = this.strip.classList.contains('is-on') ? this.strip.getBoundingClientRect() : null;
    this.verdict.style.top = `${Math.round(r ? r.bottom + 8 : 120)}px`;
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
    if (this._vT > 0 && (this._vT -= dt) <= 0) this.verdict.classList.remove('is-on');
    if (this._hT > 0 && (this._hT -= dt) <= 0) this.hint.classList.remove('is-on');
    if (this._rT > 0 && (this._rT -= dt) <= 0) this.rotate.classList.remove('is-on');
    if (this.rotate.classList.contains('is-on') && innerWidth > innerHeight) this.rotate.classList.remove('is-on');
  }
  end() { stop(); this.el.remove(); }
}
