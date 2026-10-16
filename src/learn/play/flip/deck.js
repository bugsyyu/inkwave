// 翻牌靶 M8 flip-target (docs/PLAY.md §3 M8; LEARN §15 F): the review day's 150 words. An ink card rises out of the ground
// in front of her with the Chinese on its face; a tap (or a shot) on it flips it — the English, its IPA, its sound on the
// back; then two targets float in beside it: 「认识」 / 「不熟」. Hitting one is her own rating — exactly the card's
// 「记得」 (true) / 「不记得」 (false), which the flow judges and records as before (flipJudge → recordFirst({ how: 'F' })).
// 认识: the card bursts into her ink. 不熟: no lock, no coral (it is not a mistake) — the card sinks back and the word is
// handed to the typing weapon (on.typeIt: the flow re-queues it as the typed card, item._flipTyped, for TypeShot).
//
//   const D = new FlipDeck({ scene, camera, color, reduced, targets? })   targets: InkTargets (default) or play-1's PlayTargets
//   D.prepare(items)                       draw the next cards' faces ahead (front / back of each)
//   D.ask({ item, at, yaw })               a card rises at `at` (on the ground, ≈ LEARN.flip.ahead m in front of her), facing yaw
//   D.hit(what)                            'card' | 0 (认识) | 1 (不熟): a tap or a deliberate shot (play-1's ShotTargets)
//   D.tapApi { down, up } · D.hitShapes() → [{ x, y, z, r, target: 'card' | 0 | 1 }]
//   D.on = { speak(text), rate(answer: true | false), typeIt(item) }
//   D.resolve({ ok }) → Promise            the show after the flow's verdict (ok = 认识)
//   D.frame(aspect) → { pos, look, fov }   the camera pose (world): the card and both targets in the band
//   D.update(dt) · D.clear() · D.warm(renderer, camera) · D.dispose() · D.phase ('off' | 'rise' | 'front' | 'turn' | 'back' | 'rated' | 'done')
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { G } from '../../../core/ctx.js';
import { LEARN } from '../../../config.js';
import { InkTargets, pickTarget, labelKey } from './targets.js';
import { glass, fitFont, FONT, TEXT, MUTED, DIM } from '../board/atlas.js';
import { frameBoard } from '../board/frame.js';
import { pickHotspot } from '../board/hotspot.js';

const F = LEARN.flip;
export const RATE = [{ zh: '认识', en: 'I know it', answer: true }, { zh: '不熟', en: 'Not yet', answer: false }];   // the card's 记得 / 不记得
export const CARD_TEX = { w: 512, h: 656 };   // one face (the canvas holds front | back side by side)
const _v = new THREE.Vector3(), _w = new THREE.Vector3(), _up = new THREE.Vector3(0, 1, 0);
const easeOutBack = (k) => { const c = 1.6; return 1 + (c + 1) * Math.pow(k - 1, 3) + c * Math.pow(k - 1, 2); };
const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

// the faces of one card: front — the Chinese, big; back — the word, its US IPA, its Chinese
export function drawCard(x, item) {
  const m = (item && item.meta) || {}, zh = m.zhFull || item.zh || '', en = item.en || '', ipa = m.ipaUs || m.ipa || '';
  const W = CARD_TEX.w, H = CARD_TEX.h;
  x.clearRect(0, 0, W * 2, H);
  for (const side of [0, 1]) {
    const X = side * W;
    glass(x, X + 6, 6, W - 12, H - 12, 46, 'rgba(255,255,255,0.22)', 6);
    x.textAlign = 'center';
    if (!side) {
      x.fillStyle = DIM; x.font = `700 46px ${FONT}`; x.fillText('想一想英文', X + W / 2, 96);
      const lines = zh.length > 6 ? [zh.slice(0, Math.ceil(zh.length / 2)), zh.slice(Math.ceil(zh.length / 2))] : [zh];
      lines.forEach((l, i) => { const px = fitFont(x, l, 800, 132, 64, W * 0.84); x.fillStyle = TEXT; x.fillText(l, X + W / 2, H * 0.5 + (i - (lines.length - 1) / 2) * px * 1.15 + px * 0.35); });
      x.fillStyle = MUTED; x.font = `600 46px ${FONT}`; x.fillText('点一下翻过来', X + W / 2, H - 70);
    } else {
      const px = fitFont(x, en, 800, 118, 56, W * 0.86);
      x.fillStyle = TEXT; x.fillText(en, X + W / 2, H * 0.44);
      if (ipa) { fitFont(x, `/${ipa}/`, 500, 58, 46, W * 0.86); x.fillStyle = DIM; x.fillText(`/${ipa}/`, X + W / 2, H * 0.44 + px * 0.5 + 58); }
      fitFont(x, zh, 700, 62, 46, W * 0.86); x.fillStyle = MUTED; x.fillText(zh, X + W / 2, H - 92);
    }
  }
}

