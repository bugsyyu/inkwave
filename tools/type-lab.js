// INKWAVE 字弹 lab — the 打字蟹 type rig, the game keyboard and the 3D ink word (src/learn/play/type/, src/ui/play-keys.js)
// in the game's own renderer (src/core/renderer.js: the same post stack and grade), environment, FX and squidkid.
//   ?stage=tidewater   the real Tidewater Level + PaintSystem (slow under software GL); default: a light deck
//   ?quality=low|medium|high · ?team=0|1 · ?mode=word|sentence · ?reduced · ?shadows=0 · ?bloom=0
// Scripted control (headless): window.lab — freeze() / step(ms) / render() run a fixed-step sim clock, type(str),
// press(k), back(), submit(), resolve({ ok, pct, right, toks }), next(), frame(), info(), state().
import * as THREE from 'three';
import { Renderer } from '../src/core/renderer.js';
import { Environment } from '../src/world/environment.js';
import { QUALITY, DEFAULT_SETTINGS, TEAM_PALETTES, LEARN } from '../src/config.js';
import { G, emit } from '../src/core/ctx.js';
import { Character } from '../src/game/character.js';
import { getInkMaterial } from '../src/game/character-mats.js';
import { TypeShot } from '../src/learn/play/type/shot.js';
import { wordBox } from '../src/learn/play/type/inkword.js';
import { frameFor } from '../src/learn/play/type/frame.js';
import { PlayKeys } from '../src/ui/play-keys.js';

const params = new URLSearchParams(location.search);
const qualityName = params.get('quality') || 'high';
const Q = QUALITY[qualityName] || QUALITY.high;
const stageName = params.get('stage') || 'deck';
const reduced = params.has('reduced');
const settings = { ...DEFAULT_SETTINGS, quality: qualityName, shadows: params.get('shadows') !== '0', bloom: params.get('bloom') !== '0', touchControls: params.has('touch') ? 'on' : 'auto' };
G.settings = settings; G.quality = Q;
G.emit = emit;

// ------------------------------------------------------------------ renderer + scene (the game's)
const R = new Renderer(document.getElementById('app'), settings);
const renderer = R.renderer;
G.renderer = renderer;
const scene = new THREE.Scene();
G.scene = scene;
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.15, 6500);
G.camera = camera;
R.setScene(scene, camera);
const pal = TEAM_PALETTES ? TEAM_PALETTES[0] : null;
G.teamColors = [new THREE.Color((pal && pal.a) || '#ff8a14'), new THREE.Color((pal && pal.b) || '#2f5bff')];
const TEAM = Number(params.get('team') || 0);

