// 中文化 (docs/LEARN.md §15): the UI dictionary src/ui/i18n.js — every key has its English and its Chinese, the two
// carry the same {placeholders}; and a scan of the screens on her path (the loading / title / main / learn / pause /
// settings / how-to / credits screens of menus.js, the HUD, the boss HUD, the learn layers, the portrait gate) for
// English UI strings that do not go through t(). Pure: reads files, imports only i18n.js (no DOM).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DICT, TIPS_ZH, t, LANG, gameName, teamName, TITLE_ZH, BOT_ZH, botNames, LOOK_ZH, lookName, presetText } from '../../src/ui/i18n.js';
import { WEAPONS, SUBS, SPECIALS, MAPS, TEAM_PALETTES, COLORBLIND_PALETTE, TEAM_NAMES, DIFFICULTY, BOT_NAMES } from '../../src/config.js';
import * as LOOK from '../../src/game/character-style.js';

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

// I (LEARN §17): the word lists that stand beside an English data list — index for index, nothing missing
test('the bots, the splashtag titles, the locker options and every blurb have their Chinese, list for list', () => {
  for (const n of BOT_NAMES) assert.ok(CJK.test(BOT_ZH[n] || ''), `bot ${n}`);
  assert.equal(new Set(Object.values(BOT_ZH)).size, BOT_NAMES.length, 'two bots share a nickname');
  assert.deepEqual(botNames(BOT_NAMES).length, BOT_NAMES.length);
  const src = readFileSync(new URL('../../src/ui/menus.js', import.meta.url), 'utf8');
  const list = (name) => JSON.parse(src.match(new RegExp(`^const ${name} = (\\[.*\\]);`, 'm'))[1].replace(/'/g, '"'));
  assert.equal(TITLE_ZH.adj.length, list('TITLE_ADJ').length, 'TITLE_ADJ');
  assert.equal(TITLE_ZH.noun.length, list('TITLE_NOUN').length, 'TITLE_NOUN');
  const lists = { hair: LOOK.HAIR_STYLE_NAMES, hat: LOOK.HAT_NAMES, eyes: LOOK.IRIS_NAMES, brows: LOOK.BROW_NAMES, skin: LOOK.SKIN_NAMES, outfit: LOOK.OUTFIT_NAMES };
  for (const [k, en] of Object.entries(lists)) {
    assert.equal(LOOK_ZH[k].length, en.length, `LOOK_ZH.${k}`);
    en.forEach((x, i) => assert.ok(CJK.test(lookName(k, i, x)), `${k} ${x}`));
  }
  for (const p of LOOK.PRESETS) { const [n, b] = presetText(p); assert.ok(CJK.test(n) && CJK.test(b), `preset ${p.id}`); }
  for (const [kind, all] of [['wblurb', WEAPONS], ['sblurb', SUBS], ['spblurb', SPECIALS]]) for (const [id, o] of Object.entries(all)) {
    const k = { wblurb: 'wb.', sblurb: 'sb.', spblurb: 'spb.' }[kind] + id;
    assert.ok(DICT[k], `${k} missing`);
    assert.equal(DICT[k][0], o.blurb, `${k}: the English column is config's own blurb`);
    assert.ok(CJK.test(gameName(kind, id, o.blurb)), k);
  }
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
  'Player', 'Sun', 'Sea',   // (the stored default profile name, compared not shown; the colour-blind palette's own names, shown through teamName)
  // I (LEARN §17): key names compared in the room-code field, a tag name, the line-up's VS splat, two class names
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Backspace', 'Delete', 'NumpadEnter', 'Tab', 'INPUT', 'VS', 'is-on is-ready',
  // LEARN §55: key codes the board's keys compare on a desktop (hud-learn.js _key: R 看全文, L 听全文) and a tag name — never shown
  'KeyR', 'KeyL', 'TEXTAREA',
  // lookup keys, never shown: the session's own error / start-block messages that JOIN_ERR and BLOCK_KEY translate
  'Room not found', 'Room is full', 'Match in progress', 'Could not connect', 'Room code taken', 'Lost connection to the room',
  'Needs 2+ players — no bots on this stage', 'Needs a player on each team']);
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
  const screens = ['_scr_loading', '_scr_title', '_scr_main', '_scr_learn', '_scr_pause', '_scr_pauseLearn', '_learnSnapshot', '_scr_settings', '_controlsList', '_scr_howto', '_scr_credits', '_toggle', '_slider', '_seg', '_header', '_btn',
    // I (LEARN §17): every other screen reachable from the App's main menu — the online hub, the room, a lost room
    '_scr_online', '_scr_lobby', '_roomGone', '_nameRow', '_scr_loadout', '_scr_locker', '_lockerSlots', '_scr_results',
    // 选游戏方式 (LEARN §49): her App's first screen in the game, and what it adds to a level's results card
    '_scr_pick', '_pickResults'];
  const parts = [['menus.js settings rows', mod], ['menus.js MENU_DESC', menus.slice(menus.indexOf('const MENU_DESC'), menus.indexOf('const pctFmt'))], ...screens.map((n) => [`menus.js ${n}`, method(menus, n)])];
  // the module's word tables those screens read: team labels, emotes, room-code errors (the splashtag titles' English list
  // stays as the data: its Chinese is i18n.js TITLE_ZH, index for index), times of day, modes, stat names
  const between = (a, b) => menus.slice(menus.indexOf(a), menus.indexOf(b));
  parts.push(['menus.js TEAM_LABEL … JOIN_ERR', between('const TEAM_LABEL', 'const STAGE_DIR').split('\n').filter((l) => !/^const TITLE_(ADJ|NOUN)/.test(l)).join('\n')]);
  parts.push(['menus.js TIME_INFO', between('const TIME_INFO', 'const TIPS_EN')]);
  parts.push(['menus.js MODE_INFO', between('const MODE_INFO', 'const LEARN_MODE')]);
  parts.push(['menus.js STAT_LABELS', menus.split('\n').filter((l) => /^const STAT_LABELS/.test(l)).join('\n')]);
  parts.push(['menus.js LOCKER_TABS', between('const LOCKER_TABS', 'const MENU_DESC')]);
  parts.push(['menus.js ZONE_REASON', between('const ZONE_REASON', 'const DIFF_INFO')]);
  { const art = read('src/ui/menu-art.js'); parts.push(['menu-art.js awards', art.slice(art.indexOf('export const AWARDS'), art.indexOf('export function medalMarkup'))]); }
  { const m = read('src/main.js'); parts.push(['main.js results (XP parts, stage name)', m.slice(m.indexOf('  async _judge('), m.indexOf("this.menus?.showResults(data);"))]); }
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

test('?lang=en is INKWAVE\'s original English (a fresh module instance with that query)', async () => {
  const had = Object.getOwnPropertyDescriptor(globalThis, 'location');
  Object.defineProperty(globalThis, 'location', { value: { search: '?learn=w1d1&lang=en' }, configurable: true, writable: true });
  try {
    const en = await import('../../src/ui/i18n.js?lang-en-test');
    assert.equal(en.LANG, 'en'); assert.equal(en.isZh, false);
    assert.equal(en.t('bn.go'), 'GO!');
    assert.equal(en.t('bn.oneMinute'), '1 minute left!');
    assert.equal(en.t('hud.yeah'), 'YEAH!');
    assert.equal(en.t('main.play'), 'PLAY');
    assert.equal(en.t('jd.wins', { team: 'TANGERINE' }), 'TANGERINE WINS!');
    assert.equal(en.gameName('weapon', 'shooter', 'Spritzer'), 'Spritzer');
    assert.equal(en.teamName('Tangerine'), 'Tangerine');
  } finally {
    if (had) Object.defineProperty(globalThis, 'location', had); else delete globalThis.location;
  }
});
