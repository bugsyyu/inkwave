// 题即玩法 play-1 — M1 墨靶 in the puzzle (docs/PLAY.md §2, §3 M1, §5.1, §6): a choice item at a gate is ink balls (or
// banner planks) floating past the gate; she shoots one and the round landing on it is her answer. The world never
// stops: no match.paused, no learn.hold, no card. LearnFlow (flow.js) owns one of these when LEARN.play is on and the
// level is a puzzle (never for a form that extends it: race / duel / boss / coop2 keep their cards for now).
//
//   the flow calls:   canAsk(g, item, p) · ask(g, item, p) · toCard() (a card item under the flag holds the match for it,
//                     as the flag-off arrival does) · update(dt) (every frame, paused or not) · gateOpened(g) · dispose()
//   it calls back:    flow._judgeRecord(g, item, p, k) — the card's own judge → recordFirst → lock / retry (the one path,
//                     PLAY §1 rule 2) — then flow._askNext(g) when the verdict has been shown
//   a question:       the strip (src/ui/play-strip.js) shows engine.prompt's line + ▶; the objects are laid out on the screen
//                     (layout.js: the safe area under the strip, clear of her, the touch buttons and the minimap), turned
//                     into the world on a plane in front of the camera's framing pose (yaw towards the route past the gate,
//                     pitched up until the lowest object clears the ground) and the camera eases there on the rig's own
//                     yaw / pitch (dampAngle, as its super-jump framing does; her look input ends it; reduced motion holds)
//   answering:        a tap on an object (touch.js asks G.playTap first) or, on a desktop, fire pressed with the crosshair on
//                     one: she turns (aimFace springs: aimYaw / aimPitch + fireFacing for ≤ LEARN.m1.turnFor s), one round of
//                     ink leaves her muzzle at it (Projectiles.fireShooter, no spread, no ink spent — an empty tank never
//                     blocks an answer) tagged for that object and this question; the answer is taken when that round
//                     hits it (weapons.js → G.playTargets, hit.js) — never a stray, splash or a round from before
//   right:            EFFECTS.puzzle.right — splat_big, fx.explosion in her ink (reduced motion: a ring), paint.flood under
//                     the objects (2.5 m, +0.5 m per right answer at this gate, ≤ 4.5), a hop (trigger 'jump'), the strip
//                     flashes her ink with 答对了; the next item comes up after LEARN.m1.nextMs
//   wrong:            EFFECTS.puzzle.wrong (ui_back; the second miss wrong2 ui_toggle): the object turns coral, the right one
//                     is ringed in her ink, the gate's lock marker (coral under the flag) pops, the strip says 差一点：是 ___
//                     and the first sentence of 为什么 for LEARN.ui.verdictMs; the retry (the same choice reshuffled) is the
//                     flow's, as for the card
//   debug():          what the audits read (tools/learn/play-audit.mjs)
import * as THREE from 'three';
import { G, damp, dampAngle, angleDiff } from '../../core/ctx.js';
import { LEARN, WEAPONS, PLAYER } from '../../config.js';
import { EFFECTS } from '../design.js';
import { prompt } from '../api.js';
import { PlayTargets } from './targets.js';
import { PlayStrip, VERDICT_H } from '../../ui/play-strip.js';
import { prefersReducedMotion } from '../../ui/ui-util.js';
import { layoutTargets, isBanner } from './layout.js';
import { pickTarget } from './pick.js';
import { ShotTargets, raySpheres } from './hit.js';
import { gateLabels, labelKey } from './atlas.js';
import { canPlayM1, targetLabels, answerOfTarget, verdictLines } from './m1.js';

const M = LEARN.m1, U = LEARN.playUi;
const UP = new THREE.Vector3(0, 1, 0);
const _c = new THREE.Vector3(), _f = new THREE.Vector3(), _r = new THREE.Vector3(), _u = new THREE.Vector3(), _o = new THREE.Vector3(), _w = new THREE.Vector3(), _e = new THREE.Vector3(), _m = new THREE.Vector3();

