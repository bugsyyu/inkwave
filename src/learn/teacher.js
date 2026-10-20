// src/learn/teacher.js — 老师 (游戏为主体 第三期第三步, docs/LEARN.md §46): the 课本's 老师 page made the game's own. What the
// lesson page says there and does (app/index.html mountTeacher, importPackText / packError / packAdd / setNotes /
// packGlossGaps, notesText / notesMeta, weeks(), TEACHER_TEMPLATES), copied; the weekly report is not — weekReport goes on
// into app/base/core.js's plan lines and app/exam/store.js's exam lines, so the lesson page in the book says it itself
// (ielts:ask → ielts:answer, book.js answerOf).
//   import    a pack as text (a file or pasted): the JSON of a ```json block first, then from the first { to the last };
//             the first that is a course pack, else the first that parses; the format description and every packError
//             are turned down in the page's words; then packs[w.id] = { week: w, at: her today } and, when the pack has
//             notes, teacher.notes = { text: its first 20000, at: her today }
// Writing follows LEARN §39 / §41: her latest blob first (readBlob fresh), only those keys change (every other field and
// document the same value, so the same JSON text), nothing is created without her blob, the same pack twice writes once,
// then the cache goes (invalidate) and her App's mirror follows (mirror). Pure but for the storage (passed in), so Node
// tests run it; nothing here reads app/my-progress.*.
import { DATA_KEY, PREF_KEY, readBlob, readPrefs, present, invalidate, mirror } from './workbench.js';
import { weekError } from './weeks.js';
import { todayOf } from './notes.js';

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const isYmd = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/* ───────────────────────────── the page's words (the App's build: OFFLINE) ───────────────────────────── */
export const LEAD = '我是你的雅思老师 Claude。工作台每天带着你学，我负责批改、答疑，每周根据你的情况准备新课，一直陪你到考试。';
// 我们怎么一起学: [the bold word, the rest of the line]; the note under it (the App's sentence about the format file)
export const HOW = Object.freeze([
  ['每天', '：打开「今日」，跟着三节课学，材料都在里面。遇到不懂的，随时复制下面的模板来问我。'],
  ['每周最后一天', '：做完周复盘，把周报复制给我。我会批改你的翻译、回答你的问题，再按你的情况准备下一周的课程包。'],
  ['拿到课程包', '：在下面点"导入课程包"选文件，或者把我发的课程包整段复制到"粘贴课程包"里，新一周的课就会出现在「今日」里。'],
].map(Object.freeze));
export const HOW_NOTE = '小提醒：我不会主动来找你；开一个新对话，我也不记得之前聊过什么，除非你在 Claude 的设置里打开记忆功能。所以周报很重要，它会把你的情况完整地带给我。在新对话里第一次找我时，把"课程格式说明"文件也一起发过来。';
export const NOTES_NOTE = '这是我对你的了解和教学安排。每次批改或者给你新课时，我会更新它；它也会自动写进周报，这样换了新对话我也能接上。';
export const ASK_NOTE = '点开复制，粘贴到和 Claude 的对话里就行。';
// what the page says (toast) — copyText, downloadJSON, onPackFile, importPackText, packAdd, lessonAct 'pack-paste'
export const SAY = Object.freeze({
  format: '这是"课程格式说明"，是发给老师参考的，不是新的课程包。',
  bad: (err) => '这个课程包导入不了：' + err + '。',
  big: '这个课程包太大了，请老师拆成两份。',
  file: '这个文件太大，不像是课程包。',
  read: '读取文件失败了。',
  paste: '先把老师发来的课程包整段粘贴到上面的框里，再点导入。',
  done: (title, miss) => '已导入「' + title + '」，去「今日」开始学吧！' + (miss.length ? '注意：' + miss.join('，') + '，可以请老师补上。' : ''),
  copied: '已复制，粘贴到和 Claude 的对话里就能用。',
  downloaded: '已下载。在新对话里第一次找老师时，把它和周报一起发过去。',
  dlFail: '没能导出，再试一次。',
});
export const FILE_MAX = 3 * 1024 * 1024, PACK_MAX = 240000, NOTES_MAX = 20000;
export const FORMAT_NAME = '课程格式说明.json';
const FORMAT_HEAD = '雅思工作台课程包格式';

