// the board-hitch runs side by side (scratch: for LEARN §48)
import fs from 'node:fs';
for (const f of process.argv.slice(2)) {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  console.log('==', f.split('/').pop(), 'cpu', j.cpu, 'dpr', j.dpr, 'boardsInOneFrameMax', j.boardsInOneFrameMax, 'pathInOneFrameMax', j.pathInOneFrameMax, 'lt', JSON.stringify(j.longTasks), 'errors', j.errors.length);
  for (const [k, v] of Object.entries(j.summary)) console.log('  ' + k.padEnd(8), 'n', String(v.frames).padStart(4), 'p50', String(v.p50).padStart(8), 'max', String(v.max).padStart(9), 'tris', String(v.tris).padStart(8), 'lens', v.lens, 'framed', v.framed, JSON.stringify(v.kinds));
  const isBoard = (p) => p[0] === 'paint' || p[0] === 'strip' || ((p[0] === 'tex' || p[0] === 'sub') && /Canvas[^:]*:1024x/.test(p[1]));
  const top = j.frames.map((fr, i) => ({ i, what: fr.what, ms: fr.ms, b: +fr.parts.filter(isBoard).reduce((a, p) => a + p[2], 0).toFixed(1), parts: fr.parts.filter(isBoard).map((p) => p[0] + ':' + p[1].slice(0, 12) + ':' + p[2]) })).filter((x) => x.b > 0).sort((a, b) => b.b - a.b).slice(0, 6);
  for (const t of top) console.log('   board frame', t.i, t.what, 'frame', t.ms, 'boards', t.b, t.parts.join(' '));
  console.log('  one', JSON.stringify(j.one));
}
