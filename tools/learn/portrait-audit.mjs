// 关卡学习 I (docs/LEARN.md §17): every screen she can reach from the main menu of her App, held upright — 390 × 844, touch,
// 1 css px = 1 pt — opened by tapping (puppeteer's touchscreen, so a tap that lands on something else shows up), measured
// (portrait-measure.js: targets under 44 pt, covered, off screen; clipped text; a short label wrapped; the way back) and
// left again by its own back control. Prints one row per screen and a JSON report; screenshots only with --shots.
//
// usage: node tools/learn/portrait-audit.mjs --group menus|kit|online|versus2|level|boss [--shots <dir>] [--lang en]
//                                             [--w 390 --h 844] [--budget 170] [--motion] [--only screenA,screenB]
//   menus    main · 学习 · 设置 · 怎么玩 · 制作人员 (and back to main from each)
//   kit      装备 · 换装
//   online   联机 hub · the code typed on the phone's keyboard (a wrong one) · create a room → the room · its weapon drawer ·
//            the locker from the room and back                          (a Node relay of its own on a free port)
//   room     create → the room · the emote wheel · MODE ▶ 双人合作赛 · leave (the modal) → the hub → main   (relay too)
//   zone     a Zone Control match on the phone (the 对抗赛 level: Zone Control + the question layer, standing in for a 双人联机赛,
//            which is the same HUD and the same card): the fire / sub / special / cheer keys shown as versus2 shows them, a
//            question up, play, the room's pause (G.netm stood in: the battle pause), the results of a 双人联机赛 (its data
//            injected: the Zone Control results with the questions strip)
//   level    ?learn=w1d1&kind=puzzle&short=1 → the walk HUD (the clock vs the next-gate bar) → a question → the level's pause
//   boss     ?learn=w1&kind=boss&short=1 → the W phase's write question → a near miss → 「我的写法也对」
// Needs puppeteer-core and Chrome (CHROME_PATH); software GL is fine: ?quality=low, shadows / bloom off, the game clock frozen
// (debug.freeze) and stepped by hand. Reduced motion is emulated (no wipes / pop-ins: stable boxes) unless --motion.
import puppeteer from 'puppeteer-core';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { chromePath, gpuArgs } from '../chrome.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const GROUP = opt('group', 'menus'), SHOTS = opt('shots', null), LANG = opt('lang', null);
const W = +opt('w', 390), H = +opt('h', 844), BUDGET = +opt('budget', 170) * 1000;
const T0 = Date.now();
const say = (...a) => console.log(`[portrait ${((Date.now() - T0) / 1000).toFixed(1).padStart(5)}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const kids = [], logs = [], rows = [];
let browser = null;
const cleanup = () => { try { browser?.process()?.kill('SIGKILL'); } catch { /* gone */ } for (const k of kids) { try { k.kill('SIGTERM'); } catch { /* gone */ } } };
process.on('exit', cleanup);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { cleanup(); process.exit(130); });
const watchdog = setTimeout(() => { say('WATCHDOG — out of budget'); report(); cleanup(); process.exit(2); }, BUDGET);
watchdog.unref?.();
const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
async function waitHttp(url, ms = 15000) { const t = Date.now(); while (Date.now() - t < ms) { try { const r = await fetch(url); if (r.ok || r.status === 404) return; } catch { /* not yet */ } await sleep(150); } throw new Error('not up: ' + url); }

function report() {
  console.log('\n[portrait] ===== screens (390 × 844, touch, pt) =====');
  for (const r of rows) {
    const m = r.m || {};
    const bits = [`${r.name.padEnd(18)}`, r.reached ? 'in ✓' : 'in ✗', r.backOk == null ? 'back –' : r.backOk ? 'back ✓' : 'back ✗',
      `min ${m.minTarget ? `${m.minTarget.w}×${m.minTarget.h} «${m.minTarget.name}»` : '–'}`,
      `<44: ${(m.small || []).length}`, `covered: ${(m.covered || []).length}`, `off: ${(m.offscreen || []).length}`, `clip: ${(m.clipped || []).length}`, `wrap: ${(m.wrapped || []).length}`, m.gate ? 'GATE' : ''];
    console.log(bits.join(' · '));
  }
  console.log('\n[portrait] ===== details =====');
  console.log(JSON.stringify(rows.map((r) => ({ name: r.name, reached: r.reached, backOk: r.backOk, note: r.note, gate: r.m && r.m.gate, minTarget: r.m && r.m.minTarget,
    small: r.m && r.m.small.map((x) => `${x.name} ${x.w}×${x.h}`), covered: r.m && r.m.covered.map((x) => `${x.name} ← ${x.covered}`), offscreen: r.m && r.m.offscreen.map((x) => `${x.kind} ${x.name || x.text} @${x.x},${x.y} ${x.w}×${x.h}`),
    clipped: r.m && r.m.clipped.map((x) => `${x.text} (${x.w}/${x.need})`), wrapped: r.m && r.m.wrapped.map((x) => `${x.text} in ${x.in}`), scrollers: r.m && r.m.scrollers, back: r.m && r.m.back, extra: r.extra })), null, 1));
  const bad = logs.filter((l) => !/404|preload|KHR_parallel|GPU stall|ReadPixels|WebGL|swiftshader|Automatic fallback|favicon/i.test(l));
  if (bad.length) console.log('[portrait] console:\n' + bad.slice(0, 30).join('\n'));
}

let page, ev;
const step = (n = 2) => ev((k) => { for (let i = 0; i < k; i++) __inkwave.debug.step(16.7); }, n);
const cur = () => ev(() => __inkwave.menus.current);
const waitFor = async (fn, ms = 20000, what = '', ...a) => { const t = Date.now(); for (;;) { if (await ev(fn, ...a)) return true; if (Date.now() - t > ms) { say('timeout:', what); return false; } await step(1); await sleep(120); } };
async function tap(sel, what) {
  const c = await ev((s) => window.__iwCenter(s), sel);
  if (!c) { say('no target to tap:', what || sel); return false; }
  await page.touchscreen.tap(c.x, c.y);
  await step(2);
  return true;
}
const SHOT_ONLY = opt('only', '') ? new Set(opt('only', '').split(',')) : null;   // --only a,b: screenshots of these screens only (a shot of a 3D screen costs 10–40 s on software GL)
async function shot(name) {
  if (!SHOTS || (SHOT_ONLY && !SHOT_ONLY.has(name))) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${GROUP}-${name}.png` });
  say('shot', `${SHOTS}/${GROUP}-${name}.png`);
}
async function measure(name, { scopes = null, back = null, reached = true, note = '', extra = null, settle = 0, noStep = false } = {}) {
  // settle: ms of game clock first, one render at the end (the 3D pedestal / line-up camera glides in over ~1.5 s)
  // noStep: measure the page as it stands (no game frames — e.g. while an audit stand-in is in place)
  if (settle) await ev((ms) => __inkwave.debug.step(ms), settle);
  if (!noStep) await step(2);
  const m = await ev((s, b) => window.__iwMeasure(s, b), scopes, back);
  const row = { name, reached, m, note, extra };
  rows.push(row);
  say(`${name}: screen ${m.screen}${m.modal ? ' (modal)' : ''} · ${m.targets.length} targets · min ${m.minTarget ? m.minTarget.w + '×' + m.minTarget.h : '–'} · <44 ${m.small.length} · covered ${m.covered.length} · off ${m.offscreen.length} · clip ${m.clipped.length} · wrap ${m.wrapped.length}${m.gate ? ' · GATE' : ''}`);
  await shot(name);
  return row;
}
// a menu screen from main: tap its main-menu button, measure, tap its back control, check we are on main again
async function visit(id, screen, back = '.iw-backbtn', o = {}) {
  if ((await cur()) !== 'main') { await ev(() => __inkwave.menus.show('main')); await step(3); }
  const ok = await tap(`.iw-main__menu [data-id="${id}"]`, id) && await waitFor((s) => __inkwave.menus.current === s, 8000, 'open ' + screen, screen);
  const { keepOpen, ...mo } = o;
  const row = await measure(screen, { back, reached: ok, ...mo });
  if (!ok || keepOpen) return row;
  await tap(back, 'back of ' + screen);
  row.backOk = await waitFor(() => __inkwave.menus.current === 'main', 8000, 'back to main from ' + screen);
  return row;
}

