// 题即玩法 play-wire — 节拍台 M3 in the puzzle (docs/PLAY.md §3 M3, §4; the stage is LEARN §21's, src/learn/play/beat/):
// 听辨对子 (2 pads) and 音标 (4 pads). The stage stands on the flattest stretch of route past the gate (the pads have no
// collision: a near-flat spot, host.stageSpot); she hops onto the home pad, the word plays on a bar line, she hops onto
// a pad on the next downbeat (tap the side of the screen / swipe / arrows); the pad she lands on is the answer —
// judged by the flow's one path (flow._judgeRecord, with rightAnswerOf for the stage's own order); a bar with nothing
// twice defers the item to the end of the gate, no evidence (on.defer). Timing only ever dances (PLAY §1 rule 4).
//
//   const S = new BeatStation(host)
//   S.fits(item, p)            a choice of 2 or 4 options on a pair / symbol item (the reshuffled retry too)
//   S.prepare(g)               the gate's label atlas, two gates ahead; S.free(g)
//   S.ask(g, item, p) · S.update(dt) · S.key(e) · S.pose · S.still · S.tapApi · S.clear() · S.dispose() · S.debug()
import * as THREE from 'three';
import { G } from '../../../core/ctx.js';
import { prompt } from '../../api.js';
import { rightAnswerOf } from '../../forms/common.js';
import { BeatStage } from '../beat/stage.js';
import { verdictLines } from '../m1.js';

const BEAT_KINDS = new Set(['pair', 'sym']);
const _v = new THREE.Vector3();

export function isBeatItem(item, p) {
  const m = (item && item.meta) || {};
  if (!p || p.type !== 'choice' || p._flip || p._alt) return false;
  if (m.input !== 'choice' || !BEAT_KINDS.has(m.kind)) return false;
  const n = (p.options || []).length;
  return n === 2 || n === 4;
}
export const padLabels = (p) => (p.options || []).map((o) => ({ en: String(o.text ?? o.en ?? ''), zh: o.zh && o.zh !== o.text ? String(o.zh) : '' }));

export class BeatStation {
  constructor(host) {
    this.host = host; this.flow = host.flow; this.match = host.match;
    this.beat = null; this.cur = null; this.open = null;   // open: { g, origin, yaw }
    this.log = [];
  }
  fits(item, p) { return isBeatItem(item, p); }
  get still() { return !!(this.cur || (this.beat && this.beat.phase !== 'off')); }
  get pose() { return this.beat && this.beat.phase !== 'off' ? this.beat.frame(innerWidth / innerHeight) : null; }
  get tapApi() { return this.beat ? this.beat.tapApi : null; }

  _ensure() {
    if (this.beat) return;
    const color = G.teamColors[0] || new THREE.Color('#ff8a14');
    const B = (this.beat = new BeatStage({ scene: G.scene, camera: G.camera, team: 0, color, reduced: this.host.reduced }));
    try { B.warm(G.renderer, G.camera, G.scene)?.catch?.(() => {}); } catch (e) { /* on first use */ }
    B.on.speak = (replay) => this._speak(replay);
    B.on.answer = (pad, info) => this._answer(pad, info);
    B.on.defer = () => this._defer();
    B.on.say = () => {};   // (the strip says it: verdictLines)
  }
  warm() { this._ensure(); }
  prepare(g) {
    this._ensure();
    const sets = (g.items || []).filter((it) => isBeatItem(it, prompt(it))).map((it) => padLabels(prompt(it)));
    if (sets.length) this.beat.prepare(g.id, sets);
  }
  free(g) { this.beat?.free(g.id); }

