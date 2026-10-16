// 字弹 M4 — geometry of the 打字蟹 type rig: INKWAVE's Crab Rig (special-props.js buildCrab: hull, legs, mortar) with
// the gatling swapped for a typewriter deck the crab holds in its claws. Same toy-plastic language as every held weapon
// and special prop (GEO_KIT): vertex colours + the `aMat` surface class, `body` renders with getPlasticMaterial(), `ink`
// with getInkMaterial(team). Built once and cached (shared geometry — never dispose it).
//
// Rig space = the crab's prop space: metres, +Y up, +Z forward (where the kid looks), origin at the bottom centre; the
// kid's LEFT is +X. Static parts are merged with the crab's hull and legs (2 draw calls); the moving parts come apart:
//   cannon      the crab's mortar (recoils), pivot `cannon.at`
//   cap         one keycap (unit footprint 1 × 1 key, origin at its base centre, uv on the top face for the legend)
//   caps[]      { key, pos (base centre, rig space), w (key units) } — the instanced caps sit on the deck plane (quat)
//   bar         one type-bar along +Y from its pivot (metal arm + dark slug), length DECK.barL
//   bars[]      { key, pivot, axis (swing axis), rest, strike (quaternions) } — a half-moon fan around the strike column
//   platen      the carriage's roller + knobs, carriage-local (origin = the strike point's column, on the platen axis)
//   tank        { glass, cap (body), fill (unit column, scaled), at }
//   shell       the rolled paper shell { body, ink } (origin at its centre, axis X)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { superEllipsoid, lathe, smoothProfile, finalize } from '../../../game/character-geo.js';
import { GEO_KIT } from '../../../game/character-weapons.js';
import { getSpecialProp } from '../../../game/special-props.js';
import { deckCaps, PRINTABLE } from './keys.js';

const { Parts, C, M, latheZ, at, rbox, orient, screw, hring, led, roundRect } = GEO_KIT;
const V3 = THREE.Vector3;

// ---------------------------------------------------------------------------------------------- the numbers
export const DECK = {
  pitch: 0.14,         // m per key unit (a 1u cap is pitch − gap wide): chunky enough to read from the follow camera
  gap: 0.022,
  capH: 0.06,          // cap height
  travel: 0.03,        // how far a cap goes down
  tilt: 0.26,          // rad: the key plate tilts toward the typist (its normal leans to −Z)
  centre: new V3(0, 1.06, 0.86),   // key plate top surface, centre
  plateW: 1.86, plateD: 0.66, plateT: 0.09,
  // type-bar fan: pivots on a half-moon of radius fanR around the strike column, fanY high; bars rest drooping toward
  // the typist into the basket and swing up over it to strike the platen front at `strike`
  // the fan lies in the open between the far key row and the platen, so the high typing camera sees all 31 bars
  fanR: 0.15, fanY: 1.25, fanZ: 1.62, fanSpan: 2.8, droop: 0.2, strikeH: 0.25,
  platenR: 0.075,
  // paper (carriage-local: x = rig X, y up from the platen top, faces −Z): cols × lines of glyph cells; glyphs are drawn
  // bigger than the pitch (monospace letters overlap their neighbours' cells, the shader looks at both neighbours)
  paperW: 1.68, paperH: 0.74, cols: 14, pitchX: 0.112, lineH: 0.175, glyph: 0.235, marginX: 0.056, firstLine: 0.1,
  tankAt: new V3(1.02, 0.97, 0.72), tankR: 0.085, tankH: 0.28,
};
DECK.strike = new V3(0, DECK.fanY + DECK.strikeH, DECK.fanZ);
DECK.platenAt = new V3(0, DECK.strike.y, DECK.fanZ + DECK.platenR);
DECK.barL = Math.hypot(DECK.fanR, DECK.strikeH);
DECK.quat = new THREE.Quaternion().setFromAxisAngle(new V3(1, 0, 0), -DECK.tilt);   // plate frame → rig (tilts top toward −Z)
DECK.normal = new V3(0, 1, 0).applyQuaternion(DECK.quat);
DECK.along = new V3(0, 0, 1).applyQuaternion(DECK.quat);   // toward the far row

/** a point on the key plate: x across (+X = her left), v toward the far row, n above the plate → rig space */
export function onPlate(x, v, n = 0, out = new V3()) {
  return out.copy(DECK.centre).addScaledVector(DECK.along, v).addScaledVector(DECK.normal, n).setX(DECK.centre.x + x);
}

