// 关卡学习 — the pure parts the three forms share (docs/LEVELS.md §2.2–§2.8): no DOM, no three.js, no flow.js, so
// `node --test tests/learn/forms.test.mjs` can run every rule here on a fixture nav graph or on src/world/maps.js.
//
//   route:  astar(nav, a, b, opts) · loopRoute(nav, start, goal, opts) · cumulative(nodes, path) · placeAlong(cum, n, opts) · fitGates(defs, fit)
//   bots:   botRoll(model, rnd) · rubberDelay(model, lead) · finishOrder(racers)
//   props:  drawProp(form, rnd, held) · propOnRight(form, right, streak, held) · useProp(id)
//   effects: duelFlood(streak) · streakKind(streak)
//   boss:   phaseOfHp(frac, plan) · bossDamage(plan, phaseId) · phaseBudget(plan, phaseId) · phaseTimeTotal(plan)
//   retry / stars: relearnPlan(items, max) · starsOf(summary) · readStars(backend) · writeStars(dayKey, n, backend)
//   level:  shortenLevel(level) · shortenBoss(plan) · fmtClock(s)
import { LEARN } from '../../config.js';
import { PROP_DROP, PROPS, PROPS_OF, BOT_ANSWER, EFFECTS, RETRY, stars } from '../design.js';
import { judge } from '../api.js';

/* ───────────────────────────── route: A* with a penalty, a loop, checkpoints along it ───────────────────────────── */
class Heap {
  constructor() { this.ids = []; this.pr = []; }
  get size() { return this.ids.length; }
  push(id, p) {
    const ids = this.ids, pr = this.pr;
    let i = ids.length; ids.push(id); pr.push(p);
    while (i > 0) { const j = (i - 1) >> 1; if (pr[j] <= p) break; ids[i] = ids[j]; pr[i] = pr[j]; i = j; }
    ids[i] = id; pr[i] = p;
  }
  pop() {
    const ids = this.ids, pr = this.pr, top = ids[0], lid = ids.pop(), lp = pr.pop();
    if (ids.length) {
      let i = 0; const n = ids.length;
      for (;;) {
        let l = i * 2 + 1, r = l + 1, m = i, mp = lp;
        if (l < n && pr[l] < mp) { m = l; mp = pr[l]; }
        if (r < n && pr[r] < mp) { m = r; mp = pr[r]; }
        if (m === i) break;
        ids[i] = ids[m]; pr[i] = pr[m]; i = m;
      }
      ids[i] = lid; pr[i] = lp;
    }
    return top;
  }
}

// A* over a nav graph { nodes: [{ x, y, z, nb: [{ to, cost, type }], zone?, wet? }], valid? } from node a to node b.
// opts: team (the other side's spawn zone is closed), noClimb (default true: no inked-wall edges), penalty(node) → extra
// cost per step onto that node (the loop's way back uses it to leave the way out alone), maxIter. Returns ids or null.
export function astar(nav, a, b, opts = {}) {
  if (a == null || b == null || a < 0 || b < 0) return null;
  const nodes = nav.nodes, team = opts.team ?? 0, noClimb = opts.noClimb !== false, pen = opts.penalty || null, maxIter = opts.maxIter || 60000;
  const goal = nodes[b];
  const h = (n) => Math.hypot(n.x - goal.x, n.z - goal.z) + Math.abs(n.y - goal.y) * 0.5;
  const g = new Map([[a, 0]]), from = new Map(), closed = new Set(), heap = new Heap();
  heap.push(a, h(nodes[a]));
  let it = 0;
  while (heap.size && it++ < maxIter) {
    const cur = heap.pop();
    if (cur === b) break;
    if (closed.has(cur)) continue;
    closed.add(cur);
    for (const e of nodes[cur].nb) {
      if (noClimb && e.type === 'climb') continue;
      const m = nodes[e.to];
      if (nav.valid && !nav.valid[e.to]) continue;
      if (m.zone >= 0 && m.zone !== team) continue;
      const ng = g.get(cur) + e.cost + (m.wet === 2 ? 2 : m.wet === 1 ? 0.5 : 0) + (pen ? pen(m) : 0);
      if (!g.has(e.to) || ng < g.get(e.to)) { g.set(e.to, ng); from.set(e.to, cur); heap.push(e.to, ng + h(m)); }
    }
  }
  if (!g.has(b)) return null;
  const out = [];
  for (let k = b; k !== undefined; k = from.get(k)) { out.push(k); if (out.length > 8000) break; }
  return out.reverse();
}

