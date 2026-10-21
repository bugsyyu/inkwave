// 题即玩法 play-wire — the lens while a station frames something (docs/PLAY.md §6.2, §1 rule 9): the type rig, the beat
// stage, a board, the flip card. The pure frame functions (type/frame.js frameFor, beat/pads.js stageLayout,
// board/frame.js frameBoard, flip/deck.js frame) hand back a world pose { pos, look, fov }; this springs the camera
// there and back, never cuts. It takes the lens the way the runner does (runner/cam.js): cameraRig's path mode with no
// path — main.js leaves such a rig alone, and the rig then touches nothing but its trauma shake and the field of view —
// so the pose set here each frame is what is rendered. The field of view goes through the rig's own `zoom` (LEARN §19:
// cameraRig computes fov = vBase + (fovKick − zoom) × 0.8 every frame; writing camera.fov would be overwritten).
// Release hands the lens back to the follow camera from where it is (rig.yaw / pitch set from the current forward, so
// the rig's own 0.45 s mode blend lands on the pose she sees, not a stale one). Reduced motion: the pose is taken at once.
//
//   const C = new PlayCam()
//   C.take(rig)                       the lens, from wherever the camera is now (idempotent)
//   C.to({ pos, look, fov })          the pose to spring to (world); C.want is it
//   C.update(dt, rig, camera)         every frame while on (before rig.update: the rig keeps the pose)
//   C.release(rig, actor)             back to following her (idempotent)
//   C.on                              whether the lens is held
import * as THREE from 'three';
import { G } from '../../core/ctx.js';
import { LEARN } from '../../config.js';

class Spring {   // exact critically-damped spring (cameraRig's)
  constructor(x = 0) { this.x = x; this.v = 0; }
  reset(x) { this.x = x; this.v = 0; }
  step(target, omega, dt) {
    const d = this.x - target, e = Math.exp(-omega * dt), k = (this.v + omega * d) * dt;
    this.x = target + (d + k) * e; this.v = (this.v - omega * k) * e; return this.x;
  }
}
const _f = new THREE.Vector3(), _l = new THREE.Vector3();

// the rig's vertical base field of view (settings.fov is horizontal at 16:9, cameraRig.update)
export function baseVFov(settings = G.settings) {
  const h = (settings && settings.fov) || 82;
  return (2 * Math.atan(Math.tan((h * Math.PI) / 360) / (16 / 9)) * 180) / Math.PI;
}

const XYZ = ['x', 'y', 'z'];   // (LEARN §52: a new array every frame)
export class PlayCam {
  constructor(opts = {}) {
    this.rate = opts.rate || LEARN.board.frameRate;
    this.reduced = !!opts.reduced;
    this.p = [new Spring(), new Spring(), new Spring()]; this.l = [new Spring(), new Spring(), new Spring()]; this.f = new Spring(52);
    this.want = null; this.on = false; this.pos = new THREE.Vector3(); this.look = new THREE.Vector3(); this.fov = 52;
  }
  take(rig = G.rig, camera = G.camera) {
    if (this.on || !rig || !camera) return this;
    camera.getWorldDirection(_f);
    _l.copy(camera.position).addScaledVector(_f, 8);
    this.p[0].reset(camera.position.x); this.p[1].reset(camera.position.y); this.p[2].reset(camera.position.z);
    this.l[0].reset(_l.x); this.l[1].reset(_l.y); this.l[2].reset(_l.z);
    this.f.reset(camera.fov || 52);
    this.pos.copy(camera.position); this.look.copy(_l); this.fov = camera.fov || 52;
    rig.mode = 'path'; rig.path = null; rig.zoom = 0; rig.fovKick = 0;
    this.on = true; this.want = null;
    return this;
  }
  to(pose) {
    if (!pose) return this;
    // (one object, refilled: a station hands its pose in every frame — nothing allocated per frame, PLAY §7)
    const w = this._w || (this._w = { pos: null, look: null, fov: 52 });
    w.pos = pose.pos; w.look = pose.look; w.fov = pose.fov || 52; this.want = w;
    if (this.reduced) this._snap();
    return this;
  }
  _snap() {
    const w = this.want; if (!w) return;
    this.p[0].reset(w.pos.x); this.p[1].reset(w.pos.y); this.p[2].reset(w.pos.z);
    this.l[0].reset(w.look.x); this.l[1].reset(w.look.y); this.l[2].reset(w.look.z);
    this.f.reset(w.fov);
  }
  update(dt, rig = G.rig, camera = G.camera) {
    if (!this.on || !rig || !camera) return;
    if (rig.mode !== 'path' || rig.path) { rig.mode = 'path'; rig.path = null; }
    const w = this.want;
    if (w && !this.reduced) {
      for (let i = 0; i < 3; i++) { this.p[i].step(w.pos[XYZ[i]], this.rate, dt); this.l[i].step(w.look[XYZ[i]], this.rate, dt); }
      this.f.step(w.fov, this.rate, dt);
    }
    this.pos.set(this.p[0].x, this.p[1].x, this.p[2].x); this.look.set(this.l[0].x, this.l[1].x, this.l[2].x); this.fov = this.f.x;
    camera.position.copy(this.pos);
    camera.up.set(0, 1, 0);
    camera.lookAt(this.look);
    // the field of view through the rig: fov = vBase + (fovKick − zoom) × 0.8
    rig.fovKick = 0;
    rig.zoom = (baseVFov() - this.fov) / 0.8;
  }
  // the pose the camera is at now, in the shape stations hand in
  current() { return { pos: this.pos.clone(), look: this.look.clone(), fov: this.fov }; }
  release(rig = G.rig, actor = null, camera = G.camera) {
    if (!this.on) return this;
    this.on = false; this.want = null;
    if (!rig) return this;
    rig.zoom = 0; rig.fovKick = 0;
    if (camera) {
      camera.getWorldDirection(_f);
      rig.yaw = Math.atan2(_f.x, _f.z);
      rig.pitch = Math.max(-0.9, Math.min(0.3, Math.asin(Math.max(-1, Math.min(1, _f.y)))));
    }
    if (actor) rig.follow(actor, true);
    return this;
  }
}
