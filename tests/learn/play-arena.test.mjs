// 题即玩法 play-5 (src/learn/play/arena/, src/learn/forms/duel.js + boss.js; docs/PLAY.md §5.3, §5.4, LEARN §24): the arena's
// pure parts and its evidence contract —
//   · canPlayArena / arenaKind: every item a duel day / a quiz / the boss plan asks has a play (ink targets for every
//     choice kind — 音标 and 听辨对子 too, the 对抗赛 / Boss columns of PLAY §4 — the rig for anything typed); only a flip card is a card
//   · the duel's and the boss's _judgeRecord write the same leaf as the puzzle's for the same answer; a hint → H; the
//     boss's claim → S; a held sentence writes nothing until she decides
//   · the arena's 回炉: a missed 单词卡 is a choice of ink balls, a missed 听写句 the same dictation slowly, a missed 写句 typed again
//   · the cluster arithmetic: locals ↔ world round the anchor in any camera basis; the boss's sockets per option count; the
//     option ball's radius on the screen
//   · the sources: no match.paused / learn.hold in the arena files, judging only through _judgeRecord
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
import { planDay, bossPlan, quizPlan } from '../../src/learn/design.js';
import { canPlayArena, arenaKind, weakSockets, WEAK_SOCKETS, clusterLocals, cameraPositions, orbitBasis, bossBallRadius } from '../../src/learn/play/arena/m1.js';
import { arenaAltPrompt, wordPool } from '../../src/learn/play/arena/alt.js';
import { canClaim } from '../../src/learn/forms/common.js';
const { LearnFlow } = await import('../../src/learn/flow.js');
const { DuelFlow } = await import('../../src/learn/forms/duel.js');
const { BossFlow } = await import('../../src/learn/forms/boss.js');

function memory() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; }
const WEEKS = [await loadWeek(1), await loadWeek(2), await loadWeek(3)];
const leafOf = (id) => { const ev = store.evidence(); for (const doc of Object.values(ev)) { const d = doc.it[id]; if (d) { const day = Object.values(d)[0]; return Object.values(day)[0]; } } return null; };
const items = (plan) => plan.gates.flatMap((g) => g.items);
const stubDuel = () => ({ P: LEARN.puzzle, D: LEARN.duel, firsts: 0, firstRight: 0, right: new Set(), streak: 0, rightN: 0, relearn: [], relearnRight: 0, shield: false, bag: [], model: { duelCadence: 6 }, ui: { say() {}, setBag() {} }, match: { local: { pos: { x: 0, y: 0, z: 0 }, special: 0, specialCost: () => 100, character: {} } }, Z: null, _emit() {}, _flood() { return [0, 0, 0]; }, _onRight() { this.onRight = (this.onRight || 0) + 1; } });
const stubBoss = () => ({ P: LEARN.puzzle, B: LEARN.boss, firsts: 0, firstRight: 0, right: new Set(), streak: 0, rightN: 0, relearn: [], relearnRight: 0, bag: [], plan: { phases: [{ id: 'W', hp: [0.33, 0.1], items: [1, 2, 3] }] }, perPhase: { W: { asked: 0, right: 0, firstRight: 0 } }, boss: { maxHp: 1000 }, ui: { say() {}, setBag() {} }, match: { local: { special: 0, specialCost: () => 100, character: {} } }, _emit() {}, _hit() {}, _onRight() {}, _bossMove() {} });
const stubPuzzle = () => ({ P: LEARN.puzzle, firsts: 0, right: new Set(), play: true, _emit() {}, _styleGates() {} });
const gate = (item) => ({ id: 'g', queue: [], locks: 0, items: [item] });

