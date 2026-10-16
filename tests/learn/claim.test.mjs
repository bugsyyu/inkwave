// 「我的写法也对」 (docs/LEARN.md §17, I): a written sentence that IELTS-Base's gen.js check() calls claimable — the meaning
// there (content words ≥ 60 %), no key form wrong — can be claimed as right on her own judgement, as in IELTS-Base's exam
// (app/exam/ui.js paintVerdict: 「我的写法也对 · 点了算自评，周报里请老师看」; app/exam/store.js: the answer is held until
// claim() or leave(); a claim is re-checked by check() with { claimed: true }; the record is [1, 'S'], the miss [0, 'W']).
// Real week-1 sentences, the real judge, the real store (a memory backend). 用法：node --test tests/learn/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWeek, daySteps } from '../../src/learn/content.js';
import { judge, prompt } from '../../src/learn/engine.js';
import { ielts } from '../../src/learn/ielts.js';
import { store, setBackend } from '../../src/learn/store.js';
import { canClaim, claimJudge, judgeAnswer } from '../../src/learn/forms/common.js';

function memory() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; }
async function writeItem(ref) {
  const w1 = await loadWeek(1);
  for (let d = 1; d <= 7; d++) for (const s of daySteps(w1, d)) for (const it of s.items || []) if (it.meta && it.meta.input === 'write' && (it.meta.ref || it.en) === ref) return it;
  throw new Error('no write item ' + ref);
}

test('a near miss is claimable (gen.js), a far one and a right one are not; only the sentence as asked offers the claim', async () => {
  const it = await writeItem('My mother is kind.');
  const p = prompt(it);
  assert.equal(p.type, 'write');
  const near = judge(it, 'My mum is kind.');
  assert.equal(near.ok, false); assert.equal(near.claimable, true, 'mum for mother: the meaning is there, no key form wrong');
  assert.match(near.why, /我的写法也对/, 'the verdict says she may claim it');
  assert.equal(canClaim(it, p, near), true);
  const far = judge(it, 'I like apples.');
  assert.equal(far.claimable, false); assert.equal(canClaim(it, p, far), false);
  const keyForm = judge(it, 'My mother kind.');
  assert.equal(keyForm.ok, false); assert.equal(keyForm.claimable, false, 'a missing be is a key form: never claimable');
  const right = judge(it, 'My mother is kind.');
  assert.equal(right.ok, true); assert.equal(canClaim(it, p, right), false, 'nothing to claim on a right answer');
  assert.equal(canClaim(it, { ...p, _alt: 'choice-of-typed' }, near), false, 'the reworded card is a choice: no claim');
  assert.equal(canClaim({ ...it, _relearn: true }, p, near), false, 'the 回炉门 has no claim (as the exam\'s relearn rounds)');
  assert.deepEqual(judgeAnswer(it, p, 'My mum is kind.'), near, 'the forms judge it the usual way first');
});

test('the claim is gen.js\'s own re-check: it stands on a claimable answer (ok, claimed) and is refused on any other', async () => {
  const it = await writeItem('My brother is married.');
  const p = prompt(it);
  const c = claimJudge(it, p, 'My bro is married.');
  assert.equal(judge(it, 'My bro is married.').claimable, true);
  assert.equal(c.ok, true); assert.equal(c.claimed, true);
  assert.match(c.why, /自评/); assert.ok(c.why.includes('My brother is married.'), 'the reference stays in view');
  const no = claimJudge(it, p, 'Brother married.');
  assert.equal(no.ok, false, 'a key form wrong: the claim does not stand'); assert.notEqual(no.claimed, true);
  assert.equal(claimJudge(it, p, '').ok, false);
});

test('the record: nothing while it is held; a claim is the day\'s first answer [1, \'S\'], going on is [0, \'W\']; validLeaf; one a day', async () => {
  const { Model } = await ielts();
  const it = await writeItem('Today is Friday.');
  const day = '2026-10-16', at = new Date('2026-10-16T09:30:05');
  setBackend(memory()); store.load();
  // held: the verdict is up, nothing written (the exam store's pending answer)
  assert.equal(judge(it, 'Is Friday.').claimable, true);
  assert.equal(store.hasEvOn(it.id, day), false);
  // she claims it
  const r = store.recordFirst({ item: it, ok: true, self: true, day, at });
  assert.deepEqual(r, { first: true, doc: 'ev-2026-10-12', date: day, hms: '093005', leaf: [1, 'S'] });
  assert.ok(Model.validLeaf(r.leaf) && Model.MODES.S, 'S is one of IELTS-Base\'s evidence modes (the weekly report lists these for the teacher)');
  assert.deepEqual(store.recordFirst({ item: it, ok: false, day }), { first: false }, 'one first answer a day');
  // another day: she goes on without claiming → the miss, written as a sentence
  const w = store.recordFirst({ item: it, ok: false, day: '2026-10-17' });
  assert.deepEqual(w.leaf, [0, 'W']);
  assert.ok(Model.validLeaf(w.leaf));
  // and a right sentence is W 1 (no self)
  assert.deepEqual(store.recordFirst({ item: it, ok: true, day: '2026-10-18' }).leaf, [1, 'W']);
});
