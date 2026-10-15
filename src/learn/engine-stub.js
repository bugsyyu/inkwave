// 关卡学习 — stand-in for workstream A's content bridge + question engine + store (docs/LEARN.md §5).
//
// Same API as src/learn/{content,engine,store,levels}.js, with a small built-in sample of week 1 day 1 (星期、月份 —
// the first words of the course) instead of content/w1.json and the IELTS-Base judges. It exists so the level, the
// question layer and the menus can be built and tested before A's modules land; src/learn/api.js is the one place
// that picks between this file and the real ones. Nothing in here is meant to survive the switch.
//
//   loadWeek(n)            → { id, n, title, days }
//   daySteps(week, d)      → Step[]   Step = { id, kind: 'dictation'|'choice'|'listen'|'pron'|'lesson', title, minutes, items: Item[] }
//                                     Item = { id, en, zh, tts, audio, options?: [{ en, zh }], answer?: number|string, meta: {} }
//   prompt(item)           → { type: 'typed'|'choice', text, zh, tts, options?: [{ text, zh }], placeholder? }
//   judge(item, answer)    → { ok, why /* 中文 */, canonical }
//   store                  → { load(), save(), recordFirst({ itemId, ok, day, at }) → { first }, progress(week, day) → { done, total }, due(week) → itemIds[], evidence() }
//   puzzleLevel(week, day) → { kind: 'puzzle', stage: 'tidewater', gates: [{ id, stepId, items: Item[], pos: null }] }
import { LEARN } from '../config.js';

const STORE_KEY = 'inkwave:learn:v1';

// ---------------------------------------------------------------------------------------------- sample content
// An Item's `answer` is the index into `options` for a choice, the accepted text for typed items (undefined = `en`).
const item = (id, en, zh, extra = {}) => ({ id, en, zh, tts: en, audio: null, meta: {}, ...extra });
const DICT = [
  item('w1d1-dict-1', 'Wednesday', '星期三'),
  item('w1d1-dict-2', 'February', '二月'),
  item('w1d1-dict-3', 'Thursday', '星期四'),
  item('w1d1-dict-4', 'August', '八月'),
  item('w1d1-dict-5', 'Saturday', '星期六'),
  item('w1d1-dict-6', 'January', '一月'),
];
// zh→en: the question is Chinese, the options English (their Chinese shows with the verdict)
const CHOICE = [
  item('w1d1-ch-1', 'Monday', '星期一', { options: [{ en: 'Monday', zh: '星期一' }, { en: 'Sunday', zh: '星期日' }, { en: 'Friday', zh: '星期五' }, { en: 'Tuesday', zh: '星期二' }], answer: 0 }),
  item('w1d1-ch-2', 'month', '月', { options: [{ en: 'week', zh: '周' }, { en: 'month', zh: '月' }, { en: 'year', zh: '年' }, { en: 'day', zh: '天' }], answer: 1 }),
  item('w1d1-ch-3', 'weekend', '周末', { options: [{ en: 'weekday', zh: '工作日' }, { en: 'holiday', zh: '假日' }, { en: 'weekend', zh: '周末' }, { en: 'morning', zh: '早上' }], answer: 2 }),
  item('w1d1-ch-4', 'today', '今天', { options: [{ en: 'yesterday', zh: '昨天' }, { en: 'tomorrow', zh: '明天' }, { en: 'tonight', zh: '今晚' }, { en: 'today', zh: '今天' }], answer: 3 }),
];
const LISTEN = [
  item('w1d1-lis-1', 'Today is Wednesday.', '今天是星期三。', { meta: { form: 'typed' } }),
  item('w1d1-lis-2', 'My birthday is in February.', '我的生日在二月。', {
    meta: { form: 'choice', ask: '她的生日在哪个月？' },
    options: [{ en: 'January', zh: '一月' }, { en: 'February', zh: '二月' }, { en: 'March', zh: '三月' }, { en: 'August', zh: '八月' }], answer: 1,
  }),
];
// pron rows: pick the stressed syllable (capitals mark the stress in the option text)
const PRON = [
  item('w1d1-pron-1', 'February', '二月 · 重音在第一个音节', { options: [{ en: 'FEB-ru-ary', zh: '第一个音节重读' }, { en: 'feb-RU-ary', zh: '第二个音节重读' }, { en: 'feb-ru-ARY', zh: '第三个音节重读' }], answer: 0 }),
  item('w1d1-pron-2', 'Wednesday', '星期三 · 重音在第一个音节（两个音节：WENZ-day）', { options: [{ en: 'WENZ-day', zh: '第一个音节重读' }, { en: 'wenz-DAY', zh: '第二个音节重读' }], answer: 0 }),
];
const WEEK1 = {
  id: 'w1', n: 1, title: '第 1 周 · 48 个音标；150 个生活基础词',
  days: [
    { d: 1, title: '第 1 天 · 星期和月份', steps: [
      { id: 'w1d1-s1', kind: 'lesson', title: '课：音标第一组（/i:/ /ɪ/ /e/ /æ/）', minutes: 10, items: [] },
      { id: 'w1d1-s2', kind: 'dictation', title: '听写：星期和月份', minutes: 8, items: DICT },
      { id: 'w1d1-s3', kind: 'choice', title: '词义：选出对的词', minutes: 5, items: CHOICE },
      { id: 'w1d1-s4', kind: 'listen', title: '听力：两句话', minutes: 4, items: LISTEN },
      { id: 'w1d1-s5', kind: 'pron', title: '发音：重音在哪里', minutes: 3, items: PRON },
    ] },
  ],
};
// days 2–7 and weeks 2–3: the real content bridge serves them; the stub answers with the same day so every pick works
const WEEKS = { 1: WEEK1, 2: { ...WEEK1, id: 'w2', n: 2, title: '第 2 周（样例）' }, 3: { ...WEEK1, id: 'w3', n: 3, title: '第 3 周（样例）' } };

