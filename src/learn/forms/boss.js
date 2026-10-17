// 关卡学习 — Boss 战 boss (docs/LEVELS.md §2.5): the week's 周考 as HULLBREAKER. bossPlan(week) picks the items — L
// listening 20 · R reading / vocab / grammar 20 · W the week's 3 sentences · S 4 Part 1 questions + 2 read-aloud —
// and maps them to the boss's HP bands 100–66 · 66–33 · 33–10 · 10–0 (the boss's own phases 1 / 2 / 3 follow at 66 /
// 33 %: crablets, then the frenzy). Questions come between its moves (the boss idle, no telegraph running); the boss
// only moves after she has answered. Right = one weak-point hit worth the
// phase's band / its questions (boss.applyDamage, so the HUD's bar, chip and damage numbers are INKWAVE's); wrong =
// the boss gets a move of its phase (brain.force) and she dodges for LEARN.boss.dodge seconds; the item comes back
// reworded once, then joins the 回炉 queue (asked again at the end). Streak 3 fills her special; streak 5 forces a
// charge (the stun window). Her squad (3 bots) fights it as in Boss Battle, but only her answers hurt it: every
// other hit is turned into a flash. Each phase has a time budget (LEARN.boss.phaseTime); when it runs out the rest
// of that phase waits for another day and the boss falls to the band's floor. The S phase is the 回声亭 (「等语音服务器」,
// 「说完了」 = the hit), no scoring, no evidence.
//
// 题即玩法 play-5 (docs/PLAY.md §3 M5, §5.4; LEARN §24): a question is on the boss itself — a choice hangs
// its option balls on HULLBREAKER's weak points (a round on the right one is the answer: the weak-point hit), a typed
// item is the 打字蟹 lobbing its sheet at the hull's armour plate, the S phase is the 回声亭 on the deck (src/learn/play/
// arena/) — never match.paused, never a hold, never a card. The boss still moves only after she has answered: while a
// question is up its brain's cool-down is kept topped up. The one judging path is _judgeRecord below (play/judge.js).
import * as THREE from 'three';
import { G } from '../../core/ctx.js';
import { LEARN } from '../../config.js';
import { LearnFlow } from '../flow.js';
import { prompt, store, bossLevel, daySteps } from '../api.js';
import { EFFECTS } from '../design.js';
import { bossDamage, phaseBudget, streakKind, propOnRight, useProp, relearnPlan, writeStars, fmtClock, rightAnswerOf, relearnTip } from './common.js';
import { judgeRecord } from '../play/judge.js';   // the one judging path (play-8)
import { FormsUi } from './ui.js';
import { ArenaHost } from '../play/arena/host.js';
import { arenaAltPrompt } from '../play/arena/alt.js';

const _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const WEAK = ['eyeL', 'eyeR', 'belly'];

export class BossFlow extends LearnFlow {
  constructor(match, opts = {}) {
    super(match, opts);   // B: hud.start; _place() below makes the phases the gates
    this.form = 'boss';
    this.B = LEARN.boss;
    this.plan = this.level;
    this.rnd = Math.random;
    this.group.visible = false;
    this.ui = new FormsUi(G.hud); this.ui.start(); this.ui.onUse = (i) => this.useProp(i);
    this.boss = match.boss;
    this.asking = null; this.askT = 2.5; this.pi = 0; this.phaseLeft = 0; this.cards = false;
    this.bag = []; this.hintNext = false; this.echoNext = false;
    this.streak = 0; this.rightN = 0; this.firstRight = 0; this.relearn = []; this.relearnRight = 0; this.relearnAsked = false; this.skipped = [];
    this.perPhase = {};
    for (const g of this.gates) this.perPhase[g.phase] = { zh: g.zh, asked: 0, right: 0, firstRight: 0, total: g.items.length, skipped: 0, timeUp: false };
    this.scoredN = this.gates.filter((g) => g.phase !== 'S').reduce((n, g) => n + g.items.length, 0);
    // (B's constructor counted the plan's gates, which are empty for a boss: the questions are the phases' items — the
    // results' 「做对 / 共几题」 reads this; the S booths are not questions)
    this.total = this.scoredN;
    this._prevSpecial = false; this._clockTxt = ''; this._wrapDamage(); this.clock = 0;
    this._pendingMove = false; this._echoClearT = -1; this.A = LEARN.arena; this._nearWait = 0; this._nearSaid = false;
    // 题即玩法 (play-5): the questions are on the boss — the host asks them, judges through _judgeRecord
    this.arena = match.mode === 'learn' ? new ArenaHost(this, { mode: 'boss', boss: () => this.boss }) : null;
    this._startPhase(0);
    this._unsubs = [];
  }