test('canPlayArena / arenaKind: every item a duel day, the quiz and the boss plan ask has a play — choices are ink targets (音标 / 听辨 too), typed items the rig; only a flip card is a card', () => {
  const n = { m1: 0, type: 0, banner: 0 }, kinds = new Set();
  for (const w of WEEKS) for (const d of w.days) {
    for (const it of items(planDay(w, d.n, 'duel'))) {
      const item = { ...it, _tries: 0, _form: null }, p = prompt(item), k = arenaKind(item, p);
      kinds.add(it.meta.kind + '/' + it.meta.input);
      assert.ok(k === 'm1' || k === 'type', `${w.id} d${d.n} ${it.id} ${it.meta.kind}: ${k}`);
      if (k === 'm1') { n.m1++; assert.ok(p.options.length >= 2 && p.options.length <= 4); } else n.type++;
    }
    // the review day's words as flip cards: the card (M8 is the puzzle's; no duel day plans them)
    const B = bossPlan(w);
    for (const ph of B.phases) if (ph.id !== 'S') for (const ref of ph.items) { const it = items(planDay(w, 1, 'duel')).find((x) => x.id === ref.id) || null; if (it) assert.ok(arenaKind(it, prompt(it)) !== null, `boss ${ref.id}`); }
  }
  assert.ok(kinds.has('sym/choice') && kinds.has('pair/choice') && kinds.has('read/choice') && kinds.has('word/type') && kinds.has('dict/type'), [...kinds].join(' '));
  assert.ok(n.m1 > 900 && n.type > 1000, JSON.stringify(n));
  const q = quizPlan(WEEKS[0], 1, []);
  assert.equal(q.items.length, LEARN.quiz.n);
  // a flip card and a typed rewording of a choice are not arena plays; a 4-plank choice neither
  assert.equal(arenaKind({}, { type: 'flip', _flip: true }), null);
  assert.equal(arenaKind({}, { type: 'typed', _alt: 'typed-of-choice' }), 'type');
  assert.equal(canPlayArena({}, { type: 'choice', options: [1, 2, 3, 4].map((i) => ({ text: 'She goes to an English class after work on Monday ' + i, zh: '' })) }), false);
  assert.equal(canPlayArena({}, { type: 'choice', options: [{ text: 'a', zh: '' }, { text: '', zh: '' }] }), false);
});

test('the duel\'s _judgeRecord: the same leaf as the puzzle\'s for a word, a pair, a reshuffled retry; first of the day once; a 墨雨 hint → H; the lock / the retry / the 回炉 as the card had', async () => {
  const w = WEEKS[0], day = items(planDay(w, 6, 'duel'));
  const word = day.find((it) => it.meta.kind === 'word' && it.meta.input === 'choice'), pair = day.find((it) => it.meta.kind === 'pair'), sym = day.find((it) => it.meta.kind === 'sym');
  for (const [it, ok] of [[word, true], [pair, false], [sym, true], [word, false]]) {
    const ansOf = (p) => { const r = p._perm ? p._perm.indexOf(it.answer) : it.answer; return ok ? r : (r + 1) % p.options.length; };
    // the puzzle's path
    setBackend(memory()); const F1 = stubPuzzle(), i1 = { ...it, _tries: 0, _form: null }, g1 = gate(i1), p1 = prompt(i1);
    const o1 = LearnFlow.prototype._judgeRecord.call(F1, g1, i1, p1, ansOf(p1)); const l1 = leafOf(it.id);
    // the duel's
    setBackend(memory()); const F2 = stubDuel(), i2 = { ...it, _tries: 0, _form: null }, g2 = gate(i2), p2 = prompt(i2);
    const o2 = DuelFlow.prototype._judgeRecord.call(F2, g2, i2, p2, ansOf(p2)); const l2 = leafOf(it.id);
    assert.deepEqual(l2, l1, `${it.id} ok=${ok}: the same leaf ${JSON.stringify(l2)} vs ${JSON.stringify(l1)}`);
    assert.equal(o2.r.ok, o1.r.ok); assert.equal(o2.first, true); assert.equal(o2.again, o1.again);
    assert.equal(g2.locks, g1.locks); assert.equal(g2.queue.length, g1.queue.length);
    if (!ok) { assert.equal(i2._form, 'alt'); assert.equal(F2.streak, 0); }
    else { assert.equal(F2.streak, 1); assert.equal(F2.firstRight, 1); }
    // again today: not the first
    const o3 = DuelFlow.prototype._judgeRecord.call(F2, g2, i2, p2, ansOf(p2));
    assert.equal(o3.first, false);
  }
  // a reshuffled retry maps through p._perm exactly as the card's button does
  setBackend(memory()); const F = stubDuel(); const it = { ...word, _tries: 1, _form: 'alt' }; const perm = it.options.map((_, i) => i).reverse();
  const p = { ...prompt(it), options: perm.map((i) => prompt(it).options[i]), _perm: perm };
  const o = DuelFlow.prototype._judgeRecord.call(F, gate(it), it, p, perm.indexOf(it.answer));
  assert.equal(o.r.ok, true); assert.deepEqual(leafOf(it.id).slice(0, 2), [1, 'L']);
  // a hint (墨雨 or the keyboard's 提示): the leaf is H
  setBackend(memory()); const wt = day.find((x) => x.meta.kind === 'word' && x.meta.input === 'type'); const pt = prompt(wt);
  DuelFlow.prototype._judgeRecord.call(stubDuel(), gate(wt), wt, pt, (wt.meta && wt.meta.ref) || wt.en, { hinted: true });
  assert.equal(leafOf(wt.id)[1], 'H');
  setBackend(memory()); DuelFlow.prototype._judgeRecord.call(stubDuel(), gate(wt), wt, { ...pt, _hinted: true }, (wt.meta && wt.meta.ref) || wt.en);
  assert.equal(leafOf(wt.id)[1], 'H');
  setBackend(memory()); DuelFlow.prototype._judgeRecord.call(stubDuel(), gate(wt), wt, pt, (wt.meta && wt.meta.ref) || wt.en);
  assert.equal(leafOf(wt.id)[1], 'T');
});

