// src/learn/forms/duo.js — the two-player online forms' pure rules (docs/LEARN.md §10, §14): the shared queue (due lists
// merged, the longer list asking more; the day spread over its gates), the host's referee (the same question for both,
// the first right answer by each player's own time inks, a humanless side answers by its bots' dice, the question closes
// when everyone has answered or at the deadline), the results tally; coop2's roles, split prompts and ink pads (on the
// fixture graph and on a real stage's nav graph); the wire kinds. Also: versus2's queue on A's real week-1 content.
// 用法：node --test tests/learn/*.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));   // `three` → vendor/ (no npm install here)
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEARN } from '../../src/config.js';
import { loadWeek, daySteps } from '../../src/learn/content.js';
import { prompt } from '../../src/learn/engine.js';
import { planDay, BOT_ANSWER } from '../../src/learn/design.js';
import { judgeAnswer, rightAnswerOf, shortenLevel } from '../../src/learn/forms/common.js';
import {
  mergeDue, spreadGates, buildQueue, canRequeue, answerTime, Referee, settle, tally,
  rolesFor, splitPrompt, padSpots, padNodes, padsApart, padsHeld, LEARN_WIRE, validQ,
  seeded, seedOf, duoAltPrompt, duoMechanic, clueSpec,
} from '../../src/learn/forms/duo.js';
import { readFileSync } from 'node:fs';
import { store, setBackend } from '../../src/learn/store.js';
import { targetLabels } from '../../src/learn/play/m1.js';
import { arenaKind } from '../../src/learn/play/arena/m1.js';

const seq = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };

test('versus2 queue: due lists merge by share (the longer list asks more, a shared id once); the day spreads over its gates; due first up to dueShare, unknown ids skipped, n in all', () => {
  const a = ['a1', 'a2', 'a3', 'a4', 'a5', 'a6'], b = ['b1', 'b2'];
  const m = mergeDue([a, b]);
  assert.equal(m.length, 8);
  assert.deepEqual(m.slice(0, 4), ['a1', 'a2', 'b1', 'a3']);           // 3 : 1 at the front, by position fraction
  assert.deepEqual(mergeDue([['x', 'y'], ['y', 'z']]), ['x', 'y', 'z']);  // an id due for both comes once
  assert.deepEqual(mergeDue([a, b], 3), ['a1', 'a2', 'b1']);
  const gates = [{ items: [{ id: 'g1a' }, { id: 'g1b' }, { id: 'g1c' }] }, { items: [{ id: 'g2a' }] }, { items: [{ id: 'g3a' }, { id: 'g3b' }] }];
  assert.deepEqual(spreadGates(gates), ['g1a', 'g2a', 'g3a', 'g1b', 'g3b', 'g1c']);
  assert.deepEqual(spreadGates(gates, 4), ['g1a', 'g2a', 'g3a', 'g1b']);
  const q = buildQueue({ gates, due: ['zz', 'g3b', 'g1c', 'g2a'], has: (id) => id !== 'zz', n: 6, dueShare: 0.5 });
  assert.deepEqual(q.map((e) => e.id), ['g3b', 'g1c', 'g2a', 'g1a', 'g3a', 'g1b']);
  assert.ok(q.every((e) => e.alt === 0));
  const q2 = buildQueue({ gates, due: ['g3b', 'g1c', 'g2a', 'g1b'], n: 4, dueShare: 0.5 });
  assert.deepEqual(q2.map((e) => e.id), ['g3b', 'g1c', 'g1a', 'g2a']);   // at most half due; then the spread, no repeats
  // a miss comes back once (reworded), never twice, and not past the cap
  const Q = [{ id: 'a', alt: 0 }, { id: 'b', alt: 0 }];
  assert.equal(canRequeue(Q, Q[0], 2, 0.5), true);
  assert.equal(canRequeue([...Q, { id: 'a', alt: 1 }], Q[0], 2, 0.5), false);
  assert.equal(canRequeue(Q, { id: 'a', alt: 1 }, 2, 0.5), false);
  assert.equal(canRequeue([...Q, { id: 'c', alt: 0 }], Q[1], 2, 0.5), false);
  assert.equal(answerTime({ type: 'choice' }), LEARN.versus2.answerTime.choice);
  assert.equal(answerTime({ type: 'type' }), LEARN.versus2.answerTime.type);
});

