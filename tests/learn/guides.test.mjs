// 学习方法 · 资源 (游戏为主体 第三期第三步, docs/LEARN.md §45): the 课本's reading page made the game's own. The text is the
// lesson page's (content/guides.json, exported from the live host by tools/learn/export-ielts.mjs, which also checks 64 pages
// of the game's fill against the live guideHTML); the filling is guideHTML's (src/learn/guides.js fillGuide: the same
// string); the 语法清单 writes what toggleFlag('grammar', i) writes — profile.grammar[i] = true on, the key gone off — and
// nothing else, nothing without her blob, the same state twice once, the mirror follows. BEFORE / CONTRACT / recipe() at
// the top are the same literals as IELTS-Base tests/base/game-guides.test.mjs, where the live page fills the same
// sentences, writes the same text itself and reads the game's back.
// A made-up learner — nothing here reads app/my-progress.*.
// 用法：node --test tests/learn/guides.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import crypto from 'node:crypto';
import { ielts } from '../../src/learn/ielts.js';
import { NATIVE_PAGES, nativeOf, bookTab } from '../../src/learn/book.js';
import { DATA_KEY, PREF_KEY, mirrorFlush, _reset } from '../../src/learn/workbench.js';
import { loadGuides, guideProfile, fillGuide, planLine, convertTable, grammarView, doneText, setGrammar, toggleGrammar } from '../../src/learn/guides.js';

process.env.TZ = 'Asia/Singapore';   // (her clock: the route's dates are calendar days either way)

