// 关卡学习 — 对抗赛 duel (docs/LEVELS.md §2.3): Zone Control, her + 3 team-mate bots against 4 bots, on the stage's
// zones geometry, the centre zone only (no rotation). A gate is a round: between rounds the 备战 boards show the
// step's content (play-8: M6 boards in front of her — the match runs on, the clock and the zone wait, the bots pose);
// in a round the questions come to her on a cadence
// (LEARN.duel.askGap) while the zone counts down — a right answer floods the neediest patch of the live zone with her
// ink (2.5 m, +0.5 per streak, 4.5 cap) and charges her special; a wrong one costs nothing (the same item comes back
// reworded; a second miss joins the 回炉 queue). Her team-mates play the zone with INKWAVE's own zone brains and never
// answer; the other side plays too, and every duelCadence seconds rolls a BOT_ANSWER die — a hit inks duelFlood m.
// The round ends when her questions run out, at a knockout, or when its clock (the gate's course minutes, clamped)
// runs down; a day is as many rounds as gates, then the 回炉 round when something was missed, then the results.
// Stars and evidence come from the questions alone; the rounds won are a trophy.
//
// 题即玩法 play-5 (docs/PLAY.md §5.3, LEARN §24): a question is a thing over the contested zone — ink targets (every
// choice), the 打字蟹 with a shield (anything typed), a flip card on a review day (src/learn/play/arena/) — never a hold,
// never match.paused, never a card; the first deliberate round on the right target is the answer, the zone floods. The
// one judging path is _judgeRecord below (play/judge.js). play-8: the 备战 between rounds is M6 boards, not a paused card.
import * as THREE from 'three';
import { G, emit } from '../../core/ctx.js';
import { LEARN } from '../../config.js';
import { ZoneControl } from '../../game/zones.js';
import { zonePlan } from '../../game/bots.js';
import { LearnFlow } from '../flow.js';
import { prompt, store } from '../api.js';
import { BOT_ANSWER, EFFECTS } from '../design.js';
import { duelFlood, streakKind, propOnRight, useProp, relearnPlan, starsOf, writeStars, fmtClock, rightAnswerOf, relearnTip, cardFor, carryLeft } from './common.js';
import { gateSpecs } from '../play/wire/boards.js';   // the step's M6 boards (the 备战 between rounds, play-8)
import { noteSpec } from '../play/board/paint.js';
import { judgeRecord } from '../play/judge.js';   // the one judging path (play-8)
import { FormsUi } from './ui.js';
import { ArenaHost } from '../play/arena/host.js';
import { arenaAltPrompt } from '../play/arena/alt.js';

const _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

// the live turf cells of a zone with their world positions (the flood region of a patch is a subset of them)
export function zoneCellsXYZ(zone) {
  const L = G.level, cells = zone.cells, n = cells.length;
  const faces = L.faces.filter((f) => f.turf && f.atlas).sort((a, b) => a.grid - b.grid), starts = faces.map((f) => f.grid);
  const xs = new Float32Array(n), ys = new Float32Array(n), zs = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const k = cells[i];
    let lo = 0, hi = starts.length - 1;
    while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (starts[mid] <= k) lo = mid; else hi = mid - 1; }
    const f = faces[lo], loc = k - f.grid, s = ((loc % f.nu) + 0.5) * f.cu, t = (((loc / f.nu) | 0) + 0.5) * f.cv;
    xs[i] = f.origin.x + f.u.x * s + f.v.x * t; ys[i] = f.origin.y + f.u.y * s + f.v.y * t; zs[i] = f.origin.z + f.u.z * s + f.v.z * t;
  }
  return { xs, ys, zs };
}

