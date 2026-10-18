// src/learn/store.js — her progress and evidence (docs/LEARN.md §1.2, §5): localStorage key 'inkwave:learn:v1' (in Node, or
// when storage is blocked, an in-memory backend; setBackend() hands in another).
//
// The evidence is IELTS-Base's own format, so it merges into her account: one document per week, 'ev-<Monday>' =
// { v: 2, it: { <itemId>: { <YYYY-MM-DD>: { <HHMMSS>: [result, mode] } } } } (app/base/model.js validLeaf; result 1/0, or the
// percent for a dictation sentence; mode in Model.MODES). The rule is core.record's (app/base/core.js): only the first
// answer of the day about an item is evidence, a second one returns { first: false } and writes nothing (EXAM.md §1.2 当天首答).
// Due items come from the same memory model (Model.answers + Model.memory), not from a rule of our own.
//
// Her account (LEARN §16, src/learn/workbench.js): when her workbench shares this origin (the game at app/game/ in her App),
//   · exportDocs() → pushToWorkbench() merges these documents into the workbench's own S.base with Model.mergeDoc (her
//     answer of the day stands; idempotent). attachWorkbench() (the page: api.js) runs it a moment after every first
//     answer, when the page hides or goes away, and once at start for answers a killed page never pushed; weeks older than
//     four that her account fully holds are then dropped here (they share her 5 MB of localStorage);
//   · her own answers count here, read-only: an item she answered today in the lesson has had its first answer of the day,
//     and due() / progress() read her history and the game's together;
//   · dates and times are on her clock (设置 → 时区, Singapore when unset), as the lesson dates them.
// Without a workbench (plain INKWAVE, development, Node) the device's clock and the game's own documents only.
import { ielts, ieltsNow, ieltsLoaded } from './ielts.js';
import { itemOf, weekIndex, daySteps } from './content.js';
import * as WBK from './workbench.js';

export const KEY = 'inkwave:learn:v1';

let backend = null;
let state = null;