  // the phases as gates: every planned item resolved to its game item (A's bossLevel for the scored ones, the day's
  // speak steps for the S booths); the pos is where the boss spawns (the arena)
  _place() {
    const plan = this.level, w = plan.weekRef;
    const byId = new Map();
    try { for (const g of bossLevel(w).gates) for (const it of g.items) byId.set(it.id, { ...it, _day: g.day }); } catch (e) { /* no week */ }
    try { for (const d of w.days || []) for (const s of daySteps(w, d.n)) if (s.meta.type === 'speak') for (const it of s.items) byId.set(it.id, { ...it, _day: Number(d.n) }); } catch (e) { /* none */ }
    const pos = new THREE.Vector3();
    const b = this.match.boss; if (b) pos.copy(b.pos);
    this.path = [];
    this.gates = plan.phases.map((ph, k) => {
      const items = ph.items.map((ref) => { const it = byId.get(ref.id); return it ? { ...it, _readAloud: !!ref.readAloud, _tries: 0, _form: null } : null; }).filter(Boolean);
      return { id: 'phase:' + ph.id, phase: ph.id, zh: ph.zh, title: `${ph.id} ${ph.zh}`, stepId: ph.id, kind: ph.id === 'S' ? 'lesson' : 'mixed', index: k, pathIndex: 0, node: -1, pos: pos.clone(), state: k === 0 ? 'next' : 'locked', locks: 0, items, queue: items.slice(), hp: ph.hp, moves: ph.moves, minutes: ph.minutes };
    });
  }
  _farFromBoss() { const b = this.boss, a = this.match.local; if (!b || !a || !this.arena) return false; return !this.arena.m1.bossNear(); }
  // only her answers hurt the boss; the squad's (and her own weapon's) hits become a flash
  _wrapDamage() {
    const b = this.boss; if (!b) return;
    const orig = b.applyDamage.bind(b);
    b.applyDamage = (atk, d, weak, point) => (atk && atk._learnHit ? orig(atk, d, weak, point) : (b.model?.flash?.(0.25, !!weak), 0));
    // (题即玩法: her tap-shot at a ball on a weak point flies through the boss's own hit spheres — arena/run.js passes())
    const seg = b.segHit.bind(b);
    b.segHit = (p0, p1, pad) => (this.arena && this.arena.m1.passes(p0) ? null : seg(p0, p1, pad));
  }

