// 题即玩法 — the frame-time sampler behind __inkwave.debug (docs/PLAY.md §7): every frame's cost in ms (main.js _frame:
// from its first line to the end of the HUD / minimap tail) into a preallocated ring, no allocation per frame.
//
//   const S = new FrameTimes(cap)   S.start() · S.push(ms) (main.js, every frame while on) · S.stop() → stats
//   S.stats() → { n, p50, p95, max, mean }       percentile(sortedArray, q) — nearest-rank on a sorted copy
// In the page: __inkwave.debug.frameTimes.start() / .stop() (main.js). SwiftShader's numbers are only good for
// comparing two runs on the same box (the M1 gate against plain walking on the same stage); a phone is the real test.
export function percentile(sorted, q) {
  if (!sorted.length) return 0;
  const k = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[k];
}

export class FrameTimes {
  constructor(cap = 4096) { this.buf = new Float32Array(cap); this.n = 0; this.on = false; this.lost = 0; }
  start() { this.n = 0; this.lost = 0; this.on = true; return this; }
  push(ms) {
    if (!this.on) return;
    if (this.n < this.buf.length) this.buf[this.n++] = ms; else this.lost++;
  }
  stop() { this.on = false; return this.stats(); }
  stats() {
    const a = Array.from(this.buf.subarray(0, this.n)).sort((x, y) => x - y);
    const r = (v) => Math.round(v * 100) / 100;
    return { n: this.n, p50: r(percentile(a, 0.5)), p95: r(percentile(a, 0.95)), max: r(a.length ? a[a.length - 1] : 0), mean: r(a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0), lost: this.lost };
  }
}
