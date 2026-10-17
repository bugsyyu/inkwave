// 题即玩法 play-9 (docs/LEARN.md §28): the first patch round after the release —
//   · the boss's weak points: a tap-shot's round meets its ball though the boss walks and turns under it while she
//     answers (LEARN §24 拿不准的 11, §27 已知坑 ⑥) — arena/run.js steerRound, flown here with weapons.js's own
//     integrator (a straight phase, then gravity and drag, 60 steps a second; hit.js's sphere test)
// 用法：node --test tests/learn/*.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { WEAPONS } from '../../src/config.js';
import { segSpheres } from '../../src/learn/play/hit.js';
const { steerRound } = await import('../../src/learn/play/arena/run.js');

// ---------------------------------------------------------------------------------------------- the flight
const W = WEAPONS.shooter, DT = 1 / 60, GRAV = 28, DRAG = 0.8, LIFE = 1.2, PAD = 0.15 * 0.6;
const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z, set(a, b, c) { this.x = a; this.y = b; this.z = c; return this; } });
// weapons.js _step's motion, one frame
function stepRound(p) {
  p.age += DT; p.prev.set(p.pos.x, p.pos.y, p.pos.z);
  if (p.age > p.straight) p.vel.y -= p.grav * DT;
  const k = 1 - DRAG * DT * (p.age > p.straight ? 1 : 0); p.vel.x *= k; p.vel.y *= k; p.vel.z *= k;
  p.pos.x += p.vel.x * DT; p.pos.y += p.vel.y * DT; p.pos.z += p.vel.z * DT;
}
// the launch fireShooter gives a round aimed at `at` from `m`: the straight line, its pitch lifted until the arc (the same
// integrator) passes through the point (weapons.js _ballistic, by bisection here)
function launch(m, at) {
  const hd = Math.hypot(at.x - m.x, at.z - m.z), hx = (at.x - m.x) / hd, hz = (at.z - m.z) / hd;
  const yAt = (pitch) => {
    const p = { pos: v3(0, 0, 0), prev: v3(), vel: v3(Math.cos(pitch) * W.projSpeed, Math.sin(pitch) * W.projSpeed, 0), age: 0, straight: W.straightTime, grav: GRAV };
    for (let i = 0; i < 90; i++) { const x0 = p.pos.x, y0 = p.pos.y; stepRound(p); if (p.pos.x >= hd) return y0 + (p.pos.y - y0) * ((hd - x0) / (p.pos.x - x0)); }
    return -1e3;
  };
  let lo = Math.atan2(at.y - m.y, hd) - 0.05, hi = lo + 0.8;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (yAt(mid) < at.y - m.y) lo = mid; else hi = mid; }
  const pitch = (lo + hi) / 2;
  return { pos: v3(m.x, m.y, m.z), prev: v3(m.x, m.y, m.z), vel: v3(hx * Math.cos(pitch) * W.projSpeed, Math.sin(pitch) * W.projSpeed, hz * Math.cos(pitch) * W.projSpeed), age: 0, straight: W.straightTime, grav: GRAV, playTag: 1 };
}
// HULLBREAKER walking at `speed` along its heading and turning at `turn` rad/s; a ball on a socket `off` (its own frame:
// +x its left, +z its front) — world position at time t, and the boss's velocity / turn rate as boss.js keeps them
function bossAt(B, t, off, out) {
  const yaw = B.yaw + B.turn * t, s = Math.sin(yaw), c = Math.cos(yaw);
  const bx = B.x + Math.sin(B.yaw) * B.speed * t, bz = B.z + Math.cos(B.yaw) * B.speed * t;
  out.x = bx + off.x * c + off.z * s; out.y = B.y + off.y; out.z = bz - off.x * s + off.z * c;
  return { bx, bz, vx: Math.sin(B.yaw) * B.speed, vz: Math.cos(B.yaw) * B.speed };
}
// one shot: aimed at where the ball is on the frame it leaves (as _fire does), flown frame by frame — the ball moves
// first (the learn update), then (steer) the round is steered, then it steps against the ball's sphere
function fly(B, off, r, m, steer) {
  const c = v3(); bossAt(B, 0, off, c);
  const p = launch(m, c), sph = [{ x: 0, y: 0, z: 0, r, target: 0 }], lead = v3();
  let gap = Infinity;
  for (let f = 1; p.age < LIFE; f++) {
    const k = bossAt(B, f * DT, off, c);
    if (steer) { const w = B.turn, ox = c.x - k.bx, oz = c.z - k.bz; lead.set(k.vx + w * oz, 0, k.vz - w * ox); steerRound(p, c, lead); }
    stepRound(p);
    sph[0].x = c.x; sph[0].y = c.y; sph[0].z = c.z;
    if (segSpheres(p.prev, p.pos, PAD, sph)) return { hit: true, t: p.age };
    gap = Math.min(gap, Math.hypot(p.pos.x - c.x, p.pos.y - c.y, p.pos.z - c.z) - r - PAD);
    if (p.pos.y < -3) break;
  }
  return { hit: false, gap };
}

