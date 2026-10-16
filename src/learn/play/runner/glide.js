// 墨浪跑酷 — the 滑行段 (docs/PLAY.md §3 M4, §4 「M4 滑行段」, §5.2; LEARN §19 the type rig's contract, §20 the runner's
// `typed` hook): a checkpoint's typed items — 单词卡 (T / H / S), 听写句 (L with its percent), 写句 (W) — typed on
// play-type's 打字蟹 (TypeShot) with the game keyboard (PlayKeys) while the ink road carries her on. The world never
// stops: the tide drops to LEARN.runner.glideTide (she rides the rig in kid form at about the crab special's pace, the
// racer bots slow by the same factor — fair), she steers nothing, the stretch lasts until every item is answered.
//   · 射 lobs the sheet at a spot on the road ahead; the ink word forms there as she comes up to it and plays the
//     verdict (her ink / coral + the right spelling / the dictation's share) as she swims through
//   · the lens is play-type's own frames (type/frame.js frameFor: the rig between the strip and the keyboard; after
//     射 the word), taken in the rig's frame and carried along with her — the runner camera (cam.js) springs to and
//     from them, never cuts (the same convention as the stations in play-wire: path mode, a spring, fov through the rig)
//   · judging is the flow's one path only: flow._judgeRecord(g, item, p, text, { hinted }) (LearnFlow's; the hint →
//     H once play-wire's `o` lands); nothing here judges and the rig never sees an answer before 射 (PLAY §1.3)
//   · 回炉 per PLAY §4: a missed word → a lane row of the word and near misses (「选义」, flow._altPrompt), then typed
//     again; a missed dictation → the same sentence slowly; a missed written sentence → again with the why first;
//     a second miss → the race's 回炉 queue (_onWrong2: the detour too)
//
//   const S = new GlideStation(flow)
//   S.warm()                                      the rig and the keyboard (under the match fade)
//   S.run({ items, gate, row }) → Promise         the stretch: resolves when its last item is answered and shown
//   S.active · S.typing · S.pose · S.update(dt) · S.debug() · S.dispose()
import * as THREE from 'three';
import { G, clamp } from '../../../core/ctx.js';
import { LEARN, PLAYER } from '../../../config.js';
import { prompt } from '../../api.js';
import { EFFECTS } from '../../design.js';
import { TypeShot } from '../type/shot.js';
import { frameFor } from '../type/frame.js';
import { wordBox } from '../type/inkword.js';
import { PlayKeys } from '../../../ui/play-keys.js';
import { verdictLines } from '../m1.js';
import { ieltsNow } from '../../ielts.js';
import { at, roomAt } from './track.js';

const _v = new THREE.Vector3(), _p = {};

