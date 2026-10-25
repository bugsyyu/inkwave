// 讲解板那一段到底慢在哪（LEARN §48 review, 10-25）: what each stepped frame asks of the GPU, on the path board-hitch.mjs walks
// (w2d3 from its start: the first gate opens, the walk to the 讲解板, framed, 看全文, the second gate opens, walk3 on) — every
// WebGL call of the frame counted by name, the bytes handed over (bufferData / bufferSubData / texImage2D / texSubImage2D /
// texStorage2D, typed arrays and image sources alike), renderer.info (programs, textures, geometries), the frame's main-thread
// ms (_frame) and its wall ms (the step's round trip). --fence: a fence after each drawn frame, polled until the GPU has done
// it — its gpu ms, the frame's own cost with no backlog behind it.
// Why it exists: on software GL a drawn frame at DPR 3 costs seconds of the GPU process; the main thread waits for that backlog
// somewhere — between frames (then _frame looks cheap) or inside a GL call of the next frame once the command buffer is full
// (then _frame looks like seconds). board-hitch's per-frame ms is only the main thread's, so it can show a 1000× gap where the
// GPU's work and the wall time per frame are the same (§48: 088c6dd vs wf-softlock on walk3). Compare gpu (with --fence) or
// wall, and the call counts, not _frame's ms alone. Run it on two checkouts and diff the per-phase histograms.
//   node tools/learn/gl-frames.mjs --root <inkwave checkout> --out <file.json> [--cpu 1] [--dpr 3] [--max 24] [--fence] [--toggles]
// Run browsers one at a time: flock -w 9000 /tmp/ielts-browser.lock nice -n 10 node tools/learn/gl-frames.mjs …
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(opt('root', path.join(path.dirname(new URL(import.meta.url).pathname), '../..'))), OUT = path.resolve(opt('out', 'gl-frames.json'));
const CPU = +opt('cpu', 1), DPR = +opt('dpr', 3), MAX = +opt('max', 24), TOGGLES = args.includes('--toggles'), FENCE = args.includes('--fence');
const T0 = Date.now(), say = (...a) => console.log(`[gl-frames ${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}]`, ...a);
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

function instrument() {
  const H = (window.__gh = { n: new Map(), bytes: new Map(), big: [] });
  const sizeOf = (v) => { if (!v || typeof v !== 'object') return 0; if (ArrayBuffer.isView(v)) return v.byteLength; if (v instanceof ArrayBuffer) return v.byteLength; if ('width' in v && 'height' in v) return (v.width * v.height * 4) | 0; return 0; };
  const what = (v) => !v || typeof v !== 'object' ? '' : ArrayBuffer.isView(v) ? v.constructor.name : (v.constructor && v.constructor.name) + ('width' in v ? `:${v.width}x${v.height}` : '');
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue;
    for (const k of Object.getOwnPropertyNames(C.prototype)) {
      const d = Object.getOwnPropertyDescriptor(C.prototype, k);
      if (!d || typeof d.value !== 'function' || k === 'constructor') continue;
      const f = d.value;
      const up = /^(bufferData|bufferSubData|texImage2D|texSubImage2D|texImage3D|texSubImage3D|compressedTexImage2D|compressedTexSubImage2D|texStorage2D|renderbufferStorage|renderbufferStorageMultisample)$/.test(k);
      C.prototype[k] = function (...a) {
        H.n.set(k, (H.n.get(k) || 0) + 1);
        if (up) {
          let b = 0, w = '';
          if (k === 'texStorage2D') b = a[3] * a[4] * 4 * (a[1] > 1 ? 1.34 : 1);
          else if (k === 'renderbufferStorage') b = a[2] * a[3] * 4;
          else if (k === 'renderbufferStorageMultisample') b = a[3] * a[4] * 4 * a[1];
          else if (k === 'bufferData' && typeof a[1] === 'number') b = a[1];
          else for (let i = a.length - 1; i >= 0; i--) { const s = sizeOf(a[i]); if (s) { b = s; w = what(a[i]); break; } }
          if (!b && (k === 'texImage2D' || k === 'texSubImage2D')) { const ww = k === 'texImage2D' ? a[3] : a[4], hh = k === 'texImage2D' ? a[4] : a[5]; if (typeof ww === 'number' && typeof hh === 'number') b = ww * hh * 4; }
          H.bytes.set(k, (H.bytes.get(k) || 0) + b);
          if (b >= 262144) H.big.push([k, w, b]);
        }
        return f.apply(this, a);
      };
    }
  }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { const k = 'inkwave.settings', v = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(v, { shadows: false, bloom: false, touchControls: 'on' }); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* none */ } });
