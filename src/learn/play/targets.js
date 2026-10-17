// 题即玩法 — the question objects themselves (docs/PLAY.md §3 M1, §7): ink balls with a label plate, or wide ink banner
// planks with the label on their face. Everything procedural (an icosahedron sphere, a rounded box, a quad) with
// INKWAVE's own ink look — the glossy clearcoat of the ink rounds (weapons.js makeBlobMaterial: roughness .12,
// clearcoat 1, a rim lit in the ink's own colour), a slow wobble so it reads as liquid. Neutral grey ink until it is hit:
// a right hit bursts it in her team ink, a wrong one turns it coral (#f08a7a — never the other team's colour, PLAY §1.6).
//
// Draw calls: balls (InstancedMesh, ≤ 4) · plates (InstancedMesh, ≤ 4: a ball's label, or a banner's face) · planks
// (InstancedMesh, ≤ 3) · the halo round the right ball after a miss (InstancedMesh, 1) — at most 4 with the gate's atlas.
// Every per-object value lives in preallocated slots and instance attributes: no allocation per frame.
//
//   const T = new PlayTargets({ scene, renderer, camera })   builds the meshes and compiles their programs now (the
//                                                             level load: renderer.compileAsync, as texlib / showcase do)
//   T.atlas(key, labels) → { tex, uv: Map(labelKey → [u0, v0, u1, v1]), box: Map(labelKey → { w, h }) }   one CanvasTexture
//       per gate, uploaded at once (renderer.initTexture) — called 2 gates ahead; T.freeAtlas(key) when the gate opens
//   T.show(atlas, objs, basis, opts)   objs: [{ i, kind: 'ball' | 'banner', key (labelKey), x, y, z, r | w, h, plate: { x, y, z, w, h } }]
//                                      basis: { right, up, back } (unit vectors: the plates face `back`, towards the camera)
//   T.state(i, 'idle' | 'coral' | 'right' | 'dim') · T.burst(i) (hidden: the caller plays the explosion) · T.out() · T.hide()
//   T.update(dt) · T.spheres (the hit shapes, for hit.js ShotTargets) · T.centre(i, out) · T.project(camera, W, H) → pick.js's shape
//   T.dispose()
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { drawLabelAtlas } from './atlas.js';
import { plankSpheres } from './hit.js';

const MAXO = 4, MAXB = 3, NOUV = [0, 0, 0, 0];
export const COLORS = { idle: '#a39db8', coral: '#f08a7a', ink: '#ff8a14' };
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3(), _v = new THREE.Vector3();
const _rot = new THREE.Matrix4(), _c = new THREE.Color();
const ease = (k) => 1 - Math.pow(1 - k, 3);
// a spring-ish pop: 0 → 1.08 → 1 over the stagger (no overshoot when reduced)
const pop = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : 1 + Math.sin(k * Math.PI) * 0.12 * (1 - k) - Math.pow(1 - k, 3));

