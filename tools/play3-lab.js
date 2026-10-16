// INKWAVE play-3 lab — 节拍台 M3 · 展板路 M6 · 回声亭 M7 · 翻牌靶 M8 · 路标 (src/learn/play/{beat,board,echo,flip}/) in the game's
// own renderer (src/core/renderer.js: the same post stack and grade), environment, FX and squidkid, on the real course
// (content/w1.json through content.js, judged by engine.js — nothing is written to her evidence here).
//   ?m=beat&n=2|4 · ?m=board · ?m=read · ?m=echo · ?m=flip · ?m=signs
//   ?stage=tidewater   the real Tidewater Level + PaintSystem (slow under software GL); default: a light deck
//   ?quality=low|medium|high · ?reduced · ?shadows=0 · ?bloom=0
// Scripted control (headless): window.lab — freeze() / step(ms) / render() run a fixed-step sim clock; per mechanic:
//   beat: ask(i) · hop(pad, offFromDownbeatS) · tap(x, y) · swipe(dx, dy) · key(k) · silent() · state()
//   board / read / echo / signs: walk(x, z) · tap(x, y) · hotspots() · state()
//   flip: tapCard() · rate(k) · next()
//   measure() → draw calls / triangles the mechanic adds · warm() · info()
import * as THREE from 'three';
import { Renderer } from '../src/core/renderer.js';
import { Environment } from '../src/world/environment.js';
import { QUALITY, DEFAULT_SETTINGS, TEAM_PALETTES, LEARN } from '../src/config.js';
import { G, emit } from '../src/core/ctx.js';
import { Character } from '../src/game/character.js';
import { loadWeek, daySteps, prompt, judge } from '../src/learn/api.js';
import { BeatStage } from '../src/learn/play/beat/stage.js';
import { beatGrid } from '../src/learn/play/beat/clock.js';
import { fontsReady } from '../src/learn/play/board/atlas.js';
import { BoardWalk } from '../src/learn/play/board/walk.js';
import { boardSpots } from '../src/learn/play/board/frame.js';
import { wordsSpec, lessonSpec, noteSpec, passageSpec, soundsSpec } from '../src/learn/play/board/paint.js';
import { EchoBooth } from '../src/learn/play/echo/booth.js';
import { Signs } from '../src/learn/play/board/signs.js';
import { FlipDeck } from '../src/learn/play/flip/deck.js';

const params = new URLSearchParams(location.search);
const qualityName = params.get('quality') || 'high';
const Q = QUALITY[qualityName] || QUALITY.high;
const stageName = params.get('stage') || 'deck';
const reduced = params.has('reduced');
let MECH = params.get('m') || 'beat';
const settings = { ...DEFAULT_SETTINGS, quality: qualityName, shadows: params.get('shadows') !== '0', bloom: params.get('bloom') !== '0', cameraShake: reduced ? 0 : 1 };
G.settings = settings; G.quality = Q; G.emit = emit;

// ------------------------------------------------------------------ renderer + scene (the game's)
const R = new Renderer(document.getElementById('app'), settings);
const renderer = R.renderer;
G.renderer = renderer;
const scene = new THREE.Scene(); G.scene = scene;
const camera = new THREE.PerspectiveCamera(52, innerWidth / innerHeight, 0.15, 6500); G.camera = camera;
R.setScene(scene, camera);
const pal = TEAM_PALETTES[0];
G.teamColors = [new THREE.Color(pal.a), new THREE.Color(pal.b)];
G.teamHex = [pal.a, pal.b];
const TEAM = 0, INK = G.teamColors[TEAM];

