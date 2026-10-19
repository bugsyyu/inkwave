// 关卡学习 — the forms registry (docs/LEVELS.md §2): a day of the course (or the week's 周考) as a level of one of the
// four forms, built from D's design (planDay / bossPlan) on A's content, played by one flow class each:
//   puzzle → src/learn/flow.js (B)   race → play/runner/runner.js (墨浪跑酷)   duel → forms/duel.js   boss → forms/boss.js
//   review → the week's due items as one 墨浪跑酷 (src/learn/review.js, LEARN §36; nothing due → throws, e.zh says so)
//
//   await buildLearn({ week, day, kind, short }) → { kind, level, Flow, time, duration, world, short, weekRef }
//     level     the planned level (A's gates with their items + D's design per gate; the boss: bossPlan's phases)
//     Flow      the class match.js instantiates as match.learn (new Flow(match, learnOpts))
//     time      'day' | 'dusk' (the design's time of day for the stage)
//     duration  the match clock to start with (a duel's first round, the boss's phases), undefined for solo forms
//     world     the stage variant to build: 'zones' for a duel (its ramps), 'turf' otherwise
//     short     the audits' shortened level (?short=1): two gates, two items each, a 60 s clock
//     gate      the audits' start (?gate=N): a short level from its N-th gate; a whole one (play-8: a whole day run in
//               segments, each picking up where the one before stopped — the store keeps her answers) from its N-th gate
//               / round / phase on, every item of them — and with ?skip=K, its first gate from its K-th item (the ones
//               before it were answered in the segment before; the write wall's sentences when the gates are done)
// main.js calls this and nothing else of the forms; match.js only reads .kind and .Flow.
import { G, on } from '../../core/ctx.js';
import { h } from '../../ui/ui-util.js';
import { GLYPHS } from '../../ui/ui-icons.js';
import { LEARN } from '../../config.js';
import { loadWeek, daySteps, store, reviewPlan } from '../api.js';
import { planDay, bossPlan, quizPlan, FORMS } from '../design.js';
import { LearnFlow } from '../flow.js';
import { DuelFlow } from './duel.js';
import { BossFlow } from './boss.js';
import { Versus2Flow } from './versus2.js';
import { Coop2Flow } from './coop2.js';
import { shortenLevel, shortenBoss, phaseTimeTotal } from './common.js';
import { RunnerFlow } from '../play/runner/runner.js';   // 墨浪跑酷 (LEARN §20, §23): the race as a lane runner
import '../quiz-run.js';   // 今日小考 into her account (LEARN §41): the quiz's answers as the lesson page's quiz record

// ['puzzle', 'race', 'duel', 'boss'] + the 今日小考 (one duel round, LEVELS §1.2) + 'runner' (play-4's ?kind=runner: the
// same as 'race' now — the race IS the runner) + 'review' (复习关, LEARN §36: the main menu's 「复习 K 个」)
export const LEARN_KINDS = [...FORMS, 'quiz', 'runner', 'review'];
// 题即玩法 (docs/PLAY.md §5.2, play-4): the race is the runner (墨浪跑酷 — the form id stays 'race'). flowFor(kind) is the
// pure pick (Node-tested).
export function flowFor(kind) {
  return { puzzle: LearnFlow, race: RunnerFlow, duel: DuelFlow, boss: BossFlow }[kind] || LearnFlow;
}
const FLOWS = { puzzle: LearnFlow, race: RunnerFlow, duel: DuelFlow, boss: BossFlow };

// (?skip=K, the audits' mid-gate save point: read here, not threaded through main.js)
const skipOf = () => { try { return typeof location !== 'undefined' ? Math.max(0, +(new URLSearchParams(location.search).get('skip') || 0) | 0) : 0; } catch (e) { return 0; } };
function resumeAt(level, gate, skip) {
  const gates = level.gates.slice(gate - 1);
  if (skip > 0 && gates.length) gates[0] = { ...gates[0], items: gates[0].items.slice(skip) };
  const signs = !gates.length && skip > 0 ? (level.signs || []).map((sg) => (sg.design && sg.design.mechanic === 'write-wall' ? { ...sg, items: (sg.items || []).slice(skip) } : sg)) : level.signs;
  return { ...level, gates, signs };
}

