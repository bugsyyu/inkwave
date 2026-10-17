// src/learn/design.js — the level design as data (docs/LEVELS.md): pure data + pure functions, no DOM, no three.js.
// Everything a level is beyond A's levels.js shapes lives here — which course step becomes which mechanic, the per-day
// tables (form, stage, time of day, gates with their spots and question counts), the learning props (INKWAVE subs /
// specials re-skinned), the bots' "answering" model, the right / wrong / streak effects, the boss (周考) plan, the
// 今日小考 and 自由练习 plans, the retry (夯实) rules, the unlock rules, the stars, and the syllabus map for the weeks
// beyond 3. Nothing here records evidence: flow.js asks, engine.js judges, store.js records (当天首答).
//
//   coverage(weeks)            → { rows, missing, classic, weeks }   every step of the loaded weeks and its mechanic
//   DAY_PLAN[w][d]             → { form, alt, stage, time, minutes, gates: [{ step, mechanic, ask, minutes, spot }], signs, extras }
//   planDay(week, d, form?)    → A's level (cloned) + { form, stage, time, minutes, rules, props, bots, gates[].design }
//   bossPlan(week)             → the week's 周考 as HULLBREAKER phases L 20 · R 20 · W 1 · S 1 (EXAM.md §2.3)
//   quizPlan(week, d, misses)  → 今日小考: 8 items, 50 / 30 / 20 (EXAM.md §2.2), played as one duel round
//   freePlan(week, opts)       → 自由练习 / 只练弱项 as a short race
//   estimateMinutes(step)      → the pace model's minutes for a step (checked against the course's own m in the tests)
//   stars(result)              → 1 · 2 · 3 stars for a day, never taken away
import { daySteps, dayOf } from './content.js';
import { puzzleLevel, raceLevel, duelLevel, bossLevel } from './levels.js';
import { store } from './store.js';
import { SUBS, SPECIALS, OFFLINE_MAPS, DIFFICULTY, TIMES, LEARN } from '../config.js';

// the numbers live in config.js LEARN (docs/LEARN.md §5, LEVELS.md §6.4 proposal 3); this file only shapes them
const N = LEARN;

export const FORMS = ['puzzle', 'race', 'duel', 'boss'];
// (题即玩法 PLAY §5.2, play-4: the race is 墨浪跑酷 — the id stays 'race')
export const FORM_ZH = { puzzle: '解密闯关', race: '墨浪跑酷', duel: '对抗赛', boss: 'Boss 战（周考）' };
// the stages a learning level may use: the offline ones (cargo is online-only, humans-only, never a boss stage)
export const STAGE_IDS = OFFLINE_MAPS.map((m) => m.id);

/* ───────────────────────────── mechanics: one per course step type ───────────────────────────── */
// renders: which INKWAVE system draws it · input: what she does · record: what store.recordFirst writes (当天首答)
// forms: the level forms the mechanic plays in (boss phases are L / R / W / S) · classic: what stays on the classic page
export const MECHANICS = {
  'symbol-door':     { zh: '音标门', kind: 'pron', input: 'choice', renders: 'hud-learn choice + 展板 (ipa, 口型 tip, 例词 tts)', record: 'L', forms: ['puzzle', 'race', 'duel', 'boss:L'], batch: 4 },
  'word-board':      { zh: '单词展板 + 单词门', kind: 'choice', input: 'choice', renders: '展板 (en, ipa, zh, tts) × batch → 多锁门', record: 'L', forms: ['puzzle', 'race', 'duel', 'boss:R'], batch: 5 },
  'grammar-board':   { zh: '讲解板 + 语法门', kind: 'choice', input: 'choice', renders: '讲解板 (lesson 行) → 多锁门 (quiz)', record: 'L', forms: ['puzzle', 'race', 'duel', 'boss:R'], batch: 0 },
  'pron-quiz':       { zh: '发音小测门（弱读 / 连读 / 重音）', kind: 'pron', input: 'choice', renders: '讲解板 → 多锁门 (原题原选项)', record: 'L', forms: ['puzzle', 'race', 'duel', 'boss:L'], batch: 0 },
  'dictation-pool':  { zh: '听写池', kind: 'dictation', input: 'type', renders: '墨池：每句一圈涟漪，tts 两遍，打字', record: 'L (pct)', forms: ['puzzle', 'race', 'duel', 'boss:L'], batch: 1 },
  'review-dictation': { zh: '开场抽查池', kind: 'dictation', input: 'type', renders: '同听写池，词和句都打；排在当天第一道门', record: 'L (pct) / T', forms: ['puzzle', 'race', 'duel', 'boss:L'], batch: 1 },
  'reading-room':    { zh: '阅览室', kind: 'listen', input: 'choice', renders: '大展板 (passage + gloss，整篇 tts 一次) → 3 锁门', record: 'L', forms: ['puzzle', 'race', 'duel', 'boss:R'], batch: 0 },
  'pair-fork':       { zh: '听辨岔路', kind: 'listen', input: 'choice', renders: '走廊分成两扇门，各写一个词；放一个，走对的那扇', record: 'L', forms: ['puzzle', 'race', 'duel', 'boss:L'], batch: 1 },
  'flash-type':      { zh: '卡片打字门', kind: 'dictation', input: 'type', renders: '卡片 (zh + ipa 提示) + tts → 打字', record: 'T / H / S', forms: ['puzzle', 'race', 'duel', 'boss:R'], batch: 5 },
  'flash-flip':      { zh: '快闪翻牌（复习日 150 张）', kind: 'dictation', input: 'type', renders: '翻牌：看中文想英文 → 翻面 → 认识 / 不熟；不熟的当场打字', record: 'F（自评，见 §6 提案）/ T', forms: ['race', 'puzzle', 'duel'], batch: 10 },
  'write-wall':      { zh: '写字墙', kind: 'lesson', input: 'write', renders: '出口区的墙：中文一句，写英文；判 WT 关键形式', record: 'W / S', forms: ['puzzle', 'race', 'duel', 'boss:W'], batch: 0 },
  'echo-booth':      { zh: '回声亭', kind: 'lesson', input: 'read', renders: '亭子里：问题 + 范例 (zh) + 句型 + tip；tts 读范例，她跟着说', record: '不计分（评分等语音服务器）', forms: ['puzzle', 'race', 'duel', 'boss:S'], batch: 0, classic: '口语评分：要语音服务器（第二阶段）；亭子本身可玩' },
  'checkin-pad':     { zh: '打卡垫', kind: 'lesson', input: 'read', renders: '出口的垫子：踩上去 = 今天走完；老师的话在牌上', record: '不计分（走完记在本机星表）', forms: ['puzzle', 'race', 'duel'], batch: 0, classic: '打卡的心情和备注是宿主的表单，先走经典页' },
  'weekly-sign':     { zh: '周报牌', kind: 'lesson', input: 'read', renders: '复习日终点的牌：包里的 summary；「复制周报」开经典页', record: '不计分', forms: ['race', 'puzzle', 'duel'], batch: 0, classic: '周报由宿主的 weekReport 从她的数据生成，游戏只展示 summary' },
  'placement-sign':  { zh: '入门小测牌', kind: 'lesson', input: 'read', renders: '复习日终点的牌：开经典页做 45 分钟的入门小测', record: '不计分', forms: ['race', 'puzzle', 'duel'], batch: 0, classic: '课程包里没有它的题；它是宿主帮老师校准难度的自评表' },
};
// 题即玩法 (docs/PLAY.md §4): the mechanic every item plays as, per form — answer: what a game action hands the one judging
// path (an option index · a typed string · her own rating · nothing); record: what store.recordFirst then writes (the
// evidence modes are the host's, vendor/ielts/model.js MODES — never a new one); reuse: INKWAVE's own pieces it is built of
export const PLAY = {
  'ink-target':   { zh: '墨靶', answer: 'index', record: 'L', reuse: 'weapons.js Projectiles · boss.js segHit · fx.explosion · paint.flood' },
  'lane-curtain': { zh: '墨幕车道', answer: 'index', record: 'L', reuse: 'curtain · swim / jump / dive · paint' },
  'beat-pads':    { zh: '节拍台', answer: 'index', record: 'L', reuse: 'decor spawn pads · music.js beat · character trigger / setDance' },
  'type-shot':    { zh: '字弹', answer: 'text', record: 'T / H / S · L (pct) · W / S', reuse: 'special-props buildCrab · character-mats · fx · paint' },
  'weak-point':   { zh: '弱点', answer: 'index', record: 'L', reuse: 'boss.js weak points · G.boss.splash' },
  'board-walk':   { zh: '展板路', answer: 'none', record: '—', reuse: 'CanvasTexture boards · cameraRig spring' },
  'echo-booth':   { zh: '回声亭', answer: 'none', record: '—', reuse: 'decor pad · a board' },
  'flip-target':  { zh: '翻牌靶', answer: 'self', record: 'F', reuse: 'ink targets · a CanvasTexture card' },
  'signs':        { zh: '路标', answer: 'none', record: '—', reuse: 'decor pad · a board' },
};
// the mechanic an item plays as in a form (PLAY §4's table; mechanic: the step's, for the review day's flash-flip cards).
// form: puzzle · race (墨浪跑酷) · duel · quiz (one duel round) · boss · versus2 · coop2 (the answering side's: the clue
// side holds the board). play-8: there is no 'card' — every item of every form has one of PLAY's mechanics; the
// review day's flash words are flip cards where the form asks them so (the puzzle, the duel) and typed where it types
// them (the runner's 滑行段, the two-player forms ask the engine's own prompt — tests/learn/design.test.mjs)
export function playOf(item, form = 'puzzle', mechanic = null) {
  const m = (item && item.meta) || {}, kind = m.kind, input = m.input;
  if (mechanic === 'flash-flip' && input === 'type') return form === 'puzzle' || form === 'duel' ? 'flip-target' : 'type-shot';
  if (form === 'quiz' || form === 'versus2') form = 'duel';   // (the quiz is a duel round; versus2 the duel's cluster on two screens)
  if (form === 'coop2') return input === 'choice' ? 'ink-target' : input === 'type' || input === 'write' ? 'type-shot' : kind === 'speak' ? 'echo-booth' : kind === 'lesson' ? (m.type === 'checkin' || m.type === 'weekly' || m.type === 'placement' ? 'signs' : 'board-walk') : null;
  if (form === 'boss') return input === 'read' ? (kind === 'speak' ? 'echo-booth' : 'signs') : input === 'type' || input === 'write' ? 'type-shot' : 'weak-point';   // (W: M4 on the armour plates; the answer is still a string)
  if (input === 'choice') {
    if (kind === 'sym' || kind === 'pair') return form === 'puzzle' || form === 'race' ? 'beat-pads' : 'ink-target';
    if (kind === 'word' || kind === 'quiz' || kind === 'read') return form === 'race' ? 'lane-curtain' : 'ink-target';
    return 'ink-target';
  }
  if (input === 'type' || input === 'write') return 'type-shot';
  if (kind === 'speak') return 'echo-booth';
  if (kind === 'lesson') return m.type === 'checkin' || m.type === 'weekly' || m.type === 'placement' ? 'signs' : 'board-walk';
  return null;
}