// ---------------------------------------------------------------------------------------------- pieces
/** One keycap: a chunky rounded cap, slightly dished, its footprint (1 − gap/pitch) of a unit, base at y = 0, top at
 *  capH. uv = top face in [0, 1]² (u → −X so a legend reads from behind the deck, v → the far row); elsewhere −1. */
function capGeo() {
  const w = DECK.pitch - DECK.gap, h = DECK.capH;
  const g = rbox(w, h, w, 0.22, 20, 10, (q) => {
    if (q.y > 0) { const r2 = (q.x * q.x + q.z * q.z) / (w * w * 0.25); q.y -= 0.0045 * Math.max(0, 1 - r2); }   // dished top
    const t = (q.y + h / 2) / h; q.x *= 1 + 0.07 * (1 - t); q.z *= 1 + 0.07 * (1 - t);   // flared skirt
  });
  g.translate(0, h / 2, 0);
  const P = new Parts(); P.add(g, C.cream, M.gloss);
  const out = P.build();
  const pos = out.attributes.position, nrm = out.attributes.normal, uv = new Float32Array(pos.count * 2), col = out.attributes.color;
  const skirt = new THREE.Color(C.bone);
  for (let i = 0; i < pos.count; i++) {
    const top = nrm.getY(i) > 0.55 && pos.getY(i) > h * 0.75;
    uv[i * 2] = top ? 0.5 - pos.getX(i) / w : -1;
    uv[i * 2 + 1] = top ? 0.5 + pos.getZ(i) / w : -1;
    if (pos.getY(i) < h * 0.35) col.setXYZ(i, skirt.r, skirt.g, skirt.b);   // a warmer skirt under the gloss top
  }
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}

/** One type-bar along +Y from its pivot: a flat metal arm with a knuckle at the pivot and a dark type slug at the tip
 *  (the slug faces +Z at the strike pose: the face that prints). */
function barGeo() {
  const P = new Parts(), L = DECK.barL;
  P.add(at(rbox(0.02, L - 0.03, 0.01, 0.4, 6, 6), 0, (L - 0.03) / 2, 0), C.cream, M.gloss);
  P.add(at(latheZ([[0, -0.012], [0.016, -0.012], [0.016, 0.012], [0, 0.012]], 10).rotateY(Math.PI / 2), 0, 0, 0), C.gunmetal, M.metal);
  P.add(at(rbox(0.032, 0.05, 0.034, 0.35, 8, 6), 0, L - 0.02, 0.006), C.dark, M.gloss);
  return P.build();
}

// the fan: 31 bars on a half-moon (θ from −span/2 to +span/2, 0 = toward the typist), pivots on the circle of radius
// fanR around the strike column. Rest: pointing outward (toward the typist) and down by `droop`; strike: pointing at the
// strike point. Both as quaternions taking the bar's +Y to that direction, with its +Z (the slug face) kept upward-out.
function fanBars() {
  const out = [], n = PRINTABLE.length, S = DECK.strike, up = new V3(0, 1, 0);
  for (let i = 0; i < n; i++) {
    const th = -DECK.fanSpan / 2 + DECK.fanSpan * (i + 0.5) / n;
    const radial = new V3(Math.sin(th), 0, -Math.cos(th));                   // outward, toward the typist side
    const pivot = new V3(DECK.fanR * radial.x, DECK.fanY, DECK.fanZ + DECK.fanR * radial.z);
    const axis = new V3().crossVectors(up, radial).normalize();              // tangent: rotating +rad about it lifts the bar inward
    const restDir = radial.clone().multiplyScalar(Math.cos(DECK.droop)).addScaledVector(up, -Math.sin(DECK.droop)).normalize();
    const strikeDir = S.clone().sub(pivot).normalize();
    const frame = (dir) => {
      const y = dir.clone(), x = axis.clone(), z = new V3().crossVectors(x, y).normalize();
      return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    };
    out.push({ key: PRINTABLE[i], pivot, axis, theta: th, rest: frame(restDir), strike: frame(strikeDir) });
  }
  return out;
}

/** The static deck (merged into the hull): key plate in a cream housing with a dark well, team trim; the basket — a
 *  dark half-bowl the type-bars rest in, with a slotted segment; side towers + the carriage rail; posts down into the
 *  crab's pincers; the ink tank's cradle and hose; screws, LEDs. */