export class PlayRun {
  constructor(flow) {
    this.flow = flow; this.match = flow.match; this.hud = flow.hud;
    this.reduced = prefersReducedMotion() || G.settings?.cameraShake === 0;
    this.T = new PlayTargets({ scene: G.scene, renderer: G.renderer, camera: G.camera, reduced: this.reduced });
    this.ink = (G.teamColors[0] || new THREE.Color('#ff8a14')).clone();
    this.T.setInk(this.ink);
    this.strip = G.hud && G.hud.root ? new PlayStrip(G.hud) : null;
    this.strip?.setInk(G.teamHex?.[0]);
    this.reg = new ShotTargets();
    this.reg.onHit = (k, point, deliberate, p) => this._onHit(k, point, deliberate, p);
    this.serial = 1; this.cur = null; this.shot = null; this.frame = null; this.tap = null; this.next = null;
    this.log = []; this.objs = []; this._fireWas = false;
    this.tapApi = { down: (x, y, id) => this._tapDown(x, y, id), up: (x, y, id, cancel) => this._tapUp(x, y, id, cancel) };
    this._onResize = () => { this._resized = true; };
    if (typeof window !== 'undefined') { window.addEventListener('resize', this._onResize); window.addEventListener('orientationchange', this._onResize); }
    // the label atlases of the first three gates (the first one is "2 gates ahead" of the walk), once the HUD's fonts are in
    const fonts = typeof document !== 'undefined' && document.fonts ? Promise.all([document.fonts.load(`800 ${U.font}px Rubik`), document.fonts.load(`600 ${U.font - 2}px Rubik`)]).catch(() => null) : Promise.resolve();
    fonts.then(() => { if (!this.disposed) this._prep(this.flow.cur, this.flow.cur + 2); });
  }

  canAsk(g, item, p) { return canPlayM1(item, p); }

  // ---------------------------------------------------------------------------------------------- 2 gates ahead
  _prep(from, to) {
    const gates = this.flow.gates || [];
    for (let k = Math.max(0, from); k <= Math.min(gates.length - 1, to); k++) {
      const g = gates[k];
      if (g._play) continue;
      const labels = gateLabels(g.items, prompt, canPlayM1);
      g._play = { atlas: labels.length ? this.T.atlas(g.id, labels) : null, labels, region: null, anchor: null, rights: 0 };
      if (labels.length) this._anchor(g);
    }
  }
  _atlasOf(g) {
    if (!g._play) this._prep(g.index, g.index);
    if (g._play && !g._play.atlas && g._play.labels.length) g._play.atlas = this.T.atlas(g.id, g._play.labels);
    return g._play && g._play.atlas;
  }
  // where the objects float: the route a few metres past the gate; and her ink's region round its ground (paint.flood)
  _anchor(g) {
    const F = this.flow, nav = G.nav, path = F.path || [];
    let i = g.pathIndex, acc = 0;
    while (i < path.length - 1 && acc < 6) { const a = nav.nodes[path[i]], b = nav.nodes[path[i + 1]]; acc += Math.hypot(b.x - a.x, b.z - a.z); i++; }
    const n = nav.nodes[path[Math.min(i, path.length - 1)]] || g.pos;
    g._play.anchor = new THREE.Vector3(n.x, n.y, n.z);
    g._play.region = floodRegion(g._play.anchor, M.flood[2] + 0.3);
  }

  // ---------------------------------------------------------------------------------------------- a question
  ask(g, item, p) {
    const m = this.match, F = this.flow;
    if (m.paused && m.state === 'playing') { m.paused = false; G.input?.requestLock?.(); }   // (after a card, under the flag)
    F.hud?.hide?.();
    F.hud?.playMode?.(true);
    const labels = targetLabels(p);
    this.cur = { g, item, p, labels, banner: isBanner(labels), serial: ++this.serial, answered: false, t: 0, verdict: null };
    this.shot = null; this.next = null; this.tap = null;
    this.strip?.show(p, { replay: () => this._say(p.tts) });
    this.strip?.fit(this._topKeys());
    this._frame();
    if (!this.frame.on) this._place();   // (reduced motion: the camera holds — the objects come up where it looks now)
    G.playTargets = this.reg; G.playTap = this.tapApi;
    if (p.tts) this._say(p.tts);
    if (F.asking) F.asking.play = 'ink-target';
    this.log.push({ t: +F.t.toFixed(2), ev: 'ask', item: item.id, n: labels.length, banner: this.cur.banner });
  }

  // a card item under the flag (not yet a play kind): the match holds for the card as it always did
  toCard() {
    this._clear();
    const m = this.match;
    this.flow.hud?.playMode?.(false);
    if (!m.paused) { m.paused = true; G.input?.exitLock?.(); }
  }

  _clear() {
    this.cur = null; this.shot = null; this.next = null; this.tap = null; this.frame = null;
    this.T.hide(); this.strip?.hide(); this.reg.clear();
    if (G.playTargets === this.reg) G.playTargets = null;
    if (G.playTap === this.tapApi) G.playTap = null;
  }