// ------------------------------------------------------------------ stage
let level = null, paint = null, physics = null, levelMat = null;
const ORIGIN = new THREE.Vector3(0, 0, 0);    // where the rig stands; the target is DIST ahead (+Z)
const DIST = 6.5;
const deck = new THREE.Group(); scene.add(deck);
let bounds = { minX: -25, maxX: 25, minZ: -44, maxZ: 44 }, footprint = null;
if (stageName === 'tidewater') {
  const [{ Level }, { MAP_LAYOUTS }, { PaintSystem }, { createLevelMaterial }, { Physics }] = await Promise.all([
    import('../src/world/level.js'), import('../src/world/maps.js'), import('../src/world/paint.js'), import('../src/world/levelMaterial.js'), import('../src/game/physics.js')]);
  level = new Level(MAP_LAYOUTS.tidewater);
  physics = new Physics(level);
  paint = new PaintSystem(renderer, level, { atlasSize: Q.paintAtlas, maxDensity: Q.paintAtlas >= 4096 ? 30 : 18 });
  levelMat = createLevelMaterial(paint.texture, paint.size);
  levelMat.userData.uniforms.uTeamA.value.copy(G.teamColors[0]); levelMat.userData.uniforms.uTeamB.value.copy(G.teamColors[1]);
  const mesh = new THREE.Mesh(level.buildGeometry(paint.size), levelMat);
  mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
  G.level = level; G.paint = paint; G.physics = physics;
  bounds = level.bounds;
  const sp = (params.get('at') || '-13,0,4').split(',').map(Number);
  ORIGIN.set(sp[0], sp[1], sp[2]);
  { const { Hit } = await import('../src/game/physics.js'); const h = physics.raycast(new THREE.Vector3(ORIGIN.x, 8, ORIGIN.z), new THREE.Vector3(0, -1, 0), 20, new Hit(), true); if (h.hit) ORIGIN.y = h.point.y; }
} else {
  // a light deck like fx-lab: the harbour slab, a planter, a crate stack, a spawn pad behind the rig
  const mat = (c, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const box = (x0, x1, y0, y1, z0, z1, c = '#d8d2c4') => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat(c)); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.castShadow = m.receiveShadow = true; deck.add(m); return m; };
  box(-25, 25, -1.2, 0, -44, 44);
  box(-9, -6.5, 0, 1.1, 9, 13, '#cfd6d8'); box(6, 8.5, 0, 0.8, 7, 10, '#c9a27c'); box(6.3, 7.8, 0.8, 1.6, 7.4, 9.4, '#cf9c88');
  box(-25, 25, 0, 3.6, 21.4, 22, '#ece4d4');
  const pad = new THREE.Mesh(new THREE.CylinderGeometry(2.2, 2.2, 0.08, 48), mat('#f3f1ec', 0.5)); pad.position.set(0, 0.04, -3.5); pad.receiveShadow = true; deck.add(pad);
  // paint stand-in (fx-lab's): glossy team-ink discs on the deck where the game would G.paint.splat
  const N = 400, discs = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ roughness: 0.22, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), N);
  discs.count = 0; discs.receiveShadow = true; discs.frustumCulled = false; scene.add(discs);
  let next = 0; const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion();
  G.paint = {
    splat(p, r, team, o = {}) {
      const k = 0.85 + ((o.seed || 0.5) * 0.3);
      m4.compose(new THREE.Vector3(p.x, 0.006 + next * 1e-5, p.z), q4.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (o.seed || 0) * 6.28), new THREE.Vector3(r * 1.2 * k, 1, r * k));
      discs.setMatrixAt(next, m4); discs.setColorAt(next, G.teamColors[team] || G.teamColors[0]);
      next = (next + 1) % N; discs.count = Math.max(discs.count, next || N);
      discs.instanceMatrix.needsUpdate = true; if (discs.instanceColor) discs.instanceColor.needsUpdate = true;
      return r * r * 3;
    },
  };
}
const env = new Environment(renderer, scene, { bounds, theme: params.get('theme') || 'day', shadowSize: Q.shadowSize, footprint });
scene.environment = env.envMap; G.env = env;
renderer.toneMappingExposure = 0.94;

// ------------------------------------------------------------------ fx + audio (optional)
let fx = null;
try {
  const { FX } = await import('../src/fx/fx.js');
  fx = new FX(scene, { quality: qualityName }); fx.setLighting?.(env.getSkyColors?.());
  const ray = new THREE.Raycaster(), dir = new THREE.Vector3(), hit = { point: new THREE.Vector3(), normal: new THREE.Vector3() };
  fx.setCollider((from, to) => {
    dir.subVectors(to, from); const len = dir.length(); if (len < 1e-6) return null;
    ray.set(from, dir.multiplyScalar(1 / len)); ray.far = len;
    const hs = ray.intersectObjects(level ? scene.children.filter((o) => o.isMesh && o.material === levelMat) : deck.children, false);
    if (!hs.length) return null;
    hit.point.copy(hs[0].point); hit.normal.copy(hs[0].face.normal).transformDirection(hs[0].object.matrixWorld); return hit;
  });
  // like main.js: a droplet in a team's ink paints that team's turf; the neutral grey of an unjudged word paints nothing
  fx.onDropletLand = (point, normal, color, size) => {
    if (!G.paint) return;
    let t = -1; for (let k = 0; k < 2; k++) { const c = G.teamColors[k]; if (Math.abs(c.r - color.r) + Math.abs(c.g - color.g) + Math.abs(c.b - color.b) < 0.05) t = k; }
    if (t >= 0) G.paint.splat(point.clone().addScaledVector(normal, 0.05), Math.min(0.45, Math.max(0.12, size * 2.4)), t, { seed: Math.random() });
  };
  G.fx = fx;
} catch (e) { console.warn('[type-lab] fx', e); }
try {
  const { audio } = await import('../src/audio/audio.js');
  G.audio = audio;
  const unlock = () => { audio.init(); audio.setVolumes?.({ master: 0.8, music: 0, sfx: 0.85 }); };
  addEventListener('pointerdown', unlock, { once: true, capture: true }); addEventListener('keydown', unlock, { once: true, capture: true });
} catch (e) { console.warn('[type-lab] audio', e); }

