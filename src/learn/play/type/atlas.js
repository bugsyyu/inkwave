// 字弹 M4 — one glyph atlas for the whole rig: the keycap legends and the letters the type-bars print on the paper are
// the same cells (Titan One, the HUD's display face; ⌫ and 射 are drawn as icons so no CJK font is needed in WebGL).
// White glyphs on transparent; the shaders tint them (legend dark, paper ink neutral grey — never by correctness).
// glyphCell(key) is pure (Node tests); makeAtlas() needs a canvas (browser) and falls back to a blank 1×1 texture.
import * as THREE from 'three';
import { PRINTABLE } from './keys.js';

export const ATLAS = { cols: 8, rows: 5, cell: 128 };
/** cell order: the printable keys, then ⌫, 射, space (blank) — index + 1 is what the paper stores (0 = empty) */
export const GLYPH_KEYS = [...PRINTABLE, 'back', 'fire', ' '];
export function glyphCell(key) { const i = GLYPH_KEYS.indexOf(key); return i < 0 ? -1 : i; }

const FONT = '"Titan One", "Rubik", "Arial Rounded MT Bold", system-ui, sans-serif';

function drawIcon(x, key, cx, cy, s) {
  x.save(); x.translate(cx, cy); x.scale(s / 100, s / 100);
  x.lineJoin = 'round'; x.lineCap = 'round';
  if (key === 'back') {
    // ⌫: a chunky tag with an ✕ cut out
    x.beginPath(); x.moveTo(-44, 0); x.lineTo(-18, -28); x.lineTo(40, -28); x.quadraticCurveTo(48, -28, 48, -20); x.lineTo(48, 20); x.quadraticCurveTo(48, 28, 40, 28); x.lineTo(-18, 28); x.closePath(); x.fill();
    x.globalCompositeOperation = 'destination-out'; x.lineWidth = 11;
    x.beginPath(); x.moveTo(2, -12); x.lineTo(26, 12); x.moveTo(26, -12); x.lineTo(2, 12); x.stroke();
  } else if (key === 'fire') {
    // 射: an ink shell leaving a muzzle — a fat droplet with a speed swoosh
    x.beginPath(); x.moveTo(40, -2); x.bezierCurveTo(40, -26, 6, -34, -6, -16); x.bezierCurveTo(-14, -4, -12, 14, 4, 22); x.bezierCurveTo(22, 30, 40, 18, 40, -2); x.fill();
    x.lineWidth = 10;
    for (const [y, l] of [[-14, 26], [4, 34], [20, 22]]) { x.beginPath(); x.moveTo(-22, y); x.lineTo(-22 - l, y + 6); x.stroke(); }
    x.globalCompositeOperation = 'destination-out'; x.beginPath(); x.arc(20, -8, 7, 0, Math.PI * 2); x.fill();
  }
  x.restore();
}

/** Draw every cell into a canvas (re-run when the web font arrives). */
export function drawAtlas(cv) {
  const { cols, rows, cell } = ATLAS;
  cv.width = cols * cell; cv.height = rows * cell;
  const x = cv.getContext('2d');
  x.clearRect(0, 0, cv.width, cv.height);
  x.fillStyle = '#fff'; x.strokeStyle = '#fff';
  x.textAlign = 'center'; x.textBaseline = 'alphabetic';
  GLYPH_KEYS.forEach((k, i) => {
    const cx = (i % cols + 0.5) * cell, cy = (Math.floor(i / cols) + 0.5) * cell;
    if (k === 'back' || k === 'fire') { drawIcon(x, k, cx, cy, cell * 0.78); return; }
    if (k === ' ') return;
    // lowercase, sized so the widest letter (m, w) fits ~80 % of a cell; baseline puts x-height at the cell centre
    x.font = `${Math.round(cell * 0.78)}px ${FONT}`;
    const w = x.measureText(k).width, s = Math.min(1, (cell * 0.8) / Math.max(1, w));
    x.save(); x.translate(cx, cy + cell * 0.2); x.scale(s, 1); x.fillText(k, 0, 0); x.restore();
  });
  return cv;
}

let _atlas = null;
/** The shared atlas texture (one per page). Redraws itself once Titan One has loaded. */
export function getAtlas() {
  if (_atlas) return _atlas;
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) {
    _atlas = new THREE.DataTexture(new Uint8Array([0, 0, 0, 0]), 1, 1);
    _atlas.needsUpdate = true;
    return _atlas;
  }
  const cv = drawAtlas(doc.createElement('canvas'));
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.NoColorSpace;   // a coverage mask, not a colour
  t.anisotropy = 4; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter;
  _atlas = t;
  try {
    if (doc.fonts && doc.fonts.load) doc.fonts.load(`64px "Titan One"`).then(() => { drawAtlas(cv); t.needsUpdate = true; }).catch(() => {});
  } catch (e) { /* the fallback face stays */ }
  return t;
}
