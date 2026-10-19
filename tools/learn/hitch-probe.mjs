// 主菜单的卡顿探针（LEARN §40）: her App's way in — index.html?from=app&today=… (加载 → 标题画面 → 点一下 → 主菜单 →
// 开始今天的关), with the --native device of parity-shots — and per stage the numbers that do not depend on this machine:
// shader programs made (three's renderer.info.programs and every gl.linkProgram), programs first used (the moment a
// driver without KHR_parallel_shader_compile — WebKit, SwiftShader — really compiles: three's first getUniforms), the
// long tasks (PerformanceObserver 'longtask') and the frames. No screenshots (nothing of hers is on screen, but nothing
// to delete either).
//   node tools/learn/hitch-probe.mjs [--native iphone16] [--dpr 3] [--view portrait] [--today w1d3] [--title 6] [--idle 10]
//        [--level 8] [--json <file>]
// Stages: boot (to the title screen) · title (--title s on it, ≥ 3 frames) · tap (the tap → the main menu) · main10 (the
// main menu's first --idle s: the criterion is 0 programs made here) · main (the rest, to the 开始今天的关 tap) · start (the
// tap → the level live) · level (its first --level s, ≥ 3 frames). Exit 1 when the page fails, the watchdog fires, or a stage
// never comes; the numbers themselves are reported, not judged.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');   // (NODE_PATH, as the audits)

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const DPR = +opt('dpr', 3), TODAY = opt('today', 'w1d3'), TITLE = +opt('title', 6), IDLE = +opt('idle', 10), LEVEL = +opt('level', 8);
// (the same made-up native pages as tools/learn/parity-shots.mjs: display / device, no message handlers)
const NATIVE = {
  iphone16: { platform: 'ios', display: { maxFps: 120, highRefresh: true }, device: { model: 'iPhone16,1', memGB: 8, cores: 6 } },
  iphone15: { platform: 'ios', display: { maxFps: 60, highRefresh: false }, device: { model: 'iPhone15,4', memGB: 6, cores: 6 } },
  iphone12: { platform: 'ios', display: { maxFps: 60, highRefresh: false }, device: { model: 'iPhone13,2', memGB: 4, cores: 6 } },
};
const NAT = NATIVE[opt('native', 'iphone16')] || null;
const VIEW = { portrait: { w: 390, h: 844 }, landscape: { w: 844, h: 390 } }[opt('view', 'portrait')] || { w: 390, h: 844 };
const MIME = { html: 'text/html; charset=utf-8', js: 'text/javascript; charset=utf-8', mjs: 'text/javascript; charset=utf-8', css: 'text/css; charset=utf-8', json: 'application/json; charset=utf-8', webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', svg: 'image/svg+xml', woff2: 'font/woff2', ogg: 'audio/ogg', mp3: 'audio/mpeg', glb: 'model/gltf-binary', bin: 'application/octet-stream', ktx2: 'image/ktx2', wasm: 'application/wasm' };
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, 'http://x').pathname);
  if (!u.startsWith('/game/')) { r.writeHead(404); return r.end(); }   // (../index.html = the lesson page: the watchdog's way back)
  const p = path.join(ROOT, u.slice('/game'.length));
  if (u === '/game/songs/manifest.json' && !fs.existsSync(p)) { r.writeHead(200, { 'content-type': MIME.json }); return r.end('{ "tracks": {} }'); }
  if (!p.startsWith(ROOT) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': MIME[path.extname(p).slice(1)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(p).pipe(r);
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const base = `http://127.0.0.1:${srv.address().port}/game/`;

// in the page, before anything runs: long tasks, program links / first uses, and (once the game is up) menus.show + every frame
function instrument(nat) {
  if (nat) window.__IELTS_NATIVE = nat;
  const H = (window.__hp = { lt: [], link: [], use: [], marks: [], frames: [], prog: [], names: [], beats: [] });
  const now = () => performance.now();
  // (every beat of her App's boot watchdog, index.html __gfBeat: the longest gap between two is what the watchdog sees)
  let beatFn;
  Object.defineProperty(window, '__gfBeat', { configurable: true, get: () => beatFn, set: (f) => { beatFn = function () { H.beats.push(now()); return f.apply(this, arguments); }; } });
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) H.lt.push([e.startTime, e.duration]); }).observe({ type: 'longtask', buffered: true }); } catch (e) { H.noLT = String(e); }
  for (const C of [window.WebGL2RenderingContext, window.WebGLRenderingContext]) {
    if (!C) continue;
    const lp = C.prototype.linkProgram, gp = C.prototype.getProgramParameter, ss = C.prototype.shaderSource, at = C.prototype.attachShader;
    // (each link labelled from its fragment shader: three's SHADER_NAME (the material's name), else the built-in it is,
    // else its first uniform — enough to tell what a stage built)
    const src = new WeakMap(), frag = new WeakMap();
    C.prototype.shaderSource = function (sh, s) { src.set(sh, s); return ss.call(this, sh, s); };
    C.prototype.attachShader = function (p, sh) { const s = src.get(sh) || ''; if (/gl_FragColor|out highp vec4|pc_fragColor|layout\(location/.test(s) || !frag.has(p)) frag.set(p, s); return at.call(this, p, sh); };
    const label = (s) => { const n = /#define SHADER_NAME (\S+)/.exec(s); if (n) return n[1];
      const b = /#define (STANDARD|PHYSICAL|LAMBERT|PHONG|TOON|MATCAP|DEPTH_PACKING|DISTANCE|USE_SHADOWMAP|BASIC)\b/.exec(s); if (b) return 'three:' + b[1];
      // (a ShaderMaterial without a name: its first own uniforms — three's built-ins skipped)
      const own = [...s.matchAll(/uniform\s+(?:\w+\s+)?\w+\s+(\w+)/g)].map((m) => m[1]).filter((n) => !/^(viewMatrix|cameraPosition|isOrthographic|modelMatrix|modelViewMatrix|projectionMatrix|normalMatrix|toneMappingExposure)$/.test(n));
      return 'raw:' + (own.slice(0, 3).join('+') || '?'); };
    C.prototype.linkProgram = function (p) { const t = now(); H.link.push(t); H.names.push([t, label(frag.get(p) || '')]); return lp.call(this, p); };
    // (three's WebGLUniforms asks ACTIVE_UNIFORMS once per program, on its first use: where a serial driver blocks)
    C.prototype.getProgramParameter = function (p, k) {
      if (k !== 0x8B86) return gp.call(this, p, k);
      const a = now(), v = gp.call(this, p, k); H.use.push([a, now() - a, label(frag.get(p) || '')]); return v;
    };
  }
  const iv = setInterval(() => {
    const g = window.__inkwave;
    if (!g || !g.menus || H.booted) return;
    clearInterval(iv);
    H.booted = now(); H.marks.push(['booted', H.booted, g.menus.current]);
    H.prog.push(['booted', window.__G.renderer.info.programs.length]);
    H.bootWarm = g.bootWarm || null; H.bootMarks = g.bootMarks || null;
    const fade = g._fade.bind(g);
    g._fade = (to, ms) => { H.marks.push(['fade:' + to, now()]); return fade(to, ms); };
    const show = g.menus.show.bind(g.menus);
    g.menus.show = (name, o) => { H.marks.push(['show:' + name, now()]); return show(name, o); };
    const frame = g._frame.bind(g);
    let mode = '';
    g._frame = (dt) => {
      const a = now();
      const m = g.match, s = window.__G.mode + ':' + (m ? (m.attract ? 'attract' : m.state) : '-');
      if (s !== mode) { H.marks.push(['state:' + s, a]); mode = s; }
      frame(dt);
      H.frames.push([a, now() - a]);
    };
  }, 50);
}

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium', args: ['--no-sandbox', '--ignore-gpu-blocklist', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.newContext({ viewport: { width: VIEW.w, height: VIEW.h }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true });
const page = await ctx.newPage(), errs = [];
let left = null;
page.on('pageerror', (e) => errs.push(e.message));
page.on('framenavigated', (f) => { if (f === page.mainFrame() && !f.url().includes('/game/')) left = f.url(); });
await page.addInitScript(instrument, NAT);
const fail = (why) => { errs.push(why); throw new Error(why); };
const pnow = () => page.evaluate(() => performance.now());
const waitFor = (fn, arg, secs, why) => page.waitForFunction(fn, arg, { timeout: secs * 1000, polling: 250 }).catch(() => fail(why + (left ? ' (left for ' + left + ')' : '')));
const progs = async (name) => page.evaluate((n) => { const H = __hp; H.prog.push([n, __G.renderer.info.programs.length]); }, name);
const T = {};
let code = 0;
try {
  await page.goto(base + `index.html?from=app&today=${TODAY}&proglog` + (NAT ? '&applegpu' : ''), { waitUntil: 'load', timeout: 180000 });
  await waitFor(() => window.__hp && __hp.booted && __inkwave.menus.current === 'title', null, 300, 'never reached the title screen');
  T.booted = await page.evaluate(() => __hp.booted);
  // a few seconds on the title (≥ 3 frames), as she looks at it
  await waitFor(([t0, s]) => performance.now() - t0 > s * 1000 && __hp.frames.filter((f) => f[0] > t0).length >= 3, [T.booted, TITLE], 240, 'title never drew 3 frames');
  await progs('title');
  T.tap = await pnow();
  await page.mouse.click(VIEW.w / 2, VIEW.h * 0.7);   // (a real tap on the title screen: any point of it)
  await waitFor(() => __hp.marks.some((m) => m[0] === 'show:main'), null, 240, 'never reached the main menu');
  T.main = await page.evaluate(() => __hp.marks.find((m) => m[0] === 'show:main')[1]);
  await waitFor(([t0, s]) => performance.now() - t0 > s * 1000, [T.main, IDLE], 600, 'main menu idle');
  await progs('main+' + IDLE + 's');
  T.today = await pnow();
  const bb = await page.locator('.iw-btn--today').boundingBox({ timeout: 300000 });
  await page.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
  // (live = the round playing and the fade-in begun: what she sees from then on is the level)
  const live = (t0) => { const M = __hp.marks, p = M.find((m) => m[0] === 'state:match:playing' && m[1] > t0), f = M.find((m) => m[0] === 'fade:0' && m[1] > t0); return p && f ? Math.max(p[1], f[1]) : 0; };
  await waitFor(([src, t0]) => (0, eval)(src)(t0) > 0, [live.toString(), T.today], 600, 'the level never went live');
  T.go = await page.evaluate(([src, t0]) => (0, eval)(src)(t0), [live.toString(), T.today]);
  await waitFor(([t0, s]) => performance.now() - t0 > s * 1000 && __hp.frames.filter((f) => f[0] > t0).length >= 3, [T.go, LEVEL], 600, 'the level never drew 3 frames');
  await progs('level+' + LEVEL + 's');
} catch (e) { code = 1; console.log('[hitch] ' + e.message); }
// the generated texture library, read back after the run (every layer, every mip level, all three attachments; FNV-1a 32 a
// layer): LEARN §42 changes when it is generated, never what — this must come out the same before and after
const texHash = await page.evaluate(() => {
  const lib = window.__inkwave?.texlib, r = window.__G?.renderer;
  if (!lib || !r) return null;
  const gl = r.getContext(), fb = gl.createFramebuffer(), out = { size: lib.size, layers: lib.names.length, stats: lib.stats, hash: {} };
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  for (const k of ['albedo', 'normal', 'orm']) {
    const wt = r.properties.get(lib[k]).__webglTexture, per = [];
    for (let layer = 0; layer < lib.names.length; layer++) {
      let h = 0x811c9dc5;
      for (let lv = 0, s = lib.size; s >= 1; lv++, s >>= 1) {
        gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, wt, lv, layer);
        const buf = new Uint8Array(s * s * 4);
        gl.readPixels(0, 0, s, s, gl.RGBA, gl.UNSIGNED_BYTE, buf);
        for (let i = 0; i < buf.length; i++) h = Math.imul(h ^ buf[i], 16777619) >>> 0;
      }
      per.push(h.toString(16).padStart(8, '0'));
    }
    out.hash[k] = per;
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fb); r.resetState();
  return out;
}).catch((e) => ({ error: e.message }));
// every program three made, in order, with its cache key (main.js ?proglog): what a warm-up compile and the real draw disagree on
const progKeys = await page.evaluate(() => window.__progKeys || null).catch(() => null);
const H = await page.evaluate(() => window.__hp).catch(() => null);
await browser.close(); srv.close();
if (!H) { console.log('[hitch] no data'); process.exit(1); }

