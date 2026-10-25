// src/learn/workbench.js — IELTS-Base's own storage, read and written from the game (docs/LEARN.md §1.2, §16).
//
// In her App the game lives at app/game/ under the same origin as the workbench (ielts-base://app, or her server), so the
// workbench's localStorage is this page's localStorage:
//   'ielts-workbench:data:v1'   { profile, days, logs, …, base: { 'ev-<Monday>': { v: 2, it: { item: { date: { hms: leaf } } } }, … } }
//                               (app/index.html LOCAL_KEY / localBlob(); the evidence documents are S.base's, app/base/core.js)
//   'ielts-workbench:prefs:v1'  { accent, clips, tz, … } (prefsGet())
// What the game does with them:
//   · pushEvidence(ls, docs) — the game's ev-<Monday> documents (store.exportDocs()) merged into her S.base with IELTS-Base's
//     own Model.mergeDoc (key-wise union). 当天首答 (core.record's hasEvOn): a game leaf for (item, date) is left out when her
//     document already has an answer for that item on that day — hers came first in her account. Idempotent: a leaf that is
//     already there is "already", nothing is written when nothing changed, so running it twice never doubles anything.
//     Her sync (app/sync.js pendingChanges) digests every local document, so the merged weeks go to her server on the next
//     sync; the App's native mirror follows the workbench's own saves, i.e. the next time she does anything in the lesson.
//   · her answers, read-only (herEv): the store counts an item she already answered today in the lesson as answered (no second
//     「当天首答」), and due / progress read her history too.
//   · her clock (wallParts): the workbench dates evidence on the wall clock of 设置 → 时区 (Singapore when unset; 'device' =
//     this device's), not on the device's zone — the same host functions (vendor/ielts/host.js tzPlaceOf / tzParts) date the
//     game's answers, so a game answer and a lesson answer fall on the same day.
//   · her accent and whether the built-in recordings are on (accent(), clipsOn(): src/learn/audio.js).
// Never creates the workbench's key: without a blob that has a profile (plain INKWAVE, local development, Electron) all of
// this is off and the game keeps its own evidence only. Everything here takes the storage object (getItem / setItem), so a
// Node test hands in a Map-backed one; nothing reads app/my-progress.*.
import { ieltsNow } from './ielts.js';
import { EXAM_RE, DOC_V, quizToday, docForNew, tierOf } from './exams.js';

export const DATA_KEY = 'ielts-workbench:data:v1';
export const PREF_KEY = 'ielts-workbench:prefs:v1';
export const EV_RE = /^ev-\d{4}-\d{2}-\d{2}$/;
const HMS_RE = /^\d{6}$/;
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const keys = Object.keys;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function get(ls, k) { try { return ls && typeof ls.getItem === 'function' ? ls.getItem(k) : null; } catch (e) { return null; } }

/* ───────────────────────────── reading ───────────────────────────── */
// the parsed workbench blob. Reading it costs a copy and a parse of up to a few megabytes, so it is read once a session
// (the lesson page and the game never run at the same time in her App: one replaces the other in the web view) and again
// only with { fresh: true } — always before a write, so a merge never works on a stale copy.
let cache = { ls: null, raw: null, o: null, ev: null };
export function readBlob(ls, opt) {
  if (cache.ls === ls && !(opt && opt.fresh)) return cache.o ? { raw: cache.raw, o: cache.o } : null;
  const raw = get(ls, DATA_KEY);
  if (cache.ls === ls && cache.raw === raw && raw) return cache.o ? { raw, o: cache.o } : null;
  let o = null;
  if (raw) { try { o = JSON.parse(raw); } catch (e) { o = null; } }
  // the workbench's own test for its data (loadLocal / applyImport): an object with a profile object
  if (!isObj(o) || !isObj(o.profile)) o = null;
  cache = { ls, raw, o, ev: null };
  return o ? { raw, o } : null;
}
export function readPrefs(ls) {
  const raw = get(ls, PREF_KEY);
  if (!raw) return null;
  try { const p = JSON.parse(raw); return isObj(p) ? p : null; } catch (e) { return null; }
}
// is her workbench on this origin (it has saved prefs or data)?
export function present(ls) { return !!readPrefs(ls) || !!readBlob(ls); }

