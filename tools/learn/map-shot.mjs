// 游戏为主体 第二期 (docs/LEARN.md §34): the main menu in her App and the course map, the way her phone draws them — a fresh
// browser (no progress: today is w1d3, the two days before it todo, the rest locked), 390 × 844 at its real density
// (--dpr 3, an iPhone), then the map turned to 844 × 390 (the screen rebuilds on the turn). Prints each node's state and
// box (a thumb needs ≥ 44 px) and the gap from its ring to its label (≥ 2 px, LEARN §38), any horizontal overflow, the
// locked node's toast, and page errors.
//   node tools/learn/map-shot.mjs --out <dir> [--dpr 3] [--today w1d3]
// PNGs: <dir>/main-portrait.png, <dir>/map-portrait.png, <dir>/map-landscape.png
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');   // (NODE_PATH, as the audits)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('out', 'map-shots'), DPR = +opt('dpr', 3), TODAY = opt('today', 'w1d3');
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', woff2: 'font/woff2', ogg: 'audio/ogg', mp3: 'audio/mpeg', glb: 'model/gltf-binary', bin: 'application/octet-stream', ktx2: 'image/ktx2', wasm: 'application/wasm' };
const srv = http.createServer((q, r) => {
  let u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if (!u.startsWith('/game/')) { r.writeHead(404); return r.end(); }
  const p = path.join(ROOT, u.slice('/game'.length));
  if (u === '/game/songs/manifest.json' && !fs.existsSync(p)) { r.writeHead(200, { 'content-type': MIME.json }); return r.end('{ "tracks": {} }'); }
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(p).slice(1)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(p).pipe(r);
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${srv.address().port}/game/`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
fs.mkdirSync(OUT, { recursive: true });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
const page = await ctx.newPage(), errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const wait = (ms) => page.waitForTimeout(ms);
const probe = () => page.evaluate(() => {
  const vw = innerWidth, over = document.documentElement.scrollWidth > vw + 1;
  const nodes = [...document.querySelectorAll('.iw-cmap__node')].map((n) => {
    const r = n.getBoundingClientRect(), st = ['done', 'part', 'today', 'todo', 'locked'].find((s) => n.classList.contains('is-' + s));
    // (LEARN §38: the label hangs under the node's drawn ring — today's is drawn 1.14 × — gap = label top − ring bottom, px)
    const lb = n.querySelector('.iw-cmap__label').getBoundingClientRect(), rg = n.querySelector('.iw-cmap__ring').getBoundingClientRect();
    const ringOn = getComputedStyle(n.querySelector('.iw-cmap__ring')).display !== 'none';
    return { st, w: Math.round(r.width), x: Math.round(r.left), y: Math.round(r.top), out: r.left < 0 || r.right > vw, gap: ringOn ? +(lb.top - rg.bottom).toFixed(1) : null };
  });
  const sub = document.querySelector('.iw-btn--today .iw-btn__sub');
  const btns = [...document.querySelectorAll('.iw-main__menu .iw-btn')].map((b) => b.dataset.id);
  return { screen: __inkwave.menus && __inkwave.menus.current, over, btns, sub: sub && sub.textContent, nodes, weeksub: (document.querySelector('.iw-cmap__weeksub') || {}).textContent };
});
let code = 0;
try {
  await page.goto(base + `index.html?from=app&today=${TODAY}&skipTitle&nofullscreen`, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__inkwave && __inkwave.menus && __inkwave.menus.current === 'main' && document.querySelector('.iw-btn--today'), null, { timeout: 240000, polling: 250 });
  await page.evaluate(() => __inkwave.debug.freeze());   // (the 3D stage behind the menu holds its last frame: SwiftShader at dpr 3 is slow)
  await wait(2500);
  console.log('[map-shot] main', JSON.stringify(await probe()));
  await page.screenshot({ path: path.join(OUT, 'main-portrait.png'), timeout: 120000 });
  await page.evaluate(() => document.querySelector('.iw-btn[data-id="map"]').click());
  await page.waitForFunction(() => document.querySelectorAll('.iw-cmap__node').length === 8, null, { timeout: 20000, polling: 100 });
  await wait(2200);
  const p = await probe();
  console.log('[map-shot] map portrait', JSON.stringify(p));
  await page.screenshot({ path: path.join(OUT, 'map-portrait.png'), timeout: 120000 });
  // a locked node: the toast says why
  await page.evaluate(() => { const n = document.querySelector('.iw-cmap__node.is-locked'); n && n.click(); });
  await wait(400);
  console.log('[map-shot] locked tap', JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('.iw-toast__text')].map((t) => t.textContent))));
  await page.setViewportSize({ width: 844, height: 390 });
  await wait(2600);
  const l = await probe();
  console.log('[map-shot] map landscape', JSON.stringify(l));
  await page.screenshot({ path: path.join(OUT, 'map-landscape.png'), timeout: 120000 });
  for (const v of [p, l]) if (v.over || v.nodes.length !== 8 || v.nodes.some((n) => n.w < 44 || n.out || (n.gap != null && n.gap < 2))) code = 1;
} catch (e) { errs.push('run: ' + e.message); }
if (errs.length) { console.log('[map-shot] errors: ' + errs.join(' | ').slice(0, 600)); code = 1; }
await browser.close(); srv.close();
process.exit(code);
