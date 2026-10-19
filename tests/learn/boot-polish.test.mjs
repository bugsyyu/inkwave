// 加载条压回来（LEARN §42）: after §40 the loading screen built every program, but a few still came in one burst or one silent
// stretch — a material on a mesh and on an InstancedMesh (two programs, one key), the shadow pass's depth programs (picked
// per object inside three's shadow map), the showcase kid's programs disposed and built again by the main menu's portrait,
// the ink atlas's own scene (the title's one program), the texture library's layers in one long task with a readback, and
// GPU bakes (PMREM) waited for inside the next program's first use. Here: shader-warm's variantKey / warmDraw / settle, the
// texture library's pause / sync, and the boot / showcase / lobby wiring.
// 用法：node --test tests/learn/boot-polish.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const THREE = await import('three');
const { warmList, variantKey, warmDraw, settle, freshPrograms } = await import('../../src/core/shader-warm.js');

const src = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const MAIN = src('src/main.js'), SHOW = src('src/game/showcase.js'), TEX = src('src/world/texlib.js'), LOB = src('src/game/lobbySet.js'), PROBE = src('tools/learn/hitch-probe.mjs');
const body = (s, head) => { const i = s.indexOf(head); assert.ok(i >= 0, head); const j = s.indexOf('\n  }\n', i); return s.slice(i, j); };

test('variantKey / warmList: one material on a mesh, an InstancedMesh (with and without colours) and a SkinnedMesh is four objects to warm', () => {
  const s = new THREE.Scene(), g = new THREE.BoxGeometry(), m = new THREE.MeshStandardMaterial();
  const plain = new THREE.Mesh(g, m), again = new THREE.Mesh(g, m);
  const inst = new THREE.InstancedMesh(g, m, 4), instC = new THREE.InstancedMesh(g, m, 4);
  instC.setColorAt(0, new THREE.Color(1, 0, 0));
  const sg = g.clone(); sg.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(new Uint16Array(sg.attributes.position.count * 4), 4));
  sg.setAttribute('skinWeight', new THREE.Float32BufferAttribute(new Float32Array(sg.attributes.position.count * 4), 4));
  const skin = new THREE.SkinnedMesh(sg, m);
  const vc = g.clone(); vc.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(vc.attributes.position.count * 3), 3));
  const coloured = new THREE.Mesh(vc, m);
  s.add(plain, again, inst, instC, skin, coloured);
  assert.notEqual(variantKey(plain), variantKey(inst));
  assert.notEqual(variantKey(inst), variantKey(instC));
  assert.equal(variantKey(plain), variantKey(again));
  assert.deepEqual(warmList(s), [plain, inst, instC, skin, coloured], 'each material × variant once (the second plain mesh adds nothing)');
});

// a stand-in renderer whose render() makes a program per drawn object's material × variant (+ a depth one per variant, as a
// shadow pass would) and records what was visible
function drawRenderer() {
  const R = { target: null, info: { programs: [] }, made: new Set(), draws: [], clock: { t: 0 },
    getRenderTarget: () => R.target, setRenderTarget: (t) => { R.target = t; },
    render(scene, cam) {
      const vis = [];
      scene.traverseVisible((o) => { if (o.isMesh) vis.push(o); });
      R.draws.push({ vis, target: R.target, culled: vis.map((o) => o.frustumCulled) });
      for (const o of vis) for (const k of [o.material.uuid + variantKey(o), 'depth' + variantKey(o)]) {
        if (R.made.has(k)) continue;
        R.made.add(k); R.info.programs.push({ k }); R.clock.t += 10;
      }
    } };
  return R;
}

