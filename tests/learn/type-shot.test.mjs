// 字弹 M4 — one typed question as a game action (src/learn/play/type/shot.js): the pure state machine typeStep
// (idle → typing → firing → assembling → shown → resolving → done; a verdict that comes early waits for the letters),
// and TypeShot driving the rig + the ink word in Node on a fixed clock: 射 tears the sheet, the shell flies and lands
// at the target, the word forms, resolve() plays and settles; the kid's one-shots are the game's own triggers.
// 用法：node --test tests/learn/*.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEARN } from '../../src/config.js';
const THREE = await import('three');
const { typeState, typeStep, PHASES, TypeShot } = await import('../../src/learn/play/type/shot.js');
const CTX = await import('../../src/core/ctx.js');
const await_ctx = () => CTX;

const run = (s, evs) => evs.reduce((st, e) => typeStep(st, e), s);

test('state machine: the happy path, in order', () => {
  let s = typeState();
  assert.equal(s.phase, 'idle');
  s = run(s, [{ t: 'begin', mode: 'sentence' }, { t: 'key', k: 'h' }, { t: 'key', k: 'i' }, { t: 'back' }, { t: 'key', k: 'e' }]);
  assert.deepEqual([s.phase, s.mode, s.text, s.presses], ['typing', 'sentence', 'he', 4]);
  s = run(s, [{ t: 'submit' }]); assert.equal(s.phase, 'firing');
  s = run(s, [{ t: 'landed' }]); assert.equal(s.phase, 'assembling');
  s = run(s, [{ t: 'assembled' }]); assert.equal(s.phase, 'shown');
  s = run(s, [{ t: 'resolve', verdict: { ok: true } }]); assert.equal(s.phase, 'resolving');
  s = run(s, [{ t: 'resolved' }]); assert.equal(s.phase, 'done');
  assert.deepEqual(run(s, [{ t: 'clear' }]), typeState());
  for (const p of ['idle', 'typing', 'firing', 'assembling', 'shown', 'resolving', 'done']) assert.ok(PHASES.includes(p));
});

test('state machine: a verdict before the letters formed waits; out-of-phase events change nothing', () => {
  let s = run(typeState(), [{ t: 'begin' }, { t: 'key', k: 'a' }, { t: 'submit' }]);
  s = run(s, [{ t: 'resolve', verdict: { ok: false, right: 'b' } }]);
  assert.equal(s.phase, 'firing'); assert.deepEqual(s.verdict, { ok: false, right: 'b' });
  s = run(s, [{ t: 'landed' }, { t: 'assembled' }]);
  assert.equal(s.phase, 'resolving', 'the queued verdict plays as soon as the word is formed');
  // ignored
  const typing = run(typeState(), [{ t: 'begin' }]);
  assert.deepEqual(typeStep(typing, { t: 'submit' }), typing, 'nothing typed: 射 does nothing');
  assert.deepEqual(typeStep(typing, { t: 'resolve', verdict: { ok: true } }), typing, 'no verdict while typing');
  assert.deepEqual(typeStep(typing, { t: 'landed' }), typing);
  assert.deepEqual(typeStep(typing, { t: 'key', k: 'ab' }), typing, 'one character per key');
  const firing = run(typing, [{ t: 'key', k: 'x' }, { t: 'submit' }]);
  assert.deepEqual(typeStep(firing, { t: 'key', k: 'y' }), firing, 'no typing while the shell flies');
  assert.deepEqual(typeStep(typeState(), { t: 'key', k: 'y' }), typeState());
  // hint marks the item (the flow records H)
  assert.equal(run(typing, [{ t: 'hint' }]).hinted, true);
  assert.equal(run(typing, [{ t: 'hint' }, { t: 'begin' }]).hinted, false, 'a new item starts unhinted');
});

function mockActor() {
  const calls = [];
  return { character: { weaponHidden: false, trigger: (n) => calls.push(n) }, pos: new THREE.Vector3(0, 0, 0), yaw: 0, team: 0, calls };
}
const step = (o, s, dt = 1 / 60) => { for (let i = 0; i < Math.round(s / dt); i++) o.update(dt); };

