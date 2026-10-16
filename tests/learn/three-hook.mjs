// Node resolve hook: `three` / `three/addons/…` → vendor/three/ (the page's import map), so a test can import the game's
// world modules without `npm install` (this repo never installs three; the browser never needs it installed either).
const ROOT = new URL('../../', import.meta.url);
export async function resolve(spec, ctx, next) {
  if (spec === 'three') return next(new URL('vendor/three/build/three.module.js', ROOT).href, ctx);
  if (spec.startsWith('three/addons/')) return next(new URL('vendor/three/jsm/' + spec.slice('three/addons/'.length), ROOT).href, ctx);
  return next(spec, ctx);
}
