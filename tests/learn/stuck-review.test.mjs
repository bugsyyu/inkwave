// LEARN §48 review (10-25): the read-only audit's dead ends that wf-softlock left (its X1 list, D / I) — fixed on the merged
// tree and held here:
//   · the beat pads: the strip said 「下一拍跳上去」 while the 「跳」 key does nothing at a station (she is held still); a
//     question she never answers was put back for ever — now the back of the gate twice, then left for another day, as the
//     runner does; the touch layer dims 跳 / 潜墨 while a station holds her still
//   · the ink targets: the fallback that lets them up when the lens never settles counted on the framing's clock, which
//     stops at frameFor — it could never fire; it counts from the question now
// 用法：node --test tests/learn/*.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = (p) => readFileSync(new URL('../../' + p, import.meta.url), 'utf8');
const { BeatStation } = await import('../../src/learn/play/wire/beat.js');

test('the beat pads: a question she leaves unanswered goes to the back of the gate twice, then is left for another day — nothing written, the gate goes on', () => {
  const asked = [], skips = [], verdicts = [];
  const g = { id: 'w2d3:a2', queue: [] }, item = { id: 'w2:ipa:3' }, other = { id: 'w2:ipa:4' };
  const S = Object.create(BeatStation.prototype);
  Object.assign(S, {
    log: [],
    flow: { t: 0, _emit: (name, d) => { if (name === 'learn:skip') skips.push(d); }, _askNext: (gg) => asked.push(gg.id) },
    host: { strip: { verdict: (v) => verdicts.push(v.head) } },
  });
  const round = (it) => { S.cur = { g, item: it, p: {}, t: 0, answered: false }; S._defer(); };
  round(item);
  assert.deepEqual(g.queue.map((x) => x.id), [item.id], '1st time: to the back of the gate');
  g.queue.length = 0; round(item);
  assert.deepEqual(g.queue.map((x) => x.id), [item.id], '2nd time: once more');
  g.queue.length = 0; round(other);
  assert.deepEqual(g.queue.map((x) => x.id), [other.id], 'another question counts on its own');
  g.queue.length = 0; round(item);
  assert.equal(g.queue.length, 0, '3rd time: not put back — the gate can open');
  assert.deepEqual(skips, [{ itemId: item.id, gate: g.id, type: 'beat', why: 'noanswer' }], 'learn:skip says so (nothing is written for a no-answer)');
  assert.deepEqual(verdicts, ['这题放到后面再来', '这题放到后面再来', '这题放到后面再来', '没选 — 这一题留到下次']);
  assert.deepEqual(asked, [g.id, g.id, g.id, g.id], 'and the gate asks on every time');
  assert.equal(S.cur, null);
});

test('the beat pads: the strip says to tap a pad (not 「跳」); 跳 / 潜墨 are dimmed while a station holds her still, and the class goes with the level', () => {
  const B = src('src/learn/play/wire/beat.js'), H = src('src/learn/play/host.js'), CSS = src('styles/hud.css'), T = src('src/core/touch.js');
  assert.match(B, /zh: p\.zh \|\| \(n === 2 \? '听完，下一拍点你选的台子' : '下一拍点你选的台子'\)/);
  assert.doesNotMatch(B, /跳上去'/);
  assert.match(H, /const still = !!\(a && S && S\.still\); if \(this\._stillKeys !== still\) \{ this\._stillKeys = still; G\.touch\?\.el\?\.classList\?\.toggle\('is-still', still\); \}/);
  assert.match(H, /if \(this\._stillKeys\) \{ this\._stillKeys = false; G\.touch\?\.el\?\.classList\?\.remove\('is-still'\); \}/, 'dispose takes it off');
  // (the keys: the touch layer appends LAYOUT then TOP_LAYOUT — 2 = 跳, 3 = 潜墨)
  const L = T.slice(T.indexOf('const LAYOUT'), T.indexOf('const TOP_LAYOUT'));
  assert.deepEqual([...L.matchAll(/name: '([a-z]+)'/g)].map((m) => m[1]).slice(0, 3), ['fire', 'jump', 'squid']);
  assert.match(CSS, /\.iw-touch\.is-learn\.is-still \.iw-touch__btn:nth-child\(2\), \.iw-touch\.is-learn\.is-still \.iw-touch__btn:nth-child\(3\) \{ opacity: \.32; transition: opacity \.2s; \}/);
});

test('the ink targets: when the lens never settles they come up frameFor + 0.6 s after the question, not never', () => {
  const R = src('src/learn/play/run.js');
  assert.match(R, /if \(!C\.placed && !\(Fr && Fr\.on\) && \(this\._settled\(\) \|\| C\.t > M\.frameFor \+ 0\.6\)\) this\._place\(\);/);
  assert.doesNotMatch(R, /Fr\.t > M\.frameFor \+ 0\.6/, 'the framing clock stops at frameFor: that test could never pass');
  assert.match(R, /C\.t \+= dt;/, 'the question\'s clock runs every update');
});
