// 题即玩法 play-8 (src/learn/play/judge.js, docs/PLAY.md §1 rules 2–3, LEARN §27): the one judging path —
//   · judgeRecord's conventions, written once: judge (o.judged or judgeAnswer), held (o.hold + canClaim), decided /
//     claim (S when claimJudge stands, the miss W else), hinted (p._hinted or o.hinted → H), flip (F), first of the day
//   · every form against it: Form.prototype._judgeRecord writes the very leaf judgeRecord writes for the same answer,
//     with that form's own policy (the puzzle passes the station's options through; the runner and the boss always hold
//     a near-miss sentence; the duel, versus2 and coop2 never hold) — every scored item of week 1 in every form that
//     asks it, right / wrong / a hint / a near miss held then claimed or not
//   · the sources: nothing under src/learn but judge.js writes a first answer; every form's _judgeRecord calls it once
// (The whole three weeks, before / after a change: tools/learn/evidence-snapshot.mjs — the outputs must be identical.)
// 用法：node --test tests/learn/*.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadWeek, daySteps } from '../../src/learn/content.js';
import { prompt } from '../../src/learn/engine.js';
import { store, setBackend } from '../../src/learn/store.js';
import { LEARN } from '../../src/config.js';
import { planDay } from '../../src/learn/design.js';
import { rightAnswerOf, flipPrompt } from '../../src/learn/forms/common.js';
import { judgeRecord } from '../../src/learn/play/judge.js';
const { LearnFlow } = await import('../../src/learn/flow.js');
const { DuelFlow } = await import('../../src/learn/forms/duel.js');
const { BossFlow } = await import('../../src/learn/forms/boss.js');
const { Versus2Flow } = await import('../../src/learn/forms/versus2.js');
const { Coop2Flow } = await import('../../src/learn/forms/coop2.js');
const { RunnerFlow } = await import('../../src/learn/play/runner/runner.js');

function memory() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; }
const fresh = () => { setBackend(memory()); store.load(); };
const leafOf = (id) => { const ev = store.evidence(); for (const doc of Object.values(ev)) { const d = doc.it[id]; if (d) { const day = Object.values(d)[0]; return Object.values(day)[0]; } } return null; };
const AT = Date.parse('2026-10-14T09:30:00');
const W1 = await loadWeek(1);
const noop = () => {};

test('judgeRecord: the conventions — judge, the day\'s first answer, a hint → H, a flip card → F, a held near miss writes nothing until she decides (S when her claim stands, W when she goes on)', () => {
  const d1 = daySteps(W1, 1);
  const word = d1.find((s) => s.meta.type === 'flash').items[0], write = d1.find((s) => s.meta.type === 'write').items[0];
  const choice = d1.find((s) => s.items.some((it) => it.meta.input === 'choice')).items.find((it) => it.meta.input === 'choice');
  const J = (item, p, ans, o) => judgeRecord({ item, p, ans, o: { at: AT, ...o }, store });
  fresh(); let out = J(choice, prompt(choice), choice.answer);
  assert.equal(out.r.ok, true); assert.equal(out.first, true); assert.deepEqual(out.evidence, [1, 'L']); assert.deepEqual(leafOf(choice.id), [1, 'L']);
  out = J(choice, prompt(choice), (choice.answer + 1) % choice.options.length); assert.equal(out.first, false, 'the same day again: practice'); assert.equal(out.evidence, null);
  fresh(); assert.deepEqual(J(word, prompt(word), word.en).evidence, [1, 'T']);
  fresh(); assert.deepEqual(J(word, prompt(word), word.en, { hinted: true }).evidence, [1, 'H'], 'the keyboard\'s 提示');
  fresh(); assert.deepEqual(J(word, { ...prompt(word), _hinted: true }, word.en).evidence, [1, 'H'], 'a prop\'s hint on the prompt (墨雨)');
  fresh(); assert.deepEqual(J(word, flipPrompt(word), true).evidence, [1, 'F']); fresh(); assert.deepEqual(J(word, flipPrompt(word), false).evidence, [0, 'F']);
  // a near miss the sentence's check calls claimable
  const ref = String(write.meta.ref || write.en), near = ref.split(' ').slice(0, -1).join(' ');
  fresh(); const h = J(write, prompt(write), near, { hold: true });
  if (h.held) {
    assert.equal(h.first, false); assert.deepEqual(store.evidence(), {}, 'held: nothing written');
    const c = J(write, prompt(write), near, { decided: true, claim: true }); assert.deepEqual(c.evidence, c.r.ok ? [1, 'S'] : [0, 'W']); assert.equal(c.self, c.r.ok);
    fresh(); J(write, prompt(write), near, { hold: true }); assert.deepEqual(J(write, prompt(write), near, { decided: true, claim: false }).evidence, [0, 'W'], '继续: the miss');
  } else assert.deepEqual(h.evidence, [0, 'W'], 'not claimable: written at once');
  fresh(); assert.deepEqual(J(write, prompt(write), near, {}).evidence, [h.r.ok ? 1 : 0, 'W'], 'no o.hold: never held');
  fresh(); assert.deepEqual(J(write, prompt(write), ref).evidence, [1, 'W']);
  // a verdict a station already has (o.judged) is the verdict
  fresh(); assert.deepEqual(J(choice, prompt(choice), 99, { judged: { ok: true, why: '' } }).evidence, [1, 'L']);
});

