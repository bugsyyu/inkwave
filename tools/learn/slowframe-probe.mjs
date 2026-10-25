// 慢帧的量具（LEARN §52）: a level played on the real clock (not the audits' frozen 1/60 — that never has a slow frame) with
// the main thread slowed by CDP (--throttle 6, or a list: 1,6 — each in the same page, one after the other), her stick held
// forward, for --secs s a rate — and per run and rate:
//   iv     the drawn frames' intervals (rAF to rAF, ms): p50 / p90 / p99 / max — what she would see
//   frame  each Game._frame call's wall ms (the simulation, the HUD, the render calls); sim: of it, Match.update's (all the
//          physics steps of the frame — what the slow frame used to run twice whole)
//   cpu    the main thread's CPU time per frame (CDP Performance ThreadTime — under a throttle it counts the throttle's
//          own time too: compare like with like) and, per frame, CDP's Script / Layout / RecalcStyle / Task durations
//   slow   the share of frames over 1/45 s (the physics' two steps) · poses: squidkid poses per frame (Character.update)
// --base <rev>: the same tree with every file that differs from <rev> served as it is in <rev> (git show) — so before and
// after run in one browser, in one sitting, alternating base / now --rounds times (SwiftShader: only compare within a run).
//   NODE_PATH=/opt/node22/lib/node_modules flock -w 9000 /tmp/ielts-browser.lock nice -n 10 node tools/learn/slowframe-probe.mjs \
//     [--scene duel|runner|puzzle] [--base <rev>] [--throttle 6 | 1,6] [--secs 10] [--rounds 2] [--json <file>]
// duel = w1d6 对抗赛 (her + 7 bots), runner = w1d3 墨浪跑酷, puzzle = w2d3 解密闯关. 390 × 844, dpr 1, quality low, no shadows /
// bloom (the GPU — SwiftShader, not throttled — kept small: the main thread is what is measured). No screenshots, no account.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const SCENE = opt('scene', 'duel'), BASE = opt('base', null), RATES = String(opt('throttle', '6')).split(',').map(Number), SECS = +opt('secs', 10), ROUNDS = +opt('rounds', 2), OUT = opt('json', null);
const LEVEL = { duel: '?learn=w1d6&kind=duel', runner: '?learn=w1d3&kind=race', puzzle: '?learn=w2d3&kind=puzzle' }[SCENE];
const T0 = Date.now(), say = (...a) => console.log(`[slowframe ${SCENE} ${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}]`, ...a);
if (!LEVEL) { console.error('--scene duel|runner|puzzle'); process.exit(2); }

// the base: every file that differs between <rev> and the tree (committed or not), as it is in <rev>
const git = (...a) => execFileSync('git', ['-C', ROOT, ...a], { encoding: 'utf8', maxBuffer: 64 << 20 });
const baseFiles = new Map();
if (BASE) {
  const changed = new Set([...git('diff', '--name-only', BASE).split('\n'), ...git('ls-files', '--others', '--exclude-standard').split('\n')].filter(Boolean));
  for (const f of changed) { try { baseFiles.set('/' + f, execFileSync('git', ['-C', ROOT, 'show', `${BASE}:${f}`], { maxBuffer: 64 << 20 })); } catch (e) { baseFiles.set('/' + f, null); } }
  say('base', BASE, '·', [...baseFiles.keys()].filter((f) => f.startsWith('/src/')).join(' '));
}
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', woff2: 'font/woff2', mp3: 'audio/mpeg', ogg: 'audio/ogg', wasm: 'application/wasm', ktx2: 'image/ktx2', glb: 'model/gltf-binary', bin: 'application/octet-stream', txt: 'text/plain; charset=utf-8' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  const m = /^\/(a|b)\/game(\/.*)$/.exec(u);
  if (!m) { r.writeHead(404); return r.end(); }
  const rel = m[2], type = MIME[path.extname(rel).slice(1)] || 'application/octet-stream';
  if (m[1] === 'a' && baseFiles.has(rel)) {
    const buf = baseFiles.get(rel);
    if (!buf) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' }); return r.end(buf);
  }
  const p = path.join(ROOT, rel);
  if (rel === '/songs/manifest.json' && !fs.existsSync(p)) { r.writeHead(200, { 'content-type': MIME.json }); return r.end('{ "tracks": {} }'); }
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': type, 'cache-control': 'no-store' });
  fs.createReadStream(p).pipe(r);
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const watchdog = setTimeout(() => { say('WATCHDOG'); finish(2); }, +opt('budget', 1500) * 1000);
const results = [];
async function finish(code) { clearTimeout(watchdog); if (OUT) fs.writeFileSync(OUT, JSON.stringify({ scene: SCENE, base: BASE, throttle: RATES, secs: SECS, results }, null, 1)); try { await browser.close(); } catch (e) { /* gone */ } srv.close(); process.exit(code); }
process.on('unhandledRejection', (e) => { say('ERR', String((e && e.stack) || e).slice(0, 600)); finish(1); });

