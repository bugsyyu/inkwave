// 打卡 (游戏为主体 第二期, docs/LEARN.md §39): the game's check-in card writes her account the way the lesson page does
// (app/index.html saveCheckin + the step's 做完 completeStep): profile.ci[dayId], profile.cp[<dayId>:<step>], the day's
// done log — and nothing else. Only into a blob that is there, the same check-in twice writes once, the date is her wall
// clock's (设置 → 时区), her own pack's step wins over the game's course, the 课本 open means no card. The contract at the
// end (CONTRACT) is the same literal as IELTS-Base tests/base/game-checkin.test.mjs, where the live page reads it back and
// writes the same three entries itself. A made-up learner — nothing here reads app/my-progress.*.
// 用法：node --test tests/learn/checkin.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ielts } from '../../src/learn/ielts.js';
import { DATA_KEY, PREF_KEY, saveCheckin, checkinEntry, herCheckin, checkedIn, packCheckinStep, mirrorFlush, _reset, MOOD_IDS, NOTE_MAX } from '../../src/learn/workbench.js';
import { MOODS, dayIdOf, planCheckinStep, checkinView, checkinGate } from '../../src/learn/checkin.js';
import { courseMap } from '../../src/learn/course-map.js';

const src = (f) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
function memory(init) {
  const m = new Map(Object.entries(init || {})), writes = [];
  return { m, writes, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { writes.push(k); m.set(k, String(v)); } };
}
// the lesson page's own shape (localBlob(): the normalized profile, then the ten collections)
const BEFORE = {
  profile: { v: 1, setup: true, examType: 'A', target: 7, examDate: '', startDate: '2026-10-13', phase: 0,
    blocks: { a: ['09:30', '11:30'], b: ['14:00', '16:00'], c: ['17:30', '19:30'] }, eveningOn: true, todos: {}, grammar: {},
    cp: { 'w1d1:a1': '2026-10-13', 'w1d2:c3': '2026-10-14' }, cq: {}, ws: {}, ww: {}, ci: { w1d2: { mood: 'ok', note: '连读还不熟', date: '2026-10-14' } },
    wr: {}, pm: {}, dt: {}, pg: {}, wrd: {}, accent: 'us' },
  days: { '2026-10': { days: { 13: { done: { 'c:w1d1:a1': { m: 35, k: 'pron' } }, extra: [] } } } },
  logs: {}, mistakes: {}, notes: { n1: { t: '记一条', at: '2026-10-14' } }, mocks: {}, packs: {}, essays: {}, teacher: {}, reviews: {},
  base: { 'ev-2026-10-13': { v: 2, it: { 'w:monday': { '2026-10-13': { '091500': [1, 'L'] } } } } },
};
// what the game writes for: w1d3, mood 'hard', a note with spaces round it, at 21:30 in Singapore on 10-19
export const CONTRACT = {
  dayId: 'w1d3', mood: 'hard', note: '  th 的音分不清，想问老师怎么练  ', now: '2026-10-19T21:30:00+08:00',
  ci: { mood: 'hard', note: 'th 的音分不清，想问老师怎么练', date: '2026-10-19' },
  cp: ['w1d3:c3', '2026-10-19'],
  day: ['2026-10', '19', { done: { 'c:w1d3:c3': { m: 5, k: 'review' } }, extra: [] }],
};
const PREFS = JSON.stringify({ tz: 'sin', accent: 'us' });
async function setup(blob = BEFORE, prefs = PREFS) {
  await ielts();
  _reset();
  return memory(Object.assign(blob ? { [DATA_KEY]: JSON.stringify(blob) } : {}, prefs ? { [PREF_KEY]: prefs } : {}));
}
const blobOf = (b) => JSON.parse(b.m.get(DATA_KEY));
const step = planCheckinStep(1, 3);

test('the card\'s moods are the page\'s (app/index.html MOODS); the day id; the game\'s course gives the step (none on w1d7)', () => {
  assert.deepEqual(MOODS, [['easy', '轻松', '😊'], ['ok', '还行', '🙂'], ['hard', '有点难', '😵']]);
  assert.deepEqual(MOODS.map((m) => m[0]), MOOD_IDS);
  assert.equal(NOTE_MAX, 500);
  assert.equal(dayIdOf(2, 5), 'w2d5');
  assert.deepEqual(step, { id: 'c3', m: 5, k: 'review' });
  assert.equal(planCheckinStep(1, 7), null, 'w1d7 (placement + weekly) has no check-in, as on the page');
  assert.deepEqual(planCheckinStep(3, 7), { id: 'c3', m: 5, k: 'review' });
  assert.equal(planCheckinStep(9, 1), null);
});

