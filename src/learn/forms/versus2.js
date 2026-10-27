// 关卡学习 — 双人联机赛 versus2 (docs/LEARN.md §10, §14): an online Zone Control match — INKWAVE's own room, lobby,
// intro, rules, clock, judge and results — with the learning laid over it. The host (the room's referee, as it is for
// the clock and the zones) puts ONE question to everyone at once ({k:'lq'}); every player answers it on their own
// screen (their first answer of the day goes to their own store: LEARN §8 recordFirst, with the item); the first right
// answer — by each player's own time from the question appearing — floods the live zone with that side's ink
// ({k:'lr'}: the host picks the spot, every screen floods it, since paint.flood is not replicated) and charges that
// player's special; a wrong answer costs ink from the tank. A side with no human in it answers through its bots' dice
// (the duel's BOT_ANSWER). The question closes when everyone has answered or its time is up ({k:'lc'}); the next one
// comes askGap later. When the queue is done the host calls the match by the zone counts ('answered'); a knockout or the
// clock (+ overtime) ends it first, as in any Zone Control match. The results screen is INKWAVE's, with a strip of
// who inked how many (resultsData()).
//
// Questions: the day's duel plan, one gate at a time in turn, due items first — both players' due lists merged, the
// longer list giving more (duo.js mergeDue / buildQueue). A question nobody got right comes back once, reworded.
//
// 题即玩法 play-6 (docs/PLAY.md §5.5, LEARN §25): a question is the same thing on both screens — the duel's
// cluster over the contested zone (play-5's ArenaHost: ink targets for every choice, the 打字蟹 with its ring and bubble
// for anything typed), each screen laying out its own over the zone for its own camera, the same objects in the same
// order (a reworded one from a seeded random: duo.js duoAltPrompt). Nobody is held, paused or shown a card; the answer
// goes the way it always did ('la' → the host's referee → 'lr' floods on every screen → 'lc'), through the one judging
// path _judgeRecord (play/judge.js). The seconds left are the strip's chip.
import * as THREE from 'three';
import { G, emit } from '../../core/ctx.js';
import { LEARN, PLAYER } from '../../config.js';
import { zonePlan } from '../../game/bots.js';
import { LearnFlow } from '../flow.js';
import { prompt, store } from '../api.js';
import { BOT_ANSWER, EFFECTS } from '../design.js';
import { duelFlood, streakKind, rightAnswerOf } from './common.js';
import { judgeRecord } from '../play/judge.js';   // the one judging path (play-8)
import { zoneCellsXYZ } from './duel.js';
import { FormsUi } from './ui.js';
import { Referee, buildQueue, mergeDue, canRequeue, answerTime, tally, validQ, duoAltPrompt, seedOf } from './duo.js';
import { ArenaHost } from '../play/arena/host.js';

const _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const now = () => performance.now() / 1000;
const r1 = (x) => Math.round(x * 10) / 10;

