// src/learn/content.js — the content bridge (docs/LEARN.md §5): her course packs in content/ (w1 exported from the
// IELTS-Base host, w2/w3 copied) read through IELTS-Base's own index (Model.buildIndex), so every item carries the id her
// evidence uses — w:monday, d:w1d1:b1:<hash>, q:w1d1:a3:<hash>, p:cap|cup, s:ʌ, x:…, k:… — and a day's steps become game
// steps of five kinds. Nothing is dropped (LEARN §1): steps the game cannot ask yet (write, speak, check-in, weekly,
// placement) come through as 'lesson' steps with their content.
//
//   await loadWeek(n)      → the pack's week { id, n, title, days } (also loads the engine and builds the index)
//   daySteps(week, d)      → Step[]   Step = { id: 'w1d1:a1', kind, title, minutes, items, meta }
//                            kind: 'dictation' | 'choice' | 'listen' | 'pron' | 'lesson'
//   Item = { id, en, zh, tts, audio, options?: [{ en, zh }], answer?, meta }
//          meta = { kind (the index kind: word dict quiz read pair sym write speak lesson), input ('type' | 'choice' |
//          'write' | 'read'), step, scored, … } — engine.js dispatches on meta.input / meta.kind.
//
// Pack step → game step: symbols, symreview → pron (which word has the sound); grammar with k:'pron' → pron (the pack's own
// stress / weak-form quiz); grammar → choice; words → choice (the word's meaning); flash → dictation (hear the word, type it:
// the card dictation, evidence mode T); dictation → dictation (the sentence, scored by the host's dictScore); reading →
// listen (the passage spoken, then its questions); pairs → listen (one word of the pair spoken, pick it); write, speak,
// checkin, weekly, placement → lesson (write items are still judged by gen.js WT when asked).
import { ielts, ieltsNow } from './ielts.js';

export const KINDS = ['dictation', 'choice', 'listen', 'pron', 'lesson'];
const SESS = ['a', 'b', 'c'];

/* ───────────────────────────── reading the files ───────────────────────────── */
let loader = null;
// setLoader((relPath) => Promise<string>): tests and Electron hand in their own reader; default is fetch in the page,
// fs under Node (file: URL).
export function setLoader(fn) { loader = typeof fn === 'function' ? fn : null; }

