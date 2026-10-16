// 字弹 M4 (docs/PLAY.md §3 M4) — 打字蟹, the type rig: the kid hops into INKWAVE's Crab Rig re-skinned as a typewriter.
// The crab's hull, legs and mortar (special-props.js buildCrab), and in its claws a typewriter deck (deck-geo.js): 34
// chunky keycaps (one InstancedMesh, legends from one atlas), a half-moon fan of 31 type-bars (instanced) that swing up
// and strike the platen, a carriage (platen + paper) that steps along with every letter and returns with a ding, a paper
// sheet rising above the rig with the typed text on it, an ink tank that pulses. On 射 the sheet tears off, rolls into a
// shell, hops into the mortar and is lobbed in an arc to the target.
//
//   const rig = new TypeRig({ scene, team, color, reduced })
//   rig.mount(actor)          actor = { character, pos, yaw, team? } — hides the weapon (as the crab does), seats the kid
//                             (actor.learnSeat, read by actor.js next to specialActive.seat)
//   rig.press(key)            'a'…'z' ' ' "'" '-' '.' ',' '?' — the cap goes down and lights (team colour, every key the
//                             same), its type-bar swings, the carriage steps, a NEUTRAL grey glyph prints on impact;
//                             'back' = backspace(). Same frame: cap + bar start moving in the call itself.
//   rig.backspace()           the carriage steps back, the last glyph lifts off the paper
//   rig.fire(text, target)    → Promise<Vector3 landing point>; target = Vector3 | Object3D (its world position)
//   rig.reset()               a fresh sheet feeds up, the text is cleared (next item)
//   rig.update(dt)            every frame (no allocations)
//   rig.unmount() · rig.dispose() · rig.warm(renderer, camera) → Promise (compileAsync of every material it shows)
//   rig.text                  what is typed (lowercase as typed); rig.root is the Object3D
//
// Nothing in this file receives or reads an answer: colours are functions of the key and the time only (PLAY §1.3).
import * as THREE from 'three';
import { G, emit } from '../../../core/ctx.js';
import { LEARN } from '../../../config.js';
import { getPlasticMaterial, getInkMaterial, getGlassMaterial } from '../../../game/character-mats.js';
import { getTypeRigGeo, DECK } from './deck-geo.js';
import { getAtlas, glyphCell } from './atlas.js';
import { capMaterial, paperMaterial, makeTextTexture } from './mats.js';
import { PRINTABLE } from './keys.js';

const T = LEARN.type;
const V3 = THREE.Vector3;
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new V3(), _p = new V3(), _v = new V3(), _v2 = new V3();
const ONE = new V3(1, 1, 1);
const GRAV = 14;                              // m/s² of the shell's arc (a toy arc: a bit floatier than the game's 20)
const LINES = 32;                             // ring of paper lines kept in the text texture
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

/** a damped spring step on (x, v) toward target; k stiffness, z damping ratio */
function spring(s, i, target, k, z, dt) {
  const x = s[i], v = s[i + 1], w = Math.sqrt(k), c = 2 * z * w;
  const a = -k * (x - target) - c * v;
  const nv = v + a * dt, nx = x + nv * dt;
  s[i] = nx; s[i + 1] = nv;
  return nx;
}

/** the column/line model of the paper (pure; rig and tests share it). wraps[line] says how a line began: 'space' (a
 *  space at the bell became the carriage return) or 'full' (the previous line ran out of columns). */
export function paperModel() {
  return { lines: [0], wraps: [null], col: 0, line: 0 };
}
/** Typing one character advances the paper model; a space at wrapAt+ (or a full line) returns the carriage.
 *  → { col, line, ret } where the glyph goes (ret = a carriage return happened first), or the return itself for a space. */
export function paperType(pm, ch, cols = DECK.cols, wrapAt = T.wrapAt) {
  if (ch === ' ' && pm.col >= wrapAt) { pm.lines.push(0); pm.wraps.push('space'); pm.line++; pm.col = 0; return { col: -1, line: pm.line, ret: true, space: true }; }
  let ret = false;
  if (pm.col >= cols) { pm.lines.push(0); pm.wraps.push('full'); pm.line++; pm.col = 0; ret = true; }
  const at = { col: pm.col, line: pm.line, ret, space: ch === ' ' };
  pm.col++; pm.lines[pm.line] = pm.col;
  return at;
}
/** ⌫ (one character of the text): → { col, line, back, empty } — the cell freed (back = the carriage went up a line;
 *  empty = the character was the space that made the return, so no glyph goes) — or null on an empty sheet. */
