// 关卡学习 · two players online (docs/LEARN.md §14): the Node relay + the game's file server + two headless browsers,
// one room — the lobby screen of versus2 (双人联机赛) / coop2 (双人成形合作赛): net-duo-lobby.mjs (MODE arrows, the 课 row,
// coop2's locks and start rule; then the guest back in through the join card by the code, 准备, the host's 开始 — driveJoinUi). Starts and stops its own relay and file server (free ports; nothing left running).
// (play-8: the match itself — the questions as things on both screens — is tools/learn/net-duo-play.mjs; the card-era
// match drive that stood here is gone with the cards.)
//
// usage: node tools/learn/net-duo.mjs --lobby [--mode versus2|coop2] [--week 1] [--day 1] [--map tidewater] [--bots]
//                                      [--budget 300] [--shots <dir>] [--w 400 --h 225]
//   needs puppeteer-core (npm install, or a node_modules linked from a checkout that has it) and Chrome (CHROME_PATH).
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
const BOTS = args.includes('--bots'), BUDGET = +opt('budget', 300) * 1000, SHOTS = opt('shots', null), SHOT_Q = args.includes('--shot-question');
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
  // (the pages boot on the match's own stage: coop2 then needs no rebuild — on software GL a fresh stage's first frames stall)
  const url = `http://127.0.0.1:${hport}/?skipTitle&quality=low&map=${MAP}&relay=ws://127.0.0.1:${rport}`;
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
  R.lobbyOnly = true;   // (the lobby screen check: the match is net-duo-play.mjs's)
  {
    const step = (sec) => Promise.all([0, 1].map((i) => ev(i, (n) => { const I = __inkwave; I._skipRender = true; try { for (let j = 0; j < n; j++) I._frame(1 / 24); } finally { I._skipRender = false; } }, Math.max(1, Math.round(sec * 24)))));
    const shot = async (i, name) => { if (!SHOTS) return; mkdirSync(SHOTS, { recursive: true }); await ev(i, () => __inkwave.debug.step(16.7)); await pages[i].screenshot({ path: `${SHOTS}/${name}-c${i}.png` }); say('shot', `${SHOTS}/${name}-c${i}.png`); };
    const L = await import('./net-duo-lobby.mjs');
    await L.driveLobby({ step, ev, check, mark, say, shot });
    await L.driveJoinUi({ step, ev, check, mark, say, shot }, code);   // the guest back in through the screens, ready, the host's 开始
    throw Object.assign(new Error('lobby check done'), { done: true });
  }
} catch (e) {
  if (!(e && e.done)) {
    say('ERROR', e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e);
    R.error = String(e && e.message || e);
  }
}
report();
clearTimeout(watchdog);
cleanup();
process.exit(R.checks.every((c) => c.ok) && !R.error ? 0 : 1);
