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

/** What an object adds to its material's program key (three keys a program by it too): its kind, instancing (and instance
 *  colours), skinning, batching, morphs, the geometry's optional attributes. (LEARN §42: one material on a mesh and on an
 *  InstancedMesh is two programs — the second used to be built by the first real frame.) */
export function variantKey(o) {
  const g = o.geometry, a = (g && g.attributes) || {}, mo = (g && g.morphAttributes) || {};
  return [o.type, o.isInstancedMesh ? (o.instanceColor ? 2 : 1) : 0, o.isSkinnedMesh ? 1 : 0, o.isBatchedMesh ? 1 : 0,
    Object.keys(mo).map((k) => k + mo[k].length).join(' '), a.color ? a.color.itemSize : 0,
    a.normal ? 1 : 0, a.tangent ? 1 : 0, a.uv1 ? 1 : 0, a.uv2 ? 1 : 0, a.uv3 ? 1 : 0].join();
}

/** The objects to compile so that every material in `scene` is seen once per variant (the first object that carries each
 *  material × variantKey). */
export function warmList(scene) {
  const objs = [], seen = new Set();
  scene.traverse((o) => {
    if (!(o.isMesh || o.isPoints || o.isLine || o.isSprite) || !o.material) return;
    const list = Array.isArray(o.material) ? o.material : [o.material], v = variantKey(o);
    let fresh = false;
    for (const m of list) if (m && !seen.has(m.uuid + '|' + v)) { seen.add(m.uuid + '|' + v); fresh = true; }
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

const _px = new Uint8Array(4);
/** Let the GPU catch up — a one-pixel read of the canvas (WebGL's finish() is only a flush in Chrome): a draw or a bake
 *  queued earlier (the texture library's layers, an environment PMREM) is waited for here, not inside the next program's
 *  first use — then beat() and await pause(): a queued bake and a compile are two stretches of the boot, each with its own
 *  beat, instead of one long silent one. */
export async function settle(renderer, { beat = null, pause = null } = {}) {
  const gl = renderer.getContext && renderer.getContext();
  if (gl && gl.readPixels) {
    const prev = renderer.getRenderTarget();
    renderer.setRenderTarget(null);
    try { gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, _px); } finally { renderer.setRenderTarget(prev); }
  }
  if (beat) beat();
  if (pause) await pause();
}

/** Draw `scene` for real into `target` (a tiny HDR target by default), an object at a time — the objects of warmList, every
 *  other renderable hidden, culling off for the one drawn — so what compile() cannot see is built a program at a time too:
 *  the shadow pass's depth programs (three picks them per object inside its shadow map), the lights as a frame counts them.
 *  A draw is its programs' first use; once `slice` ms are spent, beat() and await pause() (everything shown again
 *  meanwhile). → { objects, programs } */
export async function warmDraw(renderer, scene, camera, o = {}) {
  const { target = warmTarget(), beat = null, pause = null, slice = 24, now = () => performance.now() } = o;
  const objs = warmList(scene), shown = [];
  scene.traverse((x) => { if ((x.isMesh || x.isPoints || x.isLine || x.isSprite) && x.visible) shown.push(x); });
  const p0 = renderer.info.programs.length, prev = renderer.getRenderTarget();
  const hide = (on) => { for (const x of shown) x.visible = !on; };
  let t0 = now();
  hide(true);
  try {
    for (const ob of objs) {
      const cull = ob.frustumCulled;
      ob.visible = true; ob.frustumCulled = false;
      renderer.setRenderTarget(target);
      try { renderer.render(scene, camera); } finally { ob.visible = false; ob.frustumCulled = cull; renderer.setRenderTarget(prev); }
      if (now() - t0 > slice) {
        if (beat) beat();
        if (pause) { hide(false); await pause(); hide(true); }
        t0 = now();
      }
    }
  } finally {
    hide(false);   // (each drawn object was put back hidden; the ones shown before are shown again, the rest stay hidden)
    renderer.setRenderTarget(prev);
  }
  for (const p of freshPrograms(renderer)) _used.add(p);   // (drawn: already used)
  if (beat) beat();
  return { objects: objs.length, programs: renderer.info.programs.length - p0 };
}
