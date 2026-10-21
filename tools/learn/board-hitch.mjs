// 讲解板那一下的主线程（LEARN §48 item 6, wf-softlock）: what the main thread does around the boards on a phone — painting
// them (the 2D canvas: layout + text), uploading their faces (texImage2D + mipmaps, on the first frame each face is
// drawn), opening the reading strip — with the CPU slowed by CDP (4× / 6×: a phone's main thread, relative) at her
// density (DPR 3). The level is the one she was on: w2d3 from its start, the clock frozen and stepped by hand; per frame
// its main-thread time, and inside it what the boards cost, by kind (and the auto-walk's path searches); the events her
// report has: the level's first frames, gate 1 opening (the 讲解板 of gate 2 rises, the gates ahead are painted), the walk
// to it, framed, 看全文, gate 2 opening (gate 3's word boards rise), the walk on. (A board stands only once the gate before
// its gate has opened: started at ?gate=2 the 讲解板 never stood — the first version of this probe framed nothing.)
// Frames are drawn where the boards' faces can upload (they rise: the start, a gate opening; framed; the strip) and not
// on the walks between (software GL at DPR 3 takes seconds a frame; nothing of the boards happens there); each drawn frame
// keeps what it drew (triangles, draw calls) and where the lens was — a drawn frame's time is mostly the software GL's.
// Not a pass / fail: the numbers go into LEARN §48 (> 200 ms in one frame is what item 6 splits).
//   node tools/learn/board-hitch.mjs [--cpu 4] [--dpr 3] [--learn w2d3] [--gate 0] [--view portrait|landscape] [--json <file>]
// Run browsers one at a time: flock -w 9000 /tmp/ielts-browser.lock nice -n 10 node tools/learn/board-hitch.mjs …
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const CPU = +opt('cpu', 4), DPR = +opt('dpr', 3), LEARN_Q = opt('learn', 'w2d3'), GATE = +opt('gate', 0), OUT = opt('json', null);
const V = opt('view', 'portrait') === 'landscape' ? { w: 844, h: 390 } : { w: 390, h: 844 };
const T0 = Date.now(), say = (...a) => console.log(`[board-hitch ${CPU}x dpr${DPR} ${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}]`, ...a);
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

// in the page before anything runs: the GL uploads timed (the face textures: canvases ≥ 256 px), long tasks
function instrument() {
  const H = (window.__bh = { up: [], lt: [] });
  const now = () => performance.now();
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) H.lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* none */ }
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue;
    const ti = C.prototype.texImage2D, ts = C.prototype.texSubImage2D, gm = C.prototype.generateMipmap;
    const src = (a) => { const s = a[a.length - 1]; return s && typeof s === 'object' && 'width' in s && s.width >= 256 ? `${s.constructor && s.constructor.name}:${s.width}x${s.height}` : null; };
    C.prototype.texImage2D = function (...a) { const k = src(a); if (!k) return ti.apply(this, a); const t = now(); const r = ti.apply(this, a); H.up.push(['tex', k, now() - t, t]); return r; };
    C.prototype.texSubImage2D = function (...a) { const k = src(a); if (!k) return ts.apply(this, a); const t = now(); const r = ts.apply(this, a); H.up.push(['sub', k, now() - t, t]); return r; };
    C.prototype.generateMipmap = function (...a) { const t = now(); const r = gm.apply(this, a); const d = now() - t; if (d > 1) H.up.push(['mip', '', d, t]); return r; };
  }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: V.w, height: V.h }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { const k = 'inkwave.settings', v = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(v, { shadows: false, bloom: false, touchControls: 'on' }); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* none */ } });
