// 题即玩法 — where the question objects go on the screen (docs/PLAY.md §6.2). Pure: no DOM, no three.js, so
// `node --test tests/learn/play.test.mjs` runs it at 390 × 844, 844 × 390 and both iPad ways.
//
//   layoutTargets(n, labels, aspect, safe, opts?) → { kind, fits, items: [{ i, kind, x, y, r?, w, h, label, rect }], font, font2 }
//     n       how many objects (the item's options: 2–4)
//     labels  [{ text, zh }] one per object, as engine.prompt gives the options (text = the line shown big, zh = its Chinese)
//     aspect  screen width / height: ≥ 1 is landscape (balls in one row), < 1 portrait (2 × 2, 2 + 1, or a row of 2)
//     safe    { x, y, w, h } CSS px the objects may take: the screen minus the strip on top and LEARN.playUi.side at the
//             sides (the caller also takes off the HUD's top buttons and the bottom controls)
//     opts    { avoid: [{ x, y, w, h }] (her silhouette, the touch buttons, the minimap: no object box crosses one),
//               font, font2 (label line sizes, px), bannerW (px: a plank's width, LEARN.m1.bannerW — the atlas's) }
//   Each item: a ball — centre (x, y), radius r, its label plate below (label = { x, y, w, h }, top-left); a banner — the
//   plank's box (x, y top-left, w, h) with the label on it. rect = the object's whole box (ball ∪ label, or the plank):
//   what is projected back for a tap (pick.js) and what the audit checks against the safe area.
//   kind 'ball' | 'banner' for the whole item: any label longer than LEARN.m1.bannerEn English / bannerZh Chinese
//   characters makes every object a banner (PLAY §4), stacked one per row (never squeezed side by side).
//   fits: false when even the smallest allowed objects do not fit (the items are still returned, best effort). When
//   nothing fits round every avoid box, her silhouette ('her') may be covered (cover: 'her'), then any box (cover:
//   'all'): every option is always on the screen.
//
//   isBanner(labels) · textWidth(s, px) · labelBox(label, font, font2) · wrapLines(s, maxW, px) — the measures the layout
//   and the label atlas (atlas.js) share, so a plate drawn 2 gates ahead has the shape the layout gave it.
import { LEARN } from '../../config.js';

const U = LEARN.playUi, M = LEARN.m1;
const CJK = /[⺀-鿿豈-﫿＀-￯　-〿]/;

