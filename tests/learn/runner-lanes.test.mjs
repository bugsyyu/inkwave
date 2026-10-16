// src/learn/play/runner/lanes.js — 墨浪跑酷's lane rules (docs/PLAY.md §3 M2 / M3, §1 rules 4–5): lane centres and the
// dividers she starts on, which curtain an offset passes through (the gap = no answer), one swipe's lane change, the
// reading lead before a row, the beat window and grid (music.js's grid on the game clock), the tide that lands a beat
// row on a downbeat. Pure: no content, no three.js.
// 用法：node --test tests/learn/runner-*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { laneCenters, dividers, dividerStart, laneOf, nextLane, labelChars, readLead, leadDistance, beatWindow, beatGrid, nearestBeat, onBeat, nextBar, beatPulse, syncTide } from '../../src/learn/play/runner/lanes.js';
import { LEARN, PLAYER } from '../../src/config.js';

const near = (a, b, e = 1e-9) => Math.abs(a - b) <= e;

test('lanes: centres left → right around the row centre, the dividers between them, the divider she starts on', () => {
  assert.deepEqual(laneCenters(2, 1.5), [-0.75, 0.75]);
  assert.deepEqual(laneCenters(3, 1.5), [-1.5, 0, 1.5]);
  assert.deepEqual(laneCenters(4, 1.5, 0.5), [-1.75, -0.25, 1.25, 2.75]);
  assert.deepEqual(dividers(2, 1.5), [0]);
  assert.deepEqual(dividers(4, 1.5), [-1.5, 0, 1.5]);
  assert.deepEqual(dividers(3, 1.5, 1), [0.25, 1.75]);
  // she is carried onto a divider: 2 and 4 lanes → the middle one; 3 lanes → the one nearer where she is
  assert.equal(dividerStart(2, 1.5, 0, 0.6), 0);
  assert.equal(dividerStart(4, 1.5, 0, -0.2), 0);
  assert.equal(dividerStart(3, 1.5, 0, 0.4), 0.75);
  assert.equal(dividerStart(3, 1.5, 0, -2), -0.75);
  assert.equal(dividerStart(2, 1.5, -1.2, 0), -1.2, 'an off-centre row (the clearance scan moved it): its own divider');
});

test('laneOf: inside a curtain = that lane; the open ink between curtains (where every row starts her) and outside = −1 (no answer)', () => {
  const W = LEARN.runner.laneW, gap = LEARN.runner.gap;
  for (const n of [2, 3, 4]) {
    const cs = laneCenters(n, W);
    cs.forEach((c, i) => {
      assert.equal(laneOf(c, n, W, 0, gap), i);
      assert.equal(laneOf(c + (W - gap) / 2 - 0.01, n, W, 0, gap), i, 'the curtain edge is still the curtain');
    });
    for (const d of dividers(n, W)) {
      assert.equal(laneOf(d, n, W, 0, gap), -1, `${n} lanes: the divider ${d} is the gap`);
      assert.equal(laneOf(d + 0.2, n, W, 0, gap), -1, 'the gap is gap wide');
    }
    assert.equal(laneOf(cs[n - 1] + W, n, W, 0, gap), -1, 'past the last curtain');
  }
  assert.equal(laneOf(0.75 + 0.8, 2, 1.5, 0.8, 0.5), 1, 'an off-centre row');
  // a row starting her on its divider and her not moving = no answer
  for (const n of [2, 3, 4]) assert.equal(laneOf(dividerStart(n, 1.5, 0, 0), n, 1.5, 0, 0.5), -1);
});

test('nextLane: one swipe from the divider is the half-lane next to it, then a lane at a time; never off the row', () => {
  const c4 = laneCenters(4, 1.5);
  let t = dividerStart(4, 1.5, 0, 0);
  t = nextLane(t, 1, c4); assert.equal(t, 0.75);
  t = nextLane(t, 1, c4); assert.equal(t, 2.25);
  t = nextLane(t, 1, c4); assert.equal(t, 2.25, 'the outer lane stays');
  t = nextLane(t, -1, c4); assert.equal(t, 0.75);
  const c2 = laneCenters(2, 1.5);
  assert.equal(nextLane(0, -1, c2), -0.75); assert.equal(nextLane(-0.75, -1, c2), -0.75); assert.equal(nextLane(-0.75, 1, c2), 0.75);
});

test('reading time: 2.5 s + 0.06 s per character of the longest label, capped at 6 s; the distance at the slowed tide', () => {
  const L = LEARN.runner.lead;
  assert.equal(labelChars('星期 一'), 3);
  assert.equal(readLead(['星期一', '星期二'], L), 2.68);
  assert.equal(readLead(['a'.repeat(19)], L), 3.64);
  assert.equal(readLead(['x'.repeat(54)], L), 5.74, 'the longest option in the course (a reading question)');
  assert.equal(readLead(['x'.repeat(80)], L), 6, 'capped');
  assert.equal(readLead([], L), 2.5);
  const v = PLAYER.swimSpeed * LEARN.runner.tide;
  assert.ok(near(leadDistance(3.64, v), +(3.64 * v).toFixed(2)));
  assert.ok(leadDistance(readLead(['x'.repeat(54)], L), v) < 45, 'the farthest a row ever shows up is under 45 m');
});

test('beat window: never under ±150 ms; music.js\'s sixteenth (stepDur) scaled by 0.35 — 150 ms at every tempo the game has', () => {
  for (const bpm of [84, 105, 124, 128, 140, 150]) assert.equal(beatWindow(60 / bpm / 4), 0.15, bpm + ' bpm');
  assert.equal(beatWindow(1), 0.35, 'a slower step widens it');
  assert.equal(beatWindow(0), 0.15);
  const g = beatGrid(120, 10);
  assert.equal(g.beat, 0.5); assert.equal(g.bar, 2); assert.equal(g.step, 0.125); assert.equal(g.win, 0.15);
  assert.ok(onBeat(g, 11.0)); assert.ok(onBeat(g, 11.14)); assert.ok(onBeat(g, 10.86)); assert.ok(!onBeat(g, 11.16)); assert.ok(!onBeat(g, 11.25));
  const nb = nearestBeat(g, 12.1); assert.equal(nb.t, 12); assert.ok(near(nb.off, 0.1, 1e-9)); assert.equal(nb.down, true);
  assert.equal(nearestBeat(g, 12.5).down, false);
  assert.equal(nextBar(g, 10.1), 12); assert.equal(nextBar(g, 12), 12); assert.equal(nextBar(g, 3), 10);
  assert.ok(beatPulse(g, 12.0) > 0.99 && beatPulse(g, 12.5) > 0.59 && beatPulse(g, 12.4) < 0.05, 'a kick on each beat, bigger on the downbeat');
});

test('syncTide: a beat row\'s tide brings her to the row on a bar line, the tide inside [kmin, kmax]', () => {
  const g = beatGrid(128, 0), v = PLAYER.swimSpeed;
  for (const dist of [12, 20, 31, 44]) for (const now of [0.3, 3.1, 7.77]) {
    const r = syncTide(dist, v, g, now, 0.45, 0.85);
    assert.ok(r.k >= 0.45 && r.k <= 0.85, 'tide ' + r.k);
    const arrive = now + dist / (v * r.k);
    const onBar = Math.abs(nextBar(g, arrive - 1e-3) - arrive) < 0.02;
    assert.ok(onBar || r.k === 0.85, `dist ${dist} now ${now}: arrives ${arrive.toFixed(3)} on a bar (${r.at.toFixed(3)})`);
  }
});
