// 题即玩法 play-wire — the puzzle's play host (docs/PLAY.md §2, §4, §5.1; LEARN §22): LearnFlow (flow.js) owns one of
// these (the puzzle itself), with PlayRun's contract (canAsk / ask / update / gateOpened / dispose) — it routes every
// item of a gate to its mechanic and keeps the pieces they share:
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
import { stageLayout } from './beat/pads.js';
import { TypeStation } from './wire/type.js';
import { BeatStation, isBeatItem } from './wire/beat.js';
import { FlipStation } from './wire/flip.js';
import { BoardStation } from './wire/boards.js';
import { ExitStation } from './wire/exit.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3();
const TYPED = new Set(['type', 'typed', 'write']);
// play-fix: no crosshair while a station holds the lens — she types, hops the stage, flips a card, reads a framed board
// (or the booth / a sign) — nothing is aimed there and it sat on the typewriter mid-screen; M1 keeps it (she aims there).
// The runner hides it its own way (.iw-hud.is-runner, runner/tips.js)
const XH_CSS = '.iw-hud.is-station .iw-xh { display: none; }';
let xhCss = false;
function ensureXhCss() { if (xhCss || typeof document === 'undefined') return; xhCss = true; const el = document.createElement('style'); el.id = 'iw-wire-xh-css'; el.textContent = XH_CSS; document.head.appendChild(el); }

