// 选游戏方式 (docs/LEARN.md §49; the owner 10-21: 「原来的界面跟流程就蛮好的 现在的游戏很好，我觉得可以给游戏加一个单独入口，我们可以
// 点进去之后选择游戏方式」): her App opens on the workbench; its 游戏 entry opens the game (?from=app&today=wXdY) and after the title
// the first screen is the pick — the day's content, a card per way to play it (the three forms: every day plays as any of
// them), the planned one marked; 复习 K 个 · 今日小考 · 双人 when the day has them; 选别的一天 · 课程地图 · 回到工作台. No 课本 and
// no 今天的打卡 on it (the workbench has them; the code stays). A level's results card: 再来一关 · 换一种玩法 (the pick, the same
// day) · 回到工作台. Read off the code (the menus are DOM; IELTS-Base tests/game-first-e2e.mjs drives the screen in a browser).
// 用法：node --test tests/learn/pick.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LEARN } from '../../src/config.js';
import { DAY_PLAN, FORM_ZH, planDay } from '../../src/learn/design.js';
import { loadWeek } from '../../src/learn/content.js';
import { BOOK_URL } from '../../src/learn/app.js';

const src = (f) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const M = src('src/ui/menus.js');
const PICK = M.slice(M.indexOf('  _scr_pick() {'), M.indexOf('  _pickResults() {'));
const RES = M.slice(M.indexOf('  _pickResults() {'), M.indexOf('  // ================================================================ SCREEN: mode'));
const CSS = src('styles/ui.css');
const SEC = CSS.slice(CSS.indexOf('选游戏方式 (docs/LEARN.md §49'));
const THREE = ['puzzle', 'race', 'duel'];

