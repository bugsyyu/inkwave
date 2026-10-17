// 主机级的渲染 on her iPhone (the owner, 10-17: 「要高刷新率、高清晰度、原生主机级别的游戏丝滑体验和高度精细渲染」): her App names
// the device (src/core/device.js), the device class picks a render step (config.js RENDER_STEPS / RENDER_START), the real frame
// times of whole matches move it a step at a time between launches (src/core/render-gov.js), and within a match a 120 Hz screen
// that still misses past the floor density and the bloom shed is held at a steady 60 (shouldCap; main.js _dynRes). Without a
// device (a web browser, a desktop) everything renders exactly as before.
// 用法：node --test tests/learn/render-gov.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUALITY, TOUCH, RENDER_STEPS, RENDER_START, rendererQuality, withProfile, renderDensity, densityFloor } from '../../src/config.js';
import { deviceClass, deviceInfo } from '../../src/core/device.js';
import { GOV_KEY, startStep, afterMatch, shouldCap, hotPower, govReadout, loadGov, saveGov } from '../../src/core/render-gov.js';

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

test('the step table: best first, each class\'s start, step 3 = what an Apple phone got before, step 4 = the old phone default', () => {
  assert.deepEqual(RENDER_START, { top: 0, high: 2, base: 3 });
  RENDER_STEPS.forEach((p, i) => assert.equal(p.step, i));
  const [s0, s1, s2, s3, s4] = RENDER_STEPS;
  assert.deepEqual([s0.quality, s0.shadows, s0.shadowSize, s0.ao, s0.bloom, s0.pixelRatio, s0.particles], ['high', true, 2048, true, true, 2.5, 1]);
  assert.deepEqual([s1.quality, s1.shadows, s1.shadowSize, s1.ao, s1.bloom, s1.pixelRatio, s1.particles], ['high', true, 2048, false, true, 2.25, 1]);
  assert.deepEqual([s2.quality, s2.shadows, s2.ao, s2.bloom, s2.pixelRatio, s2.particles], ['medium', false, false, true, 2, 0.7]);
  assert.deepEqual([s3.quality, s3.shadows, s3.ao, s3.bloom, s3.pixelRatio, s3.particles], ['low', false, false, true, 2, 0.4]);
  assert.deepEqual([s4.quality, s4.shadows, s4.ao, s4.bloom, s4.pixelRatio], ['low', false, false, false, 1.5]);
  const hd = rendererQuality({ quality: 'low' }, true, true);
  assert.equal(s3.pixelRatio, hd.pixelRatio); assert.equal(s3.bloom, hd.bloom); assert.equal(s3.particles, hd.particles);
  assert.equal(s4.pixelRatio, TOUCH.minPixelRatio);
  assert.ok(s0.pixels > TOUCH.applePixels && s0.pixels >= 3.2e6, 'the top steps hold a bigger render target');
  for (let i = 1; i < RENDER_STEPS.length; i++) assert.ok(RENDER_STEPS[i].pixelRatio <= RENDER_STEPS[i - 1].pixelRatio, 'never sharper further down');
});

test('rendererQuality with a step: density, bloom, AO, shadow map and particles from it, the paint atlas from the tier; without one exactly as before', () => {
  const s0 = RENDER_STEPS[0], set = { quality: 'high' };
  const a = rendererQuality(set, true, true, s0);
  assert.equal(a.pixelRatio, 2.5); assert.equal(a.bloom, true); assert.equal(a.ao, true); assert.equal(a.shadowSize, 2048);
  assert.equal(a.particles, 1); assert.equal(a.pixels, s0.pixels); assert.equal(a.step, 0); assert.equal(a.apple, true);
  assert.equal(a.paintAtlas, QUALITY.high.paintAtlas); assert.equal(a.msaa, QUALITY.high.msaa);
  const s2 = rendererQuality({ quality: 'medium' }, true, true, RENDER_STEPS[2]);
  assert.equal(s2.ao, false); assert.equal(s2.particles, 0.7); assert.equal(s2.pixelRatio, 2); assert.equal(s2.paintAtlas, QUALITY.medium.paintAtlas);
  assert.deepEqual(a, withProfile(rendererQuality(set, true, true), s0, set), 'one rule, both spellings');
  // a tier she picked herself (not the step's): the step is not applied
  assert.deepEqual(rendererQuality({ quality: 'low' }, true, true, s0), rendererQuality({ quality: 'low' }, true, true));
  // never on a desktop, never without an Apple GPU
  assert.equal(rendererQuality(set, false, true, s0), QUALITY.high);
  assert.deepEqual(rendererQuality(set, true, false, s0), rendererQuality(set, true, false));
  // no step: what hd-render gave, field for field
  for (const q of ['low', 'medium', 'high', 'ultra']) for (const [t, ap] of [[true, true], [true, false], [false, false]]) {
    assert.deepEqual(rendererQuality({ quality: q }, t, ap, null), rendererQuality({ quality: q }, t, ap), `${q} ${t} ${ap}`);
    assert.equal(rendererQuality({ quality: q }, t, ap).step, undefined);
  }
});