// ------------------------------------------------------------------ stage
let level = null, paint = null, levelMat = null;
const ORIGIN = new THREE.Vector3(0, 0, 0);
const deck = new THREE.Group(); scene.add(deck);
let bounds = { minX: -25, maxX: 25, minZ: -44, maxZ: 44 };
if (stageName === 'tidewater') {
  const [{ Level }, { MAP_LAYOUTS }, { PaintSystem }, { createLevelMaterial }, { Physics, Hit }] = await Promise.all([
    import('../src/world/level.js'), import('../src/world/maps.js'), import('../src/world/paint.js'), import('../src/world/levelMaterial.js'), import('../src/game/physics.js')]);
  level = new Level(MAP_LAYOUTS.tidewater);
  const physics = new Physics(level);
  paint = new PaintSystem(renderer, level, { atlasSize: Q.paintAtlas, maxDensity: Q.paintAtlas >= 4096 ? 30 : 18 });
  levelMat = createLevelMaterial(paint.texture, paint.size);
  levelMat.userData.uniforms.uTeamA.value.copy(G.teamColors[0]); levelMat.userData.uniforms.uTeamB.value.copy(G.teamColors[1]);
  const mesh = new THREE.Mesh(level.buildGeometry(paint.size), levelMat);
  mesh.castShadow = mesh.receiveShadow = true; scene.add(mesh);
  G.level = level; G.paint = paint; G.physics = physics;
  bounds = level.bounds;
  const sp = (params.get('at') || '-13,0,4').split(',').map(Number);
  ORIGIN.set(sp[0], sp[1], sp[2]);
  const h = physics.raycast(new THREE.Vector3(ORIGIN.x, 8, ORIGIN.z), new THREE.Vector3(0, -1, 0), 20, new Hit(), true); if (h.hit) ORIGIN.y = h.point.y;
} else {
  // a light deck like fx-lab / type-lab: the harbour slab, a planter, a crate stack, a back wall
  const mat = (c, r = 0.85) => new THREE.MeshStandardMaterial({ color: c, roughness: r });
  const box = (x0, x1, y0, y1, z0, z1, c = '#d8d2c4') => { const m = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), mat(c)); m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); m.castShadow = m.receiveShadow = true; deck.add(m); return m; };
  box(-25, 25, -1.2, 0, -44, 44);
  box(-11, -8.5, 0, 1.1, 9, 13, '#cfd6d8'); box(8, 10.5, 0, 0.8, 7, 10, '#c9a27c'); box(8.3, 9.8, 0.8, 1.6, 7.4, 9.4, '#cf9c88');
  box(-25, 25, 0, 3.6, 21.4, 22, '#ece4d4');
  // paint stand-in (fx-lab's): glossy team-ink discs on the deck where the game would G.paint.splat
  const N = 400, discs = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 24).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ roughness: 0.22, metalness: 0, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), N);
  discs.count = 0; discs.receiveShadow = true; discs.frustumCulled = false; scene.add(discs);
  let next = 0; const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
  G.paint = {
    splat(p, r, team, o = {}) {
      const k = 0.85 + ((o.seed || 0.5) * 0.3);
      m4.compose(new THREE.Vector3(p.x, 0.006 + next * 1e-5, p.z), q4.setFromAxisAngle(up, (o.seed || 0) * 6.28), new THREE.Vector3(r * 1.2 * k, 1, r * k));
      discs.setMatrixAt(next, m4); discs.setColorAt(next, G.teamColors[team] || G.teamColors[0]);
      next = (next + 1) % N; discs.count = Math.max(discs.count, next || N);
      discs.instanceMatrix.needsUpdate = true; if (discs.instanceColor) discs.instanceColor.needsUpdate = true;
      return r * r * 3;
    },
  };
}
const env = new Environment(renderer, scene, { bounds, theme: params.get('theme') || 'day', shadowSize: Q.shadowSize });
scene.environment = env.envMap; G.env = env;
renderer.toneMappingExposure = 0.94;

