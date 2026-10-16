// 字弹 M4 — the 3D ink word's pure parts (src/learn/play/type/inkword.js): the layout (a word stays one line, a sentence
// wraps and shrinks into its box, words never split), the mask sampler (never more blobs than the quality's cap, every
// blob on ink, inside the mask), the display marks for a dictation (which typed words match), and the camera frames.
// 用法：node --test tests/learn/*.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEARN } from '../../src/config.js';
import { frameFor, projectRig, RIG_POINTS } from '../../src/learn/play/type/frame.js';
const { layoutText, wrapText, sampleMask, typedMarks, wordSpans, wordBox } = await import('../../src/learn/play/type/inkword.js');
const { DECK } = await import('../../src/learn/play/type/deck-geo.js');

const T = LEARN.type;
const em = (s) => String(s).length * 0.56;   // a monospace stand-in for Titan One's advance

test('layout: a word is one full-size line; a dictation sentence wraps, shrinks and fits wordMaxW × wordMaxH', () => {
  const w = layoutText('beautiful', em);
  assert.equal(w.lines.length, 1); assert.equal(w.scale, 1);
  assert.ok(Math.abs(w.lineH - T.wordH) < 1e-9 && w.lineH >= 0.5 && w.lineH <= 0.7, 'letters 0.5–0.7 m tall');
  for (const s of ['I usually get up at seven o\'clock in the morning.', 'My brother and I walked to the station because the bus was late again today.', 'unfortunately']) {
    const L = layoutText(s, em);
    assert.ok(L.width <= T.wordMaxW + 1e-9, `${s}: ${L.width.toFixed(2)} m wide`);
    assert.ok(L.height <= T.wordMaxH + 1e-9, `${s}: ${L.height.toFixed(2)} m tall`);
    assert.equal(L.lines.join(' '), s.trim().split(/\s+/).join(' '), 'no word lost or split');
    assert.ok(L.scale <= 1 && L.scale > 0.2);
  }
  assert.deepEqual(wrapText('a b c', em, 100), ['a b c']);
  assert.deepEqual(wrapText('', em, 1), ['']);
  const box = wordBox('jump');
  assert.ok(box.w > 0 && box.h > 0 && box.lines === 1);
});

test('word spans cover each word of each line, in order', () => {
  const lines = ['i usually get', 'up at seven'];
  const sp = wordSpans(lines, em);
  assert.equal(sp.length, 6);
  assert.deepEqual(sp.map((s) => s.word), [0, 1, 2, 3, 4, 5]);
  for (let i = 1; i < sp.length; i++) if (sp[i].line === sp[i - 1].line) assert.ok(sp[i].x0 > sp[i - 1].x1);
});

function mask(w, h, fill) { const a = new Uint8Array(w * h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = fill(x, y) ? 255 : 0; return a; }

test('mask sampling: never more than the cap, every blob on ink, spacing adapts', () => {
  const W = 900, H = 240;
  const shapes = {
    full: () => true,
    strokes: (x, y) => (x % 60 < 18) || (y % 80 < 14),
    dots: (x, y) => ((x * 7919 + y * 104729) % 97) < 30,
    one: (x, y) => x > 400 && x < 430 && y > 100 && y < 140,
  };
  for (const cap of Object.values(T.blobs)) for (const [name, f] of Object.entries(shapes)) {
    const a = mask(W, H, f), S = sampleMask(a, W, H, cap, 1.2);
    assert.ok(S.n <= cap, `${name} cap ${cap}: ${S.n} blobs`);
    assert.ok(S.n > 0, `${name}: some blobs`);
    for (let k = 0; k < S.n; k++) {
      const x = S.pts[k * 2], y = S.pts[k * 2 + 1];
      assert.ok(x >= 0 && x < W && y >= 0 && y < H);
      assert.ok(a[(y | 0) * W + (x | 0)] > 127, 'on ink');
    }
  }
  const big = sampleMask(mask(W, H, shapes.full), W, H, 500), small = sampleMask(mask(W, H, shapes.one), W, H, 500, 1.2);
  assert.ok(big.spacing > small.spacing, 'a big text gets coarser blobs than a small one');
  assert.equal(sampleMask(new Uint8Array(100), 10, 10, 50).n, 0, 'an empty mask, no blobs');
  // the floor in metres: a short word does not turn into dust
  const floor = sampleMask(mask(W, H, shapes.one), W, H, 1000, 6);
  assert.ok(floor.spacing >= 6);
});

test('dictation marks: the typed words that match the reference (display only)', () => {
  assert.deepEqual(typedMarks('i usually get up at seven', "I usually get up at seven o'clock."), [true, true, true, true, true, true]);
  assert.deepEqual(typedMarks('i usualy get up at 7', 'I usually get up at seven.'), [true, false, true, true, true, false]);
  assert.deepEqual(typedMarks('', 'x'), []);
  assert.deepEqual(typedMarks("o'clock", "o’clock"), [true], 'curly and straight apostrophes are the same');
});

test('camera frames: typing and word frames fit their band at 390×844, 844×390 and 1280×720', () => {
  for (const [w, h] of [[390, 844], [844, 390], [1280, 720]]) {
    const aspect = w / h, kb = w < h ? 0.39 : (h <= 430 ? 0.44 : 0.24);
    const f = frameFor({ phase: 'type', aspect, kbFrac: kb });
    assert.ok(f.fits, `type ${w}×${h}`);
    const yLo = -1 + 2 * kb;
    for (const p of [...RIG_POINTS.plate, RIG_POINTS.strike, ...RIG_POINTS.textLines, RIG_POINTS.typed10]) {
      const [x, y, z] = projectRig(p, f.pos, f.look, f.fov, aspect);
      assert.ok(z > 0 && y > yLo && y < 1 && Math.abs(x) < 1, `type ${w}×${h}: ${p} on screen above the keyboard`);
    }
    const row = aspect > 1.4 ? [0, 1.16, 1.12] : RIG_POINTS.midRow;
    assert.ok(projectRig(RIG_POINTS.head, f.pos, f.look, f.fov, aspect)[1] < projectRig(row, f.pos, f.look, f.fov, aspect)[1], 'her head below the key rows she types on');
    const g = frameFor({ phase: 'word', aspect, word: { w: 3.2, h: 0.7, y: 2.4 } });
    assert.ok(g.fits, `word ${w}×${h}`);
  }
  // RIG_POINTS follow the deck the rig is built from
  assert.ok(Math.abs(RIG_POINTS.strike[1] - DECK.strike.y) < 0.02 && Math.abs(RIG_POINTS.strike[2] - DECK.strike.z) < 0.02, 'strike point');
});
