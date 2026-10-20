// src/learn/notes.js — 积累本 · 学习日志 (游戏为主体 第三期第二步, docs/LEARN.md §43): the lesson page's two pages, read and
// written from the game's own pages in the 课本 (src/ui/book-pages/). The lesson page's rules, copied (app/index.html):
//   积累本   notes[id] = { id, d, t, en, zh, ex }          addNote (en ≤ 200, zh ≤ 300, ex ≤ 1000, trimmed; t one of
//                                                         NOTE_TYPES else 'word'); delete = the key goes (delItem)
//            the list: refreshNotes (a type or all, a search over en / zh / ex, newest first: d, then id, descending)
//   学习日志 logs['YYYY-MM'].entries += { id, d, k, m, n }  addLog / addLogFromForm (a day of the last 60, not to come; k one
//                                                         of MODULES else 'other'; m = posInt(·, 600); n ≤ 100; 0 minutes
//                                                         with a note is fine); delete = that entry goes (delLog)
//            the page: refreshLog (14 days of minutesOn, 7 days by module, 60 days of days with something in them)
//   ids are the page's uid(); dates her wall clock's (设置 → 时区: workbench.js wallZone / wallParts).
// Writing follows LEARN §39 / §41: her latest blob first (readBlob fresh), only that key changes — every other field and
// document is the same value, so the same JSON text — nothing is created without her blob, the same thing twice writes
// once, and after a write the cache goes (invalidate) and her App's mirror follows (mirror). Pure but for the storage
// (passed in), so Node tests run it; nothing here reads app/my-progress.*.
import { addDays } from './exams.js';   // (in UTC: no zone moves a day)
import { DATA_KEY, readBlob, invalidate, mirror, wallZone, wallParts } from './workbench.js';

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const keys = Object.keys;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const isYmd = (s) => YMD_RE.test(s || '');
const pad2 = (n) => (n < 10 ? '0' : '') + n;

/* ───────────────────────────── the page's tables ───────────────────────────── */
// app/index.html NOTE_TYPES (in its order) and NOTE_HINTS (the three fields' placeholders); the labels: notePlaceholders
export const NOTE_TYPES = Object.freeze({ word: '生词', para: '同义替换', expr: '好的表达', story: '口语素材' });
export const NOTE_HINTS = Object.freeze({
  word: ['单词或词组', '中文意思', '例句，或者在哪里遇到的'],
  para: ['题目里的说法', '原文里的说法', '出处，比如：剑 18 Test 1 阅读第 5 题'],
  expr: ['英文表达', '中文意思和用法', '例句'],
  story: ['素材标题，比如：一位对我影响很大的老师', '能用在哪些题：人物类、教育类…', '故事要点：是谁、什么时候、发生了什么、为什么难忘'],
});
export const NOTE_MAX = Object.freeze({ en: 200, zh: 300, ex: 1000 });
export function noteLabels(t) {
  const h = NOTE_HINTS[t] || NOTE_HINTS.word;
  return { en: t === 'para' ? '题目里的说法' : t === 'story' ? '素材' : '英文', zh: t === 'para' ? '原文里的说法' : t === 'story' ? '能用在哪些题' : '中文或解释', ex: '例句或备注', hints: h };
}
// app/index.html MODULES (names) and LOG_MODULES (the 科目 list, its order)
export const MODULES = Object.freeze({ vocab: '词汇', grammar: '语法', pron: '发音', listening: '听力', reading: '阅读', writing: '写作', speaking: '口语', mock: '模考', review: '复盘', other: '其他' });
export const LOG_MODULES = Object.freeze(['vocab', 'listening', 'reading', 'writing', 'speaking', 'grammar', 'pron', 'mock', 'review', 'other']);
export const LOG_NOTE_MAX = 100, LOG_MIN_MAX = 600, LOG_DAYS = 60, REPEAT_MS = 1500;
export const WEEK_CN = ['日', '一', '二', '三', '四', '五', '六'];

// the page's helpers, as they are there
export const uid = (now = Date.now(), rnd = Math.random) => now.toString(36) + rnd().toString(36).slice(2, 8);
export const posInt = (v, hi) => { const n = parseInt(v, 10); return n > 0 ? Math.min(hi, n) : 0; };
export const fmtH = (min) => String(Math.round(min / 6) / 10);
export const fmtDur = (min) => (min < 60 ? min + ' 分钟' : Math.floor(min / 60) + ' 小时' + (min % 60 ? ' ' + (min % 60) + ' 分' : ''));
export const fmtMD = (s) => (isYmd(s) ? +s.slice(5, 7) + '月' + +s.slice(8, 10) + '日' : '');
export const weekdayOf = (s) => WEEK_CN[new Date(s + 'T00:00:00Z').getUTCDay()];