export class FlipDeck {
  constructor({ scene, camera, color = '#ff8a14', team = 0, reduced = false, targets = null } = {}) {
    this.scene = scene; this.camera = camera; this.team = team; this.reduced = reduced;
    this.ink = new THREE.Color(color);
    this.group = new THREE.Group(); this.group.name = 'play-flip'; this.group.visible = false;
    this.card = new THREE.Group(); this.group.add(this.card);
    const [cw, ch] = F.card;
    this.bodyMat = new THREE.MeshPhysicalMaterial({ color: '#8d929b', roughness: 0.16, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.3, sheenRoughness: 0.3, sheenColor: new THREE.Color('#c8ccd4'), name: 'iw-flip-card' });
    this.body = new THREE.Mesh(new RoundedBoxGeometry(cw + 0.12, ch + 0.12, 0.1, 3, 0.07), this.bodyMat);
    this.body.castShadow = true;
    // both faces in one mesh: the front (+Z) reads the canvas's left half, the back (−Z, turned) its right half
    const front = new THREE.PlaneGeometry(cw, ch), back = new THREE.PlaneGeometry(cw, ch);
    const fu = front.attributes.uv, bu = back.attributes.uv;
    for (let i = 0; i < fu.count; i++) { fu.setX(i, fu.getX(i) * 0.5); bu.setX(i, 0.5 + bu.getX(i) * 0.5); }
    front.translate(0, 0, 0.056); back.rotateY(Math.PI); back.translate(0, 0, -0.056);
    this.faceGeo = mergeTwo(front, back);
    this.blank = new THREE.DataTexture(new Uint8Array([20, 18, 28, 255]), 1, 1); this.blank.needsUpdate = true; this.blank.colorSpace = THREE.SRGBColorSpace;
    this.faceMat = new THREE.MeshBasicMaterial({ map: this.blank, transparent: true, toneMapped: false, name: 'iw-flip-face' });
    this.faces = new THREE.Mesh(this.faceGeo, this.faceMat); this.faces.renderOrder = 2;
    this.card.add(this.body, this.faces);
    // (the targets are placed in WORLD coordinates — _showTargets applies the card group's matrix itself — so their group
    // is the scene's, never a child of the card group: under it they were transformed twice and stood somewhere else
    // while their projection, and so a tap, was right; play-wire)
    this.T = targets || new InkTargets({ scene, reduced, ink: '#' + this.ink.getHexString() });
    this.T.setInk?.(this.ink);
    this.rateAtlas = this.T.atlas('flip:rate', RATE);
    scene?.add(this.group);
    this.pool = new Map();   // item id → { canvas, tex } (drawn ahead; the last few kept)
    this.on = {};
    this.phase = 'off'; this.t = 0; this.item = null; this.at = new THREE.Vector3(); this.yaw = 0;
    this.verdict = null; this.aspect = 16 / 9;
    this.tapApi = { down: (x, y, id) => this._down(x, y, id), up: (x, y, id, cancel) => this._up(x, y, id, cancel) };
    this.log = [];
  }