// stages → counts
const end = Math.max(...H.frames.map((f) => f[0] + f[1]), ...H.lt.map((l) => l[0] + l[1]), T.go || 0) + 1;
const cuts = [['boot', 0, T.booted], ['title', T.booted, T.tap], ['tap', T.tap, T.main], ['main10', T.main, T.main != null ? T.main + IDLE * 1000 : null],
  ['main', T.main != null ? T.main + IDLE * 1000 : null, T.today], ['start', T.today, T.go], ['level', T.go, end]].filter((c) => c[1] != null && c[2] != null);
const inR = (t, a, b) => t >= a && t < b;
const ms = (x) => Math.round(x);
const rows = cuts.map(([name, a, b]) => {
  const lt = H.lt.filter((l) => inR(l[0], a, b)), use = H.use.filter((u) => inR(u[0], a, b)), fr = H.frames.filter((f) => inR(f[0], a, b));
  return { stage: name, secs: +((b - a) / 1000).toFixed(1), links: H.link.filter((t) => inR(t, a, b)).length, firstUse: use.length, useMs: ms(use.reduce((s, u) => s + u[1], 0)),
    made: H.names.filter((x) => inR(x[0], a, b)).map((x) => x[1]), longTasks: lt.length, longMs: ms(lt.reduce((s, l) => s + l[1], 0)), longMax: ms(Math.max(0, ...lt.map((l) => l[1]))), frames: fr.length, frameMax: ms(Math.max(0, ...fr.map((f) => f[1]))) };
});
// the first frame after the main menu shows / the level goes live: how long from that moment to the end of it
const fnvAll = (list) => { let h = 0x811c9dc5; for (const c of list.join('')) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0; return h.toString(16).padStart(8, '0'); };
const firstAfter = (t) => { const f = t != null && H.frames.find((x) => x[0] >= t); return f ? ms(f[0] + f[1] - t) : null; };
// the longest stretch of the boot with no __gfBeat (from the page's start to the title): her App's watchdog gives up at 60 s
const bb = [0, ...H.beats.filter((t) => T.booted == null || t <= T.booted), ...(T.booted != null ? [T.booted] : [])];
let beatGap = [0, 0];
for (let i = 1; i < bb.length; i++) if (bb[i] - bb[i - 1] > beatGap[1]) beatGap = [ms(bb[i - 1]), ms(bb[i] - bb[i - 1])];
const out = { native: opt('native', 'iphone16'), beatGapMs: beatGap[1], beatGapAt: beatGap[0], texHash, progKeys, dpr: DPR, view: VIEW, today: TODAY, programs: H.prog, stages: rows, mainFirstFrameMs: firstAfter(T.main), levelFirstFrameMs: firstAfter(T.go),
  marks: H.marks.map((m) => [m[0], ms(m[1])]), bootWarm: H.bootWarm, bootMarks: H.bootMarks, names: H.names.map((n) => [ms(n[0]), n[1]]), noLongTaskObserver: H.noLT || undefined, left, errors: errs,
  // (the raw timeline, page ms: links, first uses [at, ms], long tasks [at, ms], frames [at, ms])
  raw: { beats: H.beats.map(ms), link: H.link.map(ms), use: H.use.map((u) => [ms(u[0]), ms(u[1]), u[2]]), lt: H.lt.map((l) => [ms(l[0]), ms(l[1])]), frames: H.frames.map((f) => [ms(f[0]), ms(f[1])]) } };
