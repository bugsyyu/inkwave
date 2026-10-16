// 节拍台 M3 (src/learn/play/beat/): the beat windows, the bar state machine, the pad layout per orientation, the input
// maps, and the stage itself built in Node —
//   · the window is never under ±150 ms and widens with a slow song (0.35 × stepDur)
//   · timing never changes correctness (PLAY §1 rule 4): the same pad comes out at any time, and the same pad judged
//     through engine.judge → store.recordFirst writes the same leaf on the beat and off it
//   · a whole answer bar with no input: the word once more, then defer — and no evidence (no recordFirst)
//   · the answer is taken when she lands, its on-beat-ness from when she jumped; the stage has no way to judge
// 用法：node --test tests/learn/*.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));   // `three` → vendor/ (no npm install here)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWeek, daySteps } from '../../src/learn/content.js';
import { judge } from '../../src/learn/engine.js';
import { store, setBackend } from '../../src/learn/store.js';
import { LEARN } from '../../src/config.js';
import { beatWindow, beatGrid, nearestBeat, onBeat, nextBar, beatPulse, gridFromMusic } from '../../src/learn/play/beat/clock.js';
import { BeatRound } from '../../src/learn/play/beat/round.js';
import { stageLayout, padOfTap, padOfSwipe, padOfKey, padRegionRadius, PAD_DIRS } from '../../src/learn/play/beat/pads.js';
const THREE = await import('three');
const { BeatStage } = await import('../../src/learn/play/beat/stage.js');

function memory() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; }
const W1 = await loadWeek(1);
const steps = daySteps(W1, 1);
const PAIRS = steps.find((s) => s.meta.type === 'pairs').items, SYMS = steps.find((s) => s.meta.type === 'symbols').items;
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e;

test('the beat window: never under ±150 ms; a slow song widens it to 0.35 × stepDur (the runner\'s contract)', () => {
  for (const bpm of [84, 105, 128, 140, 150, 200]) {
    const g = beatGrid(bpm, 0);
    assert.ok(g.win >= 0.15 - 1e-9, `${bpm} bpm`);
    assert.ok(near(g.step, 60 / bpm / 4) && near(g.bar, 240 / bpm) && near(g.win, beatWindow(g.step)));
  }
  assert.equal(beatWindow(0.1), 0.15);
  assert.equal(beatWindow(0.5), 0.175);                       // 0.35 × 0.5
  assert.ok(near(beatGrid(30, 0).win, 0.175));               // the slowest grid there is: the scaled branch
  assert.equal(beatWindow(undefined), 0.15);
  // the grid: nearest beat, downbeats, the next bar line, the pulse
  const g = beatGrid(120, 1);   // a beat every 0.5 s from t = 1
  assert.deepEqual(nearestBeat(g, 3.1), { t: 3, k: 4, off: 0.10000000000000009, down: true });
  assert.equal(nearestBeat(g, 2.6).down, false);
  assert.ok(onBeat(g, 3.149) && !onBeat(g, 3.16) && onBeat(g, 2.851));
  assert.equal(nextBar(g, 1.01), 3); assert.equal(nextBar(g, 3), 3); assert.equal(nextBar(g, 0), 1);
  assert.ok(beatPulse(g, 3.0) > 0.99 && beatPulse(g, 3.5) < 0.61 && beatPulse(g, 3.45) < 0.02 && beatPulse(g, 0.5) === 0);
});

test('the grid follows music.js: a synth track on the game clock; a recording (no tempo) falls back, cached', () => {
  const cur = { song: { bpm: 128 }, t0: 5 };
  const mu = { current: cur, ctx: {}, now: () => 10 };
  const c = {};
  const g = gridFromMusic(mu, 100, 105, c);
  assert.ok(near(g.bpm, 128) && near(g.t0, 95));   // the downbeat at audio 5 = game 100 − (10 − 5)
  assert.equal(gridFromMusic(mu, 100.016, 105, c), g, 'the same grid while the clocks agree (no allocation per frame)');
  const file = { current: { id: 'menu', el: {} }, ctx: {}, now: () => 10 };   // a FileTrack: no song, no bpm
  const c2 = {};
  const f = gridFromMusic(file, 50, 105, c2);
  assert.ok(near(f.bpm, 105) && f.t0 === 50);
  assert.equal(gridFromMusic(file, 51, 105, c2), f, 'the fallback grid stays put');
  assert.ok(near(gridFromMusic(null, 3, 105).bpm, 105));
});

