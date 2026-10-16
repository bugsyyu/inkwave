// src/learn/forms/common.js — the pure parts of the three forms (docs/LEVELS.md §2.2–§2.8): the race's lap and its
// checkpoints on a fixture graph and on every offline stage's real nav graph (built in Node: Level + Physics +
// NavGraph), the bots' dice and rubber band, the prop drops, the duel's flood radii, the boss's HP bands and time
// budgets, the 回炉 queue, the stars that never go down, the judge mapping on A's content, the boards and tips.
// 用法：node --test tests/learn/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWeek } from '../../src/learn/content.js';
import { store, setBackend } from '../../src/learn/store.js';
import { planDay, bossPlan, PROP_DROP, BOT_ANSWER, PROPS } from '../../src/learn/design.js';
import { LEARN, OFFLINE_MAPS } from '../../src/config.js';
import {
  astar, loopRoute, cumulative, placeAlong, fitGates, botRoll, rubberDelay, finishOrder, drawProp, propOnRight, useProp, duelFlood, streakKind,
  phaseOfHp, bossDamage, phaseBudget, phaseTimeTotal, relearnPlan, starsOf, readStars, writeStars, shortenLevel, shortenBoss, fmtClock,
  judgeAnswer, rightAnswerOf, boardOf, relearnTip,
} from '../../src/learn/forms/common.js';

function memory() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; }
const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

// a fixture nav graph: a W × H grid of 1 m walkable cells with a wall down the middle (x = W/2) from z = 2 to H − 3, so
// the far end is reached by the left lane or the right lane; node 0 is the near end (the spawn), the goal the far end
function gridNav(W = 11, H = 30) {
  const nodes = [], at = new Map();
  for (let z = 0; z < H; z++) for (let x = 0; x < W; x++) {
    if (x === (W >> 1) && z >= 2 && z <= H - 3) continue;   // the wall
    at.set(x + ',' + z, nodes.length);
    nodes.push({ id: nodes.length, x, y: 0, z, nb: [], zone: -1, wet: 0 });
  }
  for (const n of nodes) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const j = at.get((n.x + dx) + ',' + (n.z + dz));
    if (j != null) n.nb.push({ to: j, cost: Math.hypot(dx, dz), type: 'walk' });
  }
  const start = at.get((W >> 1) + ',0'), goal = at.get((W >> 1) + ',' + (H - 1));
  return { nav: { nodes, step: 1, valid: null }, start, goal, W, H };
}

test('loopRoute on a fixture graph: out by one lane, back by the other (little shared), the loop closes at the start; checkpoints spaced along it; extra gates fold into the last', () => {
  const { nav, start, goal, W } = gridNav();
  const R = loopRoute(nav, start, goal, { avoid: 3 });
  assert.ok(R && R.out[0] === start && R.out[R.out.length - 1] === goal, 'out: spawn → far end');
  assert.equal(R.back[0], goal); assert.equal(R.back[R.back.length - 1], start, 'back: far end → spawn');
  assert.equal(R.loop[0], start); assert.equal(R.loop[R.loop.length - 1], start, 'a lap');
  assert.equal(R.loop.length, R.out.length + R.back.length - 1);
  const side = (ids) => { const mid = ids.slice(4, -4).map((id) => nav.nodes[id].x); return mid.every((x) => x < (W >> 1)) ? 'L' : mid.every((x) => x > (W >> 1)) ? 'R' : 'mixed'; };
  assert.notEqual(side(R.out), side(R.back), 'the two lanes differ: ' + side(R.out) + ' / ' + side(R.back));
  assert.ok(R.shared < 0.3, 'the way back shares little of the way out: ' + R.shared);
  const cum = cumulative(nav.nodes, R.loop);
  assert.ok(cum[cum.length - 1] > 50, 'a lap of the grid is long: ' + cum[cum.length - 1]);
  const P = placeAlong(cum, 4, { first: 6, gap: 8 });
  assert.equal(P.fit, 4);
  for (let k = 1; k < P.at.length; k++) { assert.ok(P.at[k] > P.at[k - 1], 'in order'); assert.ok(P.s[k] - P.s[k - 1] >= 8 - 1.5, 'spaced ≥ gap: ' + P.s.join(',')); }
  assert.ok(P.s[0] >= 6 && P.s[P.s.length - 1] <= cum[cum.length - 1] - 8 + 1.5, 'first past the spawn, last before the line');
  // too short for ten: fewer fit, and the gates past the fit fold into the last one — no item lost
  const Q = placeAlong(cum, 10, { first: 6, gap: 20 });
  assert.ok(Q.fit < 10 && Q.fit >= 1);
  const defs = Array.from({ length: 10 }, (_, i) => ({ id: 'g' + i, items: [{ id: 'i' + i }] }));
  const fitted = fitGates(defs, Q.fit);
  assert.equal(fitted.length, Q.fit);
  assert.equal(fitted.reduce((n, g) => n + g.items.length, 0), 10, 'every item kept');
  assert.equal(fitted[fitted.length - 1].items.length, 10 - Q.fit + 1);
  // no route at all
  assert.equal(astar(nav, start, -1), null);
});