  // ---------------------------------------------------------------------------------------------- a question
  ask(g, item, p) {
    this._ensure();
    const a = this.match.local, H = this.host, B = this.beat, labels = padLabels(p), n = labels.length;
    const aspect = innerWidth / innerHeight;
    if (!this.open || this.open.g !== g || B.phase === 'off' || B.n !== n) {
      const spot = this.open && this.open.g === g ? this.open : H.stageSpot(g, n);
      this.open = { g, origin: spot.origin, yaw: spot.yaw };
      B.mount(a);
      B.open({ origin: spot.origin, yaw: spot.yaw, n, aspect, her: a.pos });
      a.yaw = a.aimYaw = spot.yaw;
    }
    this.cur = { g, item, p, labels, t: 0, answered: false, verdict: null };
    // the labels in the prompt's order (a reshuffled retry reuses the gate's atlas cells); the word on the next bar line
    const r = B.ask({ key: g.id, labels, now: G.time });
    H.strip?.show({ text: p.text, zh: p.zh || (n === 2 ? '听完，下一拍跳上去' : '下一拍跳上去'), tts: p.tts }, { replay: p.tts ? () => this._speak(1) : null });
    H.strip?.fit(H.m1._topKeys());
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'ask', item: item.id, n, W: +r.W.toFixed(2), D: +r.D.toFixed(2) });
    return true;
  }
  _speak(replay) {
    const C = this.cur; if (!C) return;
    const p = C.p, item = C.item;
    // a pair: the word (the 回炉 tip plays both, the other one after); a symbol: the sound has no recording — the pads say it
    if (!p.tts) return;
    const both = !!(p._tip && p._tip.speakBoth && item.meta && item.meta.pair);
    this.host.say(p.tts, { slow: !!(p._tip && p._tip.slow), onEnd: both ? () => { const other = item.meta.pair.filter((w) => w !== p.tts)[0]; if (other && this.cur === C) setTimeout(() => this.host.say(other), 350); } : null });
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'speak', replay });
  }
  _answer(pad, info) {
    const C = this.cur; if (!C || C.answered) return;
    C.answered = true;
    const { g, item, p } = C, F = this.flow;
    const { r, first, again } = F._judgeRecord(g, item, p, pad);
    const v = verdictLines(r, item);
    C.verdict = { pad, ok: r.ok, first, again, onBeat: !!info.onBeat, head: v.head, why: v.why };
    this.host.strip?.verdict(v);
    if (!r.ok) g._lockPopAt = G.time;
    this.log.push({ t: +F.t.toFixed(2), ev: 'answer', item: item.id, pad, ok: r.ok, first, onBeat: !!info.onBeat });
    this.beat.resolve({ ok: r.ok, right: rightAnswerOf(item, p), canonical: r.canonical }).then(() => this._next(C));
  }
  _defer() {
    const C = this.cur; if (!C) return;
    const { g, item } = C;
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'defer', item: item.id });
    this.cur = null;
    g.queue.push(item);   // (to the end of this gate, nothing written — PLAY §1 rule 4)
    this.host.strip?.verdict({ ok: false, head: '这题放到后面再来', why: '' });
    this.flow._askNext(g);
  }
  _next(C) {
    if (this.cur !== C) return;
    const g = C.g; this.cur = null;
    this.flow._askNext(g);
  }

  // ---------------------------------------------------------------------------------------------- per frame
  key(e) { return !!(this.beat && this.cur && this.beat.key(e)); }
  update(dt) {
    const B = this.beat; if (!B || B.phase === 'off') return;
    const a = this.match.local;
    B.update(dt, G.time);
    if (a) { B.carry(a); a.aimYaw = B.yaw; }
    if (this.host.resized) B.relayout(innerWidth / innerHeight);
  }
  clear() {
    this.cur = null;
    const B = this.beat, a = this.match.local, o = this.open;
    this.open = null;
    if (!B) return;
    B.close(); B.unmount();
    // the gate opened while she stood on an answer pad: the pads have no collision and a side pad can lie off the nav
    // grid (a railing, a planter); the home pad is a route node — she steps back onto it so the walk on has a path
    if (a && o && G.nav && B.at.pad !== 0 && G.nav.nearest(a.pos, 0.8, true) < 0) { a.pos.set(o.origin.x, o.origin.y + 0.05, o.origin.z); a.vel?.set(0, 0, 0); this.log.push({ t: +this.flow.t.toFixed(2), ev: 'home' }); }
  }
  debug() {
    const C = this.cur, B = this.beat;
    return B && B.phase !== 'off' ? { item: C && C.item.id, n: B.n, state: B.state(), answered: !!(C && C.answered), verdict: C && C.verdict, pads: B.projectPads().map((o) => ({ x: Math.round(o.x), y: Math.round(o.y) })), origin: B.origin.toArray().map((v) => +v.toFixed(2)), log: this.log.slice(-10) } : { idle: true, log: this.log.slice(-6) };
  }
  dispose() { this.clear(); this.beat?.dispose(); this.beat = null; }
}