test('versus2 referee: both get the question; the first right answer by OWN time inks (not the first to arrive), after the grace; the question closes when both have answered', () => {
  const humans = [{ pid: 'H', team: 0, name: 'Ann' }, { pid: 'G', team: 1, name: 'Bo' }];
  const R = new Referee({ humans, grace: 0.4 });
  R.open(1, 20, 100);
  assert.deepEqual(R.tick(100.5), []);
  // the host answers right at 6.0 s of its own time and is heard at once; the guest answered right at 5.8 s, heard 0.2 s later
  assert.ok(R.answer('H', true, 6000, 106.0));
  assert.deepEqual(R.tick(106.1), [], 'inside the grace: a faster answer may be in flight');
  assert.ok(R.answer('G', true, 5800, 106.2));
  const out = R.tick(106.2);
  assert.deepEqual(out.map((e) => e.k), ['ink', 'close']);
  assert.deepEqual({ win: out[0].win, by: out[0].by, ms: out[0].ms }, { win: 1, by: 'G', ms: 5800 });
  assert.deepEqual(out[1].res, [['H', 1], ['G', 1]]);
  assert.equal(R.answer('H', true, 1, 107), false, 'closed: nothing more counts');
  // one wrong, one right later: the ink waits for no grace once everyone is in
  R.open(2, 20, 200);
  R.answer('H', false, 2000, 202);
  assert.deepEqual(R.tick(202.1), []);
  R.answer('G', true, 9000, 209);
  const o2 = R.tick(209);
  assert.equal(o2[0].by, 'G'); assert.equal(o2[1].win, 1); assert.deepEqual(o2[1].res, [['H', 0], ['G', 1]]);
  // the ink is decided as soon as the grace passes, while the slower player still answers for their own evidence
  R.open(3, 20, 300);
  R.answer('H', true, 3000, 303);
  const o3a = R.tick(303.5);
  assert.deepEqual(o3a.map((e) => e.k), ['ink']); assert.equal(o3a[0].by, 'H');
  R.answer('G', true, 4000, 304); const o3b = R.tick(304);
  assert.deepEqual(o3b.map((e) => e.k), ['close']); assert.equal(o3b[0].win, 0);
  // nobody right, time runs out with one silent: no ink, the silent one is -1
  R.open(4, 10, 400);
  R.answer('G', false, 1000, 401);
  assert.deepEqual(R.tick(405), []);
  const o4 = R.tick(410.01);
  assert.deepEqual(o4.map((e) => e.k), ['ink', 'close']); assert.equal(o4[0].win, -1); assert.deepEqual(o4[1].res, [['H', -1], ['G', 0]]);
  // a time-out reported by the client ("none") is not a right answer even if ok came along
  R.open(5, 10, 500); R.answer('H', true, 10000, 510, true); R.answer('G', false, 2000, 502);
  const o5 = R.tick(510); assert.equal(o5[0].win, -1); assert.deepEqual(o5[1].res, [['H', -1], ['G', 0]]);
  // a player leaving is no longer waited for
  R.open(6, 20, 600); R.answer('H', true, 1000, 601); R.leave('G');
  const o6 = R.tick(601); assert.deepEqual(o6.map((e) => e.k), ['ink', 'close']); assert.equal(o6[0].by, 'H');
});

test('versus2 referee: a side with no human answers by its bots\' dice (BOT_ANSWER: chance + delay) — a faster right die wins the ink; settle() on its own', () => {
  const R = new Referee({ humans: [{ pid: 'H', team: 0, name: 'Ann' }], botTeams: [1], model: BOT_ANSWER.normal, rnd: seq([0.1, 0.0]), grace: 0.4 });
  R.open(1, 20, 0);
  assert.equal(R.cur.bots[0].ok, true); assert.equal(R.cur.bots[0].delay, BOT_ANSWER.normal.delay[0]);
  R.answer('H', true, 6000, 6);
  const out = R.tick(6);
  assert.deepEqual(out.map((e) => e.k), ['ink', 'close']);
  assert.equal(out[0].win, 1); assert.equal(out[0].by, 'bot1');   // the die came in at 4 s
  assert.deepEqual(out[1].res, [['H', 1], ['bot1', 1]]);
  // no grace when nobody is left to wait for; a wrong die is just a wrong answer
  assert.deepEqual(settle([{ pid: 'a', team: 0, ok: false, ms: 1, at: 1 }], 1, { waiting: 0 }), { win: -1, by: null, ms: null });
  assert.equal(settle([{ pid: 'a', team: 0, ok: true, ms: 900, at: 1 }], 1.1, { waiting: 1, grace: 0.4 }), null);
  assert.deepEqual(settle([{ pid: 'a', team: 0, ok: true, ms: 900, at: 1 }, { pid: 'b', team: 1, ok: true, ms: 700, at: 1.3 }], 1.45, { waiting: 0 }), { win: 1, by: 'b', ms: 700 });
  assert.deepEqual(settle([], 9, { waiting: 2, force: true }), { win: -1, by: null, ms: null });
});

