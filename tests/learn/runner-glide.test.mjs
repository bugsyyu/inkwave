// 墨浪跑酷's 滑行段 (src/learn/play/runner/glide.js, docs/PLAY.md §3 M4 / §4 / §5.2, LEARN §23): the typed items of a race
// day on play-type's rig — judged only through the flow's one path (RunnerFlow._judgeRecord), the evidence the host's
// modes (T · H after a hint · L with its percent · W · S when 「我的写法也对」 stands), the other try per PLAY §4's last
// column (a word → 「选义」 lane row then typed again; a dictation → slowly; a sentence → with the why), a second miss →
// the race's 回炉; the rig never sees an answer before 射; a near-miss sentence is held (nothing written) until her tap;
// the write wall's sentences are the run's last stretch; the runner's path writes the race card's leaf.
// 用法：node --test tests/learn/runner-glide.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWeek } from '../../src/learn/content.js';
import { prompt } from '../../src/learn/engine.js';
import { store, setBackend } from '../../src/learn/store.js';
import { planDay } from '../../src/learn/design.js';
import { LEARN } from '../../src/config.js';
import { loopRoute, judgeAnswer, canClaim } from '../../src/learn/forms/common.js';
import { entriesOf, rowPrompt, rightLane, rowAnswer, rowLanes } from '../../src/learn/play/runner/rows.js';
import { buildTrack, straighten, clearWidths } from '../../src/learn/play/runner/track.js';
const { LearnFlow } = await import('../../src/learn/flow.js');
const { GlideStation, glideMove } = await import('../../src/learn/play/runner/glide.js');
const { RunnerFlow } = await import('../../src/learn/play/runner/runner.js');
const { RaceFlow } = await import('../../src/learn/forms/race.js');

function memory() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; }
const leafOf = (id) => { const ev = store.evidence(); for (const doc of Object.values(ev)) { const d = doc.it && doc.it[id]; if (d) { const day = Object.values(d)[0]; return Object.values(day)[0]; } } return null; };
const WEEKS = [await loadWeek(1), await loadWeek(2), await loadWeek(3)];

// a ring corridor nav (as runner-track's fixture) for a track the station can place a word on
function ringNav(NX = 44, NZ = 30, wide = 5) {
  const nodes = [], cells = new Array(NX * NZ);
  for (let iz = 0; iz < NZ; iz++) for (let ix = 0; ix < NX; ix++) {
    const inner = ix >= wide && ix < NX - wide && iz >= wide && iz < NZ - wide;
    if (inner) { cells[iz * NX + ix] = []; continue; }
    cells[iz * NX + ix] = [nodes.length];
    nodes.push({ id: nodes.length, x: ix, y: 0, z: iz, ix, iz, nb: [], zone: -1, wet: 0 });
  }
  for (const n of nodes) for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-1, -1], [1, -1], [-1, 1]]) {
    const jx = n.ix + dx, jz = n.iz + dz; if (jx < 0 || jz < 0 || jx >= NX || jz >= NZ) continue;
    const c = cells[jz * NX + jx]; if (c.length) n.nb.push({ to: c[0], cost: Math.hypot(dx, dz), type: 'walk' });
  }
  const nav = { nodes, cells, x0: 0, z0: 0, step: 1, nx: NX, nz: NZ, valid: new Uint8Array(nodes.length).fill(1),
    nearest(p) { const ix = Math.round(p.x), iz = Math.round(p.z); let best = -1, bd = Infinity; for (let r = 0; r <= 3 && best < 0; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) { const jx = ix + dx, jz = iz + dz; if (jx < 0 || jz < 0 || jx >= NX || jz >= NZ) continue; for (const id of cells[jz * NX + jx]) { const d = dx * dx + dz * dz; if (d < bd) { bd = d; best = id; } } } return best; },
    edgeType: () => 'walk' };
  const at0 = (x, z) => cells[z * NX + x][0];
  return { nav, start: at0(NX >> 1, 2), goal: at0(NX >> 1, NZ - 3) };
}
const { nav, start, goal } = ringNav();
const route = loopRoute(nav, start, goal, { avoid: 6 });
const T = buildTrack(nav.nodes, route.loop, { keep: straighten(nav, route.loop, { edgeType: nav.edgeType }) }), W = clearWidths(nav, T);

