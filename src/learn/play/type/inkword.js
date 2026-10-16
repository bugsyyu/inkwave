// 字弹 M4 — the 3D ink word: what she typed, made of glossy ink. The text is rasterised once (canvas), the glyph
// pixels are sampled on a hex grid into ink blobs (one InstancedMesh, INKWAVE's getInkMaterial with per-blob colour),
// and the blobs fly out of the shell's splash into the letters with springy, staggered motion. It is NEUTRAL grey until
// resolve() — the verdict comes from engine.judge through the flow, never from here:
//   right      the blobs burst outward in her team ink (fx.explosion, G.paint splats on the ground, splat_big)
//   wrong      the word turns coral (never the other team's colour), sags and drips; the right spelling assembles
//              above it in her team ink
//   dictation  `pct`: the words that match burst (that share of the blobs), the missed ones stay coral and sag; the
//              reference sentence assembles above, the tokens she missed in coral
// The blob count is bounded per quality (LEARN.type.blobs) so a dictation sentence costs what a word costs: one draw
// call, ≤ 2 × cap instances (her text + the correction).
//
//   const w = new InkWord({ scene, team, color, quality, reduced })
//   w.assemble(text, at, { from, face }) → Promise (letters formed)   at: centre of the word (Vector3); from: the impact
//                                                                      point; face: the point the word turns to (the rig)
//   w.resolve({ ok, pct, right, toks, typedOk }) → Promise (show done) — may be called before assembly ends (queued)
//   w.clear() · w.update(dt) · w.dispose() · w.phase ('idle' | 'assembling' | 'shown' | 'resolving' | 'done')
// Pure helpers (Node tests): layoutText, sampleMask, typedMarks, wordSpans.
import * as THREE from 'three';
import { G } from '../../../core/ctx.js';
import { LEARN } from '../../../config.js';
import { getInkMaterial } from '../../../game/character-mats.js';

const T = LEARN.type;
const V3 = THREE.Vector3;
const FONT = '"Titan One", "Rubik", "Arial Rounded MT Bold", system-ui, sans-serif';
const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new V3(), _s = new V3(), _c = new THREE.Color(), _e = new THREE.Euler();
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// ---------------------------------------------------------------------------------------------- pure layout
/** Split a text into lines that fit `maxW` (measure(str) → width in the same unit). Words never split unless a single
 *  word is wider than maxW (then it gets a line of its own and is scaled down by the caller). */
