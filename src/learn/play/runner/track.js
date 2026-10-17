// 墨浪跑酷 — the ink road (docs/PLAY.md §3 M2 「道够不够宽」, §5.2): pure, no DOM, no three.js — Node tests run it on every
// offline stage's real nav graph (src/world/maps.js → Level + Physics + NavGraph).
//
//   buildTrack(nodes, loop, opts)        the race's lap (common.js loopRoute, nav node ids, loop[0] === loop[last]) as a
//                                        smooth closed centre line, resampled every `step` m: x y z, the unit tangent, the
//                                        raw loop index under each sample and the lap's jump-up edges
//   at(T, s, out)                        position + tangent + right at s (any s ≥ 0: the lap repeats)
//   project(T, x, z, sHint, back, ahead) nearest point of the centre line near sHint → { s, d } (d: + = her right)
//   clearWidths(nav, T, opts)            for every sample the clear lateral width on the nav grid either side of the
//                                        road (the grid only knows "a kid can stand here", 1 m cells — no widths)
//   rowFit(T, W, s, lanes, opts)         can a row of `lanes` × laneW stand at s (wide enough over its run-in and run-out,
//                                        nearly straight, nearly flat)? → { ok, c } with c the lateral centre that fits
//   placeRow(T, W, want, lanes, opts)    the row's place: all lanes within `slide` m of `want`, else fewer lanes at `want`
//                                        (never under 2), else forward to the next point where two or more fit
//
// Lateral offsets are measured along `right` = (−tz, tx): the camera-right of a squidkid facing down the road
// (player.js: forward (sin yaw, cos yaw), right (−cos yaw, sin yaw)).

const TAU = Math.PI * 2;

// The grid's A* path is a staircase of 1 m cells (8-way moves): smoothing alone leaves it wavy, and a row of curtains
// needs a straight run. String-pulling first: from each kept vertex, skip ahead to the farthest vertex (at most maxSkip m)
// that a straight line reaches over walkable grid at about the same height (jump-up / drop edges stay as vertices).
// → the kept loop indices (the first and the last always).
export function straighten(nav, loop, opts = {}) {
  const maxSkip = opts.maxSkip ?? 14, res = 0.25, nodes = nav.nodes;
  const edgeType = opts.edgeType || null;
  const keep = [0];
  let i = 0;
  // a straight line from vertex a to vertex b over walkable cells at about one height, every cell to the next joined by
  // a walk edge (a railing between two cells has none)
  const clearLine = (a, b) => {
    const A = nodes[loop[a]], B = nodes[loop[b]], L = Math.hypot(B.x - A.x, B.z - A.z);
    if (L > maxSkip) return false;
    let prev = loop[a];
    for (let t = res; t < L; t += res) {
      const k = t / L, id = walkNode(nav, A.x + (B.x - A.x) * k, A.z + (B.z - A.z) * k, nodes[prev].y, 0.4);
      if (id < 0 || !linked(nav, prev, id)) return false;
      prev = id;
    }
    return linked(nav, prev, loop[b]);
  };
  while (i < loop.length - 1) {
    let j = i + 1;
    for (let k = i + 2; k < loop.length; k++) {
      if (edgeType && edgeType(loop[k - 1], loop[k]) !== 'walk') break;   // a ledge: stop at its foot
      if (clearLine(i, k)) j = k; else if (Math.hypot(nodes[loop[k]].x - nodes[loop[i]].x, nodes[loop[k]].z - nodes[loop[i]].z) > maxSkip) break;
    }
    keep.push(j); i = j;
  }
  return keep;
}