export const CLASSIC = Object.fromEntries(Object.entries(MECHANICS).filter(([, m]) => m.classic).map(([id, m]) => [id, m.classic]));

// course step (pack type + k + flags) → mechanic id
export function mechanicOf(step) {
  const m = step.meta || {}, type = m.type, k = m.k;
  switch (type) {
    case 'symbols': case 'symreview': return 'symbol-door';
    case 'words': return 'word-board';
    case 'grammar': return k === 'pron' ? 'pron-quiz' : 'grammar-board';
    case 'dictation': return k === 'review' ? 'review-dictation' : 'dictation-pool';
    case 'reading': return 'reading-room';
    case 'pairs': return 'pair-fork';
    case 'flash': return step.items.length > 60 ? 'flash-flip' : 'flash-type';
    case 'write': return 'write-wall';
    case 'speak': return 'echo-booth';
    case 'checkin': return 'checkin-pad';
    case 'weekly': return 'weekly-sign';
    case 'placement': return 'placement-sign';
    default: return null;
  }
}

// the exam centre's forms (EXAM.md §1–2) → where they live in the game
export const EXAM_MECHANICS = {
  quiz:  { zh: '今日小考', form: 'duel', n: N.quiz.n, minutes: N.quiz.minutes, when: '第 1–6 天出口后的傍晚；复习日和周考的日子不出', shares: { due: 0.5, miss: 0.3, fresh: 0.2 }, record: '照门的方式；当天首答' },
  boss:  { zh: '周考', form: 'boss', n: { L: 20, R: 20, W: 1, S: 1 }, minutes: { L: N.boss.phaseTime.L / 60, R: N.boss.phaseTime.R / 60, W: N.boss.phaseTime.W / 60, S: N.boss.phaseTime.S / 60 }, when: '复习日之后第二天起开放，一天一段，10 天窗口', shares: { weak: 0.3, due: 0.3, fresh: 0.4 } },
  month: { zh: '满月月考', form: 'boss', when: '第 4、8、12、16 周的周考；同样长，结尾在满月下（舞台 dusk + 四周对比成绩单 = 经典页）' },
  free:  { zh: '自由练习 / 只练弱项', form: 'race', n: [5, 10, 15], when: '她自己点；从不推荐到今天里', shares: { weakOnly: 1 } },
};

/* ───────────────────────────── stages: a route of named spots per stage ───────────────────────────── */
// Spots are layout tags (src/world/stages/<id>/layout.js, src/world/maps.js), in order along the route Alpha spawn →
// mid → Bravo spawn. side: 'ours' (Alpha's half), 'mid', 'theirs' (the 180° mirror on Bravo's half). flow.js resolves a
// spot to the nav node nearest the tagged box on that side; `at` (0..1 along the A* route) is the fallback.
const S = (tag, zh, side = 'ours') => ({ tag, zh, side });
export const SPOTS = {
  tidewater: [S('loggia', '市政厅凉廊（出发）'), S('wing-steps', '侧翼石阶'), S('promenade', '海滨步道'), S('shelter-screen', '玻璃候亭'), S('icecream-kiosk', '冰淇淋亭'), S('square-fountain', '喷泉'), S('bandstand', '演奏台'), S('terrace-dais', '禧年圆台 · 钟楼', 'mid'), S('pier-forecourt', '码头前庭', 'theirs'), S('colonnade-walk', '柱廊', 'theirs'), S('crescent-shops', '新月商铺', 'theirs'), S('loggia', '海关大楼凉廊（出口）', 'theirs')],
  kelpline:  [S('spawn-deck', '调度楼屋顶（出发）'), S('ops-stair', '钢梯'), S('lane', '卡车道'), S('block-4a', '4A 堆场'), S('apron', '岸壁'), S('hatch-lower', '舱盖'), S('landing', '龙门吊下的作业区', 'mid'), S('hatch-upper', '高舱盖', 'theirs'), S('block-reefer', '冷藏箱架', 'theirs'), S('reefer-catwalk', '冷藏架天桥', 'theirs'), S('lane', '对面卡车道', 'theirs'), S('spawn-deck', '对面调度楼（出口）', 'theirs')],
  halyard:   [S('spawn-terrace', '会所露台（出发）'), S('grand-stair', '大台阶'), S('fuel-dock', '油站码头'), S('fuel-hut', '油站小屋'), S('boardwalk', '木板道'), S('houseboat-hull', '船屋 SEA SHANTY'), S('gangway', '舷梯'), S('ferry-deck', '渡轮甲板', 'mid'), S('ferry-cabin', '渡轮顶甲板', 'mid'), S('ferry-plank', '跳板', 'theirs'), S('yard', '船坞', 'theirs'), S('tug-ramp', '拖船坡道', 'theirs'), S('spawn-terrace', '对面会所（出口）', 'theirs')],
  saltpan:   [S('gallery-deck', '盐仓装货廊（出发）'), S('gallery-stair', '木梯'), S('yard', '轨道场'), S('dock', '包装棚装货台'), S('shed-landing', '棚前平台'), S('boardwalk', '木栈道'), S('front-pan', '前盐田'), S('pump-staging', '风车台', 'mid'), S('great-pan', '大盐田', 'mid'), S('mid-dyke', '中堤', 'theirs'), S('heap', '盐堆', 'theirs'), S('conveyor-stage', '传送带台', 'theirs'), S('gallery-deck', '对面盐仓（出口）', 'theirs')],
  crossmarket: [S('spawn-terrace', '交易所露台（出发）'), S('grand-stair', '大台阶'), S('streets', '市场街'), S('court-stair', '鱼市小院铁梯'), S('arcade-floor', '鱼市拱廊'), S('tram-platform', '电车站台'), S('hall-floor', '市场大厅 · 3 路电车', 'mid'), S('tramway', '电车道', 'theirs'), S('parade', '滨海步道', 'theirs'), S('terrace-stair', '咖啡馆露台梯', 'theirs'), S('spawn-terrace', '对面交易所（出口）', 'theirs')],
  lockgate:  [S('spawn-stage', '码头装货台（出发）'), S('grand-stair', '大台阶'), S('yard', '后院'), S('cottage', '守闸人小屋'), S('horse-ramp', '马道'), S('gate-walk-lower', '西闸下闸门走道'), S('towpath', '纤道'), S('bridge-crest', '驼背桥顶', 'mid'), S('towpath', '对岸纤道', 'theirs'), S('loading-bank', '转运棚装货台', 'theirs'), S('wharf-e', '东闸码头', 'theirs'), S('spawn-stage', '对面码头（出口）', 'theirs')],
  terraces:  [S('belvedere', '柠檬别墅观景台（出发）'), S('scalinata', '大阶梯'), S('largo-sun', '喷泉小广场'), S('vicolo-flight-1', '小巷第一段'), S('caffe', '咖啡馆'), S('piazza', '小广场'), S('sagrato', '圣维托教堂前庭', 'mid'), S('salita-flight', '对面上坡台阶', 'theirs'), S('incline-stair', '缆车梯', 'theirs'), S('case-sul-mare', '海边人家', 'theirs'), S('belvedere', '对面观景台（出口）', 'theirs')],
};

