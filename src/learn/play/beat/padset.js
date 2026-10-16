// play-3 — a few loose spawn-style pads (the echo booth's floor, the check-in pad): the beat stage's pad base + face
// (mats.js), one InstancedMesh each, a state per pad. 2 draw calls for all of them.
//
//   const S = new PadSet({ scene, max }) · S.add({ x, y, z, r, color, glyph }) → pad · S.pulse(pad, strength)
//   S.set(pad, { color, glow, ink, streak }) · S.update(dt, t, beat = 0) · S.clear() · S.warm(renderer, camera) · S.dispose()
import * as THREE from 'three';
import { padBaseGeometry, padFaceGeometry, padFaceMaterial, padBaseMaterial } from './mats.js';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3();
const easeOutBack = (k) => { const c = 1.70158; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };

export class PadSet {
  constructor({ scene, max = 4, reduced = false } = {}) {
    this.scene = scene; this.max = max; this.reduced = reduced;
    this.group = new THREE.Group(); this.group.name = 'play-pads';
    this.baseMat = padBaseMaterial(); this.faceMat = padFaceMaterial();
    this.faceGeo = padFaceGeometry();
    this.base = new THREE.InstancedMesh(padBaseGeometry(), this.baseMat, max);
    this.face = new THREE.InstancedMesh(this.faceGeo, this.faceMat, max);
    for (const m of [this.base, this.face]) { m.count = 0; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(m); }
    this.base.receiveShadow = true;
    const attr = (name, size) => { const a = new THREE.InstancedBufferAttribute(new Float32Array(max * size), size); a.setUsage(THREE.DynamicDrawUsage); this.faceGeo.setAttribute(name, a); return a; };
    this.aCol = attr('aCol', 3); this.aPad = attr('aPad', 4); this.aSel = attr('aSel', 4);
    this.pads = [];
    scene?.add(this.group);
  }
  add({ x = 0, y = 0, z = 0, r = 0.9, color = '#a39db8', glyph = 5, glow = 0.7 } = {}) {
    if (this.pads.length >= this.max) return null;
    const p = { i: this.pads.length, x, y, z, r, col: new THREE.Color(color), glow, glyph, ink: 0, streak: 0, wave: 0, waveT: 3, popT: this.reduced ? 9 : 0, ring: -1 };
    this.pads.push(p);
    this.base.count = this.face.count = this.pads.length;
    return p;
  }
  set(p, o = {}) { if (!p) return; if (o.color) p.col.set(o.color); if (o.glow != null) p.glow = o.glow; if (o.ink != null) p.ink = o.ink; if (o.streak != null) p.streak = o.streak; if (o.ring != null) p.ring = o.ring; }
  pulse(p, strength = 1) { if (!p) return; p.wave = Math.max(p.wave, strength); p.waveT = 0; }
  clear() { this.pads.length = 0; this.base.count = this.face.count = 0; }
  update(dt, t, beat = 0) {
    this.faceMat.uniforms.uTime.value = t; this.faceMat.uniforms.uBeat.value = beat;
    for (let i = 0; i < this.pads.length; i++) {
      const p = this.pads[i];
      p.popT += dt; p.wave = Math.max(0, p.wave - dt * 0.9); p.waveT = Math.min(3, p.waveT + dt); p.streak = Math.max(0, p.streak - dt * 0.5);
      const k = p.popT >= 0.5 ? 1 : p.popT <= 0 ? 0.001 : easeOutBack(p.popT / 0.5), sc = Math.max(0.001, k) * p.r;
      _q.identity();
      _m.compose(_p.set(p.x, p.y, p.z), _q, _s.set(sc, 1, sc)); this.base.setMatrixAt(i, _m);
      _m.compose(_p.set(p.x, p.y + 0.078, p.z), _q, _s.set(sc, 1, sc)); this.face.setMatrixAt(i, _m);
      this.aCol.setXYZ(i, p.col.r, p.col.g, p.col.b);
      this.aPad.setXYZW(i, p.glow, p.wave, p.waveT, p.ring);
      this.aSel.setXYZW(i, p.ink, p.glyph, p.streak, k);
    }
    this.base.instanceMatrix.needsUpdate = true; this.face.instanceMatrix.needsUpdate = true;
    this.aCol.needsUpdate = this.aPad.needsUpdate = this.aSel.needsUpdate = true;
  }
  warm(renderer, camera, target = this.scene) {
    const bc = this.base.count, fc = this.face.count;
    this.base.count = this.face.count = Math.max(1, bc);
    try { return renderer.compileAsync ? renderer.compileAsync(this.group, camera, target || null) : Promise.resolve(renderer.compile(this.group, camera)); }
    finally { this.base.count = bc; this.face.count = fc; }
  }
  dispose() { this.scene?.remove(this.group); this.faceGeo.dispose(); this.baseMat.dispose(); this.faceMat.dispose(); }
}