export async function loadWeek(n) { return WEEKS[n] || WEEKS[1]; }

export function daySteps(week, d) {
  const w = typeof week === 'object' ? week : WEEKS[week] || WEEKS[1];
  const day = w.days.find((x) => x.d === d) || w.days[0];
  return day.steps;
}

// ---------------------------------------------------------------------------------------------- prompt / judge
export function prompt(it) {
  const kind = kindOf(it);
  if (kind === 'choice' || kind === 'pron' || (kind === 'listen' && it.meta.form === 'choice')) {
    const text = kind === 'pron' ? `「${it.en}」的重音在哪个音节？` : kind === 'listen' ? (it.meta.ask || '听一遍，选出对的') : `哪一个是「${it.zh}」？`;
    return { type: 'choice', text, zh: kind === 'listen' ? it.zh : null, tts: kind === 'choice' ? null : it.en, options: it.options.map((o) => ({ text: o.en, zh: o.zh })) };
  }
  // dictation / listen-typed: hear it, type it
  const word = !/\s/.test(it.en);
  return { type: 'typed', text: word ? '听写：听一遍，把这个词打出来' : '听写：听一遍，把这句话打出来', zh: it.zh, tts: it.en, placeholder: word ? '输入这个英文词' : '输入这句英文' };
}

