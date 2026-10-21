// 回声亭 M7 echo-booth (docs/PLAY.md §3 M7): 口语 — a booth of a spawn pad and a board: the question and its Chinese, the
// sample's Chinese, the patterns (the whole sample and the tip in the reading strip). She steps onto the pad: the sample
// plays (the course's recording or the device's voice — the flow's speak hook, src/learn/audio.js) and she speaks along;
// she steps off it: 说完了 (or 「说完了」 on the board). Unscored, as before: nothing is judged, nothing is written — the
// scoring stays on the classic page (「评分 · 经典页」, LEVELS §1.3, until the speech server).
//
//   const E = new EchoBooth({ scene, camera, color, reduced, root })
//   E.prepare(key, item) · E.free(key)                    the board, drawn ahead
//   E.open({ key, item, at, yaw })                        the pad at `at` (her way in is yaw), the board behind it
//   E.update(dt, t, herPos, { aspect, speed })            per frame
//   E.framing → { pos, look, fov } | null                 the camera pose (world) while she is at the booth
//   E.on = { speak(text, { onEnd }), done({ how: 'out' | 'button' }), classic(item) }
//   E.tapApi · E.state ('off' | 'ready' | 'in' | 'done') · E.close() · E.warm() · E.dispose()
//   E.here = bool    LEARN §48 (the boss's S phase): she is in the booth where she stands — its board framed at once, the
//                    sample played after sampleGap; only 说完了 (the board's, or the HUD's 继续) ends it, walking does not
import * as THREE from 'three';
import { G } from '../../../core/ctx.js';
import { LEARN } from '../../../config.js';
import { BoardWalk } from '../board/walk.js';
import { echoSpec } from '../board/paint.js';
import { PadSet } from '../beat/padset.js';

const E = LEARN.echo;
const _v = new THREE.Vector3();

export class EchoBooth {
  constructor({ scene, camera, color = '#ff8a14', reduced = false, root = null } = {}) {
    this.ink = new THREE.Color(color); this.reduced = reduced;
    this.walk = new BoardWalk({ scene, camera, color: '#' + this.ink.getHexString(), reduced, root, max: 1 });
    this.pads = new PadSet({ scene, max: 1, reduced });
    this.on = {}; this.state = 'off'; this.item = null; this.pad = null; this.at = new THREE.Vector3();
    this.inT = 0; this.speaking = false; this.waveT = 0; this.played = 0;
    this.walk.on.hotspot = (id) => this._hot(id);
    this.walk.on.speak = (text, o) => this.on.speak?.(text, o);
  }
  get tapApi() { return this.walk.tapApi; }
  get here() { return this.walk.here; }
  set here(on) { this.walk.here = !!on; }
  get framing() { return this.walk.framing; }
  get strip() { return this.walk.strip; }

  prepare(key, item) { return this.walk.prepare(key, [echoSpec(item)]); }
  free(key) { this.walk.free(key); }
  open({ key, item, at, yaw = 0 }) {
    this.close();
    if (!this.walk.entries.has(key)) this.prepare(key, item);
    this.item = item; this.at.copy(at);
    this.pad = this.pads.add({ x: at.x, y: at.y, z: at.z, r: E.pad, color: LEARN.beat.neutral, glyph: 5 });
    // the board stands behind the pad as she comes in, facing her; its viewing spot is the pad
    const fx = Math.sin(yaw), fz = Math.cos(yaw), bx = at.x + fx * (E.pad + 1.25), bz = at.z + fz * (E.pad + 1.25);
    this.walk.place(key, [{ x: bx, y: at.y, z: bz, yaw: yaw + Math.PI, view: { x: at.x, y: at.y, z: at.z } }]);
    this.state = 'ready'; this.inT = 0; this.played = 0;
    return this;
  }
  close() { this.walk.clear(); this.pads.clear(); this.pad = null; this.state = 'off'; this.speaking = false; }

  update(dt, t, her, o = {}) {
    if (this.state === 'off') return;
    this.walk.update(dt, her, o);
    const d = her ? Math.hypot(her.x - this.at.x, her.z - this.at.z) : 99;
    if (this.state === 'ready' && (d < E.pad || this.here)) { this.state = 'in'; this.inT = 0; this.pads.set(this.pad, { glow: 1 }); this.pads.pulse(this.pad, 1); G.audio?.play?.('ui_confirm', { volume: 0.5 }); }
    if (this.state === 'in') {
      this.inT += dt;
      if (!this.played && this.inT >= E.sampleGap) this._play();
      if (d > E.out && !this.here) this._done('out');
    }
    // while the sample plays the pad sends rings out (an echo), on its own slow beat
    if (this.speaking) { this.waveT += dt; if (this.waveT > 0.55) { this.waveT = 0; this.pads.pulse(this.pad, 0.7); } }
    this.pads.update(dt, t, this.speaking && !this.reduced ? 0.4 + 0.3 * Math.sin(t * 6) : 0);
  }
  _play() {
    this.played++;
    this.speaking = true; this.waveT = 0;
    const m = (this.item && this.item.meta) || {};
    const end = () => { this.speaking = false; };
    this.on.speak?.(m.model || this.item?.tts || this.item?.en || '', { onEnd: end });
    const h = setTimeout(end, 9000 + 60 * String(m.model || '').length); h?.unref?.();   // (no onEnd from the voice: the rings stop anyway)
  }
  _hot(id) {
    if (id === 'replay') { if (this.state !== 'done') this._play(); else this.on.speak?.((this.item.meta || {}).model || this.item.en, {}); return; }
    if (id === 'done') { this._done('button'); return; }
    if (id === 'classic') this.on.classic?.(this.item);
  }
  // 说完了: her ink fills the pad; unscored — no judge, no store, only the flow's own "this step was done"
  _done(how) {
    if (this.state === 'done' || this.state === 'off') return;
    this.state = 'done'; this.speaking = false;
    this.pads.set(this.pad, { color: '#' + this.ink.getHexString(), ink: 1, glow: 1, streak: 1 }); this.pads.pulse(this.pad, 1.3);
    _v.copy(this.at); _v.y += 0.2;
    G.fx?.ring?.(_v, new THREE.Vector3(0, 1, 0), this.ink, { radius: 1.6, life: 0.45 });
    G.audio?.play?.('refill_full', { pos: this.at, volume: 0.7 });
    this.on.done?.({ how });
  }
  warm(renderer, camera, target) { return Promise.all([this.walk.warm(renderer, camera, target), this.pads.warm(renderer, camera, target)]); }
  dispose() { this.close(); this.walk.dispose(); this.pads.dispose(); }
}
