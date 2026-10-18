// The render governor for her App (the owner, 10-17: 「要高刷新率、高清晰度、原生主机级别的游戏丝滑体验和高度精细渲染」): the
// device class picks a starting step (config.js RENDER_STEPS / RENDER_START), the real frame times of whole matches move it
// one step at a time — taking effect at the next launch, never within a match (a new step recompiles shaders). Within a match
// the dynamic resolution and the bloom shed stay as they were (main.js _dynRes); past them, a 120 Hz screen that still
// misses is held at a steady 60 (shouldCap). Stored per device: localStorage['inkwave:render:v1'] = { v, model, step, good, bad, at }.
import { RENDER_STEPS, RENDER_START } from '../config.js';

export { RENDER_STEPS, RENDER_START };
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

// A match's frame record → the next launch's step. stats = { secs, targetMs, avgMs, slowFrac, floorFrac, shed, capped, hot }
// (fractions of its 4 s windows: slow = over 112 % of the target, floor = at the lowest dynamic density). Under 60 s it does
// not count; nor does one played hot (her phone said thermal serious / low power: the heat, not the step). Down one step
// when it missed at the floor density (floorFrac ≥ 0.25 and slowFrac ≥ 0.2) or a 120 Hz screen had to be held at 60;
// up one after 3 clean matches in a row (slowFrac < 0.05, never at the floor), never above best (the class's start).
export function afterMatch(saved, stats, best = 0) {
  const s = { v: 1, model: saved?.model ?? null, step: clamp(saved?.step, best), good: saved?.good | 0, bad: saved?.bad | 0, at: saved?.at || 0 };
  const out = (changed, why) => ({ step: s.step, changed, why, saved: s });
  if (!stats || !(stats.secs >= 60)) return out(false, 'short');
  if (stats.hot) return out(false, 'hot');
  s.at = Date.now();
  if ((stats.floorFrac >= 0.25 && stats.slowFrac >= 0.2) || stats.capped) {
    s.good = 0; s.bad++;
    if (s.step >= LAST) return out(false, 'last');
    s.step++; s.bad = 0;
    return out(true, stats.capped ? 'capped' : 'slow');
  }
  s.bad = 0;
  if (stats.slowFrac < 0.05 && !stats.floorFrac) {
    s.good = Math.min(3, s.good + 1);
    if (s.step <= best) return out(false, 'best');
    if (s.good < 3) return out(false, 'clean');
    s.step--; s.good = 0;
    return out(true, 'clean');
  }
  s.good = 0;
  return out(false, 'ok');
}

// Within a match: hold a 120 Hz screen (targetMs under 12) at 60 once everything else has given way — the dynamic scale s at
// its floor, the bloom already shed (shed: nothing left to shed) — and two 4 s windows in a row still missed. Not when a cap
// is already on (cap: the player's settings.fpsCap or an earlier hold).
export function shouldCap({ s, floor, shed, slowWindows, targetMs, cap = 0 }) {
  return !cap && targetMs > 0 && targetMs < 12 && shed === true && s <= floor + 0.01 && slowWindows >= 2;
}

// her phone's power state (index.html window.__iwNative.power) is a reason to hold 60 now: thermal serious / critical, or
// Low Power Mode
export function hotPower(p) { return !!p && (p.lowPower === true || p.thermal === 'serious' || p.thermal === 'critical'); }

// the readout under 显示帧率 (settings.showFps) while a step is in effect: 「120 帧 · 2.0× · 第 0 档」, and 「 · 稳 60」 while held
export function govReadout(fps, density, step, held = false) {
  const d = +density || 0, ds = Math.abs(d * 10 - Math.round(d * 10)) < 0.01 ? d.toFixed(1) : d.toFixed(2);
  return `${Math.round(fps)} 帧 · ${ds}× · 第 ${step} 档${held ? ' · 稳 60' : ''}`;
}

export function loadGov(storage = globalThis.localStorage) {
  try { const v = JSON.parse(storage.getItem(GOV_KEY)); return v && v.v === 1 ? v : null; } catch { return null; }
}
export function saveGov(rec, storage = globalThis.localStorage) {
  try { storage.setItem(GOV_KEY, JSON.stringify(rec)); return true; } catch { return false; }
}
