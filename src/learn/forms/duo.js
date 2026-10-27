// 关卡学习 — the two-player online forms' pure parts (docs/LEARN.md §10, §14): 双人联机赛 versus2 and 双人成形合作赛
// coop2. No DOM, no three.js, no network — versus2.js / coop2.js wire these to the room (G.net) and the stage, and
// `node --test tests/learn/duo.test.mjs` runs every rule here.
//
//   versus2:  mergeDue(lists, cap) · spreadGates(gates, n) · buildQueue({ gates, due, has, n, dueShare }) · canRequeue(…)
//             answerTime(p) · new Referee({ humans, botTeams, model, rnd, grace }) · tally(results, people)
//   coop2:    rolesFor(players, k, hands) · splitPrompt(p, role) · padSpots(nodes, path, i, gap) · padNodes(nav, path, i) ·
//             padsHeld(pads, people, r) · partnerWait(w, waiting, dt, after) (LEARN §55)
//   wire:     LEARN_WIRE (the payload kinds on the room's envelope) · validQ(d)
//   题即玩法 play-6 (docs/PLAY.md §5.5, LEARN §25): seeded(seed) · seedOf(q, id) · duoAltPrompt(gates, item, seed, typedOf)
//             (both screens build the same reworded question) · duoMechanic(view) (what a screen answers with) ·
//             clueSpec(view, partner) (the clue side's board: the stem, its Chinese, ▶ — nothing to answer with)
import { LEARN } from '../../config.js';
import { botRoll } from './common.js';
import { prompt } from '../api.js';
import { arenaAltPrompt } from '../play/arena/alt.js';
import { canPlayArena } from '../play/arena/m1.js';

// The learning payloads ride the room's own envelope ("b|" / "s|to|", docs/NET.md) next to the match's: { k: 'l…', … }.
//   ls  host → all    { ids: [[id, alt]…] }                    the match's question queue (a migrated host carries on from it)
//   ld  guest → host  { due: [id…] }                            this player's due items for the week (their own store)
//   lq  host → all    { q, i, id, alt, n, total, sec }          a question opens for everyone at once
//   la  → host (versus2) / → all (coop2)  { q, ok, ms, none? } (coop2 adds why, canonical, pct, by)
//   lr  host → all    { q, win, by, name, z, at: [x, y, z], r } versus2: who inked it, and where (paint.flood is not replicated)
//   lc  host → all    { q, win, res: [[pid, 1 | 0 | -1]…] }     versus2: the question closed (everyone answered, or time)
//   lg  host → all    { g, s: 'ask' | 'open' | 'done', … }      coop2: a gate's state
export const LEARN_WIRE = ['ls', 'ld', 'lq', 'la', 'lr', 'lc', 'lg', 'lk'];   // (lk: coop2's shared ink tank — play-9)
export const validQ = (d) => !!d && typeof d === 'object' && LEARN_WIRE.includes(d.k) && (d.q == null || Number.isInteger(d.q));

/* ───────────────────────────── coop2: a partner who walked off (LEARN §55) ───────────────────────────── */
// How long this screen has waited on the partner — waiting: her pad held and theirs empty, or the clue said and no answer in
// — counted in the level's own dt (a fake clock in the tests). → 'warn' the step the wait passes `after` s (once a wait),
// 'clear' the step a warned wait ends, else null. w: { t, warned } (kept by the flow). Nothing is sent, nobody is kicked.
export function partnerWait(w, waiting, dt, after = LEARN.coop2.partnerIdle) {
  if (!waiting) { w.t = 0; if (w.warned) { w.warned = false; return 'clear'; } return null; }
  w.t += Math.max(0, dt || 0);
  if (!w.warned && w.t >= after) { w.warned = true; return 'warn'; }
  return null;
}
export const PARTNER_IDLE_LINE = '队友好像走开了 · 可以再等等，或按 ⏸ 离开这一关';

