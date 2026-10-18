// LEARN §35 — the question objects as finely made as the game round them (src/learn/play/layout.js fitText / plateText /
// FRAME, atlas.js the sticker plates, targets.js the pearl ink and its motion):
//   · a plate's text never runs past its outline: smaller first, then wrapped, only then cut — measured with the layout's
//     estimate here (Node has no canvas), with a wider face too (Titan One / a CJK face wider than the estimate)
//   · the sticker's frame is the name tags' language at the atlas's density (outline 6–8 texels, a solid drop 3–4 px)
//   · the neutral ink is brighter (pearl), never a team colour; the motion goes through the preallocated slots and
//     instance attributes: a jelly on a wrong one, a puff on the hit, a flash, plates rising from the ball, reduced = fades
// 用法：node --test tests/learn/learn-3d.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEARN } from '../../src/config.js';
import { fitText, plateText, labelBox, textWidth, FRAME, frameX, wrapLines, enWidth, TITAN_K } from '../../src/learn/play/layout.js';
import { fitLabel, gateLabels, fitAtlas } from '../../src/learn/play/atlas.js';
import { loadWeek } from '../../src/learn/content.js';
import { prompt } from '../../src/learn/engine.js';
import { planDay } from '../../src/learn/design.js';
import { canPlayM1 } from '../../src/learn/play/m1.js';
const THREE = await import('three');
const { PlayTargets, COLORS } = await import('../../src/learn/play/targets.js');

const U = LEARN.playUi;
const LONG = ['床（复数）', '猫（复数）', '图书馆的阅览室', '星期一到星期五', '起飞；脱下（衣服）', '图书馆借书处的阅览室', '在周末去公园散步'];
const wider = (k) => (s, px) => textWidth(s, px) * k;   // a face that runs wider than the estimate

test('a plate\'s text stays inside its outline: 床（复数）, 猫（复数） and 8–10 character meanings, in the estimate and in a face 15 % wider', () => {
  for (const zh of LONG) {
    const box = labelBox({ text: 'beds', zh });
    const inner = box.w - 2 * frameX();
    assert.ok(inner <= FRAME.maxIn + 0.01, `${zh}: the plate is at most maxIn wide inside`);
    for (const m of [textWidth, wider(1.15)]) {
      const P = plateText({ text: 'beds', zh }, U.font, U.font - 2, inner, m, m);
      for (const l of P.a.lines) assert.ok(m(l, P.a.px) <= inner + 0.01, `${zh}: the line ${m(l, P.a.px)} ≤ ${inner}`);
      for (const l of P.b.lines) assert.ok(m(l, P.b.px) <= inner + 0.01, `${zh}: its Chinese "${l}" ${m(l, P.b.px).toFixed(1)} ≤ ${inner}`);
      assert.ok(P.b.lines.length >= 1 && P.b.lines.length <= 2, `${zh}: one or two lines`);
    }
  }
  // the short ones keep their size and one line, with room to spare inside the outline (the edge never touches them)
  for (const zh of ['床（复数）', '猫（复数）']) {
    const P = plateText({ text: 'beds', zh });
    assert.equal(P.b.px, U.font - 2); assert.deepEqual(P.b.lines, [zh]);
    assert.ok(labelBox({ text: 'beds', zh }).w - textWidth(zh, U.font - 2) >= 2 * (FRAME.line + FRAME.padX), 'padding inside the outline both sides');
  }
});

// (the first browser shot of the duel: "men" / "no" came out as "m…" / "n…" — the box was sized by the Rubik estimate,
// the line drawn in Titan One ~1.3 × wider; the first line is now estimated at Titan One's width)
test('no ball plate of the three weeks is cut: every word gate\'s labels fit whole at Titan One\'s width, and still pack at full scale', async () => {
  assert.ok(TITAN_K >= 1.25);
  assert.equal(enWidth('men', 17), textWidth('men', 17) * TITAN_K); assert.equal(enWidth('星期一', 17), textWidth('星期一', 17));
  for (const t of [{ text: 'men', zh: '男人' }, { text: 'no', zh: '不' }]) {
    const P = plateText(t);
    assert.deepEqual(P.a.lines, [t.text], t.text + ' whole'); assert.equal(P.a.px, U.font);
    assert.ok(labelBox(t).w - 2 * frameX() >= enWidth(t.text, U.font), 'its box takes the Titan One line');
  }
  let n = 0;
  for (const w of [1, 2, 3]) {
    const W = await loadWeek(w);
    for (const d of W.days) for (const g of planDay(W, d.n, 'puzzle').gates) {
      const labs = gateLabels(g.items, prompt, (it, p) => canPlayM1(it, p));
      for (const l of labs.filter((x) => !x.banner)) {
        const P = plateText(l);
        assert.ok(!P.a.cut && !P.b.cut, `w${w}d${d.n} ${l.text} / ${l.zh}: nothing cut`);
        n++;
      }
      if (labs.length && labs.every((l) => !l.banner)) assert.equal(fitAtlas(labs).scale, LEARN.m1.atlasScale, 'ball labels at full scale');
    }
  }
  assert.ok(n > 100, n + ' plates');
});

