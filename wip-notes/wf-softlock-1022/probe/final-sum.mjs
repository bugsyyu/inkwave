// scratch (wf-softlock): the final batch's tap-walk reports as one line each (for LEARN §48 and the report)
//   node final-sum.mjs <dir> [names…]
import fs from 'node:fs';
const [dir, ...names] = process.argv.slice(2);
const files = names.length ? names.map((n) => n + '.json') : fs.readdirSync(dir).filter((f) => /\.json$/.test(f) && !/^bh-/.test(f)).sort();
for (const f of files) {
  let j; try { j = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8')); } catch (e) { console.log(f, 'unreadable / missing'); continue; }
  const taps = {}; for (const t of j.taps || []) { const k = /^key /.test(t.what) ? 'key' : /^swipe/.test(t.what) ? 'swipe' : t.what.replace(/\s*\(.*\)$/, '').replace(/^M1 \d+$/, 'M1').replace(/^pad \d+$/, 'pad'); taps[k] = (taps[k] || 0) + 1; }
  const q = j.questions || [], qok = q.filter((x) => x.ok).length;
  const more = (j.more || []).map((m) => m.via + (m.opened ? '✓' : '✗')).join(' ');
  const exitLog = j.end && j.end.exit ? j.end.exit.log.map((e) => e.ev + (e.kind ? ':' + e.kind : '') + (e.how ? ':' + e.how : '')).join(' ') : '';
  const clock = j.end && j.end.clock ? `${j.end.clock.rect.join(',')}${j.end.clock.inSafe ? '' : ' UNDER-INSET'}` : '-';
  const go = (j.boards || [])[0];
  console.log([f.replace('.json', ''), `${j.learn} ${j.kind} ${j.view}${j.gate ? ' g' + j.gate : ''}`,
    (j.fails || []).length ? `${j.fails.length} FAILED [${j.fails.map((x) => x.what).join(' | ').slice(0, 220)}]` : 'all passed',
    `samples ${j.samples}`, `noWay ${j.maxNoWay.game.toFixed(1)}/${j.maxNoWay.wall.toFixed(1)} s`, `taps ${(j.taps || []).length} ${JSON.stringify(taps)}`,
    `q ${qok}/${q.length}`, `boards ${(j.boards || []).length}`, go ? `go ${go.go.join(',')}${go.ready ? ' ready' : ''}` : '', more ? `看全文 ${more}` : '',
    `until ${JSON.stringify(j.until || null)}`, `clock ${clock}`, exitLog ? `exit ${exitLog}` : '', `errors ${(j.errors || []).length} 4xx ${(j.badResponses || []).length}`].filter(Boolean).join(' · '));
}
