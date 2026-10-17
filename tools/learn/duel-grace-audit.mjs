// 题即玩法 play-9 (docs/PLAY.md §1, LEVELS §2.3, LEARN §28): a duel round that runs out while a question is up waits for the
// question (forms/common.js RoundGrace). A real page (the same static server / software GL / frozen clock as
// arena-audit.mjs), the shortened duel day (?short=1: two rounds of two), portrait; three rounds forced by hand:
//   round 1  the question up → the clock set to run out → the grace: phase still 'round', the question still up, the
//            clock reads 最后一题, the other side's die stops, no pause / no card; the right ball tapped → the round ends
//            AFTER the answer (learn:answer before learn:round end), reason 'time', the answer is her first
//   round 2  the clock run out again, nothing answered → after LEARN.duel.graceS the question is withdrawn: no answer, no
//            evidence, the item in front of the next round's queue (carryLeft's rest round), 'withdraw' in the arena log
//   round 3  (the rest round, that item) the zone knocked out by hand mid-question → the grace carries the knockout
//            (winner 1), the answer still counts, the round ends with reason 'knockout' and the counts of that moment
//   node tools/learn/duel-grace-audit.mjs [--out <file>] [--shots <dir>] [--render]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const OUT = opt('out', null), SHOTS = opt('shots', null), FAST = !args.includes('--render');
const T0 = Date.now();
const say = (...a) => console.log(`[duel-grace ${((Date.now() - T0) / 1000).toFixed(1).padStart(5)}]`, ...a);
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
const fails = [], report = { cases: [] };
const watchdog = setTimeout(() => { say('WATCHDOG — out of budget'); finish(2); }, 900000);
async function finish(code) {
  clearTimeout(watchdog);
  if (OUT) try { fs.writeFileSync(OUT, JSON.stringify(report, null, 1)); } catch (e) { say('could not write', OUT); }
  console.log(`[duel-grace] ${fails.length ? fails.length + ' FAILED' : 'all checks passed'}`);
  for (const f of fails) console.log('  FAIL ' + f);
  try { await browser.close(); } catch (e) { /* gone */ }
  srv.close();
  process.exit(code != null ? code : (fails.length ? 1 : 0));
}
process.on('unhandledRejection', (e) => { fails.push('driver error ' + String(e && e.message || e)); finish(1); });
const check = (ok, what, detail) => { if (!ok) fails.push(what + (detail ? ' — ' + JSON.stringify(detail).slice(0, 600) : '')); say((ok ? 'ok   ' : 'FAIL ') + what + (detail && !ok ? ' ' + JSON.stringify(detail).slice(0, 500) : '')); return ok; };

