// src/learn/checkin.js — 打卡 (游戏为主体 第二期, docs/LEARN.md §39): the lesson page's check-in, in the game. What the
// card (src/ui/checkin-card.js), the course map and the main menu ask; the writing itself is workbench.js saveCheckin
// (the page's own record: profile.ci, and the step's 做完). Pure (Node tests import it): the storage comes in.
//
//   MOODS                          the page's (app/index.html MOODS): [id, label, face]
//   dayIdOf(week, day)             'w<week>d<day>' (the course's day id, the key of profile.ci)
//   planCheckinStep(week, day)     the day's check-in step in the game's course (design.js DAY_PLAN signs) → { id, m, k } | null
//   checkinView(ls, week, day)     → { dayId, step, saved, done } | null   null: no workbench here, or no check-in that day
//   checkinGate({ view, book })    → 'ok' | 'none' | 'book'   (课本 open: the page in the book holds the same data — no card)
import { DAY_PLAN } from './design.js';
import { readBlob, present, herCheckin, packCheckinStep } from './workbench.js';

export const MOODS = [['easy', '轻松', '😊'], ['ok', '还行', '🙂'], ['hard', '有点难', '😵']];
export const dayIdOf = (week, day) => 'w' + (week | 0) + 'd' + (day | 0);

export function planCheckinStep(week, day) {
  const P = DAY_PLAN['w' + week] && DAY_PLAN['w' + week][day];
  const s = P && Array.isArray(P.signs) ? P.signs.find((x) => x.type === 'checkin') : null;
  return s ? { id: String(s.step).split(':').pop(), m: s.minutes, k: s.k } : null;
}

export function checkinView(ls, week, day) {
  if (!(week > 0) || !(day > 0) || !present(ls)) return null;
  const b = readBlob(ls);
  if (!b) return null;
  const dayId = dayIdOf(week, day);
  const ps = packCheckinStep(b.o, dayId), step = ps !== undefined ? ps : planCheckinStep(week, day);
  if (!step) return null;
  const saved = herCheckin(ls, dayId);
  return { dayId, week, day, step, saved, done: !!(saved && saved.date) };
}

export function checkinGate({ view = null, book = false } = {}) {
  if (!view) return 'none';
  if (book) return 'book';
  return 'ok';
}
