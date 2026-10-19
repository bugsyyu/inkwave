// 主菜单一出来就卡住（LEARN §40）: without KHR_parallel_shader_compile (WebKit on her iPhone, SwiftShader) a shader program is
// really built the first time it is used — that used to be the title's and the main menu's first frames (38 s of SwiftShader
// before the main menu's first frame). Now the loading screen builds and uses once everything the title, the main menu and
// the online alley draw (src/core/shader-warm.js; main.js _warmBoot; showcase.js warm / preloadLobby), a program at a time,
// beating her App's boot watchdog between slices; a level's are built behind the black before its fade-in (_warmStage).
// 用法：node --test tests/learn/menu-hitch.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// (after the hook: three resolves to vendor/three)
const THREE = await import('three');
const { warmList, warmScene, usePrograms, freshPrograms } = await import('../../src/core/shader-warm.js');

const MAIN = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
const SHOW = readFileSync(new URL('../../src/game/showcase.js', import.meta.url), 'utf8');
const MENUS = readFileSync(new URL('../../src/ui/menus.js', import.meta.url), 'utf8');
const INDEX = readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
const body = (src, head) => { const i = src.indexOf(head); assert.ok(i >= 0, head); const j = src.indexOf('\n  }\n', i); return src.slice(i, j); };

// a stand-in renderer: compile() makes one program per new material (keyed by material + the target it was compiled for, as
// three keys a program by its target); using a program costs `useMs` of a made-up clock
function fakeRenderer({ useMs = 10 } = {}) {
  const clock = { t: 0 };
  const R = {
    clock, target: null, compiled: [], uses: 0,
    info: { programs: [] }, made: new Map(),
    getRenderTarget: () => R.target,
    setRenderTarget: (t) => { R.target = t; },
    compile(obj, cam, scene) {
      R.compiled.push({ obj, cam, scene, target: R.target });
      obj.traverse((o) => {
        const ms = !o.material ? [] : Array.isArray(o.material) ? o.material : [o.material];
        for (const m of ms) {
          const key = m.uuid + '|' + (R.target ? 'rt' : 'canvas');
          if (R.made.has(key)) continue;
          const p = { key, used: 0, getUniforms() { if (!this.used) { clock.t += useMs; R.uses++; } this.used++; return {}; } };
          R.made.set(key, p); R.info.programs.push(p);
        }
      });
      clock.t += 1;
    },
  };
  return R;
}
const scene = (n, shared = 0) => {
  const s = new THREE.Scene(), g = new THREE.BoxGeometry();
  const mats = Array.from({ length: n }, (_, i) => new THREE.MeshStandardMaterial({ name: 'm' + i }));
  for (const m of mats) s.add(new THREE.Mesh(g, m));
  for (let i = 0; i < shared; i++) s.add(new THREE.Mesh(g, mats[i % n]));   // (more meshes on the same materials)
  const grp = new THREE.Group(); grp.add(new THREE.Mesh(g, [mats[0], new THREE.MeshBasicMaterial({ name: 'arr' })])); s.add(grp);
  s.add(new THREE.DirectionalLight());
  return s;
};

test('warmList: one object per material (an array material counts each of its own), lights and groups left out', () => {
  const s = scene(5, 12);
  const L = warmList(s);
  assert.equal(L.length, 6, '5 materials + the mesh that brings the array\'s new one');
  const seen = new Set();
  for (const o of L) for (const m of [].concat(o.material)) seen.add(m.name);
  assert.deepEqual([...seen].sort(), ['arr', 'm0', 'm1', 'm2', 'm3', 'm4']);
  assert.ok(L.every((o) => o.isMesh));
});

test('warmScene: every program compiled for the given target, each used exactly once, the target put back', async () => {
  const R = fakeRenderer(), s = scene(8, 20), cam = new THREE.PerspectiveCamera();
  const rt = { isWebGLRenderTarget: true }, before = { before: true };
  R.target = before;
  const out = await warmScene(R, s, cam, { target: rt, now: () => R.clock.t });
  assert.equal(R.target, before, 'the renderer\'s own target is back');
  assert.ok(R.compiled.length === 9 && R.compiled.every((c) => c.target === rt && c.scene === s && c.cam === cam), 'compiled against the target it draws into, with the scene\'s lights');
  assert.equal(R.info.programs.length, 9);
  assert.ok(R.info.programs.every((p) => p.used === 1), 'each new program used once');
  assert.equal(out.objects, 9);
  assert.equal(freshPrograms(R).length, 0);
  // the canvas is another target: its own programs (the showcase's composite onto the screen)
  await warmScene(R, s, cam, { target: null, now: () => R.clock.t });
  assert.equal(R.info.programs.filter((p) => p.key.endsWith('canvas')).length, 9);
  // a compile that throws still puts the target back
  const bad = { ...R, compile() { throw new Error('lost'); } };
  bad.target = before;
  await assert.rejects(warmScene(bad, s, cam, { target: rt }));
  assert.equal(bad.target, before);
});