test('saving writes exactly the page\'s three entries; every other byte of her blob stays; the mirror follows', async () => {
  const b = await setup();
  const posted = [];
  globalThis.webkit = { messageHandlers: { ielts: { postMessage: (m) => posted.push(m) } } }; globalThis.__IELTS_NATIVE = { platform: 'ios' };
  try {
    const r = saveCheckin(b, CONTRACT.dayId, { mood: CONTRACT.mood, note: CONTRACT.note }, CONTRACT.now, { step });
    assert.deepEqual(r, { ok: true, changed: true, entry: CONTRACT.ci, stepDone: true, date: '2026-10-19' });
    assert.deepEqual(b.writes, [DATA_KEY], 'one write, her key only');
    const after = blobOf(b);
    assert.deepEqual(after.profile.ci[CONTRACT.dayId], CONTRACT.ci);
    assert.equal(after.profile.cp[CONTRACT.cp[0]], CONTRACT.cp[1]);
    assert.deepEqual(after.days[CONTRACT.day[0]].days[CONTRACT.day[1]], CONTRACT.day[2]);
    // the whole text: her blob with just these three put in, as JSON.stringify writes it (key order kept)
    const want = JSON.parse(JSON.stringify(BEFORE));
    want.profile.ci[CONTRACT.dayId] = CONTRACT.ci; want.profile.cp[CONTRACT.cp[0]] = CONTRACT.cp[1];
    want.days[CONTRACT.day[0]].days[CONTRACT.day[1]] = CONTRACT.day[2];
    assert.equal(b.m.get(DATA_KEY), JSON.stringify(want));
    for (const k of ['logs', 'mistakes', 'notes', 'mocks', 'packs', 'essays', 'teacher', 'reviews', 'base']) assert.equal(JSON.stringify(after[k]), JSON.stringify(BEFORE[k]), k);
    assert.deepEqual(after.profile.ci.w1d2, BEFORE.profile.ci.w1d2, 'another day\'s check-in untouched');
    assert.equal(after.days['2026-10'].days['13'].done['c:w1d1:a1'].m, 35);
    // read back (the cache was dropped: the new blob is read)
    assert.deepEqual(herCheckin(b, 'w1d3'), CONTRACT.ci);
    assert.equal(checkedIn(b, 'w1d3'), true); assert.equal(checkedIn(b, 'w1d4'), false);
    // her App's folder gets the blob as stored (the debounced mirror, flushed as the page hides)
    assert.equal(mirrorFlush(), true);
    assert.deepEqual(posted, [{ type: 'mirror', text: b.m.get(DATA_KEY) }]);
  } finally { delete globalThis.webkit; delete globalThis.__IELTS_NATIVE; _reset(); }
});

test('no workbench here: nothing is created; a blob without a profile is not hers; a day without a check-in is refused', async () => {
  const none = await setup(null, null);
  assert.deepEqual(saveCheckin(none, 'w1d3', { mood: 'ok', note: 'x' }, CONTRACT.now, { step }), { ok: false, reason: 'no-workbench' });
  assert.deepEqual(none.writes, []); assert.equal(none.m.size, 0);
  const prefsOnly = await setup(null);
  assert.equal(saveCheckin(prefsOnly, 'w1d3', { mood: 'ok' }, CONTRACT.now, { step }).reason, 'no-workbench');
  assert.deepEqual(prefsOnly.writes, []);
  const bad = memory({ [DATA_KEY]: JSON.stringify({ days: {} }) }); _reset();
  assert.equal(saveCheckin(bad, 'w1d3', { mood: 'ok' }, CONTRACT.now, { step }).reason, 'no-workbench');
  assert.deepEqual(bad.writes, []);
  const b = await setup();
  assert.equal(saveCheckin(b, 'w1d7', { mood: 'ok' }, CONTRACT.now, {}).reason, 'no-step');
  assert.equal(saveCheckin(b, '', { mood: 'ok' }, CONTRACT.now, { step }).reason, 'no-day');
  assert.equal(saveCheckin(b, '../x', { mood: 'ok' }, CONTRACT.now, { step }).reason, 'no-day');
  assert.deepEqual(b.writes, []);
  assert.equal(checkinView(none, 1, 3), null, 'no card without her account');
});

