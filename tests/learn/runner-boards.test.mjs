// 墨浪跑酷's 看板段 (src/learn/play/runner/boards.js, docs/PLAY.md §3 M6 / §5.2, LEARN §23): a checkpoint's word boards,
// sounds and grammar lesson stand along the road in front of its rows — what they say (play-wire's chunking), where they
// stand (off the road, facing her as she comes), which one is framed by where she is on the road, the course reserving
// their stretch; nothing judged or written.
// 用法：node --test tests/learn/runner-boards.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWeek } from '../../src/learn/content.js';
import { planDay } from '../../src/learn/design.js';
import { LEARN } from '../../src/config.js';
import { loopRoute } from '../../src/learn/forms/common.js';
import { entriesOf, planCourse } from '../../src/learn/play/runner/rows.js';
import { buildTrack, straighten, clearWidths, at } from '../../src/learn/play/runner/track.js';
const { boardSpecsOf, withBoards, boardSpots, boardLength, boardAt, BOARDS_MAX } = await import('../../src/learn/play/runner/boards.js');
const { gateSpecs } = await import('../../src/learn/play/wire/boards.js');
const WEEKS = [await loadWeek(1), await loadWeek(2), await loadWeek(3)];
const B = LEARN.runner.boards;

function ringNav(NX = 44, NZ = 30, wide = 5) {
  const nodes = [], cells = new Array(NX * NZ);
  for (let iz = 0; iz < NZ; iz++) for (let ix = 0; ix < NX; ix++) {
    const inner = ix >= wide && ix < NX - wide && iz >= wide && iz < NZ - wide;
    if (inner) { cells[iz * NX + ix] = []; continue; }
    cells[iz * NX + ix] = [nodes.length];
    nodes.push({ id: nodes.length, x: ix, y: 0, z: iz, ix, iz, nb: [], zone: -1, wet: 0 });
  }
  for (const n of nodes) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const jx = n.ix + dx, jz = n.iz + dz; if (jx < 0 || jz < 0 || jx >= NX || jz >= NZ) continue;
    const c = cells[jz * NX + jx]; if (c.length) n.nb.push({ to: c[0], cost: Math.hypot(dx, dz), type: 'walk' });
  }
  const nav = { nodes, cells, x0: 0, z0: 0, step: 1, nx: NX, nz: NZ, valid: new Uint8Array(nodes.length).fill(1),
    nearest(p) { const ix = Math.round(p.x), iz = Math.round(p.z); let best = -1, bd = Infinity; for (let r = 0; r <= 3 && best < 0; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const jx = ix + dx, jz = iz + dz; if (jx < 0 || jz < 0 || jx >= NX || jz >= NZ) continue; for (const id of cells[jz * NX + jx]) { const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = id; } } } return best; },
    edgeType: () => 'walk' };
  const at0 = (x, z) => cells[z * NX + x][0];
  return { nav, start: at0(NX >> 1, 2), goal: at0(NX >> 1, NZ - 3) };
}

test('what the boards say: every race day\'s word boards / sounds / grammar lesson, chunked as the puzzle\'s (play-wire gateSpecs), at most BOARDS_MAX a checkpoint; the reading passage is not here (it is read before the start)', () => {
  let gatesWith = 0, boards = 0;
  for (const w of WEEKS) for (const d of w.days) {
    const L = planDay(w, d.n, 'race');
    for (const g of L.gates) {
      const mech = g.design && g.design.mechanic, specs = boardSpecsOf(g, L);
      if (mech === 'reading-room') { assert.equal(specs.length, 0, 'the passage is the start\'s board'); continue; }
      assert.deepEqual(specs.map((s) => s.kind + ':' + (s.title || '')), gateSpecs(g, L).map((s) => s.kind + ':' + (s.title || '')), `${mech}: the puzzle's boards`);
      assert.ok(specs.length <= BOARDS_MAX);
      if (['word-board', 'symbol-door'].includes(mech)) assert.ok(specs.length >= 1, `${mech} has boards`);
      if (specs.length) { gatesWith++; boards += specs.length; }
    }
  }
  assert.ok(gatesWith >= 20 && boards >= 60, `${gatesWith} checkpoints, ${boards} boards over three weeks`);
});