test('versus2 tally: who inked first how often, who answered right of how many (time-outs not counted), sorted by side then wins', () => {
  const people = [{ pid: 'H', team: 0, name: 'Ann', self: true }, { pid: 'G', team: 1, name: 'Bo' }];
  const rows = tally([
    { q: 1, by: 'G', res: [['H', 1], ['G', 1]] }, { q: 2, by: 'H', res: [['H', 1], ['G', 0]] }, { q: 3, by: null, res: [['H', -1], ['G', 0]] }, { q: 4, by: 'G', res: [['H', 0], ['G', 1]] },
  ], people);
  assert.deepEqual(rows.map((r) => [r.pid, r.wins, r.right, r.answered, r.self]), [['H', 1, 2, 3, true], ['G', 2, 2, 4, false]]);
});

test('coop2 halves: roles swap every question (a re-ask forces the other hands); the clue side has the stem and the sound but no form, the answering side the form and nothing that gives the answer away', async () => {
  assert.deepEqual(rolesFor(['A', 'B'], 0), { clue: 'A', hands: 'B' });
  assert.deepEqual(rolesFor(['A', 'B'], 1), { clue: 'B', hands: 'A' });
  assert.deepEqual(rolesFor(['A', 'B'], 2, 'B'), { clue: 'A', hands: 'B' });
  assert.deepEqual(rolesFor(['A', 'B'], 2, 'A'), { clue: 'B', hands: 'A' });
  const w = await loadWeek(1);
  const items = daySteps(w, 1).flatMap((s) => s.items);
  const typed = items.find((it) => prompt(it).type !== 'choice' && prompt(it).tts), choice = items.find((it) => prompt(it).type === 'choice');
  assert.ok(typed && choice);
  for (const it of [typed, choice]) {
    const p = prompt(it), clue = splitPrompt(p, 'clue'), hands = splitPrompt(p, 'hands');
    assert.equal(clue.type, 'clue'); assert.equal(clue.options, undefined); assert.equal(clue.text, p.text); assert.equal(clue.tts, p.tts || null); assert.ok(/队友/.test(clue.hint));
    assert.equal(hands.type, p.type); assert.equal(hands.tts, null); assert.equal(hands.audio, null); assert.equal(hands.zh, ''); assert.ok(/队友/.test(hands.text));
    if (p.type === 'choice') assert.deepEqual(hands.options, p.options);
    // the answering side's view still judges like the prompt itself (same mapping)
    const want = rightAnswerOf(it, p);
    assert.equal(judgeAnswer(it, hands, want).ok, true);
    assert.ok(!JSON.stringify({ t: hands.text, z: hands.zh, h: hands.hint }).includes(it.en), 'the answering side never sees the English it must give');
  }
});

