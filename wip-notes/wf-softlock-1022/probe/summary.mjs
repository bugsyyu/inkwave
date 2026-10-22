// the tap-walk runs as one table (scratch: for LEARN §48)
import fs from 'node:fs';
const R = process.argv[2];
for (const f of fs.readdirSync(R).filter((x) => /\.json$/.test(x)).sort()) {
  let j; try { j = JSON.parse(fs.readFileSync(R + '/' + f, 'utf8')); } catch (e) { console.log(f, 'unreadable'); continue; }
  const taps = {}; for (const t of j.taps || []) { const k = /^key /.test(t.what) ? 'key' : t.what.replace(/\s*\(.*\)$/, ''); taps[k] = (taps[k] || 0) + 1; }
  const exitLog = j.end && j.end.exit ? j.end.exit.log.map((e) => e.ev + (e.kind ? ':' + e.kind : '') + (e.how ? ':' + e.how : '')).join(' ') : '';
  console.log([f.replace('.json', ''), j.learn, j.kind, j.view, 'g' + (j.gate || 0), 'samples ' + j.samples, 'noWay ' + (j.maxNoWay ? j.maxNoWay.game.toFixed(1) + '/' + j.maxNoWay.wall.toFixed(1) : '?'),
    'fails ' + (j.fails || []).length + ((j.fails || []).length ? ' [' + j.fails.map((x) => x.what).join(' | ').slice(0, 160) + ']' : ''), 'q ' + (j.questions || []).length, 'boards ' + (j.boards || []).length,
    'more ' + (j.more || []).map((m) => m.via + (m.opened ? '+' : '-')).join(','), 'until ' + JSON.stringify(j.until || null), 'taps ' + JSON.stringify(taps), exitLog ? 'exit ' + exitLog : ''].join(' · '));
}
