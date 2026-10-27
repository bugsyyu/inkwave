// The device's own voice (speechSynthesis) on iOS / Safari (LEARN §56, X1 §6): the utterance held until it ends (WebKit
// collects one nothing holds: its onend never comes, the ▶ stays lit), no speak() in the same tick as a cancel() (Safari
// drops it), no needless cancel before the first speak (it has to be inside the tap), and a watchdog when onend never
// comes. A fake speechSynthesis records what is called, in which order, with which utterance. (Not verified on her phone:
// these are the known WebKit behaviours, the fix is the usual one.)
// 用法：node --test tests/learn/*.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceVoice, estimateMs, GAP } from '../../src/learn/device-voice.js';

// a fake engine: speak / cancel recorded (with the tick they came in), speaking while an utterance is on, onend by hand
function fakeSynth() {
  const S = { log: [], tick: 0, speaking: false, pending: false, said: [], onCancelError: true };
  S.speak = (u) => { S.log.push(['speak', S.tick, u.text]); S.said.push(u); S.speaking = true; };
  S.cancel = () => {
    S.log.push(['cancel', S.tick]);
    const u = S.said[S.said.length - 1];
    S.speaking = false;
    if (u && S.onCancelError && u.onerror) u.onerror({ error: 'interrupted' });   // (Chrome calls it at once; Safari may not at all)
  };
  S.end = () => { const u = S.said[S.said.length - 1]; S.speaking = false; if (u && u.onend) u.onend({}); };
  S.getVoices = () => [];
  return S;
}
class FakeU { constructor(text) { this.text = text; this.onend = null; this.onerror = null; } }
// a hand-run clock: timers fire when the test moves the clock on
function clock() {
  const K = { t: 0, q: [], n: 0 };
  K.setTimeout = (f, ms) => { const h = { id: ++K.n, at: K.t + ms, f }; K.q.push(h); return h; };
  K.clearTimeout = (h) => { K.q = K.q.filter((x) => x !== h); };
  K.run = (ms) => { const end = K.t + ms; for (;;) { K.q.sort((a, b) => a.at - b.at); const h = K.q[0]; if (!h || h.at > end) break; K.q.shift(); K.t = h.at; h.f(); } K.t = end; };
  K.now = () => K.t;
  return K;
}
function voiceOf() {
  const S = fakeSynth(), K = clock();
  const V = createDeviceVoice({ synth: () => S, Utterance: () => FakeU, setTimeout: K.setTimeout, clearTimeout: K.clearTimeout, now: K.now });
  return { S, K, V };
}

test('§56 the voice: the first speak goes at once (inside the tap), no cancel before it; the utterance is held until its onend', () => {
  const { S, V } = voiceOf();
  let done = 0;
  assert.equal(V.speak('Monday', { rate: 0.92 }, () => done++), true);
  assert.deepEqual(S.log, [['speak', 0, 'Monday']], 'nothing was speaking: no cancel, the speak in the same tick');
  assert.equal(V.live, S.said[0], 'the utterance is held (WebKit collects one nothing holds)');
  assert.equal(S.said[0].rate, 0.92); assert.equal(S.said[0].lang, 'en-US');
  S.end();
  assert.equal(done, 1); assert.equal(V.live, null, 'let go once it has ended');
  S.end(); assert.equal(done, 1, 'done once');
});

test('§56 the voice: a speak while one is on — the cancel, then the speak a frame later (not in the same tick); a newer one drops the waiting one', () => {
  const { S, K, V } = voiceOf();
  const ends = [];
  V.speak('first', {}, () => ends.push('first'));
  S.tick = 1;
  V.speak('second', {}, () => ends.push('second'));
  assert.deepEqual(S.log.slice(1), [['cancel', 1]], 'cancelled, nothing spoken in the same tick');
  assert.deepEqual(ends, ['first'], 'the cancelled one ended');
  assert.equal(V.pending, true); assert.equal(V.live, null);
  // a third before the frame is over: the second never speaks (and is ended), the third waits its frame
  V.speak('third', {}, () => ends.push('third'));
  assert.deepEqual(ends, ['first', 'second']);
  S.tick = 2; K.run(GAP);
  assert.deepEqual(S.log.slice(1), [['cancel', 1], ['speak', 2, 'third']]);
  assert.equal(V.live, S.said[S.said.length - 1]);
  S.end(); assert.deepEqual(ends, ['first', 'second', 'third']);
});

test('§56 the voice: no onend ever — the watchdog ends it (not while the engine still speaks, never past the cap); cancel() with nothing on does nothing', () => {
  const { S, K, V } = voiceOf();
  let done = 0;
  V.speak('Where is the library?', { rate: 1 }, () => done++);
  const est = estimateMs('Where is the library?', 1);
  K.run(est - 1); assert.equal(done, 0, 'not before the text could have been said');
  K.run(1); assert.equal(done, 0, 'the engine still speaks: it waits on');
  S.speaking = false; K.run(600);
  assert.equal(done, 1, 'the engine is quiet and no onend came: ended (the ▶ goes out)');
  assert.equal(V.live, null);
  // stuck speaking for ever: the cap
  let d2 = 0;
  V.speak('Hi', {}, () => d2++);
  K.run(2 * estimateMs('Hi') + 6000 + 600);
  assert.equal(d2, 1, 'a stuck engine: ended at the cap');
  // nothing on: cancel() does not touch the engine
  S.speaking = false; const n = S.log.length;
  V.cancel(); assert.equal(S.log.length, n);
});

