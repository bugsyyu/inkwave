// 字弹 M4 — one typed question as a game action: type on the rig → 射 → the sheet flies → the ink word forms at the
// target → the verdict plays on it. typeStep is the pure state machine (Node tests); TypeShot ties it to the rig
// (rig.js) and the ink word (inkword.js). The keyboard (src/ui/play-keys.js) and the judging (engine.judge, store) stay
// with the gate flow: the answer enters ONLY through resolve(), after 射 — before that nothing here has it (PLAY §1.3).
//
//   const shot = new TypeShot({ scene, team, color, quality, reduced })
//   shot.mount(actor)                       the kid hops into the rig
//   shot.begin({ mode, target })            a fresh sheet; mode 'word' | 'sentence'; target Vector3 | Object3D
//   shot.key(k) · shot.back() · shot.hint() from the keyboard (hint only marks `hinted`: the flow records H)
//   shot.submit() → text | null             射: the text typed (null when empty) — the flow judges it right away
//   shot.resolve(verdict) → Promise         { ok, pct?, right, toks?, typedOk? } — plays once the word has formed
//   shot.landed / shot.formed → Promise     the shell landed / the letters formed (for the camera's 'word' frame)
//   shot.clear() · shot.update(dt) · shot.unmount() · shot.dispose() · shot.warm(renderer, camera, scene)
//   isReduced(settings) — reduced motion as the game reads it (the default for opts.reduced)
//   shot.phase · shot.text · shot.hinted
import * as THREE from 'three';
import { G } from '../../../core/ctx.js';
import { TypeRig } from './rig.js';
import { InkWord } from './inkword.js';

export const PHASES = ['idle', 'typing', 'firing', 'assembling', 'shown', 'resolving', 'done'];

/** a fresh state */
export function typeState() { return { phase: 'idle', mode: 'word', text: '', hinted: false, verdict: null, presses: 0 }; }

/** The pure transition: (state, event) → next state (a new object; the old one is untouched). Events:
 *  begin {mode} · key {k} · back · hint · submit · landed · assembled · resolve {verdict} · resolved · clear.
 *  Out-of-phase events are ignored (the state comes back equal). */
export function typeStep(s, ev) {
  const n = { ...s };
  switch (ev && ev.t) {
    case 'begin': return { ...typeState(), phase: 'typing', mode: ev.mode === 'sentence' ? 'sentence' : 'word' };
    case 'key':
      if (s.phase !== 'typing' || typeof ev.k !== 'string' || ev.k.length !== 1) return n;
      n.text = s.text + ev.k; n.presses = s.presses + 1; return n;
    case 'back':
      if (s.phase !== 'typing') return n;
      n.text = s.text.slice(0, -1); n.presses = s.presses + 1; return n;
    case 'hint':
      if (s.phase !== 'typing') return n;
      n.hinted = true; return n;
    case 'submit':
      if (s.phase !== 'typing' || !s.text.trim()) return n;
      n.phase = 'firing'; return n;
    case 'landed':
      if (s.phase !== 'firing') return n;
      n.phase = 'assembling'; return n;
    case 'assembled':
      if (s.phase !== 'assembling') return n;
      n.phase = s.verdict ? 'resolving' : 'shown'; return n;
    case 'resolve':
      if (s.phase === 'firing' || s.phase === 'assembling') { n.verdict = ev.verdict || {}; return n; }   // queued
      if (s.phase === 'shown') { n.verdict = ev.verdict || {}; n.phase = 'resolving'; return n; }
      return n;
    case 'resolved':
      if (s.phase !== 'resolving') return n;
      n.phase = 'done'; return n;
    case 'clear': return typeState();
    default: return n;
  }
}

const _v = new THREE.Vector3();

/** reduced motion as the game reads it (LEVELS §5): the system setting, or camera shake off in the settings */
export function isReduced(settings = G.settings) {
  const sys = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return !!(sys || (settings && settings.cameraShake === 0));
}

export class TypeShot {
  constructor(o = {}) {
    if (o.reduced == null) o = { ...o, reduced: isReduced() };
    this.opts = o;
    this.rig = new TypeRig(o);
    this.word = new InkWord(o);
    this.s = typeState();
    this.target = null;
    this.landed = null; this.formed = null;
    this.lift = o.wordLift ?? 0.95;      // m the word stands above the point the shell hits
  }
  get phase() { return this.s.phase; }
  get text() { return this.s.text; }
  get hinted() { return this.s.hinted; }
  _go(ev) { this.s = typeStep(this.s, ev); return this.s; }

  mount(actor) { this.rig.mount(actor); return this; }
  unmount() { this.rig.unmount(); this.word.clear(true); this.s = typeState(); }

  begin({ mode = 'word', target = null } = {}) {
    this.word.clear(this.s.phase === 'idle');
    this.rig.reset();
    this.target = target;
    this._go({ t: 'begin', mode });
    return this;
  }
  key(k) {
    if (this.s.phase !== 'typing') return false;
    if (k === 'back') return this.back();
    if (k === 'fire') return this.submit();
    const before = this.s.text;
    this._go({ t: 'key', k });
    if (this.s.text === before) return false;
    this.rig.press(k);
    return true;
  }
  back() {
    if (this.s.phase !== 'typing') return false;
    this._go({ t: 'back' });
    this.rig.backspace();
    return true;
  }
  hint() { this._go({ t: 'hint' }); return this.s.hinted; }

  /** 射 → the text typed (the flow judges it now), or null when there is nothing to send */
  submit() {
    if (this.s.phase !== 'typing' || !this.s.text.trim()) return null;
    const text = this.s.text;
    this._go({ t: 'submit' });
    const tgt = this.target;
    const aim = new THREE.Vector3();
    if (tgt && tgt.isObject3D) tgt.getWorldPosition(aim); else if (tgt) aim.copy(tgt);
    // the chain runs inside update() (synchronous callbacks) so a frozen clock replays it exactly; promises for callers
    let formedRes; this.formed = new Promise((r) => { formedRes = r; });
    this.landed = this.rig.fire(text, aim, (at) => {
      this._go({ t: 'landed' });
      const face = this.rig.root.position.clone(); face.y = at.y + this.lift;
      const ground = (this.opts.groundY != null) ? this.opts.groundY : this.rig.root.position.y;
      this.word.assemble(text, _v.copy(at).setY(at.y + this.lift), { from: at, face, groundY: ground, onFormed: () => { this._go({ t: 'assembled' }); formedRes(); } });
    });
    return text;
  }

  /** the verdict (engine.judge's, through the flow): { ok, pct?, right, toks?, typedOk? } → Promise when the show is done */
  resolve(verdict = {}) {
    this._go({ t: 'resolve', verdict });
    return this.word.resolve(verdict, () => { this._go({ t: 'resolved' }); if (verdict.ok || verdict.pct >= 100) this._cheer(); });
  }
  _cheer() {
    const ch = this.rig.actor && this.rig.actor.character;
    if (ch && ch.trigger && !this.opts.reduced) ch.trigger('jump');
  }
  clear() { this.word.clear(); this._go({ t: 'clear' }); }

  update(dt) { this.rig.update(dt); this.word.update(dt); }
  warm(renderer, camera, target) { return Promise.all([this.rig.warm(renderer, camera, target), this.word.warm(renderer, camera, target)]); }
  dispose() { this.rig.dispose(); this.word.dispose(); }
}

