// 复习关 (docs/LEARN.md §36; src/learn/review.js, forms/index.js buildLearn kind 'review'): the week's due items —
// store.due, the memory model's order, most forgotten first — as one 墨浪跑酷: the items picked are the due ones in that
// order, at most 24, under 8 minutes, 3–4 gates of ≤ 8, each item in its own step's mechanic (the same legality check as
// the day plans: tests/learn/design.test.mjs 题即玩法), the runner's queue asks every one, on the review day's stage; one
// passage a level; nothing due → buildLearn throws 「现在没有要复习的」 and main.js toasts it; answers are evidence as
// everywhere (当天首答). Evidence here is made up (a memory backend), never hers.
// 用法：node --test tests/learn/*.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));   // `three` → vendor/ (no npm install here)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWeek, daySteps } from '../../src/learn/content.js';
import { store, setBackend } from '../../src/learn/store.js';
import { dayPlanFor, mechanicOf, playOf, PLAY } from '../../src/learn/design.js';
import { reviewPlan, REVIEW } from '../../src/learn/review.js';
import * as API from '../../src/learn/api.js';
const { buildLearn, LEARN_KINDS, NOTHING_DUE } = await import('../../src/learn/forms/index.js');   // (three.js under it: after the hook)
const { RunnerFlow } = await import('../../src/learn/play/runner/runner.js');
const { entriesOf } = await import('../../src/learn/play/runner/rows.js');
const { gateSpecs } = await import('../../src/learn/play/wire/boards.js');
const { judgeRecord } = await import('../../src/learn/play/judge.js');
const { prompt } = await import('../../src/learn/engine.js');
const { rightAnswerOf } = await import('../../src/learn/forms/common.js');

