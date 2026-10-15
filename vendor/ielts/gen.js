/* 雅思工作台 · 考试 · app/exam/gen.js — owner: E1（考试数据）. docs/EXAM.md §4.4–§4.8, §4.2.1, §10.3.
 *
 * From "scene + target + format" to one question: realizes a frame's parameters from a seed and the real calendar
 * (item), writes them into a plan row, and renders any plan row back into the same ExamItem forever after (render: plan
 * row + bank + course content only; no learner state, no clock). check() marks an answer by the IELTS rules (word limits,
 * plural, words from the text, spelling) and by the key forms of a written sentence; validateItem() is the gate every
 * generated question passes (§4.5 step 7).
 * Pure: no DOM, no WB, no clock. UMD: Node → module.exports; browser → BaseEngine.ExamGen (needs Model, ExamBank).
 *
 * §10.9 code budgets: EXAM.md §10.9 (tests/base/budgets.test.mjs checks them).
 *
 * ExamItem / Verdict additions: store.js's CONTRACT CHANGE LOG (§10.1) lists them all. For reference: input is form | type |
 * choice | tfng | match | tap | order | text | speak; blanks[].kind is word | time | price | date | dom | count | number; blank
 * markers in form cells, notes and msg text are '?0', '?1' … (the blank's k); optsZhNow: LP, VM, PS show the options'
 * Chinese before the answer; roles[x].zh is a cast member's role ('you' → 你, a one-time name has none); Verdict.att is
 * [[sub, value 0–1, weight, part]] (every sub-skill attempt of the answer, written into the leaf).
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) { var BE = root.BaseEngine = root.BaseEngine || {}; if (!BE.ExamGen) BE.ExamGen = api; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (root) {
  'use strict';

  var own = Object.prototype.hasOwnProperty;
  var isNode = typeof module === 'object' && module && module.exports && typeof require === 'function';
  var M = null, B = null;
  function Model() { if (!M) { if (isNode) { try { M = require('../base/model.js'); } catch (e) { M = null; } } if (!M && root && root.BaseEngine) M = root.BaseEngine.Model || null; } return M; }
  function Bank() { if (!B) { if (isNode) { try { B = require('./bank.js'); } catch (e) { B = null; } } if (!B && root && root.BaseEngine) B = root.BaseEngine.ExamBank || null; } return B; }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }

  /* ───────────────────────────── seeded random (§10.3: mulberry32(cyrb53(seed) >>> 0)) ───────────────────────────── */
  function rng(seed) {
    var a = Model().cyrb53(String(seed)) >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function pick(list, r) { return list.length ? list[Math.floor(r() * list.length) % list.length] : undefined; }
  function shuffled(list, r) { var a = list.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  /* ───────────────────────────── calendar (§4.1 "日历是真的") ───────────────────────────── */
  var WD = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  function calCandidates(asOf, want) {
    var U = Model().util, out = [];
    want = want || {};
    for (var k = 3; k <= 60; k++) {
      var d = U.addDays(asOf, k), wd = WD[U.weekday(d)], mo = Bank().MONTHS[Number(d.slice(5, 7)) - 1], dom = String(Number(d.slice(8, 10)));
      if (want.weekday && (Array.isArray(want.weekday) ? want.weekday.indexOf(wd) < 0 : want.weekday !== wd)) continue;
      if (want.month && (Array.isArray(want.month) ? want.month.indexOf(mo) < 0 : want.month !== mo)) continue;
      if (want.dom && String(want.dom) !== dom) continue;
      if (want.maxDom && Number(dom) > want.maxDom) continue;
      out.push(d);
    }
    return out;
  }
  /** calDate(asOf, { weekday?, month? }, rng) → a real date 3–60 days after asOf that fits, or null */
  function calDate(asOf, want, r) {
    var c = calCandidates(asOf, want);
    if (!c.length) return null;
    return c[Math.floor((typeof r === 'function' ? r() : 0) * c.length) % c.length];
  }
  function dateParts(d) { var U = Model().util; return { weekday: WD[U.weekday(d)], month: Bank().MONTHS[Number(d.slice(5, 7)) - 1], dom: String(Number(d.slice(8, 10))), year: d.slice(0, 4) }; }

  /* ───────────────────────────── plan-row parameters ───────────────────────────── */
  // 'm=october;d=saturday;n=10;y=2026;A=Grace;@=0;o=0,2,1;d~=tuesday,sunday' — values never hold ';' or '='
  function parseParams(s) {
    var o = {};
    String(s || '').split(';').forEach(function (kv) { if (!kv) return; var i = kv.indexOf('='); if (i > 0) o[kv.slice(0, i)] = kv.slice(i + 1); });
    return o;
  }
  function paramString(p, order) {
    var keys = Object.keys(p), out = [], done = {};
    (order || []).forEach(function (k) { if (own.call(p, k) && p[k] != null && p[k] !== '') { out.push(k + '=' + p[k]); done[k] = 1; } });
    keys.forEach(function (k) { if (!done[k] && p[k] != null && p[k] !== '') out.push(k + '=' + p[k]); });
    return out.join(';');
  }

  /* ───────────────────────────── course content behind the targets ───────────────────────────── */
  function itemOf(ctx, id) {
    if (!id) return null;
    if (/^c:/.test(id)) { var ph = phraseList(ctx); for (var i = 0; i < ph.length; i++) if (ph[i].id === id) return ph[i]; return null; }
    return ctx && ctx.index ? ctx.index.items.get(id) || null : null;
  }
  function phraseList(ctx) { if (!ctx) return []; if (!ctx.phrases && ctx.index) ctx.phrases = Bank().phrases(ctx.index); return ctx.phrases || []; }
  /* ── a word's Chinese as she reads it (the lead's review, 2026-09-27): course glosses are dictionary lines ("n. 房租 v. 租",
   * "水槽；下沉"). On its own (an option, a note, a label) at most two senses joined with "/" (水槽/下沉; 房租, not 房租/租) and
   * a short grammar note (公寓（英式）); inside a sentence the first sense only. phrase: a collocation (its comma stays). */
  var POS_MARK = /(^|[\s；;，,、\/])(?:(?:n|v|vt|vi|adj|adv|prep|conj|pron|num|art|int|interj|aux|modal|det|abbr|pl)\.\s*(?:\/\s*)?)+(?=[^\sA-Za-z.]|$)/gi;
  var NOTE_KEEP = /复数|过去式|过去分词|人名|英式|美式|缩写/;
  var ZHC = Object.create(null), ZHC_N = 0;
  function zhClean(z, inSentence, phrase) {
    z = String(z == null ? '' : z);
    var key = (inSentence ? 'i' : 'o') + (phrase ? 'p' : 'w') + z, c = ZHC[key];
    if (c != null) return c;
    if (++ZHC_N > 5000) { ZHC = Object.create(null); ZHC_N = 1; }
    var senses = [];
    z.replace(POS_MARK, '$1；').replace(/（[^）]*）/g, function (m) { return m.replace(/[；;，,]/g, '、'); }).split(phrase ? /[；;]/ : /[；;，,]/).forEach(function (x) {
      x = x.trim();
      var core = x.replace(/（[^）]*）|\([^)]*\)/g, '').replace(/[。．.！!]+$/, '').trim(), m = /（([^）]*)）|\(([^)]*)\)/.exec(x);
      if (core) senses.push({ core: core, note: m ? (m[1] || m[2] || '').trim() : '' });
    });
    var out;
    if (!senses.length) out = z.trim();
    else if (inSentence) out = senses[0].core;
    else {
      var a = senses[0], b = senses[1];
      if (b && a.core.indexOf(b.core) < 0 && b.core.indexOf(a.core) < 0) out = a.core + '/' + b.core;
      else out = a.core + (a.note && NOTE_KEEP.test(a.note) ? '（' + a.note + '）' : '');
    }
    return (ZHC[key] = out);
  }
  // a word's gloss from the course (the raw dictionary line) or from the bank's word lists; on its own, or inside a sentence
  function wordZh(ctx, w, inSentence) {
    var it = itemOf(ctx, 'w:' + String(w).toLowerCase());
    if (it) return zhClean(it.zh || (it.content && it.content.zh) || '', inSentence);
    var L = Bank().LISTS;
    for (var k in L) if (own.call(L, k)) for (var i = 0; i < L[k].length; i++) if (L[k][i][0].toLowerCase() === String(w).toLowerCase()) return L[k][i][1];
    return '';
  }
  // a target's short label (the offer, the end card): "rent（房租）", "sink（水槽）/ think（想）"; else Model.gloss
  function label(it, acc) {
    if (!it) return '';
    if (it.kind === 'word') { var z = zhClean(it.zh || '', true); return it.en + (z ? '（' + z + '）' : ''); }
    if (it.kind === 'pair' && it.pair) return it.pair.map(function (w, i) { var z = zhClean((it.pairZh || [])[i] || '', true); return w + (z ? '（' + z + '）' : ''); }).join('/ ');
    // a sound card as her PS question writes it (acc 'us': /ɜː/（长元音 · bird 鸟） → /ɝː/（…）)
    var g = Model().gloss(it), sh = it.kind === 'sym' ? symShow(it.ipa, acc) : '';
    return sh && sh !== it.ipa ? g.replace('/' + it.ipa + '/', '/' + sh + '/') : g;
  }
  // a space between Chinese and digits or Latin words, as elsewhere in the app (一共 13.50 英镑, 和 Ben 喝茶); dates stay 9月27日
  var ZH_TIGHT = /[㐀-鿿][A-Za-z0-9£$€]|[A-Za-z0-9%][㐀-鿿]/;
  function zhSp(s) {
    if (typeof s !== 'string' || !ZH_TIGHT.test(s)) return s;
    return s.replace(/([㐀-鿿])(?=[A-Za-z0-9£$€])/g, '$1 ').replace(/([A-Za-z0-9%])(?=[㐀-鿿])/g, '$1 ')
      .replace(/(\d) 月 (\d{1,2}) 日/g, '$1月$2日');
  }
  // the English part of a grammar stem: "She works on Monday. 这句里的 works 是？" → "She works on Monday."
  function stemEnglish(s) { var m = /^([A-Za-z][A-Za-z0-9 ,'’!?.\-]*[.!?])\s/.exec(String(s || '') + ' '); return m ? m[1].trim() : ''; }
  var SENT_CACHE = { index: null, list: null };
  // teacher sentences with their Chinese: dictation, write references, reading parse lines, grammar stems, speaking questions
  function teacherSentences(ctx) {
    if (!ctx || !ctx.index) return [];
    if (SENT_CACHE.index === ctx.index) return SENT_CACHE.list;
    var out = [];
    ctx.index.items.forEach(function (it) {
      if (it.kind === 'dict') out.push({ id: it.id, en: it.en, zh: it.zh, sk: it.home });
      else if (it.kind === 'write') out.push({ id: it.id, en: it.ref, zh: it.zh, sk: it.home });
      else if (it.kind === 'quiz') { var e = stemEnglish(it.en); if (e && it.zh && !/[\u3000-\u9fff]/.test(e) && /[\u3000-\u9fff]/.test(it.zh)) out.push({ id: it.id + '#s', en: e, zh: it.zh, sk: it.home }); }
      else if (it.kind === 'speak') out.push({ id: it.id, en: it.en, zh: it.zh, sk: it.home });
    });
    ctx.index.steps.forEach(function (si) {
      var P = si.st && si.st.passage;
      if (si.type === 'reading' && P && Array.isArray(P.parse)) P.parse.forEach(function (x, i) { if (Array.isArray(x) && x[0] && x[2]) out.push({ id: 'r:' + si.sk + ':' + i, en: String(x[0]), zh: String(x[2]), sk: si.sk }); });
    });
    SENT_CACHE = { index: ctx.index, list: out };
    return out;
  }
  function sentenceById(ctx, id) {
    var l = teacherSentences(ctx);
    for (var i = 0; i < l.length; i++) if (l[i].id === id) return l[i];
    var it = itemOf(ctx, id);
    if (it && (it.kind === 'dict' || it.kind === 'write' || it.kind === 'speak')) return { id: id, en: it.kind === 'write' ? it.ref : it.en, zh: it.zh, sk: it.home };
    if (/^w:/.test(id)) { var w = itemOf(ctx, id); if (w) return { id: id, en: w.en, zh: wordZh(ctx, w.en), zhIn: wordZh(ctx, w.en, true), sk: w.home, card: true }; }
    return null;
  }
  var WRE_C = Object.create(null), WRE_N = 0;
  function wordRe(w) {
    w = String(w);
    var c = WRE_C[w];
    if (c) { c.lastIndex = 0; return c; }
    if (++WRE_N > 5000) { WRE_C = Object.create(null); WRE_N = 1; }
    return (WRE_C[w] = new RegExp('(^|[^A-Za-z])(' + w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?=$|[^A-Za-z])', 'i'));
  }
  function sentencesWith(ctx, word, done) {
    var re = wordRe(word);
    return teacherSentences(ctx).filter(function (s) { return re.test(s.en) && (!done || done(s.sk)); });
  }

  /* ───────────────────────────── values of the slot types ───────────────────────────── */
  // info(type, v, ctx) → { en (said / written word form), digits, ord, zh, words (for the vocabulary check) }
  // zh: the Chinese shown on its own (an option, a note, a word said alone); zhIn: inside a sentence (see zhClean).
  // acc: the accent a symbol is written in ('us' | 'gb', from the plan row; see symShow)
  function info(type, v, ctx, acc) {
    var Bk = Bank(), P = Bk.PARAMS[type], U = Bk.util;
    v = String(v);
    if (type === 'pair' || type === 'word') {
      var it = itemOf(ctx, 'w:' + v.toLowerCase());
      var en = it ? it.en : v, zh = type === 'pair' ? pairZhOf(ctx, v) : wordZh(ctx, en), zhIn = type === 'pair' ? pairZhOf(ctx, v, true) : wordZh(ctx, en, true);
      var ps = Bk.PAIR_SENT[v] || Bk.PAIR_SENT[v.toLowerCase()];
      var n = Number(Bk.util.words(v).length === 1 && numValue(v));
      return { en: en, digits: isFinite(n) && n > 0 ? String(n) : en, zh: zh, zhIn: zhIn, sent: ps || null, words: U.tokens(en), ipa: it ? it.ipa : '' };
    }
    if (type === 'sym') {
      var s = itemOf(ctx, 's:' + v), ex = s && s.content && s.content.examples && s.content.examples[0], sh = symShow(v, acc) || v;
      return { en: '/' + sh + '/', digits: '/' + sh + '/', zh: s ? s.content.zh : '', ex: ex ? ex.en : '', exZh: ex ? zhClean(ex.zh) : '', exZhIn: ex ? zhClean(ex.zh, true) : '', words: [] };
    }
    if (type === 'coll') {
      var c = itemOf(ctx, v);
      return { en: c ? c.en : v, digits: c ? c.en : v, zh: c ? zhClean(c.zh, false, true) : '', zhIn: c ? zhClean(c.zh, true, true) : '', words: U.tokens(c ? c.en.replace(/…/g, ' ') : v), coll: c };
    }
    if (type === 'dsent' || type === 'xsent' || type === 'wsent' || type === 'speakq') {
      var t = sentenceById(ctx, v);
      return { en: t ? t.en : '', digits: t ? t.en : '', zh: t ? t.zh : '', zhIn: t && t.zhIn != null ? t.zhIn : undefined, words: t ? U.tokens(t.en) : [], card: t && t.card };
    }
    if (!P || !P.say) return { en: v, digits: v, zh: '', words: U.tokens(v) };
    // a parameter type's value reads the same everywhere: computed once (the count walks thousands of frames)
    var ck = type + '|' + v, hit = INFO_CACHE[ck];
    if (hit) return hit;
    return (INFO_CACHE[ck] = { en: P.say(v), digits: P.digits(v), zh: P.zh(v), words: P.words(v), ord: type === 'dom' ? U.ordDigits(v) : null });
  }
  var INFO_CACHE = {};
  // a pair word's own Chinese (the listening pairs carry theirs), else its word gloss; the raw lines kept per course index
  var PAIR_ZH = { index: null, map: null };
  function pairZhOf(ctx, w, inSentence) {
    var ix = ctx && ctx.index;
    if (ix && PAIR_ZH.index !== ix) {
      var m = {};
      ix.items.forEach(function (it) { if (it.kind === 'pair') it.pair.forEach(function (x, i) { if (!own.call(m, x) && it.pairZh && it.pairZh[i]) m[x] = it.pairZh[i]; }); });
      PAIR_ZH = { index: ix, map: m };
    }
    var raw = ix && own.call(PAIR_ZH.map, w) ? PAIR_ZH.map[w] : '';
    return raw ? zhClean(raw, inSentence) : wordZh(ctx, w, inSentence);
  }
  var NUMV = null;
  function numValue(s) {
    if (!NUMV) { NUMV = {}; var U = Bank().util; for (var i = 0; i <= 100; i++) NUMV[U.numWord(i)] = i; NUMV.hundred = 100; NUMV.thousand = 1000; NUMV.million = 1000000; }
    var t = String(s).toLowerCase().trim();
    if (own.call(NUMV, t)) return NUMV[t];
    return NaN;
  }

  /* ───────────────────────────── templates ───────────────────────────── */
  // {A} role · {x} · {x~} · {x~1} · {x#} · {x:digits|cap|sent|blank|gap|ex|s} · {x.zh} — modifiers combine: {t2~:digits}, {d~.zh}
  var TOK = /\{([A-Z])\}|\{([a-z][a-z0-9]*)(~\d?)?(#)?(?::([a-z]+))?(\.zh)?\}/g;
  function makeEnv(fr, sc, vals, dist, roles, ctx, acc) { return { fr: fr, sc: sc, vals: vals, dist: dist, roles: roles, ctx: ctx, types: fr.slots || {}, acc: acc || 'gb' }; }
  function slotInfo(env, name, dIdx) {
    var type = env.types[name];
    var v = dIdx == null ? env.vals[name] : (env.dist[name] || [])[dIdx];
    if (v == null) return null;
    return { type: type, v: v, info: info(type, v, env.ctx, env.acc) };
  }
  // fill(tpl, env, counter, zh): counter { slot: next distractor index } shared by the en and zh of one line (see line()).
  // A gloss that is the whole template ('{w.zh}') is shown on its own, inside a sentence the first sense (zhIn).
  function fill(tpl, env, counter, zhSide) {
    var whole = String(tpl).trim();
    return dayOrder(String(tpl).replace(TOK, function (all, role, name, tilde, hash, mod, dotzh) {
      if (role) { var r = env.roles[role]; return r ? r.name : role; }
      var di = null;
      if (tilde) {
        if (tilde.length > 1) di = Number(tilde.slice(1));
        else { di = counter[name] || 0; counter[name] = di + 1; }
      }
      var s = slotInfo(env, name, di);
      if (!s) return all;
      var I = s.info, zh = all === whole || I.zhIn == null ? I.zh : I.zhIn;
      if (s.type === 'weekday' && !mod && !hash) return DAY_MARK + (dotzh ? zh : I.en) + DAY_MARK;   // (see dayOrder)
      if (mod === 'sent') return I.sent ? (dotzh ? I.sent[1] : I.sent[0]) : (dotzh ? zh : I.en);
      if (mod === 'ex') return dotzh ? ((all === whole ? I.exZh : I.exZhIn) || '') : (I.ex || '');
      if (mod === 'blank' || mod === 'gap') return dotzh ? zh : blankText(env, name, s, mod);
      if (mod === 'key') return dotzh ? zh : '?0';                       // {c:key}: only the gap, in a sentence of the frame's own
      // {fl:floor.zh}: a British floor in Chinese — Maple Bridge counts from the ground floor, so the first floor is 二楼
      if (mod === 'floor') return dotzh ? Bank().util.zhNum(Number(s.v) + 1) + '楼' : I.en + ' floor';
      if (dotzh) return zh;
      if (hash) return I.ord || I.digits;
      if (mod === 'digits') return I.digits;
      if (mod === 'cap') return Bank().util.cap1(I.en);
      if (mod === 's') return thirdPerson(I.en);
      return I.en;
    }));
  }
  // the frame's own two days said together go in the week's order (on Friday and Thursday → on Thursday and Friday, 周五和周四 →
  // 周四和周五); a course sentence is said as written
  var DAY_MARK = '\u0001', DAYS_EN = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'], DAYS_ZH = '一二三四五六日';
  var DAY_PAIR_EN = new RegExp('\u0001(' + DAYS_EN.join('|') + ')\u0001 (and|or) \u0001(' + DAYS_EN.join('|') + ')\u0001', 'g');
  var DAY_PAIR_ZH = /\u0001周([一二三四五六日])\u0001(和|或)\u0001周([一二三四五六日])\u0001/g;
  function dayOrder(s) {
    if (s.indexOf(DAY_MARK) < 0) return s;
    return s.replace(DAY_PAIR_EN, function (all, a, c, b) { return DAYS_EN.indexOf(a) > DAYS_EN.indexOf(b) ? b + ' ' + c + ' ' + a : a + ' ' + c + ' ' + b; })
      .replace(DAY_PAIR_ZH, function (all, a, c, b) { return DAYS_ZH.indexOf(a) > DAYS_ZH.indexOf(b) ? '周' + b + c + '周' + a : '周' + a + c + '周' + b; })
      .split(DAY_MARK).join('');
  }
  function thirdPerson(v) { var w = String(v); if (/(s|x|ch|sh|o)$/.test(w)) return w + 'es'; if (/[^aeiou]y$/.test(w)) return w.slice(0, -1) + 'ies'; return w + 's'; }
  // {s:blank}: the sentence with the target word as blank '?0'; {c:blank}: the collocation with its key word as '___' (VC)
  // or as '?0' (VG, {c:gap})
  function blankText(env, name, s, mod) {
    if (s.type === 'coll') {
      var c = s.info.coll, key = collKey(c);
      var en = String(c ? c.en : s.v).replace(/…/g, '…');
      if (!key) return en;
      return en.replace(wordRe(key.word), function (m0, pre) { return pre + (mod === 'gap' ? '?0' : '___'); });
    }
    var w = env.vals[env.fr.pairWith ? env.fr.bind[0] : name];
    var wi = itemOf(env.ctx, 'w:' + String(w).toLowerCase());
    var word = wi ? wi.en : w;
    return String(s.info.en).replace(wordRe(word), function (m0, pre) { return pre + '?0'; });
  }
  // the word a collocation question hides: the preposition of a time / pay / from-to phrase, the verb of a verb phrase,
  // the measure word of a quantity
  var PREPS = { by: 1, in: 1, with: 1, on: 1, at: 1, to: 1, for: 1, of: 1, from: 1, after: 1 };
  function collKey(c) {
    if (!c) return null;
    var ws = String(c.en).replace(/…/g, ' ').split(/\s+/).filter(Boolean), type = c.type;
    if (type === 'pay') { for (var i = 1; i < ws.length; i++) if (PREPS[ws[i].toLowerCase()]) return { word: ws[i], i: i }; }
    if (type === 'time') { if (PREPS[ws[0].toLowerCase()]) return { word: ws[0], i: 0 }; }
    if (type === 'fromto') { for (var j = 1; j < ws.length; j++) if (ws[j].toLowerCase() === 'to') return { word: ws[j], i: j }; }
    if (type === 'qty') { if (ws.length >= 2) return { word: ws[1], i: 1 }; }
    if (type === 'rate') return { word: ws[ws.length - 1], i: ws.length - 1 };      // a month → month
    if (type === 'verb') return { word: ws[0], i: 0 };
    for (var k = 0; k < ws.length; k++) if (PREPS[ws[k].toLowerCase()]) return { word: ws[k], i: k };
    return { word: ws[0], i: 0 };
  }
  // wrong options must be wrong in the sentence (§4.7 #6): come to a class, pay with cash, a kilo of bananas are good English,
  // so they are never offered. VERB_ALT by the verb, COLL_WRONG by the whole phrase (the lead's review, 2026-09-27).
  var VERB_ALT = { have: ['go', 'do'], go: ['do', 'make'], call: ['say', 'talk'], relax: ['do', 'make'], get: ['make', 'do'], take: ['go', 'read'], apply: ['make', 'give'],
    look: ['see', 'give'], pay: ['buy', 'give'], be: ['do', 'have'] };
  var COLL_WRONG = { 'a kilo of': ['bunch', 'pot'], 'a bunch of': ['cup', 'pot'], 'pay by card': ['in', 'at'], 'pay in cash': ['by', 'at'], 'in cash': ['by', 'at'],
    'by card': ['in', 'at'], 'have a discount': ['make', 'do'], 'have dinner together': ['take', 'go'], 'have lunch with': ['take', 'go'], 'have an interview': ['make', 'go'] };

  /* ───────────────────────────── realizing a frame (item) ───────────────────────────── */
  function doneSet(ctx) {
    if (ctx._done) return ctx._done;
    var cp = (ctx.host && ctx.host.profile && ctx.host.profile.cp) || (ctx.profile && ctx.profile.cp) || {}, asOf = ctx.asOf, s = {};
    Object.keys(cp).forEach(function (k) { if (typeof cp[k] === 'string' && (!asOf || cp[k] < asOf)) s[k] = 1; });
    ctx._done = s;
    return s;
  }
  // the latest course week she has studied in (a completed step before today): 'week:N' needs (§4.3 "第 2 周"、"第 7 周")
  function weekReached(ctx) {
    var d = doneSet(ctx), n = 0;
    if (ctx._wk != null && ctx._wkd === d) return ctx._wk;
    if (ctx.index && ctx.index.weeks) ctx.index.weeks.forEach(function (w) {
      if (!(w.n > n)) return;
      var hit = (w.days || []).some(function (dayId) { var di = ctx.index.days.get(dayId); return di && di.steps.some(function (sk) { return d[sk]; }); });
      if (hit) n = w.n;
    });
    ctx._wk = n; ctx._wkd = d;
    return n;
  }
  function needsMet(ctx, sc, fr, sub) {
    var d = doneSet(ctx);
    // the same frame is asked about hundreds of times while a paper is planned: remembered per done-set
    var c = ctx._nmc;
    if (!c || c.d !== d) c = ctx._nmc = { d: d, m: typeof Map === 'function' ? new Map() : null };
    var key = sub || fr;
    if (c.m && c.m.has(key) && c.m.get(key).sc === sc) return c.m.get(key).ok;
    var ok = (sc.needs || []).concat(fr.needs || [], (sub && sub.needs) || []).every(function (k) {
      var m = /^week:(\d+)$/.exec(k);
      return m ? weekReached(ctx) >= Number(m[1]) : d[k];
    });
    if (c.m) c.m.set(key, { sc: sc, ok: ok });
    return ok;
  }
  function known(ctx, w) { var v = ctx.vocab; if (!v) return true; return Bank().isKnown(v.known, w); }
  function valueOk(ctx, type, v, glossWords) {
    var I = info(type, v, ctx);
    return I.words.every(function (w) { return known(ctx, w) || (glossWords && glossWords[w]); });
  }
  // which values a slot may take for a target item (§4.5 step 1: w:october → month 'october'; w:quarter → a time said with "quarter")
  function valuesForTarget(type, t, ctx) {
    var Bk = Bank(), P = Bk.PARAMS[type];
    if (!t) return [];
    if (t.kind === 'pair') return type === 'pair' ? t.pair.slice() : [];
    if (t.kind === 'sym') return type === 'sym' && symAsk(ctx, t.ipa, accentOf(ctx)) ? [t.ipa] : [];
    if (t.kind === 'coll') return type === 'coll' ? [t.id] : [];
    if (t.kind === 'dict') return type === 'dsent' || type === 'wsent' ? [t.id] : [];
    if (t.kind === 'write') return type === 'xsent' ? [t.id] : [];
    if (t.kind === 'speak') return type === 'speakq' ? [t.id] : [];
    if (t.kind !== 'word') return [];
    var w = String(t.en).toLowerCase();
    if (type === 'word') return [w];
    if (type === 'pair') return Bk.PAIR_SENT[w] || numValue(w) >= 13 ? [w] : [];
    if (!P || !P.vals) return [];
    if (type === 'weekday' || type === 'month') return P.vals().indexOf(w) >= 0 ? [w] : [];
    var vk = type + '|' + w;
    if (VFT_CACHE[vk]) return VFT_CACHE[vk].slice();
    var out = P.list ? P.vals().filter(function (x) { return x.toLowerCase() === w; })
      : P.vals().filter(function (x) { return Bk.util.tokens(info(type, x, ctx).en).indexOf(w) >= 0; });
    VFT_CACHE[vk] = out;
    return out.slice();
  }
  var VFT_CACHE = {};
  function frameGloss(sc, fr, sub) {
    var g = {};
    [sc.gloss, fr.glossAdd, sub && sub.glossAdd].forEach(function (o) { if (isObj(o)) Object.keys(o).forEach(function (k) { g[k] = o[k]; }); });
    return g;
  }
  function glossWordSet(g) { var s = {}; Object.keys(g).forEach(function (k) { Bank().util.tokens(k).forEach(function (w) { s[w] = 1; }); s[k.toLowerCase()] = 1; }); return s; }
  // derived slots: prev / next weekday, span (days from a to b inclusive), tt (teen ↔ ty), sum (of prices), mul (hours × pay), rest (100 minus the others: a survey's percentages), half (of a price: splitting a bill)
  function derive(fn, args, vals) {
    var WDs = Bank().WEEKDAYS;
    if (fn === 'prev' || fn === 'next') { var i = WDs.indexOf(vals[args[0]]); if (i < 0) return null; return WDs[(i + (fn === 'next' ? 1 : 6)) % 7]; }
    if (fn === 'span') { var a = WDs.indexOf(vals[args[0]]), b = WDs.indexOf(vals[args[1]]); if (a < 0 || b < 0) return null; return String((b - a + 7) % 7 + 1); }
    if (fn === 'tt') { var n = Number(vals[args[0]]); var tt = { 13: 30, 30: 13, 14: 40, 40: 14, 15: 50, 50: 15, 16: 60, 60: 16, 17: 70, 70: 17, 18: 80, 80: 18, 19: 90, 90: 19 }; return tt[n] != null ? String(tt[n]) : null; }
    if (fn === 'sum') { var sv = 0; for (var ai = 0; ai < args.length; ai++) { var av = Number(vals[args[ai]]); if (!(av >= 0)) return null; sv += av; } sv = Math.round(sv * 100) / 100; return sv === Math.floor(sv) ? String(sv) : sv.toFixed(2); }
    if (fn === 'mul') { var mv = Number(vals[args[0]]) * Number(vals[args[1]]); if (!(mv >= 0)) return null; mv = Math.round(mv * 100) / 100; return mv === Math.floor(mv) ? String(mv) : mv.toFixed(2); }
    if (fn === 'rest') { var rv = 100; for (var ri = 0; ri < args.length; ri++) { var x0 = Number(vals[args[ri]]); if (!(x0 >= 0)) return null; rv -= x0; } return rv > 0 ? String(rv) : null; }
    if (fn === 'half') { var x = Number(vals[args[0]]); if (!(x > 0)) return null; var hv = x / 2; return hv === Math.floor(hv) ? String(hv) : hv.toFixed(2); }
    return null;
  }
  // how many distractors each slot needs: {x~} occurrences per template group, and explicit {x~k}
  function distNeeds(fr, sub, altIdx) {
    var need = {};
    function scan(tpls) {
      var cnt = {};
      tpls.forEach(function (t) {
        String(t).replace(TOK, function (all, role, name, tilde) {
          if (!tilde) return all;
          if (tilde.length > 1) need[name] = Math.max(need[name] || 0, Number(tilde.slice(1)) + 1);
          else { cnt[name] = (cnt[name] || 0) + 1; need[name] = Math.max(need[name] || 0, cnt[name]); }
          return all;
        });
      });
    }
    var lines = fr.alt ? fr.alt[altIdx || 0] || [] : fr.say || [];
    if (fr.msgFromAlt) lines = (fr.say || []).concat(lines);
    scan(lines.map(function (l) { return l[1]; }));
    if (fr.text) scan(fr.text.lines.map(function (l) { return l[0]; }));
    if (fr.msg) scan([fr.msg[1]]);
    var q = sub || fr;
    if (q.opts) scan(q.opts.map(function (o) { return String(o).split('|')[0]; }));
    if (q.stmt) scan([q.stmt.en]);
    if (q.q && q.q.en) scan([q.q.en]);
    if (fr.stmts) fr.stmts.forEach(function (s) { scan([s.en]); });
    return need;
  }
  function hasTurn(lines) { return (lines || []).some(function (l) { return /\{[a-z][a-z0-9]*~/.test(l[1]); }); }
  // altFit: one regular expression per wording (or none: any target), tested on the bound value — a collocation as
  // 'type:text' ('verb:have lunch with'), anything else as its English — so a sentence is only built around a phrase it fits
  function altFitText(fr, vals, types, ctx) {
    var s = (fr.bind || [])[0], v = s != null ? vals[s] : null;
    if (v == null) return '';
    if (types[s] === 'coll') { var c = itemOf(ctx, v); return c ? (c.type || '') + ':' + c.en : String(v); }
    return info(types[s], v, ctx).en;
  }
  function altFits(fr, i, text) { var re = fr.altFit && fr.altFit[i]; return !re || new RegExp(re, 'i').test(text); }
  function frameSubItem(fr, j) { return fr.items ? fr.items[j] || null : null; }

  /**
   * realize(sc, fr, spec, ctx, seed) → params (object) | null: every slot value, role name, wording, distractors and the
   * option order, chosen once from the seed. The item is then render(row).
   */
  function realize(sc, fr, spec, ctx, seed) {
    var r = rng(seed), Bk = Bank(), types = fr.slots || {}, vals = {}, p = {};
    var tgt = spec.targetItem, also = spec.alsoItem;
    // which question of a multi-question frame
    var j = null, sub = null;
    if (fr.items) {
      var js = [];
      fr.items.forEach(function (q, qi) {
        if (spec.fmt && (q.f || fr.f) !== spec.fmt) return;
        if (spec.j != null && qi !== spec.j) return;
        if (spec.concept && q.concept !== spec.concept && !(spec.concept && !q.concept && fr.concept === spec.concept)) return;
        if (tgt && !spec.concept && tgt.kind !== 'quiz' && tgt.kind !== 'read') {
          var on = q.on;
          if (!on || !types[on] || valuesForTarget(types[on], tgt, ctx).length === 0) return;
        }
        if (!tgt && spec.subs && spec.subs.length && (q.subs || []).indexOf(spec.subs[0]) < 0 && (fr.subs || []).indexOf(spec.subs[0]) < 0) return;
        js.push(qi);
      });
      if (!js.length) return null;
      j = pick(js, r);
      sub = fr.items[j];
    }
    var glossW = glossWordSet(frameGloss(sc, fr, sub));
    // a question Claude wrote keeps its own values (§6.3: 参数不再变)
    if (isObj(fr.fixed)) Object.keys(fr.fixed).forEach(function (s0) { vals[s0] = fr.fixed[s0]; });
    // bind the targets (§4.5 step 2)
    var bound = {};
    var bindSlots = (sub && sub.on && (fr.bind || []).indexOf(sub.on) < 0 ? [sub.on] : []).concat(fr.bind || []);
    if (sub && sub.on) bindSlots = [sub.on].concat((fr.bind || []).filter(function (x) { return x !== sub.on; }));
    function bindOne(t) {
      if (!t) return true;
      for (var i = 0; i < bindSlots.length; i++) {
        var s = bindSlots[i];
        if (bound[s] || !types[s]) continue;
        if (fr.fixed && own.call(fr.fixed, s)) { if (valuesForTarget(types[s], t, ctx).indexOf(String(fr.fixed[s])) < 0) continue; bound[s] = t.id; return true; }
        var cand = valuesForTarget(types[s], t, ctx).filter(function (v) { return allowed(fr, s, v, sub); });
        if (fr.sentOf === s) cand = cand.filter(function (v) { return !!info(types[s], v, ctx).sent; });
        if (!cand.length) continue;
        vals[s] = pick(cand, r);
        bound[s] = t.id;
        return true;
      }
      return false;
    }
    if (tgt && tgt.kind !== 'quiz' && tgt.kind !== 'read') { if (!bindOne(tgt)) return null; }
    if (also && !bindOne(also)) return null;
    // a sentence that holds the target word (generic frames: pairWith)
    if (fr.pairWith && vals[fr.bind[0]] != null) {
      var w = vals[fr.bind[0]], wi = itemOf(ctx, 'w:' + w), word = wi ? wi.en : w;
      var ss = sentencesWith(ctx, word, function (sk) { return doneSet(ctx)[sk]; });
      if (!ss.length && wi && !fr.sent) ss = [{ id: wi.id, en: wi.en, zh: wordZh(ctx, wi.en), card: true }];
      if (!ss.length) return null;
      vals[fr.pairWith] = pick(ss, r).id;
    }
    // the calendar: weekday + month + day of month on one real date 3–60 days ahead (§4.5 step 3)
    var calSlots = fr.cal || [];
    if (calSlots.length) {
      var want = {}, maxDom = null;
      calSlots.forEach(function (s) {
        var t = types[s];
        if (t === 'weekday') want.weekday = vals[s] != null ? vals[s] : listOnly(fr, s, sub);
        if (t === 'month') want.month = vals[s] != null ? vals[s] : listOnly(fr, s, sub);
      });
      var cands = calCandidates(ctx.asOf, want).filter(function (d) {
        var dp = dateParts(d);
        return calSlots.every(function (s) { var t = types[s], v = t === 'weekday' ? dp.weekday : t === 'month' ? dp.month : dp.dom; return allowed(fr, s, v, sub); });
      });
      if (maxDom) cands = cands.filter(function (d) { return Number(d.slice(8, 10)) <= maxDom; });
      if (!cands.length) return null;
      var date = pick(cands, r), dp = dateParts(date);
      calSlots.forEach(function (s) { var t = types[s]; vals[s] = t === 'weekday' ? dp.weekday : t === 'month' ? dp.month : dp.dom; });
      p.yr = dp.year;
    }
    // the other slots: fresh values she knows, different from each other within a group (§4.5 step 3)
    var derived = fr.derive || {};
    Object.keys(types).forEach(function (s) {
      if (vals[s] != null || derived[s]) return;
      var P = Bk.PARAMS[types[s]];
      if (!P || !P.vals) {
        if (types[s] === 'word' || types[s] === 'pair' || types[s] === 'sym' || /sent$|speakq|coll/.test(types[s])) {
          // a free word / pair / sentence obeys the frame's only / not lists too (a price stall hears fifteen|fifty, not fool|full)
          var pool = freeTargets(types[s], ctx, fr, s, sub).filter(function (v) { return allowed(fr, s, v, sub) && distinctOk(fr, s, v, vals); });
          if (!pool.length) { vals[s] = null; return; }
          vals[s] = pick(pool, r);
        }
        return;
      }
      var cand = P.vals().filter(function (v) { return allowed(fr, s, v, sub) && valueOk(ctx, types[s], v, glossW) && distinctOk(fr, s, v, vals); });
      if (!cand.length) { vals[s] = null; return; }
      vals[s] = pick(cand, r);
    });
    Object.keys(derived).forEach(function (s) { var d = derived[s]; vals[s] = derive(d[0], d.slice(1), vals); });
    // a frame that says its word inside a sentence (sentOf: LP 句中) needs a word that has one (PAIR_SENT)
    if (fr.sentOf && vals[fr.sentOf] != null && !info(types[fr.sentOf], vals[fr.sentOf], ctx).sent) return null;
    // derived weekday slots that are also free: re-derive the base from the target (prev of a bound "tomorrow")
    for (var s0 in types) if (own.call(types, s0) && vals[s0] == null && !(fr.optional && fr.optional.indexOf(s0) >= 0)) return null;
    for (var s1 in derived) if (own.call(derived, s1) && !allowed(fr, s1, vals[s1], sub)) return null;
    // wording (§4.4 alt): a wording written for some targets only (altFit) is used for them only; for L-turn prefer the
    // wordings with a correction
    var alts = fr.alt ? fr.alt.map(function (a, i) { return i; }) : [0];
    if (fr.alt && fr.altFit) {
      var fitT = altFitText(fr, vals, types, ctx);
      alts = alts.filter(function (i) { return altFits(fr, i, fitT); });
      if (!alts.length || (spec.alt != null && alts.indexOf(spec.alt) < 0)) return null;
    }
    if (fr.alt && spec.subs && spec.subs.indexOf('L-turn') >= 0) { var tu = alts.filter(function (i) { return hasTurn(fr.alt[i]); }); if (tu.length) alts = tu; }
    if (fr.alt && spec.alt != null && alts.indexOf(spec.alt) >= 0) alts = [spec.alt];
    var ai = pick(alts, r);
    if (fr.alt) p['@'] = String(ai);
    // distractors (§4.7): confusion groups first, then the same type; never the answer, never a paraphrase, never
    // another slot's value the frame says to avoid
    var need = distNeeds(fr, sub, ai), dist = {};
    for (var dn in need) {
      if (!own.call(need, dn)) continue;
      var list = distractors(types[dn], vals[dn], fr, dn, vals, ctx, glossW, r, sub), pi = types[dn] === 'pair' && tgt && tgt.kind === 'pair' ? tgt.pair.indexOf(vals[dn]) : -1, m2 = pi >= 0 ? tgt.pair[1 - pi] : '';
      if (m2 && allowed(fr, dn, m2, sub) && known(ctx, m2)) list = [m2].concat(list.filter(function (x) { return x !== m2; }));
      if (list.length < need[dn]) return null;
      dist[dn] = list.slice(0, need[dn]);
      p[dn + '~'] = dist[dn].join(',');
    }
    // roles: one-time names from the pool (not used in her last 3 sessions, not twice in one session, and two people of one
    // scene never share a name: a second pick only when the first one is taken, so the other scenes draw as before)
    var roles = {}, taken = {};
    Object.keys(sc.roles || {}).forEach(function (k) {
      var v = sc.roles[k];
      if (v === '@pool') {
        var avoid = {};
        (ctx.recentNames || []).concat(spec.usedNames || []).forEach(function (n) { avoid[n] = 1; });
        var names = Bk.NAMES.filter(function (n) { return !avoid[n.name]; });
        if (spec.accent) { var acc = names.filter(function (n) { return n.voice === spec.accent; }); if (acc.length) names = acc; }
        if (!names.length) names = Bk.NAMES;
        var nm = pick(names, r).name;
        if (taken[nm]) {
          var free = names.filter(function (n) { return !taken[n.name]; });
          if (!free.length) free = Bk.NAMES.filter(function (n) { return !taken[n.name]; });
          if (free.length) nm = pick(free, r).name;
        }
        taken[nm] = 1;
        p[k] = nm;
        roles[k] = nm;
      } else if (v) { p[k] = v; roles[k] = v; }
    });
    // slot values into the row, in the frame's slot order; a symbol question keeps the accent it is asked in
    Object.keys(types).forEach(function (s) { if (vals[s] != null) p[s] = String(vals[s]); });
    if (Object.keys(types).some(function (s) { return types[s] === 'sym'; })) p.ac = accentOf(ctx);
    if (j != null) p.j = String(j);
    if (spec.lv) p.lv = String(spec.lv);
    // option order (A, B, C shuffled by the seed)
    var q = sub || fr, n = optCount(q, fr);
    if (n > 1 && (q.f || fr.f) !== 'LM') p.o = shuffled(range(n), r).join(',');       // a plan's letters stay in A–F order
    // order tiles (GR)
    if ((sub ? sub.f : fr.f) === 'GR' && vals[fr.bind[0]]) {
      var gs = sentenceById(ctx, vals[fr.bind[0]]), gn = gs ? tapTiles(gs.en).length : 0;
      if (gn > 1) { var perm = shuffled(range(gn), r); if (perm.every(function (x, i) { return x === i; })) perm.push(perm.shift()); p.t = perm.join(','); }
    }
    return p;
  }
  function range(n) { var a = []; for (var i = 0; i < n; i++) a.push(i); return a; }
  function optCount(q, fr) { if (q.opts) return q.opts.length; if (fr.collOpts) return 3; return 0; }
  function listOnly(fr, s, sub) { var o = (sub && sub.only && sub.only[s]) || (fr.only && fr.only[s]); return o ? o.slice() : undefined; }
  // only / not lists: a value, or for a pair slot the pair's key ('cap|cup' allows either word said)
  function listHas(list, v) { v = String(v); return list.indexOf(v) >= 0 || list.some(function (o) { return o.indexOf('|') > 0 && o.split('|').indexOf(v) >= 0; }); }
  function allowed(fr, s, v, sub) {
    if (v == null) return false;
    var only = (sub && sub.only && sub.only[s]) || (fr.only && fr.only[s]);
    if (only && !listHas(only, v)) return false;
    var not = (sub && sub.not && sub.not[s]) || (fr.not && fr.not[s]);
    if (not && listHas(not, v)) return false;
    return true;
  }
  function distinctOk(fr, s, v, vals) {
    return (fr.distinct || []).every(function (g) { if (g.indexOf(s) < 0) return true; return g.every(function (o) { return o === s || vals[o] == null || String(vals[o]) !== String(v); }); });
  }
  function freeTargets(type, ctx, fr, s, sub) {
    var out = [], L = ctx.learned;
    if (type === 'speakq' || type === 'dsent' || type === 'xsent') {
      var kind = type === 'speakq' ? 'speak' : type === 'dsent' ? 'dict' : 'write';
      if (ctx.index) ctx.index.items.forEach(function (it, id) { if (it.kind === kind && (!L || L.has(id)) && fitOk(fr, it)) out.push(id); });
      return out;
    }
    if (type === 'pair' && ctx.index) { ctx.index.items.forEach(function (it, id) { if (it.kind === 'pair' && (!L || L.has(id))) out.push(it.pair[0], it.pair[1]); }); return out; }
    return out;
  }
  function fitOk(fr, it) { if (!fr.fit) return true; var ref = it.kind === 'write' ? it.ref : it.en; return new RegExp(fr.fit, 'i').test(ref || ''); }
  function paraOf(v) {
    var out = {}, s = String(v).toLowerCase();
    Bank().PARA.forEach(function (g) { var l = g.map(function (x) { return x.toLowerCase(); }); if (l.indexOf(s) >= 0) l.forEach(function (x) { out[x] = 1; }); });
    return out;
  }
  function distractors(type, v, fr, s, vals, ctx, glossW, r, sub) {
    var Bk = Bank(), P = Bk.PARAMS[type], out = [], seen = {};
    seen[String(v)] = 1;
    (((sub && sub.avoid) || fr.avoid || {})[s] || []).forEach(function (o) { if (vals[o] != null) seen[String(vals[o])] = 1; });
    var dOnly = ((sub && sub.dOnly) || fr.dOnly || {})[s];                      // plausible distractors only (quiet ↔ noisy, not "married")
    var para = paraOf(info(type, v, ctx).en);
    function add(x) {
      if (x == null) return;
      x = String(x);
      if (seen[x]) return;
      if (dOnly && !listHas(dOnly, x)) return;
      if (type === 'word' && sameLemma(x, v)) return;                         // child is not a distractor of children
      if (type !== 'pair' && type !== 'word' && type !== 'sym' && P && P.vals && P.vals().indexOf(x) < 0 && type !== 'count' && type !== 'price' && type !== 'time' && type !== 'dom') return;
      var I = info(type, x, ctx);
      if (para[String(I.en).toLowerCase()]) return;
      if (!I.words.every(function (w) { return known(ctx, w) || glossW[w]; })) return;
      seen[x] = 1;
      out.push(x);
    }
    if (type === 'pair') {
      var it = null;
      if (ctx.index) ctx.index.items.forEach(function (x) { if (!it && x.kind === 'pair' && x.pair.indexOf(v) >= 0) it = x; });
      if (it) add(it.pair[0] === v ? it.pair[1] : it.pair[0]);
      Bk.util.confuse('teenty', v).forEach(add);
      return out;
    }
    if (type === 'sym') {
      var fam = symFamily(v), acc = accentOf(ctx);
      shuffled(fam, r).forEach(function (y) { if (itemOf(ctx, 's:' + y) && !symClash(ctx, y, v, acc)) add(y); });
      return out;
    }
    if (type === 'word') {
      var wi = itemOf(ctx, 'w:' + v), same = [];
      if (wi && ctx.index) ctx.index.items.forEach(function (x) { if (x.kind === 'word' && x.home === wi.home && x.id !== wi.id && (!ctx.learned || ctx.learned.has(x.id))) same.push(x.en.toLowerCase()); });
      var conf = [];
      ['weekday', 'month', 'teenty', 'vowel', 'consonant'].forEach(function (c) { conf = conf.concat(Bk.util.confuse(c, v)); });
      conf.forEach(add);
      shuffled(same, r).forEach(add);
      return out;
    }
    if (!P || !P.dist) return out;
    var d = P.dist(String(v)), confs = [], rest = [];
    var cls = type === 'weekday' ? 'weekday' : type === 'month' ? 'month' : type === 'teenty' ? 'teenty' : null;
    var cset = {};
    if (cls) Bk.util.confuse(cls, String(v)).forEach(function (x) { cset[x] = 1; });
    d.forEach(function (x) { if (cset[x] || type === 'time' || type === 'price' || type === 'teenty') confs.push(x); else rest.push(x); });
    confs.forEach(add);
    shuffled(rest, r).forEach(add);
    return out;
  }
  var IRR_PL = { child: 'children', man: 'men', woman: 'women', person: 'people', foot: 'feet', tooth: 'teeth', wife: 'wives', life: 'lives' };
  function sameLemma(a, b) {
    a = String(a).toLowerCase(); b = String(b).toLowerCase();
    if (a === b || IRR_PL[a] === b || IRR_PL[b] === a) return true;
    return Bank().stems(a).indexOf(b) >= 0 || Bank().stems(b).indexOf(a) >= 0;
  }
  var SYM_FAM = [['iː', 'ɪ', 'e', 'æ', 'ɑː', 'ʌ', 'ɒ', 'ɔː', 'ʊ', 'uː', 'ɜː', 'ə'], ['eɪ', 'aɪ', 'ɔɪ', 'aʊ', 'əʊ', 'ɪə', 'eə', 'ʊə'],
    ['p', 'b', 't', 'd', 'k', 'ɡ', 'f', 'v', 'θ', 'ð', 's', 'z', 'ʃ', 'ʒ', 'h', 'r', 'tʃ', 'dʒ', 'tr', 'dr', 'ts', 'dz', 'm', 'n', 'ŋ', 'l', 'w', 'j']];
  var SYM_NEAR = { 'iː': ['ɪ'], 'ɪ': ['iː', 'e'], 'e': ['æ', 'ɪ'], 'æ': ['e', 'ʌ'], 'ɑː': ['ʌ'], 'ʌ': ['ɑː', 'æ'], 'ɒ': ['ɔː', 'ʌ'], 'ɔː': ['ɒ'], 'ʊ': ['uː'], 'uː': ['ʊ'], 'ɜː': ['e', 'ɔː'], 'ə': ['ʌ'],
    'eɪ': ['e', 'aɪ'], 'əʊ': ['ɔː'], 'θ': ['s', 'f'], 'ð': ['d', 'z'], 'v': ['w', 'f'], 'w': ['v'], 'r': ['l'], 'l': ['r', 'n'], 'ʃ': ['s'], 's': ['ʃ', 'θ'], 'n': ['ŋ'], 'ŋ': ['n'] };
  function symFamily(v) {
    var near = SYM_NEAR[v] || [], fam = [];
    SYM_FAM.forEach(function (g) { if (g.indexOf(v) >= 0) fam = g.filter(function (x) { return x !== v; }); });
    return near.concat(fam.filter(function (x) { return near.indexOf(x) < 0; }));
  }
  /* ── her accent on a symbol question (PS; the lead's review, 2026-09-27): the host's accentOf(), anything but 'gb' is
   * American: symbols as the host's SYM_US writes them (bird /ɝː/, go /oʊ/), never /ɒ/ (hot is /hɑːt/). The accent is in the
   * plan row (ac=); a row planned before has none and stays British, as it was asked. */
  function accentOf(ctx) {
    var a = ctx && (ctx.accent || (ctx.host && ctx.host.profile && ctx.host.profile.accent) || (ctx.profile && ctx.profile.accent));
    return a === 'gb' ? 'gb' : 'us';
  }
  // a symbol as that accent writes it; '' = that accent has no such sound
  function symShow(v, acc) { var U = Bank().SYM_US; return acc === 'us' && own.call(U, v) ? U[v] : v; }
  // the IPA of a symbol card's example word (the first, the one a PS option shows) in that accent (the host's US_IPA)
  function symExIpa(ctx, v, acc) {
    var s = itemOf(ctx, 's:' + v), ex = s && s.content && s.content.examples && s.content.examples[0];
    if (!ex) return '';
    var U = Bank().EX_US;
    return acc === 'us' && own.call(U, ex.en) ? U[ex.en] : String(ex.ipa || '');
  }
  // v can be asked in this accent: the sound exists there and the card's example word has it
  function symAsk(ctx, v, acc) { var sh = symShow(v, acc); return !!sh && symExIpa(ctx, v, acc).indexOf(sh) >= 0; }
  // another card's example word is no wrong option when it has the asked sound too (American hot /hɑːt/, cats /s/)
  function symClash(ctx, y, v, acc) { var sh = symShow(v, acc); return !sh || symExIpa(ctx, y, acc).indexOf(sh) >= 0; }

  /* ───────────────────────────── render: plan row → ExamItem (§4.5 step 6) ───────────────────────────── */
  var LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'];
  function findFrame(sceneId, k, ctx) {
    if (/^ai-/.test(sceneId) && ctx && ctx.scDocs) {
      var sc = aiScene(ctx.scDocs, sceneId);
      if (!sc) return null;
      for (var i = 0; i < sc.frames.length; i++) if (sc.frames[i].k === k) return { scene: sc, frame: sc.frames[i] };
      return null;
    }
    return Bank().frameOf(sceneId, k);
  }
  // exam-sc-<h6> → the scene 'ai-<h6>' (§6.3), converted once per document and kept by the document's JSON text
  var AI_CACHE = {};
  function aiScene(docs, id) {
    var d = docs && (docs['exam-sc-' + String(id).slice(3)] || docs[String(id).slice(3)]);
    if (!isObj(d) || !isObj(d.json)) return null;
    var key = id + '|' + JSON.stringify(d.json);
    if (!own.call(AI_CACHE, key)) { var sc = null; try { sc = aiSceneOf(d.json, id); } catch (e) { sc = null; } AI_CACHE[key] = sc; }
    return AI_CACHE[key];
  }
  function aiScenes(ctx) {
    var docs = ctx && ctx.scDocs, out = [];
    if (!docs) return out;
    Object.keys(docs).forEach(function (k) {
      var m = /^(?:exam-sc-)?([0-9a-z]{6})$/.exec(k);
      if (!m || !isObj(docs[k]) || !isObj(docs[k].json)) return;
      var sc = aiScene(docs, 'ai-' + m[1]);
      if (sc && (sc.tier || 1) <= Math.max(tierOf(ctx), 1)) out.push(sc);
    });
    return out;
  }
  function tierOf(ctx) { return (ctx && ctx.tier) || 1; }
  /**
   * render(row, ctx) → ExamItem | null. ctx = { index (course content), scDocs?, tier? }; everything else comes from the
   * row: the same row always gives the same item (§7.1 plan rows, §10.8 determinism).
   */
  function render(row, ctx) {
    if (!Array.isArray(row) || row.length < 7) return null;
    ctx = ctx || {};
    var f = findFrame(row[2], row[3], ctx);
    if (!f) return null;
    var sc = f.scene, fr = f.frame, p = parseParams(row[6]), Bk = Bank(), types = fr.slots || {};
    var j = p.j != null ? Number(p.j) : null, sub = j != null ? frameSubItem(fr, j) : null;
    if (fr.items && !sub) return null;
    var fmt = row[1];
    var FM = Bk.FORMATS[fmt];
    if (!FM) return null;
    var q = sub || fr;
    // slot values and distractors from the row
    var vals = {}, dist = {};
    Object.keys(types).forEach(function (s) { if (p[s] != null) vals[s] = p[s]; });
    Object.keys(p).forEach(function (k) { if (/~$/.test(k)) dist[k.slice(0, -1)] = p[k].split(','); });
    var roles = {}, rolesOut = {}, accentSeen = {};
    var roleKeys = Object.keys(sc.roles || {});
    function roleInfo(key) {
      var castId = p[key] != null ? p[key] : (sc.roles || {})[key] || key, c = Bk.CAST[castId];
      if (key === 'you' || castId === 'you') return { name: 'You', voice: null, cast: null };
      if (c) return { name: c.name, voice: c.voice, cast: c.id };
      var n = null;
      Bk.NAMES.forEach(function (x) { if (x.name === castId) n = x; });
      return { name: castId, voice: n ? n.voice : 'gb', cast: null };
    }
    roleKeys.forEach(function (k) { roles[k] = roleInfo(k); });
    var env = makeEnv(fr, sc, vals, dist, roles, ctx, p.ac === 'us' ? 'us' : 'gb');
    // a line's speaker key: a role letter, a cast id or 'you'
    function speaker(k) {
      if (roles[k]) return k;
      if (Bk.CAST[k]) { if (!roles[k]) roles[k] = { name: Bk.CAST[k].name, voice: Bk.CAST[k].voice, cast: k }; return k; }
      if (k === 'you') { roles.you = { name: 'You', voice: null, cast: null }; return 'you'; }
      return k;
    }
    var ai = p['@'] != null ? Number(p['@']) : 0;
    var srcLines = fr.alt && !fr.msgFromAlt ? fr.alt[ai] || fr.alt[0] : fr.say;
    var msgSrc = fr.msgFromAlt && fr.alt ? (fr.alt[ai] || fr.alt[0])[0] : fr.msg;
    var sayCounter = {}, say = null;
    if (srcLines) {
      say = srcLines.map(function (l) { var start = clone(sayCounter), en = fill(l[1], env, sayCounter, false), zh = fill(l[2] || '', env, start, true); return [speaker(l[0]), en, zh]; });
    }
    // roles used in this item → voices (same accent twice: the second speaker gets the other voice, alt 1)
    var used = {};
    (say || []).forEach(function (l) { used[l[0]] = 1; });
    if (msgSrc) used[speaker(msgSrc[0])] = 1;
    Object.keys(roles).forEach(function (k) {
      if (!used[k] && !(msgSrc && speaker(msgSrc[0]) === k)) return;
      var v = roles[k].voice, a = 0;
      if (v) { a = accentSeen[v] ? 1 : 0; accentSeen[v] = 1; }
      rolesOut[k] = { name: roles[k].name, voice: v || 'us', alt: a };
      // who this is, in Chinese (E2's CONTRACT-REQUEST 3): a cast member's role; 'you' is 你; a one-time name has none
      var cm = roles[k].cast && Bk.CAST[roles[k].cast];
      if (cm) rolesOut[k].zh = cm.role; else if (k === 'you' || roles[k].name === 'You') rolesOut[k].zh = '你';
    });
    // turn: a distractor said in the audio, then the right value (§4.6 #10)
    var turn = null;
    if (srcLines) srcLines.some(function (l) {
      var m = /\{([a-z][a-z0-9]*)~/.exec(l[1]);
      if (m && dist[m[1]]) { turn = { slot: m[1], wrong: info(types[m[1]], dist[m[1]][0], ctx).en }; return true; }
      return false;
    });
    // blanks: '?x' in form / notes cells and messages
    var blanks = [], blankOf = {};
    function blankFor(s) {
      if (blankOf[s] != null) return blankOf[s];
      var type = types[s], v = vals[s], I = info(type, v, ctx), kind = blankKind(type);
      var want = kind === 'word' ? I.en : kind === 'time' ? I.digits.replace(/ (am|pm)$/, '') : kind === 'price' ? I.digits.replace(/^£/, '') : kind === 'dom' ? I.ord : I.digits;
      var accept = [];
      if (kind === 'word') accept = [I.en];
      else if (kind === 'time') accept = [I.digits, I.digits.replace('.', ':'), want.replace('.', ':')];
      else if (kind === 'price') accept = [I.digits, want];
      else if (kind === 'dom') accept = [String(v), I.en];
      else accept = [String(v), I.en];
      var main = row[4] && boundSlot(row, fr, sub, ctx, 'main') === s ? row[4] : row[5] && boundSlot(row, fr, sub, ctx, 'also') === s ? row[5] : '';
      var ielts = !!Bk.IELTS_FMT[fmt];
      var b = { k: String(blanks.length), slot: s, want: want, accept: uniq(accept), num: kind !== 'word', kind: kind, main: main || '' };
      var lim = (sub && sub.limit) || fr.limit || FM.limit;
      if (lim && ielts) b.limit = clone(lim);
      if (fmt === 'VS') { var wIt = itemOf(ctx, 'w:' + String(v).toLowerCase()); b.ipa = (wIt && wIt.ipa) || I.ipa || ''; }
      blankOf[s] = b.k;
      blanks.push(b);
      return b.k;
    }
    function withBlanks(s, zhSide) {
      return String(s).replace(/(£?)\?([a-z][a-z0-9]*)/g, function (all, pre, name) {
        if (!types[name]) return all;
        if (zhSide) return '____';
        var k = blankFor(name);
        if (pre) blanks[Number(k)].pre = pre;
        return (pre || '') + '?' + k;
      });
    }
    // '{w:blank}' / '{s:blank}' / '{c:gap}' (generic frames): the bound word itself is the one blank '?0'
    var WORD_GAP = /\{[a-z][a-z0-9]*:(blank|gap|key)\}/;
    function wordBlank() {
      if (blanks.length) return;
      var bs = fr.bind[0], bI = info(types[bs] === 'wsent' ? 'word' : types[bs], vals[fr.pairWith ? fr.bind[0] : bs], ctx);
      var wantW = bI.en;
      if (types[bs] === 'coll') { var ck = collKey(bI.coll); wantW = ck ? ck.word : bI.en; }
      var wIt2 = itemOf(ctx, 'w:' + String(wantW).toLowerCase()), ielts = !!Bk.IELTS_FMT[fmt];
      var b = { k: '0', slot: bs, want: wantW, accept: [wantW], num: false, kind: 'word', main: row[4] || '' };
      var lim = (sub && sub.limit) || fr.limit || FM.limit;
      if (lim && ielts) b.limit = clone(lim);
      if (fmt === 'VS') b.ipa = (wIt2 && wIt2.ipa) || bI.ipa || '';
      blanks.push(b);
    }
    function cells(tab) {
      if (!tab) return null;
      return { title: [fill(tab.title[0], env, {}, false), fill(tab.title[1], env, {}, true)], rows: tab.rows.map(function (rw) {
        var c = fill(withBlanks(rw[2], false), env, {}, false);
        if (WORD_GAP.test(rw[2]) && /\?0/.test(c)) wordBlank();
        return [fill(rw[0], env, {}, false), fill(rw[1], env, {}, true), c];
      }) };
    }
    // a generic frame whose sentence fell back to the word card (no lesson sentence holds it): note and question are about a word
    var cardCase = !!(fr.pairWith && vals[fr.pairWith] != null && (sentenceById(ctx, vals[fr.pairWith]) || {}).card);
    var form = cells(fr.form), notes = cells(cardCase && fr.cardNotes ? fr.cardNotes : fr.notes);
    // RG: a summary sentence with a gap, completed with ONE WORD from the text (§4.2.1); its Chinese (with ____) is the question's
    var sumSrc = (sub && sub.sum) || fr.sum;
    if (sumSrc && !form && !notes) {
      notes = cells({ title: ['Complete the sentence below.', '把下面的句子补完整'], rows: [['', withBlanks(sumSrc[1], true), sumSrc[0]]] });
      notes.rows[0][1] = fill(withBlanks(sumSrc[1], true), env, {}, true);
    }
    // WD: a small table to write about; LM: the plan with its letters (§4.2)
    var table = null;
    if (fr.table) table = { title: [fill(fr.table.title[0], env, {}, false), fill(fr.table.title[1] || '', env, {}, true)], rows: fr.table.rows.map(function (rw) { return rw.map(function (c) { return fill(c, env, {}, false); }); }) };
    var text = null;
    if (fr.text) {
      var tc = {};
      text = { kind: fr.text.kind, title: [fill(fr.text.title[0], env, {}, false), fill(fr.text.title[1], env, {}, true)],
        lines: fr.text.lines.map(function (l) { var st = clone(tc); return [fill(l[0], env, tc, false), fill(l[1], env, st, true)]; }) };
    }
    var msg = null;
    if (msgSrc) {
      var mc = {}, mst = clone(mc);
      var men = fill(withBlanks(msgSrc[1], false), env, mc, false), mzh = fill(withBlanks(msgSrc[2] || '', true), env, mst, true);
      if (WORD_GAP.test(msgSrc[1]) && /\?0/.test(men)) wordBlank();
      if (fr.capMsg) men = men.replace(/^([^A-Za-z?]*)([a-z])/, function (a0, pre, ch) { return pre + ch.toUpperCase(); });
      msg = [speaker(msgSrc[0]), men, mzh];
    }
    // the question
    var qc = {};
    var prompt = { zh: q.q ? fill(q.q.zh, env, clone(qc), true) : fill((fr.q && fr.q.zh) || '', env, {}, true) };
    // the question says what is played: a word card on its own (cardQ), one word where the frame usually says a sentence (wordQ)
    if (fr.cardQ && cardCase) prompt.zh = fill(fr.cardQ.zh, env, {}, true);
    else if (fr.wordQ && say && say.length === 1 && oneWord(say[0][1])) prompt.zh = fill(fr.wordQ.zh, env, {}, true);
    if (q.q && q.q.en) prompt.en = fill(q.q.en, env, qc, false);
    else if (!sub && fr.q && fr.q.en) prompt.en = fill(fr.q.en, env, qc, false);
    if (sub && fr.q && fr.q.zh && !sub.q) prompt.zh = fill(fr.q.zh, env, {}, true);
    if (!prompt.zh) prompt.zh = DEFAULT_PROMPT[fmt] || '';
    // options (§4.4 opts: the first template is the right one; the row's o= is the shown order)
    var opts = null, ans = null, order = p.o ? p.o.split(',').map(Number) : null;
    var optTpl = q.opts || (fr.collOpts && fmt === 'VC' ? collOptions(fr, vals, types, ctx) : null);
    if (optTpl) {
      var oc = {};
      var raw = optTpl.map(function (t) {
        if (/^=/.test(t)) { var lp = t.slice(1).split('|'), lit = lp[0]; return { en: lit, zh: lp[1] || wordZh(ctx, lit.replace(/^(in|by|on|at)\s+/i, '').toLowerCase()) || literalZh(lit) }; }
        if (/^@\d+$/.test(t)) { var bl = fr.task && fr.task.bullets[Number(t.slice(1))]; return { en: bl ? fill(bl.en, env, {}, false) : t, zh: bl ? fill(bl.zh, env, {}, true) : '' }; }
        // 'On {d}|{d.zh}' — an option with words around a slot names its own Chinese after '|'
        var two = String(t).split('|'), st = clone(oc), en = fill(two[0], env, oc, false);
        if (two.length > 1) return { en: en, zh: fill(two.slice(1).join('|'), env, st, true) };
        var zh = fill(t.replace(/\{([a-z][a-z0-9]*)(~\d?)?(#)?(?::([a-z]+))?\}/g, function (a0, n0, t0, h0, m0) { return '{' + n0 + (t0 || '') + (m0 === 'sent' || m0 === 'ex' ? ':' + m0 : '') + '.zh}'; }), env, st, true);
        return { en: en, zh: zh };
      });
      if (fmt === 'LM') order = range(raw.length).sort(function (a, b) { return raw[a].en < raw[b].en ? -1 : raw[a].en > raw[b].en ? 1 : 0; });
      if (!order || order.length !== raw.length) order = range(raw.length);
      if (fmt === 'VC') {
        // a collocation's options are small words: the right one carries the phrase's Chinese, the others say so
        var cI = null;
        Object.keys(types).forEach(function (s) { if (types[s] === 'coll') cI = info('coll', vals[s], ctx); });
        raw = raw.map(function (o, oi) { return { en: o.en, zh: oi === 0 ? (cI ? cI.zh : o.zh) : '这样搭配不对' }; });
      }
      opts = order.map(function (oi, pos) { return { en: raw[oi].en, zh: raw[oi].zh, letter: LETTERS[pos] }; });
      ans = order.indexOf(0);
    }
    // statements (RT single, RM several)
    var stmts = null;
    if (fmt === 'RT' && q.stmt) {
      var sc0 = {}, scz = clone(sc0);
      stmts = [{ en: fill(q.stmt.en, env, sc0, false), zh: fill(q.stmt.zh, env, scz, true), truth: q.truth }];
    }
    if (fmt === 'RM' && fr.stmts) stmts = fr.stmts.map(function (s) { return { en: fill(s.en, env, {}, false), zh: fill(s.zh, env, {}, true), ans: s.ans }; });
    // typed answer of a reading question (RN typed)
    if (q.ans && fmt === 'RN') {
      var aw = fill(q.ans, env, {}, false), onS = q.on;
      var kind0 = onS ? blankKind(types[onS]) : 'word';
      blanks.push({ k: '0', slot: onS || '', want: kind0 === 'price' ? aw.replace(/^£/, '') : aw, accept: uniq([aw, aw.replace(/^£/, '')]), num: kind0 !== 'word', kind: kind0,
        main: row[4] || '', limit: clone(q.limit || { words: 1, num: true, fromText: false }) });
    }
    // tap (GP) and tiles
    var tiles = null;
    if (fmt === 'GP' && msg) {
      tiles = tapTiles(msg[1]);
      var want = /^=/.test(fr.tap) ? fr.tap.slice(1) : info(types[fr.tap], vals[fr.tap], ctx).en;
      ans = tiles.map(function (t) { return t.toLowerCase(); }).indexOf(String(want).toLowerCase());
      if (ans < 0) ans = tiles.map(function (t) { return t.toLowerCase().replace(/s$/, ''); }).indexOf(String(want).toLowerCase());
    }
    var ref = null, hints = null, dict = null;
    if (fmt === 'GR') {
      var rs = sentenceById(ctx, vals[fr.bind[0]]);
      if (!rs) return null;
      ref = rs.en;
      var words = tapTiles(rs.en);
      var perm = p.t && p.t !== 'x' ? p.t.split(',').map(Number) : shuffled(range(words.length), rng('tiles|' + row[2] + '|' + row[3] + '|' + rs.id));
      if (perm.length !== words.length) return null;
      if (perm.every(function (x, i) { return x === i; }) && perm.length > 1) perm.push(perm.shift());
      tiles = perm.map(function (i) { return words[i]; });
      ans = range(words.length).map(function (i) { return perm.indexOf(i); });
    }
    if (fmt === 'WT') {
      if (fr.free) { ref = null; }
      else {
        var ws = sentenceById(ctx, vals[fr.bind[0]]);
        if (!ws) return null;
        ref = ws.en;
        var lv = Number(p.lv || 3);
        if (lv === 2) hints = keyWords(ws.en);
      }
    }
    if (fmt === 'LD') {
      var ds = sentenceById(ctx, vals[fr.bind[0]]);
      if (!ds) return null;
      ref = ds.en;
      var dlv = Number(p.lv || 1);
      dict = { lv: dlv, mask: dlv === 1 ? maskOf(ds.en) : null, n: countWords(ds.en), slow: dlv === 1 };
    }
    if (fmt === 'SR') {
      var sr = sentenceById(ctx, vals[fr.bind[0]]);
      if (sr) ref = sr.en;
    }
    // task (WM, WK, SP)
    var task = null;
    if (fr.task) {
      task = { kind: fr.task.kind, bullets: fr.task.bullets.map(function (b) { return { en: fill(b.en, env, {}, false), zh: fill(b.zh, env, {}, true), keys: (b.keys || []).slice() }; }),
        min: fr.task.min || 0, max: fr.task.max || 0 };
    }
    if (fmt === 'SP') {
      var sq = say && say.length ? say[say.length - 1] : null, kid = types.k === 'speakq' ? vals.k : null, kit = kid ? itemOf(ctx, kid) : null;
      task = { kind: 'S', bullets: [{ en: 'Answer the question.', zh: '直接回答问题', keys: [] }, { en: 'Give a reason.', zh: '说一个原因', keys: ['because', 'so'] }, { en: 'Add a detail.', zh: '再加一个小细节', keys: [] }],
        min: 12, max: 60, qs: sq ? [{ en: sq[1], zh: sq[2], k: kid || undefined }] : [] };
      if (kit && kit.content) task.model = { en: kit.content.model || '', zh: kit.content.modelZh || '', phrases: (kit.content.phrases || []).map(function (x) { return [x[0], x[1]]; }) };
    }
    // sub-skills: the pool's sub first (row order keeps it), then the frame's, then the target's own facets
    var subs = subsOf(row, fr, sub, fmt, turn, ctx);
    var tgt = row[4] ? itemOf(ctx, row[4]) : null;
    var main = row[4] || null;
    var concept = (sub && sub.concept) || fr.concept || null;
    // Chinese gloss for stretch words in this item's English (answers are never stretch words, §4.8)
    var allEn = [];
    (say || []).forEach(function (l) { allEn.push(l[1]); });
    if (text) { allEn.push(text.title[0]); text.lines.forEach(function (l) { allEn.push(l[0]); }); }
    if (msg) allEn.push(msg[1]);
    if (prompt.en) allEn.push(prompt.en);
    (opts || []).forEach(function (o) { allEn.push(o.en); });
    (stmts || []).forEach(function (s) { allEn.push(s.en); });
    var gl = frameGloss(sc, fr, sub), gloss = [], allStems = {};
    allEn.forEach(function (e) { enWords(e).forEach(function (w) { Bk.stems(w.toLowerCase()).forEach(function (x) { allStems[x] = 1; }); }); });
    Object.keys(gl).forEach(function (g) { var re = wordRe(g); if ((!/\s/.test(g) && allStems[g.toLowerCase()]) || allEn.some(function (e) { return re.test(e); })) gloss.push([g, gl[g]]); });
    // one spacing convention for Chinese next to numbers and Latin words (zhSp)
    (say || []).forEach(function (l) { l[2] = zhSp(l[2]); });
    if (text) { text.title[1] = zhSp(text.title[1]); text.lines.forEach(function (l) { l[1] = zhSp(l[1]); }); }
    if (msg) msg[2] = zhSp(msg[2]);
    [form, notes, table].forEach(function (tb) { if (tb) { tb.title[1] = zhSp(tb.title[1]); if (tb !== table) tb.rows.forEach(function (rw) { rw[1] = zhSp(rw[1]); }); } });
    prompt.zh = zhSp(prompt.zh);
    (opts || []).forEach(function (o) { o.zh = zhSp(o.zh); });
    (stmts || []).forEach(function (st0) { st0.zh = zhSp(st0.zh); });
    if (task) task.bullets.forEach(function (b0) { b0.zh = zhSp(b0.zh); });
    if (task && task.qs) task.qs.forEach(function (q0) { q0.zh = zhSp(q0.zh); });
    if (task && task.model) task.model.zh = zhSp(task.model.zh);
    // the reveal after answering: transcript / text / message with Chinese (§1.5)
    var why = revealOf(say, rolesOut, text, msg, ref, zhSp(sentenceZh(ctx, vals, fr)), fmt, opts, ans, stmts);
    var tier = tierOf(ctx), CONST_OFF = [0, 0, 1.5, 2.8, 2.8];
    var input = (sub && sub.input) || (fmt === 'RN' && q.ans ? 'type' : FM.input);
    var b0 = input === 'type' && fmt === 'RN' ? FM.typedB : FM.b;
    var bAdj = 0;
    // a distractor from the confusion table makes a question harder (§5.1); a minimal pair is what LP / PS are about (their b)
    if (fmt !== 'LP' && fmt !== 'PS' && Object.keys(dist).some(function (k) { return confusable(types[k], vals[k], dist[k]); })) bAdj += 0.2;
    if (gloss.length) bAdj += 0.2;
    var c = FM.c;
    if (fmt === 'RN' && input === 'type') c = 0;
    if (fmt === 'RT') c = ngOn(ctx) ? 1 / 3 : 1 / 2;
    if (opts && fmt !== 'RT') c = opts.length ? 1 / opts.length : c;
    var modes = FM.modes ? clone(FM.modes) : null;
    if (!main || /^c:/.test(main) || fmt === 'VC' || fmt === 'WK') modes = null;
    if (modes && fmt === 'RN') modes = input === 'type' ? { ok: 'T', hint: 'H' } : { ok: 'P' };
    if (modes && fmt === 'LD') modes = { ok: 'D' + (dict ? dict.lv : 1) };
    if (modes && main && tgt && (tgt.kind === 'quiz' || tgt.kind === 'read')) modes = { ok: 'P' };
    if (modes && main && tgt && tgt.kind === 'write' && fmt !== 'WT') modes = null;
    if (modes && main && tgt && tgt.kind === 'speak' && fmt !== 'SP') modes = null;
    var flags = (turn ? 't' : '') + (/^ai-/.test(row[2]) ? 'a' : '');
    var instr = null;
    if (Bk.IELTS_FMT[fmt] && FM.instr) {
      var ti = FM.instr[tier >= 2 ? 2 : 1] || FM.instr[1];
      if (fmt === 'RT') ti = ngOn(ctx) ? FM.instr[2] : FM.instr[1];
      if ((fmt === 'LF' || fmt === 'LN') && ((sub && sub.limit) || fr.limit || FM.limit || {}).words === 2) ti = FM.instr[2];
      if (fmt === 'RN' && input === 'type') ti = blanks.some(function (b) { return b.num; }) ? Bk.FORMATS.LF.instr[1] : FM.typedInstr[1];
      instr = { en: ti[0], zh: ti[1] };
    }
    // a frame may name its own IELTS instruction (Task 2: "Write at least 250 words.")
    var ownInstr = (sub && sub.instr) || fr.instr;
    if (ownInstr && Bk.IELTS_FMT[fmt]) instr = { en: fill(ownInstr[0], env, {}, false), zh: fill(ownInstr[1] || '', env, {}, true) };
    var item = {
      sid: '', i: String(row[0]), row: row.slice(),
      fmt: fmt, scene: row[2], frame: row[3], tier: tier, ch: sc.ch || 1,
      main: main, also: row[5] || undefined, subs: subs, concept: concept || undefined,
      pool: poolOf(p), b: b0 == null ? null : round2(b0 + (CONST_OFF[tier] || 0) + bAdj), c: c, sec: FM.sec,
      instr: instr || undefined, roles: Object.keys(rolesOut).length ? rolesOut : undefined, say: say || undefined, turn: turn || undefined,
      text: text || undefined, form: form || notes || undefined, table: table || undefined, msg: msg || undefined,
      prompt: prompt, opts: opts || undefined, tiles: tiles || undefined, stmts: stmts || undefined, blanks: blanks.length ? blanks : undefined,
      ans: ans != null ? ans : undefined, task: task || undefined, gloss: gloss, why: why,
      pattern: Bk.patternOf(subs[0], main), modes: modes, flags: flags, sig: '',
      head: { at: zhSp(fill(fr.at || sc.zh, env, {}, true)), who: whoLine(rolesOut, say, msg, sc) }, place: sc.place, lv: p.lv ? Number(p.lv) : (fr.lv || FM.lv),
      j: j != null ? j : undefined, input: input, cal: p.yr && calIso(p, types) || undefined, dict: dict || undefined, ref: ref || undefined, hints: hints || undefined,
      optsZhNow: (fr.optZh || (sub && sub.optZh)) ? true : undefined, limit: undefined, notes: notes ? true : undefined
    };
    if (blanks.length) item.limit = blanks[0].limit || undefined;
    // the weekly paper's sections (§2.3): the row's sec= names it
    if (p.sec && SECTION_ZH[FM.skill] && SECTION_ZH[FM.skill][p.sec]) item.section = { n: Number(p.sec), zh: SECTION_ZH[FM.skill][p.sec] };
    // questions of one multi-question frame share one recording / text: the same grp (E2's CONTRACT-REQUEST 5)
    if (fr.items && fr.items.length > 1) {
      var shared = [row[2], row[3]];
      (say || []).forEach(function (l) { shared.push(l[1]); });
      if (text) text.lines.forEach(function (l) { shared.push(l[0]); });
      if (msg) shared.push(msg[1]);
      item.grp = 'g' + Model().h6(shared.join('|'));
    }
    item.sig = Model().h6(sigText(item));
    // drop undefined (JSON-stable, deep-equal friendly): copied into a new object in the same key order (delete is slow)
    var out = {};
    Object.keys(item).forEach(function (k) { if (item[k] !== undefined) out[k] = item[k]; });
    return out;
  }
  var SECTION_ZH = { L: { 1: '生活对话', 2: '通知', 3: '同学聊天', 4: '辨音和听写' }, R: { 1: '告示', 2: '消息或邮件', 3: '短文' } };
  var DEFAULT_PROMPT = { RT: '读一读，判断下面这句话和原文一致吗', RN: '读一读，回答下面的问题', RM: '读一读，给每一句选一个字母', RG: '读一读，用原文里的词填空' };
  function round2(x) { return Math.round(x * 100) / 100; }
  function uniq(a) { var o = [], s = {}; a.forEach(function (x) { if (x != null && !s[x]) { s[x] = 1; o.push(x); } }); return o; }
  function poolOf(p) { return p.pool || 'due'; }
  function ngOn(ctx) { return !!(ctx && ctx.week >= 3); }
  function literalZh(s) {
    var z = { 'In cash': '用现金', 'By card': '刷卡', 'He does not pay': '他不付钱', '£1.50': '1.50 英镑', work: '工作', often: '经常', family: '家庭', cheap: '便宜的' };
    return z[s] || '';
  }
  function confusable(type, v, d) {
    var Bk = Bank(), cls = type === 'weekday' ? 'weekday' : type === 'month' ? 'month' : type === 'teenty' || type === 'pair' ? 'teenty' : type === 'time' ? 'time' : null;
    if (type === 'pair') return true;
    if (!cls) return false;
    var c = Bk.util.confuse(cls, String(v));
    return (d || []).some(function (x) { return c.indexOf(x) >= 0; });
  }
  function calIso(p, types) {
    var d = null, m = null, n = null;
    Object.keys(types).forEach(function (s) { if (types[s] === 'weekday' && p[s] && !d) d = s; if (types[s] === 'month' && p[s]) m = p[s]; if (types[s] === 'dom' && p[s]) n = p[s]; });
    if (!m || !n || !p.yr) return null;
    var mi = Bank().MONTHS.indexOf(m) + 1;
    return p.yr + '-' + (mi < 10 ? '0' : '') + mi + '-' + (Number(n) < 10 ? '0' : '') + Number(n);
  }
  function blankKind(type) { return type === 'time' ? 'time' : type === 'price' ? 'price' : type === 'dom' ? 'dom' : type === 'count' || type === 'teenty' ? 'count' : 'word'; }
  function boundSlot(row, fr, sub, ctx, which) {
    var id = which === 'main' ? row[4] : row[5];
    if (!id) return null;
    var t = itemOf(ctx, id), types = fr.slots || {}, p = parseParams(row[6]);
    if (!t) return null;
    var slots = (sub && sub.on ? [sub.on] : []).concat(fr.bind || []);
    for (var i = 0; i < slots.length; i++) {
      var s = slots[i];
      if (!types[s] || p[s] == null) continue;
      var vs = valuesForTarget(types[s], t, ctx);
      if (vs.indexOf(p[s]) >= 0) {
        if (which === 'also') { var mainS = boundSlot(row, fr, sub, ctx, 'main'); if (mainS === s) continue; }
        return s;
      }
    }
    return null;
  }
  function subsOf(row, fr, sub, fmt, turn, ctx) {
    var p = parseParams(row[6]), out = [];
    function add(s) { if (s && s !== 'W-caps' && out.indexOf(s) < 0) out.push(s); }   // W-caps: retired 2026-09-30, old rows may name it
    (p.subs ? p.subs.split(',') : []).forEach(add);
    ((sub && sub.subs) || []).forEach(add);
    (fr.subs || []).forEach(add);
    var t = row[4] ? itemOf(ctx, row[4]) : null;
    if (t && t.kind === 'pair') Bank().tagsOf(t, ctx.index).forEach(add);
    if (t && (t.kind === 'quiz' || t.kind === 'read' || t.kind === 'dict' || t.kind === 'sym')) Bank().tagsOf(t, ctx.index).forEach(add);
    if (t && t.kind === 'write' && (fmt === 'WT' || fmt === 'GR')) Bank().tagsOf(t, ctx.index).forEach(function (x) { if (fmt === 'WT' || /^(W-sent|G-svo)$/.test(x)) add(x); });
    if (turn) add('L-turn');
    if (fmt === 'LF' || fmt === 'LN') add('L-rule');
    if (fmt === 'RG') add('R-rule');
    if (!out.length) add({ L: 'L-detail', R: 'R-detail', V: 'V-mean', G: 'G-svo', P: 'P-sym-v', W: 'W-sent', S: 'S-ext' }[Bank().FORMATS[fmt].skill] || 'R-detail');
    return out;
  }
  function whoLine(roles, say, msg, sc) {
    var names = [];
    Object.keys(roles).forEach(function (k) { if (k !== 'you') { var n = roles[k].name, c = Bank().CAST[k] || Bank().CAST[(sc.roles || {})[k]]; names.push(c && /老师|房东|护士|咖啡师/.test(c.role) && names.length === 0 && Object.keys(roles).length === 1 ? n + '（' + c.role.replace(/^月光咖啡馆的/, '') + '）' : n); } });
    return names.join(' 和 ');
  }
  function sentenceZh(ctx, vals, fr) { var s = fr.bind && fr.bind[0] && vals[fr.bind[0]]; if (!s) return ''; var t = sentenceById(ctx, s); return t ? t.zh : ''; }
  function revealOf(say, roles, text, msg, ref, refZh, fmt, opts, ans, stmts) {
    if (say && say.length && fmt !== 'SR' && fmt !== 'SP' && fmt !== 'VS' && fmt !== 'VG') {
      return { en: say.map(function (l) { return (roles[l[0]] ? roles[l[0]].name + ': ' : '') + l[1]; }).join('\n'), zh: say.map(function (l) { return (roles[l[0]] ? roles[l[0]].name + '：' : '') + l[2]; }).join('\n') };
    }
    if (text) return { en: text.lines.map(function (l) { return l[0]; }).join('\n'), zh: text.lines.map(function (l) { return l[1]; }).join('\n') };
    if (ref) return { en: ref, zh: refZh || '' };
    if (msg) return { en: msg[1].replace(/\?\d+/g, '____'), zh: msg[2] };
    if (say && say.length) return { en: say.map(function (l) { return l[1]; }).join('\n'), zh: say.map(function (l) { return l[2]; }).join('\n') };
    return { en: '', zh: '' };
  }
  // the filled-in surface of a question (§4.6 #7, §7.2 sig): its words, who says them, the order of options and tiles
  function sigText(item) {
    var parts = [item.fmt, item.scene, item.frame];
    if (item.roles) Object.keys(item.roles).sort().forEach(function (k) { parts.push(k + '=' + item.roles[k].name); });
    if (item.tiles) parts.push(item.tiles.join(' '));
    (item.say || []).forEach(function (l) { parts.push(l[1]); });
    if (item.text) item.text.lines.forEach(function (l) { parts.push(l[0]); });
    if (item.msg) parts.push(item.msg[1]);
    if (item.form) item.form.rows.forEach(function (r) { parts.push(r[2]); });
    if (item.prompt && item.prompt.en) parts.push(item.prompt.en);
    if (item.prompt && item.prompt.zh) parts.push(item.prompt.zh);                  // "用 pay by card 写一句" names what is asked
    (item.opts || []).forEach(function (o) { parts.push(o.en); });
    (item.stmts || []).forEach(function (s) { parts.push(s.en); });
    if (item.ref) parts.push(item.ref);
    return parts.join('|');
  }
  // a line that is one word, or a two-word name for one thing (living room, get up) — not a sentence
  function oneWord(s) { return !/[.!?…]/.test(String(s)) && tapTiles(s).length <= 2; }
  function tapTiles(s) { return String(s).split(/\s+/).map(function (t) { return t.replace(/^[^A-Za-z0-9'’]+|[^A-Za-z0-9'’]+$/g, ''); }).filter(function (t) { return /[A-Za-z0-9]/.test(t); }); }
  function countWords(s) { return tapTiles(s).length; }
  function maskOf(s) {
    return String(s).split(/\s+/).map(function (t) {
      return t.replace(/[A-Za-z0-9']+/g, function (w) { return w.charAt(0) + w.slice(1).replace(/[A-Za-z0-9']/g, '_'); });
    }).join(' ');
  }
  function keyWords(s) { return tapTiles(s).filter(function (w) { return w.length >= 4 || Bank().CAL_WORDS[w.toLowerCase()]; }).slice(0, 3); }
  function collOptions(fr, vals, types, ctx) {
    var cs = null;
    Object.keys(types).forEach(function (s) { if (types[s] === 'coll') cs = s; });
    var c = cs ? itemOf(ctx, vals[cs]) : null, key = collKey(c);
    if (!key) return ['=?'];
    var right = key.word.toLowerCase(), cw = COLL_WRONG[String(c.en).toLowerCase()];
    var set = fr.collOpts.slice();
    if (cw) set = [right].concat(cw);
    else if (set[0] === '@verb') set = [right].concat((VERB_ALT[right] || ['make', 'do']).slice(0, 2));
    if (set.indexOf(right) < 0) set = [right].concat(set.slice(0, 2));
    // the right word first (templates: opts[0] is the answer); the other two are the confusable ones, never a synonym
    var rest = set.filter(function (x) { return x !== right; });
    if (right === 'at' && /weekend/i.test(c.en)) rest = rest.filter(function (x) { return x !== 'on'; }).concat(['in', 'with']).filter(function (x, i, a) { return a.indexOf(x) === i && x !== right; });
    return ['=' + right].concat(rest.slice(0, 2).map(function (x) { return '=' + x; }));
  }

  /* ───────────────────────────── item(spec, ctx) (§4.5) ───────────────────────────── */
  /**
   * item(spec, ctx) → { row, item } | null.
   * spec = { target, also?, subs?, fmt, sceneId?, frameKey?, seed, tier?, pool?, relearn?, concept?, j?, lv?, i?, usedScenes?, usedNames?, accent? }
   * ctx = { index, vocab, learned (Map), host { profile }, asOf, tier, recent: { frames: { 'scene#k': date }, scenes: [], names: [], sigs: Set },
   *         phrases?, week?, scDocs? }
   */
  function item(spec, ctx) {
    ctx = ctx || {};
    var Bk = Bank(), fmt = spec.fmt;
    if (!Bk.FORMATS[fmt]) return null;
    var tgt = spec.target ? itemOf(ctx, spec.target) : null;
    if (spec.target && !tgt) return null;
    var also = spec.also ? itemOf(ctx, spec.also) : null;
    var concept = spec.concept || (tgt && (tgt.kind === 'quiz' || tgt.kind === 'read') ? Bk.conceptOf(tgt, ctx.index) : null);
    var anchorSub = tgt && (tgt.kind === 'quiz' || tgt.kind === 'read') ? Bk.tagsOf(tgt, ctx.index)[0] : null;
    if (tgt && (tgt.kind === 'quiz' || tgt.kind === 'read') && !concept) return null;     // no same-concept shell: no anchor (§3.6)
    var recent = ctx.recent || {}, recentFrames = recent.frames || {}, recentScenes = recent.scenes || [];
    function usable(e) {
      if (spec.sceneId && e.scene.id !== spec.sceneId) return false;
      if (spec.frameKey && e.k !== spec.frameKey) return false;
      if (spec.place && (e.scene.place !== spec.place || e.scene.generic)) return false;   // free practice by place (§2.5): its own scenes
      if (typeof spec.frameFilter === 'function' && !spec.frameFilter(e)) return false;     // the weekly paper's sections (§2.3)
      if (spec.usedScenes && spec.usedScenes.indexOf(e.scene.id) >= 0 && !e.frame.items && !e.scene.generic) return false;
      if (spec.usedFrames && spec.usedFrames.indexOf(e.scene.id + '#' + e.k) >= 0 && (spec.noRepeat || !e.frame.items) && !e.scene.generic) return false;
      if (!needsMet(ctx, e.scene, e.frame)) return false;
      if (spec.lv && e.frame.lv && e.frame.lv > spec.lv + 1) return false;
      return frameFits(e, fmt, tgt, also, concept, anchorSub, spec, ctx);
    }
    var cands = Bk.frames(fmt, usable);
    // Claude's scenes (§6.5): stored as exam-sc-… documents, one frame per question; never added to a session already planned
    aiScenes(ctx).forEach(function (sc) { sc.frames.forEach(function (fr) { var e = { scene: sc, frame: fr, k: fr.k }; if (fr.f === fmt && usable(e)) cands.push(e); }); });
    if (!cands.length) return null;
    var r = rng(String(spec.seed) + '|frames');
    var today = ctx.asOf;
    function age(e) { var d = recentFrames[e.scene.id + '#' + e.k]; return d ? Model().util.diffDays(d, today) : 999; }
    var aiUses = ctx.aiUses || {};
    function aiFresh(e) { return /^ai-/.test(e.scene.id) && (aiUses[e.scene.id + '#' + e.k] || 0) < 3 ? 0 : 1; }   // unused AI scenes first, up to 3 uses a frame
    var shuffledC = shuffled(cands, r);
    shuffledC.sort(function (a, b) {
      var xa = aiFresh(a), xb = aiFresh(b);
      if (xa !== xb) return xa - xb;
      var fa = age(a) < 7 ? 1 : 0, fb = age(b) < 7 ? 1 : 0;
      if (fa !== fb) return fa - fb;
      var ga = a.scene.generic ? 1 : 0, gb = b.scene.generic ? 1 : 0;              // real scenes before the generic shells
      if (ga !== gb) return ga - gb;
      var ra = recentScenes.indexOf(a.scene.id) >= 0 ? 1 : 0, rb = recentScenes.indexOf(b.scene.id) >= 0 ? 1 : 0;
      if (ra !== rb) return ra - rb;
      var ia = /^ai-/.test(a.scene.id) ? 0 : 1, ib = /^ai-/.test(b.scene.id) ? 0 : 1;
      return ia - ib;
    });
    for (var ci = 0; ci < shuffledC.length && ci < 12; ci++) {
      var e = shuffledC[ci];
      for (var tr = 0; tr < 5; tr++) {
        var seed = String(spec.seed) + (tr ? '#' + tr : '');
        var sp = { targetItem: tgt, alsoItem: also, subs: spec.subs, fmt: fmt, concept: concept, j: spec.j, alt: spec.alt, lv: spec.lv, usedNames: spec.usedNames, accent: spec.accent };
        var p = realize(e.scene, e.frame, sp, ctx, seed);
        if (!p) break;
        if (spec.subs && spec.subs.length) p.subs = spec.subs.join(',');
        if (spec.pool) p.pool = spec.pool;
        var row = [String(spec.i != null ? spec.i : '0'), fmt, e.scene.id, e.k, spec.target || '', spec.also || '', paramString(p, orderKeys(e.frame))];
        var it = render(row, ctx);
        if (!it) break;
        var v = validateItem(it, ctx.vocab, ctx);
        if (!v.ok) continue;
        if (recent.sigs && (recent.sigs.has ? recent.sigs.has(it.sig) : recent.sigs[it.sig])) continue;
        return { row: row, item: it };
      }
    }
    return null;
  }
  /**
   * siblings(row, ctx) → rows of the other questions of the same multi-question frame, on the same text or recording (the
   * same slot values, so one notice carries several questions: the weekly paper, §2.3). Each sibling draws its own
   * distractors and option order from the row; one whose own only / not lists reject the shared values is left out.
   * items (optional array): gets each sibling's rendered item, in the same order (the weekly paper needs them, and rendering a
   * row again gives the very same item: §10.8).
   */
  function siblings(row, ctx, items) {
    var f = findFrame(row[2], row[3], ctx);
    if (!f || !f.frame.items) return [];
    var fr = f.frame, sc = f.scene, p = parseParams(row[6]), j0 = Number(p.j), types = fr.slots || {}, out = [];
    var vals = {};
    Object.keys(types).forEach(function (s) { if (p[s] != null) vals[s] = p[s]; });
    var mainSlot = row[4] ? boundSlot(row, fr, frameSubItem(fr, j0), ctx, 'main') : null;
    fr.items.forEach(function (q, j) {
      if (j === j0 || !needsMet(ctx, sc, fr, q)) return;
      if (Object.keys(vals).some(function (s) { return !allowed(fr, s, vals[s], q); })) return;
      var r = rng(row[6] + '|sib|' + j), np = {}, glossW = glossWordSet(frameGloss(sc, fr, q));
      Object.keys(p).forEach(function (k) { if (!/~$/.test(k) && k !== 'o' && k !== 'j' && k !== 'subs') np[k] = p[k]; });
      np.j = String(j);
      var need = distNeeds(fr, q, p['@'] != null ? Number(p['@']) : 0), ok = true;
      Object.keys(need).forEach(function (dn) {
        if (!ok) return;
        var list = distractors(types[dn], vals[dn], fr, dn, vals, ctx, glossW, r, q);
        if (list.length < need[dn]) { ok = false; return; }
        np[dn + '~'] = list.slice(0, need[dn]).join(',');
      });
      if (!ok) return;
      var n = optCount(q, fr);
      if (n > 1) np.o = shuffled(range(n), r).join(',');
      if (q.subs && q.subs[0]) np.subs = q.subs[0];
      var main = mainSlot && q.on === mainSlot ? row[4] : '';
      var row2 = [row[0], q.f || fr.f, row[2], row[3], main, '', paramString(np, orderKeys(fr))];
      var it = render(row2, ctx);
      if (!it || !validateItem(it, ctx.vocab, ctx).ok) return;
      out.push(row2);
      if (items) items.push(it);
    });
    return out;
  }
  // can any template frame of this format hold the target at all? (the weekly paper asks this before generating)
  // (a frame with several questions takes a word only through a question's own slot, 'on'; frameFits says the same)
  var BIND_TYPES = {};
  function bindTypes(fmt, filter, fkey) {
    var key = fmt + '|' + (fkey || '');
    if (BIND_TYPES[key]) return BIND_TYPES[key];
    var set = {};
    Bank().frames(fmt, typeof filter === 'function' ? filter : null).forEach(function (e) {
      var fr = e.frame, types = fr.slots || {};
      if (fr.items) (fr.items || []).forEach(function (q) { if ((q.f || fr.f) === fmt && q.on && types[q.on]) set[types[q.on]] = 1; });
      else (fr.bind || []).forEach(function (s0) { if (types[s0]) set[types[s0]] = 1; });
    });
    return (BIND_TYPES[key] = Object.keys(set));
  }
  var CONCEPTS = {};
  function frameConcepts(fmt, filter, fkey) {
    var key = fmt + '|' + (fkey || '');
    if (CONCEPTS[key]) return CONCEPTS[key];
    var set = {};
    Bank().frames(fmt, typeof filter === 'function' ? filter : null).forEach(function (e) {
      var fr = e.frame;
      if (fr.items) fr.items.forEach(function (q) { if ((q.f || fr.f) === fmt && (q.concept || fr.concept)) set[q.concept || fr.concept] = 1; });
      else if (fr.concept) set[fr.concept] = 1;
    });
    return (CONCEPTS[key] = set);
  }
  function canBind(fmt, tgt, ctx, filter, fkey) {
    if (!tgt) return true;
    if (tgt.kind === 'quiz' || tgt.kind === 'read') { var cp = Bank().conceptOf(tgt, ctx.index); return !!cp && !!frameConcepts(fmt, fkey ? filter : null, fkey)[cp]; }
    if (aiScenes(ctx).length) return true;
    return bindTypes(fmt, fkey ? filter : null, fkey).some(function (t) { return valuesForTarget(t, tgt, ctx).length > 0; });
  }
  function orderKeys(fr) { return Object.keys(fr.slots || {}).concat(['yr', 'ac', 'A', 'B', 'C', 'T', '@', 'j', 'lv', 'o', 't']); }
  function frameFits(e, fmt, tgt, also, concept, anchorSub, spec, ctx) {
    var fr = e.frame, types = fr.slots || {};
    var subsOk = function (list) { return !spec.subs || !spec.subs.length || spec.subs[0] === 'L-turn' || list.indexOf(spec.subs[0]) >= 0 || fmtNatural(fmt, spec.subs[0]); };
    if (fr.items) {
      return fr.items.some(function (q) {
        if ((q.f || fr.f) !== fmt) return false;
        if (concept) return (q.concept || fr.concept) === concept && ((q.subs || []).concat(fr.subs || []).indexOf(anchorSub) >= 0);
        if (tgt) { if (!q.on || !types[q.on] || !valuesForTarget(types[q.on], tgt, ctx).some(function (v) { return allowed(fr, q.on, v, q); })) return false; }
        return subsOk((q.subs || []).concat(fr.subs || []));
      });
    }
    if (fr.f !== fmt) return false;
    if (concept) return fr.concept === concept && (fr.subs || []).indexOf(anchorSub) >= 0;
    if (fr.concept && !concept && tgt) return false;
    if (tgt) {
      var slots = fr.bind || [];
      var ok = slots.some(function (s) { return types[s] && valuesForTarget(types[s], tgt, ctx).some(function (v) { return allowed(fr, s, v, null) && (fr.sentOf !== s || !!info(types[s], v, ctx).sent); }); });
      if (!ok) return false;
      if (fr.fit && (tgt.kind === 'write' || tgt.kind === 'dict' || tgt.kind === 'coll') && !fitOk(fr, tgt)) return false;
      if (fr.altFit && fr.alt && tgt.kind === 'coll' && !fr.alt.some(function (a, i) { return altFits(fr, i, (tgt.type || '') + ':' + tgt.en); })) return false;
      if (tgt.kind === 'coll') {
        if (fr.ctype && tgt.type !== fr.ctype) return false;
        if (fr.ctypes && fr.ctypes.indexOf(tgt.type) < 0) return false;
        if (!fr.ctype && fmt !== 'WT' && tgt.type === 'pattern') return false;       // a sentence pattern is not a gap-fill collocation
        if (fmt === 'VC' && !collKey(tgt)) return false;
      }
    } else if (fr.bind && fr.bind.length && fmt !== 'WK' && !fr.items) {
      // only-sub items still need something to bind (the plan passes a target for them)
    }
    if (also) {
      // two different bind slots: one for the target, one for the second blank
      var bs = fr.bind || [], fitsT = bs.filter(function (s) { return types[s] && tgt && valuesForTarget(types[s], tgt, ctx).some(function (v) { return allowed(fr, s, v, null); }); });
      var fitsA = bs.filter(function (s) { return types[s] && valuesForTarget(types[s], also, ctx).some(function (v) { return allowed(fr, s, v, null); }); });
      if (!fitsT.some(function (s1) { return fitsA.some(function (s2) { return s2 !== s1; }); })) return false;
    }
    return subsOk(fr.subs || []);
  }
  // a format practises some sub-skills whatever its frame says (typed formats practise spelling, …)
  function fmtNatural(fmt, sub) {
    var N = { LF: ['V-spell', 'L-spell', 'L-rule', 'L-detail'], LN: ['V-spell', 'L-spell', 'L-rule', 'L-detail'], VS: ['V-spell'], VG: ['V-spell'], RG: ['R-rule', 'V-spell'],
      WT: ['W-sent', 'W-spell', 'G-be', 'G-3sg', 'G-article', 'G-plural', 'G-prep', 'V-coll'], LD: ['L-dict', 'L-end', 'L-weak', 'L-date', 'L-num'],
      VM: ['V-mean'], LC: ['L-detail'], LP: [], PS: [], GR: ['G-svo', 'W-sent'], VC: ['V-coll', 'G-prep'] };
    if (/^V-(cal|num|family|home|routine|work|t)/.test(sub) && /^(VM|VS|VG|LF|LN|LC|RG|WT)$/.test(fmt)) return true;
    if (/^P-/.test(sub) && /^(LP|PS|LC)$/.test(fmt)) return true;
    return (N[fmt] || []).indexOf(sub) >= 0;
  }

  /* ───────────────────────────── answer normalization (§4.2.1, §10.3 norm) ───────────────────────────── */
  var NUM_W = null;
  function numWords() {
    if (NUM_W) return NUM_W;
    NUM_W = {};
    var U = Bank().util;
    for (var i = 0; i <= 99; i++) { NUM_W[U.numWord(i)] = i; NUM_W[U.numWord(i).replace('-', ' ')] = i; }
    return NUM_W;
  }
  var NT_C = Object.create(null), NT_N = 0;
  function normText(s) {
    s = String(s || '');
    var c = NT_C[s];
    if (c != null) return c;
    if (++NT_N > 20000) { NT_C = Object.create(null); NT_N = 1; }
    return (NT_C[s] = normTextOf(s));
  }
  function normTextOf(s) { var mm = Model(); return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[’]/g, '\'').replace(/[.,!?;:"“”]+/g, ' ').replace(/\s+/g, ' ').trim().split(' ').map(function (w) { return mm ? mm.usForm(w) : w; }).join(' '); }
  function normNumber(s) {
    var t = String(s || '').toLowerCase().replace(/,/g, '').replace(/[£$]/g, '').trim();
    if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
    var m = /^(\d+)(st|nd|rd|th)$/.exec(t);
    if (m) return Number(m[1]);
    t = t.replace(/-/g, ' ').replace(/\band\b/g, ' ').replace(/\s+/g, ' ').trim();
    var W = numWords(), total = 0, cur = 0, any = false;
    var ORD = { first: 1, second: 2, third: 3, fifth: 5, eighth: 8, ninth: 9, twelfth: 12 };
    var parts = t.split(' ');
    for (var i = 0; i < parts.length; i++) {
      var w = parts[i];
      if (own.call(W, w)) { cur += W[w]; any = true; continue; }
      if (own.call(ORD, w)) { cur += ORD[w]; any = true; continue; }
      if (/ieth$/.test(w) && own.call(W, w.replace(/ieth$/, 'y'))) { cur += W[w.replace(/ieth$/, 'y')]; any = true; continue; }
      if (/th$/.test(w) && own.call(W, w.slice(0, -2))) { cur += W[w.slice(0, -2)]; any = true; continue; }
      if (w === 'hundred') { cur = (cur || 1) * 100; any = true; continue; }
      if (w === 'thousand') { total += (cur || 1) * 1000; cur = 0; any = true; continue; }
      return null;
    }
    return any ? total + cur : null;
  }
  // minutes after midnight; ap: 'am' | 'pm' | null
  function normTime(s) {
    var t = String(s || '').toLowerCase().replace(/o'clock|o’clock/g, ' ').replace(/\s+/g, ' ').trim(), ap = null;
    var m1 = /\b(am|pm|a\.m\.|p\.m\.)$/.exec(t);
    if (m1) { ap = m1[1].charAt(0) === 'a' ? 'am' : 'pm'; t = t.slice(0, m1.index).trim(); }
    t = t.replace(/(\d)(am|pm)$/, function (a, d, x) { ap = x; return d; });
    var m = /^(\d{1,2})(?:[.:](\d{2}))?$/.exec(t);
    var h = null, mi = 0;
    if (m) { h = Number(m[1]); mi = m[2] ? Number(m[2]) : 0; }
    else {
      var q = /^(?:a )?quarter (past|to) (.+)$/.exec(t), hp = /^half past (.+)$/.exec(t);
      if (q) { var hh = normNumber(q[2]); if (hh == null) return null; h = q[1] === 'past' ? hh : hh - 1; mi = q[1] === 'past' ? 15 : 45; }
      else if (hp) { var h2 = normNumber(hp[1]); if (h2 == null) return null; h = h2; mi = 30; }
      else {
        var ws = t.split(' ');
        var hn = normNumber(ws[0]);
        if (hn == null) return null;
        h = hn;
        if (ws.length > 1) { var rest = ws.slice(1).join(' ').replace(/^oh /, ''); var mn = normNumber(rest); if (mn == null) return null; mi = mn; }
      }
    }
    if (h == null || h > 23 || mi > 59) return null;
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    return { min: h * 60 + mi, ap: ap };
  }
  function sameTime(a, b) {
    var x = normTime(a), y = normTime(b);
    if (!x || !y) return false;
    if (x.min === y.min) return true;
    if (!x.ap || !y.ap) return x.min % 720 === y.min % 720;
    return false;
  }
  function normPrice(s) {
    var t = String(s || '').toLowerCase().replace(/[£$]/g, '').replace(/\s+/g, ' ').trim();
    var m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(t);
    if (m) return Number(m[1]) * 100 + (m[2] ? Number((m[2] + '0').slice(0, 2)) : 0);
    var pm = /^(.+?) (?:pounds?|dollars?)(?: (?:and )?(.+?))?(?: (?:pence|p|cents?))?$/.exec(t);
    if (pm) { var pp = normNumber(pm[1]), cc = pm[2] ? normNumber(pm[2]) : 0; if (pp == null || cc == null) return null; return pp * 100 + cc; }
    var n = normNumber(t);
    return n == null ? null : Math.round(n * 100);
  }
  // { d, m } for "10 October", "October 10", "10th October", "the tenth of October", "October the tenth"
  function normDate(s) {
    var t = String(s || '').toLowerCase().replace(/,/g, ' ').replace(/\s+/g, ' ').trim().replace(/^the /, ''), MS = Bank().MONTHS;
    var mo = null, rest = [];
    t.split(' ').forEach(function (w) { var i = MS.indexOf(w); if (i >= 0 && mo == null) mo = i + 1; else if (w !== 'of' && w !== 'the') rest.push(w); });
    if (mo == null) return null;
    var d = rest.length ? normNumber(rest.join(' ')) : null;
    return { d: d, m: mo };
  }
  var norm = { text: normText, number: normNumber, time: function (s) { var x = normTime(s); return x ? x.min : null; }, price: normPrice, date: normDate };

  /* ───────────────────────────── check (§10.3) ───────────────────────────── */
  var NUM_TOKEN = /^(£|\$)?\d[\d.,:]*(st|nd|rd|th|am|pm|p)?$/i;
  function countLimit(raw, limit) {
    var toks = String(raw).trim().split(/\s+/).filter(Boolean);
    var nums = 0, words = 0;
    var run = false;
    toks.forEach(function (t, i) {
      if (NUM_TOKEN.test(t)) { nums++; run = false; return; }
      if (/^(am|pm)$/i.test(t) && i > 0 && NUM_TOKEN.test(toks[i - 1])) return;       // "9.15 am": the am belongs to the number
      // a number written in words is one number, not words (IDP: "three hundred and twenty" counts as a number)
      if (/^[a-z-]+$/i.test(t) && normNumber(t) != null) { if (!run) nums++; run = true; return; }
      if (run && /^and$/i.test(t) && toks[i + 1] && normNumber(toks[i + 1]) != null) return;
      run = false; words++;
    });
    if (!limit) return { words: words, nums: nums, over: false };
    var over = words > limit.words || (limit.num ? nums > 1 : nums > 0 && words + nums > limit.words);
    return { words: words, nums: nums, over: over };
  }
  function pluralPair(a, b) {
    a = String(a).toLowerCase(); b = String(b).toLowerCase();
    if (a === b) return false;
    function forms(x) { return [x + 's', x + 'es', x.replace(/y$/, 'ies')]; }
    return forms(a).indexOf(b) >= 0 || forms(b).indexOf(a) >= 0;
  }
  function editClose(a, b) { var d = Model().util.editDist(String(a).toLowerCase(), String(b).toLowerCase()); return d <= Math.max(1, Math.floor(String(b).length / 4)); }
  function textTokens(item) {
    var s = {};
    var all = [];
    if (item.text) item.text.lines.forEach(function (l) { all.push(l[0]); });
    if (item.say) item.say.forEach(function (l) { all.push(l[1]); });
    all.forEach(function (x) { normText(x).split(' ').forEach(function (w) { s[w.replace(/^'+|'+$/g, '')] = 1; }); });
    return s;
  }
  // what a phone keyboard adds that is not in the answer: full-width digits and colons from a Chinese input method (７：３０),
  // 。 for a full stop, and a space after the point or colon (7. 30, 7 : 30) — none of these is a word, so none counts
  function tidyTyped(s) {
    return String(s == null ? '' : s).normalize('NFKC').replace(/[。．｡]/g, '.').replace(/\s+/g, ' ').trim()
      .replace(/(\d) ?([.:]) ?(?=\d)/g, '$1$2').replace(/(\d) ?([.:,])$/, '$1');
  }
  // one IELTS-rule blank (LF, LN, RG, RN typed): word limit → content → plural → from the text → spelling
  function checkBlank(b, raw, item) {
    var shown = String(raw == null ? '' : raw).trim();
    raw = tidyTyped(raw);
    var part = { k: b.k, ok: false, typed: shown, want: b.want, cause: null, wordOk: false, heardOk: false };
    if (!raw) { part.cause = 'empty'; return part; }
    var lim = b.limit || null, cnt = countLimit(raw, lim);
    var content = false, plural = false, near = false;
    var kind = b.kind || 'word';
    if (kind === 'time') content = b.accept.concat([b.want]).some(function (a) { return sameTime(raw, a); });
    else if (kind === 'price') { var x = normPrice(raw), y = normPrice(b.want); content = x != null && x === y; }
    else if (kind === 'dom' || kind === 'count') { var n1 = normNumber(raw.replace(/\b(of|the)\b/gi, ' ').trim()), n2 = normNumber(b.want); content = n1 != null && n1 === n2; }
    else if (kind === 'date') { var d1 = normDate(raw), d2 = normDate(b.want); content = !!(d1 && d2 && d1.m === d2.m && d1.d === d2.d); }
    else {
      var nr = normText(raw), wants = b.accept.concat([b.want]).map(normText);
      var inner = nr.split(' ');
      content = wants.indexOf(nr) >= 0;
      if (!content && cnt.over) content = wants.some(function (w) { return inner.indexOf(w) >= 0 || (' ' + nr + ' ').indexOf(' ' + w + ' ') >= 0; });   // "on Saturday": the word is right, the limit is not
      var numW = normNumber(b.want);
      if (!content && numW != null) { var nn = normNumber(raw); content = nn != null && nn === numW; }
      if (!content) plural = wants.some(function (w) { return pluralPair(nr, w); });
      if (!content && !plural) near = wants.some(function (w) { return editClose(nr, w); });
    }
    part.wordOk = content;
    part.heardOk = content || plural || near;
    if (cnt.over) { part.cause = 'limit'; return part; }
    if (plural) { part.cause = 'plural'; return part; }
    if (content && lim && lim.fromText && kind === 'word') {
      var tt = textTokens(item);
      if (!normText(raw).split(' ').every(function (w) { return tt[w]; })) { part.cause = 'notInText'; part.wordOk = false; return part; }
    }
    if (!content && lim && lim.fromText) {
      var tt2 = textTokens(item), para = false;
      Bank().PARA.forEach(function (g) { var l = g.map(normText); if (l.indexOf(normText(b.want)) >= 0 && l.indexOf(normText(raw)) >= 0) para = true; });
      if (para || (!near && !tt2[normText(raw)] && /^[a-z' -]+$/.test(normText(raw)))) { part.cause = 'notInText'; return part; }
    }
    if (!content) {
      part.cause = near ? 'spell' : null;
      if (kind === 'word') part.ops = Model().spellCheck(raw, b.want).ops;
      return part;
    }
    part.ok = true;
    return part;
  }
  // VS / VG: the word's spelling (letter case never matters, §4.2.1); digits never stand for a number word (§10.3); a phone's
  // full stop (double space, 。), full-width letters, ’ are not letters
  function bare(s) { return tidyTyped(s).replace(/[’‘]/g, '\'').replace(/[.!?]+$/, ''); }
  function checkSpell(b, raw, ctx) {
    raw = String(raw == null ? '' : raw).trim();
    var part = { k: b.k, ok: false, typed: raw, want: b.want, cause: null, wordOk: false, heardOk: false }, t = bare(raw), w = bare(b.want);
    if (!raw) { part.cause = 'empty'; return part; }
    var sc = Model().spellCheck(t, w);
    part.ops = sc.ops;
    part.wordOk = sc.lettersOk;
    part.heardOk = sc.lettersOk || editClose(t, w);
    if (/^\d[\d,]*(st|nd|rd|th)?$/i.test(t) && normNumber(b.want) != null) { part.num = true; part.cause = 'spell'; part.wordOk = false; part.numSame = normNumber(t) === normNumber(b.want); return part; }
    if (sc.ok) { part.ok = true; return part; }
    part.cause = 'spell';
    return part;
  }
  function fdClose(typed, target, ctx) {
    if (ctx && typeof ctx.fdClose === 'function') { try { return !!ctx.fdClose(typed, target); } catch (e) { /* fall through */ } }
    var nm = function (x) { return String(x || '').toLowerCase().replace(/[’]/g, '\'').replace(/\s+/g, ' ').trim(); };
    var a = nm(typed), b = nm(target);
    if (!a || a === b) return false;
    if (a.replace(/-/g, '') === b.replace(/-/g, '') || a.replace(/-/g, ' ') === b.replace(/-/g, ' ')) return true;
    var mm = Model();
    return a.split(' ').map(mm.usForm).join(' ') === b.split(' ').map(mm.usForm).join(' ');
  }
  // dictation: digits she typed become words (as the host's speechToks does), then the host's score
  var NUM_1 = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
  var NUM_10 = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  var NUM_ORD = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };
  function numToWords(t) {
    var m = /^(\d{1,4})(st|nd|rd|th)?$/.exec(t);
    if (!m) return [t];
    var n = Number(m[1]), w = [];
    function say(x) { if (x < 20) w.push(NUM_1[x]); else { w.push(NUM_10[Math.floor(x / 10)]); if (x % 10) w.push(NUM_1[x % 10]); } }
    if (n >= 1000) { say(Math.floor(n / 1000)); w.push('thousand'); }
    if (n % 1000 >= 100) { say(Math.floor(n % 1000 / 100)); w.push('hundred'); }
    if (n % 100 || !w.length) say(n % 100);
    if (m[2]) { var last = w.pop(); w.push(NUM_ORD[last] || (/y$/.test(last) ? last.slice(0, -1) + 'ieth' : last + 'th')); }
    return w;
  }
  function speechWords(s, ctx) {
    if (ctx && typeof ctx.speechToks === 'function') { try { return ctx.speechToks(s).join(' '); } catch (e) { /* fall through */ } }
    var U = Model().util;
    return U.toks(String(s).replace(/(\d)[:.](\d\d)(?!\d)/g, '$1 $2').replace(/-/g, ' ').replace(/£(\d+)/g, '$1 pounds')).map(U.normTok).filter(Boolean).reduce(function (a, t) { return a.concat(numToWords(t)); }, []).join(' ');
  }

  /* ── WT: the sentence's key forms (§10.3) ── */
  var CONTR = { "i'm": 'i am', "don't": 'do not', "doesn't": 'does not', "it's": 'it is', "can't": 'can not', cannot: 'can not', "isn't": 'is not', "aren't": 'are not',
    "he's": 'he is', "she's": 'she is', "that's": 'that is', "there's": 'there is', "what's": 'what is', "they're": 'they are', "we're": 'we are', "you're": 'you are', "let's": 'let us' };
  function wtoks(s) {
    var out = [], mm = Model();
    String(s || '').replace(/[’]/g, '\'').split(/\s+/).forEach(function (raw) {
      var clean = raw.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, '');
      if (!clean) return;
      var low = clean.toLowerCase();
      if (own.call(CONTR, low)) { CONTR[low].split(' ').forEach(function (p, i) { out.push({ raw: i === 0 ? clean : p, key: mm.usForm(p) }); }); return; }
      out.push({ raw: clean, key: mm.usForm(low) });
    });
    return out;
  }
  var AUX_BE = { am: 1, is: 1, are: 1, was: 1, were: 1 }, AUX_DO = { do: 1, does: 1, did: 1 };
  var NOT_VERB_S = { is: 1, has: 1, does: 1, was: 1, this: 1, his: 1, its: 1, us: 1, bus: 1, yes: 1, class: 1, plus: 1, always: 1, sometimes: 1, pounds: 0, dollars: 0 };
  var VERBS = ('work live like go get cook clean study sleep relax exercise walk watch drink start open cost pay want need have drive make take read love call visit ' +
    'eat meet play help send buy come see know say tell think look sing talk listen speak write teach finish stop wait rent apply move shop leave').split(' ');
  var VERB_SET = {};
  VERBS.forEach(function (v) { VERB_SET[v] = 1; });
  function stemS(w) { if (/ies$/.test(w)) return w.slice(0, -3) + 'y'; if (/(ch|sh|x|ss|o)es$/.test(w)) return w.slice(0, -2); if (/s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1); return w; }
  var TIME_WORDS = /^(monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|may|june|july|august|september|october|november|december|weekend|morning|evening|afternoon|night|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|\d+)$/;
  /**
   * writeForms(answer, ref, ctx) → { cw (compareWrite), forms: failed key forms [{ kind, want, got, sub }], att: [[sub, x, w]],
   *   verb (a verb present) }; letter case is never looked at (§4.2.1)
   */
  function writeForms(answer, ref, ctx) {
    var mm = Model(), Bk = Bank();
    var cw = mm.compareWrite(answer, ref);
    var A = wtoks(answer), R = wtoks(ref);
    var att = [], forms = [];
    if (!A.length) return { cw: cw, forms: [{ kind: 'sent', want: ref, got: '', sub: 'W-sent' }], att: [['W-sent', 0, 1]], verb: false, empty: true };
    var pairs = mm.util.lcsPairs(R.map(function (t) { return t.key; }), A.map(function (t) { return t.key; }));
    var mR = {}, mA = {};
    pairs.forEach(function (p) { mR[p[0]] = p[1]; mA[p[1]] = p[0]; });
    // second pass: her word without the -s / -es of the reference word (works ↔ work, apples ↔ apple)
    var stemMatch = {};
    R.forEach(function (t, i) {
      if (mR[i] != null || !/s$/.test(t.key) || NOT_VERB_S[t.key]) return;
      var st = stemS(t.key);
      for (var k = 0; k < A.length; k++) if (mA[k] == null && A[k].key === st) { stemMatch[i] = k; mA[k] = 'stem'; break; }
    });
    // be and do
    R.forEach(function (t, i) {
      if (AUX_BE[t.key]) { var ok = mR[i] != null; att.push(['G-be', ok ? 1 : 0, 1]); if (!ok) forms.push({ kind: 'be', want: t.raw, got: null, sub: 'G-be' }); }
      else if (AUX_DO[t.key]) { var ok2 = mR[i] != null; att.push(['G-do', ok2 ? 1 : 0, 1]); if (!ok2) forms.push({ kind: 'do', want: t.raw, got: null, sub: 'G-do' }); }
    });
    // third person -s and plural -s: the first -s word after the subject that is a verb → G-3sg; other -s nouns → G-plural
    var verbIdx = -1;
    for (var vi = 1; vi < R.length; vi++) {
      var kk = R[vi].key;
      if (AUX_BE[kk] || AUX_DO[kk] || kk === 'has' || kk === 'can' || kk === 'will') { verbIdx = vi; break; }
      if (VERB_SET[kk] || (/s$/.test(kk) && VERB_SET[stemS(kk)])) { verbIdx = vi; break; }
    }
    R.forEach(function (t, i) {
      if (!/s$/.test(t.key) || NOT_VERB_S[t.key] || t.key.length < 3) return;
      var isVerb = i === verbIdx && VERB_SET[stemS(t.key)];
      var sub = isVerb ? 'G-3sg' : (VERB_SET[stemS(t.key)] ? null : 'G-plural');
      if (!sub) return;
      if (mR[i] != null) att.push([sub, 1, 1]);
      else if (stemMatch[i] != null) { att.push([sub, 0, 1]); forms.push({ kind: isVerb ? '3sg' : 'plural', want: t.raw, got: A[stemMatch[i]].raw, sub: sub }); }
    });
    if (R.some(function (t) { return t.key === 'has'; })) {
      R.forEach(function (t, i) {
        if (t.key !== 'has') return;
        if (mR[i] != null) att.push(['G-3sg', 1, 1]);
        else if (A.some(function (a, k) { return a.key === 'have' && mA[k] == null; })) { att.push(['G-3sg', 0, 1]); forms.push({ kind: '3sg', want: 'has', got: 'have', sub: 'G-3sg' }); }
      });
    }
    // articles: the noun after it matched, the article not
    R.forEach(function (t, i) {
      if (t.key !== 'a' && t.key !== 'an' && t.key !== 'the') return;
      var n = i + 1;
      while (n < R.length && mR[n] == null && stemMatch[n] == null && n < i + 3) n++;
      var nounOk = n < R.length && (mR[n] != null || stemMatch[n] != null);
      if (!nounOk) return;
      var ok = mR[i] != null;
      if (!ok && t.key === 'the' && i + 1 < R.length && R[i + 1].key === 'weekend') return;   // handled with the prepositions
      att.push(['G-article', ok ? 1 : 0, 1]);
      if (!ok) forms.push({ kind: 'article', want: t.raw, got: null, sub: 'G-article' });
    });
    // time prepositions before weekdays, months, clock times, the weekend
    R.forEach(function (t, i) {
      if (t.key !== 'on' && t.key !== 'in' && t.key !== 'at') return;
      var n = i + 1;
      if (n < R.length && R[n].key === 'the') n++;
      if (n >= R.length || !TIME_WORDS.test(R[n].key)) return;
      if (mR[n] == null) return;
      var ok = mR[i] != null;
      if (!ok && R[n].key === 'weekend') {
        var ai = mR[n] - (R[i + 1].key === 'the' ? 2 : 1);
        if (ai >= 0 && A[ai] && (A[ai].key === 'on' || A[ai].key === 'at')) ok = true;
      }
      att.push(['G-prep', ok ? 1 : 0, 1]);
      if (!ok) { var got = mR[n] > 0 ? A[mR[n] - 1 - (R[i + 1] && R[i + 1].key === 'the' ? 1 : 0)] : null; forms.push({ kind: 'prep', want: t.raw + ' ' + (R[i + 1].key === 'the' ? 'the ' : '') + R[n].raw, got: got ? got.raw : null, sub: 'G-prep' }); }
    });
    // Monday to Friday ↔ Monday through Friday
    // collocations in the reference (phrases of the course): all of it, or its content words with a wrong small word
    var phs = ctx && ctx.index ? Bk.phrases(ctx.index) : [];
    var refLow = ' ' + R.map(function (t) { return t.key; }).join(' ') + ' ';
    phs.forEach(function (ph) {
      var pw = String(ph.en).toLowerCase().replace(/…/g, ' ').split(/\s+/).filter(Boolean);
      if (pw.length < 2 || pw.some(function (w) { return /[^a-z']/.test(w); })) return;
      var at = refLow.indexOf(' ' + pw.join(' ') + ' ');
      if (at < 0) return;
      var start = refLow.slice(0, at).trim() ? refLow.slice(0, at).trim().split(' ').length : 0;
      var idx = pw.map(function (w, k) { return start + k; });
      var content = idx.filter(function (i) { return !PREPS[R[i].key] && R[i].key !== 'a' && R[i].key !== 'the'; });
      if (!content.length || !content.every(function (i) { return mR[i] != null || stemMatch[i] != null; })) return;
      var ok = idx.every(function (i) { return mR[i] != null || stemMatch[i] != null; });
      if (!ok && /weekend/.test(ph.en)) ok = true;           // at / on the weekend: both right (§4.7 #6)
      att.push(['V-coll', ok ? 1 : 0, 1]);
      if (!ok) forms.push({ kind: 'coll', want: ph.en, got: null, sub: 'V-coll' });
    });
    // a sentence: a subject and a verb (W-sent)
    var verb = A.some(function (a, k) { return AUX_BE[a.key] || AUX_DO[a.key] || a.key === 'has' || a.key === 'have' || a.key === 'can' || VERB_SET[a.key] || VERB_SET[stemS(a.key)] || (mA[k] != null && mA[k] !== 'stem' && mA[k] === verbIdx); });
    att.push(['W-sent', verb && A.length >= 2 ? 1 : 0, 1]);
    // spelling: her misspelt attempts at reference words of ≥ 4 letters (course words → V-spell, other words → W-spell)
    var vsp = [0, 0], wsp = [0, 0];
    R.forEach(function (t, i) {
      if (t.key.length < 4) return;
      var isItem = !!(ctx && ctx.index && ctx.index.items.has('w:' + t.key));
      var slot = isItem ? vsp : wsp;
      if (mR[i] != null || stemMatch[i] != null) { slot[0]++; slot[1]++; return; }
      var best = null;
      A.forEach(function (a, k) {
        if (mA[k] != null || a.key.charAt(0) !== t.key.charAt(0) || Math.abs(a.key.length - t.key.length) > 3) return;
        var sim = mm.util.lcsPairs(a.key.split(''), t.key.split('')).length / t.key.length;
        if (sim >= 0.6 && (!best || sim > best.sim)) best = { sim: sim, raw: a.raw };
      });
      if (best) { slot[1]++; forms.push({ kind: 'spell', want: t.raw, got: best.raw, sub: isItem ? 'V-spell' : 'W-spell' }); }
    });
    if (vsp[1]) att.push(['V-spell', vsp[0] / vsp[1], 1]);
    if (wsp[1]) att.push(['W-spell', wsp[0] / wsp[1], 1]);
    return { cw: cw, forms: forms, att: att, verb: verb };
  }

  /**
   * check(item, response, opts?) → Verdict (§10.4). opts = { hinted, claimed, relearn, before, ctx: { dictScore, speechToks, fdClose, index } }.
   * Response by input: form → string[] in blanks order, '' = empty (or { k: string }); VS / VG / typed RN → string[] or string;
   * choice → option index; tfng → 'T'|'F'|'NG'; match → letters[] per statement; tap → token index; order → tile indices in
   * her order; LD / text → string; speak → { text, typed?, wpm? } or { skip: true }; GC may also be { tap, fix } (fix = the
   * option; tap is checked when the item has a tap step, item.tap); RT with several statements → one answer per statement
   * (Verdict.parts). SR (spoken) → Verdict.pct / .heard, the machine intelligibility. It may come wrapped in the store's envelope
   * { v, ms, plays, slow, hint: ['zh'|'first'|'src'] }: any hint → Verdict.hinted and weight 0.5; a second play of a
   * listening item from tier 3 on → Verdict.replayed and weight 0.5 (§5.3).
   */
  function check(item, response, opts) {
    opts = opts || {};
    var ctx = opts.ctx || {}, fmt = item.fmt, input = item.input || Bank().FORMATS[fmt].input;
    // the store's answer envelope { v, ms, plays, slow, hint } (E2's CONTRACT-REQUEST 1) or the bare value
    var env = isObj(response) && own.call(response, 'v') && ('ms' in response || 'plays' in response || 'hint' in response || 'slow' in response) ? response : null;
    if (env) response = env.v;
    var hinted = !!(opts.hinted || (env && Array.isArray(env.hint) && env.hint.length));
    // a second listen from difficulty tier 3 on counts like a hint (§2.1 听的遍数, §5.3 w_i)
    var replayed = !!(env && Number(env.plays) >= 2 && (item.tier || 1) >= 3 && Bank().FORMATS[fmt].skill === 'L');
    var v = { ok: false, claimable: false, counted: [], subs: {}, subw: {}, att: [], pattern: item.pattern || null, why: item.why || { en: '', zh: '' }, relearn: !!opts.relearn };
    if (hinted) v.hinted = true;
    if (replayed) v.replayed = true;
    if (opts.before) v.before = opts.before;                                       // { date, resp } (E2's CONTRACT-REQUEST 8)
    var subs = item.subs || [];
    var hintW = hinted || replayed ? 0.5 : 1;
    function push(sub, x, w, part) { v.att.push([sub, Math.round(x * 1000) / 1000, Math.round(w * hintW * 1000) / 1000, part == null ? 0 : part]); }
    function allSubs(x, part, skip) { subs.forEach(function (s) { if (!skip || !skip[s]) push(s, x, 1, part); }); }
    if (fmt === 'LD') {
      var hyp = speechWords(response || '', ctx);
      var ref = item.ref || '';
      var dc = Model().dictCauses(ref, hyp, typeof ctx.dictScore === 'function' ? ctx.dictScore : null);
      v.pct = dc.pct;
      v.ok = dc.pct >= 80;
      v.toks = dc.toks.map(function (t) { var o = { t: t.t, ok: t.ok }; if (t.cause) o.cause = t.cause; if (t.heard) o.heard = t.heard; return o; });
      var ends = dc.toks.some(function (t) { return t.cause === 'end'; }), fws = dc.toks.some(function (t) { return t.cause === 'fw'; });
      subs.forEach(function (s) {
        if (s === 'L-end') push(s, ends ? 0 : 1, 1);
        else if (s === 'L-weak') push(s, fws ? 0 : 1, 1);
        else if (s === 'L-date' || s === 'L-num') {
          var re = s === 'L-date' ? /^(january|february|march|april|may|june|july|august|september|october|november|december|first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|[a-z]+teenth|[a-z]+tieth)$/ : /^(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|[a-z]+teen|[a-z]+ty|hundred|thousand)$/;
          var ts = dc.toks.filter(function (t) { return re.test(Model().util.normTok(t.t)); });
          push(s, ts.length && ts.every(function (t) { return t.ok; }) ? 1 : 0, 1);
        } else push(s, v.ok ? 1 : 0, 1);
      });
      if (ends && subs.indexOf('L-end') < 0) push('L-end', 0, 1);
      if (fws && subs.indexOf('L-weak') < 0) push('L-weak', 0, 1);
      finish(v);
      return v;
    }
    if (fmt === 'WT') {
      var ans = String(response == null ? '' : response);
      if (!item.ref) {                                             // a free sentence with a collocation (wt-coll)
        var fwf = writeForms(ans, ans, ctx);
        var target = item.main ? itemOf(ctx, item.main) : null;
        var has = target ? new RegExp(target.en.replace(/…/g, '.*').replace(/[.*+?^${}()|[\]\\]/g, function (c) { return c === '.' || c === '*' ? c : '\\' + c; }), 'i').test(ans) : true;
        v.ok = has && fwf.verb;
        push('V-coll', has ? 1 : 0, 1);
        push('W-sent', fwf.verb ? 1 : 0, 1);
        v.forms = has ? [] : [{ kind: 'coll', want: target ? target.en : '', got: null, sub: 'V-coll' }];
        finish(v);
        return v;
      }
      var wf = writeForms(ans, item.ref, ctx);
      v.forms = wf.forms.filter(function (f) { return f.kind !== 'spell'; }).concat(wf.forms.filter(function (f) { return f.kind === 'spell'; }));
      var keyFail = wf.forms.filter(function (f) { return f.kind !== 'spell'; });
      v.ok = wf.cw.ok && keyFail.length === 0 && !wf.empty;
      v.coverage = wf.cw.coverage;
      v.claimable = !v.ok && !wf.empty && wf.cw.coverage >= 0.6 && keyFail.length === 0;
      if (opts.claimed && v.claimable) { v.ok = true; v.claimed = true; }
      wf.att.forEach(function (a) { push(a[0], a[1], a[2]); });
      // a sub-skill this sentence gives no evidence about is not an attempt (only the forms really in it count)
      if (!v.ok && keyFail.length) v.pattern = Bank().patternOf(keyFail[0].sub, item.main) || v.pattern;
      else if (!v.ok && wf.forms.length) v.pattern = Bank().patternOf(wf.forms[0].sub, item.main) || v.pattern;
      finish(v);
      return v;
    }
    if (input === 'form' || (input === 'type' && (fmt === 'RN' || fmt === 'RG'))) {
      var blanks = item.blanks || [];
      var resp = Array.isArray(response) ? response : isObj(response) ? blanks.map(function (b) { return response[b.k]; }) : [response];
      var ielts = !!Bank().IELTS_FMT[fmt], listen = Bank().FORMATS[fmt].skill === 'L';
      v.parts = blanks.map(function (b, bi) {
        var pt = ielts ? checkBlank(b, resp[bi], item) : checkSpell(b, resp[bi], ctx);
        subs.forEach(function (s) {
          if (s === 'L-rule' || s === 'R-rule') { if (pt.cause !== 'empty') push(s, pt.cause === 'limit' || pt.cause === 'notInText' || (s === 'R-rule' && pt.cause === 'plural') ? 0 : 1, 1, bi); return; }
          if (s === 'V-spell' || s === 'L-spell' || s === 'W-spell') { push(s, pt.wordOk ? 1 : 0, 1, bi); return; }
          if (s === 'L-end' && pt.cause === 'plural') { push(s, 0, 1, bi); return; }
          if (/^L-/.test(s) || /^R-/.test(s)) { push(s, pt.heardOk ? 1 : 0, 1, bi); return; }
          push(s, pt.ok ? 1 : 0, 1, bi);
        });
        if (pt.cause === 'plural') { if (listen && subs.indexOf('L-end') < 0) push('L-end', 0, 1, bi); if (!listen && subs.indexOf('R-rule') < 0) push('R-rule', 0, 1, bi); push('G-plural', 0, 0.5, bi); }
        return pt;
      });
      v.ok = v.parts.every(function (pt) { return pt.ok; });
      v.pattern = blankPattern(v.parts, item, listen) || v.pattern;
      finish(v);
      return v;
    }
    if (input === 'type') {                                        // VS, VG
      var b0 = (item.blanks || [])[0] || { k: '0', want: '', accept: [] };
      var pt0 = checkSpell(b0, Array.isArray(response) ? response[0] : isObj(response) ? response[b0.k] : response, ctx);
      v.parts = [pt0];
      v.claimable = !pt0.ok && !pt0.num && fdClose(bare(pt0.typed), b0.want, ctx);
      if (opts.claimed && v.claimable) { v.ok = true; v.claimed = true; pt0.ok = true; }
      else v.ok = pt0.ok;
      subs.forEach(function (s) {
        if (s === 'V-spell' || s === 'L-spell') { push(s, v.claimed ? 1 : pt0.ok ? 1 : 0, v.claimed ? 0.5 : 1); return; }
        push(s, pt0.ok || v.claimed ? 1 : 0, v.claimed ? 0.5 : 1);
      });
      if (!v.ok) v.pattern = Bank().patternOf('V-spell', item.main) || v.pattern;
      finish(v);
      return v;
    }
    if (input === 'choice' || input === 'tap') {
      // GC may come as { tap, fix }: fix is the option; tap (the wrong word) is checked only when the item has a tap step;
      // no answer is no option (10-11: Number(null) is 0)
      var idx = function (x) { return typeof x == 'number' || /^\d+$/.test(typeof x == 'string' ? x : '') ? +x : NaN; };
      if (isObj(response) && own.call(response, 'fix')) {
        v.tapOk = item.tap == null ? null : idx(response.tap) === Number(item.tap);
        response = v.tapOk === false ? -1 : response.fix;
      }
      v.picked = idx(response);
      v.ok = v.picked === Number(item.ans);
      allSubs(v.ok ? 1 : 0);
      finish(v);
      return v;
    }
    if (input === 'tfng') {
      // one statement per item ('T' | 'F' | 'NG'), or an array with one answer per statement
      var sts = item.stmts || [], rsp = Array.isArray(response) ? response : [response];
      v.parts = sts.map(function (st, si) { var got = String(rsp[si] == null ? '' : rsp[si]).toUpperCase(), ok = got === st.truth; allSubs(ok ? 1 : 0, si); return { k: String(si), ok: ok, typed: got, want: st.truth, cause: got ? null : 'empty' }; });
      v.ok = v.parts.length > 0 && v.parts.every(function (pt) { return pt.ok; });
      if (sts.length <= 1) delete v.parts;
      finish(v);
      return v;
    }
    if (input === 'match') {
      var rs = Array.isArray(response) ? response : [];
      v.parts = (item.stmts || []).map(function (s, si) { var ok = String(rs[si] || '').toUpperCase() === s.ans; allSubs(ok ? 1 : 0, si); return { k: String(si), ok: ok, typed: String(rs[si] || ''), want: s.ans, cause: null }; });
      v.ok = v.parts.every(function (p) { return p.ok; });
      finish(v);
      return v;
    }
    if (input === 'order') {
      var ord = Array.isArray(response) ? response.map(Number) : [];
      var want = item.ans || [];
      v.ok = ord.length === want.length && ord.every(function (x, i) { return x === want[i] || (item.tiles && item.tiles[x] && item.tiles[want[i]] && item.tiles[x].toLowerCase() === item.tiles[want[i]].toLowerCase()); });
      allSubs(v.ok ? 1 : 0);
      finish(v);
      return v;
    }
    // WM, WD, SP, SC: marked later (Claude or self), ok stays null. SR: the machine's intelligibility in % (pct, heard), the
    // leaf's result (§7.2); { skip: true } = no speech recognition on this device, not answered
    v.ok = null;
    if (isObj(response) && response.skip) { v.skipped = true; finish(v); return v; }
    var txt = isObj(response) ? String(response.text || '') : String(response || '');
    v.words = tapTiles(txt).length;
    if (input === 'speak') v.typed = !!(isObj(response) && response.typed);
    if (fmt === 'SR' && item.ref && !v.typed) {
      var said = speechWords(txt, ctx), sr = Model().dictCauses(item.ref, said, typeof ctx.dictScore === 'function' ? ctx.dictScore : null);
      v.pct = sr.pct; v.heard = sr.pct;
      v.toks = sr.toks.map(function (t) { var o = { t: t.t, ok: t.ok }; if (t.cause) o.cause = t.cause; return o; });
      push('S-intel', sr.pct / 100, 1);
    }
    finish(v);
    return v;
  }
  // the pattern card for the first wrong blank: its cause decides (§4.11)
  function blankPattern(parts, item, listen) {
    for (var i = 0; i < parts.length; i++) {
      var pt = parts[i];
      if (pt.ok || pt.cause === 'empty') continue;
      if (pt.cause === 'limit') return listen ? 'L-rule' : 'R-rule';
      if (pt.cause === 'plural') return listen ? 'L-end' : 'R-rule';
      if (pt.cause === 'notInText') return 'R-rule';
      var b = (item.blanks || [])[i] || {};
      if (pt.cause === 'spell' && b.kind === 'word') return Bank().patternOf('V-spell', b.main || item.main);
      if (b.kind === 'time') return 'L-time';
      if (b.kind === 'price') return 'L-price';
      if (b.kind === 'dom' || (b.kind === 'word' && Bank().CAL_WORDS[String(b.want).toLowerCase()])) return 'L-date';
      return null;
    }
    return null;
  }
  function finish(v) {
    var sum = {}, wsum = {};
    v.att.forEach(function (a) { sum[a[0]] = (sum[a[0]] || 0) + a[1] * a[2]; wsum[a[0]] = (wsum[a[0]] || 0) + a[2]; });
    Object.keys(sum).forEach(function (s) { v.subs[s] = wsum[s] ? Math.round(sum[s] / wsum[s] * 1000) / 1000 : 0; v.subw[s] = Math.round(wsum[s] * 1000) / 1000; });
  }

  /* ───────────────────────────── validateItem (§4.5 step 7) ───────────────────────────── */
  // (no look-behind in regular expressions: older Safari / WKWebView cannot parse it)
  function sentences(s) { return String(s || '').replace(/([.!?…])\s+/g, '$1\n').split(/\n|—/).map(function (x) { return x.trim(); }).filter(Boolean); }
  // English words of a text for the vocabulary check: accents folded (Café → Cafe), emoji and blank markers out, letters used as
  // labels (A, B, C) out, a hyphenated word checked part by part
  var EW_C = Object.create(null), EW_N = 0;
  function enWords(s) {
    s = String(s || '');
    var c = EW_C[s];
    if (c) return c;
    if (++EW_N > 20000) { EW_C = Object.create(null); EW_N = 1; }
    return (EW_C[s] = enWordsOf(s));
  }
  function enWordsOf(s) {
    var out = [];
    String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\?\d+/g, ' ').replace(/[\u2600-\u27ff\ud800-\udfff]/g, ' ')
      .split(/[^A-Za-z0-9'’£.\-]+/).forEach(function (w) {
        w = w.replace(/^[.'’-]+|[.'’-]+$/g, '');
        if (!/[A-Za-z]/.test(w) || /^[A-Fa-f]$/.test(w)) return;
        if (/-/.test(w) && !/^\d/.test(w)) w.split('-').forEach(function (x) { if (/[A-Za-z]/.test(x)) out.push(x); });
        else out.push(w);
      });
    return out;
  }
  /**
   * validateItem(item, vocab, ctx?) → { ok, errors }: words she knows (or glossed, within budget), the answer is really in
   * the audio / text, word limits, one right option, distinct options, corrections, calendar, sentence length.
   */
  function validateItem(item, vocab, ctx) {
    var errors = [], Bk = Bank();
    if (!item) return { ok: false, errors: ['no item'] };
    var tier = item.tier || 1;
    var glossSet = {};
    (item.gloss || []).forEach(function (g) { Bk.util.tokens(g[0]).forEach(function (w) { glossSet[w] = 1; }); });
    // 1. vocabulary (form labels are exempt: they always show their Chinese)
    var en = [];
    (item.say || []).forEach(function (l) { en.push(l[1]); });
    if (item.text) { item.text.lines.forEach(function (l) { en.push(l[0]); }); en.push(item.text.title[0]); }
    if (item.msg) en.push(item.msg[1]);
    if (item.prompt && item.prompt.en) en.push(item.prompt.en);
    (item.opts || []).forEach(function (o) { en.push(o.en); });
    (item.stmts || []).forEach(function (s) { en.push(s.en); });
    var unknown = {};
    if (vocab && vocab.known) {
      en.forEach(function (s) {
        enWords(s).forEach(function (w) {
          var lw = w.toLowerCase().replace(/[’]/g, '\'');
          if (Bk.isKnown(vocab.known, lw)) return;
          if (glossSet[lw] || Bk.stems(lw).some(function (x) { return glossSet[x]; })) return;
          if (/^[A-Z]/.test(w) && Bk.nameSet()[lw]) return;
          unknown[lw] = 1;
        });
      });
    }
    var unk = Object.keys(unknown);
    if (unk.length) errors.push('unknown words: ' + unk.join(', '));
    var budget = tier <= 1 ? 2 : tier === 2 ? 4 : 6;
    if ((item.gloss || []).length > budget) errors.push('too many new words: ' + item.gloss.length);
    // 2. Chinese for every English line
    (item.say || []).forEach(function (l) { if (l[1] && !String(l[2] || '').trim() && item.fmt !== 'PS') errors.push('say line without Chinese'); });
    if (item.text) item.text.lines.forEach(function (l) { if (!String(l[1] || '').trim()) errors.push('text line without Chinese'); });
    if (item.msg && !String(item.msg[2] || '').trim()) errors.push('message without Chinese');
    (item.stmts || []).forEach(function (s) { if (!String(s.zh || '').trim()) errors.push('statement without Chinese'); });
    (item.opts || []).forEach(function (o) { if (!String(o.zh || '').trim() && (/[A-Za-z]/.test(o.en) && !/^[£$\d]/.test(o.en) || !String(o.en || '').trim())) errors.push('option without Chinese: ' + o.en); });
    // 3. template leftovers
    var blob = JSON.stringify([item.say, item.text, item.msg, item.prompt, item.opts, item.stmts, item.form]);
    if (/\{[A-Za-z][A-Za-z0-9~#:.]*\}/.test(blob)) errors.push('unfilled template');
    // 4. typed answers: in the audio / text, within the limit
    var audio = (item.say || []).map(function (l) { return l[1]; }).join(' ') + ' ' + (item.text ? item.text.lines.map(function (l) { return l[0]; }).join(' ') : '');
    (item.blanks || []).forEach(function (b) {
      if (b.limit && countLimit(b.want, b.limit).over) errors.push('answer over the word limit: ' + b.want);
      if (/^(LF|LN|RG|RN)$/.test(item.fmt)) {
        var present = false, A = normText(audio);
        if (b.kind === 'word') present = (' ' + A + ' ').indexOf(' ' + normText(b.want) + ' ') >= 0;
        else if (b.kind === 'time') present = true;
        else present = true;
        if (!present) errors.push('answer not in the audio / text: ' + b.want);
      }
      if (item.turn && normText(item.turn.wrong) === normText(b.want)) errors.push('the corrected value is the answer');
      if (glossSet[normText(b.want)]) errors.push('a new word is the answer');
    });
    // 5. options: distinct, exactly one right
    if (item.opts) {
      var seen = {};
      item.opts.forEach(function (o) { var k = normText(o.en + '|' + (item.optsZhNow ? o.zh : '')); if (seen[k]) errors.push('two options are the same: ' + o.en); seen[k] = 1; });
      if (item.ans == null || item.ans < 0 || item.ans >= item.opts.length) errors.push('no right option');
      var right = item.opts[item.ans] ? normText(item.opts[item.ans].en) : '';
      Bk.PARA.forEach(function (g) {
        var l = g.map(normText);
        if (l.indexOf(right) < 0) return;
        item.opts.forEach(function (o, i) { if (i !== item.ans && l.indexOf(normText(o.en)) >= 0) errors.push('a paraphrase of the answer is an option'); });
      });
    }
    if (item.fmt === 'GP' && (item.ans == null || item.ans < 0)) errors.push('the word to tap is not in the sentence');
    // 6. calendar
    if (item.cal) {
      var parts = dateParts(item.cal), wds = [], mos = [];
      Object.keys((Bk.frameOf(item.scene, item.frame) || { frame: { slots: {} } }).frame.slots || {}).forEach(function () {});
      var p = parseParams(item.row[6]), fr = (Bk.frameOf(item.scene, item.frame) || {}).frame;
      if (fr) Object.keys(fr.slots || {}).forEach(function (s) { if ((fr.cal || []).indexOf(s) >= 0) { if (fr.slots[s] === 'weekday') wds.push(p[s]); if (fr.slots[s] === 'month') mos.push(p[s]); } });
      wds.forEach(function (w) { if (w !== parts.weekday) errors.push('weekday does not match the date'); });
      mos.forEach(function (m) { if (m !== parts.month) errors.push('month does not match the date'); });
      if (ctx && ctx.asOf) { var dd = Model().util.diffDays(ctx.asOf, item.cal); if (dd < 3 || dd > 60) errors.push('date outside the next 3–60 days'); }
    }
    // 7. length (tier 1: sentences ≤ 12 words, dialogue ≤ 4 lines, text ≤ 80 words)
    var maxW = tier <= 1 ? 12 : tier === 2 ? 20 : 40;
    (item.say || []).forEach(function (l) { sentences(l[1]).forEach(function (s) { if (enWords(s).length > maxW) errors.push('sentence too long: ' + s); }); });
    if (item.text) { var tw = 0; item.text.lines.forEach(function (l) { tw += enWords(l[0]).length; }); if (tw > (tier <= 1 ? 80 : 300)) errors.push('text too long'); }
    if ((item.say || []).length > (tier <= 1 ? 4 : 8)) errors.push('dialogue too long');
    // 8. a typed question has its blanks, and every '?k' on the page is one of them (ui.js CONTRACT-REQUEST 13)
    if (/^(LF|LN|RG|VS|VG)$/.test(item.fmt) || item.input === 'form') {
      var bl = item.blanks || [], onPage = {};
      if (!bl.length) errors.push('no blank to answer');
      var cellsTxt = (item.form ? item.form.rows.map(function (r) { return r[2]; }) : []).concat(item.msg ? [item.msg[1]] : []).join(' ');
      cellsTxt.replace(/\?(\d+)/g, function (a, k) { onPage[k] = 1; return a; });
      bl.forEach(function (b) { if (!onPage[b.k]) errors.push('a blank is not on the page: ' + b.k); });
      Object.keys(onPage).forEach(function (k) { if (!bl.some(function (b) { return b.k === k; })) errors.push('a gap without its blank: ?' + k); });
      if (item.msg && !item.form && /^\s*\?\d+\s*$/.test(item.msg[1]) && item.fmt === 'VG') errors.push('the message is only the gap');
    }
    return { ok: errors.length === 0, errors: errors };
  }

  /* ───────────────────────────── Claude's scenes (§6.2–§6.5) ───────────────────────────── */
  var AI_KIND = { LF: 'type', LN: 'type', RG: 'type', LC: 'choice', RN: 'choice', VM: 'choice', RT: 'tf' };
  var AI_SUBS = { LF: ['L-detail', 'L-spell'], LN: ['L-detail', 'L-spell'], RG: ['R-rule', 'R-detail'], LC: ['L-detail'], RN: ['R-detail'], VM: ['V-mean'], RT: ['R-tfng'] };
  var AI_PLACES = { home: 1, cafe: 1, market: 1, school: 1, health: 1, work: 1, social: 1, service: 1, travel: 1, season: 1 };
  var AI_BUDGET = { 1: 3, 2: 6, 3: 10, 4: 10 };
  var AI_OPPOSITE = [['open', 'closed'], ['cheap', 'expensive'], ['quiet', 'noisy'], ['early', 'late'], ['busy', 'free'], ['big', 'small'], ['morning', 'evening'], ['before', 'after'], ['first', 'last']];
  // §6.4 #7: never in a scene Claude writes (alcohol, medicine, violence, religion, politics, brands, private data)
  var AI_BLOCK = ('beer wine wines whisky whiskey vodka alcohol drunk bar bars pub pubs cigarette cigarettes smoke smoking drug drugs pill pills medicine medicines dose doses mg ' +
    'gun guns knife kill kills killed blood dead death die dies war bomb fight church mosque temple god bible religion president election vote government police ' +
    'password passwords pin visa mastercard paypal iphone google facebook amazon starbucks mcdonald mcdonalds nike adidas cola pepsi tesco ikea').split(' ');
  var AI_GRAMMAR = { 'w1d1:a3': 'parts of speech', 'w1d2:a3': 'subject + verb (+ object)', 'w1d3:a3': 'am / is / are', 'w1d4:a3': 'present simple, he/she/it + -s, do/does',
    'w1d5:a3': 'plural nouns and a / an / the', 'w1d6:a3': 'five basic sentence patterns' };
  var AI_TOPIC = { 'V-cal': ['a day or month word', 'plans with friends, school dates'], 'V-num': ['a number or price word', 'shops, the Saturday market or Moon Café'],
    'V-family': ['a family word', 'friends and family'], 'V-home': ['a home word', 'the flat, the landlord Mrs Wood or the neighbours'],
    'V-routine': ['a daily-routine word', 'a daily routine or Park Street Health Centre'], 'V-work': ['a school or work word', 'the language school or a part-time job'] };
  var WEEKDAY_EN = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  function tierOfWeekN(n) { n = Number(n) || 1; return n <= 6 ? 1 : n <= 11 ? 2 : n <= 15 ? 3 : 4; }
  /**
   * sceneSpec(st, { seed }) → { prompt, ctx, targets } | null: 1–3 words she is learning (due or weak first), a format each (a
   * listening scene LF + LC, or a reading one RN + RT / RG), and the prompt of §6.2 for them. Only words and word pairs go to
   * Claude; sentences and grammar questions never do.
   */
  function sceneSpec(st, opts) {
    opts = opts || {};
    var X = st && st._;
    if (!X || !X.index || !st.learned) return null;
    var Bk = Bank(), seed = String(opts.seed || st.asOf), n = (st.chapter && st.chapter.n) || 1, tier = tierOfWeekN(n);
    var ctx = { index: X.index, learned: st.learned, host: X.host, asOf: st.asOf, vocab: X.vocab, tier: tier, week: n, scDocs: X.scDocs || {}, recent: {} };
    var words = [];
    (X.info || []).forEach(function (inf) {
      if (!inf || !inf.it || inf.it.kind !== 'word' || inf.today) return;
      if (!/^[A-Za-z][A-Za-z -]*$/.test(inf.it.en)) return;
      words.push(inf);
    });
    if (!words.length) return null;
    words.sort(function (a, b) {
      var da = a.mem && a.mem.due ? 0 : 1, db = b.mem && b.mem.due ? 0 : 1;
      if (da !== db) return da - db;
      return Model().h6(seed + '|' + a.id) < Model().h6(seed + '|' + b.id) ? -1 : 1;
    });
    var listen = parseInt(Model().h6(seed + '|mode'), 36) % 2 === 0;
    var fmts = listen ? ['LF', 'LC'] : ['RN', 'RT'], picked = [], topics = {};
    for (var i = 0; i < words.length && picked.length < 2; i++) {
      var w = words[i].it, sub = Bk.tagsOf(w, X.index)[0] || '';
      if (picked.some(function (x) { return x.en.toLowerCase() === w.en.toLowerCase(); })) continue;
      picked.push({ id: w.id, en: w.en, zh: wordZh(ctx, w.en), fmt: fmts[picked.length], sub: sub });
      topics[sub] = 1;
    }
    var first = AI_TOPIC[picked[0].sub] || ['a word', 'everyday life in Maple Bridge'];
    ctx.ai = { targets: picked, budget: AI_BUDGET[tier] || 3, placeHint: first[1], mode: listen ? 'L' : 'R' };
    return { prompt: scenePrompt(ctx), ctx: ctx, targets: picked.map(function (x) { return x.id; }) };
  }
  // the known-word list for the prompt: all of them up to 900, else the learned word items first (§6.2)
  function aiKnownList(ctx) {
    var v = ctx.vocab, all = v && v.known ? Array.from(v.known).filter(function (w) { return /^[a-z][a-z'-]*$/.test(w); }).sort() : [];
    if (all.length <= 900) return all;
    var items = v.items ? Array.from(v.items).sort() : [], seen = {}, out = [];
    items.concat(Bank().CORE_WORDS, all).forEach(function (w) { if (out.length < 900 && !seen[w]) { seen[w] = 1; out.push(w); } });
    return out.sort();
  }
  function aiGrammar(ctx) {
    var d = doneSet(ctx), out = [];
    if (ctx.index) ctx.index.steps.forEach(function (si, sk) {
      if (!d[sk] || si.type !== 'grammar') return;
      out.push(AI_GRAMMAR[sk] || String(si.title || '').replace(/^语法[:：]\s*/, ''));
    });
    return out.length ? out.join('; ') : 'am / is / are; present simple';
  }
  function aiNextTopics(ctx) {
    var n = (ctx.week || 1) + 1, out = [];
    if (ctx.index && ctx.index.weeks) ctx.index.weeks.forEach(function (w) {
      if (w.n !== n) return;
      (w.days || []).forEach(function (dayId) { var di = ctx.index.days.get(dayId); if (di) di.steps.forEach(function (sk) { var si = ctx.index.steps.get(sk); if (si && si.type === 'words' && si.title) out.push(String(si.title)); }); });
    });
    return out.length ? out.slice(0, 6).join(', ') : 'transport, shopping, food, weather, health, hobbies';
  }
  function aiCastFacts() {
    var C = Bank().CAST;
    return Object.keys(C).map(function (k) { return '- ' + k + ' (' + C[k].name + ', ' + C[k].role.replace(/[^\x20-\x7e]/g, '').trim() + '): ' + C[k].facts.join('; '); }).join('\n');
  }
  /** scenePrompt(ctx) → the text of §6.2 for ctx.ai.targets (sceneSpec builds ctx). */
  function scenePrompt(ctx) {
    ctx = ctx || {};
    var ai = ctx.ai || { targets: [], budget: 3, placeHint: 'everyday life in Maple Bridge' }, tier = tierOf(ctx), today = ctx.asOf || '';
    var wd = today ? WEEKDAY_EN[Model().util.weekday(today)] : '';
    var targets = ai.targets.map(function (t, i) {
      var desc = (AI_TOPIC[t.sub] || ['a word'])[0];
      return (i + 1) + '. "' + t.en + '" (' + desc + (t.zh ? ', Chinese: ' + t.zh : '') + ') → item format ' + t.fmt;
    }).join('\n');
    return [
      'You write one short, realistic practice scene for an IELTS learner\'s study app. Output ONE JSON object and nothing else.',
      '',
      'LEARNER: a Chinese-speaking adult from Singapore, IELTS beginner, course week ' + (ctx.week || 1) + ', target band 7.0.',
      'She is spending a year in Maple Bridge, a small English-speaking university town. She lives in Flat 3, 8 Park Street, with her flatmate Lily.',
      'TODAY: ' + today + ' (' + wd + '). Any date in the scene must be a real date within the next 60 days, and a weekday named with a',
      'date must be that date\'s real weekday.',
      '',
      'KNOWN WORDS (use only these words, plus people\'s names, place names and numbers):',
      aiKnownList(ctx).join(' '),
      'GRAMMAR SHE KNOWS: ' + aiGrammar(ctx),
      'NEW WORDS: at most ' + ai.budget + ' words that are not in the list. Put every one of them in "gloss" with a short Chinese meaning.',
      'Prefer new words from next week\'s topics: ' + aiNextTopics(ctx) + '. A new word must never be an answer.',
      '',
      'CAST (keep these facts true; you may also invent one new first name):',
      aiCastFacts(),
      'PLACE: ' + ai.placeHint,
      '',
      'TARGETS: each target must appear in the scene spelled exactly as given, and exactly one item must test it (for a typed item the',
      'target is the answer; for a choice item the correct option depends on understanding the target).',
      targets,
      '',
      'WRITE',
      '- "zh": a Chinese title, at most 12 characters.',
      '- For listening formats (LF, LN, LC): "lines" = 2 to 4 lines of dialogue, or one short announcement. Each line has "who"',
      '  (a cast id or a first name), "en" (at most ' + (tier <= 1 ? 12 : 20) + ' words) and "zh" (a natural Chinese translation).',
      '- For reading formats (RN, RT, RM, RG): "text" = { "kind": "notice"|"message"|"email"|"article", "title": {"en","zh"},',
      '  "en" (at most ' + (tier <= 1 ? 80 : 300) + ' words), "zh" (a natural Chinese translation) }.',
      '- "items": one per target, in the order of TARGETS. Each item: "fmt", "target", "q": {"en"?, "zh"}, and',
      '  · LF / LN / RG: "answer" = the exact word as it appears in the scene: ONE word and/or one number (course week 7 and later:',
      '    at most two words); for RG the word must be in the text;',
      '  · LC / RN / VM: "options" = exactly 3 objects {"en","zh"}, "answer" = the index of the correct one; the other two must be',
      '    real words or values from KNOWN WORDS that are easy to confuse with the answer (thirteen/thirty, Tuesday/Thursday,',
      '    a quarter past/a quarter to);',
      '  · RT: "statement" = {"en","zh"} and "truth" = "T" or "F";',
      '  · "evidence" = the index of the line (or the sentence of the text) that contains the answer.',
      '- "gloss": [[word, Chinese], ...] for every word that is not in KNOWN WORDS (names and numbers excepted).',
      '',
      'RULES',
      '- A real everyday situation. Kind and polite. Nothing scary or sad. No brands, no real people, no politics, religion,',
      '  alcohol, medicine doses, money transfers, passwords or personal data.',
      '- Short, simple sentences that use only the grammar above. No idioms. Natural English that a British or American speaker would',
      '  really say (not a word-for-word translation); a printed notice writes times and prices in digits.',
      '- Every English sentence has a Chinese translation.',
      '- The answer must be clearly said or written in one line or sentence. A wrong option must never also be correct.',
      '- Output JSON only: no Markdown fences, no comments, no text before or after.',
      '',
      'SCHEMA',
      '{"v":1,"zh":"…","place":"home|cafe|market|school|health|work|social|service|travel|season","tier":' + tier + ',',
      ' "lines":[{"who":"…","en":"…","zh":"…"}],"text":{"kind":"…","title":{"en":"…","zh":"…"},"en":"…","zh":"…"},',
      ' "items":[{"fmt":"…","target":"…","q":{"en":"…","zh":"…"},"answer":…,"options":[{"en":"…","zh":"…"}],',
      '           "statement":{"en":"…","zh":"…"},"truth":"T","evidence":0}],',
      ' "gloss":[["…","…"]]}',
      '',
      'EXAMPLE',
      '{"v":1,"zh":"周六几点开门","place":"cafe","tier":1,',
      ' "lines":[{"who":"leo","en":"Hi! On Saturday we open at a quarter past nine.","zh":"嗨！我们周六九点一刻开门。"},',
      '          {"who":"lily","en":"A quarter past nine? Great, thank you!","zh":"九点一刻？太好了，谢谢！"}],',
      ' "items":[{"fmt":"LC","target":"quarter","q":{"en":"When does the café open on Saturday?","zh":"咖啡馆周六几点开门？"},',
      '           "options":[{"en":"9:15","zh":"九点一刻"},{"en":"9:45","zh":"九点四十五"},{"en":"8:15","zh":"八点一刻"}],',
      '           "answer":0,"evidence":0}],',
      ' "gloss":[]}'
    ].join('\n');
  }
  function aiStr(x) { return typeof x === 'string' ? x.trim() : ''; }
  function aiParse(input) {
    if (isObj(input)) return input;
    var t = String(input == null ? '' : input).replace(/```[a-z]*\s*/gi, '').replace(/```/g, '');
    var a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a < 0 || b <= a) return null;
    try { return JSON.parse(t.slice(a, b + 1)); } catch (e) { return null; }
  }
  // does a line say this value? words as words; times, prices and numbers compared after normalising (a quarter past nine = 9:15)
  function aiSays(line, value) {
    var L = String(line || ''), v = String(value == null ? '' : value).trim();
    if (!v) return false;
    if ((' ' + normText(L) + ' ').indexOf(' ' + normText(v) + ' ') >= 0) return true;
    var ws = L.replace(/[,;!?"“”()]/g, ' ').replace(/\.(\s|$)/g, ' ').split(/\s+/).filter(Boolean);
    var tv = normTime(v), pv = /^[£$]|\d\.\d\d$|pounds?|dollars?/i.test(v) ? normPrice(v) : null, nv = normNumber(v);
    for (var i = 0; i < ws.length; i++) for (var j = i + 1; j <= Math.min(ws.length, i + 6); j++) {
      var ph = ws.slice(i, j).join(' ');
      if (tv && /[:.]\d\d|o'clock|quarter|half|am|pm/i.test(v + ' ' + ph)) { var tp = normTime(ph); if (tp && sameTime(v, ph)) return true; }
      if (pv != null) { var pp = normPrice(ph); if (pp != null && pp === pv && /[£$]|pounds?|dollars?/i.test(ph)) return true; }
      if (nv != null && tv == null && pv == null) { var np = normNumber(ph); if (np != null && np === nv) return true; }
    }
    return false;
  }
  function aiSentences(en) { return String(en || '').replace(/([.!?])\s+/g, '$1\n').split('\n').map(function (x) { return x.trim(); }).filter(Boolean); }
  function aiZhSentences(zh) { return String(zh || '').replace(/([。！？])/g, '$1\n').split('\n').map(function (x) { return x.trim(); }).filter(Boolean); }
  // the real dates a scene names: "Saturday, the 10th of October" must be that Saturday, within 60 days (§6.4 #9)
  function aiDatesOk(s, asOf) {
    var errs = [], MS = Bank().MONTHS, WDs = Bank().WEEKDAYS, U = Model().util;
    aiSentences(s).forEach(function (sen) {
      var low = sen.toLowerCase(), wd = null, mo = null;
      WDs.forEach(function (w) { if (new RegExp('\\b' + w + '\\b').test(low)) wd = w; });
      MS.forEach(function (m, i) { if (new RegExp('\\b' + m + '\\b').test(low)) mo = i + 1; });
      if (!mo || !asOf) return;
      var dm = /\b(\d{1,2})(st|nd|rd|th)?\b/.exec(low.replace(/\d{1,2}[:.]\d\d/g, ' ')), day = dm ? Number(dm[1]) : null;
      if (day == null) { var nd = normDate(low.replace(/^.*?\b(the\s+\w+\s+of\s+\w+|\w+\s+the\s+\w+)\b.*$/, '$1')); day = nd && nd.d; }
      if (!day || day > 31) return;
      var y = Number(asOf.slice(0, 4)), iso = null;
      for (var k = 0; k < 2 && !iso; k++) { var c = (y + k) + '-' + pad(mo) + '-' + pad(day), dd = U.diffDays(asOf, c); if (dd >= 0 && dd <= 60) iso = c; }
      if (!iso) { errs.push('the date in "' + sen + '" is not within the next 60 days'); return; }
      if (wd && WD[U.weekday(iso)] !== wd) errs.push('in "' + sen + '" the weekday is not the real weekday of that date');
    });
    return errs;
  }
  function pad(n) { n = Number(n); return (n < 10 ? '0' : '') + n; }
  function aiHasBlocked(s) {
    var low = ' ' + String(s || '').toLowerCase() + ' ';
    if (/https?:|www\.|\.com\b|@/.test(low)) return 'a web or email address';
    if (/\d[\d ]{7,}\d/.test(low)) return 'a long number (phone or card)';
    var bad = null;
    enWords(low).forEach(function (w) { if (!bad && AI_BLOCK.indexOf(w.toLowerCase()) >= 0) bad = w; });
    return bad;
  }
  /**
   * validateScene(textOrJson, ctx) → { ok, errors: string[] (English, for the retry), json, scene } (§6.4). ctx = sceneSpec's ctx:
   * ctx.ai.targets, ctx.vocab, ctx.tier, ctx.asOf, ctx.scDocs. The scene is the converted template (§6.3), id 'ai-<h6>'.
   */
  function validateScene(input, ctx) {
    ctx = ctx || {};
    var errors = [], Bk = Bank(), tier = tierOf(ctx), json = aiParse(input);
    function out() { return { ok: false, errors: errors.slice(0, 8), json: json || null, scene: null }; }
    // 1. parses, v 1, required fields
    if (!isObj(json)) { errors.push('the answer is not one JSON object'); return out(); }
    if (json.v !== 1) errors.push('"v" must be 1');
    if (!aiStr(json.zh)) errors.push('"zh" (a Chinese title) is missing');
    if (!Array.isArray(json.items) || !json.items.length) errors.push('"items" must be a non-empty array');
    var lines = Array.isArray(json.lines) ? json.lines : null, text = isObj(json.text) ? json.text : null;
    if (!lines && !text) errors.push('write "lines" (listening) or "text" (reading)');
    if (errors.length) return out();
    // 2. length · 3. Chinese
    var maxW = tier <= 1 ? 12 : 20, maxText = tier <= 1 ? 80 : 300;
    if (String(json.zh).length > 12) errors.push('"zh" must be at most 12 characters');
    if (lines) {
      if (lines.length < 1 || lines.length > 4) errors.push('"lines" must have 1 to 4 lines');
      lines.forEach(function (l, i) {
        if (!isObj(l) || !aiStr(l.en) || !aiStr(l.zh) || !aiStr(l.who)) { errors.push('line ' + i + ' needs "who", "en" and "zh"'); return; }
        sentences(l.en).forEach(function (sn) { if (enWords(sn).length > maxW) errors.push('line ' + i + ' has a sentence longer than ' + maxW + ' words'); });
      });
    }
    if (text) {
      if (['notice', 'message', 'email', 'article'].indexOf(text.kind) < 0) errors.push('"text.kind" must be notice, message, email or article');
      if (!isObj(text.title) || !aiStr(text.title.en) || !aiStr(text.title.zh)) errors.push('"text.title" needs "en" and "zh"');
      if (!aiStr(text.en) || !aiStr(text.zh)) errors.push('"text" needs "en" and "zh"');
      else if (enWords(text.en).length > maxText) errors.push('"text.en" is longer than ' + maxText + ' words');
    }
    var gloss = Array.isArray(json.gloss) ? json.gloss : [];
    gloss.forEach(function (g) { if (!Array.isArray(g) || !aiStr(g[0]) || !aiStr(g[1])) errors.push('every "gloss" entry is [word, Chinese]'); });
    if (errors.length) return out();
    // everything English, for the vocabulary, safety and target checks
    var sceneEn = (lines || []).map(function (l) { return l.en; }).concat(text ? [text.title.en, text.en] : []);
    var allEn = sceneEn.slice(), evid = lines ? lines.map(function (l) { return l.en; }) : aiSentences(text.en);
    var strings = [];
    (function walk(o) { if (typeof o === 'string') strings.push(o); else if (Array.isArray(o)) o.forEach(walk); else if (isObj(o)) Object.keys(o).forEach(function (k) { walk(o[k]); }); })(json);
    if (strings.some(function (x) { return /[{}]|\?[a-z0-9]/i.test(x) || /<\s*\/?\s*[a-z]/i.test(x); })) errors.push('no braces, HTML or "?x" in any text');
    // 4–5. targets and answers
    var targets = (ctx.ai && ctx.ai.targets) || [], seen = {};
    json.items.forEach(function (q, i) {
      var fmt = q && q.fmt, kind = AI_KIND[fmt];
      if (!isObj(q) || !kind) { errors.push('item ' + i + ': "fmt" must be one of LF, LN, LC, RN, RT, RG, VM'); return; }
      if (lines && /^R/.test(fmt) || text && /^L/.test(fmt)) errors.push('item ' + i + ': a ' + (lines ? 'listening' : 'reading') + ' scene cannot have a ' + fmt + ' item');
      if (!isObj(q.q) || !aiStr(q.q.zh)) errors.push('item ' + i + ': "q.zh" is missing');
      var tg = aiStr(q.target);
      if (!tg) errors.push('item ' + i + ': "target" is missing');
      else {
        seen[tg.toLowerCase()] = (seen[tg.toLowerCase()] || 0) + 1;
        if (!sceneEn.some(function (e) { return wordRe(tg).test(e); })) errors.push('target "' + tg + '" does not appear in the scene');
      }
      var ev = Number(q.evidence), evLine = evid[ev];
      if (!(ev >= 0) || evLine == null) { errors.push('item ' + i + ': "evidence" must be a line (or sentence) index'); return; }
      if (kind === 'type') {
        var ans = typeof q.answer === 'number' ? String(q.answer) : aiStr(q.answer);
        if (!ans) { errors.push('item ' + i + ': "answer" is missing'); return; }
        if (!aiSays(evLine, ans)) errors.push('item ' + i + ': the answer "' + ans + '" is not in the evidence line');
        if (countLimit(ans, { words: tier >= 2 ? 2 : 1, num: true }).over) errors.push('item ' + i + ': the answer is over the word limit');
        if (fmt === 'RG' && text && !aiSays(text.en, ans)) errors.push('item ' + i + ': an RG answer must be a word from the text');
        if (tg && normText(ans) !== normText(tg) && normNumber(ans) !== normNumber(tg)) errors.push('item ' + i + ': for a typed item the answer is the target');
        if (gloss.some(function (g) { return normText(g[0]) === normText(ans); })) errors.push('item ' + i + ': a new word is the answer');
      } else if (kind === 'choice') {
        var o = q.options, a = Number(q.answer);
        if (!Array.isArray(o) || o.length !== 3 || o.some(function (x) { return !isObj(x) || !aiStr(x.en) || !aiStr(x.zh); })) { errors.push('item ' + i + ': "options" must be 3 objects {en, zh}'); return; }
        if (!(a >= 0 && a <= 2) || a !== Math.floor(a)) { errors.push('item ' + i + ': "answer" must be 0, 1 or 2'); return; }
        var ns = o.map(function (x) { return normText(x.en); });
        if (ns[0] === ns[1] || ns[1] === ns[2] || ns[0] === ns[2]) errors.push('item ' + i + ': the options must be different');
        if (!aiSays(evLine, o[a].en) && !(tg && wordRe(tg).test(o[a].en) && wordRe(tg).test(evLine))) errors.push('item ' + i + ': the right option does not match the evidence line');
        o.forEach(function (x, k) { if (k !== a && aiSays(evLine, x.en) && !aiSays(evLine, o[a].en)) errors.push('item ' + i + ': a wrong option is in the evidence line'); });
        Bk.PARA.forEach(function (g) { var l = g.map(normText); if (l.indexOf(ns[a]) >= 0) ns.forEach(function (x, k) { if (k !== a && l.indexOf(x) >= 0) errors.push('item ' + i + ': a wrong option means the same as the answer'); }); });
      } else {
        if (!isObj(q.statement) || !aiStr(q.statement.en) || !aiStr(q.statement.zh)) { errors.push('item ' + i + ': "statement" needs "en" and "zh"'); return; }
        if (q.truth !== 'T' && q.truth !== 'F') { errors.push('item ' + i + ': "truth" must be "T" or "F"'); return; }
        var src = text ? text.en : evid.join(' '), keys = aiKeys(q.statement.en), srcKeys = aiKeys(src), neg = /\b(not|no|never|n't)\b/i;
        var missing = keys.filter(function (k) { return !srcKeys.some(function (x) { return x === k; }); });
        // a contradiction: a number, day or month the text does not have, or an odd number of flips ("not", an opposite word)
        var sw = enWords(q.statement.en).map(function (w) { return w.toLowerCase(); }), ew = enWords(evLine).map(function (w) { return w.toLowerCase(); });
        var opp = AI_OPPOSITE.some(function (pr) { return (sw.indexOf(pr[0]) >= 0 && ew.indexOf(pr[1]) >= 0) || (sw.indexOf(pr[1]) >= 0 && ew.indexOf(pr[0]) >= 0); });
        var flips = (neg.test(q.statement.en) !== neg.test(evLine) ? 1 : 0) + (opp ? 1 : 0), contradicts = missing.length > 0 || flips % 2 === 1;
        if (q.truth === 'T' && contradicts) errors.push('item ' + i + ': a TRUE statement must agree with the text' + (missing.length ? ' (' + missing.join(', ') + ')' : ''));
        if (q.truth === 'F' && !contradicts) errors.push('item ' + i + ': a FALSE statement must differ from the text in a number, day, month, "not" or an opposite word');
        allEn.push(q.statement.en);
      }
      if (q.q && q.q.en) allEn.push(q.q.en);
      (q.options || []).forEach(function (x) { if (isObj(x) && x.en) allEn.push(x.en); });
    });
    targets.forEach(function (t) { if ((seen[String(t.en).toLowerCase()] || 0) !== 1) errors.push('target "' + t.en + '" needs exactly one item'); });
    // 6. vocabulary
    var glossSet = {};
    gloss.forEach(function (g) { Bk.util.tokens(g[0]).forEach(function (w) { glossSet[w] = 1; }); });
    var newNames = {}, whoNames = {};
    (lines || []).forEach(function (l) { var w = aiStr(l.who); if (w && !Bk.CAST[w.toLowerCase()] && !/^you$/i.test(w) && !Bk.nameSet()[w.toLowerCase()]) newNames[w] = 1; whoNames[w.toLowerCase()] = 1; });
    var budget = (ctx.ai && ctx.ai.budget) || AI_BUDGET[tier] || 3;
    if (gloss.length > budget) errors.push('too many new words in "gloss" (at most ' + budget + ')');
    if (ctx.vocab && ctx.vocab.known) {
      var unk = {};
      allEn.forEach(function (e) {
        enWords(e).forEach(function (w) {
          var lw = w.toLowerCase().replace(/[’]/g, '\'');
          if (Bk.isKnown(ctx.vocab.known, lw) || glossSet[lw] || Bk.stems(lw).some(function (x) { return glossSet[x]; })) return;
          if (/^[A-Z]/.test(w) && (Bk.nameSet()[lw] || newNames[w] || whoNames[lw])) return;
          unk[lw] = 1;
        });
      });
      if (Object.keys(unk).length) errors.push('words not in KNOWN WORDS and not in "gloss": ' + Object.keys(unk).slice(0, 8).join(', '));
    }
    // 7. safety: blocked words, web / email / long numbers, at most one new name and a common one
    strings.forEach(function (x) { var b = aiHasBlocked(x); if (b) errors.push('not allowed in a scene: ' + b); });
    var nn = Object.keys(newNames);
    if (nn.length > 1) errors.push('at most one new first name');
    nn.forEach(function (x) { if (!/^[A-Z][a-z]{1,9}$/.test(x)) errors.push('"' + x + '" is not a common first name'); });
    // 8. not a repeat
    var body = normText(sceneEn.join(' ')), h = Model().h6(body);
    Object.keys(ctx.scDocs || {}).forEach(function (k) {
      var d = ctx.scDocs[k];
      if (isObj(d) && isObj(d.json)) { var j2 = d.json, e2 = (j2.lines || []).map(function (l) { return l.en; }).concat(j2.text ? [j2.text.title && j2.text.title.en, j2.text.en] : []); if (Model().h6(normText(e2.join(' '))) === h) errors.push('this scene is the same as a stored one'); }
    });
    // 9. calendar
    sceneEn.forEach(function (e) { aiDatesOk(e, ctx.asOf).forEach(function (x) { errors.push(x); }); });
    if (errors.length) return out();
    var norm0 = JSON.parse(JSON.stringify(json));
    var id = 'ai-' + Model().h6(JSON.stringify(norm0));
    var scene = null;
    try { scene = aiSceneOf(norm0, id); } catch (e) { errors.push('the scene could not be converted'); return out(); }
    // every question renders and passes the ordinary item check
    var c2 = {};
    Object.keys(ctx).forEach(function (k) { c2[k] = ctx[k]; });
    c2.scDocs = {}; c2.scDocs['exam-sc-' + id.slice(3)] = { json: norm0 };
    scene.frames.forEach(function (fr) {
      var p = realize(scene, fr, { fmt: fr.f }, c2, 'ai|' + fr.k);
      var it = p ? render(['0', fr.f, scene.id, fr.k, '', '', paramString(p, orderKeys(fr))], c2) : null;
      var v = it ? validateItem(it, c2.vocab, c2) : { ok: false, errors: ['no item'] };
      if (!v.ok) errors.push('question ' + fr.k + ' does not work: ' + v.errors.slice(0, 2).join('; '));
    });
    if (errors.length) return out();
    return { ok: true, errors: [], json: norm0, scene: scene };
  }
  function aiKeys(s) {
    var out = [], WDs = Bank().WEEKDAYS, MS = Bank().MONTHS;
    enWords(s).forEach(function (w) { var lw = w.toLowerCase(); if (WDs.indexOf(lw) >= 0 || MS.indexOf(lw) >= 0) out.push(lw); });
    String(s).replace(/£?\d+(?:[.:]\d+)?/g, function (m) { out.push(m.replace(/^£/, '')); return m; });
    enWords(s).forEach(function (w) { var n = normNumber(w.toLowerCase()); if (n != null && !/^\d/.test(w)) out.push(String(n)); });
    return out;
  }
  // §6.3: lines → one say for every question, text → text, each item → one fixed question (its own values and options)
  function aiSceneOf(json, id) {
    var Bk = Bank(), tier = Number(json.tier) >= 1 && Number(json.tier) <= 4 ? Number(json.tier) : 1;
    var sc = { id: id, v: 1, zh: String(json.zh), place: AI_PLACES[json.place] ? json.place : 'social', tier: tier, ch: 0, needs: [], roles: {}, ielts: [], gloss: {}, ai: true, frames: [] };
    (json.gloss || []).forEach(function (g) { if (Array.isArray(g) && g[0]) sc.gloss[String(g[0])] = String(g[1] || ''); });
    var letters = ['A', 'B', 'C', 'D'], who = {}, say = null, text = null;
    if (Array.isArray(json.lines)) say = json.lines.map(function (l) {
      var w = String(l.who || '').trim(), lw = w.toLowerCase(), key;
      if (Bk.CAST[lw]) key = lw;
      else if (lw === 'you') key = 'you';
      else { if (!who[w]) { var L = letters[Object.keys(who).length] || 'D'; who[w] = L; sc.roles[L] = w; } key = who[w]; }
      return [key, String(l.en), String(l.zh)];
    });
    if (isObj(json.text)) {
      var en = aiSentences(json.text.en), zh = aiZhSentences(json.text.zh);
      text = { kind: json.text.kind, title: [String(json.text.title.en), String(json.text.title.zh)],
        lines: en.length === zh.length ? en.map(function (e, i) { return [e, zh[i]]; }) : [[String(json.text.en), String(json.text.zh)]] };
    }
    json.items.forEach(function (q, i) {
      var fmt = q.fmt, kind = AI_KIND[fmt], tg = String(q.target || '').trim(), tl = tg.toLowerCase();
      var fr = { f: fmt, k: 'i' + i, subs: (AI_SUBS[fmt] || []).slice(), at: String(json.zh), slots: {}, bind: [], ai: true };
      if (say) fr.say = say;
      if (text) fr.text = text;
      var pairT = /^(\w+)\s+(?:vs\.?|\/)\s+(\w+)$/i.exec(tg);
      if (kind === 'type') {
        var ans = typeof q.answer === 'number' ? String(q.answer) : String(q.answer).trim(), num = /^\d/.test(ans);
        fr.slots = { a: num ? 'count' : 'word' };
        fr.fixed = { a: num ? String(Number(ans.replace(/[^\d.]/g, ''))) : ans.toLowerCase() };
        fr.only = { a: [fr.fixed.a] };
        fr.bind = ['a'];
        var qen = isObj(q.q) && q.q.en ? String(q.q.en) : '';
        if (fmt === 'RG' && /_{2,}/.test(qen)) fr.sum = [qen.replace(/_{2,}/, '?a'), String(q.q.zh)];
        else fr.notes = { title: ['My notes', '我的笔记'], rows: [[qen, String(q.q.zh), '?a']] };
        fr.q = { zh: String(q.q.zh) };
        fr.limit = { words: tier >= 2 ? 2 : 1, num: true };
      } else if (kind === 'choice') {
        var a = Number(q.answer), o = q.options.slice();
        var right = o.splice(a, 1)[0];
        fr.opts = [right].concat(o).map(function (x) { return '=' + String(x.en).replace(/\|/g, '/') + '|' + String(x.zh).replace(/\|/g, '/'); });
        fr.q = { en: isObj(q.q) && q.q.en ? String(q.q.en) : undefined, zh: String(q.q.zh) };
        if (!fr.q.en) delete fr.q.en;
        if (pairT) { fr.slots = { p: 'pair' }; fr.fixed = { p: pairT[1].toLowerCase() }; fr.only = { p: [pairT[1].toLowerCase(), pairT[2].toLowerCase()] }; fr.bind = ['p']; }
        else if (tl) { fr.slots = { w: 'word' }; fr.fixed = { w: tl }; fr.only = { w: [tl] }; fr.bind = ['w']; }
      } else {
        fr.stmt = { en: String(q.statement.en), zh: String(q.statement.zh) };
        fr.truth = q.truth;
        fr.q = { zh: String((q.q && q.q.zh) || '读一读，判断下面这句话和原文一致吗') };
        if (tl) { fr.slots = { w: 'word' }; fr.fixed = { w: tl }; fr.only = { w: [tl] }; fr.bind = ['w']; }
      }
      sc.frames.push(fr);
    });
    return sc;
  }

  /* ───────────────────────────── sessions and counting ───────────────────────────── */
  function session(rows, ctx) { return (rows || []).map(function (r) { return render(r, ctx); }); }
  /**
   * countItems(index, learned, host, opts) → { byKind, total, byFmt, sigShare? } — see ExamBank.count (§4.9).
   * For every learned target × every format of its kind × every frame that fits × every wording: one item with a fixed
   * seed that passes validateItem counts once.
   */
  function countItems(index, learned, host, opts) {
    opts = opts || {};
    var Bk = Bank(), asOf = opts.asOf || '2099-01-01';
    var vocab = Bk.vocab(index, learned, host, asOf);
    var ctx = { index: index, learned: learned, host: host, asOf: asOf, vocab: vocab, tier: 1, recent: {} };
    var byKind = {}, byFmt = {}, total = 0, sigs = {};
    var FMTS = { word: ['VM', 'VS', 'VG', 'LF', 'LN', 'LC', 'LP', 'LM', 'RN', 'RT', 'RM', 'RG', 'WT'], pair: ['LP', 'LC', 'PS'], sym: ['PS', 'SR'], dict: ['LD', 'SR'], write: ['WT', 'GR'],
      quiz: ['GF', 'GP', 'GC', 'GR'], read: ['RN', 'RT'], coll: ['VC', 'VG', 'WT'], speak: ['SP'] };
    var targets = [];
    learned.forEach(function (L, id) { var it = itemOf(ctx, id); if (it) targets.push(it); });
    targets.forEach(function (t) {
      (FMTS[t.kind] || []).forEach(function (fmt) {
        var concept = (t.kind === 'quiz' || t.kind === 'read') ? Bk.conceptOf(t, index) : null;
        if ((t.kind === 'quiz' || t.kind === 'read') && !concept) return;
        var anchorSub = concept ? Bk.tagsOf(t, index)[0] : null;
        Bk.frames(fmt).forEach(function (e) {
          if (!needsMet(ctx, e.scene, e.frame)) return;
          if (!frameFits(e, fmt, t, null, concept, anchorSub, {}, ctx)) return;
          var nAlt = e.frame.alt ? e.frame.alt.length : 1;
          for (var a = 0; a < nAlt; a++) {
            var sp = { targetItem: t, fmt: fmt, concept: concept, alt: e.frame.alt ? a : null };
            var p = realize(e.scene, e.frame, sp, ctx, 'count|' + t.id + '|' + e.scene.id + '|' + e.k + '|' + a);
            if (!p) continue;
            var row = ['0', fmt, e.scene.id, e.k, t.id, '', paramString(p, orderKeys(e.frame))];
            var it = render(row, ctx);
            if (!it || !validateItem(it, vocab, ctx).ok) continue;
            byKind[t.kind] = (byKind[t.kind] || 0) + 1;
            byFmt[fmt] = (byFmt[fmt] || 0) + 1;
            total++;
            sigs[it.sig] = 1;
          }
        });
      });
    });
    var out = { byKind: byKind, byFmt: byFmt, total: total };
    if (opts.random) {
      var r = rng('count-random'), made = 0, distinct = {}, tries = 0;
      while (made < opts.random && tries < opts.random * 20) {
        tries++;
        var t = targets[Math.floor(r() * targets.length)];
        var fl = FMTS[t.kind] || [];
        if (!fl.length) continue;
        var fmt = fl[Math.floor(r() * fl.length)];
        var res = item({ target: t.id, fmt: fmt, seed: 'rand' + tries }, ctx);
        if (!res) continue;
        made++;
        distinct[res.item.sig] = 1;
      }
      out.sigShare = made ? Object.keys(distinct).length / made : 0;
      out.random = made;
    }
    return out;
  }

  return {
    rng: rng, item: item, render: render, session: session, check: check, validateItem: validateItem, calDate: calDate, siblings: siblings,
    sceneSpec: sceneSpec, scenePrompt: scenePrompt, validateScene: validateScene,
    norm: norm, writeForms: writeForms, parseParams: parseParams, paramString: paramString, countItems: countItems,
    // a word's Chinese as she reads it (zh.clean), the spacing convention (zh.space), a target's short label, her accent
    zh: { clean: zhClean, space: zhSp }, label: label, accentOf: accentOf,
    // helpers the scheduler and the tests use
    _: { realize: realize, frameFits: frameFits, valuesForTarget: valuesForTarget, itemOf: itemOf, teacherSentences: teacherSentences, sentencesWith: sentencesWith,
      calCandidates: calCandidates, speechWords: speechWords, checkBlank: checkBlank, checkSpell: checkSpell, collKey: collKey, needsMet: needsMet, doneSet: doneSet,
      fmtNatural: fmtNatural, info: info, dateParts: dateParts, aiSceneOf: aiSceneOf, aiScene: aiScene, aiScenes: aiScenes, aiSays: aiSays, canBind: canBind,
      symShow: symShow, symAsk: symAsk, symClash: symClash, oneWord: oneWord }
  };
});
