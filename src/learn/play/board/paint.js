// 展板路 M6 (and the echo booth's board, the signs) — what a board says and where on its canvas (docs/PLAY.md §3 M6 / M7,
// 路标). The layout is pure (Node measures it with text.js's approximate widths, the page with the canvas's); drawing it
// is one pass over the layout's ops.
//
//   specFor(kind, …) builders:  wordsSpec(rows, k, n) · soundsSpec(rows, k, n) · lessonSpec(title, lines) · noteSpec(title,
//                               text) · passageSpec(passage) · echoSpec(item) · signSpec(kind, title, text)
//   layoutBoard(spec, { measure, W, maxH }) → { W, H, ops, hotspots: [{ id, x, y, w, h, data }], cut, minFont, full }
//       everything on a board is ≥ BOARD.minFont canvas px (≥ 17 px on a phone once the board is framed — frame.js);
//       a board takes what fits — its title, the first paragraph — and when the text goes on, a 「读全文」 hotspot opens the
//       reading strip with all of it (`full`: the strip's blocks)
//   drawBoard(ctx, layout, { ink })   dark glass, a rim in her ink, the ops
import { wrap, clampLines, approxMeasure } from './text.js';
import { FONT, GLASS, TEXT, MUTED, DIM, roundRect } from './atlas.js';

export const BOARD = { W: 1024, pad: 54, minFont: 54, title: 74, body: 58, en: 64, ipa: 54, kicker: 54, lineH: 1.3, rowH: 134, btnH: 116, gap: 22 };
const ROW_MIN = 140;  // canvas px: a row's height (≥ 44 pt on a 390 px wide phone)
const MAX_H = 930;    // canvas px: taller than this and a framed board in landscape (a 375–390 px tall screen) reads under 17 px

