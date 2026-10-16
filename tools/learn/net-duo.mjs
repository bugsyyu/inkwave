// 关卡学习 · two players online (docs/LEARN.md §14): the Node relay + the game's file server + two headless browsers,
// one room, one match of versus2 (双人联机赛) or coop2 (双人成形合作赛), driven through G.net and the question layer,
// measured on both screens. Starts and stops its own relay and file server (free ports; nothing left running).
//
// usage: node tools/learn/net-duo.mjs [--mode versus2|coop2] [--week 1] [--day 1] [--map tidewater] [--bots] [--budget 170]
//                                      [--shots <dir>] [--shot-question] [--w 400 --h 225]
//   needs puppeteer-core (npm install, or a node_modules linked from a checkout that has it) and Chrome (CHROME_PATH).
//   Software-GL boxes: the pages run ?quality=low with shadows / bloom off, and once the match exists the simulation is
//   stepped (debug.freeze + _frame with the renderer skipped): the rules are measured, not the renderer.
//   The match is the short one (lobby.learn.short: versus2 = 2 questions on a 60 s clock; coop2 = 2 gates × 2 questions).
//
// versus2 script: question 1 — the guest answers right at once, the host right 1.5 s later (the guest inks: own time);
//                 question 2 — the host right at once, the guest wrong (the host inks); then the host calls the match.
// coop2 script:   both players walk (auto-walk) to the gate, each onto a pad; the clue / hands halves go to different
//                 screens; the hands side answers (the first one wrong: the item comes back reworded, to the other player).
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromePath, gpuArgs } from '../chrome.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const MODE = opt('mode', 'versus2'), WEEK = +opt('week', 1), DAY = +opt('day', 1), MAP = opt('map', 'tidewater');
const BOTS = args.includes('--bots'), BUDGET = +opt('budget', 170) * 1000, SHOTS = opt('shots', null), SHOT_Q = args.includes('--shot-question');
const W = +opt('w', 400), H = +opt('h', 225);
const T0 = Date.now();
const ts = () => ((Date.now() - T0) / 1000).toFixed(1).padStart(5);
const say = (...a) => console.log(`[duo ${ts()}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const kids = [], browsers = [], pages = [], logs = [];
const cleanup = () => {
  for (const b of browsers) { try { b.process()?.kill('SIGKILL'); } catch { /* gone */ } }
  for (const k of kids) { try { k.kill('SIGTERM'); } catch { /* gone */ } }
};
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });
const watchdog = setTimeout(() => { say('WATCHDOG — out of budget, stopping'); report(); cleanup(); process.exit(2); }, BUDGET + 8000);
watchdog.unref?.();

const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
async function waitHttp(url, ms = 15000) {
  const t = Date.now();
  while (Date.now() - t < ms) { try { const r = await fetch(url); if (r.ok || r.status === 404) return true; } catch { /* not yet */ } await sleep(150); }
  throw new Error('not up: ' + url);
}

const R = { mode: MODE, week: WEEK, day: DAY, map: MAP, bots: BOTS, t: {}, checks: [], shotQ: SHOT_Q };
const mark = (k) => { R.t[k] = +((Date.now() - T0) / 1000).toFixed(1); };
const check = (name, ok, detail = '') => { R.checks.push({ name, ok: !!ok, detail }); say(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`); };
function report() {
  console.log('\n[duo] ===== report =====');
  console.log(JSON.stringify(R, null, 1));
  const bad = logs.filter((l) => !/404|preload|KHR_parallel|GPU stall|ReadPixels|WebGL|swiftshader|Automatic fallback/i.test(l));
  if (bad.length) console.log('[duo] console:\n' + bad.slice(0, 30).join('\n'));
}

