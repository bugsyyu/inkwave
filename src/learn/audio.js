// src/learn/audio.js — the course's own recordings in the levels (docs/LEARN.md §2, §16), the way the lesson plays them.
//
// Where they are: IELTS-Base's app/audio/ (not in this repo: 100 MB). In her App the game is app/game/, so they are ../audio/:
// index.json lists every text the lesson reads aloud (`texts`, the pieces speechChunks makes) and, for each voice set (us, gb
// and a slower take of each, us-slow, gb-slow), where its MP3 lies: sets[set].at[i] = [shard, offset, length] in
// <set>-<shard>.mp3 (a shard is its clips one after another; each clip is a whole MP3). Nothing is copied: the clip's bytes
// are a Range request (her App's scheme handler and most servers answer 206), or — when a server ignores Range and sends the
// whole shard (python's http.server) — the shard is kept and sliced, which is what the lesson always does (it keeps every
// shard it fetched; here at most one voice set's twelve, ~18 MB, so a long level does not fetch the same shard again).
//
// Which recording (the lesson's Clips.at / Clips.plan, app/index.html): the text is cut by the lesson's own speechChunks
// (vendor/ielts/host.js); each piece is looked up as written, without its full stop, with one, and a capitalised single word
// also in lower case; every piece must have a recording or the whole text goes to the device's voice (her own sentences, a
// week whose recordings are not made yet). Her accent (设置 → 口音) picks us / gb; slow picks the -slow set, else the
// everyday one at 0.8 with the pitch kept. 设置 →「内置的真人感录音」 off = the device's voice, as in the lesson.
//
// How it plays — the lesson's order, deliberately: an <audio> element on a blob of the clip first, Web Audio
// (decodeAudioData on INKWAVE's own AudioContext, G.audio.ctx — iOS limits how many a page may open) when the element
// refuses blob media, else the device's voice (speechSynthesis). The element comes first because on an iPhone it plays like
// music, with the silent switch on (WebKit gives <audio> the playback category; a page with only Web Audio gets the ambient
// one, muted by the switch) — so the words are heard even when the game's own sounds are not (IELTS-Base
// docs/native-integration.md §7). One clip at a time: every say() stops the one before (its onEnd still fires); the page
// hiding or going away stops it too. A text of several pieces plays piece by piece with the lesson's gaps (220 ms, 320 slow).
//
// Unlocking: Safari on a web page lets media play only after a tap; the first tap / key anywhere plays the lesson's silent
// clip (CLIP_SILENT) on our one element and resumes the AudioContext, so the 「听」 button, or the question that reads itself
// out after she walked to a gate, plays. Before that a refused play is caught and the device's voice is tried — never an
// error, never an unhandled rejection (index.html beacons those). Her App sets mediaTypesRequiringUserActionForPlayback = []
// (ios/IELTSBase/WebView.swift), so there it plays without a tap and the silent clip is skipped (it would pause her music
// for nothing).
//
// Quiet in development: the recordings are looked for only when the page is a game/ folder's page (…/game/ or
// …/game/index.html: app/game/ in her App or on her server) or ?audio=<base> names them; at the server root (this repo's
// dev server) there is no ../audio/ and not one request is made. ?noclips turns them off.
//
//   say(text, { slow, onEnd, device }) — device(): the caller's own device voice (hud-learn's), used when there is no recording
//   stop()                             — stop whatever is playing (its onEnd fires)
//   unlock()                           — call inside a tap (installed on the first tap / key anyway)
//   status()                           — { on, base, loaded, accent, last: { text, how, set, pieces }, device } for audits
//   deviceSpeak(text, { lang, rate, pitch, voice }, done) — the device's voice, the page's one (LEARN §56: device-voice.js —
//                                        the utterance held, no speak in the tick of a cancel, a watchdog); deviceVoice
//   createClips({ fetch, base, accent, chunks }) — the pure part (index, lookup, plan, bytes) for tests
import { ieltsLoaded, ieltsNow } from './ielts.js';
import * as WBK from './workbench.js';
import { G } from '../core/ctx.js';
import { createDeviceVoice } from './device-voice.js';

