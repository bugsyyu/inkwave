// The safe area (LEARN §48): the notch / the Dynamic Island / the home bar, in CSS px. Her App's web view draws under
// them (viewport-fit=cover, the native side's contentInsetAdjustmentBehavior .never) and leaves the page to keep clear of
// them through env(safe-area-inset-*). The page's own variables carry them — styles/hud.css `--iw-sat / --iw-sar /
// --iw-sab / --iw-sal` on the root (= env(…), 0 on a desktop) — so the HUD, the touch layer and the level's keys read one
// set of numbers, and an audit on a headless page (no notch there) can set them: tools/learn/tap-walk.mjs.
//
//   safeInsets() → { top, right, bottom, left }   px, read through a probe element (cached per viewport size)
let cache = null, cacheKey = '';

export function safeInsets() {
  if (typeof document === 'undefined' || !document.body) return { top: 0, right: 0, bottom: 0, left: 0 };
  const key = `${innerWidth}x${innerHeight}`;
  if (cache && key === cacheKey) return cache;
  const p = document.createElement('div');
  p.style.cssText = 'position:fixed;left:0;top:0;visibility:hidden;pointer-events:none;padding:var(--iw-sat, env(safe-area-inset-top, 0px)) var(--iw-sar, env(safe-area-inset-right, 0px)) var(--iw-sab, env(safe-area-inset-bottom, 0px)) var(--iw-sal, env(safe-area-inset-left, 0px))';
  document.body.appendChild(p);
  const cs = getComputedStyle(p);
  const r = { top: parseFloat(cs.paddingTop) || 0, right: parseFloat(cs.paddingRight) || 0, bottom: parseFloat(cs.paddingBottom) || 0, left: parseFloat(cs.paddingLeft) || 0 };
  p.remove();
  cache = r; cacheKey = key;
  return r;
}
// (a turn, an inset changed by hand: read again next time)
export function forgetInsets() { cache = null; cacheKey = ''; }
