// 关卡学习 — 对抗赛 duel (docs/LEVELS.md §2.3): Zone Control, her + 3 team-mate bots against 4 bots, on the stage's
// zones geometry, the centre zone only (no rotation). A gate is a round: between rounds the 备战 board shows the
// step's content (the match is held, the squidkids pose); in a round the questions come to her on a cadence
// (LEARN.duel.askGap) while the zone counts down — a right answer floods the neediest patch of the live zone with her
// ink (2.5 m, +0.5 per streak, 4.5 cap) and charges her special; a wrong one costs nothing (the same item comes back
// reworded; a second miss joins the 回炉 queue). Her team-mates play the zone with INKWAVE's own zone brains and never
// answer; the other side plays too, and every duelCadence seconds rolls a BOT_ANSWER die — a hit inks duelFlood m.
// The round ends when her questions run out, at a knockout, or when its clock (the gate's course minutes, clamped)
// runs down; a day is as many rounds as gates, then the 回炉 round when something was missed, then the results.
// Stars and evidence come from the questions alone; the rounds won are a trophy.
import * as THREE from 'three';
import { G, emit } from '../../core/ctx.js';
import { LEARN } from '../../config.js';
import { ZoneControl } from '../../game/zones.js';
import { zonePlan } from '../../game/bots.js';
import { LearnFlow } from '../flow.js';
import { prompt, store } from '../api.js';
import { BOT_ANSWER, EFFECTS } from '../design.js';
import { duelFlood, streakKind, propOnRight, useProp, relearnPlan, starsOf, writeStars, fmtClock, judgeAnswer, rightAnswerOf, boardOf, relearnTip, cardFor } from './common.js';
import { FormsUi } from './ui.js';

const _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

