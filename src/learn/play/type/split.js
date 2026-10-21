// 字弹 M4 · play-7 — the typing frame over the SPLIT landscape keyboard (docs/PLAY.md §3 M4, §8; keys.js splitLayout).
// On a landscape screen the game keyboard is two pads docked to the sides; the column between them is open from the top
// of the screen to the bottom, and that column is where the typewriter goes: the whole rig (the key plate, the strike
// point, the line being typed and the ten letters before it, the top of the sheet) inside the column, under whatever
// stands at its top (the question strip, the clock), her head below the keys' MIDDLE row (PLAY §3 M4 as written). In
// that column the typewriter is ≈ 250–290 px tall on a phone (over the full-width keyboard it was 120–160 px), and the
// typed letters ≈ 17–20 px — the frame searches the camera's height, its distance and its zoom for the biggest of the
// two (a high camera makes the rig tall but sees the paper edge-on: the score is the smaller of the two against
// SPLIT.want), and stops growing at SPLIT.cap (a desktop's column is 650 px wide: the rig would fill the screen).
// Pure (no three, no DOM): Node tests measure it (tests/learn/play-7.test.mjs); the stations (wire/type.js,
// runner/glide.js, arena/type.js) read the column off PlayKeys.rect() and the strip off the DOM, and cache by it.
//
//   splitFrame({ W, H, top, bottom, x0, x1, shelf, pts?, wide?, vfov?, pad? }) → { pos, look, fov, fits, score, px: { y0, y1, x0, x1, h, glyph, head, row }, key }
//       W × H the screen (CSS px); top = what stands at the top of the column (its bottom edge, px); bottom = the
//       screen's bottom (or what stands there); x0 … x1 the open column (PlayKeys.rect().mid); shelf = the pads' top
//       edge: above it the whole width is open, so `wide` (the sheet at the two ends of the carriage's travel, SHEET_ENDS)
//       may stand out of the column there — on the screen, under `top`, never over a pad. Rig frame as frame.js:
//       origin at her feet, +Z toward the target, +X her left; `fov` is vertical (the station hands it to cameraRig's
//       zoom: PlayCam / runner/cam.js do).
//   glyphPx(f, W, H)   the typed letter's size on the screen for a frame: GLYPH_EM projected (px)
import { FRAME, RIG_POINTS, projectRig, hyp2, hyp3 } from './frame.js';

export const SPLIT = {
  want: { h: 240, glyph: 17 },   // px: the typewriter's height on the screen, the typed letters' size (PLAY §2.2's 17 pt)
  cap: 1.6,                      // × want: no bigger than this (a wide column: the world stays in the picture)
  pad: 5,                        // px inside the column's edges and under its top
  padBottom: 14,                 // px over the screen's bottom edge: the column's width binds, not its height — so the
                                 // plate's front edge keeps this off the bottom (the boss's second sentence had the rig
                                 // a few % bigger than framed, its front corner 2 px off the screen; the home indicator)
  minFov: 0.55,                  // × vfov: the most the frame zooms in
  headMargin: 0.05,              // NDC: her head this far under the middle row (play-fix's margin: the hair sits higher than RIG_POINTS.head)
};
// the letter being typed: the line on the sheet at the strike column (deck-geo.js DECK: the carriage at platenAt, the
// sheet's foot platenR × 0.62 over it, the line firstLine up the sheet, 0.012 m in front) — one em of Titan One (the
// atlas draws letters at 0.78 of a glyph cell, DECK.glyph m) top to bottom. Numbers, not an import: deck-geo needs
// three and this stays pure (tests/learn/play-7.test.mjs checks them against DECK)
export const GLYPH_LINE = { y: 1.5 + 0.075 * 0.62 + 0.1, z: 1.695 + 0.012, em: 0.205 * 0.78 };
const LINE_Y = GLYPH_LINE.y, LINE_Z = GLYPH_LINE.z, EM = GLYPH_LINE.em;
export const GLYPH_EM = [[0, +(LINE_Y - EM / 2).toFixed(3), +LINE_Z.toFixed(3)], [0, +(LINE_Y + EM / 2).toFixed(3), +LINE_Z.toFixed(3)]];
/** what the column must hold: the key plate, the strike point, the line being typed and the line above, the first
 *  letter after ten (the carriage slid left), the top of the sheet */
