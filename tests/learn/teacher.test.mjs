// 老师 (游戏为主体 第三期第三步, docs/LEARN.md §46): the 课本's 老师 page made the game's own. Importing a course pack is the
// lesson page's (app/index.html importPackText / packError / packAdd / setNotes / packGlossGaps: the same text gives the same
// words, and the same write — packs[w.id] = { week, at }, teacher.notes = { text, at } — nothing else changes, nothing is
// created without her blob, the same pack twice writes once, the dates are her wall clock's, the mirror follows); what the
// page shows before the lesson page answers is its own reading (notesText / notesMeta / weeks()); the weekly report is the
// lesson page's answer (ielts:ask → ielts:answer: only its own window, same origin, by id; no answer in time: null).
// BEFORE / CONTRACT at the top are the same literals as IELTS-Base tests/base/game-teacher.test.mjs, where the live page
// imports the same texts itself and reads the game's write back. A made-up learner — nothing here reads app/my-progress.*.
// 用法：node --test tests/learn/teacher.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { ielts } from '../../src/learn/ielts.js';
import { NATIVE_PAGES, nativeOf, pageMessage, answerOf, makeAsker, ASK_MS } from '../../src/learn/book.js';
import { DATA_KEY, PREF_KEY, mirrorFlush, _reset } from '../../src/learn/workbench.js';
import { herPacks, hasWeek, setPackStore } from '../../src/learn/weeks.js';
import { appToday } from '../../src/learn/app.js';
import {
  LEAD, HOW, HOW_NOTE, NOTES_NOTE, ASK_NOTE, SAY, FILE_MAX, PACK_MAX, NOTES_MAX, FORMAT_NAME, TEACHER_TEMPLATES, INITIAL_NOTES, PAIR_ZH,
  notesText, notesMeta, packList, packError, readPack, glossGaps, savePack, importPack, classicAt,
} from '../../src/learn/teacher.js';

