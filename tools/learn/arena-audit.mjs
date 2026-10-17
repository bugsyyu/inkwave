// 题即玩法 play-5 audit (docs/PLAY.md §10, LEARN §24): the duel / the 今日小考 / the boss in a real page — the questions are
// things over the zone or on the boss, the world never stops. A static server over this checkout at /game/ (as the
// App's bundle lays it out), Chromium on software GL, ?quality=low, shadows / bloom off, the game clock frozen
// (debug.freeze) and stepped by hand; both phone views in ONE browser (one lock for both).
//
//   node tools/learn/arena-audit.mjs --form duel|quiz|boss [--views portrait,landscape] [--learn w1d6] [--shots <dir>] [--n 3]
//       duel   ?learn=w1d6&kind=duel&short=1 (two rounds of two)      quiz   ?learn=w1d1&kind=quiz&short=1 (two questions)
//       boss   ?learn=w1d7&kind=boss&short=1 (four phases of two)      --n: questions to answer per view (default 3)
//   Per view: boot → the prep board's 开始 (duel / quiz) → step until the first question; for each question asserted:
//     no question card shown (.iw-learn__panel), match.paused false, learn.hold falsy, the strip up, the touch layer live;
//     M1 / M5: every object's projected box inside the safe area (the screen under the strip, 16 px each side; the
//              boss: on the screen under the strip), a PLAIN round at the right object (her weapon fired with the aim
//              laid on it — not a tap) splats and answers NOTHING, then a tap on the right object → the round, the hit,
//              答对了, learn:answer once with first = true; the duel: the zone flooded (learn:ink); the boss: HP down (learn:bossHp)
//     M4:      the game keyboard up with every key on the screen, the type frame, the rig in path mode, a shield on her
//              (duel), the text typed key by key on the game keyboard, 射 → judged, the word forms at the target
//     S (boss): the booth rises in front of her; walking onto its pad plays the sample; walking off = 说完了 → the hit
//   Screenshots: <dir>/<form>-<view>-<what>.png (one per mechanic per view).
// Run browsers one at a time: flock -w 9000 /tmp/ielts-browser.lock nice -n 10 node tools/learn/arena-audit.mjs …
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const FORM = opt('form', 'duel'), SHOTS = opt('shots', null), MAXQ = +opt('n', 3), BUDGET = +opt('budget', 1500) * 1000;
const VIEWS_WANT = opt('views', 'portrait,landscape').split(',');
const LEARN_Q = opt('learn', FORM === 'boss' ? 'w1d7' : FORM === 'quiz' ? 'w1d1' : 'w1d6');
const GATE = +opt('gate', 0);   // (a duel day's gate N and N+1: ?short=1&gate=N — a typed gate is w1d6 --gate 4)
const QUERY = `?learn=${LEARN_Q}&kind=${FORM}&short=1&quality=low&nofullscreen&noclips` + (GATE > 0 ? `&gate=${GATE}` : '');
const VIEWS = { portrait: { w: 390, h: 844, touch: true, app: true }, landscape: { w: 844, h: 390, touch: true, app: false }, desktop: { w: 1280, h: 720, touch: false, app: false } };
const T0 = Date.now();
let VIEW = '';
const say = (...a) => console.log(`[arena-audit ${FORM} ${VIEW} ${((Date.now() - T0) / 1000).toFixed(1).padStart(5)}]`, ...a);
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
const reports = {}, allFails = [];
const watchdog = setTimeout(() => { say('WATCHDOG — out of budget'); finishAll(2); }, BUDGET);
async function finishAll(code) {
  clearTimeout(watchdog);
  console.log('\n[arena-audit] REPORT ' + JSON.stringify(reports));
  console.log(`[arena-audit] ${FORM}: ${allFails.length ? allFails.length + ' FAILED' : 'all checks passed'}`);
  for (const f of allFails) console.log('  FAIL ' + f);
  try { await browser.close(); } catch (e) { /* gone */ }
  srv.close();
  process.exit(code != null ? code : (allFails.length ? 1 : 0));
}
process.on('unhandledRejection', (e) => { allFails.push('driver error ' + String(e && e.message || e)); finishAll(1); });

