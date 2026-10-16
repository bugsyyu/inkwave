// 墨浪跑酷 — 走远路 (docs/PLAY.md §5.2): a second wrong answer no longer holds her in place for LEARN.race.detour seconds;
// the ink road takes her into a side branch off the lap and back onto it further on. Pure (Node runs it on the real
// stages): A* over the nav graph (forms/common.js astar, the race's own) from the road just past the row to the road
// `reach` m on, with every node within `away` m of that stretch of road made dear — so the path it finds is another
// way round, not the road itself.
//
//   detourBranch(nav, T, s, opts) → { nodes, pts: [{ x, y, z }], len, reach, sJoin, away } | null
//     s        lap-local arc length where the branch leaves the road (just past the row)
//     opts     want (m: the branch length that takes ≈ detour seconds at the branch's tide), reach (the rejoin distances
//              to try), away (m off the road that counts as "another way"), avoidCost, minAway (share of the branch's
//              nodes that must be off the road), minRatio (branch length ≥ ratio × reach)
//   null when the stage has no other way round there (a single corridor): the caller keeps her on the road at a slow
//   tide for the detour seconds instead (documented in LEARN §20).
import { astar } from '../../forms/common.js';
import { at } from './track.js';

const _p = {};

export function detourBranch(nav, T, s, opts = {}) {
  const reaches = opts.reach ?? [12, 18, 24, 30], away = opts.away ?? 2.2, avoidCost = opts.avoidCost ?? 6;
  const minAway = opts.minAway ?? 0.45, minRatio = opts.minRatio ?? 1.35, want = opts.want ?? 40, step = nav.step || 1;
  const nearest = (q) => (nav.nearest ? nav.nearest(q, 1.5, true) : -1);
  at(T, s, _p);
  const a = nearest({ x: _p.x, y: _p.y + 0.3, z: _p.z });
  if (a < 0) return null;
  let best = null;
  for (const reach of reaches) {
    at(T, s + reach, _p);
    const b = nearest({ x: _p.x, y: _p.y + 0.3, z: _p.z });
    if (b < 0 || b === a) continue;
    // the road's cells over this stretch, grown by `away`
    const near = new Set(), R = Math.max(1, Math.round(away / step));
    for (let t = s - 3; t <= s + reach + 3; t += 0.5) {
      at(T, t, _p);
      const cx = Math.round(_p.x / step), cz = Math.round(_p.z / step);
      for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dz * dz <= R * R) near.add((cx + dx) + ',' + (cz + dz));
    }
    const key = (m) => Math.round(m.x / step) + ',' + Math.round(m.z / step);
    const path = astar(nav, a, b, { penalty: (m) => (near.has(key(m)) ? avoidCost : 0), maxIter: 40000 });
    if (!path || path.length < 4) continue;
    let len = 0, off = 0;
    for (let i = 0; i < path.length; i++) {
      const n = nav.nodes[path[i]];
      if (i) { const p = nav.nodes[path[i - 1]]; len += Math.hypot(n.x - p.x, n.z - p.z); }
      if (!near.has(key(n))) off++;
    }
    const share = off / path.length;
    if (share < minAway || len < minRatio * reach) continue;
    const score = Math.abs(len - want);
    if (!best || score < best.score) best = { nodes: path, len: +len.toFixed(2), reach, sJoin: s + reach, away: +share.toFixed(3), score };
  }
  if (!best) return null;
  best.pts = best.nodes.map((id) => { const n = nav.nodes[id]; return { x: n.x, y: n.y, z: n.z }; });
  delete best.score;
  return best;
}

// a branch's polyline smoothed (±1 node) and its cumulative arc length — what the runner steers along
export function branchLine(pts) {
  const n = pts.length, out = [];
  for (let i = 0; i < n; i++) {
    if (i === 0 || i === n - 1) { out.push({ ...pts[i] }); continue; }
    const a = pts[i - 1], b = pts[i], c = pts[i + 1];
    out.push({ x: (a.x + 2 * b.x + c.x) / 4, y: b.y, z: (a.z + 2 * b.z + c.z) / 4 });
  }
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1] + Math.hypot(out[i].x - out[i - 1].x, out[i].z - out[i - 1].z));
  return { pts: out, cum, len: cum[n - 1] };
}
// position and heading on a branch line at arc length u
export function branchAt(B, u, out = {}) {
  const { pts, cum } = B, n = pts.length;
  let i = 0; while (i < n - 2 && cum[i + 1] < u) i++;
  const seg = Math.max(1e-6, cum[i + 1] - cum[i]), k = Math.min(1, Math.max(0, (u - cum[i]) / seg));
  const a = pts[i], b = pts[i + 1];
  out.x = a.x + (b.x - a.x) * k; out.y = a.y + (b.y - a.y) * k; out.z = a.z + (b.z - a.z) * k;
  const l = Math.hypot(b.x - a.x, b.z - a.z) || 1; out.tx = (b.x - a.x) / l; out.tz = (b.z - a.z) / l;
  return out;
}
