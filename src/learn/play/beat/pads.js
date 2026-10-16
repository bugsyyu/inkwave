// 节拍台 M3 — where the pads stand, how the camera frames them, and which pad a tap / swipe / key means
// (docs/PLAY.md §3 M3, §6.3, §8). Pure (Node-tested): no DOM, no three.js.
//
// The stage frame: origin at the home pad (where she stands when the word comes), +Z forward (away from the camera),
// +X her left (= the screen's left: the camera is behind her) — the type rig's frame (src/learn/play/type/frame.js).
//
//   PAD_DIRS[n]                      the pads in option order: 2 → left · right; 4 → up · left · right · down (a dance
//                                    pad: a cross round her, so arrows, swipes and the four sides of the screen all map
//                                    one to one; A–D / 1–4 in reading order)
//   stageLayout(n, aspect, opts)     → { n, dirs, pads: [{ i, dir, x, z, r }], home: { x, z, r }, labels: [{ i, x, y, z,
//                                    w, h, s }], cam: { pos, look, fov, fits }, px: { font, label: [{ w, h }], pads:
//                                    [{ x, y }], minFont, safe } } — pads per orientation (portrait deep and narrow,
//                                    landscape wide and shallow), the label plates round the outside, and the camera pose
//                                    that keeps every pad, label and her inside the safe band; labels grow until their
//                                    smaller line is ≥ LEARN.beat.font px on screen
//   padOfTap(x, y, pts)              the pad whose projected centre is nearest (its region of the screen: two pads = the
//                                    two halves, four = the four sides of the dance pad) — every region far over 44 pt
//   padOfSwipe(dx, dy, n, min)       a swipe's direction → the pad on that side (or −1)
//   padOfKey(key, n)                 ← → (↑ ↓) by side, a–d / 1–4 by option order (or −1)
import { LEARN } from '../../../config.js';
import { projectRig } from '../type/frame.js';

const B = LEARN.beat;
export const PAD_DIRS = { 2: ['left', 'right'], 4: ['up', 'left', 'right', 'down'] };
export const ARROW = { up: '↑', left: '←', right: '→', down: '↓' };
export const LETTER = ['A', 'B', 'C', 'D'];

// pad centres per orientation (m, stage frame) and where each label stands relative to its pad: 'above' (over the
// pad, a little behind it), 'out' (outside the stage on that side), 'beyond' / 'near' (past / before the pad)
const PRESETS = {
  portrait: {
    2: { pads: [[1.3, 0.7], [-1.3, 0.7]], r: 0.6, label: ['above', 'above'] },
    4: { pads: [[0, 2.35], [1.35, 0.35], [-1.35, 0.35], [0, -1.75]], r: 0.58, label: ['beyond', 'above', 'above', 'near'] },
  },
  landscape: {
    2: { pads: [[1.9, 0.7], [-1.9, 0.7]], r: 0.62, label: ['above', 'above'] },
    4: { pads: [[0, 1.55], [2.55, 0.1], [-2.55, 0.1], [0, -1.35]], r: 0.58, label: ['out', 'out', 'out', 'out'] },
  },
};
export const HOME_R = 0.5;
export const LABEL = { w: 1.44, h: 0.72, cell: [384, 192], en: 75, zh: 58 };   // m, and the atlas cell (px) and its two lines' font px

export function orientationOf(aspect) { return aspect < 1 ? 'portrait' : 'landscape'; }

function labelAnchor(kind, p, dir, w, h) {
  const [x, z] = p;
  switch (kind) {
    case 'above': return [x, 0.95 + h / 2, z + 0.25];
    case 'beyond': return [x, 0.2 + h / 2, z + 1.05];
    case 'near': return [x, 0.12 + h / 2, z - 1.0];
    case 'out': {
      if (dir === 'up') return [x, 0.15 + h / 2, z + 0.95];
      if (dir === 'down') return [x, 0.1 + h / 2, z - 0.95];
      const s = dir === 'left' ? 1 : -1;
      return [x + s * (0.58 + w / 2), 0.2 + h / 2, z];
    }
    default: return [x, 1 + h / 2, z];
  }
}