export class Versus2Flow extends LearnFlow {
  get walkBar() { return false; }   // (LEARN §48: no route to walk — a Zone Control match: no walk bar, hud-learn start())
  // (LEARN §48: a Zone Control match with a team — the HUD keeps its 地图 key and corner map here, hud-learn start())
  get mapKey() { return true; }
  // LEARN §55: … but while a station holds the lens (the 打字蟹, a flip card: ArenaHost's PlayCam) the overhead map cannot
  // open (cameraRig swoops only from the follow camera) — the key lit up and nothing came, and it sprang overhead the moment
  // the lens came back. touch.js reads mapHold (the key dims, its latch drops) and asks mapWhy on a press; Tab / M on a
  // desktop ask it too (update)
  get mapHold() { return !!(this.arena && this.arena.cam && this.arena.cam.on); }
  mapWhy() {
    if (this.t - (this._mapWhyT ?? -Infinity) < 1.5) return;   // (one line a press, not a line a frame)
    this._mapWhyT = this.t;
    this.ui.say('镜头正对着这道题 · 答完再看地图');
  }
  constructor(match, opts = {}) {
    super(match, opts);   // B: the level (the day's duel plan) and hud.start; _place() below: no route, no gates
    this.form = 'versus2';
    this.V = LEARN.versus2;
    this.short = !!(opts.short || this.level.short);
    this.nQ = this.short ? this.V.short.questions : this.V.questions;
    this.total = this.nQ;
    this.byId = opts.byId || new Map(this.level.gates.flatMap((g) => g.items.map((it) => [it.id, it])));
    this.model = BOT_ANSWER[match.opts.difficulty] || BOT_ANSWER.normal;
    this.group.visible = false;
    this.hud?.el.classList.remove('is-walk');
    // a live Zone Control match: the phone keeps its fire / sub / special / cheer buttons (B's learn layer hides them
    // for the solo levels, where answering is the only action)
    G.touch?.el?.classList.remove('is-learn');
    this.ui = new FormsUi(G.hud); this.ui.start();
    this.queue = null; this.qi = -1;    // the match's questions (everyone holds them: 'ls'), the index of the last opened
    this.q = null;                       // the live question on this screen
    this.qs = new Map();                 // q → that question as this screen saw it
    this.results = [];                   // closed questions { q, id, win, by, res } (the results strip, the tally)
    this.dues = new Map();               // host: player id → their due ids ('ld')
    this.ref = null; this.refNext = this.V.firstAsk; this.endT = -1; this.ended = false; this.refStreak = new Map();
    this.asking = null;
    this.streak = 0; this.rightN = 0; this.firstRight = 0; this.wins = 0;
    this._cells = new Map();
    this._dueSent = false; this._wasHost = this.isHost; this._stopped = false;
    this._unsub = G.net?.on?.('leave', (e) => { if (this.isHost && e && e.player) this.ref?.leave(e.player.id); });
    // 题即玩法 (play-6): the questions are things over the live zone, on her side's ink (the guest plays team 1). It is
    // also this.play: the flow's dispose takes it, and the touch layer leaves the strip's ▶ to the strip
    this.vg = new Map();   // queue entry index → that question's gate (an arena round of one: its own label atlas)
    this.arena = new ArenaHost(this, { mode: 'zone', anchor: (out) => this._zoneCentre(out), team: this._team(), edges: true, settle: true });
    this.play = this.arena;
  }
  _team() { const me = (this.match.opts.roster || []).find((r) => !r.bot && r.owner === this.myId); return me ? me.team | 0 : (this.match.local ? this.match.local.team | 0 : 0); }
  // the live zone's centre on its floor (the cluster floats LEARN.arena.lift over it — the duel's own anchor)
  _zoneCentre(out) {
    const Z = this.match.zones, z = Z && Z.active && Z.active.zones[0], c = z ? z.center : null;
    return c ? out.set(c[0], c[1], c[2]) : (this.match.local ? out.copy(this.match.local.pos) : out.set(0, 0, 0));
  }
  // a queue entry's gate (an arena round of one question): its labels drawn once a question ahead (_prepAhead)
  _gateOf(i, item) {
    let g = this.vg.get(i);
    if (!g) { g = { id: 'v2:' + i, index: i, title: '', items: [item], queue: [], locks: 0, state: 'next' }; this.vg.set(i, g); }
    return g;
  }
  // the next question's label atlas, drawn while the last one closes (askGap before it comes up — never mid-question);
  // a reworded one draws its own small atlas when it comes (its options are not the engine's)
  _prepAhead(i) {
    if (!this.arena || !this.queue) return;
    const e = this.queue[i], item = e && this.byId.get(e.id);
    if (item && !e.alt) this.arena.prep(this._gateOf(i, item));
  }
  // a reworded question, the same on every screen (duo.js duoAltPrompt: seeded by the question's number and id)
  _altFor(it, d) {
    return duoAltPrompt(this.level.gates, it, seedOf(d.q, d.id), (x) => this._altPrompt(x)) || this._altPrompt(it);
  }

  _place() { this.path = []; this.gates = []; }   // (B's flow puts gates on a route; here the questions come to you)

  get isHost() { return !!G.net?.isHost; }
  get myId() { return G.net?.myId || null; }
  // the room's humans still here (the roster's players; a player who left is the host's bot now and answers nothing)
  people() {
    const pres = G.net?._members;
    return (this.match.opts.roster || []).filter((r) => !r.bot && (r.owner === this.myId || !pres || pres.has(r.owner)))
      .map((r) => ({ pid: r.owner, team: r.team, name: r.name, self: r.owner === this.myId }));
  }

