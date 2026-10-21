// 字弹 M4 的取景搜索（src/learn/play/type/frame.js，LEARN §52）: the search runs on 射 / a question / a hint / a turn of
// the phone, synchronously — it was a brute grid (~10k poses, 50–70 small arrays each). The new one must give the same
// answers bit for bit (the old frame.js is kept verbatim below, as the oracle), allocate a bounded amount, and take a
// fraction of the time; frameFor's answers are kept by their inputs (a copy each time).
// 用法：node --test tests/learn/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { PerformanceObserver, constants } from 'node:perf_hooks';
import { frameFor, searchFrame, projectRig, FRAME, RIG_POINTS, hyp2, hyp3 } from '../../src/learn/play/type/frame.js';

// ---- the old search, verbatim (inkwave 088c6dd src/learn/play/type/frame.js: project, search, frameFor) ----------------
function oldProject(p, cam, look, fovY, aspect) {
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
function oldSearch(pts, rules, o) {
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
        const [x, y, z] = oldProject(p, cam, look, vfov, aspect);
        if (z <= 0.3) { ok = false; spill += 9; break; }
        minY = Math.min(minY, y); maxY = Math.max(maxY, y); maxX = Math.max(maxX, Math.abs(x));
        spill += Math.max(0, yLo - y) + Math.max(0, y - yHi) + Math.max(0, Math.abs(x) - xLim);
      }
      if (spill > 0) ok = false;
      const P = (p) => oldProject(p, cam, look, vfov, aspect)[1];
      const rulesOk = rules.every((fn) => fn(P));
      const r = Math.hypot(B, H - 1.2), cand = { pos: cam, look, fov: vfov, ndc: { minY, maxY, maxX, yLo, yHi }, r, spill };
      if (ok && rulesOk) { if (!best || r < best.r) best = cand; }
      else if (!fallback || spill + (rulesOk ? 0 : 0.5) < fallback.spill + (fallback.rulesOk ? 0 : 0.5)) { cand.rulesOk = rulesOk; fallback = cand; }
    }
  }
  const out = best || fallback;
  return { pos: out.pos.map((v) => +v.toFixed(3)), look: out.look.map((v) => +v.toFixed(3)), fov: out.fov, fits: !!best, ndc: out.ndc };
}
function oldFrameFor(o = {}) {
  const phase = o.phase || 'type';
  const aspect = o.aspect || 16 / 9, vfov = o.vfov || FRAME.vfov, dist = o.dist || FRAME.dist;
  const top = o.topFrac ?? FRAME.topFrac, kb = phase === 'word' ? (o.kbFrac ?? 0) : (o.kbFrac ?? (aspect < 1 ? 0.4 : 0.45));
  const m = FRAME.margin * 2;
  const band = { aspect, vfov, yLo: -1 + 2 * kb + m, yHi: 1 - 2 * top - m, xLim: 1 - m };
  const R = RIG_POINTS;
  if (phase === 'word') {
    const word = Object.assign({ w: 3.0, h: 0.9, y: 2.45 }, o.word || {});
    const ww = word.w / 2, y0 = word.y - word.h / 2, y1 = word.y + word.h / 2;
    const box = [[ww, y0, dist], [-ww, y0, dist], [ww, y1, dist], [-ww, y1, dist]];
    const pts = [...box, ...R.plate.slice(2), R.strike];
    let best = null;
    for (let fov = vfov; fov >= vfov * 0.55; fov -= 3) {
      const f = oldSearch(pts, [(P) => P([0, y0, dist]) > P(R.platenTop) + 0.04], { ...band, vfov: fov, cz: dist * 0.7, minH: 2.8 });
      if (!f.fits) continue;
      const span = Math.max(...box.map((p) => Math.abs(oldProject(p, f.pos, f.look, fov, aspect)[0])));
      if (!best || (span <= 0.8 && span > best.span)) best = { ...f, span };
      if (span > 0.8) break;
    }
    if (best) { delete best.span; return best; }
    return oldSearch(pts, [], { ...band, cz: dist * 0.7, minH: 2.8 });
  }
  const ty = o.targetY ?? FRAME.targetY;
  const pts = [...R.plate, R.strike, ...R.textLines, R.typed10];
  const row = aspect > 1.4 ? [0, 1.16, 1.12] : R.midRow;
  const hm = o.headMargin || 0;
  const head = (P) => P(R.head) < P(row) - hm;
  const withTarget = oldSearch([...pts, [0, ty + 0.35, dist]], [head, (P) => P([0, ty - 0.1, dist]) > P(R.paperTop[0]) + 0.01], { ...band, cz: 1.4 });
  const rigOnly = oldSearch(pts, [head], { ...band, cz: 1.0 });
  return withTarget.fits && Math.hypot(withTarget.pos[1] - 1.2, withTarget.pos[2]) < Math.hypot(rigOnly.pos[1] - 1.2, rigOnly.pos[2]) * 1.35 ? withTarget : rigOnly;
}

