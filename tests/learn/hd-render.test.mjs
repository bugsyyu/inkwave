// 高清 · 丝滑 on an iPhone (the owner, 10-17: 「画风和精致度和精细程度和原版游戏一样，丝滑 高清」): an Apple touch device draws
// the 3D at 2× instead of the touch floor's 1.5× and keeps the ink's bloom (config.js TOUCH.applePixelRatio / appleBloom),
// inside a pixel budget (an iPad never allocates 5 MP HDR buffers); when frames miss, the dynamic resolution steps it back
// to the floor and then the bloom is shed (main.js _dynRes, renderer.shedBloom). Other phones and the desktop: unchanged.
// 用法：node --test tests/learn/hd-render.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { QUALITY, TOUCH, rendererQuality, renderDensity, densityFloor } from '../../src/config.js';

const low = { quality: 'low' };

test('an Apple touch device: 2× and the bloom on the phone tier; the storage fields stay the tier\'s; other touch devices and the desktop unchanged', () => {
  const a = rendererQuality(low, true, true), t = rendererQuality(low, true, false), d = rendererQuality({ quality: 'high' }, false, true);
  assert.equal(a.pixelRatio, TOUCH.applePixelRatio); assert.equal(a.pixelRatio, 2);
  assert.equal(a.bloom, true); assert.equal(a.apple, true);
  for (const k of ['paintAtlas', 'shadowSize', 'particles', 'ao']) assert.equal(a[k], QUALITY.low[k], k);
  assert.equal(t.pixelRatio, TOUCH.minPixelRatio); assert.equal(t.bloom, false); assert.ok(!t.apple);
  assert.equal(d, QUALITY.high, 'the desktop gets the tier itself');
  // a tier already over 2× keeps its own
  assert.equal(rendererQuality({ quality: 'ultra' }, true, true).pixelRatio, 2);
});

test('the render density: 2× on iPhones, the pixel budget on a big iPad, never under the touch floor; a desktop is the tier\'s cap', () => {
  const a = rendererQuality(low, true, true), t = rendererQuality(low, true, false);
  for (const [w, h, dpr] of [[390, 844, 3], [430, 932, 3], [375, 667, 2], [844, 390, 3]]) assert.equal(renderDensity(a, dpr, w, h), 2, `${w}x${h}@${dpr}`);
  const ipad = renderDensity(a, 2, 1024, 1366);
  assert.equal(ipad, TOUCH.minPixelRatio, 'the 12.9" iPad falls back to the floor');
  assert.ok(1024 * 1366 * ipad * ipad <= TOUCH.applePixels * 1.5, 'and stays near the budget');
  const mini = renderDensity(a, 2, 744, 1133);
  assert.ok(mini >= 1.5 && mini <= 2 && 744 * 1133 * mini * mini <= TOUCH.applePixels + 1, `iPad mini ${mini}`);
  assert.equal(renderDensity(a, 1, 390, 844), 1, 'a 1× screen is never drawn over its own density');
  assert.equal(renderDensity(t, 3, 390, 844), 1.5);
  assert.equal(renderDensity(QUALITY.high, 2, 1440, 900), 1.5);
});

test('the dynamic floor: an iPhone may step 2 → 1.75 → 1.5 (two 0.125 steps) and no lower; other phones never go under their floor; the desktop as before', () => {
  const a = rendererQuality(low, true, true), t = rendererQuality(low, true, false);
  const f = densityFloor(a, true, 3, 390, 844);
  assert.equal(f, 0.75);
  let s = 1, steps = 0; while (s > f + 0.01) { s -= 0.125; steps++; }
  assert.equal(steps, 2); assert.equal(renderDensity(a, 3, 390, 844) * s, 1.5);
  assert.equal(densityFloor(t, true, 3, 390, 844), 1);
  assert.equal(densityFloor(a, true, 2, 1024, 1366), 1, 'the iPad already at the floor: no steps');
  assert.equal(densityFloor(QUALITY.high, false, 2, 1440, 900), 0.5);
  assert.equal(densityFloor(QUALITY.medium, false, 1, 1440, 900), 0.75);
});

test('the renderer and the loop use it: one density function, the bloom shed only at the floor after two slow windows, a quality change brings it back', () => {
  const R = readFileSync(new URL('../../src/core/renderer.js', import.meta.url), 'utf8');
  assert.equal((R.match(/this\._density\(\) \* /g) || []).length, 2, 'the composer and the dynamic scale');
  assert.ok(!/Math\.min\(window\.devicePixelRatio \|\| 1, (q|this\.q)\.pixelRatio\)/.test(R), 'no second copy of the density math');
  assert.ok(/rendererQuality\(settings, this\.touch, this\.appleGPU\)/.test(R));
  assert.ok(/shedBloom\(\) \{\n    if \(!this\.q\.apple/.test(R), 'only the Apple default is shed');
  assert.ok(/\{ this\.dynScale = 1; this\.bloomShed = false; \}/.test(R));
  const M = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
  assert.ok(/else if \(avg > tgt \* 1\.12\) \{ d\.fast = 0; if \(\+\+d\.slow >= 2\) \{ d\.slow = 0; this\.R\.shedBloom\?\.\(\); \} \}/.test(M));
});
