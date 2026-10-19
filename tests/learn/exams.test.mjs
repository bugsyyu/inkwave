// 今日小考 · 周考的进度 (游戏为主体 第二期, docs/LEARN.md §41): the game reads the lesson page's exam records the way the
// page does (app/exam/sched.js) and writes today's quiz the way the page writes one (app/exam/store.js): the session with
// its first answer, a leaf a question, the end — into exam-<Monday> of her wall-clock week, nothing else changed, never a
// blob of its own, the same run twice writes once, a second quiz the same day is practice. The 周考 is read only. The
// contract at the end (CONTRACT) is the same literal as IELTS-Base tests/base/game-exams.test.mjs, where the live page
// (its exam store and its sync) reads the game's record back. A made-up learner — nothing here reads app/my-progress.*.
// 用法：node --test tests/learn/exams.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ielts } from '../../src/learn/ielts.js';
import { loadWeek } from '../../src/learn/content.js';
import { DAY_PLAN } from '../../src/learn/design.js';
import { DATA_KEY, PREF_KEY, saveQuiz, _reset } from '../../src/learn/workbench.js';
import { examSessions, quizToday, decisionOf, hallSteps, weekExam, quizOffer, fmtOf, answerText, quizLeaf, quizSid, docForNew, mondayOf, addDays, DOC_MAX } from '../../src/learn/exams.js';
import { newRun, takeAnswer, flushRun } from '../../src/learn/quiz-run.js';
import { examLine, examPill, examAria, partScore } from '../../src/learn/exam-view.js';
import { courseMap } from '../../src/learn/course-map.js';