// ------------------------------------------------------------------ fx + audio
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
  fx.onDropletLand = (point, normal, color, size) => {
    if (!G.paint) return;
    let t = -1; for (let k = 0; k < 2; k++) { const c = G.teamColors[k]; if (Math.abs(c.r - color.r) + Math.abs(c.g - color.g) + Math.abs(c.b - color.b) < 0.05) t = k; }
    if (t >= 0) G.paint.splat(point.clone().addScaledVector(normal, 0.05), Math.min(0.45, Math.max(0.12, size * 2.4)), t, { seed: Math.random() });
  };
  G.fx = fx;
} catch (e) { console.warn('[play3-lab] fx', e); }
try {
  const { audio } = await import('../src/audio/audio.js');
  G.audio = audio;
  const unlock = () => { audio.init(); audio.setVolumes?.({ master: 0.8, music: 0, sfx: 0.85 }); };
  addEventListener('pointerdown', unlock, { once: true, capture: true }); addEventListener('keydown', unlock, { once: true, capture: true });
} catch (e) { console.warn('[play3-lab] audio', e); }

// ------------------------------------------------------------------ her
const character = new Character({ color: INK, weapon: 'shooter', style: { hair: 1, skin: 1 }, name: 'lab', isLocal: true });
scene.add(character.root);
character.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
const actor = { character, pos: ORIGIN.clone(), vel: new THREE.Vector3(), yaw: 0, team: TEAM };
const anim = { time: 0, speed: 0, localMove: { x: 0, z: 0 }, grounded: true, vy: 0, aimPitch: -0.1, firing: false, charge: 0, rolling: false, form: 'kid', wallNormal: null, ink: 0.8, lowInk: false, special: 0, invuln: false, turnRate: 0, hp: 1, inEnemyInk: false, surface: 0, subAim: false };
const walk = { to: null, speed: 3.4 };   // the lab's walk (the game's is her stick / auto-walk)

// ------------------------------------------------------------------ the course
await fontsReady();
const W1 = await loadWeek(1);
const D1 = daySteps(W1, 1);
const stepOf = (type, w = W1, d = 1) => daySteps(w, d).find((s) => s.meta.type === type);

// ------------------------------------------------------------------ the strip stand-in + the voice
const sayEl = document.getElementById('say');
let sayT = 0;
function say(text, { coral = false, ok = false, sub = '', hold = 0 } = {}) {
  sayEl.innerHTML = ''; sayEl.append(document.createTextNode(text || ''));
  if (sub) { const s = document.createElement('small'); s.textContent = sub; sayEl.append(s); }
  sayEl.classList.toggle('on', !!text); sayEl.classList.toggle('coral', !!coral); sayEl.classList.toggle('ink', !!ok);
  sayEl.style.setProperty('--ink', pal.a);
  sayT = hold || 0;
}
function speak(text, o = {}) {
  try { if (typeof speechSynthesis === 'undefined' || !text) return; speechSynthesis.cancel(); const u = new SpeechSynthesisUtterance(text); u.lang = 'en-US'; u.rate = o.slow ? 0.7 : 0.92; speechSynthesis.speak(u); } catch (e) { /* none */ }
}