// the forms, each on a stub of itself (its prototype + the fields its _judgeRecord reads; side effects no-ops), with
// the options its own stations hand it — and its policy for judgeRecord's o
const base = (level) => ({ level, gates: level.gates, P: LEARN.puzzle, firsts: 0, firstRight: 0, right: new Set(), streak: 0, rightN: 0, relearn: [], relearnRight: 0, t: 0, log: [], _emit: noop, _styleGates: noop, _onRight: noop, ui: { say: noop, setBag: noop } });
const FORMS = {
  puzzle: { Form: LearnFlow, stub: (lv) => Object.assign(Object.create(LearnFlow.prototype), base(lv), { play: {} }), policy: (o) => o },
  runner: { Form: RunnerFlow, stub: (lv) => Object.assign(Object.create(RunnerFlow.prototype), base(lv), { play: null }), policy: (o) => ({ hinted: o.hinted, hold: true, decided: o.decided, claim: o.claim, at: o.at }) },
  duel: { Form: DuelFlow, stub: (lv) => Object.assign(Object.create(DuelFlow.prototype), base(lv), { D: LEARN.duel, shield: false, model: { duelCadence: 6 } }), policy: (o) => ({ judged: o.judged, hinted: o.hinted }) },
  boss: { Form: BossFlow, stub: (lv) => Object.assign(Object.create(BossFlow.prototype), base(lv), { plan: { phases: [{ id: 'R', hp: [1, 0.5], items: [1] }] }, perPhase: {}, boss: { maxHp: 1000 }, _hit: noop }), policy: (o) => ({ judged: o.judged, hinted: o.hinted, hold: true, decided: o.decided, claim: o.claim }) },
  versus2: { Form: Versus2Flow, stub: (lv) => Object.assign(Object.create(Versus2Flow.prototype), base(lv), { V: LEARN.versus2, q: null, match: { local: { ink: 100 } }, _toHost: noop, _progress: noop }), policy: (o) => ({ judged: o.judged, hinted: o.hinted }) },
  coop2: { Form: Coop2Flow, stub: (lv) => Object.assign(Object.create(Coop2Flow.prototype), base(lv), { q: null, mine: { firsts: 0, firstRight: 0, right: 0 }, _bcast: noop }), policy: (o) => ({ judged: o.judged, hinted: o.hinted }) },
};
const PLANS = { puzzle: 'puzzle', runner: 'race', duel: 'duel', boss: 'duel', versus2: 'duel', coop2: 'puzzle' };

test('every form against judgeRecord: the same leaf (and the same hold) as the one path with the form\'s own policy — every scored item of week 1, right / wrong / a hint / a near miss held, then claimed or not', () => {
  let n = 0;
  for (const [form, X] of Object.entries(FORMS)) for (const d of W1.days) {
    const lv = planDay(W1, d.n, PLANS[form]); Object.assign(lv, { week: 1, day: d.n, weekRef: W1 });
    for (const g of lv.gates) for (const it of g.items) {
      if (!(it.meta && it.meta.scored)) continue;
      const p = prompt(it), right = rightAnswerOf(it, p), typed = p.type !== 'choice';
      const cases = [[right, {}], [typed ? 'zzzz' : (right + 1) % p.options.length, {}]];
      if (typed) { const near = String(right).includes(' ') ? String(right).split(' ').slice(0, -1).join(' ') : String(right).slice(0, -1); cases.push([right, { hinted: true }], [near, { hinted: true, hold: true }], [near, { decided: true, claim: true }], [near, { hold: true }]); }
      for (const [ans, o] of cases) {
        const item = { ...it, _tries: 0, _form: null }, gg = { id: g.id, phase: 'R', locks: 0, queue: [], items: g.items };
        fresh(); const F = X.stub(lv);
        if (form === 'versus2') F.q = { item, g: gg, p, q: 1, t0: 0, answered: false };
        if (form === 'coop2') F.q = { item, gate: gg, p, q: 1, role: 'hands', answered: false };
        const a = X.Form.prototype._judgeRecord.call(F, gg, item, p, ans, { ...o, at: AT }), leafA = leafOf(it.id);
        fresh(); const b = judgeRecord({ item: { ...it, _tries: 0, _form: null }, p, ans, o: X.policy({ ...o, at: AT }), store }), leafB = leafOf(it.id);
        assert.deepEqual(leafA, leafB, `${form} ${it.id} ${JSON.stringify(o)}`);
        assert.equal(!!a.held, !!b.held, `${form} ${it.id}: held`);
        n++;
      }
    }
  }
  assert.ok(n > 3000, n + ' cases');
});

test('the sources: under src/learn only play/judge.js writes a first answer; every form\'s _judgeRecord goes through judgeRecord once; no station judges', () => {
  const root = new URL('../../src/learn/', import.meta.url);
  const files = [];
  const walk = (dir) => { for (const e of readdirSync(new URL(dir, root), { withFileTypes: true })) { if (e.isDirectory()) walk(dir + e.name + '/'); else if (e.name.endsWith('.js')) files.push(dir + e.name); } };
  walk('');
  const strip = (s) => s.replace(/\/\/.*$/gm, '');
  for (const f of files) {
    if (f === 'store.js' || f === 'engine-stub.js') continue;   // (the store itself, and B's stand-in for it)
    const src = strip(readFileSync(new URL(f, root), 'utf8')), n = (src.match(/recordFirst\(/g) || []).length;
    assert.equal(n, f === 'play/judge.js' ? 1 : 0, `${f}: recordFirst ×${n}`);
  }
  for (const f of ['flow.js', 'play/runner/runner.js', 'forms/duel.js', 'forms/boss.js', 'forms/versus2.js', 'forms/coop2.js']) {
    const src = strip(readFileSync(new URL(f, root), 'utf8'));
    assert.ok(/_judgeRecord\(g, item, p, ans, o = \{\}\)/.test(src), `${f}: the signature`);
    assert.equal((src.match(/judgeRecord\(\{/g) || []).length, 1, `${f}: judgeRecord once`);
  }
});
