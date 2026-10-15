// 关卡学习 — 解密闯关 (puzzle) runtime (docs/LEARN.md §4, §5). Owned by Match in mode 'learn' (match.learn).
//
// A day's course is a string of gates on the stage's navigation graph, on the route from your spawn to the far side.
// Each gate carries one step's items. Walk up to a gate (LEARN.puzzle.gateRadius) and the match is held (`paused`)
// while the question layer (src/ui/hud-learn.js, G.hud.learn) asks the gate's items one by one:
//   right → counted; wrong → the gate gains a lock and the item comes back later in another form (a dictation as a
//   choice, a choice as a dictation; a stress row with its options reshuffled); once every item is through, the gate
//   opens: a cue, a burst, and the ink trail is painted on to the next gate in your team colour.
//   The last gate is the exit: `learn:done`, the results card (做完 / 共几题, 到期的词, 再来一关 / 回到菜单).
// The day's first answer per item goes to the store (当天只认首答 — the evidence the memory model reads).
//
// Events on the bus (docs/EVENTS.md): learn:question { itemId, gate, type, form } · learn:answer { itemId, ok, first,
// gate } · learn:gate { id, index, total, locks, opened } · learn:done { done, total, due }. Everything emitted is also
// kept in `this.log` so an audit can read the sequence back.
//
// Walking: the normal controls (WASD / the touch stick), or auto-walk (autoWalk(true), the HUD's 「自动走」 button):
// the level steers the squidkid along the nav route to the next gate and jumps the jump-up edges. Moving the stick
// takes control back. Phones in portrait have no stick, so there auto-walk is the way.
import * as THREE from 'three';
import { G, emit } from '../core/ctx.js';
import { LEARN } from '../config.js';
import { puzzleLevel, prompt, judge, store } from './api.js';