test('the same check-in twice writes once; an edit rewrites only ci (the step stays done on its first date)', async () => {
  const b = await setup();
  saveCheckin(b, 'w1d3', { mood: 'hard', note: 'x' }, CONTRACT.now, { step });
  const raw1 = b.m.get(DATA_KEY);
  const r2 = saveCheckin(b, 'w1d3', { mood: 'hard', note: ' x ' }, '2026-10-19T22:00:00+08:00', { step });
  assert.equal(r2.ok, true); assert.equal(r2.changed, false);
  assert.equal(b.writes.length, 1); assert.equal(b.m.get(DATA_KEY), raw1);
  // the next morning she changes her note: ci (and its date, as the page does) — cp and the 19th's log stay
  const r3 = saveCheckin(b, 'w1d3', { note: '想问 think 和 sink' }, '2026-10-20T08:00:00+08:00', { step });
  assert.deepEqual(r3.entry, { mood: 'hard', note: '想问 think 和 sink', date: '2026-10-20' }, 'no mood given: the saved one stays');
  assert.equal(r3.stepDone, false);
  const a = blobOf(b);
  assert.equal(a.profile.cp['w1d3:c3'], '2026-10-19');
  assert.equal(a.days['2026-10'].days['20'], undefined, 'no second log entry');
  assert.equal(b.writes.length, 2);
});

test('the page\'s empty-value rules: a mood not in MOODS is none, a note not given keeps the saved one, trimmed, at most 500', async () => {
  const old = { mood: 'ok', note: '旧的', date: '2026-10-14' };
  assert.deepEqual(checkinEntry(old, { mood: 'angry' }, 'D'), { mood: 'ok', note: '旧的', date: 'D' });
  assert.deepEqual(checkinEntry(old, { mood: '', note: '' }, 'D'), { mood: 'ok', note: '', date: 'D' }, 'an emptied note is empty');
  assert.deepEqual(checkinEntry(null, {}, 'D'), { mood: '', note: '', date: 'D' }, 'nothing at all still saves (the page\'s 保存打卡 does)');
  assert.equal(checkinEntry(null, { note: 'a'.repeat(620) }, 'D').note.length, 500);
  assert.equal(checkinEntry(null, { note: '\n  问题 \n' }, 'D').note, '问题');
});

test('her clock: the date is her 时区 setting\'s today, not the device\'s', async () => {
  const at = '2026-10-19T23:30:00Z';   // Singapore: the 20th 07:30; Los Angeles: the 19th 16:30
  for (const [tz, want] of [['sin', '2026-10-20'], ['lax', '2026-10-19'], ['lon', '2026-10-20'], ['hnl', '2026-10-19']]) {
    const b = await setup(BEFORE, JSON.stringify({ tz }));
    assert.equal(saveCheckin(b, 'w1d3', { mood: 'easy' }, at, { step }).date, want, tz);
    const a = blobOf(b);
    assert.equal(a.profile.ci.w1d3.date, want); assert.equal(a.profile.cp['w1d3:c3'], want);
    assert.ok(a.days['2026-10'].days[want.slice(8)].done['c:w1d3:c3'], 'the log is filed under the same day');
  }
  const unset = await setup(BEFORE, JSON.stringify({ accent: 'us' }));
  assert.equal(saveCheckin(unset, 'w1d3', { mood: 'easy' }, at, { step }).date, '2026-10-20', 'unset = Singapore');
});

