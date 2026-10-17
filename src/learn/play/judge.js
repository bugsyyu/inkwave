// 题即玩法 play-8 — the one judging path (docs/PLAY.md §1 rule 2, LEARN §27). Every form's _judgeRecord comes here with
// what a game action handed it (an option index, a typed string, a flip card's own rating) and keeps only what is its
// own: its queue, its lock, its other try, its 回炉, its effects. Pure: no DOM, no three.js (Node-tested).
//
//   judgeRecord({ item, p, ans, o, store }) → { r, first, held, self, hinted, evidence }
//     item   the item being asked (A's content.js item, with the flow's _tries / _form / _relearn on it)
//     p      the prompt it was asked with (engine.prompt, or a rewording: _perm / _alt / _flip / _hinted / _tip)
//     ans    the answer (forms/common.js judgeAnswer maps a reworded prompt's answer back to the item's)
//     o      { judged?, hinted?, hold?, decided?, claim?, at? }
//     store  the progress store (src/learn/store.js store) — recordFirst writes the day's first answer
//
// The conventions, written once:
//   judge    o.judged when a station already has the verdict, else judgeAnswer(item, p, ans) (Gen.check / Host.dictScore
//            / WT through engine.judge)
//   held     o.hold (a station that can wait for her: the typed sentence) + a near miss canClaim allows → { held: true },
//            nothing written, no first answer; the caller offers 「我的写法也对 / 继续」
//   decided  o.decided — her decision on a held sentence: + o.claim → claimJudge re-checks it; standing → self (S), else
//            the miss as it was (W)
//   hinted   p._hinted (a prop's hint on the prompt: 墨雨) or o.hinted (the keyboard's 提示) → H
//   flip     p._flip → the self-rating mode F
//   first    store.recordFirst — the day's first answer about the item is evidence, later ones are practice
//   evidence the leaf written ([result, mode]) or null
import { judgeAnswer, canClaim, claimJudge } from '../forms/common.js';

export function judgeRecord({ item, p, ans, o = {}, store }) {
  let r = o.judged || judgeAnswer(item, p, ans), self = false;
  if (o.hold && !o.decided && canClaim(item, p, r)) return { r, first: false, held: true, self: false, hinted: false, evidence: null };
  if (o.decided && o.claim) { const c = claimJudge(item, p, ans); if (c.ok) { r = c; self = true; } }
  const hinted = !!(p._hinted || o.hinted);
  const rec = store.recordFirst({ itemId: item.id, item, ok: r.ok, pct: r.pct, at: o.at ?? Date.now(), ...(p._flip ? { how: 'F' } : {}), ...(hinted ? { hinted: true } : {}), ...(self ? { self: true } : {}) });
  const first = !!rec.first;
  return { r, first, held: false, self, hinted, evidence: first ? rec.leaf : null };
}
