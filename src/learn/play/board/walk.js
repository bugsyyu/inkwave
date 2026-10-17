// 展板路 M6 board-walk (docs/PLAY.md §3 M6): the boards along the approach to a gate — 课文 / the check-in note (up to 200
// characters), the word boards (5 words a board), the sounds, the grammar lesson's lines, the reading passage. She walks
// (or is walked) up to a board and the camera springs round to frame it; while she stands there it stays framed; walking
// on lets go — that is the page turn, there is no 下一页. On the board itself: a row replays its word, 「跟读」 plays them
// with gaps to say them after, 「听全文」 plays the passage, 「读全文」 opens the reading strip (strip.js: the lower half,
// scrolls, the world runs on; ✕ or walking on closes it; never while a question is up). Nothing comes at her in a board
// zone (inZone() — the race's bots and the duel ask it).
//
//   const W = new BoardWalk({ scene, camera, color, reduced, root })
//   W.prepare(key, specs) → entries          paint a gate's boards ahead (2 gates before it); W.free(key)
//   W.place(key, spots)                      they rise at spots [{ x, y, z, yaw }] (frame.js boardSpots(route, n))
//   W.update(dt, herPos, { aspect, speed })  zones and framing; per frame
//   W.framing → { pos, look, fov } | null    the camera pose to spring to (world); null = back to following her
//   W.framed → board index | −1 · W.read(i) · W.allRead()
//   W.nextSpot() → { x, y, z, yaw, i } | null   the next unread board's viewing spot: the auto-walk stops there (portrait
//                                            phones have no stick — the 「自动走」 button walks her on)
//   W.inZone(pos) → bool
//   W.questionUp = bool                      a question is up: the strip closes and will not open
//   W.bandFor = (aspect, W, H, slab) → band | null   play-7: the framing band (frame.js boardBand's shape) when the screen's top
//                                            holds more than the default allows for (the boss's HP bar: arena/host.js)
//   W.tapApi { down(x, y, id) → bool, up(x, y, id, cancel) }   taps on the framed board's hotspots (touch.js G.playTap)
//   W.on = { speak(text, { slow, onEnd }), framed(i), read(i), more(i), hotspot(id, board, data) }
//   W.clear() · W.dispose() · W.warm(renderer, camera)
import * as THREE from 'three';
import { LEARN } from '../../../config.js';
import { BoardSet } from './set.js';
import { ReadStrip } from './strip.js';
import { frameBoard } from './frame.js';
import { pickHotspot } from './hotspot.js';

const BD = LEARN.board;
const _v = new THREE.Vector3();

export class BoardWalk {
  constructor({ scene, camera, color = '#ff8a14', reduced = false, root = null, max = 6 } = {}) {
    this.scene = scene; this.camera = camera; this.reduced = reduced;
    this.set = new BoardSet({ scene, ink: color, reduced, max });
    this.strip = new ReadStrip(root, { ink: typeof color === 'string' ? color : '#' + new THREE.Color(color).getHexString() });
    this.entries = new Map();
    this.list = [];           // placed: [{ b, spot, read, t, view: Vector3 }]
    this.framed = -1; this.framing = null; this._aspect = 0;
    this.on = {}; this.bandFor = null;
    this._q = false; this._tap = null; this._seq = 0;
    this.tapApi = { down: (x, y, id) => this._down(x, y, id), up: (x, y, id, cancel) => this._up(x, y, id, cancel) };
    this.strip.onClose = () => { this.on.stripClosed?.(); };
  }

  prepare(key, specs) {
    if (this.entries.has(key)) return this.entries.get(key);
    const list = (specs || []).map((s) => this.set.paint(s));
    this.entries.set(key, list);
    return list;
  }
  free(key) {
    const list = this.entries.get(key); if (!list) return;
    for (const L of this.list.slice()) if (list.includes(L.b.entry)) { this.set.remove(L.b); this.list.splice(this.list.indexOf(L), 1); }
    for (const e of list) e.dispose();
    this.entries.delete(key);
    if (this.framed >= this.list.length) this._unframe();
  }
  place(key, spots, o = {}) {
    const list = this.entries.get(key) || [];
    spots.forEach((s, k) => {
      const e = list[k]; if (!e) return;
      const b = this.set.add(e, { x: s.x, y: s.y, z: s.z, yaw: s.yaw, w: o.w || BD.w });
      if (!b) return;
      const view = s.view ? new THREE.Vector3(s.view.x, s.view.y, s.view.z) : new THREE.Vector3(s.x + Math.sin(s.yaw) * BD.view, s.y, s.z + Math.cos(s.yaw) * BD.view);
      this.list.push({ b, spot: s, view, read: false, t: 0, inT: 0, key });
    });
    return this.list;
  }
  clear() { this._unframe(); this.set.clear(); this.list.length = 0; }

  get questionUp() { return this._q; }
  set questionUp(on) { this._q = !!on; this.strip.blocked = !!on; }

  inZone(pos) { for (const L of this.list) if (Math.hypot(pos.x - L.view.x, pos.z - L.view.z) < BD.zone) return true; return false; }
  read(i) { return !!(this.list[i] && this.list[i].read); }
  allRead() { return this.list.every((L) => L.read); }
  nextSpot() {
    const i = this.list.findIndex((L) => !L.read);
    if (i < 0) return null;
    const L = this.list[i];
    return { x: L.view.x, y: L.view.y, z: L.view.z, yaw: L.spot.yaw + Math.PI, i };
  }

