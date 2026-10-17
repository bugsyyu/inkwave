// 关卡学习 — the forms' own HUD pieces (docs/LEVELS.md §2.2–§2.5, §5), beside B's question layer (hud-learn.js, used
// as is): the prop bag (道具格, tap = use), a one-line note (绕路中 / 第几名 / 这一段), the race standings, the boss's
// phase strip, and extra lines on the results card. Chinese throughout; ≥ 44 pt targets; dark glass. (play-8: the 看板 /
// 备战 / 口语 card that stood here is gone — the boards are M6 boards on the stage, src/learn/play/arena/prep.js.)
// One layer in #ui-root (z 17: under the question layer, over the HUD).
import { h, colorVars } from '../../ui/ui-util.js';
import { GLYPHS } from '../../ui/ui-icons.js';
import { G } from '../../core/ctx.js';
import { PROPS } from '../design.js';

const PROP_GLYPH = { leap: 'beacon', rain: 'storm', echo: 'sonar', shield: 'bubbler', curtain: 'curtain', bomb: 'bomb', lane: 'slam' };
const CSS = `
.iw-lf { position: absolute; inset: 0; pointer-events: none; z-index: 17; font-family: 'Rubik', system-ui, sans-serif; color: #fff; --self: #ff8a14; --self-ink: #15121c; }
.iw-lf.is-off { display: none; }
.iw-lf * { box-sizing: border-box; }
.iw-lf svg { display: block; width: 100%; height: 100%; }
.iw-lf__bag { position: absolute; right: 16px; top: 50%; translate: 0 -50%; display: flex; flex-direction: column; gap: 10px; pointer-events: auto; transition: translate .28s var(--spring, cubic-bezier(.2,1.4,.4,1)), opacity .2s; }
.iw-lf.is-aside .iw-lf__bag { translate: calc(100% + 24px) -50%; opacity: 0; pointer-events: none; }
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
.iw-lf__extra { text-align: left; display: flex; flex-direction: column; gap: 6px; font-size: 15px; }
.iw-lf__extra b { color: var(--self); }
.iw-lf__stars { font-size: 26px; letter-spacing: 4px; color: #ffd21a; text-align: center; }
@media (max-width: 640px) { .iw-lf__bag { right: 10px; top: 36%; } .iw-lf__slot { width: 52px; height: 52px; } .iw-lf__rank { top: 84px; font-size: 13px; } }
@media (prefers-reduced-motion: reduce) { .iw-lf__slot.is-new { animation: none; } .iw-lf__bag { transition: none; } }
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
    this.el = h('div', { class: 'iw-lf is-off', 'aria-hidden': 'true' }, this.bag, this.note, this.rank, this.phase);
    hud.root.appendChild(this.el);
    this._noteT = 0;
    this.onUse = null;
  }
  start() {
    this.el.classList.remove('is-off'); this.el.setAttribute('aria-hidden', 'false');
    colorVars(this.el, 'self', (G.teamHex || [])[0] || '#ff8a14');
    this.setBag([]); this.setRank(null); this.setPhases(null); this.aside(false);
  }
  // the bag steps aside (slides off the right edge) while a station frames the screen — a framed board, the typing rig, the
  // 备战 / start board, the booth, a flip card, the duel's objects: on a portrait phone it stood at 36 % height on the right,
  // over a board's right column (the Chinese glosses) and the end of a long paper (LEARN §30). Props arm for the NEXT
  // question (墨雨 / 回声 / 超级跳 …), so nothing is lost while it is away; it comes back when the station lets go.
  aside(on) { on = !!on; if (on === this._aside) return; this._aside = on; this.el.classList.toggle('is-aside', on); }
  end() { this.el.classList.add('is-off'); this.el.setAttribute('aria-hidden', 'true'); clearTimeout(this._noteT); }

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