// The race's lap (LEVELS §2.2): out = spawn → the far side, back = the far side → spawn by another lane — every node
// within `avoid` m of the way out costs `avoidCost` more, so the return takes the other lane wherever the stage has
// one and shares a bridge / stair only where it must. loop = out + back (the start node not repeated at the join).
export function loopRoute(nav, start, goal, opts = {}) {
  const avoid = opts.avoid ?? LEARN.race.laneAvoid, avoidCost = opts.avoidCost ?? 6, step = nav.step || 1;
  const out = astar(nav, start, goal, { team: opts.team ?? 0 });
  if (!out) return null;
  const near = new Set();
  const R = Math.max(0, Math.round(avoid / step));
  for (const id of out) {
    const n = nav.nodes[id], cx = Math.round(n.x / step), cz = Math.round(n.z / step);
    for (let dz = -R; dz <= R; dz++) for (let dx = -R; dx <= R; dx++) if (dx * dx + dz * dz <= R * R) near.add((cx + dx) + ',' + (cz + dz));
  }
  const keep = new Set(out.slice(0, 3).concat(out.slice(-3)));   // the ends are shared by nature
  const penalty = (m) => (keep.has(m.id) ? 0 : near.has(Math.round(m.x / step) + ',' + Math.round(m.z / step)) ? avoidCost : 0);
  let back = astar(nav, goal, start, { team: opts.team ?? 0, penalty });
  if (!back) back = out.slice().reverse();
  const shared = out.length > 2 ? back.slice(1, -1).filter((id) => out.includes(id)).length / Math.max(1, back.length - 2) : 1;
  return { out, back, loop: out.concat(back.slice(1)), shared: +shared.toFixed(3) };
}

// cumulative distance along a path (xz plus half the climb, like flow.js)
export function cumulative(nodes, path) {
  const cum = [0];
  for (let i = 1; i < path.length; i++) { const a = nodes[path[i - 1]], b = nodes[path[i]]; cum.push(cum[i - 1] + Math.hypot(b.x - a.x, b.z - a.z) + Math.abs(b.y - a.y) * 0.5); }
  return cum;
}

// n checkpoints along a route of cumulative distances: the first at ≥ `first` m, then evenly to `end` (default: the
// route's length minus `tail`), never closer than `gap` → { fit, at: [path index …], s: [distance …] }. fit < n when the
// route is too short for n (the caller merges the extra gates into the last one: no item is lost).
export function placeAlong(cum, n, opts = {}) {
  const len = cum[cum.length - 1] || 0, first = opts.first ?? LEARN.race.firstGateMin, gap = opts.gap ?? LEARN.race.gap, tail = opts.tail ?? gap;
  const end = Math.max(first, opts.end ?? (len - tail));
  const fit = Math.max(1, Math.min(n, Math.floor((end - first) / gap) + 1));
  const at = [], s = [];
  for (let k = 0; k < fit; k++) {
    const d = fit === 1 ? Math.min(end, Math.max(first, end)) : first + ((end - first) * k) / (fit - 1);
    let i = 0; while (i < cum.length - 1 && cum[i] < d) i++;
    at.push(i); s.push(+cum[i].toFixed(2));
  }
  return { fit, at, s, len: +len.toFixed(2) };
}

// gate definitions trimmed to `fit`: the ones past it fold their items into the last kept gate (LEVELS §0: nothing dropped)
export function fitGates(defs, fit) {
  const out = defs.map((g) => ({ ...g, items: g.items.slice() }));
  while (out.length > Math.max(1, fit)) { const last = out.pop(); out[out.length - 1].items.push(...last.items); }
  return out;
}