export function paperBack(pm) {
  if (pm.col === 0) {
    if (pm.line === 0) return null;
    const how = pm.wraps.pop();
    pm.lines.pop(); pm.line--; pm.col = pm.lines[pm.line];
    if (how === 'space') return { col: pm.col, line: pm.line, back: true, empty: true };
    pm.col--; pm.lines[pm.line] = pm.col;     // a full line wrapped: the character erased is its last one
    return { col: pm.col, line: pm.line, back: true, empty: false };
  }
  pm.col--; pm.lines[pm.line] = pm.col;
  return { col: pm.col, line: pm.line, back: false, empty: false };
}

export class TypeRig {
  constructor(opts = {}) {
    this.scene = opts.scene || G.scene || null;
    this.team = opts.team ?? 0;
    this.color = new THREE.Color(opts.color || (G.teamColors && G.teamColors[this.team]) || '#ff8a14');
    this.reduced = !!opts.reduced;
    this.audio = opts.audio || null;      // defaults to G.audio at play time
    this.fx = opts.fx || null;            // defaults to G.fx
    this.geo = getTypeRigGeo();
    this.atlas = getAtlas();
    this.root = new THREE.Group(); this.root.name = 'type-rig';
    this.hull = new THREE.Group(); this.root.add(this.hull);
    this._build();
    this.actor = null;
    this.text = '';
    this.pm = paperModel();
    this.t = 0;
    this.hullYaw = 0; this.hullYawV = 0; this.hullYawTarget = null;
    // springs (x, v pairs): 0 carriage x, 2 feed, 4 squash, 6 cannon recoil, 8 tank pulse, 10 sheet rise
    this.S = new Float32Array(12);
    this.S[0] = this._carriageX(0);
    this.carTarget = this.S[0];
    this.carriage.position.x = this.S[0];
    this.carK = 520;
    this.S[10] = 0;
    this.prints = [];                    // queued strikes: { at, col, line, glyph } (pooled objects)
    this._pool = [];
    this.shot = null;                    // the running fire sequence
    this.tank = 1;                       // ink level 0..1 (slowly used, refilled on reset)
    this.mounted = false;
  }

  // ------------------------------------------------------------------------------------------------ build
  _build() {
    const g = this.geo, team = this.color;
    const plastic = getPlasticMaterial(), ink = getInkMaterial(team);
    const add = (geo, mat, parent = this.hull, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = shadow; parent.add(m); return m; };
    add(g.body, plastic); this.inkMesh = add(g.ink, ink);
    // mortar (recoils along its own axis)
    this.cannon = new THREE.Group(); this.cannon.position.copy(g.cannon.at); this.hull.add(this.cannon);
    for (const [geo, mat] of [[g.cannon.body, plastic], [g.cannon.ink, ink]]) { const m = add(geo, mat, this.cannon); m.position.copy(g.cannon.at).negate(); }
    // keycaps
    const n = g.caps.length;
    this.capMat = capMaterial(this.atlas, team);
    this.caps = new THREE.InstancedMesh(g.cap, this.capMat, n);
    this.caps.castShadow = true; this.caps.receiveShadow = true; this.caps.frustumCulled = false;
    this.capAttr = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    this.caps.geometry = g.cap.clone();   // own the instanced attribute (the shared geometry stays clean)
    this.caps.geometry.setAttribute('aKey', this.capAttr);
    this.keyIndex = new Map();
    this.capState = new Float32Array(n * 4);   // depress x, v, hold timer, lit
    g.caps.forEach((c, i) => {
      this.keyIndex.set(c.key, i);
      const sx = (c.w * DECK.pitch - DECK.gap) / (DECK.pitch - DECK.gap);
      this.capAttr.setXYZW(i, Math.max(0, glyphCell(c.key)), sx, 0, 0);
      this._capMatrix(i, 0);
    });
    this.hull.add(this.caps);
    // type-bars
    this.bars = new THREE.InstancedMesh(g.bar, plastic, g.bars.length);
    this.bars.castShadow = true; this.bars.frustumCulled = false;
    this.barIndex = new Map(); this.barState = new Float32Array(g.bars.length * 3);   // phase x, v, target
    g.bars.forEach((b, i) => { this.barIndex.set(b.key, i); this._barMatrix(i, 0); });
    this.hull.add(this.bars);
    // carriage: platen + paper
    this.carriage = new THREE.Group(); this.carriage.position.set(0, DECK.platenAt.y, DECK.platenAt.z); this.hull.add(this.carriage);
    add(g.platen, plastic, this.carriage);
    this.textTex = makeTextTexture(DECK.cols, LINES);
    this.paperMat = paperMaterial(this.atlas, this.textTex, T.glyph);
    const pg = new THREE.PlaneGeometry(DECK.paperW, DECK.paperH, 1, 40); pg.translate(0, DECK.paperH / 2, 0); pg.rotateY(Math.PI);
    this.paper = new THREE.Mesh(pg, this.paperMat); this.paper.castShadow = true; this.paper.receiveShadow = true;
    this.paperBase = new V3(0, DECK.platenR * 0.62, 0.012);
    this.paper.position.copy(this.paperBase);
    this.carriage.add(this.paper);
    this.U = this.paperMat.userData.uniforms;
    // ink tank: glass + team ink column
    this.tankG = new THREE.Group(); this.tankG.position.copy(g.tank.at); this.hull.add(this.tankG);
    this.fill = add(g.tank.fill, ink, this.tankG, false);
    const glass = add(g.tank.glass, getGlassMaterial(), this.tankG, false); glass.renderOrder = 2;
    this.fill.scale.set(1, DECK.tankH * 0.94, 1);
    // the shell (only during a shot), neutral grey ink caps: nothing is judged yet
    this.shellG = new THREE.Group(); this.shellG.visible = false;
    add(g.shell.body, plastic, this.shellG); add(g.shell.ink, getInkMaterial(new THREE.Color(T.word)), this.shellG);
    this.caps.instanceMatrix.needsUpdate = true; this.bars.instanceMatrix.needsUpdate = true;
  }

