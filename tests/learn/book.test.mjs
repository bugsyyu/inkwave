// 课本 (游戏为主体 第三期第一步, docs/LEARN.md §37; IELTS-Base docs/GAME-FIRST.md §4): a book in the game whose pages are
// the lesson page's own (a same-origin iframe, ../index.html?classic=1&embed=<page>). The bookmarks, the page's URL, the
// messages the page may send; one copy of her data (the game pushes what it holds before the page loads, reads her blob
// again after the book closes); the menu, the screen and its sticker look. A made-up learner — nothing here reads
// app/my-progress.*.
// 用法：node --test tests/learn/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BOOK_TABS, BOOK_ALIAS, bookTab, pageUrl, flipDir, sameOrigin, pageMessage } from '../../src/learn/book.js';
import { loadWeek, daySteps } from '../../src/learn/content.js';
import { store, setBackend, KEY } from '../../src/learn/store.js';
import { DATA_KEY, PREF_KEY, readBlob, herEv, invalidate } from '../../src/learn/workbench.js';

const src = (p) => fs.readFileSync(new URL('../../' + p, import.meta.url), 'utf8');

test('bookmarks: the nine of GAME-FIRST §4 in order, the lesson page\'s own ids; its other pages under the one that holds them', () => {
  assert.deepEqual(BOOK_TABS.map((b) => b.label), ['今天的课', '复盘', '考试', '路线', '积累本', '学习日志', '学习方法', '老师', '设置']);
  assert.deepEqual(BOOK_TABS.map((b) => b.id), ['today', 'review', 'exam', 'roadmap', 'notes', 'log', 'guides', 'teacher', 'settings']);
  BOOK_TABS.forEach((b) => assert.match(b.c, /^#[0-9a-f]{6}$/));
  assert.equal(new Set(BOOK_TABS.map((b) => b.c)).size, 9, 'a colour each');
  assert.deepEqual(BOOK_ALIAS, { mistakes: 'exam', mocks: 'exam', practice: 'exam', resources: 'guides' });
  assert.equal(bookTab('notes'), 'notes');
  assert.equal(bookTab('mistakes'), 'exam');
  assert.equal(bookTab('resources'), 'guides');
  assert.equal(bookTab('game'), null);
  assert.equal(bookTab(undefined), null);
  assert.equal(bookTab('constructor'), null, 'not a page: nothing from Object.prototype');
  assert.equal(Object.isFrozen(BOOK_TABS) && Object.isFrozen(BOOK_TABS[0]), true);
});

test('the page\'s address: next to the game, ?classic=1&embed=<page>; an id the page would not take opens 今天', () => {
  assert.equal(pageUrl('notes'), '../index.html?classic=1&embed=notes');
  assert.equal(pageUrl('mistakes'), '../index.html?classic=1&embed=mistakes');
  assert.equal(pageUrl('../x'), '../index.html?classic=1&embed=today');
  assert.equal(pageUrl('Notes'), '../index.html?classic=1&embed=today');
  assert.equal(pageUrl(null), '../index.html?classic=1&embed=today');
});

test('the leaf turns forward to a later bookmark, back to an earlier one', () => {
  assert.equal(flipDir('today', 'notes'), 1);
  assert.equal(flipDir('settings', 'review'), -1);
  assert.equal(flipDir('notes', 'mistakes'), -1, '错题本 is under 考试');
  assert.equal(sameOrigin({ origin: 'ielts-base://app' }), 'ielts-base://app');
  assert.equal(sameOrigin({ origin: 'null' }), '/');
  assert.equal(sameOrigin(null), '/');
});

test('messages: only the book\'s own page window, same origin; ielts:go with a page id, ielts:flushed', () => {
  const frame = {}, O = 'ielts-base://app';
  const ev = (data, source = frame, origin = O) => ({ data, source, origin });
  assert.deepEqual(pageMessage(ev({ type: 'ielts:go', view: 'log' }), frame, O), { go: 'log' });
  assert.deepEqual(pageMessage(ev({ type: 'ielts:go', view: 'game' }), frame, O), { go: 'game' });
  assert.deepEqual(pageMessage(ev({ type: 'ielts:flushed' }), frame, O), { flushed: true });
  assert.equal(pageMessage(ev({ type: 'ielts:go', view: 'log' }, {}), frame, O), null, 'another window');
  assert.equal(pageMessage(ev({ type: 'ielts:go', view: 'log' }, frame, 'https://evil.example'), frame, O), null, 'another origin');
  assert.equal(pageMessage(ev({ type: 'ielts:go', view: '../x' }), frame, O), null);
  assert.equal(pageMessage(ev({ type: 'ielts:show', view: 'log' }), frame, O), null, 'what the book sends is not for the book');
  assert.equal(pageMessage(ev('ielts:go'), frame, O), null);
  assert.equal(pageMessage(null, frame, O), null);
  assert.equal(pageMessage(ev({ type: 'ielts:go', view: 'log' }), null, O), null, 'no page yet');
});

// ---------- one copy of her data ----------
function memory(init) {
  const m = new Map(Object.entries(init || {}));
  return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } };
}
const herBlob = (base, extra) => JSON.stringify(Object.assign({ profile: { v: 1, setup: true, startDate: '2026-10-12', accent: 'us' }, notes: {}, base: base || {} }, extra || {}));

