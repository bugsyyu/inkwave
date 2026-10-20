// 每一周 (gf-weeks, docs/LEARN.md §44): the game plays every week of her course — week n is her account's course pack for
// it (what the lesson page loads: its weekError), else content/wN.json, else none yet. Her pack the same as content/'s →
// content/'s week and the hand table (DAY_PLAN), every byte of the evidence as before; a different one (or week 4 on) →
// her copy and a generated table. Then everything that said 「三周」: appToday's inGame, the map (17 weeks, the ones without a
// pack grey, the 满月月考 on 4 / 8 / 12 / 16), the check-in, today's quiz, the review, the 周考. Week 4 is made up here
// from content/w3.json (its ids and numbers moved to 4) — nothing comes from her data. WEEK_ERRORS is the same literal as
// IELTS-Base tests/base/game-weeks.test.mjs, where the lesson page's own weekError gives the same answers.
// 用法：node --test tests/learn/weeks.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ielts } from '../../src/learn/ielts.js';
import { loadWeek, daySteps, isCustom, loadedWeek, weekIndex } from '../../src/learn/content.js';
import { DAY_PLAN, dayPlanFor, planFor, planDay, coverage, mechanicOf, playOf, bossPlan, quizPlan, MECHANICS } from '../../src/learn/design.js';
import { weekError, herPacks, hasWeek, courseWeeks, canon, setPackStore } from '../../src/learn/weeks.js';
import { setBackend } from '../../src/learn/store.js';
import { appToday } from '../../src/learn/app.js';
import { DATA_KEY, PREF_KEY, _reset } from '../../src/learn/workbench.js';
import { courseMap } from '../../src/learn/course-map.js';
import { checkinView } from '../../src/learn/checkin.js';
import { quizFor, examFor } from '../../src/learn/exam-view.js';
import { reviewPlan } from '../../src/learn/review.js';
import { createClips } from '../../src/learn/audio.js';

const src = (f) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const clone = (o) => JSON.parse(JSON.stringify(o));
const W3 = JSON.parse(src('content/w3.json')).week;
// week 4, made up: content/w3.json with its id, n, title and day ids moved to 4
export function fakeWeek4(w3 = W3) {
  const w = clone(w3);
  w.id = 'w4'; w.n = 4; w.title = w.title.replace('第 3 周', '第 4 周');
  w.days.forEach((d) => { d.id = d.id.replace(/^w3d/, 'w4d'); });
  return w;
}
const W4 = fakeWeek4();
function memory(init) {
  const m = new Map(Object.entries(init || {})), writes = [];
  return { m, writes, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { writes.push(k); m.set(k, String(v)); } };
}
// a made-up learner with her course packs (the page's shape: packs[id] = { week, at })
const account = (packs, extra) => ({ profile: { v: 1, setup: true, startDate: '2026-09-21', cp: {}, ci: {}, accent: 'us' }, days: {}, packs: Object.fromEntries(packs.map((w) => [w.id, { week: w, at: '2026-10-19' }])), base: {}, ...(extra || {}) });
function use(blob) {
  const ls = memory(blob ? { [DATA_KEY]: JSON.stringify(blob), [PREF_KEY]: JSON.stringify({ tz: 'sin' }) } : {});
  setBackend(ls);
  return ls;
}
// the lesson page's weekError on broken copies of week 4: [where, value, what the page says] (IELTS-Base game-weeks.test.mjs)
export const WEEK_ERRORS = [
  [[], null, ''],
  [['id'], 'week4', '缺少周编号'],
  [['title'], 4, '缺少标题'],
  [['days'], [], '没有课程内容'],
  [['days', 0, 'id'], 'w3d1', '某一天的编号不对'],
  [['days', 0, 'n'], 'one', '某一天的编号不对'],
  [['days', 0, 'a'], {}, '时段格式不对'],
  [['days', 0, 'a', 0, 'type'], 'karaoke', '有不认识的练习类型'],
  [['days', 0, 'a', 2, 'words'], 'apple, banana', 'w4d1 里 a3 的内容格式不对'],
];
export function broken(w, at, v) { const o = clone(w); if (!at.length) return o; let x = o; for (const k of at.slice(0, -1)) x = x[k]; x[at[at.length - 1]] = v; return o; }