// a flow stub around the real judging path (RunnerFlow.prototype._judgeRecord, as play-1's equivalence test does) and
// the runner's hooks the station calls; a stand-in rig that only remembers what it was told
function harness(level) {
  const F = {
    match: { local: { pos: { x: 22, y: 0, z: 2 }, vel: { x: 0, y: 0, z: 3.4 }, yaw: 0 }, paused: false }, T, W, sNow: 5, t: 0,
    P: LEARN.puzzle, level, firsts: 0, firstRight: 0, streak: 0, rightN: 0, relearnRight: 0, right: new Set(), asked: 0, asking: null,
    log: [], queue: [], wrong2: [], pendingDetour: false, strip: { shown: [], verdicts: [], show(p, o) { this.shown.push({ p, o }); }, verdict(v, o) { this.verdicts.push({ v, o }); }, hide() {} },
    _ask(kind, p) { this.strip.show(p, { kind }); }, _speak() {}, _emit(name, d) { this.log.push({ name, ...d }); }, _onRight() { this.onRight = (this.onRight || 0) + 1; },
    _onWrong2(item) { this.wrong2.push(item.id); if (!item._relearn) this.pendingDetour = true; }, _startDetour() { this.pendingDetour = false; this.detours = (this.detours || 0) + 1; },
    _requeue(e) { this.queue.push(e); }, _styleGates() {},
    _judgeRecord: RunnerFlow.prototype._judgeRecord, _altPrompt: LearnFlow.prototype._altPrompt, _wordPool: LearnFlow.prototype._wordPool,
  };
  const S = new GlideStation(F);
  S._ensure = () => {};
  S.shot = { calls: [], text: '', phase: 'idle', rig: { hullYaw: 0 }, opts: {}, lift: 0.95, target: null,
    mount() { this.calls.push('mount'); }, unmount() { this.calls.push('unmount'); }, begin(o) { this.calls.push(['begin', o]); this.phase = 'typing'; this.text = ''; },
    key(k) { this.text += k; }, back() { this.text = this.text.slice(0, -1); }, hint() {}, submit() { const t = this.text; this.phase = 'firing'; this.calls.push(['submit', t]); return t.trim() ? t : null; },
    resolve(v) { this.calls.push(['resolve', v]); this.phase = 'done'; return Promise.resolve(); }, clear() {}, update() {}, dispose() {} };
  S.keys = { visible: false, enabled: true, frac: 0.4, mode: 'word', show() { this.visible = true; }, hide() { this.visible = false; }, setMode(m) { this.mode = m; }, clear() {}, setHintUsed() {}, layout() {}, destroy() {} };
  S.mounted = false;
  return { F, S };
}
const gateOf = (level, pred) => level.gates.find((g) => g.items.some(pred));
const tick = () => new Promise((r) => setTimeout(r, 0));
async function typeAndFire(S, text) { for (const ch of text) S.shot.key(ch); S._submit(); await tick(); await tick(); }

test('the run\'s queue takes the write wall: every race day with one ends on a 写句 glide (two sentences on a short level); word / dict glides are per checkpoint', () => {
  let walls = 0, days = 0;
  for (const w of WEEKS) for (const d of w.days) {
    const L = planDay(w, d.n, 'race');
    const es = entriesOf(L.gates, L.signs), last = es[es.length - 1];
    const wall = (L.signs || []).find((s) => s.design && s.design.mechanic === 'write-wall' && s.items && s.items.length);
    days++;
    if (!wall) { assert.ok(!es.some((e) => e.exit), `${L.id || w.id + 'd' + d.n}: no wall, no exit glide`); continue; }
    walls++;
    assert.ok(last.kind === 'glide' && last.exit && last.gate === L.gates.length && last.items.every((it) => it.meta.input === 'write'), 'the last entry is the wall');
    assert.equal(last.items.length, wall.items.filter((it) => it.meta.scored).length);
    const short = entriesOf(L.gates, L.signs, { short: true });
    assert.equal(short[short.length - 1].items.length, Math.min(2, last.items.length));
    for (const e of es) if (e.kind === 'glide' && !e.exit) assert.ok(e.items.every((it) => it.meta.input === 'type'), 'a checkpoint glide is its typed items');
  }
  assert.ok(walls >= 15 && days === 21, `${walls} walls of ${days} days`);
});