const src = (f) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const clone = (o) => JSON.parse(JSON.stringify(o));
const plan = (w, d) => (DAY_PLAN['w' + w] && DAY_PLAN['w' + w][d]) || null;
function memory(init) {
  const m = new Map(Object.entries(init || {})), writes = [];
  return { m, writes, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { writes.push(k); m.set(k, String(v)); } };
}
// the lesson page's own shape (localBlob(): the normalized profile, then the ten collections) — as in checkin.test.mjs
const BEFORE = {
  profile: { v: 1, setup: true, examType: 'A', target: 7, examDate: '', startDate: '2026-10-13', phase: 0,
    blocks: { a: ['09:30', '11:30'], b: ['14:00', '16:00'], c: ['17:30', '19:30'] }, eveningOn: true, todos: {}, grammar: {},
    cp: { 'w1d1:a1': '2026-10-13', 'w1d2:c3': '2026-10-14' }, cq: {}, ws: {}, ww: {}, ci: {}, wr: {}, pm: {}, dt: {}, pg: {}, wrd: {}, accent: 'us' },
  days: { '2026-10': { days: { 13: { done: { 'c:w1d1:a1': { m: 35, k: 'pron' } }, extra: [] } } } },
  logs: {}, mistakes: {}, notes: { n1: { t: '记一条', at: '2026-10-14' } }, mocks: {}, packs: {}, essays: {}, teacher: {}, reviews: {},
  base: { 'ev-2026-10-13': { v: 2, it: { 'w:monday': { '2026-10-13': { '091500': [1, 'L'] } } } } },
};
// the game's quiz on her today (w1d3), Singapore 2026-10-19 18:20, three questions: a word's meaning right, a dictation at
// 85 % (right: ≥ 80), a sound pair wrong with a hint; the level ends at 18:22:00. CONTRACT.doc is exactly what is written.
export const CONTRACT = {
  today: { week: 1, day: 3 }, start: '2026-10-19T18:20:00+08:00', rand: 'k2x9', docId: 'exam-2026-10-19', sid: 'q261019-1820-k2x9',
  answers: [
    { itemId: 'w:thirteen', at: '2026-10-19T18:20:30+08:00', ms: 9000, ok: true, pct: null, resp: 'thirteen', key: 'thirteen' },
    { itemId: 'd:w1d2:b1:f28c3f', at: '2026-10-19T18:21:05+08:00', ms: 30000, ok: true, pct: 85, resp: 'It cost thirteen pounds.', key: 'It costs thirteen pounds.' },
    { itemId: 'p:fool|full', at: '2026-10-19T18:21:40+08:00', ms: 7000, ok: false, pct: null, resp: 'fool', key: 'full', hinted: true },
  ],
  end: '2026-10-19T18:22:00+08:00',
  doc: { v: 2,
    s: { 'q261019-1820-k2x9': { k: 'quiz', d: '2026-10-19', t0: '182000', n: 3, bv: 1, tier: 1, ch: 1, seed: 'game',
      p: [['0', 'VM', 'game', '', 'w:thirteen', '', ''], ['1', 'LD', 'game', '', 'd:w1d2:b1:f28c3f', '', ''], ['2', 'LP', 'game', '', 'p:fool|full', '', '']] } },
    a: { 'q261019-1820-k2x9': {
      0: { 182030: [1, 'VM', 'game', 'w:thirteen', '', 'thirteen', 'thirteen', 9000, '', '', '2026-10-19'] },
      1: { 182105: [85, 'LD', 'game', 'd:w1d2:b1:f28c3f', '', 'It cost thirteen pounds.', 'It costs thirteen pounds.', 30000, '1', '', '2026-10-19'] },
      2: { 182140: [0, 'LP', 'game', 'p:fool|full', '', 'fool', 'full', 7000, 'h', '', '2026-10-19'] } } },
    e: { 'q261019-1820-k2x9': { 182200: 3 } } },
  score: { right: 2, of: 3 },
  // 周考: week 1's review day (the page's slot N: every step of it) learned on 10-18; the listening part taken and ended on
  // 10-19 (1 of 2 right), the reading part begun on 10-20 and not ended
  hall: ['w1d7:a1', 'w1d7:a2', 'w1d7:a3', 'w1d7:b1', 'w1d7:b2', 'w1d7:b3', 'w1d7:c1'], hallOn: '2026-10-18',
  week: { 'exam-2026-10-19': { v: 2,
    s: { 'wL261019-0900-aaaa': { k: 'week', part: 'L', wk: 'w1', d: '2026-10-19', t0: '090000', n: 2, bv: 1, tier: 1, ch: 1, seed: 'aaaa', p: [['0', 'LC', 'gen-x', '', '', '', ''], ['1', 'LC', 'gen-x', '', '', '', '']] },
         'wR261020-0900-bbbb': { k: 'week', part: 'R', wk: 'w1', d: '2026-10-20', t0: '090000', n: 2, bv: 1, tier: 1, ch: 1, seed: 'bbbb', p: [['0', 'RT', 'gen-x', '', '', '', ''], ['1', 'RT', 'gen-x', '', '', '', '']] } },
    a: { 'wL261019-0900-aaaa': { 0: { '090100': [1, 'LC', 'gen-x', '', '', 'a', 'a', 5000, '', '', '2026-10-19'] }, 1: { '090200': [0, 'LC', 'gen-x', '', '', 'b', 'c', 5000, '', '', '2026-10-19'] } },
         'wR261020-0900-bbbb': { 0: { '090100': [1, 'RT', 'gen-x', '', '', 'T', 'T', 5000, '', '', '2026-10-20'] } } },
    e: { 'wL261019-0900-aaaa': { '090300': 2 } } } },
  weekAt: { '2026-10-17': 'locked', '2026-10-18': 'soon', '2026-10-20': 'open', '2026-10-29': 'closed' },
  weekOpen: { asOf: '2026-10-20', parts: { L: 'done', R: 'doing', W: 'todo', S: 'todo' }, next: 'R', until: '2026-10-28', scores: { L: { right: 1, of: 2 } } },
};
const PREFS = JSON.stringify({ tz: 'sin', accent: 'us' });
async function setup(blob = BEFORE, prefs = PREFS) {
  await ielts();
  _reset();
  return memory(Object.assign(blob ? { [DATA_KEY]: JSON.stringify(blob) } : {}, prefs ? { [PREF_KEY]: prefs } : {}));
}
const blobOf = (b) => JSON.parse(b.m.get(DATA_KEY));
let ITEMS = null;
async function items() {
  if (ITEMS) return ITEMS;
  const w1 = await loadWeek(1), all = new Map();
  for (const d of w1.days) for (const s of (await import('../../src/learn/content.js')).daySteps(w1, d.n)) for (const it of s.items) if (!all.has(it.id)) all.set(it.id, it);
  ITEMS = CONTRACT.answers.map((a) => all.get(a.itemId));
  return ITEMS;
}
const flow = (its, week = 1, day = 3) => ({ level: { quiz: true, week, day, gates: [{ items: its }] } });
const T = { week: 1, day: 3, inGame: true };
// the run of CONTRACT: questions asked, answered, flushed after each, the end
async function play(b, o = {}) {
  const its = await items(), F = flow(its);
  const run = newRun(F, { today: T, store: b, now: Date.parse(CONTRACT.start), rand: CONTRACT.rand });
  const out = [];
  CONTRACT.answers.forEach((a, i) => {
    if (o.upTo != null && i >= o.upTo) return;
    const at = Date.parse(a.at);
    run.asked[a.itemId] = at - a.ms;
    takeAnswer(run, { itemId: a.itemId, ok: a.ok, pct: a.pct, resp: a.resp, key: a.key, hinted: !!a.hinted, first: true }, at);
    out.push(flushRun(run));
  });
  if (o.end !== false && o.upTo == null) { run.end = '182200'; out.push(flushRun(run)); }
  return { run, out };
}