await ctx.addInitScript(instrument);
const page = await ctx.newPage(), errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const q = `?learn=${LEARN_Q}&kind=puzzle${GATE ? '&gate=' + GATE : ''}&from=app&quality=low&nofullscreen&noclips`;
say('open', q);
await page.goto(base + 'index.html' + q, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__inkwave && __inkwave.match && __inkwave.match.state === 'playing' && __inkwave.match.learn, null, { timeout: 600000, polling: 500 });
await ev(() => __inkwave.debug.freeze());
// the boards' own costs, timed where they run: painting (BoardSet.paint: layout + draw), the reading strip opening
await ev(async () => {
  const H = window.__bh, now = () => performance.now();
  const { BoardSet } = await import(new URL('src/learn/play/board/set.js', location.href).href);
  const { ReadStrip } = await import(new URL('src/learn/play/board/strip.js', location.href).href);
  const paint = BoardSet.prototype.paint;
  BoardSet.prototype.paint = function (spec) { const t = now(); const e = paint.call(this, spec); H.up.push(['paint', spec.kind + ':' + (spec.title || '').slice(0, 14), now() - t, t]); return e; };
  const open = ReadStrip.prototype.open;
  ReadStrip.prototype.open = function (o) { const t = now(); const r = open.call(this, o); H.up.push(['strip', '', now() - t, t]); return r; };
  // (and the auto-walk's path searches: a stop it cannot reach re-plans every 1.6 s)
  const N = __G.nav, path = N && N.path;
  if (path) N.path = function (...a) { const t = now(); const r = path.apply(this, a); H.up.push(['path', a[0] + '>' + a[1], now() - t, t]); return r; };
});
if (CPU > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU }); }
say('playing; CPU', CPU + '×');
// one stepped, drawn frame: its main-thread time, and the board costs inside it
const frames = [];
async function step(n = 1, what = '', draw = true) {
  for (let i = 0; i < n; i++) {
    const r = await ev((dr) => {
      const H = window.__bh, k = H.up.length, t = performance.now(); __inkwave._skipRender = !dr;
      try { __inkwave._frame(1 / 30); } finally { __inkwave._skipRender = false; }
      const ms = performance.now() - t, F = __inkwave.match.learn, W = F && F.play && F.play.boards && F.play.boards.walk, inf = __G.renderer.info.render;
      return { ms, parts: H.up.slice(k).map((u) => [u[0], u[1], +u[2].toFixed(1)]), tris: dr ? inf.triangles : 0, calls: dr ? inf.calls : 0, lens: __inkwave.rig && __inkwave.rig.mode, framed: W ? W.framed : -1, auto: !!(F && F.auto), phase: F && F.phase };
    }, draw);
    frames.push({ what, ms: +r.ms.toFixed(1), parts: r.parts, drawn: draw, tris: r.tris, calls: r.calls, lens: r.lens, framed: r.framed, auto: r.auto, phase: r.phase });
  }
}
const state = () => ev(() => { const F = __inkwave.match.learn, H = F.play, W = H.boards.walk; return { phase: F.phase, cur: F.cur, auto: F.auto, framed: W ? W.framed : -1, boards: W ? W.list.length : 0, read: W && W.framed >= 0 ? W.read(W.framed) : null, strip: W ? W.strip.isOpen : false }; });
// the first frames (the stations build, the first gates' boards are painted — under the match fade on her phone)
await step(36, 'start');
// gate 1 opens (by its answers on her phone; here the probe opens it — what follows a gate opening is what is measured):
// the 讲解板 of gate 2 rises, the gates ahead are painted
await ev(() => { const F = __inkwave.match.learn; F._open(F.gates[F.cur]); });
await step(45, 'opened');
// the walk to the board (the level's own auto-walk: this probe measures, it does not play), framing, read
await ev(() => __inkwave.match.learn.autoWalk(true));
let s = null;
for (let i = 0; i < 600; i++) { await step(1, 'walk', false); if (i % 10 === 9) { s = await state(); if (s.framed >= 0 && !s.auto) break; } }
say('at the board', JSON.stringify(s));
await step(8, 'framed');
await step(Math.ceil(LEARN_READ_S() * 30), 'framed', false);
s = await state();
// 看全文 (the HUD's key)
const keyed = await ev(() => { const b = document.querySelector('.iw-learn__more'); if (b && !b.hidden) { b.click(); return 'key'; } const W = __inkwave.match.learn.play.boards.walk; return W && W.framed >= 0 && W.activate('more') ? 'hotspot' : false; });
await step(4, 'strip');
s = await state();
say('看全文', keyed, JSON.stringify(s));
await ev(() => document.querySelector('.iw-read__x')?.click());
// on to the gate: its questions free the boards; then the gate opens by its answers — here the probe opens it (what
// follows a gate opening is what is measured: the next gates' boards painted, the next ones placed)
await ev(() => __inkwave.match.learn.autoWalk(true));
for (let i = 0; i < 600; i++) { await step(1, 'walk2', false); if (i % 10 === 9) { s = await state(); if (s.phase !== 'walk') break; } }
await ev(() => { const F = __inkwave.match.learn; F._open(F.gates[F.cur]); });
await step(45, 'opened2');
// on towards the next gate's boards, drawn (a face uploads on the first frame it is drawn in view, before LEARN §48)
await ev(() => __inkwave.match.learn.autoWalk(true));
await step(75, 'walk3');
// one board painted and one face uploaded on their own, at this CPU: what each costs
const one = await ev(async () => {
  const F = __inkwave.match.learn, W = F.play.boards.walk, g = F.gates[F.cur], now = () => performance.now();
  const { gateSpecs } = await import(new URL('src/learn/play/wire/boards.js', location.href).href);
  const specs = gateSpecs(g, F.level); if (!specs.length) return null;
  const out = [];
  for (let k = 0; k < Math.min(3, specs.length); k++) {
    let t = now(); const e = W.set.paint(specs[k]); const paint = now() - t;
    t = now(); __G.renderer.initTexture(e.tex); const upload = now() - t;
    out.push({ kind: specs[k].kind, h: e.layout.H, paint: +paint.toFixed(1), upload: +upload.toFixed(1) });
    e.dispose();
  }
  return out;
});
function LEARN_READ_S() { return 1.2; }
const lt = await ev(() => window.__bh.lt);
// the summary: per phase of the walk the frames' main-thread time (p50 / max) and the board costs by kind
const by = {};
for (const f of frames) {
  const b = by[f.what] || (by[f.what] = { n: 0, ms: [], kinds: {} });
  b.n++; b.ms.push(f.ms);
  for (const [k, name, ms] of f.parts) { const K = b.kinds[k] || (b.kinds[k] = { n: 0, sum: 0, max: 0, max1: '' }); K.n++; K.sum += ms; if (ms > K.max) { K.max = +ms.toFixed(1); K.max1 = name; } }
}
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(p * s.length))].toFixed(1) : 0; };
const summary = Object.fromEntries(Object.entries(by).map(([k, b]) => [k, { frames: b.n, p50: pct(b.ms, 0.5), max: +Math.max(...b.ms).toFixed(1), kinds: Object.fromEntries(Object.entries(b.kinds).map(([kk, K]) => [kk, { n: K.n, sum: +K.sum.toFixed(1), max: K.max, at: K.max1 }])) }]));
const worst = frames.slice().sort((a, b) => b.ms - a.ms).slice(0, 6).map((f) => ({ what: f.what, ms: f.ms, tris: f.tris, lens: f.lens, framed: f.framed, parts: f.parts.filter((p) => p[2] > 2).slice(0, 8) }));
// the boards' own work in one frame: painting, the strip, their faces' uploads (1024-px canvases) — not the world's
const isBoard = (p) => p[0] === 'paint' || p[0] === 'strip' || ((p[0] === 'tex' || p[0] === 'sub') && /Canvas[^:]*:1024x/.test(p[1]));
const boardMs = frames.map((f) => f.parts.filter(isBoard).reduce((a, p) => a + p[2], 0)), pathMs = frames.map((f) => f.parts.filter((p) => p[0] === 'path').reduce((a, p) => a + p[2], 0));
for (const [k, b] of Object.entries(summary)) { const fr = frames.filter((f) => f.what === k); b.tris = pct(fr.map((f) => f.tris || 0), 0.5); b.lens = [...new Set(fr.map((f) => f.lens))].join(','); b.framed = fr.some((f) => f.framed >= 0); }
const out = { cpu: CPU, dpr: DPR, view: V, learn: LEARN_Q, gate: GATE, one, summary, worst, boardsInOneFrameMax: +Math.max(...boardMs).toFixed(1), pathInOneFrameMax: +Math.max(0, ...pathMs).toFixed(1), longTasks: { n: lt.length, over200: lt.filter((x) => x[1] > 200).length, max: lt.reduce((m, x) => Math.max(m, x[1]), 0) }, errors: errs };
console.log('[board-hitch] ' + JSON.stringify(out, null, 1));
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ ...out, frames }, null, 1));
await browser.close(); srv.close();
