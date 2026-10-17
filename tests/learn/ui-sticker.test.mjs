// ui-sticker (docs/LEARN.md §32): the learning layer's own DOM wears INKWAVE's sticker look — the original HUD / menus'
// hard ink outline (`0 0 0 Npx var(--k)`), the solid ink shadow dropped under it (`0 Npx 0 Npx var(--k)`), the verdict
// on a ribbon (hud.css .iw-call__ribbon), the results card with the results screen's splat — and never goes back to
// the dark glass it had (a faint 1.5 px white border, a soft blur shadow, no ink edge). Read off the CSS text: the
// strip, the results card, the bag and the walk bar at least, and every learning-layer file that carries CSS.
// 用法：node --test tests/learn/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (f) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const jsCss = (f) => { const s = src(f), a = s.indexOf('const CSS = `'); assert.ok(a >= 0, `${f} has a CSS block`); return s.slice(a, s.indexOf('`;', a)); };
const hudCss = () => { const s = src('styles/hud.css'), a = s.indexOf("关卡学习: the level's layer"); assert.ok(a > 0, 'hud.css has the level\'s layer'); return s.slice(a); };
const esc = (t) => t.replace(/[.*+?^${}()|[\]\\:]/g, '\\$&');
// the declarations of the first rule whose selector is exactly `sel`
function rule(css, sel) {
  const m = new RegExp('(?:^|[\\n}])\\s*' + esc(sel) + '\\s*\\{([^}]*)\\}').exec(css);
  assert.ok(m, `a rule for ${sel}`);
  return m[1];
}
// a box-shadow with the ink outline and the dropped ink shadow — written out, or through the layer's --ol token
const OUTLINE = /(?:^|[\s,:])0 0 0 [\d.]+px var\(--k\)/, DROP = /(?:^|[\s,:])0 [1-9][\d.]*px 0 [\d.]+px var\(--k\)/;
function shadow(css, sel) {
  const d = rule(css, sel), b = (/box-shadow:([^;]*)/.exec(d) || [])[1] || '';
  const ol = (/--ol:([^;]*)/.exec(css) || [])[1] || '';
  return b.replace(/var\(--ol\)/g, ol);
}
function sticker(css, sel, what) {
  const b = shadow(css, sel);
  assert.match(b, OUTLINE, `${what}: the ink outline (${sel})`);
  assert.match(b, DROP, `${what}: the ink shadow dropped under it (${sel})`);
}
const px = (d, prop) => +((new RegExp('(?:^|;|\\s)' + prop + ':\\s*([\\d.]+)px').exec(d) || [])[1] || NaN);
const fontPx = (d) => { const f = px(d, 'font-size'); return Number.isFinite(f) ? f : +((/font:\s*\d+\s+([\d.]+)px/.exec(d) || [])[1] || NaN); };

const FILES = ['src/ui/play-strip.js', 'src/learn/forms/ui.js', 'src/learn/play/board/strip.js', 'src/learn/play/runner/tips.js', 'src/learn/play/wire/type.js', 'src/learn/play/landscape.js'];

