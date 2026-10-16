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
import { LEARN } from '../../config.js';
import { labelBox, bannerBox, isBanner } from './layout.js';

const U = LEARN.playUi, M = LEARN.m1;
export const LABEL_FONT = "'Rubik', 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', 'Noto Sans SC', 'Microsoft YaHei', system-ui, sans-serif";

export function gateLabels(items, promptOf, canPlay, bannerW = 340) {
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

// the largest scale (from LEARN.m1.atlasScale down by quarters, never under 1) at which the gate's labels pack
export function fitAtlas(boxes, scale = M.atlasScale, max = M.atlasMax) {
  let P = packLabels(boxes, scale, max);
  while (!P.fits && scale > 1) { scale = Math.max(1, scale - 0.25); P = packLabels(boxes, scale, max); }
  P.scale = scale;
  return P;
}

export function drawLabelAtlas(labels, opts = {}) {
  const P = fitAtlas(labels, opts.scale || M.atlasScale), scale = P.scale;
  const c = (opts.canvas || document.createElement('canvas'));
  c.width = P.w; c.height = P.h;
  const x = c.getContext('2d');
  x.clearRect(0, 0, P.w, P.h);
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const f1 = U.font, f2 = U.font - 2;
  labels.forEach((l, i) => {
    const r = P.rects[i]; if (!r) return;
    const s = r.w / l.w;   // (= scale, or less when the sheet is full)
    x.save(); x.translate(r.x, r.y); x.scale(s, s);
    const W = l.w, H = l.h, rad = Math.min(14, H * 0.32);
    x.fillStyle = l.banner ? 'rgba(14, 12, 22, 0.86)' : 'rgba(21, 18, 28, 0.9)';
    roundRect(x, 1, 1, W - 2, H - 2, rad); x.fill();
    x.lineWidth = 1.5; x.strokeStyle = 'rgba(255, 255, 255, 0.16)'; x.stroke();
    if (l.banner) {
      const box = bannerBox(l, W);
      let y = 10 + f1 * 0.64;
      x.fillStyle = '#ffffff'; x.font = `800 ${f1}px ${LABEL_FONT}`;
      for (const ln of box.la) { x.fillText(ln, W / 2, y, W - 24); y += f1 * 1.28; }
      x.fillStyle = '#c3bdd6'; x.font = `600 ${f2}px ${LABEL_FONT}`;
      for (const ln of box.lb) { x.fillText(ln, W / 2, y - (f1 - f2) * 0.3, W - 24); y += f2 * 1.28; }
    } else if (l.zh) {
      x.fillStyle = '#ffffff'; x.font = `800 ${f1}px ${LABEL_FONT}`; x.fillText(l.text, W / 2, 8 + f1 * 0.66, W - 16);
      x.fillStyle = '#c3bdd6'; x.font = `600 ${f2}px ${LABEL_FONT}`; x.fillText(l.zh, W / 2, 8 + f1 * 1.25 + f2 * 0.62, W - 16);
    } else {
      x.fillStyle = '#ffffff'; x.font = `800 ${f1}px ${LABEL_FONT}`; x.fillText(l.text, W / 2, H / 2 + 1, W - 16);
    }
    x.restore();
  });
  const uv = P.rects.map((r) => (r ? [r.x / P.w, 1 - (r.y + r.h) / P.h, (r.x + r.w) / P.w, 1 - r.y / P.h] : [0, 0, 0, 0]));
  return { canvas: c, rects: P.rects, uv, scale, w: P.w, h: P.h, fits: P.fits, used: P.used };
}
