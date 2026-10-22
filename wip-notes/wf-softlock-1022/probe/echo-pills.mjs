// the echo board's footer pills as the layout places them (Node measurer) — scratch
import { register } from 'node:module';
register(new URL('file:///home/user/inkwave/.claude/worktrees/wf-softlock/tests/learn/three-hook.mjs'));
const { loadWeek, daySteps } = await import('file:///home/user/inkwave/.claude/worktrees/wf-softlock/src/learn/content.js');
const { layoutBoard, echoSpec } = await import('file:///home/user/inkwave/.claude/worktrees/wf-softlock/src/learn/play/board/paint.js');
const W2 = await loadWeek(2);
for (const d of [1, 3, 7]) {
  const sp = daySteps(W2, d).find((s) => s.meta.type === 'speak'); if (!sp) continue;
  const L = layoutBoard(echoSpec(sp.items[0]));
  const pills = L.ops.filter((o) => o.op === 'pill').map((o) => ({ label: o.label, x: Math.round(o.x), w: Math.round(o.w), right: Math.round(o.x + o.w) }));
  console.log(`w2d${d}`, 'W', L.W, 'H', L.H, JSON.stringify(pills), 'hot', JSON.stringify(L.hotspots.map((h) => [h.id, Math.round(h.x), Math.round(h.w)])));
}
