// 关卡学习 — the stub engine's contract (src/learn/engine-stub.js), run with `node --test tests/learn/*.test.mjs`.
// Workstream A's real modules must pass the same shape checks: every item of the day lands on exactly one gate, each
// gate holds one step's items, judge() ignores case / spelling variants, the store counts only the day's first answer.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { loadWeek, daySteps, prompt, judge, store, puzzleLevel } from '../../src/learn/engine-stub.js';
import { LEARN } from '../../src/config.js';

test('loadWeek / daySteps: week 1 day 1 has the five kinds of step with items', async () => {
  const w = await loadWeek(1);
  assert.equal(w.n, 1);
  const steps = daySteps(w, 1);
  assert.deepEqual(steps.map((s) => s.kind), ['lesson', 'dictation', 'choice', 'listen', 'pron']);
  for (const st of steps) for (const it of st.items) {
    assert.ok(it.id && it.en && it.zh, `item ${it.id} carries en + zh`);
    assert.equal(it.tts, it.en); assert.equal(it.audio, null); assert.deepEqual(typeof it.meta, 'object');
  }
});

test('puzzleLevel: every item exactly once, one step per gate, gate count within LEARN.puzzle.gates', () => {
  const lv = puzzleLevel(1, 1);
  assert.equal(lv.kind, 'puzzle'); assert.equal(lv.stage, 'tidewater');
  assert.ok(lv.gates.length >= 1 && lv.gates.length <= LEARN.puzzle.gates);
  const all = daySteps(1, 1).flatMap((s) => s.items.map((i) => i.id)).sort();
  const seen = lv.gates.flatMap((g) => g.items.map((i) => i.id)).sort();
  assert.deepEqual(seen, all);
  for (const g of lv.gates) { assert.ok(g.items.length > 0); assert.equal(g.pos, null); assert.ok(g.items.every((i) => i.id.startsWith(g.stepId.slice(0, 4)))); }
  // the gate's items all come from the step it names
  const byStep = Object.fromEntries(daySteps(1, 1).map((s) => [s.id, new Set(s.items.map((i) => i.id))]));
  for (const g of lv.gates) for (const it of g.items) assert.ok(byStep[g.stepId].has(it.id), `${it.id} belongs to ${g.stepId}`);
});

test('prompt: typed for dictation / listen-typed, choice for choice / pron / listen-choice; tts present where she must hear it', () => {
  const [, dict, choice, listen, pron] = daySteps(1, 1);
  const pd = prompt(dict.items[0]);
  assert.equal(pd.type, 'typed'); assert.equal(pd.tts, 'Wednesday'); assert.ok(pd.placeholder); assert.equal(pd.zh, '星期三');
  const pc = prompt(choice.items[0]);
  assert.equal(pc.type, 'choice'); assert.equal(pc.options.length, 4); assert.ok(pc.options.every((o) => o.text && o.zh)); assert.ok(pc.text.includes('星期一'));
  assert.equal(prompt(listen.items[0]).type, 'typed'); assert.equal(prompt(listen.items[1]).type, 'choice');
  const pp = prompt(pron.items[0]);
  assert.equal(pp.type, 'choice'); assert.equal(pp.tts, 'February');
});

test('judge: case and punctuation do not matter, British spelling counts, a wrong word explains in Chinese', () => {
  const [, dict, choice] = daySteps(1, 1);
  const wed = dict.items[0];
  assert.equal(judge(wed, 'wednesday').ok, true);
  assert.equal(judge(wed, '  WEDNESDAY. ').ok, true);
  const r = judge(wed, 'wensday');
  assert.equal(r.ok, false); assert.equal(r.canonical, 'Wednesday'); assert.match(r.why, /正确写法：Wednesday（星期三）/);
  assert.equal(judge({ id: 'x', en: 'colour', zh: '颜色', meta: {} }, 'color').ok, true);
  const mon = choice.items[0];
  assert.equal(judge(mon, 0).ok, true);
  const w = judge(mon, 1);
  assert.equal(w.ok, false); assert.match(w.why, /Sunday 是「星期日」；正确的是 Monday（星期一）/);
  // the alt form of a choice hands back the typed text: mapped onto the option
  assert.equal(judge(mon, 'monday').ok, true);
  assert.equal(judge(mon, 'tuesday').ok, false);
});

test('store: the day\'s first answer counts, later ones do not; due = first answered wrong today', () => {
  const s = store.load(); s.first = {}; s.ev = [];
  const at = Date.UTC(2026, 9, 15, 12);
  assert.deepEqual(store.recordFirst({ itemId: 'w1d1-dict-1', ok: false, day: 'w1d1', at }), { first: true });
  assert.deepEqual(store.recordFirst({ itemId: 'w1d1-dict-1', ok: true, day: 'w1d1', at: at + 1000 }), { first: false });
  assert.deepEqual(store.recordFirst({ itemId: 'w1d1-dict-2', ok: true, day: 'w1d1', at }), { first: true });
  assert.equal(store.evidence().length, 2);
  // a new calendar day is a new first
  assert.deepEqual(store.recordFirst({ itemId: 'w1d1-dict-1', ok: true, day: 'w1d1', at: at + 86400e3 }), { first: true });
});