// ---- the contract (IELTS-Base tests/base/game-teacher.test.mjs has the same literals) ----
// the lesson page's own shape (localBlob(): the normalized profile, then the ten collections)
export const BEFORE = {
  profile: { v: 1, setup: true, examType: 'A', target: 7, examDate: '', startDate: '2026-10-13', phase: 0,
    blocks: { a: ['09:30', '11:30'], b: ['14:00', '16:00'], c: ['17:30', '19:30'] }, eveningOn: true, todos: {}, grammar: {},
    cp: { 'w1d1:a1': '2026-10-13' }, cq: {}, ws: {}, ww: {}, ci: {}, wr: {}, pm: {}, dt: {}, pg: {}, wrd: {}, accent: 'us' },
  days: { '2026-10': { days: { 13: { done: { 'c:w1d1:a1': { m: 35, k: 'pron' } }, extra: [] } } } },
  logs: {}, mistakes: {},
  notes: { mgw2cc33dd44: { id: 'mgw2cc33dd44', d: '2026-10-19', t: 'word', en: 'commute', zh: '通勤', ex: 'I commute to work by bus.' } },
  mocks: {}, packs: {}, essays: {}, teacher: {}, reviews: {},
  base: { 'ev-2026-10-13': { v: 2, it: { 'w:monday': { '2026-10-13': { '091500': [1, 'L'] } } } } },
};
// a made-up week 4 from the teacher: two days; one word without its American IPA, a 听辨 word without Chinese, a reading
// without its translation, a speaking model without its translation (packGlossGaps says all four)
const W4 = { id: 'w4', n: 4, title: '第 4 周：失去爆破和同化（现编）', days: [
  { id: 'w4d1', n: 1, title: '第 1 天', teacher: '今天先听再说。',
    a: [{ id: 'a1', type: 'words', title: '单词', m: 30, k: 'vocab', words: [['school', 'skuːl', '学校', 'skuːl'], ['teacher', 'ˈtiːtʃə', '老师']] }],
    b: [{ id: 'b1', type: 'pairs', title: '听辨', m: 15, k: 'pron', pairs: [['ship', 'sheep'], ['glad', 'clad', '高兴的']] }],
    c: [{ id: 'c1', type: 'checkin', title: '打卡', m: 5, k: 'review' }] },
  { id: 'w4d2', n: 2, title: '第 2 天',
    a: [{ id: 'a1', type: 'reading', title: '阅读', m: 30, k: 'reading', passage: { title: 'A school day', titleZh: '上学的一天', text: 'I go to school by bus.', gloss: [['bus', '公交车']], quiz: [] } }],
    b: [{ id: 'b1', type: 'speak', title: '口语', m: 20, k: 'speaking', speak: { q: 'Do you like school?', zh: '你喜欢上学吗？', model: 'Yes, I do.', phrases: [] } }] },
] };
const NOTES = '- 第 4 周起练失去爆破和同化。\n- 她的 /æ/ 还要多听，第 2 天的阅读先听后读。';
const PACK = { app: 'ielts-workbench-course', v: 1, week: W4, notes: NOTES };
const mk = (mut, extra) => { const w = JSON.parse(JSON.stringify(W4)); const o = Object.assign({ app: 'ielts-workbench-course', v: 1, week: mut ? mut(w) || w : w }, extra || {}); return JSON.stringify(o); };
const BAD = (err) => '这个课程包导入不了：' + err + '。';
export const CONTRACT = {
  now: '2026-10-20T21:30:00+08:00', today: '2026-10-20',
  hash: { pairZh: 'b518d58cecaeeba1', templates: '4e84e60d3bd0bd60', initialNotes: 'e01b169b0e3135f2' },
  // the App's 我们怎么一起学 (OFFLINE), the page's lead and notes
  lead: '我是你的雅思老师 Claude。工作台每天带着你学，我负责批改、答疑，每周根据你的情况准备新课，一直陪你到考试。',
  how: [['每天', '：打开「今日」，跟着三节课学，材料都在里面。遇到不懂的，随时复制下面的模板来问我。'],
    ['每周最后一天', '：做完周复盘，把周报复制给我。我会批改你的翻译、回答你的问题，再按你的情况准备下一周的课程包。'],
    ['拿到课程包', '：在下面点"导入课程包"选文件，或者把我发的课程包整段复制到"粘贴课程包"里，新一周的课就会出现在「今日」里。']],
  howNote: '小提醒：我不会主动来找你；开一个新对话，我也不记得之前聊过什么，除非你在 Claude 的设置里打开记忆功能。所以周报很重要，它会把你的情况完整地带给我。在新对话里第一次找我时，把"课程格式说明"文件也一起发过来。',
  week: W4, notes: NOTES,
  done: '已导入「第 4 周：失去爆破和同化（现编）」，去「今日」开始学吧！注意：1 个单词没有美音音标，1 篇阅读没有中文翻译，1 个口语示范没有中文翻译，1 个听辨词没有中文，可以请老师补上。',
  // [what, the text, what the page says (null: the pack is taken)]
  cases: [
    ['a ```json block, words around it (with braces of their own)', '老师：这是第 4 周的课程包 {先看这个}\n```json\n' + JSON.stringify(PACK, null, 1) + '\n```\n有问题再问我 :}', null],
    ['words before and after, no block', '下面是课程包：' + JSON.stringify(PACK) + ' 祝学习愉快', null],
    ['a block that parses but is not a pack, then the pack', '```\n{"a": 1}\n```\n再看这个：\n```json\n' + JSON.stringify(PACK) + '\n```', null],
    ['the format description', mk(null, { note: '雅思工作台课程包格式。文件结构：……' }), '这是"课程格式说明"，是发给老师参考的，不是新的课程包。'],
    ['another app\'s file', JSON.stringify({ app: 'other', week: W4 }), BAD('文件格式不对')],
    ['no week id', mk((w) => { delete w.id; }), BAD('缺少周编号')],
    ['no title', mk((w) => { w.title = 4; }), BAD('缺少标题')],
    ['no days', mk((w) => { w.days = []; }), BAD('没有课程内容')],
    ['a day of another week', mk((w) => { w.days[1].id = 'w5d2'; }), BAD('某一天的编号不对')],
    ['n that is not a number', mk((w) => { w.days[1].n = 'two'; }), BAD('某一天的编号不对')],
    ['a session that is not a list', mk((w) => { w.days[0].b = { id: 'b1' }; }), BAD('时段格式不对')],
    ['a type the page does not know', mk((w) => { w.days[0].c[0].type = 'dance'; }), BAD('有不认识的练习类型')],
    ['a list that is not one', mk((w) => { w.days[0].a[0].words = 'school, teacher'; }), BAD('w4d1 里 a1 的内容格式不对')],
    ['two days with one id', mk((w) => { w.days[1].id = 'w4d1'; }), BAD('有两天的编号都是 w4d1')],
    ['a day without n', mk((w) => { delete w.days[1].n; }), BAD('w4d2 缺少第几天（n）')],
    ['two steps of a day with one id', mk((w) => { w.days[0].c[0].id = 'a1'; }), BAD('w4d1 里有两个步骤的编号都是 a1（同一天里的步骤编号不能重复）')],
    ['too big', mk((w) => { w.days[0].teacher = 'x'.repeat(240000); }), '这个课程包太大了，请老师拆成两份。'],
    ['empty', '', BAD('文件格式不对')],
    ['no JSON at all', '老师说下周再发', BAD('文件格式不对')],
  ],
  // the 课程包 list before and after (the built-in week 1 is the lesson page's W1 = the game's content/w1.json)
  w1: { id: 'w1', title: '第 1 周：打地基', days: 7 },
  packsAfter: [{ id: 'w1', title: '第 1 周：打地基', builtin: true, days: 7 }, { id: 'w4', title: '第 4 周：失去爆破和同化（现编）', builtin: false, days: 2 }],
  meta: { before: '第一版，写于开始学习时', after: '老师更新于 2026年10月20日' },
};
// what the game leaves after the import of CONTRACT.week with its notes (both sides compare their own write with this)
function gameAfter(withNotes = true) {
  const o = clone(BEFORE);
  o.packs.w4 = { week: CONTRACT.week, at: CONTRACT.today };
  if (withNotes) o.teacher.notes = { text: CONTRACT.notes, at: CONTRACT.today };
  return o;
}

