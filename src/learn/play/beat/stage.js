// 节拍台 M3 beat-pads — the dance stage (docs/PLAY.md §3 M3, §1 rules 1–6, §7): 听辨对子 (2 pads) and 音标 (4 pads).
//
// A stage of spawn-pad style glowing pads round a home pad she stands on; each pad carries its word (English and
// Chinese) on a label plate. The stage kicks on every beat of music.js; the word plays on a bar line and she hops onto a
// pad on the next downbeat (the approach rings close onto the pads' rims on it). Taps (the side of the screen a pad is
// on), swipes, arrows, A–D / 1–4. She really hops across; the answer is taken when she lands (logic and picture
// together), its on-beat-ness from when she jumped. The stage never knows which pad is right until resolve().
//
//   const beat = new BeatStage({ scene, camera, team, color, reduced })
//   await beat.warm(renderer, camera)                     compileAsync of the pads and the plates, on the spot
//   beat.prepare(key, labelSets)                          a gate's label atlas, drawn ahead (labelSets: per item, the
//                                                         prompt's options [{ text | en, zh }] in option order); free(key)
//   beat.mount(actor)                                     actor = { character, pos, yaw, vel? }: her hops move it (carry)
//   beat.open({ origin, yaw, n, aspect, her })            the stage comes up (origin: the home pad on the ground; yaw: its
//                                                         forward; her: where she stands — she hops onto the home pad)
//   beat.ask({ key, labels, now })                        a question: the labels pop onto the pads; the word is due on
//                                                         the first bar line ≥ LEARN.beat.lead s on; the hop on the next
//   beat.on = { speak(replay), answer(pad, info), defer(), say(text, { coral }) }
//        speak     play the word now (replay 1: the silent bar's one replay)
//        answer    she landed on pad `pad` (option index) — info { onBeat, off, replay }; judge it (engine.judge →
//                  store.recordFirst, the flow's one path) and call resolve()
//        defer     a whole answer bar silent, twice: no answer, no evidence — the flow moves the item to the end
//        say       a line for the question strip (「差一点：是 ___」 in coral) until play-1's play-strip.js is merged
//   beat.resolve({ ok, right, canonical }) → Promise      the show: right — the pad bursts in her ink, her ink on the
//                                                         ground under it, an on-beat hop dances; wrong — that pad coral,
//                                                         the right one lit in her ink, 差一点; resolves after verdictMs
//   beat.tapApi { down(x, y, id) → bool, up(x, y, id, cancel) }   touch (touch.js's G.playTap hook, as play-1's)
//   beat.key(e) → bool                                    a capture-phase keydown: arrows / A–D / 1–4 (and the walk keys
//                                                         are eaten while the stage is up, so A / D never walk her)
//   beat.carry(actor)                                     after actor.update(): her hop / her spot on the stage
//   beat.frame(aspect) → { pos, look, fov }               the world camera pose that frames the stage (cameraRig's spring)
//   beat.update(dt, t)                                    t = the game clock (G.time); every frame while open
//   beat.close() · beat.dispose() · beat.measure()
//   beat.anim                                             { grounded, vy, speed } for her AnimState while she hops
import * as THREE from 'three';
import { G } from '../../../core/ctx.js';
import { LEARN } from '../../../config.js';
import { BeatRound } from './round.js';
import { gridFromMusic, beatPulse } from './clock.js';
import { stageLayout, padOfTap, padOfSwipe, padOfKey, PAD_DIRS, ARROW, LETTER, LABEL, HOME_R } from './pads.js';
import { padBaseGeometry, padFaceGeometry, padFaceMaterial, padBaseMaterial, labelMaterial } from './mats.js';
import { makeAtlas, drawPadLabel } from '../board/atlas.js';

const B = LEARN.beat;
const MAXP = 5;   // up to four pads + the home pad (instance 0 is home)
const GLYPH = { up: 1, left: 2, right: 3, down: 4 };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _qi = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _v = new THREE.Vector3(), _w = new THREE.Vector3();
const _e = new THREE.Euler();
const easeOutBack = (k) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const WALK_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' ', 'shift', 'e', 'q', 'r', 'f']);