test('a word\'s 「选义」 row: flow._altPrompt\'s choice-of-typed as a lane row — the right lane is the word\'s, a narrowed row keeps it, the curtain judges as the card does', async () => {
  const L = planDay(WEEKS[0], 3, 'race');
  const g = gateOf(L, (it) => it.meta.input === 'type' && it.meta.kind === 'word'), item = g.items.find((it) => it.meta.kind === 'word');
  const F = { level: L, _wordPool: LearnFlow.prototype._wordPool, play: true };
  const alt = LearnFlow.prototype._altPrompt.call(F, item);
  assert.equal(alt._alt, 'choice-of-typed'); assert.ok(alt.options.length >= 2);
  const p = rowPrompt(item, { base: alt });
  const rl = rightLane(item, p);
  assert.ok(rl >= 0 && p.options[rl].text === item.en, 'the right lane is the word');
  assert.ok(!p._perm, 'no _perm on a choice-of-typed row (the picked text is judged)');
  const narrow = rowPrompt(item, { base: alt, lanes: 2 });
  assert.equal(narrow.options.length, 2); assert.ok(narrow.options.some((o) => o.text === item.en), 'narrowed: the word stays');
  assert.equal(rowLanes(item, narrow, LEARN.runner.banner), 2);
  // the curtain's answer = the card's answer for the same pick (judgeAnswer honours _alt; recordFirst the same leaf)
  setBackend(memory());
  const r1 = rowAnswer(item, p, rl, { at: Date.parse('2026-10-14T09:30:00') });
  assert.ok(r1.answered && r1.r.ok, 'the word\'s lane is right');
  assert.deepEqual(leafOf(item.id).slice(0, 2), [1, 'T'], 'a typed item picked as a choice is still the dictation\'s T');
  const wrongLane = (rl + 1) % p.options.length;
  assert.equal(judgeAnswer(item, p, wrongLane).ok, false);
});