for (const viewName of VIEWS_WANT) { try {
  VIEW = viewName;
  const V = VIEWS[viewName] || VIEWS.portrait;
  const ctx = await browser.newContext({ viewport: { width: V.w, height: V.h }, deviceScaleFactor: 1, isMobile: V.touch, hasTouch: V.touch });
  await ctx.addInitScript((touch) => { try { const k = 'inkwave.settings', v = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(v, { shadows: false, bloom: false, touchControls: touch ? 'on' : 'off' }); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* none */ } }, V.touch);
  const page = await ctx.newPage();
  const bad = [], errs = [], fails = [], report = { form: FORM, view: VIEW, size: `${V.w}x${V.h}`, questions: [] };
  reports[VIEW] = report;
  page.on('response', (r) => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url().replace(base, '/game/')); });
  page.on('requestfailed', (r) => { const u = r.url(); if (!/^blob:|^data:/.test(u)) bad.push('FAILED ' + u.replace(base, '/game/') + ' ' + ((r.failure() || {}).errorText || '')); });
  page.on('console', (m) => { if (m.type() === 'error') errs.push('[console] ' + m.text().slice(0, 400)); });
  page.on('pageerror', (e) => errs.push('[pageerror] ' + e.message + ' ' + String(e.stack || '').split('\n').slice(1, 3).join(' | ')));
  const check = (ok, what, detail) => { if (!ok) { fails.push(what + (detail ? ' — ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)).slice(0, 600) : '')); allFails.push(`${VIEW}: ${what}`); } say((ok ? 'ok   ' : 'FAIL ') + what + (detail && !ok ? ' ' + JSON.stringify(detail).slice(0, 500) : '')); return ok; };
  const ev = (fn, ...a) => page.evaluate(fn, ...a);
  const step = (ms = 16.7) => ev((m) => __inkwave.debug.step(m), ms);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const shotDone = new Set();
  const shot = async (name) => {
    if (!SHOTS || shotDone.has(name)) return;
    shotDone.add(name);
    fs.mkdirSync(SHOTS, { recursive: true });
    const f = path.join(SHOTS, `${FORM}${GATE ? '-g' + GATE : ''}-${VIEW}-${name}.png`);
    await page.screenshot({ path: f, timeout: 180000 });
    say('shot', f);
  };
  const tapAt = async (x, y) => { if (V.touch) await page.touchscreen.tap(Math.round(x), Math.round(y)); else await page.mouse.click(Math.round(x), Math.round(y)); };

  // ---------------------------------------------------------------------------------------------- boot
  const q = QUERY + (V.app ? '&from=app' : '');
  say('open', q);
  await page.goto(base + 'index.html' + q, { waitUntil: 'load', timeout: 180000 });
  await page.waitForFunction(() => window.__inkwave && __inkwave.match && __inkwave.match.mode === 'learn' && __inkwave.match.learn, null, { timeout: 420000, polling: 250 });
  report.boot = await ev(() => { const F = __inkwave.match.learn, m = __inkwave.match; __inkwave.debug.freeze(); if (m.learnKind === 'boss' && __inkwave.debug.freezeBots) __inkwave.debug.freezeBots(); return { kind: m.learnKind, arena: !!F.arena, mode: F.arena && F.arena.mode, actors: m.actors.length, zones: !!m.zones, boss: !!m.boss, stage: __inkwave.mapDef && __inkwave.mapDef.id, gates: F.gates.map((g) => ({ id: g.id, n: g.items.length, kinds: [...new Set(g.items.map((it) => it.meta.kind + '.' + it.meta.input))] })), state: m.state, quiz: !!F.level.quiz }; });
  say('boot', JSON.stringify(report.boot));
  check(report.boot.arena, 'LEARN.play is on: the form has its arena host');
  // the intro / the prep board: step until the level plays and the board (duel / quiz) can be started
  for (let i = 0; i < 120; i++) { const st = await ev(() => ({ state: __inkwave.match.state, prep: !!(__inkwave.match.learn.prep && __inkwave.match.learn.prep()), go: !!document.querySelector('.iw-lf__board.is-on') })); if (st.state === 'playing' && (st.prep || FORM === 'boss')) break; await step(250); }
  const pre = await ev(() => ({ state: __inkwave.match.state, prep: !!(__inkwave.match.learn.prep && __inkwave.match.learn.prep()), board: !!document.querySelector('.iw-lf__board.is-on'), paused: __inkwave.match.paused }));
  say('pre', JSON.stringify(pre));
  // --skip-to S (boss): the audit's hand clears the phases before it (BossFlow._phaseDone 'cleared': the boss falls to each
  // band's floor, nothing written) — to reach the 回声亭 without eight questions first
  const SKIP = opt('skip-to', null);
  if (FORM === 'boss' && SKIP) { const r = await ev((ph) => { const F = __inkwave.match.learn; let n = 0; while (F.gates[F.pi] && F.gates[F.pi].phase !== ph && n++ < 6) F._phaseDone(F.gates[F.pi], 'cleared'); return { phase: F.gates[F.pi] && F.gates[F.pi].phase, skipped: n }; }, SKIP); say('skipped to', JSON.stringify(r)); }
  if (FORM !== 'boss') {
    check(pre.board && pre.prep, 'the prep board is up before the round (LEVELS §2.3 备战; the clock stops)');
    await shot('prep');
    await ev(() => document.querySelector('.iw-lf__go').click());
    await step(50);
  }

  // ---------------------------------------------------------------------------------------------- what the page shows
  const state = () => ev(() => {
    const F = __inkwave.match.learn, H = F.arena, m = __inkwave.match;
    const panel = document.querySelector('.iw-learn__panel'), pr = panel && panel.getBoundingClientRect();
    const strip = document.querySelector('.iw-ps__box'), sr = strip && strip.getBoundingClientRect(), stripOn = !!(strip && !document.querySelector('.iw-ps.is-off'));
    const kb = document.querySelector('.iw-pk__panel'), kr = kb && kb.getBoundingClientRect(), kbOn = !!(kb && !document.querySelector('.iw-pk.is-off'));
    const d = H ? H.debug() : null;
    const asking = !!(F.asking && H && H.kind && ((H.kind === 'm1' && d.m1.asking && !d.m1.answered) || (H.kind !== 'm1' && d.station && !d.station.idle && !d.station.answered)));
    const a = m.local;
    return {
      phase: F.phase, round: F.round, paused: m.paused, hold: !!F.hold, prep: !!(F.prep && F.prep()), panelShown: !!(pr && pr.width > 0 && pr.height > 0 && getComputedStyle(panel).display !== 'none'), cardUp: !!(__G.hud.learn && __G.hud.learn._ask),
      board: !!document.querySelector('.iw-lf__board.is-on'),
      strip: stripOn ? { text: strip.innerText.replace(/\s+/g, ' ').trim(), rect: [sr.left, sr.top, sr.width, sr.height].map(Math.round), ok: !!document.querySelector('.iw-ps.is-ok'), bad: !!document.querySelector('.iw-ps.is-bad') } : null,
      kb: kbOn ? [kr.left, kr.top, kr.width, kr.height].map(Math.round) : null,
      W: innerWidth, H: innerHeight, mechanic: H && H.kind, asking, item: F.asking && F.asking.item.id, type: F.asking && F.asking.p && F.asking.p.type, dbg: d, touchLive: __inkwave.touch ? __inkwave.touch.enabled : null,
      answers: F.log.filter((e) => e.name === 'learn:answer'), inks: F.log.filter((e) => e.name === 'learn:ink' && e.team === 0).length, hps: F.log.filter((e) => e.name === 'learn:bossHp').length, done: F.phase === 'done' || !!document.querySelector('.iw-learn.is-done'),
      rigMode: __inkwave.rig.mode, cam: [__G.camera.position.x, __G.camera.position.y, __G.camera.position.z].map((v) => +v.toFixed(2)), fov: +__G.camera.fov.toFixed(1),
      her: a ? [a.pos.x, a.pos.y, a.pos.z].map((v) => +v.toFixed(2)) : null, alive: a ? a.alive : null, shield: a && a.status ? +a.status.shield.toFixed(2) : null,
      bossMove: m.boss ? (m.boss.move ? m.boss.move.id : null) : null, bossHp: m.boss ? +m.boss.hpFrac().toFixed(3) : null, controller: !!(m.controller && m.controller.enabled),
    };
  });
  const rightAnswer = () => ev(() => {
    const F = __inkwave.match.learn, A = F.asking; if (!A) return null;
    const { item, p } = A;
    if (p._flip) return true;
    if (p._alt === 'choice-of-typed') return (p.options || []).findIndex((o) => o.text === ((item.meta && item.meta.ref) || item.en));
    if (p.type === 'choice') return p._perm ? p._perm.indexOf(item.answer) : item.answer;
    return (item.meta && item.meta.ref) || item.en;
  });
  const inside = (b, s) => b.x >= s.x - 1 && b.y >= s.y - 1 && b.x + b.w <= s.x + s.w + 1 && b.y + b.h <= s.y + s.h + 1;
  async function waitFor(fn, max = 200, ms = 50) { for (let i = 0; i < max; i++) { const r = await ev(fn); if (r) return r; await step(ms); } return null; }
  // the boss: her hand walks her to ~11 m in front of HULLBREAKER (on the nearest walkable node) while it waits for her to
  // come close (LEARN.arena.bossNear) — as a player would; --far keeps her where she is (the options then come towards it)
  const FAR = args.includes('--far');
  const nearBoss = () => ev(() => {
    const m = __inkwave.match, b = m.boss, a = m.local, nav = __G.nav; if (!b || !a || !nav) return null;
    const V = a.pos.constructor, want = new V(b.pos.x + Math.sin(b.yaw) * 11, b.pos.y + 1, b.pos.z + Math.cos(b.yaw) * 11);
    const k = nav.nearest(want, 6, true); if (k < 0) return null;
    const n = nav.nodes[k]; a.pos.set(n.x, n.y, n.z); a.vel.set(0, 0, 0);
    return [n.x, n.y, n.z].map((v) => +v.toFixed(1));
  });
  // the round runs on: step until a question is up (or the level is done / a card came)
  async function untilQuestion() {
    for (let i = 0; i < 240; i++) {
      if (FORM === 'boss' && !FAR && i % 4 === 0) { const at = await ev(() => { const F = __inkwave.match.learn; return F._nearSaid || (F.arena && F.arena.m1 && !F.arena.m1.bossNear()); }); if (at) { const p = await nearBoss(); if (i === 0) say('walked her to the boss', JSON.stringify(p)); } }
      const s = await ev(() => { const F = __inkwave.match.learn, H = F.arena; return { asking: !!(F.asking && H && H.kind), card: !!(__G.hud.learn && __G.hud.learn._ask), board: !!document.querySelector('.iw-lf__board.is-on'), done: F.phase === 'done' || !!document.querySelector('.iw-learn.is-done'), between: F.phase === 'between', echo: !!(H && H.kind === 'echo') }; });
      if (s.asking || s.card || s.done || s.echo) return s;
      if (s.board) { await ev(() => document.querySelector('.iw-lf__go').click()); }
      await step(250);
    }
    return { timeout: true };
  }
  const boxesOf = (d) => (d.projected || []).map((q) => (q.kind === 'ball' ? { x: Math.min(q.cx - q.r, q.label.x), y: q.cy - q.r, w: Math.max(q.cx + q.r, q.label.x + q.label.w) - Math.min(q.cx - q.r, q.label.x), h: q.label.y + q.label.h - (q.cy - q.r) } : { x: q.x, y: q.y, w: q.w, h: q.h }));
  async function untilAnswered(max = 110) {
    for (let i = 0; i < max; i++) { const v = await ev(() => { const H = __inkwave.match.learn.arena; const d = H.debug(); return H.kind === 'm1' ? d.m1.verdict : d.station && d.station.verdict; }); if (v) return v; await step(16.7); }
    return null;
  }

  // ---------------------------------------------------------------------------------------------- M1 / M5
  async function answerM1(s, right, label) {
    const placed = await waitFor(() => { const d = __inkwave.match.learn.arena.m1.debug(); return d.placed && d.projected.length ? d : null; }, 60, 100);
    for (let i = 0; i < 6; i++) await step(100);   // (their pop-in; the ease ends)
    const d = await ev(() => __inkwave.match.learn.arena.m1.debug());
    check(!!placed && d.projected.length === d.n, `${label}: ${d.n} objects placed (${d.banner ? 'banners' : 'balls'}, ${d.mode}${d.socks ? ' on ' + d.socks.join('/') : ''})`, d.log && d.log.slice(-4));
    const st = await state();
    const safe = { x: FORM === 'boss' ? 0 : 16, y: st.strip ? st.strip.rect[1] + st.strip.rect[3] : 0, w: st.W - (FORM === 'boss' ? 0 : 32), h: st.H - (st.strip ? st.strip.rect[1] + st.strip.rect[3] : 0) };
    const boxes = boxesOf(d);
    check(boxes.length === d.n && boxes.every((b) => inside(b, safe)), `${label}: every object's projected box inside the safe area`, { safe, boxes: boxes.map((b) => [b.x, b.y, b.w, b.h].map(Math.round)), place: (d.log || []).filter((e) => e.ev === 'place').pop(), framing: d.framing });
    await shot(d.banner ? 'm1-banners' : 'm1-balls');
    // a PLAIN round at the right object: her own weapon, aimed at it, no tap — it splats and answers nothing (PLAY §1.5)
    const before = st.answers.length, hitsBefore = ((d.log || []).filter((e) => e.ev === 'hit')).length;
    await ev((k) => { const P = __inkwave.match.learn.arena.m1, a = __inkwave.match.local, W = __G.projectiles; const c = P.T.slots[k].pos; a.aimPoint.copy(c); a.aimDir.copy(c).sub(a.pos).setY(c.y - a.pos.y - 1.05).normalize(); const w = a.weapon && a.weapon.kind === 'shooter' ? a.weapon : null; if (w) W.fireShooter(a, w, 0); else W.fireShooter(a, { ...a.weapon, kind: 'shooter', projSpeed: 26, straightTime: 0.2, impactRadius: 0.5, damage: 20, trailEvery: 1.5, trailRadius: 0.5, range: 14 }, 0); }, right);
    let plainHit = null;
    for (let i = 0; i < 70; i++) { await step(16.7); const r = await ev((h0) => { const d = __inkwave.match.learn.arena.m1.debug(); const hits = (d.log || []).filter((e) => e.ev === 'hit'); return hits.length > h0 ? hits[hits.length - 1] : null; }, hitsBefore); if (r) { plainHit = r; break; } }
    const s2 = await state();
    // (on the boss a plain round may meet HULLBREAKER's own shell first — that is a boss hit, not an answer: only logged)
    if (FORM === 'boss' && !plainHit) say(`info ${label}: the plain round met the boss (or fell short) before the ball — no answer either way`);
    else check(!!plainHit && plainHit.deliberate === false, `${label}: a plain round of hers met the object (deliberate: false)`, plainHit || 'no hit logged');
    check(s2.answers.length === before && !s2.dbg.m1.answered, `${label}: … and answered nothing (learn:answer unchanged, the question still up)`, { answers: s2.answers.length, before });
    // the tap on the right object → the round, the hit on it, the answer
    // (where it is NOW: the boss's balls ride a walking boss, the lens follows them)
    const dNow = await ev(() => __inkwave.match.learn.arena.m1.debug());
    const q = (dNow.projected.length ? dNow.projected : d.projected).find((x) => x.i === right);
    if (!q) { check(false, `${label}: the right object is on the screen to tap`, { projected: dNow.projected, log: (dNow.log || []).slice(-4) }); return null; }
    if (V.touch) await tapAt(q.kind === 'ball' ? q.cx : q.x + q.w / 2, q.kind === 'ball' ? q.cy : q.y + q.h / 2);
    else { for (let pass = 0; pass < 4; pass++) { await ev((k) => { const P = __inkwave.match.learn.arena.m1, rig = __inkwave.rig, cam = rig.gameCam; const c = P.T.slots[k].pos; const dx = c.x - cam.position.x, dy = c.y - cam.position.y, dz = c.z - cam.position.z; rig.yaw = Math.atan2(dx, dz); rig.pitch = Math.atan2(dy, Math.hypot(dx, dz)); }, right); await step(16.7); } await ev(() => __inkwave.debug.fire(true)); await step(16.7); await ev(() => __inkwave.debug.fire(false)); }
    const v = await untilAnswered();
    const lg = await ev(() => __inkwave.match.learn.arena.m1.debug().log.slice(-8));
    const fire = lg.findLast((e) => e.ev === 'fire'), hit = lg.findLast((e) => e.ev === 'hit' && e.deliberate), ans = lg.findLast((e) => e.ev === 'answer');
    check(!!v && v.ok === true, `${label}: the tapped round landed on it: 答对了`, v || lg);
    check(!!fire && !!hit && !!ans && hit.t === ans.t, `${label}: the answer is taken on the hit frame`, { fire, hit, ans });
    for (let i = 0; i < 6; i++) await step(100);
    await shot('m1-right');
    return v;
  }

  // ---------------------------------------------------------------------------------------------- M4
  async function kbSettled() {
    let last = null;
    for (let i = 0; i < 40; i++) {
      const r = await ev(() => { const kb = document.querySelector('.iw-pk__panel'); if (!kb || document.querySelector('.iw-pk.is-off')) return null; const b = kb.getBoundingClientRect(); return [b.left, b.top, b.width, b.height].map(Math.round); });
      if (r && last && r.join() === last.join() && r[1] + r[3] <= V.h + 1) return r;
      last = r; await sleep(60);
    }
    return last;
  }
  async function answerType(s, right, label) {
    const d = s.dbg.station;
    s.kb = await kbSettled();
    const keysOut = await ev(() => { const out = []; for (const el of document.querySelectorAll('.iw-pk__k, .iw-pk__b')) { if (el.style.display === 'none') continue; const r = el.getBoundingClientRect(); if (r.left < -1 || r.top < -1 || r.right > innerWidth + 1 || r.bottom > innerHeight + 1) out.push([el.dataset.k || el.dataset.b, Math.round(r.left), Math.round(r.top), Math.round(r.right), Math.round(r.bottom)]); } return out; });
    check(!!s.kb && keysOut.length === 0, `${label}: the game keyboard up, every key inside the screen`, { kb: s.kb, out: keysOut });
    check(d.phase === 'typing' && d.pose && d.pose.fits !== false, `${label}: typing (${d.mode}), the type frame`, d.pose);
    check(s.rigMode === 'path', `${label}: the lens is the station's (rig in path mode)`, s.rigMode);
    // the type frame as RENDERED (PLAY §3 M4: her head below the keyboard's middle row; the whole typewriter and its paper
    // between the strip and the game keyboard): the camera springs to the pose first, then the real keycaps (the
    // InstancedMesh's instances), the paper's corners and her head (the rig frame's head point) are projected with the
    // game's own camera
    for (let i = 0; i < 40; i++) { const dd = await ev(() => { const S = __inkwave.match.learn.arena.type, C = S.cur, cam = __G.camera; return C && C.pose ? cam.position.distanceTo(C.pose.pos) : 0; }); if (dd < 0.03) break; await step(50); }
    const fr = await ev(async (kbTop) => {
      const F = await import('./src/learn/play/type/frame.js');
      const S = __inkwave.match.learn.arena.type, rig = S.shot.rig, cam = __G.camera, W = innerWidth, H = innerHeight;
      cam.updateMatrixWorld(); rig.root.updateMatrixWorld(true);
      const V = rig.root.position.constructor, M = rig.caps.matrixWorld.constructor;
      const scr = (v) => { const p = v.clone().project(cam); return [(p.x + 1) / 2 * W, (1 - p.y) / 2 * H, p.z]; };
      const keys = [], m = new M(), v = new V();
      for (let i = 0; i < rig.caps.count; i++) { rig.caps.getMatrixAt(i, m); v.setFromMatrixPosition(m).applyMatrix4(rig.caps.matrixWorld); keys.push(scr(v)); }
      rig.paper.geometry.computeBoundingBox(); const b = rig.paper.geometry.boundingBox, paper = [];
      for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) paper.push(scr(new V(x, y, (b.min.z + b.max.z) / 2).applyMatrix4(rig.paper.matrixWorld)));
      const head = scr(rig.root.localToWorld(new V(...F.RIG_POINTS.head))), mid = scr(rig.root.localToWorld(new V(...F.RIG_POINTS.midRow)));
      const strip = document.querySelector('.iw-ps__box'), sr = strip && !document.querySelector('.iw-ps.is-off') ? strip.getBoundingClientRect() : null, sb = sr ? sr.bottom : 0;
      const pts = keys.concat(paper), ys = pts.map((p) => p[1]), xs = pts.map((p) => p[0]);
      const ext = (q) => [Math.min(...q.map((p) => p[0])), Math.min(...q.map((p) => p[1])), Math.max(...q.map((p) => p[0])), Math.max(...q.map((p) => p[1]))].map(Math.round);
      return { head: head.map(Math.round), mid: mid.map(Math.round), headBelowMid: head[1] > mid[1], stripBottom: Math.round(sb), stripX: sr ? [Math.round(sr.left), Math.round(sr.right)] : null, kbTop, top: Math.round(Math.min(...ys)), bottom: Math.round(Math.max(...ys)), left: Math.round(Math.min(...xs)), right: Math.round(Math.max(...xs)), keys: ext(keys), paper: ext(paper), W, H, hullYaw: +rig.hullYaw.toFixed(2), yaw: +S.cur.yaw.toFixed(2), region: S.cur.pose && S.cur.pose.region, xh: getComputedStyle(__G.hud.xh).visibility };
    }, s.kb ? s.kb[1] : innerHeight);
    check(fr.headBelowMid, `${label}: her head below the keyboard's middle row on the screen (head y ${fr.head[1]} > mid row y ${fr.mid[1]})`, fr);
    // (under the strip — or, on a wide screen, in the corner beside it: clear of the strip's sides)
    const clearOfStrip = fr.top >= fr.stripBottom - 2 || (fr.stripX && (fr.right <= fr.stripX[0] + 2 || fr.left >= fr.stripX[1] - 2));
    check(clearOfStrip && fr.bottom <= fr.kbTop + 2 && fr.left >= -2 && fr.right <= fr.W + 2 && fr.top >= -2, `${label}: the whole typewriter and its paper clear of the strip (${fr.stripBottom}${fr.stripX ? ', x ' + fr.stripX.join('–') : ''}) and over the keyboard (${fr.kbTop}): ${fr.top}–${fr.bottom}, x ${fr.left}–${fr.right} (${fr.region})`, fr);
    check(fr.xh === 'hidden', `${label}: the crosshair hidden while she types`, fr.xh);
    report.typeFrame = report.typeFrame || []; report.typeFrame.push(fr);
    if (FORM !== 'boss') check(s.shield > 0, `${label}: a shield on her while she types (${s.shield} s)`);
    check(!s.hold && s.paused === false, `${label}: still no hold, no pause while typing`);
    await shot('m4-type-' + d.mode);
    const text = String(right).toLowerCase();
    const keyAt = (k) => ev((k) => { const el = __inkwave.match.learn.arena.type.keys.keyEls.get(k); if (!el || el.style.display === 'none') return null; const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, k);
    let typed = 0;
    for (const ch of text) {
      const k = /[a-z ' .,?-]/.test(ch) ? ch : null; if (!k) continue;
      const at = await keyAt(k); if (!at) { say('no key for', JSON.stringify(k)); continue; }
      await tapAt(at[0], at[1]); typed++;
      if (typed % 4 === 0) await step(16.7);
    }
    await step(100);
    const t = await ev(() => __inkwave.match.learn.arena.type.debug());
    check(t.text && t.text.toLowerCase() === text.replace(/[^a-z ' .,?-]/g, ''), `${label}: typed on the game keyboard 「${t.text}」`, t);
    await shot('m4-typed-' + d.mode);
    const fire = await keyAt('fire');
    await tapAt(fire[0], fire[1]);
    await step(50);
    const v = await waitFor(() => { const d = __inkwave.match.learn.arena.type.debug(); return d.verdict ? d : null; }, 40, 50);
    check(!!v && v.verdict, `${label}: 射 → judged`, v && v.log);
    const formed = await waitFor(() => { const S = __inkwave.match.learn.arena.type.shot; return S.word && (S.word.phase === 'assembling' || S.word.phase === 'shown' || S.word.phase === 'resolving') ? S.word.phase : null; }, 90, 50);
    check(!!formed, `${label}: the sheet landed, the ink word forms at the target`, formed);
    for (let i = 0; i < 12; i++) { const ph = await ev(() => __inkwave.match.learn.arena.type.shot.word.phase); if (ph === 'shown' || ph === 'resolving') break; await step(50); }
    await shot('m4-word-' + d.mode);
    for (let i = 0; i < 8; i++) await step(150);
    return v && v.verdict;
  }

  // ---------------------------------------------------------------------------------------------- S (boss)
  async function answerEcho(s, label) {
    const d = s.dbg.station;
    check(d && d.state === 'ready' && d.at, `${label}: the booth is up in front of her (${d && d.state})`, d);
    check(!s.hold && s.paused === false && !s.panelShown && !s.board, `${label}: no hold, no pause, no card, no board for the booth`);
    await shot('m7-booth');
    // walk onto its pad: her position is driven (the audit's hand, as the auto-walk would): she arrives, the sample plays, she walks off
    const walked = await ev(() => { const H = __inkwave.match.learn.arena, a = __inkwave.match.local, at = H.echo.cur.at; a.pos.set(at.x, at.y, at.z); a.vel.set(0, 0, 0); return true; });
    for (let i = 0; i < 12; i++) await step(100);
    const inb = await ev(() => __inkwave.match.learn.arena.echo.debug());
    check(walked && (inb.state === 'in' || inb.state === 'done'), `${label}: stepping onto the pad: the sample plays (${inb.state})`, inb);
    await shot('m7-in');
    const hp0 = s.bossHp;
    await ev(() => { const H = __inkwave.match.learn.arena, a = __inkwave.match.local, at = H.echo.cur.at; const yaw = a.yaw; a.pos.set(at.x - Math.sin(yaw) * 2.6, at.y, at.z - Math.cos(yaw) * 2.6); });
    for (let i = 0; i < 10; i++) await step(100);
    const s2 = await state();
    const spoke = await ev(() => __inkwave.match.learn.log.filter((e) => e.name === 'learn:answer' && e.phase === 'S').pop());
    check(!!spoke && spoke.unscored === true, `${label}: stepping off = 说完了: the hit (unscored, nothing written)`, spoke);
    check(s2.bossHp < hp0, `${label}: the boss's HP down (${hp0} → ${s2.bossHp})`);
    for (let i = 0; i < 14; i++) await step(100);
    return { ok: true, unscored: true };
  }

  // ---------------------------------------------------------------------------------------------- the questions
  let n = 0, guard = 0;
  const seen = {};
  try { while (guard++ < MAXQ + 6) {
    const w = await untilQuestion();
    if (w.done) { say('level done'); break; }
    if (w.timeout) { check(false, 'no question came up'); break; }
    if (w.card) { check(false, 'a question card came up (a kind the arena has no play for)'); break; }
    for (let i = 0; i < 3; i++) await step(100);
    const s = await state();
    if (!s.asking && !w.echo) { await step(300); continue; }
    const right = await rightAnswer();
    const label = `q${++n} ${s.mechanic} ${s.item || ''}`;
    check(!s.panelShown && !s.cardUp, `${label}: no question card (.iw-learn__panel not shown)`);
    check(s.paused === false, `${label}: match.paused === false`);
    check(!s.hold, `${label}: learn.hold falsy`);
    check(s.controller, `${label}: her controller is live (she can run)`);
    check(s.touchLive !== false || !V.touch, `${label}: the touch layer stays live`);
    check(!!s.strip && s.strip.rect[3] > 0, `${label}: the strip: 「${s.strip && s.strip.text}」`);
    if (FORM === 'boss') check(s.bossMove === null, `${label}: the boss is between moves while she answers`);
    const before = s.answers.length, inks = s.inks, hps = s.hps;
    let v = null;
    if (s.mechanic === 'm1') v = await answerM1(s, right, label);
    else if (s.mechanic === 'type') v = await answerType(s, right, label);
    else if (s.mechanic === 'echo') v = await answerEcho(s, label);
    else check(false, `${label}: an unknown mechanic ${s.mechanic}`);
    const s2 = await state();
    check(!!v && v.ok === true, `${label}: answered right`, v || s2.dbg);
    if (s.mechanic !== 'echo') {
      const na = s2.answers.slice(before);
      check(na.length === 1 && na[0].first === true, `${label}: learn:answer once, first of the day`, na);
      if (FORM !== 'boss') check(s2.inks > inks, `${label}: the zone flooded with her ink (learn:ink)`);
      else check(s2.hps > hps && s2.bossHp < s.bossHp, `${label}: the weak-point hit: HP ${s.bossHp} → ${s2.bossHp}`);
    }
    check(!s2.paused && !s2.panelShown, `${label}: still no pause, no card`);
    report.questions.push({ label, mechanic: s.mechanic, item: s.item, type: s.type, strip: s.strip && s.strip.text, verdict: v, her: s.her, cam: s.cam, fov: s.fov, shield: s.shield });
    seen[s.mechanic] = (seen[s.mechanic] || 0) + 1;
    for (let i = 0; i < 8; i++) await step(100);
    if (n >= MAXQ) break;
  } } catch (e) { check(false, 'driver error', String(e && e.message || e) + ' ' + String(e && e.stack || '').split('\n').slice(1, 3).join(' | ')); }
  const end = await ev(() => { const F = __inkwave.match.learn; return { phase: F.phase, round: F.round, log: F.log.map((e) => e.name.replace('learn:', '') + (e.ok != null ? (e.ok ? '+' : '-') : '') + (e.first ? '*' : '')).slice(-30).join(' '), ev: Object.keys(JSON.parse(localStorage.getItem('inkwave:learn:v1') || '{"ev":{}}').ev), fps: __inkwave.fps }; });
  report.end = end; report.seen = seen; report.fails = fails; report.badResponses = bad; report.errors = errs;
  say('end', JSON.stringify({ seen, end }));
  check(n >= 1, `questions answered: ${n}`);
  say(`${fails.length ? fails.length + ' FAILED' : 'all checks passed'} · 4xx ${bad.length} · console errors ${errs.length}`);
  for (const e of errs.slice(0, 5)) say('  ' + e);
  for (const b of bad.slice(0, 5)) say('  ' + b);
  if (bad.length) allFails.push(`${VIEW}: ${bad.length} bad responses`);
  if (errs.length) allFails.push(`${VIEW}: ${errs.length} console errors: ${errs[0]}`);
  await ctx.close();
} catch (e) { allFails.push(`${viewName}: driver error ${String(e && e.message || e).slice(0, 300)}`); say('driver error', String(e && e.message || e).slice(0, 600)); } }
await finishAll();
