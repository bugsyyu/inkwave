// 墨浪跑酷 — a curtain's label: the option (English or a word's meaning) and its Chinese, drawn on a CanvasTexture.
// One small function on purpose: play-1's label atlas (src/learn/play/, one CanvasTexture per gate, ≤ 1024 × 512 —
// PLAY §7) replaces it later. The contract: labelTexture({ en, zh, banner, tag }, opts) → { tex, aspect, dispose }.
// The HUD's own fonts (Rubik for Latin, the system CJK face), white on dark glass with a rim — legible on a phone.
import * as THREE from 'three';

const FONT_CJK = "'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', 'Noto Sans SC', 'Microsoft YaHei', system-ui, sans-serif";
const FONT_EN = "'Rubik', " + FONT_CJK;
const CJK = /[⺀-鿿豈-﫿＀-￯　-〿]/;

// greedy word wrap (CJK breaks anywhere) into at most `max` lines at this font; the last line ends in … if it overflows
function wrap(x, text, width, max) {
  const words = CJK.test(text) ? [...text] : String(text).split(/(\s+)/).filter((w) => w.length);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const t = cur + w;
    if (x.measureText(t.trim()).width <= width || !cur.trim()) { cur = t; continue; }
    lines.push(cur.trim()); cur = w.trim() ? w : '';
    if (lines.length === max) break;
  }
  if (lines.length < max && cur.trim()) lines.push(cur.trim());
  if (lines.length === max) {
    const used = lines.join(CJK.test(text) ? '' : ' ').replace(/\s+/g, ' ').length;
    if (used < String(text).replace(/\s+/g, ' ').trim().length) {
      let l = lines[max - 1];
      while (l.length > 1 && x.measureText(l + '…').width > width) l = l.slice(0, -1);
      lines[max - 1] = l + '…';
    }
  }
  return lines;
}

// the largest font size (from `big` down to `small`) at which `text` fits `width` in `max` lines
function fit(x, text, weight, family, big, small, width, max) {
  for (let px = big; px >= small; px -= 2) {
    x.font = `${weight} ${px}px ${family}`;
    const lines = wrap(x, text, width, max);
    if (!lines.some((l) => l.endsWith('…')) && lines.every((l) => x.measureText(l).width <= width)) return { px, lines };
  }
  x.font = `${weight} ${small}px ${family}`;
  return { px: small, lines: wrap(x, text, width, max) };
}

export function labelTexture({ en = '', zh = '', banner = false, tag = '' } = {}, opts = {}) {
  const W = 512, H = banner ? 448 : 320, pad = 28;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const x = c.getContext('2d');
  const rim = opts.rim || '#e9e5f4';
  x.fillStyle = 'rgba(21, 18, 28, 0.86)'; x.strokeStyle = rim; x.lineWidth = 10;
  x.beginPath(); if (x.roundRect) x.roundRect(6, 6, W - 12, H - 12, 40); else x.rect(6, 6, W - 12, H - 12); x.fill(); x.stroke();
  x.textAlign = 'center'; x.textBaseline = 'middle';
  const top = tag ? 64 : pad, width = W - pad * 2;
  if (tag) {   // the lane's letter (the strip lists the options by it on a phone)
    x.fillStyle = rim; x.font = `800 40px ${FONT_EN}`; x.fillText(tag, W / 2, 40);
  }
  const mainCjk = CJK.test(en);
  const main = fit(x, en, 800, mainCjk ? FONT_CJK : FONT_EN, banner ? 64 : (mainCjk ? 112 : 92), 30, width, banner ? 4 : 2);
  const sub = zh ? fit(x, zh, 600, FONT_CJK, banner ? 50 : 60, 26, width, 2) : { px: 0, lines: [] };
  const lh = main.px * 1.12, sh = sub.px * 1.18, gap = sub.lines.length ? 16 : 0;
  const total = main.lines.length * lh + gap + sub.lines.length * sh;
  let y = top + (H - top - pad - total) / 2 + lh / 2;
  x.fillStyle = '#ffffff'; x.font = `800 ${main.px}px ${mainCjk ? FONT_CJK : FONT_EN}`;
  for (const l of main.lines) { x.fillText(l, W / 2, y); y += lh; }
  y += gap - lh / 2 + sh / 2;
  x.fillStyle = '#cfc9dc'; x.font = `600 ${sub.px}px ${FONT_CJK}`;
  for (const l of sub.lines) { x.fillText(l, W / 2, y); y += sh; }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4; tex.generateMipmaps = true;
  return { tex, aspect: H / W, dispose: () => tex.dispose() };
}
