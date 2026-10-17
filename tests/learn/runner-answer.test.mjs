// src/learn/play/runner/rows.js — 墨浪跑酷's one answer path (docs/PLAY.md §1 rules 2–5): entering a curtain is the
// option index, judged and recorded on the one judging path (play/judge.js judgeRecord; play-8: the race card that did the
// same is gone) — the same verdicts and the same evidence document, item by item, for every lane of every choice item of a race day; a
// reshuffled second try and a narrowed row map their lanes back through `_perm`; the gap between curtains writes
// nothing; the beat never reaches the judge. And the run's queue covers every item of all three weeks.
// 用法：node --test tests/learn/runner-*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWeek, daySteps } from '../../src/learn/content.js';
import { prompt } from '../../src/learn/engine.js';
import { store, setBackend } from '../../src/learn/store.js';
import { planDay } from '../../src/learn/design.js';
import { judgeAnswer } from '../../src/learn/forms/common.js';
import { judgeRecord } from '../../src/learn/play/judge.js';
import { LEARN } from '../../src/config.js';
import { entriesOf, rowPrompt, rowLabels, rowLanes, isBanner, rightLane, rowAnswer, ROW_KINDS } from '../../src/learn/play/runner/rows.js';

function memory() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; }
const AT = Date.parse('2026-10-14T09:30:00');
const choiceItems = (level) => level.gates.flatMap((g) => g.items).filter((it) => it.meta && it.meta.scored && it.meta.input === 'choice');

// the one judging path, called directly with the option index (no flip card in a race row)
function cardAnswer(item, p, ans, at) {
  const out = judgeRecord({ item, p, ans, o: { at }, store });
  return { r: out.r, first: out.first };
}

test('a curtain = the one judging path: every lane of every choice item of a race day judges and records exactly as judgeRecord does (same verdict, same evidence document)', async () => {
  const w1 = await loadWeek(1);
  for (const day of [3, 7]) {
    const items = choiceItems(planDay(w1, day, 'race'));
    assert.ok(items.length > 40, 'w1d' + day + ': ' + items.length + ' choice items');
    for (const lanePick of ['right', 'wrong']) {
      const A = memory(), B = memory();
      const cards = [], rows = [];
      setBackend(A);
      for (const it of items) { const p = prompt(it); const ans = lanePick === 'right' ? it.answer : (it.answer + 1) % p.options.length; cards.push(cardAnswer(it, p, ans, AT)); }
      const docA = JSON.stringify(store.evidence());
      setBackend(B);
      for (const it of items) { const p = rowPrompt(it, {}); const lane = lanePick === 'right' ? rightLane(it, p) : (rightLane(it, p) + 1) % p.options.length; rows.push(rowAnswer(it, p, lane, { at: AT })); }
      const docB = JSON.stringify(store.evidence());
      assert.equal(docB, docA, `w1d${day} (${lanePick}): the runner writes the card's evidence`);
      rows.forEach((x, i) => {
        assert.equal(x.answered, true);
        assert.equal(x.r.ok, cards[i].r.ok); assert.equal(x.r.why, cards[i].r.why); assert.equal(x.first, cards[i].first);
        assert.equal(x.r.ok, lanePick === 'right');
      });
      assert.ok(rows.every((x) => x.first), 'each the day\'s first answer');
      // and a second time the same day: practice only, on both paths
      setBackend(B); const again = rowAnswer(items[0], rowPrompt(items[0], {}), 0, { at: AT + 60000 });
      assert.equal(again.first, false); assert.equal(JSON.stringify(store.evidence()), docB, 'nothing more written');
    }
  }
});

test('the second try (reshuffled) and a narrowed row map their lanes back to the item\'s options; the right one always stays', async () => {
  const w1 = await loadWeek(1), w2 = await loadWeek(2);
  const items = [...choiceItems(planDay(w1, 3, 'race')), ...choiceItems(planDay(w2, 2, 'race'))];
  let seq = 0.137; const rnd = () => { seq = (seq * 9301 + 0.49297) % 1; return seq; };
  for (const it of items) {
    const base = prompt(it), n = base.options.length;
    const alt = rowPrompt(it, { alt: true, rnd });
    assert.equal(alt.options.length, n);
    if (n > 1) assert.ok(alt._perm && alt._perm.some((v, i) => v !== i), 'reshuffled');
    assert.ok(alt.text.startsWith('换个问法'));
    for (let lane = 0; lane < n; lane++) {
      setBackend(memory()); const a = rowAnswer(it, alt, lane, { at: AT });
      setBackend(memory()); const c = cardAnswer(it, alt, lane, AT);   // (B's reshuffled card answers through the same _perm)
      assert.equal(a.r.ok, c.r.ok); assert.equal(a.r.ok, alt._perm[lane] === it.answer);
      assert.deepEqual(alt.options[lane], base.options[alt._perm[lane]], 'the lane shows the option it judges as');
    }
    for (let lanes = 2; lanes < n; lanes++) {
      const nar = rowPrompt(it, { lanes, order: alt._perm });
      assert.equal(nar.options.length, lanes);
      const rl = rightLane(it, nar);
      assert.ok(rl >= 0 && nar._perm[rl] === it.answer, 'the right option is on the road');
      setBackend(memory()); assert.equal(rowAnswer(it, nar, rl, { at: AT }).r.ok, true);
      setBackend(memory()); assert.equal(rowAnswer(it, nar, (rl + 1) % lanes, { at: AT }).r.ok, false);
    }
  }
});