// her today on her wall clock (null without her workbench: the page's todayStr() is the same reading)
export function todayOf(ls, now) {
  const p = wallParts(now == null ? new Date() : now, wallZone(ls));
  return p.y + '-' + pad2(p.m) + '-' + pad2(p.d);
}

// a second press of the same thing within REPEAT_MS is not a new entry (addLogFromForm's lastLogSig / lastLogAt)
export function repeatGuard(ms = REPEAT_MS) {
  let sig = '', at = -Infinity;
  return (s, t) => { if (s === sig && t - at < ms) return true; sig = s; at = t; return false; };
}

/* ───────────────────────────── 积累本: reading ───────────────────────────── */
// noteList(notes, { t, q }) → { tabs: [[id, label, count]], items, total }   (refreshNotes)
export function noteList(notes, f) {
  const t = f && f.t ? f.t : 'all', q = String((f && f.q) || '').trim().toLowerCase();
  const src = isObj(notes) ? notes : {};
  const all = keys(src).map((k) => src[k]).filter(Boolean);
  const counts = {};
  all.forEach((n) => { counts[n.t] = (counts[n.t] || 0) + 1; });
  const tabs = [['all', '全部', all.length]].concat(keys(NOTE_TYPES).map((k) => [k, NOTE_TYPES[k], counts[k] || 0]));
  const items = all.filter((n) => (t === 'all' || n.t === t) && (!q || [n.en, n.zh, n.ex].some((s) => String(s || '').toLowerCase().includes(q))))
    .sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : (a.id < b.id ? 1 : -1)));
  return { tabs, items, total: all.length };
}

// newNote({ t, en, zh, ex }, date, id) → the entry addNote stores | null (an empty first field: 「先填第一栏。」)
export function newNote(g, date, id) {
  const x = isObj(g) ? g : {};
  const en = String(x.en == null ? '' : x.en).trim();
  if (!en) return null;
  return { id, d: date, t: NOTE_TYPES[x.t] ? x.t : 'word', en: en.slice(0, NOTE_MAX.en), zh: String(x.zh == null ? '' : x.zh).trim().slice(0, NOTE_MAX.zh), ex: String(x.ex == null ? '' : x.ex).trim().slice(0, NOTE_MAX.ex) };
}

/* ───────────────────────────── 学习日志: reading ───────────────────────────── */
// getDay / logEntries / minutesOn / moduleMinutes as the page reads them, over her blob (o: { days, logs })
function dayOf(o, date) {
  const m = isObj(o) && isObj(o.days) ? o.days[date.slice(0, 7)] : null;
  const d = m && m.days && m.days[date.slice(8, 10)];
  return d && d.done && typeof d.done === 'object' ? d.done : {};
}
export function logEntries(o, ym) {
  const L = isObj(o) && isObj(o.logs) ? o.logs[ym] : null;
  return L && Array.isArray(L.entries) ? L.entries.filter((e) => e && typeof e === 'object') : [];
}
export function minutesOn(o, date) {
  let t = 0;
  const done = dayOf(o, date);
  keys(done).forEach((k) => { t += Number(done[k] && done[k].m) || 0; });
  logEntries(o, date.slice(0, 7)).forEach((e) => { if (e.d === date) t += Number(e.m) || 0; });
  return t;
}
export function moduleMinutes(o, dates) {
  const agg = {};
  const add = (k, m) => { const key = MODULES[k] ? k : 'other'; agg[key] = (agg[key] || 0) + (Number(m) || 0); };
  dates.forEach((date) => {
    const done = dayOf(o, date);
    keys(done).forEach((id) => { const x = done[id]; if (x) add(x.k, x.m); });
    logEntries(o, date.slice(0, 7)).forEach((e) => { if (e.d === date) add(e.k, e.m); });
  });
  return agg;
}
// logView(o, today) → { days: [{ date, m, today }] (14, oldest first), sum, avg, mods: [[k, m]] (7 days, most first),
//   list: [{ date, total, doneN, entries }] (the last 60 days that have anything, newest first) }   (refreshLog)
export function logView(o, today) {
  const days = Array.from({ length: 14 }, (_, i) => { const date = addDays(today, i - 13); return { date, m: minutesOn(o, date), today: i === 13 }; });
  const sum = days.reduce((s, d) => s + d.m, 0);
  const agg = moduleMinutes(o, Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)));
  const mods = keys(agg).map((k) => [k, agg[k]]).filter((r) => r[1] > 0).sort((a, b) => b[1] - a[1]);
  const list = [];
  for (let i = 0; i < LOG_DAYS; i++) {
    const date = addDays(today, -i), total = minutesOn(o, date), doneN = keys(dayOf(o, date)).length;
    const entries = logEntries(o, date.slice(0, 7)).filter((e) => e.d === date);
    if (!total && !doneN && !entries.length) continue;
    list.push({ date, total, doneN, entries });
  }
  return { days, sum, avg: Math.round(sum / 14), mods, list };
}