test('a tap-shot meets its weak-point ball while the boss walks and turns (steerRound) — and without it, it flew wide: the play-8 whole 周考 miss', () => {
  // the sockets a ball hangs on (eyes 1.3 m apart ~4.4 m up over its front, the belly, the cannon), 0.5 m balls (the
  // smallest: bossBall); her muzzle 4–11 m in front of it and off to its sides; the boss still, walking (2.9 m/s, its
  // phase-1 pace) every way, turning both ways (1.25 rad/s) and both at once
  const socks = [{ x: 0.65, y: 4.6, z: 2.3 }, { x: -0.65, y: 4.6, z: 2.3 }, { x: 0, y: 2.6, z: 2.6 }, { x: 0, y: 4.2, z: 2.9 }];
  let n = 0, missOld = 0, missNew = 0, worst = null;
  for (const dist of [4, 6, 8, 9.5, 11]) for (const side of [-0.6, 0, 0.6]) for (const heading of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) for (const speed of [0, 2.9]) for (const turn of [0, 1.25, -1.25]) for (const off of socks) {
    const B = { x: 0, y: 0, z: 0, yaw: heading, speed, turn };
    const m = { x: Math.sin(side) * dist, y: 1.05, z: Math.cos(side) * dist };
    // (the boss's front is its heading — the sockets are in its own frame; she never stands under a ball: its body is
    // in the way — 3 m flat at least)
    { const c0 = v3(); bossAt(B, 0, off, c0); if (Math.hypot(c0.x - m.x, c0.z - m.z) < 3) continue; }
    const old = fly(B, off, 0.5, m, false), now = fly(B, off, 0.5, m, true);
    n++; if (!old.hit) missOld++;
    if (!now.hit) { missNew++; if (!worst || now.gap > worst.gap) worst = { dist, side, heading, speed, turn, off, gap: now.gap }; }
    if (speed === 0 && turn === 0) assert.ok(old.hit, `a still boss: the aimed round meets the ball without any steering (${dist} m, ${JSON.stringify(off)})`);
  }
  assert.equal(missNew, 0, `steered: every one of ${n} shots meets its ball (worst ${JSON.stringify(worst)})`);
  assert.ok(missOld > n * 0.05, `unsteered, a walking / turning boss carries the ball off the round's line (${missOld} / ${n} missed) — the play-8 whole 周考's first-shot misses`);
});

test('steerRound: never steers a round already past its ball or standing still; a still ball it leaves on its line', () => {
  const p = { pos: v3(0, 1, 0), vel: v3(0, 0, 30), age: 0.2, straight: 0.13, grav: 28 };
  assert.equal(steerRound(p, v3(0, 1, -2)), false, 'past it');
  assert.deepEqual([p.vel.x, p.vel.y, p.vel.z], [0, 0, 30], '… its velocity untouched');
  assert.equal(steerRound({ pos: v3(), vel: v3(0, 0, 0.5), age: 0, straight: 0, grav: 0 }, v3(0, 0, 5)), false, 'not moving');
  // a ball dead ahead on a gravity-free line: the velocity stays pointed at it, its speed kept
  const q = { pos: v3(0, 1, 0), vel: v3(0, 0, 30), age: 0, straight: 1, grav: 28 };
  assert.ok(steerRound(q, v3(0, 1, 9)));
  assert.ok(Math.abs(q.vel.z - 30) < 1e-9 && Math.abs(q.vel.x) < 1e-9 && Math.abs(q.vel.y) < 1e-9, JSON.stringify(q.vel));
});

