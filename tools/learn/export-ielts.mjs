#!/usr/bin/env node
// tools/learn/export-ielts.mjs <ielts-base-dir> — bring her course and IELTS-Base's engine into this repo (docs/LEARN.md §2).
//
//   content/w1.json        week 1, which lives inside IELTS-Base's app/index.html, exported through the host's own
//                          formatExampleWeek() (the course-pack format, FORMAT_NOTE: US IPA as words[3], pair Chinese)
//   content/w2.json, w3    byte copies of docs/courses/w2.json, w3.json
//   content/symbols.json   the host's SYMBOLS / SYM_GROUPS / SYM_LIST / SYM_US tables (Model.buildIndex needs them for s: items)
//   vendor/ielts/*.js      bank.js gen.js sched.js mark.js model.js, verbatim
//   vendor/ielts/host.js   page functions of the main script, copied verbatim (they are not a module) into a UMD wrapper like
//                          the other files; line ranges in SOURCE.json:
//                            dictScore and what it calls (the lesson's dictation score, engine.js);
//                            speechChunks (how the lesson cuts a text into the pieces audio/index.json has recordings of)
//                            and CLIP_SILENT (the silent MP3 its first tap plays to unlock <audio>) — src/learn/audio.js;
//                            TZ_PLACES, TZ_DEFAULT, tzFmt, tzDevice, tzParts, tzPlaceOf (her wall clock: 设置 → 时区, Singapore
//                            when unset) — src/learn/workbench.js dates the game's evidence on her clock, not the device's
//   vendor/ielts/SOURCE.json  the IELTS-Base commit, sha256 of every copied file, the host line ranges
//
// The host is booted the way IELTS-Base's own tests boot it (tests/base/load-host.cjs in a vm), with `progress: null`:
// her progress file is never read. Like tests/base/course-w3.test.mjs, the loader is copied to a temp dir with a few more
// internal names added to its EXTRA list; nothing under app/ is copied or patched.
// Re-runnable: every output is a pure function of the IELTS-Base checkout (dates come from its HEAD commit), so a second
// run on the same commit writes identical bytes.
//
// ── IELTS-Base 更新了课程（或宿主、考试引擎）以后怎么重跑 ──
//   1. 在 IELTS-Base 那边把要的提交检出来（工作区干净；有未提交的改动这里会提醒，SOURCE.json 记的永远是 HEAD）：
//        git -C <IELTS-Base> pull   # 或 checkout 某个提交
//   2. 在这个仓库的根目录：
//        node tools/learn/export-ielts.mjs <IELTS-Base 目录>
//      它会覆盖 content/w1.json w2.json w3.json symbols.json、vendor/ielts/*.js 和 SOURCE.json。要等几十秒（vm 里起一遍宿主）。
//      自检不过就整个退出、什么也不写坏（检查在写 SOURCE.json 之前；已写的文件 git checkout 回去即可）：dictScore 和活宿主的
//      分数一样、speechChunks 切得一样、她的时区读得一样、w1.json 的 378 个条目 id / 中文 / 音标和活宿主的索引一样。
//   3. 看 git diff --stat：
//        · 只动了 SOURCE.json 和 host.js（提交号、日期、indexSha256、宿主函数的行号）= 课程没变，只是宿主别处改了；
//        · content/w*.json 变了 = 课程改了：条目 id 是英文的哈希，改了英文的词 / 句会换 id（她旧的证据还在，只是不再画到这个条目上，
//          Model.answers 本来就这样处理「内容没了的证据」）；新加的第 n 周要把 w<n>.json 也加进来（下面的 [2, 3] 和 content.js）；
//        · vendor/ielts/*.js 变了 = 判分 / 记忆模型改了：跑测试看向量。
//   4. npm run check && npm run test:learn（tests/learn/ielts.test.mjs 核对 SOURCE.json 里每个文件的 sha256），过了就提交，
//      提交说明写上 IELTS-Base 的提交号（SOURCE.json 的 commit 会变，这正是要记下来的）。
//   5. 录音不在这里：app/audio/index.json 和分片 mp3 随 IELTS-Base 的 App 一起装，游戏运行时按文字去找（src/learn/audio.js），
//      课程改了句子、录音还没重新生成时，那几句自动用设备的声音。
//   6. 改游戏的打包结果进 App：IELTS-Base 那边 bash tools/game/sync-inkwave.sh <这个仓库>（app/game/SOURCE.json 记这边的提交号）。
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
// fdUs → BaseEngine.Model.usForm), lcsOk, esc; then the recordings' text pieces and silent unlock clip (audio.js) and her
// wall clock (workbench.js): tzPlaceOf → TZ_PLACES, TZ_DEFAULT (also declares TZ_FMT), tzFmt, tzDevice; tzParts → tzFmt
const HOST_NAMES = ['esc', 'fdUs', 'toks', 'normTok', 'lcsOk', 'NUM_1', 'NUM_10', 'NUM_ORD', 'numWords', 'dictWords', 'tokMarks', 'dictScore',
  'speechChunks', 'CLIP_SILENT', 'TZ_PLACES', 'TZ_DEFAULT', 'tzFmt', 'tzDevice', 'tzParts', 'tzPlaceOf'];