test('coop2 pads: two spots either side of the route, 2 × gap apart and square to it; each pad held by a different person; on a real stage the gate nodes give walkable pads', async () => {
  // a straight route along +z on a fixture grid
  const nodes = [], path = [];
  for (let z = 0; z < 20; z++) { path.push(nodes.length); nodes.push({ id: nodes.length, x: 0, y: 0, z, nb: [] }); }
  const [p1, p2] = padSpots(nodes, path, 10, 2.4);
  assert.ok(Math.abs(Math.hypot(p1.x - p2.x, p1.z - p2.z) - 4.8) < 1e-9);
  assert.ok(Math.abs(p1.z - 10) < 1e-9 && Math.abs(p2.z - 10) < 1e-9, 'square to the route');
  assert.ok(Math.abs(p1.x + p2.x) < 1e-9 && Math.abs(Math.abs(p1.x) - 2.4) < 1e-9);
  const pads = [p1, p2];
  assert.deepEqual(padsHeld(pads, [{ id: 'A', x: p1.x + 0.3, y: 0, z: 10 }], 1.2), { on: ['A', null], held: false });
  assert.deepEqual(padsHeld(pads, [{ id: 'A', x: p1.x, y: 0, z: 10 }, { id: 'B', x: p2.x - 0.5, y: 0.2, z: 10.4 }], 1.2), { on: ['A', 'B'], held: true });
  assert.equal(padsHeld(pads, [{ id: 'A', x: p1.x, y: 0, z: 10 }, { id: 'B', x: p1.x + 0.2, y: 0, z: 10 }], 1.2).held, false, 'two people on one pad do not open it');
  assert.equal(padsHeld(pads, [{ id: 'A', x: p1.x, y: 3, z: 10 }, { id: 'B', x: p2.x, y: 0, z: 10 }], 1.2).held, false, 'a ledge above the pad is not the pad');
  // the corner of a route (the direction is read two nodes either side) and a degenerate one-node path
  const one = padSpots([{ x: 5, y: 1, z: 5 }], [0], 0, 2);
  assert.deepEqual(one.map((p) => [p.x, p.z]), [[5, 7], [5, 3]]);
});

test('coop2 on every offline stage (Level + Physics + NavGraph in Node): along B\'s route from the spawn to the far side, every gate spot gets two pads on walkable ground (beside the gate, or on the route itself), apart', async () => {
  const { MAP_LAYOUTS } = await import('../../src/world/maps.js');
  const { Level } = await import('../../src/world/level.js');
  const { Physics } = await import('../../src/game/physics.js');
  const { NavGraph } = await import('../../src/game/nav.js');
  const { layoutFor } = await import('../../src/world/variants.js');
  const { OFFLINE_MAPS } = await import('../../src/config.js');
  const report = [];
  for (const m of OFFLINE_MAPS) {
    const L = new Level(layoutFor(MAP_LAYOUTS[m.layout || m.id], 'turf'), []), P = new Physics(L), nav = new NavGraph(L, P);
    const pad0 = L.spawnPads[0], pad1 = L.spawnPads[1];
    const start = nav.nearest({ x: pad0.x, y: pad0.y, z: pad0.z }, 2, true);
    const dx = -pad1.x, dz = -pad1.z, dl = Math.hypot(dx, dz) || 1, pull = (L.spawnBarrier || 4) + 3;
    const goal = nav.nearest({ x: pad1.x + (dx / dl) * pull, y: pad1.y, z: pad1.z + (dz / dl) * pull }, 3, false);
    const path = nav.path(start, goal, 0, 40000, true);
    assert.ok(path && path.length > 10, m.id + ': a route');
    let n = 0, fb = 0;
    for (let i = 8; i < path.length - 3; i += 10) {
      const g = nav.nodes[path[i]], pads = padNodes(nav, path, i);
      assert.equal(pads.length, 2);
      assert.ok(padsApart(pads[0], pads[1]), m.id + ': the two pads never share a person (across, or a floor apart)');
      for (const p of pads) { assert.ok(nav.nodes[p.node], m.id + ': on the graph'); if (p.fallback) { fb++; assert.ok(path.includes(p.node), m.id + ': a fallback pad is on the route'); } else assert.ok(Math.abs(p.y - g.y) < 2.5, m.id + ': beside the gate'); }
      n++;
    }
    assert.ok(n >= 3, m.id + ': gate spots ' + n);
    report.push(`${m.id}: ${n} gates, ${fb} of ${n * 2} pads fell back onto the route`);
  }
  assert.equal(report.length, OFFLINE_MAPS.length);
});