try {
  const hport = await freePort();
  const files = spawn('python3', [resolve(ROOT, 'tools/serve.py'), String(hport), '--dir', ROOT], { stdio: ['ignore', 'ignore', 'ignore'] });
  kids.push(files);
  let relayQ = '';
  if (GROUP === 'online' || GROUP === 'room' || GROUP === 'versus2') {
    const rport = await freePort();
    const relay = spawn(process.execPath, [resolve(ROOT, 'server/node/relay.mjs'), '--port', String(rport), '--host', '127.0.0.1', '--silent-match', '150000'], { stdio: ['ignore', 'pipe', 'inherit'] });
    relay.stdout.on('data', (d) => { for (const l of String(d).split('\n')) if (l.trim() && !/listening|opened/.test(l)) say('relay', l.trim()); });
    kids.push(relay);
    await waitHttp(`http://127.0.0.1:${rport}/health`);
    relayQ = `&relay=ws://127.0.0.1:${rport}`;
  }
  await waitHttp(`http://127.0.0.1:${hport}/index.html`);
  const q = GROUP === 'level' ? 'learn=w1d1&kind=puzzle&short=1' : GROUP === 'boss' ? 'learn=w1&kind=boss&short=1' : GROUP === 'zone' ? 'learn=w1d6&kind=duel&short=1' : 'skipTitle';
  const url = `http://127.0.0.1:${hport}/?${q}&from=app&quality=low${LANG ? '&lang=' + LANG : ''}${relayQ}`;
  browser = await puppeteer.launch({ executablePath: chromePath(), headless: 'new', defaultViewport: { width: W, height: H, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    args: gpuArgs([`--window-size=${W},${H}`, '--disable-background-timer-throttling', '--disable-renderer-backgrounding']) });
  page = await browser.newPage();
  if (!args.includes('--motion')) await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
  await page.evaluateOnNewDocument(() => { try { const k = 'inkwave.settings', v = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(v, { quality: 'low', shadows: false, bloom: false, touchControls: 'on' }); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* */ } });
  page.on('console', (m) => { const t = m.type(); if (t === 'error' || t === 'warn' || t === 'warning') logs.push(`[${t}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
  ev = (fn, ...a) => page.evaluate(fn, ...a);
  say('open', url);
  await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForFunction('window.__inkwave && window.__G && __inkwave.debug && (__G.mode === "menu" || (__inkwave.match && __inkwave.match.learn))', { timeout: 120000, polling: 250 });
  await page.addScriptTag({ content: readFileSync(resolve(ROOT, 'tools/learn/portrait-measure.js'), 'utf8') });
  await ev(() => __inkwave.debug.freeze());
  say('booted', JSON.stringify(await ev(() => ({ touch: __inkwave.touchMode, win: innerWidth + '×' + innerHeight, screen: __inkwave.menus.current, mode: __G.mode }))));
  const { GROUPS } = await import('./portrait-groups.mjs');
  if (!GROUPS[GROUP]) throw new Error('no such group: ' + GROUP);
  await GROUPS[GROUP]({ ev, step, cur, waitFor, tap, measure, visit, shot, say, sleep, page, rows });
} catch (e) { say('error', e && e.stack || e); }
report();
cleanup();
process.exit(0);
