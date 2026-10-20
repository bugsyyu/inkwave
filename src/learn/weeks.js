// src/learn/weeks.js — 第几周从哪里来 (gf-weeks, docs/LEARN.md §44): the game plays every week of her course. Week n is her
// account's course pack for it when she has one (the lesson page's packs(): blob.packs[id].week, each one its weekError
// lets load; a teacher's pack wins over the built-in week — app/index.html weeks()), else the game's own content/wN.json,
// else there is no week n yet (the map greys it: 等老师的课程包). Synchronous and pure but for the storage it reads (her
// blob through workbench.js readBlob), so appToday knows at once whether her today is a week the game can load.
//
//   weekError(w)        the lesson page's check of a stored week ('' = it loads), the same rules and words
//   herPacks(o)         Map<n, week>: her loadable packs by the number in their id ('w4' → 4); her blob's own objects —
//                       read-only (content.js clones one before it registers it: the blob is written back as a whole)
//   setPackStore(ls)    the storage her blob is read from (store.setBackend hands its own in; default localStorage)
//   herPack(n)          her pack for week n | null (read-only)
//   hasWeek(n)          the game can load week n (her pack, or content/)
//   courseWeeks()       { total, account, has(n), src(n) → 'pack' | 'content' | null }: total = her course's length
//                       (LEARN.course, or her last pack's week) when her account is here, else the game's own weeks
//   canon(x)            JSON with the keys sorted at every level: her pack and content/ are the same week whatever the order
import { LEARN } from '../config.js';
import { readBlob, present } from './workbench.js';

// app/index.html TYPE_NAME: the step types a stored week may hold
const TYPES = new Set(['symbols', 'symreview', 'words', 'flash', 'grammar', 'dictation', 'reading', 'pairs', 'write', 'speak', 'checkin', 'weekly', 'placement']);
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);

// app/index.html weekError (the page's words: a pack it turns down here is not in its course either)
export function weekError(w) {
  if (!w || typeof w !== 'object') return '文件格式不对';
  if (typeof w.id !== 'string' || !/^w\d{1,3}$/.test(w.id)) return '缺少周编号';
  if (typeof w.title !== 'string') return '缺少标题';
  if (!Array.isArray(w.days) || !w.days.length) return '没有课程内容';
  for (const d of w.days) {
    if (!d || typeof d.id !== 'string' || d.id.indexOf(w.id + 'd') !== 0) return '某一天的编号不对';
    if (d.n != null && !Number.isFinite(Number(d.n))) return '某一天的编号不对';
    for (const s of ['a', 'b', 'c']) {
      if (d[s] == null) continue;
      if (!Array.isArray(d[s])) return '时段格式不对';
      for (const st of d[s]) {
        if (!st || typeof st.id !== 'string' || !TYPES.has(st.type)) return '有不认识的练习类型';
        const pa = st.passage && typeof st.passage === 'object' ? st.passage : {}, sp = st.speak && typeof st.speak === 'object' ? st.speak : {};
        if ([st.words, st.items, st.pairs, st.quiz, st.lesson, pa.quiz, pa.gloss, pa.parse, sp.phrases].some((x) => x != null && !Array.isArray(x))) return d.id + ' 里 ' + st.id + ' 的内容格式不对';
      }
    }
  }
  return '';
}

// her loadable packs by week number (the page's packs(): every stored pack whose week loads; one week per id, the first)
const packsOf = new WeakMap();
export function herPacks(o) {
  if (!isObj(o)) return new Map();
  if (packsOf.has(o)) return packsOf.get(o);
  const out = new Map(), seen = new Set(), P = isObj(o.packs) ? o.packs : {};
  for (const id of Object.keys(P)) {
    const w = isObj(P[id]) ? P[id].week : null;
    if (!w || weekError(w) || seen.has(w.id)) continue;
    seen.add(w.id);
    const n = +w.id.slice(1);
    if (n > 0 && !out.has(n)) out.set(n, w);
  }
  packsOf.set(o, out);
  return out;
}

let packLs;   // undefined: this page's localStorage
export function setPackStore(ls) { packLs = ls && typeof ls.getItem === 'function' ? ls : undefined; }
function store() {
  if (packLs) return packLs;
  try { return typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function' ? localStorage : null; } catch (e) { return null; }
}
const blob = (ls) => { const b = ls ? readBlob(ls) : null; return b ? b.o : null; };

export function herPack(n, ls = store()) { return herPacks(blob(ls)).get(+n) || null; }
export const inContent = (n) => Number.isInteger(+n) && +n >= 1 && +n <= LEARN.weeks;
export function hasWeek(n, ls = store()) { return Number.isInteger(+n) && +n >= 1 && (inContent(n) || !!herPack(n, ls)); }

export function courseWeeks(ls = store()) {
  const mine = herPacks(blob(ls)), account = !!ls && present(ls);
  const last = Math.max(LEARN.weeks, ...mine.keys());
  const total = account ? Math.max(LEARN.course, last) : last;
  const src = (n) => (mine.has(+n) ? 'pack' : inContent(n) ? 'content' : null);
  return { total, account, has: (n) => !!src(n), src };
}

export function canon(x) {
  if (Array.isArray(x)) return '[' + x.map(canon).join(',') + ']';
  if (isObj(x)) return '{' + Object.keys(x).filter((k) => x[k] !== undefined).sort().map((k) => JSON.stringify(k) + ':' + canon(x[k])).join(',') + '}';
  return JSON.stringify(x === undefined ? null : x);
}
