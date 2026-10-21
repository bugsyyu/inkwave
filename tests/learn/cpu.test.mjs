// 每帧和「一下子」的 CPU 浪费（LEARN §52）: the rules the fixes stand on, checked on the real code with stand-ins for
// what they drive — the slow frame's sub-steps (Match.update, Actor._finishFrame, the boss, the runner's wrapper).
// 用法：node --test tests/learn/*.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
const THREE = await import('three');
const { G } = await import('../../src/core/ctx.js');
const { Match } = await import('../../src/game/match.js');
const { Actor } = await import('../../src/game/actor.js');
const { Boss } = await import('../../src/boss/boss.js');
const { BossMode } = await import('../../src/boss/bossMode.js');
const { RunnerFlow } = await import('../../src/learn/play/runner/runner.js');
const { emit } = await import('../../src/core/ctx.js');

G.teamColors = [new THREE.Color('#ff8a14'), new THREE.Color('#2a6bff')];
G.teamHex = ['#ff8a14', '#2a6bff'];

// a 2D canvas that records what is drawn on it (Node has none): every method a no-op, counted by name
function recCanvas() {
  const calls = {};
  const ctx = new Proxy({ calls, createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4), width: w, height: h }) }, {
    get(o, k) { if (k in o) return o[k]; return (...a) => { calls[k] = (calls[k] || 0) + 1; void a; }; },
    set(o, k, v) { o[k] = v; return true; },
  });
  return { width: 0, height: 0, getContext: () => ctx, ctx };
}

// ---------------------------------------------------------------------------------------------- 慢帧子步
// a stand-in squidkid for Match.update: its brain, its body (update(dt, pose)), all logged in order
function standIn(log, name, x) {
  return {
    name, alive: true, remote: false, pos: new THREE.Vector3(x, 0, 0), intent: { move: new THREE.Vector3() },
    bot: { update: (dt) => log.push(['brain', name, dt]) },
    update: (dt, pose) => log.push(['body', name, dt, pose]),
  };
}
function matchWith(log, actors) {
  const m = Object.create(Match.prototype);
  Object.assign(m, { learn: { update: (dt) => log.push(['level', dt]) }, paused: false, stateT: 0, state: 'playing', solo: true, actors,
    bossMode: { update: (dt, pose) => log.push(['boss', dt, pose]) } });
  m._push = () => log.push(['push']);
  return m;
}

test('慢帧子步：the level, the clock and the brains once a frame; moving in two steps; the poses once, for the whole frame', () => {
  const log = [], dt = 1 / 30;
  const m = matchWith(log, [standIn(log, 'her', 0), standIn(log, 'bot', 9)]);
  m.update(dt, 2);
  assert.deepStrictEqual(log, [
    ['level', dt], ['brain', 'her', dt], ['brain', 'bot', dt],
    ['body', 'her', dt / 2, -1], ['body', 'bot', dt / 2, -1], ['boss', dt / 2, -1], ['push'],
    ['body', 'her', dt / 2, dt], ['body', 'bot', dt / 2, dt], ['boss', dt / 2, dt], ['push'],
  ]);
  assert.ok(Math.abs(m.stateT - dt) < 1e-12, 'the clock ran once, the whole frame');
});

test('慢帧子步：a frame under 1/45 s is one step, in the order it always ran (the audits\' frozen 1/60 never changes)', () => {
  const log = [], dt = 1 / 60;
  matchWith(log, [standIn(log, 'her', 0), standIn(log, 'bot', 9)]).update(dt);
  assert.deepStrictEqual(log, [['level', dt], ['brain', 'her', dt], ['brain', 'bot', dt], ['body', 'her', dt, dt], ['body', 'bot', dt, dt], ['boss', dt, dt], ['push']]);
  // paused: the level only (its stations wait themselves)
  const l2 = [], m2 = matchWith(l2, [standIn(l2, 'her', 0)]); m2.paused = true; m2.update(dt, 2);
  assert.deepStrictEqual(l2, [['level', dt]]);
});

test('慢帧子步：main.js hands the frame to Match.update whole (no loop of whole updates any more)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
  assert.match(src, /m\.update\(dt, dt > 1 \/ 45 \? 2 : 1\)/);
  assert.doesNotMatch(src, /for \(let i = 0; i < sub; i\+\+\) m\.update/);
});

// a real Actor on a stand-in character: what _finishFrame hands the character
class StandInKid {
  constructor() { this.root = new THREE.Object3D(); this.poses = []; this.hurts = 0; }
  setHurt() { this.hurts++; }
  update(dt) { this.poses.push(dt); }
  setVisible() {}
}
test('慢帧子步：a squidkid is moved on every step, posed once, by the frame\'s dt', () => {
  const a = new Actor({ team: 0, name: 'her', CharacterClass: StandInKid });
  a.pos.set(1, 2, 3); a.vel.set(4, 0, 0);
  a._finishFrame(1 / 60, -1);
  assert.deepStrictEqual(a.character.poses, [], 'an earlier step: no pose');
  assert.deepStrictEqual(a.character.root.position.toArray(), [1, 2, 3], '… but the body is where the step left it');
  a.pos.set(1.1, 2, 3);
  a._finishFrame(1 / 60, 1 / 30);
  assert.deepStrictEqual(a.character.poses, [1 / 30], 'the last step: one pose, for the whole frame');
  assert.deepStrictEqual(a.character.root.position.toArray(), [1.1, 2, 3]);
  a._finishFrame(1 / 60);
  assert.deepStrictEqual(a.character.poses, [1 / 30, 1 / 60], 'a plain call poses as it always did');
  a._finishFrame(0, 0);
  assert.deepStrictEqual(a.character.poses, [1 / 30, 1 / 60, 0], 'a zero-length frame still poses (as before)');
});

