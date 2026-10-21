// 主机级的渲染 on her iPhone (the owner, 10-17: 「要高刷新率、高清晰度、原生主机级别的游戏丝滑体验和高度精细渲染」; 10-21: 「手机上真的很卡」
// — LEARN §50): her App names the device (src/core/device.js), the device class picks a launch step (config.js RENDER_STEPS /
// RENDER_START: the tier, the shadows, the particles, the live rungs), whole matches' frame records move it a step at a time
// between launches (src/core/render-gov.js afterMatch), and within the session the live ladder (LiveGov: tests/learn/perf.test.mjs
// holds its state machine) moves the density, the bloom, the AO and 60 / 120 — every session starting at 60. Without a device
// (a web browser, a desktop) everything renders exactly as before.
// 用法：node --test tests/learn/render-gov.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUALITY, TOUCH, RENDER_STEPS, RENDER_START, RENDER_RUNGS, RENDER_LIVE, rendererQuality, withProfile, renderDensity } from '../../src/config.js';
import { deviceClass, deviceInfo } from '../../src/core/device.js';
import { GOV_KEY, LiveGov, rungDensity, startStep, afterMatch, hotPower, liveReadout, loadGov, saveGov } from '../../src/core/render-gov.js';

test('deviceClass: A17 Pro on → top, A16 → high, A15 by memory, older → base; iPads by memory; no model → null', () => {
  for (const m of ['iPhone16,1', 'iPhone17,3', 'iPhone18,2']) assert.equal(deviceClass(m, 8), 'top', m);
  assert.equal(deviceClass('iPhone15,2', 6), 'high');
  assert.equal(deviceClass('iPhone14,2', 6), 'high');
  assert.equal(deviceClass('iPhone14,5', 4), 'base');
  assert.equal(deviceClass('iPhone13,2', 4), 'base');
  assert.equal(deviceClass('iPad16,3', 16), 'top');
  assert.equal(deviceClass('iPad13,1', 6), 'high');
  assert.equal(deviceClass('iPad12,1', 3), 'base');
  for (const m of [null, undefined, '', 'Macmini9,1', 'x86_64', 'iPhone']) assert.equal(deviceClass(m, 8), null, String(m));
});

test('deviceInfo reads her App\'s window.__IELTS_NATIVE; a browser without it has no class', () => {
  const win = { __IELTS_NATIVE: { platform: 'ios', display: { maxFps: 120, highRefresh: true }, device: { model: 'iPhone16,1', memGB: 8, cores: 6 } } };
  assert.deepEqual(deviceInfo(win), { native: true, model: 'iPhone16,1', memGB: 8, cores: 6, maxFps: 120, highRefresh: true, cls: 'top' });
  const none = deviceInfo({});
  assert.equal(none.native, false); assert.equal(none.cls, null); assert.equal(none.model, null);
  assert.equal(deviceInfo({ __IELTS_NATIVE: { platform: 'ios' } }).cls, null, 'an older App build without .device');
});

