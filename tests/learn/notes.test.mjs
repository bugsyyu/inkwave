// 积累本 · 学习日志 (游戏为主体 第三期第二步, docs/LEARN.md §43): the 课本's two pages made the game's own. The reading is the
// lesson page's (app/index.html refreshNotes / refreshLog: the same input gives the same output), the writing too
// (addNote / addLog / delItem / delLog): notes[id] = { id, d, t, en, zh, ex }, logs['YYYY-MM'].entries += { id, d, k, m, n },
// a delete takes away just that one — and nothing else changes, nothing is created without her blob, the same thing twice
// writes once, the dates are her wall clock's, the mirror follows. BEFORE / CONTRACT at the top are the same literals as
// IELTS-Base tests/base/game-notes.test.mjs, where the live page writes the same shapes itself and reads the game's back.
// A made-up learner — nothing here reads app/my-progress.*.
// 用法：node --test tests/learn/notes.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { ielts } from '../../src/learn/ielts.js';
import { DATA_KEY, PREF_KEY, mirrorFlush, _reset } from '../../src/learn/workbench.js';
import {
  NOTE_TYPES, NOTE_HINTS, NOTE_MAX, noteLabels, MODULES, LOG_MODULES, uid, posInt, fmtH, fmtDur, fmtMD, weekdayOf, todayOf, repeatGuard,
  noteList, newNote, logEntries, minutesOn, moduleMinutes, logView, checkLog, saveNote, deleteNote, saveLog, deleteLog,
} from '../../src/learn/notes.js';

// ---- the contract (IELTS-Base tests/base/game-notes.test.mjs has the same two literals) ----
// the lesson page's own shape (localBlob(): the normalized profile, then the ten collections)
export const BEFORE = {
  profile: { v: 1, setup: true, examType: 'A', target: 7, examDate: '', startDate: '2026-10-13', phase: 0,
    blocks: { a: ['09:30', '11:30'], b: ['14:00', '16:00'], c: ['17:30', '19:30'] }, eveningOn: true, todos: {}, grammar: {},
    cp: { 'w1d1:a1': '2026-10-13' }, cq: {}, ws: {}, ww: {}, ci: {}, wr: {}, pm: {}, dt: {}, pg: {}, wrd: {}, accent: 'us' },
  days: { '2026-10': { days: { 13: { done: { 'c:w1d1:a1': { m: 35, k: 'pron' } }, extra: [] }, 19: { done: { 'c:w1d5:a2': { m: 40, k: 'vocab' }, 'c:w1d5:b1': { m: 30, k: 'listening' } }, extra: [] } } } },
  logs: {
    '2026-09': { entries: [{ id: 'mfa0aa11bb22', d: '2026-09-02', k: 'reading', m: 50, n: '' }] },
    '2026-10': { entries: [{ id: 'mgw1k2abc3d4', d: '2026-10-18', k: 'listening', m: 25, n: '听了一集播客' }, { id: 'mgw1m9xyz8w7', d: '2026-10-19', k: 'other', m: 0, n: '今天最难：连读' }] },
  },
  mistakes: {},
  notes: {
    mgw0aa11bb22: { id: 'mgw0aa11bb22', d: '2026-10-18', t: 'para', en: 'rise sharply', zh: 'increase dramatically', ex: '剑 18 Test 1 阅读第 5 题' },
    mgw2cc33dd44: { id: 'mgw2cc33dd44', d: '2026-10-19', t: 'word', en: 'commute', zh: '通勤', ex: 'I commute to work by bus.' },
  },
  mocks: {}, packs: {}, essays: {}, teacher: {}, reviews: {},
  base: { 'ev-2026-10-13': { v: 2, it: { 'w:monday': { '2026-10-13': { '091500': [1, 'L'] } } } } },
};
// what she does in the game at 21:30 in Singapore on 10-20 (entries without their id: the page's uid() is random; the ids
// here are the ones the tests give the game's two entries)
export const CONTRACT = {
  now: '2026-10-20T21:30:00+08:00', today: '2026-10-20',
  note: { id: 'mh2c3d4e5f6g', given: { t: 'expr', en: '  take a rain check  ', zh: ' 改天吧 ', ex: '  Can I take a rain check on dinner?  ' },
    entry: { d: '2026-10-20', t: 'expr', en: 'take a rain check', zh: '改天吧', ex: 'Can I take a rain check on dinner?' } },
  log: { id: 'mh2c3d9z8y7x', given: { d: '2026-10-19', k: 'speaking', m: '45', n: '  跟读 Part 1  ' }, entry: { d: '2026-10-19', k: 'speaking', m: 45, n: '跟读 Part 1' }, ym: '2026-10' },
  del: { note: 'mgw0aa11bb22', log: ['mgw1k2abc3d4', '2026-10'] },
  // the pages before she writes: 积累本 newest first; 学习日志's 14 days, 7 days by module, the days in the 60
  view: { notes: ['mgw2cc33dd44', 'mgw0aa11bb22'], sum: 130, avg: 9, hours: '2.2', mods: [['listening', 55], ['vocab', 40]],
    list: [['2026-10-19', 70, 2, 1], ['2026-10-18', 25, 0, 1], ['2026-10-13', 35, 1, 0], ['2026-09-02', 50, 0, 1]] },
  // …and after the game's log entry (10-19, 45 minutes of 口语)
  viewAfter: { sum: 175, avg: 13, hours: '2.9', mods: [['listening', 55], ['speaking', 45], ['vocab', 40]] },
};