/* ───────────────────────────── bots' "answers" ───────────────────────────── */
// a bot at a checkpoint rolls: right with probability `correct`, after a uniform delay; it never sees her question
export function botRoll(model, rnd = Math.random) {
  const m = model || BOT_ANSWER.normal;
  return { ok: rnd() < m.correct, delay: +(m.delay[0] + rnd() * (m.delay[1] - m.delay[0])).toFixed(2) };
}
// the rubber band: a bot `lead` checkpoints ahead of her waits rubber × min(lead, rubberCap) seconds more
export function rubberDelay(model, lead) {
  const m = model || BOT_ANSWER.normal;
  return +(m.rubber * Math.min(Math.max(0, lead | 0), m.rubberCap)).toFixed(2);
}
// finish order: racers with a finish time first (earliest first), the rest by progress (checkpoints, then distance)
export function finishOrder(racers) {
  return racers.slice().sort((a, b) => {
    const fa = a.finish != null, fb = b.finish != null;
    if (fa && fb) return a.finish - b.finish;
    if (fa !== fb) return fa ? -1 : 1;
    return (b.cp - a.cp) || ((b.progress || 0) - (a.progress || 0));
  }).map((r) => r.id);
}

/* ───────────────────────────── props ───────────────────────────── */
// the weighted draw of a form's drop table; null when her bag is full (hold) or the form drops nothing
export function drawProp(form, rnd = Math.random, held = []) {
  const D = PROP_DROP[form];
  if (!D || held.length >= D.hold) return null;
  const ids = Object.keys(D.weights || {}).filter((id) => PROPS[id] && PROPS_OF[form].includes(id));
  const sum = ids.reduce((a, id) => a + D.weights[id], 0);
  if (!sum) return null;
  let r = rnd() * sum;
  for (const id of ids) { r -= D.weights[id]; if (r <= 0) return id; }
  return ids[ids.length - 1];
}
// what a right answer hands out: every everyRight-th right drops one (the draw), a streak of three the shield, of
// five the lane (race) — streak props never come from the draw (LEVELS §2.4)
export function propOnRight(form, right, streak, held = [], rnd = Math.random) {
  const out = { drop: null, streak: null };
  const D = PROP_DROP[form];
  if (D && right > 0 && right % D.everyRight === 0) out.drop = drawProp(form, rnd, held);
  if (form === 'race') {
    if (streak === LEARN.streak.three) out.streak = 'shield';
    if (streak === LEARN.streak.five) out.streak = 'lane';
  }
  return out;
}
// what using a prop does (the flows act on `effect`): 'skip' leap · 'hint' rain (mode H) · 'replay' echo ·
// 'no-detour' shield · 'block-bots' curtain · 'stun-bot' bomb · 'flood-lane' lane
export function useProp(id) {
  const p = PROPS[id];
  return p ? { id, effect: p.effect, sfx: p.sfx, evidence: p.evidence, zh: p.zh } : null;
}

/* ───────────────────────────── effects ───────────────────────────── */
// a duel's flood radius for the k-th right in a row (k ≥ 1): base + per-streak, capped (LEVELS §2.3)
export function duelFlood(streak) {
  const R = EFFECTS.duel.right;
  return +Math.min(R.floodMax, R.flood + R.floodPerStreak * Math.max(0, (streak | 0) - 1)).toFixed(2);
}
// which streak celebration a streak length triggers: 'streak3' | 'streak5' | null (five wins over three)
export function streakKind(streak) {
  if (streak === LEARN.streak.five) return 'streak5';
  if (streak === LEARN.streak.three) return 'streak3';
  return null;
}

