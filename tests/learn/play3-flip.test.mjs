// 翻牌靶 M8 (src/learn/play/flip/): the review day's 150 flip cards as ink cards and two rating targets —
//   · equivalence with the card (hud-learn.js / LEARN §15): 认识 is the card's 记得 (true), 不熟 its 不记得 (false); fed
//     to the flow's own answer path (LearnFlow.prototype._answer: flipJudge → recordFirst({ how: 'F' })) they write the
//     very same leaf, and 不熟 re-queues the word typed (item._flipTyped) exactly as the card does
//   · no rating before the flip; the targets come only with the back; a tap on the card flips it, a tap on a target rates
//   · 不熟 is no mistake: no coral, and the typing weapon gets the word (on.typeIt)
// 用法：node --test tests/learn/*.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWeek, daySteps } from '../../src/learn/content.js';
import { store, setBackend } from '../../src/learn/store.js';
import { LEARN } from '../../src/config.js';
const THREE = await import('three');
const { FlipDeck, RATE } = await import('../../src/learn/play/flip/deck.js');
const { InkTargets, pickTarget } = await import('../../src/learn/play/flip/targets.js');
const { LearnFlow } = await import('../../src/learn/flow.js');
const { flipPrompt, isFlipGate } = await import('../../src/learn/forms/common.js');
const { planDay } = await import('../../src/learn/design.js');

function memory() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; }
const W1 = await loadWeek(1);
const FLASH = daySteps(W1, 7).find((s) => s.meta.type === 'flash' && s.items.length > 60);
const step = (o, s, dt = 1 / 60) => { for (let i = 0; i < Math.round(s / dt); i++) o.update(dt); };

// the flow's own answer path, on a stub flow (the parts _answer touches)
function answerThroughFlow(item, ans) {
  const verdicts = [];
  const flow = { P: LEARN.puzzle, firsts: 0, right: new Set(), _emit() {}, _styleGates() {}, hud: { verdict: (v) => verdicts.push(v) } };
  const g = { id: 'gate:w1d7:flash', locks: 0, queue: [] };
  const p = flipPrompt(item);
  LearnFlow.prototype._answer.call(flow, g, item, p, ans);
  return { flow, g, verdicts };
}
const leafOf = (id) => { const ev = store.evidence(); for (const doc of Object.values(ev)) { const d = doc.it[id]; if (d) { const day = Object.values(d)[0]; return Object.values(day)[0]; } } return null; };

test('the card\'s buttons: 记得 submits true, 不记得 false (what the targets must reproduce)', () => {
  const src = readFileSync(new URL('../../src/ui/hud-learn.js', import.meta.url), 'utf8');
  assert.match(src, /know\.addEventListener\('click', \(\) => this\._submit\(true\)\)/);
  assert.match(src, /forgot\.addEventListener\('click', \(\) => this\._submit\(false\)\)/);
  assert.deepEqual(RATE.map((r) => r.answer), [true, false]);
  assert.deepEqual(RATE.map((r) => r.zh), ['认识', '不熟']);
});

test('认识 / 不熟 through the flow\'s path write exactly what the card\'s 记得 / 不记得 write: [1, F] / [0, F]', () => {
  assert.ok(FLASH && FLASH.items.length === 150, 'the review day\'s 150 words');
  const plan = planDay(W1, 7, 'race');
  assert.ok(plan.gates.some((g) => isFlipGate(g)), 'a flash-flip gate on day 7');
  for (const [k, cardAns] of [[0, true], [1, false]]) {
    const item = { ...FLASH.items[k * 7] };
    // the deck: rise → tap the card → the back → hit the target; its rate() is what the flow receives
    const deck = new FlipDeck({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), color: '#ff8a14' });
    let rated;
    deck.on.rate = (ans) => { rated = ans; };
    deck.ask({ item, at: new THREE.Vector3(0, 0, 3), yaw: Math.PI });
    step(deck, LEARN.flip.rise + 0.1);
    assert.equal(deck.hit(k), false, 'no rating before the flip');
    assert.equal(deck.hit('card'), true);
    step(deck, LEARN.flip.turn + 0.1);
    assert.equal(deck.phase, 'back');
    assert.equal(deck.hit(k), true);
    assert.equal(rated, cardAns, 'the target gives the card\'s answer');
    // the same answer through the same path, the card's and the deck's: the same leaf
    setBackend(memory()); store.load();
    const A = answerThroughFlow(item, cardAns);
    const cardLeaf = leafOf(item.id);
    setBackend(memory()); store.load();
    const B = answerThroughFlow({ ...item }, rated);
    const deckLeaf = leafOf(item.id);
    assert.deepEqual(deckLeaf, cardLeaf);
    assert.deepEqual(deckLeaf, [cardAns ? 1 : 0, 'F']);
    assert.equal(A.flow.firsts, 1); assert.equal(B.flow.firsts, 1);
    assert.equal(B.verdicts[0].ok, cardAns);
    if (!cardAns) {
      assert.equal(B.g.queue[0].id, item.id, '不熟: the word comes straight back …');
      assert.equal(B.g.queue[0]._flipTyped, true, '… as the typed card (the typing weapon)');
      assert.equal(B.g.locks, 0, 'no lock: 不记得 is no mistake');
    }
  }
});