const clone = (o) => JSON.parse(JSON.stringify(o));
const sha = (x) => createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0, 16);
function memory(init) {
  const m = new Map(Object.entries(init || {})), writes = [];
  return { m, writes, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { writes.push(k); m.set(k, String(v)); } };
}
const PREFS = JSON.stringify({ tz: 'sin', accent: 'us' });
async function setup(blob = BEFORE, prefs = PREFS) {
  await ielts();
  _reset();
  return memory(Object.assign(blob ? { [DATA_KEY]: JSON.stringify(blob) } : {}, prefs ? { [PREF_KEY]: prefs } : {}));
}
const blobOf = (b) => JSON.parse(b.m.get(DATA_KEY));
const W1 = JSON.parse(readFileSync(new URL('../../content/w1.json', import.meta.url), 'utf8')).week;

test('the page\'s words and tables: the App\'s 我们怎么一起学, the lead, the templates / 老师笔记 / 听辨 Chinese (the lesson page\'s, by hash), the limits', () => {
  assert.equal(LEAD, CONTRACT.lead);
  assert.deepEqual(HOW.map((x) => [x[0], x[1]]), CONTRACT.how);
  assert.equal(HOW_NOTE, CONTRACT.howNote);
  assert.match(NOTES_NOTE, /^这是我对你的了解和教学安排。/);
  assert.equal(ASK_NOTE, '点开复制，粘贴到和 Claude 的对话里就行。');
  assert.deepEqual([sha(PAIR_ZH), sha(TEACHER_TEMPLATES), sha(INITIAL_NOTES)], [CONTRACT.hash.pairZh, CONTRACT.hash.templates, CONTRACT.hash.initialNotes]);
  assert.deepEqual(TEACHER_TEMPLATES.map((t) => t[0]), ['作文批改', '口语陪练', '问一个问题', '今天学不动了']);
  assert.deepEqual([FILE_MAX, PACK_MAX, NOTES_MAX, FORMAT_NAME], [3 * 1024 * 1024, 240000, 20000, '课程格式说明.json']);
  assert.deepEqual([SAY.file, SAY.read, SAY.paste, SAY.copied, SAY.downloaded], ['这个文件太大，不像是课程包。', '读取文件失败了。', '先把老师发来的课程包整段粘贴到上面的框里，再点导入。', '已复制，粘贴到和 Claude 的对话里就能用。', '已下载。在新对话里第一次找老师时，把它和周报一起发过去。']);
});

