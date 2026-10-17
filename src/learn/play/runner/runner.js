// 墨浪跑酷 — the race as a lane runner (docs/PLAY.md §3 M2 / M3, §5.2, §6.3, §8; LEARN §20). She swims the race's lap
// (common.js loopRoute) on her own ink, lap after lap, at INKWAVE's real swim speed (PLAYER.swimSpeed 11.8, the actor's
// own physics: the road ahead is painted with `paint` so she is submerged; nothing fakes a speed). Every question is a
// row of 2–4 curtains across the road, one option on each; swimming into a curtain is the answer:
//   lane → _judgeRecord (play/judge.js judgeRecord: the one judging path) → right: the curtain bursts into
//   her ink (fx.explosion + paint.flood), a short boost (her swim speed × LEARN.runner.boost); wrong: a soft coral
//   curtain that slows her like enemy ink (enemyInkDecel, no damage), 「差一点：是 ___」, the item comes back reshuffled;
//   a second miss: the answer, the 回炉 queue, and 走远路 — a side branch of the stage for ≈ detour seconds (detour.js).
//   Straight through the gap between two curtains (where each row starts her) is no answer: no evidence, asked again.
// 听辨对子 / 音标 rows are beat rows (M3 in the runner): the curtains pulse to music.js, the word comes a bar before the
// downbeat she reaches the row on, and a lane change inside the beat window adds a bigger boost and a flourish — the
// lane alone is the answer (PLAY §1 rule 4). Typed items (单词卡 / 听写句 / 写句): the 滑行段 — play-type's rig and the game
// keyboard on the road (glide.js: the tide slows, the bots slow the same, she types while the ink carries her on).
// A checkpoint's word boards / sounds / grammar lesson: the 看板段 in front of its rows — play-3's boards along the road,
// each framed as she comes up to it, the tide and the bots slow (boards.js; PLAY §5.2).
//
// Never a pause, never a hold: match.paused stays false while she runs (the results card at the very end holds the
// finished match, like every form's). No card: hud-learn only shows the results card at the end.
//
// Built on RaceFlow (forms/race.js — the race's base, no cards since play-8): its lap, its three racer bots (_bot: the
// same route, BOT_ANSWER dice at the checkpoints, the rubber band), the standings, the prop bag and its effects
// (_onRight, _onWrong2, useProp, _laneFlood).
//
// Controls: swipe (src/core/touch.js swipe hook → swipe(dir)) · A / D or ← / → a lane · W / ↑ / Space jump · S / ↓ /
// Shift dive · a pad's stick / d-pad for lanes, A jump, B dive.
import * as THREE from 'three';
import { G, on, clamp, damp } from '../../../core/ctx.js';
import { LEARN, PLAYER } from '../../../config.js';
import { RaceFlow } from '../../forms/race.js';
import { cumulative, relearnPlan, starsOf, writeStars, fmtClock, relearnTip, useProp as propOf, rightAnswerOf } from '../../forms/common.js';
import { prefersReducedMotion } from '../../../ui/ui-util.js';
import { judgeRecord } from '../judge.js';   // the one judging path (play-8)
import { store } from '../../api.js';
import { EFFECTS } from '../../design.js';
import { laneCenters, dividerStart, laneOf, nextLane, readLead, leadDistance, beatGrid, onBeat, beatPulse, syncTide } from './lanes.js';
import { buildTrack, straighten, clearWidths, placeRow, roomAt, fallRoom, project, at, rawAt } from './track.js';
import { detourBranch, branchLine, branchAt } from './detour.js';
import { entriesOf, rowPrompt, rowLabels, labelText, isBanner, rowLanes, rightLane, planCourse } from './rows.js';
import { RowView, HerMark } from './view.js';
import { RunnerCam } from './cam.js';
import { GlideStation, glideMove } from './glide.js';
import { RunnerBoards, boardSpecsOf, withBoards } from './boards.js';
import { PrepStation } from '../arena/prep.js';   // (the reading passages at the start line: M6 boards in front of her, play-8)
import { gateSpecs } from '../wire/boards.js';
import { RunnerTips } from './tips.js';
import { PlayStrip } from '../../../ui/play-strip.js';   // play-1's question strip: the one strip of every play kind (play-4)
import { say, stop as stopVoice } from '../../audio.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const _p = {}, _q = {}, _pr = {}, _room = { left: 0, right: 0 }, _ry = {};
const TAGS = ['A', 'B', 'C', 'D'];
const FAR = new THREE.Vector3(1e6, 0, 1e6);

// the 滑行段's hook (LEARN §20 「接口」): RunnerFlow.typed = async ({ items, gate, flow, row }) => { … } — the default is
// glide.js (play-type's rig); a test or a lab may hand in its own. The stretch lasts at least LEARN.runner.glide m and
// until it resolves.

export class RunnerFlow extends RaceFlow {
  // hud-learn's walk bar is not the runner's (LearnFlow's ctor assigns it and calls start(): both land here and do
  // nothing); its results card is, at the very end (_results turns this on)
  get hud() { return this._hudOn ? (G.hud && G.hud.learn) || null : null; }
  set hud(v) { /* (see the getter) */ }

  constructor(match, opts = {}) {
    super(match, opts);   // LearnFlow: the level, _place() (ours), _buildMeshes() (ours); RaceFlow: bots, bag, ranks
    this.form = 'race'; this.runner = true;
    this.RR = LEARN.runner;
    this.sNow = 0; this.dNow = 0; this.latT = 0; this.sPrev = 0; this.lastGoodS = 0;
    this.tideK = 1; this.swimK = 1; this.boostT = 0; this.boostK = 1; this.slowT = 0; this.popT = 0;
    this.rows = []; this.lastEnd = this.RR.firstRow; this.paintS = -4; this.detour = null; this.leapS = null;
    this.queue = this.entries.map((e) => ({ ...e, tries: 0, noAns: 0, alt: false }));
    this.stats = { rows: 0, answered: 0, right: 0, wrong: 0, noAnswer: 0, beatRows: 0, onBeat: 0, offBeat: 0, detours: 0, branches: 0, glides: 0, boards: 0, skipped: [] };
    this.glide = new GlideStation(this);
    this.bw = new RunnerBoards(this);   // the 看板段's boards (play-3's BoardWalk along the road)
    // (the write wall's sentences are asked too — the run's last 滑行段, PLAY §4 W / S: they count in the results card's
    // 「做对」 and 「首答答对」 like every other scored item; RaceFlow counted the checkpoints' items only)
    const wall = new Set(); for (const e of this.entries) if (e.exit) for (const it of e.items) wall.add(it.id);
    this.scoredN += wall.size; this.total += wall.size;
    this.typed = opts.typed || RunnerFlow.typed || ((o) => this.glide.run(o));
    this.fairK = 1;   // the slow the bots share with her (a glide, a board stretch): × their move
    this._in = []; this._jumpQ = false; this._diveQ = false; this._padLat = 0; this._lastFrame = -1;
    this.stop = false; this.boards = null; this.phase = 'walk';
    this.cam = new RunnerCam();
    this.mark = new HerMark(); G.scene.add(this.mark.mesh);
    this.strip = new PlayStrip(G.hud); this.strip.el.classList.add('is-runner'); this.strip.setInk((G.teamHex || [])[0]);
    this.tips = new RunnerTips(G.hud);
    this.ui.el?.classList.add('is-runner');
    G.hud?.el?.classList.add('is-learn', 'is-runner');   // (hud-learn's start() did is-learn: the clock's width; is-runner: no crosshair)
    G.touch?.el?.classList.add('is-runner');       // only ⏸ of the thumb cluster (hud.js CSS)
    const a = match.local;
    if (a) this._install(a);
    this._unsub = [
      on('match:state', ({ state, match: m }) => { if (m === this.match && state === 'playing') this.cam.take(G.rig); }),
      on('respawn', ({ actor }) => { if (actor === this.match.local) this._respawned(actor); }),
    ];
    this._warm();
    this._setFinish(this.finish.s + this.lineBack);   // (the finish ring, built by RaceFlow after _place, onto her line)
  }

