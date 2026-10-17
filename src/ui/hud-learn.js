// 关卡学习 — the level's own layer (docs/LEARN.md §5, hooks). The HUD owns one: `hud.learn = new LearnHud(hud)`; the
// level (src/learn/flow.js and the forms) drives it: start(flow) · walk(info) · playMode(on) · hide() ·
// results(data, actions) · end() — and the voice every play kind speaks with: _speak(text, done, o) (the course's
// recording, else the device's own English voice through speechSynthesis).
//
// 题即玩法 (docs/PLAY.md; play-8, LEARN §27): there is no question card any more — a question is a thing on the stage and
// the strip (src/ui/play-strip.js) says it. What stays here: the walk bar (where the next gate is, 「自动走」), the
// results card at the end of a level (做对 / 共几题, 到期的词, 再来一关 / 回到菜单) and the voice. Chinese first;
// buttons ≥ 44 pt; INKWAVE's sticker look (ink outline, dropped shadow; the results card is the menus' modal card with
// the results screen's splat); honours prefers-reduced-motion.
// Its own layer in #ui-root (z 18): over the HUD and the touch controls, under the pause menu.
import { h, prefersReducedMotion, restartAnim, colorVars, splatSVG } from './ui-util.js';
import { GLYPHS } from './ui-icons.js';
import { LEARN } from '../config.js';
import { G } from '../core/ctx.js';
import { say as sayAudio, stop as stopAudio } from '../learn/audio.js';   // the course's recordings (LEARN §16), else the device voice below

export class LearnHud {
  constructor(hud) {
    this.hud = hud;
    this.on = false;
    this.flow = null;
    this._L = {};        // last-written values (per-frame dirty checks)
    this._voice = null;
    this._build();
  }

  // ================================================================ build
  _build() {
    // ---- walk bar: where the next gate is
    this.arrow = h('i', { class: 'iw-learn__arrow', html: GLYPHS.next });
    this.walkTxt = h('span', { class: 'iw-learn__walktxt' }, '下一道门');
    this.walkDist = h('b', { class: 'iw-learn__dist' }, '');
    this.walkGate = h('span', { class: 'iw-learn__gate' }, '');
    this.autoBtn = h('button', { class: 'iw-learn__btn iw-learn__auto', type: 'button' }, h('i', { html: GLYPHS.play }), h('span', null, '自动走'));
    this.autoBtn.addEventListener('click', () => { if (this.flow) { this.flow.autoWalk(!this.flow.auto); this._snd('ui_click'); } });
    this.walk_ = h('div', { class: 'iw-learn__walk' }, this.arrow, h('span', { class: 'iw-learn__walkmain' }, this.walkTxt, this.walkDist), this.walkGate, this.autoBtn);

    // ---- results card
    this.rTitle = h('div', { class: 'iw-learn__rtitle iw-display' }, '这一关走完了');
    this.rScore = h('div', { class: 'iw-learn__rscore' });
    this.rDue = h('div', { class: 'iw-learn__rdue' });
    this.rAgain = h('button', { class: 'iw-learn__btn iw-learn__big', type: 'button' }, h('i', { html: GLYPHS.reset }), h('span', null, '再来一关'));
    this.rMenu = h('button', { class: 'iw-learn__btn iw-learn__big is-dim', type: 'button' }, h('i', { html: GLYPHS.back }), h('span', null, '回到菜单'));
    this.results_ = h('div', { class: 'iw-learn__results', role: 'dialog' }, this.rTitle, this.rScore, this.rDue, h('div', { class: 'iw-learn__rbtns' }, this.rAgain, this.rMenu));
    // (the frame: the card's sticker rim and the ink splat behind the title, outside the scrolling card so it can peek
    // over its top edge — the forms add their lines to results_ itself)
    this.rFrame = h('div', { class: 'iw-learn__rframe' }, h('div', { class: 'iw-learn__rsplat', html: splatSVG({ seed: 9, fill: 'var(--self)', r: 60, arms: 10, drops: 4 }) }), this.results_);

    this.el = h('div', { class: 'iw-learn is-off', 'aria-hidden': 'true' }, this.walk_, this.rFrame);
    this.hud.root.appendChild(this.el);
  }

  // ================================================================ lifecycle
  start(flow) {
    this.flow = flow;
    this.on = true;
    this._L = {};
    this.el.classList.remove('is-off', 'is-done');
    this.el.setAttribute('aria-hidden', 'false');
    this.el.classList.add('is-walk');
    colorVars(this.el, 'self', (G.teamHex || [])[0] || '#ff8a14');   // her ink colour on the buttons and the ring
    // the HUD's clock reads the day instead of a time (practice mode leaves the text alone: time is null)
    if (this.hud.timerTxt) this.hud.timerTxt.textContent = `第 ${flow.week} 周 · 第 ${flow.day} 天`;
    this.hud.el?.classList.add('is-learn');
    G.touch?.el?.classList.add('is-learn');
    this._warmVoice();
  }
  end() {
    this.on = false; this.flow = null;
    this.el.classList.add('is-off'); this.el.classList.remove('is-walk', 'is-done', 'is-play'); this.playOn = false;
    this.el.setAttribute('aria-hidden', 'true');
    this.hud.el?.classList.remove('is-learn');
    G.touch?.el?.classList.remove('is-learn');
    stopAudio();   // the recording or the device's voice
  }