test('慢帧子步：the boss fights on every step; its model and the crablets\' once a frame', () => {
  const log = [];
  const b = Object.create(Boss.prototype);
  Object.assign(b, { match: { state: 'playing' }, sim: true, bt: 0, _paintBt: 0, visible: true, dead: false,
    brain: { update: (dt) => { log.push(['brain', dt]); b.bt += dt; } },
    hz: { dead: 0, paint: () => log.push(['paint']), update: (dt) => log.push(['hazards', dt]), fizzle() {} },
    _events: () => log.push(['events']), _crabVisuals: (dt) => log.push(['crabs', dt]), _pushActors: () => log.push(['push']),
    _modelUpdate: (dt) => log.push(['model', dt]), _flushRain: (dt) => log.push(['rain', dt]) });
  b.live = () => true;
  const mode = Object.create(BossMode.prototype); Object.assign(mode, { match: { follower: false, state: 'playing', setState() {} }, boss: b });
  mode.update(1 / 60, -1); mode.update(1 / 60, 1 / 30);
  assert.deepStrictEqual(log.filter((e) => e[0] === 'model' || e[0] === 'crabs'), [['crabs', 1 / 30], ['model', 1 / 30]]);
  assert.equal(log.filter((e) => e[0] === 'brain').length, 2, 'the fight: both steps');
  assert.equal(log.filter((e) => e[0] === 'push').length, 2, 'pushing squidkids off its body: both steps');
  log.length = 0; mode.update(1 / 60);
  assert.deepStrictEqual(log.filter((e) => e[0] === 'model' || e[0] === 'crabs'), [['crabs', 1 / 60], ['model', 1 / 60]], 'a plain call: as before');
});

test('慢帧子步：the runner\'s wrapper passes the step on; its camera moves once a frame', () => {
  const calls = [];
  const flow = Object.create(RunnerFlow.prototype);
  Object.assign(flow, { swimK: 1, slowT: 0, _after: (dt, pose) => calls.push(['after', dt, pose]) });
  const a = { update(dt, pose) { calls.push(['body', dt, pose]); } };
  flow._install(a);
  a.update(1 / 60, -1); a.update(1 / 60, 1 / 30); a.update(1 / 60);
  assert.deepStrictEqual(calls, [['body', 1 / 60, -1], ['after', 1 / 60, -1], ['body', 1 / 60, 1 / 30], ['after', 1 / 60, 1 / 30], ['body', 1 / 60, 1 / 60], ['after', 1 / 60, 1 / 60]]);
  // _after itself: on a super jump only the camera, and only once a frame (by the frame's dt)
  const cams = [];
  const f2 = Object.create(RunnerFlow.prototype);
  Object.assign(f2, { match: { local: { alive: true, superJumpState: { phase: 'flight' } } }, T: {}, sNow: 5, cam: { update: (dt) => cams.push(dt) } });
  f2._aspect = () => 0.46;
  f2._after(1 / 60, -1); f2._after(1 / 60, 1 / 30);
  assert.deepStrictEqual(cams, [1 / 30]);
});

// ---------------------------------------------------------------------------------------------- 屏幕外的角色
const { OFF_HZ, maySee } = await import('../../src/game/actor.js');
test('屏幕外的角色：posed every frame in view (and hers always); out of view at OFF_HZ with the time caught up; back in view: at once', () => {
  const cam = new THREE.PerspectiveCamera(52, 390 / 844, 0.1, 500);   // (at the origin, looking down −z)
  cam.updateMatrixWorld();
  const was = { cam: G.camera, t: G.time };
  G.camera = cam; G.time = 0;
  try {
    const kid = (x, z, isLocal = false) => { const a = new Actor({ team: 0, name: 'k', isLocal, CharacterClass: StandInKid }); a.pos.set(x, 0, z); return a; };
    const ahead = kid(0, -12), behind = kid(0, 30), hers = kid(0, 30, true), edge = kid(0, -12), walker = kid(0, 30);
    // (edge: just past the frustum's side — within the margin a turn of the camera in a frame could bring in)
    const half = Math.atan(Math.tan((26 * Math.PI) / 180) * cam.aspect);
    edge.pos.set(Math.tan(half) * 12 + 2.5, 0, -12);
    const all = [ahead, behind, hers, edge, walker], dt = 1 / 60;
    for (let f = 0; f < 60; f++) {
      G.time += dt;
      if (f === 41) walker.pos.set(0, 0, -15);   // she turns to him: he is in view from this frame on
      for (const a of all) a._finishFrame(dt, dt);
    }
    const sum = (a) => a.character.poses.reduce((x, y) => x + y, 0);
    assert.equal(ahead.character.poses.length, 60, 'in view: every frame');
    assert.equal(hers.character.poses.length, 60, 'her own: every frame, wherever the camera looks');
    assert.equal(edge.character.poses.length, 60, 'just past the edge: as if in view (the margin)');
    assert.equal(behind.character.poses.length, 60 / (60 / OFF_HZ), `out of view: ${OFF_HZ} Hz`);
    assert.ok(behind.character.poses.every((d) => Math.abs(d - 1 / OFF_HZ) < 1e-9), 'each pose catches up by the whole time it missed');
    assert.ok(Math.abs(sum(behind) - 1) < 1e-9 && Math.abs(sum(walker) - 1) < 1e-9, 'not a moment lost (1 s of poses each)');
    const k = walker.character.poses.length;
    assert.ok(k >= 19 + 10 && k <= 19 + 11, `walker: ${OFF_HZ} Hz, then every frame from the frame he is in view (${k} poses)`);
    assert.equal(maySee({ x: 0, y: 0, z: -40 }), true); assert.equal(maySee({ x: 0, y: 0, z: 40 }), false);
  } finally { G.camera = was.cam; G.time = was.t; }
});