test('the question strip: a sticker box, a sticker ▶, chip and buttons; the verdict on a ribbon (her ink / coral)', () => {
  const C = jsCss('src/ui/play-strip.js');
  sticker(C, '.iw-ps__box', 'the strip');
  sticker(C, '.iw-ps__play', '▶');
  sticker(C, '.iw-ps__tag', 'the chip');
  sticker(C, '.iw-ps__act', 'the verdict\'s buttons');
  sticker(C, '.iw-ps__note', 'the note line');
  const rib = rule(C, '.iw-ps__head::before');
  assert.match(rib, /background: var\(--self\)/, 'the ribbon is her ink');
  assert.match(rib, /clip-path: polygon\(/, 'a cut ribbon, as .iw-call__ribbon');
  assert.match(rule(C, '.iw-ps.is-bad .iw-ps__head::before'), /background: var\(--coral\)/, '差一点 is coral');
  assert.match(C, /--coral: #f08a7a/, 'coral is #f08a7a — never the other side\'s colour (PLAY §1.6)');
  assert.match(rule(C, '.iw-ps__head'), /color: var\(--k\)/, 'dark letters on the ribbon (≥ 4.5 : 1 on every team ink and on coral)');
  // the ribbon is behind the line, not round it: no padding above / below — the strip is no taller (VERDICT_H)
  assert.match(rule(C, '.iw-ps__head'), /padding: 0 /);
  assert.match(src('src/ui/play-strip.js'), /export const VERDICT_H = 86;/);
});

test('the strip keeps its reading sizes and its 44 pt targets', () => {
  const C = jsCss('src/ui/play-strip.js');
  for (const [sel, min] of [['.iw-ps__q', 19], ['.iw-ps__zh', 17], ['.iw-ps__head', 19], ['.iw-ps__why', 17], ['.iw-ps__lanes span', 14], ['.iw-ps__lanes span small', 12], ['.iw-ps__note', 17]]) {
    assert.ok(fontPx(rule(C, sel)) >= min, `${sel} ≥ ${min} px (${fontPx(rule(C, sel))})`);
  }
  const play = rule(C, '.iw-ps__play');
  assert.ok(px(play, 'width') >= 44 && px(play, 'height') >= 44, '▶ is 44 pt');
  assert.ok(px(rule(C, '.iw-ps__act'), 'min-height') >= 44, 'the verdict\'s buttons are 44 pt');
});

test('the level layer (hud.css): sticker walk bar and buttons, the results card is the menus\' modal card with a splat', () => {
  const C = hudCss();
  sticker(C, '.iw-learn__walk', 'the walk bar');
  sticker(C, '.iw-learn__btn', 'the level\'s buttons');
  assert.ok(px(rule(C, '.iw-learn__btn'), 'min-height') >= 44, 'buttons stay 44 pt');
  const fr = shadow(C, '.iw-learn__rframe');
  assert.match(fr, /0 0 0 3px #fff, 0 0 0 7px var\(--k\)/, 'the results card: a white rim in an ink ring (ui.css .iw-modal__card)');
  assert.match(fr, /0 [1-9]\d*px 0 7px rgba\(0, 0, 0, \.\d+\)/, '… and the modal\'s dropped shadow');
  assert.match(rule(C, '.iw-learn__rsplat svg'), /animation: iw-spin /, 'the splat turns slowly (ui.css .iw-res__splat)');
  const H = src('src/ui/hud-learn.js');
  assert.match(H, /this\.rHead = h\('div', \{ class: 'iw-learn__rhead' \}, h\('div', \{ class: 'iw-learn__rsplat', html: splatSVG\(.*\), this\.rTitle\);/, 'hud-learn.js puts splatSVG behind the title, in a head that does not scroll');
  assert.match(H, /this\.rFrame = h\('div', \{ class: 'iw-learn__rframe'[^}]*\}, this\.rHead, this\.results_\)/, 'the card (results_) is inside the frame: the forms still add their lines to it');
  assert.match(rule(C, '.iw-learn__rsplat'), /z-index: -1/, 'the splat is under the title and the card\'s lines');
  assert.ok(!/z-index|isolation/.test(rule(C, '.iw-learn__rhead')), 'the head is no stack of its own (the splat would paint over the score)');
  assert.match(rule(C, '.iw-learn__rhead .iw-learn__rtitle'), /font-synthesis: none/, 'no synthesised bold Titan One on the title');
  assert.match(C, /@media \(prefers-reduced-motion: reduce\) \{\s*\.iw-learn \*, \.iw-learn \*::before, \.iw-learn \*::after \{ animation: none !important; transition: none !important; \}/, 'reduced motion: nothing moves');
});

test('the prop bag, the reading strip and the runner\'s hint are stickers too; the bag still steps aside', () => {
  const B = jsCss('src/learn/forms/ui.js');
  sticker(B, '.iw-lf__slot', 'a bag slot');
  sticker(B, '.iw-lf__note', 'the forms\' note');
  assert.match(rule(B, '.iw-lf.is-aside .iw-lf__bag'), /translate: calc\(100% \+ 24px\) -50%; opacity: 0; pointer-events: none;/, 'LEARN §30: the bag steps aside');
  assert.ok(px(rule(B, '.iw-lf__slot'), 'width') >= 44, 'a slot is ≥ 44 pt');
  sticker(jsCss('src/learn/play/board/strip.js'), '.iw-read__box', 'the reading strip');
  sticker(jsCss('src/learn/play/runner/tips.js'), '.iw-run__hint', 'the runner\'s hint');
});

test('no learning-layer CSS goes back to the dark glass, and none adds a backdrop-filter (dear on a phone)', () => {
  const all = [['styles/hud.css (the level\'s layer)', hudCss()], ...FILES.map((f) => [f, jsCss(f)])];
  for (const [f, C] of all) {
    assert.ok(!/backdrop-filter/.test(C), `${f}: no backdrop-filter`);
    assert.ok(!/border: 1\.5px solid rgba\(255, ?255, ?255, ?\.14\)/.test(C), `${f}: not the glass's faint border`);
    assert.ok(!/rgba\(14, ?12, ?22, ?\.9\d?\)/.test(C), `${f}: not the glass's fill`);
  }
  // every file that draws a box of its own has the ink edge (wire/type.js and landscape.js only move the strip)
  for (const f of FILES.slice(0, 4)) assert.match(jsCss(f), /var\(--k\)/, `${f} uses the ink token`);
});

test('the lanes never break inside an English word; upright their row spans the whole strip (not the column beside the chip)', () => {
  const C = jsCss('src/ui/play-strip.js');
  const cell = rule(C, '.iw-ps__lanes span');
  assert.match(cell, /overflow-wrap: normal; word-break: keep-all; min-width: min-content;/, 'a cell is as wide as its longest word');
  assert.ok(!/overflow-wrap: anywhere/.test(cell), 'not 「her / e」 any more');
  assert.match(rule(C, '.iw-ps__lanes span small'), /word-break: normal; overflow-wrap: anywhere;/, 'the Chinese line wraps as before');
  assert.match(rule(C, '.iw-ps__lanes'), /flex-wrap: wrap;/, 'cells that do not fit go to a second row rather than out of the strip');
  const grid = /@media \(orientation: portrait\) and \(max-width: 640px\) \{\s*\.iw-ps:not\(\.is-verdict\) \.iw-ps__box:has\(\.iw-ps__lanes\.is-on\) \{ display: grid;[^}]*gap: 0;\s*grid-template-areas: "play tag q" "play tag zh" "lanes lanes lanes"; \}/;
  assert.match(C, grid, 'upright: ▶ and the chip beside the question and its Chinese, the lanes under all of it (no row gap: never taller)');
  assert.match(C, /\.iw-ps__box:has\(\.iw-ps__lanes\.is-on\):has\(\.iw-ps__zh:empty\) \{ grid-template-areas: "play tag q" "play lanes lanes"; \}/, 'one line of question: ▶ keeps its column (the lanes are not pushed under it)');
  assert.match(C, /\.iw-ps:not\(\.is-verdict\) \.iw-ps__box:has\(\.iw-ps__lanes\.is-on\) \.iw-ps__text \{ display: contents; \}/);
});

test('motion: the press lands on the same frame, the verdict ribbon springs in, the results card comes in layers; reduced motion stills it', () => {
  const C = jsCss('src/ui/play-strip.js'), H = hudCss();
  for (const [css, sel] of [[C, '.iw-ps__play:active'], [C, '.iw-ps__act:active'], [H, '.iw-learn__btn:active']]) {
    const d = rule(css, sel);
    assert.match(d, /translate: 0 [23]px;/, `${sel} sinks into its shadow`);
    assert.match(d, /transition-duration: 0s;/, `${sel}: on the same frame`);
  }
  assert.match(rule(C, '.iw-ps.is-verdict .iw-ps__head::before'), /animation: iw-ps-rib \.4\ds var\(--spring\) backwards;/, 'the ribbon on a spring (overshoot)');
  assert.match(C, /@keyframes iw-ps-rib \{ 0% \{ scale: \.08 \.7;/);
  const rm = /@media \(prefers-reduced-motion: reduce\) \{([^\n]*)\}/.exec(C)[1];
  for (const sel of ['.iw-ps__box.is-enter', '.iw-ps.is-verdict .iw-ps__head::before', '.iw-ps.is-verdict .iw-ps__head', '.iw-ps.is-verdict .iw-ps__why']) assert.ok(rm.includes(sel), `reduced motion stills ${sel}`);
  // the results: splat, title, then each line 60 ms apart; the score counts up (a text write only when it changes)
  assert.match(rule(H, '.iw-learn__rframe.is-enter .iw-learn__rsplat'), /animation: iw-learn-splat /);
  assert.match(rule(H, '.iw-learn__rframe.is-enter .iw-learn__rtitle'), /animation: iw-learn-pop /);
  const delays = [1, 2, 3, 4].map((n) => n === 1 ? +/\.(\d+)s backwards/.exec(rule(H, '.iw-learn__rframe.is-enter .iw-learn__results > *'))[1] * 10 : +/animation-delay: \.(\d+)s/.exec(rule(H, `.iw-learn__rframe.is-enter .iw-learn__results > :nth-child(${n})`))[1] * 10);
  for (let i = 1; i < delays.length; i++) { const d = delays[i] - delays[i - 1]; assert.ok(d >= 40 && d <= 80, `lines ${i} → ${i + 1}: ${d} ms apart`); }
  const J = src('src/ui/hud-learn.js');
  assert.match(J, /if \(!prefersReducedMotion\(\)\) \{ restartAnim\(this\.rFrame, 'is-enter'\); this\._countUp\(num, data\.done\); \}/, 'no count-up under reduced motion');
  assert.match(J, /if \(v !== shown\) \{ shown = v; el\.dataset\.c = String\(v\); \}/, 'the count writes only when the number changes');
  assert.ok(!/el\.textContent = /.test(J.slice(J.indexOf('_countUp(el, to) {'))), 'the score\'s text stays the real number (the count is drawn over it)');
  assert.match(rule(H, '.iw-learn__rscore b.is-counting::after'), /content: attr\(data-c\); position: absolute;/);
  assert.match(J, /dur = Math\.min\(700, /, '… and is over in 0.7 s at most');
});

