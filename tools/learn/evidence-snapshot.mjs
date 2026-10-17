// 证据快照 (play-8, docs/LEARN.md §27): every item of the three weeks, in every form that can ask it, through that form's
// one judging path (Form.prototype._judgeRecord) — the evidence leaves a game action writes, one line per case, sorted.
// Run it before and after a change to the judging / the card paths: the two outputs must be byte-identical (PLAY §1
// rules 2–3: deleting the cards and merging the judging change no evidence).
//
//   node tools/learn/evidence-snapshot.mjs [--out <file>]     → the JSONL (or stdout) + its sha256 and the case count on stderr
//
// A case = a fresh store, a fresh stub of the form (its prototype, the fields its _judgeRecord reads, side effects as
// no-ops) and a short sequence of answers on one item: right · wrong · a hint · a near miss (held → 我的写法也对 / 继续)
// · wrong then the form's other try · a flip card's 认识 / 不熟 then the typed card. Date.now and Math.random are pinned
// (a seed per case), so the reworded prompts are the same from run to run. Only what the store writes is kept (per call:
// first / held / the leaf; at the end the whole evidence document) — never a prompt's text or its options.
import { register } from 'node:module';
register(new URL('../../tests/learn/three-hook.mjs', import.meta.url));
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const T0 = Date.UTC(2026, 9, 12, 2, 30, 0);   // a Monday in week ev-2026-10-12 (the leaves' date / time)
Date.now = () => T0;
let seed = 1;
const rnd = () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
Math.random = rnd;
const seedOfKey = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };

const { loadWeek, daySteps } = await import('../../src/learn/content.js');
const { prompt } = await import('../../src/learn/engine.js');
const { store, setBackend } = await import('../../src/learn/store.js');
const { LEARN } = await import('../../src/config.js');
const { planDay, bossPlan, quizPlan } = await import('../../src/learn/design.js');
const { cardFor, rightAnswerOf } = await import('../../src/learn/forms/common.js');
const { LearnFlow } = await import('../../src/learn/flow.js');
const { DuelFlow } = await import('../../src/learn/forms/duel.js');
const { BossFlow } = await import('../../src/learn/forms/boss.js');
const { Versus2Flow } = await import('../../src/learn/forms/versus2.js');
const { Coop2Flow } = await import('../../src/learn/forms/coop2.js');
const { splitPrompt, duoAltPrompt, seedOf } = await import('../../src/learn/forms/duo.js');
const { RunnerFlow } = await import('../../src/learn/play/runner/runner.js');
const { entriesOf, rowPrompt } = await import('../../src/learn/play/runner/rows.js');

const arg = (k) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : null; };
function memory() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; }
const noop = () => {};
const TYPED = new Set(['type', 'typed', 'write']);
const WEEKS = [await loadWeek(1), await loadWeek(2), await loadWeek(3)];

// ---------------------------------------------------------------------------------------------- the stubs
// (each mirrors what the real instance carries when its _judgeRecord runs; the form's own effects are no-ops)
const base = () => ({ P: LEARN.puzzle, firsts: 0, firstRight: 0, right: new Set(), streak: 0, rightN: 0, relearn: [], relearnRight: 0, t: 0, log: [], _emit: noop, _styleGates: noop, _onRight: noop, ui: { say: noop, setBag: noop } });
const STUB = {
  puzzle: (level) => Object.assign(Object.create(LearnFlow.prototype), base(), { level, play: { stub: true } }),
  runner: (level) => Object.assign(Object.create(RunnerFlow.prototype), base(), { level, play: null, _claimHeld: null }),
  duel: (level) => Object.assign(Object.create(DuelFlow.prototype), base(), { level, play: null, arena: { stub: true }, D: LEARN.duel, shield: false, enemyT: 0, model: { duelCadence: 6 }, bag: [], hintNext: false }),
  boss: (level) => Object.assign(Object.create(BossFlow.prototype), base(), { level, plan: level, play: null, arena: { stub: true }, B: LEARN.boss, perPhase: {}, boss: { maxHp: 1000 }, _hit: noop, _claimHeld: null, _pendingMove: false }),
  versus2: (level) => Object.assign(Object.create(Versus2Flow.prototype), base(), { level, play: { stub: true }, arena: { stub: true }, V: LEARN.versus2, q: null, match: { local: { ink: 100 } }, _toHost: noop, _progress: noop }),
  coop2: (level) => Object.assign(Object.create(Coop2Flow.prototype), base(), { level, play: { stub: true }, q: null, mine: { firsts: 0, firstRight: 0, right: 0 }, _bcast: noop }),
};

