// 墨浪跑酷 — the chase camera (docs/PLAY.md §1 rule 9, §8). INKWAVE's follow camera centres her on the crosshair with
// a 4.1 m squid boom: right for a shooter, wrong for a runner, where the road ahead has to fill the screen and she sits
// low in it. So the runner holds the lens itself: cameraRig's path mode with no path (main.js leaves a 'path' rig
// alone and the rig moves nothing — it still adds its trauma shake, keeps gameCam for the audio and the aim, and turns
// fovKick into the field of view). Everything rides critically-damped springs, nothing cuts:
//   · the pivot follows her visual position (horizontal ω 9 with velocity feed-forward, vertical ω 5: soft through hops)
//   · the yaw follows the road's heading the next ~0.8 s ahead (ω 4.2): corners swing in, lane changes do not shake it
//   · boom, height, look-ahead and field of view per aspect — upright phone: higher, steeper and wider (a 4-lane row
//     has to fit 390 px); landscape and desktop: lower and longer — blended on the aspect, sprung on a turn of the phone
//   · a soft wall probe (physics.cameraProbe) pulls the boom in before a wall comes between them
//   · a station's pose (play-4: play-type's frames on the 滑行段, a framed board — world { pos, look, fov }) is blended
//     in and out on a spring weight (the same convention as the play stations: path mode, a spring, fov through the
//     rig — never a cut); the pose itself moves with her, so the blend is the only easing it needs
import * as THREE from 'three';
import { G, clamp, smoothstep } from '../../../core/ctx.js';
import { at } from './track.js';

class Spring {   // exact critically-damped spring (cameraRig's)
  constructor(x = 0) { this.x = x; this.v = 0; }
  reset(x) { this.x = x; this.v = 0; }
  step(target, omega, dt) {
    const d = this.x - target, e = Math.exp(-omega * dt), k = (this.v + omega * d) * dt;
    this.x = target + (d + k) * e; this.v = (this.v - omega * k) * e; return this.x;
  }
}
// framing presets: [back m, up m, look-ahead m, look height m, vertical fov °]. Wide screens are framed by a horizontal
// field of view instead (WIDE_H): a landscape phone's 2.16 : 1 at a fixed vertical angle sees 90° across and the row
// shrinks to a strip in the middle; 72° across puts a four-lane row over 40 % of the width a dozen metres out.
const TALL = [5.2, 3.3, 8, -0.7, 70], WIDE = [4.8, 3.0, 6, -0.8, 0], WIDE_H = 72;
const _p = {}, _v = new THREE.Vector3(), _b = new THREE.Vector3(), _probe = { hard: 0, soft: 0, floor: false };