// checkLog({ d, k, m, n }, today) → { ok: true, d, k, m, n } | { ok: false, why, msg }   (addLogFromForm's checks, its words)
export function checkLog(g, today) {
  const x = isObj(g) ? g : {}, d = String(x.d == null ? '' : x.d), m = posInt(x.m, LOG_MIN_MAX), n = String(x.n == null ? '' : x.n).trim();
  if (!isYmd(d)) return { ok: false, why: 'date', msg: '日期不对。' };
  if (d > today) return { ok: false, why: 'future', msg: '还没到这一天，不能提前记。' };
  if (d < addDays(today, -(LOG_DAYS - 1))) return { ok: false, why: 'old', msg: '只能补记最近 60 天里的学习。' };
  if (!m && !n) return { ok: false, why: 'empty', msg: '先填学了多少分钟，或者只写一句备注（分钟填 0）。' };
  return { ok: true, d, k: MODULES[x.k] ? x.k : 'other', m, n: n.slice(0, LOG_NOTE_MAX) };
}

/* ───────────────────────────── writing ───────────────────────────── */
// put(ls, o) — her blob with one key's value replaced: every other field is the same value, so the same JSON text
function put(ls, o) {
  try { ls.setItem(DATA_KEY, JSON.stringify(o)); } catch (e) { return false; }
  invalidate();
  mirror(ls);
  return true;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// saveNote(ls, entry) → { ok: true, changed } | { ok: false, reason: 'no-workbench' | 'empty' | 'save' }
//   entry: newNote(…) (with its id); the same entry again: nothing is written
export function saveNote(ls, entry) {
  if (!isObj(entry) || typeof entry.id !== 'string' || !entry.id || !String(entry.en || '').trim()) return { ok: false, reason: 'empty' };
  const b = readBlob(ls, { fresh: true });
  if (!b) return { ok: false, reason: 'no-workbench' };
  const notes = isObj(b.o.notes) ? b.o.notes : {};
  if (same(notes[entry.id], entry)) return { ok: true, changed: false };
  const o = Object.assign({}, b.o, { notes: Object.assign({}, notes, { [entry.id]: entry }) });
  return put(ls, o) ? { ok: true, changed: true } : { ok: false, reason: 'save' };
}
// deleteNote(ls, id) → { ok: true, changed } (not there: nothing is written) | { ok: false, reason }
export function deleteNote(ls, id) {
  const b = readBlob(ls, { fresh: true });
  if (!b) return { ok: false, reason: 'no-workbench' };
  const notes = isObj(b.o.notes) ? b.o.notes : null;
  if (!notes || !Object.prototype.hasOwnProperty.call(notes, id)) return { ok: true, changed: false };
  const next = Object.assign({}, notes);
  delete next[id];
  return put(ls, Object.assign({}, b.o, { notes: next })) ? { ok: true, changed: true } : { ok: false, reason: 'save' };
}

// saveLog(ls, entry) → { ok: true, changed } | { ok: false, reason }   entry: { id, d, k, m, n } (checkLog's, with an id);
//   the month's document is the page's: { entries: [] } when there is none (or its entries are not a list), else the same
//   document with the entry put at the end; an entry with this id already there: nothing is written
export function saveLog(ls, entry) {
  if (!isObj(entry) || typeof entry.id !== 'string' || !entry.id || !isYmd(entry.d)) return { ok: false, reason: 'empty' };
  const b = readBlob(ls, { fresh: true });
  if (!b) return { ok: false, reason: 'no-workbench' };
  const ym = entry.d.slice(0, 7), logs = isObj(b.o.logs) ? b.o.logs : {};
  const old = logs[ym], ok = old && Array.isArray(old.entries);
  if (ok && old.entries.some((e) => e && e.id === entry.id)) return { ok: true, changed: false };
  const doc = ok ? Object.assign({}, old, { entries: old.entries.concat([entry]) }) : { entries: [entry] };
  const o = Object.assign({}, b.o, { logs: Object.assign({}, logs, { [ym]: doc }) });
  return put(ls, o) ? { ok: true, changed: true } : { ok: false, reason: 'save' };
}
// deleteLog(ls, id, ym) → { ok: true, changed } | { ok: false, reason }   (delLog: that entry goes, the rest stay in order)
export function deleteLog(ls, id, ym) {
  const b = readBlob(ls, { fresh: true });
  if (!b) return { ok: false, reason: 'no-workbench' };
  const logs = isObj(b.o.logs) ? b.o.logs : {}, doc = logs[ym];
  if (!doc || !Array.isArray(doc.entries) || !doc.entries.some((e) => e && e.id === id)) return { ok: true, changed: false };
  const next = Object.assign({}, doc, { entries: doc.entries.filter((e) => !(e && e.id === id)) });
  const o = Object.assign({}, b.o, { logs: Object.assign({}, logs, { [ym]: next }) });
  return put(ls, o) ? { ok: true, changed: true } : { ok: false, reason: 'save' };
}