test('the show: 认识 bursts the card in her ink; 不熟 sinks it with no coral and hands the word to the typing weapon', async () => {
  for (const ok of [true, false]) {
    const deck = new FlipDeck({ scene: new THREE.Scene(), camera: new THREE.PerspectiveCamera(), color: '#ff8a14' });
    const item = FLASH.items[3];
    const typed = [];
    deck.on.typeIt = (it) => typed.push(it.id);
    deck.ask({ item, at: new THREE.Vector3(), yaw: 0 });
    step(deck, 0.7); deck.hit('card'); step(deck, 0.6); deck.hit(ok ? 0 : 1);
    const done = deck.resolve({ ok });
    step(deck, 1.2);
    await done;
    const states = deck.T.objs.slice(0, 2).map((o) => o.state);
    assert.ok(!states.includes('coral'), `${ok}: no coral on a self-rating`);
    if (ok) { assert.equal(deck.card.visible, false); assert.deepEqual(typed, []); }
    else { assert.deepEqual(typed, [item.id]); assert.equal(states[1], 'dim'); }
  }
});

test('taps: the card flips under a thumb, the targets are picked like play-1\'s balls (≥ 44 pt, nearest wins)', () => {
  for (const [W, H] of [[390, 844], [844, 390]]) {
    globalThis.innerWidth = W; globalThis.innerHeight = H;
    const camera = new THREE.PerspectiveCamera(52, W / H, 0.1, 200);
    const deck = new FlipDeck({ scene: new THREE.Scene(), camera, color: '#ff8a14' });
    deck.ask({ item: FLASH.items[0], at: new THREE.Vector3(1, 0, 2), yaw: 0.4, aspect: W / H });
    const f = deck.frame(W / H);
    assert.ok(f.fits, `${W}×${H}: the card and both targets in the band`);
    camera.position.copy(f.pos); camera.lookAt(f.look); camera.fov = f.fov; camera.updateMatrixWorld(); camera.updateProjectionMatrix();
    step(deck, 0.7);
    // the card's centre on the screen
    const c = new THREE.Vector3(0, LEARN.flip.lift, 0).applyMatrix4(deck.group.matrixWorld).project(camera);
    const cx = (c.x + 1) / 2 * W, cy = (1 - c.y) / 2 * H;
    assert.equal(deck.tapApi.down(cx, cy, 1), true); deck.tapApi.up(cx, cy, 1, false);
    assert.equal(deck.phase, 'turn');
    step(deck, 0.6);
    const P = deck.T.project(camera, W, H);
    assert.equal(P.length, 2);
    assert.ok(P[0].cx < P[1].cx, `${W}×${H}: 认识 on the left, 不熟 on the right`);
    for (const p of P) { assert.ok(p.cx > 0 && p.cx < W && p.cy > 0 && p.cy < H, 'on screen'); assert.ok(p.label.h * 160 / 160 > 10); }
    let rated = null; deck.on.rate = (a) => { rated = a; };
    assert.equal(pickTarget(P[1].cx, P[1].cy, P), 1);
    assert.equal(pickTarget(-50, -50, P), -1);
    deck.tapApi.down(P[1].label.x + P[1].label.w / 2, P[1].label.y + P[1].label.h / 2, 2); deck.tapApi.up(P[1].label.x + P[1].label.w / 2, P[1].label.y + P[1].label.h / 2, 2, false);
    assert.equal(rated, false, '不熟 by its label');
  }
});

test('the rating targets are a thin adapter with play-1\'s PlayTargets surface (swap = one constructor)', () => {
  const T = new InkTargets({ scene: new THREE.Scene() });
  for (const m of ['atlas', 'freeAtlas', 'show', 'state', 'burst', 'hide', 'update', 'project', 'centre', 'setInk', 'warm', 'dispose']) assert.equal(typeof T[m], 'function', m);
  assert.ok(Array.isArray(T.spheres));
  const deck = new FlipDeck({ scene: new THREE.Scene(), targets: T });
  assert.equal(deck.T, T);
  // hit shapes for a deliberate shot: the card before the flip, the targets after
  deck.ask({ item: FLASH.items[1], at: new THREE.Vector3(), yaw: 0 });
  step(deck, 0.7);
  assert.deepEqual([...new Set(deck.hitShapes().map((s) => s.target))], ['card']);
  deck.hit('card'); step(deck, 0.6);
  assert.deepEqual(deck.hitShapes().map((s) => s.target), [0, 1]);
});
