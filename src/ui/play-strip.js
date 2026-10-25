// 题即玩法 — the question strip (docs/PLAY.md §2.2): the one new piece of DOM. One or two lines at the top — the
// question as engine.prompt words it (its line, and its Chinese / instruction under it) and ▶ to hear it again — and,
// once she has answered, the verdict in the same place: 「答对了」 in her ink, or 「差一点：是 ___」 in coral with the first
// sentence of 为什么. It is not a card: it covers none of the stage below it, takes no focus, and only its button takes a
// touch (pointer-events on the button alone). Upright on a phone it sits under the HUD's clock row (where the walk bar
// is); otherwise top-centre under the clock. Text ≥ 17 pt, the button 44 pt. Styles from JS (as forms/ui.js does).
//
//   const S = new PlayStrip(hud)   (hud.root: #ui-root)
//   S.show(p, { replay })          p = the prompt ({ text, zh, tts }); replay() is ▶ (shown only when p.tts)
//   S.verdict({ ok, head, why, actions? })   S.question()  (back to the question line, e.g. for a retry)   S.hide()
//   S.rect() → the strip's box (CSS px) or null when hidden — the top of the safe area under it (src/learn/play/run.js)
//   S.fit(keys)                    clear of the touch layer's top-row keys (pause / map) — run.js calls it after show()
//   S.setInk(hex)                  her team colour
// 墨浪跑酷 (play-4, docs/LEARN.md §20 「接口」: the runner asks two things more of the strip, inside the same box):
//   S.show(p, { replay, tag: { text, kind }, lanes: [{ tag, en, zh }], lite })   a chip before the question (选一条道 /
//                                  踩拍换道 / 打字 · 射) and the options by lane under it (lite: only on a phone held
//                                  upright — the curtains read on their own once the phone is turned)
//   S.here(i)                      the lane she is lined up with (its cell brightens)
//   S.verdict(v, { ms })           a timed verdict: the strip hides itself after ms — unless the next question comes
//                                  first, then the verdict moves to a note line under the box for the rest of its time
//                                  (she is still moving: the next row's reading lead must not wait). S.update(dt) counts.
// 双人 (play-6, docs/LEARN.md §25):
//   S.chip(text, kind)             the chip before the question, changed in place while it is up (versus2's 「8 秒」 →
//                                  「等对面」): a DOM write only when the text changes; '' hides it
import { h, prefersReducedMotion, restartAnim, colorVars } from './ui-util.js';
import { GLYPHS } from './ui-icons.js';