function deckStatic(P, I) {
  const D = DECK, q = D.quat;
  const place = (g, x, v, n) => { g.applyQuaternion(q); const p = onPlate(x, v, n); g.translate(p.x, p.y, p.z); return g; };
  // housing: a fat rounded slab under the plate, a dark plate the caps sit in, a team stripe along the near edge
  P.add(place(rbox(D.plateW, D.plateT, D.plateD, 0.18, 32, 10), 0, 0, -D.plateT / 2 - 0.004), C.cream, M.gloss);
  P.add(place(rbox(D.plateW - 0.07, 0.02, D.plateD - 0.07, 0.12, 28, 4), 0, 0, -0.006), C.dark, M.satin);
  I.add(place(rbox(D.plateW * 0.86, 0.022, 0.03, 0.4, 20, 4), 0, -D.plateD / 2 + 0.012, -D.plateT * 0.45));
  for (const sx of [1, -1]) {
    I.add(place(rbox(0.03, 0.03, D.plateD * 0.7, 0.4, 4, 4), sx * (D.plateW / 2 - 0.006), 0, -D.plateT * 0.5));
    for (const v of [-0.2, 0.2]) { const p = onPlate(sx * (D.plateW / 2 - 0.045), v, 0.0); screw(P, p, D.normal, 0.012); }
  }
  // the basket: a dark half-bowl from the pivot ring down and out toward the typist, the cream segment ring on top
  const bowl = lathe(smoothProfile([[D.fanR * 0.6, D.fanY - 0.012], [D.fanR + 0.02, D.fanY - 0.01], [D.fanR + 0.2, D.fanY - 0.09], [D.fanR + 0.32, D.fanY - 0.2], [D.fanR + 0.3, D.fanY - 0.24], [0, D.fanY - 0.25]], 12), 40, null);
  // keep the half toward the typist (z < fanZ after translation): squash the far half flat under the platen
  {
    const p = bowl.attributes.position;
    for (let i = 0; i < p.count; i++) { if (p.getZ(i) > 0) p.setZ(i, p.getZ(i) * 0.35); }
    bowl.computeVertexNormals();
  }
  P.add(at(bowl, 0, 0, D.fanZ), C.darker, M.satin);
  const seg = lathe([[D.fanR - 0.03, D.fanY - 0.02], [D.fanR + 0.035, D.fanY - 0.02], [D.fanR + 0.04, D.fanY + 0.012], [D.fanR + 0.03, D.fanY + 0.024], [D.fanR - 0.028, D.fanY + 0.024], [D.fanR - 0.034, D.fanY + 0.01]], 48);
  P.add(at(seg, 0, 0, D.fanZ), C.cream, M.gloss);
  I.add(at(hring(D.fanR + 0.041, 0.009, D.fanY + 0.004, 5, 48), 0, 0, D.fanZ));
  // side towers from the plate's far corners up to the carriage rail; the rail behind the platen
  const railY = D.platenAt.y - 0.03, railZ = D.platenAt.z + D.platenR + 0.05, railX = 0.9;
  for (const sx of [1, -1]) {
    const foot = onPlate(sx * 0.66, D.plateD / 2 - 0.08, -0.02), top = new V3(sx * 0.66, railY, railZ);
    P.add(orient(lathe(smoothProfile([[0, 0], [0.075, 0], [0.08, 0.03], [0.058, 0.12], [0.052, 0.4], [0, 0.42]], 10), 16).scale(1, foot.distanceTo(top) / 0.42, 1), top.clone().sub(foot).normalize(), foot), C.cream, M.gloss);
    P.add(at(rbox(0.11, 0.11, 0.11, 0.35, 10, 8), top.x, top.y, top.z), C.dark, M.gloss);
    I.add(at(hring(0.058, 0.012, 0, 5, 20), top.x, top.y - 0.07, top.z));
    led(P, new V3(sx * 0.66, top.y + 0.058, top.z - 0.02), new V3(0, 1, -0.3).normalize(), sx > 0 ? C.green : C.amber, 0.014);
  }
  const rail = latheZ([[0, -railX], [0.022, -railX], [0.022, railX], [0, railX]], 12); rail.rotateY(Math.PI / 2);
  P.add(at(rail, 0, railY, railZ), C.metal, M.metal);
  for (const sx of [1, -1]) P.add(at(rbox(0.05, 0.06, 0.06, 0.35, 8, 6), sx * railX, railY, railZ), C.dark, M.gloss);
  // posts down into the pincers (the crab holds its typewriter), a cross brace under the plate
  for (const sx of [1, -1]) {
    const a = new V3(sx * 0.5, 0.74, 0.98), b = onPlate(sx * 0.5, 0.12, -D.plateT + 0.01);
    P.add(orient(lathe(smoothProfile([[0, 0], [0.042, 0], [0.046, 0.04], [0.036, 0.1], [0.036, 0.9], [0.044, 0.97], [0, 1]], 12), 12).scale(1, a.distanceTo(b), 1), b.clone().sub(a).normalize(), a), C.gunmetal, M.metal);
    I.add(orient(hring(0.046, 0.011, 0, 5, 16), b.clone().sub(a).normalize(), a.clone().lerp(b, 0.25)));
  }
  { const a = onPlate(0.5, 0.12, -D.plateT - 0.01), b = onPlate(-0.5, 0.12, -D.plateT - 0.01);
    const br = latheZ([[0, 0], [0.024, 0], [0.024, a.distanceTo(b)], [0, a.distanceTo(b)]], 10); br.rotateY(-Math.PI / 2); P.add(at(br, a.x, a.y, a.z), C.gunmetal, M.metal); }
  // ink tank cradle (the glass and the ink are their own meshes) + a hose into the plate
  { const t = D.tankAt;
    P.add(at(lathe(smoothProfile([[0, -0.05], [D.tankR + 0.02, -0.05], [D.tankR + 0.03, -0.02], [D.tankR + 0.012, 0.012], [0, 0.012]], 8), 24), t.x, t.y, t.z), C.dark, M.gloss);
    P.add(at(lathe(smoothProfile([[0, D.tankH - 0.01], [D.tankR + 0.012, D.tankH - 0.01], [D.tankR + 0.018, D.tankH + 0.02], [D.tankR - 0.01, D.tankH + 0.05], [0.03, D.tankH + 0.056], [0, D.tankH + 0.07]], 8), 24), t.x, t.y, t.z), C.cream, M.gloss);
    I.add(at(hring(D.tankR + 0.02, 0.01, D.tankH + 0.015, 5, 24), t.x, t.y, t.z));
    I.add(at(hring(D.tankR + 0.026, 0.01, -0.02, 5, 24), t.x, t.y, t.z));
    const h0 = new V3(t.x - 0.03, t.y - 0.03, t.z), h1 = onPlate(D.plateW / 2 - 0.02, -0.06, -0.04);
    P.add(orient(lathe([[0, 0], [0.016, 0], [0.016, 1], [0, 1]], 8).scale(1, h0.distanceTo(h1), 1), h1.clone().sub(h0).normalize(), h0), C.rubber, M.rubber);
  }
}

