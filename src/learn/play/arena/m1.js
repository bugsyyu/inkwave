// 题即玩法 play-5 — the arena's pure parts (docs/PLAY.md §3 M5, §5.3, §5.4): which items the duel / the boss play as what,
// where the boss's option balls hang, and the per-frame placement arithmetic of a cluster that floats over a zone and
// faces her wherever she runs. Node-tested, no three.js.
//
//   canPlayArena(item, p)     a plain choice of 2–4 options is ink targets in an arena — every choice kind (单词选义 /
//                             语法 · 发音小测 / 阅读题 / 音标 / 听辨对子: PLAY §4's 对抗赛 and Boss columns are all M1 / M5) and the
//                             typed card's 回炉 choice (p._alt 'choice-of-typed'); never a flip card, a typed rewording, or
//                             more planks than LEARN.m1.bannerMax
//   arenaKind(item, p)        'm1' (ink targets) · 'type' (字弹 M4: anything typed) · null (nothing here — the card)
//   weakSockets(n)            the boss's sockets an n-option choice hangs its balls on (eyes first: the weak points she
//                             can always see; the belly and the cannon mouth after), PLAY §3 M5
//   clusterLocals(objs, anchor, basis) → Float32Array  each object's offsets from the cluster's anchor in the camera basis at
//                             placement (ball / plank centre, then its plate): what cameraPositions() turns back into the world
//   cameraPositions(locals, anchor, basis, out)   the objects back in the world round the anchor, in the camera's basis now
//   orbitBasis(cam, anchor, out)   the horizontal basis the boss's plates face the camera with (back = boss → camera, flat)
//   bossBallRadius(dist, H, vfov)  an option ball's radius on the boss: a readable size on the screen, clamped in metres
//   arenaTypeFrame({ W, H, top, bottom })   the 字弹's typing pose in the rig's frame (type/frame.js's search) for the band
//                             the screen really leaves — top = the strip's bottom edge, bottom = the game keyboard's top
//                             edge (px): PLAY §3 M4 as written — her head below the keyboard's MIDDLE row, the whole
//                             typewriter AND its sheet (paper top) inside the band, 16 px from the sides; on every screen
//                             (frame.js's frameFor assumes a strip 10 % of the screen tall and lets the sheet's top run
//                             under it, and on a wide screen takes the far row: the strip is 2–3 × that, so the sheet and
//                             her keys went under it — LEARN §24)
import { LEARN } from '../../../config.js';
import { isBanner } from '../layout.js';
import { targetLabels } from '../m1.js';
import { RIG_POINTS, FRAME, searchFrame } from '../type/frame.js';

const TYPED = new Set(['type', 'typed', 'write']);

export function canPlayArena(item, p) {
  if (!p || p.type !== 'choice' || p._flip) return false;
  if (p._alt && p._alt !== 'choice-of-typed') return false;
  const n = (p.options || []).length;
  if (n < 2 || n > 4) return false;
  const labels = targetLabels(p);
  if (labels.some((l) => !l.text)) return false;
  return n <= LEARN.m1.bannerMax || !isBanner(labels);
}

export function arenaKind(item, p) {
  if (!p) return null;
  if (canPlayArena(item, p)) return 'm1';
  if (p._flip) return null;
  if (TYPED.has(p.type)) return 'type';
  return null;
}

// the boss's sockets by option count (bossModelGeo.js sockets: eyeL / eyeR are the hit shapes' weak points, belly the
// phase-3 weak point, cannon the nozzle tip — all on its front, all it shows her while it faces the squad)
export const WEAK_SOCKETS = { 2: ['eyeL', 'eyeR'], 3: ['eyeL', 'eyeR', 'belly'], 4: ['eyeL', 'eyeR', 'belly', 'cannon'] };
export function weakSockets(n) { return (WEAK_SOCKETS[n] || WEAK_SOCKETS[4]).slice(0, Math.max(2, Math.min(4, n))); }

// objs: [{ x, y, z, plate: { x, y, z } }] (world); anchor { x, y, z }; basis { right, up, back } unit vectors → 6 floats
// per object: the object's offsets from the anchor along right / up / back, then its plate's
export function clusterLocals(objs, anchor, basis, out = new Float32Array(objs.length * 6)) {
  const { right, up, back } = basis;
  for (let i = 0; i < objs.length; i++) {
    const o = objs[i], dx = o.x - anchor.x, dy = o.y - anchor.y, dz = o.z - anchor.z;
    out[i * 6] = dx * right.x + dy * right.y + dz * right.z; out[i * 6 + 1] = dx * up.x + dy * up.y + dz * up.z; out[i * 6 + 2] = dx * back.x + dy * back.y + dz * back.z;
    const p = o.plate, px = p.x - anchor.x, py = p.y - anchor.y, pz = p.z - anchor.z;
    out[i * 6 + 3] = px * right.x + py * right.y + pz * right.z; out[i * 6 + 4] = px * up.x + py * up.y + pz * up.z; out[i * 6 + 5] = px * back.x + py * back.y + pz * back.z;
  }
  return out;
}