test('warmScene / usePrograms: a beat and a pause between slices — a long compile is a moving boot, never one silent block', async () => {
  const R = fakeRenderer({ useMs: 10 }), s = scene(40), cam = new THREE.PerspectiveCamera();
  const beats = [], pauses = [];
  await warmScene(R, s, cam, { target: {}, slice: 24, now: () => R.clock.t, beat: () => beats.push(R.clock.t), pause: async () => { pauses.push(R.clock.t); } });
  assert.equal(R.uses, 41);
  assert.ok(pauses.length >= 12, `paused ${pauses.length} times`);
  assert.ok(beats.length >= pauses.length, 'every pause has its beat');
  let last = 0;
  for (const b of [...beats, R.clock.t]) { assert.ok(b - last <= 24 + 10 + 1, `a gap of ${b - last} ms without a beat`); last = b; }
  // programs an earlier compile left unused (a kid's warmAll) are used first, a slice at a time too
  const extra = Array.from({ length: 6 }, (_, i) => ({ used: 0, getUniforms() { if (!this.used) R.clock.t += 10; this.used++; } }));
  R.info.programs.push(...extra);
  const b0 = beats.length;
  assert.equal(await usePrograms(R, { slice: 24, now: () => R.clock.t, beat: () => beats.push(R.clock.t) }), 6);
  assert.ok(extra.every((p) => p.used === 1) && beats.length - b0 >= 2);
  assert.equal(await usePrograms(R, {}), 0, 'nothing used twice');
});

