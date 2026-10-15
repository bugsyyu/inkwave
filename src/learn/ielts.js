// src/learn/ielts.js — IELTS-Base's engine (vendor/ielts/*, copied verbatim by tools/learn/export-ielts.mjs) as one
// ES-module handle, in the browser and in Node alike.
//
// The vendor files are UMD: `module.exports` when `module` exists, else a global `BaseEngine.<Name>`. Loaded as ES
// modules `module` is undefined, so each registers itself on globalThis.BaseEngine, and the lazy require() fallbacks
// inside them (gen.js → Model and Bank, sched.js → Gen …) read BaseEngine too. That is the whole bridge: no build step,
// no script tags, the same code path for the page and for `node --test`. Order matters only for host.js (fdUs reads
// BaseEngine.Model when called) and is kept anyway.
//
//   const I = await ielts();   // { Model, Bank, Gen, Sched, Mark, Host }
//   ieltsNow()                 // the same handle once loaded, else throws (content/engine/store are synchronous after loadWeek)

const FILES = ['model.js', 'bank.js', 'gen.js', 'sched.js', 'mark.js', 'host.js'];
const NAMES = { Model: 'Model', Bank: 'ExamBank', Gen: 'ExamGen', Sched: 'ExamSched', Mark: 'ExamMark', Host: 'Host' };

let handle = null;
let loading = null;

export function ielts() {
  if (handle) return Promise.resolve(handle);
  if (!loading) loading = load().then((h) => { handle = h; return h; }, (e) => { loading = null; throw e; });
  return loading;
}

export function ieltsNow() {
  if (!handle) throw new Error('IELTS-Base engine not loaded yet: await ielts() (or loadWeek) first');
  return handle;
}

export function ieltsLoaded() { return !!handle; }

async function load() {
  const base = new URL('../../vendor/ielts/', import.meta.url);
  for (const f of FILES) await import(new URL(f, base).href);
  const BE = globalThis.BaseEngine || {};
  const out = {};
  for (const k of Object.keys(NAMES)) {
    if (!BE[NAMES[k]]) throw new Error('vendor/ielts: BaseEngine.' + NAMES[k] + ' did not register (file missing or not UMD?)');
    out[k] = BE[NAMES[k]];
  }
  return Object.freeze(out);
}