test('the step table: best first; every step\'s rungs inside the ladder, start ≤ ceiling; the shadows only on 0 and 1, the contact AO only on step 0\'s top rung; every step launches on rung 2 or under', () => {
  assert.deepEqual(RENDER_START, { top: 0, high: 2, base: 3 });
  for (const s of RENDER_STEPS) assert.ok(s.rungs[0] <= 2 && rungDensity(s.rungs[0], 3, 393, 852) <= 2.01, 'a launch at 2.0× or under (step 0 launched at 2.5× before)');
  RENDER_STEPS.forEach((p, i) => assert.equal(p.step, i));
  const [s0, s1, s2, s3, s4] = RENDER_STEPS;
  assert.deepEqual([s0.quality, s0.shadows, s0.shadowSize, s0.particles, s0.rungs], ['high', true, 2048, 1, [2, 5]]);
  assert.deepEqual([s1.quality, s1.shadows, s1.shadowSize, s1.particles, s1.rungs], ['high', true, 2048, 1, [2, 4]]);
  assert.deepEqual([s2.quality, s2.shadows, s2.particles, s2.rungs], ['medium', false, 0.7, [2, 4]]);
  assert.deepEqual([s3.quality, s3.shadows, s3.particles, s3.rungs], ['low', false, 0.4, [1, 3]]);
  assert.deepEqual([s4.quality, s4.shadows, s4.particles, s4.rungs], ['low', false, 0.4, [0, 2]]);
  for (const s of RENDER_STEPS) {
    const [a, b] = s.rungs;
    assert.ok(a >= 0 && a <= b && b < RENDER_RUNGS.length, 'step ' + s.step);
    assert.equal(RENDER_RUNGS.slice(0, b + 1).some((r) => r.ao), s.step === 0, 'the AO only on step 0');
  }
  for (let i = 1; i < RENDER_STEPS.length; i++) assert.ok(RENDER_STEPS[i].rungs[1] <= RENDER_STEPS[i - 1].rungs[1], 'never more rungs further down');
  // the ladder itself: cheapest first, the floor = the old phone default (1.5×, no bloom), the top = 2.5× + the AO
  RENDER_RUNGS.forEach((r, i) => { assert.equal(r.rung, i); if (i) assert.ok(r.px >= RENDER_RUNGS[i - 1].px && (r.px > RENDER_RUNGS[i - 1].px || r.ao), 'rung ' + i); });
  assert.deepEqual([RENDER_RUNGS[0].bloom, RENDER_RUNGS[0].ao], [false, false]);
  assert.equal(RENDER_RUNGS.filter((r) => r.ao).length, 1); assert.equal(RENDER_RUNGS[RENDER_RUNGS.length - 1].ao, true);
});

test('rendererQuality with a step: the passes it has, its shadow map, particles and rungs; the density from the start rung\'s budget; the paint atlas from the tier; without one exactly as before', () => {
  const s0 = RENDER_STEPS[0], set = { quality: 'high' };
  const a = rendererQuality(set, true, true, s0);
  assert.equal(a.pixelRatio, 3); assert.equal(a.pixels, RENDER_RUNGS[2].px); assert.equal(a.bloom, true); assert.equal(a.ao, true); assert.equal(a.shadowSize, 2048);
  assert.equal(a.particles, 1); assert.equal(a.step, 0); assert.deepEqual(a.rungs, [2, 5]); assert.equal(a.apple, true);
  assert.equal(a.paintAtlas, QUALITY.high.paintAtlas); assert.equal(a.msaa, QUALITY.high.msaa);
  const b = rendererQuality(set, true, true, RENDER_STEPS[1]);
  assert.equal(b.ao, false, 'step 1 builds no AO pass at all'); assert.equal(b.bloom, true); assert.deepEqual(b.rungs, [2, 4]);
  const s2 = rendererQuality({ quality: 'medium' }, true, true, RENDER_STEPS[2]);
  assert.equal(s2.ao, false); assert.equal(s2.particles, 0.7); assert.equal(s2.paintAtlas, QUALITY.medium.paintAtlas);
  assert.deepEqual(a, withProfile(rendererQuality(set, true, true), s0, set), 'one rule, both spellings');
  // a tier she picked herself (not the step's): the step is not applied (no rungs: no live ladder either)
  assert.deepEqual(rendererQuality({ quality: 'low' }, true, true, s0), rendererQuality({ quality: 'low' }, true, true));
  assert.equal(rendererQuality({ quality: 'low' }, true, true, s0).rungs, undefined);
  // never on a desktop, never without an Apple GPU
  assert.equal(rendererQuality(set, false, true, s0), QUALITY.high);
  assert.deepEqual(rendererQuality(set, true, false, s0), rendererQuality(set, true, false));
  // no step: what hd-render gave, field for field
  for (const q of ['low', 'medium', 'high', 'ultra']) for (const [t, ap] of [[true, true], [true, false], [false, false]]) {
    assert.deepEqual(rendererQuality({ quality: q }, t, ap, null), rendererQuality({ quality: q }, t, ap), `${q} ${t} ${ap}`);
    assert.equal(rendererQuality({ quality: q }, t, ap).step, undefined);
  }
});

