// 字弹 M4 — the game keyboard's layout (src/learn/play/type/keys.js keyboardLayout, drawn by src/ui/play-keys.js) and the
// physical-key mapping. Every phone size in both orientations: keys ≥ 44 pt tall and ≥ 30 pt wide, every key and
// button inside the viewport and clear of the safe-area insets, no two keys overlapping, each key of the mode exactly
// once, and the keyboard leaves the screen for the game (≈ 40 % portrait, ≈ 45 % landscape).
// 用法：node --test tests/learn/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { keyboardLayout, keysFor, keyOfEvent, KB, ALL_KEYS, PRINTABLE, LETTERS } from '../../src/learn/play/type/keys.js';

// iPhone-class viewports with their safe-area insets (portrait: home indicator; landscape: notch sides + indicator)
const VIEWPORTS = [
  { name: 'iPhone 15 portrait', w: 390, h: 844, safe: { top: 47, bottom: 34 } },
  { name: 'iPhone 15 landscape', w: 844, h: 390, safe: { left: 47, right: 47, bottom: 21 } },
  { name: 'iPhone SE portrait', w: 375, h: 667, safe: {} },
  { name: 'iPhone SE landscape', w: 667, h: 375, safe: {} },
  { name: 'iPhone Pro Max portrait', w: 430, h: 932, safe: { top: 59, bottom: 34 } },
  { name: 'iPad portrait', w: 820, h: 1180, safe: { bottom: 20 } },
  { name: 'iPad landscape', w: 1180, h: 820, safe: { bottom: 20 } },
  { name: 'desktop', w: 1280, h: 720, safe: {} },
];
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

for (const vp of VIEWPORTS) for (const mode of ['word', 'sentence']) {
  test(`keyboard ${vp.name} ${vp.w}×${vp.h} · ${mode}: sizes, inside the viewport, no overlaps, every key once`, () => {
    const L = keyboardLayout(vp, vp.safe, mode);
    const s = { top: 0, right: 0, bottom: 0, left: 0, ...vp.safe };
    assert.equal(L.orient, vp.w >= vp.h ? 'landscape' : 'portrait');
    const want = keysFor(mode).slice().sort(), got = L.keys.map((k) => k.key).sort();
    assert.deepEqual(got, want, 'each key of the mode exactly once');
    for (const r of [...L.keys, ...L.buttons]) {
      const id = r.key ?? r.id;
      assert.ok(r.h >= KB.minH, `${id} is ${r.h} tall (≥ ${KB.minH})`);
      assert.ok(r.w >= KB.minW, `${id} is ${r.w} wide (≥ ${KB.minW})`);
      assert.ok(r.x >= s.left && r.x + r.w <= vp.w - s.right, `${id} inside left/right (x ${r.x}…${r.x + r.w})`);
      assert.ok(r.y >= L.top && r.y + r.h <= vp.h - s.bottom, `${id} inside the keyboard, above the home indicator`);
    }
    const all = [...L.keys, ...L.buttons, ...(L.strip ? [L.strip] : [])];
    for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) assert.ok(!overlap(all[i], all[j]), `${all[i].key ?? all[i].id ?? 'strip'} overlaps ${all[j].key ?? all[j].id ?? 'strip'}`);
    assert.deepEqual(L.buttons.map((b) => b.id).sort(), ['hint', 'replay']);
    if (L.orient === 'portrait') {
      assert.ok(L.strip && L.strip.w > 150, 'portrait has the typed-line strip');
      if (vp.w <= 430) {
        const letter = L.keys.find((k) => k.key === 'q');
        assert.ok(letter.w >= 31 && letter.w <= 40 && letter.h >= 44, `iOS-like letter key (${letter.w}×${letter.h})`);
        assert.ok(L.h / vp.h <= 0.42, `portrait keyboard covers ${(L.h / vp.h * 100).toFixed(0)}%`);
      }
    } else if (vp.h <= 430) {
      assert.ok(L.h / vp.h <= 0.47, `landscape keyboard covers ${(L.h / vp.h * 100).toFixed(0)}%`);
      assert.ok(L.keys.find((k) => k.key === 'q').w >= 32, 'landscape keys are wider');
    }
  });
}

test('modes: a word has no sentence punctuation; every printable has a key in sentence mode', () => {
  assert.ok(!keysFor('word').some((k) => ['.', ',', '?'].includes(k)));
  for (const k of PRINTABLE) assert.ok(keysFor('sentence').includes(k), k);
  for (const k of ALL_KEYS) assert.ok(keysFor('sentence').includes(k), k);
  assert.ok(keysFor('word').includes("'") && keysFor('word').includes('-') && keysFor('word').includes(' '));
});

test('physical keys: letters any case, Enter = 射, Backspace = ⌫, punctuation by mode, never a modifier combo', () => {
  const ev = (key, o = {}) => ({ key, code: o.code || '', ...o });
  for (const c of LETTERS) { assert.equal(keyOfEvent(ev(c)), c); assert.equal(keyOfEvent(ev(c.toUpperCase())), c); }
  assert.equal(keyOfEvent(ev('Enter')), 'fire');
  assert.equal(keyOfEvent(ev('Backspace')), 'back');
  assert.equal(keyOfEvent(ev(' ')), ' ');
  assert.equal(keyOfEvent(ev("'")), "'");
  assert.equal(keyOfEvent(ev('’')), "'", 'a smart quote is an apostrophe');
  assert.equal(keyOfEvent(ev('-')), '-');
  assert.equal(keyOfEvent(ev('.')), null, 'no full stop for a word');
  assert.equal(keyOfEvent(ev('.'), 'sentence'), '.');
  assert.equal(keyOfEvent(ev('?'), 'sentence'), '?');
  assert.equal(keyOfEvent(ev('a', { metaKey: true })), null);
  assert.equal(keyOfEvent(ev('a', { ctrlKey: true })), null);
  assert.equal(keyOfEvent(ev('Escape')), null, 'Escape stays the pause key');
  assert.equal(keyOfEvent(ev('1')), null);
  assert.equal(keyOfEvent(ev('Tab')), null);
});