  _capMatrix(i, d) {
    const c = this.geo.caps[i];
    _p.copy(c.pos).addScaledVector(DECK.normal, -d * DECK.travel);
    _s.set((c.w * DECK.pitch - DECK.gap) / (DECK.pitch - DECK.gap), 1 - 0.12 * Math.max(0, d - 0.85), 1);
    _m.compose(_p, DECK.quat, _s);
    this.caps.setMatrixAt(i, _m);
  }
  _barMatrix(i, ph) {
    const b = this.geo.bars[i];
    _q.slerpQuaternions(b.rest, b.strike, clamp(ph, 0, 1));
    _m.compose(b.pivot, _q, ONE);
    this.bars.setMatrixAt(i, _m);
  }
  _carriageX(col) { return (col + 0.5) * DECK.pitchX + DECK.marginX - DECK.paperW / 2; }

  // ------------------------------------------------------------------------------------------------ mount
  mount(actor) {
    this.actor = actor;
    const ch = actor && actor.character;
    if (ch) {
      ch.weaponHidden = true;
      if (ch.weapon?.pivot) ch.weapon.pivot.visible = false;
      if (ch.weapon?.left?.pivot) ch.weapon.left.pivot.visible = false;
    }
    if (actor) actor.learnSeat = this.geo.seatAt.y;   // actor.js adds it to the character's root height
    this.hullYaw = actor ? actor.yaw || 0 : 0;
    if (this.scene && !this.root.parent) this.scene.add(this.root);
    if (this.scene && !this.shellG.parent) this.scene.add(this.shellG);
    this.mounted = true;
    this.S[4] = -0.12;   // drop in with a little squash
    this._sync();
    return this;
  }
  unmount() {
    const a = this.actor, ch = a && a.character;
    if (ch) {
      ch.weaponHidden = false;
      if (ch.weapon?.pivot) ch.weapon.pivot.visible = true;
      if (ch.weapon?.left?.pivot) ch.weapon.left.pivot.visible = true;
    }
    if (a) a.learnSeat = 0;
    this.root.parent?.remove(this.root);
    this.shellG.parent?.remove(this.shellG);
    this.actor = null; this.mounted = false;
  }

