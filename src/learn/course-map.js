// src/learn/course-map.js — 游戏为主体 第二期（docs/LEARN.md §34）: the course map, her three weeks as INKWAVE's level map.
// Pure (Node tests import it): the menu's 'map' screen (src/ui/menus.js _scr_map) asks it what each node is and where it
// sits; the store / the plan come in as functions, so nothing here loads a week.
//
//   courseMap({ weeks, days, progress(week, day) → { done, total }, plan(week, day) → { form } | null, today,
//               checkin(week, day) → 'done' | 'todo' | null, exam(week) → exams.js weekExam | null,
//               quiz(week, day) → exams.js quizOffer | null })
//     → [{ week, days: [{ day, form, done, total, state, complete, now, ci, qz }], boss: { state, exam } }]
//   state:  'today'  her course's today (whatever its progress: the map's one "you are here")
//           'done'   total > 0 and done ≥ total        'part'  0 < done < total
//           'todo'   nothing yet — and a day with no scored items (total 0: a lesson, nothing to prove)
//           'locked' after her today (she follows the course; today and every day before it replay — design.js UNLOCK.replay)
//   complete: done ≥ total > 0 (and today when the lesson page says it is done: ?done=1) — the node's tick
//   no today (plain INKWAVE, development): nothing is locked
//   boss:   the week's 周考, open ('todo') once that week's day 7 is not locked
//   exam:   the week's 周考 / 满月月考 as the lesson page has it (LEARN §41: locked · soon · open · done · closed, its parts
//           and scores); null without her account. The node still opens the game's boss (practice) whatever it says
//   qz:     今日小考 (LEARN §41) on her today's node: 'done' (the page's record has today's quiz) · 'open' · null
//   ci:     打卡 (LEARN §39) — her check-in for the day as the lesson page has it (profile.ci: 'done'), one still to make
//           ('todo'), or none (no workbench here, no check-in step that day, or a locked day)
//   has:    (gf-weeks, LEARN §44) week → the game can load it (weeks.js courseWeeks().has); a week it cannot is `wait`:
//           every node 'wait' (等老师的课程包), nothing else asked of it. boss.month: the 满月月考 (weeks 4 · 8 · 12 · 16) of a
//           week that is there
import { MONTH_WEEKS } from './exams.js';

export function courseMap({ weeks = 3, days = 7, progress = null, plan = null, today = null, checkin = null, exam = null, quiz = null, has = null } = {}) {
  const T = today && today.week > 0 && today.day > 0 ? today : null;
  const after = (w, d) => !!T && (w > T.week || (w === T.week && d > T.day));
  const out = [];
  for (let w = 1; w <= weeks; w++) {
    let open = true; try { open = has ? !!has(w) : true; } catch (e) { open = false; }
    if (!open) {
      out.push({ week: w, wait: true, days: Array.from({ length: days }, (_, i) => ({ day: i + 1, form: null, done: 0, total: 0, state: 'wait', complete: false, now: false, ci: null, qz: null })), boss: { state: 'wait', exam: null, month: false } });
      continue;
    }
    const list = [];
    for (let d = 1; d <= days; d++) {
      let p = null, f = null, c = null;
      try { p = progress ? progress(w, d) : null; } catch (e) { p = null; }
      try { f = plan ? plan(w, d) : null; } catch (e) { f = null; }
      try { c = checkin ? checkin(w, d) : null; } catch (e) { c = null; }
      const total = Math.max(0, (p && +p.total) | 0), done = Math.min(total, Math.max(0, (p && +p.done) | 0));
      const now = !!T && w === T.week && d === T.day;
      const full = total > 0 && done >= total;
      const state = after(w, d) ? 'locked' : now ? 'today' : full ? 'done' : done > 0 ? 'part' : 'todo';
      const ci = c === 'done' ? 'done' : c === 'todo' && state !== 'locked' ? 'todo' : null;
      let q = null; if (now && quiz) { try { q = quiz(w, d); } catch (e) { q = null; } }
      const qz = q && q.state === 'done' ? 'done' : q && (q.state === 'open' || q.state === 'later') ? 'open' : null;
      list.push({ day: d, form: (f && f.form) || null, done, total, state, complete: state !== 'locked' && (full || (now && !!T.done)), now, ci, qz });
    }
    let x = null; try { x = exam ? exam(w) : null; } catch (e) { x = null; }
    out.push({ week: w, days: list, boss: { state: after(w, days) ? 'locked' : 'todo', exam: x || null, month: MONTH_WEEKS.includes(w) } });
  }
  return out;
}

// the week's 0–1 progress over its days (the week tab's ring): scored items with evidence / all scored items
export function weekShare(week) {
  let done = 0, total = 0;
  for (const d of (week && week.days) || []) { done += d.done; total += d.total; }
  return total > 0 ? done / total : 0;
}

// Where the nodes sit: n points along one winding road in a fixed box (landscape 1000 × 360, left to right; portrait
// 360 × 940, top to bottom), and the road through them as an SVG path (Catmull-Rom → cubic Béziers, so it passes
// through every node; landscape rides a little high: the labels hang under the nodes). upTo(k): the same road from the
// first node to the k-th (the walked part).
export function mapLayout(n, portrait = false) {
  const W = portrait ? 360 : 1000, H = portrait ? 940 : 360;
  const pts = [];
  for (let i = 0; i < n; i++) {
    const t = n > 1 ? i / (n - 1) : 0, s = Math.sin(i * 1.15 + 0.35);
    pts.push(portrait ? { x: +(180 + s * 92).toFixed(1), y: +(66 + t * 808).toFixed(1) } : { x: +(66 + t * 868).toFixed(1), y: +(166 + s * 86).toFixed(1) });
  }
  const upTo = (k) => roadPath(pts.slice(0, Math.max(1, Math.min(n, k + 1))));
  return { w: W, h: H, pts, d: roadPath(pts), upTo };
}

function roadPath(p) {
  if (!p.length) return '';
  let d = `M${p[0].x} ${p[0].y}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
    const c1 = { x: b.x + (c.x - a.x) / 6, y: b.y + (c.y - a.y) / 6 }, c2 = { x: c.x - (e.x - b.x) / 6, y: c.y - (e.y - b.y) / 6 };
    d += ` C${c1.x.toFixed(1)} ${c1.y.toFixed(1)} ${c2.x.toFixed(1)} ${c2.y.toFixed(1)} ${c.x} ${c.y}`;
  }
  return d;
}
