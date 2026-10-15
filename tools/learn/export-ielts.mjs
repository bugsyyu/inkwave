#!/usr/bin/env node
// tools/learn/export-ielts.mjs <ielts-base-dir> — bring her course and IELTS-Base's engine into this repo (docs/LEARN.md §2).
//
//   content/w1.json        week 1, which lives inside IELTS-Base's app/index.html, exported through the host's own
//                          formatExampleWeek() (the course-pack format, FORMAT_NOTE: US IPA as words[3], pair Chinese)
//   content/w2.json, w3    byte copies of docs/courses/w2.json, w3.json
//   content/symbols.json   the host's SYMBOLS / SYM_GROUPS / SYM_LIST / SYM_US tables (Model.buildIndex needs them for s: items)
//   vendor/ielts/*.js      bank.js gen.js sched.js mark.js model.js, verbatim
//   vendor/ielts/host.js   dictScore and the functions it calls, copied verbatim out of the main script (they are page
//                          functions, not a module) into a UMD wrapper like the other files; line ranges in SOURCE.json
//   vendor/ielts/SOURCE.json  the IELTS-Base commit, sha256 of every copied file, the host line ranges
//
// The host is booted the way IELTS-Base's own tests boot it (tests/base/load-host.cjs in a vm), with `progress: null`:
// her progress file is never read. Like tests/base/course-w3.test.mjs, the loader is copied to a temp dir with a few more
// internal names added to its EXTRA list; nothing under app/ is copied or patched.
// Re-runnable: every output is a pure function of the IELTS-Base checkout (dates come from its HEAD commit), so a second
// run on the same commit writes identical bytes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..', '..');
const CONTENT = path.join(ROOT, 'content');
const VENDOR = path.join(ROOT, 'vendor', 'ielts');

const SRC = process.argv[2] ? path.resolve(process.argv[2]) : '';
if (!SRC || !fs.existsSync(path.join(SRC, 'app', 'index.html')) || !fs.existsSync(path.join(SRC, 'tests', 'base', 'load-host.cjs'))) {
  console.error('用法：node tools/learn/export-ielts.mjs <IELTS-Base 目录>（要有 app/index.html 和 tests/base/load-host.cjs）');
  process.exit(2);
}

// the five engine files, flat under vendor/ielts/ (their require() of each other is lazy and falls back to BaseEngine)
const VENDOR_FILES = [['model.js', 'app/base/model.js'], ['bank.js', 'app/exam/bank.js'], ['gen.js', 'app/exam/gen.js'], ['sched.js', 'app/exam/sched.js'], ['mark.js', 'app/exam/mark.js']];
// page functions dictScore needs, in dependency order: dictScore → tokMarks → toks, dictWords (normTok, numWords → NUM_*,
// fdUs → BaseEngine.Model.usForm), lcsOk, esc
const HOST_NAMES = ['esc', 'fdUs', 'toks', 'normTok', 'lcsOk', 'NUM_1', 'NUM_10', 'NUM_ORD', 'numWords', 'dictWords', 'tokMarks', 'dictScore'];
// the extra internal names the loader hands out (same trick as IELTS-Base's tests/base/course-w3.test.mjs)
const EXTRA_NAMES = ['formatExampleWeek', 'SYMBOLS', 'SYM_GROUPS', 'SYM_US'];

const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const git = (...a) => execFileSync('git', ['-C', SRC].concat(a), { encoding: 'utf8' }).trim();
const pretty = (o) => JSON.stringify(o, null, 1) + '\n'; // the host's downloadJSON uses indent 1 for packs

/* ───────────────────────────── the host, booted like the tests do ───────────────────────────── */
function hostLoader() {
  const src = fs.readFileSync(path.join(SRC, 'tests', 'base', 'load-host.cjs'), 'utf8');
  const out = src
    .replace("const EXTRA = ['dictScore',", 'const EXTRA = [' + EXTRA_NAMES.map((n) => "'" + n + "'").join(', ') + ", 'dictScore',")
    .replace("const ROOT = path.resolve(__dirname, '..', '..');", 'const ROOT = ' + JSON.stringify(SRC) + ';')
    .replace("require('../progress-snapshot.cjs')", 'require(' + JSON.stringify(path.join(SRC, 'tests', 'progress-snapshot.cjs')) + ')');
  if (!out.includes("'formatExampleWeek', ") || !out.includes('const ROOT = "') || !out.includes('progress-snapshot.cjs"')) {
    throw new Error('IELTS-Base 的 tests/base/load-host.cjs 写法变了，这里的三处替换没生效');
  }
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'inkwave-export-'));
  process.on('exit', () => { try { fs.rmSync(dir, { recursive: true, force: true }); } catch (e) { /* ignore */ } });
  const file = path.join(dir, 'load-host.cjs');
  fs.writeFileSync(file, out);
  return createRequire(import.meta.url)(file);
}