const clone = (o) => JSON.parse(JSON.stringify(o));
function memory(init) {
  const m = new Map(Object.entries(init || {})), writes = [];
  return { m, writes, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { writes.push(k); m.set(k, String(v)); } };
}
const PREFS = JSON.stringify({ tz: 'sin', accent: 'us' });
async function setup(blob = BEFORE, prefs = PREFS) {
  await ielts();
  _reset();
  return memory(Object.assign(blob ? { [DATA_KEY]: JSON.stringify(blob) } : {}, prefs ? { [PREF_KEY]: prefs } : {}));
}
const blobOf = (b) => JSON.parse(b.m.get(DATA_KEY));
const ID = CONTRACT.note.id, LID = CONTRACT.log.id;

test('the page\'s tables: four note types and their hints / labels, the ten 科目 in the 补记 order, the limits', () => {
  assert.deepEqual(Object.entries(NOTE_TYPES), [['word', '生词'], ['para', '同义替换'], ['expr', '好的表达'], ['story', '口语素材']]);
  assert.deepEqual(NOTE_HINTS.para, ['题目里的说法', '原文里的说法', '出处，比如：剑 18 Test 1 阅读第 5 题']);
  assert.deepEqual(NOTE_MAX, { en: 200, zh: 300, ex: 1000 });
  assert.deepEqual([noteLabels('word').en, noteLabels('word').zh, noteLabels('para').en, noteLabels('para').zh, noteLabels('story').en, noteLabels('story').zh, noteLabels('x').hints[0]],
    ['英文', '中文或解释', '题目里的说法', '原文里的说法', '素材', '能用在哪些题', '单词或词组']);
  assert.deepEqual(LOG_MODULES, ['vocab', 'listening', 'reading', 'writing', 'speaking', 'grammar', 'pron', 'mock', 'review', 'other']);
  assert.equal(MODULES.speaking, '口语');
  // the page's helpers
  assert.match(uid(), /^[0-9a-z]{8,}$/);
  assert.equal(uid(1760966400000, () => 0.123456789), (1760966400000).toString(36) + (0.123456789).toString(36).slice(2, 8));
  assert.deepEqual(['45', '700', '-5', 'abc', '', '12.9', 0].map((v) => posInt(v, 600)), [45, 600, 0, 0, 0, 12, 0]);
  assert.deepEqual([fmtH(130), fmtH(0), fmtDur(45), fmtDur(60), fmtDur(70), fmtMD('2026-10-05'), weekdayOf('2026-10-20')], ['2.2', '0', '45 分钟', '1 小时', '1 小时 10 分', '10月5日', '二']);
});