// ---------------------------------------------------------------------------------------------- answers
const wordsOf = (s) => String(s || '').trim().split(/\s+/);
function answersFor(item, p) {
  if (p._flip) return [['know', true], ['forgot', false]];
  const right = rightAnswerOf(item, p);
  if (p.type === 'choice') {
    const n = (p.options || []).length, ri = typeof right === 'number' ? right : 0;
    return [['right', ri], ['wrong', n > 1 ? (ri + 1) % n : ri]];
  }
  const ref = String(right ?? ''), w = wordsOf(ref);
  const out = [['right', ref], ['wrong', 'zzzz qqq']];
  if (w.length > 1) out.push(['near', w.slice(0, -1).join(' ')]);
  else if (ref.length > 3) out.push(['near', ref.slice(0, -1)]);
  return out;
}

// ---------------------------------------------------------------------------------------------- one case
// steps: [{ p(item, F) → prompt, ans, o?, after?(item) } | { alt: 'right' | 'wrong' } (the form's other try, answered
// by what that prompt makes right / wrong)]
const lines = [];
function runCase(key, form, Form, level, g, item0, steps) {
  setBackend(memory()); store.load();
  seed = seedOfKey(key);
  const F = STUB[form](level);
  F.gates = level._gates; F.total = 0;
  const item = { ...item0, _tries: item0._tries || 0, _form: item0._form || null };
  const gg = { ...g, locks: 0, queue: [], items: g.items };
  const calls = [];
  for (const s of steps) {
    let p, ans, o = s.o || {};
    if (s.alt) { p = altPrompt(form, gg, item, F); const a = p ? answersFor(item, p).find(([k]) => k === s.alt) : null; ans = a ? a[1] : null; }
    else { p = s.p(item, F); ans = s.ans; }
    if (!p) { calls.push({ none: true }); continue; }
    if (form === 'versus2') F.q = { item, g: gg, p, q: 7, t0: 0, answered: false, play: true };
    if (form === 'coop2') F.q = { item, gate: gg, p, q: 7, role: 'hands', answered: false, play: true };
    const out = Form.prototype._judgeRecord.call(F, gg, item, p, ans, o);
    calls.push({ first: !!(out && out.first), held: !!(out && out.held) });
    if (s.after) s.after(item);
  }
  lines.push(key + '\t' + JSON.stringify({ calls, ev: store.evidence() }));
}

// the prompt a form asks an item with (its first try), and its other try after a miss
function firstPrompt(form, g, item, F) {
  if (form === 'puzzle' || form === 'duel') return cardFor(g, item, () => prompt(item), () => F._altPrompt(item));
  if (form === 'runner') return item.meta && item.meta.input === 'choice' ? rowPrompt(item, {}) : prompt(item);
  if (form === 'coop2') return splitPrompt(prompt(item), 'hands');
  return prompt(item);
}
function altPrompt(form, g, item, F) {
  if (form === 'runner') return item.meta && item.meta.input === 'choice' ? rowPrompt(item, { alt: true }) : F._altPrompt(item);
  if (form === 'versus2') return duoAltPrompt(F.level.gates, item, seedOf(7, item.id), (x) => F._altPrompt(x)) || F._altPrompt(item);
  if (form === 'coop2') { const p = duoAltPrompt(F.level.gates, item, seedOf(7, item.id), (x) => F._altPrompt(x)) || F._altPrompt(item); return p ? splitPrompt(p, 'hands') : null; }
  return F._altPrompt(item);
}

function itemCases(form, Form, level, tag, g, item) {
  if (!(item.meta && item.meta.scored)) return;
  const key0 = `${form}\t${tag}\t${g.id}\t${item.id}`;
  const probe = STUB[form](level); probe.gates = level._gates;
  seed = seedOfKey(key0 + '\tprobe');
  const it0 = { ...item, _tries: 0, _form: null };
  const p0 = firstPrompt(form, g, it0, probe);
  if (!p0) return;
  const P = (it, F) => firstPrompt(form, g, it, F);
  for (const [k, ans] of answersFor(it0, p0)) {
    runCase(`${key0}\tfirst:${k}`, form, Form, level, g, item, [{ p: P, ans }]);
    if (TYPED.has(p0.type)) {
      runCase(`${key0}\tfirst:${k}:hinted`, form, Form, level, g, item, [{ p: P, ans, o: { hinted: true } }]);
      runCase(`${key0}\tfirst:${k}:p-hinted`, form, Form, level, g, item, [{ p: (it, F) => ({ ...P(it, F), _hinted: true }), ans }]);
      // a station that can wait for her (the puzzle's 字弹 passes o.hold) — held, then her decision
      runCase(`${key0}\tfirst:${k}:hold-claim`, form, Form, level, g, item, [{ p: P, ans, o: { hold: true } }, { p: P, ans, o: { decided: true, claim: true } }]);
      runCase(`${key0}\tfirst:${k}:hold-goon`, form, Form, level, g, item, [{ p: P, ans, o: { hold: true, hinted: true } }, { p: P, ans, o: { decided: true, claim: false, hinted: true } }]);
      runCase(`${key0}\tfirst:${k}:decided-claim`, form, Form, level, g, item, [{ p: P, ans, o: { decided: true, claim: true } }]);
    }
    // 不熟: the word comes back typed at once (the day's first answer is already the F)
    if (p0._flip && ans === false) runCase(`${key0}\tflip:forgot-then-typed`, form, Form, level, g, item, [{ p: P, ans, after: (it) => { it._flipTyped = true; } }, { p: P, ans: rightAnswerOf(it0, prompt(it0)) }]);
  }
  // a miss, then the other try (right / wrong): only the first one may write
  if (!p0._flip) {
    const wrong = answersFor(it0, p0).find(([k]) => k === 'wrong');
    for (const k2 of ['right', 'wrong']) runCase(`${key0}\talt:${k2}`, form, Form, level, g, item, [{ p: P, ans: wrong[1], after: (it) => { it._tries = 1; it._form = 'alt'; } }, { alt: k2 }]);
  }
  // the 回炉 round's copy of a missed item (the forms with one: the runner, the duel, the boss) — its first answer today
  if (form === 'runner' || form === 'duel' || form === 'boss') {
    const rel = { ...item, _tries: 1, _form: 'alt', _relearn: true };
    const F = STUB[form](level); F.gates = level._gates; seed = seedOfKey(key0 + '\trel');
    const pr = altPrompt(form, g, rel, F);
    if (pr) for (const [k, ans] of answersFor(rel, pr)) runCase(`${key0}\trelearn:${k}`, form, Form, level, g, rel, [{ p: () => pr, ans }]);
  }
}