/* ───────────────────────────── verbatim extraction from app/index.html ───────────────────────────── */
// A top-level `function NAME(` or `const NAME =` in the main script, with the // comment lines right above it, up to the
// line where its braces balance. Braces inside the strings and regexes of these particular functions are balanced, so
// counting is enough (checked by the dictScore comparison below).
function extract(lines, name) {
  const re = new RegExp('^(?:function ' + name + '\\(|const ' + name + ' = )');
  let start = -1;
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) { if (start >= 0) throw new Error(name + ' 在 app/index.html 里不止一处'); start = i; }
  if (start < 0) throw new Error('app/index.html 里找不到 ' + name);
  let depth = 0, end = -1;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) { if (ch === '{') depth++; else if (ch === '}') depth--; }
    if (depth === 0) { end = i; break; }
  }
  if (end < 0) throw new Error(name + ' 的大括号没配平');
  let first = start;
  while (first > 0 && /^\/\/ /.test(lines[first - 1])) first--;
  return { name, from: first + 1, to: end + 1, text: lines.slice(first, end + 1).join('\n') };
}

function hostFile(parts, commit) {
  const head = [
    '/* INKWAVE · vendor/ielts/host.js — the lesson\'s dictation score and the functions it calls, copied VERBATIM out of',
    ' * IELTS-Base app/index.html (the page\'s main script) by tools/learn/export-ielts.mjs. SOURCE.json has the commit and',
    ' * each function\'s line range; this file is never edited by hand — re-run the export.',
    ' * Why a copy: dictScore is a page function, not a module, and the game must score a sentence exactly as the lesson and',
    ' * the exam do (docs/DESIGN.md §7.13: percent and per-word marks are the host\'s, British = American, case never matters).',
    ' * UMD like the other files here: Node → module.exports; browser → BaseEngine.Host. `window` inside fdUs is the UMD root',
    ' * (globalThis in Node), where model.js registers BaseEngine.Model. Source commit: ' + commit + '. */',
    '(function (root, factory) {',
    "  'use strict';",
    '  var api = factory(root);',
    "  if (typeof module === 'object' && module && module.exports) module.exports = api;",
    '  if (root) { var BE = root.BaseEngine = root.BaseEngine || {}; if (!BE.Host) BE.Host = api; }',
    "})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this), function (root) {",
    "  'use strict';",
    '  var window = root;',
  ];
  const body = parts.map((p) => '\n  // ── app/index.html L' + p.from + (p.to > p.from ? '–' + p.to : '') + ' ──\n' + p.text.split('\n').map((l) => (l ? '  ' + l : l)).join('\n'));
  const tail = ['', '  return { ' + parts.map((p) => p.name + ': ' + p.name).join(', ') + ' };', '});', ''];
  return head.join('\n') + body.join('\n') + '\n' + tail.join('\n');
}