function platenGeo() {
  const P = new Parts(), D = DECK, half = D.paperW / 2 + 0.03;
  const roll = latheZ(smoothProfile([[0, -half], [D.platenR - 0.004, -half], [D.platenR, -half + 0.01], [D.platenR, half - 0.01], [D.platenR - 0.004, half], [0, half]], 12), 28);
  roll.rotateY(Math.PI / 2);
  P.add(roll, C.rubber, M.rubber);
  for (const sx of [1, -1]) {
    const k = latheZ(smoothProfile([[0, 0], [0.03, 0], [0.032, 0.03], [0.07, 0.05], [0.075, 0.09], [0.06, 0.11], [0, 0.115]], 10), 24);
    k.rotateY(sx > 0 ? Math.PI / 2 : -Math.PI / 2);
    P.add(at(k, sx * half, 0, 0), C.cream, M.gloss);
    const r = latheZ([[0.071, 0.07], [0.077, 0.072], [0.077, 0.086], [0.071, 0.088]], 24); r.rotateY(sx > 0 ? Math.PI / 2 : -Math.PI / 2);
    P.add(at(r, sx * half, 0, 0), C.dark, M.rubber);
    P.add(at(latheZ([[0, -0.012], [0.03, -0.012], [0.03, 0.012], [0, 0.012]], 14).rotateY(Math.PI / 2), sx * (half + 0.12), 0, 0), C.metal, M.metal);
  }
  // the paper bail: a thin metal bar with two rubber rollers just above the platen front
  const bail = latheZ([[0, -half + 0.08], [0.008, -half + 0.08], [0.008, half - 0.08], [0, half - 0.08]], 8); bail.rotateY(Math.PI / 2);
  P.add(at(bail, 0, D.platenR + 0.03, -D.platenR * 0.55), C.metal, M.metal);
  for (const x of [-0.35, 0.35]) P.add(at(latheZ([[0, -0.03], [0.016, -0.03], [0.016, 0.03], [0, 0.03]], 12).rotateY(Math.PI / 2), x, D.platenR + 0.03, -D.platenR * 0.55), C.rubber, M.rubber);
  return P.build();
}