test('loopRoute on every offline stage\'s real nav graph (Level + Physics + NavGraph in Node): a lap from the spawn, back lane ≠ out lane, the day\'s checkpoints fit', async () => {
  const { MAP_LAYOUTS } = await import('../../src/world/maps.js');
  const { Level } = await import('../../src/world/level.js');
  const { Physics } = await import('../../src/game/physics.js');
  const { NavGraph } = await import('../../src/game/nav.js');
  const { layoutFor } = await import('../../src/world/variants.js');
  const w1 = await loadWeek(1);
  const report = [];
  for (const m of OFFLINE_MAPS) {
    const L = new Level(layoutFor(MAP_LAYOUTS[m.layout || m.id], 'turf'), []), P = new Physics(L), nav = new NavGraph(L, P);
    const pad0 = L.spawnPads[0], pad1 = L.spawnPads[1];
    const start = nav.nearest({ x: pad0.x, y: pad0.y, z: pad0.z }, 2, true);
    const dx = -pad1.x, dz = -pad1.z, dl = Math.hypot(dx, dz) || 1, pull = (L.spawnBarrier || 4) + 3;
    const goal = nav.nearest({ x: pad1.x + (dx / dl) * pull, y: pad1.y, z: pad1.z + (dz / dl) * pull }, 3, false);
    assert.ok(start >= 0 && goal >= 0, m.id + ': spawn and far side on the graph');
    const R = loopRoute(nav, start, goal, { avoid: LEARN.race.laneAvoid });
    assert.ok(R, m.id + ': a lap exists');
    assert.equal(R.loop[0], start); assert.equal(R.loop[R.loop.length - 1], start);
    const cum = cumulative(nav.nodes, R.loop), len = cum[cum.length - 1];
    assert.ok(len > 60, m.id + ': lap length ' + len.toFixed(0));
    assert.ok(R.shared < 0.6, m.id + ': the way back is mostly its own lane (shared ' + R.shared + ')');
    for (const id of R.loop) assert.ok(!(nav.nodes[id].zone === 1), m.id + ': never through the other side\'s spawn zone');
    const level = planDay(w1, 3, 'race');   // a race day: 7 gates
    const Pc = placeAlong(cum, level.gates.length, { first: LEARN.race.firstGateMin, gap: LEARN.race.gap });
    assert.ok(Pc.fit >= 4, m.id + ': at least four checkpoints fit a lap (' + Pc.fit + ' of ' + level.gates.length + ')');
    report.push(`${m.id}: lap ${len.toFixed(0)} m, out ${R.out.length} / back ${R.back.length} nodes, shared ${R.shared}, fit ${Pc.fit}/${level.gates.length}`);
  }
  assert.equal(report.length, OFFLINE_MAPS.length);
});

test('bots: the die (correct rate, uniform delay), the rubber band (capped), the finish order', () => {
  const N = BOT_ANSWER.normal;
  let r = botRoll(N, seq([0.1, 0.0]));
  assert.equal(r.ok, true); assert.equal(r.delay, N.delay[0]);
  r = botRoll(N, seq([0.99, 1 - 1e-9]));
  assert.equal(r.ok, false); assert.ok(Math.abs(r.delay - N.delay[1]) < 0.01);
  let hits = 0; const rnd = seq(Array.from({ length: 1000 }, (_, i) => (i + 0.5) / 1000));
  for (let i = 0; i < 1000; i++) { const x = botRoll(N, rnd); if (x.ok) hits++; rnd(); }
  assert.ok(Math.abs(hits / 1000 - N.correct) < 0.03, 'about ' + N.correct + ': ' + hits / 1000);
  assert.equal(rubberDelay(N, 0), 0); assert.equal(rubberDelay(N, 1), N.rubber); assert.equal(rubberDelay(N, 5), N.rubber * N.rubberCap);
  assert.equal(rubberDelay(BOT_ANSWER.hard, 3), BOT_ANSWER.hard.rubber * BOT_ANSWER.hard.rubberCap);
  assert.deepEqual(finishOrder([{ id: 'a', cp: 2, progress: 10 }, { id: 'me', cp: 3, finish: 61 }, { id: 'b', cp: 7, finish: 58 }, { id: 'c', cp: 2, progress: 30 }]), ['b', 'me', 'c', 'a']);
});

