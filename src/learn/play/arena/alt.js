// 题即玩法 play-5 — the other form of a missed item in an arena (PLAY §4 「回炉换成」, the 对抗赛 / Boss columns), as play-wire
// rewrote flow.js's _altPrompt for the puzzle: a choice stays a choice (reshuffled — still ink targets, the base does
// it); a missed 单词卡 comes back as a choice among the right word and near misses that are all ink balls (M1 选义: a long
// word's distractors are planks, at most LEARN.m1.bannerMax); a missed 听写句 is the same dictation heard slowly (never
// four sentence planks); a missed 写句 is typed again with the reference's Chinese given. Pure (Node-tested): the pool
// of distractors comes from the form's own gates (a boss's phases, a duel's rounds), not the level's.
//
//   arenaAltPrompt(gates, item, rnd?) → the prompt, or null (the form's own rewording then)
//   wordPool(gates, item, rnd?)       the single words (or sentences) of the gates as distractors
//   (play-6: rnd — Math.random unless given — draws the distractors and their order; the two-player forms hand it a
//   seeded one, so every screen builds the same reworded question: forms/duo.js duoAltPrompt)
import { LEARN } from '../../../config.js';
import { prompt } from '../../api.js';
import { isBanner } from '../layout.js';

const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9'\s-]/g, ' ').replace(/\s+/g, ' ').trim();
function shuffle(a, rnd = Math.random) { for (let i = a.length - 1; i > 0; i--) { const j = (rnd() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
const enOf = (it) => String((it && it.meta && it.meta.ref) || (it && it.en) || '');

// (a word's distractors are words: a 音标 item's options are symbols like /j/ — never a word card's choice)
const WORD = /^[A-Za-z][A-Za-z']*$/;
export function wordPool(gates, item, rnd = Math.random) {
  const en = enOf(item), sentence = /\s/.test(en), out = [];
  for (const g of gates || []) for (const it of g.items || []) {
    const e = enOf(it);
    if (it.id !== item.id && e && /\s/.test(e) === sentence && (sentence || WORD.test(e))) out.push({ en: e, zh: it.zh });
    if (!sentence) for (const o of it.options || []) if (o.en && WORD.test(o.en)) out.push({ en: o.en, zh: o.zh });
  }
  return shuffle(out, rnd);
}

export function arenaAltPrompt(gates, item, rnd = Math.random) {
  const base = prompt(item);
  if (!base || base.type === 'choice') return null;
  const kind = item.meta && item.meta.kind, en = enOf(item);
  if (kind === 'dict') return { ...base, text: '换个问法：慢一点再听一遍，把听到的句子写下来。', _tip: { zh: '回炉：慢速再听一遍 — ' + (item.zh || ''), variant: 'slow', slow: true } };
  if (kind === 'write' || base.type === 'write') return { ...base, text: '换个问法：' + (base.text || '把这句写成英文'), zh: ['参考：' + (item.zh || ''), base.zh].filter(Boolean).join('　'), _tip: { zh: '回炉：参考 ' + en, variant: 'ref' } };
  const long = (w) => isBanner([{ text: String(w.en ?? w.text ?? ''), zh: String(w.zh || '') }]);
  const opts = [{ text: en, zh: item.zh }], want = long(item) ? LEARN.m1.bannerMax : 4;
  for (const w of wordPool(gates, item, rnd)) {
    if (opts.length >= want) break;
    if (!w.en || norm(w.en) === norm(en) || opts.some((o) => norm(o.text) === norm(w.en))) continue;
    if (!/[a-z]/i.test(w.en) || (!long(item) && long(w))) continue;
    opts.push({ text: w.en, zh: w.zh });
  }
  if (opts.length < 2) return null;
  shuffle(opts, rnd);
  return { type: 'choice', text: /\s/.test(en) ? '换个问法：再听一遍，选出你听到的那句' : '换个问法：再听一遍，选出你听到的词', zh: item.zh, tts: en, options: opts, _alt: 'choice-of-typed' };
}
