// 题即玩法 — one label atlas per gate (docs/PLAY.md §7): every option label of the gate's question objects drawn once
// into one CanvasTexture, 2 gates ahead of her, freed when the gate opens.
//
//   gateLabels(items, prompt, canPlay, bannerW) → [{ key, text, zh, banner, w, h }]  pure: the gate's distinct labels
//       (deduplicated by kind + text — a word gate's 100 options are ~25 meanings) and each one's box in CSS px
//       (labelBox for a ball's plate; bannerBox at bannerW for a plank)
//   packLabels(boxes, scale, max) → { w, h, rects: [{ x, y, w, h }], fits }  pure: shelf packing (tallest first) of the
//       boxes × scale texels into a max-wide sheet, height rounded up to 64 and at most `max`; fits = false when it overflows
//       (then the boxes are drawn smaller: drawLabelAtlas shrinks the scale until they fit)
//   fitAtlas(boxes) → packLabels at the largest scale (2, 1.75, 1.5 … 1) whose sheet fits: a gate of nine long pron-quiz
//       banners packs at 1.5, a word gate's 25 meanings at 2 in 1024 × 512
//   drawLabelAtlas(labels, opts) → { canvas, rects, uv: [[u0, v0, u1, v1]…], scale, w, h }   (DOM: a <canvas>)
//       a plate: dark ink glass (rgba(21, 18, 28, .9)) with a rounded rim, the line in white bold, its Chinese under it in
//       the HUD's muted lilac; a banner face: the same on the plank's size, lines wrapped as the layout wrapped them.
//       Fonts: the HUD's (Rubik for Latin, the system's CJK face — canvas cannot use the CSS unicode-range alias).
//   墨浪跑酷 (play-4, one label painter for the runner too — LEARN §20 「接口」): a label may carry its own box and type —
//       { fixed: true, w, h, font, font2, la, lb, tag } from fitLabel(): the text is centred in the box, a lane letter
//       (tag) sits in a chip at its top-left corner. fitLabel(label, w, h, opts) (pure) picks the largest font (opts.big
//       down to opts.small) at which the line (≤ opts.lines lines) and its Chinese fill the box.
import { LEARN } from '../../config.js';
import { labelBox, bannerBox, isBanner, wrapLines, textWidth, fitText, plateText, FRAME, frameX, zhCount } from './layout.js';

const U = LEARN.playUi, M = LEARN.m1;
export const LABEL_FONT = "'Rubik', 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', 'Noto Sans SC', 'Microsoft YaHei', system-ui, sans-serif";

export function gateLabels(items, promptOf, canPlay, bannerW = M.bannerW) {
  const out = [], seen = new Map();
  for (const it of items || []) {
    let p = null; try { p = promptOf(it); } catch (e) { p = null; }
    if (!p || !canPlay(it, p)) continue;
    const labs = p.options.map((o) => ({ text: o.text, zh: o.zh && o.zh !== o.text ? o.zh : '' }));
    const banner = isBanner(labs);
    for (const l of labs) {
      const key = (banner ? 'B|' : 'L|') + l.text + '|' + l.zh;
      if (seen.has(key)) continue;
      const box = banner ? bannerBox(l, bannerW) : labelBox(l);
      seen.set(key, out.length);
      out.push({ key, text: l.text, zh: l.zh, banner, w: box.w, h: box.h });
    }
  }
  return out;
}
export const labelKey = (l, banner) => (banner ? 'B|' : 'L|') + l.text + '|' + (l.zh && l.zh !== l.text ? l.zh : '');

export function packLabels(boxes, scale = M.atlasScale, max = M.atlasMax) {
  const pad = 4, order = boxes.map((b, i) => i).sort((a, b) => boxes[b].h - boxes[a].h || boxes[b].w - boxes[a].w);
  const rects = new Array(boxes.length);
  let x = pad, y = pad, rowH = 0, fits = true;
  for (const i of order) {
    const w = Math.ceil(boxes[i].w * scale), h = Math.ceil(boxes[i].h * scale);
    if (w + pad * 2 > max) fits = false;
    if (x + w + pad > max) { x = pad; y += rowH + pad; rowH = 0; }
    rects[i] = { x, y, w: Math.min(w, max - pad * 2), h };
    x += w + pad; rowH = Math.max(rowH, h);
  }
  const used = y + rowH + pad, h = Math.min(max, Math.max(64, Math.ceil(used / 64) * 64));
  if (used > max) fits = false;
  return { w: max, h, rects, fits, used };
}