test('props: the race draw never hands out a streak prop, stops when the bag is full; streak 3 = shield, 5 = lane; useProp names the effect', () => {
  const ids = new Set();
  for (let i = 0; i < 400; i++) ids.add(drawProp('race', Math.random, []));
  ids.delete(null);
  assert.ok(!ids.has('shield') && !ids.has('lane'), [...ids].join(','));
  assert.ok(ids.has('leap') && ids.has('rain') && ids.has('echo'), 'the drop table\'s props come out');
  assert.equal(drawProp('race', Math.random, ['rain', 'rain', 'rain']), null, 'bag full (hold ' + PROP_DROP.race.hold + ')');
  assert.equal(drawProp('puzzle', () => 0, []), 'rain'); assert.equal(drawProp('puzzle', () => 0.99, []), 'echo');
  assert.equal(propOnRight('race', 1, 1, []).drop !== null, true, 'every right drops one in a race');
  assert.equal(propOnRight('duel', 1, 1, []).drop, null); assert.ok(propOnRight('duel', 3, 3, []).drop, 'every third in a duel');
  assert.equal(propOnRight('race', 3, 3, ['rain', 'rain', 'rain']).streak, 'shield');
  assert.equal(propOnRight('race', 5, 5, []).streak, 'lane');
  assert.equal(propOnRight('race', 4, 4, []).streak, null);
  assert.equal(propOnRight('duel', 3, 3, []).streak, null, 'a duel\'s streak fills the gauge instead');
  assert.deepEqual(Object.keys(useProp('leap')).sort(), ['effect', 'evidence', 'id', 'sfx', 'zh']);
  assert.equal(useProp('rain').evidence, 'H'); assert.equal(useProp('leap').effect, 'skip'); assert.equal(useProp('nope'), null);
  Object.keys(PROPS).forEach((id) => assert.ok(useProp(id).zh));
});

test('effects: the duel\'s flood radius grows with the streak to the cap; streak kinds', () => {
  const [base, per, cap] = LEARN.duel.flood;
  assert.equal(duelFlood(0), base); assert.equal(duelFlood(1), base); assert.equal(duelFlood(2), base + per); assert.equal(duelFlood(3), base + 2 * per);
  assert.equal(duelFlood(9), cap); assert.equal(duelFlood(50), cap);
  assert.equal(streakKind(3), 'streak3'); assert.equal(streakKind(5), 'streak5'); assert.equal(streakKind(4), null); assert.equal(streakKind(0), null);
});

test('boss: HP fraction → phase, damage per right = the band over its questions, time budgets from config (14 / 14 / 10 / 6), the shortened plan', async () => {
  setBackend(memory()); store.load();
  const w1 = await loadWeek(1), B = bossPlan(w1);
  assert.equal(phaseOfHp(1, B), 'L'); assert.equal(phaseOfHp(0.7, B), 'L'); assert.equal(phaseOfHp(0.66, B), 'R'); assert.equal(phaseOfHp(0.5, B), 'R');
  assert.equal(phaseOfHp(0.33, B), 'W'); assert.equal(phaseOfHp(0.2, B), 'W'); assert.equal(phaseOfHp(0.1, B), 'S'); assert.equal(phaseOfHp(0.01, B), 'S'); assert.equal(phaseOfHp(0, B), 'S');
  assert.ok(Math.abs(bossDamage(B, 'L') * 20 - 0.34) < 1e-6); assert.ok(Math.abs(bossDamage(B, 'R') * 20 - 0.33) < 1e-6);
  assert.ok(Math.abs(bossDamage(B, 'W') * 3 - 0.23) < 1e-3, '3 sentences share the W band');
  assert.ok(Math.abs(bossDamage(B, 'S') * 6 - 0.10) < 1e-3, '6 cards share the last 10 %');
  assert.equal(phaseBudget(B, 'L'), 840); assert.equal(phaseBudget(B, 'W'), 600); assert.equal(phaseBudget(B, 'S'), 360);
  assert.equal(phaseTimeTotal(B), 2640, '44 minutes');
  assert.equal(B.phases[0].minutes, 14); assert.equal(B.phases[3].minutes, 6, 'design.js reads config.js LEARN.boss.phaseTime');
  const S = shortenBoss(B);
  assert.ok(S.short && S.phases.every((p) => p.items.length <= 2));
  assert.ok(Math.abs(S.phases[0].hitPerRight * 2 - 0.34) < 1e-6, 'two questions share the band');
  assert.equal(phaseBudget(S, 'L'), 60); assert.equal(phaseTimeTotal(S), 240);
});