test('workbench.invalidate(): her blob is read once a session — after the book wrote it, the game reads it again', () => {
  const b = memory({ [DATA_KEY]: herBlob({ 'ev-2026-10-12': { v: 2, it: { 'w:a': { '2026-10-14': { '090000': [1, 'L'] } } } } }) });
  assert.ok(readBlob(b));
  assert.deepEqual(Object.keys(herEv(b)), ['ev-2026-10-12']);
  // the lesson page in the book saves her blob (a phrase in 积累本, another week's answer)
  b.setItem(DATA_KEY, herBlob({ 'ev-2026-10-12': { v: 2, it: {} }, 'ev-2026-10-19': { v: 2, it: { 'w:b': { '2026-10-20': { '100000': [0, 'L'] } } } } }, { notes: { n1: { en: 'a new phrase' } } }));
  assert.deepEqual(Object.keys(herEv(b)), ['ev-2026-10-12'], 'still the copy read before (a parse of megabytes is not redone per call)');
  invalidate();
  assert.deepEqual(Object.keys(herEv(b)).sort(), ['ev-2026-10-12', 'ev-2026-10-19']);
  assert.deepEqual(readBlob(b).o.notes, { n1: { en: 'a new phrase' } });
});

test('store.flushWorkbench(): before the page loads, the game\'s answers are in her account now (not 800 ms later); invalidateWorkbench() re-reads her clock and blob', async () => {
  const w1 = await loadWeek(1), q = daySteps(w1, 1).find((s) => s.meta.type === 'grammar').items[0];
  const b = memory({ [DATA_KEY]: herBlob(), [PREF_KEY]: JSON.stringify({ tz: 'sin' }) });
  setBackend(b); store.load();
  assert.equal(store.flushWorkbench(), false, 'not attached: nothing to flush');
  const detach = store.attachWorkbench({ delay: 800 });
  store.recordFirst({ itemId: q.id, ok: true, day: '2026-10-15', at: '2026-10-15T09:00:00+08:00' });
  assert.equal(JSON.parse(b.m.get(DATA_KEY)).base['ev-2026-10-12'], undefined, 'waiting for the 800 ms push');
  assert.equal(store.flushWorkbench(), true);
  assert.deepEqual(JSON.parse(b.m.get(DATA_KEY)).base['ev-2026-10-12'].it[q.id], { '2026-10-15': { '090000': [1, 'L'] } }, 'in her account at once');
  assert.equal(JSON.parse(b.m.get(KEY)).pushed, JSON.parse(b.m.get(KEY)).n);
  // nothing pending: a second flush writes nothing
  const raw = b.m.get(DATA_KEY);
  store.flushWorkbench();
  assert.equal(b.m.get(DATA_KEY), raw);
  // the page changed her blob while the book was open: the game reads it again once it closes
  const o = JSON.parse(raw); o.notes = { n2: { en: 'by the book' } };
  b.setItem(DATA_KEY, JSON.stringify(o));
  store.invalidateWorkbench();
  assert.deepEqual(readBlob(b).o.notes, { n2: { en: 'by the book' } });
  assert.equal(store.hasAny(q.id), true, 'her answer, read again, still counts');
  detach();
});

// ---------- the menu, the screen ----------
const MENUS = src('src/ui/menus.js'), CSS = src('styles/ui.css'), MAIN = src('src/main.js'), TOUCH = src('src/core/touch.js');
const BOOK = MENUS.slice(MENUS.indexOf('  _scr_book() {'), MENUS.indexOf('  _startLearn(st, from = null) {'));

