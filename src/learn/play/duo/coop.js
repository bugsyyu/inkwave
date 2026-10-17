// 题即玩法 play-6 — the play host of 双人成形合作赛 coop2 (docs/PLAY.md §5.5, LEARN §25): one player hears / reads the question,
// the other answers it with a game action — and only that one has anything to answer with. Coop2Flow (forms/coop2.js)
// owns one of these, with the puzzle host's contract (canAsk / ask / update / gateOpened / dispose) and
// its pieces, on both screens of the room:
//   the answering side   (splitPrompt's 'hands' view: the form, no recording, no stem, no Chinese)
//                        every choice → ink targets floating past the gate (play-5's ArenaRun: any choice kind — the 听辨 /
//                        音标 ones too, which the puzzle plays on the beat pads, whose word plays on the bar line and this
//                        side must hear nothing — and a reworded question's own small atlas); anything typed → the 打字蟹
//                        (play-wire's TypeStation, src/learn/play/wire/type.js, through its host contract)
//   the clue side        ('clue' view: the stem, its Chinese, ▶) a board rises in front of her (M6 BoardWalk, src/learn/
//                        play/board/: the stem, the Chinese, what to do, 「再听」 — no options, no input: duo.js clueSpec)
//                        and the recording plays; where no board fits (a wall, a drop), the strip carries it instead
// The verdict is shown on both at once: the answering side's objects / ink word play it; the clue side's strip says
// 「队友答对了」 / 「差一点」 (the right answer only once it will not come back to her: a missed item is re-asked to the
// OTHER hands — hers). Judging is only ever the flow's _judgeRecord, on the answering side; nothing is held, paused or
// shown as a card; she stands on her pad as she likes (a station that types keeps her still, as the puzzle's does).
//
//   const P = new CoopPlay(flow)
//   P.canAsk(g, item, view) · P.ask(g, item, view)        the answering side
//   P.clue(g, item, view, { partner, alt })               the clue side · P.clueVerdict({ ok, head, why }, ms)
//   P.prep(g) (the gate's label atlas) · P.prepClue(item, partner, alt) (a clue board painted ahead)
//   P.clear() · P.gateOpened(g) · P.update(dt) · P.say(text, o) · P.facingYaw(g, a) · P.debug() · P.dispose()
import * as THREE from 'three';
import { G } from '../../../core/ctx.js';
import { LEARN } from '../../../config.js';
import { prompt } from '../../api.js';
import { ArenaRun } from '../arena/run.js';
import { TypeStation } from '../wire/type.js';
import { PlayCam } from '../cam.js';
import { BoardWalk } from '../board/walk.js';
import { frontSpot, FRONT_W_UPRIGHT } from '../board/front.js';
import { frameFor, FRAME } from '../type/frame.js';
import { duoMechanic, clueSpec, splitPrompt } from '../../forms/duo.js';

const BD = LEARN.board;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3();

export class CoopPlay {
  constructor(flow) {
    this.flow = flow; this.match = flow.match; this.hud = flow.hud;
    // (the ink targets float a few metres past the gate, over the route — the cluster faces whoever answers)
    this.m1 = new ArenaRun(flow, { mode: 'zone', anchor: (out) => this._anchor(out), edges: true, settle: true });
    this.strip = this.m1.strip; this.reduced = this.m1.reduced;
    this.cam = new PlayCam({ reduced: this.reduced });
    this.type = new TypeStation(this);
    this.board = null;          // the clue side's BoardWalk (built with the stations, on the level's first frames)
    this.clueOn = null;         // { key, item, spot, strip } while she holds the clue
    this.painted = new Set();   // clue boards painted (ahead or now), freed when used or when the gate opens
    this.kind = null; this.cur = null; this.resized = false; this.log = [];
    this._onResize = () => { this._resizedAt = true; };
    if (typeof window !== 'undefined') { window.addEventListener('resize', this._onResize); window.addEventListener('orientationchange', this._onResize); }
    this._warmT = 0.05;   // (the rig and the board set compile under the match fade, not mid-question)
  }

  // ---------------------------------------------------------------------------------------------- which mechanic
  kindOf(item, view) { return duoMechanic(view); }
  canAsk(g, item, view) { return this.kindOf(item, view) !== null; }