// ------------------------------------------------------------------ the squidkid + the rig
const character = new Character({ color: G.teamColors[TEAM], weapon: 'shooter', style: { hair: 1, skin: 1 }, name: 'lab', isLocal: true });
scene.add(character.root);
character.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
const actor = { character, pos: ORIGIN.clone(), yaw: 0, team: TEAM, learnSeat: 0 };
const shot = new TypeShot({ scene, team: TEAM, color: G.teamColors[TEAM], reduced, quality: qualityName, groundY: ORIGIN.y });
const rig = shot.rig;
shot.mount(actor);
let mode = params.get('mode') === 'sentence' ? 'sentence' : 'word';
// the AnimState a gate actually produces while she types: standing in the hatch, grounded, looking at the target
const anim = { time: 0, speed: 0, localMove: { x: 0, z: 0 }, grounded: true, vy: 0, aimPitch: -0.18, firing: false, charge: 0, rolling: false, form: 'kid', wallNormal: null, ink: 0.8, lowInk: false, special: 0, invuln: false, turnRate: 0, hp: 1, inEnemyInk: false, surface: 0, subAim: false };

// the target: a neutral grey ink ball on a little post (stands in for play-1's targets)
const target = new THREE.Group(); target.position.set(ORIGIN.x, ORIGIN.y, ORIGIN.z + DIST); scene.add(target);
const ball = new THREE.Mesh(new THREE.IcosahedronGeometry(0.42, 4), getInkMaterial(new THREE.Color(LEARN.type.word)));
ball.position.y = 1.45; ball.castShadow = true; target.add(ball);
const post = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 1.05, 12), new THREE.MeshStandardMaterial({ color: '#8f98a6', roughness: 0.4, metalness: 0.6 }));
post.position.y = 0.52; post.castShadow = true; target.add(post);
const aimPoint = new THREE.Vector3();
shot.begin({ mode, target: ball });

// ------------------------------------------------------------------ camera: the frames the gate flow will use
// frameFor() poses, blended like cameraRig's mode blend (easeInOut over `dur`), never cut
const camBlend = { t: 1, dur: 0.7, fromP: new THREE.Vector3(), fromQ: new THREE.Quaternion(), toP: new THREE.Vector3(), toQ: new THREE.Quaternion() };
let camPhase = 'type';
function framePose(phase, wordBox) {
  const kb = phase === 'word' ? 0 : (window.__kbFrac ?? (innerWidth < innerHeight ? 0.39 : 0.44));
  const f = frameFor({ phase, aspect: innerWidth / innerHeight, kbFrac: kb, dist: DIST, word: wordBox });
  const c = Math.cos(actor.yaw), s = Math.sin(actor.yaw);
  const toW = (p) => new THREE.Vector3(ORIGIN.x + p[0] * c + p[2] * s, ORIGIN.y + p[1], ORIGIN.z - p[0] * s + p[2] * c);
  const o = new THREE.PerspectiveCamera(); o.position.copy(toW(f.pos)); o.lookAt(toW(f.look));   // a camera: looks down −Z
  return { p: o.position, q: o.quaternion, f };
}
function frame(phase = camPhase, blend = false, wordBox) {
  camPhase = phase;
  const P = framePose(phase, wordBox);
  camera.fov = P.f.fov; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
  if (blend) { camBlend.fromP.copy(camera.position); camBlend.fromQ.copy(camera.quaternion); camBlend.toP.copy(P.p); camBlend.toQ.copy(P.q); camBlend.t = 0; }
  else { camera.position.copy(P.p); camera.quaternion.copy(P.q); camBlend.t = 1; }
  return P.f;
}
function camTick(dt) {
  if (camBlend.t >= 1) return;
  camBlend.t = Math.min(1, camBlend.t + dt / camBlend.dur);
  const k = camBlend.t < 0.5 ? 4 * camBlend.t ** 3 : 1 - Math.pow(-2 * camBlend.t + 2, 3) / 2;
  camera.position.lerpVectors(camBlend.fromP, camBlend.toP, k);
  camera.quaternion.slerpQuaternions(camBlend.fromQ, camBlend.toQ, k);
}
frame('type');
addEventListener('resize', () => { frame(camPhase); });