/* ───────────────────────────── specs (content → what a board says) ───────────────────────────── */
// a word board (每 5 个词一块): the word, its US IPA, its meaning; each row replays its word; 「跟读」 plays them with gaps
export function wordsSpec(rows, k = 1, n = 1) {
  const R = rows.map((r) => ({ en: r.en, ipa: r.ipa ? `/${String(r.ipa).replace(/^\/|\/$/g, '')}/` : '', zh: r.zh, tts: r.tts || r.en }));
  return { kind: 'words', kicker: '', title: `单词 ${k} / ${n}`, rows: R, full: R.map((r) => ({ t: 'li', text: `${r.en}  ${r.ipa}`, sub: r.zh })), buttons: [{ id: 'follow', label: '跟读', icon: 'mic' }] };
}
// a sounds board (音标的口型 tip 和例词): two sounds a board
export function soundsSpec(rows, k = 1, n = 1) {
  const R = rows.map((r) => ({ en: r.ipa, ipa: r.name || '', zh: r.tip || '', sub: (r.examples || []).slice(0, 3).map((e) => `${e.en} ${e.zh}`).join(' · '), tts: (r.examples || []).slice(0, 3).map((e) => e.en).join('. ') }));
  return { kind: 'sounds', kicker: '', title: `音标 ${k} / ${n} · 看口型`, rows: R, full: R.map((r) => ({ t: 'li', text: `${r.en}  ${r.ipa}`, sub: `${r.zh}　${r.sub}` })), buttons: [] };
}
// the grammar lesson's lines (step.meta.lesson: ['p', text] · ['rows', [[a, b, c] …]] · ['ex', en, zh] · ['tip', text])
export function lessonSpec(title, lines) {
  const blocks = [], full = [];
  for (const l of lines || []) {
    const kind = Array.isArray(l) ? l[0] : 'p';
    if (kind === 'p') { blocks.push({ t: 'p', text: l[1] }); full.push({ t: 'p', text: l[1] }); }
    else if (kind === 'ex') { blocks.push({ t: 'ex', en: l[1], zh: l[2] }); full.push({ t: 'ex', en: l[1], zh: l[2] }); }
    else if (kind === 'tip') { blocks.push({ t: 'tip', text: l[1] }); full.push({ t: 'tip', text: l[1] }); }
    else if (kind === 'rows') { for (const r of l[1] || []) { const text = r.filter(Boolean).join('　'); blocks.push({ t: 'li', text }); full.push({ t: 'li', text }); } }
    else if (typeof l === 'string') { blocks.push({ t: 'p', text: l }); full.push({ t: 'p', text: l }); }
  }
  return { kind: 'lesson', kicker: '讲解板', title, blocks, full, buttons: [] };
}
// a Chinese note (the check-in's teacher's words, up to 200 characters; weekly / placement texts)
export function noteSpec(title, text, kicker = '老师的话') {
  return { kind: 'note', kicker, title, blocks: [{ t: 'p', text }], full: [{ t: 'p', text }], buttons: [] };
}
// the reading passage: its title, the first paragraph; 「听全文」 plays it; the strip has it all with its Chinese
export function passageSpec(P) {
  const en = String(P.en || ''), paras = en.split(/\n+/).filter(Boolean);
  const full = [{ t: 'en', text: en }, ...(P.zh ? [{ t: 'p', text: P.zh }] : []), ...((P.gloss || []).length ? [{ t: 'gloss', rows: P.gloss }] : [])];
  return { kind: 'passage', kicker: '阅读 · 课文', title: P.title || '', sub: P.titleZh || '', blocks: [{ t: 'en', text: paras[0] || en }], full, tts: en, buttons: [{ id: 'listen', label: '听全文', icon: 'play' }] };
}
// the echo booth (口语): the question and its Chinese, the sample's Chinese (she hears it in English), the patterns; the tip
// and the whole sample are in the strip; 「再听」 · 「说完了」 · 「评分 · 经典页」
export function echoSpec(item) {
  const m = (item && item.meta) || {}, phrases = (m.phrases || []).map((p) => (Array.isArray(p) ? { en: p[0], zh: p[1] } : { en: String(p), zh: '' }));
  const blocks = [{ t: 'q', en: item.en, zh: item.zh }];
  if (m.modelZh) blocks.push({ t: 'label', text: '范例（听英文，跟着说）' }, { t: 'p', text: m.modelZh, lines: 3 });
  if (phrases.length) blocks.push({ t: 'label', text: '句型' }, ...phrases.map((p) => ({ t: 'li', text: p.en, sub: p.zh })));
  if (m.tip) blocks.push({ t: 'tip', text: m.tip });
  const full = [{ t: 'q', en: item.en, zh: item.zh }, ...(m.model ? [{ t: 'label', text: '范例' }, { t: 'en', text: m.model }] : []), ...(m.modelZh ? [{ t: 'p', text: m.modelZh }] : []),
    ...(phrases.length ? [{ t: 'label', text: '句型' }, ...phrases.map((p) => ({ t: 'li', text: p.en, sub: p.zh }))] : []), ...(m.tip ? [{ t: 'tip', text: m.tip }] : [])];
  return { kind: 'echo', kicker: '回声亭 · 口语（不计分）', title: '', blocks, full, tts: m.model || item.en,
    buttons: [{ id: 'replay', label: '再听', icon: 'play' }, { id: 'done', label: '说完了', icon: 'check', primary: true }, { id: 'classic', label: '评分 · 经典页', icon: 'out' }] };
}
// a sign (路标): the weekly report board, the placement board, the check-in pad's board
export function signSpec(kind, title, text, button = '开经典页') {
  const kicker = kind === 'checkin' ? '打卡垫 · 踩上去就是走完了这一天' : kind === 'weekly' ? '周报牌' : kind === 'placement' ? '入门小测牌' : '路标';
  return { kind: 'sign', sign: kind, kicker, title, blocks: text ? [{ t: 'p', text }] : [], full: text ? [{ t: 'p', text }] : [], buttons: button ? [{ id: 'classic', label: button, icon: 'out', primary: true }] : [] };
}