export function buildTrack(nodes, loop, opts = {}) {
  const step = opts.step ?? 0.5, smooth = opts.smooth ?? 1.6;
  // the raw closed polyline (xz arc length) and the raw loop index at each vertex (string-pulled when `keep` is given)
  const keepIdx = opts.keep || loop.map((_, i) => i);
  const P = keepIdx.map((i) => nodes[loop[i]]);
  const m = P.length;
  const rawS = new Float64Array(m);
  for (let i = 1; i < m; i++) rawS[i] = rawS[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].z - P[i - 1].z);
  const rawLen = rawS[m - 1] || 1;
  // 1) resample the raw line uniformly
  const n0 = Math.max(8, Math.round(rawLen / step));
  const ax = new Float64Array(n0), ay = new Float64Array(n0), az = new Float64Array(n0), ar = new Float64Array(n0);
  let j = 0;
  for (let i = 0; i < n0; i++) {
    const s = (i / n0) * rawLen;
    while (j < m - 2 && rawS[j + 1] < s) j++;
    const seg = Math.max(1e-9, rawS[j + 1] - rawS[j]), k = Math.min(1, Math.max(0, (s - rawS[j]) / seg));
    ax[i] = P[j].x + (P[j + 1].x - P[j].x) * k; az[i] = P[j].z + (P[j + 1].z - P[j].z) * k;
    ay[i] = P[j].y + (P[j + 1].y - P[j].y) * k; ar[i] = keepIdx[j] + (keepIdx[j + 1] - keepIdx[j]) * k;
  }
  // 2) smooth it (cyclic Gaussian over ±smooth m): the grid's 8-way zig-zags become a line a squid can follow
  const W = Math.max(1, Math.round(smooth / (rawLen / n0)));
  const wts = []; let wsum = 0;
  for (let k = -W; k <= W; k++) { const w = Math.exp(-(k * k) / (2 * (W / 2) * (W / 2))); wts.push(w); wsum += w; }
  const bx = new Float64Array(n0), bz = new Float64Array(n0), by = new Float64Array(n0);
  for (let i = 0; i < n0; i++) {
    let sx = 0, sz = 0, sy = 0;
    for (let k = -W; k <= W; k++) { const q = (i + k + n0) % n0, w = wts[k + W]; sx += ax[q] * w; sz += az[q] * w; }
    // height: a narrow window (a ledge stays a ledge; only the 1 m steps are softened)
    for (let k = -1; k <= 1; k++) { const q = (i + k + n0) % n0; sy += ay[q] * (k ? 0.25 : 0.5); }
    bx[i] = sx / wsum; bz[i] = sz / wsum; by[i] = sy;
  }
  // 3) re-parametrise by the smoothed arc length and resample again at `step`
  const bs = new Float64Array(n0 + 1);
  for (let i = 1; i <= n0; i++) { const a = i - 1, b = i % n0; bs[i] = bs[i - 1] + Math.hypot(bx[b] - bx[a], bz[b] - bz[a]); }
  const len = bs[n0];
  const n = Math.max(8, Math.round(len / step)), st = len / n;
  const x = new Float32Array(n), y = new Float32Array(n), z = new Float32Array(n), tx = new Float32Array(n), tz = new Float32Array(n), raw = new Float32Array(n);
  j = 0;
  for (let i = 0; i < n; i++) {
    const s = i * st;
    while (j < n0 - 1 && bs[j + 1] < s) j++;
    const a = j, b = (j + 1) % n0, k = Math.min(1, Math.max(0, (s - bs[j]) / Math.max(1e-9, bs[j + 1] - bs[j])));
    x[i] = bx[a] + (bx[b] - bx[a]) * k; z[i] = bz[a] + (bz[b] - bz[a]) * k; y[i] = by[a] + (by[b] - by[a]) * k;
    const ra = ar[a], rb = b === 0 ? keepIdx[m - 1] : ar[b];
    raw[i] = ra + (rb - ra) * k;
  }
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n, b = (i + 1) % n;
    let dx = x[b] - x[a], dz = z[b] - z[a]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    tx[i] = dx; tz[i] = dz;
  }
  // the lap's jump-up edges (nav 'jump': 0.5–1.25 m up; and 'climb': an inkable wall 1.3–5.5 m up, which a prop's rail
  // can turn a deck's jump edge into — play-4, halyard's start deck in the browser), as arc lengths on the smoothed line —
  // she hops them (and swims up a climb), rows keep off their approach
  const jumps = [];
  if (opts.edgeType) for (let r = 0; r < loop.length - 1; r++) { const t = opts.edgeType(loop[r], loop[r + 1]); if (t === 'jump' || t === 'climb') jumps.push(r + 0.5); }
  const T = { n, step: st, len, x, y, z, tx, tz, raw, loopLen: loop.length, jumps: [] };
  for (const r of jumps) T.jumps.push(rawToS(T, r));
  T.jumps.sort((a, b) => a - b);
  return T;
}

// a raw loop index (fractional) → the arc length of the nearest sample
export function rawToS(T, r) {
  let best = 0, bd = Infinity;
  for (let i = 0; i < T.n; i++) { const d = Math.abs(T.raw[i] - r); if (d < bd) { bd = d; best = i; } }
  return best * T.step;
}