export class DuelFlow extends LearnFlow {
  constructor(match, opts = {}) {
    super(match, opts);   // B: the level and hud.start; _place() below makes the gates rounds (no route)
    this.form = 'duel';
    this.D = LEARN.duel;
    this.model = BOT_ANSWER[match.opts.difficulty] || BOT_ANSWER.normal;
    this.rnd = Math.random;
    this.group.visible = false;   // the zone marks are the "gate"
    this.ui = new FormsUi(G.hud); this.ui.start(); this.ui.onUse = (i) => this.useProp(i);
    this.Z = match.zones;
    // a knockout ends the round, never the match (zones.js calls match.endZones)
    match.endZones = (winner, reason) => this._roundEnd(winner, reason);
    this.round = -1; this.prepOn = false; this.asking = null;
    this.askT = 0; this.enemyT = 0; this.nextT = -1; this.roundT = 0;
    this.bag = []; this.shield = false; this.hintNext = false; this.echoNext = false;
    this.streak = 0; this.rightN = 0; this.firstRight = 0; this.relearn = []; this.relearnRight = 0; this.relearnAsked = false;
    this.wins = 0; this.rounds = []; this.enemyRights = 0;
    this.scoredN = new Set(this.level.gates.flatMap((g) => g.items.filter((it) => it.meta && it.meta.scored).map((it) => it.id))).size;
    this._prevSpecial = false; this._clockTxt = ''; this._cells = null; this._askWait = 0;
    this.phase = 'prep';
    // 题即玩法 (play-5): the zone's questions are things over the zone — the host asks them, judges through _judgeRecord
    // (play-8: edges — the sight lines run to each label's lower edge, a label behind a low wall is moved; settle — the
    // cluster comes up only once the rig's blend back from a typed question is over: play-6's two, as versus2 has them)
    this.arena = match.mode === 'learn' ? new ArenaHost(this, { mode: 'zone', anchor: (out) => this._zoneCentre(out), edges: true, settle: true }) : null;
    this._startPrep();
  }
  _farFromZone(a) { this._zoneCentre(_v); return Math.hypot(_v.x - a.pos.x, _v.z - a.pos.z) > LEARN.arena.askNear; }
  // the live zone's centre on its floor (the cluster floats LEARN.arena.lift over it)
  _zoneCentre(out) {
    const Z = this.Z, z = Z && Z.active && Z.active.zones[0], c = z ? z.center : null;
    if (c) return out.set(c[0], c[1], c[2]);
    const g = this.gates[this.round];
    return g ? out.copy(g.pos) : out.set(0, 0, 0);
  }

  // rounds, not route points: one per gate, standing at the centre zone
  _place() {
    const Z = this.match.zones, c = Z && Z.objectives[0].zones[0].center;
    const pos = c ? new THREE.Vector3(c[0], c[1], c[2]) : new THREE.Vector3();
    this.path = [];
    this.gates = this.level.gates.map((def, k) => ({ ...def, index: k, pathIndex: 0, node: -1, pos: pos.clone(), state: k === 0 ? 'next' : 'locked', locks: 0, queue: def.items.map((it) => ({ ...it, _tries: 0, _form: null })) }));
  }
  prep() { return this.prepOn; }

