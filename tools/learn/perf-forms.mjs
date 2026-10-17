// play-9 — PLAY §7's frame-time comparison for the runner, the duel and the boss (play-fix measured the puzzle: wire-audit
// --perf): main.js _frame's cost (sim + draw, every stepped frame drawn) sorted by what was on the stage that frame —
//   ask   a question's objects up (the duel's cluster / the boss's balls placed and not answered; the runner: a row's
//         curtains or a 滑行段's rig up)
//   walk  no question up and she is moving (the runner: swimming between rows; the duel / the boss: her stick held
//         forward — the audit's hand holds W while nothing is asked)
//   idle  the rest (not counted); a typed question or a booth ends the sample (short levels: the first ones are choices)
// → per bucket { n, p50, p95, max } and p95(ask) / p95(walk). SwiftShader numbers only compare two states on one box.
//   NODE_PATH=/opt/node22/lib/node_modules flock -w 9000 /tmp/ielts-browser.lock nice -n 10 node tools/learn/perf-forms.mjs \
//     --form runner|duel|boss [--view portrait|landscape] [--frames 600] [--out f.json]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const FORM = opt('form', 'duel'), VIEW = opt('view', 'portrait'), FRAMES = +opt('frames', 600), OUT = opt('out', null);
const Q = { runner: '?learn=w1d3&kind=race&short=1', duel: '?learn=w1d6&kind=duel&short=1', boss: '?learn=w1d7&kind=boss&short=1' }[FORM];
const V = VIEW === 'landscape' ? { w: 844, h: 390, app: false } : { w: 390, h: 844, app: true };
const T0 = Date.now(), say = (...a) => console.log(`[perf ${FORM} ${VIEW} ${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}]`, ...a);
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', woff2: 'font/woff2', mp3: 'audio/mpeg', ogg: 'audio/ogg', wasm: 'application/wasm', txt: 'text/plain; charset=utf-8' };
const srv = http.createServer((q, r) => {
  let u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if (!u.startsWith('/game/')) { r.writeHead(404); return r.end(); }
  u = u.slice('/game'.length);
  const p = path.join(ROOT, u);
  if (u === '/songs/manifest.json' && !fs.existsSync(p)) { r.writeHead(200, { 'content-type': MIME.json }); return r.end('{ "tracks": {} }'); }
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(p).slice(1)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(p).pipe(r);
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${srv.address().port}/game/`;
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const errs = [];
const watchdog = setTimeout(() => { say('WATCHDOG'); done(2, null); }, +opt('budget', 1500) * 1000);
async function done(code, rep) { clearTimeout(watchdog); if (OUT && rep) fs.writeFileSync(OUT, JSON.stringify(rep, null, 1)); try { await browser.close(); } catch (e) { /* gone */ } srv.close(); process.exit(code); }
process.on('unhandledRejection', (e) => { say('ERR', String(e && e.stack || e).slice(0, 600)); done(1, null); });

const ctx = await browser.newContext({ viewport: { width: V.w, height: V.h }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { const k = 'inkwave.settings', v = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(v, { shadows: false, bloom: false, touchControls: 'on' }); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* none */ } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 300)); });
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const q = Q + '&quality=low&nofullscreen&noclips' + (V.app ? '&from=app' : '');
say('open', q);
await page.goto(base + 'index.html' + q, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__inkwave && __inkwave.match && __inkwave.match.mode === 'learn' && __inkwave.match.learn, null, { timeout: 420000, polling: 250 });
// the sampler: every _frame's ms into the bucket of what the stage held that frame (no allocation in the game's loop: the
// arrays are the audit's)
await ev((form) => {
  const I = __inkwave, orig = I._frame.bind(I), B = window.__pf = { ask: [], walk: [], idle: [], on: false };
  const cls = () => {
    const F = I.match.learn, a = I.match.local; if (!F || !a) return 'idle';
    if (form === 'runner') { const r = F._shown && F._shown(); if (r && (r.kind === 'glide' ? F.glide && F.glide.active : r.kind !== 'boards' && r.state !== 'done')) return 'ask'; }
    else { const H = F.arena, C = H && H.m1 && H.m1.cur; if (H && H.kind === 'm1' && C && C.placed && !C.answered) return 'ask'; if (H && H.kind && H.kind !== 'm1' && H.kind !== 'prep' && F.asking) return 'busy'; }
    return Math.hypot(a.vel.x, a.vel.z) > 1 ? 'walk' : 'idle';
  };
  I._frame = (dt) => { const t = performance.now(); orig(dt); const ms = performance.now() - t; if (B.on && !I._skipRender) { const k = cls(); if (B[k]) B[k].push(ms); } };
  I.debug.freeze();
}, FORM);
const step = (ms = 16.7) => ev((m) => __inkwave.debug.step(m), ms);
for (let i = 0; i < 240; i++) { const st = await ev(() => __inkwave.match.state); if (st === 'playing') break; await step(250); }
say('playing');
// the duel's 备战 board 「开始」 / the runner's reading board 「出发」
if (FORM !== 'boss') { for (let i = 0; i < 40; i++) { const ok = await ev(() => { const b = document.querySelector('.iw-ps:not(.is-off) .iw-ps__act.is-primary'); if (b) { b.click(); return true; } return false; }); if (ok) break; await step(250); } }
// the boss: her hand keeps her ~9 m in front of it when a question waits for her (as arena-audit does)
const nearBoss = () => ev(() => {
  const m = __inkwave.match, b = m.boss, a = m.local, nav = __G.nav; if (!b || !a || !nav) return;
  const F = m.learn; if (!(F._nearSaid || (F.arena && F.arena.m1 && !F.arena.m1.bossNear()))) return;
  const Vc = a.pos.constructor, want = new Vc(b.pos.x + Math.sin(b.yaw) * 9, b.pos.y + 1, b.pos.z + Math.cos(b.yaw) * 9);
  const k = nav.nearest(want, 6, true); if (k < 0) return; const n = nav.nodes[k]; a.pos.set(n.x, n.y, n.z); a.vel.set(0, 0, 0);
});
await ev(() => { window.__pf.on = true; });
let answered = 0, walkT = 0;
for (let f = 0; f < FRAMES; f++) {
  // the arena: nothing asked → hold W (she runs: the walk bucket), and every few frames turn her a little (a wall stops a
  // straight run); a question placed → let go, wait ~1 s with it up, then answer it by hand (right) and go on
  if (FORM !== 'runner') {
    const s = await ev(() => { const F = __inkwave.match.learn, H = F.arena, C = H && H.m1 && H.m1.cur; return { ask: !!(H && H.kind === 'm1' && C && C.placed && !C.answered), other: !!(H && H.kind && H.kind !== 'm1' && H.kind !== 'prep' && F.asking), t: C ? C.t : 0, done: F.phase === 'done' || F.finishT >= 0 }; });
    if (s.done) break;
    if (s.ask) { await ev(() => __inkwave.debug.key('KeyW', false)); if (s.t > 1.6) { await ev(() => { const P = __inkwave.match.learn.arena.m1, d = P.debug(); P._answer(d.rightIndex); }); answered++; } }
    else if (s.other) { say('a typed question / a booth — the sample ends here'); break; }
    else { await ev((t) => { __inkwave.debug.key('KeyW', true); if (t % 90 === 0 && __inkwave.rig) __inkwave.rig.yaw += 0.9; }, walkT++); if (FORM === 'boss' && f % 30 === 0) await nearBoss(); }
  }
  await step(16.7);
}
const rep = await ev(() => {
  const B = window.__pf, q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.max(0, Math.ceil(p * s.length) - 1))].toFixed(2) : null; };
  const st = (a) => ({ n: a.length, p50: q(a, 0.5), p95: q(a, 0.95), max: a.length ? +Math.max(...a).toFixed(1) : null });
  return { ask: st(B.ask), walk: st(B.walk), idle: st(B.idle), calls: __G.renderer.info.render.calls };
});
rep.ratio = rep.ask.p95 && rep.walk.p95 ? +(rep.ask.p95 / rep.walk.p95).toFixed(3) : null;
rep.form = FORM; rep.view = VIEW; rep.answered = answered; rep.errors = errs;
say('result', JSON.stringify(rep));
await done(errs.length ? 1 : 0, rep);