// ---------------------------------------------------------------------------------------------- 实例缓冲
const { Projectiles } = await import('../../src/game/weapons.js');
const { FX } = await import('../../src/fx/fx.js');
test('实例缓冲：nothing in the air — the shots\' mesh is not drawn, nothing uploaded; three in the air — only their part goes up', () => {
  const P = new Projectiles(new THREE.Scene()), B = P.blobs;
  const v0 = B.instanceMatrix.version, s0 = P.blobShape.version;
  P.list.length = 0; P._draw(); P._draw();
  assert.equal(B.visible, false, 'not drawn (an instanced draw of none still set its program up, in every pass)');
  assert.equal(B.instanceMatrix.version, v0, 'not uploaded'); assert.equal(P.blobShape.version, s0);
  const shot = (z) => ({ delay: 0, vel: new THREE.Vector3(0, 0, 20), pos: new THREE.Vector3(0, 1, z), start: new THREE.Vector3(0, 1, 0), age: 0.2, life: 1, size: 0.1, seed: 0.3, sats: 0, owner: { color: G.teamColors[0] } });
  P.list.push(shot(2), shot(4), shot(6));
  P._draw();
  assert.equal(B.visible, true); assert.equal(B.count, 3);
  assert.deepStrictEqual(B.instanceMatrix.updateRanges, [{ start: 0, count: 3 * 16 }], 'three matrices, not seven hundred');
  assert.deepStrictEqual(B.instanceColor.updateRanges, [{ start: 0, count: 3 * 3 }]);
  assert.deepStrictEqual(P.blobShape.updateRanges, [{ start: 0, count: 3 * 4 }]);
  assert.ok(B.instanceMatrix.version > v0 && P.blobShape.version > s0, 'uploaded');
  P.list.length = 0; P._draw();
  assert.equal(B.visible, false, 'gone: not drawn again');
});

test('实例缓冲：the effects\' pools — an empty one is not drawn and not uploaded; a burst draws its pool and uploads only its part', () => {
  const fx = new FX(new THREE.Scene()), cam = new THREE.PerspectiveCamera();
  const pools = [fx.dMesh, fx.rings.mesh, fx.shells.mesh, fx.beams.mesh];
  fx.update(1 / 60, cam);
  for (const m of pools) assert.equal(m.visible, false, `${m.name}: empty, not drawn`);
  const vers = pools.map((m) => m.geometry.userData.dyn.map((a) => a.version).join(','));
  fx.update(1 / 60, cam);
  assert.deepStrictEqual(pools.map((m) => m.geometry.userData.dyn.map((a) => a.version).join(',')), vers, 'and nothing uploaded');
  fx.ring(new THREE.Vector3(0, 0, -5), new THREE.Vector3(0, 1, 0), G.teamColors[0], {});
  fx.update(1 / 60, cam);
  const R = fx.rings;
  assert.equal(R.mesh.visible, true, 'a ring: its pool drawn');
  for (const a of R.geo.userData.dyn) assert.deepStrictEqual(a.updateRanges.map((r) => r.count), [R.geo.instanceCount * a.itemSize], 'only the live part');
  assert.equal(fx.shells.mesh.visible, false, 'the others still not');
});