// ---- the contract (IELTS-Base tests/base/game-guides.test.mjs has the same literals) ----
// the lesson page's own shape (localBlob(): the normalized profile, then the ten collections); two grammar points done
export const BEFORE = {
  profile: { v: 1, setup: true, examType: 'A', target: 7, examDate: '', startDate: '2026-10-13', phase: 0,
    blocks: { a: ['09:30', '11:30'], b: ['14:00', '16:00'], c: ['17:30', '19:30'] }, eveningOn: true, todos: {}, grammar: { 0: true, 5: true },
    cp: { 'w1d1:a1': '2026-10-13' }, cq: {}, ws: {}, ww: {}, ci: {}, wr: {}, pm: {}, dt: {}, pg: {}, wrd: {}, accent: 'us' },
  days: { '2026-10': { days: { 13: { done: { 'c:w1d1:a1': { m: 35, k: 'pron' } }, extra: [] } } } },
  logs: { '2026-10': { entries: [{ id: 'mgw1k2abc3d4', d: '2026-10-18', k: 'listening', m: 25, n: '听了一集播客' }] } },
  mistakes: {},
  notes: { mgw2cc33dd44: { id: 'mgw2cc33dd44', d: '2026-10-19', t: 'word', en: 'commute', zh: '通勤', ex: 'I commute to work by bus.' } },
  mocks: {}, packs: {}, essays: {}, teacher: {}, reviews: {},
  base: { 'ev-2026-10-13': { v: 2, it: { 'w:monday': { '2026-10-13': { '091500': [1, 'L'] } } } } },
};
// what she does in the game at 21:30 in Singapore on 10-20: ticks 4.「常用的 7 种时态」(i 3), then unticks 1.(i 0); and the
// sentence {{PLAN}} / {{TARGET}} become for four made-up profiles (the second … fourth: normalizeProfile mends them)
export const CONTRACT = {
  now: '2026-10-20T21:30:00+08:00', today: '2026-10-20', total: 16,
  tick: { i: 3, grammar: { 0: true, 3: true, 5: true }, count: '3 / 16' },
  untick: { i: 0, grammar: { 3: true, 5: true }, count: '2 / 16' },
  before: { count: '2 / 16', on: [0, 5] },
  profiles: [
    { raw: { startDate: '2026-10-13', target: 7, examDate: '', blocks: { a: ['09:30', '11:30'], b: ['14:00', '16:00'], c: ['17:30', '19:30'] }, eveningOn: true },
      plan: '按你现在的时段，每天约 5 小时，路线图排了约 17 周。定好考试日期后，「路线图」会告诉你时间够不够。', target: '7.0' },
    { raw: { startDate: '2026-09-01', target: '6', examDate: '2027-06-30', blocks: { a: ['08:00', '12:00'], b: ['13:30', '17:30'], c: ['19:00', '21:00'] }, eveningOn: false },
      plan: '按你现在的时段，每天约 8 小时，路线图排了约 14 周。按路线图的安排，考前时间是够的。', target: '6.0' },
    { raw: { startDate: '2026-10-01', target: 9.7, examDate: '2026-12-01', blocks: { a: ['09:30', '11:30'], b: ['9:5', '16:00'], c: ['19:30', '17:30'] } },
      plan: '按你现在的时段，每天约 5 小时，路线图排了约 17 周。按现在的安排，考前走不完路线（差约 9 周），请看「路线图」里的建议。', target: '9.0' },
    { raw: { examDate: '2027-01-15' },
      plan: '按你现在的时段，每天约 5 小时，路线图排了约 17 周。按现在的安排，考前走不完路线（差约 5 周），请看「路线图」里的建议。', target: '6.5' },
  ],
  tabs: ['overview', 'vocab', 'grammar', 'pron', 'listening', 'reading', 'writing', 'speaking'],
};
// guideHTML(g) written out once more: GUIDES[g] with the placeholders filled from the tables, the sentence and the target
export function recipe(t, g, plan, target) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const band = (table, b) => { const i = table.findIndex((r) => r[1] === b); if (i < 0) return '—'; const lo = table[i][0], hi = i ? table[i - 1][0] - 1 : 40; return lo === hi ? String(lo) : lo + '–' + hi; };
  const conv = '<div class="table-wrap"><table class="num"><thead><tr><th>分数</th><th>听力</th><th>学术类阅读</th><th>培训类阅读</th></tr></thead><tbody>'
    + [9, 8.5, 8, 7.5, 7, 6.5, 6, 5.5, 5, 4.5, 4].map((b) => '<tr><td>' + b.toFixed(1) + '</td><td>' + band(t.L, b) + '</td><td>' + band(t.RA, b) + '</td><td>' + band(t.RG, b) + '</td></tr>').join('') + '</tbody></table></div>';
  return t.guides[g].split('{{CONVERT}}').join(conv).split('{{PLAN}}').join(plan).split('{{TARGET}}').join(target)
    .split('{{GRAMMAR}}').join('<p class="muted small">已学完 <span id="grammar-count"></span></p><ul class="checklist grammar" id="grammar-list"></ul>')
    .replace(/\{\{REASONS:(\w+)\}\}/g, (_, k) => '<div class="chips">' + (t.reasons[k] || []).map((r) => '<span class="chip">' + esc(r) + '</span>').join('') + '</div>')
    .replace(/\{\{PROMPT:(\w+)\}\}/g, (_, k) => '<div class="prompt"><textarea readonly id="pr-' + k + '" aria-label="可复制的指令">' + esc(t.prompts[k] || '') + '</textarea><button class="btn ghost sm" data-act="copy" data-id="pr-' + k + '">复制这段指令</button></div>');
}

const clone = (o) => JSON.parse(JSON.stringify(o));
function memory(init) {
  const m = new Map(Object.entries(init || {})), writes = [];
  return { m, writes, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { writes.push(k); m.set(k, String(v)); } };
}
const PREFS = JSON.stringify({ tz: 'sin', accent: 'us' });
async function setup(blob = BEFORE, prefs = PREFS) {
  await ielts();
  _reset();
  return memory(Object.assign(blob ? { [DATA_KEY]: JSON.stringify(blob) } : {}, prefs ? { [PREF_KEY]: prefs } : {}));
}
const blobOf = (b) => JSON.parse(b.m.get(DATA_KEY));
const withGrammar = (g) => { const o = clone(BEFORE); o.profile.grammar = g; return o; };
const tablesOf = (T) => ({ guides: T.guides, reasons: T.reasons, prompts: T.prompts, L: T.tables.L, RA: T.tables.RA, RG: T.tables.RG });

