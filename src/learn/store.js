// src/learn/store.js — her progress and evidence (docs/LEARN.md §1.2, §5): localStorage key 'inkwave:learn:v1' (in Node, or
// when storage is blocked, an in-memory backend; setBackend() hands in another).
//
// The evidence is IELTS-Base's own format, so it can later be merged into her account on the sync server: one document per
// week, 'ev-<Monday>' = { v: 2, it: { <itemId>: { <YYYY-MM-DD>: { <HHMMSS>: [result, mode] } } } } (app/base/model.js
// validLeaf; result 1/0, or the percent for a dictation sentence; mode in Model.MODES). The rule is core.record's
// (app/base/core.js): only the first answer of the day about an item is evidence, a second one returns { first: false }
// and writes nothing (EXAM.md §1.2 当天首答). Due items come from the same memory model (Model.answers + Model.memory),
// not from a rule of our own.
import { ieltsNow } from './ielts.js';
import { itemOf, weekIndex, daySteps } from './content.js';

export const KEY = 'inkwave:learn:v1';

let backend = null;
let state = null;

// setBackend({ getItem, setItem }) — tests, Electron, or a future server-backed store
export function setBackend(b) {
  backend = b && typeof b.getItem === 'function' && typeof b.setItem === 'function' ? b : null;
  state = null;
}

function memoryBackend() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: (k) => { m.delete(k); } };
}
function be() {
  if (backend) return backend;
  try { if (typeof localStorage !== 'undefined' && localStorage && typeof localStorage.getItem === 'function') return (backend = localStorage); } catch (e) { /* blocked storage: memory */ }
  return (backend = memoryBackend());
}

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const clone = (o) => JSON.parse(JSON.stringify(o));
const pad2 = (n) => (n < 10 ? '0' : '') + n;
function dateOf(at) { const d = at instanceof Date ? at : at != null ? new Date(at) : new Date(); return isNaN(d.getTime()) ? new Date() : d; }
// her device's clock, as the host's wall clock (she and the app live in one zone)
function ymdOf(at) { const d = dateOf(at); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); }
function hmsOf(at) { const d = dateOf(at); return pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()); }
const fresh = () => ({ v: 1, ev: {} });
function S() { return state || store.load(); }

// the evidence mode of a game answer, by what the host writes for the same act (core.js mapEvidence): a lesson answer L;
// a typed word T, after a hint H, 「我的写法也对」 S; a written sentence W (S when claimed)
function modeOf(kind, o) {
  if (kind === 'word' && o.typed) return o.self ? 'S' : o.hinted ? 'H' : 'T';
  if (kind === 'write') return o.self ? 'S' : 'W';
  return 'L';
}

export const store = {
  load() {
    let o = null;
    try { const raw = be().getItem(KEY); o = raw ? JSON.parse(raw) : null; } catch (e) { o = null; }
    state = o && o.v === 1 && isObj(o.ev) ? o : fresh();
    return state;
  },
  save() {
    try { be().setItem(KEY, JSON.stringify(S())); return true; } catch (e) { return false; }
  },
  reset() { state = fresh(); return store.save(); },

  // the first answer of the day about an item is evidence; later ones are practice → { first: false }
  //   { itemId, ok, pct?, day?, at?, item?, hinted?, self?, typed? }
  //   ok: boolean; pct: the dictation percent (judge() returns it); day 'YYYY-MM-DD' and at (Date | ms) default to now
  recordFirst(a) {
    a = a || {};
    const I = ieltsNow(), M = I.Model;
    const id = String(a.itemId || (a.item && a.item.id) || '');
    if (!id) return { first: false, reason: 'no-item' };
    const info = itemOf(id), meta = (a.item && a.item.meta) || {};
    const kind = info ? info.item.kind : meta.kind || null;
    if (!kind || kind === 'lesson' || meta.scored === false) return { first: false, reason: 'not-scored' }; // like core.record: no item, no evidence
    const date = M.util.isYmd(a.day) ? a.day : ymdOf(a.at), hms = hmsOf(a.at);
    if (store.hasEvOn(id, date)) return { first: false };
    const mode = modeOf(kind, { typed: a.typed != null ? !!a.typed : !!meta.typed, hinted: !!a.hinted, self: !!a.self });
    if (!M.MODES[mode]) return { first: false, reason: 'bad-mode' };
    let r;
    if (kind === 'dict') {
      const p = a.pct != null ? Number(a.pct) : typeof a.ok === 'number' ? a.ok : a.ok ? 100 : 0;
      r = Math.max(0, Math.min(100, Math.round(isFinite(p) ? p : 0)));
    } else r = a.ok === true || Number(a.ok) >= 1 ? 1 : 0;
    const docId = M.util.evDocId(date), ev = S().ev;
    const doc = ev[docId] || (ev[docId] = { v: 2, it: {} });
    const byDate = doc.it[id] || (doc.it[id] = {});
    (byDate[date] || (byDate[date] = {}))[hms] = [r, mode];
    store.save();
    return { first: true, doc: docId, date, hms, leaf: [r, mode] };
  },

  hasEvOn(itemId, date) {
    const doc = S().ev[ieltsNow().Model.util.evDocId(date)], x = doc && doc.it && doc.it[itemId], y = isObj(x) ? x[date] : null;
    return isObj(y) && Object.keys(y).length > 0;
  },
  hasAny(itemId) {
    const ev = S().ev;
    return Object.keys(ev).some((k) => { const x = ev[k] && ev[k].it && ev[k].it[itemId]; return isObj(x) && Object.keys(x).some((d) => isObj(x[d]) && Object.keys(x[d]).length > 0); });
  },

  // scored items of the day that have evidence (any date) / all scored items of the day; an item taught twice in a day
  // (the word list and its flash cards) counts once
  progress(week, day) {
    const seen = new Set();
    let done = 0, total = 0;
    daySteps(week, day).forEach((st) => st.items.forEach((it) => {
      if (!it.meta.scored || seen.has(it.id)) return;
      seen.add(it.id); total++;
      if (store.hasAny(it.id)) done++;
    }));
    return { done, total };
  },

  // the week's items the memory model says are due (p < 0.6, or the last answer was wrong), most forgotten first
  due(week, asOf) {
    const M = ieltsNow().Model, index = weekIndex(week);
    const today = M.util.isYmd(asOf) ? asOf : ymdOf();
    const answers = M.answers(index, S().ev, null, null), out = [];
    answers.forEach((list, id) => {
      const it = index.items.get(id);
      if (!it) return;
      const mem = M.memory(it, list, null, today);
      if (mem.due) out.push({ id, p: mem.p });
    });
    out.sort((a, b) => a.p - b.p || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return out.map((x) => x.id);
  },

  // the ev-<Monday> documents, IELTS-Base's format, a copy
  evidence() { return clone(S().ev); },
};