const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { const k = 'inkwave.settings', v = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(v, { shadows: false, bloom: false, touchControls: 'on' }); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* none */ } });
const page = await ctx.newPage();
const errs = [], bad = [];
page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().replace(base, '/game/')); });
page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 400)); });
page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const inv = { samples: 0, breaks: [] }; report.invariants = inv;
const step = async (ms = 16.7) => {
  const r = await ev(([m, fast]) => {
    if (fast) { const I = __inkwave, n = Math.max(1, Math.round(m / (1000 / 60))); I._skipRender = true; try { for (let i = 0; i < n; i++) I._frame(1 / 60); } finally { I._skipRender = false; } __G.scene.updateMatrixWorld(); __G.camera.updateMatrixWorld(true); }
    else __inkwave.debug.step(m);
    const M = __inkwave.match, F = M && M.learn; if (!F || F.phase === 'done') return null;
    const p = document.querySelector('.iw-learn__panel'), b = p && p.getBoundingClientRect(), shown = !!(b && b.width > 0 && b.height > 0 && getComputedStyle(p).display !== 'none');
    return M.paused || F.hold || shown ? { paused: M.paused, hold: !!F.hold, panel: shown, phase: F.phase } : 0;
  }, [ms, FAST]);
  if (r !== null) { inv.samples++; if (r && inv.breaks.length < 20) inv.breaks.push(r); }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = async (name) => { if (!SHOTS) return; fs.mkdirSync(SHOTS, { recursive: true }); const f = path.join(SHOTS, `duel-grace-portrait-${name}.png`); if (FAST) await ev(() => __inkwave._frame(1 / 60)); await page.screenshot({ path: f, timeout: 180000 }); say('shot', f); };
const clickGo = () => ev(() => { const b = document.querySelector('.iw-ps:not(.is-off) .iw-ps__act.is-primary'); if (b) { b.click(); return true; } return false; });
const snap = () => ev(() => {
  const m = __inkwave.match, F = m.learn, H = F.arena;
  const rounds = F.log.filter((e) => e.name === 'learn:round').map((e) => e.state), lastRound = F.log.findLastIndex((e) => e.name === 'learn:round' && e.state === 'end'), lastAns = F.log.findLastIndex((e) => e.name === 'learn:answer');
  return { phase: F.phase, round: F.round, asking: F.asking ? F.asking.item.id : null, kind: H && H.kind, grace: F.grace.on ? { winner: F.grace.on.winner, reason: F.grace.on.reason, t: +F.grace.on.t.toFixed(2), counts: F.grace.on.counts } : null,
    clock: (document.querySelector('.iw-timer__txt') || {}).textContent, time: +m.time.toFixed(2), paused: m.paused, hold: !!F.hold, enemyT: +F.enemyT.toFixed(3), state: m.state,
    panel: !!(document.querySelector('.iw-learn__panel') && document.querySelector('.iw-learn__panel').getBoundingClientRect().width > 0),
    rounds, lastRound, lastAns, results: F.rounds.map((r) => ({ round: r.round, winner: r.winner, reason: r.reason, counts: r.counts, left: r.left })), wins: F.wins,
    answers: F.log.filter((e) => e.name === 'learn:answer').map((e) => [e.itemId, e.ok ? 1 : 0, e.first ? 1 : 0]), gates: F.gates.map((g) => ({ id: g.id, rest: !!g._restGate, queue: g.queue.map((it) => it.id) })),
    arenaLog: H ? H.log.slice(-6) : [], ev: Object.keys(JSON.parse(localStorage.getItem('inkwave:learn:v1') || '{"ev":{}}').ev || {}) };
});
async function untilQuestion() {
  for (let i = 0; i < 240; i++) {
    const s = await ev(() => { const F = __inkwave.match.learn, H = F.arena; return { asking: !!(F.asking && H && H.kind && H.kind !== 'prep'), board: !!(H && H.kind === 'prep'), done: F.phase === 'done' }; });
    if (s.asking || s.done) return s;
    if (s.board) { await step(20); await clickGo(); }
    await step(250);
  }
  return { timeout: true };
}
const rightAnswer = () => ev(() => { const A = __inkwave.match.learn.asking; if (!A) return null; const { item, p } = A; if (p.type === 'choice') return p._perm ? p._perm.indexOf(item.answer) : item.answer; return null; });
async function tapRight(label) {
  for (let i = 0; i < 60; i++) { const d = await ev(() => { const d = __inkwave.match.learn.arena.m1.debug(); return d.placed && d.projected.length ? 1 : 0; }); if (d) break; await step(100); }
  for (let i = 0; i < 6; i++) await step(100);
  const right = await rightAnswer();
  const q = await ev((k) => __inkwave.match.learn.arena.m1.debug().projected.find((x) => x.i === k) || null, right);
  if (!check(!!q, `${label}: the right object is on the screen to tap`, { right })) return null;
  await page.touchscreen.tap(Math.round(q.kind === 'ball' ? q.cx : q.x + q.w / 2), Math.round(q.kind === 'ball' ? q.cy : q.y + q.h / 2));
  let v = null;
  for (let i = 0; i < 110 && !v; i++) { await step(16.7); v = await ev(() => __inkwave.match.learn.arena.m1.debug().verdict); }
  check(!!v && v.ok === true, `${label}: the tapped round landed on it: 答对了`, v);
  return v;
}
// the clock run out by hand: the match's seconds set under the duel's own threshold — the next frame is the round's end
const runOut = async () => { await ev(() => { __inkwave.match.time = 0.06; }); await step(50); };

// ---------------------------------------------------------------------------------------------- boot
const q = '?learn=w1d6&kind=duel&short=1&quality=low&nofullscreen&noclips&from=app';
say('open', q);
await page.goto(base + 'index.html' + q, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__inkwave && __inkwave.match && __inkwave.match.mode === 'learn' && __inkwave.match.learn, null, { timeout: 420000, polling: 250 });
report.boot = await ev(() => { const F = __inkwave.match.learn, m = __inkwave.match; __inkwave.debug.freeze(); return { kind: m.learnKind, arena: !!F.arena, gates: F.gates.map((g) => g.id), D: { graceS: F.D.graceS, graceTypeS: F.D.graceTypeS } }; });
say('boot', JSON.stringify(report.boot));
check(report.boot.arena && report.boot.kind === 'duel', 'the duel has its arena host', report.boot);
for (let i = 0; i < 120; i++) { const st = await ev(() => { const F = __inkwave.match.learn; return { state: __inkwave.match.state, up: !!(F.arena && F.arena.kind === 'prep') }; }); if (st.state === 'playing' && st.up) break; await step(250); }
await step(30);
check(await clickGo(), 'the 备战 board\'s 「开始」 starts round 1');
await step(50);

// ---------------------------------------------------------------------------------------------- round 1: answered in the grace
let s = await untilQuestion(); check(!!s.asking, 'round 1: a question comes up', s);
let a = await snap(); check(a.kind === 'm1', 'round 1: the question is an ink target (the shortened day\'s first gate)', { kind: a.kind, item: a.asking });
const item1 = a.asking, enemyT0 = a.enemyT;
await runOut();
a = await snap(); report.cases.push({ name: 'round 1 grace', ...a });
check(a.phase === 'round' && !!a.grace && a.grace.reason === 'time' && a.asking === item1, 'round 1: the clock ran out mid-question → the round waits (phase round, the verdict parked as \'time\', the question still up)', a);
check(/最后一题/.test(a.clock || ''), 'round 1: the clock reads 最后一题', a.clock);
check(a.paused === false && !a.hold && !a.panel, 'round 1: no pause, no hold, no card while it waits (PLAY §1 rule 1)', a);
check(a.rounds[a.rounds.length - 1] === 'grace', 'round 1: learn:round state grace emitted once', a.rounds);
check(Array.isArray(a.grace.counts) && a.grace.counts.length === 2, 'round 1: the counts of that moment are kept', a.grace);
for (let i = 0; i < 10; i++) await step(100);
const b = await snap();
check(b.phase === 'round' && !!b.grace && b.enemyT === a.enemyT, 'round 1: a second on — still waiting, the other side\'s die stopped (enemyT unchanged)', { before: a.enemyT, after: b.enemyT, phase: b.phase });
await shot('grace');
await tapRight('round 1');
for (let i = 0; i < 20; i++) await step(100);
const c = await snap(); report.cases.push({ name: 'round 1 end', ...c });
check(c.phase === 'between' && !c.grace, 'round 1: answered → the round ended, nothing parked', { phase: c.phase, grace: c.grace });
check(c.lastAns >= 0 && c.lastRound > c.lastAns, 'round 1: learn:round end comes after the answer', { lastAns: c.lastAns, lastRound: c.lastRound });
check(c.answers.some((x) => x[0] === item1 && x[1] === 1 && x[2] === 1), 'round 1: the answer counts as her first, right', c.answers);
check(c.results.length === 1 && c.results[0].reason === 'time' && c.results[0].counts.join() === a.grace.counts.join(), 'round 1: the result says \'time\' with the counts of the moment it ran out', { results: c.results, held: a.grace.counts });

// ---------------------------------------------------------------------------------------------- round 2: nothing answered → withdrawn
s = await untilQuestion(); check(!!s.asking, 'round 2: a question comes up', s);
a = await snap(); const item2 = a.asking; check(a.round === 1 && a.kind === 'm1', 'round 2: an ink target again', { round: a.round, kind: a.kind, item: item2 });
await runOut();
a = await snap(); check(a.phase === 'round' && !!a.grace && a.asking === item2, 'round 2: ran out mid-question → waiting', a);
for (let i = 0; i < Math.ceil((report.boot.D.graceS + 1) * 10); i++) await step(100);
const d = await snap(); report.cases.push({ name: 'round 2 withdrawn', ...d });
check(d.phase === 'between' && !d.grace && d.asking === null, `round 2: after ${report.boot.D.graceS} s unanswered → the round ended, the question withdrawn`, { phase: d.phase, grace: d.grace, asking: d.asking });
check(!d.answers.some((x) => x[0] === item2), 'round 2: no answer recorded for it', d.answers);
check(!d.ev.some((k) => k.includes(item2)), 'round 2: no evidence leaf for it', d.ev.filter((k) => k.includes(item2)));
check(d.gates[d.round + 1] && d.gates[d.round + 1].queue[0] === item2, 'round 2: the item is in front of the next round\'s queue (carryLeft)', d.gates);
check(d.arenaLog.some((e) => e.ev === 'withdraw' && e.item === item2), 'round 2: \'withdraw\' in the arena log', d.arenaLog);

// ---------------------------------------------------------------------------------------------- round 3 (the rest round): knocked out mid-question
s = await untilQuestion(); check(!!s.asking, 'round 3: the withdrawn question comes back', s);
a = await snap(); check(a.asking === item2 && a.gates[a.round].rest, 'round 3: it is the rest round asking that item', { asking: a.asking, gate: a.gates[a.round] });
await ev(() => { __inkwave.match.learn.Z._end(1, 'knockout'); }); await step(50);
a = await snap(); report.cases.push({ name: 'round 3 knockout grace', ...a });
check(a.phase === 'round' && !!a.grace && a.grace.reason === 'knockout' && a.grace.winner === 1 && a.asking === item2, 'round 3: the zone knocked out mid-question → the round waits with the knockout parked', a);
await tapRight('round 3');
for (let i = 0; i < 20; i++) await step(100);
const e = await snap(); report.cases.push({ name: 'round 3 end', ...e });
check(e.phase !== 'round' && !e.grace, 'round 3: answered → the round ended', { phase: e.phase, grace: e.grace });
check(e.results.length === 3 && e.results[2].reason === 'knockout' && e.results[2].winner === 1 && e.results[2].counts.join() === a.grace.counts.join(), 'round 3: the result is the knockout, with its counts', { results: e.results, held: a.grace.counts });
check(e.answers.some((x) => x[0] === item2 && x[2] === 1), 'round 3: the carried item got its first answer', e.answers);
check(e.lastAns >= 0 && e.lastRound > e.lastAns, 'round 3: learn:round end after the answer', { lastAns: e.lastAns, lastRound: e.lastRound });
check(errs.length === 0 && bad.length === 0, 'no console errors, no 4xx', { errs, bad });
check(inv.breaks.length === 0, `PLAY §1 rule 1 held on all ${inv.samples} sampled steps`, inv.breaks.slice(0, 3));
report.errs = errs; report.bad = bad;
await finish();
