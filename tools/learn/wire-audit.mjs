// 题即玩法 play-wire audit (docs/PLAY.md §10, docs/LEARN.md §22): a puzzle with every mechanic wired, in a real page.
// A static server over this checkout at /game/, Chromium on software GL (SwiftShader), ?quality=low, shadows / bloom off,
// the game clock frozen (debug.freeze) and stepped by hand — as tools/learn/play-audit.mjs does.
//
//   node tools/learn/wire-audit.mjs --view portrait|landscape|desktop [--learn w1d1 --gate 1] [--shots <dir>] [--budget 1500]
//       a short level (?short=1: two gates of two items from gate N) walked gate by gate with the auto-walk; at every
//       board stop (M6) the framing is checked and the walk goes on; at every question the audit reads host.debug():
//         every mechanic: no question card shown (.iw-learn__panel), match.paused false, learn.hold falsy, the strip up
//         M1 墨靶      the objects' projected boxes inside the safe area; a tap on the right object → the round, the hit, 答对了
//         M4 字弹      the keyboard up and inside the screen, the type frame; the right text tapped key by key on the
//                      game keyboard (through the touch layer: touch.js must leave those to it), 射 → the word, the verdict
//         M3 节拍台    the pads' projected centres inside the safe area; after the word, a tap on the right pad's side →
//                      the hop, the landing, the verdict
//         M8 翻牌靶    a tap on the card → the back; a tap on 认识 → F, the burst
//       and: learn:answer once per item with first = true (recordFirst wrote it), no console errors, no 4xx.
//       --shots: one screenshot per mechanic (the first time it is up) and per board stop.
// Run browsers one at a time: flock -w 9000 /tmp/ielts-browser.lock nice -n 10 node tools/learn/wire-audit.mjs …
// (NODE_PATH must reach playwright; Chromium at /opt/pw-browsers/chromium or CHROME_PATH)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
// --near: the first written sentence (写字墙) is typed a word short — claimable — and must come back HELD (nothing written,
// the strip's 「我的写法也对 / 继续」), then 「我的写法也对」 is tapped → S (play-fix)
const NEAR = args.includes('--near');
const VIEW = opt('view', 'portrait'), SHOTS = opt('shots', null), LEARN_Q = opt('learn', 'w1d1'), GATE = +opt('gate', 1), BUDGET = +opt('budget', 1500) * 1000, MAXQ = +opt('max', 12);
const VIEWS = { portrait: { w: 390, h: 844, touch: true, app: true }, landscape: { w: 844, h: 390, touch: true, app: false }, desktop: { w: 1280, h: 720, touch: false, app: false } };
const V = VIEWS[VIEW] || VIEWS.portrait;
const T0 = Date.now();
const tag = `${LEARN_Q}g${GATE}`;
const say = (...a) => console.log(`[wire-audit ${VIEW} ${tag} ${((Date.now() - T0) / 1000).toFixed(1).padStart(5)}]`, ...a);
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
const watchdog = setTimeout(() => { say('WATCHDOG — out of budget'); finish(2); }, BUDGET);
const ctx = await browser.newContext({ viewport: { width: V.w, height: V.h }, deviceScaleFactor: 1, isMobile: V.touch, hasTouch: V.touch });
await ctx.addInitScript((touch) => { try { const k = 'inkwave.settings', v = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(v, { shadows: false, bloom: false, touchControls: touch ? 'on' : 'off' }); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* none */ } }, V.touch);
const page = await ctx.newPage();
const bad = [], errs = [], fails = [], report = { view: VIEW, size: `${V.w}x${V.h}`, learn: LEARN_Q, gate: GATE, questions: [], boards: [] };
page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().replace(base, '/game/')); });
page.on('requestfailed', (r) => { const u = r.url(); if (!/^blob:|^data:/.test(u)) bad.push('FAILED ' + u.replace(base, '/game/') + ' ' + ((r.failure() || {}).errorText || '')); });
page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 400)); });
page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message + ' ' + String(e.stack || '').split('\n').slice(1, 3).join(' | ')));
const check = (ok, what, detail) => { if (!ok) fails.push(what + (detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) : '')); say((ok ? 'ok   ' : 'FAIL ') + what + (detail && !ok ? ' ' + JSON.stringify(detail).slice(0, 500) : '')); return ok; };
const ev = (fn, ...a) => page.evaluate(fn, ...a);
const step = (ms = 16.7) => ev((m) => __inkwave.debug.step(m), ms);
const shotDone = new Set();
async function shot(name, once = true) {
  if (!SHOTS || (once && shotDone.has(name))) return;
  shotDone.add(name);
  fs.mkdirSync(SHOTS, { recursive: true });
  const f = path.join(SHOTS, `${VIEW}-${tag}-${name}.png`);
  await page.screenshot({ path: f, timeout: 180000 });
  say('shot', f);
}
async function finish(code) {
  clearTimeout(watchdog);
  report.fails = fails; report.badResponses = bad; report.errors = errs;
  console.log('\n[wire-audit] REPORT ' + JSON.stringify(report));
  console.log(`[wire-audit] ${VIEW} ${tag}: ${fails.length ? fails.length + ' FAILED' : 'all checks passed'} · 4xx ${bad.length} · console errors ${errs.length}`);
  try { await browser.close(); } catch (e) { /* gone */ }
  srv.close();
  process.exit(code != null ? code : (fails.length || bad.length || errs.length ? 1 : 0));
}

