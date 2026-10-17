// 题即玩法 play-7 (docs/LEARN.md §26, PLAY §3 M4 / §8): the landscape typewriter over the SPLIT game keyboard.
//   · type/split.js splitFrame: the rig in the open column between the two pads (keys.js splitLayout) — every point of
//     the typewriter inside the column under its top, the sheet's ends on the screen and never over a pad, her head under
//     the keys' middle row; ≥ 240 px tall with ≥ 17 px letters on the phone sizes that leave the column ≥ 290 px
//     (measured here with frame.js's own projection, independently of the search)
//   · the letter size is one em of the line being typed (GLYPH_EM) — checked against deck-geo's DECK
//   · the stations (puzzle / runner / arena) frame landscape typing with it; the duel's name tags have a switch
// 用法：node --test tests/learn/*.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));   // `three` → vendor/ (no npm install here)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keyboardLayout } from '../../src/learn/play/type/keys.js';
import { splitFrame, glyphPx, GLYPH_EM, GLYPH_LINE, SPLIT, SPLIT_PTS, SHEET_ENDS } from '../../src/learn/play/type/split.js';
import { frameFor, projectRig, RIG_POINTS, FRAME } from '../../src/learn/play/type/frame.js';
import { typingColumn, hudBand } from '../../src/learn/play/landscape.js';
import { boardBand } from '../../src/learn/play/board/frame.js';

const src = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
// [name, w, h, safe, the column's top (the clock row's bottom, the browser audit measured 44), want: { h, glyph } | null]
const SCREENS = [
  ['the browser audit (no insets)', 844, 390, {}, 44, { h: 240, glyph: 17 }],
  ['iPhone 15 landscape', 844, 390, { left: 47, right: 47, bottom: 21 }, 44, { h: 240, glyph: 17 }],
  ['iPhone 15 Pro landscape', 852, 393, { left: 59, right: 59, bottom: 21 }, 44, { h: 240, glyph: 16 }],
  ['iPhone SE landscape', 667, 375, {}, 44, { h: 180, glyph: 11 }],
  ['desktop', 1280, 720, {}, 115, { h: 300, glyph: 20 }],
];
const toPx = (q, W, H) => [((q[0] + 1) / 2) * W, ((1 - q[1]) / 2) * H];

