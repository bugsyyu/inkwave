/* 雅思工作台 · 考试 · app/exam/bank.js — owner: E1（考试数据）. docs/EXAM.md §3.2, §4, §10.3.
 *
 * The exam's question bank and tables: formats (§4.2, §4.2.1), sub-skills and the four writing / speaking criteria
 * (§3.2, §3.4.1), pattern cards (§4.11), the story world (§4.1: cast, names, places, chapters), confusions (§4.7),
 * paraphrases (§4.6 #9), core words (§4.8), parameter types (§4.4), the week-1 tag tables (W1_QUIZ_TAGS, W1_PAIR_TAGS,
 * W1_COLL) and the scenes (§4.3, format §4.4), plus the pure helpers that read the course index (tagsOf, conceptOf,
 * contrastOf, phrases, slotTypesOf, vocab, frames, count).
 * Pure: no DOM, no WB, no clock, nothing computed at load time. UMD: Node → module.exports; browser → BaseEngine.ExamBank.
 *
 * §10.9 budget: ≤ 330 KB (set by the lead after step 2a; a third of the file is Chinese at 3 bytes a character).
 *
 * ───────────────────────────── CONTENT LOG (§4.6 #8: the lead's read-aloud review is written here) ─────────────────────────────
 * 2026-09-27 E1  Step 1a: tables complete; 33 scenes with 82 frames (all use week-1 content only; 16 need only day 1),
 *               12 generic frames, 8 collocation frames. Every English line has Chinese; dates come from the real
 *               calendar (cal). A pair slot's only / not list may name the pair ('cap|cup' = either word is said).
 * 2026-09-27 E1  Step 2a: 102 scenes, 247 frames, 380 questions (a multi-question frame counts each question); 86 scenes use
 *               week-1 content only; 16 wait for a later week (needs 'week:N'): week 2 shop-return, shop-list, svc-post,
 *               travel-train-ticket, travel-airport, season-forecast · week 3 school-campus-tour, travel-directions,
 *               travel-holiday · week 4 social-film · week 7 acad-lecture-sleep, acad-survey, acad-article, acad-graph (tier 2)
 *               · week 9 acad-seminar · week 10 acad-essay (Task 2). By place: home 16, school 15, service 12, social 10,
 *               cafe 9, market 8, work 8, health 7, travel 6, acad 6, season 5. New lists: meal stname neighq fruit paym
 *               major jobq event city colour food weather townp campus genre loc. count(week 1 done) = 4,006 questions,
 *               96 % of 1,000 random ones distinct (tests/exam/bank.test.mjs prints both).
 *               Frame fields added: instr (a frame's own IELTS instruction), fixed (a question Claude wrote keeps its
 *               values), cardQ (a generic frame's wording when the word has no lesson sentence), sent (a generic frame
 *               that needs a real lesson sentence), derive half / sum / mul / rest; option templates '=text|中文' and
 *               '{x}|中文{x.zh}'.
 *               E1's own read-through before the lead's (≈ 110 rendered frames, three random samples and every later-week
 *               scene): fixed "the Big phone price" → "the Big one", "your new time with the doctor" → "You can now see the
 *               doctor on …", "They come again tomorrow, Tuesday" → "They will come back tomorrow (Tuesday)", "Your number on
 *               Park Street is fifty" → "Take the number fifty bus …", a New Year greeting before a December party (now
 *               January only), "a library in the city station" → "in the station near the city centre", a restaurant booking
 *               whose full day changed between two lines ({d~0}), "What does the shop give her?" to the learner herself
 *               ("you"), a lower-case "computer science?", class / lesson offered as two meanings of one word, a price
 *               stall hearing fool|full (free pair slots now obey only / not), and the Chinese: 两点 not 二点, 两个人, family
 *               words as one natural word (姐姐, not 姐姐；妹妹), adjectives without 的 after 很, notice times as 上午九点半到晚上七点.
 * 2026-09-27 lead Step 3 read-aloud review (§4.6 #8: 30 random items, week 1 learned, plan('free') by skill / new / weak): real,
 *               useful scenes close to IELTS Part 1; no answer leaks, no wrong English, weekdays match the dates. To fix:
 *               (1) raw glosses in sentences and options (「和我爷爷；外公喝茶」「房租 v. 租」「水槽；下沉」); (2) prompts not
 *               matching the audio (「有人说了一句话」 for one word); (3) the generic LF's note with an empty label; (4) British
 *               symbols (/ɒ/) in PS for her American accent; (5) spoken lines without contractions ("It is seven hundred
 *               pounds. Oh, sorry, no. It is six hundred pounds."); (6) "The men are my friends."; 「一共13.50 英镑」.
 * 2026-09-27 E1  Fixed at the source (gen.js unless said): (1) zhClean: no part-of-speech marker; on its own ≤ 2 senses
 *               joined by "/" (水槽/下沉, 房租), in a sentence the first (我爷爷): options, notes, labels, the Chinese of a
 *               word said alone; (2) the question says what is played (wordQ / cardQ: 「一个词」); lp-s only for a pair word
 *               with a sentence (sentOf); (3) the note is 'Example 例句', or 'New word 生词' for a word alone (cardNotes);
 *               (4) PS in her accent (accentOf; SYM_US / EX_US = the host's SYM_US / US_IPA): /ɝː/ /oʊ/ …, never /ɒ/ for
 *               'us', one option with the sound in that accent, the accent in the row (ac=); P-o / P-er names and P-long /
 *               P-er cards too (skillZh, patternCard); (5) 127 spoken lines and friends' messages contracted (dictation and
 *               lesson sentences, notices and formal emails unchanged); (6) men / man → "Can you see the men by the door?";
 *               zhSp: a space between Chinese and digits / Latin words in all of an item's Chinese (dates stay 9月27日).
 *               From a read of one item per frame × question × wording: collocation distractors that are good English (pay
 *               with cash, come to a class) replaced (COLL_WRONG, VERB_ALT), sentences only for the phrases they fit
 *               (altFit); places closed on Sunday never book one; floors count from the ground floor (first floor 二楼);
 *               妈妈 / 爸爸; tea not £13.50; the parcel note's shop; no repeated names in work-colleagues. Tests: bank.test
 *               (accent names and cards, contracted lines), gen.test (Chinese sweep, prompts vs audio, PS accent).
 * 2026-09-30     Her words 「考试可以不用要求我大写」: letter case never matters (§4.2.1). W-caps retired (skill, W-GRA link, card,
 *               frames' subs, tags); the L-date / L-spell cards no longer ask for capitals.
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) { var BE = root.BaseEngine = root.BaseEngine || {}; if (!BE.ExamBank) BE.ExamBank = api; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (root) {
  'use strict';

  var V = 1;
  var own = Object.prototype.hasOwnProperty;
  var M = null;
  function Model() {
    if (M) return M;
    if (typeof module === 'object' && module && module.exports && typeof require === 'function') { try { M = require('../base/model.js'); } catch (e) { M = null; } }
    if (!M && root && root.BaseEngine) M = root.BaseEngine.Model || null;
    return M;
  }

  /* ───────────────────────────── numbers (pure helpers the parameter types use) ───────────────────────────── */
  var ONES = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen',
    'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
  var TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  var ORD_IRR = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };
  // 215 → "two hundred and fifteen" (British "and"); 3 → "three"
  function numWord(n) {
    n = Math.floor(Math.abs(Number(n) || 0));
    if (n < 20) return ONES[n];
    if (n < 100) return TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
    if (n < 1000) return ONES[Math.floor(n / 100)] + ' hundred' + (n % 100 ? ' and ' + numWord(n % 100) : '');
    return numWord(Math.floor(n / 1000)) + ' thousand' + (n % 1000 ? (n % 1000 < 100 ? ' and ' : ' ') + numWord(n % 1000) : '');
  }
  function ordWord(n) {
    var w = numWord(n), m = /^(.*?)([a-z]+)$/.exec(w), head = m ? m[1] : '', last = m ? m[2] : w;
    var o = ORD_IRR[last] || (/y$/.test(last) ? last.slice(0, -1) + 'ieth' : last + 'th');
    return head + o;
  }
  function ordDigits(n) {
    n = Number(n);
    var s = (n % 100 >= 11 && n % 100 <= 13) ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
    return n + s;
  }
  var ZH_D = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  function zhNum(n) {
    n = Math.floor(Number(n) || 0);
    if (n < 10) return ZH_D[n];
    if (n < 20) return '十' + (n % 10 ? ZH_D[n % 10] : '');
    if (n < 100) return ZH_D[Math.floor(n / 10)] + '十' + (n % 10 ? ZH_D[n % 10] : '');
    return String(n);
  }
  function cap1(s) { s = String(s || ''); return s.charAt(0).toUpperCase() + s.slice(1); }

  /* ───────────────────────────── formats (§4.2, §4.2.1) ───────────────────────────── */
  // instr: { tier: [en, zh] }; the generator swaps in the TWO WORDS wording when a frame's limit says so.
  var I_ONE = ['Write ONE WORD AND/OR A NUMBER for each answer.', '每空写一个词和 / 或一个数字（拼错不给分）'];
  var I_TWO = ['Write NO MORE THAN TWO WORDS AND/OR A NUMBER for each answer.', '每空最多写两个词和 / 或一个数字'];
  var I_ABC = ['Choose the correct letter, A, B or C.', '选正确的字母 A、B 或 C'];
  var I_TXT = ['Choose ONE WORD ONLY from the text for each answer.', '每空只从原文里选一个词（原文没有的词不给分）'];
  var I_TF = ['Write TRUE or FALSE.', '写 TRUE（对）或 FALSE（错）'];
  var I_TFNG = ['Do the following statements agree with the information in the text? Write TRUE, FALSE or NOT GIVEN.', '下面的说法和原文一致吗？写 TRUE（一致）、FALSE（相反）或 NOT GIVEN（原文没说）'];
  function F(id, zh, skill, ielts, kinds, input, modes, sec, lv, b, c, extra) {
    var f = { id: id, zh: zh, skill: skill, ielts: ielts, kinds: kinds, input: input, modes: modes, sec: sec, lv: lv, b: b, c: c,
      minTier: 1, needs: null, quiz: true, instr: null, limit: null };
    for (var k in extra) if (own.call(extra, k)) f[k] = extra[k];
    return f;
  }
  var TYPED = { ok: 'T', hint: 'H' }, SPELL = { ok: 'T', hint: 'H', self: 'S' }, PICK = { ok: 'P' };
  var FORMATS = {
    LF: F('LF', '听音填表', 'L', 'S1 表格填空', ['w'], 'form', TYPED, 50, 2, 3.3, 0, { needs: 'audio', instr: { 1: I_ONE, 2: I_TWO }, limit: { words: 1, num: true } }),
    LN: F('LN', '听音填笔记', 'L', 'S1、S4 笔记填空', ['w'], 'form', TYPED, 55, 2, 3.5, 0, { needs: 'audio', instr: { 1: I_ONE, 2: I_TWO }, limit: { words: 1, num: true } }),
    LC: F('LC', '听音选择', 'L', 'S1–S3 单选', ['w', 'p', 'q'], 'choice', PICK, 40, 1, 3.0, 1 / 3, { needs: 'audio', instr: { 1: I_ABC, 2: I_ABC } }),
    LP: F('LP', '辨音', 'L', '数字辨音；元音、辅音对立', ['p', 'w'], 'choice', PICK, 25, 1, 2.5, 1 / 2, { needs: 'audio' }),
    LD: F('LD', '听写句子', 'L', '听写（拼写、弱读、词尾）', ['d'], 'type', { ok: 'D1' }, 90, 1, 3.8, 0, { needs: 'audio' }),
    LM: F('LM', '听音标图', 'L', 'S2 地图、平面图', ['w'], 'choice', PICK, 50, 2, 4.0, 1 / 4, { needs: 'audio',
      instr: { 1: ['Write the correct letter.', '写出正确的字母'], 2: ['Write the correct letter.', '写出正确的字母'] } }),
    RN: F('RN', '读告示答题', 'R', '培训类 S1；简答', ['w', 'q'], 'choice', { ok: 'P', typed: 'T', hint: 'H' }, 45, 1, 3.0, 1 / 3, { instr: { 1: I_ABC, 2: I_ABC }, typedB: 3.3, typedInstr: { 1: I_TXT, 2: I_TXT } }),
    RT: F('RT', '判断', 'R', 'True / False / Not Given', ['w', 'q'], 'tfng', PICK, 35, 1, 3.2, 1 / 2, { instr: { 1: I_TF, 2: I_TFNG }, ngWeek: 3 }),
    RM: F('RM', '配对', 'R', '信息配对、人物配对', ['w'], 'match', PICK, 40, 1, 3.2, 1 / 3, {
      instr: { 1: ['Write the correct letter, A, B or C.', '写正确的字母 A、B 或 C'], 2: ['Write the correct letter, A, B or C.', '写正确的字母 A、B 或 C'] } }),
    RG: F('RG', '阅读填空', 'R', '句子、摘要填空（用原文的词）', ['w'], 'form', TYPED, 50, 2, 3.4, 0, { instr: { 1: I_TXT, 2: I_TXT }, limit: { words: 1, num: false, fromText: true } }),
    VS: F('VS', '看音标拼写', 'V', '拼写（听力填空的前提）', ['w'], 'type', SPELL, 35, 3, 3.0, 0, {}),
    VM: F('VM', '语境选意思', 'V', '词汇（同义替换的基础）', ['w'], 'choice', PICK, 25, 1, 2.5, 1 / 3, {}),
    VG: F('VG', '消息填空', 'V', '完形；培训类 Task 1 的语言', ['w'], 'type', SPELL, 40, 2, 3.2, 0, {}),
    GF: F('GF', '语法选择填空', 'G', 'GRA 基础', ['q'], 'choice', PICK, 25, 1, 2.8, 1 / 3, {}),
    GP: F('GP', '点词', 'G', '词性、句子成分', ['q'], 'tap', PICK, 25, 1, 2.8, 1 / 4, {}),
    GC: F('GC', '改错', 'G', '写作自查', ['q'], 'choice', PICK, 40, 2, 3.4, 1 / 4, {}),
    GR: F('GR', '排序成句', 'G', '句子骨架', ['q', 'x'], 'order', PICK, 40, 2, 3.2, 0, {}),
    PS: F('PS', '音标辨音', 'P', '发音基础', ['s', 'p'], 'choice', PICK, 20, 1, 2.5, 1 / 3, {}),
    WT: F('WT', '看中文写句子', 'W', '句子层面的 GRA、LR', ['x', 'w'], 'text', { ok: 'W', self: 'S' }, 75, 3, 3.5, 0, {}),
    WM: F('WM', '写一条消息', 'W', '培训类 Task 1 → 学术 Task 1、Task 2', [], 'text', null, 480, 3, null, null, { quiz: false,
      instr: { 1: ['Write at least 30 words.', '至少写 30 词'], 2: ['Write at least 150 words.', '至少写 150 词'] } }),
    SP: F('SP', '口语问答', 'S', 'Part 1', ['k'], 'speak', { ok: 'K' }, 90, 3, null, null, { quiz: false }),
    SR: F('SR', '读给机器听', 'S', '发音可懂度', ['s', 'p', 'd'], 'speak', null, 30, 3, null, null, { quiz: false, needs: 'mic' }),
    SC: F('SC', '话题卡', 'S', 'Part 2', [], 'speak', null, 200, 3, null, null, { quiz: false, minTier: 2 }),
    VC: F('VC', '搭配', 'V', 'LR 的搭配、GRA 的介词', ['c'], 'choice', null, 25, 1, 2.8, 1 / 3, {}),
    WK: F('WK', '要点检查', 'W', '写作 TA：要点都写到', [], 'choice', null, 30, 1, 2.8, 1 / 3, {}),
    WD: F('WD', '看表写句子', 'W', '学术 Task 1 的前身（数据句）', [], 'text', null, 360, 3, null, null, { quiz: false,
      instr: { 1: ['Write 3 or 4 sentences about the table.', '看表写 3–4 句（学术类小作文的第一步：把表里的事实写清楚）'], 2: ['Summarise the information by selecting and reporting the main features. Write at least 150 words.', '概括图表的主要信息，至少写 150 词'] } })
  };
  var IELTS_FMT = { LF: 1, LN: 1, LC: 1, LM: 1, RN: 1, RT: 1, RM: 1, RG: 1, WM: 1, WD: 1 };

  /* ───────────────────────────── sub-skills (§3.2, 75 for week 1) ───────────────────────────── */
  var R = { L: '被干扰项带偏', LS: '会听不会拼', LW: '连读弱读没听出', LF: '走神没跟上', LQ: '看题不充分', RD: '定位失败', RL: '长难句看不懂', RP: '同义替换没认出',
    RT: '判断题概念混淆', RC: '粗心', WG: '语法错误', WS: '拼写', WA: '没完整回答题目', WL: '结构或逻辑问题', WN: '字数不够', SK: '卡顿停顿', SP: '发音不清',
    SW: '用词单一', SS: '答得太短', VM: '意思记错', VS: '拼写错误', VC: '搭配用错', VP: '词性用错', GS: '主谓一致', GT: '时态', GA: '单复数和冠词', GP: '介词', GX: '语法点' };
  function S(id, zh, group, imp, reason, pattern, extra) {
    var s = { id: id, zh: zh, group: group, importance: imp, reason: reason || null, pattern: pattern || null };
    if (extra) for (var k in extra) if (own.call(extra, k)) s[k] = extra[k];
    return s;
  }
  var SKILLS = {};
  [
    S('L-num', '数字：十几和几十', 'L', 1.3, R.LS, 'L-num'), S('L-price', '价钱', 'L', 1.1, R.LS, 'L-price'), S('L-time', '钟点', 'L', 1.1, R.LS, 'L-time'),
    S('L-date', '日期', 'L', 1.3, R.LS, 'L-date'), S('L-spell', '听到的词拼对', 'L', 1.2, R.LS, 'L-spell'), S('L-letters', '听字母拼名字、地址', 'L', 1.0, R.LS, 'L-letters'),
    S('L-weak', '弱读小词', 'L', 1.0, R.LW, 'L-weak'), S('L-end', '词尾 -s / -ed', 'L', 1.2, R.LW, 'L-end'), S('L-turn', '录音里改口', 'L', 1.1, R.L, 'L-turn'),
    S('L-detail', '听懂细节', 'L', 1.0, R.L, 'L-detail'), S('L-dict', '整句听写', 'L', 1.2, R.LF, 'L-dict'), S('L-rule', '按题目要求作答（字数限制）', 'L', 1.2, R.LQ, 'L-rule'),
    S('L-map', '地图、平面图', 'L', 1.0, R.LQ, 'L-map'),
    S('R-detail', '找细节', 'R', 1.0, R.RD, 'R-detail'), S('R-number', '读数字、钟点、价钱', 'R', 1.0, R.RC, 'R-number'), S('R-infer', '简单推断', 'R', 1.0, R.RL, 'R-infer'),
    S('R-para', '同义替换', 'R', 1.1, R.RP, 'R-para'), S('R-tfng', '判断（True / False / Not Given）', 'R', 1.1, R.RT, 'R-tfng'), S('R-match', '配对', 'R', 1.0, R.RD, 'R-match'),
    S('R-rule', '按题目要求作答（只用原文的词）', 'R', 1.0, R.RC, 'R-rule'),
    S('W-sent', '句子完整（有主语、有动词）', 'W', 1.15, R.WG, 'W-sent'),
    S('W-spell', '写作里的拼写', 'W', 1.0, R.WS, 'W-spell'), S('W-task', '回应题目（要点都写到）', 'W', 1.0, R.WA, 'W-task'),
    S('W-link', '连接（and、but、so、because）', 'W', 1.0, R.WL, 'W-link'), S('W-length', '字数够', 'W', 1.0, R.WN, 'W-length'),
    S('W-TA', '写作：任务完成 / 回应（TA / TR）', 'W', 1.0, null, null, { crit: true, kind: 'W', links: ['W-task', 'W-length'] }),
    S('W-CC', '写作：连贯与衔接（CC）', 'W', 1.0, null, null, { crit: true, kind: 'W', links: ['W-link', 'G-pattern'] }),
    S('W-LR', '写作：词汇（LR）', 'W', 1.0, null, null, { crit: true, kind: 'W', links: ['V-coll', 'W-spell', 'V-spell'] }),
    S('W-GRA', '写作：语法（GRA）', 'W', 1.0, null, null, { crit: true, kind: 'W', links: ['W-sent', 'G-be', 'G-3sg', 'G-article', 'G-plural'] }),
    S('S-ext', '答完再加一句（原因、细节）', 'S', 1.0, R.SS, 'S-ext'), S('S-flu', '流利（语速、停顿）', 'S', 1.0, R.SK, 'S-flu'),
    S('S-intel', '说清楚（机器能听懂）', 'S', 1.0, R.SP, 'S-intel'), S('S-phr', '用上学过的句型', 'S', 1.0, R.SW, 'S-phr'),
    S('S-FC', '口语：流利与连贯（FC）', 'S', 1.0, null, null, { crit: true, kind: 'S', links: ['S-ext', 'S-flu', 'W-link'] }),
    S('S-LR', '口语：词汇（LR）', 'S', 1.0, null, null, { crit: true, kind: 'S', links: ['S-phr', 'V-coll'] }),
    S('S-GRA', '口语：语法（GRA）', 'S', 1.0, null, null, { crit: true, kind: 'S', links: ['G-be', 'G-3sg', 'G-do', 'W-sent'] }),
    S('S-P', '口语：发音（P）', 'S', 1.0, null, null, { crit: true, kind: 'S', links: ['S-intel', '@P2'] }),   // @P2 = her two weakest sound contrasts (§3.4.1)
    S('V-cal', '星期和月份的词', 'V', 1.0, R.VM, 'V-topic', { topic: 'w1d1:a2' }), S('V-num', '数字和价钱的词', 'V', 1.0, R.VM, 'V-topic', { topic: 'w1d2:a2' }),
    S('V-family', '家人和朋友的词', 'V', 1.0, R.VM, 'V-topic', { topic: 'w1d3:a2' }), S('V-home', '家和租房的词', 'V', 1.0, R.VM, 'V-topic', { topic: 'w1d4:a2' }),
    S('V-routine', '日常作息的词', 'V', 1.0, R.VM, 'V-topic', { topic: 'w1d5:a2' }), S('V-work', '学习和工作的词', 'V', 1.0, R.VM, 'V-topic', { topic: 'w1d6:a2' }),
    S('V-spell', '打字拼写', 'V', 1.25, R.VS, 'V-spell'), S('V-mean', '认得意思', 'V', 1.0, R.VM, 'V-mean'), S('V-coll', '搭配', 'V', 1.1, R.VC, 'V-coll'),
    S('G-pos', '词性', 'G', 1.0, R.VP, 'G-pos'), S('G-svo', '主谓宾（句子骨架）', 'G', 1.0, R.GX, 'G-svo'), S('G-be', 'am / is / are', 'G', 1.2, R.GS, 'G-be'),
    S('G-3sg', '第三人称单数 -s', 'G', 1.2, R.GS, 'G-3sg'), S('G-do', 'Do / Does / doesn\'t + 原形', 'G', 1.0, R.GT, 'G-do'),
    S('G-plural', '名词复数、不可数', 'G', 1.0, R.GA, 'G-plural'), S('G-article', 'a / an / the', 'G', 1.15, R.GA, 'G-article'),
    S('G-pattern', '五种基本句型', 'G', 1.0, R.GX, 'G-pattern'), S('G-prep', '时间介词 on / in / at', 'G', 1.0, R.GP, 'G-prep'),
    S('P-i', '长短元音 /iː/–/ɪ/（ship / sheep）', 'P', 0.8, null, 'P-long'), S('P-u', '长短元音 /uː/–/ʊ/（full / fool）', 'P', 0.8, null, 'P-long'),
    S('P-a', '长短元音 /ɑː/–/ʌ/（cut / cart）', 'P', 0.8, null, 'P-long'), S('P-o', '/ɒ/–/ɔː/ 与 /ɒ/–/ʌ/（pot / port、hot / hut）', 'P', 0.8, null, 'P-long', { us: '/ɑː/–/ɔːr/ 与 /ɑː/–/ʌ/（pot / port、hot / hut）' }),
    S('P-ae', '/e/–/æ/（bed / bad）', 'P', 0.8, null, 'P-ae'), S('P-uh', '/ʌ/–/æ/（cup / cap）', 'P', 0.8, null, 'P-ae'),
    S('P-er', '/ɜː/（bird / bed、work / walk）', 'P', 0.8, null, 'P-er', { us: '/ɝː/（bird / bed、work / walk）' }), S('P-glide', '双元音要滑（coat / caught、wait / white）', 'P', 0.8, null, 'P-glide'),
    S('P-th', 'th（think / sink、three / free）', 'P', 0.8, null, 'P-th'), S('P-end', '词尾清浊（cap / cab、bus / buzz）', 'P', 0.8, null, 'P-end'),
    S('P-voice', '词首清浊（pen / Ben、fan / van）', 'P', 0.8, null, 'P-end'), S('P-rl', 'r / l / n（right / light）', 'P', 0.8, null, 'P-cons'),
    S('P-wv', 'w / v（wet / vet）', 'P', 0.8, null, 'P-cons'), S('P-sh', 's / ʃ / tʃ（see / she、chip / ship）', 'P', 0.8, null, 'P-cons'),
    S('P-ng', 'n / ŋ（thin / thing）', 'P', 0.8, null, 'P-cons'), S('P-misc', '其他音对（try / dry、hat / at）', 'P', 0.8, null, 'P-misc'),
    S('P-sym-v', '认音标：单元音', 'P', 0.8, null, 'P-sym'), S('P-sym-d', '认音标：双元音', 'P', 0.8, null, 'P-sym'), S('P-sym-c', '认音标：辅音', 'P', 0.8, null, 'P-sym')
  ].forEach(function (s) { SKILLS[s.id] = s; });
  var GROUP_ZH = { L: '听', R: '读', W: '写', S: '说', V: '词', G: '语法', P: '音' };

  /* ───────────────────────────── pattern cards (§4.11; ≤ 60 Chinese characters each) ───────────────────────────── */
  // action: 'contrast' 连听对比 · 'slow' 慢速 / 逐词慢听 / 再听一遍 · 'model' 听这个词 / 听示范 · null
  function P(title, zh, example, action) { return { title: title, zh: zh, example: example, action: action || null }; }
  var PATTERNS = {
    'L-num': P('十几和几十', '-teen 重音在后、尾音拉长；-ty 重音在前、尾音很短。听到后面拉长的 -teen，就是十几。', 'thirteen / thirty、fifteen / fifty', 'contrast'),
    'L-price': P('价钱', '£3.50 读 three pounds fifty；215 读 two hundred and fifteen，hundred 后面有 and。写数字最稳：3.50。', 'The total is two hundred and fifteen pounds.', 'slow'),
    'L-time': P('钟点', 'past 是"过"，to 是"差"：a quarter past nine = 9:15，a quarter to ten = 9:45；half past six = 6:30。', 'a quarter past nine', 'slow'),
    'L-date': P('日期', '日期说 the fifth of September，写成 5 September 或 September 5（大小写都算对）。', 'The course starts on the fifth of September.', 'slow'),
    'V-spell-cal': P('星期和月份拼写', '九到十二月都以 -ber 结尾；February 有两个 r（Feb-ru-ary）；Wednesday 第一个 d 不发音；Saturday 是 Sat-ur-day。', 'October、February、Saturday', 'model'),
    'V-spell': P('拼写', '按音节拆开写，一段一段对照：to-mor-row（一个 m、两个 r），birth-day，字母一个都不能少。', 'tomorrow、birthday', 'model'),
    'L-weak': P('弱读小词', 'a、the、to、of 在句子里读得又轻又快，要靠语法补出来：the fifth of September 里的 of。', 'the fifth of September', 'slow'),
    'L-end': P('词尾 -s', '词尾的 s、ed 很轻，但意思靠它：the course starts。填空时原文是复数就写复数，少一个 s 整空不得分。', 'starts 的 s', 'slow'),
    'L-rule': P('按说明作答', '先看说明再写：ONE WORD 就只写一个词，on Saturday 算两个词，整空不得分；数字写 3.50，别写 three pounds fifty。', 'Collect on：Saturday（不写 on）', null),
    'L-turn': P('录音里改口', '录音里说了又改（sorry, no…），要写改过之后的那个；听到 sorry、no、actually 就等下一句。', 'On Tuesday—sorry, no. On Thursday.', 'slow'),
    'L-dict': P('整句听写', '先逐词慢听，一个词一个词写；再整句听一遍，补上 a、the、词尾 s 这些小地方。', 'The course starts on the fifth of September.', 'slow'),
    'L-spell': P('听到的词拼对', '听力填空拼错就不给分：先写下来，再按音节对一遍（大小写都算对）。', 'Saturday = Sat-ur-day', 'model'),
    'L-detail': P('听细节', '先读题，圈出要听的东西（星期、钟点、人名）；答案常常在后半句，别听到第一个就写。', 'Is that the tenth of October?', 'slow'),
    'L-letters': P('听字母', '字母要听清：A /eɪ/、E /iː/、I /aɪ/ 最容易混；听到 double 就写两个同样的字母。', 'double L = LL', 'slow'),
    'L-map': P('地图题', '先看图上的起点和方向词：next to、opposite、on the left，再跟着录音走。', 'next to the door', null),
    'P-long': P('长短元音', '长元音嘴型拉长、声音也长：sheep、fool、cart、port；短元音短促放松：ship、full、cut、pot。', 'ship / sheep、full / fool、cut / cart', 'contrast'),
    'P-ae': P('/æ/ 和 /e/、/ʌ/', '/æ/ 嘴角往两边拉、嘴张大：bad、cap；/e/ 嘴张得小一点：bed；/ʌ/ 放松短促：cup。', 'bed / bad、cup / cap', 'contrast'),
    'P-er': P('/ɜː/', '/ɜː/ 嘴唇放松、舌头居中、声音拉长：bird、work；别读成 /e/（bed）或 /ɔː/（walk）。', 'bird / bed、work / walk', 'contrast'),
    'P-glide': P('双元音要滑', '双元音是"滑"过去的两个音：coat 从 o 滑到 u，caught 不滑；wait 从 e 滑到 i。', 'coat / caught、wait / white', 'contrast'),
    'P-th': P('th', 'th 舌尖轻放在上下牙之间送气；不要读成 s、f 或 d：think、three、they。', 'think / sink、three / free、they / day', 'contrast'),
    'P-end': P('清音和浊音', '词尾浊音要带声：cab、buzz、beds，别吞掉也别读成清音；词首 p / b、t / d 听送不送气。', 'cap / cab、bus / buzz、pen / Ben', 'contrast'),
    'P-cons': P('辅音', 'r 舌尖不碰上面、l 碰；w 圆唇、v 上牙碰下唇；sh 比 s 更"嘘"；ng 在舌根。', 'right / light、wet / vet、see / she、thin / thing', 'contrast'),
    'P-misc': P('音对', '先听清这两个词哪里不一样，再跟着读三遍：try / dry、hat / at。', 'try / dry、hat / at', 'contrast'),
    'P-sym': P('认音标', '先看嘴型再发音：把音标卡上的例词读三遍，把音和词连起来记。', 'see /siː/、sit /sɪt/', 'model'),
    'G-pos': P('词性', '动词 = 做什么：work；副词 = 多经常、怎么样：often；名词 = 人、地方、东西：family；形容词 = 什么样：cheap。', 'works、often、family', null),
    'G-svo': P('句子骨架', '英语句子必须有主语 + 谓语；"很便宜"要说 It is cheap.，It 就是"它"。', 'my brithday on → My birthday is in October.', null),
    'G-be': P('am / is / are', 'I am、he / she / it is、we / you / they are；形容词前面要有 be：She is busy.', 'She is busy.', null),
    'G-3sg': P('第三人称 -s', '主语是 he、she、it 或一个人名时，动词加 -s：Lily works.；ch、sh 结尾加 -es：watches。', 'She works in a big company.', null),
    'G-do': P('does / doesn\'t', '问句、否定句里用 does / doesn\'t，后面的动词用原形，不加 s：Does your sister live near here?', 'Does your sister live near here?', null),
    'G-plural': P('名词复数', '大多数词加 -s，x、ch 结尾加 -es：boxes；child → children；furniture 不可数，不加 s。', 'boxes、children', null),
    'G-article': P('a / an / the', '一个人、一样东西前面要有 a / an：I am a student.；看读音：an umbrella、a university；说过的那个用 the。', 'a university student', null),
    'G-prep': P('时间介词', 'on + 星期、日期；in + 月份、年；at + 钟点；周末 at the weekend（英）、on the weekend（美）都对。', 'on Monday、in March、at seven', null),
    'G-pattern': P('五种句型', '先找动词，再看后面要不要宾语：主谓、主谓宾、主系表、主谓双宾、主谓宾补。', 'The kitchen is small.（主系表）', null),
    'V-coll': P('搭配', '英语里词是成对用的，要整块记：pay by card、pay in cash（不说 by cash）、a kilo of apples。', 'He pays in cash.', 'model'),
    'V-mean': P('在句子里认词', '先看前后的词，再想它在这句里说的是哪件事；意思对上了，再记它的拼写。', 'On Friday evening, I relax with my friends.', null),
    'V-topic': P('话题词', '把这个话题的词放进自己的句子里说一遍，比只背中文记得牢。', 'My birthday is in October.', 'model'),
    'W-sent': P('句子完整', '每个句子都要有"谁"和"是 / 做"：my birthday on → My birthday is in October.', 'my brithday on', null),
    'W-spell': P('写作拼写', '写完按音节检查一遍：birth-day、fa-vour-ite，字母一个都不能少。', 'brithday → birthday', null),
    'W-task': P('要点都写到', '题目给了几个要点，就要每个都写到，漏一个 TA 就上不去；写完对着要点一个个打勾。', '"约她周末一起做一件事"这一点没写', null),
    'W-link': P('连接词', '句子之间用 and、but、so、because 连起来：先说事，再说原因或结果。', 'I don\'t work on Saturday, so I can sleep late.', null),
    'W-length': P('字数', '字数不够 TA 就上不去：每个要点写两句，一句说事、一句加一个小细节。', 'at least 30 words', null),
    'R-infer': P('小推断', 'from Monday to Friday = 周一到周五，一共 5 天；数一数，不要只看出现的词。', 'Lily 每周工作几天', null),
    'R-para': P('同义替换', '题目很少照抄原文：closed = not open，flat = apartment；找意思一样的地方，不是找一样的词。', 'Sunday closed ↔ not open on Sunday', null),
    'R-rule': P('只用原文的词', 'ONE WORD ONLY 就只写一个词，而且要用原文里的那个词；意思对但换了词也不给分。', 'flat（原文）≠ apartment', null),
    'R-tfng': P('判断题', '原文说了且一样 = TRUE；原文说了但相反 = FALSE；原文没说 = NOT GIVEN。', 'closed ↔ not open', null),
    'R-detail': P('找细节', '先圈出题目里的关键词（星期、人名、数字），回原文找同一个地方，再读那一句。', 'When does Lily have English classes?', null),
    'R-number': P('读数字', '数字、钟点、价钱要看清是哪一行：平时的开门时间和"只有这周六"的不一样。', 'This Saturday only: we open at 9.15', null),
    'R-match': P('配对', '一条一条对：先看陈述里的关键词，再回原文找是谁说的、谁做的。', 'Which person works on Saturday?', null),
    'S-ext': P('Part 1 的结构', 'Part 1：直接回答 + 一个原因 + 一个小细节，2–4 句就够。', 'I like Saturday best. On Saturday I don\'t work, so I can sleep late.', 'model'),
    'S-flu': P('说得流利', '说慢一点没关系，别停太久；卡住时用 and、so、because 接着说下去。', 'I like Saturday, because …', null),
    'S-intel': P('说清楚', '一个词一个词读清楚，尤其是词尾的 s、t、d；元音拉长还是短促要分清。', 'sheep / ship', 'model'),
    'S-phr': P('用上句型', '把课本句型直接用上：I like … best. / There are … people in my family.', 'I like … best.', 'model')
  };
  // an American-accent learner's name and card where the British ones teach a sound she does not have (no /ɒ/; bird /ɝː/)
  PATTERNS['P-long'].us = P('长短元音', '长元音声音拉长：sheep、fool、cart；短元音短促放松：ship、full、cut。pot 的 /ɑː/ 嘴张大，port 的 /ɔːr/ 圆唇、带 r。', 'ship / sheep、full / fool、cut / cart', 'contrast');
  PATTERNS['P-er'].us = P('/ɝː/', '/ɝː/ 舌头往后卷、带 r、声音拉长：bird、work；别读成 /e/（bed）或 /ɑː/（walk）。', 'bird / bed、work / walk', 'contrast');
  // a skill's name and a pattern card in her accent (the host's accentOf(): anything but 'gb' is American)
  function skillZh(id, acc) { var s = own.call(SKILLS, id) ? SKILLS[id] : null; return s ? (acc !== 'gb' && s.us) || s.zh : own.call(GEN_ZH, id) ? GEN_ZH[id] : /^V-t/.test(id) ? '课程里的词' : /^G-t/.test(id) ? '课程里的语法' : ''; }
  // a course pack's generated sub-skills (topicSub, quizTag) by name, never by id (10-11): V-t… "购物的词", G-t… the step's title
  var GEN_ZH = {};
  function patternCard(id, acc) { var p = own.call(PATTERNS, id) ? PATTERNS[id] : null; return (p && acc !== 'gb' && p.us) || p; }
  // which card for a sub-skill (and target): V-spell on a weekday or month uses the -ber / February card
  function patternOf(sub, target) {
    if (sub === 'V-spell' || sub === 'L-spell') {
      var w = String(target || '').replace(/^w:/, '');
      if (CAL_WORDS[w]) return 'V-spell-cal';
      return 'V-spell';
    }
    var s = SKILLS[sub];
    if (s) return s.pattern || null;
    if (/^V-t/.test(String(sub))) return 'V-topic';
    return null;
  }

  /* ───────────────────────────── the story world (§4.1) ───────────────────────────── */
  var CAST = {
    lily: { id: 'lily', name: 'Lily', zh: '莉莉', role: '室友', voice: 'us', sex: 'f',
      facts: ['works Monday to Friday', 'English class on Monday and Wednesday after work', 'relaxes with friends on Friday evening', 'sleeps late on Saturday', 'calls her parents on Sunday', 'birthday in March', 'loves spring'],
      factsZh: '周一到周五上班；周一、周三下班后上英语课；周五晚上和朋友放松；周六睡懒觉；周日给父母打电话；生日在三月；喜欢春天' },
    leo: { id: 'leo', name: 'Leo', zh: '利奥', role: '月光咖啡馆的咖啡师', voice: 'gb', sex: 'm', facts: ['barista at Moon Café', 'birthday in October'], factsZh: '月光咖啡馆的咖啡师；生日在十月' },
    wood: { id: 'wood', name: 'Mrs Wood', zh: '伍德太太', role: '房东', voice: 'gb', sex: 'f', facts: ['the landlord of Flat 3, 8 Park Street', 'friendly'], factsZh: '房东，很友好' },
    ben: { id: 'ben', name: 'Ben', zh: '本', role: '同学', voice: 'us', sex: 'm', facts: ['a classmate at the language school'], factsZh: '语言学校的同学' },
    clarke: { id: 'clarke', name: 'Ms Clarke', zh: '克拉克老师', role: '英语老师', voice: 'gb', sex: 'f', facts: ['English teacher', 'the course starts on the fifth of September'], factsZh: '英语老师；课程九月五号开始' },
    tom: { id: 'tom', name: 'Tom', zh: '汤姆', role: '邻居', voice: 'gb', sex: 'm', facts: ['neighbour', 'goes to the market near his home every Saturday morning', 'pays in cash'], factsZh: '邻居；每周六早上去家附近的市场，付现金' },
    mia: { id: 'mia', name: 'Mia', zh: '米娅', role: '健康中心的护士', voice: 'us', sex: 'f',
      facts: ['nurse at Park Street Health Centre', 'gets up at six', 'breakfast at half past six', 'forty minutes by bus to work', 'lunch at one', 'walks in the park after work', 'never goes to bed late'],
      factsZh: '护士；六点起床、六点半早饭、坐 40 分钟公交、一点午饭、下班去公园散步、从不晚睡' },
    sam: { id: 'sam', name: 'Sam', zh: '萨姆', role: 'Lily 的朋友，小公司职员', voice: 'us', sex: 'm',
      facts: ['twenty-three', 'a degree in computer science', 'boss is Helen', 'online course on Tuesday and Thursday evening', 'wants to apply for a manager job next year'],
      factsZh: '23 岁；计算机学位；老板是 Helen；周二周四晚上上网课；明年想申请经理' },
    anna: { id: 'anna', name: 'Anna', zh: '安娜', role: '同学，在找房', voice: 'gb', sex: 'f', facts: ['looking for a flat on Green Street', 'one bedroom', 'rent £650 a month'], factsZh: 'Green Street、一室、房租每月 650 英镑' },
    helen: { id: 'helen', name: 'Helen', zh: '海伦', role: 'Sam 的老板', voice: 'gb', sex: 'f', facts: ['Sam\'s boss', 'kind'], factsZh: 'Sam 的老板，人很好' }
  };
  // one-time characters: common, easy to spell; accent alternates (§4.6 #5)
  var NAMES = [
    { name: 'Grace', voice: 'gb', sex: 'f' }, { name: 'Omar', voice: 'us', sex: 'm' }, { name: 'Priya', voice: 'gb', sex: 'f' }, { name: 'Daniel', voice: 'us', sex: 'm' },
    { name: 'Chloe', voice: 'gb', sex: 'f' }, { name: 'Ken', voice: 'us', sex: 'm' }, { name: 'Emma', voice: 'gb', sex: 'f' }, { name: 'Jack', voice: 'us', sex: 'm' },
    { name: 'Hana', voice: 'us', sex: 'f' }, { name: 'Leila', voice: 'gb', sex: 'f' }, { name: 'Noah', voice: 'us', sex: 'm' }, { name: 'Ruby', voice: 'gb', sex: 'f' },
    { name: 'Zoe', voice: 'us', sex: 'f' }, { name: 'Max', voice: 'gb', sex: 'm' }, { name: 'Nina', voice: 'us', sex: 'f' }, { name: 'Oscar', voice: 'gb', sex: 'm' },
    { name: 'Amy', voice: 'us', sex: 'f' }, { name: 'Raj', voice: 'gb', sex: 'm' }, { name: 'Lucy', voice: 'gb', sex: 'f' }, { name: 'Adam', voice: 'us', sex: 'm' }
  ];
  var YOU = { id: 'you', name: 'You', zh: '你', voice: null, sex: 'f' };
  var PLACES = {
    home: { zh: '住处' }, cafe: { zh: '咖啡馆' }, market: { zh: '市场与商店' }, school: { zh: '学校' }, health: { zh: '健康中心' }, work: { zh: '工作' },
    social: { zh: '朋友与家人' }, service: { zh: '生活服务' }, travel: { zh: '出行' }, season: { zh: '天气与节日' }, acad: { zh: '学术' }
  };
  // place names are always allowed in scene text (§4.8)
  var PLACE_NAMES = ['Park Street', 'Green Street', 'King Street', 'Moon Café', 'Moon Cafe', 'Maple Bridge', 'Maple Bridge Language School', 'Park Street Health Centre', 'the Saturday market', 'Singapore'];
  var CHAPTERS = [{ n: 1, zh: '刚到枫桥', weeks: [1] }, { n: 2, zh: '在城里走走', weeks: [2] }, { n: 3, zh: '第一次出门旅行', weeks: [3] }, { n: 4, zh: '正式开学', weeks: [4] }];
  // week n ≥ 5: "第 5 周：……" → the part after the colon
  function chapterOf(n, title) {
    n = Number(n) || 1;
    for (var i = 0; i < CHAPTERS.length; i++) if (CHAPTERS[i].weeks.indexOf(n) >= 0) return { n: CHAPTERS[i].n, zh: CHAPTERS[i].zh };
    var t = String(title || ''), m = /[：:]\s*(.+)$/.exec(t);
    return { n: n, zh: m ? m[1].trim() : (t || '第 ' + n + ' 周') };
  }
  var TOPIC_PLACE = {
    '交通': ['travel'], '出行': ['travel'], '购物': ['market'], '饮食': ['cafe', 'market'], '天气': ['season'], '健康': ['health'], '爱好': ['social'],
    '城市': ['travel'], '自然': ['travel', 'season'], '动物': ['travel'], '旅行': ['travel'], '节日': ['season'], '颜色': ['market'], '形状': ['market'],
    '教育': ['school'], '学习': ['school', 'work'], '工作': ['work'], '科技': ['work', 'school'], '媒体': ['social'], '运动': ['social', 'health'],
    '电影': ['social'], '音乐': ['social'], '社会': ['social'], '家庭生活': ['home', 'social'], '家人': ['social', 'home'], '朋友': ['social'],
    '饮食健康': ['health', 'cafe'], '交通问题': ['travel'], '环境': ['season', 'travel'], '金钱': ['market', 'work'], '住房': ['home'], '租房': ['home'],
    '家': ['home'], '作息': ['home', 'health'], '星期': ['school', 'social'], '月份': ['school', 'social'], '数字': ['market', 'cafe'], '价钱': ['market', 'cafe'],
    '学术': ['acad', 'school']
  };

  /* ───────────────────────────── confusions (§4.7) and paraphrases (§4.6 #9) ───────────────────────────── */
  var CONFUSIONS = {
    teenty: [['thirteen', 'thirty'], ['fourteen', 'forty'], ['fifteen', 'fifty'], ['sixteen', 'sixty'], ['seventeen', 'seventy'], ['eighteen', 'eighty'], ['nineteen', 'ninety']],
    weekday: [['tuesday', 'thursday'], ['saturday', 'sunday'], ['monday', 'sunday']],
    month: [['june', 'july'], ['september', 'november', 'december'], ['october', 'november'], ['march', 'may'], ['january', 'february']],
    time: [['a quarter past nine', 'a quarter to ten'], ['nine fifteen', 'nine fifty']],
    ordinal: [['first', 'third'], ['fifth', 'fifteenth'], ['second', 'seventh']],
    price: [['3.50', '3.15', '13.50']],
    vowel: [['ship', 'sheep'], ['sit', 'seat'], ['full', 'fool'], ['pull', 'pool'], ['bed', 'bad'], ['men', 'man'], ['cup', 'cap'], ['cut', 'cart'], ['hot', 'hut'],
      ['pot', 'port'], ['work', 'walk'], ['bird', 'bed'], ['coat', 'caught']],
    consonant: [['think', 'sink'], ['three', 'free'], ['they', 'day'], ['fan', 'van'], ['few', 'view'], ['coat', 'goat'], ['sip', 'zip'], ['bus', 'buzz'],
      ['right', 'light'], ['thin', 'thing'], ['win', 'wing'], ['wet', 'vet'], ['west', 'vest'], ['yet', 'jet']],
    grammar: [['is', 'are', 'am'], ['work', 'works', 'working'], ['a', 'an', 'the'], ['child', 'children'], ['do', 'does']],
    coll: [['by', 'in', 'with'], ['at', 'on', 'in'], ['a kilo of', 'a bunch of']]
  };
  // expressions that mean the same thing: never an option together, never a distractor for each other; both marked right
  var PARA = [['closed', 'not open'], ['cheap', 'not expensive'], ['flat', 'apartment'], ['from Monday to Friday', 'five days a week'],
    ['Saturday and Sunday', 'the weekend'], ['a quarter past nine', '9:15'], ['mother and father', 'parents'], ['half past six', 'six thirty'],
    ['at the weekend', 'on the weekend'], ['Monday to Friday', 'Monday through Friday']];

  /* ───────────────────────────── core words (§4.8; ~190) ───────────────────────────── */
  var CORE_WORDS = ('a an the i me my you your he him his she her it its we us our they them their this that these those ' +
    'what who where when why how which there here am is are was were be have has had do does did can could will would ' +
    'not no yes please thank thanks hello hi bye sorry ok sure welcome great good nice fine happy ready right wrong same new old big small long little ' +
    'in on at to from of for with by about after before near next until into out up down over under past around than off ' +
    'and but or so because if then also too very only just again now all some any every each many much more most other ' +
    'one two three four five six seven eight nine ten eleven twelve twenty thirty forty fifty sixty seventy eighty ninety ' +
    'o\'clock pm mr mrs ms back come go get see want need like know say tell give take make look let think ask help meet open close start ' +
    'wait buy write read speak talk listen hear love live put sit eat drink play stay ' +
    'name date number phone email message word thing people person man woman boy girl place way lot everyone cafe').split(/\s+/).filter(Boolean);

  /* ───────────────────────────── week-1 tag tables (§3.2, §3.6) ───────────────────────────── */
  // [sub-skill, concept] for each of the 46 grammar and 18 reading questions of week 1 (item ids as Model.buildIndex makes them)
  var W1_QUIZ_TAGS = {
    'q:w1d1:a3:9k4jbu': ['G-pos', 'adj'], 'q:w1d1:a3:n15gmj': ['G-pos', 'v'], 'q:w1d1:a3:9oweb6': ['G-pos', 'adv'], 'q:w1d1:a3:3kdwgu': ['G-pos', 'n'],
    'q:w1d1:a3:cgzmam': ['G-pos', 'prep'], 'q:w1d1:a3:nft400': ['G-pos', 'conj'],
    'q:w1d2:a3:i2nx3o': ['G-svo', 'subj'], 'q:w1d2:a3:7nbur8': ['G-svo', 'verb'], 'q:w1d2:a3:ixg0o0': ['G-svo', 'obj'], 'q:w1d2:a3:at0to6': ['G-svo', 'subj'],
    'q:w1d2:a3:l36pce': ['G-svo', 'complete'], 'q:w1d2:a3:nqg3ar': ['G-svo', 'verb'],
    'q:w1d3:a3:ncczef': ['G-be', 'is'], 'q:w1d3:a3:dtwlc2': ['G-be', 'are'], 'q:w1d3:a3:mv5i4q': ['G-be', 'am'], 'q:w1d3:a3:xe79nq': ['G-be', 'are'],
    'q:w1d3:a3:sfpf1r': ['G-be', 'be-adj'], 'q:w1d3:a3:hv78dp': ['G-be', 'be-q'],
    'q:w1d4:a3:s7djvm': ['G-3sg', 'v-s'], 'q:w1d4:a3:zkjeab': ['G-3sg', 'v-base'], 'q:w1d4:a3:9l8zkd': ['G-3sg', 'v-es'], 'q:w1d4:a3:m4dpfz': ['G-do', 'does-q'],
    'q:w1d4:a3:0r98d6': ['G-do', 'doesnt'], 'q:w1d4:a3:hxa1sz': ['G-3sg', 'v-s'],
    'q:w1d5:a3:6sfvw1': ['G-plural', 'irreg'], 'q:w1d5:a3:38ni59': ['G-article', 'an'], 'q:w1d5:a3:k1gndx': ['G-article', 'a'], 'q:w1d5:a3:vkmirr': ['G-plural', 'uncount'],
    'q:w1d5:a3:lunps9': ['G-article', 'the'], 'q:w1d5:a3:3p09sq': ['G-plural', 'es'],
    'q:w1d6:a3:l4qngx': ['G-pattern', 'svc'], 'q:w1d6:a3:d6b2ag': ['G-pattern', 'svo'], 'q:w1d6:a3:qrkxp7': ['G-pattern', 'svoo'], 'q:w1d6:a3:6cgnt6': ['G-pattern', 'sv'],
    'q:w1d6:a3:h9f1hn': ['G-pattern', 'svoc'], 'q:w1d6:a3:x16mnx': ['G-pattern', 'svc'],
    'q:w1d7:b1:u5inaq': ['G-be', 'is'], 'q:w1d7:b1:pargoj': ['G-3sg', 'v-base'], 'q:w1d7:b1:qvpq99': ['G-3sg', 'has'], 'q:w1d7:b1:bagfce': ['G-article', 'an'],
    'q:w1d7:b1:3p09sq': ['G-plural', 'irreg'], 'q:w1d7:b1:btomj5': ['G-pos', 'adv'], 'q:w1d7:b1:hgkpuk': ['G-pattern', 'svc'], 'q:w1d7:b1:90660y': ['G-do', 'does-q'],
    'q:w1d7:b1:cz3g7e': ['G-be', 'am'], 'q:w1d7:b1:0h3pq6': ['G-plural', 's'],
    'q:w1d1:b2:q:d80br2': ['R-infer', 'range'], 'q:w1d1:b2:q:ip5by8': ['R-detail', 'when'], 'q:w1d1:b2:q:ls39sx': ['R-detail', 'when'],
    'q:w1d2:b2:q:shn21b': ['R-detail', 'when'], 'q:w1d2:b2:q:x3gs7u': ['R-number', 'price'], 'q:w1d2:b2:q:uwhgvx': ['R-detail', 'how'],
    'q:w1d3:b2:q:kxtd46': ['R-number', 'count'], 'q:w1d3:b2:q:4ith5p': ['R-detail', 'what'], 'q:w1d3:b2:q:ky6iyn': ['R-detail', 'when'],
    'q:w1d4:b2:q:7vxe14': ['R-detail', 'where'], 'q:w1d4:b2:q:cfvh84': ['R-number', 'price'], 'q:w1d4:b2:q:qyeynq': ['R-detail', 'not'],
    'q:w1d5:b2:q:zt1pc2': ['R-number', 'time'], 'q:w1d5:b2:q:7kbaei': ['R-number', 'duration'], 'q:w1d5:b2:q:kxapah': ['R-detail', 'what'],
    'q:w1d6:b2:q:cqifg9': ['R-detail', 'what'], 'q:w1d6:b2:q:tns6c7': ['R-detail', 'who'], 'q:w1d6:b2:q:twbzmz': ['R-detail', 'when']
  };
  // the 49 word pairs of week 1 (sorted like Model's ids) → sound-contrast sub-skill
  var W1_PAIR_TAGS = {
    'sheep|ship': 'P-i', 'seat|sit': 'P-i', 'bad|bed': 'P-ae', 'man|men': 'P-ae', 'cap|cup': 'P-uh', 'cart|cut': 'P-a', 'hot|hut': 'P-o', 'port|pot': 'P-o',
    'fool|full': 'P-u', 'pool|pull': 'P-u', 'bed|bird': 'P-er', 'walk|work': 'P-er', 'wait|white': 'P-glide', 'boy|buy': 'P-glide', 'thirteen|thirty': 'L-num', 'fifteen|fifty': 'L-num',
    'caught|coat': 'P-glide', 'hair|here': 'P-glide', 'Ben|pen': 'P-voice', 'buy|pie': 'P-voice', 'die|tie': 'P-voice', 'down|town': 'P-voice', 'cab|cap': 'P-end', 'bad|bat': 'P-end',
    'coat|goat': 'P-voice', 'fan|van': 'P-voice', 'few|view': 'P-voice', 'sink|think': 'P-th', 'free|three': 'P-th', 'day|they': 'P-th', 'sip|zip': 'P-voice', 'bus|buzz': 'P-end',
    'see|she': 'P-sh', 'ship|sip': 'P-sh', 'chip|ship': 'P-sh', 'cheap|jeep': 'P-voice', 'lice|rice': 'P-rl', 'light|right': 'P-rl', 'dry|try': 'P-misc', 'at|hat': 'P-misc',
    'beds|bets': 'P-end', 'sun|sung': 'P-ng', 'thin|thing': 'P-ng', 'win|wing': 'P-ng', 'light|night': 'P-rl', 'vet|wet': 'P-wv', 'vest|west': 'P-wv', 'jet|yet': 'P-misc',
    'vine|wine': 'P-wv'
  };
  // hand-made collocations of week 1 (§3.2): the step where each first appears is its home
  var W1_COLL = [
    { en: 'at the weekend', zh: '在周末', type: 'time', home: 'w1d1:b1' },
    { en: 'on Monday', zh: '在周一', type: 'time', home: 'w1d1:b1' },
    { en: 'in March', zh: '在三月', type: 'time', home: 'w1d1:b1' },
    { en: 'go to an English class', zh: '去上英语课', type: 'verb', home: 'w1d1:b2' },
    { en: 'call my parents', zh: '给我父母打电话', type: 'verb', home: 'w1d1:b2' },
    { en: 'on Friday evening', zh: '在周五晚上', type: 'time', home: 'w1d1:b2' },
    { en: 'relax with my friends', zh: '和朋友们放松一下', type: 'verb', home: 'w1d1:b2' },
    { en: 'pay by card', zh: '刷卡付款', type: 'pay', home: 'w1d2:b1' },
    { en: 'pay in cash', zh: '用现金付款', type: 'pay', home: 'w1d2:b2' },
    { en: 'have a discount', zh: '打折', type: 'verb', home: 'w1d2:b2' },
    { en: 'have dinner together', zh: '一起吃晚饭', type: 'verb', home: 'w1d3:b1' },
    { en: 'be kind to', zh: '对……好', type: 'verb', home: 'w1d3:b2' },
    { en: 'look for a flat', zh: '找房子', type: 'verb', home: 'w1d4:b2' },
    { en: 'a month', zh: '每月（房租五百英镑一个月）', type: 'rate', home: 'w1d4:b1' },
    { en: 'at seven', zh: '在七点', type: 'time', home: 'w1d5:b1' },
    { en: 'in the morning', zh: '在早上', type: 'time', home: 'w1d5:b1' },
    { en: 'get up early', zh: '早起', type: 'verb', home: 'w1d5:b2' },
    { en: 'go to work by bus', zh: '坐公交上班', type: 'verb', home: 'w1d5:b2' },
    { en: 'have lunch with', zh: '和……一起吃午饭', type: 'verb', home: 'w1d3:c1' },
    { en: 'have an interview', zh: '有个面试', type: 'verb', home: 'w1d6:b1' },
    { en: 'take an online course', zh: '上网课', type: 'verb', home: 'w1d6:b2' },
    { en: 'apply for a job', zh: '申请一份工作', type: 'verb', home: 'w1d6:b2' }
  ];

  /* ───────────────────────────── word lists behind the parameter types (week 1; §4.4) ───────────────────────────── */
  var WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  var MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  var WD_ZH = { monday: '周一', tuesday: '周二', wednesday: '周三', thursday: '周四', friday: '周五', saturday: '周六', sunday: '周日' };
  var MO_ZH = { january: '一月', february: '二月', march: '三月', april: '四月', may: '五月', june: '六月', july: '七月', august: '八月', september: '九月', october: '十月', november: '十一月', december: '十二月' };
  var CAL_WORDS = {};
  WEEKDAYS.concat(MONTHS).forEach(function (w) { CAL_WORDS[w] = 1; });
  var NUM_WORDS = { thirteen: 13, thirty: 30, fifteen: 15, fifty: 50, hundred: 100, thousand: 1000, million: 1000000 };
  var MONEY_WORDS = { price: 1, cost: 1, cheap: 1, expensive: 1, pay: 1, cash: 1, card: 1, pound: 1, dollar: 1, discount: 1, total: 1 };
  var TIME_WORDS = { half: 1, quarter: 1, hour: 1, minute: 1, second: 1 };
  var ORD_WORDS = { first: 1, second: 1, third: 1 };
  // topic word lists for the typed slots (value = the word; Chinese comes from the course index, else this table)
  var LISTS = {
    verb1: [['work', '工作'], ['cook', '做饭'], ['relax', '放松']],
    verb: [['work', '工作'], ['cook', '做饭'], ['clean', '打扫'], ['study', '学习'], ['sleep', '睡觉'], ['relax', '放松'], ['exercise', '锻炼'], ['walk', '散步']],
    freq: [['often', '经常'], ['usually', '通常'], ['always', '总是'], ['sometimes', '有时'], ['never', '从不']],
    drink: [['tea', '茶'], ['coffee', '咖啡']],
    // one natural word each: the value is read inside sentences ("我姐姐结婚了"), not as a dictionary gloss
    family: [['mother', '妈妈'], ['father', '爸爸'], ['sister', '姐姐'], ['brother', '哥哥'], ['grandmother', '奶奶'], ['grandfather', '爷爷'],
      ['aunt', '阿姨'], ['uncle', '叔叔'], ['cousin', '表姐'], ['friend', '朋友'], ['neighbour', '邻居']],
    room: [['kitchen', '厨房'], ['bedroom', '卧室'], ['bathroom', '浴室'], ['living room', '客厅'], ['garden', '花园']],
    furniture: [['sofa', '沙发'], ['desk', '书桌'], ['window', '窗户'], ['door', '门']],
    routine: [['get up', '起床'], ['breakfast', '早餐'], ['lunch', '午餐'], ['dinner', '晚餐'], ['shower', '淋浴']],
    job: [['teacher', '老师'], ['student', '学生'], ['manager', '经理'], ['boss', '老板'], ['colleague', '同事']],
    subject: [['English', '英语'], ['course', '课程'], ['class', '课'], ['lesson', '课'], ['exam', '考试'], ['homework', '家庭作业']],
    // said after 很 / 真 / 特别 ("它很安静"), so no 的
    adj: [['cheap', '便宜'], ['expensive', '贵'], ['quiet', '安静'], ['noisy', '吵'], ['comfortable', '舒服'], ['busy', '忙'], ['free', '有空'],
      ['kind', '善良'], ['funny', '有趣'], ['married', '已婚']],
    meal: [['breakfast', '早餐'], ['lunch', '午餐'], ['dinner', '晚餐']],
    neighq: [['Do you have a big family?', '你家人多吗？'], ['Who do you live with?', '你和谁一起住？'], ['Do you like this street?', '你喜欢这条街吗？']],
    fruit: [['apples', '苹果'], ['bananas', '香蕉'], ['oranges', '橙子']],
    paym: [['card', '卡'], ['cash', '现金']],
    major: [['business', '商科'], ['English', '英语'], ['computer science', '计算机科学']],
    jobq: [['Why do you want this job?', '你为什么想要这份工作？'], ['What skills do you have?', '你有哪些技能？'], ['Do you have any experience?', '你有相关的经验吗？']],
    event: [['interview', '面试'], ['exam', '考试'], ['lesson', '课']],
    city: [['London', '伦敦'], ['Singapore', '新加坡'], ['Maple Bridge', '枫桥']],
    colour: [['red', '红色'], ['blue', '蓝色'], ['yellow', '黄色'], ['green', '绿色'], ['white', '白色']],
    // later weeks' topics (§4.3's 16 scenes that wait for weeks 2–10): shopping, food, weather, places in town, films
    food: [['eggs', '鸡蛋'], ['bread', '面包'], ['milk', '牛奶'], ['rice', '米'], ['cheese', '奶酪']],
    weather: [['sunny', '晴天'], ['rainy', '下雨'], ['cloudy', '多云'], ['windy', '刮风']],
    townp: [['bank', '银行'], ['post office', '邮局'], ['supermarket', '超市'], ['station', '车站']],
    campus: [['library', '图书馆'], ['café', '咖啡馆'], ['office', '办公室'], ['computer room', '电脑室']],
    genre: [['a comedy', '喜剧'], ['an action film', '动作片'], ['a cartoon', '动画片']],
    loc: [['park', '公园'], ['station', '车站'], ['market', '市场']],
    stname: [['Park Street', '公园街'], ['Green Street', '格林街'], ['King Street', '国王街']],
    cafeq: [['Do you like tea or coffee? Why?', '你喜欢茶还是咖啡？为什么？'], ['Do you often have coffee with friends?', '你常和朋友一起喝咖啡吗？']],
    opener: [['Where are you from?', '你是哪里人？'], ['Do you work or are you a student?', '你是上班还是读书？'], ['Can you tell me your full name, please?', '请告诉我你的全名。'],
      ['What do you like to do at the weekend?', '你周末喜欢做什么？'], ['Do you like your English class?', '你喜欢你的英语课吗？']]
  };
  // a pair word said in a short sentence (§3.6 lv 2: "LP 句中"); both words of a pair need one for the sentence form
  var PAIR_SENT = {
    cup: ['Here\'s your cup of tea.', '这是你的一杯茶。'], cap: ['Here\'s your cap.', '这是你的帽子。'],
    ship: ['Look at that big ship!', '看那艘大船！'], sheep: ['Look at that big sheep!', '看那只大羊！'],
    sit: ['Please sit here.', '请坐这儿。'], seat: ['This is my seat.', '这是我的座位。'],
    bed: ['My bed is big.', '我的床很大。'], bad: ['It\'s not bad.', '还不错。'],
    men: ['Can you see the men by the door?', '你看见门边那几个男人了吗？'], man: ['Can you see the man by the door?', '你看见门边那个男人了吗？'],
    cut: ['Can you cut it, please?', '你能把它切开吗？'], cart: ['Put it in the cart, please.', '请把它放进手推车里。'],
    hot: ['The tea is hot.', '茶很烫。'], hut: ['There\'s a hut in the park.', '公园里有一间小屋。'],
    pot: ['The pot is hot.', '锅很烫。'], port: ['The ship is in the port.', '船在港口里。'],
    thirteen: ['It\'s thirteen.', '是十三。'], thirty: ['It\'s thirty.', '是三十。'], fifteen: ['It\'s fifteen.', '是十五。'], fifty: ['It\'s fifty.', '是五十。']
  };
  // An American-accent learner (the host's accentOf() is 'us' unless the profile says 'gb') sees the symbols as the host writes
  // them for her: the host's SYM_US (first column) where it differs; '' = American English has no such sound (hot is /hɑːt/),
  // so it is never asked. /iː/, /ɑː/, /ɔː/ … are the same in the host's American transcriptions (Cambridge style: see /siː/).
  var SYM_US = { 'ɒ': '', 'ɜː': 'ɝː', 'əʊ': 'oʊ', 'ɪə': 'ɪr', 'eə': 'er', 'ʊə': 'ʊr' };
  // the symbol cards' example words in American English, where they differ (the host's US_IPA): a PS option must not have the
  // asked sound in her accent (hot → /hɑːt/ has the /ɑː/ of car)
  var EX_US = {
    car: 'kɑːr', park: 'pɑːrk', father: 'ˈfɑːðɚ', hot: 'hɑːt', dog: 'dɑːɡ', box: 'bɑːks', door: 'dɔːr', four: 'fɔːr', talk: 'tɑːk', bird: 'bɝːd', work: 'wɝːk',
    learn: 'lɝːn', teacher: 'ˈtiːtʃɚ', banana: 'bəˈnænə', go: 'ɡoʊ', home: 'hoʊm', phone: 'foʊn', here: 'hɪr', near: 'nɪr', ear: 'ɪr', hair: 'her', chair: 'tʃer',
    where: 'wer', tour: 'tʊr', poor: 'pʊr', sure: 'ʃʊr', stop: 'stɑːp', paper: 'ˈpeɪpɚ', job: 'dʒɑːb', coffee: 'ˈkɑːfi', mother: 'ˈmʌðɚ', sister: 'ˈsɪstɚ',
    nose: 'noʊz', shop: 'ʃɑːp', measure: 'ˈmeʒɚ', hello: 'heˈloʊ', orange: 'ˈɔːrɪndʒ', January: 'ˈdʒænjueri', driver: 'ˈdraɪvɚ', cards: 'kɑːrdz', summer: 'ˈsʌmɚ',
    no: 'noʊ', know: 'noʊ', long: 'lɑːŋ', ball: 'bɑːl', water: 'ˈwɑːɾɚ', yellow: 'ˈjeloʊ'
  };

  /* ───────────────────────────── parameter types (§4.4) ───────────────────────────── */
  // A value is a short string; say / digits / zh / words know how to show it. Time values: 'HH:MM' + style
  // (q = a quarter past / to, h = half past, o = o'clock, d = digital "nine fifteen", '' = bare hour "seven").
  function parseTime(v) {
    var m = /^(\d{1,2}):(\d{2})([qhod]?)$/.exec(String(v));
    return m ? { h: Number(m[1]), m: Number(m[2]), s: m[3] } : null;
  }
  function h12(h) { var x = h % 12; return x === 0 ? 12 : x; }
  function timeSay(v) {
    var t = parseTime(v);
    if (!t) return String(v);
    if (t.s === 'q') return t.m === 15 ? 'a quarter past ' + numWord(h12(t.h)) : 'a quarter to ' + numWord(h12(t.h + 1));
    if (t.s === 'h') return 'half past ' + numWord(h12(t.h));
    if (t.s === 'o') return numWord(h12(t.h)) + ' o\'clock';
    if (t.m === 0) return numWord(h12(t.h));
    return numWord(h12(t.h)) + ' ' + (t.m < 10 ? 'oh ' + numWord(t.m) : numWord(t.m));
  }
  function timeDigits(v) {
    var t = parseTime(v);
    if (!t) return String(v);
    return h12(t.h) + '.' + (t.m < 10 ? '0' : '') + t.m + (t.h < 12 ? ' am' : ' pm');
  }
  function zhHour(h) { return h === 2 ? '两' : zhNum(h); }         // 两点, not 二点
  function timeZh(v) {
    var t = parseTime(v);
    if (!t) return String(v);
    var hh = zhHour(h12(t.h)) + '点';
    if (t.s === 'q') return t.m === 15 ? hh + '一刻' : '差一刻' + zhHour(h12(t.h + 1)) + '点';
    if (t.s === 'h') return hh + '半';
    if (t.m === 0) return hh;
    return hh + zhNum(t.m) + (t.m < 10 ? '分' : '');
  }
  function priceParts(v) { var x = Number(v); var p = Math.floor(x + 1e-9), c = Math.round((x - p) * 100); return { p: p, c: c }; }
  function priceSay(v) {
    var q = priceParts(v);
    if (!q.c) return numWord(q.p) + (q.p === 1 ? ' pound' : ' pounds');
    return numWord(q.p) + (q.p === 1 ? ' pound ' : ' pounds ') + numWord(q.c);
  }
  function priceDigits(v) { var q = priceParts(v); return '£' + q.p + (q.c ? '.' + (q.c < 10 ? '0' : '') + q.c : ''); }
  function priceZh(v) { var q = priceParts(v); return q.p + (q.c ? '.' + (q.c < 10 ? '0' : '') + q.c : '') + ' 英镑'; }

  // Each type: vals(ctx) → candidate values; say / digits / zh / ord / words; dist(v) → confusable values first.
  var PARAMS = {
    weekday: { vals: function () { return WEEKDAYS.slice(); }, say: cap1, digits: cap1, zh: function (v) { return WD_ZH[v] || v; }, words: function (v) { return [v]; },
      dist: function (v) { return confuse('weekday', v).concat(WEEKDAYS.filter(function (x) { return x !== v; })); }, cal: 'weekday' },
    month: { vals: function () { return MONTHS.slice(); }, say: cap1, digits: cap1, zh: function (v) { return MO_ZH[v] || v; }, words: function (v) { return [v]; },
      dist: function (v) { return confuse('month', v).concat(MONTHS.filter(function (x) { return x !== v; })); }, cal: 'month' },
    dom: { vals: function () { var o = []; for (var i = 1; i <= 28; i++) o.push(String(i)); return o; }, say: function (v) { return ordWord(v); }, digits: function (v) { return ordDigits(v); },
      zh: function (v) { return zhNum(v); }, words: function () { return []; }, dist: function (v) { var n = Number(v), o = []; [n + 7, n - 7, n + 1, n - 1, n + 10].forEach(function (x) { if (x >= 1 && x <= 28) o.push(String(x)); }); return o; }, cal: 'dom' },
    time: { vals: function () {
      var o = [];
      [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20].forEach(function (h) {
        o.push(pad2(h) + ':00o', pad2(h) + ':00', pad2(h) + ':15q', pad2(h) + ':45q', pad2(h) + ':30h', pad2(h) + ':15d', pad2(h) + ':30d', pad2(h) + ':45d');
      });
      return o;
    }, say: timeSay, digits: timeDigits, zh: timeZh, words: function (v) { return tokens(timeSay(v)); },
      dist: function (v) {
        var t = parseTime(v); if (!t) return [];
        var o = [];
        if (t.s === 'q') o.push(pad2(t.m === 15 ? t.h : t.h) + ':' + (t.m === 15 ? '45' : '15') + 'q');
        if (t.s === 'd' && (t.m === 15 || t.m === 50)) o.push(pad2(t.h) + ':' + (t.m === 15 ? '50' : '15') + 'd');
        o.push(pad2(t.h + 1) + ':' + pad2(t.m) + t.s, pad2(t.h - 1) + ':' + pad2(t.m) + t.s);
        if (t.s === 'q' || t.s === 'h') o.push(pad2(t.h) + ':00o');
        return o.filter(function (x) { var p = parseTime(x); return p && p.h >= 6 && p.h <= 21 && !(p.s === 'q' && p.m !== 15 && p.m !== 45); });
      } },
    price: { vals: function () {
      var o = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '12', '13', '14', '15', '16', '17', '18', '19', '20', '30', '40', '50', '60', '70', '80', '90',
        '1.50', '2.50', '3.50', '4.50', '13.50', '15.50', '3.15', '5.15', '650', '500', '215', '450', '550', '600', '700', '750', '850', '950'];
      return o;
    }, say: priceSay, digits: priceDigits, zh: priceZh, words: function (v) { return tokens(priceSay(v)); },
      dist: function (v) {
        var q = priceParts(v), o = [];
        var tt = { 13: 30, 30: 13, 14: 40, 40: 14, 15: 50, 50: 15, 16: 60, 60: 16, 17: 70, 70: 17, 18: 80, 80: 18, 19: 90, 90: 19 };
        // a rent: six hundred and fifty → six hundred and fifteen, five hundred and sixty, seven / five hundred and fifty
        if (q.p >= 100 && !q.c) {
          var hh = Math.floor(q.p / 100), rr = q.p % 100, t10 = Math.floor(rr / 10);
          if (tt[rr] != null) o.push(String(hh * 100 + tt[rr]));
          if (t10 && t10 !== hh && rr % 10 === 0) o.push(String(t10 * 100 + hh * 10));
          o.push(String((hh + 1) * 100 + rr), String(Math.max(1, hh - 1) * 100 + rr));
          return o.filter(function (x) { return x !== v; });
        }
        if (tt[q.p] != null) o.push(fmtPrice(tt[q.p], q.c));
        if (q.c === 50) o.push(fmtPrice(q.p, 15)); if (q.c === 15) o.push(fmtPrice(q.p, 50));
        if (q.p < 10 && q.c) o.push(fmtPrice(q.p + 10, q.c));
        o.push(fmtPrice(q.p + 1, q.c), fmtPrice(Math.max(1, q.p - 1), q.c), fmtPrice(q.p * 2, q.c));
        return o.filter(function (x) { return x !== v; });
      } },
    count: { vals: function () { return ['2', '3', '4', '5', '6', '7', '8']; }, say: function (v) { return numWord(v); }, digits: String, zh: function (v) { return Number(v) === 2 ? '两' : zhNum(v); }, words: function () { return []; },
      dist: function (v) { var n = Number(v); return [String(n + 1), String(n - 1), String(n + 2)].filter(function (x) { return Number(x) >= 1; }); } },
    teenty: { vals: function () { return ['13', '14', '15', '16', '17', '18', '19', '30', '40', '50', '60', '70', '80', '90']; }, say: function (v) { return numWord(v); }, digits: String,
      zh: function (v) { return zhNum(v); }, words: function () { return []; },
      dist: function (v) {
        // the teen / ty partner first (nineteen → ninety), then the nearest of its own kind (nineteen → eighteen, seventeen)
        var n = Number(v), tt = n < 20 ? (n - 10) * 10 : n / 10 + 10, own = n < 20 ? [13, 14, 15, 16, 17, 18, 19] : [30, 40, 50, 60, 70, 80, 90];
        return [String(tt)].concat(own.filter(function (x) { return x !== n; }).sort(function (a, b) { return Math.abs(a - n) - Math.abs(b - n) || a - b; }).map(String));
      } },
    street: { vals: function () { var o = []; ['Park Street', 'Green Street', 'King Street'].forEach(function (s) { [3, 5, 8, 12, 13, 15, 17, 30, 50].forEach(function (n) { o.push(n + ' ' + s); }); }); return o; },
      say: function (v) { var m = /^(\d+) (.+)$/.exec(v); return m ? numWord(m[1]) + ' ' + m[2] : v; }, digits: String,
      zh: function (v) { var m = /^(\d+) (.+)$/.exec(v); var z = { 'Park Street': '公园街', 'Green Street': '格林街', 'King Street': '国王街' }; return m ? (z[m[2]] || m[2]) + ' ' + m[1] + ' 号' : v; },
      words: function () { return []; }, dist: function (v) { var m = /^(\d+) (.+)$/.exec(v); if (!m) return []; var n = Number(m[1]); var tt = { 13: 30, 30: 13, 15: 50, 50: 15, 17: 70 }; return [(tt[n] || n + 1) + ' ' + m[2], (n + 10) + ' ' + m[2]]; } },
    pair: { word: true }, sym: { word: true }, word: { word: true }, dsent: { sent: true }, xsent: { sent: true }, wsent: { sent: true }, speakq: { sent: true },
    coll: { word: true }
  };
  ['verb1', 'verb', 'freq', 'drink', 'family', 'room', 'furniture', 'routine', 'job', 'subject', 'adj', 'opener', 'cafeq', 'meal', 'stname', 'neighq', 'fruit', 'paym', 'major', 'jobq', 'event', 'city', 'colour', 'food', 'weather', 'townp', 'campus', 'genre', 'loc'].forEach(function (k) {
    PARAMS[k] = { list: k, vals: function () { return LISTS[k].map(function (x) { return x[0]; }); }, say: String, digits: String,
      zh: function (v) { for (var i = 0; i < LISTS[k].length; i++) if (LISTS[k][i][0] === v) return LISTS[k][i][1]; return ''; },
      words: function (v) { return tokens(v); }, dist: function (v) { return LISTS[k].map(function (x) { return x[0]; }).filter(function (x) { return x !== v; }); } };
  });
  function pad2(n) { n = Number(n); return (n < 10 ? '0' : '') + n; }
  function fmtPrice(p, c) { return String(p) + (c ? '.' + (c < 10 ? '0' : '') + c : ''); }
  function confuse(cls, v) {
    var out = [];
    (CONFUSIONS[cls] || []).forEach(function (g) { if (g.indexOf(v) >= 0) g.forEach(function (x) { if (x !== v && out.indexOf(x) < 0) out.push(x); }); });
    return out;
  }
  function tokens(s) { return String(s || '').toLowerCase().replace(/[’]/g, '\'').split(/[^a-z0-9'£.-]+/).filter(function (t) { return t && /[a-z]/.test(t); }); }

  /* ───────────────────────────── scenes (§4.3; data format §4.4) ───────────────────────────── */
  // Line = [role, en, zh]; a role is a scene role letter (A, B, C), a cast id, or 'you'. zh is shown after she answers.
  var SCENES = [];
  function scene(s) { SCENES.push(s); return s; }
  var GENERIC = [], COLL_FRAMES = [];
  //  —— scenes that need only day 1 of week 1 ——
  scene({
    id: 'school-library-card', v: 1, zh: '图书馆办卡', place: 'school', tier: 1, ch: 1, needs: ['w1d1:a2'], roles: { A: '@pool', B: 'ben' }, ielts: ['L1'],
    gloss: { library: '图书馆', card: '卡' },
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-date', 'V-spell'], at: '学校前台', slots: { d: 'weekday', m: 'month', n: 'dom' }, cal: ['d', 'm', 'n'], not: { d: ['sunday'] }, bind: ['m', 'd'],
        limit: { words: 1, num: true },
        alt: [
          [['A', 'Hi, {B}. You can get your library card on {d}.', '嗨，{B}。你{d.zh}可以来拿图书证。'],
            ['B', 'On {d}? Is that the {n} of {m}?', '{d.zh}？是{m.zh}{n.zh}号吗？'],
            ['A', 'Yes. {d}, the {n} of {m}.', '对，{d.zh}，{m.zh}{n.zh}号。']],
          [['B', 'Hello. When can I get my library card?', '你好。我什么时候能拿到图书证？'],
            ['A', 'On {d~}—sorry, no. On {d}. {d}, the {n} of {m}.', '{d~.zh}——不对，抱歉。{d.zh}。{m.zh}{n.zh}号，{d.zh}。']],
          [['A', 'Your library card is ready, {B}. Come on {d}, the {n} of {m}.', '{B}，你的图书证好了。{m.zh}{n.zh}号{d.zh}来拿吧。'],
            ['B', 'The {n} of {m}? Great, thank you!', '{m.zh}{n.zh}号？太好了，谢谢！']]],
        form: { title: ['Library card', '图书证'], rows: [['Name', '姓名', '{B}'], ['Collect on', '取卡日', '?d'], ['Date', '日期', '{n#} ?m']] },
        q: { zh: '帮 {B} 把图书证的表格填完' } },
      { f: 'LC', k: 'lc', subs: ['L-date', 'L-detail'], at: '学校前台', slots: { d: 'weekday' }, not: { d: ['sunday'] }, bind: ['d'],
        alt: [
          [['A', 'Your card is ready on {d}, {B}.', '{B}，你的卡{d.zh}就好了。'], ['B', 'Great, thank you!', '太好了，谢谢！']],
          [['B', 'Is my card ready on {d~}?', '我的卡{d~.zh}能好吗？'], ['A', 'No, sorry. It\'s ready on {d}.', '不行，抱歉。{d.zh}才好。']]],
        q: { en: 'When can {B} get the card?', zh: '{B} 哪天可以拿卡？' }, opts: ['{d}', '{d~}', '{d~}'] },
      { f: 'VG', k: 'vg', subs: ['V-spell', 'V-cal'], at: '手机消息', slots: { m: 'month', n: 'dom' }, cal: ['m', 'n'], bind: ['m'],
        msg: ['B', 'I have my library card now! My English class starts on the {n#} of ?m.', '我拿到图书证了！我的英语课 ____ {n.zh}号开始。'],
        q: { zh: '{B} 发来一条消息，有一个词没打出来。听一听，把它写上。' }, say: [['B', '{m}', '{m.zh}']] }
    ]
  });
  scene({
    id: 'home-fridge-note', v: 1, zh: 'Lily 的冰箱便条', place: 'home', tier: 1, ch: 1, needs: ['w1d1:a2'], roles: { A: 'lily' }, ielts: ['x'],
    gloss: { visit: '看望' },
    frames: [
      { f: 'VS', k: 'vs', subs: ['V-spell'], at: '厨房冰箱上', slots: { m: 'month' }, bind: ['m'],
        alt: [[['A', 'My parents visit me every ?m. 🎈 — {A}', '我爸妈每年 ____ 来看我。🎈 ——{A}']], [['A', 'My English exam is in ?m! 📚 — {A}', '我的英语考试在 ____ ！📚 ——{A}']],
          [['A', 'I love ?m. It\'s my favourite month. 🌸 — {A}', '我很喜欢 ____ 。它是我最喜欢的月份。🌸 ——{A}']]], msgFromAlt: true, glossAdd: { exam: '考试' },
        q: { zh: '便条上有一个词被咖啡弄脏了，只看得见音标。听一听，把它拼出来。' }, say: [['A', '{m}', '{m.zh}']] },
      { f: 'VS', k: 'vs-d', subs: ['V-spell'], at: '厨房冰箱上', slots: { d: 'weekday' }, bind: ['d'], not: { d: ['monday', 'wednesday'] },
        alt: [[['A', 'No English class on ?d! 🎉 — {A}', '____没有英语课！🎉 ——{A}']], [['A', 'Tea with Ben on ?d? ☕ — {A}', '____和 Ben 喝茶？☕ ——{A}']]], msgFromAlt: true,
        q: { zh: '便条上有一个词只剩音标。听一听，把它拼出来。' }, say: [['A', '{d}', '{d.zh}']] },
      { f: 'VG', k: 'vg', subs: ['V-spell', 'V-cal'], at: '厨房冰箱上', slots: { d0: 'weekday', d: 'weekday' }, derive: { d0: ['prev', 'd'] }, bind: ['d'],
        msg: ['A', 'Today is {d0}, so tomorrow is ?d. — {A}', '今天{d0.zh}，所以明天是 ____ 。——{A}'],
        q: { zh: '{A} 在冰箱上留了一张便条，最后一个词没写完。把它写上。' }, say: [['A', '{d}', '{d.zh}']] }
    ]
  });
  scene({
    id: 'cafe-order', v: 1, zh: '在月光咖啡馆点一杯茶', place: 'cafe', tier: 1, ch: 1, needs: ['w1d1:b3'], roles: { A: 'leo' }, ielts: ['L1'], gloss: {},
    frames: [
      { f: 'LP', k: 'lp', subs: [], at: '月光咖啡馆', slots: { p: 'pair' }, bind: ['p'], only: { p: ['cap|cup'] },
        alt: [[['A', '{p:sent}', '{p:sent.zh}']], [['A', 'Is this your {p}?', '这是你的{p.zh}吗？']], [['A', 'Here\'s your {p}. Have a nice day!', '这是你的{p.zh}。祝你今天愉快！']]],
        q: { zh: '{A} 把东西递给你，说了一句话。他说的是哪个词？' }, opts: ['{p}', '{p~}'], optZh: true },
      { f: 'SP', k: 'sp', subs: ['S-ext'], at: '月光咖啡馆', slots: { o: 'cafeq' }, bind: [],
        say: [['A', '{o}', '{o.zh}']], q: { zh: 'Leo 一边做茶一边和你聊天。说 2–3 句：回答 + 一个原因。' } }
    ]
  });
  scene({
    id: 'school-voicemail', v: 1, zh: 'Ms Clarke 的语音留言', place: 'school', tier: 1, ch: 1, needs: ['w1d1:b1'], roles: { A: 'clarke' }, ielts: ['L1'], gloss: {},
    frames: [
      { f: 'LD', k: 'ld', subs: ['L-dict'], at: '语音信箱', slots: { s: 'dsent' }, bind: ['s'], fit: 'course|class|starts|opens|exam|homework|lesson',
        say: [['A', '{s}', '{s.zh}']], q: { zh: '{A} 在语音留言里说了一句话。把这句话听写下来。' } },
      { f: 'LN', k: 'ln', subs: ['L-date', 'L-detail'], at: '语音信箱', slots: { d: 'weekday' }, not: { d: ['sunday'] }, bind: ['d'], limit: { words: 1, num: true },
        alt: [
          [['A', 'Hello, it\'s Ms Clarke. This week, our English class is on {d}, not {d~}.', '你好，我是克拉克老师。这周我们的英语课在{d.zh}，不是{d~.zh}。']],
          [['A', 'Hi, it\'s Ms Clarke. No class on {d~} this week. See you on {d}!', '嗨，我是克拉克老师。这周{d~.zh}没课。{d.zh}见！']]],
        notes: { title: ['English class this week', '本周英语课'], rows: [['Day', '星期', '?d']] },
        q: { zh: '听 {A} 的留言，把笔记补完整' } }
    ]
  });
  scene({
    id: 'social-birthday', v: 1, zh: '朋友的生日派对邀请', place: 'social', tier: 1, ch: 1, needs: ['w1d1:a2'], roles: { A: 'lily', C: '@pool' }, ielts: ['RG1', 'W1'],
    gloss: { party: '派对' },
    frames: [
      { f: 'RN', k: 'rn', subs: ['R-detail', 'L-date'], at: '手机消息', slots: { d: 'weekday', m: 'month', n: 'dom' }, cal: ['d', 'm', 'n'], bind: ['m', 'd'],
        text: { kind: 'message', title: ['Message from Lily', 'Lily 的消息'],
          lines: [['Hi! {C}\'s birthday is on {d}, the {n#} of {m}.', '嗨！{C} 的生日在{m.zh}{n.zh}号{d.zh}。'], ['There is a party in the evening. Can you come? 🎂', '晚上有个派对。你能来吗？🎂']] },
        items: [
          { f: 'RN', subs: ['R-detail', 'L-date'], on: 'm', q: { en: 'Which month is {C}\'s birthday in?', zh: '{C} 的生日在几月？' }, opts: ['{m}', '{m~}', '{m~}'] },
          { f: 'RN', subs: ['R-detail', 'L-date'], on: 'd', q: { en: 'Which day is the party?', zh: '派对在星期几？' }, opts: ['{d}', '{d~}', '{d~}'] },
          { f: 'RT', subs: ['R-tfng', 'R-infer'], on: 'd', stmt: { en: 'The party is in the morning.', zh: '派对在上午。' }, truth: 'F', glossAdd: { morning: '早上' } }] },
      { f: 'WT', k: 'wt', subs: ['W-sent'], at: '手机消息', slots: { s: 'xsent' }, bind: ['s'], fit: 'birthday',
        alt: [[['A', 'When is your birthday? 🎂', '你的生日是什么时候？']], [['C', 'Hi! When is your birthday? I want to know! 🎂', '嗨！你的生日是什么时候？我想知道！']]], msgFromAlt: true, q: { zh: '用英文回复：{s.zh}' } },
      { f: 'WT', k: 'wt-day', subs: ['W-sent'], at: '手机消息', slots: { s: 'xsent' }, bind: ['s'], fit: '^(Today|Tomorrow) is',
        alt: [[['A', 'What day is it today? 😴', '今天星期几？😴']], [['C', 'Sorry, what day is it? 🙈', '抱歉，今天星期几来着？🙈']]], msgFromAlt: true, q: { zh: '用英文回复：{s.zh}' } },
      { f: 'WT', k: 'wt-work', subs: ['W-sent'], at: '手机消息', slots: { s: 'xsent' }, bind: ['s'], fit: 'work from|work on',
        alt: [[['A', 'When do you work? 💼', '你哪几天上班？💼']], [['C', 'Are you free on Monday? When do you work? 💼', '你周一有空吗？你哪几天上班？💼']]], msgFromAlt: true, q: { zh: '用英文回复：{s.zh}' } },
      { f: 'WT', k: 'wt-fav', subs: ['W-sent'], at: '手机消息', slots: { s: 'xsent' }, bind: ['s'], fit: 'favourite',
        alt: [[['A', 'What\'s your favourite time of the week? ✨', '一周里你最喜欢什么时候？✨']], [['C', 'Do you like Monday or Saturday? 😄', '你喜欢周一还是周六？😄']]], msgFromAlt: true, q: { zh: '用英文回复：{s.zh}' } },
      { f: 'VG', k: 'vg', subs: ['V-spell', 'V-cal'], at: '手机消息', slots: { m: 'month' }, bind: ['m'],
        msg: ['C', 'My birthday is in ?m. Come to my party! 🎂', '我的生日在 ____ 。来我的派对吧！🎂'],
        q: { zh: '{C} 发来一条消息，有一个词没打出来。听一听，把它写上。' }, say: [['C', '{m}', '{m.zh}']] }
    ]
  });
  scene({
    id: 'school-classmate', v: 1, zh: 'Ben 的消息', place: 'school', tier: 1, ch: 1, needs: ['w1d1:a3'], roles: { A: 'ben', C: '@pool' }, ielts: ['RG1', 'S1'], gloss: {},
    frames: [
      { f: 'GP', k: 'gp-v', subs: ['G-pos'], concept: 'v', at: '手机消息', slots: { d: 'weekday', v: 'verb1' }, bind: [],
        msg: ['A', 'Hi! I often {v} on {d}s. 😅', '嗨！我{d.zh}经常{v.zh}。'], tap: 'v', q: { zh: '点出这句话里的动词（表示"做什么"的词）' } },
      { f: 'GP', k: 'gp-adv', subs: ['G-pos'], concept: 'adv', at: '手机消息', slots: { d: 'weekday', f: 'freq', v: 'verb1' }, bind: [], only: { f: ['often', 'usually'] },
        msg: ['A', 'I {f} {v} on {d} evening. 🙂', '我{d.zh}晚上{f.zh}{v.zh}。'], tap: 'f', q: { zh: '点出这句话里的副词（说"多经常"的词）' } },
      { f: 'GP', k: 'gp-n', subs: ['G-pos'], concept: 'n', at: '手机消息', slots: { d: 'weekday', x: 'drink' }, bind: [],
        msg: ['A', 'I have {x} with my friends on {d}s. ☕', '我{d.zh}和朋友们一起喝{x.zh}。'], tap: 'x', q: { zh: '点出这句话里表示"东西"的名词（不算 I 和 friends）' } },
      { f: 'GP', k: 'gp-adj', subs: ['G-pos'], concept: 'adj', at: '手机消息', slots: { d: 'weekday' }, bind: [],
        msg: ['A', '{d} is my busy day. 😮‍💨', '{d.zh}是我忙的一天。😮‍💨'], tap: '=busy', q: { zh: '点出这句话里的形容词（说"什么样"的词）' } },
      { f: 'GP', k: 'gp-prep', subs: ['G-pos'], concept: 'prep', at: '手机消息', slots: { m: 'month' }, bind: [],
        msg: ['A', 'My birthday is in {m}. 🎈', '我的生日在{m.zh}。🎈'], tap: '=in', q: { zh: '点出这句话里的介词（放在月份前面的那个小词）' } },
      { f: 'GP', k: 'gp-conj', subs: ['G-pos'], concept: 'conj', at: '手机消息', slots: { x: 'drink', y: 'drink' }, bind: [], distinct: [['x', 'y']],
        msg: ['A', 'I like {x}, but {C} likes {y}.', '我喜欢{x.zh}，但 {C} 喜欢{y.zh}。'], tap: '=but', q: { zh: '点出这句话里的连词（把两句话连起来的词）' } },
      { f: 'GF', k: 'gf-v', subs: ['G-pos'], concept: 'v', at: '手机消息', slots: { d: 'weekday' }, bind: [],
        msg: ['A', 'I ___ from Monday to Friday. 💼', '我周一到周五 ____ 。💼'], q: { zh: '选一个能放进空里的词（缺的是"做什么"）' },
        opts: ['=work', '=often', '=family'] },
      { f: 'GF', k: 'gf-adv', subs: ['G-pos'], concept: 'adv', at: '手机消息', slots: { d: 'weekday' }, bind: [],
        msg: ['A', 'I ___ relax on {d} evening. 🙂', '我{d.zh}晚上 ____ 放松一下。🙂'], q: { zh: '选一个能放进空里的词（缺的是"多经常"）' },
        opts: ['=often', '=cheap', '=family'] }
    ]
  });
  scene({
    id: 'school-speaking-test', v: 1, zh: '口语模拟考（Ms Clarke 当考官）', place: 'school', tier: 1, ch: 1, needs: ['w1d1:c2'], roles: { A: 'clarke' }, ielts: ['S1'], gloss: {},
    frames: [
      { f: 'SP', k: 'sp', subs: ['S-ext', 'S-phr'], at: '口语模拟考', slots: { k: 'speakq' }, bind: ['k'],
        alt: [[['A', '{k}', '{k.zh}']], [['A', 'Now, let\'s talk about you.', '现在，我们来聊聊你。'], ['A', '{k}', '{k.zh}']], [['A', 'OK. Next one.', '好，下一个。'], ['A', '{k}', '{k.zh}']],
          [['A', 'Thank you. Now, let\'s talk about your life.', '谢谢。现在我们聊聊你的生活。'], ['A', '{k}', '{k.zh}']]], q: { zh: '说 2–4 句：直接回答 + 一个原因 + 一个小细节' } },
      { f: 'SP', k: 'sp-open', subs: ['S-ext'], at: '口语模拟考', slots: { o: 'opener' }, bind: [],
        say: [['A', '{o}', '{o.zh}']], q: { zh: '这是考场上常见的开场题。说 2–3 句，说真实的自己。' } },
      { f: 'SR', k: 'sr', subs: ['S-intel'], at: '口语模拟考', slots: { s: 'dsent' }, bind: ['s'],
        alt: [[['A', 'Please read it out.', '请把它读出来。']], [['A', 'Now, can you read this for me, please?', '现在，请你把这句读给我听。']], [['A', 'Please read this out, slowly and clearly.', '请把这句读出来，慢一点、清楚一点。']],
          [['A', 'This is from our English book. Please read it.', '这句来自我们的英语课本。请读一下。']], [['A', 'OK. Now read this one, please.', '好。现在请读这一句。']], [['A', 'Take your time, and read it out.', '别着急，把它读出来。']]],
        q: { zh: '把这句话大声读给手机听：{s}' }, glossAdd: { slowly: '慢慢地', clearly: '清楚地' } }
    ]
  });
  scene({
    id: 'home-calendar', v: 1, zh: '冰箱上的月历', place: 'home', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d1:b2'], roles: { A: 'lily' }, ielts: ['RG1'], gloss: {},
    frames: [
      { f: 'RN', k: 'rn', subs: ['R-infer'], concept: 'range', at: '厨房冰箱上 · 这一周的日程表', slots: { d1: 'weekday', d2: 'weekday', c: 'count', d3: 'weekday' },
        derive: { c: ['span', 'd1', 'd2'] }, only: { d1: ['monday', 'tuesday', 'wednesday'], d2: ['thursday', 'friday', 'saturday'] }, not: { d3: ['monday', 'wednesday', 'saturday'] }, bind: [],
        text: { kind: 'notice', title: ['THIS WEEK', '这一周'],
          lines: [['LILY: work, Monday to Friday', 'Lily：周一到周五上班'], ['LILY: English class, Monday and Wednesday', 'Lily：周一、周三上英语课'],
            ['ME: Moon Café, {d1} to {d2}', '我：{d1.zh}到{d2.zh}在月光咖啡馆打工'], ['{d3}: tea with Ben', '{d3.zh}：和 Ben 喝茶']] },
        items: [
          { f: 'RN', subs: ['R-infer'], concept: 'range', on: 'c', q: { en: 'How many days do you work at Moon Café this week?', zh: '这周你在月光咖啡馆工作几天？' }, opts: ['{c:cap}', '{c~:cap}', '{c~:cap}'] },
          { f: 'RN', subs: ['R-detail'], concept: 'when', on: 'd3', q: { en: 'When do you have tea with Ben?', zh: '你哪天和 Ben 喝茶？' }, opts: ['On {d3}|{d3.zh}', 'On {d3~}|{d3~.zh}', 'On {d3~}|{d3~.zh}'] },
          { f: 'RT', subs: ['R-tfng', 'R-infer'], concept: 'range', on: 'c', stmt: { en: 'Lily works five days a week.', zh: 'Lily 一周工作五天。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'R-detail'], concept: 'when', on: 'c', stmt: { en: 'Lily has an English class on Friday.', zh: 'Lily 周五有英语课。' }, truth: 'F' }] },
      { f: 'VG', k: 'vg', subs: ['V-spell', 'V-cal'], at: '厨房冰箱上 · 这一周的日程表', slots: { d: 'weekday' }, bind: ['d'], only: { d: ['monday', 'wednesday'] },
        msg: ['A', 'LILY: English class after work — ?d', 'Lily：下班后上英语课——____'], q: { zh: 'Lily 在月历上写了上课的日子，最后一个词没写完。听一听，把它写上。' }, say: [['A', '{d}', '{d.zh}']] }
    ]
  });
  scene({
    id: 'social-weekend', v: 1, zh: '周末计划', place: 'social', tier: 1, ch: 1, needs: ['w1d1:b2'], roles: { A: 'lily', C: '@pool' }, ielts: ['S1', 'W1'], gloss: {},
    frames: [
      { f: 'VM', k: 'vm-d', subs: ['V-mean'], at: '手机消息', slots: { d: 'weekday' }, bind: ['d'],
        msg: ['C', 'Our English class is on {d} evening. See you there! 👋', '我们的英语课在{d.zh}晚上。到时见！👋'],
        q: { zh: '这里的"{d}"是什么意思？' }, opts: ['{d.zh}', '{d~.zh}', '{d~.zh}'], optZh: true },
      { f: 'VM', k: 'vm-fri', subs: ['V-mean'], at: '手机消息', slots: { d: 'weekday' }, bind: ['d'], only: { d: ['friday'] },
        msg: ['A', 'On {d} evening, I relax with my friends. Come with us? 🎉', '{d.zh}晚上我和朋友们放松一下。和我们一起吗？🎉'],
        q: { zh: '这里的"{d}"是什么意思？' }, opts: ['{d.zh}', '{d~.zh}', '{d~.zh}'], optZh: true },
      { f: 'VM', k: 'vm-m', subs: ['V-mean'], at: '手机消息', slots: { m: 'month' }, bind: ['m'],
        msg: ['C', 'My parents visit me every {m}. 😊', '我爸妈每年{m.zh}来看我。😊'],
        q: { zh: '这里的"{m}"是什么意思？' }, opts: ['{m.zh}', '{m~.zh}', '{m~.zh}'], optZh: true, glossAdd: { visit: '看望' } },
      { f: 'RT', k: 'rt', subs: ['R-tfng', 'R-para'], at: '手机消息', slots: {}, bind: [],
        text: { kind: 'message', title: ['Message from Lily', 'Lily 的消息'],
          lines: [['The weekend is my favourite time. On Saturday, I sleep late.', '周末是我最喜欢的时间。周六我睡懒觉。'], ['On Sunday, I call my parents.', '周日我给父母打电话。']] },
        items: [
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'Lily likes Saturday and Sunday best.', zh: 'Lily 最喜欢周六和周日。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng'], stmt: { en: 'Lily gets up early on Saturday.', zh: 'Lily 周六起得早。' }, truth: 'F', glossAdd: { 'get up': '起床', early: '早' } },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'On Sunday, Lily calls her mother and father.', zh: '周日 Lily 给她爸妈打电话。' }, truth: 'T', glossAdd: { mother: '妈妈', father: '爸爸' } }] }
    ]
  });
  scene({
    id: 'cafe-leo-birthday', v: 1, zh: 'Leo 的生日派对', place: 'cafe', tier: 1, ch: 1, needs: ['w1d1:a2'], roles: { A: 'leo', B: 'lily' }, ielts: ['L1', 'RG1'],
    gloss: { party: '派对' },
    frames: [
      { f: 'LC', k: 'lc', subs: ['L-date', 'L-detail'], at: '月光咖啡馆', slots: { d: 'weekday', m: 'month', n: 'dom' }, cal: ['d', 'm', 'n'], only: { m: ['october'] }, not: { d: ['sunday'] }, bind: ['d'],
        alt: [
          [['B', 'Leo, when\'s your birthday party?', 'Leo，你的生日派对是哪天？'], ['A', 'On {d}, the {n} of October. Can you come?', '十月{n.zh}号，{d.zh}。你能来吗？'], ['B', 'Yes, of course!', '当然能！']],
          [['B', 'Is your party on {d~}, Leo?', 'Leo，你的派对是{d~.zh}吗？'], ['A', 'No, it\'s on {d}. {d}, the {n} of October.', '不是，是{d.zh}。十月{n.zh}号，{d.zh}。']]],
        q: { en: 'When is Leo\'s party?', zh: 'Leo 的派对是哪天？' }, opts: ['{d}', '{d~}', '{d~}'] },
      { f: 'RT', k: 'rt', subs: ['R-tfng'], at: '手机消息', slots: { d: 'weekday', m: 'month', n: 'dom' }, cal: ['d', 'm', 'n'], only: { m: ['october'] }, not: { d: ['sunday'] }, bind: ['d'],
        text: { kind: 'message', title: ['Message from Lily', 'Lily 的消息'],
          lines: [['Leo\'s birthday party is on {d}, the {n#} of October.', 'Leo 的生日派对在十月{n.zh}号，{d.zh}。'], ['It\'s at Moon Café, after work. 🎉', '在月光咖啡馆，下班后。🎉']] },
        items: [
          { f: 'RT', subs: ['R-tfng', 'L-date'], on: 'd', stmt: { en: 'The party is on {d}.', zh: '派对在{d.zh}。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'L-date'], on: 'd', stmt: { en: 'The party is on {d~}.', zh: '派对在{d~.zh}。' }, truth: 'F' },
          { f: 'RT', subs: ['R-tfng', 'R-infer'], stmt: { en: 'The party is in the morning.', zh: '派对在上午。' }, truth: 'F', glossAdd: { morning: '早上' } }] },
      { f: 'VG', k: 'vg', subs: ['V-spell', 'V-cal'], at: '手机消息', slots: { d: 'weekday' }, not: { d: ['sunday'] }, bind: ['d'],
        msg: ['A', 'Thank you for coming to my party on ?d! — Leo', '谢谢你 ____ 来我的派对！——Leo'],
        q: { zh: 'Leo 发来一条消息，有一个词没打出来。听一听，把它写上。' }, say: [['A', '{d}', '{d.zh}']] }
    ]
  });
  scene({
    id: 'cafe-loyalty', v: 1, zh: '会员卡登记', place: 'cafe', tier: 1, ch: 1, needs: ['w1d1:a2'], roles: { A: 'leo', B: '@pool' }, ielts: ['L1'],
    gloss: { card: '卡' },
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-date', 'V-spell'], at: '月光咖啡馆', slots: { m: 'month', n: 'dom' }, bind: ['m'], limit: { words: 1, num: true },
        alt: [
          [['A', 'Here\'s your Moon Café card. When\'s your birthday?', '这是你的月光咖啡馆会员卡。你的生日是哪天？'], ['B', 'It\'s the {n} of {m}.', '{m.zh}{n.zh}号。'],
            ['A', 'The {n} of {m}. Great, thank you!', '{m.zh}{n.zh}号。好的，谢谢！']],
          [['A', 'And when\'s your birthday, please?', '请问你的生日是哪天？'], ['B', 'It\'s in {m~}… no, sorry, in {m}. The {n} of {m}.', '在{m~.zh}……不对，抱歉，在{m.zh}。{m.zh}{n.zh}号。']]],
        form: { title: ['Moon Café card', '月光咖啡馆会员卡'], rows: [['Name', '姓名', '{B}'], ['Birthday', '生日', '{n#} ?m']] },
        q: { zh: '帮 Leo 把 {B} 的会员卡登记表填完' } },
      { f: 'LC', k: 'lc', subs: ['L-date', 'L-detail'], at: '月光咖啡馆', slots: { m: 'month', n: 'dom' }, bind: ['m'],
        say: [['A', 'When\'s your birthday, {B}?', '{B}，你的生日是哪天？'], ['B', 'It\'s the {n} of {m}.', '{m.zh}{n.zh}号。']],
        q: { en: 'When is {B}\'s birthday?', zh: '{B} 的生日在几月？' }, opts: ['In {m}|{m.zh}', 'In {m~}|{m~.zh}', 'In {m~}|{m~.zh}'] }
    ]
  });
  scene({
    id: 'school-enrol', v: 1, zh: '语言学校报名表', place: 'school', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d1:b1'], roles: { A: '@pool', B: 'you' }, ielts: ['L1'],
    gloss: {},
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-date', 'V-spell'], at: '语言学校前台', slots: { d: 'weekday', m: 'month', n: 'dom' }, cal: ['d', 'm', 'n'], not: { d: ['sunday'] }, bind: ['m', 'd'], limit: { words: 1, num: true },
        alt: [
          [['A', 'Welcome to Maple Bridge Language School!', '欢迎来到枫桥语言学校！'], ['A', 'Your English course starts on {d}, the {n} of {m}.', '你的英语课程{m.zh}{n.zh}号{d.zh}开始。'],
            ['B', 'The {n} of {m}? Great!', '{m.zh}{n.zh}号？太好了！']],
          [['B', 'Hello. When does my English course start?', '你好。我的英语课程什么时候开始？'], ['A', 'On {d~}… sorry, no. It starts on {d}, the {n} of {m}.', '{d~.zh}……不对，抱歉。{m.zh}{n.zh}号{d.zh}开始。']]],
        form: { title: ['Maple Bridge Language School', '枫桥语言学校'], rows: [['Course', '课程', 'English'], ['First day', '第一天', '?d'], ['Date', '日期', '{n#} ?m']] },
        q: { zh: '听前台说，把你的报名表填完' } },
      { f: 'LC', k: 'lc', subs: ['L-date', 'L-detail'], at: '语言学校前台', slots: { d: 'weekday', d2: 'weekday' }, only: { d: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], d2: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] }, bind: ['d'], distinct: [['d', 'd2']],
        say: [['A', 'Your English classes are on {d} and {d2}, in the evening.', '你的英语课在{d.zh}和{d2.zh}，都是晚上。'], ['B', '{d} and {d2}. Thank you!', '{d.zh}和{d2.zh}。谢谢！']],
        q: { en: 'Which day is an English class day?', zh: '哪一天有英语课？' }, opts: ['{d}', '{d~}', '{d~}'], avoid: { d: ['d2'] } }
    ]
  });
  scene({
    id: 'health-cancel', v: 1, zh: '改约医生', place: 'health', tier: 1, ch: 1, needs: ['w1d1:a2'], roles: { A: '@pool', B: 'you' }, ielts: ['L1'],
    gloss: { doctor: '医生' },
    frames: [
      { f: 'LC', k: 'lc', subs: ['L-date', 'R-infer'], at: 'Park Street 健康中心 · 电话', slots: { d0: 'weekday', d: 'weekday' }, derive: { d: ['next', 'd0'] }, only: { d0: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] }, bind: ['d'],
        alt: [
          [['B', 'Hello. Sorry, I can\'t come to see the doctor today.', '你好。抱歉，我今天不能来看医生了。'], ['A', 'That\'s OK. Today is {d0}. Can you come tomorrow?', '没关系。今天是{d0.zh}。你明天能来吗？'],
            ['B', 'Tomorrow? Yes, I can. Thank you!', '明天？可以的。谢谢！']],
          [['A', 'Hello, this is Park Street Health Centre.', '你好，这里是公园街健康中心。'], ['B', 'Hi. Can I see the doctor tomorrow, not today?', '你好。我能明天来看医生，而不是今天吗？'],
            ['A', 'Yes. Today is {d0}, so see you tomorrow.', '可以。今天是{d0.zh}，那就明天见。']]],
        q: { en: 'Which day do you see the doctor now?', zh: '你现在改到星期几看医生？' }, opts: ['{d}', '{d0}', '{d~}'], avoid: { d: ['d0'] } },
      { f: 'RT', k: 'rt', subs: ['R-tfng', 'L-date'], at: '健康中心发来的短信', slots: { d: 'weekday' }, not: { d: ['sunday'] }, bind: ['d'],
        text: { kind: 'message', title: ['Park Street Health Centre', '公园街健康中心'], lines: [['You can now see the doctor on {d}.', '你现在改到{d.zh}看医生。'], ['Please come a little early. Thank you!', '请早一点到。谢谢！']] },
        items: [
          { f: 'RT', subs: ['R-tfng', 'L-date'], on: 'd', stmt: { en: 'You see the doctor on {d}.', zh: '你{d.zh}看医生。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'L-date'], on: 'd', stmt: { en: 'You see the doctor on {d~}.', zh: '你{d~.zh}看医生。' }, truth: 'F' }], glossAdd: { early: '早' } }
    ]
  });
  scene({
    id: 'season-spring', v: 1, zh: '春天到了', place: 'season', tier: 1, ch: 1, needs: ['w1d1:b2'], roles: { A: 'lily' }, ielts: ['RG1', 'S1'],
    gloss: { flower: '花' },
    frames: [
      { f: 'RT', k: 'rt', subs: ['R-tfng'], at: 'Lily 的朋友圈', slots: { m: 'month' }, not: { m: ['march'] }, bind: [],
        text: { kind: 'message', title: ['Message from Lily', 'Lily 的朋友圈'],
          lines: [['My birthday is in March, and I love spring. 🌸', '我的生日在三月，我很喜欢春天。🌸'], ['This weekend, I relax with my friends and have tea. ☕', '这个周末我和朋友们一起放松、喝茶。☕']] },
        items: [
          { f: 'RT', subs: ['R-tfng'], stmt: { en: 'Lily\'s birthday is in March.', zh: 'Lily 的生日在三月。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'L-date'], stmt: { en: 'Lily\'s birthday is in {m}.', zh: 'Lily 的生日在{m.zh}。' }, truth: 'F' },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'Lily does not like spring.', zh: 'Lily 不喜欢春天。' }, truth: 'F' }] },
      { f: 'VM', k: 'vm', subs: ['V-mean'], at: 'Lily 的朋友圈', slots: { m: 'month' }, bind: ['m'], only: { m: ['march', 'april', 'may'] },
        msg: ['A', 'Spring is here! {m} is my favourite month. 🌸', '春天来了！{m.zh}是我最喜欢的月份。🌸'],
        q: { zh: '这里的"{m}"是什么意思？' }, opts: ['{m.zh}', '{m~.zh}', '{m~.zh}'], optZh: true }
    ]
  });
  scene({
    id: 'season-new-year', v: 1, zh: '新年', place: 'season', tier: 1, ch: 1, needs: ['w1d1:a2'], roles: { A: 'tom', B: 'lily' }, ielts: ['L1', 'RG1'],
    gloss: { party: '派对' },
    frames: [
      { f: 'LC', k: 'lc', subs: ['L-date', 'L-detail'], at: '楼道里', slots: { d: 'weekday', m: 'month', n: 'dom' }, cal: ['d', 'm', 'n'], only: { m: ['january'] }, bind: ['d'],
        say: [['A', 'Happy New Year, Lily! Is your party on {d~}?', '新年快乐，Lily！你的派对是{d~.zh}吗？'], ['B', 'No, on {d}, the {n} of {m}. Can you come?', '不是，是{m.zh}{n.zh}号，{d.zh}。你能来吗？'],
          ['A', 'Yes, of course!', '当然能！']],
        q: { en: 'When is Lily\'s party?', zh: 'Lily 的派对是哪天？' }, opts: ['{d}', '{d~}', '{d~}'] },
      { f: 'RT', k: 'rt', subs: ['R-tfng', 'L-date'], at: '楼道里的告示', slots: { d: 'weekday', m: 'month', n: 'dom' }, cal: ['d', 'm', 'n'], only: { m: ['january'] }, bind: ['d'],
        text: { kind: 'notice', title: ['HAPPY NEW YEAR!', '新年快乐！'],
          lines: [['New Year party: {d}, the {n#} of January', '新年派对：一月{n.zh}号，{d.zh}'], ['In the evening. Come with your friends!', '晚上。和朋友们一起来吧！']] },
        items: [
          { f: 'RT', subs: ['R-tfng', 'L-date'], on: 'd', stmt: { en: 'The party is on {d}.', zh: '派对在{d.zh}。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'L-date'], on: 'd', stmt: { en: 'The party is in February.', zh: '派对在二月。' }, truth: 'F' }] }
    ]
  });
  scene({
    id: 'social-thank-you', v: 1, zh: '写一张感谢卡', place: 'social', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d1:c1'], roles: { A: 'lily', C: '@pool' }, ielts: ['W1'], gloss: {},
    frames: [
      { f: 'VG', k: 'vg', subs: ['V-spell', 'V-cal'], at: '一张感谢卡', slots: { d: 'weekday' }, bind: ['d'],
        msg: ['you', 'Dear {C}, thank you for the tea on ?d! See you next week. 🌷', '亲爱的 {C}，谢谢你 ____ 请我喝茶！下周见。🌷'],
        q: { zh: '你在写感谢卡，有一个词还没写。听一听，把它写上。' }, say: [['A', '{d}', '{d.zh}']], glossAdd: { dear: '亲爱的' } },
      { f: 'WM', k: 'wm', subs: ['W-task', 'W-length'], at: '一张感谢卡', slots: {}, bind: [],
        task: { kind: 'W', min: 30, max: 60,
          bullets: [{ en: 'Say thank you for a day with {C}.', zh: '谢谢 {C} 陪你过了一天', keys: ['thank'] },
            { en: 'Say which day it was.', zh: '说是星期几', keys: ['@weekday'] },
            { en: 'Ask to meet again.', zh: '约下次再见', keys: ['next', 'again', 'see you', 'meet'] }] },
        q: { en: 'Write a thank-you card to {C}.', zh: '给 {C} 写一张 30–60 词的感谢卡：' } }
    ]
  });
  //  —— scenes that need day 2 (numbers, prices, times) or later ——
  scene({
    id: 'home-move-date', v: 1, zh: '确认搬家日期', place: 'home', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d2:a2'], roles: { A: 'wood', B: 'you' }, ielts: ['L1'],
    gloss: { move: '搬家' },
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-date', 'L-num'], at: '电话 · 房东', slots: { d: 'weekday', m: 'month', n: 'dom', t: 'time' }, cal: ['d', 'm', 'n'], bind: ['m', 'd', 't'], limit: { words: 1, num: true },
        alt: [
          [['A', 'Hello, it\'s Mrs Wood. You can move in on {d}, the {n} of {m}.', '你好，我是伍德太太。你{m.zh}{n.zh}号{d.zh}可以搬进来。'], ['B', 'Great! What time?', '太好了！几点？'],
            ['A', 'At {t}.', '{t.zh}。']],
          [['B', 'Hello, Mrs Wood. Can I move in on {d~}?', '你好，伍德太太。我可以{d~.zh}搬进来吗？'], ['A', 'Sorry, no. On {d}, the {n} of {m}. At {t}.', '抱歉，不行。{m.zh}{n.zh}号{d.zh}吧，{t.zh}。']]],
        form: { title: ['Flat 3, 8 Park Street', '公园街 8 号 3 号公寓'], rows: [['Move in', '入住日', '?d'], ['Date', '日期', '{n#} ?m'], ['Time', '时间', '?t']] },
        q: { zh: '听房东的电话，把入住的时间记下来' } },
      { f: 'LP', k: 'lp', subs: ['L-num'], at: '电话 · 房东', slots: { p: 'pair' }, bind: ['p'], only: { p: ['thirteen|thirty', 'fifteen|fifty'] },
        say: [['A', 'Take the number {p} bus to your new flat.', '坐 {p:digits} 路公交车到你的新公寓。']], q: { zh: '伍德太太说的是哪一路公交车？' }, opts: ['{p}', '{p~}'], optZh: true }
    ]
  });
  scene({
    id: 'home-spare-key', v: 1, zh: '借备用钥匙', place: 'home', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d2:a2'], roles: { A: 'lily', B: 'you' }, ielts: ['L1'],
    gloss: { key: '钥匙' },
    frames: [
      { f: 'LC', k: 'lc', subs: ['L-time', 'L-detail'], at: '家里 · 门口', slots: { t: 'time', d: 'weekday' }, bind: ['t', 'd'],
        say: [['B', 'Lily, can I have the key on {d}?', 'Lily，{d.zh}我能用一下钥匙吗？'], ['A', 'Sure. I\'m back at {t}.', '当然。我{t.zh}回来。']],
        q: { en: 'What time is Lily back?', zh: 'Lily 几点回来？' }, opts: ['{t:digits}', '{t~:digits}', '{t~:digits}'], on: 't' },
      { f: 'VG', k: 'vg', subs: ['V-spell', 'V-cal'], at: '手机消息', slots: { d: 'weekday' }, bind: ['d'],
        msg: ['A', 'The key is with Tom next door until ?d. 🔑', '钥匙放在隔壁 Tom 那儿，到 ____ 为止。🔑'],
        q: { zh: 'Lily 发来一条消息，有一个词没打出来。听一听，把它写上。' }, say: [['A', '{d}', '{d.zh}']], glossAdd: { 'next door': '隔壁' } }
    ]
  });
  scene({
    id: 'cafe-hours', v: 1, zh: '咖啡馆营业时间告示', place: 'cafe', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d2:a2'], roles: { A: 'leo' }, ielts: ['RG1', 'L2'],
    gloss: { closed: '关门', only: '只' },
    frames: [
      { f: 'RN', k: 'rn', subs: ['R-number'], at: '咖啡馆门口的告示', slots: { d2: 'weekday', t1: 'time', t2: 'time', p1: 'price', p2: 'price' },
        not: { d2: ['sunday'] }, only: { t1: ['07:00o', '08:00o', '08:00', '07:30d', '08:30d'], t2: ['09:15q', '09:45q', '10:15q', '10:00o', '09:30h', '10:30h'], p1: ['1.50', '2', '2.50'], p2: ['2.50', '3', '3.50'] },
        distinct: [['p1', 'p2']], bind: ['t2', 'd2', 'p1'],
        text: { kind: 'notice', title: ['MOON CAFÉ', '月光咖啡馆'],
          lines: [['Monday – Saturday   {t1:digits} – 6.00 pm', '周一到周六  上午{t1.zh}到下午六点'], ['Sunday   closed', '周日  不营业'],
            ['Tea {p1:digits} · Coffee {p2:digits}', '茶 {p1:digits} · 咖啡 {p2:digits}'], ['Pay by card or cash', '刷卡或付现金都可以'],
            ['✎ This {d2} only: we open at {t2}. Sorry! — Leo', '✎ 只有这个{d2.zh}：我们{t2.zh}开门。抱歉！——Leo']] },
        items: [
          { f: 'RN', subs: ['R-number', 'L-time'], on: 't2', q: { en: 'What time does the café open this {d2}?', zh: '这个{d2.zh}咖啡馆几点开门？' }, opts: ['{t2:digits}', '{t2~:digits}', '{t1:digits}'] },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'The café is not open on Sunday.', zh: '咖啡馆周日不开门。' }, truth: 'T' },
          { f: 'RN', subs: ['R-number', 'L-price'], on: 'p1', q: { en: 'How much is a cup of tea?', zh: '一杯茶多少钱？' }, ans: '{p1:digits}', limit: { words: 1, num: true }, input: 'type' }] },
      { f: 'LN', k: 'ln', subs: ['L-time', 'L-detail'], at: '月光咖啡馆的留言', slots: { d2: 'weekday', t2: 'time' }, not: { d2: ['sunday'] }, bind: ['t2', 'd2'], limit: { words: 1, num: true },
        say: [['A', 'Hi, everyone! This week the café opens at {t2} on {d2}.', '大家好！这周{d2.zh}，咖啡馆{t2.zh}开门。']],
        notes: { title: ['Moon Café this week', '月光咖啡馆本周'], rows: [['{d2}: opens at', '{d2.zh}：开门时间', '?t2']] },
        q: { zh: '听 Leo 的留言，把笔记补完整' } }
    ]
  });
  scene({
    id: 'shop-opening', v: 1, zh: '商店几点开门', place: 'market', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d2:a2'], roles: { A: '@pool', B: 'you' }, ielts: ['L1', 'RG1'],
    gloss: { shop: '商店' },
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-time', 'L-detail'], at: '街角的商店 · 电话', slots: { d: 'weekday', t: 'time' }, bind: ['t', 'd'], limit: { words: 1, num: true },
        alt: [
          [['B', 'Hello. What time does the shop open on {d}?', '你好。商店{d.zh}几点开门？'], ['A', 'On {d}, we open at {t}.', '{d.zh}我们{t.zh}开门。']],
          [['B', 'Hi. Does the shop open at {t~} on {d}?', '你好。商店{d.zh}{t~.zh}开门吗？'], ['A', 'No, sorry. On {d}, we open at {t}.', '不开，抱歉。{d.zh}我们{t.zh}开门。']]],
        notes: { title: ['The shop', '商店'], rows: [['Day', '星期', '{d}'], ['Opens at', '开门时间', '?t']] },
        q: { zh: '打电话问商店几点开门，把答案记下来' } },
      { f: 'RN', k: 'rn', subs: ['R-number', 'L-time'], at: '商店门上的告示', slots: { t1: 'time', t2: 'time', d: 'weekday' }, only: { t1: ['08:00o', '09:00o', '08:30h', '09:30h'], t2: ['10:00o', '11:00o', '10:30h'] },
        not: { d: ['sunday'] }, bind: ['t2', 't1'],
        text: { kind: 'notice', title: ['OPENING TIMES', '营业时间'], lines: [['Monday – Friday: {t1:digits} – 7.00 pm', '周一到周五：上午{t1.zh}到晚上七点'], ['Saturday and Sunday: {t2:digits} – 5.00 pm', '周六周日：上午{t2.zh}到下午五点']] },
        items: [
          { f: 'RN', subs: ['R-number', 'R-para'], on: 't2', q: { en: 'What time does the shop open at the weekend?', zh: '商店周末几点开门？' }, opts: ['{t2:digits}', '{t1:digits}', '{t2~:digits}'] },
          { f: 'RN', subs: ['R-number'], on: 't1', q: { en: 'What time does the shop open on {d}?', zh: '商店{d.zh}几点开门？' }, opts: ['{t1:digits}', '{t2:digits}', '{t1~:digits}'], not: { d: ['saturday', 'sunday'] } }] }
    ]
  });
  scene({
    id: 'health-appointment', v: 1, zh: '预约医生', place: 'health', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d2:a2'], roles: { A: '@pool', B: 'you' }, ielts: ['L1'],
    gloss: { doctor: '医生' },
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-time', 'L-date'], at: 'Park Street 健康中心 · 电话', slots: { d: 'weekday', t: 'time' }, only: { t: ['09:00o', '10:00o', '11:00o', '14:00o', '15:00o', '16:00o', '09:30h', '10:30h', '14:30h', '15:30h', '09:15q', '10:45q', '14:15q', '15:45q'] }, not: { d: ['sunday'] }, bind: ['d', 't'], limit: { words: 1, num: true },
        alt: [
          [['B', 'Hello. Can I see the doctor this week?', '你好。这周我能看医生吗？'], ['A', 'Yes. Is {d} at {t} OK?', '可以。{d.zh}{t.zh}可以吗？'], ['B', '{d} at {t}. Yes, thank you.', '{d.zh}{t.zh}。好的，谢谢。']],
          [['A', 'The doctor can see you on {d~}… no, sorry, on {d}. At {t}.', '医生{d~.zh}可以看……不对，抱歉，是{d.zh}。{t.zh}。'], ['B', 'Great, {d} at {t}.', '好的，{d.zh}{t.zh}。']]],
        form: { title: ['Park Street Health Centre', '公园街健康中心'], rows: [['Day', '星期', '?d'], ['Time', '时间', '?t']] },
        q: { zh: '听电话，把看医生的时间记在表上' } },
      { f: 'LC', k: 'lc', subs: ['L-time', 'L-detail'], at: 'Park Street 健康中心 · 电话', slots: { d: 'weekday', t: 'time' }, only: { t: ['09:00o', '10:00o', '11:00o', '14:00o', '15:00o', '16:00o', '09:30h', '10:30h', '14:30h', '15:30h', '09:15q', '10:45q', '14:15q', '15:45q'] }, not: { d: ['sunday'] }, bind: ['t', 'd'],
        say: [['A', 'You can see the doctor on {d} at {t}.', '你可以{d.zh}{t.zh}来看医生。']],
        q: { en: 'What time is the appointment?', zh: '约的是几点？' }, opts: ['{t:digits}', '{t~:digits}', '{t~:digits}'], on: 't', glossAdd: { appointment: '预约' } }
    ]
  });
  scene({
    id: 'svc-haircut', v: 1, zh: '理发预约', place: 'service', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d2:a2'], roles: { A: '@pool', B: 'you' }, ielts: ['L1'],
    gloss: { haircut: '理发' },
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-time', 'L-price'], at: '理发店 · 电话', slots: { d: 'weekday', t: 'time', p: 'price' }, only: { p: ['12', '13', '15', '18', '20', '30'] }, bind: ['d', 't', 'p'],
        limit: { words: 1, num: true },
        alt: [
          [['B', 'Hi. Can I have a haircut on {d}?', '你好。我{d.zh}能来理发吗？'], ['A', 'Yes. At {t}. It\'s {p}.', '可以。{t.zh}。{p.zh}。'], ['B', 'OK, thank you!', '好的，谢谢！']],
          [['A', 'A haircut on {d} is {p~}… sorry, no, {p}.', '{d.zh}理发{p~.zh}……不对，抱歉，是{p.zh}。'], ['A', 'Come at {t}, please.', '请{t.zh}来。']]],
        form: { title: ['Haircut', '理发'], rows: [['Day', '星期', '?d'], ['Time', '时间', '?t'], ['Price', '价格', '£?p']] },
        q: { zh: '打电话约理发，把星期、时间和价格记下来' } },
      { f: 'LC', k: 'lc', subs: ['L-price', 'L-num'], at: '理发店 · 电话', slots: { p: 'price' }, only: { p: ['13', '15', '14', '16', '18'] }, bind: ['p'],
        say: [['you', 'How much is a haircut, please?', '请问理发多少钱？'], ['A', 'It\'s {p}.', '{p.zh}。']],
        q: { en: 'How much is a haircut?', zh: '理发多少钱？' }, opts: ['{p:digits}', '{p~:digits}', '{p~:digits}'] }
    ]
  });
  scene({
    id: 'svc-restaurant-booking', v: 1, zh: '订位：周五晚上四个人', place: 'service', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d2:a2'], roles: { A: '@pool', B: 'you' }, ielts: ['L1'],
    gloss: { table: '桌子' },
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-time', 'L-turn'], at: '餐厅 · 电话', slots: { d: 'weekday', t: 'time', c: 'count' }, only: { t: ['18:00', '18:30h', '19:00', '19:30h', '20:00'] }, bind: ['d', 't'],
        limit: { words: 1, num: true },
        alt: [
          [['B', 'Hello. Can I have a table for {c} on {d}?', '你好。我能订{d.zh}{c.zh}个人的桌子吗？'], ['A', 'Yes. What time?', '可以。几点？'],
            ['B', 'At {t~}—sorry, at {t}.', '{t~.zh}——抱歉，{t.zh}。']],
          [['A', 'A table for {c}, on {d}, at {t}. Is that right?', '{d.zh}{t.zh}，{c.zh}个人的桌子，对吗？'], ['B', 'Yes, that\'s right. Thank you!', '对，没错。谢谢！']]],
        form: { title: ['Table booking', '订位'], rows: [['Day', '星期', '?d'], ['Time', '时间', '?t'], ['People', '人数', '{c}']] },
        q: { zh: '听订位电话，把订位单填完' } },
      { f: 'LC', k: 'lc', subs: ['L-date', 'L-turn'], at: '餐厅 · 电话', slots: { d: 'weekday', c: 'count' }, bind: ['d'],
        say: [['you', 'Hello. A table for {c} on {d~0}, please.', '你好。我想订{d~0.zh}{c.zh}个人的桌子。'], ['A', 'Sorry, {d~0} is full. What about {d}?', '抱歉，{d~0.zh}满了。{d.zh}可以吗？'], ['you', '{d} is great. Thank you!', '{d.zh}很好。谢谢！']],
        q: { en: 'Which day is the table for?', zh: '最后订的是星期几？' }, opts: ['{d}', '{d~}', '{d~}'], glossAdd: { full: '满的' } }
    ]
  });
  scene({
    id: 'season-market-day', v: 1, zh: '周末集市广播', place: 'season', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d2:a2'], roles: { A: '@pool' }, ielts: ['L2'],
    gloss: { fruit: '水果' },
    frames: [
      { f: 'LN', k: 'ln', subs: ['L-time', 'L-turn'], at: 'Maple Bridge 广播', slots: { t: 'time', t2: 'time' }, only: { t: ['08:00o', '09:00o', '08:30h', '09:30h', '09:15q'], t2: ['16:00o', '17:00o', '15:00o'] }, bind: ['t'],
        limit: { words: 1, num: true },
        alt: [
          [['A', 'Hello, everyone! The Saturday market opens at {t~}… sorry, at {t} this week.', '大家好！周六集市这周{t~.zh}……抱歉，是{t.zh}开门。'], ['A', 'It closes at {t2}. Fresh fruit is cheap!', '{t2.zh}关门。新鲜水果很便宜！']],
          [['A', 'Hello, everyone! This Saturday, the market opens at {t}.', '大家好！这周六集市{t.zh}开门。'], ['A', 'It closes at {t2}.', '{t2.zh}关门。']]],
        notes: { title: ['The Saturday market', '周六集市'], rows: [['Opens at', '开门时间', '?t'], ['Closes at', '关门时间', '{t2:digits}']] },
        q: { zh: '听广播，把集市的开门时间记下来' }, glossAdd: { fresh: '新鲜的' } },
      { f: 'LC', k: 'lc', subs: ['L-time', 'L-detail'], at: 'Maple Bridge 广播', slots: { t: 'time' }, only: { t: ['08:00o', '09:00o', '08:30h', '09:30h', '09:15q'] }, bind: ['t'],
        say: [['A', 'The Saturday market opens at {t} this week. See you there!', '这周周六集市{t.zh}开门。到时见！']],
        q: { en: 'What time does the market open?', zh: '集市几点开门？' }, opts: ['{t:digits}', '{t~:digits}', '{t~:digits}'] }
    ]
  });
  scene({
    id: 'market-umbrella', v: 1, zh: '买伞：十五还是五十', place: 'market', tier: 1, ch: 1, needs: ['w1d2:a2'], roles: { A: '@pool' }, ielts: ['L1'],
    gloss: { umbrella: '雨伞' },
    frames: [
      { f: 'LP', k: 'lp', subs: ['L-num'], at: '周六集市的伞摊', slots: { p: 'pair' }, bind: ['p'], only: { p: ['fifteen|fifty', 'thirteen|thirty'] },
        say: [['A', 'This umbrella is {p} pounds.', '这把伞 {p:digits} 英镑。']], q: { zh: '摊主说了一个价钱。是哪个数？' }, opts: ['{p}', '{p~}'], optZh: true },
      { f: 'LC', k: 'lc', subs: ['L-num', 'L-price'], at: '周六集市的伞摊', slots: { p: 'price', p2: 'price' }, only: { p: ['15', '13', '14', '16'] }, derive: { p2: ['tt', 'p'] }, bind: ['p'], avoid: { p: ['p2'] },
        say: [['A', 'This umbrella is {p}. That one is {p2}.', '这把伞{p.zh}，那把{p2.zh}。']],
        q: { en: 'How much is this umbrella?', zh: '这把伞多少钱？' }, opts: ['{p:digits}', '{p2:digits}', '{p~:digits}'] }
    ]
  });
  scene({
    id: 'market-discount', v: 1, zh: '超市折扣', place: 'market', tier: 1, ch: 1, needs: ['w1d2:a2', 'w1d2:a3'], roles: { A: 'lily' }, ielts: ['RG1', 'W1'],
    gloss: { supermarket: '超市' },
    frames: [
      { f: 'GC', k: 'gc', subs: ['G-svo', 'W-sent'], concept: 'complete', at: '手机消息', slots: { d: 'weekday' }, bind: [],
        msg: ['A', 'Is very cheap! The shop has a discount on {d}. 🛍', '很便宜！这家店{d.zh}打折。🛍'],
        q: { zh: 'Lily 太激动了，第一句少了一个词。她应该写：' }, opts: ['=It is very cheap!|很便宜！', '=Very cheap is!|（语序不对）', '=Is it very cheap!|（这是问句的语序）'] },
      { f: 'RN', k: 'rn', subs: ['R-detail', 'L-date'], at: '超市门口的告示', slots: { d: 'weekday', p1: 'price', p2: 'price' }, only: { p1: ['1', '1.50', '2'], p2: ['2.50', '3', '3.50'] }, bind: ['d'],
        text: { kind: 'notice', title: ['SUPERMARKET · DISCOUNT DAY', '超市 · 折扣日'], lines: [['Every {d}: tea {p1:digits}, not {p2:digits}!', '每{d.zh}：茶 {p1:digits}，不是 {p2:digits}！'], ['Pay by card or cash.', '刷卡或付现金都可以。']] },
        items: [
          { f: 'RN', subs: ['R-detail', 'L-date'], on: 'd', q: { en: 'When is the discount day?', zh: '哪天是折扣日？' }, opts: ['{d}', '{d~}', '{d~}'] },
          { f: 'RN', subs: ['R-number', 'L-price'], on: 'p1', q: { en: 'How much is tea on the discount day?', zh: '折扣日茶多少钱？' }, opts: ['{p1:digits}', '{p2:digits}', '{p1~:digits}'] }] }
    ]
  });
  scene({
    id: 'market-pay', v: 1, zh: '付款方式', place: 'market', tier: 1, ch: 1, needs: ['w1d2:a2'], roles: { A: '@pool', B: 'you' }, ielts: ['L1'], gloss: {},
    frames: [
      { f: 'LC', k: 'lc', subs: ['L-detail', 'V-coll'], at: '超市收银台', slots: { p: 'price' }, only: { p: ['3.50', '4.50', '13.50', '15', '12'] }, bind: ['p'],
        alt: [
          [['A', 'That\'s {p}, please.', '一共{p.zh}。'], ['B', 'Can I pay by card?', '我可以刷卡吗？'], ['A', 'Sorry, cash only today.', '抱歉，今天只收现金。']],
          [['A', 'That\'s {p}. Card or cash?', '一共{p.zh}。刷卡还是现金？'], ['B', 'Cash, please. Here you are.', '现金。给你。']]],
        q: { en: 'How much is it?', zh: '一共多少钱？' }, opts: ['{p:digits}', '{p~:digits}', '{p~:digits}'], glossAdd: { only: '只' } },
      { f: 'VC', k: 'vc', subs: ['V-coll'], at: '超市收银台', slots: { c: 'coll' }, bind: ['c'], ctype: 'pay', msgFromAlt: true,
        alt: [[['you', 'Can I {c:blank}, please?', '我可以{c.zh}吗？']], [['you', 'Can I pay {c:blank}, please?', '我可以{c.zh}付吗？']]], altFit: ['^pay:pay (by|in|with) ', '^pay:(by|in|with) '],
        q: { zh: '选一个词，让这句话说得对' }, collOpts: ['by', 'in', 'at'] }
    ]
  });
  scene({
    id: 'cafe-menu', v: 1, zh: '价目板', place: 'cafe', tier: 1, ch: 1, needs: ['w1d2:a2'], roles: { A: 'leo' }, ielts: ['RG1', 'L1'], gloss: { menu: '菜单' },
    frames: [
      { f: 'RN', k: 'rn', subs: ['R-number', 'L-price'], at: '咖啡馆的价目板', slots: { p1: 'price', p2: 'price', p3: 'price' }, only: { p1: ['1.50', '2', '2.50'], p2: ['2.50', '3', '3.50'], p3: ['3', '4', '4.50'] },
        distinct: [['p1', 'p2', 'p3']], bind: ['p1', 'p2'],
        text: { kind: 'notice', title: ['MOON CAFÉ · MENU', '月光咖啡馆 · 价目'], lines: [['Tea   {p1:digits}', '茶  {p1:digits}'], ['Coffee   {p2:digits}', '咖啡  {p2:digits}'], ['Tea and cake   {p3:digits}', '茶配蛋糕  {p3:digits}'], ['Saturday: 10% discount!', '周六：打九折！']] },
        items: [
          { f: 'RN', subs: ['R-number', 'L-price'], on: 'p2', q: { en: 'How much is a coffee?', zh: '一杯咖啡多少钱？' }, opts: ['{p2:digits}', '{p1:digits}', '{p2~:digits}'] },
          { f: 'RT', subs: ['R-tfng', 'R-detail'], stmt: { en: 'There is a discount on Saturday.', zh: '周六有折扣。' }, truth: 'T' },
          { f: 'RN', subs: ['R-number'], on: 'p1', q: { en: 'How much is a tea?', zh: '一杯茶多少钱？' }, ans: '{p1:digits}', limit: { words: 1, num: true }, input: 'type' }],
        glossAdd: { cake: '蛋糕' } },
      { f: 'LC', k: 'lc', subs: ['L-price', 'L-detail'], at: '月光咖啡馆', slots: { p: 'price' }, only: { p: ['1.50', '2.50', '3.50'] }, bind: ['p'],
        say: [['you', 'A cup of tea, please. How much is it?', '一杯茶，谢谢。多少钱？'], ['A', 'That\'s {p}, please.', '一共{p.zh}。']],
        q: { en: 'How much is the tea?', zh: '茶多少钱？' }, opts: ['{p:digits}', '{p~:digits}', '{p~:digits}'] }
    ]
  });
  scene({
    id: 'cafe-change', v: 1, zh: '找零算错了', place: 'cafe', tier: 1, ch: 1, needs: ['w1d2:a2'], roles: { A: 'leo', B: 'you' }, ielts: ['L1'], gloss: { change: '找零' },
    frames: [
      { f: 'LC', k: 'lc', subs: ['L-num', 'L-price'], at: '月光咖啡馆 · 收银台', slots: { p: 'price' }, only: { p: ['13', '15', '14', '16'] }, bind: ['p'],
        say: [['A', 'Your total is {p~0}.', '一共{p~0.zh}。'], ['B', 'Sorry, is it {p~0}? I think it\'s {p}.', '抱歉，是{p~0.zh}吗？我想是{p.zh}。'], ['A', 'Oh, yes. Sorry! It\'s {p}.', '哦，对。抱歉！是{p.zh}。']],
        q: { en: 'What is the right total?', zh: '正确的总价是多少？' }, opts: ['{p:digits}', '{p~0:digits}', '{p~1:digits}'] },
      { f: 'LP', k: 'lp', subs: ['L-num'], at: '月光咖啡馆 · 收银台', slots: { p: 'pair' }, bind: ['p'], only: { p: ['thirteen|thirty', 'fifteen|fifty'] },
        say: [['A', 'That\'s {p} pounds, please.', '一共 {p:digits} 英镑。']], q: { zh: 'Leo 说的是哪个数？' }, opts: ['{p}', '{p~}'], optZh: true }
    ]
  });
  scene({
    id: 'market-fruit', v: 1, zh: '周六市场买水果', place: 'market', tier: 1, ch: 1, needs: ['w1d2:a2', 'w1d2:b2'], roles: { A: 'tom', B: '@pool' }, ielts: ['L1', 'RG1'],
    gloss: { apples: '苹果', bananas: '香蕉' },
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-price', 'V-coll'], at: '周六集市的水果摊', slots: { p: 'price', q: 'price' }, only: { p: ['2', '1.50', '2.50', '3'], q: ['1', '1.50', '2'] }, distinct: [['p', 'q']],
        bind: ['p'], limit: { words: 1, num: true },
        alt: [
          [['A', 'How much is a kilo of apples?', '一公斤苹果多少钱？'], ['B', 'A kilo of apples is {p}. A bunch of bananas is {q}.', '一公斤苹果{p.zh}。一串香蕉{q.zh}。']],
          [['B', 'Apples are {p~} a kilo.', '苹果一公斤{p~.zh}。'], ['B', 'No, sorry, {p} a kilo today.', '不对，抱歉，今天一公斤{p.zh}。'], ['A', 'Great. And a bunch of bananas?', '好。那一串香蕉呢？'], ['B', '{q:cap}.', '{q.zh}。']]],
        form: { title: ['Saturday market', '周六集市'], rows: [['Apples (a kilo)', '苹果（一公斤）', '£?p'], ['Bananas (a bunch)', '香蕉（一串）', '{q:digits}']] },
        q: { zh: '帮 Tom 把价钱记下来' } },
      { f: 'RN', k: 'rn', subs: ['R-number', 'R-detail'], at: 'Tom 写的购物单', slots: { p: 'price' }, only: { p: ['2', '3', '2.50'] }, bind: ['p'],
        text: { kind: 'note', title: ['SATURDAY SHOPPING', 'Tom 的周六购物单'], lines: [['Saturday market — pay in cash!', '周六集市——付现金！'], ['a kilo of apples: {p:digits}', '一公斤苹果：{p:digits}'], ['a bunch of bananas: £1.50', '一串香蕉：£1.50']] },
        items: [
          { f: 'RN', subs: ['R-detail', 'V-coll'], q: { en: 'How does Tom pay?', zh: 'Tom 怎么付钱？' }, opts: ['=In cash|付现金', '=By card|刷卡', '=He does not pay|他不付钱'] },
          { f: 'RN', subs: ['R-number'], on: 'p', q: { en: 'How much is a kilo of apples?', zh: '一公斤苹果多少钱？' }, opts: ['{p:digits}', '=£1.50', '{p~:digits}'] }] }
    ]
  });
  scene({
    id: 'health-hours', v: 1, zh: '健康中心开放时间', place: 'health', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d2:a2'], roles: { A: '@pool' }, ielts: ['RG1', 'L1'], gloss: { closed: '关门' },
    frames: [
      { f: 'RT', k: 'rt', subs: ['R-tfng', 'R-para'], at: '健康中心门口的告示', slots: { t1: 'time', t2: 'time' }, only: { t1: ['08:00o', '08:30h', '09:00o'], t2: ['10:00o', '09:30h'] }, bind: ['t1'],
        text: { kind: 'notice', title: ['PARK STREET HEALTH CENTRE', '公园街健康中心'], lines: [['Monday – Friday: {t1:digits} – 6.00 pm', '周一到周五：上午{t1.zh}到下午六点'], ['Saturday: {t2:digits} – 12.00 pm', '周六：上午{t2.zh}到中午十二点'], ['Sunday: closed', '周日：关门']] },
        items: [
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'The centre is not open on Sunday.', zh: '健康中心周日不开门。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'R-number'], on: 't1', stmt: { en: 'On Monday, the centre opens at {t1:digits}.', zh: '周一健康中心{t1.zh}开门。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'R-number'], on: 't2', stmt: { en: 'On Saturday, it opens at {t1:digits}.', zh: '周六它{t1.zh}开门。' }, truth: 'F' }], glossAdd: { centre: '中心' } },
      { f: 'LN', k: 'ln', subs: ['L-time', 'L-detail'], at: '健康中心的电话留言', slots: { t2: 'time' }, only: { t2: ['10:00o', '09:30h', '09:15q'] }, bind: ['t2'], limit: { words: 1, num: true },
        say: [['A', 'Hello. On Saturday, the health centre opens at {t2}.', '你好。周六健康中心{t2.zh}开门。']],
        notes: { title: ['Health centre on Saturday', '健康中心周六'], rows: [['Opens at', '开门时间', '?t2']] }, q: { zh: '听电话留言，把周六的开门时间记下来' } }
    ]
  });
  scene({
    id: 'school-club-fair', v: 1, zh: '社团招新：周三晚上练口语', place: 'school', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d5:a2'], roles: { A: 'ben', C: '@pool' }, ielts: ['L2', 'L3'],
    gloss: { club: '社团' },
    frames: [
      { f: 'LC', k: 'lc', subs: ['L-date', 'L-detail'], at: '学校的社团招新', slots: { d: 'weekday' }, bind: ['d'],
        say: [['C', 'Our English club is on {d} evening. It\'s free!', '我们的英语社团在{d.zh}晚上，免费！'], ['A', 'Great! {d} evening is OK for me.', '太好了！{d.zh}晚上我可以。']],
        q: { en: 'When is the English club?', zh: '英语社团是哪天？' }, opts: ['{d}', '{d~}', '{d~}'] },
      { f: 'RM', k: 'rm', subs: ['R-match'], at: '社团招新的海报', slots: { d1: 'weekday', d2: 'weekday', d3: 'weekday' }, distinct: [['d1', 'd2', 'd3']], bind: ['d1'],
        text: { kind: 'notice', title: ['CLUBS THIS WEEK', '本周社团'], lines: [['A  English club — {d1} evening', 'A  英语社团——{d1.zh}晚上'], ['B  Cooking club — {d2} evening', 'B  烹饪社团——{d2.zh}晚上'], ['C  Walking club — {d3} morning', 'C  散步社团——{d3.zh}早上']] },
        stmts: [{ en: 'You can cook with friends on {d2}.', zh: '你{d2.zh}可以和朋友们一起做饭。', ans: 'B' }, { en: 'You can practise English on {d1}.', zh: '你{d1.zh}可以练英语。', ans: 'A' }, { en: 'You can walk in the morning.', zh: '你可以早上散步。', ans: 'C' }],
        q: { en: 'Which club is it? Write A, B or C.', zh: '是哪个社团？选 A、B 或 C。' }, glossAdd: { practise: '练习' } }
    ]
  });
  scene({
    id: 'home-parcel-note', v: 1, zh: '快递没送到的留条', place: 'home', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d2:a2', 'w1d4:a2'], roles: { A: '@pool' }, ielts: ['RG1', 'W1'],
    gloss: { parcel: '包裹', shop: '商店' },
    frames: [
      { f: 'RN', k: 'rn', subs: ['R-detail', 'R-number'], at: '门上的留条', slots: { d: 'weekday', t: 'time', s: 'street' }, bind: ['d', 't'], only: { t: ['09:00o', '10:00o', '14:00o', '09:30h', '14:30h'] },
        text: { kind: 'note', title: ['Sorry, you were not at home!', '抱歉，您不在家！'], lines: [['We will come back tomorrow, {d}, at {t}.', '我们明天{d.zh}{t.zh}再来。'], ['Or you can get your parcel from the shop at {s:digits}.', '您也可以到{s.zh}的商店取包裹。']] },
        items: [
          { f: 'RN', subs: ['R-detail', 'L-date'], on: 'd', q: { en: 'When will they come back?', zh: '他们什么时候再来？' }, opts: ['On {d}|{d.zh}', 'On {d~}|{d~.zh}', 'On {d~}|{d~.zh}'] },
          { f: 'RN', subs: ['R-number', 'L-time'], on: 't', q: { en: 'What time will they come?', zh: '他们几点来？' }, opts: ['{t:digits}', '{t~:digits}', '{t~:digits}'] }] },
      { f: 'WK', k: 'wk', subs: ['W-task'], at: '给 Lily 的留言', slots: { d: 'weekday' }, bind: [],
        task: { kind: 'W', bullets: [{ en: 'say where the parcel is', zh: '说包裹在哪儿', keys: ['shop'] }, { en: 'say when they come again', zh: '说他们什么时候再来', keys: ['@weekday', 'tomorrow'] }, { en: 'ask Lily to be at home', zh: '请 Lily 在家', keys: ['home'] }] },
        msg: ['you', 'Hi Lily! They\'ll come back with your parcel tomorrow ({d}). Or you can get it at the shop on Park Street. 📦', '嗨 Lily！他们明天（{d.zh}）会再把包裹送来。你也可以去公园街的商店取。📦'],
        q: { zh: '题目要写三个要点。这条留言哪一点没写到？' }, opts: ['@2', '@0', '@1'] }
    ]
  });

  //  —— step 2a: the rest of §4.3's table (home) ——
  var RENTS = ['450', '500', '550', '600', '650', '700', '750', '850', '950'];
  var ROOMS3 = ['kitchen', 'bedroom', 'bathroom', 'living room'];
  var T_DAY = ['09:00o', '10:00o', '11:00o', '14:00o', '15:00o', '16:00o', '09:30h', '10:30h', '14:30h', '15:30h', '09:15q', '10:45q', '14:15q', '15:45q'];
  scene({
    id: 'home-viewing', v: 1, zh: 'Mrs Wood 带你看 3 号公寓', place: 'home', tier: 1, ch: 1, needs: ['w1d4:a2'], roles: { A: 'wood', B: 'you' }, ielts: ['L1', 'L2'], gloss: {},
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-price', 'L-num'], at: '3 号公寓 · 看房', slots: { p: 'price', n: 'dom' }, only: { p: RENTS }, bind: ['p', 'n'], limit: { words: 1, num: true },
        alt: [
          [['A', 'This is Flat 3. The rent is {p} a month.', '这就是 3 号公寓。房租每月{p.zh}。'], ['B', 'OK. When do I pay the rent?', '好的。我什么时候交房租？'],
            ['A', 'On the {n} of every month, please.', '每个月{n.zh}号交。']],
          [['B', 'Is the rent {p~} a month?', '房租是每月{p~.zh}吗？'], ['A', 'No, it\'s {p} a month.', '不是，是每月{p.zh}。'],
            ['A', 'Please pay on the {n} of every month.', '请在每个月{n.zh}号交。']]],
        form: { title: ['Flat 3, 8 Park Street', '公园街 8 号 3 号公寓'], rows: [['Rent', '房租', '£?p a month'], ['Pay on', '交租日', 'the ?n of every month']] },
        q: { zh: '跟 Mrs Wood 看房，把房租和交租日记下来' } },
      { f: 'LC', k: 'lc', subs: ['L-detail'], at: '3 号公寓 · 看房', slots: { r: 'room', r2: 'room' }, only: { r: ROOMS3, r2: ROOMS3 }, dOnly: { r: ROOMS3 }, distinct: [['r', 'r2']],
        bind: ['r'], avoid: { r: ['r2'] },
        alt: [
          [['A', 'The {r2} is small, but the {r} is very big.', '{r2.zh}很小，但{r.zh}很大。'], ['B', 'Oh, I love the {r}!', '哦，我很喜欢这个{r.zh}！']],
          [['B', 'Is the {r2} big?', '{r2.zh}大吗？'], ['A', 'No, it\'s small. But the {r} is big.', '不大，挺小的。不过{r.zh}很大。']]],
        q: { en: 'Which room is big?', zh: '哪个房间很大？' }, opts: ['{r}', '{r2}', '{r~}'] },
      { f: 'LM', k: 'lm', subs: ['L-map', 'L-detail'], at: '3 号公寓 · 平面图', slots: { r: 'room', r2: 'room', r3: 'room' }, only: { r: ROOMS3, r2: ROOMS3, r3: ROOMS3 },
        distinct: [['r', 'r2', 'r3']], bind: ['r'],
        alt: [
          [['A', 'Come in! The first room is the {r2}.', '请进！第一个房间是{r2.zh}。'], ['A', 'Next to it is the {r}.', '它旁边是{r.zh}。'], ['A', 'And the {r3} is at the back.', '最里面是{r3.zh}。']],
          [['B', 'Where\'s the {r}, Mrs Wood?', '伍德太太，{r.zh}在哪儿？'], ['A', 'It\'s the second room, next to the {r2}.', '是第二个房间，在{r2.zh}旁边。'],
            ['A', 'The {r3} is at the back.', '{r3.zh}在最里面。']]],
        table: { title: ['Flat 3: the plan', '3 号公寓平面图'], rows: [['door →', 'A', 'B', 'C']] },
        q: { en: 'Where is the {r}?', zh: '{r.zh}在平面图上的哪个位置？' }, opts: ['=B|B：进门第二间', '=A|A：进门第一间', '=C|C：最里面'] },
      { f: 'LM', k: 'lm-c', subs: ['L-map', 'L-detail'], at: '3 号公寓 · 平面图', slots: { r: 'room', r2: 'room', r3: 'room' }, only: { r: ROOMS3, r2: ROOMS3, r3: ROOMS3 },
        distinct: [['r', 'r2', 'r3']], bind: ['r'],
        alt: [
          [['A', 'The first room is the {r2}, then the {r3}.', '第一个房间是{r2.zh}，然后是{r3.zh}。'], ['A', 'The {r} is at the back, near the window.', '{r.zh}在最里面，靠窗。']],
          [['B', 'Is the {r} the first room?', '{r.zh}是第一个房间吗？'], ['A', 'No. The first room is the {r2}.', '不是。第一个房间是{r2.zh}。'], ['A', 'The {r} is at the back.', '{r.zh}在最里面。']]],
        table: { title: ['Flat 3: the plan', '3 号公寓平面图'], rows: [['door →', 'A', 'B', 'C']] },
        q: { en: 'Where is the {r}?', zh: '{r.zh}在平面图上的哪个位置？' }, opts: ['=C|C：最里面', '=A|A：进门第一间', '=B|B：进门第二间'] }
    ]
  });
  scene({
    id: 'home-rent-call', v: 1, zh: '打电话问房租', place: 'home', tier: 1, ch: 1, needs: ['w1d2:a2', 'w1d4:a2'], roles: { A: 'wood', B: 'anna' }, ielts: ['L1'], gloss: {},
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-price', 'L-date'], at: '电话 · Anna 打给房东', slots: { p: 'price', d: 'weekday', t: 'time' }, only: { p: RENTS, t: T_DAY }, bind: ['p', 'd', 't'],
        limit: { words: 1, num: true },
        alt: [
          [['B', 'Hello, Mrs Wood. How much is the flat on King Street?', '你好，伍德太太。国王街那套公寓多少钱？'], ['A', 'It\'s {p} a month.', '每月{p.zh}。'],
            ['B', 'Great. Can I see it on {d}?', '太好了。我{d.zh}能去看看吗？'], ['A', 'Yes, of course. Come at {t}.', '当然可以。{t.zh}来吧。']],
          [['B', 'Hi. How much is the flat on King Street, please?', '你好。请问国王街那套公寓多少钱？'], ['A', 'It\'s {p~}… sorry, no. It\'s {p} a month.', '{p~.zh}……不对，抱歉。是每月{p.zh}。'],
            ['B', 'OK. Can I see it on {d}, at {t}?', '好的。我{d.zh}{t.zh}能去看看吗？'], ['A', 'Yes, that\'s fine.', '可以，没问题。']]],
        form: { title: ['Flat on King Street', '国王街的公寓'], rows: [['Rent', '房租', '£?p a month'], ['Visit on', '看房日', '?d'], ['Time', '时间', '?t']] },
        q: { zh: '听 Anna 打电话问房子，帮她把记录填完' } },
      { f: 'LN', k: 'ln', subs: ['L-price', 'L-date'], at: 'Mrs Wood 的语音留言', slots: { p: 'price', n: 'dom' }, only: { p: RENTS }, bind: ['p', 'n'], limit: { words: 1, num: true },
        alt: [
          [['A', 'Hi Anna, it\'s Mrs Wood. The King Street flat is {p} a month.', '嗨 Anna，我是伍德太太。国王街那套公寓每月{p.zh}。'],
            ['A', 'You pay on the {n} of every month.', '每个月{n.zh}号交房租。']],
          [['A', 'Hello Anna, just a quick message about the flat.', '你好 Anna，简单说一下房子的事。'], ['A', 'The rent is {p} a month. Please pay on the {n}.', '房租每月{p.zh}。请在{n.zh}号交。']]],
        notes: { title: ['Flat on King Street', '国王街的公寓'], rows: [['Rent', '房租', '£?p a month'], ['Pay on', '交租日', 'the ?n of every month']] },
        q: { zh: '听房东的留言，帮 Anna 把笔记补完整' } },
      { f: 'RN', k: 'rn', subs: ['R-number', 'L-price'], at: '手机消息', slots: { p: 'price', d: 'weekday', t: 'time' }, only: { p: RENTS, t: T_DAY }, bind: ['p', 'd'],
        text: { kind: 'message', title: ['Message from Mrs Wood', '伍德太太的消息'],
          lines: [['Hi Anna! The flat on King Street is {p:digits} a month.', '嗨 Anna！国王街那套公寓每月 {p:digits}。'], ['You can see it on {d} at {t:digits}.', '你可以{d.zh}{t.zh}来看。'],
            ['It\'s quiet, and it\'s near the bus stop. 🏠', '那里很安静，离公交站也近。🏠']] },
        items: [
          { f: 'RN', subs: ['R-number', 'L-price'], concept: 'price', on: 'p', q: { en: 'How much is the rent?', zh: '房租多少钱？' }, opts: ['{p:digits}', '{p~:digits}', '{p~:digits}'] },
          { f: 'RN', subs: ['R-detail', 'L-date'], concept: 'when', on: 'd', q: { en: 'When can Anna see the flat?', zh: 'Anna 哪天可以去看房？' }, opts: ['On {d}|{d.zh}', 'On {d~}|{d~.zh}', 'On {d~}|{d~.zh}'] },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'The flat is not noisy.', zh: '这套公寓不吵。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'L-date'], on: 'd', stmt: { en: 'Anna can see the flat on {d~}.', zh: 'Anna 可以{d~.zh}去看房。' }, truth: 'F' }] }
    ]
  });
  scene({
    id: 'home-address', v: 1, zh: '把地址发给朋友', place: 'home', tier: 1, ch: 1, needs: ['w1d4:a2', 'w1d4:b1'], roles: { A: 'lily', B: '@pool', C: '@pool' }, ielts: ['L1', 'W1'], gloss: {},
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-num', 'L-detail'], at: '电话 · 新朋友报地址', slots: { h: 'teenty', st: 'stname', d: 'weekday' }, bind: ['h', 'd'], limit: { words: 1, num: true },
        alt: [
          [['B', 'Come to my flat on {d}! My address is {h} {st}.', '{d.zh}来我家吧！我的地址是{st.zh}{h.zh}号。'], ['you', 'Sorry, {h~}?', '抱歉，是{h~.zh}吗？'],
            ['B', 'No, {h}. {h:cap} {st}.', '不是，是{h.zh}。{st.zh}{h.zh}号。']],
          [['you', 'What\'s your address?', '你的地址是什么？'], ['B', 'It\'s {h} {st}. Come on {d}!', '{st.zh}{h.zh}号。{d.zh}来吧！']]],
        form: { title: ['{B}\'s flat', '{B} 家'], rows: [['Address', '地址', '?h {st}'], ['Day', '哪天去', '?d']] },
        q: { zh: '{B} 请你去家里玩。把地址和日子记下来' } },
      { f: 'VG', k: 'vg', subs: ['V-spell', 'V-cal'], at: '手机消息', slots: { h: 'teenty', st: 'stname', d: 'weekday' }, bind: ['d'],
        msg: ['C', 'My address is {h:digits} {st}. See you on ?d! 👋', '我的地址是{st.zh}{h.zh}号。____ 见！👋'],
        q: { zh: '{C} 发来地址，有一个词没打出来。听一听，把它写上。' }, say: [['C', '{d}', '{d.zh}']] },
      { f: 'LD', k: 'ld', subs: ['L-dict'], at: '电话里介绍住的地方', slots: { s: 'dsent' }, bind: ['s'], fit: 'address|flat|rent|live|kitchen',
        alt: [[['A', '{s}', '{s.zh}']], [['B', '{s}', '{s.zh}']], [['C', '{s}', '{s.zh}']]], q: { zh: '有人在电话里介绍住的地方，说了一句话。把它听写下来。' } },
      { f: 'WT', k: 'wt', subs: ['W-sent'], at: '手机消息', slots: { s: 'xsent' }, bind: ['s'], fit: 'live in|bedroom|rent|near my home|sofa',
        alt: [[['C', 'Tell me about your new flat! 🏠', '说说你的新公寓吧！🏠']], [['B', 'How\'s your new home? 🏠', '你的新家怎么样？🏠']]], msgFromAlt: true, q: { zh: '用英文回复：{s.zh}' } }
    ]
  });
  scene({
    id: 'home-rules', v: 1, zh: '公寓规则告示', place: 'home', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d2:a2', 'w1d4:a2'], roles: { A: 'wood' }, ielts: ['RG1'],
    gloss: { rubbish: '垃圾', party: '派对' },
    frames: [
      { f: 'RT', k: 'rt', subs: ['R-tfng', 'R-para'], at: '楼道里的告示', slots: { d: 'weekday', n: 'dom' }, not: { d: ['saturday', 'sunday'] }, bind: ['d'],
        text: { kind: 'notice', title: ['8 PARK STREET: PLEASE READ', '公园街 8 号：请阅读'],
          lines: [['Please be quiet after 10.00 pm.', '晚上 10 点以后请保持安静。'], ['Rubbish day: every {d} morning.', '收垃圾日：每{d.zh}早上。'],
            ['No parties from Monday to Thursday.', '周一到周四不要开派对。'], ['Pay the rent on the {n#} of every month. — Mrs Wood', '每月{n.zh}号交房租。——伍德太太']] },
        items: [
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'At 11.00 pm, it is OK to be noisy.', zh: '晚上 11 点可以吵闹。' }, truth: 'F' },
          { f: 'RT', subs: ['R-tfng', 'R-detail'], stmt: { en: 'You pay the rent every week.', zh: '房租每周交一次。' }, truth: 'F' },
          { f: 'RN', subs: ['R-detail', 'L-date'], concept: 'when', on: 'd', q: { en: 'When is rubbish day?', zh: '哪天收垃圾？' },
            opts: ['{d} morning|{d.zh}早上', '{d} evening|{d.zh}晚上', '{d~} morning|{d~.zh}早上'] },
          { f: 'RN', subs: ['R-number', 'L-date'], concept: 'when', q: { en: 'When do you pay the rent?', zh: '每月几号交房租？' }, opts: ['On the {n#}|{n.zh}号', 'On the {n~#}|{n~.zh}号', 'On the {n~#}|{n~.zh}号'] },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'You can have a party on Saturday.', zh: '周六可以开派对。' }, truth: 'T' }] },
      { f: 'LC', k: 'lc', subs: ['L-date', 'L-detail'], at: '楼道里', slots: { d: 'weekday' }, not: { d: ['saturday', 'sunday'] }, bind: ['d'],
        alt: [
          [['A', 'Hello! Rubbish day is {d} morning.', '你好！收垃圾是{d.zh}早上。'], ['you', 'Every {d}?', '每{d.zh}都是吗？'], ['A', 'Yes, every {d}.', '对，每{d.zh}都是。']],
          [['you', 'Mrs Wood, is rubbish day on {d~}?', '伍德太太，收垃圾是{d~.zh}吗？'], ['A', 'No, it\'s on {d}, in the morning.', '不是，是{d.zh}早上。']]],
        q: { en: 'When is rubbish day?', zh: '哪天收垃圾？' }, opts: ['{d}', '{d~}', '{d~}'] },
      { f: 'VG', k: 'vg', subs: ['V-spell', 'V-cal'], at: '手机消息', slots: { d: 'weekday' }, not: { d: ['saturday', 'sunday'] }, bind: ['d'],
        msg: ['you', 'Lily, rubbish day is ?d morning. 🗑', 'Lily，收垃圾是 ____ 早上。🗑'],
        q: { zh: '你在给 Lily 发消息，有一个词还没打。听一听，把它写上。' }, say: [['A', '{d}', '{d.zh}']] }
    ]
  });
  scene({
    id: 'home-bills', v: 1, zh: '和 Lily 分账单', place: 'home', tier: 1, ch: 1, needs: ['w1d2:a2', 'w1d2:b1'], roles: { A: 'lily', B: 'you' }, ielts: ['L1', 'RG1'], gloss: {},
    frames: [
      { f: 'LC', k: 'lc', subs: ['L-price', 'L-num'], at: '家里 · 厨房', slots: { p: 'price', h: 'price' }, only: { p: ['30', '40', '50', '60', '70', '80', '90'] }, derive: { h: ['half', 'p'] },
        bind: ['p'],
        alt: [
          [['A', 'The water bill is {p} this month.', '这个月的水费是{p.zh}。'], ['B', 'So we pay half each?', '那我们每人付一半？'], ['A', 'Yes. That\'s {h} each.', '对。每人{h.zh}。']],
          [['A', 'The phone bill is {p}.', '电话费是{p.zh}。'], ['A', 'Half is {h~}… no, sorry, {h}.', '一半是{h~.zh}……不对，抱歉，是{h.zh}。'], ['B', 'OK, {h}. Here you are.', '好的，{h.zh}。给你。']]],
        q: { en: 'How much do you pay?', zh: '你要付多少钱？' }, opts: ['{h:digits}', '{p:digits}', '{h~:digits}'] },
      { f: 'RN', k: 'rn', subs: ['R-number', 'R-detail'], at: '冰箱上的便条', slots: { p1: 'price', p2: 'price', s: 'price', h: 'price', d: 'weekday' },
        only: { p1: ['20', '30', '40'], p2: ['12', '14', '16', '18'] }, derive: { s: ['sum', 'p1', 'p2'], h: ['half', 's'] }, bind: ['p2', 'd'],
        text: { kind: 'note', title: ['BILLS THIS MONTH', '这个月的账单'],
          lines: [['Water: {p1:digits}', '水费：{p1:digits}'], ['Phone: {p2:digits}', '电话费：{p2:digits}'], ['Total: {s:digits}. That\'s {h:digits} each.', '一共 {s:digits}，每人 {h:digits}。'],
            ['Please pay me in cash by {d}. — Lily', '请在{d.zh}之前付现金给我。——Lily']] },
        items: [
          { f: 'RN', subs: ['R-number', 'L-price'], concept: 'price', on: 'p2', q: { en: 'How much is the phone bill?', zh: '电话费多少钱？' }, opts: ['{p2:digits}', '{p1:digits}', '{p2~:digits}'] },
          { f: 'RN', subs: ['R-detail'], concept: 'how', q: { en: 'How do you pay Lily?', zh: '你怎么把钱给 Lily？' }, opts: ['=In cash|付现金', '=By card|刷卡', '=Online|在网上付'] },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'You pay Lily half of the total.', zh: '你付给 Lily 总数的一半。' }, truth: 'T' },
          { f: 'RN', subs: ['R-number', 'L-price'], on: 'h', q: { en: 'How much do you pay Lily?', zh: '你要付给 Lily 多少钱？' }, ans: '{h:digits}', limit: { words: 1, num: true }, input: 'type' }] }
    ]
  });
  scene({
    id: 'home-repair', v: 1, zh: '报修：厨房窗户坏了', place: 'home', tier: 1, ch: 1, needs: ['w1d2:a2', 'w1d4:a2'], roles: { A: 'wood', B: 'you' }, ielts: ['L1', 'W1'],
    gloss: { broken: '坏了的', fix: '修理' },
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-detail', 'L-time'], at: '电话 · 房东', slots: { f: 'furniture', r: 'room', d: 'weekday', t: 'time' }, only: { f: ['window', 'door'], r: ROOMS3, t: T_DAY },
        bind: ['f', 'd', 't'], limit: { words: 1, num: true },
        alt: [
          [['B', 'Hello, Mrs Wood. The {f} in the {r} is broken.', '你好，伍德太太。{r.zh}的{f.zh}坏了。'], ['A', 'Oh no! Can I come on {d}, at {t}?', '哎呀！我{d.zh}{t.zh}过来可以吗？'],
            ['B', 'Yes, that\'s fine. Thank you!', '可以，没问题。谢谢！']],
          [['B', 'Hi, Mrs Wood. The {r} {f} is broken.', '你好，伍德太太。{r.zh}的{f.zh}坏了。'], ['A', 'I can fix it on {d~}. Oh, sorry, no—on {d}.', '我{d~.zh}可以来修。哦，不对，抱歉——{d.zh}。'],
            ['A', 'Is {t} OK?', '{t.zh}可以吗？'], ['B', 'Yes. See you then!', '可以。到时见！']]],
        form: { title: ['Repairs', '报修单'], rows: [['Problem', '问题', '{r} ?f'], ['Day', '哪天来修', '?d'], ['Time', '时间', '?t']] },
        q: { zh: '打电话报修，把报修单填完' } },
      { f: 'WM', k: 'wm', subs: ['W-task', 'W-length'], at: '给房东的消息', slots: {}, bind: [],
        task: { kind: 'W', min: 30, max: 60,
          bullets: [{ en: 'Say what is broken.', zh: '说什么东西坏了', keys: ['broken', 'window', 'door', 'sofa', 'desk'] },
            { en: 'Say which room it is in.', zh: '说在哪个房间', keys: ['kitchen', 'bedroom', 'bathroom', 'living room'] },
            { en: 'Say when you are at home.', zh: '说你什么时候在家', keys: ['@weekday', '@time', 'morning', 'afternoon', 'evening'] }] },
        q: { en: 'Write a message to Mrs Wood, your landlord.', zh: '给房东伍德太太写一条 30–60 词的消息：' } }
    ]
  });
  scene({
    id: 'home-secondhand', v: 1, zh: '二手家具广告', place: 'home', tier: 1, ch: 1, needs: ['w1d2:a2', 'w1d4:a2'], roles: { A: '@pool', B: 'you' }, ielts: ['RG1', 'L1'],
    gloss: { sale: '出售' },
    frames: [
      { f: 'RN', k: 'rn', subs: ['R-number', 'R-detail'], at: '楼下的告示', slots: { p1: 'price', p2: 'price', d: 'weekday' }, only: { p1: ['40', '50', '60', '70', '80', '90'], p2: ['13', '14', '15', '16', '17', '18', '19'] },
        bind: ['p2', 'd'],
        text: { kind: 'notice', title: ['FOR SALE', '出售'],
          lines: [['Big sofa, very comfortable: {p1:digits}', '大沙发，很舒服：{p1:digits}'], ['Small desk, like new: {p2:digits}', '小书桌，跟新的一样：{p2:digits}'],
            ['Come and see them on {d} morning.', '{d.zh}早上来看吧。'], ['Cash only, please. — {A}, Flat 5', '只收现金。——{A}，5 号公寓']] },
        items: [
          { f: 'RN', subs: ['R-number', 'L-price'], concept: 'price', on: 'p2', q: { en: 'How much is the desk?', zh: '书桌多少钱？' }, opts: ['{p2:digits}', '{p2~:digits}', '{p1:digits}'] },
          { f: 'RN', subs: ['R-detail', 'R-para'], concept: 'how', q: { en: 'How can you pay?', zh: '怎么付钱？' }, opts: ['=In cash|付现金', '=By card|刷卡', '=In cash or by card|现金、刷卡都行'] },
          { f: 'RT', subs: ['R-tfng'], stmt: { en: 'The sofa is not comfortable.', zh: '沙发不舒服。' }, truth: 'F' },
          { f: 'RT', subs: ['R-tfng', 'R-para'], on: 'd', stmt: { en: 'You can see the furniture on {d}.', zh: '你{d.zh}可以去看这些家具。' }, truth: 'T' }] },
      { f: 'LC', k: 'lc', subs: ['L-price', 'L-num'], at: '5 号公寓门口', slots: { p: 'price' }, only: { p: ['30', '40', '50', '60', '70', '80', '90'] }, bind: ['p'],
        alt: [
          [['B', 'Hi. How much is the sofa?', '你好。沙发多少钱？'], ['A', 'It\'s {p}. It\'s very cheap!', '{p.zh}。非常便宜！'], ['B', '{p:cap}? Great, I want it.', '{p.zh}？太好了，我要了。']],
          [['A', 'The sofa is {p~}… no, sorry, {p}.', '沙发{p~.zh}……不对，抱歉，是{p.zh}。'], ['B', 'OK. Can I pay in cash?', '好的。我可以付现金吗？'], ['A', 'Yes, of course.', '当然可以。']]],
        q: { en: 'How much is the sofa?', zh: '沙发多少钱？' }, opts: ['{p:digits}', '{p~:digits}', '{p~:digits}'] }
    ]
  });
  scene({
    id: 'home-neighbour', v: 1, zh: '邻居 Tom 来打招呼', place: 'home', tier: 1, ch: 1, needs: ['w1d3:a2', 'w1d3:a3'], roles: { A: 'tom', B: 'you' }, ielts: ['S1', 'L1'], gloss: {},
    frames: [
      { f: 'SP', k: 'sp', subs: ['S-ext'], at: '家门口', slots: { o: 'neighq' }, bind: [],
        say: [['A', 'Hi, I\'m Tom from next door. Welcome!', '你好，我是隔壁的 Tom。欢迎！'], ['A', '{o}', '{o.zh}']],
        q: { zh: '邻居 Tom 来打招呼，顺便问了一个问题。说 2–3 句：回答 + 一个原因或小细节。' } },
      { f: 'LC', k: 'lc', subs: ['L-detail'], at: '楼道里', slots: { f: 'family' }, only: { f: ['sister', 'brother', 'grandmother', 'grandfather', 'aunt', 'uncle', 'cousin', 'son', 'daughter'] },
        dOnly: { f: ['sister', 'brother', 'grandmother', 'grandfather', 'aunt', 'uncle', 'cousin', 'son', 'daughter', 'mother', 'father'] }, bind: ['f'],
        alt: [
          [['A', 'I have tea with my {f} every Sunday.', '我每个周日都和我{f.zh}喝茶。'], ['B', 'That\'s nice!', '真好！']],
          [['A', 'On Sunday, I have dinner with my {f}.', '周日我和我{f.zh}一起吃晚饭。'], ['A', 'My {f} is very funny!', '我{f.zh}特别有意思！']]],
        q: { en: 'Who does Tom see on Sunday?', zh: 'Tom 周日和谁见面？' }, opts: ['His {f}|他{f.zh}', 'His {f~}|他{f~.zh}', 'His {f~}|他{f~.zh}'] },
      { f: 'VM', k: 'vm', subs: ['V-mean'], at: '门上的纸条', slots: { a: 'adj' }, only: { a: ['kind'] }, dOnly: { a: ['funny', 'busy', 'quiet', 'noisy', 'free'] }, bind: ['a'],
        msg: ['A', 'Thanks for the cake! You\'re very {a}. 🍰 — Tom', '谢谢你的蛋糕！你人真{a.zh}。🍰 ——Tom'],
        q: { zh: '这里的"{a}"是什么意思？' }, opts: ['{a.zh}', '{a~.zh}', '{a~.zh}'], optZh: true }
    ]
  });
  scene({
    id: 'home-cleaning', v: 1, zh: '打扫值日表', place: 'home', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d4:a3', 'w1d5:a2'], roles: { A: 'lily', B: 'you' }, ielts: ['RG1'], gloss: {},
    frames: [
      { f: 'RM', k: 'rm', subs: ['R-match', 'R-detail'], at: '冰箱上的值日表', slots: { d1: 'weekday', d2: 'weekday', d3: 'weekday', d4: 'weekday' },
        only: { d1: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], d2: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], d3: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'], d4: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'] },
        distinct: [['d1', 'd2', 'd3', 'd4']], bind: ['d2', 'd3'],
        text: { kind: 'notice', title: ['WHO COOKS DINNER?', '谁做晚饭？'],
          lines: [['A  Lily: {d1} and {d2}', 'A  Lily：{d1.zh}和{d2.zh}'], ['B  Me: {d3} and {d4}', 'B  我：{d3.zh}和{d4.zh}'], ['C  Tom from next door: Sunday lunch', 'C  隔壁的 Tom：周日午饭']] },
        stmts: [{ en: 'Who cooks on {d2}?', zh: '{d2.zh}谁做饭？', ans: 'A' }, { en: 'Who cooks on {d3}?', zh: '{d3.zh}谁做饭？', ans: 'B' }, { en: 'Who cooks at the weekend?', zh: '周末谁做饭？', ans: 'C' }],
        q: { en: 'Who is it? Write A, B or C.', zh: '是谁？选 A、B 或 C。' } },
      { f: 'GF', k: 'gf-s', subs: ['G-3sg'], concept: 'v-s', at: '手机消息', slots: { d: 'weekday' }, bind: [], not: { d: ['sunday'] },
        msg: ['A', 'I cook on {d}, and Tom ___ on Sunday. 🍳', '我{d.zh}做饭，Tom 周日 ____ 。🍳'], q: { zh: '选一个词填进空里（Tom 是"他"）' }, opts: ['=cooks|加 -s：Tom 是第三人称单数', '=cook|原形：Tom 后面要加 -s', '=cooking|-ing 形式前面要有 is'] },
      { f: 'GF', k: 'gf-es', subs: ['G-3sg'], concept: 'v-es', at: '手机消息', slots: {}, bind: [],
        msg: ['A', 'Tom ___ to the market every Saturday. 🍎', 'Tom 每周六 ____ 市场。🍎'], q: { zh: '选一个词填进空里' }, opts: ['=goes|go 以 o 结尾，加 -es', '=go|原形：Tom 后面要用 goes', '=going|-ing 形式前面要有 is'] },
      { f: 'GF', k: 'gf-base', subs: ['G-3sg'], concept: 'v-base', at: '手机消息', slots: {}, bind: [],
        msg: ['A', 'We ___ the flat together on Sunday. 🧹', '我们周日一起 ____ 公寓。🧹'], q: { zh: '选一个词填进空里（主语是 we）' }, opts: ['=clean|原形：主语是 we', '=cleans|加 -s 只用于 he / she / it', '=cleaning|-ing 形式前面要有 are'] },
      { f: 'GF', k: 'gf-dont', subs: ['G-do'], concept: 'doesnt', at: '手机消息', slots: {}, bind: [],
        msg: ['A', 'Tom doesn\'t ___ on Saturday. He goes to the market. 🛒', 'Tom 周六不 ____ ，他去市场。🛒'], q: { zh: '选一个词填进空里（doesn\'t 后面用什么形式？）' }, opts: ['=cook|doesn\'t 后面用原形', '=cooks|doesn\'t 后面不加 -s', '=cooking|doesn\'t 后面不用 -ing'] },
      { f: 'GF', k: 'gf-does', subs: ['G-do'], concept: 'does-q', at: '手机消息', slots: { d: 'weekday' }, bind: [],
        msg: ['B', '___ Lily clean the kitchen on {d}?', 'Lily {d.zh}打扫厨房吗？'], q: { zh: '选一个词，把这个问句补完整' }, opts: ['=Does|Lily 是第三人称单数，用 Does', '=Do|Do 用于 I / you / we / they', '=Is|clean 是动词，问句要用 Does'] }
    ]
  });
  scene({
    id: 'home-anna-flat', v: 1, zh: 'Anna 找房的故事', place: 'home', tier: 1, ch: 1, needs: ['w1d4:a2', 'w1d4:a3', 'w1d4:b2'], roles: { A: 'anna', B: 'you' }, ielts: ['RA', 'L1'], gloss: {},
    frames: [
      { f: 'RT', k: 'rt', subs: ['R-tfng', 'R-detail'], at: '学校杂志上的短文', slots: { r: 'room', r2: 'room', f: 'family' }, only: { r: ['kitchen', 'bathroom', 'living room'], r2: ['kitchen', 'bathroom', 'living room'],
        f: ['sister', 'brother', 'aunt', 'uncle', 'cousin', 'grandmother', 'grandfather'] }, dOnly: { f: ['sister', 'brother', 'aunt', 'uncle', 'cousin', 'grandmother', 'grandfather', 'mother', 'father'] },
        distinct: [['r', 'r2']], bind: ['r', 'f'],
        text: { kind: 'article', title: ['Anna\'s New Home', 'Anna 的新家'],
          lines: [['Anna is a student at Maple Bridge Language School.', 'Anna 是枫桥语言学校的学生。'], ['Her new flat is on Green Street, near the school.', '她的新公寓在格林街，离学校很近。'],
            ['It has one bedroom, a small {r} and a big {r2}.', '它有一间卧室、一个小{r.zh}和一个大{r2.zh}。'], ['The rent is £650 a month.', '房租是每月 650 英镑。'],
            ['The flat is not new, but it is quiet and comfortable.', '公寓不新，但很安静、很舒服。'], ['Her {f} lives on King Street, so they often have dinner together.', '她{f.zh}住在国王街，所以两人常一起吃晚饭。']] },
        items: [
          { f: 'RT', subs: ['R-tfng', 'R-detail'], stmt: { en: 'Anna\'s flat has two bedrooms.', zh: 'Anna 的公寓有两间卧室。' }, truth: 'F' },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'The flat is not noisy.', zh: '这套公寓不吵。' }, truth: 'T' },
          { f: 'RG', subs: ['R-rule', 'R-detail'], on: 'r', sum: ['Anna\'s flat has a small ?r.', 'Anna 的公寓有一个小____。'] },
          { f: 'RG', subs: ['R-rule', 'R-detail'], on: 'f', sum: ['Anna often has dinner with her ?f.', 'Anna 常和她的____一起吃晚饭。'] },
          { f: 'RN', subs: ['R-detail'], concept: 'where', q: { en: 'Where is Anna\'s flat?', zh: 'Anna 的公寓在哪儿？' }, opts: ['=On Green Street|在格林街', '=On King Street|在国王街', '=On Park Street|在公园街'] },
          { f: 'RN', subs: ['R-number'], concept: 'price', q: { en: 'How much is the rent?', zh: '房租多少钱？' }, opts: ['=£650 a month|每月 650 英镑', '=£615 a month|每月 615 英镑', '=£560 a month|每月 560 英镑'] }] },
      { f: 'LC', k: 'lc', subs: ['L-detail'], at: '学校门口', slots: { r: 'room', a: 'adj' }, only: { r: ['kitchen', 'bathroom', 'living room', 'bedroom'], a: ['quiet', 'comfortable'] },
        dOnly: { a: ['quiet', 'noisy', 'comfortable', 'cheap', 'expensive'] }, bind: ['r', 'a'],
        alt: [
          [['A', 'My new flat is small, but I love the {r}.', '我的新公寓不大，但我很喜欢那个{r.zh}。'], ['B', 'Why?', '为什么？'], ['A', 'It\'s very {a}.', '它很{a.zh}。']],
          [['B', 'Do you like your new flat, Anna?', 'Anna，你喜欢你的新公寓吗？'], ['A', 'Yes! The {r} is very {a}.', '喜欢！{r.zh}非常{a.zh}。']]],
        q: { en: 'What does Anna say about the {r}?', zh: 'Anna 说那个{r.zh}怎么样？' }, opts: ['It is {a}.|很{a.zh}。', 'It is {a~}.|很{a~.zh}。', 'It is {a~}.|很{a~.zh}。'] }
    ]
  });
  scene({
    id: 'home-flatmate-ad', v: 1, zh: '找室友广告', place: 'home', tier: 1, ch: 1, needs: ['w1d2:a2', 'w1d4:a2'], roles: { A: 'anna', B: 'ben', C: '@pool' }, ielts: ['RG1', 'L1'],
    gloss: { party: '派对' },
    frames: [
      { f: 'RN', k: 'rn', subs: ['R-number', 'R-detail'], at: '学校里的告示', slots: { p: 'price', st: 'stname', d: 'weekday', d2: 'weekday' }, only: { p: ['450', '500', '550'] },
        distinct: [['d', 'd2']], bind: ['p', 'd2'],
        text: { kind: 'notice', title: ['ROOM IN AN APARTMENT', '公寓合租'],
          lines: [['Big bedroom in a two-bedroom apartment on {st}.', '{st.zh}一套两室公寓里的大卧室。'], ['It is near the language school and the bus stop.', '离语言学校和公交站都很近。'],
            ['Rent: {p:digits} a month. Quiet, no parties!', '房租：每月 {p:digits}。安静，不开派对！'], ['Call {C} on {d} or {d2} evening.', '{d.zh}或{d2.zh}晚上打电话给 {C}。']] },
        items: [
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'The room is in a flat.', zh: '这个房间在一套公寓里。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng'], stmt: { en: 'The apartment is noisy.', zh: '这套公寓很吵。' }, truth: 'F' },
          { f: 'RN', subs: ['R-number', 'L-price'], concept: 'price', on: 'p', q: { en: 'How much is the rent?', zh: '房租多少钱？' }, opts: ['{p:digits}', '{p~:digits}', '{p~:digits}'] },
          { f: 'RG', subs: ['R-rule', 'L-date'], on: 'd2', sum: ['Call {C} in the evening, on {d} or ?d2.', '可以在{d.zh}或____晚上给 {C} 打电话。'] },
          { f: 'RN', subs: ['R-detail'], concept: 'where', q: { en: 'Where is the room?', zh: '房间在哪儿？' }, opts: ['=Near the language school|离语言学校近', '=Near the Saturday market|离周六集市近', '=Near Moon Café|离月光咖啡馆近'] }] },
      { f: 'LC', k: 'lc', subs: ['L-price', 'L-turn'], at: '学校走廊', slots: { p: 'price' }, only: { p: ['450', '500', '550'] }, bind: ['p'],
        alt: [
          [['B', 'Anna, is the room {p~} a month?', 'Anna，那个房间每月{p~.zh}吗？'], ['A', 'No, it\'s {p} a month. It\'s not expensive!', '不是，每月{p.zh}。不贵！']],
          [['A', 'Ben, look! A room near our school.', 'Ben，你看！学校附近有个房间。'], ['B', 'How much is it?', '多少钱？'], ['A', 'It\'s {p} a month.', '每月{p.zh}。']]],
        q: { en: 'How much is the room?', zh: '那个房间每月多少钱？' }, opts: ['{p:digits}', '{p~:digits}', '{p~:digits}'] }
    ]
  });

  //  —— step 2a: café, market, school ——
  var WEEKDAYS5 = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
  var T_EVE = ['17:30h', '18:00o', '18:30h', '19:00o', '19:30h'];
  scene({
    id: 'cafe-job-ad', v: 1, zh: '咖啡馆招兼职', place: 'cafe', tier: 1, ch: 1, needs: ['w1d2:a2', 'w1d6:a2'], roles: { A: 'leo', B: 'you' }, ielts: ['RG2', 'L1'], gloss: {},
    frames: [
      { f: 'RN', k: 'rn', subs: ['R-detail', 'R-number'], at: '咖啡馆门口的招聘告示', slots: { d1: 'weekday', d2: 'weekday', t1: 'time', t2: 'time', p: 'price' },
        not: { d1: ['sunday'], d2: ['sunday'] }, only: { t1: ['07:00o', '08:00o', '07:30h'], t2: ['12:00o', '13:00o', '14:00o'], p: ['12', '13', '14', '15'] }, distinct: [['d1', 'd2']], avoid: { d1: ['d2'], d2: ['d1'] }, bind: ['p', 'd1'],
        text: { kind: 'notice', title: ['MOON CAFÉ: PART-TIME JOB', '月光咖啡馆：招兼职'],
          lines: [['We need a part-time worker on {d1} and {d2}.', '我们招一名兼职，{d1.zh}和{d2.zh}上班。'], ['Hours: {t1:digits} – {t2:digits}', '时间：{t1:digits} – {t2:digits}'],
            ['Pay: {p:digits} an hour', '工资：每小时 {p:digits}'], ['No experience? That\'s OK! Talk to Leo.', '没经验？没关系！找 Leo 聊聊。']] },
        items: [
          { f: 'RN', subs: ['R-number', 'L-price'], concept: 'price', on: 'p', q: { en: 'How much is the pay?', zh: '工资是多少？' }, opts: ['{p:digits} an hour|每小时 {p:digits}', '{p~:digits} an hour|每小时 {p~:digits}', '{p:digits} a day|每天 {p:digits}'] },
          { f: 'RN', subs: ['R-detail', 'L-date'], concept: 'when', on: 'd1', q: { en: 'Which days is the job?', zh: '这份工作是哪两天？' },
            opts: ['{d1} and {d2}|{d1.zh}和{d2.zh}', '{d1~} and {d2}|{d1~.zh}和{d2.zh}', '{d1} and {d2~}|{d1.zh}和{d2~.zh}'] },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'You need experience for this job.', zh: '这份工作要有经验。' }, truth: 'F' },
          { f: 'RT', subs: ['R-tfng', 'R-infer'], stmt: { en: 'The job is in the evening.', zh: '这份工作在晚上。' }, truth: 'F' }] },
      { f: 'LF', k: 'lf', subs: ['L-date', 'L-price'], at: '电话 · 月光咖啡馆', slots: { d: 'weekday', t: 'time', p: 'price' }, only: { t: T_DAY, p: ['12', '13', '14', '15'] }, not: { d: ['sunday'] }, bind: ['d', 't', 'p'],
        limit: { words: 1, num: true },
        alt: [
          [['B', 'Hi Leo. Can I come for an interview?', '嗨 Leo。我能来面试这份工作吗？'], ['A', 'Sure! Come on {d} at {t}.', '当然！{d.zh}{t.zh}来吧。'],
            ['B', 'Great. And the pay is {p} an hour?', '太好了。工资是每小时{p.zh}吗？'], ['A', 'Yes, that\'s right.', '对，没错。']],
          [['A', 'Your interview is on {d~}. Oh, sorry—on {d}.', '你的面试在{d~.zh}。哦，抱歉——是{d.zh}。'], ['A', 'Please come at {t}.', '请{t.zh}来。'],
            ['B', 'OK. How much is the pay?', '好的。工资多少？'], ['A', 'It\'s {p} an hour.', '每小时{p.zh}。']]],
        form: { title: ['Job interview: Moon Café', '面试：月光咖啡馆'], rows: [['Day', '星期', '?d'], ['Time', '时间', '?t'], ['Pay', '工资', '£?p an hour']] },
        q: { zh: '打电话约面试，把面试时间和工资记下来' } }
    ]
  });
  scene({
    id: 'cafe-regulars', v: 1, zh: '咖啡馆的常客们', place: 'cafe', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d4:a3', 'w1d5:a2'], roles: { A: 'leo' }, ielts: ['RA', 'RG1'], gloss: {},
    frames: [
      { f: 'RM', k: 'rm', subs: ['R-match', 'R-para'], at: 'Leo 写的小文章', slots: { t1: 'time', x1: 'drink' }, only: { t1: ['07:00o', '07:15q', '07:00'] }, bind: [],
        text: { kind: 'article', title: ['People at Moon Café', '月光咖啡馆的常客'],
          lines: [['A  Mia comes every morning at {t1:digits}, before work. She always has {x1}.', 'A  Mia 每天早上{t1.zh}来，在上班前。她总是喝{x1.zh}。'],
            ['B  Sam comes on Tuesday and Thursday evening, before his online course.', 'B  Sam 周二和周四晚上来，在上网课之前。'],
            ['C  Lily comes on Friday evening with her friends. They are very funny!', 'C  Lily 周五晚上和朋友们一起来。他们都很有趣！']] },
        stmts: [{ en: 'This person has a drink before work.', zh: '这个人上班前来喝一杯。', ans: 'A' }, { en: 'This person comes two evenings a week.', zh: '这个人一周来两个晚上。', ans: 'B' },
          { en: 'This person relaxes with friends here.', zh: '这个人在这儿和朋友们放松。', ans: 'C' }],
        q: { en: 'Which person is it? Write A, B or C.', zh: '是哪个人？选 A、B 或 C。' } },
      { f: 'RT', k: 'rt', subs: ['R-tfng', 'R-para'], at: '手机消息', slots: { t: 'time', x: 'drink' }, only: { t: ['07:00o', '07:15q', '07:00'] }, bind: ['t'],
        text: { kind: 'message', title: ['Message from Leo', 'Leo 的消息'],
          lines: [['Mia is always here at {t:digits}. She has {x} before work.', 'Mia 总是早上{t.zh}到。她上班前喝{x.zh}。'], ['Sam never comes on Monday. He\'s busy at work.', 'Sam 周一从来不来，他上班很忙。']] },
        items: [
          { f: 'RT', subs: ['R-tfng', 'R-detail'], stmt: { en: 'Mia comes to the café after work.', zh: 'Mia 下班后来咖啡馆。' }, truth: 'F' },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'Sam does not come on Monday.', zh: 'Sam 周一不来。' }, truth: 'T' },
          { f: 'RN', subs: ['R-number', 'L-time'], concept: 'time', on: 't', q: { en: 'What time does Mia come?', zh: 'Mia 几点来？' }, opts: ['{t:digits}', '{t~:digits}', '{t~:digits}'] },
          { f: 'RN', subs: ['R-detail'], concept: 'what', q: { en: 'What does Mia have?', zh: 'Mia 喝什么？' }, opts: ['{x:cap}', '{x~:cap}', '=Water|水'] }] }
    ]
  });
  scene({
    id: 'cafe-weekend', v: 1, zh: '周末特价', place: 'cafe', tier: 1, ch: 1, needs: ['w1d2:a2'], roles: { A: 'leo' }, ielts: ['RG1', 'L2'], gloss: { cake: '蛋糕' },
    frames: [
      { f: 'RT', k: 'rt', subs: ['R-tfng', 'R-para'], at: '咖啡馆门口的告示', slots: { p: 'price', t: 'time' }, only: { p: ['3', '3.50', '4', '4.50', '5'], t: ['08:00o', '09:00o', '08:30h', '09:30h'] }, bind: ['p', 't'],
        text: { kind: 'notice', title: ['THIS WEEKEND AT MOON CAFÉ', '月光咖啡馆本周末'],
          lines: [['Saturday and Sunday: tea and cake for {p:digits}', '周六和周日：茶配蛋糕 {p:digits}'], ['Coffee: 20% discount, all day', '咖啡：全天八折'],
            ['Children: free cake! 🍰', '小朋友：蛋糕免费！🍰'], ['We open at {t:digits} at the weekend.', '周末我们{t.zh}开门。']] },
        items: [
          { f: 'RT', subs: ['R-tfng', 'R-para'], on: 'p', stmt: { en: 'On Sunday, tea and cake is {p:digits}.', zh: '周日茶配蛋糕 {p:digits}。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'Children pay for their cake.', zh: '小朋友的蛋糕要付钱。' }, truth: 'F' },
          { f: 'RT', subs: ['R-tfng', 'R-infer'], stmt: { en: 'There is a discount on coffee this weekend.', zh: '这个周末咖啡有折扣。' }, truth: 'T' },
          { f: 'RN', subs: ['R-number', 'L-price'], concept: 'price', on: 'p', q: { en: 'How much is tea and cake at the weekend?', zh: '周末茶配蛋糕多少钱？' }, opts: ['{p:digits}', '{p~:digits}', '{p~:digits}'] },
          { f: 'RN', subs: ['R-number', 'L-time'], concept: 'time', on: 't', q: { en: 'What time does the café open on Saturday?', zh: '周六咖啡馆几点开门？' }, opts: ['{t:digits}', '{t~:digits}', '{t~:digits}'] }] },
      { f: 'LC', k: 'lc', subs: ['L-price', 'L-detail'], at: '月光咖啡馆', slots: { p: 'price' }, only: { p: ['3', '3.50', '4', '4.50', '5'] }, bind: ['p'],
        alt: [
          [['A', 'Good morning! This weekend, tea and cake is {p}.', '早上好！这个周末茶配蛋糕只要{p.zh}。'], ['A', 'And children get free cake!', '小朋友的蛋糕免费！']],
          [['you', 'How much is tea and cake today, Leo?', 'Leo，今天茶配蛋糕多少钱？'], ['A', 'At the weekend it\'s only {p}.', '周末只要{p.zh}。']]],
        q: { en: 'How much is tea and cake this weekend?', zh: '这个周末茶配蛋糕多少钱？' }, opts: ['{p:digits}', '{p~:digits}', '{p~:digits}'] }
    ]
  });
  scene({
    id: 'market-receipt', v: 1, zh: '核对小票', place: 'market', tier: 1, ch: 1, needs: ['w1d2:a2', 'w1d2:b2'], roles: { A: '@pool', B: 'you' }, ielts: ['RG1', 'L1'], gloss: {},
    frames: [
      { f: 'RN', k: 'rn', subs: ['R-number', 'R-detail'], at: '超市的小票', slots: { f1: 'fruit', f2: 'fruit', p1: 'price', p2: 'price', p3: 'price', s: 'price' },
        only: { p1: ['1.50', '2', '2.50', '3'], p2: ['1', '1.50', '2', '2.50'], p3: ['2', '3', '4'] }, distinct: [['f1', 'f2']], derive: { s: ['sum', 'p1', 'p2', 'p3'] }, bind: ['f1', 'p2'],
        text: { kind: 'note', title: ['GREEN STREET SHOP', '格林街商店'],
          lines: [['{f1:cap} (a kilo) … {p1:digits}', '{f1.zh}（一公斤）… {p1:digits}'], ['{f2:cap} (a kilo) … {p2:digits}', '{f2.zh}（一公斤）… {p2:digits}'], ['Tea … {p3:digits}', '茶 … {p3:digits}'],
            ['TOTAL … {s:digits}', '总计 … {s:digits}'], ['CARD. Thank you for shopping with us!', '刷卡。谢谢惠顾！']] },
        items: [
          { f: 'RN', subs: ['R-number', 'L-price'], concept: 'price', on: 'p2', q: { en: 'How much is a kilo of {f2}?', zh: '一公斤{f2.zh}多少钱？' }, opts: ['{p2:digits}', '{p2~:digits}', '{p3:digits}'] },
          { f: 'RG', subs: ['R-rule', 'R-detail'], on: 'f1', sum: ['A kilo of ?f1 is {p1:digits}.', '一公斤____ {p1:digits}。'] },
          { f: 'RN', subs: ['R-number'], on: 's', q: { en: 'What is the total?', zh: '一共多少钱？' }, ans: '{s:digits}', limit: { words: 1, num: true }, input: 'type' },
          { f: 'RT', subs: ['R-tfng'], stmt: { en: 'You pay in cash.', zh: '你是付现金的。' }, truth: 'F' }] },
      { f: 'LC', k: 'lc', subs: ['L-price', 'L-detail'], at: '周六集市的水果摊', slots: { f1: 'fruit', f2: 'fruit', p1: 'price', p2: 'price' }, only: { p1: ['3', '3.50', '4'], p2: ['1', '1.50', '2'] },
        distinct: [['f1', 'f2']], bind: ['p2', 'f2'],
        alt: [
          [['A', 'The {f1} are {p1} a kilo today.', '今天{f1.zh}一公斤{p1.zh}。'], ['B', 'That\'s expensive! And the {f2}?', '好贵！那{f2.zh}呢？'], ['A', 'They\'re only {p2} a kilo.', '一公斤只要{p2.zh}。']],
          [['B', 'How much are the {f2}, please?', '请问{f2.zh}多少钱？'], ['A', '{p2:cap} a kilo. They\'re very fresh!', '一公斤{p2.zh}。很新鲜！']]],
        q: { en: 'How much is a kilo of {f2}?', zh: '一公斤{f2.zh}多少钱？' }, opts: ['{p2:digits}', '{p2~:digits}', '{p2~:digits}'] }
    ]
  });
  scene({
    id: 'school-timetable', v: 1, zh: '课程表', place: 'school', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d2:a2', 'w1d6:a2'], roles: { A: 'clarke' }, ielts: ['RG1', 'L2'],
    gloss: { timetable: '课程表' },
    frames: [
      { f: 'RM', k: 'rm', subs: ['R-match', 'R-detail'], at: '学校的课程表', slots: { d1: 'weekday', d2: 'weekday', d3: 'weekday', t1: 'time', t2: 'time', t3: 'time' },
        only: { d1: WEEKDAYS5, d2: WEEKDAYS5, d3: WEEKDAYS5, t1: T_DAY, t2: T_DAY, t3: T_DAY }, distinct: [['d1', 'd2', 'd3'], ['t1', 't2', 't3']], bind: ['d1', 'd2'],
        text: { kind: 'notice', title: ['ENGLISH TIMETABLE', '英语课程表'],
          lines: [['A  Speaking class: {d1}, {t1:digits}', 'A  口语课：{d1.zh}，{t1:digits}'], ['B  Writing class: {d2}, {t2:digits}', 'B  写作课：{d2.zh}，{t2:digits}'],
            ['C  Listening class: {d3}, {t3:digits}', 'C  听力课：{d3.zh}，{t3:digits}']] },
        stmts: [{ en: 'This class is on {d1}.', zh: '这节课在{d1.zh}。', ans: 'A' }, { en: 'This class starts at {t2:digits}.', zh: '这节课{t2.zh}开始。', ans: 'B' },
          { en: 'In this class, you listen a lot.', zh: '这节课上你要听很多。', ans: 'C' }],
        q: { en: 'Which class is it? Write A, B or C.', zh: '是哪节课？选 A、B 或 C。' } },
      { f: 'RG', k: 'rg', subs: ['R-rule', 'L-date'], at: '学校的课程表', slots: { d1: 'weekday', d2: 'weekday', t1: 'time', t2: 'time' }, only: { d1: WEEKDAYS5, d2: WEEKDAYS5, t1: T_DAY, t2: T_DAY },
        distinct: [['d1', 'd2'], ['t1', 't2']], bind: ['d2'],
        text: { kind: 'notice', title: ['ENGLISH TIMETABLE', '英语课程表'],
          lines: [['Speaking class: {d1}, {t1:digits}', '口语课：{d1.zh}，{t1:digits}'], ['Writing class: {d2}, {t2:digits}', '写作课：{d2.zh}，{t2:digits}'], ['All classes are in Room 4.', '所有的课都在 4 号教室。']] },
        sum: ['The writing class is on ?d2.', '写作课在____。'], q: { zh: '看课程表，用原文里的一个词把句子补完整' } },
      { f: 'LN', k: 'ln', subs: ['L-date', 'L-time'], at: '课堂上', slots: { d: 'weekday', t: 'time' }, only: { d: WEEKDAYS5, t: T_DAY }, bind: ['d', 't'], limit: { words: 1, num: true },
        alt: [
          [['A', 'Hello, class. This week the speaking class is on {d}, not {d~}.', '同学们好。这周口语课在{d.zh}，不是{d~.zh}。'], ['A', 'It starts at {t}. Please don\'t be late!', '{t.zh}开始。请不要迟到！']],
          [['A', 'Hi, everyone. The speaking lesson is on {d} this week.', '大家好。这周的口语课在{d.zh}。'], ['A', 'It starts at {t}, in Room 4.', '{t.zh}开始，在 4 号教室。']]],
        notes: { title: ['Speaking class this week', '本周口语课'], rows: [['Day', '星期', '?d'], ['Time', '时间', '?t']] },
        q: { zh: '听克拉克老师说，把笔记补完整' } }
    ]
  });
  scene({
    id: 'school-homework', v: 1, zh: '作业什么时候交', place: 'school', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d4:a3', 'w1d6:a2'], roles: { A: 'clarke', B: 'ben', C: '@pool' }, ielts: ['L3', 'RG2'], gloss: {},
    frames: [
      { f: 'LC', k: 'lc', subs: ['L-date', 'L-turn'], at: '下课以后', slots: { d: 'weekday' }, only: { d: WEEKDAYS5 }, bind: ['d'],
        alt: [
          [['C', 'Ben, is the homework for {d~}?', 'Ben，作业是{d~.zh}交吗？'], ['B', 'No, Ms Clarke says {d}.', '不是，克拉克老师说{d.zh}交。'], ['C', 'Great, I have more time!', '太好了，我有更多时间了！']],
          [['A', 'Please give me your homework on {d}.', '请在{d.zh}把作业交给我。'], ['B', 'On {d}? Not tomorrow?', '{d.zh}？不是明天吗？'], ['A', 'No, not tomorrow. On {d}.', '不是明天。{d.zh}。']]],
        q: { en: 'Which day is the homework for?', zh: '作业哪天交？' }, opts: ['{d}', '{d~}', '{d~}'] },
      { f: 'LC', k: 'lc-s', subs: ['L-date', 'L-detail'], at: '下课以后', slots: { s: 'subject', d: 'weekday' }, only: { s: ['class', 'lesson', 'exam'], d: WEEKDAYS5 }, bind: ['s', 'd'],
        alt: [
          [['C', 'Ben, when is our next English {s}?', 'Ben，我们下一次英语{s.zh}在哪天？'], ['B', 'It\'s on {d}, in the morning.', '在{d.zh}早上。']],
          [['B', 'Is the English {s} on {d~}?', '英语{s.zh}在{d~.zh}吗？'], ['A', 'No, Ben. It\'s on {d}.', '不是，Ben。在{d.zh}。']]],
        q: { en: 'When is the next English {s}?', zh: '下一次英语{s.zh}在哪天？' }, opts: ['{d}', '{d~}', '{d~}'] },
      { f: 'RT', k: 'rt', subs: ['R-tfng', 'R-number'], at: '克拉克老师的消息', slots: { d: 'weekday', w: 'teenty' }, only: { d: WEEKDAYS5, w: ['30', '40', '50', '60'] }, bind: ['d', 'w'],
        text: { kind: 'message', title: ['Message from Ms Clarke', '克拉克老师的消息'],
          lines: [['Homework: write about your family, {w:digits} words.', '作业：写你的家人，{w:digits} 词。'], ['Please give it to me on {d}. Thank you!', '请在{d.zh}交给我。谢谢！']] },
        items: [
          { f: 'RT', subs: ['R-tfng', 'R-detail'], stmt: { en: 'The homework is about your family.', zh: '作业是写你的家人。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'R-number'], on: 'w', stmt: { en: 'You write {w~:digits} words.', zh: '要写 {w~:digits} 词。' }, truth: 'F' },
          { f: 'RN', subs: ['R-detail', 'L-date'], concept: 'when', on: 'd', q: { en: 'When is the homework for?', zh: '作业哪天交？' }, opts: ['On {d}|{d.zh}', 'On {d~}|{d~.zh}', '=Tomorrow|明天'] }] }
    ]
  });
  scene({
    id: 'school-exam-notice', v: 1, zh: '考试通知', place: 'school', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d2:a2', 'w1d6:a2'], roles: { A: 'clarke', B: 'ben' }, ielts: ['RG1'], gloss: {},
    frames: [
      { f: 'RN', k: 'rn', subs: ['R-detail', 'L-date'], at: '教室门上的通知', slots: { d: 'weekday', m: 'month', n: 'dom', t: 'time' }, cal: ['d', 'm', 'n'], not: { d: ['sunday'] }, only: { t: ['09:00o', '09:30h', '10:00o'] },
        bind: ['m', 'd', 't'],
        text: { kind: 'notice', title: ['ENGLISH EXAM', '英语考试'],
          lines: [['Date: {d}, the {n#} of {m}', '日期：{m.zh}{n.zh}号，{d.zh}'], ['Time: {t:digits} to 12.00 pm', '时间：{t:digits} 到中午 12 点'],
            ['Please come ten minutes early.', '请提前十分钟到。'], ['No phones in the exam room.', '考场里不能用手机。']] },
        items: [
          { f: 'RN', subs: ['R-detail', 'L-date'], concept: 'when', on: 'm', q: { en: 'When is the exam?', zh: '考试是哪天？' },
            opts: ['The {n#} of {m}|{m.zh}{n.zh}号', 'The {n#} of {m~}|{m~.zh}{n.zh}号', 'The {n~#} of {m}|{m.zh}{n~.zh}号'] },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'You can have your phone in the exam room.', zh: '考场里可以带着手机。' }, truth: 'F' },
          { f: 'RT', subs: ['R-tfng', 'R-infer'], stmt: { en: 'The exam is in the afternoon.', zh: '考试在下午。' }, truth: 'F' },
          { f: 'RN', subs: ['R-number', 'L-time'], concept: 'time', on: 't', q: { en: 'What time does the exam start?', zh: '考试几点开始？' }, opts: ['{t:digits}', '{t~:digits}', '{t~:digits}'] },
          { f: 'RT', subs: ['R-tfng', 'R-para'], on: 'd', stmt: { en: 'The exam is on {d}.', zh: '考试在{d.zh}。' }, truth: 'T' }] },
      { f: 'VM', k: 'vm', subs: ['V-mean'], at: '手机消息', slots: { s: 'subject', d: 'weekday' }, only: { s: ['exam', 'class'] }, dOnly: { s: ['exam', 'class', 'homework', 'teacher'] }, not: { d: ['sunday'] }, bind: ['s'],
        msg: ['B', 'Our English {s} is on {d}. Don\'t be late! 😊', '我们的英语{s.zh}在{d.zh}。别迟到！😊'],
        q: { zh: '这里的"{s}"是什么意思？' }, opts: ['{s.zh}', '{s~.zh}', '{s~.zh}'], optZh: true },
      { f: 'LC', k: 'lc', subs: ['L-date', 'L-detail'], at: '课堂上', slots: { d: 'weekday', m: 'month', n: 'dom' }, cal: ['d', 'm', 'n'], not: { d: ['sunday'] }, bind: ['d', 'm'],
        alt: [
          [['A', 'Our English exam is on {d}, the {n} of {m}.', '我们的英语考试在{m.zh}{n.zh}号，{d.zh}。'], ['B', 'The {n} of {m}? OK, thank you.', '{m.zh}{n.zh}号？好的，谢谢。']],
          [['B', 'Ms Clarke, is the exam on {d~}?', '克拉克老师，考试是{d~.zh}吗？'], ['A', 'No, Ben. It\'s on {d}, the {n} of {m}.', '不是，Ben。在{m.zh}{n.zh}号，{d.zh}。']]],
        q: { en: 'Which day is the exam?', zh: '考试在星期几？' }, opts: ['{d}', '{d~}', '{d~}'] }
    ]
  });
  scene({
    id: 'school-study-group', v: 1, zh: '约学习小组', place: 'school', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d3:a3', 'w1d5:a2'], roles: { A: 'ben', B: 'lily' }, ielts: ['L3'],
    gloss: { group: '小组' },
    frames: [
      { f: 'LC', k: 'lc', subs: ['L-date', 'L-turn'], at: '学校走廊', slots: { d: 'weekday', t: 'time' }, only: { d: WEEKDAYS5, t: T_EVE }, bind: ['d', 't'],
        alt: [
          [['A', 'Let\'s study together this week. Are you free on {d~0}?', '这周我们一起学习吧。你{d~0.zh}有空吗？'], ['you', 'Sorry, I\'m busy on {d~0}. What about {d}?', '抱歉，{d~0.zh}我很忙。{d.zh}呢？'],
            ['A', '{d} is great. See you at {t}!', '{d.zh}很好。{t.zh}见！']],
          [['B', 'Ben, is the study group on {d} evening?', 'Ben，学习小组是{d.zh}晚上吗？'], ['A', 'Yes, on {d} at {t}, in our classroom.', '对，{d.zh}{t.zh}，在我们教室。']]],
        q: { en: 'When is the study group?', zh: '学习小组是哪天？' }, opts: ['{d}', '{d~0}', '{d~1}'] },
      { f: 'VG', k: 'vg', subs: ['V-spell', 'V-cal'], at: '手机消息', slots: { d: 'weekday' }, only: { d: WEEKDAYS5 }, bind: ['d'],
        msg: ['A', 'Study group: ?d evening, 7 pm. See you! 📚', '学习小组：____ 晚上 7 点。到时见！📚'],
        q: { zh: 'Ben 发来一条消息，有一个词没打出来。听一听，把它写上。' }, say: [['A', '{d}', '{d.zh}']] },
      { f: 'GF', k: 'gf-q', subs: ['G-be'], concept: 'be-q', at: '手机消息', slots: { d: 'weekday' }, bind: [],
        msg: ['A', '___ you free on {d} evening? 📚', '你{d.zh}晚上有空吗？📚'], q: { zh: '选一个词，把这个问句补完整' },
        opts: ['=Are|free 是形容词：Are you …?', '=Do|free 是形容词，问句不用 Do', '=Is|you 要配 are'] },
      { f: 'SR', k: 'sr', subs: ['S-intel'], at: '学习小组', slots: { s: 'dsent' }, bind: ['s'],
        alt: [[['A', 'Can you read this one for us?', '你能给我们读读这句吗？']], [['B', 'Now you, please! Read this out.', '该你了！把这句读出来。']], [['A', 'OK, now you. Read it slowly, please.', '好，现在到你了。请慢慢读。']]],
        q: { zh: '学习小组轮流朗读。把这句话大声读给手机听：{s}' }, glossAdd: { slowly: '慢慢地' } },
      { f: 'GF', k: 'gf-am', subs: ['G-be'], concept: 'am', at: '手机消息', slots: { d: 'weekday' }, bind: [],
        msg: ['B', 'Sorry, I ___ busy on {d}. 😩', '抱歉，我{d.zh}很忙。😩'], q: { zh: '选一个词填进空里' }, opts: ['=am|I 只配 am', '=is|I 不配 is', '=are|I 不配 are'] }
    ]
  });
  scene({
    id: 'school-subjects', v: 1, zh: '选课', place: 'school', tier: 1, ch: 1, needs: ['w1d4:a3', 'w1d6:a2'], roles: { A: 'clarke', B: '@pool', C: '@pool', D: '@pool' }, ielts: ['RA', 'L1'], gloss: {},
    frames: [
      { f: 'RM', k: 'rm', subs: ['R-match', 'R-para'], at: '班级介绍', slots: { jb: 'job' }, only: { jb: ['teacher', 'manager'] }, bind: ['jb'],
        text: { kind: 'article', title: ['Our Class', '我们班'],
          lines: [['A  {B}: My major is business. I want to work in a big company.', 'A  {B}：我的专业是商科。我想在大公司工作。'],
            ['B  {C}: I study computer science. I love computers!', 'B  {C}：我学计算机科学。我很喜欢电脑！'], ['C  {D}: My major is English. I want to be a {jb}.', 'C  {D}：我的专业是英语。我想当{jb.zh}。']] },
        stmts: [{ en: 'This person wants to be a {jb}.', zh: '这个人想当{jb.zh}。', ans: 'C' }, { en: 'This person studies computers.', zh: '这个人学电脑。', ans: 'B' },
          { en: 'This person wants a job in a company.', zh: '这个人想在公司工作。', ans: 'A' }],
        q: { en: 'Which person is it? Write A, B or C.', zh: '是哪个人？选 A、B 或 C。' } },
      { f: 'LC', k: 'lc', subs: ['L-detail'], at: '开学第一天', slots: { s: 'major' }, bind: [],
        alt: [
          [['A', '{B}, what\'s your major?', '{B}，你的专业是什么？'], ['B', 'It\'s {s}. I love it!', '是{s.zh}。我很喜欢！']],
          [['B', 'Hi, I\'m {B}. My major is {s~0}.', '你好，我是 {B}。我的专业是{s~0.zh}。'], ['A', '{s~0:cap}?', '{s~0.zh}？'], ['B', 'Sorry, no—{s}! My English isn\'t very good.', '不对，抱歉，是{s.zh}！我英语不太好。']]],
        q: { en: 'What is {B}\'s major?', zh: '{B} 的专业是什么？' }, opts: ['{s}', '{s~}', '{s~}'] }
    ]
  });
  scene({
    id: 'school-lecture-times', v: 1, zh: '讲座时间表', place: 'school', tier: 1, ch: 1, needs: ['w1d2:a2', 'w1d6:a2'], roles: { A: '@pool' }, ielts: ['RG1', 'L4'], gloss: {},
    frames: [
      { f: 'RN', k: 'rn', subs: ['R-detail', 'R-number'], at: '学校里的海报', slots: { d1: 'weekday', d2: 'weekday', d3: 'weekday', t1: 'time', t2: 'time', t3: 'time', c: 'count' },
        only: { d1: WEEKDAYS5, d2: WEEKDAYS5, d3: WEEKDAYS5, t1: T_EVE, t2: T_EVE, t3: T_EVE }, distinct: [['d1', 'd2', 'd3'], ['t1', 't2', 't3']], bind: ['d1', 't3'],
        text: { kind: 'notice', title: ['FREE TALKS THIS WEEK', '本周免费讲座'],
          lines: [['{d1}, {t1:digits}: How to get a part-time job', '{d1.zh}，{t1:digits}：怎样找到兼职'], ['{d2}, {t2:digits}: Living in Maple Bridge', '{d2.zh}，{t2:digits}：在枫桥生活'],
            ['{d3}, {t3:digits}: Study skills for the IELTS exam', '{d3.zh}，{t3:digits}：雅思学习技巧'], ['All talks are in Room {c:digits}. Free for students!', '所有讲座都在 {c:digits} 号教室。学生免费！']] },
        items: [
          { f: 'RN', subs: ['R-detail', 'L-date'], concept: 'when', on: 'd1', q: { en: 'When is the talk about part-time jobs?', zh: '讲兼职的讲座在哪天？' }, opts: ['{d1}', '{d2}', '{d3}'] },
          { f: 'RN', subs: ['R-number', 'L-time'], concept: 'time', on: 't3', q: { en: 'What time is the IELTS talk?', zh: '雅思讲座几点？' }, opts: ['{t3:digits}', '{t1:digits}', '{t2:digits}'] },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'Students pay for the talks.', zh: '学生听讲座要付钱。' }, truth: 'F' },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'All the talks are in one room.', zh: '所有讲座都在同一个教室。' }, truth: 'T' }] },
      { f: 'LN', k: 'ln', subs: ['L-date', 'L-time'], at: '讲座开始前的通知', slots: { d: 'weekday', t: 'time' }, only: { d: WEEKDAYS5, t: T_EVE }, bind: ['d', 't'], limit: { words: 1, num: true },
        alt: [
          [['A', 'Hello, everyone. Our next talk is on {d}, at {t}.', '大家好。下一场讲座在{d.zh}{t.zh}。'], ['A', 'It\'s about study skills, and it\'s free for all students.', '讲学习技巧，所有学生免费。']],
          [['A', 'Good evening. Next week\'s talk is on {d~}… sorry, on {d}.', '晚上好。下周的讲座在{d~.zh}……抱歉，是{d.zh}。'], ['A', 'It starts at {t}. See you there!', '{t.zh}开始。到时见！']]],
        notes: { title: ['Talk: study skills', '讲座：学习技巧'], rows: [['Day', '星期', '?d'], ['Time', '时间', '?t']] },
        q: { zh: '听讲座前的通知，把下一场的时间记下来' } }
    ]
  });
  scene({
    id: 'school-certificate', v: 1, zh: '领结业证书', place: 'school', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d2:a2', 'w1d6:a2'], roles: { A: '@pool', B: 'you' }, ielts: ['L1'],
    gloss: { certificate: '证书' },
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-date', 'L-time'], at: '学校办公室', slots: { d: 'weekday', m: 'month', n: 'dom', t: 'time' }, cal: ['d', 'm', 'n'], only: { d: WEEKDAYS5, t: T_DAY }, bind: ['m', 'd', 't'],
        limit: { words: 1, num: true },
        alt: [
          [['A', 'Your certificate is ready on {d}, the {n} of {m}.', '你的证书{m.zh}{n.zh}号{d.zh}可以领。'], ['B', 'Where can I get it?', '我在哪儿领？'], ['A', 'In the office, after {t}.', '在办公室，{t.zh}以后。']],
          [['B', 'Hello. When can I get my certificate?', '你好。我什么时候能领证书？'], ['A', 'On {d~}… sorry, no. On {d}, the {n} of {m}.', '{d~.zh}……不对，抱歉。{m.zh}{n.zh}号，{d.zh}。'],
            ['A', 'Come to the office after {t}.', '{t.zh}以后到办公室来。']]],
        form: { title: ['Certificate', '结业证书'], rows: [['Collect on', '领取日', '?d'], ['Date', '日期', '{n#} ?m'], ['Place', '地点', 'the office'], ['After', '时间', '?t']] },
        q: { zh: '听办公室的人说，把领证书的时间记下来' } },
      { f: 'LC', k: 'lc', subs: ['L-num', 'L-detail'], at: '学校走廊', slots: { fl: 'dom', fl2: 'dom', fl3: 'dom' }, only: { fl: ['1', '2', '3'], fl2: ['1', '2', '3'], fl3: ['1', '2', '3'] },
        distinct: [['fl', 'fl2', 'fl3']], bind: ['fl'],
        alt: [
          [['B', 'Sorry, where\'s the office?', '打扰一下，办公室在哪儿？'], ['A', 'It\'s on the {fl} floor, next to the classroom.', '在{fl:floor.zh}，教室旁边。']],
          [['A', 'The office isn\'t on this floor. It\'s on the {fl} floor.', '办公室不在这一层，在{fl:floor.zh}。'], ['B', 'The {fl} floor? Thank you!', '{fl:floor.zh}？谢谢！']]],
        q: { en: 'Which floor is the office on?', zh: '办公室在几楼？' }, opts: ['The {fl} floor|{fl:floor.zh}', 'The {fl2} floor|{fl2:floor.zh}', 'The {fl3} floor|{fl3:floor.zh}'] }
    ]
  });
  scene({
    id: 'school-fees', v: 1, zh: '学费通知：几号前、怎么付', place: 'school', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d2:a2', 'w1d2:b1', 'w1d6:a2'], roles: { A: 'clarke' }, ielts: ['RG2', 'L1'],
    gloss: { fee: '费用' },
    frames: [
      { f: 'RN', k: 'rn', subs: ['R-detail', 'R-number'], at: '克拉克老师的邮件', slots: { m: 'month', n: 'dom', p: 'price', y: 'paym' }, cal: ['m', 'n'], only: { p: ['215', '450', '500', '550', '600'], y: ['card'] },
        bind: ['p', 'm', 'y'],
        text: { kind: 'email', title: ['Email from Ms Clarke', '克拉克老师的邮件'],
          lines: [['Hello, everyone!', '同学们好！'], ['The course fee is {p:digits}.', '课程费是 {p:digits}。'], ['Please pay by the {n#} of {m}.', '请在{m.zh}{n.zh}号之前付。'],
            ['You can pay by {y} in the office, or online.', '可以到办公室刷卡，也可以在网上付。'], ['Thank you! — Ms Clarke', '谢谢！——克拉克老师']] },
        items: [
          { f: 'RN', subs: ['R-number', 'L-price'], concept: 'price', on: 'p', q: { en: 'How much is the course?', zh: '课程费多少钱？' }, opts: ['{p:digits}', '{p~:digits}', '{p~:digits}'] },
          { f: 'RG', subs: ['R-rule', 'V-coll'], on: 'y', sum: ['In the office, you can pay by ?y.', '在办公室可以用____付。'] },
          { f: 'RG', subs: ['R-rule', 'L-date'], on: 'm', sum: ['Pay before the {n#} of ?m.', '在____{n.zh}号之前付。'] },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'You can only pay in the office.', zh: '只能在办公室付。' }, truth: 'F' },
          { f: 'RN', subs: ['R-detail', 'L-date'], concept: 'when', on: 'm', q: { en: 'When do you need to pay?', zh: '最晚哪天之前要付？' },
            opts: ['By the {n#} of {m}|{m.zh}{n.zh}号之前', 'By the {n~#} of {m}|{m.zh}{n~.zh}号之前', 'By the {n#} of {m~}|{m~.zh}{n.zh}号之前'] }] },
      { f: 'LN', k: 'ln', subs: ['L-price', 'L-date'], at: '课堂上', slots: { m: 'month', n: 'dom', p: 'price' }, cal: ['m', 'n'], only: { p: ['215', '450', '500', '550', '600'] }, bind: ['p', 'm'],
        limit: { words: 1, num: true },
        alt: [
          [['A', 'The course fee is {p}.', '课程费是{p.zh}。'], ['A', 'Please pay by the {n} of {m}. You can pay by card.', '请在{m.zh}{n.zh}号之前付，可以刷卡。']],
          [['A', 'Please pay the course fee by the {n} of {m}.', '请在{m.zh}{n.zh}号之前交课程费。'], ['A', 'It\'s {p~}. Oh, sorry, no. It\'s {p}.', '{p~.zh}。哦，抱歉，不对，是{p.zh}。']]],
        notes: { title: ['Course fee', '课程费'], rows: [['Fee', '金额', '£?p'], ['Pay by', '截止日期', 'the {n#} of ?m']] },
        q: { zh: '听老师说，把学费的笔记补完整' } }
    ]
  });

  //  —— step 2a: health, work, friends and family ——
  var FAM_M = ['sister', 'brother', 'aunt', 'uncle', 'cousin'];
  var FAM_ALL = ['sister', 'brother', 'grandmother', 'grandfather', 'aunt', 'uncle', 'cousin', 'mother', 'father', 'son', 'daughter'];
  scene({
    id: 'health-register', v: 1, zh: '健康中心登记表', place: 'health', tier: 1, ch: 1, needs: ['w1d3:a2', 'w1d4:a2'], roles: { A: '@pool', B: '@pool' }, ielts: ['L1'], gloss: {},
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-num', 'L-detail'], at: '公园街健康中心 · 前台', slots: { h: 'teenty', st: 'stname', ag: 'teenty' }, only: { ag: ['16', '17', '18', '19', '30', '40', '50', '60'] },
        bind: ['ag', 'h'], limit: { words: 1, num: true },
        alt: [
          [['A', 'Hello. What\'s your address, please?', '你好。请问你的地址是？'], ['B', 'It\'s {h} {st}.', '{st.zh}{h.zh}号。'], ['A', 'Thank you. And how old are you?', '谢谢。你多大了？'],
            ['B', 'I\'m {ag}.', '我{ag.zh}岁。']],
          [['A', 'How old are you, please?', '请问你多大了？'], ['B', 'I\'m {ag}.', '我{ag.zh}岁。'], ['A', '{ag~:cap}?', '{ag~.zh}岁？'], ['B', 'No, {ag}. And I live at {h} {st}.', '不是，{ag.zh}岁。我住在{st.zh}{h.zh}号。']]],
        form: { title: ['Park Street Health Centre: new patient', '公园街健康中心：新病人登记'], rows: [['Name', '姓名', '{B}'], ['Address', '地址', '?h {st}'], ['Age', '年龄', '?ag']] },
        q: { zh: '帮前台把 {B} 的登记表填完' } },
      { f: 'LC', k: 'lc', subs: ['L-num', 'L-detail'], at: '公园街健康中心 · 前台', slots: { ag: 'teenty', m: 'month' }, only: { ag: ['16', '17', '18', '19', '30', '40', '50', '60'] }, bind: ['ag', 'm'],
        alt: [
          [['A', 'And how old are you?', '你多大了？'], ['B', 'I\'m {ag}. My birthday is in {m}.', '我{ag.zh}岁。我的生日在{m.zh}。']],
          [['A', 'Are you {ag~}?', '你{ag~.zh}岁吗？'], ['B', 'No, I\'m {ag}.', '不是，我{ag.zh}岁。']]],
        q: { en: 'How old is {B}?', zh: '{B} 多大了？' }, opts: ['{ag}', '{ag~}', '{ag~}'] }
    ]
  });
  scene({
    id: 'health-mia-day', v: 1, zh: 'Mia 的一天', place: 'health', tier: 1, ch: 1, needs: ['w1d4:a3', 'w1d5:a2', 'w1d5:b2'], roles: { A: 'mia' }, ielts: ['RA'], gloss: {},
    frames: [
      { f: 'RM', k: 'rm', subs: ['R-match', 'R-para'], at: '学校杂志上的短文', slots: { t1: 'time', f: 'freq' }, only: { t1: ['08:00o', '07:30h', '08:30h'], f: ['often', 'usually', 'always'] }, bind: ['f'],
        text: { kind: 'article', title: ['A Day at the Health Centre', '健康中心的一天'],
          lines: [['A  In the morning, Mia starts work at {t1:digits}. She is always busy.', 'A  早上，Mia {t1.zh}开始上班。她总是很忙。'],
            ['B  At one o\'clock, she has lunch with her colleagues.', 'B  一点钟，她和同事们一起吃午饭。'], ['C  After work, she {f} walks in the park to relax.', 'C  下班后，她{f.zh}去公园散步放松。']] },
        stmts: [{ en: 'Mia eats with the people she works with.', zh: 'Mia 和一起工作的人吃饭。', ans: 'B' }, { en: 'Mia has a lot of work.', zh: 'Mia 的活儿很多。', ans: 'A' },
          { en: 'Mia goes to the park.', zh: 'Mia 去公园。', ans: 'C' }],
        q: { en: 'Which part of the day is it? Write A, B or C.', zh: '说的是一天里的哪一段？选 A、B 或 C。' } },
      { f: 'RT', k: 'rt', subs: ['R-tfng', 'R-detail'], at: '学校杂志上的短文', slots: { t1: 'time', f: 'freq', a: 'adj' }, only: { t1: ['08:00o', '07:30h', '08:30h'], f: ['often', 'usually', 'always'], a: ['busy'] },
        bind: ['f', 'a'],
        text: { kind: 'article', title: ['A Day at the Health Centre', '健康中心的一天'],
          lines: [['Mia is a nurse at Park Street Health Centre.', 'Mia 是公园街健康中心的护士。'], ['She starts work at {t1:digits}. The morning is always {a}.', '她{t1.zh}开始上班。早上总是很{a.zh}。'],
            ['At one o\'clock, she has lunch with her colleagues.', '一点钟，她和同事们一起吃午饭。'], ['After work, she {f} walks in the park to relax.', '下班后，她{f.zh}去公园散步放松。'],
            ['She never goes to bed late, because she gets up at six.', '她从不晚睡，因为她六点就起床。']] },
        items: [
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'Mia has lunch at 1.00 pm.', zh: 'Mia 下午一点吃午饭。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'R-detail'], stmt: { en: 'Mia goes to bed late.', zh: 'Mia 睡得晚。' }, truth: 'F' },
          { f: 'RG', subs: ['R-rule', 'V-routine'], on: 'f', sum: ['After work, Mia ?f walks in the park.', '下班后，Mia ____ 去公园散步。'] },
          { f: 'RG', subs: ['R-rule', 'R-para'], on: 'a', sum: ['Mia\'s mornings are ?a.', 'Mia 的早上很____。'] },
          { f: 'RN', subs: ['R-number', 'L-time'], concept: 'time', on: 't1', q: { en: 'What time does Mia start work?', zh: 'Mia 几点开始上班？' }, opts: ['{t1:digits}', '{t1~:digits}', '{t1~:digits}'] }] },
      { f: 'LC', k: 'lc', subs: ['L-time', 'L-detail'], at: '健康中心 · 午休', slots: { r: 'meal', t: 'time' }, only: { r: ['dinner'], t: T_EVE }, bind: ['r', 't'],
        alt: [
          [['you', 'Mia, what time do you have dinner?', 'Mia，你几点吃晚饭？'], ['A', 'I usually have {r} at {t}.', '我通常{t.zh}吃{r.zh}。'], ['A', 'Then I read a book and go to bed early.', '然后看会儿书，早早睡觉。']],
          [['A', 'After my walk, I cook {r}.', '散完步我做{r.zh}。'], ['A', 'We always have {r} at {t}.', '我们总是{t.zh}吃{r.zh}。']]],
        q: { en: 'What time does Mia have {r}?', zh: 'Mia 几点吃{r.zh}？' }, opts: ['{t:digits}', '{t~:digits}', '{t~:digits}'] }
    ]
  });
  scene({
    id: 'health-sleep', v: 1, zh: '睡眠小贴士', place: 'health', tier: 1, ch: 1, needs: ['w1d4:a3', 'w1d5:a2'], roles: { A: 'mia' }, ielts: ['RG2', 'L2'], gloss: {},
    frames: [
      { f: 'RT', k: 'rt', subs: ['R-tfng', 'R-para'], at: '健康中心的宣传单', slots: { t: 'time', c: 'count', f: 'freq' }, only: { t: ['13:00o', '14:00o', '15:00o', '16:00o'], c: ['7', '8'], f: ['always', 'usually'] },
        bind: ['t', 'f'],
        text: { kind: 'article', title: ['Nurse Mia: Sleep and You', '护士 Mia：你和睡眠'],
          lines: [['Go to bed at the same time every night.', '每晚同一时间上床睡觉。'], ['Do not drink coffee after {t:digits}.', '{t.zh}以后别喝咖啡。'],
            ['Walk or exercise in the morning, not late in the evening.', '早上散步或锻炼，别在晚上很晚的时候。'], ['No phone in bed! Read a book.', '床上别玩手机！看看书吧。'],
            ['Most people need about {c:digits} hours of sleep.', '大多数人需要睡大约 {c:digits} 个小时。'], ['I {f} go to bed before 10.00 pm. — Mia', '我{f.zh}在晚上十点前睡觉。——Mia']] },
        items: [
          { f: 'RT', subs: ['R-tfng', 'R-infer'], stmt: { en: 'Mia says coffee in the evening is OK.', zh: 'Mia 说晚上喝咖啡没关系。' }, truth: 'F' },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'It is good to exercise in the morning.', zh: '早上锻炼比较好。' }, truth: 'T' },
          { f: 'RG', subs: ['R-rule', 'V-routine'], on: 'f', sum: ['Mia ?f goes to bed before 10.00 pm.', 'Mia ____ 在晚上十点前睡觉。'] },
          { f: 'RN', subs: ['R-number'], concept: 'duration', q: { en: 'How many hours of sleep do most people need?', zh: '大多数人需要睡几个小时？' },
            opts: ['About {c:digits}|大约 {c:digits} 小时', '=About 4|大约 4 小时', '=About 12|大约 12 小时'] },
          { f: 'RN', subs: ['R-number', 'L-time'], concept: 'time', on: 't', q: { en: 'After what time does Mia say no coffee?', zh: 'Mia 说几点以后别喝咖啡？' }, opts: ['{t:digits}', '{t~:digits}', '{t~:digits}'] }] },
      { f: 'LC', k: 'lc', subs: ['L-time', 'L-detail'], at: '健康中心的广播', slots: { t: 'time' }, only: { t: ['13:00o', '14:00o', '15:00o', '16:00o'] }, bind: ['t'],
        alt: [
          [['A', 'For good sleep, don\'t drink coffee after {t}.', '想睡个好觉，{t.zh}以后就别喝咖啡。'], ['A', 'Drink water, not coffee.', '喝水，别喝咖啡。']],
          [['A', 'Hi, I\'m Mia, a nurse. Can\'t sleep? Try this.', '你好，我是护士 Mia。睡不着？试试这个办法。'], ['A', 'No coffee after {t}!', '{t.zh}以后别喝咖啡！']]],
        q: { en: 'After what time does Mia say no coffee?', zh: 'Mia 说几点以后别喝咖啡？' }, opts: ['{t:digits}', '{t~:digits}', '{t~:digits}'] }
    ]
  });
  scene({
    id: 'work-shifts', v: 1, zh: '排班表', place: 'work', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d2:a2', 'w1d6:a2'], roles: { A: 'sam', B: 'helen', C: '@pool' }, ielts: ['RG2'], gloss: {},
    frames: [
      { f: 'RM', k: 'rm', subs: ['R-match', 'R-detail'], at: '办公室的值班表', slots: { d1: 'weekday', d2: 'weekday', d3: 'weekday', t1: 'time' }, only: { d1: WEEKDAYS5, d2: WEEKDAYS5, d3: WEEKDAYS5, t1: ['08:00o', '08:30h', '09:00o'] },
        distinct: [['d1', 'd2', 'd3']], bind: ['d1', 'd3'],
        text: { kind: 'notice', title: ['WHO IS AT THE DESK THIS WEEK?', '这周谁值前台？'],
          lines: [['A  Sam: {d1}, {t1:digits} – 1.00 pm', 'A  Sam：{d1.zh}，{t1.zh}到下午一点'], ['B  Helen: {d2}, all day', 'B  Helen：{d2.zh}，全天'], ['C  {C}: {d3}, 1.00 pm – 6.00 pm', 'C  {C}：{d3.zh}，下午一点到六点']] },
        stmts: [{ en: 'This person is at the desk in the afternoon.', zh: '这个人下午值班。', ans: 'C' }, { en: 'This person is at the desk all day on {d2}.', zh: '这个人{d2.zh}全天值班。', ans: 'B' },
          { en: 'This person is at the desk on {d1} morning.', zh: '这个人{d1.zh}上午值班。', ans: 'A' }],
        q: { en: 'Which person is it? Write A, B or C.', zh: '是哪个人？选 A、B 或 C。' } },
      { f: 'RN', k: 'rn', subs: ['R-detail', 'R-number'], at: 'Helen 发给 Sam 的消息', slots: { d: 'weekday', t: 'time' }, only: { d: WEEKDAYS5, t: ['08:00o', '08:30h', '09:00o', '09:30h'] }, bind: ['d', 't'],
        text: { kind: 'message', title: ['Message from Helen', 'Helen 的消息'],
          lines: [['Sam, can you be at the desk on {d} this week?', 'Sam，这周{d.zh}你能值前台吗？'], ['Please come at {t:digits}. Thank you! — Helen', '请{t.zh}来。谢谢！——Helen']] },
        items: [
          { f: 'RN', subs: ['R-detail', 'L-date'], concept: 'when', on: 'd', q: { en: 'When does Helen want Sam at the desk?', zh: 'Helen 想让 Sam 哪天值前台？' }, opts: ['On {d}|{d.zh}', 'On {d~}|{d~.zh}', 'On {d~}|{d~.zh}'] },
          { f: 'RN', subs: ['R-number', 'L-time'], concept: 'time', on: 't', q: { en: 'What time does Sam start?', zh: 'Sam 几点开始？' }, opts: ['{t:digits}', '{t~:digits}', '{t~:digits}'] },
          { f: 'RT', subs: ['R-tfng', 'R-infer'], stmt: { en: 'Sam works in the evening on that day.', zh: 'Sam 那天晚上上班。' }, truth: 'F' }] }
    ]
  });
  scene({
    id: 'work-salary', v: 1, zh: '工资单', place: 'work', tier: 1, ch: 1, needs: ['w1d2:a2', 'w1d6:a2'], roles: { A: 'leo', B: '@pool' }, ielts: ['RG2', 'L1'], gloss: {},
    frames: [
      { f: 'RN', k: 'rn', subs: ['R-number', 'R-detail'], at: '月光咖啡馆的工资单', slots: { h: 'teenty', p: 'price', s: 'price', n: 'dom' }, only: { h: ['30', '40', '50', '60'], p: ['10', '12', '15'] },
        derive: { s: ['mul', 'h', 'p'] }, bind: ['h', 'p'],
        text: { kind: 'note', title: ['MOON CAFÉ: PAY', '月光咖啡馆：工资单'],
          lines: [['Name: {B}', '姓名：{B}'], ['Hours this month: {h:digits}', '本月工时：{h:digits}'], ['Pay: {p:digits} an hour', '时薪：{p:digits}'], ['Total: {s:digits}', '总计：{s:digits}'],
            ['Pay day: the {n#} of every month', '发薪日：每月{n.zh}号']] },
        items: [
          { f: 'RN', subs: ['R-number', 'L-price'], concept: 'price', on: 'p', q: { en: 'How much is the pay for one hour?', zh: '一小时的工资是多少？' }, opts: ['{p:digits}', '{p~:digits}', '{p~:digits}'] },
          { f: 'RN', subs: ['R-number'], on: 's', q: { en: 'What is the total pay this month?', zh: '这个月一共多少工资？' }, ans: '{s:digits}', limit: { words: 1, num: true }, input: 'type' },
          { f: 'RG', subs: ['R-rule', 'L-date'], on: 'n', sum: ['Pay day is the ?n of every month.', '每月____号发工资。'] },
          { f: 'RT', subs: ['R-tfng', 'R-number'], on: 'h', stmt: { en: '{B} works {h~:digits} hours this month.', zh: '{B} 这个月工作了 {h~:digits} 小时。' }, truth: 'F' }] },
      { f: 'LC', k: 'lc', subs: ['L-date', 'L-num'], at: '月光咖啡馆', slots: { n: 'dom' }, bind: ['n'],
        alt: [
          [['B', 'Leo, when\'s pay day?', 'Leo，哪天发工资？'], ['A', 'It\'s on the {n} of every month.', '每月{n.zh}号。']],
          [['A', 'Pay day is the {n~}… sorry, no, the {n}.', '发薪日是{n~.zh}号……不对，抱歉，是{n.zh}号。'], ['B', 'The {n}. Thanks, Leo!', '{n.zh}号。谢谢，Leo！']]],
        q: { en: 'When is pay day?', zh: '哪天发工资？' }, opts: ['The {n#}|{n.zh}号', 'The {n~#}|{n~.zh}号', 'The {n~#}|{n~.zh}号'] }
    ]
  });
  scene({
    id: 'work-interview', v: 1, zh: '兼职面试', place: 'work', tier: 1, ch: 1, needs: ['w1d2:a2', 'w1d6:a2'], roles: { A: 'helen', B: 'you', C: '@pool' }, ielts: ['L1', 'S1'], gloss: {},
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-date', 'L-time'], at: '电话 · Helen', slots: { d: 'weekday', t: 'time', fl: 'dom' }, only: { d: WEEKDAYS5, t: T_DAY, fl: ['1', '2', '3'] }, bind: ['d', 't', 'fl'],
        limit: { words: 1, num: true },
        alt: [
          [['A', 'Hello, this is Helen. Can you come for an interview on {d}?', '你好，我是 Helen。你{d.zh}能来面试吗？'], ['B', 'Yes. What time?', '可以。几点？'],
            ['A', 'At {t}. Our office is on the {fl} floor.', '{t.zh}。我们办公室在{fl:floor.zh}。']],
          [['A', 'Your interview is on {d}, at {t~}. Sorry, at {t}.', '你的面试在{d.zh}{t~.zh}。抱歉，是{t.zh}。'], ['A', 'Please come to the {fl} floor.', '请到{fl:floor.zh}来。'], ['B', 'OK, thank you!', '好的，谢谢！']]],
        form: { title: ['My interview', '我的面试'], rows: [['Day', '星期', '?d'], ['Time', '时间', '?t'], ['Office', '办公室', '?fl floor']] },
        q: { zh: '听 Helen 的电话，把面试的时间和地方记下来' } },
      { f: 'SP', k: 'sp', subs: ['S-ext'], at: '面试', slots: { o: 'jobq' }, bind: [],
        say: [['A', 'Thank you for coming today.', '谢谢你今天过来。'], ['A', '{o}', '{o.zh}']],
        q: { zh: '面试官 Helen 问你一个问题。说 2–4 句：回答 + 一个原因 + 一个例子。' } },
      { f: 'VM', k: 'vm', subs: ['V-mean'], at: '手机消息', slots: { w: 'event' }, bind: ['w'],
        msg: ['C', 'How was your {w} today? 🙂', '你今天的{w.zh}怎么样？🙂'], q: { zh: '这里的"{w}"是什么意思？' }, opts: ['{w.zh}', '{w~.zh}', '{w~.zh}'], optZh: true }
    ]
  });
  scene({
    id: 'work-colleagues', v: 1, zh: 'Sam 的同事们', place: 'work', tier: 1, ch: 1, needs: ['w1d4:a3', 'w1d6:a2', 'w1d6:b1'], roles: { A: 'sam', C: '@pool', D: '@pool' }, ielts: ['RA', 'RG2'], gloss: {},
    frames: [
      { f: 'RM', k: 'rm', subs: ['R-match', 'R-para'], at: 'Sam 写的小文章', slots: {}, bind: [],
        text: { kind: 'article', title: ['My Office', '我的办公室'],
          lines: [['A  Helen is my boss. She is very kind to everyone.', 'A  Helen 是我的老板。她对每个人都很好。'], ['B  {C} sits next to me and is very funny.', 'B  {C} 坐在我旁边，很有意思。'],
            ['C  {D} knows a lot about computers and is very helpful.', 'C  {D} 很懂电脑，特别乐于助人。']] },
        stmts: [{ en: 'This person helps with computers.', zh: '这个人会帮忙弄电脑。', ans: 'C' }, { en: 'This person is the manager of the office.', zh: '这个人是办公室的负责人。', ans: 'A' },
          { en: 'This person works next to Sam.', zh: '这个人在 Sam 旁边工作。', ans: 'B' }],
        q: { en: 'Which person is it? Write A, B or C.', zh: '是哪个人？选 A、B 或 C。' } },
      { f: 'LC', k: 'lc', subs: ['L-detail'], at: 'Sam 的办公室', slots: { jb: 'job' }, only: { jb: ['colleague', 'manager'] }, dOnly: { jb: ['colleague', 'manager', 'boss', 'teacher', 'student'] }, bind: ['jb'],
        alt: [
          [['A', 'This is {C}, my new {jb}.', '这是 {C}，我的新{jb.zh}。'], ['you', 'Nice to meet you, {C}!', '很高兴认识你，{C}！']],
          [['you', 'Sam, who\'s {C}?', 'Sam，{C} 是谁？'], ['A', '{C} is my new {jb}. Very kind!', '{C} 是我新来的{jb.zh}，人很好！']]],
        q: { en: 'Who is {C}?', zh: '{C} 是谁？' }, opts: ['Sam\'s {jb}|Sam 的{jb.zh}', 'Sam\'s {jb~}|Sam 的{jb~.zh}', 'Sam\'s {jb~}|Sam 的{jb~.zh}'] },
      { f: 'RT', k: 'rt', subs: ['R-tfng', 'R-detail'], at: 'Sam 的消息', slots: { a: 'adj' }, only: { a: ['kind', 'funny'] }, bind: ['a'],
        text: { kind: 'message', title: ['Message from Sam', 'Sam 的消息'],
          lines: [['I like my new office. My boss, Helen, is very kind.', '我喜欢我的新办公室。我的老板 Helen 人很好。'], ['My colleagues are helpful, and {C} is very {a}!', '同事们都很热心，{C} 特别{a.zh}！']] },
        items: [
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'Sam does not like his office.', zh: 'Sam 不喜欢他的办公室。' }, truth: 'F' },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'The people Sam works with help him.', zh: '和 Sam 一起工作的人会帮他。' }, truth: 'T' },
          { f: 'RN', subs: ['R-detail'], concept: 'who', q: { en: 'Who is Helen?', zh: 'Helen 是谁？' }, opts: ['=Sam\'s boss|Sam 的老板', '=Sam\'s colleague|Sam 的同事', '=Sam\'s teacher|Sam 的老师'] }] }
    ]
  });
  scene({
    id: 'work-email', v: 1, zh: '给经理写邮件', place: 'work', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d6:a2', 'w1d6:b2'], roles: { A: 'helen', B: 'you' }, ielts: ['W1'], gloss: {},
    frames: [
      { f: 'WM', k: 'wm', subs: ['W-task', 'W-length'], at: '给 Helen 的邮件', slots: {}, bind: [],
        task: { kind: 'W', min: 30, max: 60,
          bullets: [{ en: 'Say which job you want.', zh: '说你想申请哪份工作', keys: ['part-time', 'job', 'apply'] },
            { en: 'Say which days you are free.', zh: '说你哪几天有空', keys: ['@weekday', 'free'] },
            { en: 'Ask about the interview.', zh: '问问面试的事', keys: ['interview', 'when', 'what time'] }] },
        q: { en: 'Write an email to Helen about the part-time job.', zh: '给 Helen 写一封 30–60 词的邮件，申请那份兼职：' } },
      { f: 'VG', k: 'vg', subs: ['V-spell', 'V-cal'], at: '给 Helen 的邮件', slots: { d: 'weekday' }, bind: ['d'],
        msg: ['B', 'I want to apply for the part-time job. I am free on ?d.', '我想申请那份兼职。我 ____ 有空。'],
        q: { zh: '你在写申请邮件，有一个词还没写。听一听，把它写上。' }, say: [['A', '{d}', '{d.zh}']] },
      { f: 'WK', k: 'wk', subs: ['W-task'], at: '给 Helen 的邮件', slots: { d: 'weekday', d2: 'weekday' }, distinct: [['d', 'd2']], bind: [],
        task: { kind: 'W', bullets: [{ en: 'say which job you want', zh: '说你想申请哪份工作', keys: ['job'] }, { en: 'say which days you are free', zh: '说你哪几天有空', keys: ['@weekday'] },
          { en: 'ask about the interview', zh: '问问面试的事', keys: ['interview'] }] },
        msg: ['B', 'Hello Helen, I want to apply for the part-time job. I am free on {d} and {d2}. Thank you!', '你好 Helen，我想申请那份兼职。我{d.zh}和{d2.zh}有空。谢谢！'],
        q: { zh: '题目要写三个要点。这封邮件哪一点没写到？' }, opts: ['@2', '@0', '@1'] }
    ]
  });
  scene({
    id: 'work-office-move', v: 1, zh: '办公室搬到三楼', place: 'work', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d4:a2', 'w1d6:a2'], roles: { A: 'helen' }, ielts: ['RG2', 'L2'], gloss: {},
    frames: [
      { f: 'RN', k: 'rn', subs: ['R-detail', 'L-date'], at: 'Helen 的邮件', slots: { d: 'weekday', m: 'month', n: 'dom', d0: 'weekday', fl: 'dom', fl2: 'dom', fl3: 'dom' }, cal: ['d', 'm', 'n'],
        only: { d: ['tuesday', 'wednesday', 'thursday', 'friday'], fl: ['1', '2', '3'], fl2: ['1', '2', '3'], fl3: ['1', '2', '3'] }, derive: { d0: ['prev', 'd'] }, distinct: [['fl', 'fl2', 'fl3']],
        bind: ['d', 'fl'],
        text: { kind: 'email', title: ['Email: our office is moving', '邮件：办公室要搬了'],
          lines: [['Hello, everyone.', '大家好。'], ['Our office is moving to the {fl} floor.', '我们办公室要搬到{fl:floor.zh}。'], ['The move is on {d}, the {n#} of {m}.', '搬家在{m.zh}{n.zh}号，{d.zh}。'],
            ['Please put your things in a box on {d0}.', '请在{d0.zh}把你的东西装进箱子里。'], ['Thank you! — Helen', '谢谢！——Helen']] },
        items: [
          { f: 'RN', subs: ['R-detail', 'L-date'], concept: 'when', on: 'd', q: { en: 'When does the office move?', zh: '办公室哪天搬？' }, opts: ['On {d}|{d.zh}', 'On {d0}|{d0.zh}', 'On {d~}|{d~.zh}'], avoid: { d: ['d0'] } },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'The office is going to a new floor.', zh: '办公室要搬到新的一层。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'R-detail'], on: 'd', stmt: { en: 'You put your things in a box on {d}.', zh: '你在{d.zh}把东西装箱。' }, truth: 'F' },
          { f: 'RN', subs: ['R-number', 'R-detail'], on: 'fl', q: { en: 'Which floor is the new office on?', zh: '新办公室在几楼？' }, opts: ['The {fl} floor|{fl:floor.zh}', 'The {fl2} floor|{fl2:floor.zh}', 'The {fl3} floor|{fl3:floor.zh}'] }] },
      { f: 'LN', k: 'ln', subs: ['L-date', 'L-num'], at: '办公室的晨会', slots: { d: 'weekday', fl: 'dom' }, only: { d: WEEKDAYS5, fl: ['1', '2', '3'] }, bind: ['d', 'fl'], limit: { words: 1, num: true },
        alt: [
          [['A', 'Good morning, everyone. Next {d}, we move to the {fl} floor.', '大家早上好。下周{d.zh}，我们搬到{fl:floor.zh}。'], ['A', 'The new office is big and quiet.', '新办公室又大又安静。']],
          [['A', 'Our office moves on {d~}. Sorry, no—on {d}.', '我们办公室{d~.zh}搬。抱歉，不对——是{d.zh}。'], ['A', 'We go to the {fl} floor.', '我们搬到{fl:floor.zh}。']]],
        notes: { title: ['Office move', '办公室搬家'], rows: [['Move day', '搬家日', '?d'], ['New office', '新办公室', '?fl floor']] },
        q: { zh: '听 Helen 在晨会上说，把笔记补完整' } }
    ]
  });
  scene({
    id: 'work-online-course', v: 1, zh: 'Sam 的网课', place: 'work', tier: 1, ch: 1, needs: ['w1d4:a3', 'w1d6:a2', 'w1d6:b2'], roles: { A: 'sam', B: 'you' }, ielts: ['L1', 'RG1'], gloss: {},
    frames: [
      { f: 'LC', k: 'lc', subs: ['L-time', 'L-detail'], at: '月光咖啡馆', slots: { t: 'time' }, only: { t: T_EVE }, bind: ['t'],
        alt: [
          [['A', 'My online course is on Tuesday and Thursday evening.', '我的网课在周二和周四晚上。'], ['B', 'What time does it start?', '几点开始？'], ['A', 'At {t}, for two hours.', '{t.zh}，上两个小时。']],
          [['B', 'Sam, is your course at {t~}?', 'Sam，你的课是{t~.zh}吗？'], ['A', 'No, it starts at {t}.', '不是，{t.zh}开始。']]],
        q: { en: 'What time does Sam\'s course start?', zh: 'Sam 的课几点开始？' }, opts: ['{t:digits}', '{t~:digits}', '{t~:digits}'] },
      { f: 'RT', k: 'rt', subs: ['R-tfng', 'R-detail'], at: 'Sam 的消息', slots: { t: 'time' }, only: { t: T_EVE }, bind: ['t'],
        text: { kind: 'message', title: ['Message from Sam', 'Sam 的消息'],
          lines: [['Sorry, I can\'t come on Tuesday.', '抱歉，我周二来不了。'], ['My online course is on Tuesday evening at {t:digits}. 💻', '我的网课在周二晚上{t.zh}。💻']] },
        items: [
          { f: 'RT', subs: ['R-tfng', 'R-detail'], stmt: { en: 'Sam has a course on Tuesday.', zh: 'Sam 周二有课。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'R-infer'], stmt: { en: 'Sam\'s course is in the morning.', zh: 'Sam 的课在早上。' }, truth: 'F' },
          { f: 'RN', subs: ['R-number', 'L-time'], concept: 'time', on: 't', q: { en: 'What time is the course?', zh: '课几点开始？' }, opts: ['{t:digits}', '{t~:digits}', '{t~:digits}'] }] },
      { f: 'GF', k: 'gf-svo', subs: ['G-pattern'], concept: 'svo', at: 'Sam 的消息', slots: {}, bind: [],
        msg: ['A', 'I take an online course.', '我上网课。'], q: { zh: '这句话是哪种句型？' },
        opts: ['=主语 + 谓语 + 宾语|take 的对象是 an online course（宾语）', '=主语 + 系动词 + 表语|句子里没有 am / is / are', '=主语 + 谓语|take 后面还有宾语'] },
      { f: 'GF', k: 'gf-svc', subs: ['G-pattern'], concept: 'svc', at: 'Sam 的消息', slots: { a: 'adj' }, only: { a: ['busy', 'free'] }, bind: [],
        msg: ['A', 'On Tuesday evening, I am {a}.', '周二晚上我很{a.zh}。'], q: { zh: '这句话是哪种句型？' },
        opts: ['=主语 + 系动词 + 表语|am 是系动词，后面的形容词是表语', '=主语 + 谓语 + 宾语|am 后面不是宾语', '=主语 + 谓语|am 后面还有表语'] }
    ]
  });
  scene({
    id: 'work-application-form', v: 1, zh: '兼职申请表', place: 'work', tier: 1, ch: 1, needs: ['w1d3:a2', 'w1d6:a2'], roles: { A: 'leo', B: '@pool' }, ielts: ['L1'], gloss: {},
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-num', 'L-date'], at: '月光咖啡馆 · 申请兼职', slots: { ag: 'teenty', d: 'weekday', d2: 'weekday' }, only: { ag: ['16', '17', '18', '19'] }, distinct: [['d', 'd2']],
        bind: ['ag', 'd'], limit: { words: 1, num: true },
        alt: [
          [['A', 'How old are you, {B}?', '{B}，你多大了？'], ['B', 'I\'m {ag}.', '我{ag.zh}岁。'], ['A', 'And which days are you free?', '你哪几天有空？'], ['B', '{d} and {d2}.', '{d.zh}和{d2.zh}。']],
          [['B', 'I\'m free on {d~}… no, sorry, on {d}.', '我{d~.zh}有空……不对，抱歉，是{d.zh}。'], ['B', 'And on {d2}, too.', '{d2.zh}也有空。'], ['A', 'Great. How old are you?', '好的。你多大了？'],
            ['B', 'I\'m {ag}.', '我{ag.zh}岁。']]],
        form: { title: ['Moon Café: job form', '月光咖啡馆：兼职申请表'], rows: [['Name', '姓名', '{B}'], ['Age', '年龄', '?ag'], ['Free on', '有空的日子', '?d and ?d2']] },
        q: { zh: '帮 Leo 把 {B} 的申请表填完' } },
      { f: 'LC', k: 'lc', subs: ['L-detail'], at: '月光咖啡馆 · 申请兼职', slots: { jb: 'job' }, only: { jb: ['student', 'teacher'] }, dOnly: { jb: ['student', 'teacher', 'manager'] }, bind: ['jb'],
        alt: [
          [['A', 'What do you do now?', '你现在是做什么的？'], ['B', 'I\'m a {jb}, but I\'m free at the weekend.', '我是{jb.zh}，不过周末有空。']],
          [['A', 'Are you a {jb~0}?', '你是{jb~0.zh}吗？'], ['B', 'No, I\'m a {jb}.', '不是，我是{jb.zh}。']]],
        q: { en: 'What is {B}\'s job now?', zh: '{B} 现在是做什么的？' }, opts: ['{jb}', '{jb~0}', '{jb~1}'] }
    ]
  });
  scene({
    id: 'social-family-call', v: 1, zh: '和家人视频', place: 'social', tier: 1, ch: 1, needs: ['w1d3:a2', 'w1d3:a3'], roles: { A: '@pool', C: '@pool' }, ielts: ['S1', 'L1'], gloss: {},
    frames: [
      { f: 'LC', k: 'lc', subs: ['L-detail'], at: '和新加坡的表姐视频', slots: { f: 'family' }, only: { f: FAM_M }, dOnly: { f: FAM_ALL }, bind: ['f'],
        alt: [
          [['A', 'Hi! Big news: my {f} is married now!', '嗨！大新闻：我{f.zh}结婚了！'], ['you', 'Oh, that\'s great!', '哦，太好了！']],
          [['A', 'My {f} is married now, and very happy!', '我{f.zh}结婚了，特别开心！'], ['you', 'Please say hello to your {f} from me!', '替我向你{f.zh}问好！']]],
        q: { en: 'Who is married now?', zh: '谁结婚了？' }, opts: ['{A}\'s {f}|{A} 的{f.zh}', '{A}\'s {f~}|{A} 的{f~.zh}', '{A}\'s {f~}|{A} 的{f~.zh}'] },
      { f: 'SP', k: 'sp', subs: ['S-ext'], at: '和新加坡的表姐视频', slots: { k: 'speakq' }, bind: ['k'], fit: 'family',
        say: [['A', 'My friend {C} is here with me.', '我朋友 {C} 在我旁边。'], ['C', '{k}', '{k.zh}']],
        q: { zh: '表姐的朋友在视频里问你一个问题。说 2–4 句：回答 + 一个细节。' } }
    ]
  });
  scene({
    id: 'social-sunday-dinner', v: 1, zh: '周日一起吃晚饭', place: 'social', tier: 1, ch: 1, needs: ['w1d3:a2', 'w1d3:b1'], roles: { A: 'tom', B: 'you' }, ielts: ['L1', 'RG1'], gloss: {},
    frames: [
      { f: 'LC', k: 'lc', subs: ['L-time', 'L-detail'], at: '楼道里', slots: { t: 'time', f: 'family' }, only: { t: T_EVE, f: FAM_M }, bind: ['t'],
        alt: [
          [['A', 'Come for dinner with my family on Sunday!', '周日来和我家人一起吃晚饭吧！'], ['B', 'Thank you! What time?', '谢谢！几点？'], ['A', 'At {t}. My {f} is a great cook!', '{t.zh}。我{f.zh}做饭特别好吃！']],
          [['A', 'Dinner on Sunday is at {t~}. Oh, sorry—at {t}.', '周日的晚饭在{t~.zh}。哦，抱歉——是{t.zh}。'], ['B', 'Great! See you then.', '好的！到时见。']]],
        q: { en: 'What time is dinner on Sunday?', zh: '周日的晚饭几点？' }, opts: ['{t:digits}', '{t~:digits}', '{t~:digits}'] },
      { f: 'RT', k: 'rt', subs: ['R-tfng', 'R-detail'], at: 'Tom 塞进门缝的便条', slots: { t: 'time', f: 'family' }, only: { t: T_EVE, f: FAM_M }, bind: ['f', 't'],
        text: { kind: 'note', title: ['SUNDAY DINNER AT FLAT 2! 🍲', '周日在 2 号公寓吃晚饭！🍲'],
          lines: [['We eat together at {t:digits}.', '我们{t.zh}一起吃。'], ['My {f} and my two children come too.', '我{f.zh}和我的两个孩子也来。'], ['— Tom', '——Tom']] },
        items: [
          { f: 'RT', subs: ['R-tfng', 'R-detail'], stmt: { en: 'Tom has two children.', zh: 'Tom 有两个孩子。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'L-date'], stmt: { en: 'The dinner is on Saturday.', zh: '晚饭在周六。' }, truth: 'F' },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'Tom has dinner with his family.', zh: 'Tom 和家人一起吃晚饭。' }, truth: 'T' },
          { f: 'RN', subs: ['R-number'], concept: 'count', q: { en: 'How many children does Tom have?', zh: 'Tom 有几个孩子？' }, opts: ['=Two|两个', '=Three|三个', '=One|一个'] },
          { f: 'RN', subs: ['R-detail'], on: 'f', q: { en: 'Who comes to dinner with Tom\'s children?', zh: '谁和 Tom 的孩子们一起来吃晚饭？' }, opts: ['Tom\'s {f}|Tom 的{f.zh}', 'Tom\'s {f~}|Tom 的{f~.zh}', 'Tom\'s {f~}|Tom 的{f~.zh}'],
            dOnly: { f: FAM_ALL } }] }
    ]
  });
  scene({
    id: 'social-new-friend', v: 1, zh: '新朋友发来的消息', place: 'social', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d3:a2', 'w1d3:a3'], roles: { C: '@pool' }, ielts: ['RG1', 'W1'], gloss: {},
    frames: [
      { f: 'RN', k: 'rn', subs: ['R-detail', 'R-number'], at: '手机消息', slots: { ag: 'teenty', pl: 'city', f: 'family', d: 'weekday' }, only: { ag: ['18', '19', '30', '40'], f: ['aunt', 'sister', 'cousin'] },
        dOnly: { f: FAM_ALL, ag: ['16', '17', '18', '19', '30', '40'] }, bind: ['ag', 'd'],
        text: { kind: 'message', title: ['Message from {C}', '{C} 的消息'],
          lines: [['Hi! I\'m {C}. I\'m {ag}, and I\'m from {pl}.', '嗨！我是 {C}。我{ag.zh}岁，来自{pl.zh}。'], ['I live with my {f} and her two children.', '我和我{f.zh}还有她的两个孩子住在一起。'],
            ['Do you want to have lunch on {d}? 😊', '你{d.zh}想一起吃午饭吗？😊']] },
        items: [
          { f: 'RN', subs: ['R-number', 'L-num'], on: 'ag', q: { en: 'How old is {C}?', zh: '{C} 多大了？' }, opts: ['{ag}', '{ag~}', '{ag~}'] },
          { f: 'RN', subs: ['R-detail'], concept: 'where', q: { en: 'Where is {C} from?', zh: '{C} 是哪里人？' }, opts: ['{pl}', '{pl~}', '{pl~}'] },
          { f: 'RT', subs: ['R-tfng', 'R-detail'], stmt: { en: 'The two children are {C}\'s brothers.', zh: '那两个孩子是 {C} 的弟弟。' }, truth: 'F' },
          { f: 'RT', subs: ['R-tfng', 'L-date'], on: 'd', stmt: { en: '{C} wants to meet on {d}.', zh: '{C} 想在{d.zh}见面。' }, truth: 'T' }] },
      { f: 'WT', k: 'wt', subs: ['W-sent'], at: '手机消息', slots: { s: 'xsent' }, bind: ['s'], fit: 'family|mother|brother',
        alt: [[['C', 'Tell me about your family! 😊', '说说你的家人吧！😊']], [['C', 'Nice to meet you! Who is in your family?', '很高兴认识你！你家里都有谁？']]], msgFromAlt: true, q: { zh: '用英文回复 {C}：{s.zh}' } }
    ]
  });
  scene({
    id: 'social-cousin-baby', v: 1, zh: '表姐的宝宝', place: 'social', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d3:a2', 'w1d3:b3'], roles: { A: '@pool' }, ielts: ['L1'], gloss: {},
    frames: [
      { f: 'LC', k: 'lc', subs: ['L-date', 'L-detail'], at: '和新加坡的家人视频', slots: { m: 'month', n: 'dom' }, bind: ['m'],
        alt: [
          [['A', 'Look! This is my cousin\'s baby.', '你看！这是我表姐的宝宝。'], ['you', 'Hello, baby! When\'s the baby\'s birthday?', '宝宝你好！宝宝的生日是哪天？'], ['A', 'It\'s in {m}. The {n} of {m}.', '在{m.zh}。{m.zh}{n.zh}号。']],
          [['A', 'This is my cousin\'s baby boy.', '这是我表姐家的小宝宝，是个男孩。'], ['you', 'Oh, when\'s his birthday?', '哦，他的生日是哪天？'], ['A', 'The {n} of {m~}… no, sorry, of {m}.', '{m~.zh}{n.zh}号……不对，抱歉，是{m.zh}。']]],
        q: { en: 'When is the baby\'s birthday?', zh: '宝宝的生日在几月？' }, opts: ['In {m}|{m.zh}', 'In {m~}|{m~.zh}', 'In {m~}|{m~.zh}'] },
      { f: 'LP', k: 'lp', subs: ['L-num'], at: '和新加坡的家人视频', slots: { p: 'pair' }, only: { p: ['thirteen|thirty', 'fifteen|fifty'] }, bind: ['p'],
        say: [['A', 'My cousin is {p} this year.', '我表姐今年 {p:digits} 岁。']], q: { zh: '你听到的是哪个数？' }, opts: ['{p}', '{p~}'], optZh: true },
      { f: 'GF', k: 'gf-pl', subs: ['G-plural'], concept: 'irreg', needs: ['w1d5:a3'], at: '手机消息', slots: {}, bind: [],
        msg: ['A', 'Now my cousin has two ___: a boy and a girl! 👶', '现在我表姐有两个____了：一男一女！👶'], q: { zh: '选一个词填进空里' },
        opts: ['=children|child 的复数是 children（不规则）', '=child|two 后面要用复数', '=baby|two 后面要用复数，而且 baby 的复数是 babies'] }
    ]
  });
  scene({
    id: 'social-exercise', v: 1, zh: '约 Ben 一起锻炼', place: 'social', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d2:a2', 'w1d5:a2'], roles: { A: 'ben', B: 'you' }, ielts: ['L1'], gloss: {},
    frames: [
      { f: 'LC', k: 'lc', subs: ['L-date', 'L-detail'], at: '学校门口', slots: { d: 'weekday', t: 'time' }, only: { t: T_EVE }, bind: ['d', 't'],
        alt: [
          [['A', 'Do you want to exercise with me on {d} evening?', '{d.zh}晚上想和我一起锻炼吗？'], ['B', 'Sure. What time?', '好啊。几点？'], ['A', 'At {t}, in the park.', '{t.zh}，在公园。']],
          [['B', 'Ben, can we exercise on {d~}?', 'Ben，我们{d~.zh}锻炼可以吗？'], ['A', 'Sorry, I\'m busy that day. What about {d}?', '抱歉，我那天忙。{d.zh}怎么样？'], ['B', 'OK, {d} is fine.', '好，{d.zh}可以。']]],
        q: { en: 'When do they exercise?', zh: '他们哪天一起锻炼？' }, opts: ['{d}', '{d~}', '{d~}'] },
      { f: 'LF', k: 'lf', subs: ['L-time', 'L-date'], at: '学校门口', slots: { d: 'weekday', t: 'time' }, only: { t: ['07:00o', '07:30h', '08:00o', '18:00o', '18:30h', '19:00o'] }, bind: ['d', 't'],
        limit: { words: 1, num: true },
        alt: [
          [['A', 'Let\'s exercise in the park on {d}.', '我们{d.zh}去公园锻炼吧。'], ['B', 'OK! What time?', '好！几点？'], ['A', 'At {t~}. Oh wait, no—at {t}.', '{t~.zh}。哦，等等，不对——{t.zh}。']],
          [['B', 'When do we exercise, Ben?', 'Ben，我们什么时候锻炼？'], ['A', 'On {d}, at {t}. See you in the park!', '{d.zh}{t.zh}。公园见！']]],
        form: { title: ['Exercise with Ben', '和 Ben 锻炼'], rows: [['Day', '星期', '?d'], ['Time', '时间', '?t'], ['Place', '地点', 'the park']] },
        q: { zh: '和 Ben 约锻炼，把时间记下来' } }
    ]
  });
  scene({
    id: 'social-birthday-card', v: 1, zh: '给 Lily 的生日卡', place: 'social', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d3:a2'], roles: { A: 'lily', B: 'you' }, ielts: ['RG1', 'W1'],
    gloss: { dear: '亲爱的' },
    frames: [
      { f: 'RG', k: 'rg', subs: ['R-rule', 'R-detail'], at: 'Lily 收到的生日卡', slots: { f: 'family', m2: 'month' }, only: { f: ['mother', 'father', 'grandmother', 'grandfather', 'aunt', 'uncle'], m2: ['june', 'july', 'august', 'december'] },
        bind: ['f', 'm2'],
        text: { kind: 'message', title: ['A birthday card for Lily', '给 Lily 的生日卡'],
          lines: [['Dear Lily,', '亲爱的 Lily：'], ['Happy birthday! Have a great day with your friends. 🎂', '生日快乐！和朋友们好好过一天。🎂'], ['We can\'t wait to see you in {m2}!', '好想{m2.zh}见到你！'],
            ['Love from your {f}', '爱你的{f.zh}']] },
        items: [
          { f: 'RG', subs: ['R-rule', 'R-detail'], on: 'f', sum: ['The card is from Lily\'s ?f.', '这张卡是 Lily 的____寄来的。'] },
          { f: 'RG', subs: ['R-rule', 'L-date'], on: 'm2', sum: ['Lily sees her family in ?m2.', 'Lily ____见家人。'] }] },
      { f: 'VG', k: 'vg', subs: ['V-spell', 'V-cal'], at: '你写给 Lily 的卡片', slots: { d: 'weekday' }, bind: ['d'],
        msg: ['B', 'Happy birthday, Lily! See you at the café on ?d. 🎂', '生日快乐，Lily！____ 咖啡馆见。🎂'],
        q: { zh: '你在写生日卡，有一个词还没写。听一听，把它写上。' }, say: [['A', '{d}', '{d.zh}']] },
      { f: 'WT', k: 'wt', subs: ['W-sent'], at: '手机消息', slots: { s: 'xsent' }, bind: ['s'], fit: 'birthday',
        alt: [[['A', 'Thank you for the card! When is your birthday? 🎂', '谢谢你的卡片！你的生日是什么时候？🎂']]], msgFromAlt: true, q: { zh: '用英文回复 Lily：{s.zh}' } }
    ]
  });

  //  —— step 2a: services, getting around, the calendar ——
  scene({
    id: 'svc-gym', v: 1, zh: '健身房办卡', place: 'service', tier: 1, ch: 1, needs: ['w1d2:a2', 'w1d5:a2'], roles: { A: '@pool', B: 'you' }, ielts: ['L1'], gloss: { gym: '健身房' },
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-price', 'L-time'], at: '健身房前台', slots: { p: 'price', t: 'time' }, only: { p: ['13', '14', '15', '16', '17', '18', '19', '30', '40', '50'], t: ['07:00o', '07:00', '07:30h'] },
        bind: ['p', 't'], limit: { words: 1, num: true },
        alt: [
          [['B', 'Hello. How much is the gym a month?', '你好。健身房一个月多少钱？'], ['A', 'It\'s {p} a month for students.', '学生每月{p.zh}。'], ['B', 'And what time do you open?', '你们几点开门？'],
            ['A', 'At {t}, every day.', '每天{t.zh}。']],
          [['A', 'For students, it\'s {p~} a month. Sorry—{p}.', '学生每月{p~.zh}。抱歉——是{p.zh}。'], ['B', 'OK. What time do you open?', '好的。你们几点开门？'], ['A', 'We open early, at {t}.', '我们开得早，{t.zh}。']]],
        form: { title: ['Gym: student card', '健身房：学生卡'], rows: [['Price', '价格', '£?p a month'], ['Opens at', '开门时间', '?t']] },
        q: { zh: '去健身房问办卡，把价格和开门时间记下来' } },
      { f: 'LC', k: 'lc', subs: ['L-time', 'L-detail'], at: '健身房前台', slots: { t: 'time', t2: 'time' }, only: { t: ['07:00o', '07:30h'], t2: ['09:00o', '10:00o', '09:30h'] }, bind: ['t2'],
        alt: [
          [['A', 'We open early, at {t}, from Monday to Friday.', '周一到周五我们开得早，{t.zh}。'], ['A', 'At the weekend, we open at {t2}.', '周末{t2.zh}开门。']],
          [['B', 'Do you open at {t} on Saturday, too?', '周六也是{t.zh}开门吗？'], ['A', 'No. At the weekend, we open at {t2}.', '不是。周末{t2.zh}开门。']]],
        q: { en: 'What time does the gym open at the weekend?', zh: '健身房周末几点开门？' }, opts: ['{t2:digits}', '{t:digits}', '{t2~:digits}'] }
    ]
  });
  scene({
    id: 'svc-bank-card', v: 1, zh: '办银行卡', place: 'service', tier: 1, ch: 1, needs: ['w1d2:a2', 'w1d4:a2'], roles: { A: '@pool', B: 'you' }, ielts: ['L1'], gloss: {},
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-date', 'L-detail'], at: '银行柜台', slots: { d: 'weekday', m: 'month', n: 'dom' }, cal: ['d', 'm', 'n'], not: { d: ['sunday'] }, bind: ['m', 'd'], limit: { words: 1, num: true },
        alt: [
          [['A', 'What\'s your address, please?', '请问你的地址是？'], ['B', 'Flat 3, 8 Park Street.', '公园街 8 号 3 号公寓。'], ['A', 'Thank you. Your card is ready on {d}, the {n} of {m}.', '谢谢。你的卡{m.zh}{n.zh}号{d.zh}可以取。']],
          [['B', 'When will my new card be ready?', '我的新卡什么时候能好？'], ['A', 'On {d~}… sorry, no. On {d}, the {n} of {m}.', '{d~.zh}……不对，抱歉。{m.zh}{n.zh}号，{d.zh}。']]],
        form: { title: ['Bank card', '银行卡'], rows: [['Address', '地址', 'Flat 3, 8 Park Street'], ['Card ready on', '取卡日', '?d'], ['Date', '日期', '{n#} ?m']] },
        q: { zh: '在银行办卡，把取卡的日子记下来' } },
      { f: 'LC', k: 'lc', subs: ['L-time', 'L-detail'], at: '银行柜台', slots: { t1: 'time', t2: 'time' }, only: { t1: ['09:00o', '09:30h', '10:00o'], t2: ['12:00o', '13:00o', '12:30h'] }, bind: ['t2'],
        alt: [
          [['B', 'Is the bank open on Saturday?', '银行周六开门吗？'], ['A', 'Yes, from {t1} to {t2}.', '开，{t1.zh}到{t2.zh}。']],
          [['A', 'On Saturday, we open at {t1} and close at {t2}.', '周六我们{t1.zh}开门，{t2.zh}关门。'], ['B', 'Thank you!', '谢谢！']]],
        q: { en: 'What time does the bank close on Saturday?', zh: '银行周六几点关门？' }, opts: ['{t2:digits}', '{t1:digits}', '{t2~:digits}'] }
    ]
  });
  scene({
    id: 'svc-lost-umbrella', v: 1, zh: '失物招领：公交上丢了伞', place: 'service', tier: 1, ch: 1, needs: ['w1d2:a2', 'w1d5:a2'], roles: { A: '@pool', B: 'you' }, ielts: ['L1'],
    gloss: { lost: '丢失的', colour: '颜色' },
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-num', 'L-spell'], at: '公交公司 · 失物招领电话', slots: { b: 'teenty', c: 'colour', d: 'weekday' }, only: { b: ['13', '14', '15', '16', '17', '30', '40', '50'] }, not: { d: ['sunday'] }, bind: ['c', 'd', 'b'],
        limit: { words: 1, num: true },
        alt: [
          [['B', 'Hi. I think my umbrella is on the number {b} bus.', '你好。我的伞好像落在 {b:digits} 路公交车上了。'], ['A', 'What colour is it?', '什么颜色的？'], ['B', 'It\'s {c}, and it\'s new.', '{c.zh}的，是新伞。'],
            ['A', 'OK. You can get it on {d}.', '好的。你{d.zh}可以来拿。']],
          [['B', 'I think my umbrella is on the number {b~} bus. Sorry, no—{b}.', '我的伞好像落在 {b~:digits} 路车上了。抱歉，不对——是 {b:digits} 路。'], ['A', 'Is it {c}?', '是{c.zh}的吗？'],
            ['B', 'Yes. Can I get it on {d}?', '对。我{d.zh}能来拿吗？'], ['A', 'Yes, of course.', '当然可以。']]],
        form: { title: ['Lost property', '失物登记'], rows: [['Bus number', '公交线路', '?b'], ['Colour', '颜色', '?c'], ['Collect on', '领取日', '?d']] },
        q: { zh: '打电话找丢了的伞，把登记表填完' } },
      { f: 'LC', k: 'lc', subs: ['L-detail'], at: '公交公司 · 失物招领处', slots: { c: 'colour' }, bind: ['c'],
        alt: [
          [['A', 'Is your umbrella {c~0}?', '你的伞是{c~0.zh}的吗？'], ['B', 'No, it\'s {c}. A small {c} umbrella.', '不是，是{c.zh}的。一把小的{c.zh}伞。']],
          [['A', 'We have a {c~0} umbrella and a {c} umbrella.', '我们这儿有一把{c~0.zh}伞和一把{c.zh}伞。'], ['B', 'The {c} one is my umbrella!', '{c.zh}那把是我的！']]],
        q: { en: 'What colour is your umbrella?', zh: '你的伞是什么颜色的？' }, opts: ['{c}', '{c~0}', '{c~1}'] }
    ]
  });
  scene({
    id: 'svc-phone-plan', v: 1, zh: '手机套餐广告', place: 'service', tier: 1, ch: 1, needs: ['w1d2:a2'], roles: { A: '@pool', B: 'you' }, ielts: ['RG1', 'L1'], gloss: {},
    frames: [
      { f: 'RN', k: 'rn', subs: ['R-number', 'R-detail'], at: '手机店橱窗里的广告', slots: { p1: 'price', p2: 'price', p3: 'price' }, only: { p1: ['10', '12', '13'], p2: ['20', '30'], p3: ['8', '9', '15'] },
        distinct: [['p1', 'p2', 'p3']], bind: ['p1', 'p2'],
        text: { kind: 'notice', title: ['NEW PHONE PRICES', '手机新资费'],
          lines: [['A  Small: {p1:digits} a month, 100 minutes', 'A  小套餐：每月 {p1:digits}，100 分钟'], ['B  Big: {p2:digits} a month, 500 minutes', 'B  大套餐：每月 {p2:digits}，500 分钟'],
            ['C  Student: {p3:digits} a month, free calls after 6.00 pm', 'C  学生套餐：每月 {p3:digits}，晚上 6 点以后免费通话']] },
        items: [
          { f: 'RN', subs: ['R-number', 'L-price'], concept: 'price', on: 'p2', q: { en: 'How much does the Big one cost a month?', zh: '大套餐每月多少钱？' }, opts: ['{p2:digits}', '{p1:digits}', '{p3:digits}'] },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'Students can call for free in the evening.', zh: '学生晚上打电话免费。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'R-number'], stmt: { en: 'You get 500 minutes with the Small price.', zh: '小套餐有 500 分钟。' }, truth: 'F' },
          { f: 'RN', subs: ['R-number'], q: { en: 'How many minutes do you get with A?', zh: 'A 套餐有多少分钟？' }, opts: ['=100|100 分钟', '=500|500 分钟', '=50|50 分钟'] }] },
      { f: 'LC', k: 'lc', subs: ['L-num', 'L-detail'], at: '手机店', slots: { p: 'price', mi: 'teenty' }, only: { p: ['10', '12', '15'], mi: ['40', '50', '60'] }, bind: ['mi'],
        alt: [
          [['A', 'This one is {p} a month, with {mi} minutes.', '这个每月{p.zh}，有 {mi:digits} 分钟。'], ['B', '{mi:cap} minutes? That\'s fine for me.', '{mi:digits} 分钟？对我来说够了。']],
          [['B', 'How many minutes do I get?', '我能有多少分钟？'], ['A', 'You get {mi} minutes a month.', '每月 {mi:digits} 分钟。']]],
        q: { en: 'How many minutes a month?', zh: '每月有多少分钟？' }, opts: ['{mi:digits}', '{mi~:digits}', '{mi~:digits}'] }
    ]
  });
  scene({
    id: 'svc-laundry', v: 1, zh: '洗衣房告示', place: 'service', tier: 1, ch: 1, needs: ['w1d2:a2', 'w1d5:b3'], roles: { A: 'lily' }, ielts: ['RG1', 'L1'],
    gloss: { laundry: '洗衣房', wash: '洗' },
    frames: [
      { f: 'RT', k: 'rt', subs: ['R-tfng', 'R-para'], at: '楼下洗衣房的告示', slots: { p1: 'price', p2: 'price', t1: 'time', t2: 'time' }, only: { p1: ['2.50', '3', '3.50', '4'], p2: ['1', '1.50', '2'], t1: ['07:00o', '08:00o'], t2: ['20:00o', '20:30h'] },
        bind: ['p1', 't2'],
        text: { kind: 'notice', title: ['LAUNDRY ROOM', '洗衣房'],
          lines: [['Wash: {p1:digits} (45 minutes)', '洗衣：{p1:digits}（45 分钟）'], ['Dry: {p2:digits} (30 minutes)', '烘干：{p2:digits}（30 分钟）'],
            ['Open every day, {t1:digits} – {t2:digits}', '每天开放，{t1:digits} – {t2:digits}'], ['Please pay by card. No cash.', '请刷卡，不收现金。']] },
        items: [
          { f: 'RN', subs: ['R-number', 'L-price'], concept: 'price', on: 'p1', q: { en: 'How much is it to wash your clothes?', zh: '洗一次衣服多少钱？' }, opts: ['{p1:digits}', '{p2:digits}', '{p1~:digits}'] },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'You can pay in cash.', zh: '可以付现金。' }, truth: 'F' },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'Drying your clothes takes half an hour.', zh: '烘干衣服要半个小时。' }, truth: 'T' },
          { f: 'RN', subs: ['R-number', 'L-time'], concept: 'time', on: 't2', q: { en: 'What time does the laundry room close?', zh: '洗衣房几点关门？' }, opts: ['{t2:digits}', '{t1:digits}', '{t2~:digits}'] }] },
      { f: 'LC', k: 'lc', subs: ['L-price', 'L-detail'], at: '楼下洗衣房', slots: { p: 'price' }, only: { p: ['2.50', '3', '3.50', '4'] }, bind: ['p'],
        alt: [
          [['A', 'A wash is {p}, and it takes forty-five minutes.', '洗一次{p.zh}，要四十五分钟。'], ['you', 'OK. Can I pay in cash?', '好的。可以付现金吗？'], ['A', 'No, only by card.', '不行，只能刷卡。']],
          [['you', 'Lily, how much is a wash?', 'Lily，洗一次多少钱？'], ['A', 'It\'s {p}. You pay by card.', '{p.zh}。要刷卡付。']]],
        q: { en: 'How much is a wash?', zh: '洗一次多少钱？' }, opts: ['{p:digits}', '{p~:digits}', '{p~:digits}'] }
    ]
  });
  scene({
    id: 'svc-library-rules', v: 1, zh: '图书馆规定', place: 'service', tier: 1, ch: 1, needs: ['w1d2:a2', 'w1d4:a2'], roles: { A: '@pool' }, ielts: ['RG1', 'L2'], gloss: { library: '图书馆' },
    frames: [
      { f: 'RT', k: 'rt', subs: ['R-tfng', 'R-para'], at: '图书馆门口的告示', slots: { t1: 'time', t2: 'time' }, only: { t1: ['09:00o', '09:30h', '10:00o'], t2: ['17:00o', '18:00o', '19:00o'] }, bind: ['t1'],
        text: { kind: 'notice', title: ['CITY LIBRARY: PLEASE READ', '市图书馆：请阅读'],
          lines: [['Please be quiet in the library.', '图书馆里请保持安静。'], ['No food or drink. Water is OK.', '不能吃东西、喝饮料。水可以。'], ['You can take home six books for three weeks.', '一次可以借六本书，借三周。'],
            ['Open: Monday to Saturday, {t1:digits} – {t2:digits}', '开放时间：周一到周六，{t1:digits} – {t2:digits}'], ['Closed on Sunday', '周日不开放']] },
        items: [
          { f: 'RT', subs: ['R-tfng', 'R-detail'], stmt: { en: 'You can eat in the library.', zh: '图书馆里可以吃东西。' }, truth: 'F' },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'The library is not open on Sunday.', zh: '图书馆周日不开。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'R-detail'], stmt: { en: 'You can have water in the library.', zh: '图书馆里可以喝水。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'R-number'], stmt: { en: 'You can take home ten books.', zh: '一次可以借十本书。' }, truth: 'F' },
          { f: 'RT', subs: ['R-tfng'], needs: ['week:3'], stmt: { en: 'The library has computers for students.', zh: '图书馆有给学生用的电脑。' }, truth: 'NG' },
          { f: 'RN', subs: ['R-number', 'L-time'], concept: 'time', on: 't1', q: { en: 'What time does the library open?', zh: '图书馆几点开门？' }, opts: ['{t1:digits}', '{t1~:digits}', '{t1~:digits}'] }] },
      { f: 'LN', k: 'ln', subs: ['L-time', 'L-detail'], at: '图书馆的电话留言', slots: { t1: 'time', t2: 'time' }, only: { t1: ['09:00o', '09:30h', '10:00o'], t2: ['17:00o', '18:00o', '19:00o'] }, bind: ['t1', 't2'],
        limit: { words: 1, num: true },
        alt: [
          [['A', 'The library is open from {t1} to {t2}.', '图书馆{t1.zh}到{t2.zh}开放。'], ['A', 'We\'re open Monday to Saturday, but not on Sunday.', '周一到周六开放，周日不开。']],
          [['A', 'Hello, this is the City Library.', '你好，这里是市图书馆。'], ['A', 'We open at {t1} and close at {t2}.', '我们{t1.zh}开门，{t2.zh}关门。']]],
        notes: { title: ['City Library', '市图书馆'], rows: [['Opens', '开门', '?t1'], ['Closes', '关门', '?t2']] },
        q: { zh: '听图书馆的电话留言，把开放时间记下来' } }
    ]
  });
  scene({
    id: 'svc-volunteer', v: 1, zh: '报名做志愿者：周六上午在公园', place: 'service', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d2:a2', 'w1d3:a2'], roles: { A: '@pool', B: 'you' }, ielts: ['L1', 'L2'],
    gloss: { volunteer: '志愿者' },
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-time', 'L-detail'], at: '电话 · 志愿者报名', slots: { t: 'time', t2: 'time' }, only: { t: ['08:00o', '09:00o', '08:30h', '09:30h'], t2: ['11:00o', '12:00o', '11:30h'] }, bind: ['t', 't2'],
        limit: { words: 1, num: true },
        alt: [
          [['A', 'We need volunteers in the park on Saturday morning.', '我们周六上午在公园需要志愿者。'], ['B', 'I\'m free then. What time?', '我那时有空。几点？'], ['A', 'At {t}. We stop at {t2}.', '{t.zh}开始，{t2.zh}结束。']],
          [['A', 'Volunteers meet in the park on Saturday at {t}.', '志愿者周六{t.zh}在公园集合。'], ['B', 'At {t}? And when do we stop?', '{t.zh}？那什么时候结束？'], ['A', 'At {t2}. Thank you for helping!', '{t2.zh}。谢谢你来帮忙！']]],
        form: { title: ['Volunteers: the park', '公园志愿者'], rows: [['Day', '星期', 'Saturday'], ['Start', '开始', '?t'], ['Stop', '结束', '?t2'], ['Place', '地点', 'the park']] },
        q: { zh: '打电话报名做志愿者，把时间记下来' } },
      { f: 'LN', k: 'ln', subs: ['L-num', 'L-time'], at: 'Maple Bridge 广播', slots: { ag: 'teenty', t: 'time' }, only: { ag: ['16', '17', '18'], t: ['08:00o', '09:00o', '08:30h', '09:30h'] }, bind: ['ag', 't'],
        limit: { words: 1, num: true },
        alt: [
          [['A', 'Hello! Can you help in the park this Saturday?', '大家好！这周六你能来公园帮忙吗？'], ['A', 'You need to be {ag} or over.', '要年满 {ag:digits} 岁。'], ['A', 'We meet at {t}, near the café.', '我们{t.zh}在咖啡馆旁边集合。']],
          [['A', 'Volunteers, we meet at {t} on Saturday.', '志愿者们，我们周六{t.zh}集合。'], ['A', 'Everyone {ag} or over is welcome!', '年满 {ag:digits} 岁的人都欢迎！']]],
        notes: { title: ['Park volunteers', '公园志愿者'], rows: [['Day', '星期', 'Saturday'], ['Age', '年龄', '?ag or over'], ['Meet at', '集合时间', '?t']] },
        q: { zh: '听广播，把志愿者的要求记下来' } }
    ]
  });
  scene({
    id: 'svc-pool-times', v: 1, zh: '游泳馆开放时间与票价（大人 / 孩子）', place: 'service', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d2:a2', 'w1d3:a2'], roles: { A: '@pool', B: 'you' }, ielts: ['RG1', 'L1'],
    gloss: { swim: '游泳', adult: '成年人' },
    frames: [
      { f: 'RN', k: 'rn', subs: ['R-number', 'R-detail'], at: '游泳馆门口的告示', slots: { t1: 'time', t2: 'time', p1: 'price', p2: 'price' }, only: { t1: ['07:00o', '07:30h'], t2: ['09:00o', '10:00o'], p1: ['4', '5', '6'], p2: ['2', '2.50', '3'] },
        bind: ['p2', 't2'],
        text: { kind: 'notice', title: ['SWIMMING POOL', '游泳馆'],
          lines: [['Monday – Friday: {t1:digits} – 9.00 pm', '周一到周五：{t1:digits} – 晚上 9 点'], ['Saturday and Sunday: {t2:digits} – 6.00 pm', '周六周日：{t2:digits} – 下午 6 点'],
            ['Adults: {p1:digits} · Children: {p2:digits}', '成人：{p1:digits} · 儿童：{p2:digits}'], ['Children under 8: with a mother or father, please.', '8 岁以下的孩子请由父母陪同。']] },
        items: [
          { f: 'RN', subs: ['R-number', 'L-price'], concept: 'price', on: 'p2', q: { en: 'How much is it for a child?', zh: '孩子的票多少钱？' }, opts: ['{p2:digits}', '{p1:digits}', '{p2~:digits}'] },
          { f: 'RN', subs: ['R-number', 'L-time'], concept: 'time', on: 't2', q: { en: 'What time does the pool open on Sunday?', zh: '游泳馆周日几点开门？' }, opts: ['{t2:digits}', '{t1:digits}', '{t2~:digits}'] },
          { f: 'RT', subs: ['R-tfng', 'R-infer'], stmt: { en: 'It is cheaper for children.', zh: '孩子的票更便宜。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'R-infer'], stmt: { en: 'On Monday, you can swim in the evening.', zh: '周一晚上可以游泳。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'A child of six can come with no adult.', zh: '六岁的孩子可以没有大人陪同。' }, truth: 'F' }] },
      { f: 'LC', k: 'lc', subs: ['L-price', 'L-num'], at: '游泳馆售票处', slots: { p1: 'price', p2: 'price', s: 'price' }, only: { p1: ['4', '5', '6'], p2: ['2', '2.50', '3'] }, derive: { s: ['sum', 'p1', 'p1', 'p2'] }, bind: [],
        alt: [
          [['B', 'Two adults and one child, please.', '两个大人，一个孩子。'], ['A', 'That\'s {s}, please.', '一共{s.zh}。']],
          [['B', 'How much for two adults and a child?', '两个大人一个孩子多少钱？'], ['A', 'It\'s {s}. Here are your tickets.', '{s.zh}。这是你们的票。']]],
        q: { en: 'How much do they pay?', zh: '他们一共付多少钱？' }, opts: ['{s:digits}', '{s~:digits}', '{s~:digits}'] }
    ]
  });
  scene({
    id: 'svc-cinema-prices', v: 1, zh: '电影院票价：周二半价', place: 'service', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d2:a2'], roles: { A: '@pool' }, ielts: ['RG1', 'W1'], gloss: { cinema: '电影院' },
    frames: [
      { f: 'RN', k: 'rn', subs: ['R-number', 'R-para'], at: '电影院门口的价目表', slots: { p: 'price', h: 'price' }, only: { p: ['8', '10', '12', '14', '16'] }, derive: { h: ['half', 'p'] }, bind: ['p'],
        text: { kind: 'notice', title: ['MAPLE BRIDGE CINEMA', '枫桥电影院'],
          lines: [['Tickets: {p:digits}', '电影票：{p:digits}'], ['Every Tuesday: half price!', '每周二：半价！'], ['Students: 10% discount every day', '学生：每天九折'],
            ['Films start at 2.00, 5.00 and 8.00 pm.', '电影下午 2 点、5 点和晚上 8 点开场。']] },
        items: [
          { f: 'RN', subs: ['R-number', 'R-infer'], concept: 'price', on: 'h', q: { en: 'How much is a ticket on Tuesday?', zh: '周二一张票多少钱？' }, opts: ['{h:digits}', '{p:digits}', '{h~:digits}'] },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'Students can get a discount on any day.', zh: '学生哪天都能打折。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'R-number'], stmt: { en: 'The first film starts in the morning.', zh: '第一场电影在上午。' }, truth: 'F' },
          { f: 'RN', subs: ['R-detail', 'L-date'], concept: 'when', q: { en: 'When are tickets half price?', zh: '哪天票是半价？' }, opts: ['=On Tuesday|周二', '=On Thursday|周四', '=At the weekend|周末'] }] },
      { f: 'WD', k: 'wd', subs: ['W-task', 'W-sent'], at: '看表写句子', slots: { p: 'price', pc: 'price', pw: 'price', pcw: 'price', h: 'price', hc: 'price' },
        only: { p: ['10', '12'], pc: ['5', '6'], pw: ['14', '15', '16'], pcw: ['7', '8'] }, derive: { h: ['half', 'p'], hc: ['half', 'pc'] }, bind: [],
        table: { title: ['Maple Bridge Cinema: ticket prices', '枫桥电影院票价'],
          rows: [['', 'Adult', 'Child'], ['Tuesday', '{h:digits}', '{hc:digits}'], ['Monday, Wednesday – Friday', '{p:digits}', '{pc:digits}'], ['Saturday – Sunday', '{pw:digits}', '{pcw:digits}']] },
        task: { kind: 'W', min: 30, max: 80,
          bullets: [{ en: 'Say when tickets are cheap.', zh: '说哪天票便宜', keys: ['tuesday', 'cheap', 'half'] }, { en: 'Say how much a child pays.', zh: '说孩子的票多少钱', keys: ['child', 'children', '@price'] },
            { en: 'Say when tickets are expensive.', zh: '说哪天票贵', keys: ['saturday', 'sunday', 'weekend', 'expensive'] }] },
        q: { en: 'Look at the cinema prices.', zh: '看枫桥电影院的票价表，写 3–4 句：' } }
    ]
  });
  scene({
    id: 'health-pharmacy-hours', v: 1, zh: '药店营业时间（不写药名）', place: 'health', tier: 1, ch: 1, needs: ['w1d1:a2', 'w1d2:a2'], roles: { A: '@pool' }, ielts: ['RG1', 'L1'], gloss: { pharmacy: '药店' },
    frames: [
      { f: 'RT', k: 'rt', subs: ['R-tfng', 'R-para'], at: '药店门口的告示', slots: { t1: 'time', t2: 'time', t3: 'time' }, only: { t1: ['08:00o', '08:30h', '09:00o'], t2: ['18:00o', '19:00o', '20:00o'], t3: ['09:00o', '10:00o'] },
        bind: ['t2', 't1'],
        text: { kind: 'notice', title: ['PARK STREET PHARMACY', '公园街药店'],
          lines: [['Monday – Friday: {t1:digits} – {t2:digits}', '周一到周五：{t1:digits} – {t2:digits}'], ['Saturday: {t3:digits} – 1.00 pm', '周六：{t3:digits} – 下午 1 点'],
            ['Sunday: closed', '周日：不营业'], ['After {t2:digits}, please call 111.', '{t2.zh}以后请打 111。']] },
        items: [
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'The pharmacy is not open on Sunday.', zh: '药店周日不开门。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'R-number'], stmt: { en: 'On Saturday, it closes at 1.00 pm.', zh: '周六下午 1 点关门。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'R-infer'], stmt: { en: 'It opens at the same time every day.', zh: '它每天都在同一时间开门。' }, truth: 'F' },
          { f: 'RN', subs: ['R-number', 'L-time'], concept: 'time', on: 't2', q: { en: 'What time does it close on Monday?', zh: '周一几点关门？' }, opts: ['{t2:digits}', '{t1:digits}', '{t2~:digits}'] },
          { f: 'RN', subs: ['R-detail', 'R-para'], concept: 'when', q: { en: 'When is it closed all day?', zh: '哪天全天不营业？' }, opts: ['=On Sunday|周日', '=On Saturday|周六', '=On Monday|周一'] }] },
      { f: 'LN', k: 'ln', subs: ['L-time', 'L-detail'], at: '药店的电话留言', slots: { t1: 'time', t2: 'time' }, only: { t1: ['08:00o', '08:30h', '09:00o'], t2: ['18:00o', '19:00o', '20:00o'] }, bind: ['t1', 't2'],
        limit: { words: 1, num: true },
        alt: [
          [['A', 'Thank you for calling Park Street Pharmacy.', '感谢致电公园街药店。'], ['A', 'We\'re open from {t1} to {t2}, Monday to Friday.', '我们周一到周五营业，{t1.zh}到{t2.zh}。']],
          [['A', 'Hello, this is Park Street Pharmacy.', '你好，这里是公园街药店。'], ['A', 'From Monday to Friday, we open at {t1}.', '周一到周五，我们{t1.zh}开门。'], ['A', 'We close at {t2}.', '{t2.zh}关门。']]],
        notes: { title: ['Park Street Pharmacy', '公园街药店'], rows: [['Opens', '开门', '?t1'], ['Closes', '关门', '?t2']] },
        q: { zh: '听药店的电话留言，把营业时间记下来' } }
    ]
  });
  scene({
    id: 'travel-bus-times', v: 1, zh: '公交时刻表', place: 'travel', tier: 1, ch: 1, needs: ['w1d2:a2', 'w1d5:a2'], roles: { A: '@pool', B: 'you' }, ielts: ['RG1', 'L1'], gloss: {},
    frames: [
      { f: 'RN', k: 'rn', subs: ['R-number', 'R-detail'], at: '公交站的时刻表', slots: { b: 'teenty', mi: 'teenty', t1: 'time', t2: 'time', r: 'teenty' },
        only: { b: ['13', '15', '16', '17', '19'], mi: ['15', '30'], t1: ['07:00o', '07:30h'], t2: ['20:00o', '20:30h'], r: ['14', '15', '16', '40', '50'] }, bind: ['r'],
        text: { kind: 'notice', title: ['BUS {b:digits}: PARK STREET → CITY CENTRE', '{b:digits} 路：公园街 → 市中心'],
          lines: [['A bus every {mi:digits} minutes, from {t1:digits}', '从{t1.zh}起，每 {mi:digits} 分钟一班'], ['No buses after {t2:digits}', '{t2.zh}以后没有车'],
            ['The ride is {r:digits} minutes.', '车程 {r:digits} 分钟。']] },
        items: [
          { f: 'RN', subs: ['R-number'], concept: 'duration', on: 'r', q: { en: 'How long is the bus ride?', zh: '坐车要多久？' }, opts: ['{r} minutes|{r:digits} 分钟', '{r~} minutes|{r~:digits} 分钟', '{r~} minutes|{r~:digits} 分钟'] },
          { f: 'RN', subs: ['R-number', 'R-para'], q: { en: 'How often is there a bus?', zh: '多久一班车？' }, opts: ['Every {mi} minutes|每 {mi:digits} 分钟', '=Every hour|每小时', '=Every five minutes|每 5 分钟'] },
          { f: 'RT', subs: ['R-tfng', 'R-infer'], stmt: { en: 'You can get a bus at 9.30 pm.', zh: '晚上 9 点半还能坐到车。' }, truth: 'F' }] },
      { f: 'LF', k: 'lf', subs: ['L-num', 'L-time'], at: '电话 · 公交问询', slots: { b: 'teenty', t: 'time', r: 'teenty' }, only: { b: ['13', '15', '16', '17', '19'], t: T_DAY, r: ['14', '15', '16', '40', '50'] },
        bind: ['b', 't', 'r'], limit: { words: 1, num: true },
        alt: [
          [['B', 'Hello. When is the next bus to the city centre?', '你好。下一班去市中心的车是几点？'], ['A', 'The number {b} bus comes at {t}.', '{b:digits} 路车{t.zh}到。'], ['A', 'The ride is {r} minutes.', '车程 {r:digits} 分钟。']],
          [['A', 'Take the number {b~}… sorry, the number {b}.', '坐 {b~:digits} 路……抱歉，是 {b:digits} 路。'], ['A', 'It comes at {t}, and the ride is {r} minutes.', '{t.zh}到，车程 {r:digits} 分钟。']]],
        form: { title: ['Bus to the city centre', '去市中心的公交'], rows: [['Bus number', '公交线路', '?b'], ['Time', '时间', '?t'], ['Ride', '车程', '?r minutes']] },
        q: { zh: '打电话问公交，把线路、时间和车程记下来' } }
    ]
  });
  scene({
    id: 'travel-bus-pass', v: 1, zh: '学生公交月卡', place: 'travel', tier: 1, ch: 1, needs: ['w1d2:a2', 'w1d5:a2', 'w1d6:a2'], roles: { A: '@pool', B: 'you' }, ielts: ['L1'], gloss: { pass: '通行卡' },
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-price', 'L-num'], at: '公交站售票处', slots: { p: 'price', p2: 'price' }, only: { p: ['40', '50', '60'], p2: ['13', '14', '15', '16', '17', '18', '19', '30'] }, bind: ['p2'],
        limit: { words: 1, num: true },
        alt: [
          [['B', 'Hello. How much is a bus pass for a month?', '你好。公交月卡多少钱？'], ['A', 'It\'s {p}. Are you a student?', '{p.zh}。你是学生吗？'], ['B', 'Yes, I am.', '是的。'],
            ['A', 'Then it\'s only {p2}, with a student discount.', '那只要{p2.zh}，有学生折扣。']],
          [['A', 'For students, a month is {p2~}. Oh, sorry—{p2}.', '学生每月{p2~.zh}。哦，抱歉——是{p2.zh}。'], ['B', 'Great. Can I pay by card?', '太好了。可以刷卡吗？'], ['A', 'Yes, of course.', '当然可以。']]],
        form: { title: ['Bus pass (a month)', '公交月卡（每月）'], rows: [['Adult', '成人', '{p:digits}'], ['Student', '学生', '£?p2']] },
        q: { zh: '去买公交月卡，把学生价记下来' } },
      { f: 'LC', k: 'lc', subs: ['L-price', 'L-detail'], at: '公交站售票处', slots: { p2: 'price' }, only: { p2: ['13', '14', '15', '16', '17', '18', '19', '30'] }, bind: ['p2'],
        alt: [
          [['A', 'Do you have your student card?', '你带学生卡了吗？'], ['B', 'Yes, here you are.', '带了，给你。'], ['A', 'Thank you. The student pass is {p2} a month.', '谢谢。学生月卡每月{p2.zh}。']],
          [['B', 'Is the student pass {p2~} a month?', '学生月卡每月{p2~.zh}吗？'], ['A', 'No, it\'s {p2}.', '不是，是{p2.zh}。']]],
        q: { en: 'How much is the student pass?', zh: '学生月卡每月多少钱？' }, opts: ['{p2:digits}', '{p2~:digits}', '{p2~:digits}'] }
    ]
  });
  scene({
    id: 'season-holidays', v: 1, zh: '公共假期表', place: 'season', tier: 1, ch: 1, needs: ['w1d1:a2'], roles: { A: 'lily' }, ielts: ['RG1'], gloss: { holiday: '假日', public: '公共的' },
    frames: [
      { f: 'RM', k: 'rm', subs: ['R-match', 'R-para'], at: '日历上的假期表', slots: { n: 'dom', m: 'month', n2: 'dom' }, only: { m: ['may', 'october'], n2: ['24', '25', '26', '27', '28'] }, bind: ['m'],
        text: { kind: 'notice', title: ['PUBLIC HOLIDAYS', '公共假期'],
          lines: [['A  New Year\'s Day: the 1st of January', 'A  元旦：一月一号'], ['B  Maple Bridge Day: the {n#} of {m}', 'B  枫桥日：{m.zh}{n.zh}号'], ['C  Summer holiday: the {n2#} of August', 'C  夏季假日：八月{n2.zh}号']] },
        stmts: [{ en: 'This holiday is in the summer.', zh: '这个假日在夏天。', ans: 'C' }, { en: 'This holiday is at the start of the year.', zh: '这个假日在一年的开头。', ans: 'A' },
          { en: 'This holiday is in {m}.', zh: '这个假日在{m.zh}。', ans: 'B' }],
        q: { en: 'Which holiday is it? Write A, B or C.', zh: '是哪个假日？选 A、B 或 C。' } },
      { f: 'RN', k: 'rn', subs: ['R-detail', 'L-date'], at: '日历上的假期表', slots: { n: 'dom', m: 'month' }, only: { m: ['may', 'june', 'september', 'october'] }, bind: ['m'],
        text: { kind: 'notice', title: ['PUBLIC HOLIDAYS', '公共假期'],
          lines: [['New Year\'s Day: the 1st of January', '元旦：一月一号'], ['Maple Bridge Day: the {n#} of {m}', '枫桥日：{m.zh}{n.zh}号'], ['No classes on these days!', '这几天不上课！']] },
        items: [
          { f: 'RN', subs: ['R-detail', 'L-date'], concept: 'when', on: 'm', q: { en: 'When is Maple Bridge Day?', zh: '枫桥日是哪天？' },
            opts: ['The {n#} of {m}|{m.zh}{n.zh}号', 'The {n#} of {m~}|{m~.zh}{n.zh}号', 'The {n~#} of {m}|{m.zh}{n~.zh}号'] },
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'There is no English class on the 1st of January.', zh: '一月一号没有英语课。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'L-date'], on: 'm', stmt: { en: 'Maple Bridge Day is in {m~}.', zh: '枫桥日在{m~.zh}。' }, truth: 'F' }] }
    ]
  });

  //  —— step 2a: the 16 scenes that wait for later weeks (§4.3 "需要" 第 2 周 … 第 10 周; 'week:N' = she has started week N) ——
  scene({
    id: 'shop-return', v: 1, zh: '退货', place: 'market', tier: 1, ch: 2, needs: ['week:2'], roles: { A: '@pool', B: 'you' }, ielts: ['L1'], gloss: { receipt: '小票', shirt: '衬衫' },
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-price', 'L-date'], at: '服装店 · 收银台', slots: { d: 'weekday', p: 'price' }, only: { p: ['13', '14', '15', '16', '17', '18', '19', '30', '40', '50'] }, bind: ['d', 'p'],
        limit: { words: 1, num: true },
        alt: [
          [['B', 'Hello. I bought this shirt on {d}, but it\'s too small.', '你好。我{d.zh}买了这件衬衫，可是太小了。'], ['A', 'No problem. Do you have the receipt?', '没问题。你有小票吗？'],
            ['B', 'Yes. It was {p}.', '有。当时是{p.zh}。'], ['A', 'OK. Here\'s your {p}.', '好的，退你{p.zh}。']],
          [['A', 'When did you buy it?', '你什么时候买的？'], ['B', 'On {d~}. Oh, sorry, no—on {d}.', '{d~.zh}。哦，抱歉，不对——是{d.zh}。'], ['A', 'And the price?', '价格呢？'], ['B', 'It was {p}.', '{p.zh}。']]],
        form: { title: ['Returns', '退货登记'], rows: [['Item', '商品', 'shirt (too small)'], ['Bought on', '购买日', '?d'], ['Price', '价格', '£?p']] },
        q: { zh: '去店里退货，帮店员把退货单填完' } },
      { f: 'LC', k: 'lc', subs: ['L-detail'], at: '服装店 · 收银台', slots: {}, bind: [],
        alt: [
          [['A', 'Do you want a new shirt, or your money back?', '你想换一件新的，还是退钱？'], ['B', 'My money back, please.', '请退钱。']],
          [['B', 'Can I have my money back, please?', '可以退钱吗？'], ['A', 'Yes, of course. Here you are.', '当然可以。给你。']]],
        q: { en: 'What does the shop give you?', zh: '店里给了你什么？' }, opts: ['=Your money back|退钱', '=A new shirt|一件新衬衫', '=A discount|一个折扣'] }
    ]
  });
  scene({
    id: 'shop-list', v: 1, zh: '周末购物清单', place: 'market', tier: 1, ch: 2, needs: ['week:2'], roles: { A: 'lily', B: 'you' }, ielts: ['W1'], gloss: {},
    frames: [
      { f: 'VG', k: 'vg', subs: ['V-spell'], at: '手机消息', slots: { f: 'food', d: 'weekday' }, bind: ['f'],
        msg: ['A', 'Can you get some ?f at the shop on {d}? 🛒', '你{d.zh}能在商店买点____吗？🛒'],
        q: { zh: 'Lily 发来一条消息，有一个词没打出来。听一听，把它写上。' }, say: [['A', '{f}', '{f.zh}']] },
      { f: 'WM', k: 'wm', subs: ['W-task', 'W-length'], at: '给 Lily 的留言', slots: {}, bind: [],
        task: { kind: 'W', min: 30, max: 60,
          bullets: [{ en: 'Say what we need from the shop.', zh: '说家里要买什么', keys: ['eggs', 'bread', 'milk', 'rice', 'fruit', 'apples', 'tea', 'coffee', 'cheese'] },
            { en: 'Say which shop is good and why.', zh: '说去哪家店、为什么', keys: ['shop', 'market', 'supermarket', 'cheap', 'fresh'] },
            { en: 'Say when you can go.', zh: '说你什么时候能去', keys: ['@weekday', 'today', 'tomorrow', 'morning', 'evening', 'weekend'] }] },
        q: { en: 'Write a note to Lily about the weekend shopping.', zh: '给 Lily 写一张 30–60 词的留言，说周末买东西的事：' } }
    ]
  });
  scene({
    id: 'school-campus-tour', v: 1, zh: '校园参观', place: 'school', tier: 1, ch: 3, needs: ['week:3'], roles: { A: '@pool', B: 'you' }, ielts: ['L2'], gloss: { opposite: '在……对面' },
    frames: [
      { f: 'LM', k: 'lm', subs: ['L-map', 'L-detail'], at: '语言学校 · 校园平面图', slots: { r: 'campus', r2: 'campus' }, distinct: [['r', 'r2']], bind: ['r'],
        alt: [
          [['A', 'Welcome! We\'re at the main door now.', '欢迎！我们现在在大门口。'], ['A', 'The {r} is on your left.', '{r.zh}在你左边。'], ['A', 'The {r2} is on your right.', '{r2.zh}在你右边。']],
          [['B', 'Where\'s the {r}?', '{r.zh}在哪儿？'], ['A', 'It\'s on the left when you come in.', '进门左手边就是。'], ['A', 'The {r2} is opposite it.', '{r2.zh}在它对面。']]],
        table: { title: ['Maple Bridge Language School: the plan', '枫桥语言学校平面图'], rows: [['A', 'B', 'C'], ['D', '▲ main door', 'E']] },
        q: { en: 'Where is the {r}?', zh: '{r.zh}在平面图上的哪个位置？' }, opts: ['=D|D：大门左边', '=E|E：大门右边', '=B|B：大门正对面'] },
      { f: 'LM', k: 'lm-b', subs: ['L-map', 'L-detail'], at: '语言学校 · 校园平面图', slots: { r: 'campus', r2: 'campus', r3: 'campus' }, distinct: [['r', 'r2', 'r3']], bind: ['r'],
        alt: [
          [['A', 'Go straight on from the main door.', '从大门一直往前走。'], ['A', 'The {r} is in front of you.', '{r.zh}就在你前面。'], ['A', 'It\'s between the {r2} and the {r3}.', '在{r2.zh}和{r3.zh}中间。']],
          [['B', 'Is the {r} next to the main door?', '{r.zh}在大门旁边吗？'], ['A', 'No, it\'s opposite the main door, in the middle.', '不是，在大门正对面，中间那间。']]],
        table: { title: ['Maple Bridge Language School: the plan', '枫桥语言学校平面图'], rows: [['A', 'B', 'C'], ['D', '▲ main door', 'E']] },
        q: { en: 'Where is the {r}?', zh: '{r.zh}在平面图上的哪个位置？' }, opts: ['=B|B：大门正对面', '=A|A：左上角', '=C|C：右上角'] },
      { f: 'LC', k: 'lc', subs: ['L-num', 'L-detail'], at: '语言学校 · 走廊', slots: { r: 'campus', fl: 'dom', fl2: 'dom', fl3: 'dom' }, only: { fl: ['1', '2', '3'], fl2: ['1', '2', '3'], fl3: ['1', '2', '3'] },
        distinct: [['fl', 'fl2', 'fl3']], bind: ['r', 'fl'],
        alt: [
          [['A', 'The {r} is on the {fl} floor. You can take the lift.', '{r.zh}在{fl:floor.zh}。你可以坐电梯。'], ['B', 'Thanks!', '谢谢！']],
          [['B', 'Is the {r} on the {fl2} floor?', '{r.zh}在{fl2:floor.zh}吗？'], ['A', 'No, it\'s on the {fl} floor.', '不是，在{fl:floor.zh}。']]],
        q: { en: 'Which floor is the {r} on?', zh: '{r.zh}在几楼？' }, opts: ['The {fl} floor|{fl:floor.zh}', 'The {fl2} floor|{fl2:floor.zh}', 'The {fl3} floor|{fl3:floor.zh}'] }
    ]
  });
  scene({
    id: 'social-film', v: 1, zh: '周五看电影', place: 'social', tier: 1, ch: 4, needs: ['week:4'], roles: { A: 'lily', B: 'you' }, ielts: ['L1'], gloss: { cinema: '电影院' },
    frames: [
      { f: 'LC', k: 'lc', subs: ['L-time', 'L-detail'], at: '家里', slots: { t: 'time', p: 'price' }, only: { t: T_EVE, p: ['8', '9', '10', '12'] }, bind: ['t'],
        alt: [
          [['A', 'Do you want to see a film on Friday?', '周五想去看电影吗？'], ['B', 'Sure! What time does it start?', '好啊！几点开始？'], ['A', 'At {t}. The tickets are {p} each.', '{t.zh}。票每张{p.zh}。']],
          [['A', 'The film starts at {t~}… no, sorry, at {t}.', '电影{t~.zh}开始……不对，抱歉，是{t.zh}。'], ['B', 'OK. Let\'s meet at the cinema.', '好。我们在电影院见。']]],
        q: { en: 'What time does the film start?', zh: '电影几点开始？' }, opts: ['{t:digits}', '{t~:digits}', '{t~:digits}'] },
      { f: 'LC', k: 'lc-g', subs: ['L-detail'], at: '家里', slots: { g: 'genre' }, bind: ['g'],
        alt: [
          [['A', 'I don\'t want to see {g~0}. Let\'s see {g}!', '我不想看{g~0.zh}。我们看{g.zh}吧！'], ['B', 'OK, {g} is fine.', '好，看{g.zh}可以。']],
          [['B', 'What kind of film is it?', '是什么类型的电影？'], ['A', 'It\'s {g}. You\'ll love it!', '是{g.zh}。你肯定喜欢！']]],
        q: { en: 'What kind of film do they see?', zh: '他们看什么类型的电影？' }, opts: ['{g:cap}', '{g~0:cap}', '{g~1:cap}'] }
    ]
  });
  scene({
    id: 'svc-post', v: 1, zh: '寄包裹', place: 'service', tier: 1, ch: 2, needs: ['week:2'], roles: { A: '@pool', B: 'you' }, ielts: ['L1'], gloss: { parcel: '包裹', stamp: '邮票' },
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-num', 'L-price'], at: '邮局柜台', slots: { h: 'teenty', st: 'stname', p: 'price', d: 'weekday' }, only: { p: ['3.50', '4.50', '5', '6', '13.50', '15'] }, not: { d: ['sunday'] }, bind: ['h', 'p', 'd'],
        limit: { words: 1, num: true },
        alt: [
          [['A', 'Where\'s your parcel going?', '你的包裹寄到哪儿？'], ['B', 'To {h} {st}, in London.', '寄到伦敦{st.zh}{h.zh}号。'], ['A', 'OK. That\'s {p}. It gets there on {d}.', '好的。{p.zh}。{d.zh}能到。']],
          [['B', 'This parcel is for {h} {st}, London.', '这个包裹寄到伦敦{st.zh}{h.zh}号。'], ['A', 'That\'s {p~}… sorry, {p}.', '{p~.zh}……抱歉，是{p.zh}。'], ['A', 'It gets there on {d}.', '{d.zh}能到。']]],
        form: { title: ['Parcel', '包裹单'], rows: [['To', '寄往', '?h {st}, London'], ['Price', '价格', '£?p'], ['Arrives on', '到达日', '?d']] },
        q: { zh: '在邮局寄包裹，把包裹单填完' } },
      { f: 'LC', k: 'lc', subs: ['L-price', 'L-detail'], at: '邮局柜台', slots: { p: 'price' }, only: { p: ['1.50', '2', '2.50', '3.50'] }, bind: ['p'],
        alt: [
          [['B', 'How much is a stamp for a card to Singapore?', '寄一张卡片到新加坡的邮票多少钱？'], ['A', 'It\'s {p}.', '{p.zh}。']],
          [['A', 'A stamp to Singapore is {p~}. Oh, sorry, it\'s {p}.', '到新加坡的邮票{p~.zh}。哦，抱歉，是{p.zh}。'], ['B', 'Thank you.', '谢谢。']]],
        q: { en: 'How much is the stamp?', zh: '邮票多少钱？' }, opts: ['{p:digits}', '{p~:digits}', '{p~:digits}'] }
    ]
  });
  scene({
    id: 'travel-train-ticket', v: 1, zh: '买火车票', place: 'travel', tier: 1, ch: 2, needs: ['week:2'], roles: { A: '@pool', B: 'you' }, ielts: ['L1'], gloss: { platform: '站台', return: '往返的' },
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-price', 'L-time'], at: '火车站售票处', slots: { p: 'price', t: 'time', pl: 'count' }, only: { p: ['13', '14', '15', '16', '30', '40', '50'], t: T_DAY }, bind: ['p', 't'],
        limit: { words: 1, num: true },
        alt: [
          [['B', 'A return ticket to London, please.', '一张去伦敦的往返票。'], ['A', 'That\'s {p}. The next train is at {t}.', '{p.zh}。下一班车{t.zh}。'], ['B', 'Which platform?', '哪个站台？'], ['A', 'Platform {pl}.', '{pl.zh}号站台。']],
          [['A', 'The next train is at {t~}. Sorry, no—at {t}.', '下一班车{t~.zh}。抱歉，不对——是{t.zh}。'], ['A', 'A return ticket is {p}.', '往返票{p.zh}。'], ['B', 'And the platform?', '站台呢？'], ['A', 'Platform {pl}.', '{pl.zh}号站台。']]],
        form: { title: ['Train to London', '去伦敦的火车'], rows: [['Ticket', '车票', 'return'], ['Price', '价格', '£?p'], ['Train', '发车时间', '?t'], ['Platform', '站台', '?pl']] },
        q: { zh: '在火车站买票，把票价、时间和站台记下来' } },
      { f: 'LC', k: 'lc', subs: ['L-time', 'L-detail'], at: '火车站广播', slots: { t: 'time' }, only: { t: T_DAY }, bind: ['t'],
        alt: [
          [['A', 'The train to London is late today.', '今天去伦敦的火车晚点了。'], ['A', 'It now leaves at {t}.', '现在{t.zh}发车。']],
          [['A', 'The London train at {t~} isn\'t running today.', '{t~.zh}去伦敦的车今天停运。'], ['A', 'The next train leaves at {t}.', '下一班车{t.zh}发车。']]],
        q: { en: 'What time does the train to London leave?', zh: '去伦敦的火车几点发车？' }, opts: ['{t:digits}', '{t~:digits}', '{t~:digits}'] }
    ]
  });
  scene({
    id: 'travel-directions', v: 1, zh: '问路', place: 'travel', tier: 1, ch: 3, needs: ['week:3'], roles: { A: '@pool', B: 'you' }, ielts: ['L2'], gloss: {},
    frames: [
      { f: 'LM', k: 'lm-a', subs: ['L-map', 'L-detail'], at: '街上 · 问路', slots: { r: 'townp' }, bind: ['r'],
        alt: [
          [['B', 'Excuse me, where\'s the {r}?', '打扰一下，{r.zh}在哪儿？'], ['A', 'Turn left and walk past the bank.', '向左转，走过银行。'], ['A', 'The {r} is at the end of the street.', '{r.zh}就在街的尽头。']],
          [['A', 'The {r}? Go left, past the bank.', '{r.zh}？往左走，过了银行就是。'], ['A', 'It\'s the last building on the left.', '左边最后一栋楼。']]],
        table: { title: ['Green Street', '格林街'], rows: [['A', 'bank', 'B', 'café', 'C'], ['', '', '● you', '', '']] },
        q: { en: 'Where is the {r}?', zh: '{r.zh}在地图上的哪个位置？' }, opts: ['=A|A：左边尽头', '=B|B：正前方', '=C|C：右边尽头'] },
      { f: 'LM', k: 'lm-b', subs: ['L-map', 'L-detail'], at: '街上 · 问路', slots: { r: 'townp' }, bind: ['r'],
        alt: [
          [['B', 'Sorry, is the {r} near here?', '请问{r.zh}在附近吗？'], ['A', 'Yes! It\'s right in front of you.', '在！就在你正前方。'], ['A', 'It\'s between the bank and the café.', '在银行和咖啡馆中间。']],
          [['A', 'Look, the {r} is just opposite you.', '你看，{r.zh}就在你对面。'], ['A', 'It\'s between the bank and the café.', '在银行和咖啡馆中间。']]],
        table: { title: ['Green Street', '格林街'], rows: [['A', 'bank', 'B', 'café', 'C'], ['', '', '● you', '', '']] },
        q: { en: 'Where is the {r}?', zh: '{r.zh}在地图上的哪个位置？' }, opts: ['=B|B：正前方', '=A|A：左边尽头', '=C|C：右边尽头'] },
      { f: 'LM', k: 'lm-c', subs: ['L-map', 'L-detail'], at: '街上 · 问路', slots: { r: 'townp' }, bind: ['r'],
        alt: [
          [['B', 'Excuse me, how do I get to the {r}?', '打扰一下，去{r.zh}怎么走？'], ['A', 'Turn right and walk past the café.', '向右转，走过咖啡馆。'], ['A', 'The {r} is at the end, on the right.', '{r.zh}在右边的尽头。']],
          [['A', 'Go right, past the café. The {r} is the last building.', '往右走，过了咖啡馆，最后一栋楼就是{r.zh}。']]],
        table: { title: ['Green Street', '格林街'], rows: [['A', 'bank', 'B', 'café', 'C'], ['', '', '● you', '', '']] },
        q: { en: 'Where is the {r}?', zh: '{r.zh}在地图上的哪个位置？' }, opts: ['=C|C：右边尽头', '=A|A：左边尽头', '=B|B：正前方'] }
    ]
  });
  scene({
    id: 'travel-airport', v: 1, zh: '去机场接人', place: 'travel', tier: 1, ch: 2, needs: ['week:2'], roles: { A: 'lily', B: 'you' }, ielts: ['L1'], gloss: { flight: '航班', airport: '机场' },
    frames: [
      { f: 'LF', k: 'lf', subs: ['L-date', 'L-time'], at: '家里 · Lily 说她爸妈要来', slots: { d: 'weekday', m: 'month', n: 'dom', t: 'time' }, cal: ['d', 'm', 'n'], only: { t: T_DAY }, bind: ['m', 'd', 't'],
        limit: { words: 1, num: true },
        alt: [
          [['A', 'My parents arrive on {d}, the {n} of {m}!', '我爸妈{m.zh}{n.zh}号{d.zh}到！'], ['B', 'Great! What time is the flight?', '太好了！航班几点？'], ['A', 'It gets in at {t}. Can you come to the airport with me?', '{t.zh}到。你能陪我去机场吗？']],
          [['A', 'The flight gets in at {t~}. Sorry—at {t}.', '航班{t~.zh}到。抱歉——是{t.zh}。'], ['B', 'And which day?', '哪天？'], ['A', '{d}, the {n} of {m}.', '{m.zh}{n.zh}号，{d.zh}。']]],
        form: { title: ['Lily\'s parents', 'Lily 的父母'], rows: [['Arrive on', '到达日', '?d'], ['Date', '日期', '{n#} ?m'], ['Time', '时间', '?t']] },
        q: { zh: 'Lily 的爸妈要来，把航班的时间记下来' } },
      { f: 'LC', k: 'lc', subs: ['L-time', 'L-turn'], at: '机场', slots: { t: 'time' }, only: { t: T_DAY }, bind: ['t'],
        alt: [
          [['A', 'Oh, the flight time changed.', '哦，航班时间改了。'], ['A', 'It gets in at {t} now, not {t~}.', '现在{t.zh}到，不是{t~.zh}了。']],
          [['B', 'Is the flight on time?', '航班准点吗？'], ['A', 'No, it\'s late. It gets in at {t}.', '不准点，晚了。{t.zh}到。']]],
        q: { en: 'What time does the flight get in now?', zh: '航班现在几点到？' }, opts: ['{t:digits}', '{t~:digits}', '{t~:digits}'] }
    ]
  });
  scene({
    id: 'travel-holiday', v: 1, zh: '假期计划', place: 'travel', tier: 1, ch: 3, needs: ['week:3'], roles: { A: 'ben', B: 'you' }, ielts: ['L3', 'S2'], gloss: { sea: '海边' },
    frames: [
      { f: 'LC', k: 'lc', subs: ['L-num', 'L-detail'], at: '下课以后', slots: { c: 'count', m: 'month' }, only: { c: ['3', '4', '5', '6', '7'] }, bind: ['m'],
        alt: [
          [['A', 'I want to go to the sea for my holiday.', '我假期想去海边。'], ['B', 'Nice! When?', '真好！什么时候？'], ['A', 'In {m}, for {c} days.', '{m.zh}，去 {c:digits} 天。']],
          [['B', 'Ben, is your holiday in {m~}?', 'Ben，你的假期在{m~.zh}吗？'], ['A', 'No, in {m}. I go for {c} days.', '不是，在{m.zh}。去 {c:digits} 天。']]],
        q: { en: 'When is Ben\'s holiday?', zh: 'Ben 的假期在几月？' }, opts: ['In {m}|{m.zh}', 'In {m~}|{m~.zh}', 'In {m~}|{m~.zh}'] },
      { f: 'SC', k: 'sc', subs: ['S-ext', 'S-flu'], needs: ['week:8'], at: '口语模拟考 · Part 2', slots: {}, bind: [],
        say: [['clarke', 'Now I\'d like you to talk about a trip. You have one minute to get ready.', '现在请你讲一次旅行。你有一分钟准备。']],
        task: { kind: 'S', min: 60, max: 220,
          bullets: [{ en: 'where you went', zh: '去了哪里', keys: [] }, { en: 'who you went with', zh: '和谁去的', keys: ['with'] }, { en: 'what you did there', zh: '在那儿做了什么', keys: [] },
            { en: 'and explain why you liked it', zh: '并说说你为什么喜欢', keys: ['because', 'so'] }] },
        q: { en: 'Describe a trip you enjoyed.', zh: '描述一次你喜欢的旅行。准备 1 分钟，说 1–2 分钟。' } }
    ]
  });
  scene({
    id: 'season-forecast', v: 1, zh: '天气预报', place: 'season', tier: 1, ch: 2, needs: ['week:2'], roles: { A: '@pool' }, ielts: ['L2', 'RG1'], gloss: { degrees: '度（气温）' },
    frames: [
      { f: 'LN', k: 'ln', subs: ['L-num', 'L-spell'], at: 'Maple Bridge 广播 · 天气预报', slots: { d: 'weekday', w: 'weather', c: 'teenty' }, only: { c: ['13', '14', '15', '16', '17', '18', '19'] }, bind: ['w', 'c', 'd'],
        limit: { words: 1, num: true },
        alt: [
          [['A', 'Here\'s the weather for Maple Bridge.', '下面是枫桥的天气预报。'], ['A', 'On {d}, it\'ll be {w}, and {c} degrees.', '{d.zh}{w.zh}，{c:digits} 度。']],
          [['A', 'Good morning! This {d}, it\'ll be {w}.', '早上好！这周{d.zh}{w.zh}。'], ['A', 'It\'ll be {c~} degrees… sorry, {c} degrees.', '气温 {c~:digits} 度……抱歉，是 {c:digits} 度。']]],
        notes: { title: ['The weather on {d}', '{d.zh}的天气'], rows: [['Weather', '天气', '?w'], ['Temperature', '气温', '?c°C']] },
        q: { zh: '听天气预报，把笔记补完整' } },
      { f: 'RT', k: 'rt', subs: ['R-tfng', 'R-detail'], at: '手机上的天气', slots: { w1: 'weather', w2: 'weather', c1: 'teenty', c2: 'teenty' }, only: { c1: ['13', '14', '15', '16'], c2: ['17', '18', '19'] }, distinct: [['w1', 'w2']],
        bind: ['w1'],
        text: { kind: 'notice', title: ['THIS WEEKEND', '本周末天气'], lines: [['Saturday: {w1}, {c1:digits}°C', '周六：{w1.zh}，{c1:digits}°C'], ['Sunday: {w2}, {c2:digits}°C', '周日：{w2.zh}，{c2:digits}°C']] },
        items: [
          { f: 'RT', subs: ['R-tfng', 'R-detail'], on: 'w1', stmt: { en: 'On Saturday, it will be {w1}.', zh: '周六{w1.zh}。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'R-infer'], stmt: { en: 'Sunday will be warmer than Saturday.', zh: '周日比周六暖和。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng', 'R-detail'], on: 'w1', stmt: { en: 'On Sunday, it will be {w1}.', zh: '周日{w1.zh}。' }, truth: 'F' }] }
    ]
  });
  scene({
    id: 'acad-lecture-sleep', v: 1, zh: '讲座：睡眠与学习', place: 'acad', tier: 2, ch: 7, needs: ['week:7'], roles: { A: '@pool' }, ielts: ['L4'], gloss: { brain: '大脑', 'per cent': '百分之' },
    frames: [
      { f: 'LN', k: 'ln', subs: ['L-num', 'L-detail'], at: '大学讲座', slots: { h: 'count', p: 'teenty' }, only: { h: ['7', '8'], p: ['30', '40', '50', '60'] }, bind: ['p'], limit: { words: 1, num: true },
        alt: [
          [['A', 'Good morning. Today\'s talk is about sleep and learning.', '早上好。今天讲睡眠和学习。'], ['A', 'Students who sleep {h} hours or more remember more new words.', '睡 {h:digits} 个小时或以上的学生，记住的新单词更多。'],
            ['A', 'But in our study, {p} per cent of students sleep less than six hours.', '可是在我们的研究里，{p:digits}% 的学生睡不到六个小时。'], ['A', 'So sleep isn\'t lost time. It helps your brain.', '所以睡觉不是浪费时间，它在帮你的大脑。']],
          [['A', 'Let\'s look at our numbers.', '我们来看看数据。'], ['A', 'About {p} per cent of our students sleep less than six hours.', '大约 {p:digits}% 的学生睡不到六个小时。'],
            ['A', 'The best students sleep {h} hours or more.', '成绩最好的学生睡 {h:digits} 个小时或以上。']]],
        notes: { title: ['Sleep and learning', '睡眠与学习'], rows: [['Good sleep', '好的睡眠', '?h hours or more'], ['Students with little sleep', '睡得少的学生', '?p per cent']] },
        q: { zh: '听讲座，把笔记补完整' } },
      { f: 'LC', k: 'lc', subs: ['L-detail'], at: '大学讲座', slots: {}, bind: [],
        alt: [
          [['A', 'Many students study late at night before an exam.', '很多学生考试前熬夜学习。'], ['A', 'But the brain needs sleep to keep what we learn.', '可是大脑需要睡眠，才能记住学过的东西。'],
            ['A', 'So my advice is simple: go to bed early.', '所以我的建议很简单：早点睡。']]],
        q: { en: 'What is the speaker\'s main idea?', zh: '讲者主要想说什么？' },
        opts: ['=Sleep helps you learn.|睡眠帮助学习。', '=Study late before an exam.|考试前要熬夜学。', '=Exams are not important.|考试不重要。'] }
    ]
  });
  scene({
    id: 'acad-survey', v: 1, zh: '学生调查（柱图）', place: 'acad', tier: 2, ch: 7, needs: ['week:7'], roles: {}, ielts: ['W1', 'RA'], gloss: { survey: '调查', 'per cent': '百分之' },
    frames: [
      { f: 'RN', k: 'rn', subs: ['R-number', 'R-detail'], at: '学术短文', slots: { a: 'teenty', b: 'teenty', c: 'teenty', aq: 'adj' }, only: { a: ['50', '60'], b: ['30'], aq: ['quiet'] }, derive: { c: ['rest', 'a', 'b'] }, bind: ['a', 'aq'],
        text: { kind: 'article', title: ['Where Do Students Study?', '学生在哪儿学习？'],
          lines: [['A survey asked 200 students at Maple Bridge University where they study.', '一项调查问了枫桥大学的 200 名学生在哪儿学习。'],
            ['{a:digits} per cent study in the library, and {b:digits} per cent study at home.', '{a:digits}% 在图书馆学，{b:digits}% 在家学。'], ['Only {c:digits} per cent study in cafés.', '只有 {c:digits}% 在咖啡馆学。'],
            ['Most students say the library is {aq}, but home is more comfortable.', '大多数学生说图书馆很{aq.zh}，但家里更舒服。']] },
        items: [
          { f: 'RN', subs: ['R-number'], on: 'a', q: { en: 'What percentage of students study in the library?', zh: '在图书馆学习的学生占多少？' }, opts: ['{a:digits}%|{a:digits}%', '{b:digits}%|{b:digits}%', '{c:digits}%|{c:digits}%'] },
          { f: 'RT', subs: ['R-tfng', 'R-infer'], stmt: { en: 'The library is the most popular place to study.', zh: '图书馆是最受欢迎的学习地点。' }, truth: 'T' },
          { f: 'RT', subs: ['R-tfng'], stmt: { en: 'Most students think home is noisy.', zh: '大多数学生觉得家里吵。' }, truth: 'NG' },
          { f: 'RG', subs: ['R-rule', 'R-para'], on: 'aq', sum: ['The library is popular because it is ?aq.', '图书馆受欢迎，因为它很____。'] }] },
      { f: 'WD', k: 'wd', subs: ['W-task', 'W-sent', 'W-link'], at: '学术类小作文', slots: { a: 'teenty', b: 'teenty', c: 'teenty' }, only: { a: ['40', '50'], b: ['30'] }, derive: { c: ['rest', 'a', 'b'] }, bind: [],
        table: { title: ['Where students study (200 students)', '学生在哪儿学习（200 人）'], rows: [['Library', '{a:digits}%'], ['Home', '{b:digits}%'], ['Café', '{c:digits}%']] },
        task: { kind: 'W', min: 150, max: 220,
          bullets: [{ en: 'Say what the table shows.', zh: '说这张表讲的是什么', keys: ['students', 'study', 'survey'] }, { en: 'Say the biggest and the smallest numbers.', zh: '说最多和最少的', keys: ['library', 'café', 'cafe', 'most', 'only'] },
            { en: 'Compare the places.', zh: '比较几个地方', keys: ['more', 'than', 'but', 'while'] }] },
        q: { en: 'The table shows where students study.', zh: '下表是学生学习地点的调查结果。' } }
    ]
  });
  scene({
    id: 'acad-seminar', v: 1, zh: '小组讨论：网课还是面授', place: 'acad', tier: 2, ch: 9, needs: ['week:9'], roles: { A: 'clarke', B: 'ben' }, ielts: ['L3'], gloss: { presentation: '课堂展示' },
    frames: [
      { f: 'LC', k: 'lc', subs: ['L-detail', 'R-para'], at: '研讨课', slots: {}, bind: [],
        alt: [
          [['A', 'So, Ben, do you like online classes or classes in a room?', 'Ben，你喜欢网课，还是在教室上课？'], ['B', 'Online classes are cheaper, but I learn more in a classroom.', '网课便宜些，但我在教室学得更多。'],
            ['A', 'Why is that?', '为什么？'], ['B', 'I can ask the teacher questions at once.', '我可以马上问老师问题。']]],
        q: { en: 'Why does Ben like classes in a room?', zh: 'Ben 为什么喜欢在教室上课？' },
        opts: ['=He can ask questions at once.|他能马上提问。', '=They are cheaper.|更便宜。', '=He can stay at home.|他可以待在家里。'] },
      { f: 'LC', k: 'lc-d', subs: ['L-date', 'L-turn'], at: '研讨课', slots: { d: 'weekday' }, only: { d: WEEKDAYS5 }, bind: ['d'],
        alt: [
          [['A', 'Your group presentation is on {d}, not {d~}.', '你们小组的展示在{d.zh}，不是{d~.zh}。'], ['B', 'OK. How long is it?', '好的。要多长时间？'], ['A', 'Ten minutes for each group.', '每组十分钟。']],
          [['B', 'Is our presentation on {d~}?', '我们的展示在{d~.zh}吗？'], ['A', 'No, it\'s on {d}. Please be ready.', '不是，在{d.zh}。请准备好。']]],
        q: { en: 'When is the presentation?', zh: '展示在哪天？' }, opts: ['{d}', '{d~}', '{d~}'] }
    ]
  });
  scene({
    id: 'acad-article', v: 1, zh: '学术短文：公园里的图书馆', place: 'acad', tier: 2, ch: 7, needs: ['week:7'], roles: {}, ielts: ['RA'], gloss: {},
    frames: [
      { f: 'RM', k: 'rm', subs: ['R-match', 'R-para'], at: '学术短文', slots: { loc: 'loc', t1: 'time', t2: 'time' }, only: { t1: ['09:00o', '10:00o'], t2: ['17:00o', '18:00o'] }, bind: ['loc'],
        text: { kind: 'article', title: ['A Library in the {loc:cap}', '{loc.zh}里的图书馆'],
          lines: [['A  Two years ago, Maple Bridge opened a small library in the {loc} near the city centre.', 'A  两年前，枫桥在市中心附近的{loc.zh}里开了一家小图书馆。'],
            ['B  The library is open from {t1:digits} to {t2:digits}, and it has books for children and adults.', 'B  图书馆{t1.zh}到{t2.zh}开放，有给孩子和大人的书。'],
            ['C  Now more families come at the weekend, and the library wants to open a small café next year.', 'C  现在周末来的家庭多了，图书馆明年想开一家小咖啡馆。']] },
        stmts: [{ en: 'plans for the future', zh: '以后的打算', ans: 'C' }, { en: 'when the library opened', zh: '图书馆什么时候开的', ans: 'A' }, { en: 'the opening hours', zh: '开放时间', ans: 'B' }],
        q: { en: 'Which paragraph mentions the following? Write A, B or C.', zh: '哪一段提到了下面的内容？选 A、B 或 C。' } },
      { f: 'RT', k: 'rt', subs: ['R-tfng', 'R-para'], at: '学术短文', slots: { loc: 'loc', t1: 'time', t2: 'time' }, only: { t1: ['09:00o', '10:00o'], t2: ['17:00o', '18:00o'] }, bind: ['loc'],
        text: { kind: 'article', title: ['A Library in the {loc:cap}', '{loc.zh}里的图书馆'],
          lines: [['Two years ago, Maple Bridge opened a small library in the {loc} near the city centre.', '两年前，枫桥在市中心附近的{loc.zh}里开了一家小图书馆。'],
            ['The library is open from {t1:digits} to {t2:digits}, and it has books for children and adults.', '图书馆{t1.zh}到{t2.zh}开放，有给孩子和大人的书。'],
            ['Now more families come at the weekend, and the library wants to open a small café next year.', '现在周末来的家庭多了，图书馆明年想开一家小咖啡馆。']] },
        items: [
          { f: 'RT', subs: ['R-tfng', 'R-para'], stmt: { en: 'The library is only for children.', zh: '这家图书馆只给孩子用。' }, truth: 'F' },
          { f: 'RT', subs: ['R-tfng', 'R-infer'], stmt: { en: 'The library has a café now.', zh: '图书馆现在有咖啡馆。' }, truth: 'F' },
          { f: 'RT', subs: ['R-tfng'], stmt: { en: 'The library is the biggest in the city.', zh: '这是全城最大的图书馆。' }, truth: 'NG' },
          { f: 'RG', subs: ['R-rule', 'R-detail'], on: 'loc', sum: ['The new library is in the ?loc near the city centre.', '这家新图书馆在市中心附近的____里。'] }] }
    ]
  });
  scene({
    id: 'acad-essay', v: 1, zh: '大作文：网上学习的利弊', place: 'acad', tier: 2, ch: 10, needs: ['week:10'], roles: { B: 'you' }, ielts: ['W2'], gloss: { discuss: '讨论', opinion: '观点', views: '看法' },
    frames: [
      { f: 'WM', k: 'wm', subs: ['W-task', 'W-link', 'W-length'], at: '大作文（Task 2）', slots: {}, bind: [], instr: ['Write at least 250 words.', '至少写 250 词'],
        task: { kind: 'W', min: 250, max: 320,
          bullets: [{ en: 'Say what is good about online learning.', zh: '说网上学习的好处', keys: ['cheap', 'home', 'time', 'easy'] },
            { en: 'Say what is bad about it.', zh: '说它的坏处', keys: ['but', 'however', 'teacher', 'questions'] },
            { en: 'Give your own opinion.', zh: '给出你自己的观点', keys: ['i think', 'in my opinion', 'i believe'] }] },
        q: { en: 'Some people think online learning is better than learning in a classroom. Discuss both views and give your own opinion.', zh: '有人认为网上学习比在教室学习好。讨论两种看法，并给出你自己的观点。' } },
      { f: 'WK', k: 'wk', subs: ['W-task'], at: '大作文（Task 2）', slots: {}, bind: [],
        task: { kind: 'W', bullets: [{ en: 'what is good about online learning', zh: '网上学习的好处', keys: ['cheap'] }, { en: 'what is bad about it', zh: '它的坏处', keys: ['but'] },
          { en: 'your own opinion', zh: '你自己的观点', keys: ['i think'] }] },
        msg: ['B', 'Online learning is cheap, and you can study at home. But it is hard to ask the teacher questions.', '网上学习便宜，而且可以在家学。但是很难问老师问题。'],
        q: { zh: '题目要写三个要点。这一段哪一点没写到？' }, opts: ['@2', '@0', '@1'] }
    ]
  });
  scene({
    id: 'acad-graph', v: 1, zh: '表格：图书馆一年的借书量', place: 'acad', tier: 2, ch: 7, needs: ['week:7'], roles: { B: 'you' }, ielts: ['W1'], gloss: { borrowed: '借出的' },
    frames: [
      { f: 'WD', k: 'wd', subs: ['W-task', 'W-sent', 'W-link'], at: '学术类小作文', slots: { a: 'teenty', b: 'teenty' }, only: { a: ['30', '40'], b: ['80', '90'] }, bind: [],
        table: { title: ['Books borrowed from the city library (hundreds)', '市图书馆每月借出的书（百本）'],
          rows: [['January', '{a:digits}'], ['March', '50'], ['May', '60'], ['July', '{b:digits}'], ['September', '70'], ['November', '50']] },
        task: { kind: 'W', min: 150, max: 220,
          bullets: [{ en: 'Say what the table shows.', zh: '说这张表讲的是什么', keys: ['books', 'library', 'month'] }, { en: 'Say when the number is highest and lowest.', zh: '说哪个月最多、哪个月最少', keys: ['july', 'january', 'most', 'highest', 'lowest'] },
            { en: 'Describe the change over the year.', zh: '描述一年里的变化', keys: ['rise', 'rises', 'fall', 'falls', 'go up', 'goes up', 'go down', 'goes down', 'then'] }] },
        q: { en: 'The table shows how many books people borrowed from the city library.', zh: '下表是市图书馆每月借出的书的数量。' } },
      { f: 'WK', k: 'wk', subs: ['W-task'], at: '学术类小作文', slots: {}, bind: [],
        task: { kind: 'W', bullets: [{ en: 'what the table shows', zh: '表讲的是什么', keys: ['table'] }, { en: 'the highest month', zh: '最多的月份', keys: ['july'] },
          { en: 'the change over the year', zh: '一年里的变化', keys: ['then'] }] },
        msg: ['B', 'The table shows how many books people borrowed from the library each month. The number is highest in July.', '这张表显示了图书馆每月借出的书的数量。七月最多。'],
        q: { zh: '题目要写三个要点。这一段哪一点没写到？' }, opts: ['@2', '@0', '@1'] }
    ]
  });

  /* ───────────────────────────── generic frames (§4.3: the teacher's own sentences as the shell) ───────────────────────────── */
  // scene id 'gen'; every learned word, sentence, pair and symbol can be asked in at least five ways
  var GEN_SCENE = { id: 'gen', v: 1, zh: '课本里的一句话', place: 'school', tier: 1, ch: 0, needs: [], roles: { A: 'lily', T: 'clarke', C: '@pool', D: '@pool' }, ielts: ['x'], gloss: {}, generic: true,
    frames: GENERIC };
  GENERIC.push(
    { f: 'VM', k: 'vm', subs: ['V-mean'], at: '课本', slots: { w: 'word', s: 'wsent' }, bind: ['w'], pairWith: 's',
      msg: ['A', '{s}', '{s.zh}'], q: { zh: 'Lily 在读你课本里的一句话。这里的"{w}"是什么意思？' }, cardQ: { zh: 'Lily 指着你单词本上的"{w}"问你。它是什么意思？' },
      opts: ['{w.zh}', '{w~.zh}', '{w~.zh}'], optZh: true },
    { f: 'VS', k: 'vs', subs: ['V-spell'], at: '单词本', slots: { w: 'word', s: 'wsent' }, bind: ['w'], pairWith: 's',
      alt: [[['A', '{s:blank}', '{s.zh}']], [['C', '{s:blank}', '{s.zh}']]], msgFromAlt: true, q: { zh: '单词本上有一个词只剩音标。听一听，把它拼出来。' }, say: [['A', '{w}', '{w.zh}']] },
    { f: 'VG', k: 'vg', subs: ['V-spell'], at: '手机消息', slots: { w: 'word', s: 'wsent' }, bind: ['w'], pairWith: 's', sent: true,
      alt: [[['A', '{s:blank}', '{s.zh}']], [['C', '{s:blank}', '{s.zh}']]], msgFromAlt: true, q: { zh: '有人发来课本里的一句话，有一个词没打出来。听一听，把它写上。' }, say: [['A', '{w}', '{w.zh}']] },
    { f: 'LF', k: 'lf', subs: ['L-spell', 'V-spell'], at: '课堂笔记', slots: { w: 'word', s: 'wsent' }, bind: ['w'], pairWith: 's', limit: { words: 1, num: true },
      alt: [[['T', '{s}', '{s.zh}']], [['C', '{s}', '{s.zh}']]], notes: { title: ['My notes', '我的笔记'], rows: [['Example', '例句', '{s:blank}']] }, q: { zh: '有人读了一句课文。把笔记里缺的词补上。' },
      cardQ: { zh: '有人念了一个生词。把它写进笔记里。' }, cardNotes: { title: ['My notes', '我的笔记'], rows: [['New word', '生词', '{s:blank}']] } },
    { f: 'LC', k: 'lc', subs: ['L-detail'], at: '课堂', slots: { w: 'word', s: 'wsent' }, bind: ['w'], pairWith: 's',
      say: [['T', '{s}', '{s.zh}']], q: { en: 'Which word do you hear?', zh: 'Ms Clarke 读了一句课文。你听到的是哪个词？' }, cardQ: { zh: 'Ms Clarke 念了一个词。你听到的是哪个？' }, opts: ['{w}', '{w~}', '{w~}'] },
    { f: 'LD', k: 'ld', subs: ['L-dict'], at: '同学读课文', slots: { s: 'dsent' }, bind: ['s'],
      alt: [[['A', '{s}', '{s.zh}']], [['C', '{s}', '{s.zh}']], [['T', '{s}', '{s.zh}']], [['D', '{s}', '{s.zh}']]], q: { zh: '有人在读课文里的一句话。把它听写下来。' } },
    { f: 'WT', k: 'wt', subs: ['W-sent'], at: '手机消息', slots: { s: 'xsent' }, bind: ['s'],
      alt: [[['C', 'How do you say this in English? 🤔', '这句用英文怎么说？🤔']], [['C', 'Can you write this in English for me, please? 🙏', '你能帮我用英文写这句吗？🙏']],
        [['C', 'What\'s this in English? 😊', '这句英文是什么？😊']]], msgFromAlt: true, q: { zh: '用英文回 {C}：{s.zh}' } },
    { f: 'GR', k: 'gr', subs: ['G-svo', 'W-sent'], at: '单词卡片', slots: { s: 'xsent' }, bind: ['s'],
      q: { zh: '把这些词排成一句话：{s.zh}' } },
    { f: 'LP', k: 'lp', subs: [], at: '听辨', slots: { p: 'pair' }, bind: ['p'],
      alt: [[['A', '{p}', '{p.zh}']], [['C', '{p}', '{p.zh}']], [['D', '{p}', '{p.zh}']]], q: { zh: '有人说了一个词。说的是哪个？' }, opts: ['{p}', '{p~}'], optZh: true },
    { f: 'LP', k: 'lp-s', subs: [], at: '听辨', slots: { p: 'pair' }, bind: ['p'], lv: 2, sentOf: 'p',
      alt: [[['A', '{p:sent}', '{p:sent.zh}']], [['C', '{p:sent}', '{p:sent.zh}']], [['D', '{p:sent}', '{p:sent.zh}']]], q: { zh: '有人说了一句话。你听到的是哪个词？' },
      wordQ: { zh: '有人说了一个词。说的是哪个？' }, opts: ['{p}', '{p~}'], optZh: true },
    { f: 'PS', k: 'ps', subs: [], at: '音标卡', slots: { y: 'sym' }, bind: ['y'],
      q: { zh: '哪个词里有 {y} 这个音？' }, opts: ['{y:ex}', '{y~:ex}', '{y~:ex}'], optZh: true },
    { f: 'SR', k: 'sr', subs: ['S-intel'], at: '读给手机听', slots: { s: 'dsent' }, bind: ['s'],
      alt: [[['A', '{s}', '{s.zh}']], [['C', '{s}', '{s.zh}']], [['T', '{s}', '{s.zh}']]], q: { zh: '先听一遍，再把这句话大声读给手机听：{s}' } }
  );
  /* ───────────────────────────── collocation frames (§4.3: VC, by collocation type) ───────────────────────────── */
  var COLL_SCENE = { id: 'coll', v: 1, zh: '搭配', place: 'social', tier: 1, ch: 0, needs: [], roles: { A: 'lily', C: '@pool' }, ielts: ['x'], gloss: {}, generic: true, frames: COLL_FRAMES };
  COLL_FRAMES.push(
    { f: 'VC', k: 'vc-pay', subs: ['V-coll'], at: '收银台', slots: { c: 'coll' }, bind: ['c'], ctype: 'pay', msgFromAlt: true,
      alt: [[['C', 'Would you like to {c:blank}?', '你想{c.zh}吗？']], [['C', 'Would you like to pay {c:blank}?', '你想{c.zh}付钱吗？']]], altFit: ['^pay:pay (by|in|with) ', '^pay:(by|in|with) '],
      q: { zh: '选一个词，让这个搭配说得对' }, collOpts: ['by', 'in', 'at'] },
    { f: 'VC', k: 'vc-day', subs: ['V-coll', 'G-prep'], at: '手机消息', slots: { c: 'coll' }, bind: ['c'], ctype: 'time', msg: ['A', 'See you {c:blank}! 👋', '{c.zh}见！👋'],
      q: { zh: '选一个词，让这个时间说得对' }, collOpts: ['on', 'in', 'at'] },
    { f: 'VC', k: 'vc-plan', subs: ['V-coll', 'G-prep'], at: '手机消息', slots: { c: 'coll' }, bind: ['c'], ctype: 'time', msg: ['C', 'I\'m free {c:blank}. Tea? ☕', '我{c.zh}有空。喝茶吗？☕'],
      q: { zh: '选一个词，让这个时间说得对' }, collOpts: ['on', 'in', 'at'] },
    { f: 'VC', k: 'vc-fromto', subs: ['V-coll'], at: '手机消息', slots: { c: 'coll' }, bind: ['c'], ctype: 'fromto', msg: ['A', 'I work from Monday ___ Friday. 💼', '我周一到周五上班。💼'],
      q: { zh: '选一个词，把这个搭配补完整' }, collOpts: ['to', 'and', 'in'] },
    { f: 'VC', k: 'vc-verb', subs: ['V-coll'], at: '手机消息', slots: { c: 'coll' }, bind: ['c'], ctype: 'verb', msgFromAlt: true,
      alt: [[['A', 'On Sunday, I {c:blank}. 🙂', '周日我{c.zh}。🙂']], [['A', 'On Sunday, we {c:blank}. 🙂', '周日我们{c.zh}。🙂']],
        [['C', 'We {c:blank} on Saturday! Come and see. 🛍', '我们周六打折！快来看看。🛍']], [['A', 'Please {c:blank} Ben. He\'s new here. 🙂', '请对 Ben 好一点，他是新来的。🙂']],
        [['A', 'Let\'s {c:blank} Ben on Sunday. 🙂', '我们周日和 Ben 一起吃午饭吧。🙂']], [['A', 'I want to {c:blank} the job. 🙂', '我想申请这份工作。🙂']],
        [['A', 'On Sunday, I {c:blank} early. 🙂', '周日我很早就{c.zh}。🙂']]],
      altFit: ['^verb:(?!be |go to bed$)(?!.*(…|together|discount|\\b(with|to|for|of)$))', 'together$', 'discount$', '^verb:be kind to$', '^verb:have lunch with$', '^verb:apply for$', '^verb:go to bed$'],
      q: { zh: '选一个词，把这个搭配补完整' }, collOpts: ['@verb'] },
    { f: 'VC', k: 'vc-qty', subs: ['V-coll'], at: '市场的小黑板', slots: { c: 'coll' }, bind: ['c'], ctype: 'qty', msgFromAlt: true, capMsg: true,
      alt: [[['C', '{c:blank} apples: £2', '{c.zh}苹果：2 英镑']], [['C', '{c:blank} bananas: £1.50', '{c.zh}香蕉：1.50 英镑']]], altFit: ['kilo', 'bunch'],
      q: { zh: '选一个词，把这个搭配补完整' }, collOpts: ['kilo', 'bunch', 'cup'], glossAdd: { apples: '苹果' } },
    { f: 'VG', k: 'vg-coll', subs: ['V-coll', 'V-spell'], at: '手机消息', slots: { c: 'coll' }, bind: ['c'], ctypes: ['pay', 'time', 'fromto', 'qty', 'verb', 'prep', 'rate'], capMsg: true,
      // a phrase that cannot stand alone as a reply ("A kilo of?", "Be kind to?") gets a sentence of its own ({c:key} = the gap)
      alt: [[['A', '{c:gap}. 🙂', '{c.zh}。🙂']], [['C', '{c:gap}! 😊', '{c.zh}！😊']], [['C', '{c:gap}? 🤔', '{c.zh}？🤔']],
        [['A', 'I work from Monday {c:key} Friday. 💼', '我周一到周五上班。💼']], [['C', 'A {c:key} of apples, please. 🍎', '请给我一公斤苹果。🍎']],
        [['C', 'A {c:key} of bananas, please. 🍌', '请给我一串香蕉。🍌']], [['A', 'Please {c:key} kind to Ben. He\'s new here. 🙂', '请对 Ben 好一点，他是新来的。🙂']],
        [['A', 'Let\'s {c:key} lunch with Ben on Sunday. 🙂', '我们周日和 Ben 一起吃午饭吧。🙂']], [['A', 'I want to {c:key} for the job. 🙂', '我想申请这份工作。🙂']],
        [['C', 'We {c:key} a discount on Saturday! Come and see. 🛍', '我们周六打折！快来看看。🛍']], [['A', 'The rent is £500 a {c:key}. 🏠', '房租每月 500 英镑。🏠']]],
      altFit: ['^(?!.*(…|discount|rate:))(?!.*\\b(of|to|with|for)$)', '^(?!.*(…|discount|rate:))(?!.*\\b(of|to|with|for)$)', '^(?!.*(…|discount|rate:|\\bmy\\b))(?!.*\\b(of|to|with|for)$)',
        '^fromto:', '^qty:a kilo of$', '^qty:a bunch of$', '^verb:be kind to$', '^verb:have lunch with$', '^verb:apply for$', '^verb:have a discount$', '^rate:a month$'],
      msgFromAlt: true, q: { zh: '搭配里缺了一个词。把它写上（中文：{c.zh}）' }, say: [['A', '{c}', '{c.zh}']] },
    { f: 'WT', k: 'wt-coll', subs: ['V-coll', 'W-sent'], at: '手机消息', slots: { c: 'coll' }, bind: ['c'], free: true,
      alt: [[['C', 'Tell me about your week! 😊', '说说你这一周吧！😊']], [['C', 'What do you do at the weekend? 🙂', '你周末做什么？🙂']], [['A', 'How\'s your week going? 🌙', '你这周过得怎么样？🌙']],
        [['C', 'What do you usually do on Sunday? ☕', '你周日通常做什么？☕']], [['A', 'Are you busy this week? 📅', '你这周忙吗？📅']],
        [['C', 'What do you need from the market? 🛒', '你要在市场买点什么？🛒']], [['C', 'Tell me about you! 😊', '说说你自己吧！😊']]],
      // the message and the phrase belong together: no "use 'a kilo of'" to answer "Are you busy this week?"
      altFit: ['^(time|verb|prep|pattern|fromto|rate):(?!.*\\b(january|february|march|april|may|june|july|august|september|october|november|december)\\b)', '^verb:(?!be |.*discount)', '^(time|verb|prep):(?!be |.*discount)(?!.*\\b(january|february|march|april|may|june|july|august|september|october|november|december)\\b)', '^verb:(?!be |.*discount)',
        '^(time|verb|prep):(?!be |.*discount)(?!.*\\b(january|february|march|april|may|june|july|august|september|october|november|december)\\b)', '^(qty|pay):|discount', '^(pattern|fromto|rate):|^verb:be |\\b(january|february|march|april|may|june|july|august|september|october|november|december)\\b'],
      msgFromAlt: true, q: { zh: '用"{c}"（{c.zh}）写一句英文回复' } }
  );

  /* ───────────────────────────── item → sub-skills, concepts, contrasts (§3.2) ───────────────────────────── */
  var TOPIC_SUB = { 'w1d1:a2': 'V-cal', 'w1d2:a2': 'V-num', 'w1d3:a2': 'V-family', 'w1d4:a2': 'V-home', 'w1d5:a2': 'V-routine', 'w1d6:a2': 'V-work' };
  var MONO = { 'iː': 1, 'ɪ': 1, 'e': 1, 'æ': 1, 'ɑː': 1, 'ʌ': 1, 'ɒ': 1, 'ɔː': 1, 'ʊ': 1, 'uː': 1, 'ɜː': 1, 'ə': 1 };
  var DIPH = { 'eɪ': 1, 'aɪ': 1, 'ɔɪ': 1, 'aʊ': 1, 'əʊ': 1, 'ɪə': 1, 'eə': 1, 'ʊə': 1, 'oʊ': 1 };
  var BE_FORMS = { am: 1, is: 1, are: 1, was: 1, were: 1 };
  var TIME_PREP = /\b(on|in|at)\s+(the\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|weekend|morning|evening|afternoon|night|seven|six|eight|nine|ten|eleven|twelve|one|two|three|four|five|\d)/i;
  function topicSub(sk, index) {
    if (TOPIC_SUB[sk]) return TOPIC_SUB[sk];
    var si = index && index.steps && index.steps.get(sk), mm = Model();
    var t = si ? (mm ? mm.topicOf(si.title) : si.title) : sk, id = 'V-t' + (mm ? mm.h6(t) : t);
    if (si) GEN_ZH[id] = t + '的词';
    return id;
  }
  function words(s) { return String(s || '').toLowerCase().replace(/[’]/g, '\'').split(/[^a-z']+/).filter(Boolean); }
  function hasNumberWord(s) { return words(s).some(function (w) { return /^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand)$/.test(w); }); }
  function hasDateWord(s) { return words(s).some(function (w) { return MONTHS.indexOf(w) >= 0 || /^(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|[a-z]+teenth|[a-z]+tieth)$/.test(w); }); }
  // tags from a reference sentence (write items): the forms the sentence practises (§10.3 WT)
  function writeTags(ref) {
    var t = ['W-sent'], ws = words(ref);
    if (ws.some(function (w) { return BE_FORMS[w]; })) t.push('G-be');
    if (ws.some(function (w) { return w === 'does' || w === 'do' || w === 'doesn\'t' || w === 'don\'t'; })) t.push('G-do');
    if (/^(he|she|it|[a-z]+)\s+[a-z]+s\b/i.test(String(ref)) && /\b(he|she|it|my \w+|lily|tom|mia|sam|anna|ben)\s+(works|lives|likes|cooks|goes|has|watches|drinks|starts|opens|costs|wants|walks|gets|studies|drives|takes|reads|sleeps|relaxes|exercises|cleans|pays|calls)\b/i.test(ref)) t.push('G-3sg');
    if (/\b(a|an|the)\b/i.test(ref)) t.push('G-article');
    if (TIME_PREP.test(ref)) t.push('G-prep');
    return t;
  }
  var QUIZ_KEYS = [[/第三人称|加 -s|三单/, 'G-3sg'], [/\bam\b.*\bis\b.*\bare\b|am \/ is \/ are|be 动词/, 'G-be'], [/复数|不可数/, 'G-plural'], [/a \/ an \/ the|冠词|\ban\b.*\bthe\b/, 'G-article'],
    [/词性/, 'G-pos'], [/主语|谓语|宾语/, 'G-svo'], [/句型/, 'G-pattern'], [/does|doesn't|do /i, 'G-do']];
  function packTag(item, index) {
    // a course pack may write the sub-skill (and concept) as the 7th element of a quiz question (§4.9, HE8)
    var si = index && index.steps && index.steps.get(item.home);
    if (!si || !si.st) return null;
    var list = item.kind === 'quiz' ? si.st.quiz : si.st.passage && si.st.passage.quiz;
    var q = Array.isArray(list) ? list[item.qi] : null;
    var v = q && typeof q[6] === 'string' ? q[6] : null;
    if (!v) return null;
    var p = v.split(':');
    return SKILLS[p[0]] || /^G-t|^R-/.test(p[0]) ? [p[0], p[1] || null] : null;
  }
  function quizTag(item, index) {
    if (W1_QUIZ_TAGS[item.id]) return W1_QUIZ_TAGS[item.id];
    var pt = packTag(item, index);
    if (pt) return pt;
    var stem = String(item.en || ''), opts = (item.content && item.content.opts) || [];
    if (item.kind === 'read') {
      if (/^\s*(how many|how much|what time|how long)\b/i.test(stem)) return ['R-number', null];
      return ['R-detail', /\bNOT\b/.test(stem) ? 'not' : null];
    }
    var all = stem + ' ' + opts.join(' / ');
    if (opts.length && opts.every(function (o) { return BE_FORMS[String(o).toLowerCase()]; })) return ['G-be', null];
    for (var i = 0; i < QUIZ_KEYS.length; i++) if (QUIZ_KEYS[i][0].test(all)) return [QUIZ_KEYS[i][1], null];
    var si = index && index.steps && index.steps.get(item.home), mm = Model(), ti = si ? si.title : item.home, id = 'G-t' + (mm ? mm.h6(ti) : ti);
    if (si) GEN_ZH[id] = mm ? mm.topicOf(ti) : ti;
    return [id, null];
  }
  /**
   * tagsOf(item, index, opts?) → sub-skill ids, the item's own facet first (§3.2).
   * opts.answers: only the sub-skills a course first answer about this item feeds (§3.4): a flash-card or lesson answer
   * about a word is evidence of knowing and spelling it (topic, V-spell), not of hearing a date;
   * those facets are fed by exam items that really test them.
   */
  // an item's sub-skills depend on the item and the course index only: kept per index (state() asks for thousands)
  var TAGS_CACHE = typeof WeakMap === 'function' ? new WeakMap() : null;
  function tagsOf(item, index, opts) { var t = tagsShared(item, index, opts); return t.slice(); }
  // the cached list itself, for callers that only read it (the scheduler's hot loops at 17 weeks)
  function tagsShared(item, index, opts) {
    if (!item) return [];
    var ans = !!(opts && opts.answers), m = null, key = null;
    if (TAGS_CACHE && index && typeof index === 'object' && item.id) {
      m = TAGS_CACHE.get(index);
      if (!m) { m = {}; TAGS_CACHE.set(index, m); }
      key = (ans ? '1' : '0') + item.id;
      if (own.call(m, key)) return m[key];
      return (m[key] = tagsOfRaw(item, index, ans));
    }
    return tagsOfRaw(item, index, ans);
  }
  function tagsOfRaw(item, index, ans) {
    var k = item.kind, t = [];
    if (k === 'word') {
      var w = String(item.en || '').toLowerCase();
      t.push(topicSub(item.home, index), 'V-spell');
      if (ans) return t;
      if (NUM_WORDS[w] != null) t.push('L-num');
      if (MONEY_WORDS[w]) t.push('L-price');
      if (TIME_WORDS[w]) t.push('L-time');
      if (ORD_WORDS[w] || CAL_WORDS[w]) t.push('L-date');
      return t;
    }
    if (k === 'sym') { var ipa = item.ipa || String(item.id).slice(2); return [MONO[ipa] ? 'P-sym-v' : DIPH[ipa] ? 'P-sym-d' : 'P-sym-c']; }
    if (k === 'pair') return [contrastOf(item.pair || String(item.id).slice(2).split('|'), pairPackTag(item, index))];
    if (k === 'quiz' || k === 'read') return [quizTag(item, index)[0]];
    if (k === 'dict') {
      t.push('L-dict');
      if (hasNumberWord(item.ref || item.en)) t.push('L-num');
      if (hasDateWord(item.ref || item.en)) t.push('L-date');
      return t;
    }
    if (k === 'write') return writeTags(item.ref || item.en);
    if (k === 'speak') return ans ? ['S-ext'] : ['S-ext', 'S-phr'];
    if (k === 'coll') return ['V-coll'];
    return [];
  }
  function conceptOf(item, index) {
    if (!item || (item.kind !== 'quiz' && item.kind !== 'read')) return null;
    var t = quizTag(item, index);
    return t && t[1] ? t[1] : null;
  }
  function pairPackTag(item, index) {
    var si = index && index.steps && index.steps.get(item.home);
    var pairs = si && si.st && si.st.pairs;
    if (!Array.isArray(pairs)) return null;
    for (var i = 0; i < pairs.length; i++) {
      var p = pairs[i];
      if (!Array.isArray(p)) continue;
      var ab = [String(p[0]), String(p[1])].sort();
      if ('p:' + ab[0] + '|' + ab[1] === item.id && typeof p[4] === 'string' && SKILLS[p[4]]) return p[4];
    }
    return null;
  }
  /**
   * contrastOf(pair, packTag?) → the sound-contrast sub-skill of a word pair (§3.2): the week-1 table → the pack's 5th
   * element → spelling rules (pure; tested).
   */
  function contrastOf(pair, pack) {
    var ab = [String(pair[0] || ''), String(pair[1] || '')].sort(), key = ab[0] + '|' + ab[1];
    if (own.call(W1_PAIR_TAGS, key)) return W1_PAIR_TAGS[key];
    if (pack && SKILLS[pack]) return pack;
    var a = ab[0].toLowerCase(), b = ab[1].toLowerCase();
    function teen(x) { return /teen$/.test(x); }
    function ty(x) { return /ty$/.test(x) && x.length > 4; }
    if ((teen(a) && ty(b)) || (teen(b) && ty(a))) return 'L-num';
    var ia = onset(a), ib = onset(b);
    if ((ia === 'th') !== (ib === 'th') && /^(s|t|d|f|th)$/.test(ia) && /^(s|t|d|f|th)$/.test(ib) && a.slice(ia.length) === b.slice(ib.length)) return 'P-th';
    if ((/ng$/.test(a) && b + 'g' === a) || (/ng$/.test(b) && a + 'g' === b)) return 'P-ng';
    var pre = 0;
    while (pre < a.length && pre < b.length && a.charAt(pre) === b.charAt(pre)) pre++;
    var ra = a.slice(pre), rb = b.slice(pre);
    if (pre > 0 && ra && rb && /^[bcdfghjklmnpqrstvwxz]+$/.test(ra) && /^[bcdfghjklmnpqrstvwxz]+$/.test(rb) && /[aeiou]/.test(a.slice(0, pre))) return 'P-end';
    var rest = a.slice(ia.length) === b.slice(ib.length);
    if (rest && /^(r|l|n)$/.test(ia) && /^(r|l|n)$/.test(ib)) return 'P-rl';
    if (rest && /^(w|v)$/.test(ia) && /^(w|v)$/.test(ib)) return 'P-wv';
    if (rest && /^(s|sh|ch)$/.test(ia) && /^(s|sh|ch)$/.test(ib)) return 'P-sh';
    var VO = { p: 'b', b: 'p', t: 'd', d: 't', k: 'g', g: 'k', c: 'g', f: 'v', v: 'f', s: 'z', z: 's', ch: 'j', j: 'ch' };
    if (rest && VO[ia] === ib) return 'P-voice';
    if (a.replace(/[aeiouy]+/g, '_') === b.replace(/[aeiouy]+/g, '_')) return 'P-misc';
    return 'P-misc';
  }
  function onset(w) { var m = /^(th|sh|ch|[^aeiouy]?)/.exec(w); return m ? m[1] : ''; }

  /* ───────────────────────────── collocation items c: (§3.2) ───────────────────────────── */
  // pay (by / in / with) · time (on / in / at + a time) · fromto · qty (a kilo of) · verb (a verb + its words) · prep (after work)
  // · pattern (a sentence frame like "I like … best.": written with, never a gap to fill)
  var VERB_START = /^(pay|go|call|have|get|sleep|relax|apply|look|take|walk|meet|cook|clean|study|work|live|do|make|be)\b/;
  function collType(en) {
    var s = String(en).toLowerCase();
    if (/^pay\b|^pays\b|^(in cash|by card|by cash)$/.test(s)) return 'pay';
    if (/^from\b.*\bto\b/.test(s) || /from … to/.test(s)) return 'fromto';
    if (/^a (kilo|bunch|cup|lot) of\b/.test(s)) return 'qty';
    if (/^(on|in|at)\s+(the\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|weekend|morning|evening|afternoon|seven|six|eight|nine|ten)/.test(s)) return 'time';
    if (/…/.test(s) || /^(i|it|we|you|he|she|they|there|but|on saturday)\b/.test(s)) return 'pattern';
    if (VERB_START.test(s)) return 'verb';
    if (/^(after|before|with|near|next)\b/.test(s)) return 'prep';
    return 'pattern';
  }
  function collWords(en) { return String(en).replace(/…/g, ' ').split(/\s+/).filter(function (w) { return /[A-Za-z]/.test(w); }); }
  var PHRASE_CACHE = { index: null, list: null };
  /** phrases(index) → collocation items: reading gloss phrases ∪ speaking phrases ≤ 4 words ∪ W1_COLL (§3.2) */
  function phrases(index) {
    if (!index || !index.steps) return [];
    if (PHRASE_CACHE.index === index) return PHRASE_CACHE.list;
    var mm = Model(), out = [], seen = {};
    var steps = [];
    index.steps.forEach(function (si) { steps.push(si); });
    steps.sort(function (a, b) { return a.order - b.order; });
    function add(en, zh, home, type) {
      en = String(en || '').trim().replace(/[.!?]+$/, '');
      if (!en) return;
      var id = 'c:' + (mm ? mm.h6(en.toLowerCase()) : en.toLowerCase());
      if (seen[id]) return;
      seen[id] = 1;
      out.push({ id: id, kind: 'coll', cls: 'know', en: en, zh: String(zh || ''), home: home, steps: [home], type: type || collType(en), content: { en: en, zh: String(zh || ''), say: en.replace(/…/g, '') } });
    }
    var byHome = {};
    W1_COLL.forEach(function (c) { (byHome[c.home] = byHome[c.home] || []).push(c); });
    steps.forEach(function (si) {
      var st = si.st || {};
      if (si.type === 'reading' && st.passage && Array.isArray(st.passage.gloss)) {
        st.passage.gloss.forEach(function (g) { if (Array.isArray(g) && collWords(g[0]).length >= 2) add(g[0], g[1], si.sk); });
      }
      if (si.type === 'speak' && st.speak && Array.isArray(st.speak.phrases)) {
        st.speak.phrases.forEach(function (p) { if (Array.isArray(p) && collWords(p[0]).length <= 4 && collWords(p[0]).length >= 2) add(p[0], p[1], si.sk); });
      }
      (byHome[si.sk] || []).forEach(function (c) { add(c.en, c.zh, si.sk, c.type); });
    });
    PHRASE_CACHE = { index: index, list: out };
    return out;
  }

  /* ───────────────────────────── slot types, vocabulary (§4.4, §4.8) ───────────────────────────── */
  /** slotTypesOf(item, index) → the parameter types a target can be bound into */
  function slotTypesOf(item) {
    if (!item) return [];
    var k = item.kind;
    if (k === 'word') {
      var w = String(item.en || '').toLowerCase(), t = [];
      if (WEEKDAYS.indexOf(w) >= 0) t.push('weekday');
      if (MONTHS.indexOf(w) >= 0) t.push('month');
      if (w === 'quarter' || w === 'half') t.push('time');
      if (NUM_WORDS[w] != null && NUM_WORDS[w] < 100) t.push('teenty', 'price');
      if (w === 'pound') t.push('price');
      Object.keys(LISTS).forEach(function (lk) { if (lk !== 'opener' && lk !== 'cafeq' && LISTS[lk].some(function (x) { return x[0].toLowerCase() === w; })) t.push(lk); });
      t.push('word');
      return t;
    }
    if (k === 'pair') return ['pair'];
    if (k === 'sym') return ['sym'];
    if (k === 'dict') return ['dsent'];
    if (k === 'write') return ['xsent'];
    if (k === 'speak') return ['speakq'];
    if (k === 'coll') return ['coll'];
    return [];
  }
  // lower case, no punctuation, contractions whole; -s / -es / -ies / -ed / -ing reduced to a stem
  function norm(w) { return String(w || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’]/g, '\'').replace(/^[^a-z0-9']+|[^a-z0-9']+$/g, ''); }
  // contractions count as the words they stand for (§4.8: "I'm, don't, it's 当一个词")
  var CONTR = { "don't": ['do', 'not'], "doesn't": ['does', 'not'], "didn't": ['did', 'not'], "can't": ['can', 'not'], "isn't": ['is', 'not'], "aren't": ['are', 'not'],
    "won't": ['will', 'not'], "wasn't": ['was', 'not'], "i'm": ['i', 'am'], "let's": ['let', 'us'], "i've": ['i', 'have'], "i'll": ['i', 'will'], "you're": ['you', 'are'],
    "we're": ['we', 'are'], "they're": ['they', 'are'] };
  var STEMS_C = Object.create(null), STEMS_N = 0;      // the same few thousand words, asked again and again (count(), plans)
  function stems(w) {
    var c = STEMS_C[w];
    if (c) return c;
    if (++STEMS_N > 20000) { STEMS_C = Object.create(null); STEMS_N = 1; }
    return (STEMS_C[w] = stemsOf(w));
  }
  function stemsOf(w) {
    var s = [w];
    if (/'s$/.test(w)) s.push(w.slice(0, -2));
    if (/ies$/.test(w)) s.push(w.slice(0, -3) + 'y');
    if (/(s|x|ch|sh|z)es$/.test(w)) s.push(w.slice(0, -2));
    if (/s$/.test(w) && !/ss$/.test(w)) s.push(w.slice(0, -1));
    if (/ied$/.test(w)) s.push(w.slice(0, -3) + 'y');
    if (/ed$/.test(w)) { s.push(w.slice(0, -2), w.slice(0, -1)); if (/([bcdfgklmnprstvz])\1ed$/.test(w)) s.push(w.slice(0, -3)); }
    if (/ing$/.test(w)) { s.push(w.slice(0, -3), w.slice(0, -3) + 'e'); if (/([bcdfgklmnprstvz])\1ing$/.test(w)) s.push(w.slice(0, -4)); }
    if (/est$/.test(w)) s.push(w.slice(0, -3));
    if (/er$/.test(w)) s.push(w.slice(0, -2));
    return s;
  }
  var NUMBERY = /^(\d[\d.,:]*(st|nd|rd|th|am|pm)?|£\d.*|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth|[a-z]+teenth|[a-z]+tieth|oh|double)$/;
  function isNumberWord(w) { return NUMBERY.test(w) || /^(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-[a-z]+$/.test(w); }
  var NAME_SET = null;
  function nameSet() {
    if (NAME_SET) return NAME_SET;
    NAME_SET = {};
    NAMES.forEach(function (n) { NAME_SET[n.name.toLowerCase()] = 1; });
    Object.keys(CAST).forEach(function (k) { CAST[k].name.toLowerCase().split(' ').forEach(function (p) { NAME_SET[p] = 1; }); });
    PLACE_NAMES.forEach(function (p) { p.toLowerCase().split(' ').forEach(function (x) { if (x !== 'the') NAME_SET[x] = 1; }); });
    ['ben', 'lily', 'leo', 'tom', 'mia', 'sam', 'anna', 'helen', 'wood', 'clarke', 'you'].forEach(function (x) { NAME_SET[x] = 1; });
    return NAME_SET;
  }
  function stepTexts(si, index) {
    var st = si.st || {}, out = [];
    function push(x) { if (typeof x === 'string' && /[A-Za-z]/.test(x)) out.push(x.replace(/[\u3000-\u9fff\uff00-\uffef]+/g, ' ')); }
    (st.words || []).forEach(function (w) { if (Array.isArray(w)) push(w[0]); });
    (st.items || []).forEach(function (it) { if (Array.isArray(it)) { if (si.type === 'write') push(it[1]); else push(it[0]); } else if (si.type === 'symbols' && typeof it === 'string') { var s = index && index.items.get('s:' + it); if (s && s.content) (s.content.examples || []).forEach(function (e) { push(e.en); }); } });
    (st.pairs || []).forEach(function (p) { if (Array.isArray(p)) { push(p[0]); push(p[1]); } });
    (st.lesson || []).forEach(function (l) { if (Array.isArray(l) && l[0] === 'ex') push(l[1]); });
    (st.quiz || []).forEach(function (q) { if (Array.isArray(q)) { push(q[0]); (q[1] || []).forEach(push); } });
    if (st.passage) { push(st.passage.text); push(st.passage.title); (st.passage.quiz || []).forEach(function (q) { if (Array.isArray(q)) { push(q[0]); (q[1] || []).forEach(push); } }); (st.passage.gloss || []).forEach(function (g) { if (Array.isArray(g)) push(g[0]); }); }
    if (st.speak) { push(st.speak.q); push(st.speak.model); (st.speak.phrases || []).forEach(function (p) { if (Array.isArray(p)) push(p[0]); }); }
    return out;
  }
  var VOCAB_CACHE = { key: null, res: null };
  /**
   * vocab(index, learned, host, asOf?) → { known: Set (lower-case words and stems), items: Set (learned word items),
   * next: string[] (next week's topic words, preferred stretch words), isKnown(word) } (§4.8).
   * Known = the learned word items ∪ every English word of the steps she completed before asOf ∪ CORE_WORDS; numbers,
   * names and place names are always allowed.
   */
  function vocab(index, learned, host, asOf) {
    var cp = (host && host.profile && host.profile.cp) || {};
    var key = index ? JSON.stringify([asOf || null, Object.keys(cp).filter(function (k) { return !asOf || cp[k] < asOf; }).sort(), learned ? learned.size : 0]) : null;
    if (key && VOCAB_CACHE.index === index && VOCAB_CACHE.key === key) return VOCAB_CACHE.res;
    var known = new Set(), items = new Set();
    function addWord(w) { w = norm(w); if (!w) return; known.add(w); }
    CORE_WORDS.forEach(addWord);
    if (index) {
      index.steps.forEach(function (si, sk) {
        var c = cp[sk];
        if (typeof c !== 'string' || (asOf && c >= asOf)) return;
        stepTexts(si, index).forEach(function (t) { String(t).split(/[\s—–\/…,.;:!?()"“”]+/).forEach(function (w) { if (/[a-z]/i.test(w)) { addWord(w); if (/-/.test(w)) w.split('-').forEach(addWord); } }); });
      });
      if (learned) learned.forEach(function (L, id) {
        var it = index.items.get(id);
        if (it && it.kind === 'word') { items.add(it.en.toLowerCase()); it.en.toLowerCase().split(/\s+/).forEach(addWord); }
      });
    }
    var res = { known: known, items: items, next: [], isKnown: function (w) { return isKnown(known, w); } };
    if (key) VOCAB_CACHE = { index: index, key: key, res: res };
    return res;
  }
  function isKnown(known, w) {
    w = norm(w);
    if (!w) return true;
    if (isNumberWord(w) || nameSet()[w]) return true;
    if (known.has(w)) return true;
    var s = stems(w);
    for (var i = 1; i < s.length; i++) if (known.has(s[i])) return true;
    if (own.call(CONTR, w)) return CONTR[w].every(function (x) { return known.has(x); });
    if (/^[a-z]+'s$/.test(w)) return isKnown(known, w.slice(0, -2));
    if (/^[a-z]+'(re|ve|ll|d|m)$/.test(w)) return isKnown(known, w.split('\'')[0]);
    return false;
  }

  /* ───────────────────────────── frames (§4.4) ───────────────────────────── */
  var FRAME_CACHE = null;
  function allScenes() { return SCENES.concat([GEN_SCENE, COLL_SCENE]); }
  function sceneById(id) {
    if (id === 'gen') return GEN_SCENE;
    if (id === 'coll') return COLL_SCENE;
    for (var i = 0; i < SCENES.length; i++) if (SCENES[i].id === id) return SCENES[i];
    return null;
  }
  /** frames(fmt, filter?) → [{ scene, frame, k }] (every frame whose own format, or one of whose questions, is fmt) */
  function frames(fmt, filter) {
    if (!FRAME_CACHE) {
      FRAME_CACHE = {};
      allScenes().forEach(function (sc) {
        (sc.frames || []).forEach(function (fr) {
          var fs = {};
          fs[fr.f] = 1;
          (fr.items || []).forEach(function (q) { fs[q.f || fr.f] = 1; });
          Object.keys(fs).forEach(function (f) { (FRAME_CACHE[f] = FRAME_CACHE[f] || []).push({ scene: sc, frame: fr, k: fr.k }); });
        });
      });
    }
    var list = FRAME_CACHE[fmt] || [];
    return typeof filter === 'function' ? list.filter(filter) : list.slice();
  }
  function frameOf(sceneId, k) {
    var sc = sceneById(sceneId);
    if (!sc) return null;
    for (var i = 0; i < sc.frames.length; i++) if (sc.frames[i].k === k) return { scene: sc, frame: sc.frames[i] };
    return null;
  }

  /* ───────────────────────────── how many distinct items (§4.9) ───────────────────────────── */
  /**
   * count(index, learned, host, opts?) → { byKind, total, sigShare? }: for every learned target and every (format, frame,
   * wording) that can hold it, one item generated with a fixed seed and passed through validateItem counts once.
   * opts: { asOf, random: n (also render n random specs and report the share of distinct sigs), limitFrames }.
   */
  function count(index, learned, host, opts) {
    opts = opts || {};
    var G = (root && root.BaseEngine && root.BaseEngine.ExamGen) || null;
    if (!G && typeof require === 'function') { try { G = require('./gen.js'); } catch (e) { G = null; } }
    if (!G || !index) return { byKind: {}, total: 0 };
    return G.countItems(index, learned, host, opts);
  }

  return {
    V: V,
    FORMATS: FORMATS, IELTS_FMT: IELTS_FMT, SKILLS: SKILLS, GROUP_ZH: GROUP_ZH, PATTERNS: PATTERNS, patternOf: patternOf, skillZh: skillZh, patternCard: patternCard,
    SCENES: SCENES, GENERIC: GENERIC, COLL_FRAMES: COLL_FRAMES, GEN_SCENE: GEN_SCENE, COLL_SCENE: COLL_SCENE,
    CHAPTERS: CHAPTERS, chapterOf: chapterOf, CAST: CAST, NAMES: NAMES, YOU: YOU, PLACES: PLACES, PLACE_NAMES: PLACE_NAMES, TOPIC_PLACE: TOPIC_PLACE,
    CONFUSIONS: CONFUSIONS, PARA: PARA, CORE_WORDS: CORE_WORDS, PARAMS: PARAMS, LISTS: LISTS, PAIR_SENT: PAIR_SENT, SYM_US: SYM_US, EX_US: EX_US,
    WEEKDAYS: WEEKDAYS, MONTHS: MONTHS, WD_ZH: WD_ZH, MO_ZH: MO_ZH, CAL_WORDS: CAL_WORDS,
    W1_QUIZ_TAGS: W1_QUIZ_TAGS, W1_PAIR_TAGS: W1_PAIR_TAGS, W1_COLL: W1_COLL, TOPIC_SUB: TOPIC_SUB,
    tagsOf: tagsOf, tagsShared: tagsShared, conceptOf: conceptOf, contrastOf: contrastOf, phrases: phrases, slotTypesOf: slotTypesOf, writeTags: writeTags,
    vocab: vocab, isKnown: isKnown, stems: stems, isNumberWord: isNumberWord, nameSet: nameSet,
    frames: frames, frameOf: frameOf, sceneById: sceneById, allScenes: allScenes, count: count,
    util: { numWord: numWord, ordWord: ordWord, ordDigits: ordDigits, zhNum: zhNum, cap1: cap1, timeSay: timeSay, timeDigits: timeDigits, timeZh: timeZh,
      parseTime: parseTime, priceSay: priceSay, priceDigits: priceDigits, priceZh: priceZh, confuse: confuse, tokens: tokens, words: words }
  };
});