test('the density by pixel budget (按整屏算): on her 393 × 852 @ 3 1.5× → 2.5× up the ladder, never above the screen\'s own nor under the touch floor; a big screen gets less density for the same pixels', () => {
  const her = RENDER_RUNGS.map((r) => rungDensity(r.rung, 3, 393, 852));
  [1.51, 1.73, 2.01, 2.25, 2.5, 2.5].forEach((d, i) => assert.ok(Math.abs(her[i] - d) < 0.01, `rung ${i}: ${her[i]}`));
  for (let i = 0; i < RENDER_RUNGS.length; i++) {
    for (const [w, h] of [[393, 852], [852, 393], [390, 844], [402, 874], [430, 932], [440, 956]]) {
      const d = rungDensity(i, 3, w, h);
      assert.ok(d >= TOUCH.minPixelRatio && d <= 3, `${w}x${h} rung ${i}: ${d}`);
      if (d > TOUCH.minPixelRatio + 1e-9) assert.ok(w * h * d * d <= RENDER_RUNGS[i].px * 1.0001, `${w}x${h} rung ${i}: inside its budget`);
    }
    assert.ok(rungDensity(i, 2, 390, 844) <= 2, 'a 2× screen is never drawn over its own density');
    assert.equal(rungDensity(i, 2, 1024, 1366), TOUCH.minPixelRatio, 'the 12.9" iPad: the floor on every rung');
  }
  assert.equal(rungDensity(4, 3, 393, 852) > rungDensity(4, 3, 440, 956), true, 'the Pro Max: the same pixels, less density');
  // the composer before the ladder's first move: the step's q gives the start rung's density
  for (const s of RENDER_STEPS) {
    const q = rendererQuality({ quality: s.quality }, true, true, s);
    assert.ok(Math.abs(renderDensity(q, 3, 393, 852) - rungDensity(s.rungs[0], 3, 393, 852)) < 1e-9, 'step ' + s.step);
  }
});

test('startStep: the class\'s start, the stored step for the same model, a new device starts over, a browser has none', () => {
  const top = { model: 'iPhone16,1', cls: 'top' }, base = { model: 'iPhone13,2', cls: 'base' };
  assert.equal(startStep(top, null), 0);
  assert.equal(startStep({ model: 'iPhone15,2', cls: 'high' }, null), 2);
  assert.equal(startStep(base, null), 3);
  assert.equal(startStep(top, { v: 1, model: 'iPhone16,1', step: 2 }), 2);
  assert.equal(startStep(top, { v: 1, model: 'iPhone14,5', step: 4 }), 0, 'another device: back to the class start');
  assert.equal(startStep(base, { v: 1, model: 'iPhone13,2', step: 0 }), 3, 'never better than the class start');
  assert.equal(startStep(base, { v: 1, model: 'iPhone13,2', step: 9 }), 4);
  assert.equal(startStep(top, { v: 2, model: 'iPhone16,1', step: 3 }), 0, 'an unknown record version is ignored');
  assert.equal(startStep({ model: null, cls: null }, null), null);
  assert.equal(startStep(null, null), null);
});

const clean = { secs: 180, targetMs: 16.67, avgMs: 16.7, slowFrac: 0, floorFrac: 0, ceilFrac: 1 };
const rec = (step, more) => ({ v: 1, model: 'iPhone16,1', step, good: 0, bad: 0, at: 0, ...more });

