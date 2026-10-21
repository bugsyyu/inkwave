// 只用屏幕上的按钮走一关（LEARN §48，wf-softlock）: a level walked the way she walks it on her phone — real touch taps on
// what the screen shows (page.touchscreen.tap on an element's centre, on a board hotspot's projection, on a question
// object), the game on its own clock (no debug.freeze / step, no autoWalk / _open / any other shortcut: the audit only
// reads the page to know where to tap and what the right answer is). Once a second (wall clock) it samples the way-on
// rule: while she is not answering (no question up — the strip / a station is the question's), the screen shows a way on
// she can see and tap — the walk bar's 「自动走」, a framed board's 「继续」, the strip's primary action (备战's 「开始这一轮」)
// — at least 44 × 44 px, inside the safe area (insets injected: a headless page has no notch), not under another element
// nor a touch key. No way on for more than 3 s of the level's own clock (a software-GL frame takes a while: game time is
// what her phone would show) → FAIL, a screenshot and the state. A level that moves on by itself (the runner's ink, a duel
// round, the boss fight) must not stand still for more than 15 s of its clock either.
// Software GL draws a frame of a stage like terraces in ~1.5 s here (640 k triangles): drawing, the level would run at 3 %
// of her speed. So the page draws nothing (main.js _skipRender: the simulation, the HUD and the touch layer run as on her
// phone — what this audit checks — the canvas just keeps its last picture) except two frames before each screenshot;
// --draw draws every frame.
//
//   node tools/learn/tap-walk.mjs --learn w2d3 [--kind puzzle|race|duel|review|boss] [--view portrait|landscape]
//        [--gate N] [--short] [--until gate:N | exit | done] [--budget 900] [--shots <dir>] [--out <file>]
//        [--cpu 4] (CDP CPU throttling) [--dpr 1] [--no-inset] [--more] (tap 「看全文」 on every board that has it, not
//        only the first) [--keep] (go on after a FAIL: the run then reports every stuck stretch it met) [--draw]
//   views: portrait 390 × 844 (her App: ?from=app, insets top 59 / bottom 34 — a Dynamic Island iPhone), landscape
//   844 × 390 (?from=app turned: insets left / right 59, bottom 21); both touch, isMobile.
// Run browsers one at a time: flock -w 9000 /tmp/ielts-browser.lock nice -n 10 node tools/learn/tap-walk.mjs …
// (NODE_PATH must reach playwright; Playwright finds its own Chromium)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const has = (k) => args.includes('--' + k);
const LEARN_Q = opt('learn', 'w2d3'), KIND = opt('kind', 'puzzle'), VIEW = opt('view', 'portrait'), GATE = +opt('gate', 0), SHORT = has('short');
const UNTIL = opt('until', 'done'), BUDGET = +opt('budget', 900) * 1000, SHOTS = opt('shots', null), OUT = opt('out', null), CPU = +opt('cpu', 0), DPR = +opt('dpr', 1);
const KEEP = has('keep'), MORE_ALL = has('more'), LIMIT_S = 3, DRAW = has('draw');
const VIEWS = {
  portrait: { w: 390, h: 844, inset: { t: 59, r: 0, b: 34, l: 0 } },
  landscape: { w: 844, h: 390, inset: { t: 0, r: 59, b: 21, l: 59 } },
};
const V = VIEWS[VIEW] || VIEWS.portrait;
const INSET = has('no-inset') ? { t: 0, r: 0, b: 0, l: 0 } : V.inset;
const T0 = Date.now();
const tag = `${LEARN_Q}-${KIND}-${VIEW}${GATE ? '-g' + GATE : ''}`;
const say = (...a) => console.log(`[tap-walk ${tag} ${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------------------------------------ the page
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', woff2: 'font/woff2', mp3: 'audio/mpeg', ogg: 'audio/ogg', wasm: 'application/wasm', txt: 'text/plain; charset=utf-8', glb: 'model/gltf-binary', bin: 'application/octet-stream', ktx2: 'image/ktx2' };
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
const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: V.w, height: V.h }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { const k = 'inkwave.settings', v = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(v, { shadows: false, bloom: false, touchControls: 'on' }); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* none */ } });
// the iPhone's insets: a headless page has none, so the page's own variables (styles/hud.css --iw-sat …) are set here
await ctx.addInitScript((I) => {
  const put = () => { const s = document.createElement('style'); s.id = 'tap-walk-inset'; s.textContent = `html { --iw-sat: ${I.t}px !important; --iw-sar: ${I.r}px !important; --iw-sab: ${I.b}px !important; --iw-sal: ${I.l}px !important; }`; (document.head || document.documentElement).appendChild(s); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', put); else put();
  // long tasks, for the perf notes (LEARN §48 item 6)
  try { window.__lt = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lt.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask', buffered: true }); } catch (e) { /* none */ }
}, INSET);
const page = await ctx.newPage();
const errs = [], bad = [];
page.on('response', (r) => { if (r.status() >= 400 && !/manifest\.json|audio\/index\.json/.test(r.url())) bad.push(r.status() + ' ' + r.url().replace(base, '/game/')); });
page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 300)); });
page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message + ' ' + String(e.stack || '').split('\n').slice(1, 3).join(' | ')));
if (CPU > 1) { const cdp = await ctx.newCDPSession(page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU }); say('CPU throttled', CPU + '×'); }
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const report = { learn: LEARN_Q, kind: KIND, view: VIEW, size: `${V.w}x${V.h}`, inset: INSET, gate: GATE, short: SHORT, samples: 0, noWay: [], fails: [], taps: [], questions: [], boards: [], more: [], maxNoWay: { game: 0, wall: 0 } };
const fail = (what, detail) => { report.fails.push({ what, detail }); say('FAIL', what, detail ? JSON.stringify(detail).slice(0, 900) : ''); };
let shotN = 0;
async function shot(name) {
  if (!SHOTS) return null;
  fs.mkdirSync(SHOTS, { recursive: true });
  const f = path.join(SHOTS, `${tag}-${String(++shotN).padStart(2, '0')}-${name}.png`);
  // (not drawing: two frames drawn for the picture, by the page's own loop)
  if (!DRAW) await ev(() => new Promise((r) => { __inkwave._skipRender = false; requestAnimationFrame(() => requestAnimationFrame(() => { __inkwave._skipRender = true; r(); })); }));
  try { await page.screenshot({ path: f, timeout: 120000 }); say('shot', f); return f; } catch (e) { say('shot failed', e.message); return null; }
}
const watchdog = setTimeout(() => { fail('out of budget', { budget: BUDGET / 1000 }); finish(2); }, BUDGET);
let finishing = false;
async function finish(code) {
  if (finishing) return; finishing = true;
  clearTimeout(watchdog);
  try { report.end = await sample(); } catch (e) { /* gone */ }
  try { report.longTasks = await ev(() => { const L = window.__lt || []; return { n: L.length, over200: L.filter((x) => x[1] > 200).length, max: L.reduce((m, x) => Math.max(m, x[1]), 0) }; }); } catch (e) { /* gone */ }
  report.errors = errs; report.badResponses = bad;
  if (OUT) try { fs.writeFileSync(OUT, JSON.stringify(report, null, 1)); } catch (e) { say('could not write', OUT); }
  const fails = report.fails.length;
  console.log('\n[tap-walk] REPORT ' + JSON.stringify({ ...report, end: undefined }).slice(0, 6000));
  console.log(`[tap-walk] ${tag}: ${fails ? fails + ' FAILED' : 'all checks passed'} · samples ${report.samples} · longest stretch with no way on ${report.maxNoWay.game.toFixed(1)} s game / ${report.maxNoWay.wall.toFixed(1)} s wall · taps ${report.taps.length} · questions ${report.questions.length} · errors ${errs.length} · 4xx ${bad.length}`);
  try { await browser.close(); } catch (e) { /* gone */ }
  srv.close();
  process.exit(code != null ? code : (fails || errs.length ? 1 : 0));
}
process.on('unhandledRejection', (e) => { fail('driver error', String((e && e.stack) || e).slice(0, 600)); finish(1); });

// ------------------------------------------------------------------------------------------------ boot
const query = `?learn=${LEARN_Q}&kind=${KIND}${SHORT ? '&short=1' : ''}${GATE ? '&gate=' + GATE : ''}&from=app&quality=low&nofullscreen&noclips`;
say('open', query, 'insets', JSON.stringify(INSET));
await page.goto(base + 'index.html' + query, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__inkwave && __inkwave.match && __inkwave.match.mode === 'learn' && __inkwave.match.state === 'playing' && __inkwave.match.learn, null, { timeout: 600000, polling: 500 });
report.boot = { s: +((Date.now() - T0) / 1000).toFixed(1) };
if (!DRAW) await ev(() => { __inkwave._skipRender = true; });
report.draw = DRAW;
say('playing', DRAW ? '(drawing every frame)' : '(not drawing: the simulation and the DOM only)');

// ------------------------------------------------------------------------------------------------ what the screen shows
// one sample: the level's clock and phase, whether she is answering, and every way on the screen offers with its checks
const sample = () => ev((I) => {
  const M = __inkwave.match, F = M && M.learn; if (!F) return { gone: true };
  const form = F.constructor && F.constructor.name;
  const H = F.play || F.arena || null, d = H && H.debug ? H.debug() : null;
  const S = d && d.mechanic && d.mechanic !== 'm1' ? d.station : null;
  const a = M.local;
  // answering: a question's station / objects are up (the strip carries it), or its verdict is still on; the runner's row
  // or 滑行段. (The duel's 备战 and the boss's 回声亭 are not questions here: their way on is a key — the strip's 开始, 继续)
  const stationUp = !!(F.asking && H && H.kind && H.kind !== 'prep' && H.kind !== 'echo');
  const row = form === 'RunnerFlow' && F._shown ? F._shown() : null;
  const glide = form === 'RunnerFlow' && F.glide && F.glide.cur && !F.glide.cur.answered ? F.glide.cur : null;
  const runnerAsk = !!(row && row.kind !== 'boards') || !!glide;
  // the level moving on by itself: the runner's ink carries her, a duel round / the boss fight asks its next question
  const carried = form === 'RunnerFlow' ? !!(F.started && !F.stop && a && Math.hypot(a.vel.x, a.vel.z) > 0.5) : form === 'DuelFlow' ? F.phase === 'round' || F.phase === 'between' : form === 'BossFlow' ? F.phase !== 'done' && !(H && H.kind === 'echo') : false;
  const strip = document.querySelector('.iw-ps:not(.is-off) .iw-ps__box');
  const done = F.phase === 'done' || !!document.querySelector('.iw-learn.is-done') || !!document.querySelector('.iw-ci.is-in');
  const W = innerWidth, Ht = innerHeight, safe = { l: I.l, t: I.t, r: W - I.r, b: Ht - I.b };
  const keys = [...document.querySelectorAll('.iw-touch.is-live .iw-touch__btn')].filter((e) => getComputedStyle(e).display !== 'none').map((e) => { const r = e.getBoundingClientRect(); return { cx: r.left + r.width / 2, cy: r.top + r.height / 2, r: r.width / 2, t: e.textContent.trim() }; });
  const shown = (el) => { for (let e = el; e && e !== document.documentElement; e = e.parentElement) { const c = getComputedStyle(e); if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.5) return false; } return true; };
  // the boxes that may lie over a key without taking its touch (pointer-events none on their face): the strip, the reading
  // strip, the game keyboard
  const overlays = [['strip', '.iw-ps:not(.is-off) .iw-ps__box'], ['reading', '.iw-read:not(.is-off) .iw-read__box'], ['keyboard', '.iw-pk:not(.is-off) .iw-pk__panel']]
    .map(([n, sel]) => { const e = document.querySelector(sel); if (!e || !shown(e)) return null; const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 ? { n, e, r } : null; }).filter(Boolean);
  const check = (el, kind) => {
    const r = el.getBoundingClientRect(), vis = r.width > 0 && r.height > 0 && shown(el);
    const big = r.width >= 43.5 && r.height >= 43.5;
    const inSafe = r.left >= safe.l - 0.5 && r.top >= safe.t - 0.5 && r.right <= safe.r + 0.5 && r.bottom <= safe.b + 0.5;
    const pts = [[0.5, 0.5], [0.22, 0.5], [0.78, 0.5], [0.5, 0.25], [0.5, 0.75]];
    const hit = vis && pts.every(([fx, fy]) => { const t = document.elementFromPoint(r.left + r.width * fx, r.top + r.height * fy); return !!t && (t === el || el.contains(t)); });
    const under = keys.filter((k) => { const nx = Math.max(r.left, Math.min(k.cx, r.right)), ny = Math.max(r.top, Math.min(k.cy, r.bottom)); return Math.hypot(nx - k.cx, ny - k.cy) < k.r - 1; }).map((k) => k.t);
    const over = overlays.filter((o) => !o.e.contains(el) && o.r.left < r.right - 1 && o.r.right > r.left + 1 && o.r.top < r.bottom - 1 && o.r.bottom > r.top + 1).map((o) => o.n);
    return { kind, text: el.textContent.replace(/\s+/g, ' ').trim().slice(0, 24), rect: [r.left, r.top, r.width, r.height].map(Math.round), vis, big, inSafe, hit, under, over, on: el.classList.contains('is-on'), ready: el.classList.contains('is-ready'), ok: vis && big && inSafe && hit && !under.length && !over.length };
  };
  const way = [];
  for (const [sel, kind] of [['.iw-learn__auto', 'auto'], ['.iw-learn__go', 'go'], ['.iw-ps:not(.is-off) .iw-ps__act.is-primary', 'strip']]) for (const el of document.querySelectorAll(sel)) way.push(check(el, kind));
  const more = [...document.querySelectorAll('.iw-learn__more')].map((el) => check(el, 'more'));
  // the framed board: the puzzle's boards, the exit's booth and signs, the arena's booth and 备战 boards, the runner's
  const X = F.play && F.play.exit;
  const walks = [F.play && F.play.boards && F.play.boards.walk, X && X.echo && X.echo.walk, X && X.signs && X.signs.walk, F.arena && F.arena.echo && F.arena.echo.echo && F.arena.echo.echo.walk, F.arena && F.arena.prepS && F.arena.prepS.board, F.prepS && F.prepS.board, F.bw && F.bw.walk].filter(Boolean);
  const fw = walks.find((w) => w.framed >= 0 && w.list[w.framed]) || null;
  const framed = fw ? { i: fw.framed, read: fw.read(fw.framed), t: +fw.list[fw.framed].t.toFixed(2), hot: fw.set.project(fw.list[fw.framed].b, __G.camera, W, Ht).map((h) => ({ id: h.id, x: Math.round(h.rect.x), y: Math.round(h.rect.y), w: Math.round(h.rect.w), h: Math.round(h.rect.h) })), strip: fw.strip.isOpen } : null;
  const read = document.querySelector('.iw-read:not(.is-off) .iw-read__box');
  const clock = document.querySelector('.iw-hud__top'), cr = clock && clock.getBoundingClientRect();
  return {
    form, t: +(F.t || 0).toFixed(2), gt: +__G.time.toFixed(2), phase: F.phase, cur: F.cur, gates: F.gates ? F.gates.length : 0, opened: F.gates ? F.gates.filter((g) => g.state === 'open').length : 0,
    auto: !!F.auto, mech: H ? H.kind : null, item: F.asking && F.asking.item ? F.asking.item.id : null, asking: stationUp || runnerAsk, carried,
    answered: !!(d && ((d.mechanic === 'm1' && d.m1 && d.m1.answered) || (S && S.answered))), strip: strip ? strip.innerText.replace(/\s+/g, ' ').trim().slice(0, 80) : null,
    done, way, more, framed, reading: !!read, paused: M.paused, menu: __inkwave.menus && __inkwave.menus.current,
    speed: a ? +Math.hypot(a.vel.x, a.vel.z).toFixed(2) : 0, her: a ? [a.pos.x, a.pos.y, a.pos.z].map((v) => +v.toFixed(1)) : null,
    learnCls: (document.querySelector('.iw-learn') || {}).className || '',
    clock: cr ? { rect: [cr.left, cr.top, cr.width, cr.height].map(Math.round), inSafe: cr.top >= I.t - 0.5 } : null,
    exit: X && X.on ? X.debug() : null,
    runner: form === 'RunnerFlow' ? { s: +(F.sNow || 0).toFixed(1), latT: +(F.latT || 0).toFixed(2), started: !!F.started, row: row ? { kind: row.kind, item: row.item ? row.item.id : null, s: +row.s.toFixed(1), centers: row.centers || null, lanes: row.lanes } : null, glide: glide ? { item: glide.item.id, answered: !!glide.answered } : null } : null,
    answers: (F.log || []).filter((e) => e.name === 'learn:answer').length,
  };
}, INSET);

// ------------------------------------------------------------------------------------------------ her taps
const tap = async (x, y, what) => { report.taps.push({ what, x: Math.round(x), y: Math.round(y), t: Date.now() - T0 }); await page.touchscreen.tap(Math.round(x), Math.round(y)); };
const tapEl = async (w, what) => tap(w.rect[0] + w.rect[2] / 2, w.rect[1] + w.rect[3] / 2, what || w.kind + ' ' + w.text);
async function waitFor(fn, ms = 20000, every = 250, arg) { const t = Date.now(); while (Date.now() - t < ms) { const r = await ev(fn, arg); if (r) return r; await sleep(every); } return null; }
// the right answer of the live question (an index on the stage's order, or the text)
const rightAnswer = () => ev(() => {
  const F = __inkwave.match.learn, A = F.asking; if (!A) return null;
  const { item, p } = A;
  if (p._flip) return true;
  if (p._alt === 'choice-of-typed') return (p.options || []).findIndex((o) => o.text === ((item.meta && item.meta.ref) || item.en));
  if (p.type === 'choice') return p._perm ? p._perm.indexOf(item.answer) : item.answer;
  return (item.meta && item.meta.ref) || item.en;
});
// (a page function: waitFor evaluates it in the page)
const verdictOf = () => { const F = __inkwave.match.learn; if (F.glide && F.glide.cur) return F.glide.cur.answered ? (F.glide.cur.verdict || { ok: true }) : null; if (F.glide && F.constructor.name === 'RunnerFlow') return { ok: true, gone: true }; const H = F.play || F.arena, d = H.debug(); return d.mechanic === 'm1' ? d.m1.verdict : d.station && d.station.verdict; };

async function answerM1(right) {
  // where the objects come to rest: two reads 400 ms apart within 3 px
  let last = null, d = null;
  for (let i = 0; i < 80; i++) {
    d = await ev(() => { const H = __inkwave.match.learn.play || __inkwave.match.learn.arena; return H.m1.debug(); });
    if (d.placed && d.projected.length === d.n) {
      const q = d.projected.find((x) => x.i === right), at = q ? (q.kind === 'ball' ? [q.cx, q.cy] : [q.x + q.w / 2, q.y + q.h / 2]) : null;
      if (at && last && Math.hypot(at[0] - last[0], at[1] - last[1]) < 3) { await tap(at[0], at[1], 'M1 ' + right); return waitFor(verdictOf, 30000); }
      last = at;
    }
    await sleep(400);
  }
  return null;
}
// the game keyboard has come to rest on the screen (its slide-in is a CSS transition on wall time): two reads alike
async function kbSettled() {
  let last = null;
  for (let i = 0; i < 80; i++) {
    const r = await ev(() => { const kb = document.querySelector('.iw-pk__panel'); if (!kb || document.querySelector('.iw-pk.is-off')) return null; const b = kb.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round); });
    if (r && last && r.join() === last.join() && r[1] + r[3] <= V.h + 1) return r;
    last = r; await sleep(150);
  }
  return null;
}
async function answerType(right) {
  const kb = await kbSettled();
  if (!kb) return null;
  const text = String(right).toLowerCase();
  const keyAt = (k) => ev((k) => { const F = __inkwave.match.learn, T = F.glide && F.glide.cur ? F.glide : (F.play || F.arena).type, el = T.keys && T.keys.keyEls.get(k); if (!el || el.style.display === 'none') return null; const r = el.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; }, k);
  for (const ch of text) { if (!/[a-z ' .,?-]/.test(ch)) continue; const at = await keyAt(ch); if (at) await tap(at[0], at[1], 'key ' + ch); }
  const fire = await keyAt('fire'); if (!fire) return null;
  await tap(fire[0], fire[1], 'key 射');
  return waitFor(verdictOf, 40000);
}
async function answerBeat(right) {
  const lis = await waitFor(() => { const H = __inkwave.match.learn.play || __inkwave.match.learn.arena, d = H.debug().station; return d && d.state && d.state.round === 'listen' && d.pads && d.pads.length ? d : null; }, 40000, 250);
  if (!lis) return null;
  await sleep(500);
  const d = await ev(() => (__inkwave.match.learn.play || __inkwave.match.learn.arena).debug().station);
  const p = d.pads[right]; if (!p) return null;
  await tap(p.x, p.y, 'pad ' + right);
  return waitFor(verdictOf, 30000);
}
async function answerFlip() {
  const front = await waitFor(() => { const d = (__inkwave.match.learn.play || __inkwave.match.learn.arena).flip.debug(); return d.phase === 'front' && d.card ? d : null; }, 30000, 250);
  if (!front) return null;
  await tap(front.card.x + front.card.w / 2, front.card.y + front.card.h / 2, 'flip card');
  const back = await waitFor(() => { const d = (__inkwave.match.learn.play || __inkwave.match.learn.arena).flip.debug(); return d.phase === 'back' && d.targets.length === 2 ? d : null; }, 30000, 250);
  if (!back) return null;
  await sleep(700);
  const t = (await ev(() => (__inkwave.match.learn.play || __inkwave.match.learn.arena).flip.debug())).targets[0];
  await tap(t.cx, t.cy, 'flip 认识');
  return waitFor(verdictOf, 30000);
}
let cdp = null;
async function swipe(dir) {
  cdp = cdp || await ctx.newCDPSession(page);
  const cx = Math.round(V.w * 0.5), cy = Math.round(V.h * 0.62), d = 70, to = { left: [-d, 0], right: [d, 0], up: [0, -d], down: [0, d] }[dir];
  report.taps.push({ what: 'swipe ' + dir, x: cx, y: cy, t: Date.now() - T0 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 1 }] });
  for (let k = 1; k <= 5; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + (to[0] * k) / 5, y: cy + (to[1] * k) / 5, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function runnerRow(s) {
  const want = await ev(() => { const F = __inkwave.match.learn, r = F._shown(); if (!r || !r.centers) return null; const k = F.rightAnswer(); return k == null || k < 0 ? null : r.centers[k]; });
  if (want == null) return;
  if (Math.abs(s.runner.latT - want) > 0.05) await swipe(want < s.runner.latT ? 'left' : 'right');
}
async function answer(s) {
  const right = s.runner ? await ev(() => __inkwave.match.learn.rightAnswer()) : await rightAnswer();
  const label = `${s.mech} ${s.item}`;
  let v = null;
  if (s.mech === 'm1') v = await answerM1(right);
  else if (s.mech === 'type') v = await answerType(right);
  else if (s.mech === 'beat') v = await answerBeat(right);
  else if (s.mech === 'flip') v = await answerFlip();
  report.questions.push({ label, ok: !!(v && v.ok), t: s.t });
  say(v && v.ok ? 'answered' : 'NOT answered', label, v ? '' : JSON.stringify(await ev(() => (__inkwave.match.learn.play || __inkwave.match.learn.arena).debug())).slice(0, 600));
  if (!v) fail('a question could not be answered by tapping the screen', { label });
  // the verdict plays out
  await sleep(1200);
  return !!v;
}

// ------------------------------------------------------------------------------------------------ the walk
const untilMet = (s) => {
  if (s.done) return true;
  const m = /^gate:(\d+)$/.exec(UNTIL);
  if (m) return s.opened >= +m[1];
  if (UNTIL === 'exit') return s.phase === 'exit';
  return false;
};
let noWay = null, moreTapped = 0, lastAct = 0, firstBoardShot = false, still = null, prepMore = false;
const STALL_S = 15;   // s (game) the level may carry on by itself with nothing happening — no answer, no gate, no road
try {
  for (let k = 0; ; k++) {
    const s = await sample(); report.samples++;
    if (s.gone) { fail('the level went away', s); break; }
    if (k === 0) report.first = s;
    if (untilMet(s)) { say('until met:', UNTIL, JSON.stringify({ phase: s.phase, opened: s.opened, done: s.done })); report.until = { phase: s.phase, opened: s.opened, done: s.done }; break; }
    const ok = s.way.filter((w) => w.ok);
    // (the clock under the top inset, once the HUD has come to rest — its drop-in starts above the screen: one finding)
    if (k >= 5 && s.clock && !s.clock.inSafe && !report.clockFlag) { report.clockFlag = true; fail('the HUD\'s top row is under the top inset', s.clock); }
    // (carried: the runner's ink, a duel round, the boss fight — the level moves on by itself; it must not stand still)
    if (s.carried && !s.asking && !ok.length) {
      const sig = [s.answers, s.opened, s.cur, s.item, s.phase, s.runner ? Math.round(s.runner.s / 3) : 0].join('|');
      if (!still || still.sig !== sig) still = { sig, t0: s.gt, w0: Date.now() };
      else if (s.gt - still.t0 > STALL_S && !still.failed) { still.failed = true; const f = await shot('stalled'); fail(`the level carries on by itself but nothing happened for ${(s.gt - still.t0).toFixed(1)} s (game)`, { shot: f, phase: s.phase, mech: s.mech, way: s.way, strip: s.strip, runner: s.runner }); if (!KEEP) break; }
    } else still = null;
    if (s.asking || ok.length || s.carried) {
      if (noWay) { noWay = null; }
    } else {
      if (!noWay) noWay = { t0: s.gt, w0: Date.now(), s0: s };
      const g = s.gt - noWay.t0, w = (Date.now() - noWay.w0) / 1000;
      if (g > report.maxNoWay.game) report.maxNoWay.game = g;
      if (w > report.maxNoWay.wall) report.maxNoWay.wall = w;
      if (g > LIMIT_S && !noWay.failed) {
        noWay.failed = true;
        const f = await shot('no-way');
        report.noWay.push({ game: +g.toFixed(1), wall: +w.toFixed(1), shot: f, at: s });
        fail(`no way on for ${g.toFixed(1)} s (game) / ${w.toFixed(1)} s (wall), not answering`, { phase: s.phase, cur: s.cur, framed: s.framed, way: s.way, learnCls: s.learnCls, auto: s.auto, mech: s.mech, strip: s.strip, speed: s.speed });
        if (!KEEP) break;
      }
    }
    // ---- what she does
    if (s.runner && s.runner.glide && Date.now() - lastAct > 800) {
      const right = await ev(() => __inkwave.match.learn.rightAnswer());
      const v = right ? await answerType(right) : null;
      report.questions.push({ label: 'glide ' + s.runner.glide.item, ok: !!v, t: s.t });
      say(v ? 'answered' : 'NOT answered', 'glide', s.runner.glide.item);
      if (!v) { fail('a 滑行段 item could not be typed on the screen\'s keys', { item: s.runner.glide.item }); if (!KEEP) break; }
      lastAct = Date.now(); continue;
    }
    if (s.runner && s.runner.row && s.runner.row.kind !== 'boards' && s.runner.row.kind !== 'glide') {
      if (!report.questions.find((q) => q.label === 'row ' + s.runner.row.item + '@' + s.runner.row.s)) report.questions.push({ label: 'row ' + s.runner.row.item + '@' + s.runner.row.s, ok: true, t: s.t });
      await runnerRow(s); await sleep(250); continue;
    }
    if (s.asking && s.mech && !s.answered && Date.now() - lastAct > 800) {
      const ok1 = await answer(s); lastAct = Date.now();
      if (!ok1 && !KEEP) break;
      continue;
    }
    if (!s.asking && ok.length && Date.now() - lastAct > 1500) {
      const go = ok.find((w) => w.kind === 'go'), auto = ok.find((w) => w.kind === 'auto'), st = ok.find((w) => w.kind === 'strip');
      if (go && s.framed) {
        // a framed board: she reads it (read counts after LEARN.board.readS), opens 「看全文」 once, then 继续
        if (!s.framed.read) { await sleep(700); continue; }
        if (!firstBoardShot) { firstBoardShot = true; await shot('board-framed'); }
        report.boards.push({ t: s.t, i: s.framed.i, go: go.rect, ready: go.ready, more: s.more.map((m) => ({ rect: m.rect, ok: m.ok })) });
        const more = s.more.find((m) => m.ok);
        if (more && (MORE_ALL || !moreTapped) && !s.reading) {
          moreTapped++;
          await tapEl(more, '看全文');
          const opened = await waitFor(() => !!document.querySelector('.iw-read:not(.is-off) .iw-read__box'), 8000, 200);
          report.more.push({ t: s.t, opened: !!opened, via: 'dom' });
          if (!opened) fail('「看全文」 tapped: the reading strip did not open', { more });
          else {
            await sleep(900); await shot('reading');
            const after = await sample();
            const goNow = after.way.find((w) => w.kind === 'go');
            if (!(goNow && goNow.ok)) fail('the reading strip open: no way on visible', { way: after.way });
            const x = await ev(() => { const b = document.querySelector('.iw-read:not(.is-off) .iw-read__x'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width, r.height]; });
            if (x) { await tap(x[0], x[1], '收起 ✕'); await waitFor(() => !document.querySelector('.iw-read:not(.is-off)'), 6000, 200); }
          }
          // the board's own 3D hotspot too, once: the same strip from a tap on its projection
          if (moreTapped === 1) {
            const s2 = await sample(), h = s2.framed && s2.framed.hot.find((q) => q.id === 'more');
            if (h) {
              await tap(h.x + h.w / 2, h.y + h.h / 2, '看全文 (board hotspot)');
              const op = await waitFor(() => !!document.querySelector('.iw-read:not(.is-off) .iw-read__box'), 8000, 200);
              report.more.push({ t: s2.t, opened: !!op, via: 'hotspot', rect: h });
              if (!op) fail('the board\'s 「看全文」 hotspot tapped: the reading strip did not open', { h });
              const x = await ev(() => { const b = document.querySelector('.iw-read:not(.is-off) .iw-read__x'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
              if (x) { await tap(x[0], x[1], '收起 ✕'); await waitFor(() => !document.querySelector('.iw-read:not(.is-off)'), 6000, 200); }
            }
          }
          lastAct = Date.now(); continue;
        }
        await tapEl(go, '继续'); lastAct = Date.now(); continue;
      }
      if (auto && !auto.on && !s.auto) { await tapEl(auto, '自动走'); lastAct = Date.now(); continue; }
      // the runner's start line / the duel's 备战: a board framed, the strip holds the keys (看全文, the way on) — its own
      // 「看全文」 hotspot first (the runner's fingers go through the swipe hook: G.playTap), then the strip's, once each
      if (st && !auto && s.framed && !prepMore && !s.reading) {
        // (she reads it first: framed LEARN.board.readS — the lens has come round by then; a tap at a hotspot's projection
        // while the camera still springs lands where the board was)
        if (!s.framed.read) { await sleep(700); continue; }
        prepMore = true;
        const open = () => waitFor(() => !!document.querySelector('.iw-read:not(.is-off) .iw-read__box'), 8000, 200);
        const shut = async () => { const x = await ev(() => { const b = document.querySelector('.iw-read:not(.is-off) .iw-read__x'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }); if (x) { await tap(x[0], x[1], '收起 ✕'); await waitFor(() => !document.querySelector('.iw-read:not(.is-off)'), 6000, 200); } };
        const s1 = await sample(), h = s1.framed && s1.framed.hot.find((q) => q.id === 'more');
        if (h && (h.x < 0 || h.y < 0 || h.x + h.w > V.w || h.y + h.h > V.h)) fail('the framed board\'s 「看全文」 lies off the screen', { h, form: s.form });
        if (h) {
          await tap(h.x + h.w / 2, h.y + h.h / 2, '看全文 (board hotspot, ' + s.form + ')');
          const op = await open();
          report.more.push({ t: s.t, opened: !!op, via: 'hotspot', form: s.form, rect: h });
          if (!op) fail('the board\'s 「看全文」 hotspot tapped (no HUD keys: the strip holds them): the reading strip did not open', { h, form: s.form });
          else { await shot('reading-' + s.form); await shut(); }
        }
        const sm = await ev(() => { const b = [...document.querySelectorAll('.iw-ps:not(.is-off) .iw-ps__act')].find((e) => e.textContent.trim() === '看全文'); if (!b) return null; const r = b.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2, r.width, r.height]; });
        if (h && !sm) fail('the board has more, the strip has no 「看全文」', { form: s.form });
        if (sm) {
          await tap(sm[0], sm[1], '看全文 (strip, ' + s.form + ')');
          const op = await open();
          report.more.push({ t: s.t, opened: !!op, via: 'strip', form: s.form });
          if (!op) fail('the strip\'s 「看全文」 tapped: the reading strip did not open', { form: s.form });
          else await shut();
        }
        lastAct = Date.now(); continue;
      }
      if (st && !auto) { await tapEl(st, 'strip ' + st.text); lastAct = Date.now(); continue; }
    }
    if (k % 15 === 0) say('sample', JSON.stringify({ form: s.form, t: s.t, phase: s.phase, cur: s.cur, opened: s.opened, auto: s.auto, mech: s.mech, asking: s.asking, carried: s.carried, answers: s.answers, framed: s.framed && { i: s.framed.i, read: s.framed.read }, way: s.way.map((w) => w.kind + (w.ok ? '+' : '-') + (w.over.length ? '[' + w.over + ']' : '')), speed: s.speed, runner: s.runner && { s: s.runner.s, row: s.runner.row && s.runner.row.kind } }));
    await sleep(1000);
  }
} catch (e) { fail('driver error', String((e && e.stack) || e).slice(0, 600)); }
await finish();