  // 题即玩法 (docs/PLAY.md §2; src/learn/play/run.js): while a question is up the strip (src/ui/play-strip.js) takes the
  // walk bar's place; off again when the gate opens
  playMode(on) {
    this.playOn = !!on;
    this.el.classList.toggle('is-play', this.playOn);
    if (this.playOn) this.el.classList.remove('is-walk');
    else if (this.on && !this.el.classList.contains('is-done')) this.el.classList.add('is-walk');
  }

  // ================================================================ walking
  walk(info, flags) {
    if (flags && 'auto' in flags) this.autoBtn.classList.toggle('is-on', !!flags.auto);
    if (!info) return;
    const L = this._L;
    // the clock reads the day (main.js's setPractice writes PRACTICE on it after we start, so it is set here, once)
    if (!L.clock && this.hud.timerTxt && this.flow) { L.clock = true; this.hud.timerTxt.textContent = `第 ${this.flow.week} 周 · 第 ${this.flow.day} 天`; }
    const dist = Math.round(info.dist);
    if (dist !== L.dist) { L.dist = dist; this.walkDist.textContent = `${dist} m`; }
    const deg = Math.round((info.angle * 180) / Math.PI / 5) * 5;
    if (deg !== L.deg) { L.deg = deg; this.arrow.style.setProperty('--deg', `${-deg}deg`); }
    const gate = `门 ${info.index} / ${info.total}`;
    if (gate !== L.gate) { L.gate = gate; this.walkGate.textContent = gate; }
    if (info.auto !== L.auto) { L.auto = info.auto; this.autoBtn.classList.toggle('is-on', !!info.auto); }
    const near = info.dist < 6;
    if (near !== L.near) { L.near = near; this.walk_.classList.toggle('is-near', near); this.walkTxt.textContent = near ? '到门前了' : '下一道门'; }
  }

  // between questions / after a gate: the voice stops, the walk bar comes back (a station puts the strip up after it:
  // playMode(true))
  hide() {
    stopAudio();   // the recording or the device's voice
    if (this.on) this.el.classList.add('is-walk');
  }

  // ================================================================ sound: the recording, or the device's English voice
  _warmVoice() {
    try { if (typeof speechSynthesis !== 'undefined') { speechSynthesis.getVoices(); speechSynthesis.onvoiceschanged = () => { this._voice = null; }; } } catch { /* none */ }
  }
  _pickVoice() {
    if (this._voice) return this._voice;
    try {
      const vs = speechSynthesis.getVoices() || [];
      // a US voice first (the course targets American English), then any English, then whatever the device has
      this._voice = vs.find((v) => /^en[-_]US/i.test(v.lang) && /natural|premium|enhanced|samantha|ava|allison/i.test(v.name)) || vs.find((v) => /^en[-_]US/i.test(v.lang)) || vs.find((v) => /^en/i.test(v.lang)) || null;
    } catch { this._voice = null; }
    return this._voice;
  }
  // the course's recording of the text (src/learn/audio.js: IELTS-Base's app/audio/ in her App), else the device's voice
  _speak(text, done, o) {
    if (!text) { done?.(); return; }
    sayAudio(text, { slow: !!(o && o.slow), onEnd: done, device: (t, end) => this._device(t, end) });
  }
  _device(text, done) {
    if (!text || typeof speechSynthesis === 'undefined' || typeof SpeechSynthesisUtterance === 'undefined') { done?.(); return; }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'en-US'; u.rate = LEARN.ui.ttsRate; u.pitch = 1;
      const v = this._pickVoice(); if (v) u.voice = v;
      u.onend = u.onerror = () => done?.();
      speechSynthesis.speak(u);
    } catch { done?.(); }
  }

  // ================================================================ results
  results(data, actions) {
    this.hide();
    this.el.classList.remove('is-walk', 'is-play'); this.el.classList.add('is-done');
    this.rScore.innerHTML = '';
    this.rScore.append(h('b', null, String(data.done)), h('span', null, ` / ${data.total} 题 做对`), h('small', null, data.locks ? ` · 门上一共 ${data.locks} 道锁` : ' · 一道锁都没有'));
    this.rDue.innerHTML = '';
    if (data.due && data.due.length) {
      this.rDue.append(h('div', { class: 'iw-learn__rlabel' }, '到期的词（明天再来）'));
      this.rDue.append(h('ul', null, data.due.map((w) => h('li', null, h('b', null, w.en), h('span', null, w.zh)))));
    } else this.rDue.append(h('div', { class: 'iw-learn__rlabel' }, '没有到期的词'));
    this.rAgain.onclick = () => { this._snd('ui_confirm'); actions.again?.(); };
    this.rMenu.onclick = () => { this._snd('ui_back'); actions.menu?.(); };
    if (!prefersReducedMotion()) restartAnim(this.rFrame, 'is-enter');
    setTimeout(() => this.rAgain.focus?.(), 50);
  }

  _snd(name) { this.hud.playSound?.(name); }
}
