// scratch (wf-softlock, fourth agent): is board-hitch's slow walk3 fill-bound at the framing pose? Same path as
// tools/learn/board-hitch.mjs up to walk3; per drawn frame: ms, the camera, the framing pose. After the onset (three frames
// over 1 s in a row) or at --max: (A) the pixel ratio down to 0.25 (fill-bound → much faster) and back; (B) the board's
// framing band back to 088c6dd's (bandFor = null, framed again: the camera springs to the old pose) and back to keysBandNow;
// (C) the meshes the camera stands in or next to, listed, then hidden together; (D) every transparent mesh hidden.
//   node w3-fill.mjs --root <inkwave checkout> --out <dir> [--cpu 1] [--dpr 3] [--max 90]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(opt('root', '.')), OUT = path.resolve(opt('out', '.'));
const CPU = +opt('cpu', 1), DPR = +opt('dpr', 3), MAX = +opt('max', 90);
fs.mkdirSync(OUT, { recursive: true });
const T0 = Date.now(), say = (...a) => console.log(`[w3fill ${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}]`, ...a);
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
    const r = await ev((dr) => {
      const t = performance.now(); __inkwave._skipRender = !dr;
      try { __inkwave._frame(1 / 30); } finally { __inkwave._skipRender = false; }
      const ms = performance.now() - t, F = __inkwave.match.learn, W = F && F.play && F.play.boards && F.play.boards.walk, cam = __G.camera, R = __G.renderer;
      const fp = W && W.framing ? W.framing.pos : null;
      return { ms: +ms.toFixed(1), cam: [cam.position.x, cam.position.y, cam.position.z].map((v) => +v.toFixed(2)), near: cam.near, fov: +cam.fov.toFixed(1), fpos: fp ? [fp.x, fp.y, fp.z].map((v) => +v.toFixed(2)) : null, framed: W ? W.framed : -1, auto: !!(F && F.auto), pr: R.getPixelRatio(), calls: dr ? R.info.render.calls : 0, tris: dr ? R.info.render.triangles : 0 };
    }, draw);
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
say('at the board', JSON.stringify(s), 'cam', JSON.stringify(frames[frames.length - 1].cam));
await step(8, 'framed');
await step(36, 'framed', false);
const keyed = await ev(() => { const b = document.querySelector('.iw-learn__more'); if (b && !b.hidden) { b.click(); return 'key'; } const W = __inkwave.match.learn.play.boards.walk; return W && W.framed >= 0 && W.activate('more') ? 'hotspot' : false; });
await step(4, 'strip');
await ev(() => document.querySelector('.iw-read__x')?.click());
await ev(() => __inkwave.match.learn.autoWalk(true));
for (let i = 0; i < 600; i++) { await step(1, 'walk2', false); if (i % 10 === 9) { s = await state(); if (s.phase !== 'walk') break; } }
await ev(() => { const F = __inkwave.match.learn; F._open(F.gates[F.cur]); });
const o2 = await step(45, 'opened2');
say('opened2 p50', p50(o2), 'max', Math.max(...o2), 'keyed', keyed, 'cam', JSON.stringify(frames[frames.length - 1].cam), 'framing', JSON.stringify(frames[frames.length - 1].fpos));
await ev(() => __inkwave.match.learn.autoWalk(true));
let run = 0, n3 = 0, onset = -1;
const w3 = [];
while (n3 < MAX) { const [ms] = await step(1, 'walk3'); w3.push(ms); n3++; run = ms > 1000 ? run + 1 : 0; if (run >= 3) { onset = n3 - 3; break; } }
say('walk3', n3, 'frames; onset', onset, 'p50', p50(w3), 'max', Math.max(...w3));
say('walk3 frames', JSON.stringify(frames.filter((f) => f.what === 'walk3').map((f) => [f.ms, f.cam.join(','), f.fpos ? f.fpos.join(',') : '-', f.framed, f.auto ? 'auto' : ''])));
const res = { onset, w3, keyed, exp: {} };
// (A) fill-bound? the pixel ratio down, then back
{
  const pr = await ev(() => { const R = __G.renderer, p = R.getPixelRatio(); R.setPixelRatio(0.25); return p; });
  const a = await step(4, 'pr025');
  await ev((p) => __G.renderer.setPixelRatio(p), pr);
  const b = await step(3, 'pr-back');
  res.exp.pixelRatio = { pr, low: a, back: b }; say('A pixel ratio', pr, '→ 0.25:', a.join(' '), '| back:', b.join(' '));
}
// (B) the framing band of 088c6dd (none: boardBand) — the camera springs to the old pose — then keysBandNow again
{
  const keep = await ev(() => { const W = __inkwave.match.learn.play.boards.walk; window.__keepBand = W.bandFor; W.bandFor = null; if (W.framed >= 0) W._frame(innerWidth / innerHeight); return !!window.__keepBand; });
  const a = await step(10, 'band-old');
  const camA = frames[frames.length - 1].cam;
  await ev(() => { const W = __inkwave.match.learn.play.boards.walk; W.bandFor = window.__keepBand; if (W.framed >= 0) W._frame(innerWidth / innerHeight); });
  const b = await step(10, 'band-keys');
  const camB = frames[frames.length - 1].cam;
  res.exp.band = { keep, old: a, camOld: camA, keys: b, camKeys: camB }; say('B band old:', a.join(' '), 'cam', camA.join(','), '| keysBand again:', b.join(' '), 'cam', camB.join(','));
}
// (C) the meshes the camera is in or next to (world bounding sphere within 1.5 m of the camera), hidden together
{
  const near = await ev(() => {
    const cam = __G.camera, P = cam.position, out = [], S = window.__nearHidden = [];
    __G.scene.traverse((o) => {
      if (!(o.isMesh || o.isPoints || o.isLine) || !o.visible) return;
      let vis = true; for (let p = o.parent; p; p = p.parent) if (!p.visible) { vis = false; break; }
      if (!vis || !o.geometry) return;
      if (o.isInstancedMesh) { if (!o.boundingSphere) o.computeBoundingSphere(); } else if (!o.geometry.boundingSphere) o.geometry.computeBoundingSphere();
      const bs = (o.isInstancedMesh ? o.boundingSphere : o.geometry.boundingSphere).clone().applyMatrix4(o.matrixWorld);
      const d = bs.center.distanceTo(P) - bs.radius;
      if (d < 1.5) {
        const m = Array.isArray(o.material) ? o.material[0] : o.material;
        out.push({ name: o.name || (o.parent && o.parent.name) || '?', type: o.type, mat: m ? m.type + (m.name ? ':' + m.name : '') : '?', transparent: !!(m && m.transparent), side: m ? m.side : -1, alphaTest: m ? m.alphaTest : 0, r: +bs.radius.toFixed(1), d: +d.toFixed(2), n: o.isInstancedMesh ? o.count : 1, tris: o.geometry.index ? o.geometry.index.count / 3 : (o.geometry.attributes.position ? o.geometry.attributes.position.count / 3 : 0) });
        S.push(o);
      }
    });
    return out;
  });
  say('C near the camera', near.length, JSON.stringify(near.slice(0, 40)));
  await ev(() => { for (const o of window.__nearHidden) o.visible = false; });
  const a = await step(4, 'near-off');
  await ev(() => { for (const o of window.__nearHidden) o.visible = true; });
  const b = await step(3, 'near-on');
  res.exp.near = { list: near, off: a, on: b }; say('C near off:', a.join(' '), '| on:', b.join(' '));
}
// (D) every transparent mesh hidden
{
  const n = await ev(() => { const S = window.__trHidden = []; __G.scene.traverse((o) => { const m = o.material && (Array.isArray(o.material) ? o.material[0] : o.material); if ((o.isMesh || o.isPoints) && o.visible && m && m.transparent) { o.visible = false; S.push(o); } }); return S.length; });
  const a = await step(4, 'transp-off');
  await ev(() => { for (const o of window.__trHidden) o.visible = true; });
  const b = await step(3, 'transp-on');
  res.exp.transparent = { n, off: a, on: b }; say('D transparent off (' + n + '):', a.join(' '), '| on:', b.join(' '));
}
res.errors = errs;
fs.writeFileSync(path.join(OUT, 'w3-fill.json'), JSON.stringify({ ...res, frames }, null, 1));
say('errors', JSON.stringify(errs));
await browser.close(); srv.close();