  gateOpened(g) {
    this._clear();
    this.flow.hud?.playMode?.(false);
    if (g._play && g._play.atlas) { this.T.freeAtlas(g.id); g._play.atlas = null; }
    this._prep(this.flow.cur, this.flow.cur + 2);   // the gate now 2 ahead
  }

  // ---------------------------------------------------------------------------------------------- the screen → the world
  // the safe area (under the strip, LEARN.playUi.side from the sides, above the bottom edge) and what no object may cover:
  // her on the screen, the live touch buttons, the minimap
  _screen(W, H) {
    const side = U.side, s = this.strip?.rect();
    // (under the strip as its verdict will be: the objects are never covered when 差一点 and 为什么 come up)
    const top = Math.max(s ? Math.max(s.bottom, s.y + VERDICT_H) + 10 : 64, 48);
    const avoid = [];
    const T = G.touch;
    if (T && T.enabled && T.buttons) for (const b of T.buttons) {
      if (!(b.r > 0) || !b.el || !b.el.getClientRects().length) continue;
      avoid.push({ x: b.cx - b.r - 6, y: b.cy - b.r - 6, w: b.r * 2 + 12, h: b.r * 2 + 12, what: 'touch:' + b.name });
    }
    const map = typeof document !== 'undefined' && document.querySelector('.iw-map__frame');
    if (map && map.getClientRects().length) { const b = map.getBoundingClientRect(); if (b.width > 0 && b.top < H) avoid.push({ x: b.left - 6, y: b.top - 6, w: b.width + 12, h: b.height + 12, what: 'minimap' }); }
    const her = this._herRect(W, H);
    if (her) avoid.push(her);
    return { safe: { x: side, y: top, w: W - side * 2, h: Math.max(60, H - 12 - top) }, avoid, stripBottom: s ? s.bottom : top };
  }
  // the touch layer's live top-row keys (pause / map) — the strip keeps its lines clear of them
  _topKeys() {
    const T = G.touch, out = [];
    if (T && T.enabled && T.buttons) for (const b of T.buttons) if (b.top && b.r > 0 && b.el && b.el.getClientRects().length) out.push({ x: b.cx - b.r, y: b.cy - b.r, w: b.r * 2, h: b.r * 2 });
    return out;
  }
  // her silhouette on the screen (the follow camera keeps her there whatever it looks at): feet to the top of her head
  // (PLAYER.height, her hair a hand above it; PLAYER.radius and a little to each side)
  _herRect(W, H) {
    const a = this.match.local, cam = G.camera; if (!a || !cam) return null;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    const h = (a.form === 'squid' ? PLAYER.squidHeight : PLAYER.height) + 0.12, w = PLAYER.radius + 0.06;
    for (const [dy, dx] of [[0, -w], [0, w], [h * 0.55, -w], [h * 0.55, w], [h, -w * 0.85], [h, w * 0.85]]) {
      _o.set(a.pos.x, a.pos.y + dy, a.pos.z).addScaledVector(_r.set(Math.cos(G.rig?.yaw || 0), 0, -Math.sin(G.rig?.yaw || 0)), dx).project(cam);
      if (_o.z > 1) continue;
      const x = (_o.x + 1) / 2 * W, y = (1 - _o.y) / 2 * H;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    if (!(x1 > x0)) return null;
    return { x: x0 - 10, y: y0 - 10, w: x1 - x0 + 20, h: Math.min(H, y1) - y0 + 20, what: 'her' };
  }

  // the framing pose the camera eases to (the rig's own yaw / pitch, dampAngle like its super-jump framing): towards the
  // route past the gate, level-ish; the objects come up once it has settled (or she looks herself), placed from the
  // camera as it then is — so the rig's boom probe, lens lift or shoulder offset never put them anywhere but where the
  // layout drew them. Each candidate pose is tried with the rig's own boom probe from where she stands, and scored on:
  // a full boom (a short one — the stair she just came down behind her — puts the lens in her hair), her in sight, a
  // clear view of where the objects go (nothing solid — the fountain by the first gate — and no ground between the lens
  // and the object plane), the lens not standing in the gate, and as little turn and tilt as possible.
  _frame() {
    const C = this.cur, a = this.match.local, rig = G.rig, P = G.physics;
    const anchor = C.g._play?.anchor || C.g.pos;
    let yaw0 = rig ? rig.yaw : 0;
    if (rig && Math.hypot(anchor.x - a.pos.x, anchor.z - a.pos.z) > 1.5) yaw0 = Math.atan2(anchor.x - a.pos.x, anchor.z - a.pos.z);
    let best = { yaw: yaw0, pitch: rig ? Math.max(-0.06, Math.min(0.1, rig.pitch)) : 0, score: -Infinity };
    if (rig && P && P.cameraProbe) {
      const probe = this._probe || (this._probe = { hard: 0, soft: 0, floor: false }), want = rig.dist || 4.5;
      const cam = G.camera, tanV = Math.tan(((cam.fov || 52) * Math.PI) / 360), aspect = cam.aspect || innerWidth / innerHeight;
      const gp = C.g.pos;
      _w.set(a.pos.x, a.pos.y + 1.85, a.pos.z);
      for (const dy of [0, 0.22, -0.22, 0.45, -0.45, 0.8, -0.8]) for (const p of [0.04, -0.06, -0.16, -0.26]) {
        const y = yaw0 + dy;
        _f.set(-Math.sin(y) * Math.cos(p), -Math.sin(p), -Math.cos(y) * Math.cos(p));   // pivot → lens
        P.cameraProbe(_w, _f, want, 0.62, probe);
        const boom = Math.min(probe.soft, probe.hard);
        _c.copy(_w).addScaledVector(_f, boom); _c.y += 0.15;
        // she must be in sight from there (a prop between the lens and her hides her)
        _e.set(a.pos.x, a.pos.y + 1.2, a.pos.z);
        const seen = P.los(_c, _e) && P.los(_c, _o.set(a.pos.x, a.pos.y + 1.9, a.pos.z));
        // the object plane: six points of the band the layout fills (upper middle of the screen), near and far
        _r.set(-Math.cos(y), 0, Math.sin(y)); _u.crossVectors(_r, _f).negate();   // lens right, lens up
        let blocked = 0;
        for (const D of [boom + 2.6, boom + 6.5]) for (const nx of [-0.65, 0, 0.65]) for (const ny of [0.25, -0.35]) {
          _e.copy(_c).addScaledVector(_f, -D).addScaledVector(_r, nx * D * tanV * aspect).addScaledVector(_u, ny * D * tanV);
          if (!P.los(_c, _e)) blocked += D < boom + 3 ? 1.5 : 0.6;
        }
        // and not standing in the gate she just reached (she stops ~1 m past it: a lens right behind her sits in its lock)
        const inGate = Math.max(0, 2.2 - Math.hypot(_c.x - gp.x, _c.z - gp.z));
        const score = Math.min(boom, want * 0.8) * 2 - Math.abs(dy) * 1.2 - Math.abs(p - 0.02) * 1.5 - (seen ? 0 : 6) - blocked - inGate * 1.4;
        if (score > best.score) best = { yaw: y, pitch: p, score, boom, seen, blocked };
      }
    }
    // (she may still be slowing down at the gate: the poses are tried again once she stands — update())
    const still = Math.hypot(a.vel?.x || 0, a.vel?.z || 0) < 0.35;
    this.frame = { yaw: best.yaw, pitch: best.pitch, boom: best.boom, seen: best.seen, blocked: best.blocked, still, t: 0, on: !this.reduced && !!rig };
    C.placed = false;
  }

  // the follow camera has come to rest: she stands, and the rig's boom is where its probe wants it for this pose
  // (it shortens fast and lengthens slowly — objects placed while it moves would drift off their layout)
  _settled() {
    const a = this.match.local, rig = G.rig, P = G.physics;
    if (!rig || !P || !P.cameraProbe) return true;
    if (Math.hypot(a.vel?.x || 0, a.vel?.z || 0) > 0.35) return false;
    const probe = this._probe || (this._probe = { hard: 0, soft: 0, floor: false });
    rig.forward(_f).negate();
    P.cameraProbe(rig.pivot, _f, rig.wantDist ?? rig.dist, 0.62, probe);
    return Math.abs(rig.curDist - Math.min(probe.soft, probe.hard)) < 0.12;
  }

  // lay the objects out on the screen, then put them in the world on a plane in front of the camera as it is now
  _place() {
    const C = this.cur; if (!C) return;
    const W = innerWidth, H = innerHeight, a = this.match.local, cam = G.camera;
    cam.updateMatrixWorld();
    const S = this._screen(W, H);
    C.layout = layoutTargets(C.labels.length, C.labels, W / H, S.safe, { avoid: S.avoid }); C.screen = S;
    const tanV = Math.tan(((cam.fov || 52) * Math.PI) / 360), aspect = cam.aspect || W / H;
    const boom = Math.max(1, G.rig?.curDist || cam.position.distanceTo(_w.set(a.pos.x, a.pos.y + 1.85, a.pos.z)));
    _r.setFromMatrixColumn(cam.matrixWorld, 0); _u.setFromMatrixColumn(cam.matrixWorld, 1); _f.setFromMatrixColumn(cam.matrixWorld, 2).negate();
    _o.copy(cam.position);
    // the depth the objects' pixel size asks for (a ball LEARN.m1.ball m, a plank ~0.62 m tall), within her shot
    const first = C.layout.items[0] || { r: 40, h: 60 };
    let D = C.layout.kind === 'ball' ? (M.ball * (H / 2)) / (first.r * tanV) : (0.62 * (H / 2)) / (first.h * tanV);
    D = Math.min(boom + M.far, Math.max(boom + M.near, D));
    let lift = 0;
    const objs = this.objs, safe = { ...S.safe };
    let L = C.layout;
    for (let pass = 0; pass < 8; pass++) {
      const wpp = (2 * D * tanV) / H;   // metres per CSS px at depth D
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
      // every object clears the ground under it, and nothing solid stands between her or the lens and it: closer
      // first (down to 1.6 m in front of her), then a shorter region (the objects smaller and higher on the screen), only
      // then a lift off the layout — never past the top of the safe area (an object low enough to touch the ground
      // then sits on it)
      let need = 0, blocked = false;
      const L0 = G.level, P = G.physics;
      _e.set(a.pos.x, a.pos.y + 1.4, a.pos.z);
      // (her muzzle, about: hip height, a little to her right as she turns to it — where the tap-shot's round leaves)
      _m.set(a.pos.x, a.pos.y + 1.05, a.pos.z).addScaledVector(_r, 0.3);
      for (const o of objs) {
        const bottom = o.kind === 'ball' ? o.plate.y - o.plate.h / 2 : o.y - o.h / 2;
        const gy = L0 ? L0.groundHeight(o.x, o.z, bottom + 4) : -Infinity;
        if (gy > -Infinity) need = Math.max(need, gy + M.clear - bottom);
        if (P && (!P.los(_e, _c.set(o.x, o.y, o.z)) || !P.los(_o, _c) || !P.los(_m, _c))) blocked = true;
        if (P && o.kind === 'ball' && !P.los(_o, _c.set(o.plate.x, o.plate.y, o.plate.z))) blocked = true;   // (its label too)
      }
      const dMin = boom + 1.6;
      if ((blocked || need > 0.01) && D > dMin + 0.05) { D = Math.max(dMin, D * 0.85); continue; }
      if (need > 0.01 && safe.h > 151) {
        safe.h = Math.max(150, safe.h - (need / wpp + 8));
        L = layoutTargets(C.labels.length, C.labels, W / H, safe, { avoid: S.avoid });
        C.layout = L;
        continue;
      }
      const room = Math.max(0, Math.min(...L.items.map((it) => (it.kind === 'ball' ? it.y - it.r : it.y))) - S.safe.y) * wpp;
      if (need > 0.01 && lift < room - 0.01) { lift = Math.min(room, lift + need); continue; }
      C.sunk = need > 0.01 ? +need.toFixed(2) : 0; C.blocked = blocked;
      break;
    }
    C.D = D; C.lift = lift; C.placed = true;
    this.T.show(this._atlasOf(C.g), objs, { right: _r, up: _u, back: _w.copy(_f).negate() });
    this.reg.set(this.T.spheres, C.serial);   // (the live array: a burst or draining object drops out of it)
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'place', D: +D.toFixed(2), lift: +lift.toFixed(2), sunk: C.sunk || 0, blocked: !!C.blocked, kind: L.kind, fits: L.fits, cover: L.cover || null, rows: L.rows || null, d: L.d ? Math.round(L.d) : null, avoid: S.avoid.map((r) => [r.what, Math.round(r.x), Math.round(r.y), Math.round(r.w), Math.round(r.h)]), safeH: Math.round(safe.h), boom: +(G.rig?.curDist || 0).toFixed(2), her: [a.pos.x, a.pos.y, a.pos.z].map((v) => +v.toFixed(2)), cam: [cam.position.x, cam.position.y, cam.position.z].map((v) => +v.toFixed(2)) });
  }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    const m = this.match;
    if (m.paused) return;   // her own pause / a card: the play waits
    this.T.update(dt);
    const C = this.cur; if (!C) return;
    C.t += dt;
    if (this._resized && !C.answered) { this._resized = false; this.strip?.fit(this._topKeys()); if (C.placed) this._place(); }
    const a = m.local, rig = G.rig;
    // the camera eases to the framing pose (her own look ends it at once); the objects come up when it has settled
    let Fr = this.frame;
    // she has come to a stop at the gate: the framing tried from where she was walking is tried again from where she stands
    if (Fr && !Fr.still && !C.placed && Math.hypot(a.vel?.x || 0, a.vel?.z || 0) < 0.35) {
      const looked = Fr.looked, t = Fr.t; this._frame(); Fr = this.frame;
      if (looked) { Fr.on = false; Fr.looked = true; } else Fr.t = Math.min(t, 0.3);   // (her own look still wins)
    }
    if (Fr && Fr.on && rig) {
      Fr.t += dt;
      const look = G.input && (G.input.mouse.dx || G.input.mouse.dy);
      const near = Math.abs(angleDiff(rig.yaw, Fr.yaw)) < 0.03 && Math.abs(rig.pitch - Fr.pitch) < 0.03;
      if (look) { Fr.on = false; Fr.looked = true; } else if (Fr.t > M.frameFor || (near && Fr.t > 0.25)) Fr.on = false;
      else { rig.yaw = dampAngle(rig.yaw, Fr.yaw, M.frameRate, dt); rig.pitch = damp(rig.pitch, Fr.pitch, M.frameRate, dt); }
    }
    if (!C.placed && !(Fr && Fr.on) && (this._settled() || (Fr && Fr.t > M.frameFor + 0.6))) this._place();
    if (!C.placed) return;
    // desktop: fire pressed with the crosshair on an object is the same shot as a tap
    const fire = !!(a && a.intent.fire);
    if (fire && !this._fireWas && !C.answered && !G.input?.touch?.active) { const k = this._crosshair(); if (k >= 0) this.shoot(k, 'crosshair'); }
    this._fireWas = fire;
    // a tap-shot: she turns to it on the aimFace springs, then the round leaves the muzzle
    const S = this.shot;
    if (S && a && a.alive && !C.answered) {
      this.T.centre(S.k, _c);
      const mx = a.pos.x, my = a.pos.y + 1.05, mz = a.pos.z;
      const yaw = Math.atan2(_c.x - mx, _c.z - mz), pitch = Math.atan2(_c.y - my, Math.hypot(_c.x - mx, _c.z - mz));
      a.aimYaw = yaw; a.aimPitch = pitch; a.fireFacing = Math.max(a.fireFacing || 0, 0.5);
      S.t += dt;
      if (S.fired === false && (Math.abs(angleDiff(a.yaw, yaw)) < M.turnTol || S.t >= M.turnFor)) { this._fire(S.k); S.fired = true; }
      if (S.fired && S.t > 1.4) this.shot = null;   // (a round that never arrived — a wall moved in: she can tap again)
    }
    // the verdict holds, then the objects drain away, then the flow's next item
    const N = this.next;
    if (N) {
      N.t -= dt;
      if (N.t <= 0 && N.stage === 0) { N.stage = 1; N.t = this.reduced ? 0.05 : 0.32; this.T.out(); }
      else if (N.t <= 0 && N.stage === 1) { this.next = null; const g = C.g; this.cur = null; this.flow._askNext(g); }
    }
  }

  // the object under the crosshair (the gameplay camera's centre ray, as player.js computeAim casts it)
  _crosshair() {
    const cam = G.rig?.gameCam || G.camera, a = this.match.local; if (!cam || !a) return -1;
    cam.getWorldDirection(_f);
    _c.set(a.pos.x, a.pos.y + 1.3, a.pos.z);
    const along = Math.max(0, _c.sub(cam.position).dot(_f));
    _o.copy(cam.position).addScaledVector(_f, along);
    const h = raySpheres(_o, _f, 60, this.reg.spheres);
    return h ? this.reg.spheres[h.index].target : -1;
  }

  shoot(k, how = 'tap') {
    const C = this.cur; if (!C || C.answered || !C.placed || k < 0) return false;
    this.shot = { k, t: 0, fired: false, how };
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'shoot', k, how });
    return true;
  }
  _fire(k) {
    const a = this.match.local, P = G.projectiles; if (!a || !P) return;
    this.T.centre(k, a.aimPoint);
    // her aim straight from the muzzle at it: Projectiles._aimFrom falls back to aimDir for a target under 2 m away (an
    // object placed close in front of her), and aimDir is otherwise the camera's crosshair ray, which a muzzle beside
    // the lens passes parallel to — wide of a small ball
    a.aimDir.copy(a.aimPoint).sub(_m.set(a.pos.x, a.pos.y + 1.05, a.pos.z)).normalize();
    if (P._muzzle) a.aimDir.copy(a.aimPoint).sub(P._muzzle(a, _m)).normalize();
    const w = a.weapon && a.weapon.kind === 'shooter' ? a.weapon : WEAPONS.shooter;
    const n0 = P.list.length;
    P.fireShooter(a, w, 0);
    const p = P.list.length > n0 ? P.list[n0] : null;
    if (p) this.reg.tag(p, k);
    a.character?.trigger?.('shoot'); a.lastFire = 0;
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'fire', k, tagged: !!p });
  }

  _onHit(k, point, deliberate, p) {
    _c.copy(point);
    // every round that meets an object splats on it; only the deliberate one answers
    G.fx?.burst?.(_c, _f.copy(p.vel).normalize().negate(), p.owner?.color || this.ink, { count: 5, speed: 3, size: 0.07, paint: false });
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'hit', k, deliberate });
    if (!deliberate || !this.cur || this.cur.answered) return;
    this._answer(k);
  }

  _answer(k) {
    const C = this.cur, F = this.flow, { g, item, p } = C;
    C.answered = true; this.shot = null;
    this.reg.serial = ++this.serial;   // nothing still in flight answers anything now
    const { r, first, again } = F._judgeRecord(g, item, p, answerOfTarget(p, k));
    const v = verdictLines(r, item);
    C.verdict = { k, ok: r.ok, first, again, head: v.head, why: v.why };
    this.log.push({ t: +F.t.toFixed(2), ev: 'answer', item: item.id, k, ok: r.ok, first });
    const a = this.match.local;
    this.T.centre(k, _c);
    if (r.ok) {
      const E = EFFECTS.puzzle.right;
      G.audio?.play?.(E.sfx, { pos: _c, volume: 0.85 });
      if (this.reduced) G.fx?.ring?.(_c, UP, this.ink, { radius: 1.3, life: 0.45 });
      else G.fx?.explosion?.(_c, this.ink, 1.7);
      this.T.burst(k); this.T.out(0.12);
      this._flood(g);
      if (E.trigger) a?.character?.trigger?.(E.trigger);
      this.strip?.verdict(v);
      this.next = { t: (this.reduced ? 400 : M.nextMs) / 1000, stage: 1 };
    } else {
      const E = again ? EFFECTS.puzzle.wrong : EFFECTS.puzzle.wrong2;
      G.audio?.play?.(E.sfx, { volume: 0.8 });
      this.T.state(k, 'coral');
      const right = p._perm ? p._perm.indexOf(item.answer) : item.answer;
      if (right >= 0 && right !== k) this.T.state(right, 'right');
      g._lockPopAt = G.time;
      this.strip?.verdict(v);
      this.next = { t: (this.reduced ? Math.min(LEARN.ui.verdictMs, 900) : LEARN.ui.verdictMs) / 1000, stage: 0 };
    }
  }

  // her ink poured under the objects: a region round the gate's anchor, wider with every right answer at the gate
  _flood(g) {
    const P = g._play; if (!P || !G.paint) return;
    P.rights++;
    const reach = Math.min(M.flood[2], M.flood[0] + M.flood[1] * (P.rights - 1)), c = P.anchor;
    if (P.region && P.region.cells.length && G.paint.flood) G.paint.flood(P.region, 0, { center: [c.x, c.z], y: c.y, reach, dur: this.reduced ? 0 : 0.5 });
    else G.paint.splat?.(_c.set(c.x, c.y + 0.05, c.z), reach * 0.8, 0, { kind: 'blast' });
  }

  // ---------------------------------------------------------------------------------------------- touch (touch.js asks first)
  _pick(x, y) { return pickTarget(x, y, this.T.project(G.camera, innerWidth, innerHeight)); }
  _tapDown(x, y, id) {
    const C = this.cur; if (!C || C.answered || !C.placed || this.match.paused || !this.T.active) return false;
    if ((G.rig?.mapK ?? 0) > 0.05) return false;
    const k = this._pick(x, y);
    if (k < 0) return false;
    this.tap = { id, x, y, t: performance.now(), k };
    return true;
  }
  _tapUp(x, y, id, cancel) {
    const T = this.tap; if (!T || T.id !== id) return;
    this.tap = null;
    if (cancel || performance.now() - T.t > U.tapMs || Math.hypot(x - T.x, y - T.y) > U.tapMove) return;
    this.shoot(T.k, 'tap');
  }

  _say(text) {
    if (!text) return;
    const H = this.hud; if (!H || !H._speak) return;
    this.strip?.playing(true);
    H._speak(text, () => this.strip?.playing(false));
  }

  // what the audits read
  debug() {
    const C = this.cur, W = innerWidth, H = innerHeight;
    const proj = C ? this.T.project(G.camera, W, H).filter((q) => !q.off).map((q) => (q.kind === 'ball' ? { i: q.i, kind: q.kind, cx: +q.cx.toFixed(1), cy: +q.cy.toFixed(1), r: +q.r.toFixed(1), label: { x: +q.label.x.toFixed(1), y: +q.label.y.toFixed(1), w: +q.label.w.toFixed(1), h: +q.label.h.toFixed(1) } } : { i: q.i, kind: q.kind, x: +q.x.toFixed(1), y: +q.y.toFixed(1), w: +q.w.toFixed(1), h: +q.h.toFixed(1) })) : [];
    return {
      asking: !!C, answered: !!(C && C.answered), item: C && C.item.id, n: C && C.labels.length, banner: C && C.banner, serial: this.serial,
      labels: C && C.labels, rightIndex: C && (C.p._perm ? C.p._perm.indexOf(C.item.answer) : C.item.answer),
      safe: C && C.screen && C.screen.safe, stripBottom: C && C.screen && C.screen.stripBottom, avoid: C && C.screen && C.screen.avoid, layout: C && C.layout && C.layout.items.map((it) => it.rect), fits: C && C.layout && C.layout.fits,
      projected: proj, placed: !!(C && C.placed), D: C && C.D, lift: C && C.lift, framing: this.frame && { on: this.frame.on, t: +this.frame.t.toFixed(2), yaw: +this.frame.yaw.toFixed(3), pitch: +this.frame.pitch.toFixed(3), boom: this.frame.boom != null ? +this.frame.boom.toFixed(2) : null, seen: this.frame.seen, blocked: this.frame.blocked, still: this.frame.still, camBoom: G.rig ? +G.rig.curDist.toFixed(2) : null },
      verdict: C && C.verdict, shot: this.shot && { k: this.shot.k, fired: this.shot.fired }, log: this.log.slice(-40),
      her: this.match.local ? [this.match.local.pos.x, this.match.local.pos.y, this.match.local.pos.z].map((v) => +v.toFixed(2)) : null, cam: G.camera ? [G.camera.position.x, G.camera.position.y, G.camera.position.z].map((v) => +v.toFixed(2)) : null,
      atlases: [...this.T.atlases.values()].map((A) => ({ key: A.key, w: A.w, h: A.h, scale: A.scale, n: A.n })), calls: G.renderer?.info?.render?.calls,
    };
  }

  dispose() {
    this.disposed = true;
    this._clear();
    if (typeof window !== 'undefined') { window.removeEventListener('resize', this._onResize); window.removeEventListener('orientationchange', this._onResize); }
    this.T.dispose(); this.strip?.dispose();
  }
}