test('the game\'s questions as the page\'s formats; her answer and the key as text (a reworded choice by its option)', async () => {
  const [word, dict, pair] = await items();
  assert.deepEqual([fmtOf(word), fmtOf(dict), fmtOf(pair)], ['VM', 'LD', 'LP']);
  assert.equal(fmtOf({ meta: { kind: 'word', input: 'type' } }), 'VS');
  assert.equal(fmtOf({ meta: { kind: 'sym', input: 'choice' } }), 'PS');
  assert.equal(fmtOf({ meta: { kind: 'quiz', input: 'choice' } }), 'GF');
  assert.equal(fmtOf({ meta: { kind: 'read', input: 'choice' } }), 'RN');
  assert.equal(fmtOf({ meta: { kind: 'write', input: 'write' } }), 'WT');
  assert.deepEqual(answerText(pair, { type: 'choice' }, 0), { resp: 'fool', key: 'full' });
  assert.deepEqual(answerText(pair, { type: 'choice', _perm: [1, 0] }, 0), { resp: 'full', key: 'full' }, 'a shuffled choice maps back');
  assert.deepEqual(answerText(dict, { type: 'type' }, 'It cost thirteen pounds.'), { resp: 'It cost thirteen pounds.', key: 'It costs thirteen pounds.' });
  assert.deepEqual(answerText(word, { type: 'choice' }, word.answer), { resp: 'thirteen', key: 'thirteen' });
  const lf = quizLeaf(dict, { ok: true, pct: 85.4, resp: 'x'.repeat(200), key: 'y'.repeat(200), ms: 9e9, date: '2026-10-19' });
  assert.deepEqual([lf[0], lf[1], lf[2], lf[4], lf[5].length, lf[6].length, lf[7], lf[8], lf[9], lf.length], [85, 'LD', 'game', '', 160, 120, 600000, '1', '', 11]);
  assert.equal(quizSid('2026-10-19', '182000', 'K2X9'), 'q261019-1820-k2x9');
  assert.equal(mondayOf('2026-10-19'), '2026-10-19'); assert.equal(mondayOf('2026-10-18'), '2026-10-12'); assert.equal(addDays('2026-10-28', 4), '2026-11-01');
});