/* ───────────────────────────── the per-day tables (docs/LEVELS.md §3) ───────────────────────────── */
// Per day: form (the recommended outing), alt (the other solo / bot forms it can be played as), stage, time of day,
// gates in the course's step order (minutes = the course's own m: no task piling), signs (lesson steps), extras.
// Stage by the day's theme (w1d2 市场 → crossmarket, w2d1 交通 → the tram, w3d4 旅行 → the ferry …), every stage once
// a week; w1 by day, w2 at dusk, w3 alternating. Review days: a full lap (race) — terraces (the climb), kelpline (the
// crane), lockgate (出关).
const DAYS = {
  w1: [null,
    { form: 'puzzle', stage: 'tidewater', time: 'day' },
    { form: 'puzzle', stage: 'crossmarket', time: 'day' },
    { form: 'race', stage: 'halyard', time: 'day' },
    { form: 'puzzle', stage: 'lockgate', time: 'day' },
    { form: 'race', stage: 'saltpan', time: 'day' },
    { form: 'duel', stage: 'kelpline', time: 'day' },
    { form: 'race', stage: 'terraces', time: 'day', review: true }],
  w2: [null,
    { form: 'puzzle', stage: 'crossmarket', time: 'dusk' },
    { form: 'race', stage: 'tidewater', time: 'dusk' },
    { form: 'puzzle', stage: 'terraces', time: 'dusk' },
    { form: 'duel', stage: 'saltpan', time: 'dusk' },
    { form: 'race', stage: 'lockgate', time: 'dusk' },
    { form: 'puzzle', stage: 'halyard', time: 'dusk' },
    { form: 'race', stage: 'kelpline', time: 'dusk', review: true }],
  w3: [null,
    { form: 'puzzle', stage: 'crossmarket', time: 'day' },
    { form: 'duel', stage: 'saltpan', time: 'dusk' },
    { form: 'race', stage: 'terraces', time: 'day' },
    { form: 'puzzle', stage: 'halyard', time: 'dusk' },
    { form: 'race', stage: 'tidewater', time: 'day' },
    { form: 'duel', stage: 'kelpline', time: 'dusk' },
    { form: 'race', stage: 'lockgate', time: 'day', review: true }],
};
// the boss (周考) arena per week: a plaza-like stage at dusk, never the review day's stage
export const BOSS_STAGE = { w1: { stage: 'tidewater', time: 'dusk' }, w2: { stage: 'saltpan', time: 'dusk' }, w3: { stage: 'terraces', time: 'dusk' } };

// a step row of the course as the per-day table knows it: [stepId suffix, pack type, k, minutes, items]
// (the standard day shapes; w1d7 / w2d7 / w3d7 are listed in full)
const W1_DAY = [['a1', 'symbols', 'pron', 35, 8], ['a2', 'words', 'vocab', 40, 25], ['a3', 'grammar', 'grammar', 25, 6], ['b1', 'dictation', 'listening', 25, 5], ['b2', 'reading', 'reading', 35, 3], ['b3', 'pairs', 'pron', 15, 8], ['b4', 'flash', 'vocab', 15, 25], ['c1', 'write', 'writing', 15, 5], ['c2', 'speak', 'speaking', 15, 1], ['c3', 'checkin', 'review', 5, 1]];
const W23_DAY = [['a1', 'dictation', 'review', 10, 6], ['a2', 'grammar', 'pron', 25, 5], ['a3', 'words', 'vocab', 40, 25], ['a4', 'grammar', 'grammar', 25, 6], ['b1', 'dictation', 'listening', 25, 6], ['b2', 'reading', 'reading', 30, 3], ['b3', 'pairs', 'pron', 15, 8], ['b4', 'flash', 'vocab', 20, 25], ['c1', 'write', 'writing', 15, 5], ['c2', 'speak', 'speaking', 15, 1], ['c3', 'checkin', 'review', 5, 1]];
const W1_D7 = [['a1', 'symreview', 'pron', 40, 48], ['a2', 'pairs', 'pron', 15, 10], ['a3', 'flash', 'vocab', 40, 150], ['b1', 'grammar', 'grammar', 20, 10], ['b2', 'placement', 'review', 45, 1], ['b3', 'weekly', 'review', 20, 1], ['c1', 'speak', 'speaking', 15, 1]];
const W23_D7 = [['a1', 'dictation', 'review', 15, 8], ['a2', 'grammar', 'pron', 20, 8], ['a3', 'pairs', 'pron', 15, 10], ['a4', 'flash', 'vocab', 40, 150], ['b1', 'grammar', 'grammar', 20, 10], ['b2', 'dictation', 'listening', 20, 8], ['b3', 'reading', 'reading', 25, 3], ['b4', 'weekly', 'review', 20, 1], ['c1', 'write', 'writing', 15, 6], ['c2', 'speak', 'speaking', 15, 1], ['c3', 'checkin', 'review', 5, 1]];
const ROWS = { w1: (d) => (d === 7 ? W1_D7 : W1_DAY), w2: (d) => (d === 7 ? W23_D7 : W23_DAY), w3: (d) => (d === 7 ? W23_D7 : W23_DAY) };
const LESSON_TYPES = new Set(['write', 'speak', 'checkin', 'weekly', 'placement']);

function rowMechanic(type, k, items) {
  return mechanicOf({ meta: { type, k }, items: new Array(items) });
}