test('TypeShot on a fixed clock: type → 射 → the shell lands at the target → the word forms → the verdict settles', () => {
  for (const verdict of [{ ok: true, right: 'jump' }, { ok: false, right: 'jump' }, { ok: false, pct: 67, right: 'I can jump high.' }]) {
    const shot = new TypeShot({ team: 0, color: '#ff8a14' });
    const a = mockActor();
    shot.mount(a);
    const target = new THREE.Vector3(0.4, 1.45, 6.5);
    shot.begin({ mode: verdict.pct != null ? 'sentence' : 'word', target });
    assert.equal(shot.submit(), null, 'nothing typed: 射 sends nothing');
    for (const k of 'jumq') shot.key(k);
    shot.back(); shot.key('p');
    step(shot, 0.3);
    assert.equal(shot.text, 'jump');
    assert.equal(a.calls.filter((c) => c === 'shoot').length, 6, 'the kid hits every key (incl. ⌫)');
    let landedAt = null;
    shot.rig.onLand = (p) => { landedAt = p.clone(); };
    assert.equal(shot.submit(), 'jump');
    assert.equal(shot.phase, 'firing');
    assert.ok(a.calls.includes('throw'), 'she throws the sheet into the mortar');
    assert.equal(shot.key('x'), false, 'no typing while it flies');
    // the flow judges at once: the verdict waits for the letters
    let settled = false;
    shot.resolve(verdict).then(() => { settled = true; });
    let t = 0;
    while (shot.phase === 'firing' && t < 4) { step(shot, 0.05); t += 0.05; }
    assert.ok(landedAt && landedAt.distanceTo(target) < 1e-6, 'the shell lands on the target');
    assert.ok(t > 0.6 && t < 3, `the shot takes a beat (${t.toFixed(2)} s)`);
    t = 0;
    while (shot.phase !== 'done' && t < 6) { step(shot, 0.05); t += 0.05; }
    assert.equal(shot.phase, 'done');
    const cheered = a.calls.includes('jump');
    assert.equal(cheered, !!verdict.ok, 'a hop only for a right answer (wrong: no action, LEVELS §5)');
    shot.clear(); assert.equal(shot.phase, 'idle');
    shot.begin({ mode: 'word', target }); assert.equal(shot.phase, 'typing'); assert.equal(shot.rig.text, '');
    shot.unmount();
    // the promise settles after the synchronous chain (microtask)
    void settled;
  }
});

test('TypeShot: the answer is not an input before 射 (begin ignores it, key takes a key)', () => {
  const shot = new TypeShot({ team: 1, color: '#2f5bff' });
  shot.mount(mockActor());
  shot.begin({ mode: 'word', target: new THREE.Vector3(0, 1, 5), answer: 'secret', right: 'secret' });
  assert.ok(!JSON.stringify(shot.s).includes('secret'));
  for (const k of 'sec') shot.key(k);
  assert.ok(!JSON.stringify(shot.s).includes('secret'));
  assert.equal(LEARN.type.coral.toLowerCase(), '#f08a7a');
});

test('reduced motion (LEVELS §5 REDUCED): no hop, no shake; the shot and the verdict still play through', () => {
  const ctx = await_ctx();
  const shakes = [];
  const off = ctx.on('shake', (e) => shakes.push(e));
  const shot = new TypeShot({ team: 0, color: '#ff8a14', reduced: true });
  const a = mockActor();
  shot.mount(a);
  shot.begin({ mode: 'word', target: new THREE.Vector3(0, 1.45, 6.5) });
  for (const k of 'go') shot.key(k);
  shot.submit(); shot.resolve({ ok: true, right: 'go' });
  let t = 0; while (shot.phase !== 'done' && t < 8) { step(shot, 0.05); t += 0.05; }
  off();
  assert.equal(shot.phase, 'done');
  assert.ok(!a.calls.includes('jump'), 'no hop');
  assert.equal(shakes.length, 0, 'no camera shake');
  assert.equal(shot.rig.reduced, true); assert.equal(shot.word.reduced, true);
});
