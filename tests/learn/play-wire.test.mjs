// 题即玩法 play-wire (src/learn/play/host.js + wire/, docs/PLAY.md §4, §9 phases 2–3): the puzzle without a card —
//   · design.js playOf: every item of the three weeks has a mechanic (never a card), its answer shape matches its input
//   · host.js kindOfItem: every prompt a puzzle gate can ask (the engine's, the reworded retry, the flip card, the
//     「不熟」 typed card) goes to a station — M1 / M3 / M4 / M8 — none is null
//   · the typed answer goes through the flow's one path with the mode a station knows: T · H (a hint used) · L (pct) · W
//   · the dictation's other form under the flag is the same dictation, slowly (never four sentence planks)
//   · the beat items: 听辨对子 174 (2 pads) · 音标 96 (4 pads); their reshuffled retry stays on the stage
//   · the boards a gate shows (wire/boards.js gateSpecs) and the touch layer's skip for the keyboard / reading strip
// 用法：node --test tests/learn/*.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWeek, daySteps } from '../../src/learn/content.js';
import { prompt } from '../../src/learn/engine.js';
import { store, setBackend } from '../../src/learn/store.js';
import { LEARN } from '../../src/config.js';
import { planDay, PLAY, playOf, MECHANICS } from '../../src/learn/design.js';
import { flipPrompt, isFlipGate } from '../../src/learn/forms/common.js';
const { kindOfItem } = await import('../../src/learn/play/host.js');
const { LearnFlow } = await import('../../src/learn/flow.js');
const { isBeatItem, padLabels } = await import('../../src/learn/play/wire/beat.js');
const { gateSpecs, BOARDS_MAX } = await import('../../src/learn/play/wire/boards.js');
const { canPlayM1 } = await import('../../src/learn/play/m1.js');

function memory() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; }
const WEEKS = [await loadWeek(1), await loadWeek(2), await loadWeek(3)];
const leafOf = (id) => { const ev = store.evidence(); for (const doc of Object.values(ev)) { const d = doc.it[id]; if (d) { const day = Object.values(d)[0]; return Object.values(day)[0]; } } return null; };
const stubFlow = (play = true) => ({ P: LEARN.puzzle, firsts: 0, right: new Set(), play, _emit() {}, _styleGates() {} });

test('PLAY §4: every item of the three weeks has a mechanic in every form, never a card; the answer shape follows the input', () => {
  const n = {}, shapes = { choice: new Set(['index']), type: new Set(['text', 'self']), write: new Set(['text', 'index']), read: new Set(['none']) };
  for (const w of WEEKS) for (const d of w.days) for (const form of ['puzzle', 'race', 'duel', 'boss']) {
    const P = planDay(w, d.n, form === 'boss' ? 'puzzle' : form);
    for (const g of [...P.gates, ...P.signs]) for (const it of g.items) {
      const id = playOf(it, form, g.design && g.design.mechanic);
      assert.ok(id && PLAY[id], `${w.id} d${d.n} ${form} ${it.id}: a mechanic`);
      assert.notEqual(id, 'card');
      const input = it.meta.input;
      assert.ok(shapes[input].has(PLAY[id].answer), `${it.id} ${input} → ${id} answers ${PLAY[id].answer}`);
      if (form === 'puzzle') n[id] = (n[id] || 0) + 1;
    }
  }
  // the puzzle: the counts PLAY §4 lists (per occurrence in a day's plan — the review day re-asks the week's words as flip cards)
  assert.ok(n['ink-target'] >= 724 && n['beat-pads'] >= 270 && n['type-shot'] >= 750 && n['flip-target'] === 450 && n['echo-booth'] === 21 && n['signs'] >= 21, JSON.stringify(n));
  Object.keys(PLAY).forEach((k) => assert.ok(PLAY[k].zh && PLAY[k].record && PLAY[k].reuse));
});

