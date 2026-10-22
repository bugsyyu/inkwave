// scratch (wf-softlock, fourth agent): why board-hitch's walk3 takes seconds a frame on this branch. Same path as
// tools/learn/board-hitch.mjs up to walk3 (synthetic learner: the game's own default, no progress file). Per frame: ms,
// the 2D-canvas calls by canvas (which canvas draws every frame, how big, shown or not), WebGL uploads, DOM size; the
// compositor's layers (CDP LayerTree: which repaint per frame, their size); after the onset one suspect off at a time.
//   node w3-why.mjs --root <inkwave checkout> --out <dir> [--cpu 1] [--dpr 3] [--max 120]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const ROOT = path.resolve(opt('root', '.')), OUT = path.resolve(opt('out', '.'));
const CPU = +opt('cpu', 1), DPR = +opt('dpr', 3), MAX = +opt('max', 120);
fs.mkdirSync(OUT, { recursive: true });
const T0 = Date.now(), say = (...a) => console.log(`[w3why ${((Date.now() - T0) / 1000).toFixed(1).padStart(6)}]`, ...a);
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

// in the page before anything runs: every 2D-canvas draw call counted by canvas; WebGL uploads by source
function instrument() {
  const H = (window.__why = { ids: new WeakMap(), meta: [], n: new Map(), up: [] });
  const idOf = (cv) => { let i = H.ids.get(cv); if (i === undefined) { i = H.meta.length; H.ids.set(cv, i); H.meta.push(cv); } return i; };
  for (const C of [window.CanvasRenderingContext2D, window.OffscreenCanvasRenderingContext2D]) {
    if (!C) continue;
    for (const m of ['fillRect', 'strokeRect', 'clearRect', 'fill', 'stroke', 'drawImage', 'fillText', 'strokeText', 'putImageData', 'clip']) {
      const f = C.prototype[m]; if (typeof f !== 'function') continue;
      C.prototype[m] = function (...a) { const i = idOf(this.canvas); const k = i + ':' + m; H.n.set(k, (H.n.get(k) || 0) + 1); return f.apply(this, a); };
    }
  }
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue;
    const ti = C.prototype.texImage2D, ts = C.prototype.texSubImage2D;
    const src = (a) => { const s = a[a.length - 1]; return s && typeof s === 'object' && 'width' in s && s.width >= 64 ? s : null; };
    C.prototype.texImage2D = function (...a) { const s = src(a); if (s && s instanceof HTMLCanvasElement) H.up.push('tex:' + idOf(s)); return ti.apply(this, a); };
    C.prototype.texSubImage2D = function (...a) { const s = src(a); if (s && s instanceof HTMLCanvasElement) H.up.push('sub:' + idOf(s)); return ts.apply(this, a); };
  }
}

