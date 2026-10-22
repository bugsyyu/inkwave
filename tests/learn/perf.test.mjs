// 手机上很卡（LEARN §50，业主 10-21：「还有个问题，很卡，手机上真的很卡，你需要深入做体系化优化」）: what the frame no longer
// pays for, each change proved to draw the same image — the ink atlas dried only while some ink is still wet.
// 用法：node --test tests/learn/perf.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
// a class method's body (two-space indented, closed by "\n  }\n"), to run on a stand-in
const method = (s, name) => { const a = s.indexOf(`\n  ${name}(`) + 1, b = s.indexOf('\n  }\n', a); const m = s.slice(a, b + 4); return m.slice(m.indexOf('{') + 1, m.lastIndexOf('}')); };

test('the ink atlas dries only while ink is wet: the same wetness texel for texel, frame for frame, and no pass (nor mip rebuild) once all is dry', () => {
  const P = src('src/world/paint.js');
  const flush = new Function('dt', method(P, 'flush')), draw = new Function(method(P, '_drawQuads'));
  // a stand-in atlas: N texels of wetness (0..255); a draw applies the dry quad first (renderOrder -1), then the splats (G = 1)
  const mk = () => {
    const at = () => ({ clearUpdateRanges() {}, addUpdateRange() {}, needsUpdate: false, itemSize: 1 });
    const T = {
      clock: 0, frame: 0, growing: [], _floods: [], quads: 0, _dryAcc: 0, _dryLeft: 0, wet: new Float64Array(8), hits: [], draws: 0,
      _dryU: { uDry: { value: 0 } }, dryMesh: { visible: false }, mesh: { visible: false }, texture: {}, rt: {}, scene: {}, cam: {},
      geo: { attributes: { aPos: at(), aLocal: at(), aSplat: at(), aStretch: at(), aGrow: at() }, setDrawRange() {} },
      _emitGrowth() {}, _floodSettle() {}, _floodStep() {},
    };
    T.renderer = { autoClear: true, getRenderTarget: () => null, setRenderTarget() {}, render: () => {
      T.draws++;
      if (T.dryMesh.visible) for (let i = 0; i < T.wet.length; i++) T.wet[i] = Math.max(0, T.wet[i] - Math.round(T._dryU.uDry.value * 255));
      for (const i of T.hits) T.wet[i] = 255;
      T.hits.length = 0;
    } };
    T.flush = (dt) => flush.call(T, dt); T._drawQuads = () => draw.call(T);
    T.splat = (i) => { T.hits.push(i); T.quads++; };
    return T;
  };
  // the rule before LEARN §50: a dry step every ≥ 2/40 s whether or not anything was wet
  const old = { acc: 0, wet: new Float64Array(8), draws: 0 };
  const oldFlush = (dt, hits) => {
    old.acc += dt; const n = Math.floor(old.acc * 40); let k = 0;
    if (n >= 2) { k = Math.min(n, 12); old.acc -= k / 40; }
    if (!k && !hits.length) return;
    old.draws++;
    for (let i = 0; i < old.wet.length; i++) old.wet[i] = Math.max(0, old.wet[i] - k);
    for (const i of hits) old.wet[i] = 255;
  };
  const T = mk();
  // 60 s at 120 Hz with a hitch: ink lands at 0.5 s and 3 s (two texels), a 0.4 s frame at 5 s, nothing after
  let t = 0, after = 0;
  for (let f = 0; t < 60; f++) {
    const dt = f === 600 ? 0.4 : 1 / 120; t += dt;
    const hits = f === 60 ? [1] : f === 360 ? [2, 3] : [];
    for (const i of hits) T.splat(i);
    oldFlush(dt, hits); T.flush(dt);
    assert.deepEqual([...T.wet], [...old.wet], `frame ${f}: the same wetness`);
    if (t > 3 + 6.6) after += T.draws;
  }
  assert.ok(T.wet.every((v) => v === 0), 'all dry at the end');
  assert.ok(T.draws < old.draws / 5, `atlas draws ${T.draws} (before ${old.draws}: a dry pass every 50 ms forever)`);
  // once dry (255 steps after the last ink: ≈ 6.4 s), no draw at all — the old rule kept drawing (and rebuilding the mips)
  const T2 = mk(); T2.splat(0);
  for (let i = 0; i < 120 * 7; i++) T2.flush(1 / 120);
  const d0 = T2.draws;
  for (let i = 0; i < 120 * 10; i++) T2.flush(1 / 120);
  assert.equal(T2.draws, d0, 'nothing drawn into the atlas while nothing is wet');
  assert.equal(T2._dryLeft <= 0, true);
  // floods land wet too, and clearing leaves nothing to dry
  assert.match(P, /if \(!drew\) \{[^\n]*\n\s+else this\._dryLeft = 255;/, 'a flood that drew ink restarts the drying');
  assert.match(method(P, 'clear'), /this\._dryLeft = 0;/);
});

// ---- the live ladder's state machine (src/core/render-gov.js LiveGov; config.js RENDER_LIVE) on synthetic frame streams
import { RENDER_STEPS, RENDER_RUNGS, RENDER_LIVE, TOUCH } from '../../src/config.js';
import { LiveGov, framePixels, rungDensity } from '../../src/core/render-gov.js';

// feed `secs` of frames of `ms` each (js ms of main thread), paced at the ladder's own cap on a 120 Hz screen; → the moves
function feed(L, secs, ms, js = 3, at = { t: 0 }) {
  const moves = [];
  for (const end = at.t + secs * 1000; at.t < end;) {
    const m = typeof ms === 'function' ? ms(at.t) : ms;
    at.t += m;
    if (L.frame(m, js, L.cap ? 1000 / L.cap : 1000 / 120)) moves.push({ t: +(at.t / 1000).toFixed(3), why: L.why, rung: L.rung, cap: L.cap });
  }
  return moves;
}

test('LiveGov: every session starts at 60 on the start rung; down within one 0.5 s window, one rung (or 120 → 60) at a time; a lone hitch, a gap, a hidden page move nothing', () => {
  const C = RENDER_LIVE;
  assert.ok(C.win <= 0.5 && C.down60 <= 0.15 && C.down120 <= 0.08, 'down fast: a half-second window, a few late frames');
  let L = new LiveGov({ start: 2, ceil: 4, hz120: true });
  assert.deepEqual([L.rung, L.cap, L.why], [2, 60, 'start']);
  // 33 ms frames at 60 (every one late): the first move ≤ 0.55 s in, then one every ≤ 0.8 s, down to the floor and no further
  let mv = feed(L, 3, 33.3);
  assert.deepEqual(mv.map((m) => [m.why, m.rung]), [['late', 1], ['late', 0]]);
  assert.ok(mv[0].t <= 0.55 && mv[1].t - mv[0].t <= 0.8, JSON.stringify(mv));
  // a lone 150 ms hitch among clean 60 Hz frames: one late frame in its window (< 15 %) — nothing moves
  L = new LiveGov({ start: 2, ceil: 4 });
  mv = feed(L, 6, (t) => (t > 3000 && t < 3100 ? 150 : 1000 / 60));
  assert.deepEqual(mv, []);
  // a gap (a hidden page, a load: > gapMs) breaks the window instead of counting as late
  L = new LiveGov({ start: 2, ceil: 4 });
  mv = feed(L, 0.3, 1000 / 60); assert.equal(L.frame(400, 3, 1000 / 60), false); assert.equal(L.frame(0, 3, 1000 / 60), false);
  mv = mv.concat(feed(L, 2, 1000 / 60));
  assert.deepEqual(mv, []); assert.equal(L.lateAll, 0);
  // at 120, judder (16.7 ms frames against an 8.3 ms target) → 60 first, the rung kept
  L = new LiveGov({ start: 4, ceil: 4, hz120: true }); L.cap = 0;
  mv = feed(L, 0.8, 1000 / 60);
  assert.deepEqual(mv.map((m) => [m.why, m.rung, m.cap]), [['late120', 4, 60]]); assert.ok(mv[0].t <= 0.55);
});

test('LiveGov: up slow — 8 s of clean windows a rung, a rung that fails within 4 s of being reached waits twice as long (up to 128 s); hot holds it down', () => {
  assert.ok(RENDER_LIVE.upHold >= 8 && RENDER_LIVE.probation >= 4);
  let L = new LiveGov({ start: 1, ceil: 3 }), at = { t: 0 };
  let mv = feed(L, 7.9, 1000 / 60, 3, at); assert.deepEqual(mv, [], 'nothing before 8 s');
  mv = feed(L, 0.7, 1000 / 60, 3, at); assert.deepEqual(mv.map((m) => [m.why, m.rung]), [['clean', 2]]);
  // rung 2 turns out too heavy: late at once → back to 1, and rung 2 now waits 16 s
  mv = feed(L, 0.8, 30, 3, at); assert.deepEqual(mv.map((m) => [m.why, m.rung]), [['late', 1]]);
  assert.equal(L.wait[2], 16);
  mv = feed(L, 15.5, 1000 / 60, 3, at); assert.deepEqual(mv, [], 'no try before 16 s');
  mv = feed(L, 1, 1000 / 60, 3, at); assert.deepEqual(mv.map((m) => m.rung), [2]);
  for (let i = 0; i < 6; i++) { feed(L, 0.8, 30, 3, at); feed(L, L.wait[2] + 1, 1000 / 60, 3, at); }
  assert.equal(L.wait[2], RENDER_LIVE.upMax, 'the wait stops doubling at upMax');
  // a later slowdown (long after the climb) is not the rung's fault: no doubling
  L = new LiveGov({ start: 1, ceil: 3 }); at = { t: 0 };
  feed(L, 9, 1000 / 60, 3, at); assert.equal(L.rung, 2);
  feed(L, 6, 1000 / 60, 3, at); feed(L, 0.8, 30, 3, at); assert.deepEqual([L.rung, L.wait[2]], [1, 8]);
  // hot: 60, one rung under the start at once; no climbing while hot; cool → the usual 8 s
  L = new LiveGov({ start: 2, ceil: 4, hz120: true }); at = { t: 0 };
  feed(L, 9, 1000 / 60, 3, at); assert.equal(L.rung, 3);
  assert.equal(L.setHot(true), true); assert.deepEqual([L.rung, L.cap, L.why], [1, 60, 'hot']);
  assert.equal(L.setHot(true), false, 'already hot: no move');
  assert.deepEqual(feed(L, 40, 1000 / 60, 3, at), []);
  L.setHot(false);
  assert.deepEqual(feed(L, 7.4, 1000 / 60, 3, at), [], 'cool: the usual 8 s first (± one window)');
  assert.deepEqual(feed(L, 1.2, 1000 / 60, 3, at).map((m) => m.rung), [2]);
});

test('LiveGov: 120 only on the top rung, after 20 s clean at 60, with the frame\'s JS p90 ≤ 5 ms and a 120 Hz screen; a failed try doubles the wait (up to 320 s)', () => {
  assert.ok(RENDER_LIVE.hzHold >= 20 && RENDER_LIVE.hzJs <= 5);
  let L = new LiveGov({ start: 4, ceil: 4, hz120: true }), at = { t: 0 };
  assert.deepEqual(feed(L, 19.9, 1000 / 60, 3, at), [], 'not before 20 s');
  assert.deepEqual(feed(L, 0.7, 1000 / 60, 3, at).map((m) => [m.why, m.cap]), [['try120', 0]]);
  // under the top rung: climb first, never 120 there
  L = new LiveGov({ start: 3, ceil: 4, hz120: true }); at = { t: 0 };
  const mv = feed(L, 25, 1000 / 60, 3, at);
  assert.deepEqual(mv.map((m) => m.why), ['clean'], 'the rung first'); assert.equal(L.cap, 60);
  // JS over 5 ms (p90), or no 120 Hz screen: never
  L = new LiveGov({ start: 4, ceil: 4, hz120: true }); assert.deepEqual(feed(L, 120, 1000 / 60, 5.5), []);
  L = new LiveGov({ start: 4, ceil: 4, hz120: false }); assert.deepEqual(feed(L, 120, 1000 / 60, 2), []);
  // failed tries (a frame that holds 60, not 120): each back to 60 within 0.8 s on the same rung; the waits 20 → 40 → 80 … ≤ 320 s
  L = new LiveGov({ start: 4, ceil: 4, hz120: true });
  const all = feed(L, 1000, 1000 / 60), tries = all.filter((m) => m.why === 'try120'), fails = all.filter((m) => m.why === 'late120');
  assert.equal(tries.length, 6, JSON.stringify(all)); assert.equal(fails.length, 6); assert.ok(all.every((m) => m.rung === 4));
  const gaps = tries.map((t, i) => t.t - (i ? fails[i - 1].t : 0));
  [20, 40, 80, 160, 320, 320].forEach((w, i) => assert.ok(gaps[i] >= w && gaps[i] < w + 1, `try ${i} after ${gaps[i].toFixed(2)} s (wait ${w})`));
  fails.forEach((f, i) => assert.ok(f.t - tries[i].t <= 0.8 && f.cap === 60, 'back to 60 at once'));
});

test('LiveGov pinned (?rung=N): never moves, still counts for the readout', () => {
  const L = new LiveGov({ start: 3, ceil: 4, hz120: true, pin: true });
  assert.deepEqual(feed(L, 30, 40), []); assert.deepEqual(feed(L, 60, 1000 / 60), []);
  assert.deepEqual([L.rung, L.cap], [3, 60]); assert.equal(L.rn, RENDER_LIVE.ring);
});

test('LiveGov: nothing allocated per frame (two rings, no closures, no literals in frame / _judge); the readout\'s percentiles from the last frames', () => {
  const R = src('src/core/render-gov.js');
  const frame = method(R, 'frame'), judge = method(R, '_judge');
  for (const [n, b] of [['frame', frame], ['_judge', judge]]) assert.ok(!/new |=>|\[\]|\{\s*\w+:|`/.test(b), n + ' allocates nothing');
  const L = new LiveGov({ start: 2, ceil: 4 });
  for (let i = 0; i < 200; i++) L.frame(i % 10 === 9 ? 33.3 : 1000 / 60, i % 2 ? 2 : 6, 1000 / 60);
  assert.equal(L.rn, RENDER_LIVE.ring);
  assert.ok(Math.abs(L.ivP(0.5) - 1000 / 60) < 0.01 && Math.abs(L.ivP(0.95) - 33.3) < 0.01);
  assert.equal(L.jsP(0.5), 2); assert.equal(L.jsP(0.95), 6);
});

// ---- the frame's pixels (render-gov.js framePixels) — the GPU's load as a count, on her 393 × 852 @ 3
const HER = { w: 393, h: 852, dpr: 3 };
const OLD = [   // the steps before LEARN §50 (config.js then): what each class launched with
  { pixelRatio: 2.5, pixels: 3.2e6, ao: true, bloom: true, shadows: true, shadowSize: 2048 },
  { pixelRatio: 2.25, pixels: 3.2e6, ao: false, bloom: true, shadows: true, shadowSize: 2048 },
  { pixelRatio: 2.0, pixels: 2.1e6, ao: false, bloom: true, shadows: false, shadowSize: 2048 },
  { pixelRatio: 2.0, pixels: 2.1e6, ao: false, bloom: true, shadows: false, shadowSize: 1024 },
];

test('framePixels: the old chain reproduces what tools/learn/perf-probe measured pass by pass (w2d3, the old step 0); every class now launches on well under half of it, the best rung still costs less than the old start', () => {
  // the probe, 10-21, puzzle w2d3 at the old step 0 (982 × 2130): px per pass (perf-probe passes[].px)
  const measured = { shadow: 4194304, main: 2092725, 'ao:normals': 523980, ao: 523980, 'ao:denoise': 523980, 'ao:copy': 2092725, 'ao:blend': 2092725, 'bloom:bright': 522915, 'bloom:blur': 1394518, 'bloom:composite': 522915, 'bloom:blend': 2092725, grade: 2092725, output: 2092725, 'smaa:edges': 2092725, 'smaa:weights': 2092725, 'smaa:blend': 2093790 };
  const old0 = framePixels({ ...HER, legacy: OLD[0] });
  assert.equal(old0.density, 2.5);
  for (const [k, px] of old0.passes) assert.ok(Math.abs(px - measured[k]) / measured[k] < 0.001, `${k}: model ${px}, measured ${measured[k]}`);
  assert.equal(old0.passes.length, Object.keys(measured).length);
  const before = old0.px;   // ≈ 27.0 MP (+ 2.1 with the screen FX on)
  // the launch of each class now (start rung, screen FX off) vs before
  const top = framePixels({ ...HER, step: 0 }), high = framePixels({ ...HER, step: 2 }), base = framePixels({ ...HER, step: 3 });
  assert.ok(top.px <= 12.6e6 && top.px / before <= 0.47, `top: ${(top.px / 1e6).toFixed(2)} MP (before ${(before / 1e6).toFixed(2)})`);
  assert.ok(high.px <= 8.4e6 && high.px / framePixels({ ...HER, legacy: OLD[2] }).px <= 0.77, `high: ${(high.px / 1e6).toFixed(2)} MP`);
  assert.ok(base.px <= 6.2e6 && base.px / framePixels({ ...HER, legacy: OLD[3] }).px <= 0.6, `base: ${(base.px / 1e6).toFixed(2)} MP`);
  // the best rung of the best step (2.5× + the AO: the old step 0's look) still under the old one: copy, blend and output gone
  const best = framePixels({ ...HER, step: 0, rung: 5 });
  assert.ok(best.px <= 20.9e6 && best.px < before - 6.2e6, `best: ${(best.px / 1e6).toFixed(2)} MP`);
  for (const p of ['ao:copy', 'bloom:blend', 'output']) assert.ok(!best.passes.some((q) => q[0] === p), p + ' gone');
  // every rung of every step: bounded, and no richer rung cheaper than a poorer one
  for (const s of RENDER_STEPS) {
    let last = 0;
    for (let r = s.rungs[0]; r <= s.rungs[1]; r++) { const f = framePixels({ ...HER, step: s.step, rung: r }); assert.ok(f.px >= last && f.px <= 20.9e6, `step ${s.step} rung ${r}`); last = f.px; }
  }
  // the screen FX while on adds one pass the size of the screen, never two (it ends with the output step itself)
  assert.ok(Math.abs(framePixels({ ...HER, step: 0, fx: true }).px - top.px - top.passes.find((p) => p[0] === 'main')[1]) < 1);
});

test('the output step folded into the last pass before SMAA is three\'s OutputPass word for word: Neutral tone mapping, then the sRGB transfer; the bloom\'s composite added in the grade as its blend (ONE, ONE) did', () => {
  const R = src('src/core/renderer.js'), T = src('vendor/three/build/three.module.js');
  const theirs = /vec3 NeutralToneMapping\( vec3 color \) \{\\n([^"]*?)\\n\}\\nvec3 CustomToneMapping/.exec(T)[1].split('\\n').map((l) => l.replace(/\\t/g, '').trim());
  const ours = /vec3 iwNeutral\( vec3 color \) \{\n([\s\S]*?)\n\s*\}\n\s*vec4 iwOut/.exec(R)[1].split('\n').map((l) => l.trim()).filter(Boolean);
  assert.deepEqual(ours, theirs.map((l) => l.replace('toneMappingExposure', 'uToneExp')));
  assert.match(R, /vec4 iwOut\( vec4 c \) \{ if \( uOut < 0\.5 \) return c; c\.rgb = iwNeutral\( c\.rgb \); return sRGBTransferOETF\( c \); \}/);
  assert.match(src('vendor/three/jsm/shaders/OutputShader.js'), /gl_FragColor\.rgb = NeutralToneMapping\( gl_FragColor\.rgb \);[\s\S]*gl_FragColor = sRGBTransferOETF\( gl_FragColor \);/, 'what OutputPass does');
  assert.match(R, /r\.toneMapping = THREE\.NeutralToneMapping;/);
  // the bloom: three's own blend is ONE, ONE (premultiplied additive) of its composite onto the frame — the grade adds the composite
  const B = src('vendor/three/jsm/postprocessing/UnrealBloomPass.js');
  assert.match(B, /this\.blendMaterial = new ShaderMaterial\( \{[\s\S]*?premultipliedAlpha: true,\s*blending: AdditiveBlending/);
  assert.match(T, /case AdditiveBlending:\s*gl\.blendFunc\( gl\.ONE, gl\.ONE \);/);
  assert.match(R, /if \(uBloomOn > 0\.5\) c \+= texture2D\(tBloom, vUv\);/);
  assert.match(R, /this\.grade\.uniforms\.tBloom\.value = this\.bloom\.renderTargetsHorizontal\[0\]\.texture;/);
  // only where SMAA comes last (touch): the grade or the screen FX ends with the output step, the output pass off
  assert.match(R, /this\.mergeOut = !!\(q\.msaa && !this\.samples\);\n\s+this\.output\.enabled = !this\.mergeOut;/);
  assert.match(src('src/fx/screenfx.js'), /gl_FragColor = iwOut\(vec4\(col, 1\.0\)\);/);
});

test('in a level nothing blurs over the live 3D: the touch buttons, the map\'s tilt bands and the splat tint all lose their backdrop-filter there; no blur rule targets the level\'s own layers', () => {
  const rules = (css) => [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((m) => ({ sel: m[1].trim(), body: m[2] }));
  const vals = (r) => [...r.body.matchAll(/(?:^|[;\s])(?:-webkit-)?backdrop-filter\s*:\s*([^;]+)/g)].map((m) => m[1].replace(/!important/, '').trim());
  const blurs = (css) => rules(css).filter((r) => vals(r).some((v) => v !== 'none'));
  const nones = (css) => rules(css).filter((r) => vals(r).length && vals(r).every((v) => v === 'none'));
  const HUD = src('styles/hud.css'), TOUCH_CSS = src('styles/touch.css'), UI = src('styles/ui.css');
  // the HUD's and the touch layer's blurs: exactly these three surfaces …
  assert.deepEqual(blurs(HUD).map((r) => r.sel).sort(), ['.iw-dio__tilt', '.iw-spl__tint']);
  assert.deepEqual(blurs(TOUCH_CSS).map((r) => r.sel), ['.iw-touch__btn']);
  // … and each is off in a level: the splat tint whenever the screen FX is attached (it attaches itself: screenfx.js), the
  // map's tilt bands and the touch buttons under the level's class (hud-learn / the runner set it on both layers)
  assert.ok(nones(HUD).some((r) => r.sel === '.iw-hud--fx .iw-spl__tint'));
  assert.ok(nones(HUD).some((r) => r.sel === '.iw-hud.is-learn .iw-dio__tilt'));
  assert.ok(nones(TOUCH_CSS).some((r) => r.sel === '.iw-touch.is-learn .iw-touch__btn, .iw-touch.is-runner .iw-touch__btn'));
  assert.match(src('src/ui/hud-learn.js'), /this\.hud\.el\?\.classList\.add\('is-learn'\);\n\s+G\.touch\?\.el\?\.classList\.add\('is-learn'\);/);
  assert.match(src('src/learn/play/runner/runner.js'), /G\.hud\?\.el\?\.classList\.add\('is-learn', 'is-runner'\);[^\n]*\n\s+G\.touch\?\.el\?\.classList\.add\('is-runner'\);/);
  assert.match(src('src/fx/screenfx.js'), /this\.G\.hud\?\.attachScreenFX\?\.\(this\);/, 'the screen FX attaches itself to the HUD (→ iw-hud--fx)');
  // the menus' glass (ui.css) never targets the level's layers: the HUD, the strip, the game keyboard, the touch layer
  for (const r of blurs(UI)) assert.ok(!/\.iw-(hud|ps|pk|learn|touch|run|xh)\b/.test(r.sel), r.sel);
});

test('waterHeightAt (every floating thing, every frame): no array, no iterator per call — and the same heights as the loop it replaced', async () => {
  const E = src('src/world/environment.js');
  const { Environment } = await import('../../src/world/environment.js');
  const { PLAYER } = await import('../../src/config.js');
  const body = method(E, 'waterHeightAt');
  assert.ok(!/\[M\.decks|for \(const/.test(body), 'no array literal, no for…of');
  // the replaced loop, run on the same helpers (sdRectJS and smooth from the module's own source)
  const helper = (re) => re.exec(E)[0];
  const old = new Function('x', 'z', 't', 'WATER_Y', `${helper(/function sdRectJS\([\s\S]*?\n\}\n/)}${helper(/const smooth = [^\n]*\n/)}
    let d = 1e5; const M = this._marinaData;
    for (const set of M ? [M.decks, M.wet] : [this.footprint]) for (const r of set) {
      const ex = Math.max(r.minX - x, x - r.maxX, 0), ez = Math.max(r.minZ - z, z - r.maxZ, 0);
      if (ex * ex + ez * ez < d * d) d = Math.min(d, sdRectJS(r, x, z));
    }
    ${body.slice(body.indexOf('let amp'))}`);
  const rect = (cx, cz, hx, hz, a) => ({ cx, cz, hx, hz, ax: Math.cos(a), az: Math.sin(a), minX: cx - hx - hz, maxX: cx + hx + hz, minZ: cz - hx - hz, maxZ: cz + hx + hz });
  const rs = [rect(0, 0, 10, 6, 0.3), rect(25, -8, 4, 9, -0.7), rect(-30, 20, 12, 3, 1.1)];
  const stubs = [{ footprint: rs, time: 3.2 }, { _marinaData: { decks: rs.slice(0, 2), wet: rs.slice(2) }, bounds: { minX: -60, maxX: 60, minZ: -80, maxZ: 80 }, footprint: [], time: 7.7 }];
  let n = 0;
  for (const S of stubs) for (let i = 0; i < 400; i++) {
    const x = Math.sin(i * 12.9898) * 90, z = Math.cos(i * 78.233) * 110;
    assert.equal(Environment.prototype.waterHeightAt.call(S, x, z), old.call(S, x, z, S.time, PLAYER.waterY)); n++;
  }
  assert.equal(n, 800);
});

test('the scene\'s world matrices are walked once a frame (not again by every pass that renders it); the harbour reflection renders before the passes, at the top level, with no arrays or closures per frame; the window size is not read every frame', () => {
  const R = src('src/core/renderer.js'), E = src('src/world/environment.js');
  const render = R.slice(R.indexOf('\n  render() {'), R.indexOf('\n  }\n', R.indexOf('\n  render() {')));   // (Renderer's own, not the passes')
  assert.match(render, /if \(sc && auto\) \{ sc\.updateMatrixWorld\(\); sc\.matrixWorldAutoUpdate = false; \}\n\s+try \{/);
  assert.match(render, /this\.composer\.render\(\);\n\s+\} finally \{ if \(sc && auto\) sc\.matrixWorldAutoUpdate = true; \}/);
  assert.ok(render.indexOf('sc.updateMatrixWorld()') > render.indexOf('this.resize();'), 'after the camera\'s aspect is set');
  // the harbour's reflection: before the passes, at the top level (a nested render gets its own lights state in three, with
  // its own version — every lit material drawn in both rebuilt its program parameters twice a frame)
  assert.ok(render.indexOf('G.env?.renderReflection?.(this.renderer, sc, this.camera);') > render.indexOf('sc.matrixWorldAutoUpdate = false;') && render.indexOf('G.env?.renderReflection?.(') < render.indexOf('this.composer.render();'));
  assert.ok(!/onBeforeRender = \(renderer, scene, camera\) => this\._renderReflection/.test(E), 'no longer from inside the main pass');
  const T = src('vendor/three/build/three.module.js');
  assert.match(T, /currentRenderState = renderStates\.get\( scene, renderStateStack\.length \);/, 'three: one render state per nesting depth');
  assert.match(T, /state\.version = nextVersion \+\+;/, 'three: each lights state numbers itself from a counter they share');
  // the window's size: from resize events (and once a second), not read every frame
  assert.match(render, /if \(this\._sizeDirty \|\| now - this\._sizeT > 1000\) \{ this\._sizeDirty = false; this\._sizeT = now; this\.resize\(\); \}/);
  assert.match(R, /window\.addEventListener\('resize', dirty\); window\.addEventListener\('orientationchange', dirty\);/);
  assert.match(src('src/main.js'), /const W = this\.R\._w \|\| innerWidth, H = this\.R\._h \|\| innerHeight;/, 'the HUD reuses it');
  const refl = method(E, '_renderReflection');
  assert.ok(!/\.map\(|\.forEach\(|\.\.\.this\._reflSkips|const hide = \[/.test(refl), 'the hide / vis lists are kept, filled by index');
  assert.match(refl, /const hide = this\._reflHide \|\| \(this\._reflHide = \[\]\), vis = this\._reflVis \|\| \(this\._reflVis = \[\]\);/);
  const skips = method(E, '_reflSkips');
  assert.ok(!/\+ ':' \+|\.find\(/.test(skips), 'no key string, no closure');
});

test('a match\'s compile() with no target bound compiles for the composer\'s HDR buffer (the target the level draws into); bound targets and the menus untouched; a puzzle\'s stations warm behind the black', () => {
  const M = src('src/main.js');
  const a = M.indexOf('      const r = this.R.renderer, compile = r.compile.bind(r);'), b = M.indexOf('\n    }\n', a);
  const block = M.slice(a, b);
  // run the block on a stand-in renderer
  const log = [], RB = { isWebGLRenderTarget: true, name: 'hdr' };
  const r = { cur: null, getRenderTarget() { return this.cur; }, setRenderTarget(t) { this.cur = t; }, compile(sc, cam, tg) { log.push(this.cur ? this.cur.name || 'rt' : 'canvas'); return 'ok'; } };
  const Gs = { mode: 'match' };
  const self = { R: { renderer: r, composer: { readBuffer: RB } } };
  new Function('G', block).call(self, Gs);
  assert.equal(r.compile({}, {}, {}), 'ok'); assert.deepEqual(log, ['hdr']); assert.equal(r.cur, null, 'the canvas bound again after');
  r.cur = { name: 'atlas' }; r.compile({}, {}); assert.equal(log[1], 'atlas', 'a target already bound is kept'); r.cur = null;
  Gs.mode = 'menu'; r.compile({}, {}); assert.equal(log[2], 'canvas', 'outside a match: as three does');
  Gs.mode = 'match'; const thrower = { ...r, compile() { throw new Error('x'); } };
  // (a throwing compile still unbinds: the wrapper's finally)
  const r2 = { cur: null, getRenderTarget() { return this.cur; }, setRenderTarget(t) { this.cur = t; }, compile() { throw new Error('boom'); } };
  new Function('G', block).call({ R: { renderer: r2, composer: { readBuffer: RB } } }, Gs);
  assert.throws(() => r2.compile({}, {})); assert.equal(r2.cur, null); void thrower;
  assert.match(M, /compileAsync calls this\.compile: one wrapper covers both/);
  assert.match(src('vendor/three/build/three.module.js'), /this\.compileAsync = function \( scene, camera, targetScene = null \) \{\s*const materials = this\.compile\( scene, camera, targetScene \);/, 'three r186: compileAsync goes through this.compile');
  // the puzzle host's warm-up (stations + the first gates' boards) runs inside _warmStage, before the stage compile and the real frame
  const W = M.slice(M.indexOf('  async _warmStage() {'), M.indexOf('\n  }\n', M.indexOf('  async _warmStage() {')));
  assert.ok(W.indexOf('P._warmAll()') > 0 && W.indexOf('P._warmAll()') < W.indexOf('await warmScene(') && W.indexOf('await warmScene(') < W.indexOf('this._frame(1 / 60);'));
  assert.match(W, /if \(P && P\._warmT > 0 && typeof P\._warmAll === 'function'\) \{ P\._warmT = 0; try \{ P\._warmAll\(\); \}/, 'once: its own timer cleared');
  assert.match(src('src/learn/play/host.js'), /if \(this\._warmT > 0\) \{ this\._warmT -= dt; if \(this\._warmT <= 0\) this\._warmAll\(\); \}/, 'the host warms on its timer only while it is set');
});

test('shadow casters: one depth material per caster kind — instanced, instanced with colours, skinned — shared and re-checked; plain, alpha-tested, morphed and own-depth casters are left to three', async () => {
  const THREE = await import('three');
  const R = src('src/core/renderer.js'), T = src('vendor/three/build/three.module.js');
  // three r186: one depth material for every caster that brings none, and a whole program look-up whenever the kind of object
  // a material last drew differs (instanced ↔ plain ↔ skinned) …
  assert.match(T, /const customMaterial = \( light\.isPointLight === true \) \? object\.customDistanceMaterial : object\.customDepthMaterial;/);
  assert.match(T, /\} else if \( object\.isInstancedMesh && materialProperties\.instancing === false \) \{/);
  assert.match(T, /\} else if \( ! object\.isSkinnedMesh && materialProperties\.skinning === true \) \{/);
  // … and a copy of its own per material for exactly these (they keep it)
  assert.match(T, /\( material\.displacementMap && material\.displacementScale !== 0 \) \|\|\s*\( material\.alphaMap && material\.alphaTest > 0 \) \|\|\s*\( material\.map && material\.alphaTest > 0 \) \|\|\s*\( material\.alphaToCoverage === true \) \) \{/);
  const kinds = new Function('THREE', method(R, '_depthKinds'));
  const sc = new THREE.Scene(), geo = new THREE.BoxGeometry(), mat = new THREE.MeshStandardMaterial();
  const cast = (o) => { o.castShadow = true; sc.add(o); return o; };
  const a = cast(new THREE.InstancedMesh(geo, mat, 2)), b = cast(new THREE.InstancedMesh(geo, mat, 3));
  const c = cast(new THREE.InstancedMesh(geo, mat, 2)); c.setColorAt(0, new THREE.Color(1, 0, 0));
  const sk = cast(new THREE.SkinnedMesh(geo, mat)), plain = cast(new THREE.Mesh(geo, mat));
  const leafMat = new THREE.MeshStandardMaterial({ map: new THREE.Texture(), alphaTest: 0.5 }), leaf = cast(new THREE.InstancedMesh(geo, leafMat, 2));
  const mg = geo.clone(); mg.morphAttributes.position = [geo.attributes.position.clone()];
  const morph = cast(new THREE.InstancedMesh(mg, mat, 2));
  const own = new THREE.MeshDepthMaterial(), cloth = cast(new THREE.InstancedMesh(geo, mat, 2)); cloth.customDepthMaterial = own;
  const dark = new THREE.InstancedMesh(geo, mat, 2); sc.add(dark);   // casts no shadow
  const self = { scene: sc, renderer: { shadowMap: { enabled: true } } };
  kinds.call(self, THREE);
  assert.ok(a.customDepthMaterial && a.customDepthMaterial.isMeshDepthMaterial);
  assert.equal(b.customDepthMaterial, a.customDepthMaterial, 'one per kind, shared');
  assert.ok(c.customDepthMaterial.isMeshDepthMaterial && c.customDepthMaterial !== a.customDepthMaterial, 'instance colours: a kind of their own');
  assert.ok(sk.customDepthMaterial.isMeshDepthMaterial && sk.customDepthMaterial !== a.customDepthMaterial && sk.customDepthMaterial !== c.customDepthMaterial);
  for (const o of [plain, leaf, morph, dark]) assert.equal(o.customDepthMaterial, undefined);
  assert.equal(cloth.customDepthMaterial, own, 'a caster\'s own depth material (cloth, flags) is kept');
  // three's own defaults (the depth programs are shared by key: nothing new to compile)
  const ref = new THREE.MeshDepthMaterial();
  for (const k of ['depthPacking', 'side', 'alphaTest', 'map']) assert.equal(a.customDepthMaterial[k], ref[k], k);
  // a material that turns alpha-tested goes back to three at the next check; the others stay
  a.material = leafMat; kinds.call(self, THREE);
  assert.equal(a.customDepthMaterial, undefined); assert.ok(b.customDepthMaterial.isMeshDepthMaterial);
  // shadows off: nothing touched
  const sc2 = new THREE.Scene(), d = new THREE.InstancedMesh(geo, mat, 1); d.castShadow = true; sc2.add(d);
  kinds.call({ scene: sc2, renderer: { shadowMap: { enabled: false } } }, THREE); assert.equal(d.customDepthMaterial, undefined);
  // checked on a new scene and every 60 frames, not every frame
  const render = R.slice(R.indexOf('\n  render() {'), R.indexOf('\n  }\n', R.indexOf('\n  render() {')));
  assert.match(render, /if \(this\.scene !== this\._depthScene \|\| !\(\+\+this\._depthN < 60\)\) \{ this\._depthScene = this\.scene; this\._depthN = 0; this\._depthKinds\(\); \}/);
});

test('nothing out of sight keeps animating: the map\'s faded jump line, the put-away keyboard\'s caret, the cursor with no focus pause; the squad bar hidden in practice / learning stops', () => {
  const HUD = src('styles/hud.css'), UI = src('styles/ui.css'), PK = src('src/ui/play-keys.js');
  // each one runs forever …
  assert.match(HUD, /\n\.iw-map__jline path \{[^}]*animation: iw-jline [^;]*infinite;/);
  assert.match(PK, /\n\.iw-pk__strip i \{[^}]*animation: iw-pk-caret [^;]*infinite;/);
  assert.match(UI, /\nhtml\.iw-glass \.iw-cursor__glow \{[^}]*animation: iw-glass-breathe [^;]*infinite;/);
  assert.match(UI, /\n\.iw-cursor__ring \{[^}]*\n?[^}]*animation: iw-cursor-pulse [^;]*infinite;/);
  assert.match(HUD, /\n\.iw-sq__you \{[^}]*animation: iw-you [^;]*infinite;/, 'the squad bar\'s own');
  // … and is paused in the state that hides it — the state the code sets
  assert.match(HUD, /\n\.iw-map__jline \{[^}]*opacity: 0;/);
  assert.match(HUD, /\n\.iw-map__jline:not\(\.is-on\) path \{ animation-play-state: paused; \}/);
  assert.match(src('src/ui/hud.js'), /this\.mapJumpLine\.classList\.toggle\('is-on', showLine\);/);
  assert.match(PK, /\n\.iw-pk\.is-off \.iw-pk__strip i \{ animation-play-state: paused; \}/);
  assert.match(PK, /hide\(\) \{ this\.visible = false; this\.el\.classList\.add\('is-off'\);/);
  assert.match(UI, /\n\.iw-cursor \{[^}]*opacity: 0;/);
  assert.match(UI, /\n\.iw-cursor:not\(\.is-on\) \.iw-cursor__ring, \.iw-cursor:not\(\.is-on\) \.iw-cursor__glow \{ animation-play-state: paused; \}/);
  assert.match(src('src/ui/menus.js'), /if \(C\.on\) \{ this\.cursorEl\.classList\.remove\('is-on'\); C\.on = false; \}/);
  assert.match(HUD, /\n\.iw-hud\.is-practice \.iw-squad \{ visibility: hidden; \}\n\.iw-hud\.is-practice \.iw-squad \* \{ animation: none; \}/);
});

test('the typewriter\'s instanced type-bars draw with a plastic of their own (same shader, same cache key): the shared one rebuilt its program parameters at every switch between them and the plain hull, ~10 times a frame', async () => {
  const M = await import('../../src/game/character-mats.js');
  const p = M.getPlasticMaterial(), q = M.getPlasticInstMaterial();
  assert.notEqual(p, q); assert.equal(M.getPlasticInstMaterial(), q, 'one, kept');
  assert.equal(q.onBeforeCompile, p.onBeforeCompile); assert.equal(q.customProgramCacheKey(), p.customProgramCacheKey());
  for (const k of ['type', 'vertexColors', 'roughness', 'metalness', 'clearcoat', 'clearcoatRoughness', 'side', 'transparent']) assert.equal(q[k], p[k], k);
  assert.ok(q.color.equals(p.color));
  assert.match(src('src/learn/play/type/rig.js'), /this\.bars = new THREE\.InstancedMesh\(g\.bar, getPlasticInstMaterial\(\), g\.bars\.length\);/);
  // no InstancedMesh anywhere in the game is built on the shared plastic
  const { readdirSync } = await import('node:fs');
  const files = readdirSync(new URL('../../src/', import.meta.url), { recursive: true }).filter((f) => String(f).endsWith('.js'));
  for (const f of files) for (const line of src('src/' + f).split('\n')) {
    if (/new THREE\.InstancedMesh\(/.test(line)) assert.ok(!/\bplastic\b|getPlasticMaterial\(\)/.test(line), `${f}: ${line.trim()}`);
  }
});

test('a rung taken before the first composer exists (?rung=N at boot: main.js _liveInit runs before setScene builds it) only sets the rung — the composer is then built at its density; later moves resize it', async () => {
  const { RENDER_RUNGS } = await import('../../src/config.js');
  const R = src('src/core/renderer.js'), M = src('src/main.js');
  assert.ok(M.indexOf('this._liveInit();') < M.indexOf('this.R.setScene(scene, camera);'), 'the ladder is set up before the composer');
  assert.match(method(R, '_buildComposer'), /const pr = this\._density\(\) \* this\.dynScale;/, 'the composer takes the rung\'s density');
  const setRung = new Function('RENDER_RUNGS', 'n', method(R, 'setRung'));
  const log = [];
  const self = { q: { rungs: [2, 5] }, rung: 2, _w: 393, _h: 852, _density: () => (self.rung >= 4 ? 2.5 : 2), _rungPasses: () => log.push('passes'),
    renderer: { pr: 2, getPixelRatio() { return this.pr; }, setPixelRatio(p) { this.pr = p; log.push('pr ' + p); } } };
  assert.equal(setRung.call(self, RENDER_RUNGS, 5), true); assert.equal(self.rung, 5); assert.deepEqual(log, [], 'nothing to resize yet');
  // (setScene → _buildComposer: the targets at rung 5's density)
  self.composer = { setPixelRatio: (p) => log.push('composer pr ' + p), setSize: (w, h) => log.push(`composer ${w}x${h}`) }; self.renderer.pr = self._density();
  assert.equal(setRung.call(self, RENDER_RUNGS, 3), true);
  assert.deepEqual(log, ['pr 2', 'composer pr 2', 'composer 393x852', 'passes']);
  assert.equal(setRung.call(self, RENDER_RUNGS, 3), false, 'the same rung: nothing');
});

test('flat, additive and one-colour see-through markers draw in one pass: three draws a transparent double-sided material twice a frame (back faces, then front) and rebuilds its program parameters before each — the gate rings, the beams, the locks, the finish ring, the signs, the question plates no longer', () => {
  const T = src('vendor/three/build/three.module.js');
  assert.match(T, /if \( material\.transparent === true && material\.side === DoubleSide && material\.forceSinglePass === false \) \{\s*material\.side = BackSide;\s*material\.needsUpdate = true;\s*_this\.renderBufferDirect\( camera, scene, geometry, material, object, group \);\s*material\.side = FrontSide;\s*material\.needsUpdate = true;/, 'three r186: two passes, a needsUpdate (= a program look-up) before each');
  const F = src('src/learn/flow.js'), body = method(F, '_buildMeshes');
  assert.match(body, /const ringG = new THREE\.RingGeometry\(/, 'the ring is flat');
  assert.match(body, /const ring = new THREE\.Mesh\(ringG, mat\(\{ color: col\.clone\(\), opacity: 0\.85, forceSinglePass: true \}\)\);/);
  assert.match(body, /const beam = new THREE\.Mesh\(beamG, mat\(\{ color: col\.clone\(\), opacity: 0\.22, blending: THREE\.AdditiveBlending, forceSinglePass: true \}\)\);/, 'the beam adds: any order is the same sum');
  // the lock is closed (seen through itself) but one unlit colour with one opacity: a back face and a front face over the same
  // pixel blend the same way, so either order gives the same colour — c·a + (c·a + d·(1 − a))·(1 − a), both ways
  assert.match(body, /const lock = new THREE\.Mesh\(lockG, mat\(\{ color: col\.clone\(\), opacity: 0\.95, forceSinglePass: true \}\)\);/);
  assert.match(body, /const mat = \(o\) => \{ const m = new THREE\.MeshBasicMaterial\(\{ transparent: true, depthWrite: false, toneMapped: false, side: THREE\.DoubleSide, \.\.\.o \}\);/, 'unlit, no depth write, no map: one colour');
  assert.ok(!/M\.lock\.material\.(map|vertexColors|emissive)/.test(F), 'nothing gives the lock a second colour');
  const over = (c, a) => (d) => c * a + d * (1 - a);   // (normal blending of one face over what is under it)
  for (const [c, a, d] of [[0.9, 0.95, 0.1], [0.42, 0.3, 0.8], [0, 0.7, 1]]) { const back = over(c, a), front = over(c, a); assert.equal(front(back(d)), back(front(d)), 'one colour: either order'); }
  assert.notEqual(over(0.9, 0.95)(over(0.1, 0.95)(0.5)), over(0.1, 0.95)(over(0.9, 0.95)(0.5)), '(two colours would not be: a lit or textured closed shape keeps the two passes)');
  const signs = method(F, '_buildSigns');
  assert.match(signs, /const ringM = new THREE\.MeshBasicMaterial\(\{[^}]*side: THREE\.DoubleSide, forceSinglePass: true \}\);/);
  assert.match(signs, /boardG = new THREE\.PlaneGeometry\(/); assert.match(signs, /const boardM = new THREE\.MeshBasicMaterial\(\{[^}]*side: THREE\.DoubleSide, forceSinglePass: true \}\);/);
  assert.match(src('src/learn/forms/race.js'), /const ring = new THREE\.Mesh\(this\._geos\[0\], new THREE\.MeshBasicMaterial\(\{[^}]*side: THREE\.DoubleSide, forceSinglePass: true \}\)\);/);
  assert.match(body, /this\._geos = \[ringG, lockG, beamG\];/, 'the race\'s _geos[0] is the flat ring');
  const P = src('src/learn/play/targets.js');
  assert.match(P, /this\.plateGeo = new THREE\.PlaneGeometry\(1, 1\);/);
  assert.match(P, /\nfunction plateMaterial\(\) \{\n  const mat = new THREE\.MeshBasicMaterial\(\{[^}]*side: THREE\.DoubleSide, forceSinglePass: true \}\);/);
});

test('the ladder\'s frame target never follows the slow frames: a 60 Hz phone that draws every frame a vsync late (a steady 30) pulls _trackVsync\'s estimate down to 30 Hz — the ladder still reads those frames as late, steps down within 0.55 s and never climbs back on them; a cap of her own (30) is the target', async () => {
  const M = src('src/main.js');
  const RATES = JSON.parse(/\nconst REFRESH_RATES = (\[[^\]]*\]);/.exec(M)[1]);
  const track = new Function('REFRESH_RATES', 'ts', method(M, '_trackVsync'));
  const liveFrame = new Function('document', 'iv', method(M, '_liveFrame')), apply = new Function(method(M, '_liveApply')), target = new Function(method(M, '_frameTarget'));
  // _loop's pacing, as it reads (the vsync estimate first, the cap's skip, the interval since the last drawn frame)
  assert.match(method(M, '_loop'), /this\._trackVsync\(ts\);\n\s+const cap = this\.settings\.fpsCap \|\| this\._autoCap \|\| 0;[^\n]*\n\s+if \(cap && ts !== undefined && this\._lastTs !== undefined && ts - this\._lastTs < 1000 \/ cap - 2\) return;\n\s+const iv = ts !== undefined && this\._lastTs !== undefined \? ts - this\._lastTs : 0;/);
  assert.match(method(M, '_loop'), /this\._frame\(dt\);\n\s+if \(this\.live\) this\._liveFrame\(iv\);/);
  const run = (secs, vsyncMs, every, fpsCap = 0, start = 4) => {
    const self = { settings: { fpsCap }, _hz120: false, _ftMs: 9, R: { setRung() {} } };
    self.live = new LiveGov({ start, ceil: 4 }); self._autoCap = self.live.cap; self._liveApply = () => apply.call(self); self._frameTarget = () => target.call(self);
    const doc = { hidden: false }, moves = [];
    let ts = 0, last;
    for (let i = 0; ts < secs * 1000; i++) {
      ts += vsyncMs * every;   // (the browser's rAF: the vsync after each frame's work is done)
      track.call(self, RATES, ts);
      const cap = self.settings.fpsCap || self._autoCap || 0;
      if (cap && last !== undefined && ts - last < 1000 / cap - 2) continue;
      const iv = last !== undefined ? ts - last : 0; last = ts;
      const r = self.live.rung;
      liveFrame.call(self, doc, iv);
      if (self.live.rung !== r) moves.push([+(ts / 1000).toFixed(2), self.live.rung]);
    }
    return { self, moves };
  };
  // a 60 Hz screen, every frame two vsyncs: 33.3 ms
  let { self, moves } = run(40, 1000 / 60, 2);
  assert.ok(self._vs.ms > 30, `the rAF estimate went to 30 Hz (${self._vs.ms.toFixed(1)} ms)`);
  assert.ok(moves[0][0] <= 0.55 && moves[0][1] === 3, JSON.stringify(moves));
  assert.deepEqual(moves.map((m) => m[1]), [3, 2, 1, 0], 'down to the floor, and no climb on 33 ms frames: ' + JSON.stringify(moves));
  // the same screen keeping up (16.7 ms): clean, nothing moves; at a cap of her own (settings.fpsCap 30) 33.3 ms is on time
  ({ moves } = run(20, 1000 / 60, 1)); assert.deepEqual(moves, []);
  ({ moves } = run(20, 1000 / 60, 2, 30)); assert.deepEqual(moves, []);
});

test('the warm-up frames draw with every pass the step has — at boot and behind a level\'s black — then go back to the rung\'s own: a rung that turns the AO (its normal pass draws the stage\'s own kinds of mesh) or the bloom on later builds nothing mid-level', async () => {
  const { RENDER_RUNGS } = await import('../../src/config.js');
  const R = src('src/core/renderer.js'), M = src('src/main.js');
  const warm = new Function('on', method(R, 'warmPasses')), passes = new Function('RENDER_RUNGS', method(R, '_rungPasses'));
  const mk = (rung, bloomSetting = true, ao = true) => {
    const self = { rung, q: { rungs: [2, 5], bloom: true }, settings: { bloom: bloomSetting }, bloom: { enabled: false }, gtao: ao ? { enabled: false } : null };
    self._rungPasses = () => passes.call(self, RENDER_RUNGS);
    self._rungPasses();
    return self;
  };
  let r = mk(2);
  assert.deepEqual([r.bloom.enabled, r.gtao.enabled], [true, false], 'rung 2: the bloom, no AO');
  warm.call(r, true); assert.deepEqual([r.bloom.enabled, r.gtao.enabled], [true, true], 'warming: both');
  warm.call(r, false); assert.deepEqual([r.bloom.enabled, r.gtao.enabled], [true, false], 'then the rung\'s own again');
  r = mk(0); warm.call(r, true); assert.deepEqual([r.bloom.enabled, r.gtao.enabled], [true, true]); warm.call(r, false); assert.deepEqual([r.bloom.enabled, r.gtao.enabled], [false, false], 'rung 0: neither');
  r = mk(2, false); warm.call(r, true); assert.equal(r.bloom.enabled, false, 'her bloom setting off: never drawn, so never warmed');
  r = mk(2, true, false); warm.call(r, true); assert.equal(r.gtao, null, 'a step without the AO has no pass to warm');
  r = mk(null); r.bloom.enabled = false; warm.call(r, true); assert.equal(r.bloom.enabled, false, 'no ladder (a tier of her own, a desktop): untouched');
  // the boot's three warm frames and the level's one, each between warmPasses(true) and warmPasses(false)
  assert.match(M, /this\.R\.warmPasses\(true\);[^\n]*\n\s+for \(let i = 0; i < 3; i\+\+\) \{ this\._frame\(1 \/ 60\);[^\n]*\n\s+this\.R\.warmPasses\(false\);/);
  const W = M.slice(M.indexOf('  async _warmStage() {'), M.indexOf('\n  }\n', M.indexOf('  async _warmStage() {')));
  assert.match(W, /await this\._warmPaint\(\{ pause: nextFrame \}\);[^\n]*\n(\s+\/\/[^\n]*\n)*\s+this\.R\.warmPasses\(true\);\n\s+try \{ this\._frame\(1 \/ 60\); \} finally \{ this\.R\.warmPasses\(false\); \}/);
});
