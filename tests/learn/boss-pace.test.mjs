// 关卡学习 Boss 战 — the questions' cadence (LEARN §54, wf-logic; src/learn/forms/boss.js update / _bossMove): the next
// question's time runs whatever the boss is doing (a move included), the question itself comes between its moves, and from
// the moment it is due the brain is held so no further move slips in first; a touch screen held upright never waits for her
// to 「走近」 (no stick is shown there) — the options come at once, and a wrong answer's words ask nothing she cannot do; on a
// landscape phone / a desktop the boss still waits up to LEARN.arena.bossWait s for her, holding its moves meanwhile.
// 用法：node --test tests/learn/boss-pace.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));   // `three` → vendor/ (boss.js imports it)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEARN } from '../../src/config.js';
import { noStick } from '../../src/learn/play/landscape.js';

const { BossFlow } = await import('../../src/learn/forms/boss.js');
const A = LEARN.arena, B = LEARN.boss, DT = 1 / 60;

// a boss fight in its R phase with one question queued: the boss on stage between moves, she alive, the brain's cool-down
// where a move's end leaves it (bossBrain _runMove: 1.05–1.85 s × pace); far: she is outside LEARN.arena.bossNear;
// walk: she has a stick (a landscape phone, a desktop) — the form's _canWalk
function fight({ far = true, walk = true, askT = 0.5 } = {}) {
  const item = { id: 'r1', en: 'x', zh: 'x', meta: {}, _tries: 0, _form: null };
  const g = { id: 'phase:R', phase: 'R', zh: '阅读', items: [item], queue: [item], hp: [1, 0.66], moves: ['slam'], locks: 0 };
  const b = { visible: true, dead: false, move: null, anim: 0, invuln: false, phase: 1, brain: { cool: 1.2, plan: null, force: null }, hpFrac: () => 1, maxHp: 1000 };
  const F = Object.create(BossFlow.prototype);
  Object.assign(F, {
    t: 0, A, B, boss: b, match: { paused: false, state: 'playing', local: { alive: true, intent: {} }, boss: b }, gates: [g], pi: 0,
    asking: null, cards: false, askT, phaseLeft: 600, clock: 0, finishT: -1, phase: 'fight', relearn: [], relearnAsked: false,
    _echoClearT: -1, _nearWait: 0, _nearSaid: false, _clockTxt: '', _pendingMove: false, rnd: () => 0, said: [], asked: [], events: [],
    arena: { update() {}, stationUp: false, kind: null, m1: { bossNear: () => !far } },
    ui: { aside() {}, say(t) { F.said.push(t); } },
    _propKey() {}, _card() {}, _phaseDone() {}, _emit(n, p) { F.events.push([n, p]); }, _canWalk: () => walk,
    _ask(gg) { F.asked.push(+F.t.toFixed(3)); F.asking = { gate: gg, item: gg.queue.shift() }; },
  });
  return F;
}
const run = (F, s) => { for (let k = 0; k < Math.round(s / DT); k++) BossFlow.prototype.update.call(F, DT); };
const near = (F) => F.asked.length === 1 && F.asked[0] >= 0.5 && F.asked[0] < 0.56;

test('a phone held upright, far from the boss, between its moves: the options come the moment the question is due — no 「走近」, no wait, the brain held', () => {
  const F = fight({ far: true, walk: false });
  run(F, 0.5 + 2 * DT);
  assert.ok(near(F), 'asked once, at 0.5 s: ' + JSON.stringify(F.asked));
  assert.ok(!F.said.some((s) => /走近/.test(s)), 'nothing asked of her: ' + JSON.stringify(F.said));
  assert.ok(F.boss.brain.cool >= A.bossHold && F.boss.brain.plan === null, 'the brain held for the question');
  // near it: the same on any screen
  const N = fight({ far: false, walk: true });
  run(N, 0.5 + 2 * DT);
  assert.ok(near(N) && !N.said.length, 'near: asked at once, nothing said');
});

test('a landscape phone / a desktop, far: the boss waits up to bossWait s for her to walk closer, says so once, holds its moves meanwhile; she comes → the question; she does not → the options come anyway', () => {
  const F = fight({ far: true, walk: true });
  run(F, 0.5 + 4 * DT);
  assert.deepEqual(F.asked, [], 'waiting for her');
  assert.deepEqual(F.said, ['走近 Boss——答案挂在它的弱点上'], 'said once');
  // (held: the brain's cool-down never runs out while she walks — it would start a move at cool ≤ 0)
  F.boss.brain.cool = 0; run(F, DT);
  assert.ok(F.boss.brain.cool >= A.bossHold, 'the brain held during the wait: ' + F.boss.brain.cool);
  run(F, 2);
  assert.deepEqual(F.asked, [], 'still waiting at 2.5 s (bossWait ' + A.bossWait + ')');
  F.arena.m1.bossNear = () => true; run(F, DT);
  assert.equal(F.asked.length, 1, 'she came within bossNear: the question'); assert.equal(F.said[F.said.length - 1], '', 'the note cleared');
  assert.equal(F._nearWait, 0);
  // she never comes: the options come towards it after bossWait s (real seconds now, not idle ones)
  const W = fight({ far: true, walk: true });
  run(W, 0.5 + A.bossWait - 2 * DT);
  assert.deepEqual(W.asked, [], 'not yet');
  run(W, 6 * DT);
  assert.equal(W.asked.length, 1, 'after bossWait s: asked anyway'); assert.ok(W.asked[0] >= 0.5 + A.bossWait - 0.1 && W.asked[0] <= 0.5 + A.bossWait + 0.1, String(W.asked[0]));
});