/* ───────────────────────────── coop2: one ink tank for two ───────────────────────────── */
// LEARN §14 §4 「墨罐共用（一个人喷光了另一个人得去充）」: the two squidkids draw on one tank. Each screen keeps its own
// actor's ink as the engine runs it and tells the other only what the engine did to it this frame (a spray −, a refill +:
// the sum goes out as 'lk' every C.inkSync s) — never the partner's share it applied, so nothing echoes. A jump up
// bigger than any refill (reset: a respawn's full tank) is not a refill — the tank stays at the shared level. The
// partner's deltas come in as `incoming`; the host's own level `v` (once a second) pulls a drifted guest back by 30 %.
// Pure: s = { last, out } carried by the caller; returns the actor's ink after this frame.
export function sharedInk(s, ink, incoming = 0, v = null, max = 100, reset = 5) {
  if (s.last == null) s.last = ink;
  let own = ink - s.last;
  if (own > reset) { ink = s.last; own = 0; }
  if (incoming) ink += incoming;
  if (v != null && Math.abs(v - ink) > 2) ink += (v - ink) * 0.3;
  ink = Math.max(0, Math.min(max, ink));
  s.last = ink; s.out += own;
  return ink;
}

/* ───────────────────────────── versus2: what is asked ───────────────────────────── */
// Several players' due lists merged into one (到期的词两个人共用一份，谁的到期谁的题多): each list keeps its own order
// and the lists interleave by position fraction, so a list three times as long gives about three times as many of the
// first places; an id due for both comes once, at its earliest place.
export function mergeDue(lists, cap = Infinity) {
  const keyed = [];
  (lists || []).forEach((l, k) => { const L = (l || []).filter((x) => typeof x === 'string'); L.forEach((id, i) => keyed.push({ id, key: (i + 0.5) / L.length, k })); });
  keyed.sort((a, b) => a.key - b.key || a.k - b.k);
  const seen = new Set(), out = [];
  for (const x of keyed) { if (seen.has(x.id)) continue; seen.add(x.id); out.push(x.id); if (out.length >= cap) break; }
  return out;
}
// the day's gates' items, one gate at a time in turn (a match of 12 questions touches every step, not just the first two)
export function spreadGates(gates, n = Infinity) {
  const lists = (gates || []).map((g) => (g.items || []).map((it) => it.id)), seen = new Set(), out = [];
  for (let round = 0; out.length < n; round++) {
    let any = false;
    for (const l of lists) { if (round >= l.length) continue; any = true; const id = l[round]; if (!seen.has(id)) { seen.add(id); out.push(id); if (out.length >= n) break; } }
    if (!any) break;
  }
  return out;
}
// the match's queue: due items first (only ids the week has, at most dueShare of n), then the day's items spread over its
// gates; [{ id, alt: 0 }]
export function buildQueue({ gates, due = [], has = () => true, n = LEARN.versus2.questions, dueShare = LEARN.versus2.dueShare } = {}) {
  const out = [], seen = new Set();
  const push = (id) => { if (!seen.has(id) && out.length < n) { seen.add(id); out.push({ id, alt: 0 }); } };
  for (const id of due) { if (out.length >= Math.round(n * dueShare)) break; if (has(id)) push(id); }
  for (const id of spreadGates(gates)) { if (out.length >= n) break; push(id); }
  return out;
}
// a question nobody got right comes back once, reworded, while the queue stays under (1 + requeue) × questions
export function canRequeue(queue, entry, n = LEARN.versus2.questions, requeue = LEARN.versus2.requeue) {
  return !!entry && !entry.alt && queue.length < Math.ceil(n * (1 + requeue)) && !queue.some((e) => e.id === entry.id && e.alt);
}
export function answerTime(p, T = LEARN.versus2.answerTime) { return p && p.type === 'choice' ? T.choice : T.type; }

