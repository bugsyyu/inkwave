// cine-polish (docs/LEARN.md §38): the last pieces of the learning layer in the original's language, finer —
//   · the boards (展板) are stickers like the §35 plates: an ink outline, a solid drop, a pearl face, ink letters, the title
//     in Titan One fitted into the width the layout gave it (never past it: smaller, then the layout's own face); the
//     layout — the board's size, its hotspots, so its framing and what the audits measure — is the same
//   · the game keyboard's caps are the original's input glyphs (ui.css .iw-key): cool white, ink outline, ink drop; a press
//     sinks into the drop on the same frame
//   · reduced motion: the strip, the verdict and the results card fade in (opacity, 150–200 ms) — nothing else moves
//   · the right plate carries a white tick on an ink badge (stamped on); a wrong one never does
// 用法：node --test tests/learn/cine-polish.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWeek, daySteps } from '../../src/learn/content.js';
import { approxMeasure } from '../../src/learn/play/board/text.js';
const THREE = await import('three');
const { layoutBoard, drawBoard, fitTitle, titleRuns, wordsSpec, soundsSpec, lessonSpec, noteSpec, passageSpec, echoSpec, signSpec, BOARD, BOARD_FRAME, INKS } = await import('../../src/learn/play/board/paint.js');
const { PlayTargets, TICK } = await import('../../src/learn/play/targets.js');

const src = (f) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const jsCss = (f) => { const s = src(f), a = s.indexOf('const CSS = `'); return s.slice(a, s.indexOf('`;', a)); };
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&');
const rule = (css, sel) => { const m = new RegExp('(?:^|[\\n}])\\s*' + esc(sel) + '\\s*\\{([^}]*)\\}').exec(css); assert.ok(m, `a rule for ${sel}`); return m[1]; };
const OUTLINE = /(?:^|[\s,:])0 0 0 [\d.]+px var\(--k\)/, DROP = /(?:^|[\s,:])0 [1-9][\d.]*px 0 [\d.]+px var\(--k\)/;

// every board the three weeks put up
const weeks = [await loadWeek(1), await loadWeek(2), await loadWeek(3)];
const SPECS = [];
weeks.forEach((w, wi) => { for (let d = 1; d <= 7; d++) for (const s of daySteps(w, d)) {
  const t = s.meta.type, tag = `w${wi + 1}d${d} ${s.id}`;
  if (t === 'words') { const rows = s.items.map((it) => ({ en: it.en, ipa: it.meta.ipaUs || it.meta.ipa, zh: it.meta.zhFull || it.zh })); for (let k = 0; k < rows.length; k += 5) SPECS.push([tag, wordsSpec(rows.slice(k, k + 5), k / 5 + 1, Math.ceil(rows.length / 5))]); }
  if (t === 'symbols') { const rows = s.items.map((it) => ({ ipa: it.en, name: it.meta.name, tip: it.meta.tip, examples: it.meta.examples })); for (let k = 0; k < rows.length; k += 2) SPECS.push([tag, soundsSpec(rows.slice(k, k + 2), k / 2 + 1, Math.ceil(rows.length / 2))]); }
  if (t === 'grammar' && s.meta.lesson) SPECS.push([tag, lessonSpec(s.title, s.meta.lesson)]);
  if (t === 'reading' && s.meta.passage) SPECS.push([tag, passageSpec(s.meta.passage)]);
  if (t === 'checkin') SPECS.push([tag, noteSpec(s.title, s.items[0].zh)]);
  if (t === 'speak') SPECS.push([tag, echoSpec(s.items[0])]);
  if (t === 'weekly' || t === 'placement') SPECS.push([tag, signSpec(t, s.title, s.items[0].zh)]);
} });

