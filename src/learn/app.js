// src/learn/app.js — 游戏为主体（IELTS-Base docs/GAME-FIRST.md 第一期, the owner 10-17: 「以后直接游戏模式取代原有的雅思整个app
// 的原有设计，游戏不再是子版块，而是主体，围绕游戏来管理学习进度」). Her App opens the game as its front page; the lesson page
// (app/index.html gameFirstUrl) hands in her course's today. Pure: Node tests import it.
import { LEARN } from '../config.js';

// ?from=app&today=wXdY[&done=1] → { week, day, done, inGame } (inGame: a week the game's course holds — LEARN.weeks), else null
export function appToday(search, weeks = LEARN.weeks, days = LEARN.days) {
  const q = new URLSearchParams(search || ''), m = /^w(\d+)d(\d+)$/.exec(q.get('today') || '');
  if (q.get('from') !== 'app' || !m) return null;
  const week = +m[1], day = +m[2];
  if (week < 1 || day < 1 || day > days) return null;
  return { week, day, done: q.get('done') === '1', inGame: week <= weeks };
}

// the way back to the lesson page: ?classic — app/index.html stays on it for the rest of this session instead of coming
// straight back here
export const BOOK_URL = '../index.html?classic=1';