const CSS = `
.iw-ps { position: absolute; inset: 0; pointer-events: none; z-index: 18; color: #fff;
  font-family: 'Rubik', system-ui, -apple-system, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif; -webkit-font-smoothing: antialiased;
  --self: #ff8a14; --self-rgb: 255,138,20; --self-ink: #15121c; --coral: #f08a7a; --muted: #c3bdd6;
  --k: #15121c; --k3: #2c2540; --lk: linear-gradient(170deg, rgba(40, 33, 60, .96), rgba(22, 18, 32, .96));
  --ol: 0 0 0 2.5px var(--k), 0 4px 0 2.5px var(--k);
  --spring: cubic-bezier(.34, 1.56, .64, 1); --out: cubic-bezier(.22, 1, .36, 1); }
.iw-ps.is-off { display: none; }
.iw-ps * { box-sizing: border-box; }
/* INKWAVE's sticker look (styles/hud.css): a hard ink outline, a solid ink shadow dropped under it, a light rim inside */
.iw-ps__box { position: absolute; left: 50%; top: calc(min(1vw, 1.7778vh) * 7.4); translate: -50% 0; width: max-content; max-width: min(680px, calc(100vw - 32px));
  display: flex; align-items: center; gap: 12px; padding: 8px 18px 8px 8px; border-radius: 20px; background: var(--lk); isolation: isolate;
  border: 1.5px solid rgba(255, 255, 255, .2); box-shadow: inset 0 2px 0 rgba(255, 255, 255, .07), inset 0 -3px 0 rgba(0, 0, 0, .18), var(--ol), 0 8px 18px rgba(0, 0, 0, .22); transition: border-color .2s; }
.iw-ps__box.is-noplay { padding-left: 18px; }
.iw-ps__box.is-enter { animation: iw-ps-in .4s var(--spring) backwards; }
@keyframes iw-ps-in { from { opacity: 0; translate: -50% -10px; } }
.iw-ps__play { pointer-events: auto; flex: 0 0 auto; width: 44px; height: 44px; border-radius: 50%; border: 0; padding: 11px; cursor: pointer;
  background: var(--k3); color: #fff; box-shadow: inset 0 0 0 2px rgba(255, 255, 255, .22), 0 0 0 2px var(--k), 0 3px 0 2px var(--k);
  -webkit-tap-highlight-color: transparent; transition: translate .22s var(--spring), box-shadow .12s, background .15s; }
.iw-ps__play svg { display: block; width: 100%; height: 100%; filter: drop-shadow(0 2px 0 rgba(0, 0, 0, .3)); }
.iw-ps__play:active { translate: 0 2px; box-shadow: inset 0 0 0 2px rgba(255, 255, 255, .22), 0 0 0 2px var(--k), 0 1px 0 2px var(--k); transition-duration: 0s; }
.iw-ps__play.is-playing { background: var(--self); color: var(--self-ink); box-shadow: inset 0 0 0 2px rgba(255, 255, 255, .35), 0 0 0 2px var(--k), 0 3px 0 2px var(--k); }
.iw-ps__play.is-playing svg { filter: none; }
.iw-ps__play:focus-visible { outline: 3px solid #fff; outline-offset: 4px; }
.iw-ps__text, .iw-ps__verdict { display: block; flex: 1 1 auto; min-width: 0; line-height: 1.28; }
.iw-ps__q { display: block; font-size: 19px; font-weight: 800; letter-spacing: .01em; overflow-wrap: anywhere; }
.iw-ps__zh { display: block; margin-top: 2px; font-size: 17px; font-weight: 600; color: var(--muted); overflow-wrap: anywhere; }
.iw-ps__zh:empty { display: none; }
.iw-ps__verdict { display: none; }
/* the verdict reads on a ribbon (hud.css .iw-call__ribbon): her ink for 答对了, coral for 差一点 (never the other side's
   colour, PLAY §1.6), dark letters on both; the ribbon is drawn behind the line, so the strip is as tall as before */
.iw-ps__head { position: relative; display: block; width: fit-content; max-width: 100%; margin-left: -4px; padding: 0 10px 0 8px;
  font-size: 19px; font-weight: 800; color: var(--k); overflow-wrap: anywhere; }
.iw-ps__head::before { content: ''; position: absolute; z-index: -1; inset: -2px -2px -1px -3px; background: var(--self);
  clip-path: polygon(1.5% 9%, 100% 0, 98.5% 91%, 0 100%); rotate: -1.2deg; transform-origin: 0 50%;
  background-image: linear-gradient(180deg, rgba(255, 255, 255, .34), rgba(255, 255, 255, 0) 46%, rgba(0, 0, 0, 0) 70%, rgba(0, 0, 0, .16)); }
.iw-ps.is-bad .iw-ps__head::before { background: var(--coral); }
.iw-ps.is-verdict .iw-ps__head::before { animation: iw-ps-rib .42s var(--spring) backwards; }
@keyframes iw-ps-rib { 0% { scale: .08 .7; opacity: 0; } 30% { opacity: 1; } }
.iw-ps.is-verdict .iw-ps__head { animation: iw-ps-word .36s var(--out) .06s backwards; }
@keyframes iw-ps-word { from { opacity: 0; translate: -10px 0; } }
.iw-ps.is-verdict .iw-ps__why { animation: iw-ps-word .36s var(--out) .12s backwards; }
.iw-ps__box.is-flash .iw-ps__head { animation: iw-ps-pop .5s var(--spring); }
@keyframes iw-ps-pop { 0% { scale: 1.18; } }
.iw-ps__why { display: block; margin-top: 2px; font-size: 17px; font-weight: 600; color: #e9e5f4; overflow-wrap: anywhere; }
.iw-ps__why:empty { display: none; }
.iw-ps.is-verdict .iw-ps__text { display: none; }
.iw-ps.is-verdict .iw-ps__verdict { display: block; }
.iw-ps.is-ok .iw-ps__box { border-color: var(--self); }
.iw-ps.is-bad .iw-ps__box { border-color: var(--coral); }
.iw-ps__acts { display: none; gap: 10px; margin-top: 8px; }
.iw-ps.is-acts .iw-ps__acts { display: flex; flex-wrap: wrap; }
.iw-ps__act { pointer-events: auto; min-height: 44px; padding: 8px 16px; border-radius: 14px; border: 1.5px solid rgba(255, 255, 255, .22); background: var(--k3); color: #fff;
  font: 700 16px 'Rubik', system-ui, -apple-system, 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', sans-serif; cursor: pointer; -webkit-tap-highlight-color: transparent;
  box-shadow: 0 0 0 2px var(--k), 0 3px 0 2px var(--k); transition: translate .22s var(--spring), box-shadow .12s; }
.iw-ps__act:active { translate: 0 2px; box-shadow: 0 0 0 2px var(--k), 0 1px 0 2px var(--k); transition-duration: 0s; }
.iw-ps__act.is-primary { background: var(--self); color: var(--self-ink); border-color: rgba(255, 255, 255, .4); rotate: -1.5deg; }
.iw-ps__act:focus-visible { outline: 3px solid #fff; outline-offset: 4px; }
@media (orientation: portrait) and (max-width: 640px) {
  .iw-ps__box { left: 10px; right: 10px; translate: none; width: auto; max-width: none; top: calc(var(--hudtop, 58px) + var(--iw-sat, env(safe-area-inset-top))); }
  .iw-ps__box.is-enter { animation-name: iw-ps-in-up; }
  @keyframes iw-ps-in-up { from { opacity: 0; translate: 0 -10px; } }
}
/* 墨浪跑酷: the chip, the lanes' cells, the note line (all inside the strip's own layer) */
.iw-ps__tag { display: none; flex: 0 0 auto; align-self: center; padding: 4px 9px; border-radius: 999px; background: var(--self); color: var(--self-ink); font-size: 12px; font-weight: 800; letter-spacing: .04em; white-space: nowrap;
  box-shadow: 0 0 0 2px var(--k), 0 2px 0 2px var(--k); rotate: -3deg; }
.iw-ps__tag.is-on { display: block; }
.iw-ps__tag.is-beat { background: #ffd21a; color: #15121c; }
.iw-ps__tag.is-type { background: #e9e5f4; color: #15121c; }
.iw-ps__lanes { display: none; flex-wrap: wrap; gap: 7px; align-items: stretch; margin-top: 6px; }
.iw-ps__lanes.is-on { display: flex; }
.iw-ps__lanes span { flex: 1; min-width: 0; padding: 5px 8px; border-radius: 10px; background: rgba(255, 255, 255, .07); box-shadow: inset 0 0 0 1.5px rgba(255, 255, 255, .1);
  font-size: 14px; line-height: 1.3; font-weight: 700; overflow-wrap: normal; word-break: keep-all; min-width: min-content; transition: background .15s, box-shadow .15s; }
/* (the lane's letter stays inline — a badge box round it would push the word to its own line and the strip down) */
.iw-ps__lanes span b { color: var(--self); margin-right: 4px; font-family: 'Titan One', 'Rubik', sans-serif; font-weight: 400; -webkit-text-stroke: 3px var(--k); paint-order: stroke fill; }
.iw-ps__lanes span small { display: block; color: var(--muted); font-size: 12px; font-weight: 600; word-break: normal; overflow-wrap: anywhere; }
.iw-ps__lanes span.is-here { background: rgba(var(--self-rgb), .26); box-shadow: inset 0 0 0 2px var(--self); }
@media (orientation: landscape) { .iw-ps__lanes.is-lite { display: none !important; } }
/* upright, the lanes' row runs under ▶ and the chip too — the strip's whole width, not the column beside the chip (there
   the cells were ~43 px and 「here」 broke into 「her / e」): a grid while a question with lanes is up; the question and its
   Chinese keep their place beside ▶ / the chip (two lines: as tall as ▶), so the strip is never taller. Without the
   Chinese line ▶ keeps its column down the side (one line is shorter than ▶: the lanes would be pushed down) */
@media (orientation: portrait) and (max-width: 640px) {
  .iw-ps:not(.is-verdict) .iw-ps__box:has(.iw-ps__lanes.is-on) { display: grid; grid-template-columns: auto auto minmax(0, 1fr); gap: 0;
    grid-template-areas: "play tag q" "play tag zh" "lanes lanes lanes"; }
  .iw-ps:not(.is-verdict) .iw-ps__box:has(.iw-ps__lanes.is-on):has(.iw-ps__zh:empty) { grid-template-areas: "play tag q" "play lanes lanes"; }
  .iw-ps:not(.is-verdict) .iw-ps__box:has(.iw-ps__lanes.is-on) .iw-ps__text { display: contents; }
  .iw-ps:not(.is-verdict) .iw-ps__box:has(.iw-ps__lanes.is-on) .iw-ps__play { grid-area: play; align-self: center; margin-right: 12px; }
  .iw-ps:not(.is-verdict) .iw-ps__box:has(.iw-ps__lanes.is-on) .iw-ps__tag { grid-area: tag; margin-right: 12px; }
  .iw-ps:not(.is-verdict) .iw-ps__box:has(.iw-ps__lanes.is-on) .iw-ps__q { grid-area: q; align-self: end; }
  .iw-ps:not(.is-verdict) .iw-ps__box:has(.iw-ps__lanes.is-on) .iw-ps__zh { grid-area: zh; align-self: start; }
  .iw-ps:not(.is-verdict) .iw-ps__box:has(.iw-ps__lanes.is-on) .iw-ps__lanes { grid-area: lanes; }
}
.iw-ps.is-verdict .iw-ps__lanes { display: none; }
.iw-ps__note { position: absolute; left: 50%; top: 0; translate: -50% 0; max-width: calc(100vw - 32px); padding: 8px 16px; border-radius: 20px; background: var(--lk);
  border: 1.5px solid rgba(255, 255, 255, .2); box-shadow: 0 0 0 2px var(--k), 0 3px 0 2px var(--k); font-size: 17px; font-weight: 800; opacity: 0; transition: opacity .2s; text-align: center; }
.iw-ps__note.is-on { opacity: 1; }
.iw-ps__note.is-ok { color: var(--self); border-color: var(--self); }
.iw-ps__note.is-bad { color: var(--coral); border-color: var(--coral); }
.iw-ps__note small { display: block; font-size: 13px; font-weight: 600; color: var(--muted); }
/* reduced motion: nothing moves, nothing pops — the strip, the ribbon and the verdict's words only fade in (.18 s), the note
   line fades in and out */
@keyframes iw-ps-fade { from { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .iw-ps__box.is-enter, .iw-ps__box.is-flash .iw-ps__head, .iw-ps.is-verdict .iw-ps__head::before, .iw-ps.is-verdict .iw-ps__head, .iw-ps.is-verdict .iw-ps__why { animation: none; } .iw-ps__box.is-enter, .iw-ps.is-verdict .iw-ps__head::before, .iw-ps.is-verdict .iw-ps__head, .iw-ps.is-verdict .iw-ps__why { animation: iw-ps-fade .18s linear backwards; } .iw-ps * { transition: none !important; } .iw-ps .iw-ps__note { transition: opacity .18s linear !important; } }
`;