export class GlideStation {
  constructor(flow) {
    this.flow = flow; this.match = flow.match; this.R = LEARN.runner;
    this.shot = null; this.keys = null; this.cur = null; this.mounted = false; this.run_ = null;
    this.yaw = 0; this._pose = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 52 }; this._f = null; this._fkey = '';
    this.log = []; this.stats = { asked: 0, right: 0, wrong: 0, hinted: 0 };
  }
  get active() { return !!this.run_; }
  get typing() { return !!(this.cur && !this.cur.answered); }
  get pose() { return this.cur ? this._framed() : null; }

  _ensure() {
    if (this.shot) return;
    const color = G.teamColors[0] || new THREE.Color('#ff8a14');
    this.shot = new TypeShot({ scene: G.scene, team: 0, color, quality: G.settings?.quality || 'high' });
    try { this.shot.warm(G.renderer, G.camera, G.scene)?.catch?.(() => {}); } catch (e) { /* warmed on first use */ }
    const root = (G.hud && G.hud.root) || document.body;
    const keys = (this.keys = new PlayKeys(root, { mode: 'word', color: (G.teamHex || [])[0] || '#ff8a14', replay: true }));
    keys.hide();
    keys.onKey = (k) => { if (this.typing) this.shot.key(k); };
    keys.onBackspace = () => { if (this.typing) this.shot.back(); };
    keys.onHint = () => this._hint();
    keys.onReplay = () => { const C = this.cur; if (C && C.p.tts) this.flow._speak(C.p.tts, { slow: !!(C.p._tip && C.p._tip.slow) }); };
    keys.onSubmit = () => this._submit();
  }
  warm() { try { this._ensure(); } catch (e) { console.warn('[runner] glide warm', e); } }

  // ---------------------------------------------------------------------------------------------- the stretch
  run({ items, gate, row }) {
    this._ensure();
    const list = items.slice();
    return new Promise((done) => {
      this.run_ = { gate, row, list, done };
      this._next();
    });
  }
  _next() {
    const Rn = this.run_; if (!Rn) return;
    const item = Rn.list.shift();
    if (!item) { this._end(); return; }
    this._ask(Rn.gate, item, Rn.row.e);
  }
  _end() {
    const Rn = this.run_; if (!Rn) return;
    this.run_ = null; this.cur = null;
    if (this.keys) this.keys.hide();
    if (this.shot) { this.shot.clear(); if (this.mounted) { this.shot.unmount(); this.mounted = false; } }
    this.flow.strip.hide();
    Rn.done({ answered: this.stats.asked });
  }

  // one typed item: the prompt as the engine words it (a retry carries its tip), the rig mounted on first use, a fresh
  // sheet, the keyboard up, the strip, the word spoken
  _ask(g, item, e) {
    const a = this.match.local, F = this.flow;
    const p = prompt(item);
    if (e.slow) { p._tip = { zh: '换个问法：慢一点再听一遍，把听到的写下来', slow: true }; p.zh = [p._tip.zh, p.zh].filter(Boolean).join('　'); }
    if (e.why) { p.zh = ['换个问法：' + e.why, p.zh].filter(Boolean).join('　'); }
    if (e.retype) p.zh = ['选过了，再把它打出来', p.zh].filter(Boolean).join('　');
    if (e.relearn) { p.zh = ['回炉：' + (item.meta && (item.meta.hint || item.meta.zhFull) || item.zh || ''), p.zh].filter(Boolean).join('　'); p._tip = { ...(p._tip || {}), relearn: true }; }
    const ref = String((item.meta && item.meta.ref) || item.en || '');
    const mode = p.type === 'write' || /\s/.test(ref) ? 'sentence' : 'word';
    if (!this.mounted) { this.shot.mount(a); this.mounted = true; }
    this.shot.rig.hullYaw = a.yaw;
    this.cur = { g, item, p, e, mode, answered: false, hinted: false, verdict: null, text: '', dist: 0, word: null, t: 0 };
    this.shot.begin({ mode, target: null });   // (the target is picked on 射: where the road is then)
    this.keys.setMode(mode); this.keys.clear(); this.keys.setHintUsed(false); this.keys.show();
    F._ask('glide', p, null, false);
    F.asking = { gate: g, item, p, row: this.run_.row };
    F.asked++; this.stats.asked++;
    if (p.tts) F._speak(p.tts, { slow: !!(p._tip && p._tip.slow) });
    F._emit('learn:question', { itemId: item.id, gate: g.id, type: 'type', mode, form: e.relearn ? 'relearn' : e.slow || e.why || e.retype ? 'alt' : 'normal' });
    this.log.push({ t: +F.t.toFixed(2), ev: 'ask', item: item.id, mode });
  }

  _hint() {
    const C = this.cur; if (!C || C.answered) return;
    this.shot.hint(); this.keys.setHintUsed(true);
    if (!C.hinted) { C.hinted = true; this.stats.hinted++; }
    const p = C.p, h = p.hint || {};
    // the hint on the strip: a word's meaning and IPA, a sentence's Chinese (this answer records H)
    const line = h.zh || h.ipa ? [h.zh, h.ipa ? `/${h.ipa}/` : ''].filter(Boolean).join('  ') : (C.item.zh || '');
    this.flow.strip.show({ text: p.text, zh: line ? `提示：${line}` : '', tts: p.tts }, { replay: p.tts ? () => this.flow._speak(p.tts) : null, tag: { text: '滑行段 · 打字', kind: 'type' } });
    this.log.push({ t: +this.flow.t.toFixed(2), ev: 'hint' });
  }

  // 射: the sheet flies to a spot on the road ahead (her pace × the flight and the verdict's show, so the word stands
  // just ahead of her while it plays); the text is judged now, the day's first answer recorded now
  _submit() {
    const C = this.cur; if (!C || C.answered) return;
    const F = this.flow, a = this.match.local;
    // the target first (submit() lobs at it)
    const v = Math.max(1.5, Math.hypot(a.vel.x, a.vel.z)), [lo, hi] = this.R.glideAhead;
    const dist = clamp(v * 3.2 + 2, lo, hi);
    const sT = F.sNow + dist, room = roomAt(F.T, F.W, sT, 0.3);
    const side = room.left > room.right ? -Math.min(0.9, room.left - 0.6) : Math.min(0.9, room.right - 0.6);
    at(F.T, sT, _p);
    const x = _p.x + _p.rx * (side > 0.2 || side < -0.2 ? side : 0), z = _p.z + _p.rz * (side > 0.2 || side < -0.2 ? side : 0);
    const gy = G.level ? G.level.groundHeight(x, z, _p.y + 1) : _p.y, y = Number.isFinite(gy) && gy > _p.y - 1.5 ? gy : _p.y;
    this.shot.target = _v.set(x, y + 0.1, z).clone();
    this.shot.opts.groundY = y;
    const typed = this.shot.submit(); if (typed == null) return;
    C.text = typed; C.answered = true; C.dist = dist; C.word = { x, y: y + 0.1 + this.shot.lift, z };
    this.keys.hide();
    const { g, item, p } = C;
    const { r, first, again } = F._judgeRecord(g, item, p, typed, { hinted: C.hinted });   // the one path (LEARN §18; play-wire's `o`: hinted → H)
    const vl = verdictLines(r, item);
    if (r.pct != null && !r.ok) vl.head = `差一点：${r.pct}%，是 ${r.canonical}`;
    C.verdict = { ok: r.ok, first, again, head: vl.head, why: vl.why, pct: r.pct ?? null };
    this.stats[r.ok ? 'right' : 'wrong']++;
    if (first && r.ok) F.firstRight++;
    F.strip.verdict(vl, { ms: r.ok ? 1600 : this.R.verdictMs + 600 });
    const E = r.ok ? EFFECTS.race.right : again ? EFFECTS.race.wrong : EFFECTS.race.wrong2;
    G.audio?.play?.(E.sfx, { volume: 0.7 });
    if (r.ok) { F.streak++; F.rightN++; if (item._relearn) F.relearnRight++; F.right.add(item.id); F._onRight(); }
    else { F.streak = 0; this._retry(C, r, again); }
    // the dictation: which of her words matched, by the host's own lcsOk (the judge's percent is the evidence)
    let typedOk;
    if (item.meta && item.meta.kind === 'dict') {
      try {
        const Hs = ieltsNow().Host, refW = Hs.toks(r.canonical).reduce((acc, t) => acc.concat(Hs.dictWords(t)), []);
        const hypT = Hs.toks(typed), atk = [], hypW = [];
        hypT.forEach((t, j) => Hs.dictWords(t).forEach((w) => { atk.push(j); hypW.push(w); }));
        const okW = Hs.lcsOk(hypW, refW), ok = hypT.map(() => true);
        atk.forEach((j, k) => { ok[j] = ok[j] && !!okW[k]; });
        typedOk = ok.length === typed.trim().split(/\s+/).length ? ok : undefined;
      } catch (e) { typedOk = undefined; }
    }
    F._emit('learn:typed', { itemId: item.id, ok: r.ok, first, gate: g.id, hinted: C.hinted, relearn: !!C.e.relearn, pct: r.pct ?? null, text: typed });   // (learn:answer came from _judgeRecord, once)
    this.log.push({ t: +F.t.toFixed(2), ev: 'answer', item: item.id, ok: r.ok, pct: r.pct ?? null, first, hinted: C.hinted, dist: +dist.toFixed(1) });
    this.shot.resolve({ ok: r.ok, pct: r.pct, right: r.canonical, toks: r.toks, typedOk }).then(() => { if (this.cur === C) this._next(); });
  }

  // the other try (PLAY §4's last column), queued on the runner's road; a second miss goes the race's way (回炉, the detour)
  _retry(C, r, again) {
    const F = this.flow, { item, e } = C, kind = item.meta && item.meta.kind;
    if (!again || e.relearn) { F._onWrong2(item); if (F.pendingDetour) F._startDetour(this.run_.row); return; }
    const gate = this.run_.row.gate;
    if (kind === 'word') {
      // 「选义」 first: the word among near misses on a lane row (the curtain picked is judged as the dictation), then typed again
      const p = F._altPrompt(item);
      if (p && p.type === 'choice' && p.options.length >= 2) {
        F._requeue({ gate, kind: 'lane', item, prompt: p, tries: 1, noAns: 0, alt: true, then: { gate, kind: 'glide', items: [item], retype: true, tries: 1 } });
        return;
      }
    }
    const why = String((r && r.why) || '').replace(/^不对。/, '').replace(/正确答案：[^。]*。/, '').split(/(?<=[。！？])/).map((x) => x.trim()).filter(Boolean)[0] || '';
    F._requeue({ gate, kind: 'glide', items: [item], tries: 1, noAns: 0, slow: kind === 'dict', why: kind === 'write' ? why : '' });
  }

  // ---------------------------------------------------------------------------------------------- the lens
  // play-type's frames in the rig's frame (origin at her feet, +Z her facing, +X her left), carried along with her: the
  // search runs once per phase / aspect (frameFor is a search), the pose is re-based on her every frame
  _framed() {
    const C = this.cur, a = this.match.local; if (!C || !a) return null;
    const W = typeof innerWidth !== 'undefined' ? innerWidth : 1280, H = typeof innerHeight !== 'undefined' ? innerHeight : 720, aspect = W / H;
    const phase = C.answered ? 'word' : 'type';
    const kb = phase === 'type' ? +this.keys.frac.toFixed(2) : 0;
    const key = `${phase}|${aspect.toFixed(2)}|${kb}|${C.answered ? C.dist.toFixed(1) : ''}|${C.text}`;
    if (this._fkey !== key) {
      this._fkey = key;
      const o = { phase, aspect, kbFrac: kb, dist: C.answered ? C.dist : undefined };
      if (phase === 'word') { const b = wordBox(C.text || 'word'); o.word = { w: b.w, h: b.h, y: C.word.y - a.pos.y }; }
      this._f = frameFor(o);
    }
    const f = this._f, yaw = this.yaw, sy = Math.sin(yaw), cy = Math.cos(yaw), P = this._pose;
    P.pos.set(a.pos.x + cy * f.pos[0] + sy * f.pos[2], a.pos.y + f.pos[1], a.pos.z - sy * f.pos[0] + cy * f.pos[2]);
    if (phase === 'word' && C.word) P.look.set(C.word.x, C.word.y, C.word.z);
    else P.look.set(a.pos.x + cy * f.look[0] + sy * f.look[2], a.pos.y + f.look[1], a.pos.z - sy * f.look[0] + cy * f.look[2]);
    P.fov = f.fov; P.fits = f.fits;
    return P;
  }

  // ---------------------------------------------------------------------------------------------- per frame
  update(dt) {
    this.shot?.update(dt);
    const F = this.flow, a = this.match.local, m = this.match;
    if (this.keys) this.keys.enabled = !(m.paused || (G.menus && G.menus.current));   // (the physical keys stop while a menu is up)
    if (!this.run_ || !a) return;
    // her facing: where she is going (a detour branch too), else the road's heading just ahead
    at(F.T, F.sNow + 2.5, _p);
    const sp = Math.hypot(a.vel.x, a.vel.z);
    const want = sp > 0.8 ? Math.atan2(a.vel.x, a.vel.z) : Math.atan2(_p.tx, _p.tz);
    let d = want - this.yaw; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
    this.yaw += d * Math.min(1, dt * 4);
    if (this.cur) this.cur.t += dt;
  }

  debug() {
    const C = this.cur;
    return { active: this.active, typing: this.typing, item: C ? C.item.id : null, mode: C ? C.mode : null, phase: this.shot ? this.shot.phase : null, text: this.shot ? this.shot.text : '', answered: !!(C && C.answered), hinted: !!(C && C.hinted), verdict: C ? C.verdict : null, kbUp: !!(this.keys && this.keys.visible), kbFrac: this.keys ? +this.keys.frac.toFixed(3) : null, fits: this._f ? this._f.fits : null, left: this.run_ ? this.run_.list.length : 0, stats: { ...this.stats }, log: this.log.slice(-8) };
  }
  dispose() {
    this.run_ = null; this.cur = null;
    if (this.shot) { try { this.shot.clear(); if (this.mounted) this.shot.unmount(); this.shot.dispose(); } catch (e) { /* gone */ } }
    this.keys?.destroy();
    this.shot = null; this.keys = null; this.mounted = false;
  }
}
// the swim-speed fraction a kid riding the rig moves at: the glide tide × her swim speed, as a share of her run speed
export function glideMove(R = LEARN.runner, P = PLAYER) { return clamp((R.glideTide * P.swimSpeed) / P.runSpeed, 0.15, 1); }