export async function buildLearn({ week, day, kind, short = false, gate = 0 }) {
  const w = await loadWeek(week);
  if (kind === 'quiz') return buildQuiz(w, week, day, short);
  if (kind === 'review') return buildReview(w, week, day, short);
  if (kind === 'runner') kind = 'race';
  if (kind === 'boss') {
    let plan = bossPlan(w);
    if (short) plan = shortenBoss(plan);
    else if (gate > 1 || skipOf()) { const ph = plan.phases.slice(Math.max(1, gate) - 1), k = skipOf(); if (k && ph[0]) ph[0] = { ...ph[0], items: ph[0].items.slice(k) }; plan = { ...plan, phases: ph }; }   // (a whole 周考 in segments: from its N-th phase, its K-th item)
    const level = { ...plan, week, day: 0, weekRef: w, gates: [], title: String(w.title || '') };
    return { kind, level, Flow: FLOWS.boss, time: plan.time || 'dusk', duration: short ? 60 * plan.phases.length : phaseTimeTotal(plan), world: 'turf', short, weekRef: w };
  }
  let level = planDay(w, day, kind);   // (a kind outside the four forms — 'plan', none given — is the day's planned form)
  if (!FORMS.includes(kind)) kind = level.kind || 'puzzle';
  if (short) level = shortenLevel(level, 2, 2, gate > 0 ? gate - 1 : 0);
  else if (gate > 1 || skipOf()) level = resumeAt(level, Math.max(1, gate), skipOf());   // (a whole day in segments: from its N-th gate, its K-th item)
  // the numeric week / day the flows and the HUD read (A's head() writes week: 'w1'); the week object for store.due
  Object.assign(level, { week, day, weekRef: w });
  return { kind, level, Flow: FLOWS[kind] || LearnFlow, time: level.time || 'day', duration: kind === 'duel' ? (short ? 60 : undefined) : undefined, world: kind === 'duel' ? 'zones' : 'turf', short, weekRef: w };
}

// The two-player online forms (docs/LEARN.md §10, §14), built on every client from the host's start record
// (cfg.learn = { week, day, kind, short }) — the same content files give the same level everywhere; the room's own stage
// is played (the host's lobby pick), not the plan's:
//   versus2 → the day's duel plan, Versus2Flow, on the stage's zones variant (Match mode 'zones' + the learn layer)
//   coop2   → the day's puzzle plan, Coop2Flow, on the turf stage (Match mode 'learn', both on one team, no clock)
//   await buildNetLearn(cfg.learn) → { kind, level, Flow, world, mode, short, weekRef, byId }
export const NET_KINDS = ['versus2', 'coop2'];
export async function buildNetLearn({ week = 1, day = 1, kind = 'versus2', short = false } = {}) {
  week = Math.max(1, Math.min(LEARN.weeks, +week || 1)); day = Math.max(1, Math.min(LEARN.days, +day || 1));
  if (!NET_KINDS.includes(kind)) kind = 'versus2';
  const w = await loadWeek(week);
  const coop = kind === 'coop2';
  let level = planDay(w, day, coop ? 'puzzle' : 'duel');
  if (short) level = shortenLevel(level, coop ? LEARN.coop2.shortGates : 2, 2);
  Object.assign(level, { week, day, weekRef: w });
  // every item of the week by id: a due item from either player's store can be asked even when it is another day's
  const byId = new Map();
  for (const d of w.days || []) for (const s of daySteps(w, d.n)) for (const it of s.items) if (!byId.has(it.id)) byId.set(it.id, it);
  const Flow = coop ? Coop2Flow : Versus2Flow;
  return { kind, level, Flow, world: coop ? 'turf' : 'zones', mode: coop ? 'learn' : 'zones', short: !!short, weekRef: w, byId };
}

