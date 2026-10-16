// 题即玩法 play-5 — M1 墨靶 in an arena (docs/PLAY.md §5.3, §3 M5): play-1's PlayRun (src/learn/play/run.js: the strip, the
// tap-shot, the crosshair shot, the deliberate hit, the verdict, debug()) with the two things an arena changes —
//   where the objects go     a duel: the cluster is laid out on the screen as in the puzzle, placed towards the contested
//                            zone (over its centre when she is near it), then it turns round its own anchor to face her
//                            wherever she runs (a billboard pinned in the world — ArenaTargets);
//                            the boss: every option ball hangs on one of HULLBREAKER's weak points (eyes, belly, cannon;
//                            weakSockets) and rides it; long labels are planks stacked over its shell
//   what an answer does      the form's own _judgeRecord (duel.js / boss.js: the zone's flood, the boss's hit or move)
// The world never stops: she keeps running, the bots keep fighting, the camera only eases towards the zone / the boss
// for LEARN.arena.frameFor s when a question comes (her own look ends it). A round of hers that meets an object while
// she fights only splats on it (ShotTargets: deliberate = false) — never an answer.
import * as THREE from 'three';
import { G } from '../../../core/ctx.js';
import { LEARN } from '../../../config.js';
import { PlayRun } from '../run.js';
import { ArenaTargets } from './targets.js';
import { gateLabels, labelKey } from '../atlas.js';
import { layoutTargets } from '../layout.js';
import { answerOfTarget, verdictLines } from '../m1.js';
import { prompt } from '../../api.js';
import { canPlayArena, weakSockets, clusterLocals, cameraPositions, orbitBasis, bossBallRadius } from './m1.js';

const A = LEARN.arena, M = LEARN.m1;
const UP = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _o = new THREE.Vector3(), _w = new THREE.Vector3(), _e = new THREE.Vector3(), _m = new THREE.Vector3(), _p = new THREE.Vector3(), _b = new THREE.Vector3();
const _basis = { right: new THREE.Vector3(), up: new THREE.Vector3(0, 1, 0), back: new THREE.Vector3() };
const _pts = Array.from({ length: 4 }, () => ({ x: 0, y: 0, z: 0, plate: { x: 0, y: 0, z: 0 } }));

export class ArenaRun extends PlayRun {
  // opts: { mode: 'zone' | 'boss', anchor(out) → Vector3 (the zone's centre on its floor), boss() → the Boss }
  constructor(flow, opts = {}) {
    super(flow, { Targets: ArenaTargets });
    this.mode = opts.mode || 'zone';
    this.anchorOf = opts.anchor || null; this.bossOf = opts.boss || null;
    this._qAtlas = null;
  }

  canAsk(g, item, p) { return canPlayArena(item, p); }

  // the atlas of a round / a phase is drawn when it begins (the prep board, the phase banner): the forms call prep(g)
  _prep() { /* (PlayRun's constructor asks for the gates 2 ahead of flow.cur — an arena's gates are rounds / phases) */ }
  prep(g) {
    if (!g || g._play) return;
    const labels = gateLabels(g.items, prompt, canPlayArena);   // (a retry reshuffles the same options: the same labels)
    g._play = { atlas: labels.length ? this.T.atlas(g.id, labels) : null, labels, region: null, anchor: null, rights: 0 };
  }
  // the round's atlas when it holds every label of this question, else one small atlas for the question alone (the
  // typed card's 回炉 choice draws its distractors from the level: not in the round's sheet)
  _atlasOf(g) {
    const C = this.cur; if (!C) return g._play && g._play.atlas;
    const keys = C.labels.map((l) => labelKey(l, C.banner)), A0 = g._play && g._play.atlas;
    if (A0 && keys.every((k) => A0.uv.has(k))) return A0;
    const key = 'q:' + C.serial;
    if (this._qAtlas && this._qAtlas !== key) { this.T.freeAtlas(this._qAtlas); this._qAtlas = null; }
    const labels = gateLabels([C.item], () => C.p, () => true);
    const Aq = labels.length ? this.T.atlas(key, labels) : null;
    this._qAtlas = Aq ? key : null;
    return Aq;
  }
  gateOpened(g) {
    this._clear();
    this.flow.hud?.playMode?.(false);
    if (g && g._play && g._play.atlas) { this.T.freeAtlas(g.id); g._play.atlas = null; }
    if (this._qAtlas) { this.T.freeAtlas(this._qAtlas); this._qAtlas = null; }
  }

