/* INKWAVE · vendor/ielts/host.js — page functions of the lesson, copied VERBATIM out of IELTS-Base app/index.html (the
 * page's main script) by tools/learn/export-ielts.mjs. SOURCE.json has the commit and each function's line range; this
 * file is never edited by hand — re-run the export.
 * Why a copy: they are page functions, not a module, and the game must do these exactly as the lesson does — dictScore
 * scores a sentence (docs/DESIGN.md §7.13: percent and per-word marks are the host's, British = American, case never
 * matters); speechChunks cuts a text into the pieces app/audio/index.json has recordings of and CLIP_SILENT is the clip
 * that unlocks <audio> on her first tap (src/learn/audio.js); tzPlaceOf / tzParts read her wall clock (设置 → 时区) so a
 * game answer is dated on the same day as one in the lesson (src/learn/workbench.js); phasePlan / dailyHours and the
 * tables they read give 学习方法 the sentence its {{PLAN}} says (src/learn/guides.js).
 * UMD like the other files here: Node → module.exports; browser → BaseEngine.Host. `window` inside fdUs is the UMD root
 * (globalThis in Node), where model.js registers BaseEngine.Model. Source commit: 863cb6ff23a7d7e1a4f70af4a1c6bbc4da4f6b75. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) { var BE = root.BaseEngine = root.BaseEngine || {}; if (!BE.Host) BE.Host = api; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (root) {
  'use strict';
  var window = root;
  // ── app/index.html L2493 ──
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ── app/index.html L7386–7396 ──
  // ---------- 听写: checking (the patrol's rules, app/base/drill.js → BaseEngine.Model.spellCheck) ----------
  // Without model.js a small copy of the same rule: letters compared without case, British = American for the common patterns.
  function fdUs(w) {
    const M = window.BaseEngine && window.BaseEngine.Model;
    try { if (M && typeof M.usForm === 'function') return M.usForm(w); } catch (e) { /* fall through */ }
    // the model's patterns without its word table: -our / -or, -re / -er, -ise / -ize (not exercise, advise, surprise …)
    const t = String(w).toLowerCase();
    if (t.length <= 5) return t;
    const v = t.replace(/our(s|ite|ites|hood)?$/, 'or$1').replace(/([bcdfghklmnpqrstvwxz])re(s)?$/, '$1er$2');
    return /(?:exercis|advis|surpris|promis|premis|wis|ris|nois|pois|rais|prais|cruis|revis|supervis|televis|devis|comprom|enterpris|expertis|franchis|merchandis|chastis|despis|disguis|excis|incis|precis|concis)(?:e|es|ed|ing|ation|ations)$/.test(v) ? v : v.replace(/is(e|es|ed|ing|ation|ations)$/, 'iz$1');
  }

  // ── app/index.html L7909 ──
  function toks(s) { return String(s).split(/\s+/).filter(Boolean); }

  // ── app/index.html L7910–7912 ──
  // a word as written, compared: no case, no accents (café = cafe), any apostrophe (’ ‘ ʼ) as ', no other marks; an apostrophe at
  // either end is a quotation mark (‘Thank you,’ she said.), not part of the word
  function normTok(t) { return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘ʼ]/g, "'").replace(/[^a-z0-9']/g, '').replace(/^'+|'+$/g, ''); }

  // ── app/index.html L7913–7923 ──
  function lcsOk(ref, hyp) {
    const n = ref.length, m = hyp.length;
    const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
    for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = ref[i] === hyp[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    const ok = new Array(n).fill(false);
    let i = 0, j = 0;
    while (i < n && j < m) {
      if (ref[i] === hyp[j]) { ok[i] = true; i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
    }
    return ok;
  }

  // ── app/index.html L8600–8601 ──
  // Speech recognisers write numbers as digits ("3", "50", "6:30", "21st"): turn them into words before comparing.
  const NUM_1 = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');

  // ── app/index.html L8602 ──
  const NUM_10 = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  // ── app/index.html L8603 ──
  const NUM_ORD = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };

  // ── app/index.html L8604–8614 ──
  function numWords(t) {
    const m = /^(\d{1,4})(st|nd|rd|th)?$/.exec(t);
    if (!m) return [t];
    const n = Number(m[1]), w = [];
    const say = (x) => { if (x < 20) w.push(NUM_1[x]); else { w.push(NUM_10[Math.floor(x / 10)]); if (x % 10) w.push(NUM_1[x % 10]); } };
    if (n >= 1000) { say(Math.floor(n / 1000)); w.push('thousand'); }
    if (n % 1000 >= 100) { say(Math.floor(n % 1000 / 100)); w.push('hundred'); }
    if (n % 100 || !w.length) say(n % 100);
    if (m[2]) { const last = w.pop(); w.push(NUM_ORD[last] || (/y$/.test(last) ? last.slice(0, -1) + 'ieth' : last + 'th')); }
    return w;
  }

  // ── app/index.html L7924–7933 ──
  // The reference words matched in what she typed. A token of punctuation only (a dash, "…") is not a word: it is shown
  // but not scored (ok[j] is null), so a perfect answer scores 100%.
  // The words a written token stands for. A number written as digits is the number's words, the way the speech check reads
  // the recogniser's digits (13 → thirteen, 9:30 → nine thirty, 21st → twenty first; twenty-five is two words), and a British
  // spelling is the American one, as in the card dictation (colour = color): what she heard counts, however she wrote it down,
  // and a sentence scores the same here and in the exam (app/exam/gen.js turns her digits into words before dictScore).
  function dictWords(t) {
    return String(t).replace(/(\d)[:.](\d\d)(?!\d)/g, '$1 $2').replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-(?=[a-z])/gi, '$1 ')
      .split(/\s+/).map(normTok).filter(Boolean).reduce((a, x) => a.concat(/^\d+(st|nd|rd|th)?$/.test(x) ? numWords(x) : [fdUs(x)]), []);
  }

  // ── app/index.html L7934–7942 ──
  function tokMarks(ref, hyp) {
    const refT = toks(ref), at = [], refW = [];
    refT.forEach((t, j) => dictWords(t).forEach((w) => { at.push(j); refW.push(w); }));
    const okW = lcsOk(refW, toks(hyp).reduce((a, t) => a.concat(dictWords(t)), [])), ok = refT.map(() => null);
    at.forEach((j, k) => { ok[j] = ok[j] !== false && okW[k]; }); // a token is right when all its words are
    const marked = ok.filter((x) => x != null);
    const html = refT.map((t, j) => '<span class="tok' + (ok[j] == null ? '' : ok[j] ? ' ok' : ' miss') + '">' + esc(t) + '</span>').join(' ');
    return { n: marked.length, good: marked.filter(Boolean).length, html };
  }

  // ── app/index.html L7943–7947 ──
  // One typed sentence against the reference: words right, percent, and the marked-up reference.
  function dictScore(ref, hyp) {
    const m = tokMarks(ref, hyp);
    return { pct: Math.round(m.good / Math.max(1, m.n) * 100), good: m.good, n: m.n, html: m.html };
  }

  // ── app/index.html L5534–5568 ──
  // sentences (never split "1.5", "Mr.", "e.g."), long ones again at , ; : so no piece runs much past 170 characters
  function speechChunks(text) {
    const t = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
    if (!t) return [];
    const out = [], ABBR = /(^|\s)(mr|mrs|ms|dr|st|mt|vs|etc|e\.g|i\.e|no|a\.m|p\.m)\.$/i;
    let cur = '';
    for (let i = 0; i < t.length; i++) {
      const ch = t[i];
      cur += ch;
      if ('.!?…'.indexOf(ch) < 0) continue;
      while (i + 1 < t.length && /["'”’)\]]/.test(t[i + 1])) cur += t[++i];
      if (i + 1 >= t.length) break;
      if (t[i + 1] !== ' ') continue;
      if (ch === '.' && ABBR.test(cur)) continue;
      if (/[a-z]/.test(t[i + 2] || '')) continue;
      out.push(cur.trim());
      cur = '';
    }
    if (cur.trim()) out.push(cur.trim());
    const res = [];
    out.forEach((snt) => {
      if (snt.length <= 170) { res.push(snt); return; }
      const bits = snt.split(/([,;:])\s+/);
      let part = '';
      for (let k = 0; k < bits.length; k += 2) {
        const seg = bits[k] + (bits[k + 1] || '');
        if (part && (part + ' ' + seg).length > 170) { res.push(part); part = seg; } else part = part ? part + ' ' + seg : seg;
      }
      if (part) res.push(part);
    });
    // a piece with no commas at all that is still very long: at a space near 200 characters
    const fin = [];
    res.forEach((x) => { let r = x; while (r.length > 220) { const cut = r.lastIndexOf(' ', 200); if (cut < 60) break; fin.push(r.slice(0, cut)); r = r.slice(cut + 1); } fin.push(r); });
    return fin;
  }

  // ── app/index.html L5692 ──
  const CLIP_SILENT = 'data:audio/mpeg;base64,//M0xAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVV//M0xDsAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVV//M0xHYAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//M0xLEAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//M0xMQAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//M0xMQAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';

  // ── app/index.html L2506–2535 ──
  // ================= the clock (时区) =================
  // One wall clock for the whole workbench (WB.clock; docs/LIFE.md §4): the hour, the day and the weekday are read in her place's
  // zone — Singapore unless 设置 says another city or 「跟随这台设备」 — never in whichever zone this device happens to be. Instants
  // stay absolute (Date.now(), stored timestamps, sync versions); only their reading as a wall time changes. A wall Date (tzWall)
  // is a shifted Date whose local getters read the zone's clock: for words, days and hours only, never stored; tzInstant is its
  // inverse. TZ_PLACES: id, IANA zone, latitude, longitude, 中文, English (the sky stands in that city).
  const TZ_PLACES = [ // her cities (「方便全球到处旅行的时候切换」): Singapore first, then east Asia, Oceania, the Gulf, Europe, the Americas
    ['sin', 'Asia/Singapore', 1.3521, 103.8198, '新加坡', 'Singapore'],
    ['kul', 'Asia/Kuala_Lumpur', 3.139, 101.6869, '吉隆坡', 'Kuala Lumpur'],
    ['bkk', 'Asia/Bangkok', 13.7563, 100.5018, '曼谷', 'Bangkok'],
    ['jkt', 'Asia/Jakarta', -6.2088, 106.8456, '雅加达', 'Jakarta'],
    ['hkg', 'Asia/Hong_Kong', 22.3193, 114.1694, '香港', 'Hong Kong'],
    ['tpe', 'Asia/Taipei', 25.033, 121.5654, '台北', 'Taipei'],
    ['bjs', 'Asia/Shanghai', 39.9042, 116.4074, '北京/上海', 'Beijing'],
    ['sel', 'Asia/Seoul', 37.5665, 126.978, '首尔', 'Seoul'],
    ['tyo', 'Asia/Tokyo', 35.6762, 139.6503, '东京', 'Tokyo'],
    ['syd', 'Australia/Sydney', -33.8688, 151.2093, '悉尼', 'Sydney'],
    ['mel', 'Australia/Melbourne', -37.8136, 144.9631, '墨尔本', 'Melbourne'],
    ['akl', 'Pacific/Auckland', -36.8485, 174.7633, '奥克兰', 'Auckland'],
    ['dxb', 'Asia/Dubai', 25.2048, 55.2708, '迪拜', 'Dubai'],
    ['lon', 'Europe/London', 51.5074, -0.1278, '伦敦', 'London'],
    ['par', 'Europe/Paris', 48.8566, 2.3522, '巴黎', 'Paris'],
    ['ber', 'Europe/Berlin', 52.52, 13.405, '柏林', 'Berlin'],
    ['nyc', 'America/New_York', 40.7128, -74.006, '纽约', 'New York'],
    ['yto', 'America/Toronto', 43.6532, -79.3832, '多伦多', 'Toronto'],
    ['yvr', 'America/Vancouver', 49.2827, -123.1207, '温哥华', 'Vancouver'],
    ['lax', 'America/Los_Angeles', 34.0522, -118.2437, '洛杉矶', 'Los Angeles'],
    ['sfo', 'America/Los_Angeles', 37.7749, -122.4194, '旧金山', 'San Francisco'],
    ['hnl', 'Pacific/Honolulu', 21.3069, -157.8583, '檀香山', 'Honolulu'],
  ];

  // ── app/index.html L2536 ──
  const TZ_DEFAULT = 'sin', TZ_FMT = {};

  // ── app/index.html L2537–2540 ──
  function tzFmt(zone) {
    if (TZ_FMT[zone] === undefined) { try { TZ_FMT[zone] = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }); } catch (e) { TZ_FMT[zone] = null; } }
    return TZ_FMT[zone];
  }

  // ── app/index.html L2541 ──
  function tzDevice() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } }

  // ── app/index.html L2542–2550 ──
  // the wall-clock parts of an instant in a zone (null: this device's): { y, m: 1–12, d, h: 0–23, mi, s, ms, dow: 0 = Sunday }
  function tzParts(d, zone) {
    const f = zone ? tzFmt(zone) : null, o = { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds(), ms: d.getMilliseconds() };
    if (f) {
      try { f.formatToParts(d).forEach((p) => { const v = +p.value; if (p.type === 'year') o.y = v; else if (p.type === 'month') o.m = v; else if (p.type === 'day') o.d = v; else if (p.type === 'hour') o.h = v % 24; else if (p.type === 'minute') o.mi = v; else if (p.type === 'second') o.s = v; }); } catch (e) { /* the device's reading stands */ }
    }
    o.dow = new Date(Date.UTC(o.y, o.m - 1, o.d)).getUTCDay();
    return o;
  }

  // ── app/index.html L2566–2575 ──
  function tzPlaceOf(v) {
    const byZone = (z) => TZ_PLACES.find((p) => p[1] === z), device = v === 'device';
    let row = null, zone = '';
    if (device) { zone = tzDevice(); row = byZone(zone) || null; }
    else if (typeof v === 'string' && v.indexOf('/') > 0 && tzFmt(v)) { zone = v; row = byZone(v) || null; }
    else row = TZ_PLACES.find((p) => p[0] === v) || TZ_PLACES.find((p) => p[0] === TZ_DEFAULT);
    if (row && !zone) zone = row[1];
    // no listed city in that zone: the sky keeps its old latitude and takes the longitude from the zone's offset
    return { id: device ? 'device' : row ? row[0] : zone, zone, tz: device ? null : zone, lat: row ? row[2] : 31.2, lon: row ? row[3] : null, zh: row ? row[4] : '', en: row ? row[5] : '', device };
  }

  // ── app/index.html L1280 ──
  const BLOCK_DEFS = { a: { name: '上午' }, b: { name: '下午' }, c: { name: '傍晚', light: true } };

  // ── app/index.html L1282 ──
  const T = (id, t, m, k, how) => ({ id, t, m, k, how });

  // ── app/index.html L1299–1313 ──
  const MOCK_SAT = {
    note: '周六是全真模考日：在电脑上按考试顺序和时长来，结束后把成绩录进「模考记录」。晚上休息。',
    focus: { a: '模考：听力和阅读', b: '模考：写作和口语', c: '休息' },
    tasks: {
      a: [
        T('ma1', '全真模考：听力加阅读连考', 100, 'mock', '尽量在电脑上做，模拟机考。听力约 30 分钟，结束后留 2 分钟检查；紧接着做阅读 60 分钟。中间不休息，和正式考试一样。'),
      ],
      b: [
        T('mb1', '全真模考：写作 60 分钟', 60, 'mock', '在电脑上打字写。Task 1 和 Task 2 一起写，自己分配时间，建议 Task 1 用 20 分钟。'),
        T('mb2', '口语自测：完整录一套 Part 1–3', 20, 'speaking', '用当季题库，或者请 Claude 扮演考官（「学习方法」的口语页里有指令）。'),
        T('mb3', '对答案，录入「模考记录」', 30, 'review', '听力和阅读按答对题数录入，工作台会自动换算分数；写作和口语用自评分或 Claude 的估分。'),
      ],
      c: [],
    },
  };

  // ── app/index.html L1315–1471 ──
  const PHASES = [
    {
      name: '启动诊断', weeks: 1, fixed: true, todoLabel: '这一周要完成的事',
      goal: '认识 48 个音标，找回 150 个最常用的词，把每天的三个时段固定下来。这一周强度不大，重点是开个好头。',
      focus: { a: '了解考试，词汇起步', b: '音标、慢速听力、语法入门', c: '复习和打卡' },
      tasks: {
        a: [
          T('p0a1', '了解考试：读「考试概览」', 40, 'other', '打开「学习方法」里的「考试概览」，弄清四科的时长、题型和算分方式。再翻一套剑桥雅思真题，看看每科的题目长什么样，这周先不用做。'),
          T('p0a2', '背 30 个高频核心词', 60, 'vocab', '从高频词表开始（高考 3500 词或 Oxford 3000 都可以）。每个词：先听发音、跟读两遍，再看意思和一个例句。背完合上书自测一遍，想不起来的做个记号。'),
          T('p0a3', '复习前一天的单词', 20, 'vocab', '只看英文，回忆意思和读音，想不起来的放进明天优先复习。第一天没有旧词，就把今天的再过一遍。'),
        ],
        b: [
          T('p0b1', '学 6–8 个音标', 45, 'pron', '按「学习方法」里「发音」一页的方法：看口型讲解，跟读音标和三个例词，录下来和原音对比。每天 6–8 个，一到两周能学完 48 个。'),
          T('p0b2', '慢速英语：听一期 6 Minute English', 45, 'listening', '第一遍不看文字，只抓大意；第二遍对照文字听，把听不出来的词标出来；第三遍再不看文字听一次，感受哪些地方变清楚了。'),
          T('p0b3', '语法：词性和句子成分', 30, 'grammar', '语法清单第 1 项。知道名词、动词、形容词、副词、介词、连词各管什么，能在简单句里找出主语和谓语。'),
        ],
        c: [
          T('p0c1', '复习今天的单词和音标', 25, 'vocab', '睡前再过一遍：先看英文说出意思，再看音标读出来。'),
          T('p0c2', '打卡：记一句今天最难的地方', 5, 'review', '把今天卡住的地方写进「学习日志」的备注（只写备注的话，分钟填 0），比如"th 发不准""语速太快跟不上"。一周后回头看会很有用。'),
        ],
      },
      todos: [
        { id: 'p0t1', t: '读完「学习方法」里的「考试概览」，知道雅思考什么' },
        { id: 'p0t2', t: '定好考试类型和目标分（还不确定就先按学术类、6.5 分准备）' },
        { id: 'p0t3', t: '学完第 1 周的课，认识全部 48 个音标' },
        { id: 'p0t4', t: '在「找老师」里把第 1 周的周报发给老师' },
      ],
      exit: '这一周只要认识音标、找到学习节奏，就是胜利。',
    },
    {
      name: '基础重建', weeks: 5, todoLabel: '出关标准',
      goal: '把音标、核心词汇和基础语法捡回来，能慢慢听懂、读懂简单的英语。这是后面所有提分的地基，别跳过。',
      focus: { a: '词汇和语法，上午记忆力最好', b: '发音、精听、阅读', c: '输出和复习' },
      tasks: {
        a: [
          T('p1a1', '复习到期的单词', 30, 'vocab', '先打开背词软件，把今天到期的复习做完再学新词。复习比新学重要，这是整个阶段的规矩。'),
          T('p1a2', '新学 40 个核心词', 50, 'vocab', '每个词：听发音并跟读，看意思，看例句，最后挑 5 个词自己造句。先把高频基础词（约 3000–3500 个）过完，再换雅思词汇书。'),
          T('p1a3', '语法：学一个语法点', 40, 'grammar', '按「学习方法」里语法清单的顺序：看讲解，做 10–20 道练习，再用这个语法写 5 个和自己生活有关的句子。'),
        ],
        b: [
          T('p1b1', '发音：音标或跟读', 20, 'pron', '前两周把 48 个音标学完；之后改成跟读：选一分钟左右的慢速音频，一句一句模仿语音语调，最后录音对比。'),
          T('p1b2', '精听一小段慢速材料', 50, 'listening', '用 6 Minute English 或 VOA 慢速英语里一两分钟的片段：先盲听，再逐句听写，然后对照原文找出没听出来的原因（生词、连读、语速），最后跟读两遍。'),
          T('p1b3', '阅读一篇短文，拆 3 个长句', 50, 'reading', '读分级读物或慢速英语网站上的文章。挑 3 个看不懂的长句：先找主语和谓语，再看其余部分分别修饰谁，最后自己翻译一遍。'),
        ],
        c: [
          T('p1c1', '输出：用今天的新词写 5 句话', 20, 'writing', '句子不求难，求对：写完检查主谓一致、时态和单复数。也可以对着手机用这 5 个词说一分钟。'),
          T('p1c2', '单词第二遍复习', 20, 'vocab', '只看英文回忆意思，想不起来的做记号，明天优先复习。'),
          T('p1c3', '打卡', 5, 'review', '确认今天勾完的任务；计划外学的内容，在「学习日志」补记一条。'),
        ],
      },
      todos: [
        { id: 'p1t1', t: '48 个音标都能读准，看音标能拼读出陌生单词' },
        { id: 'p1t2', t: '高频核心词过完第一轮（约 3000–3500 词）' },
        { id: 'p1t3', t: '学完语法清单第 1–10 项' },
        { id: 'p1t4', t: '能听写出慢速英语一段话里 70% 以上的内容' },
        { id: 'p1t5', t: '能写一段 100 词左右的短文，语法错误不超过 3 处' },
        { id: 'p1t6', t: (p) => '请一位' + (p.accent === 'gb' ? '英音' : '美音') + '老师听一次你的发音（可以把「发音档案」里的录音下载下来发过去）' },
      ],
      exit: '上面几条都做到就进入阶段 2。没做到就多留一两周，地基不牢，后面会很累。',
    },
    {
      name: '题型入门', weeks: 5, todoLabel: '出关标准',
      goal: '认识四科的每一种题型，学会对应的做法，开始用剑桥真题分项练习。从这个阶段起，写作一律在电脑上打字练。',
      focus: { a: '雅思词汇和阅读', b: '听力和写作', c: '口语和错题' },
      tasks: {
        a: [
          T('p2a1', '雅思词汇：复习加新学 40 词', 40, 'vocab', '换成雅思词汇书（比如《雅思词汇真经》），先复习再学新词。听力常考的场景词（日期、地址、房间、课程、交通）要练拼写，拼错不给分。'),
          T('p2a2', '阅读：一篇真题 Passage，限时 20 分钟', 70, 'reading', '按「学习方法」里「阅读」一页的定位法做题。对完答案，每道错题都回原文找到答案句，把"题目里的说法 ↔ 原文里的说法"记进积累本。'),
        ],
        b: [
          T('p2b1', '听力：一个 Part 真题加精听', 50, 'listening', '先像考试一样做题：看题、听、写答案，只听一遍。对完答案，把错题附近的句子逐句听写，找出错因，记进错题本。'),
          T('p2b2', '写作：Task 1 和 Task 2 隔天交替', 60, 'writing', '在电脑上打字写。先看「学习方法」里「写作」一页的结构，前两周可以只写一个段落，之后每次写整篇。写完按四项评分标准自查，或者发给 Claude 批改。'),
        ],
        c: [
          T('p2c1', '口语：3 个 Part 1 加 1 个 Part 2', 30, 'speaking', '用当季题库。Part 1 每题说 2–4 句：回答、原因、一个小例子。Part 2 准备一分钟，说满两分钟并录音，回听找出停顿和语法错误。'),
          T('p2c2', '整理错题和同义替换', 15, 'review', '把今天听力、阅读的错题各记一条到错题本，写清楚错误原因。这比多做一套题更有用。'),
          T('p2c3', '打卡', 5, 'review', '确认今天勾完的任务；计划外学的内容，在「学习日志」补记一条。'),
        ],
      },
      sat: {
        note: '周六是整套练习日：阅读和听力各做一整套，体会完整的考试节奏。',
        focus: { a: '整套阅读', b: '整套听力', c: '口语' },
        tasks: {
          a: [T('s2a1', '整套阅读：3 篇，限时 60 分钟', 110, 'reading', '尽量在屏幕上做。严格计时，中途不停也不查词。时间到了再对答案，按题型统计哪类错得最多。')],
          b: [
            T('s2b1', '整套听力：4 个 Part', 40, 'listening', '按考试方式只听一遍，边听边写答案。'),
            T('s2b2', '精听这一套的错题', 60, 'listening', '逐句听写错题所在的段落，把错因记进错题本。'),
          ],
          c: [T('s2c1', '把本周的口语话题再录一遍', 30, 'speaking', '和本周早些时候的录音对比，听听哪里进步了。')],
        },
      },
      todos: [
        { id: 'p2t1', t: '听力每种题型都做过至少 5 组，知道每种题怎么做' },
        { id: 'p2t2', t: '阅读的判断题、段落标题配对、填空，各专项练过 5 篇以上' },
        { id: 'p2t3', t: 'Task 1 每种类型各写过 1 篇（学术类 7 种：线图、柱状图、饼图、表格、混合图、流程图、地图；培训类 3 种语气的书信）' },
        { id: 'p2t4', t: 'Task 2 五种题型各写过 1 篇' },
        { id: 'p2t5', t: '当季口语 Part 1 过完一遍，准备好 8–10 个 Part 2 素材' },
        { id: 'p2t6', t: '学完语法清单第 11–16 项' },
        { id: 'p2t7', t: '听力、阅读单项做到约 5.5 分（40 题对 18–22 题左右）' },
        { id: 'p2t8', t: '查好考位，定下考试日期（热门场次建议提前一两个月报名）' },
      ],
      exit: '做到大部分就可以进入阶段 3。分数没到也不用焦虑，阶段 3 就是专门提分的。',
    },
    {
      name: '强化提升', weeks: 4, todoLabel: '出关标准',
      goal: '用全真模考找出短板，集中火力提分；写作和口语进入"写完就有反馈"的练习。',
      focus: { a: '阅读和话题词', b: '写作和听力', c: '口语题库' },
      tasks: {
        a: [
          T('p3a1', '阅读：两篇 Passage 连做，限时 40 分钟', 80, 'reading', '做完先按题型统计正确率，把错得最多的题型记下来，第二天优先专项练。'),
          T('p3a2', '词汇：复习加话题表达', 30, 'vocab', '按写作和口语的常见话题（教育、科技、环境、健康、城市、工作）整理表达，写进积累本。'),
        ],
        b: [
          T('p3b1', '写作：一篇完整作文加修改', 70, 'writing', '在电脑上打字写。Task 1 限时 20 分钟，Task 2 限时 40 分钟，隔天交替。写完按四项标准自评，或者请 Claude 批改，再改写一遍。'),
          T('p3b2', '听力：两个 Part 连做加精听', 45, 'listening', '重点练自己错得最多的题型，比如地图题或多选题。'),
        ],
        c: [
          T('p3c1', '口语：2 个 Part 2 加对应的 Part 3', 40, 'speaking', '覆盖当季题库。Part 3 用"观点、原因、例子或对比"展开，每题说 4–6 句，录音回听。'),
          T('p3c2', '错题复盘', 15, 'review', '看错题本里错误原因的统计，针对最多的那一类写一条具体对策，比如"判断题先确认原文有没有提到"。'),
        ],
      },
      sat: MOCK_SAT,
      todos: [
        { id: 'p3t1', t: '每周一次全真模考，成绩都录进「模考记录」' },
        { id: 'p3t2', t: '从错题本里找出最常见的 3 类错误，每类写一条对策' },
        { id: 'p3t3', t: '累计写完 12 篇以上完整作文，每篇都改过一遍' },
        { id: 'p3t4', t: '当季口语 Part 2 全部过一遍并录音' },
        { id: 'p3t5', t: (p) => '模考总分达到 ' + Math.max(4, Number(p.target) - 0.5).toFixed(1) + ' 分（目标分减 0.5）' },
      ],
      exit: '最后 0.5 分往往靠考场状态和冲刺期的查漏补缺。',
    },
    {
      name: '考前冲刺', weeks: 2, fixed: true, todoLabel: '要完成的事',
      goal: '保持手感、查漏补缺，把作息调到考试状态。这两周不再学新东西。',
      focus: { a: '按考试时段做整套题', b: '写作和复盘', c: '口语和回顾' },
      tasks: {
        a: [T('p4a1', '一套听力加一套阅读，严格计时', 100, 'mock', '在电脑上做，尽量和正式考试在同一个时间段，让大脑习惯在那个时间最清醒。')],
        b: [
          T('p4b1', '写作：Task 1 加 Task 2 连写 60 分钟', 60, 'writing', '在电脑上打字写。写完对照积累本里的好表达改一遍，不追求新花样，求稳。'),
          T('p4b2', '复盘上午的听读错题', 40, 'review', '只看错因，不再大量做新题。'),
        ],
        c: [
          T('p4c1', '口语题库最后一轮', 30, 'speaking', '每天快速过 5 个 Part 2，只说不写稿。'),
          T('p4c2', '回看错题本和积累本', 20, 'review', '重点看自己反复错的地方和常错的拼写。'),
        ],
      },
      sat: MOCK_SAT,
      todos: [
        { id: 'p4t1', t: '确认考试时间和地点，以及是机考还是纸笔考' },
        { id: 'p4t2', t: '在官网做一次免费的机考模拟（familiarisation test），熟悉界面' },
        { id: 'p4t3', t: '整理一页"考前必看"：常错拼写、写作结构、口语素材' },
        { id: 'p4t4', t: '考前 3 天把作息调到和考试时间一致' },
        { id: 'p4t5', t: '考前一天只做轻复习，备好证件，确认路线，早点睡' },
      ],
      exit: '',
    },
  ];

  // ── app/index.html L2499 ──
  const parseYmd = (s) => { const p = String(s).split('-').map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1); };

  // ── app/index.html L2500 ──
  const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

  // ── app/index.html L2501 ──
  const diffDays = (a, b) => Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()) - new Date(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);

  // ── app/index.html L2503 ──
  const toMin = (hm) => { const p = String(hm || '0:0').split(':').map(Number); return (p[0] || 0) * 60 + (p[1] || 0); };

  // ── app/index.html L2594 ──
  const fmtH = (min) => String(Math.round(min / 6) / 10);

  // ── app/index.html L2941–2947 ──
  // ================= plan logic =================
  function activeBlocks(p) {
    return ['a', 'b', 'c'].filter((k) => k !== 'c' || p.eveningOn).map((k) => {
      const from = p.blocks[k][0], to = p.blocks[k][1];
      return { key: k, name: BLOCK_DEFS[k].name, light: !!BLOCK_DEFS[k].light, from, to, s: toMin(from), e: toMin(to) };
    });
  }

  // ── app/index.html L2948–2952 ──
  function dailyHours(p) {
    let h = 0;
    activeBlocks(p).forEach((b) => { const d = Math.max(0, b.e - b.s) / 60; h += b.light ? Math.min(1.5, d * 0.5) : d; });
    return h;
  }

  // ── app/index.html L2953–2963 ──
  function phasePlan(p) {
    const h = Math.max(0.5, dailyHours(p));
    const scale = Math.min(3, Math.max(0.7, 5 / h));
    let cur = parseYmd(p.startDate);
    return PHASES.map((ph, i) => {
      const weeks = ph.fixed ? ph.weeks : Math.max(2, Math.round(ph.weeks * scale));
      const start = cur, end = addDays(cur, weeks * 7 - 1);
      cur = addDays(end, 1);
      return { ph, i, weeks, start, end };
    });
  }

  return { esc: esc, fdUs: fdUs, toks: toks, normTok: normTok, lcsOk: lcsOk, NUM_1: NUM_1, NUM_10: NUM_10, NUM_ORD: NUM_ORD, numWords: numWords, dictWords: dictWords, tokMarks: tokMarks, dictScore: dictScore, speechChunks: speechChunks, CLIP_SILENT: CLIP_SILENT, TZ_PLACES: TZ_PLACES, TZ_DEFAULT: TZ_DEFAULT, tzFmt: tzFmt, tzDevice: tzDevice, tzParts: tzParts, tzPlaceOf: tzPlaceOf, BLOCK_DEFS: BLOCK_DEFS, T: T, MOCK_SAT: MOCK_SAT, PHASES: PHASES, parseYmd: parseYmd, addDays: addDays, diffDays: diffDays, toMin: toMin, fmtH: fmtH, activeBlocks: activeBlocks, dailyHours: dailyHours, phasePlan: phasePlan };
});
