/* INKWAVE · vendor/ielts/host.js — the lesson's dictation score and the functions it calls, copied VERBATIM out of
 * IELTS-Base app/index.html (the page's main script) by tools/learn/export-ielts.mjs. SOURCE.json has the commit and
 * each function's line range; this file is never edited by hand — re-run the export.
 * Why a copy: dictScore is a page function, not a module, and the game must score a sentence exactly as the lesson and
 * the exam do (docs/DESIGN.md §7.13: percent and per-word marks are the host's, British = American, case never matters).
 * UMD like the other files here: Node → module.exports; browser → BaseEngine.Host. `window` inside fdUs is the UMD root
 * (globalThis in Node), where model.js registers BaseEngine.Model. Source commit: adf43697466f533994f4a29dfbd94031a5278bf0. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) { var BE = root.BaseEngine = root.BaseEngine || {}; if (!BE.Host) BE.Host = api; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (root) {
  'use strict';
  var window = root;
  // ── app/index.html L2419 ──
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ── app/index.html L7234–7244 ──
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

  // ── app/index.html L7757 ──
  function toks(s) { return String(s).split(/\s+/).filter(Boolean); }

  // ── app/index.html L7758–7760 ──
  // a word as written, compared: no case, no accents (café = cafe), any apostrophe (’ ‘ ʼ) as ', no other marks; an apostrophe at
  // either end is a quotation mark (‘Thank you,’ she said.), not part of the word
  function normTok(t) { return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘ʼ]/g, "'").replace(/[^a-z0-9']/g, '').replace(/^'+|'+$/g, ''); }

  // ── app/index.html L7761–7771 ──
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

  // ── app/index.html L8448–8449 ──
  // Speech recognisers write numbers as digits ("3", "50", "6:30", "21st"): turn them into words before comparing.
  const NUM_1 = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');

  // ── app/index.html L8450 ──
  const NUM_10 = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  // ── app/index.html L8451 ──
  const NUM_ORD = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };

  // ── app/index.html L8452–8462 ──
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

  // ── app/index.html L7772–7781 ──
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

  // ── app/index.html L7782–7790 ──
  function tokMarks(ref, hyp) {
    const refT = toks(ref), at = [], refW = [];
    refT.forEach((t, j) => dictWords(t).forEach((w) => { at.push(j); refW.push(w); }));
    const okW = lcsOk(refW, toks(hyp).reduce((a, t) => a.concat(dictWords(t)), [])), ok = refT.map(() => null);
    at.forEach((j, k) => { ok[j] = ok[j] !== false && okW[k]; }); // a token is right when all its words are
    const marked = ok.filter((x) => x != null);
    const html = refT.map((t, j) => '<span class="tok' + (ok[j] == null ? '' : ok[j] ? ' ok' : ' miss') + '">' + esc(t) + '</span>').join(' ');
    return { n: marked.length, good: marked.filter(Boolean).length, html };
  }

  // ── app/index.html L7791–7795 ──
  // One typed sentence against the reference: words right, percent, and the marked-up reference.
  function dictScore(ref, hyp) {
    const m = tokMarks(ref, hyp);
    return { pct: Math.round(m.good / Math.max(1, m.n) * 100), good: m.good, n: m.n, html: m.html };
  }

  return { esc: esc, fdUs: fdUs, toks: toks, normTok: normTok, lcsOk: lcsOk, NUM_1: NUM_1, NUM_10: NUM_10, NUM_ORD: NUM_ORD, numWords: numWords, dictWords: dictWords, tokMarks: tokMarks, dictScore: dictScore };
});