/* ───────────────────────────── the page's tables ───────────────────────────── */
// app/index.html TEACHER_TEMPLATES (随时找我: [title, the text to copy]); PROMPTS.writing / PROMPTS.speaking as they are there
export const TEACHER_TEMPLATES = Object.freeze([
  ['作文批改', '请你作为雅思考官，按官方写作评分标准批改我的作文（Task 1 的任务完成度或 Task 2 的任务回应、连贯与衔接、词汇、语法，四项各占 25%）：\n1. 四项各给一个整数分（1–9），再按四项的平均给出总分（以 0.5 分为一档）\n2. 逐句指出语法和用词错误，并给出改法\n3. 说明最影响分数的 2–3 个问题\n4. 在保留我原意的前提下，给一版修改后的作文\n请用中文讲解；所有英文句子（包括改正后的句子和修改后的作文）后面都用括号附上中文意思。\n\n题目：\n（粘贴题目）\n\n我的作文：\n（粘贴作文）'],
  ['口语陪练', '请你扮演雅思口语考官兼老师，和我做一次完整的模拟口试（Part 1、Part 2、Part 3）。我是新加坡华人，英语接近零基础，请照顾我的水平。\n规则：\n1. 按 Part 1、Part 2、Part 3 的顺序，每次只问一个问题，用简单的英语提问，问题后面用括号附上中文意思；等我回答后再问下一个。\n2. Part 2 给我一张完整的话题卡（题目和 3 到 4 个提示点，都附中文意思），提醒我准备 1 分钟、说 1 到 2 分钟。\n3. 我回答后，先用中文简短点评，最多 3 句：说得好的地方、一个最重要的语法或用词问题、一个更好的英文说法（后面用括号附上中文意思）；然后再问下一个问题。\n4. 我的回答是打字或语音转成的文字，你听不到我的发音，不要评价发音。\n5. 不要使用 Markdown 符号。\n6. 全部结束后（或者我说"请打分"时），不再提问，按流利与连贯、词汇、语法三项各给一个整数分（1–9），说明发音需要另外练，再给 3 条最需要改进的具体建议。\n现在请开始，问第一个问题。'],
  ['问一个问题', '老师好，我在学第 ___ 天的 ___ 时遇到一个问题：\n（把看不懂的句子或题目贴在这里）\n我的理解是：……\n请用简单的中文给我讲一下。'],
  ['今天学不动了', '老师，我今天有点学不下去了，原因是：……\n今天我还剩大约 ___ 小时。请帮我把今天的内容调整成我能完成的量。'],
].map(Object.freeze));
// app/index.html INITIAL_NOTES (老师笔记 before the teacher writes any)
export const INITIAL_NOTES = [
  '- 新加坡华人，英语接近零基础，从音标和最常用的词开始。',
  '- 发音目标：标准美音（她已选定），不要新加坡口音。听力英音、美音都要练。',
  '- 重点纠正的新加坡口音习惯：长短元音不分（ship/sheep、full/fool、cut/cart）；/e/ 和 /æ/ 不分；/eɪ/ 和 /oʊ/ 不滑动；th 读成 t 或 d；词尾辅音吞掉；词尾浊音读成清音；每个音节读得一样重（要练重音和弱读）；美音还要练卷舌的 r 和闪音 t。',
  '- 每天上午 9:30–11:30、下午 14:00–16:00 学习，傍晚 17:30–19:30 轻量复习。',
  '- 喜欢好用、有趣的安排，不想一次看到太多任务；学习材料要直接放进工作台。',
  '- 她要求：所有英语句子和单词都要配中文注释（以后的每一周课程也要照这个标准做）。',
  '- 每次更新工作台，都要同时给在线版和部署包。',
  '- 已约定的课程方式：第 7 天做入门小测、看周报校准水平；然后一次做好基础阶段（第 2 到第 6 周，美音发音线），每周按周报微调；第 7 周起的雅思题型阶段按阶段制作。',
].join('\n');
// app/index.html PAIR_ZH (the built-in 听辨 words' Chinese: packGlossGaps counts a pair word without one)
export const PAIR_ZH = Object.freeze({
  ship: '船', sheep: '羊', sit: '坐', seat: '座位', bed: '床', bad: '坏的', men: '男人们', man: '男人', cup: '杯子', cap: '帽子', cut: '切', cart: '手推车', hot: '热的',
  hut: '小屋', pot: '锅', port: '港口', full: '满的', fool: '傻瓜', pull: '拉', pool: '水池', bird: '鸟', work: '工作', walk: '走路', wait: '等待', white: '白色',
  boy: '男孩', buy: '买', thirteen: '十三', thirty: '三十', fifteen: '十五', fifty: '五十', coat: '外套', caught: '抓住（catch 的过去式）', here: '这里', hair: '头发',
  pen: '钢笔', Ben: '本（人名）', pie: '馅饼', tie: '领带', die: '死', town: '城镇', down: '向下', cab: '出租车', bat: '蝙蝠；球拍', goat: '山羊', fan: '风扇', van: '面包车',
  few: '很少', view: '风景', think: '想', sink: '水槽；下沉', three: '三', free: '免费的；空闲的', they: '他们', day: '天', sip: '小口喝', zip: '拉链', bus: '公交车',
  buzz: '嗡嗡声', see: '看见', she: '她', chip: '薯条；芯片', cheap: '便宜的', jeep: '吉普车', rice: '米饭', lice: '虱子', right: '对的；右边', light: '光；灯', try: '尝试',
  dry: '干的', hat: '帽子', at: '在', bets: '赌注（复数）', beds: '床（复数）', sun: '太阳', sung: '唱（sing 的过去分词）', thin: '瘦的；薄的', thing: '东西', win: '赢', wing: '翅膀',
  night: '夜晚', wet: '湿的', vet: '兽医', west: '西边', vest: '背心', yet: '还；然而', jet: '喷气式飞机', vine: '葡萄藤', wine: '葡萄酒', cot: '婴儿床', tin: '罐头；锡', tree: '树',
  den: '兽穴；小书房', then: '然后', price: '价格', prize: '奖品', car: '汽车', card: '卡片'
});
export const pairZh = (w, own) => own || PAIR_ZH[w] || '';