test('the switch: LEARN.appPick — in her App the main screen is the pick; the game-first menu of 10-17 stays behind it (appPick false), the web and ?lang=en as they were', () => {
  assert.equal(LEARN.appPick, true);
  assert.match(M, /\nconst APP_PICK = FROM_APP && isZh && LEARN\.appPick !== false;\n/);
  assert.match(M, /\n {2}_scr_main\(\) \{\n {4}if \(APP_PICK\) return this\._scr_pick\(\);/, 'the first line of the main screen');
  assert.ok(PICK.length > 3000 && RES.length > 400, 'found _scr_pick and _pickResults');
  // (the old menu is still the code behind it: today's level, 课程地图, 今天的打卡, 今日小考, 课本, 回课本)
  assert.match(M, /id: 'today', label: T\.done \? '今天学完了 · 再练一关' : '开始今天的关'/);
  assert.match(M, /id: 'textbook', label: t\('main\.textbook'\)/);
  // the pick has no 课本 and no 今天的打卡 (the workbench's flow has them); the book screen and the check-in card stay
  assert.ok(!/textbook|_go\('book'\)|_checkinItem|openCheckin/.test(PICK), 'no 课本, no 今天的打卡 on the pick');
  assert.match(M, /const SCREENS = \[[^\]]*'book'/);
  assert.match(M, /\n {2}_checkinItem\(T\) \{/);
});

test('every day of weeks 1–3 plays as each of the three forms (the pick\'s cards: the planned one + design.js alt); the review day plans the race', async () => {
  for (const w of ['w1', 'w2', 'w3']) for (let d = 1; d <= 7; d++) {
    const P = DAY_PLAN[w][d];
    assert.deepEqual([P.form, ...P.alt].sort(), [...THREE].sort(), w + 'd' + d);
    if (d === 7) assert.ok(P.review && P.form === 'race', 'the review day: its lap');
  }
  for (const n of [1, 2, 3]) {
    const wk = await loadWeek(n);
    for (let d = 1; d <= 7; d++) for (const f of THREE) assert.equal(planDay(wk, d, f).form, f, `w${n}d${d} as ${f}`);
  }
});

test('the cards: one per form, each starts that day in that form (startLearn({ week, day, kind })); the planned one in her ink, 今天推荐 (推荐 on another day or the next one)', () => {
  const forms = [...M.matchAll(/\{ id: '(\w+)', icon: GLYPHS\.\w+, what: [^\n]*pace: [^\n]*\}/g)].map((m) => m[1]);
  assert.deepEqual(forms, THREE, 'PICK_FORMS');
  assert.deepEqual(THREE.map((f) => FORM_ZH[f]), ['解密闯关', '墨浪跑酷', '对抗赛']);
  assert.match(PICK, /label: FORM_ZH\[f\.id\]/);
  assert.match(PICK, /accept: \(\) => this\._startLearn\(\{ week: at\.week, day: at\.day, kind: f\.id \}, b\)/);
  assert.match(PICK, /b\.classList\.toggle\('iw-btn--primary', hit\); b\.classList\.toggle\('is-rec', hit\);/);
  assert.match(PICK, /h\('span', \{ class: 'iw-pick__rec' \}, today && !next \? '今天推荐' : '推荐'\)/);
  assert.match(PICK, /let plan = planFor\(at\.week, at\.day\), rec = \(plan && plan\.form\) \|\| 'puzzle';/);
  assert.match(PICK, /if \(P && P\.form !== rec\) \{/, 'a pack\'s week knows its planned form once loaded: the mark moves');
  assert.match(PICK, /prog = learnStore\.progress\(wk, at\.day\);/);
  assert.match(PICK, /prog && prog\.total > 0 \? `答过 \$\{prog\.done\} \/ \$\{prog\.total\} 题` : ''/, 'the day\'s progress, as the game-first today button had it');
  assert.match(PICK, /initial: \(\) => cards\.find\(\(b\) => b\.dataset\.form === rec\) \|\| cards\[0\]/, 'the focus starts on the planned one');
  // the time each keeps, from the numbers the forms use (no clock in the puzzle; the race's clock is the lap's; a duel round 1–5 min)
  assert.match(M, /pace: '不计时，慢慢来'/);
  assert.match(M, /what: `和 \$\{LEARN\.race\.bots\} 个机器人游一圈，游进答对的那道墨幕`, pace: '钟只记圈时间，没有「时间到」'/);
  assert.match(M, /pace: `一道门一轮，每轮 \$\{LEARN\.duel\.roundMin \/ 60\}–\$\{LEARN\.duel\.roundMax \/ 60\} 分钟`/);
  assert.ok(Number.isInteger(LEARN.duel.roundMin / 60) && Number.isInteger(LEARN.duel.roundMax / 60) && LEARN.race.lapClock === true && LEARN.puzzle.questionTime === 0);
  // the head: whose day; with done=1 the lesson page names the next day (下一天); the course's own minutes
  assert.match(PICK, /\(next \? '下一天 · ' : today \? '今天 · ' : ''\) \+ `第 \$\{at\.week\} 周 · 第 \$\{at\.day\} 天`/);
  assert.match(PICK, /plan && plan\.minutes \? `课程约 \$\{hmZh\(plan\.minutes\)\}` : ''/);
  assert.match(PICK, /plan && plan\.review \? '复习日：这一周的内容串成一整圈 · 选一种玩法'/);
});

test('what else the day holds: 复习 K 个 (what reviewPlan asks, about how long), 今日小考 for her today only (LEARN §41), 双人 with the session and a network — never in the learning version (?in=learn: its CSP keeps the relay out of reach)', () => {
  assert.match(PICK, /const R = reviewSize\(wk, due\);\n\s*if \(R\.n > 0 && !more\.querySelector\('\.iw-btn--review'\)\) \{/);
  assert.match(PICK, /label: `复习 \$\{R\.n\} 个`/);
  assert.match(PICK, /` · 约 \$\{Math\.max\(1, Math\.round\(R\.minutes\)\)\} 分钟`/);
  assert.match(PICK, /this\._startLearn\(\{ week: at\.week, day: at\.day, kind: 'review' \}, rb\)/);
  assert.match(PICK, /const quiz = today \? this\._quizItem\(T\) : null;/);
  assert.match(PICK, /if \(today && !more\.querySelector\('\.iw-btn--quiz'\)\) \{\n\s*const q = this\._quizItem\(T\);/, 'or once the week has brought her clock');
  assert.match(PICK, /if \(G\.net && typeof G\.net\.on === 'function' && !\(typeof navigator !== 'undefined' && navigator\.onLine === false\) && !inLearn\(typeof location !== 'undefined' \? location\.search : ''\)\) \{\n[^\n]*id: 'duo', label: '双人'[^\n]*accept: \(\) => this\._go\('online'\)/);
  assert.match(M, /import \{[^}]*\binLearn\b[^}]*\} from '\.\.\/learn\/book\.js';/);
  // DOM writes on the pick that is up, nothing once it has moved on
  assert.match(PICK, /if \(this\._pickTok !== tok \|\| this\.current !== 'main'\) return;/);
});

test('the row: 选别的一天 (the picker) · 课程地图 · 回到工作台 (the store pushed first, ../index.html?classic=1); 换装 · 设置 in the corner; back is the title', () => {
  assert.match(PICK, /id: 'learn', label: '选别的一天'[^\n]*accept: \(\) => this\._go\('learn'\)/);
  assert.match(PICK, /id: 'map', label: '课程地图'[^\n]*accept: \(\) => this\._go\('map'\)/);
  assert.match(PICK, /const home = \(\) => \{ safeCall\(\(\) => learnStore\.flushWorkbench && learnStore\.flushWorkbench\(\)\); location\.href = BOOK_URL; \};/);
  assert.match(PICK, /id: 'home', label: '回到工作台'[^\n]*accept: home/);
  assert.equal(BOOK_URL, '../index.html?classic=1');
  assert.match(PICK, /id: 'locker', label: t\('main\.locker'\)[^\n]*this\._go\('locker'\)/);
  assert.match(PICK, /id: 'settings', label: t\('main\.settings'\)[^\n]*this\._go\('settings'\)/);
  assert.match(PICK, /onBack: \(\) => \{ this\._sfx\('ui_back'\); this\.show\('title', \{ back: true \}\); \}/);
  // a day that is not her today (the last level's): one tap back to today
  assert.match(PICK, /if \(T && !today\) head\.appendChild\(this\._btn\(\{ id: 'pick-today', label: '回到今天的内容'/);
  assert.match(PICK, /accept: \(\) => \{ this\._pickAt = null; this\.show\('main', \{ force: true \}\); \}/);
});

test('a level\'s results card in her App: 回到菜单 says 换一种玩法 (quitToMenu → the pick, on the day just played), 回到工作台 once; never on a room\'s card', () => {
  assert.match(M, /if \(APP_PICK\) on\('learn:done', \(\) => this\._pickResults\(\)\);/);
  assert.match(M, /import \{ G, on \} from '\.\.\/core\/ctx\.js';/);
  assert.match(RES, /setTimeout\(\(\) => \{/, 'after the form has filled its card');
  assert.match(RES, /if \(!btns \|\| !H\.rMenu \|\| G\.netm \|\| !m \|\| !m\.learn\) return;/);
  assert.match(RES, /if \(lab\) lab\.textContent = '换一种玩法';/);
  assert.match(RES, /if \(btns\.querySelector\('\.iw-learn__home'\)\) return;/);
  assert.match(RES, /h\('span', null, '回到工作台'\)/);
  assert.match(RES, /learnStore\.flushWorkbench\(\)\); location\.href = BOOK_URL;/);
  // the day the pick comes back on: the level's (a 周考 is the week's: the pick stays where it was)
  assert.match(M, /if \(st\.kind !== 'boss'\) this\._pickAt = \{ week: st\.week, day: st\.day \};/);
  assert.match(PICK, /const P0 = this\._pickAt && CW\.has\(this\._pickAt\.week\) \? this\._pickAt : null;/);
  // 回到菜单 is quitMatch → quitToMenu('main'): the pick in her App
  const MAIN = src('src/main.js');
  assert.match(MAIN, /quitMatch: \(\) => self\.quitToMenu\(\),/);
  assert.match(MAIN, /async quitToMenu\(screen = 'main'\) \{/);
  // every solo form emits learn:done in the same task as its card (the hook's setTimeout runs after both)
  for (const f of ['src/learn/flow.js', 'src/learn/forms/duel.js', 'src/learn/forms/boss.js', 'src/learn/play/runner/runner.js']) {
    const S = src(f), i = S.indexOf("this._emit('learn:done', data);");
    assert.ok(i > 0 && S.indexOf('results(data, {', i) - i < 200, f);
  }
});

test('the screen: §49\'s section at the end of ui.css — no blur of its own (the main menu\'s glass panel), targets ≥ 44 px, text wraps in its card, reduced motion only fades', () => {
  assert.ok(CSS.indexOf('选游戏方式 (docs/LEARN.md §49') > CSS.indexOf('游戏为主体 第二期: the course map'), 'after the sections that read "no backdrop-filter" to the end');
  assert.match(PICK, /h\('nav', \{ class: 'iw-main__menu iw-pick__menu'/, 'the panel is the main menu\'s glass');
  const body = SEC.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(body, /backdrop-filter/);
  assert.doesNotMatch(body, /(^|[;{\s])filter:/);
  assert.doesNotMatch(body, /@keyframes/);
  for (const [sel, px] of [['.iw-pick__mini', 44], ['.iw-pick__sec', 48], ['.iw-pick__extra', 48], ['.iw-pick__form', 80]]) {
    const hs = [...body.matchAll(new RegExp(sel.replace(/[.]/g, '\\.') + ' \\{[^}]*?(?:min-)?height: (\\d+)px', 'g'))].map((m) => +m[1]);
    assert.ok(hs.length && hs.every((v) => v >= Math.min(px, 44)), sel + ' ' + hs);
  }
  assert.match(body, /\.iw-pick__form \.iw-btn__sub \{[^}]*white-space: normal;/);
  assert.match(body, /@media \(prefers-reduced-motion: reduce\) \{\n\s*\.iw-pick \.iw-in, \.iw-pick__title\.is-in \{ animation-name: iw-fade !important; \}/);
  assert.match(body, /@media \(orientation: portrait\) and \(max-width: 720px\) \{/);
  assert.match(body, /@media \(orientation: landscape\) and \(max-height: 520px\) \{/);
});

test('a level that cannot be built (its week does not load, a day without a plan) brings back the screen she came from — never the bare stage', () => {
  assert.match(M, /const from0 = this\.current;\n\s*this\._runWipe\(\(\) => \{/);
  assert.match(M, /const back = \(\) => \{ if \(G\.mode !== 'match' && this\.current === null && !this\._starting\) this\.show\(\['learn', 'map'\]\.includes\(from0\) \? from0 : 'main'\); \};\n\s*Promise\.resolve\(run\)\.then\(back, back\);/);
  // main.js: a build that throws toasts why and returns with no match (G.mode stays 'menu'); one that starts sets G.mode first
  const MAIN = src('src/main.js');
  assert.match(MAIN, /try \{ learn = await buildLearn\([^\n]*\} catch \(e\) \{[^\n]*this\.menus\?\.toast\?\.\(\(e && e\.zh\) \|\| '这一天的课还没准备好'\); return; \}/);
  const sm = MAIN.slice(MAIN.indexOf('  async startMatch(o = {}) {'), MAIN.indexOf('  _inPractice() {'));
  assert.ok(sm.indexOf("G.mode = 'match';") > 0, 'startMatch sets the mode before it resolves');
});

test('today\'s 打卡 from the course map (its entry in her App now): saved, the map that is up says it — also after a turn of the phone while the card was open (a new map is drawn)', () => {
  const MAP = M.slice(M.indexOf('  _scr_map('), M.indexOf('  // ================================================================', M.indexOf('  _scr_map(') + 10));
  assert.ok(MAP.length > 4000, 'found _scr_map');
  // (the card's onClose asks the screen that is up — never the one it was opened on, which a turn has replaced)
  assert.match(MAP, /openCheckin\(\{ week: T\.week, day: T\.day, from: 'map', onClose: \(r\) => \{\n\s*const s = this\._scr;\n\s*if \(r && r\.saved && this\.current === 'map' && s && typeof s\.ciSaved === 'function'\) s\.ciSaved\(\);\n\s*\} \}\);/);
  assert.ok(!/this\._scr !== scr\) return;\n\s*ciPaint\(\)/.test(MAP), 'not the map it was opened on');
  // (each map has its own: the pill, today's node and its sticker, the stamp)
  assert.match(MAP, /ciSaved: ciBtn \? \(\) => \{ ciPaint\(\); paint\(\); restartAnim\(ciBtn, 'is-stamp'\); const k = T\.week === st\.week \? nodes\[T\.day - 1\] : null; if \(k\) restartAnim\(k, 'is-cistamp'\); \} : null,/);
  // (a turn of the phone draws the map again, forced, on the same stack)
  assert.match(MAP, /const turn = \(\) => \{ if \(this\._scr === scr\) this\.show\('map', \{ force: true, under: this\._stack\.slice\(0, -1\), wipe: false \}\); \};/);
});