/* ───────────────────────────── the boss: HP bands ↔ phases ───────────────────────────── */
// the plan phase an HP fraction lies in: L 100–66, R 66–33, W 33–10, S 10–0 (a band's floor belongs to the next)
export function phaseOfHp(frac, plan) {
  const ph = plan.phases;
  for (let i = 0; i < ph.length; i++) { const [hi, lo] = ph[i].hp; if (frac > lo && frac <= hi + 1e-9) return ph[i].id; }
  return frac <= 0 ? ph[ph.length - 1].id : ph[0].id;
}
// what one right answer of a phase takes off, as a fraction of max HP: the phase's band shared over its items — L / R
// a twentieth each (D's hitPerRight), the W phase's three sentences a third of its band each (the flow judges them one
// by one; D counts them as one question), the S phase's six cards a sixth of the last 10 %
export function bossDamage(plan, phaseId) {
  const ph = plan.phases.find((p) => p.id === phaseId);
  if (!ph) return 0;
  const n = Math.max(1, (ph.items || []).length);
  return +((ph.hp[0] - ph.hp[1]) / n).toFixed(4);
}
export function phaseBudget(plan, phaseId) {
  const ph = plan.phases.find((p) => p.id === phaseId);
  return ph && ph.short ? 60 : (LEARN.boss.phaseTime[phaseId] ?? (ph ? ph.minutes * 60 : 600));
}
export function phaseTimeTotal(plan) { return plan.phases.reduce((a, p) => a + phaseBudget(plan, p.id), 0); }

/* ───────────────────────────── 回炉 and stars ───────────────────────────── */
// the 回炉门's queue: the missed items in the order they were missed, at most LEARN.relearnMax (the rest wait for tomorrow)
export function relearnPlan(missed, max = LEARN.relearnMax) {
  const seen = new Set(), out = [];
  for (const it of missed) { if (!it || seen.has(it.id)) continue; seen.add(it.id); out.push(it); if (out.length >= max) break; }
  return out;
}
export function starsOf(summary) { return stars(summary); }
function parse(raw) { try { const o = raw ? JSON.parse(raw) : null; return o && o.v === 1 ? o : { v: 1, stars: {}, walked: {}, trophies: {} }; } catch (e) { return { v: 1, stars: {}, walked: {}, trophies: {} }; } }
function storage(backend) {
  if (backend) return backend;
  try { if (typeof localStorage !== 'undefined' && localStorage) return localStorage; } catch (e) { /* blocked */ }
  return null;
}
export function readStars(backend) { const be = storage(backend); return parse(be ? be.getItem(LEARN.starsKey) : null); }
// stars never go down (LEVELS §2.8); a trophy (the race's place, a duel's win, the boss's time) sits beside them
export function writeStars(dayKey, n, backend, extra = {}) {
  const be = storage(backend), S = readStars(be);
  const before = S.stars[dayKey] || 0;
  S.stars[dayKey] = Math.max(before, n | 0);
  if (n > 0) S.walked[dayKey] = true;
  if (extra.trophy) S.trophies[dayKey] = extra.trophy;
  if (be) { try { be.setItem(LEARN.starsKey, JSON.stringify(S)); } catch (e) { /* private mode */ } }
  return { before, after: S.stars[dayKey] };
}

/* ───────────────────────────── the question: judge an answer the way B's flow maps it; boards; 回炉 tips ───────────────────────────── */
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9'\s-]/g, ' ').replace(/\s+/g, ' ').trim();
// the same mapping flow.js uses for its reworded forms: a picked word judged as the dictation, a typed word mapped
// to its option, a reshuffled choice mapped back to the original index; everything through the one judge()
export function judgeAnswer(item, p, ans) {
  if (p._flip) return flipJudge(item, ans);
  if (p._alt === 'choice-of-typed') return judge(item, p.options[ans] ? p.options[ans].text : '');
  if (p._alt === 'typed-of-choice') return judge(item, item.options.findIndex((o) => norm(o.en) === norm(ans)));
  if (p._perm) return judge(item, typeof ans === 'number' ? p._perm[ans] : ans);
  return judge(item, ans);
}
// 「我的写法也对」 (IELTS-Base app/exam/ui.js paintVerdict ~1154, app/exam/store.js answer() / claim()): a written sentence
// that gen.js check() calls claimable — the meaning is there (content words ≥ 60 %), no key form (be / -s / article /
// preposition) wrong — may be claimed as right on her own judgement. Until she claims it or goes on, nothing is written
// (the exam store holds it as pending); a claim is re-checked by check() itself (judge(…, { claimed: true })) and stands
// only if it really is claimable: then the day's first answer is [1, 'S'] (the store's self mode: 自评, the weekly
// report asks the teacher to look), and going on without claiming writes the miss as usual, [0, 'W'].
// Only the sentence as asked (not a reworded card — that one is a choice), and not on the 回炉门 (the exam's relearn rounds
// have no claim either).
export function canClaim(item, p, r) {
  return !!(item && item.meta && item.meta.input === 'write' && p && !p._alt && !p._flip && !item._relearn && r && !r.ok && r.claimable);
}
export function claimJudge(item, p, ans) { return judge(item, ans, { claimed: true }); }

