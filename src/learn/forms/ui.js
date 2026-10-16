// 关卡学习 — the forms' own HUD pieces (docs/LEVELS.md §2.2–§2.5, §5), beside B's question layer (hud-learn.js, used
// as is): the prop bag (道具格, tap = use), a one-line note (绕路中 / 第几名 / 这一段), the 看板 / 备战 card (the board:
// the step's content before its questions, 「走」 to go on), the race standings, the boss's phase strip, the 口语 cards
// (「等语音服务器」, 「说完了」), and extra lines on the results card. Chinese throughout; ≥ 44 pt targets; dark glass.
// One layer in #ui-root (z 17: under the question layer, over the HUD).
import { h, prefersReducedMotion, restartAnim, colorVars } from '../../ui/ui-util.js';
import { GLYPHS } from '../../ui/ui-icons.js';
import { G } from '../../core/ctx.js';
import { PROPS } from '../design.js';

const PROP_GLYPH = { leap: 'beacon', rain: 'storm', echo: 'sonar', shield: 'bubbler', curtain: 'curtain', bomb: 'bomb', lane: 'slam' };
const CSS = `
.iw-lf { position: absolute; inset: 0; pointer-events: none; z-index: 17; font-family: 'Rubik', system-ui, sans-serif; color: #fff; --self: #ff8a14; --self-ink: #15121c; }
.iw-lf.is-off { display: none; }
.iw-lf * { box-sizing: border-box; }
.iw-lf svg { display: block; width: 100%; height: 100%; }
.iw-lf__bag { position: absolute; right: 16px; top: 50%; translate: 0 -50%; display: flex; flex-direction: column; gap: 10px; pointer-events: auto; }
.iw-lf__slot { width: 56px; height: 56px; border-radius: 16px; border: 2px solid rgba(255,255,255,.18); background: rgba(21,18,28,.72); color: #fff; display: grid; place-items: center; padding: 10px; cursor: pointer; position: relative; }
.iw-lf__slot:disabled { opacity: .35; cursor: default; }
.iw-lf__slot.is-new { animation: iw-lf-pop .5s var(--spring, cubic-bezier(.2,1.4,.4,1)); border-color: var(--self); }
.iw-lf__slot b { position: absolute; left: 0; right: 0; bottom: -18px; font-size: 11px; font-weight: 700; text-align: center; color: #e9e5f4; text-shadow: 0 1px 2px #000; }
@keyframes iw-lf-pop { from { scale: .6; } }
.iw-lf__note { position: absolute; left: 50%; top: 18%; translate: -50% 0; padding: 10px 18px; border-radius: 999px; background: rgba(21,18,28,.78); font-size: 17px; font-weight: 800; letter-spacing: .02em; opacity: 0; transition: opacity .25s; white-space: nowrap; }
.iw-lf__note.is-on { opacity: 1; }
.iw-lf__note.is-coral { color: #f08a7a; }
.iw-lf__rank { position: absolute; left: 16px; top: 96px; display: flex; flex-direction: column; gap: 4px; font-size: 14px; font-weight: 700; }
.iw-lf__rank div { display: flex; gap: 8px; align-items: center; padding: 5px 10px; border-radius: 10px; background: rgba(21,18,28,.6); }
.iw-lf__rank div.is-me { background: var(--self); color: var(--self-ink); }
.iw-lf__rank i { width: 18px; text-align: center; font-style: normal; }
.iw-lf__phase { position: absolute; left: 50%; top: 92px; translate: -50% 0; display: flex; gap: 6px; padding: 6px 10px; border-radius: 999px; background: rgba(21,18,28,.7); font-size: 13px; font-weight: 800; }
.iw-lf__phase span { padding: 4px 10px; border-radius: 999px; background: rgba(255,255,255,.1); color: #bbb; white-space: nowrap; }
.iw-lf__phase span.is-on { background: var(--self); color: var(--self-ink); }
.iw-lf__phase span.is-done { background: rgba(255,255,255,.28); color: #fff; }
.iw-lf__board { position: absolute; left: 50%; bottom: 24px; translate: -50% 0; width: min(560px, calc(100vw - 32px)); max-height: min(70vh, 560px); display: none; flex-direction: column; gap: 12px; padding: 18px 20px 16px; border-radius: 22px; background: rgba(21,18,28,.9); border: 1px solid rgba(255,255,255,.12); box-shadow: 0 18px 50px rgba(0,0,0,.45); pointer-events: auto; }
.iw-lf__board.is-on { display: flex; }
.iw-lf__board.is-enter { animation: iw-lf-in .45s var(--spring, cubic-bezier(.2,1.4,.4,1)) backwards; }
@keyframes iw-lf-in { from { opacity: 0; translate: -50% 30px; } }
.iw-lf__btitle { font-size: 13px; font-weight: 700; color: #a9a3b8; letter-spacing: .06em; }
.iw-lf__bhead { font-size: 20px; font-weight: 800; line-height: 1.3; }
.iw-lf__rows { overflow: auto; display: flex; flex-direction: column; gap: 6px; -webkit-overflow-scrolling: touch; }
.iw-lf__row { display: grid; grid-template-columns: 44px 1fr; gap: 10px; align-items: center; padding: 6px 8px; border-radius: 12px; background: rgba(255,255,255,.07); min-height: 44px; }
.iw-lf__row.is-text { grid-template-columns: 1fr; font-size: 15px; line-height: 1.5; color: #e9e5f4; }
.iw-lf__row button { width: 44px; height: 44px; border-radius: 50%; border: 0; background: rgba(255,255,255,.14); color: #fff; padding: 11px; cursor: pointer; }
.iw-lf__row button.is-playing { background: var(--self); color: var(--self-ink); }
.iw-lf__en { font-size: 17px; font-weight: 800; }
.iw-lf__ipa { font-size: 13px; color: #a9a3b8; margin-left: 6px; font-weight: 500; }
.iw-lf__zh { font-size: 14px; color: #cfc9dc; }
.iw-lf__go { align-self: flex-end; min-height: 48px; padding: 0 22px; border-radius: 999px; border: 0; background: var(--self); color: var(--self-ink); font: 800 17px/1 'Rubik', system-ui, sans-serif; display: flex; align-items: center; gap: 8px; cursor: pointer; }
.iw-lf__go i { width: 20px; height: 20px; }
.iw-lf__go:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
.iw-lf__cards { display: flex; flex-direction: column; gap: 8px; }
.iw-lf__card { padding: 12px 14px; border-radius: 14px; background: rgba(255,255,255,.07); display: flex; flex-direction: column; gap: 4px; }
.iw-lf__card small { color: #a9a3b8; font-size: 12px; font-weight: 700; letter-spacing: .04em; }
.iw-lf__extra { text-align: left; display: flex; flex-direction: column; gap: 6px; font-size: 15px; }
.iw-lf__extra b { color: var(--self); }
.iw-lf__stars { font-size: 26px; letter-spacing: 4px; color: #ffd21a; text-align: center; }
@media (max-width: 640px) { .iw-lf__bag { right: 10px; top: 36%; } .iw-lf__slot { width: 52px; height: 52px; } .iw-lf__rank { top: 84px; font-size: 13px; } .iw-lf__board { bottom: 12px; max-height: 62vh; } }
@media (prefers-reduced-motion: reduce) { .iw-lf__slot.is-new, .iw-lf__board.is-enter { animation: none; } }
`;