export const SPLIT_PTS = [...RIG_POINTS.plate, RIG_POINTS.strike, ...RIG_POINTS.textLines, RIG_POINTS.typed10, ...RIG_POINTS.paperTop];
/** the sheet's corners at the two ends of the carriage's travel (the carriage slides ±0.624 m; the sheet is 1.46 m wide:
 *  arena/m1.js SHEET_X) — on the screen and clear of the pads, but not held to the column */
const SHEET_X = 0.624 + 0.73 + 0.02;
export const SHEET_ENDS = [[SHEET_X, 2.3, 1.72], [-SHEET_X, 2.3, 1.72], [SHEET_X, 1.6, 1.7], [-SHEET_X, 1.6, 1.7]];

const _cache = new Map();

// one pose: the camera behind her right shoulder (frame.js's FRAME.side), slid sideways by dx (m) — the column is in the
// middle of the screen and a camera off to her right sees the plate lopsided — at height Hc, B m behind her feet.
// LEARN §52: projectRig's arithmetic, a point at a time into _Q, with the pose's basis made once (it was five arrays a point,
// ~13k poses a search: 17–23 ms on a new column, i.e. turning the phone); arrays only for a pose that passes
// (tests/learn/type-frame.test.mjs: the same frames as the old split.js)
const _Q = new Float64Array(3), _B = new Float64Array(14);   // the projected point (x, y, z); the pose (cam, forward, right, up, t, aspect)
function proj(p) {
  const B = _B, d0 = p[0] - B[0], d1 = p[1] - B[1], d2 = p[2] - B[2];
  const z = d0 * B[3] + d1 * B[4] + d2 * B[5], x = d0 * B[6] + d1 * B[7] + d2 * B[8], y = d0 * B[9] + d1 * B[10] + d2 * B[11];
  _Q[0] = x / (z * B[12] * B[13]); _Q[1] = y / (z * B[12]); _Q[2] = z;
  return _Q;
}
function evalPose(o, fov, B, Hc, dx = 0) {
  const { W, H, pts, cy, yMid, xShift } = o, aspect = W / H, t = Math.tan((fov * Math.PI) / 360);
  const zc = hyp2(1.0 + B, Hc - cy);
  const c0 = FRAME.side + xShift * zc * t * aspect + dx, c1 = Hc, c2 = -B;
  const ang = Math.atan2(cy - Hc, 1.0 + B) - Math.atan(yMid * t);
  const l0 = c0 - FRAME.side, l1 = Hc + Math.tan(ang) * (1.0 + B), l2 = 1.0;
  // (projectRig's basis: forward, right = forward × up, up)
  const fx = l0 - c0, fy = l1 - c1, fz = l2 - c2, fl = hyp3(fx, fy, fz), f0 = fx / fl, f1 = fy / fl, f2 = fz / fl;
  const rl = hyp2(f2, f0) || 1, r0 = -f2 / rl, r1 = 0, r2 = f0 / rl;
  const Bs = _B;
  Bs[0] = c0; Bs[1] = c1; Bs[2] = c2; Bs[3] = f0; Bs[4] = f1; Bs[5] = f2; Bs[6] = r0; Bs[7] = r1; Bs[8] = r2;
  Bs[9] = r1 * f2 - r2 * f1; Bs[10] = r2 * f0 - r0 * f2; Bs[11] = r0 * f1 - r1 * f0; Bs[12] = Math.tan((fov * Math.PI) / 360); Bs[13] = aspect;
  let y0 = 1e9, y1 = -1e9, x0 = 1e9, x1 = -1e9;
  for (let i = 0; i < pts.length; i++) {
    const q = proj(pts[i]);
    if (q[2] <= 0.3) return null;
    const x = ((q[0] + 1) / 2) * W, y = ((1 - q[1]) / 2) * H;
    if (y < o.yLo || y > o.yHi || x < o.xLo || x > o.xHi) return null;
    if (y < y0) y0 = y; if (y > y1) y1 = y; if (x < x0) x0 = x; if (x > x1) x1 = x;
  }
  for (let i = 0; i < o.wide.length; i++) {
    const q = proj(o.wide[i]);
    if (q[2] <= 0.3) return null;
    const x = ((q[0] + 1) / 2) * W, y = ((1 - q[1]) / 2) * H;
    if (y < o.yLo || x < o.side || x > W - o.side) return null;
    if (y > o.shelf && (x < o.xLo || x > o.xHi)) return null;
  }
  const hy = proj(RIG_POINTS.head)[1], ry = proj(RIG_POINTS.midRow)[1];
  if (!(hy < ry - SPLIT.headMargin)) return null;
  const g0 = proj(GLYPH_EM[0])[1], g1 = proj(GLYPH_EM[1])[1];
  const glyph = ((g1 - g0) / 2) * H, h = y1 - y0;
  const score = Math.min(glyph / SPLIT.want.glyph, h / SPLIT.want.h);
  return { cam: [c0, c1, c2], look: [l0, l1, l2], fov, dx, score, px: { y0, y1, x0, x1, h, glyph, head: ((1 - hy) / 2) * H, row: ((1 - ry) / 2) * H } };
}
// the better of two: up to the cap the bigger; past it, the one nearer the cap with the less zoom
function better(a, b) {
  if (!b) return true;
  const ca = Math.min(a.score, SPLIT.cap), cb = Math.min(b.score, SPLIT.cap);
  if (Math.abs(ca - cb) > 0.002) return ca > cb;
  if (a.fov !== b.fov) return a.fov > b.fov;
  return a.score < b.score;
}

