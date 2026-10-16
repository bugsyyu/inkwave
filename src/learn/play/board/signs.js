// 路标 (docs/PLAY.md §3 路标, LEVELS §1.1 / §1.3): the check-in pad, the weekly board, the placement board — in the exit
// area, unscored, as today. Stepping onto the check-in pad is "this day is walked" (the flow keeps that in the local star
// table, as before); the boards open the classic page from a hotspot on the board (「开经典页」 / 「复制周报」 — the host's own
// forms: the check-in's mood and note, the weekly report, the 45-minute placement test). Nothing is judged or recorded.
//
//   const S = new Signs({ scene, camera, color, reduced, root })
//   S.prepare(key, signs) → entries     signs: [{ id, kind: 'checkin' | 'weekly' | 'placement', title, text }] (drawn ahead)
//   S.place(key, spots)                 one spot per sign [{ x, y, z, yaw }] (the board); a check-in sign's pad lies at its
//                                       viewing spot (she walks onto it to read the teacher's words)
//   S.update(dt, t, herPos, { aspect, speed }) · S.framing · S.tapApi · S.inZone(pos)
//   S.on = { checkin(sign), classic(sign), speak(text, o) }
//   S.clear() · S.warm() · S.dispose()
import * as THREE from 'three';
import { G } from '../../../core/ctx.js';
import { LEARN } from '../../../config.js';
import { BoardWalk } from './walk.js';
import { signSpec, noteSpec } from './paint.js';
import { PadSet } from '../beat/padset.js';

const _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
// what each sign's board says: the check-in pad has the teacher's words and its classic page (mood, note); weekly the
// week's summary and 「复制周报」; placement the 45-minute self-test
export function signBoard(sg) {
  if (sg.kind === 'checkin') { const s = noteSpec(sg.title || '今天的打卡', sg.text || '', '打卡垫 · 踩上去就是走完了这一天'); s.buttons = [{ id: 'classic', label: '写一句 · 经典页', icon: 'out' }]; return s; }
  if (sg.kind === 'weekly') return signSpec('weekly', sg.title || '周复盘', sg.text || '这一周走完了。周报由课本按你这一周的记录生成，发给老师。', '复制周报 · 经典页');
  return signSpec('placement', sg.title || '入门小测', sg.text || '45 分钟的自评，帮老师校准难度。在课本里做。', '开经典页');
}

export class Signs {
  constructor({ scene, camera, color = '#ff8a14', reduced = false, root = null } = {}) {
    this.ink = new THREE.Color(color); this.reduced = reduced;
    this.walk = new BoardWalk({ scene, camera, color: '#' + this.ink.getHexString(), reduced, root, max: 3 });
    this.pads = new PadSet({ scene, max: 1, reduced });
    this.on = {}; this.signs = []; this.pad = null; this.checked = false;
    this.walk.on.hotspot = (id, b) => { if (id === 'classic') this.on.classic?.(this._signOf(b)); };
    this.walk.on.speak = (text, o) => this.on.speak?.(text, o);
  }
  get tapApi() { return this.walk.tapApi; }
  get framing() { return this.walk.framing; }
  inZone(p) { return this.walk.inZone(p); }
  _signOf(b) { const L = this.walk.list.find((x) => x.b === b); return L ? L.sign : null; }

  prepare(key, signs) { this._pending = signs; return this.walk.prepare(key, signs.map(signBoard)); }
  place(key, spots) {
    const signs = this._pending || [];
    this.walk.place(key, spots);
    this.walk.list.forEach((L, i) => { L.sign = signs[i]; });
    this.signs = signs;
    const k = signs.findIndex((s) => s.kind === 'checkin');
    if (k >= 0 && this.walk.list[k]) { const v = this.walk.list[k].view; this.pad = this.pads.add({ x: v.x, y: v.y, z: v.z, r: 1.05, color: LEARN.beat.neutral, glyph: 5 }); this.padSign = signs[k]; }
    this.checked = false;
  }
  update(dt, t, her, o = {}) {
    this.walk.update(dt, her, o);
    if (this.pad && her && !this.checked && Math.hypot(her.x - this.pad.x, her.z - this.pad.z) < this.pad.r) {
      // 踩上去 = 这一天走完了: her ink fills the pad (the flow keeps it in the star table — not evidence)
      this.checked = true;
      this.pads.set(this.pad, { color: '#' + this.ink.getHexString(), ink: 1, glow: 1, streak: 1 }); this.pads.pulse(this.pad, 1.4);
      _v.set(this.pad.x, this.pad.y + 0.2, this.pad.z);
      G.fx?.ring?.(_v, _up, this.ink, { radius: 1.8, life: 0.5 });
      G.audio?.play?.('refill_full', { pos: _v, volume: 0.7 });
      this.on.checkin?.(this.padSign);
    }
    if (this.pads.pads.length) this.pads.update(dt, t, 0);
  }
  clear() { this.walk.clear(); this.pads.clear(); this.pad = null; this.signs = []; }
  warm(renderer, camera, target) { return Promise.all([this.walk.warm(renderer, camera, target), this.pads.warm(renderer, camera, target)]); }
  dispose() { this.clear(); this.walk.dispose(); this.pads.dispose(); }
}
