// 手机上很卡（LEARN §50，业主 10-21：「还有个问题，很卡，手机上真的很卡，你需要深入做体系化优化」）: what the frame no longer
// pays for, each change proved to draw the same image — the ink atlas dried only while some ink is still wet.
// 用法：node --test tests/learn/perf.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
// a class method's body (two-space indented, closed by "\n  }\n"), to run on a stand-in
const method = (s, name) => { const a = s.indexOf(`\n  ${name}(`) + 1, b = s.indexOf('\n  }\n', a); const m = s.slice(a, b + 4); return m.slice(m.indexOf('{') + 1, m.lastIndexOf('}')); };

test('the ink atlas dries only while ink is wet: the same wetness texel for texel, frame for frame, and no pass (nor mip rebuild) once all is dry', () => {
  const P = src('src/world/paint.js');
  const flush = new Function('dt', method(P, 'flush')), draw = new Function(method(P, '_drawQuads'));
  // a stand-in atlas: N texels of wetness (0..255); a draw applies the dry quad first (renderOrder -1), then the splats (G = 1)
  const mk = () => {
    const at = () => ({ clearUpdateRanges() {}, addUpdateRange() {}, needsUpdate: false, itemSize: 1 });
    const T = {
      clock: 0, frame: 0, growing: [], _floods: [], quads: 0, _dryAcc: 0, _dryLeft: 0, wet: new Float64Array(8), hits: [], draws: 0,
      _dryU: { uDry: { value: 0 } }, dryMesh: { visible: false }, mesh: { visible: false }, texture: {}, rt: {}, scene: {}, cam: {},
      geo: { attributes: { aPos: at(), aLocal: at(), aSplat: at(), aStretch: at(), aGrow: at() }, setDrawRange() {} },
      _emitGrowth() {}, _floodSettle() {}, _floodStep() {},
    };
    T.renderer = { autoClear: true, getRenderTarget: () => null, setRenderTarget() {}, render: () => {
      T.draws++;
      if (T.dryMesh.visible) for (let i = 0; i < T.wet.length; i++) T.wet[i] = Math.max(0, T.wet[i] - Math.round(T._dryU.uDry.value * 255));
      for (const i of T.hits) T.wet[i] = 255;
      T.hits.length = 0;
    } };
    T.flush = (dt) => flush.call(T, dt); T._drawQuads = () => draw.call(T);
    T.splat = (i) => { T.hits.push(i); T.quads++; };
    return T;
  };
  // the rule before LEARN §50: a dry step every ≥ 2/40 s whether or not anything was wet
  const old = { acc: 0, wet: new Float64Array(8), draws: 0 };
  const oldFlush = (dt, hits) => {
    old.acc += dt; const n = Math.floor(old.acc * 40); let k = 0;
    if (n >= 2) { k = Math.min(n, 12); old.acc -= k / 40; }
    if (!k && !hits.length) return;
    old.draws++;
    for (let i = 0; i < old.wet.length; i++) old.wet[i] = Math.max(0, old.wet[i] - k);
    for (const i of hits) old.wet[i] = 255;
  };
  const T = mk();
  // 60 s at 120 Hz with a hitch: ink lands at 0.5 s and 3 s (two texels), a 0.4 s frame at 5 s, nothing after
  let t = 0, after = 0;
  for (let f = 0; t < 60; f++) {
    const dt = f === 600 ? 0.4 : 1 / 120; t += dt;
    const hits = f === 60 ? [1] : f === 360 ? [2, 3] : [];
    for (const i of hits) T.splat(i);
    oldFlush(dt, hits); T.flush(dt);
    assert.deepEqual([...T.wet], [...old.wet], `frame ${f}: the same wetness`);
    if (t > 3 + 6.6) after += T.draws;
  }
  assert.ok(T.wet.every((v) => v === 0), 'all dry at the end');
  assert.ok(T.draws < old.draws / 5, `atlas draws ${T.draws} (before ${old.draws}: a dry pass every 50 ms forever)`);
  // once dry (255 steps after the last ink: ≈ 6.4 s), no draw at all — the old rule kept drawing (and rebuilding the mips)
  const T2 = mk(); T2.splat(0);
  for (let i = 0; i < 120 * 7; i++) T2.flush(1 / 120);
  const d0 = T2.draws;
  for (let i = 0; i < 120 * 10; i++) T2.flush(1 / 120);
  assert.equal(T2.draws, d0, 'nothing drawn into the atlas while nothing is wet');
  assert.equal(T2._dryLeft <= 0, true);
  // floods land wet too, and clearing leaves nothing to dry
  assert.match(P, /if \(!drew\) \{[^\n]*\n\s+else this\._dryLeft = 255;/, 'a flood that drew ink restarts the drying');
  assert.match(method(P, 'clear'), /this\._dryLeft = 0;/);
});
