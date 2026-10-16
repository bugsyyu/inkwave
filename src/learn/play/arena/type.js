// 题即玩法 play-5 — 字弹 M4 in an arena (docs/PLAY.md §3 M4, §4, §5.3, §5.4; the type rig / keyboard / ink word are LEARN
// §19's, src/learn/play/type/ + src/ui/play-keys.js; the station follows play-wire's puzzle station, src/learn/play/
// wire/type.js, so the two unify on merge): a typed item (单词卡 · 听写句 · 写句) is the 打字蟹 wherever she stands —
//   the duel     a ring of her ink is laid under her feet and she gets a Bubble Guard (LEARN.arena.shield s, topped up
//                while she types, let go at 射): typing is never ambushed; the sheet lobs towards the zone and the ink
//                word forms on its floor
//   the boss     the sheet lobs at the hull — the armour plate (LEARN.arena.bossPlate socket) — and the word forms on it;
//                a near-miss sentence of the W phase is held for 「我的写法也对」 (the strip's actions; evidence S) — the
//                word stays grey until she decides (PLAY §1.3: no verdict before the evidence is written)
// Judging is only ever the form's _judgeRecord (the one path); nothing here sees an answer before 射.
//
//   const S = new ArenaType(host, { mode: 'zone' | 'boss', anchor(out), boss() })
//   S.ask(g, item, p) · S.update(dt) · S.gate(on) · S.pose · S.still · S.clear() · S.abort() · S.debug() · S.dispose()
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

