// 墨浪跑酷 — one row on the road (docs/PLAY.md §3 M2, §7): a Drip Curtain per lane (the `curtain` sub's sheet of falling
// ink — src/game/subs.js CURTAIN_FS, the same streaks and ragged foot — in neutral grey ink: no team owns it yet), a label
// board on each (label.js), and thin guide lines on the ink between the lanes for the run-in. States per curtain:
//   idle · pulse (the beat, M3) · right (it bursts into her ink: the caller fires fx.explosion + paint.flood and the sheet
//   drains away) · wrong (coral, soft: never the enemy's colour) · reveal (the right one glows when she missed it).
// Unlit, no shadows: no new lighting variants. One geometry for every sheet / board; materials are warmed at start.
import * as THREE from 'three';
import { G } from '../../../core/ctx.js';
import { at } from './track.js';
import { labelTexture } from './label.js';

// subs.js's Drip Curtain shader + four uniforms: uPulse (a beat kick), uCoral (0 → 1: the wrong curtain's soft coral),
// uGlow (the right one shown), uDrain (0 → 1: the sheet runs down into the ink after a burst)
const VS = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const FS = `
  uniform vec3 uColor; uniform vec3 uCoral; uniform float uTime; uniform float uLife; uniform float uPulse; uniform float uCoralK; uniform float uGlow; uniform float uDrain;
  varying vec2 vUv;
  float hash(float n){ return fract(sin(n * 91.3458) * 47453.5453); }
  void main(){
    float col = floor(vUv.x * 46.0);
    float speed = (1.4 + hash(col) * 1.2) * (1.0 - 0.55 * uCoralK);
    float y = vUv.y + uTime * speed * 0.55 + hash(col + 3.1);
    float streak = smoothstep(0.35, 0.0, abs(fract(y * 3.0) - 0.5) - 0.15);
    float sheet = 0.42 + 0.35 * streak;
    float edge = smoothstep(0.0, 0.08, vUv.x) * smoothstep(1.0, 0.92, vUv.x);
    float bottom = smoothstep(0.0, 0.12 + 0.06 * hash(col + 7.0), vUv.y);
    float drain = smoothstep(uDrain * 1.2 - 0.2 + hash(col + 11.0) * 0.2, uDrain * 1.2, 1.0 - vUv.y);
    float a = sheet * edge * bottom * (0.35 + 0.65 * uLife) * (1.0 - 0.45 * uCoralK) * (1.0 - drain * step(0.001, uDrain));
    vec3 base = mix(uColor, uCoral, uCoralK);
    vec3 c = mix(base * 0.7, base * 1.35 + 0.08, streak * 0.8 + vUv.y * 0.2);
    c += base * (0.35 * uPulse + 0.55 * uGlow);
    gl_FragColor = vec4(c, min(1.0, a * (1.0 + 0.35 * uPulse + 0.4 * uGlow)));
  }`;

export const CORAL = new THREE.Color('#f08a7a');
const GREY = new THREE.Color('#b9b2cc');
const _p = {}, _q = {};
let SHEET = null, BOARD = null;
const geos = () => { if (!SHEET) { SHEET = new THREE.PlaneGeometry(1, 1); SHEET.translate(0, 0.5, 0); BOARD = new THREE.PlaneGeometry(1, 1); } };

export function curtainMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: GREY.clone() }, uCoral: { value: CORAL.clone() }, uTime: { value: 0 }, uLife: { value: 1 }, uPulse: { value: 0 }, uCoralK: { value: 0 }, uGlow: { value: 0 }, uDrain: { value: 0 } },
    vertexShader: VS, fragmentShader: FS, transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
}