test('the wire: the learning payload kinds on the room envelope, a q that is not an integer refused; versus2\'s queue on A\'s real week 1 (day 1) holds 12 askable items spread over the day\'s steps; the short match 2', async () => {
  assert.deepEqual(LEARN_WIRE, ['ls', 'ld', 'lq', 'la', 'lr', 'lc', 'lg']);
  assert.equal(validQ({ k: 'lq', q: 3 }), true); assert.equal(validQ({ k: 'lq', q: '3' }), false); assert.equal(validQ({ k: 't' }), false); assert.equal(validQ(null), false);
  const w = await loadWeek(1);
  const level = planDay(w, 1, 'duel');
  const byId = new Map(); for (const d of w.days) for (const s of daySteps(w, d.n)) for (const it of s.items) if (!byId.has(it.id)) byId.set(it.id, it);
  const q = buildQueue({ gates: level.gates, due: [], has: (id) => byId.has(id), n: LEARN.versus2.questions });
  assert.equal(q.length, LEARN.versus2.questions);
  const steps = new Set(q.map((e) => byId.get(e.id).meta.step));
  assert.ok(steps.size >= Math.min(level.gates.length, LEARN.versus2.questions) - 1, `spread over ${steps.size} steps`);
  for (const e of q) { const p = prompt(byId.get(e.id)); assert.ok(['choice', 'type', 'typed', 'write'].includes(p.type), p.type); assert.ok(p.text); }
  const short = shortenLevel(level, 2, 2);
  assert.equal(buildQueue({ gates: short.gates, n: LEARN.versus2.short.questions }).length, 2);
  // a due item of another day is asked when the week has it (both players' lists merged)
  const other = daySteps(w, 3)[0].items[0].id;
  const q2 = buildQueue({ gates: level.gates, due: mergeDue([[other], []]), has: (id) => byId.has(id), n: 12 });
  assert.equal(q2[0].id, other);
});

/* ───────────────────────────── 题即玩法 play-6 (docs/PLAY.md §5.5, LEARN §25) ───────────────────────────── */
const WEEKS6 = [await loadWeek(1), await loadWeek(2), await loadWeek(3)];
const { layoutBoard } = await import('../../src/learn/play/board/paint.js');   // (three, through the hook: after register())
const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; };
const leafOf = (id) => { const ev = store.evidence(); for (const doc of Object.values(ev)) { const d = doc.it[id]; if (d) { const day = Object.values(d)[0]; return Object.values(day)[0]; } } return null; };
const noRandom = (fn) => { const R = Math.random; Math.random = () => { throw new Error('Math.random on a screen of its own'); }; try { return fn(); } finally { Math.random = R; } };
// one screen's question for an 'lq' (versus2.js / coop2.js _onAsk under the flag): the engine's prompt, or the seeded rewording
const screenPrompt = (gates, base, q, alt) => { const it = { ...base, _tries: alt ? 1 : 0, _form: alt ? 'alt' : null }; return { it, p: alt ? duoAltPrompt(gates, it, seedOf(q, base.id), () => null) : prompt(it) }; };

test('play-6 versus2: every question of the three weeks\' duel days is the SAME thing on both screens — the same mechanic, the same labels in the same order, the same right object — the reworded ones too (seeded by the question\'s number and id, never Math.random)', () => {
  let asked = 0, alts = 0, choices = 0, typed = 0, reorders = 0;
  for (const w of WEEKS6) for (let d = 1; d <= 7; d++) {
    const level = planDay(w, d, 'duel');
    const queue = buildQueue({ gates: level.gates, due: [], n: 40 });
    const byId = new Map(level.gates.flatMap((g) => g.items.map((it) => [it.id, it])));
    queue.forEach((e, i) => {
      const base = byId.get(e.id);
      for (const alt of [0, 1]) {
        const q = i + 1;
        // two screens, each building its own from the same 'lq' (no shared object, no shared random)
        const A = noRandom(() => screenPrompt(level.gates, base, q, alt)), B = noRandom(() => screenPrompt(level.gates, base, q, alt));
        const kind = duoMechanic(A.p);
        assert.ok(kind === 'm1' || kind === 'type', `${base.id}${alt ? ' (reworded)' : ''}: a thing over the zone, not a card (${A.p.type})`);
        assert.equal(arenaKind(A.it, A.p), kind, 'the arena routes it the same way');
        assert.equal(duoMechanic(B.p), kind);
        assert.deepEqual(targetLabels(B.p), targetLabels(A.p), `${base.id}: the same objects in the same order`);
        assert.deepEqual(rightAnswerOf(B.it, B.p), rightAnswerOf(A.it, A.p), `${base.id}: the same right object`);
        assert.equal(B.p.text, A.p.text);
        if (kind === 'm1') {
          choices++;
          const k = rightAnswerOf(A.it, A.p);
          assert.equal(judgeAnswer(A.it, A.p, k).ok, true, 'the right object judges right');
          assert.equal(judgeAnswer(B.it, B.p, k).ok, true, '… on the other screen too');
          if (A.p._perm) { assert.deepEqual([...A.p._perm].sort((x, y) => x - y), base.options.map((_, j) => j)); if (A.p._perm.some((x, j) => x !== j)) reorders++; }
        } else typed++;
        asked++; if (alt) alts++;
      }
    });
  }
  assert.ok(asked > 500 && alts > 250 && choices > 200 && typed > 50, `asked ${asked} (reworded ${alts}), ${choices} choices, ${typed} typed`);
  assert.ok(reorders > 20, `a reworded choice is really reshuffled (${reorders})`);
  // the seed is the question's: another number or another item, another draw
  assert.notEqual(seedOf(1, 'a'), seedOf(2, 'a')); assert.notEqual(seedOf(1, 'a'), seedOf(1, 'b'));
  const r1 = seeded(7), r2 = seeded(7); for (let k = 0; k < 5; k++) { const x = r1(); assert.equal(x, r2()); assert.ok(x >= 0 && x < 1); }
});

