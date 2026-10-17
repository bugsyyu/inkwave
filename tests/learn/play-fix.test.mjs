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