test('fitText: smaller first, then wrapped, only then cut with an ellipsis', () => {
  const s = '图书馆借书处的阅览室';   // 10 characters
  // a little too wide: one size smaller, one line
  const a = fitText(s, textWidth(s, 15) - 4, 15, { lines: 2 });
  assert.equal(a.lines.length, 1); assert.ok(a.px < 15 && a.px >= 12); assert.equal(a.cut, false);
  // much too wide: wrapped (at a size as large as fits), not cut
  const b = fitText(s, 90, 15, { lines: 2 });
  assert.equal(b.lines.length, 2); assert.equal(b.cut, false); assert.equal(b.lines.join(''), s);
  for (const l of b.lines) assert.ok(textWidth(l, b.px) <= 90);
  // no room for it on two lines: cut, the ellipsis inside the width
  const c = fitText(s + s + s, 60, 15, { lines: 2 });
  assert.equal(c.cut, true); assert.ok(c.lines.length <= 2); assert.ok(c.lines[c.lines.length - 1].endsWith('…'));
  for (const l of c.lines) assert.ok(textWidth(l, c.px) <= 60, l);
  // one line only: never wrapped
  const d = fitText('reconsideration', 50, 17);
  assert.equal(d.lines.length, 1); assert.ok(textWidth(d.lines[0], d.px) <= 50); assert.equal(d.cut, true);
  assert.deepEqual(fitText('', 50, 17).lines, []);
  // wrapLines with a measure of its own (the atlas passes the canvas's): a wider face breaks earlier
  assert.ok(wrapLines(s, 100, 15, wider(1.3)).length >= wrapLines(s, 100, 15).length);
});

test('the sticker frame: the name tags\' outline at the atlas\'s density, a solid drop, a tail on a ball\'s plate only; every word gate still packs at full scale', () => {
  const S = LEARN.m1.atlasScale;
  assert.ok(FRAME.line * S >= 6 && FRAME.line * S <= 8, `outline ${FRAME.line * S} texels`);
  assert.ok(FRAME.shadow >= 3 && FRAME.shadow <= 4, 'a 3–4 px drop');
  assert.ok(FRAME.tail > 0);
  // a ball's plate leaves room for the tail and the drop; a banner's box is the plank's (no tail)
  const one = labelBox({ text: 'go', zh: '' }), two = labelBox({ text: 'go', zh: '去' });
  assert.ok(two.h > one.h && one.h >= Math.round(U.font * FRAME.lh) + FRAME.tail + FRAME.shadow + 2 * FRAME.line);
  const labs = gateLabels([{ id: 'x' }], () => ({ options: [{ text: 'beds', zh: '床（复数）' }, { text: 'cats', zh: '猫（复数）' }] }), () => true);
  assert.equal(labs.length, 2); assert.ok(labs.every((l) => !l.banner && l.w === labelBox(l).w));
  // the runner's lane plates: the frame taken off the box, the text still inside (the font never under 26)
  const f = fitLabel({ text: 'the library', zh: '图书馆借书处的阅览室', tag: 'B' }, 400, 250, { big: 92, small: 26, lines: 2 });
  assert.ok(f.font >= 26 && f.la.every((l) => textWidth(l, f.font) <= 400 - 48) && f.lb.every((l) => textWidth(l, f.font2) <= 400 - 48));
});

