// src/learn/engine.js — the question engine (docs/LEARN.md §5): pure functions, no DOM.
//   prompt(item) → { type, text, zh, tts, options?, placeholder?, hint? }   what to show / play / ask
//   judge(item, answer) → { ok, why, canonical, … }                         what to say back, in Chinese
//
// Judging is IELTS-Base's, never a rule set of our own (LEARN §3): every answer goes through gen.js's check() — the
// sentence dictation (format LD) scored by the host's dictScore (vendor/ielts/host.js, DESIGN §7.13: British = American,
// case never matters, 80 % is a pass), a typed word (VS) by Model.spellCheck, a written sentence (WT) by the key forms
// (be, third-person -s, article, time preposition), a choice (GF / VM / PS / LP) by its index. This file only turns the
// verdict into words she can read.
import { ieltsNow } from './ielts.js';

const CHOICE_FMT = { quiz: 'GF', read: 'GF', word: 'VM', sym: 'PS', pair: 'LP' };
const CAUSE_ZH = { sp: '拼写', fw: '弱读小词没听出', end: '词尾吞了', mis: '没听出' };

// what an option shows: a word's meaning for the meaning question, the English (with its Chinese) everywhere else
function optionText(item, o) { return item.meta && item.meta.kind === 'word' ? o.zh : o.en; }
function label(o) { return o ? o.en + (o.zh && o.zh !== o.en ? '（' + o.zh + '）' : '') : ''; }

export function prompt(item) {
  const m = (item && item.meta) || {}, kind = m.kind, input = m.input;
  if (input === 'choice') {
    const options = (item.options || []).map((o) => (kind === 'word' ? { text: o.zh, zh: '' } : { text: o.en, zh: o.zh || '' }));
    if (kind === 'word') return { type: 'choice', text: item.en, zh: '这个词是什么意思？', tts: item.tts, options, ipa: m.ipa || '' };
    if (kind === 'sym') return { type: 'choice', text: '哪个词里有 ' + item.en + ' 这个音？', zh: m.name || '', tts: null, options };
    if (kind === 'pair') return { type: 'choice', text: '听到的是哪个词？', zh: '', tts: item.tts, options };
    return { type: 'choice', text: item.en, zh: item.zh, tts: item.tts, options };
  }
  if (input === 'type') {
    if (kind === 'dict') return { type: 'type', text: '听一遍，把听到的句子写下来。', zh: '', tts: item.tts, placeholder: '把听到的写下来' };
    // the meaning / IPA are a hint: shown before she answers, the answer is an assisted one (store: hinted → mode H)
    return { type: 'type', text: '听一遍，把这个词拼出来。', zh: '', tts: item.tts, placeholder: '拼出听到的词', hint: { zh: m.hint || item.zh, ipa: m.ipa || '' } };
  }
  if (input === 'write') return { type: 'write', text: item.zh, zh: '', tts: null, placeholder: '用英文写出这句话' };
  return { type: 'read', text: item.en, zh: item.zh, tts: item.tts };
}

export function judge(item, answer) {
  const m = (item && item.meta) || {}, kind = m.kind, input = m.input;
  if (!m.scored) return { ok: true, why: '看完就好，不计分。', canonical: item.en || item.zh || '' };
  const I = ieltsNow(), G = I.Gen, ctx = { dictScore: I.Host.dictScore };
  if (input === 'choice') return judgeChoice(G, ctx, item, answer);
  if (input === 'type' && kind === 'dict') return judgeDictation(G, ctx, item, answer);
  if (input === 'type') return judgeWord(G, ctx, item, answer);
  if (input === 'write') return judgeWrite(G, ctx, item, answer);
  return { ok: false, why: '这种题还不会判。', canonical: item.en || '' };
}

/* ───────────────────────────── choice ───────────────────────────── */
// an option index, a numeric string, or the option's own text → the index gen.js checks
function pickIndex(item, answer) {
  if (typeof answer === 'number') return answer;
  const s = String(answer == null ? '' : answer).trim();
  if (/^\d+$/.test(s)) return Number(s);
  const k = (item.options || []).findIndex((o) => o.en === s || optionText(item, o) === s);
  return k >= 0 ? k : -1;
}

