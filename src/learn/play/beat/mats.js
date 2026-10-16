// 节拍台 M3 (and the echo booth / check-in pad) — the dance pads and the label plates.
//
//   padBaseGeometry()          the spawn pad's bevelled base ring with its metal lip and bolts (decor.js _buildPads, scaled
//                              to a unit radius), vertex coloured — one InstancedMesh for every pad of a stage
//   padFaceMaterial()          the spawn pad's face (decor.js PAD_FRAG: glossy dark base, pooled ink with a slow swirl,
//                              glowing rim / track / ticks / chevrons, the flare wave), instanced, with what a dance pad
//                              adds: an arrow in the pool, the approach ring that closes onto the rim on the downbeat, the
//                              beat's kick on every ring, a flare (on-beat streak). Per instance:
//                                aCol  vec3  the glow's colour (neutral until answered; her ink; coral)
//                                aPad  vec4  x glow 0..1 · y flare wave · z the wave's age (s) · w approach 0..1 (−1 off)
//                                aSel  vec4  x ink in the pool 0..1 · y glyph (0 none, 1 ↑ 2 ← 3 → 4 ↓ 5 home) · z streak · w pop
//                              The face quad reaches past the rim (FACE_R) so the approach ring can start outside it;
//                              everything else past the rim is discarded (opaque: no sorting with the paint under it).
//   labelMaterial(atlas)       a label plate: the gate's label atlas (aUv rect per instance), dark glass drawn into it,
//                              and per instance aLab = x opacity · y her-ink outline (the right one after a miss) · z coral ·
//                              w the plate's aspect
import * as THREE from 'three';

const TAU = Math.PI * 2;
export const FACE_R = 1.75;   // the face quad's half size in pad radii (the approach ring starts at 1.6)

function tint(g, color) {
  const c = new THREE.Color(color), n = g.attributes.position.count, a = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(a, 3));
  return g;
}
const lathe = (prof, seg) => new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), seg);
function merge(list) {
  // (a small merge: position / normal / color only, non-indexed)
  let n = 0; const parts = list.map((g) => { const x = g.index ? g.toNonIndexed() : g; n += x.attributes.position.count; return x; });
  const pos = new Float32Array(n * 3), nor = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of parts) {
    pos.set(g.attributes.position.array, o * 3); nor.set(g.attributes.normal.array, o * 3); col.set(g.attributes.color.array, o * 3);
    o += g.attributes.position.count;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3)); out.setAttribute('normal', new THREE.BufferAttribute(nor, 3)); out.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return out;
}

let _base = null;
/** the pad's base ring at unit radius (decor's spawn pad divided by its face radius 1.95) */
export function padBaseGeometry() {
  if (_base) return _base;
  const k = 1 / 1.95, parts = [];
  parts.push(tint(lathe([[1.93 * k, 0.072], [1.97 * k, 0.074], [2.01 * k, 0.1], [2.1 * k, 0.104], [2.17 * k, 0.078], [2.2 * k, 0.04], [2.22 * k, 0.0]], 48), 0x2b2f3a));
  const torus = new THREE.TorusGeometry(2.055 * k, 0.012, 6, 64); torus.rotateX(Math.PI / 2); torus.translate(0, 0.104, 0);
  parts.push(tint(torus, 0x9aa3ad));
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, c = new THREE.CylinderGeometry(0.018, 0.022, 0.02, 6);
    c.translate(Math.cos(a) * 2.12 * k, 0.1, Math.sin(a) * 2.12 * k);
    parts.push(tint(c, 0xb8c0c8));
  }
  _base = merge(parts);
  return _base;
}

