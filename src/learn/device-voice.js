// src/learn/device-voice.js — the device's own English voice (speechSynthesis): the one way the game speaks with it (LEARN
// §56). src/learn/audio.js owns the page's one instance — its stop() cancels through it, its built-in voice speaks
// through it — and hud-learn's voice (the one every play kind uses when there is no recording) speaks through the same
// one, so a cancel and the speak after it are seen together.
//
// Three things WebKit does (iOS Safari, her App's web view) that the old way — cancel(), then speak() at once, the
// utterance only in a local variable — did not survive (X1 §6; not verified on her phone):
//   1. an utterance nothing holds can be collected while it speaks: its onend never comes (the strip's ▶ stays lit), the
//      voice can stop mid-sentence. It is held here (live) until its onend / onerror.
//   2. speak() straight after cancel() is dropped (the cancel lands after it): audio.js stop() cancels on every say() and
//      the caller's voice cancelled again before speaking, in the same tick. Now cancel() only cancels when something is
//      speaking, queued or held, and a speak within GAP ms of a cancel waits GAP ms (a newer speak or cancel drops it:
//      its done() is called). Nothing to cancel → it speaks at once: the first speak() of a page has to be inside the tap.
//   3. no onend at all (iOS; Chrome on a long text): a watchdog — about how long the text takes at the rate, then on
//      while the engine says it is still speaking, up to a hard cap — ends it (done() once, the ▶ goes out).
//
//   const V = createDeviceVoice({ synth: () => speechSynthesis, Utterance: () => SpeechSynthesisUtterance,
//                                 setTimeout, clearTimeout, now: () => ms })
//   V.speak(text, { lang, rate, pitch, voice }, done) → true, or false (no voice here: done() was called)
//   V.cancel()      stop what it says or is about to say (its done() is called) — a no-op when there is nothing
//   V.live          the utterance it is saying (held until it ends) · V.pending: a speak waiting out a fresh cancel
//   estimateMs(text, rate) → ms   how long the watchdog first waits

export const GAP = 50;           // ms a speak waits after a cancel (a frame and a little)
const PER_CHAR = 75, LEAD = 1500, POLL = 500, CAP_EXTRA = 6000;   // ~13 characters a second at rate 1, the voice's start-up

export function estimateMs(text, rate) {
  const r = rate > 0 ? rate : 1;
  return Math.round((String(text || '').length * PER_CHAR) / r + LEAD);
}

export function createDeviceVoice(env = {}) {
  const T = env.setTimeout || ((f, ms) => setTimeout(f, ms)), C = env.clearTimeout || ((h) => clearTimeout(h));
  const now = env.now || (() => Date.now());
  const synth = () => { try { return env.synth ? env.synth() : null; } catch (e) { return null; } };
  const Utt = () => { try { return env.Utterance ? env.Utterance() : null; } catch (e) { return null; } };
  let cur = null;          // { u, done, dog, wait, cap } — the one being said (or waiting to be)
  let cancelAt = -1e9, seq = 0;
  const unref = (h) => { if (h && typeof h.unref === 'function') h.unref(); return h; };

  // its end, whatever ended it: done() once, the utterance let go
  const finish = (c) => {
    if (!c || c.over) return;
    c.over = true;
    C(c.dog); C(c.wait);
    if (cur === c) cur = null;
    if (c.u) { c.u.onend = c.u.onerror = null; }
    try { c.done && c.done(); } catch (e) { /* the caller's */ }
  };
  // the watchdog: the text's time, then on while the engine still speaks, never past the cap
  const watch = (c) => {
    const tick = () => {
      if (c.over) return;
      const S = synth();
      let busy = false;
      try { busy = !!(S && (S.speaking || S.pending)); } catch (e) { busy = false; }
      if (busy && now() < c.cap) { c.dog = unref(T(tick, POLL)); return; }
      finish(c);
    };
    c.dog = unref(T(tick, c.est));
  };
  const go = (c) => {
    if (c.over) return;
    const S = synth(), U = Utt();
    if (!S || typeof U !== 'function') { finish(c); return; }
    try {
      const u = new U(c.text);
      const o = c.o;
      u.lang = o.lang || 'en-US';
      if (o.rate) u.rate = o.rate;
      if (o.pitch) u.pitch = o.pitch;
      if (o.voice) u.voice = o.voice;
      c.u = u;
      u.onend = u.onerror = () => { if (cur === c) finish(c); };
      S.speak(u);
      c.cap = now() + 2 * c.est + CAP_EXTRA;
      watch(c);
    } catch (e) { finish(c); }
  };

  const V = {
    get live() { return cur && cur.u && !cur.over ? cur.u : null; },
    get pending() { return !!(cur && !cur.u && !cur.over); },
    cancel() {
      const c = cur, S = synth();
      // the engine is told only when it has something (said, queued, or ours held); a speak still waiting out the last
      // cancel is only dropped
      let busy = !!(c && c.u);
      try { busy = busy || !!(S && (S.speaking || S.pending)); } catch (e) { /* none */ }
      if (busy && S) { try { S.cancel(); cancelAt = now(); } catch (e) { /* no synthesis */ } }
      if (c) finish(c);
    },
    speak(text, o, done) {
      const t = String(text == null ? '' : text);
      const S = synth(), U = Utt();
      if (!t || !S || typeof U !== 'function') { try { done && done(); } catch (e) { /* the caller's */ } return false; }
      V.cancel();
      const c = { id: ++seq, text: t, o: o || {}, done, u: null, dog: 0, wait: 0, cap: 0, over: false, est: estimateMs(t, o && o.rate) };
      cur = c;
      const since = now() - cancelAt;
      if (since < GAP) c.wait = unref(T(() => { c.wait = 0; if (cur === c) go(c); }, GAP));
      else go(c);
      return true;
    },
  };
  return V;
}