// setBackend({ getItem, setItem }) — tests, Electron, or a future server-backed store. The workbench's keys are read
// from (and her evidence merged into) the same backend: in the page both are this origin's localStorage.
export function setBackend(b) {
  backend = b && typeof b.getItem === 'function' && typeof b.setItem === 'function' ? b : null;
  state = null; zoneC = undefined; viewC = null;
  WBK._reset();
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
// her wall clock: the workbench's zone when it shares this origin (read once a session), else the device's
let zoneC; // undefined: not read yet
function zone() { if (zoneC === undefined && ieltsLoaded()) zoneC = WBK.wallZone(be()); return zoneC || null; }
function ymdOf(at) { const p = WBK.wallParts(at, zone()); return p.y + '-' + pad2(p.m) + '-' + pad2(p.d); }
function hmsOf(at) { const p = WBK.wallParts(at, zone()); return pad2(p.h) + pad2(p.mi) + pad2(p.s); }
const fresh = () => ({ v: 1, ev: {} });
function S() { return state || store.load(); }
// what the memory model reads: the game's documents with her account's (read-only), cached until either changes
let viewC = null;
function evView() {
  const mine = S().ev, hers = WBK.herEv(be());
  if (viewC && viewC.mine === mine && viewC.rev === (state && state.n) && viewC.hers === hers) return viewC.ev;
  const M = ieltsNow().Model, ids = new Set(Object.keys(hers).concat(Object.keys(mine))), ev = {};
  ids.forEach((id) => { ev[id] = !hers[id] ? mine[id] : !mine[id] ? hers[id] : M.mergeDoc(id, hers[id], mine[id]) || hers[id]; });
  viewC = { mine, rev: state && state.n, hers, ev };
  return ev;
}
function dayHas(doc, itemId, date) { const x = doc && isObj(doc.it) ? doc.it[itemId] : null, y = isObj(x) ? x[date] : null; return isObj(y) && Object.keys(y).length > 0; }

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
    viewC = null;
    return state;
  },
  save() {
    try { be().setItem(KEY, JSON.stringify(S())); return true; } catch (e) { return false; }
  },
  reset() { state = fresh(); viewC = null; return store.save(); },

  // the first answer of the day about an item is evidence; later ones are practice → { first: false }
  //   { itemId, ok, pct?, day?, at?, item?, hinted?, self?, typed?, how? }
  //   ok: boolean; pct: the dictation percent (judge() returns it); day 'YYYY-MM-DD' and at (Date | ms) default to now
  //   how: the mode when the act names it — a flip card's self-rating is 'F' (core.js mapEvidence: 看词自评 → F); it
  //   must be one of Model.MODES (else { first: false, reason: 'bad-mode' }, nothing written); without it, modeOf
  //   (on her clock). { first: false } also when her account already has an answer for the item that day.
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
    const mode = a.how != null ? String(a.how) : modeOf(kind, { typed: a.typed != null ? !!a.typed : !!meta.typed, hinted: !!a.hinted, self: !!a.self });
    if (!M.MODES[mode]) return { first: false, reason: 'bad-mode' };
    let r;
    if (kind === 'dict') {
      const p = a.pct != null ? Number(a.pct) : typeof a.ok === 'number' ? a.ok : a.ok ? 100 : 0;
      r = Math.max(0, Math.min(100, Math.round(isFinite(p) ? p : 0)));
    } else r = a.ok === true || Number(a.ok) >= 1 ? 1 : 0;
    const st = S(), docId = M.util.evDocId(date), ev = st.ev;
    const doc = ev[docId] || (ev[docId] = { v: 2, it: {} });
    const byDate = doc.it[id] || (doc.it[id] = {});
    (byDate[date] || (byDate[date] = {}))[hms] = [r, mode];
    st.n = (st.n || 0) + 1; // answers recorded; `pushed` is how many of them her account has seen
    store.save();
    if (live) live.soon();
    return { first: true, doc: docId, date, hms, leaf: [r, mode] };
  },

  // an answer for the item on that date — here, or (read-only) in her account
  hasEvOn(itemId, date) {
    const docId = ieltsNow().Model.util.evDocId(date);
    return dayHas(S().ev[docId], itemId, date) || dayHas(WBK.herEv(be())[docId], itemId, date);
  },
  hasAny(itemId) {
    const ev = evView();
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
    const answers = M.answers(index, evView(), null, null), out = [];
    answers.forEach((list, id) => {
      const it = index.items.get(id);
      if (!it) return;
      const mem = M.memory(it, list, null, today);
      if (mem.due) out.push({ id, p: mem.p });
    });
    out.sort((a, b) => a.p - b.p || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return out.map((x) => x.id);
  },
  // how many of the week's items are due (复习关, LEARN §36: the main menu's 「复习 K 个」)
  dueCount(week, asOf) { try { return store.due(week, asOf).length; } catch (e) { return 0; } },

  // the game's ev-<Monday> documents, IELTS-Base's format, a copy
  evidence() { return clone(S().ev); },

  // one week's document as her account stores it: exportDoc('ev-2026-10-12' | any 'YYYY-MM-DD' of that week | nothing = this
  // week on her clock) → { id: 'ev-<Monday>', doc: { v: 2, it } } with only valid leaves (Model.validLeaf, HHMMSS, a date of
  // that week), or null when the game has nothing for that week
  exportDoc(when) {
    const M = ieltsNow().Model, U = M.util;
    const id = WBK.EV_RE.test(String(when)) ? String(when) : U.evDocId(U.isYmd(when) ? when : ymdOf());
    const src = S().ev[id], mon = id.slice(3), out = { v: 2, it: {} };
    if (!src || !isObj(src.it)) return null;
    let n = 0;
    Object.keys(src.it).forEach((item) => {
      const byDate = src.it[item];
      if (!isObj(byDate)) return;
      Object.keys(byDate).forEach((date) => {
        const byT = byDate[date];
        if (!U.isYmd(date) || U.evDocId(date) !== id || U.diffDays(mon, date) > 6 || !isObj(byT)) return;
        Object.keys(byT).forEach((hms) => {
          if (!/^\d{6}$/.test(hms) || !M.validLeaf(byT[hms])) return;
          ((out.it[item] || (out.it[item] = {}))[date] || (out.it[item][date] = {}))[hms] = byT[hms].slice();
          n++;
        });
      });
    });
    return n ? { id, doc: out } : null;
  },
  // every week the game has, oldest first: [{ id, doc }]
  exportDocs() { return Object.keys(S().ev).filter((id) => WBK.EV_RE.test(id)).sort().map((id) => store.exportDoc(id)).filter(Boolean); },

  // merge the game's documents into her workbench's (Model.mergeDoc; her answer of the day stands; idempotent) →
  // { ok, changed, added, already, skipped, pruned } | { ok: false, reason: 'no-workbench' | 'save' }. Weeks that ended
  // more than four weeks ago and that her account fully holds are dropped from the game's copy afterwards.
  pushToWorkbench(o) {
    const ls = be(), st = S();
    const r = WBK.pushEvidence(ls, store.exportDocs());
    if (!r.ok) return r;
    st.pushed = st.n || 0;
    const U = ieltsNow().Model.util, cut = U.addDays(U.evDocId(ymdOf(o && o.at)).slice(3), -28);
    r.pruned = [];
    Object.keys(st.ev).forEach((id) => {
      if (!WBK.EV_RE.test(id) || id.slice(3) >= cut) return;
      if (WBK.covered(ls, id, st.ev[id])) { delete st.ev[id]; r.pruned.push(id); }
    });
    if (r.pruned.length) viewC = null;
    store.save();
    return r;
  },

  // the page: push to her account a moment after each first answer, when the page hides or goes away, and once now for
  // answers an earlier page recorded but never pushed (the WebContent process can be killed without a pagehide).
  // Quiet without a workbench; returns the detach function.
  attachWorkbench(opt) {
    if (live) return live.detach;
    const delay = (opt && opt.delay) || 800;
    let t = 0;
    // (游戏为主体: a push that changed her blob is mirrored into her App's folder too — workbench.js mirror; at once when the
    // page hides or goes away)
    const run = (now) => {
      clearTimeout(t); t = 0;
      try {
        if (!WBK.present(be()) || !ieltsLoaded()) return;
        const r = store.pushToWorkbench();
        if (r && r.ok && r.changed && r.changed.length) WBK.mirror(be(), !!now);
        else if (now) WBK.mirrorFlush();
      } catch (e) { /* her account is never worth a crash */ }
    };
    const soon = () => { clearTimeout(t); t = setTimeout(run, delay); };
    const flush = () => { if (t) run(true); else WBK.mirrorFlush(); };
    // (课本: before the lesson page opens in the game's book — also answers an earlier push never took)
    const sync = () => { const st = S(); if (t || (st.n || 0) !== (st.pushed || 0)) run(true); else WBK.mirrorFlush(); };
    const vis = () => { if (typeof document !== 'undefined' && document.hidden) flush(); };
    if (typeof document !== 'undefined') document.addEventListener('visibilitychange', vis);
    if (typeof window !== 'undefined') window.addEventListener('pagehide', flush);
    const detach = () => {
      clearTimeout(t); t = 0; live = null;
      if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', vis);
      if (typeof window !== 'undefined') window.removeEventListener('pagehide', flush);
    };
    live = { soon, flush, sync, detach };
    try {
      const st = S();
      if ((st.n || 0) !== (st.pushed || 0) && WBK.present(be())) ielts().then(() => { if (live) run(); }, () => {});
    } catch (e) { /* storage unreadable: nothing to catch up */ }
    return detach;
  },

  // 课本 (游戏为主体 第三期第一步, IELTS-Base docs/GAME-FIRST.md §4): the lesson page opens inside the game (a same-origin
  // iframe) and reads her blob as it loads — everything the game holds goes to her account first → true when attached
  flushWorkbench() {
    if (!live) return false;
    try { live.sync(); } catch (e) { /* her account is never worth a crash */ }
    return true;
  },
  // …and when the book closes the page may have written her blob (her settings, her clock, her answers): the game reads it again
  invalidateWorkbench() { zoneC = undefined; viewC = null; WBK.invalidate(); },
};
let live = null;
