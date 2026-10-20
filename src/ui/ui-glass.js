// src/ui/ui-glass.js — ui-glass (docs/LEARN.md §47). The owner, 10-20: 「能不能稍微升级下ui设计，融入google的拟态陶土还是啥的玻璃」.
// A small step up on the sticker language, not a new one: frosted glass on the big surfaces over the 3D stage (the main
// menu's panels, the book's page, the cards), clay on what is pressed (buttons, pills, chips, checks, bars) — the ink outline,
// Titan One, the splats stay. All of it hangs off one class on <html> (styles/ui.css, the ui-glass section):
//   iw-glass         config LEARN.uiGlass (true); ?ui=sticker leaves it off for this load (the sticker look, to compare / fall back)
//   iw-glass-solid   no blur: her phone's render step is the base class's start or slower (render-gov.js) — the glass keeps its
//                    tint and rim, a more solid one. prefers-reduced-transparency does the same in the CSS.
import { LEARN, RENDER_START } from '../config.js';

export const GLASS = 'iw-glass', SOLID = 'iw-glass-solid';

// → the classes <html> carries: [] (sticker), [GLASS], or [GLASS, SOLID]
//   search: location.search · on: LEARN.uiGlass · step: the render step this launch runs (null: no device class, a web
//   browser) · cls: the device class (device.js: top / high / base)
export function glassClasses({ search = '', on = LEARN.uiGlass !== false, step = null, cls = null } = {}) {
  let ui = null;
  try { ui = new URLSearchParams(search || '').get('ui'); } catch (e) { /* no query */ }
  if (!on || ui === 'sticker') return [];
  const solid = cls === 'base' || (step != null && step >= RENDER_START.base);
  return solid ? [GLASS, SOLID] : [GLASS];
}

export function applyGlass(root, classes) {
  if (!root || !root.classList) return classes;
  root.classList.remove(GLASS, SOLID);
  for (const c of classes) root.classList.add(c);
  return classes;
}