  // ---------------------------------------------------------------------------------------------- the wire
  _bcast(d) { G.net?.tr?.broadcast(d); this.onNet(this.myId, d); }
  _toHost(d) { if (this.isHost) this.onNet(this.myId, d); else G.net?.tr?.sendTo(G.net.hostId, d); }
  onNet(from, d) {
    if (!validQ(d)) return;
    const fromHost = from === G.net?.hostId;
    switch (d.k) {
      case 'ls': if (fromHost && Array.isArray(d.ids)) { this.queue = d.ids.filter((e) => Array.isArray(e)).map(([id, alt]) => ({ id: String(id), alt: alt ? 1 : 0 })); this._prepAhead(this.qi + 1); } break;
      case 'ld': if (this.isHost && Array.isArray(d.due)) this.dues.set(from, d.due.filter((x) => typeof x === 'string').slice(0, 200)); break;
      case 'lq': if (fromHost) this._onAsk(d); break;
      case 'la': if (this.isHost && this.ref) this.ref.answer(from, d.ok, d.ms, now(), !!d.none); break;
      case 'lr': if (fromHost) this._onInk(d); break;
      case 'lc': if (fromHost) this._onClose(d); break;
    }
  }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    this.t += dt;
    const m = this.match;
    this.arena?.update(dt);   // (every frame: it waits itself while paused)
    if (m.state === 'playing') {
      if (this.mapHold && G.input && (G.input.wasPressed('Tab') || G.input.wasPressed('KeyM'))) this.mapWhy();   // (LEARN §55)
      // a guest tells the host which of the week's items are due on its own store (shared queue, LEARN §4)
      if (!this._dueSent && !this.isHost && G.net?.tr) { this._dueSent = true; let due = []; try { due = store.due(this.level.weekRef || this.week); } catch (e) { due = []; } G.net.tr.sendTo(G.net.hostId, { k: 'ld', due: due.slice(0, 200) }); }
      if (this.isHost && !this._wasHost) this._becameHost();
      this._wasHost = this.isHost;
      const q = this.q;
      if (q && !q.answered) { this._progress(); if (now() - q.t0 > q.sec + 0.4) this._expire('time'); }
      // (she fell while typing — ArenaType.abort: the question is still open on the host; it comes back when she is up)
      if (q && q.reask && !q.answered && m.local && m.local.alive && this.arena && !this.arena.cur) { q.reask = false; this.asking = { gate: q.g, item: q.item, p: q.p }; this.arena.ask(q.g, q.item, q.p); this._progress(true); }
      if (this.isHost) this._referee(dt);
    } else if (m.state !== 'intro' && m.state !== 'init') this._stop();
  }

  // ---------------------------------------------------------------------------------------------- host: the referee
  _referee(dt) {
    if (this.ended) return;
    if (this.endT >= 0) { this.endT -= dt; if (this.endT < 0) this._callMatch(); return; }
    if (!this.queue) { this.refNext -= dt; if (this.refNext > 0) return; this._makeQueue(); }
    if (this.ref && this.ref.open_) { for (const e of this.ref.tick(now())) this._refOut(e); return; }
    this.refNext -= dt;
    if (this.refNext > 0) return;
    if (this.qi + 1 >= this.queue.length) { this.endT = this.V.endDelay; return; }
    this._openNext();
  }
  _makeQueue() {
    let mine = []; try { mine = store.due(this.level.weekRef || this.week); } catch (e) { mine = []; }
    const due = mergeDue([mine, ...this.dues.values()]);
    this.queue = buildQueue({ gates: this.level.gates, due, has: (id) => this.byId.has(id), n: this.nQ, dueShare: this.V.dueShare });
    this._bcast({ k: 'ls', ids: this.queue.map((e) => [e.id, e.alt]) });
    this.refNext = 0;
  }
  _openNext() { this._openAt(this.qi + 1); }
  // open the queue's i-th question for the room (re: a new host re-opening the one in flight — the same q, every screen
  // answers it again from what it already did, _onAsk)
  _openAt(i, re = false) {
    const people = this.people(), humanTeams = new Set(people.map((p) => p.team));
    const botTeams = [0, 1].filter((tm) => !humanTeams.has(tm) && (this.match.opts.roster || []).some((r) => r.bot && r.team === tm));
    if (!this.ref) this.ref = new Referee({ humans: people, botTeams, model: this.model });
    else { this.ref.humans = people; this.ref.botTeams = botTeams; }
    const e = this.queue[i], item = this.byId.get(e.id);
    const sec = e.alt ? this.V.answerTime.type : answerTime(item ? prompt(item) : null);
    this.ref.open(i + 1, sec, now());
    this._bcast({ k: 'lq', q: i + 1, i, id: e.id, alt: e.alt, n: i + 1, total: this.queue.length, sec, ...(re ? { re: 1 } : {}) });
  }
  _refOut(e) {
    if (e.k === 'ink') {
      let r = 0, spot = null;
      if (e.win >= 0) {
        const s = (this.refStreak.get(e.by) || 0) + 1;
        for (const k of this.refStreak.keys()) if (k !== e.by) this.refStreak.set(k, 0);
        this.refStreak.set(e.by, s);
        r = duelFlood(s); spot = this._inkSpot(e.win);
      }
      const who = this.people().find((p) => p.pid === e.by);
      this._bcast({ k: 'lr', q: e.q, win: e.win, by: e.by, name: who ? who.name : e.by ? '机器人' : '', ms: e.ms, r, ...(spot || {}) });
    } else if (e.k === 'close') {
      this._bcast({ k: 'lc', q: e.q, win: e.win, by: e.by, res: e.res });
      if (e.win < 0) {
        const entry = this.queue[e.q - 1];
        if (canRequeue(this.queue, entry, this.nQ, this.V.requeue)) { this.queue.push({ id: entry.id, alt: 1 }); this._bcast({ k: 'ls', ids: this.queue.map((x) => [x.id, x.alt]) }); }
      }
      this.refNext = this.V.askGap;
    }
  }
  // the spot of the live zone that side needs most (the zone bots' own hotspot); else the zone's centre
  _inkSpot(team) {
    const Z = this.match.zones, z = Z && Z.active.zones[0];
    if (!z) return null;
    let hs = null; try { hs = zonePlan()?.hotspot(z.id, team); } catch (err) { hs = null; }
    return { z: z.id, at: hs ? [r1(hs.x), r1(hs.y), r1(hs.z)] : [r1(z.center[0]), r1(z.center[1]), r1(z.center[2])] };
  }
  // the queue is done: the host calls the match by the counts (a 'ze' record: every screen ends with the same numbers)
  _callMatch() {
    const Z = this.match.zones;
    this.ended = true;
    if (!Z || Z.winner != null || this.match.state !== 'playing') return;
    const L = Z.losing();
    Z._end(L < 0 ? Z._tiebreak() : 1 - L, 'answered');
  }
  // the room migrated to us: carry on from the queue everyone holds. The question in flight (asked, not closed — the old
  // host's referee went with it) is re-opened under the same q (play-9): each screen answers it again from what it
  // already did (its 'la' re-sent, or its clock refreshed), so nobody's answer is lost and the day's first answer stays one.
  _becameHost() {
    this.ref = null;
    const q = this.queue ? this.qs.get(this.qi + 1) : null;
    if (q && !q.closed && this.queue[this.qi]) { this._openAt(this.qi, true); return; }
    this.refNext = this.queue ? this.V.askGap : this.V.firstAsk;
  }

  // ---------------------------------------------------------------------------------------------- everyone: a question
  _onAsk(d) {
    // a new host re-opened the question in flight (the same q): nothing changes on this screen — what it answered goes
    // again to the new referee, an open one gets the fresh clock; a screen that never saw it asks it as new below
    const seen = d.re ? this.qs.get(d.q) : null;
    if (seen) {
      if (seen.answered) { if (seen.sent) this._toHost({ k: 'la', q: d.q, ...seen.sent }); }
      else { seen.t0 = now(); seen.sec = +d.sec || seen.sec; this._progress(true); }
      return;
    }
    if (this.q && !this.q.answered) this._expire('next');
    if (this.arena && this.arena.cur) this.arena.gateOpened(this.arena.cur.g);   // (the last one's verdict was still up)
    this.qi = Math.max(this.qi, d.i | 0);
    const item = this.byId.get(d.id);
    if (!item || this.match.state !== 'playing') { this._toHost({ k: 'la', q: d.q, ok: 0, ms: 0, none: 1 }); return; }
    const it = { ...item, _tries: d.alt ? 1 : 0, _form: d.alt ? 'alt' : null };
    const p = d.alt ? this._altFor(it, d) : prompt(it);
    const g = this._gateOf(d.i | 0, it);
    if (g.items[0] !== it) g.items = [it];
    const q = { q: d.q, id: d.id, g, item: it, p, t0: now(), sec: +d.sec || 20, n: d.n, total: d.total, answered: false, ink: null, shown: '', play: false };
    this.q = q; this.qs.set(d.q, q);
    this.asking = { gate: g, item: it, p };   // (the audits read the live question here, as in the other forms)
    this.asked++;
    // 题即玩法: the same objects over the zone on every screen — she plays on (no hold, no pause, no card)
    if (!this.arena.canAsk(g, it, p)) {   // (none in the three weeks: tests/learn/duo.test.mjs — passed over, never a card)
      console.warn('[versus2] no station for', it.id, p.type);
      q.answered = true; q.none = true; this._toHost({ k: 'la', q: d.q, ok: 0, ms: 0, none: 1 }); this._after(q); return;
    }
    q.play = true;
    this.ui.say('');
    G.audio?.play?.('ui_confirm', { volume: 0.6 });
    this._emit('learn:question', { itemId: it.id, q: d.q, type: p.type, form: d.alt ? 'alt' : 'normal', play: true });
    this.arena.ask(g, it, p);
    this._progress(true);
  }
  _progress(force = false) {
    const q = this.q; if (!q) return;
    const left = Math.max(0, Math.ceil(q.sec - (now() - q.t0)));
    // (题即玩法: the strip's chip — 「1/2 · 18 秒」, then 「等其他人」 once she has answered; a write only when it changes)
    if (!q.play) return;
    const t = `${q.n}/${q.total} · ${q.answered ? '等其他人' : `${left} 秒`}`;
    if (force || t !== q.shown) { q.shown = t; this.arena?.strip?.chip(t, q.answered ? '' : 'beat'); }
  }

  // The one judging path (PLAY §1 rule 2), whatever answered — a round on an ink target, the typed sheet: judge → her
  // first answer of the day into her own store (unscored items are refused by it; the 打字蟹's 提示 →
  // H) → 'la' to the host's referee (who inks it is the host's: 'lr') → the ink tank for a miss. Shaped as the other
  // forms' ({ r, first, again }); a miss is never re-asked here (the host re-queues what nobody got right).
  _judgeRecord(g, item, p, ans, o = {}) {
    const q = this.q && this.q.item === item ? this.q : null;
    if (q) q.answered = true;
    const ms = q ? Math.round((now() - q.t0) * 1000) : 0;
    const { r, first, hinted } = judgeRecord({ item, p, ans, o: { judged: o.judged, hinted: o.hinted }, store });   // (the one path; nothing is held in a timed question)
    if (first) { this.firsts++; if (r.ok) this.firstRight++; }
    if (r.ok) { this.right.add(item.id); this.rightN++; this.streak++; } else this.streak = 0;
    if (q) { q.sent = { ok: r.ok ? 1 : 0, ms }; this._toHost({ k: 'la', q: q.q, ...q.sent }); }   // (kept: re-sent to a new host, _onAsk)
    this._emit('learn:answer', { itemId: item.id, ok: r.ok, first, q: q ? q.q : null, ms, ...(hinted ? { hinted: true } : {}) });
    const a = this.match.local;
    if (!r.ok && a) { a.ink = Math.max(0, a.ink - this.V.wrongInk * PLAYER.inkMax); G.hud?.feed?.({ text: '答错了 · 墨罐少了一截', color: '#f08a7a' }); }
    G.audio?.play?.(r.ok ? 'hit_marker' : 'ui_error', { volume: 0.8 });
    if (q && q.play) this._progress();
    return { r, first, again: false };
  }
  // the arena's station has shown its verdict (or the expired line): its objects go, the question is done on this
  // screen — unless she fell while typing (ArenaType.abort): the question is still open, it comes back when she is up
  _askNext(g) {
    this.arena?.gateOpened(g);
    const q = this.q && this.q.g === g ? this.q : null;
    if (q && !q.answered) { q.reask = true; return; }
    if (q) this._after(q);
  }
  // time's up (or the question closed / the next one came) before she answered: the answer is shown, nothing recorded
  _expire(why) {
    const q = this.q;
    if (!q || q.answered) return;
    q.answered = true; q.none = true;
    q.sent = { ok: 0, ms: Math.round((now() - q.t0) * 1000), none: 1 };
    this._toHost({ k: 'la', q: q.q, ...q.sent });
    if (q.play) {
      // 题即玩法: the station closes it — the right object ringed (or the keyboard gone), the strip says so; then _askNext
      const c = rightAnswerOf(q.item, q.p), text = typeof c === 'number' ? ((q.p.options || [])[c]?.text || '') : String(c || '');
      const zh = q.item.zh && q.item.zh !== text ? q.item.zh : '';
      const shown = why !== 'next' && this.arena.cur && this.arena.cur.g === q.g && this.arena.expire({ head: `${why === 'time' ? '时间到了' : '这一题结束了'}：是 ${text}`, why: zh }, LEARN.ui.verdictMs);
      if (!shown) { if (this.arena.cur && this.arena.cur.g === q.g) this.arena.gateOpened(q.g); this._after(q); }
      else this._progress(true);
    } else this._after(q);
    this._emit('learn:answer', { itemId: q.item.id, ok: false, first: false, q: q.q, none: true, why });
  }
  _after(q) {
    if (this.q === q) { this.q = null; this.asking = null; }
    if (this.q) return;   // (a newer question is already up)
    this.hud?.hide(); this.hud?.el.classList.remove('is-walk');
  }

  // ---------------------------------------------------------------------------------------------- everyone: the ink
  _onInk(d) {
    const q = this.qs.get(d.q);
    if (q) q.ink = d;
    if (!(d.win >= 0)) return;
    this._applyInk(d);
    const myTeam = this.match.local ? this.match.local.team : 0;
    const line = d.by === this.myId ? '你先答对了！墨淹过去了' : `${d.name || (d.win === myTeam ? '队友' : '对面')} 先答对了`;
    if (d.by === this.myId) this.wins++;
    // (题即玩法: while this screen's question is up its strip says it — the note line sits where the strip does on a
    // landscape phone; the HUD's feed has the ink too)
    if (this.arena && this.arena.cur) { const Q = this.q; if (Q) Q.shown = line; this.arena.strip?.chip(line, d.by === this.myId ? 'type' : ''); }
    else this.ui.say(line, { coral: d.by !== this.myId && d.win !== myTeam });
  }
  _applyInk(d) {
    const Z = this.match.zones, z = Z && Number.isInteger(d.z) ? Z.zones[d.z] : null;
    const at = Array.isArray(d.at) ? d.at : null, r = +d.r || 0;
    let cells = [];
    if (z && at && r > 0) {
      let C = this._cells.get(d.z);
      if (!C) { C = zoneCellsXYZ(z); this._cells.set(d.z, C); }
      const [cx, cy, cz] = at;
      for (let i = 0; i < z.cells.length; i++) if (Math.hypot(C.xs[i] - cx, C.zs[i] - cz) <= r && Math.abs(C.ys[i] - cy) < 2.5) cells.push(z.cells[i]);
      // (a flood, not a splat: every screen applies it from this record — a splat would be replicated twice over)
      if (cells.length) G.paint?.flood?.({ cells: Int32Array.from(cells), polys: z.def.polys || [z.def.poly], y0: z.def.y0, y1: z.def.y1 }, d.win, { center: [cx, cz], y: cy, reach: r + 0.3, dur: 0.5 });
      _v.set(cx, cy + 0.1, cz);
      G.fx?.ring?.(_v, _up, G.teamColors[d.win], { radius: r, life: 0.5 });
      G.audio?.play?.(EFFECTS.duel.right.sfx, { pos: _v, volume: 0.75 });
      Z.sampleT = 0;
    }
    const who = this._actorOf(d.by, d.win);
    if (who && who.alive) G.specials?.cheer?.(who);   // INKWAVE's own "YEAH!" bubble over whoever got it first
    if (d.by === this.myId && this.match.local) {
      const a = this.match.local;
      a.special = Math.min(a.specialCost(), a.special + this.V.special);
      a.character.trigger?.(EFFECTS.duel.right.trigger);
      const sk = streakKind(this.streak);
      if (sk === 'streak3') { a.special = a.specialCost(); G.audio?.play?.(EFFECTS.duel.streak3.sfx, { volume: 0.8 }); this.ui.say('连对 3 题 · 特殊槽满'); }
      if (sk === 'streak5') { G.audio?.play?.(EFFECTS.duel.streak5.sfx, { volume: 0.8 }); this.ui.say('连对 5 题！'); }
    }
    G.hud?.feed?.({ text: `${d.name || '机器人'} 先答对了 · 区域涂了 ${r} 米`, color: G.teamHex[d.win] });
    this._emit('learn:ink', { q: d.q, team: d.win, by: d.by, radius: r, at, cells: cells.length, share: Z ? Z.active.zones.map((x) => x.share.map((s) => +s.toFixed(3))) : null });
  }
  _actorOf(pid, team) {
    const A = this.match.actors;
    const h = A.find((a) => a.owner === pid && !a.isBot && a.alive);
    if (h) return h;
    if (typeof pid === 'string' && pid.startsWith('bot')) return A.find((a) => a.team === team && a.isBot && a.alive) || null;
    return null;
  }
  _onClose(d) {
    const q = this.qs.get(d.q);
    if (q) q.closed = true;   // (a question closed by the host is never re-opened by the next one)
    if (q && !q.answered) this._expire('closed');
    this._prepAhead(d.q | 0);   // (the entry after this one: q is its index + 1)
    this.results.push({ q: d.q, id: q ? q.id : null, win: d.win, by: d.by, res: Array.isArray(d.res) ? d.res : [] });
    this._emit('learn:close', { q: d.q, win: d.win, by: d.by, res: d.res });
  }

  // ---------------------------------------------------------------------------------------------- the end
  // the match left 'playing' (the queue done, a knockout, the clock): the question goes; INKWAVE's judge and results follow
  _stop() {
    if (this._stopped) return;
    this._stopped = true;
    if (this.q && !this.q.answered) { this.q.answered = true; this.q.none = true; }
    if (this.arena.cur) this.arena.gateOpened(this.arena.cur.g);
    this.hud?.playMode?.(false);
    this.q = null; this.asking = null;
    this.hud?.hide(); this.hud?.el.classList.remove('is-walk');
    this.ui.say('');
    this._emit('learn:done', { form: 'versus2', week: this.week, day: this.day, asked: this.results.length, right: this.rightN, firsts: this.firsts, firstRight: this.firstRight, wins: this.wins });
  }
  // the results screen's strip (main.js _judge → menus): who inked first how often, who answered right
  resultsData() {
    const people = (this.match.opts.roster || []).filter((r) => !r.bot).map((r) => ({ pid: r.owner, team: r.team, name: r.name, self: r.owner === this.myId }));
    for (const tm of [0, 1]) if (this.results.some((x) => x.by === 'bot' + tm || (x.res || []).some(([pid]) => pid === 'bot' + tm))) people.push({ pid: 'bot' + tm, team: tm, name: '机器人', self: false });
    return { form: 'versus2', week: this.week, day: this.day, asked: this.results.length, total: this.queue ? this.queue.length : this.nQ, rows: tally(this.results, people), mine: { right: this.rightN, firstRight: this.firstRight, firsts: this.firsts, wins: this.wins } };
  }
  rightAnswer() { return this.asking ? rightAnswerOf(this.asking.item, this.asking.p) : null; }
  debug() {
    const Z = this.match.zones;
    return { form: 'versus2', host: this.isHost, q: this.q ? this.q.q : null, qi: this.qi, queue: this.queue ? this.queue.length : 0, closed: this.results.length, wins: this.wins, right: this.rightN, firsts: this.firsts,
      paused: !!this.match.paused, play: this.q ? !!this.q.play : null, answered: this.q ? !!this.q.answered : null, arena: this.arena ? this.arena.debug() : null,
      zone: Z ? { count: Z.count.map((c) => Math.ceil(c)), share: Z.active.zones.map((z) => z.share.map((s) => +s.toFixed(3))), winner: Z.winner, reason: Z.reason } : null };
  }

  dispose() { this._unsub?.(); this.ui?.end(); super.dispose(); }
}
