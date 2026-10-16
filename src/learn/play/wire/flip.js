// 题即玩法 play-wire — 翻牌靶 M8 in the puzzle (docs/PLAY.md §3 M8; the deck is LEARN §21's, src/learn/play/flip/): the
// review day's flash-flip gate. An ink card rises LEARN.flip.ahead m in front of her with the Chinese on it; a tap flips
// it (the word, its IPA, its sound); then 「认识」 / 「不熟」 float in beside it and a tap on one is her own rating — the
// card's 记得 (true) / 不记得 (false), judged and recorded by the flow's one path (flow._judgeRecord: flipJudge → F).
// 不熟 is no mistake: the flow re-queues the word typed (item._flipTyped) and the type station takes it next.
//
//   const S = new FlipStation(host)
//   S.fits(item, p)            a flip prompt (p._flip)
//   S.ask(g, item, p) · S.update(dt) · S.pose · S.still · S.tapApi · S.clear() · S.dispose() · S.debug()
import * as THREE from 'three';
import { G } from '../../../core/ctx.js';
import { LEARN } from '../../../config.js';
import { FlipDeck } from '../flip/deck.js';

const _v = new THREE.Vector3();

export class FlipStation {
  constructor(host) {
    this.host = host; this.flow = host.flow; this.match = host.match;
    this.deck = null; this.cur = null;
    this.log = [];
  }
  fits(item, p) { return !!(p && p._flip); }
  get still() { return !!this.cur; }
  get pose() { return this.cur ? this.cur.pose : null; }
  get tapApi() { return this.deck ? this.deck.tapApi : null; }

  _ensure() {
    if (this.deck) return;
    const color = G.teamColors[0] || new THREE.Color('#ff8a14');
    const D = (this.deck = new FlipDeck({ scene: G.scene, camera: G.camera, color, team: 0, reduced: this.host.reduced }));
    try { D.warm(G.renderer, G.camera, G.scene)?.catch?.(() => {}); } catch (e) { /* on first use */ }
    D.on.speak = (text) => this.host.say(text);
    D.on.rate = (ans) => this._rate(ans);
    D.on.typeIt = () => {};   // (the flow has already put the word back at the head of the queue, typed)
  }
  warm() { this._ensure(); }
  prepare(g) { this._ensure(); this.deck.prepare((g.queue || g.items || []).slice(0, 3)); }

  ask(g, item, p) {
    this._ensure();
    const a = this.match.local, H = this.host, D = this.deck;
    const yaw = H.facingYaw(g, a);
    _v.set(a.pos.x + Math.sin(yaw) * LEARN.flip.ahead, a.pos.y, a.pos.z + Math.cos(yaw) * LEARN.flip.ahead);
    const gy = G.level ? G.level.groundHeight(_v.x, _v.z, a.pos.y + 2.5) : -Infinity;
    if (gy > -Infinity && Math.abs(gy - a.pos.y) < 2.5) _v.y = gy;
    a.aimYaw = yaw; a.fireFacing = Math.max(a.fireFacing || 0, 0.5);
    D.prepare((g.queue || []).slice(0, 2));
    const aspect = innerWidth / innerHeight;
    D.ask({ item, at: _v.clone(), yaw: yaw + Math.PI, aspect });   // (the card's face turns to her)
    this.cur = { g, item, p, yaw, t: 0, answered: false, verdict: null, pose: this._pose(aspect) };
    H.strip?.show({ text: p.text, zh: '', tts: null }, {});
    H.strip?.fit(H.m1._topKeys());
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'ask', item: item.id });
    return true;
  }
  // the deck's own frame is a board's: straight on, level — and she stands between the lens and the card. So the same
  // distance, but the lens raised over her and tilted down (LEARN.flip.pitch): the card and both targets stay in the band,
  // her head drops under the card's lower edge on the screen
  _pose(aspect) {
    const D = this.deck, f = D.frame(aspect), c = D.at, p = LEARN.flip.pitch, lift = LEARN.flip.lift;
    const dx = f.pos.x - c.x, dz = f.pos.z - c.z, d = Math.hypot(dx, dz) * 1.12, fx = dx / (Math.hypot(dx, dz) || 1), fz = dz / (Math.hypot(dx, dz) || 1);
    const look = new THREE.Vector3(c.x, c.y + lift - 0.1, c.z);
    const pos = new THREE.Vector3(c.x + fx * d * Math.cos(p), c.y + lift + d * Math.sin(p), c.z + fz * d * Math.cos(p));
    return { pos, look, fov: f.fov, fits: f.fits };
  }
  _rate(ans) {
    const C = this.cur; if (!C || C.answered) return;
    C.answered = true;
    const { g, item, p } = C, F = this.flow;
    const { r, first, again } = F._judgeRecord(g, item, p, ans);
    C.verdict = { ans, ok: r.ok, first, again, head: r.text || (r.ok ? '记得！' : '没关系 — 马上打一遍'), why: '' };
    this.host.strip?.verdict({ ok: r.ok, head: C.verdict.head, why: '' });
    G.audio?.play?.(r.ok ? 'splat_big' : 'ui_toggle', { volume: 0.7 });
    this.log.push({ t: +F.t.toFixed(2), ev: 'rate', item: item.id, ans, first });
    this.deck.resolve({ ok: r.ok }).then(() => this._next(C));
  }
  _next(C) {
    if (this.cur !== C) return;
    const g = C.g; this.cur = null;
    this.flow._askNext(g);
  }

  update(dt) {
    const D = this.deck; if (!D || D.phase === 'off') return;
    D.update(dt);
    const C = this.cur, a = this.match.local;
    if (C && a) { a.aimYaw = C.yaw; a.fireFacing = Math.max(a.fireFacing || 0, 0.3); }
    if (C && this.host.resized) C.pose = this._pose(innerWidth / innerHeight);
  }
  clear() { this.cur = null; this.deck?.clear(); }
  debug() {
    const C = this.cur, D = this.deck;
    return C ? { item: C.item.id, phase: D.phase, answered: C.answered, verdict: C.verdict, targets: D.phase === 'back' || D.phase === 'rated' ? D.T.project(G.camera, innerWidth, innerHeight).map((q) => ({ i: q.i, cx: Math.round(q.cx), cy: Math.round(q.cy), r: Math.round(q.r) })) : [], card: D.phase === 'front' ? (() => { const r = D._cardRect(innerWidth, innerHeight); return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.w), h: Math.round(r.h) }; })() : null, log: this.log.slice(-10) } : { idle: true, log: this.log.slice(-6) };
  }
  dispose() { this.clear(); this.deck?.dispose(); this.deck = null; }
}