const wrapI = (T, i) => ((i % T.n) + T.n) % T.n;
// position, tangent and right at arc length s (fractional samples interpolated; s wraps every lap)
export function at(T, s, out = {}) {
  const f = s / T.step, i0 = Math.floor(f), k = f - i0, a = wrapI(T, i0), b = wrapI(T, i0 + 1);
  out.x = T.x[a] + (T.x[b] - T.x[a]) * k; out.y = T.y[a] + (T.y[b] - T.y[a]) * k; out.z = T.z[a] + (T.z[b] - T.z[a]) * k;
  let tx = T.tx[a] + (T.tx[b] - T.tx[a]) * k, tz = T.tz[a] + (T.tz[b] - T.tz[a]) * k; const l = Math.hypot(tx, tz) || 1;
  out.tx = tx / l; out.tz = tz / l; out.rx = -out.tz; out.rz = out.tx;
  return out;
}
// the loop's raw index under arc length s (lap-local; the caller adds laps)
export function rawAt(T, s) { return T.raw[wrapI(T, Math.round(s / T.step))]; }

// nearest point of the centre line to (x, z) among samples within [sHint − back, sHint + ahead] → { s, d, dist }
export function project(T, x, z, sHint, back = 4, ahead = 8, out = {}) {
  const i0 = Math.floor((sHint - back) / T.step), i1 = Math.ceil((sHint + ahead) / T.step);
  let best = i0, bd = Infinity;
  for (let i = i0; i <= i1; i++) { const q = wrapI(T, i), dx = x - T.x[q], dz = z - T.z[q], d2 = dx * dx + dz * dz; if (d2 < bd) { bd = d2; best = i; } }
  // refine along the tangent at that sample
  const q = wrapI(T, best), dx = x - T.x[q], dz = z - T.z[q];
  const along = Math.max(-T.step, Math.min(T.step, dx * T.tx[q] + dz * T.tz[q]));
  out.s = best * T.step + along;
  out.d = dx * -T.tz[q] + dz * T.tx[q];
  out.dist = Math.sqrt(bd);
  return out;
}

// ---------------------------------------------------------------------------------------------- the clearance scan
// can she stand at (x, z) at about height y? A nav node in that 1 m cell within dy, two-way reachable (nav.valid) and not
// in the other side's spawn zone → its id (−1 when not). walkY: the same, as the node's height (NaN when not).
export function walkNode(nav, x, z, y, dy = 0.6) {
  const ix = Math.round((x - nav.x0) / nav.step), iz = Math.round((z - nav.z0) / nav.step);
  if (ix < 0 || iz < 0 || ix >= nav.nx || iz >= nav.nz) return -1;
  const list = nav.cells[iz * nav.nx + ix];
  if (!list) return -1;
  let best = -1, bd = dy + 1e-6;
  for (const id of list) {
    const nd = nav.nodes[id];
    if (nav.valid && !nav.valid[id]) continue;
    if (nd.zone === 1) continue;
    const e = Math.abs(nd.y - y);
    if (e <= bd) { bd = e; best = id; }
  }
  return best;
}
export function walkY(nav, x, z, y, dy = 0.6) { const id = walkNode(nav, x, z, y, dy); return id < 0 ? NaN : nav.nodes[id].y; }
const linked = (nav, a, b) => { if (a === b) return true; for (const e of nav.nodes[a].nb) if (e.to === b && e.type === 'walk') return true; return false; };

// for every sample: how far she can go left and right of the centre line before the grid runs out (an edge, a wall's
// clearance, a railing — two cells with no walk edge between them —, ground more than `flat` above or below the road's
// own: a row's curtains stand on one floor). 0 / 0 where the smoothed line itself cuts a corner off the grid.
export function clearWidths(nav, T, opts = {}) {
  const maxW = opts.maxW ?? 4.5, res = opts.res ?? 0.25, dy = opts.dy ?? 0.5, flat = opts.flat ?? 0.45;
  const left = new Float32Array(T.n), right = new Float32Array(T.n);
  for (let i = 0; i < T.n; i++) {
    const cx = T.x[i], cz = T.z[i], rx = -T.tz[i], rz = T.tx[i];
    const n0 = walkNode(nav, cx, cz, T.y[i], 0.9);
    if (n0 < 0) continue;
    const y0 = nav.nodes[n0].y;
    for (const [sgn, arr] of [[1, right], [-1, left]]) {
      let prev = n0, w = 0;
      for (let d = res; d <= maxW + 1e-6; d += res) {
        const id = walkNode(nav, cx + rx * d * sgn, cz + rz * d * sgn, nav.nodes[prev].y, dy);
        if (id < 0 || Math.abs(nav.nodes[id].y - y0) > flat || !linked(nav, prev, id)) break;   // (a ramp or a step beside the road is not road)
        prev = id; w = d;
      }
      // the last walkable sample stands for its cell: half a sample more is still floor
      arr[i] = w > 0 ? Math.min(maxW, w + res / 2) : 0;
    }
  }
  return { left, right, maxW };
}