// ---------------------------------------------------------------------------------------------- halyard's ramp
test('the runner never steers off a ramp for an outer lane: halyard\'s way down from the middle deck to a three-lane row (LEARN §27 拿不准的 17)', async () => {
  const { LEARN, OFFLINE_MAPS } = await import('../../src/config.js');
  const { loadWeek } = await import('../../src/learn/content.js');
  const { planDay } = await import('../../src/learn/design.js');
  const { loopRoute } = await import('../../src/learn/forms/common.js');
  const { buildTrack, straighten, clearWidths, roomAt, at, fallRoom } = await import('../../src/learn/play/runner/track.js');
  const { entriesOf, planCourse } = await import('../../src/learn/play/runner/rows.js');
  const { laneCenters } = await import('../../src/learn/play/runner/lanes.js');
  const { RunnerFlow } = await import('../../src/learn/play/runner/runner.js');
  const { MAP_LAYOUTS } = await import('../../src/world/maps.js');
  const { Level } = await import('../../src/world/level.js');
  const { Physics } = await import('../../src/game/physics.js');
  const { NavGraph } = await import('../../src/game/nav.js');
  const { layoutFor } = await import('../../src/world/variants.js');
  const R = LEARN.runner, m = OFFLINE_MAPS.find((x) => x.id === 'halyard');
  const L = new Level(layoutFor(MAP_LAYOUTS[m.layout || m.id], 'turf'), []), P = new Physics(L), nav = new NavGraph(L, P);
  const pad0 = L.spawnPads[0], pad1 = L.spawnPads[1];
  const start = nav.nearest({ x: pad0.x, y: pad0.y, z: pad0.z }, 2, true);
  const dx = -pad1.x, dz = -pad1.z, dl = Math.hypot(dx, dz) || 1, pull = (L.spawnBarrier || 4) + 3;
  const goal = nav.nearest({ x: pad1.x + (dx / dl) * pull, y: pad1.y, z: pad1.z + (dz / dl) * pull }, 3, false);
  const route = loopRoute(nav, start, goal, { avoid: LEARN.race.laneAvoid });
  const et = (a, b) => nav.edgeType(a, b);
  const T = buildTrack(nav.nodes, route.loop, { keep: straighten(nav, route.loop, { edgeType: et }), edgeType: et }), W = clearWidths(nav, T);
  const C = planCourse(entriesOf(planDay(await loadWeek(1), 3, 'race').gates), T, W, R);
  // every row whose last metres before the run-in come down a ramp (the road there more than 0.3 m off the run-in's floor
  // and narrower than the lanes) — halyard's middle deck has one each lap
  const ramps = C.rows.filter((r) => r.lanes != null && (() => { const sr = r.s - R.runIn, y0 = at(T, sr, {}).y; for (let u = sr - 6; u < sr; u += T.step) { const q = roomAt(T, W, u, 0.45); if (Math.abs(at(T, u, {}).y - y0) > 0.3 && q.left + q.right < r.lanes * R.laneW - R.gap) return true; } return false; })());
  assert.ok(ramps.length >= 1, 'halyard has a row down a ramp (the middle deck)');
  let checked = 0;
  for (const row of ramps) {
    const centers = laneCenters(row.lanes, R.laneW, row.c), sr = row.s - R.runIn, y0 = at(T, sr, {}).y;
    const F = Object.create(RunnerFlow.prototype);
    Object.assign(F, { T, W, RR: R, phase: 'race', finish: null, latT: 0, _shown: () => ({ s: row.s, centers, sAppear: row.s - 30, kind: 'lanes' }) });
    let reachOuter = false;
    for (let sNow = sr - 6; sNow < sr; sNow += 0.25) for (const La of [1.5, 2.25, 3]) {
      F.sNow = sNow;
      const s = sNow + La, [lo, hi] = F._bounds(s), yAim = at(T, s < sr ? sr : s, {}).y;   // (the floor she aims by)
      // her aim (lo − 0.3 … hi + 0.3, _steer) stays on the ramp wherever past its edge is the sea (no floor) or a floor
      // more than 0.5 m under the row's — she may drop onto the row's own floor beside it, never into the water
      for (let i = Math.round(sNow / T.step); i <= Math.round(s / T.step); i++) {   // (the road's own samples)
        const u = i * T.step, qi = ((i % T.n) + T.n) % T.n;
        if (Math.abs(at(T, u, {}).y - yAim) <= 0.3) continue;
        const q = roomAt(T, W, u, 0.45), fallL = !(W.edgeL[qi] >= yAim - 0.5), fallR = !(W.edgeR[qi] >= yAim - 0.5);
        assert.ok((!fallR || hi <= q.right + 1e-9) && (!fallL || -lo <= q.left + 1e-9), `row ${row.s.toFixed(1)}: at ${sNow.toFixed(2)} (+${La}) the aim ${lo.toFixed(2)}…${hi.toFixed(2)} goes over the ramp's edge into the sea at ${u.toFixed(1)} (${(-q.left).toFixed(2)}…${q.right.toFixed(2)}, falls ${fallL}/${fallR})`);
        if (fallL || fallR) checked++;
      }
      if (s >= sr - 1 && hi >= centers[centers.length - 1] && lo <= centers[0]) reachOuter = true;
    }
    assert.ok(reachOuter, `row ${row.s.toFixed(1)}: off the ramp she still aims for either outer lane before the run-in (${centers.join(', ')})`);
  }
  assert.ok(checked > 20, 'the ramp was walked');
  // fallRoom: a level road leaves the room alone; a ramp narrows it, never widens it
  const out = { left: 9, right: 9 };
  fallRoom({ n: 4, step: 1, y: [0, 0, 0, 0] }, { left: [3, 3, 3, 3], right: [3, 3, 3, 3] }, 0, 3, 0, 0.3, 0.45, out);
  assert.deepEqual(out, { left: 9, right: 9 });
  fallRoom({ n: 4, step: 1, y: [0, 1, 0, 0] }, { left: [3, 0.5, 3, 3], right: [3, 1, 3, 3] }, 0, 3, 0, 0.3, 0.45, out);
  assert.ok(Math.abs(out.left - 0.05) < 1e-9 && Math.abs(out.right - 0.55) < 1e-9, JSON.stringify(out));
});
