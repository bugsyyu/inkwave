// 墨浪跑酷 — the lane rules (docs/PLAY.md §3 M2 / M3, §1 rules 4–6): pure, no DOM, no three.js, so
// `node --test tests/learn/runner-*.test.mjs` runs every rule here.
//
//   lanes:   laneCenters(n, w, c) · dividers(n, w, c) · dividerStart(n, w, c, from) · laneOf(d, n, w, c, gap) · nextLane(cur, dir, centers)
//   reading: labelChars(text) · readLead(labels, L) · leadDistance(lead, speed)
//   beat:    beatWindow(stepDur) · beatGrid(bpm, t0) · nearestBeat(g, t) · onBeat(g, t, win) · nextBar(g, after) · beatPulse(g, t) · syncTide(dist, v, g, now, kmin, kmax)
//
// A row of n lanes sits across the ink road at a lateral offset c (the clearance scan may move it off the centre line):
// lane i is centred at c + (i − (n − 1) / 2) · w, numbered left → right as she looks down the road (the prompt's options
// in order). Each lane's curtain is w − gap wide, so between two curtains there is `gap` of open ink: she starts each row
// on a divider (the ink road carries her there), and swimming straight on through that gap is no answer (PLAY §1 rule 5).

// lane centres, left → right (offsets from the track's centre line, + = her right)
export function laneCenters(n, w = 1.5, c = 0) {
  const out = [];
  for (let i = 0; i < n; i++) out.push(c + (i - (n - 1) / 2) * w);
  return out;
}

// the n − 1 dividers between the lanes, left → right
export function dividers(n, w = 1.5, c = 0) {
  const out = [];
  for (let i = 1; i < n; i++) out.push(c + (i - n / 2) * w);
  return out;
}

// where she is carried to when a row appears: the divider nearest to where she is (`from`), so the first push of a
// swipe is a short one either way — with an odd lane count the middle lane has a divider on each side
export function dividerStart(n, w = 1.5, c = 0, from = 0) {
  const ds = dividers(n, w, c);
  let best = ds[0], bd = Infinity;
  for (const d of ds) { const e = Math.abs(d - from); if (e < bd - 1e-9) { bd = e; best = d; } }
  return best;
}

// which curtain a lateral offset d passes through: the lane index, or −1 for the open ink between two curtains (and
// outside the outer ones) — the gap is no answer, never a wrong one
export function laneOf(d, n, w = 1.5, c = 0, gap = 0.5) {
  const half = Math.max(0.05, (w - gap) / 2);
  const cs = laneCenters(n, w, c);
  for (let i = 0; i < n; i++) if (Math.abs(d - cs[i]) <= half + 1e-9) return i;
  return -1;
}

// one swipe: from the current target offset to the next lane centre that way (from a divider that is the half-lane
// next to it); at the outer lane it stays (a swipe never carries her off the row)
export function nextLane(cur, dir, centers) {
  const eps = 0.05;
  if (dir > 0) { for (const x of centers) if (x > cur + eps) return x; return centers[centers.length - 1]; }
  for (let i = centers.length - 1; i >= 0; i--) if (centers[i] < cur - eps) return centers[i];
  return centers[0];
}

// ---------------------------------------------------------------------------------------------- reading time
// characters a label shows (an option's text and its Chinese, as the curtain prints them); CJK counts one each like
// any other character, spaces do not
export function labelChars(text) { return String(text == null ? '' : text).replace(/\s+/g, '').length; }

// the reading time a row gets before she reaches it (PLAY §3 M2): base + perChar × the longest label, capped
export function readLead(labels, L = { base: 2.5, perChar: 0.06, cap: 6 }) {
  let n = 0;
  for (const l of labels || []) n = Math.max(n, labelChars(l));
  return +Math.min(L.cap, L.base + L.perChar * n).toFixed(3);
}
// where the row shows up: that many seconds ahead of her at the speed she will swim it (the slowed tide)
export function leadDistance(lead, speed) { return +(lead * speed).toFixed(2); }

// ---------------------------------------------------------------------------------------------- the beat (M3 in the runner)
// the window a lane change counts as on the beat, from music.js's step (a sixteenth: stepDur = 60 / bpm / 4) — never
// under ±150 ms. With the game's tempos (84–150 bpm) the sixteenth is 0.10–0.18 s, so this is 150 ms throughout.
export function beatWindow(stepDur) { return Math.max(0.15, 0.35 * (+stepDur || 0)); }

// a beat grid on the game clock: t0 = a downbeat, four beats to the bar (music.js: barDur = 16 steps)
export function beatGrid(bpm, t0 = 0) {
  const beat = 60 / Math.max(30, +bpm || 120);
  return { bpm: 60 / beat, beat, step: beat / 4, bar: beat * 4, t0, win: beatWindow(beat / 4) };
}
// the beat nearest t: its time, its number from t0, how far off t is (+ late, − early), whether it is a downbeat
export function nearestBeat(g, t) {
  const k = Math.round((t - g.t0) / g.beat), bt = g.t0 + k * g.beat;
  return { t: bt, k, off: t - bt, down: ((k % 4) + 4) % 4 === 0 };
}
export function onBeat(g, t, win = g.win) { return Math.abs(nearestBeat(g, t).off) <= win + 1e-9; }
// the first downbeat at or after `after` (music.js nextBarTime, on this grid)
export function nextBar(g, after) {
  const k = Math.max(0, Math.ceil((after - g.t0) / g.bar - 1e-6));
  return g.t0 + k * g.bar;
}
// 0..1: a curtain's pulse — a kick on every beat (a bigger one on the downbeat) that decays before the next
export function beatPulse(g, t) {
  if (t < g.t0) return 0;
  const k = Math.floor((t - g.t0) / g.beat), since = t - (g.t0 + k * g.beat);
  return Math.exp(-since * 9) * (k % 4 === 0 ? 1 : 0.6);
}
// the tide for a beat row: the share of her swim speed v that brings her `dist` metres to a downbeat — the first bar
// line she can reach with a tide in [kmin, kmax] (the ink sets her pace; the beat she keeps is her lane change)
export function syncTide(dist, v, g, now, kmin = 0.45, kmax = 0.85) {
  const tFast = now + dist / (v * kmax), tSlow = now + dist / (v * kmin);
  let bar = nextBar(g, tFast);
  if (bar > tSlow) bar = tFast;   // (no bar line in reach: just go at the fastest allowed)
  const k = dist / (v * Math.max(1e-3, bar - now));
  return { k: Math.min(kmax, Math.max(kmin, +k.toFixed(4))), at: bar };
}
