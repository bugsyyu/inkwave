// 题即玩法 — a round hitting a question object (docs/PLAY.md §3 M1, §1 rule 5). Pure (Node-tested), no three.js needed:
// points are anything with x / y / z.
//
//   segSpheres(a, b, pad, spheres, out?) → { t, index, dist, point } | null
//       the nearest hit sphere along the segment a → b, within `pad` of its surface — the arithmetic of HULLBREAKER's
//       Boss.segHit (src/boss/boss.js: closest point on the segment clamped to it, then backed off to the entry point;
//       nearest entry wins), so a round meets a question object exactly the way it meets the boss's shell
//   raySpheres(o, d, max, spheres) → { dist, index } | null
//       exact ray (unit d) vs the spheres within max — Boss.rayDist's arithmetic (the crosshair test)
//   spheres: [{ x, y, z, r, target, active? }] — a ball is one sphere; a banner plank a row of overlapping ones along it
//
//   class ShotTargets — the registry weapons.js asks (G.playTargets, set while question objects are up):
//     set(spheres, serial)  the live objects and the question's serial (a new serial for every question, and again once
//                           it is answered: a round still in flight from before can never answer the next one)
//     tag(p, target)        mark a round as deliberately aimed at `target` for the current serial (a tap-shot, or a shot
//                           fired with the crosshair on that object): p.playTag = serial · 16 + target + 1
//     shotHit(p) → bool     Projectiles._step, every round, every frame, before the world: true = the round splats on an
//                           object (the caller ends it). onHit(target, point, deliberate, p) fires for every such
//                           round; only a deliberate one — tagged for this very object and this serial — may answer.
//                           Splash, blasts' bursts, bombs, specials and trail drips never come here (they are not
//                           rounds along a segment): only a direct hit can answer.
//                           挡住 is not 打偏 (LEARN §54; PLAY §1 rule 5): the live question's tagged round meeting ANOTHER
//                           object of the same question is let through (false, no splat) while its own object still lies
//                           ahead on its path — the one she tapped stands behind this one as seen from her muzzle — and
//                           answers when it reaches it (in this very step too: onPath / segSpheres `only`); a tagged round
//                           whose own object is behind it or off its line is a stray: it splats where it hit, answers nothing
//     through(p) → bool     a round tagged for the live question: weapons.js lets it through the world (scenery between
//                           her muzzle and the object never eats a tap-shot; only reaching the object answers)
//     clear()
const _out = { t: 0, index: -1, dist: 0, point: { x: 0, y: 0, z: 0 } };

export function segSpheres(a, b, pad, spheres, out = _out, only = -1) {   // (only ≥ 0: that target's spheres alone)
  let best = null, bi = -1, bt = 0;
  const abx = b.x - a.x, aby = b.y - a.y, abz = b.z - a.z, L2 = abx * abx + aby * aby + abz * abz || 1e-9;
  for (let i = 0; i < spheres.length; i++) {
    const h = spheres[i];
    if (h.active === false || (only >= 0 && h.target !== only)) continue;
    let t = ((h.x - a.x) * abx + (h.y - a.y) * aby + (h.z - a.z) * abz) / L2;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    const px = a.x + abx * t - h.x, py = a.y + aby * t - h.y, pz = a.z + abz * t - h.z;
    const R = h.r + pad, d2 = px * px + py * py + pz * pz;
    if (d2 > R * R) continue;
    // entry point along the segment (back off from the closest point)
    const back = Math.sqrt(Math.max(0, R * R - d2) / L2);
    const te = Math.max(0, t - back);
    if (best === null || te < best) { best = te; bi = i; bt = te; }
  }
  if (best === null) return null;
  out.t = bt; out.index = bi;
  out.point.x = a.x + abx * bt; out.point.y = a.y + aby * bt; out.point.z = a.z + abz * bt;
  out.dist = Math.sqrt(L2) * bt;
  return out;
}

const _ray = { dist: 0, index: -1 };
export function raySpheres(o, d, max, spheres, out = _ray) {
  let best = -1, bi = -1;
  for (let i = 0; i < spheres.length; i++) {
    const h = spheres[i];
    if (h.active === false) continue;
    const ox = o.x - h.x, oy = o.y - h.y, oz = o.z - h.z;
    const bq = ox * d.x + oy * d.y + oz * d.z, cq = ox * ox + oy * oy + oz * oz - h.r * h.r, disc = bq * bq - cq;
    if (disc < 0) continue;
    const t = -bq - Math.sqrt(disc);
    if (t > 0 && t < max && (best < 0 || t < best)) { best = t; bi = i; }
  }
  if (best < 0) return null;
  out.dist = best; out.index = bi;
  return out;
}