/* ───────────────────────────── layout ───────────────────────────── */
export function layoutBoard(spec, o = {}) {
  const measure = o.measure || approxMeasure, W = o.W || BOARD.W, maxH = o.maxH || MAX_H, P = BOARD.pad, inner = W - P * 2;
  const ops = [], hotspots = [];
  let y = P * 0.62, minFont = Infinity, cut = false;
  const font = (px) => { minFont = Math.min(minFont, px); return px; };
  const textLine = (text, x, yb, px, weight, color, align = 'left') => ops.push({ op: 'text', text, x, y: yb, px: font(px), weight, color, align });
  // rows (words / sounds) are planned first: a row's meaning or tip that runs past its lines is cut (…) and the board's
  // 「全文」 (the reading strip) has every word with its whole meaning
  const isRows = !!spec.rows;
  const plan = [];
  let rowsCut = false;
  if (isRows) {
    const tw = inner - 104 - 6;
    for (const r of spec.rows) {
      const enW = measure(r.en, BOARD.en, 800), ipaW = r.ipa ? measure(r.ipa, BOARD.ipa, 500) : 0;
      const ipaInline = !r.ipa || enW + 22 + ipaW <= tw;
      const used = enW + (ipaInline && r.ipa ? 22 + ipaW : 0);
      const zhInline = spec.kind !== 'sounds' && ipaInline && !!r.zh && used + 26 + measure(r.zh, BOARD.body, 600) <= tw;
      const sub = [];
      if (spec.kind === 'sounds') {
        const c = clampLines(wrap(r.zh, tw, BOARD.body, measure, 600), 2, tw, BOARD.body, measure, 600);
        if (c.cut) rowsCut = true;
        for (const l of c.lines) sub.push([l, BOARD.body, 600, MUTED]);
        if (r.sub) { const c2 = clampLines(wrap(r.sub, tw, BOARD.ipa, measure, 600), 1, tw, BOARD.ipa, measure, 600); if (c2.cut) rowsCut = true; sub.push([c2.lines[0], BOARD.ipa, 600, DIM]); }
      } else {
        const rest = [!ipaInline ? r.ipa : '', !zhInline ? r.zh : ''].filter(Boolean).join('  ');
        if (rest) { const c = clampLines(wrap(rest, tw, BOARD.body, measure, 600), 1, tw, BOARD.body, measure, 600); if (c.cut) rowsCut = true; sub.push([c.lines[0], BOARD.body, 600, MUTED]); }
      }
      const content = BOARD.en * 1.05 + sub.reduce((a, q) => a + q[1] * 1.1, 0);
      plan.push({ r, enW, ipaInline, used, zhInline, sub, content, h: Math.max(ROW_MIN, content + 12) });
    }
  }
  // header: kicker, title (+ its Chinese); a rows board keeps its buttons (跟读, 全文) at the right of the title row
  if (spec.kicker) { textLine(spec.kicker, P, y + BOARD.kicker * 0.8, BOARD.kicker, 600, DIM); y += BOARD.kicker * 1.25; }
  const headBtns = isRows ? (spec.buttons || []).concat(rowsCut && spec.full ? [{ id: 'more', label: '全文', icon: 'book' }] : []) : [];
  if (spec.title) {
    const bws = headBtns.map((b) => Math.max(200, measure(b.label, BOARD.body, 800) + 128));
    const tw = inner - bws.reduce((a, b) => a + b + 18, 0);
    const lines = clampLines(wrap(spec.title, tw, BOARD.title, measure, 800), 2, tw, BOARD.title, measure, 800).lines;
    const y0 = y, lh = BOARD.title * 1.12, hh = Math.max(lh * lines.length, headBtns.length ? BOARD.btnH + 8 : 0);
    lines.forEach((l, k) => textLine(l, P, y0 + (hh - lh * lines.length) / 2 + k * lh + BOARD.title * 0.82, BOARD.title, 800, TEXT));
    let bx = W - P;
    headBtns.slice().reverse().forEach((b, k) => {
      const bw = bws[headBtns.length - 1 - k]; bx -= bw;
      const by = y0 + (hh - BOARD.btnH) / 2;
      ops.push({ op: 'pill', x: bx, y: by, w: bw, h: BOARD.btnH, label: b.label, icon: b.icon, px: font(BOARD.body), primary: b.id !== 'more' });
      hotspots.push({ id: b.id, x: bx, y: by, w: bw, h: BOARD.btnH });
      bx -= 18;
    });
    y += hh;
  }
  if (spec.sub) { textLine(spec.sub, P, y + BOARD.body * 0.8, BOARD.body, 600, MUTED); y += BOARD.body * 1.3; }
  y += BOARD.gap * (isRows ? 0.6 : 1);
  // the footer (buttons, and 读全文 when something did not fit) is placed last; reserve its height now
  const footBtns = isRows ? [] : (spec.buttons || []).slice();
  const footH = (n) => (n ? BOARD.btnH + BOARD.gap * 1.5 : 0) + P * 0.45;
  const room = () => maxH - footH(footBtns.length + (spec.full && !isRows ? 1 : 0)) - y;
  // rows: the whole row is its hotspot (≥ 44 pt tall once framed: ROW_MIN canvas px); a word board shows every word
  plan.forEach((q, i) => {
    const { r, h } = q, rx = P, rw = inner, tx = rx + 104;
    if (spec.kind === 'sounds' && room() < h) { cut = true; return; }
    ops.push({ op: 'rowbg', x: rx - 14, y, w: rw + 28, h: h - 10, i });
    ops.push({ op: 'icon', icon: 'play', x: rx + 44, y: y + (h - 10) / 2, r: 38 });
    let yy = y + (h - 10 - q.content) / 2 + BOARD.en * 0.86;
    textLine(r.en, tx, yy, BOARD.en, 800, TEXT);
    if (r.ipa && q.ipaInline) ops.push({ op: 'text', text: r.ipa, x: tx + q.enW + 22, y: yy, px: font(BOARD.ipa), weight: 500, color: DIM, align: 'left' });
    if (q.zhInline) ops.push({ op: 'text', text: r.zh, x: tx + q.used + 26, y: yy, px: font(BOARD.body), weight: 600, color: MUTED, align: 'left' });
    yy += BOARD.en * 0.19;
    for (const [t, px, wgt, col] of q.sub) { yy += px * 1.1; textLine(t, tx, yy, px, wgt, col); }
    hotspots.push({ id: `row:${i}`, x: rx - 14, y, w: rw + 28, h: Math.min(h, maxH - y), data: { tts: r.tts, en: r.en } });   // (rows tile: a row's hotspot is its whole pitch)
    y += h;
  });
  // text blocks: as many as fit; the one that does not fit is clamped (…), the rest go to the strip
  for (const b of spec.blocks || []) {
    if (room() < BOARD.body * 1.4) { cut = true; break; }
    if (b.t === 'label') { textLine(b.text, P, y + BOARD.kicker * 0.8, BOARD.kicker, 700, DIM); y += BOARD.kicker * 1.3; continue; }
    if (b.t === 'q') {
      const lines = clampLines(wrap(b.en, inner, BOARD.en, measure, 800), 3, inner, BOARD.en, measure, 800);
      for (const l of lines.lines) { textLine(l, P, y + BOARD.en * 0.85, BOARD.en, 800, TEXT); y += BOARD.en * 1.2; }
      if (b.zh) { textLine(b.zh, P, y + BOARD.body * 0.85, BOARD.body, 600, MUTED); y += BOARD.body * 1.35; }
      y += BOARD.gap * 0.6; continue;
    }
    if (b.t === 'ex') {
      const lines = wrap(b.en, inner - 40, BOARD.en, measure, 800);
      for (const l of lines) { if (room() < BOARD.en * 1.2) { cut = true; break; } textLine(l, P + 40, y + BOARD.en * 0.85, BOARD.en, 800, TEXT); y += BOARD.en * 1.2; }
      if (b.zh) for (const l of wrap(b.zh, inner - 40, BOARD.body, measure, 600)) { if (room() < BOARD.body * 1.3) { cut = true; break; } textLine(l, P + 40, y + BOARD.body * 0.85, BOARD.body, 600, MUTED); y += BOARD.body * 1.3; }
      y += BOARD.gap * 0.5; continue;
    }
    const px = b.t === 'en' ? BOARD.body : BOARD.body, weight = b.t === 'en' ? 600 : 600;
    const indent = b.t === 'li' ? 46 : b.t === 'tip' ? 0 : 0;
    const prefix = b.t === 'tip' ? '提示：' : '';
    const all = wrap(prefix + b.text, inner - indent, px, measure, weight);
    const fitN = Math.max(0, Math.floor(room() / (px * BOARD.lineH)));
    const want = Math.min(b.lines || 99, fitN);
    if (want <= 0) { cut = true; break; }
    const cl = clampLines(all, want, inner - indent, px, measure, weight);
    if (cl.cut) cut = true;
    if (b.t === 'li') ops.push({ op: 'dot', x: P + 14, y: y + px * 0.5, r: 9 });
    for (const l of cl.lines) { textLine(l, P + indent, y + px * 0.86, px, weight, b.t === 'tip' ? MUTED : TEXT); y += px * BOARD.lineH; }
    if (b.sub && room() >= BOARD.ipa * 1.3) { textLine(clampLines(wrap(b.sub, inner - indent, BOARD.ipa, measure, 500), 1, inner - indent, BOARD.ipa, measure, 500).lines[0], P + indent, y + BOARD.ipa * 0.86, BOARD.ipa, 500, DIM); y += BOARD.ipa * 1.3; }
    y += BOARD.gap * 0.6;
    if (cl.cut) break;
  }
  // footer: the buttons, and 读全文 when the board could not hold it all
  if (cut && spec.full) footBtns.push({ id: 'more', label: '读全文', icon: 'book' });
  if (footBtns.length) {
    y += BOARD.gap * 0.5;
    const gap = 18, n = footBtns.length;
    const widths = footBtns.map((b) => Math.max(210, measure(b.label, BOARD.body, 800) + 130));
    const total = widths.reduce((a, b) => a + b, 0) + gap * (n - 1);
    const k = total > inner ? inner / total : 1;
    let x = P;
    footBtns.forEach((b, i) => {
      const w = widths[i] * k;
      ops.push({ op: 'pill', x, y, w, h: BOARD.btnH, label: b.label, icon: b.icon, px: font(Math.max(BOARD.minFont, Math.min(BOARD.body, BOARD.body * k))), primary: !!b.primary });
      hotspots.push({ id: b.id, x, y, w, h: BOARD.btnH });
      x += w + gap;
    });
    y += BOARD.btnH;
  }
  const H = Math.ceil(Math.min(maxH, y + P * 0.45));
  return { W, H, ops, hotspots, cut, minFont: minFont === Infinity ? 0 : minFont, full: spec.full || null, kind: spec.kind };
}