export function labelKeyOf(o, i, n) { const dir = PAD_DIRS[n === 4 ? 4 : 2][i]; return `${dir}|${o.en ?? o.text ?? ''}|${o.zh ?? ''}`; }
export function badgeOf(i, n) { const dir = PAD_DIRS[n === 4 ? 4 : 2][i]; return n === 4 ? `${LETTER[i]} ${ARROW[dir]}` : (dir === 'left' ? `${ARROW.left} ${LETTER[i]}` : `${LETTER[i]} ${ARROW.right}`); }

export class BeatStage {
  constructor({ scene, camera, team = 0, color, reduced = false } = {}) {
    this.scene = scene; this.camera = camera; this.team = team; this.reduced = !!reduced;
    this.ink = new THREE.Color(color || '#ff8a14');
    this.neutral = new THREE.Color(B.neutral); this.coral = new THREE.Color(B.coral);
    this.on = {};
    this.group = new THREE.Group(); this.group.name = 'play-beat'; this.group.visible = false;
    // pads: the base ring (decor's spawn pad) and the face, one instance each per pad
    this.baseMat = padBaseMaterial(); this.faceMat = padFaceMaterial();
    this.base = new THREE.InstancedMesh(padBaseGeometry(), this.baseMat, MAXP);
    this.base.receiveShadow = true; this.base.count = 0; this.base.frustumCulled = false; this.base.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.faceGeo = padFaceGeometry();
    this.face = new THREE.InstancedMesh(this.faceGeo, this.faceMat, MAXP);
    this.face.count = 0; this.face.frustumCulled = false; this.face.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const attr = (geo, name, size, n) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a; };
    this.aCol = attr(this.faceGeo, 'aCol', 3, MAXP); this.aPad = attr(this.faceGeo, 'aPad', 4, MAXP); this.aSel = attr(this.faceGeo, 'aSel', 4, MAXP);
    // label plates
    this.plateGeo = new THREE.PlaneGeometry(1, 1);
    this.aUv = attr(this.plateGeo, 'aUv', 4, 4); this.aLab = attr(this.plateGeo, 'aLab', 4, 4);
    // (a placeholder map from the start: the program is built with its map once, at warm(), never when the first atlas lands)
    this.blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); this.blank.needsUpdate = true;
    this.labelMat = labelMaterial(this.blank, '#' + this.ink.getHexString(), B.coral);
    this.plates = new THREE.InstancedMesh(this.plateGeo, this.labelMat, 4);
    this.plates.count = 0; this.plates.frustumCulled = false; this.plates.renderOrder = 3; this.plates.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.base, this.face, this.plates);
    scene?.add(this.group);
    // per pad state (index 0 = home; 1..n = the options in order) — preallocated
    this.P = [];
    for (let i = 0; i < MAXP; i++) this.P.push({ x: 0, z: 0, y: 0, r: 0.6, tx: 0, tz: 0, col: new THREE.Color(), glow: 0.6, wave: 0, waveT: 1, appr: -1, ink: 0, glyph: 0, streak: 0, pop: 0, popT: 9, state: 'idle', sink: 0 });
    this.L = [];
    for (let i = 0; i < 4; i++) this.L.push({ x: 0, y: 0, z: 0, w: 1.44, h: 0.72, uv: [0, 0, 0, 0], op: 0, ring: 0, coral: 0, pop: 0, popT: 9 });
    this.atlases = new Map(); this.atlas = null;
    this.round = new BeatRound({ lead: B.lead });
    this.gridCache = {}; this.gridSource = null;   // (the lab drives its own grid; the game reads music.js)
    this.n = 2; this.phase = 'off'; this.t = 0; this.layout = null; this.aspect = 16 / 9;
    this.origin = new THREE.Vector3(); this.yaw = 0;
    this.at = { x: 0, z: 0, pad: 0 };   // where she stands (stage frame), and on which pad (0 = home)
    this.hop = { on: false, fx: 0, fz: 0, tx: 0, tz: 0, t: 0, dur: B.hop, h: B.hopH, pad: 0, info: null, vy: 0 };
    this.anim = { grounded: true, vy: 0, speed: 0 };
    this.actor = null; this.danceT = 0;
    this.verdict = null; this.closeT = 0;
    this.taps = new Map();
    this.tapApi = { down: (x, y, id) => this._tapDown(x, y, id), up: (x, y, id, cancel) => this._tapUp(x, y, id, cancel) };
    this.log = [];
  }

  // ---------------------------------------------------------------------------------------------- atlases (2 gates ahead)
  prepare(key, labelSets) {
    if (this.atlases.has(key)) return this.atlases.get(key);
    const cells = [], seen = new Set();
    for (const set of labelSets || []) {
      const n = set.length === 4 ? 4 : 2;
      set.forEach((o, i) => {
        const k = labelKeyOf(o, i, n);
        if (seen.has(k)) return; seen.add(k);
        cells.push({ key: k, w: LABEL.cell[0], h: LABEL.cell[1], draw: (x, X, Y, w, h) => drawPadLabel(x, X, Y, w, h, { en: o.en ?? o.text ?? '', zh: o.zh || '', badge: badgeOf(i, n) }, { en: LABEL.en, zh: LABEL.zh }) });
      });
    }
    const A = makeAtlas(cells, { maxW: LABEL.cell[0] * 4 + 8 });
    this.atlases.set(key, A);
    return A;
  }
  free(key) { const A = this.atlases.get(key); if (!A) return; if (this.atlas === A) { this.atlas = null; this.labelMat.map = this.blank; } A.dispose(); this.atlases.delete(key); }

  // ---------------------------------------------------------------------------------------------- her
  mount(actor) { this.actor = actor || null; }
  unmount() { if (this.actor?.character && this.danceT > 0) this.actor.character.setDance(null); this.actor = null; this.danceT = 0; }

  // ---------------------------------------------------------------------------------------------- the stage
  open({ origin, yaw = 0, n = 2, aspect = 16 / 9, her = null } = {}) {
    this.n = n === 4 ? 4 : 2; this.yaw = yaw; this.aspect = aspect;
    if (origin) this.origin.copy(origin);
    this.group.position.copy(this.origin); this.group.rotation.set(0, yaw, 0); this.group.updateMatrixWorld(true);
    this.layout = stageLayout(this.n, aspect);
    const P = this.P;
    P[0].x = P[0].tx = 0; P[0].z = P[0].tz = 0; P[0].r = HOME_R; P[0].glyph = 5;
    this.layout.pads.forEach((p, k) => { const s = P[k + 1]; s.x = s.tx = p.x; s.z = s.tz = p.z; s.r = p.r; s.glyph = GLYPH[p.dir]; });
    for (let i = 0; i < MAXP; i++) { const s = P[i]; s.col.copy(this.neutral); s.glow = 0.6; s.wave = 0; s.waveT = 1; s.appr = -1; s.ink = 0; s.streak = 0; s.state = 'idle'; s.sink = 0; s.pop = 0; s.popT = this.reduced ? 9 : -0.06 * i; s.y = this._groundY(s.x, s.z); }
    this.base.count = this.face.count = this.n + 1;
    this.plates.count = 0;
    this.group.visible = true; this.phase = 'open'; this.closeT = 0;
    // she comes onto the home pad (a hop from where she stands, when she is not on it)
    this.at.x = 0; this.at.z = 0; this.at.pad = 0;
    if (her) {
      this._toStage(her, _v);
      if (Math.hypot(_v.x, _v.z) > 0.35) { this.at.x = _v.x; this.at.z = _v.z; this.at.pad = -1; this._hop(0, null); }
    }
    this.log.push({ t: +this.t.toFixed(2), ev: 'open', n: this.n });
    return this.layout;
  }

  // the stage follows a turn of the phone: pads glide to the other orientation's spots
  relayout(aspect) {
    if (!this.layout || Math.abs(aspect - this.aspect) < 1e-3) return this.layout;
    this.aspect = aspect;
    this.layout = stageLayout(this.n, aspect);
    this.layout.pads.forEach((p, k) => { const s = this.P[k + 1]; s.tx = p.x; s.tz = p.z; s.r = p.r; });
    if (this.cur) this._placeLabels();
    return this.layout;
  }

  ask({ key = null, labels = [], now = this.t } = {}) {
    const n = labels.length === 4 ? 4 : 2;
    if (this.phase === 'off' || n !== this.n) this.open({ origin: this.origin, yaw: this.yaw, n, aspect: this.aspect });
    let A = key != null ? this.atlases.get(key) : null;
    if (!A || !labels.every((o, i) => A.uv.has(labelKeyOf(o, i, n)))) A = this.prepare(`q:${this.log.length}`, [labels]);
    this.atlas = A;
    this.labelMat.map = A.tex;   // (same program: the material had a map from the start)
    this.cur = { labels: labels.map((o) => ({ en: o.en ?? o.text ?? '', zh: o.zh || '' })), keyAtlas: A };
    // the pads back to neutral, new labels pop in
    for (let i = 1; i <= this.n; i++) { const s = this.P[i]; s.col.copy(this.neutral); s.glow = 0.6; s.ink = 0; s.state = 'idle'; s.appr = -1; s.streak = 0; s.sink = 0; }
    this.P[0].col.copy(this.neutral);
    this._placeLabels();
    for (let i = 0; i < this.n; i++) { const l = this.L[i]; l.uv = A.uv.get(labelKeyOf(labels[i], i, n)) || l.uv; l.ring = 0; l.coral = 0; l.popT = this.reduced ? 9 : -0.05 * i; l.op = this.reduced ? 1 : 0; }
    this.plates.count = this.n;
    // back onto the home pad (a hop) if the last answer left her on another pad
    if (this.at.pad !== 0 && !this.hop.on) this._hop(0, null);
    this.round.start(this._grid(now), now);
    this.phase = 'ask'; this.verdict = null;
    this.log.push({ t: +now.toFixed(2), ev: 'ask', n, W: +this.round.W.toFixed(3), D: +this.round.D.toFixed(3) });
    return { W: this.round.W, D: this.round.D, win: this.round.win };
  }

  _placeLabels() {
    const L = this.layout.labels;
    for (let i = 0; i < this.n; i++) { const a = L[i], l = this.L[i]; l.x = a.x; l.y = a.y; l.z = a.z; l.w = a.w; l.h = a.h; }
  }

  close() {
    if (this.phase === 'off') return;
    this.phase = 'closing'; this.closeT = 0; this.round.stop();
    for (let i = 0; i < 4; i++) this.L[i].popT = 9;
  }

  // ---------------------------------------------------------------------------------------------- input
  input(pad, t = this.t) {
    if (this.phase !== 'ask' || this.hop.on || !(pad >= 0 && pad < this.n)) return null;
    const r = this.round.input(t, pad);
    if (!r) {   // before the word: not an answer — the pads give a little shrug
      if (this.round.phase === 'wait') for (let i = 1; i <= this.n; i++) this.P[i].popT = Math.max(this.P[i].popT, 0.6);
      return null;
    }
    this.phase = 'hop';
    this._hop(pad + 1, r);
    this.log.push({ t: +t.toFixed(3), ev: 'hop', pad, onBeat: r.onBeat, off: +r.off.toFixed(3) });
    return r;
  }
  _tapDown(x, y, id) {
    if (!this._live()) return false;
    this.taps.set(id, { x, y });
    return true;
  }
  _tapUp(x, y, id, cancel) {
    const s = this.taps.get(id); this.taps.delete(id);
    if (!s || cancel || !this._live()) return false;
    const dx = x - s.x, dy = y - s.y;
    let pad = padOfSwipe(dx, dy, this.n);
    if (pad < 0 && Math.hypot(dx, dy) < B.swipe) pad = padOfTap(s.x, s.y, this.projectPads());
    if (pad >= 0) this.input(pad);
    return true;
  }
  key(e) {
    if (!this._live() || !e || e.metaKey || e.ctrlKey || e.altKey) return false;
    const pad = padOfKey(e.key, this.n);
    if (pad >= 0) { if (!e.repeat) this.input(pad); return true; }
    return WALK_KEYS.has(String(e.key || '').toLowerCase());
  }
  _live() { return this.phase === 'ask' || this.phase === 'hop' || this.phase === 'verdict'; }

  // the pads' centres on the screen now (px), option order
  projectPads(out = this._proj || (this._proj = [])) {
    const cam = this.camera; out.length = 0;
    if (!cam) return out;
    const W = typeof innerWidth !== 'undefined' ? innerWidth : 1280, H = typeof innerHeight !== 'undefined' ? innerHeight : 720;
    for (let i = 1; i <= this.n; i++) {
      const s = this.P[i];
      this._toWorld(s.x, s.y + 0.08 - this.origin.y, s.z, _p).project(cam);
      const o = this._projO?.[i] || ((this._projO || (this._projO = []))[i] = { x: 0, y: 0 });
      o.x = (_p.x + 1) / 2 * W; o.y = (1 - _p.y) / 2 * H;
      out.push(o);
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------- the verdict
  resolve({ ok, right = -1, canonical = '' } = {}) {
    const info = this.hop.info || this.lastInfo || { onBeat: false };
    const pad = this.at.pad - 1;
    this.phase = 'verdict';
    const ms = this.reduced ? Math.min(600, B.verdictMs) : B.verdictMs;
    if (ok) this._right(pad, info); else this._wrong(pad, right, canonical);
    this.log.push({ t: +this.t.toFixed(2), ev: 'verdict', ok: !!ok, pad, onBeat: !!info.onBeat });
    return new Promise((done) => { this.verdict = { left: ms / 1000, done }; });
  }
  _right(pad, info) {
    const s = this.P[pad + 1], l = this.L[pad];
    if (!s) return;
    s.state = 'right'; s.col.copy(this.ink); s.glow = 1; s.wave = 1.3; s.waveT = 0; s.ink = 0;
    if (l) l.ring = 1;
    this._toWorld(s.x, s.y - this.origin.y + 0.3, s.z, _p);
    if (!this.reduced) G.fx?.explosion?.(_p, this.ink, 1.15);
    G.fx?.ring?.(_p, _v.set(0, 1, 0), this.ink, { radius: 1.4, life: 0.4 });
    _p.y = s.y + 0.05;
    G.paint?.splat?.(_p, B.ink, this.team, { kind: 'blast' });
    G.audio?.play?.('splat_big', { pos: _p, volume: 0.8 });
    if (info.onBeat) {
      s.streak = 1;
      const ch = this.actor?.character;
      if (ch && !this.reduced) { ch.setDance('victory'); this.danceT = B.danceFor; }
      G.fx?.ring?.(_p, _v.set(0, 1, 0), this.ink, { radius: 2.2, life: 0.5 });
    } else this.actor?.character?.trigger?.('jump');
  }
  _wrong(pad, right, canonical) {
    const s = this.P[pad + 1], l = this.L[pad];
    if (s) { s.state = 'coral'; s.col.copy(this.coral); s.glow = 0.9; s.ink = 0.65; s.wave = 0.7; s.waveT = 0; }
    if (l) l.coral = 1;
    const r = this.P[right + 1], rl = this.L[right];
    if (r && right !== pad) { r.state = 'hint'; r.col.copy(this.ink); r.glow = 1; r.wave = 0.9; r.waveT = 0; }
    if (rl && right !== pad) rl.ring = 1;
    G.audio?.play?.('ui_back', { volume: 0.8 });
    const word = canonical || (this.cur && right >= 0 && this.cur.labels[right] ? this.cur.labels[right].en + (this.cur.labels[right].zh ? `（${this.cur.labels[right].zh}）` : '') : '');
    this.on.say?.(`差一点：是 ${word}`, { coral: true });
  }

  // ---------------------------------------------------------------------------------------------- the hop
  _hop(toPad, info) {
    const s = this.P[toPad], H = this.hop;
    H.on = true; H.fx = this.at.x; H.fz = this.at.z; H.tx = s.x; H.tz = s.z; H.t = 0; H.pad = toPad; H.info = info;
    H.dur = this.reduced ? B.hopReduced : B.hop; H.h = this.reduced ? B.hopH * 0.35 : B.hopH;
    // a long hop (onto the stage from the gate) takes longer
    const d = Math.hypot(H.tx - H.fx, H.tz - H.fz);
    if (d > 3) H.dur *= Math.min(2, d / 3);
    this.actor?.character?.trigger?.('jump');
    G.audio?.play?.('jump', { volume: 0.5 });
  }
  _hopStep(dt) {
    const H = this.hop; if (!H.on) return;
    H.t += dt;
    const k = Math.min(1, H.t / H.dur);
    this.at.x = H.fx + (H.tx - H.fx) * k; this.at.z = H.fz + (H.tz - H.fz) * k;
    H.vy = H.h * 4 * (1 - 2 * k) / H.dur;
    this.anim.grounded = false; this.anim.vy = H.vy; this.anim.speed = Math.hypot(H.tx - H.fx, H.tz - H.fz) / H.dur;
    if (k < 1) return;
    H.on = false; this.at.pad = H.pad; this.anim.grounded = true; this.anim.vy = 0; this.anim.speed = 0;
    this.actor?.character?.trigger?.('land', 6.5);
    const s = this.P[H.pad]; if (s) { s.wave = Math.max(s.wave, 0.55); s.waveT = 0; }
    G.audio?.play?.('land', { volume: 0.45 });
    if (H.info) {   // an answer: taken now, as she lands
      this.lastInfo = H.info;
      this.on.answer?.(H.pad - 1, { onBeat: H.info.onBeat, off: H.info.off, replay: H.info.replay });
    }
  }
  // her height over the stage: the hop's arc on top of the pad she is over
  _herY() {
    const H = this.hop;
    if (!H.on) return 0.1;
    const k = Math.min(1, H.t / H.dur);
    return 0.1 + H.h * 4 * k * (1 - k);
  }
  carry(actor = this.actor) {
    if (!actor || this.phase === 'off') return;
    this._toWorld(this.at.x, this._groundAt(this.at.x, this.at.z) - this.origin.y + this._herY(), this.at.z, actor.pos);
    if (actor.vel) actor.vel.set(0, this.hop.on ? this.hop.vy : 0, 0);
    actor.yaw = this.yaw;
  }

  // ---------------------------------------------------------------------------------------------- the camera
  frame(aspect = this.aspect) {
    const L = this.layout && Math.abs(aspect - this.aspect) < 1e-3 ? this.layout : stageLayout(this.n, aspect);
    const c = L.cam;
    return { pos: this._toWorld(c.pos[0], c.pos[1], c.pos[2], new THREE.Vector3()), look: this._toWorld(c.look[0], c.look[1], c.look[2], new THREE.Vector3()), fov: c.fov, fits: c.fits };
  }

  // ---------------------------------------------------------------------------------------------- per frame
  _grid(t) {
    if (this.gridSource) return this.gridSource(t);
    return gridFromMusic(G.music, t, B.bpm, this.gridCache);
  }
  update(dt, t = this.t + dt) {
    this.t = t;
    if (this.phase === 'off') return;
    const g = this._grid(t), beat = beatPulse(g, t);
    this.faceMat.uniforms.uTime.value = t; this.faceMat.uniforms.uBeat.value = this.reduced ? beat * 0.4 : beat;
    // the question's bar lines
    if (this.phase === 'ask' || this.phase === 'hop') {
      let e;
      while ((e = this.round.tick(t))) {
        if (e.type === 'speak') { this.log.push({ t: +t.toFixed(3), ev: 'speak', replay: e.replay }); this.on.speak?.(e.replay); }
        else if (e.type === 'silent') this.log.push({ t: +t.toFixed(3), ev: 'silent', n: e.n });
        else if (e.type === 'defer') { this.log.push({ t: +t.toFixed(3), ev: 'defer' }); this.phase = 'open'; this.plates.count = 0; this.on.defer?.(); break; }
      }
    }
    const appr = (this.phase === 'ask' && this.round.phase === 'listen') ? this.round.approach(t) : -1;
    this._hopStep(dt);
    if (this.danceT > 0) { this.danceT -= dt; if (this.danceT <= 0) this.actor?.character?.setDance(null); }
    if (this.verdict) { this.verdict.left -= dt; if (this.verdict.left <= 0) { const d = this.verdict.done; this.verdict = null; this.phase = 'open'; d(); } }
    // closing: everything sinks, then off
    let sinkAll = 0;
    if (this.phase === 'closing') {
      this.closeT += dt; sinkAll = Math.min(1, this.closeT / (this.reduced ? 0.15 : 0.45));
      if (sinkAll >= 1) { this.phase = 'off'; this.group.visible = false; this.base.count = this.face.count = this.plates.count = 0; return; }
    }
    // pads
    for (let i = 0; i <= this.n; i++) {
      const s = this.P[i];
      s.x += (s.tx - s.x) * Math.min(1, dt * 8); s.z += (s.tz - s.z) * Math.min(1, dt * 8);
      s.popT += dt;
      const pk = s.popT >= 1 ? 1 : s.popT <= 0 ? 0 : (this.reduced ? 1 : easeOutBack(Math.min(1, s.popT / 0.45)));
      s.wave = Math.max(0, s.wave - dt * 0.9); s.waveT = Math.min(3, s.waveT + dt);
      s.streak = Math.max(0, s.streak - dt * 0.7);
      const sc = Math.max(0.001, (pk) * (1 - sinkAll)) * s.r;
      _q.identity();
      _m.compose(_p.set(s.x, s.y - this.origin.y, s.z), _q, _s.set(sc, 1, sc));
      this.base.setMatrixAt(i, _m);
      _m.compose(_p.set(s.x, s.y - this.origin.y + 0.078, s.z), _q, _s.set(sc, 1, sc));
      this.face.setMatrixAt(i, _m);
      this.aCol.setXYZ(i, s.col.r, s.col.g, s.col.b);
      const ap = i > 0 && s.state === 'idle' ? appr : -1;   // (the approach rings close onto the answer pads, not home)
      this.aPad.setXYZW(i, s.glow + (i === 0 ? 0.1 * beat : 0), s.wave, s.waveT, ap);
      this.aSel.setXYZW(i, s.state === 'right' ? Math.min(1, s.waveT * 3) : s.ink, s.glyph, s.streak, pk);
    }
    this.base.instanceMatrix.needsUpdate = true; this.face.instanceMatrix.needsUpdate = true;
    this.aCol.needsUpdate = true; this.aPad.needsUpdate = true; this.aSel.needsUpdate = true;
    // label plates: face the camera (a billboard in the stage's frame), pop in, bob a little on the beat
    if (this.plates.count && this.camera) {
      this.group.getWorldQuaternion(_qi).invert();
      _q.copy(this.camera.quaternion).premultiply(_qi);
      for (let i = 0; i < this.plates.count; i++) {
        const l = this.L[i];
        l.popT += dt;
        const pk = l.popT >= 1 ? 1 : l.popT <= 0 ? 0 : (this.reduced ? 1 : easeOutBack(Math.min(1, l.popT / 0.4)));
        l.op = this.phase === 'closing' ? 1 - sinkAll : Math.min(1, l.op + dt * 6);
        const bob = this.reduced ? 0 : beat * 0.035;
        _m.compose(_p.set(l.x, l.y + bob, l.z), _q, _s.set(l.w * pk * (1 + bob * 0.5), l.h * pk * (1 + bob * 0.5), 1));
        this.plates.setMatrixAt(i, _m);
        this.aUv.setXYZW(i, l.uv[0], l.uv[1], l.uv[2], l.uv[3]);
        this.aLab.setXYZW(i, l.op * (this.phase === 'closing' ? 1 - sinkAll : 1), l.ring, l.coral, l.w / l.h);
      }
      this.plates.instanceMatrix.needsUpdate = true; this.aUv.needsUpdate = true; this.aLab.needsUpdate = true;
    }
  }

  // ---------------------------------------------------------------------------------------------- frames
  _toWorld(x, y, z, out) { return out.set(x, y, z).applyMatrix4(this.group.matrixWorld); }
  _toStage(p, out) { this.group.updateMatrixWorld(); _m.copy(this.group.matrixWorld).invert(); return out.copy(p).applyMatrix4(_m); }
  _groundY(x, z) {
    const L = G.level;
    this._toWorld(x, 0, z, _w);
    if (L && typeof L.groundHeight === 'function') { const y = L.groundHeight(_w.x, _w.z, this.origin.y + 1.2); if (Number.isFinite(y) && Math.abs(y - this.origin.y) < 0.6) return y; }
    return this.origin.y;
  }
  _groundAt(x, z) {
    // between pads: the height of the nearest pad (they sit on near-flat ground)
    let best = this.P[0], bd = Infinity;
    for (let i = 0; i <= this.n; i++) { const s = this.P[i], d = (s.x - x) ** 2 + (s.z - z) ** 2; if (d < bd) { bd = d; best = s; } }
    return best.y;
  }

  warm(renderer, camera, target = this.scene) {
    const vis = this.group.visible, bc = this.base.count, fc = this.face.count, pc = this.plates.count;
    this.group.visible = true; this.base.count = this.face.count = 1; this.plates.count = 1;
    try { return renderer.compileAsync ? renderer.compileAsync(this.group, camera, target || null) : Promise.resolve(renderer.compile(this.group, camera)); }
    finally { this.group.visible = vis; this.base.count = bc; this.face.count = fc; this.plates.count = pc; }
  }
  // what the audits read
  state() { return { phase: this.phase, n: this.n, round: this.round.phase, W: +this.round.W.toFixed(3), D: +this.round.D.toFixed(3), silent: this.round.silent, at: { ...this.at }, hop: this.hop.on, pads: this.P.slice(0, this.n + 1).map((s) => s.state) }; }
  dispose() {
    this.scene?.remove(this.group);
    for (const A of this.atlases.values()) A.dispose();
    this.atlases.clear();
    this.faceGeo.dispose(); this.plateGeo.dispose();
    this.baseMat.dispose(); this.faceMat.dispose(); this.labelMat.dispose(); this.blank.dispose();
  }
}
