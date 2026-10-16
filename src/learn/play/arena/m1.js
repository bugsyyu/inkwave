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
import { LEARN } from '../../../config.js';
import { isBanner } from '../layout.js';
import { targetLabels } from '../m1.js';

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
