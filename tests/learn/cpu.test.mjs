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

G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2a6bff')];

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