  // ------------------------------------------------------------------------------------------------ typing
  /** a key from the keyboard (on-screen or physical). Only the cap / bar / paper move; nothing is judged. */
  press(key) {
    if (key === 'back') return this.backspace();
    if (key === 'fire') return false;          // 射 belongs to the flow: it calls fire(text, target)
    if (this.shot) return false;
    const ci = this.keyIndex.get(key);
    if (ci == null) return false;
    this._capDown(ci);
    const at = paperType(this.pm, key);
    this.text += key;
    if (key !== ' ') {
      const bi = this.barIndex.get(key);
      if (bi != null) { this.barState[bi * 3 + 2] = 1; this.barState[bi * 3 + 1] = Math.max(this.barState[bi * 3 + 1], 14); }
    }
    this._queuePrint(at, key === ' ' ? 0 : glyphCell(key) + 1);
    this._play('ui_click', { volume: 0.55, pitch: 0.85 + 0.3 * ((key.charCodeAt(0) * 37) % 11) / 10 });
    this._kid('key');
    return true;
  }
  backspace() {
    if (this.shot) return false;
    const ci = this.keyIndex.get('back');
    if (ci != null) this._capDown(ci);
    if (!this.text.length) { this._play('ui_click', { volume: 0.3, pitch: 0.6 }); return false; }
    this.text = this.text.slice(0, -1);
    const r = paperBack(this.pm);
    if (r) {
      if (r.back) { this.S[2] = -DECK.lineH; this._play('ui_toggle', { volume: 0.4, pitch: 0.8 }); }
      if (!r.empty) {
        const data = this.textTex.image.data, idx = (r.line % LINES) * DECK.cols + r.col;
        const g = data[idx];
        data[idx] = 0; this.textTex.needsUpdate = true;
        this.U.uGone.value.set(r.col, r.line, 0, g);
      }
      this.U.uLine.value = this.pm.line;
      this.carTarget = this._carriageX(this.pm.col); this.carK = 420;
    }
    this._play('ui_click', { volume: 0.45, pitch: 0.7 });
    this._kid('key');
    return true;
  }
  _capDown(i) {
    const s = this.capState;
    s[i * 4 + 2] = T.holdKey; s[i * 4 + 3] = 1;
    s[i * 4 + 1] = Math.max(s[i * 4 + 1], 9);   // the cap starts moving this frame
    s[i * 4] = Math.max(s[i * 4], 0.35);
    this._capMatrix(i, s[i * 4]); this.caps.instanceMatrix.needsUpdate = true;
    this.capAttr.setZ(i, 1); this.capAttr.needsUpdate = true;
  }
  _queuePrint(at, glyph) {
    const p = this._pool.pop() || { at: 0, col: 0, line: 0, glyph: 0, ret: false };
    p.at = this.t + T.printDelay; p.col = at.col; p.line = at.line; p.glyph = glyph; p.ret = at.ret;
    this.prints.push(p);
  }
  _print(p) {
    if (p.ret) { this.U.uLine.value = p.line; this.S[2] = DECK.lineH; this.carK = 180; this._play('ui_confirm', { volume: 0.35, pitch: 1.4 }); }
    if (p.col >= 0) {
      const data = this.textTex.image.data;
      if (p.col === 0) data.fill(0, (p.line % LINES) * DECK.cols, (p.line % LINES + 1) * DECK.cols);   // a fresh line in the ring
      data[(p.line % LINES) * DECK.cols + p.col] = p.glyph;
      this.textTex.needsUpdate = true;
      if (p.glyph) this.U.uHot.value.set(p.col, p.line, 0, p.glyph);
      this.carTarget = this._carriageX(p.col + 1); if (!p.ret) this.carK = 520;
      if (p.glyph) { this.S[9] -= 2.4; this.tank = Math.max(0.35, this.tank - 0.012); }
    } else {
      // a space that returned the carriage: the feed and the slide back
      this.U.uLine.value = p.line; this.S[2] = DECK.lineH; this.carTarget = this._carriageX(0); this.carK = 180;
      this._play('ui_confirm', { volume: 0.35, pitch: 1.4 });
    }
  }

