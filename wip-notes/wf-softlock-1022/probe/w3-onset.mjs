// scratch (wf-softlock, third agent): board-hitch's walk3 still takes seconds a frame on f802d3a (the hidden minimap was
// not it). Same path as tools/learn/board-hitch.mjs up to walk3; then drawn frames until the slowdown sets in, and after
// it, one suspect off at a time (does the backlog drain?): the learn layer, the whole #ui-root, the WebGL render. Then a
// trace of a few slow frames: paint / raster events by what they painted, the GPU process's top events.
//   node w3-onset.mjs --root <inkwave checkout> --out <dir> [--cpu 1] [--dpr 3] [--css "<rules>"] [--max 140]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(opt('root', '.')), OUT = path.resolve(opt('out', '.')), CSS = opt('css', '');
const CPU = +opt('cpu', 1), DPR = +opt('dpr', 3), MAX = +opt('max', 140);
fs.mkdirSync(OUT, { recursive: true });
const T0 = Date.now(), say = (...a) => console.log(`[w3o ${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}]`, ...a);
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', woff2: 'font/woff2', ogg: 'audio/ogg', mp3: 'audio/mpeg', glb: 'model/gltf-binary', bin: 'application/octet-stream', ktx2: 'image/ktx2', wasm: 'application/wasm' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if (!u.startsWith('/game/')) { r.writeHead(404); return r.end(); }
  const p = path.join(ROOT, u.slice('/game'.length));
  if (u === '/game/songs/manifest.json' && !fs.existsSync(p)) { r.writeHead(200, { 'content-type': MIME.json }); return r.end('{ "tracks": {} }'); }
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(p).slice(1)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(p).pipe(r);
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${srv.address().port}/game/`;
const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { const k = 'inkwave.settings', v = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(v, { shadows: false, bloom: false, touchControls: 'on' }); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* none */ } });
if (CSS) await ctx.addInitScript((css) => { addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); }); }, CSS);
const page = await ctx.newPage(), errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
await page.goto(base + 'index.html?learn=w2d3&kind=puzzle&from=app&quality=low&nofullscreen&noclips', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__inkwave && __inkwave.match && __inkwave.match.state === 'playing' && __inkwave.match.learn, null, { timeout: 600000, polling: 500 });
await ev(() => __inkwave.debug.freeze());
const cdp = await ctx.newCDPSession(page);
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
say('playing', ROOT, CSS ? 'css: ' + CSS : '');
const frames = [];
async function step(n, what, draw = true) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = await ev((dr) => {
      const t = performance.now(); __inkwave._skipRender = !dr;
      try { __inkwave._frame(1 / 30); } finally { __inkwave._skipRender = false; }
      const F = __inkwave.match.learn, W = F && F.play && F.play.boards && F.play.boards.walk;
      return { ms: +(performance.now() - t).toFixed(1), framed: W ? W.framed : -1, cls: (document.querySelector('.iw-learn') || {}).className || '' };
    }, draw);
    frames.push({ what, ...r }); out.push(r.ms);
  }
  return out;
}
const state = () => ev(() => { const F = __inkwave.match.learn, W = F.play.boards.walk; return { phase: F.phase, cur: F.cur, auto: F.auto, framed: W ? W.framed : -1 }; });
const p50 = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
// board-hitch's path (the same steps, the same order)
await step(36, 'start');
await ev(() => { const F = __inkwave.match.learn; F._open(F.gates[F.cur]); });
await step(45, 'opened');
await ev(() => __inkwave.match.learn.autoWalk(true));
let s = null;
for (let i = 0; i < 600; i++) { await step(1, 'walk', false); if (i % 10 === 9) { s = await state(); if (s.framed >= 0 && !s.auto) break; } }
say('at the board', JSON.stringify(s));
await step(8, 'framed');
await step(36, 'framed', false);
const keyed = await ev(() => { const b = document.querySelector('.iw-learn__more'); if (b && !b.hidden) { b.click(); return 'key'; } const W = __inkwave.match.learn.play.boards.walk; return W && W.framed >= 0 && W.activate('more') ? 'hotspot' : false; });
await step(4, 'strip');
await ev(() => document.querySelector('.iw-read__x')?.click());
await ev(() => __inkwave.match.learn.autoWalk(true));
for (let i = 0; i < 600; i++) { await step(1, 'walk2', false); if (i % 10 === 9) { s = await state(); if (s.phase !== 'walk') break; } }
await ev(() => { const F = __inkwave.match.learn; F._open(F.gates[F.cur]); });
const o2 = await step(45, 'opened2');
say('opened2 p50', p50(o2), 'max', Math.max(...o2), 'keyed', keyed);
await ev(() => __inkwave.match.learn.autoWalk(true));
// walk3: drawn frames until three in a row are over 1 s (the onset), at most MAX
let run = 0, n3 = 0, onset = -1;
const w3 = [];
while (n3 < MAX) { const [ms] = await step(1, 'walk3'); w3.push(ms); n3++; run = ms > 1000 ? run + 1 : 0; if (run >= 3) { onset = n3 - 3; break; } }
say('walk3', n3, 'frames; onset', onset, 'p50', p50(w3), 'max', Math.max(...w3), 'ms:', w3.join(' '));
const anims = await ev(() => document.getAnimations().filter((a) => a.playState === 'running').map((a) => `${a.animationName || a.transitionProperty || '?'}@${(a.effect && a.effect.target && typeof a.effect.target.className === 'string' ? a.effect.target.className : '?').slice(0, 40)} t=${Math.round(a.currentTime || 0)}`));
say('running animations', JSON.stringify(anims));
const res = { onset, w3, anims, keyed, steps: {} };
if (onset >= 0) {
  // after the onset: each suspect off for 8 drawn frames (then back on, 6 frames)
  const tryOff = async (name, off, on) => { await ev(off); const a = await step(8, 'off-' + name); await ev(on); const b = await step(6, 'on-' + name); res.steps[name] = { off: a, on: b }; say(name, 'off', a.join(' '), '| on', b.join(' ')); };
  await tryOff('learn', () => { document.querySelector('.iw-learn').style.display = 'none'; }, () => { document.querySelector('.iw-learn').style.display = ''; });
  await tryOff('ui-root', () => { document.getElementById('ui-root').style.display = 'none'; }, () => { document.getElementById('ui-root').style.display = ''; });
  await tryOff('touch', () => { for (const e of document.querySelectorAll('.iw-touch')) e.style.display = 'none'; }, () => { for (const e of document.querySelectorAll('.iw-touch')) e.style.display = ''; });
  // no WebGL render: 8 frames undrawn, then drawn again
  const nr = await step(8, 'norender', false), back = await step(6, 'back');
  res.steps.norender = { off: nr, on: back }; say('norender', nr.join(' '), '| back', back.join(' '));
  // a trace of 3 slow frames
  const tp = path.join(OUT, 'trace.json');
  await browser.startTracing(page, { path: tp, screenshots: false, categories: ['gpu', 'gpu.service', 'viz', 'cc', 'blink', 'devtools.timeline', 'disabled-by-default-devtools.timeline', 'toplevel', 'disabled-by-default-gpu.decoder'] });
  await step(3, 'trace');
  await browser.stopTracing();
  try {
    const T = JSON.parse(fs.readFileSync(tp, 'utf8')), evs = T.traceEvents || T, tn = new Map(), pn = new Map();
    for (const e of evs) { if (e.ph === 'M' && e.name === 'thread_name') tn.set(e.pid + ':' + e.tid, e.args.name); if (e.ph === 'M' && e.name === 'process_name') pn.set(e.pid, e.args.name); }
    const by = new Map(), paints = new Map(), open = new Map();
    for (const e of evs) {
      const k = e.pid + ':' + e.tid; let d = 0;
      if (e.ph === 'X') d = e.dur || 0; else if (e.ph === 'B') { (open.get(k) || open.set(k, []).get(k)).push(e); continue; } else if (e.ph === 'E') { const st = open.get(k), b = st && st.pop(); if (!b) continue; d = e.ts - b.ts; e.name = b.name; e.args = { ...(b.args || {}), ...(e.args || {}) }; } else continue;
      const key = `${pn.get(e.pid) || e.pid} / ${tn.get(k) || e.tid} / ${e.name}`;
      const o = by.get(key) || { n: 0, us: 0, max: 0 }; o.n++; o.us += d; o.max = Math.max(o.max, d); by.set(key, o);
      if (e.name === 'Paint' || e.name === 'PaintImage' || e.name === 'RasterTask' || e.name === 'UpdateLayer') {
        const a = (e.args && (e.args.data || e.args.tileData || e.args)) || {};
        const pk = `${e.name} node ${a.nodeId ?? '?'} layer ${a.layerId ?? a.layerTreeId ?? '?'} clip ${JSON.stringify(a.clip || a.tileId || '').slice(0, 60)}`;
        const q = paints.get(pk) || { n: 0, us: 0 }; q.n++; q.us += d; paints.set(pk, q);
      }
    }
    res.trace = [...by].sort((a, b) => b[1].us - a[1].us).slice(0, 30).map(([k, o]) => [k, o.n, +(o.us / 1000).toFixed(1), +(o.max / 1000).toFixed(1)]);
    res.paints = [...paints].sort((a, b) => b[1].us - a[1].us).slice(0, 25).map(([k, o]) => [k, o.n, +(o.us / 1000).toFixed(1)]);
    // the painted nodes: what they are
    const ids = [...new Set([...paints.keys()].map((k) => +((/node (\d+)/.exec(k) || [])[1])).filter((x) => x > 0))].slice(0, 20);
    const names = {};
    try { await cdp.send('DOM.enable'); await cdp.send('DOM.getDocument', { depth: -1 }); } catch (e) { /* describeNode may still work */ }
    for (const id of ids) { try { const { node } = await cdp.send('DOM.describeNode', { backendNodeId: id }); names[id] = `${node.nodeName}.${(node.attributes || []).join(' ').slice(0, 80)}`; } catch (e) { names[id] = '?'; } }
    res.nodes = names;
    fs.unlinkSync(tp);
  } catch (e) { res.traceErr = String(e); }
  say('trace top', JSON.stringify(res.trace, null, 0));
  say('paints', JSON.stringify(res.paints, null, 0));
  say('nodes', JSON.stringify(res.nodes));
}
res.errors = errs;
fs.writeFileSync(path.join(OUT, 'w3-onset.json'), JSON.stringify({ ...res, frames }, null, 1));
say('errors', JSON.stringify(errs));
await browser.close(); srv.close();