async function readText(rel) {
  if (loader) return loader(rel);
  const url = new URL('../../content/' + rel, import.meta.url);
  if (url.protocol === 'file:') {
    const fs = await import('node:fs/promises');
    return fs.readFile(url, 'utf8');
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error('content/' + rel + ': HTTP ' + r.status);
  return r.text();
}

const weeks = new Map(); // week.id → { week, index }
let symbols = null;      // content/symbols.json: { symbols, groups, list, us }
let symbolsP = null;

function loadSymbols() {
  if (symbols) return Promise.resolve(symbols);
  if (!symbolsP) symbolsP = readText('symbols.json').then((t) => { symbols = JSON.parse(t); return symbols; }, (e) => { symbolsP = null; throw e; });
  return symbolsP;
}

/* ───────────────────────────── weeks and the index ───────────────────────────── */
export async function loadWeek(n) {
  const I = await ielts();
  const sym = await loadSymbols();
  const pack = JSON.parse(await readText('w' + n + '.json'));
  const week = pack && pack.app === 'ielts-workbench-course' ? pack.week : (pack && pack.week) || pack;
  if (!week || !week.id || !Array.isArray(week.days)) throw new Error('content/w' + n + '.json is not a course pack');
  register(week, I, sym);
  return week;
}

function register(week, I, sym) {
  // the packs carry the US IPA (words[3]) and the pair Chinese (pairs[2..3]) themselves, so buildIndex needs only the
  // symbol tables; ids hash the English and never depend on these
  const index = I.Model.buildIndex([week], { symList: sym.list, symbols: sym.symbols });
  const reg = { week, index, sym };
  weeks.set(week.id, reg);
  return reg;
}

function regOf(week) {
  if (!week || !week.id) throw new Error('daySteps: not a week');
  const have = weeks.get(week.id);
  if (have && have.week === week) return have;
  if (!symbols) throw new Error('content: loadWeek() first (the symbol tables are not loaded)');
  return register(week, ieltsNow(), symbols);
}

// The Model index of a loaded week (store.js reads it for evidence and memory).
export function weekIndex(week) { return regOf(week).index; }

// The Model item behind an id, from any loaded week, with its index; null when no loaded week has it.
export function itemOf(id) {
  for (const reg of weeks.values()) { const it = reg.index.items.get(id); if (it) return { item: it, index: reg.index, week: reg.week }; }
  return null;
}

export function dayOf(week, d) {
  const days = Array.isArray(week && week.days) ? week.days : [];
  return days.find((x) => Number(x.n) === Number(d)) || days[Number(d) - 1] || null;
}

/* ───────────────────────────── steps ───────────────────────────── */
export function daySteps(week, d) {
  const reg = regOf(week), day = dayOf(week, d);
  if (!day) return [];
  const out = [];
  SESS.forEach((s) => (Array.isArray(day[s]) ? day[s] : []).forEach((st) => {
    const si = reg.index.steps.get(day.id + ':' + st.id);
    if (si) out.push(makeStep(reg, day, si, st));
  }));
  return out;
}

function makeStep(reg, day, si, st) {
  const sk = si.sk, type = si.type;
  const meta = { type, k: String(st.k || ''), sess: si.sess, day: { id: day.id, n: Number(day.n) || 0, title: String(day.title || ''), teacher: String(day.teacher || '') } };
  let kind = 'lesson', items = [];
  if (type === 'symbols' || type === 'symreview') { kind = 'pron'; items = symItems(reg, si); }
  else if (type === 'words') { kind = 'choice'; items = wordChoiceItems(reg, si); }
  else if (type === 'flash') { kind = 'dictation'; items = wordTypeItems(reg, si); meta.from = si.src || []; }
  else if (type === 'grammar') { kind = meta.k === 'pron' ? 'pron' : 'choice'; items = quizItems(reg, si, null); meta.lesson = Array.isArray(st.lesson) ? st.lesson : []; }
  else if (type === 'reading') {
    kind = 'listen';
    const P = st.passage || {};
    meta.passage = { title: String(P.title || ''), titleZh: String(P.titleZh || ''), en: String(P.text || ''), zh: String(P.zh || ''), gloss: Array.isArray(P.gloss) ? P.gloss : [], parse: Array.isArray(P.parse) ? P.parse : [] };
    items = quizItems(reg, si, meta.passage);
  }
  else if (type === 'dictation') { kind = 'dictation'; items = dictItems(reg, si); }
  else if (type === 'pairs') { kind = 'listen'; items = pairItems(reg, si); }
  else if (type === 'write') { items = writeItems(reg, si); }
  else if (type === 'speak') { items = speakItems(reg, si); }
  else { items = [lessonItem(sk, st, day)]; }
  meta.scored = items.filter((it) => it.meta.scored).length;
  return { id: sk, kind, title: String(si.title || ''), minutes: Number(si.m) || 0, items, meta };
}

function base(it, sk, extra) {
  return { id: it.id, en: String(it.en || ''), zh: String(it.zh || ''), tts: null, audio: null, meta: Object.assign({ kind: it.kind, step: sk, scored: true }, extra) };
}
function itemsOf(reg, si) { return si.items.map((id) => reg.index.items.get(id)).filter(Boolean); }
// A small stable hash so a pack renders the same every time (which word of a pair is played, where the right option sits).
function stableHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
// options with the right one at a stable position: i-th item of its step → slot i mod (1 + distractors)
function place(right, wrong, i) {
  const n = wrong.length + 1, at = i % n, options = wrong.slice();
  options.splice(at, 0, right);
  return { options, answer: at };
}

// symbols: "which word has /ʌ/?" — the sound's first example against the first examples of three neighbouring sounds of the
// same step (the pack's own examples, no invented words)
function symItems(reg, si) {
  const list = itemsOf(reg, si), n = list.length;
  return list.map((it, i) => {
    const C = it.content || {}, ex = C.examples || [];
    const right = ex[0] ? { en: ex[0].en, zh: ex[0].zh } : { en: it.en, zh: it.zh };
    const wrong = [];
    for (let k = 1; k < n && wrong.length < 3; k++) {
      const o = list[(i + k) % n], oe = ((o.content || {}).examples || [])[0];
      if (oe && oe.en !== right.en && !wrong.some((w) => w.en === oe.en)) wrong.push({ en: oe.en, zh: oe.zh });
    }
    const p = place(right, wrong, i);
    return Object.assign(base(it, si.sk, { input: 'choice', ipa: C.ipa || it.ipa, name: C.zh || '', tip: C.tip || '', examples: ex, say: C.say || '' }), { options: p.options, answer: p.answer });
  });
}

// words: the word (seen and heard) → its meaning, against the meanings of three neighbouring words of the step
function wordChoiceItems(reg, si) {
  const list = itemsOf(reg, si), n = list.length;
  return list.map((it, i) => {
    const C = it.content || {};
    const right = { en: it.en, zh: C.zh || it.zh };
    const wrong = [];
    for (let k = 1; k < n && wrong.length < 3; k++) {
      const o = list[(i + k) % n], oz = (o.content || {}).zh || o.zh;
      if (oz && oz !== right.zh && !wrong.some((w) => w.zh === oz)) wrong.push({ en: o.en, zh: oz });
    }
    const p = place(right, wrong, i);
    return Object.assign(base(it, si.sk, { input: 'choice', ipa: it.ipa, ipaUs: it.ipaUs, ipaGb: it.ipaGb, zhFull: C.zhFull || it.zh }), { tts: it.en, options: p.options, answer: p.answer });
  });
}

// flash: hear the word, type it (the host's card dictation; the meaning is a hint, and a hinted answer is mode H)
function wordTypeItems(reg, si) {
  return itemsOf(reg, si).map((it) => {
    const C = it.content || {};
    return Object.assign(base(it, si.sk, { input: 'type', typed: true, ref: it.en, ipa: it.ipa, ipaUs: it.ipaUs, ipaGb: it.ipaGb, hint: C.zh || it.zh, zhFull: C.zhFull || it.zh }), { tts: it.en });
  });
}

// grammar / reading quiz: the pack's own question, options, answer and explanation (optsZh when the pack gives them)
function quizItems(reg, si, passage) {
  return itemsOf(reg, si).map((it) => {
    const C = it.content || {}, opts = Array.isArray(C.opts) ? C.opts : [], zh = Array.isArray(C.optsZh) ? C.optsZh : [];
    const out = base(it, si.sk, { input: 'choice', why: String(C.why || ''), qi: it.qi, passage: passage ? { title: passage.title, titleZh: passage.titleZh } : null });
    out.options = opts.map((o, k) => ({ en: String(o), zh: String(zh[k] || '') }));
    out.answer = Number(C.ans);
    if (passage) out.tts = passage.en; // the passage is what she listens to; the question follows
    return out;
  });
}

function dictItems(reg, si) {
  return itemsOf(reg, si).map((it) => Object.assign(base(it, si.sk, { input: 'type', ref: it.ref || it.en, di: it.di }), { tts: it.ref || it.en }));
}

// pairs: one word of the pair is spoken (chosen by a stable hash), both are the options
function pairItems(reg, si) {
  return itemsOf(reg, si).map((it) => {
    const pair = it.pair || [], zh = it.pairZh || [];
    const k = stableHash(it.id) % 2;
    return Object.assign(base(it, si.sk, { input: 'choice', pair: pair.slice(), pairZh: zh.slice(), played: k }), { tts: pair[k] || null, options: pair.map((w, j) => ({ en: String(w), zh: String(zh[j] || '') })), answer: k });
  });
}

// write: the Chinese to put into English; judged by gen.js's WT key forms when asked (the step itself is a lesson step for now)
function writeItems(reg, si) {
  return itemsOf(reg, si).map((it) => base(it, si.sk, { input: 'write', ref: it.ref || it.en, wi: it.wi }));
}

function speakItems(reg, si) {
  return itemsOf(reg, si).map((it) => {
    const C = it.content || {};
    return Object.assign(base(it, si.sk, { input: 'read', scored: false, model: String(C.model || ''), modelZh: String(C.modelZh || ''), phrases: Array.isArray(C.phrases) ? C.phrases : [], tip: String((si.st && si.st.speak && si.st.speak.tip) || '') }), { tts: it.en });
  });
}

// checkin / weekly / placement: one unscored item that carries what the step says
function lessonItem(sk, st, day) {
  const zh = st.type === 'weekly' ? String(st.summary || st.title || '') : st.type === 'checkin' ? String(day.teacher || st.title || '') : String(st.title || '');
  return { id: sk, en: '', zh, tts: null, audio: null, meta: { kind: 'lesson', input: 'read', step: sk, scored: false, type: st.type } };
}