test('content/guides.json: the page\'s eight tabs and 资源\'s groups, 16 grammar points, the prompts, the reasons, three score tables — the bytes SOURCE.json recorded', async () => {
  const T = await loadGuides();
  assert.deepEqual(T.tabs.map((t) => t[0]), CONTRACT.tabs);
  assert.deepEqual(T.tabs.map((t) => t[1]), ['考试概览', '词汇', '语法', '发音', '听力', '阅读', '写作', '口语']);
  for (const [id] of T.tabs) assert.ok(typeof T.guides[id] === 'string' && T.guides[id].includes('<h3>'), id);
  assert.equal(T.grammar.length, CONTRACT.total);
  assert.ok(T.grammar.every((x) => Array.isArray(x) && x.length === 2 && x[0] && x[1]));
  assert.deepEqual(Object.keys(T.prompts).sort(), ['speaking', 'writing']);
  assert.deepEqual(Object.keys(T.reasons).sort(), ['grammar', 'listening', 'reading', 'speaking', 'vocab', 'writing']);
  assert.deepEqual(T.resources.map((g) => g.g), ['真题和官方资料', '词汇', '语法', '发音和听力', '阅读', '写作和口语', '词典']);
  for (const g of T.resources) for (const r of g.items) {
    assert.ok(r.n && r.d, g.g + ': name and why');
    if (r.u) assert.match(r.u, /^https:\/\/[a-z0-9.-]+(\/[\w/.-]*)?$/, r.n + ': an address out (https)');
  }
  assert.ok(T.resources.reduce((s, g) => s + g.items.filter((r) => r.u).length, 0) >= 8);
  for (const k of ['L', 'RA', 'RG']) assert.equal(T.tables[k].length, 17, k);
  assert.deepEqual(T.profile, { blocks: { a: ['09:30', '11:30'], b: ['14:00', '16:00'], c: ['17:30', '19:30'] }, target: 6.5 });
  assert.equal(T.pages.guides.stage[2], '学习方法'); assert.equal(T.pages.resources.stage[2], '资源');
  assert.ok(T.pages.guides.lead.length > 10 && T.pages.resources.lead.length > 10);
  // the placeholders the page knows, each tab's at most once (guideHTML replaces the first of each plain one)
  const all = T.tabs.map(([id]) => T.guides[id]).join('');
  assert.deepEqual([...new Set(all.match(/\{\{[A-Z]+(:\w+)?\}\}/g))].sort(), ['{{CONVERT}}', '{{GRAMMAR}}', '{{PLAN}}', '{{PROMPT:speaking}}', '{{PROMPT:writing}}', '{{REASONS:listening}}', '{{REASONS:reading}}', '{{TARGET}}']);
  for (const k of ['{{CONVERT}}', '{{PLAN}}', '{{TARGET}}', '{{GRAMMAR}}']) assert.equal(all.split(k).length, 2, k + ' once');
  assert.doesNotMatch(all, /<a /, 'no links in the text today (a link to come goes through ctx.go / out of the game)');
  const src = JSON.parse(readFileSync(new URL('../../vendor/ielts/SOURCE.json', import.meta.url), 'utf8'));
  const buf = readFileSync(new URL('../../content/guides.json', import.meta.url));
  assert.equal(crypto.createHash('sha256').update(buf).digest('hex'), src.content['guides.json'].sha256, 'content/guides.json changed since the export');
  for (const n of ['phasePlan', 'dailyHours', 'PHASES', 'diffDays', 'fmtH']) assert.ok(Array.isArray(src.host.lines[n]), 'host.js has ' + n + ' (verbatim)');
});

