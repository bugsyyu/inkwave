// probe: how fast the level runs here (fps, sim / render ms, the level's clock against the wall), drawing and not
// node fps.mjs <inkwave root> [learn] [w] [h]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(process.argv[2]), LQ = process.argv[3] || 'w2d3', W = +(process.argv[4] || 390), H = +(process.argv[5] || 844);
const srv = http.createServer((q, r) => { let u = decodeURIComponent(new URL(q.url, 'http://x').pathname); if (!u.startsWith('/game/')) { r.writeHead(404); return r.end(); } u = u.slice(5); const p = path.join(ROOT, u); if (u === '/songs/manifest.json' && !fs.existsSync(p)) { r.writeHead(200); return r.end('{"tracks":{}}'); } if (!fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); } const ext = path.extname(p).slice(1); r.writeHead(200, { 'content-type': { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', woff2: 'font/woff2', png: 'image/png', webp: 'image/webp', svg: 'image/svg+xml', jpg: 'image/jpeg' }[ext] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r); });
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { localStorage.setItem('inkwave.settings', JSON.stringify({ shadows: false, bloom: false, touchControls: 'on' })); } catch (e) {} });
const page = await ctx.newPage();
await page.goto(`http://127.0.0.1:${srv.address().port}/game/index.html?learn=${LQ}&kind=puzzle&from=app&quality=low&nofullscreen&noclips`, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__inkwave && __inkwave.match && __inkwave.match.state === 'playing' && __inkwave.match.learn, null, { timeout: 600000, polling: 500 });
const read = () => page.evaluate(() => ({ t: +__inkwave.match.learn.t.toFixed(2), gt: +__G.time.toFixed(2), fps: __inkwave.fps, sim: __inkwave.perf && +__inkwave.perf.sim.toFixed(1), render: __inkwave.perf && +__inkwave.perf.render.toFixed(1), scale: __inkwave.R && __inkwave.R.dynScale, calls: __inkwave.perf && __inkwave.perf.calls, tris: __inkwave.perf && __inkwave.perf.tris }));
for (const skip of [false, true]) {
  await page.evaluate((s) => { __inkwave._skipRender = s; }, skip);
  const a = await read(), w0 = Date.now();
  await page.waitForTimeout(20000);
  const b = await read(), w = (Date.now() - w0) / 1000;
  console.log(skip ? 'no drawing' : 'drawing', JSON.stringify({ wall: w, game: +(b.gt - a.gt).toFixed(2), ratio: +((b.gt - a.gt) / w).toFixed(3), ...b }));
}
await browser.close(); srv.close();