test('today\'s quiz is written as the page writes one: exam-<Monday>, the session with its first answer, a leaf a question, the end — every other byte the same', async () => {
  const b = await setup(), before = b.m.get(DATA_KEY);
  const { out } = await play(b);
  assert.deepEqual(out.map((r) => [r.ok, r.changed, r.right, r.of]), [[true, true, 1, 1], [true, true, 2, 2], [true, true, 2, 3], [true, true, 2, 3]]);
  const after = blobOf(b);
  assert.deepEqual(after.base[CONTRACT.docId], CONTRACT.doc);
  // nothing else: every other field and document, as the same JSON text
  const was = JSON.parse(before);
  for (const k of Object.keys(was)) if (k !== 'base') assert.equal(JSON.stringify(after[k]), JSON.stringify(was[k]), k);
  for (const k of Object.keys(was.base)) assert.equal(JSON.stringify(after.base[k]), JSON.stringify(was.base[k]), k);
  assert.deepEqual(Object.keys(after).sort(), Object.keys(was).sort());
  assert.deepEqual(Object.keys(after.base), [...Object.keys(was.base), CONTRACT.docId]);
  // the page's reading of it (sched.js sessionSummaries / offer): today's quiz done, 2 / 3
  assert.deepEqual(quizToday(after.base, '2026-10-19'), { sid: CONTRACT.sid, right: 2, of: 3 });
  const s = examSessions(after.base)[0];
  assert.deepEqual([s.kind, s.d, s.n, s.done, s.right, s.end, s.endDate], ['quiz', '2026-10-19', 3, 3, 2, '182200', '2026-10-19']);
  assert.deepEqual(CONTRACT.score, { right: 2, of: 3 });
});

test('the first answer writes the session with it (never a session alone); the same run again writes nothing; a second quiz today is practice', async () => {
  const b = await setup();
  const its = await items(), F = flow(its);
  const run = newRun(F, { today: T, store: b, now: Date.parse(CONTRACT.start), rand: CONTRACT.rand });
  assert.deepEqual(flushRun(run), { ok: false, reason: 'empty' }, 'no answer yet: nothing');
  assert.equal(b.writes.length, 0);
  await play(b, { upTo: 1 });
  let doc = blobOf(b).base[CONTRACT.docId];
  assert.deepEqual(Object.keys(doc.a[CONTRACT.sid]), ['0']); assert.equal(doc.e, undefined, 'no end before the level ends');
  assert.deepEqual(quizToday(blobOf(b).base, '2026-10-19'), { sid: CONTRACT.sid, right: 1, of: 1 }, 'one answer: today\'s quiz is done (§2.2 做了一半)');
  // the whole run (the same sid): the rest goes on; then again — one write less than the leaves, none the second time
  const c = await setup();
  await play(c);
  const n = c.writes.length, text = c.m.get(DATA_KEY);
  const again = await play(c);
  assert.equal(c.writes.length, n, 'the same run twice: nothing written');
  assert.ok(again.out.every((r) => r.ok && !r.changed));
  assert.equal(c.m.get(DATA_KEY), text);
  // a second quiz the same day (another run, another sid): practice — not a byte
  const run2 = newRun(F, { today: T, store: c, now: Date.parse('2026-10-19T20:00:00+08:00'), rand: 'zzzz' });
  run2.asked['w:thirteen'] = Date.parse('2026-10-19T20:00:00+08:00');
  assert.ok(takeAnswer(run2, { itemId: 'w:thirteen', ok: false, resp: 'thirty', key: 'thirteen' }, Date.parse('2026-10-19T20:00:05+08:00')));
  const r2 = flushRun(run2);
  assert.deepEqual([r2.ok, r2.practice, r2.right, r2.of], [true, true, 2, 3]);
  assert.equal(run2.off, true);
  assert.equal(c.writes.length, n); assert.equal(c.m.get(DATA_KEY), text);
  // the page's own quiz today counts too (its record, another sid, one answer)
  const pg = clone(BEFORE); pg.base['exam-2026-10-19'] = { v: 2, s: { 'q261019-0930-p4ge': { k: 'quiz', d: '2026-10-19', t0: '093000', n: 8, bv: 1, tier: 1, ch: 1, seed: 'd20261019', p: [] } },
    a: { 'q261019-0930-p4ge': { 0: { '093100': [1, 'VS', 'gen-x', 'w:monday', 'V-spell', 'Monday', 'Monday', 9000, 'c', 'abc', '2026-10-19'] } } } };
  const d = await setup(pg);
  const r3 = (await play(d)).out[0];
  assert.deepEqual([r3.practice, r3.right, r3.of], [true, 1, 1]); assert.equal(d.writes.length, 0);
});