test('a pack as text reads as importPackText: the ```json block first, then first { to last }; the format description and every packError in the page\'s words; too big', () => {
  for (const [what, text, says] of CONTRACT.cases) {
    const r = readPack(text);
    if (says == null) {
      assert.equal(r.ok, true, what);
      assert.deepEqual(r.week, CONTRACT.week, what);
      assert.equal(r.notes, CONTRACT.notes, what);
    } else {
      assert.equal(r.ok, false, what);
      assert.equal(r.msg, says, what);
    }
  }
  assert.equal(glossGaps(CONTRACT.week).length, 4);
  assert.equal(SAY.done(CONTRACT.week.title, glossGaps(CONTRACT.week)), CONTRACT.done);
  assert.equal(SAY.done('第 9 周', []), '已导入「第 9 周」，去「今日」开始学吧！', 'nothing missing: no 注意');
  // the notes: a non-empty string only, its first 20000 as given (not trimmed); a pack without them leaves 老师笔记 alone
  assert.equal(readPack(mk(null, { notes: '   ' })).notes, null);
  assert.equal(readPack(mk(null, { notes: 7 })).notes, null);
  assert.equal(readPack(mk(null, { notes: ' 先' + 'y'.repeat(30000) })).notes.length, 20000);
  assert.equal(packError(null), '文件格式不对');
  assert.equal(packError(CONTRACT.week), '');
});

test('导入 writes packs[w4] = { week, at: her today } and teacher.notes = { text, at }, nothing else; every other byte stays; the mirror follows; the same pack twice writes once', async () => {
  const b = await setup();
  const posted = [];
  globalThis.webkit = { messageHandlers: { ielts: { postMessage: (m) => posted.push(m) } } }; globalThis.__IELTS_NATIVE = { platform: 'ios' };
  try {
    const r = importPack(b, CONTRACT.cases[0][1], CONTRACT.now);
    assert.equal(r.ok, true);
    assert.equal(r.msg, CONTRACT.done, 'the page\'s toast, the gaps included');
    assert.deepEqual(b.writes, [DATA_KEY], 'one write, her key only');
    assert.equal(b.m.get(DATA_KEY), JSON.stringify(gameAfter()), 'her blob with just these two put in (key order kept)');
    assert.equal(mirrorFlush(), true);
    assert.deepEqual(posted, [{ type: 'mirror', text: b.m.get(DATA_KEY) }]);
    // the same pack again (pasted once more, the other way round): nothing is written; the page still says it is in
    const again = importPack(b, CONTRACT.cases[1][1], CONTRACT.now);
    assert.deepEqual([again.ok, again.changed, again.msg], [true, false, CONTRACT.done]);
    assert.equal(b.writes.length, 1);
  } finally { delete globalThis.webkit; delete globalThis.__IELTS_NATIVE; _reset(); }
  // without notes: only packs
  const b2 = await setup();
  importPack(b2, mk(), CONTRACT.now);
  assert.equal(b2.m.get(DATA_KEY), JSON.stringify(gameAfter(false)));
  // a week she has already: replaced where it is (its key keeps its place), at = today
  const had = clone(BEFORE); had.packs = { w2: { week: { id: 'w2', title: '第 2 周', days: [{ id: 'w2d1', n: 1 }] }, at: '2026-10-01' }, w4: { week: { id: 'w4', title: '旧的第 4 周', days: [{ id: 'w4d1', n: 1 }] }, at: '2026-10-05' }, w5: { week: { id: 'w5', title: '第 5 周', days: [{ id: 'w5d1', n: 1 }] }, at: '2026-10-06' } };
  had.teacher = { notes: { text: '旧的笔记', at: '2026-10-05' }, other: 1 };
  const b3 = await setup(had);
  importPack(b3, CONTRACT.cases[0][1], CONTRACT.now);
  const want = clone(had); want.packs.w4 = { week: CONTRACT.week, at: CONTRACT.today }; want.teacher.notes = { text: CONTRACT.notes, at: CONTRACT.today };
  assert.equal(b3.m.get(DATA_KEY), JSON.stringify(want));
  assert.deepEqual(Object.keys(blobOf(b3).packs), ['w2', 'w4', 'w5']);
  assert.deepEqual(Object.keys(blobOf(b3).teacher), ['notes', 'other']);
});