// ------------------------------------------------------------------ camera: a spring towards each mechanic's framing pose
// (the game hands the same pose to cameraRig's spring; here: a critically damped spring on position, look point and fov)
const cam = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 52, vp: new THREE.Vector3(), vl: new THREE.Vector3(), vf: 0, want: null, rate: 5 };
const _f = new THREE.Vector3();
function followPose(out = {}) {
  const fw = new THREE.Vector3(Math.sin(actor.yaw), 0, Math.cos(actor.yaw));
  out.pos = actor.pos.clone().addScaledVector(fw, -4.6).add(new THREE.Vector3(0, 2.6, 0));
  out.look = actor.pos.clone().addScaledVector(fw, 3).add(new THREE.Vector3(0, 1.1, 0));
  out.fov = 52;
  return out;
}
function camTo(pose, snap = false) {
  cam.want = pose;
  if (snap || reduced) { cam.pos.copy(pose.pos); cam.look.copy(pose.look); cam.fov = pose.fov || 52; cam.vp.set(0, 0, 0); cam.vl.set(0, 0, 0); cam.vf = 0; }
}
function spring(x, v, target, w, dt) {   // exact critically damped step, per component (cameraRig's Spring)
  const d = x - target, e = Math.exp(-w * dt), nx = target + (d + (v + w * d) * dt) * e, nv = (v - w * (v + w * d) * dt) * e;
  return [nx, nv];
}
function camTick(dt) {
  const P = cam.want || followPose();
  for (const k of ['x', 'y', 'z']) {
    [cam.pos[k], cam.vp[k]] = spring(cam.pos[k], cam.vp[k], P.pos[k], cam.rate, dt);
    [cam.look[k], cam.vl[k]] = spring(cam.look[k], cam.vl[k], P.look[k], cam.rate, dt);
  }
  [cam.fov, cam.vf] = spring(cam.fov, cam.vf, P.fov || 52, cam.rate, dt);
  camera.position.copy(cam.pos); camera.lookAt(cam.look);
  camera.fov = cam.fov; camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
camTo(followPose(), true);

// ------------------------------------------------------------------ mechanics
const M = {};
let mech = null;
const grid = beatGrid(LEARN.beat.bpm, 0.0);   // the lab's beat: a steady grid on the sim clock (the game reads music.js)

// ---- 节拍台 M3
M.beat = () => {
  const n = Number(params.get('n') || 2) === 4 ? 4 : 2;
  const step = n === 4 ? stepOf('symbols') : stepOf('pairs');
  const items = step.items;
  const beat = new BeatStage({ scene, camera, team: TEAM, color: INK, reduced });
  beat.gridSource = () => grid;
  beat.mount(actor);
  beat.prepare('gate', items.map((it) => prompt(it).options));
  const S = { items, i: 0, item: null, p: null, last: null, n };
  beat.on.speak = (replay) => { if (S.p) speak(S.p.tts || (S.item.meta.examples && S.item.meta.examples[0].en)); say(S.p.text, { sub: replay ? '再听一遍 — 踩着拍子跳上去' : (S.p.zh || '听完，下一拍跳上去') }); };
  beat.on.answer = (pad, info) => {
    const r = judge(S.item, pad);   // the one judging path (the flow also writes recordFirst — the lab writes nothing)
    S.last = { pad, info, ok: r.ok };
    beat.resolve({ ok: r.ok, right: S.item.answer, canonical: r.canonical + (S.item.options[S.item.answer].zh ? `（${S.item.options[S.item.answer].zh}）` : '') }).then(() => {});
    if (r.ok) say(info.onBeat ? '答对了 · 踩在拍子上！' : '答对了', { ok: true });
  };
  beat.on.defer = () => say('这题放到后面再来', { sub: '没有作答，不记' });
  beat.on.say = (text, o) => say(text, o);
  beat.open({ origin: ORIGIN, yaw: 0, n, aspect: innerWidth / innerHeight, her: actor.pos });
  const api = {
    obj: beat, S, dispose() { beat.dispose(); },
    ask(i = S.i) { S.i = i % items.length; S.item = items[S.i]; S.p = prompt(S.item); say(''); return beat.ask({ key: 'gate', labels: S.p.options, now: simT }); },
    // her hop at the downbeat + off s (freeze() first): steps the sim there, then the input
    hop(pad, off = 0) { const D = beat.round.D; if (simT < D + off) lab.step((D + off - simT) * 1000); return beat.input(pad, simT); },
    tap(x, y) { beat.tapApi.down(x, y, 1); return beat.tapApi.up(x, y, 1, false); },
    swipe(dx, dy, x = innerWidth / 2, y = innerHeight / 2) { beat.tapApi.down(x, y, 2); return beat.tapApi.up(x + dx, y + dy, 2, false); },
    key(k) { return beat.key({ key: k }); },
    pose() { return beat.frame(innerWidth / innerHeight); },
    update(dt) { beat.update(dt, simT); beat.carry(actor); anim.grounded = beat.anim.grounded; anim.vy = beat.anim.vy; anim.speed = beat.anim.speed; },
    measureObjs: () => [beat.group],
    warm: () => beat.warm(renderer, camera, scene),
    state: () => ({ ...beat.state(), last: S.last, log: beat.log.slice(-6) }),
    resize() { beat.relayout(innerWidth / innerHeight); camTo(beat.frame(innerWidth / innerHeight)); },
  };
  camTo(beat.frame(innerWidth / innerHeight));
  api.ask(0);
  return api;
};

// ---- 展板路 M6: ?m=board (the day's five word boards), ?m=read (the grammar lesson, the reading passage, the check-in note)
const uiRoot = document.getElementById('ui-root');
function boardMech(specs) {
  const W = new BoardWalk({ scene, camera, color: pal.a, reduced, root: uiRoot });
  W.on.speak = (text, o) => { speak(text, o); setTimeout(() => o?.onEnd?.(), 1200); };
  W.prepare('gate', specs);
  const route = []; for (let z = -2; z <= 6 + specs.length * LEARN.board.gap; z += 0.5) route.push({ x: ORIGIN.x, y: ORIGIN.y, z: ORIGIN.z + z });
  W.place('gate', boardSpots(route, specs.length));
  actor.yaw = 0; actor.pos.copy(ORIGIN).add(new THREE.Vector3(0, 0, -2));
  return {
    obj: W,
    goto(i) { const L = W.list[i]; actor.pos.set(L.view.x, L.view.y, L.view.z); actor.yaw = L.spot.yaw + Math.PI; walk.to = null; },
    tap(x, y) { const a = W.tapApi.down(x, y, 1); W.tapApi.up(x, y, 1, false); return a; },
    hot(id) { return W.activate(id); },
    hotspots() { const i = W.framed; if (i < 0) return []; return W.set.project(W.list[i].b, camera, innerWidth, innerHeight).map((h) => ({ id: h.id, x: Math.round(h.rect.x), y: Math.round(h.rect.y), w: Math.round(h.rect.w), h: Math.round(h.rect.h) })); },
    update(dt) { W.update(dt, actor.pos, { aspect: innerWidth / innerHeight, speed: walk.to ? walk.speed : 0 }); camTo(W.framing || followPose()); },
    measureObjs: () => [W.set.group],
    warm: () => W.warm(renderer, camera, scene),
    state: () => ({ framed: W.framed, read: W.list.map((L) => L.read), strip: W.strip.isOpen, boards: W.list.map((L) => ({ H: L.b.entry.layout.H, cut: L.b.entry.layout.cut, minFont: L.b.entry.layout.minFont })), framing: W.framing ? { pos: W.framing.pos.toArray().map((v) => +v.toFixed(2)), fits: W.framing.frame.fits, rect: W.framing.frame.rect } : null }),
    dispose() { W.dispose(); },
  };
}
M.board = () => {
  const items = stepOf('words').items, rows = items.map((it) => ({ en: it.en, ipa: it.meta.ipaUs || it.meta.ipa, zh: it.meta.zhFull || it.zh }));
  const specs = []; for (let k = 0; k < rows.length; k += 5) specs.push(wordsSpec(rows.slice(k, k + 5), k / 5 + 1, Math.ceil(rows.length / 5)));
  return boardMech(specs);
};
M.read = () => {
  const g = stepOf('grammar'), r = stepOf('reading'), c = stepOf('checkin'), sy = stepOf('symbols');
  const syRows = sy.items.slice(0, 2).map((it) => ({ ipa: it.en, name: it.meta.name, tip: it.meta.tip, examples: it.meta.examples }));
  return boardMech([passageSpec(r.meta.passage), lessonSpec(g.title, g.meta.lesson), noteSpec(c.title, c.items[0].zh), soundsSpec(syRows, 1, 4)]);
};

// ---- 回声亭 M7: the day's speaking question
M.echo = () => {
  const item = stepOf('speak').items[0];
  const E = new EchoBooth({ scene, camera, color: pal.a, reduced, root: uiRoot });
  E.on.speak = (text, o) => { speak(text, o); say('跟着说 · 说完了就走出亭子', { sub: '不计分 · 评分在经典页' }); setTimeout(() => o?.onEnd?.(), 6000); };
  E.on.done = (d) => say(d.how === 'out' ? '说完了（走出亭子）' : '说完了', { ok: true });
  E.on.classic = () => say('开经典页（评分等语音服务器）');
  const at = ORIGIN.clone().add(new THREE.Vector3(0, 0, 3));
  E.open({ key: 'speak', item, at, yaw: 0 });
  actor.yaw = 0; actor.pos.copy(ORIGIN);
  return {
    obj: E,
    stepIn() { actor.pos.copy(at); walk.to = null; },
    stepOut() { actor.pos.copy(at).add(new THREE.Vector3(0, 0, -3)); },
    tap(x, y) { const a = E.tapApi.down(x, y, 1); E.tapApi.up(x, y, 1, false); return a; },
    hot(id) { return E.walk.activate(id); },
    hotspots() { const W = E.walk; if (W.framed < 0) return []; return W.set.project(W.list[0].b, camera, innerWidth, innerHeight).map((h) => ({ id: h.id, x: Math.round(h.rect.x), y: Math.round(h.rect.y), w: Math.round(h.rect.w), h: Math.round(h.rect.h) })); },
    update(dt) { E.update(dt, simT, actor.pos, { aspect: innerWidth / innerHeight, speed: 0 }); camTo(E.framing || followPose()); },
    measureObjs: () => [E.walk.set.group, E.pads.group],
    warm: () => E.warm(renderer, camera, scene),
    state: () => ({ state: E.state, framed: E.walk.framed, speaking: E.speaking, strip: E.strip.isOpen }),
    dispose() { E.dispose(); },
  };
};

// ---- 路标: the check-in pad, the weekly board, the placement board (day 7's exit area)
M.signs = () => {
  const d7 = daySteps(W1, 7), c = stepOf('checkin');
  const S = new Signs({ scene, camera, color: pal.a, reduced, root: uiRoot });
  S.on.checkin = () => say('这一天走完了 ★', { ok: true });
  S.on.classic = (sg) => say(`开经典页 · ${sg.kind === 'weekly' ? '周报' : sg.kind === 'placement' ? '入门小测' : '打卡'}`);
  const signs = [{ kind: 'checkin', title: c.title, text: c.items[0].zh }, { kind: 'weekly', title: d7.find((s) => s.meta.type === 'weekly').title }, { kind: 'placement', title: d7.find((s) => s.meta.type === 'placement').title }];
  S.prepare('signs', signs);
  S.place('signs', [-4.2, 0, 4.2].map((x) => ({ x: ORIGIN.x + x, y: ORIGIN.y, z: ORIGIN.z + 6, yaw: Math.PI, view: { x: ORIGIN.x + x, y: ORIGIN.y, z: ORIGIN.z + 6 - LEARN.board.view - 0.4 } })));
  actor.yaw = 0; actor.pos.copy(ORIGIN);
  return {
    obj: S,
    goto(i) { const L = S.walk.list[i]; actor.pos.set(L.view.x, L.view.y, L.view.z); actor.yaw = 0; walk.to = null; },
    tap(x, y) { const a = S.tapApi.down(x, y, 1); S.tapApi.up(x, y, 1, false); return a; },
    hot(id) { return S.walk.activate(id); },
    update(dt) { S.update(dt, simT, actor.pos, { aspect: innerWidth / innerHeight, speed: 0 }); camTo(S.framing || followPose()); },
    measureObjs: () => [S.walk.set.group, S.pads.group],
    warm: () => S.warm(renderer, camera, scene),
    state: () => ({ framed: S.walk.framed, checked: S.checked }),
    dispose() { S.dispose(); },
  };
};

// ---- 翻牌靶 M8: the review day's 150 words
M.flip = () => {
  const step = daySteps(W1, 7).find((s) => s.meta.type === 'flash' && s.items.length > 60);
  const D = new FlipDeck({ scene, camera, color: INK, team: TEAM, reduced });
  const S = { items: step.items, i: 0, last: null };
  D.on.speak = (text) => speak(text);
  D.on.rate = (ans) => { S.last = ans; const v = { ok: ans === true }; D.resolve(v); say(ans ? '记得 · 记进进度（自评 F）' : '没关系 — 马上打一遍', { ok: ans, sub: ans ? '' : '（打字蟹接手这个词）' }); };
  D.on.typeIt = (it) => { S.typed = it.id; };
  actor.yaw = 0; actor.pos.copy(ORIGIN);
  const api = {
    obj: D, S,
    ask(i = S.i) { S.i = i % S.items.length; const it = S.items[S.i]; D.prepare(S.items.slice(S.i, S.i + 3)); D.ask({ item: it, at: ORIGIN.clone().add(new THREE.Vector3(0, 0, LEARN.flip.ahead)), yaw: Math.PI, aspect: innerWidth / innerHeight }); say('看中文，想英文 — 点卡片翻过来'); camTo(D.frame(innerWidth / innerHeight)); return it.en; },
    flipCard() { return D.hit('card'); },
    rate(k) { return D.hit(k); },
    tap(x, y) { const a = D.tapApi.down(x, y, 1); D.tapApi.up(x, y, 1, false); return a; },
    targets() { return D.T.project(camera, innerWidth, innerHeight).map((p) => ({ cx: Math.round(p.cx), cy: Math.round(p.cy), r: Math.round(p.r), label: { x: Math.round(p.label.x), y: Math.round(p.label.y), w: Math.round(p.label.w), h: Math.round(p.label.h) } })); },
    update(dt) { D.update(dt); },
    resize() { camTo(D.frame(innerWidth / innerHeight)); },
    measureObjs: () => [D.group],
    warm: () => D.warm(renderer, camera, scene),
    state: () => ({ phase: D.phase, last: S.last, typed: S.typed || null, frame: D.frame(innerWidth / innerHeight).frame.rect }),
    dispose() { D.dispose(); },
  };
  api.ask(0);
  return api;
};

// ------------------------------------------------------------------ clock
let frozen = false, simT = 0, last = performance.now(), fpsT = 0, frames = 0, fps = 0;
const STEP = 1 / 60;
const cost = { sum: 0, max: 0, n: 0 };
function tick(dt) {
  simT += dt; G.time = simT; anim.time = simT;
  if (walk.to) {
    _f.subVectors(walk.to, actor.pos); _f.y = 0; const d = _f.length();
    if (d < 0.05) { walk.to = null; anim.speed = 0; } else { const s = Math.min(d, walk.speed * dt); actor.pos.addScaledVector(_f.normalize(), s); anim.speed = walk.speed; actor.yaw = Math.atan2(_f.x, _f.z); }
  } else if (MECH !== 'beat') anim.speed = 0;
  const c0 = performance.now(); mech?.update?.(dt); const cd = performance.now() - c0; cost.sum += cd; cost.n++; if (cd > cost.max) cost.max = cd;
  character.root.position.copy(actor.pos); character.root.rotation.y = actor.yaw;
  character.update(dt, anim);
  fx?.update(dt, camera);
  if (paint) { paint.flush(dt); levelMat.userData.uniforms.uTime.value = simT; }
  env.update?.(dt, camera);
  if (sayT > 0) { sayT -= dt; if (sayT <= 0) say(''); }
  camTick(dt);
}
function render() { renderer.info.reset(); R.render(); }
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now;
  if (!frozen) { tick(dt); render(); }
  frames++; fpsT += dt; if (fpsT > 0.5) { fps = frames / fpsT; frames = 0; fpsT = 0; }
  const el = document.getElementById('stats'); if (el && !frozen) el.textContent = `${MECH} ${stageName} ${qualityName} · ${fps.toFixed(0)} fps · calls ${renderer.info.render.calls} · tris ${(renderer.info.render.triangles / 1000).toFixed(0)}k`;
}