test('only today\'s quiz, only into her account; no blob → nothing created; the week by her wall clock (设置 → 时区)', async () => {
  const its = await items();
  const b = await setup();
  assert.equal(newRun(flow(its, 1, 2), { today: T, store: b }).off, true, 'another day\'s quiz is practice');
  assert.equal(newRun(flow(its), { today: null, store: b }).off, true, 'not from her App');
  assert.equal(newRun(flow(its), { today: { week: 4, day: 3, inGame: false }, store: b }).off, true);
  const none = await setup(null, null);
  assert.equal(newRun(flow(its), { today: T, store: none }).off, true);
  assert.deepEqual(saveQuiz(none, { sid: CONTRACT.sid, d: '2026-10-19', t0: '182000', rows: [], answers: {} }), { ok: false, reason: 'no-workbench' });
  assert.equal(none.m.size, 0, 'nothing created');
  // 00:30 in Singapore on 10-19 is 17:30 on 10-18 in London: the London learner's quiz is 10-18's, in exam-2026-10-12
  for (const [tz, date, doc] of [['sin', '2026-10-19', 'exam-2026-10-19'], ['lon', '2026-10-18', 'exam-2026-10-12'], ['lax', '2026-10-18', 'exam-2026-10-12']]) {
    const c = await setup(BEFORE, JSON.stringify({ tz }));
    const run = newRun(flow(its), { today: T, store: c, now: Date.parse('2026-10-19T00:30:00+08:00'), rand: 'aaaa' });
    takeAnswer(run, { itemId: 'w:thirteen', ok: true, resp: 'thirteen', key: 'thirteen' }, Date.parse('2026-10-19T00:30:10+08:00'));
    flushRun(run);
    const base = blobOf(c).base;
    assert.ok(base[doc] && base[doc].s[run.sid], tz);
    assert.equal(base[doc].s[run.sid].d, date, tz);
    assert.equal(base[doc].a[run.sid][0][Object.keys(base[doc].a[run.sid][0])[0]][10], date, tz);
  }
  // a week's document over 180 KB: the next one (store.js docForNew)
  const big = { 'exam-2026-10-19': { v: 2, s: {}, a: { x: 'z'.repeat(DOC_MAX + 10) } } };
  assert.equal(docForNew(big, '2026-10-21'), 'exam-2026-10-19-2');
});

test('the main menu\'s 今日小考: offered as the page offers it — learned before today, not the review day, no 周考 that day; done → her score; 改天 → later', async () => {
  const o = clone(BEFORE);
  assert.deepEqual(quizOffer(o, { week: 1, day: 3 }, '2026-10-19', plan), { state: 'open' });
  assert.equal(quizOffer(o, { week: 1, day: 7 }, '2026-10-19', plan), null, 'the review day: no quiz');
  const fresh = clone(BEFORE); fresh.profile.cp = { 'w1d1:a1': '2026-10-19' };
  assert.equal(quizOffer(fresh, { week: 1, day: 1 }, '2026-10-19', plan), null, 'nothing learned before today');
  const later = clone(BEFORE); later.base['exam-plan-2026-10'] = { v: 2, d: { 19: { '090000': 'later' } } };
  assert.equal(decisionOf(later.base, '2026-10-19'), 'later');
  assert.deepEqual(quizOffer(later, { week: 1, day: 3 }, '2026-10-19', plan), { state: 'later' });
  later.base['exam-plan-2026-10'].d[19]['100000'] = 'go';
  assert.deepEqual(quizOffer(later, { week: 1, day: 3 }, '2026-10-19', plan), { state: 'open' }, 'the latest decision wins');
  const done = clone(BEFORE); done.base[CONTRACT.docId] = clone(CONTRACT.doc);
  assert.deepEqual(quizOffer(done, { week: 1, day: 3 }, '2026-10-19', plan), { state: 'done', right: 2, of: 3, sid: CONTRACT.sid });
  // a weekly exam recommended that day: no quiz (the page puts the week's part in the review time instead)
  const wk = weekBlob();
  assert.equal(quizOffer(wk, { week: 2, day: 1 }, '2026-10-20', plan), null);
  assert.deepEqual(quizOffer(wk, { week: 2, day: 1 }, '2026-10-29', plan), { state: 'open' }, 'the window gone: the quiz is back');
});

