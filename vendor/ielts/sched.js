/* 雅思工作台 · 考试 · app/exam/sched.js — owner: E1（考试数据）. docs/EXAM.md §2, §3, §5, §10.3.
 *
 * The exam's scheduler and scorer: what she has learned in the exam's sense, each item's memory (Model.memory, one
 * memory model for lessons, patrols and exams), every sub-skill's accuracy / evidence / status / retirement / priority
 * (§3.4), the writing and speaking criteria (§3.4.1), the plan of a session (§3.5: weak / due / fresh shares, caps,
 * warm-up and finish), today's offer (§2.2–§2.3), and the IELTS estimate: an ability on the band scale from each item's
 * difficulty, projected onto a 40-item paper and converted with the host's tables (§5.3).
 * Pure: no DOM, no WB, no clock (asOf / now are inputs). UMD: Node → module.exports; browser → BaseEngine.ExamSched.
 *
 * §10.9 budget: ≤ 100 KB (set by the lead after step 2a).
 *
 * 2026-09-27 E1  CONTRACT-REQUESTs from ui.js (E2; numbered as in ui.js): the data side is done here; store.js's change
 *               log repeats them in step 2a.
 *               5 SubState.note: measured facts only, ≤ 30 字 ('今天对 1 / 3', '这 7 天对 2 / 5', '上次（9月24日）错了', or '');
 *                 sky().stars[].zh stays the SKILLS name (already specific: '/e/–/æ/（bed / bad）').
 *               6 plan('free', st, { scope, n, seed }): scope '' | 'skill:L|R|W|S' | 'weak' | 'new' | 'place:<id>', n 5 | 10 | 15;
 *                 a place scope uses that place's own scenes (no generic shells), a frame once per session; free practice
 *                 and 加练 may use the long formats (SP SR …). Fewer rows come back when her learned content cannot fill n
 *                 (at 9/27: reading 1, speaking 1, place:market 0).
 *                 plan('more', st, { sub, n, seed, exclude }): 加练 on one sub-skill (default 2; a star's card asks 5): only
 *                 that sub, targets not answered today and not in exclude, scenes not in her last sessions first.
 *
 * Exam document leaves (§7.2), as this module reads them: a[sid][q][HHMMSS] = [result, fmt, scene, main, subs, resp, key,
 * ms, flags, sig]. subs: space-separated sub-skill ids, the main one first; an id may carry the value this answer gave it
 * and a weight — 'L-end:0', 'G-plural:0*.5', 'V-spell:.5' — when that differs from the leaf's own result (the store
 * writes them from Verdict.att). Extra flag: 'o' = the target's letters were right although the IELTS score is 0
 * (over the word limit): the word's memory counts as right (§3.8). Letter case never matters (2026-09-30, §4.2.1): leaves
 * written before that may name W-caps or carry the flag 'k' (a lower-case weekday); they load as they are, W-caps is not
 * counted, and a typed spelling that was wrong only by its capitals counts for no sub-skill (capsOnly; a sentence's other
 * sub-skills count as its leaf says).
 */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) { var BE = root.BaseEngine = root.BaseEngine || {}; if (!BE.ExamSched) BE.ExamSched = api; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (root) {
  'use strict';

  var own = Object.prototype.hasOwnProperty;
  var isNode = typeof module === 'object' && module && module.exports && typeof require === 'function';
  var M = null, B = null, G = null;
  function Model() { if (!M) { if (isNode) { try { M = require('../base/model.js'); } catch (e) { M = null; } } if (!M && root && root.BaseEngine) M = root.BaseEngine.Model || null; } return M; }
  function Bank() { if (!B) { if (isNode) { try { B = require('./bank.js'); } catch (e) { B = null; } } if (!B && root && root.BaseEngine) B = root.BaseEngine.ExamBank || null; } return B; }
  function Gen() { if (!G) { if (isNode) { try { G = require('./gen.js'); } catch (e) { G = null; } } if (!G && root && root.BaseEngine) G = root.BaseEngine.ExamGen || null; } return G; }
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function keys(o) { return isObj(o) ? Object.keys(o) : []; }
  function isYmd(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s); }

  /* ───────────────────────────── constants (§5.1, §5.3, §3.4; uncalibrated starting values) ───────────────────────────── */
  var CONST = {
    A: 2.0, REF_OFF: -0.1, U: 0.25, PRIOR: { mu: [2.5, 2.5, 4.0, 5.0, 5.5], sd: 1.25 }, TIER_OFF: [0, 0, 1.5, 2.8],
    T4: { L: [4.5, 5.5, 6.2, 6.8], RA: [5.5, 6.3, 7.0], RG: [3.8, 4.8, 6.2] },
    ADJ: { slow: -0.3, replay: -0.2, confuse: 0.2, stretch: 0.2, long: 0.2 }, CEIL: [4.5, 6.0, 7.5],
    QUIZ_SEC: [360, 480], QUIZ_N: [6, 10], QUIZ_N_DEFAULT: 8, SHARES: { quiz: [0.5, 0.3, 0.2], week: [0.3, 0.3, 0.4] },
    ACC: { weak: 0.70, steady: 0.85, retire: 0.80 }, HALF_LIFE_DAYS: 21, M_MIN: 2, WINDOW: 28, MISS_DAYS: 7,
    IMPORTANCE: { 'L-num': 1.3, 'L-date': 1.3, 'V-spell': 1.25, 'L-dict': 1.2, 'L-spell': 1.2, 'L-rule': 1.2, 'L-end': 1.2, 'G-be': 1.2, 'G-3sg': 1.2,
      'G-article': 1.15, 'W-sent': 1.15, 'V-coll': 1.1, 'R-tfng': 1.1, 'R-para': 1.1, 'L-price': 1.1, 'L-time': 1.1, 'L-turn': 1.1 },
    CRIT_BOOST: 1.3, RELEARN_MAX: 2, MAINT_MAX: 1, MAINT_DAYS: 14, SETTLED_H: 30
  };
  function importance(s) { if (own.call(CONST.IMPORTANCE, s)) return CONST.IMPORTANCE[s]; return /^P-/.test(s) ? 0.8 : 1.0; }

  /* ───────────────────────────── IELTS tables (the host's L_TABLE / RA_TABLE / RG_TABLE, word for word) ───────────────────────────── */
  var TABLES = {
    L: [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [2, 2], [1, 1], [0, 0]],
    RA: [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5], [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [2, 2], [1, 1], [0, 0]],
    RG: [[40, 9], [39, 8.5], [37, 8], [36, 7.5], [34, 7], [32, 6.5], [30, 6], [27, 5.5], [23, 5], [19, 4.5], [15, 4], [12, 3.5], [9, 3], [6, 2.5], [3, 2], [1, 1], [0, 0]]
  };
  // same algorithm as the host's rawToBand / overall
  function rawToBand(raw, table) {
    if (raw === '' || raw == null || isNaN(raw)) return null;
    var r = Math.max(0, Math.min(40, Math.round(Number(raw))));
    for (var i = 0; i < table.length; i++) if (r >= table[i][0]) return table[i][1];
    return 0;
  }
  function overall(bands) {
    if (bands.some(function (b) { return b == null; })) return null;
    var H = bands.reduce(function (s, b) { return s + Math.round(b * 2); }, 0);
    return Math.floor((H + 2) / 4) / 2;
  }

  /* ───────────────────────────── the estimate (§5.3) ───────────────────────────── */
  function sig(x) { return 1 / (1 + Math.exp(-x)); }
  /** estimate(items: [{ b, c, x, w? }], prior: { mu, sd }) → { mean, sd, lo, hi } (posterior on 0, 0.05 … 9; lo / hi = 10 % / 90 %) */
  function estimate(items, prior) {
    prior = prior || { mu: CONST.PRIOR.mu[0], sd: CONST.PRIOR.sd };
    var lps = [], A = CONST.A;
    for (var i = 0; i <= 180; i++) {
      var th = i * 0.05, lp = -0.5 * Math.pow((th - prior.mu) / prior.sd, 2);
      for (var k = 0; k < items.length; k++) {
        var it = items[k], c = it.c || 0, p = c + (1 - c) * sig(A * (th - it.b)), w = it.w == null ? 1 : it.w;
        p = Math.min(1 - 1e-12, Math.max(1e-12, p));
        lp += w * (it.x ? Math.log(p) : Math.log(1 - p));
      }
      lps.push(lp);
    }
    var mx = Math.max.apply(null, lps), ws = lps.map(function (l) { return Math.exp(l - mx); }), Z = ws.reduce(function (a, b) { return a + b; }, 0);
    var mean = 0, v = 0;
    ws.forEach(function (w, i) { mean += i * 0.05 * w / Z; });
    ws.forEach(function (w, i) { v += Math.pow(i * 0.05 - mean, 2) * w / Z; });
    var cum = 0, lo = null, hi = null;
    ws.forEach(function (w, i) { cum += w / Z; if (lo === null && cum >= 0.1 - 1e-12) lo = i * 0.05; if (hi === null && cum >= 0.9 - 1e-12) hi = i * 0.05; });
    return { mean: r2(mean), sd: r2(Math.sqrt(v)), lo: r2(lo), hi: r2(hi) };
  }
  function r2(x) { return Math.round(x * 100) / 100; }
  function refB(table) { var out = []; for (var j = 1; j <= 40; j++) out.push(rawToBand(j, table) + CONST.REF_OFF); return out; }
  function raw40(theta, table) { var s = 0, bs = refB(table); for (var j = 0; j < 40; j++) s += sig(CONST.A * (theta - bs[j])); return s; }
  /**
   * band(skill, est, opts) → { band, lo, hi, raw40, table, alt } — skill 'L' | 'R'; opts = { examType: 'A'|'G'|'', calibrated: offset|null }
   * The reading headline uses the Academic table unless she chose General Training; alt is the other table.
   */
  function band(skill, est, opts) {
    opts = opts || {};
    var cal = opts.calibrated != null ? Number(opts.calibrated) : null, u = cal != null ? 0 : CONST.U, off = cal || 0;
    var tk = skill === 'L' ? 'L' : opts.examType === 'G' ? 'RG' : 'RA';
    function one(t) {
      var T = TABLES[t], th = est.mean + off;
      var R = raw40(th, T);
      return { band: rawToBand(R, T), lo: rawToBand(raw40(Math.max(0, est.lo + off - u), T), T), hi: rawToBand(raw40(Math.min(9, est.hi + off + u), T), T), raw40: r2(R), table: t };
    }
    var out = one(tk);
    if (skill !== 'L') { var ot = one(tk === 'RA' ? 'RG' : 'RA'); out.alt = { table: ot.table, raw40: ot.raw40, band: ot.band, lo: ot.lo, hi: ot.hi }; }
    return out;
  }

  /* ───────────────────────────── exam documents (§7.1, §7.2) ───────────────────────────── */
  function hms6(s) { return /^\d{6}$/.test(String(s)) ? String(s) : null; }
  // leaves → one record per session: meta (s[sid]), the earliest leaf (date, time) of every question, the earliest end, long
  // answers, marks
  function readDocs(examDocs) {
    var by = {};
    function rec(sid) { return by[sid] || (by[sid] = { sid: sid, meta: null, a: {}, c: {}, e: null, w: {}, m: {} }); }
    keys(examDocs).forEach(function (id) {
      if (!/^exam-\d{4}-\d{2}-\d{2}(-\d+)?$/.test(id)) return;
      var d = examDocs[id];
      if (!isObj(d)) return;
      keys(d.s).forEach(function (sid) { var x = rec(sid); if (!x.meta && isObj(d.s[sid])) x.meta = d.s[sid]; });
      keys(d.a).forEach(function (sid) {
        var x = rec(sid);
        keys(d.a[sid]).forEach(function (q) { keys(d.a[sid][q]).forEach(function (t) { if (hms6(t) && Array.isArray(d.a[sid][q][t])) (x.c[q] = x.c[q] || []).push([t, d.a[sid][q][t]]); }); });
      });
      keys(d.e).forEach(function (sid) { var x = rec(sid); keys(d.e[sid]).forEach(function (t) { if (hms6(t) && (!x.e || t < x.e)) x.e = t; }); });
      keys(d.w).forEach(function (sid) { var x = rec(sid); keys(d.w[sid]).forEach(function (q) { keys(d.w[sid][q]).forEach(function (t) { if (!hms6(t)) return; var c = x.w[q]; if (!c || t < c[0]) x.w[q] = [t, d.w[sid][q][t]]; }); }); });
      keys(d.m).forEach(function (sid) { var x = rec(sid); keys(d.m[sid]).forEach(function (k) { x.m[k] = d.m[sid][k]; }); });
    });
    var list = [];
    keys(by).forEach(function (sid) {
      var x = by[sid];
      if (!x.meta || !isYmd(x.meta.d)) return;
      keys(x.c).forEach(function (q) { x.c[q].forEach(function (p) { if (!x.a[q] || stampOf(x, p) < stampOf(x, x.a[q])) x.a[q] = p; }); });
      delete x.c;
      list.push(x);
    });
    list.sort(function (a, b) { return a.meta.d < b.meta.d ? -1 : a.meta.d > b.meta.d ? 1 : String(a.meta.t0 || '') < String(b.meta.t0 || '') ? -1 : 1; });
    return list;
  }
  // the date a leaf belongs to: its own (from 2026-10-11, §7.2), else the session's day (the next one past midnight)
  function leafDate(x, hms, leaf) { var t0 = String(x.meta.t0 || '000000'); return leaf && isYmd(leaf[10]) ? leaf[10] : hms < t0 ? Model().util.addDays(x.meta.d, 1) : x.meta.d; }
  function stampOf(x, p) { return leafDate(x, p[0], p[1]) + p[0]; }
  // the day a session ended: its last answer's, the next one when closed after midnight
  function endDay(x) {
    var last = '';
    keys(x.a).forEach(function (q) { var s = stampOf(x, x.a[q]); if (s > last) last = s; });
    if (!last) return x.e ? leafDate(x, x.e) : x.meta.d;
    return x.e && x.e < last.slice(10) ? Model().util.addDays(last.slice(0, 10), 1) : last.slice(0, 10);
  }
  // 'L-date V-spell:0 G-plural:0*.5' → [[sub, value|null, weight]]
  function parseSubs(s) {
    return String(s || '').split(/\s+/).filter(Boolean).map(function (t) {
      var m = /^([A-Za-z][A-Za-z0-9-]*)(?::([0-9.]+))?(?:\*([0-9.]+))?$/.exec(t);
      return m ? [m[1], m[2] != null ? Number(m[2]) : null, m[3] != null ? Number(m[3]) : 1] : null;
    }).filter(Boolean);
  }
  function leafOk(leaf) {
    var r = leaf[0], fmt = leaf[1];
    if (r == null) return null;
    if (fmt === 'LD' || fmt === 'SR') return Number(r) >= 80;
    return r === 1 || r === true;
  }
  // the evidence mode an exam answer would give core.record (§3.8)
  function leafMode(leaf) {
    var fmt = leaf[1], f = String(leaf[8] || '');
    if (fmt === 'LD') return 'D' + (/[123]/.exec(f) || ['1'])[0];
    if (fmt === 'WT') return f.indexOf('s') >= 0 ? 'S' : 'W';
    if (fmt === 'SP') return 'K';
    if (/^(LF|LN|RG|VS|VG)$/.test(fmt) || (fmt === 'RN' && /[a-z]/i.test(String(leaf[6] || '')) && false)) return f.indexOf('s') >= 0 ? 'S' : (f.indexOf('h') >= 0 || f.indexOf('k') >= 0) ? 'H' : 'T';
    return 'P';
  }
  // an old answer (before 2026-09-30) wrong only by its capitals, right by today's rule: a typed spelling (VS / VG) with
  // every letter right, or a sentence (WT) whose words are right and whose only wrong sub-skill was W-caps
  function capsOnly(leaf) {
    if (leaf[0] !== 0) return false;
    if (/^V[SG]$/.test(leaf[1])) return Model().spellCheck(leaf[5], leaf[6]).ok;
    var s = leaf[1] === 'WT' ? parseSubs(leaf[4]) : [];
    return s.some(function (a) { return a[0] === 'W-caps'; }) && s.every(function (a) { return a[0] === 'W-caps' || a[1] === 1; })
      && Model().compareWrite(String(leaf[5] || ''), String(leaf[6] || '')).ok;
  }
  function memoryOk(leaf) {
    var f = String(leaf[8] || '');
    if (f.indexOf('o') >= 0) return true;
    return leafOk(leaf);
  }

  /* ───────────────────────────── state (§3.1–§3.4, §10.4 ExamState) ───────────────────────────── */
  function hostOf(input) { return input.host || { profile: input.profile || {}, reviews: input.reviews || {} }; }
  // exam-sense learned (§3.2): the earliest completion of the item's steps, before today; a symbol only through its own
  // symbols step (the symbol review is "seen", not learned); collocations from their home step
  function learnedMap(index, phrases, profile, asOf) {
    var cp = (profile && profile.cp) || {}, out = new Map();
    if (!index) return out;
    index.items.forEach(function (it, id) {
      var L = null;
      it.steps.forEach(function (sk) {
        var si = index.steps.get(sk), c = cp[sk];
        if (!si || !isYmd(c)) return;
        if (it.kind === 'sym' && si.type !== 'symbols') return;
        if (!L || c < L) L = c;
      });
      if (L && L < asOf) out.set(id, L);
    });
    (phrases || []).forEach(function (c) { var L = cp[c.home]; if (isYmd(L) && L < asOf) out.set(c.id, L); });
    return out;
  }
  function visibility(mem) {
    if (!mem || !mem.n) return null;
    var v = mem.allInfOk ? Math.max(mem.p, 0.5) : mem.p;
    if (mem.lastOk === false) v = Math.min(v, Model().VIS_MISS);
    return v;
  }
  function sightOf(v) { return v == null ? 'blur' : v >= 0.7 ? 'clear' : v >= 0.4 ? 'blur' : 'fog'; }
  var SIGHT_RANK = { fog: 0, blur: 1, clear: 2 };
  function groupOfKind(k) { return { word: 'V', sym: 'P', pair: 'P', quiz: 'G', read: 'R', dict: 'L', write: 'W', speak: 'S', coll: 'V' }[k] || 'V'; }
  function groupOfSub(s) { var d = Bank().SKILLS[s]; if (d) return d.group; var m = /^([A-Z])-/.exec(String(s)); return m ? m[1] : 'V'; }
  // a skill's name in her accent (no /ɒ/, bird /ɝː/ for an American-accent learner; ExamBank.skillZh)
  function accOf(st) { var p = st._.profile; return p && p.accent === 'gb' ? 'gb' : 'us'; }
  function subZh(st, id) { return Bank().skillZh(id, accOf(st)) || id; }

  /**
   * state(input) → ExamState. input = { index, answers, phrases?, examDocs, planDocs, scDocs, profile, host?, mocks, asOf,
   * now, core: { mode, patrol, bp } | null, rev?, legacyRv?, week? }.
   */
  function state(input) {
    input = input || {};
    var Bk = Bank(), Mo = Model(), U = Mo.util, asOf = input.asOf, index = input.index;
    var host = hostOf(input), profile = host.profile || {};
    var phrases = input.phrases || (index ? Bk.phrases(index) : []);
    var learned = learnedMap(index, phrases, profile, asOf);
    var sessions = readDocs(input.examDocs || {});
    // exam answers per item and date (earliest), for memory and to know which ev answers came from an exam
    var examFirst = new Map(), examCounted = {}, lastFmt = new Map(), fmtSeen = {}, frameLast = new Map(), sigs = new Set(), usedToday = {}, recentScenes = [], recentNames = [];
    sessions.forEach(function (x) {
      keys(x.a).forEach(function (q) {
        var t = x.a[q][0], leaf = x.a[q][1], d = leafDate(x, t, leaf), main = leaf[3], flags = String(leaf[8] || '');
        if (d > asOf) return;
        if (main && flags.indexOf('r') < 0) {
          var m = examFirst.get(main) || new Map();
          var cur = m.get(d);
          if (!cur || t < cur.hms) m.set(d, { hms: t, leaf: leaf });
          examFirst.set(main, m);
          if (flags.indexOf('c') >= 0) examCounted[main + '\u0000' + d] = 1;
          if (d === asOf) usedToday[main] = 1;
        }
        if (main) {
          var prev = fmtSeen[main];
          var stamp = d + ' ' + t;
          if (!prev || stamp > prev.stamp) { fmtSeen[main] = { stamp: stamp, fmt: leaf[1] }; lastFmt.set(main, leaf[1]); }
        }
        if (leaf[9] && U.diffDays(d, asOf) <= 30) sigs.add(leaf[9]);
      });
      (x.meta.p || []).forEach(function (row) {
        if (!Array.isArray(row) || !row[2]) return;
        var k = row[2] + '#' + row[3], cur2 = frameLast.get(k);
        if (!cur2 || x.meta.d > cur2) frameLast.set(k, x.meta.d);
        if (x.meta.d === asOf && row[4]) usedToday[row[4]] = 1;
      });
    });
    var recentSess = sessions.slice(-3);
    recentSess.forEach(function (x) { (x.meta.p || []).forEach(function (row) { if (Array.isArray(row) && recentScenes.indexOf(row[2]) < 0 && recentSess.indexOf(x) >= recentSess.length - 2) recentScenes.push(row[2]); var pp = parseP(row[6]); ['A', 'B', 'C'].forEach(function (k) { if (pp[k] && /^[A-Z]/.test(pp[k]) && recentNames.indexOf(pp[k]) < 0) recentNames.push(pp[k]); }); }); });
    // every item's first answers: ev / host (Model.answers) ∪ exam first answers on dates without one (§3.1, §3.9)
    var answers = input.answers || new Map();
    var ansAll = new Map();
    function listFor(id) {
      if (ansAll.has(id)) return ansAll.get(id);
      var base = answers.get(id) || [], ex = examFirst.get(id), list = base;
      if (ex) {
        var have = {};
        base.forEach(function (a) { have[a.d] = 1; });
        var add = [];
        ex.forEach(function (v, d) { if (!have[d]) add.push({ d: d, hms: v.hms, ok: memoryOk(v.leaf), src: leafMode(v.leaf), inf: false, exam: true, pct: v.leaf[1] === 'LD' ? Number(v.leaf[0]) : undefined }); });
        if (add.length) list = base.concat(add).sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
      }
      ansAll.set(id, list);
      return list;
    }
    var mem = new Map(), info = new Map(), phraseOf = {};
    phrases.forEach(function (c) { phraseOf[c.id] = c; });
    learned.forEach(function (L, id) {
      var it = index.items.get(id) || (own.call(phraseOf, id) ? phraseOf[id] : null);
      if (!it) return;
      var list = listFor(id);
      if (list.length && list[list.length - 1].d > asOf) list = list.filter(function (a) { return a.d <= asOf; });   // sorted by date
      var mm = Mo.memory(it, list, L, asOf);
      mem.set(id, mm);
      var real = list.some(function (a) { return !a.inf; });
      info.set(id, { id: id, it: it, L: L, mem: mm, vis: visibility(mm), real: real, list: list, today: list.some(function (a) { return a.d === asOf; }) || !!usedToday[id],
        lastDate: list.length ? list[list.length - 1].d : null });
    });
    // sub-skill attempts (§3.4)
    var att = subAttempts(input, index, phrases, learned, answers, sessions, examCounted, host, listFor);
    var crit = criteria({ examDocs: input.examDocs, asOf: asOf, sessions: sessions });
    var subs = subskillsFrom(att, asOf, crit, input);
    var weak = [];
    subs.forEach(function (s, id) { if (s.status === 'weak') weak.push(id); });
    weak.sort(function (a, b) { return subs.get(b).prio - subs.get(a).prio || (a < b ? -1 : 1); });
    var chapter = chapterNow(index, profile, asOf, input.week);
    var st = {
      v: 2, asOf: asOf, rev: input.rev || 0, mode: input.core ? (input.core.mode || 'full') : 'none',
      learned: learned, mem: mem, subs: subs, crit: crit, weak: weak,
      lastFmt: lastFmt, recentScenes: recentScenes, frameLast: frameLast, sigs: sigs, chapter: chapter,
      sessions: sessionSummaries(sessions), weeks: new Map(), est: {}, offer: null,
      ai: { available: !!input.ai, scenesToday: 0, scenesWeek: 0, on: { scenes: !(input.aiOn && input.aiOn.scenes === false), marking: !(input.aiOn && input.aiOn.marking === false) } }
    };
    // AI scenes asked for today / this week (§6.8: at most 1 a day, 5 a week), counted from the stored scene documents
    keys(input.scDocs || {}).forEach(function (id) {
      var d = input.scDocs[id];
      if (!isObj(d) || !isYmd(d.at)) return;
      if (d.at === asOf) st.ai.scenesToday++;
      if (U.diffDays(d.at, asOf) < 7 && d.at <= asOf) st.ai.scenesWeek++;
    });
    // how often each of Claude's scene questions was used (§6.5: an unused AI scene first, up to 3 uses a question)
    var aiUses = {};
    sessions.forEach(function (x) { (x.meta.p || []).forEach(function (r) { if (Array.isArray(r) && /^ai-/.test(r[2])) aiUses[r[2] + '#' + r[3]] = (aiUses[r[2] + '#' + r[3]] || 0) + 1; }); });
    Object.defineProperty(st, '_', { enumerable: false, value: {
      index: index, phrases: phrases, host: host, profile: profile, info: info, att: att, sessions: sessions, usedToday: usedToday, recentNames: recentNames,
      vocab: Bk.vocab(index, learned, host, asOf), core: input.core || null, now: input.now || null, week: input.week || null, planDocs: input.planDocs || {}, scDocs: input.scDocs || {},
      listFor: listFor, dictScore: input.dictScore || null, speechToks: input.speechToks || null, fdClose: input.fdClose || null, mocks: input.mocks || {}, aiUses: aiUses
    } });
    st.weeks = weekResultsCached(st);
    st.est = estimatesOf(st);
    return st;
  }
  // the weekly results change only with the weekly parts, their marks, the mocks and the profile's type and target: cached on that
  var WEEKS_CACHE = { key: null, index: null, val: null };
  function weekResultsCached(st) {
    var X = st._, parts = [];
    X.sessions.forEach(function (x) { if ((x.meta.k === 'week' || x.meta.k === 'month') && x.meta.d <= st.asOf) parts.push(x.sid + ':' + (x.e || '') + ':' + keys(x.a).map(function (q) { return q + '@' + x.a[q][0]; }).join(',') + ':' + keys(x.m).join(',')); });
    if (!parts.length) { X.weeksAll = new Map(); return X.weeksAll; }
    var key = JSON.stringify([parts, X.mocks, X.profile && X.profile.examType, X.profile && X.profile.target, X.profile && X.profile.cp]);
    if (WEEKS_CACHE.key === key && WEEKS_CACHE.index === X.index) { X.weeksAll = WEEKS_CACHE.val; return X.weeksAll; }
    var v = weekResults(st);
    WEEKS_CACHE = { key: key, index: X.index, val: v };
    return v;
  }
  function parseP(s) { var o = {}; String(s || '').split(';').forEach(function (kv) { var i = kv.indexOf('='); if (i > 0) o[kv.slice(0, i)] = kv.slice(i + 1); }); return o; }
  function chapterNow(index, profile, asOf, week) {
    var Bk = Bank(), cp = (profile && profile.cp) || {}, wk = null;
    if (week && week.n) return Bk.chapterOf(week.n, week.title);
    if (index) index.weeks.forEach(function (w) {
      var started = w.days.some(function (d) { var di = index.days.get(d); return di && di.steps.some(function (sk) { return isYmd(cp[sk]) && cp[sk] <= asOf; }); });
      if (started && (!wk || w.n > wk.n)) wk = w;
    });
    return wk ? Bk.chapterOf(wk.n, wk.title) : Bk.chapterOf(1, '');
  }
  function sessionSummaries(sessions) {
    var out = sessions.map(function (x) {
      var n = (x.meta.p || []).length, done = 0, right = 0, ms = 0;
      keys(x.a).forEach(function (q) {
        if (/^r/.test(q)) return;
        var leaf = x.a[q][1];
        if (String(leaf[8] || '').indexOf('x') >= 0) return;
        done++;
        if (leafOk(leaf)) right++;
        ms += Math.min(600000, Number(leaf[7]) || 0);
      });
      var s = { sid: x.sid, kind: x.meta.k, d: x.meta.d, n: n, done: done, right: right, ms: ms, end: x.e || null, endDate: x.e ? endDay(x) : null }, ds = {};
      keys(x.a).forEach(function (q) { ds[leafDate(x, x.a[q][0], x.a[q][1])] = 1; });
      s.days = keys(ds).sort();
      if (x.meta.part) s.part = x.meta.part;
      if (x.meta.wk) s.wk = x.meta.wk;
      return s;
    });
    return out.reverse();
  }

  /* ── sub-skill attempts ── */
  // one attempt: { s: sub, d: date, x: 0..1, w: weight, real: bool, tn: day × 10⁶ + hhmmss, k: tie-break (the question, or the
  // course order) } — ordered as the key 'date hms question' reads (§3.4: "the last four")
  function subAttempts(input, index, phrases, learned, answers, sessions, examCounted, host, listFor) {
    var Bk = Bank(), Gn = Gen(), Mo = Model(), out = [], asOf = input.asOf;
    var profile = host.profile || {}, cp = profile.cp || {}, cq = profile.cq || {}, wr = profile.wr || {}, wrd = profile.wrd || {};
    function add(s, d, x, w, real, tn, k) {
      if (!s || !(w > 0) || s === 'W-caps') return;                              // retired 2026-09-30 (old leaves may name it)
      out.push({ s: s, d: d, x: x < 0 ? 0 : x > 1 ? 1 : x, w: w, real: !!real, tn: tn, k: k });
    }
    function tnOf(d, hms) { return isYmd(d) && d <= asOf ? dayNo(d) * 1e6 + (Number(hms) || 0) : null; }
    // exam answers: every question's earliest leaf (re-asks 'r' and unanswered 'x' do not count)
    sessions.forEach(function (x) {
      keys(x.a).forEach(function (q) {
        if (/^r/.test(q)) return;
        var t = x.a[q][0], leaf = x.a[q][1], flags = String(leaf[8] || '');
        if (flags.indexOf('r') >= 0 || flags.indexOf('x') >= 0) return;
        var d = leafDate(x, t, leaf), ok = leafOk(leaf);
        if (ok == null || (leaf[1] !== 'WT' && capsOnly(leaf))) return;       // a sentence's leaf names each sub's own value
        var tn = tnOf(d, t);
        if (tn == null) return;
        var hw = flags.indexOf('h') >= 0 || (flags.indexOf('w') >= 0 && (x.meta.tier || 1) >= 3) ? 0.5 : 1, sw = flags.indexOf('s') >= 0;
        parseSubs(leaf[4]).forEach(function (a) {
          var xv = a[1] != null ? a[1] : (ok ? 1 : 0);
          var w = a[2] * hw;
          if (sw) { xv = 1; w = w * 0.5; }
          add(a[0], d, xv, w, true, tn, q);
        });
      });
    });
    // course first answers (by tagsOf, answers view): inferred half weight; exam answers already counted above
    if (index) {
      var ord = 0;
      index.items.forEach(function (it, id) {
        ord++;
        var list = answers.get(id) || [];
        if (!list.length) return;
        var tags = Bk.tagsShared(it, index, ANS), o = ord;
        list.forEach(function (a) {
          if (a.d > asOf) return;
          if (examCounted[id + '\u0000' + a.d]) return;
          var tn = tnOf(a.d, a.hms || '000000');
          if (tn == null) return;
          if (it.kind === 'write' && a.src === 'W') {
            var when = isYmd(wrd[it.home]) ? wrd[it.home] : cp[it.home], text = Array.isArray(wr[it.home]) ? wr[it.home][it.wi] : null;
            if (when === a.d && text != null && Gn) {
              var wf = Gn.writeForms(String(text), it.ref, { index: index });
              wf.att.forEach(function (x) { add(x[0], a.d, x[1], x[2] * (a.inf ? 0.5 : 1), !a.inf, tn, o); });
              return;
            }
          }
          var x = a.ok ? 1 : 0, w0 = a.inf ? 0.5 : 1;
          for (var ti = 0; ti < tags.length; ti++) add(tags[ti], a.d, x, w0, !a.inf, tn, o);
        });
      });
      // lesson scores not yet marked done (a trial): spread over the step's items, 0.6 of a "right" each for 6/10, half weight
      index.steps.forEach(function (si, sk) {
        if (isYmd(cp[sk])) return;
        var r = si.type === 'reading' ? cq[sk + ':q'] : cq[sk];
        if (!Array.isArray(r) || !(Number(r[1]) > 0)) return;
        if (si.type === 'grammar' || si.type === 'reading') { if (typeof r[2] === 'string' && r[2]) return; }
        if (!/^(pairs|dictation|grammar|reading)$/.test(si.type)) return;
        var d = Mo.keyDate(index, host, r, sk);
        if (!isYmd(d)) return;
        var frac = Number(r[0]) / Number(r[1]), tnT = tnOf(d, '000000');
        if (tnT == null) return;
        si.pieces.forEach(function (pid) {
          var pc = index.piece.get(pid), it = pc && index.items.get(pc.item);
          if (!it || !pc.scored) return;
          Bk.tagsShared(it, index, ANS).forEach(function (s) { add(s, d, frac, 0.5, false, tnT, 'trial'); });
        });
      });
    }
    // the order of the attempt keys ('date hms question'), compared as numbers first (thousands of attempts at 17 weeks)
    var by = new Map();
    out.forEach(function (a) { var l = by.get(a.s); if (!l) { l = []; by.set(a.s, l); } l.push(a); });
    by.forEach(function (l) { l.sort(function (a, b) { if (a.tn !== b.tn) return a.tn - b.tn; var x = tieKey(a.k), y = tieKey(b.k); return x < y ? -1 : x > y ? 1 : 0; }); });
    return by;
  }
  var ANS = { answers: true };
  function pad6(n) { var s = String(n); while (s.length < 6) s = '0' + s; return s; }
  function tieKey(k) { return typeof k === 'number' ? pad6(k) : String(k); }

  /* ── accuracy, evidence, status, retirement, priority (§3.4) ── */
  function accAt(list, D) {
    var U = Model().util, sx = 0, sw = 0;
    for (var i = 0; i < list.length; i++) {
      var a = list[i];
      if (a.d > D) break;
      var w = a.w * Math.pow(0.5, U.diffDays(a.d, D) / CONST.HALF_LIFE_DAYS);
      sx += w * a.x; sw += w;
    }
    return (sx + 1) / (sw + 2);
  }
  function realUpTo(list, D) { return list.filter(function (a) { return a.real && a.d <= D && a.w >= 0.5; }); }
  /** subskills(input) → Map<sub, SubState> — also available on its own for the tests and the star map */
  function subskills(input) {
    var st = state(input);
    return st.subs;
  }
  function subskillsFrom(att, asOf, crit, input) {
    var Bk = Bank(), U = Model().util, out = new Map();
    var weakCrit = {};
    if (crit) crit.forEach(function (c) { if (c.status === 'weak') (c.links || []).forEach(function (l) { weakCrit[l] = 1; }); });
    var gap = (input && input.gap) || {};
    var ids = Object.keys(Bk.SKILLS).filter(function (s) { return !Bk.SKILLS[s].crit; });
    att.forEach(function (l, s) { if (ids.indexOf(s) < 0 && !(Bk.SKILLS[s] && Bk.SKILLS[s].crit)) ids.push(s); });
    ids.forEach(function (s) {
      var list = att.get(s) || [];
      var tl = subTimeline(list, asOf), weakNow = tl.weakNow, since = tl.since, retired = tl.retired;
      var acc = tl.acc, ev = tl.ev;
      var real = tl.real, last4 = real.slice(-4);
      var status;
      if (weakNow) status = 'weak';
      else if (ev.m < CONST.M_MIN) status = 'new';
      else if (acc >= CONST.ACC.steady && last4.length === 4 && last4.every(function (a) { return a.x >= 0.5; }) && uniqDays(last4) >= 2) status = 'steady';
      else status = 'growing';
      var miss7 = 0;
      list.forEach(function (a) { if (a.d <= asOf && U.diffDays(a.d, asOf) < CONST.MISS_DAYS) miss7 += a.w * (1 - a.x); });
      var skill = groupOfSub(s), g = gap[skill], gb = g != null ? 1 + Math.max(0, g) / 4 : 1;
      var prio = (1 - acc) * importance(s) * (1 + 0.5 * miss7) * gb * (weakCrit[s] ? CONST.CRIT_BOOST : 1);
      var sub = { n: ev.n, m: r3(ev.m), acc: r3(acc), status: status, recent: last4.map(function (a) { return [a.d, a.x >= 0.5 ? 1 : 0]; }), prio: r3(prio), note: noteOf(list, asOf) };
      if (since && weakNow) sub.since = since;
      if (retired) sub.retired = retired;
      out.set(s, sub);
    });
    return out;
  }
  function uniqDays(list) { var o = {}; list.forEach(function (a) { o[a.d] = 1; }); return Object.keys(o).length; }
  /**
   * subTimeline(list, asOf) → { weakNow, since, retired, acc, ev, real }: the day-by-day walk of §3.4 (weak → retired →
   * weak again after two new misses) in one pass: weak on a day when the evidence of the last WINDOW days is ≥ M_MIN and
   * accAt < ACC.weak, or two of the last four real attempts missed; retired when ≥ 4 real attempts on ≥ 2 days follow the
   * last miss and accAt ≥ ACC.retire. Running sums instead of re-reading the list every day (17 weeks: thousands of
   * attempts × a hundred days).
   */
  var DAYNUM = {};
  function dayNo(d) { var v = DAYNUM[d]; if (v == null) { v = DAYNUM[d] = Math.round(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8, 10))) / 86400000); } return v; }
  function subTimeline(list, asOf) {
    var U = { dayNum: dayNo }, H = CONST.HALF_LIFE_DAYS, n = list.length, i;
    var base = n ? U.dayNum(list[0].d) : U.dayNum(asOf), dn = new Array(n), A = [0], W = [0];
    for (i = 0; i < n; i++) { dn[i] = U.dayNum(list[i].d) - base; var f = Math.pow(2, dn[i] / H); A.push(A[i] + list[i].w * list[i].x * f); W.push(W[i] + list[i].w * f); }
    var real = [];
    for (i = 0; i < n; i++) if (list[i].real && list[i].w >= 0.5) real.push(list[i]);
    var seen = {}, days = [];
    for (i = 0; i < n; i++) if (!seen[list[i].d]) { seen[list[i].d] = 1; days.push(list[i].d); }
    if (!seen[asOf]) days.push(asOf);
    days.sort();
    var k = 0, lo = 0, wm = 0, rk = 0, lastMiss = -1, weakNow = false, since = null, retired = null, missesAfter = 0;
    var Dn = 0, acc = 0.5, evM = 0, evN = 0;
    function advance(D) {
      Dn = U.dayNum(D) - base;
      while (k < n && list[k].d <= D) { wm += list[k].w; k++; }
      while (lo < k && dn[lo] <= Dn - CONST.WINDOW) { wm -= list[lo].w; lo++; }
      evM = wm; evN = k - lo;
      var g = Math.pow(2, -Dn / H);
      acc = (A[k] * g + 1) / (W[k] * g + 2);
      while (rk < real.length && real[rk].d <= D) {
        if (real[rk].x < 0.5) { lastMiss = rk; if (retired && real[rk].d > retired) missesAfter++; }
        rk++;
      }
    }
    function weakNowCond() {
      var miss4 = 0;
      for (var j = Math.max(0, rk - 4); j < rk; j++) if (real[j].x < 0.5) miss4++;
      return (evM >= CONST.M_MIN && acc < CONST.ACC.weak) || miss4 >= 2;
    }
    function retireNow() {
      if (lastMiss < 0) return false;
      var j0 = lastMiss + 1, md = real[lastMiss].d;
      while (j0 < rk && real[j0].d <= md) j0++;
      if (rk - j0 < 4) return false;
      if (real[j0].d === real[rk - 1].d) return false;
      return acc >= CONST.ACC.retire;
    }
    days.forEach(function (D) {
      advance(D);
      if (!weakNow) {
        if (retired) { if (missesAfter >= 2 && weakNowCond()) { weakNow = true; since = D; } }
        else if (weakNowCond()) { weakNow = true; since = D; }
      } else if (retireNow()) {
        weakNow = false; retired = D; missesAfter = 0;
        for (var j = 0; j < rk; j++) if (real[j].d > retired && real[j].x < 0.5) missesAfter++;
      }
    });
    advance(asOf);
    return { weakNow: weakNow, since: since, retired: retired, acc: acc, ev: { m: evM, n: evN }, real: real.slice(0, rk) };
  }
  // SubState.note (E2's CONTRACT-REQUEST 6): measured facts only, ≤ 30 字 — today's real answers, else the last 7 days', else the last one
  function noteOf(list, asOf) {
    var U = Model().util, real = realUpTo(list, asOf);
    function tally(f) { var n = 0, r = 0; real.forEach(function (a) { if (f(a)) { n++; if (a.x >= 0.5) r++; } }); return [r, n]; }
    var t = tally(function (a) { return a.d === asOf; });
    if (t[1]) return '今天对 ' + t[0] + ' / ' + t[1];
    var w = tally(function (a) { return U.diffDays(a.d, asOf) < 7; });
    if (w[1]) return '这 7 天对 ' + w[0] + ' / ' + w[1];
    if (!real.length) return '';
    var l = real[real.length - 1];
    return '上次（' + Number(l.d.slice(5, 7)) + '月' + Number(l.d.slice(8, 10)) + '日）' + (l.x >= 0.5 ? '对了' : '错了');
  }
  function r3(x) { return Math.round(x * 1000) / 1000; }

  /* ───────────────────────────── writing and speaking criteria (§3.4.1) ───────────────────────────── */
  var CRIT_W = ['TA', 'CC', 'LR', 'GRA'], CRIT_S = ['FC', 'LR', 'GRA', 'P'];
  function marksOf(x) {
    // m keys '题号:ai|self:YYMMDDHHMM' → per question, each criterion: Claude's latest, else the latest self mark (§7.1)
    var byQ = {};
    keys(x.m).forEach(function (k) {
      var mm = /^([^:]+):(ai|self):(\d{10})$/.exec(k);
      if (!mm || !isObj(x.m[k]) || !isObj(x.m[k].c)) return;
      (byQ[mm[1]] = byQ[mm[1]] || []).push({ by: mm[2], at: mm[3], v: x.m[k] });
    });
    var out = {};
    keys(byQ).forEach(function (q) {
      var c = {}, by = {}, typed = false, cap = {};
      byQ[q].sort(function (a, b) { return a.at < b.at ? -1 : a.at > b.at ? 1 : 0; }).forEach(function (e) {
        if (e.v.typed) typed = true;
        keys(e.v.c).forEach(function (k) {
          var val = Number(e.v.c[k]);
          if (!isFinite(val)) return;
          if (e.by === 'ai') { c[k] = val; by[k] = 'ai'; }
          else if (by[k] !== 'ai') { c[k] = val; by[k] = 'self'; }
        });
        if (isObj(e.v.cap)) keys(e.v.cap).forEach(function (k) { cap[k] = e.v.cap[k]; });
      });
      out[q] = { c: c, by: by, typed: typed, cap: cap };
    });
    return out;
  }
  /** criteria(input) → Map<'W-TA'|…|'S-P', CritState> from the marked writing and speaking of weekly exams and practice */
  function criteria(input) {
    var sessions = input.sessions || readDocs(input.examDocs || {}), asOf = input.asOf, Bk = Bank();
    var pieces = { W: [], S: [] };
    sessions.forEach(function (x) {
      if (x.meta.d > asOf) return;
      var ms = marksOf(x);
      keys(ms).forEach(function (q) {
        var m = ms[q], kind = null;
        if (CRIT_W.every(function (k) { return m.c[k] != null; })) kind = 'W';
        else if (CRIT_S.every(function (k) { return m.c[k] != null; })) kind = 'S';
        if (!kind) return;
        var list = kind === 'W' ? CRIT_W : CRIT_S, mean = list.reduce(function (s, k) { return s + m.c[k]; }, 0) / 4;
        var allAi = list.every(function (k) { return m.by[k] === 'ai'; }), anyAi = list.some(function (k) { return m.by[k] === 'ai'; });
        pieces[kind].push({ date: x.meta.d, c: m.c, mean: mean, band: Math.floor(mean * 2) / 2, by: allAi ? 'ai' : anyAi ? 'mixed' : 'self' });
      });
    });
    var out = new Map();
    ['W', 'S'].forEach(function (kind) {
      var list = kind === 'W' ? CRIT_W : CRIT_S;
      // one piece per day (the latest of that day), in date order
      var byDay = {};
      pieces[kind].forEach(function (p) { byDay[p.date] = p; });
      var days = Object.keys(byDay).sort(), seq = days.map(function (d) { return byDay[d]; });
      list.forEach(function (k) {
        var id = kind + '-' + k, def = Bk.SKILLS[id];
        var status = 'new', since = null, retired = null, weakNow = false, okRun = 0;
        seq.forEach(function (p) {
          var min = Math.min.apply(null, list.map(function (x) { return p.c[x]; }));
          var low = p.c[k] === min && p.mean - p.c[k] >= 0.5;
          if (!weakNow) { if (low) { weakNow = true; since = p.date; okRun = 0; } }
          else if (!low) { okRun++; if (okRun >= 2) { weakNow = false; retired = p.date; } }
          else okRun = 0;
        });
        var last2 = seq.slice(-2);
        if (weakNow) status = 'weak';
        else if (seq.length < 2 && !retired) status = 'new';          // one piece is not enough to call a criterion steady or growing
        else if (last2.length === 2 && last2.every(function (p) { return p.c[k] >= p.mean; })) status = 'steady';
        else status = 'growing';
        var cs = { id: id, last: last2.map(function (p) { return { date: p.date, band: p.c[k], mean: r2(p.mean), by: p.by }; }).reverse(), status: status, links: (def && def.links || []).slice() };
        if (weakNow && since) cs.since = since;
        if (retired) cs.retired = retired;
        out.set(id, cs);
      });
    });
    return out;
  }

  /* ───────────────────────────── plan (§3.5, §3.6) ───────────────────────────── */
  var LADDER = {
    word: { 1: ['VM', 'LC', 'LP', 'RN', 'RT', 'RM'], 2: ['VG', 'LF', 'LN', 'RG', 'LM'], 3: ['VS', 'WT'] },
    pair: { 1: ['LP'], 2: ['LP'], 3: ['LC', 'SR'] },
    sym: { 1: ['PS'], 2: ['PS'], 3: ['SR'] },
    dict: { 1: ['LD'], 2: ['LD'], 3: ['LD'] },
    write: { 1: ['GR'], 2: ['WT'], 3: ['WT'] },
    quiz: { 1: ['GF', 'GP'], 2: ['GC'], 3: ['GR', 'WT'] },
    read: { 1: ['RN', 'RT'], 2: ['RN'], 3: ['RN'] },
    coll: { 1: ['VC'], 2: ['VG'], 3: ['WT'] },
    speak: { 1: [], 2: ['SP'], 3: ['SP'] }
  };
  var TYPED = { LF: 1, LN: 1, RG: 1, VS: 1, VG: 1, WT: 1 };
  var SPELL_SUBS = { 'V-spell': 1, 'L-spell': 1 };
  function levelOf(h) { return h < 1.5 ? 1 : h < 6 ? 2 : 3; }
  // formats to try for a target, best first (§3.6): its level and the one below; spelling weak points need typing;
  // a weak sub-skill needs a format that practises it; never the format of this item's last exam question
  function formatsFor(inf, sub, st, opts) {
    var Bk = Bank(), kind = inf.it.kind, lad = LADDER[kind] || {}, lv = levelOf(inf.mem ? inf.mem.h : 1);
    if (sub && SPELL_SUBS[sub]) lv = Math.max(lv, 2);
    var tiers = [lv, lv - 1, lv + 1, lv + 2, lv - 2].filter(function (x) { return x >= 1 && x <= 3; });
    var out = [], seen = {};
    tiers.forEach(function (t) { (lad[t] || []).forEach(function (f) { if (!seen[f]) { seen[f] = 1; out.push({ f: f, lv: t }); } }); });
    var quiz = !opts || opts.quiz !== false;
    out = out.filter(function (x) {
      var F = Bk.FORMATS[x.f];
      if (!F) return false;
      if (quiz && F.quiz === false) return false;
      if (opts && opts.noAudio && F.needs === 'audio') return false;
      if (opts && opts.skill && F.skill !== opts.skill && !(opts.skill === 'L' && x.f === 'LP')) return false;
      if (sub && SPELL_SUBS[sub] && !TYPED[x.f]) return false;
      if (sub && !practises(x.f, sub, kind)) return false;
      return true;
    });
    var last = st.lastFmt.get(inf.id);
    var noRepeat = out.filter(function (x) { return x.f !== last; });
    if (noRepeat.length) out = noRepeat;
    return out;
  }
  // (the bank's frames do not change: once per format, sub-skill and kind)
  var PRACT = {};
  function practises(fmt, sub, kind) { var k = fmt + '|' + sub + '|' + kind; return own.call(PRACT, k) ? PRACT[k] : (PRACT[k] = practises1(fmt, sub, kind)); }
  function practises1(fmt, sub, kind) {
    var Gn = Gen(), Bk = Bank();
    if (Gn._.fmtNatural(fmt, sub)) return true;
    var list = Bk.frames(fmt);
    for (var i = 0; i < list.length; i++) {
      var fr = list[i].frame;
      if ((fr.subs || []).indexOf(sub) >= 0) return true;
      if ((fr.items || []).some(function (q) { return (q.f || fr.f) === fmt && (q.subs || []).indexOf(sub) >= 0; })) return true;
    }
    if (kind === 'pair' || kind === 'quiz' || kind === 'read') return true;          // their own tag is the sub
    return false;
  }
  function hashRank(seed, id) { return Model().h6(seed + '|' + id); }
  function predicted(inf, b, st) {
    var p = inf ? (inf.vis != null ? inf.vis : 0.5) : 0.5;
    var bb = b == null ? 3 : b;
    return Math.min(0.99, Math.max(0.02, p * (1.25 - 0.1 * bb)));
  }
  /**
   * plan(kind, state, opts) → PlanRow[]. kind 'quiz' | 'free' | 'more' | 'week' | 'month';
   * opts = { seed, n, scope: 'skill:L'|'place:cafe'|'weak'|'new', sub, part, patrol: { items } | null, effects, noAudio, asOf? }
   */
  function plan(kind, st, opts) {
    opts = opts || {};
    if (kind === 'week' || kind === 'month') return weekPlan(st, opts);
    var res = planQuizMemo(kind, st, opts);
    return res ? res.rows.map(function (r) { return r.slice(); }) : [];
  }
  // today's offer plans the quiz to say what is in it; 「开始」 then plans the same quiz on the same state: once is enough
  var PLAN_MEMO = typeof WeakMap === 'function' ? new WeakMap() : null;
  function planQuizMemo(kind, st, opts) {
    if (!PLAN_MEMO || !st || typeof st !== 'object') return planQuiz(kind, st, opts);
    var pt = opts.patrol, key = [kind, String(opts.seed || 'seed'), opts.tier || 1, opts.scope || '', opts.n || '', opts.sub || '', opts.noAudio ? 1 : 0,
      pt ? JSON.stringify(pt) : '', opts.exclude ? opts.exclude.join(',') : ''].join('|');
    var m = PLAN_MEMO.get(st);
    if (!m) { m = {}; PLAN_MEMO.set(st, m); }
    if (!own.call(m, key)) m[key] = planQuiz(kind, st, opts);
    return m[key];
  }
  function genCtx(st, opts) {
    var X = st._;
    return { index: X.index, learned: st.learned, host: X.host, asOf: st.asOf, vocab: X.vocab, tier: (opts && opts.tier) || 1, phrases: X.phrases,
      recent: { frames: mapObj(st.frameLast), scenes: st.recentScenes, sigs: st.sigs }, recentNames: X.recentNames, week: X.week ? X.week.n : 1,
      dictScore: X.dictScore, speechToks: X.speechToks, fdClose: X.fdClose, scDocs: X.scDocs, aiUses: X.aiUses };
  }
  function mapObj(m) { var o = {}; if (m) m.forEach(function (v, k) { o[k] = v; }); return o; }
  // 加练 / free practice are never empty while something of that kind is learned (10-07: 整句听写 came back empty once every
  // learned sentence was answered today or within the 30-day signature window): short of n, more passes may take those (once a session)
  function planQuiz(kind, st, opts) {
    var res = planQuiz1(kind, st, opts);
    if (kind !== 'more' && kind !== 'free') return res;
    var want = opts.n || (kind === 'more' ? 2 : 5), picks = res.picks.slice(), carry = res.carry;
    for (var pass = 1; pass <= 3 && picks.length < want; pass++) {
      var ids = (opts.exclude || []).slice(), sigs = new Set();
      picks.forEach(function (p) { ids.push(p.inf.id); if (p.also) ids.push(p.also.id); if (p.item && p.item.sig) sigs.add(p.item.sig); });
      var more = planQuiz1(kind, st, Object.assign({}, opts, { relax: sigs, carry: carry, exclude: ids, n: want - picks.length, seed: String(opts.seed || 'seed') + '+' + pass }));
      if (!more.picks.length) break;
      picks = picks.concat(more.picks); carry = more.carry || carry;
    }
    if (picks.length === res.picks.length) return res;
    var all = orderPicks(picks, st);
    return { rows: all.map(function (p, i) { var r = p.row.slice(); r[0] = String(i); return r; }), picks: all };
  }
  // opts.relax (this session's signatures): today's targets and 30-day signatures allowed; opts.carry: scenes, frames, names so far
  function planQuiz1(kind, st, opts) {
    var Bk = Bank(), Gn = Gen(), X = st._, seed = String(opts.seed || 'seed');
    var ctx = genCtx(st, opts);
    if (opts.relax) ctx.recent = Object.assign({}, ctx.recent, { sigs: opts.relax });
    var shares = CONST.SHARES.quiz;
    if (kind === 'more' || opts.scope === 'weak') shares = [1, 0, 0];
    if (opts.scope === 'new') shares = [0, 0, 1];
    var infos = [];
    X.info.forEach(function (inf) { infos.push(inf); });
    // scope filters (free practice): a skill, a place
    var scope = String(opts.scope || ''), skill = /^skill:([LRWS])$/.exec(scope), place = /^place:(\w+)$/.exec(scope);
    // the long formats (SP SR SC WM WD) never go into the daily quiz, but free practice and 加练 may use them (§3.6)
    var fopts = { quiz: kind === 'quiz', noAudio: !!opts.noAudio, skill: skill ? skill[1] : null };
    var avail = infos.filter(function (inf) {
      if (inf.today && !opts.relax) return false;
      if (opts.exclude && opts.exclude.indexOf(inf.id) >= 0) return false;
      return true;
    });
    var byId = {};
    infos.forEach(function (inf) { byId[inf.id] = inf; });
    var tagCache = {};
    function tags(inf) { if (!tagCache[inf.id]) tagCache[inf.id] = Bk.tagsOf(inf.it, X.index); return tagCache[inf.id]; }
    var weakSet = {};
    st.weak.forEach(function (s) { weakSet[s] = 1; });
    // 加练 on one sub-skill (「再来两道同类题」, a star's 「练这个 · 5 题」, §3.7): only that sub, new targets, new scenes
    var focus = kind === 'more' && opts.sub ? String(opts.sub) : null;
    var weakList = focus ? [focus] : st.weak;
    if (focus) weakSet[focus] = 1;
    function weakCount(inf) { return tags(inf).filter(function (s) { return weakSet[s]; }).length; }
    function isVehFirstTry(inf) { return inf.it.cls === 'veh' && inf.mem && inf.mem.firstTry; }
    var patrolIds = opts.patrol && opts.patrol.items ? opts.patrol.items : [];
    // pools (§3.5); 加练 on a question's sub-skill (弱读小词: no item is tagged with it) also takes items a format of which practises it
    function weakCands(sub) {
      var g = groupOfSub(sub), w = focus === sub && /^([LRWS]-|V-mean|G-svo)/.test(sub), t = function (x) { return tags(x).indexOf(sub) < 0 ? 1 : 0; };
      return avail.filter(function (inf) { return !isVehFirstTry(inf) && (!t(inf) || w && !/^(pair|quiz|read)$/.test(inf.it.kind) && formatsFor(inf, sub, st, fopts).length); }).sort(function (a, b) {
        if (t(a) !== t(b)) return t(a) - t(b);
        var la = a.mem.lastOk === false ? 0 : 1, lb = b.mem.lastOk === false ? 0 : 1;
        if (la !== lb) return la - lb;
        var ga = groupOfKind(a.it.kind) === g ? 0 : 1, gb = groupOfKind(b.it.kind) === g ? 0 : 1;
        if (ga !== gb) return ga - gb;
        var wa = weakCount(a), wb = weakCount(b);
        if (wa !== wb) return wb - wa;
        if (a.mem.misses !== b.mem.misses) return b.mem.misses - a.mem.misses;
        var sa = SIGHT_RANK[sightOf(a.vis)], sb = SIGHT_RANK[sightOf(b.vis)];
        if (sa !== sb) return sa - sb;
        return hashRank(seed, a.id) < hashRank(seed, b.id) ? -1 : 1;
      }).slice(0, w ? 60 : Infinity);                                          // (widened: the best 60 are plenty for 5)
    }
    var dueList = avail.filter(function (inf) { return inf.real && inf.mem.due && !isVehFirstTry(inf) && inf.mem.h < CONST.SETTLED_H; });
    var freshList = avail.filter(function (inf) { return !inf.real && !isVehFirstTry(inf); });
    var maintList = avail.filter(function (inf) { return inf.real && (inf.mem.h >= CONST.SETTLED_H) && inf.lastDate && Model().util.diffDays(inf.lastDate, st.asOf) >= CONST.MAINT_DAYS; });
    function pickSet(nTotal) {
      var weakN = Math.round(shares[0] * nTotal), dueN = Math.round(shares[1] * nTotal), freshN = nTotal - weakN - dueN;
      if (kind === 'more') { weakN = nTotal; dueN = 0; freshN = 0; }
      var cy = opts.carry || {}, picks = [], used = {}, groupN = {}, groupWeak = {}, subN = {}, fmtN = {};
      var scenes = (cy.scenes || []).slice(), names = (cy.names || []).slice(), frameKeys = (cy.frames || []).slice();
      function mainSubOf(inf, sub) { return sub || tags(inf)[0]; }
      function canTake(inf, sub, pool) {
        if (used[inf.id]) return false;
        var ms = mainSubOf(inf, sub), g = groupOfSub(ms);
        if (focus) return true;                                                 // one sub-skill on purpose: no spread caps
        if ((groupN[g] || 0) >= 3) return false;
        if (pool === 'weak' && (groupWeak[g] || 0) >= 2) return false;
        if ((subN[ms] || 0) >= 2) return false;
        return true;
      }
      function gen(inf, sub, pool, alsoInf) {
        var fl = formatsFor(inf, pool === 'weak' ? sub : null, st, fopts);
        fl = fl.filter(function (x) { return (fmtN[x.f] || 0) < 3; });
        // prefer this level, then the least recently used format for this item, then the seed
        var lv0 = fl.length ? fl[0].lv : 1;
        fl.sort(function (a, b) { var da = a.lv === lv0 ? 0 : 1, db = b.lv === lv0 ? 0 : 1; if (da !== db) return da - db; return hashRank(seed + inf.id, a.f) < hashRank(seed + inf.id, b.f) ? -1 : 1; });
        for (var i = 0; i < fl.length; i++) {
          var subsList = [mainSubOf(inf, sub)];
          var spec = { target: inf.id, fmt: fl[i].f, seed: seed + '·' + picks.length, pool: pool, subs: subsList, usedScenes: scenes, usedFrames: frameKeys, usedNames: names, lv: fl[i].lv, i: String(picks.length) };
          if (inf.it.kind === 'dict') spec.lv = levelOf(inf.mem.h);
          if (place) { spec.place = place[1]; spec.usedScenes = []; }            // free practice by place: that place's scenes only (a scene may come twice)
          if (alsoInf && (fl[i].f === 'LF' || fl[i].f === 'LN')) {
            var r2x = Gn.item(Object.assign({}, spec, { also: alsoInf.id }), ctx);
            if (r2x) return { res: r2x, also: alsoInf };
          }
          var r = Gn.item(spec, ctx);
          if (r) return { res: r };
        }
        return null;
      }
      function take(inf, sub, pool, alsoPool) {
        if (!canTake(inf, sub, pool)) return false;
        // a second blank on the same form (§4.5 "第二考点"): the next weak word of the other calendar kind (a month with a weekday)
        var alsoInf = null;
        if (alsoPool) for (var i = 0; i < alsoPool.length; i++) { var c = alsoPool[i]; if (c.id !== inf.id && !used[c.id] && otherCal(inf, c)) { alsoInf = c; break; } }
        var g = gen(inf, sub, pool, alsoInf);
        if (!g) return false;
        var ms = mainSubOf(inf, sub), grp = groupOfSub(ms);
        used[inf.id] = 1;
        if (g.also) used[g.also.id] = 1;
        groupN[grp] = (groupN[grp] || 0) + 1;
        if (pool === 'weak') groupWeak[grp] = (groupWeak[grp] || 0) + 1;
        // the sub-skills this item really practises (§3.5 "一题同时算它带的所有弱项小项"): its own, and for a sentence to
        // write, the key forms of that sentence
        var its = [ms];
        g.res.item.subs.forEach(function (s) { if (its.indexOf(s) < 0) its.push(s); });
        if (g.res.row[1] === 'WT' && inf.it.kind === 'write') Bk.writeTags(inf.it.ref).forEach(function (s) { if (its.indexOf(s) < 0) its.push(s); });
        subN[ms] = (subN[ms] || 0) + 1;
        fmtN[g.res.row[1]] = (fmtN[g.res.row[1]] || 0) + 1;
        var sc = g.res.row[2];
        if (scenes.indexOf(sc) < 0 && sc !== 'gen' && sc !== 'coll') scenes.push(sc);
        frameKeys.push(sc + '#' + g.res.row[3]);
        var pp = parseP(g.res.row[6]);
        ['A', 'B', 'C'].forEach(function (k) { if (pp[k] && /^[A-Z]/.test(pp[k])) names.push(pp[k]); });
        picks.push({ inf: inf, sub: ms, pool: pool, row: g.res.row, item: g.res.item, also: g.also || null, weakSubs: its.filter(function (s) { return weakSet[s]; }) });
        return true;
      }
      // WEAK: by priority; the weakest sub-skill may take two items, the others one, then a second round (§3.5)
      var weakTaken = 0, subCount = {};
      function weakRound(maxPer, top) {
        for (var i = 0; i < weakList.length && weakTaken < weakN; i++) {
          var s = weakList[i], lim = focus ? weakN : top && i === 0 ? 2 : maxPer;
          if (s in subCount && subCount[s] >= lim) continue;
          var covered = picks.filter(function (p) { return p.weakSubs.indexOf(s) >= 0; }).length;
          if (covered >= lim) continue;
          var cands = weakCands(s);
          var need = lim - covered;
          for (var k = 0; k < cands.length && need > 0 && weakTaken < weakN; k++) {
            if (take(cands[k], s, 'weak', cands.slice(k + 1))) { need--; weakTaken++; subCount[s] = (subCount[s] || 0) + 1; }
          }
        }
      }
      if (weakN > 0) { weakRound(1, true); weakRound(2, false); }
      // DUE: groups this session does not have yet first, then main sub-skills it does not have, then the fog first
      function sortPool(list, freshMode) {
        var presentG = {}, presentS = {};
        picks.forEach(function (p) { presentG[groupOfSub(p.sub)] = 1; presentS[p.sub] = 1; });
        return list.filter(function (inf) { return !used[inf.id]; }).sort(function (a, b) {
          if (freshMode) { if (a.L !== b.L) return a.L < b.L ? -1 : 1; }
          var pa = patrolIds.indexOf(a.id) >= 0 ? 0 : 1, pb = patrolIds.indexOf(b.id) >= 0 ? 0 : 1;
          if (!freshMode && pa !== pb) return pa - pb;
          var ga = presentG[groupOfSub(tags(a)[0])] ? 1 : 0, gb = presentG[groupOfSub(tags(b)[0])] ? 1 : 0;
          if (ga !== gb) return ga - gb;
          var sa = presentS[tags(a)[0]] ? 1 : 0, sb = presentS[tags(b)[0]] ? 1 : 0;
          if (sa !== sb) return sa - sb;
          var va = SIGHT_RANK[sightOf(a.vis)], vb = SIGHT_RANK[sightOf(b.vis)];
          if (va !== vb) return va - vb;
          var la = a.mem.lastOk === false ? 0 : 1, lb = b.mem.lastOk === false ? 0 : 1;
          if (la !== lb) return la - lb;
          return hashRank(seed, a.id) < hashRank(seed, b.id) ? -1 : 1;
        });
      }
      function fill(pool, list, n, freshMode) {
        var got = 0;
        while (got < n) {
          var sorted = sortPool(list, freshMode), ok = false;
          for (var i = 0; i < sorted.length; i++) { if (take(sorted[i], null, pool, null)) { ok = true; got++; break; } }
          if (!ok) break;
        }
        return got;
      }
      var dueGot = fill('due', dueList, dueN, false);
      var spill = dueN - dueGot;
      if (spill > 0) { var before = weakTaken; weakN += spill; weakRound(2, false); spill -= weakTaken - before; }
      var freshGot = fill('fresh', freshList, freshN + Math.max(0, spill), true);
      var left = freshN + Math.max(0, spill) - freshGot;
      if (opts.scope === 'new') left = 0;                                      // 只练新学的: nothing else fills the gap
      if (left > 0) {
        var mg = fill('maint', maintList, Math.min(left, CONST.MAINT_MAX), false);
        left -= mg;
      }
      if (left > 0) { var more = fill('due', dueList, left, false); left -= more; }
      carryOut = { scenes: scenes, names: names, frames: frameKeys };
      return picks;
    }
    var chosen = null, carryOut = null;
    if (kind === 'quiz') {
      // 8 items by default; more (up to 10) only while 8 would stay clearly under six minutes, fewer (down to 6) when
      // the items are long (§2.2 "默认 8 题（6–10，按每题估时凑满 6 分钟）")
      for (var n = CONST.QUIZ_N_DEFAULT; n <= CONST.QUIZ_N[1]; n++) {
        var ps = pickSet(n), sec = ps.reduce(function (s, p) { return s + p.item.sec; }, 0);
        chosen = ps;
        if (sec >= CONST.QUIZ_SEC[0] * 0.9 || ps.length < n) break;
      }
      // over 8 minutes: drop the lowest-priority fresh / maintenance items (never below 6)
      var total = chosen.reduce(function (s, p) { return s + p.item.sec; }, 0);
      while (total > CONST.QUIZ_SEC[1] && chosen.length > CONST.QUIZ_N[0]) {
        var idx = -1;
        for (var i = chosen.length - 1; i >= 0; i--) if (chosen[i].pool === 'fresh' || chosen[i].pool === 'maint') { idx = i; break; }
        if (idx < 0) break;
        total -= chosen[idx].item.sec;
        chosen.splice(idx, 1);
      }
    } else {
      chosen = pickSet(opts.n || (kind === 'more' ? 2 : 5));
    }
    var ordered = orderPicks(chosen, st);
    var rows = ordered.map(function (p, i) { var r = p.row.slice(); r[0] = String(i); return r; });
    return { rows: rows, picks: ordered, carry: carryOut };
  }
  function otherCal(a, b) {
    var Bk = Bank();
    if (a.it.kind !== 'word' || b.it.kind !== 'word') return false;
    var ta = Bk.slotTypesOf(a.it), tb = Bk.slotTypesOf(b.it);
    var cal = function (t) { return t.indexOf('weekday') >= 0 ? 'weekday' : t.indexOf('month') >= 0 ? 'month' : null; };
    return cal(ta) != null && cal(tb) != null && cal(ta) !== cal(tb);
  }
  // warm-up first (the most likely right), a sure one last, the middle interleaved (§3.5)
  function orderPicks(picks, st) {
    var Bk = Bank();
    var scored = picks.map(function (p, k) { return { p: p, k: k, pr: predicted(p.inf, p.item.b, st), skill: Bk.FORMATS[p.row[1]].skill }; });
    function better(a, b) {
      if (a.pr !== b.pr) return b.pr - a.pr;
      var ba = a.p.item.b == null ? 9 : a.p.item.b, bb = b.p.item.b == null ? 9 : b.p.item.b;
      if (ba !== bb) return ba - bb;
      var la = a.skill === 'L' ? 0 : 1, lb = b.skill === 'L' ? 0 : 1;
      if (la !== lb) return la - lb;
      return a.p.inf.id < b.p.inf.id ? -1 : 1;
    }
    if (scored.length <= 2) return scored.sort(better).map(function (x) { return x.p; });
    var rest = scored.slice().sort(better), first = rest.shift(), last = rest.shift();
    var mid = rest.sort(function (a, b) { return a.k - b.k; }), out = [first];
    while (mid.length) {
      var prev = out[out.length - 1], best = -1, bestScore = -1;
      for (var i = 0; i < mid.length; i++) {
        var c = mid[i], sc = 0;
        if (c.p.row[1] !== prev.p.row[1]) sc += 4;
        if (c.p.sub !== prev.p.sub) sc += 2;
        if (c.skill !== prev.skill) sc += 1;
        if (sc > bestScore) { bestScore = sc; best = i; }
      }
      out.push(mid.splice(best, 1)[0]);
    }
    if (last.p.row[1] === out[out.length - 1].p.row[1] && out.length > 2) {
      // keep the finish different in format from the item before it when possible
      for (var j = out.length - 1; j >= 1; j--) {
        if (out[j].p.row[1] !== last.p.row[1] && out[j - 1].p.row[1] !== out[out.length - 1].p.row[1]) { var tmp = out[j]; out[j] = out[out.length - 1]; out[out.length - 1] = tmp; break; }
      }
    }
    out.push(last);
    return out.map(function (x) { return x.p; });
  }
  /* ── the weekly exam (§2.3): four parts shaped like the IELTS, a section at a time ── */
  // units = answer units (a form's blanks, a matching item's statements); formats per section, the rest by substitution
  var WEEK_BP = {
    L: [{ sec: 1, units: 7, want: [['LF', 5], ['LC', 2]], fmts: ['LF', 'LC', 'LN'], turn: true },
      { sec: 2, units: 5, want: [['LN', 3], ['LC', 2]], fmts: ['LN', 'LC', 'LF'] },
      { sec: 3, units: 4, want: [['LC', 4]], fmts: ['LC'], dialogue: true },
      { sec: 4, units: 4, want: [['LP', 2], ['LD', 2]], fmts: ['LP', 'LD', 'LC'] }],
    R: [{ sec: 1, units: 7, want: [['RN', 4], ['RT', 3]], fmts: ['RN', 'RT'], kinds: ['notice'] },
      { sec: 2, units: 7, want: [['RT', 4], ['RG', 3]], fmts: ['RT', 'RG', 'RN'], kinds: ['message', 'email', 'note'] },
      { sec: 3, units: 6, want: [['RM', 3], ['RN', 3]], fmts: ['RM', 'RN', 'RT', 'RG'], kinds: ['article'] }]
  };
  function tierOfWeek(n) { n = Number(n) || 1; return n <= 6 ? 1 : n <= 11 ? 2 : n <= 15 ? 3 : 4; }
  function unitsOf(item) {
    if (!item) return 0;
    if (item.blanks && item.blanks.length > 1) return item.blanks.length;
    if (item.fmt === 'RM' && item.stmts) return item.stmts.length;
    return 1;
  }
  // the answer units of an item, as the exam document keys them (§7.1: '题号_空号' for a form's second blank)
  function unitKeys(item) {
    var n = item.blanks && item.blanks.length > 1 ? item.blanks.length : item.fmt === 'RM' && item.stmts && item.stmts.length > 1 ? item.stmts.length : 1;
    if (n <= 1) return [String(item.i)];
    var o = [];
    for (var k = 0; k < n; k++) o.push(item.i + '_' + k);
    return o;
  }
  function weekItemsOf(st, weekId) {
    var X = st._, index = X.index, w = index && index.week.get(weekId), steps = {};
    if (!w) return [];
    (w.days || []).forEach(function (d) { var di = index.days.get(d); if (di) di.steps.forEach(function (sk) { steps[sk] = 1; }); });
    var out = [];
    X.info.forEach(function (inf) { if (steps[inf.it.home]) out.push(inf); });
    return out;
  }
  function weekOfDate(st, date) {
    var X = st._, index = X.index, cp = (X.profile && X.profile.cp) || {}, best = null;
    if (!index) return null;
    index.weeks.forEach(function (w) {
      var first = null;
      (w.days || []).forEach(function (d) { var di = index.days.get(d); if (di) di.steps.forEach(function (sk) { if (isYmd(cp[sk]) && (!first || cp[sk] < first)) first = cp[sk]; }); });
      if (first && first <= date && (!best || w.n > best.n)) best = w;
    });
    return best;
  }
  /**
   * weekPlan(st, { part: 'L'|'R'|'W'|'S', seed, weekId, noAudio }) → PlanRow[] (§2.3): 听 20 · 读 20 answer units, one writing
   * task (odd weeks a message, even weeks a table, until she chooses General Training), one speaking set (4 Part 1
   * questions + 2 sentences to read aloud). Shares: weak .3 · due .3 · this week's coverage .4 (every topic of the week).
   */
  function weekPlan(st, opts) {
    var Bk = Bank(), Gn = Gen(), X = st._, part = opts.part || 'L', seed = String(opts.seed || 'wk');
    var wk = opts.weekId ? X.index.week.get(opts.weekId) : weekOfDate(st, st.asOf);
    var wn = opts.weekN || (wk ? wk.n : 1), tier = opts.tier || tierOfWeek(wn);      // opts.weekN: the course week's number when the pack has no such week (tests)
    var ctx = genCtx(st, { tier: tier });
    var rows = [], used = {}, usedScenes = [], usedFrames = [], names = [];
    function push(res, pool, sec) {
      var r = res.row.slice(), p = Gn.parseParams(r[6]);
      if (pool) p.pool = pool;
      if (sec) p.sec = String(sec);
      r[6] = Gn.paramString(p);
      r[0] = String(rows.length);
      rows.push(r);
      if (r[4]) used[r[4]] = 1;
      if (usedScenes.indexOf(r[2]) < 0 && r[2] !== 'gen' && r[2] !== 'coll') usedScenes.push(r[2]);
      usedFrames.push(r[2] + '#' + r[3]);
      ['A', 'B', 'C'].forEach(function (k) { if (p[k] && /^[A-Z]/.test(p[k])) names.push(p[k]); });
      // the item as generated: the pool and section it is filed under change only its pool and section, not what place()
      // reads (units, format, turn, sub-skills, grp), and rendering the row again is the costliest part of the paper
      return res.item || Gn.render(r, ctx);
    }
    var avail = [];
    X.info.forEach(function (inf) { if (!inf.today) avail.push(inf); });
    var weekSet = {};
    weekItemsOf(st, wk ? wk.id : null).forEach(function (inf) { weekSet[inf.id] = 1; });
    var tagC = {};
    function tags(inf) { return tagC[inf.id] || (tagC[inf.id] = Bk.tagsOf(inf.it, X.index)); }
    // this week's coverage: round-robin over the week's topic steps and kinds (words by topic, pairs, sentences, …)
    var groups = {}, gOrder = [];
    avail.forEach(function (inf) {
      if (!weekSet[inf.id]) return;
      var g = inf.it.kind === 'word' ? 'w:' + inf.it.home : inf.it.kind;
      if (!groups[g]) { groups[g] = []; gOrder.push(g); }
      groups[g].push(inf);
    });
    gOrder.forEach(function (g) { var rk = {}; groups[g].forEach(function (inf) { rk[inf.id] = hashRank(seed + g, inf.id); }); groups[g].sort(function (a, b) { return rk[a.id] < rk[b.id] ? -1 : 1; }); });
    var cover = [], more = true;
    for (var round = 0; more; round++) { more = false; gOrder.forEach(function (g) { if (groups[g][round]) { cover.push(groups[g][round]); more = true; } }); }
    var weakL = [], inWeak = {};
    st.weak.forEach(function (s) { avail.forEach(function (inf) { if (!inWeak[inf.id] && tags(inf).indexOf(s) >= 0) { inWeak[inf.id] = 1; weakL.push(inf); } }); });
    var dueRk = {};
    var dueL = avail.filter(function (inf) { var ok = inf.real && inf.mem.due && inf.mem.h < CONST.SETTLED_H; if (ok) dueRk[inf.id] = hashRank(seed, inf.id); return ok; }).sort(function (a, b) {
      var va = SIGHT_RANK[sightOf(a.vis)], vb = SIGHT_RANK[sightOf(b.vis)];
      if (va !== vb) return va - vb;
      return dueRk[a.id] < dueRk[b.id] ? -1 : 1;
    });
    var POOLS = { weak: weakL, due: dueL, cover: cover }, SH = { weak: CONST.SHARES.week[0], due: CONST.SHARES.week[1], cover: CONST.SHARES.week[2] }, taken = { weak: 0, due: 0, cover: 0 };
    function poolOrder() {
      var tot = taken.weak + taken.due + taken.cover + 1;
      return ['cover', 'weak', 'due'].sort(function (a, b) { return (taken[a] / tot - SH[a]) - (taken[b] / tot - SH[b]); });
    }
    var failed = {};                                    // (target, format, section) that found no frame: not tried again in this paper
    var fmtC = {};
    function fmtsOf(inf) { return fmtC[inf.id] || (fmtC[inf.id] = formatsFor(inf, null, st, { quiz: false }).map(function (x) { return x.f; })); }
    function tryTarget(fmt, sec, filter, extra, maxUnits) {
      var order = poolOrder(), tries = 0, fs = failed[fmt + '|' + sec] || (failed[fmt + '|' + sec] = {}), wordFmt = /^(LF|LN|LC|RN|RT|RG|RM)$/.test(fmt);
      for (var pi = 0; pi < order.length; pi++) {
        var pool = order[pi], list = POOLS[pool];
        for (var k = 0; k < list.length && tries < 24; k++) {
          var inf = list[k], fk = inf.id;
          if (used[fk] || fs[fk]) continue;
          if (!(wordFmt && inf.it.kind === 'word') && fmtsOf(inf).indexOf(fmt) < 0) { fs[fk] = 1; continue; }
          if (!Gn._.canBind(fmt, inf.it, ctx, filter, filter ? part + sec : '')) { fs[fk] = 1; continue; }   // no frame of the section can hold it
          tries++;
          var spec = Object.assign({ target: inf.id, fmt: fmt, seed: seed + '·' + rows.length + '·' + k, pool: pool, subs: [tags(inf)[0]], usedScenes: usedScenes, usedFrames: usedFrames,
            usedNames: names, i: String(rows.length), frameFilter: filter, noRepeat: true }, extra || {});
          if (inf.it.kind === 'dict') spec.lv = levelOf(inf.mem.h);
          var r = Gn.item(spec, ctx);
          if (r && unitsOf(r.item) <= maxUnits) { taken[pool] += unitsOf(r.item); return { res: r, pool: pool }; }
          if (!r) fs[fk] = 1;
        }
      }
      return null;
    }
    function trySubOnly(fmt, sec, filter, subs, maxUnits) {
      for (var t = 0; t < 4; t++) {
        var r = Gn.item({ fmt: fmt, seed: seed + '·s' + rows.length + '·' + t, pool: 'cover', subs: subs, usedScenes: usedScenes, usedFrames: usedFrames, usedNames: names, i: String(rows.length), frameFilter: filter, noRepeat: true }, ctx);
        if (r && unitsOf(r.item) <= maxUnits) { taken.cover += unitsOf(r.item); return { res: r, pool: 'cover' }; }
      }
      return null;
    }
    var FALLBACK_SUB = { LF: 'L-detail', LN: 'L-detail', LC: 'L-detail', LP: 'L-num', LD: 'L-dict', RN: 'R-detail', RT: 'R-tfng', RG: 'R-rule', RM: 'R-match' };
    if (part === 'L' || part === 'R') {
      var paraN = 0;
      WEEK_BP[part].forEach(function (sec) {
        var filter = function (e) {
          if (sec.kinds && !(e.frame.text && sec.kinds.indexOf(e.frame.text.kind) >= 0)) return false;
          if (sec.dialogue) { var ls = e.frame.alt ? e.frame.alt[0] : e.frame.say || []; var who = {}; ls.forEach(function (l) { who[l[0]] = 1; }); if (Object.keys(who).length < 2) return false; }
          return true;
        };
        var need = {}, got = 0, turnDone = !sec.turn;
        sec.want.forEach(function (w) { need[w[0]] = (need[w[0]] || 0) + w[1]; });
        function room() { return sec.units - got; }
        function otherNeed(fmt) { var n = 0; Object.keys(need).forEach(function (f) { if (f !== fmt && need[f] > 0) n += need[f]; }); return n; }
        function place(res, pool) {
          var it = push(res, pool, sec.sec), u = unitsOf(it);
          got += u; need[it.fmt] = (need[it.fmt] || 0) - u;
          if (it.turn) turnDone = true;
          if (it.subs.indexOf('R-para') >= 0) paraN += u;
          // the other questions on the same text: a notice or a message carries several questions (§2.3)
          var sits = [];
          if (it.grp && part === 'R') Gn.siblings(res.row, ctx, sits).forEach(function (sr, si) {
            var sit = sits[si], su = unitsOf(sit);             // (siblings() rendered and checked each one already)
            if (!sit || sec.fmts.indexOf(sit.fmt) < 0 || su > room()) return;
            if ((need[sit.fmt] || 0) < su && room() - su < otherNeed(sit.fmt)) return;
            var sp = Gn.parseParams(sr[6]);
            sp.pool = pool; sp.sec = String(sec.sec);
            sr[6] = Gn.paramString(sp); sr[0] = String(rows.length);
            rows.push(sr);
            got += su; need[sit.fmt] = (need[sit.fmt] || 0) - su;
            if (sit.subs.indexOf('R-para') >= 0) paraN += su;
          });
        }
        function attempt(fmt, wanted) {
          var max = wanted ? Math.min(room(), Math.max(1, need[fmt] || 0)) : Math.max(0, room() - otherNeed(fmt));
          if (max <= 0) return false;
          var extra = null;
          if (!turnDone && (fmt === 'LF' || fmt === 'LC')) extra = ['L-turn'];
          else if (part === 'R' && paraN * 4 < 20 && (fmt === 'RT' || fmt === 'RN')) extra = ['R-para'];
          var r = (extra && trySubOnly(fmt, sec.sec, filter, extra, max)) || tryTarget(fmt, sec.sec, filter, null, max) || trySubOnly(fmt, sec.sec, filter, [FALLBACK_SUB[fmt]], max)
            || trySubOnly(fmt, sec.sec, null, [FALLBACK_SUB[fmt]], max);
          if (!r) return false;
          place(r.res, r.pool);
          return true;
        }
        sec.want.forEach(function (w) { var tries = 0; while ((need[w[0]] || 0) > 0 && room() > 0 && tries++ < 12) { if (!attempt(w[0], true)) break; } });
        // substitutes: any format of the section, until the section is full (what could not be had is let go)
        Object.keys(need).forEach(function (f) { need[f] = 0; });
        var guard = 0;
        while (room() > 0 && guard++ < 20) {
          var ok = false;
          for (var fi = 0; fi < sec.fmts.length && !ok; fi++) ok = attempt(sec.fmts[fi], false);
          if (!ok) break;
        }
      });
      return rows;
    }
    if (part === 'W') {
      var type = X.profile && X.profile.examType, wd = type !== 'G' && wn % 2 === 0;
      var gsubs = ['W-task', 'W-sent', 'W-length'];
      weekItemsOf(st, wk ? wk.id : null).forEach(function (inf) { if (inf.it.kind === 'quiz') { var g = tags(inf)[0]; if (/^G-/.test(g) && gsubs.indexOf(g) < 0) gsubs.push(g); } });
      var fmt = wd ? 'WD' : 'WM', rw = null;
      for (var t = 0; t < 6 && !rw; t++) rw = Gn.item({ fmt: fmt, seed: seed + '·w' + t, pool: 'cover', subs: gsubs, i: '0' }, ctx);
      if (!rw && wd) for (var t2 = 0; t2 < 6 && !rw; t2++) rw = Gn.item({ fmt: 'WM', seed: seed + '·m' + t2, pool: 'cover', subs: gsubs, i: '0' }, ctx);
      if (rw) push(rw.res || rw, 'cover', 1);
      return rows;
    }
    if (part === 'S') {
      // 4 Part 1 questions: the course's speaking questions (this week's first), one real opener; then 2 sentences to read
      var ks = avail.filter(function (inf) { return inf.it.kind === 'speak'; }).sort(function (a, b) { var wa = weekSet[a.id] ? 0 : 1, wb = weekSet[b.id] ? 0 : 1; return wa - wb || (hashRank(seed, a.id) < hashRank(seed, b.id) ? -1 : 1); });
      var nk = 0;
      for (var i = 0; i < ks.length && nk < 3; i++) {
        var rk = Gn.item({ target: ks[i].id, fmt: 'SP', seed: seed + '·k' + i, pool: weekSet[ks[i].id] ? 'cover' : 'due', i: String(rows.length) }, ctx);
        if (rk) { push(rk, weekSet[ks[i].id] ? 'cover' : 'due', 1); nk++; }
      }
      var ro = Gn.item({ fmt: 'SP', sceneId: 'school-speaking-test', frameKey: 'sp-open', seed: seed + '·o', pool: 'cover', i: String(rows.length), subs: ['S-ext'] }, ctx);
      if (ro) push(ro, 'cover', 1);
      for (var q = 0; rows.length < 4 && q < 12; q++) {
        var rq = Gn.item({ fmt: 'SP', seed: seed + '·q' + q, pool: 'cover', subs: ['S-ext'], i: String(rows.length), usedFrames: usedFrames, usedScenes: usedScenes }, ctx);
        if (rq && !rows.some(function (r) { return r[2] === rq.row[2] && r[3] === rq.row[3] && r[6] === rq.row[6]; })) push(rq, 'cover', 1);
      }
      var ds = avail.filter(function (inf) { return inf.it.kind === 'dict'; }).sort(function (a, b) { var wa = weekSet[a.id] ? 0 : 1, wb = weekSet[b.id] ? 0 : 1; return wa - wb || (hashRank(seed + 'sr', a.id) < hashRank(seed + 'sr', b.id) ? -1 : 1); });
      var nr = 0;
      for (var d = 0; d < ds.length && nr < 2; d++) {
        var rr = Gn.item({ target: ds[d].id, fmt: 'SR', seed: seed + '·r' + d, pool: 'cover', i: String(rows.length), usedFrames: usedFrames }, ctx);
        if (rr) { push(rr, 'cover', 1); nr++; }
      }
      return rows;
    }
    return rows;
  }

  /* ───────────────────────────── today's offer (§2.2, §2.3) ───────────────────────────── */
  function reviewDayState(st) {
    var X = st._, index = X.index, cp = (X.profile && X.profile.cp) || {}, asOf = st.asOf, out = { today: false, doneOn: null, weekId: null, dayId: null };
    if (!index) return out;
    index.weeks.forEach(function (w) {
      var hall = w.hallDay && index.days.get(w.hallDay);
      if (!hall) return;
      var dates = hall.steps.map(function (sk) { return cp[sk]; });
      var all = dates.length && dates.every(isYmd);
      var last = all ? dates.sort()[dates.length - 1] : null;
      if (all && last === asOf) { out.today = true; out.weekId = w.id; out.dayId = hall.id; out.doneOn = last; }
      else if (all && last < asOf && (!out.doneOn || last > out.doneOn)) { out.doneOn = last; out.weekId = w.id; out.dayId = hall.id; }
    });
    return out;
  }
  /**
   * offer(state, opts) → Offer | null. opts = { now: 'HH:MM', world: { pick, done, accepted } | null, logistics, seed }
   * Today's quiz (§2.2) unless a weekly part is open (§2.3); 'preview' on the review day after its lessons (§2.6).
   */
  function offer(st, opts) {
    opts = opts || {};
    var X = st._, asOf = st.asOf, anyLearned = false;
    st.learned.forEach(function () { anyLearned = true; });
    if (!anyLearned) return null;
    var today = st.sessions.filter(function (s) { return s.d === asOf; });
    var decided = decisionOf(X.planDocs, asOf);
    var rd = reviewDayState(st);
    if (rd.today) return { kind: 'preview', state: 'open', date: asOf, n: 0, minutes: 0, why: ['这一周学完了。明天起，复盘时间里换成第 ' + weekNo(X.index, rd.weekId) + ' 周周考，一天一段，四天左右考完。'], block: null, includes: null, weekId: rd.weekId };
    // the weekly exam's window: from the day after the review day's lessons, 10 days or until the next course week starts (§2.3)
    var U = Model().util, weekOpen = null, until = null;
    if (rd.doneOn && rd.doneOn < asOf) {
      until = U.addDays(rd.doneOn, 10);
      var wkN = weekNo(X.index, rd.weekId), cp = (X.profile && X.profile.cp) || {};
      if (X.index) X.index.weeks.forEach(function (w) {
        if (!(w.n > wkN)) return;
        (w.days || []).forEach(function (d) { var di = X.index.days.get(d); if (di) di.steps.forEach(function (sk) { var c = cp[sk]; if (isYmd(c) && c > rd.doneOn) { var last = U.addDays(c, -1); if (last < until) until = last; } }); });
      });
      if (asOf <= until) weekOpen = rd;
    }
    if (weekOpen) {
      var parts = { L: 'todo', R: 'todo', W: 'todo', S: 'todo' }, doneToday = false, wkNo = weekNo(X.index, weekOpen.weekId), month = [4, 8, 12, 16].indexOf(wkNo) >= 0;
      st.sessions.forEach(function (s) {
        if ((s.kind !== 'week' && s.kind !== 'month') || s.wk !== weekOpen.weekId || !s.part) return;
        if (s.end) { parts[s.part] = 'done'; if (s.endDate === asOf || (!s.endDate && s.d === asOf)) doneToday = true; } else if (parts[s.part] !== 'done') parts[s.part] = 'doing';
      });
      var next = ['L', 'R', 'W', 'S'].filter(function (p) { return parts[p] === 'doing'; })[0] || ['L', 'R', 'W', 'S'].filter(function (p) { return parts[p] === 'todo'; })[0];
      var PN = { L: ['听力', 20, 14], R: ['阅读', 20, 14], W: ['写作', 1, 10], S: ['口语', 1, 6] }, title = month ? '满月月考' : '第 ' + wkNo + ' 周周考';
      if (next) {
        return { kind: month ? 'month' : 'week', state: doneToday ? 'done' : decided === 'later' ? 'later' : 'open', date: asOf, n: PN[next][1], minutes: PN[next][2], part: next, parts: parts,
          why: [title + ' · ' + PN[next][0] + ' · ' + PN[next][1] + (next === 'W' ? ' 篇' : next === 'S' ? ' 组' : ' 题') + ' · 约 ' + PN[next][2] + ' 分钟', '四段一天一段：听力 → 阅读 → 写作 → 口语'],
          block: null, includes: null, weekId: weekOpen.weekId, until: until };
      }
      // all four parts done: that day the row says so (看成绩单); the days after, the daily quiz comes back
      if (doneToday) return { kind: month ? 'month' : 'week', state: 'done', date: asOf, n: 0, minutes: 0, parts: parts, why: [title + '考完了'], block: null, includes: null, weekId: weekOpen.weekId, until: until };
    }
    // with the world: a patrol done today, or "只练巡查", leaves no quiz today (one thing in the review time, §1.2)
    if (opts.world && (opts.world.done || opts.world.onlyPatrol)) return null;
    var quizToday = today.filter(function (s) { return s.kind === 'quiz' && s.done > 0; });
    var res = planQuizMemo('quiz', st, { seed: opts.seed || ('d' + asOf.replace(/-/g, '')), patrol: opts.world && opts.world.pick ? opts.world.pick : null, noAudio: !!opts.noAudio,
      tier: tierOfWeek((st.chapter && st.chapter.n) || 1) });
    var rows = res ? res.rows : [], picks = res ? res.picks : [];
    if (!rows.length) return null;
    var sec = picks.reduce(function (s, p) { return s + p.item.sec; }, 0);
    var o = { kind: 'quiz', state: quizToday.length ? 'done' : decided === 'later' ? 'later' : 'open', date: asOf, n: rows.length, minutes: Math.round(sec / 60),
      why: whyLines(picks, st), block: 'c', includes: opts.world && opts.world.pick ? opts.world.pick.id || null : null };
    if (quizToday.length) { o.right = quizToday[0].right; o.of = quizToday[0].done; o.sid = quizToday[0].sid; }
    return o;
  }
  function weekNo(index, weekId) { var w = index && index.week.get(weekId); return w ? w.n : 1; }
  function decisionOf(planDocs, date) {
    var doc = planDocs && planDocs['exam-plan-' + date.slice(0, 7)], d = doc && isObj(doc.d) ? doc.d[date.slice(8, 10)] : null, best = null, v = null;
    keys(d).forEach(function (t) { if (!best || t > best) { best = t; v = d[t]; } });
    return v;
  }
  function whyLines(picks, st) {
    var spell = [], dict = 0, write = [];
    picks.forEach(function (p) {
      var it = p.inf.it;
      if (p.pool === 'weak' && it.kind === 'word' && /^(LF|LN|VS|VG|RG)$/.test(p.row[1])) { spell.push(it); if (p.also) spell.push(p.also.it); }
      else if (it.kind === 'dict') dict++;
      else if (p.row[1] === 'WT') write.push(p);
    });
    var bits = [];
    if (spell.length) bits.push(Gen().label(spell[0]) + (spell.length > 1 ? '等 ' + spell.length + ' 个词的拼写' : '的拼写'));
    if (dict) bits.push('听写' + (dict > 1 ? ' ' + dict + ' 句' : '一句'));
    if (write.length) { var who = write[0].item.head && write[0].item.head.who; bits.push('回' + (who ? ' ' + who + ' ' : '') + '一句话'); }
    return bits.length ? ['考：' + bits.join('、')] : ['考：学过的星期、月份和句子'];
  }

  /* ───────────────────────────── the star map (§8.6) ───────────────────────────── */
  function sky(st) {
    var Bk = Bank(), groups = {}, order = ['L', 'R', 'W', 'S', 'V', 'G', 'P'];
    order.forEach(function (g) { groups[g] = { id: g, zh: Bk.GROUP_ZH[g], acc: null, n: 0, stars: [], _x: 0, _w: 0 }; });
    var X = st._, U = Model().util;
    st.subs.forEach(function (s, id) {
      var g = groups[groupOfSub(id)];
      if (!g) return;
      g.stars.push({ id: id, zh: subZh(st, id), acc: s.m >= CONST.M_MIN ? s.acc : null, n: s.n, status: s.status });
    });
    st.crit.forEach(function (c, id) {
      var g = groups[id.charAt(0)];
      if (!g) return;
      var star = { id: id, zh: subZh(st, id), acc: null, n: c.last.length, status: c.status, links: c.links };
      if (c.last.length) star.band = c.last[0].band;
      g.stars.push(star);
    });
    // each constellation's real accuracy over the last 28 days (real answers only: a measured percentage, §8.6)
    X.att.forEach(function (list, id) {
      var g = groups[groupOfSub(id)];
      if (!g) return;
      list.forEach(function (a) { if (a.real && U.diffDays(a.d, st.asOf) < CONST.WINDOW) { g._x += a.x * a.w; g._w += a.w; g.n++; } });
    });
    return { groups: order.map(function (k) { var g = groups[k]; var acc = g._w ? Math.round(g._x / g._w * 100) / 100 : null; return { id: g.id, zh: g.zh, acc: acc, n: g.n, stars: g.stars }; }) };
  }

  /* ───────────────────────────── then, leave it to time (§8.4) ───────────────────────────── */
  function thenWait(st, itemIds, asOf) {
    var Mo = Model(), rows = [], X = st._;
    (itemIds || []).forEach(function (id) {
      var inf = X.info.get(id);
      if (!inf) return;
      var m = st.mem.get(id);
      var h = m.t0 === asOf ? m.h : Mo.hAfterOk(m, asOf), t0 = m.t0 === asOf ? asOf : asOf;
      var date = Mo.util.addDays(t0, Math.ceil(0.737 * h));
      if (m.lastOk === false && m.t0 === asOf) date = Mo.util.addDays(asOf, 1);
      rows.push({ date: date, label: Gen().label(inf.it, accOf(st)), n: 1 });
    });
    rows.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var out = [];
    rows.forEach(function (r) { var last = out[out.length - 1]; if (last && last.date === r.date) { last.n++; if (last.n === 2) last.label += ' 等'; } else if (out.length < 3) out.push(r); });
    return out;
  }

  /* ───────────────────────────── the weekly result (§5.3–§5.6, §7.1) ───────────────────────────── */
  function floorHalf(x) { return Math.floor(x * 2 + 1e-9) / 2; }
  var W_KEYS = ['TA', 'CC', 'LR', 'GRA'], S_KEYS = ['FC', 'LR', 'GRA', 'P'];
  // the date a part was taken: the day she finished it (a part not finished: its last answer's day)
  function partDate(x) { return endDay(x); }
  // one part's listening or reading paper: every answer unit of every question on its plan row (§5.3, §5.6)
  function paperOf(st, x) {
    var Gn = Gen(), ctx = genCtx(st, { tier: x.meta.tier || 1 }), items = [], raw = 0, of = 0, bs = 0;
    (x.meta.p || []).forEach(function (row) {
      var it = Gn.render(row, ctx);
      if (!it || it.b == null) return;                                   // the question's frame is gone: not counted
      unitKeys(Object.assign({}, it, { i: String(row[0]) })).forEach(function (key) {
        var lf = x.a[key] ? x.a[key][1] : null, flags = lf ? String(lf[8] || '') : '';
        if (!lf && !x.e) return;                                          // stopped before it and never came back: not counted
        var ok = !!lf && flags.indexOf('x') < 0 && leafOk(lf) === true;    // a finished part's blank one is wrong (as in the IELTS)
        var w = 1, b = it.b;
        if (flags.indexOf('h') >= 0 || flags.indexOf('s') >= 0) w = 0.5;
        if (flags.indexOf('w') >= 0) { if ((x.meta.tier || 1) >= 3) w = 0.5; else b += CONST.ADJ.replay; }
        if (flags.indexOf('u') >= 0) b += CONST.ADJ.slow;
        items.push({ b: b, c: it.c || 0, x: ok ? 1 : 0, w: w });
        of++; if (ok) raw++; bs += b;
      });
    });
    return { items: items, raw: raw, of: of, meanB: of ? r2(bs / of) : null };
  }
  // the writing or speaking marks of a part (§7.1 m): per criterion Claude's latest, else her latest own
  function marksPart(st, x, kind) {
    var ms = marksOf(x), best = null;
    keys(ms).forEach(function (q) { var m = ms[q], n = keys(m.c).length; if (!best || n > best.n) best = { q: q, m: m, n: n }; });
    if (!best) return null;
    var list = kind === 'W' ? W_KEYS : S_KEYS, c = {}, m = best.m;
    if (!list.every(function (k) { return m.c[k] != null; })) return null;
    list.forEach(function (k) { c[k] = m.c[k]; });
    var allAi = list.every(function (k) { return m.by[k] === 'ai'; }), allSelf = list.every(function (k) { return m.by[k] === 'self'; });
    var by = allAi ? 'ai' : allSelf ? 'self' : 'mixed';
    var bandV = floorHalf(list.reduce(function (a, k) { return a + c[k]; }, 0) / 4);
    var lo = by === 'ai' ? bandV - 0.5 : bandV - 1.0, hi = bandV + 0.5;
    var out = { by: by, c: c, band: bandV, lo: Math.max(0, lo), hi: Math.min(9, hi) };
    if (kind === 'S') {
      var typed = !!m.typed;
      keys(x.w).forEach(function (q) { var v = x.w[q] && x.w[q][1]; if (isObj(v) && v.typed) typed = true; });
      var heard = false;
      keys(x.a).forEach(function (q) { var lf = x.a[q][1]; if (lf && lf[1] === 'SR' && typeof lf[0] === 'number' && String(lf[8] || '').indexOf('x') < 0) heard = true; });
      out.typed = typed;
      out.pBy = heard && !typed ? 'machine+self' : 'self';
    }
    return out;
  }
  // §5.8: a real mock (「模考记录」) within 10 days of a weekly estimate of the same skill → offset = mean(mock − estimate), ±1
  function calibrationOf(st, skill, uncal) {
    var mocks = st._.mocks || {}, diffs = [], U = Model().util;
    keys(mocks).forEach(function (k) {
      var m = mocks[k];
      if (!isObj(m) || !isYmd(m.d)) return;
      var mb = skill === 'L' ? rawToBand(m.L, TABLES.L) : rawToBand(m.R, m.t === 'G' ? TABLES.RG : TABLES.RA);
      if (mb == null) return;
      uncal.forEach(function (u) { if (u.band != null && Math.abs(U.diffDays(u.date, m.d)) <= 10) diffs.push(mb - u.band); });
    });
    if (!diffs.length) return null;
    var off = diffs.reduce(function (a, x) { return a + x; }, 0) / diffs.length;
    return Math.max(-1, Math.min(1, r2(off)));
  }
  /** weekResults(st) → Map<weekId, WeekResult> for every course week with a weekly (or monthly) part, in order (§5.3 priors chain) */
  function weekResults(st) {
    var X = st._;
    if (X.weeksAll) return X.weeksAll;
    var U = Model().util, byWeek = {}, order = [];
    X.sessions.forEach(function (x) {
      if ((x.meta.k !== 'week' && x.meta.k !== 'month') || !x.meta.wk || !x.meta.part || x.meta.d > st.asOf) return;
      if (!byWeek[x.meta.wk]) { byWeek[x.meta.wk] = []; order.push(x.meta.wk); }
      byWeek[x.meta.wk].push(x);
    });
    var examType = (X.profile && X.profile.examType) || '', target = Number(X.profile && X.profile.target) || 7;
    var prev = { L: null, R: null }, raw = [], out = new Map();
    order.forEach(function (wid) {
      var parts = {};
      byWeek[wid].forEach(function (x) {
        var p = x.meta.part, cur = parts[p];
        if (!cur || (!cur.e && x.e) || (!!cur.e === !!x.e && keys(x.a).length > keys(cur.a).length)) parts[p] = x;
      });
      var wkN = weekNo(X.index, wid), tier = tierOfWeek(wkN), res = { weekId: wid, n: wkN, dates: {}, gap: {}, target: target, month: false, raw: {} };
      byWeek[wid].forEach(function (x) { if (x.meta.k === 'month') res.month = true; });
      if ([4, 8, 12, 16].indexOf(wkN) >= 0) res.month = true;
      ['L', 'R'].forEach(function (sk) {
        var x = parts[sk];
        if (!x) return;
        var pp = paperOf(st, x), date = partDate(x);
        res.dates[sk] = date;
        res.raw[sk] = { raw: pp.raw, of: pp.of };
        if (pp.of < 12) return;                                            // fewer than 12: only "对几题" (§5.3)
        var pr = prev[sk], prior;
        if (!pr) prior = { mu: CONST.PRIOR.mu[tier] != null ? CONST.PRIOR.mu[tier] : CONST.PRIOR.mu[0], sd: CONST.PRIOR.sd };
        else { var gapW = Math.max(0, U.diffDays(pr.date, date)) / 7; prior = { mu: pr.theta, sd: Math.max(0.6, Math.min(1.5, Math.sqrt(pr.sd * pr.sd + Math.pow(0.2 * gapW, 2)))) }; }
        var est = estimate(pp.items, prior);
        prev[sk] = { theta: est.mean, sd: est.sd, date: date };
        raw.push({ week: wid, sk: sk, est: est, pp: pp, date: date });
        res[sk] = { raw: pp.raw, of: pp.of, theta: est.mean, sd: est.sd, tierB: pp.meanB, prior: prior };
      });
      ['W', 'S'].forEach(function (sk) {
        var x = parts[sk];
        if (!x) return;
        res.dates[sk] = partDate(x);
        var m = marksPart(st, x, sk);
        if (m) res[sk] = m;
      });
      out.set(wid, res);
    });
    // calibration, then the bands (§5.3 · §5.8)
    ['L', 'R'].forEach(function (sk) {
      var mine = raw.filter(function (r) { return r.sk === sk; });
      var uncal = mine.map(function (r) { return { band: band(sk, r.est, { examType: examType }).band, date: r.date }; });
      var cal = calibrationOf(st, sk, uncal);
      mine.forEach(function (r) {
        var bd = band(sk, r.est, { examType: examType, calibrated: cal }), o = out.get(r.week)[sk];
        o.lo = bd.lo; o.hi = bd.hi; o.raw40 = bd.raw40; o.band = bd.band; o.range = [bd.lo, bd.hi]; o.table = bd.table; o.calibrated = cal;
        if (bd.alt) o.alt = bd.alt;
        delete o.prior;
      });
    });
    out.forEach(function (res) {
      var ks = ['L', 'R', 'W', 'S'];
      ks.forEach(function (k) { if (res[k] && res[k].band != null) res.gap[k] = r2(Math.max(0, res.target - res[k].band)); });
      res.overall = ks.every(function (k) { return res[k] && res[k].band != null; })
        ? { band: overall(ks.map(function (k) { return res[k].band; })), lo: overall(ks.map(function (k) { return res[k].lo; })), hi: overall(ks.map(function (k) { return res[k].hi; })) } : null;
    });
    X.weeksAll = out;
    return out;
  }
  /** weekResult(st, weekId) → WeekResult | null (§10.4): several leaves of one answer → the earliest; marks per criterion (§7.1) */
  function weekResult(st, weekId) {
    if (!st || !st._) return null;
    return weekResults(st).get(weekId) || null;
  }
  // ExamState.est: each skill's latest weekly estimate within 14 days; the overall only when all four are there (§5.5)
  function estimatesOf(st) {
    var U = Model().util, est = {}, byK = {};
    weekResults(st).forEach(function (res) {
      ['L', 'R', 'W', 'S'].forEach(function (k) {
        var x = res[k], d = res.dates[k];
        if (!x || x.band == null || !d || U.diffDays(d, st.asOf) > 14) return;
        if (!byK[k] || d > byK[k].date) byK[k] = { band: x.band, lo: x.lo, hi: x.hi, by: k === 'L' || k === 'R' ? 'est' : x.by, date: d, weekId: res.weekId };
      });
    });
    keys(byK).forEach(function (k) { est[k] = byK[k]; });
    if (['L', 'R', 'W', 'S'].every(function (k) { return est[k]; })) {
      est.overall = { band: overall(['L', 'R', 'W', 'S'].map(function (k) { return est[k].band; })), lo: overall(['L', 'R', 'W', 'S'].map(function (k) { return est[k].lo; })),
        hi: overall(['L', 'R', 'W', 'S'].map(function (k) { return est[k].hi; })) };
    }
    return est;
  }

  /* ───────────────────────────── the weekly report's 【考试】 lines (§2.6) ───────────────────────────── */
  function md(d) { return Number(d.slice(5, 7)) + '月' + Number(d.slice(8, 10)) + '日'; }
  function b1(x) { return (Math.round(Number(x) * 2) / 2).toFixed(1); }
  var ADVICE = { 'L-num': '多放十几 / 几十的听辨', 'L-date': '日期的读法（the fifth of …）', 'V-spell': '星期、月份和本周单词的拼写', 'V-cal': '星期和月份的词', 'L-dict': '整句听写（先逐词慢听）',
    'W-sent': '写完整的句子（主语 + 动词）', 'G-be': 'be 动词（am / is / are）', 'G-3sg': '第三人称的 -s', 'G-article': 'a / an / the', 'G-plural': '名词复数',
    'G-pos': '词性（动词、名词、副词）', 'R-infer': '"从周一到周五是几天"这种小推断', 'R-para': '同义替换', 'L-rule': '按说明作答（字数限制）', 'L-turn': '录音里的改口', 'G-prep': '时间介词 on / in / at',
    'V-coll': '搭配（pay by card、at the weekend）', 'L-time': '钟点', 'L-price': '价钱' };
  // the dates of a course week: its first study day to its last (or today)
  function courseWeekRange(st, weekId) {
    var X = st._, index = X.index, w = index && index.week.get(weekId), cp = (X.profile && X.profile.cp) || {}, lo = null, hi = null;
    if (!w) return null;
    (w.days || []).forEach(function (d) { var di = index.days.get(d); if (di) di.steps.forEach(function (sk) { var c = cp[sk]; if (isYmd(c)) { if (!lo || c < lo) lo = c; if (!hi || c > hi) hi = c; } }); });
    if (!lo) return null;
    return { from: lo, to: hi && hi > lo ? hi : st.asOf };
  }
  /** monthOf(st, weekId) → null, or for a full-moon test (§2.4, §9.3) { weeks: this week's result and the three before, calm: weak
   *  spots settled since the last one, scenes: scenes answered in since then, full: this week's lessons all done (a full moon) } */
  function monthOf(st, weekId) {
    var W = st && st.weeks, wr = W && W.get(weekId), X = st && st._;
    if (!wr || !wr.month || !X) return null;
    var end = function (w) { var d = ''; keys(w.dates).forEach(function (k) { if (w.dates[k] > d) d = w.dates[k]; }); return d; };
    var to = end(wr), from = '', weeks = [], calm = [], seen = {}, n = 0, idx = X.index, cw = idx && idx.week.get(weekId), cp = (X.profile && X.profile.cp) || {}, all = 0, done = 0;
    W.forEach(function (w) { if (w.n > wr.n - 4 && w.n <= wr.n) weeks.push(w); if (w.month && w.n < wr.n && end(w) > from) from = end(w); });
    weeks.sort(function (a, b) { return a.n - b.n; });
    st.subs.forEach(function (s, id) { if (s.retired && s.status !== 'weak' && s.retired > from && s.retired <= to) calm.push(id); });
    X.sessions.forEach(function (x) {
      if (x.meta.d > from && x.meta.d <= to) (x.meta.p || []).forEach(function (r) { if (Array.isArray(r) && r[2] && x.a[r[0]] && !seen[r[2]]) { seen[r[2]] = 1; n++; } });
    });
    (cw ? cw.days : []).forEach(function (id) { ((idx.days.get(id) || {}).steps || []).forEach(function (sk) { all++; if (isYmd(cp[sk])) done++; }); });
    return { weeks: weeks, calm: calm, scenes: n, full: all > 0 && done === all };
  }
  /** reportLines(st, weekId) → the 【考试】 lines of the weekly report (≤ 8, all from data); '' when there is nothing to say */
  function reportLines(st, weekId) {
    if (!st || !st._) return '';
    var X = st._, L = [], Bk = Bank(), all = weekResults(st), last = null;
    var rng0 = courseWeekRange(st, weekId), wn = weekNo(X.index, weekId);
    all.forEach(function (res, wid) { var ks = keys(res.dates); if (!ks.length) return; if (!last || weekNo(X.index, wid) > weekNo(X.index, last.weekId)) { if (weekNo(X.index, wid) <= wn) last = res; } });
    var quizzes = st.sessions.filter(function (x) { return x.kind === 'quiz' && x.done && rng0 && x.d >= rng0.from && x.d <= rng0.to; });
    if (!last && !quizzes.length && !st.weak.length) return '';
    L.push('【考试】第 ' + wn + ' 周');
    if (last) {
      var ds = keys(last.dates).map(function (k) { return last.dates[k]; }).sort(), when = ds.length ? md(ds[0]) + (ds[ds.length - 1] !== ds[0] ? '–' + md(ds[ds.length - 1]).replace(/^\d+月/, function (m0) { return ds[0].slice(5, 7) === ds[ds.length - 1].slice(5, 7) ? '' : m0; }) : '') : '';
      var bits = [], PN = { L: '听力', R: '阅读', W: '写作', S: '口语' };
      ['L', 'R'].forEach(function (k) {
        var x = last[k], rw = last.raw[k];
        if (x && x.band != null) bits.push(PN[k] + ' ' + x.raw + '/' + x.of + '，估约 ' + b1(x.band) + '（' + b1(x.lo) + '–' + b1(x.hi) + (k === 'R' ? '，按' + (x.table === 'RG' ? '培训类' : '学术类') + (x.alt ? '；' + (x.alt.table === 'RG' ? '培训类' : '学术类') + (x.alt.band === x.band ? '同为 ' : '约 ') + b1(x.alt.band) : '') : '') + '）');
        else if (rw) bits.push(PN[k] + ' ' + rw.raw + '/' + rw.of + '（题太少，只给对几题）');
      });
      if (last.W) bits.push('写作 ' + (last.W.by === 'ai' ? 'Claude 估 ' : last.W.by === 'self' ? '自评 ' : '部分自评 ') + b1(last.W.band) + '（' + W_KEYS.map(function (k) { return k + ' ' + last.W.c[k]; }).join(' · ') + '）');
      if (last.S) bits.push('口语 ' + b1(last.S.band) + '（' + (last.S.by === 'ai' ? 'Claude 估' : last.S.by === 'self' ? '自评' : '部分自评') + (last.S.typed ? '：打字作答，FC、P 为自评' : '') + '）');
      L.push('- ' + (last.weekId === weekId ? '本周周考' : '上周周考') + (when ? '（' + when + '）' : '') + '：' + (bits.length ? bits.join('；') : '还没有考完的一段'));
      if (last.overall) L.push('- 估算总分 ' + b1(last.overall.band) + '（估计，不是官方成绩；目标 ' + b1(last.target) + '）');
    }
    if (quizzes.length) {
      var n = 0, r = 0;
      quizzes.forEach(function (q) { n += q.done; r += q.right; });
      L.push('- 本周小考 ' + quizzes.length + ' 次、共 ' + n + ' 题，答对 ' + r + ' 题');
    }
    var weak = st.weak.slice(0, 3).map(function (id) { var s = st.subs.get(id), z = subZh(st, id); return z + (s && s.note ? ' ' + s.note : ''); });
    if (weak.length) L.push('- 最弱：' + weak.join('；'));
    var steady = [];
    st.subs.forEach(function (s, id) { if (s.retired && rng0 && s.retired >= rng0.from) steady.push(subZh(st, id)); });
    if (steady.length) L.push('- 已稳住：' + steady.slice(0, 4).join('、'));
    var claims = [];
    X.sessions.forEach(function (x) {
      if (!rng0 || x.meta.d < rng0.from || x.meta.d > rng0.to) return;
      keys(x.a).forEach(function (q) { var lf = x.a[q][1]; if (String(lf[8] || '').indexOf('s') >= 0 && lf[5]) claims.push(String(lf[5]) + (lf[6] ? '（参考：' + String(lf[6]) + '）' : '')); });
    });
    if (claims.length && L.length < 7) L.push('- 她点了"我的写法也对"：' + claims.slice(0, 2).join('；') + ' 请老师看');
    var adv = st.weak.map(function (id) { return ADVICE[id]; }).filter(Boolean).slice(0, 3);
    if (adv.length && L.length < 8) L.push('- 建议下一周：多练' + adv.join('、'));
    return L.slice(0, 8).join('\n');
  }

  return {
    CONST: CONST, TABLES: TABLES, rawToBand: rawToBand, overall: overall,
    state: state, subskills: subskills, criteria: criteria, offer: offer, plan: plan, estimate: estimate, band: band,
    weekResult: weekResult, weekResults: weekResults, monthOf: monthOf, estimates: estimatesOf, thenWait: thenWait, sky: sky, reportLines: reportLines, unitKeys: unitKeys, unitsOf: unitsOf,
    _: { readDocs: readDocs, leafDate: leafDate, parseSubs: parseSubs, leafOk: leafOk, capsOnly: capsOnly, weekOfDate: weekOfDate, tierOfWeek: tierOfWeek, paperOf: paperOf, accAt: accAt, learnedMap: learnedMap, planQuiz: planQuiz, levelOf: levelOf, formatsFor: formatsFor, visibility: visibility, raw40: raw40, refB: refB, marksOf: marksOf, genCtx: genCtx }
  };
});