// her evidence documents (read-only: never modify what this returns); the same object until her blob is read again
const NONE = Object.freeze({});
export function herEv(ls) {
  const b = readBlob(ls);
  if (!b) return NONE;
  if (cache.ev) return cache.ev;
  const base = b && isObj(b.o.base) ? b.o.base : null, out = {};
  if (base) keys(base).forEach((id) => { const d = base[id]; if (EV_RE.test(id) && isObj(d) && isObj(d.it)) out[id] = d; });
  cache.ev = out;
  return out;
}

// normalizeProfile: profile.accent when it is 'us' / 'gb', else the prefs' (accentOf() reads the normalized profile)
export function accent(ls) {
  const b = readBlob(ls), a = b && b.o.profile.accent;
  if (a === 'us' || a === 'gb') return a;
  const p = readPrefs(ls);
  return p && p.accent === 'gb' ? 'gb' : 'us';
}
// 设置 → 口音和朗读 →「内置的真人感录音」 (Clips.enabled: prefs.clips !== false)
export function clipsOn(ls) { const p = readPrefs(ls); return !(p && p.clips === false); }

// her wall-clock zone: tzPlaceOf(prefs.tz).tz (an IANA zone, or null = this device's); null when there is no workbench here
export function wallZone(ls) {
  if (!present(ls)) return null;
  const p = readPrefs(ls) || {};
  try { return ieltsNow().Host.tzPlaceOf(p.tz).tz || null; } catch (e) { return null; }
}
// { y, m, d, h, mi, s } of an instant on that clock (the host's tzParts; zone null = the device's)
export function wallParts(at, zone) {
  const d = at instanceof Date ? at : at != null ? new Date(at) : new Date();
  const t = isNaN(d.getTime()) ? new Date() : d;
  return ieltsNow().Host.tzParts(t, zone || null);
}

/* ───────────────────────────── merging (pure) ───────────────────────────── */
// mergeEvidence(base, docs, Model) → { base, changed: [docId], added, already, skipped }
//   base: her S.base (not modified; the result's base is a shallow copy with the changed documents replaced, or `base`
//   itself when nothing changed); docs: [{ id: 'ev-<Monday>', doc: { v: 2, it } }] (store.exportDocs()).
//   added: leaves that go in; already: leaves her document already holds (a second run); skipped: (item, date) pairs she has
//   another answer for (her first answer of the day stands).
export function mergeEvidence(base, docs, M) {
  const src = isObj(base) ? base : {};
  let out = null, added = 0, already = 0, skipped = 0;
  const changed = [];
  (Array.isArray(docs) ? docs : []).forEach((x) => {
    const id = x && x.id, doc = x && x.doc;
    if (!EV_RE.test(String(id)) || !isObj(doc) || !isObj(doc.it)) return;
    const hers = isObj(src[id]) ? src[id] : null, hit = hers && isObj(hers.it) ? hers.it : {};
    const theirs = { v: 2, it: {} };
    let n = 0;
    keys(doc.it).forEach((item) => {
      const byDate = doc.it[item];
      if (!isObj(byDate)) return;
      keys(byDate).forEach((date) => {
        const byT = byDate[date];
        if (!YMD_RE.test(date) || !isObj(byT)) return;
        // the game keeps one leaf a day; the earliest valid one is its first answer
        const hms = keys(byT).filter((h) => HMS_RE.test(h) && M.validLeaf(byT[h])).sort()[0];
        if (!hms) return;
        const herDay = isObj(hit[item]) && isObj(hit[item][date]) ? hit[item][date] : null;
        if (herDay && keys(herDay).length) { if (same(herDay[hms], byT[hms])) already++; else skipped++; return; }
        (theirs.it[item] || (theirs.it[item] = {}))[date] = { [hms]: byT[hms] };
        n++;
      });
    });
    if (!n) return;
    const merged = M.mergeDoc(id, hers, theirs);
    if (!merged) return;
    if (!out) out = Object.assign({}, src);
    out[id] = merged;
    changed.push(id);
    added += n;
  });
  return { base: out || src, changed, added, already, skipped };
}

