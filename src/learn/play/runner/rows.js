// 墨浪跑酷 — the day's items as rows on the road, and the one answer path (docs/PLAY.md §1 rule 2, §3 M2 / M3 / M4, §4).
// Pure (Node runs it on A's content): no DOM, no three.js.
//
//   entriesOf(gates)                 the run's queue: per checkpoint, a row per scored choice item ('lane'; 'beat' for the
//                                    听辨对子 pairs and the 音标 sym rows) and one 'glide' stretch for its typed items
//                                    (单词卡 / 听写句 / 写句 — the typing weapon is the next workstream's; a stub here)
//   rowPrompt(item, opts)            the engine's own prompt with the options the row shows, in lane order (left → right):
//                                    all of them; reshuffled for the second try (「换个问法」); fewer when the road is
//                                    narrow (the right one always stays). `_perm` maps a lane back to the item's option
//                                    index — forms/common.js judgeAnswer honours it, the same as for B's reshuffled cards
//   rowLabels(item, p) · isBanner(label) · rowLanes(item, p)
//   rowAnswer(item, p, lane, opts)   entering a curtain: lane → judgeAnswer → store.recordFirst — exactly what a card's
//                                    answer does (race.js _answer); lane −1 (the gap between curtains) = no answer, nothing
//                                    written. Beat timing never comes in here (PLAY §1 rule 4: timing ≠ correctness)
//   planCourse(entries, T, W, R)     where every row would stand on the lap (no retries): the checkpoints for the bots
//                                    and how many laps the run needs
import { prompt, store } from '../../api.js';
import { judgeAnswer } from '../../forms/common.js';
import { readLead, leadDistance } from './lanes.js';
import { placeRow } from './track.js';

const CJK = /[⺀-鿿豈-﫿＀-￯　-〿]/g;
const cjkN = (s) => (String(s || '').match(CJK) || []).length;
const enN = (s) => String(s || '').replace(CJK, '').replace(/\s+/g, ' ').trim().length;

export const ROW_KINDS = { pair: 'beat', sym: 'beat' };   // M3 in the runner: lane changes on the beat (PLAY §4)

// the run's queue, checkpoint by checkpoint (an unscored item or a 'read'-only one asks nothing and is left out)
export function entriesOf(gates) {
  const out = [];
  gates.forEach((g, k) => {
    const typed = [];
    for (const it of g.items || []) {
      const m = it.meta || {};
      if (!m.scored) continue;
      if (m.input === 'choice') out.push({ gate: k, kind: ROW_KINDS[m.kind] || 'lane', item: it });
      else if (m.input === 'type' || m.input === 'write') typed.push(it);
    }
    if (typed.length) out.push({ gate: k, kind: 'glide', items: typed });
  });
  return out;
}

// a curtain's two lines: the option as the engine words it (a word's meaning is Chinese only) and its Chinese
export function rowLabels(item, p) { return (p.options || []).map((o) => ({ en: o.text || '', zh: o.zh || '' })); }
export function labelText(l) { return [l.en, l.zh].filter(Boolean).join(' '); }
// a banner curtain (PLAY §4: longer than 12 English characters or 8 Chinese ones)
export function isBanner(l, B = { en: 12, zh: 8 }) { return enN(l.en) > B.en || cjkN(l.en) > B.zh || cjkN(l.zh) > B.zh; }

// how many lanes the item wants: one per option, at most `max` banners
export function rowLanes(item, p, B = { en: 12, zh: 8, max: 3 }) {
  const n = (p.options || []).length;
  return rowLabels(item, p).some((l) => isBanner(l, B)) ? Math.min(n, B.max) : n;
}

function shuffled(n, rnd) {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let i = n - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  if (n > 1 && a.every((v, i) => v === i)) a.push(a.shift());   // a reshuffle that changes nothing is no reshuffle
  return a;
}
// the row's prompt: lanes left → right. opts: lanes (how many the road gives it), alt (the second try: reshuffled,
// 「换个问法」 in front of the question), order (an option order to keep — a row narrowed after it was drawn), rnd. The right option is always among the lanes; dropped ones are the last
// distractors (the engine lists a word's neighbours nearest first).
export function rowPrompt(item, opts = {}) {
  const base = prompt(item), n = (base.options || []).length, rnd = opts.rnd || Math.random;
  let idx = opts.order ? opts.order.slice() : opts.alt ? shuffled(n, rnd) : Array.from({ length: n }, (_, i) => i);
  const want = Math.max(2, Math.min(n, opts.lanes || n));
  if (want < n) {
    const keep = new Set([item.answer]);
    for (const i of idx) { if (keep.size >= want) break; keep.add(i); }
    idx = idx.filter((i) => keep.has(i));
  }
  const p = { ...base, options: idx.map((i) => base.options[i]) };
  if (idx.length !== n || idx.some((v, i) => v !== i)) p._perm = idx;
  if (opts.alt) p.text = '换个问法：' + base.text;
  return p;
}

// the lane of the right answer in a row's prompt (the audits and the 「差一点」 line)
export function rightLane(item, p) { return p._perm ? p._perm.indexOf(item.answer) : item.answer; }

// Entering a curtain — the same judge and the same first-answer record as a card (race.js _answer: judgeAnswer, then
// store.recordFirst({ itemId, item, ok, pct, hinted, at })). lane −1 / null: through the gap — no answer, no evidence.
export function rowAnswer(item, p, lane, opts = {}) {
  if (lane == null || lane < 0 || lane >= (p.options || []).length) return { answered: false };
  const r = judgeAnswer(item, p, lane);
  const rec = store.recordFirst({ itemId: item.id, item, ok: r.ok, pct: r.pct, hinted: !!opts.hinted, at: opts.at ?? Date.now() });
  return { answered: true, lane, r, first: !!rec.first, rec };
}

// ---------------------------------------------------------------------------------------------- the static course
// R = LEARN.runner. Each row needs its reading lead (at the slowed tide) of road before it, clear of the row before;
// a glide stretch is R.glide m. → { rows: [{ entry, s, lanes, c, lead }], gateS: [first s of each checkpoint], end }
export function planCourse(entries, T, W, R, opts = {}) {
  const v = (opts.swimSpeed ?? 11.8) * R.tide;
  let cur = opts.start ?? R.firstRow;
  const rows = [], gateS = [];
  for (const e of entries) {
    if (e.kind === 'glide') {
      const s0 = cur + 4;
      if (gateS[e.gate] == null) gateS[e.gate] = s0;
      rows.push({ entry: e, s: s0, s1: s0 + R.glide });
      cur = s0 + R.glide + R.after;
      continue;
    }
    const p = rowPrompt(e.item, {});
    const lanes = rowLanes(e.item, p, R.banner);
    const lead = readLead(rowLabels(e.item, p).map(labelText), R.lead);
    const want = cur + leadDistance(lead, v);
    const at = placeRow(T, W, want, lanes, { laneW: R.laneW, runIn: R.runIn, runOut: R.runOut, slide: R.slide, search: T.len * 2 });
    const s = at ? at.s : want;
    if (gateS[e.gate] == null) gateS[e.gate] = s - leadDistance(lead, v);
    rows.push({ entry: e, s, lanes: at ? at.lanes : lanes, c: at ? at.c : 0, lead });
    cur = s + R.after;
  }
  return { rows, gateS, end: cur };
}