function buildDay(w, d) {
  const D = DAYS[w][d], rows = ROWS[w](d), spots = SPOTS[D.stage];
  const gates = [], signs = [];
  const asking = rows.filter(([, type]) => !LESSON_TYPES.has(type));
  asking.forEach(([id, type, k, m, n], i) => {
    const mech = rowMechanic(type, k, n);
    // spots: the route from the second spot (the first is the spawn) to the last-but-one; the exit zone keeps the end
    const at = (i + 1) / (asking.length + 1);
    const spot = spots[Math.max(1, Math.min(spots.length - 2, Math.round(at * (spots.length - 1))))];
    gates.push({ step: w + 'd' + d + ':' + id, type, k, mechanic: mech, ask: n, batch: MECHANICS[mech].batch, minutes: m, at: +at.toFixed(3), spot });
  });
  rows.filter(([, type]) => LESSON_TYPES.has(type)).forEach(([id, type, k, m, n]) => {
    const mech = rowMechanic(type, k, n);
    signs.push({ step: w + 'd' + d + ':' + id, type, k, mechanic: mech, ask: type === 'write' ? n : 0, minutes: m, at: 0.95, spot: spots[spots.length - 1], classic: CLASSIC[mech] || null });
  });
  const minutes = rows.reduce((a, r) => a + r[3], 0);
  const alt = FORMS.filter((f) => f !== 'boss' && f !== D.form);
  const extras = D.review ? { quiz: null, note: '复习日：不出今日小考；明天起周考（Boss）一天一段' } : { quiz: { ...EXAM_MECHANICS.quiz, items: '由 quizPlan(week, d, misses) 选' } };
  return { form: D.form, alt, stage: D.stage, time: D.time, review: !!D.review, route: D.form === 'race' ? 'loop' : D.form === 'duel' ? 'zones' : 'through', minutes, gates, signs, extras };
}

export const DAY_PLAN = {};
for (const w of ['w1', 'w2', 'w3']) { DAY_PLAN[w] = [null]; for (let d = 1; d <= 7; d++) DAY_PLAN[w][d] = buildDay(w, d); }

// a week the tables do not know (the 4th on): the same rules on the loaded course — form by d % 3 (puzzle → race →
// duel), the review day a race, every stage once a week ((n × 7 + d) % 7), day / dusk by the week's parity; the pack's
// own steps give the gates, so a new course pack has a table the moment it is imported (docs/LEVELS.md §6.2)
export function dayPlanFor(week, d) {
  if (DAY_PLAN[week.id] && DAY_PLAN[week.id][d]) return DAY_PLAN[week.id][d];
  const n = Number(week.n) || 0, steps = daySteps(week, d);
  if (!steps.length) return null;
  const review = d === 7 || steps.some((s) => s.meta.type === 'weekly');
  const form = review ? 'race' : ['puzzle', 'race', 'duel'][(d - 1) % 3];
  const stage = STAGE_IDS[(n * 7 + d) % STAGE_IDS.length], time = n % 2 ? 'day' : 'dusk', spots = SPOTS[stage];
  const gates = [], signs = [], asking = steps.filter((s) => s.kind !== 'lesson');
  asking.forEach((s, i) => {
    const mech = mechanicOf(s), at = (i + 1) / (asking.length + 1);
    gates.push({ step: s.id, type: s.meta.type, k: s.meta.k, mechanic: mech, ask: s.items.length, batch: MECHANICS[mech].batch, minutes: s.minutes, at: +at.toFixed(3), spot: spots[Math.max(1, Math.min(spots.length - 2, Math.round(at * (spots.length - 1))))] });
  });
  steps.filter((s) => s.kind === 'lesson').forEach((s) => {
    const mech = mechanicOf(s);
    signs.push({ step: s.id, type: s.meta.type, k: s.meta.k, mechanic: mech, ask: s.meta.type === 'write' ? s.items.length : 0, minutes: s.minutes, at: 0.95, spot: spots[spots.length - 1], classic: CLASSIC[mech] || null });
  });
  const extras = review ? { quiz: null, note: '复习日：不出今日小考；明天起周考（Boss）一天一段' } : { quiz: { ...EXAM_MECHANICS.quiz, items: '由 quizPlan(week, d, misses) 选' } };
  return { form, alt: FORMS.filter((f) => f !== 'boss' && f !== form), stage, time, review, route: form === 'race' ? 'loop' : form === 'duel' ? 'zones' : 'through', minutes: steps.reduce((a, s) => a + s.minutes, 0), gates, signs, extras, generated: true };
}

/* ───────────────────────────── props (道具): INKWAVE subs / specials as learning props ───────────────────────────── */
// from: the INKWAVE thing whose prop / effect / sound is reused (the engine's own, nothing new). when: how it is earned.
// evidence: what using it does to the record ('H' = the answer counts as hinted, store mode H; 'none' = nothing).
export const PROPS = {
  leap:    { id: 'leap', zh: '超级跳', from: { sub: 'beacon' }, when: 'right', effect: 'skip', desc: '下一道检查点自动算到（题照出，不跳题）：超级跳到它跟前，省一段路', evidence: 'none', sfx: 'super_jump' },
  rain:    { id: 'rain', zh: '墨雨', from: { special: 'storm' }, when: 'right', effect: 'hint', desc: '下一题先下一场雨：显示中文 / 音标提示', evidence: 'H', sfx: 'storm_rain' },
  echo:    { id: 'echo', zh: '回声', from: { special: 'sonar' }, when: 'right', effect: 'replay', desc: '下一题多听一遍慢速（不算提示：真考也能听两遍）', evidence: 'none', sfx: 'special_activate' },
  shield:  { id: 'shield', zh: '护盾', from: { special: 'bubbler' }, when: 'streak3', effect: 'no-detour', desc: '下一次答错不绕路（证据照记错）', evidence: 'none', sfx: 'special_ready' },
  curtain: { id: 'curtain', zh: '墨幕', from: { sub: 'curtain' }, when: 'right', effect: 'block-bots', desc: '身后落一道墨幕：机器人被挡 3 秒', evidence: 'none', sfx: 'bomb_throw' },
  bomb:    { id: 'bomb', zh: '墨弹', from: { sub: 'bomb' }, when: 'right', effect: 'stun-bot', desc: '丢向最近的机器人：它停 3 秒', evidence: 'none', sfx: 'bomb_explode' },
  lane:    { id: 'lane', zh: '墨道', from: { special: 'slam' }, when: 'streak5', effect: 'flood-lane', desc: '一记泼墨：到下一检查点的路全是自己的墨，游过去（11.8 m/s 对 6 m/s）', evidence: 'none', sfx: 'special_slam' },
};
// which props a form hands out, and how a right answer picks one
export const PROPS_OF = {
  puzzle: ['rain', 'echo'],                          // no race: props only help the question
  race: ['leap', 'rain', 'echo', 'shield', 'curtain', 'bomb', 'lane'],
  duel: ['rain', 'echo', 'shield'],                  // ink is the reward in a duel; props only help the question
  boss: ['rain', 'echo'],
};
// drops: every `everyRight`-th right answer drops one prop drawn by `weights` (streak props never drop: they are
// earned by the streak); `hold` = how many she can carry. No prop ever skips a question.
export const PROP_DROP = N.props;   // (config.js LEARN.props)

/* ───────────────────────────── bots' "answering" model ───────────────────────────── */
// Bots never see her question. At each checkpoint / each cadence tick a bot rolls a die: correct with probability
// `correct`, after a delay in `delay` seconds (uniform); a wrong roll costs it the same detour she would take.
// rubber: seconds added to a bot's delay per checkpoint it is ahead of her (capped at `rubberCap` checkpoints) — a
// gentle band, stated in the settings. duelCadence: seconds between two enemy "answers" in a duel round; duelFlood:
// metres of zone a right one inks. propUse: the chance a bot uses a prop it earned.
const BOT_ZH = { easy: '轻松', normal: '正常', hard: '激烈' };
export const BOT_ANSWER = Object.fromEntries(Object.keys(DIFFICULTY).map((id) => [id, { id, zh: BOT_ZH[id] || id, ...N.bots[id] }]));   // (config.js LEARN.bots)
export const BOTS_OF = {
  puzzle: { count: 0 },
  race: { count: N.race.bots, teams: 1, model: 'BOT_ANSWER' },
  duel: { count: N.duel.allies + N.duel.enemies, teams: 2, allies: N.duel.allies, enemies: N.duel.enemies, model: 'BOT_ANSWER', alliesAnswer: false },
  boss: { count: N.boss.squad, teams: 1, model: null, note: 'squad bots fight the boss as in Boss Battle; only she answers' },
};