/* ───────────────────────────── versus2: the host's referee ───────────────────────────── */
// One question at a time, on the host's clock (seconds). Every human answers for their own evidence; the ink goes to the
// first right answer by each player's OWN time (ms from the question appearing on their screen — the host's zero
// latency to itself must not win every tie), decided once the grace after the first right answer to arrive has passed
// (or everyone has answered). A side with no human in it answers through its bots' dice (BOT_ANSWER, as the duel's
// other side does). The question closes when everyone (humans and dice) has answered, or at the deadline.
//   ref.open(q, sec, t) · ref.answer(pid, ok, ms, t, none) · ref.leave(pid) · ref.tick(t) → [{ k: 'ink' | 'close', … }]
export class Referee {
  constructor({ humans = [], botTeams = [], model = null, rnd = Math.random, grace = LEARN.versus2.grace } = {}) {
    this.humans = humans.map((h) => ({ pid: h.pid, team: h.team, name: h.name || '' }));
    this.botTeams = botTeams.slice();
    this.model = model; this.rnd = rnd; this.grace = grace;
    this.cur = null;
  }
  get open_() { return !!this.cur && !this.cur.closed; }
  open(q, sec, t) {
    const bots = this.botTeams.map((team) => { const r = botRoll(this.model, this.rnd); return { pid: 'bot' + team, team, ok: r.ok, delay: Math.min(r.delay, sec - 0.5), done: false }; });
    this.cur = { q, t0: t, sec, answers: [], bots, waitFor: new Set([...this.humans.map((h) => h.pid), ...bots.map((b) => b.pid)]), ink: null, closed: false };
    return this.cur;
  }
  answer(pid, ok, ms, t, none = false) {
    const c = this.cur;
    if (!c || c.closed || !c.waitFor.has(pid)) return false;
    const h = this.humans.find((x) => x.pid === pid);
    if (!h) return false;
    c.waitFor.delete(pid);
    c.answers.push({ pid, team: h.team, ok: !!ok && !none, ms: Math.max(0, +ms || 0), at: t, none: !!none });
    return true;
  }
  leave(pid) { this.humans = this.humans.filter((h) => h.pid !== pid); this.cur?.waitFor.delete(pid); }
  tick(t) {
    const c = this.cur, out = [];
    if (!c || c.closed) return out;
    for (const b of c.bots) if (!b.done && t - c.t0 >= b.delay) { b.done = true; c.waitFor.delete(b.pid); c.answers.push({ pid: b.pid, team: b.team, ok: b.ok, ms: Math.round(b.delay * 1000), at: t, bot: true }); }
    const late = t - c.t0 >= c.sec;
    if (!c.ink) {
      const s = settle(c.answers, t, { grace: this.grace, waiting: c.waitFor.size, force: late });
      if (s && (s.win >= 0 || c.waitFor.size === 0 || late)) { c.ink = s; out.push({ k: 'ink', q: c.q, ...s }); }
    }
    if (c.waitFor.size === 0 || late) {
      c.closed = true;
      const res = [...this.humans.map((h) => { const a = c.answers.find((x) => x.pid === h.pid); return [h.pid, a ? (a.none ? -1 : a.ok ? 1 : 0) : -1]; }),
        ...c.bots.map((b) => [b.pid, b.done ? (b.ok ? 1 : 0) : -1])];
      out.push({ k: 'close', q: c.q, win: c.ink ? c.ink.win : -1, by: c.ink ? c.ink.by : null, res });
    }
    return out;
  }
}
// who inked it: the right answer with the smallest own time among those in by now (null = wait); force = the deadline
export function settle(answers, t, { grace = LEARN.versus2.grace, waiting = 0, force = false } = {}) {
  const rights = answers.filter((a) => a.ok);
  if (rights.length) {
    const first = Math.min(...rights.map((a) => a.at));
    if (!force && waiting > 0 && t - first < grace) return null;
    const best = rights.slice().sort((a, b) => a.ms - b.ms || a.at - b.at)[0];
    return { win: best.team, by: best.pid, ms: best.ms };
  }
  if (!force && waiting > 0) return null;
  return { win: -1, by: null, ms: null };
}
// the results strip: per player — questions inked first (wins), answered right, answered at all; sorted by team then wins
export function tally(results, people) {
  const rows = (people || []).map((p) => ({ pid: p.pid, name: p.name, team: p.team, self: !!p.self, wins: 0, right: 0, answered: 0 }));
  const by = new Map(rows.map((r) => [r.pid, r]));
  for (const r of results || []) {
    if (r.by && by.has(r.by)) by.get(r.by).wins++;
    for (const [pid, v] of r.res || []) { const x = by.get(pid); if (!x || v < 0) continue; x.answered++; if (v === 1) x.right++; }
  }
  return rows.sort((a, b) => a.team - b.team || b.wins - a.wins || b.right - a.right);
}