  // ------------------------------------------------------------------------------------------------ the shot
  /** Tear the sheet off, roll it into a shell, load the mortar and lob it at the target. Resolves with the landing
   *  point (a new Vector3) when the shell lands. The text is only what was typed — the verdict comes later (shot.js). */
  fire(text, target, onLand) {
    if (this.shot) return this.shot.promise;
    const to = new V3();
    if (target && target.isObject3D) target.getWorldPosition(to); else if (target) to.copy(target);
    const shot = { t: 0, text: String(text ?? this.text), to, from: new V3(), vel: new V3(), T: 1, landed: false, launched: false, resolve: null, promise: null, yaw: 0, onLand: onLand || null };
    shot.promise = new Promise((res) => { shot.resolve = res; });
    // turn the hull toward the target while the sheet rolls (the mortar is fixed in the hull)
    shot.yaw = Math.atan2(to.x - this.root.position.x, to.z - this.root.position.z);
    this.hullYawTarget = shot.yaw;
    this.shot = shot;
    // the paper sheet is taken: flush pending strikes so the sheet carries every letter typed
    while (this.prints.length) { const p = this.prints.shift(); this._print(p); this._pool.push(p); }
    this._capDown(this.keyIndex.get('fire'));
    this._play('roller_flick', { volume: 0.5, pitch: 1.25 });
    this._kid('fire');
    return shot.promise;
  }

  _shotTick(dt) {
    const s = this.shot; if (!s) return;
    s.t += dt;
    const R = this.reduced;
    const tTear = 0.16, tRoll = R ? 0.3 : 0.42, tLoad = R ? 0.2 : 0.3;
    const U = this.U;
    if (s.t < tTear) { U.uTear.value = ease(s.t / tTear); }
    else if (s.t < tTear + tRoll) { U.uTear.value = 1; U.uRoll.value = ease((s.t - tTear) / tRoll); }
    else if (!s.launched) {
      U.uRoll.value = 1;
      // the rolled sheet → the shell, hopping from the platen into the mortar's mouth
      if (this.paper.visible) {
        this.paper.visible = false; this.shellG.visible = true;
        this.root.updateMatrixWorld(true);
        s.hopFrom = new V3(0, DECK.paperH * 0.05, 0.05); this.paper.localToWorld(s.hopFrom);
        s.muzzle = this.geo.cannonMuzzle.clone(); this.hull.localToWorld(s.muzzle);
        this._play('ui_toggle', { volume: 0.35, pitch: 0.7 });
      }
      const k = clamp((s.t - tTear - tRoll) / tLoad, 0, 1);
      _v.copy(s.hopFrom).lerp(s.muzzle, ease(k)); _v.y += Math.sin(Math.PI * k) * 0.55;
      this.shellG.position.copy(_v);
      this.shellG.rotation.set(0, this.hullYaw, -k * 2.2);
      this.shellG.scale.setScalar(1 - 0.45 * k);
      if (k >= 1) this._launch(s);
    } else if (!s.landed) {
      const ft = s.t - s.t0;
      _v.copy(s.from).addScaledVector(s.vel, ft); _v.y -= 0.5 * GRAV * ft * ft;
      this.shellG.position.copy(_v);
      _v2.copy(s.vel); _v2.y -= GRAV * ft;
      this.shellG.rotation.set(Math.atan2(-_v2.y, Math.hypot(_v2.x, _v2.z)) + ft * 9, this.hullYaw, 0, 'YXZ');
      this.shellG.scale.setScalar(Math.min(1.35, 0.6 + ft * 2.2));
      if (ft >= s.T) this._land(s);
    } else if (s.t - s.tl > 0.3) {
      // the platen stays bare (the view to the word is clear) until reset() feeds the next sheet
      this.shot = null;
      this.hullYawTarget = null;
    }
  }
  _launch(s) {
    s.launched = true; s.t0 = s.t;
    this.root.updateMatrixWorld(true);
    s.from.copy(this.geo.cannonMuzzle); this.hull.localToWorld(s.from);
    const d = Math.hypot(s.to.x - s.from.x, s.to.z - s.from.z);
    s.T = clamp(T.flight[0] + d * 0.05, T.flight[0], T.flight[1]);
    s.vel.set((s.to.x - s.from.x) / s.T, (s.to.y - s.from.y + 0.5 * GRAV * s.T * s.T) / s.T, (s.to.z - s.from.z) / s.T);
    this.S[6] = -0.12; this.S[7] = 0; this.S[4] = -0.09;   // recoil + the whole crab squats
    this._play('bomb_throw', { volume: 0.8, pitch: 0.75 });
    const fx = this.fx || G.fx, grey = this._grey || (this._grey = new THREE.Color(T.word));
    if (fx) {
      _v.copy(s.vel).normalize();
      fx.burst?.(s.from, _v, grey, { count: this.reduced ? 4 : 10, speed: 3, size: 0.07, spread: 0.5 });
      if (!this.reduced) fx.ring?.(s.from, _v, grey, { radius: 0.5, life: 0.25 });
    }
    if (!this.reduced) emit('shake', { pos: s.from.clone(), amount: 0.15 });
  }
  _land(s) {
    s.landed = true; s.tl = s.t;
    s.landPoint = s.to.clone();
    this.shellG.visible = false;
    const fx = this.fx || G.fx, grey = this._grey;
    if (fx) {
      if (this.reduced) fx.ring?.(s.to, _v.set(0, 1, 0), grey, { radius: 0.9, life: 0.35 });
      else { fx.explosion?.(s.to, grey, 0.8); fx.burst?.(s.to, _v.set(0, 1, 0), grey, { count: 16, speed: 4, size: 0.09 }); }
    }
    this._play('bomb_explode', { pos: s.to, volume: 0.55, pitch: 1.25 });
    this._play('splat_small', { pos: s.to, volume: 0.7 });
    s.onLand && s.onLand(s.landPoint.clone(), s.text);
    this.onLand && this.onLand(s.landPoint, s.text);
    s.resolve && s.resolve(s.landPoint.clone());
  }