  // ---------------------------------------------------------------------------------------------- the road
  // the race's lap (RaceFlow._place: the same start, far side and lanes), then the runner's track over it: string-pulled
  // and smoothed, the clearance scanned, the day's rows planned (no retries) for the bots' checkpoints and the laps
  _place() {
    super._place();
    const nav = G.nav, R = LEARN.runner, et = (a, b) => nav.edgeType(a, b), loop = this.route.loop;
    this.loop = loop; this.loopN = loop.length;
    this.T = buildTrack(nav.nodes, loop, { keep: straighten(nav, loop, { edgeType: et }), edgeType: et });
    this.loopEdges = {}; for (let k = 1; k < loop.length; k++) { const t = et(loop[k - 1], loop[k]); this.loopEdges[t] = (this.loopEdges[t] || 0) + 1; }   // (the audits: which ledges the lap has)
    this.W = clearWidths(nav, this.T);
    // (the 看板段: a stretch of boards in front of each checkpoint that has any — word boards, sounds, a grammar lesson)
    this.boardN = this.level.gates.map((g) => { try { return boardSpecsOf(g, this.level).length; } catch (e) { return 0; } });
    this.entries = withBoards(entriesOf(this.level.gates, this.level.signs, { short: !!this.level.short }), this.boardN);
    const plan = planCourse(this.entries, this.T, this.W, R, { swimSpeed: PLAYER.swimSpeed });
    const rowsN = this.entries.filter((e) => e.kind !== 'glide' && e.kind !== 'boards').length, typedN = this.entries.reduce((n, e) => n + (e.kind === 'glide' ? e.items.length : 0), 0);
    this.lapsPlan = Math.max(1, Math.ceil((plan.end + 20) / this.T.len));
    // retries, no-answers, 回炉 — and the typing: a 滑行段 lasts as long as its items take (≈ 14 s a word at the glide tide)
    const spare = Math.ceil(((rowsN * 0.35 + LEARN.relearnMax) * 32 + typedN * 14 * R.glideTide * PLAYER.swimSpeed) / this.T.len) + 1;
    this.laps = this.lapsPlan + spare;
    const path = loop.slice(); for (let k = 1; k < this.laps; k++) for (let i = 1; i < loop.length; i++) path.push(loop[i]);
    this.path = path; this.cum = cumulative(nav.nodes, path);
    // checkpoints: one per gate of the day, where its first row's reading zone begins (bots roll their die there)
    let lastS = R.firstRow;
    this.gates = this.level.gates.map((def, k) => {
      const s = plan.gateS[k] != null ? plan.gateS[k] : lastS; lastS = s;
      const i = this.pathIndexAt(s), node = nav.nodes[path[i]];
      return { ...def, index: k, pathIndex: i, node: path[i], pos: new THREE.Vector3(node.x, node.y, node.z), state: k === 0 ? 'next' : 'locked', locks: 0, queue: [] };
    });
    for (let k = 1; k < this.gates.length; k++) if (this.gates[k].pathIndex <= this.gates[k - 1].pathIndex) { const g = this.gates[k], i = Math.min(path.length - 2, this.gates[k - 1].pathIndex + 1), n = nav.nodes[path[i]]; g.pathIndex = i; g.node = path[i]; g.pos.set(n.x, n.y, n.z); }
    this._setFinish(this.lapsPlan * this.T.len);
    this.plan = plan;
  }
  // the multi-lap path index under arc length s (the bots' route and the race's cum)
  pathIndexAt(s) {
    const len = this.T.len, lap = Math.floor(s / len), r = rawAt(this.T, s - lap * len);
    return clamp(lap * (this.loopN - 1) + Math.round(r), 0, this.path.length - 1);
  }
  // the finish: the start of the lap at or after s (the start node — the bots' line, the same spot every lap). Hers is a
  // few metres before it, short of the lap's last jump-up edge (the start deck on some stages): s − lineBack
  _setFinish(s) {
    const len = this.T.len, lap = Math.max(1, Math.ceil(s / len - 1e-6));
    const i = clamp(lap * (this.loopN - 1), 0, this.path.length - 1), n = G.nav.nodes[this.path[i]];
    if (!this.finish) this.finish = { id: 'finish', title: '终点', pos: new THREE.Vector3() };
    if (this.lineBack == null) { let b = 4; for (const j of this.T.jumps) if (len - j < 12) b = Math.max(b, len - j + 2); this.lineBack = b; }
    Object.assign(this.finish, { pathIndex: i, node: this.path[i], s: lap * len - this.lineBack }); this.finish.pos.set(n.x, n.y, n.z);
    if (this.finish.mesh) { at(this.T, this.finish.s, _p); const gy = G.level ? G.level.groundHeight(_p.x, _p.z, _p.y + 1) : _p.y; this.finish.mesh.position.set(_p.x, (Number.isFinite(gy) ? gy : _p.y) + 0.06, _p.z); this.finish.mesh.scale.set(2.2, 2.2, 1); }
  }
  // no gate markers (the rows are the gates); the ring geometry stays for the finish ring and the signs
  _buildMeshes() { this._geos = [new THREE.RingGeometry(0.85, 1.35, 40)]; this._mats = []; }
  _styleGates() { /* (no gate meshes) */ }
  prep() { return !!this.boards; }   // (the audits: a reading board is up before the start)

  // ---------------------------------------------------------------------------------------------- her body
  // Her swim speed is scaled inside her own update only (PLAYER.swimSpeed × swimK; a coral curtain also sheds speed at
  // PLAYER.enemyInkDecel): the actor's real swim model does the rest. The racer bots never swim (race.js _bot: squid off),
  // and the scaling is undone before anyone else updates. After her update: where she is on the road (crossings, camera).
  _install(a) {
    const self = this, orig = a.update;
    a.update = function runnerUpdate(dt) {
      const P = PLAYER, s0 = P.swimSpeed, d0 = P.swimDecel;
      P.swimSpeed = s0 * self.swimK;
      if (self.slowT > 0) P.swimDecel = P.enemyInkDecel;
      try { orig.call(this, dt); } finally { P.swimSpeed = s0; P.swimDecel = d0; }
      self._after(dt);
    };
    this._uninstall = () => { if (a.update !== orig) delete a.update; };
  }

  _respawned(a) {   // the sea (the only way to be splatted here): back on the road where she left it
    this.seaN = (this.seaN || 0) + 1;   // (play-9: how often — debug().sea; the audits count it)
    at(this.T, this.lastGoodS - 3, _p);
    a.pos.set(_p.x, _p.y + 0.6, _p.z); a.vel.set(0, 0, 0); a.yaw = a.aimYaw = Math.atan2(_p.tx, _p.tz);
    a.character.root.position.copy(a.pos);
    this.sNow = this.sPrev = this.lastGoodS - 3; this.latT = 0; this.paintS = Math.min(this.paintS, this.sNow - 2);
    this.cam.fresh = true; this.cam.take(G.rig);
    this._respawnRows();
  }
  // (play-8) the sea while a row of curtains is up — she went off the edge steering to her lane (halyard's mid deck: off
  // the stairs onto the narrow ramp with her lane out over the water, LEARN §27) — that row is no answer: back on the road
  // with latT 0 she would swim through a lane she never chose (the whole-day audit saw it written as a wrong first answer).
  // It comes again, nothing written — as through the gap, or under a leap (PLAY §1 rule 5)
  _respawnRows() {
    for (const row of this.rows.slice()) if (row.state === 'shown' && row.centers && row.s > this.sNow) this._settle(row, 1e9);
  }

  // The race's own bot (RaceFlow._bot, unchanged) on a lap run many times: it "arrives" at a checkpoint or the line by
  // distance alone, and on a loop every spot comes round once a lap — so until a bot's place on the route is near its
  // target's (path index), the target stands out of reach for that one call. Nothing else of _bot is touched.
  _botLap(r, dt) {
    const tgt = r.cp < this.gates.length ? this.gates[r.cp] : this.finish;
    if (!tgt || r.k >= tgt.pathIndex - 8) { this._bot(r, dt); return; }
    const p = tgt.pos; tgt.pos = FAR;
    try { this._bot(r, dt); } finally { tgt.pos = p; }
  }