test('a pack turned down, or no workbench here: nothing is written, nothing is created', async () => {
  const b = await setup();
  for (const [what, text, says] of CONTRACT.cases) if (says) assert.deepEqual(importPack(b, text, CONTRACT.now), readPack(text), what);
  assert.deepEqual(b.writes, []);
  const none = await setup(null, null);
  const r = importPack(none, CONTRACT.cases[0][1], CONTRACT.now);
  assert.deepEqual([r.ok, r.why, r.msg], [false, 'no-workbench', '这里没有你的课本数据，没存上。']);
  assert.deepEqual(none.writes, []); assert.equal(none.m.size, 0);
  const bad = memory({ [DATA_KEY]: JSON.stringify({ packs: {} }) }); _reset();
  assert.equal(savePack(bad, CONTRACT.week, null, CONTRACT.today).reason, 'no-workbench', 'a blob without a profile is not hers');
  assert.deepEqual(bad.writes, []);
  assert.equal(savePack(b, CONTRACT.week, null, 'soon').reason, 'empty');
  assert.deepEqual(b.writes, []);
});

test('her today is her wall clock\'s; the lesson page in the book wrote meanwhile: the game reads the latest before it writes', async () => {
  const lax = await setup(BEFORE, JSON.stringify({ tz: 'lax' }));
  importPack(lax, mk(), '2026-10-20T03:30:00Z');
  assert.equal(blobOf(lax).packs.w4.at, '2026-10-19', 'Los Angeles: still the 19th');
  const b = await setup();
  importPack(b, mk(), CONTRACT.now);
  const o = blobOf(b); o.notes.p1 = { id: 'p1', d: '2026-10-20', t: 'word', en: 'from the page', zh: '', ex: '' };
  b.m.set(DATA_KEY, JSON.stringify(o));
  importPack(b, CONTRACT.cases[0][1], CONTRACT.now);
  assert.ok(blobOf(b).notes.p1, 'the page\'s note stays');
  assert.equal(blobOf(b).teacher.notes.text, CONTRACT.notes);
});

test('the week she imported is the game\'s at once: herPacks / hasWeek, and her today once the page says it (appToday)', async () => {
  const b = await setup();
  setPackStore(b);
  try {
    assert.equal(hasWeek(4), false);
    importPack(b, CONTRACT.cases[0][1], CONTRACT.now);
    assert.equal(hasWeek(4), true, 'no reload: the cache went with the write');
    assert.deepEqual(herPacks(blobOf(b)).get(4), CONTRACT.week);
    assert.deepEqual(appToday('?from=app&today=w4d1'), { week: 4, day: 1, done: false, inGame: true });
  } finally { setPackStore(null); _reset(); }
});

