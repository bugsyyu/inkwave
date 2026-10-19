// Shader warm-up (docs/LEARN.md §40). Without KHR_parallel_shader_compile — WebKit (her iPhone), SwiftShader, most Android —
// three's compile() / compileAsync() only hand a program to the driver (linkProgram); the real compile happens when the
// program is first used (three's getUniforms) and the page stops dead until it is done. That first use used to land on the
// main menu's first frame. Here a scene's programs are made for the target it really draws into (three keys a program by
// it: a render target is linear with no tone mapping, the canvas sRGB and tone mapped — so a compile against the wrong one
// warms programs nobody draws with) and used once, material by material; once a slice of time is spent, beat() (her App's
// boot watchdog, index.html __gfBeat, and the loading bar) and await pause() (a frame), so a slow device's long compile
// keeps the loading screen alive instead of looking like a hung boot.
import * as THREE from 'three';

let _rt = null;
/** A tiny HDR target: compiling against it gives the variants every render target of ours draws with. */
export function warmTarget() { return _rt || (_rt = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType })); }

const _used = new WeakSet();
/** The programs three has made that nobody has used yet. */
export function freshPrograms(renderer) { return renderer.info.programs.filter((p) => !_used.has(p)); }
/** Use a program once (three's own first use: where a serial driver compiles it). */
export function useProgram(p) { _used.add(p); if (p.getUniforms) p.getUniforms(); }

/** The objects to compile so that every material in `scene` is seen once (the first object that carries each). */
export function warmList(scene) {
  const objs = [], mats = new Set();
  scene.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.material) return;
    const list = Array.isArray(o.material) ? o.material : [o.material];
    let fresh = false;
    for (const m of list) if (m && !mats.has(m)) { mats.add(m); fresh = true; }
    if (fresh) objs.push(o);
  });
  return objs;
}

/** Use once, a program at a time, every program made and not used yet (an earlier compile's: a kid's warmAll, a set's own);
 *  once `slice` ms are spent, beat() and await pause(). → how many */
export async function usePrograms(renderer, { beat = null, pause = null, slice = 24, now = () => performance.now() } = {}, clock = { t0: now() }) {
  let n = 0;
  for (const p of freshPrograms(renderer)) {
    useProgram(p); n++;
    if (now() - clock.t0 > slice) {
      if (beat) beat();
      if (pause) await pause();
      clock.t0 = now();
    }
  }
  return n;
}

/** Compile `scene` as it draws into `target` (null = the canvas), with `camera`, and use every new program once (those an
 *  earlier compile left unused first) — an object at a time, a program at a time; once `slice` ms are spent, beat() and
 *  await pause(). → { objects, programs } */
export async function warmScene(renderer, scene, camera, o = {}) {
  const { target = null, beat = null, now = () => performance.now() } = o;
  const clock = { t0: now() };
  let made = await usePrograms(renderer, o, clock);
  const objs = warmList(scene);
  for (const ob of objs) {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(target);
    try { renderer.compile(ob, camera, scene); } finally { renderer.setRenderTarget(prev); }
    made += await usePrograms(renderer, o, clock);
  }
  if (beat) beat();
  return { objects: objs.length, programs: made };
}
