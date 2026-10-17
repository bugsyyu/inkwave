// play-fix (docs/LEARN.md §22 「更新（play-fix）」): the beat stage's spot keeps off the props and is seen from its camera;
// the typing frame fits the real band; 「我的写法也对」 on the puzzle's typed sentences is held until she decides.
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));   // `three` → vendor/ (no npm install here)
import test from 'node:test';
import assert from 'node:assert/strict';
import { OFFLINE_MAPS } from '../../src/config.js';
import { G } from '../../src/core/ctx.js';

const { PlayHost } = await import('../../src/learn/play/host.js');
const { stageLayout } = await import('../../src/learn/play/beat/pads.js');

test('stageSpot (play-fix): on every offline stage the beat stage stands where no prop is on a pad or its sign and every pad is seen from the stage camera, both orientations', async () => {
  const { MAP_LAYOUTS } = await import('../../src/world/maps.js');
  const { Level } = await import('../../src/world/level.js');
  const { Physics } = await import('../../src/game/physics.js');
  const { NavGraph } = await import('../../src/game/nav.js');
  const { layoutFor } = await import('../../src/world/variants.js');
  const report = [];
  for (const [W, H] of [[390, 844], [844, 390]]) {
    globalThis.innerWidth = W; globalThis.innerHeight = H;
    for (const m of OFFLINE_MAPS) {
      const L = new Level(layoutFor(MAP_LAYOUTS[m.layout || m.id], 'turf'), []), P = new Physics(L), nav = new NavGraph(L, P);
      G.level = L; G.physics = P; G.nav = nav;
      const pad0 = L.spawnPads[0], pad1 = L.spawnPads[1];
      // (the puzzle's way across: from her spawn to just short of the far spawn's barrier)
      const a = nav.nearest({ x: pad0.x, y: pad0.y, z: pad0.z }, 2, true);
      const dx = -pad1.x, dz = -pad1.z, dl = Math.hypot(dx, dz) || 1, pull = (L.spawnBarrier || 4) + 3;
      const b = nav.nearest({ x: pad1.x + (dx / dl) * pull, y: pad1.y, z: pad1.z + (dz / dl) * pull }, 3, false);
      const path = nav.path(a, b, 0, 40000, true);
      assert.ok(path && path.length > 20, m.id + ': a route');
      const stub = { flow: { path, t: 0 }, match: { local: null }, log: [], facingYaw: () => 0 };
      let good = 0, n = 0;
      for (let k = 1; k <= 5; k++) {
        const i = Math.floor((path.length * k) / 7), q = nav.nodes[path[i]];
        stub.match.local = { pos: { x: q.x, y: q.y, z: q.z } };
        for (const pads of [2, 4]) {
          const g = { pathIndex: i, pos: { clone: () => ({ x: q.x, y: q.y, z: q.z }) }, _play: null };
          const s = PlayHost.prototype.stageSpot.call(stub, g, pads);
          n++;
          assert.ok(s && s.origin && Number.isFinite(s.origin.x) && Number.isFinite(s.yaw), m.id + ': a spot');
          if (!s.good) continue;
          good++;
          // (independently: no solid block above the floor at a pad's centre, and the camera of this orientation sees it)
          const lay = stageLayout(pads, W / H), sy = Math.sin(s.yaw), cy = Math.cos(s.yaw), o = s.origin;
          const cam = { x: o.x + cy * lay.cam.pos[0] + sy * lay.cam.pos[2], y: o.y + lay.cam.pos[1], z: o.z - sy * lay.cam.pos[0] + cy * lay.cam.pos[2] };
          for (const p of [{ x: 0, z: 0 }, ...lay.pads]) {
            const w = { x: o.x + cy * p.x + sy * p.z, y: o.y + 0.6, z: o.z - sy * p.x + cy * p.z };
            const ids = L.queryBlocks(w.x - 0.1, w.z - 0.1, w.x + 0.1, w.z + 0.1, []);
            assert.ok(!ids.some((id) => L.blocks[id].solid && L.pointInBlock(L.blocks[id], w, 0)), m.id + ': a prop on a pad');
            assert.ok(P.los(new (o.constructor)(cam.x, cam.y, cam.z), new (o.constructor)(w.x, o.y + 0.15, w.z)), m.id + ': a pad hidden from the stage camera');
          }
        }
      }
      report.push(`${m.id} ${W}x${H} ${good}/${n}`);
      assert.ok(good >= n * 0.6, `${m.id} ${W}x${H}: a good stage spot for most gates (${good} / ${n})`);
    }
  }
  G.level = G.physics = G.nav = null;
  console.log('# stage spots good: ' + report.join(' · '));
});

