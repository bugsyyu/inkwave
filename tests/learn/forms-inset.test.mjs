// The forms' own HUD pieces (src/learn/forms/ui.js: the prop bag, the race standings, the boss's phase strip) keep out of the
// safe area like the HUD's top row (LEARN §48, §53): turned, the bag stood half in the Dynamic Island's side and the
// standings in the left inset; upright, the HUD's top row moves down by the top inset and they did not.
// 用法：node --test tests/learn/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

// ------------------------------------------------------------------------------------------------ the forms' HUD pieces
// iPhone 13 (her phone): upright the island's 47 px on top and the home bar's 34 below; turned 47 px either side, 21 below
const UP = { w: 390, h: 844, ins: { '--iw-sat': 47, '--iw-sar': 0, '--iw-sab': 34, '--iw-sal': 0 } };
const TURNED = { w: 844, h: 390, ins: { '--iw-sat': 0, '--iw-sar': 47, '--iw-sab': 21, '--iw-sal': 47 } };
const NONE = { '--iw-sat': 0, '--iw-sar': 0, '--iw-sab': 0, '--iw-sal': 0 };
// a length as the page reads it: 16px, calc(16px + var(--iw-sar, 0px)) — px and the insets only
const px = (v, ins) => {
  const e = String(v).trim().replace(/^calc\((.*)\)$/, '$1').replace(/var\((--iw-sa[trbl]), 0px\)/g, (_, k) => ins[k] + 'px');
  return e.split('+').reduce((s, t) => { const m = /^\s*(-?[\d.]+)px\s*$/.exec(t); assert.ok(m, 'a length: ' + v); return s + +m[1]; }, 0);
};
const FORMS = src('src/learn/forms/ui.js');
const CSS = FORMS.slice(FORMS.indexOf('const CSS = `'), FORMS.indexOf('`;', FORMS.indexOf('const CSS = `')));
const PHONE = CSS.slice(CSS.indexOf('@media (max-width: 640px) {'));
const prop = (css, sel, p) => { const r = new RegExp(sel.replace(/[.]/g, '\\.') + ' \\{[^}]*?(?:^|[ ;{])' + p + ': ([^;]+);').exec(css); assert.ok(r, sel + ' ' + p); return r[1]; };

test('the forms\' HUD pieces keep out of the safe area: the bag off the island\'s side, the standings off the left inset, both rows under the top inset', () => {
  const base = CSS.slice(0, CSS.indexOf('@media'));
  // turned (the phone rules are for ≤ 640 px): the bag's right edge and the standings' left edge clear the insets by 8 px
  assert.ok(px(prop(base, '.iw-lf__bag', 'right'), TURNED.ins) >= TURNED.ins['--iw-sar'] + 8, 'the bag: right ' + prop(base, '.iw-lf__bag', 'right'));
  assert.ok(px(prop(base, '.iw-lf__rank', 'left'), TURNED.ins) >= TURNED.ins['--iw-sal'] + 8, 'the standings: left ' + prop(base, '.iw-lf__rank', 'left'));
  // stepped aside, the bag leaves the screen whole (its own width + 24 px past the edge it stands off: the inset with it)
  const aside = /\.iw-lf\.is-aside \.iw-lf__bag \{ translate: calc\(100% \+ (.+?)\) -50%;/.exec(base);
  assert.ok(aside, 'the aside slide');
  assert.ok(px('calc(' + aside[1] + ')', TURNED.ins) - px(prop(base, '.iw-lf__bag', 'right'), TURNED.ins) > 0, 'out past the edge: ' + aside[1]);
  // the standings and the boss's strip move down with the HUD's top row (styles/hud.css: top: calc(… + var(--iw-sat)))
  for (const [css, sel] of [[base, '.iw-lf__rank'], [base, '.iw-lf__phase'], [PHONE, '.iw-lf__rank']]) {
    const v = prop(css, sel, 'top');
    assert.equal(px(v, UP.ins) - px(v, NONE), UP.ins['--iw-sat'], sel + ' top ' + v + ' moves down by the top inset');
  }
  // upright (≤ 640 px): the bag still off the right inset (0 upright; a narrow window turned is ≤ 640 too)
  assert.ok(px(prop(PHONE, '.iw-lf__bag', 'right'), TURNED.ins) >= TURNED.ins['--iw-sar'] + 8, 'the bag on a phone: ' + prop(PHONE, '.iw-lf__bag', 'right'));
  // the page's own variables (LEARN §48), with a fallback where they are not set (a desktop's page reads 0)
  for (const k of ['--iw-sat', '--iw-sar', '--iw-sal']) assert.match(CSS, new RegExp('var\\(' + k + ', 0px\\)'), k);
  assert.match(src('styles/hud.css'), /:root \{ --iw-sat: env\(safe-area-inset-top, 0px\); --iw-sar: env\(safe-area-inset-right, 0px\);/);
});
