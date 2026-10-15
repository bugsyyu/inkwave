// 关卡学习 — the one place that says where the content / engine / store come from (docs/LEARN.md §5).
//
// flow.js, hud-learn.js and the menus import ONLY from here. Today that is the built-in stub; when workstream A's
// modules (content.js, engine.js, store.js, levels.js) land, this file changes to re-export them and nothing else
// moves:
//   export { loadWeek, daySteps } from './content.js';
//   export { prompt, judge } from './engine.js';
//   export { store } from './store.js';
//   export { puzzleLevel } from './levels.js';
export { loadWeek, daySteps, prompt, judge, store, puzzleLevel } from './engine-stub.js';