// an estimate of a line's width in CSS px at a given font size (Rubik / the system CJK face, bold): a CJK character is
// one em, Latin capitals and digits ~0.64 em, lower case ~0.55 em, IPA ~0.6 em, a space 0.28 em
export function textWidth(s, px) {
  let w = 0;
  for (const ch of String(s ?? '')) {
    if (CJK.test(ch)) w += 1;
    else if (ch === ' ') w += 0.28;
    else if (/[A-Z0-9]/.test(ch)) w += 0.64;
    else if (/[a-z]/.test(ch)) w += 0.55;
    else if (/[.,'’:;!|]/.test(ch)) w += 0.3;
    else w += 0.6;
  }
  return w * px;
}
export const zhCount = (s) => [...String(s ?? '')].filter((c) => CJK.test(c)).length;
export const enCount = (s) => [...String(s ?? '')].filter((c) => !CJK.test(c)).length;

// PLAY §4: an option longer than 12 English or 8 Chinese characters (its line and its Chinese together) → banners
export function isBanner(labels) {
  return (labels || []).some((l) => enCount(l.text) > M.bannerEn || zhCount(l.text) + zhCount(l.zh) > M.bannerZh);
}

// words / characters of a line broken to fit maxW (CJK breaks anywhere, Latin at spaces); `measure` (s, px) → width:
// the estimate here, the canvas's own measureText in the atlas
export function wrapLines(s, maxW, px, measure = textWidth) {
  const str = String(s ?? '').trim();
  if (!str) return [];
  const toks = str.match(/[⺀-鿿豈-﫿＀-￯　-〿]|[^\s⺀-鿿豈-﫿＀-￯　-〿]+|\s+/g) || [str];
  const lines = []; let cur = '';
  for (const t of toks) {
    const next = cur + t;
    if (cur && measure(next.trim(), px) > maxW) { lines.push(cur.trim()); cur = /^\s+$/.test(t) ? '' : t; }
    else cur = next;
  }
  if (cur.trim()) lines.push(cur.trim());
  return lines;
}

// a line into maxW (LEARN §35): first a smaller size (down to `min`), then wrapped (≤ `lines` lines, from the full size
// down), and only then cut with an ellipsis at `min` → { px, lines: [...], cut }
export function fitText(s, maxW, px, o = {}) {
  const m = o.measure || textWidth, n = o.lines || 1, min = Math.min(px, o.min ?? Math.max(12, Math.round(px * 0.82)));
  const str = String(s ?? '').trim();
  if (!str) return { px, lines: [], cut: false };
  for (let f = px; f >= min; f--) if (m(str, f) <= maxW) return { px: f, lines: [str], cut: false };
  if (n > 1) for (let f = px; f >= min; f--) {
    const L = wrapLines(str, maxW, f, m);
    if (L.length <= n && L.every((l) => m(l, f) <= maxW)) return { px: f, lines: L, cut: false };
  }
  const L = (n > 1 ? wrapLines(str, maxW, min, m) : [str]).slice(0, n);
  for (let k = 0; k < L.length; k++) {
    if (k < L.length - 1 && m(L[k], min) <= maxW) continue;
    const cs = [...L[k]];
    while (cs.length > 1 && m(cs.join('').trimEnd() + '…', min) > maxW) cs.pop();
    L[k] = cs.join('').trimEnd() + '…'; L.length = k + 1;
    break;
  }
  return { px: min, lines: L, cut: true };
}

// the sticker plate's frame (CSS px, LEARN §35 — the battle's name tags): a dark outline `line` wide, a solid shadow
// `shadow` under it, a tail `tail` tall up to the ball, `air` round it all (the texture's filtering), the text `padX` /
// `padY` inside the outline; `maxIn` the widest a ball's text runs before its Chinese shrinks, wraps, is cut
export const FRAME = { line: 3, shadow: 3, tail: 6, air: 1.5, padX: 9, padY: 3, rad: 16, maxIn: 150, lh: 1.22, minIn: 34 };
// the first line's estimate: a Latin line is set in Titan One, ~1.3 × the Rubik estimate (its m, w, n are wide)
export const TITAN_K = 1.3;
export const enWidth = (s, px) => (zhCount(s) ? textWidth(s, px) : textWidth(s, px) * TITAN_K);
export const frameX = (F = FRAME) => F.air + F.line + F.padX;
// a plate's text fitted (pure: `measure` the estimate here, the canvas's measureText in the atlas) → the first line
// { px, lines }, the Chinese's (smaller, then on two lines, then cut), and the inner width they take
export function plateText(label, font = U.font, font2 = font - 2, maxIn = FRAME.maxIn, measure = enWidth, measure2 = textWidth, minA) {
  const a = String(label?.text ?? ''), b = label?.zh && label.zh !== label.text ? String(label.zh) : '';
  const A = fitText(a, maxIn, font, { measure, lines: 2, min: minA });   // (a long mixed line — an IPA note with its Chinese — wraps too)
  const B = b ? fitText(b, maxIn, font2, { measure: measure2, lines: 2 }) : { px: font2, lines: [], cut: false };
  const ws = [...A.lines.map((l) => measure(l, A.px)), ...B.lines.map((l) => measure2(l, B.px))];
  return { a: A, b: B, inner: Math.min(maxIn, Math.max(FRAME.minIn, ...ws)) };
}

// a label plate's natural box (CSS px): its line, its Chinese under it when there is one, in the sticker frame; the
// atlas draws it at this shape (× LEARN.m1.atlasScale) and fits the text again with the real fonts inside it
export function labelBox(label, font = U.font, font2 = font - 2) {
  const F = FRAME, P = plateText(label, font, font2);
  const w = P.inner + 2 * frameX();
  const h = Math.round((P.a.lines.length * P.a.px + P.b.lines.length * P.b.px) * F.lh + 2 * (F.padY + F.line + F.air) + F.tail + F.shadow);
  return { w: Math.ceil(w), h, lines: P.a.lines.length + P.b.lines.length };
}
// a banner's box at a given width: both lines wrapped to it
export function bannerBox(label, w, font = U.font, font2 = font - 2) {
  const a = String(label?.text ?? ''), b = label?.zh && label.zh !== label.text ? String(label.zh) : '';
  const la = wrapLines(a, w - 28, font), lb = b ? wrapLines(b, w - 28, font2) : [];
  return { w, h: Math.round(la.length * font * 1.28 + lb.length * font2 * 1.28 + 20), la, lb };
}

// the free stretches of [x0, x1] in a horizontal band, once every avoid box crossing the band is taken out
function freeSegments(x0, x1, y0, y1, avoid, minLen) {
  let segs = [[x0, x1]];
  for (const a of avoid || []) {
    if (a.y >= y1 || a.y + a.h <= y0) continue;
    const ax0 = a.x, ax1 = a.x + a.w, out = [];
    for (const [s0, s1] of segs) {
      if (ax1 <= s0 || ax0 >= s1) { out.push([s0, s1]); continue; }
      if (ax0 > s0) out.push([s0, ax0]);
      if (ax1 < s1) out.push([ax1, s1]);
    }
    segs = out;
  }
  return segs.filter(([a, b]) => b - a >= minLen);
}

// k objects over the free segments, proportional to their lengths (largest remainder): [[seg, count]…]
function allot(segs, k) {
  const total = segs.reduce((n, [a, b]) => n + (b - a), 0);
  if (!segs.length || total <= 0) return null;
  const raw = segs.map(([a, b]) => (k * (b - a)) / total), cnt = raw.map(Math.floor);
  let left = k - cnt.reduce((n, c) => n + c, 0);
  const order = raw.map((r, i) => [r - Math.floor(r), i]).sort((p, q) => q[0] - p[0] || q[1] - p[1]);
  for (const [, i] of order) { if (left <= 0) break; cnt[i]++; left--; }
  return segs.map((s, i) => [s, cnt[i]]).filter(([, c]) => c > 0);
}

const ARRANGE = { 1: [[1]], 2: [[2], [1, 1]], 3: [[3], [2, 1], [1, 1, 1]], 4: [[4], [2, 2], [3, 1]] };

// one arrangement of balls (counts per row) with every row band a share `f` of its slot, packed from the top → its items
// and its score (the ball diameter every object gets; a row split very unevenly round an avoid box scores less)
function ballsIn(rows, boxes, safe, avoid, f = 1, maxD = 150) {
  const bh = (safe.h / rows.length) * f, gap = 6, items = [], cells = [];
  let d = Infinity, k = 0, even = 1;
  for (let r = 0; r < rows.length; r++) {
    const y0 = safe.y + r * bh, y1 = y0 + bh;
    const segs = freeSegments(safe.x, safe.x + safe.w, y0, y1, avoid, 56);
    const al = allot(segs, rows[r]);
    if (!al) return null;
    const cs = al.map(([, c]) => c);
    if (Math.max(...cs) - (cs.length > 1 ? Math.min(...cs) : Math.max(...cs)) > 1 || (cs.length === 1 && segs.length > 1 && rows[r] > 1 && segs.length >= 2 && al.length === 1)) even = 0.88;
    for (const [[s0, s1], c] of al) {
      const cw = (s1 - s0) / c;
      for (let j = 0; j < c; j++) cells.push({ x: s0 + cw * j, y: y0, w: cw, h: bh, i: k++ });
    }
  }
  // one diameter for all (fair and tidy): what the tightest cell allows, the label plate under the ball included
  for (const c of cells) {
    const lb = boxes[c.i];
    const lw = Math.min(c.w - 8, lb.w), lh = lb.h * Math.min(1, lw / lb.w);
    d = Math.min(d, c.w * 0.62, c.h - lh - gap - 8, maxD);
  }
  if (!(d >= 34)) return { score: d, items: null };
  for (const c of cells) {
    const lb = boxes[c.i];
    const s = Math.min(1, (c.w - 8) / lb.w), lw = lb.w * s, lh = lb.h * s;
    const grp = d + gap + lh, top = c.y + (c.h - grp) / 2;
    const cx = c.x + c.w / 2, cy = top + d / 2;
    const label = { x: cx - lw / 2, y: top + d + gap, w: lw, h: lh };
    const x0 = Math.min(cx - d / 2, label.x), x1 = Math.max(cx + d / 2, label.x + lw);
    items.push({ i: c.i, kind: 'ball', x: cx, y: cy, r: d / 2, w: d, h: d, label, labelScale: s, rect: { x: x0, y: top, w: x1 - x0, h: grp } });
  }
  return { score: d * even, d, items };
}

// banners: every plank is the label atlas's own box (bannerBox at LEARN.m1.bannerW: the text wrapped once, 2 gates
// ahead, whichever way the phone is held); rows packed from the top, as many planks side by side as the band's free
// stretches hold (upright: one per row; on its side: two above her head, one each side of her below). A stretch a
// little narrower than a plank takes it shrunk (never under 80 %, never a font under 14 px).
function bannersIn(n, labels, safe, avoid, bannerW, font, font2) {
  const gap = 10, items = [], boxes = labels.slice(0, n).map((l) => bannerBox(l, bannerW, font, font2));
  let y = safe.y, i = 0, fits = true, minScale = 1;
  while (i < n) {
    const h0 = boxes[i].h;
    const segs = freeSegments(safe.x, safe.x + safe.w, y, y + h0, avoid, bannerW * 0.8).sort((a, b) => a[0] - b[0]);
    if (!segs.length) { y += 12; if (y + h0 > safe.y + safe.h) { fits = false; break; } continue; }
    let rowH = 0;
    const placed = [];
    for (const [s0, s1] of segs) {
      let x = s0;
      while (i < n) {
        const b = boxes[i], room = s1 - x;
        const sc = Math.min(1, room / b.w);
        if (sc < 0.8 || (placed.length && room < b.w)) break;
        placed.push({ i, x, w: b.w * sc, h: b.h * sc, b, sc });
        minScale = Math.min(minScale, sc);
        rowH = Math.max(rowH, b.h * sc);
        x += b.w * sc + gap; i++;
      }
    }
    if (!placed.length) { y += 12; if (y + h0 > safe.y + safe.h) { fits = false; break; } continue; }
    // centre the row's planks in each stretch they share
    for (const [s0, s1] of segs) {
      const mine = placed.filter((q) => q.x >= s0 - 0.5 && q.x < s1);
      if (!mine.length) continue;
      const used = mine.reduce((a, q) => a + q.w, 0) + gap * (mine.length - 1), off = (s1 - s0 - used) / 2;
      let x = s0 + off;
      for (const q of mine) { q.x = x; x += q.w + gap; }
    }
    for (const q of placed) items.push({ i: q.i, kind: 'banner', x: q.x, y, w: q.w, h: q.h, scale: q.sc, label: { x: q.x, y, w: q.w, h: q.h }, lines: q.b.la.length + q.b.lb.length, rect: { x: q.x, y, w: q.w, h: q.h } });
    y += rowH + gap;
  }
  const used = y - gap - safe.y;
  if (used > safe.h + 0.5 || items.length < n) fits = false;
  // a little air under the strip, never so much that a plank reaches an avoid box below it
  let shift = Math.max(0, Math.min((safe.h - used) * 0.25, 24));
  for (const it of items) for (const a of avoid) if (it.rect.x < a.x + a.w && a.x < it.rect.x + it.rect.w && a.y >= it.rect.y + it.rect.h) shift = Math.min(shift, a.y - (it.rect.y + it.rect.h) - 2);
  shift = Math.max(0, shift);
  for (const it of items) { it.y += shift; it.label.y += shift; it.rect.y += shift; }
  items.sort((a, b) => a.i - b.i);
  return { fits, items, minScale };
}

export function layoutTargets(n, labels, aspect, safe, opts = {}) {
  n = Math.max(1, Math.min(4, n | 0));
  labels = (labels || []).slice(0, n);
  while (labels.length < n) labels.push({ text: '', zh: '' });
  const avoid = opts.avoid || [];
  const banner = opts.banner != null ? !!opts.banner : isBanner(labels);
  // every avoid box first; when the objects do not fit round them, her silhouette may be covered (the controls and the
  // minimap never are, unless nothing fits at all) — an option is never dropped
  const sets = [avoid];
  if (avoid.some((a) => a.what === 'her')) sets.push(avoid.filter((a) => a.what !== 'her'));
  if (avoid.length) sets.push([]);
  let out = null;
  for (let k = 0; k < sets.length; k++) {
    const r = banner ? bannersLayout(n, labels, safe, sets[k], opts) : ballsLayout(n, labels, aspect, safe, sets[k], opts);
    if (r.fits && r.items.length === n) return k ? { ...r, cover: k === 1 ? 'her' : 'all' } : r;
    if (!out || r.items.length > out.items.length) out = r;
  }
  return out;
}

function bannersLayout(n, labels, safe, avoid, opts) {
  // the planks are the atlas's boxes; when they do not fit the font steps down (17 → 15 → 14), never below 14 px
  const bannerW = opts.bannerW || M.bannerW;
  let out = null;
  for (const f of [opts.font || U.font, 15, 14]) {
    out = bannersIn(Math.min(n, M.bannerMax), labels, safe, avoid, bannerW, f, f - 2);
    out.font = f; out.font2 = f - 2;
    if (out.fits) break;
  }
  return { kind: 'banner', fits: out.fits, items: out.items, font: out.font, font2: out.font2, bannerW };
}

function ballsLayout(n, labels, aspect, safe, avoid, opts) {
  const landscape = aspect >= 1;
  const font = opts.font || U.font, font2 = opts.font2 || font - 2;
  const boxes = labels.map((l) => labelBox(l, font, font2));
  // a ball is never more than ~2.6 label plates tall (on a big screen a huge ball dwarfs its 17 px label)
  const maxD = opts.maxD || Math.max(72, Math.min(150, Math.round(2.6 * Math.max(...boxes.map((b) => b.h)))));
  let best = null;
  for (const rows of ARRANGE[n]) {
    for (const f of [1, 0.85, 0.7, 0.55, 0.45, 0.4]) {
      const r = ballsIn(rows, boxes, safe, avoid, f, maxD);
      if (!r || !r.items) continue;
      // landscape wants one row (PLAY §6.2) unless two rows are a quarter bigger; upright the squarer grid; a smaller
      // band (objects higher up, off her and the controls) wins ties
      const pref = landscape ? (rows.length === 1 ? 1.25 : 1) : (rows.length === 2 ? 1.12 : 1);
      const score = r.score * pref + (1 - f) * 0.5;
      if (!best || score > best.score) best = { score, rows, items: r.items, d: r.d };
    }
  }
  if (!best) {
    // nothing clears these avoid boxes: the plain grid over the safe area (best effort; the audit reports it)
    const r = ballsIn(landscape ? [n] : ARRANGE[n][Math.min(1, ARRANGE[n].length - 1)], boxes, safe, [], 1, maxD);
    return { kind: 'ball', fits: false, items: r && r.items ? r.items : [], font, font2, rows: null };
  }
  best.items.sort((a, b) => a.i - b.i);
  return { kind: 'ball', fits: true, items: best.items, font, font2, rows: best.rows, d: best.d };
}

// is a box inside the safe area (with a pixel of rounding)?
export function insideSafe(rect, safe, eps = 1) {
  return rect.x >= safe.x - eps && rect.y >= safe.y - eps && rect.x + rect.w <= safe.x + safe.w + eps && rect.y + rect.h <= safe.y + safe.h + eps;
}
export const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
// the layout's own boxes in the shape pickTarget reads (what the objects project to once the camera has settled)
export function asProjected(items) {
  return (items || []).map((it) => (it.kind === 'ball' ? { i: it.i, kind: 'ball', cx: it.x, cy: it.y, r: it.r, label: it.label } : { i: it.i, kind: 'banner', x: it.x, y: it.y, w: it.w, h: it.h }));
}
