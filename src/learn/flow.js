// 关卡学习 — 解密闯关 (puzzle) runtime (docs/LEARN.md §4, §5). Owned by Match in mode 'learn' (match.learn).
//
// A day's course is a string of gates on the stage's navigation graph, on the route from your spawn to the far side.
// Each gate carries one step's items. Walk up to a gate (LEARN.puzzle.gateRadius) and its items come one by one as
// things on the stage (题即玩法, docs/PLAY.md — the play host, src/learn/play/host.js; the world never stops):
//   right → counted; wrong → the gate gains a lock and the item comes back later in another form (a typed word as a
//   choice of words, a dictation heard slowly; a choice with its options reshuffled); once every item is through, the
//   gate opens: a cue, a burst, and the ink trail is painted on to the next gate in your team colour.
//   After the last gate: the exit area (the echo booth, the check-in pad), then `learn:done` and the results card.
// The day's first answer per item goes to the store (当天只认首答 — the evidence the memory model reads).
//
// Events on the bus (docs/EVENTS.md): learn:question { itemId, gate, type, form } · learn:answer { itemId, ok, first,
// gate } · learn:gate { id, index, total, locks, opened } · learn:done { done, total, due }. Everything emitted is also
// kept in `this.log` so an audit can read the sequence back.
//
// 题即玩法 (docs/PLAY.md; play-1 … play-8 = docs/LEARN.md §18–§27): arriving holds nothing — no match.paused, no hold,
// no card — every item is a station of the host (ink targets, the beat pads, the 字弹, a flip card, the boards …) and
// a game action is the answer; the judging is _judgeRecord (play/judge.js judgeRecord). The forms built on this class
// (the runner, the duel, the boss, versus2, coop2) bring their own hosts.
//
// Walking: the normal controls (WASD / the touch stick), or auto-walk (autoWalk(true), the HUD's 「自动走」 button):
// the level steers the squidkid along the nav route to the next gate and jumps the jump-up edges. Moving the stick
// takes control back. Phones in portrait have no stick, so there auto-walk is the way.
import * as THREE from 'three';
import { G, emit } from '../core/ctx.js';
import { LEARN } from '../config.js';
import { puzzleLevel, prompt, store } from './api.js';
import { cardFor } from './forms/common.js';   // the review day's flip cards (快闪翻牌, F)
import { judgeRecord } from './play/judge.js';   // the one judging path (题即玩法 play-8)
import { MECHANICS } from './design.js';   // the signs' names (写字墙 · 回声亭 · 打卡垫 …)
import { PlayHost } from './play/host.js';
import { isBanner } from './play/layout.js';   // (a word's 回炉 choice: which distractors stay ink balls)   // 题即玩法 (docs/PLAY.md): every item is a thing on the stage, the world runs on (play-wire, LEARN §22)

const _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9'\s-]/g, ' ').replace(/\s+/g, ' ').trim();
const WORD = /^[A-Za-z][A-Za-z']*$/;   // (a single word: a typed word's 回炉 choice offers only words — arena/alt.js the same)

export class LearnFlow {
  constructor(match, opts = {}) {
    this.match = match;
    this.opts = opts;                 // { kind: 'puzzle', level: { week, day } | a built level }
    const lv = opts.level && opts.level.gates ? opts.level : puzzleLevel(opts.level?.week || 1, opts.level?.day || 1);
    this.level = lv;
    this.week = lv.week || opts.level?.week || 1; this.day = lv.day || opts.level?.day || 1;
    this.dayKey = `w${this.week}d${this.day}`;
    this.P = LEARN.puzzle;
    this.hud = G.hud?.learn || null;
    this.log = [];
    this.t = 0;
    this.phase = 'walk';              // walk | ask | done
    this.cur = 0;                     // index of the next (closed) gate
    this.auto = false;                // auto-walk on
    this.autoPath = null; this.autoK = 0; this.autoStall = 0;
    this.inkQueue = [];               // trail splats still to land: [{ at, x, y, z }]
    this.right = new Set();           // item ids answered right (each counts once)
    this.firsts = 0;                  // answers that were the day's first for their item
    this.asked = 0;
    this.finishT = -1;
    this.group = new THREE.Group(); this.group.name = 'learn-gates';
    G.scene.add(this.group);
    this._place();
    this.total = this.gates.reduce((n, g) => n + g.items.length, 0);
    this._buildMeshes();
    this._buildSigns();
    this.hud?.start(this);
    // (the puzzle itself: the forms that extend this class bring their own play hosts)
    this.play = this.constructor === LearnFlow && match.mode === 'learn' ? new PlayHost(this) : null;
  }