// ------------------------------------------------------------------ clock
let ballPop = 1;
let frozen = false, simT = 0, last = performance.now(), fpsT = 0, frames = 0, fps = 0;
const STEP = 1 / 60;
function tick(dt) {
  simT += dt; G.time = simT;
  anim.time = simT;
  character.root.position.copy(actor.pos); character.root.position.y += actor.learnSeat || 0;
  character.root.rotation.y = actor.yaw;
  character.update(dt, anim);
  shot.update(dt);
  if (ballPop < 1) { ballPop = Math.min(1, ballPop + dt * 2.5); const k = ballPop, e = 1 + 2.2 * Math.pow(k - 1, 3) + 1.2 * Math.pow(k - 1, 2); ball.scale.setScalar(Math.max(0.001, e)); }
  fx?.update(dt, camera);
  if (paint) { paint.flush(dt); levelMat.userData.uniforms.uTime.value = simT; }
  env.update?.(dt, camera);
  ball.position.y = 1.45 + Math.sin(simT * 2) * 0.05;
  camTick(dt);
}
function render() { renderer.info.reset(); R.render(); }
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  if (!frozen) { tick(dt); render(); }
  frames++; fpsT += dt; if (fpsT > 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
  const el = document.getElementById('stats'); if (el && !frozen) el.textContent = `${stageName} ${qualityName} · ${fps.toFixed(0)} fps · calls ${renderer.info.render.calls} · tris ${(renderer.info.render.triangles / 1000).toFixed(0)}k\n${rig.text}`;
}
requestAnimationFrame(loop);