  /** a fresh, empty sheet slides up out of the platen; ready for the next item */
  reset() {
    if (this.shot) { this.shot = null; this.shellG.visible = false; this.hullYawTarget = null; }
    this.text = ''; this.pm = paperModel();
    for (const p of this.prints) this._pool.push(p);
    this.prints.length = 0;
    const was = this.paper.visible && this.U.uRoll.value === 0 && this.U.uTear.value === 0;
    this._clearPaper();
    if (!was) { this.paper.visible = true; this.S[10] = -DECK.paperH * 0.9; this.S[11] = 0; this._play('ui_toggle', { volume: 0.3, pitch: 1.2 }); }
    this.carTarget = this._carriageX(0); this.carK = 160;
    this.tank = 1;
    return this;
  }
  _clearPaper() {
    this.textTex.image.data.fill(0); this.textTex.needsUpdate = true;
    const U = this.U; U.uLine.value = 0; U.uFeed.value = 0; U.uTear.value = 0; U.uRoll.value = 0; U.uHot.value.set(-1, -1, 9, 0); U.uGone.value.set(-1, -1, 9, 0);
    this.S[2] = 0; this.S[3] = 0;
    if (!this.shot) { this.pm = paperModel(); this.text = ''; this.carTarget = this._carriageX(0); this.carK = 160; }
  }

  // ------------------------------------------------------------------------------------------------ helpers
  _play(name, o) { const a = this.audio || G.audio; if (a && a.play) a.play(name, o); }
  /** the kid operates the rig with the game's own one-shots only (character.js trigger) */
  _kid(what) {
    const ch = this.actor && this.actor.character; if (!ch || !ch.trigger) return;
    if (what === 'key') ch.trigger('shoot');
    else if (what === 'fire') ch.trigger('throw');
  }
  _sync() {
    const a = this.actor;
    if (a) { this.root.position.copy(a.pos); }
    this.root.rotation.y = this.hullYaw;
  }