  prepare(items) {
    for (const it of items || []) {
      if (!it || this.pool.has(it.id)) continue;
      let canvas = null, tex;
      if (typeof document !== 'undefined') {
        canvas = document.createElement('canvas'); canvas.width = CARD_TEX.w * 2; canvas.height = CARD_TEX.h;
        drawCard(canvas.getContext('2d'), it);
        tex = new THREE.CanvasTexture(canvas); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
      } else { tex = this.blank.clone(); tex.needsUpdate = true; }
      this.pool.set(it.id, { canvas, tex });
    }
    // keep the pool small: the cards drawn ahead and the one up
    while (this.pool.size > 4) { const k = this.pool.keys().next().value; if (this.item && k === this.item.id) break; const e = this.pool.get(k); e.tex.dispose(); if (e.canvas) e.canvas.width = e.canvas.height = 1; this.pool.delete(k); }
  }

  ask({ item, at, yaw = 0, aspect }) {
    if (aspect) this.aspect = aspect;
    this.prepare([item]);
    this.item = item; this.at.copy(at); this.yaw = yaw;
    this.faceMat.map = this.pool.get(item.id).tex;
    this.group.position.copy(at); this.group.rotation.set(0, yaw, 0); this.group.visible = true; this.group.updateMatrixWorld(true);
    this.card.rotation.set(0, 0, 0); this.card.visible = true; this.card.scale.setScalar(1);
    this.phase = 'rise'; this.t = 0; this.verdict = null; this.rated = null;
    this.T.hide();
    this.log.push({ ev: 'ask', id: item.id });
    return this;
  }
  // where the targets float: beside the card in landscape, under it (side by side) in portrait — the deck's frame:
  // +Z towards her and the camera, +X the screen's right (she faces the card: her right). 认识 left, 不熟 right.
  _targetLayout() {
    const portrait = this.aspect < 1, [cw, ch] = F.card, r = F.ball;
    const pw = 1.05, ph = pw * 160 / 384;
    if (portrait) {
      const y = F.lift - ch / 2 - 0.55 - r;
      return [0, 1].map((k) => { const x = (k ? 1 : -1) * 0.78; return { x, y, z: 0.3, r, plate: { x, y: y - r - ph / 2 - 0.06, z: 0.3, w: pw, h: ph } }; });
    }
    return [0, 1].map((k) => { const x = (k ? 1 : -1) * (cw / 2 + F.side * 0.62 + r); const y = F.lift + 0.15; return { x, y, z: 0.25, r, plate: { x, y: y - r - ph / 2 - 0.06, z: 0.25, w: pw, h: ph } }; });
  }
  _showTargets() {
    const L = this._targetLayout(), M = this.group.matrixWorld;
    const objs = L.map((o, k) => {
      _v.set(o.x, o.y, o.z).applyMatrix4(M); _w.set(o.plate.x, o.plate.y, o.plate.z).applyMatrix4(M);
      return { i: k, kind: 'ball', key: labelKey(RATE[k]), x: _v.x, y: _v.y, z: _v.z, r: o.r, plate: { x: _w.x, y: _w.y, z: _w.z, w: o.plate.w, h: o.plate.h } };
    });
    // the plates face the camera in front of the card: back = the card's normal, right = the screen's right
    const back = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)), right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));
    this.T.show(this.rateAtlas, objs, { right, up: _up.clone(), back });
  }

  hit(what) {
    if (what === 'card') {
      if (this.phase !== 'front') return false;
      this.phase = 'turn'; this.t = 0;
      G.audio?.play?.('ui_toggle', { volume: 0.6 });
      this.log.push({ ev: 'flip' });
      return true;
    }
    if ((what === 0 || what === 1) && this.phase === 'back') {
      this.phase = 'rated'; this.rated = what;
      this.log.push({ ev: 'rate', k: what });
      this.on.rate?.(RATE[what].answer);   // exactly the card's 记得 (true) / 不记得 (false)
      return true;
    }
    return false;
  }

  resolve({ ok }) {
    const k = this.rated ?? (ok ? 0 : 1);
    _v.set(0, F.lift, 0).applyMatrix4(this.group.matrixWorld);
    if (ok) {
      this.T.state(0, 'right'); this.T.burst(0);
      if (!this.reduced) G.fx?.explosion?.(_v, this.ink, 1.3);
      G.fx?.ring?.(_v, _up, this.ink, { radius: 1.5, life: 0.4 });
      _w.copy(this.at); _w.y += 0.05; G.paint?.splat?.(_w, 1.3, this.team, { kind: 'blast' });
      G.audio?.play?.('splat_big', { pos: _v, volume: 0.8 });
      this.card.visible = false;
    } else {
      this.T.state(k, 'dim');
      G.audio?.play?.('ui_toggle', { volume: 0.7 });
    }
    this.phase = ok ? 'done' : 'sink'; this.t = 0;
    const ms = this.reduced ? 450 : 900;
    return new Promise((done) => { this.verdict = { left: ms / 1000, done, ok }; });
  }

  // ---------------------------------------------------------------------------------------------- input
  _cardRect(W, H) {
    const [cw, ch] = F.card, M = this.card.matrixWorld;
    let ax = Infinity, ay = Infinity, bx = -Infinity, by = -Infinity;
    for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      _v.set(sx * cw / 2, sy * ch / 2, 0).applyMatrix4(M).project(this.camera);
      const x = (_v.x + 1) / 2 * W, y = (1 - _v.y) / 2 * H; ax = Math.min(ax, x); ay = Math.min(ay, y); bx = Math.max(bx, x); by = Math.max(by, y);
    }
    return { x: ax, y: ay, w: bx - ax, h: by - ay };
  }
  _pick(x, y) {
    if (!this.camera) return null;
    const W = typeof innerWidth !== 'undefined' ? innerWidth : 1280, H = typeof innerHeight !== 'undefined' ? innerHeight : 720;
    this.card.updateMatrixWorld(true);
    if (this.phase === 'front') return pickHotspot(x, y, [this._cardRect(W, H)]) === 0 ? 'card' : null;
    if (this.phase === 'back') { const k = pickTarget(x, y, this.T.project(this.camera, W, H)); return k >= 0 ? k : null; }
    return null;
  }
  _down(x, y, id) { const w = this._pick(x, y); if (w == null) return false; this._tap = { id, x, y, w }; return true; }
  _up(x, y, id, cancel) {
    const T = this._tap; if (!T || T.id !== id) return false;
    this._tap = null;
    if (!cancel && Math.hypot(x - T.x, y - T.y) < 18) this.hit(T.w);
    return true;
  }
  // the shapes a deliberate shot may hit (play-1's ShotTargets): the card as three spheres up its middle, the targets
  hitShapes(out = this._shapes || (this._shapes = [])) {
    out.length = 0;
    if (this.phase === 'front') { const [, ch] = F.card; for (const k of [-1, 0, 1]) { _v.set(0, F.lift + k * ch * 0.3, 0).applyMatrix4(this.group.matrixWorld); out.push({ x: _v.x, y: _v.y, z: _v.z, r: 0.5, target: 'card', active: true }); } }
    if (this.phase === 'back') for (const s of this.T.spheres) out.push(s);
    return out;
  }

  // the camera: the card and both targets, framed like a board (straight on, the band under the HUD's top row)
  frame(aspect = this.aspect) {
    this.aspect = aspect;
    const L = this._targetLayout(), [cw, ch] = F.card;
    let x0 = -cw / 2 - 0.1, x1 = cw / 2 + 0.1, y0 = F.lift - ch / 2 - 0.1, y1 = F.lift + ch / 2 + 0.1;
    for (const o of L) { x0 = Math.min(x0, o.x - Math.max(o.r, o.plate.w / 2)); x1 = Math.max(x1, o.x + Math.max(o.r, o.plate.w / 2)); y0 = Math.min(y0, o.plate.y - o.plate.h / 2); y1 = Math.max(y1, o.y + o.r); }
    const w = Math.max(Math.abs(x0), Math.abs(x1)) * 2 + 0.2, h = y1 - y0 + 0.15;
    const f = frameBoard({ w, h, bottom: y0 - 0.05 }, aspect);
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw), toW = (p) => new THREE.Vector3(this.at.x + p[0] * c + p[2] * s, this.at.y + p[1], this.at.z - p[0] * s + p[2] * c);
    return { pos: toW(f.pos), look: toW(f.look), fov: f.fov, fits: f.fits, frame: f };
  }

  update(dt) {
    if (this.phase === 'off') return;
    this.t += dt;
    const [, ch] = F.card;
    if (this.phase === 'rise') {
      const k = this.reduced ? 1 : Math.min(1, this.t / F.rise);
      this.card.position.set(0, F.lift - (1 - easeOutBack(k)) * (F.lift + ch / 2), 0);
      this.card.rotation.set((1 - k) * 0.5, 0, 0);
      if (k >= 1) { this.phase = 'front'; this.t = 0; }
    } else if (this.phase === 'front') {
      this.card.position.y = F.lift + (this.reduced ? 0 : Math.sin(this.t * 2) * 0.04);
    } else if (this.phase === 'turn') {
      const k = this.reduced ? 1 : Math.min(1, this.t / F.turn);
      this.card.rotation.y = Math.PI * easeInOut(k) + (this.reduced ? 0 : Math.sin(k * Math.PI) * 0.06);
      this.card.position.y = F.lift + Math.sin(k * Math.PI) * 0.18;
      if (k >= 1) {
        this.card.rotation.y = Math.PI; this.phase = 'back'; this.t = 0;
        this.on.speak?.(this.item.tts || this.item.en);
        this._showTargets();
      }
    } else if (this.phase === 'back' || this.phase === 'rated') {
      this.card.position.y = F.lift + (this.reduced ? 0 : Math.sin(this.t * 2) * 0.03);
    } else if (this.phase === 'sink') {
      const k = this.reduced ? 1 : Math.min(1, this.t / 0.5);
      this.card.position.y = F.lift - easeInOut(k) * (F.lift + ch / 2 + 0.1);
      if (k >= 1) this.card.visible = false;
    }
    this.T.update(dt);
    if (this.verdict) {
      this.verdict.left -= dt;
      if (this.verdict.left <= 0) {
        const v = this.verdict; this.verdict = null;
        this.T.out?.();
        this.phase = 'done';
        if (!v.ok) this.on.typeIt?.(this.item);   // 不熟: the typing weapon takes this word (the flow re-queues it typed)
        v.done();
      }
    }
  }
  clear() { this.phase = 'off'; this.group.visible = false; this.T.hide(); this.verdict = null; }
  warm(renderer, camera, target = this.scene) {
    const v = this.group.visible; this.group.visible = true;
    try {
      const c = (o) => (renderer.compileAsync ? renderer.compileAsync(o, camera, target || null) : Promise.resolve(renderer.compile(o, camera)));
      return Promise.all([c(this.card), this.T.warm ? this.T.warm(renderer, camera, target) : Promise.resolve()]);
    } finally { this.group.visible = v; }
  }
  dispose() {
    this.scene?.remove(this.group);
    for (const e of this.pool.values()) e.tex.dispose();
    this.pool.clear();
    this.body.geometry.dispose(); this.faceGeo.dispose(); this.bodyMat.dispose(); this.faceMat.dispose(); this.blank.dispose();
    this.T.dispose?.();
  }
}

function mergeTwo(a, b) {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv']) {
    const A = a.attributes[name], B = b.attributes[name], arr = new Float32Array(A.array.length + B.array.length);
    arr.set(A.array, 0); arr.set(B.array, A.array.length);
    g.setAttribute(name, new THREE.BufferAttribute(arr, A.itemSize));
  }
  const ia = a.index.array, ib = b.index.array, idx = new Uint16Array(ia.length + ib.length), off = a.attributes.position.count;
  idx.set(ia, 0); for (let i = 0; i < ib.length; i++) idx[ia.length + i] = ib[i] + off;
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