function roundRect(x, X, Y, W, H, R) { x.beginPath(); if (x.roundRect) x.roundRect(X, Y, W, H, R); else x.rect(X, Y, W, H); }

// a fixed box (the runner's lane-wide plate): the largest font at which the label fits — the line wrapped to at most
// `lines` lines (its Chinese to two), nothing wider than the box, the lot no taller than it. Chinese-only lines (a
// word's meaning) take the CJK face at the same size. → { fixed: true, w, h, font, font2, la, lb, text, zh, tag }
export function fitLabel(label, w, h, o = {}) {
  const a = String(label?.text ?? ''), b = label?.zh && label.zh !== label.text ? String(label.zh) : '';
  const big = o.big || 92, small = o.small || 26, lines = o.lines || 2, pad = o.pad ?? 24, tag = label?.tag || '';
  const top = tag ? Math.round(Math.max(28, h * 0.18)) : 0;   // the chip's row
  const F = FRAME_FIXED, fv = 2 * (F.air + F.line) + F.shadow + 6;   // (the sticker's frame, top and bottom)
  let pick = null;
  for (let font = big; font >= small; font -= 2) {
    const font2 = Math.max(small, Math.round(font * 0.62));
    const la = wrapLines(a, w - pad * 2, font), lb = b ? wrapLines(b, w - pad * 2, font2) : [];
    const tooWide = la.some((l) => textWidth(l, font) > w - pad * 2) || lb.some((l) => textWidth(l, font2) > w - pad * 2);
    const H = la.length * font * 1.18 + (lb.length ? 10 + lb.length * font2 * 1.2 : 0);
    if (la.length <= lines && lb.length <= 2 && !tooWide && H <= h - top - Math.max(pad, fv)) { pick = { font, font2, la, lb }; break; }
    if (font - 2 < small) pick = { font: small, font2, la: la.slice(0, lines), lb: lb.slice(0, 2) };
  }
  return { fixed: true, w, h, text: a, zh: b, tag, top, ...pick, key: (tag ? tag + '|' : '') + 'F|' + a + '|' + b };
}

// the largest scale (from LEARN.m1.atlasScale down by quarters, never under 1) at which the gate's labels pack
export function fitAtlas(boxes, scale = M.atlasScale, max = M.atlasMax) {
  let P = packLabels(boxes, scale, max);
  while (!P.fits && scale > 1) { scale = Math.max(1, scale - 0.25); P = packLabels(boxes, scale, max); }
  P.scale = scale;
  return P;
}

// the sticker (LEARN §35 — the battle's name tags, styles/hud.css .iw-mk__tag): a dark ink outline, a solid shadow
// straight down, a pearl face (white at the top, a lilac shade at its foot, a light rim inside the outline: the arena's
// shader multiplies the face by her ink once it is the right one, by coral for a wrong one), the line in Titan One ink
export const STICKER = { k: '#15121c', top: '#fefdff', foot: '#dcd5ea', rim: 'rgba(255, 255, 255, 0.92)', en: '#15121c', zh: '#575070' };
// the runner's lane-wide plates (1 texel / px on a 1.4 m board) carry a heavier frame than a ball's (2 texels / px)
export const FRAME_FIXED = { line: 7, shadow: 7, tail: 0, air: 3, rad: 34 };
const TITAN = '"Titan One"';
let _asked = false;
// ask for the faces once, at the level load (PlayTargets, the runner's rows); a plate drawn before Titan One is in takes Rubik
export function labelFonts() {
  if (_asked || typeof document === 'undefined' || !document.fonts || !document.fonts.load) return;
  _asked = true;
  for (const f of [`400 40px ${TITAN}`, '800 40px Rubik', '600 40px Rubik']) document.fonts.load(f).catch(() => null);
}
const titanIn = () => { try { return typeof document !== 'undefined' && !!document.fonts && document.fonts.check(`400 40px ${TITAN}`); } catch (e) { return false; } };
// a line's face: Titan One for a Latin line (when it is in), Rubik / the system's CJK face, bold, for one with Chinese
export const enFont = (s, px, titan) => (titan && !zhCount(s) ? `400 ${px}px ${TITAN}, ${LABEL_FONT}` : `800 ${px}px ${LABEL_FONT}`);
export const zhFont = (s, px) => `600 ${px}px ${LABEL_FONT}`;