  // ---------------------------------------------------------------------------------------------- the lens
  // the camera eases towards the zone (the cluster's anchor) or the boss's head when a question comes; she keeps
  // running, her own look ends the ease at once (PlayRun's update does the easing on the rig's yaw / pitch)
  _target(out) {
    if (this.mode === 'boss') { const b = this.bossOf && this.bossOf(); if (b && b.model) { b.model.getSocket('eyeL', out); b.model.getSocket('eyeR', _b); out.lerp(_b, 0.5); return out; } return null; }
    if (this.anchorOf) { this.anchorOf(out); out.y += A.lift; return out; }
    return null;
  }
  _frame() {
    const C = this.cur, a = this.match.local, rig = G.rig;
    let yaw = rig ? rig.yaw : 0, pitch = rig ? rig.pitch : 0;
    const t = this._target(_c);
    if (t && a && rig) {
      const dx = t.x - a.pos.x, dz = t.z - a.pos.z, d = Math.hypot(dx, dz);
      if (d > 1.5) yaw = Math.atan2(dx, dz);
      // the lens looks a little up at the cluster / the boss's eyes from behind her: the objects sit in the upper middle
      pitch = Math.max(-0.2, Math.min(0.3, Math.atan2(t.y - (a.pos.y + 1.6), Math.max(3, d)) - 0.1));
    }
    this.frame = { yaw, pitch, still: true, t: 0, on: !this.reduced && !!rig, boom: rig ? rig.curDist : null, seen: true, blocked: 0 };
    C.placed = false;
  }
  _settled() { return true; }   // (she never stands still in an arena: the objects come up when the ease ends)

  // ---------------------------------------------------------------------------------------------- placement
  _place() { if (this.mode === 'boss') this._placeBoss(); else this._placeZone(); }

