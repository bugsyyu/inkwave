// 题即玩法 play-6 · two players online, the questions as things (docs/PLAY.md §5.5 / §10, LEARN §25): the Node relay, a file
// server and two headless Chromium (playwright: tools/learn/net-duo.mjs's puppeteer-core is not on every box), one room,
// one short match of versus2 (双人联机赛) or coop2 (双人成形合作赛), driven through G.net and measured on both screens. As
// net-duo.mjs does it: the pages are frozen once booted (the room, the start, the build, ready / go run on messages and
// timers) and the match is stepped by hand at the engine's largest step, ~2 × real time (software GL renders a frame in
// seconds; the rules are measured, not the renderer). It starts and stops its own relay, file server and browsers.
//
// usage: NODE_PATH=/opt/node22/lib/node_modules node tools/learn/net-duo-play.mjs --mode versus2|coop2
//          [--view portrait|landscape] [--week 1] [--day 1] [--map tidewater] [--shots <dir>] [--budget 175]
//   one browser run at a time: flock -w 9000 /tmp/ielts-browser.lock nice -n 10 node tools/learn/net-duo-play.mjs …
//   --view portrait = 390 × 844 (?from=app, the App's WKWebView) · landscape = 844 × 390; both with touch
//
// Every question, on both screens: no .iw-learn__panel shown, match.paused false, learn.hold falsy, the strip up.
//   versus2: the same mechanic, the same labels in the same order and the same right object on both; every object inside
//            the safe area (under the strip, 16 px from the sides); a TAP on an object (touch.js → G.playTap → her round →
//            the hit) answers; q1 the guest right first (by its own clock), the host right 1.5 s later → the guest inks;
//            q2 the host right, the guest wrong → the host inks; the flood agrees on both; each first answer in its own store;
//            the host calls the match; INKWAVE's results with the answers strip on both.
//   coop2:   both auto-walk onto their pads; the host declares the gate; the clue screen has a board (or the strip) and
//            NOTHING to answer with (no objects registered, no keyboard, no card; the board's hotspots only 再听 / 读全文),
//            the answering screen has the objects / the 打字蟹 and no ▶, no stem; the first answer wrong → both screens show
//            the verdict, the item comes back reworded to the OTHER player; the gates open on both; the results card on both.
// Screenshots (--shots): <mode>-<view>-<what>.png — the two screens side by side.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import zlib from 'node:zlib';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const MODE = opt('mode', 'versus2'), WEEK = +opt('week', 1), DAY = +opt('day', 1), MAP = opt('map', 'tidewater');
const VIEW = opt('view', 'portrait'), PLAY = true, SHOTS = opt('shots', null), BUDGET = +opt('budget', 176) * 1000;
const [W, H] = VIEW === 'landscape' ? [844, 390] : [390, 844];
// coop2: the audit's hand puts each squidkid on its own pad at a gate (as the auto-walk ends there — B's walk is not what
// is measured, and a 3-minute run has no room for it); --walk lets the auto-walk take them
const WALK = args.includes('--walk');
const T0 = Date.now();
const ts = () => ((Date.now() - T0) / 1000).toFixed(1).padStart(5);
const say = (...a) => console.log(`[duo-play ${MODE} ${VIEW}${PLAY ? '' : ' play=0'} ${ts()}]`, ...a);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const budgetLeft = () => BUDGET - (Date.now() - T0);

const kids = [], browsers = [], pages = [], logs = [], SHOTQ = [];
let srv = null, finished = false;
const R = { mode: MODE, view: VIEW, size: `${W}x${H}`, play: PLAY, week: WEEK, day: DAY, map: MAP, t: {}, checks: [], questions: [] };
const mark = (k) => { R.t[k] = +((Date.now() - T0) / 1000).toFixed(1); };
const check = (name, ok, detail = '') => { R.checks.push({ name, ok: !!ok, detail: typeof detail === 'string' ? detail : JSON.stringify(detail) }); say(`${ok ? 'PASS' : 'FAIL'} ${name}${detail && !ok ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 700) : ''}`); return !!ok; };
function report() {
  console.log('\n[duo-play] ===== report =====');
  console.log(JSON.stringify(R, null, 1).slice(0, 60000));
  const bad = logs.filter((l) => !/404|preload|KHR_parallel|GPU stall|ReadPixels|WebGL|swiftshader|Automatic fallback|AudioContext|autoplay/i.test(l));
  if (bad.length) console.log('[duo-play] console:\n' + bad.slice(0, 30).join('\n'));
  const fails = R.checks.filter((c) => !c.ok);
  console.log(`[duo-play] ${MODE} ${VIEW}: ${R.checks.length - fails.length} / ${R.checks.length} checks passed${R.error ? ' · ERROR ' + R.error : ''}`);
  for (const f of fails) console.log('  FAIL ' + f.name);
}
// (everything we started goes with us: the browsers, the relay, the file server — never anything else)
async function cleanup() {
  for (const b of browsers) { try { await Promise.race([b.close(), sleep(5000)]); } catch (e) { /* gone */ } }
  for (const k of kids) { try { k.kill('SIGTERM'); } catch (e) { /* gone */ } }
  try { srv?.close(); } catch (e) { /* gone */ }
}
async function finish(code) {
  if (finished) return; finished = true;
  clearTimeout(watchdog);
  report();
  await cleanup();
  // (the side-by-side pictures are put together here, the browsers gone: no page time spent on them)
  for (const S of SHOTQ) { try { fs.writeFileSync(S.file, pngSideBySide(S.imgs, 24, [21, 18, 28])); console.log('[duo-play] shot ' + S.file + ' — ' + S.caps.join(' | ')); } catch (e) { console.log('[duo-play] shot failed ' + S.file + ': ' + e.message); } }
  process.exit(code != null ? code : (R.checks.every((c) => c.ok) && !R.error && R.checks.length ? 0 : 1));
}
const watchdog = setTimeout(() => { say('WATCHDOG — out of budget, stopping'); R.error = R.error || 'budget'; finish(2); }, BUDGET);
for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(sig, () => { R.error = 'signal ' + sig; finish(130); });
process.on('unhandledRejection', (e) => { R.error = 'driver: ' + String(e && e.message || e); finish(1); });