// a row of `lanes` lanes at arc length s: every sample over [s − runIn, s + runOut] must leave lanes × laneW between its
// left and right edges for one common lateral centre c (the one nearest the centre line), the road may turn at most
// `turn` rad across that stretch and climb at most `rise` m — curtains stand square across a straight, flat run — and no
// jump-up edge may lie in the `jumpClear` m before the run-in (she is held on the line there to hop it)
// The grid's walkable band is where her centre can be — it already keeps the capsule (PLAYER.radius + 0.08) off every
// wall — so the row needs the lanes' curtains (laneW − gap wide each) inside that band: lanes × laneW − gap of grid, which
// is a corridor of more than lanes × laneW from wall to wall (PLAY's rule) once the capsule's room is added back.
export function rowFit(T, W, s, lanes, opts = {}) {
  const laneW = opts.laneW ?? 1.5, gap = opts.gap ?? 0.5, runIn = opts.runIn ?? 3, runOut = opts.runOut ?? 1, turn = opts.turn ?? 0.6, rise = opts.rise ?? 0.6;
  const need = lanes * laneW - gap, half = need / 2;
  const i0 = Math.round((s - runIn) / T.step), i1 = Math.round((s + runOut) / T.step);
  let lo = -Infinity, hi = Infinity, ymin = Infinity, ymax = -Infinity;
  const q0 = wrapI(T, i0), a0 = Math.atan2(T.tx[q0], T.tz[q0]);
  for (let i = i0; i <= i1; i++) {
    const q = wrapI(T, i);
    const L = W.left[q], R = W.right[q];
    if (!(L + R >= need - 1e-6)) return { ok: false };
    lo = Math.max(lo, -L + half); hi = Math.min(hi, R - half);
    ymin = Math.min(ymin, T.y[q]); ymax = Math.max(ymax, T.y[q]);
    let da = Math.atan2(T.tx[q], T.tz[q]) - a0; while (da > Math.PI) da -= TAU; while (da < -Math.PI) da += TAU;
    if (Math.abs(da) > turn) return { ok: false };
  }
  if (lo > hi + 1e-6 || ymax - ymin > rise) return { ok: false };
  // no jump-up edge over the approach (the runner keeps her on the road's line to hop it: no lane change there)
  const jc = opts.jumpClear ?? 8;
  for (const j of T.jumps || []) {
    const d = (((s - j) % T.len) + T.len) % T.len;   // how far past the edge the row stands
    if (d < runIn + jc || T.len - d < runOut + 1) return { ok: false };
  }
  const c = Math.min(hi, Math.max(lo, 0));
  return { ok: true, c: +c.toFixed(3) };
}

// the row's place (PLAY §3 M2: rows only where the clear width ≥ lanes × 1.5 m; too narrow → fewer lanes, at least two;
// two do not fit → forward to the next point that fits). Dropping a lane drops an option from the question, so it is
// spent carefully: first every lane within `slide` m of `want` (a few metres of road cost nothing), then one lane fewer
// at `want`, then forward to the first point that keeps all but one lane (within `keep` m), and only then down to two.
// → { s, lanes, c, moved } or null when nothing fits within `search` m.
export function placeRow(T, W, want, lanes, opts = {}) {
  const slide = opts.slide ?? 10, keep = opts.keep ?? 40, search = opts.search ?? T.len, step = T.step;
  const minLanes = Math.min(lanes, opts.minLanes ?? 2), oneLess = Math.max(minLanes, lanes - 1);
  const hit = (s, k) => { const f = rowFit(T, W, s, k, opts); return f.ok ? { s: +s.toFixed(3), lanes: k, c: f.c, moved: +(s - want).toFixed(3) } : null; };
  for (let s = want; s <= want + slide + 1e-6; s += step) { const h = hit(s, lanes); if (h) return h; }
  if (oneLess < lanes) { const h = hit(want, oneLess); if (h) return h; }
  for (let s = want + step; s <= want + keep + 1e-6; s += step) for (let k = lanes; k >= oneLess; k--) { const h = hit(s, k); if (h) return h; }
  for (let s = want; s <= want + search + 1e-6; s += step) for (let k = lanes; k >= minLanes; k--) { const h = hit(s, k); if (h) return h; }
  return null;
}

// the free width at s for the road between rows (her lateral room, kept off the edges by `margin`)
export function roomAt(T, W, s, margin = 0.45) {
  const q = wrapI(T, Math.round(s / T.step));
  return { left: Math.max(0, W.left[q] - margin), right: Math.max(0, W.right[q] - margin) };
}