await ctx.addInitScript(instrument);
const page = await ctx.newPage(), errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
await page.goto(base + 'index.html?learn=w2d3&kind=puzzle&from=app&quality=low&nofullscreen&noclips', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__inkwave && __inkwave.match && __inkwave.match.state === 'playing' && __inkwave.match.learn, null, { timeout: 600000, polling: 500 });
await ev(() => __inkwave.debug.freeze());
const cdp = await ctx.newCDPSession(page);
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
say('playing', ROOT);
const frames = [];
async function step(n, what, draw = true) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const w0 = Date.now();
    const r = await ev(async ([dr, fence]) => {
      const H = window.__gh; H.n.clear(); H.bytes.clear(); H.big.length = 0;
      const t = performance.now(); __inkwave._skipRender = !dr;
      try { __inkwave._frame(1 / 30); } finally { __inkwave._skipRender = false; }
      const ms = performance.now() - t, R = __G.renderer, I = R.info, F = __inkwave.match.learn, W = F && F.play && F.play.boards && F.play.boards.walk;
      const out = { ms: +ms.toFixed(1), n: Object.fromEntries(H.n), bytes: Object.fromEntries(H.bytes), big: H.big.slice(0, 12), calls: dr ? I.render.calls : 0, tris: dr ? I.render.triangles : 0, programs: I.programs ? I.programs.length : -1, tex: I.memory.textures, geo: I.memory.geometries, pr: R.getPixelRatio(), size: [R.domElement.width, R.domElement.height], framed: W ? W.framed : -1, phase: F && F.phase };
      // --fence: the frame's GL work done on the GPU (a fence after it, polled): the GPU's own cost of this frame, no backlog
      if (fence) { const gl = R.getContext(), s = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0); gl.flush(); while (gl.getSyncParameter(s, gl.SYNC_STATUS) !== gl.SIGNALED) await new Promise((ok) => setTimeout(ok, 1)); gl.deleteSync(s); out.gpu = +(performance.now() - t).toFixed(1); }
      return out;
    }, [draw, FENCE]);
    r.wall = Date.now() - w0;
    frames.push({ what, ...r }); out.push(r.ms);
  }
  return out;
}
const state = () => ev(() => { const F = __inkwave.match.learn, W = F.play.boards.walk; return { phase: F.phase, cur: F.cur, auto: F.auto, framed: W ? W.framed : -1 }; });
const p50 = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
await step(36, 'start');
await ev(() => { const F = __inkwave.match.learn; F._open(F.gates[F.cur]); });
await step(45, 'opened');
await ev(() => __inkwave.match.learn.autoWalk(true));
let s = null;
for (let i = 0; i < 600; i++) { await step(1, 'walk', false); if (i % 10 === 9) { s = await state(); if (s.framed >= 0 && !s.auto) break; } }
say('at the board', JSON.stringify(s));
await step(8, 'framed');
await step(36, 'framed-nodraw', false);
const keyed = await ev(() => { const b = document.querySelector('.iw-learn__more'); if (b && !b.hidden) { b.click(); return 'key'; } const W = __inkwave.match.learn.play.boards.walk; return W && W.framed >= 0 && W.activate('more') ? 'hotspot' : false; });
await step(4, 'strip');
await ev(() => document.querySelector('.iw-read__x')?.click());
await ev(() => __inkwave.match.learn.autoWalk(true));
for (let i = 0; i < 600; i++) { await step(1, 'walk2', false); if (i % 10 === 9) { s = await state(); if (s.phase !== 'walk') break; } }
await ev(() => { const F = __inkwave.match.learn; F._open(F.gates[F.cur]); });
const o2 = await step(45, 'opened2');
say('opened2 p50', p50(o2), 'max', Math.max(...o2), 'keyed', keyed);
await ev(() => __inkwave.match.learn.autoWalk(true));
const w3 = []; let run = 0, after = -1;
for (let i = 0; i < MAX; i++) { const [ms] = await step(1, 'walk3'); w3.push(ms); run = ms > 1000 ? run + 1 : 0; if (run >= 3 && after < 0) after = 4; if (after > 0 && --after === 0) break; }
say('walk3', w3.length, 'frames p50', p50(w3), 'max', Math.max(...w3), JSON.stringify(w3));
const res = { root: ROOT, keyed, o2, w3, toggles: {} };
if (TOGGLES) {
  // skip the 3D render (does the time follow it?)
  res.toggles.norender = await step(3, 'norender', false);
  res.toggles.back = await step(3, 'back');
  say('toggles', JSON.stringify(res.toggles));
}
// per phase: the mean count per frame of each GL call, and the bytes
const by = {};
for (const f of frames) {
  const b = by[f.what] || (by[f.what] = { frames: 0, n: {}, bytes: {}, ms: [] });
  b.frames++; b.ms.push(f.ms);
  for (const [k, v] of Object.entries(f.n)) b.n[k] = (b.n[k] || 0) + v;
  for (const [k, v] of Object.entries(f.bytes)) b.bytes[k] = (b.bytes[k] || 0) + v;
}
for (const b of Object.values(by)) { for (const k of Object.keys(b.n)) b.n[k] = +(b.n[k] / b.frames).toFixed(1); for (const k of Object.keys(b.bytes)) b.bytes[k] = Math.round(b.bytes[k] / b.frames); b.p50 = p50(b.ms); delete b.ms; }
res.by = by; res.errors = errs;
fs.writeFileSync(OUT, JSON.stringify({ ...res, frames }, null, 1));
say('walk3 per frame', JSON.stringify(by.walk3 && { n: by.walk3.n, bytes: by.walk3.bytes }));
say('opened2 per frame', JSON.stringify(by.opened2 && { n: by.opened2.n, bytes: by.opened2.bytes }));
for (const ph of ['opened', 'framed', 'strip', 'opened2', 'walk3']) { const fr = frames.filter((f) => f.what === ph); if (!fr.length) continue; say(ph, 'gpu', JSON.stringify(fr.map((f) => f.gpu)), 'wall', JSON.stringify(fr.map((f) => f.wall)), 'p50 gpu', p50(fr.map((f) => f.gpu || 0)), 'p50 wall', p50(fr.map((f) => f.wall))); }
say('errors', JSON.stringify(errs));
await browser.close(); srv.close();