// the plate's outline: a rounded box with a tail up from its top middle (a ball's plate: it points at the ball)
function stickerPath(x, X, Y, w, h, r, tail) {
  r = Math.min(r, w / 2, h / 2);
  x.beginPath(); x.moveTo(X + r, Y);
  if (tail > 0) { const c = X + w / 2, tw = Math.min(w * 0.22, tail * 1.25); x.lineTo(c - tw, Y); x.lineTo(c, Y - tail); x.lineTo(c + tw, Y); }
  x.lineTo(X + w - r, Y); x.arcTo(X + w, Y, X + w, Y + r, r);
  x.lineTo(X + w, Y + h - r); x.arcTo(X + w, Y + h, X + w - r, Y + h, r);
  x.lineTo(X + r, Y + h); x.arcTo(X, Y + h, X, Y + h - r, r);
  x.lineTo(X, Y + r); x.arcTo(X, Y, X + r, Y, r);
  x.closePath();
}
// the body's box inside a W × H plate (the outline's centre line) and its corner radius: the shader's ring uses the same
export function stickerBody(W, H, F, tail) {
  const L = F.line, X = F.air + L / 2, Y = F.air + L / 2 + tail, w = W - 2 * X, h = H - Y - F.air - L / 2 - F.shadow;
  return { X, Y, w, h, r: Math.min(F.rad ?? 16, h * 0.42) };
}
export function sticker(x, W, H, F, tail = 0) {
  const S = STICKER, L = F.line, B = stickerBody(W, H, F, tail);
  x.save(); x.lineJoin = 'round';
  // the solid shadow, straight down (the HUD's hard drop)
  x.translate(0, F.shadow); stickerPath(x, B.X, B.Y, B.w, B.h, B.r, tail);
  x.fillStyle = S.k; x.fill(); x.lineWidth = L; x.strokeStyle = S.k; x.stroke();
  x.translate(0, -F.shadow);
  // the face, its foot a shade darker (a little thickness), a light rim just inside the outline
  stickerPath(x, B.X, B.Y, B.w, B.h, B.r, tail);
  const g = x.createLinearGradient(0, B.Y, 0, B.Y + B.h);
  g.addColorStop(0, S.top); g.addColorStop(0.55, S.top); g.addColorStop(1, S.foot);
  x.fillStyle = g; x.fill();
  x.save(); x.clip(); x.lineWidth = L + Math.max(2, L * 0.7); x.strokeStyle = S.rim; x.stroke(); x.restore();
  x.lineWidth = L; x.strokeStyle = S.k; x.stroke();
  x.restore();
  return B;
}
// the lane letter's badge (墨浪跑酷): a little ink pill in the plate's top-left corner, the letter in Titan One
function badge(x, X, Y, cs, tag, titan) {
  const w = cs * 1.3, r = cs * 0.5;
  x.save(); x.lineJoin = 'round';
  x.fillStyle = STICKER.k; roundRect(x, X, Y + cs * 0.12, w, cs, r); x.fill();
  x.fillStyle = '#2b2638'; roundRect(x, X, Y, w, cs, r); x.fill();
  x.lineWidth = Math.max(2, cs * 0.08); x.strokeStyle = 'rgba(255, 255, 255, 0.28)';
  roundRect(x, X + x.lineWidth, Y + x.lineWidth, w - 2 * x.lineWidth, cs - 2 * x.lineWidth, r - x.lineWidth); x.stroke();
  x.fillStyle = '#ffffff'; x.font = enFont(tag, Math.round(cs * (titan ? 0.66 : 0.72)), titan);
  x.fillText(tag, X + w / 2, Y + cs * 0.53);
  x.restore();
}
// a canvas measure for fitText / wrapLines in a given face
const measureIn = (x, face) => (s, px) => { x.font = face(s, px); return x.measureText(s).width; };