  // the answering side: the objects (ink targets) or the 打字蟹 — the view has no recording, no stem, no Chinese
  ask(g, item, view) {
    const kind = this.kindOf(item, view); if (!kind) return false;
    const F = this.flow;
    this._clearClue();
    if (kind !== this.kind) this._clearStation();
    this.kind = kind; this.cur = { g, item, p: view };
    if (kind === 'm1') { this.cam.release(G.rig, this.match.local); this.m1.ask(g, item, view); }
    else {
      F.hud?.hide?.(); F.hud?.playMode?.(true);   // (in this order: hud-learn's hide() puts the walk bar back)
      this.cam.take(G.rig, G.camera);
      this.type.ask(g, item, view);
      // (提示 would put the item's Chinese on this side — the clue's half: here it only says where the help is)
      const K = this.type.keys;
      if (K) { K.setHintUsed(true); K.onHint = () => F.ui?.say?.('提示在队友那边：听队友说'); }
      G.playTargets = null; G.playTap = null;
    }
    if (F.asking) F.asking.play = kind === 'm1' ? 'ink-target' : 'type-shot';
    this.log.push({ t: +F.t.toFixed(2), ev: 'ask', kind, item: item.id });
    return true;
  }

  // the clue side: a board in front of her with the stem, its Chinese and 「再听」 (the recording plays as it comes up)
  clue(g, item, view, o = {}) {
    const F = this.flow;
    this._clearStation(); this._clearClue();
    this.kind = 'clue'; this.cur = { g, item, p: view };
    F.hud?.hide?.(); F.hud?.playMode?.(true);
    G.playTargets = null; G.playTap = null;
    // (upright, a narrower board: the framing camera stands where the board's width fills the screen's — 2.3 m wide
    // puts it ~4 m behind her, into the gazebo / the wall behind the pad; the text on the screen is the same size)
    const bw = innerWidth < innerHeight ? FRONT_W_UPRIGHT : BD.w;
    const key = this._clueKey(item, o.alt), spec = clueSpec(view, o.partner), spot = this._clueSpot(g, spec, bw);
    const B = this._board();
    if (spot && B) {
      if (!B.entries.has(key)) B.prepare(key, [spec]);
      this.painted.add(key);
      B.place(key, [spot], { w: bw });
      this.strip?.hide();
      this.clueOn = { key, item, spot, strip: false };
    } else {
      // (no room for a board: the strip carries the clue — the stem, its Chinese, ▶ — and nothing to answer with)
      this.strip?.show({ text: view.text, zh: [view.zh, view.hint].filter(Boolean).join('　'), tts: view.tts }, { replay: () => this.say(view.tts) });
      this.strip?.fit(this.m1._topKeys());
      this.clueOn = { key: null, item, spot: null, strip: true };
    }
    if (view.tts) this.say(view.tts);
    this.log.push({ t: +F.t.toFixed(2), ev: 'clue', item: item.id, board: !!(spot && B), at: spot ? [spot.x, spot.y, spot.z].map((v) => +v.toFixed(1)) : null });
    return true;
  }
  // a clue board painted ahead (the flow knows who holds the next clue): drawn in the verdict's pause, not as it comes
  prepClue(item, partner, alt = false) {
    const B = this._board(), key = this._clueKey(item, alt);
    if (!B || !item || B.entries.has(key) || alt) return;
    let view = null; try { view = splitPrompt(prompt(item), 'clue'); } catch (e) { view = null; }
    if (!view) return;
    B.prepare(key, [clueSpec(view, partner)]); this.painted.add(key);
  }
  _clueKey(item, alt) { return 'clue:' + item.id + (alt ? ':alt' : ''); }
  // the verdict on the clue side (the answering side's station plays its own): the board goes, the strip says it
  clueVerdict(v, ms = LEARN.ui.verdictMs) {
    if (this.kind !== 'clue') return false;
    this._clearClue();
    this.kind = null; this.cur = null;
    this.cam.release(G.rig, this.match.local);
    this.strip?.show({ text: '', zh: '' }, {});
    this.strip?.fit(this.m1._topKeys());
    this.strip?.verdict({ ok: !!v.ok, head: v.head || '', why: v.why || '' }, { ms });
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'clueVerdict', ok: !!v.ok });
    return true;
  }
  // where the board stands: BD.view m in front of her, towards the gate's targets (board/front.js frontSpot: the nearest
  // way with ground at her level and clear lines to the face and the framing camera)
  _clueSpot(g, spec, bw = BD.w) {
    const a = this.match.local; if (!a) return null;
    const s = frontSpot({ a, base: this.facingYaw(g, a), spec, bw });
    if (!s.none) return s;
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'noBoard', why: s.why, her: [a.pos.x, a.pos.y, a.pos.z].map((v) => +v.toFixed(2)) });
    return null;
  }
  _board() {
    if (this.board || typeof document === 'undefined') return this.board;
    const B = (this.board = new BoardWalk({ scene: G.scene, camera: G.camera, color: G.teamHex?.[0] || '#ff8a14', reduced: this.reduced, root: (G.hud && G.hud.root) || document.body, max: 2 }));
    try { B.warm(G.renderer, G.camera, G.scene)?.catch?.(() => {}); } catch (e) { /* on first use */ }
    B.on.speak = (text, o) => this.say(text, { slow: !!(o && o.slow), onEnd: o && o.onEnd });
    return B;
  }
  _clearClue() {
    const C = this.clueOn; if (!C) return;
    this.clueOn = null;
    if (C.key && this.board) { this.board.free(C.key); this.painted.delete(C.key); }
    if (C.strip) this.strip?.hide();
    if (this.kind === 'clue') { this.kind = null; this.cur = null; }
  }
  _clearStation() {
    if (this.kind === 'm1') this.m1._clear();
    else if (this.kind === 'type') this.type.clear();
    if (G.playTap && this.kind && this.kind !== 'm1') G.playTap = null;
  }

  // the station has handed its answer on, the next question is coming, the partner left: everything off this screen
  clear() {
    this._clearStation(); this._clearClue();
    this.kind = null; this.cur = null;
    this.cam.release(G.rig, this.match.local);
    this.flow.hud?.playMode?.(this.flow.phase === 'ask');   // (between a gate's questions the walk bar stays away)
  }
  prep(g) { if (g) this.m1.prep(g); }
  gateOpened(g) {
    this.clear();
    this.m1.gateOpened(g);
    if (this.board) for (const k of this.painted) this.board.free(k);
    this.painted.clear();
    this.flow.hud?.playMode?.(false);
    this.prep(this.flow.gates[this.flow.cur]);   // (the gate now next: its labels while she walks there)
  }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    const m = this.match, a = m.local;
    if (this._resizedAt) { this._resizedAt = false; this.resized = true; }
    const menuUp = !!(m.paused || (G.menus && G.menus.current));
    this.type.gate(!menuUp);
    if (this._warmT > 0) { this._warmT -= dt; if (this._warmT <= 0) { try { this.type.warm(); this._board(); } catch (e) { console.warn('[coop2 play] warm', e); } } }
    this.m1.update(dt);
    if (m.paused) { this.resized = false; return; }
    this.type.update(dt); this.strip?.update(dt);
    const B = this.board;
    if (B) B.update(dt, this.clueOn && this.clueOn.key && a ? a.pos : null, { aspect: innerWidth / innerHeight, speed: a ? Math.hypot(a.vel?.x || 0, a.vel?.z || 0) : 0 });
    const S = this.kind === 'type' ? this.type : null;
    // standing still while she types: her intents, after the controller wrote them, before she moves
    if (a && S && S.still) { const it = a.intent; it.move.set(0, 0, 0); it.jump = it.fire = it.squid = it.sub = it.special = false; }
    if (this.kind === 'clue') G.playTap = B && B.framed >= 0 ? B.tapApi : null;
    const pose = S ? S.pose : (this.kind === 'clue' && B ? B.framing : null);
    // (the HUD's crosshair over a framed board or over the 打字蟹 is noise: hidden while either is up, back after — as
    // play-5's arena/type.js does; wire/type.js leaves it on)
    const xh = G.hud && G.hud.xh, hideXh = (this.kind === 'clue' && !!(B && B.framed >= 0)) || (this.kind === 'type' && !!this.type.cur);
    if (xh && xh.style && hideXh !== !!this.xhHidden) { xh.style.visibility = hideXh ? 'hidden' : ''; this.xhHidden = hideXh; }
    if (pose) { this.cam.take(G.rig, G.camera); this.cam.to(pose); }
    else if (this.cam.on && this.kind !== 'm1') this.cam.release(G.rig, a);
    this.cam.update(dt, G.rig, G.camera);
    this.resized = false;
  }

  // ---------------------------------------------------------------------------------------------- shared helpers
  // a few metres past the gate on the route (the puzzle's M1 anchor): where the targets float and the ink word lands
  _anchor(out) {
    const F = this.flow, g = F.gates && F.gates[F.cur];
    if (!g) return this.match.local ? out.copy(this.match.local.pos) : out.set(0, 0, 0);
    if (!g._coopAnchor) {
      const nav = G.nav, path = F.path || [];
      let i = g.pathIndex | 0, acc = 0;
      if (nav) while (i < path.length - 1 && acc < 6) { const p = nav.nodes[path[i]], q = nav.nodes[path[i + 1]]; acc += Math.hypot(q.x - p.x, q.z - p.z); i++; }
      const n = nav && path.length ? nav.nodes[path[Math.min(i, path.length - 1)]] : null;
      g._coopAnchor = n ? new THREE.Vector3(n.x, n.y, n.z) : (g.pos ? g.pos.clone() : new THREE.Vector3());
    }
    return out.copy(g._coopAnchor);
  }
  // which way she faces to answer (the 打字蟹's sheet, the clue board): towards the targets' anchor past the gate — or,
  // when the 打字蟹's camera would stand behind something there (a pad is 2.4 m off the route: a balustrade at her back
  // put the lens on its far side, looking at the balusters), the nearest way round with the lens clear of her and the
  // rig. (TypeStation's own search only looks ahead of her, for where the ink word lands.)
  facingYaw(g, a) {
    this._anchor(_c);
    const base = Math.hypot(_c.x - a.pos.x, _c.z - a.pos.z) > 1.5 ? Math.atan2(_c.x - a.pos.x, _c.z - a.pos.z) : a.yaw;
    const P = G.physics; if (!P || !P.los) return base;
    let f = null; try { f = frameFor({ phase: 'type', aspect: innerWidth / innerHeight, dist: FRAME.dist }); } catch (e) { f = null; }
    const q = f && f.pos ? f.pos : [0, 4.4, -2.6];
    for (const dy of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4, Math.PI]) {
      const yaw = base + dy, sy = Math.sin(yaw), cy = Math.cos(yaw);
      _w.set(a.pos.x + cy * q[0] + sy * q[2], a.pos.y + q[1], a.pos.z - sy * q[0] + cy * q[2]);   // (the rig frame: +Z ahead, +X her left)
      if (P.los(_v.set(a.pos.x, a.pos.y + 1.9, a.pos.z), _w) && P.los(_w, _v.set(a.pos.x + sy * 1.2, a.pos.y + 1.3, a.pos.z + cy * 1.2))) return yaw;
    }
    return base;
  }
  // the voice: the course's recording or the device's (hud-learn's _speak), the strip's ▶ lit while it plays
  say(text, o = {}) {
    if (!text) { o.onEnd?.(); return; }
    const H = this.hud; if (!H || !H._speak) { o.onEnd?.(); return; }
    this.strip?.playing(true);
    H._speak(text, () => { this.strip?.playing(false); o.onEnd?.(); }, { slow: !!o.slow });
  }

  debug() {
    const B = this.board, C = this.clueOn;
    return { mechanic: this.kind, item: this.cur && this.cur.item.id, cam: { on: this.cam.on, rigMode: G.rig && G.rig.mode }, still: !!(this.kind === 'type' && this.type.still),
      m1: this.m1.debug(), station: this.kind === 'type' ? this.type.debug() : null,
      clue: C ? { board: !!C.key, strip: !!C.strip, framed: B ? B.framed : -1, hot: B && B.framed >= 0 ? B.set.project(B.list[B.framed].b, G.camera, innerWidth, innerHeight).map((h) => ({ id: h.id, x: Math.round(h.rect.x), y: Math.round(h.rect.y), w: Math.round(h.rect.w), h: Math.round(h.rect.h) })) : [], spot: C.spot ? [C.spot.x, C.spot.y, C.spot.z].map((v) => +v.toFixed(1)) : null } : null,
      painted: [...this.painted], log: this.log.slice(-12) };
  }
  dispose() {
    if (typeof window !== 'undefined') { window.removeEventListener('resize', this._onResize); window.removeEventListener('orientationchange', this._onResize); }
    if (this.xhHidden && G.hud && G.hud.xh) { G.hud.xh.style.visibility = ''; this.xhHidden = false; }
    this._clearStation(); this._clearClue();
    this.cam.release(G.rig, this.match.local);
    this.type.dispose(); this.board?.dispose(); this.board = null;
    this.m1.dispose();
  }
}