test('what the page shows before the lesson page answers: notesText / notesMeta, weeks() (her loadable packs, then the built-in week 1, by number)', async () => {
  assert.equal(notesText(BEFORE), INITIAL_NOTES);
  assert.equal(notesMeta(BEFORE), CONTRACT.meta.before);
  assert.equal(notesText(gameAfter()), CONTRACT.notes);
  assert.equal(notesMeta(gameAfter()), CONTRACT.meta.after);
  assert.equal(notesText({ teacher: { notes: { text: '  ', at: '2026-10-20' } } }), INITIAL_NOTES, 'blank: the first version');
  assert.equal(notesMeta({ teacher: { notes: { text: 'x', at: 'soon' } } }), CONTRACT.meta.before);
  assert.deepEqual({ id: W1.id, title: W1.title, days: W1.days.length }, CONTRACT.w1, 'content/w1.json is the lesson page\'s W1');
  assert.deepEqual(packList(BEFORE, W1), [CONTRACT.packsAfter[0]]);
  assert.deepEqual(packList(gameAfter(), W1), CONTRACT.packsAfter);
  // a broken pack is not listed; her own week 1 takes the built-in one's place; one per id
  const o = gameAfter(); o.packs.bad = { week: { id: 'w9' } }; o.packs.w1 = { week: { id: 'w1', title: '她的第 1 周', days: [{ id: 'w1d1', n: 1 }] }, at: '2026-10-20' };
  o.packs.dup = { week: { id: 'w4', title: '又一份', days: [{ id: 'w4d1', n: 1 }] }, at: '2026-10-20' };
  assert.deepEqual(packList(o, W1).map((x) => [x.id, x.title, x.builtin]), [['w1', '她的第 1 周', false], ['w4', CONTRACT.week.title, false]]);
  assert.deepEqual(packList(null, null), []);
});

test('the lesson page\'s own 老师 when the book\'s page cannot answer: prefs.view = teacher for today (the page reopens it), only with her workbench', async () => {
  const b = await setup();
  assert.equal(classicAt(b, 'teacher', CONTRACT.now), true);
  assert.deepEqual(JSON.parse(b.m.get(PREF_KEY)), { tz: 'sin', accent: 'us', view: 'teacher', viewOn: '2026-10-20' });
  const none = await setup(null, null);
  assert.equal(classicAt(none, 'teacher', CONTRACT.now), false);
  assert.equal(none.m.size, 0);
});

test('the answer: only from the book\'s own window, same origin, an id; answerOf checks its fields; a question with no answer in time is null', async () => {
  const win = {}, other = {}, O = 'ielts-base://app';
  const ans = { type: 'ielts:answer', id: 'k1-x', what: 'teacher', title: '第 1 周：打地基', report: '老师好！', fmt: 'dl', format: '{}', notes: { text: 'n', meta: 'm' }, templates: [['a', 'b'], ['bad']], weeks: [{ id: 'w1', title: 't', builtin: true, days: 7 }], today: 'game/index.html?from=app&today=w1d2' };
  assert.deepEqual(pageMessage({ source: win, origin: O, data: ans }, win, O), { answer: ans });
  assert.equal(pageMessage({ source: other, origin: O, data: ans }, win, O), null, 'another window');
  assert.equal(pageMessage({ source: win, origin: 'https://evil.example', data: ans }, win, O), null, 'another origin');
  assert.equal(pageMessage({ source: win, origin: O, data: Object.assign({}, ans, { id: '' }) }, win, O), null, 'no id');
  assert.equal(pageMessage({ source: win, origin: O, data: Object.assign({}, ans, { id: 7 }) }, win, O), null);
  assert.deepEqual(pageMessage({ source: win, origin: O, data: { type: 'ielts:flushed' } }, win, O), { flushed: true }, 'the old messages as they were');
  const a = answerOf(ans);
  assert.deepEqual(a, { title: '第 1 周：打地基', report: '老师好！', fmt: 'dl', format: '{}', notes: { text: 'n', meta: 'm' }, templates: [['a', 'b']], weeks: [{ id: 'w1', title: 't', builtin: true, days: 7 }], today: 'game/index.html?from=app&today=w1d2' });
  assert.equal(answerOf(Object.assign({}, ans, { what: 'notes' })), null);
  assert.equal(answerOf(Object.assign({}, ans, { report: null })), null);
  assert.equal(answerOf(null), null);
  assert.equal(answerOf(Object.assign({}, ans, { fmt: 'copy' })).fmt, 'copy');
  // the asker: sent once the page is up, again after a load; answered by id; null after ASK_MS; null for all when the book closes
  assert.equal(ASK_MS, 20000);
  const timers = [], sent = [];
  let up = false;
  const T = { set: (f, ms) => { timers.push({ f, ms, on: true }); return timers.length - 1; }, clear: (i) => { timers[i].on = false; } };
  const k = makeAsker((m) => { if (!up) return false; sent.push(m); return true; }, ASK_MS, T);
  const p1 = k.ask('teacher');
  assert.deepEqual(sent, [], 'not before the page has loaded');
  up = true; k.send(true);
  assert.equal(sent.length, 1);
  assert.deepEqual([sent[0].type, sent[0].what, typeof sent[0].id], ['ielts:ask', 'teacher', 'string']);
  k.send(true);
  assert.equal(sent.length, 2, 'a load again: asked again (a new address dropped it)');
  assert.equal(k.answer('nope', {}), false, 'an id it is not waiting on');
  assert.equal(k.answer(sent[0].id, ans), true);
  assert.equal(await p1, ans);
  assert.equal(k.answer(sent[0].id, ans), false, 'once');
  const p2 = k.ask('teacher');
  assert.equal(timers[1].ms, ASK_MS);
  timers[1].f();
  assert.equal(await p2, null, 'no answer in time: null');
  const p3 = k.ask('teacher'), p4 = k.ask('teacher');
  k.drop();
  assert.deepEqual([await p3, await p4, k.size], [null, null, 0], 'the book closes: null');
});

