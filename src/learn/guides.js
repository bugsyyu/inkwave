// src/learn/guides.js — 学习方法 · 资源 (游戏为主体 第三期第三步, docs/LEARN.md §45): the lesson page's two reading pages,
// read and written from the game's own page in the 课本 (src/ui/book-pages/guides.js). The tables are the lesson page's own,
// exported by tools/learn/export-ielts.mjs into content/guides.json (GUIDE_TABS, GUIDES, GRAMMAR, PROMPTS, REASONS,
// RESOURCES, the three score tables, the pages' leads); the sentence {{PLAN}} needs is the host's phasePlan / dailyHours,
// copied verbatim into vendor/ielts/host.js. The lesson page's rules, copied (app/index.html):
//   fillGuide(g)   guideHTML(g): GUIDES[g] with {{CONVERT}} {{PLAN}} {{TARGET}} {{GRAMMAR}} {{REASONS:k}} {{PROMPT:k}} filled —
//                  the same string, so the same text; the page then draws its parts in the game's look
//   the profile    normalizeProfile's rules for what the guides read (blocks, eveningOn, startDate, examDate, target)
//   语法清单        refreshGuides (已学完 n / GRAMMAR.length, item i on when profile.grammar[i]); toggleFlag('grammar', i):
//                  on = profile.grammar[i] = true, off = that key goes
// Writing follows LEARN §39 / §41: her latest blob first (readBlob fresh), only profile.grammar changes — every other field
// and document is the same value, so the same JSON text — nothing is created without her blob, the same state twice writes
// once, and after a write the cache goes (invalidate) and her App's mirror follows (mirror). Pure but for the storage and
// the file read, so Node tests and the export tool run it; nothing here reads app/my-progress.*.
import { DATA_KEY, readBlob, invalidate, mirror } from './workbench.js';

const isObj = (o) => !!o && typeof o === 'object' && !Array.isArray(o);
const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
const HM_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

