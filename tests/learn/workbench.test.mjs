// The game's evidence into her own account (docs/LEARN.md §16): store.exportDocs() → workbench.pushEvidence() merges the
// ev-<Monday> documents into the workbench's localStorage blob ('ielts-workbench:data:v1', base) with IELTS-Base's own
// Model.mergeDoc. Her answer of the day stands, a second run changes nothing, everything else in her blob is untouched;
// her clock (设置 → 时区) dates the game's answers; her history counts for due / progress. A made-up learner — nothing here
// reads app/my-progress.*.
// 用法：node --test tests/learn/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWeek, daySteps } from '../../src/learn/content.js';
import { ielts } from '../../src/learn/ielts.js';
import { store, setBackend, KEY } from '../../src/learn/store.js';
import { DATA_KEY, PREF_KEY, mergeEvidence, pushEvidence } from '../../src/learn/workbench.js';

function memory(init) {
  const m = new Map(Object.entries(init || {})), writes = [];
  return { m, writes, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { writes.push(k); m.set(k, String(v)); } };
}
// a workbench blob like localBlob() writes it: profile + the ten collections; base holds her evidence and other Base docs
function herBlob(base) {
  return JSON.stringify({
    profile: { v: 1, setup: true, examType: 'A', target: 6.5, startDate: '2026-10-12', accent: 'gb', ww: { monday: { n: 2 } }, cq: { 'w1d1:a3': [1, 0, 1] } },
    days: { '2026-10': { '15': { done: ['w1d1:a1'] } } }, logs: {}, mistakes: { m1: { en: 'Wensday', at: '2026-10-15' } }, notes: {}, mocks: {}, packs: {}, essays: {}, teacher: {}, reviews: {},
    base: Object.assign({ world: { v: 3, seed: 7, born: { '2026-10-12': 1 } }, 'plan-2026-10': { v: 2, d: { '15': { ok: true } } } }, base || {}),
  });
}
let w1 = null, steps = null;
async function week() { w1 = w1 || (await loadWeek(1)); steps = steps || daySteps(w1, 1); }
async function setup(init) { await week(); const b = memory(init); setBackend(b); store.load(); return b; }
const by = (t) => steps.find((s) => s.meta.type === t);
const blobOf = (b) => JSON.parse(b.m.get(DATA_KEY));
const without = (o, k) => { const c = Object.assign({}, o); delete c[k]; return c; };