test('host.js kindOfItem: every prompt a puzzle gate can ask goes to a station (M1 / M3 / M4 / M8) — none is null', () => {
  const n = { m1: 0, beat: 0, type: 0, flip: 0 }, alt = { m1: 0, beat: 0, type: 0 };
  const F = { play: true, _wordPool: LearnFlow.prototype._wordPool, level: null };
  for (const w of WEEKS) for (const d of w.days) {
    const P = planDay(w, d.n, 'puzzle');
    F.level = P;
    for (const g of P.gates) for (const it of g.items) {
      const item = { ...it, _tries: 0, _form: null };
      const flip = isFlipGate(g);
      const p = flip ? flipPrompt(item) : prompt(item);
      const k = kindOfItem(item, p);
      assert.ok(k, `${it.id}: ${p.type}`); n[k]++;
      if (flip) { assert.equal(k, 'flip'); const typed = kindOfItem(item, prompt(item)); assert.equal(typed, 'type', '「不熟」: typed next'); continue; }
      // the other form after a miss
      const a = LearnFlow.prototype._altPrompt.call(F, item);
      const ka = kindOfItem(item, a);
      assert.ok(ka, `${it.id} retry: ${a.type} ${a._alt || a._perm ? 'alt' : ''}`); alt[ka]++;
      if (it.meta.kind === 'dict') { assert.equal(ka, 'type'); assert.ok(a._tip && a._tip.slow, 'a dictation comes back slowly'); }
      if (it.meta.input === 'type' && it.meta.kind === 'word') { assert.equal(ka, 'm1'); assert.equal(a._alt, 'choice-of-typed'); assert.ok(a.options.length >= 2 && a.options.length <= 4); }
      if (it.meta.kind === 'sym' || it.meta.kind === 'pair') assert.equal(ka, 'beat', 'a pair / symbol retry stays on the stage');
    }
  }
  assert.ok(n.m1 >= 724 && n.beat >= 270 && n.type >= 650 && n.flip === 450, JSON.stringify(n));
  assert.ok(alt.m1 > 0 && alt.beat > 0 && alt.type > 0, JSON.stringify(alt));
  // nothing a station could not take: a 5-option choice or a typed-of-choice is not on the courses, and is null here
  const word = daySteps(WEEKS[0], 1).find((s) => s.kind === 'choice').items[0];
  assert.equal(kindOfItem(word, { type: 'typed', _alt: 'typed-of-choice' }), 'type');
  assert.equal(kindOfItem(word, { type: 'choice', options: Array(5).fill({ text: 'x' }) }), null);
});

test('the typed answer: one path, the evidence a station knows — T, H after a hint, L (pct) for a sentence, W for a written one', () => {
  const d1 = daySteps(WEEKS[0], 1);
  const word = d1.find((s) => s.meta.type === 'flash').items[0], dict = d1.find((s) => s.meta.type === 'dictation').items[0], write = d1.find((s) => s.meta.type === 'write').items[0];
  const run = (it, ans, o) => { setBackend(memory()); store.load(); const F = stubFlow(), g = { id: 'gate:t', locks: 0, queue: [] }, item = { ...it, _tries: 0, _form: null }; const r = LearnFlow.prototype._judgeRecord.call(F, g, item, prompt(item), ans, o); return { r, leaf: leafOf(it.id), locks: g.locks, queue: g.queue.length }; };
  const A = run(word, word.en); assert.equal(A.r.r.ok, true); assert.deepEqual(A.leaf, [1, 'T']);
  const H = run(word, word.en, { hinted: true }); assert.deepEqual(H.leaf, [1, 'H'], 'the keyboard\'s 提示 → H');
  const Hw = run(word, 'xxxx', { hinted: true }); assert.deepEqual(Hw.leaf, [0, 'H']); assert.equal(Hw.locks, 1); assert.equal(Hw.queue, 1, 'the miss comes back (reworded: the M1 choice)');
  const card = run(word, word.en, undefined); assert.deepEqual(card.leaf, A.leaf, 'no options object: exactly the card\'s call');
  const D = run(dict, dict.en); assert.equal(D.r.r.ok, true); assert.deepEqual(D.leaf, [100, 'L']);
  const Dp = run(dict, dict.en.split(' ').slice(0, -1).join(' ')); assert.equal(Dp.r.r.pct > 0 && Dp.r.r.pct < 100, true); assert.deepEqual(Dp.leaf, [Dp.r.r.pct, 'L'], 'the dictation percent is the leaf');
  const W = run(write, write.en); assert.equal(W.r.r.ok, true); assert.deepEqual(W.leaf, [1, 'W']);
  const S = run(write, write.en, { self: true }); assert.deepEqual(S.leaf, [1, 'S']);
});

