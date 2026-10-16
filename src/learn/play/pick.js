// 题即玩法 — which question object a tap is on (docs/PLAY.md §6.1). Pure (Node-tested).
//
//   pickTarget(screenX, screenY, projected, opts?) → the picked entry's `i` (or its index), -1 for none
//     projected  [{ i, kind: 'ball', cx, cy, r, label?: { x, y, w, h } } | { i, kind: 'banner', x, y, w, h } | null]
//                (the objects as they are on screen now: targets.js project(); null / { off: true } = not on screen)
//     opts       { slop = LEARN.playUi.slop, minHit = LEARN.playUi.minHit }
//   A ball is its disc plus its label plate; a banner is its rectangle. Every area grows by `slop` px, and a disc's radius
//   and a box's sides are first raised to minHit / 2 and minHit (so nothing is smaller than 44 pt to a thumb). When the
//   grown areas overlap, the nearest object wins: distance from the tap to the object's own (un-grown) shape, then to
//   its centre.
import { LEARN } from '../../config.js';

const U = LEARN.playUi;

function boxDist(x, y, b) {
  const dx = Math.max(b.x - x, 0, x - (b.x + b.w)), dy = Math.max(b.y - y, 0, y - (b.y + b.h));
  return Math.hypot(dx, dy);
}
// a box raised to `min` on each axis around its centre
function grown(b, min, slop) {
  const w = Math.max(b.w, min), h = Math.max(b.h, min);
  return { x: b.x + b.w / 2 - w / 2 - slop, y: b.y + b.h / 2 - h / 2 - slop, w: w + slop * 2, h: h + slop * 2 };
}

export function pickTarget(x, y, projected, opts = {}) {
  const slop = opts.slop ?? U.slop, min = opts.minHit ?? U.minHit;
  let best = -1, bestKey = Infinity;
  for (let k = 0; k < (projected ? projected.length : 0); k++) {
    const p = projected[k];
    if (!p || p.off) continue;
    let inside = false, d, cx, cy;
    if (p.kind === 'ball') {
      const r = Math.max(p.r, min / 2) + slop, dc = Math.hypot(x - p.cx, y - p.cy);
      inside = dc <= r;
      d = Math.max(0, dc - p.r);
      if (p.label) {
        if (!inside) { const g = grown(p.label, min, slop); inside = x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h; }
        d = Math.min(d, boxDist(x, y, p.label));
      }
      cx = p.cx; cy = p.cy;
    } else {
      const g = grown(p, min, slop);
      inside = x >= g.x && x <= g.x + g.w && y >= g.y && y <= g.y + g.h;
      d = boxDist(x, y, p);
      cx = p.x + p.w / 2; cy = p.y + p.h / 2;
    }
    if (!inside) continue;
    const key = d * 1e4 + Math.hypot(x - cx, y - cy);
    if (key < bestKey) { bestKey = key; best = p.i ?? k; }
  }
  return best;
}