  // ---------------------------------------------------------------------------------------------- input
  swipe(dir) { this._in.push(dir); }   // src/core/touch.js swipe hook
  _readInput() {
    const I = G.input, fr = G.game && G.game._frameN != null ? G.game._frameN : G.time;
    if (fr === this._lastFrame || !I) return;   // (a slow frame runs two sub-steps: read a key once)
    this._lastFrame = fr;
    if (this.glide.typing) return;   // (the game keyboard has the keys; a swipe is nothing on the 滑行段)
    const pr = (c) => I.wasPressed(c);
    if (pr('KeyA') || pr('ArrowLeft')) this._in.push('left');
    if (pr('KeyD') || pr('ArrowRight')) this._in.push('right');
    if (pr('KeyW') || pr('ArrowUp') || pr('Space')) this._in.push('up');
    if (pr('KeyS') || pr('ArrowDown') || pr('ShiftLeft') || pr('ShiftRight')) this._in.push('down');
    if (I.pad) {
      const x = I.padAxis(0), pp = I.padPressed;
      if (x < -0.55 && this._padLat >= 0) this._in.push('left');
      if (x > 0.55 && this._padLat <= 0) this._in.push('right');
      this._padLat = x < -0.55 ? -1 : x > 0.55 ? 1 : Math.abs(x) < 0.3 ? 0 : this._padLat;
      if (pp.has(14)) this._in.push('left'); if (pp.has(15)) this._in.push('right');
      if (pp.has(0)) this._in.push('up'); if (pp.has(1)) this._in.push('down');
    }
  }
  _apply(dir) {
    if (!this.started || this.stop || this.glide.active) return;
    if (dir === 'up') { this._jumpQ = true; return; }
    if (dir === 'down') { this._diveQ = true; return; }
    if (this.detour && this.detour.line) return;   // (the branch steers)
    const d = dir === 'left' ? -1 : 1, row = this._shown();
    if (row && row.centers) { const t = nextLane(this.latT, d, row.centers); if (t !== this.latT) { this.latT = t; row.swipeT = G.time; G.audio?.play?.('ui_click', { volume: 0.35, pitch: d > 0 ? 1.1 : 0.95 }); } }
    else { const r = roomAt(this.T, this.W, this.sNow, 0.45); this.latT = clamp(this.latT + d * this.RR.laneW, -r.left, r.right); }
  }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    this.t += dt;
    this._pourInk();
    this.strip.update(dt); this.tips.update(dt);
    const m = this.match, a = m.local;
    for (const r of this.rows) r.view && r.view.update(G.time, r.kind === 'beat' && r.state === 'shown' && r.grid ? beatPulse(r.grid, G.time) : 0, dt);
    for (const r of this.rows) if (r.view && r.state === 'built' && r.view.prepare()) break;   // one label a frame
    this._reap(dt);
    if (this.finishT >= 0) { this.finishT -= dt; this._steer(a, dt); if (this.finishT < 0) this._results(); return; }
    if (this.phase === 'done' || m.state !== 'playing' || !a) return;
    if (!this.started) { this._start(); this.prepS?.update(dt); this._steer(a, dt); return; }
    this.clock += dt;
    const txt = `圈 ${fmtClock(this.clock)}`;
    if (txt !== this._clockTxt && G.hud?.timerTxt) { this._clockTxt = txt; G.hud.timerTxt.textContent = txt; }
    for (const r of this.racers) { this._botLap(r, dt); if (this.fairK < 1 && r.state === 'run') r.a.intent.move.multiplyScalar(this.fairK); }   // (fair: the bots slow with her on a 滑行段 / by the boards)
    if ((this._rankT -= dt) <= 0) { this._rankT = 0.5; this.me.progress = this.cum[this.pathIndexAt(Math.max(0, this.sNow))]; this._rank(); }
    this.glide.update(dt);
    const shown = this._shown();
    this.bw.questionUp = !!(shown && shown.kind !== 'boards');   // (the reading strip never opens over a row or the typing)
    this.bw.update(dt, shown && shown.kind === 'boards' ? this.sNow : -1e9, this._aspect());   // (framed only on its own stretch)
    this._prepBoards();
    this._propKey(a);
    this._readInput();
    while (this._in.length) this._apply(this._in.shift());
    this.boostT = Math.max(0, this.boostT - dt); this.slowT = Math.max(0, this.slowT - dt);
    if (this.popT > 0 && (this.popT -= dt) <= 0) { a.character.setDance?.(null); }
    this._build();
    this._tide(dt);
    this._steer(a, dt);
    this._unstick(a, dt);
    this._paint();
    this._words();
  }

  // she should never stand: pushed against something for 0.6 s → a hop; 2 s → the game's own super jump back onto the
  // road a few metres on (a railing, a prop the lap brushes, a ledge she met off-centre)
  _unstick(a, dt) {
    if (!a.alive || a.superJumpState || this.stop || (this.detour && this.detour.line)) { this._stuckT = 0; this._stuckS = this.sNow; return; }
    // stuck = no progress ALONG THE ROAD (play-4: sliding along a ledge / circling at halyard's start deck moved her
    // more than 0.8 m a time, so by her position alone she was never "stuck" — and stayed there for good). The slowest
    // stretch (a 看板段, 0.25 × 11.8 m/s) still makes 1.8 m in 0.6 s.
    if (this._stuckS == null || this.sNow - this._stuckS > 0.8 || this.sNow < this._stuckS - 5) { this._stuckS = this.sNow; this._stuckT = 0; return; }
    const was = this._stuckT || 0;
    this._stuckT = was + dt;
    // at the line (the start deck's edge on halyard: play-4's audits stopped 0.04 m short of it, the super jump not
    // ready): she is there — the line counts as crossed
    if (this.phase === 'final' && this.finish && this.finish.s - this.sNow < 3 && this._stuckT >= 0.6) { this._stuckT = 0; this._emit('learn:unstick', { s: +this.sNow.toFixed(1), line: true }); this._finishDone(); return; }
    // a hop at 0.6 s and every second after it (one hop was all there was: a ledge she met off-centre held her for good
    // while the super jump was not ready)
    // (only a hop while a row of curtains is up: her lane is her answer — PLAY §1.5, nothing may move her into another
    // one; play-4's halyard audit had a hop's latT = 0 judge a lane she never chose)
    const row = this._shown(), curt = !!(row && row.centers);
    if (this._stuckT >= 0.6 && Math.floor(was - 0.6) !== Math.floor(this._stuckT - 0.6)) { this._jumpQ = true; if (!curt) this.latT = 0; }
    if (this._stuckT >= 2 && a.canSuperJump()) {
      this._stuckT = 0;
      const s = this.sNow + 6;
      // the leap would carry her over the row's line (a leap's landing is never a crossing): that row is no answer — it
      // comes again, nothing written (as through the gap)
      if (curt && row.s < s + 1) this._settle(row, 1e9);
      this._paintRange(Math.max(this.paintS, s - 3), s + 8);
      at(this.T, s, _p);
      a.superJump(new THREE.Vector3(_p.x, _p.y, _p.z), { instant: true });
      this.leapS = s; this.detour = this.detour && this.detour.slow ? this.detour : null;
      this._emit('learn:unstick', { s: +s.toFixed(1) });
    }
  }

  // the start: the reading passages first (PLAY §4: 阅读题 — M6 before the start, play-8: a board in front of her at the
  // start line, framed, the strip's 「下一块」 / 「出发！」 — no card), then GO
  _start() {
    if (this.boards !== null) return;
    const seen = new Set(), specs = [];
    for (const g of this.level.gates) {
      if (!(g.design && g.design.mechanic === 'reading-room')) continue;
      let s = []; try { s = gateSpecs(g, this.level); } catch (e) { s = []; }
      for (const sp of s) if (!seen.has(sp.title)) { seen.add(sp.title); specs.push(sp); }
    }
    if (!specs.length) { this.boards = false; this._go(); return; }
    this.boards = true;
    this.prepS = this.prepS || new PrepStation({ flow: this, match: this.match, strip: this.strip, reduced: prefersReducedMotion(), say: (t, o) => this._speak(t, o), facingYaw: (g, a) => a.yaw, m1: { _topKeys: () => this._topKeys() } });
    this.prepS.show(specs, { head: '起跑前读一读', go: '出发！', onGo: () => { this.boards = false; this._go(); } });
  }
  _go() {
    if (this.started) return;
    this.started = true; this.phase = 'walk';
    for (const r of this.racers) { r.a.character.setDance?.(null); if (r.state === 'wait') r.state = 'run'; }
    G.hud?.banner?.('go', '出发');
    G.audio?.play?.('go_horn', { volume: 0.8 });
    const touch = !!(G.input && G.input.touch && G.input.touch.active);
    this.tips.showHint(touch ? '左右滑 换道 · 上滑 跳 · 下滑 潜' : 'A / D 换道 · W 跳 · S 潜（也可以用方向键）', 5);
    this.tips.maybeRotate();
  }

  // ---------------------------------------------------------------------------------------------- rows
  _shown() { for (const r of this.rows) if (r.state === 'shown') return r; return null; }
  _live() { let n = 0; for (const r of this.rows) if (r.state !== 'done') n++; return n; }
  // keep two rows built ahead (labels drawn, curtains made — PLAY §2: built two ahead, they only fade in when asked)
  _build() {
    if (this.detour && this.detour.line) return;
    while (this._live() < 2 && this.queue.length) {
      // (a 看板段 waits for the 滑行段 in front of it to end: typing takes as long as it takes, and she must not swim
      // past the boards while she types — w2d3 in landscape did, and the board counted as read from behind the keyboard)
      if (this.queue[0].kind === 'boards' && this.rows.some((r) => r.kind === 'glide' && r.state !== 'done')) break;
      const e = this.queue.shift();
      const R = this.RR, v = PLAYER.swimSpeed * R.tide;
      if (e.kind === 'boards') {   // the 看板段: the boards rise along the road now (seen from afar), framed one by one as she comes
        const g = this.gates[e.gate], s0 = Math.max(this.lastEnd + 4, this.sNow + 8);
        const zone = g ? this.bw.place(g, s0) : null;
        if (!zone) continue;
        this.rows.push({ e, kind: 'boards', gate: e.gate, s0, s1: zone.s1, s: zone.s1, sAppear: s0 - 2, state: 'built', n: e.n });
        this.lastEnd = zone.s1 + R.after;
        if (this.finish && this.lastEnd + 20 > this.finish.s) this._setFinish(this.lastEnd + 20);
        continue;
      }
      if (e.kind === 'glide') {
        const s0 = Math.max(this.lastEnd + 4, this.sNow + 8);
        this.rows.push({ e, kind: 'glide', gate: e.gate, s0, s1: s0 + R.glide, s: s0 + R.glide, sAppear: s0 - 4, state: 'built' });
        this.lastEnd = s0 + R.glide + R.after;
        continue;
      }
      const item = e.item;
      let p = rowPrompt(item, { alt: e.alt, base: e.prompt });
      const lanes = rowLanes(item, p, R.banner);
      const lead = readLead(rowLabels(item, p).map(labelText), R.lead), D = leadDistance(lead, v);
      const want = Math.max(this.lastEnd + D, this.sNow + D + 1.5);
      const spot = placeRow(this.T, this.W, want, lanes, { laneW: R.laneW, gap: R.gap, runIn: R.runIn, runOut: R.runOut, slide: R.slide, search: this.T.len * 2 }) || { s: want, lanes, c: 0 };
      if (spot.lanes < p.options.length) p = rowPrompt(item, { order: e.prompt ? null : p._perm, lanes: spot.lanes, base: e.prompt ? p : null });
      if (e.alt) p.text = p.text.startsWith('换个问法') ? p.text : '换个问法：' + p.text;
      if (e.relearn) { const tip = relearnTip(item); p.zh = [tip.zh, p.zh].filter(Boolean).join('　'); p._tip = tip; }
      const labels = rowLabels(item, p), banner = labels.some((l) => isBanner(l, R.banner));
      const row = { e, item, p, kind: e.kind, gate: e.gate, lanes: spot.lanes, c: spot.c, centers: laneCenters(spot.lanes, R.laneW, spot.c), labels, banner, tags: TAGS, s: spot.s, D, lead, sAppear: spot.s - D, state: 'built', swipeT: null };
      row.view = new RowView(row, this.T, { laneW: R.laneW, gap: R.gap });
      G.scene.add(row.view.group);
      this.rows.push(row);
      this.lastEnd = spot.s + R.after;
      if (this.paintS > row.sAppear - 2) this._paintRange(row.sAppear - 2, row.s + 2);
      // the line moves on with her road (a retry or a no-answer adds a row): the bots race to the same line she does
      if (this.finish && this.lastEnd + 20 > this.finish.s) this._setFinish(this.lastEnd + 20);
    }
    // the next row shows when she reaches its reading zone, the one before it done
    for (const r of this.rows) {
      if (r.state !== 'built') continue;
      if (this.sNow >= r.sAppear && !this._shown()) this._appear(r);
      break;
    }
  }
  // a checkpoint's boards painted ahead (PLAY §7: two entries ahead, one checkpoint a frame — not on the road)
  _prepBoards() {
    for (let i = 0; i < Math.min(3, this.queue.length); i++) {
      const e = this.queue[i], g = e.kind === 'boards' ? this.gates[e.gate] : null;
      if (g && !g._boards) { this.bw.prepare(g); return; }
    }
  }

  _appear(row) {
    row.state = 'shown';
    if (row.kind === 'glide') { this._glide(row); return; }
    if (row.kind === 'boards') {   // nothing asked: she swims past them, slowly; each is framed as she comes up to it
      const g = this.gates[row.gate];
      this.stats.boards++;
      // (no pill: FormsUi's say sits top-centre, right over a framed board's title in landscape — the board is the message)
      this._emit('learn:boards', { gate: g ? g.id : null, n: row.n, s0: +row.s0.toFixed(1), s1: +row.s1.toFixed(1) });
      return;
    }
    const R = this.RR, item = row.item, p = row.p, g = this.gates[row.gate];
    row.view.setVisible(true);
    this.asking = { gate: g || { id: 'gate:relearn', index: this.gates.length }, item, p, row };
    this.asked++; this.stats.rows++;
    this.latT = dividerStart(row.lanes, R.laneW, row.c, this.latT);   // the ink road carries her onto a divider
    this._ask(row.kind, p, row.labels.map((l, i) => ({ tag: TAGS[i], en: l.en, zh: l.zh })), row.banner);
    G.audio?.play?.('ui_confirm', { volume: 0.45 });
    if (row.kind === 'beat') {
      row.grid = this._grid();
      const sync = syncTide(Math.max(1, row.s - this.sNow), PLAYER.swimSpeed, row.grid, G.time, 0.45, 0.85);
      row.tide = sync.k; row.downbeat = sync.at; row.wordAt = sync.at - row.grid.bar;   // the word: a bar before
      this.stats.beatRows++;
    } else {
      row.tide = R.tide;
      row.wordAt = G.time;
    }
    row.spoken = false;
    if (this.echoNext && p.tts) { this.echoNext = false; row.echoAt = Math.max(row.wordAt, G.time) + 1.9; }
    this._emit('learn:question', { itemId: item.id, gate: g ? g.id : 'gate:relearn', type: row.kind, form: row.e.relearn ? 'relearn' : row.e.alt ? 'alt' : 'normal', lanes: row.lanes, s: +row.s.toFixed(1) });
  }
  // the words on their beat (lane rows: at once; beat rows: one bar before the downbeat — PLAY §3 M3)
  _words() {
    const row = this._shown();
    if (!row || !row.centers) return;   // (a row of curtains: not a 滑行段, not a 看板段)
    const p = row.p;
    if (!row.spoken && G.time >= row.wordAt - 0.02) {
      row.spoken = true;
      const tip = p._tip;
      if (tip && tip.speakBoth && row.item.meta && row.item.meta.pair) this._speak(row.item.meta.pair.join(', '));
      else if (p.tts) this._speak(p.tts, { slow: !!(tip && tip.slow) });
    }
    if (row.echoAt && G.time >= row.echoAt) { row.echoAt = 0; this._speak(p.tts); }
    this.strip.here(laneOf(this.dNow, row.lanes, this.RR.laneW, row.c, this.RR.gap));
  }
  // the music's grid on the game clock (a synth track carries its bpm and its first downbeat on the audio clock)
  _grid() {
    const mu = G.music, cur = mu && mu.current;
    try { if (cur && cur.song && cur.song.bpm && cur.t0 != null && mu.ctx) return beatGrid(cur.song.bpm, cur.t0 + (G.time - mu.now())); } catch (e) { /* no audio clock */ }
    if (!this._fallbackGrid) this._fallbackGrid = beatGrid(this.RR.bpm, G.time);
    return this._fallbackGrid;
  }

  // ---------------------------------------------------------------------------------------------- the strip
  // a row's question on play-1's strip: a chip for the kind (选一条道 / 踩拍换道 / 打字 · 射), the question as the engine
  // words it, ▶ 再听, and the options by lane (always for banner rows — a 41-character curtain reads only at the last
  // second on a 390 px phone — otherwise only upright)
  _ask(kind, p, lanes = null, banner = false) {
    const tag = kind === 'beat' ? { text: '踩拍换道', kind: 'beat' } : kind === 'glide' ? { text: '滑行段 · 打字', kind: 'type' } : { text: '选一条道', kind: 'lane' };
    this.strip.show(p, { replay: p.tts ? () => { G.hud?.playSound?.('ui_click'); this._speak(p.tts, { slow: !!(p._tip && p._tip.slow) }); } : null, tag, lanes, lite: !banner });
    this.strip.fit(this._topKeys());
  }
  // the verdict line: 「对！」 in her ink, 「差一点：是 ___」 (+ the why) in coral — for ms, then gone (or on as a note
  // under the next question, the strip's own rule)
  _say(ok, text, why = '', ms = 2400) { this.strip.verdict({ ok, head: text, why }, { ms }); }
  _speak(text, o = {}) {
    if (!text) return;
    this.strip.playing(true);
    say(text, { slow: !!o.slow, onEnd: () => this.strip.playing(false) });
  }
  // the strip's bottom edge as a share of the screen height, or null when it is hidden — read off the DOM at most every
  // 0.4 s of game time (a layout read every frame after the lane cells' class changes would force a reflow a frame);
  // fresh: read it now (play-9: the strip has just changed height — the 滑行段's hint line)
  stripBottom(fresh = false) {
    const now = G.time || 0;
    if (fresh || this._sbT == null || now - this._sbT > 0.4 || now < this._sbT) {
      this._sbT = now;
      const r = this.strip.rect(), Hh = typeof innerHeight !== 'undefined' ? innerHeight : 0;
      this._sb = r && Hh ? r.bottom / Hh : null;
    }
    return this._sb;
  }
  // the touch layer's live top-row keys (⏸ here): the strip keeps clear of them (as play-1's run.js does)
  _topKeys() {
    const T = G.touch, out = [];
    if (T && T.enabled && T.buttons) for (const b of T.buttons) if (b.top && b.r > 0 && b.el && b.el.getClientRects().length) out.push({ x: b.cx - b.r, y: b.cy - b.r, w: b.r * 2, h: b.r * 2 });
    return out;
  }

  // ---------------------------------------------------------------------------------------------- after her update
  _after(dt) {
    const a = this.match.local;
    if (!a || !a.alive) return;
    const T = this.T;
    this.sPrev = this.sNow;
    if (a.superJumpState) { this.cam.update(dt, a, T, this.sNow, this._aspect()); return; }
    if (this.leapS != null) { this.sNow = this.sPrev = project(T, a.pos.x, a.pos.z, this.leapS, 8, 8, _pr).s; this.leapS = null; this.paintS = Math.max(this.paintS, this.sNow - 2); }
    let yawRoad = null;
    const D = this.detour;
    if (D && D.line) {   // on the branch: progress along it; at its end, back onto the road
      let best = D.u, bd = Infinity;
      for (let u = Math.max(0, D.u - 2); u <= Math.min(D.line.len, D.u + 6); u += 0.5) { branchAt(D.line, u, _q); const d = (a.pos.x - _q.x) ** 2 + (a.pos.z - _q.z) ** 2; if (d < bd) { bd = d; best = u; } }
      D.u = best; branchAt(D.line, Math.min(D.line.len, best + 4), _q); yawRoad = Math.atan2(_q.tx, _q.tz);
      if (best >= D.line.len - 1.5) {
        this.sNow = this.sPrev = project(T, a.pos.x, a.pos.z, D.sJoin, 8, 8, _pr).s;
        this.detour = null; this.latT = clamp(_pr.d, -1.5, 1.5); this.lastEnd = Math.max(this.lastEnd, this.sNow + 2);
        this.paintS = Math.max(this.paintS, this.sNow - 2);
        this._emit('learn:rejoin', { s: +this.sNow.toFixed(1) });
      }
    } else {
      project(T, a.pos.x, a.pos.z, this.sNow, 3, 6, _pr);
      if (_pr.dist > 7) project(T, a.pos.x, a.pos.z, this.sNow, 25, 25, _pr);   // knocked well off (a push, a fall): look wider
      this.sNow = Math.max(this.sNow - 3, _pr.s); this.dNow = _pr.d;
      if (a.grounded && _pr.dist < 3) this.lastGoodS = this.sNow;
      this._cross(this.sPrev, this.sNow);
      if (this.phase === 'final' && this.sNow >= this.finish.s) this._finishDone();
      // (the last 3 m for 2 s — against the deck's edge, sliding along it: she is at the line)
      else if (this.phase === 'final' && this.finish.s - this.sNow < 3) { if ((this._lineT = (this._lineT || 0) + dt) > 2) this._finishDone(); }
    }
    const row = this._shown();
    let focus = null;
    if (row && row.centers && !yawRoad) {   // frame the row being asked (fades out over its last metres)
      const ahead = row.s - this.sNow;
      at(T, row.s, _q);
      const w = clamp((ahead - 2) / 6, 0, 1) * clamp((34 - ahead) / 8, 0, 1) * 0.75;
      focus = this._focus || (this._focus = {});
      focus.x = _q.x + _q.rx * row.c; focus.y = _q.y + 1.1; focus.z = _q.z + _q.rz * row.c; focus.w = w;
      focus.top = this.stripBottom();   // (the band under the strip: cam.js keeps the row out from under it)
    }
    // a station's pose: the typing rig's frame on a 滑行段, the framed board on a 看板段 (springs in and out: cam.js)
    this.cam.update(dt, a, T, this.sNow, this._aspect(), yawRoad, focus, this.glide.active ? this.glide.pose : (this.prepS && this.prepS.pose) || this.bw.framing);
    this.mark.update(this.glide.active ? null : a, Math.atan2(a.vel.x, a.vel.z));
    if (row && row.view) row.view.focus = laneOf(this.dNow, row.lanes, this.RR.laneW, row.c, this.RR.gap);
  }
  _aspect() { const c = G.camera; return c && c.aspect ? c.aspect : (typeof innerWidth !== 'undefined' ? innerWidth / innerHeight : 16 / 9); }

  // a row's curtain line between two of her positions this step → her lateral offset there → the lane (or the gap)
  _cross(s0, s1) {
    for (const row of this.rows) {
      if (row.state !== 'shown') continue;
      if (row.kind === 'glide') { if (s1 >= row.s1 && row.typedDone) this._glideDone(row); continue; }
      if (row.kind === 'boards') { if (s1 >= row.s1) { row.state = 'done'; row.doneT = 0; this._checkGates(); } continue; }
      if (s0 < row.s && s1 >= row.s) this._settle(row, this.dNow);
    }
  }

  _settle(row, d) {
    const R = this.RR, item = row.item, p = row.p, g = this.gates[row.gate];
    row.state = 'done'; row.doneT = 0;
    this.strip.hide(); this.asking = null;
    const lane = laneOf(d, row.lanes, R.laneW, row.c, R.gap);
    // through the gap (or outside the curtains): no answer, nothing judged, nothing written (rows.js rowAnswer's rule)
    if (lane == null || lane < 0 || lane >= (p.options || []).length) { this._noAnswer(row); return; }
    const beat = row.kind === 'beat' ? (row.swipeT != null && onBeat(row.grid, row.swipeT)) : null;
    const { r } = this._judgeRecord(g, item, p, lane, { emit: { lane, beat, kind: row.kind } });   // the one path
    this.stats.answered++;
    if (r.ok) this._rightRow(row, lane, beat); else this._wrongRow(row, lane, r);
    // (a typed word's 「选义」 row: picked right → it is typed again next, PLAY §4 「再回来打」; missed → the answer was given)
    if (row.e.then && r.ok) this.queue.unshift(row.e.then);
    this._checkGates();
  }

  // ---------------------------------------------------------------------------------------------- the one judging path
  // Every answer of the run comes here (PLAY §1 rule 2) — a curtain's lane (_settle) and a typed text on the 滑行段
  // (glide.js) — and goes on to the one judging path (play/judge.js judgeRecord: judge → the day's first answer, a hint →
  // H, 「我的写法也对」 → S). What stays here is the runner's own: the tallies, learn:answer once, the held sentence's
  // marker. The runner keeps its own queue (a row and a glide each decide their other try), so nothing is locked or
  // re-queued here. A near-miss written sentence (canClaim) is always held (hold: the 滑行段 waits for her) until she
  // decides (o.decided + o.claim). o.hinted: the keyboard's 提示; o.at: the answer's time; o.emit: more fields for
  // learn:answer (lane, beat, kind).
  _judgeRecord(g, item, p, ans, o = {}) {
    const out = judgeRecord({ item, p, ans, o: { hinted: o.hinted, hold: true, decided: o.decided, claim: o.claim, at: o.at }, store });
    const { r, first, self, hinted } = out;
    if (out.held) { this._claimHeld = { itemId: item.id }; return { r, first: false, again: false, held: true }; }
    if (o.decided) this._claimHeld = null;
    if (first) { this.firsts++; if (r.ok) this.firstRight++; }
    if (r.ok) this.right.add(item.id);
    this._emit('learn:answer', { itemId: item.id, ok: r.ok, first, gate: g ? g.id : 'gate:relearn', hinted, relearn: !!item._relearn, ...(self ? { self: true } : {}), ...(o.emit || {}) });
    return { r, first, again: false, self };
  }

  _rightRow(row, lane, beat) {
    const R = this.RR, a = this.match.local, col = G.teamColors[0];
    this.stats.right++;
    if (row.e.relearn) this.relearnRight++;
    this.streak++; this.rightN++;
    row.view.mark(lane, 'right');
    row.view.pos(lane, _v);
    G.fx?.explosion?.(_v, col, 2.2);
    this._floodRow(row, lane);
    if (beat) {   // on the beat: more speed and a flourish — a dolphin hop out of the ink (squid form: the speed carries) + a burst
      this.stats.onBeat++;
      this.boostK = R.beatBoost[0]; this.boostT = R.beatBoost[1];
      this._jumpQ = true; this.popT = 0.7; a.character.setDance?.('victory');
      _v2.copy(a.pos); _v2.y += 0.3; G.fx?.ring?.(_v2, _up, col, { radius: 1.8, life: 0.4 });
      this._say(true, '对！踩在拍子上');
    } else {
      if (beat === false) this.stats.offBeat++;
      this.boostK = R.boost[0]; this.boostT = R.boost[1];
      this._say(true, beat === false ? '对！（下次踩在拍子上更快）' : '对！', '', 1200);
    }
    this._onRight();   // the race's: splat_big, the burst, the jump trigger, 答对了, a prop from the drop table, streaks
  }

  _wrongRow(row, lane, r) {
    const R = this.RR, item = row.item, p = row.p, g = this.gates[row.gate];
    this.stats.wrong++;
    this.streak = 0;
    if (g) g.locks++;
    row.view.mark(lane, 'wrong');
    const rl = rightLane(item, p);
    if (rl >= 0) row.view.mark(rl, 'reveal');
    this.slowT = R.slow[1];
    const right = row.labels[rl] || { en: r.canonical };
    // the why, without what the line already says (the right answer): its first sentence that adds something
    const why = String(r.why || '').replace(/^不对。/, '').replace(/正确答案：[^。]*。/, '').split(/(?<=[。！？])/).map((x) => x.trim()).filter(Boolean)[0] || '';
    this._say(false, `差一点：是 ${[right.en, right.zh].filter(Boolean).join(' ')}`, why, R.verdictMs);
    if (!row.e.relearn && row.e.tries < this.P.retries) {
      G.audio?.play?.(EFFECTS.race.wrong.sfx, { volume: 0.6 });
      this._requeue({ ...row.e, tries: row.e.tries + 1, alt: true, noAns: 0 });
    } else {
      this._onWrong2(item);   // the race's: ui_toggle, the 回炉 queue, the shield or a pending detour
      if (this.pendingDetour) this._startDetour(row);
    }
  }

  // through the gap (or outside the curtains): no answer, no evidence (PLAY §1 rules 4–5) — once more right away, then
  // at the end of this checkpoint's rows, then left for another day
  _noAnswer(row) {
    const e = row.e;
    this.stats.noAnswer++;
    row.view.fade = 0.999;
    this._emit('learn:noanswer', { itemId: row.item.id, gate: this.gates[row.gate] ? this.gates[row.gate].id : 'gate:relearn', n: e.noAns + 1 });
    G.audio?.play?.('ui_back', { volume: 0.35 });
    if (e.noAns === 0) { this.queue.unshift({ ...e, noAns: 1 }); this._say(true, '没选 — 这一题马上再来一次', '游进一道幕才算答'); }
    else if (e.noAns === 1) { this._requeue({ ...e, noAns: 2 }); this._say(true, '没选 — 这一题放到这一站最后', '游进一道幕才算答'); }
    else { this.stats.skipped.push(row.item.id); this._say(true, '没选 — 这一题留到下次', ''); }
    this._checkGates();
  }
  // after the last pending entry of the same checkpoint (「换个问法」 comes later in the stretch, not straight away)
  _requeue(e) {
    let at = -1;
    for (let i = 0; i < this.queue.length; i++) if (this.queue[i].gate === e.gate) at = i;
    this.queue.splice(at + 1, 0, e);
  }

  // her ink over the row (PLAY §2 rule 5: paint.flood), a front out from the curtain she burst
  _floodRow(row, lane) {
    const P = G.paint, L = G.level;
    if (!P || !P.flood || !L) return;
    const R = this.RR, T = this.T;
    at(T, row.s, _p);
    const half = (row.lanes * R.laneW) / 2 + 0.6, c = row.c;
    const corners = [[-2.5, -half], [3.5, -half], [3.5, half], [-2.5, half]].map(([f, l]) => [_p.x + _p.tx * f + _p.rx * (c + l), _p.z + _p.tz * f + _p.rz * (c + l)]);
    const xs = corners.map((q) => q[0]), zs = corners.map((q) => q[1]);
    const y0 = _p.y - 1.2, y1 = _p.y + 1.2;
    const cells = [], ids = L.queryBlocks(Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs), this._qb || (this._qb = []));
    const inPoly = (x, z) => { let ins = false; for (let i = 0, j = 3; i < 4; j = i++) { const [xi, zi] = corners[i], [xj, zj] = corners[j]; if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) ins = !ins; } return ins; };
    for (const bid of ids) {
      const b = L.blocks[bid];
      for (let fi = 0; fi < 6; fi++) {
        const f = b.faces[fi] >= 0 ? L.faces[b.faces[fi]] : null;
        if (!f || !f.atlas || !f.turf || f.grid == null || f.n.y < 0.6) continue;
        for (let j = 0; j < f.nv; j++) for (let i = 0; i < f.nu; i++) {
          const su = (i + 0.5) * f.cu, sv = (j + 0.5) * f.cv;
          const x = f.origin.x + f.u.x * su + f.v.x * sv, y = f.origin.y + f.u.y * su + f.v.y * sv, z = f.origin.z + f.u.z * su + f.v.z * sv;
          if (y < y0 || y > y1 || !inPoly(x, z)) continue;
          cells.push(f.grid + j * f.nu + i);
        }
      }
    }
    const cx = _p.x + _p.rx * row.centers[lane], cz = _p.z + _p.rz * row.centers[lane];
    if (cells.length) P.flood({ cells: Int32Array.from(cells), polys: [corners], y0, y1 }, 0, { center: [cx, cz], y: _p.y, reach: half * 2 + 3, dur: 0.45 });
    else P.splat(_v.set(cx, _p.y + 0.1, cz), 2.2, 0, { kind: 'blast' });
  }

  // a checkpoint is done when nothing of it is left in the queue or on the road: the race's gate-open cues, her cp
  _checkGates() {
    const pending = (k) => this.queue.some((e) => e.gate === k) || this.rows.some((r) => r.gate === k && r.state !== 'done');
    while (this.cur < this.gates.length && !pending(this.cur)) {
      const g = this.gates[this.cur];
      g.state = 'open';
      this._emit('learn:gate', { id: g.id, index: g.index + 1, total: this.gates.length, locks: g.locks, opened: true });
      const a = this.match.local;
      if (a) { _v.copy(a.pos); _v.y += 0.3; G.fx?.ring?.(_v, _up, G.teamColors[0], { radius: 2.6, life: 0.5 }); }
      G.audio?.play?.('refill_full', { volume: 0.7 });
      this.cur++; this.me.cp = this.cur;
      if (this.gates[this.cur]) this.gates[this.cur].state = 'next';
      this.ui.say(`第 ${this.cur} / ${this.gates.length} 站 ✓`);
    }
    if (this.cur >= this.gates.length && !this.queue.length && !this.rows.some((r) => r.state !== 'done') && this.phase !== 'final' && this.phase !== 'done') {
      if (this.relearn.length && !this.relearnAsked) {   // 回炉: the missed items once more, with their help, before the line
        this.relearnAsked = true;
        // (the item marked _relearn like the race's 回炉门: a miss there is not queued again and takes no detour)
        const typed = [];
        for (const it of relearnPlan(this.relearn)) {
          const m = it.meta || {};
          if (m.input === 'type' || m.input === 'write') typed.push({ ...it, _relearn: true });   // (typed again on the rig, with its help)
          else this.queue.push({ gate: this.gates.length, kind: m.kind === 'pair' || m.kind === 'sym' ? 'beat' : 'lane', item: { ...it, _relearn: true }, tries: 1, noAns: 0, alt: true, relearn: true });
        }
        if (typed.length) this.queue.push({ gate: this.gates.length, kind: 'glide', items: typed, relearn: true, tries: 1, noAns: 0 });
        this.ui.say(`回炉：错过的 ${this.queue.reduce((n, e) => n + (e.kind === 'glide' ? e.items.length : 1), 0)} 题再来一次`);
        return;
      }
      this.phase = 'final';
      this._setFinish(Math.max(this.sNow + 20, this.lastEnd));
      this.ui.say('最后一段：回到起点！');
    }
  }

  // ---------------------------------------------------------------------------------------------- 滑行段 (typed items)
  // the stretch's items go to the typing rig (glide.js, or a `typed` hook handed in); the row stays shown — the tide
  // slow, the bots slow with her — until they are all answered and she is past its end
  _glide(row) {
    this.stats.glides++;
    const e = row.e, items = e.items;
    const g = this.gates[row.gate] || (e.exit ? this._exitGate(e) : this._relearnGate());
    this._emit('learn:glide', { gate: g.id, items: items.length, relearn: !!e.relearn, exit: !!e.exit });
    row.typedDone = false;
    Promise.resolve().then(() => this.typed({ items, gate: g, flow: this, row })).catch((err) => console.warn('[runner] typed', err)).then(() => { row.typedDone = true; });
  }
  // a built row taken back into the queue (to stand further on): its curtains gone, a 看板段's boards taken down
  _unbuild(r) { r.view?.dispose(); if (r.kind === 'boards' && this.gates[r.gate]) this.bw.unplace(this.gates[r.gate]); }
  _exitGate(e) { return this._exitG || (this._exitG = { id: e.signId || 'gate:write', title: '写字墙', index: this.gates.length, locks: 0, queue: [] }); }
  _relearnGate() { return this._relearnG || (this._relearnG = { id: 'gate:relearn', title: '回炉', index: this.gates.length, locks: 0, queue: [] }); }
  _glideDone(row) {
    row.state = 'done'; row.doneT = 0;
    this.strip.hide();
    // (a typing rig that took longer than the stretch: rows built behind where she now is go back to the queue)
    for (let i = this.rows.length - 1; i >= 0; i--) { const r = this.rows[i]; if (r.state === 'built' && r.sAppear < this.sNow + 2) { this._unbuild(r); this.rows.splice(i, 1); this.queue.unshift(r.e); } }
    this.lastEnd = Math.max(this.lastEnd, this.sNow + 2);
    if (this.finish && this.lastEnd + 20 > this.finish.s && this.phase !== 'final') this._setFinish(this.lastEnd + 20);
    this._checkGates();
  }

  // ---------------------------------------------------------------------------------------------- 走远路
  _startDetour(row) {
    this.pendingDetour = false;
    const R = this.RR, sec = this.R.detour, v = PLAYER.swimSpeed;
    const sFrom = row.s + 1.5, len = this.T.len, lapBase = Math.floor(sFrom / len) * len;
    const B = detourBranch(G.nav, this.T, sFrom - lapBase, { want: sec * v * R.detour.tide, reach: R.detour.reach, away: R.detour.away });
    // the rows already built ahead go back to the queue (the branch rejoins past some of them)
    for (let i = this.rows.length - 1; i >= 0; i--) { const r = this.rows[i]; if (r.state === 'built') { this._unbuild(r); this.rows.splice(i, 1); this.queue.unshift(r.e); } }
    this.stats.detours++;
    if (B) {
      const line = branchLine(B.pts);
      this.detour = { line, u: 0, sJoin: lapBase + B.sJoin, k: clamp(line.len / (sec * v), 0.45, 1), len: line.len };
      this.stats.branches++;
      this.lastEnd = lapBase + B.sJoin + 6;
      this.paintU = 0;
      this.ui.say('答错两次：墨道带你走远路', { coral: true, hold: 1 });
    } else {
      this.detour = { slow: true, t: sec };
      this.ui.say(`答错两次：墨潮慢下来 ${sec} 秒`, { coral: true, hold: 1 });
    }
    this._emit('learn:detour', { seconds: sec, branch: !!B, len: B ? +B.len.toFixed(1) : 0, reach: B ? B.reach : 0 });
  }

  // ---------------------------------------------------------------------------------------------- speed
  // the tide: full between rows, slowed in a question zone (0.6, or the beat row's tide that lands her on a downbeat),
  // the branch's own pace on a detour; × a boost after a right curtain, × the coral slow after a wrong one
  _tide(dt) {
    const R = this.RR, row = this._shown(), D = this.detour;
    let k = 1, fair = 1;
    if (D && D.line) k = D.k;
    else if (D && D.slow) { k = 0.45; if ((D.t -= dt) <= 0) this.detour = null; }
    else if (row && row.kind === 'boards') { k = R.boards.tide; fair = R.boards.tide; }   // (the 看板段: slow for reading — the bots as slow)
    else if (row && row.kind !== 'glide' && this.sNow < row.s + 0.5) k = row.tide || R.tide;
    else if (row && row.kind === 'glide') { k = R.glideTide; fair = R.glideTide; }   // (she types: slow — and the bots just as slow)
    this.tideK = damp(this.tideK, k, 3.2, dt);
    this.fairK = damp(this.fairK, fair, 3.2, dt);
    this.swimK = this.tideK * (this.boostT > 0 ? this.boostK : 1) * (this.slowT > 0 ? R.slow[0] : 1);
  }

  // ---------------------------------------------------------------------------------------------- steering
  // her intent, every sub-step: forward along the road (or the branch), sideways to her target lateral offset, in squid
  // form; jump on a swipe up and at the lap's jump-up edges; a swipe down while airborne dives back into the ink
  _steer(a, dt) {
    if (!a) return;
    const it = a.intent;
    it.fire = false; it.sub = false; it.special = false; it.cheer = false;
    if (!this.started || this.stop || !a.alive) { it.move.set(0, 0, 0); it.jump = false; it.squid = !!this.started; return; }
    const T = this.T, R = this.RR, sp = Math.hypot(a.vel.x, a.vel.z), La = clamp(sp * 0.22, 1.5, 3.0);
    let tx, tz;
    const D = this.detour;
    if (D && D.line) {
      branchAt(D.line, Math.min(D.line.len, D.u + La + 0.5), _q); tx = _q.x; tz = _q.z;
      if (!this.paintU) this.paintU = 0;
      while (this.paintU < Math.min(D.line.len, D.u + 14)) { branchAt(D.line, this.paintU, _q); this._splat(_q.x, _q.y, _q.z, _q.tx, _q.tz, R.road); this.paintU += 1.6; }
    } else {
      const s = this.sNow + La;
      at(T, s, _p);
      const [lo, hi] = this._bounds(s);
      const want = clamp(this.latT, lo, hi);
      const aim = clamp(want + clamp(want - this.dNow, -0.9, 0.9) * 0.6, lo - 0.3, hi + 0.3);
      tx = _p.x + _p.rx * aim; tz = _p.z + _p.rz * aim;
      // between rows the target eases back toward the middle of the road (the ink carries her)
      if (!this._shown() && Math.abs(this.latT) > 0.01) this.latT = damp(this.latT, 0, 0.6, dt);
    }
    let dx = tx - a.pos.x, dz = tz - a.pos.z; const dl = Math.hypot(dx, dz) || 1;
    it.move.set(dx / dl, 0, dz / dl);
    it.squid = true;   // (a squid all the way: a kid on the ink walks at 6 m/s and no swim boost reaches her)
    // the 滑行段: a kid riding the typing rig (a submerged squid is invisible; the crab special rides the same way), at
    // the glide tide's pace — her run speed × the move's magnitude (actor.js _horizontal); no swipes, only the lap's own
    // jump-up edges below
    const glide = this.glide.active;
    if (glide) { it.squid = false; it.move.multiplyScalar(glideMove()); this._jumpQ = this._diveQ = false; }
    let jump = this._jumpQ;
    if (!jump && a.grounded && !(D && D.line)) {   // the lap's jump-up edges (0.5–1.25 m): hop them like the auto-walk does
      // (a quarter second ahead: a swim jump is 1.5 m up by then, over the highest jump edge — 1.25 m — at any speed)
      const ahead = Math.max(1.2, sp * 0.25), base = Math.floor(this.sNow / T.len) * T.len;
      for (const j of T.jumps) for (const sj of [base + j, base + T.len + j]) if (sj > this.sNow + 0.2 && sj < this.sNow + ahead) jump = true;
    }
    if (this._jumpQ && !a.grounded && !a.climbing) jump = false;
    it.jump = jump; this._jumpQ = false;
    if (this._diveQ) { this._diveQ = false; if (!a.grounded && !a.climbing) { a.vel.y = Math.min(a.vel.y, -PLAYER.swimJumpVel); it.squid = true; } }
  }
  // her lateral room at s: the row's lanes in its zone, else the clear road (kept off the edges)
  _bounds(s) {
    const row = this._shown();
    // in the last metres before a row, aim by the room where the row's run-in starts (wide enough for every lane, the
    // placement made sure): the road just before it may be narrower, and an outer lane is reached diagonally
    let sr = s;
    if (row && row.centers && this.sNow >= row.s - this.RR.runIn - 6 && s < row.s - this.RR.runIn) sr = row.s - this.RR.runIn;
    const r = roomAt(this.T, this.W, sr, 0.45);
    let lo = -r.left, hi = r.right;
    // (play-9: … but never over an edge she would fall off on the way there: from where she is to where she aims, wherever
    // past the road's edge is no floor or one more than 0.5 m under the floor she aims by, the road's own room holds on
    // that side — halyard's way down from the middle deck into a three-lane row put her in the sea once a lap, LEARN §27
    // 拿不准的 17)
    _room.left = r.left; _room.right = r.right;
    fallRoom(this.T, this.W, Math.min(this.sNow, s), s, at(this.T, sr, _ry).y, 0.5, 0.45, _room); lo = -_room.left; hi = _room.right;
    if (row && row.centers && s >= row.sAppear - 2 && s <= row.s + 1.5) {
      // inside the row's lane band — unless the road is narrower than the band here (a ramp up a deck in the row's
      // reading zone, halyard): then the road wins. (It used to put her on the first lane's line, off the ramp against
      // the deck's side, where she stayed: play-4's w1d3 gate=1 audits, both orientations.)
      const lo2 = Math.max(lo, row.centers[0] - 0.35), hi2 = Math.min(hi, row.centers[row.centers.length - 1] + 0.35);
      if (lo2 <= hi2) { lo = lo2; hi = hi2; }
    }
    else if (row && row.kind === 'glide') { this.latT = damp(this.latT, 0, 1.5, 1 / 60); }   // (the ink carries her down the middle while she types)
    // onto the middle of the road for a jump-up edge just ahead and for the line (the lap's own way up a ledge / onto the
    // start deck is the route's line; a metre off it the ledge may be a wall)
    const T = this.T, base = Math.floor(s / T.len) * T.len;
    let tight = this.phase === 'final' && this.finish && this.finish.s - s < 14;
    for (const j of T.jumps) for (const sj of [base + j, base + T.len + j]) if (sj > s - 1 && sj - s < 5) tight = true;
    if (tight) { lo = Math.max(lo, -0.35); hi = Math.min(hi, 0.35); if (lo > hi) lo = hi = 0; }
    return [lo, hi];
  }

  // ---------------------------------------------------------------------------------------------- the ink road
  // a roller's straight-edged band (paint kind 'roll') every ~1.5 m ahead of her: the road half-width between rows,
  // the row's lanes in its zone. Real ink: she swims submerged on it; walls in reach take it too (so she can climb).
  _paint() {
    const target = this.sNow + this.RR.paintAhead;
    if (this.paintS < this.sNow - 4) this.paintS = this.sNow - 4;
    if (this.paintS < target) this._paintRange(this.paintS, target);
  }
  _paintRange(s0, s1) {
    const R = this.RR;
    let s = s0;
    while (s < s1) {
      const { c, half } = this._roadAt(s);
      at(this.T, s, _p);
      this._splat(_p.x + _p.rx * c, _p.y, _p.z + _p.rz * c, _p.tx, _p.tz, half);
      s += Math.max(0.8, 2 * 0.55 * (half / 0.62) * 0.75);
    }
    this.paintS = Math.max(this.paintS, s);
  }
  _roadAt(s) {
    const R = this.RR;
    for (const r of this.rows) if (r.centers && r.state !== 'done' && s >= r.sAppear - 2 && s <= r.s + 2.5) return { c: r.c, half: (r.lanes * R.laneW) / 2 + 0.25 };
    return { c: 0, half: R.road };
  }
  _splat(x, y, z, tx, tz, half) {
    if (!G.paint) return;
    G.paint.splat(_v.set(x, y + 0.35, z), half / 0.62, 0, { kind: 'roll', stretch: _v2.set(tx, 0, tz), seed: Math.random() });
  }

  // rows she has passed fade out and go
  _reap(dt) {
    for (let i = this.rows.length - 1; i >= 0; i--) {
      const r = this.rows[i];
      if (r.state !== 'done') continue;
      r.doneT = (r.doneT || 0) + dt;
      if (r.view) r.view.fade = Math.max(0, 1 - Math.max(0, r.doneT - 0.9) / 0.6);
      if (r.doneT > 1.6) { r.view?.dispose(); if (r.kind === 'boards' && this.gates[r.gate]) this.bw.free(this.gates[r.gate]); this.rows.splice(i, 1); }
    }
  }

  // ---------------------------------------------------------------------------------------------- props
  // 超级跳 jumps the road (never a row): to just before the next row's reading zone, at most 34 m; every other prop is
  // the race's own (useProp: hint / echo / shield / curtain / bomb / lane)
  useProp(i) {
    const id = this.bag[i]; if (!id) return;
    if (propOf(id).effect !== 'skip') return super.useProp(i);
    const a = this.match.local, next = this.rows.find((r) => r.state === 'built');
    if (this._shown() || !a || !a.canSuperJump() || this.detour) { this.ui.say('先过了这一行再跳'); return; }
    const s = Math.min(next ? next.sAppear - 4 : this.sNow + 34, this.sNow + 34);
    if (s - this.sNow < 8) { this.ui.say('前面就有题了'); return; }
    this.bag.splice(i, 1); this.ui.setBag(this.bag);
    this._paintRange(Math.max(this.paintS, s - 4), s + 6);
    at(this.T, s, _p);
    a.superJump(new THREE.Vector3(_p.x, _p.y, _p.z), { instant: true });
    this.leapS = s;
    this._emit('learn:propUse', { id, effect: 'skip' });
  }

  // ---------------------------------------------------------------------------------------------- the line
  _finishDone() {
    if (this.phase === 'done') return;
    this.me.finish = this.clock;
    const order = [...this.racers, this.me].slice().sort((x, y) => (x.finish != null && y.finish != null ? x.finish - y.finish : x.finish != null ? -1 : y.finish != null ? 1 : (y.cp - x.cp) || ((y.progress || 0) - (x.progress || 0)))).map((r) => r.id);
    this.place = order.indexOf('me') + 1;
    this.phase = 'done'; this.finishT = 1.8; this.stop = true;
    const a = this.match.local;
    a.character.setDance?.('victory');
    G.audio?.play?.(this.place === 1 ? EFFECTS.race.finish.sfx : EFFECTS.race.botFinish.sfx, { volume: 0.85 });
    this.ui.say(this.place === 1 ? '第 1 名！' : `第 ${this.place} 名 · 跑完了`);
    this._emit('learn:finish', { place: this.place, clock: +this.clock.toFixed(1), order });
  }

  _results() {
    this.finishT = -1;
    this.match.paused = true;   // (the run is over: the results card, as every form ends)
    G.input?.exitLock?.();
    this.ui.say(''); this.strip.hide();
    const summary = { gates: this.gates.length, visited: this.gates.length, signs: null, seen: 0, scored: this.scoredN, firstRight: this.firstRight, relearn: this.relearn.length, relearnRight: this.relearnRight };
    const stars = starsOf(summary);
    const st = writeStars(this.dayKey, stars, null, { trophy: this.place });
    let dueIds = []; try { dueIds = store.due(this.level.weekRef || this.week); } catch (e) { dueIds = []; }
    const byId = new Map(); for (const g of this.level.gates) for (const it of g.items) byId.set(it.id, it);
    const due = dueIds.map((id) => byId.get(id)).filter(Boolean).map((it) => ({ en: it.en, zh: it.zh }));
    const data = { done: this.right.size, total: this.total, due, firsts: this.firsts, firstRight: this.firstRight, scored: this.scoredN, locks: this.gates.reduce((n, g) => n + g.locks, 0), week: this.week, day: this.day, form: 'race', runner: true, place: this.place, clock: +this.clock.toFixed(1), stars, starsBefore: st.before, relearn: this.relearn.length, relearnRight: this.relearnRight, stats: { ...this.stats, skipped: this.stats.skipped.length } };
    this._emit('learn:done', data);
    this._hudOn = true;
    const H = this.hud;
    H?.start?.(this);
    H?.results(data, {
      again: () => G.game?.api?.startLearn?.({ week: this.week, day: this.day, kind: 'race' }),
      menu: () => G.game?.api?.quitMatch?.(),
    });
    this.ui.resultsExtra([
      { b: `第 ${this.place} 名`, t: `· 用时 ${fmtClock(this.clock)}（名次只是奖杯，不进星）` },
      { b: `${this.firstRight} / ${this.scoredN}`, t: '首答答对' },
      this.stats.beatRows ? { b: `${this.stats.onBeat} / ${this.stats.beatRows}`, t: '节拍行踩在拍子上（只管加速，不管对错）' } : '',
      this.stats.glides ? { b: `${this.glide.stats.right} / ${this.glide.stats.asked}`, t: `滑行段打字答对（${this.stats.glides} 段${this.glide.stats.hinted ? `，用了 ${this.glide.stats.hinted} 次提示` : ''}）` } : '',
      this.relearn.length ? { b: `${this.relearnRight} / ${this.relearn.length}`, t: '回炉清了' } : '没有要回炉的',
      stars > st.before ? `星星 ${st.before} → ${stars}` : `星星 ${stars}（只涨不掉）`,
    ].filter(Boolean), stars);
  }

  // ---------------------------------------------------------------------------------------------- warm-up, audits, end
  // the curtain shader and a label's material compiled under the match fade (no shader compile on the road — PLAY §7)
  _warm() {
    try {
      if (!G.renderer || !G.camera || typeof document === 'undefined') return;
      const fake = { s: 0, lanes: 2, c: 0, centers: laneCenters(2), labels: [{ en: '热身', zh: '' }, { en: 'warm up', zh: '热身' }], banner: false, D: 4 };
      const v = new RowView(fake, this.T); v.setVisible(true);
      G.scene.add(v.group); G.renderer.compile(v.group, G.camera); G.scene.remove(v.group); v.dispose();
    } catch (e) { console.warn('[runner] warm', e); }
    this.glide.warm();   // (the typing rig, the ink word and the keyboard: built and compiled now, not on the road)
    this.bw.warm();      // (the boards' slab / post / face materials)
  }
  rightAnswer() {
    const r = this._shown();
    if (r && r.kind === 'glide') { const C = this.glide.cur; return C && !C.answered ? rightAnswerOf(C.item, C.p) : null; }   // (the text to type)
    return r && r.item ? rightLane(r.item, r.p) : null;
  }
  debug() {
    const a = this.match.local, row = this._shown();
    return {
      form: 'runner', phase: this.phase, started: this.started, paused: this.match.paused, cur: this.cur, gates: this.gates.length, sea: this.seaN || 0,
      s: +this.sNow.toFixed(2), d: +this.dNow.toFixed(2), lat: +this.latT.toFixed(2), swimK: +this.swimK.toFixed(3), tide: +this.tideK.toFixed(3),
      speed: a ? +Math.hypot(a.vel.x, a.vel.z).toFixed(2) : 0, submerged: !!(a && a.submerged), form_: a ? a.form : null, grounded: !!(a && a.grounded),
      lap: +this.T.len.toFixed(1), laps: this.laps, lapsPlan: this.lapsPlan, finishS: this.finish ? +this.finish.s.toFixed(1) : null,
      row: row ? { kind: row.kind, item: row.item ? row.item.id : null, lanes: row.lanes, c: row.c, s: +row.s.toFixed(1), sAppear: +row.sAppear.toFixed(1), right: row.item && row.p ? rightLane(row.item, row.p) : null, centers: row.centers, banner: row.banner, lead: row.lead } : null,
      rows: this.rows.map((r) => ({ kind: r.kind, state: r.state, s: +r.s.toFixed(1), lanes: r.lanes })), queue: this.queue.length,
      detour: this.detour ? { branch: !!this.detour.line, u: this.detour.u != null ? +this.detour.u.toFixed(1) : null, len: this.detour.len || 0, k: this.detour.k || 0 } : null,
      clock: +this.clock.toFixed(1), bag: this.bag.slice(), stats: { ...this.stats, skipped: this.stats.skipped.length },
      racers: this.racers.map((r) => ({ id: r.id, cp: r.cp, state: r.state, finish: r.finish })), me: { cp: this.me.cp, finish: this.me.finish, place: this.place || null },
      fairK: +this.fairK.toFixed(2), glide: this.glide.debug(), boards: this.bw.debug(), cam: { lift: +this.cam.lift.x.toFixed(2), tilt: +this.cam.tilt.toFixed(2), occl: { ...this.cam.occl } },
    };
  }
  effects() { return { cur: this.cur, bag: this.bag.length, streak: this.streak, detour: !!this.detour, relearn: this.relearn.length }; }

  dispose() {
    for (const u of this._unsub || []) u();
    this._uninstall?.();
    for (const r of this.rows) r.view?.dispose();
    this.rows = [];
    this.cam.release(G.rig, this.match.local);
    this.glide.dispose();
    this.bw.dispose(); this.prepS?.dispose();
    this.mark.dispose();
    stopVoice(); this.strip.dispose(); this.tips.end();
    G.hud?.el?.classList.remove('is-learn', 'is-runner');
    G.touch?.el?.classList.remove('is-runner');
    super.dispose();
  }
}
RunnerFlow.typed = null;
