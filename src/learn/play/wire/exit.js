// 题即玩法 play-wire — the exit area (docs/PLAY.md §3 M7 / 路标, §4; the booth and the signs are LEARN §21's,
// src/learn/play/echo/booth.js, board/signs.js): after the last gate opens the day ends on the signs that stood here as
// placeholders since B — the 回声亭 (口语: she steps onto its pad, the sample plays, she speaks along, steps off), the
// 打卡垫 (踩上去 = 这一天走完了: the local star table, never evidence) and, on the review day, the 周报牌 / 入门小测牌
// (their classic page). The write wall is not here: its sentences are a gate of their own (M4, flow._place).
// Nothing here is judged or recorded.
//
//   const S = new ExitStation(host)
//   S.start(end, back) → bool     the stations rise round the route's end (end: the last node; back: a node a few m
//                                 before it, for the facing); false when the day has none to stand on (the results come
//                                 as before)
//   S.update(dt) · S.pose · S.tapApi · S.nextSpot() (the auto-walk's next stop) · S.done · S.clear() · S.debug()
import * as THREE from 'three';
import { G } from '../../../core/ctx.js';
import { LEARN } from '../../../config.js';
import { EchoBooth } from '../echo/booth.js';
import { Signs } from '../board/signs.js';

const _v = new THREE.Vector3();

export class ExitStation {
  constructor(host) {
    this.host = host; this.flow = host.flow; this.match = host.match;
    this.echo = null; this.signs = null; this.on = false; this.spots = []; this.log = [];
    this.echoAt = null; this.padAt = null; this.checked = false; this.spoke = false;
  }
  get still() { return false; }
  get pose() { return (this.echo && this.echo.framing) || (this.signs && this.signs.framing) || null; }
  get tapApi() { return (this.echo && this.echo.walk.framed >= 0 && this.echo.tapApi) || (this.signs && this.signs.walk.framed >= 0 && this.signs.tapApi) || null; }
  get done() { return this.on && (this.padAt ? this.checked : (!this.echoAt || this.spoke)); }