let cssDone = false;
export const VERDICT_H = 86;   // px a verdict takes at most (its head and two lines of 为什么): the room kept under the strip
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
    this.tag = h('span', { class: 'iw-ps__tag' });
    this.lanes = h('div', { class: 'iw-ps__lanes' });
    this.text = h('div', { class: 'iw-ps__text' }, this.q, this.zh, this.lanes);
    this.acts = h('div', { class: 'iw-ps__acts' });
    this.verd = h('div', { class: 'iw-ps__verdict' }, this.head, this.why, this.acts);
    this.box = h('div', { class: 'iw-ps__box' }, this.play, this.tag, this.text, this.verd);
    this.note = h('div', { class: 'iw-ps__note' });
    this.el = h('div', { class: 'iw-ps is-off', role: 'status', 'aria-live': 'polite' }, this.box, this.note);
    (hud && hud.root ? hud.root : document.body).appendChild(this.el);
    this.on = false;
    this._vT = 0; this._nT = 0;   // the timed verdict / the note line (s left)
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
      // (decided for the verdict too — 答对了 / 差一点 + a sentence of 为什么 is up to VERDICT_H tall — so the strip never
      // jumps between the question and its verdict, and never slides down over the objects under it)
      let top = Infinity, bot = -Infinity;
      for (const k of this._keys) if (k.x < b.right && k.x + k.w > b.left && k.y + k.h > b.top) { top = Math.min(top, k.y); bot = Math.max(bot, k.y + k.h); }
      if (top < Infinity && Math.max(b.bottom, b.top + VERDICT_H) > top - 4) this.box.style.top = `${Math.round(bot + 6)}px`;
      return;
    }
    let half = Infinity;
    for (const k of this._keys) if (k.y < b.top + 140 && k.y + k.h > b.top) half = Math.min(half, k.x > mid ? k.x - mid - 10 : mid - (k.x + k.w) - 10);
    if (half < Infinity) this.box.style.maxWidth = `${Math.max(260, Math.floor(half * 2))}px`;
  }

  show(p, { replay, tag = null, lanes = null, lite = false } = {}) {
    // a timed verdict still up (the runner's last row): it goes on as the note line under the new question
    if (this._vT > 0 && this.el.classList.contains('is-verdict')) { this._noteFromVerdict(this._vT); this._vT = 0; }
    this._replay = replay || null;
    this.q.textContent = p.text || '';
    this.zh.textContent = p.zh && p.zh !== p.text ? p.zh : '';
    const canPlay = !!(p.tts && replay);
    this.play.style.display = canPlay ? '' : 'none';
    this.box.classList.toggle('is-noplay', !canPlay);
    this.tag.className = 'iw-ps__tag' + (tag ? ' is-on' + (tag.kind ? ' is-' + tag.kind : '') : '');
    this.tag.textContent = tag ? tag.text || '' : '';
    this.lanes.innerHTML = '';
    if (lanes && lanes.length) for (const o of lanes) this.lanes.append(h('span', null, h('b', null, o.tag || ''), o.en || '', o.zh ? h('small', null, o.zh) : null));
    this.lanes.className = 'iw-ps__lanes' + (lanes && lanes.length ? ' is-on' : '') + (lite ? ' is-lite' : '');
    this.el.classList.remove('is-off', 'is-verdict', 'is-ok', 'is-bad');
    this._acts(null);
    this.on = true;
    restartAnim(this.box, 'is-enter');   // (reduced motion: the same class, a fade — the CSS's last rule)
  }
  chip(text, kind = '') {
    const t = String(text || ''), cls = 'iw-ps__tag' + (t ? ' is-on' + (kind ? ' is-' + kind : '') : '');
    if (this.tag.textContent !== t) this.tag.textContent = t;
    if (this.tag.className !== cls) this.tag.className = cls;
  }
  here(i) { const c = this.lanes.children; for (let k = 0; k < c.length; k++) c[k].classList.toggle('is-here', k === i); }
  question() { this.el.classList.remove('is-verdict', 'is-ok', 'is-bad'); this._acts(null); }
  // v.actions (play-5: 「我的写法也对」 / 「继续」 on a held sentence): [{ text, primary?, onTap }] — buttons ≥ 44 pt under the
  // verdict, the only other thing on the strip a touch reaches; gone with the next question() / show() / hide()
  _acts(list) {
    this.acts.innerHTML = '';
    const on = !!(list && list.length);
    this.el.classList.toggle('is-acts', on);
    if (!on) return;
    for (const a of list) {
      const b = h('button', { class: 'iw-ps__act' + (a.primary ? ' is-primary' : ''), type: 'button' }, a.text);
      b.addEventListener('click', (e) => { e.stopPropagation(); this._acts(null); a.onTap?.(); });
      this.acts.appendChild(b);
    }
  }
  verdict(v, { ms = 0 } = {}) {
    this.head.textContent = v.head || '';
    this.why.textContent = v.why || '';
    this._acts(v.actions || null);
    this.el.classList.add('is-verdict');
    this.el.classList.toggle('is-ok', !!v.ok); this.el.classList.toggle('is-bad', !v.ok);
    if (v.ok && !prefersReducedMotion()) restartAnim(this.box, 'is-flash');
    this._vT = ms > 0 ? ms / 1000 : 0;
    if (ms > 0 && !this.on) { this.on = true; this.el.classList.remove('is-off'); }   // (a verdict after the question was cleared: the strip comes back for it)
  }
  _noteFromVerdict(s) {
    this.note.innerHTML = '';
    this.note.append(h('span', null, this.head.textContent));
    if (this.why.textContent) this.note.append(h('small', null, this.why.textContent));
    this.note.className = 'iw-ps__note is-on ' + (this.el.classList.contains('is-ok') ? 'is-ok' : 'is-bad');
    this._nT = s;
    this._placeNote();
  }
  _placeNote() { const r = this.box.getBoundingClientRect(); this.note.style.top = `${Math.round(r.bottom + 8)}px`; }
  // per frame (only the timed verdict and the note line need it: the runner calls it)
  update(dt) {
    if (this._vT > 0 && (this._vT -= dt) <= 0) { this._vT = 0; if (this.el.classList.contains('is-verdict')) this.hide(); }
    if (this._nT > 0 && (this._nT -= dt) <= 0) { this._nT = 0; this.note.classList.remove('is-on'); }
  }
  playing(on) { this.play.classList.toggle('is-playing', !!on); }
  hide() { this.on = false; this.el.classList.add('is-off'); this._replay = null; this._vT = 0; this._acts(null); }
  rect() {
    if (!this.on) return null;
    const b = this.box.getBoundingClientRect();
    return { x: b.left, y: b.top, w: b.width, h: b.height, bottom: b.bottom };
  }
  dispose() { this.el.remove(); }
}
