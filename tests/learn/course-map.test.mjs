// 游戏为主体 第二期（docs/LEARN.md §34）: the course map — her three weeks as INKWAVE's level map in the game. courseMap
// (src/learn/course-map.js) is pure: the five node states, the lock rule (with and without her today), when the week's 周考
// opens, a day with no scored items; mapLayout's road; and the menu's wiring (read from the source, as game-first.test).
// 用法：node --test tests/learn/course-map.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { courseMap, weekShare, mapLayout } from '../../src/learn/course-map.js';

const src = (f) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
// made-up progress: day → { done, total } of week 1 (everything else 0 / 10)
const P1 = { 1: [10, 10], 2: [4, 10], 3: [0, 10], 4: [0, 0], 5: [10, 10], 6: [0, 10], 7: [0, 10] };
const progress = (w, d) => (w === 1 && P1[d] ? { done: P1[d][0], total: P1[d][1] } : { done: 0, total: 10 });
const plan = (w, d) => ({ form: d === 7 ? 'duel' : d % 2 ? 'puzzle' : 'race' });
const states = (m, w) => m[w - 1].days.map((x) => x.state).join(' ');

test('the five states: done / part / today / todo / locked — today wins over its own progress; after today is locked', () => {
  const m = courseMap({ weeks: 3, days: 7, progress, plan, today: { week: 1, day: 3 } });
  assert.equal(m.length, 3);
  assert.equal(states(m, 1), 'done part today locked locked locked locked');
  assert.equal(states(m, 2), 'locked locked locked locked locked locked locked', 'a later week: all locked');
  assert.deepEqual(m[0].days[0], { day: 1, form: 'puzzle', done: 10, total: 10, state: 'done', complete: true, now: false, ci: null, qz: null });
  assert.deepEqual(m[0].days[1], { day: 2, form: 'race', done: 4, total: 10, state: 'part', complete: false, now: false, ci: null, qz: null });
  assert.deepEqual(m[0].days[2], { day: 3, form: 'puzzle', done: 0, total: 10, state: 'today', complete: false, now: true, ci: null, qz: null });
  assert.equal(m[0].days[4].complete, false, 'a locked day never shows a tick, whatever the store says');
  // today done in the store, or the lesson page's ?done=1: still 'today', with the tick
  const d = courseMap({ progress, plan, today: { week: 1, day: 5 } });
  assert.equal(d[0].days[4].state, 'today'); assert.equal(d[0].days[4].complete, true);
  const z = courseMap({ progress, plan, today: { week: 1, day: 3, done: true } });
  assert.equal(z[0].days[2].state, 'today'); assert.equal(z[0].days[2].complete, true, '?done=1 ticks today');
  // a later today: the days before replay, so their states are their progress
  const w2 = courseMap({ progress, plan, today: { week: 2, day: 1 } });
  assert.equal(states(w2, 1), 'done part todo todo done todo todo');
  assert.equal(states(w2, 2), 'today locked locked locked locked locked locked');
  assert.equal(states(w2, 3).includes('today'), false);
});

test('a day with no scored items (total 0: a lesson, nothing to prove) is todo, never done; no progress at all is todo', () => {
  const m = courseMap({ progress, plan, today: { week: 2, day: 1 } });
  assert.equal(m[0].days[3].total, 0); assert.equal(m[0].days[3].state, 'todo'); assert.equal(m[0].days[3].complete, false);
  const none = courseMap({ weeks: 1, days: 7 });
  assert.equal(states(none, 1), 'todo todo todo todo todo todo todo', 'before the week loads: no progress, nothing locked');
  assert.equal(none[0].days[0].form, null);
  const bad = courseMap({ weeks: 1, days: 2, progress: () => { throw new Error('not loaded'); }, plan: () => null });
  assert.deepEqual(bad[0].days.map((x) => [x.done, x.total, x.state]), [[0, 0, 'todo'], [0, 0, 'todo']], 'a store that throws: zeros');
  const over = courseMap({ weeks: 1, days: 1, progress: () => ({ done: 14, total: 12 }) });
  assert.equal(over[0].days[0].done, 12, 'done never above total');
});