/* ───────────────────────────── the tables ───────────────────────────── */
let tables = null, tablesP = null, reader = null;
// setGuideReader((relPath) => Promise<string>): tests hand in their own; default fetch in the page, fs under Node
export function setGuideReader(fn) { reader = typeof fn === 'function' ? fn : null; tables = null; tablesP = null; }
async function readText(rel) {
  if (reader) return reader(rel);
  const url = new URL('../../content/' + rel, import.meta.url);
  if (typeof process !== 'undefined' && process.versions && process.versions.node && url.protocol === 'file:') {
    const fs = await import('node:fs/promises');
    return fs.readFile(url, 'utf8');
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error('content/' + rel + ': HTTP ' + r.status);
  return r.text();
}
// loadGuides() → content/guides.json, once
export function loadGuides() {
  if (tables) return Promise.resolve(tables);
  if (!tablesP) tablesP = readText('guides.json').then((t) => (tables = JSON.parse(t)), (e) => { tablesP = null; throw e; });
  return tablesP;
}
export function guidesNow() { return tables; }

/* ───────────────────────────── her profile, as the guides read it ───────────────────────────── */
// guideProfile(raw, today, def) — normalizeProfile's rules for the fields the guides read (def: the page's DEFAULT_PROFILE
// blocks / target, in guides.json): blocks that are not "H:MM"–"H:MM" with the end after the start fall back to the
// default; target in 4–9 by 0.5 (6.5 when unset); a start date that is not a date is today (her wall clock); an exam date
// that is not one is none; the evening block is on unless it is false; grammar an object
export function guideProfile(raw, today, def) {
  const p = isObj(raw) ? raw : {};
  const D = def && isObj(def.blocks) ? def : { blocks: { a: ['09:30', '11:30'], b: ['14:00', '16:00'], c: ['17:30', '19:30'] }, target: 6.5 };
  const toMin = (hm) => { const x = String(hm || '0:0').split(':').map(Number); return (x[0] || 0) * 60 + (x[1] || 0); };
  const hm = (v) => typeof v === 'string' && HM_RE.test(v);
  const src = isObj(p.blocks) ? p.blocks : D.blocks, blocks = {};
  ['a', 'b', 'c'].forEach((k) => { const b = src[k]; blocks[k] = Array.isArray(b) && b.length === 2 && hm(b[0]) && hm(b[1]) && toMin(b[1]) > toMin(b[0]) ? b : D.blocks[k]; });
  return {
    blocks,
    eveningOn: p.eveningOn !== false,
    startDate: YMD_RE.test(p.startDate || '') ? p.startDate : today,
    examDate: YMD_RE.test(p.examDate || '') ? p.examDate : '',
    target: Math.min(9, Math.max(4, Math.round((Number(p.target === undefined ? D.target : p.target) || 6.5) * 2) / 2)),
    grammar: isObj(p.grammar) ? p.grammar : {},
  };
}

/* ───────────────────────────── guideHTML ───────────────────────────── */
// convertTableHTML(): 分数 · 听力 · 学术类阅读 · 培训类阅读, 9.0 down to 4.0 (the raw-score range of each band)
export function convertTable(T) {
  const range = (table, band) => {
    const i = table.findIndex((r) => r[1] === band);
    if (i < 0) return '—';
    const lo = table[i][0], hi = i === 0 ? 40 : table[i - 1][0] - 1;
    return lo === hi ? String(lo) : lo + '–' + hi;
  };
  const bands = [9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5, 5, 4.5, 4];
  return '<div class="table-wrap"><table class="num"><thead><tr><th>分数</th><th>听力</th><th>学术类阅读</th><th>培训类阅读</th></tr></thead><tbody>'
    + bands.map((b) => '<tr><td>' + b.toFixed(1) + '</td><td>' + range(T.tables.L, b) + '</td><td>' + range(T.tables.RA, b) + '</td><td>' + range(T.tables.RG, b) + '</td></tr>').join('')
    + '</tbody></table></div>';
}
// the sentence {{PLAN}} becomes: her hours a day, the route's weeks, and whether the time to the exam is enough
export function planLine(p, Host) {
  const plan = Host.phasePlan(p);
  const weeks = plan.reduce((s, x) => s + x.weeks, 0);
  // whether the time is enough comes from the same comparison as the roadmap (route end vs exam date)
  const gap = p.examDate ? Host.diffDays(plan[plan.length - 1].end, Host.parseYmd(p.examDate)) : null;
  const verdict = gap == null ? '定好考试日期后，「路线图」会告诉你时间够不够。'
    : gap < 0 ? '按现在的安排，考前走不完路线（差约 ' + Math.ceil(-gap / 7) + ' 周），请看「路线图」里的建议。'
      : '按路线图的安排，考前时间是够的。';
  return '按你现在的时段，每天约 ' + Host.fmtH(Host.dailyHours(p) * 60) + ' 小时，路线图排了约 ' + weeks + ' 周。' + verdict;
}
// fillGuide(g, p, T, Host) — guideHTML(g) for the profile p (guideProfile's), the tables T (guides.json), the host's
// functions (vendor/ielts/host.js): the same chain of replacements, so the same string
export function fillGuide(g, p, T, Host) {
  const esc = Host.esc;
  return (T.guides[g] || '')
    .replace('{{CONVERT}}', convertTable(T))
    .replace('{{PLAN}}', planLine(p, Host))
    .replace('{{TARGET}}', Number(p.target).toFixed(1))
    .replace('{{GRAMMAR}}', '<p class="muted small">已学完 <span id="grammar-count"></span></p><ul class="checklist grammar" id="grammar-list"></ul>')
    .replace(/\{\{REASONS:(\w+)\}\}/g, (_, k) => '<div class="chips">' + (T.reasons[k] || []).map((r) => '<span class="chip">' + esc(r) + '</span>').join('') + '</div>')
    .replace(/\{\{PROMPT:(\w+)\}\}/g, (_, k) => '<div class="prompt"><textarea readonly id="pr-' + k + '" aria-label="可复制的指令">' + esc(T.prompts[k] || '') + '</textarea><button class="btn ghost sm" data-act="copy" data-id="pr-' + k + '">复制这段指令</button></div>');
}

/* ───────────────────────────── 语法清单 ───────────────────────────── */
// grammarView(grammar, T) → { items: [{ i, title, desc, on }], done, total }   (refreshGuides)
export function grammarView(grammar, T) {
  const g = isObj(grammar) ? grammar : {};
  const items = T.grammar.map((x, i) => ({ i, title: x[0], desc: x[1], on: !!g[i] }));
  return { items, done: items.filter((x) => x.on).length, total: items.length };
}
// the count's text, as the page writes it
export const doneText = (v) => v.done + ' / ' + v.total;

// setGrammar(ls, i, on, total) → { ok: true, changed, on } | { ok: false, reason: 'bad' | 'no-workbench' | 'save' }
//   on: profile.grammar[i] = true; off: that key goes (toggleFlag). The state she already has: nothing is written.
export function setGrammar(ls, i, on, total) {
  if (!Number.isInteger(i) || i < 0 || !(i < total)) return { ok: false, reason: 'bad' };
  const b = readBlob(ls, { fresh: true });
  if (!b) return { ok: false, reason: 'no-workbench' };
  const prof = b.o.profile, g = isObj(prof.grammar) ? prof.grammar : {}, key = String(i);
  if (!!g[key] === !!on) return { ok: true, changed: false, on: !!g[key] };
  const next = Object.assign({}, g);
  if (on) next[key] = true; else delete next[key];
  const o = Object.assign({}, b.o, { profile: Object.assign({}, prof, { grammar: next }) });
  try { ls.setItem(DATA_KEY, JSON.stringify(o)); } catch (e) { return { ok: false, reason: 'save' }; }
  invalidate();
  mirror(ls);
  return { ok: true, changed: true, on: !!on };
}
// toggleGrammar(ls, i, total) — a tap: the opposite of what is stored now (read fresh), so every tap switches it and what
// shows is what is stored
export function toggleGrammar(ls, i, total) {
  const b = readBlob(ls, { fresh: true });
  if (!b) return { ok: false, reason: 'no-workbench' };
  const g = isObj(b.o.profile.grammar) ? b.o.profile.grammar : {};
  return setGrammar(ls, i, !g[String(i)], total);
}