// ------------------------------------------------------------------ scripted control
window.lab = {
  THREE, G, shot, rig, character, actor, scene, camera, renderer, R, target, ball, anim,
  freeze() { frozen = true; },
  unfreeze() { frozen = false; last = performance.now(); },
  step(ms = 16) { const n = Math.max(1, Math.round(ms / 1000 / STEP)); for (let i = 0; i < n; i++) tick(STEP); },
  render() { render(); return this.info(); },
  frame,
  press(k) { return shot.key(k); },
  back() { return shot.back(); },
  /** type a string through the game keyboard (as taps) with `gap` s of sim time between keys (freeze() first) */
  type(str, gap = 0.12) { for (const ch of String(str)) { const k = ch === '\b' ? 'back' : ch; keys._press(k, keys.keyEls.get(k)); this.step(gap * 1000); } return shot.text; },
  keys,
  submit() {
    const text = shot.submit();
    if (text == null) return null;
    keys.hide();
    const box = wordBox(text);
    frame('word', true, { w: box.w, h: box.h, y: 1.45 + shot.lift });
    rig.onLand = () => { ball.visible = false; };
    return text;
  },
  /** the verdict as engine.judge would give it */
  resolve(v) { return shot.resolve(v); },
  /** canned verdicts for the demo texts: 'right' (what she typed), 'wrong' (beautiful), 'pct' (the o'clock sentence) */
  demo(kind) {
    if (kind === 'right') return shot.resolve({ ok: true, right: shot.text });
    if (kind === 'wrong') return shot.resolve({ ok: false, right: DEMO.word.right });
    const right = DEMO.sentence.right, toks = right.split(' ').map((t) => ({ t, ok: t !== "o'clock." }));
    return shot.resolve({ ok: true, pct: 86, right, toks });
  },
  /** next question: clear the word, fresh sheet, the target pops back, camera back to the typing frame */
  next(m = mode) { mode = m; shot.clear(); shot.begin({ mode, target: ball }); ball.visible = true; ballPop = 0; keys.setMode(mode); keys.clear(); keys.setHintUsed(false); keys.show(); window.__kbFrac = keys.frac; frame('type', true); return mode; },
  /** draw calls / triangles of the rig + the word (on − off, main pass + shadow pass) and the JS cost of their update */
  measure() {
    const vis = (on) => { rig.root.visible = on; shot.word.mesh.visible = on; rig.shellG.visible = on && !!rig.shot; };
    const count = () => { renderer.info.reset(); R.render(); return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; };
    vis(true); const on = count(); vis(false); const off = count(); vis(true);
    const t0 = performance.now(); for (let i = 0; i < 300; i++) shot.update(1 / 60); const ms = (performance.now() - t0) / 300;
    return { calls: on.calls - off.calls, tris: on.tris - off.tris, shadows: renderer.shadowMap.enabled, updateMs: +ms.toFixed(3), blobs: shot.word.mesh.count };
  },
  warm() { const t0 = performance.now(); return shot.warm(renderer, camera).then(() => +(performance.now() - t0).toFixed(0)); },
  info() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, progs: renderer.info.programs?.length, simT, text: rig.text, shot: !!rig.shot }; },
  state() { return { phase: shot.phase, text: shot.text, hinted: shot.hinted, wordPhase: shot.word.phase, blobs: shot.word.rows.map((r) => r.n), shot: rig.shot ? { t: +rig.shot.t.toFixed(2), launched: rig.shot.launched, landed: rig.shot.landed } : null }; },
};
const DEMO = { word: { typed: 'beautifull', right: 'beautiful' }, sentence: { typed: 'i usually get up at seven', right: 'I usually get up at seven o\'clock.' } };
for (const b of document.querySelectorAll('#panel button')) b.addEventListener('click', () => {
  const a = b.dataset.a, L = window.lab;
  if (a === 'hide') document.getElementById('panel').classList.toggle('hidden');
  else if (a === 'word' || a === 'sentence') L.next(a);
  else if (a === 'next') L.next();
  else if (a === 'right') { if (shot.phase === 'typing') { if (!shot.text) for (const c of DEMO[mode].right.toLowerCase().replace(/[^a-z .,?'-]/g, "")) keys._press(c, keys.keyEls.get(c)); L.submit(); } L.resolve({ ok: true, right: shot.text || DEMO[mode].right }); }
  else if (a === 'wrong') { if (shot.phase === 'typing') { if (!shot.text) for (const c of DEMO.word.typed) keys._press(c, keys.keyEls.get(c)); L.submit(); } L.resolve({ ok: false, right: DEMO.word.right }); }
  else if (a === 'pct') { if (shot.phase === 'typing') { if (!shot.text) for (const c of DEMO.sentence.typed) keys._press(c, keys.keyEls.get(c)); L.submit(); } L.resolve({ ok: false, pct: 71, right: DEMO.sentence.right, toks: [{ t: 'I', ok: true }, { t: 'usually', ok: true }, { t: 'get', ok: true }, { t: 'up', ok: true }, { t: 'at', ok: true }, { t: 'seven', ok: true }, { t: "o'clock.", ok: false }] }); }
});
// the game keyboard: its keys drive the shot exactly as the gate flow will wire them
const keys = new PlayKeys(document.getElementById('ui-root'), { mode, color: '#' + G.teamColors[TEAM].getHexString() });
keys.onKey = (k) => shot.key(k);
keys.onBackspace = () => shot.back();
keys.onSubmit = () => window.lab.submit();
keys.onHint = () => { shot.hint(); keys.setHintUsed(true); };
keys.onReplay = () => G.audio?.play?.('ui_click');
window.__kbFrac = keys.frac;
frame('type');
addEventListener('resize', () => { window.__kbFrac = keys.frac; });
window.__labReady = true;