test('play-6 coop2: on every gate of the three weeks\' puzzle days only the answering side has something to answer with — ink targets or the 打字蟹, with no recording, no stem, no Chinese, judged like the prompt itself; the clue side\'s board has the stem, its Chinese and ▶, and no option, no input, no hotspot but 再听', () => {
  let n = 0, boards = 0, withSound = 0;
  for (const w of WEEKS6) for (let d = 1; d <= 7; d++) {
    const level = planDay(w, d, 'puzzle');
    for (const g of level.gates) g.items.forEach((base, i) => {
      for (const alt of [0, 1]) {
        const { it, p } = noRandom(() => screenPrompt(level.gates, base, i + 1, alt));
        const hands = splitPrompt(p, 'hands'), clue = splitPrompt(p, 'clue');
        const kind = duoMechanic(hands);
        assert.ok(kind === 'm1' || kind === 'type', `${base.id}: the answering side plays it (${hands.type})`);
        assert.equal(hands.tts, null); assert.equal(hands.audio, null); assert.equal(hands.zh, ''); assert.equal(hands.hint, null);
        assert.notEqual(hands.text, p.text, 'not the stem');
        if (kind === 'm1') {
          assert.deepEqual(targetLabels(hands), targetLabels(p), 'the objects are the prompt\'s options, in its order');
          for (let k = 0; k < p.options.length; k++) assert.equal(judgeAnswer(it, hands, k).ok, judgeAnswer(it, p, k).ok, 'the hands view judges as the prompt');
        }
        assert.equal(duoMechanic(clue), null, 'the clue side has nothing to answer with');
        assert.equal(clue.options, undefined); assert.equal(clue.type, 'clue');
        const L = layoutBoard(clueSpec(clue, 'Bo'));
        assert.ok(L.hotspots.every((h) => h.id === 'listen' || h.id === 'more'), `${base.id}: the board's hotspots ${L.hotspots.map((h) => h.id)}`);
        assert.equal(L.hotspots.some((h) => h.id === 'listen'), !!clue.tts, '再听 exactly when there is a recording');
        assert.ok(L.minFont >= 54, 'every line ≥ 54 canvas px (≥ 17 px framed)');
        n++; boards++; if (clue.tts) withSound++;
      }
    });
  }
  assert.ok(n > 3000 && withSound > 1000, `${n} questions, ${boards} clue boards (${withSound} with a recording)`);
});