function inkMaterial() {
  const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.14, clearcoat: 1, clearcoatRoughness: 0.05, emissive: 0x000000, envMapIntensity: 1.15 });
  const U = { uTime: { value: 0 }, uInk: { value: new THREE.Color(COLORS.ink) } };
  mat.userData.u = U;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = U.uTime; sh.uniforms.uInk = U.uInk;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float uTime;
        attribute vec4 aPlay;   // x wobble, y phase, z glow (the right one's rim in its colour), w unused
        varying vec4 vPlay;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vPlay = aPlay;
        {
          float w = aPlay.x * (0.05 * sin(uTime * 2.1 + aPlay.y + 3.1 * position.x + 2.3 * position.y) + 0.035 * sin(uTime * 3.3 + 1.7 * aPlay.y - 2.9 * position.z + 1.9 * position.y));
          transformed += normal * w;
        }`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uInk;
        varying vec4 vPlay;`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          // the ink's own rim light (the rounds' look); the right one after a miss rims in her ink
          float iwRim = pow(1.0 - saturate(dot(normal, normalize(vViewPosition))), 3.0);
          vec3 iwCol = mix(vColor.rgb, uInk, saturate(vPlay.z));
          totalEmissiveRadiance += iwCol * (0.14 + 0.5 * iwRim) * (1.0 + 1.6 * vPlay.z);
        }`);
  };
  mat.customProgramCacheKey = () => 'iw-play-ink-2';
  return mat;
}

function plateMaterial() {
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const U = { uOutline: { value: new THREE.Color(COLORS.ink) }, uCoral: { value: new THREE.Color(COLORS.coral) } };
  mat.userData.u = U;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uOutline = U.uOutline; sh.uniforms.uCoral = U.uCoral;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aUv;      // the label's rect in the atlas: u0 v0 u1 v1
        attribute vec4 aState;   // x opacity, y outline (her ink), z coral, w the plate's aspect (w / h)
        varying vec4 vState; varying vec2 vLocal;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vLocal = uv; vState = aState;
        #ifdef USE_MAP
          vMapUv = mix(aUv.xy, aUv.zw, uv);
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uOutline; uniform vec3 uCoral;
        varying vec4 vState; varying vec2 vLocal;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          // coral wash over a wrong one's dark ground (its letters stay light: still readable); a ring in her ink round
          // the right one (the plate's rounded rectangle)
          float lum = max(diffuseColor.r, max(diffuseColor.g, diffuseColor.b));
          float ground = 1.0 - smoothstep(0.3, 0.65, lum);
          diffuseColor.rgb = mix(diffuseColor.rgb, uCoral, 0.5 * ground * vState.z * step(0.02, diffuseColor.a));
          vec2 hs = vec2(vState.w * 0.5, 0.5), p = (vLocal - 0.5) * vec2(vState.w, 1.0);
          float r = 0.3; vec2 q = abs(p) - hs + r;
          float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
          float ring = smoothstep(-0.13, -0.09, d) * (1.0 - smoothstep(-0.02, 0.0, d));
          diffuseColor.rgb = mix(diffuseColor.rgb, uOutline, ring * vState.y);
          diffuseColor.a = max(diffuseColor.a, ring * vState.y);
          diffuseColor.a *= vState.x;
        }`);
  };
  mat.customProgramCacheKey = () => 'iw-play-plate-2';
  return mat;
}

