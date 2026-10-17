// 题即玩法 play-wire — 字弹 M4 in the puzzle (docs/PLAY.md §3 M4, §4; the type rig / keyboard / ink word are LEARN §19's,
// src/learn/play/type/ + src/ui/play-keys.js): a typed item (单词卡 word · 听写句 dict · 写句 write, and the typed
// rewording of a choice) is the 打字蟹 — she hops into the rig, the game keyboard rises, every key a shot of grey ink
// on the paper, 射 lobs the sheet at a spot on the route past the gate where it grows into a 3D ink word; the flow judges
// the text right there (flow._judgeRecord: the one path) and the word plays the verdict (her ink / coral + the right
// spelling / the dictation's share). Nothing here judges; the rig never sees an answer before 射 (PLAY §1.3).
//
//   const S = new TypeStation(host)
//   S.fits(item, p)            a typed prompt ('type' | 'typed' | 'write')
//   S.ask(g, item, p)          the rig (mounted on first use), the keyboard, the strip, the camera's 'type' frame
//   S.update(dt)               every frame (the rig and the word animate on, whoever is asking); S.gate(on) stops the
//                              physical keys while a menu is up
//   S.pose · S.still           the camera pose wanted (null when idle) · she stands while she types
//   S.clear() · S.dispose() · S.debug()
// play-fix — the typing lens the way play-4 got it right in the runner (runner/glide.js): the band is the real one — the
// strip's bottom edge as it stands on the screen (upright it sits under the clock and the pause / map keys, about a fifth
// of the way down: frame.js's default 0.1 put the paper under it) and the keyboard's real share — read off the DOM after
// both are up (and again at most every 0.4 s: the hint re-shows the strip), frameFor run once per band and kept; the
// pose is re-based every frame on the rig's own hull yaw and her feet (the hull springs, the lens rides with it); the
// way she faces is picked with the lens in mind too (her head → the lens, the lens → the keys: no roof, no wall); on a
// landscape phone the strip goes up to the top edge in one line while she types (the keyboard has ▶ and 提示 at its rows'
// starts) — the typewriter gets about twice the height. 「我的写法也对」 (a written sentence, PLAY §4 W / S): a near miss
// comes back HELD from flow._judgeRecord ({ hold: true } → { held }) — nothing written, the ink word stays grey — and the
// strip offers 「我的写法也对 / 继续」 (the play-4 / play-5 convention); her tap decides (o.decided, o.claim), only then
// does the word play a verdict. No time-out (PLAY §1.6).
// play-7 — on a landscape screen the game keyboard is split (keys.js): the typing frame is type/split.js's, in the open
// column between the two pads (landscape.js typingColumn: under the clock row, down to the bottom), and the strip moves
// to the top-left corner over the left pad while she types (landscape.js: the clock keeps the top centre).
import * as THREE from 'three';
import { G, clamp } from '../../../core/ctx.js';
import { LEARN } from '../../../config.js';
import { EFFECTS } from '../../design.js';
import { TypeShot } from '../type/shot.js';
import { frameFor, FRAME, RIG_POINTS, searchFrame } from '../type/frame.js';
import { wordBox } from '../type/inkword.js';
import { PlayKeys } from '../../../ui/play-keys.js';
import { verdictLines } from '../m1.js';
import { ieltsNow } from '../../ielts.js';
import { splitFrame } from '../type/split.js';
import { typingColumn, ensureLandscapeCss } from '../landscape.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3();
const TYPED = new Set(['type', 'typed', 'write']);
const HEAD_MARGIN = 0.05;   // NDC: her head this far under the keys' middle row in the typing frame (≈ 20 px upright, 10 px landscape)
// the strip while she types on a landscape phone (play-4's runner rule, tips.js, for the puzzle): up to the top edge, one
// line, no ▶ — the band between it and the keyboard (44 % of the height) is what the typewriter gets
const CSS = `@media (max-height: 460px) and (orientation: landscape) {
  .iw-ps.is-typing:not(.is-runner) .iw-ps__box { top: 6px; padding: 4px 14px; gap: 8px; border-radius: 16px; }
  .iw-ps.is-typing:not(.is-runner) .iw-ps__play { display: none; }
  .iw-ps.is-typing:not(.is-runner):not(.is-verdict) .iw-ps__text { display: flex; align-items: baseline; gap: 12px; white-space: nowrap; min-width: 0; }
  .iw-ps.is-typing:not(.is-runner) .iw-ps__q, .iw-ps.is-typing:not(.is-runner) .iw-ps__head { font-size: 17px; }
  .iw-ps.is-typing:not(.is-runner) .iw-ps__zh { margin-top: 0; font-size: 17px; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
}`;
let cssDone = false;
function ensureCss() { if (cssDone || typeof document === 'undefined') return; cssDone = true; const el = document.createElement('style'); el.id = 'iw-wire-type-css'; el.textContent = CSS; document.head.appendChild(el); }

