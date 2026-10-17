// 题即玩法 play-8 (docs/PLAY.md §10「整天从头跑到尾」, LEARN §27): a whole day run in segments, checked as one run.
// Reads the segment reports in the order they ran (wire-audit --out, arena-audit --out, runner-audit --out) and checks:
//   · each segment starts where the one before stopped: its --gate / --skip are the last one's `resume`, and its first
//     answer is an item of that gate at or after that skip (別跳题: nothing before it is left unasked)
//   · her store carried on: every evidence leaf at the end of a segment is still there at the end of the next
//   · 首答只记一次: no item has two learn:answer events with first = true across the whole day, and every one of them
//     left exactly one leaf
//   · the PLAY §1 rule 1 samples (match.paused false, no learn.hold, no .iw-learn__panel shown) never broke; no failed
//     check, no console error, no 4xx in any segment; the last segment ends on the results card
//   · the scored items of the day the form asks that got no first answer (a duel round can end before its queue: listed)
// usage: node tools/learn/day-check.mjs --form puzzle|race|duel|boss --learn w1d1 seg1.json seg2.json …
import fs from 'node:fs';
import { loadWeek, daySteps } from '../../src/learn/content.js';
import { planDay, bossPlan } from '../../src/learn/design.js';

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const FORM = opt('form', 'puzzle'), LEARN_Q = opt('learn', 'w1d1');
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const [, wk, dy] = LEARN_Q.match(/^w(\d+)d(\d+)$/).map(Number);
const W = await loadWeek(wk);
const byId = new Map(); for (const d of W.days) for (const st of daySteps(W, d.n)) for (const it of st.items) byId.set(it.id, it);
const scored = (it) => { const x = byId.get(it.id) || it; return !!(x.meta && x.meta.scored); };
// the gates as the form sees them (1-based --gate N is gates[N - 1]; past the last gate, the write wall's sentences)
let gates;
if (FORM === 'boss') gates = bossPlan(W).phases.map((ph) => ({ id: ph.id, items: ph.items }));
else {
  const L = planDay(W, dy, FORM === 'quiz' ? 'duel' : FORM);
  gates = L.gates.map((g) => ({ id: g.id, items: g.items }));
  const wall = (L.signs || []).find((s) => s.design && s.design.mechanic === 'write-wall');
  if (wall && FORM !== 'duel') gates.push({ id: wall.id, items: wall.items || [] });
}
const want = new Set(gates.flatMap((g) => g.items.filter(scored).map((it) => it.id)));