test('warmDraw: a real draw an object at a time, the others hidden and culling off for it; everything put back; a beat and a pause between slices', async () => {
  const s = new THREE.Scene(), g = new THREE.BoxGeometry();
  const mats = Array.from({ length: 6 }, () => new THREE.MeshStandardMaterial());
  const objs = mats.map((m) => new THREE.Mesh(g, m));
  objs.push(new THREE.InstancedMesh(g, mats[0], 2));
  const hidden = new THREE.Mesh(g, new THREE.MeshStandardMaterial()); hidden.visible = false;   // (a tier not shown now)
  s.add(...objs, hidden, new THREE.Mesh(g, mats[1]));
  const R = drawRenderer(), rt = { rt: 1 }, before = { before: 1 };
  R.target = before;
  const beats = [], pauses = [];
  const out = await warmDraw(R, s, new THREE.PerspectiveCamera(), { target: rt, slice: 15, now: () => R.clock.t, beat: () => beats.push(R.clock.t),
    pause: async () => { pauses.push(s.children.filter((o) => o.visible).length); } });
  assert.equal(R.draws.length, 8, 'one draw per material × variant (the hidden tier too)');
  assert.ok(R.draws.every((d) => d.vis.length === 1 && d.target === rt && d.culled[0] === false), 'one object a draw, into the target, culling off');
  assert.equal(out.programs, 10, '8 materials × variants + a depth program per variant');
  assert.ok(pauses.length >= 4 && pauses.every((n) => n === 8), 'shown again while paused');
  assert.ok(beats.length >= pauses.length);
  assert.equal(R.target, before, 'the renderer\'s target is back');
  assert.deepEqual(s.children.map((o) => o.visible), [true, true, true, true, true, true, true, false, true], 'visibility as before');
  assert.ok(objs.every((o) => o.frustumCulled === true));
  assert.equal(freshPrograms(R).length, 0, 'drawn = used');
  // a draw that throws still puts everything back
  const bad = { ...R, render() { throw new Error('lost'); } };
  await assert.rejects(warmDraw(bad, s, new THREE.PerspectiveCamera(), { target: rt }));
  assert.deepEqual(s.children.map((o) => o.visible), [true, true, true, true, true, true, true, false, true]);
});

test('settle: a real wait for the GPU (a one-pixel read of the canvas, not finish()), then the beat, then the pause', async () => {
  const log = [], R = { target: 'rt', getRenderTarget: () => R.target, setRenderTarget: (t) => { log.push('target ' + t); R.target = t; },
    getContext: () => ({ RGBA: 1, UNSIGNED_BYTE: 2, readPixels: (x, y, w, h) => log.push(`read ${w}x${h} into ${R.target}`), finish: () => log.push('finish') }) };
  await settle(R, { beat: () => log.push('beat'), pause: async () => log.push('pause') });
  assert.deepEqual(log, ['target null', 'read 1x1 into null', 'target rt', 'beat', 'pause']);
  await settle({ getContext: () => null });   // (no context: nothing to wait for)
});

test('settle with a beat on WebGL2: a fence polled without blocking, a beat each poll until the GPU is done; capped; no read', async () => {
  const log = [];
  let polls = 0;
  const gl = { SYNC_GPU_COMMANDS_COMPLETE: 1, SYNC_STATUS: 2, SIGNALED: 3, fenceSync: () => { log.push('fence'); return { s: 1 }; }, flush: () => log.push('flush'),
    getSyncParameter: () => (++polls >= 4 ? 3 : 0), deleteSync: () => log.push('delete'), readPixels: () => log.push('read'), isContextLost: () => false };
  const R = { getContext: () => gl, getRenderTarget: () => null, setRenderTarget() {} };
  let beats = 0;
  await settle(R, { beat: () => beats++, poll: 1 });
  assert.deepEqual(log, ['fence', 'flush', 'delete'], 'no blocking read');
  assert.equal(polls, 4);
  assert.equal(beats, 4, 'a beat per unsignalled poll, and one when done');
  // a GPU that never signals: on after `cap`
  const never = { ...gl, getSyncParameter: () => 0 };
  const t0 = Date.now();
  await settle({ getContext: () => never }, { beat: () => {}, poll: 5, cap: 40 });
  assert.ok(Date.now() - t0 < 1000);
});