test('no today (plain INKWAVE, development): nothing is locked, every boss is open; a today outside the course locks nothing odd', () => {
  const m = courseMap({ weeks: 3, days: 7, progress, plan, today: null });
  for (const w of m) { assert.ok(w.days.every((x) => x.state !== 'locked' && x.state !== 'today')); assert.equal(w.boss.state, 'todo'); }
  const bad = courseMap({ weeks: 3, days: 7, progress, plan, today: { week: 0, day: 0 } });
  assert.ok(bad.every((w) => w.boss.state === 'todo' && w.days.every((x) => x.state !== 'locked')), 'an invalid today is no today');
});

test('the 周考 opens once that week\'s day 7 is not locked', () => {
  const at = (week, day) => courseMap({ progress, plan, today: { week, day } }).map((w) => w.boss.state).join(' ');
  assert.equal(at(1, 3), 'locked locked locked');
  assert.equal(at(1, 6), 'locked locked locked');
  assert.equal(at(1, 7), 'todo locked locked', 'day 7 is today: the boss is open');
  assert.equal(at(2, 1), 'todo locked locked');
  assert.equal(at(3, 7), 'todo todo todo');
});

test('weekShare: the week\'s scored items with evidence over all of them; the road passes through every node', () => {
  const m = courseMap({ progress, plan, today: null });
  assert.equal(weekShare(m[0]), 24 / 60);
  assert.equal(weekShare(m[1]), 0); assert.equal(weekShare(null), 0);
  for (const portrait of [false, true]) {
    const L = mapLayout(8, portrait);
    assert.deepEqual([L.w, L.h], portrait ? [360, 940] : [1000, 360]);
    assert.equal(L.pts.length, 8);
    for (const p of L.pts) assert.ok(p.x > 40 && p.x < L.w - 40 && p.y > 40 && p.y < L.h - 40, 'every node inside the box with room for itself');
    const ends = (d) => d.match(/-?\d+(\.\d+)?/g).map(Number);
    const d = ends(L.d);
    assert.deepEqual(d.slice(0, 2), [L.pts[0].x, L.pts[0].y]); assert.deepEqual(d.slice(-2), [L.pts[7].x, L.pts[7].y]);
    assert.equal((L.d.match(/C/g) || []).length, 7, 'one curve between each pair of nodes');
    const u = ends(L.upTo(2)); assert.deepEqual(u.slice(-2), [L.pts[2].x, L.pts[2].y], 'the walked road ends on the node');
    assert.equal(L.upTo(0), `M${L.pts[0].x} ${L.pts[0].y}`);
    // portrait goes down, landscape goes right: monotone along the course
    for (let i = 1; i < 8; i++) assert.ok(portrait ? L.pts[i].y > L.pts[i - 1].y : L.pts[i].x > L.pts[i - 1].x);
  }
});