// the camera's right / up for a look direction (the rig frame's convention: right = forward × up)
function basis(cam, look) {
  const f = [look[0] - cam[0], look[1] - cam[1], look[2] - cam[2]], fl = Math.hypot(f[0], f[1], f[2]);
  f[0] /= fl; f[1] /= fl; f[2] /= fl;
  const rl = Math.hypot(f[2], f[0]) || 1, r = [-f[2] / rl, 0, f[0] / rl];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { f, r, u };
}

/**
 * The stage for n pads at this aspect, framed into the safe band (fractions of the screen): top (under the question
 * strip), bottom, side (px → a fraction of the width). opts: { vfov = 52, top, bottom, sidePx = 16, W (px, for the font
 * check), font (px), pitch }.
 */
export function stageLayout(n, aspect, opts = {}) {
  const o = orientationOf(aspect), P = PRESETS[o][n === 4 ? 4 : 2], dirs = PAD_DIRS[n === 4 ? 4 : 2];
  const vfov = opts.vfov || 52, H = opts.H || (aspect < 1 ? 844 : 390), W = opts.W || Math.round(H * aspect);
  const top = opts.top ?? (aspect < 1 ? 0.2 : 0.24), bottom = opts.bottom ?? 0.05, side = (opts.sidePx ?? 16) / W;
  const font = opts.font ?? B.font, pitch = opts.pitch ?? (aspect < 1 ? B.pitch[0] : B.pitch[1]);
  const pads = P.pads.map(([x, z], i) => ({ i, dir: dirs[i], x, z, r: P.r }));
  const home = { x: 0, z: 0, r: HOME_R };
  // the band in NDC
  const yLo = -1 + 2 * bottom, yHi = 1 - 2 * top, xLim = 1 - 2 * side;
  let scale = 1, best = null;
  for (let pass = 0; pass < 4; pass++) {
    const w = LABEL.w * scale, h = LABEL.h * scale;
    const labels = pads.map((p) => { const a = labelAnchor(P.label[p.i], [p.x, p.z], p.dir, w, h); return { i: p.i, x: a[0], y: a[1], z: a[2], w, h, s: scale }; });
    best = frame(pads, home, labels, { aspect, vfov, pitch, yLo, yHi, xLim });
    // the label lines on screen: the smaller (Chinese) line's px at the farthest label
    const px = labelPx(best.cam, labels, aspect, vfov, H);
    best.labels = labels; best.px = px;
    const minFont = Math.min(...px.label.map((l) => l.zh));
    if (minFont >= font || pass === 3) break;
    scale *= Math.min(1.6, (font / minFont) * 1.03);
  }
  return { n: pads.length, dirs, orientation: o, pads, home, labels: best.labels, cam: best.cam, px: { ...best.px, pads: best.pads, safe: { yLo, yHi, xLim } } };
}

// the closest camera (fixed pitch, looking at the stage) that keeps every point in the band, centred in it
function frame(pads, home, labels, b) {
  const { aspect, vfov, pitch, yLo, yHi, xLim } = b;
  const pts = [];
  for (const p of [...pads, home]) for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; pts.push([p.x + Math.cos(a) * p.r, 0.08, p.z + Math.sin(a) * p.r]); }
  pts.push([0, 1.6, 0], [0.35, 1.2, 0], [-0.35, 1.2, 0]);   // her (she stands on the home pad)
  const zs = pts.map((p) => p[2]).concat(labels.map((l) => l.z));
  let lz = (Math.min(...zs) + Math.max(...zs)) / 2, ly = 0.6;
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const fits = (R) => {
    const cam = [0, ly + R * sp, lz - R * cp], look = [0, ly, lz];
    const { r, u } = basis(cam, look);
    let minY = 9, maxY = -9, maxX = 0;
    const take = (p) => { const q = projectRig(p, cam, look, vfov, aspect); if (q[2] <= 0.2) { minY = -9; return; } minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]); maxX = Math.max(maxX, Math.abs(q[0])); };
    for (const p of pts) take(p);
    for (const l of labels) for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) take([l.x + r[0] * sx * l.w / 2 + u[0] * sy * l.h / 2, l.y + u[1] * sy * l.h / 2, l.z + r[2] * sx * l.w / 2 + u[2] * sy * l.h / 2]);
    return { cam, look, minY, maxY, maxX };
  };
  let R = 6;
  for (let it = 0; it < 3; it++) {
    // bisection on the distance: the nearest that fits the band's height and width
    let lo = 2, hi = 40;
    for (let k = 0; k < 40; k++) {
      const m = (lo + hi) / 2, f = fits(m);
      if (f.maxX <= xLim && f.maxY - f.minY <= yHi - yLo) hi = m; else lo = m;
    }
    R = hi;
    // centre the content in the band: move the look point along the camera's up by the NDC offset
    const f = fits(R), off = (f.minY + f.maxY) / 2 - (yLo + yHi) / 2;
    const dist = R, t = Math.tan((vfov * Math.PI) / 360);
    ly += off * dist * t * cp; lz += off * dist * t * sp;
  }
  const f = fits(R);
  const ok = f.maxX <= xLim + 1e-3 && f.minY >= yLo - 1e-3 && f.maxY <= yHi + 1e-3;
  const padsPx = pads.map((p) => { const q = projectRig([p.x, 0.08, p.z], f.cam, f.look, vfov, aspect); return { x: q[0], y: q[1] }; });
  return { cam: { pos: f.cam.map((v) => +v.toFixed(3)), look: f.look.map((v) => +v.toFixed(3)), fov: vfov, fits: ok, ndc: { minY: +f.minY.toFixed(3), maxY: +f.maxY.toFixed(3), maxX: +f.maxX.toFixed(3) } }, pads: padsPx };
}

