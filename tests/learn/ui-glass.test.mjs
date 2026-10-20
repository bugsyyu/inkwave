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
const HEAD = 'ui-glass (docs/LEARN.md §47';
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
  for (const r of R) for (const s of r.sel.split(/,(?![^(]*\))/)) assert.match(s.trim(), /^html\.iw-glass(?:$|[.\s:])/, 'scoped: ' + s.trim());
  const blur = +(/--glass-blur:\s*([\d.]+)px/.exec(SEC) || [])[1];
  assert.ok(blur > 0 && blur <= 24, '--glass-blur ' + blur);
  for (const m of CSS.matchAll(/blur\(([\d.]+)px\)/g)) assert.ok(+m[1] <= 24, 'a blur of ' + m[1] + ' px in ui.css');
  for (const r of R) {
    const b = decl(r.body, 'backdrop-filter'), w = decl(r.body, '-webkit-backdrop-filter');
    assert.equal(b, w, 'the unprefixed one and the -webkit- one say the same (iOS ≤ 17 reads only the prefixed): ' + r.sel);
  }
});

// the surfaces that blur, and the screens they meet on (≤ 3 at once): a new one has to be added here, with its screen
const BLURRED = ['html.iw-glass .iw-main__menu', 'html.iw-glass .iw-main__side > .iw-panel', 'html.iw-glass .iw-book__page'];
const SCREENS = { 'main (landscape)': ['html.iw-glass .iw-main__menu', 'html.iw-glass .iw-main__side > .iw-panel', 'html.iw-glass .iw-main__side > .iw-panel'], 'book': ['html.iw-glass .iw-book__page'] };

test('blur: only on the listed surfaces, never on one that animates itself, ≤ 3 on a screen', () => {
  const blurs = R.filter((r) => /var\(--glass-filter\)|blur\(/.test(decl(r.body, 'backdrop-filter') || ''));
  assert.deepEqual(blurs.map((r) => r.sel).sort(), [...BLURRED].sort());
  for (const r of blurs) {
    assert.equal(r.media, null, 'not only in a media query: ' + r.sel);
    const anim = decl(r.body, 'animation'), tr = decl(r.body, 'transition');
    assert.ok(!tr, 'no transition on a blur: ' + r.sel);
    assert.ok(!anim || anim === 'none', 'no animation on a blur: ' + r.sel);
  }
  // the side panels came in with .iw-in--right on themselves: under the glass their wrapper slides (transform only)
  assert.equal(decl(R.find((r) => r.sel === 'html.iw-glass .iw-main__side > .iw-panel').body, 'animation'), 'none');
  assert.match(decl(R.find((r) => r.sel === 'html.iw-glass .iw-main__side').body, 'animation'), /^iw-glass-side /);
  for (const [k, v] of Object.entries(SCREENS)) assert.ok(v.length <= 3, k);
  // a panel anywhere else and the prompts bar lose upstream's blur under the glass (screens with many of them)
  for (const s of ['html.iw-glass .iw-panel', 'html.iw-glass .iw-prompts']) assert.equal(decl(R.find((r) => r.sel === s).body, 'backdrop-filter'), 'none', s);
});

test('no blur at the base step or with reduced transparency: the tint goes solid, every blur in the menus goes', () => {
  const solid = R.find((r) => r.sel === 'html.iw-glass.iw-glass-solid' && !r.media);
  assert.equal(decl(solid.body, '--glass-filter'), 'none');
  const alpha = (v) => +(/rgba\([^)]*,\s*([\d.]+)\)/.exec(v) || [])[1];
  assert.ok(alpha(decl(solid.body, '--glass-tint')) >= 0.9 && alpha(decl(solid.body, '--glass-tint-2')) >= 0.9, 'a more solid tint');
  const kill = (media) => R.find((r) => r.media === media && /\.iw-ui \*::after/.test(r.sel) && /backdrop-filter: none !important/.test(r.body) && /-webkit-backdrop-filter: none !important/.test(r.body));
  assert.ok(kill(null) && /iw-glass-solid/.test(kill(null).sel));
  const rt = '@media (prefers-reduced-transparency: reduce)';
  assert.ok(kill(rt));
  assert.equal(decl(R.find((r) => r.media === rt && r.sel === 'html.iw-glass').body, '--glass-filter'), 'none');
  assert.doesNotMatch(SEC, /\.iw-hud/, 'the level\'s HUD is not touched');
});