// ---------------------------------------------------------------------------------------------- 跑酷每答对一题的 flood
const { rowCells } = await import('../../src/learn/play/runner/runner.js');
// the old scan (inkwave 088c6dd runner.js _floodRow), verbatim but for its inputs
function oldRowCells(L, ids, corners, y0, y1) {
  const cells = [];
  const inPoly = (x, z) => { let ins = false; for (let i = 0, j = 3; i < 4; j = i++) { const [xi, zi] = corners[i], [xj, zj] = corners[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins; } return ins; };
  for (const bid of ids) {
    const b = L.blocks[bid];
    for (let fi = 0; fi < 6; fi++) {
      const f = b.faces[fi] >= 0 ? L.faces[b.faces[fi]] : null;
      if (!f || !f.atlas || !f.turf || f.grid == null || f.n.y < 0.6) continue;
      for (let j = 0; j < f.nv; j++) for (let i = 0; i < f.nu; i++) {
        const su = (i + 0.5) * f.cu, sv = (j + 0.5) * f.cv;
        const x = f.origin.x + f.u.x * su + f.v.x * sv, y = f.origin.y + f.u.y * su + f.v.y * sv, z = f.origin.z + f.u.z * su + f.v.z * sv;
        if (y < y0 || y > y1 || !inPoly(x, z)) continue;
        cells.push(f.grid + j * f.nu + i);
      }
    }
  }
  return cells;
}
// a made-up stretch of road: blocks whose faces are decks, ramps and walls (u, v orthonormal, n = u × v), grids end to end
function roadLevel(rnd) {
  const faces = [], blocks = [];
  let grid = 0;
  for (let b = 0; b < 6; b++) {
    const fs = [];
    for (let k = 0; k < 6; k++) {
      const yaw = rnd() * Math.PI * 2, tilt = k === 5 ? 1.2 : rnd() < 0.3 ? rnd() * 0.5 : 0;   // (k 5: a wall-ish face, skipped)
      const u = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw)), v0 = new THREE.Vector3(-Math.sin(yaw), 0, Math.cos(yaw));
      const v = v0.clone().multiplyScalar(Math.cos(tilt)).add(new THREE.Vector3(0, Math.sin(tilt), 0));
      const n = new THREE.Vector3().crossVectors(v, u).normalize();
      if (n.y < 0) n.negate();
      const cu = 0.2 + rnd() * 0.15, cv = 0.2 + rnd() * 0.15, nu = 20 + ((rnd() * 120) | 0), nv = 20 + ((rnd() * 200) | 0);
      const f = { origin: new THREE.Vector3((rnd() - 0.5) * 30, (rnd() - 0.5) * 2, (rnd() - 0.5) * 30), u, v, n, cu, cv, nu, nv, su: nu * cu, sv: nv * cv, grid, atlas: rnd() < 0.95 ? {} : null, turf: rnd() < 0.95 };
      grid += nu * nv; fs.push(faces.length); faces.push(f);
    }
    blocks.push({ faces: fs });
  }
  return { faces, blocks };
}
// a row's quad as _floodRow makes it: 6 m along the road, its lanes across, round a point on it
function rowQuad(rnd) {
  const px = (rnd() - 0.5) * 20, pz = (rnd() - 0.5) * 20, yaw = rnd() * Math.PI * 2, tx = Math.sin(yaw), tz = Math.cos(yaw), rx = tz, rz = -tx;
  const half = (3 * 1.6) / 2 + 0.6, c = (rnd() - 0.5) * 2;
  return [[-2.5, -half], [3.5, -half], [3.5, half], [-2.5, half]].map(([f, l]) => [px + tx * f + rx * (c + l), pz + tz * f + rz * (c + l)]);
}
test('跑酷的 flood：rowCells inks the very cells the old scan did, in the same order — decks, ramps, walls, rows at any angle', () => {
  let seed = 7;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  let n = 0, cells = 0;
  for (let k = 0; k < 24; k++) {
    const L = roadLevel(rnd), ids = L.blocks.map((_, i) => i);
    for (let r = 0; r < 6; r++) {
      const corners = rowQuad(rnd), y = (rnd() - 0.5) * 1.5;
      const want = oldRowCells(L, ids, corners, y - 1.2, y + 1.2), got = rowCells(L, ids, corners, y - 1.2, y + 1.2);
      assert.deepStrictEqual(got, want, `level ${k}, row ${r}`);
      n++; cells += want.length;
    }
  }
  assert.ok(cells > 10000, `${n} rows, ${cells} cells inked — the same`);
});

test('跑酷的 flood：and in a fraction of the time (same rows, same process, CPU)', () => {
  let seed = 11;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  const L = roadLevel(rnd), ids = L.blocks.map((_, i) => i), rows = Array.from({ length: 30 }, () => rowQuad(rnd));
  const cpu = (fn) => { const c = process.cpuUsage(); fn(); const d = process.cpuUsage(c); return (d.user + d.system) / 1000; };
  for (const q of rows.slice(0, 3)) { oldRowCells(L, ids, q, -1.2, 1.2); rowCells(L, ids, q, -1.2, 1.2); }
  const before = cpu(() => { for (const q of rows) oldRowCells(L, ids, q, -1.2, 1.2); });
  const now = cpu(() => { for (const q of rows) rowCells(L, ids, q, -1.2, 1.2); });
  assert.ok(now * 4 <= before, `30 rows: ${now.toFixed(1)} ms of CPU (the old scan: ${before.toFixed(1)} ms)`);
});