test('回炉 and stars: the queue dedupes and caps at LEARN.relearnMax; stars never go down; the trophy sits beside them; fmtClock', () => {
  const items = Array.from({ length: 20 }, (_, i) => ({ id: 'x' + (i % 15) }));
  const q = relearnPlan(items);
  assert.equal(q.length, LEARN.relearnMax); assert.equal(new Set(q.map((x) => x.id)).size, q.length);
  assert.equal(relearnPlan([null, { id: 'a' }, { id: 'a' }]).length, 1);
  assert.equal(starsOf({ gates: 2, visited: 2, signs: null, scored: 10, firstRight: 10, relearn: 0, relearnRight: 0 }), 3);
  assert.equal(starsOf({ gates: 2, visited: 2, signs: null, scored: 10, firstRight: 8, relearn: 1, relearnRight: 1 }), 2);
  assert.equal(starsOf({ gates: 2, visited: 1, signs: null, scored: 10, firstRight: 10 }), 0);
  const be = memory();
  assert.deepEqual(writeStars('w1d2', 2, be, { trophy: 1 }), { before: 0, after: 2 });
  assert.deepEqual(writeStars('w1d2', 1, be), { before: 2, after: 2 }, 'a worse replay keeps the stars');
  assert.deepEqual(writeStars('w1d2', 3, be), { before: 2, after: 3 });
  const S = readStars(be);
  assert.equal(S.stars.w1d2, 3); assert.equal(S.walked.w1d2, true); assert.equal(S.trophies.w1d2, 1);
  assert.equal(fmtClock(0), '0:00'); assert.equal(fmtClock(61.4), '1:01'); assert.equal(fmtClock(840), '14:00');
});

test('judgeAnswer maps B\'s reworded forms onto A\'s judge; rightAnswerOf names the right option / text; boards and 回炉 tips on w1d1', async () => {
  setBackend(memory()); store.load();
  const w1 = await loadWeek(1), L = planDay(w1, 1, 'race');
  const word = L.gates.find((g) => g.stepId === 'w1d1:a2').items[0];
  const p = { type: 'choice', options: word.options.map((o) => ({ text: o.zh, zh: '' })) };
  assert.equal(judgeAnswer(word, p, word.answer).ok, true);
  assert.equal(judgeAnswer(word, p, (word.answer + 1) % word.options.length).ok, false);
  assert.equal(rightAnswerOf(word, p), word.answer);
  const perm = word.options.map((_, i) => i).reverse();
  const pp = { ...p, _perm: perm };
  assert.equal(rightAnswerOf(word, pp), perm.indexOf(word.answer));
  assert.equal(judgeAnswer(word, pp, perm.indexOf(word.answer)).ok, true, 'a reshuffled index maps back');
  const card = L.gates.find((g) => g.stepId === 'w1d1:b4').items[0];
  assert.equal(judgeAnswer(card, { type: 'type' }, card.en).ok, true); assert.equal(judgeAnswer(card, { type: 'type' }, 'zzz').ok, false);
  assert.equal(rightAnswerOf(card, { type: 'type' }), card.en);
  const alt = { type: 'choice', _alt: 'choice-of-typed', options: [{ text: 'zzz' }, { text: card.en }] };
  assert.equal(rightAnswerOf(card, alt), 1); assert.equal(judgeAnswer(card, alt, 1).ok, true);
  // boards: words with IPA + meaning, sounds with tip + examples, the grammar lesson's lines, the passage; none for dictation / pairs / cards
  const by = (s) => L.gates.find((g) => g.stepId === s);
  const wb = boardOf(by('w1d1:a2'), L);
  assert.equal(wb.rows.length, 25); assert.ok(wb.rows.every((r) => r.en && r.zh && r.tts)); assert.ok(wb.rows.some((r) => r.ipa), 'IPA on the word board');
  const sb = boardOf(by('w1d1:a1'), L);
  assert.equal(sb.rows.length, 8); assert.ok(sb.rows.every((r) => r.en.startsWith('/') && r.zh));
  const gb = boardOf(by('w1d1:a3'), L);
  assert.ok(gb.rows.length >= 1 && gb.rows.every((r) => r.text), 'the lesson lines');
  const rb = boardOf(by('w1d1:b2'), L);
  assert.ok(rb.rows[0].en && rb.rows[0].tts.length > 50, 'the passage is spoken');
  assert.equal(boardOf(by('w1d1:b1'), L), null); assert.equal(boardOf(by('w1d1:b3'), L), null); assert.equal(boardOf(by('w1d1:b4'), L), null);
  // tips
  assert.equal(relearnTip(by('w1d1:a1').items[0]).variant, 'tip');
  assert.equal(relearnTip(word).variant, 'flash-type');
  assert.equal(relearnTip(by('w1d1:b3').items[0]).speakBoth, true);
  assert.equal(relearnTip(by('w1d1:b1').items[0]).slow, true);
  assert.ok(relearnTip(by('w1d1:a3').items[0]).zh.startsWith('回炉：'));
  // the shortened level
  const S = shortenLevel(L);
  assert.equal(S.gates.length, 2); assert.ok(S.gates.every((g) => g.items.length === 2)); assert.equal(S.short, true);
  assert.equal(L.gates.length, 7, 'the original untouched');
});