test('积累本 reads as the page does: a tab per type with its count, search over en / zh / ex, newest first (d, then id)', () => {
  const r = noteList(BEFORE.notes, {});
  assert.deepEqual(r.tabs, [['all', '全部', 2], ['word', '生词', 1], ['para', '同义替换', 1], ['expr', '好的表达', 0], ['story', '口语素材', 0]]);
  assert.deepEqual(r.items.map((n) => n.id), CONTRACT.view.notes);
  const more = Object.assign(clone(BEFORE.notes), {
    a1: { id: 'a1', d: '2026-10-19', t: 'expr', en: 'by and large', zh: '总的来说', ex: '' },   // the same day: the id decides
    z9: { id: 'z9', d: '2026-10-19', t: 'story', en: 'A teacher', zh: '人物类', ex: 'Mr Lee, Grade 9' },
    old: { t: '记一条', at: '2026-10-14' },   // an odd one (no en, no d): listed, never breaks the page
  });
  // (no d: the page's comparator puts it where V8's sort does there — first; IELTS-Base game-notes.test compares with the page)
  assert.deepEqual(noteList(more, {}).items.map((n) => n.id || 'odd'), ['odd', 'z9', 'mgw2cc33dd44', 'a1', 'mgw0aa11bb22']);
  assert.deepEqual(noteList(more, { t: 'expr' }).items.map((n) => n.id), ['a1']);
  assert.deepEqual(noteList(more, { q: '  BUS ' }).items.map((n) => n.id), ['mgw2cc33dd44'], 'the example, case-blind, trimmed');
  assert.deepEqual(noteList(more, { q: '人物' }).items.map((n) => n.id), ['z9'], 'the Chinese');
  assert.deepEqual(noteList(more, { t: 'word', q: 'rise' }).items, [], 'a type and a search together');
  assert.deepEqual(noteList(null, { t: 'all' }), { tabs: [['all', '全部', 0], ['word', '生词', 0], ['para', '同义替换', 0], ['expr', '好的表达', 0], ['story', '口语素材', 0]], items: [], total: 0 });
  // the entry addNote makes
  assert.deepEqual(newNote(CONTRACT.note.given, '2026-10-20', ID), Object.assign({ id: ID }, CONTRACT.note.entry));
  assert.equal(newNote({ en: '   ' }, '2026-10-20', ID), null, 'an empty first field: nothing (「先填第一栏。」)');
  const long = newNote({ t: 'nope', en: 'e'.repeat(250), zh: 'z'.repeat(400), ex: 'x'.repeat(1200) }, '2026-10-20', ID);
  assert.deepEqual([long.t, long.en.length, long.zh.length, long.ex.length], ['word', 200, 300, 1000]);
  assert.deepEqual(Object.keys(long), ['id', 'd', 't', 'en', 'zh', 'ex'], 'the page\'s key order');
});