test('the density with a step: 2.5× on a 3× iPhone in both orientations, the step\'s pixel budget on an iPad, the floor still 1.5×', () => {
  const a = rendererQuality({ quality: 'high' }, true, true, RENDER_STEPS[0]);
  for (const [w, h] of [[390, 844], [844, 390], [430, 932], [393, 852]]) assert.equal(renderDensity(a, 3, w, h), 2.5, `${w}x${h}`);
  assert.equal(renderDensity(a, 2, 390, 844), 2, 'a 2× screen is never drawn over its own density');
  const ipad = renderDensity(a, 2, 1024, 1366);
  assert.ok(ipad >= 1.5 && 1024 * 1366 * ipad * ipad <= RENDER_STEPS[0].pixels + 1, `iPad ${ipad}`);
  const f = densityFloor(a, true, 3, 390, 844);
  assert.equal(renderDensity(a, 3, 390, 844) * f, TOUCH.minPixelRatio);
  const d4 = rendererQuality({ quality: 'low' }, true, true, RENDER_STEPS[4]);
  assert.equal(renderDensity(d4, 3, 390, 844), 1.5); assert.equal(densityFloor(d4, true, 3, 390, 844), 1);
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

const clean = { secs: 180, targetMs: 8.33, avgMs: 8.1, slowFrac: 0, floorFrac: 0, shed: false, capped: false };
const rec = (step, more) => ({ v: 1, model: 'iPhone16,1', step, good: 0, bad: 0, at: 0, ...more });

test('afterMatch: down a step when it missed at the floor or had to be held at 60; up after 3 clean matches, never past the start; at the ends it stays; short and hot matches do not count', () => {
  const slow = { ...clean, avgMs: 11, slowFrac: 0.4, floorFrac: 0.5, shed: true };
  let r = afterMatch(rec(0), slow, 0);
  assert.deepEqual([r.step, r.changed, r.why], [1, true, 'slow']); assert.equal(r.saved.step, 1); assert.equal(r.saved.model, 'iPhone16,1');
  r = afterMatch(rec(2), { ...clean, capped: true }, 0);
  assert.deepEqual([r.step, r.changed, r.why], [3, true, 'capped']);
  // the thresholds: floorFrac ≥ 0.25 and slowFrac ≥ 0.2 together
  assert.equal(afterMatch(rec(0), { ...slow, floorFrac: 0.2 }, 0).changed, false);
  assert.equal(afterMatch(rec(0), { ...slow, slowFrac: 0.15 }, 0).changed, false);
  assert.equal(afterMatch(rec(0), { ...slow, floorFrac: 0.25, slowFrac: 0.2 }, 0).step, 1);
  // at the last step: no further
  r = afterMatch(rec(4), slow, 0);
  assert.deepEqual([r.step, r.changed, r.why], [4, false, 'last']);
  // up: 3 clean in a row
  let s = rec(3);
  for (let i = 0; i < 2; i++) { r = afterMatch(s, clean, 0); assert.equal(r.changed, false); assert.equal(r.why, 'clean'); s = r.saved; }
  r = afterMatch(s, clean, 0);
  assert.deepEqual([r.step, r.changed, r.why], [2, true, 'clean']); assert.equal(r.saved.good, 0);
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

test('shouldCap (自动 60): only a 120 Hz screen, only at the floor density with the bloom already shed, only after two slow windows, never over a cap already on', () => {
  const at = { s: 0.6, floor: 0.6, shed: true, slowWindows: 2, targetMs: 1000 / 120 };
  assert.equal(shouldCap(at), true);
  assert.equal(shouldCap({ ...at, slowWindows: 1 }), false);
  assert.equal(shouldCap({ ...at, s: 0.75 }), false, 'the dynamic scale still has room');
  assert.equal(shouldCap({ ...at, shed: false }), false, 'the bloom goes first');
  assert.equal(shouldCap({ ...at, targetMs: 1000 / 60 }), false, 'a 60 Hz screen');
  assert.equal(shouldCap({ ...at, targetMs: 1000 / 90 }), true, 'a 90 Hz one is still over 60');
  assert.equal(shouldCap({ ...at, cap: 60 }), false);
  assert.equal(shouldCap({ ...at, targetMs: 0 }), false);
  assert.equal(hotPower({ lowPower: false, thermal: 'serious' }), true);
  assert.equal(hotPower({ lowPower: false, thermal: 'critical' }), true);
  assert.equal(hotPower({ lowPower: true, thermal: 'nominal' }), true);
  assert.equal(hotPower({ lowPower: false, thermal: 'fair' }), false);
  assert.equal(hotPower(null), false);
});

test('the readout and the per-device record', () => {
  assert.equal(govReadout(120, 2, 0), '120 帧 · 2.0× · 第 0 档');
  assert.equal(govReadout(59.6, 2.1875, 1, true), '60 帧 · 2.19× · 第 1 档 · 稳 60');
  assert.equal(govReadout(118, 2.5, 0), '118 帧 · 2.5× · 第 0 档');
  const mem = new Map(), st = { getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => mem.set(k, String(v)) };
  assert.equal(loadGov(st), null);
  assert.equal(saveGov(rec(2), st), true);
  assert.equal(GOV_KEY, 'inkwave:render:v1'); assert.ok(mem.has(GOV_KEY));
  assert.deepEqual(loadGov(st), rec(2));
  const broken = { getItem: () => { throw new Error('private'); }, setItem: () => { throw new Error('full'); } };
  assert.equal(loadGov(broken), null); assert.equal(saveGov(rec(1), broken), false);
  mem.set(GOV_KEY, '{nope'); assert.equal(loadGov(st), null);
});

test('the wiring: the step applied at launch only (each choice of hers still wins), one record per match, 自动 60 and the heat hold in the loop, the readout', () => {
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
  const dyn = M.slice(M.indexOf('  _dynRes(dt) {'), M.indexOf('  _govWin('));
  assert.ok(/this\._gs && \(this\._gs\.m !== m \|\| m\.state !== 'playing'\)\) this\._govEnd\(\);/.test(dyn));
  assert.ok(/d\.cap = slow && atFloor && shed \? d\.cap \+ 1 : 0;/.test(dyn));
  assert.ok(/this\.R\.q\.step != null && shouldCap\(\{ s, floor, shed, slowWindows: d\.cap, targetMs: this\._vs\?\.ms \|\| 0, cap: this\.settings\.fpsCap \|\| this\._autoCap \}\)/.test(dyn));
  assert.ok(/this\._autoCap = 60; this\._capWhy = 'slow'; d\.cap = 0; d\.ups = 0;/.test(dyn), 'the dynamic scale may climb again');
  assert.ok(dyn.indexOf('this.R.shedBloom?.()') < dyn.indexOf('shouldCap('), 'the bloom is shed before any cap');
  assert.ok(dyn.indexOf('if (d.t < 4) return;') < dyn.indexOf('const floor = this.R.dynFloor()'), 'nothing new per frame: the checks run once per 4 s window');
  assert.ok(/if \(r\.why === 'short' \|\| r\.why === 'hot'\) return;\n\s+this\.gov = r\.saved; saveGov\(r\.saved\);/.test(M));
  assert.ok(/if \(r\.changed\) this\._govDone = true;/.test(M), 'one move per launch');
  assert.ok(/NV\.on = \(e\) => \{ if \(e && e\.type === 'power'\) this\._onPower\(NV\.power\); if \(typeof prev === 'function'\) prev\(e\); \};/.test(M));
  assert.ok(/else if \(this\._capWhy === 'hot'\) \{ this\._autoCap = 0; this\._capWhy = null; \}/.test(M), 'the heat hold lets go at a match start');
  assert.ok(/fpsNote: this\.settings\.showFps \? this\.fpsNote : undefined/.test(M));
  const R = readFileSync(new URL('../../src/core/renderer.js', import.meta.url), 'utf8');
  assert.equal((R.match(/withProfile\(rendererQuality\(settings, this\.touch, this\.appleGPU\), this\.profile, settings\)/g) || []).length, 2, 'constructor and applySettings');
  assert.ok(/this\.profile = G\.renderProfile \|\| null;/.test(R));
  const H = readFileSync(new URL('../../src/ui/hud.js', import.meta.url), 'utf8');
  assert.ok(/this\._updFps\(f\.fps, dt, f\.fpsNote\);/.test(H)); assert.ok(/const txt = note \|\| `\$\{Math\.round\(fps\)\} FPS`;/.test(H));
});