  // ---------------------------------------------------------------------------------------------- phases
  _startPhase(i) {
    this.pi = i;
    const g = this.gates[i];
    if (!g) { this._defeated(); return; }
    g.state = 'next';
    this.phaseLeft = phaseBudget(this.plan, g.phase);
    this.arena?.prep(g);   // (the phase's label atlas, drawn at its start)
    this.ui.setPhases(this.gates.map((x, k) => ({ id: x.phase, zh: x.zh, state: k < i ? 'done' : k === i ? 'on' : '' })));
    this.ui.say(`${g.phase} ${g.zh}：${g.items.length} ${g.phase === 'S' ? '张卡' : '题'} · ${fmtClock(this.phaseLeft)}`);
    this.askT = i === 0 ? 2.5 : 3.5;
    this._emit('learn:gate', { id: g.id, index: i + 1, total: this.gates.length, locks: 0, opened: false, phase: g.phase });
  }
  _phaseDone(g, how) {
    g.state = 'open';
    this.arena?.gateOpened(g);
    this._emit('learn:gate', { id: g.id, index: g.index + 1, total: this.gates.length, locks: g.locks, opened: true, phase: g.phase, how });
    if (how === 'time') { this.perPhase[g.phase].timeUp = true; this.perPhase[g.phase].skipped = g.queue.length; this.skipped.push(...g.queue); g.queue.length = 0; this.ui.say(`${g.phase} ${g.zh} 的时间到了 — 剩下的留到另一天`, { coral: true }); }
    else { G.audio?.play?.(EFFECTS.boss.phase.sfx, { volume: 0.7 }); G.hud?.banner?.('custom', EFFECTS.boss.phase.banner[1]); }
    // the boss falls to the band's floor (the next phase begins at its HP)
    const floor = g.hp[1], b = this.boss;
    if (b && !b.dead && b.hpFrac() > floor + 1e-4) this._hit((b.hpFrac() - floor) * b.maxHp, false);
    if (g.phase === this.gates[this.gates.length - 1].phase) { this._defeated(); return; }
    this._startPhase(this.pi + 1);
  }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    this.t += dt;
    this.arena?.update(dt);   // (every frame, paused or not: it waits itself)
    const m = this.match, b = this.boss;
    if (this.finishT >= 0) { this.finishT -= dt; if (this.finishT < 0) this._results(); return; }
    if (this.phase === 'done') return;
    if (b && b.dead) { this.phase = 'done'; this.finishT = 4.2; this.ui.say('周考打完了！'); return; }
    if (m.state !== 'playing' || !b) return;
    // the boss HUD (bar, chip, callouts) keys off match.mode === 'boss' when the match starts; a learning boss is mode 'learn'
    if (G.hud?.boss && !G.hud.boss.on) G.hud.boss.setMode(true, b);
    const g = this.gates[this.pi]; if (!g) return;
    // the boss moves only after she has answered (LEVELS §2.5): while a question is up its brain never gets to plan a
    // move (its cool-down is kept topped up — the squad fights on, nothing is paused); the phase's clock waits with it
    const busy = !!(this.asking || this.cards);
    if (busy && b.brain && !b.move && !m.paused) { b.brain.cool = Math.max(b.brain.cool, this.A.bossHold); b.brain.plan = null; }
    if (this._echoClearT >= 0 && !m.paused) { this._echoClearT -= dt; if (this._echoClearT < 0) { this._echoClearT = -1; if (this.arena && this.arena.kind === 'echo') this.arena.clear(); } }
    if (!m.paused && !busy) {
      this.clock += dt;
      this.phaseLeft -= dt;
      m.time = Math.max(0.06, this.phaseLeft);   // (the display; the match never calls time itself)
      const txt = `${g.phase} ${g.zh} · ${fmtClock(this.phaseLeft)}`;
      if (txt !== this._clockTxt && G.hud?.timerTxt) { this._clockTxt = txt; G.hud.timerTxt.textContent = txt; }
      if (this.phaseLeft <= 0) { this._phaseDone(g, 'time'); return; }
    }
    this._propKey(m.local);
    if (this.asking || this.cards) return;
    if (!g.queue.length) {
      // the phase's questions are out: a 回炉 beat before the last phase, else the band is cleared
      if (g.phase !== 'S' && this.relearn.length && !this.relearnAsked && this.pi === this.gates.length - 2) {
        this.relearnAsked = true;
        g.queue.push(...relearnPlan(this.relearn).map((it) => ({ ...it, _tries: 1, _form: 'alt', _relearn: true })));
        this.ui.say(`回炉门：错过的 ${g.queue.length} 个再来一次（不掉血）`);
        return;
      }
      this._phaseDone(g, 'cleared'); return;
    }
    // between its moves: idle, visible, no roar / intro running → the next question
    const idle = b.visible && !b.move && b.anim === 0 && !b.invuln;
    if (idle && (!this.arena || (m.local && m.local.alive))) {   // (题即玩法: never while she is splatted — the camera is not hers)
      this.askT -= dt;
      if (this.askT <= 0) {
        // (题即玩法: a choice hangs on its weak points — the boss waits up to LEARN.arena.bossWait s for her to come within
        // bossNear m, once saying so; then the options come towards it within her shot)
        if (g.phase !== 'S' && this.arena && this._farFromBoss() && (this._nearWait += dt) < this.A.bossWait) { if (!this._nearSaid) { this._nearSaid = true; this.ui.say('走近 Boss——答案挂在它的弱点上'); } return; }
        this._nearWait = 0; if (this._nearSaid) { this._nearSaid = false; this.ui.say(''); }
        if (g.phase === 'S') this._card(g); else this._ask(g);
      }
    }
  }

  // ---------------------------------------------------------------------------------------------- questions (L / R / W)
  // (题即玩法: the boss's brain runs after the learn layer in a frame — match.update — so a question asked this frame must
  // hold its cool-down now, or the brain starts a move in the very frame she is asked)
  _holdBoss() { const b = this.boss; if (this.arena && b && b.brain && !b.move) { b.brain.cool = Math.max(b.brain.cool, this.A.bossHold); b.brain.plan = null; } }
  _ask(g) {
    this._holdBoss();
    const item = g.queue.shift();
    const p = item._form === 'alt' ? this._altPrompt(item) : prompt(item);
    if (item._relearn) { const tip = relearnTip(item); p.zh = [tip.zh, p.zh].filter(Boolean).join('　'); p._tip = tip; }
    if (this.hintNext && p.type !== 'choice') { this.hintNext = false; p.zh = ['提示：' + ((item.meta && (item.meta.hint || item.meta.zhFull)) || item.zh || ''), p.zh].filter(Boolean).join('　'); p._hinted = true; }
    this.asking = { gate: g, item, p };
    this.asked++; this.perPhase[g.phase].asked++;
    this._emit('learn:question', { itemId: item.id, gate: g.id, type: p.type, form: item._relearn ? 'relearn' : item._form || 'normal', phase: g.phase });
    // 题即玩法: the question is on the boss — its weak points carry the options, the rig lobs at its hull (no hold, no pause, no card)
    if (!this.arena || !this.arena.canAsk(g, item, p)) {   // (none in the three weeks: tests/learn/play-arena.test.mjs — passed over, never a card)
      console.warn('[boss] no station for', item.id, p.type);
      this._after(g, false); return;
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

  // The one judging path (PLAY §1 rule 2), whatever asked — a round on a weak point's ball, the typed sheet on the hull: judge (B's mapping of the reworded forms) → the day's first answer into her progress (hinted →
  // H; her own claim → S) → the hit or the boss's move (pending until the verdict has been shown: _after), the retry /
  // 回炉. A near-miss sentence (canClaim) is HELD: { held: true }, nothing written, no lock, no move — the caller offers
  // 「我的写法也对」 and comes back with o.decided (o.claim: she claimed it; claimJudge decides whether it stands).
  // o.judged: a verdict already computed; o.socket / o.hit: where the answering round struck (the burst). Same shape as
  // flow.js's: { r, first, again }. (After play-wire's _judgeRecord(…, o) merges, the recording lines can be super's.)
  _judgeRecord(g, item, p, ans, o = {}) {
    const P = this.perPhase[g.phase] || (this.perPhase[g.phase] = { zh: '', asked: 0, right: 0, firstRight: 0, total: 0, skipped: 0, timeUp: false });
    // (a near-miss sentence is always held: the W phase waits for her — the boss does not move until she decides)
    const out = judgeRecord({ item, p, ans, o: { judged: o.judged, hinted: o.hinted, hold: true, decided: o.decided, claim: o.claim }, store });
    const { r, first, self, hinted } = out;
    if (out.held) { this._claimHeld = { itemId: item.id }; return { r, first: false, again: false, held: true }; }
    if (o.decided) this._claimHeld = null;
    if (first) { this.firsts++; if (r.ok) { this.firstRight++; P.firstRight++; } }
    if (r.ok) { this.right.add(item.id); P.right++; }
    this._emit('learn:answer', { itemId: item.id, ok: r.ok, first, gate: g.id, hinted, relearn: !!item._relearn, phase: g.phase, ...(self ? { self: true } : {}) });
    let again = false, move = false;
    if (r.ok) {
      if (item._relearn) this.relearnRight++;
      else this._hit(bossDamage(this.plan, g.phase) * this.boss.maxHp, true, o.socket, o.hit);
      this.streak++; this.rightN++;
      this._onRight();
    } else {
      this.streak = 0; g.locks++; move = true;
      if (!item._relearn && item._tries < this.P.retries) { item._tries++; item._form = 'alt'; g.queue.push(item); again = true; G.audio?.play?.(EFFECTS.boss.wrong.sfx, { volume: 0.6 }); }
      else { G.audio?.play?.(EFFECTS.boss.wrong2.sfx, { volume: 0.6 }); if (!item._relearn) this.relearn.push(item); }
    }
    this._pendingMove = move;
    return { r, first, again, self };
  }
  // the arena's stations call this when their verdict has been shown (the puzzle's name for it): the move or the next question
  _askNext(g) { if (this.arena) this.arena.clear(); this._after(g, this._pendingMove); }
  // the other form of a missed item: the arena's (a word's 回炉 choice stays ink balls, a dictation is heard slowly, a
  // sentence is typed again with its reference given), else B's
  _altPrompt(item) {
    if (this.arena) { const p = arenaAltPrompt(this.gates, item); if (p) return p; }
    return super._altPrompt(item);
  }
  _after(g, move) {
    this.asking = null; this._pendingMove = false;
    this.hud?.hide(); this.hud?.el.classList.remove('is-walk');
    if (move) this._bossMove(g);
    else this.askT = this.B.askGap;
  }
  // a wrong answer: the boss gets a move of its phase (telegraphed ≥ 0.6 s); she dodges, then the next question
  _bossMove(g) {
    const b = this.boss, moves = (g.moves && g.moves.length ? g.moves : ['slam']).filter((id) => id !== 'crablets' || b.phase >= 2).filter((id) => id !== 'frenzy' || b.phase >= 3);
    const id = moves[(this.rnd() * moves.length) | 0] || 'slam';
    if (b.brain) { b.brain.force = id; b.brain.cool = 0; b.brain.plan = null; }
    this.askT = this.B.dodge + 2.0;
    this.ui.say('答错了 — 躲一下！', { coral: true });
    this._emit('learn:bossMove', { move: id });
  }
  // a weak-point hit (her answer): through applyDamage so the bar, chip, numbers and phases are the boss's own
  // (socket / at: the weak point the answering round struck — play-5's option balls — else a weak point at random)
  _hit(amount, weak, socket = null, at = null) {
    const b = this.boss, a = this.match.local;
    if (!b || b.dead) return;
    const before = b.hp;
    a._learnHit = true;
    const sock = socket || WEAK[(this.rnd() * WEAK.length) | 0];
    let point = null; try { point = at ? new THREE.Vector3(at.x, at.y, at.z) : b.model?.getSocket ? b.model.getSocket(sock, _v).clone() : null; } catch (e) { point = null; }
    b.applyDamage(a, amount, weak, point);
    a._learnHit = false;
    if (point) G.fx?.burst?.(point, _up, G.teamColors[0], { count: weak ? 18 : 8, speed: 5, size: 0.1 });
    this._emit('learn:bossHp', { hp: +b.hp.toFixed(0), max: b.maxHp, frac: +b.hpFrac().toFixed(3), took: +(before - b.hp).toFixed(0) });
  }
  _onRight() {
    const a = this.match.local, E = EFFECTS.boss.right;
    G.audio?.play?.(E.sfx, { volume: 0.8 });
    a.character.trigger?.(E.trigger);
    G.hud?.feed?.({ text: E.feed, color: G.teamHex[0] });
    const got = propOnRight('boss', this.rightN, this.streak, this.bag, this.rnd);
    if (got.drop) { this.bag.push(got.drop); this.ui.setBag(this.bag, this.bag.length - 1); this.ui.say(`拿到道具：${useProp(got.drop).zh}`); }
    const sk = streakKind(this.streak);
    if (sk === 'streak3') { a.special = a.specialCost(); G.audio?.play?.(EFFECTS.boss.streak3.sfx, { volume: 0.8 }); this.ui.say('连对 3 题 · 特殊槽满'); }
    if (sk === 'streak5') { G.audio?.play?.(EFFECTS.boss.streak5.sfx, { volume: 0.8 }); G.hud?.banner?.('custom', EFFECTS.boss.streak5.banner[1]); const b = this.boss; if (b && b.brain) { b.brain.force = 'charge'; b.brain.cool = 0; b.brain.plan = null; } this.ui.say('连对 5 题 — Boss 要撞墙了（眩晕）'); }
  }

  // ---------------------------------------------------------------------------------------------- the S phase
  // the 回声亭 on the deck in front of her — she steps onto its pad, the sample plays, stepping off is 说完了 (_echoDone)
  // (this.cards: a booth is up — the boss waits, as for a question)
  _card(g) {
    this._holdBoss();
    const item = g.queue.shift();
    this.cards = true;
    this._emit('learn:question', { itemId: item.id, gate: g.id, type: 'speak', form: 'echo', phase: 'S' });
    this.perPhase.S.asked++;
    if (!this.arena || !this.arena.askEcho(g, item)) { console.warn('[boss] no booth for', item.id); this._echoDone(g, item, { how: 'none' }); }
  }
  // 说完了 (the booth's pad stepped off, or its board's button): the hit — unscored, nothing written (PLAY §3 M7)
  _echoDone(g, item, d) {
    if (!this.cards) return;
    this.cards = false; this.perPhase.S.right++;
    this._emit('learn:answer', { itemId: item.id, ok: true, first: false, gate: g.id, phase: 'S', unscored: true, how: d && d.how });
    this._hit(bossDamage(this.plan, 'S') * this.boss.maxHp, true);
    G.audio?.play?.(EFFECTS.boss.right.sfx, { volume: 0.8 });
    this.askT = 1.5;
    if (this.arena) this._echoClearT = 1.2;   // (the pad fills with her ink first, then the booth goes)
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
    if (P.effect === 'hint') { this.hintNext = true; this.ui.say('墨雨：下一题先给提示（记为提示作答）'); }
    else if (P.effect === 'replay') { this.echoNext = true; this.ui.say('回声：下一题多听一遍'); }
    G.audio?.play?.(P.sfx, { volume: 0.8 });
    this._emit('learn:propUse', { id, effect: P.effect });
  }

  // ---------------------------------------------------------------------------------------------- the end
  _defeated() {
    if (this.phase === 'done') return;
    const b = this.boss;
    if (b && !b.dead) this._hit(b.hp + 1, true);   // the last card was the last hit; make sure it fell
    this.phase = 'done';
    this.match.local.character.setDance?.('victory');
    G.audio?.play?.(EFFECTS.boss.defeat.sfx, { volume: 0.9 });
    this.finishT = 4.2;
  }
  _results() {
    this.finishT = -1;
    this.match.paused = true;   // (parks the match in 'finish': INKWAVE's own boss results stay out of the way)
    G.input?.exitLock?.();
    this.ui.say(''); this.ui.setPhases(null);
    const key = `${this.level.weekRef ? this.level.weekRef.id : 'w' + this.week}boss`;
    writeStars(key, 0, null, { trophy: fmtClock(this.clock) });
    let dueIds = []; try { dueIds = store.due(this.level.weekRef); } catch (e) { dueIds = []; }
    const byId = new Map(); for (const g of this.gates) for (const it of g.items) byId.set(it.id, it);
    const due = dueIds.map((id) => byId.get(id)).filter(Boolean).slice(0, 12).map((it) => ({ en: it.en, zh: it.zh }));
    const per = this.perPhase;
    const data = { done: this.right.size, total: this.scoredN, due, firsts: this.firsts, firstRight: this.firstRight, scored: this.scoredN, locks: this.gates.reduce((n, g) => n + g.locks, 0), week: this.week, day: 0, form: 'boss', clock: +this.clock.toFixed(1), perPhase: per, skipped: this.skipped.length, relearn: this.relearn.length, relearnRight: this.relearnRight };
    this._emit('learn:done', data);
    this.hud?.results(data, {
      again: () => G.game?.api?.startLearn?.({ week: this.week, kind: 'boss' }),
      menu: () => G.game?.api?.quitMatch?.(),
    });
    if (this.hud) this.hud.rTitle.textContent = `第 ${this.week} 周周考打完了`;
    this.ui.resultsExtra([
      ...['L', 'R', 'W'].filter((k) => per[k]).map((k) => ({ b: `${k} ${per[k].zh}`, t: `首答对 ${per[k].firstRight} / ${per[k].total}${per[k].timeUp ? `（时间到，${per[k].skipped} 题留到另一天）` : ''}` })),
      per.S ? { b: 'S 口语', t: `${per.S.right} / ${per.S.total} 张说完了（评分等语音服务器）` } : '',
      { b: fmtClock(this.clock), t: '用时（只是奖杯；估分第二版接 sched.js）' },
      this.relearn.length ? { b: `${this.relearnRight} / ${this.relearn.length}`, t: '回炉清了' } : '没有要回炉的',
    ].filter(Boolean), null);
  }

  debug() {
    const b = this.boss;
    return { form: 'boss', phase: this.gates[this.pi] ? this.gates[this.pi].phase : null, pi: this.pi, phases: this.gates.map((g) => ({ id: g.phase, n: g.items.length, left: g.queue.length, state: g.state })), hp: b ? +b.hpFrac().toFixed(3) : null, bossPhase: b ? b.phase : null, idle: b ? (b.visible && !b.move && b.anim === 0) : null, cards: this.cards, phaseLeft: +this.phaseLeft.toFixed(1), bag: this.bag.slice(), streak: this.streak, relearn: this.relearn.length, per: this.perPhase, actors: this.match.actors.length, asking: this.asking ? { item: this.asking.item.id, type: this.asking.p.type, play: this.asking.play || null } : null, brainCool: b && b.brain ? +b.brain.cool.toFixed(2) : null, move: b && b.move ? b.move.id : null, arena: this.arena ? this.arena.debug() : null };
  }
  effects() { const b = this.boss; return { hp: b ? +b.hpFrac().toFixed(3) : null, bossPhase: b ? b.phase : null, move: b && b.move ? b.move.id : null, phase: this.gates[this.pi] ? this.gates[this.pi].phase : null, streak: this.streak }; }

  dispose() { this.arena?.dispose(); this.arena = null; this.ui?.end(); super.dispose(); }
}