function weekBlob() {
  const o = clone(BEFORE);
  for (const w of [1]) for (let d = 1; d <= 7; d++) { const P = plan(w, d); [...P.gates, ...P.signs].forEach((x) => { o.profile.cp[x.step] = d === 7 ? CONTRACT.hallOn : '2026-10-1' + d; }); }
  Object.assign(o.base, clone(CONTRACT.week));
  return o;
}
test('周考 on the page, read: locked · soon (the review day learned today) · open (its parts) · done · closed; 满月 weeks; the window ends where the next week starts', () => {
  assert.deepEqual(hallSteps(BEFORE, 1, plan), CONTRACT.hall, 'every step of the review day, as the page\'s hallDay');
  const o = weekBlob();
  for (const [asOf, state] of Object.entries(CONTRACT.weekAt)) assert.equal(weekExam(o, 1, asOf, plan).state, state, asOf);
  const x = weekExam(o, 1, CONTRACT.weekOpen.asOf, plan);
  for (const k of ['parts', 'next', 'until', 'scores']) assert.deepEqual(x[k], CONTRACT.weekOpen[k], k);
  assert.equal(x.doneOn, CONTRACT.hallOn); assert.equal(x.month, false);
  assert.equal(weekExam(BEFORE, 1, '2026-10-20', plan).state, 'locked', 'review day not learned');
  // the next course week begun on 10-24: the window closes on 10-23
  const nx = weekBlob(); nx.profile.cp['w2d1:a1'] = '2026-10-24';
  assert.equal(weekExam(nx, 1, '2026-10-23', plan).until, '2026-10-23');
  assert.equal(weekExam(nx, 1, '2026-10-24', plan).state, 'closed');
  // all four parts ended → done, with the listening and reading scores
  const all = weekBlob(), D = all.base['exam-2026-10-19'];
  for (const [part, sid] of [['R', 'wR261020-0900-bbbb'], ['W', 'wW261021-0900-cccc'], ['S', 'wS261021-0930-dddd']]) {
    if (!D.s[sid]) { D.s[sid] = { k: 'week', part, wk: 'w1', d: '2026-10-21', t0: '090000', n: 1, bv: 1, tier: 1, ch: 1, seed: 'x', p: [['0', part === 'W' ? 'WM' : 'SP', 'gen-x', '', '', '', '']] }; D.a[sid] = { 0: { '090500': [null, part === 'W' ? 'WM' : 'SP', 'gen-x', '', '', '', '', 5000, '', '', '2026-10-21'] } }; }
    D.e[sid] = { '091000': 1 };
  }
  const y = weekExam(all, 1, '2026-10-22', plan);
  assert.equal(y.state, 'done');
  assert.deepEqual(['L', 'R', 'W', 'S'].map((p) => partScore(y, p)), ['1/2', '1/1', '✓', '✓']);
  assert.equal(examLine(y), '考过了');
  assert.match(examPill(y).text, /^第 1 周周考考过了 · 听 1\/2 · 读 1\/1 · 写 ✓ · 说 ✓$/);
  assert.match(examAria(y), /听力 1\/2 · 阅读 1\/1 · 写作 考完 · 口语 考完/);
  assert.equal(examLine(x), '能考 · 1 / 4 段'); assert.equal(examPill(x).text, '第 1 周周考开着 · 下一段：阅读'); assert.equal(examPill(weekExam(o, 1, '2026-10-17', plan)), null);
  // the full-moon weeks
  const m4 = clone(BEFORE); m4.packs = { p4: { week: { id: 'w4', days: [{ id: 'w4d7', n: 7, a: [{ id: 'a1', type: 'weekly' }] }] } } };
  assert.deepEqual(hallSteps(m4, 4, plan), ['w4d7:a1'], 'her pack\'s week: its review day');
  m4.profile.cp['w4d7:a1'] = '2026-11-08';
  const mx = weekExam(m4, 4, '2026-11-09', plan);
  assert.deepEqual([mx.month, mx.state], [true, 'open']);
  assert.match(examPill(mx).text, /^满月月考开着/);
});