/* ───────────────────────────── reading ───────────────────────────── */
const steps = (d) => ['a', 'b', 'c'].reduce((all, s) => all.concat(d && Array.isArray(d[s]) ? d[s] : []), []);
const weekNum = (w) => Number(w.n) || Number(String(w.id).slice(1)) || 0;
const ymdCN = (s) => +s.slice(0, 4) + '年' + +s.slice(5, 7) + '月' + +s.slice(8, 10) + '日';

// notesText / notesMeta over her blob (o: { teacher })
export function notesText(o) {
  const n = isObj(o) && isObj(o.teacher) ? o.teacher.notes : null;
  return n && typeof n.text === 'string' && n.text.trim() ? n.text : INITIAL_NOTES;
}
export function notesMeta(o) {
  const n = isObj(o) && isObj(o.teacher) ? o.teacher.notes : null;
  return n && n.at && isYmd(n.at) ? '老师更新于 ' + ymdCN(n.at) : '第一版，写于开始学习时';
}
// packList(o, w1) → [{ id, title, builtin, days }]: the page's weeks() — her loadable packs, then the built-in week 1 (w1:
// content/w1.json's, the lesson page's W1), one per id (the first), by week number
export function packList(o, w1) {
  const P = isObj(o) && isObj(o.packs) ? o.packs : {}, list = [], seen = new Set(), out = [];
  Object.keys(P).forEach((id) => { const doc = P[id], w = doc && doc.week; if (w && !weekError(w)) list.push(w); });
  list.concat(w1 ? [w1] : []).forEach((w) => { if (!seen.has(w.id)) { seen.add(w.id); out.push(w); } });
  return out.sort((a, b) => weekNum(a) - weekNum(b)).map((x) => ({ id: x.id, title: x.title, builtin: x === w1, days: (x.days || []).length }));
}

