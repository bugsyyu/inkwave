// src/learn/exams.js — 游戏为主体 第二期（docs/LEARN.md §41）: the lesson page's exam records, read in the game the way the
// page reads them (IELTS-Base app/exam/sched.js readDocs / sessionSummaries / reviewDayState / offer), and today's quiz
// written as the page writes one (app/exam/store.js newSession / commit). Pure: no DOM; the blob comes in (workbench.js
// readBlob().o), the writing itself is workbench.js saveQuiz.
//
//   examSessions(base)          → [{ sid, kind, d, t0, n, done, right, end, endDate, part, wk }] latest first (sessionSummaries)
//   quizToday(base, date)       → { sid, right, of } | null   today's quiz with at least one answer (the page's 「做完了」)
//   decisionOf(base, date)      → 'go' | 'later' | null       her 「改天」 on the page (exam-plan-YYYY-MM, the latest wins)
//   hallSteps(o, week, plan)    → the step keys of the week's review day (her pack's first, else the game's course)
//   weekExam(o, week, asOf, plan) → { state, month, parts, scores, next, doneOn, until }  the week's 周考 / 满月月考 on the page
//   quizOffer(o, today, date, plan) → { state, right, of, sid } | null              the main menu's 今日小考
// plan(week, day) → the game's day table (design.js DAY_PLAN['w' + week][day]): the caller's, so this file loads no course
//   quizLeaf(item, a)           → a leaf of the page's shape (§7.2) for one answer of the game's quiz
//   answerText(item, p, ans)    → { resp, key } her answer and the right one, as text (the duel's learn:answer adds them)

export const EXAM_RE = /^exam-\d{4}-\d{2}-\d{2}(-\d+)?$/;
export const PLAN_RE = /^exam-plan-\d{4}-\d{2}$/;
export const DOC_MAX = 180 * 1024;   // (store.js DOC_MAX: a week's document over this goes on in exam-<Monday>-2)
export const DOC_V = 2;
export const PARTS = ['L', 'R', 'W', 'S'];
export const PART_ZH = { L: '听力', R: '阅读', W: '写作', S: '口语' };
export const MONTH_WEEKS = [4, 8, 12, 16];
export const WINDOW_DAYS = 10;
export const GAME_SCENE = 'game';

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const keys = (o) => (isObj(o) ? Object.keys(o) : []);
const isYmd = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const hms6 = (s) => (/^\d{6}$/.test(String(s)) ? String(s) : null);

