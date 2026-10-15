// 关卡学习 — Boss 战 boss (docs/LEVELS.md §2.5): the week's 周考 as HULLBREAKER. bossPlan(week) picks the items — L
// listening 20 · R reading / vocab / grammar 20 · W the week's 3 sentences · S 4 Part 1 questions + 2 read-aloud —
// and maps them to the boss's HP bands 100–66 · 66–33 · 33–10 · 10–0 (the boss's own phases 1 / 2 / 3 follow at 66 /
// 33 %: crablets, then the frenzy). Questions come between its moves (the boss idle, no telegraph running): the match
// is held while she answers (the boss only moves after she has answered). Right = one weak-point hit worth the
// phase's band / its questions (boss.applyDamage, so the HUD's bar, chip and damage numbers are INKWAVE's); wrong =
// the boss gets a move of its phase (brain.force) and she dodges for LEARN.boss.dodge seconds; the item comes back
// reworded once, then joins the 回炉 queue (asked again at the end). Streak 3 fills her special; streak 5 forces a
// charge (the stun window). Her squad (3 bots) fights it as in Boss Battle, but only her answers hurt it: every
// other hit is turned into a flash. Each phase has a time budget (LEARN.boss.phaseTime); when it runs out the rest
// of that phase waits for another day and the boss falls to the band's floor. The S phase is cards (「等语音服务器」,
// 「说完了」 = the hit), no scoring, no evidence.
import * as THREE from 'three';
import { G } from '../../core/ctx.js';
import { LEARN } from '../../config.js';
import { LearnFlow } from '../flow.js';
import { prompt, store, bossLevel, daySteps } from '../api.js';
import { EFFECTS } from '../design.js';
import { bossDamage, phaseBudget, streakKind, propOnRight, useProp, relearnPlan, writeStars, fmtClock, judgeAnswer, rightAnswerOf, relearnTip } from './common.js';
import { FormsUi } from './ui.js';

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
    this.hold = false; this.asking = null; this.askT = 2.5; this.pi = 0; this.phaseLeft = 0; this.cards = false;
    this.bag = []; this.hintNext = false; this.echoNext = false;
    this.streak = 0; this.rightN = 0; this.firstRight = 0; this.relearn = []; this.relearnRight = 0; this.relearnAsked = false; this.skipped = [];
    this.perPhase = {};
    for (const g of this.gates) this.perPhase[g.phase] = { zh: g.zh, asked: 0, right: 0, firstRight: 0, total: g.items.length, skipped: 0, timeUp: false };
    this.scoredN = this.gates.filter((g) => g.phase !== 'S').reduce((n, g) => n + g.items.length, 0);
    this._prevSpecial = false; this._clockTxt = ''; this._wrapDamage(); this.clock = 0;
    this._startPhase(0);
    this._unsubs = [];
  }

  // the phases as gates: every planned item resolved to its game item (A's bossLevel for the scored ones, the day's
  // speak steps for the S cards); the pos is where the boss spawns (the arena)
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
  // only her answers hurt the boss; the squad's (and her own weapon's) hits become a flash
  _wrapDamage() {
    const b = this.boss; if (!b) return;
    const orig = b.applyDamage.bind(b);
    b.applyDamage = (atk, d, weak, point) => (atk && atk._learnHit ? orig(atk, d, weak, point) : (b.model?.flash?.(0.25, !!weak), 0));
  }

  // ---------------------------------------------------------------------------------------------- phases
  _startPhase(i) {
    this.pi = i;
    const g = this.gates[i];
    if (!g) { this._defeated(); return; }
    g.state = 'next';
    this.phaseLeft = phaseBudget(this.plan, g.phase);
    this.ui.setPhases(this.gates.map((x, k) => ({ id: x.phase, zh: x.zh, state: k < i ? 'done' : k === i ? 'on' : '' })));
    this.ui.say(`${g.phase} ${g.zh}：${g.items.length} ${g.phase === 'S' ? '张卡' : '题'} · ${fmtClock(this.phaseLeft)}`);
    this.askT = i === 0 ? 2.5 : 3.5;
    this._emit('learn:gate', { id: g.id, index: i + 1, total: this.gates.length, locks: 0, opened: false, phase: g.phase });
  }
  _phaseDone(g, how) {
    g.state = 'open';
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
    const m = this.match, b = this.boss;
    if (this.finishT >= 0) { this.finishT -= dt; if (this.finishT < 0) this._results(); return; }
    if (this.phase === 'done') return;
    if (b && b.dead) { this.phase = 'done'; this.finishT = 4.2; this.ui.say('周考打完了！'); return; }
    if (m.state !== 'playing' || !b) return;
    // the boss HUD (bar, chip, callouts) keys off match.mode === 'boss' when the match starts; a learning boss is mode 'learn'
    if (G.hud?.boss && !G.hud.boss.on) G.hud.boss.setMode(true, b);
    const g = this.gates[this.pi]; if (!g) return;
    if (!m.paused) {
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
    if (idle) { this.askT -= dt; if (this.askT <= 0) { if (g.phase === 'S') this._card(g); else this._ask(g); } }
  }

  // ---------------------------------------------------------------------------------------------- questions (L / R / W)
  _ask(g) {
    const item = g.queue.shift(), a = this.match.local, m = this.match;
    const p = item._form === 'alt' ? this._altPrompt(item) : prompt(item);
    if (item._relearn) { const tip = relearnTip(item); p.zh = [tip.zh, p.zh].filter(Boolean).join('　'); p._tip = tip; }
    if (this.hintNext && p.type !== 'choice') { this.hintNext = false; p.zh = ['提示：' + ((item.meta && (item.meta.hint || item.meta.zhFull)) || item.zh || ''), p.zh].filter(Boolean).join('　'); p._hinted = true; }
    this.asking = { gate: g, item, p };
    this.hold = true; a.intent.move.set(0, 0, 0); a.intent.fire = a.intent.jump = false;
    m.paused = true;               // the boss only moves after she has answered (B's order: hold, then the mouse)
    G.input?.exitLock?.();
    G.audio?.play?.('ui_confirm', { volume: 0.6 });
    this.asked++; this.perPhase[g.phase].asked++;
    this._emit('learn:question', { itemId: item.id, gate: g.id, type: p.type, form: item._relearn ? 'relearn' : item._form || 'normal', phase: g.phase });
    this.hud?.ask(p, {
      gate: { index: g.index + 1, total: this.gates.length, locks: g.locks, title: g.title },
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
    const r = judgeAnswer(item, p, ans), P = this.perPhase[g.phase];
    const rec = store.recordFirst({ itemId: item.id, item, ok: r.ok, pct: r.pct, hinted: !!p._hinted, at: Date.now() });
    const first = !!rec.first;
    if (first) { this.firsts++; if (r.ok) { this.firstRight++; P.firstRight++; } }
    if (r.ok) { this.right.add(item.id); P.right++; }
    this._emit('learn:answer', { itemId: item.id, ok: r.ok, first, gate: g.id, hinted: !!p._hinted, relearn: !!item._relearn, phase: g.phase });
    let again = false, move = false;
    if (r.ok) {
      if (item._relearn) this.relearnRight++;
      else this._hit(bossDamage(this.plan, g.phase) * this.boss.maxHp, true);
      this.streak++; this.rightN++;
      this._onRight();
    } else {
      this.streak = 0; g.locks++; move = true;
      if (!item._relearn && item._tries < this.P.retries) { item._tries++; item._form = 'alt'; g.queue.push(item); again = true; G.audio?.play?.(EFFECTS.boss.wrong.sfx, { volume: 0.6 }); }
      else { G.audio?.play?.(EFFECTS.boss.wrong2.sfx, { volume: 0.6 }); if (!item._relearn) this.relearn.push(item); }
    }
    this.hud?.verdict({ ok: r.ok, why: r.why, canonical: r.canonical, locks: g.locks, again }, () => this._after(g, move));
  }
  _after(g, move) {
    this.asking = null; this.hold = false;
    this.hud?.hide(); this.hud?.el.classList.remove('is-walk');
    this.match.paused = false;
    G.input?.requestLock?.(); if (G.game) G.game._relock = true;
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
  _hit(amount, weak) {
    const b = this.boss, a = this.match.local;
    if (!b || b.dead) return;
    const before = b.hp;
    a._learnHit = true;
    const sock = WEAK[(this.rnd() * WEAK.length) | 0];
    let point = null; try { point = b.model?.getSocket ? b.model.getSocket(sock, _v).clone() : null; } catch (e) { point = null; }
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

  // ---------------------------------------------------------------------------------------------- the S cards
  _card(g) {
    const item = g.queue.shift(), m = this.match, meta = item.meta || {};
    this.cards = true; this.hold = true;
    m.paused = true; G.input?.exitLock?.();
    const n = g.items.length - g.queue.length;
    const spec = item._readAloud
      ? { title: `S 口语 · 朗读 ${n} / ${g.items.length} · 评分等语音服务器`, head: '朗读这句：', cards: [{ label: '句子', en: item.en, zh: item.zh }], rows: [{ en: '听范读', zh: '', tts: item.tts || item.en }] }
      : { title: `S 口语 · 第 ${n} / ${g.items.length} 问 · 评分等语音服务器`, head: item.en, rows: [{ en: item.en, zh: item.zh, tts: item.tts || item.en }], cards: [meta.model ? { label: '范例（跟着说 2–4 句）', en: meta.model, zh: meta.modelZh } : null, ...(meta.phrases || []).slice(0, 3).map((ph) => ({ label: '句型', en: typeof ph === 'string' ? ph : ph.en, zh: typeof ph === 'string' ? '' : ph.zh })), meta.tip ? { label: '提示', en: '', zh: meta.tip } : null].filter(Boolean) };
    this._emit('learn:question', { itemId: item.id, gate: g.id, type: 'speak', form: 'card', phase: 'S' });
    this.perPhase.S.asked++;
    this.ui.showBoard({ ...spec, go: '说完了' }, () => {
      this.ui.hideBoard(); this.cards = false; this.hold = false; this.perPhase.S.right++;
      this._emit('learn:answer', { itemId: item.id, ok: true, first: false, gate: g.id, phase: 'S', unscored: true });
      this._hit(bossDamage(this.plan, 'S') * this.boss.maxHp, true);
      G.audio?.play?.(EFFECTS.boss.right.sfx, { volume: 0.8 });
      m.paused = false; G.input?.requestLock?.(); if (G.game) G.game._relock = true;
      this.askT = 1.5;
    });
  }
  prep() { return this.cards; }

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
    this.phase = 'done'; this.hold = true;
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
    return { form: 'boss', phase: this.gates[this.pi] ? this.gates[this.pi].phase : null, pi: this.pi, phases: this.gates.map((g) => ({ id: g.phase, n: g.items.length, left: g.queue.length, state: g.state })), hp: b ? +b.hpFrac().toFixed(3) : null, bossPhase: b ? b.phase : null, idle: b ? (b.visible && !b.move && b.anim === 0) : null, hold: this.hold, cards: this.cards, phaseLeft: +this.phaseLeft.toFixed(1), bag: this.bag.slice(), streak: this.streak, relearn: this.relearn.length, per: this.perPhase, actors: this.match.actors.length };
  }
  effects() { const b = this.boss; return { hp: b ? +b.hpFrac().toFixed(3) : null, bossPhase: b ? b.phase : null, move: b && b.move ? b.move.id : null, phase: this.gates[this.pi] ? this.gates[this.pi].phase : null, streak: this.streak }; }

  dispose() { this.ui?.end(); super.dispose(); }
}
