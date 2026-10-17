// Visual parity (the owner, 10-17: 「画风和精致度和精细程度和原版游戏一样，丝滑 高清」): INKWAVE's own match drawn the way her
// phone draws it — a 390 × 844 / 844 × 390 screen at its real density (--dpr 3, an iPhone), the touch defaults left alone
// (quality and shadows as a phone picks them; --quality pins a tier) — so the learning levels' shots (runner-audit /
// arena-audit / wire-audit with the same --dpr) can be laid next to the original game's and compared detail for detail.
//   node tools/learn/parity-shots.mjs --out <dir> [--dpr 3] [--views landscape,portrait] [--quality high] [--secs 8]
// One PNG per view: <dir>/original-<view>[-<quality>].png, after --secs of play (the bots ink the stage).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');   // (NODE_PATH, as the audits)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('out', 'parity'), DPR = +opt('dpr', 3), QUAL = opt('quality', ''), SECS = +opt('secs', 8);
const VIEWS = { portrait: { w: 390, h: 844 }, landscape: { w: 844, h: 390 } };
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
let code = 0;
for (const vn of opt('views', 'landscape,portrait').split(',')) {
  const V = VIEWS[vn]; if (!V) continue;
  const ctx = await browser.newContext({ viewport: { width: V.w, height: V.h }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(), errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  const q = `?autostart=180&nofullscreen` + (QUAL ? `&quality=${QUAL}` : '');
  await page.goto(base + 'index.html' + q, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__inkwave && __inkwave.match && __inkwave.match.state === 'playing', null, { timeout: 240000, polling: 250 }).catch(() => errs.push('never playing'));
  await page.evaluate(() => __inkwave.debug.freeze());
  for (let s = 0; s < SECS * 2; s++) await page.evaluate(() => __inkwave.debug.step(500));
  const info = await page.evaluate(() => { const R = __inkwave.R, cv = R && R.renderer && R.renderer.domElement; return { quality: __inkwave.settings.quality, shadows: __inkwave.settings.shadows, pr: R && R.renderer.getPixelRatio(), buf: cv ? cv.width + 'x' + cv.height : '', dpr: devicePixelRatio, touch: !!__inkwave.touchMode }; });
  const f = path.join(OUT, `original-${vn}${QUAL ? '-' + QUAL : ''}.png`);
  await page.screenshot({ path: f });
  console.log(`[parity] ${vn} ${JSON.stringify(info)} → ${f}${errs.length ? ' · errors: ' + errs.join(' | ').slice(0, 300) : ''}`);
  if (errs.length) code = 1;
  await ctx.close();
}
await browser.close(); srv.close();
process.exit(code);