// the objects back in the world round the anchor in a basis (the camera's as it is now: the cluster is a billboard
// pinned at its anchor — the same pixels from wherever she looks at it). out: preallocated [{ x, y, z, plate }]
export function cameraPositions(locals, anchor, basis, out) {
  const n = locals.length / 6, { right, up, back } = basis;
  for (let i = 0; i < n; i++) {
    const o = out[i] || (out[i] = { x: 0, y: 0, z: 0, plate: { x: 0, y: 0, z: 0 } });
    const lx = locals[i * 6], ly = locals[i * 6 + 1], lz = locals[i * 6 + 2], px = locals[i * 6 + 3], py = locals[i * 6 + 4], pz = locals[i * 6 + 5];
    o.x = anchor.x + right.x * lx + up.x * ly + back.x * lz; o.y = anchor.y + right.y * lx + up.y * ly + back.y * lz; o.z = anchor.z + right.z * lx + up.z * ly + back.z * lz;
    o.plate.x = anchor.x + right.x * px + up.x * py + back.x * pz; o.plate.y = anchor.y + right.y * px + up.y * py + back.y * pz; o.plate.z = anchor.z + right.z * px + up.z * py + back.z * pz;
  }
  return out;
}

// the horizontal basis the boss's plates face the camera with: back = from the boss towards the camera, flattened (the
// balls hang straight down from their sockets), right = up × back. false when the camera is (nearly) over it.
export function orbitBasis(cam, anchor, out) {
  let bx = cam.x - anchor.x, bz = cam.z - anchor.z;
  const l = Math.hypot(bx, bz);
  if (l < 1.2) return false;
  bx /= l; bz /= l;
  out.back.x = bx; out.back.y = 0; out.back.z = bz;
  out.up.x = 0; out.up.y = 1; out.up.z = 0;
  out.right.x = bz; out.right.y = 0; out.right.z = -bx;
  return true;
}

// the ball radius an option hangs on the boss with: a readable size on the screen (LEARN.arena.bossPx px of radius at
// the socket's distance), never under bossBall m nor over bossBallMax m
export function bossBallRadius(dist, H, vfovDeg, A = LEARN.arena) {
  const wpp = (2 * Math.max(1, dist) * Math.tan((vfovDeg * Math.PI) / 360)) / Math.max(1, H);
  return Math.max(A.bossBall, Math.min(A.bossBallMax, A.bossPx * wpp));
}

// The typing pose, searched for the free part of the screen. Candidates: the band under the strip (full width), and — on
// a wide screen, where the strip and the keyboard leave a band ~125 px tall — the corners beside the strip (left / right
// of it, from the top to the keyboard, clear of the HUD's top-row buttons the caller passes as `avoid`). In each region:
// the camera behind her right shoulder (FRAME.side), B m back and H m up, pitched so the rig's middle sits in the region's
// middle and turned so it sits in the region's horizontal middle; every rig point (key plate, strike, sheet top, typed
// lines) inside the region, her head below the middle row; the nearest such camera (the biggest rig) wins, then the region
// whose rig is biggest on the screen. Pure; cached per screen / region (≈ 30 ms a region).
// (the sheet rides the carriage: rig.js _carriageX puts its middle 0.62 m to her right at the first letter and 0.62 m to
// her left at the fourteenth, the sheet 1.46 m wide — so the whole of its travel is framed, ±1.36 m, top and foot)
const SHEET_X = 0.624 + 0.73 + 0.02;
export const TYPE_PTS = [...RIG_POINTS.plate, RIG_POINTS.strike, ...RIG_POINTS.paperTop, RIG_POINTS.typed10, ...RIG_POINTS.textLines,
  [SHEET_X, 2.3, 1.72], [-SHEET_X, 2.3, 1.72], [SHEET_X, 1.6, 1.7], [-SHEET_X, 1.6, 1.7]];