// the live turf cells of a zone with their world positions (the flood region of a patch is a subset of them)
function zoneCellsXYZ(zone) {
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
    this.round = -1; this.prepOn = false; this.hold = false; this.asking = null;
    this.askT = 0; this.enemyT = 0; this.nextT = -1; this.roundT = 0;
    this.bag = []; this.shield = false; this.hintNext = false; this.echoNext = false;
    this.streak = 0; this.rightN = 0; this.firstRight = 0; this.relearn = []; this.relearnRight = 0; this.relearnAsked = false;
    this.wins = 0; this.rounds = []; this.enemyRights = 0;
    this.scoredN = new Set(this.level.gates.flatMap((g) => g.items.filter((it) => it.meta && it.meta.scored).map((it) => it.id))).size;
    this._prevSpecial = false; this._clockTxt = ''; this._cells = null;
    this.phase = 'prep';
    this._startPrep();
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
  _startPrep() {
    this.round++;
    const g = this.gates[this.round];
    if (!g) { this._dayDone(); return; }
    if (g._relearnGate) {
      this.ui.showBoard({ title: '回炉门', head: `错过的 ${g.items.length} 个再来一次`, rows: g.items.map((it) => ({ en: it.en.length > 48 ? it.zh : it.en, zh: it.en.length > 48 ? '' : it.zh, tts: it.tts || it.en })), go: '开始回炉' }, () => this._roundStart());
    } else {
      // 今日小考 (LEVELS §1.2): one round, no board of a step — what it is, and that it is optional
      if (this.level.quiz) this.ui.showBoard({ title: '今日小考 · 傍晚一轮对抗赛', head: `${g.items.length} 题：今天学的、到期的、答错过的`, rows: [{ text: '答对一题，区域里最缺墨的那块涂成你的颜色。可做可不做；今天第一次答的照样记进进度，课上答过的再答只算练习。' }], go: '开始小考' }, () => this._roundStart());
      else {
        const board = boardOf(g, this.level) || { title: '备战', head: g.title, rows: [{ text: `这一轮 ${g.items.length} 题：答对一题，区域里最缺的那块涂成你的墨。` }] };
        this.ui.showBoard({ ...board, title: `${board.title} · 第 ${this.round + 1} / ${this.gates.length} 轮`, go: this.round === 0 ? '开始第 1 轮' : '开始这一轮' }, () => this._roundStart());
      }
    }
    this.prepOn = true; this.hold = true; this.phase = 'prep';
    for (const a of this.match.actors) if (a.isBot && a.alive) a.character.setDance?.('lobby_pose');
    this._emit('learn:round', { round: this.round + 1, total: this.gates.length, gate: g.id, state: 'prep' });
  }
  _roundStart() {
    const m = this.match, g = this.gates[this.round];
    this.prepOn = false; this.hold = false; this.phase = 'round';
    this.ui.hideBoard();
    for (const a of m.actors) a.character.setDance?.(null);
    // the round's clock: the gate's course minutes, clamped (a shortened level: 60 s); the match never reaches 0 itself
    this.roundT = this.level.short ? 60 : Math.max(this.D.roundMin, Math.min(this.D.roundMax, (g.minutes || 1) * 60));
    m.time = this.roundT; m.duration = this.roundT; m.lastMinuteFired = false; m.lastCount = 99;
    // a fresh centre-only zone control per round (counts at 100, the zone wiped to bare floor, no rotation)
    if (this.round > 0) { this.Z = new ZoneControl(m); m.zones = this.Z; }
    this.Z.final = true; this.Z.nextSwap = Infinity;
    for (const z of this.Z.active.zones) this.Z._flood(z, -1);
    this._cells = this.Z.active.zones.map((z) => zoneCellsXYZ(z));
    this.askT = this.D.askGap; this.enemyT = this.model.duelCadence * 0.7;
    m.paused = false;
    G.hud?.banner?.('go', '开始');
    G.audio?.play?.('go_horn', { volume: 0.7 });
    G.input?.requestLock?.(); if (G.game) G.game._relock = true;
    this._emit('learn:round', { round: this.round + 1, total: this.gates.length, gate: g.id, state: 'start', seconds: this.roundT });
  }
  _roundEnd(winner, reason) {
    if (this.phase !== 'round') return;
    const g = this.gates[this.round], Z = this.Z;
    this.phase = 'between'; this.hold = true; this.asking = null;
    Z.winner = winner; Z.reason = reason;   // (freezes the rules; a knockout already set them)
    g.state = 'open';
    const res = { round: this.round + 1, gate: g.id, winner, reason, counts: [Math.ceil(Z.count[0]), Math.ceil(Z.count[1])], left: g.queue.length };
    this.rounds.push(res);
    if (winner === 0) this.wins++;
    this._emit('learn:gate', { id: g.id, index: g.index + 1, total: this.gates.length, locks: g.locks, opened: true });
    this._emit('learn:round', { ...res, state: 'end' });
    const a = this.match.local; a.intent.move.set(0, 0, 0);
    this.hud?.hide(); this.hud?.el.classList.remove('is-walk');
    G.input?.exitLock?.();
    const E = EFFECTS.duel.round.sfx;
    G.audio?.play?.(E[0], { volume: 0.7 });
    setTimeout(() => G.audio?.play?.(E[1], { volume: 0.6 }), 500);
    setTimeout(() => { G.audio?.play?.(E[2], { volume: 0.7 }); G.hud?.banner?.('custom', winner === 0 ? '这一轮：我们赢了！' : winner === 1 ? '这一轮：对面先数完，没关系' : '这一轮：打平'); }, 1300);
    this.ui.say(`第 ${this.round + 1} 轮 · 我们 ${res.counts[0]} / 对面 ${res.counts[1]}`, { hold: 1 });
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
    const m = this.match;
    if (this.finishT >= 0) { this.finishT -= dt; if (this.finishT < 0) this._results(); return; }
    if (this.phase === 'done' || m.state !== 'playing') return;
    if (this.prepOn) { if (!m.paused) { m.paused = true; G.input?.exitLock?.(); } return; }
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
    if (this.hold) { a.intent.move.set(0, 0, 0); return; }
    if (!this.asking) {
      if (!g.queue.length) { this.askT -= dt; if (this.askT <= 0) this._roundEnd(this.Z.losing() < 0 ? -1 : 1 - this.Z.losing(), 'answered'); return; }
      if (a.alive) { this.askT -= dt; if (this.askT <= 0) this._ask(g); }
    }
  }

  // ---------------------------------------------------------------------------------------------- her questions
  _ask(g) {
    const item = g.queue.shift(), a = this.match.local;
    const p = cardFor(g, item, () => prompt(item), () => this._altPrompt(item));
    if (item._relearn) { const tip = relearnTip(item); p.zh = [tip.zh, p.zh].filter(Boolean).join('　'); p._tip = tip; }
    if (this.hintNext && p.type !== 'choice' && !p._flip) { this.hintNext = false; p.zh = ['提示：' + ((item.meta && (item.meta.hint || item.meta.zhFull)) || item.zh || ''), p.zh].filter(Boolean).join('　'); p._hinted = true; }
    this.asking = { gate: g, item, p };
    this.hold = true; a.intent.move.set(0, 0, 0); a.intent.fire = a.intent.jump = false;
    G.input?.exitLock?.();
    G.audio?.play?.('ui_confirm', { volume: 0.6 });
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
  firstsN() { return this.firsts; }

  _answer(g, item, p, ans) {
    const r = judgeAnswer(item, p, ans);
    const rec = store.recordFirst({ itemId: item.id, item, ok: r.ok, pct: r.pct, hinted: !!p._hinted, at: Date.now(), ...(p._flip ? { how: 'F' } : {}) });
    const first = !!rec.first;
    if (first) { this.firsts++; if (r.ok) this.firstRight++; }
    if (r.ok) this.right.add(item.id);
    this._emit('learn:answer', { itemId: item.id, ok: r.ok, first, gate: g.id, hinted: !!p._hinted, relearn: !!item._relearn, flip: !!p._flip });
    let again = false;
    if (r.ok) { if (item._relearn) this.relearnRight++; this.streak++; this.rightN++; this._onRight(); }
    else if (p._flip) { item._flipTyped = true; g.queue.unshift(item); again = true; G.audio?.play?.('ui_toggle', { volume: 0.5 }); }   // 不记得: type it right away
    else {
      this.streak = 0; g.locks++;
      if (!item._relearn && item._tries < this.P.retries) { item._tries++; item._form = 'alt'; g.queue.push(item); again = true; G.audio?.play?.(EFFECTS.duel.wrong.sfx, { volume: 0.6 }); }
      else { G.audio?.play?.(EFFECTS.duel.wrong2.sfx, { volume: 0.6 }); if (!item._relearn) this.relearn.push(item); if (this.shield) { this.shield = false; this.enemyT += this.model.duelCadence; this.ui.say('护盾：对面这一次没得「答题」'); } }
    }
    this.hud?.verdict({ ok: r.ok, why: r.why, canonical: r.canonical, locks: g.locks, again, text: r.text }, () => this._after());
  }
  _after() {
    this.asking = null; this.hold = false; this.askT = this.D.askGap;
    this.hud?.hide(); this.hud?.el.classList.remove('is-walk');
    if (this.phase === 'round') { G.input?.requestLock?.(); if (G.game) G.game._relock = true; }
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
    this.phase = 'done'; this.hold = true;
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
    return { form: 'duel', round: this.round + 1, rounds: this.gates.length, phase: this.phase, prep: this.prepOn, hold: this.hold, time: +this.match.time.toFixed(1), zone: Z ? { owner: Z.owner, count: Z.count.map((c) => Math.ceil(c)), share: Z.active.zones.map((z) => z.share.map((s) => +s.toFixed(3))) } : null, bag: this.bag.slice(), streak: this.streak, relearn: this.relearn.length, results: this.rounds, enemyRights: this.enemyRights, wins: this.wins };
  }
  effects() { const Z = this.Z; return { round: this.round + 1, share: Z ? Z.active.zones.map((z) => z.share.map((s) => +s.toFixed(3))) : null, owner: Z ? Z.owner : null, special: +this.match.local.special.toFixed(0), bag: this.bag.length, streak: this.streak }; }

  dispose() { this.ui?.end(); super.dispose(); }
}