const freePort = () => new Promise((res, rej) => { const s = createServer(); s.unref(); s.on('error', rej); s.listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => res(p)); }); });
async function waitHttp(url, ms = 15000) {
  const t = Date.now();
  while (Date.now() - t < ms) { try { const r = await fetch(url); if (r.ok || r.status === 404) return true; } catch (e) { /* not yet */ } await sleep(150); }
  throw new Error('not up: ' + url);
}
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', woff2: 'font/woff2', woff: 'font/woff', ttf: 'font/ttf', mp3: 'audio/mpeg', ogg: 'audio/ogg', wasm: 'application/wasm', txt: 'text/plain; charset=utf-8', glb: 'model/gltf-binary', bin: 'application/octet-stream', ktx2: 'image/ktx2' };

try {
  // ---- the relay (our child) and the file server (in this process)
  const rport = await freePort();
  // (software GL stalls a page for tens of seconds on a fresh stage's first frames: 150 s of silence allowed in a match)
  const relay = spawn(process.execPath, [path.resolve(ROOT, 'server/node/relay.mjs'), '--port', String(rport), '--host', '127.0.0.1', '--silent-match', '150000'], { stdio: ['ignore', 'pipe', 'inherit'] });
  relay.stdout.on('data', (d) => { for (const l of String(d).split('\n')) if (l.trim() && !/listening|opened/.test(l)) say('relay:', l.trim()); });
  kids.push(relay);
  srv = http.createServer((q, r) => {
    let u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
    if (u === '/') u = '/index.html';
    const p = path.join(ROOT, u);
    if (u === '/songs/manifest.json' && !fs.existsSync(p)) { r.writeHead(200, { 'content-type': MIME.json }); return r.end('{ "tracks": {} }'); }
    if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
    r.writeHead(200, { 'content-type': MIME[path.extname(p).slice(1)] || 'application/octet-stream', 'cache-control': 'no-store' });
    fs.createReadStream(p).pipe(r);
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const hport = srv.address().port;
  await waitHttp(`http://127.0.0.1:${rport}/health`);
  say(`relay :${rport} · files :${hport} · ${W}×${H}`);

  // ---- two browsers, phones (touch), both on the match's own stage
  const url = `http://127.0.0.1:${hport}/?skipTitle&quality=low&nofullscreen&noclips&map=${MAP}&relay=ws://127.0.0.1:${rport}${VIEW === 'portrait' ? '&from=app' : ''}`;
  const open = async (i) => {
    const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required', '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
    browsers[i] = b;
    const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(() => { try { const k = 'inkwave.settings', v = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(v, { quality: 'low', shadows: false, bloom: false, touchControls: 'on' }); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* none */ } });
    const p = await ctx.newPage();
    p.on('console', (m) => { const t = m.type(); if (t === 'error' || t === 'warning') logs.push(`c${i} [${t}] ${m.text().slice(0, 400)}`); });
    p.on('pageerror', (e) => logs.push(`c${i} [pageerror] ${e.message}\n${(e.stack || '').split('\n').slice(0, 4).join('\n')}`));
    await p.goto(url, { waitUntil: 'load', timeout: 120000 });
    await p.waitForFunction(() => window.__inkwave && window.__G && __G.net && __G.mode === 'menu', null, { timeout: 120000, polling: 250 });
    await p.evaluate(() => { __inkwave.debug.freeze(); });   // (the menu's attract match would only slow every poll down)
    pages[i] = p;
  };
  await Promise.all([open(0), open(1)]);
  mark('booted'); say('both booted');
  const ev = (i, fn, a) => pages[i].evaluate(fn, a);
  const both = (fn, a) => Promise.all([0, 1].map((i) => ev(i, fn, a)));

  // ---- the room: create (host = c0), the mode and the short lesson, join, ready, start
  const code = await ev(0, async ([mode, week, day, map]) => { const c = await __G.net.create('Ann'); __G.net.setSettings({ mode, map, bots: false, learn: { week, day, short: true } }); return c; }, [MODE, WEEK, DAY, MAP]);
  await ev(1, async (c) => { await __G.net.join(c, 'Bo'); }, code);
  await pages[0].waitForFunction(() => __G.net.lobby.players.length === 2, null, { timeout: 30000, polling: 100 });
  await pages[1].waitForFunction((m) => __G.net.lobby.mode === m && __G.net.lobby.learn && __G.net.lobby.learn.short, MODE, { timeout: 30000, polling: 100 });
  await ev(1, () => __G.net.setMe({ ready: true }));
  await pages[0].waitForFunction(() => __G.net.canStart(), null, { timeout: 30000, polling: 100 });
  const lob = await both(() => ({ id: __G.net.myId, code: __G.net.code, mode: __G.net.lobby.mode, learn: __G.net.lobby.learn }));
  R.ids = lob.map((x) => x.id); mark('room');
  check('room: both in one room, the same mode and lesson', lob[0].code === lob[1].code && lob.every((x) => x.mode === MODE && x.learn.week === WEEK && x.learn.day === DAY), `${code} ${JSON.stringify(lob)}`);
  await ev(0, () => __G.net.start());
  await Promise.all([0, 1].map((i) => pages[i].waitForFunction(() => __G.net.state === 'match' && __inkwave.match && __inkwave.match.learn && (__inkwave.match.state === 'intro' || __inkwave.match.state === 'playing'), null, { timeout: 90000, polling: 200 })));
  mark('inLevel');
  // (software GL compiles the squidkids' programs long after the build; a stepped frame waits behind that queue)
  for (let k = 0; budgetLeft() > 60000; k++) {
    const P = await both(() => { const ps = __G.renderer.info.programs || []; return [ps.length, ps.filter((p) => p.isReady && !p.isReady()).length]; });
    if (k % 4 === 0 || P.every((x) => !x[1])) say(`shader programs (all / compiling): c0 ${P[0].join(' / ')} · c1 ${P[1].join(' / ')}`);
    if (P.every((x) => !x[1]) || k > 30) break;
    await sleep(1200);
  }
  mark('shadersReady');
  const info = await both(() => { const m = __inkwave.match, F = m.learn; return { kind: m.learnKind, mode: m.mode, host: __G.net.isHost, items: F.level.gates.map((g) => g.items.map((it) => it.id)), play: !!(F.arena || F.play), team: m.local ? m.local.team : null }; });
  R.level = info;
  check('both in the level: the same form, the same level from the same content', info.every((x) => x.kind === MODE) && JSON.stringify(info[0].items) === JSON.stringify(info[1].items), JSON.stringify(info.map((x) => [x.kind, x.team, x.play])));
  check('the play host on both screens', info.every((x) => x.play === true), JSON.stringify(info.map((x) => x.play)));

  // the stepper (net-duo.mjs's): the engine's largest step, a few frames per evaluate (each page's pings must reach the
  // relay), never much faster than 2 × real time (the relay cuts off a socket that sends far more than a real one)
  const FDT = 1 / 24, CHUNK = 4, SPEED = 2;
  const step = async (sec) => {
    const n = Math.max(1, Math.round(sec / FDT)), t = Date.now();
    for (let done = 0; done < n; done += CHUNK) {
      const k = Math.min(CHUNK, n - done);
      await both(([k, dt]) => { const I = __inkwave; I._skipRender = true; try { for (let j = 0; j < k; j++) I._frame(dt); } finally { I._skipRender = false; } }, [k, FDT]);
      const ahead = (done + k) * FDT * 1000 / SPEED - (Date.now() - t);
      await sleep(Math.max(5, ahead));
    }
  };
  // the two screens side by side, captioned (rendered once each — software GL takes a few seconds a frame)
  const pair = async (what, caps) => {
    if (!SHOTS || budgetLeft() < 12000) return;
    fs.mkdirSync(SHOTS, { recursive: true });
    const t = Date.now();
    await both(() => { __inkwave.debug.step(16.7); });   // (one rendered frame on each, at once)
    const imgs = await Promise.all([0, 1].map((i) => pages[i].screenshot()));
    const file = `${SHOTS}/${MODE}-${VIEW}${PLAY ? '' : '-play0'}-${what}.png`;
    imgs.forEach((b, i) => fs.writeFileSync(file.replace(/\.png$/, `-c${i}.png`), b));   // (each screen as it is, too)
    SHOTQ.push({ file, imgs, caps });
    R.shots = (R.shots || []).concat(file); say(`shot ${file} (${Date.now() - t} ms)`);
  };
  const helpers = { ev, both, step, pair, view: (i) => ev(i, VIEW_FN), store: (i) => ev(i, STORE_FN) };
  await (MODE === 'coop2' ? driveCoopPlay : driveVersusPlay)(helpers);
} catch (e) {
  say('ERROR', e && e.stack ? e.stack.split('\n').slice(0, 6).join('\n') : e);
  R.error = String(e && e.message || e);
}
await finish();

// ------------------------------------------------------------------------------------------------ what a screen shows
// (in the page) the learning layer's state on this screen: the card, the pause, the hold, the strip, the keyboard, the
// play host's live question (versus2: F.arena; coop2: F.play) — read off the flow and the DOM, never the picture
function VIEW_FN() {
  const I = __inkwave, m = I.match, F = m && m.learn; if (!F) return null;
  if (__G.camera) __G.camera.updateMatrixWorld();
  const vis = (el) => { if (!el) return false; const r = el.getBoundingClientRect(), cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05; };
  const panel = document.querySelector('.iw-learn__panel');
  const S = document.querySelector('.iw-ps'), box = document.querySelector('.iw-ps__box'), stripOn = !!(S && !S.classList.contains('is-off'));
  const sr = stripOn && box ? box.getBoundingClientRect() : null;
  const kb = document.querySelector('.iw-pk');
  const Hst = F.arena || F.play || null, d = F.debug ? F.debug() : {};
  const m1 = Hst && Hst.m1 && Hst.m1.cur ? Hst.m1.debug() : null;
  const q = d.form === 'versus2' ? (F.q ? { q: F.q.q, id: F.q.item.id, play: !!F.q.play, answered: !!F.q.answered, role: 'both' } : null) : (d.q || null);
  const logs = (F.log || []).map((e) => e.name.replace('learn:', '') + (e.ok != null ? (e.ok ? '+' : '-') : '') + (e.first ? '*' : '') + (e.q != null ? '@' + e.q : '') + (e.by ? ':' + e.by : '') + (e.none ? '~' : ''));
  return {
    form: d.form, host: !!__G.net.isHost, me: __G.net.myId, state: m.state, net: __G.net.state, err: __G.net.error || null, t: +m.time.toFixed(1), W: innerWidth, H: innerHeight,
    paused: !!m.paused, hold: !!F.hold, panelShown: vis(panel), cardUp: !!(__G.hud.learn && __G.hud.learn._ask && !__G.hud.learn._ask.answered && vis(panel)),
    q, phase: d.phase || null, cur: d.cur, gates: d.gates, on: d.on || null, mine: d.mine || null, me3: d.me || null,
    mech: Hst ? Hst.kind : null, right: F.rightAnswer ? F.rightAnswer() : null,
    strip: sr ? { x: Math.round(sr.left), y: Math.round(sr.top), w: Math.round(sr.width), bottom: Math.round(sr.bottom), text: (document.querySelector('.iw-ps__q') || {}).textContent || '', zh: (document.querySelector('.iw-ps__zh') || {}).textContent || '', play: vis(document.querySelector('.iw-ps__play')), verdict: S.classList.contains('is-verdict'), ok: S.classList.contains('is-ok'), head: (document.querySelector('.iw-ps__head') || {}).textContent || '', chip: (document.querySelector('.iw-ps__tag.is-on') || {}).textContent || '' } : null,
    kbOn: !!(kb && !kb.classList.contains('is-off') && vis(kb.querySelector('.iw-pk__panel'))),
    m1: m1 ? { placed: m1.placed, answered: m1.answered, n: m1.n, banner: m1.banner, labels: (m1.labels || []).map((l) => l.text + (l.zh ? '|' + l.zh : '')), safe: m1.safe, projected: m1.projected, verdict: m1.verdict, shot: m1.shot, framing: m1.framing && m1.framing.on, D: m1.D, lift: m1.lift, log: (m1.log || []).slice(-6),
      depth: (() => { const T = Hst.m1.T, c = __G.camera.position, out = []; for (let k = 0; k < (T.n || 0); k++) { const S = T.slots[k]; if (S && S.on) out.push(+Math.hypot(S.pos.x - c.x, S.pos.y - c.y, S.pos.z - c.z).toFixed(2)); } return out; })(),
      place: (m1.log || []).filter((e) => e.ev === 'place').pop() || null } : null,
    type: Hst && Hst.kind === 'type' ? Hst.type.debug() : null,
    clue: d.play && d.play.clue ? d.play.clue : null, playLog: d.play && d.play.log ? d.play.log : null,
    playTargets: !!__G.playTargets, playTap: !!__G.playTap,
    log: logs.join(' '),
    zone: m.zones ? { share: m.zones.active.zones.map((z) => z.share.map((s) => +s.toFixed(3))), winner: m.zones.winner, reason: m.zones.reason } : null,
    results: !!document.querySelector('.iw-results'), strip2: (document.querySelector('.iw-res__learn') || {}).innerText || null, learnCard: (document.querySelector('.iw-learn.is-done .iw-learn__results') || {}).innerText || null,
  };
}
// (in the page) coop2's walk to the gate: the auto-walk, or (the default) the audit's hand onto her own pad
function onPad(walk) {
  const F = __inkwave.match.learn, a = __inkwave.match.local;
  if (walk || !F._myPad) { if (!F.auto) F.autoWalk(true); return; }
  const p = F._myPad(F.gates[F.cur]);
  if (p && a && a.alive && Math.hypot(a.pos.x - p.x, a.pos.z - p.z) > 0.5) { a.pos.set(p.x, p.y + 0.05, p.z); if (a.vel) a.vel.set(0, 0, 0); }
}
// (in the page) the item ids in this device's evidence (A's store: { ev: { doc: { it: { id: … } } } })
// two PNG screenshots (8-bit RGB / RGBA, as Chromium writes them) side by side on a dark ground — zlib only, no deps
function pngDecode(buf) {
  let p = 8, w = 0, h = 0, ct = 0; const idat = [];
  while (p < buf.length) {
    const len = buf.readUInt32BE(p), type = buf.toString('ascii', p + 4, p + 8), d = buf.subarray(p + 8, p + 8 + len);
    if (type === 'IHDR') { w = d.readUInt32BE(0); h = d.readUInt32BE(4); if (d[8] !== 8 || d[12]) throw new Error('png: 8-bit, not interlaced only'); ct = d[9]; }
    else if (type === 'IDAT') idat.push(d); else if (type === 'IEND') break;
    p += 12 + len;
  }
  const bpp = ct === 6 ? 4 : ct === 2 ? 3 : 0; if (!bpp) throw new Error('png: colour type ' + ct);
  const raw = zlib.inflateSync(Buffer.concat(idat)), stride = w * bpp, out = Buffer.alloc(w * h * 4);
  let prev = Buffer.alloc(stride), cur = Buffer.alloc(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)], row = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? cur[x - bpp] : 0, b = prev[x], c = x >= bpp ? prev[x - bpp] : 0;
      let v = row[x];
      if (f === 1) v += a; else if (f === 2) v += b; else if (f === 3) v += (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      cur[x] = v & 255;
    }
    for (let x = 0; x < w; x++) { const o = (y * w + x) * 4; out[o] = cur[x * bpp]; out[o + 1] = cur[x * bpp + 1]; out[o + 2] = cur[x * bpp + 2]; out[o + 3] = bpp === 4 ? cur[x * bpp + 3] : 255; }
    [prev, cur] = [cur, prev];
  }
  return { w, h, px: out };
}
// (function declarations only down here: finish() runs before the module's later consts are initialised)
function crcTable() { if (crcTable.t) return crcTable.t; const t = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c; } return (crcTable.t = t); }
function crc32(b) { const T = crcTable(); let c = -1; for (let i = 0; i < b.length; i++) c = T[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function chunk(type, d) { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(type, 'ascii'), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); }
function pngSideBySide(bufs, gap, bg) {
  const ims = bufs.map(pngDecode), w = ims.reduce((s, m) => s + m.w, 0) + gap * (ims.length - 1), h = Math.max(...ims.map((m) => m.h));
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { const r = y * (w * 3 + 1); raw[r] = 0; for (let x = 0; x < w; x++) { raw[r + 1 + x * 3] = bg[0]; raw[r + 2 + x * 3] = bg[1]; raw[r + 3 + x * 3] = bg[2]; } }
  let x0 = 0;
  for (const m of ims) {
    for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) { const s = (y * m.w + x) * 4, o = y * (w * 3 + 1) + 1 + (x0 + x) * 3; raw[o] = m.px[s]; raw[o + 1] = m.px[s + 1]; raw[o + 2] = m.px[s + 2]; }
    x0 += m.w + gap;
  }
  const ih = Buffer.alloc(13); ih.writeUInt32BE(w, 0); ih.writeUInt32BE(h, 4); ih[8] = 8; ih[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ih), chunk('IDAT', zlib.deflateSync(raw, { level: 6 })), chunk('IEND', Buffer.alloc(0))]);
}
function STORE_FN() { try { const ev = JSON.parse(localStorage.getItem('inkwave:learn:v1') || '{"ev":{}}').ev || {}; return Object.values(ev).flatMap((doc) => Object.keys((doc && doc.it) || {})); } catch (e) { return ['?' + e.message]; } }

