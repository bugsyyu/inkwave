/* 运筹沙盘 · app/base/model.js — owner: agent A (数据与宿主). docs/DESIGN.md §7, §11.3.
 *
 * Pure data model of the Base world: item index, evidence derivation (first-run freeze, inference, host backfill),
 * memory model, stage rules, lamps, moon, visibility, answer checking and document merging.
 * No DOM, no WB, no clock: every function takes what it needs (asOf dates are 'YYYY-MM-DD' strings).
 * UMD: Node → module.exports; browser → window.BaseEngine.Model. No side effects at load time.
 *
 * Words used below: an ITEM is one piece of teacher content (a word, a symbol, a quiz question, a dictation sentence,
 * a word pair, a sentence to write, a speaking prompt). A PIECE is one occurrence of an item in one step (the brick in
 * the wall); several pieces can share an item. EVIDENCE is a dated first answer about an item.
 */
(function (root, factory) {
  'use strict';
  var api = factory();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) { var BE = root.BaseEngine = root.BaseEngine || {}; if (!BE.Model) BE.Model = api; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function () {
  'use strict';

  var VERSION = 2;
  var own = Object.prototype.hasOwnProperty;
  function isObj(o) { return !!o && typeof o === 'object' && !Array.isArray(o); }
  function keys(o) { return isObj(o) ? Object.keys(o) : []; }

  /* ───────────────────────────── hashing (§7.2) ───────────────────────────── */
  function cyrb53(s) {
    s = String(s);
    var h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (var i = 0; i < s.length; i++) { var c = s.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }
  function h6(s) { var t = cyrb53(String(s)).toString(36).slice(-6); while (t.length < 6) t = '0' + t; return t; }

  /* ───────────────────────────── dates (calendar days, no time zones) ───────────────────────────── */
  var YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
  function isYmd(s) { return typeof s === 'string' && YMD_RE.test(s); }
  var DAYNUM = new Map();
  function dayNum(s) {
    var v = DAYNUM.get(s);
    if (v === undefined) {
      v = Math.round(Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000);
      if (DAYNUM.size > 5000) DAYNUM.clear();
      DAYNUM.set(s, v);
    }
    return v;
  }
  function numDay(n) {
    var d = new Date(n * 86400000);
    return d.getUTCFullYear() + '-' + pad2(d.getUTCMonth() + 1) + '-' + pad2(d.getUTCDate());
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function addDays(s, n) { return numDay(dayNum(s) + n); }
  function diffDays(a, b) { return dayNum(b) - dayNum(a); }
  function weekday(s) { return (((dayNum(s) + 4) % 7) + 7) % 7; } // 0 = Sunday (1970-01-01 was a Thursday)
  function mondayOf(s) { return addDays(s, -((weekday(s) + 6) % 7)); }
  function evDocId(s) { return 'ev-' + mondayOf(s); }
  function minYmd(a, b) { return !a ? b : !b ? a : a < b ? a : b; }
  function maxYmd(a, b) { return !a ? b : !b ? a : a > b ? a : b; }

  /* ───────────────────────────── course vocabulary ───────────────────────────── */
  var COMP_OF = {
    symbols: 'plinth', symreview: 'plinth', words: 'sill', flash: 'mortar', grammar: 'beam', dictation: 'windows',
    reading: 'steps', pairs: 'bells', write: 'roofFront', speak: 'door', checkin: 'lantern', weekly: 'plaque',
    placement: 'mark'
  };
  var KIND_OF = { symbols: 'sym', symreview: 'sym', words: 'word', grammar: 'quiz', reading: 'read', dictation: 'dict', pairs: 'pair', write: 'write', speak: 'speak' };
  var CLS_OF = { sym: 'know', word: 'know', pair: 'know', quiz: 'veh', read: 'veh', dict: 'veh', write: 'veh', speak: 'mark' };
  var CODE_OF = { word: 'sp', dict: 'dt', quiz: 'qz', read: 'rd', pair: 'pr', write: 'wr' };
  var SESS = ['a', 'b', 'c'];
  var WEEKDAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
  var MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  var CAL = {};
  WEEKDAYS.concat(MONTHS).forEach(function (w) { CAL[w] = 1; });
  // British → American spellings that count as the same word (§7.13); compared in lower case.
  var UK_US = {
    favourite: 'favorite', favourites: 'favorites', colour: 'color', colours: 'colors', colourful: 'colorful',
    centre: 'center', centres: 'centers', neighbour: 'neighbor', neighbours: 'neighbors', neighbourhood: 'neighborhood',
    theatre: 'theater', metre: 'meter', metres: 'meters', litre: 'liter', litres: 'liters', programme: 'program',
    travelling: 'traveling', travelled: 'traveled', traveller: 'traveler', cancelled: 'canceled', grey: 'gray',
    behaviour: 'behavior', honour: 'honor', humour: 'humor', labour: 'labor', flavour: 'flavor', harbour: 'harbor',
    organise: 'organize', organised: 'organized', realise: 'realize', realised: 'realized', recognise: 'recognize',
    apologise: 'apologize', practise: 'practice', analyse: 'analyze', defence: 'defense', licence: 'license',
    jewellery: 'jewelry', cheque: 'check', tyre: 'tire', mum: 'mom', pyjamas: 'pajamas', catalogue: 'catalog',
    dialogue: 'dialog', enrol: 'enroll', fulfil: 'fulfill', aluminium: 'aluminum', mould: 'mold', plough: 'plow',
    cancelling: 'canceling', modelling: 'modeling', modelled: 'modeled', labelled: 'labeled', practised: 'practiced', practising: 'practicing'
  };
  // a derived or compound form of a listed word (theatres, travellers, organisers, neighbouring, kilometres, smoulder): the
  // listed word at the end of the stem, its ending put back (a dropped e too: practis-ing); a compound's front word stays
  var UK_ENDS = ['', 's', 'es', 'd', 'ed', 'r', 'rs', 'er', 'ers', 'ing'];
  function usDerived(t) {
    for (var i = 0; i < UK_ENDS.length; i++) {
      var e = UK_ENDS[i], b = t.slice(0, t.length - e.length);
      if (b.length < 4 || t.slice(b.length) !== e) continue;
      for (var k = 0; k <= b.length - 4; k++) {
        var tail = b.slice(k), hit = own.call(UK_US, tail) ? UK_US[tail] : e && own.call(UK_US, tail + 'e') ? UK_US[tail + 'e'].replace(/e$/, '') : null;
        if (hit != null && (k === 0 || tail.length >= 5)) return b.slice(0, k) + hit + e;
      }
    }
    return null;
  }
  function usForm(w) {
    var t = String(w).toLowerCase(), d;
    if (own.call(UK_US, t)) return UK_US[t];
    if ((d = usDerived(t)) != null) return d;
    // regular -ise/-isation → -ize/-ization (the listed exceptions stay: exercise, advise, surprise, …)
    if (/(?:is(?:e|es|ed|ing|ation|ations))$/.test(t) && !/(?:exercis|advis|surpris|promis|premis|wis|ris|nois|pois|rais|prais|cruis|revis|supervis|televis|devis|comprom|enterpris|expertis|franchis|merchandis|chastis|despis|disguis|excis|incis|precis|concis)(?:e|es|ed|ing|ation|ations)$/.test(t) && t.length > 6) {
      t = t.replace(/is(e|es|ed|ing|ation|ations)$/, 'iz$1');
    }
    return t;
  }

  /* ───────────────────────────── gloss (§7.2) ───────────────────────────── */
  function cut40(s) {
    s = String(s || '');
    return s.length > 40 ? s.slice(0, 40).replace(/\s+$/, '') + '…' : s;
  }
  function gloss(it) {
    if (!it) return '';
    if (it.kind === 'pair' && it.pair) {
      return it.pair[0] + (it.pairZh[0] ? '（' + it.pairZh[0] + '）' : '') + '/ ' + it.pair[1] + (it.pairZh[1] ? '（' + it.pairZh[1] + '）' : '');
    }
    var en = cut40(it.en), zh = it.kind === 'word' ? zhSense(it.zh) : String(it.zh || '');
    return zh ? en + '（' + zh + '）' : en;
  }
  // First Chinese sense of a word-list gloss: "adv. 经常（t 通常不发音）" → "经常", "n. 家庭；家人" → "家庭".
  function zhSense(z) {
    var s = String(z || '').replace(/（[^）]*）/g, '').replace(/^(?:\s*(?:n|v|adj|adv|prep|conj|pron|num|art|int|aux|modal)\.\s*(?:\/\s*(?:n|v|adj|adv)\.\s*)?)+/i, '');
    s = s.split(/[；;，,]/)[0].trim();
    return s || String(z || '').trim();
  }

  /* ───────────────────────────── index (§7.2, §3.2) ───────────────────────────── */
  function weekNumOf(w) { return Number(w && w.n) || Number(String(w && w.id).slice(1)) || 0; }
  function stepsOfSess(d, s) { return d && Array.isArray(d[s]) ? d[s] : []; }
  function dayHasSteps(d) { return SESS.some(function (s) { return stepsOfSess(d, s).length > 0; }); }

  // Room slots (§7.10, same rules as House.layout, with Y11: rest days get no room).
  function roomSlots(week) {
    var days = ((week && week.days) || []).slice(0, 10).filter(dayHasSteps), out = {};
    if (!days.length) return out;
    var hall = -1;
    days.forEach(function (d, i) {
      SESS.forEach(function (s) {
        stepsOfSess(d, s).forEach(function (st) {
          if (st && (st.type === 'weekly' || st.type === 'placement' || st.type === 'symreview' || (st.type === 'flash' && st.fromWeek))) hall = i;
        });
      });
    });
    if (hall < 0) hall = days.length - 1;
    var others = [];
    days.forEach(function (d, i) { if (i !== hall) others.push(i); });
    var k = others.length, nW = Math.min(4, Math.ceil(k / 2)), nE = Math.min(4, k - nW);
    out[days[hall].id] = 'N';
    others.forEach(function (di, j) {
      var id = days[di].id;
      if (j < nW) out[id] = 'W' + (j + 1);
      else if (j < nW + nE) out[id] = 'E' + (j - nW + 1);
      else if (j < nW + nE + 2) out[id] = 'X' + (j - nW - nE + 1);
    });
    return out;
  }

  // Short labels for the step titles the patrols and cards use: "单词：星期和月份（25 个）" → "星期和月份".
  function topicOf(title) {
    var t = String(title || '');
    var m = /^[^：:]*[：:]\s*(.+)$/.exec(t);
    if (m) t = m[1];
    return t.replace(/（\s*\d+\s*个\s*）\s*$/, '').replace(/\(\s*\d+\s*\)\s*$/, '').trim();
  }

  /**
   * buildIndex(weeks, { symList, symbols, pairZh, ipaFor }) → Index
   * Index = { items: Map, pieces: Piece[], piece: Map<pieceId, Piece>, byStep: Map<sk, pieceId[]>, steps: Map<sk, StepI>,
   *           days: Map<dayId, DayI>, weeks: WeekI[], week: Map<weekId, WeekI>, order: Map<sk, n> }
   */
  function buildIndex(weeks, opts) {
    opts = opts || {};
    var symList = Array.isArray(opts.symList) ? opts.symList : [];
    var symbols = isObj(opts.symbols) ? opts.symbols : {};
    var pairZhFn = typeof opts.pairZh === 'function' ? opts.pairZh : function (w, o) { return o || ''; };
    var ipaFor = typeof opts.ipaFor === 'function' ? opts.ipaFor : null;
    var items = new Map(), pieces = [], pieceMap = new Map(), byStep = new Map(), steps = new Map(), days = new Map();
    var weeksOut = [], weekMap = new Map(), order = new Map(), seq = 0;
    var seenWeek = {};
    (weeks || []).forEach(function (w) {
      if (!w || !w.id || seenWeek[w.id]) return;
      seenWeek[w.id] = 1;
      var slots = roomSlots(w);
      var wi = { id: String(w.id), n: weekNumOf(w), title: String(w.title || ''), days: [], hallDay: null, wordSteps: [] };
      (w.days || []).forEach(function (d) {
        if (!d || !d.id) return;
        var di = { id: String(d.id), n: Number(d.n) || 0, title: String(d.title || ''), weekId: wi.id, slot: slots[d.id] || null,
          steps: [], sess: { a: [], b: [], c: [] }, rest: !dayHasSteps(d) };
        if (di.slot === 'N') wi.hallDay = di.id;
        SESS.forEach(function (s) {
          stepsOfSess(d, s).forEach(function (st, j) {
            if (!st || st.id == null) return;
            var sk = di.id + ':' + st.id;
            if (steps.has(sk)) return;
            var si = { sk: sk, id: String(st.id), dayId: di.id, weekId: wi.id, sess: s, j: j, type: String(st.type || ''), title: String(st.title || ''),
              m: Number(st.m) || 0, from: st.from || null, fromWeek: !!st.fromWeek, order: seq++, items: [], pieces: [], scored: 0, src: null, st: st };
            steps.set(sk, si);
            order.set(sk, si.order);
            byStep.set(sk, si.pieces);
            di.steps.push(sk);
            di.sess[s].push(sk);
            addStep(si, st, di, wi);
          });
        });
        days.set(di.id, di);
        wi.days.push(di.id);
      });
      weeksOut.push(wi);
      weekMap.set(wi.id, wi);
    });
    // flash steps review words taught elsewhere: they join those items' steps (learned dates) but hold no pieces
    steps.forEach(function (si) {
      if (si.type !== 'flash') return;
      var src = [];
      if (si.fromWeek) { var wk = weekMap.get(si.weekId); src = wk ? wk.wordSteps.slice() : []; }
      else if (si.from) { var sk = si.dayId + ':' + si.from; if (steps.has(sk) && steps.get(sk).type === 'words') src = [sk]; }
      si.src = src;
      src.forEach(function (sk2) {
        steps.get(sk2).items.forEach(function (id) {
          var it = items.get(id);
          if (it && it.steps.indexOf(si.sk) < 0) it.steps.push(si.sk);
          if (si.items.indexOf(id) < 0) si.items.push(id);
        });
      });
    });

    function addItem(id, kind, si, props) {
      var it = items.get(id);
      if (!it) {
        it = { id: id, kind: kind, cls: CLS_OF[kind] || 'mark', home: si.sk, steps: [], en: '', zh: '' };
        for (var k in props) if (own.call(props, k)) it[k] = props[k];
        items.set(id, it);
      }
      if (it.steps.indexOf(si.sk) < 0) it.steps.push(si.sk);
      if (si.items.indexOf(id) < 0) si.items.push(id);
      return it;
    }
    function addPiece(si, comp, idx, itemId, scored) {
      var pc = { id: si.sk + '/' + comp + ':' + idx, item: itemId || '', dayId: si.dayId, weekId: si.weekId, sk: si.sk, type: si.type, comp: comp, idx: idx, scored: !!scored };
      if (pieceMap.has(pc.id)) return;
      pieces.push(pc);
      pieceMap.set(pc.id, pc);
      si.pieces.push(pc.id);
      if (scored) si.scored++;
    }
    function addStep(si, st, di, wi) {
      var t = si.type, comp = COMP_OF[t] || 'crate';
      if (t === 'symbols' || t === 'symreview') {
        var list = t === 'symbols' ? (Array.isArray(st.items) ? st.items : []) : symList;
        list.forEach(function (ipa, idx) {
          if (typeof ipa !== 'string' || !ipa) return;
          var S = symbols[ipa], ex = S && S[2] && S[2][0];
          var it = addItem('s:' + ipa, 'sym', si, { ipa: ipa, en: '/' + ipa + '/', zh: S ? S[0] + (ex ? ' · ' + ex[0] + ' ' + ex[2] : '') : '',
            content: { en: '/' + ipa + '/', zh: S ? S[0] : '', ipa: ipa, tip: S ? S[1] : '', examples: S ? (S[2] || []).map(function (e) { return { en: e[0], ipa: e[1], zh: e[2] }; }) : [], say: S ? (S[2] || []).map(function (e) { return e[0]; }).join('. ') : '' } });
          if (t === 'symbols' && it.home !== si.sk && steps.get(it.home) && steps.get(it.home).type === 'symreview') it.home = si.sk;
          addPiece(si, comp, idx, it.id, true);
        });
        return;
      }
      if (t === 'words') {
        wi.wordSteps.push(si.sk);
        (Array.isArray(st.words) ? st.words : []).forEach(function (w, idx) {
          if (!Array.isArray(w) || !w[0]) return;
          var en = String(w[0]), ipa = ipaFor ? ipaFor(w) : (typeof w[3] === 'string' && w[3]) || w[1] || '';
          var it = addItem('w:' + en.toLowerCase(), 'word', si, { en: en, zh: String(w[2] || ''), ipa: ipa, ipaGb: w[1] || '', ipaUs: (typeof w[3] === 'string' && w[3]) || '',
            content: { en: en, zh: zhSense(w[2]), zhFull: String(w[2] || ''), ipa: ipa, say: en } });
          addPiece(si, comp, idx, it.id, true);
        });
        return;
      }
      if (t === 'grammar' || t === 'reading') {
        var qkey = t === 'grammar' ? si.sk : si.sk + ':q';
        var P = t === 'reading' ? (st.passage || {}) : null;
        var quiz = t === 'grammar' ? st.quiz : P.quiz;
        var used = {};
        (Array.isArray(quiz) ? quiz : []).forEach(function (q, idx) {
          if (!Array.isArray(q)) return;
          var stem = String(q[0] || ''), hash = h6(stem);
          if (used[hash]) hash = h6(stem + '|' + ((q[1] || [])[q[2]] || idx)); // two questions with one stem in a step
          used[hash] = 1;
          var id = 'q:' + qkey + ':' + hash;
          var it = addItem(id, t === 'grammar' ? 'quiz' : 'read', si, { qkey: qkey, qi: idx, en: stem, zh: String(q[4] || ''),
            content: { stem: stem, en: stem, zh: String(q[4] || ''), opts: (q[1] || []).slice(), ans: q[2], why: String(q[3] || ''), optsZh: Array.isArray(q[5]) ? q[5].slice() : [],
              passage: P ? { title: String(P.title || ''), titleZh: String(P.titleZh || ''), en: String(P.text || ''), zh: String(P.zh || '') } : null, say: stem } });
          addPiece(si, comp, idx, it.id, true);
        });
        return;
      }
      if (t === 'dictation') {
        (Array.isArray(st.items) ? st.items : []).forEach(function (x, idx) {
          if (!Array.isArray(x) || !x[0]) return;
          var it = addItem('d:' + si.sk + ':' + h6(x[0]), 'dict', si, { ref: String(x[0]), en: String(x[0]), zh: String(x[1] || ''), di: idx,
            content: { en: String(x[0]), zh: String(x[1] || ''), say: String(x[0]) } });
          addPiece(si, comp, idx, it.id, true);
        });
        return;
      }
      if (t === 'pairs') {
        (Array.isArray(st.pairs) ? st.pairs : []).forEach(function (p, idx) {
          if (!Array.isArray(p) || !p[0] || !p[1]) return;
          var a = String(p[0]), b = String(p[1]), za = pairZhFn(a, p[2]) || '', zb = pairZhFn(b, p[3]) || '';
          var ab = [[a, za], [b, zb]].sort(function (x, y) { return x[0] < y[0] ? -1 : x[0] > y[0] ? 1 : 0; });
          var it = addItem('p:' + ab[0][0] + '|' + ab[1][0], 'pair', si, { pair: [ab[0][0], ab[1][0]], pairZh: [ab[0][1], ab[1][1]], en: ab[0][0] + ' / ' + ab[1][0], zh: ab[0][1] + ' / ' + ab[1][1],
            content: { en: ab[0][0] + ' / ' + ab[1][0], zh: ab[0][1] + ' / ' + ab[1][1], pair: [ab[0][0], ab[1][0]], pairZh: [ab[0][1], ab[1][1]], say: ab[0][0] + '. ' + ab[1][0] } });
          addPiece(si, comp, idx, it.id, true);
        });
        return;
      }
      if (t === 'write') {
        (Array.isArray(st.items) ? st.items : []).forEach(function (x, idx) {
          if (!Array.isArray(x) || !x[0]) return;
          var it = addItem('x:' + si.sk + ':' + h6(x[0]), 'write', si, { ref: String(x[1] || ''), en: String(x[1] || ''), zh: String(x[0]), wi: idx,
            content: { en: String(x[1] || ''), zh: String(x[0]), ref: String(x[1] || ''), say: String(x[1] || '') } });
          addPiece(si, comp, idx, it.id, true);
        });
        return;
      }
      if (t === 'speak') {
        var sp = st.speak || {};
        var it2 = addItem('k:' + si.sk, 'speak', si, { en: String(sp.q || ''), zh: String(sp.zh || ''),
          content: { en: String(sp.q || ''), zh: String(sp.zh || ''), model: String(sp.model || ''), modelZh: String(sp.modelZh || ''), phrases: Array.isArray(sp.phrases) ? sp.phrases.slice() : [], say: String(sp.q || '') } });
        addPiece(si, comp, 0, it2.id, true);
        return;
      }
      if (t === 'flash') return; // mortar: no piece of its own (§7.2)
      addPiece(si, comp, 0, '', false); // lantern · plaque · mark · crate
    }

    // short labels (for compact lists such as the gold seams): quiz about one word → "works（工作）"; reading → its Chinese
    var wordZh = {};
    items.forEach(function (it) { if (it.kind === 'word') wordZh[it.en.toLowerCase()] = zhSense(it.zh); });
    items.forEach(function (it) {
      if (it.kind === 'quiz') {
        var m = /这句里的\s*([A-Za-z'’-]+)\s*是/.exec(it.en) || /^([A-Za-z'’-]+)\s*是什么词性/.exec(it.en);
        var w = m && m[1].toLowerCase(), z = w && (wordZh[w] || wordZh[w.replace(/(?:es|s)$/, '')] || wordZh[w.replace(/ies$/, 'y')]);
        it.short = m ? m[1] + (z ? '（' + z + '）' : '') : gloss(it);
      } else if (it.kind === 'read') it.short = it.zh || gloss(it);
      else it.short = gloss(it);
      it.label = gloss(it);
    });
    return { v: VERSION, items: items, pieces: pieces, piece: pieceMap, byStep: byStep, steps: steps, days: days, weeks: weeksOut, week: weekMap, order: order };
  }

  /* ───────────────────────────── evidence (§7.1, §7.3) ───────────────────────────── */
  // leaf = [result, mode] or [result, mode, 'i']; result is 1/0, or the percent for a dictation sentence.
  function leafOk(it, leaf) {
    var r = leaf[0];
    if (it && it.kind === 'dict') return Number(r) >= 80;
    return r === 1 || r === true;
  }
  function mkAnswer(it, d, hms, leaf) {
    var a = { d: d, hms: hms, ok: leafOk(it, leaf), src: String(leaf[1] || 'L'), inf: leaf[2] === 'i' };
    if (it && it.kind === 'dict' && typeof leaf[0] === 'number') a.pct = leaf[0];
    return a;
  }
  var PRIO = { L: 0, K: 0, P: 1, D1: 1, D2: 1, D3: 1, T: 1, H: 1, W: 1, F: 2, S: 3, R: 4 };

  function cpOf(host, sk) { var v = host && host.profile && host.profile.cp ? host.profile.cp[sk] : null; return isYmd(v) ? v : null; }
  function learnedOf(index, host, it) {
    var L = null;
    it.steps.forEach(function (sk) { L = minYmd(L, cpOf(host, sk)); });
    return L;
  }
  // The date a host result belongs to: its own date, else the step's completion, else the day's first study date.
  function keyDate(index, host, r, sk) {
    if (Array.isArray(r) && isYmd(r[4])) return r[4];
    var c = cpOf(host, sk);
    if (c) return c;
    var si = index.steps.get(sk), di = si && index.days.get(si.dayId), first = null;
    if (di) di.steps.forEach(function (k) { first = minYmd(first, cpOf(host, k)); });
    return first;
  }

  /**
   * deriveLegacy(index, host, legacyRv) → [{ item, date, hms: '000000', leaf, prio, order }]
   * Every first answer the host's own records imply (the table in §7.3). One entry per (item, date): the first by
   * source priority and course order. Used by the first-run freeze (dates ≤ born) and by the in-memory host backfill.
   */
  function deriveLegacy(index, host, legacyRv) {
    var p = (host && host.profile) || {}, cp = p.cp || {}, cq = p.cq || {}, dt = p.dt || {}, pg = p.pg || {}, ww = p.ww || {}, ws = p.ws || {}, wr = p.wr || {}, wrd = p.wrd || {};
    var out = [];
    function push(itemId, date, leaf, sk) {
      if (!isYmd(date) || !index.items.has(itemId)) return;
      out.push({ item: itemId, date: date, hms: '000000', leaf: leaf, prio: PRIO[leaf[1]] != null ? PRIO[leaf[1]] : 5, order: index.order.has(sk) ? index.order.get(sk) : 1e9 });
    }
    function stepItemsAt(sk) { var si = index.steps.get(sk); return si ? si.pieces.map(function (pid) { return index.piece.get(pid); }).filter(function (pc) { return pc.scored; }) : []; }
    index.steps.forEach(function (si, sk) {
      var t = si.type, done = isYmd(cp[sk]) ? cp[sk] : null;
      if (t === 'grammar' || t === 'reading') {
        var qkey = t === 'grammar' ? sk : sk + ':q', r = cq[qkey], pcs = stepItemsAt(sk);
        if (Array.isArray(r)) {
          var date = isYmd(r[4]) ? r[4] : done;
          var bits = typeof r[2] === 'string' && r[2] ? r[2] : null;
          pcs.forEach(function (pc) {
            var it = index.items.get(pc.item), q = it.qi, ok;
            if (bits) { if (q >= bits.length) return; ok = bits.charAt(q) === '1'; }
            else if (Number(r[0]) === Number(r[1]) && Number(r[1]) > 0) ok = true;
            else if (Number(r[0]) === 0 && Number(r[1]) > 0) ok = false;
            else return; // an old score without per-question bits: nothing certain per question
            push(pc.item, date, [ok ? 1 : 0, 'L'], sk);
          });
          // a redo round on the review page (cq['rv:'+qkey], rescued by H24): its bits follow the original's '0' questions
          var rv = legacyRv && legacyRv['rv:' + qkey];
          if (Array.isArray(rv) && bits && done && isYmd(rv[4]) && typeof rv[2] === 'string') {
            var wrongQ = [];
            for (var i = 0; i < bits.length; i++) if (bits.charAt(i) === '0') wrongQ.push(i);
            wrongQ.forEach(function (qi, k) {
              if (k >= rv[2].length) return;
              var pc = pcs.find(function (x) { return index.items.get(x.item).qi === qi; });
              if (pc) push(pc.item, rv[4], [rv[2].charAt(k) === '1' ? 1 : 0, 'R'], sk);
            });
          }
        }
        return;
      }
      if (t === 'dictation') {
        var rec = isObj(dt[sk]) ? dt[sk] : {}, anyDt = keys(rec).length > 0, tot = cq[sk];
        stepItemsAt(sk).forEach(function (pc) {
          var it = index.items.get(pc.item), row = rec[it.di];
          if (Array.isArray(row)) {
            var pct = Number(row[1]);
            if (isFinite(pct)) push(pc.item, isYmd(row[2]) ? row[2] : done, [Math.round(pct), 'L'], sk);
          } else if (!anyDt && Array.isArray(tot) && Number(tot[1]) > 0) {
            push(pc.item, keyDate(index, host, tot, sk), [Math.round(Number(tot[0]) / Number(tot[1]) * 100), 'L', 'i'], sk);
          }
        });
        return;
      }
      if (t === 'pairs') {
        var miss = Array.isArray(pg[sk]) ? pg[sk] : [], missed = {};
        miss.forEach(function (m) {
          if (!Array.isArray(m) || !m[0] || !m[1] || !isYmd(m[2])) return;
          var ab = [String(m[0]), String(m[1])].sort(), id = 'p:' + ab[0] + '|' + ab[1];
          missed[id] = 1;
          push(id, m[2], [0, 'L'], sk);
        });
        var best = cq[sk];
        if (done && Array.isArray(best) && Number(best[1]) > 0) {
          var okAll = Number(best[0]) / Number(best[1]) >= 0.8;
          stepItemsAt(sk).forEach(function (pc) { if (!missed[pc.item]) push(pc.item, done, [okAll ? 1 : 0, 'L', 'i'], sk); });
        }
        return;
      }
      if (t === 'write') {
        var a = Array.isArray(wr[sk]) ? wr[sk] : null, when = isYmd(wrd[sk]) ? wrd[sk] : done;
        if (!a || !when || !a.some(function (x) { return String(x || '').trim(); })) return;
        stepItemsAt(sk).forEach(function (pc) {
          var it = index.items.get(pc.item), ans = String(a[it.wi] == null ? '' : a[it.wi]);
          push(pc.item, when, [compareWrite(ans, it.ref, when < CASE_FREE).ok ? 1 : 0, 'W'], sk);
        });
        return;
      }
      if (t === 'symbols' && done) {
        stepItemsAt(sk).forEach(function (pc) {
          var ipa = index.items.get(pc.item).ipa;
          if (ws[ipa]) return; // the "还不熟" mark: one miss on the learned date (below)
          push(pc.item, done, [1, 'F', 'i'], sk);
        });
        return;
      }
      if (t === 'symreview' && done) {
        stepItemsAt(sk).forEach(function (pc) {
          var it = index.items.get(pc.item);
          if (ws[it.ipa]) return;
          var L = null; // learned through its own symbols step, strictly before the review
          it.steps.forEach(function (k) { var s2 = index.steps.get(k); if (s2 && s2.type === 'symbols') L = minYmd(L, cpOf(host, k)); });
          if (L && L < done) push(pc.item, done, [1, 'F'], sk);
        });
        return;
      }
      if (t === 'flash' && done) {
        // words reviewed by this flash round and not in the weak-word list: "remembered" (inferred), dated the round
        si.items.forEach(function (id) {
          var it = index.items.get(id);
          if (!it || it.kind !== 'word' || ww[it.en] || ww[it.en.toLowerCase()]) return;
          var L = learnedOf(index, host, it);
          if (!L || L > done) return;
          push(id, done, [1, 'F', 'i'], sk);
        });
      }
    });
    // weak words: the first miss (its own date in the 5-item shape, else the learned date) and the last miss
    keys(ww).forEach(function (w) {
      var v = ww[w];
      if (!Array.isArray(v)) return;
      var id = 'w:' + String(w).toLowerCase(), it = index.items.get(id);
      if (!it) return;
      var L = learnedOf(index, host, it), first, last;
      if (v.length >= 5) { first = isYmd(v[3]) ? v[3] : L; last = isYmd(v[4]) ? v[4] : null; }
      else { first = L; last = isYmd(v[3]) ? v[3] : null; }
      if (first) push(id, first, [0, 'F'], it.home);
      if (last && last !== first) push(id, last, [0, 'F'], it.home);
    });
    // symbols marked "还不熟": one miss on the learned date
    keys(ws).forEach(function (ipa) {
      if (!ws[ipa]) return;
      var it = index.items.get('s:' + ipa);
      if (!it) return;
      var L = learnedOf(index, host, it);
      if (L) push(it.id, L, [0, 'F'], it.home);
    });
    // first per (item, date)
    out.sort(function (x, y) { return x.item < y.item ? -1 : x.item > y.item ? 1 : x.date < y.date ? -1 : x.date > y.date ? 1 : x.prio - y.prio || x.order - y.order; });
    var res = [], last2 = '';
    out.forEach(function (e) { var k = e.item + '\u0000' + e.date; if (k !== last2) { res.push(e); last2 = k; } });
    return res;
  }

  // The host's records change far less often than derive() runs: keep the last derivation for identical inputs.
  var legacyCache = { index: null, sig: null, res: null };
  function deriveLegacyCached(index, host, legacyRv) {
    var p = (host && host.profile) || {};
    var sig = JSON.stringify([p.cp, p.cq, p.dt, p.pg, p.ww, p.ws, p.wr, p.wrd, legacyRv || null]);
    if (legacyCache.index === index && legacyCache.sig === sig) return legacyCache.res;
    var res = deriveLegacy(index, host, legacyRv);
    legacyCache = { index: index, sig: sig, res: res };
    return res;
  }

  function entry(e) { return { doc: evDocId(e.date), item: e.item, date: e.date, hms: e.hms || '000000', leaf: e.leaf }; }

  /** freeze(index, host, legacyRv, until) → Entry[]: the first-run freeze, every derived first answer dated ≤ until. */
  function freeze(index, host, legacyRv, until) {
    return deriveLegacy(index, host, legacyRv).filter(function (e) { return !until || e.date <= until; }).map(entry);
  }

  /**
   * inferOnStepDone(index, host, stepKey, date, hms?) → Entry[]
   * Inferences frozen the moment they form (§7.3 rule 3): a flash round done → words not in the weak list count as
   * remembered; a symbol step done → symbols not marked "还不熟"; a pair game done → the best round; a dictation step done
   * with only a total; the symbol review → previously learned symbols (self-rated).
   */
  function inferOnStepDone(index, host, sk, date, hms) {
    var si = index.steps.get(sk);
    if (!si || !isYmd(date)) return [];
    var single = { profile: Object.assign({}, (host && host.profile) || {}) };
    single.profile.cp = Object.assign({}, single.profile.cp || {});
    single.profile.cp[sk] = single.profile.cp[sk] || date;
    var all = deriveLegacy(index, single, null);
    var mine = {};
    if (si.type === 'flash') si.items.forEach(function (id) { mine[id] = 1; });
    else si.pieces.forEach(function (pid) { var pc = index.piece.get(pid); if (pc.item) mine[pc.item] = 1; });
    return all.filter(function (e) {
      if (!mine[e.item] || e.date !== date) return false;
      if (si.type === 'symreview') return e.leaf[1] === 'F' && e.leaf[2] !== 'i';
      return e.leaf[2] === 'i';
    }).map(function (e) { var x = entry(e); x.hms = hms || '000000'; return x; });
  }

  // A stored evidence leaf: [result, mode] or [result, mode, 'i'] (result 0/1, a dictation percent, or true/false).
  var MODES = { L: 1, F: 1, R: 1, T: 1, H: 1, D1: 1, D2: 1, D3: 1, P: 1, W: 1, S: 1, K: 1 };
  var HMS_RE = /^\d{6}$/;
  function validLeaf(leaf) {
    if (!Array.isArray(leaf) || leaf.length < 2 || leaf.length > 3) return false;
    var r = leaf[0];
    if (!(typeof r === 'boolean' || (typeof r === 'number' && isFinite(r) && r >= 0 && r <= 100))) return false;
    return own.call(MODES, leaf[1]) && (leaf.length === 2 || leaf[2] === 'i');
  }
  /**
   * legacyFilter(entries, hasEv, born) → the derived host answers that may join the evidence (backfill or a freeze):
   *   · after the first run (born) only dates ≥ born: everything before it was frozen, and host fields rewritten later
   *     (flash-yes lowering ww, a best pairs score, a saved-over sentence) must not change the past;
   *   · a sentence in `wr` is only a first answer while the item has no evidence at all: 「保存修改」 after reading the
   *     reference would otherwise make a fake "still right days later".
   * hasEv(itemId) → boolean.
   */
  function legacyFilter(list, hasEv, born) {
    return list.filter(function (e) {
      if (born && e.date < born) return false;
      if (e.leaf[1] === 'W' && hasEv(e.item)) return false;
      return true;
    });
  }

  /**
   * answers(index, evDocs, host, born, legacyRv?) → Map<itemId, Answer[]> (one first answer per date, ascending)
   * Evidence documents first; for (item, date) pairs they do not cover, the host's records (backfill, in memory only;
   * after the first run only for dates from `born` on, see legacyFilter).
   */
  function answers(index, evDocs, host, born, legacyRv) {
    var byKey = new Map(); // item → Map(date → {hms, leaf})
    function put(item, date, hms, leaf, fromEv) {
      if (!isYmd(date)) return;
      var m = byKey.get(item);
      if (!m) { m = new Map(); byKey.set(item, m); }
      var cur = m.get(date);
      if (!cur) { m.set(date, { hms: hms, leaf: leaf, ev: fromEv }); return; }
      if (fromEv && !cur.ev) { m.set(date, { hms: hms, leaf: leaf, ev: true }); return; }
      if (fromEv === cur.ev && hms < cur.hms) m.set(date, { hms: hms, leaf: leaf, ev: fromEv });
    }
    keys(evDocs).forEach(function (docId) {
      var doc = evDocs[docId];
      if (!/^ev-\d{4}-\d{2}-\d{2}$/.test(docId) || !isObj(doc) || !isObj(doc.it)) return;
      keys(doc.it).forEach(function (item) {
        if (!index.items.has(item)) return; // evidence for content that is gone: kept in the doc, not drawn
        var byDate = doc.it[item];
        keys(byDate).forEach(function (date) {
          var byT = byDate[date];
          keys(byT).forEach(function (hms) { if (HMS_RE.test(hms) && validLeaf(byT[hms])) put(item, date, hms, byT[hms], true); });
        });
      });
    });
    if (host) {
      var hasEv = function (item) { return byKey.has(item); };
      legacyFilter(deriveLegacyCached(index, host, legacyRv), hasEv, isYmd(born) ? born : null).forEach(function (e) { put(e.item, e.date, e.hms, e.leaf, false); });
    }
    var out = new Map();
    byKey.forEach(function (m, item) {
      var it = index.items.get(item), list = [];
      m.forEach(function (v, date) { list.push(mkAnswer(it, date, v.hms, v.leaf)); });
      list.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
      out.set(item, list);
    });
    return out;
  }

  /* ───────────────────────────── memory model (§7.4) ───────────────────────────── */
  function memory(item, list, learned, asOf) {
    var h = 1, t0 = learned || null, real = 0, lastOk = null, lastMiss = null, seam = false, typed = false;
    var n = 0, misses = 0, allInf = true, allOk = true, first = null, lastDate = null;
    (list || []).forEach(function (e) {
      if (asOf && e.d > asOf) return;
      if (!t0) t0 = e.d;
      if (!first) first = e;
      var dlt = Math.max(0, diffDays(t0, e.d));
      if (e.ok) {
        h = Math.min(90, 1.3 * h + 0.9 * dlt);
        if (!e.inf && learned && e.d > learned) real++;
        if (lastMiss && e.d > lastMiss && !e.inf) { seam = true; if (e.src === 'T') typed = true; }
      } else {
        h = Math.max(0.5, 0.35 * h);
        lastMiss = e.d; seam = false; typed = false; misses++; allOk = false;
      }
      if (!e.inf) allInf = false;
      t0 = e.d; lastOk = e.ok; lastDate = e.d; n++;
    });
    var ref = t0 || asOf;
    var age = asOf && ref ? Math.max(0, diffDays(ref, asOf)) : 0;
    var p = Math.pow(2, -age / h);
    return {
      h: h, t0: t0, real: real, lastOk: lastOk, lastMiss: lastMiss, seam: seam, typedAfterMiss: typed, p: p,
      due: p < 0.6 || lastOk === false, allInf: n > 0 && allInf, allInfOk: n > 0 && allInf && allOk, n: n, misses: misses,
      firstTry: !!(first && first.ok && !first.inf && misses === 0), firstDate: first ? first.d : null, lastDate: lastDate
    };
  }
  function nextDue(mem) { return mem && mem.t0 ? addDays(mem.t0, Math.ceil(0.737 * mem.h)) : null; }
  // One more correct answer on date t (Δ from t0): the half-life that follows.
  function hAfterOk(mem, t) { return Math.min(90, 1.3 * mem.h + 0.9 * Math.max(0, diffDays(mem.t0 || t, t))); }

  /* ───────────────────────────── stages (§7.5) ───────────────────────────── */
  function itemStage(item, mem, ctx) {
    ctx = ctx || {};
    if (!ctx.learned) return 1;
    if (item.cls === 'mark') return 3;
    if (!mem || !mem.n || mem.lastOk === false) return 2;
    if (item.cls === 'veh' && mem.firstTry) {
      var later = (ctx.hallDone || []).some(function (d) { return d > mem.firstDate && (!ctx.asOf || d <= ctx.asOf); });
      return later ? 4 : 3;
    }
    if (mem.h >= 4 && mem.real >= 1 && (item.kind !== 'word' || !mem.lastMiss || mem.typedAfterMiss)) return 4;
    return 3;
  }
  function sight(v) { return v >= 0.7 ? 'clear' : v >= 0.4 ? 'blur' : 'fog'; }
  var VIS_MISS = 0.39;                                             // below the fog threshold of sight()

  /**
   * snapshot(index, answers, host, asOf) → Snapshot (A-internal; B and C read Derived only)
   * host = { profile, reviews? }. Piece stages are the historical maximum (never go down), evaluated on every date
   * the inputs change (answers, completions, the hall day's completions).
   */
  // One pass over an item's first answers: its memory as of asOf, and the change points of its stage over time
  // [[date, stage, srcOfTheAnswerThatPushedIt]] from the learned day on (dates: answers, the learned day, and for
  // practice pieces the hall day's completions, which can turn a first-time-right answer into 04).
  function itemPass(it, list, L, hd, asOf) {
    var h = 1, t0 = L || null, real = 0, lastOk = null, lastMiss = null, seam = false, typed = false;
    var n = 0, misses = 0, allInf = true, allOk = true, first = null, lastDate = null, okSrc = null, ai = 0;
    function apply(e) {
      if (!t0) t0 = e.d;
      if (!first) first = e;
      var dlt = Math.max(0, diffDays(t0, e.d));
      if (e.ok) {
        h = Math.min(90, 1.3 * h + 0.9 * dlt);
        if (!e.inf && L && e.d > L) real++;
        if (lastMiss && e.d > lastMiss && !e.inf) { seam = true; if (e.src === 'T') typed = true; }
        okSrc = e.src;
      } else { h = Math.max(0.5, 0.35 * h); lastMiss = e.d; seam = false; typed = false; misses++; allOk = false; }
      if (!e.inf) allInf = false;
      t0 = e.d; lastOk = e.ok; lastDate = e.d; n++;
    }
    var pts = [];
    if (L) {
      var ds = [L];
      for (var i = 0; i < list.length; i++) if (list[i].d > L) ds.push(list[i].d);
      if (it.cls === 'veh') for (var j = 0; j < hd.length; j++) if (hd[j] > L && hd[j] <= asOf) ds.push(hd[j]);
      ds.sort();
      var prev = null;
      for (var k = 0; k < ds.length; k++) {
        var t = ds[k];
        if (t === prev) continue;
        prev = t;
        while (ai < list.length && list[ai].d <= t) apply(list[ai++]);
        var st = itemStage(it, { n: n, lastOk: lastOk, firstTry: !!(first && first.ok && !first.inf && misses === 0), firstDate: first ? first.d : null,
          h: h, real: real, lastMiss: lastMiss, typedAfterMiss: typed }, { learned: L, hallDone: hd, asOf: t });
        if (!pts.length || pts[pts.length - 1][1] !== st) pts.push([t, st, okSrc]);
      }
    }
    while (ai < list.length) apply(list[ai++]);
    var ref = t0 || asOf, p = Math.pow(2, -Math.max(0, diffDays(ref, asOf)) / h);
    var mem = {
      h: h, t0: t0, real: real, lastOk: lastOk, lastMiss: lastMiss, seam: seam, typedAfterMiss: typed, p: p,
      due: p < 0.6 || lastOk === false, allInf: n > 0 && allInf, allInfOk: n > 0 && allInf && allOk, n: n, misses: misses,
      firstTry: !!(first && first.ok && !first.inf && misses === 0), firstDate: first ? first.d : null, lastDate: lastDate
    };
    return { mem: mem, pts: pts };
  }

  /**
   * snapshot(index, answers, host, asOf) → Snapshot (A-internal; B and C read Derived only)
   * host = { profile, reviews? }. Piece stages are the historical maximum (never go down): a piece is max(2, the
   * item's stage) on every date from its step's completion on. Visibility (§7.6) is the recall estimate p (≥ .5 for
   * knowledge only ever inferred right), capped at VIS_MISS (.39, under the fog) while the latest first answer is wrong.
   */
  function snapshot(index, ans, host, asOf) {
    var profile = (host && host.profile) || {}, cp = profile.cp || {}, cq = profile.cq || {};
    var done = new Map();                                          // step → completion date (≤ asOf)
    index.steps.forEach(function (si, sk) { var v = cp[sk]; if (typeof v === 'string' && v <= asOf && isYmd(v)) done.set(sk, v); });
    function cpAt(sk) { return done.get(sk) || null; }
    var hallDone = new Map();
    index.weeks.forEach(function (wi) {
      var ds = [];
      var di = wi.hallDay && index.days.get(wi.hallDay);
      if (di) di.steps.forEach(function (sk) { var c = cpAt(sk); if (c && ds.indexOf(c) < 0) ds.push(c); });
      ds.sort();
      hallDone.set(wi.id, ds);
    });
    var NONE = [];
    var BLANK = { mem: { h: 1, t0: null, real: 0, lastOk: null, lastMiss: null, seam: false, typedAfterMiss: false, p: 1, due: false, allInf: false, allInfOk: false, n: 0, misses: 0, firstTry: false, firstDate: null, lastDate: null }, list: NONE, pts: NONE, L: null, v: null };
    var SKETCH = { stage: 1, trial: false, repair: false, seam: false, inferred: false, src04: null, at: {} };
    // one entry per item: { mem, list, pts, L (learned), v (visibility or null) }
    var memo = new Map();
    index.items.forEach(function (it, id) {
      var L = null, taught = false;
      for (var i = 0; i < it.steps.length; i++) {
        var c = done.get(it.steps[i]);
        if (c) { if (!L || c < L) L = c; var si = index.steps.get(it.steps[i]); if (si.type !== 'symreview' && si.type !== 'flash') taught = true; }
      }
      var all = ans.get(id) || NONE, list = all;
      if (all.length && all[all.length - 1].d > asOf) list = all.filter(function (e) { return e.d <= asOf; });
      if (!L && !list.length) { memo.set(id, BLANK); return; }   // not taught yet, never answered
      var home = index.steps.get(it.home), pass = itemPass(it, list, L, (home && hallDone.get(home.weekId)) || NONE, asOf), mem = pass.mem;
      var v = null;                                                // visibility (§7.6)
      if (L && (taught || mem.n > 0) && it.cls !== 'mark' && !(it.cls === 'veh' && mem.firstTry) && !(mem.h >= 30)) v = mem.allInfOk ? Math.max(mem.p, 0.5) : mem.p;
      // the fog shows what she remembers now: an item whose latest first answer was wrong stays under the fog until she
      // gets it right again (p alone is 1 on the day of the miss: "清楚" right after a wrong answer)
      if (v != null && mem.lastOk === false) v = Math.min(v, VIS_MISS);
      memo.set(id, { mem: mem, list: list, pts: pass.pts, L: L, v: v });
    });
    var partInfo = new Map();
    index.pieces.forEach(function (pc) {
      var d = done.get(pc.sk) || null, trial = !d && (cq[pc.sk] != null || (pc.type === 'reading' && cq[pc.sk + ':q'] != null));
      var m = pc.item ? memo.get(pc.item) : null;
      if (!d && !trial && (!m || !m.mem.n)) { partInfo.set(pc.id, SKETCH); return; }
      if (!pc.scored || !m) { partInfo.set(pc.id, { stage: d ? 2 : 1, trial: !!trial, repair: false, seam: false, inferred: false, src04: null, at: d ? { 2: d } : {} }); return; }
      var best = 1, src04 = null, at = {};
      if (d) {
        var pts = m.pts, cur = null, i = 0;
        while (i < pts.length && pts[i][0] <= d) cur = pts[i++];
        best = Math.max(2, cur ? cur[1] : 2);
        for (var k = 2; k <= best; k++) at[k] = d;
        if (best === 4) src04 = (cur && cur[2]) || 'L';
        for (; i < pts.length; i++) {
          var st = pts[i][1];
          if (st > best) {
            for (var k2 = best + 1; k2 <= st; k2++) at[k2] = pts[i][0];
            if (st === 4 && !src04) src04 = pts[i][2] || 'L';
            best = st;
          }
        }
      }
      var mem = m.mem;
      partInfo.set(pc.id, { stage: best, trial: !!trial, at: at, src04: src04, repair: !!(d && mem.n && mem.lastOk === false), seam: !!(d && mem.seam), inferred: !!(mem.n && mem.allInf) });
    });
    // lamps (§7.6): ≥ 80 % of the step's scored pieces at 03 → 2, at 04 → 3; flash rounds use their source words;
    // steps without scored pieces (check-in, weekly, placement) take the lowest other window of the room (≥ 1)
    var lamps = new Map();
    function lampOf(stepKeys) {
      var n = 0, c3 = 0, c4 = 0;
      for (var i = 0; i < stepKeys.length; i++) {
        var ps = index.steps.get(stepKeys[i]).pieces;
        for (var j = 0; j < ps.length; j++) {
          var pc = index.piece.get(ps[j]);
          if (!pc.scored) continue;
          var st = partInfo.get(pc.id).stage;
          n++; if (st >= 3) c3++; if (st >= 4) c4++;
        }
      }
      return n ? (c4 >= 0.8 * n ? 3 : c3 >= 0.8 * n ? 2 : 1) : null;
    }
    index.days.forEach(function (di) {
      var pending = [];
      di.steps.forEach(function (sk) {
        if (!done.has(sk)) { lamps.set(sk, 0); return; }
        var si = index.steps.get(sk), lv = lampOf(si.type === 'flash' ? (si.src || NONE) : [sk]);
        if (lv == null) pending.push(sk); else lamps.set(sk, lv);
      });
      if (pending.length) {
        var lo = null;
        di.steps.forEach(function (sk) { if (pending.indexOf(sk) < 0) { var l = lamps.get(sk); lo = lo == null || l < lo ? l : lo; } });
        pending.forEach(function (sk) { lamps.set(sk, Math.max(1, lo == null ? 1 : lo)); });
      }
    });
    // rooms (80 % rule), then weeks from their rooms
    function finish(a) {
      var n = a.scored, stage = 1;
      for (var k = 4; k >= 2; k--) { var c = 0; for (var j = k; j <= 4; j++) c += a.counts[j]; if (n && c >= 0.8 * n) { stage = k; break; } }
      a.stage = stage;
      a.vis = a.visN ? a.vsum / a.visN : 1;
      a.sight = sight(a.vis);
      return a;
    }
    function blank() { return { counts: { 1: 0, 2: 0, 3: 0, 4: 0 }, repair: 0, seams: 0, inferred3: 0, done04: { verified: 0, self: 0 }, vsum: 0, visN: 0, scored: 0, items: new Map() }; }
    var dayAgg = new Map(), weekAgg = new Map();
    index.days.forEach(function (di, id) {
      var a = blank(), pids = [];
      di.steps.forEach(function (sk) {
        var si = index.steps.get(sk), stepDone = done.has(sk);
        for (var j = 0; j < si.pieces.length; j++) {
          var pid = si.pieces[j], pc = index.piece.get(pid);
          pids.push(pid);
          if (!pc.scored) continue;
          var inf = partInfo.get(pid);
          a.scored++;
          a.counts[inf.stage]++;
          if (inf.repair) a.repair++;
          if (inf.seam) a.seams++;
          if (inf.stage === 3 && inf.inferred) a.inferred3++;
          if (inf.stage === 4) { if (inf.src04 === 'F' || inf.src04 === 'S') a.done04.self++; else a.done04.verified++; }
          if (stepDone && !a.items.has(pc.item)) { var v = memo.get(pc.item).v; a.items.set(pc.item, v); if (v != null) { a.vsum += v; a.visN++; } }
        }
      });
      a.started = di.steps.some(function (sk) { return done.has(sk); });
      a.pieces = pids;
      dayAgg.set(id, finish(a));
    });
    index.weeks.forEach(function (wi) {
      var a = blank(), lit = 0, windows = 0, lv = { 1: 0, 2: 0, 3: 0 };
      wi.days.forEach(function (d) {
        var da = dayAgg.get(d);
        if (!da) return;
        a.scored += da.scored; a.repair += da.repair; a.seams += da.seams; a.inferred3 += da.inferred3;
        a.done04.verified += da.done04.verified; a.done04.self += da.done04.self;
        for (var k = 1; k <= 4; k++) a.counts[k] += da.counts[k];
        da.items.forEach(function (v, item) { if (!a.items.has(item)) { a.items.set(item, v); if (v != null) { a.vsum += v; a.visN++; } } });
        index.days.get(d).steps.forEach(function (sk) { windows++; var l = lamps.get(sk) || 0; if (l) { lit++; lv[l]++; } });
      });
      finish(a);
      a.lit = lit; a.windows = windows; a.lampLevels = lv;
      weekAgg.set(wi.id, a);
    });
    function view(key) { return { get: function (id) { var m = memo.get(id); return m ? m[key] : undefined; }, has: function (id) { return memo.has(id); } }; }
    return { v: VERSION, asOf: asOf, index: index, answers: ans, host: host, memo: memo, learned: view('L'), vis: view('v'),
      part: partInfo, stage: { get: function (pid) { var i = partInfo.get(pid); return i ? i.stage : undefined; } },
      lamps: lamps, day: dayAgg, week: weekAgg, hallDone: hallDone, done: done };
  }

  /** moon(week, host) → { frac, done, of }: this week's plan kept (§7.6). Never below a thin crescent. */
  function moon(week, host) {
    var cp = (host && host.profile && host.profile.cp) || {}, of = 0, done = 0;
    ((week && week.days) || []).forEach(function (d) {
      SESS.forEach(function (s) {
        var st = stepsOfSess(d, s);
        if (!st.length) return;
        of++;
        if (st.every(function (x) { return x && isYmd(cp[d.id + ':' + x.id]); })) done++;
      });
    });
    return { frac: of ? Math.max(0.08, done / of) : 0.08, done: done, of: of };
  }

  /** lamps(snapshot, day) → [{ sk, lit }] in the day's step order a1 → c3 (§7.6). */
  function lamps(snap, day) {
    var id = typeof day === 'string' ? day : day && day.id, di = snap.index.days.get(id);
    return di ? di.steps.map(function (sk) { return { sk: sk, lit: snap.lamps.get(sk) || 0 }; }) : [];
  }

  /* ───────────────────────────── answer checking (§7.13) ───────────────────────────── */
  function toks(s) { return String(s || '').split(/\s+/).filter(Boolean); }
  // the same as the page's normTok (app/index.html): no case, no accents (café = cafe), any apostrophe (’ ‘ ʼ) as ', no other
  // marks; an apostrophe at either end is a quotation mark (‘Thank you,’ she said.), not part of the word
  function normTok(t) { return String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[’‘ʼ]/g, "'").replace(/[^a-z0-9']/g, '').replace(/^'+|'+$/g, ''); }
  var NUM_1 = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');
  var NUM_10 = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];
  var NUM_ORD = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };
  function numWords(t) {
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
  // The words a written token stands for, as the page's dictScore compares them (app/index.html dictWords): a number written
  // as digits is the number's words (13 → thirteen, 9:30 → nine thirty, 21st → twenty first; twenty-five is two words) and a
  // British spelling is the American one (colour = color). The marks below then agree with the page's percentage.
  function dictWords(t) {
    return String(t).replace(/(\d)[:.](\d\d)(?!\d)/g, '$1 $2').replace(/\b(twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety)-(?=[a-z])/gi, '$1 ')
      .split(/\s+/).map(normTok).filter(Boolean).reduce(function (a, x) { return a.concat(/^\d+(st|nd|rd|th)?$/.test(x) ? numWords(x) : [usForm(x)]); }, []);
  }
  function lcsPairs(a, b) {
    var n = a.length, m = b.length, dp = [], i, j;
    for (i = 0; i <= n; i++) { dp.push(new Array(m + 1).fill(0)); }
    for (i = n - 1; i >= 0; i--) for (j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    var pairs = []; i = 0; j = 0;
    while (i < n && j < m) {
      if (a[i] === b[j]) { pairs.push([i, j]); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++;
    }
    return pairs;
  }
  var CONTR = {
    "i'm": 'i am', "don't": 'do not', "doesn't": 'does not', "didn't": 'did not', "it's": 'it is', "can't": 'can not', 'cannot': 'can not',
    "i've": 'i have', "you've": 'you have', "we've": 'we have', "they've": 'they have', "isn't": 'is not', "aren't": 'are not',
    "wasn't": 'was not', "weren't": 'were not', "won't": 'will not', "wouldn't": 'would not', "i'll": 'i will', "you'll": 'you will',
    "we'll": 'we will', "they'll": 'they will', "he'll": 'he will', "she'll": 'she will', "he's": 'he is', "she's": 'she is',
    "that's": 'that is', "there's": 'there is', "what's": 'what is', "they're": 'they are', "we're": 'we are', "you're": 'you are',
    "let's": 'let us', "i'd": 'i would', "haven't": 'have not', "hasn't": 'has not', "couldn't": 'could not', "shouldn't": 'should not'
  };
  // Word tokens with their original spelling (what she wrote, for the messages) and a comparison form (lower case, US spelling).
  function wordToks(s) {
    var out = [];
    toks(String(s || '').replace(/[’]/g, "'")).forEach(function (raw) {
      var clean = raw.replace(/^[^A-Za-z0-9']+|[^A-Za-z0-9']+$/g, '');
      if (!clean) return;
      var low = clean.toLowerCase();
      if (own.call(CONTR, low)) { CONTR[low].split(' ').forEach(function (p2, i) { out.push({ raw: i === 0 ? clean : p2, key: usForm(p2) }); }); return; }
      out.push({ raw: clean, key: usForm(low) });
    });
    return out;
  }
  function editDist(a, b) {
    a = String(a); b = String(b);
    var n = a.length, m = b.length, prev = [], cur, i, j;
    for (j = 0; j <= m; j++) prev.push(j);
    for (i = 1; i <= n; i++) {
      cur = [i];
      for (j = 1; j <= m; j++) cur.push(Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a.charAt(i - 1) === b.charAt(j - 1) ? 0 : 1)));
      prev = cur;
    }
    return prev[m];
  }
  function isCal(w) { return own.call(CAL, String(w).toLowerCase()); }

  // Letter case never matters in what she types (2026-09-30, her words: 「考试可以不用要求我大写 因为切换大小写不想切来切去」;
  // IELTS accepts answers in upper or lower case). Until that day a weekday or month word needed its capital: a sentence she
  // wrote before it is still derived by that rule (compareWrite's third argument), so a past result stays what it was.
  var CASE_FREE = '2026-09-30';
  /** compareWrite(answer, ref, before?) → { ok, coverage, extra, issues }; before: written before CASE_FREE (the old capitals rule) */
  function compareWrite(answer, ref, before) {
    var A = wordToks(answer), R = wordToks(ref);
    var pairs = lcsPairs(R.map(function (t) { return t.key; }), A.map(function (t) { return t.key; }));
    var matchedR = {}, matchedA = {};
    pairs.forEach(function (p) { matchedR[p[0]] = p[1]; matchedA[p[1]] = p[0]; });
    var coverage = R.length ? pairs.length / R.length : (A.length ? 0 : 1);
    var extra = A.length - pairs.length;
    var capsOk = true, issues = [];
    if (before) {
      R.forEach(function (t, i) {
        var a = matchedR[i] != null && isCal(t.key) ? A[matchedR[i]].raw : '';
        if (a && a.charAt(0) !== a.charAt(0).toUpperCase()) capsOk = false;
      });
    }
    var contentOk = coverage >= 0.8 && extra <= 2;
    if (!A.length) issues.push('empty');
    else {
      if (coverage < 1) {
        var spell = [];
        R.forEach(function (t, i) {
          if (matchedR[i] != null) return;
          var best = null;
          if (t.key.length < 4) return;
          // a misspelt attempt: same first letter, most of the letters in order, about the same length
          A.forEach(function (a, j) {
            if (matchedA[j] != null || a.key.charAt(0) !== t.key.charAt(0) || Math.abs(a.key.length - t.key.length) > 3) return;
            var sim = lcsPairs(a.key.split(''), t.key.split('')).length / t.key.length;
            if (sim >= 0.6 && (!best || sim > best.sim)) best = { sim: sim, raw: a.raw };
          });
          if (best) spell.push(best.raw);
        });
        if (spell.length) issues.push('spelling:' + spell.join(','));
        if (spell.length < R.length - pairs.length) issues.push('missing');
      }
      if (extra > 2) issues.push('extra');
    }
    return { ok: contentOk && capsOk, coverage: Math.round(coverage * 1000) / 1000, extra: extra, issues: issues };
  }

  /** spellCheck(typed, target) → { ok, lettersOk, ops } (ops: '=' same, '+' typed extra, '-' missing); case never matters, ok = lettersOk */
  function spellCheck(typed, target) {
    var t = String(typed || '').trim().replace(/\s+/g, ' '), g = String(target || '').trim().replace(/\s+/g, ' ');
    var tl = t.toLowerCase(), gl = g.toLowerCase();
    var lettersOk = tl === gl || (tl.split(' ').map(usForm).join(' ') === gl.split(' ').map(usForm).join(' ') && tl.length > 0);
    // letter diff against the target (case-insensitive), shown in the target's letters
    var a = gl.split(''), b = tl.split(''), pairs = lcsPairs(a, b), ops = [], i = 0, j = 0;
    pairs.concat([[a.length, b.length]]).forEach(function (p) {
      while (i < p[0] && j < p[1]) { ops.push(['-', g.charAt(i)]); ops.push(['+', t.charAt(j)]); i++; j++; }
      while (i < p[0]) { ops.push(['-', g.charAt(i)]); i++; }
      while (j < p[1]) { ops.push(['+', t.charAt(j)]); j++; }
      if (p[0] < a.length) { ops.push(['=', g.charAt(p[0])]); i = p[0] + 1; j = p[1] + 1; }
    });
    return { ok: lettersOk, lettersOk: lettersOk, ops: ops };
  }

  var WEAK = { a: 1, an: 1, the: 1, to: 1, of: 1, and: 1, for: 1, at: 1, in: 1, on: 1, is: 1, are: 1, was: 1, can: 1, from: 1, have: 1, has: 1 };
  /** dictCauses(ref, hyp, scoreFn) → { pct, toks: [{ t, ok, cause? }] }; cause: 'sp' | 'fw' | 'end' | 'mis' */
  function dictCauses(ref, hyp, scoreFn) {
    // compared word by word (dictWords: digits as words, British = American); a reference token is right when all its words are
    var refT = toks(ref), at = [], refW = [];
    refT.forEach(function (t, j) { dictWords(t).forEach(function (w) { at.push(j); refW.push(w); }); });
    var hypN = toks(hyp).reduce(function (a, x) { return a.concat(dictWords(x)); }, []);
    var pairs = lcsPairs(refW, hypN);
    var wAt = {}, hypUsed = {};
    pairs.forEach(function (p) { wAt[p[0]] = p[1]; hypUsed[p[1]] = 1; });
    var tokOk = refT.map(function () { return null; }), firstMiss = {};
    at.forEach(function (j, k) {
      var hit = wAt[k] != null;
      tokOk[j] = tokOk[j] !== false && hit;
      if (!hit && firstMiss[j] == null) firstMiss[j] = k;
    });
    var marked = tokOk.filter(function (x) { return x != null; });
    var good = marked.filter(Boolean).length, n = marked.length;
    var pct = Math.round(good / Math.max(1, n) * 100);
    if (typeof scoreFn === 'function') { try { var sc = scoreFn(ref, hyp); if (sc && typeof sc.pct === 'number') pct = sc.pct; } catch (e) { /* keep ours */ } }
    var out = refT.map(function (t, j) {
      if (tokOk[j] == null) return { t: t, ok: null };
      if (tokOk[j]) return { t: t, ok: true };
      // the gap the token's first missed word sits in: hyp words between the matched neighbours
      var kk = firstMiss[j], lo = -1, hi = hypN.length;
      for (var a = kk - 1; a >= 0; a--) if (wAt[a] != null) { lo = wAt[a]; break; }
      for (var b = kk + 1; b < refW.length; b++) if (wAt[b] != null) { hi = wAt[b]; break; }
      var r = refW[kk], best = null;
      for (var k = lo + 1; k < hi; k++) {
        if (hypUsed[k]) continue;
        var d = editDist(hypN[k], r);
        if (!best || d < best.d) best = { d: d, h: hypN[k] };
      }
      var cause = 'mis';
      if (best && [best.h + 's', best.h + 'es', best.h + 'ed', best.h + 'd'].indexOf(r) >= 0) cause = 'end';
      else if (own.call(WEAK, r)) cause = 'fw';
      else if (best && best.d <= Math.max(1, r.length / 4)) cause = 'sp';
      return { t: t, ok: false, cause: cause, heard: best ? best.h : '' };
    });
    return { pct: pct, good: good, n: n, toks: out };
  }

  /* ───────────────────────────── merging (§7.1) ───────────────────────────── */
  function clone(o) { return o == null ? o : JSON.parse(JSON.stringify(o)); }
  function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
  // Key-wise union; on a clash of two leaves the local one stays (world uses deterministic minimums instead, so every
  // device converges on the same map).
  function unionInto(mine, theirs, path, rule) {
    var changed = false;
    keys(theirs).forEach(function (k) {
      var a = mine[k], b = theirs[k];
      if (a === undefined) { mine[k] = clone(b); changed = true; return; }
      if (isObj(a) && isObj(b)) { if (unionInto(a, b, path.concat(k), rule)) changed = true; return; }
      if (same(a, b)) return;
      var r = rule ? rule(path.concat(k), a, b) : a;
      if (!same(r, a)) { mine[k] = clone(r); changed = true; }
    });
    return changed;
  }
  function worldRule(path, a, b) {
    var top = path[0];
    if (top === 'v') return Math.max(Number(a) || 0, Number(b) || 0);
    if (top === 'intro' && isYmd(a) && isYmd(b)) return a < b ? a : b;
    if (top === 'seals' && path.length === 2 && isYmd(a) && isYmd(b)) return a < b ? a : b;
    if (top === 'slots' && path.length === 2 && typeof a === 'number' && typeof b === 'number') return Math.min(a, b);
    return a;
  }
  function vRule(path, a, b) { return path.length === 1 && path[0] === 'v' ? Math.max(Number(a) || 0, Number(b) || 0) : a; }
  /** mergeDoc(id, mine, theirs) → merged doc, or null when mine already holds everything. */
  function mergeDoc(id, mine, theirs) {
    if (!isObj(theirs)) return null;
    if (!isObj(mine)) return clone(theirs);
    var out = clone(mine);
    var changed = unionInto(out, theirs, [], String(id) === 'world' ? worldRule : vRule);
    return changed ? out : null;
  }

  return {
    VERSION: VERSION,
    cyrb53: cyrb53, h6: h6,
    COMP_OF: COMP_OF, KIND_OF: KIND_OF, CLS_OF: CLS_OF, CODE_OF: CODE_OF,
    buildIndex: buildIndex, roomSlots: roomSlots, topicOf: topicOf, zhSense: zhSense,
    gloss: gloss,
    deriveLegacy: deriveLegacy, legacyCached: deriveLegacyCached, legacyFilter: legacyFilter, validLeaf: validLeaf, MODES: MODES, freeze: freeze, inferOnStepDone: inferOnStepDone, answers: answers, keyDate: keyDate,
    memory: memory, nextDue: nextDue, hAfterOk: hAfterOk, itemStage: itemStage, snapshot: snapshot,
    moon: moon, lamps: lamps, sight: sight, VIS_MISS: VIS_MISS,
    compareWrite: compareWrite, spellCheck: spellCheck, dictCauses: dictCauses, usForm: usForm, isCal: isCal,
    mergeDoc: mergeDoc,
    util: { isYmd: isYmd, addDays: addDays, diffDays: diffDays, weekday: weekday, mondayOf: mondayOf, evDocId: evDocId, minYmd: minYmd, maxYmd: maxYmd, clone: clone, isObj: isObj, lcsPairs: lcsPairs, editDist: editDist, toks: toks, normTok: normTok }
  };
});