// each label's line heights on screen (px): the plate's projected height × the line's share of the cell
function labelPx(cam, labels, aspect, vfov, H) {
  const t = Math.tan((vfov * Math.PI) / 360);
  const { f } = basis(cam.pos, cam.look);
  const label = labels.map((l) => {
    const d = (l.x - cam.pos[0]) * f[0] + (l.y - cam.pos[1]) * f[1] + (l.z - cam.pos[2]) * f[2];
    const pxPerM = H / (2 * d * t);
    return { en: +((LABEL.en / LABEL.cell[1]) * l.h * pxPerM).toFixed(1), zh: +((LABEL.zh / LABEL.cell[1]) * l.h * pxPerM).toFixed(1), w: +(l.w * pxPerM).toFixed(0), h: +(l.h * pxPerM).toFixed(0) };
  });
  return { label };
}

// ---------------------------------------------------------------------------------------------- input
// the nearest projected pad centre (pts: [{ x, y }] in px, or in NDC — any one space). -1 when there are none.
export function padOfTap(x, y, pts) {
  let best = -1, bd = Infinity;
  for (let i = 0; i < (pts ? pts.length : 0); i++) {
    const p = pts[i]; if (!p) continue;
    const d = (x - p.x) * (x - p.x) + (y - p.y) * (y - p.y);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}
// a swipe (screen px; +y down): the pad on that side. Two pads take any mostly sideways swipe; four take the
// dominant axis.
export function padOfSwipe(dx, dy, n, min = B.swipe) {
  const ax = Math.abs(dx), ay = Math.abs(dy);
  if (Math.max(ax, ay) < min) return -1;
  const dirs = PAD_DIRS[n === 4 ? 4 : 2];
  let dir;
  if (n !== 4) { if (ax < ay * 0.6) return -1; dir = dx < 0 ? 'left' : 'right'; }
  else dir = ax >= ay ? (dx < 0 ? 'left' : 'right') : (dy < 0 ? 'up' : 'down');
  return dirs.indexOf(dir);
}
const KEY_DIR = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
export function padOfKey(key, n) {
  const dirs = PAD_DIRS[n === 4 ? 4 : 2], m = dirs.length;
  if (KEY_DIR[key]) return dirs.indexOf(KEY_DIR[key]);
  const k = String(key || '').toLowerCase();
  const i = 'abcd'.indexOf(k) >= 0 && k.length === 1 ? 'abcd'.indexOf(k) : '1234'.indexOf(k) >= 0 && k.length === 1 ? '1234'.indexOf(k) : -1;
  return i >= 0 && i < m ? i : -1;
}
// the smallest distance from a pad's projected centre to the edge of its tap region (px): half the distance to the
// nearest other pad, or to the screen edge — what a thumb has round each pad
export function padRegionRadius(pts, W, H) {
  return pts.map((p, i) => {
    let d = Math.min(p.x, W - p.x, p.y, H - p.y);
    pts.forEach((q, j) => { if (j !== i) d = Math.min(d, Math.hypot(q.x - p.x, q.y - p.y) / 2); });
    return d;
  });
}