for (const r of rows) console.log(`[hitch] ${r.stage.padEnd(6)} ${String(r.secs).padStart(6)} s · links ${r.links} · first use ${r.firstUse} (${r.useMs} ms) · long tasks ${r.longTasks} (${r.longMs} ms, max ${r.longMax}) · frames ${r.frames} (max ${r.frameMax} ms)${r.made.length && r.stage !== 'boot' ? ' · made ' + r.made.slice(0, 8).join(', ') + (r.made.length > 8 ? ' …' : '') : ''}`);
console.log(`[hitch] programs ${H.prog.map((p) => p[0] + ' ' + p[1]).join(' · ')}`);
if (out.bootWarm) console.log(`[hitch] boot warm-up ${JSON.stringify(out.bootWarm)}`);
console.log(`[hitch] boot: longest stretch with no __gfBeat ${beatGap[1]} ms (from ${beatGap[0]} ms) · beats ${bb.length - 2}`);
if (texHash) console.log(`[hitch] texture library ${texHash.error ? 'read failed: ' + texHash.error : texHash.size + 'px × ' + texHash.layers + ' · ' + ['albedo', 'normal', 'orm'].map((k) => k + ' ' + fnvAll(texHash.hash[k])).join(' · ')}`);
console.log(`[hitch] main menu: first frame done ${out.mainFirstFrameMs} ms after it showed · level: first frame done ${out.levelFirstFrameMs} ms after it went live`);
if (left) { code = 1; console.log('[hitch] the page left for ' + left + ' (watchdog?)'); }
if (errs.length) { code = 1; console.log('[hitch] errors: ' + errs.join(' | ').slice(0, 600)); }
if (opt('json')) fs.writeFileSync(opt('json'), JSON.stringify(out, null, 1));
process.exit(code);
