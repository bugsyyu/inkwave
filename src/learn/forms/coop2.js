// 关卡学习 — 双人成形合作赛 coop2 (docs/LEARN.md §10, §14): the two players on one team, no enemies, no clock — B's
// puzzle stage (the day's gates on the route from the spawn to the far side, the ink trail between them), made so it
// takes two:
//   · every gate has two ink pads either side of the route; the gate asks only when each player stands on one (the host
//     sees both squidkids and declares it: {k:'lg', s:'ask'});
//   · every question is split in two (duo.js splitPrompt): one screen gets the clue — it hears the recording / reads the
//     stem — the other the answer form, with nothing on it that gives the answer away; the two talk (the room, the sofa);
//     the roles swap every question;
//   · the answering side judges and sends the verdict to both screens ({k:'la'}); a miss puts a lock on the gate and the
//     item comes back reworded — to the OTHER player's hands;
//   · when the gate's items are through, the gate opens on both screens and the host pours the ink trail to the next one
//     (the host's splats replicate: one pour, every screen);
//   · evidence: each screen records only an answer its own player gave (the hands side) — with the roles swapping, both
//     earn first answers across a gate, each in their own store (LEARN §8 recordFirst, with the item).
// The last gate shows B's results card for both, with who answered what; the host takes the room back to the lobby.
import * as THREE from 'three';
import { G } from '../../core/ctx.js';
import { LEARN } from '../../config.js';
import { LearnFlow } from '../flow.js';
import { prompt, store } from '../api.js';
import { judgeAnswer, rightAnswerOf } from './common.js';
import { FormsUi } from './ui.js';
import { rolesFor, splitPrompt, padNodes, padsHeld, validQ } from './duo.js';

const _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);

export class Coop2Flow extends LearnFlow {
  constructor(match, opts = {}) {
    super(match, opts);   // B: the level (the day's puzzle plan), the gates on the route, their rings / locks / beams, hud.start
    this.form = 'coop2';
    this.C = LEARN.coop2;
    this.byId = opts.byId || null;
    // the two of us, in the room's join order (the roster's): pad 0 is the first one's, pad 1 the second's
    this.duo = (match.opts.roster || []).filter((r) => !r.bot).map((r) => r.owner);
    this.names = new Map((match.opts.roster || []).filter((r) => !r.bot).map((r) => [r.owner, r.name]));
    this.ui = new FormsUi(G.hud); this.ui.start();
    this.qn = 0;               // questions asked so far (the roles swap on it)
    this.q = null;             // the live question on this screen { q, g, item, p, role, view, answered }
    this.hold = false; this.asking = null;
    this.mine = { asked: 0, right: 0, firsts: 0, firstRight: 0, clues: 0 };
    this.pairRight = 0; this.pairAsked = 0;
    this.heldT = 0; this.nextT = -1; this.left = false;
    this._padsBuilt();
    this._unsub = G.net?.on?.('leave', (e) => { if (e && e.player && this.duo.includes(e.player.id) && this.phase !== 'done') this._partnerLeft(e.player); });
  }

  get isHost() { return !!G.net?.isHost; }
  get myId() { return G.net?.myId || null; }
  _bcast(d) { G.net?.tr?.broadcast(d); this.onNet(this.myId, d); }
  _partner() { return this.duo.find((id) => id !== this.myId) || null; }