test('学习日志 reads as the page does: 14 days of minutes (done steps and 补记), 7 days by module, the 60 days with anything in them', () => {
  const v = logView(BEFORE, CONTRACT.today);
  assert.equal(v.days.length, 14);
  assert.deepEqual([v.days[0].date, v.days[13].date, v.days[13].today], ['2026-10-07', '2026-10-20', true]);
  assert.deepEqual(v.days.filter((d) => d.m).map((d) => [d.date, d.m]), [['2026-10-13', 35], ['2026-10-18', 25], ['2026-10-19', 70]]);
  assert.deepEqual([v.sum, v.avg, fmtH(v.sum)], [CONTRACT.view.sum, CONTRACT.view.avg, CONTRACT.view.hours]);
  assert.deepEqual(v.mods, CONTRACT.view.mods);
  assert.deepEqual(v.list.map((x) => [x.date, x.total, x.doneN, x.entries.length]), CONTRACT.view.list);
  assert.equal(v.list[0].entries[0].n, '今天最难：连读', 'a 0-minute note is an entry of its day');
  // the 60-day edge: 59 days back is in, 60 is not
  const edge = clone(BEFORE); edge.logs['2026-08'] = { entries: [{ id: 'e1', d: '2026-08-22', k: 'vocab', m: 5, n: '' }, { id: 'e0', d: '2026-08-21', k: 'vocab', m: 5, n: '' }] };
  assert.deepEqual(logView(edge, CONTRACT.today).list.map((x) => x.date).slice(-1), ['2026-08-22']);
  // an unknown 科目 counts as 其他; odd entries and a month without a list are skipped, as on the page
  const odd = clone(BEFORE); odd.logs['2026-10'].entries.push(null, 'x', { id: 'q', d: '2026-10-20', k: 'nope', m: '15', n: '' }); odd.logs['2026-07'] = { entries: 'no' };
  assert.equal(minutesOn(odd, '2026-10-20'), 15);
  assert.deepEqual(moduleMinutes(odd, ['2026-10-20']), { other: 15 });
  assert.equal(logEntries(odd, '2026-07').length, 0);
  assert.deepEqual(logView({ profile: {} }, CONTRACT.today).list, [], 'nothing yet');
});

test('补记 checks: no day to come, only the last 60 days, minutes 0–600 (posInt), a note alone is fine, empty is not, a quick second press is not a new entry', () => {
  const T = CONTRACT.today;
  assert.deepEqual(checkLog(CONTRACT.log.given, T), Object.assign({ ok: true }, CONTRACT.log.entry));
  assert.deepEqual(checkLog({ d: '2026-10-21', k: 'vocab', m: 30 }, T), { ok: false, why: 'future', msg: '还没到这一天，不能提前记。' });
  assert.equal(checkLog({ d: '2026-08-21', k: 'vocab', m: 30 }, T).why, 'old');
  assert.equal(checkLog({ d: '2026-08-22', k: 'vocab', m: 30 }, T).ok, true, '59 days back is the oldest');
  assert.equal(checkLog({ d: '10/19', k: 'vocab', m: 30 }, T).msg, '日期不对。');
  assert.deepEqual(checkLog({ d: T, k: 'vocab', m: '', n: '  ' }, T), { ok: false, why: 'empty', msg: '先填学了多少分钟，或者只写一句备注（分钟填 0）。' });
  assert.equal(checkLog({ d: T, k: 'vocab', m: '-20', n: '' }, T).why, 'empty');
  assert.deepEqual(checkLog({ d: T, k: 'vocab', m: '0', n: '只记一句' }, T), { ok: true, d: T, k: 'vocab', m: 0, n: '只记一句' });
  assert.equal(checkLog({ d: T, k: 'vocab', m: '9999' }, T).m, 600, 'over 600: 600, as the page clamps');
  assert.equal(checkLog({ d: T, k: 'nope', m: 10 }, T).k, 'other');
  assert.equal(checkLog({ d: T, k: 'vocab', m: 10, n: 'n'.repeat(130) }, T).n.length, 100);
  const again = repeatGuard();
  assert.equal(again('a', 1000), false);
  assert.equal(again('a', 2400), true, 'the same within 1.5 s: a double tap, a second Enter');
  assert.equal(again('a', 2501), false, 'later: a new one');
  assert.equal(again('b', 2600), false, 'something else');
});

test('her today is her wall clock\'s (设置 → 时区; Singapore when unset)', async () => {
  const at = '2026-10-20T03:30:00Z';
  for (const [tz, want] of [['sin', '2026-10-20'], ['lax', '2026-10-19'], ['lon', '2026-10-20'], ['hnl', '2026-10-19']]) {
    const b = await setup(BEFORE, JSON.stringify({ tz }));
    assert.equal(todayOf(b, at), want, tz);
  }
  const unset = await setup(BEFORE, JSON.stringify({}));
  assert.equal(todayOf(unset, '2026-10-19T17:00:00Z'), '2026-10-20', 'unset: Singapore (01:00 on the 20th)');
});