/* ───────────────────────────── her blob's text ───────────────────────────── */
// blobText(o) === JSON.stringify(o), byte for byte (tests/learn/cpu.test.mjs) — but a top-level value, or a document of
// `base`, that is the very object an earlier blobText serialized reuses that text. LEARN §52: every first answer's push
// stringified her whole blob (megabytes) to change one week's document; the push's copy shares every other field and
// document with the blob it read (Object.assign), so now only the documents the merge replaced are serialized. Sound
// because nothing in the game modifies her parsed blob (herEv's read-only rule; every writer copies what it changes —
// the test runs the game's ways over a deep-frozen blob).
const _texts = new WeakMap();
function partText(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  let t = _texts.get(v);
  if (t === undefined) { t = JSON.stringify(v); if (t !== undefined) _texts.set(v, t); }
  return t;
}
function objText(o, member) {   // JSON.stringify of a plain object, each member's text from member(value)
  let s = '{', n = 0;
  for (const k of keys(o)) {
    const t = member(o[k]);
    if (t === undefined) continue;   // (undefined / a function: left out, as JSON.stringify does)
    s += (n++ ? ',' : '') + JSON.stringify(k) + ':' + t;
  }
  return s + '}';
}
export function blobText(o) {
  return objText(o, (v) => (v === o.base && isObj(v) ? objText(v, partText) : partText(v)));
}

/* ───────────────────────────── writing ───────────────────────────── */
// pushEvidence(ls, docs) → { ok, changed, added, already, skipped } | { ok: false, reason }
//   reason: 'no-workbench' (no blob with a profile here: nothing is created), 'save' (setItem threw: storage full)
export function pushEvidence(ls, docs) {
  const b = readBlob(ls, { fresh: true });
  if (!b) return { ok: false, reason: 'no-workbench' };
  const M = ieltsNow().Model;
  const r = mergeEvidence(isObj(b.o.base) ? b.o.base : {}, docs, M);
  const res = { ok: true, changed: r.changed, added: r.added, already: r.already, skipped: r.skipped };
  if (!r.changed.length) return res;
  // a copy of her blob with base replaced: every other field, and every other document, is the same value, so the
  // workbench's JSON.stringify text for them is unchanged too (blobText: and not serialized again)
  const o = Object.assign({}, b.o, { base: r.base });
  const raw = blobText(o);
  try { ls.setItem(DATA_KEY, raw); } catch (e) { return { ok: false, reason: 'save', added: 0, changed: [] }; }
  cache = { ls, raw, o, ev: null };
  return res;
}

// does her account hold an answer for every (item, date) of this game document? (then the game's copy can go)
export function covered(ls, id, doc) {
  const hers = herEv(ls)[id], hit = hers && isObj(hers.it) ? hers.it : null;
  if (!hit || !isObj(doc) || !isObj(doc.it)) return false;
  return keys(doc.it).every((item) => isObj(doc.it[item]) && keys(doc.it[item]).every((date) => isObj(hit[item]) && isObj(hit[item][date]) && keys(hit[item][date]).length > 0));
}

/* ───────────────────────────── 打卡 (游戏为主体 第二期, LEARN §39) ───────────────────────────── */
// The lesson page's check-in (app/index.html rCheckin / saveCheckin, then the step's 做完: completeStep), written from the
// game exactly as the page writes it:
//   profile.ci[dayId] = { mood, note (trimmed, ≤ 500), date: her wall-clock today }    (saveCheckin)
//   profile.cp['<dayId>:<step id>'] = date, once                                        (completeStep: the step is done)
//   days['<YYYY-MM>'].days['<DD>'].done['c:<dayId>:<step id>'] = { m, k }, with it      (completeStep: the day's log)
// Same empty-value rules: a mood outside MOODS is no mood, no mood keeps the saved one; a note not given keeps the saved
// one. The step comes from her own packs first (the page's weeks(): a teacher's pack wins over the built-in week), else
// from the caller (the game's course, design.js DAY_PLAN); a day without a check-in step has no check-in.
// app/index.html MOODS ids (the page's labels and faces are the card's: src/ui/checkin-card.js)
export const MOOD_IDS = ['easy', 'ok', 'hard'];
export const NOTE_MAX = 500;
// (app/index.html MODULES: completeStep files the minutes under the step's k when it is one of these, else 'other')
const MODULE_IDS = ['vocab', 'grammar', 'pron', 'listening', 'reading', 'writing', 'speaking', 'mock', 'review', 'other'];
const DAY_ID_RE = /^[A-Za-z0-9._~-]{1,80}$/;

