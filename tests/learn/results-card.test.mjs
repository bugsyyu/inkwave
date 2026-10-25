// The learning level's results card (src/ui/hud-learn.js results(); LEARN §48 review): one card serves every level, and what
// a form or a hook wrote on it for an earlier level used to stay — the quiz's / the boss's / coop2's title on the next level,
// coop2's 「回到房间 / 等房主回房间」 (and a guest's disabled 再来一关), an earlier race's place and stars, the quiz record's
// badge, a 今日小考 key on a duel's card. results() now puts the card back first — but keeps the 今日小考 key learn:done has
// just added for this very result (the puzzle emits learn:done before it fills the card: forms/index.js marks the key).
// A small DOM below stands in for the page (elements, classes, class / tag selectors, insertBefore, before, remove).
// 用法：node --test tests/learn/*.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

class ClassList {
  constructor() { this.s = new Set(); }
  add(...c) { for (const x of c) this.s.add(x); }
  remove(...c) { for (const x of c) this.s.delete(x); }
  toggle(c, on) { const v = on === undefined ? !this.s.has(c) : !!on; if (v) this.s.add(c); else this.s.delete(c); return v; }
  contains(c) { return this.s.has(c); }
}
class El {
  constructor(tag) {
    this.tagName = String(tag).toUpperCase(); this.classList = new ClassList(); this.children = []; this.parentElement = null;
    this.attrs = {}; this.dataset = {}; this.listeners = {}; this.hidden = false; this.disabled = false; this._text = ''; this._html = '';
    this.style = { cssText: '', setProperty() {}, removeProperty() {}, getPropertyValue: () => '' };
  }
  get className() { return [...this.classList.s].join(' '); }
  set className(v) { this.classList.s = new Set(String(v).split(/\s+/).filter(Boolean)); }
  setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'hidden') this.hidden = true; }
  getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
  removeAttribute(k) { delete this.attrs[k]; if (k === 'hidden') this.hidden = false; }
  appendChild(c) { if (c.parentElement) c.remove(); this.children.push(c); c.parentElement = this; return c; }
  append(...cs) { for (const c of cs) this.appendChild(typeof c === 'string' ? new Text(c) : c); }
  insertBefore(c, ref) {
    if (c.parentElement) c.remove();
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i < 0) this.children.push(c); else this.children.splice(i, 0, c);
    c.parentElement = this; return c;
  }
  before(c) { this.parentElement.insertBefore(c, this); }
  remove() { const p = this.parentElement; if (p) { p.children = p.children.filter((x) => x !== this); this.parentElement = null; } }
  get firstChild() { return this.children[0] || null; }
  addEventListener(t, f) { (this.listeners[t] || (this.listeners[t] = [])).push(f); }
  removeEventListener(t, f) { this.listeners[t] = (this.listeners[t] || []).filter((x) => x !== f); }
  set textContent(v) { this._text = String(v); this.children = []; }
  get textContent() { return this._text + this.children.map((c) => c.textContent).join(''); }
  set innerHTML(v) { this._html = String(v); this.children = []; }
  get innerHTML() { return this._html; }
  get offsetWidth() { return 0; }
  focus() {}
  *walk() { for (const c of this.children) { yield c; yield* c.walk(); } }
  // (selectors: a tag, or .class[.class] — a comma list of them)
  matches(sel) {
    return String(sel).split(',').some((one) => {
      const s = one.trim(); if (!s) return false;
      if (s[0] !== '.') return this.tagName === s.toUpperCase();
      return s.split('.').filter(Boolean).every((k) => this.classList.contains(k));
    });
  }
  querySelectorAll(sel) { return [...this.walk()].filter((n) => n.matches(sel)); }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}
class Text extends El { constructor(t) { super('#text'); this._text = String(t); } matches() { return false; } }
globalThis.document = {
  documentElement: new El('html'), head: new El('head'), body: new El('body'),
  createElement: (t) => new El(t), createTextNode: (t) => new Text(t), getElementById: () => null, querySelector: () => null, querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
};
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {};