test('the queue: a 看板段 in front of each checkpoint with boards (before its first row or glide), taking boardLength of road; planCourse reserves it and the checkpoint starts there', () => {
  const L = planDay(WEEKS[0], 3, 'race');
  const counts = L.gates.map((g) => boardSpecsOf(g, L).length);
  const es = withBoards(entriesOf(L.gates, L.signs), counts);
  for (let k = 0; k < L.gates.length; k++) {
    const first = es.findIndex((e) => e.gate === k);
    if (counts[k]) assert.ok(es[first].kind === 'boards' && es[first].n === counts[k] && es[first].len === boardLength(counts[k]), `checkpoint ${k + 1}: boards first`);
    else assert.notEqual(es[first].kind, 'boards');
    assert.equal(es.filter((e) => e.kind === 'boards' && e.gate === k).length, counts[k] ? 1 : 0);
  }
  assert.equal(boardLength(1), B.lead + B.tail); assert.equal(boardLength(3), B.lead + 2 * B.gap + B.tail); assert.equal(boardLength(0), 0);
  const { nav, start, goal } = ringNav();
  const route = loopRoute(nav, start, goal, { avoid: 6 });
  const T = buildTrack(nav.nodes, route.loop, { keep: straighten(nav, route.loop, { edgeType: nav.edgeType }) }), W = clearWidths(nav, T);
  const plan = planCourse(es, T, W, LEARN.runner, { swimSpeed: 11.8 });
  let last = -Infinity;
  for (const r of plan.rows) { const s0 = r.s0 != null ? r.s0 : r.s; assert.ok(s0 >= last - 1e-6, 'in order, never overlapping'); last = r.s1 != null ? r.s1 : r.s; }
  for (let k = 0; k < L.gates.length; k++) if (counts[k]) { const b = plan.rows.find((r) => r.entry.kind === 'boards' && r.entry.gate === k); assert.equal(plan.gateS[k], b.s0, 'the checkpoint (the bots\' die) starts at its boards'); }
});

test('where they stand and which one is framed: off the road on its roomier side, facing back down it; the board she is coming up to (by road length), none past the last', () => {
  const { nav, start, goal } = ringNav();
  const route = loopRoute(nav, start, goal, { avoid: 6 });
  const T = buildTrack(nav.nodes, route.loop, { keep: straighten(nav, route.loop, { edgeType: nav.edgeType }) }), W = clearWidths(nav, T);
  const s0 = 20, spots = boardSpots(T, W, s0, 3), p = {};
  assert.equal(spots.length, 3);
  spots.forEach((sp, k) => {
    assert.ok(Math.abs(sp.s - (s0 + B.lead + k * B.gap)) < 1e-6 && sp.s0 === s0);
    at(T, sp.s, p);
    const off = (sp.x - p.x) * p.rx + (sp.z - p.z) * p.rz;
    assert.ok(Math.abs(off) >= B.side - 1e-6, `board ${k} stands ${off.toFixed(2)} m off the road`);
    const fx = Math.sin(sp.yaw), fz = Math.cos(sp.yaw);
    assert.ok(fx * p.tx + fz * p.tz < -0.7, 'it faces back down the road, towards her as she comes');
    assert.ok(Math.hypot(sp.view.x - p.x, sp.view.z - p.z) < 1e-6, 'its viewing spot is on the road beside it');
  });
  assert.equal(boardAt(spots, s0 - 3), -1, 'before the stretch: none');
  assert.equal(boardAt(spots, s0), 0); assert.equal(boardAt(spots, spots[0].s), 0);
  assert.equal(boardAt(spots, spots[0].s + B.past + 0.1), 1, 'past the first: the second');
  assert.equal(boardAt(spots, spots[2].s - 1), 2);
  assert.equal(boardAt(spots, spots[2].s + B.past + 0.1), -1, 'past the last: none (the lens lets go)');
  // ≈ gap / her pace on each board at the 看板段's tide
  const secs = B.gap / (11.8 * B.tide);
  assert.ok(secs > 2.2 && secs < 4, `${secs.toFixed(1)} s a board`);
});

