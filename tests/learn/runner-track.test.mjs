// src/learn/play/runner/track.js + detour.js — 墨浪跑酷's road (docs/PLAY.md §3 M2 「道够不够宽」, §5.2 走远路): the race's
// lap as a smooth closed line, the clearance scan on the nav grid (1 m cells, "a kid can stand here" — no widths), where
// a row of lanes may stand (≥ lanes × 1.5 m, fewer lanes only when it must, never under 2), and the side branch of a
// second wrong answer. On a fixture ring and on every offline stage's real nav graph (Level + Physics + NavGraph in Node).
// 用法：node --test tests/learn/runner-*.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));   // `three` → vendor/ (no npm install here)
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEARN, OFFLINE_MAPS } from '../../src/config.js';
import { loadWeek } from '../../src/learn/content.js';
import { planDay } from '../../src/learn/design.js';
import { loopRoute } from '../../src/learn/forms/common.js';
import { buildTrack, straighten, clearWidths, rowFit, placeRow, project, at, walkY, roomAt } from '../../src/learn/play/runner/track.js';
import { detourBranch, branchLine } from '../../src/learn/play/runner/detour.js';
import { laneCenters } from '../../src/learn/play/runner/lanes.js';
import { entriesOf, planCourse } from '../../src/learn/play/runner/rows.js';

const R = LEARN.runner;

// a fixture nav grid shaped like the stage code's: a ring corridor `wide` cells wide round a solid block, 1 m cells,
// one node per cell at y 0 — with the fields track.js reads (x0 z0 step nx nz cells nodes valid) and nearest()
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
  return { nav, start: at0(NX >> 1, 2), goal: at0(NX >> 1, NZ - 3), NX, NZ, wide };
}

test('a fixture ring: the lap is a closed smooth line; the clearance scan reads the corridor; rows fit its straights, 4 lanes do not, corners never', () => {
  const { nav, start, goal, wide } = ringNav();
  const route = loopRoute(nav, start, goal, { avoid: 6 });
  assert.ok(route && route.loop[0] === route.loop[route.loop.length - 1], 'a lap');
  const keep = straighten(nav, route.loop, { edgeType: nav.edgeType });
  assert.ok(keep.length < route.loop.length / 3, `string-pulled: ${keep.length} of ${route.loop.length} vertices kept`);
  const T = buildTrack(nav.nodes, route.loop, { keep });
  assert.ok(T.len > 100 && T.n === Math.round(T.len / T.step), 'lap ' + T.len.toFixed(1));
  // closed: the end runs into the start
  const a = at(T, T.len - 0.01, {}), b = at(T, 0, {});
  assert.ok(Math.hypot(a.x - b.x, a.z - b.z) < 0.6, 'the line closes');
  // tangents are unit, right is the camera-right of a squidkid facing down the road
  for (let i = 0; i < T.n; i += 17) { const p = at(T, i * T.step, {}); assert.ok(Math.abs(Math.hypot(p.tx, p.tz) - 1) < 1e-6); assert.ok(Math.abs(p.rx * p.tx + p.rz * p.tz) < 1e-6); }
  // project ∘ at = identity (s and the lateral offset)
  for (const s of [5, 40.3, 77.7]) { const p = at(T, s, {}); const q = project(T, p.x + p.rx * 1.1, p.z + p.rz * 1.1, s - 1, 4, 8, {}); assert.ok(Math.abs(q.s - s) < 0.3 && Math.abs(q.d - 1.1) < 0.15, JSON.stringify(q)); }
  const W = clearWidths(nav, T);
  // the walkable band of a 5-cell corridor is ~5 m (cell centres 0..4 plus half a cell each side); on the straights
  const widths = []; for (let i = 0; i < T.n; i++) widths.push(W.left[i] + W.right[i]);
  widths.sort((x, y) => x - y);
  const med = widths[widths.length >> 1];
  assert.ok(med >= wide - 0.6 && med <= wide + 0.6, 'median clear width ' + med);
  let fit2 = 0, fit3 = 0, fit4 = 0;
  for (let i = 0; i < T.n; i++) { const s = i * T.step; if (rowFit(T, W, s, 2).ok) fit2++; if (rowFit(T, W, s, 3).ok) fit3++; if (rowFit(T, W, s, 4).ok) fit4++; }
  assert.ok(fit2 > T.n * 0.4 && fit3 > T.n * 0.3, `2 lanes ${fit2}, 3 lanes ${fit3} of ${T.n}`);
  assert.equal(fit4, 0, 'four lanes need 5.5 m of band: never in a 5 m corridor');
  // a 4-option row: one lane fewer (the right option always stays — rows.js), never two fewer when three fit
  const P = placeRow(T, W, 20, 4, { laneW: R.laneW, gap: R.gap });
  assert.equal(P.lanes, 3, JSON.stringify(P));
  // every placed row: its lanes' curtains on walkable cells over the run-in
  for (let s = 0; s < T.len; s += 9) {
    const q = placeRow(T, W, s, 3, { laneW: R.laneW, gap: R.gap });
    assert.ok(q && q.lanes >= 2 && q.s >= s, 'placed at ' + s);
    for (const t of [q.s - R.runIn, q.s]) { const p = at(T, t, {}); for (const c of laneCenters(q.lanes, R.laneW, q.c)) assert.ok(!Number.isNaN(walkY(nav, p.x + p.rx * c, p.z + p.rz * c, 0)), `lane centre walkable at ${t.toFixed(1)}`); }
  }
  // the room between rows keeps her off the edges
  const room = roomAt(T, W, 30); assert.ok(room.left >= 0 && room.right >= 0 && room.left + room.right <= W.left[60] + W.right[60]);
});

