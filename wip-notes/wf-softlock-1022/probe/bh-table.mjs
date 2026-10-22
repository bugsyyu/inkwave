// scratch (wf-softlock, third agent): two board-hitch JSONs (before / after, same batch) as the rows of LEARN §48's table
//   node bh-table.mjs <before.json> <after.json>
import fs from 'node:fs';
const [A, B] = process.argv.slice(2).map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
const isBoard = (p) => p[0] === 'paint' || p[0] === 'strip' || ((p[0] === 'tex' || p[0] === 'sub') && /Canvas[^:]*:1024x/.test(p[1]));
// per phase: frames, p50 / max of the frame's main-thread time, the boards' own work (sum over the phase, max in one frame)
function phase(j, k) {
  const s = j.summary[k]; if (!s) return null;
  const fr = j.frames.filter((f) => f.what === k), b = fr.map((f) => f.parts.filter(isBoard).reduce((a, p) => a + p[2], 0));
  const nb = fr.map((f) => f.parts.filter((p) => p[0] === 'paint').length);
  return { n: s.frames, p50: s.p50, max: s.max, bSum: +b.reduce((a, x) => a + x, 0).toFixed(1), bMax: +Math.max(0, ...b).toFixed(1), paintsMax: Math.max(0, ...nb), tris: s.tris };
}
const f = (x) => (x == null ? '—' : String(x));
console.log(`cpu ${A.cpu}/${B.cpu} dpr ${A.dpr}/${B.dpr}; boardsInOneFrameMax ${A.boardsInOneFrameMax} → ${B.boardsInOneFrameMax}; errors ${A.errors.length} / ${B.errors.length}`);
for (const k of Object.keys(A.summary)) {
  const a = phase(A, k), b = phase(B, k);
  console.log(`| ${k} (${f(a && a.n)} / ${f(b && b.n)} 帧) | p50 ${f(a && a.p50)} · 最长 ${f(a && a.max)} · 板 ${f(a && a.bMax)} (${f(a && a.paintsMax)} 块) | p50 ${f(b && b.p50)} · 最长 ${f(b && b.max)} · 板 ${f(b && b.bMax)} (${f(b && b.paintsMax)} 块) | tris ${f(a && a.tris)} / ${f(b && b.tris)}`);
}
console.log('one before', JSON.stringify(A.one)); console.log('one after ', JSON.stringify(B.one));
// the start frame and the worst frames: what the world (not the boards) cost in them
for (const [n, j] of [['before', A], ['after', B]]) {
  const w = j.frames.map((fr, i) => ({ i, what: fr.what, ms: fr.ms, world: fr.parts.filter((p) => !isBoard(p) && p[2] > 5).map((p) => `${p[0]}:${p[1]}:${p[2]}`) })).sort((x, y) => y.ms - x.ms).slice(0, 4);
  console.log(n, 'worst', JSON.stringify(w));
}