const RIG_CY = (Math.min(...TYPE_PTS.map((p) => p[1])) + Math.max(...TYPE_PTS.map((p) => p[1]))) / 2;
const _frames = new Map();
function projectFrom(p, cam, yaw, pitch, t, aspect) {
  const cp = Math.cos(pitch), f0 = Math.sin(yaw) * cp, f1 = Math.sin(pitch), f2 = Math.cos(yaw) * cp;
  const rl = Math.hypot(f2, f0) || 1, r0 = -f2 / rl, r2 = f0 / rl;                       // right = forward × up (frame.js)
  const u0 = -f1 * r2, u1 = r2 * f0 - r0 * f2, u2 = r0 * f1;                              // up = right × forward
  const d0 = p[0] - cam[0], d1 = p[1] - cam[1], d2 = p[2] - cam[2];
  const z = d0 * f0 + d1 * f1 + d2 * f2;
  return [(d0 * r0 + d2 * r2) / (z * t * aspect), (d0 * u0 + d1 * u1 + d2 * u2) / (z * t), z];
}
export function searchRegion(reg, W, H, vfov) {
  const aspect = W / H, t = Math.tan((vfov * Math.PI) / 360);
  const nx0 = (2 * reg.x0) / W - 1, nx1 = (2 * reg.x1) / W - 1, ny0 = 1 - (2 * reg.y1) / H, ny1 = 1 - (2 * reg.y0) / H;   // NDC: x left → right, y bottom → top
  const xMid = (nx0 + nx1) / 2, yMid = (ny0 + ny1) / 2, cz = 1.0;
  let best = null;
  for (let B = 1.2; B <= 14; B += 0.15) for (let Hc = 1.8; Hc <= 10; Hc += 0.15) {
    // (off the middle of the screen by sliding the camera sideways, not by turning it: a turned camera rolls the rig's
    // depth into the screen's height and her head rises over the keys)
    const zc = Math.hypot(cz + B, Hc - RIG_CY);
    const cam = [FRAME.side + xMid * zc * t * aspect, Hc, -B];
    const pitch = Math.atan2(RIG_CY - Hc, cz + B) - Math.atan(yMid * t);   // (down a little more: the rig shows higher)
    const yaw = Math.atan2(-FRAME.side, cz + B);
    let ok = true, x0 = 9, x1 = -9, y0 = 9, y1 = -9;
    for (const p of TYPE_PTS) {
      const [x, y, z] = projectFrom(p, cam, yaw, pitch, t, aspect);
      if (z <= 0.3 || x < nx0 || x > nx1 || y < ny0 || y > ny1) { ok = false; break; }
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
    }
    if (!ok) continue;
    const hy = projectFrom(RIGHT_HEAD, cam, yaw, pitch, t, aspect)[1], my = projectFrom(RIG_POINTS.midRow, cam, yaw, pitch, t, aspect)[1];
    if (!(hy < my)) continue;
    const r = Math.hypot(B, Hc - 1.2, cam[0]);
    if (!best || r < best.r) best = { r, cam, yaw, pitch, area: (x1 - x0) * (y1 - y0) * W * H / 4 };
  }
  if (!best) return null;
  const { cam, yaw, pitch } = best, cp = Math.cos(pitch);
  const look = [cam[0] + Math.sin(yaw) * cp * 4, cam[1] + Math.sin(pitch) * 4, cam[2] + Math.cos(yaw) * cp * 4];
  return { pos: cam.map((v) => +v.toFixed(3)), look: look.map((v) => +v.toFixed(3)), fov: vfov, fits: true, area: Math.round(best.area), region: reg };
}
const RIGHT_HEAD = RIG_POINTS.head;
// { W, H, top (the strip's bottom), bottom (the keyboard's top), strip: { x0, x1 } (its sides), avoid: [{ x, y, w, h }] }
export function arenaTypeFrame({ W, H, top, bottom, strip = null, avoid = [], vfov = FRAME.vfov, pad = 8, side = 16 }) {
  const t = Math.max(0, Math.round(top)), b = Math.min(H, Math.round(bottom));
  const key = `${W}x${H}:${t}:${b}:${strip ? Math.round(strip.x0) + '-' + Math.round(strip.x1) : ''}:${avoid.map((r) => Math.round(r.x) + ',' + Math.round(r.y)).join(';')}:${vfov}`;
  const hit = _frames.get(key); if (hit) return hit;
  const regs = [{ x0: side, x1: W - side, y0: t + pad, y1: b - pad, what: 'band' }];
  if (strip && W > H) {
    // beside the strip: from under the HUD's top row (what `avoid` holds on that side) down to the keyboard
    const lo = (x0, x1) => avoid.filter((r) => r.x < x1 && r.x + r.w > x0).reduce((y, r) => Math.max(y, r.y + r.h), side) + pad;
    if (strip.x0 - pad - side > 120) regs.push({ x0: side, x1: strip.x0 - pad, y0: lo(side, strip.x0 - pad), y1: b - pad, what: 'left' });
    if (W - side - strip.x1 - pad > 120) regs.push({ x0: strip.x1 + pad, x1: W - side, y0: lo(strip.x1 + pad, W - side), y1: b - pad, what: 'right' });
  }
  let out = null;
  for (const reg of regs) { if (reg.y1 - reg.y0 < 60) continue; const f = searchRegion(reg, W, H, vfov); if (f && (!out || f.area > out.area * 1.15)) out = f; }
  if (!out) out = { ...searchFrame(TYPE_PTS, [(P) => P(RIGHT_HEAD) < P(RIG_POINTS.midRow)], { aspect: W / H, vfov, yLo: 1 - (2 * (b - pad)) / H, yHi: 1 - (2 * (t + pad)) / H, xLim: 1 - (2 * side) / W, cz: 1.0 }), region: regs[0] };
  if (_frames.size > 16) _frames.clear();
  _frames.set(key, out);
  return out;
}