test('the neutral ink is a bright pearl (lighter than the old grey-lilac), never a team colour; one ink and one plate program', () => {
  const lum = (h) => { const c = new THREE.Color(h); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
  assert.ok(lum(COLORS.idle) > lum('#a39db8') * 1.4, 'brighter');
  const c = new THREE.Color(COLORS.idle), hsl = {}; c.getHSL(hsl, THREE.SRGBColorSpace);
  assert.ok(hsl.s < 0.5 && hsl.l > 0.75, 'a pale, pearly lilac');
  assert.equal(COLORS.coral, '#f08a7a', 'coral as before');
  const src = readFileSync(new URL('../../src/learn/play/targets.js', import.meta.url), 'utf8');
  assert.equal((src.match(/customProgramCacheKey/g) || []).length, 2, 'two programs: the ink, the plates (replaced, none added)');
  assert.equal((src.match(/new THREE\.(Mesh|InstancedMesh)\(/g) || []).length, 2, 'meshes: inst() (balls, planks, plates) and the halo — no draw call added');
  // no allocation per frame in update / _write / _scaleOf
  for (const fn of ['update(dt)', '_write()', '_scaleOf(S)']) {
    const at = src.indexOf('  ' + fn + ' {'), end = src.indexOf('\n  }\n', at);
    assert.ok(at > 0 && end > at, fn);
    assert.ok(!/new |\[\s*\]|\{\s*\}|=>/.test(src.slice(at, end).replace(/\/\/.*$/gm, '')), `${fn}: no allocation`);
  }
});

function rig(reduced = false) {
  const T = new PlayTargets({ scene: new THREE.Scene(), reduced });
  const A = { tex: null, uv: new Map([['L|a|', [0, 0, 0.5, 0.5]], ['L|b|', [0.5, 0.5, 1, 1]]]), box: new Map([['L|a|', { w: 90, h: 63 }], ['L|b|', { w: 80, h: 45 }]]) };
  const objs = [0, 1].map((i) => ({ i, kind: 'ball', key: i ? 'L|b|' : 'L|a|', x: i * 2, y: 1, z: -5, r: 0.5, plate: { x: i * 2, y: 0.2, z: -5, w: 0.9, h: 0.6 } }));
  T.show(A, objs, { right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), back: new THREE.Vector3(0, 0, 1) });
  return T;
}
const step = (T, s, dt = 1 / 120) => { for (let i = 0; i < Math.round(s / dt); i++) T.update(dt); };
// (the columns' lengths: decompose() of a zero scale is NaN)
const read = (mesh, k) => { const e = new THREE.Matrix4(); mesh.getMatrixAt(k, e); const a = e.elements, len = (o) => Math.hypot(a[o], a[o + 1], a[o + 2]); return { p: new THREE.Vector3(a[12], a[13], a[14]), s: new THREE.Vector3(len(0), len(4), len(8)) }; };
const ballScale = (T, k) => read(T.balls, k), plateAt = (T, k) => read(T.plates, k);

test('the motion: plates come out from under the ball 50 ms apart with an overshoot; a wrong one shakes like jelly and settles; the hit puffs 1 → 0.9 → 1.12 with its rim flared, then is gone', () => {
  const T = rig();
  // the plate's box goes to the shader (its outline's band) and the tail only on a ball's plate
  assert.deepEqual([T.plates.aBox.getX(0), T.plates.aBox.getY(0), T.plates.aBox.getZ(0)], [90, 63, FRAME.tail]);
  step(T, 0.06);
  const p0 = plateAt(T, 0).p.y, p1 = plateAt(T, 1).p.y;
  assert.ok(p0 > 0.2 && p0 < 1, 'the first plate is on its way down from the ball');
  assert.ok(p1 > p0, 'the second one a step behind (the stagger)');
  let over = 0; for (let i = 0; i < 60; i++) { T.update(1 / 120); over = Math.max(over, ballScale(T, 0).s.x / 0.5); }
  assert.ok(over > 1.05 && over < 1.1, `the pop overshoots to ~1.08: ${over.toFixed(3)}`);
  step(T, 0.6);
  assert.ok(Math.abs(ballScale(T, 0).s.x - 0.5) < 1e-3 && Math.abs(plateAt(T, 0).p.y - 0.2) < 1e-3, 'at rest in place');
  // wrong: the jelly (x and y the other way round), dying out in ~0.45 s, no burst
  T.state(1, 'coral'); step(T, 0.03);
  const j = ballScale(T, 1).s;
  assert.ok(Math.abs(j.x - j.y) > 0.01, 'wider than tall (or the other way) while it shakes');
  step(T, 0.6);
  const k = ballScale(T, 1).s;
  assert.ok(Math.abs(k.x - k.y) < 1e-4 && T.balls.count === 2, 'settled, still there');
  // the right one revealed: its plate's outline flares (aState.w) and falls back
  T.state(0, 'right'); T.update(1 / 120);
  assert.ok(T.plates.aState.getW(0) > 0.9);
  step(T, 1);
  assert.ok(T.plates.aState.getW(0) === 0 && T.plates.aState.getY(0) > 0.95, 'the flash gone, her ink stays');
  // the hit: no hit shape at once; drawn 80 ms more, puffing, its rim flared; then gone
  T.burst(1);
  assert.ok(T.spheres.filter((s) => s.active).every((s) => s.target !== 1), 'nothing to hit any more');
  const seen = [];
  for (let i = 0; i < 12; i++) { T.update(1 / 120); const b = ballScale(T, 1); seen.push(b.s.x / 0.5); }
  assert.ok(Math.min(...seen.slice(0, 4)) < 0.95 && Math.max(...seen) > 1.08, `1 → 0.9 → 1.12: ${seen.map((v) => v.toFixed(2)).join(' ')}`);
  assert.ok(T.balls.aPlay.getW(1) > 0.4, 'the rim flared');
  step(T, 0.05);
  assert.ok(ballScale(T, 1).s.x < 1e-6, 'gone after 80 ms');
});

test('reduced motion: no pop, no jelly, no puff — the plates fade in where they belong', () => {
  const T = rig(true);
  T.update(1 / 120);
  assert.ok(Math.abs(plateAt(T, 0).p.y - 0.2) < 1e-6, 'the plate in its place from the start');
  assert.ok(T.plates.aState.getX(0) < 0.2, 'fading in');
  step(T, 0.4);
  assert.ok(T.plates.aState.getX(0) > 0.99);
  T.state(1, 'coral'); step(T, 0.03);
  const j = ballScale(T, 1).s; assert.ok(Math.abs(j.x - j.y) < 1e-6, 'no jelly');
  T.burst(1); T.update(1 / 120);
  assert.ok(ballScale(T, 1).s.x < 1e-6, 'the hit one goes at once');
});