// 今日小考 (LEVELS §1.2, §2.3): after the day's exit on days 1–6, one duel round at dusk on the same stage — quizPlan's
// 8 items (50 % due / 30 % today's misses / 20 % today's new, the last one something she knows), her + 1 against 2.
// First answers today count as evidence like any other; items she answered in the level are practice (store says so).
function buildQuiz(w, week, day, short) {
  const misses = []; try { const F = G.match && G.match.learn; if (F && F.relearn) misses.push(...F.relearn.map((it) => it.id)); } catch (e) { /* none */ }
  const q = quizPlan(w, day, misses);
  const byId = new Map();
  for (const d of w.days || []) for (const s of daySteps(w, d.n)) for (const it of s.items) if (!byId.has(it.id)) byId.set(it.id, it);
  let items = q.items.map((x) => byId.get(x.id)).filter(Boolean);
  if (short) items = items.slice(0, 2);
  const gate = { id: 'gate:quiz:' + w.id + 'd' + day, stepId: 'quiz', kind: 'mixed', title: '今日小考', minutes: q.minutes, items, pos: null, design: null, index: 0 };
  const level = { kind: 'duel', quiz: true, form: 'duel', week, day, weekRef: w, stage: q.stage, time: q.time || 'dusk', title: '今日小考', teacher: '', gates: [gate], signs: [], review: false, short: !!short, minutes: q.minutes, rules: q.rules, bots: q.bots };
  return { kind: 'duel', level, Flow: FLOWS.duel, time: level.time, duration: short ? 60 : LEARN.quiz.minutes * 60, world: 'zones', short: !!short, weekRef: w, sides: [1 + (q.bots.allies || 1), q.bots.enemies || 2] };
}

// 复习关 (LEARN §36): store.due(week) — the memory model's due items, most forgotten first — as one race (reviewPlan:
// ≤ 24 items, 3–4 gates of ≤ 8, under 8 minutes, each item in its own step's mechanic, on the review day's stage).
// Answers are evidence as in every level (当天首答; the runner's one judging path). Nothing due → an Error whose .zh
// main.js toasts.
export const NOTHING_DUE = '现在没有要复习的';
function buildReview(w, week, day, short) {
  let ids = []; try { ids = store.due(w); } catch (e) { ids = []; }
  let level = reviewPlan(w, ids);
  if (!level) { const e = new Error(NOTHING_DUE); e.zh = NOTHING_DUE; e.code = 'nothing-due'; throw e; }
  if (short) level = shortenLevel(level, 2, 2);
  Object.assign(level, { week, day, weekRef: w });
  return { kind: 'race', review: true, level, Flow: ReviewFlow, time: level.time || 'day', duration: undefined, world: 'turf', short: !!short, weekRef: w };
}
// the runner as it is, with three review touches: its stars under their own key (a review walks no day), one line on
// the race's note at GO (this is the review: how many, most forgotten first), and 「再来一次」 is another review
class ReviewFlow extends RunnerFlow {
  constructor(match, opts) { super(match, opts); this.dayKey = `w${this.week}review`; }
  _go() {
    const was = this.started;
    super._go();
    if (was || !this.started) return;
    const n = (this.level.reviewOf && this.level.reviewOf.n) || this.scoredN;
    clearTimeout(this._reviewT);
    this._reviewT = setTimeout(() => this.ui?.say?.(`复习关 · 这一周该复习的 ${n} 个 · 最忘的在前`), 900);   // (after the 出发 banner)
  }
  _results() {
    super._results();
    const H = G.hud && G.hud.learn;
    if (H && H.rAgain) H.rAgain.onclick = () => { G.hud.playSound?.('ui_confirm'); G.game?.api?.startLearn?.({ week: this.week, day: this.day, kind: 'review' }); };
  }
  dispose() { clearTimeout(this._reviewT); super.dispose(); }
}

// the hook on the puzzle's results card (B's hud-learn, used as is): a 「今日小考」 button on days 1–6 — never on the
// review day or after a boss (LEVELS §1.2), and not after a quiz itself
on('learn:done', (data) => {
  const m = G.match, F = m && m.learn, card = G.hud && G.hud.learn && G.hud.learn.results_;
  if (!F || !card || m.learnKind !== 'puzzle' || !(data.day >= 1 && data.day <= 6) || F.level.quiz) return;
  const btns = card.querySelector('.iw-learn__rbtns'); if (!btns) return;
  btns.querySelectorAll('.iw-learn__quiz').forEach((b) => b.remove());
  const b = h('button', { class: 'iw-learn__btn iw-learn__big iw-learn__quiz', type: 'button' }, h('i', { html: GLYPHS.swords }), h('span', null, `今日小考 · ${LEARN.quiz.n} 题 · 傍晚一轮对抗赛`));
  b.addEventListener('click', () => { G.hud.playSound?.('ui_confirm'); G.game?.api?.startLearn?.({ week: data.week, day: data.day, kind: 'quiz' }); });
  btns.insertBefore(b, btns.firstChild);
});