function inside(b, s) { return b.x >= s.x - 2 && b.y >= s.y - 2 && b.x + b.w <= s.x + s.w + 2 && b.y + b.h <= s.y + s.h + 2; }
function boxesOf(m1) { return (m1.projected || []).flatMap((p) => (p.kind === 'ball' ? [{ x: p.cx - p.r, y: p.cy - p.r, w: 2 * p.r, h: 2 * p.r }, p.label] : [{ x: p.x, y: p.y, w: p.w, h: p.h }])); }
// the screen's safe area: under the strip, 16 px from the sides, the screen's foot
function safeOf(v) { return { x: 16, y: v.strip ? v.strip.bottom : 0, w: v.W - 32, h: v.H - (v.strip ? v.strip.bottom : 0) }; }
function ready(v) { return !!v && (v.mech === 'm1' ? !!(v.m1 && v.m1.placed && !v.m1.answered && v.m1.projected.length === v.m1.n && !v.m1.framing) : v.mech === 'type' ? !!(v.type && v.type.kbUp && !v.type.answered) : false); }
function noCard(v) { return !v.panelShown && !v.cardUp && v.paused === false && !v.hold; }
function common(tag, V) {
  for (const i of [0, 1]) check(`${tag} c${i}: no card shown, not paused, not held, the strip up`, noCard(V[i]) && !!V[i].strip, { panel: V[i].panelShown, card: V[i].cardUp, paused: V[i].paused, hold: V[i].hold, strip: !!V[i].strip });
}