test('the 滑行段: typed through the one path — T · L (pct) · W leaves, 射 before any answer, the other try per PLAY §4, a second miss → 回炉', async () => {
  const L = planDay(WEEKS[0], 3, 'race');
  const gW = gateOf(L, (it) => it.meta.input === 'type' && it.meta.kind === 'word'), gD = gateOf(L, (it) => it.meta.kind === 'dict');
  const word = { ...gW.items.find((it) => it.meta.kind === 'word'), _tries: 0 }, dict = { ...gD.items.find((it) => it.meta.kind === 'dict'), _tries: 0 };
  const wall = L.signs.find((s) => s.design.mechanic === 'write-wall'), write = { ...wall.items[0], _tries: 0 };
  const G1 = { id: gW.id, index: 1, locks: 0, queue: [] }, G2 = { id: gD.id, index: 2, locks: 0, queue: [] }, G3 = { id: 'gate:write', index: 9, locks: 0, queue: [] };
  const row = (gate, e) => ({ e: { gate, kind: 'glide', items: [], ...e }, gate, kind: 'glide', s: 40 });

  // (1) a word typed right: the leaf is [1, T]; the rig got begin({ mode, target: null }) and never anything of the answer
  { setBackend(memory()); const { F, S } = harness(L);
    const done = S.run({ items: [word], gate: G1, row: row(1, {}) });
    assert.ok(S.active && S.typing && S.keys.visible && S.keys.mode === 'word', 'typing a word, the keyboard up');
    const begin = S.shot.calls.find((c) => c[0] === 'begin'); assert.deepEqual(begin[1], { mode: 'word', target: null });
    assert.ok(!JSON.stringify(S.shot.calls).includes(word.en), 'the rig has not seen the word');
    await typeAndFire(S, word.en);
    await done;
    assert.deepEqual(leafOf(word.id).slice(0, 2), [1, 'T']);
    assert.equal(F.log.filter((e) => e.name === 'learn:answer').length, 1, 'learn:answer once (from _judgeRecord)');
    assert.ok(F.log.some((e) => e.name === 'learn:question' && e.type === 'type'), 'learn:question for the typed item');
    assert.equal(F.onRight, 1); assert.equal(F.firstRight, 1); assert.equal(F.queue.length, 0);
    const res = S.shot.calls.find((c) => c[0] === 'resolve'); assert.equal(res[1].ok, true); assert.equal(res[1].right, word.en);
    assert.ok(!S.active && !S.keys.visible && S.shot.calls.includes('unmount'), 'the stretch ended: the rig unmounted'); }

  // (1b) a word typed right after 提示: [1, H] (the keyboard's hint key; PLAY §1 rule 3); the 墨雨 prop does the same up front
  { setBackend(memory()); const { F, S } = harness(L);
    const wh = { ...word, _tries: 0 };
    const done = S.run({ items: [wh], gate: G1, row: row(1, {}) });
    S._hint();
    await typeAndFire(S, word.en);
    await done;
    assert.deepEqual(leafOf(wh.id).slice(0, 2), [1, 'H']);
    assert.equal(S.stats.hinted, 1);
    setBackend(memory()); F.hintNext = true;
    const done2 = S.run({ items: [{ ...word, _tries: 0 }], gate: G1, row: row(1, {}) });
    assert.ok(S.cur.hinted && !F.hintNext, 'the 墨雨 prop: the hint up front');
    await typeAndFire(S, word.en);
    await done2;
    assert.deepEqual(leafOf(word.id).slice(0, 2), [1, 'H']); }

  // (2) a word typed wrong: [0, T]; the other try is a 「选义」 lane row (choice-of-typed) with the retype queued after it; no 回炉 yet
  { setBackend(memory()); const { F, S } = harness(L);
    const w2 = { ...word, _tries: 0 };
    const done = S.run({ items: [w2], gate: G1, row: row(1, {}) });
    await typeAndFire(S, 'famliy');
    await done;
    assert.deepEqual(leafOf(w2.id).slice(0, 2), [0, 'T']);
    assert.equal(F.wrong2.length, 0);
    assert.equal(F.queue.length, 1);
    const e = F.queue[0];
    assert.ok(e.kind === 'lane' && e.prompt && e.prompt._alt === 'choice-of-typed' && e.tries === 1 && e.item === w2, JSON.stringify({ kind: e.kind, alt: e.prompt && e.prompt._alt, tries: e.tries }));
    assert.ok(e.then && e.then.kind === 'glide' && e.then.retype && e.then.items[0] === w2, 'typed again after the row');
    const res = S.shot.calls.find((c) => c[0] === 'resolve'); assert.equal(res[1].ok, false); assert.equal(res[1].right, word.en);
    assert.match(F.strip.verdicts[0].v.head, /差一点/);
    // the retype missed too (its entry carries tries: 1 — the 「选义」 row's `then`): the second miss goes the race's way
    // (回炉 + the detour), nothing requeued
    const done2 = S.run({ items: [w2], gate: G1, row: row(1, { retype: true, tries: 1 }) });
    await typeAndFire(S, 'famliy');
    await done2;
    assert.deepEqual(F.wrong2, [w2.id]); assert.equal(F.queue.length, 1); assert.equal(F.detours, 1); }

  // (3) a dictation: L with its percent (a hint changes nothing for a dictation: the host's mode is L either way); missed → the same sentence again, slowly
  { setBackend(memory()); const { F, S } = harness(L);
    const d2 = { ...dict, _tries: 0 };
    const done = S.run({ items: [d2], gate: G2, row: row(2, {}) });
    assert.equal(S.keys.mode, 'sentence');
    S._hint();
    assert.ok(S.cur.hinted && /提示/.test(F.strip.shown[F.strip.shown.length - 1].p.zh || ''));
    await typeAndFire(S, 'there people family');
    await done;
    const leaf = leafOf(d2.id);
    assert.ok(leaf[1] === 'L' && typeof leaf[0] === 'number' && leaf[0] > 0 && leaf[0] < 100, `a dictation's leaf is its percent: ${JSON.stringify(leaf)}`);
    assert.equal(F.queue.length, 1); assert.ok(F.queue[0].kind === 'glide' && F.queue[0].slow && F.queue[0].items[0] === d2);
    const res = S.shot.calls.find((c) => c[0] === 'resolve'); assert.ok(res[1].pct > 0 && res[1].pct < 100 && res[1].right === dict.en);
    assert.match(F.strip.verdicts[0].v.head, /%/); }

  // (4) a written sentence (the wall): W; a miss comes back with the why; right → W too
  { setBackend(memory()); const { F, S } = harness(L);
    const wr = { ...write, _tries: 0 };
    const done = S.run({ items: [wr], gate: G3, row: row(9, { exit: true }) });
    assert.equal(S.keys.mode, 'sentence');
    await typeAndFire(S, 'there is three people in my family');
    await done;
    assert.equal(leafOf(wr.id)[1], 'W');
    assert.equal(F.queue.length, 1); assert.ok(F.queue[0].kind === 'glide' && typeof F.queue[0].why === 'string' && F.queue[0].items[0] === wr);
    setBackend(memory());
    const wr2 = { ...write, _tries: 0 };
    const done2 = S.run({ items: [wr2], gate: G3, row: row(9, { exit: true }) });
    await typeAndFire(S, write.en);
    await done2;
    assert.deepEqual(leafOf(wr2.id).slice(0, 2), [1, 'W']); }

  // (5) a 回炉 item: no other try, no second 回炉 (the race's own rule: _onWrong2 skips _relearn items)
  { setBackend(memory()); const { F, S } = harness(L);
    const rl = { ...word, _relearn: true, _tries: 1 };
    const done = S.run({ items: [rl], gate: { id: 'gate:relearn', index: 9, locks: 0, queue: [] }, row: row(9, { relearn: true }) });
    await typeAndFire(S, 'famliy');
    await done;
    assert.equal(F.queue.length, 0); assert.deepEqual(F.wrong2, [rl.id]); assert.equal(F.pendingDetour, false); }

  // the kid on the rig moves at the glide tide's pace (her run speed × the move's magnitude), never stopped
  const k = glideMove();
  assert.ok(k > 0.15 && k <= 1 && Math.abs(k * 6 - LEARN.runner.glideTide * 11.8) < 0.3, `glideMove ${k}`);
  // the station never judges or writes: no judge / recordFirst / item.answer in its source
  const src = readFileSync(new URL('../../src/learn/play/runner/glide.js', import.meta.url), 'utf8');
  assert.ok(!/recordFirst|\bjudge\(|item\.answer|\.answer\b/.test(src.replace(/\/\/.*$/gm, '')), 'glide.js judges nothing');
});

test('「我的写法也对」 on the 滑行段: a near-miss sentence is held — nothing written, the word grey — until her tap: claimed → [1, S], 继续 → [0, W]', async () => {
  const L = planDay(WEEKS[0], 3, 'race');
  const wall = L.signs.find((s) => s.design.mechanic === 'write-wall');
  // a near miss gen.js calls claimable (the meaning there, no key form wrong): the sentence cut before its last word
  let item = null, near = '';
  for (const it of wall.items) { const ref = String(it.meta.ref || it.en); const t = ref.replace(/[.!?]$/, '').split(' ').slice(0, -1).join(' '); const r = judgeAnswer(it, prompt(it), t); if (canClaim(it, prompt(it), r)) { item = it; near = t; break; } }
  assert.ok(item, 'a claimable near miss on the wall');
  const G3 = { id: 'gate:write', index: 9, locks: 0, queue: [] };
  for (const claim of [true, false]) {
    setBackend(memory()); const { F, S } = harness(L);
    const it = { ...item, _tries: 0 };
    const done = S.run({ items: [it], gate: G3, row: { e: { gate: 9, kind: 'glide', items: [], exit: true }, gate: 9, kind: 'glide', s: 40 } });
    await typeAndFire(S, near);
    assert.ok(S.held, 'held');
    assert.equal(leafOf(it.id), null, 'nothing written while held');
    assert.equal(F.log.filter((e) => e.name === 'learn:answer').length, 0, 'no learn:answer while held');
    assert.ok(!S.shot.calls.some((c) => c[0] === 'resolve'), 'the word plays no verdict while held');
    const v = F.strip.verdicts[F.strip.verdicts.length - 1].v;
    assert.ok(v.actions && v.actions.length === 2 && v.actions[0].text === '我的写法也对' && v.actions[1].text === '继续', 'the strip offers the claim and 继续');
    v.actions[claim ? 0 : 1].onTap();
    await tick(); await tick();
    await done;
    assert.deepEqual(leafOf(it.id).slice(0, 2), claim ? [1, 'S'] : [0, 'W']);
    assert.equal(F.log.filter((e) => e.name === 'learn:answer').length, 1, 'learn:answer once, after her tap');
    const res = S.shot.calls.find((c) => c[0] === 'resolve'); assert.equal(res[1].ok, claim);
    if (claim) assert.equal(F.queue.length, 0); else {
      assert.ok(F.queue.length === 1 && F.queue[0].kind === 'glide' && F.queue[0].items[0] === it, '继续: the miss, its other try (with the why)');
      // the other try (why first) offers no claim: the same near miss is judged straight away, nothing held
      const done2 = S.run({ items: [it], gate: G3, row: { e: F.queue[0], gate: 9, kind: 'glide', s: 40 } });
      await typeAndFire(S, near);
      assert.ok(!S.held, 'no 「我的写法也对」 on the other try');
      await done2;
    }
  }
});

test('the runner\'s one judging path writes what the race\'s card writes: every choice of w1d3 by lane (right / wrong), a typed word, a dictation — same leaf, same verdict, learn:answer once', () => {
  const L = planDay(WEEKS[0], 3, 'race');
  const at = Date.parse('2026-10-14T09:30:00');
  const runnerPath = (g, item, p, ans, hinted) => {
    const F = { firsts: 0, firstRight: 0, right: new Set(), log: [], _emit(n, d) { this.log.push({ name: n, ...d }); } };
    const out = RunnerFlow.prototype._judgeRecord.call(F, g, item, p, ans, { hinted, at });
    return { out, log: F.log };
  };
  const cardPath = (g, item, p, ans) => {   // race.js _answer up to its verdict (the part that judges and records)
    const F = { firsts: 0, firstRight: 0, right: new Set(), log: [], streak: 0, rightN: 0, relearn: [], P: LEARN.puzzle, shield: false,
      _emit(n, d) { this.log.push({ name: n, ...d }); }, _onRight() {}, _onWrong2() {}, _styleGates() {}, hud: { verdict(v) { F.v = v; } }, _askNext() {} };
    const now = Date.now; Date.now = () => at;
    try { RaceFlow.prototype._answer.call(F, { ...g, queue: [] }, { ...item, _tries: 9 }, p, ans); } finally { Date.now = now; }
    return F;
  };
  let n = 0;
  for (const g of L.gates) for (const item of g.items.filter((it) => it.meta.scored)) {
    const p = prompt(item);
    const answers = p.type === 'choice' ? [rightLane(item, rowPrompt(item, {})), (rightLane(item, rowPrompt(item, {})) + 1) % p.options.length] : [item.meta.ref || item.en, 'zzz'];
    for (const ans of answers) {
      setBackend(memory()); const A = runnerPath(g, item, p, ans, false); const evA = JSON.stringify(store.evidence());
      setBackend(memory()); const B = cardPath(g, item, p, ans); const evB = JSON.stringify(store.evidence());
      assert.equal(evA, evB, `${item.id} ${JSON.stringify(ans)}: the same evidence`);
      assert.equal(A.out.r.ok, B.v.ok); assert.equal(A.out.first, true);
      assert.equal(A.log.filter((e) => e.name === 'learn:answer').length, 1);
      n++;
    }
  }
  assert.ok(n > 60, `${n} answers compared`);
  // lane −1 (the gap) never reaches the path: rowAnswer's rule, kept by _settle
  setBackend(memory());
  const it = L.gates[0].items[0]; assert.equal(rowAnswer(it, prompt(it), -1).answered, false); assert.deepEqual(store.evidence(), {});
});
