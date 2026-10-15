/* 雅思工作台 · 考试 · app/exam/mark.js — owner: E1（考试数据）. docs/EXAM.md §5.4, §6.6, §3.4.1, §10.3.
 *
 * Writing and speaking marks: the prompts that ask Claude for the criteria against the public band descriptors (§6.6),
 * the parser that only accepts a complete and sane answer, the objective checks and the caps they put on each
 * criterion (§5.4), the plain-language rows she picks from when she marks herself, and how marks combine: every
 * criterion takes Claude's latest mark, else her latest own (§7.1); a piece's band is the four criteria averaged and
 * floored to .0 / .5 (two tasks: (T1 + 2·T2) / 3, floored the same way).
 * Pure: no DOM, no WB, no clock. UMD: Node → module.exports; browser → BaseEngine.ExamMark. Nothing runs at load time.
 * Whatever Claude returns is data: it is parsed, checked and handed on as strings, never as markup (§6.4 #10).
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) { var BE = root.BaseEngine = root.BaseEngine || {}; if (!BE.ExamMark) BE.ExamMark = api; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (root) {
  'use strict';

  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  var CRIT = { W: ['TA', 'CC', 'LR', 'GRA'], S: ['FC', 'LR', 'GRA', 'P'] };

  /* ───────────────────────────── prompts (§6.6) ───────────────────────────── */
  var W_DESC = {
    TA: '7 covers all requirements with clear, relevant detail; 6 addresses all points, some not fully; 5 generally\naddresses the task, details limited or partly irrelevant; 4 attempts the task but misses points; 3 largely fails to\naddress the task; 2 barely responds.',
    CC: '7 logical, clear progression, range of linking; 6 coherent, linking effective but sometimes faulty; 5 some organisation,\nlinking limited or overused; 4 not arranged coherently, basic linking, repetitive; 3 no logical organisation; 2 little control.',
    LR: '7 some flexibility and less common words, occasional errors; 6 adequate range, errors do not impede; 5 limited but\nadequate, noticeable spelling errors; 4 basic, repetitive, errors cause strain; 3 very limited, errors distort meaning.',
    GRA: '7 variety of complex structures, frequent error-free sentences; 6 mix of simple and complex, errors rarely impede;\n5 limited range, frequent errors; 4 very limited, errors predominate; 3 errors distort meaning; 2 only memorised phrases.'
  };
  var S_DESC = {
    FC: '7 speaks at length without noticeable effort, some hesitation; 6 willing to speak at length, but may lose coherence\nthrough repetition or hesitation; 5 usually keeps going, but relies on repetition, self-correction and slow speech; 4 cannot\nrespond without noticeable pauses, only simple connectives; 3 long pauses, simple answers only; 2 pauses before most words.',
    LR: '7 flexible vocabulary on a range of topics, some less common words; 6 wide enough vocabulary to discuss topics at length,\nmeaning clear; 5 manages familiar topics, limited flexibility; 4 basic vocabulary for familiar topics, frequent errors in word\nchoice; 3 simple vocabulary for personal information only; 2 only isolated words.',
    GRA: '7 a range of complex structures with some flexibility, frequent error-free sentences; 6 a mix of simple and complex\nforms, errors rarely impede; 5 basic sentences reasonably accurate, limited complex forms; 4 basic sentences, errors\nfrequent; 3 attempts basic sentences, mostly memorised; 2 cannot produce basic sentences.'
  };
  function words(s) { return String(s || '').replace(/[’]/g, '\'').split(/\s+/).map(function (w) { return w.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, ''); }).filter(function (w) { return /[A-Za-z0-9]/.test(w); }); }
  // she types on a phone and letter case is never marked (2026-09-30, docs/EXAM.md §4.2.1)
  var NOCASE = 'She types on a phone: ignore capital letters (not an error, not a fix); your own English keeps normal capitals.';
  function knownSample(ctx) {
    var k = ctx && ctx.known;
    var list = Array.isArray(k) ? k.slice() : k && typeof k.forEach === 'function' ? (function () { var a = []; k.forEach(function (w) { a.push(w); }); return a; })() : [];
    list = list.filter(function (w) { return /^[a-z][a-z'-]*$/.test(w); }).sort();
    if (list.length > 400) list = list.filter(function (w, i) { return i % Math.ceil(list.length / 400) === 0; });
    return list.join(' ');
  }
  /**
   * writingPrompt(task, text, ctx) → string. task = { en, zh, bullets: [{ en, zh }], min, max, n: 1|2 }, ctx = { week,
   * module: 'A'|'G' (Academic / General Training), known: string[] | Set }.
   */
  function writingPrompt(task, text, ctx) {
    task = task || {}; ctx = ctx || {};
    var two = Number(task.n) === 2, crit = two ? 'TR' : 'TA', n = words(text).length;
    var bullets = (task.bullets || []).map(function (b) { return String(b.en || b.zh || '').replace(/\.$/, ''); }).filter(Boolean);
    return 'You are an experienced IELTS Writing examiner. Mark this response against the public IELTS Writing band descriptors\n'
      + '(' + (two ? 'task2' : 'task1') + '; ' + (ctx.module === 'A' ? 'Academic' : 'General Training') + '). The writer is a beginner in course week ' + (ctx.week || 1) + '. Mark honestly; do not inflate.\n\n'
      + 'TASK: ' + String(task.en || '') + '\n（' + String(task.zh || '') + '）\n'
      + 'Required points: ' + (bullets.length ? bullets.join('; ') : 'none') + '. Required length: ' + (task.min || 0) + '–' + (task.max || task.min || 0) + ' words.\n'
      + 'RESPONSE (' + n + ' words):\n"""' + String(text || '') + '"""\n\n'
      + 'Use the public IELTS Writing band descriptors (the current version) as you know them; this summary is only a reminder:\n'
      + crit + ': ' + W_DESC.TA + '\nCC: ' + W_DESC.CC + '\nLR: ' + W_DESC.LR + '\nGRA: ' + W_DESC.GRA + '\n'
      + 'If the response is shorter than the required length, ' + crit + ' cannot be above 4 (under half the length: above 3).\n' + NOCASE + '\n\n'
      + 'Return ONLY this JSON:\n'
      + '{"TA":{"band":0,"why":""},"CC":{"band":0,"why":""},"LR":{"band":0,"why":""},"GRA":{"band":0,"why":""},\n'
      + ' "fixes":[{"you":"","better":"","zh":""}],"better":{"en":"","zh":""}}\n'
      + '- "band": a whole number 0–9. Use key "TA" for Task Response too.\n'
      + '- "why": one short sentence in simple Chinese; quote at most one short phrase from the response.\n'
      + '- "fixes": up to 3 real errors from the response: her words, the corrected English, a Chinese explanation.\n'
      + '- "better": a better version about one band higher than hers, using mostly these words: ' + knownSample(ctx) + '; with a Chinese\n  translation.\n'
      + 'No Markdown, no text outside the JSON.';
  }
  /**
   * speakingPrompt(set, answers, ctx) → string. set = [{ en, zh }] (the questions), answers = [{ text, wpm? }] in the same
   * order, ctx = { week, typed: true when the answers were typed after speaking aloud (then only LR and GRA) }.
   */
  function speakingPrompt(set, answers, ctx) {
    set = set || []; answers = answers || []; ctx = ctx || {};
    var typed = !!ctx.typed, keys = typed ? ['LR', 'GRA'] : ['FC', 'LR', 'GRA'];
    var qa = set.map(function (q, i) {
      var a = answers[i] || {}, t = String(a.text || ''), n = words(t).length;
      return (i + 1) + '. Q: ' + String(q.en || '') + (q.zh ? '（' + q.zh + '）' : '') + '\n   A (' + n + ' words' + (!typed && a.wpm ? ', about ' + Math.round(a.wpm) + ' words per minute' : '') + '): """' + t + '"""';
    }).join('\n');
    var json = '{' + keys.map(function (k) { return '"' + k + '":{"band":0,"why":""}'; }).join(',') + ',"fixes":[{"you":"","better":"","zh":""}],"better":[{"q":1,"en":"","zh":""}]}';
    return 'You are an experienced IELTS Speaking examiner. Mark these Part 1 answers against the public IELTS Speaking band descriptors.\n'
      + 'The speaker is a beginner in course week ' + (ctx.week || 1) + '. Mark honestly; do not inflate.\n'
      + (typed ? 'The answers were typed after speaking aloud, so fluency cannot be judged: mark ONLY LR and GRA. ' + NOCASE + '\n'
        : 'The answers are speech-recognition transcripts: ignore punctuation and capital letters, and do not penalise a word that looks like a recognition error. You cannot hear her: do NOT mark pronunciation.\n')
      + '\nQUESTIONS AND ANSWERS:\n' + qa + '\n\n'
      + 'Use the public IELTS Speaking band descriptors (the current version) as you know them; this summary is only a reminder:\n'
      + keys.map(function (k) { return k + ': ' + S_DESC[k]; }).join('\n') + '\n\n'
      + 'Return ONLY this JSON:\n' + json + '\n'
      + '- "band": a whole number 0–9.\n'
      + '- "why": one short sentence in simple Chinese; quote at most one short phrase from her answers.\n'
      + '- "fixes": up to 3 real errors from her answers: her words, the corrected English, a Chinese explanation.\n'
      + '- "better": for each question, a better answer about one band higher than hers (2–4 short sentences), with a Chinese translation; "q" is the question number.\n'
      + 'No Markdown, no text outside the JSON.';
  }

  /* ───────────────────────────── parsing Claude's answer (§6.6 校验) ───────────────────────────── */
  function str(x, max) { return String(x == null ? '' : x).replace(/\s+/g, ' ').trim().slice(0, max || 400); }
  /**
   * parse(kind 'W'|'S', text, opts?: { typed }) → Marks | null. Accepts a fenced or chatty answer (first "{" to last "}");
   * every criterion present (writing four, speaking three, typed speaking only LR and GRA), band a whole number 0–9,
   * why non-empty and ≤ 80 characters, highest − lowest ≤ 4 (else not credible); fixes cut to 3.
   */
  function parse(kind, text, opts) {
    opts = opts || {};
    var s = String(text == null ? '' : text).replace(/```[a-zA-Z]*/g, ''), a = s.indexOf('{'), b = s.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    var j;
    try { j = JSON.parse(s.slice(a, b + 1)); } catch (e) { return null; }
    if (!isObj(j)) return null;
    var typed = kind === 'S' && !!opts.typed;
    var keys = kind === 'W' ? CRIT.W : typed ? ['LR', 'GRA'] : ['FC', 'LR', 'GRA'];
    var c = {}, why = {}, ok = true;
    keys.forEach(function (k) {
      var x = j[k];
      if (kind === 'W' && k === 'TA' && !isObj(x) && isObj(j.TR)) x = j.TR;
      if (!isObj(x)) { ok = false; return; }
      var band = x.band;
      if (typeof band === 'string' && /^\d$/.test(band.trim())) band = Number(band);
      var w = str(x.why, 200);
      if (typeof band !== 'number' || !isFinite(band) || Math.floor(band) !== band || band < 0 || band > 9) { ok = false; return; }
      if (!w || w.length > 80) { ok = false; return; }
      c[k] = band; why[k] = w;
    });
    if (!ok) return null;
    var vals = keys.map(function (k) { return c[k]; });
    if (Math.max.apply(null, vals) - Math.min.apply(null, vals) > 4) return null;
    var fix = (Array.isArray(j.fixes) ? j.fixes : []).filter(isObj).slice(0, 3).map(function (f) { return [str(f.you, 200), str(f.better, 200), str(f.zh, 200)]; })
      .filter(function (f) { return f[0] && f[1]; });
    var better = [];
    if (kind === 'W' && isObj(j.better) && str(j.better.en)) better.push({ en: str(j.better.en, 1500), zh: str(j.better.zh, 1500) });
    if (kind === 'S' && Array.isArray(j.better)) j.better.filter(isObj).slice(0, 8).forEach(function (x) { if (str(x.en)) better.push({ q: Number(x.q) || null, en: str(x.en, 800), zh: str(x.zh, 800) }); });
    var m = { kind: kind, by: 'ai', c: c, why: why, fix: fix, better: better };
    if (typed) m.typed = true;
    if (kind === 'W') m.band = bandOf('W', m);
    return m;
  }

  /* ───────────────────────────── objective checks and caps (§5.4) ───────────────────────────── */
  var LINKS = ['and', 'but', 'so', 'because', 'then', 'or', 'also'];
  var WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  var MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  var AUX = { am: 1, is: 1, are: 1, was: 1, were: 1, be: 1, have: 1, has: 1, had: 1, do: 1, does: 1, did: 1, can: 1, could: 1, will: 1, would: 1, "i'm": 1, "it's": 1,
    "he's": 1, "she's": 1, "that's": 1, "there's": 1, "we're": 1, "they're": 1, "you're": 1, "don't": 1, "doesn't": 1, "can't": 1, "isn't": 1, "aren't": 1, "let's": 1 };
  var VERBS = ('work live like love go get cook clean study sleep relax exercise walk watch drink eat start open close cost pay want need make take read call ' +
    'visit meet play help send buy come see know say tell think look listen speak write teach finish stop wait rent apply move shop leave stay sit ' +
    'swim run drive ride try hope enjoy spend get give bring feel find keep learn miss plan use wear').split(' ');
  var VERB = {};
  VERBS.forEach(function (v) { VERB[v] = 1; });
  function stemOf(w) {
    if (/ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (/(ch|sh|x|ss|o)es$/.test(w)) return w.slice(0, -2);
    if (/s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    if (/ied$/.test(w)) return w.slice(0, -3) + 'y';
    if (/ed$/.test(w)) return w.slice(0, -2);
    if (/ing$/.test(w)) return w.slice(0, -3);
    return w;
  }
  function hasVerb(ws) {
    return ws.some(function (w) {
      var l = w.toLowerCase();
      if (AUX[l] || VERB[l]) return true;
      var st = stemOf(l);
      return VERB[st] || VERB[st + 'e'] || (/ed$/.test(l) && l.length > 4) ;
    });
  }
  function sentencesOf(text) {
    return String(text || '').replace(/[’]/g, '\'').split(/[.!?。！？\n]+/).map(function (s) { return s.trim(); }).filter(function (s) { return /[A-Za-z]/.test(s); });
  }
  function editDist(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) { d[i] = [i]; }
    for (j = 0; j <= n; j++) d[0][j] = j;
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1));
    return d[m][n];
  }
  // words of the course she wrote, and the ones that look like one of them misspelt (brithday → birthday)
  function spelling(ws, ctx) {
    var items = [];
    var src = ctx && (ctx.items || ctx.learnedWords);
    if (src && typeof src.forEach === 'function') src.forEach(function (w) { if (/^[a-z]{4,}$/.test(String(w).toLowerCase())) items.push(String(w).toLowerCase()); });
    var isKnown = ctx && typeof ctx.isKnown === 'function' ? ctx.isKnown : null;
    var itemSet = {};
    items.forEach(function (w) { itemSet[w] = 1; });
    var used = 0, bad = [];
    ws.forEach(function (w) {
      var l = w.toLowerCase().replace(/'s$/, '');
      if (l.length < 4 || /\d/.test(l)) return;
      if (itemSet[l] || itemSet[stemOf(l)]) { used++; return; }
      if (isKnown && isKnown(l)) return;
      var best = null;
      items.forEach(function (t) { if (Math.abs(t.length - l.length) > 2 || t.charAt(0) !== l.charAt(0)) return; var d = editDist(l, t); if (d <= Math.max(1, Math.floor(t.length / 4)) && (!best || d < best.d)) best = { d: d, t: t }; });
      if (best) { used++; bad.push(w); }
    });
    return { used: used, bad: bad };
  }
  function keyHit(key, text) {
    var toks = words(text).map(function (w) { return w.toLowerCase(); }), low = ' ' + toks.join(' ') + ' ', raw = String(text || '').toLowerCase();
    if (key === '@weekday') return toks.some(function (w) { return WEEKDAYS.indexOf(w.replace(/s$/, '')) >= 0; });
    if (key === '@month') return toks.some(function (w) { return MONTHS.indexOf(w) >= 0; });
    if (key === '@time') return /\b\d{1,2}([.:]\d\d)?\s*(am|pm)?\b|o'clock|half past|quarter/.test(raw);
    if (key === '@price') return /£\s*\d|\d+(\.\d\d)?\s*pounds?|\bpounds?\b|\bfree\b/.test(raw);
    // a key matches at the start of a word ('thank' finds thanks; 'see you' finds see you soon)
    return low.indexOf(' ' + String(key).toLowerCase().replace(/[’]/g, '\'')) >= 0;
  }
  var P_CAP = [[50, 3], [70, 4], [85, 5], [95, 6], [101, 7]];
  /**
   * objective(kind 'W'|'S', taskOrSet, input, ctx?) → Checks (§10.4) with caps { criterion: highest band the facts allow,
   * 9 = no cap }.
   *   W: task = { min, max, bullets: [{ zh, keys }] }, input = her text.
   *   S: set = [{ en, zh }] or { qs, bullets }, input = { answers: [{ text, wpm?, typed? }], heard: machine intelligibility % | null, typed }.
   * ctx = { items: learned words (Set / array), isKnown(word) }.
   */
  function objective(kind, taskOrSet, input, ctx) {
    ctx = ctx || {};
    var caps = {};
    function cap(k, v) { caps[k] = Math.min(caps[k] == null ? 9 : caps[k], v); }
    if (kind === 'W') {
      var task = taskOrSet || {}, text = String(input == null ? '' : (isObj(input) ? input.text : input)), ws = words(text), n = ws.length;
      var sents = sentencesOf(text), min = Number(task.min) || 0, max = Number(task.max) || 0;
      var bullets = (task.bullets || []).map(function (b) { var keys = b.keys || []; return { zh: String(b.zh || b.en || ''), hit: !keys.length ? n > 0 : keys.some(function (k) { return keyHit(k, text); }) }; });
      var links = LINKS.filter(function (l) { return ws.some(function (w) { return w.toLowerCase() === l; }); });
      var sp = spelling(ws, ctx), noVerb = sents.filter(function (s) { return !hasVerb(words(s)); }).length;
      CRIT.W.forEach(function (k) { caps[k] = 9; });
      if (min && n < min * 0.5) cap('TA', 3); else if (min && n < min * 0.8) cap('TA', 4);
      var miss = bullets.filter(function (b) { return !b.hit; }).length;
      if (miss >= 2) cap('TA', 4); else if (miss === 1) cap('TA', 5);
      if (sents.length <= 1) cap('CC', 3); else if (!links.length) cap('CC', 5);
      if (sp.used && sp.bad.length / sp.used > 0.2) cap('LR', 4);
      if (sents.length && noVerb / sents.length > 0.3) cap('GRA', 4);
      return { words: n, min: min, max: max, sentences: sents.length, bullets: bullets, links: links, spellBad: sp.bad, noVerb: noVerb, caps: caps };
    }
    // speaking
    var set = Array.isArray(taskOrSet) ? taskOrSet : (taskOrSet && taskOrSet.qs) || [];
    var inp = isObj(input) ? input : { answers: Array.isArray(input) ? input : [] };
    var answers = (inp.answers || []).map(function (a) { return isObj(a) ? a : { text: String(a || '') }; });
    var typed = !!inp.typed || answers.some(function (a) { return a.typed; });
    var allText = answers.map(function (a) { return a.text || ''; }).join(' \n'), aws = words(allText);
    var perSents = answers.map(function (a) { return sentencesOf(a.text).length; }), sentsAll = sentencesOf(allText);
    var wpms = answers.map(function (a) { return Number(a.wpm) || 0; }).filter(function (x) { return x > 0; });
    var wpm = wpms.length ? Math.round(wpms.reduce(function (s, x) { return s + x; }, 0) / wpms.length) : undefined;
    var reason = answers.map(function (a) { return /\b(because|so)\b/i.test(a.text || ''); });
    var bl = [{ zh: '直接回答问题', hit: answers.some(function (a) { return words(a.text).length > 0; }) }, { zh: '说了原因', hit: reason.some(Boolean) },
      { zh: '加了一个小细节', hit: perSents.some(function (x) { return x >= 2; }) }];
    CRIT.S.forEach(function (k) { caps[k] = 9; });
    if (!typed && wpm != null) { if (wpm < 50) cap('FC', 4); else if (wpm < 80) cap('FC', 5); }
    var oneSent = perSents.filter(function (x) { return x <= 1; }).length;
    if (answers.length && oneSent > answers.length / 2) cap('FC', 4);
    var heard = inp.heard == null || !isFinite(Number(inp.heard)) ? null : Number(inp.heard);
    if (heard == null) cap('P', 5);
    else for (var i = 0; i < P_CAP.length; i++) if (heard < P_CAP[i][0]) { cap('P', P_CAP[i][1]); break; }
    var noV = sentsAll.filter(function (s) { return !hasVerb(words(s)); }).length;
    if (typed && sentsAll.length && noV / sentsAll.length > 0.3) cap('GRA', 4);
    var out = { words: aws.length, min: 0, max: 0, sentences: sentsAll.length, bullets: bl, links: LINKS.filter(function (l) { return aws.some(function (w) { return w.toLowerCase() === l; }); }),
      spellBad: [], noVerb: noV, caps: caps, typed: typed, qs: set.length };
    if (wpm != null) out.wpm = wpm;
    if (heard != null) out.heard = heard;
    return out;
  }

  /* ───────────────────────────── the self-assessment rows (§5.4) ───────────────────────────── */
  var ROWS_W = {
    TA: ['只回答了一小部分，读的人要猜', '回答了题目，但有要点没写到或写得不清楚', '每个要点都写到了，但细节很少', '每个要点都写到，还各加了一点细节', '要点清楚完整、细节具体，一看就懂'],
    CC: ['句子之间没有联系，顺序乱', '用了 and、but，但顺序有点乱', '顺序清楚，会用 and、but、so、because', '有开头有结尾，连接自然、不重复', '一段一个意思，前后接得很顺'],
    LR: ['只会用很少的词，很多拼写错', '用词简单，有几处拼写错影响理解', '用词够用，拼写错不影响理解', '用上了这周新学的词和搭配，基本拼对', '用词准确多样，几乎没有拼写错'],
    GRA: ['大部分句子不完整（缺主语或动词）', '简单句基本完整，但错误很多', '简单句大多正确，偶尔有小错', '简单句都对，还用了一两个长句', '长短句都有，大部分没有错误']
  };
  var ROWS_S = {
    FC: ['停顿很长，只能说一两个词', '回答前要想很久，只会用 and 连起来', '能说下去，但常常停下来、重说', '愿意多说，偶尔停一下，会用 because、so', '说得长也不费力，很少犹豫'],
    LR: ['只会很少的词，常常说不出想说的', '用词简单，常常找不到合适的词', '熟悉的话题够用，用词有点单一', '用上了这周学的词和句型', '用词准确，也会换个说法'],
    GRA: ['大部分句子不完整（缺主语或动词）', '简单句基本完整，但错误很多', '简单句大多正确，偶尔有小错', '简单句都对，还用了一两个长句', '长短句都有，大部分没有错误'],
    // her own pronunciation habits from the teacher's notes: four checks, how many she already does is the row
    P: ['长短元音不分（ship / sheep）、词尾的 s t d 吞掉、th 读成 t 或 d、每个音节一样重', '四条里做到一条（比如长短元音分开了）', '四条里做到两条', '四条里做到三条',
      '四条都做到了：ship / sheep 分开、词尾清楚、th 到位、有轻有重']
  };
  /** rubric(kind 'W'|'S', tier) → { criterion: [{ band, zh }] }: five rows, bands 3–7 at tier 1, 4–8 from tier 2 */
  function rubric(kind, tier) {
    var src = kind === 'S' ? ROWS_S : ROWS_W, base = (Number(tier) || 1) >= 2 ? 4 : 3, out = {};
    Object.keys(src).forEach(function (k) { out[k] = src[k].map(function (zh, i) { return { band: base + i, zh: zh }; }); });
    return out;
  }
  /**
   * selfMarks(kind, picks { criterion: band }, checks, only?) → Marks: each criterion min(her pick, the objective cap);
   * only = the criteria she marks herself (typed speaking: ['FC', 'P']).
   */
  function selfMarks(kind, picks, checks, only) {
    var caps = (checks && checks.caps) || {}, keys = only && only.length ? only : CRIT[kind === 'S' ? 'S' : 'W'], c = {}, cp = {};
    keys.forEach(function (k) {
      if (!picks || picks[k] == null || !isFinite(Number(picks[k]))) return;
      var v = Math.max(0, Math.min(9, Math.round(Number(picks[k])))), ca = caps[k] != null ? Number(caps[k]) : 9;
      c[k] = Math.min(v, ca);
      if (ca < 9) cp[k] = ca;
    });
    var m = { kind: kind === 'S' ? 'S' : 'W', by: 'self', c: c };
    if (Object.keys(cp).length) m.cap = cp;
    if (checks && checks.typed) m.typed = true;
    if (CRIT[m.kind].every(function (k) { return c[k] != null; })) m.band = bandOf(m.kind, m);
    return m;
  }
  /**
   * combine(marksList) → { c, band, by: 'ai'|'self'|'mixed', typed }: each criterion Claude's latest, else her latest own
   * (§7.1); `at` (YYMMDDHHMM) orders them, the list order breaks ties.
   */
  function combine(list) {
    var arr = (list || []).filter(function (m) { return m && isObj(m.c); }).map(function (m, i) { return { m: m, i: i }; });
    arr.sort(function (a, b) { var x = String(a.m.at || ''), y = String(b.m.at || ''); return x < y ? -1 : x > y ? 1 : a.i - b.i; });
    var c = {}, by = {}, typed = false, kind = null;
    arr.forEach(function (e) {
      var m = e.m;
      if (m.kind) kind = kind || m.kind;
      if (m.typed) typed = true;
      Object.keys(m.c).forEach(function (k) {
        var v = Number(m.c[k]);
        if (!isFinite(v)) return;
        if (m.by === 'ai') { c[k] = v; by[k] = 'ai'; } else if (by[k] !== 'ai') { c[k] = v; by[k] = 'self'; }
      });
    });
    var ks = Object.keys(c);
    if (!kind) kind = ks.some(function (k) { return k === 'FC' || k === 'P'; }) ? 'S' : 'W';
    var all = CRIT[kind].every(function (k) { return c[k] != null; });
    return { c: c, band: all ? bandOf(kind, { c: c }) : null, by: ks.length && ks.every(function (k) { return by[k] === 'ai'; }) ? 'ai' : ks.every(function (k) { return by[k] === 'self'; }) ? 'self' : 'mixed', typed: typed, kind: kind, src: by };
  }
  function floorHalf(x) { return Math.floor(x * 2 + 1e-9) / 2; }
  /**
   * bandOf(kind, marks) → the piece's band: the four criteria averaged, floored to .0 / .5 (examiner convention).
   * bandOf([3, 3, 4, 4]) works too; bandOf('W', { t1, t2 }) = (T1 + 2·T2) / 3 floored (two writing tasks, §5.4).
   */
  function bandOf(kind, marks) {
    if (Array.isArray(kind)) { var a = kind.map(Number); return floorHalf(a.reduce(function (s, x) { return s + x; }, 0) / a.length); }
    if (isObj(marks) && marks.t1 != null && marks.t2 != null) return floorHalf((Number(marks.t1) + 2 * Number(marks.t2)) / 3);
    var c = isObj(marks) && isObj(marks.c) ? marks.c : marks, keys = CRIT[kind === 'S' ? 'S' : 'W'];
    if (!isObj(c) || !keys.every(function (k) { return c[k] != null && isFinite(Number(c[k])); })) return null;
    return floorHalf(keys.reduce(function (s, k) { return s + Number(c[k]); }, 0) / keys.length);
  }
  /** range(by, band) → [lo, hi]: Claude ±0.5, her own −1.0 / +0.5 (§5.5) */
  function rangeOf(by, band) {
    if (band == null) return null;
    var lo = by === 'ai' ? band - 0.5 : band - 1.0, hi = band + 0.5;
    return [Math.max(0, lo), Math.min(9, hi)];
  }

  return {
    CRIT: CRIT, writingPrompt: writingPrompt, speakingPrompt: speakingPrompt, parse: parse, objective: objective, rubric: rubric,
    selfMarks: selfMarks, combine: combine, bandOf: bandOf, rangeOf: rangeOf,
    _: { words: words, sentencesOf: sentencesOf, hasVerb: hasVerb, keyHit: keyHit, spelling: spelling }
  };
});
