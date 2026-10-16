// 题即玩法 play-wire — 展板路 M6 in the puzzle (docs/PLAY.md §3 M6, §4; the boards are LEARN §21's,
// src/learn/play/board/): the learning before a gate's questions — the word boards (5 words a board), the sounds (2 a
// board, their tip and examples), the grammar lesson's lines, the reading passage — stand along the last stretch of the
// route to the gate, on her right, facing her as she comes (boardSpots). Walking up to one frames it (the camera
// springs round; walking on lets go); a row replays its word, 「跟读」 says them with gaps, 「听全文」 plays the passage,
// 「读全文」 opens the reading strip (never while a question is up). The auto-walk stops at each unread board
// (host.autoTarget) and 「自动走」 walks her on. Nothing here is judged or recorded.
//
//   const S = new BoardStation(host)
//   S.prepare(g) → n          the gate's boards painted (two gates ahead) · S.place(g, route) when it becomes `next`
//   S.free(g) · S.update(dt) · S.pose (the framed board, or null) · S.nextSpot() · S.framed · S.tapApi · S.questionUp
//   S.clear() · S.dispose() · S.debug()
import { G } from '../../../core/ctx.js';
import { LEARN } from '../../../config.js';
import { daySteps } from '../../api.js';
import { BoardWalk } from '../board/walk.js';
import { boardSpots } from '../board/frame.js';
import { wordsSpec, soundsSpec, lessonSpec, passageSpec } from '../board/paint.js';

export const BOARDS_MAX = 6;   // boards a gate shows at most (BoardSet's instances: the review day's 48 sounds would be 24)
const chunk = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };

// what a gate's boards say (pure: Node-tested): [] for a gate without boards
export function gateSpecs(g, level) {
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
  if (mech === 'reading-room') {
    const P = (step && step.meta && step.meta.passage) || (items[0] && items[0].meta && items[0].meta.passage) || null;
    return P && P.en ? [passageSpec(P)] : [];
  }
  return [];
}

export class BoardStation {
  constructor(host) {
    this.host = host; this.flow = host.flow; this.match = host.match;
    this.walk = null; this.placed = null;   // placed: the gate whose boards stand
    this.log = [];
  }
  _ensure() {
    if (this.walk) return;
    const W = (this.walk = new BoardWalk({ scene: G.scene, camera: G.camera, color: G.teamHex?.[0] || '#ff8a14', reduced: this.host.reduced, root: (G.hud && G.hud.root) || document.body, max: BOARDS_MAX }));
    try { W.warm(G.renderer, G.camera, G.scene)?.catch?.(() => {}); } catch (e) { /* on first use */ }
    W.on.speak = (text, o) => this.host.say(text, { slow: !!(o && o.slow), onEnd: o && o.onEnd });
    // (the HUD's walk bar goes while a board is framed — in landscape it sat over the board's top edge; back when she walks on)
    W.on.framed = (i) => { this.log.push({ t: +this.flow.t.toFixed(2), ev: 'framed', i }); this.flow.hud?.playMode?.(true); };
    W.on.unframed = () => { if (this.flow.phase === 'walk' || this.flow.phase === 'exit') this.flow.hud?.playMode?.(false); };
    W.on.read = (i) => this.log.push({ t: +this.flow.t.toFixed(2), ev: 'read', i });
  }
  warm() { this._ensure(); }
  get pose() { return this.walk && this.walk.framing ? this.walk.framing : null; }
  get framed() { return this.walk ? this.walk.framed : -1; }
  get tapApi() { return this.walk && this.walk.framed >= 0 ? this.walk.tapApi : null; }
  set questionUp(on) { if (this.walk) this.walk.questionUp = !!on; }
  get still() { return false; }

  prepare(g) {
    this._ensure();
    if (g._boards) return g._boards.n;
    const specs = gateSpecs(g, this.flow.level);
    g._boards = { n: specs.length, placed: false };
    if (specs.length) this.walk.prepare(g.id, specs);
    return specs.length;
  }
  // the boards rise along the route to gate g (the stretch from the gate before it)
  place(g, route) {
    this._ensure();
    if (!g._boards) this.prepare(g);
    if (!g._boards.n || g._boards.placed) return;
    const spots = boardSpots(route, g._boards.n);
    this.walk.place(g.id, spots);
    g._boards.placed = true; this.placed = g;
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'place', gate: g.id, n: spots.length });
  }
  free(g) { if (this.walk && g._boards) { this.walk.free(g.id); g._boards.placed = false; g._boards.freed = true; if (this.placed === g) this.placed = null; } }
  nextSpot() { return this.walk ? this.walk.nextSpot() : null; }
  update(dt) {
    const W = this.walk; if (!W) return;
    const a = this.match.local;
    W.questionUp = this.flow.phase !== 'walk';
    W.update(dt, a ? a.pos : null, { aspect: innerWidth / innerHeight, speed: a ? Math.hypot(a.vel?.x || 0, a.vel?.z || 0) : 0 });
  }
  clear() { this.walk?.clear(); this.placed = null; }
  debug() {
    const W = this.walk;
    return W ? { framed: W.framed, boards: W.list.map((L) => ({ read: L.read, spot: [L.spot.x, L.spot.y, L.spot.z].map((v) => +v.toFixed(2)) })), strip: W.strip.isOpen, framing: W.framing ? { pos: W.framing.pos.toArray().map((v) => +v.toFixed(2)), fits: W.framing.frame.fits, rect: W.framing.frame.rect && { x: Math.round(W.framing.frame.rect.x), y: Math.round(W.framing.frame.rect.y), w: Math.round(W.framing.frame.rect.w), h: Math.round(W.framing.frame.rect.h) } } : null, hotspots: W.framed >= 0 ? W.set.project(W.list[W.framed].b, G.camera, innerWidth, innerHeight).map((h) => ({ id: h.id, x: Math.round(h.rect.x), y: Math.round(h.rect.y), w: Math.round(h.rect.w), h: Math.round(h.rect.h) })) : [], log: this.log.slice(-8) } : { idle: true };
  }
  dispose() { this.walk?.dispose(); this.walk = null; }
}