let cssDone = false;
function ensureCss() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  document.head.appendChild(h('style', { id: 'iw-lf-css' }, CSS));
}

export class FormsUi {
  constructor(hud) {
    ensureCss();
    this.hud = hud;
    this.bag = h('div', { class: 'iw-lf__bag' });
    this.note = h('div', { class: 'iw-lf__note' });
    this.rank = h('div', { class: 'iw-lf__rank' });
    this.phase = h('div', { class: 'iw-lf__phase' });
    this.bTitle = h('div', { class: 'iw-lf__btitle' });
    this.bHead = h('div', { class: 'iw-lf__bhead' });
    this.bRows = h('div', { class: 'iw-lf__rows' });
    this.bGo = h('button', { class: 'iw-lf__go', type: 'button' }, h('span', null, '走！'), h('i', { html: GLYPHS.play }));
    this.board = h('div', { class: 'iw-lf__board', role: 'dialog', 'aria-label': '展板' }, this.bTitle, this.bHead, this.bRows, this.bGo);
    this.el = h('div', { class: 'iw-lf is-off', 'aria-hidden': 'true' }, this.bag, this.note, this.rank, this.phase, this.board);
    hud.root.appendChild(this.el);
    this._noteT = 0;
    this.onUse = null;
  }
  start() {
    this.el.classList.remove('is-off'); this.el.setAttribute('aria-hidden', 'false');
    colorVars(this.el, 'self', (G.teamHex || [])[0] || '#ff8a14');
    this.setBag([]); this.setRank(null); this.setPhases(null); this.hideBoard();
  }
  end() { this.el.classList.add('is-off'); this.el.setAttribute('aria-hidden', 'true'); clearTimeout(this._noteT); this.hideBoard(); }

