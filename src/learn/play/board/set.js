// 展板路 M6 — the boards themselves (docs/PLAY.md §3 M6, §7): a glossy slab in her ink (the rim), a face of dark glass
// with the board's canvas on it, two metal posts down to the ground. Slabs and posts are one InstancedMesh each for every
// board in the set; each face is its own quad with its own CanvasTexture (≤ 6 boards: ≤ 8 draw calls).
//
//   const S = new BoardSet({ scene, ink, reduced, max })
//   S.paint(spec) → entry { spec, layout, canvas, tex }        draw a board now (ahead of time: 2 gates before); entry.dispose()
//   S.add(entry, { x, y, z, yaw, w }) → board                  it rises out of the ground (pop); board = { i, w, h, bottom,
//                                                              center (world), normal, yaw, group, hot: [{ id, data, rect }] }
//   S.remove(board) · S.clear() · S.update(dt)        LEARN §48: one face uploaded a frame (G.renderer.initTexture), the
//                                                              board's rise begun once its face is up — a word gate's
//                                                              six boards rising together uploaded six 1024-px canvases in one
//   S.project(board, camera, W, H) → board.hot (rect: the hotspot's box on the screen, px)
//   S.warm(renderer, camera, target) · S.dispose()
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { G } from '../../../core/ctx.js';
import { LEARN } from '../../../config.js';
import { layoutBoard, drawBoard } from './paint.js';
import { canvasMeasure } from './text.js';
import { FONT } from './atlas.js';
import { canvasToBoard } from './hotspot.js';
import { labelFonts, titanIn } from '../atlas.js';