test('a round: the word on a bar line, the hop on the next downbeat; a tap before the word is no answer', () => {
  const g = beatGrid(105, 0), r = new BeatRound({ lead: 0.45 });
  r.start(g, 0.2);
  assert.ok(near(r.W, nextBar(g, 0.65)) && near(r.D, r.W + g.bar) && near(r.end, r.D + g.bar));
  assert.equal(r.tick(r.W - 0.01), null);
  assert.equal(r.input(r.W - 0.01, 0), null, 'before the word: she has heard nothing');
  const e = r.tick(r.W);
  assert.equal(e.type, 'speak'); assert.equal(e.replay, 0);
  assert.equal(r.tick(r.W + 0.5), null);
  const a = r.input(r.D + 0.12, 1);
  assert.deepEqual([a.pad, a.onBeat], [1, true]);
  assert.equal(r.input(r.D + 0.2, 0), null, 'one answer per round');
  assert.equal(r.tick(r.end + 5), null, 'answered: no silent bar after it');
});

test('timing never changes correctness: the same pad at any moment, the same verdict and the same leaf', () => {
  const g = beatGrid(105, 0);
  const item = PAIRS[0], right = item.answer;
  const verdicts = new Set(), leaves = [];
  for (const off of [-2.2, -1.0, -0.3, -0.14, 0, 0.1, 0.149, 0.16, 0.5, 1.4, 2.2]) {
    const r = new BeatRound(); r.start(g, 0); while (r.tick(r.W)); // (the word has played)
    const t = Math.max(r.W, r.D + off);
    const a = r.input(t, right);
    assert.equal(a.pad, right, `off ${off}: the pad is the pad`);
    assert.equal(a.onBeat, Math.abs(t - r.D) <= g.win + 1e-9);
    const v = judge(item, a.pad);
    verdicts.add(v.ok);
    // the flow's path: judge → recordFirst (a fresh day each time: the leaf, not the first-of-day rule, is compared)
    setBackend(memory()); store.load();
    const rec = store.recordFirst({ itemId: item.id, item, ok: v.ok, at: Date.UTC(2026, 9, 16, 4, 0, 0) });
    leaves.push(JSON.stringify(rec.leaf));
  }
  assert.deepEqual([...verdicts], [true]);
  assert.equal(new Set(leaves).size, 1, 'on the beat or off it: one leaf');
  assert.equal(leaves[0], JSON.stringify([1, 'L']));
  // and a wrong pad is wrong on the beat too
  const r = new BeatRound(); r.start(g, 0); while (r.tick(r.W));
  const a = r.input(r.D, 1 - right);
  assert.equal(a.onBeat, true); assert.equal(judge(item, a.pad).ok, false);
});

test('a silent bar: the word once more, then defer — and nothing is written', () => {
  setBackend(memory()); store.load();
  const g = beatGrid(105, 0), r = new BeatRound();
  r.start(g, 0);
  const events = [];
  // the flow's handlers: speak plays, defer requeues; only an answer would judge and record
  const flow = { speak: (n) => events.push('speak' + n), defer: () => events.push('defer'), answer: (pad) => { const v = judge(PAIRS[0], pad); store.recordFirst({ itemId: PAIRS[0].id, item: PAIRS[0], ok: v.ok }); events.push('answer'); } };
  for (let t = 0; t < 30; t += 1 / 60) {
    let e;
    while ((e = r.tick(t))) { if (e.type === 'speak') flow.speak(e.replay); else if (e.type === 'silent') events.push('silent'); else if (e.type === 'defer') flow.defer(); }
    if (r.phase === 'deferred') break;
  }
  assert.deepEqual(events, ['speak0', 'silent', 'speak1', 'defer']);
  assert.deepEqual(store.evidence(), {}, 'no evidence for a question nobody answered');
  // the replay's downbeat is a bar after its own word, and the deferred round takes no hop
  assert.equal(r.input(30, 0), null);
});