  // ---- the prop bag: one slot per prop she holds; tap = use (the flow's onUse(index))
  setBag(ids, fresh = -1) {
    this.bag.innerHTML = '';
    ids.forEach((id, i) => {
      const P = PROPS[id]; if (!P) return;
      const b = h('button', { class: 'iw-lf__slot' + (i === fresh ? ' is-new' : ''), type: 'button', title: P.desc, 'aria-label': P.zh }, h('i', { html: GLYPHS[PROP_GLYPH[id]] || GLYPHS.drop }), h('b', null, P.zh));
      b.addEventListener('click', () => this.onUse?.(i));
      this.bag.appendChild(b);
    });
  }

  // ---- a one-line note over the stage (fades by itself unless hold)
  say(text, { coral = false, hold = 0 } = {}) {
    clearTimeout(this._noteT);
    this.note.textContent = text || '';
    this.note.classList.toggle('is-coral', !!coral);
    this.note.classList.toggle('is-on', !!text);
    if (text && !hold) this._noteT = setTimeout(() => this.note.classList.remove('is-on'), 2600);
  }

  // ---- the race standings: [{ name, me, cp, total, finish }]
  setRank(rows) {
    this.rank.innerHTML = '';
    if (!rows) return;
    rows.forEach((r, i) => this.rank.appendChild(h('div', { class: r.me ? 'is-me' : '' }, h('i', null, String(i + 1)), h('span', null, r.name), h('small', null, r.finish != null ? ' 到了' : ` ${r.cp}/${r.total}`))));
  }

  // ---- the boss phase strip: [{ id, zh, state: 'done' | 'on' | '' }]
  setPhases(list) {
    this.phase.innerHTML = '';
    if (!list) return;
    // (the first word of the phase's name: L 听力 · R 阅读 · W 写作 · S 口语 — the strip has to fit a phone's width)
    list.forEach((p) => this.phase.appendChild(h('span', { class: p.state === 'on' ? 'is-on' : p.state === 'done' ? 'is-done' : '', title: `${p.id} ${p.zh}` }, `${p.id} ${String(p.zh || '').split(' · ')[0]}`)));
  }

  // ---- the board (看板 / 备战): title, heading, rows [{ en, ipa, zh, tts } | { text }], go label → onGo()
  showBoard({ title, head, rows = [], go = '走！', cards = null }, onGo) {
    this.bTitle.textContent = title || '';
    this.bHead.textContent = head || '';
    this.bRows.innerHTML = '';
    for (const r of rows) {
      if (r.text != null) { this.bRows.appendChild(h('div', { class: 'iw-lf__row is-text' }, r.text)); continue; }
      const play = h('button', { type: 'button', 'aria-label': '听', html: GLYPHS.speaker });
      play.addEventListener('click', () => { play.classList.add('is-playing'); this.hud.learn?._speak?.(r.tts || r.en, () => play.classList.remove('is-playing')); });
      this.bRows.appendChild(h('div', { class: 'iw-lf__row' }, play, h('div', null, h('div', null, h('span', { class: 'iw-lf__en' }, r.en || ''), r.ipa ? h('span', { class: 'iw-lf__ipa' }, r.ipa) : null), r.zh ? h('div', { class: 'iw-lf__zh' }, r.zh) : null)));
    }
    if (cards) {
      const wrap = h('div', { class: 'iw-lf__cards' });
      for (const c of cards) wrap.appendChild(h('div', { class: 'iw-lf__card' }, h('small', null, c.label || ''), h('div', { class: 'iw-lf__en' }, c.en || ''), c.zh ? h('div', { class: 'iw-lf__zh' }, c.zh) : null));
      this.bRows.appendChild(wrap);
    }
    this.bGo.querySelector('span').textContent = go;
    this.bGo.onclick = () => { this.hud.playSound?.('ui_confirm'); onGo?.(); };
    this.board.classList.add('is-on');
    if (!prefersReducedMotion()) restartAnim(this.board, 'is-enter');
    setTimeout(() => this.bGo.focus?.(), 40);
  }
  hideBoard() { this.board.classList.remove('is-on'); this.bGo.onclick = null; }
  get boardOn() { return this.board.classList.contains('is-on'); }

  // ---- extra lines on B's results card (stars, the race's place, the per-skill counts), before its buttons
  resultsExtra(lines, stars) {
    const card = this.hud.learn?.results_; if (!card) return;
    card.querySelectorAll('.iw-lf__extra, .iw-lf__stars').forEach((e) => e.remove());
    const btns = card.querySelector('.iw-learn__rbtns');
    if (stars != null) card.insertBefore(h('div', { class: 'iw-lf__stars', 'aria-label': `${stars} 星` }, '★'.repeat(stars) + '☆'.repeat(Math.max(0, 3 - stars))), btns);
    const ex = h('div', { class: 'iw-lf__extra' }, lines.map((l) => (typeof l === 'string' ? h('div', null, l) : h('div', null, h('b', null, l.b), ' ', l.t))));
    card.insertBefore(ex, btns);
  }
}