// a 2D context that records what is drawn: each fill / stroke with its style and the box of its path (translations
// applied), each fillText with its font; measureText: the layout's estimate, ×1.3 for Titan One (as wide as it runs)
function recorder() {
  const log = { fills: [], strokes: [], texts: [] };
  let path = null, tx = 0, ty = 0;
  const stack = [];
  const pt = (x, y) => { path = path || { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity }; path.x0 = Math.min(path.x0, x + tx); path.x1 = Math.max(path.x1, x + tx); path.y0 = Math.min(path.y0, y + ty); path.y1 = Math.max(path.y1, y + ty); };
  const grad = (kind) => ({ kind, stops: [], addColorStop(o, c) { this.stops.push([o, c]); } });
  const x = {
    font: '10px sans-serif', fillStyle: '#000', strokeStyle: '#000', lineWidth: 1, textAlign: 'left', textBaseline: 'alphabetic', lineJoin: 'miter', lineCap: 'butt',
    clearRect() {}, save() { stack.push([tx, ty]); }, restore() { [tx, ty] = stack.pop() || [0, 0]; }, translate(a, b) { tx += a; ty += b; }, rotate() {}, clip() {},
    beginPath() { path = null; }, moveTo: pt, lineTo: pt, closePath() {}, quadraticCurveTo(a, b, c, d) { pt(a, b); pt(c, d); },
    arc(cx, cy, r) { pt(cx - r, cy - r); pt(cx + r, cy + r); },
    fill() { log.fills.push({ style: this.fillStyle, box: path && { ...path } }); },
    stroke() { log.strokes.push({ style: this.strokeStyle, w: this.lineWidth, box: path && { ...path } }); },
    fillText(t, X, Y) { log.texts.push({ t, x: X + tx, y: Y + ty, font: this.font, style: this.fillStyle, w: this.measureText(t).width }); },
    measureText(t) { const m = /(\d+)px/.exec(this.font), px = m ? +m[1] : 10; return { width: approxMeasure(t, px) * (/Titan One/.test(this.font) ? 1.3 : 1) }; },
    createLinearGradient() { return grad('linear'); }, createRadialGradient() { return grad('radial'); },
  };
  return { x, log };
}

test('a board is a sticker: an ink outline, a solid drop under it, a pearl face, ink letters — nothing past the canvas, nothing over the outline', () => {
  const F = BOARD_FRAME;
  assert.ok(F.line >= 6 && F.line <= 10 && F.shadow >= 6 && F.shadow <= 10, 'the HUD\'s 2.5–3 px outline and drop once framed (~0.34 screen px per canvas px)');
  let n = 0;
  for (const [tag, spec] of SPECS) {
    const L = layoutBoard(spec), { x, log } = recorder();
    drawBoard(x, L, { ink: '#ff8a14', titan: true });
    // the drop first (ink, moved straight down), then the face (a gradient from white to the pearl's foot), the outline in ink
    const [drop, face] = log.fills;
    assert.equal(drop.style, INKS.text, `${tag}: the drop is ink`);
    assert.equal(drop.box.y0 - face.box.y0, F.shadow, `${tag}: straight down by ${F.shadow}`);
    assert.equal(drop.box.x0, face.box.x0, `${tag}: not sideways`);
    assert.equal(face.style.kind, 'linear'); assert.deepEqual(face.style.stops.map((s) => s[1]), [F.top, F.mid, F.foot]);
    assert.ok(log.strokes.some((s) => s.style === INKS.text && s.w === F.line), `${tag}: the ink outline`);
    for (const f of [...log.fills, ...log.strokes]) if (f.box) assert.ok(f.box.x0 >= -0.01 && f.box.y0 >= -0.01 && f.box.x1 <= L.W + 0.01 && f.box.y1 <= L.H + 0.01, `${tag}: drawn inside the canvas ${JSON.stringify(f.box)}`);
    // inside the outline's inner edge: every button, row, list dot and line of text
    const ix0 = F.air + F.line, iy0 = F.air + F.line, ix1 = L.W - F.air - F.line, iy1 = L.H - F.air - F.line - F.shadow;
    for (const op of L.ops) {
      const b = op.op === 'text' ? { x: op.x, y: op.y - op.px, w: approxMeasure(op.text, op.px), h: op.px * 1.2 } : op.op === 'icon' || op.op === 'dot' ? { x: op.x - op.r, y: op.y - op.r, w: 2 * op.r, h: 2 * op.r } : op;
      assert.ok(b.x >= ix0 && b.y >= iy0 && b.x + b.w <= ix1 && b.y + b.h <= iy1 + 0.5, `${tag}: ${op.op} ${op.text || op.label || ''} inside the outline`);
    }
    // ink letters only (no white glass text any more), dark enough on the pearl's foot (≥ 4.5 : 1)
    for (const t of log.texts) assert.ok(Object.values(INKS).includes(t.style), `${tag}: "${t.t}" in ${t.style}`);
    n++;
  }
  assert.ok(n > 150, n + ' boards');
  const lum = (h) => { const c = new THREE.Color(h); return 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b; };
  const ratio = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05);
  for (const c of Object.values(INKS)) assert.ok(ratio(c, F.foot) >= 4.5, `${c} on ${F.foot}: ${ratio(c, F.foot).toFixed(2)}`);
});