// ---------- the page: wiring, look ----------
const src = (f) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const MENUS = src('src/ui/menus.js'), BOOK = MENUS.slice(MENUS.indexOf('  _scr_book() {'), MENUS.indexOf('  _startLearn(st, from = null) {'));
const PAGE = src('src/ui/book-pages/teacher.js');
const CSS = src('styles/ui.css'), css = CSS.slice(CSS.indexOf('游戏为主体 第三期第三步: 老师'));

test('the register: 老师 is the game\'s own page; the book asks its own lesson page (made hidden under it when there is none), never a second one', async () => {
  assert.ok(Object.keys(NATIVE_PAGES).includes('teacher'));
  assert.equal(nativeOf('teacher'), 'teacher');
  assert.equal(typeof (await NATIVE_PAGES.teacher()).mount, 'function');
  assert.match(BOOK, /ask: \(what\) => \{ if \(closing\) return Promise\.resolve\(null\); if \(!frame\) frameUp\(\); return asker\.ask\(what\); \}/, 'the book\'s own iframe, made when there is none');
  assert.equal((BOOK.match(/h\('iframe'/g) || []).length, 1, 'one iframe in the book, ever');
  assert.match(BOOK, /frame\.addEventListener\('load', \(\) => \{ loaded = true; el\.classList\.add\('is-loaded'\); asker\.send\(true\); \}\);/);
  assert.match(BOOK, /if \(m\.answer\) \{ asker\.answer\(m\.answer\.id, m\.answer\); return; \}/);
  assert.match(BOOK, /destroy: \(\) => \{[\s\S]*asker\.drop\(\);/);
  assert.match(BOOK, /today: \(search\) => \{\s*const T = appToday\(search\);/, 'her today moves on when the page says so');
  assert.match(MENUS, /\nlet APP_TODAY = /);
});

test('the page: her words never as markup; keys typed are its own; the paste box is a sheet (over the keyboard); copy is copyText\'s three ways; the format file is a download', () => {
  assert.doesNotMatch(PAGE.replace(/html: (PLUS|CHECK|DOWN_SVG|GLYPHS\.\w+|splatSVG\([^)]*\))/g, '').replace(/\.innerHTML = fmt === 'copy' \? GLYPHS\.copy : DOWN_SVG/, ''), /html:|innerHTML/, 'only icons go in as markup');
  assert.match(PAGE, /ownKeys\(fr\.el\)/);
  assert.match(PAGE, /readBlob\(ls, \{ fresh: true \}\)/);
  assert.match(PAGE, /sh = sheet\(ctx, \{ tape: '粘贴课程包'/);
  assert.match(PAGE, /navigator\.clipboard\.writeText\(text\)/);
  assert.match(PAGE, /document\.execCommand\('copy'\)/);
  assert.match(PAGE, /byHand\(text\)/);
  assert.match(PAGE, /h\('a', \{ href: url, download: FORMAT_NAME, hidden: true \}\)/);
  assert.match(PAGE, /rd\.readAsText\(f, 'utf-8'\)/);
  assert.match(PAGE, /if \(f\.size > FILE_MAX\)/);
  assert.match(PAGE, /'正在按你这一周的记录生成……'/);
  assert.match(PAGE, /'到经典页的老师里复制'/);
  assert.match(PAGE, /classicAt\(ls, 'teacher', ctx\.now\(\)\); location\.href = BOOK_URL;/);
  assert.match(PAGE, /askNow\(\(a\) => \{ if \(a\.today && ctx\.today\)/, 'after an import: asked again, her today follows');
  for (const id of ['tc-copy', 'tc-format', 'tc-pick', 'tc-paste', 'tc-import', 'tc-later']) assert.match(PAGE, new RegExp("id: '" + id + "'"), id + ': in the menus\' focus');
  assert.match(PAGE, /ctx\.bind\(head, \{ id: 'tc-tpl-' \+ i/);
});

test('look: a letter on ruled paper that scrolls in its own box; sticker panels and rows; ≥ 44 pt; transitions 300–450 ms; only transform / opacity move; reduced motion fades', () => {
  assert.ok(css.length > 2000, 'found the section');
  assert.match(css, /\.iw-bt-letter \{[^}]*max-height: min\(52vh, 440px\)[^}]*overflow: hidden auto; overscroll-behavior: contain/);
  assert.match(css, /\.iw-bt-letter \{[^}]*font: 500 15px \/ 27px/);
  assert.match(css, /repeating-linear-gradient\(180deg, transparent 0 26px, rgba\(92, 140, 205, \.24\) 26px 27px\) 0 20px \/ 100% 27px local/, 'the rules every 27 px (the line height), scrolling with the words');
  assert.match(css, /\.iw-bt-paper \{[^}]*box-shadow: 0 0 0 3px var\(--k\), 0 6px 0 3px var\(--k\)/, 'an ink outline, an offset solid shadow');
  assert.match(css, /\.iw-bt-tpl__h \{[^}]*min-height: 52px/);
  assert.match(css, /\.iw-bt-pack \{[^}]*min-height: 48px/);
  assert.match(css, /\.iw-bt-tpl__h\.is-down \{[^}]*transition-duration: 0s/);
  assert.match(css, /\.iw-bp--teacher \.iw-bp__in \{ animation-duration: \.44s;/);
  const durs = [...css.matchAll(/animation: iw-bt-(\w+) (\.\d+)s/g)].map((m) => [m[1], Math.round(parseFloat(m[2]) * 1000)]);
  assert.deepEqual(durs.map((d) => d[0]).sort(), ["fill", "nope", "open"]);
  for (const [k, ms] of durs) assert.ok(ms >= 300 && ms <= 450, k + ': ' + ms + ' ms');
  for (const [, body] of css.matchAll(/@keyframes iw-bt-\w+ \{([^@]*?)\}\s*\}?/g)) assert.doesNotMatch(body, /(?:^|[{;\s])(?:width|height|top|left|margin|padding)\s*:/, 'keyframes move transform / opacity only');
  assert.doesNotMatch(css, /backdrop-filter/);
  const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(rm, /animation: iw-fade \.22s linear backwards !important/);
  assert.match(rm, /\.iw-bt-blot \{ animation: none; \}/);
  assert.match(css, /\.iw-bt-paste \{[^}]*font-size: 16px/, '16 px: a phone does not zoom on focus');
});
