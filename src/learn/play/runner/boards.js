// 墨浪跑酷 — the 看板段 (docs/PLAY.md §3 M6, §5.2 「看板段」; LEARN §21 BoardWalk's contract, play-4): a checkpoint's boards —
// the word boards (5 words a board), the sounds (2 a board), the grammar lesson's lines — stand along the straight
// before its first row (play-3's BoardWalk: the slab, the posts, the canvas face, the framing camera, the hotspots).
// The ink road carries her past them at LEARN.runner.boards.tide (slow, never stopped — PLAY §1.1) and the racer bots
// slow by the same factor (fair, §5.2); while she is in a board's zone the lens springs round to frame it (walking on
// lets go: the page turn, no 下一页); a tap on a row replays its word, 「跟读」 says them with gaps, 「读全文」 opens the
// reading strip (never while a row is asked). Nothing here is judged or recorded. The reading passage (阅读课文) stays
// the board before the start (PLAY §4 「M6（起跑前）」, play-runner).
//
//   boardSpecsOf(g, level) → specs           pure: what a checkpoint's boards say (play-wire's gateSpecs, the same chunking)
//   boardSpots(T, W, s0, n, o) → spots       pure: n boards from road length s0 on, on the roomier side (her right first),
//                                            facing back down the road; view = the road beside each (the zone she drifts through)
//   boardLength(n, o) → m                    the road a stretch of n boards takes (planCourse / _build reserve it)
//   const B = new RunnerBoards(flow)         B.prepare(g) → n · B.place(g, s0) → { s0, s1 } · B.free(g) · B.update(dt, her, aspect, speed)
//                                            B.framing · B.framed · B.tapApi · B.questionUp = bool · B.debug() · B.dispose()
import { G } from '../../../core/ctx.js';
import { LEARN } from '../../../config.js';
import { daySteps } from '../../api.js';
import { BoardWalk } from '../board/walk.js';
import { wordsSpec, soundsSpec, lessonSpec } from '../board/paint.js';
import { at, roomAt } from './track.js';

export const BOARDS_MAX = 6;   // boards a checkpoint shows at most (BoardSet's instances: the review day's 48 sounds would be 24)
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
const _p = {};

// what a checkpoint's boards say (pure: Node-tested): [] for one without boards
export function boardSpecsOf(g, level) {
  const mech = g.design && g.design.mechanic, items = g.items || [];
  let step = null;
  try { step = level && level.weekRef ? daySteps(level.weekRef, level.day).find((s) => s.id === g.stepId) : null; } catch (e) { step = null; }
  if (mech === 'word-board') {
    const rows = items.map((it) => ({ en: it.en, ipa: (it.meta && (it.meta.ipaUs || it.meta.ipa)) || '', zh: (it.meta && it.meta.zhFull) || it.zh, tts: it.tts || it.en }));
    const parts = chunk(rows, 5).slice(0, BOARDS_MAX);
    return parts.map((r, k) => wordsSpec(r, k + 1, parts.length));
  }
  if (mech === 'symbol-door') {
    const rows = items.map((it) => ({ ipa: it.en, name: it.meta && it.meta.name, tip: it.meta && it.meta.tip, examples: (it.meta && it.meta.examples) || [] }));
    const parts = chunk(rows, 2).slice(0, BOARDS_MAX);
    return parts.map((r, k) => soundsSpec(r, k + 1, parts.length));
  }
  if (mech === 'grammar-board' || mech === 'pron-quiz') {
    const lines = (step && step.meta && step.meta.lesson) || [];
    return lines.length ? [lessonSpec(g.title || (step && step.title) || '讲解', lines)] : [];
  }
  return [];
}

export function boardLength(n, o = LEARN.runner.boards) { return n > 0 ? o.lead + (n - 1) * o.gap + o.tail : 0; }

// n boards from road length s0 on: the first `lead` m in, then `gap` apart; each on the side with more clearance (her
// right when it has the room: the board stands `side` m off the centre line, past the road's walkable band when it can)
export function boardSpots(T, W, s0, n, o = LEARN.runner.boards) {
  const out = [];
  for (let k = 0; k < n; k++) {
    const s = s0 + o.lead + k * o.gap;
    at(T, s, _p);
    const room = roomAt(T, W, s, 0);
    const right = room.right + 0.3 >= room.left;   // (her right first, PLAY §3 M6)
    const dir = right ? 1 : -1, off = dir * Math.max(o.side, Math.min(room[right ? 'right' : 'left'] + 0.4, o.side + 1.2));
    const x = _p.x + _p.rx * off, z = _p.z + _p.rz * off;
    // facing back down the road, turned a little towards the road's middle (the tangent points on; she comes from −t)
    const yaw = Math.atan2(-_p.tx - _p.rx * dir * 0.35, -_p.tz - _p.rz * dir * 0.35);
    out.push({ x, y: _p.y, z, yaw, s, side: dir, view: { x: _p.x, y: _p.y, z: _p.z } });
  }
  return out;
}

