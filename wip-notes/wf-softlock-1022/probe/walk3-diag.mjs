// scratch (wf-softlock): why the walk after gate 2 (board-hitch's walk3) takes seconds a frame on this branch and ~20 ms
// on 088c6dd, with the same triangles and draw calls. Same path as tools/learn/board-hitch.mjs up to walk3, then per
// frame: ms, programs, textures, canvas size, pixel ratio, the camera, running animations; a screenshot; frames with
// #ui-root hidden, with the canvas hidden, with no render; a trace of a few frames (GPU process / compositor).
//   node walk3-diag.mjs --root <inkwave checkout> [--cpu 1] [--dpr 3] --out <dir>
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(opt('root', '.')), OUT = path.resolve(opt('out', '.'));
const CPU = +opt('cpu', 1), DPR = +opt('dpr', 3), TRACE = !args.includes('--notrace');
fs.mkdirSync(OUT, { recursive: true });
const T0 = Date.now(), say = (...a) => console.log(`[w3 ${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}]`, ...a);
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', woff2: 'font/woff2', ogg: 'audio/ogg', mp3: 'audio/mpeg', glb: 'model/gltf-binary', bin: 'application/octet-stream', ktx2: 'image/ktx2', wasm: 'application/wasm' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if (!u.startsWith('/game/')) { r.writeHead(404); return r.end(); }
  const p = path.join(ROOT, u.slice('/game'.length));
  if (u === '/game/songs/manifest.json' && !fs.existsSync(p)) { r.writeHead(200, { 'content-type': MIME.json }); return r.end('{ "tracks": {} }'); }
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(p).slice(1)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(p).pipe(r);
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${srv.address().port}/game/`;

const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { const k = 'inkwave.settings', v = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(v, { shadows: false, bloom: false, touchControls: 'on' }); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* none */ } });
const page = await ctx.newPage(), errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const q = '?learn=w2d3&kind=puzzle&from=app&quality=low&nofullscreen&noclips';
say('open', ROOT, q);
await page.goto(base + 'index.html' + q, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__inkwave && __inkwave.match && __inkwave.match.state === 'playing' && __inkwave.match.learn, null, { timeout: 600000, polling: 500 });
await ev(() => __inkwave.debug.freeze());
const cdp = await ctx.newCDPSession(page);
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
say('playing');
const frames = [];
async function step(n, what, draw = true) {
  for (let i = 0; i < n; i++) {
    const r = await ev((dr) => {
      const t = performance.now(); __inkwave._skipRender = !dr;
      try { __inkwave._frame(1 / 30); } finally { __inkwave._skipRender = false; }
      const ms = performance.now() - t, R = __G.renderer, c = R.domElement, cam = __G.camera, F = __inkwave.match.learn, W = F && F.play && F.play.boards && F.play.boards.walk;
      const anims = document.getAnimations().filter((a) => a.playState === 'running').map((a) => `${a.animationName || a.transitionProperty || '?'}@${(a.effect && a.effect.target && (a.effect.target.className && a.effect.target.className.baseVal === undefined ? a.effect.target.className : a.effect.target.tagName)) || ''}`.slice(0, 80));
      return { ms: +ms.toFixed(1), prog: R.info.programs ? R.info.programs.length : -1, tex: R.info.memory.textures, geo: R.info.memory.geometries, tris: dr ? R.info.render.triangles : 0, calls: dr ? R.info.render.calls : 0,
        cw: c.width, ch: c.height, pr: R.getPixelRatio(), cam: [cam.position.x, cam.position.y, cam.position.z].map((v) => +v.toFixed(2)), near: cam.near, fov: cam.fov,
        lens: __inkwave.rig && __inkwave.rig.mode, framed: W ? W.framed : -1, auto: !!(F && F.auto), cls: (document.querySelector('.iw-learn') || {}).className, anims };
    }, draw);
    frames.push({ what, ...r });
  }
}
const state = () => ev(() => { const F = __inkwave.match.learn, W = F.play.boards.walk; return { phase: F.phase, cur: F.cur, auto: F.auto, framed: W ? W.framed : -1 }; });
await step(36, 'start');
await ev(() => { const F = __inkwave.match.learn; F._open(F.gates[F.cur]); });
await step(45, 'opened');
await ev(() => __inkwave.match.learn.autoWalk(true));
let s = null;
for (let i = 0; i < 600; i++) { await step(1, 'walk', false); if (i % 10 === 9) { s = await state(); if (s.framed >= 0 && !s.auto) break; } }
say('at the board', JSON.stringify(s));
await step(4, 'framed');
await step(40, 'framed', false);
const keyed = await ev(() => { const b = document.querySelector('.iw-learn__more'); if (b && !b.hidden) { b.click(); return 'key'; } return false; });
await step(4, 'strip');
say('看全文', keyed);
await ev(() => document.querySelector('.iw-read__x')?.click());
await ev(() => __inkwave.match.learn.autoWalk(true));
for (let i = 0; i < 600; i++) { await step(1, 'walk2', false); if (i % 10 === 9) { s = await state(); if (s.phase !== 'walk') break; } }
await ev(() => { const F = __inkwave.match.learn; F._open(F.gates[F.cur]); });
await step(30, 'opened2');
await ev(() => __inkwave.match.learn.autoWalk(true));
await step(10, 'w3');
await page.screenshot({ path: path.join(OUT, 'w3.png') }).catch(() => {});
await step(4, 'w3');
const hide = (sel, on) => ev(([q, o]) => { for (const el of document.querySelectorAll(q)) el.style.display = o ? 'none' : ''; }, [sel, on]);
await hide('#ui-root', true); await step(5, 'w3-noui'); await hide('#ui-root', false);
await step(3, 'w3-back');
await ev(() => { __G.renderer.domElement.style.visibility = 'hidden'; }); await step(5, 'w3-nocanvas'); await ev(() => { __G.renderer.domElement.style.visibility = ''; });
await step(5, 'w3-norender', false);
await step(3, 'w3-back2');
// the learn layer's classes off one by one (is-framed: the keys)
await ev(() => document.querySelector('.iw-learn').classList.remove('is-framed')); await step(4, 'w3-nofr'); await ev(() => document.querySelector('.iw-learn').classList.add('is-framed'));
await step(3, 'w3-back3');
// a GPU-process / compositor trace of 4 frames
let traceSum = null;
if (TRACE) {
  const tp = path.join(OUT, 'trace.json');
  await browser.startTracing(page, { path: tp, screenshots: false, categories: ['gpu', 'gpu.service', 'disabled-by-default-gpu.service', 'disabled-by-default-gpu.decoder', 'viz', 'cc', 'toplevel', 'blink', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'gpu.angle'] });
  await step(4, 'w3-trace');
  await browser.stopTracing();
  try {
    const T = JSON.parse(fs.readFileSync(tp, 'utf8')), evs = T.traceEvents || T, names = new Map(), pn = new Map();
    for (const e of evs) { if (e.ph === 'M' && e.name === 'thread_name') names.set(e.pid + ':' + e.tid, e.args.name); if (e.ph === 'M' && e.name === 'process_name') pn.set(e.pid, e.args.name); }
    const by = new Map(), open = new Map();
    for (const e of evs) {
      const k = e.pid + ':' + e.tid;
      let d = 0;
      if (e.ph === 'X') d = e.dur || 0;
      else if (e.ph === 'B') { (open.get(k) || open.set(k, []).get(k)).push(e); continue; }
      else if (e.ph === 'E') { const st = open.get(k); const b = st && st.pop(); if (!b) continue; d = e.ts - b.ts; e.name = b.name; }
      else continue;
      const key = `${pn.get(e.pid) || e.pid} / ${names.get(k) || e.tid} / ${e.name}`;
      const o = by.get(key) || { n: 0, us: 0, max: 0 }; o.n++; o.us += d; o.max = Math.max(o.max, d); by.set(key, o);
    }
    traceSum = [...by].sort((a, b) => b[1].us - a[1].us).slice(0, 45).map(([k, o]) => [k, o.n, +(o.us / 1000).toFixed(1), +(o.max / 1000).toFixed(1)]);
  } catch (e) { traceSum = String(e); }
}
const sum = {};
for (const f of frames) { const b = sum[f.what] || (sum[f.what] = { n: 0, ms: [], prog: new Set(), tex: new Set(), cw: new Set(), anims: new Set(), cls: new Set(), cam: [] }); b.n++; b.ms.push(f.ms); b.prog.add(f.prog); b.tex.add(f.tex); b.cw.add(f.cw + 'x' + f.ch + '@' + f.pr); for (const a of f.anims) b.anims.add(a); b.cls.add(f.cls); b.cam.push(f.cam.join(',')); }
for (const [k, b] of Object.entries(sum)) {
  const ms = b.ms.slice().sort((x, y) => x - y);
  console.log(k.padEnd(12), 'n', b.n, 'p50', ms[Math.floor(ms.length / 2)], 'max', ms[ms.length - 1], 'prog', [...b.prog].join('/'), 'tex', [...b.tex].join('/'), 'canvas', [...b.cw].join('/'), 'cls', [...b.cls].join(' | '), 'anims', [...b.anims].join(', ').slice(0, 300), 'cam', b.cam[0], '→', b.cam[b.cam.length - 1]);
}
console.log('trace', JSON.stringify(traceSum, null, 1));
console.log('errors', JSON.stringify(errs));
fs.writeFileSync(path.join(OUT, 'frames.json'), JSON.stringify({ frames, traceSum, errs }, null, 1));
await browser.close(); srv.close();