/* ───────────────────────────── dates (model.js util, in UTC so no zone moves a day) ───────────────────────────── */
export function addDays(s, n) {
  const d = new Date(s + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function mondayOf(s) { const wd = new Date(s + 'T00:00:00Z').getUTCDay(); return addDays(s, -((wd + 6) % 7)); }

/* ───────────────────────────── reading (sched.js readDocs, sessionSummaries) ───────────────────────────── */
// the date a leaf belongs to: its own (§7.2 item 10), else the session's day (the next one when before the start time)
function leafDate(x, hms, leaf) { const t0 = String(x.meta.t0 || '000000'); return leaf && isYmd(leaf[10]) ? leaf[10] : hms < t0 ? addDays(x.meta.d, 1) : x.meta.d; }
const stampOf = (x, p) => leafDate(x, p[0], p[1]) + p[0];
function endDay(x) {
  let last = '';
  keys(x.a).forEach((q) => { const s = stampOf(x, x.a[q]); if (s > last) last = s; });
  if (!last) return x.e ? leafDate(x, x.e) : x.meta.d;
  return x.e && x.e < last.slice(10) ? addDays(last.slice(0, 10), 1) : last.slice(0, 10);
}
export function leafOk(leaf) {
  const r = leaf[0], fmt = leaf[1];
  if (r == null) return null;
  if (fmt === 'LD' || fmt === 'SR') return Number(r) >= 80;
  return r === 1 || r === true;
}
function readDocs(base) {
  const by = {};
  const rec = (sid) => by[sid] || (by[sid] = { sid, meta: null, c: {}, a: {}, e: null });
  keys(base).forEach((id) => {
    if (!EXAM_RE.test(id)) return;
    const d = base[id];
    if (!isObj(d)) return;
    keys(d.s).forEach((sid) => { const x = rec(sid); if (!x.meta && isObj(d.s[sid])) x.meta = d.s[sid]; });
    keys(d.a).forEach((sid) => {
      const x = rec(sid);
      keys(d.a[sid]).forEach((q) => keys(d.a[sid][q]).forEach((t) => { if (hms6(t) && Array.isArray(d.a[sid][q][t])) (x.c[q] = x.c[q] || []).push([t, d.a[sid][q][t]]); }));
    });
    keys(d.e).forEach((sid) => { const x = rec(sid); keys(d.e[sid]).forEach((t) => { if (hms6(t) && (!x.e || t < x.e)) x.e = t; }); });
  });
  const list = [];
  keys(by).forEach((sid) => {
    const x = by[sid];
    if (!x.meta || !isYmd(x.meta.d)) return;
    keys(x.c).forEach((q) => x.c[q].forEach((p) => { if (!x.a[q] || stampOf(x, p) < stampOf(x, x.a[q])) x.a[q] = p; }));
    list.push(x);
  });
  list.sort((a, b) => (a.meta.d < b.meta.d ? -1 : a.meta.d > b.meta.d ? 1 : String(a.meta.t0 || '') < String(b.meta.t0 || '') ? -1 : 1));
  return list;
}
export function examSessions(base) {
  return readDocs(isObj(base) ? base : {}).map((x) => {
    let done = 0, right = 0;
    keys(x.a).forEach((q) => {
      if (/^r/.test(q)) return;
      const leaf = x.a[q][1];
      if (String(leaf[8] || '').indexOf('x') >= 0) return;
      done++;
      if (leafOk(leaf)) right++;
    });
    const s = { sid: x.sid, kind: x.meta.k, d: x.meta.d, t0: String(x.meta.t0 || ''), n: Array.isArray(x.meta.p) ? x.meta.p.length : 0, done, right, end: x.e || null, endDate: x.e ? endDay(x) : null };
    if (x.meta.part) s.part = x.meta.part;
    if (x.meta.wk) s.wk = x.meta.wk;
    return s;
  }).reverse();
}
export function quizToday(base, date) {
  const q = examSessions(base).filter((s) => s.kind === 'quiz' && s.d === date && s.done > 0)[0];
  return q ? { sid: q.sid, right: q.right, of: q.done } : null;
}
export function decisionOf(base, date) {
  const doc = isObj(base) && isYmd(date) ? base['exam-plan-' + date.slice(0, 7)] : null, d = doc && isObj(doc.d) ? doc.d[date.slice(8, 10)] : null;
  let best = null, v = null;
  keys(d).forEach((t) => { if (!best || t > best) { best = t; v = d[t]; } });
  return v;
}

/* ───────────────────────────── the weekly exam (sched.js reviewDayState, offer) ───────────────────────────── */
// the week's review day: in her pack the day with the weekly step (the page's slot N), else the game's day 7
function packWeek(o, week) {
  const packs = o && isObj(o.packs) ? o.packs : null;
  for (const id of keys(packs)) { const w = isObj(packs[id]) && isObj(packs[id].week) ? packs[id].week : null; if (w && String(w.id) === 'w' + week) return w; }
  return null;
}
const stepsOf = (day) => ['a', 'b', 'c'].flatMap((s) => (Array.isArray(day[s]) ? day[s] : [])).filter((st) => isObj(st) && st.id != null);
export function hallSteps(o, week, plan) {
  const w = packWeek(o, week);
  if (w && Array.isArray(w.days)) {
    // (model.js roomSlots: the last day with a weekly / placement / symbol-review / week-flash step, else the last day with steps)
    const days = w.days.slice(0, 10).filter((d) => isObj(d) && d.id != null && stepsOf(d).length);
    const hall = (d) => stepsOf(d).some((st) => st.type === 'weekly' || st.type === 'placement' || st.type === 'symreview' || (st.type === 'flash' && st.fromWeek));
    const day = days.filter(hall).pop() || days[days.length - 1];
    return day ? stepsOf(day).map((st) => day.id + ':' + st.id) : [];
  }
  const P = typeof plan === 'function' ? plan(+week, 7) : null;
  return P ? [...(P.gates || []), ...(P.signs || [])].map((x) => x.step) : [];
}
// the first date a step of a later week was done after `after` (the next course week has started: the window closes the day before)
function laterStart(cp, week, after) {
  let first = null;
  keys(cp).forEach((k) => {
    const m = /^w(\d+)d\d+:/.exec(k), c = cp[k];
    if (m && +m[1] > week && isYmd(c) && c > after && (!first || c < first)) first = c;
  });
  return first;
}
// weekExam(o, week, asOf): the page's weekly exam for that week —
//   state  'locked' (the review day not learned yet) · 'soon' (learned today: opens tomorrow) · 'open' (in its window,
//          parts left) · 'done' (all four parts ended) · 'closed' (the window passed with parts left)
//   parts  { L, R, W, S: 'todo' | 'doing' | 'done' }, scores { L: { right, of } … } (ended parts), next (the part to take)
export function weekExam(o, week, asOf, plan) {
  const cp = o && isObj(o.profile) && isObj(o.profile.cp) ? o.profile.cp : {}, base = o && isObj(o.base) ? o.base : {};
  const month = MONTH_WEEKS.includes(+week), weekId = 'w' + week;
  const out = { week: +week, month, state: 'locked', parts: { L: 'todo', R: 'todo', W: 'todo', S: 'todo' }, scores: {}, next: null, doneOn: null, until: null };
  const hall = hallSteps(o, week, plan), dates = hall.map((k) => cp[k]);
  if (!hall.length || !dates.every(isYmd)) return out;
  const doneOn = dates.slice().sort()[dates.length - 1];
  out.doneOn = doneOn;
  let until = addDays(doneOn, WINDOW_DAYS);
  const nx = laterStart(cp, +week, doneOn);
  if (nx && addDays(nx, -1) < until) until = addDays(nx, -1);
  out.until = until;
  examSessions(base).slice().reverse().forEach((s) => {
    if ((s.kind !== 'week' && s.kind !== 'month') || s.wk !== weekId || !PARTS.includes(s.part)) return;
    if (s.end) { if (out.parts[s.part] !== 'done') out.scores[s.part] = { right: s.right, of: s.done }; out.parts[s.part] = 'done'; }
    else if (out.parts[s.part] !== 'done') out.parts[s.part] = 'doing';
  });
  out.next = PARTS.find((p) => out.parts[p] === 'doing') || PARTS.find((p) => out.parts[p] === 'todo') || null;
  const n = PARTS.filter((p) => out.parts[p] === 'done').length;
  out.state = n === 4 ? 'done' : !isYmd(asOf) || asOf < doneOn ? 'locked' : asOf === doneOn ? 'soon' : asOf <= until ? 'open' : 'closed';
  return out;
}

/* ───────────────────────────── today's quiz on the main menu (sched.js offer, §2.2) ───────────────────────────── */
// The page offers it when she has learned something before today, today is not the review day, and no weekly exam is
// recommended today (its window open with parts left, or its review day learned today: the preview); 'done' with her
// score when today has a quiz with an answer; 'later' when she said 改天 on the page.
export function quizOffer(o, today, date, plan) {
  if (!o || !today || !isYmd(date) || typeof plan !== 'function') return null;
  const P = plan(today.week, today.day);
  if (!P || !P.extras || !P.extras.quiz) return null;
  const cp = isObj(o.profile) && isObj(o.profile.cp) ? o.profile.cp : {}, base = isObj(o.base) ? o.base : {};
  if (!keys(cp).some((k) => isYmd(cp[k]) && cp[k] < date)) return null;
  for (let w = 1; w <= today.week; w++) { const x = weekExam(o, w, date, plan); if (x.state === 'soon' || x.state === 'open') return null; }
  const q = quizToday(base, date);
  if (q) return { state: 'done', right: q.right, of: q.of, sid: q.sid };
  return { state: decisionOf(base, date) === 'later' ? 'later' : 'open' };
}

/* ───────────────────────────── the game's quiz as the page's leaves (store.js leavesFor, §7.2) ───────────────────────────── */
// the page's question format nearest to each of the game's questions
export function fmtOf(item) {
  const m = (item && item.meta) || {}, k = m.kind, input = m.input;
  if (k === 'dict') return 'LD';
  if (k === 'pair') return 'LP';
  if (k === 'sym') return 'PS';
  if (k === 'write') return 'WT';
  if (k === 'quiz') return m.passage ? 'RN' : 'GF';
  if (k === 'read') return 'RN';
  if (k === 'word') return input === 'type' ? 'VS' : 'VM';
  return input === 'type' ? 'VS' : 'VM';
}
const cut = (s, n) => { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) : s; };
const optText = (o) => (o ? String(o.en || o.text || o.zh || '') : '');
// her answer and the right one as text: a choice (reworded or not) by its option, a typed answer as typed
export function answerText(item, p, ans) {
  if (!item) return { resp: '', key: '' };
  const opts = Array.isArray(item.options) ? item.options : null;
  const key = opts && typeof item.answer === 'number' ? optText(opts[item.answer]) : String((item.meta && item.meta.ref) || item.answer || item.en || '');
  let resp = '';
  if (p && p._alt === 'choice-of-typed') resp = optText((p.options || [])[ans]);
  else if (typeof ans === 'number' && opts) resp = optText(opts[p && p._perm ? p._perm[ans] : ans]);
  else if (typeof ans === 'string') resp = ans;
  else if (ans != null && typeof ans !== 'object') resp = String(ans);
  return { resp, key };
}
// one answer → [result, fmt, scene, main, subs, resp, key, ms, flags, sig, date]: no sub-skills and no 'c' (the game's
// evidence is in ev-<Monday> already, the sub-skills are the page's bank's own — §41 先定的 2)
export function quizLeaf(item, a) {
  const fmt = fmtOf(item), ld = fmt === 'LD';
  const result = ld ? Math.max(0, Math.min(100, Math.round(Number(a.pct != null ? a.pct : a.ok ? 100 : 0)))) : a.ok ? 1 : 0;
  const flags = (a.hinted ? 'h' : '') + (ld ? '1' : '');
  return [result, fmt, GAME_SCENE, String(item.id), '', cut(a.resp, 160), cut(a.key, 120), Math.max(0, Math.min(600000, Math.round(Number(a.ms) || 0))), flags, '', a.date];
}
// the plan rows of the game's quiz: one a question (scene 'game' — the page has no frame for it: its history shows the
// answers stored in the leaves)
export const planRow = (i, item) => [String(i), fmtOf(item), GAME_SCENE, '', String(item.id), '', ''];
// the page's session id: q<YYMMDD>-<HHMM>-<4 random>
export function quizSid(date, hms, rand) {
  return 'q' + date.slice(2, 4) + date.slice(5, 7) + date.slice(8, 10) + '-' + hms.slice(0, 4) + '-' + String(rand || '').toLowerCase().replace(/[^0-9a-z]/g, '').padEnd(4, '0').slice(0, 4);
}
export function rand4() {
  const A = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  try { const b = new Uint8Array(4); globalThis.crypto.getRandomValues(b); b.forEach((x) => { s += A[x % 36]; }); } catch (e) { for (let i = 0; i < 4; i++) s += A[Math.floor(Math.random() * 36)]; }
  return s;
}
// which document a new session goes into (store.js docForNew)
export function docForNew(base, date) {
  const mon = mondayOf(date);
  let id = 'exam-' + mon, k = 1;
  while (isObj(base[id]) && JSON.stringify(base[id]).length > DOC_MAX) { k++; id = 'exam-' + mon + '-' + k; }
  return id;
}
// the level of a week (store.js newSession: weeks 1–6 level 1, 7–11 level 2, 12–15 level 3, then 4)
export const tierOf = (wn) => (wn <= 6 ? 1 : wn <= 11 ? 2 : wn <= 15 ? 3 : 4);