test('the beat items of the three weeks: 听辨对子 174 (2 pads) · 音标 96 (4 pads), labels in option order, the reshuffled retry still 2 / 4', () => {
  const n = { pair: 0, sym: 0 };
  for (const w of WEEKS) for (const d of w.days) for (const s of daySteps(w, d.n)) for (const it of s.items) {
    const p = prompt(it);
    if (!isBeatItem(it, p)) { assert.ok(!(it.meta.kind === 'pair' || it.meta.kind === 'sym'), it.id); continue; }
    n[it.meta.kind]++;
    const L = padLabels(p);
    assert.equal(L.length, it.meta.kind === 'pair' ? 2 : 4);
    L.forEach((l, i) => assert.equal(l.en, p.options[i].text));
    const a = LearnFlow.prototype._altPrompt.call({ play: true }, it);
    assert.ok(isBeatItem(it, a) && a._perm, 'the retry: the same pads, reshuffled');
    assert.equal(canPlayM1(it, p), false, 'never an ink target');
  }
  assert.deepEqual(n, { pair: 174, sym: 96 });
});

test('the boards on the way to a gate (wire/boards.js gateSpecs): words 5 a board, sounds 2, the lesson, the passage; never more than BOARDS_MAX', () => {
  const plan = (w, d) => Object.assign(planDay(w, d, 'puzzle'), { weekRef: w, day: d });   // (buildLearn adds weekRef / day to a level)
  const P = plan(WEEKS[0], 1), by = Object.fromEntries(P.gates.map((g) => [g.design.mechanic, gateSpecs(g, P)]));
  assert.equal(by['word-board'].length, 5); assert.equal(by['word-board'][0].rows.length, 5); assert.equal(by['word-board'][0].kind, 'words');
  assert.equal(by['symbol-door'].length, 4); assert.equal(by['symbol-door'][0].kind, 'sounds');
  assert.equal(by['grammar-board'].length, 1); assert.equal(by['grammar-board'][0].kind, 'lesson'); assert.ok(by['grammar-board'][0].blocks.length > 0);
  assert.equal(by['reading-room'].length, 1); assert.equal(by['reading-room'][0].kind, 'passage'); assert.ok(by['reading-room'][0].tts.length > 50);
  assert.equal(by['dictation-pool'].length, 0); assert.equal(by['pair-fork'].length, 0); assert.equal(by['flash-type'].length, 0);
  const R = plan(WEEKS[0], 7), sym = R.gates.find((g) => g.design.mechanic === 'symbol-door');
  assert.equal(sym.items.length, 48); assert.equal(gateSpecs(sym, R).length, BOARDS_MAX, 'the review day\'s 48 sounds: capped');
  for (const w of WEEKS) for (const d of w.days) { const Q = plan(w, d.n); for (const g of Q.gates) { const n = gateSpecs(g, Q).length; assert.ok(n <= BOARDS_MAX); if (['word-board', 'symbol-door', 'grammar-board', 'reading-room'].includes(g.design.mechanic)) assert.ok(n >= 1, w.id + ' d' + d.n + ' ' + g.design.mechanic); } }
});

test('touch.js lets the game keyboard and the reading strip keep their touches; the flow asks the host, judges in one place', () => {
  const touch = readFileSync(new URL('../../src/core/touch.js', import.meta.url), 'utf8');
  const at = touch.indexOf('PlayKeys.owns(e) || ReadStrip.owns(e)');
  assert.ok(at > 0 && at < touch.indexOf('swipe hook (src/learn/play/runner'), 'before the swipe hook, before the buttons');
  const flow = readFileSync(new URL('../../src/learn/flow.js', import.meta.url), 'utf8');
  assert.ok(/new PlayHost\(this\)/.test(flow));
  for (const f of ['wire/type.js', 'wire/beat.js', 'wire/flip.js', 'wire/boards.js', 'host.js', 'cam.js']) {
    const src = readFileSync(new URL('../../src/learn/play/' + f, import.meta.url), 'utf8');
    assert.ok(!/recordFirst|judge\(/.test(src.replace(/_judgeRecord/g, '')), f + ': judges nothing itself — flow._judgeRecord only');
  }
  Object.keys(MECHANICS).forEach((k) => assert.ok(MECHANICS[k].zh));
});
