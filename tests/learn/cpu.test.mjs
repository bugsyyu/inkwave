// 每帧和「一下子」的 CPU 浪费（LEARN §52）: the rules the fixes stand on, checked on the real code with stand-ins for
// what they drive — the slow frame's sub-steps (Match.update, Actor._finishFrame, the boss, the runner's wrapper).
// 用法：node --test tests/learn/*.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
const THREE = await import('three');
const { G } = await import('../../src/core/ctx.js');
const { Match } = await import('../../src/game/match.js');
const { Actor } = await import('../../src/game/actor.js');
const { Boss } = await import('../../src/boss/boss.js');
const { BossMode } = await import('../../src/boss/bossMode.js');
const { RunnerFlow } = await import('../../src/learn/play/runner/runner.js');
const { emit } = await import('../../src/core/ctx.js');

G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2a6bff')];
G.teamHex = ['#ff8a14', '#2a6bff'];

// a 2D canvas that records what is drawn on it (Node has none): every method a no-op, counted by name
function recCanvas() {
  const calls = {};
  const ctx = new Proxy({ calls, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }) }, {
    get(o, k) { if (k in o) return o[k]; return (...a) => { calls[k] = (calls[k] || 0) + 1; void a; }; },
    set(o, k, v) { o[k] = v; return true; },
  });
  return { width: 0, height: 0, getContext: () => ctx, ctx };
}

// ---------------------------------------------------------------------------------------------- 慢帧子步
// a stand-in squidkid for Match.update: its brain, its body (update(dt, pose)), all logged in order
function standIn(log, name, x) {
  return {
    name, alive: true, remote: false, pos: new THREE.Vector3(x, 0, 0), intent: { move: new THREE.Vector3() },
    bot: { update: (dt) => log.push(['brain', name, dt]) },
    update: (dt, pose) => log.push(['body', name, dt, pose]),
  };
}
function matchWith(log, actors) {
  const m = Object.create(Match.prototype);
  Object.assign(m, { learn: { update: (dt) => log.push(['level', dt]) }, paused: false, stateT: 0, state: 'playing', solo: true, actors,
    bossMode: { update: (dt, pose) => log.push(['boss', dt, pose]) } });
  m._push = () => log.push(['push']);
  return m;
}

test('慢帧子步：the level, the clock and the brains once a frame; moving in two steps; the poses once, for the whole frame', () => {
  const log = [], dt = 1 / 30;
  const m = matchWith(log, [standIn(log, 'her', 0), standIn(log, 'bot', 9)]);
  m.update(dt, 2);
  assert.deepStrictEqual(log, [
    ['level', dt], ['brain', 'her', dt], ['brain', 'bot', dt],
    ['body', 'her', dt / 2, -1], ['body', 'bot', dt / 2, -1], ['boss', dt / 2, -1], ['push'],
    ['body', 'her', dt / 2, dt], ['body', 'bot', dt / 2, dt], ['boss', dt / 2, dt], ['push'],
  ]);
  assert.ok(Math.abs(m.stateT - dt) < 1e-12, 'the clock ran once, the whole frame');
});

test('慢帧子步：a frame under 1/45 s is one step, in the order it always ran (the audits\' frozen 1/60 never changes)', () => {
  const log = [], dt = 1 / 60;
  matchWith(log, [standIn(log, 'her', 0), standIn(log, 'bot', 9)]).update(dt);
  assert.deepStrictEqual(log, [['level', dt], ['brain', 'her', dt], ['brain', 'bot', dt], ['body', 'her', dt, dt], ['body', 'bot', dt, dt], ['boss', dt, dt], ['push']]);
  // paused: the level only (its stations wait themselves)
  const l2 = [], m2 = matchWith(l2, [standIn(l2, 'her', 0)]); m2.paused = true; m2.update(dt, 2);
  assert.deepStrictEqual(l2, [['level', dt]]);
});

test('慢帧子步：main.js hands the frame to Match.update whole (no loop of whole updates any more)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
  assert.match(src, /m\.update\(dt, dt > 1 \/ 45 \? 2 : 1\)/);
  assert.doesNotMatch(src, /for \(let i = 0; i < sub; i\+\+\) m\.update/);
});