// ------------------------------------------------------------------------------------------------ boot
const query = `?learn=${LEARN_Q}&kind=puzzle&short=1&gate=${GATE}&quality=low&nofullscreen&noclips` + (V.app ? '&from=app' : '');
say('open', query);
await page.goto(base + 'index.html' + query, { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__inkwave && __inkwave.match && __inkwave.match.mode === 'learn' && __inkwave.match.state === 'playing' && __inkwave.match.learn, null, { timeout: 420000, polling: 250 });
// (the keyboard's slide-in is a CSS transition on wall time — under software GL it can outlast the audit's patience and a
// key tapped mid-slide lands under the screen; the audit measures the keys where they rest, not the bounce)
await page.addStyleTag({ content: '.iw-pk__panel { transition: none !important; }' });
report.boot = await ev(() => { const F = __inkwave.match.learn; __inkwave.debug.freeze(); return { play: !!F.play, host: !!(F.play && F.play.m1), gates: F.gates.map((g) => ({ id: g.id, mech: g.design && g.design.mechanic, n: g.items.length, kinds: [...new Set(g.items.map((it) => it.meta.kind + '.' + it.meta.input))] })), stage: __inkwave.mapDef && __inkwave.mapDef.id }; });
say('boot', JSON.stringify(report.boot));
check(report.boot.play && report.boot.host, 'LEARN.play is on: the puzzle has its play host');
for (let i = 0; i < 6; i++) await step(100);   // (the host's stations build on the first frames)

// ------------------------------------------------------------------------------------------------ what the page shows
const state = () => ev(() => {
  const F = __inkwave.match.learn, H = F.play, m = __inkwave.match;
  const panel = document.querySelector('.iw-learn__panel'), pr = panel && panel.getBoundingClientRect();
  const strip = document.querySelector('.iw-ps__box'), sr = strip && strip.getBoundingClientRect(), stripOn = !!(strip && !document.querySelector('.iw-ps.is-off'));
  const kb = document.querySelector('.iw-pk__panel'), kr = kb && kb.getBoundingClientRect(), kbOn = !!(kb && !document.querySelector('.iw-pk.is-off'));
  const d = H.debug();
  const asking = !!(F.asking && H.kind && ((H.kind === 'm1' && d.m1.asking && !d.m1.answered) || (H.kind !== 'm1' && d.station && !d.station.idle && !d.station.answered)));
  return {
    phase: F.phase, cur: F.cur, auto: F.auto, paused: m.paused, hold: !!F.hold, panelShown: !!(pr && pr.width > 0 && pr.height > 0 && getComputedStyle(panel).display !== 'none'), cardUp: !!(__G.hud.learn && __G.hud.learn._ask),
    strip: stripOn ? { text: strip.innerText.replace(/\s+/g, ' ').trim(), rect: [sr.left, sr.top, sr.width, sr.height].map(Math.round), ok: !!document.querySelector('.iw-ps.is-ok'), bad: !!document.querySelector('.iw-ps.is-bad') } : null,
    kb: kbOn ? [kr.left, kr.top, kr.width, kr.height].map(Math.round) : null,
    xh: (() => { const e = document.querySelector('.iw-xh'); if (!e) return false; const cs = getComputedStyle(e), b = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0 && b.height > 0; })(),
    W: innerWidth, H: innerHeight, mechanic: H.kind, asking, item: F.asking && F.asking.item.id, dbg: d, touchLive: __inkwave.touch ? __inkwave.touch.enabled : null,
    answers: F.log.filter((e) => e.name === 'learn:answer'), done: F.phase === 'done' || !!document.querySelector('.iw-learn.is-done'),
    rigMode: __inkwave.rig.mode, cam: [__G.camera.position.x, __G.camera.position.y, __G.camera.position.z].map((v) => +v.toFixed(2)), fov: +__G.camera.fov.toFixed(1),
    her: F.match.local ? [F.match.local.pos.x, F.match.local.pos.y, F.match.local.pos.z].map((v) => +v.toFixed(2)) : null,
  };
});
// the right answer of the live question, as the flow sees it (an index on the stage's / the prompt's order, or the text)
const rightAnswer = () => ev(() => {
  const F = __inkwave.match.learn, A = F.asking; if (!A) return null;
  const { item, p } = A;
  if (p._flip) return true;
  if (p._alt === 'choice-of-typed') return (p.options || []).findIndex((o) => o.text === ((item.meta && item.meta.ref) || item.en));
  if (p.type === 'choice') return p._perm ? p._perm.indexOf(item.answer) : item.answer;
  return (item.meta && item.meta.ref) || item.en;
});
const inside = (b, s) => b.x >= s.x - 1 && b.y >= s.y - 1 && b.x + b.w <= s.x + s.w + 1 && b.y + b.h <= s.y + s.h + 1;
// the crosshair (play-fix: hidden while a station holds her — typing, a stage, a flip card, a framed board — as the runner
// hides it; M1 keeps it: she aims there)
const xhShown = () => ev(() => { const e = document.querySelector('.iw-xh'); if (!e) return false; const cs = getComputedStyle(e), b = e.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && b.width > 0 && b.height > 0; });
// the lens has come to rest (the station's spring): the camera moves < 1 cm a step, or the steps run out
async function settle(max = 30, ms = 100) {
  let last = null;
  for (let i = 0; i < max; i++) {
    const c = await ev(() => [__G.camera.position.x, __G.camera.position.y, __G.camera.position.z]);
    if (last && Math.hypot(c[0] - last[0], c[1] - last[1], c[2] - last[2]) < 0.01) return i;
    last = c; await step(ms);
  }
  return max;
}
// the type frame on the screen (play-fix, play-4's way: tools/learn/runner-drive.js frameCheck): the rig's points
// (type/frame.js RIG_POINTS, in the rig's own frame) projected with the live camera — the plate, the strike point and the
// lines on the paper between the strip's real bottom edge and the keyboard's real top; her head below the keys' middle
// row (a wide screen: the far row)
const typeFrame = () => ev(async () => {
  const FR = await import(new URL('src/learn/play/type/frame.js', location.href).href);
  const T = __inkwave.match.learn.play.type, rig = T.shot && T.shot.rig; if (!rig || !rig.root || !rig.root.parent) return null;
  const cam = __G.camera, V3 = cam.position.constructor, R = FR.RIG_POINTS;
  rig.root.updateMatrixWorld(true); cam.updateMatrixWorld(true);
  const P = (p) => { const v = new V3(p[0], p[1], p[2]).applyMatrix4(rig.root.matrixWorld).project(cam); return [Math.round(((v.x + 1) / 2) * innerWidth), Math.round(((1 - v.y) / 2) * innerHeight)]; };
  const st = document.querySelector('.iw-ps:not(.is-off) .iw-ps__box'), kb = document.querySelector('.iw-pk:not(.is-off) .iw-pk__panel');
  const top = st ? Math.round(st.getBoundingClientRect().bottom) : 0, kbTop = kb ? Math.round(kb.getBoundingClientRect().top) : innerHeight;
  const pts = [...R.plate, R.strike, ...R.textLines, R.typed10].map(P), head = P(R.head), row = P(innerWidth / innerHeight > 1.4 ? [0, 1.16, 1.12] : R.midRow), paper = R.paperTop.map(P);
  const inBand = pts.every(([x, y]) => y >= top - 2 && y <= kbTop + 2 && x >= -2 && x <= innerWidth + 2);
  const ys = pts.map((q) => q[1]);
  return { stripBottom: top, kbTop, rig: [Math.min(...ys), Math.max(...ys)], xs: [Math.min(...pts.map((q) => q[0])), Math.max(...pts.map((q) => q[0]))], head, row, paper, inBand, headBelowRow: head[1] > row[1], band: T.cur && T.cur.band, hull: +rig.hullYaw.toFixed(3), yaw: T.cur && +T.cur.yaw.toFixed(3) };
});
const tapAt = async (x, y) => { if (V.touch) await page.touchscreen.tap(Math.round(x), Math.round(y)); else await page.mouse.click(Math.round(x), Math.round(y)); };

// walk (the auto-walk; a board stop is a frame check + 「自动走」 again) until a question is up or the level is done
async function walkOn() {
  for (let i = 0; i < 400; i++) {
    const s = await ev(() => { const F = __inkwave.match.learn, H = F.play; const X = H.exit.debug(); return { phase: F.phase, auto: F.auto, asking: !!(H.cur && F.asking), framed: H.boards.framed, exit: X.idle ? null : X, done: F.phase === 'done' || !!document.querySelector('.iw-learn.is-done') }; });
    if (s.asking || s.done) return s;
    if (i % 40 === 39) say('walking', JSON.stringify(await ev(() => { const F = __inkwave.match.learn, a = F.match.local; return { phase: F.phase, auto: F.auto, her: [a.pos.x, a.pos.y, a.pos.z].map((v) => +v.toFixed(1)), stall: +F.autoStall.toFixed(1), exit: F.play.exit.debug() }; })).slice(0, 400));
    if (s.phase === 'exit' && !s.auto) {
      // a stop in the exit area: the booth (the sample plays; walking on = 说完了) or the check-in pad (踩上去 = 走完了)
      for (let k = 0; k < 6; k++) await step(250);
      const x = await ev(() => __inkwave.match.learn.play.exit.debug());
      const st = await state();
      check(!st.paused && !st.panelShown, 'exit: the world runs on, no card');
      if (x.echo && x.echo.framed >= 0 && !report.echoSeen) { report.echoSeen = true; check(x.echo.state === 'in' || x.echo.state === 'done', `M7: in the booth (${x.echo.state}), its board framed`, x); await shot('m7-booth'); }
      if (x.signs && x.signs.framed >= 0 && !report.signSeen) { report.signSeen = true; await shot('signs-board'); }
      report.exit = x;
      await ev(() => __inkwave.match.learn.autoWalk(true));
      await step(500);
      continue;
    }
    if (s.phase === 'walk' && !s.auto) {
      if (s.framed >= 0) {
        for (let k = 0; k < 4; k++) await step(250);   // the camera comes round, the board counts as read
        const b = await ev(() => __inkwave.match.learn.play.boards.debug());
        const st = await state();
        check(b.framing && b.framing.fits && st.rigMode === 'path', `board ${b.framed}: framed (fits ${b.framing && b.framing.fits}), the lens on the board`, { framing: b.framing, rigMode: st.rigMode });
        check(!st.paused && !st.panelShown, `board ${b.framed}: the world runs on, no card`);
        check(!st.xh, `board ${b.framed}: no crosshair while it is framed`);
        report.boards.push({ i: b.framed, framing: b.framing, hotspots: b.hotspots, read: b.boards[b.framed] && b.boards[b.framed].read });
        await shot('m6-board');
        if (b.hotspots.length && !report.hotTapped) { report.hotTapped = true; const h = b.hotspots[0]; await tapAt(h.x + h.w / 2, h.y + h.h / 2); await step(100); say('tapped board hotspot', h.id); }
      }
      await ev(() => __inkwave.match.learn.autoWalk(true));
    }
    await step(500);
  }
  return { timeout: true };
}

// ------------------------------------------------------------------------------------------------ one question per mechanic
async function untilAnswered(max = 120) {
  for (let i = 0; i < max; i++) { const v = await ev(() => { const H = __inkwave.match.learn.play, d = H.debug(); return H.kind === 'm1' ? d.m1.verdict : d.station && d.station.verdict; }); if (v) return v; await step(16.7 * 4); }
  return null;
}
async function waitFor(fn, max = 200, ms = 50) { for (let i = 0; i < max; i++) { const r = await ev(fn); if (r) return r; await step(ms); } return null; }

async function answerM1(s, right) {
  // the objects come up once the camera has settled
  const placed = await waitFor(() => { const d = __inkwave.match.learn.play.m1.debug(); return d.placed && d.projected.length ? d : null; }, 60, 100);
  for (let i = 0; i < 4; i++) await step(100);
  const d = await ev(() => __inkwave.match.learn.play.m1.debug());
  check(!!placed && d.projected.length === d.n, `M1: ${d.n} objects placed (${d.banner ? 'banners' : 'balls'})`, d.log && d.log.slice(-4));
  const st = await state();
  const safe = { x: 16, y: st.strip ? st.strip.rect[1] + st.strip.rect[3] : 0, w: st.W - 32, h: st.H - (st.strip ? st.strip.rect[1] + st.strip.rect[3] : 0) };
  const boxes = d.projected.map((q) => (q.kind === 'ball' ? { x: Math.min(q.cx - q.r, q.label.x), y: q.cy - q.r, w: Math.max(q.cx + q.r, q.label.x + q.label.w) - Math.min(q.cx - q.r, q.label.x), h: q.label.y + q.label.h - (q.cy - q.r) } : { x: q.x, y: q.y, w: q.w, h: q.h }));
  check(boxes.every((b) => inside(b, safe)), 'M1: every object inside the safe area', { safe, boxes: boxes.map((b) => [b.x, b.y, b.w, b.h].map(Math.round)) });
  await shot(d.banner ? 'm1-banners' : 'm1-balls');
  const q = d.projected.find((x) => x.i === right);
  if (V.touch) await tapAt(q.kind === 'ball' ? q.cx : q.x + q.w / 2, q.kind === 'ball' ? q.cy : q.y + q.h / 2);
  else { for (let pass = 0; pass < 4; pass++) { await ev((k) => { const P = __inkwave.match.learn.play.m1, rig = __inkwave.rig, cam = rig.gameCam; const c = P.T.slots[k].pos; const dx = c.x - cam.position.x, dy = c.y - cam.position.y, dz = c.z - cam.position.z; rig.yaw = Math.atan2(dx, dz); rig.pitch = Math.atan2(dy, Math.hypot(dx, dz)); }, right); await step(16.7); } await ev(() => __inkwave.debug.fire(true)); await step(16.7); await ev(() => __inkwave.debug.fire(false)); }
  return untilAnswered();
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// the keyboard's slide-in is a CSS transition on wall time (the sim is frozen): wait until its panel has come to rest on the screen
async function kbSettled() {
  let last = null;
  for (let i = 0; i < 40; i++) {
    const r = await ev(() => { const kb = document.querySelector('.iw-pk__panel'); if (!kb || document.querySelector('.iw-pk.is-off')) return null; const b = kb.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round); });
    if (r && last && r.join() === last.join() && r[1] + r[3] <= V.h + 1) return r;
    last = r; await sleep(60);
  }
  return last;
}
async function answerType(s, right) {
  const d = s.dbg.station;
  s.kb = await kbSettled();
  // (the panel's slide-in overshoots a few px on its bounce; what must be on the screen is every key)
  const keysOut = await ev(() => { const out = []; for (const el of document.querySelectorAll('.iw-pk__k, .iw-pk__b')) { if (el.style.display === 'none') continue; const r = el.getBoundingClientRect(); if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.push([el.dataset.k || el.dataset.b, Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]); } return out; });
  check(!!s.kb && keysOut.length === 0, 'M4: the game keyboard up, every key inside the screen', { kb: s.kb, out: keysOut });
  check(d.phase === 'typing' && d.pose && d.pose.fits !== false, `M4: typing (${d.mode}), the type frame`, d.pose);
  check(s.rigMode === 'path', 'M4: the lens is the station\'s (rig in path mode)', s.rigMode);
  const steps = await settle();
  const fr = await typeFrame();
  report.typeFrames = report.typeFrames || []; report.typeFrames.push({ item: d.item, mode: d.mode, steps, ...fr });
  check(!!fr && fr.inBand, `M4: the typewriter between the strip (${fr && fr.stripBottom}) and the keyboard (${fr && fr.kbTop}): ${fr && fr.rig.join('–')} px`, fr);
  check(!!fr && fr.headBelowRow, `M4: her head (${fr && fr.head[1]}) below the keys' row (${fr && fr.row[1]})`, fr);
  check(!(await xhShown()), 'M4: no crosshair while she types');
  await shot('m4-type-' + d.mode);
  // a hint on the first word (the keyboard's 提示 → H), then the text key by key on the game keyboard through the touch layer
  let text = String(right).toLowerCase();
  const near = NEAR && !report.nearDone && d.mode === 'sentence' && (await ev(() => { const A = __inkwave.match.learn.asking; return !!(A && A.item.meta && A.item.meta.input === 'write'); }));
  if (near) { report.nearDone = true; const w = text.replace(/[^a-z ' ,?-]/g, '').trim().split(/\s+/); text = w.slice(0, Math.max(1, w.length - 1)).join(' '); say('near miss:', text); }
  if (!report.hinted && d.mode === 'word') { report.hinted = true; const h = await ev(() => { const b = document.querySelector('.iw-pk__b.is-hint'); if (!b || b.style.display === 'none') return null; const r = b.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; }); if (h) { await tapAt(h[0], h[1]); await step(50); const st = await state(); check(/提示/.test(st.strip ? st.strip.text : ''), `M4: 提示 on the strip 「${st.strip && st.strip.text}」`); } }
  const keyAt = (k) => ev((k) => { const el = __inkwave.match.learn.play.type.keys.keyEls.get(k); if (!el || el.style.display === 'none') return null; const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, k);
  let typed = 0;
  for (const ch of text) {
    const k = /[a-z ' .,?-]/.test(ch) ? ch : null; if (!k) continue;
    const at = await keyAt(k); if (!at) { say('no key for', JSON.stringify(k)); continue; }
    await tapAt(at[0], at[1]); typed++;
    if (typed % 4 === 0) await step(16.7);
  }
  await step(100);
  const t = await ev(() => __inkwave.match.learn.play.type.debug());
  check(t.text && t.text.toLowerCase() === text.replace(/[^a-z ' .,?-]/g, ''), `M4: typed on the game keyboard 「${t.text}」`, t);
  check(!(await xhShown()), 'M4: no crosshair while she types');
  await shot('m4-typed-' + d.mode);
  const fire = await keyAt('fire');
  await tapAt(fire[0], fire[1]);
  await step(50);
  let v = await waitFor(() => { const d = __inkwave.match.learn.play.type.debug(); return d.verdict || d.held ? d : null; }, 40, 50);
  if (near) {
    // held: nothing written yet (no learn:answer, no leaf), the word grey, the strip's two buttons
    const h = await ev(() => { const F = __inkwave.match.learn, d = F.play.type.debug(), acts = [...document.querySelectorAll('.iw-ps.is-acts .iw-ps__act')].map((b) => { const r = b.getBoundingClientRect(); return { text: b.textContent, primary: b.classList.contains('is-primary'), x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }); return { held: d.held, verdict: d.verdict, answers: F.log.filter((e) => e.name === 'learn:answer').length, acts, strip: (document.querySelector('.iw-ps__head') || {}).textContent }; });
    check(h.held && !h.verdict && h.answers === s.answers.length, `M4 「我的写法也对」: the near miss is held — nothing written (${h.answers} answers)`, h);
    check(h.acts.length === 2 && h.acts.every((b) => b.h >= 43), 'M4: the strip offers 我的写法也对 / 继续 (≥ 44 px)', h.acts);
    for (let i = 0; i < 30; i++) { const ph = await ev(() => __inkwave.match.learn.play.type.shot.word.phase); if (ph === 'shown') break; await step(100); }
    const grey = await ev(() => ({ shot: __inkwave.match.learn.play.type.shot.phase, word: __inkwave.match.learn.play.type.shot.word.phase }));
    check(grey.shot === 'shown', `M4: the held word stands formed and grey (${grey.shot} / ${grey.word})`, grey);
    await shot('m4-held');
    const b = h.acts.find((x) => x.primary);
    if (b) await tapAt(b.x, b.y);
    await step(50);
    v = await waitFor(() => { const d = __inkwave.match.learn.play.type.debug(); return d.verdict ? d : null; }, 40, 50);
    check(!!v && v.verdict && v.verdict.self === true && v.verdict.ok === true, 'M4: 我的写法也对 → S (the claim stands)', v && v.verdict);
    report.held = { strip: h.strip, verdict: v && v.verdict };
  }
  check(!!v && v.verdict, 'M4: 射 → judged', v && v.log);
  // the shell flies (0.75–1.25 s), the word forms, then the verdict plays: shoot the formed word before it bursts
  // (the station's shot: 'assembling' once the shell landed, 'shown' / 'resolving' once the letters formed, then 'done' → the next item)
  const formed = await waitFor(() => { const S = __inkwave.match.learn.play.type.shot; return S.word && (S.word.phase === 'assembling' || S.word.phase === 'shown' || S.word.phase === 'resolving') ? S.word.phase : null; }, 90, 50);
  check(!!formed, 'M4: the shell landed, the ink word forms at the target', formed);
  for (let i = 0; i < 12; i++) { const ph = await ev(() => __inkwave.match.learn.play.type.shot.word.phase); if (ph === 'shown' || ph === 'resolving') break; await step(50); }
  check(!(await xhShown()), 'M4: no crosshair while the ink word plays');
  await shot('m4-word-' + d.mode);
  for (let i = 0; i < 8; i++) await step(150);
  return v && v.verdict;
}
async function answerBeat(s, right) {
  const d0 = s.dbg.station;
  const safe = { x: 16, y: s.strip ? s.strip.rect[1] + s.strip.rect[3] : 0, w: s.W - 32, h: s.H - (s.strip ? s.strip.rect[1] + s.strip.rect[3] : 0) };
  check(d0.pads.length === d0.n && d0.pads.every((p) => p.x >= safe.x && p.x <= safe.x + safe.w && p.y >= safe.y && p.y <= safe.y + safe.h), `M3: ${d0.n} pads' centres inside the safe area`, { pads: d0.pads, safe });
  check(s.rigMode === 'path', 'M3: the lens is the stage\'s', s.rigMode);
  check(!s.xh, 'M3: no crosshair on the stage');
  // the word plays on a bar line: wait for the round to listen
  const lis = await waitFor(() => { const d = __inkwave.match.learn.play.beat.debug(); return d.state && d.state.round === 'listen' ? d : null; }, 80, 100);
  check(!!lis, 'M3: the word played (round listening)', lis && lis.state);
  await step(200);
  await shot('m3-pads-' + d0.n);
  const d = await ev(() => __inkwave.match.learn.play.beat.debug());
  const p = d.pads[right];
  await tapAt(p.x, p.y);
  const hop = await waitFor(() => { const d = __inkwave.match.learn.play.beat.debug(); return d.state && d.state.hop ? d : null; }, 10, 16.7);
  check(!!hop, 'M3: the tap → she hops', hop && hop.state);
  const v = await untilAnswered(80);
  check(!!v && v.pad === right, 'M3: the landing is the answer', v);
  for (let i = 0; i < 6; i++) await step(100);
  await shot('m3-verdict-' + d0.n);
  return v;
}
async function answerFlip(s) {
  const d = s.dbg.station;
  check(d.phase === 'rise' || d.phase === 'front', 'M8: the card rises', d.phase);
  const front = await waitFor(() => { const d = __inkwave.match.learn.play.flip.debug(); return d.phase === 'front' && d.card ? d : null; }, 40, 100);
  check(!!front, 'M8: the card up, its face to her', front);
  check(!(await xhShown()), 'M8: no crosshair at the flip card');
  await shot('m8-card');
  await tapAt(front.card.x + front.card.w / 2, front.card.y + front.card.h / 2);
  const back = await waitFor(() => { const d = __inkwave.match.learn.play.flip.debug(); return d.phase === 'back' && d.targets.length === 2 ? d : null; }, 40, 100);
  check(!!back, 'M8: a tap flips it: the back, the two rating targets', back);
  for (let i = 0; i < 6; i++) await step(100);   // (the targets pop in over 0.4 s)
  const bk = await ev(() => __inkwave.match.learn.play.flip.debug());
  const safe = { x: 0, y: s.strip ? s.strip.rect[1] + s.strip.rect[3] : 0, w: s.W, h: s.H };
  check(bk.targets.length === 2 && bk.targets.every((t) => t.cx - t.r >= safe.x && t.cx + t.r <= safe.x + safe.w && t.cy - t.r >= safe.y && t.cy + t.r <= safe.y + safe.h), 'M8: both targets on the screen under the strip', bk.targets);
  await shot('m8-back');
  const t = back.targets[0];
  await tapAt(t.cx, t.cy);
  const v = await untilAnswered(40);
  check(!!v && v.ans === true, 'M8: 认识 → F', v);
  for (let i = 0; i < 4; i++) await step(150);
  return v;
}

// ------------------------------------------------------------------------------------------------ the level
let n = 0, guard = 0;
const seen = {};
process.on('unhandledRejection', (e) => { check(false, 'driver error', String(e && e.message || e)); finish(1); });
try { while (guard++ < MAXQ + 8) {
  const w = await walkOn();
  if (w.done) { say('level done'); break; }
  if (w.timeout) { check(false, 'walk: no question came up'); break; }
  for (let i = 0; i < 3; i++) await step(100);
  const s = await state();
  if (!s.asking) { await step(300); continue; }
  const right = await rightAnswer();
  const label = `q${++n} ${s.mechanic} ${s.item}`;
  check(!s.panelShown && !s.cardUp, `${label}: no question card`);
  check(s.paused === false, `${label}: match.paused === false`);
  check(!s.hold, `${label}: learn.hold falsy`);
  check(!!s.strip && s.strip.rect[3] > 0, `${label}: the strip: 「${s.strip && s.strip.text}」`);
  const before = s.answers.length;
  let v = null;
  if (s.mechanic === 'm1') v = await answerM1(s, right);
  else if (s.mechanic === 'type') v = await answerType(s, right);
  else if (s.mechanic === 'beat') v = await answerBeat(s, right);
  else if (s.mechanic === 'flip') v = await answerFlip(s);
  else check(false, `${label}: an unknown mechanic`);
  const s2 = await state();
  check(!!v && v.ok === true, `${label}: answered right`, v || s2.dbg);
  const na = s2.answers.slice(before);
  check(na.length === 1 && na[0].first === true, `${label}: learn:answer once, first of the day`, na);
  check(!s2.paused && !s2.panelShown, `${label}: still no pause, no card`);
  report.questions.push({ label, mechanic: s.mechanic, item: s.item, strip: s.strip && s.strip.text, verdict: v, first: na[0] && na[0].first, cam: s.cam, fov: s.fov });
  seen[s.mechanic] = (seen[s.mechanic] || 0) + 1;
  for (let i = 0; i < 8; i++) await step(100);
  if (n >= MAXQ) break;
} } catch (e) { check(false, 'driver error', String(e && e.message || e)); }
const end = await ev(() => { const F = __inkwave.match.learn; return { cur: F.cur, gates: F.gates.length, opened: F.gates.filter((g) => g.state === 'open').length, log: F.log.map((e) => e.name.replace('learn:', '') + (e.kind ? ':' + e.kind : '') + (e.ok != null ? (e.ok ? '+' : '-') : '') + (e.first ? '*' : '') + (e.opened ? '(open)' : '')).join(' '), ev: Object.keys(JSON.parse(localStorage.getItem('inkwave:learn:v1') || '{"ev":{}}').ev), host: F.play.debug().log }; });
report.end = end; report.seen = seen;
say('end', JSON.stringify({ ...end, host: undefined }));
check(end.opened >= 1, `gates opened: ${end.opened} / ${end.gates}`);
if (report.exit) { const x = await ev(() => __inkwave.match.learn.play.exit.debug()); report.exit = x; check(x.done && (!x.spots.some((s) => s.kind === 'checkin') || x.checked), `exit: walked (spoke ${x.spoke}, checked ${x.checked})`, x); const signs = end.log.includes('sign'); check(signs, 'learn:sign in the log');
  // (play-fix) every stop of the exit area reached — the booth spoken, the weekly / placement boards read or stood at, the
  // pad stepped on — none given up on by the walk's timer
  check(x.spots.every((s) => !s.skipped), 'exit: no stop passed over by the walk\'s timer', x.spots);
  const ends = await ev(() => ({ results: !!document.querySelector('.iw-learn.is-done'), phase: __inkwave.match.learn.phase }));
  check(ends.phase === 'done', `exit: the day ended (phase ${ends.phase}, results ${ends.results})`, ends); }
await finish();