test('her own pack decides the step (the page\'s weeks(): her pack first); a pack day without a check-in has none', async () => {
  const blob = JSON.parse(JSON.stringify(BEFORE));
  blob.packs = { w5: { week: { id: 'w5', n: 5, days: [
    { id: 'w5d2', n: 2, a: [{ id: 'a1', type: 'words' }], c: [{ id: 'c1', type: 'write' }, { id: 'c9', type: 'checkin', m: 7, k: 'writing' }] },
    { id: 'w5d7', n: 7, b: [{ id: 'b1', type: 'weekly' }] }] }, at: '2026-10-18' },
  w1: { week: { id: 'w1', n: 1, days: [{ id: 'w1d3', n: 3, c: [{ id: 'c5', type: 'checkin', m: 4, k: 'nope' }] }] }, at: '2026-10-18' } };
  assert.deepEqual(packCheckinStep(blob, 'w5d2'), { id: 'c9', m: 7, k: 'writing' });
  assert.equal(packCheckinStep(blob, 'w5d7'), null);
  assert.equal(packCheckinStep(blob, 'w2d1'), undefined);
  const b = await setup(blob);
  const r = saveCheckin(b, 'w5d2', { mood: 'ok' }, CONTRACT.now, {});
  assert.equal(r.ok, true);
  assert.deepEqual(blobOf(b).days['2026-10'].days['19'].done['c:w5d2:c9'], { m: 7, k: 'writing' });
  assert.equal(saveCheckin(b, 'w5d7', { mood: 'ok' }, CONTRACT.now, { step }).reason, 'no-step', 'the game\'s step does not override her pack');
  // her w1 pack's step id wins over the game's c3, an unknown k files as 'other'
  saveCheckin(b, 'w1d3', { mood: 'ok' }, CONTRACT.now, { step });
  const a = blobOf(b);
  assert.equal(a.profile.cp['w1d3:c5'], '2026-10-19'); assert.equal(a.profile.cp['w1d3:c3'], undefined);
  assert.deepEqual(a.days['2026-10'].days['19'].done['c:w1d3:c5'], { m: 4, k: 'other' });
  assert.equal(checkinView(b, 5, 7), null);
  assert.deepEqual(checkinView(b, 5, 2).step, { id: 'c9', m: 7, k: 'writing' });
});

test('课本 open: no card (the page in the book holds the same data); and the two never overwrite each other', async () => {
  const b = await setup();
  const v = checkinView(b, 1, 3);
  assert.deepEqual(v, { dayId: 'w1d3', week: 1, day: 3, step, saved: null, done: false });
  assert.equal(checkinGate({ view: v, book: false }), 'ok');
  assert.equal(checkinGate({ view: v, book: true }), 'book');
  assert.equal(checkinGate({ view: null, book: false }), 'none');
  // the card asks the gate with the book's own frame on the page, and every way in goes through it
  const card = src('src/ui/checkin-card.js');
  assert.match(card, /bookOpen\(\)/);
  assert.match(card, /\.iw-book__frame/);
  assert.match(card, /checkinGate\(\{ view, book: bookOpen\(\) \}\)/);
  // the book's page saved her blob while the game held an older read (her note on w1d2 and a new log): the game's save
  // reads the latest first — the page's writes stay, the game's go in beside them
  checkinView(b, 1, 3);   // (the game's cached read)
  const page = JSON.parse(JSON.stringify(BEFORE));
  page.profile.ci.w1d2 = { mood: 'easy', note: '在课本里改的', date: '2026-10-19' };
  page.logs = { l1: { m: 20, k: 'reading', at: '2026-10-19' } };
  b.m.set(DATA_KEY, JSON.stringify(page));
  saveCheckin(b, 'w1d3', { mood: 'hard', note: '游戏里写的' }, CONTRACT.now, { step });
  const a = blobOf(b);
  assert.deepEqual(a.profile.ci.w1d2, page.profile.ci.w1d2);
  assert.deepEqual(a.logs, page.logs);
  assert.equal(a.profile.ci.w1d3.note, '游戏里写的');
  // and once the game wrote, a page that loads (or hears the storage event) reads the game's — the IELTS-Base test reads
  // this blob with the live page; here: what the game reads back is what it wrote
  assert.equal(herCheckin(b, 'w1d3').note, '游戏里写的');
});

test('the course map shows the page\'s check-ins: a day she checked in on the page is checked in the game', () => {
  const ci = { 1: { 2: 'done', 3: 'todo' } };
  const m = courseMap({ weeks: 1, days: 7, today: { week: 1, day: 3 }, progress: () => ({ done: 0, total: 10 }), checkin: (w, d) => (ci[w] && ci[w][d]) || null });
  assert.deepEqual(m[0].days.map((x) => x.ci), [null, 'done', 'todo', null, null, null, null]);
  const locked = courseMap({ weeks: 1, days: 7, today: { week: 1, day: 3 }, checkin: () => 'todo' });
  assert.deepEqual(locked[0].days.map((x) => x.ci), ['todo', 'todo', 'todo', null, null, null, null], 'a locked day shows no check-in to do');
  const none = courseMap({ weeks: 1, days: 2 });
  assert.deepEqual(none[0].days.map((x) => x.ci), [null, null], 'no workbench: no check-in marks');
});