/* ───────────────────────────── drawing ───────────────────────────── */
function icon(x, kind, cx, cy, r, color) {
  x.save(); x.translate(cx, cy); x.fillStyle = color; x.strokeStyle = color; x.lineJoin = 'round'; x.lineCap = 'round';
  if (kind === 'play') { x.beginPath(); x.moveTo(-r * 0.32, -r * 0.42); x.lineTo(r * 0.48, 0); x.lineTo(-r * 0.32, r * 0.42); x.closePath(); x.fill(); }
  else if (kind === 'check') { x.lineWidth = r * 0.2; x.beginPath(); x.moveTo(-r * 0.42, 0); x.lineTo(-r * 0.1, r * 0.32); x.lineTo(r * 0.45, -r * 0.35); x.stroke(); }
  else if (kind === 'out') { x.lineWidth = r * 0.16; x.beginPath(); x.moveTo(-r * 0.3, -r * 0.05); x.lineTo(-r * 0.3, r * 0.4); x.lineTo(r * 0.3, r * 0.4); x.lineTo(r * 0.3, -r * 0.05); x.moveTo(0, r * 0.12); x.lineTo(0, -r * 0.45); x.moveTo(-r * 0.2, -r * 0.27); x.lineTo(0, -r * 0.47); x.lineTo(r * 0.2, -r * 0.27); x.stroke(); }
  else if (kind === 'book') { x.lineWidth = r * 0.14; x.beginPath(); x.moveTo(0, -r * 0.28); x.quadraticCurveTo(-r * 0.25, -r * 0.42, -r * 0.5, -r * 0.3); x.lineTo(-r * 0.5, r * 0.36); x.quadraticCurveTo(-r * 0.25, r * 0.24, 0, r * 0.38); x.quadraticCurveTo(r * 0.25, r * 0.24, r * 0.5, r * 0.36); x.lineTo(r * 0.5, -r * 0.3); x.quadraticCurveTo(r * 0.25, -r * 0.42, 0, -r * 0.28); x.lineTo(0, r * 0.38); x.stroke(); }
  else if (kind === 'mic') { x.lineWidth = r * 0.14; roundRect(x, -r * 0.16, -r * 0.48, r * 0.32, r * 0.58, r * 0.16); x.fill(); x.beginPath(); x.arc(0, -r * 0.08, r * 0.32, 0.15, Math.PI - 0.15); x.moveTo(0, r * 0.24); x.lineTo(0, r * 0.44); x.stroke(); }
  x.restore();
}
export function drawBoard(x, L, o = {}) {
  const ink = o.ink || '#ff8a14', W = L.W, H = L.H;
  x.clearRect(0, 0, W, H);
  // the glass: dark, a soft sheen down from the top, a rim in her ink
  roundRect(x, 8, 8, W - 16, H - 16, 44); x.fillStyle = GLASS; x.fill();
  const g = x.createLinearGradient(0, 0, 0, H * 0.4); g.addColorStop(0, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fill();
  x.lineWidth = 12; x.strokeStyle = ink; x.stroke();
  roundRect(x, 22, 22, W - 44, H - 44, 34); x.lineWidth = 2; x.strokeStyle = 'rgba(255,255,255,0.12)'; x.stroke();
  for (const op of L.ops) {
    if (op.op === 'text') { x.font = `${op.weight} ${op.px}px ${FONT}`; x.fillStyle = op.color; x.textAlign = op.align || 'left'; x.textBaseline = 'alphabetic'; x.fillText(op.text, op.x, op.y); }
    else if (op.op === 'rowbg') { roundRect(x, op.x, op.y, op.w, op.h, 26); x.fillStyle = op.i % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.09)'; x.fill(); }
    else if (op.op === 'icon') { x.beginPath(); x.arc(op.x, op.y, op.r, 0, Math.PI * 2); x.fillStyle = 'rgba(255,255,255,0.14)'; x.fill(); icon(x, op.icon, op.x, op.y, op.r, TEXT); }
    else if (op.op === 'dot') { x.beginPath(); x.arc(op.x, op.y, op.r, 0, Math.PI * 2); x.fillStyle = ink; x.fill(); }
    else if (op.op === 'pill') {
      roundRect(x, op.x, op.y, op.w, op.h, op.h / 2);
      x.fillStyle = op.primary ? ink : 'rgba(255,255,255,0.14)'; x.fill();
      const fg = op.primary ? '#15121c' : TEXT;
      x.font = `800 ${op.px}px ${FONT}`; x.textAlign = 'left'; x.textBaseline = 'alphabetic';
      const tw = x.measureText(op.label).width, iw = op.icon ? op.h * 0.5 : 0, total = tw + iw + (op.icon ? 14 : 0);
      const sx = op.x + (op.w - total) / 2;
      if (op.icon) icon(x, op.icon, sx + iw / 2, op.y + op.h / 2, op.h * 0.42, fg);
      x.fillStyle = fg; x.fillText(op.label, sx + iw + (op.icon ? 14 : 0), op.y + op.h / 2 + op.px * 0.36);
    }
  }
}