/* ───────────────────────────── effects: what a right / wrong / streak does, per form ───────────────────────────── */
// sfx: docs/CONTRACTS.md §2 names only · trigger / dance: character.js one-shots and loops · banner: hud.banner kinds
// flood: metres of her ink poured (PaintSystem.flood, like a zone capture) · glow: the gate's colour
export const EFFECTS = {
  puzzle: {
    right:   { sfx: 'splat_big', fx: 'explosion', trigger: 'jump', flood: 2.5, feed: '答对了', why: true },
    wrong:   { sfx: 'ui_back', glow: 'coral', feed: '差一点', why: true, retry: 'rephrase' },
    wrong2:  { sfx: 'ui_toggle', glow: 'coral', showAnswer: true, open: true, relearn: true },
    streak3: { sfx: 'special_ready', special: 1 },
    streak5: { sfx: 'level_up', dance: 'victory', danceFor: 1.5, banner: ['custom', '连对 5 题！'] },
    gate:    { sfx: 'refill_full', fx: 'ring', flood: 'corridor' },
    done:    { sfx: 'victory_fanfare', dance: 'victory', music: 'results_win', judge: true },
  },
  race: {
    start:   { sfx: ['ready', 'go_horn'], banner: ['ready', '准备'] },
    right:   { sfx: 'splat_big', fx: 'explosion', trigger: 'jump', prop: 'draw', feed: '答对了' },
    wrong:   { sfx: 'ui_back', glow: 'coral', detour: N.race.detour, why: true, retry: 'rephrase' },
    wrong2:  { sfx: 'ui_toggle', showAnswer: true, open: true, relearn: true },
    streak3: { sfx: 'special_ready', prop: 'shield' },
    streak5: { sfx: 'special_activate', prop: 'lane', banner: ['special', '墨道！'] },
    propUse: { sfx: 'special_activate', trigger: 'throw' },
    leap:    { sfx: 'super_jump', trigger: 'special_leap' },
    finish:  { sfx: 'victory_fanfare', dance: 'victory', music: 'results_win' },
    botFinish: { sfx: 'xp_tick', feed: '机器人先到了，没关系' },
  },
  duel: {
    start:   { sfx: ['ready', 'go_horn'], banner: ['go', '开始'] },
    right:   { sfx: 'splat_big', fx: 'explosion', trigger: 'shoot', flood: N.duel.flood[0], floodPerStreak: N.duel.flood[1], floodMax: N.duel.flood[2], special: N.duel.special, feed: '答对了' },
    wrong:   { sfx: 'ui_back', glow: 'coral', why: true, retry: 'rephrase' },
    wrong2:  { sfx: 'ui_toggle', showAnswer: true, relearn: true },
    streak3: { sfx: 'special_ready', special: 100 },
    streak5: { sfx: 'level_up', dance: 'victory', danceFor: 1.0 },
    round:   { sfx: ['times_up', 'judge_drumroll', 'judge_reveal'], judge: true },
    note: 'zone captures, warnings and the countdown play zones.js\'s own cues; nothing here duplicates them',
  },
  boss: {
    right:   { sfx: 'hit_marker', trigger: 'shoot', hit: 'weak', damage: 'phaseHp / n', feed: '命中弱点' },
    wrong:   { sfx: 'ui_back', why: true, bossMove: true, retry: 'rephrase' },
    wrong2:  { sfx: 'ui_toggle', showAnswer: true, relearn: true },
    streak3: { sfx: 'special_ready', special: 100 },
    streak5: { sfx: 'level_up', banner: ['custom', '连对 5 题！'], stun: true },
    phase:   { sfx: 'victory_fanfare', banner: ['custom', '这一段考完了'] },
    defeat:  { sfx: 'victory_fanfare', dance: 'victory', music: 'results_win' },
    note: 'the boss\'s own roars, telegraphs and hits are bossAudio.js\'s; its phases / stuns are docs/BOSS.md\'s',
  },
};
// the reduced-motion variants (settings.cameraShake = 0 / prefers-reduced-motion)
export const REDUCED = { flood: 'instant', dance: null, camera: 'hold', banner: 'static', shake: 0, fx: 'ring-only' };

// every SFX name design.js uses (tests check them against docs/CONTRACTS.md §2)
export const SFX = [...new Set([
  ...Object.values(PROPS).map((p) => p.sfx),
  ...Object.values(EFFECTS).flatMap((f) => Object.values(f).flatMap((e) => (e && typeof e === 'object' && e.sfx ? [].concat(e.sfx) : []))),
])];
export const TRIGGERS = [...new Set(Object.values(EFFECTS).flatMap((f) => Object.values(f).map((e) => e && typeof e === 'object' ? e.trigger : null)).filter(Boolean))];
export const DANCES = [...new Set(Object.values(EFFECTS).flatMap((f) => Object.values(f).map((e) => e && typeof e === 'object' ? e.dance : null)).filter(Boolean))];
export const BANNERS = [...new Set(Object.values(EFFECTS).flatMap((f) => Object.values(f).map((e) => e && typeof e === 'object' && e.banner ? e.banner[0] : null)).filter(Boolean))];

/* ───────────────────────────── rules per form ───────────────────────────── */
export const RULES = {
  puzzle: {
    zh: '解密闯关', enemies: false, clock: false, route: 'through',
    gate: { trigger: N.gate.trigger, opensOn: 'right', wrongOpensAfter: 2, lockAll: true },
    place: { path: 'A* spawn→spawn on G.nav', snap: 'nearest nav node to the spot tag, else at × route length', wet: 0, spawnZone: false, spacing: 10, width: 3 },
    freeze: true,          // the world holds still while she answers (DESIGN: 做题时画面不动)
    walk: 'stick or auto-walk (tap the next gate on the map)',
  },
  race: {
    zh: '道具赛', enemies: false, clock: true, route: 'loop', bots: N.race.bots,
    checkpoint: { trigger: N.gate.trigger, question: 1, detour: N.race.detour, props: true },
    place: { path: 'A* spawn→far spawn, back by the other lane', snap: 'same as puzzle', wet: 0, spacing: 12 },
    freeze: 'her only (bots keep running; their delay is the fairness)',
    rubber: 'BOT_ANSWER.rubber',
    due: 'store.due(week) first (A\'s raceLevel)',
  },
  duel: {
    zh: '对抗赛', enemies: true, clock: true, route: 'zones', teams: 2, mode: 'zones', build: 'zones (onlyIn: zones geometry)',
    round: { perGate: true, questions: 'the gate\'s items', endsOn: 'questions out or a knockout', time: 'gate minutes' },
    answer: { right: 'flood the neediest patch of the live zone (zonePlan need), + special', wrong: 'nothing lost', bots: 'BOT_ANSWER.duelCadence' },
    prep: 'between rounds: the lobby pose, billboards for the next step (learning happens here)',
  },
  boss: {
    zh: 'Boss 战（周考）', enemies: 'HULLBREAKER', clock: true, route: 'arena', mode: 'boss',
    phases: 'L → R → W → S = HP bands 100–66 · 66–33 · 33–10 · 10–0', perDay: 1, window: 10, opens: 'review day + 1',
    answer: { right: 'a weak-point hit worth phaseHp / n', wrong: 'the boss gets a move (phase-appropriate); she dodges; no HP of hers counts' },
    squad: 'she + ' + N.boss.squad + ' bots (bots fight it as in Boss Battle, only she answers)',
    time: 'config.js LEARN.boss.phaseTime per phase (EXAM: 14 / 14 / 10 / 6 min)', phaseTime: N.boss.phaseTime,
  },
};

