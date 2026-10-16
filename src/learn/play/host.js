// 题即玩法 play-wire — the puzzle's play host (docs/PLAY.md §2, §4, §5.1; LEARN §22): LearnFlow (flow.js) owns one of
// these under LEARN.play instead of PlayRun alone, with the same contract (canAsk / ask / toCard / update / gateOpened /
// dispose) — it routes every item of a gate to its mechanic and keeps the pieces they share:
//   M1 墨靶      choice items (单词选义 / 语法 · 发音小测 / 阅读题, the typed card's 回炉 choice)   → PlayRun (run.js, play-1)
//   M3 节拍台    听辨对子 (2 pads) · 音标 (4 pads)                                            → wire/beat.js
//   M4 字弹      单词卡 · 听写句 · 写句 (and a 「不熟」 flip card typed next)                   → wire/type.js
//   M8 翻牌靶    the review day's flash-flip cards                                           → wire/flip.js
//   M6 展板路    the boards on the way to a gate (words, sounds, the lesson, the passage)       → wire/boards.js
// Shared here: the strip (PlayRun's PlayStrip), the voice (hud-learn's recordings / device voice), the lens (cam.js:
// a station's pose is sprung to, M1 keeps the follow camera and its own framing), standing still while a station
// needs her (her intents zeroed after the controller wrote them — never match.paused, never learn.hold), the capture
// keydown for the beat stage, the flat spot a stage stands on, the auto-walk's stops at the boards.
// Judging is only ever flow._judgeRecord (every station hands it an index, a string or her rating).
import * as THREE from 'three';
import { G } from '../../core/ctx.js';
import { PlayRun } from './run.js';
import { PlayCam } from './cam.js';
import { canPlayM1 } from './m1.js';
import { TypeStation } from './wire/type.js';
import { BeatStation, isBeatItem } from './wire/beat.js';
import { FlipStation } from './wire/flip.js';
import { BoardStation } from './wire/boards.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const TYPED = new Set(['type', 'typed', 'write']);

// which mechanic an item's prompt plays as (pure; Node-tested over the three weeks): a flip card → M8, a choice of the
// ink-target kinds (or the typed card's 回炉 choice) → M1, a pair / symbol choice of 2 or 4 → M3, anything typed → M4;
// null = nothing here (the card, for a form that keeps it)
export function kindOfItem(item, p) {
  if (!p) return null;
  if (p._flip) return 'flip';
  if (canPlayM1(item, p)) return 'm1';
  if (isBeatItem(item, p)) return 'beat';
  if (TYPED.has(p.type)) return 'type';
  return null;
}
// the beat stage's footprint (beat/pads.js presets, both orientations): the points that must be near-flat and walkable
const STAGE_PTS = [[0, 0], [2.6, 0.1], [-2.6, 0.1], [0, 2.4], [0, -1.85], [1.35, 0.7], [-1.35, 0.7]];

export class PlayHost {
  constructor(flow) {
    this.flow = flow; this.match = flow.match; this.hud = flow.hud;
    this.m1 = new PlayRun(flow);
    this.strip = this.m1.strip; this.reduced = this.m1.reduced;
    this.cam = new PlayCam({ reduced: this.reduced });
    this.type = new TypeStation(this); this.beat = new BeatStation(this); this.flip = new FlipStation(this); this.boards = new BoardStation(this);
    this.stations = { type: this.type, beat: this.beat, flip: this.flip };
    this.kind = null; this.cur = null; this.resized = false; this.log = [];
    this._onKey = (e) => { if (this.kind === 'beat' && this.beat.key(e)) { e.preventDefault(); e.stopPropagation(); } };
    this._onResize = () => { this._resizedAt = true; };
    if (typeof window !== 'undefined') { window.addEventListener('keydown', this._onKey, true); window.addEventListener('resize', this._onResize); window.addEventListener('orientationchange', this._onResize); }
    // the stations are built on the level's first frames (their programs compile under the match fade, not mid-walk);
    // the boards and the beat atlases of the first gates are drawn then too
    this._warmT = 0.05;
  }

  // ---------------------------------------------------------------------------------------------- which mechanic
  kindOf(item, p) { return kindOfItem(item, p); }
  canAsk(g, item, p) { return this.kindOf(item, p) !== null; }

