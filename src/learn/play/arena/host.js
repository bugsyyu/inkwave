// 题即玩法 play-5 — the arena's play host (docs/PLAY.md §5.3 对抗赛 / 今日小考, §5.4 Boss; LEARN §24): DuelFlow and BossFlow
// (src/learn/forms/) own one of these (versus2 too), the way the puzzle owns play-wire's PlayHost — the same shape
// (canAsk / ask / update / gateOpened / dispose), the same pieces: the strip (PlayRun's PlayStrip), the voice
// (hud-learn's recordings / device voice), the lens (play-wire's cam.js: a station's pose is sprung to; M1 keeps the
// follow camera and only eases it towards the zone / the boss), standing still while a station needs her (her intents
// zeroed after the controller wrote them — never match.paused, never learn.hold). It routes every question to:
//   M1 墨靶 / M5 弱点   every plain choice (单词选义 / 语法 · 发音小测 / 阅读题 / 音标 / 听辨对子, the typed card's 回炉 choice) → ArenaRun
//   M4 字弹            单词卡 · 听写句 · 写句 → ArenaType (the duel's shield ring; the boss's armour plate)
//   M7 回声亭          the boss's S phase (askEcho) → EchoBooth on the deck in front of her
//   M8 翻牌靶          a review day's flash-flip cards in a duel (play-8) → play-wire's FlipStation, through this host
//   M6 展板            the duel's 备战 between rounds (showPrep, play-8) → PrepStation (prep.js): no pause, no card
// Judging is only ever the form's _judgeRecord (every station hands it an index, a string or her rating).
import * as THREE from 'three';
import { G } from '../../../core/ctx.js';
import { LEARN } from '../../../config.js';
import { ArenaRun } from './run.js';
import { ArenaType } from './type.js';
import { arenaKind } from './m1.js';
import { PlayCam } from '../cam.js';
import { EchoBooth } from '../echo/booth.js';
import { FlipStation } from '../wire/flip.js';
import { PrepStation } from './prep.js';
import { isFlipGate } from '../../forms/common.js';
import { hudBand } from '../landscape.js';

const A = LEARN.arena;
const _v = new THREE.Vector3();

