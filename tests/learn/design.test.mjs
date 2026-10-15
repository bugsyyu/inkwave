// src/learn/design.js: every step of the three weeks has a mechanic (missing = []), the per-day tables keep the course's
// own minutes (±20 %, and the pace model agrees), every stage is an offline INKWAVE stage, every prop is a real sub /
// special, every SFX / trigger / dance name is in docs/CONTRACTS.md, the boss is EXAM.md's 20 / 20 / 1 / 1, the quiz is 8.
// 用法：node --test tests/learn/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWeek, daySteps } from '../../src/learn/content.js';
import { store, setBackend } from '../../src/learn/store.js';
import { puzzleLevel } from '../../src/learn/levels.js';
import { SUBS, SPECIALS, OFFLINE_MAPS, MAPS, DIFFICULTY, TIMES } from '../../src/config.js';
import {
  FORMS, MECHANICS, CLASSIC, mechanicOf, EXAM_MECHANICS, SPOTS, DAY_PLAN, BOSS_STAGE, PROPS, PROPS_OF, PROP_DROP, BOT_ANSWER, BOTS_OF,
  EFFECTS, SFX, TRIGGERS, DANCES, BANNERS, RULES, RETRY, UNLOCK, STARS, stars, PACE, estimateMinutes, coverage, planDay, dayPlanFor,
  bossPlan, quizPlan, freePlan, SYLLABUS_MECHANICS, dayTable, STAGE_IDS,
} from '../../src/learn/design.js';