test('weekError: the lesson page\'s check, the same words — a pack it turns down is no week of hers here either', () => {
  for (const [at, v, want] of WEEK_ERRORS) assert.equal(weekError(broken(W4, at, v)), want, at.join('.'));
  assert.equal(weekError(null), '文件格式不对');
  for (const n of [1, 2, 3]) assert.equal(weekError(JSON.parse(src(`content/w${n}.json`)).week), '', 'content/ passes it too');
  // her packs by week number: only the ones that load, one per id
  const w5 = { ...clone(W4), id: 'w5', n: 5, days: W4.days.map((d) => ({ ...d, id: d.id.replace('w4', 'w5') })) };
  assert.deepEqual([...herPacks(account([W4, w5])).keys()], [4, 5]);
  assert.deepEqual([...herPacks(account([broken(W4, ['days', 0, 'a', 0, 'type'], 'karaoke'), w5])).keys()], [5], 'a broken w4 is not a week');
  // one week per id: the first stored (a pack stored under another key with the same week id is the same week)
  const twice = account([W4]); twice.packs.old = { week: { ...clone(W4), title: 'older' }, at: '2026-10-01' };
  assert.equal(herPacks(twice).get(4).title, W4.title);
});

test('where week n comes from: her pack first, else content/, else none; a broken pack is not used; her blob is never touched', async () => {
  // no account: the game's own three weeks, nothing past them
  use(null);
  assert.deepEqual([1, 2, 3, 4].map((n) => hasWeek(n)), [true, true, true, false]);
  await assert.rejects(loadWeek(4), /week 4/);
  // her pack of week 4
  const ls = use(account([W4]));
  const raw = ls.m.get(DATA_KEY);
  assert.equal(hasWeek(4), true); assert.equal(hasWeek(5), false);
  const w4 = await loadWeek(4);
  assert.equal(w4.id, 'w4'); assert.equal(isCustom(w4), true); assert.equal(loadedWeek(4), w4);
  assert.equal(canon(w4), canon(W4), 'her week as she has it');
  w4.title = 'changed in the game';   // (a copy: her stored pack is not the object the game holds)
  assert.equal(ls.m.get(DATA_KEY), raw, 'nothing written');
  assert.notEqual(herPacks(JSON.parse(raw)).get(4).title, 'changed in the game');
  assert.deepEqual(ls.writes, []);
  // a broken pack of week 4: no week 4; a broken pack of week 3: content/'s week 3
  use(account([broken(W4, ['days', 0, 'n'], 'one')]));
  assert.equal(hasWeek(4), false);
  await assert.rejects(loadWeek(4));
  use(account([broken(W3, ['title'], 3)]));
  const w3 = await loadWeek(3);
  assert.equal(isCustom(w3), false); assert.equal(canon(w3), canon(W3));
});

test('the same week as content/ (whatever its key order) → content/\'s week and the hand table; a different one → hers and a generated table', async () => {
  // the same: her copy round-tripped through her storage with the keys in another order
  const turn = (o) => Array.isArray(o) ? o.map(turn) : o && typeof o === 'object' ? Object.fromEntries(Object.keys(o).reverse().map((k) => [k, turn(o[k])])) : o;
  use(account([turn(W3)]));
  const same = await loadWeek(3);
  assert.equal(isCustom(same), false);
  assert.notEqual(JSON.stringify(same), JSON.stringify(turn(W3)), 'the keys really are in another order');
  for (let d = 1; d <= 7; d++) { assert.equal(dayPlanFor(same, d), DAY_PLAN.w3[d]); assert.equal(planFor(3, d), DAY_PLAN.w3[d]); }
  // different: the teacher changed one dictation sentence of day 2 after her weekly report
  const changed = clone(W3), st = changed.days[1].b.find((s) => s.type === 'dictation');
  st.items[0] = ['The teacher wrote a new sentence for her.', '老师给她写了一句新的。'];
  use(account([changed]));
  const mine = await loadWeek(3);
  assert.equal(isCustom(mine), true);
  const P = dayPlanFor(mine, 2);
  assert.ok(P.generated); assert.notEqual(P, DAY_PLAN.w3[2]);
  assert.equal(planFor(3, 2), P, 'the menus and the map ask the loaded week');
  assert.ok(daySteps(mine, 2).some((s) => s.meta.type === 'dictation' && s.items.some((it) => it.tts === 'The teacher wrote a new sentence for her.')), 'her sentence is asked');
  assert.ok(P.gates.every((g) => MECHANICS[g.mechanic]), 'a mechanic for every gate');
  assert.equal(dayPlanFor(mine, 2), P, 'made once per loaded week');
  // with nothing loaded yet: the hand table (her today's form on the menu before the week arrives)
  assert.equal(planFor(9, 1), null);
});

