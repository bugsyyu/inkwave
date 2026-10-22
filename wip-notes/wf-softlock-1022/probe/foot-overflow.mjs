// which boards' footer labels spill out of their pills (Node measurer) — scratch
import { register } from 'node:module';
register(new URL('file:///home/user/inkwave/.claude/worktrees/wf-softlock/tests/learn/three-hook.mjs'));
const R = 'file:///home/user/inkwave/.claude/worktrees/wf-softlock/src/learn/';
const { loadWeek, daySteps } = await import(R + 'content.js');
const P = await import(R + 'play/board/paint.js');
const S = await import(R + 'play/board/signs.js');
const { approxMeasure } = await import(R + 'play/board/text.js');
const out = new Map();
for (const wk of [1, 2, 3]) {
  const W = await loadWeek(wk);
  for (let d = 1; d <= 7; d++) for (const s of daySteps(W, d)) {
    const t = s.meta.type, specs = [];
    if (s.meta.lesson && s.meta.lesson.length) specs.push(P.lessonSpec(s.title, s.meta.lesson));
    if (t === 'reading' && s.meta.passage) specs.push(P.passageSpec(s.meta.passage));
    if (t === 'speak') specs.push(P.echoSpec(s.items[0]));
    if (t === 'checkin') specs.push(S.signBoard({ kind: 'checkin', title: s.title, text: s.items[0].zh }));
    if (t === 'weekly') specs.push(S.signBoard({ kind: 'weekly', title: s.title }));
    if (t === 'placement') specs.push(S.signBoard({ kind: 'placement', title: s.title }));
    for (const sp of specs) {
      const L = P.layoutBoard(sp);
      for (const o of L.ops.filter((o) => o.op === 'pill')) {
        const tw = approxMeasure(o.label, o.px) , need = tw + (o.icon ? o.h * 0.5 + 14 : 0) + 20;
        const key = sp.kind + ' ' + o.label;
        if (need > o.w) out.set(key, (out.get(key) || 0) + 1);
      }
    }
  }
}
console.log(out.size ? [...out].map(([k, n]) => k + ' ×' + n).join('\n') : 'none');