test('the pads per orientation: framed in the safe band, labels ≥ 17 px, tap regions ≥ 44 pt, sides where they belong', () => {
  const screens = [[390, 844], [844, 390], [1280, 720], [820, 1180], [1180, 820], [375, 667]];
  for (const [W, H] of screens) for (const n of [2, 4]) {
    const L = stageLayout(n, W / H, { W, H });
    const tag = `${W}×${H} n=${n}`;
    assert.ok(L.cam.fits, `${tag}: everything in the band`);
    assert.equal(L.orientation, W < H ? 'portrait' : 'landscape');
    for (const l of L.px.label) assert.ok(l.zh >= LEARN.beat.font - 0.05 && l.en > l.zh, `${tag}: label lines ${l.en} / ${l.zh} px`);
    const pts = L.px.pads.map((p) => ({ x: (p.x + 1) / 2 * W, y: (1 - p.y) / 2 * H }));
    for (const d of padRegionRadius(pts, W, H)) assert.ok(d >= 22 + 10, `${tag}: a pad's tap region ${d.toFixed(0)} px from its centre`);
    const at = (dir) => pts[PAD_DIRS[n].indexOf(dir)];
    assert.ok(at('left').x < W / 2 && at('right').x > W / 2, `${tag}: left is left`);
    if (n === 2) {
      assert.equal(padOfTap(W * 0.2, H * 0.6, pts), 0); assert.equal(padOfTap(W * 0.8, H * 0.3, pts), 1);
      assert.equal(padOfTap(W * 0.49, H * 0.9, pts), 0); assert.equal(padOfTap(W * 0.51, H * 0.1, pts), 1);
    } else {
      assert.ok(at('up').y < at('down').y, `${tag}: up is up`);
      assert.equal(padOfTap(W / 2, H * 0.22, pts), 0, `${tag}: the top of the screen → ↑`);
      assert.equal(padOfTap(W * 0.06, H * 0.55, pts), 1, `${tag}: the left edge → ←`);
      assert.equal(padOfTap(W * 0.94, H * 0.55, pts), 2, `${tag}: the right edge → →`);
      assert.equal(padOfTap(W / 2, H * 0.97, pts), 3, `${tag}: the bottom → ↓`);
    }
  }
  // the two layouts really differ: portrait deep and narrow, landscape wide and shallow
  const p = stageLayout(4, 390 / 844), l = stageLayout(4, 844 / 390);
  const span = (L, k) => Math.max(...L.pads.map((q) => Math.abs(q[k])));
  assert.ok(span(p, 'x') < span(l, 'x') && span(p, 'z') > span(l, 'z'));
});

test('swipes and keys: by side; letters and digits in option order; nothing else', () => {
  assert.equal(padOfSwipe(-80, 10, 2), 0); assert.equal(padOfSwipe(90, -20, 2), 1);
  assert.equal(padOfSwipe(10, -90, 2), -1, 'two pads: up is no pad'); assert.equal(padOfSwipe(20, 5, 2), -1, 'too short');
  assert.equal(padOfSwipe(5, -90, 4), 0); assert.equal(padOfSwipe(-90, 30, 4), 1); assert.equal(padOfSwipe(90, 30, 4), 2); assert.equal(padOfSwipe(-20, 80, 4), 3);
  assert.deepEqual(['ArrowLeft', 'ArrowRight', 'a', 'B', '1', '2', 'c', 'ArrowUp', 'x'].map((k) => padOfKey(k, 2)), [0, 1, 0, 1, 0, 1, -1, -1, -1]);
  assert.deepEqual(['ArrowUp', 'ArrowLeft', 'ArrowRight', 'ArrowDown', 'a', 'b', 'c', 'd', '4', 'e'].map((k) => padOfKey(k, 4)), [0, 1, 2, 3, 0, 1, 2, 3, 3, -1]);
});