// ---------------------------------------------------------------------------------------------- 其余：听者、排名表
const { AudioEngine } = await import('../../src/audio/audio.js');
test('听者：the ears\' nine params are scheduled when they move or turn, not every frame they stand still', () => {
  let calls = 0;
  const param = () => ({ setTargetAtTime() { calls++; } });
  const listener = {}; for (const k of ['positionX', 'positionY', 'positionZ', 'forwardX', 'forwardY', 'forwardZ', 'upX', 'upY', 'upZ']) listener[k] = param();
  const eng = Object.create(AudioEngine.prototype); Object.assign(eng, { ctx: { currentTime: 0, listener }, L: { x: 0, y: 0, z: 0 } });
  const pos = new THREE.Vector3(1, 2, 3), fwd = new THREE.Vector3(0, 0, -1), up = new THREE.Vector3(0, 1, 0);
  eng.setListener(pos, fwd, up);
  assert.equal(calls, 9, 'the first frame: all nine');
  for (let f = 0; f < 60; f++) eng.setListener(pos, fwd, up);
  assert.equal(calls, 9, 'a second standing still: none (it was 540)');
  pos.x += 0.005; eng.setListener(pos, fwd, up);
  assert.equal(calls, 9, 'half a centimetre: none');
  pos.x += 0.05; eng.setListener(pos, fwd, up);
  assert.equal(calls, 12, 'a step: the position only');
  fwd.set(Math.sin(0.02), 0, -Math.cos(0.02)); eng.setListener(pos, fwd, up);
  assert.equal(calls, 18, 'a turn of ~1°: forward and up');
  assert.deepStrictEqual(eng.L, { x: pos.x, y: 2, z: 3 }, 'where the ears are is kept every frame (distances, the low-pass)');
});

// a few elements are all FormsUi.setRank touches (Node has no DOM): children, text, className — each write counted
function tinyDom() {
  const D = { writes: 0, made: 0 };
  const el = () => {
    D.made++;
    const e = { children: [], parent: null, _cls: '', _t: '', classList: { add() {}, remove() {}, toggle() {} }, style: {}, dataset: {},
      get className() { return this._cls; }, set className(v) { this._cls = String(v); D.writes++; },
      get textContent() { return this.children.length ? this.children.map((c) => c.textContent).join('') : this._t; },
      set textContent(v) { this.children = []; this._t = String(v); D.writes++; },
      appendChild(c) { c.parent = this; this.children.push(c); D.writes++; return c; },
      get lastChild() { return this.children[this.children.length - 1] || null; },
      remove() { const p = this.parent; if (p) { p.children.splice(p.children.indexOf(this), 1); this.parent = null; D.writes++; } },
      setAttribute() {}, addEventListener() {} };
    return e;
  };
  D.document = { createElement: el, createTextNode: (t) => ({ textContent: String(t), parent: null, remove() {} }) };
  return D;
}
test('排名表：the race\'s standings keep their rows; only what changed is written (nothing while they stand)', async () => {
  const { FormsUi } = await import('../../src/learn/forms/ui.js');
  const D = tinyDom(), prev = globalThis.document;
  globalThis.document = D.document;
  try {
    const ui = Object.create(FormsUi.prototype);
    ui.rank = D.document.createElement('div');
    const rows = (me, a, b) => [{ name: '你', me: true, cp: me, total: 4 }, { name: 'Mika', me: false, cp: a, total: 4 }, { name: 'Ren', me: false, cp: b, total: 4, finish: b >= 4 ? 30 : null }];
    ui.setRank(rows(1, 1, 0));
    const text = () => ui.rank.children.map((r) => r.textContent).join(' | ');
    assert.equal(text(), '1你 1/4 | 2Mika 1/4 | 3Ren 0/4');
    const made = D.made, w0 = D.writes;
    for (let k = 0; k < 20; k++) ui.setRank(rows(1, 1, 0));   // (ten seconds of a race where nobody passed a checkpoint)
    assert.equal(D.writes, w0, 'standing still: not one write'); assert.equal(D.made, made, 'and nothing built');
    ui.setRank(rows(2, 1, 0));
    assert.equal(text(), '1你 2/4 | 2Mika 1/4 | 3Ren 0/4');
    assert.equal(D.writes - w0, 1, 'her checkpoint: one text'); assert.equal(D.made, made);
    ui.setRank([{ name: 'Ren', me: false, cp: 4, total: 4, finish: 30 }, { name: '你', me: true, cp: 2, total: 4 }]);
    assert.equal(text(), '1Ren 到了 | 2你 2/4');
    assert.equal(ui.rank.children[1].className, 'is-me'); assert.equal(ui.rank.children[0].className, '');
    ui.setRank(null);
    assert.equal(ui.rank.children.length, 0, 'gone');
  } finally { if (prev === undefined) delete globalThis.document; else globalThis.document = prev; }
});