const segs = files.map((f) => {
  const j = JSON.parse(fs.readFileSync(f, 'utf8'));
  if (j.runs) { const r = j.runs[0] || {}; return { file: f, gate: r.gate || 1, skip: r.skip || 0, answers: r.answers || [], evidence: r.evidence || {}, resume: r.resume, fails: r.errors || [], errors: j.errors || [], bad: j.bad || [], inv: r.invariants, results: !!r.resultsShown, results2: r.results }; }
  const r = j.view ? j : Object.values(j)[0];
  const end = r.end || {};
  return { file: f, gate: r.gate || 1, skip: r.skip || 0, answers: end.answers || [], evidence: end.evidence || {}, resume: r.resume, fails: [...(r.end ? [] : ['no end report: the segment was cut off (its watchdog)']), ...(r.fails || [])], errors: r.errors || [], bad: r.badResponses || [], inv: r.invariants, results: !!end.results, results2: end.resultsText };
});
const out = [], bad = (m) => out.push('FAIL ' + m), ok = (m) => out.push('ok   ' + m);
const leaves = (ev) => { const L = []; for (const [doc, d] of Object.entries(ev || {})) for (const [id, days] of Object.entries(d.it || {})) for (const [day, at] of Object.entries(days)) for (const [t, leaf] of Object.entries(at)) L.push([doc, id, day, t, JSON.stringify(leaf)].join('\u0001')); return L; };
const firsts = new Map();
segs.forEach((s, k) => {
  const tag = `segment ${k + 1} (${s.file.split('/').pop()}: gate ${s.gate} skip ${s.skip})`;
  if (k > 0) {
    const r = segs[k - 1].resume;
    if (!r) bad(`${tag}: the segment before has no resume point`);
    else if (r.gate !== s.gate || r.skip !== s.skip) bad(`${tag}: starts at gate ${s.gate} skip ${s.skip}, the one before stopped at gate ${r.gate} skip ${r.skip}`);
    else ok(`${tag}: starts where the one before stopped`);
    const before = new Set(leaves(segs[k - 1].evidence)), now = new Set(leaves(s.evidence));
    const lost = [...before].filter((l) => !now.has(l));
    if (lost.length) bad(`${tag}: ${lost.length} evidence leaves of the segment before are gone (the profile did not carry the store): ${lost.slice(0, 3).map((l) => l.split('\u0001').join(' ')).join(', ')}`);
    else ok(`${tag}: her store carried on (${before.size} leaves before, ${now.size} after)`);
  }
  // the first answer of the segment: an item of its gate at or after its skip
  const g = gates[s.gate - 1], a0 = s.answers[0] && s.answers[0][0];
  if (g && a0) { const at = g.items.findIndex((it) => it.id === a0); if (at < s.skip && FORM !== 'race') bad(`${tag}: its first answer ${a0} is item ${at} of ${g.id} — before the skip ${s.skip}`); else ok(`${tag}: first answer ${a0} = ${g.id} item ${at} (skip ${s.skip})`); }
  for (const [id, , first] of s.answers) if (first) firsts.set(id, (firsts.get(id) || 0) + 1);
  if (s.fails.length) bad(`${tag}: ${s.fails.length} failed checks: ${s.fails.slice(0, 3).join(' | ').slice(0, 400)}`); else ok(`${tag}: no failed check`);
  if (s.errors.length || s.bad.length) bad(`${tag}: console errors ${s.errors.length}, 4xx ${s.bad.length}: ${[...s.errors, ...s.bad].slice(0, 2).join(' | ').slice(0, 300)}`); else ok(`${tag}: console errors 0, 4xx 0`);
  if (!s.inv) bad(`${tag}: no invariant samples`); else if (s.inv.breaks.length) bad(`${tag}: PLAY §1 rule 1 broke: ${JSON.stringify(s.inv.breaks.slice(0, 3))}`); else ok(`${tag}: PLAY §1 rule 1 held on all ${s.inv.samples} sampled steps`);
});
const last = segs[segs.length - 1];
if (last && !last.resume && last.results) ok(`the day ends on the results card: ${String(last.results2 || '').replace(/\s+/g, ' ').slice(0, 120)}`); else bad('the last segment did not end on the results card');
const twice = [...firsts].filter(([, n]) => n > 1);
if (twice.length) bad(`first answer recorded more than once: ${twice.map(([id, n]) => id + ' ×' + n).join(', ')}`); else ok(`首答只记一次: ${firsts.size} items, each once`);
// every first answer left one leaf (the final store)
const fin = leaves(last ? last.evidence : {}), leafIds = new Map(); for (const l of fin) { const id = l.split('\u0001')[1]; leafIds.set(id, (leafIds.get(id) || 0) + 1); }
const noLeaf = [...firsts.keys()].filter((id) => !leafIds.has(id)), extra = [...leafIds].filter(([, n]) => n > 1);
if (noLeaf.length || extra.length) bad(`leaves: ${noLeaf.length} first answers without a leaf, ${extra.length} items with two: ${[...noLeaf, ...extra.map((e) => e[0])].slice(0, 5).join(', ')}`); else ok(`every first answer left exactly one leaf (${fin.length})`);
const missing = [...want].filter((id) => !firsts.has(id));
(missing.length && FORM !== 'duel' ? bad : ok)(`scored items of the day with no first answer: ${missing.length} / ${want.size}${missing.length ? ' — ' + missing.slice(0, 12).join(', ') : ''}`);
console.log(out.join('\n'));
const failed = out.filter((l) => l.startsWith('FAIL')).length;
console.log(`[day-check] ${FORM} ${LEARN_Q}: ${segs.length} segments · ${failed ? failed + ' FAILED' : 'all checks passed'}`);
process.exit(failed ? 1 : 0);
