// 题即玩法 play-5 — play-1's question objects (src/learn/play/targets.js PlayTargets: the same balls, planks, plates, atlas
// and draw calls) with one more ability an arena needs: the objects move after they came up. Over a zone the whole
// cluster turns round its anchor to face her wherever she runs (orbit); on the boss each ball rides its weak-point
// socket (moveTo). Nothing is allocated per frame: the slots, spheres and matrices are the ones PlayTargets keeps.
//
//   const T = new ArenaTargets({ scene, renderer, camera, reduced })
//   T.setBasis(right, up, back)        the plates' facing (unit vectors) — the orbit's horizontal basis
//   T.moveTo(i, pos, platePos)         object i's centre and its plate's centre (world)
//   T.commit()                         the hit spheres and the instance matrices follow (call once per frame after moves)
import * as THREE from 'three';
import { PlayTargets } from '../targets.js';

const _rot = new THREE.Matrix4(), _q = new THREE.Quaternion();

export class ArenaTargets extends PlayTargets {
  // the balls / planks in the transparent pass (opacity 1: the same pixels): HULLBREAKER's own see-through parts (its
  // eyes, its claws' ink) draw after every opaque thing, so a ball on top of it (onTop) must come after them too — the
  // program is compiled for it here, at the level load, never mid-question
  constructor(o) {
    super(o);
    this.inkMat.transparent = true; this.inkMat.opacity = 1; this.inkMat.depthWrite = true; this.inkMat.needsUpdate = true;
    this.warm();
  }
  setBasis(right, up, back) {
    this.basis.right.copy(right); this.basis.up.copy(up); this.basis.back.copy(back);
    _rot.makeBasis(this.basis.right, this.basis.up, this.basis.back); _q.setFromRotationMatrix(_rot);
    this.quat = (this.quat || new THREE.Quaternion()).copy(_q);
    return this;
  }
  moveTo(i, pos, platePos) {
    const S = this.slots[i]; if (!S || !S.on) return this;
    S.pos.set(pos.x, pos.y, pos.z);
    if (platePos) S.plate.pos.set(platePos.x, platePos.y, platePos.z);
    else if (S.kind !== 'ball') S.plate.pos.copy(S.pos);
    return this;
  }
  // on the boss its claws and shell stand between her and the weak points: the balls and their plates draw over the
  // scene (depth test off, after everything opaque; the balls still write depth, so the right answer's halo — tested as
  // usual — rings them and never fills them) — over a zone they are ordinary objects again
  onTop(on) {
    on = !!on; if (this._top === on) return this;
    this._top = on;
    for (const [m, k] of [[this.balls, 20], [this.planks, 20], [this.plates, 23]]) {
      if (m._ro0 == null) m._ro0 = m.renderOrder;
      m.material.depthTest = !on; m.renderOrder = on ? m._ro0 + k : m._ro0;
    }
    return this;
  }
  commit() {
    if (!this.n) return this;
    // (draining objects are no longer anything to hit: out() emptied the spheres — keep it so)
    if (this.slots.some((S) => S.on && !S.gone && S.outAt < 0)) this._spheres();
    this._write();
    return this;
  }
}