test('merge into her account: her answer of the day stands, the rest goes in with Model.mergeDoc, a second run writes nothing', async () => {
  const { Model } = await ielts();
  await week();
  const q = by('grammar').items[0], d = by('dictation').items[2], card = by('flash').items[3], pr = by('pairs').items[1];
  const hers = { 'ev-2026-10-12': { v: 2, it: { 'w:monday': { '2026-10-15': { '081500': [1, 'L'] } }, [q.id]: { '2026-10-14': { '200000': [0, 'L'] } } } } };
  const b = await setup({ [DATA_KEY]: herBlob(hers), [PREF_KEY]: JSON.stringify({ tz: 'sin', accent: 'us' }) });
  const before = blobOf(b), rawBefore = b.m.get(DATA_KEY);

  // she answered w:monday in the lesson this morning: the game's answer today is not a first answer
  assert.deepEqual(store.recordFirst({ itemId: 'w:monday', ok: false, day: '2026-10-15', at: '2026-10-15T09:00:00+08:00' }), { first: false });
  assert.equal(store.recordFirst({ itemId: q.id, ok: true, day: '2026-10-15', at: '2026-10-15T09:01:02+08:00' }).first, true, 'yesterday\'s lesson answer does not block today');
  assert.deepEqual(store.recordFirst({ itemId: d.id, ok: true, pct: 92, day: '2026-10-15', at: '2026-10-15T09:02:00+08:00' }).leaf, [92, 'L']);
  assert.deepEqual(store.recordFirst({ item: card, ok: true, hinted: true, day: '2026-10-16', at: '2026-10-16T10:00:00+08:00' }).leaf, [1, 'H']);
  assert.equal(store.recordFirst({ itemId: pr.id, ok: false, day: '2026-10-19', at: '2026-10-19T08:00:00+08:00' }).doc, 'ev-2026-10-19');
  // …and after the game's answer to pr on the 19th she answers it in the lesson too (before any push): hers is kept, the game's is left out
  const mid = blobOf(b);
  mid.base['ev-2026-10-19'] = { v: 2, it: { [pr.id]: { '2026-10-19': { '070000': [1, 'L'] } } } };
  b.m.set(DATA_KEY, JSON.stringify(mid));

  const docs = store.exportDocs();
  assert.deepEqual(docs.map((x) => x.id), ['ev-2026-10-12', 'ev-2026-10-19']);
  assert.deepEqual(store.exportDoc('2026-10-14'), docs[0], 'any day of the week names its document');
  assert.equal(store.exportDoc('2026-09-01'), null);

  const r1 = store.pushToWorkbench({ at: '2026-10-19T12:00:00+08:00' });
  assert.equal(r1.ok, true);
  assert.deepEqual(r1.changed, ['ev-2026-10-12']);
  assert.equal(r1.added, 3, 'q, d, card');
  assert.equal(r1.skipped, 1, 'pr on the 19th: her answer stands');
  const after = blobOf(b), ev = after.base['ev-2026-10-12'];
  assert.deepEqual(ev.it['w:monday'], { '2026-10-15': { '081500': [1, 'L'] } }, 'her answer, alone');
  assert.deepEqual(ev.it[q.id], { '2026-10-14': { '200000': [0, 'L'] }, '2026-10-15': { '090102': [1, 'L'] } }, 'her day and the game\'s day, side by side');
  assert.deepEqual(ev.it[d.id], { '2026-10-15': { '090200': [92, 'L'] } });
  assert.deepEqual(ev.it[card.id], { '2026-10-16': { '100000': [1, 'H'] } });
  assert.deepEqual(after.base['ev-2026-10-19'], mid.base['ev-2026-10-19'], 'her week untouched');
  assert.equal(ev.v, 2);
  for (const doc of Object.values(after.base).filter((x, i) => /^ev-/.test(Object.keys(after.base)[i]))) {
    for (const byDate of Object.values(doc.it)) for (const byT of Object.values(byDate)) {
      assert.equal(Object.keys(byT).length, 1, 'one answer a day');
      for (const [hms, leaf] of Object.entries(byT)) { assert.match(hms, /^\d{6}$/); assert.ok(Model.validLeaf(leaf), JSON.stringify(leaf)); }
    }
  }
  // everything that is not her evidence is the same value, and the same text where it sits in the blob
  assert.deepEqual(without(after, 'base'), without(before, 'base'));
  assert.deepEqual(without(after.base, 'ev-2026-10-12'), without(mid.base, 'ev-2026-10-12'));
  assert.deepEqual(Object.keys(after), Object.keys(before), 'key order kept');
  assert.ok(b.m.get(DATA_KEY).startsWith(rawBefore.slice(0, rawBefore.indexOf('"base"'))), 'the text before base is byte-identical');

  // the second run: nothing new, nothing written, nothing doubled
  const raw1 = b.m.get(DATA_KEY), n = b.writes.filter((k) => k === DATA_KEY).length;
  const r2 = store.pushToWorkbench({ at: '2026-10-19T12:05:00+08:00' });
  assert.deepEqual([r2.ok, r2.changed, r2.added, r2.already, r2.skipped], [true, [], 0, 3, 1]);
  assert.equal(b.m.get(DATA_KEY), raw1, 'byte-identical');
  assert.equal(b.writes.filter((k) => k === DATA_KEY).length, n, 'not even rewritten');
  // a new session on the same storage (the next time the game opens): still nothing
  setBackend(b);
  assert.deepEqual(store.pushToWorkbench({ at: '2026-10-20T08:00:00+08:00' }).changed, []);
  assert.equal(b.m.get(DATA_KEY), raw1);
  // the pure merge says the same about her merged base
  assert.deepEqual(mergeEvidence(after.base, docs, Model).changed, []);
});