// the right answer of a live prompt, for the audits (an option index for a choice, the text for a typed answer)
export function rightAnswerOf(item, p) {
  if (!item || !p) return null;
  if (p._flip) return true;   // (her own rating: 记得)
  if (p._alt === 'choice-of-typed') return (p.options || []).findIndex((o) => o.text === ((item.meta && item.meta.ref) || item.en));
  if (p._alt === 'typed-of-choice') return item.options[item.answer].en;
  if (p.type === 'choice') return p._perm ? p._perm.indexOf(item.answer) : item.answer;
  return (item.meta && item.meta.ref) || item.en;
}

// 快闪翻牌 (LEVELS §1.1, §3.1): the review day's 150-word flash step (mechanic 'flash-flip') is flip cards, not typing —
// the Chinese on the front, think of the English, flip: the word, its IPA, its sound; then her own 「记得 / 不记得」.
// That self-rating is the host's 看词自评, evidence mode F (store.recordFirst({ how: 'F' }), core.js mapEvidence).
// A 「不记得」 is no mistake (no lock): the card comes straight back as the typed card (T / H — the day's first answer
// is already the F, so the typing is practice), and a miss there goes the usual way (reworded, then 回炉).
export const isFlipGate = (g) => !!(g && g.design && g.design.mechanic === 'flash-flip');
export function flipPrompt(item) {
  const m = (item && item.meta) || {}, zh = m.zhFull || item.zh || '';
  return { type: 'flip', text: '看中文，想一想英文怎么说 — 想好了翻过来', zh, tts: null, back: { en: item.en, ipa: m.ipaUs || m.ipa || '', zh, tts: item.tts || item.en }, _flip: true };
}
export function flipJudge(item, ans) {
  const m = (item && item.meta) || {}, zh = m.zhFull || item.zh || '';
  const ok = ans === true || ans === 'yes' || ans === 1;
  return { ok, canonical: item.en, why: ok ? `${item.en}（${zh}）— 记得，记进进度（自评）` : `${item.en}（${zh}）— 没关系，现在把它打一遍`, text: ok ? '记得！' : '没关系 — 马上打一遍' };
}
// which card to show for an item at a gate: the reworded form after a miss, the typed card after a 「不记得」, the flip
// card on the flash-flip gate, else the engine's own prompt
export function cardFor(g, item, base, alt) {
  if (item._form === 'alt') return alt();
  if (item._flipTyped || !isFlipGate(g)) return base();
  return flipPrompt(item);
}

// the 回炉门's help for a missed item (RETRY.later): the tip and examples for a sound, the explanation for a grammar /
// reading question, the meaning for a word, both words for a pair, a slow replay for a sentence
export function relearnTip(item) {
  const m = (item && item.meta) || {}, kind = m.kind;
  if (kind === 'sym') return { zh: ['回炉：' + (m.name || ''), m.tip, (m.examples || []).slice(0, 2).map((e) => e.en + '（' + e.zh + '）').join('、')].filter(Boolean).join(' · '), variant: 'tip' };
  if (kind === 'quiz' || kind === 'read') return { zh: '回炉：' + (m.why || item.zh || ''), variant: m.passage ? 'zh' : 'lesson' };
  if (kind === 'word') return { zh: '回炉：' + ((m.zhFull || m.hint || item.zh) || ''), variant: RETRY.later['word-board'] || 'flash-type' };
  if (kind === 'pair') return { zh: '回炉：两个词都先听一遍 — ' + (m.pair || []).join(' / '), variant: 'both', speakBoth: true };
  if (kind === 'dict') return { zh: '回炉：慢速再听一遍 — ' + (item.zh || ''), variant: 'slow', slow: true };
  if (kind === 'write') return { zh: '回炉：参考 ' + ((m.ref || item.en) || ''), variant: 'ref' };
  return { zh: '回炉：' + (item.zh || ''), variant: null };
}