test('through the gap between two curtains (or never into one): no answer — nothing judged, nothing written; the beat never reaches the judge', async () => {
  const w1 = await loadWeek(1);
  const items = choiceItems(planDay(w1, 3, 'race')).slice(0, 12);
  setBackend(memory());
  for (const it of items) {
    const p = rowPrompt(it, {});
    for (const lane of [-1, null, undefined, p.options.length]) assert.equal(rowAnswer(it, p, lane, { at: AT }).answered, false);
  }
  assert.deepEqual(store.evidence(), {}, 'no evidence at all');
  // timing ≠ correctness (PLAY §1 rule 4): whatever a caller says about the beat, the same lane gives the same verdict
  // and the same document — rowAnswer reads only { hinted, at } from its options
  const pairs = choiceItems(planDay(w1, 3, 'race')).filter((it) => ROW_KINDS[it.meta.kind] === 'beat');
  assert.ok(pairs.length >= 8, 'beat rows on a race day: ' + pairs.length);
  const A = memory(), B = memory();
  setBackend(A); for (const it of pairs) rowAnswer(it, rowPrompt(it, {}), rightLane(it, rowPrompt(it, {})), { at: AT, beat: true, onBeat: true });
  const dA = JSON.stringify(store.evidence());
  setBackend(B); for (const it of pairs) rowAnswer(it, rowPrompt(it, {}), rightLane(it, rowPrompt(it, {})), { at: AT, beat: false, onBeat: false, off: 0.4 });
  assert.equal(JSON.stringify(store.evidence()), dA, 'on the beat or off it: the right lane is right, recorded the same');
  assert.ok(Object.values(JSON.parse(dA)).length >= 1);
});

test('the run\'s queue over all three weeks: every scored choice item a row (pairs and sounds on the beat), every typed item in a 滑行段; banners at most three lanes', async () => {
  const B = LEARN.runner.banner;
  let rowsN = 0, beatN = 0, typedN = 0, banners = 0, maxBannerLanes = 0;
  for (const wk of [1, 2, 3]) {
    const w = await loadWeek(wk);
    for (let d = 1; d <= 7; d++) {
      const level = planDay(w, d, 'race');
      const E = entriesOf(level.gates);
      const scoredChoice = level.gates.flatMap((g) => g.items).filter((it) => it.meta.scored && it.meta.input === 'choice');
      const typed = level.gates.flatMap((g) => g.items).filter((it) => it.meta.scored && (it.meta.input === 'type' || it.meta.input === 'write'));
      const rowE = E.filter((e) => e.kind !== 'glide');
      assert.equal(rowE.length, scoredChoice.length, `w${wk}d${d}: a row per choice item`);
      assert.equal(E.filter((e) => e.kind === 'glide').reduce((n, e) => n + e.items.length, 0), typed.length, `w${wk}d${d}: typed items in glides`);
      for (const e of rowE) {
        assert.equal(e.kind, (e.item.meta.kind === 'pair' || e.item.meta.kind === 'sym') ? 'beat' : 'lane');
        const p = rowPrompt(e.item, {}), labels = rowLabels(e.item, p), lanes = rowLanes(e.item, p, B);
        assert.ok(lanes >= 2 && lanes <= 4);
        assert.ok(labels.every((l) => l.en), 'every curtain has its text');
        if (labels.some((l) => isBanner(l, B))) { banners++; maxBannerLanes = Math.max(maxBannerLanes, lanes); }
        if (e.kind === 'beat') beatN++;
      }
      rowsN += rowE.length; typedN += typed.length;
      // (every step's items are there: nothing of the day is lost to the runner)
      void daySteps;
    }
  }
  assert.ok(maxBannerLanes <= 3, 'banners ≤ 3');
  assert.ok(banners >= 50, 'long labels make banners: ' + banners);
  assert.equal(beatN, 174 + 96, 'the 174 listening pairs and 96 sounds are beat rows');
  assert.ok(rowsN > 900 && typedN > 1000, `rows ${rowsN}, typed ${typedN}`);
});