export class RunnerCam {
  constructor() {
    this.px = new Spring(); this.py = new Spring(); this.pz = new Spring(); this.yaw = new Spring();
    this.f = [new Spring(), new Spring(), new Spring(), new Spring(), new Spring()];
    this.boom = new Spring(1); this.on = false; this.fresh = true;
    this.ow = new Spring(0); this.ov = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 52 };   // a station's pose and its weight
  }
  // take the lens from the rig: from wherever the camera is now (the intro's fly-in ends behind her)
  take(rig) {
    rig.mode = 'path'; rig.path = null; rig.zoom = 0;
    this.rig = rig; this.on = true;
  }
  release(rig, actor) { this.on = false; if (rig && actor && rig.mode === 'path' && !rig.path) rig.follow(actor, true); }

  frame(aspect) {
    const k = smoothstep(0.62, 1.25, aspect);
    const wide = WIDE.slice();
    wide[4] = clamp((2 * Math.atan(Math.tan((WIDE_H * Math.PI) / 360) / Math.max(1, aspect)) * 180) / Math.PI, 34, 52);
    return TALL.map((v, i) => v + (wide[i] - v) * k);
  }

  // a: her actor; T + s: the road and where she is on it; yawRoad: an override heading (a detour branch) or null;
  // focus: { x, y, z, w } — the row being asked (PLAY §6.2 镜头框住题物): heading and look point lean towards it by w;
  // pose: a station's { pos, look, fov } (world) to blend to, or null
  update(dt, a, T, s, aspect, yawRoad = null, focus = null, pose = null) {
    const rig = this.rig, cam = G.camera;
    if (!rig || !cam || !a) return;
    if (rig.mode !== 'path' || rig.path) { rig.mode = 'path'; rig.path = null; }
    // the road's heading: the tangent averaged over the next ~0.8 s of road (2–9 m at the tide, further when boosted)
    let tx = 0, tz = 0;
    const span = clamp(Math.hypot(a.vel.x, a.vel.z) * 0.8, 7, 12);
    if (yawRoad == null) { for (let d = 2; d <= 2 + span; d += span / 4) { at(T, s + d, _p); tx += _p.tx; tz += _p.tz; } }
    let yawT = yawRoad != null ? yawRoad : Math.atan2(tx, tz);
    if (focus && focus.w > 0) {
      let d = Math.atan2(focus.x - a.pos.x, focus.z - a.pos.z) - yawT; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      yawT += clamp(d, -0.6, 0.6) * focus.w;
    }
    const p = a.visualPos ? a.visualPos(_v) : _v.copy(a.pos);
    const F = this.frame(aspect);
    if (this.fresh) {
      this.fresh = false;
      this.px.reset(p.x); this.py.reset(p.y); this.pz.reset(p.z);
      // from the camera's own heading, so the hand-over from the intro is a swing, not a cut
      _b.set(0, 0, -1).applyQuaternion(cam.quaternion);
      this.yaw.reset(Math.atan2(_b.x, _b.z));
      F.forEach((v, i) => this.f[i].reset(v));
      this.boom.reset(1);
    }
    // unwrap the target next to the spring (no spinning the long way round)
    let yt = yawT; while (yt - this.yaw.x > Math.PI) yt -= Math.PI * 2; while (yt - this.yaw.x < -Math.PI) yt += Math.PI * 2;
    const yaw = this.yaw.step(yt, 4.2, dt);
    const lead = 0.1;
    const x = this.px.step(p.x + a.vel.x * lead, 9, dt), z = this.pz.step(p.z + a.vel.z * lead, 9, dt);
    const y = this.py.step(p.y + (a.grounded ? 0 : Math.max(0, a.vel.y) * 0.04), a.grounded ? 7 : 4, dt);
    const back = this.f[0].step(F[0], 2.5, dt), up = this.f[1].step(F[1], 2.5, dt), ahead = this.f[2].step(F[2], 2.5, dt);
    const lookH = this.f[3].step(F[3], 2.5, dt), vfov = this.f[4].step(F[4], 2.5, dt);
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    // the boom from above her head out to the lens; shortened (springs: fast in, slow out) when a wall is in the way —
    // from high up, so a short boom still looks down the road (a low one would look at the ink)
    const ph = Math.max(0.9, up - 1.1);
    const pivot = _v.set(x, y + ph, z);
    const bx = -fx * back, by = up - ph, bz = -fz * back, bl = Math.hypot(bx, by, bz);
    _b.set(bx / bl, by / bl, bz / bl);
    let k = 1;
    if (G.physics?.cameraProbe) { G.physics.cameraProbe(pivot, _b, bl, 0.45, _probe); k = clamp(_probe.soft / bl, 0.3, 1); }
    const kb = this.boom.step(k, k < this.boom.x ? 18 : 3, dt);
    let cx = x + bx * kb, cy = y + ph + by * kb, cz = z + bz * kb;
    cam.up.set(0, 1, 0);
    // (a wall-shortened boom sits the lens low: look further down then, so the road and the boards stay mid-screen and
    // never climb under the question strip)
    let lx = x + fx * ahead, ly = y + lookH - (1 - kb) * 1.6, lz = z + fz * ahead;
    const fw = this.fw = (this.fw || 0) + ((focus ? focus.w : 0) - (this.fw || 0)) * Math.min(1, dt * 4);   // (eased in and out)
    if (focus && fw > 0.001) { lx += (focus.x - lx) * fw * 0.5; ly += (focus.y - ly) * fw * 0.5; lz += (focus.z - lz) * fw * 0.5; }
    // field of view: rig fov = vBase + (fovKick − zoom) · 0.8 in path mode; a touch wider at swim speed
    const sp = Math.hypot(a.vel.x, a.vel.z);
    let want = vfov + clamp((sp - 8) * 0.6, 0, 4);
    // a station's pose: weighed in on a spring (and out again from the last pose given)
    if (pose) { this.ov.pos.copy(pose.pos); this.ov.look.copy(pose.look); this.ov.fov = pose.fov || want; }
    const w = this.ow.step(pose ? 1 : 0, 3.2, dt);
    if (w > 0.001) {
      const O = this.ov;
      cx += (O.pos.x - cx) * w; cy += (O.pos.y - cy) * w; cz += (O.pos.z - cz) * w;
      lx += (O.look.x - lx) * w; ly += (O.look.y - ly) * w; lz += (O.look.z - lz) * w;
      want += (O.fov - want) * w;
    }
    cam.position.set(cx, cy, cz);
    cam.lookAt(lx, ly, lz);
    const base = G.settings?.fov ?? 82;
    const vBase = 2 * Math.atan(Math.tan((base * Math.PI) / 360) / (16 / 9)) * (180 / Math.PI);
    rig.zoom = 0; rig.fovKick = (want - vBase) / 0.8;
    this.yawNow = yaw;
  }
}