function start(m) {
  MECH = m;
  mech?.dispose?.();
  mech = M[m] ? M[m]() : null;
  return mech;
}
start(MECH);
requestAnimationFrame(loop);
addEventListener('resize', () => mech?.resize?.());
// the lab's own input: touch / mouse go to the mechanic's tap hook, keys to its key hook (capture phase, as the game will)
addEventListener('pointerdown', (e) => { if (e.target.closest('#panel')) return; mech?.obj?.tapApi?.down(e.clientX, e.clientY, e.pointerId); }, true);
addEventListener('pointerup', (e) => { if (e.target.closest('#panel')) return; mech?.obj?.tapApi?.up(e.clientX, e.clientY, e.pointerId, false); }, true);
addEventListener('keydown', (e) => { if (mech?.obj?.key?.(e)) { e.preventDefault(); e.stopPropagation(); } }, true);

// ------------------------------------------------------------------ scripted control
window.lab = {
  THREE, G, scene, camera, renderer, R, character, actor, anim, grid,
  get mech() { return mech; },
  start,
  freeze() { frozen = true; },
  unfreeze() { frozen = false; last = performance.now(); },
  step(ms = 16) { const n = Math.max(1, Math.round(ms / 1000 / STEP)); for (let i = 0; i < n; i++) tick(STEP); },
  render() { render(); return this.info(); },
  settle(ms = 1500) { this.step(ms); return this.render(); },
  get t() { return simT; },
  walk(x, z) { walk.to = new THREE.Vector3(x, actor.pos.y, z); },
  /** draw calls / triangles the mechanic adds (its objects hidden vs shown, same frame), shadows as set */
  measure() {
    const objs = mech?.measureObjs?.() || [];
    const count = () => { renderer.info.reset(); R.render(); return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles }; };
    const vis = objs.map((o) => o.visible);
    const all = count();
    objs.forEach((o) => { o.visible = false; });
    const none = count();
    objs.forEach((o, i) => { o.visible = vis[i]; });
    return { calls: all.calls - none.calls, tris: all.tris - none.tris, shadows: renderer.shadowMap.enabled, quality: qualityName };
  },
  cost() { const r = { mean: +(cost.sum / Math.max(1, cost.n)).toFixed(3), max: +cost.max.toFixed(3), frames: cost.n }; cost.sum = 0; cost.max = 0; cost.n = 0; return r; },
  warm() { const t0 = performance.now(); return Promise.resolve(mech?.warm?.()).then(() => +(performance.now() - t0).toFixed(0)); },
  info() { return { calls: renderer.info.render.calls, tris: renderer.info.render.triangles, geos: renderer.info.memory.geometries, tex: renderer.info.memory.textures, progs: renderer.info.programs?.length, simT: +simT.toFixed(3) }; },
  state() { return mech?.state?.() || null; },
};
for (const b of document.querySelectorAll('#panel button')) b.addEventListener('click', () => {
  const a = b.dataset.a, L = window.lab;
  if (a === 'hide') document.getElementById('panel').classList.toggle('hidden');
  else if (a === 'beat2' || a === 'beat4') { params.set('n', a === 'beat4' ? '4' : '2'); start('beat'); }
  else if (M[a]) start(a);
  else if (a === 'next') mech?.ask?.((mech.S?.i ?? 0) + 1);
  else if (a === 'right' && MECH === 'beat') mech.hop(mech.S.item.answer, 0);
  else if (a === 'wrong' && MECH === 'beat') mech.hop((mech.S.item.answer + 1) % mech.S.n, 0.3);
  else if ((a === 'right' || a === 'wrong') && MECH === 'flip') { if (mech.obj.phase === 'front') mech.flipCard(); else mech.rate(a === 'right' ? 0 : 1); }
});
window.__labReady = true;