test('记一条 writes notes[id] and nothing else; every other byte of her blob stays; read back; the mirror follows', async () => {
  const b = await setup();
  const posted = [];
  globalThis.webkit = { messageHandlers: { ielts: { postMessage: (m) => posted.push(m) } } }; globalThis.__IELTS_NATIVE = { platform: 'ios' };
  try {
    const e = newNote(CONTRACT.note.given, todayOf(b, CONTRACT.now), ID);
    assert.deepEqual(saveNote(b, e), { ok: true, changed: true });
    assert.deepEqual(b.writes, [DATA_KEY], 'one write, her key only');
    const want = clone(BEFORE); want.notes[ID] = Object.assign({ id: ID }, CONTRACT.note.entry);
    assert.equal(b.m.get(DATA_KEY), JSON.stringify(want), 'her blob with just this one put in (key order kept)');
    assert.deepEqual(noteList(blobOf(b).notes, {}).items.map((n) => n.id), [ID, ...CONTRACT.view.notes], 'newest first');
    assert.equal(mirrorFlush(), true);
    assert.deepEqual(posted, [{ type: 'mirror', text: b.m.get(DATA_KEY) }]);
    // the same entry again: nothing is written
    assert.deepEqual(saveNote(b, e), { ok: true, changed: false });
    assert.equal(b.writes.length, 1);
  } finally { delete globalThis.webkit; delete globalThis.__IELTS_NATIVE; _reset(); }
});

test('删除 takes away just that note (her other notes, in their order, untouched); a second delete writes nothing', async () => {
  const b = await setup();
  assert.deepEqual(deleteNote(b, CONTRACT.del.note), { ok: true, changed: true });
  const want = clone(BEFORE); delete want.notes[CONTRACT.del.note];
  assert.equal(b.m.get(DATA_KEY), JSON.stringify(want));
  assert.deepEqual(deleteNote(b, CONTRACT.del.note), { ok: true, changed: false });
  assert.deepEqual(deleteNote(b, 'constructor'), { ok: true, changed: false }, 'nothing from Object.prototype');
  assert.equal(b.writes.length, 1);
});

test('补记一条 puts { id, d, k, m, n } at the end of that month\'s entries, nothing else; the same entry twice writes once; a month without a list is the page\'s { entries: [] }', async () => {
  const b = await setup();
  const c = checkLog(CONTRACT.log.given, todayOf(b, CONTRACT.now));
  const e = { id: LID, d: c.d, k: c.k, m: c.m, n: c.n };
  assert.deepEqual(saveLog(b, e), { ok: true, changed: true });
  const want = clone(BEFORE); want.logs[CONTRACT.log.ym].entries.push(Object.assign({ id: LID }, CONTRACT.log.entry));
  assert.equal(b.m.get(DATA_KEY), JSON.stringify(want));
  assert.deepEqual(Object.keys(blobOf(b).logs[CONTRACT.log.ym].entries[2]), ['id', 'd', 'k', 'm', 'n']);
  assert.equal(typeof blobOf(b).logs[CONTRACT.log.ym].entries[2].m, 'number');
  const v = logView(blobOf(b), CONTRACT.today);
  assert.deepEqual([v.sum, v.avg, fmtH(v.sum), v.mods], [CONTRACT.viewAfter.sum, CONTRACT.viewAfter.avg, CONTRACT.viewAfter.hours, CONTRACT.viewAfter.mods]);
  assert.deepEqual(saveLog(b, e), { ok: true, changed: false });
  assert.equal(b.writes.length, 1);
  // a new month: its document is made; a month whose document has no list: replaced by the page's { entries: [] } + this
  const odd = clone(BEFORE); odd.logs['2026-11'] = { entries: 'broken', x: 1 };
  const b2 = await setup(odd);
  saveLog(b2, { id: 'n1', d: '2026-11-01', k: 'vocab', m: 5, n: '' });
  assert.deepEqual(blobOf(b2).logs['2026-11'], { entries: [{ id: 'n1', d: '2026-11-01', k: 'vocab', m: 5, n: '' }] });
  saveLog(b2, { id: 'n2', d: '2026-12-01', k: 'vocab', m: 5, n: '' });
  assert.deepEqual(Object.keys(blobOf(b2).logs), ['2026-09', '2026-10', '2026-11', '2026-12']);
  assert.deepEqual(blobOf(b2).profile, BEFORE.profile);
});