try {
  // ---- the relay and the file server, our own children
  const rport = await freePort(), hport = await freePort();
  // (software GL: the first frames on a freshly built stage stall each page for tens of seconds — the paint atlas's first
  // flush — so this relay allows 150 s of silence in a match instead of the Worker's 20 s; on a GPU nothing comes close)
  const relay = spawn(process.execPath, [resolve(ROOT, 'server/node/relay.mjs'), '--port', String(rport), '--host', '127.0.0.1', '--silent-match', '150000'], { stdio: ['ignore', 'pipe', 'inherit'] });
  relay.stdout.on('data', (d) => { for (const l of String(d).split('\n')) if (l.trim() && !/listening|opened/.test(l)) say(l.trim()); });
  kids.push(relay);
  const files = spawn('python3', [resolve(ROOT, 'tools/serve.py'), String(hport), '--dir', ROOT], { stdio: ['ignore', 'ignore', 'ignore'] });
  kids.push(files);
  await waitHttp(`http://127.0.0.1:${rport}/health`);
  await waitHttp(`http://127.0.0.1:${hport}/index.html`);
  say(`relay :${rport} · files :${hport}`);

  // ---- two browsers
  const url = `http://127.0.0.1:${hport}/?skipTitle&quality=low&relay=ws://127.0.0.1:${rport}`;
  const open = async (i) => {
    const b = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
      args: gpuArgs([`--window-size=${W},${H}`, '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows']) });
    browsers[i] = b;
    const p = await b.newPage();
    await p.evaluateOnNewDocument(() => { try { const k = 'inkwave.settings', v = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(v, { quality: 'low', shadows: false, bloom: false }); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* */ } });
    p.on('console', (m) => { const t = m.type(); if (t === 'error' || t === 'warn' || t === 'warning') logs.push(`c${i} [${t}] ${m.text()}`); });
    p.on('pageerror', (e) => logs.push(`c${i} [pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
    await p.goto(url, { waitUntil: 'load', timeout: 120000 });
    await p.waitForFunction('window.__inkwave && window.__G && __G.net && __G.mode === "menu"', { timeout: 120000, polling: 250 });
    pages[i] = p;
  };
  await Promise.all([open(0), open(1)]);
  mark('booted'); say('both booted');
  const ev = (i, fn, ...a) => pages[i].evaluate(fn, ...a);
  // freeze both from here: the room, the start, the build, ready and go all run on messages and timers; the menu's
  // attract match (a 4v4 on software GL) would only slow every poll down, and the match's first frames — the slow ones —
  // must run in the stepped loop below, never in the page's own loop
  await Promise.all([0, 1].map((i) => ev(i, () => { __inkwave.debug.freeze(); })));

  // ---- the room: create (host = c0), learning mode + lesson (short), join, ready, start
  const code = await ev(0, async (mode, week, day, map, bots) => {
    const c = await __G.net.create('Ann');
    __G.net.setSettings({ mode, map, bots, learn: { week, day, short: true } });
    return c;
  }, MODE, WEEK, DAY, MAP, BOTS);
  await ev(1, async (c) => { await __G.net.join(c, 'Bo'); }, code);
  await pages[0].waitForFunction('__G.net.lobby.players.length === 2', { timeout: 30000, polling: 100 });
  await pages[1].waitForFunction((m) => __G.net.lobby.mode === m && __G.net.lobby.learn && __G.net.lobby.learn.short, { timeout: 30000, polling: 100 }, MODE);
  await ev(1, () => __G.net.setMe({ ready: true }));
  await pages[0].waitForFunction('__G.net.canStart()', { timeout: 30000, polling: 100 });
  const lob = await Promise.all([0, 1].map((i) => ev(i, () => ({ id: __G.net.myId, code: __G.net.code, mode: __G.net.lobby.mode, learn: __G.net.lobby.learn, players: __G.net.lobby.players.map((p) => [p.name, p.team, p.host ? 'H' : '']) }))));
  mark('room'); R.room = lob; R.ids = lob.map((x) => x.id);
  check('room: both in one room, same mode and lesson', lob[0].code === lob[1].code && lob[0].mode === MODE && lob[1].mode === MODE && lob[1].learn.week === WEEK && lob[1].learn.day === DAY, `${code} ${JSON.stringify(lob[0].players)} / guest sees ${lob[1].mode} w${lob[1].learn.week}d${lob[1].learn.day}`);
  await ev(0, () => __G.net.start());

  // ---- both in the level (built from the same content on each screen)
  await Promise.all([0, 1].map((i) => pages[i].waitForFunction('__G.net.state === "match" && __inkwave.match && __inkwave.match.learn && (__inkwave.match.state === "intro" || __inkwave.match.state === "playing")', { timeout: 90000, polling: 200 })));
  mark('inLevel');
  // (frozen since the start: the simulation is stepped from here — software GL renders a frame in ~0.4 s and the
  // rules don't need the picture)
  // software GL compiles the squidkids' shader variants in the GPU process (KHR_parallel_shader_compile) long after the
  // match is built; a stepped frame that touches GL waits behind that queue — wait until both screens' programs are
  // ready (pages idle meanwhile: their pings keep the room alive)
  for (let k = 0; ; k++) {
    const P = await Promise.all([0, 1].map((i) => ev(i, () => { const ps = __G.renderer.info.programs || []; return [ps.length, ps.filter((p) => p.isReady && !p.isReady()).length]; })));
    if (k % 5 === 0 || P.every((x) => !x[1])) say(`shader programs (all / compiling): c0 ${P[0].join(' / ')} · c1 ${P[1].join(' / ')}`);
    if (P.every((x) => !x[1]) || k > 40) break;
    await sleep(1500);
  }
  mark('shadersReady');
  // --profile: where the first stepped frames spend their time (per subsystem, ms)
  if (args.includes('--profile')) await Promise.all([0, 1].map((i) => ev(i, () => {
    const I = __inkwave, P = (window.__prof = {});
    const wrap = (o, k, name) => { if (!o || typeof o[k] !== 'function' || o[k].__w) return; const f = o[k]; const w = function (...a) { const t = performance.now(); try { return f.apply(this, a); } finally { P[name] = (P[name] || 0) + performance.now() - t; } }; w.__w = true; o[k] = w; };
    wrap(__G.paint, 'flush', 'paint.flush'); wrap(__G.env, 'update', 'env.update'); wrap(__G.fx, 'update', 'fx.update'); wrap(I.screenfx, 'update', 'screenfx.update');
    wrap(I.showcase, 'update', 'showcase.update'); wrap(I, '_updateHud', 'hud'); wrap(I.diorama, 'update', 'diorama.update'); wrap(I.match, 'update', 'match.update');
    wrap(I.match, 'updateController', 'controller'); wrap(I.rig, 'update', 'rig.update'); wrap(I.decor, 'update', 'decor.update'); wrap(I.props, 'update', 'props.update');
    wrap(I.swimWake, 'update', 'swimWake.update'); wrap(__G.projectiles, 'update', 'projectiles'); wrap(__G.specials, 'update', 'specials'); wrap(__G.subs, 'update', 'subs');
    wrap(I.fxHooks, 'update', 'fxHooks'); wrap(__G.net, 'update', 'net.update'); wrap(I, '_dioFog', 'dioFog'); wrap(I, '_updateLocalLoops', 'loops'); wrap(I, '_updateAmbience', 'ambience');
    wrap(I.match.learn, 'update', 'learn.update'); wrap(I.minimap, 'update', 'minimap.update'); wrap(I.minimap, 'draw', 'minimap.draw'); wrap(__G.hud, 'update', 'hud.update');
    for (const a of I.match.actors) { wrap(a, 'update', 'actor.update'); wrap(a, '_finishFrame', 'actor.finish'); }
  })));
  const info = await Promise.all([0, 1].map((i) => ev(i, () => { const m = __inkwave.match; return { mode: m.mode, kind: m.learnKind, actors: m.actors.length, teams: m.actors.map((a) => a.team), host: __G.net.isHost, gates: (m.learn.gates || []).length, items: m.learn.level.gates.map((g) => g.items.map((it) => it.id)) }; })));
  R.level = info;
  check('both in the level: same form, same level from the same content', info[0].kind === MODE && info[1].kind === MODE && JSON.stringify(info[0].items) === JSON.stringify(info[1].items), `${MODE}: ${info[0].actors} squidkids, teams ${JSON.stringify(info[0].teams)}, ${info[0].items.flat().length} items`);

  // the simulation in the engine's own largest step (main.js clamps a slow frame to 1/24 s), a few frames per evaluate so
  // each page's event loop runs in between: its pings must reach the relay (a socket silent for 20 s in a match is dropped)
  const FDT = 1 / 24, CHUNK = 4, SPEED = 2;   // (2 × real time: ~50 messages a second a socket, under the relay's 90)
  const stepPerf = { calls: 0, frames: 0, ms: 0, chunks: 0 };
  // (and never much faster than real time: a stepped client sends a tick per simulated 1/20 s, and the relay cuts off a
  // socket that sends far more than a real one would — 90 messages a second)
  const step = async (sec) => {
    const n = Math.max(1, Math.round(sec / FDT)), t = Date.now();
    for (let done = 0; done < n; done += CHUNK) {
      const k = Math.min(CHUNK, n - done), tc = Date.now();
      const ms = await Promise.all([0, 1].map((i) => ev(i, (k, dt) => { const I = __inkwave, t0 = performance.now(); I._skipRender = true; try { for (let j = 0; j < k; j++) I._frame(dt); } finally { I._skipRender = false; } return [Math.round(performance.now() - t0), __G.net.state, I.match && I.match.state]; }, k, FDT)));
      if (stepPerf.chunks++ < 4) say(`chunk of ${k} frames: ${Date.now() - tc} ms wall · page ms/net/state ${JSON.stringify(ms)}`);
      if (args.includes('--profile') && stepPerf.chunks <= 2) for (const i of [0, 1]) say(`  c${i} profile: ${await ev(i, () => JSON.stringify(Object.entries(window.__prof || {}).filter(([, v]) => v > 50).sort((a, b) => b[1] - a[1]).map(([k, v]) => k + ' ' + Math.round(v))))}`);
      const ahead = (done + k) * FDT * 1000 / SPEED - (Date.now() - t);
      await sleep(Math.max(5, ahead));
    }
    stepPerf.calls++; stepPerf.frames += n; stepPerf.ms += Date.now() - t;
    if (stepPerf.calls % 10 === 1) say(`step: ${(stepPerf.ms / stepPerf.frames).toFixed(0)} ms per stepped frame (both pages), ${(stepPerf.frames * FDT).toFixed(1)} s simulated`);
  };
  R.stepPerf = stepPerf;
  const shot = async (i, name) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); await ev(i, () => __inkwave.debug.step(16.7)); await pages[i].screenshot({ path: `${SHOTS}/${MODE}-${name}-c${i}.png` }); say('shot', `${SHOTS}/${MODE}-${name}-c${i}.png`); };
  // the live question on a screen (the flow's own record of it: never read off the stage)
  const live = (i) => ev(i, () => {
    const m = __inkwave.match, F = m && m.learn, A = __G.hud.learn._ask;
    if (!F || !A || A.answered) return null;
    const q = F.q || null;
    return { q: q ? q.q : F.cq || null, id: (F.asking && F.asking.item.id) || null, type: A.p.type, text: A.p.text, opts: A.p.options ? A.p.options.length : 0, hasInput: !!document.querySelector('.iw-learn__input:not([disabled])'), tts: !!A.p.tts, at: q && q.t0 ? performance.timeOrigin + q.t0 * 1000 : performance.timeOrigin + performance.now(), role: q ? q.role || null : null, play: getComputedStyle(__G.hud.learn.playBtn).display !== 'none', clueHint: (document.querySelector('.iw-learn__clue') || {}).textContent || null };
  });
  // answer the live question right / wrong through the DOM (the right answer from the flow's own rightAnswer())
  const answer = (i, right) => ev(i, (right) => {
    const F = __inkwave.match.learn, A = __G.hud.learn._ask;
    if (!A || A.answered) return 'none';
    const want = F.rightAnswer ? F.rightAnswer() : null;
    if (A.p.type === 'choice') {
      const btns = [...document.querySelectorAll('.iw-learn__opt')];
      let k = typeof want === 'number' ? want : btns.findIndex((b) => b.querySelector('.iw-learn__opten').textContent === String(want));
      if (k < 0) k = 0;
      if (!right) k = k === 0 ? 1 : 0;
      btns[k].click();
      return 'choice ' + k;
    }
    const inp = document.querySelector('.iw-learn__input');
    if (!inp) return 'no form';
    inp.value = right ? String(want || '') : 'zzz qqq';
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    return 'typed ' + inp.value;
  }, right);
  const state = (i) => ev(i, () => {
    const m = __inkwave.match, F = m && m.learn, Z = m && m.zones;
    return { state: m && m.state, t: m && +m.time.toFixed(1), host: __G.net.isHost, net: __G.net.state, err: __G.net.error, dbg: F && F.debug ? F.debug() : null,
      log: F ? F.log.map((e) => e.name.replace('learn:', '') + (e.ok != null ? (e.ok ? '+' : '-') : '') + (e.first ? '*' : '') + (e.q != null ? '@' + e.q : '') + (e.by ? ':' + e.by : '')).join(' ') : '',
      zone: Z ? { share: Z.active.zones.map((z) => z.share.map((s) => +s.toFixed(3))), count: Z.count.map((c) => Math.ceil(c)), winner: Z.winner, reason: Z.reason } : null,
      results: !!document.querySelector('.iw-results'), strip: (document.querySelector('.iw-res__learn') || {}).innerText || null, learnCard: (document.querySelector('.iw-learn.is-done .iw-learn__results') || {}).innerText || null,
      ev: Object.keys(JSON.parse(localStorage.getItem('inkwave:learn:v1') || '{"ev":{}}').ev || {}) };
  });

  const drive = MODE === 'coop2' ? (await import('./net-duo-coop.mjs')).driveCoop : driveVersus;
  await drive({ step, live, answer, state, shot, ev, pages, check, mark, say, sleep, R, budgetLeft: () => BUDGET - (Date.now() - T0) });
} catch (e) {
  say('ERROR', e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e);
  R.error = String(e && e.message || e);
}
report();
clearTimeout(watchdog);
cleanup();
process.exit(R.checks.every((c) => c.ok) && !R.error ? 0 : 1);

// ------------------------------------------------------------------------------------------------ versus2
async function driveVersus({ step, live, answer, state, shot, ev, check, mark, say, sleep, R, budgetLeft }) {
  const seen = new Map();   // q → [live on c0, live on c1]
  const plan = { 1: { first: 1, fast: [false, true], right: [true, true] }, 2: { first: 0, fast: [true, false], right: [true, false] } };
  let shots = 0, lastSig = '', resultsSeen = 0;
  while (budgetLeft() > 6000) {
    await step(0.5);
    const L = await Promise.all([live(0), live(1)]);
    for (const i of [0, 1]) {
      const x = L[i]; if (!x || !x.q) continue;
      const s = seen.get(x.q) || [null, null];
      if (s[i]) continue;
      s[i] = x; seen.set(x.q, s);
    }
    for (const [q, s] of seen) {
      if (!s[0] || !s[1] || s.done) continue;
      s.done = true;
      if (!R.firstQ) {
        mark('sameQuestion');
        R.firstQ = { q, ids: [s[0].id, s[1].id], types: [s[0].type, s[1].type], text: s[0].text, shownApartMs: Math.round(Math.abs(s[0].at - s[1].at)) };
        check('same question at the same time on both screens', s[0].id === s[1].id && s[0].id && Math.abs(s[0].at - s[1].at) < 1500, `q${q} ${s[0].id} (${s[0].type}) shown ${R.firstQ.shownApartMs} ms apart`);
        if (SHOT_Q && shots++ < 1) { await shot(0, 'q1'); await shot(1, 'q1'); }
      }
      const P = plan[q] || { fast: [true, false], right: [true, true] };
      const order = P.fast[0] ? [0, 1] : [1, 0];
      say(`q${q}: ${order.map((i) => `c${i} ${P.right[i] ? 'right' : 'wrong'}`).join(' then ')}`);
      say(`  c${order[0]}:`, await answer(order[0], P.right[order[0]]));
      await sleep(1500);
      say(`  c${order[1]}:`, await answer(order[1], P.right[order[1]]));
    }
    const S = await Promise.all([state(0), state(1)]);
    const sig = S.map((x) => `${x.state}/${x.net}${x.err ? '!' + x.err : ''} q${x.dbg ? x.dbg.q : '-'} closed ${x.dbg ? x.dbg.closed : '-'} t${x.t}`).join(' | ');
    if (sig.replace(/ t[\d.]+/g, '') !== lastSig) { lastSig = sig.replace(/ t[\d.]+/g, ''); say(sig); }
    if (S.some((x) => x.net !== 'match')) { say('a client left the match:', sig); break; }
    if (S.some((x) => x.state === 'finish' || x.state === 'judge' || x.state === 'results') && !R.t.matchEnd) {
      mark('matchEnd'); say('match over:', S.map((x) => x.state + ' ' + JSON.stringify(x.zone)).join(' | '));
      // INKWAVE's judge runs on the HUD's own rAF effect clock, which a stepped, GPU-starved page barely ticks: its debug
      // multiplier (hud.timeScale) plays it through in a few ticks
      await Promise.all([0, 1].map((i) => ev(i, () => { __G.hud.timeScale = 25; })));
    }
    // (the results screen builds a moment after the state turns: wait for the strip itself, a few seconds at most)
    if (S.every((x) => x.results && x.strip)) break;
    if (R.t.matchEnd && S.every((x) => x.state === 'results')) { resultsSeen = resultsSeen || Date.now(); if (Date.now() - resultsSeen > 8000) break; }
  }
  const S = await Promise.all([state(0), state(1)]);
  R.final = S.map((x) => ({ state: x.state, net: x.net, err: x.err, host: x.host, log: x.log, zone: x.zone, strip: x.strip, ev: x.ev, dbg: x.dbg }));
  for (const [i, x] of S.entries()) say(`c${i} ${x.host ? 'host ' : 'guest'} log: ${x.log}`);
  const inks = S.map((x) => (x.log.match(/ink@\d+:\S+/g) || []));
  check('ink: the first right answer by own time inked, the same on both screens', inks[0].length >= 1 && JSON.stringify(inks[0]) === JSON.stringify(inks[1]), JSON.stringify(inks[0]));
  const q1 = inks[0].find((s) => s.startsWith('ink@1')), q2 = inks[0].find((s) => s.startsWith('ink@2'));
  check('question 1: the guest inked (right 1.5 s sooner by its own clock; the host\'s answer reached the referee first)', q1 === 'ink@1:' + R.ids[1], `${q1} (host ${R.ids[0]}, guest ${R.ids[1]})`);
  check('question 2: the host inked (right at once; the guest answered wrong)', q2 === 'ink@2:' + R.ids[0], String(q2));
  check('flood: the zone shares moved on both screens and agree', S.every((x) => x.zone && x.zone.share[0][0] + x.zone.share[0][1] > 0) && Math.abs(S[0].zone.share[0][0] - S[1].zone.share[0][0]) < 0.05 && Math.abs(S[0].zone.share[0][1] - S[1].zone.share[0][1]) < 0.05, JSON.stringify(S.map((x) => x.zone && x.zone.share)));
  check('evidence: each player\'s first answers went to their own store', S.every((x) => x.ev.length >= 1), JSON.stringify(S.map((x) => x.ev)));
  check('results: INKWAVE\'s results screen with the answers strip on both', S.every((x) => x.results && x.strip && /双人联机赛/.test(x.strip)), JSON.stringify(S.map((x) => x.strip)));
  if (S.every((x) => x.results)) mark('results');
  if (budgetLeft() > 12000) { await shot(0, 'results'); await shot(1, 'results'); }
}