const { LearnHud } = await import('../../src/ui/hud-learn.js');
const hudOf = () => new LearnHud({ root: new El('div'), el: new El('div'), timerTxt: new El('span'), playSound() {} });
const src = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
// what the forms and hooks write on the card after (or, the quiz key, just before) results() — as they write it
const extra = (L, cls) => { const btns = L.results_.querySelector('.iw-learn__rbtns'); const e = document.createElement('div'); e.className = cls; L.results_.insertBefore(e, btns); return e; };
const quizKey = (L, data) => { const btns = L.results_.querySelector('.iw-learn__rbtns'), b = document.createElement('button'); b.className = 'iw-learn__btn iw-learn__big iw-learn__quiz'; b._forResult = data; btns.insertBefore(b, btns.firstChild); return b; };
const homeKey = (L) => { const btns = L.results_.querySelector('.iw-learn__rbtns'), b = document.createElement('button'); b.className = 'iw-learn__btn iw-learn__big is-dim iw-learn__home'; btns.appendChild(b); return b; };

test('the results card: what an earlier level wrote on it goes — title, the keys\' words and disabled, extra lines, stars, the quiz badge, the pick\'s 回到工作台, an earlier 今日小考 key', () => {
  const L = hudOf();
  // a coop2 guest's card (its title, 「等房主回房间」 disabled, 「离开房间」), a race's place and stars, the quiz record's badge,
  // the pick's 回到工作台, a puzzle's 今日小考 key — all written for that earlier level
  const a = { done: 3, total: 9, due: [], locks: 2 };
  quizKey(L, a);
  L.results(a, {});
  L.rTitle.textContent = '队友离开了 · 这一关先到这里';
  L.rAgain.querySelector('span').textContent = '等房主回房间'; L.rAgain.disabled = true;
  L.rMenu.querySelector('span').textContent = '离开房间';
  extra(L, 'iw-lf__stars'); extra(L, 'iw-lf__extra'); extra(L, 'iw-qrec'); homeKey(L);
  assert.equal(L.results_.querySelectorAll('.iw-learn__quiz').length, 1, 'that level\'s own quiz key stayed through its results()');
  // the next level: a duel (no quiz key of its own)
  const b = { done: 5, total: 8, due: [], locks: 0 };
  L.results(b, {});
  assert.equal(L.rTitle.textContent, '这一关走完了');
  assert.equal(L.rAgain.querySelector('span').textContent, '再来一关');
  assert.equal(L.rMenu.querySelector('span').textContent, '回到菜单');
  assert.equal(L.rAgain.disabled, false, 'a guest\'s disabled 再来一关 is pressable again');
  for (const c of ['.iw-lf__extra', '.iw-lf__stars', '.iw-qrec', '.iw-learn__home', '.iw-learn__quiz']) assert.equal(L.results_.querySelectorAll(c).length, 0, c + ' from the earlier level');
});

test('the results card: the 今日小考 key learn:done has just put there for this result stays (the puzzle emits learn:done before results())', () => {
  const L = hudOf();
  const a = { done: 1, total: 4, due: [], locks: 0 };
  quizKey(L, a); L.results(a, {});
  const b = { done: 2, total: 4, due: [], locks: 0 };
  const mine = quizKey(L, b);   // (forms/index.js on learn:done, before the card is filled)
  L.results(b, {});
  const left = L.results_.querySelectorAll('.iw-learn__quiz');
  assert.equal(left.length, 1, 'one quiz key');
  assert.equal(left[0], mine, '… this result\'s');
  assert.equal(L.results_.querySelector('.iw-learn__rbtns').firstChild, mine, 'first in the row, where the hook put it');
});

test('the results card: forms/index.js marks its 今日小考 key with the result it was added for; the forms write their titles after results()', () => {
  const F = src('src/learn/forms/index.js');
  assert.match(F, /b\._forResult = data;[^\n]*\n\s*btns\.insertBefore\(b, btns\.firstChild\);/);
  // (the order the reset relies on: a form's own title / extra lines come after its results() call)
  for (const [f, line] of [['src/learn/forms/duel.js', "this.hud.rTitle.textContent = '今日小考做完了'"], ['src/learn/forms/boss.js', 'this.hud.rTitle.textContent = `第 ${this.week} 周周考打完了`'], ['src/learn/forms/coop2.js', "this.hud.rTitle.textContent = this.left"]]) {
    const s = src(f), r = s.indexOf('this.hud?.results(data'), t = s.indexOf(line);
    assert.ok(r > 0 && t > r, `${f}: the title after results()`);
  }
});
