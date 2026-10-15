// src/learn/levels.js — level definitions (docs/LEARN.md §4, §5): data only, computed from the content; flow.js plays them.
//   puzzleLevel(week, day) → { kind: 'puzzle', stage, gates: [{ id, stepId, items, pos: null }], signs }
//   raceLevel(week, day)   → the same shape, due items first (the checkpoints she needs most come first)
//   duelLevel(week, day)   → the same shape with the zone-control rules
//   bossLevel(week)        → the week as four phases: L (listening, pron) · R (vocab, grammar, reading) · W · S
// One gate per step that has something to ask; a step the game only shows (lesson) is a sign, not a gate. Every item of
// a step is in its gate (nothing is dropped, LEARN §1): flow.js decides how many to ask per gate — the review day's
// symreview (48) and flash-fromWeek (150) are large on purpose.
import { daySteps, dayOf } from './content.js';
import { store } from './store.js';

export const STAGE = 'tidewater';
const PHASE_OF = { listening: 'L', pron: 'L', vocab: 'R', grammar: 'R', reading: 'R', writing: 'W', speaking: 'S' };
const PHASES = ['L', 'R', 'W', 'S'];

function gate(step, extra) {
  return Object.assign({ id: 'gate:' + step.id, stepId: step.id, kind: step.kind, title: step.title, minutes: step.minutes, items: step.items, pos: null }, extra);
}
function gatesOf(steps) { return steps.filter((s) => s.kind !== 'lesson' && s.items.length).map((s) => gate(s)); }
function signsOf(steps) { return steps.filter((s) => s.kind === 'lesson' || !s.items.length).map((s) => ({ id: 'sign:' + s.id, stepId: s.id, kind: s.kind, title: s.title, items: s.items, pos: null })); }
function head(kind, week, day) {
  const d = day == null ? null : dayOf(week, day);
  return { kind, stage: STAGE, week: week.id, day: day == null ? null : Number(day), title: d ? String(d.title || '') : String(week.title || ''), teacher: d ? String(d.teacher || '') : '' };
}
function dueSet(week) { try { return new Set(store.due(week)); } catch (e) { return new Set(); } }

export function puzzleLevel(week, day) {
  const steps = daySteps(week, day);
  return Object.assign(head('puzzle', week, day), { gates: gatesOf(steps), signs: signsOf(steps) });
}

export function raceLevel(week, day) {
  const steps = daySteps(week, day), due = dueSet(week);
  const gates = gatesOf(steps).map((g) => {
    const items = g.items.slice().sort((a, b) => Number(due.has(b.id)) - Number(due.has(a.id)));
    return Object.assign(g, { items, due: items.filter((it) => due.has(it.id)).length });
  });
  gates.sort((a, b) => Number(b.due > 0) - Number(a.due > 0)); // stable: checkpoints with due items first, else the day's order
  return Object.assign(head('race', week, day), { gates, signs: signsOf(steps), checkpoints: gates.length, due: [...due] });
}

export function duelLevel(week, day) {
  const steps = daySteps(week, day);
  return Object.assign(head('duel', week, day), { gates: gatesOf(steps), signs: signsOf(steps), rules: { mode: 'zones', teams: 2 } });
}

// the weekly exam: every step with something to score, including the write steps the day levels only show (their items
// are judged by gen.js WT); speaking (unscored until the speech server is wired) leaves phase S empty for now
export function bossLevel(week) {
  const gates = [];
  (week.days || []).forEach((d) => daySteps(week, d.n).forEach((s) => {
    const phase = PHASE_OF[s.meta.k];
    if (!phase || !s.meta.scored) return;
    gates.push(gate(s, { phase, day: Number(d.n) || 0 }));
  }));
  gates.sort((a, b) => PHASES.indexOf(a.phase) - PHASES.indexOf(b.phase) || a.day - b.day);
  return Object.assign(head('boss', week, null), { gates, phases: PHASES.slice(), boss: 'hullbreaker' });
}