const A = LEARN.arena;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export class ArenaType {
  constructor(host, opts = {}) {
    this.host = host; this.flow = host.flow; this.match = host.match;
    this.mode = opts.mode || 'zone'; this.anchorOf = opts.anchor || null; this.bossOf = opts.boss || null;
    this.shot = null; this.keys = null; this.cur = null; this.mounted = false;
    this.log = [];
  }
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

  // where the sheet goes: the zone's floor LEARN.arena.typeAhead m ahead of her towards the zone (her way when she is
  // in it), on ground near her level; the boss's armour plate (its socket, where it stands now)
  _target(a, out) {
    if (this.mode === 'boss') {
      const b = this.bossOf && this.bossOf();
      if (b && b.model) { b.model.getSocket(A.bossPlate, out); return { yaw: Math.atan2(out.x - a.pos.x, out.z - a.pos.z), y: out.y, dist: Math.hypot(out.x - a.pos.x, out.z - a.pos.z) }; }
    }
    let yaw = a.yaw;
    if (this.anchorOf) { this.anchorOf(_w); const d = Math.hypot(_w.x - a.pos.x, _w.z - a.pos.z); if (d > 2.5) yaw = Math.atan2(_w.x - a.pos.x, _w.z - a.pos.z); }
    let dist = A.typeAhead, y = a.pos.y;
    for (const d of [A.typeAhead, 4.4, 3.4]) {
      out.set(a.pos.x + Math.sin(yaw) * d, a.pos.y, a.pos.z + Math.cos(yaw) * d);
      const gy = G.level ? G.level.groundHeight(out.x, out.z, a.pos.y + 1.0) : -Infinity;
      const near = gy > -Infinity && Math.abs(gy - a.pos.y) < 0.9;
      const clear = !G.physics || !G.physics.los || G.physics.los(_w.set(a.pos.x, a.pos.y + 1.5, a.pos.z), _v.set(out.x, (near ? gy : a.pos.y) + 1.4, out.z));
      dist = d; y = near ? gy : a.pos.y;
      if (near && clear) break;
    }
    out.set(a.pos.x + Math.sin(yaw) * dist, y + 0.1, a.pos.z + Math.cos(yaw) * dist);
    return { yaw, y, dist };
  }

  // ---------------------------------------------------------------------------------------------- a question
  ask(g, item, p) {
    this._ensure();
    const a = this.match.local, H = this.host;
    const ref = String((item.meta && item.meta.ref) || item.en || '');
    const mode = p.type === 'write' || /\s/.test(ref) ? 'sentence' : 'word';
    const t = this._target(a, _v), yaw = t.yaw;
    if (!this.mounted) { a.yaw = a.aimYaw = yaw; this.shot.mount(a); this.mounted = true; }
    else if (Math.abs(((yaw - a.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI) > 0.4) { a.yaw = a.aimYaw = yaw; this.shot.rig.hullYaw = yaw; }
    this.shot.opts.groundY = this.mode === 'boss' ? _v.y - 0.1 : t.y;
    this.shot.begin({ mode, target: _v.clone() });
    this.keys.setMode(mode); this.keys.clear(); this.keys.setHintUsed(false); this.keys.show();
    this.cur = { g, item, p, mode, yaw, targetY: _v.y, dist: Math.min(FRAME.dist, t.dist), t: 0, answered: false, hinted: false, verdict: null, pose: null, text: '', held: null, shield: A.shield };
    this.cur.pose = this._pose('type');
    // her ink under her feet and a bubble round her: typing is never ambushed (PLAY §5.3)
    G.paint?.splat?.(_w.set(a.pos.x, a.pos.y + 0.05, a.pos.z), A.ring, 0, { kind: 'blast' });
    G.fx?.ring?.(_w.set(a.pos.x, a.pos.y + 0.15, a.pos.z), _up, G.teamColors[0], { radius: A.ring, life: 0.45 });
    if (G.specials && G.specials.giveShield) G.specials.giveShield(a, A.shield, false);
    H.strip?.show(p, { replay: () => H.say(p.tts, { slow: !!(p._tip && p._tip.slow) }) });
    H.strip?.fit(H.m1._topKeys());
    if (p.tts) H.say(p.tts, { slow: !!(p._tip && p._tip.slow) });
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'ask', item: item.id, mode, dist: +t.dist.toFixed(1), at: _v.toArray().map((v) => +v.toFixed(1)) });
    return true;
  }

  // the rig-frame pose from frame.js → world: origin at her feet, +Z her facing, +X her left (as wire/type.js)
  _pose(phase, text) {
    const C = this.cur, a = this.match.local; if (!C || !a) return null;
    const W = innerWidth, H = innerHeight, aspect = W / H;
    const o = { phase, aspect, kbFrac: phase === 'type' ? this.keys.frac : 0, dist: C.dist };
    if (phase === 'word') { const b = wordBox(text || C.text || 'word'); o.word = { w: b.w, h: b.h, y: C.targetY + this.shot.lift - a.pos.y }; }
    const f = frameFor(o);
    const sy = Math.sin(C.yaw), cy = Math.cos(C.yaw);
    const toW = (q) => new THREE.Vector3(a.pos.x + cy * q[0] + sy * q[2], a.pos.y + q[1], a.pos.z - sy * q[0] + cy * q[2]);
    return { pos: toW(f.pos), look: toW(f.look), fov: f.fov, fits: f.fits };
  }

  _hint() {
    const C = this.cur; if (!C || C.answered) return;
    this.shot.hint(); this.keys.setHintUsed(true); C.hinted = true;
    const p = C.p, h = p.hint || {};
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
    const out = F._judgeRecord(g, item, p, text, { hinted: C.hinted });
    if (out.held) {
      // 「我的写法也对」 (boss W, forms/common.js canClaim): nothing is written yet — the word stays grey, the strip offers
      // the claim and 继续; the evidence (S or W) is written when she decides, and the word plays that verdict
      C.held = out;
      this.host.strip?.verdict({ ok: false, head: '差一点 — 意思到了', why: (out.r && out.r.why) ? String(out.r.why).slice(0, 46) : '', actions: [
        { text: '我的写法也对', primary: true, onTap: () => this._decide(true) },
        { text: '继续', onTap: () => this._decide(false) },
      ] });
      this.log.push({ t: +F.t.toFixed(2), ev: 'held', item: item.id });
      return;
    }
    this._resolve(out);
  }
  _decide(claim) {
    const C = this.cur; if (!C || !C.held) return;
    const { g, item, p } = C, F = this.flow;
    const out = F._judgeRecord(g, item, p, C.text, { hinted: C.hinted, decided: true, claim: !!claim });
    C.held = null;
    this.log.push({ t: +F.t.toFixed(2), ev: 'decided', claim: !!claim, ok: out.r.ok });
    this._resolve(out);
  }
  _resolve(out) {
    const C = this.cur, { g, item, p } = C, F = this.flow, { r, first, again } = out, text = C.text;
    const v = verdictLines(r, item);
    if (r.pct != null && !r.ok) v.head = `差一点：${r.pct}%，是 ${r.canonical}`;
    if (out.self) v.head = '记下了 — 你的写法也对';
    C.verdict = { ok: r.ok, first, again, head: v.head, why: v.why, pct: r.pct ?? null, self: !!out.self };
    this.host.strip?.verdict(v);
    // the dictation: which of her words matched (the host's lcsOk; the judge's percent is the evidence)
    let typedOk;
    if (item.meta && item.meta.kind === 'dict') {
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
    const a = this.match.local;
    if (a && a.status && a.status.shield > 0.6) a.status.shield = 0.6;   // 打完就撤
    this.shot.resolve({ ok: r.ok, pct: r.pct, right: r.canonical, toks: r.toks, typedOk }).then(() => this._next(C));
  }
  _next(C) {
    if (this.cur !== C) return;
    const g = C.g; this.cur = null;
    this.flow._askNext(g);
  }
  // she fell while typing (a knockout in the zone): the question goes back to the front of the queue, nothing written
  abort() {
    const C = this.cur; if (!C) return;
    const { g, item } = C;
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'abort', item: item.id });
    this.clear();
    if (!C.answered) { g.queue.unshift(item); this.flow.asked = Math.max(0, this.flow.asked - 1); }
    this.flow.asking = null;
    this.flow._askNext(g);
  }

  // ---------------------------------------------------------------------------------------------- per frame
  gate(on) { if (this.keys) this.keys.enabled = !!on; }
  update(dt) {
    this.shot?.update(dt);
    const C = this.cur, a = this.match.local; if (!C || !a) return;
    C.t += dt;
    a.aimYaw = C.yaw; a.fireFacing = Math.max(a.fireFacing || 0, 0.3);
    // the bubble holds while she types (LEARN.arena.shield s at least), goes a moment after 射
    if (!C.answered && a.status && a.status.shield < 1.5 && G.specials && G.specials.giveShield) G.specials.giveShield(a, 1.5, false);
    if (this.host.resized) { C.pose = this._pose(C.answered ? 'word' : 'type', C.text); this.keys.layout(); }
  }

  clear() {
    this.cur = null;
    if (this.keys) this.keys.hide();
    if (this.shot) { this.shot.clear(); if (this.mounted) { this.shot.unmount(); this.mounted = false; } }
  }
  debug() {
    const C = this.cur;
    return C ? { item: C.item.id, mode: C.mode, phase: this.shot.phase, text: this.shot.text, answered: C.answered, hinted: C.hinted, held: !!C.held, verdict: C.verdict, kbUp: !!(this.keys && this.keys.visible), kbFrac: this.keys ? +this.keys.frac.toFixed(3) : null, shield: this.match.local && this.match.local.status ? +this.match.local.status.shield.toFixed(2) : null, pose: C.pose && { pos: C.pose.pos.toArray().map((v) => +v.toFixed(2)), fov: C.pose.fov, fits: C.pose.fits }, log: this.log.slice(-10) } : { idle: true, mounted: this.mounted, log: this.log.slice(-6) };
  }
  dispose() { this.clear(); this.shot?.dispose(); this.keys?.destroy(); this.shot = null; this.keys = null; }
}
