// src/learn/book.js — 游戏为主体 第三期第一步（IELTS-Base docs/GAME-FIRST.md §4「做法」; the owner 10-17: 「游戏不再是子版块，
// 而是主体，围绕游戏来管理学习进度」). 课本: a book in the game whose pages are the lesson page's own — a same-origin iframe,
// ../index.html?classic=1&embed=<page> (app/index.html html.embed: no sky, no rail, a clear background, INKWAVE's ink and
// type) — so nothing of the workbench is left out and her data stays one copy (the same localStorage; the page listens to
// 'storage'). Later the pages go native one by one and leave the book. Pure: the bookmarks, the page's URL, the messages
// the page sends (app/index.html embedTell). Node tests import it.

// 第三期第二步 (LEARN §43): the pages the game draws itself — bookmark id → its module, loaded when first wanted. A module is
// { mount(host, ctx) → { destroy(), flush?(), onFocus?(el, nav) } } (src/ui/book-pages/kit.js has ctx). The other bookmarks
// stay the lesson page's iframe, made only when one of them is open. A page that goes native is one line here.
export const NATIVE_PAGES = Object.freeze({
  notes: () => import('../ui/book-pages/notes.js'),
  log: () => import('../ui/book-pages/log.js'),
  guides: () => import('../ui/book-pages/guides.js'),   // (学习方法 and its 资源, LEARN §45)
});
// a lesson-page id → the native page that shows it (null: the lesson page's own, in the iframe)
export function nativeOf(view) {
  const t = bookTab(view);
  return t && Object.prototype.hasOwnProperty.call(NATIVE_PAGES, t) ? t : null;
}

// the bookmarks, in the book's order (the lesson page's Views ids); c: the sticker's colour (dark --k text on all of them)
export const BOOK_TABS = Object.freeze([
  { id: 'today', label: '今天的课', c: '#ff8a14' },
  { id: 'review', label: '复盘', c: '#a98bff' },
  { id: 'exam', label: '考试', c: '#ff5f8f' },
  { id: 'roadmap', label: '路线', c: '#3ddc97' },
  { id: 'notes', label: '积累本', c: '#ffd21a' },
  { id: 'log', label: '学习日志', c: '#5cc8ff' },
  { id: 'guides', label: '学习方法', c: '#c6f432' },
  { id: 'teacher', label: '老师', c: '#ff9e7a' },
  { id: 'settings', label: '设置', c: '#d7d0e8' },
].map(Object.freeze));
// the lesson page's other pages → the bookmark that holds them (app/index.html EXAM_AT: 错题本 / 模考记录 / 批改陪练 are 考试's)
export const BOOK_ALIAS = Object.freeze({ mistakes: 'exam', mocks: 'exam', practice: 'exam', resources: 'guides' });
const ID_RE = /^[a-z]{1,24}$/;
const IDS = BOOK_TABS.map((b) => b.id);

// a lesson-page id → its bookmark (null: not a page of the book)
export function bookTab(view) {
  const v = String(view == null ? '' : view);
  return IDS.includes(v) ? v : Object.prototype.hasOwnProperty.call(BOOK_ALIAS, v) ? BOOK_ALIAS[v] : null;
}
// the page's address, next to the game (app/game/ → app/index.html); an id the page would not take opens 今天
export function pageUrl(view, base = '../index.html') {
  return base + '?classic=1&embed=' + (typeof view === 'string' && ID_RE.test(view) ? view : 'today');
}
// which way the leaf turns: +1 to a later bookmark (right to left, like reading on), -1 back
export function flipDir(from, to) {
  const a = IDS.indexOf(bookTab(from)), b = IDS.indexOf(bookTab(to));
  return b < a ? -1 : 1;
}
// the target origin for postMessage to the page: this origin ('/' says the same where an origin serializes as 'null')
export function sameOrigin(loc) {
  const o = loc && loc.origin;
  return o && o !== 'null' ? o : '/';
}
// a message event → { go: view } (the page wants another page: the book turns to it; 'game' closes the book) |
// { flushed: true } (the page saved what it held) | null. Only the book's own page window, same origin.
export function pageMessage(e, frameWin, origin) {
  if (!e || !frameWin || e.source !== frameWin || e.origin !== origin) return null;
  const d = e.data;
  if (!d || typeof d !== 'object') return null;
  if (d.type === 'ielts:go' && typeof d.view === 'string' && ID_RE.test(d.view)) return { go: d.view };
  if (d.type === 'ielts:flushed') return { flushed: true };
  return null;
}