test('no workbench here (plain INKWAVE, development): nothing is created, the game keeps its own evidence', async () => {
  const b = await setup();
  store.recordFirst({ itemId: 'w:monday', ok: true, day: '2026-10-15' });
  assert.deepEqual(store.pushToWorkbench(), { ok: false, reason: 'no-workbench' });
  assert.equal(b.m.has(DATA_KEY), false);
  assert.ok(b.m.has(KEY));
  // a blob that is not the workbench's (no profile) is not written either
  b.m.set(DATA_KEY, JSON.stringify({ hello: 1 }));
  setBackend(b);
  assert.equal(pushEvidence(b, store.exportDocs()).reason, 'no-workbench');
  assert.equal(b.m.get(DATA_KEY), '{"hello":1}');
});

test('her clock: 设置 → 时区 dates the game\'s answers (Singapore when unset, London when she picked it, the device with "device")', async () => {
  const at = '2026-10-15T23:30:05Z';   // Singapore 07:30:05 on the 16th, London 00:30:05 on the 16th (BST)
  await setup({ [PREF_KEY]: JSON.stringify({ accent: 'us' }) });
  let r = store.recordFirst({ itemId: 'w:monday', ok: true, at });
  assert.deepEqual([r.date, r.hms], ['2026-10-16', '073005'], 'unset: the workbench\'s Singapore');
  await setup({ [PREF_KEY]: JSON.stringify({ tz: 'lon' }) });
  r = store.recordFirst({ itemId: 'w:monday', ok: true, at });
  assert.deepEqual([r.date, r.hms], ['2026-10-16', '003005']);
  await setup({ [PREF_KEY]: JSON.stringify({ tz: 'America/Los_Angeles' }) });
  r = store.recordFirst({ itemId: 'w:monday', ok: true, at });
  assert.deepEqual([r.date, r.hms], ['2026-10-15', '163005'], 'an IANA zone');
  await setup({ [PREF_KEY]: JSON.stringify({ tz: 'device' }) });
  r = store.recordFirst({ itemId: 'w:monday', ok: true, at });
  const dv = new Date(at), pad = (n) => String(n).padStart(2, '0');
  assert.deepEqual([r.date, r.hms], [dv.getFullYear() + '-' + pad(dv.getMonth() + 1) + '-' + pad(dv.getDate()), pad(dv.getHours()) + pad(dv.getMinutes()) + pad(dv.getSeconds())]);
});

test('her history counts here (read-only): due() and progress() read her answers with the game\'s; old weeks she holds are dropped from the game\'s copy', async () => {
  await week();
  const q = by('grammar').items[0], d = by('dictation').items[0];
  const hers = { 'ev-2026-10-12': { v: 2, it: { [q.id]: { '2026-10-15': { '090000': [0, 'L'] } } } } };
  const b = await setup({ [DATA_KEY]: herBlob(hers), [PREF_KEY]: '{}' });
  assert.deepEqual(store.due(w1, '2026-10-15'), [q.id], 'her miss in the lesson is due in the game');
  assert.deepEqual(store.progress(w1, 1).done, 1);
  store.recordFirst({ itemId: d.id, ok: true, pct: 100, day: '2026-10-15' });
  assert.deepEqual(store.progress(w1, 1).done, 2);
  assert.ok(!('ev-2026-10-12' in JSON.parse(b.m.get(KEY)).ev) || !JSON.parse(b.m.get(KEY)).ev['ev-2026-10-12'].it[q.id], 'hers is not copied into the game\'s store');
  // an answer from August, pushed, is then only in her account (the game's copy shares her 5 MB of localStorage)
  store.recordFirst({ itemId: d.id, ok: true, pct: 80, day: '2026-08-20' });
  const r = store.pushToWorkbench({ at: '2026-10-19T09:00:00+08:00' });
  assert.deepEqual(r.pruned, ['ev-2026-08-17']);
  assert.deepEqual(Object.keys(JSON.parse(b.m.get(KEY)).ev), ['ev-2026-10-12'], 'this week stays');
  assert.deepEqual(blobOf(b).base['ev-2026-08-17'].it[d.id], { '2026-08-20': { [Object.keys(blobOf(b).base['ev-2026-08-17'].it[d.id]['2026-08-20'])[0]]: [80, 'L'] } });
  assert.equal(store.hasAny(d.id), true, 'still counted, from her account');
});