test('a generated week 4: every asking step is a gate and every lesson step a sign on each of its 7 days (100 %), in every form; the boss, the quiz, coverage', async () => {
  use(account([W4]));
  const w4 = await loadWeek(4);
  const C = coverage([w4]);
  assert.deepEqual(C.missing, []);
  assert.equal(C.weeks.w4.covered, C.weeks.w4.steps);
  let gates = 0, signs = 0, items = 0;
  for (let d = 1; d <= 7; d++) {
    const P = dayPlanFor(w4, d), steps = daySteps(w4, d);
    assert.ok(P && P.generated, 'd' + d);
    assert.deepEqual(P.gates.map((g) => g.step), steps.filter((s) => s.kind !== 'lesson').map((s) => s.id), `d${d}: every asking step a gate`);
    assert.deepEqual(P.signs.map((g) => g.step), steps.filter((s) => s.kind === 'lesson').map((s) => s.id), `d${d}: every lesson step a sign`);
    assert.equal(P.minutes, steps.reduce((a, s) => a + s.minutes, 0));
    assert.equal(P.form, d === 7 ? 'race' : ['puzzle', 'race', 'duel'][(d - 1) % 3]);
    gates += P.gates.length; signs += P.signs.length;
    for (const form of ['puzzle', 'race', 'duel']) {
      const L = planDay(w4, d, form);
      assert.equal(L.week, 'w4');
      for (const s of steps.filter((x) => x.kind !== 'lesson')) {
        const g = L.gates.find((x) => x.stepId === s.id);
        assert.ok(g && g.design && g.design.mechanic === mechanicOf(s), `${form} d${d} ${s.id}: its gate`);
        assert.deepEqual(g.items.map((it) => it.id).sort(), s.items.map((it) => it.id).sort(), `${form} d${d} ${s.id}: every item in it`);
        for (const it of g.items) assert.ok(playOf(it, form, g.design.mechanic), `${form} ${it.id}: a mechanic plays it`);
        items += g.items.length;
      }
      for (const s of steps.filter((x) => x.kind === 'lesson')) assert.ok(L.signs.find((x) => x.stepId === s.id && x.design), `${form} d${d} ${s.id}: its sign`);
    }
  }
  assert.ok(gates > 50 && signs > 20 && items > 2000, JSON.stringify({ gates, signs, items }));
  const B = bossPlan(w4);
  assert.equal(B.month, true, 'week 4 is the 满月月考');
  assert.ok(B.phases.every((ph) => ph.items.length > 0));
  assert.equal(quizPlan(w4, 2, []).n, 8);
});

test('the ids: week 4\'s items are the ones IELTS-Base\'s index gives the same pack among all her weeks (what the lesson page reads her evidence by)', async () => {
  const { Model } = await ielts();
  const sym = JSON.parse(src('content/symbols.json'));
  use(account([W4]));
  const w4 = await loadWeek(4);
  const all = Model.buildIndex([1, 2, 3].map((n) => JSON.parse(src(`content/w${n}.json`)).week).concat([clone(W4)]), { symList: sym.list, symbols: sym.symbols });
  let n = 0;
  for (const d of w4.days) for (const s of daySteps(w4, d.n)) {
    const si = all.steps.get(s.id);
    assert.ok(si, s.id);
    assert.deepEqual(s.items.filter((it) => it.meta.kind !== 'lesson').map((it) => it.id), si.items.filter((id) => all.items.has(id)), s.id);
    n += s.items.length;
  }
  assert.ok(n > 700);
  assert.equal(weekIndex(w4).items.size > 0, true);
});

