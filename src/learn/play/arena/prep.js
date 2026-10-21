// 题即玩法 play-8 — the duel's 备战 between rounds as M6 boards (docs/PLAY.md §4 「课文 · 对抗赛：M6（备战时）」, §5.3; LEARN §24
// 拿不准的 1, §27). Before a round (the 今日小考's one, the 回炉 round too) the step's boards come to her one at a time — a
// board BD.view m in front of her, turned towards the zone, framed as it rises (BoardWalk: its rows replay their words,
// 「看全文」 opens the reading strip) — and the strip says which round is next with 「下一块」 / 「开始这一轮」. Walking on
// (LEARN.duel.prepWalk m from where she stood) starts it too: the page turn, as on the puzzle's boards; on a keyboard
// Enter is 「开始」 (the mouse is the camera's while she plays: the strip's buttons are for a finger). The match is
// never paused — the form holds the clock and the zone and stands the bots (forms/duel.js); she walks as she likes.
// Nothing is judged or written here.
//
//   const P = new PrepStation(host)      (host: ArenaHost — its strip, its voice, its facingYaw, its lens)
//   P.show(specs, { head, why, go, onGo(how) })   specs: M6 board specs (board/paint.js; wire/boards.js gateSpecs)
//   P.update(dt) · P.pose · P.tapApi · P.still · P.clear() · P.debug() · P.dispose() · P.warm()
import { G } from '../../../core/ctx.js';
import { LEARN } from '../../../config.js';
import { BoardWalk } from '../board/walk.js';
import { frontSpot, FRONT_W_UPRIGHT } from '../board/front.js';
import { hudBand } from '../landscape.js';

const BD = LEARN.board;

export class PrepStation {
  constructor(host) {
    this.host = host; this.flow = host.flow; this.match = host.match; this.board = null; this.cur = null; this.seq = 0; this.log = [];
    this._onKey = (e) => { if (this.cur && e.key === 'Enter' && !e.repeat && !(G.menus && G.menus.current)) { e.preventDefault(); e.stopPropagation(); this._go('key'); } };
  }
  get still() { return false; }   // (she walks: walking on is how the round starts)
  get pose() { return this.cur && this.board && this.board.framed >= 0 ? this.board.framing : null; }
  get tapApi() { return this.cur && this.board && this.board.framed >= 0 ? this.board.tapApi : null; }
  _board() {
    if (this.board || typeof document === 'undefined') return this.board;
    const B = (this.board = new BoardWalk({ scene: G.scene, camera: G.camera, color: G.teamHex?.[0] || '#ff8a14', reduced: this.host.reduced, root: (G.hud && G.hud.root) || document.body, max: 2 }));
    try { B.warm(G.renderer, G.camera, G.scene)?.catch?.(() => {}); } catch (e) { /* on first use */ }
    B.on.speak = (text, o) => this.host.say(text, { slow: !!(o && o.slow), onEnd: o && o.onEnd });
    B.bandFor = hudBand;   // (framed under whatever the top row holds on a landscape phone — play-7's landscape.js, as the boss's booth board)
    return B;
  }
  warm() { this._board(); }

  show(specs, o = {}) {
    this.clear();
    this.cur = { specs: (specs || []).filter(Boolean), k: -1, o, key: null, at: null, board: false };
    if (typeof window !== 'undefined') window.addEventListener('keydown', this._onKey, true);
    this._place(0);
    return true;
  }
  _place(k) {
    const C = this.cur; if (!C) return;
    const B = this._board(), a = this.match.local, spec = C.specs[k];
    if (C.key && B) { B.free(C.key); C.key = null; }
    C.k = k; C.board = false;
    const bw = innerWidth < innerHeight ? FRONT_W_UPRIGHT : BD.w;
    const s = spec && a && B ? frontSpot({ a, base: this.host.facingYaw(null, a), spec, bw }) : { none: true, why: spec ? 'no board' : 'no spec' };
    if (!s.none) {
      const key = 'prep:' + ++this.seq;
      B.prepare(key, [spec]); B.place(key, [s], { w: bw });
      C.key = key; C.board = true;
    }
    C.at = a ? { x: a.pos.x, z: a.pos.z } : null;   // (walking on from here is the page turn)
    this._strip();
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'board', k, of: C.specs.length, placed: C.board, why: s.none ? s.why : '' });
  }
  // the strip: which round is next, and the two ways on (a board that found no room: its words are on the strip itself)
  _strip() {
    const C = this.cur, S = this.host.strip; if (!S) return;
    const more = C.k < C.specs.length - 1, spec = C.specs[C.k];
    const acts = [];
    if (more) acts.push({ text: `下一块 ${C.k + 2} / ${C.specs.length}`, onTap: () => this._place(C.k + 1) });
    acts.push({ text: C.o.go || '开始这一轮', primary: true, onTap: () => this._go('tap') });
    const why = !C.board && spec ? [spec.title, ...(spec.blocks || []).map((b) => b.text || [b.en, b.zh].filter(Boolean).join(' ')), ...(spec.rows || []).map((r) => [r.en, r.zh].filter(Boolean).join(' '))].filter(Boolean).join(' · ').slice(0, 160) : (C.o.why || '');
    S.show({ text: '', zh: '' }, {});
    S.fit(this.host.m1._topKeys());
    const touch = !!(G.input && G.input.touch && G.input.touch.active), go = C.o.go || '开始这一轮';
    S.verdict({ ok: true, head: C.o.head || '备战', why: why || (touch ? `看完展板，往前走（${LEARN.duel.prepWalk} 米）或点「${go}」` : `看完展板，往前走（${LEARN.duel.prepWalk} 米）或按回车：${go}`), actions: acts });
  }
  _go(how) {
    const C = this.cur; if (!C) return;
    this.clear();
    this.host.strip?.hide();
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'go', how });
    C.o.onGo?.(how);
  }

  update(dt) {
    const C = this.cur, B = this.board, a = this.match.local;
    if (!C) return;
    if (B) B.update(dt, C.key && a ? a.pos : null, { aspect: innerWidth / innerHeight, speed: a ? Math.hypot(a.vel?.x || 0, a.vel?.z || 0) : 0 });
    if (a && C.at && Math.hypot(a.pos.x - C.at.x, a.pos.z - C.at.z) > LEARN.duel.prepWalk) this._go('walk');
  }
  clear() {
    const C = this.cur; this.cur = null;
    if (typeof window !== 'undefined') window.removeEventListener('keydown', this._onKey, true);
    if (C && C.key && this.board) this.board.free(C.key);
  }
  debug() {
    const C = this.cur, B = this.board;
    return C ? { k: C.k, of: C.specs.length, board: C.board, framed: B ? B.framed : -1, at: C.at, log: this.log.slice(-6) } : { idle: true, log: this.log.slice(-4) };
  }
  dispose() { this.clear(); this.board?.dispose(); this.board = null; }
}