// the boss's S phase: the booth rises in front of her; stepping onto its pad plays the sample, stepping off is 说完了 — the
// form's hit on the boss (unscored, nothing written: PLAY §3 M7)
class EchoStation {
  constructor(host) { this.host = host; this.flow = host.flow; this.match = host.match; this.echo = null; this.cur = null; this.log = []; }
  get still() { return false; }
  get pose() { return this.cur && this.echo ? this.echo.framing : null; }
  get tapApi() { return this.cur && this.echo && this.echo.walk.framed >= 0 ? this.echo.tapApi : null; }
  _ensure() {
    if (this.echo) return;
    const hex = G.teamHex?.[0] || '#ff8a14', root = (G.hud && G.hud.root) || document.body;
    this.echo = new EchoBooth({ scene: G.scene, camera: G.camera, color: hex, reduced: this.host.reduced, root });
    this.echo.walk.bandFor = hudBand;   // (play-7: the board framed under the boss's HP bar and the clock, not behind them)
    try { this.echo.warm(G.renderer, G.camera, G.scene)?.catch?.(() => {}); } catch (e) { /* on first use */ }
    this.echo.on.speak = (text, o) => this.host.say(text, { slow: !!(o && o.slow), onEnd: o && o.onEnd });
    this.echo.on.done = (d) => { const C = this.cur; if (!C) return; this.log.push({ t: +this.flow.t.toFixed(2), ev: 'spoke', how: d.how }); this.host.strip?.show({ text: '说完了 — 很好', zh: '口语不计分；评分在经典页', tts: null }, {}); this.flow._echoDone?.(C.g, C.item, d); };
    this.echo.on.classic = () => { this.flow._emit('learn:classic', { kind: 'speak', id: this.cur && this.cur.item.id }); G.game?.menus?.toast?.('口语评分在经典页（课本）'); };
  }
  warm() { this._ensure(); }
  ask(g, item) {
    this._ensure();
    const a = this.match.local, nav = G.nav;
    // the pad LEARN.arena.echoAhead m ahead of her, on a walkable node (the deck), facing her
    const yaw = a.yaw;
    _v.set(a.pos.x + Math.sin(yaw) * A.echoAhead, a.pos.y + 1, a.pos.z + Math.cos(yaw) * A.echoAhead);
    const k = nav ? nav.nearest(_v, 3, true) : -1, n = k >= 0 ? nav.nodes[k] : { x: _v.x, y: a.pos.y, z: _v.z };
    const at = new THREE.Vector3(n.x, n.y, n.z);
    this.echo.open({ key: g.id + ':' + item.id, item, at, yaw: Math.atan2(at.x - a.pos.x, at.z - a.pos.z) });
    this.cur = { g, item, at };
    // (no strip while the booth is up — its board carries the question and the 范例, as the puzzle's exit booth does: a
    // strip over it covered the board's first lines on a landscape phone)
    this.host.strip?.hide();
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'ask', item: item.id, at: at.toArray().map((v) => +v.toFixed(1)) });
    return true;
  }
  update(dt) {
    if (!this.cur || !this.echo) return;
    const a = this.match.local;
    this.echo.update(dt, G.time, a ? a.pos : null, { aspect: innerWidth / innerHeight, speed: a ? Math.hypot(a.vel?.x || 0, a.vel?.z || 0) : 0 });
  }
  clear() { this.cur = null; this.echo?.close(); }
  debug() { return this.cur ? { item: this.cur.item.id, state: this.echo.state, framed: this.echo.walk.framed, at: this.cur.at.toArray().map((v) => +v.toFixed(1)), log: this.log.slice(-6) } : { idle: true, log: this.log.slice(-4) }; }
  dispose() { this.clear(); this.echo?.dispose(); this.echo = null; }
}

export class ArenaHost {
  // opts: { mode: 'zone' | 'boss', anchor(out) → Vector3 (the zone's centre), boss() → the Boss, team (play-6: her side,
  //         default 0 — versus2's guest is on team 1: the objects' ink, the rig, the ring and the ink word are hers) }
  constructor(flow, opts = {}) {
    this.flow = flow; this.match = flow.match; this.hud = flow.hud; this.mode = opts.mode || 'zone';
    this.m1 = new ArenaRun(flow, opts);
    this.strip = this.m1.strip; this.reduced = this.m1.reduced;
    this.cam = new PlayCam({ reduced: this.reduced });
    this.type = new ArenaType(this, opts);
    this.echo = this.mode === 'boss' ? new EchoStation(this) : null;
    this.flip = new FlipStation(this);   // (built on first use: only a review day asks flip cards)
    this.prepS = new PrepStation(this);
    this.stations = { type: this.type, echo: this.echo, flip: this.flip, prep: this.prepS };
    this._anchor = opts.anchor || (opts.boss ? (out) => { const b = opts.boss(); return b ? out.copy(b.pos) : null; } : null);
    this.kind = null; this.cur = null; this.resized = false; this.log = [];
    this._onResize = () => { this._resizedAt = true; };
    if (typeof window !== 'undefined') { window.addEventListener('resize', this._onResize); window.addEventListener('orientationchange', this._onResize); }
    this._warmT = 0.05;   // (the stations build on the level's first frames: their programs compile under the match fade)
  }

  // ---------------------------------------------------------------------------------------------- which mechanic
  kindOf(item, p) { return arenaKind(item, p); }
  canAsk(g, item, p) { return this.kindOf(item, p) !== null; }