function memory() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; }
const pad2 = (n) => (n < 10 ? '0' : '') + n;
const ago = (n) => { const d = new Date(); d.setDate(d.getDate() - n); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
const stepOf = (w, id) => daySteps(w, Number(id.split(':')[0].split('d')[1])).find((s) => s.id === id);
const flat = (P) => P.gates.flatMap((g) => g.items.map((it) => it.id));
// the day plans' legality check (design.test.mjs 题即玩法): a PLAY mechanic, never a card, answered the way the input is
const ANSWER = { choice: ['index'], type: ['text'], write: ['text'] };
function legal(P, form = 'race') {
  for (const g of P.gates) g.items.forEach((it, i) => {
    const mech = g.design.mechanics[i], id = playOf(it, form, mech);
    assert.ok(id && PLAY[id] && id !== 'card', `${it.id}: ${id}`);
    assert.ok((ANSWER[it.meta.input] || []).includes(PLAY[id].answer), `${it.id} ${it.meta.input} → ${id} answers ${PLAY[id].answer}`);
    assert.equal(mech, mechanicOf(stepOf(P.weekRef || W1, g.design.steps[i])), `${it.id}: its own step's mechanic`);
  });
}
let W1 = null;

test('reviewPlan: the due items in the memory model\'s order (most forgotten first), ≤ 24, 3–4 gates of ≤ 8, each in its own mechanic, the review day\'s stage', async () => {
  W1 = await loadWeek(1);
  setBackend(memory()); store.load();
  assert.equal(reviewPlan(W1, []), null, 'nothing due: no level');
  assert.equal(reviewPlan(W1, ['w:not-a-word', 'q:w9d1:a1:x']), null, 'nothing of this week: no level');
  // made-up history: words of days 1–4 missed today (due at once), a few answered right days ago (forgotten more or less)
  const words = [1, 2, 3, 4].flatMap((d) => daySteps(W1, d).find((s) => s.meta.type === 'words').items.slice(0, 8));
  words.forEach((it, i) => store.recordFirst({ itemId: it.id, ok: i % 4 !== 0, day: ago(i % 4 === 0 ? 0 : 1 + (i % 9)) }));
  const due = store.due(W1);
  assert.ok(due.length > REVIEW.max, 'more due than one review asks: ' + due.length);
  assert.equal(store.dueCount(W1), due.length, 'dueCount = due().length');
  const P = reviewPlan(W1, due);
  assert.deepEqual(flat(P), due.slice(0, REVIEW.max), 'the first 24 due, in order');
  assert.equal(P.kind, 'race'); assert.equal(P.form, 'race'); assert.equal(P.route, 'loop'); assert.equal(P.review, true);
  assert.ok(P.gates.length >= 3 && P.gates.length <= 4, 'gates ' + P.gates.length);
  P.gates.forEach((g) => { assert.ok(g.items.length >= 1 && g.items.length <= REVIEW.perGate, g.id + ' ' + g.items.length); assert.equal(g.design.mechanics.length, g.items.length); assert.equal(g.design.review, true); });
  assert.equal(new Set(P.gates.map((g) => g.id)).size, P.gates.length);
  assert.deepEqual(P.signs, [], 'no signs to stop at');
  const R = dayPlanFor(W1, 7);
  assert.equal(P.stage, R.stage); assert.equal(P.time, R.time); assert.equal(P.day, 7);
  assert.equal(P.reviewOf.n, 24); assert.equal(P.reviewOf.left, due.length - 24);
  assert.ok(P.minutes >= 1 && P.minutes <= REVIEW.minutes, 'minutes ' + P.minutes);
  legal(P);
  // a short list: every one of them, in order, in ≤ 3 gates
  const few = due.slice(0, 7), Q = reviewPlan(W1, few);
  assert.deepEqual(flat(Q), few); assert.equal(Q.gates.length, 3); assert.deepEqual(Q.gates.map((g) => g.items.length), [3, 2, 2]);
  assert.deepEqual(reviewPlan(W1, due.slice(0, 2)).gates.map((g) => g.items.length), [1, 1]);
  assert.equal(reviewPlan(W1, due.slice(0, 19)).gates.length, 4, 'above 18: four gates');
});

test('reviewPlan: every kind of item plays as its step does (words, sounds, pairs, grammar, dictation, cards, write); the runner\'s queue asks each once; the pace keeps it under 8 minutes', async () => {
  W1 = W1 || await loadWeek(1);
  setBackend(memory()); store.load();
  // two items of every asking step of days 1–2 (the reading passage aside), missed today
  const ids = [];
  for (const d of [1, 2]) for (const s of daySteps(W1, d)) {
    if (s.meta.type === 'reading') continue;
    s.items.filter((it) => it.meta.scored).slice(0, 2).forEach((it) => { if (!ids.includes(it.id)) { store.recordFirst({ itemId: it.id, ok: false, day: ago(0) }); ids.push(it.id); } });
  }
  const due = store.due(W1), P = reviewPlan(W1, due);
  const kinds = new Set(P.gates.flatMap((g) => g.items.map((it) => it.meta.input + '/' + it.meta.kind)));
  for (const k of ['choice/sym', 'choice/word', 'choice/quiz', 'choice/pair', 'type/dict', 'write/write']) assert.ok(kinds.has(k), 'has ' + k + ' — ' + [...kinds]);
  legal(P);
  // the order is the memory model's: the picked ones are due's in order (a long one that does not fit is skipped)
  const picked = flat(P); let j = 0;
  for (const id of picked) { while (j < due.length && due[j] !== id) j++; assert.ok(j < due.length, id + ' in due order'); }
  // the time budget: the pace model's seconds ≤ 8 minutes
  const sec = (it) => { const m = it.meta; return m.input === 'choice' ? (m.kind === 'sym' || m.kind === 'pair' ? REVIEW.pace.beat : REVIEW.pace.lane) : m.input === 'write' ? REVIEW.pace.write : m.kind === 'dict' ? REVIEW.pace.dict : REVIEW.pace.word; };
  assert.ok(P.gates.flatMap((g) => g.items).reduce((a, it) => a + sec(it), 0) <= REVIEW.minutes * 60);
  // the runner's queue (rows.js entriesOf, as RunnerFlow builds it): every item asked exactly once — a row or a glide
  const E = entriesOf(P.gates, P.signs), asked = E.flatMap((e) => (e.kind === 'glide' ? e.items.map((it) => it.id) : e.item ? [e.item.id] : []));
  assert.deepEqual(asked.slice().sort(), picked.slice().sort());
  assert.ok(E.some((e) => e.kind === 'glide') && E.some((e) => e.kind === 'beat') && E.some((e) => e.kind === 'lane'));
  // no teaching boards in front of a review checkpoint (nothing to wait for): no gate here has a board mechanic
  assert.ok(P.gates.every((g) => g.design.mechanic === null));
  // a review of only long items stops at the budget
  const dict = [1, 2, 3, 4, 5, 6].flatMap((d) => daySteps(W1, d).filter((s) => s.meta.type === 'dictation').flatMap((s) => s.items)).map((it) => it.id);
  const D = reviewPlan(W1, dict);
  assert.ok(D.reviewOf.n < dict.length && D.reviewOf.n * REVIEW.pace.dict <= REVIEW.minutes * 60, 'dictation: ' + D.reviewOf.n + ' of ' + dict.length);
});

test('reviewPlan: one passage a level — its questions together at the head of their gate, its passage the board before the start; another passage\'s stay due', async () => {
  W1 = W1 || await loadWeek(1);
  const r1 = daySteps(W1, 1).find((s) => s.meta.type === 'reading'), r2 = daySteps(W1, 2).find((s) => s.meta.type === 'reading');
  const w = daySteps(W1, 3).find((s) => s.meta.type === 'words').items.map((it) => it.id);
  const ids = [w[0], w[1], w[2], w[3], r1.items[0].id, r2.items[0].id, w[4], r1.items[1].id, r1.items[2].id, w[5]];
  const P = Object.assign(reviewPlan(W1, ids), { weekRef: W1, day: 3 });
  const got = flat(P);
  assert.ok(!got.includes(r2.items[0].id), 'the second passage waits'); assert.equal(P.reviewOf.left, 1); assert.equal(P.reviewOf.passage, r1.id);
  const g = P.gates.find((x) => x.items.some((it) => it.id === r1.items[0].id));
  assert.deepEqual(g.items.slice(0, 3).map((it) => it.id), r1.items.map((it) => it.id), 'the passage\'s questions lead their gate');
  assert.equal(g.design.mechanic, 'reading-room');
  P.gates.filter((x) => x !== g).forEach((x) => assert.ok(!x.items.some((it) => it.meta.kind === 'read')));
  const specs = gateSpecs(g, P);
  assert.equal(specs.length, 1); assert.equal(specs[0].kind, 'passage', 'the runner\'s 起跑前读一读 shows the passage');
  // (the first question is a copy that carries the step's whole passage: the same question, the same options, the same id)
  const a = prompt(g.items[0]), b = prompt(r1.items[0]);
  assert.equal(g.items[0].id, r1.items[0].id); assert.equal(a.q, b.q); assert.deepEqual((a.options || []).map((o) => o.text), (b.options || []).map((o) => o.text));
  assert.ok(!r1.items[0].meta.passage.en, 'the content itself is untouched');
  P.gates.forEach((x) => assert.ok(x.items.length <= REVIEW.perGate));
  legal(P);
});

test('buildLearn({ kind: \'review\' }): the level\'s items are the due ones, a race on the runner; nothing due → 「现在没有要复习的」 (main.js toasts it); answers record as everywhere', async () => {
  assert.ok(LEARN_KINDS.includes('review'), 'the menu\'s 「复习 K 个」 shows only when the kind exists');
  assert.equal(typeof API.reviewPlan, 'function'); assert.equal(API.REVIEW, REVIEW);
  setBackend(memory()); store.load();
  await assert.rejects(buildLearn({ week: 1, day: 3, kind: 'review' }), (e) => e.message === '现在没有要复习的' && e.zh === NOTHING_DUE && e.code === 'nothing-due');
  const w1 = await loadWeek(1);
  const words = daySteps(w1, 2).find((s) => s.meta.type === 'words').items.slice(0, 5), pairs = daySteps(w1, 1).find((s) => s.meta.type === 'pairs').items.slice(0, 3);
  [...words, ...pairs].forEach((it, i) => store.recordFirst({ itemId: it.id, ok: i % 2 === 0 ? false : true, day: ago(i % 2 === 0 ? 0 : 2) }));
  const due = store.due(w1);
  const L = await buildLearn({ week: 1, day: 3, kind: 'review' });
  assert.equal(L.kind, 'race'); assert.equal(L.review, true); assert.equal(L.world, 'turf');
  assert.ok(L.Flow.prototype instanceof RunnerFlow, 'the runner, as it is');
  assert.deepEqual(flat(L.level), due, 'the level asks the due items, in order');
  assert.equal(L.level.week, 1); assert.equal(L.level.day, 3); assert.equal(L.level.weekRef, L.weekRef);
  assert.equal(L.level.stage, dayPlanFor(w1, 7).stage);
  const S = await buildLearn({ week: 1, day: 3, kind: 'review', short: true });
  assert.ok(S.level.gates.length <= 2 && S.level.gates.every((g) => g.items.length <= 2) && S.short);
  // the one judging path: an item answered days ago records today's first answer; one answered today is practice
  const old = words[1], today = words[0];
  const r1 = judgeRecord({ item: old, p: prompt(old), ans: rightAnswerOf(old, prompt(old)), store });
  assert.equal(r1.first, true); assert.deepEqual(r1.evidence, [1, 'L']);
  const r2 = judgeRecord({ item: today, p: prompt(today), ans: rightAnswerOf(today, prompt(today)), store });
  assert.equal(r2.first, false, '当天首答: a second answer today writes nothing');
  // main.js startLearn toasts the error's own words (only that one place changed)
  const main = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
  assert.ok(main.includes("this.menus?.toast?.((e && e.zh) || '这一天的课还没准备好')"));
});