// ---------------------------------------------------------------------------------------------- 小地图
const { Minimap } = await import('../../src/game/minimap.js');
// a real Minimap on a 2 × 2 m stage (4 × 4 px), its canvases recording what is drawn on them; the static layers stay
// unbuilt (the raster pass needs a real level) and the ink field has no cells — the gating is what is under test
function tinyMap() {
  const prev = globalThis.document;
  globalThis.document = { createElement: () => recCanvas() };
  let mm;
  try { mm = new Minimap({ bounds: { minX: 0, maxX: 2, minZ: 0, maxZ: 2 }, spawnPads: [] }, { version: 0, grid: new Uint8Array(4) }, 2); }
  finally { if (prev === undefined) delete globalThis.document; else globalThis.document = prev; }
  mm._built = true;   // (its idle-time build never runs)
  const N = mm.w * mm.h;
  Object.assign(mm, { pixCell: new Int32Array(N).fill(-1), pixFx: new Uint8Array(N), pixFy: new Uint8Array(N), pixSx: new Int32Array(N), pixSy: new Int32Array(N), owner: new Uint8Array(N) });
  return mm;
}
const inkDraws = (mm) => mm.ictx.calls.putImageData || 0, blits = (mm) => mm.ctx.calls.drawImage || 0;
function stage() {
  G.match = { attract: false, zones: null, actors: [] }; G.local = null;
  G.projectiles = { clouds: [], bombs: [] }; G.subs = { items: [] }; G.specials = { world: [], drawMap() {} };
}

test('小地图：off the screen nothing is drawn; the first frame back draws the whole ink at once, quietly, and composes', () => {
  stage();
  const mm = tinyMap();
  for (let f = 0; f < 3; f++) mm.update(1 / 60);
  const i0 = inkDraws(mm), b0 = blits(mm);
  assert.ok(i0 >= 1 && b0 >= 2, 'shown: its ink drawn, composed');
  emit('bomb:explode', { pos: { x: 1, z: 1 }, team: 1, radius: 2 });   // (a mark made while it is hidden ages away meanwhile)
  for (let f = 0; f < 120; f++) { mm.paint.version++; mm.idle(1 / 60); }   // two seconds hidden, the ink changing all along
  assert.equal(inkDraws(mm), i0, 'hidden: not one band of ink'); assert.equal(blits(mm), b0, 'hidden: no compose (no upload)');
  mm.update(1 / 60);
  assert.equal(inkDraws(mm), i0 + 1, 'the first frame shown: the whole ink in one go');
  assert.equal(blits(mm), b0 + 2, '… composed that same frame (base + ink, no flash layer)');
  assert.ok(mm.flashT >= 0.45, 'quietly: no flash for what changed while it was hidden');
});

test('小地图：on the screen it composes only when the picture would change — new ink, something moving', () => {
  stage();
  const mm = tinyMap();
  for (let f = 0; f < 6; f++) mm.update(1 / 60);
  const c0 = mm.composed;
  for (let f = 0; f < 90; f++) mm.update(1 / 60);
  assert.equal(mm.composed, c0, 'a still map for 1.5 s: not composed again (it was 30 times)');
  mm.paint.version++;
  for (let f = 0; f < 12; f++) mm.update(1 / 60);
  assert.ok(mm.composed >= c0 + 1 && mm.composed <= c0 + 2, `new ink (drawn in 3 bands): composed ${mm.composed - c0}× (the bands may straddle a compose)`);
  const c1 = mm.composed;
  G.projectiles.bombs.push({ pos: { x: 1, z: 1 }, team: 1, kind: 'bomb', fuse: -1, age: 0 });
  for (let f = 0; f < 60; f++) mm.update(1 / 60);
  assert.equal(mm.composed - c1, 20, 'a bomb on the map: its ~20 Hz');
  G.projectiles.bombs.length = 0;
  for (let f = 0; f < 60; f++) mm.update(1 / 60);
  assert.equal(mm.composed - c1, 20, 'gone: still again');
});