// answer the live question on screen i: a tap on the object (touch.js → G.playTap → her round → the hit), or the game
// keyboard key by key and 射; then step until that screen's verdict
async function answerOn(H, i, right) {
  const { ev, step } = H;
  let v = await H.view(i);
  if (v.mech === 'm1') {
    const want = typeof v.right === 'number' ? v.right : 0, k = right ? want : (want + 1) % v.m1.n;
    const p = v.m1.projected.find((x) => x.i === k);
    const x = p.kind === 'ball' ? p.cx : p.x + p.w / 2, y = p.kind === 'ball' ? p.cy : p.y + p.h / 2;
    await pages[i].touchscreen.tap(Math.round(x), Math.round(y));
    let took = await ev(i, () => { const M = (__inkwave.match.learn.arena || __inkwave.match.learn.play).m1; return !!(M.shot || (M.cur && M.cur.answered)); });
    if (!took) { say(`  c${i}: the tap at ${Math.round(x)},${Math.round(y)} found no object — shooting it directly`); await ev(i, (k) => (__inkwave.match.learn.arena || __inkwave.match.learn.play).m1.shoot(k, 'tap'), k); }
    for (let n = 0; n < 40; n++) { await step(0.1); v = await H.view(i); if (v.m1 && v.m1.verdict) break; if (!v.m1) break; }
    return { how: took ? 'tap' : 'shoot', k, verdict: v.m1 ? v.m1.verdict : null, at: [Math.round(x), Math.round(y)] };
  }
  if (v.mech === 'type') {
    await sleep(700);   // (the game keyboard slides in on a CSS transition — the wall clock's: let it settle before a tap)
    const text = right ? String(v.right || '').toLowerCase() : 'zzq';
    const keyAt = (k) => ev(i, (k) => { const Hs = __inkwave.match.learn.arena || __inkwave.match.learn.play, el = Hs.type.keys.keyEls.get(k); if (!el || el.style.display === 'none') return null; const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, k);
    for (const ch of text) { if (!/[a-z ' .,?-]/.test(ch)) continue; const at = await keyAt(ch); if (at) await pages[i].touchscreen.tap(Math.round(at[0]), Math.round(at[1])); }
    const typed = (await H.view(i)).type;
    const fire = await keyAt('fire'); if (fire) await pages[i].touchscreen.tap(Math.round(fire[0]), Math.round(fire[1]));
    for (let n = 0; n < 50; n++) { await step(0.1); v = await H.view(i); if (!v.type || v.type.verdict) break; }
    return { how: 'keys', text: typed && typed.text, verdict: v.type ? v.type.verdict : null };
  }
  return { how: 'none', mech: v.mech };
}

// ------------------------------------------------------------------------------------------------ versus2, the flag on
async function driveVersusPlay(H) {
  const { step, pair, both } = H;
  const plan = { 1: { order: [1, 0], right: [true, true] }, 2: { order: [0, 1], right: [true, false] } };
  const done = new Set();
  let lastSig = '', shots = 0, resultsAt = 0;
  while (budgetLeft() > 4500) {
    await step(0.5);
    const V = await Promise.all([H.view(0), H.view(1)]);
    const sig = V.map((v) => `${v.state}/${v.net}${v.err ? '!' + v.err : ''} q${v.q ? v.q.q + (v.q.answered ? 'a' : '') : '-'} ${v.mech || '-'}${v.m1 ? (v.m1.placed ? ' placed' : ' placing') : ''}${v.paused ? ' PAUSED' : ''}${v.hold ? ' HOLD' : ''}${v.panelShown ? ' CARD' : ''}`).join(' | ');
    if (sig !== lastSig) { lastSig = sig; say(sig); }
    if (V.some((v) => v.net !== 'match')) { say('a client left the match'); break; }
    const qa = V[0].q, qb = V[1].q;
    if (qa && qb && qa.q === qb.q && !done.has(qa.q) && ready(V[0]) && ready(V[1])) {
      const q = qa.q; done.add(q);
      const tag = `q${q}`, rec = { q, id: qa.id, mech: V.map((v) => v.mech), labels: V.map((v) => v.m1 && v.m1.labels), right: V.map((v) => v.right), chip: V.map((v) => v.strip && v.strip.chip),
        objects: V.map((v) => v.m1 && { projected: v.m1.projected, depth: v.m1.depth, D: v.m1.D, lift: v.m1.lift, place: v.m1.place }) };
      R.questions.push(rec);
      if (!R.t.sameQuestion) mark('sameQuestion');
      common(tag, V);
      check(`${tag}: the same question as a thing on both screens (${V[0].mech})`, qa.id === qb.id && V[0].mech === V[1].mech && (V[0].mech === 'm1' || V[0].mech === 'type') && qa.play && qb.play, rec);
      if (V[0].mech === 'm1') {
        check(`${tag}: the same objects in the same order, the same right one`, JSON.stringify(V[0].m1.labels) === JSON.stringify(V[1].m1.labels) && V[0].right === V[1].right, rec);
        for (const i of [0, 1]) { const s = safeOf(V[i]), bx = boxesOf(V[i].m1); check(`${tag} c${i}: every object inside the safe area (under the strip at ${s.y}, 16 px from the sides)`, bx.length >= V[i].m1.n && bx.every((b) => inside(b, s)), { safe: s, boxes: bx.map((b) => [b.x, b.y, b.w, b.h].map(Math.round)) }); }
        check(`${tag}: the objects registered (G.playTargets) and the tap hook on both`, V.every((v) => v.playTargets && v.playTap));
      } else check(`${tag}: the game keyboard up on both`, V.every((v) => v.kbOn && v.type && v.type.kbUp));
      check(`${tag}: the seconds left on the strip's chip`, V.every((v) => /秒/.test(v.strip.chip)), rec.chip);
      if (shots++ < 1) await pair('question', V.map((v, i) => `c${i} ${v.host ? '房主 Ann' : '访客 Bo'} · ${V[i].mech} · ${(v.strip && v.strip.text || '').slice(0, 28)}`));
      const P = plan[q] || { order: [0, 1], right: [true, true] };
      for (const [n, i] of P.order.entries()) {
        if (n) await sleep(1500);
        const a = await answerOn(H, i, P.right[i]);
        rec['c' + i] = a;
        say(`  c${i} answers ${P.right[i] ? 'right' : 'wrong'}: ${JSON.stringify(a)}`);
        check(`${tag} c${i}: the ${a.how === 'tap' ? 'tap' : a.how} answered — 「${a.verdict && a.verdict.head}」`, !!(a.verdict && a.verdict.ok === P.right[i]) && a.how !== 'shoot', a);
        const vi = await H.view(i);
        check(`${tag} c${i}: still no card, no pause, no hold after answering`, noCard(vi), { paused: vi.paused, hold: vi.hold, panel: vi.panelShown });
      }
    }
    if (V.some((v) => v.state === 'finish' || v.state === 'judge' || v.state === 'results') && !R.t.matchEnd) {
      mark('matchEnd'); say('match over:', V.map((v) => v.state + ' ' + JSON.stringify(v.zone)).join(' | '));
      await both(() => { __G.hud.timeScale = 25; });   // (INKWAVE's judge runs on the HUD's own rAF clock: net-duo.mjs's trick)
    }
    if (V.every((v) => v.results && v.strip2)) break;
    if (R.t.matchEnd && V.every((v) => v.state === 'results')) { resultsAt = resultsAt || Date.now(); if (Date.now() - resultsAt > 8000) break; }
  }
  const V = await Promise.all([H.view(0), H.view(1)]), ST = await Promise.all([H.store(0), H.store(1)]);
  R.final = V.map((v, i) => ({ host: v.host, log: v.log, zone: v.zone, strip: v.strip2, store: ST[i] }));
  for (const [i, v] of V.entries()) say(`c${i} ${v.host ? 'host ' : 'guest'} log: ${v.log}`);
  const inks = V.map((v) => v.log.match(/ink@\d+:\S+/g) || []);
  check('ink: the first right answer by own time inked, the same on both screens', inks[0].length >= 1 && JSON.stringify(inks[0]) === JSON.stringify(inks[1]), JSON.stringify(inks));
  check('question 1: the guest inked (right 1.5 s sooner by its own clock)', (inks[0].find((s) => s.startsWith('ink@1:')) || '') === 'ink@1:' + R.ids[1], JSON.stringify(inks[0]));
  check('question 2: the host inked (right at once; the guest wrong)', (inks[0].find((s) => s.startsWith('ink@2:')) || '') === 'ink@2:' + R.ids[0], JSON.stringify(inks[0]));
  check('flood: the zone shares moved on both screens and agree', V.every((v) => v.zone && v.zone.share[0][0] + v.zone.share[0][1] > 0) && Math.abs(V[0].zone.share[0][0] - V[1].zone.share[0][0]) < 0.05 && Math.abs(V[0].zone.share[0][1] - V[1].zone.share[0][1]) < 0.05, JSON.stringify(V.map((v) => v.zone)));
  const firsts = V.map((v) => (v.log.match(/answer[+-]\*@\d+/g) || []).length);
  check('evidence: each player\'s first answers once each, in their own store', firsts.every((n) => n === 2) && ST.every((s) => s.length >= 2), JSON.stringify({ firsts, store: ST }));
  check('results: INKWAVE\'s results screen with the answers strip on both', V.every((v) => v.results && v.strip2 && /双人联机赛/.test(v.strip2)), JSON.stringify(V.map((v) => v.strip2)));
  if (V.every((v) => v.results)) mark('results');
}

// ------------------------------------------------------------------------------------------------ coop2, the flag on
async function driveCoopPlay(H) {
  const { ev, both, step, pair } = H;
  if (WALK) await both(() => __inkwave.match.learn.autoWalk(true));
  const seen = new Set();
  let wrongDone = false, retry = null, lastSig = '', shots = 0, lastGate = -1, iter = 0;
  while (budgetLeft() > 4500) {
    await step(0.5);
    const V = await Promise.all([H.view(0), H.view(1)]);
    for (const i of [0, 1]) if (V[i].phase === 'walk') await ev(i, onPad, WALK);
    const sig = V.map((v) => `${v.phase} gate ${v.cur + 1}/${v.gates} on ${JSON.stringify(v.on)} q ${v.q ? v.q.q + v.q.role[0] + (v.q.answered ? 'a' : '') : '-'} ${v.mech || '-'}${v.paused ? ' PAUSED' : ''}${v.hold ? ' HOLD' : ''}${v.panelShown ? ' CARD' : ''} ${v.net}`).join(' | ');
    if (sig !== lastSig) { lastSig = sig; say(sig); }
    if (++iter % 10 === 1) say('  where:', V.map((v) => `me ${JSON.stringify(v.me3)}`).join(' | '));
    if (V.some((v) => v.net !== 'match')) { say('a client left the match'); break; }
    if (V[0].phase === 'ask' && V[1].phase === 'ask' && lastGate !== V[0].cur) {
      lastGate = V[0].cur; if (!R.t.padsHeld) mark('padsHeld');
      check(`gate ${V[0].cur + 1}: both on their pads, the host declared it, both asking — and nobody held`, V[0].cur === V[1].cur && V[0].on && V[0].on.every(Boolean) && V.every((v) => !v.hold && v.paused === false), `pads held by ${JSON.stringify(V[0].on)} hold ${V.map((v) => v.hold)}`);
    }
    const qa = V[0].q, qb = V[1].q;
    if (!(qa && qb && qa.q === qb.q && !seen.has(qa.q) && qa.play && qb.play && !qa.answered)) { if (V.every((v) => v.learnCard)) { mark('results'); break; } continue; }
    const hi = qa.role === 'hands' ? 0 : qb.role === 'hands' ? 1 : -1; if (hi < 0) continue;
    const ci = 1 - hi;
    // (the clue board rises and the camera frames it; the answering side's objects come up when its lens has eased)
    if (!ready(V[hi]) || !(V[ci].clue && (V[ci].clue.framed >= 0 || V[ci].clue.strip))) continue;
    for (let n = 0; n < 6; n++) await step(0.25);   // (the framing spring settles)
    const X = await Promise.all([H.view(0), H.view(1)]);
    const h = X[hi], c = X[ci], q = qa.q, tag = `q${q}`;
    seen.add(q);
    const rec = { q, id: qa.id, hands: 'c' + hi, mech: h.mech, handsStrip: h.strip && { text: h.strip.text, zh: h.strip.zh, play: h.strip.play }, clue: c.clue, clueMech: c.mech, clueStrip: c.strip && { text: c.strip.text, play: c.strip.play },
      handsAt: h.me3, typePose: h.type ? { pose: h.type.pose, log: h.type.log } : null, objects: h.m1 ? { projected: h.m1.projected, place: h.m1.place } : null };
    R.questions.push(rec);
    if (!R.t.split) mark('split');
    for (const [i, v] of X.entries()) check(`${tag} c${i}: no card shown, not paused, not held`, noCard(v), { panel: v.panelShown, card: v.cardUp, paused: v.paused, hold: v.hold });
    check(`${tag}: the answering screen (c${hi}) has the ${h.mech === 'm1' ? 'objects' : '打字蟹'} — no ▶, no stem, no Chinese`, (h.mech === 'm1' || h.mech === 'type') && h.strip && !h.strip.play && /队友/.test(h.strip.text) && !h.strip.zh, rec);
    if (h.mech === 'm1') { const s = safeOf(h), bx = boxesOf(h.m1); check(`${tag} c${hi}: every object inside the safe area (under the strip at ${s.y})`, bx.length >= h.m1.n && bx.every((b) => inside(b, s)), { safe: s, boxes: bx.map((b) => [b.x, b.y, b.w, b.h].map(Math.round)) }); }
    const hot = (c.clue && c.clue.hot) || [];
    check(`${tag}: the clue screen (c${ci}) has ${c.clue && c.clue.board ? 'the board' : 'the strip'} and nothing to answer with (no objects, no keyboard, no card; hotspots ${hot.map((x) => x.id).join(' ') || '—'})`, c.mech === 'clue' && !c.playTargets && !c.kbOn && !c.m1 && !c.cardUp && hot.every((x) => x.id === 'listen' || x.id === 'more') && (!c.clue.board || c.clue.framed >= 0), rec);
    if (shots++ < 1) await pair('split', X.map((v, i) => `c${i} ${v.host ? '房主 Ann' : '访客 Bo'} · ${i === hi ? '作答：' + v.mech : '线索：' + (c.clue && c.clue.board ? '展板' : '题条')}`));
    if (retry && retry.id === qa.id) check(`${tag}: the re-ask (reworded) went to the other player's hands`, retry.hands !== hi, `first c${retry.hands}, now c${hi}`);
    const right = wrongDone;
    const a = await answerOn(H, hi, right);
    rec.answer = a;
    say(`  ${tag}: c${hi} answers ${right ? 'right' : 'wrong'}: ${JSON.stringify(a)}`);
    if (!right) { wrongDone = true; retry = { id: qa.id, hands: hi }; }
    const Y = await Promise.all([H.view(0), H.view(1)]);
    const hv = Y[hi], cv = Y[ci];
    check(`${tag}: the answer (${a.how}) judged on the answering screen — 「${a.verdict && a.verdict.head}」`, !!(a.verdict && a.verdict.ok === right) && a.how !== 'shoot', a);
    check(`${tag}: the verdict on the clue screen too — 「${cv.strip && cv.strip.head}」`, !!(cv.strip && cv.strip.verdict && cv.strip.ok === right && (right ? /答对了/.test(cv.strip.head) : /差一点/.test(cv.strip.head))), cv.strip);
    if (!right) check(`${tag}: the clue screen is not told the answer (it comes back to that player)`, !(cv.strip && /是 /.test(cv.strip.head)), cv.strip);
    for (const [i, v] of Y.entries()) check(`${tag} c${i}: still no card, no pause, no hold`, noCard(v), { panel: v.panelShown, paused: v.paused, hold: v.hold });
  }
  const V = await Promise.all([H.view(0), H.view(1)]), ST = await Promise.all([H.store(0), H.store(1)]);
  R.final = V.map((v, i) => ({ log: v.log, card: v.learnCard, mine: v.mine, store: ST[i], playLog: v.playLog }));
  for (const [i, v] of V.entries()) say(`c${i} log: ${v.log}`);
  check('gates opened on both screens, in step', V[0].cur === V[1].cur && V[0].cur === V[0].gates, `${V[0].cur}/${V[0].gates} vs ${V[1].cur}/${V[1].gates}`);
  check('roles swapped: both players answered and both gave clues', V.every((v) => v.mine && v.mine.asked >= 1 && v.mine.clues >= 1), JSON.stringify(V.map((v) => v.mine)));
  // (each device holds exactly the items its own player answered — a miss answered by one and re-asked to the other is in both)
  const own = [0, 1].map((i) => [...new Set(R.questions.filter((x) => x.hands === 'c' + i && x.answer && x.answer.verdict).map((x) => x.id))].sort());
  check('evidence: each screen recorded only its own player\'s answers', V.every((v) => v.mine && v.mine.firsts <= v.mine.asked) && [0, 1].every((i) => JSON.stringify([...new Set(ST[i])].sort()) === JSON.stringify(own[i])), JSON.stringify({ store: ST, answered: own, mine: V.map((v) => v.mine) }));
  check('results: B\'s results card on both screens, with the pair\'s lines', V.every((v) => v.learnCard && /两个人/.test(v.learnCard)), JSON.stringify(V.map((v) => (v.learnCard || '').replace(/\s+/g, ' ').slice(0, 160))));
}