const BD = LEARN.board;
const _m = new THREE.Matrix4(), _b = new THREE.Matrix4(), _q = new THREE.Quaternion(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _v = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const easeOutBack = (k) => { const c = 1.4; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };

let _ctx = null;
function measureCtx() {
  if (_ctx || typeof document === 'undefined') return _ctx;
  _ctx = document.createElement('canvas').getContext('2d');
  return _ctx;
}

export class BoardSet {
  constructor({ scene, ink = '#ff8a14', reduced = false, max = 6 } = {}) {
    this.scene = scene; this.reduced = reduced; this.max = max;
    this.ink = new THREE.Color(ink); this.inkHex = '#' + this.ink.getHexString();
    this.group = new THREE.Group(); this.group.name = 'play-boards';
    this.slabMat = new THREE.MeshPhysicalMaterial({ color: this.ink.clone(), roughness: 0.18, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05, name: 'iw-board-slab' });
    this.postMat = new THREE.MeshStandardMaterial({ color: '#8f98a6', roughness: 0.38, metalness: 0.62, name: 'iw-board-post' });
    this.slabs = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 3, 0.12), this.slabMat, max);
    this.posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.065, 1, 10).translate(0, 0.5, 0), this.postMat, max * 2);
    for (const m of [this.slabs, this.posts]) { m.count = 0; m.frustumCulled = false; m.castShadow = true; m.receiveShadow = true; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); this.group.add(m); }
    this.faceGeo = new THREE.PlaneGeometry(1, 1);
    this.boards = [];
    this.dirty = true;
    scene?.add(this.group);
    labelFonts();   // (the boards' titles are Titan One — LEARN §38)
  }

  paint(spec) {
    const ctx = measureCtx();
    const layout = layoutBoard(spec, ctx ? { measure: canvasMeasure(ctx, FONT) } : {});
    let canvas = null, tex;
    if (typeof document !== 'undefined') {
      canvas = document.createElement('canvas'); canvas.width = layout.W; canvas.height = layout.H;
      drawBoard(canvas.getContext('2d'), layout, { ink: this.inkHex });
      tex = new THREE.CanvasTexture(canvas);
      tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    } else { tex = new THREE.DataTexture(new Uint8Array([20, 18, 28, 230]), 1, 1); tex.needsUpdate = true; }
    const entry = { spec, layout, canvas, tex, dispose() { this.gone = true; tex.dispose(); if (canvas) canvas.width = canvas.height = 1; } };
    // painted before Titan One was in (the first gate's boards, at the level load): once more when it is — same layout,
    // only the title's face changes (one upload per board, at most once)
    if (canvas && !titanIn() && document.fonts && document.fonts.load) {
      document.fonts.load('400 74px "Titan One"').then(() => {
        if (entry.gone || !titanIn()) return;
        drawBoard(canvas.getContext('2d'), layout, { ink: this.inkHex, titan: true }); tex.needsUpdate = true;
      }, () => null);
    }
    return entry;
  }

  add(entry, { x = 0, y = 0, z = 0, yaw = 0, w = BD.w, bottom = BD.bottom } = {}) {
    if (this.boards.length >= this.max) return null;
    const L = entry.layout, h = Math.min(2.6, (w * L.H) / L.W);
    const group = new THREE.Group();
    group.position.set(x, y, z); group.rotation.y = yaw;
    const mat = new THREE.MeshBasicMaterial({ map: entry.tex, transparent: true, toneMapped: false, name: 'iw-board-face' });
    const face = new THREE.Mesh(this.faceGeo, mat);
    face.scale.set(w, h, 1); face.position.set(0, bottom + h / 2, 0.066); face.renderOrder = 2;
    group.add(face);
    this.group.add(group);
    // (LEARN §48: its face waits for its upload — update() — when there is a renderer to upload to and a canvas to upload)
    const up = !(G.renderer && G.renderer.initTexture && entry.canvas);
    face.visible = up;
    const b = {
      i: this.boards.length, entry, w, h, bottom, yaw, group, face, mat, up, pop: this.reduced ? 1 : 0, popT: this.reduced ? 9 : -0.08 * this.boards.length,
      center: new THREE.Vector3(x, y + bottom + h / 2, z), normal: new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw)), base: new THREE.Vector3(x, y, z),
      hot: L.hotspots.map((hs) => ({ id: hs.id, data: hs.data || null, local: canvasToBoard(hs, L, w, h), rect: { x: 0, y: 0, w: 0, h: 0 } })),
    };
    this.boards.push(b);
    this.slabs.count = this.boards.length; this.posts.count = this.boards.length * 2;
    this.dirty = true;
    return b;
  }
  remove(b) {
    const k = this.boards.indexOf(b); if (k < 0) return;
    this.boards.splice(k, 1); this.group.remove(b.group); b.mat.dispose();
    this.boards.forEach((x, i) => { x.i = i; });
    this.slabs.count = this.boards.length; this.posts.count = this.boards.length * 2; this.dirty = true;
  }
  clear() { for (const b of this.boards.slice()) this.remove(b); }

  update(dt) {
    let busy = false;
    // one face up a frame (texImage2D + its mipmaps now, not on the first frame it is drawn), then it shows and rises —
    // a frame, not an update (a slow frame runs the match in two sub-steps; NaN without a clock: every update)
    const f = typeof G.time === 'number' ? G.time : NaN;
    if (f !== this._upF) for (const b of this.boards) if (!b.up) { this._upF = f; try { G.renderer?.initTexture?.(b.entry.tex); } catch (e) { /* drawn the first time instead */ } b.up = true; b.face.visible = true; break; }
    for (const b of this.boards) {
      if (!b.up) { busy = true; continue; }
      if (b.popT < 1) { b.popT += dt; b.pop = b.popT <= 0 ? 0.001 : b.popT >= 0.55 ? 1 : easeOutBack(b.popT / 0.55); busy = true; this.dirty = true; }
    }
    if (!this.dirty) return;
    for (let i = 0; i < this.boards.length; i++) {
      const b = this.boards[i], k = Math.max(0.001, b.pop);
      // the board's own frame, risen to k of its height (the posts grow, the slab rides up on them)
      _b.compose(b.group.position, _q.setFromAxisAngle(_up, b.yaw), _s.set(1, k, 1));
      b.group.scale.set(1, k, 1);
      _m.compose(_p.set(0, b.bottom + b.h / 2, 0), _q.identity(), _s.set(b.w + 0.14, b.h + 0.14, 0.11));
      this.slabs.setMatrixAt(i, _m.premultiply(_b));
      for (let s = 0; s < 2; s++) {
        _m.compose(_p.set((s ? 1 : -1) * b.w * 0.3, 0, -0.03), _q.identity(), _s.set(1, b.bottom + 0.1, 1));
        this.posts.setMatrixAt(i * 2 + s, _m.premultiply(_b));
      }
    }
    this.slabs.instanceMatrix.needsUpdate = true; this.posts.instanceMatrix.needsUpdate = true;
    this.dirty = busy;
  }

  // the board's hotspots on the screen now (px boxes round their projected corners)
  project(b, camera, W, H) {
    b.group.updateMatrixWorld();
    for (const h of b.hot) {
      const [x0, y0, x1, y1] = h.local;
      let ax = Infinity, ay = Infinity, bx = -Infinity, by = -Infinity, behind = false;
      for (let c = 0; c < 4; c++) {
        _v.set(c & 1 ? x1 : x0, b.bottom + b.h / 2 + (c & 2 ? y1 : y0), 0.07).applyMatrix4(b.group.matrixWorld).project(camera);
        if (_v.z > 1) behind = true;
        const sx = (_v.x + 1) / 2 * W, sy = (1 - _v.y) / 2 * H;
        ax = Math.min(ax, sx); ay = Math.min(ay, sy); bx = Math.max(bx, sx); by = Math.max(by, sy);
      }
      const r = h.rect;
      if (behind) { r.x = r.y = -1e4; r.w = r.h = 0; } else { r.x = ax; r.y = ay; r.w = bx - ax; r.h = by - ay; }
    }
    return b.hot;
  }

  // compileAsync of the slab, the posts and a face (every face shares one program: a map, transparent, unlit) — the
  // warm face's material is kept (never disposed), so its program stays cached for the boards that come later
  warm(renderer, camera, target = this.scene) {
    if (!this.keepMat) {
      this.keepTex = new THREE.DataTexture(new Uint8Array([20, 18, 28, 230]), 1, 1); this.keepTex.needsUpdate = true; this.keepTex.colorSpace = THREE.SRGBColorSpace;
      this.keepMat = new THREE.MeshBasicMaterial({ map: this.keepTex, transparent: true, toneMapped: false, name: 'iw-board-face' });
    }
    const m = new THREE.Mesh(this.faceGeo, this.keepMat);
    this.group.add(m);
    const sc = this.slabs.count, pc = this.posts.count;
    this.slabs.count = Math.max(1, sc); this.posts.count = Math.max(1, pc);
    try { return renderer.compileAsync ? renderer.compileAsync(this.group, camera, target || null) : Promise.resolve(renderer.compile(this.group, camera)); }
    finally { this.group.remove(m); this.slabs.count = sc; this.posts.count = pc; }
  }
  dispose() {
    this.clear(); this.scene?.remove(this.group);
    this.slabs.geometry.dispose(); this.posts.geometry.dispose(); this.faceGeo.dispose(); this.slabMat.dispose(); this.postMat.dispose(); this.keepMat?.dispose(); this.keepTex?.dispose();
  }
}