const GAP = { normal: 220, slow: 320 };   // ms between pieces (Clips.try: 220, slow 320)
const SLOW_NET = 2500;                    // the first bytes still not here: the device's voice (Clips.try's slowNet)
const MAX_SHARDS = 12, MAX_SEGS = 64;   // whole shards (only from a server without Range), single clips

/* ───────────────────────────── the pure part ───────────────────────────── */
// createClips({ fetch, base: 'https://…/audio/', accent: () => 'us' | 'gb', chunks: (text) => [pieces], maxShards? })
export function createClips(o) {
  const F = o.fetch, base = String(o.base || ''), maxShards = o.maxShards || MAX_SHARDS;
  const C = { idx: null, map: null, idxP: null, off: !F || !base, range: true, shards: new Map(), segs: new Map(), n: { range: 0, whole: 0, hit: 0 } };
  const lru = (m, k, v, max) => { m.delete(k); m.set(k, v); while (m.size > max) m.delete(m.keys().next().value); return v; };
  C.load = () => {
    if (C.off) return Promise.resolve(null);
    if (!C.idxP) {
      // no-cache, as the lesson: the shards keep their names when a week's recordings are added and every offset moves
      C.idxP = Promise.resolve().then(() => F(base + 'index.json', { cache: 'no-cache' })).then((r) => (r && r.ok ? r.json() : null)).then((j) => {
        if (!j || j.v !== 1 || !Array.isArray(j.texts) || !j.sets || typeof j.sets !== 'object') throw new Error('no clips');
        C.idx = j;
        C.map = new Map(j.texts.map((t, i) => [t, i]));
        return j;
      }).catch(() => { C.off = true; return null; });
    }
    return C.idxP;
  };
  // [shard, offset, length] of a piece (Clips.at: as written, or without / with its full stop — "Monday." in a list is
  // "Monday"; one word written with a capital also as in the word list)
  C.at = (set, text) => {
    const s = C.idx && C.idx.sets[set];
    if (!s || !C.map || !Array.isArray(s.at)) return null;
    const t = String(text), bare = t.replace(/[.!?]+$/, '');
    const low = /^[A-Z][a-z']+$/.test(bare) ? bare.toLowerCase() : '';
    for (const k of low ? [t, bare, bare + '.', low, low + '.'] : [t, bare, bare + '.']) {
      const i = C.map.get(k);
      if (i != null && Array.isArray(s.at[i])) return s.at[i];
    }
    return null;
  };
  const setName = (slow) => ((o.accent && o.accent()) === 'gb' ? 'gb' : 'us') + (slow ? '-slow' : '');
  // what would play: { set, rate, chunks: [text], at: [[shard, offset, length]] }; null = the device's voice says it all
  C.plan = (text, slow) => {
    if (!C.idx) return null;
    const chunks = (o.chunks ? o.chunks(String(text == null ? '' : text)) : [String(text)]).filter(Boolean);
    if (!chunks.length) return null;
    let set = setName(slow), rate = 1;
    if (!chunks.every((c) => C.at(set, c))) {
      if (!slow) return null;
      set = setName(false); rate = 0.8; // no slow take: the everyday one a little slower (the pitch is kept)
      if (!chunks.every((c) => C.at(set, c))) return null;
    }
    return { set, rate, chunks, at: chunks.map((c) => C.at(set, c)) };
  };
  const shard = (k) => {
    if (C.shards.has(k)) return lru(C.shards, k, C.shards.get(k), maxShards);
    const p = Promise.resolve().then(() => F(base + k + '.mp3', { cache: 'no-cache' })).then((r) => { if (!r || !r.ok) throw new Error('HTTP ' + (r && r.status)); C.n.whole++; return r.arrayBuffer(); });
    p.catch(() => C.shards.delete(k));
    return lru(C.shards, k, p, maxShards);
  };
  // one clip's MP3 bytes (an ArrayBuffer of exactly `length`)
  C.bytes = (set, a) => {
    const [n, off, len] = a, k = set + '-' + n, sk = k + ':' + off + ':' + len;
    if (C.segs.has(sk)) { C.n.hit++; return lru(C.segs, sk, C.segs.get(sk), MAX_SEGS); }
    let p;
    if (C.shards.has(k) || !C.range) p = shard(k).then((b) => b.slice(off, off + len));
    else {
      p = Promise.resolve().then(() => F(base + k + '.mp3', { cache: 'no-cache', headers: { Range: 'bytes=' + off + '-' + (off + len - 1) } })).then((r) => {
        if (r && r.status === 206) return r.arrayBuffer().then((b) => { if (b.byteLength !== len) throw new Error('range ' + b.byteLength + ' ≠ ' + len); C.n.range++; return b; });
        if (r && r.ok) {
          // the server sent the whole shard: keep it for the next clips of this shard, slice this one
          C.range = false; C.n.whole++;
          const whole = r.arrayBuffer();
          lru(C.shards, k, whole, maxShards);
          whole.catch(() => C.shards.delete(k));
          return whole.then((b) => b.slice(off, off + len));
        }
        throw new Error('HTTP ' + (r && r.status));
      });
    }
    p.catch(() => C.segs.delete(sk));
    return lru(C.segs, sk, p, MAX_SEGS);
  };
  return C;
}

// where the recordings are for this page, or '' (none: quiet). loc: { href, pathname, protocol, search }
export function clipsBase(loc) {
  if (!loc || !loc.href) return '';
  let q;
  try { q = new URLSearchParams(loc.search || ''); } catch (e) { q = null; }
  if (q && q.has('noclips')) return '';
  if (q && q.get('audio')) { try { return new URL(q.get('audio').replace(/\/?$/, '/'), loc.href).href; } catch (e) { return ''; } }
  if (/^file:/.test(loc.protocol || '')) return '';   // the lesson's rule too: no fetch from disk
  if (!/\/game\/(?:index\.html)?$/.test(loc.pathname || '')) return '';
  try { return new URL('../audio/', loc.href).href; } catch (e) { return ''; }
}

/* ───────────────────────────── the page's player ───────────────────────────── */
const W = typeof window !== 'undefined' ? window : null;
const inApp = () => { try { return !!(W && W.webkit && W.webkit.messageHandlers && W.webkit.messageHandlers.ielts); } catch (e) { return false; } };
let clips = null, el = null, src = null, gen = 0, cur = null, unlocked = false, blobRefused = false;
const last = { text: '', how: 'none', set: '', pieces: 0 };

function ls() { try { return W && W.localStorage ? W.localStorage : null; } catch (e) { return null; } }
function enabled() { return !!(clipsInst() && !clips.off && WBK.clipsOn(ls())); }
function clipsInst() {
  if (clips || !W) return clips;
  const base = clipsBase(W.location);
  clips = createClips({
    fetch: base && typeof W.fetch === 'function' ? (u, o) => W.fetch(u, o) : null, base,
    accent: () => WBK.accent(ls()),
    chunks: (t) => (ieltsLoaded() ? ieltsNow().Host.speechChunks(t) : [t]),
  });
  return clips;
}
function audioEl() { if (!el && W && typeof W.Audio === 'function') { el = new W.Audio(); el.preload = 'auto'; } return el; }
function ctxOf() {
  const c = G.audio && G.audio.ctx;
  if (c && c.state !== 'closed' && typeof c.decodeAudioData === 'function') return c;
  return null;
}

// inside a tap: the lesson's silent clip on our element (Safari's media unlock), and INKWAVE's context resumed. Unlocked
// only once the play went through (or was taken over by a clip in the same tap); a refused one waits for the next tap.
let unlocking = false;
const UNLOCK_EVENTS = ['pointerup', 'touchend', 'click', 'keydown'];
function onFirstTap() { unlock(); }
function detachUnlock() { if (W) UNLOCK_EVENTS.forEach((n) => W.removeEventListener(n, onFirstTap, true)); }
export function unlock() {
  try { const c = ctxOf(); if (c && c.state === 'suspended') { const r = c.resume(); if (r && r.catch) r.catch(() => {}); } } catch (e) { /* ignore */ }
  if (unlocked || unlocking || !W) return;
  if (inApp() || (clipsInst() && clips.off)) { detachUnlock(); return; }   // nothing to unlock: the App plays without a tap; no recordings here
  if (!enabled()) return;
  const a = audioEl();
  // (something already playing on it: it is unlocked — never cut a word off for the silent clip)
  if (!a || !ieltsLoaded() || (cur && !a.paused)) return;
  const ok = () => { unlocking = false; unlocked = true; detachUnlock(); };
  unlocking = true;
  try {
    a.src = ieltsNow().Host.CLIP_SILENT;
    const p = a.play();
    // interrupted (the 听 button's own clip takes the element in the same tap: an AbortError) is played inside the tap,
    // which is what unlocks it; refused (NotAllowedError: not a tap after all) waits for the next one
    if (p && p.then) p.then(ok, (e) => { if (e && e.name === 'AbortError') ok(); else unlocking = false; });
    else ok();
  } catch (e) { unlocking = false; }
}

export function stop() {
  gen++;
  const c = cur; cur = null;
  if (c) { clearTimeout(c.dog); clearTimeout(c.gap); }
  if (el) { el.onended = null; el.onerror = null; try { el.pause(); } catch (e) { /* ignore */ } }
  if (src) { const s = src; src = null; s.onended = null; try { s.stop(); } catch (e) { /* ignore */ } }
  deviceVoice.cancel();   // (LEARN §56: only when something is said — a speak straight after a cancel is dropped on iOS)
  if (c && c.onEnd) { try { c.onEnd(); } catch (e) { /* the caller's */ } }
}

// say(text, { slow, onEnd, device }) — the recording when there is one, else device() (or the built-in device voice)
export function say(text, opt) {
  opt = opt || {};
  stop();
  const g = gen, t = String(text == null ? '' : text).trim();
  let ended = false;
  const end = () => { if (ended || g !== gen) return; ended = true; cur = null; if (opt.onEnd) { try { opt.onEnd(); } catch (e) { /* the caller's */ } } };
  cur = { onEnd: () => { if (!ended) { ended = true; if (opt.onEnd) opt.onEnd(); } }, dog: 0, gap: 0 };
  const device = (from) => {
    if (g !== gen) return;
    last.how = 'device';
    const rest = from ? from : t;
    const done = () => end();
    if (typeof opt.device === 'function') { try { opt.device(rest, done); } catch (e) { done(); } }
    else speakDevice(rest, done, opt.slow);
  };
  last.text = t; last.how = 'none'; last.set = ''; last.pieces = 0;
  if (!t) { end(); return; }
  if (!enabled()) { device(); return; }
  clips.load().then(() => {
    if (g !== gen) return;
    const pl = clips.plan(t, !!opt.slow);
    if (!pl) { device(); return; }
    last.set = pl.set; last.pieces = pl.chunks.length;
    let i = 0;
    const step = () => {
      if (g !== gen) return;
      if (i >= pl.chunks.length) { end(); return; }
      let waited = false;
      const slowNet = setTimeout(() => { waited = true; device(pl.chunks.slice(i).join(' ')); }, SLOW_NET);
      if (cur) cur.dog = slowNet;
      clips.bytes(pl.set, pl.at[i]).then((ab) => {
        clearTimeout(slowNet);
        if (waited || g !== gen) return;
        out(ab, pl.rate, g, () => { i++; if (g !== gen) return; if (i < pl.chunks.length) { if (cur) cur.gap = setTimeout(step, opt.slow ? GAP.slow : GAP.normal); } else end(); }, () => device(pl.chunks.slice(i).join(' ')));
      }, () => { clearTimeout(slowNet); if (!waited) device(pl.chunks.slice(i).join(' ')); });
    };
    step();
  }, () => device());
}

// one clip: the element on a blob (Clips.out), Web Audio when blob media is refused (Clips.outWA), fail() = the device voice
function out(ab, rate, g, done, fail) {
  if (blobRefused || !audioEl() || typeof Blob !== 'function' || !W.URL || typeof W.URL.createObjectURL !== 'function') { outWA(ab, rate, g, done, fail); return; }
  const a = audioEl();
  let url = '', settled = false, dog = 0;
  try { url = W.URL.createObjectURL(new Blob([ab], { type: 'audio/mpeg' })); } catch (e) { blobRefused = true; outWA(ab, rate, g, done, fail); return; }
  const fin = (fn) => {
    if (settled) return;
    settled = true; clearTimeout(dog);
    a.onended = null; a.onerror = null;
    setTimeout(() => { try { W.URL.revokeObjectURL(url); } catch (e) { /* ignore */ } }, 1500);
    if (g === gen) fn();
  };
  a.onended = () => fin(done);
  a.onerror = () => fin(() => { blobRefused = true; outWA(ab, rate, g, done, fail); }); // media from blob: refused here
  a.src = url;
  try { a.defaultPlaybackRate = rate; a.playbackRate = rate; a.preservesPitch = true; a.webkitPreservesPitch = true; } catch (e) { /* ignore */ }
  let p = null;
  try { p = a.play(); } catch (e) { fin(() => outWA(ab, rate, g, done, fail)); return; }
  last.how = 'clip';
  duck();
  if (p && typeof p.then === 'function') {
    // refused (not unlocked yet on a web page): Web Audio if the context runs, else the device's voice
    p.then(() => { dog = setTimeout(() => fin(done), (a.duration && isFinite(a.duration) ? a.duration * 1000 / rate : 8000) + 1500); }, () => fin(() => outWA(ab, rate, g, done, fail)));
  }
}
function outWA(ab, rate, g, done, fail) {
  const c = ctxOf();
  if (!c || c.state !== 'running') { fail(); return; }   // a suspended context would never end: the device's voice instead
  let once = false;
  const bad = () => { if (!once) { once = true; if (g === gen) fail(); } };
  const good = (buf) => {
    if (once || g !== gen) return;
    once = true;
    try {
      const s = c.createBufferSource();
      s.buffer = buf; s.playbackRate.value = rate; s.connect(c.destination);
      s.onended = () => { if (src === s) src = null; if (g === gen) done(); };
      src = s; s.start();
      last.how = 'webaudio';
      duck(buf.duration / rate);
    } catch (e) { once = false; bad(); }
  };
  try { const p = c.decodeAudioData(ab.slice(0), good, bad); if (p && typeof p.catch === 'function') p.catch(bad); } catch (e) { bad(); }
}
// the game's music steps back while a word is said (INKWAVE's own duck; the sound effects stay)
function duck(sec) { try { G.audio && G.audio.duck && G.audio.duck(0.45, Math.min(12, Math.max(1, sec || 2))); } catch (e) { /* ignore */ } }

// the device's voice, the page's one (LEARN §56): every speak and cancel goes through it — stop() above, the built-in voice
// below, hud-learn's own (_device) — so a cancel and the speak after it are seen together
export const deviceVoice = createDeviceVoice({ synth: () => W && W.speechSynthesis, Utterance: () => W && W.SpeechSynthesisUtterance });
export function deviceSpeak(text, o, done) { return deviceVoice.speak(text, o, done); }

// the built-in device voice (a caller without its own): en-US, a little slow for a beginner, slower when asked
let voice = null;
function speakDevice(text, done, slow) {
  const S = W && W.speechSynthesis;
  try {
    if (!voice && S) { const vs = S.getVoices() || []; voice = vs.find((v) => /^en[-_]US/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null; }
  } catch (e) { voice = null; }
  deviceSpeak(text, { lang: 'en-US', rate: slow ? 0.72 : 0.92, voice }, done);
}

export function status() {
  const c = clips;
  return { on: !!(c && !c.off), base: c ? c.idx ? 'loaded' : c.off ? 'off' : 'pending' : 'none', loaded: !!(c && c.idx), accent: WBK.accent(ls()), playing: !!cur, unlocked, inApp: inApp(), blobRefused,
    fetched: c ? Object.assign({}, c.n, { range: c.range ? c.n.range : 'off', shards: c.shards.size, segs: c.segs.size }) : null, last: Object.assign({}, last),
    device: { live: !!deviceVoice.live, pending: deviceVoice.pending } };
}

// the page: unlock on the first tap / key (pointerup and touchend are the touch events Safari counts as a tap), stop when the
// page hides or goes away; audits read G.learnAudio
if (W && typeof document !== 'undefined') {
  UNLOCK_EVENTS.forEach((n) => W.addEventListener(n, onFirstTap, true));
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(); });
  W.addEventListener('pagehide', () => stop());
  G.learnAudio = { say, stop, unlock, status, base: () => clipsBase(W.location) };
}