test('the question falls due during a move: its time ran on, it comes the frame the move ends (before: its time ran only while the boss idled); from then the brain is held — no second move', () => {
  const F = fight({ far: true, walk: false, askT: 0.5 });
  F.boss.move = { id: 'slam', t0: 0 };
  run(F, 3);
  assert.deepEqual(F.asked, [], 'never mid-move');
  assert.ok(F.askT < 0, 'but its time ran on: ' + F.askT.toFixed(2));
  // the move ends (bossBrain _runMove: move = null, cool = 1.05–1.85 s × pace) → the learn layer's next frame asks
  F.boss.move = null; F.boss.brain.cool = 1.2;
  run(F, DT);
  assert.equal(F.asked.length, 1, 'the frame the move is over (before the fix 0.5 s of idle were still to run)');
  assert.ok(F.boss.brain.cool >= A.bossHold);
  // due, idle, but she is far and can walk: the hold keeps the next move off every frame of the wait, however low its cool-down
  const H = fight({ far: true, walk: true, askT: 0 });
  for (let k = 0; k < 60; k++) { H.boss.brain.cool = -0.1; run(H, DT); assert.ok(H.boss.brain.cool >= A.bossHold, 'held at frame ' + k); }
  assert.deepEqual(H.asked, []);
  // a roar (anim 2, invuln) and the intro (anim 1, not yet on stage): its time waits, the question waits
  const R = fight({ far: false, askT: 0.2 });
  R.boss.anim = 2; R.boss.invuln = true; run(R, 2);
  assert.deepEqual(R.asked, []); assert.equal(R.askT, 0.2, 'its time waits through the roar');
  R.boss.anim = 0; R.boss.invuln = false; run(R, 0.2 + 2 * DT);
  assert.equal(R.asked.length, 1);
  const I = fight({ far: false, askT: 0.2 });
  I.boss.visible = false; run(I, 2);
  assert.deepEqual(I.asked, []); assert.equal(I.askT, 0.2);
});

test('not while she is splatted (the camera is not hers): its time waits too', () => {
  const F = fight({ far: false, askT: 0.5 });
  F.match.local.alive = false; run(F, 2);
  assert.deepEqual(F.asked, []); assert.equal(F.askT, 0.5);
  const back = F.t;
  F.match.local.alive = true; run(F, 0.5 + 2 * DT);
  assert.ok(F.asked.length === 1 && F.asked[0] - back >= 0.5 && F.asked[0] - back < 0.56, 'asked 0.5 s after she is back: ' + JSON.stringify(F.asked));
});

test('a wrong answer: the boss\'s move is her dodge — the next question is due LEARN.boss.dodge s on (not dodge + 2 s of idle); the words fit what she can do', () => {
  const F = fight({ walk: true });
  BossFlow.prototype._bossMove.call(F, F.gates[0]);
  assert.equal(F.askT, B.dodge); assert.equal(F.boss.brain.force, 'slam'); assert.equal(F.boss.brain.cool, 0);
  assert.equal(F.said[F.said.length - 1], '答错了 — 躲一下！'); assert.deepEqual(F.events.pop(), ['learn:bossMove', { move: 'slam' }]);
  const U = fight({ walk: false });
  BossFlow.prototype._bossMove.call(U, U.gates[0]);
  assert.equal(U.said[U.said.length - 1], '答错了 — Boss 要出招了', 'upright: she has no stick to dodge with');
  // the predicate: a touch screen held upright (G.input.touch.active, innerHeight > innerWidth); never in Node, never on a desktop
  assert.equal(noStick(), false);
  const src = readFileSync(new URL('../../src/learn/forms/boss.js', import.meta.url), 'utf8');
  assert.match(src, /_canWalk\(\) \{ return !noStick\(\); \}/);
  assert.match(readFileSync(new URL('../../src/learn/play/landscape.js', import.meta.url), 'utf8'), /return innerHeight > innerWidth && !!\(G\.input && G\.input\.touch && G\.input\.touch\.active\);/);
  // the right answer's gap is unchanged: askGap after the verdict (_after without a move)
  const G2 = fight(); G2.hud = null;
  BossFlow.prototype._after.call(G2, G2.gates[0], false);
  assert.equal(G2.askT, B.askGap);
});