  // ------------------------------------------------------------------------------------------------ frame
  update(dt) {
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const S = this.S;
    // hull yaw: follow the kid, or the target during a shot (a heavy spring, the crab special's slow hull)
    const a = this.actor, want = this.hullYawTarget != null ? this.hullYawTarget : a ? a.yaw || 0 : this.hullYaw;
    let d = want - this.hullYaw; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
    this.hullYawV += (d * 60 - this.hullYawV * 2 * Math.sqrt(60)) * dt; this.hullYaw += this.hullYawV * dt;
    if (!this.shot) this.hullYawTarget = null;
    this._sync();
    // strikes due
    while (this.prints.length && this.prints[0].at <= this.t) { const p = this.prints.shift(); this._print(p); this._pool.push(p); }
    // caps
    const cs = this.capState, n = this.geo.caps.length;
    let capDirty = false, attrDirty = false;
    for (let i = 0; i < n; i++) {
      const o = i * 4;
      if (cs[o] === 0 && cs[o + 1] === 0 && cs[o + 3] === 0) continue;
      if (cs[o + 2] > 0) cs[o + 2] -= dt;
      const tgt = cs[o + 2] > 0 ? 1 : 0;
      const x = spring(cs, o, tgt, tgt ? 2600 : 900, tgt ? 0.9 : 0.42, dt);
      if (Math.abs(x) < 1e-4 && Math.abs(cs[o + 1]) < 1e-3 && !tgt) { cs[o] = 0; cs[o + 1] = 0; }
      this._capMatrix(i, clamp(x, -0.3, 1.1)); capDirty = true;
      if (cs[o + 3] > 0) { cs[o + 3] = cs[o + 2] > 0 ? 1 : Math.max(0, cs[o + 3] - dt * 3.2); this.capAttr.setZ(i, cs[o + 3]); attrDirty = true; }
    }
    if (capDirty) this.caps.instanceMatrix.needsUpdate = true;
    if (attrDirty) this.capAttr.needsUpdate = true;
    // type-bars: snap up to the platen, fall back with a bounce
    const bs = this.barState, nb = this.geo.bars.length;
    let barDirty = false;
    for (let i = 0; i < nb; i++) {
      const o = i * 3;
      if (bs[o] === 0 && bs[o + 1] === 0 && bs[o + 2] === 0) continue;
      if (bs[o + 2] > 0) {
        bs[o + 1] += 900 * dt; bs[o] += bs[o + 1] * dt;
        if (bs[o] >= 1) { bs[o] = 1; bs[o + 1] = -7; bs[o + 2] = 0; }
      } else {
        const x = spring(bs, o, 0, 520, 0.5, dt);
        if (x < 0) { bs[o] = 0; bs[o + 1] = Math.abs(bs[o + 1]) * 0.3; if (bs[o + 1] < 0.3) bs[o + 1] = 0; }
      }
      this._barMatrix(i, bs[o]); barDirty = true;
    }
    if (barDirty) this.bars.instanceMatrix.needsUpdate = true;
    // carriage + feed
    this.carriage.position.x = spring(S, 0, this.carTarget, this.carK, this.carK < 300 ? 0.55 : 0.75, dt);
    this.U.uFeed.value = spring(S, 2, 0, 140, 0.62, dt);
    const U = this.U;
    U.uHot.value.z += dt; U.uGone.value.z += dt;
    // a fresh sheet sliding up
    this.paper.position.y = this.paperBase.y + spring(S, 10, 0, 90, 0.7, dt);
    // squash (mount drop-in, recoil) — the whole rig, from the ground
    const sq = spring(S, 4, 0, 160, 0.38, dt);
    this.hull.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
    // mortar recoil along its tube
    const rc = spring(S, 6, 0, 240, 0.5, dt);
    this.cannon.position.copy(this.geo.cannon.at).addScaledVector(this.geo.cannonDir, rc * 1.4);
    // ink tank: level + a squishy pulse per strike, a slow breath at rest
    const pulse = spring(S, 8, 0, 300, 0.3, dt);
    const breath = this.reduced ? 0 : Math.sin(this.t * 2.4) * 0.012;
    this.fill.scale.set(1 + pulse * 0.25 + breath, DECK.tankH * (0.3 + 0.64 * this.tank) * (1 - pulse * 0.4), 1 + pulse * 0.25 + breath);
    this._shotTick(dt);
  }

  /** Compile every material the rig shows (keycaps, paper, plastic + ink instancing variants, the shell) against the
   *  game scene's lights — in place, nothing is re-parented, so it can run while the rig is on screen. Call it two
   *  gates ahead (three.js compileAsync: parallel where KHR_parallel_shader_compile exists). */
  warm(renderer, camera, target = this.scene) {
    const tgt = target || null, was = this.shellG.visible;
    this.shellG.visible = true;           // compile() runs synchronously inside compileAsync: no frame sees this
    try {
      const c = (o) => (renderer.compileAsync ? renderer.compileAsync(o, camera, tgt) : Promise.resolve(renderer.compile(o, camera, tgt)));
      return Promise.all([c(this.root), c(this.shellG)]);
    } finally { this.shellG.visible = was; }
  }

  dispose() {
    this.unmount();
    this.caps.geometry.dispose(); this.capMat.dispose(); this.paperMat.dispose(); this.paper.geometry.dispose(); this.textTex.dispose();
    this.caps.dispose(); this.bars.dispose();
  }
}

export { PRINTABLE };