/* ───────────────────────────── shortened levels (?short=1) and small formatting ───────────────────────────── */
export function shortenLevel(level, gates = 2, perGate = 2, from = 0) {
  // (from: the audits' ?gate=N starts the short level at the N-th gate — e.g. the review day's flip cards, gate 3)
  const at = Math.max(0, Math.min(level.gates.length - 1, from | 0));
  const out = { ...level, short: true, gates: level.gates.slice(at, at + gates).map((g) => ({ ...g, items: g.items.slice(0, perGate) })) };
  out.minutes = Math.min(level.minutes || 1, 1);
  return out;
}
export function shortenBoss(plan, perPhase = 2) {
  return { ...plan, short: true, phases: plan.phases.map((p) => ({ ...p, short: true, items: p.items.slice(0, perPhase), hitPerRight: p.hitPerRight > 0 ? +((p.hp[0] - p.hp[1]) / Math.max(1, Math.min(perPhase, p.items.length))).toFixed(4) : 0 })) };
}
export function fmtClock(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); }

// The duel's rounds (duel.js): a round the zone count ends early leaves its unasked items behind — they are not lost
// (LEARN §27 拿不准的 18: ten of a day's 55 words never came up): they go to the front of the next round (whose label atlas
// is drawn at its prep from its items, so its items get them too), and after the last round they make one more round of
// their own (gate:rest), so every item of the day is asked at least once. The rest round's own leftovers are let go (no
// chain), and so are a 回炉 round's; the 回炉 round still follows the rest round.
export function carryLeft(gates, round, left) {
  if (!left || !left.length) return null;
  const g = gates[round], next = gates[round + 1];
  if (next) { next.queue.unshift(...left); next.items = [...left, ...next.items]; return next; }
  if (!g || g._restGate || g._relearnGate) return null;
  const rest = { id: 'gate:rest', title: '剩下的题', index: gates.length, pathIndex: 0, node: -1, pos: g.pos && g.pos.clone ? g.pos.clone() : g.pos, state: 'locked', locks: 0, items: left, queue: left, minutes: g.minutes, _restGate: true };
  gates.push(rest);
  return rest;
}

// A round that has run out (its clock, or the zone count knocked out) while a question is in flight waits for that
// question (PLAY §1: she is never cut off mid-answer — the typed sheet stays up, the balls keep floating): hold() parks
// the verdict (the first call says so: the caller announces it once), a knockout meanwhile replaces it (the zone has
// frozen itself, that is final); tick() per frame releases the verdict once the question is done (asking null), or when
// the grace is over (LEARN.duel.graceS, graceTypeS for a typed one) with withdrawn = true — the caller puts the question
// back in front of the queue, so carryLeft asks it again next round. The winner and the counts are the clock's / the
// count's moment (what she answers meanwhile floods the zone for the eye and her special, not the result).
export class RoundGrace {
  constructor(D) { this.D = D; this.on = null; }
  hold(winner, reason, typed, counts) {
    if (!this.on) { this.on = { winner, reason, counts, t: typed ? this.D.graceTypeS : this.D.graceS, typed: !!typed }; return true; }
    if (reason === 'knockout') { this.on.winner = winner; this.on.reason = reason; this.on.counts = counts; }
    return false;
  }
  tick(dt, asking) {
    if (!this.on) return null;
    this.on.t -= dt;
    if (asking && this.on.t > 0) return null;
    const v = { winner: this.on.winner, reason: this.on.reason, counts: this.on.counts, withdrawn: !!asking };
    this.on = null;
    return v;
  }
}