// the extra internal names the loader hands out (same trick as IELTS-Base's tests/base/course-w3.test.mjs)
const EXTRA_NAMES = ['formatExampleWeek', 'SYMBOLS', 'SYM_GROUPS', 'SYM_US', 'speechChunks', 'CLIP_SILENT', 'tzPlaceOf', 'tzParts'];

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
// counting is enough (checked by the comparisons with the live host below). A `const NAME = [` table (TZ_PLACES) counts
// its square brackets instead (its rows have no braces; a function's regexes may have unbalanced brackets, so only there).
function extract(lines, name) {
  const re = new RegExp('^(?:function ' + name + '\\(|const ' + name + ' = )');
  let start = -1;
  for (let i = 0; i < lines.length; i++) if (re.test(lines[i])) { if (start >= 0) throw new Error(name + ' 在 app/index.html 里不止一处'); start = i; }
  if (start < 0) throw new Error('app/index.html 里找不到 ' + name);
  const [open, close] = new RegExp('^const ' + name + ' = \\[').test(lines[start]) ? ['[', ']'] : ['{', '}'];
  let depth = 0, end = -1;
  for (let i = start; i < lines.length; i++) {
    for (const ch of lines[i]) { if (ch === open) depth++; else if (ch === close) depth--; }
    if (depth === 0) { end = i; break; }
  }
  if (end < 0) throw new Error(name + ' 的大括号没配平');
  let first = start;
  while (first > 0 && /^\/\/ /.test(lines[first - 1])) first--;
  return { name, from: first + 1, to: end + 1, text: lines.slice(first, end + 1).join('\n') };
}

function hostFile(parts, commit) {
  const head = [
    '/* INKWAVE · vendor/ielts/host.js — page functions of the lesson, copied VERBATIM out of IELTS-Base app/index.html (the',
    ' * page\'s main script) by tools/learn/export-ielts.mjs. SOURCE.json has the commit and each function\'s line range; this',
    ' * file is never edited by hand — re-run the export.',
    ' * Why a copy: they are page functions, not a module, and the game must do these exactly as the lesson does — dictScore',
    ' * scores a sentence (docs/DESIGN.md §7.13: percent and per-word marks are the host\'s, British = American, case never',
    ' * matters); speechChunks cuts a text into the pieces app/audio/index.json has recordings of and CLIP_SILENT is the clip',
    ' * that unlocks <audio> on her first tap (src/learn/audio.js); tzPlaceOf / tzParts read her wall clock (设置 → 时区) so a',
    ' * game answer is dated on the same day as one in the lesson (src/learn/workbench.js).',
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
  // the reading pieces (audio.js looks each one up in audio/index.json): sentences, never split at "Mr." / "1.5" / "e.g.",
  // long ones again at , ; : — the same cut as the live host's, or a recording would be looked up under the wrong text
  const passages = [
    'Hello! My name is Anna. I am from Shanghai, and I live in a small flat near the station. Mr. Lee says the course is 1.5 hours, e.g. from nine to half past ten.',
    'When I arrived at the library on Monday morning, the librarian, who was very kind and patient, showed me where the newspapers, the magazines, the old maps of the city and the quiet study rooms on the second floor were, and then she gave me a card.',
    '"Is this seat free?" she asked. "Yes," he said… Then they talked about the weather — it was cold.',
    '', '   ', 'One word',
  ];
  for (const t of passages) {
    const a = JSON.stringify(Host.speechChunks(t)), b = JSON.stringify(X.speechChunks(t));
    if (a !== b) throw new Error('host.js 的 speechChunks 和宿主切得不一样：' + t + '\n' + a + '\n' + b);
  }
  if (Host.CLIP_SILENT !== X.CLIP_SILENT || !/^data:audio\/mpeg;base64,/.test(Host.CLIP_SILENT)) throw new Error('host.js 的 CLIP_SILENT 和宿主的不一样');
  // her wall clock: 设置 → 时区 is a city id, an IANA zone or 'device'; unset (or unknown) is Singapore
  for (const v of [undefined, '', 'sin', 'lon', 'nyc', 'device', 'Europe/Paris', 'Asia/Kolkata', 'nowhere', 'Not/AZone']) {
    const a = JSON.stringify(Host.tzPlaceOf(v)), b = JSON.stringify(X.tzPlaceOf(v));
    if (a !== b) throw new Error('host.js 的 tzPlaceOf 和宿主读得不一样：' + v + '\n' + a + '\n' + b);
  }
  for (const at of ['2026-10-15T15:59:59Z', '2026-10-15T16:00:00Z', '2026-03-29T00:59:59Z', '2026-12-31T23:30:00Z']) {
    for (const zone of [null, 'Asia/Singapore', 'Europe/London', 'America/Los_Angeles']) {
      const a = JSON.stringify(Host.tzParts(new Date(at), zone)), b = JSON.stringify(X.tzParts(new h.FakeDate(at), zone));
      if (a !== b) throw new Error('host.js 的 tzParts 和宿主读得不一样：' + at + ' ' + zone + '\n' + a + '\n' + b);
    }
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
  console.log('自检：dictScore ' + vectors.length + ' 组、speechChunks ' + passages.length + ' 段、tzPlaceOf / tzParts、w1 条目 id / 中文 / 音标，都和活宿主一样');
}

await main();