test('小地图：main.js draws it only when it is on the screen (the setting, a level\'s is-nomap, the strike map)', async () => {
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../src/main.js', import.meta.url), 'utf8');
  const hud = src.slice(src.indexOf('  _updateHud(dt) {'));
  assert.match(hud, /const mapOn = \(this\.settings\.minimap !== false \|\| strikeAim\) && !this\.hud\.el\?\.classList\.contains\('is-nomap'\);/);
  assert.match(hud, /if \(mapOn\) this\.minimap\.update\(dt\); else this\.minimap\.idle\(dt\);/);
  assert.match(hud, /map: mapOn \? \{ canvas: this\.minimap\.canvas/);
  assert.equal((hud.match(/this\.minimap\.update\(/g) || []).length, 1, 'no other call draws it');
});

// ---------------------------------------------------------------------------------------------- 首答的存储写
const { store, setBackend } = await import('../../src/learn/store.js');
const WB = await import('../../src/learn/workbench.js');
const { loadWeek, daySteps } = await import('../../src/learn/content.js');
const { ielts } = await import('../../src/learn/ielts.js');

// awkward JSON: keys an array index would sort first, keys that need escapes, numbers at the edges, nested arrays
function randomValue(rnd, depth) {
  const k = rnd();
  if (depth > 3 || k < 0.35) {
    const p = rnd();
    if (p < 0.2) return [0, -0, 1e21, 5e-324, -1.5e-7, 123456789.123, 2 ** 53 + 2][(rnd() * 7) | 0];
    if (p < 0.5) return ['', 'th 的音', 'a"b\\c', 'line\nbreak\t', '  ', '😀', '\ud800', '</script>'][(rnd() * 8) | 0];
    if (p < 0.65) return rnd() < 0.5;
    if (p < 0.75) return null;
    return Math.round((rnd() - 0.5) * 1e6) / 100;
  }
  if (k < 0.55) return Array.from({ length: (rnd() * 4) | 0 }, () => randomValue(rnd, depth + 1));
  const o = {};
  for (let i = 0, n = (rnd() * 5) | 0; i < n; i++) o[['0', '10', '2', '-1', '1.5', 'é', 'k"q', 'ev-2026-10-12', '__proto_', 'toString'][(rnd() * 10) | 0] + (rnd() < 0.5 ? '' : i)] = randomValue(rnd, depth + 1);
  return o;
}
test('首答的存储写：blobText is JSON.stringify, byte for byte — awkward keys and values, shared parts, base or none', () => {
  let seed = 99;
  const rnd = () => { seed = (seed * 1103515245 + 12345) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < 400; i++) {
    const o = randomValue(rnd, 0);
    const blob = Object.assign(o && typeof o === 'object' && !Array.isArray(o) ? o : { x: o }, { profile: { v: 1, n: i } });
    if (i % 3) blob.base = Object.assign({ '7': { v: 2 } }, randomValue(rnd, 1) || {});
    if (i % 7 === 0) blob.base = [1, 2];   // (not an object: as JSON.stringify writes it)
    if (i % 11 === 0) { blob.f = () => 1; blob.u = undefined; }
    assert.equal(WB.blobText(blob), JSON.stringify(blob), `case ${i}`);
    // a copy sharing its parts (a push's), one document replaced: still the same text as JSON.stringify
    const base2 = Object.assign({}, typeof blob.base === 'object' && !Array.isArray(blob.base) ? blob.base : {}, { 'ev-2026-10-19': { v: 2, it: { a: { '2026-10-19': { '101500': [1, 'L'] } } } } });
    const blob2 = Object.assign({}, blob, { base: base2 });
    assert.equal(WB.blobText(blob2), JSON.stringify(blob2), `case ${i}, the copy`);
  }
});

// her blob the way localBlob() writes it, with a season of evidence in base (a made-up learner)
function seasonBlob() {
  const base = { world: { v: 3, seed: 7, born: { '2026-10-12': 1 } }, 'plan-2026-10': { v: 2, d: { '15': { ok: true } } } };
  for (let w = 0; w < 10; w++) {
    const mon = new Date(Date.UTC(2026, 7, 3 + w * 7)).toISOString().slice(0, 10), it = {};
    for (let i = 0; i < 60; i++) it['w:word' + i] = { [mon]: { ['0' + (8 + (i % 10)) + '1500']: [i % 3 ? 1 : 0, 'L'] } };
    base['ev-' + mon] = { v: 2, it };
  }
  return JSON.stringify({ profile: { v: 1, setup: true, examType: 'A', target: 7, startDate: '2026-08-03', accent: 'us', ci: { w1d2: { mood: 'ok', note: '连读还不熟', date: '2026-10-14' } } },
    days: { '2026-10': { days: { '13': { done: { 'c:w1d1:a1': { m: 35, k: 'pron' } }, extra: [] } } } }, logs: {}, mistakes: {}, notes: { n1: { t: '记一条', at: '2026-10-14' } },
    mocks: {}, packs: {}, essays: {}, teacher: {}, reviews: {}, base });
}
function memLs(init) {
  const m = new Map(Object.entries(init)), writes = [];
  return { m, writes, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { writes.push([k, String(v)]); m.set(k, String(v)); } };
}
// the old pushEvidence's text (inkwave 088c6dd: the blob as stored, parsed; base merged; JSON.stringify of the copy)
function oldPushText(ls, docs, M) {
  const o = JSON.parse(ls.getItem(WB.DATA_KEY));
  const r = WB.mergeEvidence(o.base && typeof o.base === 'object' && !Array.isArray(o.base) ? o.base : {}, docs, M);
  return r.changed.length ? JSON.stringify(Object.assign({}, o, { base: r.base })) : null;
}
test('首答的存储写：every write to her account is the old text, byte for byte — answer after answer, a new week, the page writing in between', async () => {
  const { Model } = await ielts();
  const w1 = await loadWeek(1), items = daySteps(w1, 1).flatMap((s) => s.items).filter((x) => x.meta.scored);
  const ls = memLs({ [WB.DATA_KEY]: seasonBlob(), [WB.PREF_KEY]: JSON.stringify({ tz: 'sin', accent: 'us' }) });
  setBackend(ls); store.load();
  let pushes = 0, same = 0;
  const push = (at) => {
    const want = oldPushText(ls, store.exportDocs(), Model), n0 = ls.writes.filter(([k]) => k === WB.DATA_KEY).length;
    const r = store.pushToWorkbench({ at });
    assert.equal(r.ok, true);
    const ws = ls.writes.filter(([k]) => k === WB.DATA_KEY);
    if (want == null) { assert.equal(ws.length, n0, 'nothing new: nothing written'); return; }
    assert.equal(ws.length, n0 + 1, 'one write');
    assert.equal(ws[ws.length - 1][1], want, 'the very text the old push wrote');
    pushes++; if (ws[ws.length - 1][1] === want) same++;
  };
  const days = ['2026-10-12', '2026-10-13', '2026-10-15', '2026-10-19', '2026-10-20'];
  for (let i = 0; i < 14; i++) {
    const it = items[i % items.length], day = days[Math.floor(i / 3)];
    store.recordFirst({ itemId: it.id, ok: i % 4 !== 1, pct: it.kind === 'dict' ? 80 + i : undefined, day, at: `${day}T09:${String(10 + i).padStart(2, '0')}:00+08:00` });
    push(`${day}T12:00:00+08:00`);
    if (i === 5) {   // the lesson page wrote her blob in between (its own spacing: the next push reads it afresh)
      const o = JSON.parse(ls.m.get(WB.DATA_KEY)); o.notes.n2 = { t: '又一条', at: day };
      ls.m.set(WB.DATA_KEY, JSON.stringify(o, null, 1));
    }
    if (i === 9) push(`${day}T12:30:00+08:00`);   // (again at once: nothing new)
  }
  assert.ok(pushes >= 10 && same === pushes, `${same} / ${pushes} writes the same as before`);
  setBackend(null);
});

// the game never modifies her parsed blob (what blobText's reuse stands on): the evidence path over a deep-frozen one
const deepFreeze = (v) => { if (v && typeof v === 'object' && !Object.isFrozen(v)) { Object.freeze(v); for (const k of Object.keys(v)) deepFreeze(v[k]); } return v; };
test('首答的存储写：her parsed blob is never modified by the game (first answers, due, progress, pushes, a check-in) — it is frozen here', async () => {
  const w1 = await loadWeek(1), items = daySteps(w1, 1).flatMap((s) => s.items).filter((x) => x.meta.scored);
  const ls = memLs({ [WB.DATA_KEY]: seasonBlob(), [WB.PREF_KEY]: JSON.stringify({ tz: 'sin' }) });
  const parse = JSON.parse;
  let frozen = 0;
  JSON.parse = function (t, r) { const v = parse(t, r); if (v && typeof v === 'object' && v.profile) { frozen++; deepFreeze(v); } return v; };   // (her blob only)
  // (and what a push leaves as her blob — its copy, the merged documents — frozen before the next one reads it)
  const freezeHeld = () => { const b = WB.readBlob(ls); if (b) deepFreeze(b.o); };
  try {
    setBackend(ls); store.load();
    for (let i = 0; i < 6; i++) {
      store.recordFirst({ itemId: items[i].id, ok: true, day: '2026-10-15', at: `2026-10-15T09:0${i}:00+08:00` });
      store.due(w1, '2026-10-15'); store.progress(w1, 1);
      assert.equal(store.pushToWorkbench({ at: '2026-10-15T12:00:00+08:00' }).ok, true);
      freezeHeld();
    }
    const ck = WB.saveCheckin(ls, 'w1d3', { mood: 'hard', note: '想问老师' }, '2026-10-15T21:30:00+08:00', { step: { id: 'c3', m: 5, k: 'review' } });
    assert.equal(ck.ok, true);
    store.recordFirst({ itemId: items[7].id, ok: false, day: '2026-10-16', at: '2026-10-16T09:00:00+08:00' });
    store.due(w1, '2026-10-16');
    assert.equal(store.pushToWorkbench({ at: '2026-10-16T12:00:00+08:00' }).ok, true);
    freezeHeld();
    assert.ok(frozen >= 2, `her blob was parsed (and frozen) ${frozen}× — at the start and after the check-in`);
    assert.ok(Object.isFrozen(WB.readBlob(ls).o.base['ev-2026-08-03']), 'what it holds is frozen');
  } finally { JSON.parse = parse; setBackend(null); }
});

test('首答的存储写：the mirror sends what the game wrote without parsing it again', async () => {
  const ls = memLs({ [WB.DATA_KEY]: seasonBlob() });
  const sent = [];
  globalThis.__IELTS_NATIVE = { platform: 'ios' };
  globalThis.webkit = { messageHandlers: { ielts: { postMessage: (m) => sent.push(m) } } };
  const parse = JSON.parse; let parses = 0;
  try {
    setBackend(ls); WB._reset();
    const b = WB.readBlob(ls, { fresh: true });
    JSON.parse = function (t, r) { if (typeof t === 'string' && t.length > 10000) parses++; return parse(t, r); };
    assert.equal(WB.mirror(ls, true), true);
    assert.equal(sent.length, 1); assert.equal(sent[0].text, b.raw, 'the blob, exactly as stored');
    assert.equal(parses, 0, 'not parsed again (it is the one readBlob holds)');
    ls.m.set(WB.DATA_KEY, ls.m.get(WB.DATA_KEY).replace('"setup":true', '"setup":false'));   // (written by someone else)
    WB.mirror(ls, true);
    assert.equal(sent.length, 2); assert.equal(parses, 1, 'someone else\'s text is parsed to check it has a profile');
    ls.m.set(WB.DATA_KEY, '{"x":1}');
    assert.equal(WB.mirror(ls, true), false, 'no profile: not sent');
  } finally { JSON.parse = parse; delete globalThis.__IELTS_NATIVE; delete globalThis.webkit; setBackend(null); WB._reset(); }
});