function tankGeo() {
  const D = DECK;
  const glass = lathe(smoothProfile([[0, 0.0], [D.tankR, 0.0], [D.tankR + 0.004, 0.02], [D.tankR + 0.004, D.tankH - 0.02], [D.tankR, D.tankH], [0, D.tankH]], 10), 28);
  // the fill is a unit-tall column (scaled in y by the level) just inside the glass
  const fill = lathe(smoothProfile([[0, 0], [D.tankR - 0.008, 0], [D.tankR - 0.006, 0.05], [D.tankR - 0.006, 0.95], [D.tankR - 0.012, 1], [0, 1]], 8), 24);
  return { glass, fill };
}

/** The shell: the torn sheet rolled into a fat paper tube with grey-ink end caps (neutral: nothing is judged yet). */
function shellGeo() {
  const P = new Parts(), I = new Parts(), L = 0.46, R = 0.085;
  const tube = latheZ(smoothProfile([[0, -L / 2], [R * 0.9, -L / 2], [R, -L / 2 + 0.02], [R * 1.02, 0], [R, L / 2 - 0.02], [R * 0.9, L / 2], [0, L / 2]], 12), 24);
  tube.rotateY(Math.PI / 2);
  P.add(tube, '#f4f1e8', M.satin);
  // the spiral edge of the roll, a printed band
  for (const x of [-0.12, 0.0, 0.12]) { const r = latheZ([[R * 1.02, -0.008], [R * 1.035, -0.004], [R * 1.035, 0.004], [R * 1.02, 0.008]], 24); r.rotateY(Math.PI / 2); P.add(at(r, x, 0, 0), '#5a5f69', M.print); }
  for (const sx of [1, -1]) {
    const cap = latheZ(smoothProfile([[0, 0], [R * 1.08, 0], [R * 1.12, 0.03], [R * 0.8, 0.07], [0, 0.085]], 8), 20);
    cap.rotateY(sx > 0 ? Math.PI / 2 : -Math.PI / 2);
    I.add(at(cap, sx * (L / 2 - 0.01), 0, 0));
  }
  return { body: P.build(), ink: I.build(), length: L, radius: R };
}

/** Drop the triangles whose three corners lie inside a box (the crab's open hatch lid would stand right over the left
 *  keys: the rig rides with the lid off). Returns a new indexed geometry sharing nothing with the cached prop. */
function dropBox(g, min, max) {
  const out = g.clone(), p = out.attributes.position, ix = out.index.array, keep = [];
  const inside = (i) => { const x = p.getX(i), y = p.getY(i), z = p.getZ(i); return x > min.x && x < max.x && y > min.y && y < max.y && z > min.z && z < max.z; };
  for (let t = 0; t < ix.length; t += 3) if (!(inside(ix[t]) && inside(ix[t + 1]) && inside(ix[t + 2]))) keep.push(ix[t], ix[t + 1], ix[t + 2]);
  out.setIndex(keep);
  return out;
}
const LID_MIN = new V3(0.24, 1.185, -0.4), LID_MAX = new V3(0.7, 1.9, 0.26);

// ---------------------------------------------------------------------------------------------- assembly
let _cache = null;
/** Everything the type rig draws (cached, shared). */
export function getTypeRigGeo() {
  if (_cache) return _cache;
  const crab = getSpecialProp('crab');
  const P = new Parts(), I = new Parts();
  deckStatic(P, I);
  const deckBody = P.build(), deckInk = I.build();
  const bodies = [dropBox(crab.body, LID_MIN, LID_MAX), ...crab.legs.map((l) => l.body), deckBody].filter(Boolean);
  const inks = [dropBox(crab.ink, LID_MIN, LID_MAX), ...crab.legs.map((l) => l.ink), deckInk].filter(Boolean);
  const body = mergeGeometries(bodies.map((g) => g.index ? g : finalize(g)), false);
  const ink = mergeGeometries(inks.map((g) => g.index ? g : finalize(g)), false);
  const caps = deckCaps().map((c) => {
    const pos = onPlate(c.x * DECK.pitch, (1.5 - c.z) * DECK.pitch, 0.002);
    return { key: c.key, row: c.row, pos, w: c.w };
  });
  const tank = tankGeo();
  _cache = {
    body, ink,
    cannon: { body: crab.cannon.body, ink: crab.cannon.ink, at: crab.cannon.at.clone() },
    cannonMuzzle: crab.cannonMuzzle.clone(), cannonDir: crab.cannonDir.clone(),
    seatAt: crab.seatAt.clone(), hatchY: crab.hatchY,
    cap: capGeo(), caps,
    bar: barGeo(), bars: fanBars(),
    platen: platenGeo(),
    tank: { glass: tank.glass, fill: tank.fill, at: DECK.tankAt.clone() },
    shell: shellGeo(),
  };
  return _cache;
}