export function wrapText(text, measure, maxW) {
  const words = String(text).trim().split(/\s+/).filter(Boolean);
  const lines = []; let cur = '';
  for (const w of words) {
    const cand = cur ? cur + ' ' + w : w;
    if (!cur || measure(cand) <= maxW) cur = cand; else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

/** Lay a text out in metres: { lines, scale (0..1 of the one-line letter height), lineH, width, height }.
 *  measure(str) = width in em (font size 1). One line at full size when it fits, else wrap and shrink until the block
 *  fits maxW × maxH. */
export function layoutText(text, measure, o = {}) {
  const H = o.wordH ?? T.wordH, maxW = o.maxW ?? T.wordMaxW, maxH = o.maxH ?? T.wordMaxH, lead = o.lead ?? 1.18;
  let best = null;
  for (let s = 1; s >= 0.22; s -= 0.02) {
    const h = H * s, lines = wrapText(text, (str) => measure(str) * h, maxW);
    const width = Math.max(...lines.map((l) => measure(l) * h)), height = h * (1 + (lines.length - 1) * lead);
    best = { lines, scale: s, lineH: h, lead, width, height };
    if (width <= maxW + 1e-9 && height <= maxH + 1e-9) break;
  }
  return best;
}

/** Word spans per line in em, for a monospace-free measure: [{ line, word, x0, x1 }] (x from the line's left edge). */
export function wordSpans(lines, measure) {
  const out = []; let wi = 0;
  lines.forEach((l, li) => {
    const parts = l.split(' ');
    let x = 0;
    for (let k = 0; k < parts.length; k++) {
      const pre = parts.slice(0, k).join(' ') + (k ? ' ' : '');
      x = measure(pre);
      out.push({ line: li, word: wi++, x0: x, x1: x + measure(parts[k]) });
    }
  });
  return out;
}

/** Sample a coverage mask (Uint8 alpha, w × h, row 0 = top) on a hex grid into ≤ cap points. Spacing adapts: a short
 *  word gets fine blobs, a sentence coarser ones, the count never passes cap. → { pts: Float32Array [x, y]…, n, spacing } */
export function sampleMask(alpha, w, h, cap, minSpacing = 1.2) {
  let filled = 0;
  for (let i = 0; i < alpha.length; i++) if (alpha[i] > 127) filled++;
  if (!filled) return { pts: new Float32Array(0), n: 0, spacing: 0 };
  let sp = Math.max(minSpacing, Math.sqrt(filled / (cap * 0.866)));
  for (let tries = 0; tries < 12; tries++) {
    const rowH = sp * 0.866, pts = [];
    for (let r = 0, y = rowH / 2; y < h; r++, y += rowH) {
      const off = (r & 1) ? sp / 2 : 0;
      for (let x = off + sp / 2; x < w; x += sp) {
        if (alpha[(y | 0) * w + (x | 0)] > 127) pts.push(x, y);
      }
    }
    if (pts.length / 2 <= cap) return { pts: Float32Array.from(pts), n: pts.length / 2, spacing: sp };
    sp *= Math.sqrt((pts.length / 2) / cap) * 1.01;
  }
  return { pts: new Float32Array(0), n: 0, spacing: sp };
}

const norm = (w) => String(w).toLowerCase().replace(/[’‘]/g, "'").replace(/[^a-z0-9']/g, '');
/** Which typed words match the reference (an LCS over normalised words — display only; the verdict is the host's
 *  dictScore). → boolean[] per typed word. */
export function typedMarks(typed, ref) {
  const a = String(typed).trim().split(/\s+/).filter(Boolean).map(norm), b = String(ref).trim().split(/\s+/).filter(Boolean).map(norm);
  const n = a.length, m = b.length, dp = Array.from({ length: n + 1 }, () => new Int16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] && a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const ok = new Array(n).fill(false); let i = 0, j = 0;
  while (i < n && j < m) { if (a[i] && a[i] === b[j]) { ok[i] = true; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
  return ok;
}

// ---------------------------------------------------------------------------------------------- raster (browser)
let _cv = null;
function rasterise(lines, px, lead) {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return null;
  const cv = _cv || (_cv = doc.createElement('canvas')), x = cv.getContext('2d', { willReadFrequently: true });
  x.font = `${px}px ${FONT}`;
  const pad = Math.ceil(px * 0.2), widths = lines.map((l) => x.measureText(l).width);
  const W = Math.ceil(Math.max(...widths) + pad * 2), lh = px * lead, H = Math.ceil(px * 1.25 + (lines.length - 1) * lh + pad);
  cv.width = W; cv.height = H;
  x.font = `${px}px ${FONT}`; x.fillStyle = '#fff'; x.textBaseline = 'alphabetic'; x.textAlign = 'left';
  lines.forEach((l, i) => x.fillText(l, (W - widths[i]) / 2, pad + px * 0.95 + i * lh));
  const img = x.getImageData(0, 0, W, H).data, a = new Uint8Array(W * H);
  for (let i = 0; i < a.length; i++) a[i] = img[i * 4 + 3];
  const measure = (s) => x.measureText(s).width;
  return { alpha: a, w: W, h: H, pad, widths, lh, measure };
}
function emMeasure() {
  const doc = typeof document !== 'undefined' ? document : null;
  if (!doc) return (s) => String(s).length * 0.56;   // Node: Titan One's mean advance
  const cv = _cv || (_cv = doc.createElement('canvas')), x = cv.getContext('2d', { willReadFrequently: true });
  return (s) => { x.font = `100px ${FONT}`; return x.measureText(s).width / 100; };
}

/** The word's box in metres for a text (for frameFor({ phase: 'word', word })): { w, h, lines } */
export function wordBox(text, o = {}) {
  const L = layoutText(text, emMeasure(), o);
  return { w: L.width, h: L.height, lines: L.lines.length };
}

// ---------------------------------------------------------------------------------------------- the ink word
const ROWS = 2;   // instance ranges: 0 = her text, 1 = the correction

export class InkWord {
  constructor(o = {}) {
    this.scene = o.scene || G.scene || null;
    this.team = o.team ?? 0;
    this.color = new THREE.Color(o.color || (G.teamColors && G.teamColors[this.team]) || '#ff8a14');
    this.reduced = !!o.reduced;
    this.cap = o.cap || T.blobs[o.quality || G.settings?.quality || 'high'] || T.blobs.high;
    this.grey = new THREE.Color(T.word); this.coral = new THREE.Color(T.coral);
    const n = this.cap * ROWS;
    const geo = new THREE.IcosahedronGeometry(1, 1);
    this.mesh = new THREE.InstancedMesh(geo, getInkMaterial(new THREE.Color(1, 1, 1)), n);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.castShadow = true; this.mesh.receiveShadow = false; this.mesh.frustumCulled = false;
    this.mesh.count = 0; this.mesh.name = 'ink-word';
    for (let i = 0; i < n; i++) this.mesh.setColorAt(i, this.grey);
    // per blob: pos(3) vel(3) target(3) start delay, radius, word, state, colour mix, colour from/to (rgb ×2), drip
    this.P = new Float32Array(n * 3); this.Vv = new Float32Array(n * 3); this.Tg = new Float32Array(n * 3);
    this.delay = new Float32Array(n); this.rad = new Float32Array(n); this.word = new Int16Array(n); this.st = new Uint8Array(n);
    this.cmix = new Float32Array(n); this.cA = new Float32Array(n * 3); this.cB = new Float32Array(n * 3); this.drip = new Float32Array(n);
    this.age = new Float32Array(n); this.ux = new Float32Array(n);
    this.rows = [{ n: 0, words: 0, base: 0 }, { n: 0, words: 0, base: this.cap }];
    this.phase = 'idle'; this.t = 0; this.pending = null; this._assembled = null; this._resolved = null;
    this.anchor = new V3(); this.right = new V3(1, 0, 0); this.up = new V3(0, 1, 0); this.fwd = new V3(0, 0, -1);
    this.groundY = 0; this.splats = 0; this._cc = new V3();
    if (this.scene) this.scene.add(this.mesh);
  }

  /** Form `text` at `at` (centre), flying out of `from`, turned toward `face`. → Promise when the letters are formed. */
  assemble(text, at, o = {}) {
    const pend = this.pending;      // a verdict that came in while the shell flew waits for these letters
    this._reset();
    this.pending = pend;
    this.text = String(text || '');
    this.anchor.copy(at);
    this.groundY = o.groundY ?? (at.y - 2.4);
    const face = o.face || new V3(at.x, at.y, at.z - 1);
    this.fwd.set(face.x - at.x, 0, face.z - at.z); if (this.fwd.lengthSq() < 1e-6) this.fwd.set(0, 0, -1); this.fwd.normalize();
    // reading direction as seen from `face`: (−fwd) × up
    this.right.set(0, 0, 0).crossVectors(_p.copy(this.fwd).negate(), this.up).normalize();
    this.from = (o.from || at).clone();
    this._fill(0, this.text, this.anchor, this.grey, null, 0);
    this.phase = 'assembling'; this.t = 0;
    this._onFormed = o.onFormed || null;
    return new Promise((res) => { this._assembled = res; });
  }

  // lay out + rasterise + sample `text` into instance row r at centre c; colours per word from `marks` (true → team,
  // false → coral, null → base colour); `delay0` staggers the whole row
  _fill(r, text, c, base, marks, delay0, o = {}) {
    const row = this.rows[r], cap = this.cap, i0 = row.base;
    const em = emMeasure();
    const L = layoutText(text, em, o);
    const px = 96, ras = rasterise(L.lines, px, L.lead);
    row.n = 0; row.lines = L.lines; row.layout = L;
    if (!ras) return row;
    const m2px = L.lineH / px;                         // metres per raster pixel
    // juicy droplets, not dust: a floor on the spacing in metres (bigger on low quality), the cap does the rest
    const S = sampleMask(ras.alpha, ras.w, ras.h, cap, (cap <= T.blobs.low ? 0.05 : 0.04) * Math.max(0.6, L.scale) / m2px);
    const spans = wordSpans(L.lines, ras.measure);
    row.words = spans.length;
    const rad = S.spacing * m2px * 0.8;              // neighbours overlap: strokes read as one wet surface
    const cx = ras.w / 2, cy = ras.h / 2;
    let minX = Infinity, maxX = -Infinity;
    for (let k = 0; k < S.n; k++) { const x = S.pts[k * 2]; if (x < minX) minX = x; if (x > maxX) maxX = x; }
    for (let k = 0; k < S.n; k++) {
      const i = i0 + k, x = S.pts[k * 2], y = S.pts[k * 2 + 1];
      const lx = (x - cx) * m2px, ly = (cy - y) * m2px;
      const dz = (Math.sin(k * 12.9898) * 43758.5453 % 1) * 0.5;
      this.Tg[i * 3] = c.x + this.right.x * lx + this.fwd.x * dz * rad;
      this.Tg[i * 3 + 1] = c.y + ly;
      this.Tg[i * 3 + 2] = c.z + this.right.z * lx + this.fwd.z * dz * rad;
      // which word: its line from y, then the span the x falls in (centred line)
      const li = clamp(Math.floor((y - ras.pad) / ras.lh + 0.08), 0, L.lines.length - 1);
      const lineLeft = (ras.w - ras.widths[li]) / 2, ex = x - lineLeft;
      let wd = -1; for (const sp of spans) if (sp.line === li && ex >= sp.x0 - px * 0.15 && ex <= sp.x1 + px * 0.15) { wd = sp.word; break; }
      if (wd < 0) { for (const sp of spans) if (sp.line === li) { wd = sp.word; if (ex < sp.x1) break; } }
      this.word[i] = Math.max(0, wd);
      this.rad[i] = rad * (0.9 + 0.22 * ((k * 7919) % 13) / 13);
      const order = (x - minX) / Math.max(1, maxX - minX);
      this.ux[i] = order;
      this.delay[i] = delay0 + (this.reduced ? 0 : order * 0.45 + ((k * 3571) % 17) / 17 * 0.08);
      this.st[i] = 1; this.age[i] = 0; this.drip[i] = 0;
      // start: the splash point, a little scatter
      this.P[i * 3] = this.from.x + (((k * 31) % 7) - 3) * 0.04; this.P[i * 3 + 1] = this.from.y + (((k * 17) % 5) - 2) * 0.04; this.P[i * 3 + 2] = this.from.z;
      this.Vv[i * 3] = 0; this.Vv[i * 3 + 1] = 2.5 + ((k * 13) % 7) * 0.3; this.Vv[i * 3 + 2] = 0;
      const col = marks && marks[this.word[i]] != null ? (marks[this.word[i]] ? this.color : this.coral) : base;
      this.cA[i * 3] = col.r; this.cA[i * 3 + 1] = col.g; this.cA[i * 3 + 2] = col.b;
      this.cB[i * 3] = col.r; this.cB[i * 3 + 1] = col.g; this.cB[i * 3 + 2] = col.b; this.cmix[i] = 1;
      this.mesh.setColorAt(i, col);
    }
    row.n = S.n; row.spacing = S.spacing * m2px;
    // instances this row does not use stay invisible (a row-1 fill draws past row 0's end)
    _m.makeScale(0, 0, 0);
    for (let i = i0 + S.n; i < i0 + cap; i++) { this.st[i] = 0; this.mesh.setMatrixAt(i, _m); }
    this.mesh.count = Math.max(this.mesh.count, i0 + S.n);
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    return row;
  }

  /** The verdict (from engine.judge via the flow). Queued until the letters are formed. → Promise (show done). */
  resolve(v = {}, onDone) {
    const p = new Promise((res) => { this._resolved = res; });
    this._onDone = onDone || null;
    this.pending = v;
    if (this.phase === 'shown') this._apply();
    return p;
  }

  _apply() {
    const v = this.pending; this.pending = null;
    this.phase = 'resolving'; this.t = 0;
    const row = this.rows[0], i0 = row.base;
    const dict = v.pct != null && isFinite(v.pct);
    const words = this.text.trim().split(/\s+/).filter(Boolean);
    let ok;   // per typed word: burst (true) or coral (false)
    if (dict) ok = Array.isArray(v.typedOk) && v.typedOk.length === words.length ? v.typedOk.slice() : typedMarks(this.text, v.right || '');
    else ok = words.map(() => !!v.ok);
    if (dict && v.pct >= 100) ok = words.map(() => true);
    if (!dict && v.ok) ok = words.map(() => true);
    this.burstN = 0;
    const fx = G.fx, c = this.anchor;
    for (let k = 0; k < row.n; k++) {
      const i = i0 + k, good = !!ok[this.word[i]];
      this.st[i] = good ? 3 : 4;              // 3 burst, 4 coral sag
      this.age[i] = 0;
      this.cA[i * 3] = this._col(i, 0); this.cA[i * 3 + 1] = this._col(i, 1); this.cA[i * 3 + 2] = this._col(i, 2);
      const to = good ? this.color : this.coral;
      this.cB[i * 3] = to.r; this.cB[i * 3 + 1] = to.g; this.cB[i * 3 + 2] = to.b; this.cmix[i] = 0;
      if (good) {
        this.burstN++;
        // outward from the word's centre, up, a little toward the camera
        const dx = this.P[i * 3] - c.x, dy = this.P[i * 3 + 1] - c.y, dz = this.P[i * 3 + 2] - c.z;
        const l = Math.hypot(dx, dy, dz) || 1, sp = this.reduced ? 1.2 : 3.2 + ((k * 7) % 11) * 0.25;
        this.Vv[i * 3] = dx / l * sp + this.fwd.x * 0.5; this.Vv[i * 3 + 1] = dy / l * sp + 3.2; this.Vv[i * 3 + 2] = dz / l * sp + this.fwd.z * 0.5;
        this.delay[i] = this.reduced ? 0 : ((k * 977) % 23) / 23 * 0.12;
      } else {
        this.delay[i] = this.ux[i] * 0.25;
        // a few of the lowest blobs run: the word drips
        this.drip[i] = (this.Tg[i * 3 + 1] - c.y < -0.24 * row.layout.lineH) && ((k * 7) % 11 === 0) ? 0.6 + ((k * 13) % 7) / 10 : 0;
      }
    }
    const anyGood = this.burstN > 0, anyBad = this.burstN < row.n;
    const verdictOk = dict ? v.pct >= 100 : !!v.ok;
    // her ink lands under the word: one big splat on the ground there (the flung blobs add their own small ones)
    if (anyGood && G.paint?.splat) {
      const r = Math.min(2.2, 0.7 + row.layout.width * 0.35) * (this.burstN / Math.max(1, row.n));
      if (r > 0.3) G.paint.splat(_p.set(c.x, this.groundY + 0.1, c.z), r, this.team, { seed: 0.37 });
    }
    if (anyGood && fx) {
      if (this.reduced) fx.ring?.(c, _p.set(0, 1, 0), this.color, { radius: 1.6, life: 0.4 });
      else {
        fx.explosion?.(c, this.color, verdictOk ? 1.6 : 1.1);
        // a couple more pops along the word so a long word bursts end to end
        const half = row.layout.width / 2;
        for (const f of [-0.6, 0.6]) if (half > 0.8) fx.explosion?.(_p.copy(c).addScaledVector(this.right, f * half), this.color, 0.9);
      }
    }
    // sounds (CONTRACTS §2, LEVELS §5): the splash for the ink that bursts, the gate chime for a pass (a dictation
    // passes at 80 % — it still shows the words she missed), the soft ui_back for a miss — never ui_error
    if (anyGood) this._play('splat_big', { pos: c, volume: 0.9 });
    if (v.ok || verdictOk) this._play('refill_full', { volume: 0.6 });
    else if (anyBad) this._play('ui_back', { volume: 0.6 });
    // the correction: the right text above, her team ink; dictation marks the tokens she missed in coral
    if (!verdictOk && v.right) {
      const lift = row.layout.height / 2 + 0.22;
      let marks = null;
      if (dict) {
        const refWords = String(v.right).trim().split(/\s+/).filter(Boolean);
        if (Array.isArray(v.toks) && v.toks.length === refWords.length) marks = v.toks.map((t) => t.ok !== false);
        else marks = typedMarks(v.right, this.text);
      }
      const corr = this._fill(1, v.right, this._cc.copy(c).setY(c.y + lift), this.color, marks, 0.35, { maxH: 1.2 });
      // the correction row sits above: shift it by half its own height
      const up = corr.layout ? corr.layout.height / 2 : 0.3;
      for (let k = 0; k < corr.n; k++) { const i = corr.base + k; this.Tg[i * 3 + 1] += up; this.P[i * 3] = c.x + (this.P[i * 3] - this.from.x); this.P[i * 3 + 1] = c.y; this.P[i * 3 + 2] = c.z; }
      this.mesh.count = corr.base + corr.n;
    }
    this.splats = 0;
  }
  _col(i, ch) {
    const m = this.cmix[i];
    return this.cA[i * 3 + ch] + (this.cB[i * 3 + ch] - this.cA[i * 3 + ch]) * m;
  }

  _reset() { for (const r of this.rows) r.n = 0; this.mesh.count = 0; this.phase = 'idle'; }
  /** Remove the word (springs it away: blobs shrink back into the ground; now = at once). Promises still waiting on
   *  this word settle now, so a flow that moves on never hangs. */
  clear(now = false) {
    const ra = this._assembled, rr = this._resolved, fa = this._onFormed, fd = this._onDone;
    this._assembled = this._resolved = this._onFormed = this._onDone = null;
    fa && fa(); ra && ra(); fd && fd(); rr && rr();
    this.pending = null;
    if (now) { this._reset(); return; }
    for (let i = 0; i < this.mesh.count; i++) if (this.st[i] && this.st[i] !== 5) { this.st[i] = 6; this.age[i] = 0; }
    this.phase = 'done';
  }

  _play(name, o) { G.audio?.play?.(name, o); }

  update(dt) {
    if (!(dt > 0) || this.phase === 'idle' || (this.phase === 'done' && !this.mesh.count)) return;
    dt = Math.min(dt, 0.05);
    this.t += dt;
    const n = this.mesh.count, P = this.P, V = this.Vv, Tg = this.Tg;
    let formed = 0, total = 0, live = 0;
    const k = this.reduced ? 220 : 130, z = this.reduced ? 1 : 0.5, w = Math.sqrt(k), c2 = 2 * z * w;
    for (let i = 0; i < n; i++) {
      const s = this.st[i]; if (!s) continue;
      let scale = this.rad[i], sy = 1;
      this.age[i] += dt;
      if (s === 1 || s === 2) {
        // assembling (1) → formed (2): a spring to the target after the delay; hidden before it
        total++; live++;
        if (this.age[i] < this.delay[i]) { scale = 0; }
        else {
          const g = Math.min(1, (this.age[i] - this.delay[i]) * 6);
          for (let a = 0; a < 3; a++) {
            const j = i * 3 + a, acc = -k * (P[j] - Tg[j]) - c2 * V[j];
            V[j] += acc * dt; P[j] += V[j] * dt;
          }
          scale *= g;
          const d = Math.abs(P[i * 3] - Tg[i * 3]) + Math.abs(P[i * 3 + 1] - Tg[i * 3 + 1]) + Math.abs(P[i * 3 + 2] - Tg[i * 3 + 2]);
          if (d < 0.02 && g >= 1) { formed++; this.st[i] = 2; }
          // a stretched droplet while it flies
          const sp = Math.hypot(V[i * 3], V[i * 3 + 1], V[i * 3 + 2]); sy = 1 + Math.min(1.2, sp * 0.12);
          // idle breathing once formed
          if (s === 2 && !this.reduced) scale *= 1 + 0.06 * Math.sin(this.t * 3 + i * 0.37);
        }
      } else if (s === 3) {
        // burst: ballistic, colour to her team, shrinking; a few land as paint
        if (this.age[i] >= this.delay[i]) {
          V[i * 3 + 1] -= 16 * dt;
          for (let a = 0; a < 3; a++) P[i * 3 + a] += V[i * 3 + a] * dt;
          const life = this.age[i] - this.delay[i];
          scale *= Math.max(0, 1.25 - life * 0.9);
          this.cmix[i] = Math.min(1, life * 8);
          if (P[i * 3 + 1] < this.groundY + 0.05 || scale <= 0.001) {
            if (this.splats < 14 && (i % 9 === 0) && G.paint?.splat) { this.splats++; G.paint.splat(_p.set(P[i * 3], this.groundY + 0.1, P[i * 3 + 2]), 0.35 + (i % 3) * 0.12, this.team, { seed: (i * 0.618) % 1 }); }
            this.st[i] = 5; scale = 0;
          } else live++;
        } else { this.cmix[i] = 0; live++; }
        sy = 1 + Math.min(1, Math.hypot(V[i * 3], V[i * 3 + 1], V[i * 3 + 2]) * 0.06);
      } else if (s === 4) {
        // coral sag: turn coral, slump a little (more in the middle of each word), drippers run down
        live++;
        this.cmix[i] = Math.min(1, Math.max(0, this.age[i] - this.delay[i]) * 3.5);
        // a smooth droop: the middle of the word slumps most (a wet word losing its shape), the ends hold
        const u = this.ux[i], sag = (this.reduced ? 0.03 : 0.1) * Math.sin(Math.PI * u) * (0.5 + 0.5 * Math.min(1, this.rad[i] * 30));
        const tgtY = Tg[i * 3 + 1] - sag * Math.min(1, Math.max(0, this.age[i] - this.delay[i]) * 1.6);
        P[i * 3 + 1] += (tgtY - P[i * 3 + 1]) * Math.min(1, dt * 6);
        P[i * 3] += (Tg[i * 3] - P[i * 3]) * Math.min(1, dt * 6); P[i * 3 + 2] += (Tg[i * 3 + 2] - P[i * 3 + 2]) * Math.min(1, dt * 6);
        if (this.drip[i] > 0 && !this.reduced) {
          // a drip: stretches down from its blob and runs a little, then hangs
          const dl = Math.min(1, Math.max(0, this.age[i] - this.delay[i] - 0.3) * 0.9) * this.drip[i];
          sy = 1 + dl * 2.2; P[i * 3 + 1] = Math.min(P[i * 3 + 1], tgtY - dl * this.rad[i] * 2.2);
        }
      } else if (s === 6) {
        // clearing: shrink away
        scale *= Math.max(0, 1 - this.age[i] * 3);
        if (scale <= 0.001) { this.st[i] = 0; scale = 0; } else live++;
      } else continue;
      _p.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]);
      _s.set(scale / Math.sqrt(sy), scale * sy, scale / Math.sqrt(sy));
      _m.compose(_p, _q.identity(), _s);
      this.mesh.setMatrixAt(i, _m);
      if (s !== 1 && s !== 2) { _c.setRGB(this._col(i, 0), this._col(i, 1), this._col(i, 2)); this.mesh.setColorAt(i, _c); }
    }
    if (n) {
      this.mesh.instanceMatrix.needsUpdate = true;
      if (this.mesh.instanceColor && this.phase !== 'assembling' && this.phase !== 'shown') this.mesh.instanceColor.needsUpdate = true;
    }
    if (this.phase === 'assembling' && (formed >= total * 0.97 || this.t > 2.2)) {
      this.phase = 'shown';
      for (let i = 0; i < n; i++) if (this.st[i] === 1) this.st[i] = 2;
      const r = this._assembled, f = this._onFormed; this._assembled = null; this._onFormed = null;
      f && f(); r && r();
      if (this.pending) this._apply();
    } else if (this.phase === 'resolving' && this.t >= T.verdictS) {
      this.phase = 'done';
      const r = this._resolved, f = this._onDone; this._resolved = null; this._onDone = null;
      f && f(); r && r();
    }
    if (this.phase === 'done' && !live) this.mesh.count = 0;
  }

  /** compile the blob material against the game scene's lights, in place (the gate flow warms it with the rig) */
  warm(renderer, camera, target = this.scene) {
    const cnt = this.mesh.count; this.mesh.count = Math.max(1, cnt);
    try { return renderer.compileAsync ? renderer.compileAsync(this.mesh, camera, target || null) : Promise.resolve(renderer.compile(this.mesh, camera, target || null)); }
    finally { this.mesh.count = cnt; }
  }

  dispose() { this.mesh.parent?.remove(this.mesh); this.mesh.geometry.dispose(); this.mesh.dispose(); }
}