test('the menu: a registered map screen (week tabs, the nodes start the day\'s plan or the 周考, locked ones toast), and the main menu in her App', () => {
  const M = src('src/ui/menus.js');
  assert.ok(/const SCREENS = \[[^\]]*'map'/.test(M), 'the map screen is registered');
  assert.ok(/_scr_map\(/.test(M));
  assert.ok(/import \{ courseMap, weekShare, mapLayout \} from '\.\.\/learn\/course-map\.js';/.test(M));
  assert.ok(/this\._startLearn\(\{ week: W, day: x\.day, kind: 'plan' \}, node\)/.test(M), 'a day starts its planned form');
  assert.ok(/this\._startLearn\(\{ week: W, day: LEARN\.days, kind: 'boss' \}, node\)/.test(M), 'the boss node starts the 周考');
  assert.ok(/this\.toast\('先学到这一天'/.test(M), 'a locked node says why');
  assert.ok(/learnStore\.progress\(w, d\)/.test(M), 'progress from the store, on the loaded week object');
  assert.ok(/this\._cmapProg\[W\] = /.test(M), 'once per week, cached — never per frame');
  // the main menu: 开始今天的关 → 课程地图 → (复习 K 个) → 选关 → 回课本
  assert.ok(/items\.unshift\(today, \{ \.\.\.learn, label: '选关'/.test(M) && /items\.splice\(1, 0, mapBtn\);/.test(M), 'the map right under today\'s level');
  assert.ok(/id: 'map', label: '课程地图'/.test(M) && /accept: \(\) => this\._go\('map'\)/.test(M));
  assert.ok(/今天 \$\{p\.done\} \/ \$\{p\.total\}/.test(M), 'today\'s progress on the today button\'s second line');
  // the review button: only when kind 'review' exists (gf-review), only when K > 0, and then it starts review
  assert.ok(/import \{ LEARN_KINDS \} from '\.\.\/learn\/forms\/index\.js';/.test(M));
  assert.ok(/const REVIEW_OK = LEARN_KINDS\.includes\('review'\);/.test(M));
  assert.ok(/if \(REVIEW_OK && K > 0 && /.test(M), 'no review button without kind review, nor with nothing to ask');
  assert.ok(/if \(!REVIEW_OK \|\| typeof learnApi\.reviewPlan !== 'function' \|\| !due\.length\) return 0;/.test(M), 'K is 0 without gf-review\'s reviewPlan');
  assert.ok(/learnApi\.reviewPlan\(wk, due\); return Math\.max\(0, \(r && r\.reviewOf && \+r\.reviewOf\.n\) \| 0\)/.test(M), 'K is what the review level asks (reviewOf.n), not every due word');
  assert.ok(/label: `复习 \$\{K\} 个`/.test(M));
  assert.ok(/kind: 'review' \}/.test(M));
  assert.ok(/else if \(this\.current === 'map'\) this\.show\(null, \{ instantLeave: true \}\)/.test(M), 'the map leaves when a level starts from it');
  // the portrait gate stays down over the map (its own upright layout)
  assert.ok(/PORTRAIT_SCREENS = new Set\(\[[^\]]*'map'/.test(src('src/core/touch.js')));
  // the styles: its own section at the end of ui.css, reduced motion handled
  const C = src('styles/ui.css');
  const at = C.indexOf('游戏为主体 第二期: the course map');
  assert.ok(at > 0 && C.indexOf('.iw-cmap', at) > at);
  assert.ok(/@media \(prefers-reduced-motion: reduce\) \{[^}]*\.iw-cmap/.test(C.slice(at)));
});

test('the review guard holds today: without gf-review\'s kind the button cannot appear', async () => {
  const { LEARN_KINDS } = await import('../../src/learn/forms/index.js');
  const M = src('src/ui/menus.js');
  // every review button is created only behind the REVIEW_OK guard: the game-first menu's (K > 0, reviewK) and the pick's
  // (选游戏方式, LEARN §49: R.n > 0, reviewSize — 0 without REVIEW_OK)
  const at = [...M.matchAll(/kind: 'review' \}/g)].map((m) => m.index);
  assert.equal(at.length, 2, 'the game-first menu and the pick');
  for (const i of at) {
    const g = M.lastIndexOf('if (REVIEW_OK && K > 0 && ', i), p = M.lastIndexOf('if (R.n > 0 && ', i);
    assert.ok((g > 0 && i - g < 900) || (p > 0 && i - p < 900 && M.lastIndexOf('const R = reviewSize(wk, due);', i) > p - 80), 'the review button is built inside the guard');
  }
  assert.match(M, /function reviewSize\(wk, due\) \{\n\s*if \(!REVIEW_OK \|\| typeof learnApi\.reviewPlan !== 'function' \|\| !due\.length\) return \{ n: 0, minutes: 0 \};/);
  assert.equal(typeof LEARN_KINDS.includes('review'), 'boolean');
});
