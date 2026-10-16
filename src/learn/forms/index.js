// 关卡学习 — the forms registry (docs/LEVELS.md §2): a day of the course (or the week's 周考) as a level of one of the
// four forms, built from D's design (planDay / bossPlan) on A's content, played by one flow class each:
//   puzzle → src/learn/flow.js (B)        race → forms/race.js       duel → forms/duel.js       boss → forms/boss.js
//
//   await buildLearn({ week, day, kind, short }) → { kind, level, Flow, time, duration, world, short, weekRef }
//     level     the planned level (A's gates with their items + D's design per gate; the boss: bossPlan's phases)
//     Flow      the class match.js instantiates as match.learn (new Flow(match, learnOpts))
//     time      'day' | 'dusk' (the design's time of day for the stage)
//     duration  the match clock to start with (a duel's first round, the boss's phases), undefined for solo forms
//     world     the stage variant to build: 'zones' for a duel (its ramps), 'turf' otherwise
//     short     the audits' shortened level (?short=1): two gates, two items each, a 60 s clock
// main.js calls this and nothing else of the forms; match.js only reads .kind and .Flow.
import { G, on } from '../../core/ctx.js';
import { h } from '../../ui/ui-util.js';
import { GLYPHS } from '../../ui/ui-icons.js';
import { LEARN } from '../../config.js';
import { loadWeek, daySteps } from '../api.js';
import { planDay, bossPlan, quizPlan, FORMS } from '../design.js';
import { LearnFlow } from '../flow.js';
import { RaceFlow } from './race.js';
import { DuelFlow } from './duel.js';
import { BossFlow } from './boss.js';
import { shortenLevel, shortenBoss, phaseTimeTotal } from './common.js';

export const LEARN_KINDS = [...FORMS, 'quiz'];   // ['puzzle', 'race', 'duel', 'boss'] + the 今日小考 (one duel round, LEVELS §1.2)
const FLOWS = { puzzle: LearnFlow, race: RaceFlow, duel: DuelFlow, boss: BossFlow };

export async function buildLearn({ week, day, kind, short = false, gate = 0 }) {
  const w = await loadWeek(week);
  if (kind === 'quiz') return buildQuiz(w, week, day, short);
  if (kind === 'boss') {
    let plan = bossPlan(w);
    if (short) plan = shortenBoss(plan);
    const level = { ...plan, week, day: 0, weekRef: w, gates: [], title: String(w.title || '') };
    return { kind, level, Flow: FLOWS.boss, time: plan.time || 'dusk', duration: short ? 60 * plan.phases.length : phaseTimeTotal(plan), world: 'turf', short, weekRef: w };
  }
  let level = planDay(w, day, kind);   // (a kind outside the four forms — 'plan', none given — is the day's planned form)
  if (!FORMS.includes(kind)) kind = level.kind || 'puzzle';
  if (short) level = shortenLevel(level, 2, 2, gate > 0 ? gate - 1 : 0);
  // the numeric week / day the flows and the HUD read (A's head() writes week: 'w1'); the week object for store.due
  Object.assign(level, { week, day, weekRef: w });
  return { kind, level, Flow: FLOWS[kind] || LearnFlow, time: level.time || 'day', duration: kind === 'duel' ? (short ? 60 : undefined) : undefined, world: kind === 'duel' ? 'zones' : 'turf', short, weekRef: w };
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