test('the ways in: the pad\'s card comes as the level ends, the menu and the map open it; the card keeps her keys and her keyboard', () => {
  const exit = src('src/learn/play/wire/exit.js'), menus = src('src/ui/menus.js'), card = src('src/ui/checkin-card.js');
  // the pad: only a check-in not made yet; the card once the level is over (flow.js _results holds the match, as for the
  // results card — never a pause mid-level), the results after the card
  assert.match(exit, /this\.wantCard = !!\(v && !v\.done\);/);
  assert.doesNotMatch(exit, /paused\s*=/);
  const flow = src('src/learn/flow.js');
  assert.match(flow, /_results\(\) \{\s*\n\s*this\.finishT = -1;\s*\n\s*this\.match\.paused = true;[\s\S]{0,260}if \(this\.play\?\.exit\?\.card\?\.\(\(\) => this\._resultsCard\(\)\)\) return;\s*\n\s*this\._resultsCard\(\);/);
  // the main menu (under the map) and the map's pill; the map's nodes read the page's record
  assert.match(menus, /const ci = this\._checkinItem\(T\);\s*\n\s*if \(ci\) items\.splice\(2, 0, ci\);/);
  assert.match(menus, /checkin: \(w, d\) => \{ const v = T \? checkinFor\(w, d\)/);
  assert.match(menus, /openCheckin\(\{ week: T\.week, day: T\.day, from: 'map'/);
  // the card: keys stay in it; the box follows the visual viewport (the soft keyboard); the note ≥ 16 px (no zoom on focus)
  assert.match(card, /el\.addEventListener\('keydown', \(e\) => \{\s*\n\s*e\.stopPropagation\(\);/);
  assert.match(card, /visualViewport/);
  assert.match(card, /vp\.style\.height = vv\.height \+ 'px'/);
  const css = src('styles/ui.css'), sec = css.slice(css.indexOf('游戏为主体 第二期: 打卡'));
  assert.match(sec, /\.iw-ci__note \{[^}]*font: 500 16px/);
  // ≥ 44 pt everywhere she taps
  for (const [sel, prop] of [['.iw-ci__mood {', 'min-height: (\\d+)px'], ['.iw-ci__save {', 'height: (\\d+)px'], ['.iw-ci__later {', 'height: (\\d+)px'], ['.iw-cmap__cibtn {', 'min-height: (\\d+)px'], ['.iw-ci__note {', 'min-height: (\\d+)px']]) {
    const rule = sec.slice(sec.indexOf(sel), sec.indexOf('}', sec.indexOf(sel)));
    assert.ok(+new RegExp(prop).exec(rule)[1] >= 44, sel);
  }
  assert.match(sec, /\.iw-ci__mood \{ min-height: 60px;/, 'landscape moods still ≥ 44');
  // the press lands the frame the finger does; the stamp; reduced motion fades only
  assert.match(card, /addEventListener\('pointerdown', \(\) => \{ b\.classList\.add\('is-down'\); \}\)/);
  assert.match(sec, /\.iw-ci__save\.is-down, \.iw-ci__later\.is-down \{[^}]*transition-duration: 0s/);
  assert.match(sec, /@keyframes iw-ci-stamp/);
  assert.match(card, /sfx\('stamp_slam'/);
  const red = sec.slice(sec.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(red, /\.iw-ci__card, \.iw-ci\.is-out \.iw-ci__card \{ transform: none !important; transition: opacity \.18s linear !important; \}/);
  assert.match(red, /\.iw-ci\.is-stamped \.iw-ci__stamp \{ animation: iw-fade/);
  // only transform / opacity animate in the card's keyframes
  for (const k of ['iw-ci-hit', 'iw-ci-in', 'iw-ci-pick', 'iw-ci-stamp', 'iw-ci-ink']) {
    const body = sec.slice(sec.indexOf('@keyframes ' + k), sec.indexOf('\n', sec.indexOf('@keyframes ' + k) + 30) + 400).split(/\n(?=\S)/)[0];
    for (const p of body.match(/[a-z-]+(?=:)/g) || []) assert.ok(['opacity', 'transform', 'translate', 'scale', 'rotate'].includes(p), k + ': ' + p);
  }
});