// which mechanic an item's prompt plays as (pure; Node-tested over the three weeks): a flip card → M8, a choice of the
// ink-target kinds (or the typed card's 回炉 choice) → M1, a pair / symbol choice of 2 or 4 → M3, anything typed → M4;
// null = nothing here (none in the three weeks' puzzles: every prompt has a mechanic — tests/learn/play-wire.test.mjs)
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
    this.type = new TypeStation(this); this.beat = new BeatStation(this); this.flip = new FlipStation(this); this.boards = new BoardStation(this); this.exit = new ExitStation(this);
    this.stations = { type: this.type, beat: this.beat, flip: this.flip };
    this.kind = null; this.cur = null; this.resized = false; this.log = [];
    this.xhOff = false; ensureXhCss();
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
    // the gate's boards go as its questions start (she read them on the way): M1's framing looks for open ground past the
    // gate and a board 5 m before it stood among the planks when the lens turned back
    if (g._boards && g._boards.placed) this.boards.free(g);
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
    this.type.update(dt); this.beat.update(dt); this.flip.update(dt); this.boards.update(dt); this.exit.update(dt);
    // standing still while a station needs her: her intents, after the controller wrote them, before she moves
    const S = this.kind && this.kind !== 'm1' ? this.stations[this.kind] : null;
    if (a && S && S.still) { const it = a.intent; it.move.set(0, 0, 0); it.jump = it.fire = it.squid = it.sub = it.special = false; }
    // between questions the boards / the exit area take the taps on their hotspots (a question's station sets its own)
    if (!this.kind) G.playTap = this.boards.tapApi || this.exit.tapApi || null;
    // the lens: the station's pose, else a framed board on the walk (or an exit station), else back to following her
    const pose = S ? S.pose : (this.kind === 'm1' ? null : (this.boards.pose || this.exit.pose));
    if (pose) { this.cam.take(G.rig, G.camera); this.cam.to(pose); }
    else if (this.cam.on && this.kind !== 'm1') this.cam.release(G.rig, a);
    this.cam.update(dt, G.rig, G.camera);
    this._crosshair(!!(S || pose));
    this.resized = false;
  }
  // the HUD's crosshair off while a station holds her / the lens (a class on the HUD, toggled only on a change)
  _crosshair(off) {
    if (off === this.xhOff) return;
    this.xhOff = off;
    G.hud?.el?.classList?.toggle('is-station', off);
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

  // ---------------------------------------------------------------------------------------------- the exit area
  exitStart() {
    const F = this.flow, nav = G.nav, path = F.path || [];
    if (!nav || path.length < 4) return false;
    const end = nav.nodes[path[path.length - 1]], back = nav.nodes[path[Math.max(0, path.length - 6)]];
    this._clearStation(); this.kind = null; this.cur = null;
    this.cam.release(G.rig, this.match.local);
    F.hud?.playMode?.(false);
    const on = this.exit.start(end, back, path[path.length - 1]);
    if (on) this.log.push({ t: +F.t.toFixed(2), ev: 'exit' });
    return on;
  }
  exitSpot() { return this.exit.nextSpot(); }
  exitSkip(s) { this.exit.skip(s); }
  exitDone() { return this.exit.done; }

  // ---------------------------------------------------------------------------------------------- shared helpers
  // the auto-walk's target on the way to gate g: the next unread board's viewing spot (she stops there), else null (the
  // gate); in the exit area the next station (the booth, the check-in pad)
  autoTarget(g) {
    if (!G.nav) return null;
    if (this.flow.phase === 'exit') { const s = this.exit.nextSpot(); return s && s.node >= 0 ? { node: s.node, stop: true, exit: s.kind } : null; }
    if (this.flow.phase !== 'walk') return null;
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
  // a near-flat, walkable spot for the beat stage past gate g: the route point (2–14 m on) whose footprint sits best.
  // play-fix: and no prop on it — a fountain, a bench, a crane leg (their colliders are in the physics: the level's blocks,
  // hidden ones included) inside a pad, its rim or its sign — and every pad and sign seen from the stage camera, the
  // camera of this orientation and of the other one (the phone may turn; the first gate's plaza stood a pad half behind
  // its fountain in portrait); no spot like that 2–14 m on → further along the route (to 22 m), then back before the gate
  stageSpot(g, n = 2) {
    const nav = G.nav, L = G.level, path = this.flow.path || [];
    const fallback = { origin: (g._play && g._play.anchor ? g._play.anchor : g.pos).clone(), yaw: this.facingYaw(g, this.match.local) };
    if (!nav || !L || path.length < 2) return fallback;
    // the stage camera's spot (stage frame) at this aspect: it must see the home pad — a roof, a bridge, a gazebo over
    // the spot hides the whole stage (the first version stood the pads under the harbour pavilion) — and (play-fix) the rest
    const aspect = innerWidth / innerHeight, lays = [stageLayout(n, aspect), stageLayout(n, aspect < 1 ? 844 / 390 : 390 / 844)];
    const a = this.match.local;
    let best = null;
    const P = G.physics;
    // every route point 2–14 m past the gate, and beside it (±1.6 / ±3.2 m, a little dearer): the first gate's plaza has
    // its fountain right on the route, the open ground is beside it
    const along = (from, to, dir) => {
      const out = [];
      let s = 0;
      for (let i = g.pathIndex + dir; i >= 1 && i < path.length && s < to; i += dir) {
        const p = nav.nodes[path[i - dir]], q0 = nav.nodes[path[i]];
        s += Math.hypot(q0.x - p.x, q0.z - p.z);
        if (s < from) continue;
        // (the stage faces on along the route: back before the gate it still faces the way she goes)
        const yaw = dir > 0 ? Math.atan2(q0.x - p.x, q0.z - p.z) : Math.atan2(p.x - q0.x, p.z - q0.z), sy = Math.sin(yaw), cy = Math.cos(yaw);
        for (const side of [0, 1.6, -1.6, 3.2, -3.2]) {
          const x = q0.x + cy * side, z = q0.z - sy * side;
          if (side !== 0) { const k = nav.nearest(_v.set(x, q0.y, z), 0.8, true); if (k < 0 || Math.hypot(nav.nodes[k].x - x, nav.nodes[k].z - z) > 0.75) continue; }
          out.push({ q: side === 0 ? q0 : { x, y: nav.nodes[nav.nearest(_v.set(x, q0.y, z), 0.8, true)].y, z }, yaw, sy, cy, acc: dir > 0 ? s : -s, side: Math.abs(side) });
        }
      }
      return out;
    };
    const ids = this._ids || (this._ids = []);
    // a solid block standing on the stage (above its floor, below head height) inside the disc (x, z, r)
    const propIn = (blocks, x, y, z, r) => {
      for (const b of blocks) for (const h of [0.4, 1.2]) for (let k = 0; k <= 8; k++) {
        const ang = (k / 8) * Math.PI * 2, rr = k === 8 ? 0 : r;
        if (L.pointInBlock(b, _w.set(x + Math.cos(ang) * rr, y + h, z + Math.sin(ang) * rr), 0.05)) return true;
      }
      return false;
    };
    const rate = (c) => {
      const { q, sy, cy } = c;
      const W = (lx, lz, out) => out.set(q.x + cy * lx + sy * lz, q.y, q.z - sy * lx + cy * lz);
      let ok = 0, dev = c.side * 0.3;
      for (const [lx, lz] of STAGE_PTS) {
        const x = q.x + cy * lx + sy * lz, z = q.z - sy * lx + cy * lz;
        // the pad and its rim near-flat at the stage's level (a fountain basin, a step: not flat), on the nav grid, and
        // nothing low or high standing between the home pad and it (the pads have no collision: she hops over the ground)
        let flat = true;
        for (const [rx, rz] of [[0, 0], [0.65, 0], [-0.65, 0], [0, 0.65], [0, -0.65]]) { const gy = L.groundHeight(x + rx, z + rz, q.y + 1.2); if (!(gy > -Infinity && Math.abs(gy - q.y) < 0.3)) { flat = false; break; } }
        // (a walkable node within 0.75 m: the grid keeps 0.46 m from every collider — a fountain basin's cells are not in it)
        const k = nav.nearest(_v.set(x, q.y, z), 0.8, true), walk = k >= 0 && Math.hypot(nav.nodes[k].x - x, nav.nodes[k].z - z) < 0.75;
        const clear = !P || !P.los || (P.los(_w.set(q.x, q.y + 0.4, q.z), _v.set(x, q.y + 0.4, z)) && P.los(_w.set(q.x, q.y + 1.1, q.z), _v.set(x, q.y + 1.1, z)));
        // and open sky over it (5 m): nothing between the stage camera and the pads
        const sky = !P || !P.los || P.los(_w.set(x, q.y + 0.5, z), _v.set(x, q.y + 5.5, z));
        if (flat && walk && clear && sky) ok++; else dev += flat && clear && sky ? 0.5 : 1;
      }
      // the props on the stage: this orientation's pads (and the home pad) and their signs
      const lay = lays[0], discs = [[0, 0, 1.0], ...lay.pads.map((p) => [p.x, p.z, p.r + 0.2]), ...lay.labels.map((l) => [l.x, l.z, Math.max(0.5, l.w * 0.45)])];
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const [lx, lz, r] of discs) { W(lx, lz, _v); x0 = Math.min(x0, _v.x - r); x1 = Math.max(x1, _v.x + r); z0 = Math.min(z0, _v.z - r); z1 = Math.max(z1, _v.z + r); }
      const near = [];
      for (const id of L.queryBlocks(x0, z0, x1, z1, ids)) { const b = L.blocks[id]; if (b && b.solid && b.aabbMax.y > q.y + 0.25 && b.aabbMin.y < q.y + 2.6) near.push(b); }
      let props = 0;
      if (near.length) for (const [lx, lz, r] of discs) { W(lx, lz, _c); if (propIn(near, _c.x, q.y, _c.z, r)) props++; }
      // every pad (and the home pad) and every sign seen from the stage camera — both orientations' cameras
      let unseen = 0, camSees = true;
      if (P && P.los) for (let li = 0; li < lays.length; li++) {
        const Ly = lays[li], cp = Ly.cam.pos;
        _c.set(q.x + cy * cp[0] + sy * cp[2], q.y + cp[1], q.z - sy * cp[0] + cy * cp[2]);
        const pts = [[0, 0.15, 0], ...Ly.pads.map((p) => [p.x, 0.15, p.z]), ...Ly.labels.map((l) => [l.x, l.y, l.z])];
        for (let k = 0; k < pts.length; k++) {
          const [lx, ly, lz] = pts[k];
          W(lx, lz, _v); _v.y = q.y + ly;
          if (!P.los(_c, _v)) { unseen++; if (k === 0 && li === 0) camSees = false; }
        }
      }
      // she hops onto the home pad from where she stands: no wall in between
      const hop = !P || !P.los || !a || P.los(_w.set(a.pos.x, a.pos.y + 1.2, a.pos.z), _v.set(q.x, q.y + 1.2, q.z));
      if (!camSees) dev += 4;
      const score = ok * 2 - dev - Math.abs(c.acc) * 0.04 - props * 3 - unseen * 1.2 - (hop ? 0 : 3);
      const good = ok === STAGE_PTS.length && props === 0 && unseen === 0 && hop;
      return { score, good, ok, props, unseen, camSees, hop };
    };
    const scan = (cands) => {
      for (const c of cands) {
        const R = rate(c);
        if (!best || (R.good && !best.good) || (R.good === best.good && R.score > best.score)) best = { score: R.score, good: R.good, origin: new THREE.Vector3(c.q.x, c.q.y, c.q.z), yaw: c.yaw, ok: R.ok, props: R.props, unseen: R.unseen, acc: +c.acc.toFixed(1), side: c.side };
        if (R.good && c.side === 0) return true;
      }
      return !!(best && best.good);
    };
    // (the ranges in turn: the first one with a good spot wins — the near stretch past the gate, further on, back before it)
    if (!scan(along(2, 14, 1)) && !scan(along(14, 22, 1))) scan(along(2, 10, -1));
    if (!best) return fallback;
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'stage', ok: best.ok, good: best.good, props: best.props, unseen: best.unseen, at: best.acc, side: best.side, n });
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
    return { mechanic: this.kind, item: this.cur && this.cur.item.id, cam: { on: this.cam.on, want: !!this.cam.want, fov: +this.cam.fov.toFixed(1), rigMode: G.rig && G.rig.mode }, still: !!(S && S.still), xhOff: this.xhOff, m1: this.m1.debug(), station: S ? S.debug() : null, boards: this.boards.debug(), exit: this.exit.debug(), log: this.log.slice(-12) };
  }
  dispose() {
    if (typeof window !== 'undefined') { window.removeEventListener('keydown', this._onKey, true); window.removeEventListener('resize', this._onResize); window.removeEventListener('orientationchange', this._onResize); }
    this._clearStation();
    this.cam.release(G.rig, this.match.local);
    this._crosshair(false);
    this.type.dispose(); this.beat.dispose(); this.flip.dispose(); this.boards.dispose(); this.exit.dispose();
    this.m1.dispose();
  }
}