test('§56 the voice: no speechSynthesis (or no utterance class) — done at once, false', () => {
  let done = 0;
  const V = createDeviceVoice({ synth: () => null, Utterance: () => FakeU });
  assert.equal(V.speak('x', {}, () => done++), false); assert.equal(done, 1);
  const W = createDeviceVoice({ synth: () => fakeSynth(), Utterance: () => undefined });
  assert.equal(W.speak('x', {}, () => done++), false); assert.equal(done, 2);
  assert.equal(createDeviceVoice({ synth: () => fakeSynth(), Utterance: () => FakeU }).speak('', {}, () => done++), false); assert.equal(done, 3);
});

// ------------------------------------------------------------------------------------------------ the page's paths
// audio.js say() (stop() first, then the caller's voice — hud-learn's _device — or the built-in one) on a page with a fake
// engine. The order the old code made: cancel (stop) → cancel (_device) → speak, all in one tick, the utterance nowhere.
const S = fakeSynth();
globalThis.window = { speechSynthesis: S, SpeechSynthesisUtterance: FakeU, location: { href: 'http://localhost:8080/', pathname: '/', protocol: 'http:', search: '' } };
globalThis.speechSynthesis = S; globalThis.SpeechSynthesisUtterance = FakeU;
const A = await import('../../src/learn/audio.js');
const { LearnHud } = await import('../../src/ui/hud-learn.js');
const hudVoice = { _pickVoice: () => null };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

test('§56 the page: say() through hud-learn\'s voice — no cancel in the same tick as the speak, the utterance held by the one voice, the ▶ goes out without onend', async () => {
  S.log.length = 0; S.said.length = 0; S.speaking = false;
  const ends = [];
  // the first: nothing on — straight to the engine, inside the tap
  A.say('Monday', { onEnd: () => ends.push('a'), device: (t, end) => LearnHud.prototype._device.call(hudVoice, t, end) });
  assert.deepEqual(S.log.map((x) => x[0]), ['speak'], 'nothing to cancel: speak at once (no cancel before it)');
  assert.ok(A.deviceVoice.live && A.deviceVoice.live === S.said[0], 'the utterance is held while it speaks');
  // replay while it speaks (▶ 再听): cancelled, and the new one a frame later
  S.tick = 1;
  A.say('Monday', { onEnd: () => ends.push('b'), device: (t, end) => LearnHud.prototype._device.call(hudVoice, t, end) });
  const same = S.log.filter((x) => x[1] === 1).map((x) => x[0]);
  assert.ok(same.includes('cancel') && !same.includes('speak'), `no speak in the tick of the cancel (${same})`);
  assert.equal(S.log.filter((x) => x[0] === 'cancel').length, 1, 'one cancel (stop() and the voice used to cancel twice)');
  S.tick = 2; await wait(GAP + 30);
  assert.deepEqual(S.log.map((x) => x[0]), ['speak', 'cancel', 'speak']);
  assert.equal(A.deviceVoice.live, S.said[1]);
  assert.equal(S.said[1].rate, 0.92, 'hud-learn\'s own rate (LEARN.ui.ttsRate)');
  assert.deepEqual(ends, ['a']);
  S.end(); assert.deepEqual(ends, ['a', 'b']);
  assert.equal(A.deviceVoice.live, null);
});

test('§56 the page: the built-in voice (no caller voice) speaks through the same one; stop() cancels it (its onEnd once); no onend → the watchdog', async () => {
  S.log.length = 0; S.said.length = 0; S.speaking = false;
  let n = 0;
  A.say('Hi', { onEnd: () => n++ });
  assert.deepEqual(S.log.map((x) => x[0]), ['speak']);
  assert.equal(A.deviceVoice.live, S.said[0]);
  A.stop();
  assert.equal(n, 1); assert.equal(A.deviceVoice.live, null);
  assert.deepEqual(S.log.map((x) => x[0]), ['speak', 'cancel']);
  A.stop(); assert.deepEqual(S.log.map((x) => x[0]), ['speak', 'cancel'], 'nothing on: stop() leaves the engine alone');
  // onend never comes, the engine goes quiet: ended by the watchdog (the strip's ▶ would have stayed lit)
  S.onCancelError = false; S.speaking = false;
  let m = 0;
  A.say('Hi', { onEnd: () => m++ });
  await wait(GAP + 30);   // (a cancel just now: it speaks a frame later)
  assert.equal(S.said.length, 2, 'spoken');
  S.speaking = false;     // (the engine has gone quiet, and no onend comes)
  await wait(estimateMs('Hi', 0.92) + 200);
  assert.equal(m, 1, 'no onend: ended once');
  assert.equal(A.status().device.live, false);
  S.onCancelError = true;
});