/** the typing frame in the open column of the split keyboard (rig frame) */
export function splitFrame({ W, H, top, bottom = H, x0, x1, shelf = bottom, pts = SPLIT_PTS, wide = SHEET_ENDS, vfov = FRAME.vfov, pad = SPLIT.pad } = {}) {
  const key = `${W}x${H}:${Math.round(top)}:${Math.round(bottom)}:${Math.round(x0)}-${Math.round(x1)}:${Math.round(shelf)}:${vfov}:${pad}:${pts.length}:${wide.length}`;
  const hit = _cache.get(key); if (hit) return hit;
  const yLo = top + pad, yHi = bottom - Math.max(pad, SPLIT.padBottom), xLo = x0 + pad, xHi = x1 - pad;
  const o = { W, H, pts, wide, yLo, yHi, xLo, xHi, shelf: shelf - pad, side: 16,
    cy: (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2,
    yMid: 1 - (yLo + yHi) / H, xShift: (xLo + xHi) / W - 1 };
  let best = null;
  // coarse: zoom × distance × height, then a finer look around the best
  for (let fov = vfov; fov >= vfov * SPLIT.minFov - 1e-6; fov -= 3)
    for (let B = 0.8; B <= 9; B += 0.25) for (let Hc = 1.8; Hc <= 8; Hc += 0.2) { const c = evalPose(o, fov, B, Hc); if (c && better(c, best)) best = c; }
  if (best) {
    // (finer, and slid sideways: up to 0.4 m either way)
    const b0 = best;
    for (let fov = Math.min(vfov, b0.fov + 2); fov >= Math.max(vfov * SPLIT.minFov, b0.fov - 2) - 1e-6; fov -= 1)
      for (let B = Math.max(0.8, -b0.cam[2] - 0.25); B <= -b0.cam[2] + 0.25 + 1e-6; B += 0.05)
        for (let Hc = Math.max(1.8, b0.cam[1] - 0.2); Hc <= b0.cam[1] + 0.2 + 1e-6; Hc += 0.05)
          for (let dx = -0.4; dx <= 0.4 + 1e-6; dx += 0.1) { const c = evalPose(o, fov, B, Hc, dx); if (c && better(c, best)) best = c; }
  }
  const r = (v) => +v.toFixed(3), rp = (v) => Math.round(v * 10) / 10;
  const out = best
    ? { pos: best.cam.map(r), look: best.look.map(r), fov: +best.fov.toFixed(2), fits: true, score: +best.score.toFixed(3), px: { y0: rp(best.px.y0), y1: rp(best.px.y1), x0: rp(best.px.x0), x1: rp(best.px.x1), h: rp(best.px.h), glyph: rp(best.px.glyph), head: rp(best.px.head), row: rp(best.px.row) }, key }
    : null;
  if (_cache.size > 24) _cache.clear();
  _cache.set(key, out);
  return out;
}

/** the typed letter's size on the screen (px) for a rig-frame pose { pos, look, fov } */
export function glyphPx(f, W, H) {
  const a = W / H, g0 = projectRig(GLYPH_EM[0], f.pos, f.look, f.fov, a)[1], g1 = projectRig(GLYPH_EM[1], f.pos, f.look, f.fov, a)[1];
  return ((g1 - g0) / 2) * H;
}