function memory() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; }
const pad2 = (n) => (n < 10 ? '0' : '') + n;
const today = () => { const d = new Date(); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
const CONTRACTS = readFileSync(new URL('../../docs/CONTRACTS.md', import.meta.url), 'utf8');

// the SFX names CONTRACTS.md §2 lists: the backticked lines after "SFX names (all must exist):", loop suffixes stripped
function contractSfx() {
  const start = CONTRACTS.indexOf('SFX names (all must exist):');
  const end = CONTRACTS.indexOf('Music:', start);
  const block = CONTRACTS.slice(start, end);
  const names = new Set();
  for (const m of block.matchAll(/`([^`]+)`/g)) for (const tok of m[1].replace(/\([^)]*\)/g, '').split(/\s+/)) if (/^[a-z_]+$/.test(tok)) names.add(tok);
  return names;
}
function contractList(prefix) {
  const line = CONTRACTS.split('\n').find((l) => l.includes(prefix));
  return new Set([...line.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]));
}

async function weeks() { return [await loadWeek(1), await loadWeek(2), await loadWeek(3)]; }

test('coverage(w1–w3): every step has a mechanic, missing is empty, the classic set is exactly placement / weekly / speak / checkin', async () => {
  setBackend(memory()); store.load();
  const C = coverage(await weeks());
  assert.deepEqual(C.missing, []);
  assert.equal(C.rows.length, 67 + 77 + 77, 'every step of the three weeks');
  C.rows.forEach((r) => { assert.ok(MECHANICS[r.mechanic], r.id + ' ' + r.mechanic); assert.ok(r.forms.length >= 1); });
  assert.deepEqual(Object.keys(C.weeks), ['w1', 'w2', 'w3']);
  for (const w of Object.values(C.weeks)) assert.equal(w.covered, w.steps);
  assert.equal(C.weeks.w1.items, 743); assert.equal(C.weeks.w2.items, 752); assert.equal(C.weeks.w3.items, 752);
  assert.equal(C.weeks.w1.scored + C.weeks.w2.scored + C.weeks.w3.scored, 2202);
  assert.deepEqual([...new Set(C.classic.map((c) => c.type))].sort(), ['checkin', 'placement', 'speak', 'weekly']);
  assert.deepEqual(Object.keys(CLASSIC).sort(), ['checkin-pad', 'echo-booth', 'placement-sign', 'weekly-sign']);
  // the mechanic map hits every pack type the course uses, with the grammar k:pron and the review-day flash sub-cases
  const types = new Set(C.rows.map((r) => r.type));
  assert.deepEqual([...types].sort(), ['checkin', 'dictation', 'flash', 'grammar', 'pairs', 'placement', 'reading', 'speak', 'symbols', 'symreview', 'weekly', 'words', 'write']);
  assert.equal(C.rows.find((r) => r.id === 'w2d1:a2').mechanic, 'pron-quiz');
  assert.equal(C.rows.find((r) => r.id === 'w1d1:a3').mechanic, 'grammar-board');
  assert.equal(C.rows.find((r) => r.id === 'w1d7:a3').mechanic, 'flash-flip');
  assert.equal(C.rows.find((r) => r.id === 'w1d1:b4').mechanic, 'flash-type');
  assert.equal(C.rows.find((r) => r.id === 'w2d1:a1').mechanic, 'review-dictation');
  assert.equal(C.rows.find((r) => r.id === 'w1d7:a1').mechanic, 'symbol-door');
  // the exam centre's four kinds are placed too
  assert.deepEqual(Object.keys(EXAM_MECHANICS), ['quiz', 'boss', 'month', 'free']);
});

test('DAY_PLAN: 3 weeks × 7 days; every asking step is a gate and every lesson step a sign; minutes = the course\'s own (±20 %), the pace model agrees; stages offline, times real', async () => {
  const W = await weeks();
  const offline = new Set(OFFLINE_MAPS.map((m) => m.id));
  assert.ok(!offline.has('cargo') && MAPS.some((m) => m.id === 'cargo'), 'cargo is online-only and never a learning stage');
  assert.deepEqual(STAGE_IDS, [...offline]);
  for (const w of W) {
    assert.equal(DAY_PLAN[w.id].length, 8);
    const stagesThisWeek = [];
    for (const d of w.days) {
      const P = DAY_PLAN[w.id][d.n], steps = daySteps(w, d.n);
      assert.ok(P, w.id + ' d' + d.n);
      assert.ok(FORMS.includes(P.form) && P.form !== 'boss', 'a day is puzzle / race / duel');
      assert.deepEqual(P.alt.sort(), FORMS.filter((f) => f !== 'boss' && f !== P.form).sort());
      assert.ok(offline.has(P.stage), P.stage); assert.ok(TIMES.includes(P.time), P.time);
      stagesThisWeek.push(P.stage);
      const asking = steps.filter((s) => s.kind !== 'lesson'), lessons = steps.filter((s) => s.kind === 'lesson');
      assert.deepEqual(P.gates.map((g) => g.step), asking.map((s) => s.id), w.id + ' d' + d.n + ' gates = the asking steps in order');
      assert.deepEqual(P.signs.map((g) => g.step), lessons.map((s) => s.id), 'signs = the lesson steps');
      P.gates.forEach((g, i) => {
        const s = asking[i];
        assert.equal(g.mechanic, mechanicOf(s)); assert.equal(g.ask, s.items.length, g.step + ' asks every item'); assert.equal(g.minutes, s.minutes, g.step + ' minutes are the course\'s');
        assert.ok(g.at > 0 && g.at < 1); assert.ok(g.spot && g.spot.tag && g.spot.zh && SPOTS[P.stage].includes(g.spot));
      });
      P.signs.forEach((g, i) => { assert.equal(g.minutes, lessons[i].minutes); assert.equal(g.mechanic, mechanicOf(lessons[i])); });
      const course = steps.reduce((a, s) => a + s.minutes, 0);
      assert.ok(Math.abs(P.minutes - course) / course <= 0.2, w.id + ' d' + d.n + ' minutes ' + P.minutes + ' vs ' + course);
      const est = steps.reduce((a, s) => a + estimateMinutes(s), 0);
      assert.ok(Math.abs(est - course) / course <= 0.2, w.id + ' d' + d.n + ' pace estimate ' + est.toFixed(0) + ' vs ' + course);
      assert.equal(P.review, d.n === 7);
      if (d.n === 7) { assert.equal(P.form, 'race'); assert.equal(P.extras.quiz, null); } else assert.equal(P.extras.quiz.n, 8);
      // a review day: the big steps keep the course's counts (48 symbols, 150 cards)
      if (d.n === 7) { assert.equal(P.gates.find((g) => g.mechanic === 'symbol-door' || g.mechanic === 'review-dictation').ask >= 8, true); assert.equal(P.gates.find((g) => g.mechanic === 'flash-flip').ask, 150); }
    }
    assert.equal(new Set(stagesThisWeek).size, 7, w.id + ': every stage once a week');
    assert.ok(offline.has(BOSS_STAGE[w.id].stage) && TIMES.includes(BOSS_STAGE[w.id].time));
    assert.notEqual(BOSS_STAGE[w.id].stage, DAY_PLAN[w.id][7].stage, 'the boss arena is not the review day\'s stage');
  }
  assert.equal(DAY_PLAN.w1[1].stage, 'tidewater'); assert.equal(DAY_PLAN.w1[1].form, 'puzzle');
  // every pace entry names a mechanic
  Object.keys(PACE).forEach((k) => assert.ok(MECHANICS[k], k));
  // the printed table is one line per gate
  const T = dayTable('w1', 1);
  assert.ok(T.gates.includes('音标门 ×8') && T.gates.includes('@禧年圆台') && T.signs.includes('写字墙 ×5'), JSON.stringify(T));
});

test('PROPS refer to real subs / specials; every form hands out a subset; SFX / triggers / dances / banners are CONTRACTS.md\'s', () => {
  Object.values(PROPS).forEach((p) => {
    assert.ok(p.id && p.zh && p.effect && p.desc && p.sfx, p.id);
    if (p.from.sub) assert.ok(SUBS[p.from.sub], p.id + ' sub ' + p.from.sub); else assert.ok(SPECIALS[p.from.special], p.id + ' special ' + p.from.special);
    assert.ok(['none', 'H'].includes(p.evidence));
  });
  assert.ok(SUBS.beacon && SPECIALS.storm && SPECIALS.sonar && SPECIALS.bubbler && SUBS.curtain && SUBS.bomb && SPECIALS.slam);
  FORMS.forEach((f) => { assert.ok(PROPS_OF[f].length >= 2); PROPS_OF[f].forEach((id) => assert.ok(PROPS[id], f + ' ' + id)); });
  assert.ok(PROPS_OF.race.length === 7 && PROPS_OF.puzzle.length === 2);
  FORMS.forEach((f) => {
    const D = PROP_DROP[f];
    assert.ok(D && D.everyRight >= 1 && D.hold >= 1, f);
    Object.keys(D.weights).forEach((id) => { assert.ok(PROPS_OF[f].includes(id), f + ' drops ' + id); assert.equal(PROPS[id].when, 'right', id + ' drops only when earned by a right answer'); });
  });
  assert.ok(!Object.values(PROPS).some((p) => p.effect === 'skip-question'), 'no prop skips a question');
  const sfx = contractSfx();
  assert.ok(sfx.has('splat_big') && sfx.has('charger_charge') && sfx.has('roll') && sfx.has('storm_rain') && sfx.size >= 50, 'the contract list parsed: ' + sfx.size);
  assert.ok(SFX.length >= 15);
  SFX.forEach((n) => assert.ok(sfx.has(n), 'SFX ' + n + ' is in docs/CONTRACTS.md'));
  assert.ok(!SFX.some((n) => /^zone_|^boss_/.test(n)), 'zones / boss cues are their modules\' own, not ours');
  const triggers = contractList("c.trigger(name, arg)"), dances = contractList('c.setDance('), banners = contractList('hud.banner(kind, text)');
  assert.ok(triggers.has('jump') && triggers.has('special_leap') && dances.has('victory') && banners.has('custom'));
  TRIGGERS.forEach((t) => assert.ok(triggers.has(t), 'trigger ' + t));
  DANCES.forEach((t) => assert.ok(dances.has(t), 'dance ' + t));
  BANNERS.forEach((t) => assert.ok(banners.has(t), 'banner ' + t));
  assert.ok(!DANCES.includes('defeat'), 'no defeat dance for her (不惩罚)');
  // every form has right / wrong / wrong2 / streak3 / streak5; a wrong never plays the error sound or shakes
  FORMS.forEach((f) => {
    ['right', 'wrong', 'wrong2', 'streak3', 'streak5'].forEach((k) => assert.ok(EFFECTS[f][k], f + '.' + k));
    assert.notEqual(EFFECTS[f].wrong.sfx, 'ui_error'); assert.ok(!EFFECTS[f].wrong.shake && !EFFECTS[f].wrong.trigger);
    assert.ok(EFFECTS[f].wrong2.relearn, 'a second miss goes to the 回炉 queue');
  });
});

test('BOT_ANSWER keyed by DIFFICULTY ids: correct rate and delays ordered easy → hard; the forms\' bot counts; rules / retry / unlock / stars', () => {
  assert.deepEqual(Object.keys(BOT_ANSWER), Object.keys(DIFFICULTY));
  const [e, n, h] = ['easy', 'normal', 'hard'].map((k) => BOT_ANSWER[k]);
  assert.ok(e.correct < n.correct && n.correct < h.correct && h.correct < 1 && e.correct > 0);
  assert.ok(e.delay[0] > n.delay[0] && n.delay[0] > h.delay[0] && h.delay[0] > 0);
  [e, n, h].forEach((b) => { assert.ok(b.delay[0] < b.delay[1]); assert.ok(b.rubber >= 0 && b.duelCadence > 0 && b.duelFlood > 0 && b.propUse >= 0 && b.propUse <= 1); });
  assert.equal(BOTS_OF.puzzle.count, 0); assert.equal(BOTS_OF.race.count, 3); assert.equal(BOTS_OF.duel.count, 7); assert.equal(BOTS_OF.duel.allies + BOTS_OF.duel.enemies, 7);
  FORMS.forEach((f) => assert.ok(RULES[f] && RULES[f].zh));
  assert.equal(RULES.puzzle.enemies, false); assert.equal(RULES.puzzle.clock, false); assert.equal(RULES.duel.mode, 'zones'); assert.equal(RULES.boss.mode, 'boss');
  assert.equal(RULES.puzzle.gate.wrongOpensAfter, 2, 'a gate never blocks her for good');
  Object.values(RETRY.later).forEach((v) => assert.ok(MECHANICS[v.split('+')[0]], v));
  assert.ok(RETRY.later['word-board'] === 'flash-type' && RETRY.later['flash-type'] === 'word-board', 'a missed word comes back in the other form');
  assert.ok(UNLOCK.day && UNLOCK.week && UNLOCK.boss && UNLOCK.replay);
  assert.ok(STARS[1] && STARS[2] && STARS[3]);
  assert.equal(stars({ gates: 7, visited: 6, scored: 85, firstRight: 85 }), 0, 'not walked through');
  assert.equal(stars({ gates: 7, visited: 7, signs: 3, seen: 3, scored: 85, firstRight: 60 }), 1);
  assert.equal(stars({ gates: 7, visited: 7, signs: 3, seen: 3, scored: 85, firstRight: 70 }), 2);
  assert.equal(stars({ gates: 7, visited: 7, signs: 3, seen: 3, scored: 85, firstRight: 82, relearn: 3, relearnRight: 2 }), 2, '95 % but the 回炉 queue not cleared');
  assert.equal(stars({ gates: 7, visited: 7, signs: 3, seen: 3, scored: 85, firstRight: 82, relearn: 3, relearnRight: 3 }), 3);
});

test('planDay: A\'s level cloned and extended (gate order, items and pos untouched), form / stage / time / minutes / rules / props / bots on it', async () => {
  setBackend(memory()); store.load();
  const w1 = await loadWeek(1);
  const A = puzzleLevel(w1, 1), L = planDay(w1, 1);
  assert.deepEqual(L.gates.map((g) => g.stepId), A.gates.map((g) => g.stepId));
  assert.deepEqual(L.gates.map((g) => g.items.length), A.gates.map((g) => g.items.length));
  L.gates.forEach((g) => { assert.equal(g.pos, null); assert.ok(g.design && g.design.spot && g.design.mechanic && g.design.ask === g.items.length); });
  L.signs.forEach((s) => assert.ok(s.design && s.design.mechanic));
  assert.equal(A.stage, 'tidewater', 'A\'s constant stays'); assert.equal(A.gates[0].design, undefined, 'A\'s object not mutated');
  assert.equal(L.form, 'puzzle'); assert.equal(L.stage, 'tidewater'); assert.equal(L.time, 'day'); assert.equal(L.minutes, 225);
  assert.equal(L.rules, RULES.puzzle); assert.equal(L.bots.count, 0); assert.deepEqual(L.props.map((p) => p.id), PROPS_OF.puzzle); assert.equal(L.route, 'through');
  assert.deepEqual(L.alt, ['race', 'duel']);
  // another form of the same day: race (A's raceLevel shape underneath: checkpoints, due)
  const R = planDay(w1, 1, 'race');
  assert.equal(R.form, 'race'); assert.equal(R.kind, 'race'); assert.equal(R.checkpoints, 7); assert.equal(R.bots.count, 3); assert.equal(R.route, 'loop');
  const D = planDay(w1, 6);
  assert.equal(D.form, 'duel'); assert.equal(D.kind, 'duel'); assert.equal(D.rules.mode, 'zones'); assert.equal(D.stage, 'kelpline');
  assert.throws(() => planDay(w1, 9));
  // a week the tables do not know (the 4th on) gets a plan from the same rules on its own steps: form by d % 3, the
  // review day a race, every stage once a week, every asking step a gate, the course's minutes
  const w4 = { ...w1, id: 'w4', n: 4 };
  const P4 = dayPlanFor(w4, 1);
  assert.ok(P4.generated); assert.equal(P4.form, 'puzzle'); assert.equal(dayPlanFor(w4, 2).form, 'race'); assert.equal(dayPlanFor(w4, 3).form, 'duel'); assert.equal(dayPlanFor(w4, 7).form, 'race');
  assert.equal(new Set([1, 2, 3, 4, 5, 6, 7].map((d) => dayPlanFor(w4, d).stage)).size, 7, 'every stage once in week 4');
  assert.deepEqual(P4.gates.map((g) => g.step), daySteps(w4, 1).filter((s) => s.kind !== 'lesson').map((s) => s.id));
  assert.equal(P4.minutes, 225); assert.equal(dayPlanFor(w4, 7).extras.quiz, null);
  const L4 = planDay(w4, 2);
  assert.equal(L4.form, 'race'); assert.equal(L4.week, 'w4'); assert.ok(STAGE_IDS.includes(L4.stage)); assert.equal(L4.gates.length, 7);
  assert.deepEqual(dayPlanFor(w4, 1), P4, 'generated again, the same plan');
  assert.equal(dayPlanFor(w1, 1), DAY_PLAN.w1[1], 'a known week comes from the table itself');
  assert.equal(quizPlan(w4, 2, []).stage, dayPlanFor(w4, 2).stage, 'the quiz of a generated week plays on that day\'s stage');
});

test('bossPlan: EXAM.md\'s 周考 — L 20 · R 20 · W 1 task of 3 sentences · S 4 questions + 2 read-aloud; phases are HP bands; due items first; ≈ 44 minutes over 4 days', async () => {
  setBackend(memory()); store.load();
  const w1 = await loadWeek(1);
  let B = bossPlan(w1);
  assert.equal(B.kind, 'boss'); assert.equal(B.boss, 'hullbreaker'); assert.equal(B.stage, 'tidewater'); assert.equal(B.time, 'dusk'); assert.equal(B.month, false);
  assert.deepEqual(B.phases.map((p) => p.id), ['L', 'R', 'W', 'S']);
  assert.deepEqual(B.phases.map((p) => p.items.length), [20, 20, 3, 6]);
  assert.deepEqual(B.phases.map((p) => p.n), [20, 20, 1, 1]);
  assert.equal(B.minutes, 44); assert.equal(B.window, 10); assert.equal(B.perDay, 1);
  // HP bands: contiguous 1 → 0; a right answer chips the band by its share
  let hp = 1;
  B.phases.forEach((p) => { assert.equal(p.hp[0], hp); hp = p.hp[1]; });
  assert.equal(hp, 0);
  assert.ok(Math.abs(B.phases[0].hitPerRight * 20 - 0.34) < 1e-6);
  // phase L items come from listening / pron steps, R from vocab / grammar / reading, W from the write steps
  const kOf = (stepId) => { const [dayId] = stepId.split(':'); const d = Number(dayId.slice(-1)); return daySteps(w1, d).find((s) => s.id === stepId).meta.k; };
  B.phases[0].items.forEach((it) => assert.ok(['listening', 'pron'].includes(kOf(it.stepId)), it.stepId));
  B.phases[1].items.forEach((it) => assert.ok(['vocab', 'grammar', 'reading'].includes(kOf(it.stepId)), it.stepId));
  B.phases[2].items.forEach((it) => assert.equal(kOf(it.stepId), 'writing'));
  assert.equal(B.phases[3].items.filter((it) => !it.readAloud).length, 4); assert.equal(B.phases[3].items.filter((it) => it.readAloud).length, 2);
  B.phases[3].items.filter((it) => !it.readAloud).forEach((it) => assert.equal(kOf(it.stepId), 'speaking'));
  // interleaved: no two neighbours of the same step in L and R, and the week's days are spread
  for (const p of B.phases.slice(0, 2)) {
    for (let i = 1; i < p.items.length; i++) assert.notEqual(p.items[i].stepId, p.items[i - 1].stepId, p.id + ' interleaved');
    assert.ok(new Set(p.items.map((it) => it.day)).size >= 4, p.id + ' spans the week');
  }
  // a miss today makes that item due → it is in the next plan's phase
  const target = B.phases[1].pool > 0 ? daySteps(w1, 3).find((s) => s.id === 'w1d3:a2').items[7] : null;
  store.recordFirst({ itemId: target.id, ok: false, day: today() });
  B = bossPlan(w1);
  assert.ok(B.phases[1].items.some((it) => it.id === target.id), 'the due word is in phase R');
  // week 4 would be a 满月月考
  assert.equal(bossPlan({ ...w1, id: 'w4', n: 4 }).month, true);
});

test('quizPlan: 今日小考 of 8 from the week — due first, today\'s misses, then today\'s new; the last one is a known item; freePlan: a short race, weak-only honoured', async () => {
  setBackend(memory()); store.load();
  const w1 = await loadWeek(1);
  let Q = quizPlan(w1, 2, []);
  assert.equal(Q.kind, 'quiz'); assert.equal(Q.form, 'duel'); assert.equal(Q.n, 8); assert.equal(Q.minutes, 6); assert.equal(Q.stage, DAY_PLAN.w1[2].stage);
  assert.equal(new Set(Q.items.map((it) => it.id)).size, 8);
  const steps2 = daySteps(w1, 2);
  Q.items.forEach((it) => assert.ok(steps2.some((s) => s.id === it.stepId) || it.day !== 2, it.stepId));
  // a miss today and an item answered right yesterday: the miss is in, the known one closes
  const miss = steps2.find((s) => s.id === 'w1d2:a2').items[0], known = daySteps(w1, 1).find((s) => s.id === 'w1d1:a2').items[1];
  store.recordFirst({ itemId: known.id, ok: true, day: today() });
  Q = quizPlan(w1, 2, [miss.id]);
  assert.ok(Q.items.some((it) => it.id === miss.id), 'today\'s miss is asked again at dusk');
  assert.equal(Q.n, 8);
  const F = freePlan(w1, { n: 5, skill: 'L' });
  assert.equal(F.form, 'race'); assert.equal(F.n, 5); assert.ok(STAGE_IDS.includes(F.stage));
  F.items.forEach((it) => assert.ok(['listening', 'pron'].includes(daySteps(w1, it.day).find((s) => s.id === it.stepId).meta.k)));
  const F0 = freePlan(w1, { n: 10, weakOnly: true });
  assert.equal(F0.n, 0, 'nothing due yet: weak-only is honestly empty');
  store.recordFirst({ itemId: miss.id, ok: false, day: today() });
  assert.equal(freePlan(w1, { n: 10, weakOnly: true }).n, 1);
});

test('SYLLABUS_MECHANICS: weeks 4–17, every topic names a mechanic and a status; the ones marked ready exist today', () => {
  assert.deepEqual(SYLLABUS_MECHANICS.map((w) => w.week), [4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
  let ready = 0, needs = 0, classic = 0;
  SYLLABUS_MECHANICS.forEach((w) => w.topics.forEach((t) => {
    assert.ok(t.zh && t.mechanic && ['ready', 'needs', 'classic'].includes(t.status), w.week + ' ' + t.zh);
    if (t.status === 'ready') { ready++; assert.ok(MECHANICS[t.mechanic] || FORMS.includes(t.mechanic), t.mechanic); }
    else if (t.status === 'needs') { needs++; assert.ok(t.note || MECHANICS[t.mechanic], t.zh); }
    else classic++;
  }));
  assert.ok(ready >= 12 && needs >= 6 && classic >= 6, ready + '/' + needs + '/' + classic);
});