test('afterMatch: down a step when it missed at the ladder\'s floor; up after 3 clean matches held on the top rung, never past the start; at the ends it stays; short and hot matches do not count', () => {
  const slow = { ...clean, avgMs: 22, slowFrac: 0.4, floorFrac: 0.5, ceilFrac: 0 };
  let r = afterMatch(rec(1), slow, 1);
  assert.deepEqual([r.step, r.changed, r.why], [2, true, 'slow']); assert.equal(r.saved.step, 2); assert.equal(r.saved.model, 'iPhone16,1');
  // the thresholds: floorFrac ≥ 0.25 and slowFrac ≥ 0.2 together
  assert.equal(afterMatch(rec(0), { ...slow, floorFrac: 0.2 }, 0).changed, false);
  assert.equal(afterMatch(rec(0), { ...slow, slowFrac: 0.15 }, 0).changed, false);
  assert.equal(afterMatch(rec(0), { ...slow, floorFrac: 0.25, slowFrac: 0.2 }, 0).step, 1);
  // 60 is where every session starts now: being at 60 is no reason to go down (the old 'capped')
  assert.equal(afterMatch(rec(2), { ...clean, capped: true }, 0).changed, false);
  // at the last step: no further
  r = afterMatch(rec(4), slow, 0);
  assert.deepEqual([r.step, r.changed, r.why], [4, false, 'last']);
  // up: 3 clean in a row, each held on the step's top rung
  let s = rec(3);
  for (let i = 0; i < 2; i++) { r = afterMatch(s, clean, 0); assert.equal(r.changed, false); assert.equal(r.why, 'clean'); s = r.saved; }
  r = afterMatch(s, clean, 0);
  assert.deepEqual([r.step, r.changed, r.why], [2, true, 'clean']); assert.equal(r.saved.good, 0);
  // clean frames under the top rung (the ladder never got to the top): not a reason to try a richer step
  s = afterMatch(afterMatch(rec(3), clean, 0).saved, clean, 0).saved;
  r = afterMatch(s, { ...clean, ceilFrac: 0.85 }, 0);
  assert.deepEqual([r.changed, r.why, r.saved.good], [false, 'ok', 0]);
  // a merely-ok match breaks the run
  s = afterMatch(afterMatch(rec(3), clean, 0).saved, clean, 0).saved;
  s = afterMatch(s, { ...clean, slowFrac: 0.1 }, 0).saved;
  assert.equal(s.good, 0); assert.equal(afterMatch(s, clean, 0).changed, false);
  // never above the class's start
  s = rec(2, { good: 2 });
  r = afterMatch(s, clean, 2);
  assert.deepEqual([r.step, r.changed, r.why], [2, false, 'best']);
  // short (< 60 s) and hot matches: nothing moves, nothing is counted
  r = afterMatch(rec(1, { good: 2 }), { ...slow, secs: 59 }, 0);
  assert.deepEqual([r.step, r.changed, r.why, r.saved.good], [1, false, 'short', 2]);
  r = afterMatch(rec(1, { good: 2 }), { ...slow, hot: true }, 0);
  assert.deepEqual([r.step, r.changed, r.why, r.saved.good], [1, false, 'hot', 2]);
  assert.equal(afterMatch(rec(1), null, 0).why, 'short');
});

test('hotPower: thermal serious / critical or Low Power Mode', () => {
  assert.equal(hotPower({ lowPower: false, thermal: 'serious' }), true);
  assert.equal(hotPower({ lowPower: false, thermal: 'critical' }), true);
  assert.equal(hotPower({ lowPower: true, thermal: 'nominal' }), true);
  assert.equal(hotPower({ lowPower: false, thermal: 'fair' }), false);
  assert.equal(hotPower(null), false);
});

test('the readout (显示帧率 with the live ladder) and the per-device record', () => {
  const L = new LiveGov({ start: 3, ceil: 4, hz120: true });
  for (let i = 0; i < 60; i++) L.frame(1000 / 60, 4.2, 1000 / 60);
  const t = liveReadout(59.6, 1, L, 2.25, 393, 852).split('\n');
  assert.equal(t.length, 2);
  assert.equal(t[0], '60 帧 · 第 1 档 · 3/4 级 · 2.25× · 1.7 MP');
  assert.equal(t[1], '间隔 16.7 / 16.7 ms · JS 4.2 ms · 稳 60 · 起步');
  L.cap = 0; L.hot = true; L.why = 'try120';
  assert.match(liveReadout(120, 0, L, 2.5, 393, 852), /^120 帧 · 第 0 档 · 3\/4 级 · 2\.5× · 2\.1 MP\n.* · 120 · 热 · 试 120$/);
  const mem = new Map(), st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
  assert.equal(loadGov(st), null);
  assert.equal(saveGov(rec(2), st), true);
  assert.equal(GOV_KEY, 'inkwave:render:v1'); assert.ok(mem.has(GOV_KEY));
  assert.deepEqual(loadGov(st), rec(2));
  const broken = { getItem: () => { throw new Error('private'); }, setItem: () => { throw new Error('full'); } };
  assert.equal(loadGov(broken), null); assert.equal(saveGov(rec(1), broken), false);
  mem.set(GOV_KEY, '{nope'); assert.equal(loadGov(st), null);
});