// row: { s, lanes, c, centers, labels: [{ en, zh }], banner, kind, D (lead distance) }; T: the track
export class RowView {
  constructor(row, T, opts = {}) {
    geos();
    this.row = row;
    this.group = new THREE.Group(); this.group.name = 'runner-row';
    this.curtains = [];
    this.mats = []; this.texs = []; this.geos = [];
    const laneW = opts.laneW ?? 1.5, gap = opts.gap ?? 0.5, w = laneW - gap, h = row.banner ? 2.55 : 2.35;
    at(T, row.s, _p);
    const yaw = Math.atan2(-_p.tx, -_p.tz);   // the sheets face back down the road, towards her
    const tags = row.tags || [];
    row.centers.forEach((off, i) => {
      const x = _p.x + _p.rx * off, z = _p.z + _p.rz * off;
      const gy = G.level ? G.level.groundHeight(x, z, _p.y + 1.4) : _p.y;
      const y = Number.isFinite(gy) && gy > _p.y - 1.5 ? gy : _p.y;
      const grp = new THREE.Group(); grp.position.set(x, y, z); grp.rotation.y = yaw;
      const mat = curtainMaterial(); this.mats.push(mat);
      const sheet = new THREE.Mesh(SHEET, mat); sheet.scale.set(w, h, 1); sheet.renderOrder = 2;
      const L = labelTexture({ ...row.labels[i], banner: row.banner, tag: tags[i] || '' }); this.texs.push(L);
      const bm = new THREE.MeshBasicMaterial({ map: L.tex, transparent: true, depthWrite: false, toneMapped: false }); this.mats.push(bm);
      const bw = laneW - (row.banner ? 0.06 : 0.14);   // (boards nearly as wide as the lane: the curtains below show the gaps)
      const board = new THREE.Mesh(BOARD, bm); board.scale.set(bw, bw * L.aspect, 1); board.position.set(0, h * 0.58 + (row.banner ? 0.1 : 0), 0.04); board.renderOrder = 3;
      grp.add(sheet, board);
      this.group.add(grp);
      this.curtains.push({ grp, sheet, board, mat, bm, state: 'idle', k: 0, glow: 0, drain: 0, x, y, z });
    });
    // guide lines on the ink between the lanes (and its two edges) over the run-in: where the gaps are
    this._lines(T, row, laneW);
    this.group.visible = false;
    this.show = 0;      // 0 → 1 fade-in
    this.fade = 1;      // 1 → 0 fade-out after she passes
    this.focus = -1;    // the lane she is lined up with (its curtain brightens a touch)
  }

  _lines(T, row, laneW) {
    const n = row.centers.length, offs = [];
    for (let i = 1; i < n; i++) offs.push(row.c + (i - n / 2) * laneW);
    // (over the straight run-in only: on the bend before it, lines a metre or two off the centre would fold over)
    const len = 6, half = 0.035, pos = [], idx = [];
    at(T, row.s, _p); const yaw0 = Math.atan2(_p.tx, _p.tz);
    let t0 = row.s - len;
    for (let t = row.s; t >= row.s - len; t -= 0.5) { at(T, t, _q); let da = Math.atan2(_q.tx, _q.tz) - yaw0; while (da > Math.PI) da -= Math.PI * 2; while (da < -Math.PI) da += Math.PI * 2; if (Math.abs(da) > 0.3) { t0 = t + 0.5; break; } }
    for (const off of offs) {
      const base = pos.length / 3;
      let k = 0;
      for (let t = t0; t <= row.s + 0.01; t += 0.5, k++) {
        at(T, t, _q);
        const cx = _q.x + _q.rx * off, cz = _q.z + _q.rz * off;
        const gy = G.level ? G.level.groundHeight(cx, cz, _q.y + 1.2) : _q.y;
        const y = (Number.isFinite(gy) && gy > _q.y - 1.5 ? gy : _q.y) + 0.05;
        pos.push(cx - _q.rx * half, y, cz - _q.rz * half, cx + _q.rx * half, y, cz + _q.rz * half);
        if (k) { const a = base + (k - 1) * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      }
    }
    if (!pos.length) return;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx);
    this.geos.push(g);
    this.lineMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    this.mats.push(this.lineMat);
    this.lines = new THREE.Mesh(g, this.lineMat); this.lines.renderOrder = 1;
    this.group.add(this.lines);
  }