  ask(g, item, p) {
    const kind = this.kindOf(item, p); if (!kind) return false;
    const F = this.flow;
    if (kind !== this.kind) this._clearStation();
    this.kind = kind; this.cur = { g, item, p };
    if (kind === 'm1') { this.cam.release(G.rig, this.match.local); this.m1.ask(g, item, p); }
    else {
      F.hud?.hide?.(); F.hud?.playMode?.(true);
      this.cam.take(G.rig, G.camera);
      const S = this.stations[kind];
      S.ask(g, item, p);
      G.playTargets = null; G.playTap = S.tapApi || null;
    }
    if (F.asking) F.asking.play = kind === 'm1' ? (this.mode === 'boss' ? 'weak-point' : 'ink-target') : kind === 'flip' ? 'flip-target' : 'type-shot';
    this.log.push({ t: +F.t.toFixed(2), ev: 'ask', kind, item: item.id });
    return true;
  }
  // the boss's S phase (no prompt: the item is a speak step's)
  askEcho(g, item) {
    if (!this.echo) return false;
    this._clearStation();
    this.kind = 'echo'; this.cur = { g, item, p: null };
    this.flow.hud?.hide?.(); this.flow.hud?.playMode?.(true);
    this.echo.ask(g, item);
    G.playTargets = null; G.playTap = null;
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'ask', kind: 'echo', item: item.id });
    return true;
  }
  _clearStation() {
    if (this.kind === 'm1') this.m1._clear();
    else if (this.kind && this.stations[this.kind]) this.stations[this.kind].clear();
    if (G.playTap && this.kind && this.kind !== 'm1') G.playTap = null;
  }
  // the duel's 备战 between rounds (play-8): the step's boards one at a time in front of her, the strip's 「开始这一轮」 — or
  // walking on — calls o.onGo(how); the match runs on (the form holds the clock and the zone, the bots stand)
  showPrep(specs, o = {}) {
    this._clearStation();
    this.kind = 'prep'; this.cur = null;
    this.flow.hud?.hide?.(); this.flow.hud?.playMode?.(true);
    G.playTargets = null; G.playTap = null;
    this.prepS.show(specs, { ...o, onGo: (how) => { if (this.kind === 'prep') { this.kind = null; this.cam.release(G.rig, this.match.local); } o.onGo?.(how); } });
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'prep', boards: (specs || []).length });
    return true;
  }
  // the station has handed its answer on and the form is going on: the lens back to her (a type question keeps the rig
  // mounted until another kind comes — the next typed item types again at once)
  clear() { this._clearStation(); this.kind = null; this.cur = null; this.cam.release(G.rig, this.match.local); this.flow.hud?.playMode?.(false); }
  prep(g) { this.m1.prep(g); if (isFlipGate(g)) this.flip.prepare(g); }
  // which way she faces for a station that rises in front of her (a flip card, a 备战 board): towards the zone / the boss
  facingYaw(g, a) {
    const c = this._anchor ? this._anchor(_v) : null;
    return c && Math.hypot(c.x - a.pos.x, c.z - a.pos.z) > 1.5 ? Math.atan2(c.x - a.pos.x, c.z - a.pos.z) : a.yaw;
  }
  // play-6 (versus2): the question closed before she answered — the live station shows v ({ head, why }) and hands on to
  // the form's _askNext after ms; false when nothing was live (the form then goes on itself)
  expire(v, ms) {
    if (this.kind === 'm1') return this.m1.expire(v, ms);
    if (this.kind === 'type') return this.type.expire(v, ms);
    return false;
  }
  gateOpened(g) { this._clearStation(); this.kind = null; this.cur = null; this.m1.gateOpened(g); this.cam.release(G.rig, this.match.local); }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    const m = this.match, a = m.local;
    if (this._resizedAt) { this._resizedAt = false; this.resized = true; }
    const menuUp = !!(m.paused || (G.menus && G.menus.current));
    this.type.gate(!menuUp);
    if (this._warmT > 0) { this._warmT -= dt; if (this._warmT <= 0) { try { this.type.warm(); this.echo?.warm(); } catch (e) { console.warn('[arena] warm', e); } } }
    this.m1.update(dt);
    // play-7: the duel's objects up → the HUD's name tags over the bots step aside (hud.js markerYield; LEARN §24 已知坑 3);
    // the same while the 打字蟹 is up (duel or boss: a tag sat on the typewriter) and while the boss's 回声亭 board is
    // framed (the squad's tags sat on its buttons on a landscape phone)
    const tags = (this.mode === 'zone' && this.kind === 'm1' && !!(this.m1.cur && this.m1.cur.placed && !this.m1.cur.answered))
      || (this.kind === 'type' && !!this.type.cur) || (this.kind === 'echo' && !!(this.echo && this.echo.cur && this.echo.echo && this.echo.echo.walk.framed >= 0))
      // (play-8: and while a flip card or a 备战 board stands in front of her — the bots' tags sat on them too)
      || (this.kind === 'flip' && !!this.flip.cur) || (this.kind === 'prep' && !!this.prepS.cur);
    this.stationUp = tags;   // (the forms' prop bag steps aside to the same: forms/ui.js aside — LEARN §30)
    if (tags !== !!this._tagsYield) { this._tagsYield = tags; G.hud?.markerYield?.(tags); }
    // (play-8: no crosshair while a flip card or a 备战 board stands in front of her — nothing is aimed there, it sat on the
    // board's text; the typing station hides it itself, the objects keep it)
    const xhOff = (this.kind === 'flip' && !!this.flip.cur) || (this.kind === 'prep' && !!this.prepS.cur);
    if (xhOff !== !!this._xhOff) { this._xhOff = xhOff; const x = G.hud && G.hud.xh; if (x && x.style) x.style.visibility = xhOff ? 'hidden' : ''; }
    if (m.paused) { this.resized = false; return; }
    this.type.update(dt); this.echo?.update(dt); this.flip.update(dt); this.prepS.update(dt);
    const S = this.kind && this.kind !== 'm1' ? this.stations[this.kind] : null;
    // she fell while typing: the question comes back later, nothing written
    if (S === this.type && a && !a.alive && this.type.cur) { this.type.abort(); this.kind = null; this.cur = null; this.cam.release(G.rig, a); this.resized = false; return; }
    // standing still while a station needs her: her intents, after the controller wrote them, before she moves
    if (a && S && S.still) { const it = a.intent; it.move.set(0, 0, 0); it.jump = it.fire = it.squid = it.sub = it.special = false; }
    if (S && (S === this.echo || S === this.flip || S === this.prepS)) G.playTap = S.tapApi;
    const pose = S ? S.pose : null;
    if (pose) { this.cam.take(G.rig, G.camera); this.cam.to(pose); }
    else if (this.cam.on && (this.kind === 'm1' || !S)) this.cam.release(G.rig, a);
    this.cam.update(dt, G.rig, G.camera);
    this.resized = false;
  }

  // the voice: the course's recording or the device's (hud-learn's _speak), the strip's ▶ lit while it plays
  say(text, o = {}) {
    if (!text) { o.onEnd?.(); return; }
    const H = this.hud; if (!H || !H._speak) { o.onEnd?.(); return; }
    this.strip?.playing(true);
    H._speak(text, () => { this.strip?.playing(false); o.onEnd?.(); }, { slow: !!o.slow });
  }

  debug() {
    const S = this.kind && this.kind !== 'm1' ? this.stations[this.kind] : null;
    return { mode: this.mode, mechanic: this.kind, item: this.cur && this.cur.item.id, cam: { on: this.cam.on, want: !!this.cam.want, fov: +this.cam.fov.toFixed(1), rigMode: G.rig && G.rig.mode }, still: !!(S && S.still), m1: this.m1.debug(), station: S ? S.debug() : null, log: this.log.slice(-12) };
  }
  dispose() {
    if (this._tagsYield) { this._tagsYield = false; G.hud?.markerYield?.(false); }
    if (this._xhOff) { this._xhOff = false; const x = G.hud && G.hud.xh; if (x && x.style) x.style.visibility = ''; }
    if (typeof window !== 'undefined') { window.removeEventListener('resize', this._onResize); window.removeEventListener('orientationchange', this._onResize); }
    this._clearStation();
    this.cam.release(G.rig, this.match.local);
    this.type.dispose(); this.echo?.dispose(); this.flip.dispose(); this.prepS.dispose();
    this.m1.dispose();
  }
}
