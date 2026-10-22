// 字弹 M4 — where the camera goes (pure; the gate flow hands the pose to cameraRig's spring blend, never a cut).
// Two frames, because two things matter in turn:
//   'type'  while she types: the key plate, the type-bars, the paper and the target she aims at, in the band between the
//           question strip (top) and the game keyboard (bottom ≈ 40 % portrait, ≈ 45 % landscape). The camera sits
//           behind the rig over her right shoulder and high enough that her head stays below the plate's middle row
//           (she sits behind the keys) and the target shows above the paper's top edge.
//   'word'  after 射 the keyboard dips away (play-keys hide()); the shell's arc and the ink word at the target fill the
//           screen under the strip, the rig at the bottom edge.
// The game's camera is Hor+ with a fixed vertical FOV (cameraRig: settings.fov is horizontal at 16:9 → ≈ 52°
// vertical), so a portrait phone needs the camera further back. Pure numbers in the rig's frame: origin at the rig's
// feet, +Z toward the target (`dist` m ahead), +X her left.
//
// frameFor({ phase, aspect, kbFrac, topFrac, vfov, dist, word: { w, h, y } }) → { pos, look, fov, fits, ndc }
export const FRAME = { vfov: 52, dist: 6.5, topFrac: 0.1, side: -0.5, margin: 0.04, targetY: 1.45, headMargin: 0.05 };   // headMargin (NDC): her head this far under the keys' middle row when a caller asks for it (the station's and the split frame's margin — the hair sits higher than RIG_POINTS.head, and a lens that is a hair off the searched pose must not put her head over the row)
export const RIG_POINTS = {
  plate: [[0.93, 0.98, 0.52], [-0.93, 0.98, 0.52], [0.93, 1.16, 1.18], [-0.93, 1.16, 1.18]],
  strike: [0, 1.5, 1.62],
  platenTop: [0, 1.6, 1.7],
  paperTop: [[0.75, 2.3, 1.72], [-0.75, 2.3, 1.72]],
  typed10: [0.98, 1.72, 1.7],          // the typed line's first letter after ten letters (the carriage has slid left)
  textLines: [[0.75, 1.95, 1.7], [-0.75, 1.95, 1.7]],   // the line being typed and the one above it (the blank top of
                                                         // the sheet may run under the question strip)
  head: [0, 1.95, -0.06],
  midRow: [0, 1.08, 0.86],
};

function project(p, cam, look, fovY, aspect) {
  const fx = look[0] - cam[0], fy = look[1] - cam[1], fz = look[2] - cam[2];
  const fl = Math.hypot(fx, fy, fz), f = [fx / fl, fy / fl, fz / fl];
  const rl = Math.hypot(f[2], f[0]) || 1, r = [-f[2] / rl, 0, f[0] / rl];           // right = forward × up
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const d = [p[0] - cam[0], p[1] - cam[1], p[2] - cam[2]];
  const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  const x = d[0] * r[0] + d[1] * r[1] + d[2] * r[2];
  const y = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
  const t = Math.tan((fovY * Math.PI) / 360);
  return [x / (z * t * aspect), y / (z * t), z];
}

