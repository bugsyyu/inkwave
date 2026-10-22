// Visual parity (the owner, 10-17: 「画风和精致度和精细程度和原版游戏一样，丝滑 高清」): INKWAVE's own match drawn the way her
// phone draws it — a 390 × 844 / 844 × 390 screen at its real density (--dpr 3, an iPhone), the touch defaults left alone
// (quality and shadows as a phone picks them; --quality pins a tier) — so the learning levels' shots (runner-audit /
// arena-audit / wire-audit with the same --dpr) can be laid next to the original game's and compared detail for detail.
//   node tools/learn/parity-shots.mjs --out <dir> [--dpr 3] [--views landscape,portrait] [--quality high] [--secs 8] [--native iphone16]
// --native <device>: her App's page as the App leaves it (a made-up window.__IELTS_NATIVE with display / device, no message
// handlers, so nothing is ever posted to a native side) plus &applegpu — the render step that device gets (src/core/render-gov.js).
// --probe (with --native): after the shot, 显示帧率 on until the readout shows (≤ 40 s: 「N 帧 · 第 S 档 · R/C 级 · D× · P MP」 over
// 「间隔 … · JS … · 稳 60 · …」, LEARN §50), then a made-up 'power' event (thermal serious) through window.__iwNative.on — the
// game should hold 60 at once and drop to the rung below its start (held there while hot).
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
const NATIVE = {
  iphone16: { platform: 'ios', display: { maxFps: 120, highRefresh: true }, device: { model: 'iPhone16,1', memGB: 8, cores: 6 } },
  iphone15: { platform: 'ios', display: { maxFps: 60, highRefresh: false }, device: { model: 'iPhone15,4', memGB: 6, cores: 6 } },
  iphone12: { platform: 'ios', display: { maxFps: 60, highRefresh: false }, device: { model: 'iPhone13,2', memGB: 4, cores: 6 } },
};
const NAT = NATIVE[opt('native', '')] || null, PROBE = NAT && args.includes('--probe');
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
  // (window.__iwNative as index.html keeps it for ?from=app — without from=app's back-to-the-lesson timer)
  if (NAT) await page.addInitScript((n) => { window.__IELTS_NATIVE = n; window.__iwNative = { power: null, events: [] }; }, NAT);
  page.on('pageerror', (e) => errs.push(e.message));
  const q = `?autostart=180&nofullscreen` + (QUAL ? `&quality=${QUAL}` : '') + (NAT ? '&applegpu' : '');
  await page.goto(base + 'index.html' + q, { waitUntil: 'load', timeout: 180000 });
  // (and the stage's warm-up done: until then the black fade is still over it — a shot taken then is one flat colour)
  await page.waitForFunction(() => window.__inkwave && __inkwave.match && __inkwave.match.state === 'playing' && !__inkwave._warming, null, { timeout: 900000, polling: 250 }).catch(() => errs.push('never playing'));
  await page.evaluate(() => __inkwave.debug.freeze());
  for (let s = 0; s < SECS * 2; s++) await page.evaluate(() => __inkwave.debug.step(500));
  const info = await page.evaluate(() => { const R = __inkwave.R, cv = R && R.renderer && R.renderer.domElement; const q = (R && R.q) || {}; return { quality: __inkwave.settings.quality, shadows: __inkwave.settings.shadows, pr: R && R.renderer.getPixelRatio(), buf: cv ? cv.width + 'x' + cv.height : '', dpr: devicePixelRatio, touch: !!__inkwave.touchMode, step: q.step, density: q.pixelRatio, ao: !!(R && R.gtao), bloom: !!(R && R.bloom && R.bloom.enabled), shadowMap: !!(R && R.renderer.shadowMap.enabled), shadowSize: q.shadowSize, particles: q.particles }; });
  const f = path.join(OUT, `original-${vn}${QUAL ? '-' + QUAL : ''}${NAT ? '-' + opt('native') : ''}.png`);
  await page.screenshot({ path: f, timeout: 300000 });   // (SwiftShader at 3×: a frame can take longer than the 30 s default)
  console.log(`[parity] ${vn} ${JSON.stringify(info)} → ${f}${errs.length ? ' · errors: ' + errs.join(' | ').slice(0, 300) : ''}`);
  if (PROBE) {
    const pb = await page.evaluate(async () => {
      const g = __inkwave, R = g.R, o = {};
      g.settings.showFps = true; g.debug.unfreeze();
      // (the readout is made every 0.5 s of frames; SwiftShader at 2.5× with the full post stack takes seconds a frame — a fixed
      // 3 s wait saw only the stale rate: wait for the readout itself, up to 40 s)
      for (let t = 0; t < 40 && !g.fpsNote; t++) await new Promise((r) => setTimeout(r, 1000));
      o.note = g.fpsNote; o.hud = (document.querySelector('.iw-fps') || {}).textContent;
      const L = g.live;
      o.before = { cap: g._autoCap || 0, pr: R.renderer.getPixelRatio(), rung: L ? L.rung : null };
      const N = window.__iwNative; N.power = { lowPower: false, thermal: 'serious' }; N.on({ type: 'power' });
      o.after = { cap: g._autoCap, pr: R.renderer.getPixelRatio(), live: L ? { hot: L.hot, rung: L.rung, start: L.start, why: L.why } : null };
      g.settings.showFps = false;
      return o;
    });
    console.log(`[parity] probe ${JSON.stringify(pb)}`);
    const lv = pb.after.live;
    if (!(pb.after.cap === 60 && lv && lv.hot && lv.why === 'hot' && lv.rung <= Math.max(0, lv.start - 1)
      && /^\d+ 帧 · 第 \d 档 · \d\/\d 级 · [\d.]+× · [\d.]+ MP\n间隔 [\d.]+ \/ [\d.]+ ms · JS [\d.]+ ms · (稳 60|120)/.test(pb.note || ''))) { code = 1; console.log('[parity] probe FAIL'); }
  }
  if (errs.length) code = 1;
  await ctx.close();
}
await browser.close(); srv.close();
process.exit(code);