  // the duel: PlayRun's screen layout, on a plane in front of the camera as it is now, at the zone's distance (within
  // LEARN.arena.near / far of the boom), lifted off the ground; then the cluster is pinned to its own anchor
  _placeZone() {
    const C = this.cur; if (!C) return;
    const W = innerWidth, H = innerHeight, a = this.match.local, cam = G.camera;
    cam.updateMatrixWorld();
    const S = this._screen(W, H);
    C.layout = layoutTargets(C.labels.length, C.labels, W / H, S.safe, { avoid: S.avoid }); C.screen = S;
    const tanV = Math.tan(((cam.fov || 52) * Math.PI) / 360), aspect = cam.aspect || W / H;
    const boom = Math.max(1, G.rig?.curDist || cam.position.distanceTo(_w.set(a.pos.x, a.pos.y + 1.85, a.pos.z)));
    _r.setFromMatrixColumn(cam.matrixWorld, 0); _u.setFromMatrixColumn(cam.matrixWorld, 1); _f.setFromMatrixColumn(cam.matrixWorld, 2).negate();
    _o.copy(cam.position);
    // the depth: the zone's lifted centre, when it is within reach; else as far as her shot allows, towards it
    const t = this._target(_c);
    let D = t ? Math.max(boom + A.near, Math.min(boom + A.far, _c.sub(_o).dot(_f))) : boom + A.near + 2;
    let lift = 0;
    const objs = this.objs, safe = { ...S.safe };
    let L = C.layout;
    for (let pass = 0; pass < 8; pass++) {
      const wpp = (2 * D * tanV) / H;
      const px = (x, y, out) => out.copy(_o).addScaledVector(_f, D).addScaledVector(_r, ((x / W) * 2 - 1) * D * tanV * aspect).addScaledVector(_u, (1 - (y / H) * 2) * D * tanV).addScaledVector(UP, lift);
      objs.length = 0;
      for (const it of L.items) {
        const o = { i: it.i, kind: it.kind, key: labelKey(C.labels[it.i], L.kind === 'banner'), x: 0, y: 0, z: 0, r: 0, w: 0, h: 0, plate: { x: 0, y: 0, z: 0, w: 0, h: 0 } };
        if (it.kind === 'ball') {
          px(it.x, it.y, _c); o.x = _c.x; o.y = _c.y; o.z = _c.z; o.r = it.r * wpp;
          px(it.label.x + it.label.w / 2, it.label.y + it.label.h / 2, _c); o.plate.x = _c.x; o.plate.y = _c.y; o.plate.z = _c.z;
          o.plate.w = it.label.w * wpp; o.plate.h = it.label.h * wpp;
        } else {
          px(it.x + it.w / 2, it.y + it.h / 2, _c); o.x = _c.x; o.y = _c.y; o.z = _c.z; o.w = it.w * wpp; o.h = it.h * wpp;
          o.plate.x = o.x; o.plate.y = o.y; o.plate.z = o.z; o.plate.w = o.w * 0.97; o.plate.h = o.h * 0.94;
        }
        objs.push(o);
      }
      // every object clears the ground under it (closer first, then a shorter band, then a lift within the safe area)
      let need = 0;
      const L0 = G.level;
      for (const o of objs) {
        const bottom = o.kind === 'ball' ? o.plate.y - o.plate.h / 2 : o.y - o.h / 2;
        const gy = L0 ? L0.groundHeight(o.x, o.z, bottom + 4) : -Infinity;
        if (gy > -Infinity) need = Math.max(need, gy + M.clear - bottom);
      }
      const dMin = boom + 1.6;
      if (need > 0.01 && D > dMin + 0.05) { D = Math.max(dMin, D * 0.85); continue; }
      if (need > 0.01 && safe.h > 151) { safe.h = Math.max(150, safe.h - (need / wpp + 8)); L = layoutTargets(C.labels.length, C.labels, W / H, safe, { avoid: S.avoid }); C.layout = L; continue; }
      const room = Math.max(0, Math.min(...L.items.map((it) => (it.kind === 'ball' ? it.y - it.r : it.y))) - S.safe.y) * wpp;
      if (need > 0.01 && lift < room - 0.01) { lift = Math.min(room, lift + need); continue; }
      C.sunk = need > 0.01 ? +need.toFixed(2) : 0;
      break;
    }
    C.D = D; C.lift = lift; C.placed = true;
    // the cluster's anchor (its centre) and every object's offsets in the camera's basis: from now on the cluster turns
    // round the anchor with the camera (cameraPositions, every frame) — the same pixels from wherever she looks at it
    const anchor = C.anchor || (C.anchor = new THREE.Vector3());
    anchor.set(0, 0, 0); for (const o of objs) anchor.add(_c.set(o.x, o.y, o.z)); anchor.multiplyScalar(1 / Math.max(1, objs.length));
    C.locals = clusterLocals(objs, anchor, { right: _r, up: _u, back: _b.copy(_f).negate() });
    this.T.show(this._atlasOf(C.g), objs, { right: _r, up: _u, back: _b });
    this.reg.set(this.T.spheres, C.serial);
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'place', mode: 'zone', D: +D.toFixed(2), lift: +lift.toFixed(2), sunk: C.sunk || 0, kind: L.kind, fits: L.fits, cover: L.cover || null, rows: L.rows || null, anchor: anchor.toArray().map((v) => +v.toFixed(2)), avoid: S.avoid.map((r) => [r.what, Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)]), boom: +(G.rig?.curDist || 0).toFixed(2), her: [a.pos.x, a.pos.y, a.pos.z].map((v) => +v.toFixed(2)), cam: [cam.position.x, cam.position.y, cam.position.z].map((v) => +v.toFixed(2)) });
  }

  // the boss: a ball on each weak-point socket (its plate hanging under it), or long labels as planks stacked over the
  // shell; their size follows the distance so a label reads at 30 px of ball from wherever the squad stands
  _bossObj(k, o) {
    const C = this.cur, b = this.bossOf && this.bossOf(); if (!C || !b || !b.model) return null;
    const cam = G.camera, H = innerHeight;
    if (C.banner) {
      b.model.getSocket('shellTop', _c);
      const dist = cam.position.distanceTo(_c), h = Math.max(0.5, Math.min(1.4, 0.62 * (dist / 9)));
      const box = C.boxes[k], w = h * (box.w / box.h);
      _c.y += A.bossLift.shellTop + (C.labels.length - 1 - k) * h * A.bossRow;
      o.kind = 'banner'; o.x = _c.x; o.y = _c.y; o.z = _c.z; o.w = w; o.h = h; o.r = 0;
      o.plate.x = o.x; o.plate.y = o.y; o.plate.z = o.z; o.plate.w = w * 0.97; o.plate.h = h * 0.94;
      return o;
    }
    const sock = C.socks[k];
    b.model.getSocket(sock, _c);
    const dist = cam.position.distanceTo(_c), r = bossBallRadius(dist, H, cam.fov || 52);
    _c.y += (A.bossLift[sock] || 0.3) + r * 0.6;
    const box = C.boxes[k], ph = Math.max(0.3, r * 0.8), pw = ph * (box.w / box.h);
    o.kind = 'ball'; o.x = _c.x; o.y = _c.y; o.z = _c.z; o.r = r; o.w = 0; o.h = 0;
    o.plate.x = _c.x; o.plate.y = _c.y - r - ph * 0.5 - 0.05; o.plate.z = _c.z; o.plate.w = pw; o.plate.h = ph;
    return o;
  }
  _placeBoss() {
    const C = this.cur, b = this.bossOf && this.bossOf(); if (!C || !b || !b.model) return;
    const n = C.labels.length, Atl = this._atlasOf(C.g);
    C.socks = C.banner ? null : weakSockets(n);
    C.boxes = C.labels.map((l) => (Atl && Atl.box.get(labelKey(l, C.banner))) || { w: 120, h: 44 });
    const objs = this.objs; objs.length = 0;
    for (let k = 0; k < n; k++) {
      const o = { i: k, kind: 'ball', key: labelKey(C.labels[k], C.banner), x: 0, y: 0, z: 0, r: 0, w: 0, h: 0, plate: { x: 0, y: 0, z: 0, w: 0, h: 0 } };
      this._bossObj(k, o); objs.push(o);
    }
    b.model.getSocket('shellTop', _c);
    if (!orbitBasis(G.camera.position, _c, _basis)) { _basis.right.set(1, 0, 0); _basis.up.set(0, 1, 0); _basis.back.set(0, 0, 1); }
    C.placed = true; C.D = G.camera.position.distanceTo(_c);
    this.T.show(Atl, objs, _basis);
    this.reg.set(this.T.spheres, C.serial);
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'place', mode: 'boss', n, banner: C.banner, socks: C.socks, D: +C.D.toFixed(2), r: +objs[0].r.toFixed(2) });
  }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    super.update(dt);
    const C = this.cur; if (!C || !C.placed || this.match.paused) return;
    if (this.mode === 'boss') this._ride(); else this._orbit();
  }
  // the duel's cluster: its objects back in the world round the anchor, in the camera's basis as it is now
  _orbit() {
    const C = this.cur, cam = G.camera; if (!C.locals || !this.T.n) return;
    _r.setFromMatrixColumn(cam.matrixWorld, 0); _u.setFromMatrixColumn(cam.matrixWorld, 1); _f.setFromMatrixColumn(cam.matrixWorld, 2);
    _basis.right.copy(_r); _basis.up.copy(_u); _basis.back.copy(_f);
    cameraPositions(C.locals, C.anchor, _basis, _pts);
    this.T.setBasis(_basis.right, _basis.up, _basis.back);
    for (let k = 0; k < C.labels.length; k++) this.T.moveTo(k, _pts[k], _pts[k].plate);
    this.T.commit();
  }
  // the boss's balls ride their sockets (it turns, walks, flinches); the plates hang straight down, facing the camera
  _ride() {
    const C = this.cur, b = this.bossOf && this.bossOf(); if (!b || !b.model || !this.T.n) return;
    b.model.getSocket('shellTop', _c);
    if (orbitBasis(G.camera.position, _c, _basis)) this.T.setBasis(_basis.right, _basis.up, _basis.back);
    for (let k = 0; k < C.labels.length; k++) { const o = _pts[k]; o.kind = this.T.slots[k].kind; if (this._bossObj(k, o)) this.T.moveTo(k, o, o.plate); }
    this.T.commit();
  }

  // ---------------------------------------------------------------------------------------------- the answer
  // the deliberate hit → the form's one judging path (its _judgeRecord: judge → recordFirst → the zone's flood / the
  // boss's hit or move); the objects play the verdict as in the puzzle; the form's _askNext brings the next question
  _answer(k) {
    const C = this.cur, F = this.flow, { g, item, p } = C;
    C.answered = true; this.shot = null;
    this.reg.serial = ++this.serial;
    const sock = C.socks ? C.socks[k] : null;
    const { r, first, again } = F._judgeRecord(g, item, p, answerOfTarget(p, k), { socket: sock, hit: this.T.centre(k, _e) });
    const v = verdictLines(r, item);
    C.verdict = { k, ok: r.ok, first, again, head: v.head, why: v.why };
    this.log.push({ t: +F.t.toFixed(2), ev: 'answer', item: item.id, k, ok: r.ok, first, socket: sock });
    this.T.centre(k, _c);
    if (r.ok) {
      if (this.reduced) G.fx?.ring?.(_c, UP, this.ink, { radius: 1.3, life: 0.45 });
      else G.fx?.explosion?.(_c, this.ink, 1.7);
      this.T.burst(k); this.T.out(0.12);
      this.strip?.verdict(v);
      this.next = { t: (this.reduced ? 400 : M.nextMs) / 1000, stage: 1 };
    } else {
      this.T.state(k, 'coral');
      const right = p._perm ? p._perm.indexOf(item.answer) : item.answer;
      if (right >= 0 && right !== k) this.T.state(right, 'right');
      this.strip?.verdict(v);
      this.next = { t: (this.reduced ? Math.min(LEARN.ui.verdictMs, 900) : LEARN.ui.verdictMs) / 1000, stage: 0 };
    }
  }
  // (a stray round — hers at an enemy, a bot's — splats a little neutral ink on the object it meets: never a colour
  // that could read as a verdict, never an answer)
  _onHit(k, point, deliberate, p) {
    _c.copy(point);
    G.fx?.burst?.(_c, _f.copy(p.vel).normalize().negate(), deliberate ? (p.owner?.color || this.ink) : NEUTRAL, { count: 5, speed: 3, size: 0.07, paint: false });
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'hit', k, deliberate });
    if (!deliberate || !this.cur || this.cur.answered) return;
    this._answer(k);
  }
  _flood() { /* the form's _judgeRecord floods the zone (duelFlood) or hits the boss */ }

  // the safe area's avoid list: the forms' prop bag and phase pill too (they draw over the stage)
  _screen(W, H) {
    const S = super._screen(W, H);
    if (typeof document !== 'undefined') for (const sel of ['.iw-lf__bag', '.iw-lf__phase']) {
      const el = document.querySelector(sel); if (!el || !el.childElementCount) continue;
      const b = el.getBoundingClientRect(); if (b.width > 0 && b.height > 0) S.avoid.push({ x: b.left - 6, y: b.top - 6, w: b.width + 12, h: b.height + 12, what: sel.slice(7) });
    }
    return S;
  }

  debug() {
    const d = super.debug(), C = this.cur;
    d.mode = this.mode; d.anchor = C && C.anchor ? C.anchor.toArray().map((v) => +v.toFixed(2)) : null; d.socks = C && C.socks || null;
    return d;
  }
  dispose() { if (this._qAtlas) { this.T.freeAtlas(this._qAtlas); this._qAtlas = null; } super.dispose(); }
}
const NEUTRAL = new THREE.Color('#a39db8');