test('the title: Titan One for its Latin runs, the CJK face at 800 for its Chinese, fitted into its width; Rubik 800 (the layout\'s measure) before Titan One is in', () => {
  assert.deepEqual(titleRuns('单词 1 / 5').map((r) => [r.t, r.zh]), [['单词', true], [' 1 / 5', false]]);
  let titled = 0;
  for (const [tag, spec] of SPECS) {
    const L = layoutBoard(spec);
    for (const titan of [true, false]) {
      const { x, log } = recorder();
      drawBoard(x, L, { ink: '#2f5bff', titan });
      for (const op of L.ops.filter((o) => o.role === 'title')) {
        assert.ok(op.maxW > 0, `${tag}: the title knows its width`);
        const line = log.texts.filter((t) => Math.abs(t.y - op.y) < 0.01 && t.x >= op.x - 0.01);
        const w = line.reduce((n, t) => n + t.w, 0);
        assert.equal(line.map((t) => t.t).join(''), op.text, `${tag}: the whole title`);
        assert.ok(w <= op.maxW + 0.5, `${tag}: "${op.text}" ${w.toFixed(0)} ≤ ${op.maxW.toFixed(0)} (titan ${titan})`);
        for (const t of line) {
          if (/[⺀-鿿]/.test(t.t) || !titan) assert.match(t.font, /^800 \d+px Rubik/, `${tag}: "${t.t}" in the layout's face`);
          const px = +/(\d+)px/.exec(t.font)[1];
          assert.ok(px >= BOARD.minFont && px <= op.px, `${tag}: ${px} px`);
        }
        if (titan && line.some((t) => /Titan One/.test(t.font))) titled++;
      }
    }
  }
  assert.ok(titled > 40, `${titled} titles set in Titan One`);
  // too wide for Titan One even at 0.82 ×: the layout's face at full size (what the layout measured — it fits)
  const { x } = recorder();
  const long = 'Reading Comprehension Practice', maxW = approxMeasure(long, 74) * 1.02;
  const T = fitTitle(x, long, 74, maxW, true);
  assert.equal(T.titan, false); assert.equal(T.px, 74); assert.ok(T.w <= maxW);
  const S = fitTitle(x, 'My Day', 74, 900, true);
  assert.equal(S.titan, true); assert.equal(S.px, 74, 'a short one keeps its size');
});

test('the board\'s layout is the same: sizes, hotspots and every line where they were (the framing and the audits measure these)', () => {
  for (const [tag, spec] of SPECS) {
    const L = layoutBoard(spec);
    // (the roles only say how a line is drawn: the kicker on a tag, the title in Titan One)
    for (const op of L.ops) if (op.role) assert.ok(['kicker', 'title', 'label'].includes(op.role), tag);
    assert.ok(L.minFont >= BOARD.minFont && L.H <= 930, tag);
  }
  const src0 = src('src/learn/play/board/frame.js');
  assert.match(src0, /return \{ top: portrait \? 64 : 40, bottom: portrait \? 18 : 8, side: portrait \? 10 : 16, W, H \};/, 'boardBand as it was');
  // the board set asks for the faces and paints a board once more when Titan One comes in (same layout)
  const set = src('src/learn/play/board/set.js');
  assert.match(set, /labelFonts\(\);/);
  assert.match(set, /if \(entry\.gone \|\| !titanIn\(\)\) return;\s*drawBoard\(canvas\.getContext\('2d'\), layout, \{ ink: this\.inkHex, titan: true \}\); tex\.needsUpdate = true;/);
});

