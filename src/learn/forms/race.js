// 关卡学习 — 道具赛 race (docs/LEVELS.md §2.2): one lap on the stage's nav graph — out by one lane, back by the other
// (common.js loopRoute) — with the day's gates as checkpoints along it (due items first: A's raceLevel), three racer
// bots on the same route that "answer" by BOT_ANSWER dice (never her question) with the rubber band, props from the
// drop table (no prop skips a question), a lap clock (never a time's-up), the finish order, stars. Built on B's
// LearnFlow: the gate meshes, auto-walk, the reworded second try, the ink trail and the results card are its.
//
// A checkpoint is three beats: the 看板 (the step's board; the clock and the bots stop; 「走」) → the run → the
// questions (she is held in place — match.learn.hold — while the bots keep running). Right: the gate opens, the
// trail pours on, a prop may drop. First wrong: the same item again in another form. Second wrong: the answer, the
// gate opens, but she goes round (LEARN.race.detour seconds held) unless she holds a shield; the item joins the 回炉
// queue, asked once more at the finish line (the 回炉门) with its help. Props: leap · rain (hint, mode H) · echo ·
// shield (streak 3) · curtain · bomb · lane (streak 5).
import * as THREE from 'three';
import { G } from '../../core/ctx.js';
import { LEARN } from '../../config.js';
import { LearnFlow } from '../flow.js';
import { prompt, store } from '../api.js';
import { BOT_ANSWER, EFFECTS } from '../design.js';
import { loopRoute, cumulative, placeAlong, fitGates, botRoll, rubberDelay, finishOrder, propOnRight, useProp, streakKind, relearnPlan, starsOf, writeStars, fmtClock, judgeAnswer, rightAnswerOf, boardOf, relearnTip, cardFor } from './common.js';
import { FormsUi } from './ui.js';

const _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const d2 = (a, x, z) => Math.hypot(a.x - x, a.z - z);

export class RaceFlow extends LearnFlow {
  constructor(match, opts = {}) {
    super(match, opts);   // B: the level, _place() (ours below), the gate meshes, hud.start
    this.form = 'race';
    this.R = LEARN.race;
    this.model = BOT_ANSWER[match.opts.difficulty] || BOT_ANSWER.normal;
    this.rnd = Math.random;
    this.ui = new FormsUi(G.hud); this.ui.start(); this.ui.onUse = (i) => this.useProp(i);
    this.clock = 0; this.hold = true; this.detourT = 0; this.board = false; this.started = false;
    this.bag = []; this.shield = false; this.hintNext = false; this.echoNext = false; this.pendingDetour = false;
    this.streak = 0; this.rightN = 0; this.firstRight = 0; this.relearn = []; this.relearnRight = 0; this.botFirst = false;
    this.scoredN = new Set(this.level.gates.flatMap((g) => g.items.filter((it) => it.meta && it.meta.scored).map((it) => it.id))).size;
    this.racers = match.actors.filter((a) => !a.isLocal).map((a) => ({ id: a.name, a, k: 1, cp: 0, state: 'wait', wait: 0, roll: null, finish: null, stall: 0, progress: 0 }));
    this.me = { id: 'me', cp: 0, finish: null, progress: 0 };
    this._prevSpecial = false; this._rankT = 0; this._clockTxt = '';
    this._finishMesh();
    this._legStart();
  }