test('the boss\'s _judgeRecord: the W sentence — right → W; a near miss is HELD (nothing written, no move) until she decides: the claim → S (ok), going on → W (the miss, the boss\'s move); a hit / a move only once', async () => {
  const w = WEEKS[0], B = bossPlan(w);
  const byId = new Map(); for (const d of w.days) for (const s of daySteps(w, d.n)) for (const it of s.items) byId.set(it.id, it);
  const W = B.phases.find((p) => p.id === 'W'), it0 = W.items.map((r) => byId.get(r.id)).find((it) => it && (it.meta.ref || it.en) === 'My mother is kind.');
  assert.ok(it0 && it0.meta.input === 'write', 'the W phase holds the write-wall sentences');
  const item = { ...it0, _tries: 0, _form: null }, p = prompt(item), ref = item.meta.ref || item.en;
  // right
  setBackend(memory()); let F = stubBoss(); let hits = 0, moves = 0; F._hit = () => hits++; F._bossMove = () => moves++;
  let o = BossFlow.prototype._judgeRecord.call(F, { ...gate(item), phase: 'W' }, item, p, ref);
  assert.equal(o.r.ok, true); assert.equal(leafOf(item.id)[1], 'W'); assert.equal(hits, 1); assert.equal(moves, 0); assert.equal(o.held, undefined);
  // a near miss — mum for mother (claim.test.mjs: the meaning is there, no key form wrong): held
  const near = 'My mum is kind.';
  setBackend(memory()); F = stubBoss(); hits = 0; moves = 0; F._hit = () => hits++; F._bossMove = () => moves++; F._pendingMove = false;
  const i2 = { ...item }, g2 = { ...gate(i2), phase: 'W' };
  o = BossFlow.prototype._judgeRecord.call(F, g2, i2, p, near);
  assert.equal(o.held, true); assert.equal(leafOf(item.id), null, 'held: nothing written'); assert.equal(hits, 0); assert.equal(g2.locks, 0); assert.equal(F._pendingMove, false);
  // she claims → S, a hit
  const oc = BossFlow.prototype._judgeRecord.call(F, g2, i2, p, near, { decided: true, claim: true });
  assert.equal(oc.r.ok, true); assert.equal(oc.self, true); assert.deepEqual(leafOf(item.id).slice(0, 2), [1, 'S']); assert.equal(hits, 1); assert.equal(F._pendingMove, false);
  // she goes on instead → the miss as W, the boss's move pending, the retry queued
  setBackend(memory()); F = stubBoss(); hits = 0; F._hit = () => hits++; F._pendingMove = false;
  const i3 = { ...item }, g3 = { ...gate(i3), phase: 'W' };
  BossFlow.prototype._judgeRecord.call(F, g3, i3, p, near);
  const og = BossFlow.prototype._judgeRecord.call(F, g3, i3, p, near, { decided: true, claim: false });
  assert.equal(og.r.ok, false); assert.deepEqual(leafOf(item.id).slice(0, 2), [0, 'W']); assert.equal(hits, 0); assert.equal(F._pendingMove, true); assert.equal(g3.locks, 1); assert.equal(og.again, true);
  // a plain miss on the retry (not claimable on the 回炉 form) writes at once
  setBackend(memory()); F = stubBoss(); F._pendingMove = false;
  const i4 = { ...item, _tries: 1, _form: 'alt', _relearn: true }, g4 = { ...gate(i4), phase: 'W' };
  const o4 = BossFlow.prototype._judgeRecord.call(F, g4, i4, p, 'zzz');
  assert.equal(o4.held, undefined); assert.equal(o4.r.ok, false); assert.equal(leafOf(item.id)[0], 0);
});