test('the stage has no way to judge: no engine / store, no item answer in its source', () => {
  for (const f of ['clock', 'round', 'pads', 'stage', 'mats']) {
    const src = readFileSync(new URL(`../../src/learn/play/beat/${f}.js`, import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.ok(!/from '[^']*(engine|store|api|forms\/common)\.js'/.test(src), `${f}.js imports no judge`);
    assert.ok(!/\bjudge\s*\(|recordFirst|item\.answer|\.answer\s*===/.test(src), `${f}.js never judges`);
  }
});

function mockActor() {
  const calls = [];
  const character = { trigger: (n, a) => calls.push(n), setDance: (d) => calls.push('dance:' + d) };
  return { character, pos: new THREE.Vector3(), vel: new THREE.Vector3(), yaw: 0, calls };
}
function stageOf(opts = {}) {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(52, 390 / 844, 0.1, 500);
  const s = new BeatStage({ scene, camera, team: 0, color: '#ff8a14', ...opts });
  const g = beatGrid(105, 0); s.gridSource = () => g;
  return { s, g, scene, camera };
}
const run = (s, from, to, dt = 1 / 60) => { let t = from; while (t < to - 1e-9) { t += dt; s.update(dt, t); } return t; };

test('the stage: the answer is taken when she lands; on-beat from when she jumped; a dance only for a right one', () => {
  const { s } = stageOf();
  const a = mockActor(); s.mount(a);
  s.open({ origin: new THREE.Vector3(2, 0, 3), yaw: 0.3, n: 2, aspect: 390 / 844 });
  const got = [];
  s.on.speak = (rep) => got.push('speak' + rep);
  s.on.answer = (pad, info) => { got.push({ pad, info, t: s.t }); s.resolve({ ok: pad === PAIRS[0].answer, right: PAIRS[0].answer }); };
  const q = s.ask({ labels: [{ en: 'sheep', zh: '羊' }, { en: 'ship', zh: '船' }], now: 0 });
  let t = run(s, 0, q.D - 0.1);
  assert.deepEqual(got, ['speak0']);
  const r = s.input(PAIRS[0].answer, t);
  assert.ok(r && r.onBeat, 'jumped 0.1 s before the downbeat: on the beat');
  assert.equal(got.length, 1, 'no answer while she is in the air');
  t = run(s, t, t + LEARN.beat.hop + 0.05);
  assert.equal(got.length, 2);
  assert.equal(got[1].pad, PAIRS[0].answer); assert.equal(got[1].info.onBeat, true);
  assert.ok(got[1].t > q.D, 'she lands after the downbeat she jumped on — the answer is taken then');
  assert.ok(a.calls.includes('jump') && a.calls.includes('land') && a.calls.includes('dance:victory'));
  s.carry(a);
  assert.ok(a.pos.distanceTo(new THREE.Vector3(2, 0, 3)) > 1, 'she stands on the pad now');
  run(s, t, t + LEARN.beat.danceFor + 0.1);
  assert.equal(a.calls[a.calls.length - 1], 'dance:null', 'the flourish ends');
  // the verdict holds, then the stage is open for the next question
  run(s, s.t, s.t + LEARN.beat.verdictMs / 1000 + 0.1);
  assert.equal(s.phase, 'open');
});

test('the stage: off the beat a right pad is right without a dance; wrong lights the right pad; reduced motion never dances', () => {
  for (const reduced of [false, true]) {
    const { s } = stageOf({ reduced });
    const a = mockActor(); s.mount(a);
    s.open({ origin: new THREE.Vector3(), yaw: 0, n: 4, aspect: 844 / 390 });
    const said = [];
    s.on.say = (text, o) => said.push([text, o.coral]);
    let res = null;
    s.on.answer = (pad, info) => { res = info; s.resolve({ ok: true, right: pad }); };
    const q = s.ask({ labels: SYMS[0].options, now: 0 });
    let t = run(s, 0, q.D + 0.6);
    s.input(2, t);
    t = run(s, t, t + 0.6);
    assert.equal(res.onBeat, false);
    assert.ok(!a.calls.some((c) => c.startsWith('dance:victory')), 'off the beat: no dance');
    run(s, t, t + 1.3);
    // a wrong one, on the beat
    const q2 = s.ask({ labels: SYMS[1].options, now: s.t });
    s.on.answer = (pad) => { s.resolve({ ok: false, right: 0, canonical: 'see（看见）' }); };
    t = run(s, s.t, q2.D);
    s.input(3, t);
    run(s, t, t + 0.6);
    assert.deepEqual(said[said.length - 1], ['差一点：是 see（看见）', true]);
    assert.equal(s.P[4].state, 'coral'); assert.equal(s.P[1].state, 'hint');
    assert.ok(!a.calls.some((c) => c === 'dance:victory'), 'wrong on the beat: no dance');
    if (reduced) assert.ok(!a.calls.some((c) => c === 'dance:victory'));
  }
  // and on the beat, reduced motion still takes the answer, without the flourish
  const { s } = stageOf({ reduced: true }); const a = mockActor(); s.mount(a);
  s.open({ origin: new THREE.Vector3(), n: 2, aspect: 1 });
  let info = null; s.on.answer = (p, i) => { info = i; s.resolve({ ok: true, right: p }); };
  const q = s.ask({ labels: PAIRS[1].options, now: 0 });
  const t = run(s, 0, q.D); s.input(0, t); run(s, t, t + 0.5);
  assert.equal(info.onBeat, true);
  assert.ok(!a.calls.includes('dance:victory'));
});

test('the stage: two silent bars defer the question — no answer handler, no evidence; taps go to pads, keys are eaten', () => {
  setBackend(memory()); store.load();
  const { s } = stageOf();
  s.open({ origin: new THREE.Vector3(), n: 2, aspect: 390 / 844 });
  const got = [];
  s.on.speak = (r) => got.push('speak' + r); s.on.defer = () => got.push('defer');
  s.on.answer = () => { got.push('answer'); store.recordFirst({ itemId: PAIRS[0].id, item: PAIRS[0], ok: true }); };
  const q = s.ask({ labels: PAIRS[0].options, now: 0 });
  run(s, 0, q.D + 3 * beatGrid(105, 0).bar + 0.1);
  assert.deepEqual(got, ['speak0', 'speak1', 'defer']);
  assert.deepEqual(store.evidence(), {});
  assert.equal(s.phase, 'open');
  // keys while a question is up: the pad keys answer, the walk keys are eaten (A must never walk her)
  s.ask({ labels: PAIRS[0].options, now: s.t });
  assert.equal(s.key({ key: 'w' }), true);
  assert.equal(s.key({ key: 'Escape' }), false, 'Esc stays the pause');
  assert.equal(s.key({ key: 'a', metaKey: true }), false);
});
