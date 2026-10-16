// 节拍台 M3 — the beat (docs/PLAY.md §3 M3, §1 rule 4): pure, no DOM, no three.js (`node --test` runs every rule here).
//
//   beatWindow(stepDur) · beatGrid(bpm, t0) · nearestBeat(g, t) · onBeat(g, t, win) · nextBar(g, after) · beatPulse(g, t)
//   gridFromMusic(music, gameNow, fallbackBpm, cache?)
//
// The first six are the same contract as the runner's (src/learn/play/runner/lanes.js, M3 in the lane run): same names,
// same arguments, same return shapes, same numbers — so the two can become one file after the merge. A grid lives on the
// game clock (G.time): t0 is a downbeat, four beats to the bar (music.js: a step is a sixteenth, barDur = 16 steps).
// Timing is only ever "how close to the beat" here — never which pad is right (PLAY §1 rule 4).

// the window a hop counts as on the beat, from music.js's step (a sixteenth: stepDur = 60 / bpm / 4) — never under
// ±150 ms. With the game's tempos (84–150 bpm) the sixteenth is 0.10–0.18 s, so this is 150 ms throughout; a slow song
// widens it (0.35 × stepDur).
export function beatWindow(stepDur) { return Math.max(0.15, 0.35 * (+stepDur || 0)); }

// a beat grid on the game clock: t0 = a downbeat, four beats to the bar
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
// 0..1: the stage's pulse — a kick on every beat (a bigger one on the downbeat) that decays before the next
export function beatPulse(g, t) {
  if (t < g.t0) return 0;
  const k = Math.floor((t - g.t0) / g.beat), since = t - (g.t0 + k * g.beat);
  return Math.exp(-since * 9) * (k % 4 === 0 ? 1 : 0.6);
}

// The music's grid on the game clock. A synth track (music.js Player) carries its bpm and its first downbeat t0 on the
// audio clock: t0 + (gameNow − music.now()) puts that downbeat on the game clock. A recording (FileTrack) or no audio
// carries no tempo: a steady grid at fallbackBpm that starts now and stays put (cache it: pass the same object back, the
// runner's _fallbackGrid). The returned grid is fresh only when the source changed (no allocation per frame).
export function gridFromMusic(music, gameNow, fallbackBpm = 105, cache = null) {
  const c = cache || {};
  const cur = music && music.current;
  let bpm = 0, t0 = 0;
  try {
    if (cur && cur.song && cur.song.bpm && cur.t0 != null && music.ctx && typeof music.now === 'function') { bpm = cur.song.bpm; t0 = cur.t0 + (gameNow - music.now()); }
  } catch (e) { bpm = 0; }
  if (bpm) {
    // the audio clock and the game clock drift apart a little each frame: keep the grid unless it moved by > 20 ms
    if (!c.grid || c.src !== cur || Math.abs(c.grid.bpm - bpm) > 1e-6 || Math.abs(c.grid.t0 - t0) > 0.02) { c.grid = beatGrid(bpm, t0); c.src = cur; }
    return c.grid;
  }
  if (!c.grid || c.src !== 'fallback' || Math.abs(c.grid.bpm - (60 / (60 / Math.max(30, +fallbackBpm || 120)))) > 1e-6) { c.grid = beatGrid(fallbackBpm, gameNow); c.src = 'fallback'; }
  return c.grid;
}