test('the game keyboard\'s caps: the original\'s .iw-key (cool white, ink outline, ink drop, a lilac lip); a press sinks into the drop on the same frame', () => {
  const C = jsCss('src/ui/play-keys.js'), k = rule(C, '.iw-pk__k');
  assert.match(k, /background: linear-gradient\(180deg, #fff, #ebe8f3\);/, 'the .iw-key white');
  assert.match(k, /color: var\(--k\);/);
  const bs = (/box-shadow:([^;]*)/.exec(k) || [])[1];
  assert.match(bs, OUTLINE); assert.match(bs, DROP); assert.match(bs, /inset 0 -3px 0 #c9c4d8/, 'the lilac lip');
  for (const old of ['#fbf8f0', '#ece6d8', '#b4ab98', '#272b34', '#23262e']) assert.ok(!C.includes(old), `no cream / tea any more (${old})`);
  for (const sel of ['.iw-pk__k.is-back', '.iw-pk__k.is-fire']) { const b = (/box-shadow:([^;]*)/.exec(rule(C, sel)) || [])[1]; assert.match(b, OUTLINE, sel); assert.match(b, DROP, sel); }
  const d = rule(C, '.iw-pk__k.is-down');
  assert.match(d, /transform: translateY\(3px\)/, 'it goes down by the drop');
  assert.match(d, /transition-duration: 0s;/, 'on the same frame');
  const db = (/box-shadow:([^;]*)/.exec(d) || [])[1];
  assert.match(db, OUTLINE); assert.ok(!DROP.test(db), 'the drop is gone (it sank into it)');
  // the boxes do not move: the outline and the drop are box-shadows, no border / margin / padding on a key
  assert.match(k, /border: 0; padding: 0; margin: 0;/);
  assert.match(src('src/ui/play-keys.js'), /el\.classList\.remove\('is-pop'\); el\.classList\.add\('is-down'\);/, 'the class goes on in pointerdown itself');
});

test('reduced motion: the strip, the verdict and the results card fade in (opacity only, 150–200 ms); nothing else moves', () => {
  const C = jsCss('src/ui/play-strip.js');
  const rm = /@media \(prefers-reduced-motion: reduce\) \{([^\n]*)\}/.exec(C)[1];
  const fade = /\.iw-ps__box\.is-enter, \.iw-ps\.is-verdict \.iw-ps__head::before, \.iw-ps\.is-verdict \.iw-ps__head, \.iw-ps\.is-verdict \.iw-ps__why \{ animation: iw-ps-fade \.(\d+)s linear backwards; \}/.exec(rm);
  assert.ok(fade, 'the strip and the verdict fade');
  assert.ok(+fade[1] * 10 >= 150 && +fade[1] * 10 <= 200, `${fade[1]}0 ms`);
  assert.match(C, /@keyframes iw-ps-fade \{ from \{ opacity: 0; \} \}/, 'opacity only');
  assert.match(rm, /\.iw-ps \* \{ transition: none !important; \} \.iw-ps \.iw-ps__note \{ transition: opacity \.18s linear !important; \}/, 'the note line fades, nothing else transitions');
  assert.ok(rm.includes('.iw-ps__box.is-flash .iw-ps__head { animation: none; }') || /\.iw-ps__box\.is-flash \.iw-ps__head[^{]*\{ animation: none; \}/.test(rm), 'no pop');
  const J = src('src/ui/play-strip.js');
  assert.match(J, /this\.on = true;\s*restartAnim\(this\.box, 'is-enter'\);/, 'the strip\'s entrance class goes on under reduced motion too (the CSS makes it a fade)');
  const H = src('styles/hud.css'), hm = H.slice(H.lastIndexOf('@media (prefers-reduced-motion: reduce) {\n  .iw-learn *'));
  const rf = /\.iw-learn \.iw-learn__rframe\.is-fade \{ animation: iw-learn-fade \.(\d+)s linear backwards !important; \}/.exec(hm);
  assert.ok(rf, 'the results card fades'); assert.ok(+rf[1] * 10 >= 150 && +rf[1] * 10 <= 200);
  assert.match(H, /@keyframes iw-learn-fade \{ from \{ opacity: 0; \} \}/);
  assert.match(hm, /\.iw-learn \*, \.iw-learn \*::before, \.iw-learn \*::after \{ animation: none !important; transition: none !important; \}/, 'the rest stays still');
  assert.match(src('src/ui/hud-learn.js'), /\} else restartAnim\(this\.rFrame, 'is-fade'\);/);
});

function rig(reduced = false) {
  const T = new PlayTargets({ scene: new THREE.Scene(), reduced });
  const A = { tex: null, uv: new Map([['L|a|', [0, 0, 0.5, 0.5]], ['L|b|', [0.5, 0.5, 1, 1]]]), box: new Map([['L|a|', { w: 90, h: 63 }], ['L|b|', { w: 61, h: 45 }]]) };
  const objs = [0, 1].map((i) => ({ i, kind: 'ball', key: i ? 'L|b|' : 'L|a|', x: i * 2, y: 1, z: -5, r: 0.5, plate: { x: i * 2, y: 0.2, z: -5, w: 0.9, h: 0.6 } }));
  T.show(A, objs, { right: new THREE.Vector3(1, 0, 0), up: new THREE.Vector3(0, 1, 0), back: new THREE.Vector3(0, 0, 1) });
  return T;
}
const step = (T, s, dt = 1 / 120) => { for (let i = 0; i < Math.round(s / dt); i++) T.update(dt); };

test('the right plate gets a white tick on an ink badge, stamped on with an overshoot; a wrong one never; reduced motion: there at once, fading in', () => {
  const T = rig();
  step(T, 0.6);
  assert.equal(T.plates.aBox.getW(0), 0, 'no badge on an idle plate');
  T.state(1, 'coral'); T.state(0, 'right');
  const seen = [];
  for (let i = 0; i < 60; i++) { T.update(1 / 120); seen.push(T.plates.aBox.getW(0)); assert.equal(T.plates.aBox.getW(1), 0, 'the coral one: no tick'); }
  assert.equal(seen[Math.floor(TICK.delay * 120) - 2], 0, 'after the plate\'s flash');
  const peak = Math.max(...seen);
  assert.ok(peak > 1.1 && peak < 1.2, `stamped on: 0 → ${peak.toFixed(2)} → 1`);
  assert.ok(Math.abs(seen[seen.length - 1] - 1) < 1e-6, 'settles at its size');
  step(T, 0.5);
  assert.equal(T.plates.aBox.getW(0), 1); assert.ok(T.plates.aState.getY(0) > 0.95, 'on her ink');
  assert.ok(!T.anim, 'and the per-frame work stops');
  // the badge sits inside the plate's quad, at its top-right corner, even on the narrowest plate (61 px)
  for (const w of [61, 90, 160]) { const cx = w - TICK.r - 1, r = TICK.r * peak; assert.ok(cx - r > w * 0.5 - 4 && cx + r <= w + 0.5, `${w}: inside`); }
  // the shader draws it only where aBox.w is set, in white on ink
  const S = src('src/learn/play/targets.js');
  assert.match(S, /if \(vBox\.w > 0\.001\) \{/);
  assert.match(S, /diffuseColor\.rgb = mix\(col, vec3\(1\.0\), tick \* k\);/, 'a white tick');
  assert.match(S, /customProgramCacheKey = \(\) => 'iw-play-plate-4'/, 'the plate program replaced, not added');
  // reduced motion: full size at once; the fade is her ink coming in (aState.y)
  const R = rig(true);
  R.update(1 / 120); R.state(0, 'right'); R.update(1 / 120);
  assert.equal(R.plates.aBox.getW(0), 1);
  assert.ok(R.plates.aState.getY(0) < 0.3, 'fading in with her ink');
  // a hit right one bursts: no badge
  const B = rig(); step(B, 0.6); B.burst(0); B.update(1 / 120);
  assert.equal(B.plates.aBox.getW(0), 0);
});

// (the main session's dpr-3 check of the merged dev branch: today's ring and glow covered its own 「第 3 天」)
test('the course map: every node\'s label hangs below its drawn ring and its tick sticker — today\'s (drawn 1.14 ×) too — over its ink and halo; the nodes stay ≥ 44 pt', () => {
  const C = src('styles/ui.css'), M = C.slice(C.indexOf('游戏为主体 第二期: the course map'));
  const lab = rule(M, '.iw-cmap__label');
  const m = /top: calc\(50% \+ \(var\(--ns\) \/ 2 \+ ([\d.]+)px\) \* var\(--nsc\)\);/.exec(lab);
  assert.ok(m, 'the label is hung from the node\'s size and scale'); assert.match(lab, /z-index: 1;/, 'over the node\'s ink and halo');
  const off = +m[1];
  const nsc = +/--nsc: ([\d.]+);/.exec(rule(M, '.iw-cmap__node.is-today'))[1];
  assert.match(rule(M, '.iw-cmap__node.is-today .iw-cmap__core'), /scale: var\(--nsc\);/, 'today is drawn at the scale its label is hung by');
  assert.match(rule(M, '.iw-cmap__node'), /--nsc: 1;/);
  const ringIn = -/inset: (-?[\d.]+)px/.exec(rule(M, '.iw-cmap__ring'))[1];
  // (a day node is 52–72 px, the 周考 64–88 px — it has no ring drawn and never the tick: no 「学完」 of its own, LEARN §34)
  for (const [ns, boss] of [[52], [60], [64], [72], [64, 1], [76, 1], [88, 1]]) for (const k of [1, nsc]) {
    const ring = (ns / 2 + ringIn) * (29 + 6.5 / 2) / 32 * k, tick = boss ? 0 : (0.6 * ns + 5.5) * k, top = (ns / 2 + off) * k;
    assert.ok(top >= ring + 3 && top >= tick + 2, `${ns} px × ${k}: the label ${top.toFixed(1)} under the ring ${ring.toFixed(1)} and the tick ${tick.toFixed(1)}`);
    assert.ok(top - ns / 2 * k <= 20, 'and still close to its node');
  }
  assert.ok(nsc > 1.1, 'today is the bigger one');
  assert.match(rule(M, '.iw-cmap'), /--ns: clamp\(52px, /, 'a node is ≥ 52 px (a thumb) on its side');
  assert.match(M, /\.iw-cmap \{ --u: min\(2\.2vw, 1\.1vh\); --ns: 60px; \}/, 'and 60 px upright');
});

// (§35 enlarged the letter inside a 37-texel chip, 0.66 → 0.8: the dpr-3 run shows it at ~4 px on a phone held upright —
// a dot. The badge itself is bigger now, riding over the plate's top edge, and the text keeps its room)
test('the runner\'s lane badge: ~1.7 × the old chip, half over the plate\'s top edge, the other half in the chip row the text keeps free — the text\'s room and the row\'s sheet as before', async () => {
  const { fitLabel, laneBadge, FRAME_FIXED: F } = await import('../../src/learn/play/atlas.js');
  const { PLATE } = await import('../../src/learn/play/runner/view.js');
  const B = laneBadge(PLATE.w);
  assert.ok(B.cs >= 37 * 1.6, `the badge ${B.cs} texels (the old chip 37)`);
  for (const [ph, big, lines] of [[PLATE.h, 92, 2], [PLATE.bannerH, 64, 4]]) {
    const L = fitLabel({ text: 'tour', zh: '旅行', tag: 'D' }, PLATE.w, ph, { big, small: 26, lines }), N = fitLabel({ text: 'tour', zh: '旅行', tag: '' }, PLATE.w, ph, { big, small: 26, lines });
    assert.equal(L.plate, ph); assert.equal(L.h, ph + B.tab, 'the cell is the tab taller'); assert.equal(N.h, ph, 'no tag: no tab');
    const bodyY = B.tab + F.air + F.line / 2;   // (drawLabelAtlas: the plate under the tab, the badge centred on its top edge)
    assert.ok(bodyY - B.cs / 2 >= 0, 'the badge inside its cell');
    assert.ok(B.cs / 2 + B.cs * 0.12 <= L.top - 4, `its lower half and drop (${(B.cs * 0.62).toFixed(1)}) inside the chip row (${L.top}) the text keeps free`);
  }
  const V = src('src/learn/play/runner/view.js');
  assert.match(V, /board\.scale\.set\(bw, bw \* \(\(ph \+ tab\) \/ PLATE\.w\), 1\); board\.position\.set\(0, h \* 0\.58 \+ \(row\.banner \? 0\.1 : 0\) \+ bw \* \(tab \/ PLATE\.w\) \/ 2, 0\.04\);/, 'the quad grows upwards by the tab: the plate stays where it was');
  assert.match(src('src/learn/play/atlas.js'), /x\.translate\(0, tab\); const B = sticker\(x, W, H - tab, F, 0\); x\.translate\(0, -tab\); B\.Y \+= tab;/);
});
