// 展板路 M6 — one board in front of her (docs/PLAY.md §3 M6): where a single board stands when it comes to her rather than
// along a route — coop2's clue board (play-6, src/learn/play/duo/coop.js) and the duel's 备战 boards between rounds
// (play-8, src/learn/play/arena/prep.js). LEARN.board.view m in front of her, turned from `base` until there is ground at
// her level, a clear line from her head to the face, from the face to where the framing camera will stand (frameBoard's
// distance for this board on this screen: ~4 m behind her upright, between her and it on a landscape phone) and nothing
// where the slab goes; facing her. Her standing spot is the viewing spot (the board is framed as it rises).
//
//   frontSpot({ a, base, spec, bw, W, H }) → { x, y, z, yaw, view, tries } | { none: true, why }   (G.level / G.physics)
import * as THREE from 'three';
import { G } from '../../../core/ctx.js';
import { LEARN } from '../../../config.js';
import { layoutBoard } from './paint.js';
import { frameBoard } from './frame.js';

const BD = LEARN.board;
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _c = new THREE.Vector3();
export const FRONT_W_UPRIGHT = 1.3;   // m: a board's width in front of her on a phone held upright (BD.w otherwise)

export function frontSpot({ a, base, spec, bw = BD.w, W = innerWidth, H = innerHeight }) {
  const L = G.level, P = G.physics;
  if (!a) return { none: true, why: 'nobody' };
  const why = [];
  let fd = 1.4, fy = 2.1;
  try {
    const Lb = layoutBoard(spec), h = Math.min(2.6, (bw * Lb.H) / Lb.W);
    const f = frameBoard({ w: bw + 0.14, h: h + 0.14, bottom: BD.bottom - 0.07 }, W / H, { W, H });
    fd = f.d; fy = f.pos[1];
  } catch (e) { /* the defaults */ }
  for (const dy of [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, Math.PI]) {
    const yaw = base + dy, sx = Math.sin(yaw), cz = Math.cos(yaw);
    const x = a.pos.x + sx * BD.view, z = a.pos.z + cz * BD.view;
    const gy = L ? L.groundHeight(x, z, a.pos.y + 1.0) : a.pos.y;
    if (!(gy > -Infinity) || Math.abs(gy - a.pos.y) > 0.6) { why.push('ground'); continue; }
    if (P && P.los) {
      _c.set(x, gy + BD.bottom + 0.55, z);
      if (!P.los(_v.set(a.pos.x, a.pos.y + 1.5, a.pos.z), _c)) { why.push('face'); continue; }
      // (the framing camera: fd m in front of the face, at fy over the ground — it must see the face from there)
      if (!P.los(_c, _w.set(x - sx * fd, gy + fy, z - cz * fd))) { why.push('lens'); continue; }
      // (and nothing stands where the slab goes, either side of its middle)
      const hw = bw / 2 - 0.15;
      if (!P.los(_v.set(a.pos.x, a.pos.y + 1.0, a.pos.z), _w.set(x + cz * hw, gy + 1.0, z - sx * hw)) || !P.los(_v.set(a.pos.x, a.pos.y + 1.0, a.pos.z), _w.set(x - cz * hw, gy + 1.0, z + sx * hw))) { why.push('slab'); continue; }
    }
    return { x, y: gy, z, yaw: yaw + Math.PI, view: { x: a.pos.x, y: a.pos.y, z: a.pos.z }, tries: why.length };
  }
  return { none: true, why: why.join(' ') };
}
