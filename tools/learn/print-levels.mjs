// tools/learn/print-levels.mjs — print docs/LEVELS.md §3's day tables and boss tables from src/learn/design.js, so the
// document and the data cannot drift. Pure Node, no browser.
//   node tools/learn/print-levels.mjs            → Markdown on stdout (the three weeks)
//   node tools/learn/print-levels.mjs w2 3       → one day
import { loadWeek, daySteps } from '../../src/learn/content.js';
import { store, setBackend } from '../../src/learn/store.js';
import { DAY_PLAN, MECHANICS, FORM_ZH, bossPlan, estimateMinutes } from '../../src/learn/design.js';

const TIME = { day: '白天', dusk: '傍晚' };
const STAGE_ZH = { tidewater: 'Tidewater Plaza 海滨广场', kelpline: 'Kelpline Terminal 集装箱码头', halyard: 'Halyard Marina 游艇港', saltpan: 'Saltpan Basin 盐田', crossmarket: 'Crossroads Market 十字市场', lockgate: 'Lockgate Canals 船闸运河', terraces: 'Terrace Heights 山城' };
const side = (s) => (s.side === 'theirs' ? '（对面）' : s.side === 'mid' ? '（中场）' : '');

// a memory store: printing never touches her progress (the boss plan reads store.due, which is empty here)
const mem = new Map();
setBackend({ getItem: (k) => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); } });
store.load();

function printDay(w, d, out) {
  const P = DAY_PLAN[w.id][d.n], steps = daySteps(w, d.n);
  const course = steps.reduce((a, s) => a + s.minutes, 0), est = steps.reduce((a, s) => a + estimateMinutes(s), 0);
  out.push('', `##### 第 ${d.n} 天 · ${d.title} — ${FORM_ZH[P.form]}（也可：${P.alt.map((f) => FORM_ZH[f]).join('、')}）· ${STAGE_ZH[P.stage]} · ${TIME[P.time]} · ${P.minutes} 分钟（课程 ${course}，节奏模型估 ${est.toFixed(0)}）`);
  out.push('| # | 课程步 | 机制 | 题 | 分钟 | 位置（layout tag） | 记录 |', '|---|---|---|---|---|---|---|');
  P.gates.forEach((g, i) => {
    const s = steps.find((x) => x.id === g.step);
    out.push(`| 门 ${i + 1} | ${g.step.split(':')[1]} ${s.title} | ${MECHANICS[g.mechanic].zh} | ${g.ask}${g.batch ? '（每 ' + g.batch + ' 一锁）' : ''} | ${g.minutes} | ${g.spot.zh} \`${g.spot.tag}\`${side(g.spot)} | ${MECHANICS[g.mechanic].record} |`);
  });
  P.signs.forEach((g, i) => {
    const s = steps.find((x) => x.id === g.step);
    out.push(`| 标 ${i + 1} | ${g.step.split(':')[1]} ${s.title} | ${MECHANICS[g.mechanic].zh} | ${g.ask || '—'} | ${g.minutes} | 出口区 ${g.spot.zh} \`${g.spot.tag}\` | ${MECHANICS[g.mechanic].record}${g.classic ? '；经典页：' + g.classic : ''} |`);
  });
  out.push(P.extras.quiz ? '| 加 | 今日小考（可做可不做） | 对抗赛一轮 | 8 | 6 | 出口后，同一舞台傍晚 | 当天首答 |' : '| 加 | ' + P.extras.note + ' | | | | | |');
}

function printBoss(w, out) {
  const B = bossPlan(w);
  out.push('', `##### 周考 Boss · HULLBREAKER · ${STAGE_ZH[B.stage]} · ${TIME[B.time]} · 复习日后第二天起，一天一段，${B.window} 天窗口 · 共 ${B.minutes} 分钟`);
  out.push('| 段 | HP | 题 | 题池（本周条目） | 分钟 | Boss 阶段 / 招 |', '|---|---|---|---|---|---|');
  B.phases.forEach((p) => {
    const n = p.task ? (p.task.sentences ? '1 题（' + p.task.sentences + ' 句）' : '1 组（' + p.task.questions + ' 问 + 朗读 ' + p.task.readAloud + ' 句）') : p.n;
    out.push(`| ${p.id} ${p.zh} | ${Math.round(p.hp[0] * 100)}% → ${Math.round(p.hp[1] * 100)}% | ${n} | ${p.pool} | ${p.minutes} | ${p.bossPhase}：${p.moves.join(' / ') || '—'} |`);
  });
}

const [onlyW, onlyD] = process.argv.slice(2);
const out = [];
for (const n of [1, 2, 3]) {
  const w = await loadWeek(n);
  if (onlyW && w.id !== onlyW) continue;
  out.push('', `#### ${w.title}（${w.id}）`);
  for (const d of w.days) { if (onlyD && Number(onlyD) !== Number(d.n)) continue; printDay(w, d, out); }
  if (!onlyD) printBoss(w, out);
}
process.stdout.write(out.join('\n') + '\n');