// the turf cells within R of c (ground level ± a little) and the circle round them: a region paint.flood can pour
// (the same shape zones.js hands it — cells, an outline, a height band)
export function floodRegion(c, R) {
  const L = G.level, P = G.paint; if (!L || !P) return null;
  const faces = P.paintFaces || L.faces, cells = [];
  for (const f of faces) {
    if (!f.turf || !f.atlas || !(f.grid >= 0) || !f.nu) continue;
    if (Math.abs(f.origin.y - c.y) > 1.2) continue;
    const dx = c.x - f.origin.x, dy = c.y - f.origin.y, dz = c.z - f.origin.z;
    const lu = dx * f.u.x + dy * f.u.y + dz * f.u.z, lv = dx * f.v.x + dy * f.v.y + dz * f.v.z;
    if (lu < -R || lv < -R || lu > f.su + R || lv > f.sv + R) continue;
    const i0 = Math.max(0, Math.floor((lu - R) / f.cu)), i1 = Math.min(f.nu - 1, Math.floor((lu + R) / f.cu));
    const j0 = Math.max(0, Math.floor((lv - R) / f.cv)), j1 = Math.min(f.nv - 1, Math.floor((lv + R) / f.cv));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const s = (i + 0.5) * f.cu, t = (j + 0.5) * f.cv;
      const x = f.origin.x + f.u.x * s + f.v.x * t, z = f.origin.z + f.u.z * s + f.v.z * t;
      if (Math.hypot(x - c.x, z - c.z) <= R) cells.push(f.grid + j * f.nu + i);
    }
  }
  const poly = [];
  for (let k = 0; k < 24; k++) { const t = (k / 24) * Math.PI * 2; poly.push([c.x + Math.cos(t) * R, c.z + Math.sin(t) * R]); }
  return { cells: Int32Array.from(cells), polys: [poly], y0: c.y - 0.6, y1: c.y + 0.9 };
}