export function drawLabelAtlas(labels, opts = {}) {
  const P = fitAtlas(labels, opts.scale || M.atlasScale), scale = P.scale;
  const c = (opts.canvas || document.createElement('canvas'));
  c.width = P.w; c.height = P.h;
  const x = c.getContext('2d');
  x.clearRect(0, 0, P.w, P.h);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const titan = titanIn(), enFace = (s, px) => enFont(s, px, titan);
  const mA = measureIn(x, enFace), mB = measureIn(x, zhFont), S = STICKER;
  const f1 = U.font, f2 = U.font - 2;
  // lines centred down a box from y0 (a block of `rows`: [[lines, px, face, colour]…])
  const lines = (rows, cx, y0, lh, maxW) => {
    let y = y0;
    for (const [ls, px, face, col] of rows) {
      x.fillStyle = col;
      for (const ln of ls) { x.font = face(ln, px); x.fillText(ln, cx, y + px * lh / 2, maxW); y += px * lh; }
    }
  };
  const blockH = (rows, lh) => rows.reduce((n, [ls, px]) => n + ls.length * px * lh, 0);
  labels.forEach((l, i) => {
    const r = P.rects[i]; if (!r) return;
    const s = r.w / l.w;   // (= scale, or less when the sheet is full)
    x.save(); x.translate(r.x, r.y); x.scale(s, s);
    const W = l.w, H = l.h;
    if (l.fixed) {   // 墨浪跑酷's plate (fitLabel): the lines centred in the box, the lane letter in a badge at the top-left
      const F = FRAME_FIXED, B = sticker(x, W, H, F, 0), inner = W - 2 * (F.air + F.line) - 20;
      let a1 = l.font, a2 = l.font2;
      // (fitLabel measured with the estimate: the real faces may run wider — smaller, never past the box)
      while (a1 > 20 && (l.la || []).some((ln) => mA(ln, a1) > inner)) a1 -= 2;
      while (a2 > 16 && (l.lb || []).some((ln) => mB(ln, a2) > inner)) a2 -= 2;
      const rows = [[l.la || [], a1, enFace, S.en], [l.lb || [], a2, zhFont, S.zh]], lh = 1.19;
      if (l.tag) badge(x, B.X + F.line / 2 + 6, B.Y + F.line / 2 + 5, Math.max(22, l.top - 8), l.tag, titan);
      const top = l.top, total = blockH(rows, lh) + (rows[1][0].length ? 10 : 0);
      const y0 = B.Y + top + (B.h - top - total) / 2;
      lines([rows[0]], W / 2, y0, lh, inner);
      lines([rows[1]], W / 2, y0 + blockH([rows[0]], lh) + 10, lh, inner);
    } else if (l.banner) {
      const B = sticker(x, W, H, FRAME, 0), inner = W - 2 * frameX();
      const box = bannerBox(l, W);
      let la = box.la, lb = box.lb, a1 = f1, a2 = f2;
      // the real faces: the same wrap when it fits, else wrapped again (and a size smaller) so no line runs past the outline
      for (let k = 0; k < 3 && (la.some((ln) => mA(ln, a1) > inner) || lb.some((ln) => mB(ln, a2) > inner) || la.length + lb.length > box.la.length + box.lb.length); k++) {
        if (k) { a1 -= 1; a2 -= 1; }
        la = wrapLines(l.text, inner, a1, mA); lb = l.zh ? wrapLines(l.zh, inner, a2, mB) : [];
      }
      const rows = [[la, a1, enFace, S.en], [lb, a2, zhFont, S.zh]], lh = 1.28 * Math.min(1, (B.h - FRAME.line - 2) / Math.max(1, blockH(rows, 1.28)));
      lines(rows, W / 2, B.Y + (B.h - blockH(rows, lh)) / 2, lh, inner);
    } else {
      // a ball's plate: the tail up to the ball; the text fitted again in the real faces (smaller, the Chinese wrapped,
      // only then cut) into the box the layout gave it
      const F = FRAME, B = sticker(x, W, H, F, F.tail), inner = W - 2 * frameX(), room = B.h - F.line - 2 * F.padY;
      let T = plateText(l, f1, f2, inner, mA, mB);
      if (blockH([[T.a.lines, T.a.px], [T.b.lines, T.b.px]], F.lh) > room + 1 && l.zh) T = { ...T, b: fitText(l.zh, inner, f2, { measure: mB, lines: 1 }) };
      const rows = [[T.a.lines, T.a.px, enFace, S.en], [T.b.lines, T.b.px, zhFont, S.zh]];
      lines(rows, W / 2, B.Y + (B.h - blockH(rows, F.lh)) / 2, F.lh, inner);
    }
    x.restore();
  });
  const uv = P.rects.map((r) => (r ? [r.x / P.w, 1 - (r.y + r.h) / P.h, (r.x + r.w) / P.w, 1 - r.y / P.h] : [0, 0, 0, 0]));
  return { canvas: c, rects: P.rects, uv, scale, w: P.w, h: P.h, fits: P.fits, used: P.used };
}