test('boot: the warm-up runs behind the loading bar, before the title — stage, every attract kid, the showcase, the alley, the main menu\'s portrait', () => {
  const boot = body(MAIN, '  async boot() {');
  const iWarm = boot.indexOf('await this._warmBoot('), i93 = boot.indexOf("await progress(0.93"), iTitle = boot.indexOf("this.menus?.show(params.has('skipTitle') ? 'main' : 'title')");
  assert.ok(iWarm > 0 && iWarm < i93 && i93 < iTitle, 'warm-up → 0.93 → the title');
  assert.ok(boot.indexOf("await progress(0.85") < iWarm);
  assert.match(boot, /if \(!params\.has\('lazycompile'\)\) await this\._warmBoot\(!params\.has\('autostart'\) && !params\.has\('learn'\)\);/);
  assert.doesNotMatch(boot, /compileAsync\(scene, camera\)/, 'no whole-scene compile for the canvas (the stage draws into the composer\'s target)');
  // the idle-time alley preload (whose compile landed on the main menu) only with ?lazycompile
  assert.match(boot, /if \(params\.has\('lazycompile'\) && !params\.has\('autostart'\)\) setTimeout\(\(\) => \{ if \(G\.mode === 'menu'\) this\.showcase\.preloadLobby\?\.\(\); \}, 2500\);/);
  assert.match(boot, /this\._frame\(1 \/ 60\); window\.__gfBeat\?\.\(\); await nextFrame\(\);/, 'a beat after each warm frame');
  const W = body(MAIN, '  async _warmBoot(lobby) {');
  const order = ['warmScene(G.renderer, G.scene, G.camera', 'a.character.warmAll()', 'usePrograms(G.renderer, o)', 'await this.showcase.warm(o)', 'if (lobby) await this.showcase.preloadLobby(o)', "_portraitInto?.(document.createElement('span'), { kind: 'head', size: MAIN_PORTRAIT })"];
  let at = -1;
  for (const k of order) { const i = W.indexOf(k); assert.ok(i > at, k); at = i; }
  assert.match(W, /const target = this\.R\.composer\?\.readBuffer \|\| warmTarget\(\);[^]*warmScene\(G\.renderer, G\.scene, G\.camera, \{ \.\.\.o, target \}\)/, 'the stage compiled for the composer\'s HDR target');
  assert.match(W, /const beat = \(\) => \{ window\.__gfBeat\?\.\(\); this\.menus\?\.setLoading\(/, 'every slice beats her App\'s watchdog and moves the bar');
  assert.match(W, /const o = \{ beat, pause: nextFrame \};/);
  assert.match(W, /this\.match\?\.actors/);
  // the portrait warmed is the one the main menu asks for (its cache key: kind + size + her look)
  const size = +/const MAIN_PORTRAIT = (\d+);/.exec(MAIN)[1];
  assert.match(MENUS, new RegExp(`this\\._portraitInto\\(avatar, \\{ kind: 'head', size: ${size} \\}\\)`), 'main.js MAIN_PORTRAIT = the main menu\'s head portrait');
});

test('the watchdog it beats: index.html goes back to the lesson page only after 60 s without a beat, and stops once booted', () => {
  assert.match(INDEX, /window\.__gfBeat = \(\) => \{ beat = Date\.now\(\); \};/);
  assert.match(INDEX, /if \(booted\(\)\) \{ clearInterval\(dog\); return; \} if \(Date\.now\(\) - beat > 60000\)/);
  assert.match(MAIN, /const progress = async \(p, label\) => \{[^\n]*window\.__gfBeat\?\.\(\);/);
});

test('showcase: the studio, the portrait resolve and the composite warmed for what each draws into; the alley too, and awaitable', () => {
  const W = body(SHOW, '  _warmup(o = {}) {');
  assert.match(W, /warmScene\(r, this\.scene, this\.camera, \{ \.\.\.w, target: warmTarget\(\) \}\)/, 'the studio → its HDR target');
  assert.match(W, /warmScene\(r, this\._presScene, this\.compCam, \{ \.\.\.w, target: this\._prt8 \}\)/, 'the portrait resolve → its 8-bit target');
  assert.match(W, /warmScene\(r, this\.compScene, this\.compCam, \{ \.\.\.w, target: null \}\)/, 'the composite → the canvas');
  assert.doesNotMatch(W, /compileAsync/);
  assert.match(SHOW, /  warm\(o = \{\}\) \{ return this\._warmup\(o\); \}/);
  assert.match(SHOW, /if \(!this\._warmState && G\.env\) this\._warmup\(\);/, 'still warms itself at the first update when nobody asked (?lazycompile)');
  assert.match(SHOW, /preloadLobby\(o\) \{ if \(!this\.lob\) this\._lobEnsure\(o\)\.preload = true; return this\.lob\.loading; \}/);
  const L = body(SHOW, '  _lobLoad(L, o = {}) {');
  assert.match(L, /L\.loading = import\('\.\/lobbySet\.js'\)/);
  assert.match(L, /await warmScene\(this\.r, L\.scene, L\.cam, \{ target: warmTarget\(\), beat: o\.beat, pause: o\.pause \|\| nextTick \}\)/);
  assert.ok(L.indexOf('warmScene(') < L.indexOf('L.ready = true'), 'ready only once its programs are built');
  assert.doesNotMatch(L, /compileAsync/);
  // the portraits still wait for the warm-up (they draw with its programs)
  assert.match(SHOW, /if \(this\._warmState !== 'done' \|\| \(this\._pflight \|\| 0\) >= 2\) return;/);
});

test('a level: its programs built and used behind the black, then one real frame, before the fade-in; the loop holds meanwhile', () => {
  const S = body(MAIN, '  async startMatch(o = {}) {');
  const iWarm = S.indexOf('await this._warmStage();'), iFade = S.lastIndexOf('this._fade(0, 500);'), iStart = S.indexOf('m.start();');
  assert.ok(iStart > 0 && iStart < iWarm && iWarm < iFade, 'm.start() → _warmStage → fade-in');
  assert.ok(S.indexOf('await this._fade(1, 350);') < iWarm, 'behind the black');
  const W = body(MAIN, '  async _warmStage() {');
  assert.match(W, /this\._warming = true;/);
  assert.match(W, /finally \{ this\._warming = false; \}/);
  assert.match(W, /warmScene\(G\.renderer, G\.scene, G\.camera, \{ target: this\.R\.composer\?\.readBuffer \|\| warmTarget\(\), pause: nextFrame \}\)/);
  assert.ok(W.indexOf('warmScene(') < W.indexOf('this._frame(1 / 60);'));
  const loop = body(MAIN, '  _loop(ts) {');
  assert.match(loop, /if \(this\._warming\) return;/);
  assert.ok(loop.indexOf('if (this._warming) return;') < loop.indexOf('this._frame(dt);'));
});
