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
  teacher: () => import('../ui/book-pages/teacher.js'),   // (老师, LEARN §46)
});
// 学习版 (IELTS-Base tools/artifact/README.md「学习版里的游戏」, LEARN §51): ?in=learn — the game over the lesson page in Claude,
// on a copy of her data that comes back to her account only as evidence, check-ins and quizzes. None of the book's pages is the
// game's own there (积累本, 学习日志, 学习方法, 老师 would write to the copy): every bookmark is the lesson page's, whose page then
// closes the game and opens that page of its own.
export const inLearn = (search) => /[?&]in=learn(?:&|$)/.test(String(search || ''));
// a lesson-page id → the native page that shows it (null: the lesson page's own, in the iframe)
export function nativeOf(view, search = typeof location !== 'undefined' ? location.search : '') {
  if (inLearn(search)) return null;
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
// { flushed: true } (the page saved what it held) | { answer: data } (an ielts:answer, by its id) | null. Only the book's own
// page window, same origin.
export function pageMessage(e, frameWin, origin) {
  if (!e || !frameWin || e.source !== frameWin || e.origin !== origin) return null;
  const d = e.data;
  if (!d || typeof d !== 'object') return null;
  if (d.type === 'ielts:go' && typeof d.view === 'string' && ID_RE.test(d.view)) return { go: d.view };
  if (d.type === 'ielts:flushed') return { flushed: true };
  if (d.type === 'ielts:answer' && typeof d.id === 'string' && d.id) return { answer: d };
  return null;
}

// 老师 (LEARN §46): what only the lesson page can say — the book asks it (menus.js _scr_book ctx.ask: { type: 'ielts:ask', id,
// what }, its own iframe, made hidden under a native page when there is none yet) and it answers { type: 'ielts:answer', id,
// … } (app/index.html teacherAnswer); no answer within ASK_MS is null (the page then points to the lesson page's own 老师)
export const ASK_MS = 20000;
// makeAsker(post, ms, T) → { ask(what) → Promise<data | null>, send(all), answer(id, data), drop(), size }: the questions by id;
// post(message) → true once it went (the page has loaded); send(true) again after every load (a new address drops what the
// page was asked); no answer within ms → null; drop() → null for all (the book closes)
const TIMERS = { set: (f, ms) => setTimeout(f, ms), clear: (t) => clearTimeout(t) };
export function makeAsker(post, ms = ASK_MS, T = TIMERS) {
  const asks = new Map();
  let n = 0;
  const answer = (id, v) => { const a = asks.get(id); if (!a) return false; asks.delete(id); T.clear(a.t); a.resolve(v); return true; };
  const send = (all) => { asks.forEach((a, id) => { if ((all || !a.sent) && post({ type: 'ielts:ask', id, what: a.what })) a.sent = true; }); };
  return {
    ask: (what) => new Promise((resolve) => {
      const id = 'k' + (++n) + '-' + Date.now().toString(36);
      asks.set(id, { what: String(what), resolve, sent: false, t: T.set(() => answer(id, null), ms) });
      send(false);
    }),
    send, answer,
    drop: () => { Array.from(asks.keys()).forEach((id) => answer(id, null)); },
    get size() { return asks.size; },
  };
}
// answerOf(d) → the teacher answer, its fields checked | null
const str = (x) => (typeof x === 'string' ? x : '');
const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
export function answerOf(d) {
  if (!isObj(d) || d.what !== 'teacher' || typeof d.report !== 'string' || typeof d.title !== 'string') return null;
  const tpl = Array.isArray(d.templates) ? d.templates.filter((t) => Array.isArray(t) && typeof t[0] === 'string' && typeof t[1] === 'string') : null;
  const wk = Array.isArray(d.weeks) ? d.weeks.filter((x) => isObj(x) && typeof x.id === 'string' && typeof x.title === 'string') : null;
  return {
    title: d.title, report: d.report, fmt: d.fmt === 'copy' ? 'copy' : 'dl', format: str(d.format),
    notes: isObj(d.notes) && typeof d.notes.text === 'string' ? { text: d.notes.text, meta: str(d.notes.meta) } : null,
    templates: tpl && tpl.length ? tpl.map((t) => [t[0], t[1]]) : null,
    weeks: wk ? wk.map((x) => ({ id: x.id, title: x.title, builtin: x.builtin === true, days: Number(x.days) || 0 })) : null,
    today: str(d.today),
  };
}