// a banner plank (centre c, its right-pointing unit axis ax, width w, height h) as a row of overlapping spheres: the
// boss's own way of giving a long body a hit shape. Writes into `out` from index k; returns the next index.
export function plankSpheres(c, ax, w, h, target, out, k = 0) {
  const r = h * 0.62, n = Math.max(2, Math.ceil(w / (r * 1.4)) + 1);
  for (let j = 0; j < n; j++) {
    const s = n === 1 ? 0 : (j / (n - 1) - 0.5) * Math.max(0, w - r * 1.2);
    const o = out[k] || (out[k] = { x: 0, y: 0, z: 0, r: 0, target: -1, active: true });
    o.x = c.x + ax.x * s; o.y = c.y + ax.y * s; o.z = c.z + ax.z * s; o.r = r; o.target = target; o.active = true;
    k++;
  }
  return k;
}

// the drop a round still makes before it is `dist` m further along its path: its tangent now passes above where it will
// be by at most this (weapons.js _step: straight for p.straight s from launch, then p.grav down with p.drag — the drag only
// keeps it in the air a little longer, first order here). 0 for a round without gravity.
export function dropAhead(p, dist) {
  const v = p.vel, sp = v ? Math.hypot(v.x, v.y, v.z) : 0;
  if (!(sp > 0.01) || !(p.grav > 0)) return 0;
  let T = dist / sp; T *= 1 + 0.5 * (p.drag || 0) * T;
  const fall = Math.max(0, T - Math.max(0, (p.straight || 0) - (p.age || 0)));
  return 0.5 * p.grav * fall * fall;
}

// does a sphere of `target` still lie ahead of the round on its path? Its tangent from p.pos (p.vel, else the step's
// direction) passes within the sphere's radius + pad of its centre — or of the centre lifted by the drop the round still
// makes over that distance (the arc only bends down: a blocker met early in the flight is met while the tangent still
// points above the ball she tapped). A sphere behind the round never counts.
export function onPath(p, target, pad, spheres) {
  const v = p.vel && Math.hypot(p.vel.x, p.vel.y, p.vel.z) > 0.01 ? p.vel : { x: p.pos.x - p.prev.x, y: p.pos.y - p.prev.y, z: p.pos.z - p.prev.z };
  const sp = Math.hypot(v.x, v.y, v.z); if (!(sp > 1e-6)) return false;
  const dx = v.x / sp, dy = v.y / sp, dz = v.z / sp;
  for (let i = 0; i < spheres.length; i++) {
    const h = spheres[i];
    if (h.target !== target || h.active === false) continue;
    const ox = h.x - p.pos.x, oy = h.y - p.pos.y, oz = h.z - p.pos.z;
    if (ox * dx + oy * dy + oz * dz <= 0) continue;   // behind it
    const R = h.r + pad + 0.1, drop = dropAhead(p, Math.hypot(ox, oy, oz));
    for (let s = 0; s <= 2; s++) {
      const ly = oy + drop * s * 0.5, al = ox * dx + ly * dy + oz * dz;
      const px = ox - dx * al, py = ly - dy * al, pz = oz - dz * al;
      if (px * px + py * py + pz * pz <= R * R) return true;
    }
  }
  return false;
}

export class ShotTargets {
  constructor() {
    this.spheres = []; this.serial = 1; this.onHit = null;
    this._h = { t: 0, index: -1, dist: 0, point: { x: 0, y: 0, z: 0 } };
    this._h2 = { t: 0, index: -1, dist: 0, point: { x: 0, y: 0, z: 0 } };
  }
  set(spheres, serial) { this.spheres = spheres || []; if (serial != null) this.serial = serial; }
  clear() { this.spheres = []; }
  tagOf(target) { return this.serial * 16 + target + 1; }
  tag(p, target) { if (p) p.playTag = this.tagOf(target); return p; }
  // a round tagged for this question flies to its object whatever stands in between (a fountain pole between her muzzle
  // and an object the camera sees whole must not leave her tapping with nothing happening): weapons.js skips the world
  // for it; it still has to reach the object to answer
  through(p) { return !!(p && p.playTag) && this.spheres.length > 0 && ((p.playTag - 1) >> 4) === this.serial; }
  shotHit(p) {
    if (!this.spheres.length || !p || p.ghost) return false;
    const pad = (p.size || 0.15) * 0.6;
    const h = segSpheres(p.prev, p.pos, pad, this.spheres, this._h);
    if (!h) return false;
    const target = this.spheres[h.index].target;
    if (p.playTag && p.playTag !== this.tagOf(target) && this.through(p)) {
      // 挡住 / 打偏 (LEARN §54): another object of this question stands where her tap-shot flies. Her own object further
      // along this same step: that one answers now. Her own object still ahead on its path: the round flies on through
      // this one (no splat, no answer yet). Her own object behind it or off its line — a stray: it splats here, answers nothing
      const own = (p.playTag - 1) % 16, h2 = segSpheres(p.prev, p.pos, pad, this.spheres, this._h2, own);
      if (h2) { this.onHit?.(own, h2.point, true, p); return true; }
      if (onPath(p, own, pad, this.spheres)) return false;
    }
    const deliberate = !!p.playTag && p.playTag === this.tagOf(target);
    this.onHit?.(target, h.point, deliberate, p);
    return true;
  }
}