test('the wiring: the step applied at launch only (each choice of hers still wins), the live ladder made from its rungs and fed every drawn frame, one record per match, the heat hold, the readout box', () => {
  const M = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
  const boot = M.slice(M.indexOf('this.touchMode = shouldUseTouch(this.settings);'), M.indexOf('this.memK = this.touchMode'));
  assert.ok(/this\.device = deviceInfo\(window\);/.test(boot));
  assert.ok(/const step = startStep\(this\.device, this\.gov\);\n\s+G\.renderProfile = step == null \? null : RENDER_STEPS\[step\];/.test(boot));
  assert.ok(/storedRaw\?\.qualityChosen !== true && this\.settings\.quality !== dq\) \{ this\.settings\.quality = dq;/.test(boot));
  assert.ok(/storedRaw\?\.shadowsChosen !== true && this\.settings\.shadows !== ds\) \{ this\.settings\.shadows = ds;/.test(boot));
  assert.ok(/dq = P \? P\.quality : 'low', ds = P \? P\.shadows : false/.test(boot), 'no device: the old phone default');
  assert.equal((M.match(/G\.renderProfile = /g) || []).length, 1, 'set once, at launch');
  assert.equal((M.match(/const cap = this\.settings\.fpsCap \|\| this\._autoCap \|\| 0;/g) || []).length, 2, '_loop and _frameTarget');
  assert.ok(/shadowSize: \(this\.R\.q \|\| q\)\.shadowSize/.test(M)); assert.ok(/new fxMod\.FX\(scene, \{ quality: this\.R\.q \|\| q \}\)/.test(M));
  assert.ok(M.indexOf('this._liveInit();') > M.indexOf('G.renderer = this.R.renderer;'), 'the ladder once the renderer exists');
  assert.match(M, /this\.live = q\.rungs && D \? new LiveGov\(\{ start: this\.R\.rung \?\? q\.rungs\[0\], ceil: q\.rungs\[1\], hz120: false \}\) : null;/);
  assert.match(M, /if \(this\.live\) \{ this\._autoCap = this\.live\.cap; this\._capWhy = null; this\.R\.setRung\(this\.live\.rung\); \}/, 'every session starts at the ladder\'s 60');
  assert.match(M, /if \(this\.R && !!this\.R\.q\.rungs !== !!this\.live\) this\._liveInit\(\);/, 'a tier of her own turns the ladder off (and back)');
  const loop = M.slice(M.indexOf('  _loop(ts) {'), M.indexOf('  _trackVsync(ts) {'));
  assert.ok(loop.indexOf('this._frame(dt);') < loop.indexOf('if (this.live) this._liveFrame(iv);'), 'fed after the frame, with its interval');
  assert.match(loop, /const iv = ts !== undefined && this\._lastTs !== undefined \? ts - this\._lastTs : 0;/);
  assert.match(M, /this\._ftMs = tD - tA;/, 'the frame\'s main-thread ms');
  const dyn = M.slice(M.indexOf('  _dynRes(dt) {'), M.indexOf('  _liveInit() {'));
  assert.ok(/this\._gs && \(this\._gs\.m !== m \|\| m\.state !== 'playing'\)\) this\._govEnd\(\);/.test(dyn));
  assert.ok(dyn.indexOf('if (L) {') < dyn.indexOf('setDynamicScale') && /this\._govWin\(m, win, avg, this\._frameTarget\(\) \/ 1000, late >= RENDER_LIVE\.down60, L\.rung <= 0, L\.rung >= L\.ceil\);\n\s+return;/.test(dyn), 'with the ladder the 4 s window only keeps the record');
  assert.ok(!/shouldCap|_capWhy = 'slow'/.test(M), 'no second governor: the old 自动 60 is the ladder now');
  assert.ok(/if \(r\.why === 'short' \|\| r\.why === 'hot'\) return;\n\s+this\.gov = r\.saved; saveGov\(r\.saved\);/.test(M));
  assert.ok(/if \(r\.changed\) this\._govDone = true;/.test(M), 'one move per launch');
  assert.ok(/NV\.on = \(e\) => \{ if \(e && e\.type === 'power'\) this\._onPower\(NV\.power\); if \(typeof prev === 'function'\) prev\(e\); \};/.test(M));
  assert.ok(/if \(this\.live\) \{ if \(this\.live\.setHot\(hotPower\(p\)\)\) this\._liveApply\(\); return; \}/.test(M), 'the heat goes to the ladder');
  assert.ok(/else if \(this\._capWhy === 'hot'\) \{ this\._autoCap = 0; this\._capWhy = null; \}/.test(M), 'without the ladder the heat hold lets go at a match start, as before');
  assert.match(M, /fps: this\.settings\.showFps && this\.fps && !this\.live \? this\.fps : undefined/, 'the HUD\'s own 「N FPS」 only without the ladder (its box shows instead)');
  const R = readFileSync(new URL('../../src/core/renderer.js', import.meta.url), 'utf8');
  assert.equal((R.match(/withProfile\(rendererQuality\(settings, this\.touch, this\.appleGPU\), this\.profile, settings\)/g) || []).length, 2, 'constructor and applySettings');
  assert.ok(/this\.profile = G\.renderProfile \|\| null;/.test(R));
  assert.ok(/has\('applegpu'\)\) \|\| !!G\.renderProfile;/.test(R), 'a step means an iPhone / iPad: never a step without the Apple profile under it');
  assert.match(R, /return this\.rung != null \? rungDensity\(this\.rung, d, w, h\) : renderDensity\(this\.q, d, w, h\);/, 'one density per rung');
  assert.match(R, /if \(this\.bloom\) this\.bloom\.enabled = !!\(this\.q\.bloom && this\.settings\.bloom && R\.bloom\);\n\s+if \(this\.gtao\) this\.gtao\.enabled = !!R\.ao;/, 'a rung turns passes on and off; her bloom setting still wins');
});

