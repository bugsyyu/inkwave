// scratch (wf-softlock): is the hidden corner minimap (is-nomap: display none, still composing ~20 Hz) what makes the
// drawn frames slow after ~300 frames on this branch? Step drawn frames, then the same with the minimap's update a no-op,
// then with .iw-map shown again (update back on).
//   node minimap-diag.mjs --root <inkwave checkout> [--dpr 3] [--n 420]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(opt('root', '.')), DPR = +opt('dpr', 3), N = +opt('n', 420), MODE = opt('mode', 'hidden');
const T0 = Date.now(), say = (...a) => console.log(`[mm ${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}]`, ...a);
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
await page.goto(base + 'index.html?learn=w2d3&kind=puzzle&gate=2&from=app&quality=low&nofullscreen&noclips', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__inkwave && __inkwave.match && __inkwave.match.state === 'playing' && __inkwave.match.learn, null, { timeout: 600000, polling: 500 });
await ev(() => __inkwave.debug.freeze());
const info = await ev(() => ({ nomap: document.querySelector('.iw-hud')?.classList.contains('is-nomap'), mapDisplay: getComputedStyle(document.querySelector('.iw-map')).display, mm: !!__inkwave.minimap, mmw: __inkwave.minimap && __inkwave.minimap.w }));
say('playing', JSON.stringify(info));
// MODE shown: the corner map forced visible (the base look) from the start
if (MODE === 'shown') await ev(() => { const s = document.createElement('style'); s.textContent = '.iw-hud.is-learn.is-nomap .iw-map { display: block !important; }'; document.head.appendChild(s); });
async function run(n, what) {
  const ms = [];
  for (let i = 0; i < n; i++) ms.push(await ev(() => { const t = performance.now(); __inkwave._frame(1 / 30); return performance.now() - t; }));
  for (let k = 0; k < ms.length; k += 30) { const s = ms.slice(k, k + 30).sort((a, b) => a - b); say(what, `frames ${k}-${k + s.length - 1}`, 'p50', s[Math.floor(s.length / 2)].toFixed(1), 'max', s[s.length - 1].toFixed(1)); }
}
await run(N, 'normal');
const keep = await ev(() => { const M = __inkwave.minimap; M._upd = M.update; M.update = () => {}; return true; });
await run(90, 'no-minimap-update');
await ev(() => { const M = __inkwave.minimap; M.update = M._upd; });
await run(60, 'update-back');
say('errors', JSON.stringify(errs));
await browser.close(); srv.close();