test('the 看板段 judges nothing and writes nothing; the runner slows the bots with her there', () => {
  const src = readFileSync(new URL('../../src/learn/play/runner/boards.js', import.meta.url), 'utf8').replace(/\/\/.*$/gm, '');
  assert.ok(!/recordFirst|\bjudge\(|judgeAnswer|_judgeRecord/.test(src), 'boards.js judges nothing');
  const run = readFileSync(new URL('../../src/learn/play/runner/runner.js', import.meta.url), 'utf8');
  assert.match(run, /row\.kind === 'boards'\) \{ k = R\.boards\.tide; fair = R\.boards\.tide; \}/, 'the tide and the bots: the same slow');
});

test('the chase lens over a prop (play-4): a collider between the lens and her or the row cranes it up and in on a spring, never a jump; clear again, it lets down; a station\'s pose is never lifted', async () => {
  const THREE = await import('three');
  const { G } = await import('../../src/core/ctx.js');
  const { RunnerCam } = await import('../../src/learn/play/runner/cam.js');
  const { nav, start, goal } = ringNav();
  const route = loopRoute(nav, start, goal, { avoid: 6 });
  const T = buildTrack(nav.nodes, route.loop, { keep: straighten(nav, route.loop, { edgeType: nav.edgeType }) });
  const keep = { camera: G.camera, physics: G.physics, settings: G.settings };
  let blocked = true;
  G.camera = new THREE.PerspectiveCamera(60, 390 / 844, 0.1, 500); G.settings = { fov: 82 };
  G.physics = { los: () => !blocked, cameraProbe: (p, d, len, r, out) => { out.soft = out.hard = len; return out; } };
  try {
    const cam = new RunnerCam(); cam.take({ mode: 'follow', path: null, zoom: 0, fovKick: 0 });
    const p = {}; at(T, 10, p);
    const her = { pos: new THREE.Vector3(p.x, 0, p.z), vel: new THREE.Vector3(p.tx * 7, 0, p.tz * 7), grounded: true };
    let prev = null, maxStep = 0;
    const run = (n) => { for (let i = 0; i < n; i++) { cam.update(1 / 60, her, T, 10, 390 / 844); const c = G.camera.position.clone(); if (prev) maxStep = Math.max(maxStep, c.distanceTo(prev)); prev = c; } };
    blocked = false; run(240); const y0 = G.camera.position.y; maxStep = 0;   // (settled behind her first)
    blocked = true; run(90);
    assert.ok(cam.lift.x > 0.9 && G.camera.position.y > y0 + 1.8, `cranes up over the prop: lift ${cam.lift.x.toFixed(2)}, +${(G.camera.position.y - y0).toFixed(2)} m`);
    assert.ok(maxStep < 0.12, `a spring, not a jump: ${maxStep.toFixed(3)} m a frame at most`);
    assert.ok(cam.occl.blocked >= 90 && cam.occl.frames >= 330);
    blocked = false; run(240);
    assert.ok(cam.lift.x < 0.05, `lets down once the line is clear: ${cam.lift.x.toFixed(3)}`);
    // a station's pose (the typing rig, a framed board) is never lifted
    blocked = true; const pose = { pos: new THREE.Vector3(p.x + 1, 2, p.z), look: new THREE.Vector3(p.x, 1, p.z + 3), fov: 52 };
    for (let i = 0; i < 90; i++) cam.update(1 / 60, her, T, 10, 390 / 844, null, null, pose);
    assert.ok(cam.lift.x < 0.05, 'no lift under a station\'s pose');
  } finally { Object.assign(G, keep); }
});