// ---------------------------------------------------------------------------------------------- the forms' levels
const withWall = (lv) => { const gates = lv.gates.map((g) => ({ ...g })); for (const sg of lv.signs || []) if (sg.design && sg.design.mechanic === 'write-wall' && sg.items && sg.items.length) gates.push({ ...sg, kind: 'write' }); return gates; };
let n = 0;
for (const w of WEEKS) {
  for (const d of w.days) {
    const dn = Number(d.n), tag = `${w.id}d${dn}`;
    // the puzzle (+ its write wall, the last gate) · coop2 (the day's puzzle plan, no wall)
    const pz = planDay(w, dn, 'puzzle'); Object.assign(pz, { week: w.n, day: dn, weekRef: w });
    pz._gates = withWall(pz);
    for (const g of pz._gates) for (const it of g.items) { itemCases('puzzle', LearnFlow, pz, tag, g, it); n++; }
    pz._gates = pz.gates;
    for (const g of pz.gates) for (const it of g.items) itemCases('coop2', Coop2Flow, pz, tag, g, it);
    // the runner (墨浪跑酷: the race's plan; rows, the glides, the write wall's glide)
    const rc = planDay(w, dn, 'race'); Object.assign(rc, { week: w.n, day: dn, weekRef: w }); rc._gates = rc.gates;
    for (const e of entriesOf(rc.gates, rc.signs)) { const g = rc.gates[e.gate] || { id: 'gate:wall', items: e.items || [] }; for (const it of e.items || [e.item]) itemCases('runner', RunnerFlow, rc, tag, g, it); }
    // the duel (its rounds) · versus2 (the day's duel plan) · the day's quiz (one duel round)
    const du = planDay(w, dn, 'duel'); Object.assign(du, { week: w.n, day: dn, weekRef: w }); du._gates = du.gates;
    for (const g of du.gates) for (const it of g.items) { itemCases('duel', DuelFlow, du, tag, g, it); itemCases('versus2', Versus2Flow, du, tag, g, it); }
    if (dn <= 6) {
      const q = quizPlan(w, dn, []), byId = new Map();
      for (const dd of w.days) for (const s of daySteps(w, dd.n)) for (const it of s.items) if (!byId.has(it.id)) byId.set(it.id, it);
      const items = q.items.map((x) => byId.get(x.id)).filter(Boolean);
      const gate = { id: 'gate:quiz:' + tag, stepId: 'quiz', kind: 'mixed', title: '今日小考', items, design: null, index: 0 };
      const lv = { kind: 'duel', quiz: true, week: w.n, day: dn, weekRef: w, gates: [gate] }; lv._gates = lv.gates;
      for (const it of items) itemCases('duel', DuelFlow, lv, tag + ':quiz', gate, it);
    }
  }
  // the boss: the week's 周考 (its phases as gates, resolved as BossFlow._place does)
  const plan = { ...bossPlan(w), week: w.n, day: 0, weekRef: w };
  const pl = { level: plan, match: { boss: null } }; BossFlow.prototype._place.call(pl);
  plan._gates = pl.gates;
  for (const g of pl.gates) if (g.phase !== 'S') for (const it of g.items) itemCases('boss', BossFlow, plan, `${w.id}:boss`, g, it);
}

lines.sort();
const text = lines.join('\n') + '\n';
const sha = createHash('sha256').update(text).digest('hex');
const out = arg('out');
if (out) writeFileSync(out, text); else process.stdout.write(text);
process.stderr.write(`evidence-snapshot: ${lines.length} cases · ${n} puzzle items · sha256 ${sha}\n`);