test('the arena\'s 回炉: a missed 单词卡 → a choice among ink balls only (the pool is the form\'s gates), a missed 听写句 → the same dictation slowly, a missed 写句 → typed again with the reference\'s Chinese; a choice is left to the base (reshuffled)', () => {
  const w = WEEKS[0], P = planDay(w, 6, 'duel'), day = items(P);
  const wt = day.find((it) => it.meta.kind === 'word' && it.meta.input === 'type'), dict = day.find((it) => it.meta.kind === 'dict'), word = day.find((it) => it.meta.kind === 'word' && it.meta.input === 'choice');
  const p1 = arenaAltPrompt(P.gates, wt);
  assert.equal(p1.type, 'choice'); assert.equal(p1._alt, 'choice-of-typed');
  assert.ok(p1.options.length >= 2 && p1.options.length <= 4);
  assert.ok(p1.options.some((o) => o.text === ((wt.meta && wt.meta.ref) || wt.en)), 'the right word is among them');
  assert.ok(canPlayArena(wt, p1), 'the 回炉 choice is ink balls');
  for (const o of p1.options) assert.ok(/^[A-Za-z][A-Za-z' -]*$/.test(o.text), `a word, not a sentence / Chinese: ${o.text}`);
  const p2 = arenaAltPrompt(P.gates, dict);
  assert.equal(p2.type, prompt(dict).type); assert.ok(p2._tip && p2._tip.slow); assert.ok(/慢/.test(p2.text));
  assert.equal(arenaKind(dict, p2), 'type');
  assert.equal(arenaAltPrompt(P.gates, word), null);
  // the boss's pool comes from its phases, not the (empty) level gates
  const B = bossPlan(w), byId = new Map(); for (const d of w.days) for (const s of daySteps(w, d.n)) for (const it of s.items) byId.set(it.id, it);
  const phases = B.phases.map((ph) => ({ items: ph.items.map((r) => byId.get(r.id)).filter(Boolean) }));
  const R = phases[1].items.find((it) => it.meta.kind === 'word' && it.meta.input === 'type');
  if (R) { const p3 = arenaAltPrompt(phases, R); assert.ok(p3 && p3.options.length >= 2, 'the boss\'s R phase has distractors'); }
  const Wr = phases[2].items[0], p4 = arenaAltPrompt(phases, Wr);
  assert.ok(p4 && p4.type !== 'choice' && /参考/.test(p4.zh), 'a missed sentence is typed again with the reference given');
  assert.ok(wordPool(P.gates, wt).length > 20);
});

test('the cluster: locals ↔ world round the anchor in any basis (the same pixels from wherever she looks); the boss\'s sockets by option count; the option ball\'s radius', () => {
  const objs = [{ x: 1, y: 3, z: -2, plate: { x: 1, y: 2.4, z: -2 } }, { x: -1.5, y: 3.2, z: -2.1, plate: { x: -1.5, y: 2.6, z: -2.1 } }, { x: 0.2, y: 4.4, z: -1.9, plate: { x: 0.2, y: 3.8, z: -1.9 } }];
  const anchor = { x: 0, y: 3.5, z: -2 };
  const B1 = { right: { x: 1, y: 0, z: 0 }, up: { x: 0, y: 1, z: 0 }, back: { x: 0, y: 0, z: 1 } };
  const L = clusterLocals(objs, anchor, B1);
  const back1 = cameraPositions(L, anchor, B1, []);
  for (let i = 0; i < objs.length; i++) for (const k of ['x', 'y', 'z']) { assert.ok(Math.abs(back1[i][k] - objs[i][k]) < 1e-6); assert.ok(Math.abs(back1[i].plate[k] - objs[i].plate[k]) < 1e-6); }
  // a camera turned 90° round the anchor: the cluster turns with it — the offsets along right / up / back are the same
  const B2 = { right: { x: 0, y: 0, z: -1 }, up: { x: 0, y: 1, z: 0 }, back: { x: 1, y: 0, z: 0 } };
  const back2 = cameraPositions(L, anchor, B2, []);
  const L2 = clusterLocals(back2, anchor, B2);
  for (let i = 0; i < L.length; i++) assert.ok(Math.abs(L2[i] - L[i]) < 1e-6, `local ${i}`);
  assert.ok(Math.abs(back2[0].z - (anchor.z - (objs[0].x - anchor.x))) < 1e-6, 'right became −z');
  // the boss's basis: horizontal, facing the camera; none when the camera is over it
  const b = { right: { x: 0, y: 0, z: 0 }, up: { x: 0, y: 0, z: 0 }, back: { x: 0, y: 0, z: 0 } };
  assert.equal(orbitBasis({ x: 10, y: 5, z: 0 }, { x: 0, y: 2, z: 0 }, b), true);
  assert.deepEqual([b.back.x, b.back.y, b.back.z], [1, 0, 0]); assert.deepEqual([b.up.x, b.up.y, b.up.z], [0, 1, 0]); assert.ok(Math.abs(b.right.z + 1) < 1e-9 && Math.abs(b.right.x) < 1e-9);
  assert.equal(orbitBasis({ x: 0.5, y: 9, z: 0 }, { x: 0, y: 2, z: 0 }, b), false);
  // sockets: distinct, the eyes first (the weak points she always sees), all in the model's socket list
  const ALL = ['eyeL', 'eyeR', 'belly', 'cannon', 'mouth', 'shellTop', 'hatch', 'crackL', 'crackR'];
  for (const n of [2, 3, 4]) { const s = weakSockets(n); assert.equal(s.length, n); assert.equal(new Set(s).size, n); assert.deepEqual(s.slice(0, 2), ['eyeL', 'eyeR']); for (const k of s) assert.ok(ALL.includes(k), k); }
  assert.deepEqual(weakSockets(5), WEAK_SOCKETS[4]); assert.equal(weakSockets(1).length, 2);
  // the ball: 30 px of radius at the socket's distance on a 844-px-tall screen, never under 0.5 m nor over 1.35 m
  const A = LEARN.arena;
  assert.ok(Math.abs(bossBallRadius(12, 844, 52) - Math.max(A.bossBall, Math.min(A.bossBallMax, A.bossPx * (2 * 12 * Math.tan((52 * Math.PI) / 360)) / 844))) < 1e-9);
  assert.equal(bossBallRadius(2, 844, 52), A.bossBall); assert.equal(bossBallRadius(80, 390, 52), A.bossBallMax);
});

test('the sources: the arena never pauses the match nor holds her (no match.paused = true, no hold = true), judges only through _judgeRecord; the forms\' card path goes through _judgeRecord too', () => {
  const root = new URL('../../src/learn/', import.meta.url);
  for (const f of ['play/arena/run.js', 'play/arena/type.js', 'play/arena/host.js', 'play/arena/targets.js', 'play/arena/m1.js', 'play/arena/alt.js']) {
    const src = readFileSync(new URL(f, root), 'utf8');
    assert.ok(!/paused\s*=\s*true/.test(src) && !/\.hold\s*=\s*true/.test(src), `${f}: never a pause / a hold`);
    assert.ok(!/recordFirst\(/.test(src) && !/\bjudge\(/.test(src) && !/judgeAnswer\(/.test(src), `${f}: no judging of its own`);
  }
  for (const f of ['forms/duel.js', 'forms/boss.js']) {
    const src = readFileSync(new URL(f, root), 'utf8');
    assert.equal((src.match(/recordFirst\(/g) || []).length, 1, `${f}: recordFirst once (in _judgeRecord)`);
    assert.ok(/_judgeRecord\(g, item, p, ans, o = \{\}\)/.test(src), `${f}: the override's signature`);
  }
});