test('appToday: inGame is a week the game can load — week 4 with her pack, not without; content/\'s three always; the old number rule still works', () => {
  use(account([W4]));
  assert.deepEqual(appToday('?from=app&today=w4d1'), { week: 4, day: 1, done: false, inGame: true });
  assert.deepEqual(appToday('?from=app&today=w3d7&done=1'), { week: 3, day: 7, done: true, inGame: true });
  assert.equal(appToday('?from=app&today=w5d1').inGame, false, 'no pack for week 5 yet');
  use(account([]));
  assert.equal(appToday('?from=app&today=w4d1').inGame, false);
  assert.equal(appToday('?from=app&today=w2d5').inGame, true);
  use(null);
  assert.equal(appToday('?from=app&today=w4d1').inGame, false, 'no account: as before');
  assert.deepEqual(appToday('?from=app&today=w5d1', 3, 7), { week: 5, day: 1, done: false, inGame: false });
});

test('the map: her course\'s 17 weeks once her account is here (the ones without a pack wait, grey), the 满月月考 on 4 / 8 / 12 / 16 when that week is there', () => {
  use(account([clone(W3), W4]));
  const C = courseWeeks();
  assert.deepEqual([C.total, C.account], [17, true]);
  assert.deepEqual([1, 2, 3, 4, 5].map(C.src), ['content', 'content', 'pack', 'pack', null]);
  const M = courseMap({ weeks: C.total, days: 7, has: C.has, today: { week: 4, day: 1 } });
  assert.equal(M.length, 17);
  assert.deepEqual(M.slice(0, 5).map((w) => !!w.wait), [false, false, false, false, true]);
  assert.equal(M[3].days[0].state, 'today');
  assert.ok(M[3].days.slice(1).every((x) => x.state === 'locked'));
  assert.ok(M[4].days.every((x) => x.state === 'wait') && M[4].boss.state === 'wait');
  assert.deepEqual(M.map((w) => w.boss.month).map((m, i) => (m ? i + 1 : 0)).filter(Boolean), [4], 'the 满月月考 node: week 4 is there, 8 / 12 / 16 wait');
  // her course runs on: packs to week 8 → 8 has its 满月月考 too
  const eight = [5, 6, 7, 8].map((n) => { const w = clone(W4); w.id = 'w' + n; w.n = n; w.days.forEach((d) => { d.id = d.id.replace(/^w4d/, 'w' + n + 'd'); }); return w; });
  use(account([W4, ...eight]));
  const C8 = courseWeeks();
  assert.deepEqual(courseMap({ weeks: C8.total, days: 7, has: C8.has }).map((w) => w.boss.month).map((m, i) => (m ? i + 1 : 0)).filter(Boolean), [4, 8]);
  // a pack past her 17 weeks: the map goes that far
  const w18 = clone(W4); w18.id = 'w18'; w18.n = 18; w18.days.forEach((d) => { d.id = d.id.replace(/^w4d/, 'w18d'); });
  use(account([w18]));
  assert.equal(courseWeeks().total, 18);
  // no account here (plain INKWAVE, development): the game's own three weeks, nothing greyed — as before
  use(null);
  assert.deepEqual([courseWeeks().total, courseWeeks().account], [3, false]);
  assert.ok(courseMap({ weeks: 3, days: 7, has: courseWeeks().has }).every((w) => !w.wait));
});

test('week 4 in the rest of the game: the check-in (her pack\'s step), today\'s quiz (the generated table), the review, the 周考 / 满月月考 window', async () => {
  // her course at week 4 day 2: day 1 learned yesterday
  const o = account([W4]);
  o.profile.cp = { 'w4d1:a1': '2026-10-19' };
  const ls = use(o);
  const now = Date.parse('2026-10-20T10:00:00+08:00');
  const T = { week: 4, day: 2, inGame: true };
  const ci = checkinView(ls, 4, 2);
  assert.ok(ci && ci.dayId === 'w4d2' && ci.step.id === W4.days[1].c.find((s) => s.type === 'checkin').id, 'her pack has the day\'s check-in step');
  const w4 = await loadWeek(4);
  const q = quizFor(T, ls, now);
  assert.deepEqual(q, { state: 'open' }, 'today\'s quiz is offered on week 4 (the day\'s table is the generated one)');
  assert.equal(quizFor({ week: 4, day: 7, inGame: true }, ls, now), null, 'never on the review day');
  const x = examFor(4, ls, now);
  assert.ok(x && x.month === true && x.state === 'locked', 'week 4\'s 满月月考: locked until its review day is learned');
  // the review: wrong answers yesterday → due now, a race of them on week 4's review-day stage
  const items = daySteps(w4, 1).filter((s) => s.kind === 'choice').flatMap((s) => s.items).slice(0, 6);
  const R = reviewPlan(w4, items.map((it) => it.id));
  assert.ok(R && R.gates.length >= 1 && R.stage === dayPlanFor(w4, 7).stage, 'the review of week 4');
});