// main.js cannot be imported in Node (it boots the game): its method bodies are run here on a stand-in game
const method = (src, name) => { const a = src.indexOf(`  ${name}(`), b = src.indexOf('\n  }\n', a); const s = src.slice(a, b + 4); return s.slice(s.indexOf('{') + 1, s.lastIndexOf('}')); };
const M = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
const NAMES = ['_loop', '_liveInit', '_liveFrame', '_liveApply', '_liveNote', '_frameTarget', '_dynRes', '_govWin', '_govEnd', '_onPower', '_matchPower'];
// a stand-in phone: a 120 Hz screen her App unlocked, frames that cost `cost(t)` ms of GPU (the next vsync after it is when the
// frame lands), the real _loop pacing at the ladder's cap
function phone({ step = 1, power = { lowPower: false, thermal: 'nominal' }, showFps = false } = {}) {
  const saved = [], win = { __iwNative: { power } }, rungs = RENDER_STEPS[step].rungs;
  const body = { children: [], appendChild(e) { this.children.push(e); } };
  const env = { requestAnimationFrame: () => {}, document: { hidden: false, body, createElement: () => ({ style: {}, textContent: '', remove() { body.children.splice(body.children.indexOf(this), 1); } }) },
    window: win, innerWidth: 393, innerHeight: 852, LiveGov, liveReadout, RENDER_LIVE, afterMatch, RENDER_START, hotPower, saveGov: (r) => { saved.push(r); return true; } };
  const g = { settings: { quality: RENDER_STEPS[step].quality, fpsCap: 0, showFps }, _vs: { ms: 1000 / 120 }, device: { model: 'iPhone16,1', cls: 'top', highRefresh: true, maxFps: 120 }, gov: null, saved, win, env,
    fpsAcc: 0, fpsN: 0, frames: 0, fps: 60,
    timer: { p: undefined, d: 0, update(t) { this.d = this.p === undefined ? 0 : (t - this.p) / 1000; this.p = t; }, getDelta() { return this.d; } },
    _trackVsync() {}, _frame() { this.frames++; this._ftMs = 3; },
    R: { q: { step, rungs }, rung: rungs[0], set: [], renderer: { getPixelRatio: () => rungDensity(g.R.rung, 3, 393, 852) },
      setRung(n) { if (n === this.rung) return false; this.rung = n; this.set.push(n); return true; }, dynFloor: () => 1, dynScale: 1, bloom: { enabled: true } } };
  for (const n of NAMES) {
    const a = M.indexOf(`  ${n}(`), params = M.slice(M.indexOf('(', a) + 1, M.indexOf(') {', a)).split(',').map((p) => p.trim()).filter(Boolean);
    const f = new Function(...Object.keys(env), ...params, method(M, n));
    g[n] = (...args) => f.call(g, ...Object.values(env), ...args);
  }
  g._liveInit();
  // every move of the ladder, with the stand-in's clock (s)
  g.moves = []; const apply = g._liveApply; g._liveApply = () => { apply(); g.moves.push({ t: +((g.now || 0) / 1000).toFixed(2), why: g.live.why, rung: g.live.rung, cap: g.live.cap }); };
  // run `secs` of vsyncs; a drawn frame occupies the GPU for cost(t) ms: the vsyncs until it is done are not drawn (rAF waits)
  g.run = (secs, cost) => {
    const vs = 1000 / 120, end = (g.t || 0) + secs * 1000;
    let busy = g.busy || 0;
    for (let t = g.t || 0; t < end; t += vs) {
      if (t < busy) continue;
      g.now = t; const n0 = g.frames; g._loop(t);
      if (g.frames > n0) busy = t + Math.max(0, cost(t) - 0.5);
    }
    g.t = end; g.busy = busy;
  };
  return g;
}

