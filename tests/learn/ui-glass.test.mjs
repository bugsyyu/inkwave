// ui-glass (docs/LEARN.md §47): frosted glass on the big surfaces, clay on what is pressed, over the sticker look — all of it
// under one class on <html> (config LEARN.uiGlass; ?ui=sticker leaves it off; html.iw-glass-solid / reduced transparency:
// no blur). Read off the code and the CSS text: the switch, the section's scope, the blur's budget (≤ 24 px, never on
// something that animates itself, at most three on a screen, none without blur), the ink outline first, presses on the frame.
// 用法：node --test tests/learn/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEARN, RENDER_START, RENDER_STEPS } from '../../src/config.js';
import { glassClasses, applyGlass, GLASS, SOLID } from '../../src/ui/ui-glass.js';

const src = (f) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const CSS = src('styles/ui.css');
const HEAD = 'ui-glass (docs/LEARN.md §47, src/ui/ui-glass.js)';
const SEC = CSS.slice(CSS.lastIndexOf('/* ====', CSS.indexOf(HEAD)), CSS.indexOf('游戏为主体 第二期: the course map'));

// the section's rules: { sel, body, media } (one level of @media; @keyframes kept apart)
function rules(css) {
  const out = [], frames = [];
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const walk = (s, media) => {
    let i = 0;
    while (i < s.length) {
      const open = s.indexOf('{', i);
      if (open < 0) break;
      const head = s.slice(i, open).trim();
      let d = 1, j = open + 1;
      for (; j < s.length && d; j++) { if (s[j] === '{') d++; else if (s[j] === '}') d--; }
      const body = s.slice(open + 1, j - 1);
      if (head.startsWith('@media')) walk(body, head);
      else if (head.startsWith('@keyframes')) frames.push({ name: head.slice(10).trim(), body });
      else out.push({ sel: head, body, media });
      i = j;
    }
  };
  walk(clean, null);
  return { out, frames };
}
const { out: R, frames: F } = rules(SEC);
// a selector list split at its top-level commas (not the ones inside :is() / :not())
const sels = (sel) => { const out = []; let d = 0, cur = ''; for (const c of sel) { if (c === '(') d++; if (c === ')') d--; if (c === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += c; } out.push(cur.trim()); return out; };
const decl = (body, prop) => { const m = new RegExp('(?:^|;|\\s)' + prop + ':\\s*([^;]+)').exec(body); return m ? m[1].trim() : null; };

test('the switch: LEARN.uiGlass, ?ui=sticker for one load, no blur from the base class\'s render step', () => {
  assert.equal(LEARN.uiGlass, true);
  assert.deepEqual(glassClasses({}), [GLASS]);
  assert.deepEqual(glassClasses({ search: '?from=app&ui=sticker' }), []);
  assert.deepEqual(glassClasses({ search: '?from=app&ui=glass' }), [GLASS]);
  assert.deepEqual(glassClasses({ on: false }), []);
  assert.deepEqual(glassClasses({ step: null, cls: null }), [GLASS], 'a web browser (no device class): the glass');
  for (const s of RENDER_STEPS) assert.deepEqual(glassClasses({ step: s.step, cls: 'top' }), s.step >= RENDER_START.base ? [GLASS, SOLID] : [GLASS], 'step ' + s.step);
  assert.deepEqual(glassClasses({ step: RENDER_START.high, cls: 'base' }), [GLASS, SOLID], 'a base device never blurs');
  assert.deepEqual(glassClasses({ search: '?ui=sticker', step: 4, cls: 'base' }), []);
  const set = new Set(['x']), root = { classList: { add: (c) => set.add(c), remove: (...c) => c.forEach((k) => set.delete(k)) } };
  applyGlass(root, [GLASS, SOLID]); assert.deepEqual([...set].sort(), [GLASS, SOLID, 'x'].sort());
  applyGlass(root, []); assert.deepEqual([...set], ['x'], 'only its own classes go');
  // main.js: on <html>, from this launch's step and class, before the first screen
  const M = src('src/main.js');
  const at = M.indexOf('applyGlass(document.documentElement, glassClasses({ search: location.search, step: G.renderProfile ? G.renderProfile.step : null, cls: this.device ? this.device.cls : null }))');
  assert.ok(at > M.indexOf('G.renderProfile = step == null') && at < M.indexOf("this.menus?.show('loading')"));
});

test('the section: every rule hangs off html.iw-glass; blur ≤ 24 px; every blur has its -webkit- twin', () => {
  assert.ok(SEC.length > 2000 && R.length > 30);
  for (const r of R) for (const s of sels(r.sel)) assert.match(s.trim(), /^html\.iw-glass(?:$|[.\s:])/, 'scoped: ' + s.trim());
  const blur = +(/--glass-blur:\s*([\d.]+)px/.exec(SEC) || [])[1];
  assert.ok(blur > 0 && blur <= 24, '--glass-blur ' + blur);
  for (const m of CSS.matchAll(/blur\(([\d.]+)px\)/g)) assert.ok(+m[1] <= 24, 'a blur of ' + m[1] + ' px in ui.css');
  for (const r of R) {
    const b = decl(r.body, 'backdrop-filter'), w = decl(r.body, '-webkit-backdrop-filter');
    assert.equal(b, w, 'the unprefixed one and the -webkit- one say the same (iOS ≤ 17 reads only the prefixed): ' + r.sel);
  }
});

// the surfaces that blur, and the screens they meet on: the owner's ceiling is six at once (10-20, 「按钮也做成玻璃」); a new
// one has to be added here, with its screen. Rows of buttons never blur on their own (glass over a blurred panel)
const BLURRED = ['html.iw-glass .iw-main__menu', 'html.iw-glass .iw-main__side > .iw-panel', 'html.iw-glass .iw-book__page', 'html.iw-glass :is(.iw-bps, .iw-ci) :is(.iw-bps__card, .iw-ci__card)'];
const SCREENS = {
  'main (landscape) + 打卡': ['.iw-main__menu', '.iw-main__side > .iw-panel (profile)', '.iw-main__side > .iw-panel (kit)', '.iw-ci__card'],
  'book + 记一条': ['.iw-book__page', '.iw-bps__card'],
};

test('blur: only on the listed surfaces, never on one that animates itself, ≤ 6 on a screen', () => {
  const blurs = R.filter((r) => /var\(--glass-filter\)|blur\(/.test(decl(r.body, 'backdrop-filter') || ''));
  assert.deepEqual(blurs.map((r) => r.sel).sort(), [...BLURRED].sort());
  for (const r of blurs) {
    assert.equal(r.media, null, 'not only in a media query: ' + r.sel);
    const anim = decl(r.body, 'animation'), tr = decl(r.body, 'transition');
    assert.ok(!tr || tr === 'none', 'no transition on a blur: ' + r.sel);
    assert.ok(!anim || anim === 'none', 'no animation on a blur: ' + r.sel);
  }
  // the side panels came in with .iw-in--right on themselves: under the glass their wrapper slides (transform only)
  assert.equal(decl(R.find((r) => r.sel === 'html.iw-glass .iw-main__side > .iw-panel').body, 'animation'), 'none');
  assert.match(decl(R.find((r) => r.sel === 'html.iw-glass .iw-main__side').body, 'animation'), /^iw-glass-side /);
  // the cards: whatever state rule moved them (is-in / is-out, is-nope, is-hit) is outranked — their frame moves instead
  const still = R.find((r) => r.sel === 'html.iw-glass :is(.iw-bps, .iw-ci):is(.is-in, .is-out) :is(.iw-bps__card, .iw-ci__card)');
  assert.ok(still && /transform: none/.test(still.body) && /transition: none/.test(still.body) && /animation: none/.test(still.body));
  assert.match(decl(R.find((r) => r.sel === 'html.iw-glass :is(.iw-bps__vp, .iw-ci__vp)').body, 'transition'), /^transform /);
  assert.match(src('src/ui/book-pages/kit.js'), /restartAnim\(card, 'is-nope'\); restartAnim\(vp, 'is-nope'\);/);
  assert.match(src('src/ui/checkin-card.js'), /restartAnim\(card, 'is-hit'\); restartAnim\(vp, 'is-hit'\);/);
  for (const [k, v] of Object.entries(SCREENS)) assert.ok(v.length <= 6, k);
  // a panel anywhere else and the prompts bar lose upstream's blur under the glass (screens with many of them)
  for (const s of ['html.iw-glass .iw-panel', 'html.iw-glass .iw-prompts']) assert.equal(decl(R.find((r) => r.sel === s).body, 'backdrop-filter'), 'none', s);
});

test('no blur at the base step or with reduced transparency: the tint goes solid, every blur in the menus goes', () => {
  const solid = R.find((r) => r.sel === 'html.iw-glass.iw-glass-solid' && !r.media);
  assert.equal(decl(solid.body, '--glass-filter'), 'none');
  assert.ok(+decl(solid.body, '--glass-alpha') >= 0.9, 'a solid tint');
  const kill = (media) => R.find((r) => r.media === media && /\.iw-ui \*::after/.test(r.sel) && /backdrop-filter: none !important/.test(r.body) && /-webkit-backdrop-filter: none !important/.test(r.body));
  assert.ok(kill(null) && /iw-glass-solid/.test(kill(null).sel));
  const rt = '@media (prefers-reduced-transparency: reduce)';
  assert.ok(kill(rt));
  assert.equal(decl(R.find((r) => r.media === rt && r.sel === 'html.iw-glass').body, '--glass-filter'), 'none');
  assert.ok(+decl(R.find((r) => r.media === rt && r.sel === 'html.iw-glass').body, '--glass-alpha') >= 0.9);
  assert.doesNotMatch(SEC, /\.iw-hud/, 'the level\'s HUD is not touched');
});

test('one material per thing: glass faces without the sticker\'s ink outline / hard shadow; presses on the frame; no layer under a face', () => {
  const root = R.find((r) => r.sel === 'html.iw-glass' && !r.media).body;
  // the recipes (one per state) carry no ink: a hairline, the edge light, clay's volume, soft drops
  for (const k of ['--g-line', '--g-edge', '--g-edge-on', '--g-drop', '--g-drop-s', '--g-drop-l', '--clay', '--clay-d', '--g-lit', '--g-btn', '--g-btn-l', '--g-btn-down', '--g-item']) {
    const v = decl(root, k);
    assert.ok(v, k);
    assert.doesNotMatch(v, /var\(--k\)|#15121c|rgba?\(21, 18, 28/, k + ': no ink');
    assert.doesNotMatch(v, /(?:^|,\s*)0 \d+px 0 /, k + ': no hard offset shadow');
  }
  // the things she presses and the cards: their box-shadow is only recipes (or a glow / a coloured inset of their own)
  const GLASS = ['.iw-btn--menu', '.iw-bp-btn', '.iw-bp-tab', '.iw-bp-chip', '.iw-book__tab', '.iw-book__close', '.iw-bp-note', '.iw-bp-panel', '.iw-bp-day', '.iw-bg-check', '.iw-bt-pack',
    '.iw-bt-tpl', '.iw-ci__mood', '.iw-ci__save', '.iw-ci__later', '.iw-bp-in', '.iw-book__page', '.iw-bps__card', '.iw-toast', '.iw-cmap__expill', '.iw-learn__btn', '.iw-learn__rframe'];
  for (const g of GLASS) {
    const rs = R.filter((r) => sels(r.sel).some((s) => s.includes(g)) && decl(r.body, 'box-shadow'));
    assert.ok(rs.length, 'a glass rule for ' + g);
    for (const r of rs) assert.doesNotMatch(decl(r.body, 'box-shadow'), /var\(--k\)|var\(--stk|0 \d+px 0 [\d.]+px/, g + ' (' + r.sel + '): no ink outline / hard offset');
  }
  // the radii: four steps (and pills / circles)
  for (const r of R) { const v = decl(r.body, 'border-radius'); if (v) for (const p of v.split(/\s+/)) assert.ok(/^var\(--r-[1-4]\)$|^999px$|^50%$|^0$|^4px$|^calc\(var\(--u\)/.test(p), 'a radius off the scale: ' + r.sel + ' ' + v); }
  const downs = R.filter((r) => /\.is-down\b/.test(r.sel) && !r.media && /transform|scale|translate/.test(r.body));
  assert.ok(downs.length >= 5);
  for (const r of downs) assert.match(r.body, /transition-duration: 0s|transition: scale 0s, translate 0s/, 'on the frame: ' + r.sel);
  for (const k of F) for (const p of k.body.matchAll(/([a-z-]+)\s*:/g)) assert.ok(['transform', 'opacity'].includes(p[1]), k.name + ' moves ' + p[1]);
  // (an ::after at z-index −1 in every menu button, and then a second drop-shadow filter on the buttons' icons, made Chrome
  // composite the menu's buttons into each other — copies of other buttons in a button's place, LEARN §47)
  for (const r of R) if (/::(before|after)/.test(r.sel)) assert.doesNotMatch(r.body, /z-index:\s*-/, 'no layer under the face: ' + r.sel);
  assert.ok(!R.some((r) => /\.iw-btn__icon/.test(r.sel) && /filter:/.test(r.body)), 'no filter on the buttons\' icons');
  assert.ok(!R.some((r) => decl(r.body, 'filter') && !/^none$/.test(decl(r.body, 'filter')) && !/saturate\(\.4\)/.test(decl(r.body, 'filter'))), 'no filter at all (only the disabled fade)');
  // the focus: one ring hugging the shape, --cur-pad away (menus.js reads it)
  assert.match(decl(root, '--cur-pad'), /^\d+px$/);
  assert.match(src('src/ui/menus.js'), /this\._cur\.pad = parseFloat\(cs\.getPropertyValue\('--cur-pad'\)\)/);
  assert.equal(decl(R.find((r) => r.sel === 'html.iw-glass .iw-cursor__ring').body, 'border'), '0');
  // reduced motion: the side does not slide, presses do not squash
  const rm = R.filter((r) => r.media === '@media (prefers-reduced-motion: reduce)');
  assert.ok(rm.some((r) => r.sel === 'html.iw-glass .iw-main__side' && decl(r.body, 'animation') === 'none'));
  assert.ok(rm.some((r) => /\.iw-btn\.is-down/.test(r.sel) && /scale: none/.test(r.body)));
});

test('Chinese: no stroke on 字, no synthesised bold, the display face cut to the interface (OFL beside it, ≤ 400 KB)', () => {
  assert.match(SEC, /html\.iw-glass \{[^}]*font-synthesis: none/);
  for (const s of ['html.iw-glass .iw-display', 'html.iw-glass :is(.iw-bp__title, .iw-ci__title)', 'html.iw-glass .iw-cmap__day', 'html.iw-glass .iw-learn__rhead .iw-learn__rtitle'])
    assert.equal(decl(R.find((r) => r.sel === s).body, '-webkit-text-stroke'), '0', s);
  const root = R.find((r) => r.sel === 'html.iw-glass' && !r.media).body;
  assert.match(decl(root, '--f-display'), /^'IW Titan', 'ZCOOL KuaiLe IW'/);
  assert.match(decl(root, '--f-text'), /^'Rubik', -apple-system, 'PingFang SC'/);
  assert.match(CSS, /@font-face \{ font-family: 'ZCOOL KuaiLe IW'; src: url\('\.\.\/assets\/fonts\/ZCOOLKuaiLe-ui\.woff2'\) format\('woff2'\);[^}]*font-display: swap;[^}]*unicode-range: U\+3000-303F/);
  const woff = readFileSync(new URL('../../assets/fonts/ZCOOLKuaiLe-ui.woff2', import.meta.url));
  assert.ok(woff.length > 10000 && woff.length <= 400 * 1024, 'woff2 ' + woff.length);
  assert.equal(woff.slice(0, 4).toString('latin1'), 'wOF2');
  assert.match(readFileSync(new URL('../../assets/fonts/ZCOOLKuaiLe-OFL.txt', import.meta.url), 'utf8'), /SIL OPEN FONT LICENSE Version 1\.1/);
  assert.match(src('tools/fonts/subset-zh.py'), /SHA = '[0-9a-f]{64}'/);
});

test('the glass reads: white and the lead\'s grey on the page over the brightest stage behind the book\'s scrim ≥ 4.5 : 1', () => {
  const root = R.find((r) => r.sel === 'html.iw-glass' && !r.media).body;
  // the knobs into the derived colours: var(--x) → its number, calc(a + b) / calc(a * b) → the result
  const knob = (k) => +decl(root, k);
  const resolve = (v) => v.replace(/var\((--[\w-]+)\)/g, (_, k) => String(knob(k))).replace(/calc\(([\d.]+) ([+*]) ([\d.]+)\)/g, (_, x, o, y) => String(o === '+' ? +x + +y : x * y));
  const rgba = (s) => (/rgba\(([^)]+)\)/.exec(resolve(s)) || [])[1].split(',').map(Number);
  const t0 = rgba(decl(root, '--glass-tint')), t1 = rgba(decl(root, '--glass-tint-2'));
  // the panel's sheen (rim × k, gone by n %) and its streak's peak (spec × k), read off their definitions
  const sh = /calc\(var\(--glass-rim\) \* ([\d.]+)\)\), rgba\(255, 255, 255, 0\) ([\d.]+)%/.exec(decl(root, '--glass-sheen'));
  const sp = [...decl(root, '--glass-streak-p').matchAll(/calc\(var\(--glass-spec\) \* ([\d.]+)\)/g)].map((m) => +m[1]);
  assert.match(decl(root, '--glass-bg'), /^var\(--glass-streak-p\), var\(--glass-sheen\),/, 'the panel wears these two');
  const sheenTop = knob('--glass-rim') * +sh[1], sheenEnd = +sh[2] / 100, spec = knob('--glass-spec') * Math.max(...sp);
  assert.ok(t0.every(Number.isFinite) && t1.every(Number.isFinite), 'the tint resolves: ' + t0 + ' / ' + t1);
  const sc = [...decl(R.find((r) => r.sel === 'html.iw-glass .iw-book__scrim').body, 'background').matchAll(/rgba\(13, 10, 20, ([\d.]+)\)/g)].map((m) => +m[1]);
  const over = (top, bot) => bot.map((v, i) => top[3] * top[i] + (1 - top[3]) * v);
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const cr = (a, b) => (Math.max(L(a), L(b)) + 0.05) / (Math.min(L(a), L(b)) + 0.05);
  // down the page (t: top 0 → bottom 1): the stage at its brightest (white) through the scrim (dark at the top, lightest at
  // the bottom: its radial gradient read top to bottom), the glass's tint (--glass-tint → -2), the sheen along the top edge,
  // and where it crosses, the specular streak at its brightest
  let worst = Infinity, at = 0;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const sheen = t < sheenEnd ? sheenTop * (1 - t / sheenEnd) : 0;
    const bg = over([255, 255, 255, spec], over([255, 255, 255, sheen], over(mix(t0, t1, t), over([13, 10, 20, sc[1] + (sc[0] - sc[1]) * t], [255, 255, 255]))));
    const c = Math.min(cr([255, 255, 255], bg), cr([0xcf, 0xc8, 0xe2], bg));
    if (c < worst) { worst = c; at = t; }
  }
  assert.ok(Number.isFinite(worst) && worst >= 4.5, 'the lead #cfc8e2 / white at ' + at.toFixed(2) + ': ' + worst.toFixed(2));
});