  ask(g, item, p) {
    const kind = this.kindOf(item, p); if (!kind) return false;
    const m = this.match, F = this.flow;
    if (m.paused && m.state === 'playing') { m.paused = false; G.input?.requestLock?.(); }   // (after a card, under the flag)
    if (kind !== this.kind) this._clearStation();
    this.kind = kind; this.cur = { g, item, p };
    if (kind === 'm1') { this.cam.release(G.rig, m.local); this.m1.ask(g, item, p); }
    else {
      F.hud?.hide?.(); F.hud?.playMode?.(true);
      this.cam.take(G.rig, G.camera);
      const S = this.stations[kind];
      S.ask(g, item, p);
      G.playTargets = null; G.playTap = S.tapApi || null;
    }
    if (F.asking) F.asking.play = kind === 'm1' ? 'ink-target' : kind === 'beat' ? 'beat-pads' : kind === 'type' ? 'type-shot' : 'flip-target';
    this.log.push({ t: +F.t.toFixed(2), ev: 'ask', kind, item: item.id });
    return true;
  }
  // a card item (none in the three weeks' puzzles now: every kind has a mechanic — the flag-off path and the forms keep it)
  toCard() { this._clearStation(); this.kind = null; this.cur = null; this.cam.release(G.rig, this.match.local); this.m1.toCard(); }
  _clearStation() {
    if (this.kind === 'm1') this.m1._clear();
    else if (this.kind && this.stations[this.kind]) this.stations[this.kind].clear();
    if (G.playTap && this.kind && this.kind !== 'm1') G.playTap = null;
  }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    const m = this.match, a = m.local;
    if (this._resizedAt) { this._resizedAt = false; this.resized = true; }
    // the physical keys stop while a menu is up (hers, or the pause over her typing)
    const menuUp = !!(m.paused || (G.menus && G.menus.current));
    this.type.gate(!menuUp);
    if (this._warmT > 0) { this._warmT -= dt; if (this._warmT <= 0) this._warmAll(); }
    this.m1.update(dt);
    if (m.paused) { this.resized = false; return; }
    this.type.update(dt); this.beat.update(dt); this.flip.update(dt); this.boards.update(dt);
    // standing still while a station needs her: her intents, after the controller wrote them, before she moves
    const S = this.kind && this.kind !== 'm1' ? this.stations[this.kind] : null;
    if (a && S && S.still) { const it = a.intent; it.move.set(0, 0, 0); it.jump = it.fire = it.squid = it.sub = it.special = false; }
    // the lens: the station's pose, else a framed board on the walk, else back to following her
    const pose = S ? S.pose : (this.kind === 'm1' ? null : this.boards.pose);
    if (pose) { this.cam.take(G.rig, G.camera); this.cam.to(pose); }
    else if (this.cam.on && this.kind !== 'm1') this.cam.release(G.rig, a);
    this.cam.update(dt, G.rig, G.camera);
    this.resized = false;
  }
  _warmAll() {
    try { this.type.warm(); this.beat.warm(); this.flip.warm(); this.boards.warm(); } catch (e) { console.warn('[play-wire] warm', e); }
    this._prep(this.flow.cur, this.flow.cur + 2);
    const g0 = this.flow.gates[this.flow.cur];
    if (g0) this._placeBoards(g0);
  }
  _prep(from, to) {
    const gates = this.flow.gates || [];
    for (let k = Math.max(0, from); k <= Math.min(gates.length - 1, to); k++) {
      const g = gates[k];
      if (g._wire) continue;
      g._wire = true;
      try { this.beat.prepare(g); } catch (e) { console.warn('[play-wire] beat atlas', e); }
      try { this.boards.prepare(g); } catch (e) { console.warn('[play-wire] boards', e); }
    }
  }
  // the route's last stretch to gate g: from the gate before it (or the spawn) — the boards stand along it
  _placeBoards(g) {
    const F = this.flow, nav = G.nav, path = F.path || [];
    if (!g._boards || !g._boards.n || g._boards.placed || !nav) return;
    const prev = F.gates[g.index - 1], i0 = prev ? prev.pathIndex : 0;
    const route = [];
    for (let i = i0; i <= g.pathIndex && i < path.length; i++) { const n = nav.nodes[path[i]]; route.push({ x: n.x, y: n.y, z: n.z }); }
    if (route.length >= 2) this.boards.place(g, route);
  }

  gateOpened(g) {
    this._clearStation(); this.kind = null; this.cur = null;
    this.m1.gateOpened(g);
    this.beat.free(g); this.boards.free(g);
    this.cam.release(G.rig, this.match.local);
    this._prep(this.flow.cur, this.flow.cur + 2);
    const next = this.flow.gates[this.flow.cur];
    if (next) this._placeBoards(next);
  }

  // ---------------------------------------------------------------------------------------------- shared helpers
  // the auto-walk's target on the way to gate g: the next unread board's viewing spot (she stops there), else null (the gate)
  autoTarget(g) {
    if (this.flow.phase !== 'walk' || !G.nav) return null;
    const s = this.boards.nextSpot(); if (!s) return null;
    const k = G.nav.nearest(_v.set(s.x, s.y, s.z), 1.5, true);
    return k >= 0 ? { node: k, stop: true, board: s.i } : null;
  }
  // which way the route goes past gate g from where she stands: towards the M1 anchor (a few metres on), else the route's tangent
  facingYaw(g, a) {
    const anchor = g._play && g._play.anchor;
    if (anchor && Math.hypot(anchor.x - a.pos.x, anchor.z - a.pos.z) > 1.5) return Math.atan2(anchor.x - a.pos.x, anchor.z - a.pos.z);
    const nav = G.nav, path = this.flow.path || [];
    if (nav && path.length > g.pathIndex + 1) { const p = nav.nodes[path[g.pathIndex]], q = nav.nodes[path[Math.min(path.length - 1, g.pathIndex + 2)]]; if (Math.hypot(q.x - p.x, q.z - p.z) > 0.3) return Math.atan2(q.x - p.x, q.z - p.z); }
    return a.yaw;
  }
  // a near-flat, walkable spot for the beat stage past gate g: the route point (2–14 m on) whose footprint sits best
  stageSpot(g, n = 2) {
    const nav = G.nav, L = G.level, path = this.flow.path || [];
    const fallback = { origin: (g._play && g._play.anchor ? g._play.anchor : g.pos).clone(), yaw: this.facingYaw(g, this.match.local) };
    if (!nav || !L || path.length < 2) return fallback;
    let best = null, acc = 0;
    for (let i = g.pathIndex + 1; i < path.length && acc < 14; i++) {
      const p = nav.nodes[path[i - 1]], q = nav.nodes[path[i]];
      acc += Math.hypot(q.x - p.x, q.z - p.z);
      if (acc < 2) continue;
      const yaw = Math.atan2(q.x - p.x, q.z - p.z), sy = Math.sin(yaw), cy = Math.cos(yaw);
      let ok = 0, dev = 0;
      const P = G.physics;
      for (const [lx, lz] of STAGE_PTS) {
        const x = q.x + cy * lx + sy * lz, z = q.z - sy * lx + cy * lz;
        // the pad and its rim near-flat at the stage's level (a fountain basin, a step: not flat), on the nav grid, and
        // nothing low or high standing between the home pad and it (the pads have no collision: she hops over the ground)
        let flat = true;
        for (const [rx, rz] of [[0, 0], [0.65, 0], [-0.65, 0], [0, 0.65], [0, -0.65]]) { const gy = L.groundHeight(x + rx, z + rz, q.y + 1.2); if (!(gy > -Infinity && Math.abs(gy - q.y) < 0.3)) { flat = false; break; } }
        const walk = nav.nearest(_v.set(x, q.y, z), 0.8, true) >= 0;
        const clear = !P || !P.los || (P.los(_w.set(q.x, q.y + 0.4, q.z), _v.set(x, q.y + 0.4, z)) && P.los(_w.set(q.x, q.y + 1.1, q.z), _v.set(x, q.y + 1.1, z)));
        if (flat && walk && clear) ok++; else dev += flat && clear ? 0.5 : 1;
      }
      const score = ok * 2 - dev - acc * 0.04;
      if (!best || score > best.score) best = { score, origin: new THREE.Vector3(q.x, q.y, q.z), yaw, ok, acc: +acc.toFixed(1) };
      if (ok === STAGE_PTS.length) break;
    }
    if (!best) return fallback;
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'stage', ok: best.ok, at: best.acc, n });
    return best;
  }
  // the voice: the course's recording or the device's (hud-learn's _speak), the strip's ▶ lit while it plays
  say(text, o = {}) {
    if (!text) { o.onEnd?.(); return; }
    const H = this.hud; if (!H || !H._speak) { o.onEnd?.(); return; }
    this.strip?.playing(true);
    H._speak(text, () => { this.strip?.playing(false); o.onEnd?.(); }, { slow: !!o.slow });
  }

  // what the audits read
  debug() {
    const S = this.kind && this.kind !== 'm1' ? this.stations[this.kind] : null;
    return { mechanic: this.kind, item: this.cur && this.cur.item.id, cam: { on: this.cam.on, want: !!this.cam.want, fov: +this.cam.fov.toFixed(1), rigMode: G.rig && G.rig.mode }, still: !!(S && S.still), m1: this.m1.debug(), station: S ? S.debug() : null, boards: this.boards.debug(), log: this.log.slice(-12) };
  }
  dispose() {
    if (typeof window !== 'undefined') { window.removeEventListener('keydown', this._onKey, true); window.removeEventListener('resize', this._onResize); window.removeEventListener('orientationchange', this._onResize); }
    this._clearStation();
    this.cam.release(G.rig, this.match.local);
    this.type.dispose(); this.beat.dispose(); this.flip.dispose(); this.boards.dispose();
    this.m1.dispose();
  }
}
