// src/learn/quiz-run.js — 今日小考 into her account (游戏为主体 第二期, docs/LEARN.md §41): while the game's quiz (forms/
// index.js buildQuiz, one duel round) is today's — from her App, the level's week / day her course's today — every first
// answer of the run becomes a leaf of the lesson page's quiz record (workbench.js saveQuiz: the session with the first
// answer, a leaf a question after it, 1.2 s apart; the end when the level ends), and the results card says what was
// recorded. Today already has a quiz with an answer → the run is practice and nothing is written. Bus-only: it listens
// to learn:question / learn:answer / learn:done (the duel adds pct / resp / key to learn:answer) and writes nothing else.
import { G, on } from '../core/ctx.js';
import { h } from '../ui/ui-util.js';
import { appToday } from './app.js';
import { present, wallParts, wallZone, saveQuiz } from './workbench.js';
import { planRow, quizLeaf, quizSid, rand4 } from './exams.js';

export const SAVE_WAIT = 1200;
const pad2 = (n) => (n < 10 ? '0' : '') + n;
function ls() { try { return globalThis.localStorage || null; } catch (e) { return null; } }
function stampOf(store, at) {
  const p = wallParts(at, wallZone(store));
  return { date: p.y + '-' + pad2(p.m) + '-' + pad2(p.d), hms: pad2(p.h) + pad2(p.mi) + pad2(p.s) };
}
const quizFlow = () => { const F = G.match && G.match.learn; return F && F.level && F.level.quiz ? F : null; };

// newRun(flow, { today, store, now }) → the run, or { off: true } when this quiz is not today's (pure but for the clock)
export function newRun(F, o = {}) {
  const T = o.today, L = o.store;
  const lv = F && F.level, items = lv && lv.gates && lv.gates[0] ? lv.gates[0].items || [] : [];
  if (!T || !T.inGame || !lv || +lv.week !== T.week || +lv.day !== T.day || !items.length || !present(L)) return { flow: F, off: true };
  const s = stampOf(L, o.now != null ? o.now : Date.now());
  const index = new Map(); items.forEach((it, i) => { if (!index.has(it.id)) index.set(it.id, i); });
  return { flow: F, off: false, store: L, sid: quizSid(s.date, s.hms, o.rand || rand4()), d: s.date, t0: s.hms, week: T.week, items, index, rows: items.map((it, i) => planRow(i, it)), answers: {}, asked: {}, end: null, last: null };
}
// a learn:answer → the run's leaf for that question (its first answer in this run only; the 回炉 is not the quiz)
export function takeAnswer(run, d, now) {
  if (!run || run.off || !d || d.relearn) return false;
  const q = run.index.get(d.itemId);
  if (q == null || run.answers[String(q)]) return false;
  const s = stampOf(run.store || ls(), now), item = run.items[q];
  const ms = run.asked[d.itemId] != null ? now - run.asked[d.itemId] : 0;
  run.answers[String(q)] = [s.hms, quizLeaf(item, { ok: !!d.ok, pct: d.pct, resp: d.resp, key: d.key, hinted: !!d.hinted, ms, date: s.date })];
  return true;
}
export function flushRun(run) {
  if (!run || run.off) return null;
  const r = saveQuiz(run.store || ls(), run);
  if (r && r.practice) run.off = true;
  run.last = r;
  return r;
}

/* ───────────────────────────── in the page ───────────────────────────── */
let run = null, timer = 0;
function flushNow() { clearTimeout(timer); timer = 0; try { return flushRun(run); } catch (e) { console.warn('[quiz record]', e); return null; } }
function later() { clearTimeout(timer); timer = setTimeout(flushNow, SAVE_WAIT); }
// the results card: one sticker line — recorded (her score as the page shows it) or practice
function badge(r) {
  const card = G.hud && G.hud.learn && G.hud.learn.results_, btns = card && card.querySelector('.iw-learn__rbtns');
  if (!btns || !r || !r.ok || !(r.of > 0)) return;
  card.querySelectorAll('.iw-qrec').forEach((x) => x.remove());
  const prac = !!r.practice;
  btns.before(h('div', { class: 'iw-qrec' + (prac ? ' is-practice' : '') },
    h('b', { class: 'iw-qrec__score' }, `${r.right} / ${r.of}`),
    h('span', null, prac ? '今天的小考已经记过了 · 这一局是练习，不改成绩' : '记进了今日小考 · 课本里的考试也看得到')));
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  on('learn:question', (d) => {
    const F = quizFlow();
    if (!F) return;
    if (!run || run.flow !== F) { clearTimeout(timer); timer = 0; run = newRun(F, { today: appToday(location.search), store: ls() }); }
    if (!run.off && d && d.itemId != null && run.asked[d.itemId] == null) run.asked[d.itemId] = Date.now();
  });
  on('learn:answer', (d) => { const F = quizFlow(); if (run && F && run.flow === F && takeAnswer(run, d, Date.now())) later(); });
  on('learn:done', () => {
    const F = quizFlow();
    if (!run || !F || run.flow !== F || run.off) { if (run && run.flow === F && run.last) setTimeout(() => badge(run.last), 0); return; }
    run.end = stampOf(ls(), Date.now()).hms;
    const r = flushNow();
    setTimeout(() => badge(r), 0);   // (the duel builds its results card right after learn:done)
  });
  const away = () => { if (timer) flushNow(); };
  window.addEventListener('pagehide', away);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') away(); });
}
