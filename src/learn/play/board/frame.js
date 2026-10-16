// 展板路 M6 — where the camera goes to read a board, and where the boards stand (pure; Node-tested).
//
//   frameBoard({ w, h, bottom }, aspect, opts) → { pos, look, fov, d, rect: { x, y, w, h } (px), scale (screen px per
//       canvas px), fits }   the board's frame: origin on the ground under the board's middle, the board facing +Z; the
//       camera straight in front of it (level: the text is frontal, crisp), far enough that the board fills the band
//       between the HUD's top row and the bottom edge, centred in it. Her viewing spot (LEARN.board.view m in front) is
//       between the camera and the board, below the board's lower edge (bottom ≥ 1.6 m): she never hides it.
//   boardSpots(route, n, opts) → [{ x, y, z, yaw, view: { x, y, z } }]   n boards along the last stretch of a route (a
//       polyline [{ x, y, z }] ending at the gate), LEARN.board.gap apart, first one nearest the start, each
//       LEARN.board.side m to her right of the route, facing back down the route (towards her as she comes)
//   onScreenFont(layout, frame) → the smallest text's px on screen
import { LEARN } from '../../../config.js';

const BD = LEARN.board;
// the band a framed board fills: under the HUD's top row (no question strip while she reads: boards are never shown
// while a question is up), over the bottom edge, 16 px from the sides
export function boardBand(aspect, W, H) {
  const portrait = aspect < 1;
  return { top: portrait ? 64 : 40, bottom: portrait ? 18 : 8, side: portrait ? 10 : 16, W, H };
}

export function frameBoard(board, aspect, o = {}) {
  const vfov = o.vfov || 52, H = o.H || (aspect < 1 ? 844 : 390), W = o.W || Math.round(H * aspect);
  const band = o.band || boardBand(aspect, W, H);
  const t = Math.tan((vfov * Math.PI) / 360);
  const bandW = W - band.side * 2, bandH = H - band.top - band.bottom;
  const w = board.w, h = board.h, cy = (board.bottom ?? BD.bottom) + h / 2;
  // the distance at which the board's height fills the band's height, or its width the band's width
  const dH = (h / 2) / (t * (bandH / H)), dW = (w / 2) / (t * aspect * (bandW / W));
  const d = Math.max(dH, dW) * 1.015;
  // the band's centre on the screen (NDC y): the board's centre goes there — the camera sits that much lower / higher
  const ndcC = 1 - ((band.top + bandH / 2) / H) * 2;
  const camY = cy - ndcC * d * t;
  const pxPerM = H / (2 * d * t);
  const rect = { w: w * pxPerM, h: h * pxPerM };
  rect.x = (W - rect.w) / 2; rect.y = band.top + (bandH - rect.h) / 2;
  const fits = rect.w <= bandW + 0.5 && rect.h <= bandH + 0.5;
  return { pos: [0, +camY.toFixed(3), +d.toFixed(3)], look: [0, +camY.toFixed(3), 0], fov: vfov, d, rect, pxPerM, fits, band };
}
// the smallest text on a framed board, in screen px (canvas px × screen px per canvas px)
export function onScreenFont(layout, frame, boardW) { return layout.minFont * (frame.rect.w / layout.W) * (boardW ? 1 : 1); }

export function boardSpots(route, n, o = {}) {
  const gap = o.gap ?? BD.gap, side = o.side ?? BD.side, endGap = o.endGap ?? 5, view = o.view ?? BD.view;
  if (!route || route.length < 2 || n <= 0) return [];
  // walk back from the gate: the last board endGap m before it, the others gap m apart, back towards the start
  const seg = [];
  let acc = 0;
  for (let i = route.length - 1; i > 0; i--) { const a = route[i], b = route[i - 1], L = Math.hypot(b.x - a.x, b.z - a.z); seg.push({ a, b, s0: acc, L }); acc += L; }
  const total = acc, out = [];
  for (let k = 0; k < n; k++) {
    const s = Math.min(total, endGap + gap * (n - 1 - k));
    let sg = seg[seg.length - 1];
    for (const q of seg) if (s <= q.s0 + q.L + 1e-9) { sg = q; break; }
    const f = sg.L > 1e-6 ? (s - sg.s0) / sg.L : 0;
    const x = sg.a.x + (sg.b.x - sg.a.x) * f, y = sg.a.y + (sg.b.y - sg.a.y) * f, z = sg.a.z + (sg.b.z - sg.a.z) * f;
    // the walking direction there (start → gate) and her right of it (+X is her left when she faces +Z)
    const dx = sg.a.x - sg.b.x, dz = sg.a.z - sg.b.z, dl = Math.hypot(dx, dz) || 1, fx = dx / dl, fz = dz / dl;
    const rx = -fz, rz = fx;   // her right: forward × up … (fx, fz) → (−fz, fx) turns +Z into −X (her right)
    const bx = x + rx * side + fx * 0.6, bz = z + rz * side + fz * 0.6;
    // the board faces her coming: back down the route, turned a little towards the route's middle
    const yaw = Math.atan2(-fx - rx * 0.35, -fz - rz * 0.35);
    out.push({ x: bx, y, z: bz, yaw, view: { x: bx + Math.sin(yaw) * view, y, z: bz + Math.cos(yaw) * view } });
  }
  return out;
}
