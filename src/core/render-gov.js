// The render governor for her App (the owner, 10-17: 「要高刷新率、高清晰度、原生主机级别的游戏丝滑体验和高度精细渲染」; 10-21:
// 「手机上真的很卡」 — LEARN §50): the device class picks a starting step (config.js RENDER_STEPS / RENDER_START: the tier, the
// shadows, the particles, the rungs), the frame records of whole matches move it one step at a time — taking effect at the
// next launch (a new step recompiles shaders). Within the session the live ladder (LiveGov below: config.js RENDER_RUNGS)
// moves the density, the bloom, the AO and 60 / 120 by the drawn frames' real intervals: every session starts at 60, down
// within half a second, up only after seconds of headroom. Stored per device: localStorage['inkwave:render:v1'] =
// { v, model, step, good, bad, at }.
import { RENDER_STEPS, RENDER_START, RENDER_RUNGS, RENDER_LIVE, TOUCH } from '../config.js';

export { RENDER_STEPS, RENDER_START, RENDER_RUNGS, RENDER_LIVE };
export const GOV_KEY = 'inkwave:render:v1';
const LAST = RENDER_STEPS.length - 1;
const clamp = (s, lo = 0) => Math.max(lo, Math.min(LAST, Math.round(+s || 0)));

// the step to launch with: the stored one for this same model, else (none stored, another device) the class's start; null
// without a device class (a web browser: no steps at all)
export function startStep(info, saved) {
  const best = info && RENDER_START[info.cls];
  if (best == null) return null;
  if (saved && saved.v === 1 && saved.model === info.model && Number.isFinite(+saved.step)) return clamp(saved.step, best);
  return best;
}

// A match's frame record → the next launch's step. stats = { secs, targetMs, avgMs, slowFrac, floorFrac, ceilFrac, hot }
// (fractions of its 4 s windows: slow = a window with RENDER_LIVE.down60 of its frames late, floor = on the live ladder's
// lowest rung, ceil = on the step's top rung). Under 60 s it does not count; nor does one played hot (her phone said thermal
// serious / low power: the heat, not the step). Down one step when it missed at the floor (floorFrac ≥ 0.25 and slowFrac ≥
// 0.2); up one after 3 clean matches in a row (slowFrac < 0.05, never at the floor, ≥ 90 % at the top rung: the step's own
// best was held, so the next one up may be tried), never above best (the class's start).
export function afterMatch(saved, stats, best = 0) {
  const s = { v: 1, model: saved?.model ?? null, step: clamp(saved?.step, best), good: saved?.good | 0, bad: saved?.bad | 0, at: saved?.at || 0 };
  const out = (changed, why) => ({ step: s.step, changed, why, saved: s });
  if (!stats || !(stats.secs >= 60)) return out(false, 'short');
  if (stats.hot) return out(false, 'hot');
  s.at = Date.now();
  if (stats.floorFrac >= 0.25 && stats.slowFrac >= 0.2) {
    s.good = 0; s.bad++;
    if (s.step >= LAST) return out(false, 'last');
    s.step++; s.bad = 0;
    return out(true, 'slow');
  }
  s.bad = 0;
  if (stats.slowFrac < 0.05 && !stats.floorFrac && stats.ceilFrac >= 0.9) {
    s.good = Math.min(3, s.good + 1);
    if (s.step <= best) return out(false, 'best');
    if (s.good < 3) return out(false, 'clean');
    s.step--; s.good = 0;
    return out(true, 'clean');
  }
  s.good = 0;
  return out(false, 'ok');
}

// her phone's power state (index.html window.__iwNative.power) is a reason to hold 60 now: thermal serious / critical, or
// Low Power Mode
export function hotPower(p) { return !!p && (p.lowPower === true || p.thermal === 'serious' || p.thermal === 'critical'); }

