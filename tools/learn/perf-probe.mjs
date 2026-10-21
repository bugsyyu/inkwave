// 手机上很卡（LEARN §50）的量具: one way of playing as her phone runs it — the --native device of parity-shots (her App's
// made-up window.__IELTS_NATIVE + &applegpu: the render step that device gets), a 393 × 852 screen at --dpr 3, the main
// thread slowed --throttle × by CDP — and the numbers that do not depend on this machine's GPU (SwiftShader: only compare
// two runs of this tool on the same box, in the same sitting):
//   passes   every renderer.render of a stepped frame, by pass (阴影 · 主通道 · AO 法线 · 辉光每一级 · 后期每一趟 · 墨图集 …):
//            draw calls, triangles and the pixels it covers (its target's w × h) — the GPU's load as counts
//   objects  the main pass's triangles by what they belong to (meshes in the camera's frustum, instances counted)
//   js       main.js _frame (sim + draw submission + HUD tail) over --frames stepped frames (the clock frozen and stepped at
//            60 Hz, as the audits do: no frame is dropped, so every one is timed): p50 / p95 / max, with R.render and the HUD apart
//   gc       bytes allocated per stepped frame (HeapProfiler sampling, collected objects included) and where; the heap's growth
//   dom      style recalcs / layouts per stepped frame and per real second (CDP Performance.getMetrics), running CSS
//            animations, visible elements with a backdrop-filter, composited layers (CDP LayerTree)
//   cpu      the functions with the most self time over the stepped frames (CDP Profiler)
//   long     long tasks (≥ 50 ms, PerformanceObserver) — over the real seconds, and for --scene boot the whole load
//   gpu      programs, textures, geometries; the render targets' and the shadow map's bytes
//   node tools/learn/perf-probe.mjs --scene puzzle|runner|duel|review|menu|boot [--native iphone16|iphone15|iphone12|none]
//        [--dpr 3] [--size 393x852] [--throttle 4] [--frames 16] [--real 8] [--jit 600] [--step N] [--query '&x=1'] [--json <file>]
// Scenes: puzzle = w2d3 解密闯关 on Terrace Heights at dusk (where she got stuck), the auto-walk on; runner = w1d3 墨浪跑酷;
// duel = w1d6 对抗赛 (her stick held forward); review = w1d7 复习日 (its planned form); menu = her App's way in to the main
// menu (title → a tap → main); boot = her App's load to the title screen (throttled from the first byte).
// --step N writes a stored render step for the device before the page loads (src/core/render-gov.js), to measure another
// step; --query adds to the URL (e.g. '&rung=4'). Before the stepped frames, --jit sim-only frames warm the JIT (the numbers
// are the steady state's). No screenshots; no account (nothing of hers is read or written).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');   // (NODE_PATH, as the audits)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const SCENE = opt('scene', 'puzzle'), DPR = +opt('dpr', 3), THROTTLE = +opt('throttle', 4), FRAMES = +opt('frames', 16), REAL = +opt('real', 8);
const [VW, VH] = opt('size', '393x852').split('x').map(Number);
const STEP = opt('step', null), EXTRA = opt('query', ''), JIT = +opt('jit', 600);
// (the same made-up native pages as parity-shots / hitch-probe: display / device, no message handlers)
const NATIVE = {
  iphone16: { platform: 'ios', display: { maxFps: 120, highRefresh: true }, device: { model: 'iPhone16,1', memGB: 8, cores: 6 } },
  iphone15: { platform: 'ios', display: { maxFps: 60, highRefresh: false }, device: { model: 'iPhone15,4', memGB: 6, cores: 6 } },
  iphone12: { platform: 'ios', display: { maxFps: 60, highRefresh: false }, device: { model: 'iPhone13,2', memGB: 4, cores: 6 } },
};
const NAT = NATIVE[opt('native', 'iphone16')] || null;
const LEVEL = { puzzle: '?learn=w2d3&kind=puzzle', runner: '?learn=w1d3&kind=race', duel: '?learn=w1d6&kind=duel', review: '?learn=w1d7' }[SCENE];
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', woff2: 'font/woff2', ogg: 'audio/ogg', mp3: 'audio/mpeg', glb: 'model/gltf-binary', bin: 'application/octet-stream', ktx2: 'image/ktx2', wasm: 'application/wasm' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if (!u.startsWith('/game/')) { r.writeHead(404); return r.end(); }   // (../index.html = the lesson page: the watchdog's way back)
  const p = path.join(ROOT, u.slice('/game'.length));
  if (u === '/game/songs/manifest.json' && !fs.existsSync(p)) { r.writeHead(200, { 'content-type': MIME.json }); return r.end('{ "tracks": {} }'); }
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(p).slice(1)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(p).pipe(r);
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${srv.address().port}/game/`;
const T0 = Date.now(), say = (...a) => console.log(`[perf-probe ${SCENE} ${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}]`, ...a);

// in the page, before anything runs: the native page, a stored step (--step), long tasks, boot beats
function instrument([nat, step]) {
  if (nat) window.__IELTS_NATIVE = nat;
  if (step != null && nat) try { localStorage.setItem('inkwave:render:v1', JSON.stringify({ v: 1, model: nat.device.model, step: +step, good: 0, bad: 0, at: 0 })); } catch (e) { /* none */ }
  const P = (window.__pp = { lt: [], beats: [], on: false });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) P.lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch (e) { P.noLT = String(e); }
  let beatFn;
  Object.defineProperty(window, '__gfBeat', { configurable: true, get: () => beatFn, set: (f) => { beatFn = function () { P.beats.push(performance.now()); return f.apply(this, arguments); }; } });
}

// in the page, once the game is up: the per-pass hooks (renderer.render / shadowMap.render) and the frame timers
function hook() {
  const I = window.__inkwave, G = window.__G, r = G.renderer, P = window.__pp;
  if (P.hooked) return;
  P.hooked = true;
  const info = r.info.render;
  const label = (scene, cam) => {
    if (scene.isScene) {
      if (scene.overrideMaterial) return 'scene:override:' + (scene.overrideMaterial.name || scene.overrideMaterial.type);
      if (scene === G.scene) return 'scene:main';
      if (G.paint && scene === G.paint.scene) return 'scene:paint';
      return 'scene:' + (scene.name || 'other');
    }
    const m = scene.material, u = (m && m.uniforms) || {};
    if (u.luminosityThreshold) return 'bloom:bright';
    if (u.direction && u.colorTexture) return 'bloom:blur';
    if (u.bloomStrength) return 'bloom:composite';
    if (I.R.bloom && m === I.R.bloom.blendMaterial) return 'bloom:blend';
    if (u.uSat && u.uVignette) return 'post:grade';
    const n = (m && m.name) || '';
    if (n) return 'post:' + n;
    return 'quad:' + Object.keys(u).slice(0, 3).join('+');
  };
  const v4 = { x: 0, y: 0, z: 0, w: 0, set(a, b, c, d) { this.x = a; this.y = b; this.z = c; this.w = d; return this; }, copy(o) { this.x = o.x; this.y = o.y; this.z = o.z; this.w = o.w; return this; } };
  const target = () => {
    const t = r.getRenderTarget();
    if (t) return [t.width, t.height, t.texture && t.texture.type === 1016 ? 8 : 4];
    r.getViewport(v4); const pr = r.getPixelRatio();
    return [Math.round(v4.z * pr), Math.round(v4.w * pr), 4];
  };
  const add = (k, calls, tris, px, bpp) => {
    if (!P.on) return;
    const e = P.passes[k] || (P.passes[k] = { renders: 0, calls: 0, tris: 0, px: 0, bytes: 0 });
    e.renders++; e.calls += calls; e.tris += tris; e.px += px; e.bytes += px * bpp;
  };
  const render = r.render.bind(r);
  r.render = (scene, cam) => {
    const c0 = info.calls, t0 = info.triangles, s0 = P.shadowCalls, st0 = P.shadowTris;
    const [w, h, bpp] = target();
    const was = P.pass; P.pass = label(scene, cam);
    const out = render(scene, cam);
    add(P.pass, info.calls - c0 - (P.shadowCalls - s0), info.triangles - t0 - (P.shadowTris - st0), w * h, bpp);
    P.pass = was;
    return out;
  };
  // program look-ups (three's getProgram → getParameters → material.customProgramCacheKey(): a draw whose material last drew
  // another kind of object — instanced / skinned / plain —, other lights, another target … pays a whole parameter build):
  // counted by pass · material · object kind
  P.thrash = {};
  const rbd = r.renderBufferDirect;
  r.renderBufferDirect = function (camera, scene, geometry, material, object) { P.obj = object; return rbd.apply(this, arguments); };
  const kind = (o) => (o ? (o.isInstancedMesh ? 'inst' : o.isSkinnedMesh ? 'skin' : o.isBatchedMesh ? 'batch' : o.isMesh ? 'mesh' : o.type) : '?');
  const count = (m) => { if (!P.on) return; const k = (P.pass || '?') + ' · ' + (m.name || m.type) + ' · ' + kind(P.obj); P.thrash[k] = (P.thrash[k] || 0) + 1; };
  const wrapKey = (o, f) => function () { count(this); return f.call(this); };
  const proto = Object.getPrototypeOf(Object.getPrototypeOf(G.scene.children.find((c) => c.material)?.material || {})) || null;
  let M0 = proto; while (M0 && !Object.prototype.hasOwnProperty.call(M0, 'customProgramCacheKey')) M0 = Object.getPrototypeOf(M0);
  if (M0) M0.customProgramCacheKey = wrapKey(M0, M0.customProgramCacheKey);
  G.scene.traverse((o) => { for (const m of [].concat(o.material || [])) if (m && Object.prototype.hasOwnProperty.call(m, 'customProgramCacheKey')) m.customProgramCacheKey = wrapKey(m, m.customProgramCacheKey); });
  P.shadowCalls = 0; P.shadowTris = 0;
  const sm = r.shadowMap, smr = sm.render.bind(sm);
  sm.render = (lights, scene, cam) => {
    const need = sm.enabled && (sm.autoUpdate || sm.needsUpdate);
    const c0 = info.calls, t0 = info.triangles;
    const out = smr(lights, scene, cam);
    const dc = info.calls - c0, dt = info.triangles - t0;
    P.shadowCalls += dc; P.shadowTris += dt;
    if (need && dc) { let px = 0; for (const l of lights) if (l.castShadow && l.shadow) px += l.shadow.mapSize.x * l.shadow.mapSize.y; add('shadow:' + (scene === G.scene ? 'main' : scene.name || 'other'), dc, dt, px, 4); }
    return out;
  };
  // frame timers: _frame, R.render (the composer: every pass's submission), _updateHud (the HUD + minimap)
  const t = (o, k, slot) => { const f = o[k].bind(o); o[k] = function () { const a = performance.now(); const v = f.apply(this, arguments); if (P.on) P.cur[slot] += performance.now() - a; return v; }; };
  P.cur = { frame: 0, render: 0, hud: 0 };
  t(I.R, 'render', 'render');
  if (I._updateHud) t(I, '_updateHud', 'hud');
  const frame = I._frame.bind(I);
  I._frame = (dt) => {
    P.cur.frame = 0; P.cur.render = 0; P.cur.hud = 0;
    const a = performance.now(); frame(dt); const ms = performance.now() - a;
    if (P.on) { P.frames.push([ms, P.cur.render, P.cur.hud, info.calls, info.triangles]); }
  };
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
await ctx.addInitScript(instrument, [NAT, STEP]);
const page = await ctx.newPage(), errs = [];
page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 300)); });
const cdp = await ctx.newCDPSession(page);
const ev = (fn, a) => page.evaluate(fn, a);
const watchdog = setTimeout(() => { say('WATCHDOG'); finish(2, null); }, +opt('budget', 3000) * 1000);
async function finish(code, rep) { clearTimeout(watchdog); if (opt('json') && rep) fs.writeFileSync(opt('json'), JSON.stringify(rep, null, 1)); try { await browser.close(); } catch (e) { /* gone */ } srv.close(); process.exit(code); }
process.on('unhandledRejection', (e) => { say('ERR', String(e && e.stack || e).slice(0, 800)); finish(1, null); });

await cdp.send('Performance.enable');
const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((m) => [m.name, m.value]));
const rep = { scene: SCENE, native: opt('native', 'iphone16'), dpr: DPR, size: [VW, VH], throttle: THROTTLE, stepAsked: STEP, query: EXTRA, errors: errs };
if (SCENE === 'boot') await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
const app = SCENE === 'menu' || SCENE === 'boot';
const url = base + 'index.html' + (app ? '?from=app&today=w2d3' : LEVEL + '&from=app&nofullscreen&noclips') + (NAT ? '&applegpu' : '') + EXTRA;
say('open', url.slice(base.length));
await page.goto(url, { waitUntil: 'load', timeout: 300000 });
const waitFor = (fn, a, secs, why) => page.waitForFunction(fn, a, { timeout: secs * 1000, polling: 500 }).catch(() => { throw new Error(why); });
await waitFor(() => window.__inkwave && __inkwave.menus && window.__G && __G.renderer, null, 900, 'the game never came up');
if (app) {
  await waitFor(() => __inkwave.menus.current === 'title', null, 900, 'never reached the title screen');
  const P = await ev(() => ({ at: performance.now(), lt: __pp.lt, beats: __pp.beats }));
  let gap = 0; for (let i = 1; i < P.beats.length; i++) gap = Math.max(gap, P.beats[i] - P.beats[i - 1]);
  rep.boot = { titleAtMs: Math.round(P.at), longTasks: P.lt.length, longMs: Math.round(P.lt.reduce((s, l) => s + l[1], 0)), longMax: Math.round(Math.max(0, ...P.lt.map((l) => l[1]))), beatGapMs: Math.round(gap) };
  say('title', JSON.stringify(rep.boot));
  if (SCENE === 'boot') { rep.profile = await ev(() => ({ q: __inkwave.R.q, pr: __G.renderer.getPixelRatio(), buf: [__G.renderer.domElement.width, __G.renderer.domElement.height] })); await finish(errs.length ? 1 : 0, rep); }
  await page.waitForTimeout(1500);
  await page.touchscreen.tap(VW / 2, VH * 0.7);
  await waitFor(() => __inkwave.menus.current === 'main', null, 600, 'never reached the main menu');
  await page.waitForTimeout(3000);
} else {
  await waitFor(() => __inkwave.match && __inkwave.match.mode === 'learn' && __inkwave.match.learn && __inkwave.match.state === 'playing' && !__inkwave._warming, null, 1200, 'the level never went live');
  // the runner's reading board 「出发」 / the duel's 备战 board 「开始」 (as perf-forms)
  for (let i = 0; i < 20; i++) { const ok = await ev(() => { const b = document.querySelector('.iw-ps:not(.is-off) .iw-ps__act.is-primary'); if (b) { b.click(); return true; } return false; }); if (ok) break; await page.waitForTimeout(500); }
  if (SCENE === 'puzzle') await ev(() => { const F = __inkwave.match.learn; if (F.autoWalk) F.autoWalk(true); });
}
rep.profile = await ev(() => ({ q: __inkwave.R.q, pr: +__G.renderer.getPixelRatio().toFixed(3), buf: [__G.renderer.domElement.width, __G.renderer.domElement.height], step: __inkwave.R.q.step ?? null, shadows: __G.renderer.shadowMap.enabled, glass: document.documentElement.className }));
say('profile', JSON.stringify(rep.profile));
await ev(hook);

// ---- the real seconds: frames as they come (rAF), style / layout per second, long tasks, the heap
await cdp.send('Emulation.setCPUThrottlingRate', { rate: THROTTLE });
const duel = SCENE === 'duel';
if (duel) await ev(() => { window.__duel = true; __inkwave.debug.key('KeyW', true); });
{
  const m0 = await metrics(), t0 = await ev(() => performance.now());
  await page.waitForTimeout(REAL * 1000);
  const m1 = await metrics(), P = await ev((a) => ({ t: performance.now(), lt: __pp.lt.filter((l) => l[0] >= a) }), t0);
  const secs = (P.t - t0) / 1000, per = (k) => +((m1[k] - m0[k]) / secs).toFixed(2);
  rep.real = { secs: +secs.toFixed(1), recalcPerSec: per('RecalcStyleCount'), layoutPerSec: per('LayoutCount'), recalcMsPerSec: +(per('RecalcStyleDuration') * 1000).toFixed(1), layoutMsPerSec: +(per('LayoutDuration') * 1000).toFixed(1),
    scriptMsPerSec: +(per('ScriptDuration') * 1000).toFixed(1), heapGrowKBPerSec: +((m1.JSHeapUsedSize - m0.JSHeapUsedSize) / 1024 / secs).toFixed(1), heapMB: +(m1.JSHeapUsedSize / 1048576).toFixed(1),
    longTasks: P.lt.length, longMs: Math.round(P.lt.reduce((s, l) => s + l[1], 0)), longMax: Math.round(Math.max(0, ...P.lt.map((l) => l[1]))) };
  say('real', JSON.stringify(rep.real));
}

// ---- the stepped frames: the clock frozen and stepped at 60 Hz, every frame timed and its passes counted
await ev(() => { __inkwave.debug.freeze(); });
for (let i = 0; i < 2; i++) await ev(() => __inkwave.debug.step(16.7));   // (a frame or two for whatever the thaw left)
// the JIT warmed first: --jit sim-only frames (debug.step draws only its last one), so what is measured is the steady state
// (in a few interpreted frames every double is a fresh heap number — allocation that a phone a minute into a level does not have)
if (JIT > 0) { await ev((n) => __inkwave.debug.step(16.7 * n), JIT); await ev(() => __inkwave.debug.step(16.7)); }
await cdp.send('HeapProfiler.enable');
await cdp.send('Profiler.enable');
await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
await cdp.send('HeapProfiler.startSampling', { samplingInterval: 8192, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true });
await cdp.send('Profiler.start');
const m0 = await metrics();
await ev(() => {
  const P = __pp; P.on = true; P.frames = []; P.passes = {}; P.mut = {};
  // what the DOM had written into it, frame by frame (a recalc / a layout needs a write): node · what changed
  const name = (n) => { const e = n.nodeType === 1 ? n : n.parentElement; if (!e) return '?'; const c = typeof e.className === 'string' ? e.className.split(' ')[0] : e.tagName; return c || e.tagName; };
  P.mo = new MutationObserver(() => {});
  P.mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
  P.take = () => { for (const r of P.mo.takeRecords()) { const k = name(r.target) + ' · ' + (r.type === 'attributes' ? '@' + r.attributeName : r.type); P.mut[k] = (P.mut[k] || 0) + 1; } };
});
for (let i = 0; i < FRAMES; i++) {
  await ev((i) => { if (i % 30 === 0 && __inkwave.rig && window.__duel) __inkwave.rig.yaw += 0.9; __pp.take(); __inkwave.debug.step(16.7); }, i);
}
await ev(() => { __pp.take(); __pp.mo.disconnect(); __pp.on = false; });
const m1 = await metrics();
const cpu = (await cdp.send('Profiler.stop')).profile;
const heap = (await cdp.send('HeapProfiler.stopSampling')).profile;
const S = await ev(() => ({ frames: __pp.frames, passes: __pp.passes }));
const n = S.frames.length;
const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))].toFixed(2) : null; };
const st = (a) => ({ p50: q(a, 0.5), p95: q(a, 0.95), max: a.length ? +Math.max(...a).toFixed(2) : null });
rep.js = { frames: n, frame: st(S.frames.map((f) => f[0])), render: st(S.frames.map((f) => f[1])), hud: st(S.frames.map((f) => f[2])), sim: st(S.frames.map((f) => f[0] - f[1] - f[2])) };
const passes = Object.entries(S.passes).map(([k, e]) => ({ pass: k, renders: +(e.renders / n).toFixed(2), calls: Math.round(e.calls / n), tris: Math.round(e.tris / n), px: Math.round(e.px / n), mb: +(e.bytes / n / 1048576).toFixed(2) })).sort((a, b) => b.px - a.px);
rep.passes = passes;
const tot = passes.reduce((s, p) => ({ calls: s.calls + p.calls, tris: s.tris + p.tris, px: s.px + p.px, mb: s.mb + p.mb }), { calls: 0, tris: 0, px: 0, mb: 0 });
rep.perFrame = { calls: tot.calls, tris: tot.tris, mpx: +(tot.px / 1e6).toFixed(2), mbWritten: +tot.mb.toFixed(1), screenMpx: +((VW * VH * DPR * DPR) / 1e6).toFixed(2) };
rep.domPerFrame = { recalc: +((m1.RecalcStyleCount - m0.RecalcStyleCount) / n).toFixed(2), layout: +((m1.LayoutCount - m0.LayoutCount) / n).toFixed(2) };
rep.writesPerFrame = Object.entries(await ev(() => __pp.mut)).map(([k, v]) => [k, +(v / n).toFixed(2)]).sort((a, b) => b[1] - a[1]).slice(0, 16);
rep.programLookups = Object.entries(await ev(() => __pp.thrash)).map(([k, v]) => [k, +(v / n).toFixed(1)]).sort((a, b) => b[1] - a[1]);
rep.programLookupsPerFrame = +rep.programLookups.reduce((a, x) => a + x[1], 0).toFixed(1);
rep.programLookups = rep.programLookups.slice(0, 16);
// allocation and cpu are split by whether main.js _frame is on the stack: a stepped frame takes seconds of SwiftShader wall
// time, and what timers run meanwhile (the music scheduler's worker ticks) is per second, not per frame
const wall = Math.max(0.001, (m1.Timestamp - m0.Timestamp));
const keyOf = (cf) => `${cf.functionName || '(anon)'} ${String(cf.url).replace(/^.*\/game\//, '')}:${cf.lineNumber + 1}`;
{
  const inF = new Map(), outF = new Map(); let fT = 0, oT = 0;
  const walk = (nd, under) => { const u = under || nd.callFrame.functionName === '_frame'; if (nd.selfSize) { const k = keyOf(nd.callFrame), M = u ? inF : outF; M.set(k, (M.get(k) || 0) + nd.selfSize); if (u) fT += nd.selfSize; else oT += nd.selfSize; } for (const c of nd.children || []) walk(c, u); };
  walk(heap.head, false);
  const top = (M, d) => [...M.entries()].sort((a, b) => b[1] - a[1]).slice(0, 14).map(([k, v]) => [k, +(v / 1024 / d).toFixed(1)]);
  rep.gc = { kbPerFrame: +(fT / 1024 / n).toFixed(1), top: top(inF, n), otherKbPerSec: +(oT / 1024 / wall).toFixed(1), otherTop: top(outF, wall).slice(0, 8), heapGrowKB: +((m1.JSHeapUsedSize - m0.JSHeapUsedSize) / 1024).toFixed(1) };
}
{
  const byId = new Map(cpu.nodes.map((nd) => [nd.id, nd])), par = new Map();
  for (const nd of cpu.nodes) for (const c of nd.children || []) par.set(c, nd.id);
  const under = new Map(), isUnder = (id) => { if (under.has(id)) return under.get(id); const nd = byId.get(id); const u = nd.callFrame.functionName === '_frame' || (par.has(id) && isUnder(par.get(id))); under.set(id, u); return u; };
  const inF = new Map(), outF = new Map(); let gc = 0, fMs = 0;
  const dts = cpu.timeDeltas || [];
  cpu.samples.forEach((id, i) => { const nd = byId.get(id), k = keyOf(nd.callFrame), ms = (dts[i] || 0) / 1000; if (/^\(garbage collector\)/.test(k)) { gc += ms; return; } if (/^\((idle|program|root)\)/.test(k)) return; const M = isUnder(id) ? inF : outF; M.set(k, (M.get(k) || 0) + ms); if (M === inF) fMs += ms; });
  rep.cpu = { frameMs: +(fMs / n).toFixed(2), gcMsPerSec: +(gc / wall).toFixed(2), top: [...inF.entries()].sort((a, b) => b[1] - a[1]).slice(0, 18).map(([k, v]) => [k, +(v / n).toFixed(2)]),
    otherMsPerSec: +([...outF.values()].reduce((a, b) => a + b, 0) / wall).toFixed(2), otherTop: [...outF.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([k, v]) => [k, +(v / wall).toFixed(2)]) };
}
// the main pass's triangles by owner (meshes in the camera's frustum; instances counted), and the GPU's memory
rep.objects = await ev(async () => {
  const THREE = await import('three');
  const G = __G, cam = G.camera, fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse));
  const by = new Map(); let total = 0, meshes = 0;
  const seen = (o) => { for (let p = o; p; p = p.parent) if (!p.visible) return false; return true; };
  const owner = (o) => { for (let p = o; p; p = p.parent) if (p.name && p !== G.scene) return p.name; return (o.material && (o.material.name || o.material.type)) || o.type; };
  G.scene.traverse((o) => {
    if (!(o.isMesh || o.isInstancedMesh || o.isSkinnedMesh) || !o.geometry || !seen(o)) return;
    if (o.frustumCulled !== false) { if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere(); if (!fr.intersectsObject(o)) return; }
    const g = o.geometry, idx = g.index ? g.index.count : g.attributes.position ? g.attributes.position.count : 0;
    const range = Math.min(idx, g.drawRange.count === Infinity ? idx : g.drawRange.count);
    const k = o.isInstancedMesh ? o.count : 1, tris = Math.round(range / 3) * k;
    meshes++; total += tris;
    const key = owner(o) + ' · ' + ((Array.isArray(o.material) ? o.material[0] : o.material)?.name || '');
    const e = by.get(key) || [0, 0]; e[0] += tris; e[1]++; by.set(key, e);
  });
  return { meshes, tris: total, top: [...by.entries()].sort((a, b) => b[1][0] - a[1][0]).slice(0, 16).map(([k, v]) => [k, v[0], v[1]]) };
}).catch((e) => ({ error: e.message }));
rep.gpu = await ev(() => {
  const G = __G, r = G.renderer, R = __inkwave.R, c = R.composer, mb = (w, h, b) => (w * h * b) / 1048576;
  let rt = 0; const add = (t, b) => { if (t && t.width) rt += mb(t.width, t.height, b || (t.texture && t.texture.type === 1016 ? 8 : 4)) * (t.depthBuffer ? 1.5 : 1); };
  if (c) { add(c.renderTarget1); add(c.renderTarget2); for (const p of c.passes) for (const k of Object.keys(p)) { const v = p[k]; if (v && v.isWebGLRenderTarget) add(v); if (Array.isArray(v)) for (const x of v) if (x && x.isWebGLRenderTarget) add(x); } }
  let sh = 0; G.scene.traverse((o) => { if (o.isLight && o.castShadow && o.shadow && o.shadow.map) sh += mb(o.shadow.mapSize.x, o.shadow.mapSize.y, 4); });
  const pa = G.paint && G.paint.size ? mb(G.paint.size, G.paint.size, 4) * (G.paint.rtB ? 2 : 1) : 0;
  return { programs: r.info.programs.length, textures: r.info.memory.textures, geometries: r.info.memory.geometries, targetsMB: +rt.toFixed(1), shadowMB: +sh.toFixed(1), paintAtlas: G.paint ? G.paint.size : null, paintMB: +pa.toFixed(1) };
});
// the DOM as it stands: running CSS animations, visible elements with a backdrop-filter (pseudo-elements too), layers
rep.dom = await ev(() => {
  const vis = (el) => { if (!el.getClientRects().length) return false; for (let e = el; e && e.nodeType === 1; e = e.parentElement) { const cs = getComputedStyle(e); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false; } return true; };
  const bf = [];
  for (const el of document.querySelectorAll('body *')) {
    for (const ps of [null, '::before', '::after']) {
      const cs = getComputedStyle(el, ps), v = cs.backdropFilter && cs.backdropFilter !== 'none' ? cs.backdropFilter : cs.webkitBackdropFilter && cs.webkitBackdropFilter !== 'none' ? cs.webkitBackdropFilter : null;
      if (v && (ps ? cs.content !== 'none' : true) && vis(el)) bf.push((el.className && el.className.baseVal === undefined ? String(el.className).split(' ')[0] : el.tagName) + (ps || '') + ' ' + v);
    }
  }
  const an = document.getAnimations().filter((a) => a.playState === 'running');
  const names = {}; for (const a of an) { const t = a.effect && a.effect.target, el = t && (t.nodeType === 1 ? t : t.element); const k = (a.animationName || a.transitionProperty || '?') + (el && !vis(el) ? ' (hidden)' : ''); names[k] = (names[k] || 0) + 1; }
  return { backdrop: bf.length, backdropList: bf.slice(0, 12), animations: an.length, animationNames: names, elements: document.querySelectorAll('*').length };
});
try {
  await cdp.send('LayerTree.enable');
  const lt = await new Promise((ok) => { const tm = setTimeout(() => ok(null), 15000); cdp.on('LayerTree.layerTreeDidChange', (e) => { if (e.layers) { clearTimeout(tm); ok(e.layers); } }); ev(() => __inkwave.debug.step(16.7)); });
  rep.dom.layers = lt ? lt.length : null;
  rep.dom.layersDrawn = lt ? lt.filter((l) => l.drawsContent).length : null;
} catch (e) { rep.dom.layers = 'n/a: ' + e.message; }
// a trace of a few more stepped frames: every style recalc / layout, and the JS stack of the ones a script forced in mid-frame
{
  const chunks = [];
  cdp.on('Tracing.dataCollected', (e) => chunks.push(...e.value));
  const done = new Promise((ok) => cdp.once('Tracing.tracingComplete', ok));
  await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline.stack', transferMode: 'ReportEvents' });
  const TF = 4;
  for (let i = 0; i < TF; i++) await ev(() => __inkwave.debug.step(16.7));
  await cdp.send('Tracing.end'); await done;
  const ev2 = chunks.filter((e) => e.name === 'Layout' || e.name === 'UpdateLayoutTree');
  const forced = {}; let lay = 0, sty = 0, layMs = 0, styMs = 0, nf = 0;
  for (const e of ev2) {
    const ms = (e.dur || 0) / 1000;
    if (e.name === 'Layout') { lay++; layMs += ms; } else { sty++; styMs += ms; }
    const st = (e.args && (e.args.beginData && e.args.beginData.stackTrace)) || (e.args && e.args.data && e.args.data.stackTrace);
    if (st && st.length) { nf++; const k = e.name + ' ← ' + st.slice(0, 3).map((f) => `${f.functionName || '(anon)'} ${String(f.url).replace(/^.*\/game\//, '')}:${f.lineNumber + 1}`).join(' ← '); forced[k] = (forced[k] || 0) + 1; }
  }
  rep.trace = { frames: TF, layoutsPerFrame: +(lay / TF).toFixed(2), layoutMsPerFrame: +(layMs / TF).toFixed(2), recalcsPerFrame: +(sty / TF).toFixed(2), recalcMsPerFrame: +(styMs / TF).toFixed(2),
    forcedPerFrame: +(nf / TF).toFixed(2), forced: Object.entries(forced).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => [k, +(v / TF).toFixed(2)]) };
}
if (duel) await ev(() => __inkwave.debug.key('KeyW', false));
say('js', JSON.stringify(rep.js));
say('trace', JSON.stringify(rep.trace));
say('per frame', JSON.stringify(rep.perFrame), 'dom/frame', JSON.stringify(rep.domPerFrame));
say('DOM writes / frame', JSON.stringify(rep.writesPerFrame));
say('program look-ups / frame', rep.programLookupsPerFrame, JSON.stringify(rep.programLookups));
for (const p of passes) say(`  ${p.pass.padEnd(34)} ×${String(p.renders).padEnd(5)} calls ${String(p.calls).padStart(4)} · tris ${String(p.tris).padStart(8)} · px ${String(p.px).padStart(9)} · ${p.mb} MB`);
say('objects', JSON.stringify(rep.objects));
say('gc', JSON.stringify(rep.gc));
say('cpu', JSON.stringify(rep.cpu));
say('gpu', JSON.stringify(rep.gpu));
say('dom', JSON.stringify(rep.dom));
if (errs.length) say('errors', errs.slice(0, 5).join(' | '));
await finish(errs.length ? 1 : 0, rep);
