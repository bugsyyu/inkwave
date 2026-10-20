// src/learn/app.js — 游戏为主体（IELTS-Base docs/GAME-FIRST.md 第一期, the owner 10-17: 「以后直接游戏模式取代原有的雅思整个app
// 的原有设计，游戏不再是子版块，而是主体，围绕游戏来管理学习进度」). Her App opens the game as its front page; the lesson page
// (app/index.html gameFirstUrl) hands in her course's today. Pure: Node tests import it.
import { LEARN } from '../config.js';
import { hasWeek } from './weeks.js';

// ?from=app&today=wXdY[&done=1] → { week, day, done, inGame }, else null. inGame: a week the game can load (gf-weeks,
// LEARN §44: her account's course pack for it, or content/ — weeks.js hasWeek); `weeks` a number = the old rule, week ≤ it
export function appToday(search, weeks = hasWeek, days = LEARN.days) {
  const q = new URLSearchParams(search || ''), m = /^w(\d+)d(\d+)$/.exec(q.get('today') || '');
  if (q.get('from') !== 'app' || !m) return null;
  const week = +m[1], day = +m[2];
  if (week < 1 || day < 1 || day > days) return null;
  return { week, day, done: q.get('done') === '1', inGame: typeof weeks === 'function' ? !!weeks(week) : week <= weeks };
}

// the way back to the lesson page: ?classic — app/index.html stays on it for the rest of this session instead of coming
// straight back here
export const BOOK_URL = '../index.html?classic=1';