// 夯实: a wrong first answer comes back — at once with help (not evidence: store returns first:false), and before the
// exit in another form (the 回炉门); tomorrow the memory model makes it due → first checkpoint of the race, and the
// course's own 开场抽查 (w2+) covers it as well.
export const RETRY = {
  immediate: { choice: 'reshuffle + show the Chinese gloss', type: 'show the hint (mode H if it were first)', listen: 'replay slowly, both words', write: 'show the key forms that were missing' },
  relearnGate: { at: 0.9, zh: '回炉门', form: 'another form of the same item', max: N.relearnMax, extraMinutes: 0 },
  later: {
    'word-board': 'flash-type', 'flash-type': 'word-board', 'flash-flip': 'flash-type', 'symbol-door': 'symbol-door+tip',
    'grammar-board': 'grammar-board+lesson', 'pron-quiz': 'pron-quiz+lesson', 'dictation-pool': 'dictation-pool+slow',
    'review-dictation': 'dictation-pool+slow', 'reading-room': 'reading-room+zh', 'pair-fork': 'pair-fork+both', 'write-wall': 'write-wall+ref',
  },
  variants: { tip: '先给口型 tip 和例词', lesson: '先给讲解板上对应的那一行', slow: '慢速再放一遍，逐词', zh: '先给这一题的中文', both: '两个词都先放一遍', ref: '参考句的中文和关键形式先给' },
  tomorrow: 'store.due → raceLevel puts it first; 开场抽查 (the course) asks it again',
};

// unlocks follow the course's own dayDone (every step done — no score needed) and its per-phase 出关 (not per week)
export const UNLOCK = {
  day: 'the previous day walked through (every gate visited, every sign seen); no score gate',
  week: 'the previous week\'s review day walked through; the boss is optional',
  boss: 'the review day walked through + 1 day; a 10-day window; one phase per day recommended, more if she wants',
  replay: 'any unlocked day, any form, any time: the first answer of the day is evidence, the rest practice',
  forms: 'every form of a day is open from the start (the recommended one is just first in the list)',
};

export const STARS = {
  1: { zh: '走完', rule: 'every gate opened (right or shown), every sign seen' },
  2: { zh: '首答八成', rule: 'first answers right ≥ 80 % of the day\'s scored items' },
  3: { zh: '回炉清零', rule: 'first answers ≥ 95 % and every 回炉 item answered right before the exit' },
  keep: 'stars are never taken away; a replay can only raise them',
};
export function stars(r) {
  r = r || {};
  const walked = r.gates > 0 && r.visited >= r.gates && (r.signs == null || r.seen >= r.signs);
  if (!walked) return 0;
  const acc = r.scored > 0 ? r.firstRight / r.scored : 1;
  const relearned = (r.relearn || 0) === 0 || r.relearnRight >= r.relearn;
  if (acc >= 0.95 && relearned) return 3;
  if (acc >= 0.8) return 2;
  return 1;
}

/* ───────────────────────────── the pace model (minutes per step) ───────────────────────────── */
// seconds: fixed per step + per item; calibrated on the course's own m (tests: a day's estimate within ±20 % of the
// course). `review` steps (the review day's quiz steps) are quicker per item: nothing new is taught there.
export const PACE = {
  'symbol-door': { fixed: 180, per: 240, review: { fixed: 0, per: 50 } },
  'word-board': { fixed: 150, per: 90 },
  'grammar-board': { fixed: 600, per: 150, review: { fixed: 300, per: 90 } },
  'pron-quiz': { fixed: 600, per: 150, review: { fixed: 300, per: 90 } },
  'dictation-pool': { fixed: 0, per: 270, review: { fixed: 0, per: 150 } },
  'review-dictation': { fixed: 0, per: 100 },
  'reading-room': { fixed: 1200, per: 200 },
  'pair-fork': { fixed: 0, per: 110 },
  'flash-type': { fixed: 0, per: 40 },
  'flash-flip': { fixed: 0, per: 16 },
  'write-wall': { fixed: 0, per: 180 },
  'echo-booth': { fixed: 900, per: 0 },
  'checkin-pad': { fixed: 300, per: 0 },
  'weekly-sign': { fixed: 1200, per: 0 },
  'placement-sign': { fixed: 2700, per: 0 },
};
export function estimateMinutes(step) {
  const mech = mechanicOf(step), P = PACE[mech];
  if (!P) return 0;
  const review = step.meta && step.meta.day && Number(step.meta.day.n) === 7 && P.review ? P.review : P;
  return (review.fixed + review.per * step.items.length) / 60;
}

/* ───────────────────────────── coverage ───────────────────────────── */
// every step of the loaded weeks with its mechanic; missing = steps with no mechanic (must be empty); classic = steps
// whose mechanic keeps a part on the classic page, with the reason; weeks = counts per week
export function coverage(weeks) {
  const rows = [], missing = [], classic = [], per = {};
  for (const w of weeks) {
    const c = (per[w.id] = { steps: 0, items: 0, scored: 0, covered: 0, classic: 0 });
    for (const d of w.days) for (const s of daySteps(w, d.n)) {
      const mech = mechanicOf(s), M = mech ? MECHANICS[mech] : null;
      const row = { id: s.id, type: s.meta.type, k: s.meta.k, kind: s.kind, items: s.items.length, scored: s.meta.scored, mechanic: mech, forms: M ? M.forms : [], record: M ? M.record : null, classic: M && M.classic ? M.classic : null, minutes: s.minutes, est: +estimateMinutes(s).toFixed(1) };
      rows.push(row);
      c.steps++; c.items += s.items.length; c.scored += s.meta.scored;
      if (!mech) missing.push(s.id); else c.covered++;
      if (row.classic) { classic.push({ id: s.id, type: row.type, why: row.classic }); c.classic++; }
    }
  }
  return { rows, missing, classic, weeks: per };
}

/* ───────────────────────────── a day's level: A's shape + the design ───────────────────────────── */
const clone = (o) => JSON.parse(JSON.stringify(o));
const LEVEL_OF = { puzzle: puzzleLevel, race: raceLevel, duel: duelLevel };

export function planDay(week, d, form) {
  const P = dayPlanFor(week, d);
  if (!P) throw new Error('design: no plan for ' + week.id + ' d' + d);
  const f = FORMS.includes(form) && form !== 'boss' ? form : P.form;
  const base = clone(LEVEL_OF[f](week, d));
  const byStep = new Map([...P.gates, ...P.signs].map((g) => [g.step, g]));
  base.gates.forEach((g) => { g.design = byStep.get(g.stepId) || null; });
  base.signs.forEach((s) => { s.design = byStep.get(s.stepId) || null; });
  return Object.assign(base, {
    form: f, alt: FORMS.filter((x) => x !== 'boss' && x !== f), stage: P.stage, time: P.time, minutes: P.minutes, review: P.review, route: f === 'race' ? 'loop' : f === 'duel' ? 'zones' : 'through',
    rules: RULES[f], props: PROPS_OF[f].map((id) => PROPS[id]), bots: BOTS_OF[f], retry: RETRY, extras: P.extras,
  });
}

/* ───────────────────────────── the boss: the week's 周考 (EXAM.md §2.3) ───────────────────────────── */
const BOSS_PHASES = [
  { id: 'L', zh: '听力', hp: [1.0, 0.66], n: 20, k: ['listening', 'pron'], minutes: N.boss.phaseTime.L / 60, bossPhase: 1, moves: ['slam', 'barrage'] },
  { id: 'R', zh: '阅读 · 词汇 · 语法', hp: [0.66, 0.33], n: 20, k: ['vocab', 'grammar', 'reading'], minutes: N.boss.phaseTime.R / 60, bossPhase: 2, moves: ['sweep', 'charge', 'crablets'] },
  { id: 'W', zh: '写作', hp: [0.33, 0.10], n: 1, k: ['writing'], minutes: N.boss.phaseTime.W / 60, bossPhase: 3, moves: ['frenzy'], task: { sentences: 3, zh: '一条消息的 3 个要点：写 3 句（WT 判关键形式）' } },
  { id: 'S', zh: '口语', hp: [0.10, 0.0], n: 1, k: ['speaking'], minutes: N.boss.phaseTime.S / 60, bossPhase: 3, moves: [], task: { questions: 4, readAloud: 2, zh: '4 个 Part 1 问题 + 朗读 2 句；说完就是最后一击（评分等语音服务器）' } },
];
function stableHash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
function dueSet(week) { try { return new Set(store.due(week)); } catch (e) { return new Set(); } }
function seenOf(id) { try { return store.hasAny(id); } catch (e) { return false; } }