// a real Actor on a stand-in character: what _finishFrame hands the character
class StandInKid {
  constructor() { this.root = new THREE.Object3D(); this.poses = []; this.hurts = 0; }
  setHurt() { this.hurts++; }
  update(dt) { this.poses.push(dt); }
  setVisible() {}
}
test('慢帧子步：a squidkid is moved on every step, posed once, by the frame\'s dt', () => {
  const a = new Actor({ team: 0, name: 'her', CharacterClass: StandInKid });
  a.pos.set(1, 2, 3); a.vel.set(4, 0, 0);
  a._finishFrame(1 / 60, -1);
  assert.deepStrictEqual(a.character.poses, [], 'an earlier step: no pose');
  assert.deepStrictEqual(a.character.root.position.toArray(), [1, 2, 3], '… but the body is where the step left it');
  a.pos.set(1.1, 2, 3);
  a._finishFrame(1 / 60, 1 / 30);
  assert.deepStrictEqual(a.character.poses, [1 / 30], 'the last step: one pose, for the whole frame');
  assert.deepStrictEqual(a.character.root.position.toArray(), [1.1, 2, 3]);
  a._finishFrame(1 / 60);
  assert.deepStrictEqual(a.character.poses, [1 / 30, 1 / 60], 'a plain call poses as it always did');
  a._finishFrame(0, 0);
  assert.deepStrictEqual(a.character.poses, [1 / 30, 1 / 60, 0], 'a zero-length frame still poses (as before)');
});

test('慢帧子步：the boss fights on every step; its model and the crablets\' once a frame', () => {
  const log = [];
  const b = Object.create(Boss.prototype);
  Object.assign(b, { match: { state: 'playing' }, sim: true, bt: 0, _paintBt: 0, visible: true, dead: false,
    brain: { update: (dt) => { log.push(['brain', dt]); b.bt += dt; } },
    hz: { dead: 0, paint: () => log.push(['paint']), update: (dt) => log.push(['hazards', dt]), fizzle() {} },
    _events: () => log.push(['events']), _crabVisuals: (dt) => log.push(['crabs', dt]), _pushActors: () => log.push(['push']),
    _modelUpdate: (dt) => log.push(['model', dt]), _flushRain: (dt) => log.push(['rain', dt]) });
  b.live = () => true;
  const mode = Object.create(BossMode.prototype); Object.assign(mode, { match: { follower: false, state: 'playing', setState() {} }, boss: b });
  mode.update(1 / 60, -1); mode.update(1 / 60, 1 / 30);
  assert.deepStrictEqual(log.filter((e) => e[0] === 'model' || e[0] === 'crabs'), [['crabs', 1 / 30], ['model', 1 / 30]]);
  assert.equal(log.filter((e) => e[0] === 'brain').length, 2, 'the fight: both steps');
  assert.equal(log.filter((e) => e[0] === 'push').length, 2, 'pushing squidkids off its body: both steps');
  log.length = 0; mode.update(1 / 60);
  assert.deepStrictEqual(log.filter((e) => e[0] === 'model' || e[0] === 'crabs'), [['crabs', 1 / 60], ['model', 1 / 60]], 'a plain call: as before');
});

test('慢帧子步：the runner\'s wrapper passes the step on; its camera moves once a frame', () => {
  const calls = [];
  const flow = Object.create(RunnerFlow.prototype);
  Object.assign(flow, { swimK: 1, slowT: 0, _after: (dt, pose) => calls.push(['after', dt, pose]) });
  const a = { update(dt, pose) { calls.push(['body', dt, pose]); } };
  flow._install(a);
  a.update(1 / 60, -1); a.update(1 / 60, 1 / 30); a.update(1 / 60);
  assert.deepStrictEqual(calls, [['body', 1 / 60, -1], ['after', 1 / 60, -1], ['body', 1 / 60, 1 / 30], ['after', 1 / 60, 1 / 30], ['body', 1 / 60, 1 / 60], ['after', 1 / 60, 1 / 60]]);
  // _after itself: on a super jump only the camera, and only once a frame (by the frame's dt)
  const cams = [];
  const f2 = Object.create(RunnerFlow.prototype);
  Object.assign(f2, { match: { local: { alive: true, superJumpState: { phase: 'flight' } } }, T: {}, sNow: 5, cam: { update: (dt) => cams.push(dt) } });
  f2._aspect = () => 0.46;
  f2._after(1 / 60, -1); f2._after(1 / 60, 1 / 30);
  assert.deepStrictEqual(cams, [1 / 30]);
});

