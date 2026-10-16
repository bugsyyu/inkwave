// 快闪翻牌 (docs/LEVELS.md §1.1, §3.1; docs/LEARN.md §15): the review day's 150-word flash step is flip cards — the
// Chinese, flip, her own 「记得 / 不记得」 — and that self-rating is evidence mode F (the host's 看词自评, core.js
// mapEvidence), written through store.recordFirst({ how: 'F' }); a 不记得 comes back as the typed card.
// 用法：node --test tests/learn/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWeek, daySteps } from '../../src/learn/content.js';
import { ielts } from '../../src/learn/ielts.js';
import { store, setBackend } from '../../src/learn/store.js';
import { planDay } from '../../src/learn/design.js';
import { isFlipGate, flipPrompt, flipJudge, cardFor, judgeAnswer, rightAnswerOf } from '../../src/learn/forms/common.js';

function memory() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; }

test('the review day has one flash-flip gate (150 words); the other days\' flash steps stay typed cards', async () => {
  const w1 = await loadWeek(1);
  const d7 = planDay(w1, 7, 'race'), d1 = planDay(w1, 1, 'puzzle');
  const flips = d7.gates.filter(isFlipGate);
  assert.equal(flips.length, 1);
  assert.equal(flips[0].items.length, 150);
  assert.ok(flips[0].items.every((it) => it.meta.kind === 'word'));
  assert.equal(d1.gates.filter(isFlipGate).length, 0, 'day 1 b4 is the typed card door');
  assert.ok(d1.gates.some((g) => g.design && g.design.mechanic === 'flash-type'));
});

test('a flip card: Chinese on the front, the word / IPA / sound on the back; 记得 is right, 不记得 is not, both name the word', async () => {
  const w1 = await loadWeek(1);
  const it = planDay(w1, 7, 'race').gates.find(isFlipGate).items[0];
  const p = flipPrompt(it);
  assert.equal(p.type, 'flip'); assert.ok(p._flip);
  assert.equal(p.zh, it.meta.zhFull || it.zh);
  assert.equal(p.tts, null, 'nothing is heard before the flip (the sound would give the word away)');
  assert.equal(p.back.en, it.en); assert.ok(p.back.ipa); assert.equal(p.back.tts, it.en);
  const yes = flipJudge(it, true), no = flipJudge(it, false);
  assert.equal(yes.ok, true); assert.equal(no.ok, false);
  assert.equal(yes.canonical, it.en);
  assert.ok(yes.why.includes(it.en) && no.why.includes(it.en));
  assert.deepEqual(judgeAnswer(it, p, true), yes, 'the forms judge a flip card through flipJudge');
  assert.equal(rightAnswerOf(it, p), true);
});

test('cardFor: the flip card on the flip gate; after 不记得 the typed card; after a typed miss the reworded form', async () => {
  const w1 = await loadWeek(1);
  const g = planDay(w1, 7, 'race').gates.find(isFlipGate), other = planDay(w1, 1, 'puzzle').gates[0];
  const it = { ...g.items[0] };
  const base = () => ({ type: 'type' }), alt = () => ({ type: 'choice', _alt: 'choice-of-typed' });
  assert.equal(cardFor(g, it, base, alt).type, 'flip');
  assert.equal(cardFor(other, { ...other.items[0] }, base, alt).type, 'type', 'no flip outside the flip gate');
  it._flipTyped = true;
  assert.equal(cardFor(g, it, base, alt).type, 'type');
  it._form = 'alt';
  assert.equal(cardFor(g, it, base, alt).type, 'choice');
});

test('store.recordFirst({ how: \'F\' }): the self-rating is an F leaf Model.validLeaf accepts; a mode outside Model.MODES writes nothing; still one first answer a day', async () => {
  const w1 = await loadWeek(1);
  setBackend(memory()); store.load();
  const { Model } = await ielts();
  const card = daySteps(w1, 7).find((s) => s.meta.type === 'flash').items[3];
  let r = store.recordFirst({ item: card, ok: true, how: 'F', day: '2026-10-18', at: new Date('2026-10-18T10:11:12') });
  assert.deepEqual(r, { first: true, doc: 'ev-2026-10-12', date: '2026-10-18', hms: '101112', leaf: [1, 'F'] });
  assert.ok(Model.validLeaf(r.leaf));
  r = store.recordFirst({ item: card, ok: true, typed: true, day: '2026-10-18' });
  assert.deepEqual(r, { first: false }, 'the typed card after 不记得 is practice: the F was the first answer');
  assert.deepEqual(store.recordFirst({ item: card, ok: false, how: 'F', day: '2026-10-19' }).leaf, [0, 'F'], '不记得 is a 0');
  assert.deepEqual(store.recordFirst({ item: card, ok: true, how: 'Q', day: '2026-10-20' }), { first: false, reason: 'bad-mode' });
  assert.equal(store.hasEvOn(card.id, '2026-10-20'), false);
  assert.deepEqual(store.recordFirst({ item: card, ok: true, day: '2026-10-21' }).leaf, [1, 'T'], 'without how: the mode as before');
  // the memory model reads the F leaves like any answer (the host's own flash rating): a 不记得 makes the word due
  setBackend(memory()); store.load();
  store.recordFirst({ item: card, ok: false, how: 'F', day: '2026-10-18' });
  assert.ok(store.due(w1, '2026-10-19').includes(card.id), 'a 不记得 card is due the next day');
});