async function run(which) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  await ctx.addInitScript(() => { try { const k = 'inkwave.settings', v = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(v, { shadows: false, bloom: false, touchControls: 'on' }); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* none */ } });
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  await page.goto(`${origin}/${which}/game/index.html${LEVEL}&quality=low&nofullscreen&noclips&from=app`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__inkwave && __inkwave.match && __inkwave.match.learn, null, { timeout: 420000, polling: 250 });
  await ev(() => __inkwave.debug.freeze());
  const step = (ms) => ev((x) => __inkwave.debug.step(x), ms);
  for (let i = 0; i < 240; i++) { if ((await ev(() => __inkwave.match.state)) === 'playing') break; await step(250); }
  // the 备战 board's 「开始」 / the runner's reading board's 「出发」 (the puzzle has none)
  for (let i = 0; i < 24; i++) { const ok = await ev(() => { const b = document.querySelector('.iw-ps:not(.is-off) .iw-ps__act.is-primary'); if (b) { b.click(); return true; } return false; }); if (ok) break; await step(250); }
  for (let i = 0; i < 8; i++) await step(100);
  // the samplers: rAF intervals, each _frame's dt and wall ms and Match.update's share of it, the poses (every squidkid's
  // Character.update) per frame
  await ev(() => {
    const I = __inkwave, S = (window.__sf = { iv: [], ms: [], sim: [], dt: [], poses: 0, frames: 0, on: false, simAcc: 0 }), orig = I._frame.bind(I);
    let last = 0;
    const tick = (t) => { if (S.on && last) S.iv.push(t - last); last = t; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    I._frame = (dt) => { S.simAcc = 0; const t = performance.now(); orig(dt); if (S.on) { S.ms.push(performance.now() - t); S.sim.push(S.simAcc); S.dt.push(dt); S.frames++; } };
    const m = I.match, mu = m.update.bind(m);
    m.update = (...a) => { const t = performance.now(); try { return mu(...a); } finally { S.simAcc += performance.now() - t; } };
    for (const a of m.actors) { const ch = a.character, u = ch.update.bind(ch); ch.update = (dt, s) => { if (S.on) S.poses++; return u(dt, s); }; }
  });
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  const metrics = async () => Object.fromEntries((await cdp.send('Performance.getMetrics')).metrics.map((x) => [x.name, x.value]));
  await ev(() => { __inkwave.debug.unfreeze(); __inkwave.debug.key('KeyW', true); });
  const steer = setInterval(() => { ev(() => { if (__inkwave.rig) __inkwave.rig.yaw += 0.6; }).catch(() => {}); }, 1500);   // (a wall stops a straight run)
  const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))].toFixed(1) : null; };
  const st = (a) => ({ n: a.length, p50: q(a, 0.5), p90: q(a, 0.9), p99: q(a, 0.99), max: a.length ? +Math.max(...a).toFixed(1) : null });
  for (const rate of RATES) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    await page.waitForTimeout(2500);   // (settle: the throttled loop finds its pace)
    await ev(() => { const s = window.__sf; s.iv = []; s.ms = []; s.sim = []; s.dt = []; s.poses = 0; s.frames = 0; s.on = true; });
    const m0 = await metrics();
    await page.waitForTimeout(SECS * 1000);
    await ev(() => { window.__sf.on = false; });
    const m1 = await metrics();
    const S = await ev(() => { const s = window.__sf; return { iv: s.iv, ms: s.ms, sim: s.sim, slow: s.dt.filter((d) => d > 1 / 45).length, frames: s.frames, poses: s.poses, kids: __inkwave.match.actors.length, state: __inkwave.match.state }; });
    const per = (k) => (S.frames ? +(((m1[k] - m0[k]) * 1000) / S.frames).toFixed(1) : null);
    const r = { which: which === 'a' ? `base ${BASE}` : 'now', rate, iv: st(S.iv), frameMs: st(S.ms), simMs: st(S.sim), cpuMsPerFrame: per('ThreadTime'),
      perFrame: { script: per('ScriptDuration'), layout: per('LayoutDuration'), style: per('RecalcStyleDuration'), task: per('TaskDuration') },
      slowShare: S.frames ? +(S.slow / S.frames).toFixed(3) : null, posesPerFrame: S.frames ? +(S.poses / S.frames).toFixed(2) : null, kids: S.kids, frames: S.frames, state: S.state, errors: errs.slice(0, 5) };
    say(r.which.padEnd(16), JSON.stringify(r));
    results.push(r);
  }
  clearInterval(steer);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await ctx.close();
}

const order = [];
for (let i = 0; i < ROUNDS; i++) { if (BASE) order.push('a'); order.push('b'); }
for (const w of order) await run(w);
const sum = (w, rate) => {
  const rs = results.filter((r) => r.rate === rate && (w === 'a') === r.which.startsWith('base'));
  const avg = (f) => +(rs.reduce((s, r) => s + (f(r) || 0), 0) / (rs.length || 1)).toFixed(2);
  return { rate, runs: rs.length, frames: avg((r) => r.frames), ivP50: avg((r) => r.iv.p50), ivP90: avg((r) => r.iv.p90), frameP50: avg((r) => r.frameMs.p50), simP50: avg((r) => r.simMs.p50), simP90: avg((r) => r.simMs.p90), cpuMsPerFrame: avg((r) => r.cpuMsPerFrame), scriptMsPerFrame: avg((r) => r.perFrame.script), slowShare: avg((r) => r.slowShare), posesPerFrame: avg((r) => r.posesPerFrame) };
};
for (const rate of RATES) { if (BASE) say('summary base', JSON.stringify(sum('a', rate))); say('summary now ', JSON.stringify(sum('b', rate))); }
await finish(results.some((r) => r.errors.length) ? 1 : 0);