// the screens she meets (iPhone 13 / 15 upright and turned, a small phone, an iPad, a desktop) × the bands the stations
// ask (the strip's bottom, the keyboard's share, play-fix / §31's head margin), the word frames (short / long words, near
// / far), and the odd ones: bands nothing fits (the fallback), another lens, another target height
const PORTRAIT = [390 / 844, 393 / 852, 375 / 667], WIDE = [844 / 390, 852 / 393, 16 / 9], TABLET = [820 / 1180, 1180 / 820];
const CASES = [];
for (const aspect of [...PORTRAIT, ...WIDE, ...TABLET]) {
  for (const [kb, top] of [[undefined, undefined], [0.42, 0.2], [0.36, 0.26], [0.5, 0.12]]) {
    CASES.push({ phase: 'type', aspect, kbFrac: kb, topFrac: top });
    CASES.push({ phase: 'type', aspect, kbFrac: kb, topFrac: top, headMargin: FRAME.headMargin });
  }
  for (const [top, dist, w, y] of [[0.2, 6.2, 3.2, 2.4], [undefined, 6.2, 3.2, 2.4], [0.12, 9, 5.6, 2.4], [0.3, 3.4, 1.2, 1.9]]) {
    CASES.push({ phase: 'word', aspect, kbFrac: 0, topFrac: top, dist, word: { w, h: 0.9, y } });
  }
}
CASES.push({ phase: 'type', aspect: 0.46, kbFrac: 0.6, topFrac: 0.45 });                                   // nothing fits
CASES.push({ phase: 'type', aspect: 2.2, kbFrac: 0.6, topFrac: 0.4, headMargin: 0.05 });
CASES.push({ phase: 'word', aspect: 0.46, kbFrac: 0.5, topFrac: 0.45, dist: 6.5, word: { w: 9, h: 2, y: 2.4 } });
CASES.push({ phase: 'type', aspect: 0.46, vfov: 40, targetY: 2.2 });
CASES.push({ phase: 'word', aspect: 2.1, vfov: 60, dist: 4, word: { w: 2, h: 0.9, y: 2 } });

let salt = 0;
const fresh = (o) => ({ ...o, aspect: o.aspect * (1 + (++salt) * 1e-13) });   // (a key the memo has never seen)

test('取景搜索：frameFor gives the old answer bit for bit — every screen, band, word and the fallback', () => {
  let fits = 0, falls = 0;
  for (const o of CASES) {
    const want = oldFrameFor(o), got = frameFor(o);
    assert.deepStrictEqual(got, want, JSON.stringify(o));
    if (want.fits) fits++; else falls++;
  }
  assert.ok(fits >= 40 && falls >= 2, `both kinds of answer checked (${fits} fit, ${falls} fall back)`);
});

test('取景搜索：searchFrame with the stations\' own rules (wire/type.js head margin, arena/m1.js) — the old answer', () => {
  const R = RIG_POINTS, m = FRAME.margin * 2, pts = [...R.plate, R.strike, ...R.textLines, R.typed10];
  for (const aspect of [390 / 844, 844 / 390, 820 / 1180]) for (const [kb, top] of [[0.42, 0.2], [0.3, 0.1], [0.55, 0.4]]) for (const hm of [0, 0.05, 0.3]) {
    const row = aspect > 1.4 ? [0, 1.16, 1.12] : R.midRow;
    const args = () => [pts, [(P) => P(R.head) < P(row) - hm], { aspect, vfov: FRAME.vfov, yLo: -1 + 2 * kb + m, yHi: 1 - 2 * top - m, xLim: 1 - m, cz: 1.0 }];
    assert.deepStrictEqual(searchFrame(...args()), oldSearch(...args()), `${aspect.toFixed(2)} ${kb} ${top} ${hm}`);
  }
  // a rule-free search with its own lowest height (the word phase's fallback)
  const a = [pts, [], { aspect: 0.46, vfov: 46, yLo: -0.2, yHi: 0.5, xLim: 0.92, cz: 4.3, minH: 2.8 }];
  assert.deepStrictEqual(searchFrame(...a), oldSearch(...a));
});

