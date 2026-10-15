// 关卡学习 — the one place that says where the content / engine / store come from (docs/LEARN.md §5).
//
// flow.js, the forms (src/learn/forms/*), hud-learn.js and the menus import ONLY from here. Workstream A's modules
// (content.js, engine.js, store.js, levels.js) are live: the course packs in content/, IELTS-Base's own judges in
// vendor/ielts/, the evidence in her ev-<Monday> format. The stub (engine-stub.js) stays for its own tests only.
//
// Contract reminders for callers (LEARN.md §8): `await loadWeek(n)` first, then everything else is synchronous and
// takes the WEEK OBJECT (not its number): daySteps(week, d), puzzleLevel(week, d), store.due(week).
export { loadWeek, daySteps, dayOf, itemOf, weekIndex, setLoader } from './content.js';
export { prompt, judge } from './engine.js';
export { store } from './store.js';
export { puzzleLevel, raceLevel, duelLevel, bossLevel } from './levels.js';
