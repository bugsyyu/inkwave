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
//   keysBand(aspect, W, H, insets) → band   LEARN §48: the band while the HUD shows the board's keys (hud-learn framed()):
//       upright, under their row (the walk bar's place); turned, right of their column — a lopsided band (left / right):
//       frameBoard then moves the camera sideways, still straight in front of the board. Both clear the safe area.
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
  const L = band.left ?? band.side, R = band.right ?? band.side;   // (LEARN §48: a lopsided band — keysBand)
  const bandW = W - L - R, bandH = H - band.top - band.bottom;
  const w = board.w, h = board.h, cy = (board.bottom ?? BD.bottom) + h / 2;
  // the distance at which the board's height fills the band's height, or its width the band's width
  const dH = (h / 2) / (t * (bandH / H)), dW = (w / 2) / (t * aspect * (bandW / W));
  const d = Math.max(dH, dW) * 1.015;
  // the band's centre on the screen (NDC y): the board's centre goes there — the camera sits that much lower / higher
  const ndcC = 1 - ((band.top + bandH / 2) / H) * 2;
  const camY = cy - ndcC * d * t;
  // (and a lopsided band's centre across: the camera that much to the side, looking as straight ahead — the text frontal)
  const ndcX = ((L + bandW / 2) / W) * 2 - 1, camX = Math.abs(ndcX) > 1e-9 ? +(-ndcX * d * t * aspect).toFixed(3) : 0;
  const pxPerM = H / (2 * d * t);
  const rect = { w: w * pxPerM, h: h * pxPerM };
  rect.x = L + (bandW - rect.w) / 2; rect.y = band.top + (bandH - rect.h) / 2;
  const fits = rect.w <= bandW + 0.5 && rect.h <= bandH + 0.5;
  return { pos: [camX, +camY.toFixed(3), +d.toFixed(3)], look: [camX, +camY.toFixed(3), 0], fov: vfov, d, rect, pxPerM, fits, band };
}
// LEARN §48: the board's keys (hud-learn framed(): 看全文 · 继续 ›) — upright they keep the walk bar's place, the row's
// bottom KEYS.row px under the top inset; turned they stand in a column at the left, KEYS.col px wide with its margins.
// The band keeps clear of them and of the safe area (insets in px: src/ui/safe-area.js); the far side keeps the usual
// margin — or, turned, clears what the touch layer's live keys reach in from the right (ins.reach px: jump, squid, ⏸
// stood over a word board's rows there, and a tap on a row was a jump: landscape.js keysBandNow)
export const KEYS = { row: 130, col: 160 };
export function keysBand(aspect, W, H, ins = {}) {
  const b = boardBand(aspect, W, H), t = ins.top || 0, r = ins.right || 0, bo = ins.bottom || 0, l = ins.left || 0;
  if (aspect < 1) return { ...b, top: Math.max(b.top, t + KEYS.row), bottom: b.bottom + bo, side: b.side + Math.max(l, r) };
  return { ...b, top: b.top + t, bottom: b.bottom + bo, left: l + KEYS.col, right: Math.max(b.side + r, ins.reach ? ins.reach + 8 : 0) };
}
// the smallest text on a framed board, in screen px (canvas px × screen px per canvas px)
export function onScreenFont(layout, frame, boardW) { return layout.minFont * (frame.rect.w / layout.W) * (boardW ? 1 : 1); }

// play-8: a stretch too short for n boards gap apart (a whole day's first gate near the spawn: four sound boards on
// w1d1's 12 m) used to pile the far ones on the stretch's start — one spot, one board framed for ever, the auto-walk
// stopping there again and again. Now they close up to `minGap` (a board's width and a little), then stand on both sides
// of the route in turn (her right, her left), then come nearer the gate; only on a stretch shorter than all that do they
// share it evenly (BoardWalk frames an unread one of two boards at one spot first — walk.js).
export function boardSpots(route, n, o = {}) {
  const side = o.side ?? BD.side, view = o.view ?? BD.view, minGap = o.minGap ?? 2.8;
  let gap = o.gap ?? BD.gap, endGap = o.endGap ?? 5, alt = false;
  if (!route || route.length < 2 || n <= 0) return [];
  // walk back from the gate: the last board endGap m before it, the others gap m apart, back towards the start
  const seg = [];
  let acc = 0;
  for (let i = route.length - 1; i > 0; i--) { const a = route[i], b = route[i - 1], L = Math.hypot(b.x - a.x, b.z - a.z); seg.push({ a, b, s0: acc, L }); acc += L; }
  const total = acc, out = [];
  const fits = () => endGap + gap * (n - 1) <= total + 1e-9;
  if (n > 1 && !fits()) {
    gap = Math.max(minGap, (total - endGap) / (n - 1));
    if (!fits()) { alt = true; gap = Math.max(minGap / 2, (total - endGap) / (n - 1)); }
    if (!fits()) endGap = Math.max(2, total - gap * (n - 1));
    if (!fits()) gap = Math.max(0, (total - endGap) / (n - 1));
  }
  for (let k = 0; k < n; k++) {
    const s = Math.min(total, endGap + gap * (n - 1 - k)), sd = alt && (n - 1 - k) % 2 ? -1 : 1;   // (alt: every other one on her left)
    let sg = seg[seg.length - 1];
    for (const q of seg) if (s <= q.s0 + q.L + 1e-9) { sg = q; break; }
    const f = sg.L > 1e-6 ? (s - sg.s0) / sg.L : 0;
    const x = sg.a.x + (sg.b.x - sg.a.x) * f, y = sg.a.y + (sg.b.y - sg.a.y) * f, z = sg.a.z + (sg.b.z - sg.a.z) * f;
    // the walking direction there (start → gate) and her right of it (+X is her left when she faces +Z)
    const dx = sg.a.x - sg.b.x, dz = sg.a.z - sg.b.z, dl = Math.hypot(dx, dz) || 1, fx = dx / dl, fz = dz / dl;
    const rx = -fz, rz = fx;   // her right: forward × up … (fx, fz) → (−fz, fx) turns +Z into −X (her right)
    const bx = x + rx * side * sd + fx * 0.6, bz = z + rz * side * sd + fz * 0.6;
    // the board faces her coming: back down the route, turned a little towards the route's middle
    const yaw = Math.atan2(-fx - rx * 0.35 * sd, -fz - rz * 0.35 * sd);
    out.push({ x: bx, y, z: bz, yaw, view: { x: bx + Math.sin(yaw) * view, y, z: bz + Math.cos(yaw) * view } });
  }
  return out;
}