test('删除一条补记 takes just that entry out of its month (the rest in order, the other months untouched); not there: nothing written', async () => {
  const b = await setup();
  const [id, ym] = CONTRACT.del.log;
  assert.deepEqual(deleteLog(b, id, ym), { ok: true, changed: true });
  const want = clone(BEFORE); want.logs[ym].entries = want.logs[ym].entries.filter((e) => e.id !== id);
  assert.equal(b.m.get(DATA_KEY), JSON.stringify(want));
  assert.deepEqual(deleteLog(b, id, ym), { ok: true, changed: false });
  assert.deepEqual(deleteLog(b, 'mfa0aa11bb22', '2026-10'), { ok: true, changed: false }, 'another month\'s entry is not in this one');
  assert.equal(b.writes.length, 1);
});

test('no workbench here: nothing is created (notes, logs, deletes); a blob without a profile is not hers', async () => {
  const none = await setup(null, null);
  const e = newNote(CONTRACT.note.given, '2026-10-20', ID);
  assert.deepEqual(saveNote(none, e), { ok: false, reason: 'no-workbench' });
  assert.deepEqual(saveLog(none, { id: ID, d: '2026-10-20', k: 'vocab', m: 5, n: '' }), { ok: false, reason: 'no-workbench' });
  assert.deepEqual(deleteNote(none, 'x'), { ok: false, reason: 'no-workbench' });
  assert.deepEqual(deleteLog(none, 'x', '2026-10'), { ok: false, reason: 'no-workbench' });
  assert.deepEqual(none.writes, []); assert.equal(none.m.size, 0);
  const bad = memory({ [DATA_KEY]: JSON.stringify({ notes: {} }) }); _reset();
  assert.equal(saveNote(bad, e).reason, 'no-workbench');
  assert.deepEqual(bad.writes, []);
  const b = await setup();
  assert.deepEqual(saveNote(b, newNote({ en: 'x' }, '2026-10-20', '')), { ok: false, reason: 'empty' }, 'no id: nothing');
  assert.deepEqual(saveNote(b, null), { ok: false, reason: 'empty' });
  assert.deepEqual(saveLog(b, { id: ID, d: 'soon', k: 'vocab', m: 5, n: '' }), { ok: false, reason: 'empty' });
  assert.deepEqual(b.writes, []);
});

test('the lesson page in the book wrote her blob meanwhile: the game reads the latest before it writes (her new note stays)', async () => {
  const b = await setup();
  saveNote(b, newNote({ en: 'first' }, '2026-10-20', 'g1'));
  // the page (the 课本's iframe) adds one of its own
  const o = blobOf(b); o.notes.p1 = { id: 'p1', d: '2026-10-20', t: 'word', en: 'from the page', zh: '', ex: '' };
  b.m.set(DATA_KEY, JSON.stringify(o));
  saveNote(b, newNote({ en: 'second' }, '2026-10-20', 'g2'));
  assert.deepEqual(Object.keys(blobOf(b).notes).slice(-3), ['g1', 'p1', 'g2']);
  saveLog(b, { id: 'l1', d: '2026-10-20', k: 'vocab', m: 5, n: '' });
  const o2 = blobOf(b); o2.logs['2026-10'].entries.push({ id: 'p2', d: '2026-10-20', k: 'reading', m: 9, n: '' });
  b.m.set(DATA_KEY, JSON.stringify(o2));
  deleteLog(b, 'l1', '2026-10');
  assert.deepEqual(blobOf(b).logs['2026-10'].entries.map((e) => e.id), ['mgw1k2abc3d4', 'mgw1m9xyz8w7', 'p2']);
});
