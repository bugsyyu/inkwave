// 关卡学习 — the level's own layer (docs/LEARN.md §5, hooks). The HUD owns one: `hud.learn = new LearnHud(hud)`; the
// level (src/learn/flow.js and the forms) drives it: start(flow) · walk(info) · playMode(on) · framed(info) · hide() ·
// results(data, actions) · end() — and the voice every play kind speaks with: _speak(text, done, o) (the course's
// recording, else the device's own English voice through speechSynthesis).
//
// 往前走 (LEARN §48): while no question is up the screen always shows her way on. Walking, it is the walk bar's
// 「自动走」; when a board (the booth, a sign) is framed the walk bar stays and turns into the board's keys — 「看全文」 when
// the board holds more than it shows (the reading strip: what the board's own hotspot opens, as a DOM key a thumb can
// always hit) and 「继续 ›」 (the station's way on: the auto-walk to the next board / the gate / the next stop, the booth's
// 说完了). Once the board counts as read 继续 lights in her ink with one small hop. On a phone held upright the keys keep
// the walk bar's place (the board is framed under them); turned, they stand in a column at the left, in the margin the
// framing keeps clear (board/frame.js keysBand). framed(info | null): info { more, read, onMore, onGo, top?, sound?, onSound? };
// playMode(true) (a question's strip and objects) hides the walk bar but never the board's keys.
// 桌面 (LEARN §55): on a desktop the mouse is the camera's (pointer lock) and the board's keys are DOM — reaching them meant
// Esc, and Esc is the pause menu. So with no touch layer the keyboard has them: Enter = 继续 ›, R = 看全文, L = the board's sound
// (听全文 / 再听 / 跟读 — a DOM key of its own there, hidden under a finger, which has the board's hotspot); each key wears
// its key's name (data-kbd, drawn by the CSS only on a desktop: is-kbd). Not E (the sub weapon), Space, Shift, F / Q, C,
// Tab / M, the digits, Esc / P. The typing keyboard and the duel's 备战 take their keys first (capture phase): this listens
// on window's bubble phase. A mouse the page may not lock (the 学习版's sandbox, LEARN §51) clicks the same keys.
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
    this._onKey = (e) => this._key(e);   // (LEARN §55: the board's keys on a keyboard — start() / end() add and remove it)
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
    // ---- the board's keys (LEARN §48): 看全文 · 继续 ›, in the walk bar while a board is framed
    this.moreBtn = h('button', { class: 'iw-learn__btn iw-learn__more is-dim', type: 'button', hidden: true, data: { kbd: 'R' }, 'aria-keyshortcuts': 'R' }, h('i', { html: GLYPHS.eye }), h('span', null, '看全文'));
    this.moreBtn.addEventListener('click', () => { const f = this._fr; if (f && f.onMore) { this._snd('ui_click'); f.onMore(); } });
    this.goBtn = h('button', { class: 'iw-learn__btn iw-learn__go', type: 'button', data: { kbd: 'Enter' }, 'aria-keyshortcuts': 'Enter' }, h('span', null, '继续'), h('i', { html: GLYPHS.next }));
    this.goBtn.addEventListener('click', () => { const f = this._fr; this._snd('ui_confirm'); if (f && f.onGo) f.onGo(); else if (this.flow) this.flow.autoWalk(true); });
    // (LEARN §55: a desktop's key for the board's sound — 听全文 / 再听 / 跟读, the board's own label; framed() shows it only there)
    this.soundTxt = h('span', null, '听全文');
    this.soundBtn = h('button', { class: 'iw-learn__btn iw-learn__sound is-dim', type: 'button', hidden: true, data: { kbd: 'L' }, 'aria-keyshortcuts': 'L' }, h('i', { html: GLYPHS.play }), this.soundTxt);
    this.soundBtn.addEventListener('click', () => { const f = this._fr; if (f && f.onSound) { this._snd('ui_click'); f.onSound(); } });
    this.walk_ = h('div', { class: 'iw-learn__walk' }, this.arrow, h('span', { class: 'iw-learn__walkmain' }, this.walkTxt, this.walkDist), this.walkGate, this.autoBtn, this.moreBtn, this.soundBtn, this.goBtn);

    // ---- results card
    this.rTitle = h('div', { class: 'iw-learn__rtitle iw-display' }, '这一关走完了');
    this.rScore = h('div', { class: 'iw-learn__rscore' });
    this.rDue = h('div', { class: 'iw-learn__rdue' });
    this.rAgain = h('button', { class: 'iw-learn__btn iw-learn__big', type: 'button' }, h('i', { html: GLYPHS.reset }), h('span', null, '再来一关'));
    this.rMenu = h('button', { class: 'iw-learn__btn iw-learn__big is-dim', type: 'button' }, h('i', { html: GLYPHS.back }), h('span', null, '回到菜单'));
    this.results_ = h('div', { class: 'iw-learn__results' }, this.rScore, this.rDue, h('div', { class: 'iw-learn__rbtns' }, this.rAgain, this.rMenu));
    // (the frame: the card's sticker rim, and a head that does not scroll — the title and the ink splat behind it,
    // peeking over the card's top edge; the rest scrolls in results_, where the forms add their lines)
    this.rHead = h('div', { class: 'iw-learn__rhead' }, h('div', { class: 'iw-learn__rsplat', html: splatSVG({ seed: 9, fill: 'var(--self)', r: 60, arms: 10, drops: 3 }) }), this.rTitle);
    this.rFrame = h('div', { class: 'iw-learn__rframe', role: 'dialog' }, this.rHead, this.results_);

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
    // (LEARN §48: a form with no route to walk — the duel, the boss, versus2: flow.walkBar false — has no walk bar: its
    // 「自动走」 lit up and walked nowhere)
    this._walks = flow.walkBar !== false;
    this.el.classList.toggle('is-walk', this._walks);
    colorVars(this.el, 'self', (G.teamHex || [])[0] || '#ff8a14');   // her ink colour on the buttons and the ring
    // the HUD's clock reads the day instead of a time (practice mode leaves the text alone: time is null)
    if (this.hud.timerTxt) this.hud.timerTxt.textContent = `第 ${flow.week} 周 · 第 ${flow.day} 天`;
    this.hud.el?.classList.add('is-learn');
    G.touch?.el?.classList.add('is-learn');
    // LEARN §48: no 地图 key and no corner map in a level (INKWAVE's map plans a Super Jump to a teammate — nothing to plan
    // here, and it could not open while a board held the lens: the key she pressed and nothing came); the levels with a
    // team on a Zone Control stage keep it (flow.mapKey: versus2)
    const nomap = !flow.mapKey;
    this.hud.el?.classList.toggle('is-nomap', nomap); G.touch?.el?.classList.toggle('is-nomap', nomap);
    G.touch?.relayout?.();
    this.el.classList.toggle('is-kbd', !this._touch());
    if (typeof window !== 'undefined' && window.addEventListener) { window.removeEventListener?.('keydown', this._onKey); window.addEventListener('keydown', this._onKey); }
    this._warmVoice();
  }
  end() {
    this.on = false; this.flow = null;
    if (typeof window !== 'undefined' && window.removeEventListener) window.removeEventListener('keydown', this._onKey);
    if (this._cu) { cancelAnimationFrame(this._cu); this._cu = 0; }
    this.el.classList.add('is-off'); this.el.classList.remove('is-walk', 'is-done', 'is-play', 'is-framed'); this.playOn = false; this._fr = null;
    this.el.setAttribute('aria-hidden', 'true');
    this.hud.el?.classList.remove('is-learn', 'is-nomap');
    G.touch?.el?.classList.remove('is-learn', 'is-nomap');
    G.touch?.relayout?.();
    stopAudio();   // the recording or the device's voice
  }

  // 题即玩法 (docs/PLAY.md §2; src/learn/play/run.js): while a question is up the strip (src/ui/play-strip.js) takes the
  // walk bar's place; off again when the gate opens
  playMode(on) {
    this.playOn = !!on;
    this.el.classList.toggle('is-play', this.playOn);
    if (this.playOn) this.el.classList.remove('is-walk');
    else if (this.on && this._walks && !this.el.classList.contains('is-done')) this.el.classList.add('is-walk');
  }

  // 往前走 (LEARN §48): a board / the booth / a sign framed while no question is up — the walk bar turns into its keys
  // (看全文 when info.more, 继续 › → info.onGo, else the auto-walk); null: it let go, the walk bar is back. Called again
  // for the same board when it counts as read (info.read): 继续 lights, with one hop when it was not read before
  framed(info) {
    const was = this._fr, same = !!(was && info && was.key === info.key);
    this._fr = info || null;
    this.el.classList.toggle('is-framed', !!info);
    // (info.top: the HUD's top row reaches lower here — the boss's bar and its phase tag: upright the keys stand under it)
    if (info && info.top > 0) this.el.style.setProperty('--iw-keys-top', `${Math.round(info.top)}px`); else this.el.style.removeProperty?.('--iw-keys-top');
    if (!info) { this.goBtn.classList.remove('is-ready', 'is-hop'); this.moreBtn.hidden = true; this.soundBtn.hidden = true; return; }
    this.moreBtn.hidden = !info.more;
    // (LEARN §55: the board's sound as a key only with no touch layer — a finger has the board's own hotspot)
    const kbd = !this._touch();
    this.el.classList.toggle('is-kbd', kbd);
    this.soundBtn.hidden = !(kbd && info.sound && info.onSound);
    if (info.sound && info.sound.label && this.soundTxt.textContent !== info.sound.label) this.soundTxt.textContent = info.sound.label;
    const ready = !!info.read;
    this.goBtn.classList.toggle('is-ready', ready);
    // (one hop as it turns ready while she stands there; a board read before is ready from the start, and still)
    if (same && ready && !was.read && !prefersReducedMotion()) restartAnim(this.goBtn, 'is-hop');
    else if (!same) this.goBtn.classList.remove('is-hop');
  }

  // LEARN §55: the touch layer is in charge (a phone, a tablet; settings.touchControls) — no keyboard keys, no key names
  _touch() { return !!(G.input && G.input.touch && G.input.touch.active); }
  // the board's keys on a keyboard (window, bubble phase): Enter = 继续 ›, R = 看全文, L = its sound — while a board is framed,
  // with no touch layer, no menu, no pause (the pause menu's Enter must not go on here too), no repeat, no modifier, not in a
  // text field. A handled key's default is stopped: a DOM key she clicked keeps the focus, and Enter would press it again
  _key(e) {
    const f = this._fr;
    if (!this.on || !f || this._touch() || G.menus?.current || G.match?.paused || e.repeat || e.ctrlKey || e.altKey || e.metaKey || e.defaultPrevented) return false;
    const a = typeof document !== 'undefined' ? document.activeElement : null;
    if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.isContentEditable)) return false;
    const c = e.code;
    let act = null;
    if (c === 'Enter' || c === 'NumpadEnter') act = () => { this._snd('ui_confirm'); if (f.onGo) f.onGo(); else if (this.flow) this.flow.autoWalk(true); };
    else if (c === 'KeyR' && f.more && f.onMore) act = () => { this._snd('ui_click'); f.onMore(); };
    else if (c === 'KeyL' && f.sound && f.onSound) act = () => { this._snd('ui_click'); f.onSound(); };
    if (!act) return false;
    e.preventDefault?.();
    act();
    return true;
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
    if (this.on && this._walks) this.el.classList.add('is-walk');
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
    this.framed(null);
    this._resetCard(data);
    this.el.classList.remove('is-walk', 'is-play'); this.el.classList.add('is-done');
    this.rScore.innerHTML = '';
    const num = h('b', null, String(data.done));
    this.rScore.append(num, h('span', null, ` / ${data.total} 题 做对`), h('small', null, data.locks ? ` · 门上一共 ${data.locks} 道锁` : ' · 一道锁都没有'));
    this.rDue.innerHTML = '';
    if (data.due && data.due.length) {
      this.rDue.append(h('div', { class: 'iw-learn__rlabel' }, '到期的词（明天再来）'));
      this.rDue.append(h('ul', null, data.due.map((w) => h('li', null, h('b', null, w.en), h('span', null, w.zh)))));
    } else this.rDue.append(h('div', { class: 'iw-learn__rlabel' }, '没有到期的词'));
    this.rAgain.onclick = () => { this._snd('ui_confirm'); actions.again?.(); };
    this.rMenu.onclick = () => { this._snd('ui_back'); actions.menu?.(); };
    if (!prefersReducedMotion()) { restartAnim(this.rFrame, 'is-enter'); this._countUp(num, data.done); } else restartAnim(this.rFrame, 'is-fade');   // (reduced: the card only fades in)
    setTimeout(() => this.rAgain.focus?.(), 50);
  }
  // One card for every level (LEARN §48 review): what a form or a hook wrote on it for an earlier level goes before this one is
  // filled — the title (the quiz's, the boss's, coop2's), the two keys' words and disabled (coop2's guest), the extra lines and
  // stars (FormsUi.resultsExtra), the quiz record's badge, the pick's 回到工作台 (its hook adds it again) and a 今日小考 key from
  // an earlier result — not the one learn:done has just put there for this one (forms/index.js marks it with its data: the
  // puzzle emits learn:done before it fills the card). The forms write their own after this
  _resetCard(data) {
    this.rTitle.textContent = '这一关走完了';
    const ag = this.rAgain.querySelector('span'), mn = this.rMenu.querySelector('span');
    if (ag) ag.textContent = '再来一关';
    if (mn) mn.textContent = '回到菜单';
    this.rAgain.disabled = false; this.rMenu.disabled = false;
    this.results_.querySelectorAll('.iw-lf__extra, .iw-lf__stars, .iw-qrec, .iw-learn__home').forEach((e) => e.remove());
    this.results_.querySelectorAll('.iw-learn__quiz').forEach((b) => { if (b._forResult !== data) b.remove(); });
  }
  // the score counts up as its line rises in (INKWAVE's results count their numbers too). The element keeps the real
  // number (what the page says — a screen reader, an audit — never reads a 0) at its final width; the count is drawn
  // over it (::after, data-c), written only when the shown integer changes, for at most 0.7 s, while the level is over
  // (the match is parked) — then it lands with a pop
  _countUp(el, to) {
    if (this._cu) { cancelAnimationFrame(this._cu); this._cu = 0; }
    if (!(to > 0) || typeof requestAnimationFrame === 'undefined') return;
    const t0 = performance.now() + 220, dur = Math.min(700, 260 + to * 40);
    let shown = 0;
    el.dataset.c = '0'; el.classList.add('is-counting');
    const step = (now) => {
      const k = Math.max(0, Math.min(1, (now - t0) / dur)), v = Math.round(to * (1 - Math.pow(1 - k, 3)));
      if (v !== shown) { shown = v; el.dataset.c = String(v); }
      if (k < 1) this._cu = requestAnimationFrame(step);
      else { this._cu = 0; el.classList.remove('is-counting'); restartAnim(el, 'is-land'); }
    };
    this._cu = requestAnimationFrame(step);
  }

  _snd(name) { this.hud.playSound?.(name); }
}
