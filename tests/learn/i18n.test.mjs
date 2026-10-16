// 中文化 (docs/LEARN.md §15): the UI dictionary src/ui/i18n.js — every key has its English and its Chinese, the two
// carry the same {placeholders}; and a scan of the screens on her path (the loading / title / main / learn / pause /
// settings / how-to / credits screens of menus.js, the HUD, the boss HUD, the learn layers, the portrait gate) for
// English UI strings that do not go through t(). Pure: reads files, imports only i18n.js (no DOM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DICT, TIPS_ZH, t, LANG, gameName, teamName } from '../../src/ui/i18n.js';
import { WEAPONS, SUBS, SPECIALS, MAPS, TEAM_PALETTES, COLORBLIND_PALETTE, TEAM_NAMES, DIFFICULTY } from '../../src/config.js';

const CJK = /[㐀-鿿豈-﫿]/;
const holes = (s) => [...String(s).matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('every key has an English and a Chinese label, with the same placeholders', () => {
  const keys = Object.keys(DICT);
  assert.ok(keys.length > 300, `${keys.length} keys`);
  for (const k of keys) {
    const e = DICT[k];
    assert.ok(Array.isArray(e) && e.length === 2, k);
    assert.equal(typeof e[0], 'string', k); assert.ok(e[0].length > 0, `${k}: English`);
    assert.equal(typeof e[1], 'string', k); assert.ok(CJK.test(e[1]), `${k}: no Chinese in «${e[1]}»`);
    assert.equal(holes(e[0]), holes(e[1]), `${k}: placeholders differ`);
  }
  for (const s of TIPS_ZH) assert.ok(CJK.test(s), s);
});

test('Chinese by default (no ?lang=en in Node), placeholders filled, unknown keys come back as themselves', () => {
  assert.equal(LANG, 'zh');
  assert.equal(t('bn.go'), '开始！');
  assert.equal(t('bn.oneMinute'), '还剩 1 分钟！');
  assert.equal(t('hud.yeah'), '耶！');
  assert.equal(t('jd.wins', { team: '橘子队' }), '橘子队赢了！');
  assert.equal(t('no.such.key'), 'no.such.key');
});

test('every weapon, sub, special, stage, team ink and bot difficulty has a Chinese name', () => {
  for (const id of Object.keys(WEAPONS)) assert.ok(CJK.test(gameName('weapon', id, WEAPONS[id].name)), `weapon ${id}`);
  for (const id of Object.keys(WEAPONS)) if (WEAPONS[id].kind) assert.ok(CJK.test(gameName('kind', WEAPONS[id].kind, '')), `kind ${WEAPONS[id].kind}`);
  for (const id of Object.keys(SUBS)) assert.ok(CJK.test(gameName('sub', id, SUBS[id].name)), `sub ${id}`);
  for (const id of Object.keys(SPECIALS)) assert.ok(CJK.test(gameName('special', id, SPECIALS[id].name)), `special ${id}`);
  for (const m of MAPS) assert.ok(CJK.test(gameName('map', m.id, m.name)), `map ${m.id}`);
  for (const p of [...TEAM_PALETTES, COLORBLIND_PALETTE]) for (const n of p.names) assert.ok(CJK.test(teamName(n)), `team ${n}`);
  for (const n of TEAM_NAMES) assert.ok(CJK.test(teamName(n)) && CJK.test(teamName(n.toUpperCase())), `team ${n}`);
  for (const id of Object.keys(DIFFICULTY)) assert.ok(CJK.test(gameName('diff', id, DIFFICULTY[id].name)), `difficulty ${id}`);
});

// ---- the scan: string literals in UI code on her path that read as English words
const read = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
// strip comments (line and block), keeping string literals intact
function stripComments(src) {
  let out = '', i = 0, q = null;
  while (i < src.length) {
    const c = src[i], d = src[i + 1];
    if (q) { out += c; if (c === '\\') { out += d; i += 2; continue; } if (c === q) q = null; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && d === '/') { while (i < src.length && src[i] !== '\n') i++; continue; }
    if (c === '/' && d === '*') { i = src.indexOf('*/', i + 2); i = i < 0 ? src.length : i + 2; continue; }
    out += c; i++;
  }
  return out;
}
// a method of menus.js by name: from its line to the next method at the same indent
function method(src, name) {
  const a = src.indexOf(`\n  ${name}(`);
  assert.ok(a >= 0, `menus.js has ${name}`);
  const re = /\n {2}[_a-zA-Z$][\w$]*\([^)]*\) \{\n/g; re.lastIndex = a + 3;
  const m = re.exec(src);
  return src.slice(a, m ? m.index : src.length);
}
// words that may stay: key caps and pad glyph names, proper names (the game, fonts, the author, the licence), units
const KEEP = new Set(['Enter', 'Esc', 'DPad', 'Start', 'View', 'SHIFT', 'SPACE', 'TAB', 'ESC', 'MOUSE', 'LMB', 'RMB', 'LS', 'RS', 'LT', 'RT', 'LB', 'RB',
  'INKWAVE', 'INKWAVE by Jayden Davis', 'MIT License · github.com/jaydendavisnc/inkwave', 'SIL Open Font License', 'three.js', 'Titan One — Font Diner', 'Rubik — Hubert & Fischer',
  'OT', 'II', 'III', 'Digit', 'Escape', 'KeyP', 'Rubik', 'Titan One', 'Titan One, sans-serif',
  'Player', 'Sun', 'Sea']);   // (the stored default profile name, compared not shown; the colour-blind palette's own names, shown through teamName)
function englishLiterals(code) {
  const found = [];
  const re = /(['"`])((?:\\.|(?!\1)[^\\\n])*)\1/g;
  for (const m of code.matchAll(re)) {
    const s = m[2];
    if (KEEP.has(s) || CJK.test(s)) continue;
    if (/iw-|<|\$\{|;|=|#|--|https?:|\.js|\.webp|\.png|^[a-z][\w.:-]*$/.test(s)) continue;   // classes, markup, templates, css, ids, keys
    if (!/[A-Za-z]{2,}/.test(s)) continue;
    if (/[A-Z][a-z]|[A-Z]{2,}|[a-z]{2,} [a-z]{2,}/.test(s)) found.push(s);
  }
  return found;
}

test('no English UI strings left on her path (the screens of menus.js she sees, the HUD layers, the portrait gate)', () => {
  const menus = read('src/ui/menus.js');
  const mod = menus.slice(menus.indexOf('const SETTINGS_TABS'), menus.indexOf('const durLabel'));   // the settings rows / blurbs
  const screens = ['_scr_loading', '_scr_title', '_scr_main', '_scr_learn', '_scr_pause', '_scr_pauseLearn', '_learnSnapshot', '_scr_settings', '_controlsList', '_scr_howto', '_scr_credits', '_toggle', '_slider', '_seg', '_header', '_btn'];
  const parts = [['menus.js settings rows', mod], ['menus.js MENU_DESC', menus.slice(menus.indexOf('const MENU_DESC'), menus.indexOf('const pctFmt'))], ...screens.map((n) => [`menus.js ${n}`, method(menus, n)])];
  for (const f of ['src/ui/hud.js', 'src/ui/hud-boss.js', 'src/ui/hud-learn.js', 'src/learn/forms/ui.js']) parts.push([f, read(f)]);
  const touch = read('src/core/touch.js'); parts.push(['touch.js rotate gate', touch.slice(touch.indexOf('const rotate'), touch.indexOf('this.rotateEl = rotate'))]);
  parts.push(['touch.js buttons', touch.split('\n').filter((l) => /\{ name: '\w+', label:/.test(l)).join('\n')]);
  const art = read('src/ui/menu-art.js'); parts.push(['menu-art.js settings previews', art.slice(art.indexOf('function previewLook'), art.indexOf('export function createPreview'))]);
  const boss = read('src/ui/boss-art.js'); parts.push(['boss-art.js names', boss.slice(boss.indexOf('export const BOSS_NAME'), boss.indexOf('// ----', boss.indexOf('export const BOSS_NAME')))]);
  const main = read('src/main.js'); parts.push(['main.js loading labels', main.split('\n').filter((l) => /await progress\(/.test(l)).join('\n')]);
  parts.push(['main.js kill feed', main.slice(main.indexOf("on('actor:removed'"), main.indexOf("on('respawn'"))]);
  const left = [];
  for (const [where, src] of parts) for (const s of englishLiterals(stripComments(src))) left.push(`${where}: «${s}»`);
  assert.deepEqual(left, [], 'English UI strings outside the dictionary:\n' + left.join('\n'));
});

test('the scan bites: it flags an English label and lets keys, classes and Chinese through', () => {
  const code = `h('b', { class: 'iw-x' }, 'LOW INK'); this._hint('Esc', 'B'); play('ui_click'); h('span', null, '继续'); t('pause.resume'); x = 'Saved!';`;
  assert.deepEqual(englishLiterals(code), ['LOW INK', 'Saved!']);
});