export class RunnerBoards {
  constructor(flow) {
    this.flow = flow; this.walk = null; this.zones = []; this.log = [];
  }
  _ensure() {
    if (this.walk) return;
    const W = (this.walk = new BoardWalk({ scene: G.scene, camera: G.camera, color: (G.teamHex || [])[0] || '#ff8a14', reduced: this.flow.reduced, root: (G.hud && G.hud.root) || document.body, max: BOARDS_MAX }));
    try { W.warm(G.renderer, G.camera, G.scene)?.catch?.(() => {}); } catch (e) { /* on first use */ }
    W.on.speak = (text, o) => this.flow._speak(text, { slow: !!(o && o.slow), onEnd: o && o.onEnd });
    W.on.framed = (i) => this.log.push({ t: +this.flow.t.toFixed(2), ev: 'framed', i });
    W.on.read = (i) => this.log.push({ t: +this.flow.t.toFixed(2), ev: 'read', i });
  }
  warm() { try { this._ensure(); } catch (e) { console.warn('[runner] boards warm', e); } }
  get framing() { return this.walk && this.walk.framing ? this.walk.framing : null; }
  get framed() { return this.walk ? this.walk.framed : -1; }
  get tapApi() { return this.walk && this.walk.framed >= 0 ? this.walk.tapApi : null; }
  set questionUp(on) { if (this.walk) this.walk.questionUp = !!on; }

  // a checkpoint's boards painted (two checkpoints ahead; the canvases, not the meshes)
  prepare(g) {
    this._ensure();
    if (g._boards) return g._boards.n;
    const specs = boardSpecsOf(g, this.flow.level);
    g._boards = { n: specs.length, placed: false };
    if (specs.length) this.walk.prepare(g.id, specs);
    return specs.length;
  }
  // the boards rise along the road from s0: → the stretch { s0, s1 } they take (the tide's slow zone), null for none
  place(g, s0) {
    this._ensure();
    if (!g._boards) this.prepare(g);
    if (!g._boards.n || g._boards.placed) return null;
    const F = this.flow, o = LEARN.runner.boards;
    const spots = boardSpots(F.T, F.W, s0, g._boards.n, o);
    this.walk.place(g.id, spots);
    const zone = { gate: g, s0: s0 - 1, s1: s0 + boardLength(g._boards.n, o) };
    g._boards.placed = true; g._boards.zone = zone;
    this.zones.push(zone);
    this.log.push({ t: +F.t.toFixed(2), ev: 'place', gate: g.id, n: spots.length, s0: +s0.toFixed(1) });
    return zone;
  }
  free(g) {
    if (!this.walk || !g._boards) return;
    this.walk.free(g.id);
    g._boards.placed = false; g._boards.freed = true;
    this.zones = this.zones.filter((z) => z.gate !== g);
  }
  // the stretch she is on (the tide slows there, the bots too), or null
  zoneAt(s) { for (const z of this.zones) if (s >= z.s0 && s <= z.s1) return z; return null; }
  update(dt, her, aspect, speed) {
    const W = this.walk; if (!W) return;
    W.update(dt, her, { aspect, speed });
  }
  debug() {
    const W = this.walk;
    return W ? { framed: W.framed, n: W.list.length, read: W.list.filter((L) => L.read).length, zones: this.zones.map((z) => [+z.s0.toFixed(1), +z.s1.toFixed(1)]), framing: W.framing ? { fits: W.framing.frame.fits, rect: W.framing.frame.rect && { x: Math.round(W.framing.frame.rect.x), y: Math.round(W.framing.frame.rect.y), w: Math.round(W.framing.frame.rect.w), h: Math.round(W.framing.frame.rect.h) } } : null, strip: W.strip.isOpen, log: this.log.slice(-6) } : { idle: true };
  }
  dispose() { this.walk?.dispose(); this.walk = null; this.zones = []; }
}
