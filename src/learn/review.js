// src/learn/review.js — 复习关 (docs/LEARN.md §36): the week's due items (store.due: the memory model's, most forgotten
// first) as one level of 墨浪跑酷, the same shape planDay hands the flows (gates with their items + a design per gate), so
// the runner plays it as it is. Pure: no DOM, no three.js, no store (the due ids come in).
//
//   reviewPlan(week, dueIds, opts) → a race level | null (nothing due, or nothing of it this week's)
//     at most REVIEW.max items in memory order, as long as the pace model keeps the run under REVIEW.minutes; 3 gates
//     (4 above 18 items), each ≤ REVIEW.perGate; every item plays as it does in its own step (playOf: the step's
//     mechanic in the race); the stage and the time of day are the week's review day's (dayPlanFor(week, 7))
//   one reading passage a level at most (its questions together, its passage the board before the start — PLAY §4 M6);
//   the other passages' questions stay due for the next review. An item taught twice (the word list and its cards) is
//   asked once, as the step that first teaches it.
// Nothing here records: the runner judges and store.recordFirst writes (当天首答, as in every level).
import { daySteps } from './content.js';
import { dayPlanFor, mechanicOf, RULES, PROPS, PROPS_OF, BOTS_OF, RETRY } from './design.js';

export const REVIEW = {
  max: 24, perGate: 8, minutes: 8, day: 7, passage: 3,   // (passage: questions of the one passage at most)
  // seconds an item takes in the runner (a curtain row · a beat row · a typed word · a dictation sentence · a sentence
  // written), the passage board before the start; the budget is the run's answering time, retries not counted
  pace: { lane: 9, beat: 9, word: 14, dict: 28, write: 40, passage: 60 },
};

const paceOf = (it, P) => { const m = it.meta || {}; return m.input === 'choice' ? (m.kind === 'sym' || m.kind === 'pair' ? P.beat : P.lane) : m.input === 'write' ? P.write : m.kind === 'dict' ? P.dict : P.word; };
const asks = (it) => { const m = it && it.meta; return !!(m && m.scored && (m.input === 'choice' || m.input === 'type' || m.input === 'write')); };

// every item of the week by id, as the step that first teaches it: { item, step, mechanic, day }
function itemsOf(week) {
  const out = new Map();
  for (const d of week.days || []) for (const s of daySteps(week, d.n)) {
    const mech = mechanicOf(s);
    for (const it of s.items) if (!out.has(it.id) && asks(it)) out.set(it.id, { item: it, step: s, mechanic: mech, day: Number(d.n) || 0 });
  }
  return out;
}
// the review day's plan (the last day that has one, for a week without a day 7)
function reviewDay(week, d0) {
  for (let d = d0; d >= 1; d--) { const P = dayPlanFor(week, d); if (P) return { d, P }; }
  return { d: d0, P: null };
}

export function reviewPlan(week, dueIds, opts = {}) {
  const R = { ...REVIEW, ...opts, pace: { ...REVIEW.pace, ...(opts.pace || {}) } };
  const ids = [...new Set((dueIds || []).map(String))];
  if (!week || !ids.length) return null;
  const at = itemsOf(week), budget = R.minutes * 60;
  // memory order; the one passage's questions join the first of them; stop at max or at the time budget
  const units = [];
  let n = 0, secs = 0, passage = null, block = null;
  for (const id of ids) {
    const r = at.get(id);
    if (!r || n >= R.max) continue;
    const reading = r.mechanic === 'reading-room';
    if (reading && passage && passage !== r.step.id) continue;   // (another passage: due again next time)
    if (reading && block && block.length >= R.passage) continue;
    const cost = paceOf(r.item, R.pace) + (reading && !block ? R.pace.passage : 0);
    if (secs + cost > budget) continue;   // (a shorter one further down may still fit)
    secs += cost; n++;
    if (reading) { if (!block) { passage = r.step.id; block = []; units.push(block); } block.push(r); }
    else units.push([r]);
  }
  const flat = units.flat();
  if (!flat.length) return null;
  // 3 gates (4 above 18), as even as can be; a cut never splits the passage's questions
  const K = flat.length > 18 ? 4 : Math.min(3, flat.length), cuts = [];
  for (let i = 0, c = 0; i < K - 1; i++) { c += Math.floor(flat.length / K) + (i < flat.length % K ? 1 : 0); cuts.push(c); }
  const b0 = block ? flat.indexOf(block[0]) : -1, bl = block ? block.length : 0;
  if (bl > 1) for (let i = 0; i < cuts.length; i++) if (cuts[i] > b0 && cuts[i] < b0 + bl) cuts[i] = cuts[i] - b0 >= bl / 2 ? b0 + bl : b0;
  const bounds = [0, ...cuts, flat.length], parts = [];
  for (let i = 0; i < bounds.length - 1; i++) { const p = flat.slice(bounds[i], bounds[i + 1]); if (p.length) parts.push(p); }
  const { d: rd, P } = reviewDay(week, R.day), spots = P ? P.gates.map((g) => g.spot) : [];
  const gates = parts.map((part, k) => {
    // the passage's questions lead their gate: the runner shows the passage of a gate's first item (wire/boards gateSpecs;
    // a question carries only the passage's title, so the first one is a copy with its step's whole passage)
    const rows = part.some((r) => r.mechanic === 'reading-room') ? [...part.filter((r) => r.mechanic === 'reading-room'), ...part.filter((r) => r.mechanic !== 'reading-room')] : part;
    if (rows[0].mechanic === 'reading-room' && rows[0].step.meta && rows[0].step.meta.passage) { const r = rows[0]; rows[0] = { ...r, item: { ...r.item, meta: { ...r.item.meta, passage: r.step.meta.passage } } }; }
    const s = rows.reduce((a, r) => a + paceOf(r.item, R.pace), 0), minutes = +(s / 60).toFixed(1);
    const atK = +((k + 1) / (parts.length + 1)).toFixed(3);
    return {
      id: 'gate:review:' + week.id + ':' + (k + 1), stepId: 'review:' + week.id + ':' + (k + 1), kind: 'mixed', title: `复习 · 第 ${k + 1} / ${parts.length} 门`, minutes,
      items: rows.map((r) => r.item), pos: null, due: rows.length,
      design: { step: null, mechanic: rows[0].mechanic === 'reading-room' ? 'reading-room' : null, mechanics: rows.map((r) => r.mechanic), steps: rows.map((r) => r.step.id), ask: rows.length, batch: 0, minutes, at: atK, spot: spots.length ? spots[Math.min(spots.length - 1, Math.round(atK * (spots.length - 1)))] : null, review: true },
    };
  });
  const minutes = Math.ceil(secs / 60);
  return {
    kind: 'race', stage: (P && P.stage) || 'tidewater', week: week.id, day: rd, title: `复习关 · ${flat.length} 个`, teacher: '',
    gates, signs: [], checkpoints: gates.length, due: ids,
    form: 'race', alt: [], time: (P && P.time) || 'day', minutes, review: true, route: 'loop',
    rules: RULES.race, props: PROPS_OF.race.map((id) => PROPS[id]), bots: BOTS_OF.race, retry: RETRY,
    extras: { quiz: null, note: '复习关：这一周记忆模型说该复习的，最忘的在前；答案照常记（当天首答）' },
    reviewOf: { week: week.id, n: flat.length, due: ids.length, left: ids.length - flat.length, minutes, passage },
  };
}
