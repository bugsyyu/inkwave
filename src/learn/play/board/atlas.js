// play-3 — canvas drawing shared by the beat pads' labels, the boards, the echo booth and the flip cards
// (docs/PLAY.md §3 M3 / M6 / M7 / M8, §7: one CanvasTexture per gate, drawn ahead, freed when the gate opens).
//
//   FONT · fontsReady() → Promise    the HUD's faces (Rubik for Latin, the system's CJK face for Chinese); wait before drawing
//   packCells(sizes, maxW) → { W, H, rects }                         pure shelf packing (Node-tested)
//   makeAtlas(cells, { maxW }) → { tex, uv: Map(key → [u0, v0, u1, v1]), px: Map(key → { x, y, w, h }), canvas, W, H, dispose }
//       cells: [{ key, w, h, draw(ctx, x, y, w, h) }] — one canvas, each cell drawn once, uploaded once
//   roundRect(ctx, x, y, w, h, r) · fitFont(ctx, text, weight, maxPx, minPx, maxW) · glass(ctx, x, y, w, h, r, rim, rimW)
//   drawPadLabel(ctx, x, y, w, h, { en, zh, badge })                 a pad's label: dark glass, the word and its Chinese
import * as THREE from 'three';

export const FONT = "Rubik, 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', 'Noto Sans SC', 'Source Han Sans SC', 'WenQuanYi Zen Hei', 'Microsoft YaHei', system-ui, sans-serif";
export const GLASS = 'rgba(21, 18, 28, 0.9)';
export const TEXT = '#ffffff', MUTED = '#d6d0e4', DIM = '#a9a3b8';

let _fonts = null;
export function fontsReady() {
  if (_fonts) return _fonts;
  const d = typeof document !== 'undefined' ? document : null;
  _fonts = d && d.fonts && d.fonts.load
    ? Promise.all(['800 32px Rubik', '700 32px Rubik', '600 32px Rubik', '500 32px Rubik', '32px "Titan One"'].map((f) => d.fonts.load(f).catch(() => null))).then(() => true, () => true)
    : Promise.resolve(false);
  return _fonts;
}

// shelf packing: cells in the given order, left to right, a new shelf when the row is full (sizes in px)
export function packCells(sizes, maxW = 2048) {
  const rects = [];
  let x = 0, y = 0, rowH = 0, W = 0;
  for (const s of sizes) {
    const w = Math.ceil(s.w), h = Math.ceil(s.h);
    if (x > 0 && x + w > maxW) { x = 0; y += rowH + 2; rowH = 0; }
    rects.push({ x, y, w, h });
    x += w + 2; rowH = Math.max(rowH, h); W = Math.max(W, x - 2);
  }
  return { W: Math.max(1, W), H: Math.max(1, y + rowH), rects };
}

export function roundRect(x, X, Y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  x.beginPath();
  x.moveTo(X + r, Y); x.lineTo(X + w - r, Y); x.quadraticCurveTo(X + w, Y, X + w, Y + r);
  x.lineTo(X + w, Y + h - r); x.quadraticCurveTo(X + w, Y + h, X + w - r, Y + h);
  x.lineTo(X + r, Y + h); x.quadraticCurveTo(X, Y + h, X, Y + h - r);
  x.lineTo(X, Y + r); x.quadraticCurveTo(X, Y, X + r, Y);
  x.closePath();
}
// dark glass with a rim (her ink, or a neutral line), a soft top sheen
export function glass(x, X, Y, w, h, r, rim = 'rgba(255,255,255,0.16)', rimW = 3) {
  x.save();
  roundRect(x, X + rimW / 2, Y + rimW / 2, w - rimW, h - rimW, r);
  x.fillStyle = GLASS; x.fill();
  const g = x.createLinearGradient(0, Y, 0, Y + h * 0.5);
  g.addColorStop(0, 'rgba(255,255,255,0.07)'); g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g; x.fill();
  if (rimW > 0) { x.lineWidth = rimW; x.strokeStyle = rim; x.stroke(); }
  x.restore();
}
// the largest font px (maxPx … minPx) at which the text fits maxW; sets x.font
export function fitFont(x, text, weight, maxPx, minPx, maxW) {
  let px = maxPx;
  for (; px > minPx; px -= 2) { x.font = `${weight} ${px}px ${FONT}`; if (x.measureText(text).width <= maxW) return px; }
  x.font = `${weight} ${minPx}px ${FONT}`;
  return minPx;
}

/** one canvas texture holding every cell; null canvas (Node): a 1×1 placeholder texture and the same uv map */
export function makeAtlas(cells, opts = {}) {
  const pk = packCells(cells, opts.maxW || 2048);
  const uv = new Map(), px = new Map();
  cells.forEach((c, i) => {
    const r = pk.rects[i];
    px.set(c.key, r);
    uv.set(c.key, [r.x / pk.W, 1 - (r.y + r.h) / pk.H, (r.x + r.w) / pk.W, 1 - r.y / pk.H]);
  });
  const d = typeof document !== 'undefined' ? document : null;
  let tex, canvas = null;
  if (d) {
    canvas = d.createElement('canvas'); canvas.width = pk.W; canvas.height = pk.H;
    const x = canvas.getContext('2d');
    x.clearRect(0, 0, pk.W, pk.H);
    x.textBaseline = 'alphabetic';
    cells.forEach((c, i) => { const r = pk.rects[i]; x.save(); x.beginPath(); x.rect(r.x, r.y, r.w, r.h); x.clip(); c.draw(x, r.x, r.y, r.w, r.h); x.restore(); });
    tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
  } else {
    tex = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1); tex.needsUpdate = true;
  }
  return { tex, uv, px, canvas, W: pk.W, H: pk.H, dispose() { tex.dispose(); if (canvas) { canvas.width = canvas.height = 1; } } };
}

/** a pad's label cell: dark glass, a corner badge (the arrow and the letter), the English word, its Chinese */
export function drawPadLabel(x, X, Y, w, h, { en = '', zh = '', badge = '' } = {}, fonts = { en: 75, zh: 58 }) {
  glass(x, X + 4, Y + 4, w - 8, h - 8, h * 0.2, 'rgba(255,255,255,0.18)', 4);
  const pad = w * 0.07, inner = w - pad * 2;
  x.textAlign = 'center';
  // the badge sits in the top-left corner, small, so the word keeps the middle
  if (badge) {
    x.font = `800 ${Math.round(h * 0.17)}px ${FONT}`;
    x.fillStyle = 'rgba(255,255,255,0.12)';
    const bw = x.measureText(badge).width + h * 0.14, bh = h * 0.24;
    roundRect(x, X + w * 0.06, Y + h * 0.08, bw, bh, bh / 2); x.fill();
    x.fillStyle = DIM; x.textAlign = 'left'; x.fillText(badge, X + w * 0.06 + h * 0.07, Y + h * 0.08 + bh * 0.77);
    x.textAlign = 'center';
  }
  const enPx = fitFont(x, en, 800, fonts.en, Math.round(fonts.en * 0.55), inner);
  x.fillStyle = TEXT; x.fillText(en, X + w / 2, Y + h * 0.31 + enPx * 0.78);
  if (zh) { fitFont(x, zh, 600, fonts.zh, Math.round(fonts.zh * 0.62), inner); x.fillStyle = MUTED; x.fillText(zh, X + w / 2, Y + h * 0.88); }
}