test('menu (her App): 课本 is a screen of its own, on the main menu over 选关 · 回课本, with or without her today', () => {
  assert.match(MENUS, /const SCREENS = \[[^\]]*'book'/);
  assert.match(MENUS, /id: 'textbook', label: t\('main\.textbook'\)[^\n]*accept: \(\) => this\._go\('book'\)/);
  assert.match(MENUS, /items\.splice\(items\.indexOf\(book\), 0, textbook\);/);
  assert.match(MENUS, /\{ \.\.\.learn, cls: 'iw-btn--menu iw-btn--xl iw-btn--primary iw-btn--learn' \}, textbook, book,/);
  assert.match(TOUCH, /PORTRAIT_SCREENS = new Set\(\[[^\]]*'book'/, 'upright on a phone: no turn-your-phone banner');
  assert.match(src('src/ui/i18n.js'), /'main\.textbook': \['课本 · TEXTBOOK', '课本'\]/);
});

test('screen: the game pushes before the page loads, the page saves before the book closes (≤ 400 ms), the game reads again after', () => {
  assert.ok(BOOK.length > 1000, 'found _scr_book');
  const flush = BOOK.indexOf('learnStore.flushWorkbench()'), frame = BOOK.indexOf("h('iframe'");
  assert.ok(flush > 0 && frame > flush, 'flushWorkbench before the iframe is made');
  assert.match(BOOK, /src: pageUrl\(want\)/);
  assert.match(BOOK, /postMessage\(\{ type: 'ielts:flush' \}, TO\)/);
  assert.match(BOOK, /t = setTimeout\(down, 400\)/);
  assert.match(BOOK, /destroy: \(\) => \{[\s\S]*removeEventListener\('message', onMsg\)[\s\S]*learnStore\.invalidateWorkbench\(\)/);
  assert.match(BOOK, /if \(m\.go === 'game'\) shut\(\); else if \(bookTab\(m\.go\)\) turn\(m\.go\);/);
  assert.match(BOOK, /postMessage\(\{ type: 'ielts:show', view \}, TO\)/);
  assert.match(BOOK, /onBack: \(\) => shut\(\)/);
  assert.match(MAIN, /this\._bookHold = s === 'book' && G\.mode === 'menu';/);
  assert.match(MAIN, /if \(this\.frozen \|\| this\._building \|\| this\._bookHold\) return;/, 'the stage behind holds its frame while she reads');
});

test('look: INKWAVE\'s sticker language, ≥ 44 pt to tap, only transform / opacity move, reduced motion fades', () => {
  const a = CSS.indexOf('游戏为主体 第三期第一步: 课本'), css = CSS.slice(a);
  assert.ok(a > 0);
  assert.match(css, /\.iw-book__tab \{[^}]*height: 56px[^}]*box-shadow: 0 0 0 2\.5px var\(--k\)/);
  assert.match(css, /\.iw-book__tabs \{[^}]*margin-bottom: -8px/, 'the page covers 8 px of a tab: 48 px of it shows');
  assert.doesNotMatch(BOOK, /\.scrollIntoView\(/, 'the strip scrolls sideways only');
  assert.match(css, /\.iw-book__close \{[^}]*height: 48px[^}]*box-shadow: 0 0 0 3px var\(--k\), 0 5px 0 3px var\(--k\)/);
  assert.match(css, /orientation: landscape\) and \(max-height: 520px\) \{[\s\S]*\.iw-book__tab \{ height: 52px;[\s\S]*\.iw-book__close \{[^}]*width: 58px; height: 58px/);
  assert.match(css, /\.iw-book__page \{[^}]*box-shadow: 0 0 0 3px var\(--k\), 0 8px 0 3px var\(--k\)/);
  assert.match(css, /\.iw-book__title \{[^}]*font-size: 76px/);
  assert.match(BOOK, /class: 'iw-book__title iw-display'/, 'Titan One with the ink outline');
  assert.doesNotMatch(css, /backdrop-filter/);
  for (const m of css.matchAll(/@keyframes [\w-]+ \{([\s\S]*?)\n?\}\n/g)) {
    const props = [...m[1].matchAll(/([a-z-]+):/g)].map((x) => x[1]);
    props.forEach((p) => assert.ok(['transform', 'opacity'].includes(p), 'keyframes move ' + p));
  }
  for (const m of css.matchAll(/transition: ([^;]+);/g)) {
    m[1].split(/,(?![^(]*\))/).map((x) => x.trim().split(' ')[0]).forEach((p) => assert.ok(['transform', 'opacity', 'visibility', 'filter'].includes(p), 'transition on ' + p));
  }
  assert.match(css, /\.iw-book__tab:active \{[^}]*transition-duration: 0s/, 'pressed: the same frame');
  assert.match(css, /animation-delay: calc\(var\(--i, 0\) \* 45ms \+ 520ms\)/, 'the bookmarks come in staggered (40–80 ms)');
  const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(rm, /\.iw-book__cover \{ display: none; \}/);
  assert.match(rm, /\.iw-book__leaf \{ display: none; \}/);
  assert.match(rm, /opacity \.3s/);
});
