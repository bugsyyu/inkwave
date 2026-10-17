// 游戏为主体（IELTS-Base docs/GAME-FIRST.md 第一期; the owner 10-17: 「以后直接游戏模式取代原有的雅思整个app的原有设计，游戏不再是
// 子版块，而是主体，围绕游戏来管理学习进度」): her App opens the game as its front page. The lesson page hands in her course's
// today (learn/app.js appToday); the main menu's first button is that day's level; 回课本 goes back with ?classic (the lesson
// page stays for the session); a push that changed her blob is mirrored into the App's folder (workbench.js mirror — the
// same message as app/native.js mirrorFlush); a game that cannot start hands her back to the lesson page (index.html).
// 用法：node --test tests/learn/game-first.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { appToday, BOOK_URL } from '../../src/learn/app.js';
import { DATA_KEY, mirror, mirrorFlush, MIRROR_WAIT, _reset } from '../../src/learn/workbench.js';

const src = (f) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');

test('her course\'s today from the lesson page: ?from=app&today=wXdY[&done=1]; anything else is no today', () => {
  assert.deepEqual(appToday('?from=app&today=w2d5', 3, 7), { week: 2, day: 5, done: false, inGame: true });
  assert.deepEqual(appToday('?from=app&today=w3d7&done=1', 3, 7), { week: 3, day: 7, done: true, inGame: true });
  assert.deepEqual(appToday('?from=app&today=w5d1', 3, 7), { week: 5, day: 1, done: false, inGame: false }, 'a week the game has not got: the picker');
  for (const q of ['?today=w2d5', '?from=app', '?from=app&today=w2d8', '?from=app&today=w0d1', '?from=app&today=2-5', '', null]) assert.equal(appToday(q, 3, 7), null, String(q));
  assert.equal(BOOK_URL, '../index.html?classic=1');
});

test('the main menu in her App: today\'s level first (its planned form, the due words once the week loads), 选关 next, 回课本 with ?classic', () => {
  const M = src('src/ui/menus.js');
  assert.ok(/const APP_TODAY = typeof location !== 'undefined' \? appToday\(location\.search\) : null;/.test(M));
  assert.ok(/id: 'today', label: T\.done \? '今天学完了 · 再练一关' : '开始今天的关'/.test(M), 'the today button');
  assert.ok(/accept: \(\) => this\._startLearn\(\{ week: T\.week, day: T\.day, kind: 'plan' \}\)/.test(M), 'it starts the day\'s planned form');
  assert.ok(/items\.unshift\(today, \{ \.\.\.learn, label: '选关'/.test(M), '选关 right after');
  assert.ok(/learnStore\.due\(T\.week\)\.length/.test(M) && /要复习 \$\{n\} 个/.test(M), 'the due words');
  assert.ok(/location\.href = BOOK_URL;/.test(M) && !/location\.href = '\.\.\/index\.html'/.test(M), '回课本 keeps the lesson page for the session');
  assert.ok(/if \(this\.current === 'learn' \|\| this\.current === 'main'\) this\.show\(null, \{ instantLeave: true \}\)/.test(M), 'the menu leaves when today\'s level starts from the main menu');
  assert.ok(/const st = this\._learnPick \|\| \(this\._learnPick = T \?/.test(M), 'the picker opens on her today');
});

test('the App\'s mirror: after a push that changed her blob, the stored text goes to the App within MIRROR_WAIT (at once when the page hides); the same text never twice; nothing outside the App', async () => {
  const posted = [];
  const m = new Map();
  const ls = { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)) };
  const blob = JSON.stringify({ profile: { v: 1, setup: true }, base: { 'ev-2026-10-12': { v: 2, it: {} } } });
  m.set(DATA_KEY, blob);
  _reset();
  // outside her App: nothing
  assert.equal(mirror(ls, true), false);
  globalThis.__IELTS_NATIVE = { platform: 'ios' };
  globalThis.webkit = { messageHandlers: { ielts: { postMessage: (msg) => posted.push(msg) } } };
  try {
    assert.equal(mirror(ls), true, 'scheduled');
    assert.equal(posted.length, 0, 'not at once');
    assert.equal(mirrorFlush(), true, 'the page hides: sent now');
    assert.deepEqual(posted, [{ type: 'mirror', text: blob }], 'native.js mirrorFlush\'s message: the blob exactly as stored');
    assert.equal(mirror(ls, true), false, 'the same text is not sent twice');
    m.set(DATA_KEY, blob.replace('"it":{}', '"it":{"x":{}}'));
    assert.equal(mirror(ls, true), true); assert.equal(posted.length, 2);
    m.set(DATA_KEY, JSON.stringify({ base: {} }));
    assert.equal(mirror(ls, true), false, 'a blob without a profile is never sent (the App restores only one with a profile)');
    m.set(DATA_KEY, blob + 'x');
    assert.equal(mirror(ls, true), false, 'nor one that does not parse');
    assert.equal(mirrorFlush(), false, 'nothing pending: nothing sent');
    // the debounce: one send per MIRROR_WAIT
    m.set(DATA_KEY, blob.replace('"setup":true', '"setup":false'));
    mirror(ls); mirror(ls); mirror(ls);
    await new Promise((r) => setTimeout(r, MIRROR_WAIT + 200));
    assert.equal(posted.length, 3, 'three pushes in a row: one message');
    // other platforms' handlers: nothing
    globalThis.__IELTS_NATIVE = { platform: 'android' };
    m.set(DATA_KEY, blob.replace('"v":1', '"v":2'));
    assert.equal(mirror(ls, true), false);
  } finally { delete globalThis.__IELTS_NATIVE; delete globalThis.webkit; _reset(); }
  // the store wires it: a push that changed her blob mirrors; flush (pagehide / hidden) sends a pending one now
  const S = src('src/learn/store.js');
  assert.ok(/if \(r && r\.ok && r\.changed && r\.changed\.length\) WBK\.mirror\(be\(\), !!now\);/.test(S));
  assert.ok(/const flush = \(\) => \{ if \(t\) run\(true\); else WBK\.mirrorFlush\(\); \};/.test(S));
});

test('a game that cannot start in her App hands her back to the lesson page: module error, fatal boot error, 60 s; a tapped review reminder opens the review page', () => {
  const H = src('index.html');
  assert.ok(/onerror="window\.__gfBack && window\.__gfBack\('module'\)"/.test(H), 'the module fails to load');
  assert.ok(/setTimeout\(\(\) => window\.__gfBack\('slow'\), 60000\)/.test(H), 'a boot that never finishes');
  assert.ok(/location\.replace\('\.\.\/index\.html\?classic=1&why=' \+ encodeURIComponent/.test(H));
  assert.ok(/if \(q\.get\('from'\) !== 'app'\) return;/.test(H), 'only opened from her App');
  assert.ok(/e\.type === 'notify\.open' && e\.kind === 'review'\) \{ location\.href = '\.\.\/index\.html\?classic=1&open=review'/.test(H), 'the lesson page opens its review (app/native.js reads ?open=review)');
  const Mn = src('src/main.js');
  assert.ok(/window\.__gfBack\?\.\('boot: ' \+ \(\(e && e\.message\) \|\| e\)\);/.test(Mn), 'a fatal boot error');
});