const browser = await chromium.launch({ args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
await ctx.addInitScript(() => { try { const k = 'inkwave.settings', v = JSON.parse(localStorage.getItem(k) || '{}'); Object.assign(v, { shadows: false, bloom: false, touchControls: 'on' }); localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* none */ } });
await ctx.addInitScript(instrument);
const page = await ctx.newPage(), errs = [];
page.on('pageerror', (e) => errs.push(e.message));
const ev = (fn, ...a) => page.evaluate(fn, ...a);
await page.goto(base + 'index.html?learn=w2d3&kind=puzzle&from=app&quality=low&nofullscreen&noclips', { waitUntil: 'load', timeout: 180000 });
await page.waitForFunction(() => window.__inkwave && __inkwave.match && __inkwave.match.state === 'playing' && __inkwave.match.learn, null, { timeout: 600000, polling: 500 });
await ev(() => __inkwave.debug.freeze());
const cdp = await ctx.newCDPSession(page);
if (CPU > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: CPU });
say('playing', ROOT);
const frames = [];
// a canvas's description: size, class, in the document, shown (has boxes), its parent's class
const DESC = `(cv) => { if (!cv) return '?'; const r = cv.getClientRects ? cv.getClientRects().length : -1; return (cv.className || cv.constructor.name) + ' ' + cv.width + 'x' + cv.height + (cv.isConnected ? ' in-doc' : ' detached') + (r > 0 ? ' shown' : ' hidden') + (cv.parentElement ? ' <' + (cv.parentElement.className || cv.parentElement.tagName) + '>' : ''); }`;
async function step(n, what, draw = true) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const r = await ev(([dr, desc]) => {
      const H = window.__why; H.n.clear(); H.up.length = 0;
      const t = performance.now(); __inkwave._skipRender = !dr;
      try { __inkwave._frame(1 / 30); } finally { __inkwave._skipRender = false; }
      const ms = performance.now() - t, F = __inkwave.match.learn, W = F && F.play && F.play.boards && F.play.boards.walk;
      const D = eval(desc), byCv = {};
      for (const [k, c] of H.n) { const [id, m] = k.split(':'); const o = byCv[id] || (byCv[id] = { d: D(H.meta[+id]), n: 0, m: {} }); o.n += c; o.m[m] = c; }
      return { ms: +ms.toFixed(1), cv: byCv, up: H.up.slice(), dom: document.getElementsByTagName('*').length, anims: document.getAnimations().length, framed: W ? W.framed : -1, auto: !!(F && F.auto), phase: F && F.phase, cls: (document.querySelector('.iw-learn') || {}).className || '' };
    }, [draw, DESC]);
    frames.push({ what, drawn: draw, ...r }); out.push(r.ms);
  }
  return out;
}
const state = () => ev(() => { const F = __inkwave.match.learn, W = F.play.boards.walk; return { phase: F.phase, cur: F.cur, auto: F.auto, framed: W ? W.framed : -1 }; });
const p50 = (a) => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
// the compositor's layers now: { id: { w, h, pc (paintCount), node, draws } }
let lastLayers = null;
cdp.on('LayerTree.layerTreeDidChange', (e) => { if (e.layers) lastLayers = e.layers; });
async function layers(tag) {
  await step(1, 'layers-' + tag);
  await new Promise((r) => setTimeout(r, 1500));
  const L = lastLayers || [];
  const o = {};
  for (const l of L) o[l.layerId] = { w: Math.round(l.width), h: Math.round(l.height), pc: l.paintCount, node: l.backendNodeId || 0, draws: l.drawsContent, inv: !!l.invisible };
  return o;
}
async function describe(ids) {
  const names = {};
  for (const id of ids) { try { const { node } = await cdp.send('DOM.describeNode', { backendNodeId: id }); names[id] = `${node.nodeName}.${(node.attributes || []).join(' ').slice(0, 90)}`; } catch (e) { names[id] = '?'; } }
  return names;
}
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
await cdp.send('DOM.enable'); await cdp.send('DOM.getDocument', { depth: -1 });
await cdp.send('LayerTree.enable');
const L0 = await layers('pre');
await ev(() => { const F = __inkwave.match.learn; F._open(F.gates[F.cur]); });
const o2 = await step(45, 'opened2');
say('opened2 p50', p50(o2), 'max', Math.max(...o2), 'keyed', keyed);
const L1 = await layers('o2');
await ev(() => __inkwave.match.learn.autoWalk(true));
let run = 0, n3 = 0, onset = -1;
const w3 = [];
while (n3 < MAX) { const [ms] = await step(1, 'walk3'); w3.push(ms); n3++; run = ms > 1000 ? run + 1 : 0; if (run >= 3) { onset = n3 - 3; break; } }
say('walk3', n3, 'frames; onset', onset, 'p50', p50(w3), 'max', Math.max(...w3), 'ms:', w3.join(' '));
const L2 = await layers('w3');
// layers that painted between the snapshots, and the big ones
const diff = (A, B) => Object.entries(B).map(([id, l]) => ({ id, ...l, dpc: l.pc - ((A[id] && A[id].pc) || 0), isNew: !A[id] })).filter((l) => l.dpc > 0 || l.isNew).sort((a, b) => b.w * b.h - a.w * a.h);
const d01 = diff(L0, L1), d12 = diff(L1, L2);
const big = Object.entries(L2).map(([id, l]) => ({ id, ...l })).sort((a, b) => b.w * b.h - a.w * a.h).slice(0, 12);
const nodes = await describe([...new Set([...d01, ...d12, ...big].map((l) => l.node).filter(Boolean))].slice(0, 40));
say('layers: pre', Object.keys(L0).length, 'o2', Object.keys(L1).length, 'w3', Object.keys(L2).length);
say('painted during opened2', JSON.stringify(d01.slice(0, 15).map((l) => [l.w + 'x' + l.h, 'dpc ' + l.dpc, l.isNew ? 'new' : '', nodes[l.node] || l.node])));
say('painted during walk3', JSON.stringify(d12.slice(0, 15).map((l) => [l.w + 'x' + l.h, 'dpc ' + l.dpc, l.isNew ? 'new' : '', nodes[l.node] || l.node])));
say('biggest layers', JSON.stringify(big.map((l) => [l.w + 'x' + l.h, l.draws ? 'draws' : '', l.inv ? 'inv' : '', nodes[l.node] || l.node])));
await cdp.send('LayerTree.disable');
// canvases drawn per frame in opened2 vs walk3
const cvSum = (what) => { const o = {}; for (const f of frames.filter((x) => x.what === what)) for (const [id, c] of Object.entries(f.cv)) { const q = o[id] || (o[id] = { d: c.d, frames: 0, calls: 0, m: {} }); q.frames++; q.calls += c.n; for (const [m, n] of Object.entries(c.m)) q.m[m] = (q.m[m] || 0) + n; } return o; };
say('canvas calls opened2', JSON.stringify(cvSum('opened2')));
say('canvas calls walk3', JSON.stringify(cvSum('walk3')));
say('uploads walk3', JSON.stringify(frames.filter((x) => x.what === 'walk3').map((f) => f.up.join(',')).filter(Boolean)));
say('dom / anims walk3', JSON.stringify(frames.filter((x) => x.what === 'walk3').map((f) => f.dom + '/' + f.anims)));
const res = { onset, w3, keyed, steps: {}, d01, d12, big, nodes };
if (onset >= 0) {
  const tryOff = async (name, off, on) => { await ev(off); const a = await step(6, 'off-' + name); await ev(on); const b = await step(4, 'on-' + name); res.steps[name] = { off: a, on: b }; say(name, 'off', a.join(' '), '| on', b.join(' ')); };
  await tryOff('learn', () => { document.querySelector('.iw-learn').style.display = 'none'; }, () => { document.querySelector('.iw-learn').style.display = ''; });
  await tryOff('touch', () => { for (const e of document.querySelectorAll('.iw-touch')) e.style.display = 'none'; }, () => { for (const e of document.querySelectorAll('.iw-touch')) e.style.display = ''; });
  await tryOff('ui-root', () => { document.getElementById('ui-root').style.display = 'none'; }, () => { document.getElementById('ui-root').style.display = ''; });
  const nr = await step(6, 'norender', false), back = await step(4, 'back');
  res.steps.norender = { off: nr, on: back }; say('norender', nr.join(' '), '| back', back.join(' '));
}
res.errors = errs;
fs.writeFileSync(path.join(OUT, 'w3-why.json'), JSON.stringify({ ...res, frames }, null, 1));
say('errors', JSON.stringify(errs));
await browser.close(); srv.close();
