// 展板路 M6 — a tap on a board's hotspot (docs/PLAY.md §3 M6, §6.1): screen-space, pure (Node-tested).
//
//   pickHotspot(x, y, rects, { slop = 10, minHit = LEARN.ui.hit }) → the picked rect's index, −1 for none
//     rects [{ x, y, w, h } | null] in screen px (the hotspots projected as they are on screen now). Every rect is raised
//     to minHit px on each axis round its centre (a 44 pt thumb, however small the board is drawn) and grows by slop;
//     where grown rects overlap, the one whose own (un-grown) rect is nearest the tap wins.
//   canvasToBoard(hs, layout, w, h) → [x0, y0, x1, y1] in the board's plane (m, centre origin, +y up)
import { LEARN } from '../../../config.js';

function boxDist(x, y, b) { return Math.hypot(Math.max(b.x - x, 0, x - (b.x + b.w)), Math.max(b.y - y, 0, y - (b.y + b.h))); }

export function pickHotspot(x, y, rects, o = {}) {
  const slop = o.slop ?? 10, min = o.minHit ?? LEARN.ui.hit;
  let best = -1, bd = Infinity;
  for (let i = 0; i < (rects ? rects.length : 0); i++) {
    const r = rects[i]; if (!r) continue;
    const w = Math.max(r.w, min), h = Math.max(r.h, min);
    const gx = r.x + r.w / 2 - w / 2 - slop, gy = r.y + r.h / 2 - h / 2 - slop;
    if (x < gx || x > gx + w + slop * 2 || y < gy || y > gy + h + slop * 2) continue;
    const d = boxDist(x, y, r);
    if (d < bd) { bd = d; best = i; }
  }
  return best;
}

export function canvasToBoard(hs, layout, w, h) {
  const sx = w / layout.W, sy = h / layout.H;
  return [hs.x * sx - w / 2, h / 2 - (hs.y + hs.h) * sy, (hs.x + hs.w) * sx - w / 2, h / 2 - hs.y * sy];
}
