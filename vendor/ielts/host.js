/* INKWAVE · vendor/ielts/host.js — page functions of the lesson, copied VERBATIM out of IELTS-Base app/index.html (the
 * page's main script) by tools/learn/export-ielts.mjs. SOURCE.json has the commit and each function's line range; this
 * file is never edited by hand — re-run the export.
 * Why a copy: they are page functions, not a module, and the game must do these exactly as the lesson does — dictScore
 * scores a sentence (docs/DESIGN.md §7.13: percent and per-word marks are the host's, British = American, case never
 * matters); speechChunks cuts a text into the pieces app/audio/index.json has recordings of and CLIP_SILENT is the clip
 * that unlocks <audio> on her first tap (src/learn/audio.js); tzPlaceOf / tzParts read her wall clock (设置 → 时区) so a
 * game answer is dated on the same day as one in the lesson (src/learn/workbench.js).
 * UMD like the other files here: Node → module.exports; browser → BaseEngine.Host. `window` inside fdUs is the UMD root
 * (globalThis in Node), where model.js registers BaseEngine.Model. Source commit: e88109619158d752e6f9d176c780a3da82019cd1. */
(function (root, factory) {
  'use strict';
  var api = factory(root);
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  if (root) { var BE = root.BaseEngine = root.BaseEngine || {}; if (!BE.Host) BE.Host = api; }
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (root) {
  'use strict';
  var window = root;
  // ── app/index.html L2420 ──
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ── app/index.html L7245–7255 ──
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

  // ── app/index.html L7768 ──
  function toks(s) { return String(s).split(/\s+/).filter(Boolean); }

  // ── app/index.html L7769–7771 ──
  // a word as written, compared: no case, no accents (café = cafe), any apostrophe (’ ‘ ʼ) as ', no other marks; an apostrophe at
  // either end is a quotation mark (‘Thank you,’ she said.), not part of the word
  function normTok(t) { return String(t).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[’‘ʼ]/g, "'").replace(/[^a-z0-9']/g, '').replace(/^'+|'+$/g, ''); }

  // ── app/index.html L7772–7782 ──
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

  // ── app/index.html L8459–8460 ──
  // Speech recognisers write numbers as digits ("3", "50", "6:30", "21st"): turn them into words before comparing.
  const NUM_1 = 'zero one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen nineteen'.split(' ');

  // ── app/index.html L8461 ──
  const NUM_10 = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

  // ── app/index.html L8462 ──
  const NUM_ORD = { one: 'first', two: 'second', three: 'third', five: 'fifth', eight: 'eighth', nine: 'ninth', twelve: 'twelfth' };

  // ── app/index.html L8463–8473 ──
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

  // ── app/index.html L7783–7792 ──
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

  // ── app/index.html L7793–7801 ──
  function tokMarks(ref, hyp) {
    const refT = toks(ref), at = [], refW = [];
    refT.forEach((t, j) => dictWords(t).forEach((w) => { at.push(j); refW.push(w); }));
    const okW = lcsOk(refW, toks(hyp).reduce((a, t) => a.concat(dictWords(t)), [])), ok = refT.map(() => null);
    at.forEach((j, k) => { ok[j] = ok[j] !== false && okW[k]; }); // a token is right when all its words are
    const marked = ok.filter((x) => x != null);
    const html = refT.map((t, j) => '<span class="tok' + (ok[j] == null ? '' : ok[j] ? ' ok' : ' miss') + '">' + esc(t) + '</span>').join(' ');
    return { n: marked.length, good: marked.filter(Boolean).length, html };
  }

  // ── app/index.html L7802–7806 ──
  // One typed sentence against the reference: words right, percent, and the marked-up reference.
  function dictScore(ref, hyp) {
    const m = tokMarks(ref, hyp);
    return { pct: Math.round(m.good / Math.max(1, m.n) * 100), good: m.good, n: m.n, html: m.html };
  }

  // ── app/index.html L5393–5427 ──
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

  // ── app/index.html L5551 ──
  const CLIP_SILENT = 'data:audio/mpeg;base64,//M0xAAAAANIAAAAAExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVV//M0xDsAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVMQU1FMy4xMDBVVVVVVVVVVVVV//M0xHYAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//M0xLEAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//M0xMQAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV//M0xMQAAANIAAAAAFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV';

  // ── app/index.html L2433–2462 ──
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

  // ── app/index.html L2463 ──
  const TZ_DEFAULT = 'sin', TZ_FMT = {};

  // ── app/index.html L2464–2467 ──
  function tzFmt(zone) {
    if (TZ_FMT[zone] === undefined) { try { TZ_FMT[zone] = new Intl.DateTimeFormat('en-US', { timeZone: zone, hourCycle: 'h23', year: 'numeric', month: 'numeric', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric' }); } catch (e) { TZ_FMT[zone] = null; } }
    return TZ_FMT[zone];
  }

  // ── app/index.html L2468 ──
  function tzDevice() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; } }

  // ── app/index.html L2469–2477 ──
  // the wall-clock parts of an instant in a zone (null: this device's): { y, m: 1–12, d, h: 0–23, mi, s, ms, dow: 0 = Sunday }
  function tzParts(d, zone) {
    const f = zone ? tzFmt(zone) : null, o = { y: d.getFullYear(), m: d.getMonth() + 1, d: d.getDate(), h: d.getHours(), mi: d.getMinutes(), s: d.getSeconds(), ms: d.getMilliseconds() };
    if (f) {
      try { f.formatToParts(d).forEach((p) => { const v = +p.value; if (p.type === 'year') o.y = v; else if (p.type === 'month') o.m = v; else if (p.type === 'day') o.d = v; else if (p.type === 'hour') o.h = v % 24; else if (p.type === 'minute') o.mi = v; else if (p.type === 'second') o.s = v; }); } catch (e) { /* the device's reading stands */ }
    }
    o.dow = new Date(Date.UTC(o.y, o.m - 1, o.d)).getUTCDay();
    return o;
  }

  // ── app/index.html L2493–2502 ──
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

  return { esc: esc, fdUs: fdUs, toks: toks, normTok: normTok, lcsOk: lcsOk, NUM_1: NUM_1, NUM_10: NUM_10, NUM_ORD: NUM_ORD, numWords: numWords, dictWords: dictWords, tokMarks: tokMarks, dictScore: dictScore, speechChunks: speechChunks, CLIP_SILENT: CLIP_SILENT, TZ_PLACES: TZ_PLACES, TZ_DEFAULT: TZ_DEFAULT, tzFmt: tzFmt, tzDevice: tzDevice, tzParts: tzParts, tzPlaceOf: tzPlaceOf };
});