export class PlayTargets {
  constructor({ scene, renderer, camera, reduced = false } = {}) {
    this.scene = scene; this.renderer = renderer; this.camera = camera; this.reduced = reduced;
    this.group = new THREE.Group(); this.group.name = 'play-targets';
    this.ballGeo = new THREE.IcosahedronGeometry(1, 4);
    this.plankGeo = new RoundedBoxGeometry(1, 1, 1, 3, 0.16);
    this.plateGeo = new THREE.PlaneGeometry(1, 1);
    this.inkMat = inkMaterial(); this.plateMat = plateMaterial();
    this.haloMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(COLORS.ink), side: THREE.BackSide, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false });
    const inst = (geo, mat, n, attrs) => {
      const m = new THREE.InstancedMesh(geo, mat, n);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      m.count = 0; m.frustumCulled = false;
      for (const [name, size] of attrs) { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); geo.setAttribute(name, a); m[name] = a; }
      this.group.add(m);
      return m;
    };
    // (balls and planks share the ink material: their own geometries carry their own instance attributes)
    this.balls = inst(this.ballGeo, this.inkMat, MAXO, [['aPlay', 4]]);
    this.planks = inst(this.plankGeo, this.inkMat, MAXB, [['aPlay', 4]]);
    this.plates = inst(this.plateGeo, this.plateMat, MAXO, [['aUv', 4], ['aState', 4]]);
    this.halo = new THREE.InstancedMesh(this.ballGeo, this.haloMat, 1); this.halo.count = 0; this.halo.frustumCulled = false; this.halo.renderOrder = 2;
    this.group.add(this.halo);
    for (const m of [this.balls, this.planks]) { for (let i = 0; i < m.instanceMatrix.count; i++) m.setColorAt(i, _c.set(COLORS.idle)); m.instanceColor.setUsage(THREE.DynamicDrawUsage); }
    this.plates.renderOrder = 3;
    // per object: where it sits, how big, its state, its animation clock (preallocated, reused for every question)
    this.slots = Array.from({ length: MAXO }, () => ({
      on: false, kind: 'ball', key: '', pos: new THREE.Vector3(), r: 0.5, w: 1, h: 0.5, d: 0.14,
      plate: { pos: new THREE.Vector3(), w: 1, h: 0.3 }, uv: NOUV, state: 'idle', t: 0, delay: 0, outAt: -1, gone: false, col: new THREE.Color(COLORS.idle), want: new THREE.Color(COLORS.idle), coral: 0, outline: 0, glow: 0,
    }));
    this.n = 0; this.kind = 'ball'; this.time = 0; this.anim = false;
    this.basis = { right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), back: new THREE.Vector3(0, 0, 1) };
    this.spheres = Array.from({ length: 16 }, () => ({ x: 0, y: 0, z: 0, r: 0, target: -1, active: false }));
    this.nSpheres = 0;
    this._proj = Array.from({ length: MAXO }, () => ({ i: 0, kind: 'ball', cx: 0, cy: 0, r: 0, x: 0, y: 0, w: 0, h: 0, label: { x: 0, y: 0, w: 0, h: 0 }, off: true }));
    this.atlases = new Map();
    this.inkColor = new THREE.Color(COLORS.ink);
    this.group.visible = false;
    scene.add(this.group);
    this.warm();
  }

  // compile the ink / plate / halo programs now, under the level's fade (texlib.js / showcase.js do the same): one
  // instance of each, off to the side, then back to none
  warm() {
    if (!this.renderer || !this.camera) return null;
    // (the plates always have a map — a 1 × 1 blank until a gate's atlas — so a map / no-map switch never makes a new program)
    if (!this._blank) { this._blank = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); this._blank.needsUpdate = true; }
    if (!this.plateMat.map) this.plateMat.map = this._blank;
    for (const m of [this.balls, this.planks, this.plates, this.halo]) { m.count = 1; m.setMatrixAt(0, _m.makeTranslation(0, -999, 0)); }
    this.group.visible = true;
    let p = null;
    // compileAsync compiles synchronously first (main.js notes it), so the programs exist when this returns
    try { p = this.renderer.compileAsync ? this.renderer.compileAsync(this.group, this.camera, this.scene) : (this.renderer.compile(this.group, this.camera, this.scene), Promise.resolve()); }
    catch (e) { console.warn('[play] warm', e); }
    for (const m of [this.balls, this.planks, this.plates, this.halo]) m.count = 0;
    this.group.visible = false;
    this.warmed = p;
    if (p && p.catch) p.catch((e) => console.warn('[play] warm', e));
    return p;
  }

  setInk(color) { this.inkColor.copy(color); this.haloMat.color.copy(color); this.plateMat.userData.u.uOutline.value.copy(color); this.inkMat.userData.u.uInk.value.copy(color); }

  // ---------------------------------------------------------------------------------------------- the gate's atlas
  atlas(key, labels) {
    let A = this.atlases.get(key);
    if (A) return A;
    if (!labels.length || typeof document === 'undefined') return null;
    const drawn = drawLabelAtlas(labels);
    const tex = new THREE.CanvasTexture(drawn.canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    try { this.renderer?.initTexture?.(tex); } catch (e) { /* uploaded on first use instead */ }
    const uv = new Map(), box = new Map();
    labels.forEach((l, i) => { uv.set(l.key, drawn.uv[i]); box.set(l.key, { w: l.w, h: l.h }); });
    A = { key, tex, uv, box, w: drawn.w, h: drawn.h, scale: drawn.scale, n: labels.length };
    this.atlases.set(key, A);
    return A;
  }
  freeAtlas(key) {
    const A = this.atlases.get(key); if (!A) return;
    if (this.plateMat.map === A.tex) this.plateMat.map = this._blank;
    A.tex.dispose(); A.tex.image = null; this.atlases.delete(key);
  }

  // ---------------------------------------------------------------------------------------------- show / state
  show(A, objs, basis, opts = {}) {
    this.n = Math.min(objs.length, MAXO);
    this.kind = objs[0] && objs[0].kind === 'banner' ? 'banner' : 'ball';
    this.plateMat.map = A ? A.tex : this._blank || this.plateMat.map;
    this.basis.right.copy(basis.right); this.basis.up.copy(basis.up); this.basis.back.copy(basis.back);
    _rot.makeBasis(this.basis.right, this.basis.up, this.basis.back); _q.setFromRotationMatrix(_rot);
    this.quat = (this.quat || new THREE.Quaternion()).copy(_q);
    const stagger = this.reduced ? 0 : 0.07;
    for (let k = 0; k < MAXO; k++) {
      const S = this.slots[k], o = objs[k];
      // (opts.keep: the same objects laid out again — run.js, the lens came to rest elsewhere — their pop-in goes on)
      const kept = !!(opts.keep && S.on && !S.gone && o && S.key === o.key);
      S.on = !!o && k < this.n; S.gone = false; S.outAt = -1;
      if (!kept) { S.t = 0; S.delay = k * stagger + (opts.delay || 0); }
      if (!S.on) continue;
      S.kind = o.kind; S.key = o.key; S.pos.set(o.x, o.y, o.z);
      S.r = o.r || 0.5; S.w = o.w || 1; S.h = o.h || 0.5; S.d = Math.max(0.12, (o.h || 0.5) * 0.22);
      S.plate.pos.set(o.plate.x, o.plate.y, o.plate.z); S.plate.w = o.plate.w; S.plate.h = o.plate.h;
      S.state = 'idle'; S.col.set(COLORS.idle); S.want.set(COLORS.idle); S.coral = 0; S.outline = 0; S.glow = 0;
      S.uv = (A && A.uv.get(o.key)) || NOUV;
    }
    this.halo.count = 0;
    this.group.visible = true;
    this.anim = true;
    this._spheres();
    this._write();
  }

  state(i, s) {
    const S = this.slots[i]; if (!S || !S.on) return;
    S.state = s;
    // (the right one keeps its grey ink and gets her ink round it — the halo, the plate's ring, its rim — so it never
    // reads like the coral one when her team colour is an orange)
    S.want.set(s === 'coral' ? COLORS.coral : COLORS.idle);
    this.anim = true;
  }
  // the hit one goes at once (the caller's explosion takes its place); the others drain away
  burst(i) { const S = this.slots[i]; if (S && S.on) { S.gone = true; this.anim = true; this._spheres(); this._write(); } }
  // (draining objects are no longer anything to hit)
  out(delay = 0) { for (const S of this.slots) if (S.on && S.outAt < 0) S.outAt = this.time + delay; for (const o of this.spheres) o.active = false; this.nSpheres = 0; this.anim = true; }
  hide() {
    for (const S of this.slots) S.on = false;
    for (const o of this.spheres) o.active = false;
    this.n = 0; this.nSpheres = 0; this.halo.count = 0;
    this.balls.count = this.planks.count = this.plates.count = 0;
    this.group.visible = false;
  }
  get active() { return this.n > 0 && this.slots.some((S) => S.on && !S.gone && S.outAt < 0); }
  _outK(S) { return S.outAt < 0 ? 0 : Math.max(0, this.time - S.outAt); }

  // the hit shapes (a ball one sphere, a plank a row of them) for hit.js; only objects still standing
  _spheres() {
    let k = 0;
    for (let i = 0; i < MAXO; i++) {
      const S = this.slots[i];
      if (!S.on || S.gone) continue;
      if (S.kind === 'ball') { const o = this.spheres[k++]; o.x = S.pos.x; o.y = S.pos.y; o.z = S.pos.z; o.r = S.r; o.target = i; o.active = true; }
      else k = plankSpheres(S.pos, this.basis.right, S.w, S.h, i, this.spheres, k);
    }
    for (let j = k; j < this.spheres.length; j++) this.spheres[j].active = false;
    this.nSpheres = k;
  }
  centre(i, out) { const S = this.slots[i]; return S ? out.copy(S.pos) : out; }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    this.time += dt;
    this.inkMat.userData.u.uTime.value = this.time;
    if (!this.n || !this.anim) return;
    let busy = false;
    for (let i = 0; i < MAXO; i++) {
      const S = this.slots[i]; if (!S.on) continue;
      S.t += dt;
      const ok = this._outK(S);
      const k = 1 - Math.exp(-dt * 10);
      S.col.lerp(S.want, k);
      const wantCoral = S.state === 'coral' ? 1 : 0, wantOut = S.state === 'right' ? 1 : 0;
      S.coral += (wantCoral - S.coral) * k; S.outline += (wantOut - S.outline) * k; S.glow += (wantOut - S.glow) * k;
      if (S.t < S.delay + 0.5 || S.outAt >= 0 || Math.abs(S.coral - wantCoral) > 0.01 || Math.abs(S.outline - wantOut) > 0.01 || Math.abs(S.col.r - S.want.r) + Math.abs(S.col.g - S.want.g) + Math.abs(S.col.b - S.want.b) > 0.003) busy = true;
      if (ok >= 0.4) S.on = false;
    }
    let any = false; for (let i = 0; i < MAXO; i++) if (this.slots[i].on) any = true;
    if (!any) { this.hide(); return; }
    this._write();
    this.anim = busy;
  }

  _scaleOf(S) {
    if (S.gone) return 0;
    let s = this.reduced ? (S.t >= S.delay ? 1 : 0) : pop((S.t - S.delay) / 0.38);
    const ok = this._outK(S);
    if (ok > 0) s *= 1 - ease(Math.min(1, ok / 0.35));
    return Math.max(0, s);
  }

  _write() {
    let nb = 0, np = 0, nl = 0;
    const q = this.quat || _q.identity();
    for (let i = 0; i < MAXO; i++) {
      const S = this.slots[i];
      if (!S.on) continue;
      const s = this._scaleOf(S);
      if (S.kind === 'ball') {
        _s.setScalar(S.r * s);
        _m.compose(S.pos, q, _s); this.balls.setMatrixAt(nb, _m);
        this.balls.setColorAt(nb, S.col);
        this.balls.aPlay.setXYZW(nb, this.reduced ? 0.35 : 1, i * 1.7, S.glow, 0);
        S.slot = nb++;
        if (S.outline > 0.02 && !S.gone) { _s.setScalar(S.r * s * (1.08 + 0.05 * S.outline)); _m.compose(S.pos, q, _s); this.halo.setMatrixAt(0, _m); this.haloMat.opacity = 0.85 * S.outline; this.halo.count = 1; this.halo.instanceMatrix.needsUpdate = true; }
      } else {
        _s.set(S.w * s, S.h * s, S.d * s);
        _m.compose(S.pos, q, _s); this.planks.setMatrixAt(np, _m);
        this.planks.setColorAt(np, S.col);
        this.planks.aPlay.setXYZW(np, 0, i * 1.7, S.glow, 0);
        S.slot = np++;
      }
      // the plate: a ball's below it, a banner's on the plank's face (a hair in front of it)
      const sp = s;
      _p.copy(S.kind === 'ball' ? S.plate.pos : S.pos);
      if (S.kind !== 'ball') _p.addScaledVector(this.basis.back, S.d * 0.5 * s + 0.012);
      _s.set(S.plate.w * sp, S.plate.h * sp, 1);
      _m.compose(_p, q, _s); this.plates.setMatrixAt(nl, _m);
      this.plates.aState.setXYZW(nl, S.gone ? 0 : Math.min(1, s * 1.4), S.outline, S.coral, S.plate.w / Math.max(1e-3, S.plate.h));
      this.plates.aUv.setXYZW(nl, S.uv[0], S.uv[1], S.uv[2], S.uv[3]);
      nl++;
    }
    this.balls.count = nb; this.planks.count = np; this.plates.count = nl;
    let ring = false; for (let i = 0; i < MAXO; i++) { const S = this.slots[i]; if (S.on && S.outline > 0.02 && !S.gone) ring = true; }
    if (!ring) this.halo.count = 0;
    this.balls.instanceMatrix.needsUpdate = true; this.planks.instanceMatrix.needsUpdate = true; this.plates.instanceMatrix.needsUpdate = true;
    if (this.balls.instanceColor) this.balls.instanceColor.needsUpdate = true;
    if (this.planks.instanceColor) this.planks.instanceColor.needsUpdate = true;
    this.balls.aPlay.needsUpdate = true; this.planks.aPlay.needsUpdate = true; this.plates.aState.needsUpdate = true; this.plates.aUv.needsUpdate = true;
  }

  // ---------------------------------------------------------------------------------------------- on screen
  // each object as it is on the screen now (CSS px): a ball's disc + its plate, a plank's box — pick.js's shape
  project(camera, W, H) {
    const out = this._proj;
    for (let i = 0; i < MAXO; i++) {
      const S = this.slots[i], P = out[i];
      P.i = i; P.off = !S.on || S.gone || S.outAt >= 0;
      if (P.off) continue;
      if (S.kind === 'ball') {
        _v.copy(S.pos).project(camera); const vis = _v.z < 1 && _v.z > -1;
        P.kind = 'ball'; P.cx = (_v.x + 1) / 2 * W; P.cy = (1 - _v.y) / 2 * H;
        _p.copy(S.pos).addScaledVector(this.basis.right, S.r).project(camera);
        P.r = Math.abs((_p.x + 1) / 2 * W - P.cx);
        this._rectOf(S.plate.pos, S.plate.w, S.plate.h, camera, W, H, P.label);
        if (!vis) P.off = true;
      } else {
        P.kind = 'banner';
        this._rectOf(S.pos, S.w, S.h, camera, W, H, P);
        if (!(P.w > 0)) P.off = true;
      }
    }
    return out;
  }
  _rectOf(c, w, h, camera, W, H, out) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity, ok = true;
    for (let k = 0; k < 4; k++) {
      _v.copy(c).addScaledVector(this.basis.right, (k & 1 ? 0.5 : -0.5) * w).addScaledVector(this.basis.up, (k & 2 ? 0.5 : -0.5) * h);
      _v.project(camera);
      if (!(_v.z < 1 && _v.z > -1)) ok = false;
      const x = (_v.x + 1) / 2 * W, y = (1 - _v.y) / 2 * H;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    out.x = x0; out.y = y0; out.w = ok ? x1 - x0 : 0; out.h = ok ? y1 - y0 : 0;
    return out;
  }

  dispose() {
    this.scene.remove(this.group);
    for (const A of this.atlases.values()) A.tex.dispose();
    this.atlases.clear();
    this._blank?.dispose();
    for (const g of [this.ballGeo, this.plankGeo, this.plateGeo]) g.dispose();
    for (const m of [this.inkMat, this.plateMat, this.haloMat]) m.dispose();
    for (const m of [this.balls, this.planks, this.plates, this.halo]) m.dispose?.();
  }
}