  // per frame: t (game time), pulse 0..1 (the beat; 0 off the beat rows), dt
  update(t, pulse, dt) {
    const shown = this.group.visible;
    if (!shown) return;
    this.show = Math.min(1, this.show + dt * 3.2);
    const pop = this.show < 1 ? 1 + Math.sin(this.show * Math.PI) * 0.14 : 1;   // fade in + one little pop
    for (const c of this.curtains) {
      const u = c.mat.uniforms;
      u.uTime.value = t; u.uPulse.value = c.state === 'idle' ? pulse : 0;
      if (c.state === 'wrong') c.k = Math.min(1, c.k + dt * 4);
      if (c.state === 'reveal') c.glow = Math.min(1, c.glow + dt * 3);
      if (c.state === 'right') c.drain = Math.min(1, c.drain + dt * 1.8);
      const focus = this.focus === this.curtains.indexOf(c) && c.state === 'idle' ? 0.22 : 0;
      c.f = (c.f || 0) + (focus - (c.f || 0)) * Math.min(1, dt * 12);
      u.uCoralK.value = c.k; u.uGlow.value = c.glow * (0.75 + 0.25 * Math.sin(t * 8)) + c.f; u.uDrain.value = c.drain;
      u.uLife.value = this.show * this.fade;
      c.bm.opacity = this.show * this.fade * (c.state === 'right' ? Math.max(0, 1 - c.drain * 2.5) : c.state === 'wrong' ? 0.55 : 1);
      const s = (c.state === 'idle' ? 1 + pulse * 0.05 : 1) * pop;
      c.sheet.scale.y = (this.row.banner ? 2.55 : 2.35) * s;
    }
    if (this.lineMat) this.lineMat.opacity = 0.42 * this.show * this.fade * (1 + pulse * 0.6);
  }

  setVisible(v) { this.group.visible = v; }
  mark(i, state) { const c = this.curtains[i]; if (c) c.state = state; }
  pos(i, out) { const c = this.curtains[i]; return out.set(c.x, c.y + 1.1, c.z); }

  dispose() {
    this.group.parent?.remove(this.group);
    for (const m of this.mats) m.dispose();
    for (const L of this.texs) L.dispose();
    for (const g of this.geos) g.dispose();
  }
}

// Where she is: a swimming squid sinks into her own ink (and her ink is her colour), which is the point in a shooter and
// the problem in a runner — on a phone she has to see which lane she is in. A flat ring + chevron on the ink under her,
// white with a dark rim, turned to her heading (one CanvasTexture, drawn once).
export class HerMark {
  constructor() {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d');
    x.lineJoin = 'round';
    const ring = (col, w) => { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.arc(64, 64, 44, 0, Math.PI * 2); x.stroke(); };
    const chev = (col, w) => { x.strokeStyle = col; x.lineWidth = w; x.beginPath(); x.moveTo(40, 56); x.lineTo(64, 20); x.lineTo(88, 56); x.stroke(); };
    ring('rgba(21,18,28,.85)', 16); chev('rgba(21,18,28,.85)', 18); ring('#ffffff', 8); chev('#ffffff', 9);
    this.tex = new THREE.CanvasTexture(c); this.tex.colorSpace = THREE.SRGBColorSpace;
    this.mat = new THREE.MeshBasicMaterial({ map: this.tex, transparent: true, depthWrite: false, toneMapped: false, opacity: 0.9, polygonOffset: true, polygonOffsetFactor: -2 });
    this.geo = new THREE.PlaneGeometry(1.15, 1.15); this.geo.rotateX(-Math.PI / 2);
    this.mesh = new THREE.Mesh(this.geo, this.mat); this.mesh.renderOrder = 4; this.mesh.name = 'runner-her'; this.mesh.visible = false;
  }
  update(a, yaw) {
    const m = this.mesh;
    m.visible = !!(a && a.alive && !a.superJumpState);
    if (!m.visible) return;
    const gy = G.level ? G.level.groundHeight(a.pos.x, a.pos.z, a.pos.y + 0.6) : a.pos.y;
    m.position.set(a.pos.x, (Number.isFinite(gy) && gy > a.pos.y - 4 ? gy : a.pos.y) + 0.06, a.pos.z);
    m.rotation.y = yaw + Math.PI;
    this.mat.opacity = a.grounded ? 0.9 : 0.55;
  }
  dispose() { this.mesh.parent?.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); this.tex.dispose(); }
}