export class TypeStation {
  constructor(host) {
    this.host = host; this.flow = host.flow; this.match = host.match;
    this.shot = null; this.keys = null; this.cur = null; this.mounted = false;
    this.log = [];
    this._fc = new Map();   // frameFor's typing frames by band (a search: once per band / aspect)
    this._tp = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 52, fits: true };   // the typing pose, re-based every frame
    this.stats = { asked: 0, held: 0, self: 0, lensTurned: 0 };
  }
  fits(item, p) { return !!(p && TYPED.has(p.type) && !p._flip); }
  get still() { return !!this.cur; }
  get pose() { return this.cur ? this.cur.pose : null; }

  _ensure() {
    if (this.shot) return;
    ensureCss(); ensureLandscapeCss();
    const color = G.teamColors[0] || new THREE.Color('#ff8a14');
    this.shot = new TypeShot({ scene: G.scene, team: 0, color, quality: G.settings?.quality || 'high', reduced: this.host.reduced });
    try { this.shot.warm(G.renderer, G.camera, G.scene)?.catch?.(() => {}); } catch (e) { /* warmed on first use */ }
    const root = (G.hud && G.hud.root) || document.body;
    const keys = (this.keys = new PlayKeys(root, { mode: 'word', color: G.teamHex?.[0] || '#ff8a14', replay: true }));
    keys.hide();
    keys.onKey = (k) => { if (this.cur && !this.cur.answered) this.shot.key(k); };
    keys.onBackspace = () => { if (this.cur && !this.cur.answered) this.shot.back(); };
    keys.onHint = () => this._hint();
    keys.onReplay = () => { if (this.cur) this.host.say(this.cur.p.tts, { slow: !!(this.cur.p._tip && this.cur.p._tip.slow) }); };
    keys.onSubmit = () => this._submit();
  }
  // (play-7: the split frame is a search — run it for this screen now, not on the first frame the keyboard is up)
  warm() { this._ensure(); const col = typingColumn(this.keys); if (col) splitFrame(col); }

  // ---------------------------------------------------------------------------------------------- a question
  ask(g, item, p) {
    this._ensure();
    const a = this.match.local, H = this.host;
    const ref = String((item.meta && item.meta.ref) || item.en || '');
    const mode = p.type === 'write' || /\s/.test(ref) ? 'sentence' : 'word';
    // the keyboard and the strip first: the typing frame is fitted to where they really are (play-fix)
    this.keys.setMode(mode); this.keys.clear(); this.keys.setHintUsed(false); this.keys.show();
    H.strip?.show(p, { replay: () => H.say(p.tts, { slow: !!(p._tip && p._tip.slow) }) });
    H.strip?.el?.classList?.add('is-typing');
    H.strip?.fit(H.m1._topKeys());
    const band = this._band(), f = this._typeFrame(band);
    // she faces the route past the gate — or, when a wall / a ledge / a planter stands close that way, the nearest
    // direction with the longest open stretch (the ink word is about 4 m wide); the word forms FRAME.dist m ahead (closer
    // when the stretch is shorter), on ground near her own level, with a clear line from her head to it. play-fix: and
    // the typing lens that way must be in the open (her head → the lens, the lens → the keys) — under the harbour's
    // pavilion roof, past a wall, the picture was the floor or a wall
    const yaw0 = H.facingYaw(g, a);
    const reach = (yaw) => {
      let targetY = a.pos.y, dist = FRAME.dist, ok = false;
      for (const d of [FRAME.dist, 5.2, 4.2, 3.4]) {
        _v.set(a.pos.x + Math.sin(yaw) * d, a.pos.y, a.pos.z + Math.cos(yaw) * d);
        const gy = G.level ? G.level.groundHeight(_v.x, _v.z, a.pos.y + 1.0) : -Infinity;
        const near = gy > -Infinity && Math.abs(gy - a.pos.y) < 0.9;
        const clear = !G.physics || !G.physics.los || (G.physics.los(_w.set(a.pos.x, a.pos.y + 1.5, a.pos.z), _v.set(_v.x, (near ? gy : a.pos.y) + 1.4, _v.z)) && G.physics.los(_w.set(a.pos.x, a.pos.y + 1.5, a.pos.z), _v.set(_v.x, (near ? gy : a.pos.y) + 2.4, _v.z)));
        dist = d; targetY = near ? gy : a.pos.y; ok = near && clear;
        if (ok) break;
      }
      return { yaw, dist: ok ? dist : 0, targetY, lens: this._lensClear(f, yaw, a.pos) };
    };
    const better = (r, b) => (r.lens !== b.lens ? r.lens : r.dist > b.dist);
    let pick = reach(yaw0);
    if (!pick.lens || pick.dist < FRAME.dist) {
      for (const dy of [0.45, -0.45, 0.9, -0.9, 1.4, -1.4, 2.0, -2.0, 2.6, -2.6, Math.PI]) {
        // (past ±1.4 rad only for the lens: the word may then land short, she faces a little back along the route)
        if (Math.abs(dy) > 1.5 && pick.lens) break;
        const r = reach(yaw0 + dy); if (better(r, pick)) pick = r;
        if (pick.lens && pick.dist >= FRAME.dist) break;
      }
    }
    if (pick.yaw !== yaw0 && pick.lens) this.stats.lensTurned++;
    const yaw = pick.yaw, dist = pick.dist || 3.4, targetY = pick.targetY;
    if (!this.mounted) { a.yaw = a.aimYaw = yaw; this.shot.mount(a); this.mounted = true; }
    else if (Math.abs(((yaw - a.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 0.4) { a.yaw = a.aimYaw = yaw; this.shot.rig.hullYaw = yaw; }
    _v.set(a.pos.x + Math.sin(yaw) * dist, targetY + 0.1, a.pos.z + Math.cos(yaw) * dist);
    this.shot.opts.groundY = targetY;
    this.shot.begin({ mode, target: _v.clone() });
    this.cur = { g, item, p, mode, yaw, targetY, dist, t: 0, answered: false, hinted: false, verdict: null, pose: null, text: '', band, f, bandT: 0, lens: pick.lens, held: null };
    this.cur.pose = this._typePose();
    if (p.tts) H.say(p.tts, { slow: !!(p._tip && p._tip.slow) });
    this.stats.asked++;
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'ask', item: item.id, mode, dist, dy: +(targetY - a.pos.y).toFixed(2), band: band.key, lens: pick.lens, turn: +(yaw - yaw0).toFixed(2) });
    return true;
  }

  // the band the typewriter is framed in (play-fix): the strip's real bottom edge (+ 6 px) and the keyboard's real share
  _band() {
    const W = innerWidth, Hh = innerHeight || 1, aspect = W / Hh;
    const r = this.host.strip?.rect?.();
    const top = r ? +clamp(Math.ceil(((r.bottom + 6) / Hh) * 50) / 50, 0.06, 0.45).toFixed(2) : FRAME.topFrac;
    const kb = this.keys ? +clamp(Math.ceil(this.keys.frac * 50) / 50, 0, 0.6).toFixed(2) : (aspect < 1 ? 0.4 : 0.45);
    // play-7: the split keyboard's open column (the typing frame's; `top` stays the strip's for the ink word's frame)
    const col = typingColumn(this.keys);
    return { aspect, top, kb, split: col, key: `${aspect.toFixed(2)}|${kb}|${top}` + (col ? `|${col.top}|${col.x0}-${col.x1}|${col.shelf}` : '') };
  }
  // the typing frame (the rig's own frame: origin at her feet, +Z the hull, +X her left), kept per band: frame.js's search
  // with her head HEAD_MARGIN (NDC) below the keys' middle row (a wide screen: the far row) rather than just below it —
  // the audit's first after-run had her head 1–2 px under the row (the frame stops at the first pose that passes; the
  // hair and the seat sit higher than RIG_POINTS.head); no frame like that fits the band → frame.js's own
  _typeFrame(band) {
    let f = this._fc.get(band.key);
    if (!f && band.split) { f = splitFrame(band.split); if (f) this._fc.set(band.key, f); }   // (play-7: the column between the pads)
    if (!f) {
      const m = FRAME.margin * 2, R = RIG_POINTS, row = band.aspect > 1.4 ? [0, 1.16, 1.12] : R.midRow;
      f = searchFrame([...R.plate, R.strike, ...R.textLines, R.typed10], [(P) => P(R.head) < P(row) - HEAD_MARGIN], { aspect: band.aspect, vfov: FRAME.vfov, yLo: -1 + 2 * band.kb + m, yHi: 1 - 2 * band.top - m, xLim: 1 - m, cz: 1.0 });
      if (!f.fits) f = frameFor({ phase: 'type', aspect: band.aspect, kbFrac: band.kb, topFrac: band.top });
      this._fc.set(band.key, f); if (this._fc.size > 12) this._fc.delete(this._fc.keys().next().value);
    }
    return f;
  }
  // is the typing lens in the open for this facing? her head → the lens, the lens → the keys' middle
  _lensClear(f, yaw, at) {
    const P = G.physics; if (!P || !P.los) return true;
    const sy = Math.sin(yaw), cy = Math.cos(yaw);
    _c.set(at.x + cy * f.pos[0] + sy * f.pos[2], at.y + f.pos[1], at.z - sy * f.pos[0] + cy * f.pos[2]);
    return P.los(_w.set(at.x, at.y + 1.6, at.z), _c) && P.los(_c, _v.set(at.x + sy * 0.86, at.y + 1.08, at.z + cy * 0.86)) && P.los(_c, _v.set(at.x + sy * 1.7, at.y + 1.95, at.z + cy * 1.7));
  }
  // the typing pose in the world, re-based on the hull and her feet (a persistent object: nothing allocated per frame)
  _typePose() {
    const C = this.cur, a = this.match.local; if (!C || !a) return null;
    const f = C.f, P = this._tp;
    const yaw = this.mounted && this.shot && this.shot.rig ? this.shot.rig.hullYaw : C.yaw, sy = Math.sin(yaw), cy = Math.cos(yaw);
    P.pos.set(a.pos.x + cy * f.pos[0] + sy * f.pos[2], a.pos.y + f.pos[1], a.pos.z - sy * f.pos[0] + cy * f.pos[2]);
    P.look.set(a.pos.x + cy * f.look[0] + sy * f.look[2], a.pos.y + f.look[1], a.pos.z - sy * f.look[0] + cy * f.look[2]);
    P.fov = f.fov; P.fits = f.fits;
    return P;
  }

  // the rig-frame pose from frame.js → world: origin at her feet, +Z her facing, +X her left
  _pose(phase, text) {
    const C = this.cur, a = this.match.local; if (!C || !a) return null;
    const W = innerWidth, H = innerHeight, aspect = W / H;
    const o = { phase, aspect, kbFrac: phase === 'type' ? this.keys.frac : 0, topFrac: C.band ? C.band.top : undefined, dist: C.dist };
    if (phase === 'word') { const b = wordBox(text || C.text || 'word'); o.word = { w: b.w, h: b.h, y: C.targetY + 0.1 + this.shot.lift - a.pos.y }; }
    const sy = Math.sin(C.yaw), cy = Math.cos(C.yaw);
    const toW = (q) => new THREE.Vector3(a.pos.x + cy * q[0] + sy * q[2], a.pos.y + q[1], a.pos.z - sy * q[0] + cy * q[2]);
    if (phase !== 'word') { const f = frameFor(o); return { pos: toW(f.pos), look: toW(f.look), fov: f.fov, fits: f.fits }; }
    // the word's frame (play-fix): with the strip's real bottom the frame stands further back, and in the first gate's plaza
    // that put the fountain's statue between the lens and her (the held word stood grey behind it) — so the lens must see
    // the word, the rig, and her head must see the lens: the real band first, then frame.js's own band (nearer), then
    // half way to the word; none clear → the typing pose holds (the word forms ahead of her, above the rig)
    const P = G.physics, wy = a.pos.y + o.word.y;
    _c.set(a.pos.x + sy * C.dist, wy, a.pos.z + cy * C.dist);
    const clear = (pose) => !P || !P.los || (P.los(pose.pos, _c) && P.los(pose.pos, _v.set(a.pos.x + sy * 0.9, a.pos.y + 1.2, a.pos.z + cy * 0.9)) && P.los(_w.set(a.pos.x, a.pos.y + 1.6, a.pos.z), pose.pos));
    const tries = [o, { ...o, topFrac: undefined }, { ...o, topFrac: undefined, dist: Math.max(3, C.dist * 0.6) }];
    for (let k = 0; k < tries.length; k++) {
      const f = frameFor(tries[k]);
      // (a nearer word frame keeps the word where it is: only the lens's spot changes)
      const pose = { pos: toW(f.pos), look: k < 2 ? toW(f.look) : _c.clone(), fov: f.fov, fits: f.fits, lens: k };
      if (clear(pose)) { this.log.push({ t: +this.flow.t.toFixed(2), ev: 'wordLens', k }); return pose; }
    }
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'wordLens', k: -1 });
    return C.pose && C.pose.pos ? { pos: C.pose.pos.clone(), look: _c.clone(), fov: C.pose.fov, fits: false, lens: -1 } : null;
  }

  _hint() {
    const C = this.cur; if (!C || C.answered) return;
    this.shot.hint(); this.keys.setHintUsed(true); C.hinted = true;
    const p = C.p, h = p.hint || {};
    // the hint on the strip: a word's meaning and IPA, a sentence's Chinese (the flow records H for this answer)
    const line = h.zh || h.ipa ? [h.zh, h.ipa ? `/${h.ipa}/` : ''].filter(Boolean).join('  ') : (C.item.zh || '');
    this.host.strip?.show({ text: p.text, zh: line ? `提示：${line}` : '', tts: p.tts }, { replay: () => this.host.say(p.tts) });
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'hint' });
  }

  _submit() {
    const C = this.cur; if (!C || C.answered) return;
    const text = this.shot.submit(); if (text == null) return;
    C.text = text; C.answered = true;
    this.keys.hide();
    C.pose = this._pose('word', text);
    const { g, item, p } = C, F = this.flow;
    const out = F._judgeRecord(g, item, p, text, { hinted: C.hinted, hold: true });   // the one path
    if (out.held) {
      // 「我的写法也对」: nothing written yet — the word forms and stays grey; the strip asks, her tap decides (no time-out)
      C.held = out; this.stats.held++;
      this.host.strip?.verdict({ ok: false, head: '差一点 — 意思到了', why: (out.r && out.r.why) ? String(out.r.why).slice(0, 46) : '', actions: [
        { text: '我的写法也对', primary: true, onTap: () => this._decide(true) },
        { text: '继续', onTap: () => this._decide(false) },
      ] });
      F._emit('learn:held', { itemId: item.id, gate: g.id });
      this.log.push({ t: +F.t.toFixed(2), ev: 'held', item: item.id });
      return;
    }
    this._resolve(out);
  }
  // her call on a held sentence: claimed (S when the claim stands) or 继续 (the miss, W) — written now, by the one path
  _decide(claim) {
    const C = this.cur; if (!C || !C.held) return;
    const { g, item, p } = C, F = this.flow;
    C.held = null;
    const out = F._judgeRecord(g, item, p, C.text, { hinted: C.hinted, decided: true, claim: !!claim });
    out.self = !!(claim && out.r.ok && out.r.claimed);
    if (out.self) this.stats.self++;
    this.log.push({ t: +F.t.toFixed(2), ev: 'decided', claim: !!claim, ok: out.r.ok, self: out.self });
    this._resolve(out);
  }
  // the verdict, once written: the strip, the cue, the lock, and the ink word plays it
  _resolve(out) {
    const C = this.cur, F = this.flow, { g, item } = C, text = C.text, { r, first, again } = out;
    const v = verdictLines(r, item);
    if (r.pct != null && !r.ok) v.head = `差一点：${r.pct}%，是 ${r.canonical}`;
    if (out.self) v.head = '记下了 — 你的写法也对';
    C.verdict = { ok: r.ok, first, again, head: v.head, why: v.why, pct: r.pct ?? null, self: !!out.self };
    this.host.strip?.verdict(v);
    const E = r.ok ? EFFECTS.puzzle.right : again ? EFFECTS.puzzle.wrong : EFFECTS.puzzle.wrong2;
    G.audio?.play?.(E.sfx, { volume: 0.8 });
    if (!r.ok) g._lockPopAt = G.time;
    // the dictation: which of her words matched, by the host's own lcsOk (the judge's percent is the evidence)
    let typedOk;
    if (item.meta && item.meta.kind === 'dict') {
      // (lcsOk marks its first list: her tokens' words against the reference's; a token is right when all its words are —
      // the host's tokMarks, the other way round)
      try {
        const Hs = ieltsNow().Host, refW = Hs.toks(r.canonical).reduce((acc, t) => acc.concat(Hs.dictWords(t)), []);
        const hypT = Hs.toks(text), at = [], hypW = [];
        hypT.forEach((t, j) => Hs.dictWords(t).forEach((w) => { at.push(j); hypW.push(w); }));
        const okW = Hs.lcsOk(hypW, refW), ok = hypT.map(() => true);
        at.forEach((j, k) => { ok[j] = ok[j] && !!okW[k]; });
        typedOk = ok.length === text.trim().split(/\s+/).length ? ok : undefined;
      } catch (e) { typedOk = undefined; }
    }
    this.log.push({ t: +F.t.toFixed(2), ev: 'answer', item: item.id, ok: r.ok, pct: r.pct ?? null, first, hinted: C.hinted, self: !!out.self });
    this.shot.resolve({ ok: r.ok, pct: r.pct, right: r.canonical, toks: r.toks, typedOk }).then(() => this._next(C));
  }
  _next(C) {
    if (this.cur !== C) return;
    const g = C.g; this.cur = null;
    this.flow._askNext(g);   // (the next item of this gate: typed again — the rig stays — or something else: clear())
  }

  // ---------------------------------------------------------------------------------------------- per frame
  gate(on) { if (this.keys) this.keys.enabled = !!on; }
  update(dt) {
    this.shot?.update(dt);
    const C = this.cur, a = this.match.local; if (!C || !a) return;
    C.t += dt;
    // she keeps facing the target while she types (the aimFace springs; the hull turns itself on 射)
    a.aimYaw = C.yaw; a.fireFacing = Math.max(a.fireFacing || 0, 0.3);
    if (this.host.resized) { this.keys.layout(); if (C.answered) C.pose = this._pose('word', C.text); else C.bandT = 1; }
    if (!C.answered) {
      // (the band read again at most every 0.4 s — the hint re-shows the strip, a turn of the phone moves everything)
      C.bandT += dt;
      if (C.bandT >= 0.4) { C.bandT = 0; const b = this._band(); if (b.key !== C.band.key) { C.band = b; C.f = this._typeFrame(b); } }
      C.pose = this._typePose();
    }
  }

  clear() {
    this.cur = null;
    this.host.strip?.el?.classList?.remove('is-typing');
    if (this.keys) this.keys.hide();
    if (this.shot) { this.shot.clear(); if (this.mounted) { this.shot.unmount(); this.mounted = false; } }
  }
  debug() {
    const C = this.cur;
    return C ? { item: C.item.id, mode: C.mode, phase: this.shot.phase, text: this.shot.text, answered: C.answered, hinted: C.hinted, verdict: C.verdict, kbUp: !!(this.keys && this.keys.visible), kbFrac: this.keys ? +this.keys.frac.toFixed(3) : null, band: C.band && C.band.key, lens: C.lens, held: !!C.held, pose: C.pose && { pos: C.pose.pos.toArray().map((v) => +v.toFixed(2)), fov: C.pose.fov, fits: C.pose.fits }, stats: { ...this.stats }, log: this.log.slice(-10) } : { idle: true, mounted: this.mounted, stats: { ...this.stats }, log: this.log.slice(-6) };
  }
  dispose() { this.clear(); this.shot?.dispose(); this.keys?.destroy(); this.shot = null; this.keys = null; }
}