// one entry per item id (a word is taught in the list, its cards and the review-day cards: the exam asks it once)
function dedupe(list) { const seen = new Set(); return list.filter((x) => (seen.has(x.id) ? false : (seen.add(x.id), true))); }
// a tier of candidates in a round-robin over the days (each day's list in a stable hash order), so a pick spreads over
// the week instead of draining day 1
function spread(list) {
  const byDay = new Map();
  list.slice().sort((a, b) => stableHash(a.id) - stableHash(b.id)).forEach((x) => { const l = byDay.get(x.day) || []; l.push(x); byDay.set(x.day, l); });
  const days = [...byDay.keys()].sort((a, b) => a - b), out = [];
  while (out.length < list.length) for (const d of days) { const l = byDay.get(d); if (l.length) out.push(l.shift()); }
  return out;
}
// pick n items from pools: due first (weak + due = 60 %), then fresh (never answered, 40 %), the rest to fill; no two
// neighbours from the same step type (EXAM §3.5 interleaving), spread over the days; deterministic (stableHash)
function pick(items, n, shares, due) {
  const score = (it) => (due.has(it.id) ? 0 : seenOf(it.id) ? 2 : 1);
  const wantDue = Math.round(n * (shares.weak + shares.due)), wantFresh = n - wantDue;
  const dues = spread(items.filter((it) => score(it) === 0)), fresh = spread(items.filter((it) => score(it) === 1)), rest = spread(items.filter((it) => score(it) === 2));
  const chosen = [...dues.slice(0, wantDue), ...fresh.slice(0, wantFresh)];
  for (const pool of [fresh.slice(wantFresh), dues.slice(wantDue), rest]) for (const it of pool) { if (chosen.length >= n) break; chosen.push(it); }
  return interleave(chosen);
}
// EXAM §3.5: neighbours never share a question type or a step when it can be helped; the type with the most left goes
// first so the session stays balanced; stable otherwise
function interleave(list) {
  const rest = list.slice(), out = [];
  while (rest.length) {
    const prev = out[out.length - 1], cnt = new Map();
    rest.forEach((x) => cnt.set(x.type, (cnt.get(x.type) || 0) + 1));
    let best = 0, bestScore = -Infinity;
    rest.forEach((x, i) => {
      let s = cnt.get(x.type) * 10 - i * 0.01;
      if (prev && x.type === prev.type) s -= 1000;
      if (prev && x.stepId === prev.stepId) s -= 500;
      if (s > bestScore) { bestScore = s; best = i; }
    });
    out.push(rest.splice(best, 1)[0]);
  }
  return out;
}

export function bossPlan(week, opts) {
  opts = opts || {};
  const B = bossLevel(week), due = dueSet(week), shares = EXAM_MECHANICS.boss.shares;
  const flat = dedupe(B.gates.flatMap((g) => g.items.filter((it) => it.meta.scored).map((it) => ({ id: it.id, item: it, type: g.kind + ':' + (it.meta.kind || ''), day: g.day, phase: g.phase, stepId: g.stepId }))));
  // the speaking set: A's bossLevel leaves phase S empty (unscored until the speech server); the week's speak steps
  // give the Part 1 questions, two dictation sentences the read-aloud
  const speak = (week.days || []).flatMap((day) => daySteps(week, day.n).filter((s) => s.meta.type === 'speak').flatMap((s) => s.items.map((it) => ({ id: it.id, item: it, type: 'speak', day: Number(day.n), phase: 'S', stepId: s.id }))));
  const phases = BOSS_PHASES.map((ph) => {
    const pool = ph.id === 'S' ? speak : flat.filter((x) => x.phase === ph.id);
    let items;
    if (ph.id === 'W') items = pick(pool, ph.task.sentences, shares, due);
    else if (ph.id === 'S') {
      const qs = pool.slice().sort((a, b) => stableHash(a.id + week.id) - stableHash(b.id + week.id)).slice(0, ph.task.questions).sort((a, b) => a.day - b.day);
      const read = flat.filter((x) => x.phase === 'L' && x.item.meta.kind === 'dict').sort((a, b) => stableHash(a.id + 'r') - stableHash(b.id + 'r')).slice(0, ph.task.readAloud).map((x) => ({ ...x, readAloud: true }));
      items = qs.concat(read);
    }
    else items = pick(pool, ph.n, shares, due);
    return { ...ph, items: items.map((x) => ({ id: x.id, stepId: x.stepId, day: x.day, readAloud: !!x.readAloud })), pool: pool.length, hitPerRight: ph.id === 'S' ? 0 : +((ph.hp[0] - ph.hp[1]) / Math.max(1, ph.id === 'W' ? 1 : ph.n)).toFixed(4) };
  });
  const n = Number(week.n) || 0;
  return {
    kind: 'boss', week: week.id, boss: 'hullbreaker', stage: (BOSS_STAGE[week.id] || { stage: 'tidewater', time: 'dusk' }).stage, time: (BOSS_STAGE[week.id] || {}).time || 'dusk',
    month: n > 0 && n % 4 === 0, opens: 'review day + 1', window: 10, perDay: 1, shares, phases,
    minutes: phases.reduce((a, p) => a + p.minutes, 0), squad: BOTS_OF.boss, props: PROPS_OF.boss.map((id) => PROPS[id]), rules: RULES.boss,
  };
}

/* ───────────────────────────── 今日小考 (EXAM.md §2.2) and 自由练习 (§2.5) ───────────────────────────── */
// 8 items: half due / weak (store.due), 30 % today's misses, the rest today's new; the last one is something she
// has answered before and that is not due (结尾留在一次成功上); interleaved by type; played as one duel round
export function quizPlan(week, d, misses) {
  const Q = EXAM_MECHANICS.quiz, n = Q.n, due = dueSet(week), missSet = new Set(misses || []);
  const today = dedupe(daySteps(week, d).filter((s) => s.kind !== 'lesson').flatMap((s) => s.items.filter((it) => it.meta.scored).map((it) => ({ id: it.id, item: it, type: s.kind + ':' + it.meta.kind, day: d, stepId: s.id }))));
  const all = dedupe((week.days || []).flatMap((day) => daySteps(week, day.n).filter((s) => s.kind !== 'lesson').flatMap((s) => s.items.filter((it) => it.meta.scored).map((it) => ({ id: it.id, item: it, type: s.kind + ':' + it.meta.kind, day: Number(day.n), stepId: s.id })))));
  const byHash = (a, b) => stableHash(a.id + d) - stableHash(b.id + d);
  const dues = all.filter((x) => due.has(x.id) && !missSet.has(x.id)).sort(byHash).slice(0, Math.round(n * Q.shares.due));
  const miss = today.filter((x) => missSet.has(x.id)).sort(byHash).slice(0, Math.round(n * Q.shares.miss));
  const chosen = new Set([...dues, ...miss].map((x) => x.id));
  const fresh = today.filter((x) => !chosen.has(x.id)).sort(byHash);
  const items = [...dues, ...miss];
  for (const x of fresh) { if (items.length >= n - 1) break; items.push(x); chosen.add(x.id); }
  const closer = all.find((x) => !chosen.has(x.id) && !due.has(x.id) && seenOf(x.id)) || fresh.find((x) => !chosen.has(x.id)) || null;
  if (closer) items.push(closer);
  // interleave by type, keep the closer last
  const last = items.pop();
  const out = interleave(items);
  if (last) out.push(last);
  return { kind: 'quiz', form: Q.form, week: week.id, day: d, n: out.length, minutes: Q.minutes, stage: (dayPlanFor(week, d) || {}).stage || STAGE_IDS[0], time: 'dusk', items: out.map((x) => ({ id: x.id, stepId: x.stepId, day: x.day })), rules: RULES.duel, bots: { count: 3, teams: 2, allies: 1, enemies: 2, model: 'BOT_ANSWER' } };
}

