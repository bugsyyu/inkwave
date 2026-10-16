// 翻牌靶 M8 — the two rating targets (「认识」 / 「不熟」): a minimal ink target with play-1's PlayTargets surface
// (src/learn/play/targets.js on the play-1 branch), so the deck can switch to play-1's after the merge by handing its
// constructor a PlayTargets instead (deck = new FlipDeck({ targets: new PlayTargets({ scene, renderer, camera }) })):
//
//   T.atlas(key, labels) → { tex, uv: Map(labelKey → [u0, v0, u1, v1]), box }   T.freeAtlas(key)
//   T.show(atlas, objs, basis)    objs: [{ i, kind: 'ball', key, x, y, z, r, plate: { x, y, z, w, h } }], basis: { right, up, back }
//   T.state(i, 'idle' | 'coral' | 'right' | 'dim') · T.burst(i) · T.hide() · T.update(dt)
//   T.project(camera, W, H) → [{ i, kind: 'ball', cx, cy, r, label: { x, y, w, h } } | null]   (pick.js's shape)
//   T.spheres → [{ x, y, z, r, target, active }]   the hit shapes (play-1's hit.js ShotTargets reads them)
//   T.setInk(color) · T.warm(renderer, camera) · T.dispose()
//   pickTarget(x, y, projected, { slop, minHit }) — play-1's pick.js rule for balls (disc + label, ≥ 44 pt, nearest wins)
import * as THREE from 'three';
import { LEARN } from '../../../config.js';
import { makeAtlas, glass, fitFont, FONT, TEXT, MUTED } from '../board/atlas.js';
import { labelMaterial } from '../beat/mats.js';

const MAXO = 4;
export const COLORS = { idle: '#a39db8', coral: '#f08a7a', dim: '#5c586a' };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color(), _x = new THREE.Vector3(), _y = new THREE.Vector3(), _z = new THREE.Vector3();
const pop = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : 1 + Math.sin(k * Math.PI) * 0.14 * (1 - k) - Math.pow(1 - k, 3));
export const labelKey = (l) => `${l.en || ''}|${l.zh || ''}`;