  // ---------------------------------------------------------------------------------------------- the pads
  _padsBuilt() {
    const col = G.teamColors[0] || new THREE.Color('#ff8a14');
    const disc = new THREE.CircleGeometry(this.C.padRadius, 36), rim = new THREE.RingGeometry(this.C.padRadius * 0.86, this.C.padRadius, 36);
    this._geos.push(disc, rim);
    const mat = (o) => { const m = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, toneMapped: false, side: THREE.DoubleSide, ...o }); this._mats.push(m); return m; };
    for (const g of this.gates) {
      g.pads = this.path.length > 1 ? padNodes(G.nav, this.path, g.pathIndex, this.C.padGap) : [{ ...g.pos, node: g.node }, { x: g.pos.x + 3, y: g.pos.y, z: g.pos.z, node: g.node }];
      g.padMesh = g.pads.map((p) => {
        const grp = new THREE.Group();
        grp.position.set(p.x, p.y + 0.05, p.z);
        const d = new THREE.Mesh(disc, mat({ color: col.clone(), opacity: 0.28 })); d.rotation.x = -Math.PI / 2;
        const r = new THREE.Mesh(rim, mat({ color: col.clone(), opacity: 0.9 })); r.rotation.x = -Math.PI / 2; r.position.y = 0.01;
        grp.add(d, r);
        this.group.add(grp);
        return { grp, d, r };
      });
    }
    this._stylePads();
  }
  _stylePads(on = null) {
    for (const g of this.gates) {
      const live = g.state === 'next';
      (g.padMesh || []).forEach((M, i) => {
        M.grp.visible = g.state !== 'open';
        const held = live && on && on[i] != null;
        M.d.material.opacity = held ? 0.8 : live ? 0.3 : 0.12;
        M.r.material.opacity = live ? 0.95 : 0.35;
      });
    }
  }
  _people() { return this.match.actors.filter((a) => !a.isBot && a.alive && this.duo.includes(a.owner)).map((a) => ({ id: a.owner, x: a.pos.x, y: a.pos.y, z: a.pos.z })); }
  // my pad at the current gate (the roster's order: the first player pad 0)
  _myPad(g) { const k = Math.max(0, this.duo.indexOf(this.myId)); return g && g.pads ? g.pads[k % g.pads.length] : null; }

  // ---------------------------------------------------------------------------------------------- the wire
  onNet(from, d) {
    if (!validQ(d)) return;
    const fromHost = from === G.net?.hostId;
    switch (d.k) {
      case 'lg': if (fromHost) this._onGate(d); break;
      case 'lq': if (fromHost) this._onAsk(d); break;
      case 'la': if (this.duo.includes(from)) this._onAnswer(from, d); break;
    }
  }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    this.t += dt;
    this._animate();
    this._pourInk();   // (only the host's queue fills: its splats replicate to the other screen)
    if (this.finishT >= 0) { this.finishT -= dt; if (this.finishT < 0) this._results(); return; }
    const m = this.match;
    if (m.state !== 'playing' || this.phase === 'done') return;
    const g = this.gates[this.cur];
    if (!g) return;
    const ppl = this._people(), on = padsHeld(g.pads, ppl, this.C.padRadius);
    this._stylePads(on.on);
    if (this.phase === 'walk') {
      const a = m.local, pad = this._myPad(g);
      if (a && a.alive && pad) {
        if (this.auto) {
          this._autoWalk(a, { node: pad.node }, dt);
          if (Math.hypot(a.pos.x - pad.x, a.pos.z - pad.z) < 0.45) { this.autoWalk(false); a.intent.move.set(0, 0, 0); }
        }
        const dist = Math.hypot(a.pos.x - pad.x, a.pos.z - pad.z);
        if (this.hud) {
          const fw = G.camera.getWorldDirection(_v), want = Math.atan2(pad.x - a.pos.x, pad.z - a.pos.z), have = Math.atan2(fw.x, fw.z);
          let rel = want - have; while (rel > Math.PI) rel -= Math.PI * 2; while (rel < -Math.PI) rel += Math.PI * 2;
          this.hud.walk({ dist, angle: rel, index: this.cur + 1, total: this.gates.length, auto: this.auto, title: g.title });
          const mineOn = on.on.includes(this.myId), theirs = on.on.some((x) => x && x !== this.myId);
          const txt = mineOn && theirs ? '两块墨垫都站上了！' : mineOn ? '站上了 · 等队友站上另一块' : theirs ? '队友在墨垫上了 · 站上另一块' : dist < 6 ? '站上一块墨垫' : '下一道门 · 两块墨垫';
          if (this.hud.walkTxt.textContent !== txt) this.hud.walkTxt.textContent = txt;   // (over B's 到门前了 / 下一道门)
        }
      }
      // the host sees both squidkids: both pads held for a moment → the gate asks, on both screens
      if (this.isHost) {
        this.heldT = on.held ? this.heldT + dt : 0;
        if (this.heldT > 0.4) { this.heldT = 0; this._bcast({ k: 'lg', g: this.cur, s: 'ask' }); }
      }
    } else if (this.phase === 'ask' && this.isHost && this.nextT >= 0) {
      this.nextT -= dt;
      if (this.nextT < 0) { this.nextT = -1; this._hostNext(g); }
    }
  }

  // ---------------------------------------------------------------------------------------------- a gate's questions
  _onGate(d) {
    const g = this.gates[d.g];
    if (!g) return;
    if (d.s === 'ask') {
      if (this.phase !== 'walk' || d.g !== this.cur) return;
      this.phase = 'ask'; this.hold = true;
      const a = this.match.local;
      if (a) { a.intent.move.set(0, 0, 0); a.intent.jump = a.intent.fire = false; }
      if (this.auto) this.autoWalk(false);
      G.input?.exitLock?.();
      G.audio?.play?.('ui_confirm', { volume: 0.7 });
      for (const p of g.pads) { _v.set(p.x, p.y + 0.2, p.z); G.fx?.ring?.(_v, _up, G.teamColors[0], { radius: this.C.padRadius * 1.6, life: 0.5 }); }
      this.ui.say('两个人都站上了 · 开始答题');
      this._emit('learn:gate', { id: g.id, index: g.index + 1, total: this.gates.length, locks: g.locks, opened: false });
      if (this.isHost) this.nextT = 0.6;
    } else if (d.s === 'open') {
      if (g.state === 'open') return;
      this._open(g);
    }
  }
  // host: the gate's next item to the two of us (the roles swap every question; a re-ask goes to the other hands)
  _hostNext(g) {
    if (!g.queue.length) { this._bcast({ k: 'lg', g: g.index, s: 'open' }); return; }
    const item = g.queue.shift();
    const roles = rolesFor(this.duo, this.qn, item._hands || null);
    this.qn++;
    this._bcast({ k: 'lq', q: this.qn, g: g.index, id: item.id, alt: item._form === 'alt' ? 1 : 0, clue: roles.clue, hands: roles.hands, n: this.qn, total: this.total + this._retriesLeft() });
  }
  _findItem(g, id) {
    for (const x of g.items) if (x.id === id) return x;
    return this.byId ? this.byId.get(id) || null : null;
  }
  _onAsk(d) {
    const g = this.gates[d.g], base = g && this._findItem(g, d.id);
    if (!g || !base) return;
    const item = { ...base, _tries: d.alt ? 1 : 0, _form: d.alt ? 'alt' : null };
    const p = d.alt ? this._altPrompt(item) : prompt(item);
    const role = d.hands === this.myId ? 'hands' : d.clue === this.myId ? 'clue' : 'watch';
    const view = splitPrompt(p, role === 'hands' ? 'hands' : 'clue');
    this.q = { q: d.q, g: d.g, item, p, role, view, answered: false, hands: d.hands, clue: d.clue };
    this.asking = role === 'hands' ? { gate: g, item, p } : null;
    this.asked++; this.pairAsked++;
    if (role === 'hands') this.mine.asked++; else this.mine.clues++;
    const partner = this.names.get(this._partner()) || '队友';
    this._emit('learn:question', { itemId: item.id, gate: g.id, type: p.type, form: d.alt ? 'alt' : 'normal', role, q: d.q });
    this.hud?.ask(view, {
      gate: { index: g.index + 1, total: this.gates.length, locks: g.locks, title: g.title },
      item: { n: d.n, total: d.total, retry: !!d.alt },
      onAnswer: (ans) => this._answer(ans),
    });
    if (this.hud?.prog) this.hud.prog.textContent = `第 ${d.n} / ${d.total} 题 · 门 ${g.index + 1} / ${this.gates.length} · ${role === 'hands' ? `你答 · ${partner}说` : `你说 · ${partner}答`}`;
    this.ui.say(role === 'hands' ? `${partner}那边有题目 · 听${partner}说` : `把题目讲给${partner} · ${partner}来答`);
  }
  // the hands side answers: judged here, recorded here (her own store), the verdict goes to both screens
  _answer(ans) {
    const q = this.q;
    if (!q || q.answered || q.role !== 'hands') return;
    q.answered = true;
    const r = judgeAnswer(q.item, q.p, ans);
    const rec = store.recordFirst({ itemId: q.item.id, item: q.item, ok: r.ok, pct: r.pct, at: Date.now() });
    if (rec.first) { this.mine.firsts++; this.firsts++; if (r.ok) this.mine.firstRight++; }
    if (r.ok) this.mine.right++;
    this._bcast({ k: 'la', q: q.q, ok: r.ok ? 1 : 0, why: String(r.why || '').slice(0, 400), canonical: String(r.canonical ?? '').slice(0, 200), first: rec.first ? 1 : 0 });
  }
  _onAnswer(from, d) {
    const q = this.q;
    if (!q || q.q !== d.q) return;
    const g = this.gates[q.g], ok = !!d.ok;
    q.answered = true;
    if (ok) { this.right.add(q.item.id); this.pairRight++; }
    this._emit('learn:answer', { itemId: q.item.id, ok, first: !!d.first && from === this.myId, gate: g.id, by: from, q: q.q, role: q.role });
    // a miss: a lock on the gate, and the item comes back reworded to the other player's hands (host's queue)
    let again = false;
    if (!ok) {
      g.locks++;
      if (q.item._tries < this.P.retries) { again = true; if (this.isHost) g.queue.push({ ...q.item, _tries: q.item._tries + 1, _form: 'alt', _hands: q.clue }); }
      this._styleGates();
    }
    // INKWAVE's own "YEAH!" over both squidkids when the pair gets one
    if (ok) for (const a of this.match.actors) if (!a.isBot && a.alive && this.duo.includes(a.owner)) G.specials?.cheer?.(a);
    G.audio?.play?.(ok ? 'hit_marker' : 'ui_error', { volume: 0.8 });
    const A = this.hud?._ask;
    if (A) A.answered = true;
    const by = from === this.myId ? '你' : (this.names.get(from) || '队友');
    this.hud?.verdict({ ok, why: [d.why || '', q.role !== 'hands' ? `（${by}答的）` : ''].filter(Boolean).join(' '), canonical: d.canonical, locks: g.locks, again }, () => this._after(q));
    if (this.isHost) this.nextT = this.C.askGap + (ok ? 0 : 1.2);
  }
  _after(q) {
    if (this.q === q) { this.q = null; this.asking = null; }
    if (this.q) return;
    this.hud?.hide();
    if (this.phase !== 'ask') this.hud?.el.classList.add('is-walk');
  }

  // ---------------------------------------------------------------------------------------------- a gate opens
  // (B's _open, with the paint on the host only: its blast and trail splats replicate to the other screen)
  _open(g) {
    g.state = 'open';
    this._emit('learn:gate', { id: g.id, index: g.index + 1, total: this.gates.length, locks: g.locks, opened: true });
    const col = G.teamColors[0];
    _v.copy(g.pos); _v.y += 0.4;
    G.fx?.burst?.(_v, _up, col, { count: 26, speed: 5.5, size: 0.14, spread: 0.9 });
    G.fx?.ring?.(_v, _up, col, { radius: 2.2, life: 0.45 });
    G.audio?.play?.('refill_full', { pos: g.pos, volume: 0.9 });
    G.audio?.play?.('splat_big', { pos: g.pos, volume: 0.5 });
    if (this.isHost) G.paint?.splat(_v.set(g.pos.x, g.pos.y + 0.05, g.pos.z), this.P.inkRadius * 1.6, 0, { kind: 'blast' });
    this.q = null; this.asking = null;
    this.hud?.hide();
    this.ui.say('门开了！');
    this.cur++;
    const next = this.gates[this.cur];
    if (next) { next.state = 'next'; if (this.isHost) this._trail(g, next); }
    this._styleGates(); this._stylePads();
    this.hold = false; this.autoPath = null; this.heldT = 0; this.nextT = -1;
    if (!next) { this.phase = 'done'; this.finishT = 0.9; return; }
    this.phase = 'walk';
    this.hud?.el.classList.add('is-walk');
    G.input?.requestLock?.(); if (G.game) G.game._relock = true;
  }

  // ---------------------------------------------------------------------------------------------- the end
  _partnerLeft(p) {
    this.left = true;
    this.ui.say(`${p.name || '队友'}离开了房间 · 双人合作要两个人`, { coral: true, hold: 1 });
    this.phase = 'done'; this.hold = false; this.q = null; this.asking = null;
    this.hud?.hide();
    this.finishT = 1.2;
  }
  _results() {
    this.finishT = -1;
    this.hold = true;
    G.input?.exitLock?.();
    this.ui.say('');
    const total = this.level.gates.reduce((n, g) => n + g.items.length, 0);
    const data = { done: this.right.size, total, due: [], firsts: this.mine.firsts, locks: this.gates.reduce((n, g) => n + g.locks, 0), week: this.week, day: this.day, form: 'coop2', mine: { ...this.mine }, pair: { right: this.pairRight, asked: this.pairAsked }, left: this.left };
    this._emit('learn:done', data);
    G.audio?.play?.('victory_fanfare', { volume: 0.8 });
    const host = this.isHost;
    this.hud?.results(data, {
      again: () => { if (this.isHost) { G.netm?.sendEnd?.(); G.game?.netMatchEnd?.(); } },
      menu: () => G.game?.api?.quitMatch?.(),
    });
    if (this.hud) {
      this.hud.rTitle.textContent = this.left ? '队友离开了 · 这一关先到这里' : '两个人一起走完了！';
      const again = this.hud.rAgain.querySelector('span'), menu = this.hud.rMenu.querySelector('span');
      if (again) again.textContent = host ? '回到房间' : '等房主回房间';
      if (menu) menu.textContent = '离开房间';
      this.hud.rAgain.disabled = !host;
      this.hud.rDue.innerHTML = '';
    }
    const partner = this.names.get(this._partner()) || '队友';
    this.ui.resultsExtra([
      { b: `${this.pairRight} / ${this.pairAsked}`, t: '两个人一起答对' },
      { b: `${this.mine.right} / ${this.mine.asked}`, t: `你来答的（${partner}说）` },
      { b: `${this.mine.clues}`, t: `你讲给${partner}的题` },
      `你的当天首答 ${this.mine.firsts} 题（答对 ${this.mine.firstRight}），记进了这台设备上你自己的进度`,
    ], null);
    // the host brings the room back to the lobby by itself after a while (INKWAVE's results do the same)
    if (host) { clearTimeout(this._backT); this._backT = setTimeout(() => { if (G.match?.learn === this && G.netm) { G.netm.sendEnd(); G.game?.netMatchEnd?.(); } }, 30000); }
  }

  rightAnswer() { return this.q && this.q.role === 'hands' ? rightAnswerOf(this.q.item, this.q.p) : null; }
  debug() {
    const g = this.gates[this.cur];
    return { form: 'coop2', host: this.isHost, phase: this.phase, cur: this.cur, gates: this.gates.length, q: this.q ? { q: this.q.q, role: this.q.role, id: this.q.item.id, type: this.q.view.type } : null,
      pads: g && g.pads ? g.pads.map((p) => [+p.x.toFixed(1), +p.y.toFixed(1), +p.z.toFixed(1), p.fallback ? 'route' : 'side']) : null, on: g && g.pads ? padsHeld(g.pads, this._people(), this.C.padRadius).on : null,
      mine: { ...this.mine }, pair: [this.pairRight, this.pairAsked], locks: this.gates.map((x) => x.locks) };
  }

  dispose() { clearTimeout(this._backT); this._unsub?.(); this.ui?.end(); super.dispose(); }
}