/* ───────────────────────────── coop2: two halves of one question ───────────────────────────── */
// who holds the clue and who answers the k-th question: they swap every question; `hands` (an id) forces the answering
// side (a re-ask goes to the one who did not answer it the first time)
export function rolesFor(players, k, hands = null) {
  const [a, b] = players;
  if (hands && (hands === a || hands === b)) return { hands, clue: hands === a ? b : a };
  return k % 2 === 0 ? { clue: a, hands: b } : { clue: b, hands: a };
}
// the two views of one prompt (src/learn/engine.js prompt / flow.js _altPrompt): the clue side hears / reads it and has
// no form; the answering side has the form and nothing that gives the answer away (no recording, no stem, no gloss).
// The answering side keeps the prompt's own mapping (_alt / _perm / options) so judgeAnswer() reads its answer as usual.
export function splitPrompt(p, role) {
  const typed = p.type !== 'choice';
  if (role === 'clue') {
    return { type: 'clue', text: p.text || '', zh: p.zh || '', tts: p.tts || null, audio: p.audio || null,
      hint: typed ? '你听得到：把听到的念给队友（一个字母一个字母拼也行），队友来打字' : '你看得到题目：讲给队友听，队友来选' };
  }
  return { ...p, text: typed ? '队友听得到录音：听队友说，把它打出来' : '队友看得到题目：听队友说，选出答案', zh: '', tts: null, audio: null, hint: null };
}
// a gate's two ink pads: either side of the route at the gate's node, `gap` m out, across the route's direction there
export function padSpots(nodes, path, i, gap = LEARN.coop2.padGap) {
  const n = nodes[path[i]], a = nodes[path[Math.max(0, i - 2)]], b = nodes[path[Math.min(path.length - 1, i + 2)]];
  let dx = b.x - a.x, dz = b.z - a.z;
  const l = Math.hypot(dx, dz);
  if (l < 1e-6) { dx = 1; dz = 0; } else { dx /= l; dz /= l; }
  return [{ x: n.x - dz * gap, y: n.y, z: n.z + dx * gap }, { x: n.x + dz * gap, y: n.y, z: n.z - dx * gap }];
}
// the pads on the stage: each spot snapped to the nearest walkable nav node (within `reach` m, about the same height);
// where the floor is too narrow for that (a bridge, a stair, a wall or the water beside the route) both pads go onto the
// route itself, about `gap` m before and after the gate (further on where the route doubles back up a ramp) — so the
// two are always apart: more than two pad radii across, or a floor apart
export const padsApart = (a, b, r = LEARN.coop2.padRadius) => Math.hypot(a.x - b.x, a.z - b.z) > 2 * r + 0.2 || Math.abs(a.y - b.y) >= 1.6;
export function padNodes(nav, path, i, gap = LEARN.coop2.padGap, reach = 1.2, r = LEARN.coop2.padRadius) {
  const g = nav.nodes[path[i]];
  const snap = padSpots(nav.nodes, path, i, gap).map((p) => {
    const k = nav.nearest(p, 1.0, true), n = k >= 0 ? nav.nodes[k] : null;
    return n && Math.hypot(n.x - p.x, n.z - p.z) <= reach && Math.abs(n.y - p.y) < 1.2 ? { x: n.x, y: n.y, z: n.z, node: k } : null;
  });
  if (snap[0] && snap[1] && padsApart(snap[0], snap[1], r)) return snap;
  const at = (k) => { const n = nav.nodes[path[k]]; return { x: n.x, y: n.y, z: n.z, node: path[k], fallback: true }; };
  let k0 = i; while (k0 > 0) { k0--; const n = nav.nodes[path[k0]]; if (Math.hypot(n.x - g.x, n.z - g.z) >= gap) break; }
  const a = at(k0);
  let k1 = i, b = at(i);
  while (k1 < path.length - 1) { k1++; b = at(k1); const n = nav.nodes[path[k1]]; if (Math.hypot(n.x - g.x, n.z - g.z) >= gap && padsApart(a, b, r)) break; }
  return [a, b];
}
// who stands on which pad: each pad takes the nearest person within r (and about the same height); one person holds one
// pad → { on: [id | null, id | null], held: both pads held by two different people }
export function padsHeld(pads, people, r = LEARN.coop2.padRadius) {
  const on = pads.map(() => null), pairs = [];
  pads.forEach((pd, i) => (people || []).forEach((pp) => {
    const d = Math.hypot(pd.x - pp.x, pd.z - pp.z);
    if (d <= r && Math.abs((pd.y || 0) - (pp.y || 0)) < 1.6) pairs.push([d, i, pp.id]);
  }));
  pairs.sort((x, y) => x[0] - y[0]);
  const used = new Set();
  for (const [, i, id] of pairs) if (on[i] == null && !used.has(id)) { on[i] = id; used.add(id); }
  return { on, held: on.length > 0 && on.every((x) => x != null) };
}

