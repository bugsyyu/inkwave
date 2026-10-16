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
export const FRAME = { vfov: 52, dist: 6.5, topFrac: 0.1, side: -0.5, margin: 0.04, targetY: 1.45 };
export const RIG_POINTS = {
  plate: [[0.93, 0.98, 0.52], [-0.93, 0.98, 0.52], [0.93, 1.16, 1.18], [-0.93, 1.16, 1.18]],
  strike: [0, 1.5, 1.62],
  platenTop: [0, 1.6, 1.7],
  paperTop: [[0.84, 2.3, 1.72], [-0.84, 2.3, 1.72]],
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

function search(pts, rules, o) {
  const { aspect, vfov, yLo, yHi, xLim, cz, minH = 1.8 } = o;
  const yMid = (yLo + yHi) / 2, t = Math.tan((vfov * Math.PI) / 360);
  const cy = (Math.min(...pts.map((p) => p[1])) + Math.max(...pts.map((p) => p[1]))) / 2;
  let best = null, fallback = null;
  for (let B = 1.2; B <= 14; B += 0.1) {
    for (let H = minH; H <= 10; H += 0.1) {
      const cam = [FRAME.side, H, -B];
      const ang = Math.atan2(cy - H, cz + B) - Math.atan(yMid * t);
      const look = [0, H + Math.tan(ang) * (cz + B), cz];
      let ok = true, minY = 9, maxY = -9, maxX = 0, spill = 0;
      for (const p of pts) {
        const [x, y, z] = project(p, cam, look, vfov, aspect);
        if (z <= 0.3) { ok = false; spill += 9; break; }
        minY = Math.min(minY, y); maxY = Math.max(maxY, y); maxX = Math.max(maxX, Math.abs(x));
        spill += Math.max(0, yLo - y) + Math.max(0, y - yHi) + Math.max(0, Math.abs(x) - xLim);
      }
      if (spill > 0) ok = false;
      const P = (p) => project(p, cam, look, vfov, aspect)[1];
      const rulesOk = rules.every((fn) => fn(P));
      const r = Math.hypot(B, H - 1.2), cand = { pos: cam, look, fov: vfov, ndc: { minY, maxY, maxX, yLo, yHi }, r, spill };
      if (ok && rulesOk) { if (!best || r < best.r) best = cand; }
      else if (!fallback || spill + (rulesOk ? 0 : 0.5) < fallback.spill + (fallback.rulesOk ? 0 : 0.5)) { cand.rulesOk = rulesOk; fallback = cand; }
    }
  }
  const out = best || fallback;
  return { pos: out.pos.map((v) => +v.toFixed(3)), look: out.look.map((v) => +v.toFixed(3)), fov: out.fov, fits: !!best, ndc: out.ndc };
}

/** The rig-frame camera pose for a phase ('type' | 'word'), as close as the rules allow. */
export function frameFor(o = {}) {
  const phase = o.phase || 'type';
  const aspect = o.aspect || 16 / 9, vfov = o.vfov || FRAME.vfov, dist = o.dist || FRAME.dist;
  const top = o.topFrac ?? FRAME.topFrac, kb = phase === 'word' ? (o.kbFrac ?? 0) : (o.kbFrac ?? (aspect < 1 ? 0.4 : 0.45));
  const m = FRAME.margin * 2;
  const band = { aspect, vfov, yLo: -1 + 2 * kb + m, yHi: 1 - 2 * top - m, xLim: 1 - m };
  const R = RIG_POINTS;
  if (phase === 'word') {
    const word = Object.assign({ w: 3.0, h: 0.9, y: 2.45 }, o.word || {});
    const ww = word.w / 2, y0 = word.y - word.h / 2, y1 = word.y + word.h / 2;
    // the sheet is gone (it is the shell): the word must clear the bare platen; the rig stays in the bottom of the frame
    const pts = [[ww, y0, dist], [-ww, y0, dist], [ww, y1, dist], [-ww, y1, dist], ...R.plate.slice(2), R.strike];
    return search(pts, [(P) => P([0, y0, dist]) > P(R.platenTop) + 0.04], { ...band, cz: dist * 0.7, minH: 2.8 });
  }
  // the target is context (the shot's direction), wanted on screen above the paper when the band allows it — a
  // portrait band rarely does without pushing the camera far away, so the rig wins: typing frames the rig alone
  const ty = o.targetY ?? FRAME.targetY;
  const pts = [...R.plate, R.strike, ...R.paperTop];
  const head = (P) => P(R.head) < P(R.midRow);            // her head below the plate's middle row
  const withTarget = search([...pts, [0, ty + 0.35, dist]], [head, (P) => P([0, ty - 0.1, dist]) > P(R.paperTop[0]) + 0.01], { ...band, cz: 1.4 });
  const rigOnly = search(pts, [head], { ...band, cz: 1.0 });
  return withTarget.fits && Math.hypot(withTarget.pos[1] - 1.2, withTarget.pos[2]) < Math.hypot(rigOnly.pos[1] - 1.2, rigOnly.pos[2]) * 1.35 ? withTarget : rigOnly;
}

export { project as projectRig };
