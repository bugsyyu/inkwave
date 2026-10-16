// 节拍台 M3 — one question on the beat (docs/PLAY.md §3 M3, §1 rule 4): pure, no DOM, no three.js.
//
//   const r = new BeatRound({ lead })
//   r.start(grid, now)        the word is due on the first bar line ≥ lead s from now (W); the downbeat to hop on is the
//                             next one (D = W + bar); the answer bar runs to D + bar
//   r.tick(t) → event | null  call in a loop until null (a long frame can cross two bar lines):
//                               { type: 'speak', replay: 0 | 1, at }   play the word now (W)
//                               { type: 'silent', n: 1 }              a whole answer bar with no input → the word again
//                                                                     on the next bar line (one replay), no evidence
//                               { type: 'defer' }                      silent again → the flow moves the item to the end of
//                                                                     this stretch, no evidence (PLAY §1 rule 4)
//   r.input(t, pad) → { pad, t, onBeat, off, replay } | null
//                             a hop: accepted from the word on (a tap before it is not an answer — she has heard
//                             nothing), once. onBeat / off say how close it came to D; they never touch `pad`.
//   r.phase                   'idle' · 'wait' (pads up, the word not yet) · 'listen' (the word played, waiting for her
//                             hop) · 'answered' · 'deferred'
//
// The round never sees which pad is right and has no way to judge: the answer is the pad index, judged by the flow
// (engine.judge → store.recordFirst), whatever the timing.
import { beatWindow, nextBar } from './clock.js';

export class BeatRound {
  constructor(opts = {}) {
    this.lead = opts.lead ?? 0.45;   // s at least between the pads coming up and the word (they pop in, she reads them)
    this.phase = 'idle';
    this.g = null; this.W = 0; this.D = 0; this.end = 0; this.silent = 0; this.spoken = false;
    this.ev = { type: '', replay: 0, at: 0, n: 0 };   // (one event object, reused: the caller reads it before the next tick)
  }
  get win() { return this.g ? this.g.win : beatWindow(0); }

  start(grid, now) {
    this.g = grid;
    this.W = nextBar(grid, now + this.lead);
    this.D = this.W + grid.bar;
    this.end = this.D + grid.bar;
    this.silent = 0; this.spoken = false;
    this.phase = 'wait';
    return this;
  }

  // the next thing due at time t (or null): the word at W, the silent bar at its end
  tick(t) {
    const e = this.ev;
    if (this.phase === 'wait' && t >= this.W - 1e-6) {
      this.phase = 'listen'; this.spoken = true;
      e.type = 'speak'; e.replay = this.silent; e.at = this.W; e.n = 0;
      return e;
    }
    if (this.phase === 'listen' && t >= this.end - 1e-6) {
      this.silent++;
      if (this.silent >= 2) { this.phase = 'deferred'; e.type = 'defer'; e.n = this.silent; return e; }
      // one replay: the word on the bar line the silent bar ended on, the hop on the downbeat after it
      this.W = this.end; this.D = this.W + this.g.bar; this.end = this.D + this.g.bar;
      this.phase = 'wait';
      e.type = 'silent'; e.n = this.silent; e.at = t;
      return e;
    }
    return null;
  }

  // her hop (a tap, a swipe, a key): taken once, from the word on; the timing is measured against D only
  input(t, pad) {
    if (this.phase !== 'listen' || !(pad >= 0)) return null;
    this.phase = 'answered';
    const off = t - this.D;
    return { pad, t, off, onBeat: Math.abs(off) <= this.win + 1e-9, replay: this.silent };
  }

  // how far the bar has come, for the stage's approach ring: 0 at W … 1 at D (and on through the answer bar)
  approach(t) {
    if (!this.g || this.phase === 'idle') return 0;
    return (t - (this.D - this.g.bar)) / this.g.bar;
  }

  stop() { this.phase = 'idle'; }
}
