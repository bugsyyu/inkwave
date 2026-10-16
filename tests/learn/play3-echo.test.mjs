// 回声亭 M7 and the signs (src/learn/play/echo/, board/signs.js): unscored, as before —
//   · stepping into the booth plays the sample; stepping out (or 「说完了」) is 说完了; 「评分 · 经典页」 is the classic page
//   · nothing is written: no judge, no store — the evidence is untouched whatever she does
//   · the check-in pad: stepping on it is "this day is walked", once; the weekly / placement boards open the classic page
// 用法：node --test tests/learn/*.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWeek, daySteps } from '../../src/learn/content.js';
import { store, setBackend } from '../../src/learn/store.js';
import { LEARN } from '../../src/config.js';
const THREE = await import('three');
const { EchoBooth } = await import('../../src/learn/play/echo/booth.js');
const { Signs, signBoard } = await import('../../src/learn/play/board/signs.js');

function memory() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; }
const W1 = await loadWeek(1);
const SPEAK = daySteps(W1, 1).find((s) => s.meta.type === 'speak').items[0];
const CHECKIN = daySteps(W1, 1).find((s) => s.meta.type === 'checkin');
const D7 = daySteps(W1, 7);
const run = (o, her, s, t0 = 0, aspect = 390 / 844) => { let t = t0; for (let i = 0; i < Math.round(s * 60); i++) { t += 1 / 60; o.update(1 / 60, t, her, { aspect, speed: 0 }); } return t; };

test('the echo booth: in → the sample plays; out → 说完了; and the evidence is untouched', () => {
  setBackend(memory()); store.load();
  const before = JSON.stringify(store.evidence());
  const E = new EchoBooth({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), color: '#ff8a14' });
  const spoken = [], done = [];
  E.on.speak = (text, o) => { spoken.push(text); o?.onEnd?.(); };
  E.on.done = (d) => done.push(d.how);
  E.open({ key: 'k', item: SPEAK, at: new THREE.Vector3(0, 0, 0), yaw: 0 });
  const her = new THREE.Vector3(0, 0, -4);
  let t = run(E, her, 0.5);
  assert.equal(E.state, 'ready'); assert.deepEqual(spoken, []);
  her.set(0, 0, 0);
  t = run(E, her, LEARN.echo.sampleGap + 0.2, t);
  assert.equal(E.state, 'in');
  assert.deepEqual(spoken, [SPEAK.meta.model], 'the sample, in English');
  assert.ok(E.framing, 'the camera frames the booth');
  her.set(0, 0, -LEARN.echo.out - 0.5);
  run(E, her, 0.2, t);
  assert.deepEqual(done, ['out']);
  assert.equal(E.state, 'done');
  assert.equal(JSON.stringify(store.evidence()), before, 'unscored: nothing written');
});

test('the echo booth: 「说完了」 / 「再听」 / 「评分 · 经典页」 on the board; done once', () => {
  setBackend(memory()); store.load();
  const E = new EchoBooth({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), color: '#ff8a14' });
  const spoken = [], done = [], classic = [];
  E.on.speak = (text) => spoken.push(text); E.on.done = (d) => done.push(d.how); E.on.classic = (it) => classic.push(it.id);
  E.open({ key: 'k', item: SPEAK, at: new THREE.Vector3(5, 0, 5), yaw: 1 });
  const her = new THREE.Vector3(5, 0, 5);
  run(E, her, 1);
  const hot = E.walk.list[0].b.hot.map((h) => h.id);
  for (const id of ['replay', 'done', 'classic']) assert.ok(hot.includes(id), id);
  E.walk.activate('replay'); assert.equal(spoken.length, 2, 'the sample once more');
  E.walk.activate('classic'); assert.deepEqual(classic, [SPEAK.id]);
  E.walk.activate('done'); E.walk.activate('done');
  her.set(50, 0, 50); run(E, her, 0.3);
  assert.deepEqual(done, ['button'], 'done once');
  assert.deepEqual(store.evidence(), {});
});

test('the signs: the check-in pad walks the day once; the boards open the classic page; nothing is written', () => {
  setBackend(memory()); store.load();
  const S = new Signs({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), color: '#ff8a14' });
  const got = [];
  S.on.checkin = (s) => got.push('checkin:' + s.kind); S.on.classic = (s) => got.push('classic:' + s.kind);
  const signs = [
    { id: CHECKIN.id, kind: 'checkin', title: CHECKIN.title, text: CHECKIN.items[0].zh },
    { id: 'w1d7:b3', kind: 'weekly', title: D7.find((s) => s.meta.type === 'weekly').title },
    { id: 'w1d7:b2', kind: 'placement', title: D7.find((s) => s.meta.type === 'placement').title },
  ];
  S.prepare('signs', signs);
  S.place('signs', [{ x: -3, y: 0, z: 10, yaw: Math.PI }, { x: 0, y: 0, z: 10, yaw: Math.PI }, { x: 3, y: 0, z: 10, yaw: Math.PI }]);
  for (const sg of signs) assert.ok(signBoard(sg).buttons.some((b) => b.id === 'classic'), `${sg.kind}: a classic-page hotspot`);
  const her = new THREE.Vector3(0, 0, 0);
  run(S, her, 0.3);
  assert.deepEqual(got, []);
  her.set(S.pad.x, 0, S.pad.z);
  run(S, her, 1);
  run(S, her, 1);
  assert.deepEqual(got, ['checkin:checkin'], 'once');
  her.set(S.walk.list[1].view.x, 0, S.walk.list[1].view.z);
  run(S, her, 1);
  assert.equal(S.walk.framed, 1);
  S.walk.activate('classic');
  assert.deepEqual(got, ['checkin:checkin', 'classic:weekly']);
  assert.deepEqual(store.evidence(), {});
});

test('no judging in the booth, the boards or the signs: no engine / store import, no recordFirst', () => {
  for (const f of ['echo/booth.js', 'board/signs.js', 'board/walk.js', 'board/set.js', 'board/paint.js', 'flip/deck.js', 'flip/targets.js']) {
    const src = readFileSync(new URL(`../../src/learn/play/${f}`, import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/from '[^']*(engine|store|api)\.js'/.test(src), `${f} imports no judge / store`);
    assert.ok(!/recordFirst|\bjudge\s*\(/.test(src), `${f} never judges or records`);
  }
});