const OUT = /* glsl */`
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;
const FACE_VERT = /* glsl */`
attribute vec3 aCol; attribute vec4 aPad; attribute vec4 aSel;
varying vec2 vQ; varying vec3 vW; varying vec3 vCol; varying vec4 vPad; varying vec4 vSel;
void main(){
  vQ = position.xz;
  vCol = aCol; vPad = aPad; vSel = aSel;
  vec4 w = vec4(position, 1.0);
  #ifdef USE_INSTANCING
    w = instanceMatrix * w;
  #endif
  w = modelMatrix * w;
  vW = w.xyz;
  gl_Position = projectionMatrix * viewMatrix * w;
}`;
const FACE_FRAG = /* glsl */`
uniform float uTime; uniform float uBeat; uniform vec3 uGrey;
varying vec2 vQ; varying vec3 vW; varying vec3 vCol; varying vec4 vPad; varying vec4 vSel;
float bHash(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float bNoise(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(bHash(i), bHash(i+vec2(1.0,0.0)), u.x), mix(bHash(i+vec2(0.0,1.0)), bHash(i+vec2(1.0,1.0)), u.x), u.y); }
// an arrow (chevron + stem) pointing along +y in the pool's space, as coverage
float arrowMask(vec2 p){
  float head = step(abs(p.x) * 1.15 + (p.y - 0.33), 0.0) * step(0.02, p.y) * step(p.y, 0.36);
  head *= 1.0 - step(abs(p.x) * 1.15 + (p.y - 0.12), 0.0) * step(-0.2, p.y);
  float stem = step(abs(p.x), 0.075) * step(-0.3, p.y) * step(p.y, 0.1);
  return clamp(head + stem, 0.0, 1.0);
}
void main(){
  vec2 q = vQ; float r = length(q); float a = atan(q.y, q.x + 1e-5);
  float glowK = vPad.x, wave = vPad.y, waveT = vPad.z, appr = vPad.w;
  float ink = vSel.x, glyph = floor(vSel.y + 0.5), streak = vSel.z;
  // the approach ring: from 1.6 radii closing onto the rim at the downbeat (appr 0 → 1), then a beat of afterglow
  float ar = mix(1.62, 0.97, clamp(appr, 0.0, 1.0));
  float ring = appr >= 0.0 ? smoothstep(0.045, 0.0, abs(r - ar)) * smoothstep(0.0, 0.12, appr) * (1.0 - smoothstep(1.0, 1.18, appr)) : 0.0;
  if (r > 1.0) { if (ring < 0.02) discard; gl_FragColor = vec4(vCol * (1.4 + 1.6 * ring), 1.0); ${OUT} return; }
  vec3 V = normalize(cameraPosition - vW);
  vec3 base = mix(vec3(0.035, 0.04, 0.055), vec3(0.075, 0.085, 0.11), smoothstep(1.0, 0.0, r));
  float fres = pow(max(1.0 - clamp(V.y, 0.0, 1.0), 0.0), 3.0);
  base += vec3(0.16, 0.2, 0.26) * fres;
  // pooled ink: neutral grey until the pad is hers (ink → 1: her ink rises in it)
  float n = bNoise(q * 3.2 + vec2(uTime * 0.25, -uTime * 0.18)) * 0.6 + bNoise(q * 7.0 - uTime * 0.3) * 0.4;
  float pool = smoothstep(0.62, 0.54, r + (n - 0.5) * 0.06);
  vec3 poolCol = mix(uGrey, vCol, ink);
  vec3 inkc = poolCol * (0.42 + 0.3 * n) + vec3(0.9) * pow(n, 7.0) * 1.4;
  base = mix(base, inkc, pool);
  // the arrow (or the home pad's dot) in the pool, white
  vec2 ap = q / 0.62;
  float g = 0.0;
  if (glyph > 4.5) g = smoothstep(0.24, 0.2, length(ap)) - smoothstep(0.14, 0.1, length(ap));
  else if (glyph > 0.5) {
    vec2 d = glyph < 1.5 ? ap : glyph < 2.5 ? vec2(-ap.y, ap.x) : glyph < 3.5 ? vec2(ap.y, -ap.x) : -ap;
    g = arrowMask(d);
  }
  base = mix(base, vec3(1.0) * (0.92 + 0.3 * uBeat), g * pool * 0.95);
  // rings: rim, inner rim, dashed rotating track, ticks, chevrons
  float glow = 0.0;
  glow += smoothstep(0.03, 0.0, abs(r - 0.955)) * 1.3;
  glow += smoothstep(0.02, 0.0, abs(r - 0.62)) * 0.95;
  float dash = step(0.5, fract(a / 6.2831853 * 24.0 + uTime * 0.25));
  glow += smoothstep(0.022, 0.0, abs(r - 0.8)) * dash * 0.8;
  glow += step(0.8, fract(a / 6.2831853 * 48.0)) * smoothstep(0.04, 0.0, abs(r - 0.885)) * 0.45;
  // the beat: every ring kicks on each beat (more on the downbeat — uBeat carries it)
  glow *= (0.62 + 0.9 * glowK) * (0.85 + 0.15 * sin(uTime * 2.2)) * (1.0 + 1.1 * uBeat);
  float fw = wave * smoothstep(0.09, 0.0, abs(r - waveT * 1.6)) * (1.0 - smoothstep(0.6, 1.0, waveT));
  vec3 col = base + vCol * glow * 2.4 + (vCol * 2.2 + vec3(1.2)) * fw * 2.2;
  col += vCol * pool * (0.35 * streak + 0.6 * wave * (1.0 - smoothstep(0.0, 0.8, waveT)));
  col += vCol * streak * smoothstep(0.08, 0.0, abs(r - 0.955)) * 2.0;
  // metal lip just inside the rim
  col = mix(col, vec3(0.5, 0.52, 0.56) * (0.6 + 0.6 * fres), smoothstep(0.975, 0.99, r));
  col = max(col, vCol * (1.4 + 1.6 * ring) * step(0.02, ring));
  gl_FragColor = vec4(col, 1.0);
  ${OUT}
}`;

/** the pads' face (one per stage; colour, glow, pool, glyph and approach per instance) */
export function padFaceMaterial(grey = '#8d929b') {
  const m = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBeat: { value: 0 }, uGrey: { value: new THREE.Color(grey) } },
    vertexShader: FACE_VERT, fragmentShader: FACE_FRAG,
  });
  m.name = 'iw-beat-pad';
  return m;
}
/** the face quad: a square in xz at unit radius × FACE_R (instance-scaled by the pad's radius) */
export function padFaceGeometry() {
  const g = new THREE.PlaneGeometry(2 * FACE_R, 2 * FACE_R, 1, 1);
  g.rotateX(-Math.PI / 2);   // (x, y) → (x, −y) on the ground: +z of the quad is the pad's forward
  return g;
}
export function padBaseMaterial() {
  return new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.32, metalness: 0.55, name: 'iw-beat-base' });
}

/** label plates (one InstancedMesh: the gate's atlas, a rect per instance) */
export function labelMaterial(atlas, ink = '#ff8a14', coral = '#f08a7a') {
  const mat = new THREE.MeshBasicMaterial({ map: atlas, color: 0xffffff, transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
  const U = { uInk: { value: new THREE.Color(ink) }, uCoral: { value: new THREE.Color(coral) } };
  mat.userData.u = U;
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.uInk = U.uInk; sh.uniforms.uCoral = U.uCoral;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute vec4 aUv; attribute vec4 aLab;
        varying vec4 vLab; varying vec2 vLocal;`)
      .replace('#include <uv_vertex>', `#include <uv_vertex>
        vLocal = uv; vLab = aLab;
        #ifdef USE_MAP
          vMapUv = mix(aUv.xy, aUv.zw, uv);
        #endif`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform vec3 uInk; uniform vec3 uCoral;
        varying vec4 vLab; varying vec2 vLocal;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, uCoral, 0.6), vLab.z * step(0.02, diffuseColor.a));
          vec2 hs = vec2(vLab.w * 0.5, 0.5), p = (vLocal - 0.5) * vec2(vLab.w, 1.0);
          float rr = 0.2; vec2 qq = abs(p) - hs + rr;
          float d = length(max(qq, 0.0)) + min(max(qq.x, qq.y), 0.0) - rr;
          float ring = smoothstep(-0.085, -0.06, d) * (1.0 - smoothstep(-0.015, 0.0, d));
          diffuseColor.rgb = mix(diffuseColor.rgb, uInk, ring * vLab.y);
          diffuseColor.a = max(diffuseColor.a, ring * vLab.y);
          diffuseColor.a *= vLab.x;
        }`);
  };
  mat.customProgramCacheKey = () => 'iw-beat-label-1';
  return mat;
}
