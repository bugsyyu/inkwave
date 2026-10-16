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
  // workbench's JSON.stringify text for them is unchanged too
  const o = Object.assign({}, b.o, { base: r.base });
  const raw = JSON.stringify(o);
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

// tests: forget the parsed blob
export function _reset() { cache = { ls: null, raw: null, o: null, ev: null }; }