test('clay: the ink outline stays first; presses squash on the frame; motion is transform / opacity only; no layer under the face', () => {
  for (const sel of ['html.iw-glass .iw-book__page', 'html.iw-glass .iw-bp-btn', 'html.iw-glass .iw-bp-note', 'html.iw-glass .iw-bp-panel', 'html.iw-glass .iw-bp-day', 'html.iw-glass .iw-book__tab', 'html.iw-glass .iw-book__close']) {
    const r = R.find((x) => x.sel === sel);
    assert.ok(r, sel);
    assert.match(decl(r.body, 'box-shadow'), /^0 0 0 [\d.]+px var\(--k\)/, 'the ink outline first: ' + sel);
  }
  // the e2e suites read these first: the note card 2.5 px, the book's page 3 px
  assert.match(decl(R.find((x) => x.sel === 'html.iw-glass .iw-bp-note').body, 'box-shadow'), /^0 0 0 2\.5px var\(--k\)/);
  assert.match(decl(R.find((x) => x.sel === 'html.iw-glass .iw-book__page').body, 'box-shadow'), /^0 0 0 3px var\(--k\)/);
  const downs = R.filter((r) => /\.is-down\b/.test(r.sel) && !r.media && /transform|scale|translate/.test(r.body));
  assert.ok(downs.length >= 3);
  for (const r of downs) assert.match(r.body, /transition-duration: 0s|transition: scale 0s, translate 0s/, 'on the frame: ' + r.sel);
  for (const k of F) for (const p of k.body.matchAll(/([a-z-]+)\s*:/g)) assert.ok(['transform', 'opacity'].includes(p[1]), k.name + ' moves ' + p[1]);
  // (an ::after at z-index −1 in every menu button made Chrome composite the buttons into each other: copies of other
  // buttons in a button's place — LEARN §47; the clay is the face's own background and box-shadow)
  for (const r of R) if (/::(before|after)/.test(r.sel)) assert.doesNotMatch(r.body, /z-index:\s*-/, 'no layer under the face: ' + r.sel);
  // reduced motion: the side does not slide, presses do not squash
  const rm = R.filter((r) => r.media === '@media (prefers-reduced-motion: reduce)');
  assert.ok(rm.some((r) => r.sel === 'html.iw-glass .iw-main__side' && decl(r.body, 'animation') === 'none'));
  assert.ok(rm.some((r) => /\.iw-btn\.is-down/.test(r.sel) && /scale: none/.test(r.body)));
});

test('the glass reads: white and the lead\'s grey on the page over the brightest stage behind the book\'s scrim ≥ 4.5 : 1', () => {
  const rgba = (s) => (/rgba\(([^)]+)\)/.exec(s) || [])[1].split(',').map(Number);
  const root = R.find((r) => r.sel === 'html.iw-glass' && !r.media).body;
  const t0 = rgba(decl(root, '--glass-tint')), t1 = rgba(decl(root, '--glass-tint-2'));
  const sc = [...decl(R.find((r) => r.sel === 'html.iw-glass .iw-book__scrim').body, 'background').matchAll(/rgba\(13, 10, 20, ([\d.]+)\)/g)].map((m) => +m[1]);
  const over = (top, bot) => bot.map((v, i) => top[3] * top[i] + (1 - top[3]) * v);
  const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const L = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const cr = (a, b) => (Math.max(L(a), L(b)) + 0.05) / (Math.min(L(a), L(b)) + 0.05);
  // down the page (t: top 0 → bottom 1): the stage at its brightest (white) through the scrim (dark at the top, lightest at
  // the bottom: its radial gradient read top to bottom), the glass's tint (--glass-tint → -2), the sheen (10 % white at
  // the top, gone by 60 %)
  let worst = Infinity, at = 0;
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const bg = over([255, 255, 255, t < 0.6 ? 0.1 * (1 - t / 0.6) : 0], over(mix(t0, t1, t), over([13, 10, 20, sc[1] + (sc[0] - sc[1]) * t], [255, 255, 255])));
    const c = Math.min(cr([255, 255, 255], bg), cr([0xcf, 0xc8, 0xe2], bg));
    if (c < worst) { worst = c; at = t; }
  }
  assert.ok(worst >= 4.5, 'the lead #cfc8e2 / white at ' + at.toFixed(2) + ': ' + worst.toFixed(2));
});
