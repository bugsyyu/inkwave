// 关卡学习 — the forms' own HUD pieces (docs/LEVELS.md §2.2–§2.5, §5), beside B's question layer (hud-learn.js, used
// as is): the prop bag (道具格, tap = use), a one-line note (绕路中 / 第几名 / 这一段), the race standings, the boss's
// phase strip, and extra lines on the results card. Chinese throughout; ≥ 44 pt targets; INKWAVE's sticker look (an ink
// outline and a dropped shadow, LEARN §32). (play-8: the 看板 / 备战 / 口语 card that stood here is gone — the boards are
// M6 boards on the stage, src/learn/play/arena/prep.js.)
// One layer in #ui-root (z 17: under the question layer, over the HUD).
import { h, colorVars } from '../../ui/ui-util.js';
import { GLYPHS, SUB_ICONS, SPECIAL_ICONS } from '../../ui/ui-icons.js';
import { G } from '../../core/ctx.js';
import { PROPS } from '../design.js';

const PROP_GLYPH = { leap: 'beacon', rain: 'storm', echo: 'sonar', shield: 'bubbler', curtain: 'curtain', bomb: 'bomb', lane: 'slam' };
// the game's own two-tone sub / special icons (ink = currentColor, as the HUD draws them); these names are not in GLYPHS,
// so every slot used to fall back to the same drop
const propIcon = (id) => { const n = PROP_GLYPH[id]; return SUB_ICONS[n] || SPECIAL_ICONS[n] || GLYPHS[n] || GLYPHS.drop; };
// (the bag, the standings and the boss's strip keep out of the safe area — the notch / the Dynamic Island on a turned phone,
// the HUD's top row moved down by it upright: the page's --iw-sa* variables, src/ui/safe-area.js, LEARN §48 / §53)
const CSS = `
.iw-lf { position: absolute; inset: 0; pointer-events: none; z-index: 17; font-family: 'Rubik', system-ui, sans-serif; color: #fff;
  --self: #ff8a14; --self-ink: #15121c; --k: #15121c; --k3: #2c2540; --lk: linear-gradient(170deg, rgba(40, 33, 60, .94), rgba(22, 18, 32, .94)); }
.iw-lf.is-off { display: none; }
.iw-lf * { box-sizing: border-box; }
.iw-lf svg { display: block; width: 100%; height: 100%; }
.iw-lf__bag { position: absolute; right: calc(16px + var(--iw-sar, 0px)); top: 50%; translate: 0 -50%; display: flex; flex-direction: column; gap: 10px; pointer-events: auto; transition: translate .28s var(--spring, cubic-bezier(.2,1.4,.4,1)), opacity .2s; }
.iw-lf.is-aside .iw-lf__bag { translate: calc(100% + 24px + var(--iw-sar, 0px)) -50%; opacity: 0; pointer-events: none; }
/* a slot is a little sticker (styles/hud.css): ink outline, a solid ink shadow under it, a light rim; a press sinks it */
.iw-lf__slot { width: 56px; height: 56px; border-radius: 16px; border: 2px solid rgba(255,255,255,.22); background: var(--lk); color: #fff; display: grid; place-items: center; padding: 10px; cursor: pointer; position: relative;
  box-shadow: 0 0 0 2px var(--k), 0 3px 0 2px var(--k); transition: translate .08s, box-shadow .08s; -webkit-tap-highlight-color: transparent; }
.iw-lf__slot i { display: block; width: 100%; height: 100%; color: var(--self); }
.iw-lf__slot i svg { filter: drop-shadow(0 2px 0 rgba(0,0,0,.35)); }
.iw-lf__slot:active { translate: 0 2px; box-shadow: 0 0 0 2px var(--k), 0 1px 0 2px var(--k); }
.iw-lf__slot:disabled { opacity: .35; cursor: default; }
.iw-lf__slot.is-new { animation: iw-lf-pop .5s var(--spring, cubic-bezier(.2,1.4,.4,1)); border-color: var(--self); }
.iw-lf__slot b { position: absolute; left: -6px; right: -6px; bottom: -18px; font-size: 11px; font-weight: 800; text-align: center; color: #fff; white-space: nowrap; text-shadow: 0 1px 0 var(--k), 0 0 3px var(--k), 0 0 2px var(--k); }
@keyframes iw-lf-pop { from { scale: .6; rotate: -12deg; } }
.iw-lf__note { position: absolute; left: 50%; top: 18%; translate: -50% 0; padding: 10px 18px; border-radius: 999px; background: var(--lk); border: 1.5px solid rgba(255,255,255,.2);
  box-shadow: 0 0 0 2px var(--k), 0 3px 0 2px var(--k); font-size: 17px; font-weight: 800; letter-spacing: .02em; opacity: 0; transition: opacity .25s; white-space: nowrap; }
.iw-lf__note.is-on { opacity: 1; }
.iw-lf__note.is-coral { color: #f08a7a; border-color: #f08a7a; }
.iw-lf__note.is-wrap { white-space: normal; text-wrap: balance; text-align: center; width: max-content; max-width: calc(100vw - 32px - var(--iw-sal, 0px) - var(--iw-sar, 0px)); border-radius: 22px; line-height: 1.35; }
.iw-lf__rank { position: absolute; left: calc(16px + var(--iw-sal, 0px)); top: calc(96px + var(--iw-sat, 0px)); display: flex; flex-direction: column; gap: 4px; font-size: 14px; font-weight: 700; }
.iw-lf__rank div { display: flex; gap: 8px; align-items: center; padding: 5px 10px; border-radius: 10px; background: rgba(21,18,28,.82); box-shadow: 0 0 0 1.5px var(--k); }
.iw-lf__rank div.is-me { background: var(--self); color: var(--self-ink); box-shadow: 0 0 0 1.5px var(--k), 0 2px 0 1.5px var(--k); rotate: -2deg; }
.iw-lf__rank i { width: 18px; text-align: center; font-family: 'Titan One', 'Rubik', sans-serif; font-weight: 400; font-style: normal; }
.iw-lf__phase { position: absolute; left: 50%; top: calc(92px + var(--iw-sat, 0px)); translate: -50% 0; display: flex; gap: 6px; padding: 6px 10px; border-radius: 999px; background: var(--lk); font-size: 13px; font-weight: 800;
  box-shadow: 0 0 0 2px var(--k), 0 3px 0 2px var(--k); }
/* (empty outside the boss: it drew a small dark pill under the clock in every other form) */
.iw-lf__phase:empty { display: none; }
.iw-lf__phase span { padding: 4px 10px; border-radius: 999px; background: rgba(255,255,255,.1); color: #c3bdd6; white-space: nowrap; }
.iw-lf__phase span.is-on { background: var(--self); color: var(--self-ink); box-shadow: 0 0 0 2px var(--k); rotate: -3deg; }
.iw-lf__phase span.is-done { background: rgba(255,255,255,.28); color: #fff; }
.iw-lf__extra { text-align: left; display: flex; flex-direction: column; gap: 6px; font-size: 15px; }
.iw-lf__extra b { color: var(--self); }
.iw-lf__stars { font-size: 30px; letter-spacing: 6px; color: #ffd21a; text-align: center; -webkit-text-stroke: 5px var(--k); paint-order: stroke fill; text-shadow: 0 3px 0 var(--k); }
@media (max-width: 640px) { .iw-lf__bag { right: calc(10px + var(--iw-sar, 0px)); top: 36%; } .iw-lf__slot { width: 52px; height: 52px; } .iw-lf__rank { top: calc(84px + var(--iw-sat, 0px)); font-size: 13px; } }
@media (prefers-reduced-motion: reduce) { .iw-lf__slot.is-new { animation: none; } .iw-lf__bag, .iw-lf__slot { transition: none; } }
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
      const b = h('button', { class: 'iw-lf__slot' + (i === fresh ? ' is-new' : ''), type: 'button', title: P.desc, 'aria-label': P.zh }, h('i', { html: propIcon(id) }), h('b', null, P.zh));
      b.addEventListener('click', () => this.onUse?.(i));
      this.bag.appendChild(b);
    });
  }

  // ---- a one-line note over the stage (fades by itself unless hold)
  // (wrap: a line longer than a phone is wide — LEARN §55's — may take two lines, inside the screen; the others stay one line)
  say(text, { coral = false, hold = 0, wrap = false } = {}) {
    clearTimeout(this._noteT);
    this.note.textContent = text || '';
    this.note.classList.toggle('is-coral', !!coral);
    this.note.classList.toggle('is-wrap', !!(text && wrap));
    this.note.classList.toggle('is-on', !!text);
    if (text && !hold) this._noteT = setTimeout(() => this.note.classList.remove('is-on'), 2600);
  }

  // ---- the race standings: [{ name, me, cp, total, finish }] — LEARN §52: twice a second they were emptied and built
  // again; now the rows stay and only what changed is written (nothing at all while the standings stand)
  setRank(rows) {
    const R = this.rank, n = rows ? rows.length : 0;
    while (R.children.length > n) R.lastChild.remove();
    for (let i = 0; i < n; i++) {
      const r = rows[i];
      let row = R.children[i];
      if (!row) R.appendChild((row = h('div', null, h('i', null, String(i + 1)), h('span'), h('small'))));
      const cls = r.me ? 'is-me' : '', name = String(r.name), tail = r.finish != null ? ' 到了' : ` ${r.cp}/${r.total}`;
      if (row.className !== cls) row.className = cls;
      if (row.children[1].textContent !== name) row.children[1].textContent = name;
      if (row.children[2].textContent !== tail) row.children[2].textContent = tail;
    }
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
