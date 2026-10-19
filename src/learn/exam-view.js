// src/learn/exam-view.js — the main menu's and the course map's view of the lesson page's exam records (游戏为主体 第二期,
// docs/LEARN.md §41): her blob (workbench.js readBlob), her wall-clock today (设置 → 时区), the game's day tables — handed
// to the pure rules in exams.js. Nothing here writes. null everywhere without her account on this origin.
import { DAY_PLAN } from './design.js';
import { readBlob, present, wallParts, wallZone } from './workbench.js';
import { quizOffer, weekExam, PARTS, PART_ZH } from './exams.js';

export const planOf = (w, d) => (DAY_PLAN['w' + w] && DAY_PLAN['w' + w][d]) || null;
const pad2 = (n) => (n < 10 ? '0' : '') + n;
function ls() { try { return globalThis.localStorage || null; } catch (e) { return null; } }
export function todayDate(store = ls(), now = Date.now()) { const p = wallParts(now, wallZone(store)); return p.y + '-' + pad2(p.m) + '-' + pad2(p.d); }
function blob(store) { if (!present(store)) return null; const b = readBlob(store); return b ? b.o : null; }

// today's quiz on the main menu / her today's node: exams.js quizOffer (null: none today, or no account)
export function quizFor(T, store = ls(), now = Date.now()) {
  const o = T && T.inGame ? blob(store) : null;
  return o ? quizOffer(o, { week: T.week, day: T.day }, todayDate(store, now), planOf) : null;
}
// the week's 周考 / 满月月考 as the page has it (exams.js weekExam), null without her account
export function examFor(week, store = ls(), now = Date.now()) {
  const o = blob(store);
  return o ? weekExam(o, week, todayDate(store, now), planOf) : null;
}

// the words on the map: the node's second line, the pill over the map, the node's label for a screen reader
export const examTitle = (x) => (x.month ? '满月月考' : `第 ${x.week} 周周考`);
const PART_ONE = { L: '听', R: '读', W: '写', S: '说' };
export const partsDone = (x) => PARTS.filter((p) => x.parts[p] === 'done').length;
// a part's result: listening / reading their right answers, writing / speaking (marked on the page) just done
export const partScore = (x, p) => (x.parts[p] !== 'done' ? null : (p === 'L' || p === 'R') && x.scores[p] ? `${x.scores[p].right}/${x.scores[p].of}` : '✓');
export function examLine(x) {
  if (!x) return null;
  const n = partsDone(x);
  return { locked: '学完第 7 天开', soon: '明天开考', open: `能考 · ${n} / 4 段`, done: '考过了', closed: `考了 ${n} / 4 段` }[x.state] || null;
}
export function examPill(x) {
  if (!x || x.state === 'locked') return null;
  const T = examTitle(x), sc = PARTS.map((p) => PART_ONE[p] + ' ' + (partScore(x, p) || '·')).join(' · ');
  if (x.state === 'soon') return { text: `${T}明天开 · 一天一段`, go: '看看' };
  if (x.state === 'open') return { text: `${T}开着 · 下一段：${PART_ZH[x.next] || ''}`, go: '在课本里考' };
  if (x.state === 'done') return { text: `${T}考过了 · ${sc}`, go: '成绩单' };
  return { text: `${T}的窗口过了 · ${sc}`, go: '看看' };
}
export function examAria(x) {
  if (!x) return '';
  const bits = PARTS.map((p) => PART_ZH[p] + (x.parts[p] === 'done' ? ' ' + partScore(x, p).replace('✓', '考完') : x.parts[p] === 'doing' ? ' 考了一半' : ' 没考'));
  return `${examTitle(x)} · ${examLine(x)}` + (x.state === 'locked' ? '' : ' · ' + bits.join(' · '));
}