  // ---------------------------------------------------------------------------------------------- rounds
  // 备战 (play-8): the match is never paused for it — the coming round's clock is held on the HUD, the zone counts nothing
  // (a round's ZoneControl is made when it starts; the first one is kept still by its winner field until then), the bots
  // stand and pose (their brains do not run: _idleBots), and she walks as she likes; the step's boards come to her (the
  // arena's showPrep: M6 boards, 「开始这一轮」 on the strip, or walking on)
  _startPrep() {
    this.round++;
    const g = this.gates[this.round];
    if (!g) { this._dayDone(); return; }
    this.prepOn = true; this.phase = 'prep'; this._prepShown = false;
    this.roundT = this.level.short ? 60 : Math.max(this.D.roundMin, Math.min(this.D.roundMax, (g.minutes || 1) * 60));
    if (this.round === 0 && this.Z && this.Z.winner == null) { this.Z.winner = -1; this._zStill = true; }
    this._idleBots(true);
    this.arena?.prep(g);   // (the round's label atlas is drawn while the boards are up: nothing drawn mid-round)
    for (const a of this.match.actors) if (a.isBot && a.alive) a.character.setDance?.('lobby_pose');
    this._emit('learn:round', { round: this.round + 1, total: this.gates.length, gate: g.id, state: 'prep' });
  }
  // what the 备战 boards say: the step's own boards (words / sounds / the lesson / the passage — the puzzle's gateSpecs),
  // else a note — the 今日小考 (what it is, that it is optional), the 回炉 round (what comes back), a step with no board
  _prepSpecs(g) {
    if (g._restGate) return [noteSpec('剩下的题', `上一轮没问到的 ${g.items.length} 个再来一轮：${g.items.map((it) => (it.en.length > 48 ? it.zh : it.en)).join('、')}`, '再一轮')];
    if (g._relearnGate) return [noteSpec('回炉门', `错过的 ${g.items.length} 个再来一次：${g.items.map((it) => (it.en.length > 48 ? it.zh : it.en)).join('、')}`, '回炉 · 再来一次')];
    if (this.level.quiz) return [noteSpec('今日小考 · 傍晚一轮对抗赛', `${g.items.length} 题：今天学的、到期的、答错过的。答对一题，区域里最缺墨的那块涂成你的颜色。可做可不做；今天第一次答的照样记进进度，课上答过的再答只算练习。`, '今日小考')];
    let specs = []; try { specs = gateSpecs(g, this.level); } catch (e) { specs = []; }
    return specs.length ? specs : [noteSpec(`备战 · ${g.title || ''}`, `这一轮 ${g.items.length} 题：答对一题，区域里最缺的那块涂成你的墨。`, '备战')];
  }
  _showPrep(g) {
    this._prepShown = true;
    const head = g._relearnGate ? '回炉门 · 最后一轮' : g._restGate ? '剩下的题 · 再一轮' : this.level.quiz ? '今日小考' : `备战 · 第 ${this.round + 1} / ${this.gates.length} 轮`;
    const go = g._relearnGate ? '开始回炉' : this.level.quiz ? '开始小考' : this.round === 0 ? '开始第 1 轮' : '开始这一轮';
    if (this.arena) this.arena.showPrep(this._prepSpecs(g), { head, go, onGo: () => this._roundStart() });
    else this._roundStart();
  }
  // the bots stand between rounds without the match being paused: their brains are switched off (their intents zeroed
  // each frame instead) and switched back on when the round starts
  _idleBots(on) {
    for (const a of this.match.actors) {
      if (!a.bot || a.isLocal) continue;
      if (on && !a._learnIdle) { const it = a.intent; a._learnIdle = true; a.bot.update = () => { it.move.set(0, 0, 0); it.fire = it.squid = it.sub = it.jump = it.special = false; }; }
      else if (!on && a._learnIdle) { a._learnIdle = false; delete a.bot.update; }
    }
  }
  _roundStart() {
    const m = this.match, g = this.gates[this.round];
    if (this.phase !== 'prep') return;
    this.prepOn = false; this.phase = 'round';
    this._idleBots(false);
    for (const a of m.actors) a.character.setDance?.(null);
    // the round's clock: the gate's course minutes, clamped (a shortened level: 60 s); the match never reaches 0 itself
    m.time = this.roundT; m.duration = this.roundT; m.lastMinuteFired = false; m.lastCount = 99;
    // a fresh centre-only zone control per round (counts at 100, the zone wiped to bare floor, no rotation)
    if (this.round > 0) { this.Z = new ZoneControl(m); m.zones = this.Z; }
    if (this._zStill) { this._zStill = false; this.Z.winner = null; }
    this.Z.final = true; this.Z.nextSwap = Infinity;
    for (const z of this.Z.active.zones) this.Z._flood(z, -1);
    this._cells = this.Z.active.zones.map((z) => zoneCellsXYZ(z));
    this.askT = this.D.askGap; this.enemyT = this.model.duelCadence * 0.7;
    G.hud?.banner?.('go', '开始');
    G.audio?.play?.('go_horn', { volume: 0.7 });
    G.input?.requestLock?.(); if (G.game) G.game._relock = true;
    this._emit('learn:round', { round: this.round + 1, total: this.gates.length, gate: g.id, state: 'start', seconds: this.roundT });
  }
  _roundEnd(winner, reason) {
    if (this.phase !== 'round') return;
    const g = this.gates[this.round], Z = this.Z;
    this.phase = 'between'; this.asking = null;
    this.arena?.gateOpened(g);   // (its objects go, the rig unmounts, the lens is hers)
    Z.winner = winner; Z.reason = reason;   // (freezes the rules; a knockout already set them)
    g.state = 'open';
    const res = { round: this.round + 1, gate: g.id, winner, reason, counts: [Math.ceil(Z.count[0]), Math.ceil(Z.count[1])], left: g.queue.length };
    this.rounds.push(res);
    if (winner === 0) this.wins++;
    this._emit('learn:gate', { id: g.id, index: g.index + 1, total: this.gates.length, locks: g.locks, opened: true });
    this._emit('learn:round', { ...res, state: 'end' });
    this.hud?.hide(); this.hud?.el.classList.remove('is-walk');
    const E = EFFECTS.duel.round.sfx;
    G.audio?.play?.(E[0], { volume: 0.7 });
    setTimeout(() => G.audio?.play?.(E[1], { volume: 0.6 }), 500);
    setTimeout(() => { G.audio?.play?.(E[2], { volume: 0.7 }); G.hud?.banner?.('custom', winner === 0 ? '这一轮：我们赢了！' : winner === 1 ? '这一轮：对面先数完，没关系' : '这一轮：打平'); }, 1300);
    this.ui.say(`第 ${this.round + 1} 轮 · 我们 ${res.counts[0]} / 对面 ${res.counts[1]}`, { hold: 1 });
    // a round the zone count ended early: its unasked items go to the front of the next round, or make a round of their own
    // after the last one (forms/common.js carryLeft) — every item of the day is asked at least once
    carryLeft(this.gates, this.round, g.queue.splice(0));
    // after the last gate: the 回炉 round when something was missed, then the results
    if (this.round === this.gates.length - 1 && this.relearn.length && !this.relearnAsked) {
      this.relearnAsked = true;
      const items = relearnPlan(this.relearn).map((it) => ({ ...it, _tries: 1, _form: 'alt', _relearn: true }));
      this.gates.push({ id: 'gate:relearn', title: '回炉门', index: this.gates.length, pathIndex: 0, node: -1, pos: g.pos.clone(), state: 'locked', locks: 0, items, queue: items, minutes: 1, _relearnGate: true });
    }
    this.nextT = 2.6;
  }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    this.t += dt;
    this._pourInk();
    this.arena?.update(dt);   // (every frame, paused or not: it waits itself)
    const m = this.match;
    if (this.finishT >= 0) { this.finishT -= dt; if (this.finishT < 0) this._results(); return; }
    if (this.phase === 'done' || m.state !== 'playing') return;
    // (备战 and the pause after a round: the match runs on, its clock held — it never runs out between rounds)
    if (this.prepOn || this.phase === 'between') m.time = Math.max(m.time, this.prepOn ? this.roundT : 1);
    if (this.prepOn) {
      if (!this._prepShown) this._showPrep(this.gates[this.round]);
      const txt = `备战 · 第 ${this.round + 1} / ${this.gates.length} 轮`;
      if (txt !== this._clockTxt && G.hud?.timerTxt) { this._clockTxt = txt; G.hud.timerTxt.textContent = txt; }
      return;
    }
    if (this.phase === 'between') { this.nextT -= dt; if (this.nextT <= 0) { this.nextT = -1; this.ui.say(''); this._startPrep(); } return; }
    // the round: our own clock (the match's time is the display; it never reaches 0 on its own)
    if (m.time - dt <= 0.05) { m.time = 0.06; const L = this.Z.losing(); this._roundEnd(L < 0 ? -1 : 1 - L, 'time'); return; }
    this.Z.nextSwap = Infinity;
    const txt = `第 ${this.round + 1} 轮 · ${fmtClock(m.time)}`;
    if (txt !== this._clockTxt && G.hud?.timerTxt) { this._clockTxt = txt; G.hud.timerTxt.textContent = txt; }
    // the other side "answers" on its cadence (never her question)
    this.enemyT -= dt;
    if (this.enemyT <= 0) { this.enemyT = this.model.duelCadence; if (this.rnd() < this.model.correct) this._enemyInk(); }
    const a = m.local;
    this._propKey(a);
    const g = this.gates[this.round];
    if (!this.asking) {
      if (!g.queue.length) { this.askT -= dt; if (this.askT <= 0) this._roundEnd(this.Z.losing() < 0 ? -1 : 1 - this.Z.losing(), 'answered'); return; }
      // (题即玩法: the cluster floats over the zone — a question waits up to LEARN.arena.askWait s for her to come within
      // askNear m of it; she is never made to wait longer, the cluster then comes up towards it, within her shot)
      if (a.alive) { this.askT -= dt; if (this.askT <= 0) { if (this.arena && this._farFromZone(a) && (this._askWait += dt) < LEARN.arena.askWait) return; this._askWait = 0; this._ask(g); } }
    }
  }

  // ---------------------------------------------------------------------------------------------- her questions
  _ask(g) {
    const item = g.queue.shift();
    const p = cardFor(g, item, () => prompt(item), () => this._altPrompt(item));
    if (item._relearn) { const tip = relearnTip(item); p.zh = [tip.zh, p.zh].filter(Boolean).join('　'); p._tip = tip; }
    if (this.hintNext && p.type !== 'choice' && !p._flip) { this.hintNext = false; p.zh = ['提示：' + ((item.meta && (item.meta.hint || item.meta.zhFull)) || item.zh || ''), p.zh].filter(Boolean).join('　'); p._hinted = true; }
    this.asking = { gate: g, item, p };
    this.asked++;
    this._emit('learn:question', { itemId: item.id, gate: g.id, type: p.type, form: item._relearn ? 'relearn' : item._form || 'normal' });
    // 题即玩法: the question is a thing over the zone — she keeps playing (no hold, no pause, no card)
    if (!this.arena || !this.arena.canAsk(g, item, p)) {   // (none in the three weeks: tests/learn/play-arena.test.mjs — passed over, never a card)
      console.warn('[duel] no station for', item.id, p.type);
      this._after(); return;
    }
    G.audio?.play?.('ui_confirm', { volume: 0.6 });
    this.arena.ask(g, item, p);
    if ((this.echoNext || (p._tip && (p._tip.slow || p._tip.speakBoth))) && p.tts) {
      this.echoNext = false;
      const again = p._tip && p._tip.speakBoth && item.meta && item.meta.pair ? item.meta.pair.filter((w) => w !== p.tts)[0] : p.tts;
      setTimeout(() => { if (this.asking && this.asking.item === item) this.arena.say(again || p.tts); }, 1900);
    }
  }
  rightAnswer() { return this.asking ? rightAnswerOf(this.asking.item, this.asking.p) : null; }
  firstsN() { return this.firsts; }

  // The one judging path (PLAY §1 rule 2), whatever asked — a round on an ink target, the typed sheet, her rating on a
  // flip card: judge (B's mapping of the reworded forms) → the day's first answer into the store (hinted: a 墨雨 hint or the
  // keyboard's 提示 → H) → the duel's consequences (the flood, the streak, the retry / 回炉, the shield). Same shape as
  // flow.js's: { r, first, again }. (After play-wire's _judgeRecord(…, o) merges, the first three lines can be super's.)
  _judgeRecord(g, item, p, ans, o = {}) {
    // (nothing waits in a round: no held sentence here — a typed sentence is judged as it is shot)
    const { r, first, hinted } = judgeRecord({ item, p, ans, o: { judged: o.judged, hinted: o.hinted }, store });
    if (first) { this.firsts++; if (r.ok) this.firstRight++; }
    if (r.ok) this.right.add(item.id);
    this._emit('learn:answer', { itemId: item.id, ok: r.ok, first, gate: g.id, hinted, relearn: !!item._relearn, flip: !!p._flip });
    let again = false;
    if (r.ok) { if (item._relearn) this.relearnRight++; this.streak++; this.rightN++; this._onRight(); }
    else if (p._flip) { item._flipTyped = true; g.queue.unshift(item); again = true; G.audio?.play?.('ui_toggle', { volume: 0.5 }); }   // 不记得: type it right away
    else {
      this.streak = 0; g.locks++;
      if (!item._relearn && item._tries < this.P.retries) { item._tries++; item._form = 'alt'; g.queue.push(item); again = true; G.audio?.play?.(EFFECTS.duel.wrong.sfx, { volume: 0.6 }); }
      else { G.audio?.play?.(EFFECTS.duel.wrong2.sfx, { volume: 0.6 }); if (!item._relearn) this.relearn.push(item); if (this.shield) { this.shield = false; this.enemyT += this.model.duelCadence; this.ui.say('护盾：对面这一次没得「答题」'); } }
    }
    return { r, first, again };
  }
  // the arena's stations call this when their verdict has been shown (the puzzle's name for it): the next question
  _askNext() { if (this.arena) this.arena.clear(); this._after(); }
  // the other form of a missed item: the arena's (a word's 回炉 choice stays ink balls, a dictation is heard slowly), else B's
  _altPrompt(item) {
    if (this.arena) { const p = arenaAltPrompt(this.gates, item); if (p) return p; }
    return super._altPrompt(item);
  }
  _after() {
    this.asking = null; this.askT = this.D.askGap;
    this.hud?.hide(); this.hud?.el.classList.remove('is-walk');
  }

  // a right answer: the neediest patch of the live zone floods with her ink, her special charges, a prop may drop
  _onRight() {
    const a = this.match.local, E = EFFECTS.duel.right;
    const r = duelFlood(this.streak);
    const at = this._flood(0, r);
    a.special = Math.min(a.specialCost(), a.special + E.special);
    G.audio?.play?.(E.sfx, { volume: 0.75 });
    a.character.trigger?.(E.trigger);
    _v.copy(a.pos); _v.y += 0.4; G.fx?.burst?.(_v, _up, G.teamColors[0], { count: 16, speed: 5, size: 0.12, spread: 0.9 });
    G.hud?.feed?.({ text: `${E.feed} · 区域涂了 ${r} 米`, color: G.teamHex[0] });
    const got = propOnRight('duel', this.rightN, this.streak, this.bag, this.rnd);
    if (got.drop) { this.bag.push(got.drop); this.ui.setBag(this.bag, this.bag.length - 1); this.ui.say(`拿到道具：${useProp(got.drop).zh}`); }
    const sk = streakKind(this.streak);
    if (sk === 'streak3') { a.special = a.specialCost(); G.audio?.play?.(EFFECTS.duel.streak3.sfx, { volume: 0.8 }); if (!this.bag.includes('shield') && this.bag.length < LEARN.props.duel.hold + 1) { this.bag.push('shield'); this.ui.setBag(this.bag, this.bag.length - 1); } this.ui.say('连对 3 题 · 特殊槽满：护盾到手'); }
    if (sk === 'streak5') { G.audio?.play?.(EFFECTS.duel.streak5.sfx, { volume: 0.8 }); a.character.setDance?.('victory'); setTimeout(() => a.character.setDance?.(null), 1000); this.ui.say('连对 5 题！'); }
    this._emit('learn:ink', { team: 0, radius: r, at, share: this.Z.active.zones.map((z) => z.share.slice()) });
  }
  // the other side's "answer": duelFlood m of their ink on the patch they need most
  _enemyInk() {
    this.enemyRights++;
    const at = this._flood(1, this.model.duelFlood);
    G.hud?.feed?.({ text: '对面答对了一题', color: G.teamHex[1] });
    this._emit('learn:ink', { team: 1, radius: this.model.duelFlood, at });
  }
  // flood radius r of the live zone round the team's neediest spot (zonePlan's hotspot; else the zone centre)
  _flood(team, r) {
    const Z = this.Z, zi = Z.active.zones[0].id, z = Z.zones[zi], C = this._cells && this._cells[Z.active.zones.indexOf(z)];
    let hs = null; try { hs = zonePlan()?.hotspot(zi, team); } catch (e) { hs = null; }
    const cx = hs ? hs.x : z.center[0], cz = hs ? hs.z : z.center[2], cy = hs ? hs.y : z.center[1];
    const cells = [];
    if (C) for (let i = 0; i < z.cells.length; i++) if (Math.hypot(C.xs[i] - cx, C.zs[i] - cz) <= r && Math.abs(C.ys[i] - cy) < 2.5) cells.push(z.cells[i]);
    if (cells.length) G.paint?.flood?.({ cells: Int32Array.from(cells), polys: z.def.polys || [z.def.poly], y0: z.def.y0, y1: z.def.y1 }, team, { center: [cx, cz], y: cy, reach: r + 0.3, dur: 0.5 });
    else G.paint?.splat?.(_v.set(cx, cy + 0.05, cz), r * 0.8, team, { kind: 'blast' });
    G.fx?.ring?.(_v.set(cx, cy + 0.1, cz), _up, G.teamColors[team], { radius: r, life: 0.5 });
    Z.sampleT = 0;
    return [+cx.toFixed(1), +cz.toFixed(1), cells.length];
  }

  // ---------------------------------------------------------------------------------------------- props
  _propKey(a) {
    const sp = !!a.intent.special;
    if (sp && !this._prevSpecial && this.bag.length) { this.useProp(0); a.intent.special = false; }
    this._prevSpecial = sp;
  }
  useProp(i) {
    const id = this.bag[i]; if (!id) return;
    const P = useProp(id);
    this.bag.splice(i, 1); this.ui.setBag(this.bag);
    switch (P.effect) {
      case 'hint': this.hintNext = true; this.ui.say('墨雨：下一题先给提示（记为提示作答）'); break;
      case 'replay': this.echoNext = true; this.ui.say('回声：下一题多听一遍'); break;
      case 'no-detour': this.shield = true; this.ui.say('护盾：下一次答错，对面得不到「答题」'); break;
      default: break;
    }
    this.match.local.special = 0;
    G.audio?.play?.(P.sfx, { volume: 0.8 });
    this._emit('learn:propUse', { id, effect: P.effect });
  }

  // ---------------------------------------------------------------------------------------------- the end
  _dayDone() {
    this.phase = 'done';
    this.match.local.character.setDance?.('victory');
    G.audio?.play?.('victory_fanfare', { volume: 0.85 });
    this.finishT = 1.4;
  }
  _results() {
    this.finishT = -1;
    this.match.paused = true;
    G.input?.exitLock?.();
    this.ui.say('');
    const played = this.rounds.filter((r) => !String(r.gate).includes('relearn')).length;
    const summary = { gates: this.level.gates.length, visited: played, signs: null, seen: 0, scored: this.scoredN, firstRight: this.firstRight, relearn: this.relearn.length, relearnRight: this.relearnRight };
    // (the 今日小考 is an extra, not the day: its result is a trophy of its own and never the day's stars)
    const quiz = !!this.level.quiz;
    const stars = quiz ? 0 : starsOf(summary);
    const st = writeStars(quiz ? `${this.dayKey}:quiz` : this.dayKey, stars, null, { trophy: `${this.wins}/${played}` });
    let dueIds = []; try { dueIds = store.due(this.level.weekRef || this.week); } catch (e) { dueIds = []; }
    const byId = new Map(); for (const g of this.level.gates) for (const it of g.items) byId.set(it.id, it);
    const due = dueIds.map((id) => byId.get(id)).filter(Boolean).map((it) => ({ en: it.en, zh: it.zh }));
    const data = { done: this.right.size, total: this.total, due, firsts: this.firsts, firstRight: this.firstRight, scored: this.scoredN, locks: this.gates.reduce((n, g) => n + g.locks, 0), week: this.week, day: this.day, form: 'duel', wins: this.wins, rounds: this.rounds, enemyRights: this.enemyRights, stars, starsBefore: st.before, relearn: this.relearn.length, relearnRight: this.relearnRight };
    this._emit('learn:done', data);
    this.hud?.results(data, {
      again: () => G.game?.api?.startLearn?.({ week: this.week, day: this.day, kind: this.level.quiz ? 'quiz' : 'duel' }),
      menu: () => G.game?.api?.quitMatch?.(),
    });
    if (this.hud && this.level.quiz) this.hud.rTitle.textContent = '今日小考做完了';
    if (quiz) this.ui.resultsExtra([
      { b: `${this.wins} / ${played} 轮`, t: '区域赢了（只是奖杯）' },
      { b: `${this.firstRight} / ${this.firstsN()}`, t: '今天第一次答的里答对了（记进进度）' },
      this.firsts < this.total ? `另外 ${this.total - this.firsts} 题课上答过了，这次只算练习` : '每一题都是今天第一次答',
      '小考不算这一天的星星',
    ], null);
    else this.ui.resultsExtra([
      { b: `${this.wins} / ${played} 轮`, t: '区域赢了（输赢只是奖杯，不进星）' },
      { b: `${this.firstRight} / ${this.scoredN}`, t: '首答答对' },
      this.relearn.length ? { b: `${this.relearnRight} / ${this.relearn.length}`, t: '回炉清了' } : '没有要回炉的',
      stars > st.before ? `星星 ${st.before} → ${stars}` : `星星 ${stars}（只涨不掉）`,
    ], stars);
  }

  debug() {
    const Z = this.Z;
    return { form: 'duel', round: this.round + 1, rounds: this.gates.length, phase: this.phase, prep: this.prepOn, time: +this.match.time.toFixed(1), zone: Z ? { owner: Z.owner, count: Z.count.map((c) => Math.ceil(c)), share: Z.active.zones.map((z) => z.share.map((s) => +s.toFixed(3))) } : null, bag: this.bag.slice(), streak: this.streak, relearn: this.relearn.length, results: this.rounds, enemyRights: this.enemyRights, wins: this.wins, asking: this.asking ? { item: this.asking.item.id, type: this.asking.p.type, play: this.asking.play || null } : null, arena: this.arena ? this.arena.debug() : null };
  }
  effects() { const Z = this.Z; return { round: this.round + 1, share: Z ? Z.active.zones.map((z) => z.share.map((s) => +s.toFixed(3))) : null, owner: Z ? Z.owner : null, special: +this.match.local.special.toFixed(0), bag: this.bag.length, streak: this.streak }; }

  dispose() { this._idleBots(false); this.arena?.dispose(); this.arena = null; this.ui?.end(); super.dispose(); }
}