// ---- the live ladder (LEARN §50; her App, within a session) ---------------------------------------------------------------
// Fed every drawn frame (main.js _liveFrame) with its interval (vsync to vsync), its main-thread cost (_frame) and the
// interval it was paced for, all in ms; moves the rung (config.js RENDER_RUNGS: the density's pixel budget, the bloom, the AO)
// between the step's start and ceiling, and the cap (60, or 0 = the display's own 120). RENDER_LIVE has the numbers:
//   down fast  a 0.5 s window with too many late frames: at 120 back to 60 first, at 60 a rung down
//   up slow    a rung up after upHold s of clean windows; a rung that fails within probation s waits twice as long next time
//   120 last   only at the ceiling, after hzHold s clean at 60 with the frame's JS (p90) under hzJs; a failed try doubles hzHold
//   hot        her phone hot / Low Power Mode: 60 and a rung under the start at once, no climbing until it cools
// frame() returns true when it moved (rung / cap / why changed). No allocation per frame: two rings of the last frames.
export class LiveGov {
  constructor({ start, ceil, hz120 = false, cfg = RENDER_LIVE } = {}) {
    this.cfg = cfg; this.ceil = Math.max(0, ceil | 0); this.start = Math.min(this.ceil, Math.max(0, start | 0));
    this.rung = this.start; this.cap = 60; this.hz120 = !!hz120; this.hot = false;
    this.wait = new Float32Array(this.ceil + 1).fill(cfg.upHold);   // clean seconds that climbing onto each rung needs
    this.hzWait = cfg.hzHold;
    this.t = 0; this.clean = 0; this.settle = 0;
    this.wT = 0; this.wN = 0; this.wL = 0; this.late = 0;          // the open window: seconds, frames, late frames; the last one's share
    this.nAll = 0; this.lateAll = 0;                                // every counted frame / late one (main.js keeps a match's record from them)
    this.upAt = -1; this.hzAt = -1;                                 // when the last climb / the 120 try happened (on probation)
    this.why = 'start'; this.moves = 0;
    this.iv = new Float32Array(cfg.ring); this.js = new Float32Array(cfg.ring); this.ri = 0; this.rn = 0;
    this._s = new Float32Array(cfg.ring);
  }
  // one drawn frame: ms since the last drawn one, js its main-thread ms, tgt the interval it was paced for
  frame(ms, js, tgt) {
    const C = this.cfg;
    if (!(ms > 0) || ms > C.gapMs || !(tgt > 0)) { this.wT = 0; this.wN = 0; this.wL = 0; return false; }   // (a break, not a frame)
    this.iv[this.ri] = ms; this.js[this.ri] = js; this.ri = (this.ri + 1) % this.iv.length; if (this.rn < this.iv.length) this.rn++;
    this.t += ms / 1000;
    if (this.settle > 0) { this.settle -= ms / 1000; return false; }   // (the frame or two after a move: a resize, a pass turned on)
    this.wT += ms / 1000; this.wN++; this.nAll++;
    if (ms > tgt * C.late) { this.wL++; this.lateAll++; }
    if (this.wT < C.win || this.wN < C.minN) return false;
    const late = this.wL / this.wN, secs = this.wT;
    this.wT = 0; this.wN = 0; this.wL = 0; this.late = late;
    return this._judge(late, secs);
  }
  _judge(late, secs) {
    const C = this.cfg, t = this.t;
    if (late >= (this.cap ? C.down60 : C.down120)) {
      this.clean = 0;
      if (!this.cap) {   // 120 that does not hold: a steady 60 first
        if (this.hzAt >= 0 && t - this.hzAt < C.probation) this.hzWait = Math.min(C.hzMax, this.hzWait * 2);
        this.hzAt = -1; this.cap = 60; return this._moved('late120');
      }
      if (this.rung <= 0) return false;   // the floor at 60: nothing left to give (the launch step is judged after the match)
      if (this.upAt >= 0 && t - this.upAt < C.probation) this.wait[this.rung] = Math.min(C.upMax, this.wait[this.rung] * 2);
      this.upAt = -1; this.rung--; return this._moved('late');
    }
    if (late <= C.clean) this.clean += secs; else { this.clean = 0; return false; }
    if (this.hot) return false;
    if (this.rung < this.ceil && this.clean >= this.wait[this.rung + 1]) { this.rung++; this.upAt = t; this.clean = 0; return this._moved('clean'); }
    if (this.hz120 && this.cap && this.rung >= this.ceil && this.clean >= this.hzWait && this.jsP(0.9) <= C.hzJs) { this.cap = 0; this.hzAt = t; this.clean = 0; return this._moved('try120'); }
    return false;
  }
  _moved(why) { this.why = why; this.moves++; this.settle = this.cfg.settle; this.wT = 0; this.wN = 0; this.wL = 0; return true; }
  // her phone hot (true) or cool again (false): returns true when it moved
  setHot(on) {
    on = !!on;
    if (on === this.hot) return false;
    this.hot = on; this.clean = 0;
    if (!on) return false;   // (cool: climbing may resume, after the usual clean seconds)
    this.cap = 60; this.hzAt = -1; this.upAt = -1;
    this.rung = Math.min(this.rung, Math.max(0, this.start - 1));
    return this._moved('hot');
  }
  // the p-quantile of the last frames' intervals (which = 'iv') or main-thread ms ('js'); 0 with none
  ivP(p) { return this._q(this.iv, p); }
  jsP(p) { return this._q(this.js, p); }
  _q(a, p) {
    const n = this.rn; if (!n) return 0;
    const s = this._s.subarray(0, n); s.set(a.subarray(0, n)); s.sort();
    return s[Math.min(n - 1, Math.max(0, Math.ceil(p * n) - 1))];
  }
}