test('_loop with the ladder on a 120 Hz phone: the session starts at 60 (every other vsync drawn), a GPU that cannot hold 60 drops a rung within half a second, 120 is tried only once the top rung has held — and kept when it holds', () => {
  // a heavy frame (22 ms of GPU): late at 60 from the first window
  let g = phone({ step: 1 });
  assert.deepEqual([g.live.rung, g._autoCap], [2, 60], 'step 1: rung 2 at 60');
  g.run(0.3, () => 22); assert.equal(g.R.rung, 2, 'not judged on a fraction of a window');
  g.run(0.45, () => 22); assert.equal(g.R.rung, 1, 'a rung down in ≤ 0.75 s');
  g.run(1.2, () => 22); assert.equal(g.R.rung, 0, 'and the next one ≤ 1.2 s later');
  g.run(5, () => 22); assert.equal(g.R.rung, 0, 'the floor: nothing left to give');
  assert.equal(g._autoCap, 60);
  // a light frame (5 ms): 60 clean; a rung up only after 8 s, the top rung ≥ 16 s in; 120 once the top rung has held 20 s
  g = phone({ step: 1 });
  g.run(7.5, () => 5); assert.equal(g.R.rung, 2, 'no climb before 8 s clean');
  g.run(1.2, () => 5); assert.equal(g.R.rung, 3, 'a rung after 8 s');
  g.run(8.6, () => 5); assert.equal(g.R.rung, 4, 'the top rung 8 s later');
  g.run(19, () => 5); assert.equal(g._autoCap, 60, 'not 120 yet: the top rung has held < 20 s');
  g.run(2, () => 5); assert.equal(g._autoCap, 0, '120 once the top rung held 20 s clean');
  const n0 = g.frames; g.run(1, () => 5); assert.ok(g.frames - n0 >= 118, `at 120 every vsync drawn (${g.frames - n0} in 1 s)`);
  g.run(10, () => 5); assert.equal(g._autoCap, 0, 'and kept while it holds');
  // a frame that fits 60 but not 120 (11 ms): each try fails within 0.8 s, back to 60 on the same rung; the next waits twice as long
  g = phone({ step: 1 });
  g.run(170, () => 11);
  const tries = g.moves.filter((m) => m.why === 'try120'), fails = g.moves.filter((m) => m.why === 'late120');
  assert.equal(tries.length, 3, JSON.stringify(g.moves));
  assert.ok(tries[0].t >= 36 && tries[0].t < 38, `the first try ${tries[0].t} s`);
  tries.forEach((tr, i) => { const f = fails[i]; assert.ok(f && f.t - tr.t <= 0.8 && f.rung === 4 && f.cap === 60, `try ${i} back to 60 at once, the density kept`); });
  assert.ok(tries[1].t - fails[0].t >= 40 && tries[1].t - fails[0].t < 41.5, 'a failed try: the next after 40 s');
  assert.ok(tries[2].t - fails[1].t >= 80 && tries[2].t - fails[1].t < 81.5, 'then after 80 s');
  assert.equal(g.moves.filter((m) => m.why === 'late').length, 0, 'never a rung down for the 120 tries');
  // a frame whose JS alone is 6 ms never tries 120
  g = phone({ step: 1 }); g._frame = function () { this.frames++; this._ftMs = 6; };
  g.run(80, () => 5); assert.equal(g._autoCap, 60); assert.equal(g.R.rung, 4);
});