/* ───────────────────────────── main ───────────────────────────── */
async function main() {
  const commit = git('rev-parse', 'HEAD');
  const date = git('log', '-1', '--format=%cI');
  const dirty = git('status', '--porcelain', '--', 'app/index.html', 'app/exam', 'app/base/model.js', 'docs/courses');
  if (dirty) console.warn('注意：IELTS-Base 的工作区有未提交的改动，SOURCE.json 记的是 HEAD：\n' + dirty);
  fs.mkdirSync(CONTENT, { recursive: true });
  fs.mkdirSync(VENDOR, { recursive: true });
  const source = { repo: 'bugsyyu/IELTS-Base', commit, date, tool: 'tools/learn/export-ielts.mjs', files: {}, host: null, content: {} };

  // 1. the engine files, verbatim
  for (const [name, from] of VENDOR_FILES) {
    const buf = fs.readFileSync(path.join(SRC, from));
    fs.writeFileSync(path.join(VENDOR, name), buf);
    source.files[name] = { from, bytes: buf.length, sha256: sha256(buf) };
  }

  // 2. the host: week 1 in pack format, the symbol tables, and dictScore's closure
  const html = fs.readFileSync(path.join(SRC, 'app', 'index.html'), 'utf8');
  const { loadHost, mainScript } = hostLoader();
  const h = loadHost({ now: '2026-10-15T09:20:00', progress: null }); // progress: null — a blank learner; nothing of hers is read
  const X = h.X, WB = h.WB;
  for (const n of EXTRA_NAMES) if (X[n] === undefined) throw new Error('宿主没有交出 ' + n);
  const week = X.formatExampleWeek();
  const w1 = { app: 'ielts-workbench-course', v: 1, week };
  const w1Text = pretty(w1);
  fs.writeFileSync(path.join(CONTENT, 'w1.json'), w1Text);
  source.content['w1.json'] = { from: 'app/index.html W1 (const W1 = {) through formatExampleWeek()', bytes: Buffer.byteLength(w1Text), sha256: sha256(w1Text) };

  const sym = { symbols: X.SYMBOLS, groups: X.SYM_GROUPS, list: WB.SYM_LIST, us: X.SYM_US };
  const symText = pretty(sym);
  fs.writeFileSync(path.join(CONTENT, 'symbols.json'), symText);
  source.content['symbols.json'] = { from: 'app/index.html SYMBOLS, SYM_GROUPS, SYM_LIST (WB), SYM_US', bytes: Buffer.byteLength(symText), sha256: sha256(symText) };

  for (const n of [2, 3]) {
    const from = 'docs/courses/w' + n + '.json';
    const buf = fs.readFileSync(path.join(SRC, from));
    const pack = JSON.parse(buf.toString('utf8'));
    if (pack.app !== 'ielts-workbench-course' || !pack.week || pack.week.id !== 'w' + n) throw new Error(from + ' 不是第 ' + n + ' 周的课程包');
    fs.writeFileSync(path.join(CONTENT, 'w' + n + '.json'), buf);
    source.content['w' + n + '.json'] = { from, bytes: buf.length, sha256: sha256(buf) };
  }

  // the main script's line numbers are the file's: the script is one contiguous block of index.html
  const script = mainScript(html);
  const at = html.indexOf(script);
  if (at < 0) throw new Error('主脚本在 index.html 里定位不到');
  const offset = html.slice(0, at).split('\n').length - 1;
  const lines = script.split('\n');
  const parts = HOST_NAMES.map((n) => { const p = extract(lines, n); p.from += offset; p.to += offset; return p; });
  const hostText = hostFile(parts, commit);
  fs.writeFileSync(path.join(VENDOR, 'host.js'), hostText);
  const fnRanges = {};
  parts.forEach((p) => { fnRanges[p.name] = [p.from, p.to]; });
  source.host = { file: 'host.js', from: 'app/index.html', indexSha256: sha256(html), lines: fnRanges, bytes: Buffer.byteLength(hostText), sha256: sha256(hostText) };

  // 3. checks: the copied host scores exactly like the live host; the pack's item ids are the ids her evidence uses.
  // The copies are loaded the way src/learn/ielts.js loads them: as ES modules (this package is "type": "module", so
  // require() would give an empty namespace), each registering itself on globalThis.BaseEngine.
  await import(pathToFileURL(path.join(VENDOR, 'model.js')).href);   // BaseEngine.Model, which fdUs reads
  await import(pathToFileURL(path.join(VENDOR, 'host.js')).href);
  const M = globalThis.BaseEngine.Model, Host = globalThis.BaseEngine.Host;
  if (!M || !Host || typeof Host.dictScore !== 'function') throw new Error('vendor/ielts/model.js 或 host.js 没有登记到 BaseEngine');
  const vectors = [
    ['The course starts on the fifth of September.', 'the course start on the fifth of september'],
    ['It costs thirteen pounds.', 'it costs 13 pounds'],
    ['My favourite colour is blue.', 'my favorite color is blue'],
    ['She gets up at half past seven.', 'she get up at 7:30 — yes'],
    ['I have an English class on Monday.', ''],
  ];
  for (const [ref, hyp] of vectors) {
    const a = JSON.stringify(Host.dictScore(ref, hyp)), b = JSON.stringify(WB.dictScore(ref, hyp));
    if (a !== b) throw new Error('host.js 的 dictScore 和宿主算得不一样：' + ref + ' / ' + hyp + '\n' + a + '\n' + b);
  }
  const live = M.buildIndex([X.W1], { symList: WB.SYM_LIST, symbols: WB.SYMBOLS, pairZh: WB.pairZh, ipaFor: WB.ipaFor });
  const mine = M.buildIndex([JSON.parse(w1Text).week], { symList: sym.list, symbols: sym.symbols });
  const liveIds = [...live.items.keys()].sort(), mineIds = [...mine.items.keys()].sort();
  if (JSON.stringify(liveIds) !== JSON.stringify(mineIds)) {
    const a = new Set(liveIds), b = new Set(mineIds);
    throw new Error('w1.json 的条目 id 和宿主的不一样：只在宿主 ' + liveIds.filter((x) => !b.has(x)).slice(0, 5).join(' ') + '；只在导出 ' + mineIds.filter((x) => !a.has(x)).slice(0, 5).join(' '));
  }
  // the pack's own stable content must agree too (ids hash the English, so the English is checked by the ids; check the rest)
  let diffs = 0;
  live.items.forEach((it, id) => { const m = mine.items.get(id); if (!m || m.zh !== it.zh || m.ipa !== it.ipa) diffs++; });
  if (diffs) throw new Error('w1.json 里有 ' + diffs + ' 个条目的中文或音标和宿主不一样');

  fs.writeFileSync(path.join(VENDOR, 'SOURCE.json'), pretty(source));
  console.log('IELTS-Base ' + commit.slice(0, 7) + ' (' + date + ')');
  console.log('content/: w1.json (' + liveIds.length + ' 个条目，' + week.days.length + ' 天) w2.json w3.json symbols.json');
  console.log('vendor/ielts/: ' + VENDOR_FILES.map((f) => f[0]).join(' ') + ' host.js (' + HOST_NAMES.join(', ') + ') SOURCE.json');
}

await main();