// ---------------------------------------------------------------------------------------------- 小地图
const { Minimap } = await import('../../src/game/minimap.js');
// a real Minimap on a 2 × 2 m stage (4 × 4 px), its canvases recording what is drawn on them; the static layers stay
// unbuilt (the raster pass needs a real level) and the ink field has no cells — the gating is what is under test
function tinyMap() {
  const prev = globalThis.document;
  globalThis.document = { createElement: () => recCanvas() };
  let mm;
  try { mm = new Minimap({ bounds: { minX: 0, maxX: 2, minZ: 0, maxZ: 2 }, spawnPads: [] }, { version: 0, grid: new Uint8Array(4) }, 2); }
  finally { if (prev === undefined) delete globalThis.document; else globalThis.document = prev; }
  mm._built = true;   // (its idle-time build never runs)
  const N = mm.w * mm.h;
  Object.assign(mm, { pixCell: new Int32Array(N).fill(-1), pixFx: new Uint8Array(N), pixFy: new Uint8Array(N), pixSx: new Int32Array(N), pixSy: new Int32Array(N), owner: new Uint8Array(N) });
  return mm;
}
const inkDraws = (mm) => mm.ictx.calls.putImageData || 0, blits = (mm) => mm.ctx.calls.drawImage || 0;
function stage() {
  G.match = { attract: false, zones: null, actors: [] }; G.local = null;
  G.projectiles = { clouds: [], bombs: [] }; G.subs = { items: [] }; G.specials = { world: [], drawMap() {} };
}

test('小地图：off the screen nothing is drawn; the first frame back draws the whole ink at once, quietly, and composes', () => {
  stage();
  const mm = tinyMap();
  for (let f = 0; f < 3; f++) mm.update(1 / 60);
  const i0 = inkDraws(mm), b0 = blits(mm);
  assert.ok(i0 >= 1 && b0 >= 2, 'shown: its ink drawn, composed');
  emit('bomb:explode', { pos: { x: 1, z: 1 }, team: 1, radius: 2 });   // (a mark made while it is hidden ages away meanwhile)
  for (let f = 0; f < 120; f++) { mm.paint.version++; mm.idle(1 / 60); }   // two seconds hidden, the ink changing all along
  assert.equal(inkDraws(mm), i0, 'hidden: not one band of ink'); assert.equal(blits(mm), b0, 'hidden: no compose (no upload)');
  mm.update(1 / 60);
  assert.equal(inkDraws(mm), i0 + 1, 'the first frame shown: the whole ink in one go');
  assert.equal(blits(mm), b0 + 2, '… composed that same frame (base + ink, no flash layer)');
  assert.ok(mm.flashT >= 0.45, 'quietly: no flash for what changed while it was hidden');
});

test('小地图：on the screen it composes only when the picture would change — new ink, something moving', () => {
  stage();
  const mm = tinyMap();
  for (let f = 0; f < 6; f++) mm.update(1 / 60);
  const c0 = mm.composed;
  for (let f = 0; f < 90; f++) mm.update(1 / 60);
  assert.equal(mm.composed, c0, 'a still map for 1.5 s: not composed again (it was 30 times)');
  mm.paint.version++;
  for (let f = 0; f < 12; f++) mm.update(1 / 60);
  assert.ok(mm.composed >= c0 + 1 && mm.composed <= c0 + 2, `new ink (drawn in 3 bands): composed ${mm.composed - c0}× (the bands may straddle a compose)`);
  const c1 = mm.composed;
  G.projectiles.bombs.push({ pos: { x: 1, z: 1 }, team: 1, kind: 'bomb', fuse: -1, age: 0 });
  for (let f = 0; f < 60; f++) mm.update(1 / 60);
  assert.equal(mm.composed - c1, 20, 'a bomb on the map: its ~20 Hz');
  G.projectiles.bombs.length = 0;
  for (let f = 0; f < 60; f++) mm.update(1 / 60);
  assert.equal(mm.composed - c1, 20, 'gone: still again');
});

test('小地图：main.js draws it only when it is on the screen (the setting, a level\'s is-nomap, the strike map)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
  const hud = src.slice(src.indexOf('  _updateHud(dt) {'));
  assert.match(hud, /const mapOn = \(this\.settings\.minimap !== false \|\| strikeAim\) && !this\.hud\.el\?\.classList\.contains\('is-nomap'\);/);
  assert.match(hud, /if \(mapOn\) this\.minimap\.update\(dt\); else this\.minimap\.idle\(dt\);/);
  assert.match(hud, /map: mapOn \? \{ canvas: this\.minimap\.canvas/);
  assert.equal((hud.match(/this\.minimap\.update\(/g) || []).length, 1, 'no other call draws it');
});