test('the ladder with the heat, a cap of hers, a tier of her own; the readout box on every screen with 显示帧率', () => {
  // hot at the start of a match: 60 and a rung under the start at once, no climbing while hot, cool → climbing again
  let g = phone({ step: 1 });
  g.run(9, () => 5); assert.equal(g.R.rung, 3, 'cool: it climbed');
  g._onPower({ lowPower: false, thermal: 'serious' });
  assert.deepEqual([g.R.rung, g._autoCap, g.live.why], [1, 60, 'hot']);
  g.run(30, () => 5); assert.equal(g.R.rung, 1, 'not back up while hot');
  g._onPower({ lowPower: false, thermal: 'nominal' });
  g.run(7.5, () => 5); assert.equal(g.R.rung, 1, 'cool: the usual 8 s first');
  g.run(1.2, () => 5); assert.equal(g.R.rung, 2, 'then up');
  // a match starting hot (her App's last power event): the same at its first window
  g = phone({ step: 1, power: { lowPower: true, thermal: 'nominal' } }); g.match = { state: 'playing' };
  g.run(4.2, () => 5); assert.deepEqual([g.R.rung, g.live.hot], [1, true]);
  // her own cap (30): paced and judged at 30, never 120
  g = phone({ step: 1 }); g.settings.fpsCap = 30;
  g.run(60, () => 5); assert.equal(g.R.rung, 4, 'her 30 is clean at 30'); assert.equal(g._autoCap, 60, 'and never uncapped');
  // the box: only with 显示帧率 and the ladder, two lines, gone when 显示帧率 is off
  g = phone({ step: 1, showFps: true });
  g.run(1, () => 5);
  const box = g.env.document.body.children[0];
  assert.ok(box && /^\d+ 帧 · 第 1 档 · 2\/4 级 · 2\.01× · 1\.4 MP\n间隔 16\.7 \/ 16\.7 ms · JS 3\.0 ms · 稳 60 · 起步$/.test(box.textContent), box && box.textContent);
  g.settings.showFps = false; g.run(1, () => 5);
  assert.equal(g.env.document.body.children.length, 0);
  // a tier of her own (no rungs): no ladder, the old pacing (no cap of the ladder's)
  g = phone({ step: 1 }); g.R.q = { step: undefined }; g._liveInit();
  assert.equal(g.live, null); assert.equal(g._autoCap, 0);
});

test('the match record from the ladder: a match spent late on the floor moves the next launch one step down; one at the top rung, clean, counts toward a step up; a hot one does not count', () => {
  const match = (g, secs, cost) => { g.match = { state: 'playing' }; g.run(secs, cost); g.match.state = 'ended'; g.run(4.5, cost); };
  // a slow phone: the ladder on its floor within 2 s, late the whole match
  let g = phone({ step: 1 });
  match(g, 80, () => 26);
  assert.equal(g.saved.length, 1); assert.deepEqual([g.saved[0].step, g.govLast.why], [2, 'slow']);
  assert.ok(g.govLast.stats.floorFrac >= 0.9 && g.govLast.stats.slowFrac >= 0.9, JSON.stringify(g.govLast.stats));
  // a strong one: on the top rung most of the match, clean → good 1 (step 1 is under the top class's start: 'clean', not yet a move)
  g = phone({ step: 1 });
  g.run(17, () => 5); match(g, 80, () => 5);
  assert.equal(g.saved.length, 1); assert.deepEqual([g.saved[0].step, g.saved[0].good, g.govLast.why], [1, 1, 'clean']);
  assert.ok(g.govLast.stats.ceilFrac >= 0.9 && g.govLast.stats.slowFrac === 0, JSON.stringify(g.govLast.stats));
  // hot: not counted
  g = phone({ step: 1, power: { lowPower: true, thermal: 'nominal' } });
  match(g, 80, () => 26);
  assert.equal(g.saved.length, 0); assert.equal(g.govLast.why, 'hot');
});