// Math.hypot(a, b) / (a, b, c) as the builtin computes them, for finite arguments not all zero — all the search passes.
// V8's builtin (and JavaScriptCore's up to Safari 18) scales by the largest and Kahan-sums: kahan2 / kahan3, in JS because
// V8's boxes its arguments and its result (three calls a pose: most of what the search still allocated); one return each,
// so the result stays a raw double. JavaScriptCore since Safari 26 (WebKit 7622 — her iPhone) calls std::hypot instead,
// and boxes no double: an engine whose builtin is not the Kahan form (probed once, here) keeps the builtin. Either way the
// search's arithmetic is the builtin's, as it was (tests/learn/type-frame.test.mjs: bit for bit, on both kinds of engine)
function kahan2(a, b) {
  a = Math.abs(a); b = Math.abs(b);
  const m = b > a ? b : a, x = a / m, y = b / m;
  return Math.sqrt(x * x + y * y) * m;
}
function kahan3(a, b, c) {
  a = Math.abs(a); b = Math.abs(b); c = Math.abs(c);
  let m = a; if (b > m) m = b; if (c > m) m = c;
  const x = a / m, y = b / m, z = c / m, s1 = x * x, s2 = y * y, p = s1 + s2, k = (p - s1) - s2;
  return Math.sqrt(p + (z * z - k)) * m;
}
export const hypotKahan = (() => {
  let s = 20261022;
  const r = () => { s = (Math.imul(s, 1103515245) + 12345) | 0; return ((s >>> 0) / 4294967296 - 0.5) * 30 || 0.5; };
  for (let i = 0; i < 1024; i++) {
    const a = r(), b = r(), c = r();
    if (!Object.is(Math.hypot(a, b), kahan2(a, b)) || !Object.is(Math.hypot(a, b, c), kahan3(a, b, c))) return false;
  }
  return true;
})();
export const hyp2 = hypotKahan ? kahan2 : (a, b) => Math.hypot(a, b);
export const hyp3 = hypotKahan ? kahan3 : (a, b, c) => Math.hypot(a, b, c);
// the points' fixed parts (reused), and the pose the rules project through: cam H, cam Z, forward f, up u, tan(fov/2)
let _d0 = new Float64Array(16), _py = new Float64Array(16), _pz = new Float64Array(16), _d2 = new Float64Array(16);
const _Q = new Float64Array(9);
const _P = (p) => {
  const Q = _Q, d0 = p[0] - FRAME.side, d1 = p[1] - Q[0], d2 = p[2] - Q[1];
  return (d0 * Q[5] + d1 * Q[6] + d2 * Q[7]) / ((d0 * Q[2] + d1 * Q[3] + d2 * Q[4]) * Q[8]);
};
// The grid: B m behind her feet × H m up (0.1 m steps); the nearest pose (r to a point 1.2 m over her feet) with every
// point inside the band and the rules passed, else the pose that spills least. LEARN §52: it ran ~10k poses, each with
// 50–70 small arrays and a closure, synchronously on 射 / a question / a turn of the phone. Now scalar — one basis per
// pose, the points' fixed parts hoisted, one projector for the rules, the winners kept as numbers — and it skips only
// what cannot change the answer: the poses are visited in the old order with the old arithmetic, but r is never under B
// and grows with H in a column (past the best: the column, then the search, ends), and a pose already spilling more than
// the fallback cannot become it. `fitOnly` (a caller that throws a non-fitting answer away): no fallback kept, a pose
// stops at its first spill. tests/learn/type-frame.test.mjs holds the old search verbatim: the same answers, bit for bit.
function search(pts, rules, o) {
  const { aspect, vfov, yLo, yHi, xLim, cz, minH = 1.8, fitOnly = false } = o;
  const yMid = (yLo + yHi) / 2, t = Math.tan((vfov * Math.PI) / 360);
  const cy = (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2;
  const n = pts.length, side = FRAME.side, aMid = Math.atan(yMid * t);
  if (_d0.length < n) { _d0 = new Float64Array(n); _py = new Float64Array(n); _pz = new Float64Array(n); _d2 = new Float64Array(n); }
  const D0 = _d0, PY = _py, PZ = _pz, D2 = _d2, Q = _Q, P = _P;
  for (let i = 0; i < n; i++) { const p = pts[i]; D0[i] = p[0] - side; PY[i] = p[1]; PZ[i] = p[2]; }
  let f0 = 0, f1 = 0, f2 = 0, u0 = 0, u1 = 0, u2 = 0;
  // the best and the fallback so far, as numbers (the answer is built once, at the end): cam H, cam Z, look Y, the ndc
  let best = false, bestR = Infinity, bH = 0, bZ = 0, bL = 0, bLo = 0, bHi = 0, bX = 0;
  let fallback = false, fbS = Infinity, fH = 0, fZ = 0, fL = 0, fLo = 0, fHi = 0, fX = 0;
  for (let B = 1.2; B <= 14; B += 0.1) {
    if (best && B >= bestR) break;   // (r ≥ B: nothing nearer is left)
    const camZ = -B, czB = cz + B;
    for (let i = 0; i < n; i++) D2[i] = PZ[i] - camZ;
    for (let H = minH; H <= 10; H += 0.1) {
      const r = hyp2(B, H - 1.2);
      if (best && r >= bestR) break;   // (r grows with H: the rest of the column is further)
      const ang = Math.atan2(cy - H, czB) - aMid;
      const l1 = H + Math.tan(ang) * czB;
      const fx = 0 - side, fy = l1 - H, fz = cz - camZ;
      const fl = hyp3(fx, fy, fz);
      f0 = fx / fl; f1 = fy / fl; f2 = fz / fl;
      const rl = hyp2(f2, f0) || 1, r0 = -f2 / rl, r1 = 0, r2 = f0 / rl;           // right = forward × up
      u0 = r1 * f2 - r2 * f1; u1 = r2 * f0 - r0 * f2; u2 = r0 * f1 - r1 * f0;
      let ok = true, minY = 9, maxY = -9, maxX = 0, spill = 0;
      for (let i = 0; i < n; i++) {
        const d0 = D0[i], d1 = PY[i] - H, d2 = D2[i];
        const z = d0 * f0 + d1 * f1 + d2 * f2;
        if (z <= 0.3) { ok = false; spill += 9; break; }
        const x = (d0 * r0 + d1 * r1 + d2 * r2) / (z * t * aspect), y = (d0 * u0 + d1 * u1 + d2 * u2) / (z * t);
        minY = Math.min(minY, y); maxY = Math.max(maxY, y); maxX = Math.max(maxX, Math.abs(x));
        spill += Math.max(0, yLo - y) + Math.max(0, y - yHi) + Math.max(0, Math.abs(x) - xLim);
        if (spill > 0 && (best || fitOnly || spill >= fbS)) break;   // (the rest of this pose cannot matter)
      }
      // spilling: not the best — and, past a best / with fitOnly / no lower than the fallback, not the fallback either
      if (spill > 0 && (best || fitOnly || spill >= fbS)) continue;
      if (spill > 0) ok = false;
      Q[0] = H; Q[1] = camZ; Q[2] = f0; Q[3] = f1; Q[4] = f2; Q[5] = u0; Q[6] = u1; Q[7] = u2; Q[8] = t;
      let rulesOk = true;
      for (let k = 0; k < rules.length; k++) if (!rules[k](P)) { rulesOk = false; break; }
      if (ok && rulesOk) { if (!best || r < bestR) { best = true; bestR = r; bH = H; bZ = camZ; bL = l1; bLo = minY; bHi = maxY; bX = maxX; } }
      else if (!fitOnly && !best && (!fallback || spill + (rulesOk ? 0 : 0.5) < fbS)) { fallback = true; fbS = spill + (rulesOk ? 0 : 0.5); fH = H; fZ = camZ; fL = l1; fLo = minY; fHi = maxY; fX = maxX; }
    }
  }
  // (one way out, whichever it is — fitOnly with nothing fitting hands back zeros, never read: its caller skips it)
  const r3 = (v) => +v.toFixed(3);
  return { pos: [side, best ? bH : fH, best ? bZ : fZ].map(r3), look: [0, best ? bL : fL, cz].map(r3), fov: vfov, fits: best,
    ndc: { minY: best ? bLo : fLo, maxY: best ? bHi : fHi, maxX: best ? bX : fX, yLo, yHi } };
}

// project(p, cam, look, fovY, aspect)[0] with no arrays (the word frame's span check, per zoom)
function projX(p, cam, look, fovY, aspect) {
  const fx = look[0] - cam[0], fy = look[1] - cam[1], fz = look[2] - cam[2];
  const fl = hyp3(fx, fy, fz), f0 = fx / fl, f1 = fy / fl, f2 = fz / fl;
  const rl = hyp2(f2, f0) || 1, r0 = -f2 / rl, r1 = 0, r2 = f0 / rl;
  const d0 = p[0] - cam[0], d1 = p[1] - cam[1], d2 = p[2] - cam[2];
  const z = d0 * f0 + d1 * f1 + d2 * f2, x = d0 * r0 + d1 * r1 + d2 * r2, t = Math.tan((fovY * Math.PI) / 360);
  return x / (z * t * aspect);
}

// frameFor's answers by everything they depend on (LEARN §52: the same band asks again on every question, a hint, the
// phone turned back — the answer stands until the screen changes); handed out as copies (a caller may add to its own)
const _frames = new Map();
const copyFrame = (f) => ({ pos: f.pos.slice(), look: f.look.slice(), fov: f.fov, fits: f.fits, ndc: f.ndc && { ...f.ndc } });

/** The rig-frame camera pose for a phase ('type' | 'word'), as close as the rules allow. */
export function frameFor(o = {}) {
  const phase = o.phase || 'type';
  const aspect = o.aspect || 16 / 9, vfov = o.vfov || FRAME.vfov, dist = o.dist || FRAME.dist;
  const top = o.topFrac ?? FRAME.topFrac, kb = phase === 'word' ? (o.kbFrac ?? 0) : (o.kbFrac ?? (aspect < 1 ? 0.4 : 0.45));
  const word = phase === 'word' ? Object.assign({ w: 3.0, h: 0.9, y: 2.45 }, o.word || {}) : null;
  const ty = o.targetY ?? FRAME.targetY, hm = o.headMargin || 0;
  const key = `${phase}|${aspect}|${vfov}|${dist}|${top}|${kb}|` + (word ? `${word.w}|${word.h}|${word.y}` : `${ty}|${hm}`);
  let f = _frames.get(key);
  if (!f) {
    f = solveFrame(phase, aspect, vfov, dist, top, kb, word, ty, hm);
    if (_frames.size >= 48) _frames.clear();
    _frames.set(key, f);
  }
  return copyFrame(f);
}

function solveFrame(phase, aspect, vfov, dist, top, kb, word, ty, hm) {
  const m = FRAME.margin * 2;
  const band = { aspect, vfov, yLo: -1 + 2 * kb + m, yHi: 1 - 2 * top - m, xLim: 1 - m };
  const R = RIG_POINTS;
  if (phase === 'word') {
    // the sheet is gone (it is the shell): the word must clear the bare platen; the rig stays in the bottom of the
    // frame. A wide (landscape) screen would show the word small: the frame may zoom in (a narrower FOV, cameraRig's
    // zoom) until the word spans up to ~80 % of the width.
    const ww = word.w / 2, y0 = word.y - word.h / 2, y1 = word.y + word.h / 2;
    const box = [[ww, y0, dist], [-ww, y0, dist], [ww, y1, dist], [-ww, y1, dist]];
    const pts = [...box, ...R.plate.slice(2), R.strike];
    let best = null;
    for (let fov = vfov; fov >= vfov * 0.55; fov -= 3) {
      // (a zoom that does not fit is skipped: no fallback wanted from it)
      const f = search(pts, [(P) => P([0, y0, dist]) > P(R.platenTop) + 0.04], { ...band, vfov: fov, cz: dist * 0.7, minH: 2.8, fitOnly: true });
      if (!f.fits) continue;
      let span = -Infinity;
      for (let i = 0; i < 4; i++) span = Math.max(span, Math.abs(projX(box[i], f.pos, f.look, fov, aspect)));
      if (!best || (span <= 0.8 && span > best.span)) best = { ...f, span };
      if (span > 0.8) break;
    }
    if (best) { delete best.span; return best; }
    return search(pts, [], { ...band, cz: dist * 0.7, minH: 2.8 });
  }
  // the target is context (the shot's direction), wanted on screen above the paper when the band allows it — a
  // portrait band rarely does without pushing the camera far away, so the rig wins: typing frames the rig alone
  const pts = [...R.plate, R.strike, ...R.textLines, R.typed10];
  // her head below the plate's middle row (on a wide screen, below its far row: the band between strip and keyboard is
  // ~150 px tall there and a steeper view would shrink the rig further)
  const row = aspect > 1.4 ? [0, 1.16, 1.12] : R.midRow;
  // (hm 0: the bare rule; the runner's 滑行段 asks for FRAME.headMargin, LEARN §31)
  const head = (P) => P(R.head) < P(row) - hm;
  // (with the target: only a fitting answer is ever taken)
  const withTarget = search([...pts, [0, ty + 0.35, dist]], [head, (P) => P([0, ty - 0.1, dist]) > P(R.paperTop[0]) + 0.01], { ...band, cz: 1.4, fitOnly: true });
  const rigOnly = search(pts, [head], { ...band, cz: 1.0 });
  return withTarget.fits && Math.hypot(withTarget.pos[1] - 1.2, withTarget.pos[2]) < Math.hypot(rigOnly.pos[1] - 1.2, rigOnly.pos[2]) * 1.35 ? withTarget : rigOnly;
}

export { project as projectRig, search as searchFrame };