test('every offline stage: the race\'s lap as the runner\'s road — clear widths scanned, a race day\'s rows all placed (≥ 2 lanes, mostly every lane), side branches for 走远路', async () => {
  const { MAP_LAYOUTS } = await import('../../src/world/maps.js');
  const { Level } = await import('../../src/world/level.js');
  const { Physics } = await import('../../src/game/physics.js');
  const { NavGraph } = await import('../../src/game/nav.js');
  const { layoutFor } = await import('../../src/world/variants.js');
  const w1 = await loadWeek(1);
  const level = planDay(w1, 3, 'race');
  const entries = entriesOf(level.gates);
  const report = [];
  for (const m of OFFLINE_MAPS) {
    const L = new Level(layoutFor(MAP_LAYOUTS[m.layout || m.id], 'turf'), []), P = new Physics(L), nav = new NavGraph(L, P);
    const pad0 = L.spawnPads[0], pad1 = L.spawnPads[1];
    const start = nav.nearest({ x: pad0.x, y: pad0.y, z: pad0.z }, 2, true);
    const dx = -pad1.x, dz = -pad1.z, dl = Math.hypot(dx, dz) || 1, pull = (L.spawnBarrier || 4) + 3;
    const goal = nav.nearest({ x: pad1.x + (dx / dl) * pull, y: pad1.y, z: pad1.z + (dz / dl) * pull }, 3, false);
    const route = loopRoute(nav, start, goal, { avoid: LEARN.race.laneAvoid });
    const et = (a, b) => nav.edgeType(a, b);
    const T = buildTrack(nav.nodes, route.loop, { keep: straighten(nav, route.loop, { edgeType: et }), edgeType: et });
    assert.ok(T.len > 120, m.id + ': lap ' + T.len.toFixed(0));
    const W = clearWidths(nav, T);
    let zero = 0; for (let i = 0; i < T.n; i++) if (W.left[i] + W.right[i] === 0) zero++;
    assert.ok(zero / T.n < 0.08, m.id + ': the smoothed road stays on the grid (' + zero + ' of ' + T.n + ' samples off it)');
    const C = planCourse(entries, T, W, R);
    const rows = C.rows.filter((r) => r.lanes != null);
    assert.equal(rows.length, entries.filter((e) => e.kind !== 'glide').length, m.id + ': every choice item has a row');
    let full = 0, minus1 = 0, two = 0;
    for (const r of rows) {
      const n = r.entry.item.options.length, want = Math.min(n, r.lanes >= 3 || n <= 3 ? n : 3);
      assert.ok(r.lanes >= 2 && r.lanes <= n, m.id + ': lanes ' + r.lanes + ' of ' + n);
      assert.ok(rowFit(T, W, r.s, r.lanes, { laneW: R.laneW, gap: R.gap }).ok, m.id + ': the row fits where it stands');
      const p = at(T, r.s, {});
      for (const c of laneCenters(r.lanes, R.laneW, r.c)) assert.ok(!Number.isNaN(walkY(nav, p.x + p.rx * c, p.z + p.rz * c, p.y, 0.9)), m.id + ': a lane centre on the grid');
      if (r.lanes === n) full++; else if (r.lanes === n - 1) minus1++; else two++;
      void want;
    }
    assert.ok(full >= rows.length * 0.5, m.id + `: most rows keep every option (${full} / ${rows.length})`);
    assert.ok(two <= rows.length * 0.1, m.id + `: a row seldom drops to two lanes (${two})`);
    for (let k = 1; k < C.gateS.length; k++) if (C.gateS[k] != null && C.gateS[k - 1] != null) assert.ok(C.gateS[k] > C.gateS[k - 1], m.id + ': checkpoints in order');
    // 走远路: side branches off the lap — from the road, back onto it, mostly off it, longer than the stretch they skip
    let found = 0, tried = 0;
    const want = LEARN.race.detour * 11.8 * R.detour.tide;
    for (let s = 12; s < T.len - 32; s += 18) {
      tried++;
      const B = detourBranch(nav, T, s, { want, reach: R.detour.reach, away: R.detour.away });
      if (!B) continue;
      found++;
      assert.ok(B.len >= 1.35 * B.reach && B.away >= 0.45, m.id + ': a real way round ' + JSON.stringify({ len: B.len, reach: B.reach, away: B.away }));
      const p0 = at(T, s, {}), p1 = at(T, B.sJoin, {}), a = B.pts[0], b = B.pts[B.pts.length - 1];
      assert.ok(Math.hypot(a.x - p0.x, a.z - p0.z) < 2.5 && Math.hypot(b.x - p1.x, b.z - p1.z) < 2.5, m.id + ': leaves and rejoins the road');
      const line = branchLine(B.pts); assert.ok(Math.abs(line.len - B.len) < B.len * 0.2);
    }
    assert.ok(found >= 1, m.id + `: at least one side branch (${found} / ${tried})`);
    report.push(`${m.id}: lap ${T.len.toFixed(0)} m · rows ${rows.length}: all lanes ${full}, one fewer ${minus1}, two ${two} · course ${(C.end / T.len).toFixed(1)} laps · branches ${found}/${tried}`);
  }
  assert.equal(report.length, OFFLINE_MAPS.length);
});