// her saved check-in for a day: { mood, note, date } | null (date set = 「已保存」, the page's own test)
export function herCheckin(ls, dayId) {
  const b = readBlob(ls), ci = b && isObj(b.o.profile.ci) ? b.o.profile.ci[dayId] : null;
  return isObj(ci) ? { mood: typeof ci.mood === 'string' ? ci.mood : '', note: typeof ci.note === 'string' ? ci.note : '', date: typeof ci.date === 'string' ? ci.date : '' } : null;
}
export function checkedIn(ls, dayId) { const c = herCheckin(ls, dayId); return !!(c && c.date); }

// the check-in step of a day in one of her packs (blob.packs[id].week): { id, m, k }; null when her pack has the day and
// no check-in step in it (the page shows none); undefined when no pack of hers has the day (the game's course decides)
export function packCheckinStep(o, dayId) {
  const packs = o && isObj(o.packs) ? o.packs : null;
  if (!packs) return undefined;
  for (const id of keys(packs)) {
    const w = isObj(packs[id]) && isObj(packs[id].week) ? packs[id].week : null;
    const day = w && Array.isArray(w.days) ? w.days.find((d) => isObj(d) && d.id === dayId) : null;
    if (!day) continue;
    for (const s of ['a', 'b', 'c']) for (const st of Array.isArray(day[s]) ? day[s] : []) if (isObj(st) && st.type === 'checkin' && st.id != null) return { id: String(st.id), m: st.m, k: st.k };
    return null;   // (the pack has the day and no check-in step: the page shows none)
  }
  return undefined;
}

// what the page's saveCheckin stores, from the saved one and what she gave (pure)
export function checkinEntry(old, given, date) {
  const o = isObj(old) ? old : {}, g = isObj(given) ? given : {};
  const mood = (MOOD_IDS.includes(g.mood) ? g.mood : '') || (typeof o.mood === 'string' ? o.mood : '') || '';
  const note = g.note != null ? g.note : (o.note || '');
  return { mood, note: String(note).trim().slice(0, NOTE_MAX), date };
}

// saveCheckin(ls, dayId, { mood, note }, now, { step }) → { ok: true, changed, entry, stepDone, date } | { ok: false, reason }
//   reason: 'no-workbench' (nothing is created), 'no-day', 'no-step' (the day has no check-in), 'save' (storage full)
// Reads her latest blob (the 课本's page may have written it), changes only those three places — every other field and
// document is the same value, so the same JSON text — and writes nothing when nothing changed (the same check-in saved
// again the same day). After a write: the cache goes (invalidate) and her App's mirror follows (mirror).
export function saveCheckin(ls, dayId, given, now, opt) {
  if (!DAY_ID_RE.test(String(dayId || ''))) return { ok: false, reason: 'no-day' };
  const b = readBlob(ls, { fresh: true });
  if (!b) return { ok: false, reason: 'no-workbench' };
  const ps = packCheckinStep(b.o, dayId), st = ps !== undefined ? ps : opt && isObj(opt.step) && opt.step.id != null ? opt.step : null;
  if (!st) return { ok: false, reason: 'no-step' };
  const p = wallParts(now, wallZone(ls)), date = p.y + '-' + pad2(p.m) + '-' + pad2(p.d);
  const prof = b.o.profile, ci = isObj(prof.ci) ? prof.ci : {}, cp = isObj(prof.cp) ? prof.cp : {};
  const entry = checkinEntry(ci[dayId], given, date), key = dayId + ':' + st.id;
  const sameCi = same(ci[dayId], entry), stepDone = !cp[key];
  if (sameCi && !stepDone) return { ok: true, changed: false, entry, stepDone: false, date };
  const profile = Object.assign({}, prof);
  if (!sameCi) profile.ci = Object.assign({}, ci, { [dayId]: entry });
  const o = Object.assign({}, b.o, { profile });
  if (stepDone) {
    profile.cp = Object.assign({}, cp, { [key]: date });
    // (ensureDay: the month's document, its days, the day with done and extra)
    const ym = date.slice(0, 7), dd = date.slice(8, 10), days = isObj(b.o.days) ? b.o.days : {};
    const month = isObj(days[ym]) ? Object.assign({}, days[ym]) : {};
    month.days = isObj(month.days) ? Object.assign({}, month.days) : {};
    const day = isObj(month.days[dd]) ? Object.assign({}, month.days[dd]) : {};
    day.done = isObj(day.done) ? Object.assign({}, day.done) : {};
    if (!Array.isArray(day.extra)) day.extra = [];
    day.done['c:' + key] = { m: Number(st.m) || 0, k: MODULE_IDS.includes(st.k) ? st.k : 'other' };
    month.days[dd] = day;
    o.days = Object.assign({}, days, { [ym]: month });
  }
  try { ls.setItem(DATA_KEY, JSON.stringify(o)); } catch (e) { return { ok: false, reason: 'save' }; }
  invalidate();
  mirror(ls);
  return { ok: true, changed: true, entry, stepDone, date };
}
const pad2 = (n) => (n < 10 ? '0' : '') + n;