/* ───────────────────────────── a pack from the teacher ───────────────────────────── */
// packError: weekError, then the stricter checks for a new pack (two days with one id, a day without n, two steps of a day with one id)
export function packError(w) {
  const err = weekError(w);
  if (err) return err;
  const dayIds = new Set();
  for (const d of w.days) {
    if (dayIds.has(d.id)) return '有两天的编号都是 ' + d.id;
    dayIds.add(d.id);
    if (!(Number(d.n) > 0)) return d.id + ' 缺少第几天（n）';
    const ids = new Set();
    for (const st of steps(d)) {
      if (ids.has(st.id)) return d.id + ' 里有两个步骤的编号都是 ' + st.id + '（同一天里的步骤编号不能重复）';
      ids.add(st.id);
    }
  }
  return '';
}
// readPack(text) → { ok: true, week, notes } | { ok: false, why, msg }   (importPackText up to the write, and packAdd's size)
export function readPack(text) {
  let o = null, first = null;
  const t = String(text || ''), tries = [];
  t.replace(/```[a-z]*\s*([\s\S]*?)```/gi, (m, x) => { tries.push(x); return m; });
  const i = t.indexOf('{'), j = t.lastIndexOf('}');
  if (i >= 0 && j > i) tries.push(t.slice(i, j + 1));
  for (const x of tries) {
    let v = null;
    try { v = JSON.parse(x); } catch (e) { v = null; }
    if (v && typeof v === 'object') { first = first || v; if (v.app === 'ielts-workbench-course') { o = v; break; } }
  }
  o = o || first;
  if (o && typeof o.note === 'string' && o.note.indexOf(FORMAT_HEAD) === 0) return { ok: false, why: 'format', msg: SAY.format };
  const w = o && o.app === 'ielts-workbench-course' ? o.week : null;
  const err = packError(w);
  if (err) return { ok: false, why: 'bad', msg: SAY.bad(err) };
  if (JSON.stringify(w).length > PACK_MAX) return { ok: false, why: 'big', msg: SAY.big };
  return { ok: true, week: w, notes: typeof o.notes === 'string' && o.notes.trim() ? String(o.notes).slice(0, NOTES_MAX) : null };
}
// glossGaps(w) → the Chinese (and American IPA) a pack left out, in the page's words (packGlossGaps)
export function glossGaps(w) {
  let us = 0, rd = 0, sp = 0, pr = 0;
  (w.days || []).forEach((d) => steps(d).forEach((st) => {
    if (st.type === 'words') (st.words || []).forEach((x) => { if (Array.isArray(x) && !(typeof x[3] === 'string' && x[3])) us++; });
    if (st.type === 'reading' && !(st.passage && st.passage.zh)) rd++;
    if (st.type === 'speak' && !(st.speak && st.speak.modelZh)) sp++;
    if (st.type === 'pairs') (st.pairs || []).forEach((p) => { if (Array.isArray(p)) [0, 1].forEach((j) => { if (!pairZh(p[j], p[j + 2])) pr++; }); });
  }));
  const out = [];
  if (us) out.push(us + ' 个单词没有美音音标');
  if (rd) out.push(rd + ' 篇阅读没有中文翻译');
  if (sp) out.push(sp + ' 个口语示范没有中文翻译');
  if (pr) out.push(pr + ' 个听辨词没有中文');
  return out;
}

/* ───────────────────────────── writing ───────────────────────────── */
// savePack(ls, week, notes, date) → { ok: true, changed } | { ok: false, reason: 'no-workbench' | 'empty' | 'save' }
//   packs[week.id] = { week, at: date } (packAdd); notes (a string) → teacher.notes = { text, at: date } (setNotes)
export function savePack(ls, week, notes, date) {
  if (!isObj(week) || typeof week.id !== 'string' || !week.id || !isYmd(date)) return { ok: false, reason: 'empty' };
  const b = readBlob(ls, { fresh: true });
  if (!b) return { ok: false, reason: 'no-workbench' };
  const packs = isObj(b.o.packs) ? b.o.packs : {}, teacher = isObj(b.o.teacher) ? b.o.teacher : {};
  const pack = { week, at: date }, note = typeof notes === 'string' ? { text: notes, at: date } : null;
  if (same(packs[week.id], pack) && (!note || same(teacher.notes, note))) return { ok: true, changed: false };
  const o = Object.assign({}, b.o, { packs: Object.assign({}, packs, { [week.id]: pack }) });
  if (note) o.teacher = Object.assign({}, teacher, { notes: note });
  try { ls.setItem(DATA_KEY, JSON.stringify(o)); } catch (e) { return { ok: false, reason: 'save' }; }
  invalidate();
  mirror(ls);
  return { ok: true, changed: true };
}
// importPack(ls, text, now) → { ok, msg, week?, changed?, why? }: the whole of importPackText, the toast it says included
export function importPack(ls, text, now) {
  const r = readPack(text);
  if (!r.ok) return r;
  const s = savePack(ls, r.week, r.notes, todayOf(ls, now));
  if (!s.ok) return { ok: false, why: s.reason, msg: s.reason === 'save' ? '没能保存：这台设备的存储空间可能满了。' : s.reason === 'no-workbench' ? '这里没有你的课本数据，没存上。' : '没能保存，再试一次。' };
  return { ok: true, changed: s.changed, week: r.week, notes: r.notes, msg: SAY.done(r.week.title, glossGaps(r.week)) };
}

// the way to the lesson page's own 老师 (when the book's page could not answer): it reopens the page she was on today
// (app/index.html boot: prefs.view while prefs.viewOn is today), so 老师 is put there the way its prefsSet does
export function classicAt(ls, view, now) {
  if (!ls || !present(ls)) return false;
  try { ls.setItem(PREF_KEY, JSON.stringify(Object.assign(readPrefs(ls) || {}, { view, viewOn: todayOf(ls, now) }))); return true; } catch (e) { return false; }
}
