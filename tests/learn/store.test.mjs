// src/learn/store.js: evidence in IELTS-Base's ev-<Monday> format, written only for the first answer of the day
// (core.record's rule), read back by the memory model (Model.answers + Model.memory) for due items and progress.
// 用法：node --test tests/learn/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWeek, daySteps } from '../../src/learn/content.js';
import { ielts } from '../../src/learn/ielts.js';
import { store, setBackend, KEY } from '../../src/learn/store.js';

function memory() { const m = new Map(); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; }
let w1 = null, steps = null;
async function fresh() { w1 = w1 || (await loadWeek(1)); steps = steps || daySteps(w1, 1); const b = memory(); setBackend(b); store.load(); return b; }
const by = (t) => steps.find((s) => s.meta.type === t);

test('当天首答: the first answer of the day is evidence, the second returns { first: false } and writes nothing; the next day counts again', async () => {
  await fresh();
  const q = by('grammar').items[0];
  let r = store.recordFirst({ itemId: q.id, ok: true, day: '2026-10-15', at: new Date('2026-10-15T09:20:33') });
  assert.deepEqual(r, { first: true, doc: 'ev-2026-10-12', date: '2026-10-15', hms: '092033', leaf: [1, 'L'] });
  r = store.recordFirst({ itemId: q.id, ok: false, day: '2026-10-15', at: new Date('2026-10-15T09:21:00') });
  assert.deepEqual(r, { first: false });
  assert.deepEqual(store.evidence()['ev-2026-10-12'].it[q.id], { '2026-10-15': { '092033': [1, 'L'] } }, 'the wrong second answer did not overwrite');
  r = store.recordFirst({ itemId: q.id, ok: false, day: '2026-10-16', at: '2026-10-16T18:05:09' });
  assert.deepEqual(r, { first: true, doc: 'ev-2026-10-12', date: '2026-10-16', hms: '180509', leaf: [0, 'L'] });
  r = store.recordFirst({ itemId: q.id, ok: true, day: '2026-10-19' });
  assert.equal(r.first, true); assert.equal(r.doc, 'ev-2026-10-19', 'Monday the 19th starts a new document');
});

test('leaves are IELTS-Base\'s: [1|0, mode] or the dictation percent; modes L / T / H / S / W by what she did; Model.validLeaf accepts every one', async () => {
  await fresh();
  const { Model } = await ielts();
  const d = by('dictation').items[4], card = by('flash').items[0], word = by('words').items[0], x = by('write').items[1], pr = by('pairs').items[0], sym = by('symbols').items[0];
  assert.deepEqual(store.recordFirst({ itemId: d.id, ok: true, pct: 88, day: '2026-10-15' }).leaf, [88, 'L'], 'a dictation sentence keeps its percent');
  assert.deepEqual(store.recordFirst({ itemId: d.id, ok: false, pct: 40, day: '2026-10-16' }).leaf, [40, 'L']);
  assert.deepEqual(store.recordFirst({ itemId: d.id, ok: 62.6, day: '2026-10-17' }).leaf, [63, 'L'], 'a number in ok is the percent');
  assert.deepEqual(store.recordFirst({ itemId: d.id, ok: true, day: '2026-10-18' }).leaf, [100, 'L']);
  assert.deepEqual(store.recordFirst({ item: card, ok: true, day: '2026-10-15' }).leaf, [1, 'T'], 'a typed card is T');
  assert.deepEqual(store.recordFirst({ item: card, ok: true, hinted: true, day: '2026-10-16' }).leaf, [1, 'H'], 'after a hint H');
  assert.deepEqual(store.recordFirst({ item: card, ok: true, self: true, day: '2026-10-17' }).leaf, [1, 'S'], '「我的写法也对」 S');
  assert.deepEqual(store.recordFirst({ item: word, ok: false, day: '2026-10-18' }).leaf, [0, 'L'], 'the meaning question is a lesson answer');
  assert.deepEqual(store.recordFirst({ itemId: x.id, ok: true, day: '2026-10-15' }).leaf, [1, 'W']);
  assert.deepEqual(store.recordFirst({ itemId: x.id, ok: true, self: true, day: '2026-10-16' }).leaf, [1, 'S']);
  assert.deepEqual(store.recordFirst({ itemId: pr.id, ok: true, day: '2026-10-15' }).leaf, [1, 'L']);
  assert.deepEqual(store.recordFirst({ itemId: sym.id, ok: 1, day: '2026-10-15' }).leaf, [1, 'L']);
  assert.deepEqual(store.recordFirst({ itemId: 'no:such', ok: true, day: '2026-10-15' }), { first: false, reason: 'not-scored' }, 'an item the index does not know is not written (core.record)');
  assert.deepEqual(store.recordFirst({ item: by('speak').items[0], ok: true, day: '2026-10-15' }), { first: false, reason: 'not-scored' });
  assert.deepEqual(store.recordFirst({ ok: true }), { first: false, reason: 'no-item' });
  const ev = store.evidence();
  let leaves = 0;
  for (const doc of Object.values(ev)) {
    assert.equal(doc.v, 2);
    for (const byDate of Object.values(doc.it)) for (const byT of Object.values(byDate)) for (const [hms, leaf] of Object.entries(byT)) { assert.match(hms, /^\d{6}$/); assert.ok(Model.validLeaf(leaf), JSON.stringify(leaf)); leaves++; }
  }
  assert.equal(leaves, 12, '4 dictation dates + 4 w:monday dates (card T/H/S, then the meaning L) + 2 write + pair + sound');
  assert.equal(Object.keys(ev).join(','), 'ev-2026-10-12');
});