// 自由练习: opts = { skill: 'L' | 'R' | 'W' | null, weakOnly, n: 5 | 10 | 15, stage? } → a short race whose checkpoints
// are the chosen items (never recommended; she opens it herself)
const SKILL_K = { L: ['listening', 'pron'], R: ['vocab', 'grammar', 'reading'], W: ['writing'] };
export function freePlan(week, opts) {
  opts = opts || {};
  const n = [5, 10, 15].includes(opts.n) ? opts.n : 10, due = dueSet(week), ks = opts.skill && SKILL_K[opts.skill];
  const all = dedupe((week.days || []).flatMap((day) => daySteps(week, day.n).filter((s) => (ks ? ks.includes(s.meta.k) : s.kind !== 'lesson')).flatMap((s) => s.items.filter((it) => it.meta.scored).map((it) => ({ id: it.id, stepId: s.id, day: Number(day.n), type: s.kind, due: due.has(it.id) })))));
  const pool = opts.weakOnly ? all.filter((x) => x.due) : all.slice().sort((a, b) => Number(b.due) - Number(a.due) || stableHash(a.id) - stableHash(b.id));
  const items = pool.slice(0, n);
  const stage = opts.stage && STAGE_IDS.includes(opts.stage) ? opts.stage : STAGE_IDS[stableHash(week.id + n + String(opts.skill || '')) % STAGE_IDS.length];
  return { kind: 'free', form: 'race', week: week.id, n: items.length, minutes: Math.round((items.length * 45) / 60), stage, time: 'day', items, rules: RULES.race, bots: BOTS_OF.race, props: PROPS_OF.race.map((id) => PROPS[id]) };
}

/* ───────────────────────────── the weeks beyond 3: SYLLABUS → mechanics (docs/LEVELS.md §4) ───────────────────────────── */
// status: ready = the mechanic exists today (the pack just has to carry the step type) · needs = a new question
// mechanic to build (named) · classic = stays on the classic page until the named dependency lands
export const SYLLABUS_MECHANICS = [
  { week: 4, topics: [
    { zh: '失去爆破和同化', mechanic: 'pron-quiz', status: 'ready', note: 'grammar k:pron 小测照旧；听辨岔路用短语对（A 的 pairItems 不限单词）' },
    { zh: '150 词（教育、工作、科技、媒体、运动、电影和音乐）', mechanic: 'word-board', status: 'ready' },
    { zh: '现在完成时、比较级和最高级、副词', mechanic: 'grammar-board', status: 'ready' },
    { zh: '写作：用并列句写一段话', mechanic: 'write-wall', status: 'needs', note: '多句一题：WT 逐句判 + 段落覆盖率；Boss W 段升级为一段话' } ] },
  { week: 5, topics: [
    { zh: '语调：升调和降调', mechanic: 'tone-door', status: 'classic', note: '要录音（设备 tts 的语调不可靠）：录音接入后做「听一句选升 / 降」的两扇门' },
    { zh: '被动语态、主谓一致、连词', mechanic: 'grammar-board', status: 'ready' },
    { zh: '慢速新闻精听', mechanic: 'dictation-pool', status: 'ready', note: '长段落：池子分段，每段一圈涟漪；道具赛里是「长听写」检查点' } ] },
  { week: 6, topics: [
    { zh: '跟读强化', mechanic: 'echo-booth', status: 'classic', note: '评分等语音服务器；亭子照用' },
    { zh: '150 个学术常用词（第一组）', mechanic: 'word-board', status: 'ready' },
    { zh: '定语从句、非谓语入门', mechanic: 'order-door', status: 'needs', note: '「拼句」：把词块排成句子（gen.js 已有 order 题型）；语法门照旧' },
    { zh: '阶段 1 总复习和出关小测', mechanic: 'boss', status: 'ready', note: '老师的出关小测是课：复习日的门；周考照常' } ] },
  { week: 7, topics: [
    { zh: '听力 Part 1 表格和笔记填空', mechanic: 'form-door', status: 'needs', note: '表格门：hud-learn 的 form 输入（bank.js 的 LF）' },
    { zh: '阅读：判断题（T / F / NG）', mechanic: 'three-door', status: 'needs', note: '三扇门：对 / 错 / 没提（RT）' },
    { zh: '写作 Task 1：线图', mechanic: 'write-wall', status: 'classic', note: 'AI 批改走经典页；图表在展板上' },
    { zh: '口语 Part 1 常见话题', mechanic: 'echo-booth', status: 'ready' },
    { zh: '雅思词汇：住宿、学习', mechanic: 'word-board', status: 'ready' } ] },
  { week: 8, topics: [
    { zh: '听力 Part 2 地图题、单选', mechanic: 'map-tap', status: 'needs', note: '地图题 = 在舞台小地图上点位置（hud.map 已有画布）' },
    { zh: '阅读：段落标题配对', mechanic: 'match-wall', status: 'needs', note: '配对墙：标题拖到段落（gen.js 的 match）' },
    { zh: '写作 Task 1：柱图和饼图', mechanic: 'write-wall', status: 'classic' },
    { zh: '口语 Part 2 答题结构', mechanic: 'echo-booth', status: 'ready', note: '亭子加 2 分钟沙漏（1 分钟准备）' } ] },
  { week: 9, topics: [
    { zh: '听力 Part 3 多选、配对', mechanic: 'match-wall', status: 'needs', note: '配对墙（听的版本）：放完对话，把人名拖到选项上' },
    { zh: '阅读：填空题', mechanic: 'form-door', status: 'needs', note: '表格门的阅读版（RN，字数限制照题库）' },
    { zh: '写作 Task 1：表格和流程图 / 三种书信', mechanic: 'write-wall', status: 'classic' } ] },
  { week: 10, topics: [
    { zh: '听力 Part 4 讲座填空', mechanic: 'form-door', status: 'needs', note: '表格门：一段独白，边听边填' },
    { zh: '阅读：信息配对和特征配对', mechanic: 'match-wall', status: 'needs', note: '配对墙' },
    { zh: '写作 Task 2：观点类', mechanic: 'write-wall', status: 'classic' },
    { zh: '口语 Part 3 入门', mechanic: 'echo-booth', status: 'classic', note: '追问要语音服务器' },
    { zh: '名词性从句、状语从句', mechanic: 'order-door', status: 'needs', note: '拼句门' } ] },
  { week: 11, topics: [
    { zh: '整套听力、整套阅读限时练', mechanic: 'boss', status: 'ready', note: '周考 Boss 的 L / R 段放满 40 题、开计时（EXAM 的可选开关）' },
    { zh: '阶段 2 出关测试', mechanic: 'boss', status: 'ready' } ] },
  { week: 12, topics: [{ zh: '第 1 次全真模考和诊断；按短板专项突破', mechanic: 'boss', status: 'classic', note: '满月月考 = Boss；全真模考的整卷在经典页；短板专项 = freePlan({ weakOnly })' }] },
  { week: 13, topics: [{ zh: '听力同义替换和干扰项；阅读提速', mechanic: 'pair-fork', status: 'ready', note: '同义替换 = 词对岔路（原文词 vs 同义说法）' }] },
  { week: 14, topics: [{ zh: '写作 Task 2 双问题类；口语 Part 3 深入', mechanic: 'write-wall', status: 'classic' }] },
  { week: 15, topics: [{ zh: '第 4 次模考；错题本总复盘', mechanic: 'race', status: 'ready', note: '错题本 = freePlan({ weakOnly, n: 15 }) 的道具赛' }] },
  { week: 16, topics: [{ zh: '每天一套听力和阅读；熟悉机考界面', mechanic: 'boss', status: 'classic', note: '机考界面 = 经典页' }] },
  { week: 17, topics: [{ zh: '考前调整、轻量复习', mechanic: 'race', status: 'ready', note: '只开自由练习；不推荐任何关' }] },
];

// the day table as text rows (the §3 tables in docs/LEVELS.md are printed from this; tools/learn/print-levels.mjs)
export function dayTable(w, d) {
  const P = DAY_PLAN[w][d];
  const g = P.gates.map((x) => x.step.split(':')[1] + ' ' + MECHANICS[x.mechanic].zh + ' ×' + x.ask + ' · ' + x.minutes + "'" + ' @' + x.spot.zh).join(' → ');
  const s = P.signs.map((x) => x.step.split(':')[1] + ' ' + MECHANICS[x.mechanic].zh + (x.ask ? ' ×' + x.ask : '') + ' · ' + x.minutes + "'").join(' · ');
  return { w, d, form: P.form, alt: P.alt, stage: P.stage, time: P.time, minutes: P.minutes, gates: g, signs: s };
}

export { dayOf };
