// 「一下子」的量具（LEARN §52）: the typing frames' searches as she meets them — 射 (wire/type.js _pose('word'): up to three
// word frames in a row), a typed question (the typing frame of a new band), turning the phone (the split keyboard's
// column) — timed in Chromium with the main thread slowed --rates × by CDP (her phone is slower than this box), the code
// of --base <rev> against the tree's, in one page each, in one sitting. A blank page: no WebGL, no account, no shots.
// Per case and rate: wall ms (what she would wait) and the main thread's CPU ms (CDP ThreadTime: another process on the box
// does not inflate it), the median of --reps fresh calls (a key each: the new code's memo never answers).
//   NODE_PATH=/opt/node22/lib/node_modules flock -w 9000 /tmp/ielts-browser.lock nice -n 10 node tools/learn/fn-throttle.mjs \
//     [--base <rev>] [--rates 1,4,6] [--reps 5] [--json <file>]
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const { chromium } = createRequire(import.meta.url)('playwright');
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const BASE = opt('base', null), RATES = opt('rates', '1,4,6').split(',').map(Number), REPS = +opt('reps', 5), OUT = opt('json', null);
const FILES = ['src/learn/play/type/frame.js', 'src/learn/play/type/split.js', 'src/learn/play/type/keys.js'];
const files = { b: new Map(FILES.map((f) => [f, fs.readFileSync(path.join(ROOT, f))])) };
if (BASE) files.a = new Map(FILES.map((f) => [f, execFileSync('git', ['-C', ROOT, 'show', `${BASE}:${f}`])]));
const PAGE = (w) => `<!doctype html><meta charset="utf-8"><title>fn</title><script type="module">
import * as F from '/${w}/src/learn/play/type/frame.js'; import * as S from '/${w}/src/learn/play/type/split.js'; import * as K from '/${w}/src/learn/play/type/keys.js';
window.__fn = { F, S, K }; document.title = 'ready';
</script>`;
const srv = http.createServer((q, r) => {
  const u = decodeURIComponent(new URL(q.url, 'http://x').pathname), m = /^\/(a|b)\/(.*)$/.exec(u);
  if (u === '/a.html' || u === '/b.html') { r.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }); return r.end(PAGE(u[1])); }
  if (!m || !files[m[1]] || !files[m[1]].has(m[2])) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' }); r.end(files[m[1]].get(m[2]));
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const origin = `http://127.0.0.1:${srv.address().port}`;
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const say = (...a) => console.log('[fn-throttle]', ...a);
const rows = [];
for (const w of BASE ? ['a', 'b'] : ['b']) {
  const page = await browser.newPage(), cdp = await page.context().newCDPSession(page);
  await page.goto(`${origin}/${w}.html`); await page.waitForFunction(() => document.title === 'ready');
  await cdp.send('Performance.enable');
  const thread = async () => (await cdp.send('Performance.getMetrics')).metrics.find((x) => x.name === 'ThreadTime').value;
  // the cases (fresh keys: a hair of aspect / pad apart each call), each a function of k run in the page
  const CASES = {
    'shot (3 word frames)': (k) => { const { F } = window.__fn, a = 390 / 844 * (1 + k * 1e-9); for (const o of [{ topFrac: 0.22, dist: 6.5 }, { dist: 6.5 }, { dist: 3.9 }]) F.frameFor({ phase: 'word', aspect: a, kbFrac: 0, word: { w: 3.2, h: 0.9, y: 2.4 }, ...o }); },
    'shot, turned (3 word frames)': (k) => { const { F } = window.__fn, a = 844 / 390 * (1 + k * 1e-9); for (const o of [{ topFrac: 0.12, dist: 6.5 }, { dist: 6.5 }, { dist: 3.9 }]) F.frameFor({ phase: 'word', aspect: a, kbFrac: 0, word: { w: 3.2, h: 0.9, y: 2.4 }, ...o }); },
    'typed question (type frame)': (k) => { const { F } = window.__fn; F.frameFor({ phase: 'type', aspect: 390 / 844 * (1 + k * 1e-9), kbFrac: 0.42, topFrac: 0.2, headMargin: F.FRAME.headMargin }); },
    'phone turned (split column)': (k) => { const { S, K } = window.__fn, L = K.keyboardLayout({ w: 844, h: 390 }, {}, 'word'); S.splitFrame({ W: 844, H: 390, top: 44 + k * 1e-3, bottom: 390, x0: L.mid.x0, x1: L.mid.x1, shelf: L.top }); },
  };
  let k = 1;
  for (const rate of RATES) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    for (const [name, fn] of Object.entries(CASES)) {
      await page.evaluate(`(${fn})(${k++})`);   // (the JIT: a first call, untimed)
      const wall = [], cpu = [];
      for (let i = 0; i < REPS; i++) {
        const t0 = await thread();
        const ms = await page.evaluate(`(() => { const t = performance.now(); (${fn})(${k++}); return performance.now() - t; })()`);
        const t1 = await thread();
        wall.push(ms); cpu.push((t1 - t0) * 1000);
      }
      const med = (a) => +a.slice().sort((x, y) => x - y)[a.length >> 1].toFixed(1);
      const r = { code: w === 'a' ? `base ${BASE}` : 'now', rate, case: name, wallMs: med(wall), cpuMs: med(cpu) };
      rows.push(r); say(JSON.stringify(r));
    }
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await page.close();
}
if (OUT) fs.writeFileSync(OUT, JSON.stringify(rows, null, 1));
await browser.close(); srv.close();