function judgeChoice(G, ctx, item, answer) {
  const pick = pickIndex(item, answer);
  const v = G.check({ fmt: CHOICE_FMT[item.meta.kind] || 'GF', input: 'choice', subs: [], ans: item.answer }, pick, { ctx });
  const opts = item.options || [], right = opts[item.answer] || { en: '', zh: '' }, picked = opts[pick] || null;
  const canonical = optionText(item, right), kind = item.meta.kind, why = item.meta.why ? ' ' + item.meta.why : '';
  if (pick < 0 || !picked) return { ok: false, why: '还没选。答案是 ' + label(right) + '。' + why, canonical };
  if (kind === 'word') {
    return v.ok ? { ok: true, why: '对，' + item.en + ' 是「' + right.zh + '」。', canonical }
      : { ok: false, why: item.en + ' 是「' + right.zh + '」，不是「' + picked.zh + '」。', canonical };
  }
  if (kind === 'sym') {
    const tip = item.meta.tip ? ' ' + item.meta.tip : '';
    return v.ok ? { ok: true, why: '对，' + label(right) + ' 里有 ' + item.en + '。' + tip, canonical }
      : { ok: false, why: item.en + ' 在 ' + label(right) + ' 里，' + label(picked) + ' 里没有。' + tip, canonical };
  }
  if (kind === 'pair') {
    return v.ok ? { ok: true, why: '对了，是 ' + label(right) + '。', canonical }
      : { ok: false, why: '是 ' + label(right) + '，不是 ' + label(picked) + '。两个都再听一下。', canonical };
  }
  return v.ok ? { ok: true, why: '答对了。' + why, canonical } : { ok: false, why: '不对。正确答案：' + label(right) + '。' + why, canonical };
}

/* ───────────────────────────── dictation (LD, the host's dictScore) ───────────────────────────── */
function judgeDictation(G, ctx, item, answer) {
  const typed = String(answer == null ? '' : answer), ref = item.meta.ref || item.en;
  if (!typed.trim()) return { ok: false, pct: 0, why: '还没写。', canonical: ref, zh: item.zh, toks: [] };
  const v = G.check({ fmt: 'LD', input: 'type', subs: ['L-dict'], ref }, typed, { ctx });
  const bad = (v.toks || []).filter((t) => t.ok === false);
  let why = v.ok ? '听写 ' + v.pct + '%，过了（80% 算对）。' : '听写 ' + v.pct + '%，还没到 80%。';
  if (bad.length) why += bad.map((t) => t.t + '（' + (CAUSE_ZH[t.cause] || '没听出') + (t.heard ? '，写成了 ' + t.heard : '') + '）').join('、') + '。';
  return { ok: !!v.ok, pct: v.pct, why, canonical: ref, zh: item.zh, toks: v.toks || [] };
}

/* ───────────────────────────── a typed word (VS, Model.spellCheck) ───────────────────────────── */
function judgeWord(G, ctx, item, answer) {
  const typed = String(answer == null ? '' : answer).trim(), ref = item.meta.ref || item.en;
  const v = G.check({ fmt: 'VS', input: 'type', subs: ['V-spell'], blanks: [{ k: '0', want: ref, accept: [] }] }, typed, { ctx });
  const pt = (v.parts && v.parts[0]) || {}, out = { ok: !!v.ok, canonical: ref, zh: item.meta.hint || item.zh, close: !!v.claimable, ops: pt.ops || [] };
  if (v.ok) out.why = '拼对了。' + (typed.toLowerCase() !== ref.toLowerCase() ? '（' + typed + ' 和 ' + ref + ' 是同一个词，英美拼法都算对。）' : '');
  else if (pt.cause === 'empty') out.why = '还没写。';
  else if (pt.num) out.why = '数字要写成英文单词：' + ref + '。';
  else out.why = '拼写不对：写成了 ' + typed + '，应该是 ' + ref + '。' + (v.claimable ? '很接近了。' : '');
  return out;
}

/* ───────────────────────────── a written sentence (WT, the key forms) ───────────────────────────── */
function formZh(f) {
  const want = f.want || '', got = f.got;
  switch (f.kind) {
    case 'be': return got ? 'be 动词：' + got + ' → ' + want : '少了 be 动词 ' + want;
    case '3sg': return '第三人称单数要加 -s：' + (got ? got + ' → ' : '') + want;
    case 'article': return '名词前要加冠词：' + want;
    case 'prep': return '时间介词：' + (got ? got + ' → ' : '') + want;
    case 'plural': return '复数：' + (got ? got + ' → ' : '') + want;
    case 'spell': return '拼写：' + (got || '') + ' → ' + want;
    case 'coll': return '要用上搭配 ' + want;
    default: return (got ? got + ' → ' : '') + want;
  }
}

function judgeWrite(G, ctx, item, answer) {
  const typed = String(answer == null ? '' : answer).trim(), ref = item.meta.ref || item.en;
  if (!typed) return { ok: false, why: '还没写。', canonical: ref, zh: item.zh, forms: [], claimable: false };
  const v = G.check({ fmt: 'WT', input: 'text', subs: ['W-sent'], main: item.id, ref }, typed, { ctx });
  const forms = v.forms || [];
  let why;
  if (v.ok) why = '句子对了。';
  else if (forms.length) why = '还差一点：' + forms.map(formZh).join('；') + '。' + (v.claimable ? '意思到了；如果你觉得自己的写法也对，可以点「我的写法也对」。' : '');
  else why = '和参考句差得多。参考：' + ref;
  return { ok: !!v.ok, why, canonical: ref, zh: item.zh, forms, claimable: !!v.claimable, coverage: v.coverage };
}