test('texture library: a pause between layers once a slice is spent (state put back around it), the closing readback only with sync', () => {
  const F = TEX.slice(TEX.indexOf('export async function createTextureLibrary('), TEX.indexOf('\n}\n', TEX.indexOf('export async function createTextureLibrary(')));
  assert.match(F, /\{ size = 512, pause = null, slice = 24, sync = true \} = \{\}/);
  assert.match(F, /if \(pause && i && performance\.now\(\) - tSlice > slice\) \{\s*renderer\.setRenderTarget\(prevRT\); renderer\.autoClear = prevAutoClear; renderer\.xr\.enabled = prevXR;\s*await pause\(\);\s*renderer\.autoClear = false; renderer\.xr\.enabled = false;/);
  assert.match(F, /if \(sync\) renderer\.readRenderTargetPixels\(out, 0, 0, 1, 1/);
  // (what each layer is drawn with is set inside the loop, after the pause: a paused layer draws exactly as before)
  const loop = F.slice(F.indexOf('for (let i = 0; i < L; i++) {'));
  assert.ok(loop.indexOf('await pause()') < loop.indexOf('uniforms.uMat.value = i') && loop.indexOf('uniforms.uMat.value = i') < loop.indexOf('renderer.setRenderTarget(out, i);'));
  const boot = body(MAIN, '  async boot() {');
  assert.match(boot, /createTextureLibrary\(G\.renderer, \{ size: [^}]*pause: async \(\) => \{ window\.__gfBeat\?\.\(\); await nextFrame\(\); \}, sync: false \}\)/);
});

test('boot: the GPU caught up before the environment and before the warm frames; the stage drawn for real and the ink atlas warmed; a level\'s atlas too', () => {
  const boot = body(MAIN, '  async boot() {');
  const iTex = boot.indexOf('createTextureLibrary('), iSettle = boot.indexOf('await settle(G.renderer, { beat: () => window.__gfBeat?.() });'), iEnv = boot.indexOf('new envMod.Environment(');
  assert.ok(iTex < iSettle && iSettle < boot.indexOf("await progress(0.4") && iSettle < iEnv, 'texture library → settle → the 0.4 beat → the environment');
  const i93 = boot.indexOf('await progress(0.93'), iS2 = boot.indexOf('await settle(G.renderer, { beat: () => window.__gfBeat?.(), pause: nextFrame });'), iFrames = boot.indexOf('for (let i = 0; i < 3; i++) { this._frame(1 / 60);');
  assert.ok(i93 < iS2 && iS2 < iFrames);
  const W = body(MAIN, '  async _warmBoot(lobby) {');
  const order = ['await settle(G.renderer, o);', 'await warmScene(G.renderer, G.scene, G.camera, { ...o, target });', 'await warmDraw(G.renderer, G.scene, G.camera, o);', 'await this._warmPaint(o);', 'a.character.warmAll()', 'await this.showcase.warm(o)'];
  let at = -1;
  for (const k of order) { const i = W.indexOf(k); assert.ok(i > at, k); at = i; }
  assert.match(MAIN, /_warmPaint\(o\) \{\s*const P = G\.paint;\s*return P && P\.scene && P\.rt \? warmScene\(G\.renderer, P\.scene, P\.cam, \{ \.\.\.o, target: P\.rt \}\) : null;/, 'the atlas scene for the atlas it draws into');
  const S = body(MAIN, '  async _warmStage() {');
  assert.ok(S.indexOf('await this._warmPaint({ pause: nextFrame });') > S.indexOf('warmScene(') && S.indexOf('await this._warmPaint(') < S.indexOf('this._frame(1 / 60);'), 'a level\'s atlas before its one real frame');
  assert.match(W, /parts\[k\] = Math\.round/, 'the probe gets each part\'s ms (the alley\'s among them)');
});

test('showcase: the warm kid kept (not disposed) until the first portrait is drawn; the alley\'s bakes waited for with a beat each', () => {
  const W = body(SHOW, '  _warmup(o = {}) {');
  assert.match(W, /if \(this\._warmChar\) \{ this\.scene\.remove\(this\._warmChar\.root\); this\._warmKeep = this\._warmChar; this\._warmChar = null; \}/);
  assert.doesNotMatch(W, /_warmChar\.dispose/);
  const P = body(SHOW, '  _portraitStep() {');
  assert.ok(P.indexOf('this._renderPortrait(job.req)') < P.indexOf('if (this._warmKeep) { this._warmKeep.dispose?.(); this._warmKeep = null; }'), 'disposed right after the first portrait drew with its programs');
  const L = SHOW.slice(SHOW.indexOf('  _lobLoad(L, o = {}) {'), SHOW.indexOf('  _lobEnv(L) {'));
  const order = ['await set.ready;', 'if (o.beat) await settle(this.r', 'this._lobColors();', 'await warmScene(this.r, L.scene, L.cam'];
  let at = -1;
  for (const k of order) { const i = L.indexOf(k); assert.ok(i > at, k); at = i; }
  const s2 = L.lastIndexOf('if (o.beat) await settle(this.r, { beat: o.beat');
  assert.ok(s2 > L.indexOf('this._lobColors();') && s2 < L.indexOf('await warmScene(this.r, L.scene, L.cam'), 'the colour bake waited for too, before the alley compiles');
});

test('lobby set: a re-bake in the colours of the bake in hand is skipped (the constructor asked for a second identical PMREM)', () => {
  const m = /\n  _rebakeEnv\(\) \{[^]*?\n  \}\n/.exec(LOB);
  assert.ok(m);
  const rebake = new Function('V', 'THREE', 'return ({' + m[0] + '})._rebakeEnv;')((x, y, z) => new THREE.Vector3(x, y, z), THREE);
  let bakes = 0;
  const me = { U: { uTeamA: { value: new THREE.Color(0xff8a14) }, uTeamB: { value: new THREE.Color(0x2f5bff) } }, _envA: { material: { color: new THREE.Color() } }, _envB: { material: { color: new THREE.Color() } },
    _envMats: [{}], _pmrem: { fromScene: () => ({ texture: { n: ++bakes }, dispose() {} }) } };
  const t1 = rebake.call(me);
  assert.equal(bakes, 1);
  assert.equal(rebake.call(me), t1, 'same colours: the same map, no bake');
  assert.equal(bakes, 1);
  me.U.uTeamA.value.set(0x10d2e6);
  const t2 = rebake.call(me);
  assert.equal(bakes, 2, 'new colours: baked');
  assert.notEqual(t2, t1);
  assert.equal(me._envMats[0].envMap, t2);
});

test('probe: the watchdog\'s beats recorded and the longest stretch without one reported; the texture library hashed after the run', () => {
  assert.match(PROBE, /Object\.defineProperty\(window, '__gfBeat'/);
  assert.match(PROBE, /longest stretch with no __gfBeat/);
  assert.match(PROBE, /framebufferTextureLayer\(gl\.FRAMEBUFFER, gl\.COLOR_ATTACHMENT0, wt, lv, layer\)/);
  assert.match(MAIN, /window\.__progKeys\.push\(\[Math\.round\(performance\.now\(\)\), a\[0\]\?\.name \|\| '', a\[0\]\?\.cacheKey \|\| ''\]\)/);
});

test('lobby set: built in the colours it will be shown in (one environment bake at boot, not one in the defaults first)', () => {
  assert.match(LOB, /constructor\(renderer, \{ quality = 'high', texlib = null, colors = null \} = \{\}\) \{[^]*?this\.U = makeUniforms\(\);\s*\/\/[^\n]*\n[^\n]*\n\s*if \(colors\) \{ if \(colors\[0\]\) this\.U\.uTeamA\.value\.set\(colors\[0\]\); if \(colors\[1\]\) this\.U\.uTeamB\.value\.set\(colors\[1\]\); \}/);
  const ctor = LOB.slice(LOB.indexOf('  constructor(renderer, {'), LOB.indexOf('this.ready = Promise.all('));
  assert.ok(ctor.indexOf('if (colors)') < ctor.indexOf('this.environment = this._bakeEnv();'), 'the colours are in before the first bake');
  assert.match(SHOW, /new mod\.LobbySet\(this\.r, \{ quality: q, texlib: G\.game\?\.texlib \|\| null, colors: \[this\._lobRowColor\(0\), this\._lobRowColor\(1\)\] \}\)/, 'the same colours _lobColors sends next (so its setTeamColors is a no-op)');
});