// IELTS-Base §7.13: British and American spellings both count, case never does; punctuation and extra spaces are
// not what a dictation tests.
const UK_US = [['colour', 'color'], ['favourite', 'favorite'], ['centre', 'center'], ['theatre', 'theater'], ['travelling', 'traveling'], ['grey', 'gray'], ['programme', 'program'], ['neighbour', 'neighbor']];
export function norm(s) {
  let t = String(s ?? '').toLowerCase().replace(/[^a-z0-9'\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  for (const [uk, us] of UK_US) t = t.split(uk).join(us);
  return t;
}

export function judge(it, answer) {
  if (Array.isArray(it.options) && typeof it.answer === 'number') {
    const i = typeof answer === 'number' ? answer : it.options.findIndex((o) => norm(o.en) === norm(answer));
    const right = it.options[it.answer];
    const ok = i === it.answer;
    const picked = it.options[i];
    const why = ok ? `对了：${right.en}（${right.zh}）` : picked ? `${picked.en} 是「${picked.zh}」；正确的是 ${right.en}（${right.zh}）` : `正确的是 ${right.en}（${right.zh}）`;
    return { ok, why, canonical: right.en };
  }
  const want = String(it.answer ?? it.en);
  const ok = norm(answer) === norm(want);
  const why = ok ? `对了：${want}（${it.zh}）` : `正确写法：${want}（${it.zh}）${answer ? `，你写的是「${String(answer).trim()}」` : ''}`;
  return { ok, why, canonical: want };
}

function kindOf(it) {
  const id = String(it.id || '');
  return /-dict-/.test(id) ? 'dictation' : /-ch-/.test(id) ? 'choice' : /-lis-/.test(id) ? 'listen' : /-pron-/.test(id) ? 'pron' : Array.isArray(it.options) ? 'choice' : 'dictation';
}

// ---------------------------------------------------------------------------------------------- store
// Progress + evidence in localStorage. The real store writes the IELTS-Base ev-<周一> format; this one keeps the
// same facts (first answer of the day per item, when, right or wrong) so the switch loses nothing.
let S = null;
export const store = {
  load() {
    if (S) return S;
    try { S = JSON.parse(localStorage.getItem(STORE_KEY)); } catch { S = null; }
    if (!S || S.v !== 1) S = { v: 1, first: {}, ev: [] };
    return S;
  },
  save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(this.load())); } catch { /* private mode: progress lives for the session */ } },
  // the day's first answer is the one that counts (当天只认首答); later answers of the same item change nothing
  recordFirst({ itemId, ok, day, at = Date.now() }) {
    const s = this.load();
    const key = dayKey(day, at);
    const bucket = s.first[key] || (s.first[key] = {});
    if (bucket[itemId]) return { first: false };
    bucket[itemId] = { ok: !!ok, at };
    s.ev.push({ id: itemId, ok: !!ok, at, day: key });
    this.save();
    return { first: true };
  },
  progress(week, day) {
    const s = this.load();
    const items = daySteps(week, day).flatMap((st) => st.items);
    const bucket = s.first[dayKey(`w${typeof week === 'object' ? week.n : week}d${day}`, Date.now())] || {};
    const done = items.filter((it) => bucket[it.id] && bucket[it.id].ok).length;
    return { done, total: items.length };
  },
  // "到期" in the stub: every item whose first answer today was wrong (the real memory model schedules by half-life)
  due(week) {
    const s = this.load();
    const today = dayKey('', Date.now()).slice(1);
    const out = [];
    for (const [key, bucket] of Object.entries(s.first)) {
      if (!key.endsWith(today)) continue;
      for (const [id, r] of Object.entries(bucket)) if (!r.ok && (week == null || id.startsWith(`w${typeof week === 'object' ? week.n : week}d`))) out.push(id);
    }
    return out;
  },
  evidence() { return this.load().ev.slice(); },
};
// one bucket per (level day, calendar day): "today's first answer" is per calendar day, like IELTS-Base
function dayKey(day, at) { const d = new Date(at); return `${day}@${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

// ---------------------------------------------------------------------------------------------- level
// A day's steps spread over the gates: every item of every step appears exactly once (内容不减少), each gate holds
// items of ONE step, and the gate count follows LEARN.puzzle.gates (fewer when the day has fewer items). Lesson
// steps carry no items and are not gates in this slice.
export function puzzleLevel(week, day) {
  const steps = daySteps(week, day).filter((st) => st.items.length);
  const total = steps.reduce((n, st) => n + st.items.length, 0);
  const want = Math.max(1, Math.min(LEARN.puzzle.gates, total));
  // gates per step, proportional to its item count, at least one each, summing to `want`
  const share = steps.map((st) => Math.max(1, Math.round((st.items.length / total) * want)));
  let diff = want - share.reduce((a, b) => a + b, 0);
  for (let i = 0; diff !== 0 && i < 64; i++) {
    const k = i % steps.length;
    if (diff > 0 && share[k] < steps[k].items.length) { share[k]++; diff--; }
    else if (diff < 0 && share[k] > 1) { share[k]--; diff++; }
  }
  const gates = [];
  steps.forEach((st, si) => {
    const n = share[si], per = Math.ceil(st.items.length / n);
    for (let g = 0; g < n; g++) {
      const items = st.items.slice(g * per, (g + 1) * per);
      if (items.length) gates.push({ id: `g${gates.length + 1}`, stepId: st.id, title: st.title, kind: st.kind, items, pos: null });
    }
  });
  return { kind: 'puzzle', week: typeof week === 'object' ? week.n : week, day, stage: 'tidewater', gates };
}
