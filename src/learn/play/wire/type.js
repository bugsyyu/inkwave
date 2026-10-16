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
import * as THREE from 'three';
import { G } from '../../../core/ctx.js';
import { LEARN } from '../../../config.js';
import { EFFECTS } from '../../design.js';
import { TypeShot } from '../type/shot.js';
import { frameFor, FRAME } from '../type/frame.js';
import { wordBox } from '../type/inkword.js';
import { PlayKeys } from '../../../ui/play-keys.js';
import { verdictLines } from '../m1.js';
import { ieltsNow } from '../../ielts.js';

const _v = new THREE.Vector3(), _w = new THREE.Vector3();
const TYPED = new Set(['type', 'typed', 'write']);

export class TypeStation {
  constructor(host) {
    this.host = host; this.flow = host.flow; this.match = host.match;
    this.shot = null; this.keys = null; this.cur = null; this.mounted = false;
    this.log = [];
  }
  fits(item, p) { return !!(p && TYPED.has(p.type) && !p._flip); }
  get still() { return !!this.cur; }
  get pose() { return this.cur ? this.cur.pose : null; }

  _ensure() {
    if (this.shot) return;
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
  warm() { this._ensure(); }

  // ---------------------------------------------------------------------------------------------- a question
  ask(g, item, p) {
    this._ensure();
    const a = this.match.local, H = this.host;
    const ref = String((item.meta && item.meta.ref) || item.en || '');
    const mode = p.type === 'write' || /\s/.test(ref) ? 'sentence' : 'word';
    // she faces the route past the gate; the word forms FRAME.dist m ahead, on the ground there
    const yaw = H.facingYaw(g, a);
    if (!this.mounted) { a.yaw = a.aimYaw = yaw; this.shot.mount(a); this.mounted = true; }
    else if (Math.abs(((yaw - a.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 0.4) { a.yaw = a.aimYaw = yaw; this.shot.rig.hullYaw = yaw; }
    _v.set(a.pos.x + Math.sin(yaw) * FRAME.dist, a.pos.y, a.pos.z + Math.cos(yaw) * FRAME.dist);
    const gy = G.level ? G.level.groundHeight(_v.x, _v.z, a.pos.y + 2.5) : -Infinity;
    const targetY = gy > -Infinity && Math.abs(gy - a.pos.y) < 2.5 ? gy : a.pos.y;
    _v.y = targetY + 0.1;
    this.shot.opts.groundY = targetY;
    this.shot.begin({ mode, target: _v.clone() });
    this.keys.setMode(mode); this.keys.clear(); this.keys.setHintUsed(false); this.keys.show();
    this.cur = { g, item, p, mode, yaw, targetY, t: 0, answered: false, hinted: false, verdict: null, pose: null, text: '' };
    this.cur.pose = this._pose('type');
    H.strip?.show(p, { replay: () => H.say(p.tts, { slow: !!(p._tip && p._tip.slow) }) });
    H.strip?.fit(H.m1._topKeys());
    if (p.tts) H.say(p.tts, { slow: !!(p._tip && p._tip.slow) });
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'ask', item: item.id, mode });
    return true;
  }

  // the rig-frame pose from frame.js → world: origin at her feet, +Z her facing, +X her left
  _pose(phase, text) {
    const C = this.cur, a = this.match.local; if (!C || !a) return null;
    const W = innerWidth, H = innerHeight, aspect = W / H;
    const o = { phase, aspect, kbFrac: phase === 'type' ? this.keys.frac : 0 };
    if (phase === 'word') { const b = wordBox(text || C.text || 'word'); o.word = { w: b.w, h: b.h, y: C.targetY + 0.1 + this.shot.lift - a.pos.y }; }
    const f = frameFor(o);
    const sy = Math.sin(C.yaw), cy = Math.cos(C.yaw);
    const toW = (q) => new THREE.Vector3(a.pos.x + cy * q[0] + sy * q[2], a.pos.y + q[1], a.pos.z - sy * q[0] + cy * q[2]);
    return { pos: toW(f.pos), look: toW(f.look), fov: f.fov, fits: f.fits };
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
    const { r, first, again } = F._judgeRecord(g, item, p, text, { hinted: C.hinted });
    const v = verdictLines(r, item);
    if (r.pct != null && !r.ok) v.head = `差一点：${r.pct}%，是 ${r.canonical}`;
    C.verdict = { ok: r.ok, first, again, head: v.head, why: v.why, pct: r.pct ?? null };
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
    this.log.push({ t: +F.t.toFixed(2), ev: 'answer', item: item.id, ok: r.ok, pct: r.pct ?? null, first, hinted: C.hinted });
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
    if (this.host.resized) { C.pose = this._pose(C.answered ? 'word' : 'type', C.text); this.keys.layout(); }
  }

  clear() {
    this.cur = null;
    if (this.keys) this.keys.hide();
    if (this.shot) { this.shot.clear(); if (this.mounted) { this.shot.unmount(); this.mounted = false; } }
  }
  debug() {
    const C = this.cur;
    return C ? { item: C.item.id, mode: C.mode, phase: this.shot.phase, text: this.shot.text, answered: C.answered, hinted: C.hinted, verdict: C.verdict, kbUp: !!(this.keys && this.keys.visible), kbFrac: this.keys ? +this.keys.frac.toFixed(3) : null, pose: C.pose && { pos: C.pose.pos.toArray().map((v) => +v.toFixed(2)), fov: C.pose.fov, fits: C.pose.fits }, log: this.log.slice(-10) } : { idle: true, mounted: this.mounted, log: this.log.slice(-6) };
  }
  dispose() { this.clear(); this.shot?.dispose(); this.keys?.destroy(); this.shot = null; this.keys = null; }
}