test('a new week has no recordings: the lesson\'s clips say null and the device voice reads it — no request fails', async () => {
  const { Host } = await ielts();
  use(account([W4]));
  const w4 = await loadWeek(4), it = daySteps(w4, 1).find((s) => s.meta.type === 'dictation').items[0];
  const index = { v: 1, texts: ['Monday'], sets: { us: { shards: 1, speed: 1, at: [[0, 0, 4]] } } };
  const C = createClips({ fetch: async (u) => (u.endsWith('index.json') ? { ok: true, status: 200, json: async () => index } : { ok: false, status: 404 }), base: 'https://her.example/audio/', accent: () => 'us', chunks: Host.speechChunks });
  await C.load();
  assert.equal(C.plan(it.tts), null, 'no clip: the device voice');
});

test('the menus: her today\'s line and form from the loaded week, the picker over the weeks the game can load, the map over her course\'s weeks (grey ones wait and say why), any loadable week starts', () => {
  const M = src('src/ui/menus.js'), C = src('styles/ui.css'), MAIN = src('src/main.js');
  assert.ok(!/DAY_PLAN/.test(M), 'no hand table read directly: planFor (a loaded week\'s own, else the hand table)');
  assert.match(M, /const whereOf = \(T\) => \{ const plan = planFor\(T\.week, T\.day\);/);
  assert.match(M, /const bits = \[whereOf\(T\) \|\| where\];/, 'the today line again once the week has loaded (week 4: its form)');
  assert.match(M, /sub: `\$\{courseWeeks\(\)\.total\} 周 · 每天的进度 · 点一天就开局`/);
  // the picker
  assert.match(M, /const CW = courseWeeks\(\), weeks = Array\.from\(\{ length: CW\.total \}, \(_, i\) => i \+ 1\)\.filter\(CW\.has\);/);
  assert.match(M, /this\._seg\(weeks\.map\(\(n\) => \[n, `第 \$\{n\} 周`\]\)/);
  // the map
  assert.match(M, /courseMap\(\{ weeks: CW\.total, days: LEARN\.days, today: T, has: CW\.has,/);
  assert.match(M, /plan: \(w, d\) => planFor\(w, d\),/);
  assert.match(M, /this\._seg\(Array\.from\(\{ length: CW\.total \}, \(_, i\) => \[i \+ 1, `第 \$\{i \+ 1\} 周`\]\)/);
  assert.match(M, /o\.classList\.toggle\('is-wait', !CW\.has\(i \+ 1\)\)/);
  assert.match(M, /this\.toast\(`第 \$\{st\.week\} 周的课还没来 — 等老师的课程包`/);
  assert.match(M, /if \(this\._cmapProg\[W\] \|\| !CW\.has\(W\)\) return;/, 'a week still to come is never loaded');
  assert.match(M, /boss \? \(wk\.boss\.month \? '满月月考' : '周考'\)/);
  assert.match(M, /this\._header\('课程地图', \{ sub: `\$\{CW\.total\} 周的课/);
  assert.match(C, /\.iw-cmap__node\.is-wait \.iw-cmap__disc/); assert.match(C, /\.iw-cmap__node\.is-boss\.is-month/); assert.match(C, /\.iw-wscroll\.is-many \{ overflow-x: auto;/);
  assert.match(C.slice(C.indexOf('gf-weeks: every week of her course')), /@media \(prefers-reduced-motion: reduce\) \{[^}]*\.iw-cmap__wait/);
  // main.js: a week past content/ is not cut back to week 3
  assert.match(MAIN, /const week = Math\.max\(1, Math\.floor\(\+o\.week\) \|\| 1\), day = clamp\(\+o\.day \|\| 1, 1, LEARN\.days\);/);
  // the two-player forms stay on content/'s weeks (the other player has no pack of hers)
  assert.match(src('src/net/session.js'), /clampInt\(o && o\.week != null \? o\.week : prev\.week, 1, LEARN\.weeks\)/);
});

test.after(() => { setPackStore(undefined); _reset(); });
