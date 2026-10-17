// 题即玩法 play-8 (docs/PLAY.md §10「整天从头跑到尾」, LEARN §27): runs a whole day as segments, one after another, each
// in the shared browser lock on its own (so the lock is free between them), each one starting where the one before
// stopped (its report's `resume` → the next --gate / --skip), all on one Chromium profile (her store carries on); then
// tools/learn/day-check.mjs over the reports. The segment's own audit decides when to stop (--segment / --wallMs).
//   node tools/learn/day-run.mjs --name <n> --dir <out dir> --form puzzle|race|duel|boss --learn w1d1 [--max 8] [--gate N --skip K] [--from k] [--shots <dir>]
//        -- <audit> <its args…>          (the audit's own --profile / --out / --gate / --skip are added here)
//   --from k: carry on a day run before (its segments 1 … k−1 are in --dir under the same --name, its profile too; with
//   --gate / --skip from the last one's resume) — day-check reads them all; --shots: the first segment's screenshots (one
//   per mechanic: later segments take none — each costs seconds of software rendering)
// Not a browser itself: it only spawns `flock -w 9000 /tmp/ielts-browser.lock nice -n 10 node <audit> …` per segment.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const argv = process.argv.slice(2), cut = argv.indexOf('--');
const own = cut >= 0 ? argv.slice(0, cut) : argv, audit = cut >= 0 ? argv.slice(cut + 1) : [];
const opt = (k, d) => { const i = own.indexOf('--' + k); return i >= 0 ? own[i + 1] : d; };
const SHOTS = opt('shots', null), NAME = opt('name', 'day'), DIR = path.resolve(opt('dir', '.')), FORM = opt('form', 'puzzle'), LEARN_Q = opt('learn', 'w1d1'), MAX = +opt('max', 8), FROM = +opt('from', 1);
let gate = +opt('gate', 1), skip = +opt('skip', 0);
const profile = path.join(DIR, NAME + '-profile');
fs.mkdirSync(DIR, { recursive: true });
const outs = [];
const log = (...a) => { const line = `[day-run ${NAME} ${new Date().toISOString().slice(11, 19)}] ` + a.join(' '); console.log(line); fs.appendFileSync(path.join(DIR, NAME + '.log'), line + '\n'); };
const resumeOf = (j) => { if (!j) return null; if (j.runs) return (j.runs[0] || {}).resume || null; if (j.view) return j.resume || null; const r = Object.values(j)[0]; return (r && r.resume) || null; };
for (let k = FROM; k < FROM + MAX; k++) {
  const out = path.join(DIR, `${NAME}-s${k}.json`);
  const args = ['-w', '9000', '/tmp/ielts-browser.lock', 'nice', '-n', '10', 'node', ...audit, '--profile', profile, '--out', out, ...(gate > 1 ? ['--gate', String(gate)] : []), ...(skip > 0 ? ['--skip', String(skip)] : []), ...(SHOTS && k === FROM ? ['--shots', SHOTS] : [])];
  log(`segment ${k}: gate ${gate} skip ${skip} — waiting for the lock`);
  const t0 = Date.now();
  const r = spawnSync('flock', args, { cwd: ROOT, env: { ...process.env, NODE_PATH: process.env.NODE_PATH || '/opt/node22/lib/node_modules' }, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  fs.writeFileSync(path.join(DIR, `${NAME}-s${k}.log`), (r.stdout || '') + (r.stderr || ''));
  const tail = String(r.stdout || '').trim().split('\n').slice(-2).join(' | ').slice(0, 300);
  log(`segment ${k}: exit ${r.status} after ${((Date.now() - t0) / 1000).toFixed(0)} s (lock wait included) — ${tail}`);
  let j = null; try { j = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) { log(`segment ${k}: no report (${e.message})`); }
  if (j) outs.push(out);
  const res = resumeOf(j);
  if (!res) { log(`segment ${k}: no resume point — the day is over (or the segment died)`); break; }
  log(`segment ${k}: resume at gate ${res.gate} skip ${res.skip} (${res.title || ''})`);
  if (res.gate === gate && res.skip === skip) { log('no progress since the segment before: stopping'); break; }
  gate = res.gate; skip = res.skip;
}
// (every segment of this day in --dir, the ones of an earlier run with --from too, in order)
const all = fs.readdirSync(DIR).map((f) => f.match(new RegExp('^' + NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '-s(\\d+)\\.json$'))).filter(Boolean).sort((a, b) => +a[1] - +b[1]).map((m) => path.join(DIR, m[0]));
const chk = spawnSync('node', [path.join(ROOT, 'tools/learn/day-check.mjs'), '--form', FORM, '--learn', LEARN_Q, ...all], { cwd: ROOT, encoding: 'utf8' });
fs.writeFileSync(path.join(DIR, NAME + '-check.txt'), (chk.stdout || '') + (chk.stderr || ''));
log('day-check:', String(chk.stdout || '').trim().split('\n').pop());
process.exit(chk.status || 0);