  start(end, back) {
    const F = this.flow, signs = F.level.signs || [], nav = G.nav;
    if (!signs.length || !end) return false;
    const speak = signs.find((s) => s.design && s.design.mechanic === 'echo-booth'), item = speak && speak.items[0];
    const boards = signs.filter((s) => s.design && ['checkin-pad', 'weekly-sign', 'placement-sign'].includes(s.design.mechanic));
    if (!item && !boards.length) return false;
    // along the way in, at the end: the booth on the left, the signs on the right, each on a nav node
    let fx = end.x - back.x, fz = end.z - back.z; const fl = Math.hypot(fx, fz) || 1; fx /= fl; fz /= fl;
    const sx = -fz, sz = fx;
    const spot = (lat, ahead) => { _v.set(end.x + sx * lat + fx * ahead, end.y + 1, end.z + sz * lat + fz * ahead); const k = nav ? nav.nearest(_v, 2.5, true) : -1; const n = k >= 0 ? nav.nodes[k] : end; return { x: n.x, y: n.y, z: n.z, node: k }; };
    const hex = G.teamHex?.[0] || '#ff8a14', root = (G.hud && G.hud.root) || document.body;
    this.spots = [];
    if (item) {
      this.echo = new EchoBooth({ scene: G.scene, camera: G.camera, color: hex, reduced: this.host.reduced, root });
      try { this.echo.warm(G.renderer, G.camera, G.scene)?.catch?.(() => {}); } catch (e) { /* on first use */ }
      this.echo.on.speak = (text, o) => this.host.say(text, { slow: !!(o && o.slow), onEnd: o && o.onEnd });
      this.echo.on.done = (d) => { this.spoke = true; this.log.push({ t: +F.t.toFixed(2), ev: 'spoke', how: d.how }); this.host.strip?.show({ text: '说完了 — 很好', zh: '口语不计分；评分在经典页', tts: null }, {}); F._emit('learn:sign', { id: speak.id, kind: 'echo', how: d.how }); };
      this.echo.on.classic = () => this._classic('speak', speak);
      const at = spot(boards.length ? -2.4 : 0, -3.2);
      this.echoAt = at;
      this.echo.open({ key: speak.id, item, at: new THREE.Vector3(at.x, at.y, at.z), yaw: Math.atan2(fx, fz) });
      this.spots.push({ ...at, kind: 'echo', title: '回声亭' });
    }
    if (boards.length) {
      this.signs = new Signs({ scene: G.scene, camera: G.camera, color: hex, reduced: this.host.reduced, root });
      try { this.signs.warm(G.renderer, G.camera, G.scene)?.catch?.(() => {}); } catch (e) { /* on first use */ }
      this.signs.on.speak = (text, o) => this.host.say(text, { slow: !!(o && o.slow), onEnd: o && o.onEnd });
      this.signs.on.classic = (sg) => this._classic(sg.kind, sg);
      this.signs.on.checkin = (sg) => this._checkin(sg);
      const list = boards.map((s) => ({ id: s.id, kind: s.design.mechanic === 'checkin-pad' ? 'checkin' : s.design.mechanic === 'weekly-sign' ? 'weekly' : 'placement', title: s.title, text: s.items[0] && s.items[0].zh }));
      this.signs.prepare('exit', list);
      const yaw = Math.atan2(-fx, -fz);   // the boards face back along the route, towards her
      const places = list.map((s, i) => { const lat = (item ? 1.6 : 0) + (i - (list.length - 1) / 2) * 2.6; const b = spot(lat, -1.2); return { x: b.x + fx * 1.0, y: b.y, z: b.z + fz * 1.0, yaw, view: { x: b.x - fx * (LEARN.board.view - 1.0), y: b.y, z: b.z - fz * (LEARN.board.view - 1.0) } }; });
      this.signs.place('exit', places);
      list.forEach((s, i) => { const v = places[i].view; const k = nav ? nav.nearest(_v.set(v.x, v.y + 1, v.z), 2.5, true) : -1; this.spots.push({ x: v.x, y: v.y, z: v.z, node: k, kind: s.kind, title: s.kind === 'checkin' ? '打卡垫' : s.kind === 'weekly' ? '周报牌' : '入门小测牌' }); if (s.kind === 'checkin') this.padAt = { x: v.x, y: v.y, z: v.z }; });
    }
    this.on = true;
    this.log.push({ t: +F.t.toFixed(2), ev: 'exit', spots: this.spots.map((s) => s.kind) });
    return true;
  }
  _checkin(sg) {
    this.checked = true;
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'checkin' });
    this.host.strip?.show({ text: '这一天走完了 ★', zh: sg && sg.title ? sg.title : '', tts: null }, {});
    this.flow._emit('learn:sign', { id: sg && sg.id, kind: 'checkin' });
  }
  _classic(kind, sg) {
    // the classic page is the host App's (LEVELS §1.3): the game only says so and tells the page
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'classic', kind });
    this.flow._emit('learn:classic', { kind, id: sg && sg.id });
    G.game?.menus?.toast?.(kind === 'speak' ? '口语评分在经典页（课本）' : kind === 'weekly' ? '周报在经典页（课本）' : '入门小测在经典页（课本）');
  }
  // the auto-walk's next stop: the booth (until she has spoken), then the check-in pad; the other signs are optional
  nextSpot() {
    if (!this.on) return null;
    const a = this.match.local;
    for (const s of this.spots) {
      if (s.kind === 'echo' && this.spoke) continue;
      if (s.kind === 'checkin' && this.checked) continue;
      if (s.kind !== 'echo' && s.kind !== 'checkin') continue;
      if (a && Math.hypot(a.pos.x - s.x, a.pos.z - s.z) < 0.9) continue;
      return s;
    }
    return null;
  }
  update(dt) {
    if (!this.on) return;
    const a = this.match.local, t = G.time, o = { aspect: innerWidth / innerHeight, speed: a ? Math.hypot(a.vel?.x || 0, a.vel?.z || 0) : 0 };
    this.echo?.update(dt, t, a ? a.pos : null, o);
    this.signs?.update(dt, t, a ? a.pos : null, o);
  }
  debug() { return this.on ? { spots: this.spots.map((s) => ({ kind: s.kind, x: +s.x.toFixed(1), z: +s.z.toFixed(1) })), echo: this.echo ? { state: this.echo.state, framed: this.echo.walk.framed } : null, signs: this.signs ? { framed: this.signs.walk.framed, checked: this.signs.checked } : null, spoke: this.spoke, checked: this.checked, done: this.done, log: this.log.slice(-8) } : { idle: true }; }
  clear() { this.echo?.close(); this.signs?.clear(); this.on = false; }
  dispose() { this.clear(); this.echo?.dispose(); this.signs?.dispose(); this.echo = null; this.signs = null; }
}