/* ───────────────────────────── 题即玩法 play-6: the same question objects on both screens ───────────────────────────── */
// A question's objects are laid out from its prompt: engine.prompt is pure (the same options in the same order on every
// screen), but a reworded question draws its distractors and its order at random — so the two-player forms draw them
// from a random seeded by what every screen of the room already has for the question: its number and its item's id
// (no field added to 'lq').
export function seeded(seed) {   // mulberry32: [0, 1)
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function seedOf(q, id) {   // FNV-1a over "q:id"
  const s = `${q | 0}:${id}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h >>> 0;
}
// the reworded question of an 'lq' with alt, the same on every screen: a typed item → the arena's rewording (a 单词卡's
// 回炉 choice among near words — all ink balls; a 听写句 heard slowly; a 写句 with its reference, play-5 arena/alt.js);
// a choice → the same choice, its options reshuffled (judgeAnswer maps the pick back through _perm). typedOf(item): the
// form's own rewording of a choice whose stem starts 「哪一个是」 (typed-of-choice, no randomness in it; none of the three
// weeks has one — LEARN §18)
export function duoAltPrompt(gates, item, seed, typedOf = null) {
  const rnd = seeded(seed), base = prompt(item);
  if (!base) return null;
  if (base.type !== 'choice') return arenaAltPrompt(gates, item, rnd) || base;
  if (typedOf && String(base.text || '').startsWith('哪一个是')) { const t = typedOf(item); if (t) return t; }
  const perm = (item.options || []).map((_, i) => i);
  for (let i = perm.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [perm[i], perm[j]] = [perm[j], perm[i]]; }
  return { ...base, text: `换个问法：${base.text}`, options: perm.map((i) => base.options[i]), _perm: perm };
}
// what a screen answers a question with: 'm1' — ink targets, for every plain choice of 2–4 (the 听辨 / 音标 kinds too: the
// beat pads play the word on the bar line, and coop2's answering side must hear nothing) — 'type' — the 打字蟹 (M4), for
// anything typed — or null: nothing to answer with (coop2's clue side: its view is type 'clue'; a flip card)
const TYPED = new Set(['type', 'typed', 'write']);
export function duoMechanic(view) {
  if (!view || view.type === 'clue' || view._flip) return null;
  if (canPlayArena(null, view)) return 'm1';
  return TYPED.has(view.type) ? 'type' : null;
}
// coop2's clue side (PLAY §5.5): a board in front of her (M6 BoardWalk, src/learn/play/board/) with the stem, its Chinese,
// what to do — and ▶ when there is a recording (played as the board comes up; the board's 「再听」 replays it). No
// options, no input: its only hotspot is 'listen' (and 看全文 when the text runs over)
export function clueSpec(view, partner = '队友') {
  const v = view || {}, blocks = [];
  if (v.text) blocks.push({ t: 'q', en: v.text, zh: v.zh && v.zh !== v.text ? v.zh : '' });
  else if (v.zh) blocks.push({ t: 'p', text: v.zh });
  if (v.hint) blocks.push({ t: 'tip', text: v.hint.replace(/队友/g, partner) });
  return { kind: 'clue', kicker: `线索 · 讲给${partner}听（${partner}来答）`, title: '', blocks, full: blocks.slice(), tts: v.tts || '', buttons: v.tts ? [{ id: 'listen', label: '再听', icon: 'play', primary: true }] : [] };
}