test('取景搜索：hyp2 / hyp3 are Math.hypot, to the last bit, on what the search passes (finite, not all zero)', () => {
  let seed = 4242;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  const pick = () => { const k = rnd(); return k < 0.1 ? [0, -0, 1e-300, 1e300, 5e-324, 3][(rnd() * 6) | 0] : k < 0.6 ? (rnd() - 0.5) * 30 : (rnd() - 0.5) * 10 ** ((rnd() * 30 - 15) | 0); };
  for (let i = 0; i < 200000; i++) {
    const a = pick(), b = pick(), c = pick();
    if (a === 0 && b === 0) continue;
    assert.ok(Object.is(hyp2(a, b), Math.hypot(a, b)), `hyp2(${a}, ${b})`);
    assert.ok(Object.is(hyp3(a, b, c), Math.hypot(a, b, c)), `hyp3(${a}, ${b}, ${c})`);
    assert.ok(Object.is(hyp3(c, a, b), Math.hypot(c, a, b)), `hyp3(${c}, ${a}, ${b})`);
  }
  for (let B = 1.2; B <= 14; B += 0.1) for (let H = 1.8; H <= 10; H += 0.1) assert.ok(Object.is(hyp2(B, H - 1.2), Math.hypot(B, H - 1.2)));
});

test('取景搜索：an answer is kept by its inputs, handed out as a copy; another screen is another answer', () => {
  const o = { phase: 'type', aspect: 393 / 852, kbFrac: 0.42, topFrac: 0.22 };
  const a = frameFor(o);
  a.pos[1] = 99; a.top = 0.3; a.ndc.minY = 7;   // (runner/glide.js adds its band to the frame it keeps)
  const b = frameFor({ ...o });
  assert.deepStrictEqual(b, oldFrameFor(o), 'the kept answer is untouched by what a caller did to its copy');
  assert.notStrictEqual(b, frameFor(o), 'a new copy each time');
  assert.notDeepStrictEqual(frameFor({ ...o, aspect: 852 / 393 }).pos, b.pos, 'the phone turned: another frame');
  assert.notDeepStrictEqual(frameFor({ ...o, headMargin: 0.3 }), b, 'another rule: another frame');
});

// minor GCs (scavenges) while fn runs: the search's garbage, counted by the engine itself
async function scavenges(fn) {
  const seen = [];
  const obs = new PerformanceObserver((l) => { for (const e of l.getEntries()) seen.push([e.startTime, e.detail ? e.detail.kind : e.kind]); });
  obs.observe({ entryTypes: ['gc'] });
  await new Promise((r) => setTimeout(r, 20));
  const t0 = performance.now(); fn(); const t1 = performance.now();
  await new Promise((r) => setTimeout(r, 60));
  obs.disconnect();
  return seen.filter(([s, k]) => s >= t0 && s <= t1 && k === constants.NODE_PERFORMANCE_GC_MINOR).length;
}
// (12 cases a screen: upright type with the head margin, its word frame, the turned phone's type and word, a band nothing fits)
const PICK = [CASES[1], CASES[8], CASES[36], CASES[44], CASES[CASES.length - 5]];

test('取景搜索：the garbage is bounded — no scavenge across 20 fresh frames (the old search: dozens)', async () => {
  for (let k = 0; k < 4; k++) for (const o of PICK) frameFor(fresh(o));   // (warm: the JIT, the grid's tables)
  const now = await scavenges(() => { for (let k = 0; k < 4; k++) for (const o of PICK) frameFor(fresh(o)); });
  const before = await scavenges(() => { for (let k = 0; k < 4; k++) for (const o of PICK) oldFrameFor(fresh(o)); });
  assert.ok(before >= 20, `the measure sees the old search's garbage (${before} scavenges)`);
  assert.ok(now <= 2, `${now} scavenges for 20 frames (the old search: ${before})`);
});

test('取景搜索：a fraction of the old CPU time (same frames, same process)', () => {
  const cpu = (fn) => { const c = process.cpuUsage(); fn(); const d = process.cpuUsage(c); return (d.user + d.system) / 1000; };
  for (const o of PICK) { frameFor(fresh(o)); oldFrameFor(fresh(o)); }
  const now = cpu(() => { for (let k = 0; k < 2; k++) for (const o of PICK) frameFor(fresh(o)); });
  const before = cpu(() => { for (let k = 0; k < 2; k++) for (const o of PICK) oldFrameFor(fresh(o)); });
  assert.ok(now * 4 <= before, `10 frames: ${now.toFixed(0)} ms of CPU (the old search: ${before.toFixed(0)} ms)`);
});

test('取景搜索：projectRig is the projection the stations measure with (unchanged)', () => {
  const f = frameFor({ phase: 'type', aspect: 390 / 844, kbFrac: 0.42, topFrac: 0.2 });
  for (const p of [...RIG_POINTS.plate, RIG_POINTS.strike, RIG_POINTS.head]) assert.deepStrictEqual(projectRig(p, f.pos, f.look, f.fov, 390 / 844), oldProject(p, f.pos, f.look, f.fov, 390 / 844));
});
