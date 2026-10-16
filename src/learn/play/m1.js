// 题即玩法 play-1 — which items are M1 墨靶 (ink targets) now, and the words the strip says (docs/PLAY.md §3 M1, §4).
// Pure (Node-tested).
//
//   M1_KINDS                  item meta.kind values that are ink targets in phase 1: 'word' (单词选义, choice · word) and
//                             'quiz' (语法小测 choice · quiz, 发音小测 pron · quiz). Not yet: 'read' (阅读题: its passage is a
//                             board first — PLAY §9 lists it under phase 1, the play-1 brief leaves it to a later phase),
//                             'sym' / 'pair' (M3 beat pads), anything typed (M4), lessons, flip cards.
//   isM1Item(item)            meta.input 'choice' and meta.kind in M1_KINDS
//   canPlayM1(item, p)        and the prompt to ask is a plain choice of 2–4 options: the engine's own, or the reworded
//                             retry that only reshuffles them (p._perm), and not more planks than LEARN.m1.bannerMax.
//                             A typed rewording (p._alt 'typed-of-choice' — only
//                             for a stem starting 「哪一个是」, which none of the three weeks has), a flip card or anything
//                             else keeps the card.
//   targetLabels(p)           [{ text, zh }] the objects' labels, in the prompt's option order (object k = option k)
//   answerOfTarget(p, k)      the answer the card would send for the same pick: the option index k (flow._judgeRecord maps a
//                             reshuffled retry through p._perm exactly as for the card's button k)
//   verdictLines(r, item)     { ok, head, why } — right: 「答对了」; wrong: 「差一点：是 <the right option>」 and the first
//                             sentence of 为什么 (the course's own explanation when the item has one: the engine's why for a
//                             quiz begins 「不对。正确答案：…」, which the head already says)
import { LEARN } from '../../config.js';
import { isBanner } from './layout.js';

export const M1_KINDS = new Set(['word', 'quiz']);

export function isM1Item(item) {
  const m = (item && item.meta) || {};
  return m.input === 'choice' && M1_KINDS.has(m.kind);
}

export function canPlayM1(item, p) {
  if (!isM1Item(item) || !p || p.type !== 'choice' || p._flip) return false;
  if (p._alt) return false;
  const n = (p.options || []).length;
  if (n < 2 || n > 4) return false;
  // long labels are planks, at most LEARN.m1.bannerMax of them (none of the three weeks has a 4-option one: the card)
  return n <= LEARN.m1.bannerMax || !isBanner(targetLabels(p));
}

export function targetLabels(p) {
  return (p.options || []).map((o) => ({ text: String(o.text ?? ''), zh: o.zh && o.zh !== o.text ? String(o.zh) : '' }));
}

export const answerOfTarget = (p, k) => (Number.isInteger(k) && k >= 0 && k < (p.options || []).length ? k : -1);

// the first sentence of a Chinese explanation (up to 。！？ or a line break), at most `max` characters
export function firstSentence(s, max = 46) {
  const t = String(s ?? '').trim();
  if (!t) return '';
  const m = /^[\s\S]*?[。！？!?](?=\s|$|[^。！？!?])|^[^\n]+/.exec(t);
  let out = (m ? m[0] : t).trim();
  if (out.length > max) out = out.slice(0, max - 1) + '…';
  return out;
}

export function verdictLines(r, item) {
  if (r && r.ok) return { ok: true, head: '答对了', why: firstSentence(r.why && !/^答对了。?$/.test(r.why) ? r.why.replace(/^答对了。\s*/, '') : '') };
  const right = String((r && r.canonical) ?? '');
  const own = item && item.meta && item.meta.why;
  let why = own ? firstSentence(own) : '';
  if (!why && r && r.why) why = firstSentence(String(r.why).replace(/^不对。\s*/, '').replace(/^正确答案：[^。]*。\s*/, ''));
  return { ok: false, head: right ? `差一点：是 ${right}` : '差一点', why };
}