for (const [name, W, H, safe, top, want] of SCREENS) {
  test(`split frame · ${name} ${W}×${H}: the rig in the open column, her head under the middle row, ${want.h} px / ${want.glyph} px`, () => {
    const L = keyboardLayout({ w: W, h: H }, safe, 'word');
    assert.ok(L.split && L.mid);
    const col = { W, H, top, bottom: H, x0: L.mid.x0, x1: L.mid.x1, shelf: L.top };
    const t0 = Date.now(), f = splitFrame(col), ms = Date.now() - t0;
    assert.ok(f && f.fits, 'a frame fits');
    assert.ok(ms < 1500, `the search took ${ms} ms`);
    const a = W / H, P = (p) => toPx(projectRig(p, f.pos, f.look, f.fov, a), W, H);
    // the column holds the whole typewriter (frame.js's projection, not the search's numbers)
    let y0 = 1e9, y1 = -1e9;
    for (const p of SPLIT_PTS) {
      const [x, y] = P(p);
      assert.ok(x >= col.x0 && x <= col.x1, `x ${x.toFixed(0)} inside the column ${col.x0}…${col.x1}`);
      assert.ok(y >= top && y <= H, `y ${y.toFixed(0)} under the top ${top}`);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
    // the sheet at either end of the carriage's travel: on the screen, and over a pad only above the pads' top
    for (const p of SHEET_ENDS) {
      const [x, y] = P(p);
      assert.ok(x >= 0 && x <= W && y >= top, `the sheet's end on the screen (${x.toFixed(0)}, ${y.toFixed(0)})`);
      assert.ok(y <= L.top || (x >= col.x0 && x <= col.x1), `the sheet's end clear of the pads (${x.toFixed(0)}, ${y.toFixed(0)})`);
    }
    // her head under the keys' middle row, with play-fix's margin (the hair sits over RIG_POINTS.head)
    const hy = projectRig(RIG_POINTS.head, f.pos, f.look, f.fov, a)[1], ry = projectRig(RIG_POINTS.midRow, f.pos, f.look, f.fov, a)[1];
    assert.ok(hy < ry - SPLIT.headMargin + 1e-9, `head ${hy.toFixed(3)} under the middle row ${ry.toFixed(3)} − ${SPLIT.headMargin}`);
    const g = glyphPx(f, W, H);
    assert.ok(y1 - y0 >= want.h, `the typewriter is ${(y1 - y0).toFixed(0)} px tall (≥ ${want.h})`);
    assert.ok(g >= want.glyph, `a typed letter is ${g.toFixed(1)} px (≥ ${want.glyph})`);
    assert.ok(Math.abs(g - f.px.glyph) < 0.2 && Math.abs((y1 - y0) - f.px.h) < 1, 'the frame reports what it frames');
    assert.ok(f.fov <= FRAME.vfov && f.fov >= FRAME.vfov * SPLIT.minFov - 1e-6, `the zoom stays in range (fov ${f.fov})`);
    assert.ok(f.score <= SPLIT.cap + 0.05, `no bigger than the cap (${f.score})`);
  });
}

test('split frame vs the full-width keyboard at 844 × 390: the plate-to-typed-lines span ≥ 1.5×, the letters ≥ 1.25×', () => {
  const W = 844, H = 390, L = keyboardLayout({ w: W, h: H }, {}, 'word'), Lf = keyboardLayout({ w: W, h: H }, {}, 'word', { split: false });
  const f = splitFrame({ W, H, top: 44, bottom: H, x0: L.mid.x0, x1: L.mid.x1, shelf: L.top });
  const old = frameFor({ phase: 'type', aspect: W / H, kbFrac: Lf.h / H, topFrac: 44 / H });
  const span = (fr) => { const ys = [...RIG_POINTS.plate, RIG_POINTS.strike, ...RIG_POINTS.textLines, RIG_POINTS.typed10].map((p) => toPx(projectRig(p, fr.pos, fr.look, fr.fov, W / H), W, H)[1]); return Math.max(...ys) - Math.min(...ys); };
  assert.ok(span(f) >= 1.5 * span(old), `split ${span(f).toFixed(0)} px vs full width ${span(old).toFixed(0)} px`);
  assert.ok(glyphPx(f, W, H) >= 1.25 * glyphPx(old, W, H), `letters ${glyphPx(f, W, H).toFixed(1)} vs ${glyphPx(old, W, H).toFixed(1)} px`);
  // cached by its column: the same object again (the stations ask every 0.4 s)
  assert.equal(splitFrame({ W, H, top: 44, bottom: H, x0: L.mid.x0, x1: L.mid.x1, shelf: L.top }), f);
});

test('the letter measured is one em of the line being typed (deck-geo DECK; atlas letters at 0.78 of a cell)', async () => {
  const { DECK } = await import('../../src/learn/play/type/deck-geo.js');
  assert.ok(Math.abs(GLYPH_LINE.y - (DECK.platenAt.y + DECK.platenR * 0.62 + DECK.firstLine)) < 1e-6);
  assert.ok(Math.abs(GLYPH_LINE.z - (DECK.platenAt.z + 0.012)) < 1e-6);
  assert.ok(Math.abs(GLYPH_LINE.em - DECK.glyph * 0.78) < 1e-6);
  assert.ok(Math.abs((GLYPH_EM[1][1] - GLYPH_EM[0][1]) - GLYPH_LINE.em) < 0.002);
  const atlas = src('src/learn/play/type/atlas.js');
  assert.match(atlas, /cell \* 0\.78/, 'the atlas still draws letters at 0.78 of a cell');
});

test('landscape.js without a page: no column (portrait framing stays)', () => {
  assert.equal(typingColumn(null), null);
  assert.equal(typingColumn({ rect: () => ({ split: false, mid: null, top: 500 }) }), null);
});

test('the stations frame landscape typing in the column; the strip leaves it', () => {
  for (const f of ['src/learn/play/wire/type.js', 'src/learn/play/runner/glide.js', 'src/learn/play/arena/type.js']) {
    const s = src(f);
    assert.match(s, /splitFrame\(/, `${f} frames with splitFrame`);
    assert.match(s, /typingColumn\(/, `${f} reads the column`);
    assert.match(s, /ensureLandscapeCss\(/, `${f} has the landscape CSS`);
  }
  assert.match(src('src/learn/play/arena/type.js'), /classList\?\.remove\('is-typing'\)/, 'the arena strip leaves the corner when typing is over');
  const L = src('src/learn/play/landscape.js');
  assert.match(L, /\.iw-ps\.is-typing \.iw-ps__box \{ left: calc\(env\(safe-area-inset-left\) \+ 8px\)/, 'the typing strip goes to the top-left corner');
  assert.match(L, /max-height: 460px\) and \(orientation: landscape\)/, 'phones only: desktop keeps its layout');
});