const _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9'\s-]/g, ' ').replace(/\s+/g, ' ').trim();

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
    this.total = lv.gates.reduce((n, g) => n + g.items.length, 0);
    this.asked = 0;
    this.finishT = -1;
    this.group = new THREE.Group(); this.group.name = 'learn-gates';
    G.scene.add(this.group);
    this._place();
    this._buildMeshes();
    this.hud?.start(this);
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
      const ring = new THREE.Mesh(ringG, mat({ color: col.clone(), opacity: 0.85 }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.06;
      const lock = new THREE.Mesh(lockG, mat({ color: col.clone(), opacity: 0.95 }));
      lock.position.y = 1.7;
      const beam = new THREE.Mesh(beamG, mat({ color: col.clone(), opacity: 0.22, blending: THREE.AdditiveBlending }));
      beam.position.y = 4.6; beam.visible = false;
      grp.add(ring, lock, beam);
      g.mesh = { grp, ring, lock, beam };
      this.group.add(grp);
    }
    this._styleGates();
  }

  _styleGates() {
    const col = G.teamColors[0] || new THREE.Color('#ff8a14');
    const grey = new THREE.Color('#6b6680'), red = new THREE.Color('#ff3d5e');
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

  _animate() {
    const t = G.time;
    for (const g of this.gates) {
      const M = g.mesh; if (!M || g.state === 'open') continue;
      const next = g.state === 'next';
      M.lock.position.y = 1.7 + Math.sin(t * (next ? 2.4 : 1.2) + g.index) * 0.18;
      M.lock.rotation.y = t * (next ? 1.6 : 0.5);
      if (next) { const s = 1 + Math.sin(t * 3.2) * 0.08; M.ring.scale.set(s, s, 1); }
    }
  }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    this.t += dt;
    this._animate();
    this._pourInk();
    if (this.finishT >= 0) { this.finishT -= dt; if (this.finishT < 0) this._results(); return; }
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

  // ---------------------------------------------------------------------------------------------- auto-walk
  autoWalk(on = true) {
    this.auto = !!on;
    this.autoPath = null; this.autoK = 0; this.autoStall = 0;
    if (!on && this.match.local) this.match.local.intent.move.set(0, 0, 0);
    this.hud?.walk?.(null, { auto: this.auto });
    return this.auto;
  }

  _autoWalk(a, g, dt) {
    const it = a.intent, nav = G.nav;
    // the player pushing the stick / keys takes control back
    if (it.move.lengthSq() > 0.04) { this.autoWalk(false); return; }
    if (!this.autoPath) {
      const from = nav.nearest(a.pos, 1.5, true);
      this.autoPath = from >= 0 ? nav.path(from, g.node, 0, 40000, true) : null;
      this.autoK = 1; this.autoStall = 0;
      if (!this.autoPath) { this.autoPath = [from, g.node]; }
    }
    const path = this.autoPath;
    // advance past nodes already reached (xz within 0.6 m, or clearly behind on the way to the next one)
    while (this.autoK < path.length - 1) {
      const n = nav.nodes[path[this.autoK]];
      if (Math.hypot(n.x - a.pos.x, n.z - a.pos.z) < 0.6) this.autoK++; else break;
    }
    const n = nav.nodes[path[Math.min(this.autoK, path.length - 1)]];
    const dx = n.x - a.pos.x, dz = n.z - a.pos.z, d = Math.hypot(dx, dz);
    const k = this.P.autoWalkSpeed;
    if (d > 1e-3) it.move.set((dx / d) * k, 0, (dz / d) * k);
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
    this.phase = 'ask';
    const a = this.match.local;
    a.intent.move.set(0, 0, 0); a.intent.jump = a.intent.fire = false;
    // hold the match BEFORE releasing the mouse: losing pointer lock on a live round opens the pause menu otherwise
    this.match.paused = true;
    G.input?.exitLock?.();
    G.audio?.play?.('ui_confirm', { volume: 0.7 });
    this._emit('learn:gate', { id: g.id, index: g.index + 1, total: this.gates.length, locks: g.locks, opened: false });
    this._askNext(g);
  }

  _askNext(g) {
    if (!g.queue.length) { this._open(g); return; }
    const item = g.queue.shift();
    const p = item._form === 'alt' ? this._altPrompt(item) : prompt(item);
    this.asked++;
    this._emit('learn:question', { itemId: item.id, gate: g.id, type: p.type, form: item._form || 'normal' });
    this.hud?.ask(p, {
      gate: { index: g.index + 1, total: this.gates.length, locks: g.locks, title: g.title },
      item: { n: this.asked, total: this.total + this._retriesLeft(), retry: item._form === 'alt' },
      onAnswer: (ans) => this._answer(g, item, p, ans),
    });
  }
  _retriesLeft() { let n = 0; for (const g of this.gates) for (const it of g.queue) if (it._form === 'alt') n++; return n; }

  _answer(g, item, p, ans) {
    let r;
    if (p._alt === 'choice-of-typed') r = judge(item, p.options[ans] ? p.options[ans].text : '');     // the picked word, judged as a dictation
    else if (p._alt === 'typed-of-choice') r = judge(item, item.options.findIndex((o) => norm(o.en) === norm(ans)));   // typed → option index
    else if (p._perm) r = judge(item, typeof ans === 'number' ? p._perm[ans] : ans);                  // reshuffled choice → original index
    else r = judge(item, ans);
    const { first } = store.recordFirst({ itemId: item.id, ok: r.ok, day: this.dayKey, at: Date.now() });
    if (first) this.firsts++;
    if (r.ok) this.right.add(item.id);
    this._emit('learn:answer', { itemId: item.id, ok: r.ok, first, gate: g.id });
    let again = false;
    if (!r.ok) {
      g.locks++;
      if (item._tries < this.P.retries) { item._tries++; item._form = 'alt'; g.queue.push(item); again = true; }
      this._styleGates();
    }
    G.audio?.play?.(r.ok ? 'hit_marker' : 'ui_error', { volume: 0.8 });
    this.hud?.verdict({ ok: r.ok, why: r.why, canonical: r.canonical, locks: g.locks, again }, () => this._askNext(g));
  }

  // The other form of an item (asked when the first answer was wrong), judged through the same judge():
  //   dictation / typed sentence → a choice among the right text and near misses (the picked text goes to the judge)
  //   zh→en choice → a dictation of the right word (the typed text is mapped to its option index)
  //   stress / listen-choice rows → the same choice, options reshuffled (indices mapped back)
  _altPrompt(item) {
    const base = prompt(item);
    if (base.type === 'typed') {
      const pool = this._wordPool(item);
      const opts = [{ text: item.en, zh: item.zh }];
      for (const w of pool) { if (opts.length >= 4) break; if (norm(w.en) !== norm(item.en)) opts.push({ text: w.en, zh: w.zh }); }
      shuffle(opts);
      return { type: 'choice', text: /\s/.test(item.en) ? '换个问法：再听一遍，选出你听到的那句' : '换个问法：再听一遍，选出你听到的词', zh: item.zh, tts: item.en, options: opts, _alt: 'choice-of-typed' };
    }
    const right = item.options && item.options[item.answer];
    if (right && right.zh && !/-/.test(right.en) && (base.text || '').startsWith('哪一个是')) {
      return { type: 'typed', text: `换个问法：把「${right.zh}」的英文打出来`, zh: right.zh, tts: null, placeholder: '输入这个英文词', _alt: 'typed-of-choice' };
    }
    const perm = item.options.map((_, i) => i); shuffle(perm);
    return { ...base, text: `换个问法：${base.text}`, options: perm.map((i) => ({ text: item.options[i].en, zh: item.options[i].zh })), _perm: perm };
  }
  // single words of this level (other gates' items and option words) as distractors, sentences for a sentence
  _wordPool(item) {
    const sentence = /\s/.test(item.en);
    const out = [];
    for (const g of this.level.gates) for (const it of g.items) {
      if (it.id !== item.id && /\s/.test(it.en) === sentence) out.push({ en: it.en, zh: it.zh });
      if (!sentence) for (const o of it.options || []) if (!/-/.test(o.en)) out.push({ en: o.en, zh: o.zh });
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
    const next = this.gates[this.cur];
    if (next) { next.state = 'next'; this._trail(g, next); }
    this._styleGates();
    this.match.paused = false;
    this.autoPath = null;   // a new target
    if (!next) { this.phase = 'done'; this.finishT = 0.9; return; }
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
    const dueIds = store.due(this.week);
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
    this.hud?.end?.();
    G.scene.remove(this.group);
    for (const g of this._geos || []) g.dispose();
    for (const m of this._mats || []) m.dispose();
    this.gates = []; this.inkQueue.length = 0;
  }
}

function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