  // ---------------------------------------------------------------------------------------------- placement
  // Gates sit on the A* route from the spawn to the exit (the far spawn, pulled in past its barrier: team 0 may not
  // enter the other side's spawn zone). They are spread by distance along the route, the first one far enough from
  // the spawn that the level starts with a walk. Climb edges are left out of the plan: they need inked walls.
  _place() {
    const nav = G.nav, L = G.level, P = this.P;
    const pad0 = L.spawnPads[0], pad1 = L.spawnPads[1];
    const start = nav.nearest(_v.set(pad0.x, pad0.y, pad0.z), 2, true);
    const dx = -pad1.x, dz = -pad1.z, dl = Math.hypot(dx, dz) || 1, pull = (L.spawnBarrier || 4) + 3;
    const goal = nav.nearest(_v.set(pad1.x + (dx / dl) * pull, pad1.y, pad1.z + (dz / dl) * pull), 3, false);
    let path = start >= 0 && goal >= 0 ? nav.path(start, goal, 0, 40000, true) : null;
    if (!path || path.length < 3) path = this._farthest(start);
    this.path = path;
    // cumulative distance along the route
    const cum = [0];
    for (let i = 1; i < path.length; i++) { const a = nav.nodes[path[i - 1]], b = nav.nodes[path[i]]; cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z) + Math.abs(b.y - a.y) * 0.5); }
    const len = cum[cum.length - 1];
    // how many gates fit (never fewer than one): extra gate defs are merged into the last one so no item is lost
    const defs = this.level.gates.map((g) => ({ ...g, items: g.items.slice() }));
    // 题即玩法 (play-wire, PLAY §4 「写句 → M4 写字墙」): the write wall's sentences are the last gate — typed on the rig at
    // the exit, judged W as the boss's W phase judges them (the sign stood here as a placeholder since B, asking nothing)
    if (this.constructor === LearnFlow && this.match.mode === 'learn') for (const sg of this.level.signs || []) if (sg.design && sg.design.mechanic === 'write-wall' && sg.items && sg.items.length) defs.push({ ...sg, items: (this.level.short ? sg.items.slice(0, 2) : sg.items).slice(), kind: 'write' });
    const fit = Math.max(1, Math.min(defs.length, Math.floor((len - P.firstGateMin) / P.minGateGap) + 1));
    while (defs.length > fit) { const last = defs.pop(); defs[defs.length - 1].items.push(...last.items); }
    const n = defs.length;
    this.gates = defs.map((def, k) => {
      const s = n === 1 ? len : Math.min(len, P.firstGateMin + ((len - P.firstGateMin) * k) / (n - 1));
      let i = 0; while (i < path.length - 1 && cum[i] < s) i++;
      const node = nav.nodes[path[i]];
      return { ...def, index: k, pathIndex: i, node: path[i], pos: new THREE.Vector3(node.x, node.y, node.z), state: k === 0 ? 'next' : 'locked', locks: 0, queue: def.items.map((it) => ({ ...it, _tries: 0, _form: null })) };
    });
  }

  // no route to the far side (an odd stage): the farthest node reachable from the spawn by walk / jump / drop edges
  _farthest(start) {
    const nav = G.nav;
    if (start < 0) return [start];
    const dist = new Map([[start, 0]]), from = new Map(), q = [start];
    let far = start;
    while (q.length) {
      const k = q.shift();
      for (const e of nav.nodes[k].nb) {
        if (e.type === 'climb' || dist.has(e.to) || !nav.valid[e.to]) continue;
        dist.set(e.to, dist.get(k) + e.cost); from.set(e.to, k); q.push(e.to);
        if (dist.get(e.to) > dist.get(far)) far = e.to;
      }
    }
    const out = [];
    for (let k = far; k !== undefined; k = from.get(k)) out.push(k);
    return out.reverse();
  }

  // ---------------------------------------------------------------------------------------------- 3D markers
  // Per gate: a flat ring on the ground and a floating marker (the "lock"). The next gate also carries a tall beam so
  // it can be found across the stage. Unlit materials (no new shadow / lighting shader variants), built here under
  // the match fade so nothing compiles mid-walk.
  _buildMeshes() {
    const col = G.teamColors[0] || new THREE.Color('#ff8a14');
    const ringG = new THREE.RingGeometry(0.85, 1.35, 40);
    const lockG = new THREE.OctahedronGeometry(0.42, 0);
    const beamG = new THREE.CylinderGeometry(0.09, 0.18, 9, 10, 1, true);
    this._geos = [ringG, lockG, beamG];
    this._mats = [];
    const mat = (o) => { const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, ...o }); this._mats.push(m); return m; };
    for (const g of this.gates) {
      const grp = new THREE.Group();
      grp.position.copy(g.pos);
      // (forceSinglePass: three draws a transparent double-sided material twice a frame — back faces, then front — and rebuilds
      // its program parameters before each; a flat ring, an additive beam and the lock look the same in one pass — the lock is
      // closed and seen through itself, but one unlit colour: its back and front blend the same, in either order — LEARN §50)
      const ring = new THREE.Mesh(ringG, mat({ color: col.clone(), opacity: 0.85, forceSinglePass: true }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
      const lock = new THREE.Mesh(lockG, mat({ color: col.clone(), opacity: 0.95, forceSinglePass: true }));
      lock.position.y = 1.7;
      const beam = new THREE.Mesh(beamG, mat({ color: col.clone(), opacity: 0.22, blending: THREE.AdditiveBlending, forceSinglePass: true }));
      beam.position.y = 4.6; beam.visible = false;
      grp.add(ring, lock, beam);
      g.mesh = { grp, ring, lock, beam };
      this.group.add(grp);
    }
    this._styleGates();
  }

  // The day's signs (路标: 写字墙 · 回声亭 · 打卡垫 · 周报牌 · 入门小测牌 — the lesson steps, LEVELS §2.1 rule 5) stand in
  // the exit area: at the end of the route (the far exit in a puzzle, the finish in a race), spread across it, each a
  // ring on the ground and a board on a post with its name, facing the way she comes in. Placeholders for now: they
  // are not gates and ask nothing (the write wall's sentences are scored in the boss's W phase, LEARN §8 note 4).
  _buildSigns() {
    const signs = this.level.signs || [], nav = G.nav, path = this.path || [];
    this.signs = [];
    if (!signs.length || path.length < 4 || typeof document === 'undefined') return;
    // (题即玩法 play-wire: the placeholders stood exactly where the last gate's objects float; the host's own stations —
    // the echo booth, the check-in pad, the boards — take the exit area, LEARN §22)
    if (this.constructor === LearnFlow && this.match.mode === 'learn') return;
    const end = nav.nodes[path[path.length - 1]], back = nav.nodes[path[Math.max(0, path.length - 6)]];
    let fx = end.x - back.x, fz = end.z - back.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const sx = -fz, sz = fx, col = G.teamColors[0] || new THREE.Color('#ff8a14');
    const ringG = this._geos[0];
    const postG = new THREE.CylinderGeometry(0.06, 0.06, 1.5, 8), boardG = new THREE.PlaneGeometry(1.9, 0.95);
    this._geos.push(postG, boardG);
    this.signGroup = new THREE.Group(); this.signGroup.name = 'learn-signs';
    const n = signs.length;
    signs.forEach((sg, i) => {
      const mech = sg.design && sg.design.mechanic, name = (MECHANICS[mech] && MECHANICS[mech].zh) || '路标';
      const lat = (i - (n - 1) / 2) * 2.6, ahead = -2.5;
      _v.set(end.x + sx * lat + fx * ahead, end.y + 1, end.z + sz * lat + fz * ahead);
      const k = nav.nearest(_v, 2.5, true), at = k >= 0 ? nav.nodes[k] : end;
      const grp = new THREE.Group();
      grp.position.set(at.x, at.y, at.z);
      grp.rotation.y = Math.atan2(-fx, -fz);   // the board faces back along the route, towards her
      const ringM = new THREE.MeshBasicMaterial({ color: col.clone(), transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, forceSinglePass: true });
      const ring = new THREE.Mesh(ringG, ringM); ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06; ring.scale.set(0.8, 0.8, 1);
      const postM = new THREE.MeshBasicMaterial({ color: new THREE.Color('#2c2540'), toneMapped: false });
      const post = new THREE.Mesh(postG, postM); post.position.y = 0.75;
      const tex = signTexture(name, sg.title || '', col);
      const boardM = new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, side: THREE.DoubleSide, forceSinglePass: true });
      const board = new THREE.Mesh(boardG, boardM); board.position.y = 1.95;
      grp.add(ring, post, board);
      this._mats.push(ringM, postM, boardM); (this._texs || (this._texs = [])).push(tex);
      this.signGroup.add(grp);
      this.signs.push({ id: sg.id, mechanic: mech, name, pos: grp.position.clone() });
    });
    G.scene.add(this.signGroup);
  }

  _styleGates() {
    const col = G.teamColors[0] || new THREE.Color('#ff8a14');
    // (题即玩法: a lock is coral — never a team's colour, PLAY §1 rule 6)
    const grey = new THREE.Color('#6b6680'), red = new THREE.Color('#f08a7a');
    for (const g of this.gates) {
      const M = g.mesh; if (!M) continue;
      const next = g.state === 'next', open = g.state === 'open';
      M.ring.material.color.copy(open ? col : next ? col : grey);
      M.ring.material.opacity = open ? 0.35 : next ? 0.9 : 0.5;
      M.lock.visible = !open;
      M.lock.material.color.copy(next ? (g.locks ? red : col) : grey);
      M.beam.visible = next;
      M.beam.material.color.copy(col);
    }
  }

  _animate(dt = 1 / 60) {
    const t = G.time;
    for (const g of this.gates) {
      const M = g.mesh; if (!M || g.state === 'open') continue;
      const next = g.state === 'next';
      M.lock.position.y = 1.7 + Math.sin(t * (next ? 2.4 : 1.2) + g.index) * 0.18;
      M.lock.rotation.y = t * (next ? 1.6 : 0.5);
      if (this.play) {
        const k = g._lockPopAt != null ? Math.max(0, 1 - (t - g._lockPopAt) / 0.55) : 0; M.lock.scale.setScalar(1 + 0.7 * k * k);   // a miss: the lock pops
        // the follow camera standing in a gate (she stops just past it, the lens behind her) sees through its lock and beam
        const c = G.camera, f = c ? Math.min(1, Math.max(0, (Math.hypot(c.position.x - g.pos.x, c.position.z - g.pos.z) - 1.5) / 1.8)) : 1;
        // and while she stands at it answering, its beam (it finds the gate across the stage) goes and its lock steps
        // back behind the question objects — full again only for the pop of a miss
        const at = g === this.gates[this.cur] && this.phase !== 'walk' ? 0 : 1;
        g._beamK = (g._beamK ?? 1) + (at - (g._beamK ?? 1)) * Math.min(1, dt * 6);
        M.lock.material.opacity = 0.95 * f * (g._beamK + (1 - g._beamK) * Math.max(0.25, k));
        M.beam.material.opacity = 0.22 * f * g._beamK;
      }
      if (next) { const s = 1 + Math.sin(t * 3.2) * 0.08; M.ring.scale.set(s, s, 1); }
    }
  }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    this.t += dt;
    this._animate(dt);
    this._pourInk();
    this.play?.update(dt);
    if (this.finishT >= 0) { this.finishT -= dt; if (this.finishT < 0) this._results(); return; }
    if (this.phase === 'exit') { this._exitUpdate(dt); return; }
    if (this.phase !== 'walk') return;
    const a = this.match.local, g = this.gates[this.cur];
    if (!a || !g || !a.alive || this.match.state !== 'playing') return;
    if (this.auto) this._autoWalk(a, g, dt);
    const d = Math.hypot(a.pos.x - g.pos.x, a.pos.z - g.pos.z);
    if (this.hud) {
      const cam = G.camera, fw = cam.getWorldDirection(_v);
      const want = Math.atan2(g.pos.x - a.pos.x, g.pos.z - a.pos.z), have = Math.atan2(fw.x, fw.z);
      let rel = want - have; while (rel > Math.PI) rel -= Math.PI * 2; while (rel < -Math.PI) rel += Math.PI * 2;
      this.hud.walk({ dist: d, angle: rel, index: this.cur + 1, total: this.gates.length, auto: this.auto, title: g.title });
    }
    if (d < this.P.gateRadius && Math.abs(a.pos.y - g.pos.y) < 2.5) this._arrive(g);
  }

  // the exit area (题即玩法 play-wire, src/learn/play/wire/exit.js): the walk to its stations — the booth, then the check-in
  // pad; stepping onto the pad ends the day (the results after it, as after the last gate before)
  _exitUpdate(dt) {
    const a = this.match.local, H = this.play;
    if (!a || !a.alive || this.match.state !== 'playing' || !H) return;
    const s = H.exitSpot();
    // (a stop the walk cannot reach — a wall moved in, a node off the grid — is passed over after exitWalkMax s on it)
    if (s !== this._exitTo) { this._exitTo = s; this._exitT = 0; } else if (s) this._exitT = (this._exitT || 0) + dt;
    if (s && this._exitT > this.P.exitWalkMax) { H.exitSkip(s); this._exitTo = null; this.autoPath = null; return; }
    if (this.auto) { if (s && s.node >= 0) this._autoWalk(a, { node: s.node, pos: s }, dt); else this.autoWalk(false); }
    if (this.hud && s) {
      const cam = G.camera, fw = cam.getWorldDirection(_v);
      const want = Math.atan2(s.x - a.pos.x, s.z - a.pos.z), have = Math.atan2(fw.x, fw.z);
      let rel = want - have; while (rel > Math.PI) rel -= Math.PI * 2; while (rel < -Math.PI) rel += Math.PI * 2;
      this.hud.walk({ dist: Math.hypot(a.pos.x - s.x, a.pos.z - s.z), angle: rel, index: this.gates.length, total: this.gates.length, auto: this.auto, title: s.title });
    }
    if (H.exitDone()) { this.phase = 'done'; this.finishT = 0.9; this.hud?.hide(); }
  }

  // ---------------------------------------------------------------------------------------------- auto-walk
  autoWalk(on = true) {
    this.auto = !!on;
    this.autoPath = null; this.autoK = 0; this.autoStall = 0; this._autoMove = null;
    if (!on && this.match.local) this.match.local.intent.move.set(0, 0, 0);
    this.hud?.walk?.(null, { auto: this.auto });
    return this.auto;
  }

  _autoWalk(a, g, dt) {
    const it = a.intent, nav = G.nav;
    // the player pushing the stick / keys takes control back (not the move this walk set itself: a slow frame — over
    // 1/45 s — runs the match in two sub-steps, and the second one finds the first one's move still in the intent)
    const own = this._autoMove && Math.abs(it.move.x - this._autoMove.x) < 1e-6 && Math.abs(it.move.z - this._autoMove.z) < 1e-6;
    if (it.move.lengthSq() > 0.04 && !own) { this.autoWalk(false); return; }
    // (题即玩法 play-wire: a board on the way is a stop — the walk goes to its viewing spot and ends there; 「自动走」 again goes on)
    const tgt = this.play?.autoTarget?.(g) || null, node = tgt ? tgt.node : g.node;
    if (this.autoPath && this._autoNode !== node) this.autoPath = null;
    if (!this.autoPath) {
      const from = nav.nearest(a.pos, 1.5, true);
      this.autoPath = from >= 0 ? nav.path(from, node, 0, 40000, true) : null;
      this.autoK = 1; this.autoStall = 0; this._autoNode = node;
      if (!this.autoPath) { this.autoPath = [from, node]; }
    }
    const path = this.autoPath;
    if (tgt && tgt.stop) { const e = nav.nodes[path[path.length - 1]]; if (Math.hypot(e.x - a.pos.x, e.z - a.pos.z) < 0.7) { this.autoWalk(false); return; } }
    // advance past nodes already reached (xz within 0.6 m, or clearly behind on the way to the next one)
    while (this.autoK < path.length - 1) {
      const n = nav.nodes[path[this.autoK]];
      if (Math.hypot(n.x - a.pos.x, n.z - a.pos.z) < 0.6) this.autoK++; else break;
    }
    const n = nav.nodes[path[Math.min(this.autoK, path.length - 1)]];
    const dx = n.x - a.pos.x, dz = n.z - a.pos.z, d = Math.hypot(dx, dz);
    const k = this.P.autoWalkSpeed;
    if (d > 1e-3) it.move.set((dx / d) * k, 0, (dz / d) * k);
    this._autoMove = { x: it.move.x, z: it.move.z };
    const edge = this.autoK > 0 && this.autoK < path.length ? nav.edge(path[this.autoK - 1], path[this.autoK]) : null;
    it.jump = !!(edge && edge.type === 'jump' && d < this.P.jumpAhead + 0.8) || (n.y - a.pos.y > 0.45 && d < 1.2);
    it.squid = false; it.fire = false;
    // stuck (no progress for a while): re-plan from where we are
    const hs = Math.hypot(a.vel?.x || 0, a.vel?.z || 0);
    this.autoStall = hs < 0.4 ? this.autoStall + dt : 0;
    if (this.autoStall > 1.6) { this.autoPath = null; this.autoStall = 0; it.jump = true; }
  }

  // ---------------------------------------------------------------------------------------------- gate → questions
  _arrive(g) {
    this.phase = 'ask';   // (nothing holds: the stations stand her still themselves while one needs her)
    const a = this.match.local;
    a.intent.move.set(0, 0, 0); a.intent.jump = a.intent.fire = false;
    G.audio?.play?.('ui_confirm', { volume: 0.7 });
    this._emit('learn:gate', { id: g.id, index: g.index + 1, total: this.gates.length, locks: g.locks, opened: false });
    this._askNext(g);
  }

  _askNext(g) {
    if (!g.queue.length) { this._open(g); return; }
    const item = g.queue.shift();
    const p = cardFor(g, item, () => prompt(item), () => this._altPrompt(item));
    this.asking = { gate: g, item, p };   // (the live question: the forms and the audits read it)
    this.asked++;
    this._emit('learn:question', { itemId: item.id, gate: g.id, type: p.type, form: item._form || 'normal' });
    if (this.play && this.play.canAsk(g, item, p)) { this.play.ask(g, item, p); return; }   // a thing on the stage: the world runs on
    // (every prompt a gate of the three weeks can ask has a station — tests/learn/play-wire.test.mjs; one without would
    // be passed over, never asked as a card)
    console.warn('[learn] no station for', item.id, p.type);
    this._emit('learn:skip', { itemId: item.id, gate: g.id, type: p.type });
    this._askNext(g);
  }
  // the reworded items still to come (coop2 counts them into its 「第 n / 共几题」)
  _retriesLeft() { let n = 0; for (const g of this.gates) for (const it of g.queue) if (it._form === 'alt') n++; return n; }

  // The puzzle's side of the one judging path (PLAY §1 rule 2; the path itself is play/judge.js judgeRecord: judge → the
  // day's first answer into the store, a hint → H, a flip card's rating → F, a held sentence → 我的写法也对 S / 继续 W).
  // Every station hands its answer here (an ink target's / a pad's index, the 字弹's text with o.hinted / o.hold, her
  // rating on a flip card); what is the puzzle's own stays here: the tallies, learn:answer, the lock and the retry.
  _judgeRecord(g, item, p, ans, o = {}) {
    const out = judgeRecord({ item, p, ans, o, store });
    const { r, first } = out;
    if (out.held) return { r, first: false, again: false, held: true };
    if (first) this.firsts++;
    if (r.ok) this.right.add(item.id);
    this._emit('learn:answer', { itemId: item.id, ok: r.ok, first, gate: g.id });
    let again = false;
    if (!r.ok && p._flip) { item._flipTyped = true; g.queue.unshift(item); again = true; }   // 不记得: no lock, type it right away
    else if (!r.ok) {
      g.locks++;
      if (item._tries < this.P.retries) { item._tries++; item._form = 'alt'; g.queue.push(item); again = true; }
      this._styleGates();
    }
    return { r, first, again };
  }

  // The other form of an item (asked when the first answer was wrong), judged through the same judge():
  //   typed word (or sentence) → a choice among the right text and near misses — ink balls (the picked text is judged)
  //   dictation sentence → the same dictation, heard slowly (PLAY §4 「M4 慢速、逐词」)
  //   zh→en choice → a dictation of the right word (the typed text is mapped to its option index)
  //   stress / listen-choice rows → the same choice, options reshuffled (indices mapped back)
  _altPrompt(item) {
    const base = prompt(item);
    if (base.type !== 'choice') {   // ('type' from A's engine, 'typed' from the stub: anything she types)
      // (题即玩法: a missed dictation sentence comes back as the same dictation, heard slowly — PLAY §4 「M4 慢速、逐词」; a
      // choice of four sentences would be four long planks, which no mechanic shows)
      if (item.meta && item.meta.kind === 'dict') return { ...base, text: '换个问法：慢一点再听一遍，把听到的句子写下来。', _tip: { zh: '回炉：慢速再听一遍 — ' + (item.zh || ''), variant: 'slow', slow: true } };
      const pool = this._wordPool(item);
      const opts = [{ text: item.en, zh: item.zh }];
      // (题即玩法: the choice is M1 ink balls — a long word makes planks, at most LEARN.m1.bannerMax of them; with a short
      // word every distractor stays a ball, so a long one is passed over)
      const long = (w) => isBanner([{ text: String(w.en ?? w.text ?? ''), zh: String(w.zh || '') }]);
      const want = long(item) ? LEARN.m1.bannerMax : 4;
      for (const w of pool) { if (opts.length >= want) break; if (norm(w.en) === norm(item.en)) continue; if (!/[a-z]/i.test(w.en) || (!long(item) && long(w))) continue; opts.push({ text: w.en, zh: w.zh }); }
      shuffle(opts);
      return { type: 'choice', text: /\s/.test(item.en) ? '换个问法：再听一遍，选出你听到的那句' : '换个问法：再听一遍，选出你听到的词', zh: item.zh, tts: item.en, options: opts, _alt: 'choice-of-typed' };
    }
    const right = item.options && item.options[item.answer];
    if (right && right.zh && !/-/.test(right.en) && (base.text || '').startsWith('哪一个是')) {
      return { type: 'typed', text: `换个问法：把「${right.zh}」的英文打出来`, zh: right.zh, tts: null, placeholder: '输入这个英文词', _alt: 'typed-of-choice' };
    }
    const perm = item.options.map((_, i) => i); shuffle(perm);
    return { ...base, text: `换个问法：${base.text}`, options: perm.map((i) => base.options[i]), _perm: perm };   // (the engine's own option texts, reshuffled: a word's options are its meanings)
  }
  // single words of this level (other gates' items and option words) as distractors, sentences for a sentence (a word's
  // distractors are words — WORD, as arena/alt.js has it: a 音标 item's options are symbols like /j/, never a word card's
  // choice; play-8)
  _wordPool(item) {
    const sentence = /\s/.test(item.en);
    const out = [];
    for (const g of this.level.gates) for (const it of g.items) {
      if (it.id !== item.id && /\s/.test(it.en) === sentence && (sentence || WORD.test(it.en))) out.push({ en: it.en, zh: it.zh });
      if (!sentence) for (const o of it.options || []) if (o.en && WORD.test(o.en)) out.push({ en: o.en, zh: o.zh });
    }
    if (sentence && out.length < 3) {
      // too few sentences to pick from: swap one word of this sentence for another single word of the level
      const words = []; for (const g of this.level.gates) for (const it of g.items) if (!/\s/.test(it.en)) words.push(it);
      const toks = item.en.split(' ');
      for (const w of words) { const i = toks.findIndex((t) => /^[A-Z]/.test(t) && t.replace(/\W/g, '') !== w.en); if (i >= 0) { const s = toks.slice(); s[i] = w.en + (toks[i].endsWith('.') ? '.' : ''); out.push({ en: s.join(' '), zh: '（换了一个词）' }); } }
    }
    return shuffle(out);
  }

  // ---------------------------------------------------------------------------------------------- gate opens
  _open(g) {
    g.state = 'open';
    this._emit('learn:gate', { id: g.id, index: g.index + 1, total: this.gates.length, locks: g.locks, opened: true });
    const col = G.teamColors[0];
    _v.copy(g.pos); _v.y += 0.4;
    G.fx?.burst?.(_v, _up, col, { count: 26, speed: 5.5, size: 0.14, spread: 0.9 });
    G.fx?.ring?.(_v, _up, col, { radius: 2.2, life: 0.45 });
    G.audio?.play?.('refill_full', { pos: g.pos, volume: 0.9 });
    G.audio?.play?.('splat_big', { pos: g.pos, volume: 0.5 });
    G.paint?.splat(_v.set(g.pos.x, g.pos.y + 0.05, g.pos.z), this.P.inkRadius * 1.6, 0, { kind: 'blast' });
    this.hud?.hide();
    this.cur++;
    this.play?.gateOpened(g);   // (its objects go, its atlas is freed, the gate now 2 ahead gets one)
    const next = this.gates[this.cur];
    if (next) { next.state = 'next'; this._trail(g, next); }
    this._styleGates();
    this.autoPath = null;   // a new target
    if (!next) {
      // 题即玩法 (play-wire): the day ends on the exit area's stations — the 回声亭, the 打卡垫 (踩上去 = 走完了) — when it has them
      if (this.play && this.play.exitStart()) { this.phase = 'exit'; this.autoPath = null; this._emit('learn:exit', { signs: (this.level.signs || []).length }); G.input?.requestLock?.(); return; }
      this.phase = 'done'; this.finishT = 0.9; return;
    }
    this.phase = 'walk';
    G.input?.requestLock?.();   // the answer's key / tap was the gesture …
    if (G.game) G.game._relock = true;   // … and if the browser still refuses, the next click on the stage takes the mouse back
  }

  // the ink runs from the opened gate to the next one along the route, one splat every inkStep metres, landing in
  // order so it reads as a pour rather than a stamp
  _trail(from, to) {
    const nav = G.nav, P = this.P;
    let acc = 0, t = G.time + 0.05, prev = null;
    for (let i = from.pathIndex; i <= to.pathIndex; i++) {
      const n = nav.nodes[this.path[i]];
      if (prev) acc += Math.hypot(n.x - prev.x, n.z - prev.z);
      if (!prev || acc >= P.inkStep) { this.inkQueue.push({ at: t, x: n.x, y: n.y + 0.05, z: n.z }); t += 0.035; acc = 0; }
      prev = n;
    }
  }
  _pourInk() {
    const q = this.inkQueue;
    if (!q.length || !G.paint) return;
    while (q.length && q[0].at <= G.time) { const s = q.shift(); G.paint.splat(_v.set(s.x, s.y, s.z), this.P.inkRadius, 0, { kind: 'trail', seed: Math.random() }); }
  }

  // ---------------------------------------------------------------------------------------------- the end
  _results() {
    this.finishT = -1;
    this.match.paused = true;
    G.input?.exitLock?.();
    // 打卡 (LEARN §39): the check-in card the 打卡垫 asked for comes first (the level is over and held); the results after it
    if (this.play?.exit?.card?.(() => this._resultsCard())) return;
    this._resultsCard();
  }
  _resultsCard() {
    let dueIds = []; try { dueIds = store.due(this.level.weekRef || this.week); } catch (e) { dueIds = []; }   // (A's store wants the week object: the level carries it as weekRef)
    const byId = new Map(); for (const g of this.level.gates) for (const it of g.items) byId.set(it.id, it);
    const due = dueIds.map((id) => byId.get(id)).filter(Boolean).map((it) => ({ en: it.en, zh: it.zh }));
    const data = { done: this.right.size, total: this.total, due, firsts: this.firsts, locks: this.gates.reduce((n, g) => n + g.locks, 0), week: this.week, day: this.day };
    this._emit('learn:done', data);
    G.audio?.play?.('victory_fanfare', { volume: 0.8 });
    this.hud?.results(data, {
      again: () => G.game?.api?.startLearn?.({ week: this.week, day: this.day, kind: 'puzzle' }),
      menu: () => G.game?.api?.quitMatch?.(),
    });
  }

  _emit(name, payload) { this.log.push({ t: +this.t.toFixed(2), name, ...payload }); emit(name, payload); }

  dispose() {
    this.play?.dispose(); this.play = null;
    this.hud?.end?.();
    G.scene.remove(this.group);
    if (this.signGroup) G.scene.remove(this.signGroup);
    for (const t of this._texs || []) t.dispose();
    for (const g of this._geos || []) g.dispose();
    for (const m of this._mats || []) m.dispose();
    this.gates = []; this.inkQueue.length = 0;
  }
}

// a sign's board: its name big (写字墙) and the step's title small, on dark glass with a rim in her ink
function signTexture(name, title, col) {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const x = c.getContext('2d');
  const hex = '#' + col.getHexString();
  x.fillStyle = 'rgba(21, 18, 28, 0.92)'; x.strokeStyle = hex; x.lineWidth = 12;
  x.beginPath(); x.roundRect ? x.roundRect(8, 8, 496, 240, 36) : x.rect(8, 8, 496, 240); x.fill(); x.stroke();
  const font = "'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', 'Noto Sans SC', 'Microsoft YaHei', system-ui, sans-serif";
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = hex; x.font = `800 84px ${font}`; x.fillText(name, 256, 100, 460);
  x.fillStyle = '#e9e5f4'; x.font = `600 34px ${font}`; x.fillText(String(title).slice(0, 20), 256, 186, 460);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