/* ───────────────────────────── 今日小考 (游戏为主体 第二期, LEARN §41) ───────────────────────────── */
// The game's quiz written as the lesson page writes one (app/exam/store.js newSession + commit + the end), into the
// page's exam document base['exam-<Monday>'] (src/learn/exams.js has the page's rules):
//   s[sid] = { k: 'quiz', d, t0, n, bv, tier, ch, seed, p }   with the first answer (a session without an answer the page
//                                                             would pick up as today's half-done quiz: §41 先定的 2)
//   a[sid][q][hms] = leaf                                       one a question, the first answer of this run
//   e[sid][hms] = answered                                      when the level ends
// run = { sid, d, t0, week, rows, answers: { q: [hms, leaf] }, end: hms | null }. Today already has a quiz with an answer
// (the page's, or an earlier run's) → this run is practice: nothing is written ({ practice: true }). Reads her latest
// blob, replaces only that document (every other field and document: the same value, the same JSON text), writes nothing
// when nothing changed, never creates her blob.
// saveQuiz(ls, run) → { ok: true, changed, practice?, doc?, right, of } | { ok: false, reason: 'no-workbench' | 'empty' | 'save' }
export function saveQuiz(ls, run) {
  if (!isObj(run) || !/^q\d{6}-\d{4}-[0-9a-z]{4}$/.test(String(run.sid || '')) || !YMD_RE.test(String(run.d || '')) || !Array.isArray(run.rows)) return { ok: false, reason: 'empty' };
  const b = readBlob(ls, { fresh: true });
  if (!b) return { ok: false, reason: 'no-workbench' };
  const base = isObj(b.o.base) ? b.o.base : {};
  const qs = keys(isObj(run.answers) ? run.answers : {}).filter((q) => Array.isArray(run.answers[q]) && HMS_RE.test(run.answers[q][0]) && Array.isArray(run.answers[q][1]));
  let docId = keys(base).find((id) => EXAM_RE.test(id) && isObj(base[id]) && isObj(base[id].s) && isObj(base[id].s[run.sid])) || null;
  if (!docId) {
    const q = quizToday(base, run.d);
    if (q) return { ok: true, changed: false, practice: true, right: q.right, of: q.of };
    if (!qs.length) return { ok: false, reason: 'empty' };
    docId = docForNew(base, run.d);
  }
  const old = isObj(base[docId]) ? base[docId] : null, doc = Object.assign({}, old || { v: DOC_V });
  if (doc.v == null) doc.v = DOC_V;
  let changed = !old || old.v == null;
  if (!(isObj(doc.s) && isObj(doc.s[run.sid]))) {
    doc.s = Object.assign({}, isObj(doc.s) ? doc.s : {}, { [run.sid]: { k: 'quiz', d: run.d, t0: String(run.t0), n: run.rows.length, bv: 1, tier: tierOf(+run.week || 1), ch: +run.week || 1, seed: 'game', p: run.rows } });
    changed = true;
  }
  const A = isObj(doc.a) && isObj(doc.a[run.sid]) ? doc.a[run.sid] : {}, A2 = Object.assign({}, A);
  let added = 0;
  qs.forEach((q) => {
    if (isObj(A[q]) && keys(A[q]).length) return;   // (this question has its leaf: the first answer stands)
    const [hms, leaf] = run.answers[q];
    A2[q] = { [hms]: leaf };
    added++;
  });
  if (added) { doc.a = Object.assign({}, isObj(doc.a) ? doc.a : {}, { [run.sid]: A2 }); changed = true; }
  if (run.end && HMS_RE.test(run.end) && !(isObj(doc.e) && isObj(doc.e[run.sid]) && keys(doc.e[run.sid]).length)) {
    doc.e = Object.assign({}, isObj(doc.e) ? doc.e : {}, { [run.sid]: { [run.end]: keys(A2).length } });
    changed = true;
  }
  const mine = quizToday({ [docId]: doc }, run.d) || { right: 0, of: 0 };
  if (!changed) return { ok: true, changed: false, doc: docId, right: mine.right, of: mine.of };
  const o = Object.assign({}, b.o, { base: Object.assign({}, base, { [docId]: doc }) });
  try { ls.setItem(DATA_KEY, JSON.stringify(o)); } catch (e) { return { ok: false, reason: 'save' }; }
  invalidate();
  mirror(ls);
  return { ok: true, changed: true, doc: docId, right: mine.right, of: mine.of };
}

