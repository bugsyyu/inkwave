// 关卡学习 — the race's base (docs/LEVELS.md §2.2; 题即玩法 PLAY §5.2): what 墨浪跑酷 (src/learn/play/runner/runner.js,
// RunnerFlow) is built on — one lap on the stage's nav graph, out by one lane and back by the other (common.js
// loopRoute), the day's gates as checkpoints along it (due items first: A's raceLevel), three racer bots on the same
// route that "answer" by BOT_ANSWER dice at the checkpoints (never her question) with the rubber band, the standings,
// the props from the drop table (no prop skips a question) and the streaks. The race asks nothing itself: the runner's
// rows and glides do (play-8: the card race that stood here — 看板 / 抢跑 / 答题 with her held — is gone).
//   _place() the lap and the checkpoints · _finishMesh() · _bot(r, dt) / _botFinished(r) the racer bots · _rank()
//   _onRight() a right answer's effects, the prop drop, the streaks · _onWrong2(item) the second miss (回炉, the detour
//   or the shield) · _propKey(a) / useProp(i) the bag (超级跳 is the runner's own) · _laneFlood() the 墨道
import * as THREE from 'three';
import { G } from '../../core/ctx.js';
import { LEARN } from '../../config.js';
import { LearnFlow } from '../flow.js';
import { BOT_ANSWER, EFFECTS } from '../design.js';
import { loopRoute, cumulative, placeAlong, fitGates, botRoll, rubberDelay, finishOrder, propOnRight, useProp, streakKind } from './common.js';
import { FormsUi } from './ui.js';

const _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const d2 = (a, x, z) => Math.hypot(a.x - x, a.z - z);

// a racer standing (a module function: it was a new closure every racer every frame, LEARN §52)
function still(it) { it.move.set(0, 0, 0); it.jump = it.fire = it.squid = it.sub = it.special = false; }

export class RaceFlow extends LearnFlow {
  constructor(match, opts = {}) {
    super(match, opts);   // B: the level, _place() (ours below), the gate meshes
    this.form = 'race';
    this.R = LEARN.race;
    this.model = BOT_ANSWER[match.opts.difficulty] || BOT_ANSWER.normal;
    this.rnd = Math.random;
    this.ui = new FormsUi(G.hud); this.ui.start(); this.ui.onUse = (i) => this.useProp(i);
    this.clock = 0; this.detourT = 0; this.started = false;
    this.bag = []; this.shield = false; this.hintNext = false; this.echoNext = false; this.pendingDetour = false;
    this.streak = 0; this.rightN = 0; this.firstRight = 0; this.relearn = []; this.relearnRight = 0; this.botFirst = false;
    this.scoredN = new Set(this.level.gates.flatMap((g) => g.items.filter((it) => it.meta && it.meta.scored).map((it) => it.id))).size;
    this.racers = match.actors.filter((a) => !a.isLocal).map((a) => ({ id: a.name, a, k: 1, cp: 0, state: 'wait', wait: 0, roll: null, finish: null, stall: 0, progress: 0 }));
    this.me = { id: 'me', cp: 0, finish: null, progress: 0 };
    this._prevSpecial = false; this._rankT = 0; this._clockTxt = '';
    this._finishMesh();
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

  // ---------------------------------------------------------------------------------------------- the racer bots
  _bot(r, dt) {
    const a = r.a, it = a.intent;
    if (!a.alive || r.finish != null || r.state === 'wait') { still(it); return; }
    if (r.state !== 'run') {
      still(it);
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
      if (r.cp >= this.gates.length) { r.finish = this.clock; still(it); a.character.setDance?.('victory'); this._botFinished(r); return; }
      const roll = botRoll(this.model, this.rnd);
      r.roll = roll.ok; r.state = 'answer'; r.wait = roll.delay + rubberDelay(this.model, r.cp - this.me.cp);
      still(it);
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

  // ---------------------------------------------------------------------------------------------- her answers' effects
  // a right answer (the runner's rows and glides call it): the race's cue, a prop from the drop table, the streaks
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

  // ---------------------------------------------------------------------------------------------- props
  _propKey(a) {
    const sp = !!a.intent.special;
    if (sp && !this._prevSpecial && this.bag.length) this.useProp(0);
    this._prevSpecial = sp;
    a.intent.special = false; a.special = 0;   // the race has no special gauge: the key is the prop key
  }
  // (超级跳 — 'skip' — is the runner's own: it jumps a stretch of road, never a row)
  useProp(i) {
    const id = this.bag[i]; if (!id) return;
    const P = useProp(id), a = this.match.local;
    this.bag.splice(i, 1); this.ui.setBag(this.bag);
    switch (P.effect) {
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
    const a = this.match.local, tgt = this.gates[this.cur];
    if (!tgt) return;
    const from = this.cur > 0 ? this.gates[this.cur - 1].pathIndex : 0;
    let best = from, bd = Infinity;
    for (let i = from; i <= tgt.pathIndex; i++) { const n = G.nav.nodes[this.path[i]], dd = d2(n, a.pos.x, a.pos.z); if (dd < bd) { bd = dd; best = i; } }
    this._trail({ pathIndex: best }, tgt);
  }

  dispose() { this.ui?.end(); super.dispose(); }
}