test('due(week): the memory model\'s — a miss is due at once, a hit fades below 60 % after a couple of days, most forgotten first', async () => {
  await fresh();
  const q = by('grammar').items[0], d = by('dictation').items[4], card = by('flash').items[0];
  assert.deepEqual(store.due(w1, '2026-10-15'), [], 'nothing answered, nothing due');
  store.recordFirst({ itemId: q.id, ok: false, day: '2026-10-15' });
  store.recordFirst({ itemId: d.id, ok: true, pct: 88, day: '2026-10-15' });
  store.recordFirst({ item: card, ok: true, day: '2026-10-15' });
  assert.deepEqual(store.due(w1, '2026-10-15'), [q.id], 'the miss is due the same day; the hits are fresh');
  // one day later a single hit has h = 1.3: p = 2^(-1/1.3) ≈ 0.587 < 0.6, so the hits are due too; the miss (h = 0.35,
  // p ≈ 0.14) comes first, then the two hits in id order
  assert.deepEqual(store.due(w1, '2026-10-16'), [q.id, d.id, card.id]);
  const two = store.due(w1, '2026-10-17');
  assert.equal(two.length, 3); assert.equal(two[0], q.id, 'the miss (lowest p) first');
  store.recordFirst({ itemId: q.id, ok: true, day: '2026-10-17' });
  store.recordFirst({ itemId: d.id, ok: true, pct: 100, day: '2026-10-17' });
  assert.deepEqual(store.due(w1, '2026-10-18'), [card.id], 'answered right again on the 17th: h grew, not due the next day');
  assert.deepEqual(store.due(w1), store.due(w1, undefined), 'asOf defaults to today');
});

test('progress(week, day): scored items with any evidence / all scored items; a word and its card count once', async () => {
  await fresh();
  assert.deepEqual(store.progress(w1, 1), { done: 0, total: 60 });
  store.recordFirst({ itemId: 'w:monday', ok: true, day: '2026-10-15' });
  store.recordFirst({ itemId: by('dictation').items[0].id, ok: false, pct: 20, day: '2026-10-15' });
  assert.deepEqual(store.progress(w1, 1), { done: 2, total: 60 });
  assert.deepEqual(store.progress(w1, 7), { done: 1, total: 48 + 150 + 10 + 10 }, 'the review day shares w:monday');
});

test('save / load: the one key, a round trip through the backend, a broken value starts fresh', async () => {
  const b = await fresh();
  store.recordFirst({ itemId: 'w:monday', ok: true, day: '2026-10-15', at: new Date('2026-10-15T10:00:00') });
  assert.ok(b.m.has(KEY)); assert.equal(KEY, 'inkwave:learn:v1');
  const saved = JSON.parse(b.m.get(KEY));
  assert.equal(saved.v, 1); assert.deepEqual(saved.ev['ev-2026-10-12'].it['w:monday'], { '2026-10-15': { '100000': [1, 'L'] } });
  setBackend(b); // a new session on the same storage
  assert.deepEqual(store.load().ev, saved.ev);
  assert.equal(store.hasEvOn('w:monday', '2026-10-15'), true); assert.equal(store.hasEvOn('w:monday', '2026-10-16'), false);
  b.m.set(KEY, '{not json');
  setBackend(b);
  assert.deepEqual(store.load(), { v: 1, ev: {} });
  assert.equal(store.save(), true);
  setBackend(null); // the default backend: localStorage in a page, memory here
  assert.deepEqual(store.load().ev, {});
});