export class InkTargets {
  constructor({ scene, reduced = false, ink = '#ff8a14' } = {}) {
    this.scene = scene; this.reduced = reduced;
    this.ink = new THREE.Color(ink);
    this.group = new THREE.Group(); this.group.name = 'play-flip-targets'; this.group.visible = false;
    this.ballMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.15, name: 'iw-flip-ball' });
    this.balls = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 4), this.ballMat, MAXO);
    this.balls.setColorAt(0, _c.set(COLORS.idle));
    this.balls.castShadow = true;
    this.plateGeo = new THREE.PlaneGeometry(1, 1);
    const attr = (geo, name, size) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(MAXO * size), size); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); return a; };
    this.aUv = attr(this.plateGeo, 'aUv', 4); this.aLab = attr(this.plateGeo, 'aLab', 4);
    this.blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); this.blank.needsUpdate = true;
    this.plateMat = labelMaterial(this.blank, '#' + this.ink.getHexString(), COLORS.coral);
    this.plates = new THREE.InstancedMesh(this.plateGeo, this.plateMat, MAXO); this.plates.renderOrder = 3;
    for (const m of [this.balls, this.plates]) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(m); }
    this.objs = []; this.spheres = [];
    for (let i = 0; i < MAXO; i++) this.objs.push({ i, on: false, x: 0, y: 0, z: 0, r: 0, plate: { x: 0, y: 0, z: 0, w: 0, h: 0 }, uv: [0, 0, 0, 0], state: 'idle', t: 9, popT: 9, burst: false, col: new THREE.Color(COLORS.idle), want: new THREE.Color(COLORS.idle) });
    this.basis = { right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), back: new THREE.Vector3(0, 0, 1) };
    this.atlases = new Map(); this.time = 0;
    this._proj = []; for (let i = 0; i < MAXO; i++) this._proj.push({ i, kind: 'ball', cx: 0, cy: 0, r: 0, label: { x: 0, y: 0, w: 0, h: 0 } });
    scene?.add(this.group);
  }
  setInk(c) { this.ink.set(c); this.plateMat.userData.u.uInk.value.copy(this.ink); }

  // one small atlas: a label is a dark-glass plate with its Chinese big (and its English small, when there is one)
  atlas(key, labels) {
    if (this.atlases.has(key)) return this.atlases.get(key);
    const cells = labels.map((l) => ({ key: labelKey(l), w: 384, h: 160, draw: (x, X, Y, w, h) => {
      glass(x, X + 4, Y + 4, w - 8, h - 8, h * 0.3, 'rgba(255,255,255,0.2)', 4);
      x.textAlign = 'center';
      if (l.en) { fitFont(x, l.zh, 800, 70, 44, w * 0.86); x.fillStyle = TEXT; x.fillText(l.zh, X + w / 2, Y + h * 0.52); fitFont(x, l.en, 600, 46, 34, w * 0.86); x.fillStyle = MUTED; x.fillText(l.en, X + w / 2, Y + h * 0.86); }
      else { fitFont(x, l.zh, 800, 84, 50, w * 0.86); x.fillStyle = TEXT; x.fillText(l.zh, X + w / 2, Y + h * 0.66); }
    } }));
    const A = makeAtlas(cells, { maxW: 800 });
    A.box = new Map(labels.map((l) => [labelKey(l), { w: 384, h: 160 }]));
    this.atlases.set(key, A);
    return A;
  }
  freeAtlas(key) { const A = this.atlases.get(key); if (!A) return; if (this.plateMat.map === A.tex) this.plateMat.map = this.blank; A.dispose(); this.atlases.delete(key); }

  show(atlas, objs, basis) {
    if (basis) { this.basis.right.copy(basis.right); this.basis.up.copy(basis.up); this.basis.back.copy(basis.back); }
    this.plateMat.map = atlas ? atlas.tex : this.blank;
    this.spheres.length = 0;
    objs.forEach((o, k) => {
      const s = this.objs[k];
      s.on = true; s.x = o.x; s.y = o.y; s.z = o.z; s.r = o.r; Object.assign(s.plate, o.plate); s.key = o.key;
      s.uv = (atlas && atlas.uv.get(o.key)) || [0, 0, 0, 0];
      s.state = 'idle'; s.burst = false; s.popT = this.reduced ? 9 : -0.08 * k; s.t = 0;
      s.col.set(COLORS.idle); s.want.set(COLORS.idle);
      this.spheres.push({ x: o.x, y: o.y, z: o.z, r: o.r, target: o.i ?? k, active: true });
    });
    for (let k = objs.length; k < MAXO; k++) this.objs[k].on = false;
    this.n = objs.length;
    this.balls.count = this.plates.count = this.n;
    this.group.visible = true;
  }
  state(i, s) {
    const o = this.objs[i]; if (!o) return;
    o.state = s;
    o.want.set(s === 'coral' ? COLORS.coral : s === 'right' ? '#' + this.ink.getHexString() : s === 'dim' ? COLORS.dim : COLORS.idle);
  }
  burst(i) { const o = this.objs[i]; if (!o) return; o.burst = true; if (this.spheres[i]) this.spheres[i].active = false; }
  out() { for (const o of this.objs) if (o.on) { o.state = 'dim'; o.popT = Math.min(o.popT, 1); o.leaving = 0; } this._leaving = true; }
  hide() { this.group.visible = false; this.n = 0; this.balls.count = this.plates.count = 0; this.spheres.length = 0; this._leaving = false; for (const o of this.objs) { o.on = false; o.leaving = undefined; } }
  centre(i, out) { const o = this.objs[i]; return out.set(o.x, o.y, o.z); }

  update(dt) {
    if (!this.group.visible) return;
    this.time += dt;
    const B = this.basis;
    _m.makeBasis(_x.copy(B.right), _y.copy(B.up), _z.copy(B.back));
    _q.setFromRotationMatrix(_m);
    let gone = this._leaving;
    for (let k = 0; k < this.n; k++) {
      const o = this.objs[k];
      o.popT += dt;
      if (o.leaving != null) o.leaving += dt;
      let sc = this.reduced ? 1 : pop(Math.min(1, o.popT / 0.4));
      if (o.burst) sc = 0.0001;
      if (o.leaving != null) { sc *= Math.max(0, 1 - o.leaving / 0.25); if (o.leaving < 0.25) gone = false; }
      o.col.lerp(o.want, Math.min(1, dt * 10));
      const wob = this.reduced ? 0 : Math.sin(this.time * 2.2 + k * 1.7) * 0.05;
      _m.compose(_p.set(o.x, o.y + wob, o.z), _q, _s.set(o.r * sc, o.r * sc, o.r * sc));
      this.balls.setMatrixAt(k, _m); this.balls.setColorAt(k, o.col);
      _m.compose(_p.set(o.plate.x, o.plate.y + wob, o.plate.z), _q, _s.set(o.plate.w * sc, o.plate.h * sc, 1));
      this.plates.setMatrixAt(k, _m);
      this.aUv.setXYZW(k, o.uv[0], o.uv[1], o.uv[2], o.uv[3]);
      this.aLab.setXYZW(k, o.burst ? 0 : 1, o.state === 'right' ? 1 : 0, o.state === 'coral' ? 1 : 0, o.plate.w / Math.max(1e-3, o.plate.h));
    }
    this.balls.instanceMatrix.needsUpdate = true; if (this.balls.instanceColor) this.balls.instanceColor.needsUpdate = true;
    this.plates.instanceMatrix.needsUpdate = true; this.aUv.needsUpdate = true; this.aLab.needsUpdate = true;
    if (gone) this.hide();
  }

  project(camera, W, H) {
    const out = this._proj;
    for (let k = 0; k < MAXO; k++) {
      const o = this.objs[k], P = out[k];
      if (!o.on || o.burst || k >= this.n) { P.off = true; continue; }
      P.off = false;
      _p.set(o.x, o.y, o.z).project(camera);
      P.cx = (_p.x + 1) / 2 * W; P.cy = (1 - _p.y) / 2 * H;
      _s.set(o.x, o.y, o.z).addScaledVector(this.basis.right, o.r).project(camera);
      P.r = Math.abs((_s.x - _p.x) / 2 * W);
      _p.set(o.plate.x, o.plate.y, o.plate.z).project(camera);
      _s.set(o.plate.x, o.plate.y, o.plate.z).addScaledVector(this.basis.right, o.plate.w / 2).addScaledVector(this.basis.up, o.plate.h / 2).project(camera);
      const hw = Math.abs((_s.x - _p.x) / 2 * W), hh = Math.abs((_s.y - _p.y) / 2 * H), cx = (_p.x + 1) / 2 * W, cy = (1 - _p.y) / 2 * H;
      P.label.x = cx - hw; P.label.y = cy - hh; P.label.w = hw * 2; P.label.h = hh * 2;
    }
    return out.slice(0, this.n);
  }
  warm(renderer, camera, target = this.scene) {
    const v = this.group.visible, b = this.balls.count, p = this.plates.count;
    this.group.visible = true; this.balls.count = this.plates.count = 1;
    try { return renderer.compileAsync ? renderer.compileAsync(this.group, camera, target || null) : Promise.resolve(renderer.compile(this.group, camera)); }
    finally { this.group.visible = v; this.balls.count = b; this.plates.count = p; }
  }
  dispose() {
    this.scene?.remove(this.group);
    for (const k of [...this.atlases.keys()]) this.freeAtlas(k);
    this.balls.geometry.dispose(); this.plateGeo.dispose(); this.ballMat.dispose(); this.plateMat.dispose(); this.blank.dispose();
  }
}

// play-1's pick.js rule for balls: the disc and its label plate, raised to minHit and grown by slop; nearest wins
export function pickTarget(x, y, projected, o = {}) {
  const slop = o.slop ?? 16, min = o.minHit ?? LEARN.ui.hit;
  let best = -1, bd = Infinity;
  (projected || []).forEach((p, k) => {
    if (!p || p.off) return;
    const r = Math.max(p.r, min / 2) + slop, dc = Math.hypot(x - p.cx, y - p.cy);
    let inside = dc <= r, d = Math.max(0, dc - p.r);
    if (p.label) {
      const L = p.label, w = Math.max(L.w, min), h = Math.max(L.h, min), gx = L.x + L.w / 2 - w / 2 - slop, gy = L.y + L.h / 2 - h / 2 - slop;
      if (!inside) inside = x >= gx && x <= gx + w + slop * 2 && y >= gy && y <= gy + h + slop * 2;
      d = Math.min(d, Math.hypot(Math.max(L.x - x, 0, x - (L.x + L.w)), Math.max(L.y - y, 0, y - (L.y + L.h))));
    }
    if (inside && d < bd) { bd = d; best = p.i ?? k; }
  });
  return best;
}