  update(dt, her, o = {}) {
    this.set.update(dt);
    if (!her) return;
    const aspect = o.aspect || 16 / 9, speed = o.speed ?? 0;
    // the nearest board whose viewing spot she is at; she has to slow down (or linger) for the camera to come round,
    // and walk clear of the zone (a little past its edge) for it to let go
    // (play-8: a board already read counts 0.6 m farther — of two boards at one viewing spot, or nearly, the unread one is
    // framed once the other is read, where she stands; before, the first stayed framed and the auto-walk, sent on to the
    // other, stopped there again and again; the framed one keeps a hair's edge so two read ones do not trade the lens)
    let best = -1, bd = Infinity;
    for (let i = 0; i < this.list.length; i++) {
      const L = this.list[i], d = Math.hypot(her.x - L.view.x, her.z - L.view.z), e = d + (L.read ? 0.6 : 0) - (i === this.framed ? 0.05 : 0);
      const inside = d < BD.zone + (i === this.framed ? 0.4 : 0);
      L.inT = inside ? L.inT + dt : 0;
      if (inside && e < bd && (i === this.framed || speed < 1.6 || L.inT > 0.35)) { best = i; bd = e; }
    }
    if (best !== this.framed) {
      if (best < 0) this._unframe();
      else { this.framed = best; this._frame(aspect); this.on.framed?.(best); }
    } else if (best >= 0 && Math.abs(aspect - this._aspect) > 1e-3) this._frame(aspect);
    if (this.framed >= 0) {
      const L = this.list[this.framed];
      L.t += dt;
      if (!L.read && L.t >= BD.readS) { L.read = true; this.on.read?.(this.framed); }
    }
  }
  _unframe() {
    if (this.framed >= 0) this.on.unframed?.(this.framed);
    this.framed = -1; this.framing = null;
    this.strip.close();
  }
  // the pose that frames board i (world): straight in front of it, the board filling the band
  frameOf(i, aspect, W, H) {
    const L = this.list[i]; if (!L) return null;
    const b = L.b, slab = { w: b.w + 0.14, h: b.h + 0.14, bottom: b.bottom - 0.07 };
    const band = this.bandFor ? this.bandFor(aspect, W, H, slab) : null;   // (play-9: the board too — landscape.js hudBand)
    const f = frameBoard(slab, aspect, band ? { W, H, band } : { W, H });
    const s = Math.sin(b.yaw), c = Math.cos(b.yaw), x = b.base.x, y = b.base.y, z = b.base.z;
    const toW = (p, out) => out.set(x + p[0] * c + p[2] * s, y + p[1], z - p[0] * s + p[2] * c);
    return { pos: toW(f.pos, new THREE.Vector3()), look: toW(f.look, new THREE.Vector3()), fov: f.fov, frame: f };
  }
  _frame(aspect) {
    this._aspect = aspect;
    const W = typeof innerWidth !== 'undefined' ? innerWidth : Math.round(844 * Math.min(aspect, 1)), H = typeof innerHeight !== 'undefined' ? innerHeight : 844;
    this.framing = this.frameOf(this.framed, aspect, W, H);
  }

  // ---------------------------------------------------------------------------------------------- taps on the board
  _hit(x, y) {
    if (this.framed < 0 || !this.camera) return null;
    const b = this.list[this.framed].b;
    const W = typeof innerWidth !== 'undefined' ? innerWidth : 1280, H = typeof innerHeight !== 'undefined' ? innerHeight : 720;
    const hot = this.set.project(b, this.camera, W, H);
    const k = pickHotspot(x, y, hot.map((h) => h.rect));
    return k >= 0 ? hot[k] : null;
  }
  _down(x, y, id) {
    const h = this._hit(x, y);
    if (!h) return false;
    this._tap = { id, x, y, h };
    return true;
  }
  _up(x, y, id, cancel) {
    const T = this._tap; if (!T || T.id !== id) return false;
    this._tap = null;
    if (cancel || Math.hypot(x - T.x, y - T.y) > 18) return true;
    this.activate(T.h.id, T.h.data);
    return true;
  }
  // a hotspot by id (the lab and the audits press them directly)
  activate(id, data) {
    const L = this.list[this.framed]; if (!L) return false;
    const spec = L.b.entry.spec;
    if (id.startsWith('row:')) { this.on.speak?.(data?.tts || data?.en || '', {}); return true; }
    if (id === 'follow') { this._follow(spec.rows || []); return true; }
    if (id === 'listen') { this.on.speak?.(spec.tts || '', {}); return true; }
    if (id === 'more') { this.strip.open({ kicker: spec.kicker || '', title: [spec.title, spec.sub].filter(Boolean).join(' · ') || spec.kicker || '', blocks: L.b.entry.layout.full || [] }); this.on.more?.(this.framed); return true; }
    this.on.hotspot?.(id, L.b, data);
    return true;
  }
  // 跟读: each word, then a gap as long as the word to say it after (the speak hook calls onEnd; without it, a timer)
  _follow(rows) {
    const seq = ++this._seq;
    let i = 0;
    const next = () => {
      if (seq !== this._seq || i >= rows.length || this.framed < 0) return;
      const r = rows[i++];
      let ended = false;
      const after = () => { if (ended) return; ended = true; setTimeout(next, 900 + 60 * String(r.en || '').length)?.unref?.(); };
      this.on.speak?.(r.tts || r.en, { slow: true, onEnd: after });
      setTimeout(after, 2600)?.unref?.();   // (no onEnd from the voice: go on anyway)
    };
    next();
  }

  warm(renderer, camera, target) { return this.set.warm(renderer, camera, target); }
  dispose() { this.clear(); for (const k of [...this.entries.keys()]) this.free(k); this.set.dispose(); this.strip.dispose(); }
}