test('play-6 the one judging path: versus2\'s _judgeRecord writes the day\'s first answer once (the 打字蟹\'s 提示 → H) and sends ONE \'la\' to the referee; coop2\'s on the answering side writes it and sends the verdict to both, the clue side writes nothing', async () => {
  const { Versus2Flow } = await import('../../src/learn/forms/versus2.js');
  const { Coop2Flow } = await import('../../src/learn/forms/coop2.js');
  const w = WEEKS6[0], day = daySteps(w, 1).flatMap((s) => s.items);
  const choice = day.find((x) => x.meta.input === 'choice' && x.meta.scored), word = day.find((x) => x.meta.kind === 'word' && x.meta.input === 'type');
  const g = { id: 'v2:0', items: [choice], queue: [], locks: 0 };
  // versus2
  const stubV = (item, p) => ({ V: LEARN.versus2, firsts: 0, firstRight: 0, right: new Set(), rightN: 0, streak: 0, sent: [], q: { q: 3, item, p, t0: performance.now() / 1000, play: true, answered: false }, match: { local: { ink: 100 } }, _toHost(d) { this.sent.push(d); }, _emit() {}, _progress() {} });
  setBackend(memory());
  let F = stubV(choice, prompt(choice)), p = F.q.p;
  let o = Versus2Flow.prototype._judgeRecord.call(F, g, choice, p, rightAnswerOf(choice, p));
  assert.equal(o.r.ok, true); assert.equal(o.first, true); assert.equal(o.again, false); assert.equal(F.q.answered, true);
  assert.deepEqual(F.sent.map((d) => [d.k, d.q, d.ok]), [['la', 3, 1]]);
  assert.deepEqual(leafOf(choice.id), [1, 'L']);
  F.q.answered = false; o = Versus2Flow.prototype._judgeRecord.call(F, g, choice, p, 0);
  assert.equal(o.first, false, 'the day\'s first answer once');
  setBackend(memory());
  F = stubV(word, prompt(word));
  Versus2Flow.prototype._judgeRecord.call(F, g, word, F.q.p, word.meta.ref || word.en, { hinted: true });
  assert.equal(leafOf(word.id)[1], 'H', 'the 打字蟹\'s 提示 → H');
  // coop2: the answering side
  const stubC = (role, item, p) => ({ P: LEARN.puzzle, firsts: 0, mine: { asked: 0, right: 0, firsts: 0, firstRight: 0, clues: 0 }, sent: [], q: { q: 5, item, p, role, answered: false }, _bcast(d) { this.sent.push(d); } });
  setBackend(memory());
  const it0 = { ...choice, _tries: 0, _form: null }, hv = splitPrompt(prompt(it0), 'hands');
  let C = stubC('hands', it0, prompt(it0));
  const wrong = (rightAnswerOf(it0, hv) + 1) % hv.options.length;
  o = Coop2Flow.prototype._judgeRecord.call(C, g, it0, hv, wrong);
  assert.equal(o.r.ok, false); assert.equal(o.again, true, 'a first miss comes back (to the other hands)');
  assert.equal(C.sent.length, 1); assert.equal(C.sent[0].k, 'la'); assert.equal(C.sent[0].ok, 0); assert.equal(C.sent[0].first, 1); assert.ok(C.sent[0].canonical);
  assert.deepEqual(leafOf(choice.id), [0, 'L']); assert.equal(C.mine.firsts, 1);
  // the clue side: nothing written, nothing sent
  setBackend(memory());
  C = stubC('clue', it0, prompt(it0));
  Coop2Flow.prototype._judgeRecord.call(C, g, it0, splitPrompt(prompt(it0), 'clue'), 0);
  assert.equal(leafOf(choice.id), null); assert.equal(C.sent.length, 0);
});

