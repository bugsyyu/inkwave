// probe: 第 2 周第 3 天（解密闯关），iPhone 竖屏触屏，点「自动走」走到第 2 道门前的讲解板，然后真的去点「读全文」和地图。
// node board-stuck.mjs <app 目录> <截图目录> [gate]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const APP = path.resolve(process.argv[2]), SHOTS = process.argv[3], GATE = process.argv[4] || "2", W0 = +(process.argv[5] || 393), H0 = +(process.argv[6] || 852);
fs.mkdirSync(SHOTS, { recursive: true });
const MIME = { html: 'text/html', js: 'text/javascript', mjs: 'text/javascript', css: 'text/css', json: 'application/json', png: 'image/png', jpg: 'image/jpeg', webp: 'image/webp', ktx2: 'image/ktx2', glb: 'model/gltf-binary', mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', woff2: 'font/woff2', svg: 'image/svg+xml', bin: 'application/octet-stream', wasm: 'application/wasm' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  const p = path.join(APP, u);
  if (!p.startsWith(APP) || /my-progress/.test(p) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(p).slice(1)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(p).pipe(r);
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${srv.address().port}/`;
const say = (...a) => console.log('[probe]', ...a);
const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: W0, height: H0 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { const k = 'inkwave.settings', v = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(v, { shadows: false, bloom: false, touchControls: 'on' }); localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} });
const page = await ctx.newPage();
const errs = [];
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push('[' + m.type() + '] ' + m.text().slice(0, 300)); });
page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message + ' ' + String(e.stack || '').split('\n').slice(1, 3).join(' | ')));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const q = `index.html?learn=w2d3&kind=puzzle&gate=${GATE}&from=app&quality=low&nofullscreen&noclips`;
say('open', q);
const t0 = Date.now();
await page.goto(base + q, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__inkwave && __inkwave.match && __inkwave.match.mode === 'learn' && __inkwave.match.state === 'playing' && __inkwave.match.learn, null, { timeout: 600000, polling: 500 });
say('playing after', Math.round((Date.now() - t0) / 1000), 's');
const state = () => ev(() => {
  const F = __inkwave.match.learn, H = F.play, B = H && H.boards, W = B && B.walk;
  const vis = (sel) => { const e = document.querySelector(sel); if (!e) return null; const cs = getComputedStyle(e), r = e.getBoundingClientRect(); return { vis: cs.visibility, op: cs.opacity, disp: cs.display, r: [r.left, r.top, r.width, r.height].map(Math.round) }; };
  return { phase: F.phase, cur: F.cur, gates: F.gates.length, auto: F.auto, kind: H && H.kind, asking: !!F.asking, framed: W ? W.framed : null, q: W ? W.questionUp : null, strip: W ? W.strip.isOpen : null,
    learnCls: (document.querySelector('.iw-learn') || {}).className, walk: vis('.iw-learn__walk'), autoBtn: vis('.iw-learn__auto'), paused: __inkwave.match.paused, menu: __inkwave.menus && __inkwave.menus.current,
    playTap: !!__G.playTap, map: __inkwave.input && __inkwave.input.touch ? __inkwave.input.touch.map : null };
});
say('start', JSON.stringify(await state()));
await page.screenshot({ path: path.join(SHOTS, '0-start.png') });
// her way on: the 自动走 button, a real tap
const tapSel = async (sel) => { const b = await page.$(sel); if (!b) return false; const r = await b.boundingBox(); if (!r) return false; await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height / 2); return true; };
say('tap 自动走', await tapSel('.iw-learn__auto'));
let s = null;
for (let i = 0; i < 240; i++) {   // up to ~4 min of real time
  await page.waitForTimeout(1000);
  s = await state();
  if (i % 10 === 0) say('walk', i, JSON.stringify(s).slice(0, 400));
  if (s.framed >= 0 && !s.auto) break;
  if (s.asking) { say('a question came up first', JSON.stringify(s)); break; }
}
say('at the board', JSON.stringify(s));
await page.waitForTimeout(2500);
s = await state();
say('after 2.5 s at the board', JSON.stringify(s));
await page.screenshot({ path: path.join(SHOTS, '1-board.png') });
// the board's hotspots on screen
const hot = await ev(() => { const W = __inkwave.match.learn.play.boards.walk; if (W.framed < 0) return null; const b = W.list[W.framed].b; return W.set.project(b, __G.camera, innerWidth, innerHeight).map((h) => ({ id: h.id, rect: h.rect })); });
say('hotspots', JSON.stringify(hot));
const more = hot && hot.find((h) => h.id === 'more');
if (more) {
  const R = more.rect, x = (R.x !== undefined ? R.x + R.w / 2 : (R[0] + R[2]) / 2), y = (R.y !== undefined ? R.y + R.h / 2 : (R[1] + R[3]) / 2);
  say('tap 读全文 at', x, y);
  await page.touchscreen.tap(x, y);
  await page.waitForTimeout(1500);
  s = await state();
  say('after 读全文', JSON.stringify(s));
  await page.screenshot({ path: path.join(SHOTS, '2-more.png') });
}
// the 地图 button (touch layer) and the corner
const mapBtn = await ev(() => { const bs = [...document.querySelectorAll('.iw-touch__btn')]; return bs.map((e) => { const r = e.getBoundingClientRect(), cs = getComputedStyle(e); return { t: e.textContent.trim(), r: [r.left, r.top, r.width, r.height].map(Math.round), disp: cs.display, vis: cs.visibility }; }); });
say('touch buttons', JSON.stringify(mapBtn));
const m = mapBtn.find((b) => b.t === '地图' && b.disp !== 'none');
if (m) { await page.touchscreen.tap(m.r[0] + m.r[2] / 2, m.r[1] + m.r[3] / 2); await page.waitForTimeout(1200); say('after 地图', JSON.stringify(await state())); await page.screenshot({ path: path.join(SHOTS, '3-map.png') }); }
say('errors', errs.length, JSON.stringify(errs.slice(0, 20)));
await browser.close();
srv.close();
