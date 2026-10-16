// 墨浪跑酷 browser audit (docs/LEARN.md §20). Serves this checkout, opens the game in Chromium (software GL works:
// SwiftShader args), and runs one of:
//   --scenario runner  ?learn=<day>&kind=runner: tools/learn/runner-drive.js rows (wrong, right, none, right … by
//                      default) through the real inputs; screenshots of rows (--shots <dir>, --shotRows 1,3);
//                      the PLAY §1 invariants per row, evidence leaves, coral / slow, no-answer = nothing written
//   --scenario forms   the existing race audit: tools/learn/drive-forms.js on ?kind=race&short=1&fast=1 (race.js unchanged)
//   --scenario perf    frame-time sampler: the runner vs the race vs a plain turf match on the same stage, real-time loop (not stepped), the
//                      cost of each _frame call (sim + render) → p50 / p95 / max, after `state === 'playing'` for 3 s
// Every run fails on a console error, a page error or a 4xx / failed request (the dev error beacon /__inkwave_error/… is
// answered 204 and its message reported).
// usage (one browser at a time on a shared box):
//   flock -w 9000 /tmp/ielts-browser.lock nice -n 10 node tools/learn/runner-audit.mjs --scenario runner --w 390 --h 844 --touch \
//     --query '?learn=w1d3&kind=runner&short=1' --shots /tmp/shots --out /tmp/run.json
// NODE_PATH must reach playwright (CommonJS); CHROMIUM_PATH (default /opt/pw-browsers/chromium) the browser.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const flag = (k) => args.includes('--' + k);
const SCEN = opt('scenario', 'runner'), Wd = +opt('w', 1280), Ht = +opt('h', 720), TOUCH = flag('touch'), DPR = +opt('dpr', 1);
const SHOTS = opt('shots', null), OUT = opt('out', null), SHOT_ROWS = (opt('shotRows', '1') || '').split(',').filter(Boolean).map(Number);
const PLAN = opt('plan', null), MAXROWS = +opt('maxRows', 0), PERF_S = +opt('perfSeconds', 40);
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', woff2: 'font/woff2', wasm: 'application/wasm', txt: 'text/plain; charset=utf-8', ico: 'image/x-icon', mp3: 'audio/mpeg', ogg: 'audio/ogg', glb: 'model/gltf-binary', bin: 'application/octet-stream' };
const beacons = [];
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if (u.startsWith('/__inkwave_error/')) { beacons.push(u.slice(17, 300)); r.writeHead(204); return r.end(); }   // the dev beacon
  const p = path.join(ROOT, u === '/' ? '/index.html' : u);
  // songs/manifest.json is generated (`npm run music`, not in git): without one, no recordings — the synth score plays
  if (u === '/songs/manifest.json' && !fs.existsSync(p)) { r.writeHead(200, { 'content-type': 'application/json' }); return r.end('{"tracks":{}}'); }
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(p).slice(1)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(p).pipe(r);
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${srv.address().port}/`;
const { chromium } = createRequire(import.meta.url)('playwright');
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const kill = () => { try { browser.close(); } catch (e) { /* gone */ } try { srv.close(); } catch (e) { /* gone */ } };
const watchdog = setTimeout(() => { console.log('runner-audit WATCHDOG'); kill(); process.exit(2); }, +opt('timeout', 1500) * 1000); watchdog.unref?.();
const out = { scenario: SCEN, viewport: `${Wd}x${Ht}${TOUCH ? ' touch' : ''}`, runs: [] };
const bad = [], errs = [];

async function open(query, learn = true) {
  const ctx = await browser.newContext({ viewport: { width: Wd, height: Ht }, deviceScaleFactor: DPR, isMobile: TOUCH, hasTouch: TOUCH });
  await ctx.addInitScript(([touch]) => { try { const k = 'inkwave.settings', v = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(v, { shadows: false, bloom: false, touchControls: touch ? 'on' : 'off', quality: 'low', qualityChosen: true, shadowsChosen: true }); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* none */ } }, [TOUCH]);
  const page = await ctx.newPage();
  page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().replace(base, '/')); });
  page.on('requestfailed', (r) => { const u = r.url(); if (!u.includes('/__inkwave_error/')) bad.push('FAILED ' + u.replace(base, '/') + ' ' + ((r.failure() || {}).errorText || '')); });
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 300)); else if (process.env.RUNLOG && m.text().startsWith('[run]')) console.log(m.text()); });
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message.slice(0, 300)));
  const t0 = Date.now();
  await page.goto(base + 'index.html' + query, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction((learn) => window.__inkwave && __inkwave.match && !__inkwave.match.attract && (!learn || (__inkwave.match.mode === 'learn' && __inkwave.match.learn)), learn, { timeout: 420000, polling: 250 });
  if (process.env.RUNLOG) console.log('[run] level built after', ((Date.now() - t0) / 1000).toFixed(1), 's');
  return { ctx, page, bootS: +((Date.now() - t0) / 1000).toFixed(1) };
}

async function scenarioRunner() {
  const q = opt('query', '?learn=w1d3&kind=runner&short=1') + '&quality=low&nofullscreen';
  const { ctx, page, bootS } = await open(q);
  // the plan per row, a row cap, and which rows (1-based, in the order they come up) get a screenshot
  await page.evaluate(([plan, maxRows, rows, after]) => {
    if (after) window.__runShotAfter = true;
    if (plan) window.__runPlan = plan.split(',');
    if (maxRows) window.__runMaxRows = maxRows;
    const want = new Set(rows); let seen = 0; window.__runShots = () => want.has(++seen);
  }, [PLAN, MAXROWS, SHOTS ? SHOT_ROWS : [], SHOTS && flag('shotAfter')]);
  const drive = fs.readFileSync(path.join(ROOT, 'tools/learn/runner-drive.js'), 'utf8');
  let res, k = 0;
  for (;;) {
    res = JSON.parse(await page.evaluate(drive));
    if (!res.shot) break;
    const file = path.join(SHOTS, `runner-${Wd}x${Ht}-${res.shot}.png`);
    fs.mkdirSync(SHOTS, { recursive: true });
    await page.screenshot({ path: file });
    const ui = await page.evaluate(() => { const r = (s) => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return b.width ? [Math.round(b.left), Math.round(b.top), Math.round(b.width), Math.round(b.height)] : null; }; return { strip: r('.iw-run__strip.is-on'), play: r('.iw-run__play'), rotate: r('.iw-run__rotate.is-on'), q: (document.querySelector('.iw-run__q') || {}).textContent, fontQ: getComputedStyle(document.querySelector('.iw-run__q')).fontSize }; });
    console.log('shot', file, JSON.stringify({ row: res.row, ui, dbg: { s: res.dbg.s, lat: res.dbg.lat, d: res.dbg.d, speed: res.dbg.speed, row: res.dbg.row } }));
    if (++k > 8) break;
  }
  if (SHOTS && flag('finalShot')) {   // the end: the results card over the finished run
    const file = path.join(SHOTS, `runner-${Wd}x${Ht}-end.png`);
    await page.screenshot({ path: file }); console.log('shot', file);
  }
  out.runs.push({ query: q, bootS, ...res });
  await ctx.close();
}

async function scenarioForms() {
  const q = opt('query', '?learn=w1d2&kind=race&short=1&fast=1') + '&quality=low&nofullscreen';
  const { ctx, page, bootS } = await open(q);
  const drive = fs.readFileSync(path.join(ROOT, 'tools/learn/drive-forms.js'), 'utf8');
  const res = JSON.parse(await page.evaluate(drive));
  out.runs.push({ query: q, bootS, ...res });
  await ctx.close();
}

// Frame time in real time (the loop not stepped), after the level is under way: the start board pressed, the sim run
// on (frozen, without the renderer) to a busy moment — for the runner the first row up on the road — then sampled for
// `perfSeconds` of wall clock. Two numbers: the interval between frames (requestAnimationFrame: the whole frame, the
// software renderer included — on this box that is what dominates) and the cost of the game's own _frame call (the
// simulation plus issuing the draw). SwiftShader numbers compare the three runs with each other, not with a phone.
async function sample(query, label, prepSrc, learn = true) {
  const { ctx, page, bootS } = await open(query + '&quality=low&nofullscreen', learn);
  await page.waitForFunction(() => __inkwave.match.state === 'playing', null, { timeout: 300000, polling: 250 });
  const prep = prepSrc ? await page.evaluate(prepSrc) : null;
  const r = await page.evaluate(async (secs) => {
    const I = window.__inkwave, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const ft = [], orig = I._frame.bind(I);
    I._frame = (dt) => { const t = performance.now(); orig(dt); ft.push(performance.now() - t); };
    const raf = []; let last = performance.now(), on = true;
    const tick = (t) => { raf.push(t - last); last = t; if (on) requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    await sleep(secs * 1000); on = false; I._frame = orig;
    const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s.length ? +s[Math.min(s.length - 1, Math.floor(p * (s.length - 1)))].toFixed(1) : null; };
    raf.splice(0, 2); ft.splice(0, 2);   // (the first frames after the fast-forward carry its uploads)
    const F = I.match.learn, d = F && F.debug ? F.debug() : {};
    return { actors: I.match.actors.length, frames: ft.length, frameP50: q(ft, 0.5), frameP95: q(ft, 0.95), frameMax: +Math.max(...ft).toFixed(1), rafP50: q(raf, 0.5), rafP95: q(raf, 0.95), calls: I.perf && I.perf.calls, tris: I.perf && I.perf.tris, rowShown: !!(d.row), s: d.s, paused: I.match.paused, stage: I.mapDef.id };
  }, PERF_S);
  await ctx.close();
  return { label, query, bootS, prep, ...r };
}
// (each prep: press 出发 / 走 while a board is up, then run the sim on — frozen, no renderer — to the busy moment)
const FF = `const I = window.__inkwave, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const ff = (sec) => { I.debug.freeze(); I._skipRender = true; try { for (let i = 0; i < Math.round(sec * 30); i++) I._frame(1 / 30); } finally { I._skipRender = false; I.debug.unfreeze(); } };
  const board = async () => { for (let i = 0; i < 40; i++) { const go = document.querySelector('.iw-lf__board.is-on .iw-lf__go'); if (go) go.click(); else if (i > 2) break; await sleep(400); } };`;
async function scenarioPerf() {
  const day = opt('day', 'w1d3');
  const runner = await sample(`?learn=${day}&kind=runner`, 'runner', `(async () => { ${FF} await board(); const F = I.match.learn; let k = 0; while (!F._shown() && k++ < 40) ff(0.5); ff(0.6); return { s: +F.sNow.toFixed(1), row: !!F._shown(), started: F.started }; })()`);
  // (the race walking to its first gate: at the gate its card holds the match, which is not a frame to compare)
  const race = await sample(`?learn=${day}&kind=race`, 'race', `(async () => { ${FF} await board(); const F = I.match.learn; F.autoWalk && F.autoWalk(true); return { phase: F.phase, cur: F.cur }; })()`);
  // and a plain INKWAVE match (turf, 4 v 4 bots) on the same stage, a few seconds into the fight
  const turf = await sample(`?autostart=180&map=${runner.stage}`, 'turf 4v4', `(async () => { ${FF} ff(6); return { t: +I.match.time.toFixed(1) }; })()`, false);
  out.runs.push(runner, race, turf);
}

try {
  if (SCEN === 'runner') await scenarioRunner();
  else if (SCEN === 'forms') await scenarioForms();
  else if (SCEN === 'perf') await scenarioPerf();
} catch (e) { errs.push('[harness] ' + (e && e.stack || e).toString().slice(0, 400)); }
out.bad = bad; out.errors = errs; out.beacons = beacons.slice(0, 10);
const txt = JSON.stringify(out, null, 1);
if (OUT) fs.writeFileSync(OUT, txt);
console.log(txt.length > 20000 ? txt.slice(0, 20000) + '\n…(' + txt.length + ' chars, full in --out)' : txt);
console.log('4xx/failed:', bad.length, '· errors:', errs.length);
kill();
process.exit(bad.length || errs.length ? 1 : 0);
