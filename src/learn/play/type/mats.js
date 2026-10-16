// 字弹 M4 — the two materials the type rig adds to INKWAVE's plastic / ink / glass:
//   capMaterial    the keycaps (one InstancedMesh): the gloss class of getPlasticMaterial() (vertex colours, clearcoat)
//                  plus a legend from the glyph atlas on the cap top and a per-instance `lit` that floods the cap with
//                  her team colour and lights it (emissive) — the same colour for every key, always.
//   paperMaterial  the sheet in the carriage: matte paper, the printed text read from a tiny glyph-index texture
//                  (cols × lines) so the letters ride every deformation of the sheet (feed, tear, roll) in one draw call;
//                  the ink is ONE colour uniform (LEARN.type.glyph, neutral grey) — there is no input that could tint a
//                  letter by whether it is right (PLAY §1.3).
import * as THREE from 'three';
import { ATLAS } from './atlas.js';
import { DECK } from './deck-geo.js';

const GLSL_HASH = 'float tyH(vec2 p){ vec3 q = fract(vec3(p.xyx) * 0.1031); q += dot(q, q.yzx + 33.33); return fract((q.x + q.y) * q.z); }';

/** keycaps: InstancedMesh attribute aKey = (atlas cell, x scale of the cap, lit 0..1, unused) */
export function capMaterial(atlas, team) {
  const m = new THREE.MeshPhysicalMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.24, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, name: 'iw-type-cap' });
  const U = {
    uAtlas: { value: atlas },
    uTeam: { value: new THREE.Color(team) },
    uLegend: { value: new THREE.Color('#272b34') },
    uGrid: { value: new THREE.Vector2(ATLAS.cols, ATLAS.rows) },
  };
  m.userData.uniforms = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aKey; varying vec4 vKey; varying vec2 vCapUv;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvKey = aKey; vCapUv = uv;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D uAtlas; uniform vec3 uTeam; uniform vec3 uLegend; uniform vec2 uGrid; varying vec4 vKey; varying vec2 vCapUv;')
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        float tyLit = clamp(vKey.z, 0.0, 1.0);
        diffuseColor.rgb = mix(diffuseColor.rgb, uTeam, tyLit * 0.92);
        // legend: sampled in uniform control flow with explicit gradients (no mip seams at the cell edges)
        vec2 lu = vec2((vCapUv.x - 0.5) * vKey.y + 0.5, vCapUv.y);
        lu = (lu - 0.5) * 1.18 + 0.5;
        float c = floor(vKey.x + 0.5), row = floor((c + 0.5) / uGrid.x), colc = c - row * uGrid.x;
        vec2 a = (vec2(colc, row) + vec2(clamp(lu.x, 0.0, 1.0), 1.0 - clamp(lu.y, 0.0, 1.0))) / uGrid;
        vec2 gx = dFdx(lu) / uGrid, gy = dFdy(lu) / uGrid; gx.y = -gx.y; gy.y = -gy.y;
        float inside = step(0.0, vCapUv.x) * step(0.001, lu.x) * step(lu.x, 0.999) * step(0.001, lu.y) * step(lu.y, 0.999);
        float tyA = textureGrad(uAtlas, vec2(a.x, 1.0 - a.y), gx, gy).a * inside;
        diffuseColor.rgb = mix(diffuseColor.rgb, mix(uLegend, vec3(1.0), tyLit), tyA);`)
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += uTeam * tyLit * 0.9 * (1.0 - 0.6 * tyA);');
  };
  m.customProgramCacheKey = () => 'iw-type-cap2';
  return m;
}

/** The text grid texture: one byte per cell (glyph cell + 1, 0 = empty), cols × lines (a ring of lines). */
export function makeTextTexture(cols = DECK.cols, lines = 32) {
  const data = new Uint8Array(cols * lines);
  const t = new THREE.DataTexture(data, cols, lines, THREE.RedFormat, THREE.UnsignedByteType);
  t.minFilter = THREE.NearestFilter; t.magFilter = THREE.NearestFilter; t.generateMipmaps = false;
  t.needsUpdate = true;
  return t;
}

/** Paper sheet: geometry is PlaneGeometry(W, H, 1, n) moved to y ∈ [0, H] and turned to face −Z (uv.x = 0 on the
 *  reader's left = +X). Uniforms the rig drives: uLine (index of the line being typed), uFeed (m the text still has to
 *  rise after a line feed), uHot (col, line, age, glyph) = the last strike (wet ink pop), uGone (col, line, age, glyph) =
 *  a glyph being wiped by ⌫, uTear / uRoll (0..1) for the shot. */
export function paperMaterial(atlas, text, ink) {
  // a little self-light so the sheet reads as white paper even with the sun behind it (it faces the camera, not the sun)
  const m = new THREE.MeshStandardMaterial({ color: '#f7f4ec', emissive: '#f7f4ec', emissiveIntensity: 0.22, roughness: 0.82, metalness: 0, side: THREE.DoubleSide, name: 'iw-type-paper' });
  const D = DECK;
  const U = {
    uAtlas: { value: atlas }, uText: { value: text },
    uInk: { value: new THREE.Color(ink) },
    uGrid: { value: new THREE.Vector2(ATLAS.cols, ATLAS.rows) },
    uTextSize: { value: new THREE.Vector2(text.image.width, text.image.height) },
    uCell: { value: new THREE.Vector4(D.pitchX, D.lineH, D.marginX, D.firstLine) }, uGlyph: { value: D.glyph },
    uSize: { value: new THREE.Vector2(D.paperW, D.paperH) },
    uLine: { value: 0 }, uFeed: { value: 0 },
    uHot: { value: new THREE.Vector4(-1, -1, 9, 0) }, uGone: { value: new THREE.Vector4(-1, -1, 9, 0) },
    uTear: { value: 0 }, uRoll: { value: 0 },
  };
  m.userData.uniforms = U;
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTear; uniform float uRoll; uniform vec2 uSize; varying vec2 vPaper;')
      .replace('#include <beginnormal_vertex>', /* glsl */`#include <beginnormal_vertex>
        float tyY = position.y, tyH0 = uSize.y;
        // the top third leans back like a real sheet over the paper rest
        float lean = max(0.0, tyY - 0.55 * tyH0);
        float tyRollY = tyH0 * (1.0 - uRoll);
        float tyTh = 0.0, tyR = 0.0;
        if (uRoll > 0.0 && tyY > tyRollY) {
          float d = tyY - tyRollY;
          tyR = 0.075 * (1.0 - 0.45 * d / tyH0) + 0.012;
          tyTh = d / tyR;
          objectNormal = vec3(0.0, sin(tyTh), -cos(tyTh));
        } else if (lean > 0.0) {
          float s = 2.0 * 0.55 * lean;
          objectNormal = normalize(vec3(0.0, -s, -1.0));
        }`)
      .replace('#include <begin_vertex>', /* glsl */`#include <begin_vertex>
        vPaper = vec2(uv.x * uSize.x, position.y);
        if (tyTh > 0.0) {
          transformed.y = tyRollY + tyR * sin(tyTh);
          transformed.z = tyR * (1.0 - cos(tyTh));
        } else {
          transformed.z += 0.55 * lean * lean;
        }
        float squeeze = 1.0 - 0.62 * uRoll * uRoll;
        transformed.x *= squeeze;
        transformed.y += 0.14 * uTear * (1.0 - uRoll);`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\n' + GLSL_HASH + `
        uniform sampler2D uAtlas; uniform sampler2D uText; uniform vec3 uInk; uniform vec2 uGrid; uniform vec2 uTextSize;
        uniform vec4 uCell; uniform float uGlyph; uniform vec2 uSize; uniform float uLine; uniform float uFeed; uniform vec4 uHot; uniform vec4 uGone;
        uniform float uTear; varying vec2 vPaper;
        // one glyph's coverage at lu (its quad in [0, 1]²); gradients come from the caller (uniform control flow)
        float tyGlyph(float g, vec2 lu, vec2 gx, vec2 gy) {
          float c = floor(g + 0.5) - 1.0, row = floor((c + 0.5) / uGrid.x), colc = c - row * uGrid.x;
          vec2 a = (vec2(colc, row) + vec2(clamp(lu.x, 0.0, 1.0), 1.0 - clamp(lu.y, 0.0, 1.0))) / uGrid;
          float inside = step(0.5, g) * step(0.001, lu.x) * step(lu.x, 0.999) * step(0.001, lu.y) * step(lu.y, 0.999);
          return textureGrad(uAtlas, vec2(a.x, 1.0 - a.y), gx, gy).a * inside;
        }`)
      .replace('#include <color_fragment>', /* glsl */`#include <color_fragment>
        {
          // a sheet of paper: a faint tooth, the platen's shade at the foot, a torn edge once it is ripped off
          float tooth = tyH(floor(vPaper * 900.0));
          diffuseColor.rgb *= 0.975 + 0.035 * tooth;
          diffuseColor.rgb *= mix(0.78, 1.0, smoothstep(0.0, 0.06, vPaper.y));
          if (uTear > 0.0 && vPaper.y < 0.035 + 0.02 * tyH(vec2(floor(vPaper.x * 60.0), 3.0)) * uTear) discard;
          if (gl_FrontFacing) {
            float px = vPaper.x - uCell.z;                         // from the left margin, the reader's left
            float k = (vPaper.y - uCell.w + uFeed) / uCell.y;       // lines above the one being typed
            float kk = floor(k + 0.5);
            float col0 = floor(px / uCell.x);
            float ink = 0.0;
            vec2 pgx = dFdx(vPaper) / (uGlyph * uGrid), pgy = dFdy(vPaper) / (uGlyph * uGrid);
            pgx.y = -pgx.y; pgy.y = -pgy.y;
            if (kk >= 0.0) {
              float line = uLine - kk;
              if (line >= 0.0 && uLine - line < uTextSize.y) {
                float row = mod(line, uTextSize.y);
                // a glyph is wider than its column: look at this column and both neighbours
                for (int dc = -1; dc <= 1; dc++) {
                  float col = col0 + float(dc);
                  if (col < 0.0 || col >= uTextSize.x) continue;
                  float g = floor(texture2D(uText, vec2((col + 0.5) / uTextSize.x, (row + 0.5) / uTextSize.y)).r * 255.0 + 0.5);
                  if (g < 0.5) continue;
                  // typewriter wobble: each strike lands a little off and a little lighter or darker
                  vec2 seed = vec2(col, line);
                  vec2 jit = (vec2(tyH(seed), tyH(seed + 7.1)) - 0.5) * vec2(0.01, 0.009);
                  bool hot = abs(uHot.x - col) < 0.5 && abs(uHot.y - line) < 0.5;
                  float pop = hot ? 1.0 + 0.42 * exp(-uHot.z * 16.0) : 1.0;
                  vec2 c = vec2((col + 0.5) * uCell.x, uCell.w + kk * uCell.y - uFeed);
                  vec2 lu = (vec2(px, vPaper.y) - c - jit) / (uGlyph * pop) + 0.5;
                  float a = tyGlyph(g, lu, pgx / pop, pgy / pop) * (0.86 + 0.14 * tyH(seed + 3.3));
                  if (hot) a = min(1.0, a * (1.0 + 0.6 * exp(-uHot.z * 6.0)));
                  ink = max(ink, a);
                }
              }
            }
            // the glyph ⌫ just wiped: lifts and fades
            if (uGone.z < 0.22 && kk >= 0.0 && abs(uGone.y - (uLine - kk)) < 0.5) {
              vec2 c = vec2((uGone.x + 0.5) * uCell.x, uCell.w + kk * uCell.y - uFeed + uGone.z * 0.15);
              vec2 lu = (vec2(px, vPaper.y) - c) / (uGlyph * (1.0 + uGone.z * 1.5)) + 0.5;
              ink = max(ink, tyGlyph(uGone.w, lu, pgx, pgy) * (1.0 - uGone.z / 0.22) * 0.8);
            }
            diffuseColor.rgb = mix(diffuseColor.rgb, uInk, ink);
          }
        }`);
  };
  m.customProgramCacheKey = () => 'iw-type-paper3';
  return m;
}