test('fillGuide is guideHTML: for each made-up profile every tab is the page\'s text with {{PLAN}} / {{TARGET}} the contract\'s sentence (the same literal as IELTS-Base)', async () => {
  const T = await loadGuides(), { Host } = await ielts();
  for (const c of CONTRACT.profiles) {
    const p = guideProfile(c.raw, CONTRACT.today, T.profile);
    assert.equal(planLine(p, Host), c.plan, JSON.stringify(c.raw));
    assert.equal(p.target.toFixed(1), c.target);
    for (const g of CONTRACT.tabs) {
      const s = fillGuide(g, p, T, Host);
      assert.equal(s, recipe(tablesOf(T), g, c.plan, c.target), g + ' ' + JSON.stringify(c.raw));
      assert.doesNotMatch(s, /\{\{/, g + ': every placeholder filled');
    }
  }
  // the parts the page then draws: the table, the reasons, the two prompts (escaped: the speaking one has quotes)
  const p = guideProfile(CONTRACT.profiles[0].raw, CONTRACT.today, T.profile);
  assert.match(convertTable(T), /<tr><td>7\.0<\/td><td>30–31<\/td><td>30–32<\/td><td>34–35<\/td><\/tr>/);
  assert.match(fillGuide('listening', p, T, Host), /<span class="chip">连读弱读没听出<\/span>/);
  assert.ok(fillGuide('speaking', p, T, Host).includes('&quot;请打分&quot;'));
  assert.ok(fillGuide('overview', p, T, Host).includes('<p>' + CONTRACT.profiles[0].plan + '从几乎零基础到 7.0 分'));
});

test('guideProfile mends a profile as normalizeProfile does: bad blocks → the default, target 4–9 by .5 (6.5 unset), no start date → today, no exam date → none', async () => {
  const T = await loadGuides();
  const d = T.profile.blocks;
  const p = guideProfile({ blocks: { a: ['9:30', '11:30'], b: ['14:00', '14:00'], c: ['25:00', '26:00'] }, target: 3, startDate: '2026/10/01', examDate: 'soon', eveningOn: null }, CONTRACT.today, T.profile);
  assert.deepEqual(p.blocks, { a: ['9:30', '11:30'], b: d.b, c: d.c });
  assert.deepEqual([p.target, p.startDate, p.examDate, p.eveningOn], [4, CONTRACT.today, '', true]);
  assert.deepEqual(guideProfile(null, CONTRACT.today, T.profile), { blocks: d, eveningOn: true, startDate: CONTRACT.today, examDate: '', target: 6.5, grammar: {} });
  assert.equal(guideProfile({ target: 0 }, CONTRACT.today, T.profile).target, 6.5);
  assert.equal(guideProfile({ target: 7.3 }, CONTRACT.today, T.profile).target, 7.5);
  assert.deepEqual(guideProfile({ blocks: [['09:00', '10:00']] }, CONTRACT.today, T.profile).blocks, d);
  assert.equal(guideProfile({ eveningOn: false }, CONTRACT.today, T.profile).eveningOn, false);
});

test('语法清单 reads as refreshGuides: 已学完 n / 16, item i on when profile.grammar[i] (truthy)', async () => {
  const T = await loadGuides();
  const v = grammarView(BEFORE.profile.grammar, T);
  assert.equal(doneText(v), CONTRACT.before.count);
  assert.deepEqual(v.items.filter((x) => x.on).map((x) => x.i), CONTRACT.before.on);
  assert.deepEqual([v.items[3].title, v.items[3].desc.slice(0, 6)], ['常用的 7 种时态', '一般现在、一']);
  assert.equal(doneText(grammarView(undefined, T)), '0 / 16');
  assert.equal(grammarView({ 2: 1 }, T).items[2].on, true, 'the page reads it as truthy');
});

test('a tick writes profile.grammar[i] = true and nothing else (every other byte of her blob stays); an untick takes the key away; the mirror follows', async () => {
  const b = await setup();
  const posted = [];
  globalThis.webkit = { messageHandlers: { ielts: { postMessage: (m) => posted.push(m) } } }; globalThis.__IELTS_NATIVE = { platform: 'ios' };
  try {
    assert.deepEqual(toggleGrammar(b, CONTRACT.tick.i, CONTRACT.total), { ok: true, changed: true, on: true });
    assert.deepEqual(b.writes, [DATA_KEY], 'one write, her key only');
    assert.equal(b.m.get(DATA_KEY), JSON.stringify(withGrammar(CONTRACT.tick.grammar)), 'her blob with just that key put in (the text the page writes)');
    assert.equal(mirrorFlush(), true);
    assert.deepEqual(posted, [{ type: 'mirror', text: b.m.get(DATA_KEY) }]);
    assert.deepEqual(toggleGrammar(b, CONTRACT.untick.i, CONTRACT.total), { ok: true, changed: true, on: false });
    assert.equal(b.m.get(DATA_KEY), JSON.stringify(withGrammar(CONTRACT.untick.grammar)), 'that key gone, the rest as it was');
    assert.equal(doneText(grammarView(blobOf(b).profile.grammar, await loadGuides())), CONTRACT.untick.count);
  } finally { delete globalThis.webkit; delete globalThis.__IELTS_NATIVE; _reset(); }
});

test('the same state twice writes once; a tap always switches what is stored, so quick taps end where the taps say and what shows is stored', async () => {
  const b = await setup();
  assert.deepEqual(setGrammar(b, 3, true, 16), { ok: true, changed: true, on: true });
  assert.deepEqual(setGrammar(b, 3, true, 16), { ok: true, changed: false, on: true });
  assert.deepEqual(setGrammar(b, 7, false, 16), { ok: true, changed: false, on: false });
  assert.equal(b.writes.length, 1);
  const seen = [];
  for (let k = 0; k < 5; k++) { const r = toggleGrammar(b, 9, 16); seen.push([r.on, !!blobOf(b).profile.grammar[9]]); }
  assert.deepEqual(seen, [[true, true], [false, false], [true, true], [false, false], [true, true]], 'each tap switches; the result is what is stored');
  assert.equal(b.writes.length, 6);
  // a truthy value that is not true reads as on; a tap takes it away (the page: if (m[id]) delete m[id])
  const c = await setup(withGrammar({ 2: 1 }));
  assert.deepEqual(toggleGrammar(c, 2, 16), { ok: true, changed: true, on: false });
  assert.deepEqual(blobOf(c).profile.grammar, {});
});

test('without her blob nothing is created; a blob without a profile is not hers; a point that is not one of the 16 is refused', async () => {
  const none = await setup(null);
  assert.deepEqual(toggleGrammar(none, 3, 16), { ok: false, reason: 'no-workbench' });
  assert.deepEqual(setGrammar(none, 3, true, 16), { ok: false, reason: 'no-workbench' });
  assert.deepEqual(none.writes, []);
  assert.equal(none.m.has(DATA_KEY), false);
  const odd = await setup({ notes: {} });
  assert.deepEqual(toggleGrammar(odd, 3, 16), { ok: false, reason: 'no-workbench' });
  assert.deepEqual(odd.writes, []);
  const b = await setup();
  for (const i of [16, -1, 1.5, '3', NaN, null]) assert.deepEqual(setGrammar(b, i, true, 16), { ok: false, reason: 'bad' }, String(i));
  assert.deepEqual(b.writes, []);
  // a profile without a grammar object: only grammar is put in (the page would also rewrite the rest normalized: LEARN §45)
  const bare = await setup({ profile: { startDate: '2026-10-13' }, notes: {} });
  setGrammar(bare, 1, true, 16);
  assert.equal(bare.m.get(DATA_KEY), JSON.stringify({ profile: { startDate: '2026-10-13', grammar: { 1: true } }, notes: {} }));
});

test('the lesson page in the book wrote her blob meanwhile: the game reads the latest before it writes (the page\'s change stays)', async () => {
  const b = await setup();
  toggleGrammar(b, 3, 16);
  const o = blobOf(b); o.profile.grammar[8] = true; o.notes.p1 = { id: 'p1', d: '2026-10-20', t: 'word', en: 'from the page', zh: '', ex: '' };
  b.m.set(DATA_KEY, JSON.stringify(o));
  toggleGrammar(b, 0, 16);
  assert.deepEqual(blobOf(b).profile.grammar, { 3: true, 5: true, 8: true });
  assert.ok(blobOf(b).notes.p1);
});

// ---------- the book and the page ----------
const src = (f) => readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
const MENUS = src('src/ui/menus.js'), BOOK = MENUS.slice(MENUS.indexOf('  _scr_book() {'), MENUS.indexOf('  _startLearn(st, from = null) {'));
const PAGE = src('src/ui/book-pages/guides.js');
const CSS = src('styles/ui.css'), css = CSS.slice(CSS.indexOf('游戏为主体 第三期第三步: 学习方法 · 资源'));

test('the register: 学习方法 is the game\'s own page and 资源 opens it; the book hands the page which one; 资源 while 学习方法 is up switches inside, no new leaf', async () => {
  assert.equal(typeof NATIVE_PAGES.guides, 'function');
  assert.equal(nativeOf('guides'), 'guides'); assert.equal(nativeOf('resources'), 'guides'); assert.equal(bookTab('resources'), 'guides');
  const m = await NATIVE_PAGES.guides();
  assert.equal(typeof m.mount, 'function');
  assert.match(BOOK, /native\.api = m\.mount\(box, ctx, view\) \|\| null;/, 'the view is the third argument');
  const turn = BOOK.slice(BOOK.indexOf('const turn = (view) => {'));
  assert.match(turn, /if \(native && native\.api && native\.api\.show && nativeOf\(view\) === native\.id\) \{ want = view; st\.page = view; native\.api\.show\(view\); return; \}/);
  assert.ok(turn.indexOf('native.api.show(view)') < turn.indexOf('const dir = flipDir'), 'before the leaf turns');
  assert.match(PAGE, /show\(v\) \{ pick\(v === RES \? RES : S\.guide\); \}/);
  assert.match(PAGE, /pick\(view === RES \? RES : S\.tab \|\| 'overview'\);/, 'first 考试概览; from 资源 on 资源; else the tab of this session');
});

test('the page: the text is the export\'s (her data gives numbers only); prompts copy the exact text (clipboard → copy command → a sheet to copy by hand); links go out in a new window, never the game\'s own', () => {
  assert.match(PAGE, /a\.innerHTML = fillGuide\(id, p, T, Host\);/);
  assert.equal((PAGE.match(/innerHTML/g) || []).length, 1, 'one markup sink: the page\'s own text');
  assert.doesNotMatch(PAGE.replace(/html: (GLYPHS\.\w+|LINK_SVG)/g, ''), /html:/, 'only icons go in as markup otherwise');
  assert.match(PAGE, /const text = T\.prompts\[k\] \|\| '';/);
  const copy = PAGE.slice(PAGE.indexOf('export async function copyText'), PAGE.indexOf('// 请手动复制'));
  assert.ok(copy.indexOf('navigator.clipboard.writeText(text)') < copy.indexOf("document.execCommand('copy')") && copy.indexOf("document.execCommand('copy')") < copy.indexOf('copyBox(ctx, text, back)'), 'the page\'s order');
  assert.match(copy, /ta\.style\.fontSize = '16px';/); assert.match(copy, /ta\.setSelectionRange\(0, ta\.value\.length\)/);
  assert.match(PAGE, /const COPIED = '已复制，粘贴到和 Claude 的对话里就能用。';/);
  assert.match(PAGE, /l\.target = '_blank'; l\.rel = 'noopener noreferrer';/);
  assert.match(PAGE, /accept: \(src\) => \{ if \(src !== 'mouse'\) l\.click\(\); \}/, 'a tap opens it itself (once); pad / keys press it');
  assert.doesNotMatch(PAGE, /location\s*(\.href)?\s*=|location\.assign|location\.replace|window\.open/, 'the game\'s window never goes');
  assert.match(PAGE, /if \(href\[0\] === '#'\) \{ ctx\.bind\(l, \{ id: 'gd-in-' \+ i, accept: \(\) => ctx\.go\(href\.slice\(1\)\) \}\);/, 'a link to a page of the 课本 turns the book');
  assert.match(PAGE, /const r = toggleGrammar\(ls, i, T\.grammar\.length\);[\s\S]*paintChecks\(true\);/, 'what shows after a tap is read back from her blob');
  assert.match(PAGE, /readBlob\(ls, \{ fresh: true \}\);\s*Promise\.all/, 'her latest blob when the page opens');
  assert.match(PAGE, /addEventListener\('storage', onStore\)/);
  assert.match(PAGE, /ownKeys\(sh\.el, \{ esc: \(\) => close\(\) \}\);/);
  for (const id of ["'gd-t-' + id", "'gd-g-' + x.i", "'gd-copy-' + k"]) assert.ok(PAGE.includes('id: ' + id), id + ': the pad / keys reach it');
  assert.match(PAGE, /if \(r\.u\) outLink\(name, 'gd-r-' \+ gi \+ '-' \+ ri\);/, 'every link of 资源 too');
  assert.match(PAGE, /function outLink\(l, id\) \{[\s\S]*?ctx\.bind\(l, \{ id,/);
});

test('look: sticker tabs that stay at the top, text ≥ 16 px, a table that scrolls in its own box, checks ≥ 44, pressed on the frame, only transform / opacity move, reduced motion fades', () => {
  assert.ok(css.length > 4000, 'found the section');
  assert.match(css, /\.iw-bg-bar \{ position: sticky; top: -18px;/);
  assert.match(css, /\.iw-bg-art \{[^}]*font: 500 16px \/ 1\.65/);
  for (const sel of ['iw-bg-check__t span', 'iw-bg-res__d', 'iw-bg-prompt__t', 'iw-bg-reslead']) assert.match(css, new RegExp('\\.' + sel + ' \\{[^}]*(font-size: (1[5-9])px|font: 500 16px)'), sel);
  assert.match(css, /\.iw-bg-table \{[^}]*max-width: 100%;[^}]*overflow-x: auto;[^}]*touch-action: pan-x pan-y;/);
  assert.match(css, /\.iw-bg-check \{[^}]*min-height: 48px/);
  assert.match(css, /\.iw-bg-res__n \{[^}]*min-height: 44px/);
  assert.match(css, /\.iw-bg-check\.is-down \{[^}]*transition-duration: 0s/);
  assert.match(css, /a\.iw-bg-res__n\.is-down \{[^}]*transition-duration: 0s/);
  assert.match(css, /\.iw-bg-art\.is-leaving \{ position: absolute;/, 'the old text leaves the flow: nothing jumps');
  assert.doesNotMatch(css, /backdrop-filter/);
  // every keyframe and transition of the section moves transform / opacity only
  for (const m of css.matchAll(/@keyframes [\w-]+ \{([^@]*?)\}\n/g)) for (const p of m[1].matchAll(/([a-z-]+):/g)) assert.ok(['transform', 'opacity'].includes(p[1]), 'keyframe moves ' + p[1]);
  for (const m of css.matchAll(/transition: ([^;]+);/g)) for (const part of m[1].split(',')) assert.match(part.trim(), /^(transform|opacity) /, 'transition of ' + part);
  const rm = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.match(rm, /\.iw-bg-art\.is-leaving \{ transform: none; transition: opacity \.16s linear; \}/);
  assert.match(rm, /animation: none;/);
  assert.match(css, /@media \(orientation: landscape\) and \(max-height: 520px\)/);
});
