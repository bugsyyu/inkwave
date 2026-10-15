// src/learn/levels.js: the four level shapes come out of the content — one gate per step with something to ask, every
// item of the step in it, lesson steps as signs; the race puts due items first; the boss is the week in phases.
// 用法：node --test tests/learn/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWeek, daySteps } from '../../src/learn/content.js';
import { store, setBackend } from '../../src/learn/store.js';
import { puzzleLevel, raceLevel, duelLevel, bossLevel, STAGE } from '../../src/learn/levels.js';

function memory() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; }
const pad2 = (n) => (n < 10 ? '0' : '') + n;
const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };

function checkGates(L, label) {
  assert.ok(Array.isArray(L.gates) && L.gates.length > 0, label + ' gates');
  const ids = new Set();
  L.gates.forEach((g) => {
    assert.equal(typeof g.id, 'string'); assert.equal(typeof g.stepId, 'string'); assert.equal(g.pos, null);
    assert.ok(Array.isArray(g.items) && g.items.length > 0, label + ' ' + g.stepId + ' items');
    assert.ok(!ids.has(g.id)); ids.add(g.id);
    g.items.forEach((it) => { assert.ok(it.id && it.meta); });
  });
}

test('puzzleLevel(w1, 1): kind puzzle on tidewater, seven gates (the day\'s asking steps, all their items), three signs', async () => {
  setBackend(memory()); store.load();
  const w1 = await loadWeek(1);
  const L = puzzleLevel(w1, 1);
  assert.equal(L.kind, 'puzzle'); assert.equal(L.stage, 'tidewater'); assert.equal(STAGE, 'tidewater'); assert.equal(L.week, 'w1'); assert.equal(L.day, 1);
  assert.ok(L.title && L.teacher);
  checkGates(L, 'puzzle');
  assert.deepEqual(L.gates.map((g) => g.stepId + ':' + g.kind + ':' + g.items.length), ['w1d1:a1:pron:8', 'w1d1:a2:choice:25', 'w1d1:a3:choice:6', 'w1d1:b1:dictation:5', 'w1d1:b2:listen:3', 'w1d1:b3:listen:8', 'w1d1:b4:dictation:25']);
  assert.deepEqual(L.signs.map((s) => s.stepId), ['w1d1:c1', 'w1d1:c2', 'w1d1:c3']);
  assert.deepEqual([...new Set(L.gates.map((g) => g.kind))].sort(), ['choice', 'dictation', 'listen', 'pron'], 'the four asking kinds on day 1');
  const steps = daySteps(w1, 1);
  assert.equal(L.gates.reduce((a, g) => a + g.items.length, 0), steps.filter((s) => s.kind !== 'lesson').reduce((a, s) => a + s.items.length, 0), 'nothing dropped');
  // every day of every week makes a level
  for (const n of [1, 2, 3]) { const w = await loadWeek(n); for (const d of w.days) checkGates(puzzleLevel(w, d.n), w.id + 'd' + d.n); }
});

test('raceLevel: the same gates as checkpoints; after a miss today that item and its checkpoint come first', async () => {
  setBackend(memory()); store.load();
  const w1 = await loadWeek(1);
  let L = raceLevel(w1, 1);
  assert.equal(L.kind, 'race'); assert.equal(L.stage, 'tidewater'); checkGates(L, 'race');
  assert.equal(L.checkpoints, 7); assert.deepEqual(L.due, []);
  assert.equal(L.gates[0].stepId, 'w1d1:a1', 'nothing due: the day\'s order');
  const target = L.gates.find((g) => g.stepId === 'w1d1:b1').items[3];
  store.recordFirst({ itemId: target.id, ok: false, pct: 20, day: today() });
  L = raceLevel(w1, 1);
  assert.deepEqual(L.due, [target.id]);
  assert.equal(L.gates[0].stepId, 'w1d1:b1', 'the checkpoint with the due item moved first');
  assert.equal(L.gates[0].items[0].id, target.id, 'and the due item is its first question');
  assert.equal(L.gates[0].due, 1);
  assert.equal(L.gates[1].stepId, 'w1d1:a1', 'the rest keep their order');
});

test('duelLevel and bossLevel exist with the same shape; the boss is the week in phases L → R → W (S waits for speech)', async () => {
  setBackend(memory()); store.load();
  const w1 = await loadWeek(1);
  const D = duelLevel(w1, 1);
  assert.equal(D.kind, 'duel'); assert.equal(D.stage, 'tidewater'); checkGates(D, 'duel'); assert.equal(D.rules.mode, 'zones');
  const B = bossLevel(w1);
  assert.equal(B.kind, 'boss'); assert.equal(B.stage, 'tidewater'); assert.equal(B.day, null); checkGates(B, 'boss');
  assert.deepEqual(B.phases, ['L', 'R', 'W', 'S']);
  const order = B.gates.map((g) => g.phase);
  assert.deepEqual([...new Set(order)], ['L', 'R', 'W'], 'listening, reading, writing gates; no speaking gate yet');
  assert.deepEqual(order, order.slice().sort((a, b) => B.phases.indexOf(a) - B.phases.indexOf(b)), 'phases in order');
  assert.ok(B.gates.some((g) => g.phase === 'W' && g.items[0].meta.input === 'write'), 'the write steps are the W phase');
  assert.ok(B.gates.filter((g) => g.phase === 'L').every((g) => ['listening', 'pron'].includes(g.items[0] && g.items[0].meta.step ? daySteps(w1, g.day).find((s) => s.id === g.stepId).meta.k : '')));
  const days = new Set(B.gates.map((g) => g.day));
  assert.equal(days.size, 7, 'every day of the week is in the exam');
});