/* ───────────────────────────── her App's mirror ───────────────────────────── */
// 游戏为主体 (IELTS-Base docs/GAME-FIRST.md 第一期): in her App the lesson page mirrors her data into the App's own folder
// after its saves (app/native.js mirrorFlush posts { type: 'mirror', text } — text = the blob exactly as stored under
// DATA_KEY) and finds it back at launch when the web storage was cleared (ios/IELTSBase/Bridge.swift MirrorStore). With
// the game as her front page her answers reach that blob through pushEvidence, so the game sends the same message after
// a push that changed it: debounced like the page's (MIRROR_WAIT), at once when the page hides or goes away (flush).
// Only in the iOS App (window.__IELTS_NATIVE.platform 'ios' and its message handler); a no-op everywhere else.
export const MIRROR_WAIT = 5000;
let mir = { timer: 0, last: null, ls: null };
function nativeHandler() {
  try {
    const W = globalThis, h = W.webkit && W.webkit.messageHandlers && W.webkit.messageHandlers.ielts, c = W.__IELTS_NATIVE;
    return h && typeof h.postMessage === 'function' && isObj(c) && c.platform === 'ios' ? h : null;
  } catch (e) { return null; }
}
function mirrorSend() {
  const ls = mir.ls;
  clearTimeout(mir.timer); mir.timer = 0;
  const h = nativeHandler(), text = get(ls, DATA_KEY);
  if (!h || typeof text !== 'string' || !text || text === mir.last) return false;
  // (the App's restore only takes a blob with a profile: the one readBlob holds parsed — what the game wrote last, or
  // read — has one; anything else is parsed to see. LEARN §52: it was parsed whole every time)
  if (!(cache.ls === ls && cache.o && text === cache.raw)) {
    let o = null; try { o = JSON.parse(text); } catch (e) { return false; }
    if (!isObj(o) || !isObj(o.profile)) return false;
  }
  try { h.postMessage({ type: 'mirror', text }); } catch (e) { return false; }
  mir.last = text;
  return true;
}
// mirror(ls) — after a push that changed her blob: send it within MIRROR_WAIT; mirror(ls, true) — now (the page hides)
export function mirror(ls, now) {
  if (!nativeHandler()) return false;
  mir.ls = ls;
  if (now) return mirrorSend();
  if (!mir.timer) mir.timer = setTimeout(mirrorSend, MIRROR_WAIT);
  return true;
}
// a pending mirror goes now (pagehide / hidden); nothing pending: nothing sent
export function mirrorFlush() { return mir.timer ? mirrorSend() : false; }

// 课本 (游戏为主体 第三期第一步): the lesson page inside the game's book wrote her blob — read it again next time (the mirror's
// state stays: it holds what was last sent, not a copy of the blob)
export function invalidate() { cache = { ls: null, raw: null, o: null, ev: null }; }

// tests: forget the parsed blob
export function _reset() { cache = { ls: null, raw: null, o: null, ev: null }; clearTimeout(mir.timer); mir = { timer: 0, last: null, ls: null }; }