// the density a rung gives on a screen of dpr and w × h CSS px: its pixel budget over the screen, never above the screen's own
// density nor under the touch floor (config.js RENDER_RUNGS; renderDensity with the rung's budget)
export function rungDensity(rung, dpr = 1, w = 1, h = 1) {
  const d = dpr || 1, R = RENDER_RUNGS[Math.max(0, Math.min(RENDER_RUNGS.length - 1, rung | 0))];
  return Math.min(d, Math.max(Math.min(d, TOUCH.minPixelRatio), Math.sqrt(R.px / Math.max(1, w * h))));
}

// The pixels one frame shades, pass by pass (LEARN §50: the GPU's load as a count, the same on any machine), for her App's
// pipeline on a touch screen of w × h CSS px at dpr: the shadow map (its size², every frame), the main pass, the AO (half
// size on an Apple GPU: normals, AO, denoise; then its blend), the bloom (the bright pass at half size, five mips blurred both
// ways, the composite), the grade, the screen FX while on (fx), SMAA's three passes — the output step in the last of those
// (no pass of its own). legacy (a pre-§50 step: { pixelRatio, pixels, ao, bloom, shadows, shadowSize }): the chain before —
// GTAO's copy, the bloom's own blend, the output pass. The ink atlas's draws come on top (only while ink lands or is wet:
// src/world/paint.js). → { density, passes: [[name, px]], px }
export function framePixels({ step = 0, rung, w, h, dpr = 3, fx = false, bloomOn = true, legacy = null }) {
  const S = RENDER_STEPS[step], R = RENDER_RUNGS[rung ?? S.rungs[0]];
  const d = legacy ? Math.max(Math.min(dpr, TOUCH.minPixelRatio), Math.min(dpr, legacy.pixelRatio, Math.sqrt(legacy.pixels / (w * h)))) : rungDensity(R.rung, dpr, w, h);
  const W = w * d, H = h * d, full = W * H, out = [];
  const L = legacy, ao = L ? L.ao : R.ao, bloom = bloomOn && (L ? L.bloom : R.bloom), shadows = L ? L.shadows : S.shadows, size = L ? L.shadowSize : S.shadowSize;
  if (shadows) out.push(['shadow', size * size]);
  out.push(['main', full]);
  if (ao) {
    const half = Math.ceil(W / 2) * Math.ceil(H / 2);
    out.push(['ao:normals', half], ['ao', half], ['ao:denoise', half]);
    if (L) out.push(['ao:copy', full]);
    out.push(['ao:blend', full]);
  }
  if (bloom) {
    let x = Math.round(W / 2), y = Math.round(H / 2), blur = 0;
    const first = x * y;
    for (let i = 0; i < 5; i++) { blur += 2 * x * y; x = Math.round(x / 2); y = Math.round(y / 2); }
    out.push(['bloom:bright', first], ['bloom:blur', blur], ['bloom:composite', first]);
    if (L) out.push(['bloom:blend', full]);
  }
  out.push(['grade', full]);
  if (fx) out.push(['screenfx', full]);
  if (L) out.push(['output', full]);
  out.push(['smaa:edges', full], ['smaa:weights', full], ['smaa:blend', full]);
  return { density: d, passes: out, px: out.reduce((a, p) => a + p[1], 0) };
}

// what 显示帧率 says with the live ladder on (LEARN §50: the numbers to read on her phone): two lines —
//   「60 帧 · 第 1 档 · 3/4 级 · 2.25× · 1.7 MP」
//   「间隔 16.7 / 17.4 ms · JS 4.1 ms · 稳 60 · 稳↑」  (p50 / p95 of the drawn frames' intervals, the JS p95, the cap, the last move)
const WHY = { start: '起步', late: '掉帧↓', late120: '120 跑不满→60', clean: '稳↑', try120: '试 120', hot: '发热↓' };
export function liveReadout(fps, step, L, density, w, h) {
  const d = +density || 0, ds = Math.abs(d * 10 - Math.round(d * 10)) < 0.01 ? d.toFixed(1) : d.toFixed(2);
  const mp = (Math.round(w * h * d * d / 1e5) / 10).toFixed(1);
  const cap = L.cap ? '稳 60' : '120';
  return `${Math.round(fps)} 帧 · 第 ${step} 档 · ${L.rung}/${L.ceil} 级 · ${ds}× · ${mp} MP\n` +
    `间隔 ${L.ivP(0.5).toFixed(1)} / ${L.ivP(0.95).toFixed(1)} ms · JS ${L.jsP(0.95).toFixed(1)} ms · ${cap}${L.hot ? ' · 热' : ''} · ${WHY[L.why] || L.why}`;
}

export function loadGov(storage = globalThis.localStorage) {
  try { const v = JSON.parse(storage.getItem(GOV_KEY)); return v && v.v === 1 ? v : null; } catch { return null; }
}
export function saveGov(rec, storage = globalThis.localStorage) {
  try { storage.setItem(GOV_KEY, JSON.stringify(rec)); return true; } catch { return false; }
}