test('the course map: the 周考 node from the page\'s record, 今日小考 on her today\'s node', () => {
  const o = weekBlob();
  const m = courseMap({ weeks: 3, days: 7, today: { week: 2, day: 1 }, exam: (w) => weekExam(o, w, '2026-10-20', plan), quiz: () => ({ state: 'done', right: 2, of: 3 }) });
  assert.equal(m[0].boss.exam.state, 'open'); assert.equal(m[1].boss.exam.state, 'locked');
  assert.equal(m[1].days[0].qz, 'done'); assert.equal(m[1].days[1].qz, null, 'only her today');
  assert.equal(courseMap({ today: { week: 1, day: 3 } })[0].boss.exam, null, 'no account: no exam');
  assert.equal(courseMap({ today: { week: 1, day: 3 }, quiz: () => { throw new Error('x'); } })[0].days[2].qz, null);
});

test('wiring: the duel tells the answer, the quiz run is loaded, the main menu / map / results show it; the look', () => {
  const D = src('src/learn/forms/duel.js'), I = src('src/learn/forms/index.js'), M = src('src/ui/menus.js'), Q = src('src/learn/quiz-run.js'), CSS = src('styles/ui.css');
  assert.match(D, /this\._emit\('learn:answer', \{ itemId: item\.id, ok: r\.ok, first, gate: g\.id, hinted, relearn: !!item\._relearn, flip: !!p\._flip, pct: r\.pct \?\? null, \.\.\.answerText\(item, p, ans\) \}\)/);
  assert.match(I, /import '\.\.\/quiz-run\.js';/);
  assert.match(Q, /on\('learn:question'/); assert.match(Q, /on\('learn:answer'/); assert.match(Q, /on\('learn:done'/);
  assert.match(Q, /addEventListener\('pagehide'/, 'a pending leaf goes when the page hides');
  assert.match(M, /const qz = this\._quizItem\(T\);\n\s+if \(qz\) items\.splice\(items\.indexOf\(ci \|\| mapBtn\) \+ 1, 0, qz\);/);
  assert.match(M, /this\._startLearn\(\{ week: T\.week, day: T\.day, kind: 'quiz' \}/);
  assert.match(M, /exam: \(w\) => examFor\(w\), quiz: \(\) => \(T \? quizFor\(T\) : null\)/);
  assert.match(M, /this\._bookAt = \{ page: 'exam' \}; this\._go\('book'\);/, 'the pill opens the 课本 at 考试');
  assert.match(M, /if \(x\.boss\) this\._startLearn\(\{ week: W, day: LEARN\.days, kind: 'boss' \}, node\)/, 'the 周考 node still opens the game\'s boss');
  const a = CSS.indexOf('游戏为主体 第二期: 今日小考'), css = CSS.slice(a);
  assert.ok(a > 0);
  assert.match(css, /\.iw-cmap__expill \{[^}]*min-height: 44px/);
  assert.match(css, /\.iw-cmap__expill\[hidden\] \{ display: none; \}/);
  assert.match(css, /\.iw-cmap__expill\.is-down \{ transform: translateY\(3px\) scale\(\.97\); transition-duration: 0s; \}/, 'pressed: the same frame');
  for (const m of css.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\n?\}\n/g)) [...m[1].matchAll(/([a-z-]+):/g)].forEach((x) => assert.ok(['transform', 'opacity'].includes(x[1]), 'keyframes move ' + x[1]));
  const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(rm, /\.iw-qrec \{ animation: iw-fade/);
  assert.match(rm, /\.iw-cmap__node\.is-boss\.is-ex-open \.iw-cmap__halo \{ animation: none; \}/);
});