  // ---------------------------------------------------------------------------------------------- the lap
  // the route: spawn → the far side (B's pulled-in goal) → back by the other lane; checkpoints by distance along it
  _place() {
    const nav = G.nav, L = G.level, R = LEARN.race;
    const pad0 = L.spawnPads[0], pad1 = L.spawnPads[1];
    const start = nav.nearest(_v.set(pad0.x, pad0.y, pad0.z), 2, true);
    const dx = -pad1.x, dz = -pad1.z, dl = Math.hypot(dx, dz) || 1, pull = (L.spawnBarrier || 4) + 3;
    const goal = nav.nearest(_v.set(pad1.x + (dx / dl) * pull, pad1.y, pad1.z + (dz / dl) * pull), 3, false);
    let route = start >= 0 && goal >= 0 ? loopRoute(nav, start, goal, { avoid: R.laneAvoid }) : null;
    if (!route || route.loop.length < 4) { const out = this._farthest(start); route = { out, back: out.slice().reverse(), loop: out.concat(out.slice().reverse().slice(1)), shared: 1 }; }
    this.route = route; this.path = route.loop;
    this.cum = cumulative(nav.nodes, this.path);
    const { fit, at } = placeAlong(this.cum, this.level.gates.length, { first: R.firstGateMin, gap: R.gap, tail: R.gap });
    // the two lanes run side by side near the spawn: a checkpoint within laneAvoid m (as the crow flies) of an earlier
    // one slides back along the lap until it stands apart, so no checkpoint is reached without running to it
    for (let k = 1; k < at.length; k++) {
      const near = (i) => at.slice(0, k).some((j) => { const a = nav.nodes[this.path[i]], b = nav.nodes[this.path[j]]; return Math.hypot(a.x - b.x, a.z - b.z) < R.laneAvoid; });
      while (at[k] > at[k - 1] + 3 && near(at[k])) at[k] -= 1;
    }
    const defs = fitGates(this.level.gates, fit);
    this.gates = defs.map((def, k) => {
      const i = at[k], node = nav.nodes[this.path[i]];
      return { ...def, index: k, pathIndex: i, node: this.path[i], pos: new THREE.Vector3(node.x, node.y, node.z), state: k === 0 ? 'next' : 'locked', locks: 0, queue: def.items.map((it) => ({ ...it, _tries: 0, _form: null })) };
    });
    const fi = this.path.length - 1, fn = nav.nodes[this.path[fi]];
    this.finish = { id: 'finish', title: '终点', pathIndex: fi, node: this.path[fi], pos: new THREE.Vector3(fn.x, fn.y, fn.z) };
  }
  _finishMesh() {
    const col = G.teamColors[0] || new THREE.Color('#ff8a14');
    const ring = new THREE.Mesh(this._geos[0], new THREE.MeshBasicMaterial({ color: col.clone(), transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.copy(this.finish.pos); ring.position.y += 0.06; ring.scale.set(1.6, 1.6, 1);
    this._mats.push(ring.material);
    this.group.add(ring);
    this.finish.mesh = ring;
  }

  // ---------------------------------------------------------------------------------------------- the three beats
  // the board (看板) before a checkpoint with one: clock and bots stop, she reads, 「走」; review days have no boards
  _legStart() {
    const g = this.gates[this.cur];
    const board = g && !this.level.review ? boardOf(g, this.level) : null;
    this.hold = true;
    if (board) {
      this.board = true;
      for (const r of this.racers) r.a.character.setDance?.('lobby_pose');
      this.ui.showBoard({ ...board, title: `${board.title} · 第 ${g.index + 1} / ${this.gates.length} 站`, go: this.started ? '走！' : '出发！' }, () => this._go());
      G.input?.exitLock?.();   // the mouse for the board (hold is set: main.js does not read this as a pause)
    } else this._go();
  }
  _go() {
    this.board = false; this.ui.hideBoard(); this.hold = false;
    for (const r of this.racers) { r.a.character.setDance?.(null); if (r.state === 'wait') r.state = 'run'; }
    if (!this.started) {
      this.started = true;
      G.hud?.banner?.('ready', '准备');
      G.audio?.play?.('ready', { volume: 0.8 });
      setTimeout(() => { G.hud?.banner?.('go', '出发'); G.audio?.play?.('go_horn', { volume: 0.8 }); }, 900);
    }
    this.autoPath = null;
    G.input?.requestLock?.(); if (G.game) G.game._relock = true;
  }
  prep() { return this.board; }   // (the audits: a board is up — press 「走」)

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    this.t += dt;
    this._animate(); this._pourInk();
    const m = this.match;
    if (this.finishT >= 0) { this.finishT -= dt; if (this.finishT < 0) this._results(); return; }
    if (this.phase === 'done' || m.state !== 'playing') return;
    if (this.board) return;   // the 看板 beat: nothing moves, the clock stands
    this.clock += dt;
    const txt = `圈 ${fmtClock(this.clock)}`;
    if (txt !== this._clockTxt && G.hud?.timerTxt) { this._clockTxt = txt; G.hud.timerTxt.textContent = txt; }
    for (const r of this.racers) this._bot(r, dt);
    if ((this._rankT -= dt) <= 0) { this._rankT = 0.5; this._rank(); }
    const a = m.local;
    this._propKey(a);
    if (this.hold) {
      if (this.detourT > 0) { this.detourT -= dt; if (this.detourT <= 0) { this.detourT = 0; this.ui.say(''); this._legStart(); } else this.ui.say(`绕路中 … ${Math.ceil(this.detourT)} 秒`, { coral: true, hold: 1 }); }
      return;
    }
    if (!a.alive) return;
    const target = this.phase === 'final' ? this.finish : this.gates[this.cur];
    if (!target) return;
    if (this.auto) this._autoWalk(a, target, dt);
    const d = d2(a.pos, target.pos.x, target.pos.z);
    if (this.hud) {
      const cam = G.camera, fw = cam.getWorldDirection(_v);
      const want = Math.atan2(target.pos.x - a.pos.x, target.pos.z - a.pos.z), have = Math.atan2(fw.x, fw.z);
      let rel = want - have; while (rel > Math.PI) rel -= Math.PI * 2; while (rel < -Math.PI) rel += Math.PI * 2;
      this.hud.walk({ dist: d, angle: rel, index: Math.min(this.cur + 1, this.gates.length), total: this.gates.length, auto: this.auto, title: target.title });
    }
    this.me.progress = this.cum[Math.max(0, (this.phase === 'final' ? this.finish.pathIndex : target.pathIndex) - 1)] - d;
    if (d < LEARN.gate.trigger && Math.abs(a.pos.y - target.pos.y) < 2.5) { if (this.phase === 'final') this._finishLine(); else this._arrive(target); }
  }

  // ---------------------------------------------------------------------------------------------- the racer bots
  _bot(r, dt) {
    const a = r.a, it = a.intent;
    const still = () => { it.move.set(0, 0, 0); it.jump = it.fire = it.squid = it.sub = it.special = false; };
    if (!a.alive || r.finish != null || r.state === 'wait') { still(); return; }
    if (r.state !== 'run') {
      still();
      r.wait -= dt;
      if (r.wait <= 0) {
        if (r.state === 'answer') { if (r.roll) { a.character.trigger?.('jump'); r.cp++; r.state = 'run'; } else { r.state = 'detour'; r.wait = this.R.detour; } }
        else if (r.state === 'detour') { r.cp++; r.state = 'run'; }
        else r.state = 'run';
      }
      return;
    }
    const tgt = r.cp < this.gates.length ? this.gates[r.cp] : this.finish, tIdx = tgt.pathIndex;
    const nav = G.nav, nodes = nav.nodes, path = this.path;
    while (r.k < tIdx && d2(nodes[path[r.k]], a.pos.x, a.pos.z) < 0.7) r.k++;
    let n = nodes[path[Math.min(r.k, tIdx)]];
    if (d2(n, a.pos.x, a.pos.z) > 4.5) {   // off the route (pushed, fell): re-join at the nearest node ahead
      let best = r.k, bd = Infinity;
      for (let i = Math.max(1, r.k - 4); i <= Math.min(tIdx, r.k + 30); i++) { const dd = d2(nodes[path[i]], a.pos.x, a.pos.z) + Math.abs(nodes[path[i]].y - a.pos.y) * 2; if (dd < bd) { bd = dd; best = i; } }
      r.k = best; n = nodes[path[Math.min(r.k, tIdx)]];
    }
    const dx = n.x - a.pos.x, dz = n.z - a.pos.z, d = Math.hypot(dx, dz);
    if (d > 1e-3) it.move.set(dx / d, 0, dz / d); else it.move.set(0, 0, 0);
    const edge = r.k > 0 && r.k < path.length ? nav.edge(path[r.k - 1], path[r.k]) : null;
    it.jump = !!(edge && edge.type === 'jump' && d < 1.5) || (n.y - a.pos.y > 0.45 && d < 1.2);
    it.squid = false; it.fire = false; it.sub = false; it.special = false;
    const hs = Math.hypot(a.vel?.x || 0, a.vel?.z || 0);
    r.stall = hs < 0.4 ? r.stall + dt : 0;
    if (r.stall > 1.6) { r.stall = 0; it.jump = true; r.k = Math.min(r.k + 1, tIdx); }
    r.progress = this.cum[Math.min(r.k, tIdx)] - d;
    if (d2(a.pos, tgt.pos.x, tgt.pos.z) < this.R.botTrigger && Math.abs(a.pos.y - tgt.pos.y) < 2.5) {
      if (r.cp >= this.gates.length) { r.finish = this.clock; still(); a.character.setDance?.('victory'); this._botFinished(r); return; }
      const roll = botRoll(this.model, this.rnd);
      r.roll = roll.ok; r.state = 'answer'; r.wait = roll.delay + rubberDelay(this.model, r.cp - this.me.cp);
      still();
    }
  }
  _botFinished(r) {
    if (this.me.finish == null && !this.botFirst) {
      this.botFirst = true;
      G.hud?.feed?.({ text: `${r.id} 先到了，没关系`, color: G.teamHex[0] });
      G.audio?.play?.(EFFECTS.race.botFinish.sfx, { volume: 0.6 });
    }
  }
  _rank() {
    const all = [...this.racers, this.me], order = finishOrder(all);
    this.ui.setRank(order.map((id) => { const r = all.find((x) => x.id === id); return { name: id === 'me' ? '你' : id, me: id === 'me', cp: r.cp, total: this.gates.length, finish: r.finish }; }));
  }

  // ---------------------------------------------------------------------------------------------- her checkpoint
  _arrive(g) {
    this.phase = 'ask';
    const a = this.match.local;
    a.intent.move.set(0, 0, 0); a.intent.jump = a.intent.fire = false;
    this.hold = true;              // she stands; the bots run on (match.updateController reads learn.hold)
    G.input?.exitLock?.();
    G.audio?.play?.('ui_confirm', { volume: 0.7 });
    this._emit('learn:gate', { id: g.id, index: g.index + 1, total: this.gates.length, locks: g.locks, opened: false });
    this._askNext(g);
  }

  _askNext(g) {
    if (!g.queue.length) { this._open(g); return; }
    const item = g.queue.shift();
    const p = cardFor(g, item, () => prompt(item), () => this._altPrompt(item));
    if (item._relearn) { const tip = relearnTip(item); p.zh = [tip.zh, p.zh].filter(Boolean).join('　'); p._tip = tip; }
    if (this.hintNext && p.type !== 'choice' && !p._flip) { this.hintNext = false; p.zh = ['提示：' + ((item.meta && (item.meta.hint || item.meta.zhFull)) || item.zh || ''), p.zh].filter(Boolean).join('　'); p._hinted = true; }
    this.asking = { gate: g, item, p };
    this.asked++;
    this._emit('learn:question', { itemId: item.id, gate: g.id, type: p.type, form: item._relearn ? 'relearn' : item._form || 'normal' });
    this.hud?.ask(p, {
      gate: { index: Math.min(g.index + 1, this.gates.length), total: this.gates.length, locks: g.locks, title: g.title },
      item: { n: this.asked, total: this.total + this._retriesLeft(), retry: item._form === 'alt' },
      onAnswer: (ans) => this._answer(g, item, p, ans),
    });
    if ((this.echoNext || (p._tip && (p._tip.slow || p._tip.speakBoth))) && p.tts) {
      this.echoNext = false;
      const again = p._tip && p._tip.speakBoth && item.meta && item.meta.pair ? item.meta.pair.filter((w) => w !== p.tts)[0] : p.tts;
      setTimeout(() => { if (this.asking && this.asking.item === item) this.hud?._speak?.(again || p.tts); }, 1900);
    }
  }
  rightAnswer() { return this.asking ? rightAnswerOf(this.asking.item, this.asking.p) : null; }

  _answer(g, item, p, ans) {
    const r = judgeAnswer(item, p, ans);
    const rec = store.recordFirst({ itemId: item.id, item, ok: r.ok, pct: r.pct, hinted: !!p._hinted, at: Date.now(), ...(p._flip ? { how: 'F' } : {}) });
    const first = !!rec.first;
    if (first) { this.firsts++; if (r.ok) this.firstRight++; }
    if (r.ok) this.right.add(item.id);
    this._emit('learn:answer', { itemId: item.id, ok: r.ok, first, gate: g.id, hinted: !!p._hinted, relearn: !!item._relearn, flip: !!p._flip });
    let again = false;
    if (r.ok) {
      if (item._relearn) this.relearnRight++;
      this.streak++; this.rightN++;
      this._onRight();
    } else if (p._flip) {   // 不记得 (her own rating): no lock, no detour — the typed card comes right away
      item._flipTyped = true; g.queue.unshift(item); again = true;
      G.audio?.play?.('ui_toggle', { volume: 0.5 });
    } else {
      this.streak = 0; g.locks++;
      if (!item._relearn && item._tries < this.P.retries) { item._tries++; item._form = 'alt'; g.queue.push(item); again = true; G.audio?.play?.(EFFECTS.race.wrong.sfx, { volume: 0.6 }); }
      else this._onWrong2(item);
      this._styleGates();
    }
    this.hud?.verdict({ ok: r.ok, why: r.why, canonical: r.canonical, locks: g.locks, again, text: r.text }, () => this._askNext(g));
  }

  _onRight() {
    const a = this.match.local, E = EFFECTS.race.right;
    G.audio?.play?.(E.sfx, { volume: 0.7 });
    _v.copy(a.pos); _v.y += 0.4;
    G.fx?.burst?.(_v, _up, G.teamColors[0], { count: 14, speed: 4.5, size: 0.12, spread: 0.8 });
    a.character.trigger?.(E.trigger);
    G.hud?.feed?.({ text: E.feed, color: G.teamHex[0] });
    const got = propOnRight('race', this.rightN, this.streak, this.bag, this.rnd);
    if (got.drop) { this.bag.push(got.drop); this.ui.setBag(this.bag, this.bag.length - 1); G.audio?.play?.('xp_tick', { volume: 0.6 }); this.ui.say(`拿到道具：${useProp(got.drop).zh}`); }
    const sk = streakKind(this.streak);
    if (sk === 'streak3' || got.streak === 'shield') { this.shield = true; G.audio?.play?.(EFFECTS.race.streak3.sfx, { volume: 0.8 }); this.ui.say('连对 3 题 · 护盾：下一次答错不绕路'); }
    if (sk === 'streak5' || got.streak === 'lane') { G.audio?.play?.(EFFECTS.race.streak5.sfx, { volume: 0.8 }); G.hud?.banner?.('special', '墨道！'); this._laneFlood(); a.character.setDance?.('victory'); setTimeout(() => a.character.setDance?.(null), 1500); }
    this._emit('learn:prop', { drop: got.drop, streak: got.streak, bag: this.bag.slice() });
  }
  _onWrong2(item) {
    G.audio?.play?.(EFFECTS.race.wrong2.sfx, { volume: 0.6 });
    if (!item._relearn) this.relearn.push(item);
    if (this.shield) { this.shield = false; this.ui.say('护盾挡住了绕路'); }
    else if (!item._relearn) this.pendingDetour = true;
  }

  // the gate opens: B's cue + burst; the trail pours on to the next one (or the finish); then the detour or the next board
  _open(g) {
    g.state = 'open';
    this._emit('learn:gate', { id: g.id, index: g.index + 1, total: this.gates.length, locks: g.locks, opened: true });
    const col = G.teamColors[0];
    _v.copy(g.pos); _v.y += 0.4;
    G.fx?.burst?.(_v, _up, col, { count: 26, speed: 5.5, size: 0.14, spread: 0.9 });
    G.fx?.ring?.(_v, _up, col, { radius: 2.2, life: 0.45 });
    G.audio?.play?.('refill_full', { pos: g.pos, volume: 0.9 });
    G.paint?.splat(_v.set(g.pos.x, g.pos.y + 0.05, g.pos.z), this.P.inkRadius * 1.6, 0, { kind: 'blast' });
    this.hud?.hide();
    if (g._relearnGate) { this._finishDone(); return; }
    this.cur++; this.me.cp = this.cur;
    const next = this.gates[this.cur];
    if (next) { next.state = 'next'; this._trail(g, next); } else this._trail(g, this.finish);
    this._styleGates();
    this.autoPath = null;
    this.phase = next ? 'walk' : 'final';
    if (this.pendingDetour) { this.pendingDetour = false; this.detourT = this.R.detour; this.hold = true; this.ui.say(`答错两次：门开了，但近路的墨幕 ${this.R.detour} 秒不散 — 绕路`, { coral: true, hold: 1 }); this._emit('learn:detour', { seconds: this.R.detour }); }
    else if (next) this._legStart();
    else { this.hold = false; this.ui.say('最后一段：回到起点！'); G.input?.requestLock?.(); if (G.game) G.game._relock = true; }
  }

  // ---------------------------------------------------------------------------------------------- the finish
  // at the line: the 回炉门 first when something was missed (each item once more, with its help), then the finish
  _finishLine() {
    if (this.relearn.length && !this.relearnAsked) {
      this.relearnAsked = true;
      const items = relearnPlan(this.relearn).map((it) => ({ ...it, _tries: 1, _form: 'alt', _relearn: true }));
      const rg = { id: 'gate:relearn', title: '回炉门', index: this.gates.length, pathIndex: this.finish.pathIndex, node: this.finish.node, pos: this.finish.pos, state: 'next', locks: 0, items, queue: items, _relearnGate: true };
      this.ui.say(`回炉门：错过的 ${items.length} 个再来一次`);
      this._arrive(rg);
      return;
    }
    this._finishDone();
  }
  _finishDone() {
    this.me.finish = this.clock;
    const order = finishOrder([...this.racers, this.me]);
    this.place = order.indexOf('me') + 1;
    const a = this.match.local;
    this.hold = true; this.phase = 'done'; this.finishT = 1.6;
    a.intent.move.set(0, 0, 0);
    a.character.setDance?.('victory');
    G.audio?.play?.(this.place === 1 ? EFFECTS.race.finish.sfx : EFFECTS.race.botFinish.sfx, { volume: 0.85 });
    this.ui.say(this.place === 1 ? '第 1 名！' : `第 ${this.place} 名 · 跑完了`);
    this._emit('learn:finish', { place: this.place, clock: +this.clock.toFixed(1), order });
  }

  _results() {
    this.finishT = -1;
    this.match.paused = true;
    G.input?.exitLock?.();
    this.ui.say('');
    const summary = { gates: this.gates.length, visited: this.gates.length, signs: null, seen: 0, scored: this.scoredN, firstRight: this.firstRight, relearn: this.relearn.length, relearnRight: this.relearnRight };
    const stars = starsOf(summary);
    const st = writeStars(this.dayKey, stars, null, { trophy: this.place });
    let dueIds = []; try { dueIds = store.due(this.level.weekRef || this.week); } catch (e) { dueIds = []; }
    const byId = new Map(); for (const g of this.level.gates) for (const it of g.items) byId.set(it.id, it);
    const due = dueIds.map((id) => byId.get(id)).filter(Boolean).map((it) => ({ en: it.en, zh: it.zh }));
    const data = { done: this.right.size, total: this.total, due, firsts: this.firsts, firstRight: this.firstRight, scored: this.scoredN, locks: this.gates.reduce((n, g) => n + g.locks, 0), week: this.week, day: this.day, form: 'race', place: this.place, clock: +this.clock.toFixed(1), stars, starsBefore: st.before, relearn: this.relearn.length, relearnRight: this.relearnRight };
    this._emit('learn:done', data);
    this.hud?.results(data, {
      again: () => G.game?.api?.startLearn?.({ week: this.week, day: this.day, kind: 'race' }),
      menu: () => G.game?.api?.quitMatch?.(),
    });
    this.ui.resultsExtra([
      { b: `第 ${this.place} 名`, t: `· 圈时 ${fmtClock(this.clock)}（名次只是奖杯，不进星）` },
      { b: `${this.firstRight} / ${this.scoredN}`, t: '首答答对' },
      this.relearn.length ? { b: `${this.relearnRight} / ${this.relearn.length}`, t: '回炉清了' } : '没有要回炉的',
      stars > st.before ? `星星 ${st.before} → ${stars}` : `星星 ${stars}（只涨不掉）`,
    ], stars);
  }

  // ---------------------------------------------------------------------------------------------- props
  _propKey(a) {
    const sp = !!a.intent.special;
    if (sp && !this._prevSpecial && this.bag.length) this.useProp(0);
    this._prevSpecial = sp;
    a.intent.special = false; a.special = 0;   // the race has no special gauge: the key is the prop key
  }
  useProp(i) {
    const id = this.bag[i]; if (!id) return;
    const P = useProp(id), a = this.match.local;
    this.bag.splice(i, 1); this.ui.setBag(this.bag);
    switch (P.effect) {
      case 'skip': {   // 超级跳 to just before the next checkpoint (the question still comes)
        const tgt = this.phase === 'final' ? this.finish : this.gates[this.cur];
        if (!tgt || this.hold) { this.bag.splice(i, 0, id); this.ui.setBag(this.bag); this.ui.say('先答完这一题'); return; }
        const n = G.nav.nodes[this.path[Math.max(0, tgt.pathIndex - 3)]];
        a.superJump(new THREE.Vector3(n.x, n.y, n.z), { instant: true });
        this.autoPath = null;
        break;
      }
      case 'hint': this.hintNext = true; this.ui.say('墨雨：下一题先给提示（记为提示作答）'); break;
      case 'replay': this.echoNext = true; this.ui.say('回声：下一题多听一遍'); break;
      case 'no-detour': this.shield = true; this.ui.say('护盾：下一次答错不绕路'); break;
      case 'block-bots': { let n = 0; for (const r of this.racers) if (r.finish == null && r.cp <= this.me.cp && r.state === 'run') { r.state = 'blocked'; r.wait = this.R.block; n++; } a.character.trigger?.('throw'); this.ui.say(n ? `墨幕：挡住了 ${n} 个机器人 ${this.R.block} 秒` : '墨幕落下了（后面没有机器人）'); break; }
      case 'stun-bot': { let best = null, bd = Infinity; for (const r of this.racers) { if (r.finish != null) continue; const d = d2(r.a.pos, a.pos.x, a.pos.z); if (d < bd) { bd = d; best = r; } } if (best) { best.state = 'stunned'; best.wait = this.R.stun; G.fx?.explosion?.(_v.copy(best.a.pos).setY(best.a.pos.y + 0.3), G.teamColors[0], 1.5); this.ui.say(`墨弹：${best.id} 停了 ${this.R.stun} 秒`); } a.character.trigger?.('throw'); break; }
      case 'flood-lane': this._laneFlood(); this.ui.say('墨道：到下一站的路全是你的墨'); break;
    }
    G.audio?.play?.(P.sfx, { volume: 0.8 });
    this._emit('learn:propUse', { id, effect: P.effect });
  }
  // her ink from where she stands to the next checkpoint (the lane): B's trail between two path indices
  _laneFlood() {
    const a = this.match.local, tgt = this.phase === 'final' ? this.finish : this.gates[this.cur];
    if (!tgt) return;
    const from = this.cur > 0 ? this.gates[this.cur - 1].pathIndex : 0;
    let best = from, bd = Infinity;
    for (let i = from; i <= tgt.pathIndex; i++) { const n = G.nav.nodes[this.path[i]], dd = d2(n, a.pos.x, a.pos.z); if (dd < bd) { bd = dd; best = i; } }
    this._trail({ pathIndex: best }, tgt);
  }

  // the audits read these
  debug() {
    return { form: 'race', gates: this.gates.map((g) => ({ i: g.index + 1, n: g.items.length, at: g.pathIndex, pos: [+g.pos.x.toFixed(1), +g.pos.y.toFixed(1), +g.pos.z.toFixed(1)] })), route: { out: this.route.out.length, back: this.route.back.length, loop: this.path.length, shared: this.route.shared, len: +this.cum[this.cum.length - 1].toFixed(1) }, cur: this.cur, phase: this.phase, hold: this.hold, board: this.board, clock: +this.clock.toFixed(1), bag: this.bag.slice(), racers: this.racers.map((r) => ({ id: r.id, cp: r.cp, state: r.state, finish: r.finish })), me: { cp: this.me.cp, finish: this.me.finish, place: this.place || null }, relearn: this.relearn.length, detourT: +this.detourT.toFixed(1) };
  }
  effects() { return { cur: this.cur, bag: this.bag.length, streak: this.streak, detourT: +this.detourT.toFixed(1), relearn: this.relearn.length }; }

  dispose() { this.ui?.end(); super.dispose(); }
}