test('「我的写法也对」 on the puzzle\'s typed sentence (play-fix): a near miss is held — nothing written, no lock — until she decides: S when it stands, the miss W on 继续; without o.hold the call is as it was', async () => {
  const { loadWeek, daySteps } = await import('../../src/learn/content.js');
  const { prompt } = await import('../../src/learn/engine.js');
  const { store, setBackend } = await import('../../src/learn/store.js');
  const { LEARN } = await import('../../src/config.js');
  const { LearnFlow } = await import('../../src/learn/flow.js');
  const memory = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; };
  const leafOf = (id) => { const ev = store.evidence(); for (const doc of Object.values(ev)) { const d = doc.it[id]; if (d) { const day = Object.values(d)[0]; return Object.values(day)[0]; } } return null; };
  const w1 = await loadWeek(1), write = daySteps(w1, 1).find((s) => s.meta.type === 'write').items.find((it) => /^Today is Friday/.test(it.en));
  assert.ok(write, 'the write wall\'s 「Today is Friday.」');
  const near = 'today is';   // (claimable: the meaning there, no key form wrong — forms/common.js canClaim)
  const fresh = () => { setBackend(memory()); store.load(); const emitted = []; const F = { P: LEARN.puzzle, firsts: 0, right: new Set(), play: true, _emit: (n, d) => emitted.push(n), _styleGates() {} }; return { F, emitted, g: { id: 'gate:w', locks: 0, queue: [] }, item: { ...write, _tries: 0, _form: null } }; };
  const J = (x, ans, o) => LearnFlow.prototype._judgeRecord.call(x.F, x.g, x.item, prompt(x.item), ans, o);
  // held: nothing written, no answer event, no lock, nothing queued
  let x = fresh(); const h = J(x, near, { hold: true });
  assert.equal(h.held, true); assert.equal(leafOf(write.id), null); assert.equal(x.emitted.length, 0); assert.equal(x.g.locks, 0); assert.equal(x.g.queue.length, 0);
  // 我的写法也对 → S (claimJudge lets it stand), once
  const s = J(x, near, { hold: true, decided: true, claim: true });
  assert.equal(s.r.ok, true); assert.equal(s.r.claimed, true); assert.deepEqual(leafOf(write.id), [1, 'S']); assert.deepEqual(x.emitted, ['learn:answer']); assert.equal(x.g.locks, 0);
  // 继续 → the miss W, the lock, the other try queued
  x = fresh(); J(x, near, { hold: true }); const c = J(x, near, { hold: true, decided: true });
  assert.equal(c.r.ok, false); assert.deepEqual(leafOf(write.id), [0, 'W']); assert.equal(x.g.locks, 1); assert.equal(c.again, true);
  // a right sentence is never held; a far miss is not held (not claimable); no o.hold: the call it always was
  x = fresh(); assert.ok(!J(x, write.en, { hold: true }).held); assert.deepEqual(leafOf(write.id), [1, 'W']);
  x = fresh(); assert.ok(!J(x, 'blah blah', { hold: true }).held); assert.deepEqual(leafOf(write.id), [0, 'W']);
  x = fresh(); const plain = J(x, near); assert.ok(!plain.held); assert.deepEqual(leafOf(write.id), [0, 'W']);
  // the station never judges: wire/type.js hands the text to flow._judgeRecord only
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(new URL('../../src/learn/play/wire/type.js', import.meta.url), 'utf8');
  assert.ok(/_judgeRecord\(g, item, p, text, \{ hinted: C\.hinted, hold: true \}\)/.test(src) && /decided: true, claim: !!claim/.test(src));
  assert.ok(!/recordFirst|judge\(|claimJudge|canClaim/.test(src.replace(/_judgeRecord/g, '')));
});

test('the typing frame (play-fix): fitted to the real band — every rig point between the strip\'s bottom and the keyboard\'s top, her head below the keys\' row — upright with the strip under the clock, landscape with it at the top edge', async () => {
  const { frameFor, RIG_POINTS, projectRig } = await import('../../src/learn/play/type/frame.js');
  // (the bands the audit measured: upright 390 × 844 — strip bottom ≈ 150 px, keyboard ≈ 39 %; landscape 844 × 390 —
  // strip at the top edge ≈ 40 px, keyboard ≈ 44 %)
  for (const [W, H, top, kb] of [[390, 844, 0.2, 0.4], [390, 844, 0.24, 0.4], [844, 390, 0.12, 0.46], [844, 390, 0.28, 0.46], [1280, 720, 0.14, 0.3]]) {
    const f = frameFor({ phase: 'type', aspect: W / H, kbFrac: kb, topFrac: top });
    assert.ok(f.fits, `${W}x${H} top ${top}: the frame fits`);
    const P = (p) => { const q = projectRig(p, f.pos, f.look, f.fov, W / H); return [((q[0] + 1) / 2) * W, ((1 - q[1]) / 2) * H]; };
    for (const p of [...RIG_POINTS.plate, RIG_POINTS.strike, ...RIG_POINTS.textLines, RIG_POINTS.typed10]) { const [x, y] = P(p); assert.ok(y >= H * top - 1 && y <= H * (1 - kb) + 1 && x >= 0 && x <= W, `${W}x${H}: ${p} at ${x.toFixed(0)}, ${y.toFixed(0)}`); }
    const row = W / H > 1.4 ? [0, 1.16, 1.12] : RIG_POINTS.midRow;
    assert.ok(P(RIG_POINTS.head)[1] > P(row)[1], `${W}x${H}: her head below the row`);
  }
});