test('play-6 / play-8 the sources: versus2 / coop2 judge only through _judgeRecord (play/judge.js), never hold, never pause, never ask a card; the coop2 host judges nothing, never pauses, never holds', () => {
  const root = new URL('../../src/learn/', import.meta.url);
  for (const f of ['forms/versus2.js', 'forms/coop2.js']) {
    const src = readFileSync(new URL(f, root), 'utf8');
    assert.equal((src.match(/recordFirst\(/g) || []).length, 0, `${f}: no recordFirst of its own (play-8: play/judge.js)`);
    assert.equal((src.match(/judgeRecord\(\{/g) || []).length, 1, `${f}: the one judging path, once (in _judgeRecord)`);
    assert.ok(/_judgeRecord\(g, item, p, ans, o = \{\}\)/.test(src), `${f}: the one path's signature`);
    assert.ok(/_askNext\(/.test(src), `${f}: _askNext is the form's (B's would ask its own queue)`);
  }
  for (const f of ['forms/versus2.js', 'forms/coop2.js']) {
    const src = readFileSync(new URL(f, root), 'utf8').replace(/\/\/.*$/gm, '');
    assert.ok(!/\.hold\s*=/.test(src), `${f}: no hold`);
    assert.ok(!/paused\s*=\s*true/.test(src), `${f}: never a pause`);
    assert.ok(!/hud\??\.(ask|verdict)\(/.test(src) && !/_answer\(/.test(src), `${f}: no card`);
  }
  const h = readFileSync(new URL('play/duo/coop.js', root), 'utf8');
  assert.ok(!/paused\s*=\s*true/.test(h) && !/\.hold\s*=\s*true/.test(h), 'coop.js: never a pause / a hold');
  assert.ok(!/recordFirst\(/.test(h) && !/\bjudge\(/.test(h) && !/judgeAnswer\(/.test(h), 'coop.js: no judging of its own');
});

test('play-9 versus2 host migration: the new host re-opens the question in flight under the same q (lq re:1, the referee open on it); a closed one is not; on a screen that saw it the re-ask changes nothing — an answered one re-sends what it sent, an open one gets the fresh clock', async () => {
  const { Versus2Flow } = await import('../../src/learn/forms/versus2.js');
  const w = WEEKS6[0], day = daySteps(w, 1).flatMap((s) => s.items);
  const items = day.filter((x) => x.meta.input === 'choice' && x.meta.scored).slice(0, 3);
  const byId = new Map(items.map((it) => [it.id, it]));
  const stub = () => Object.assign(Object.create(Versus2Flow.prototype), { V: LEARN.versus2, model: null, byId, qs: new Map(), q: null, qi: 1, queue: items.map((it) => ({ id: it.id, alt: 0 })), ref: null, refNext: -1, sent: [], out: [],
    match: { opts: { roster: [{ owner: 'a', team: 0 }, { owner: 'b', team: 1 }] }, state: 'playing' }, people() { return [{ pid: 'a', team: 0, name: 'A', self: true }, { pid: 'b', team: 1, name: 'B', self: false }]; },
    _bcast(d) { this.out.push(d); }, _toHost(d) { this.sent.push(d); }, _progress() { this.progressed = (this.progressed || 0) + 1; }, _emit() {} });
  // the new host: question 2 (q = qi + 1) was asked and not closed → re-opened as the same q
  let F = stub();
  F.qs.set(2, { q: 2, id: items[1].id, answered: false, t0: 0, sec: 20 });
  Versus2Flow.prototype._becameHost.call(F);
  assert.equal(F.out.length, 1); assert.deepEqual([F.out[0].k, F.out[0].q, F.out[0].i, F.out[0].id, F.out[0].re, F.out[0].n, F.out[0].total], ['lq', 2, 1, items[1].id, 1, 2, 3]);
  assert.ok(F.ref && F.ref.open_, 'the new referee is open on it');
  // … closed already → nothing re-opened, the next question comes after askGap
  F = stub();
  F.qs.set(2, { q: 2, id: items[1].id, answered: true, closed: true });
  Versus2Flow.prototype._becameHost.call(F);
  assert.equal(F.out.length, 0); assert.equal(F.ref, null); assert.equal(F.refNext, LEARN.versus2.askGap);
  // … nothing asked yet (no record) → as before
  F = stub(); F.qi = -1;
  Versus2Flow.prototype._becameHost.call(F);
  assert.equal(F.out.length, 0); assert.equal(F.refNext, LEARN.versus2.askGap);
  // a screen that answered it: the re-ask re-sends the same 'la', asks nothing new
  F = stub();
  const done = { q: 2, id: items[1].id, answered: true, sent: { ok: 1, ms: 1234 } };
  F.qs.set(2, done);
  Versus2Flow.prototype._onAsk.call(F, { k: 'lq', q: 2, i: 1, id: items[1].id, alt: 0, n: 2, total: 3, sec: 20, re: 1 });
  assert.deepEqual(F.sent, [{ k: 'la', q: 2, ok: 1, ms: 1234 }]); assert.equal(F.q, null, 'no new question on this screen');
  // a screen still on it: the clock refreshed, nothing sent
  F = stub();
  const open = { q: 2, id: items[1].id, answered: false, t0: 1, sec: 20, play: true, shown: '' };
  F.qs.set(2, open); F.q = open;
  Versus2Flow.prototype._onAsk.call(F, { k: 'lq', q: 2, i: 1, id: items[1].id, alt: 0, n: 2, total: 3, sec: 18, re: 1 });
  assert.equal(F.sent.length, 0); assert.ok(open.t0 > 1, 'the clock restarted'); assert.equal(open.sec, 18); assert.equal(F.progressed, 1); assert.equal(F.q, open);
  // an expired question sends 'la none' once and remembers it for a re-ask
  F = stub();
  const late = { q: 2, id: items[1].id, item: items[1], p: prompt(items[1]), answered: false, t0: 0, sec: 20, play: false, g: {} };
  F.qs.set(2, late); F.q = late; F.hud = null;
  Versus2Flow.prototype._expire.call(F, 'time');
  assert.equal(F.sent.length, 1); assert.equal(F.sent[0].none, 1); assert.deepEqual(late.sent, { ok: 0, ms: F.sent[0].ms, none: 1 });
});
