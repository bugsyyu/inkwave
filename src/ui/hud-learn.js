// 关卡学习 — the question layer (docs/LEARN.md §5, hooks). The HUD owns one: `hud.learn = new LearnHud(hud)`; the
// level (src/learn/flow.js) drives it: start(flow) · walk(info) · ask(prompt, opts) · verdict(v, next) · hide() ·
// results(data, actions) · end().
//
// Chinese first: the question is Chinese, every English line carries its Chinese (an option's gloss shows with the
// verdict, so a zh→en choice is not given away). Three ways to answer — a real <input> (dictation; Enter submits),
// choice buttons, and ▶ to hear the item again (item.audio when the course has a recording, else the device's own
// English voice through speechSynthesis). Then the verdict with 「为什么」, and 「继续」 (or Enter) to go on.
// Phone (≤ LEARN.ui.phoneMax px wide): the card takes the bottom half of the screen, buttons ≥ 44 pt, 16 px+ text so
// iOS does not zoom the field. Dark glass over the stage; honours prefers-reduced-motion.
// Its own layer in #ui-root (z 18): over the HUD and the touch controls, under the pause menu.
import { h, prefersReducedMotion, restartAnim, colorVars } from './ui-util.js';
import { GLYPHS } from './ui-icons.js';
import { LEARN } from '../config.js';
import { G } from '../core/ctx.js';

const KIND_ZH = { typed: '听写', choice: '选择' };
const LOCK_SVG = '<svg viewBox="0 0 64 64" aria-hidden="true"><rect x="14" y="28" width="36" height="28" rx="6" fill="currentColor"/><path d="M22 28v-7a10 10 0 0 1 20 0v7" fill="none" stroke="currentColor" stroke-width="7" stroke-linecap="round"/></svg>';

export class LearnHud {
  constructor(hud) {
    this.hud = hud;
    this.on = false;
    this.flow = null;
    this._L = {};        // last-written values (per-frame dirty checks)
    this._ask = null;    // the live question { p, opts, answered }
    this._voice = null;
    this._build();
    this._onKey = (e) => this._key(e);
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

    // ---- question card
    this.prog = h('span', { class: 'iw-learn__prog' });
    this.locks = h('span', { class: 'iw-learn__locks' });
    this.kind = h('span', { class: 'iw-learn__kind' });
    this.qText = h('div', { class: 'iw-learn__q' });
    this.qZh = h('div', { class: 'iw-learn__zh' });
    this.playBtn = h('button', { class: 'iw-learn__btn iw-learn__play', type: 'button' }, h('i', { html: GLYPHS.speaker }), h('span', null, '听'));
    this.playBtn.addEventListener('click', () => this._play());
    this.form = h('div', { class: 'iw-learn__form' });
    this.vIcon = h('i', { class: 'iw-learn__vicon' });
    this.vText = h('b', { class: 'iw-learn__vtext' });
    this.vWhy = h('div', { class: 'iw-learn__why' });
    this.nextBtn = h('button', { class: 'iw-learn__btn iw-learn__next', type: 'button' }, h('span', null, '继续'), h('i', { html: GLYPHS.next }));
    this.nextBtn.addEventListener('click', () => this._continue());
    this.verdictEl = h('div', { class: 'iw-learn__verdict' }, h('div', { class: 'iw-learn__vline' }, this.vIcon, this.vText), this.vWhy, this.nextBtn);
    this.panel = h('div', { class: 'iw-learn__panel', role: 'dialog', 'aria-label': '题目' },
      h('div', { class: 'iw-learn__head' }, this.kind, this.prog, this.locks),
      this.qText, this.qZh, this.playBtn, this.form, this.verdictEl);

    // ---- results card
    this.rTitle = h('div', { class: 'iw-learn__rtitle iw-display' }, '这一关走完了');
    this.rScore = h('div', { class: 'iw-learn__rscore' });
    this.rDue = h('div', { class: 'iw-learn__rdue' });
    this.rAgain = h('button', { class: 'iw-learn__btn iw-learn__big', type: 'button' }, h('i', { html: GLYPHS.reset }), h('span', null, '再来一关'));
    this.rMenu = h('button', { class: 'iw-learn__btn iw-learn__big is-dim', type: 'button' }, h('i', { html: GLYPHS.back }), h('span', null, '回到菜单'));
    this.results_ = h('div', { class: 'iw-learn__results', role: 'dialog' }, this.rTitle, this.rScore, this.rDue, h('div', { class: 'iw-learn__rbtns' }, this.rAgain, this.rMenu));

    this.el = h('div', { class: 'iw-learn is-off', 'aria-hidden': 'true' }, this.walk_, this.panel, this.results_);
    this.hud.root.appendChild(this.el);
  }

  // ================================================================ lifecycle
  start(flow) {
    this.flow = flow;
    this.on = true;
    this._L = {};
    this.el.classList.remove('is-off', 'is-ask', 'is-done');
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
    this.on = false; this.flow = null; this._ask = null;
    this.el.classList.add('is-off'); this.el.classList.remove('is-walk', 'is-ask', 'is-done');
    this.el.setAttribute('aria-hidden', 'true');
    this.hud.el?.classList.remove('is-learn');
    G.touch?.el?.classList.remove('is-learn');
    window.removeEventListener('keydown', this._onKey, true);
    try { speechSynthesis?.cancel(); } catch { /* no synthesis */ }
    clearTimeout(this._vT);
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

  // ================================================================ a question
  ask(p, opts) {
    this._ask = { p, opts, answered: false };
    const { gate, item } = opts;
    this.kind.textContent = (item.retry ? '再问一次 · ' : '') + (KIND_ZH[p.type] || '题');
    this.prog.textContent = `第 ${item.n} / ${item.total} 题 · 门 ${gate.index} / ${gate.total}`;
    this._locks(gate.locks);
    this.qText.textContent = p.text || '';
    this.qZh.textContent = p.zh || '';
    this.qZh.style.display = p.zh ? '' : 'none';
    const canPlay = !!(p.tts || p.audio);
    this.playBtn.style.display = canPlay ? '' : 'none';
    this.form.innerHTML = '';
    this.input = null;
    if (p.type === 'choice') {
      this.form.className = 'iw-learn__form is-choice';
      this.choices = (p.options || []).map((o, i) => {
        const b = h('button', { class: 'iw-learn__opt', type: 'button', 'data-i': String(i) },
          h('b', { class: 'iw-learn__optn' }, String(i + 1)),
          h('span', { class: 'iw-learn__opten' }, o.text),
          h('small', { class: 'iw-learn__optzh' }, o.zh || ''));
        b.addEventListener('click', () => this._submit(i));
        return b;
      });
      this.form.append(...this.choices);
    } else {
      this.form.className = 'iw-learn__form is-typed';
      this.choices = null;
      this.input = h('input', { class: 'iw-learn__input', type: 'text', placeholder: p.placeholder || '输入英文', autocomplete: 'off', autocorrect: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done', 'aria-label': '答案' });
      // keys typed here are letters, not game keys: never let W/A/S/D reach the input layer on window
      this.input.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); this._submit(this.input.value); } });
      const ok = h('button', { class: 'iw-learn__btn iw-learn__submit', type: 'button' }, h('span', null, '提交'), h('i', { html: GLYPHS.check }));
      ok.addEventListener('click', () => this._submit(this.input.value));
      this.form.append(this.input, ok);
    }
    this.verdictEl.classList.remove('is-on', 'is-ok', 'is-bad');
    this.panel.classList.remove('is-answered');
    this.el.classList.add('is-ask'); this.el.classList.remove('is-walk');
    if (!prefersReducedMotion()) restartAnim(this.panel, 'is-enter');
    window.addEventListener('keydown', this._onKey, true);
    // hear it once as it comes up (the walk's keys / taps are the gesture the browser wants)
    if (canPlay) this._play();
    if (this.input && !G.input?.touch?.active) setTimeout(() => this.input?.focus(), 60);
  }

  _locks(n) {
    this.locks.innerHTML = '';
    for (let i = 0; i < n; i++) this.locks.appendChild(h('i', { class: 'iw-learn__lock', html: LOCK_SVG, title: '答错一次' }));
    this.locks.style.display = n ? '' : 'none';
  }

  _submit(ans) {
    const a = this._ask;
    if (!a || a.answered) return;
    if (a.p.type === 'typed' && !String(ans ?? '').trim()) { restartAnim(this.form, 'is-shake'); this._snd('ui_error'); return; }
    a.answered = true;
    if (this.choices) { this.choices.forEach((b, i) => { b.disabled = true; b.classList.toggle('is-picked', i === ans); }); }
    if (this.input) { this.input.disabled = true; this.input.blur(); }
    a.opts.onAnswer(ans);
  }

  verdict(v, next) {
    const a = this._ask; if (!a) return;
    a.next = next;
    this.vIcon.innerHTML = v.ok ? GLYPHS.check : GLYPHS.close;
    this.vText.textContent = v.ok ? '对了！' : v.again ? '不对，门上多了一道锁。待会儿换个问法再来' : '不对，记住正确的写法';
    this.vWhy.textContent = v.why ? `为什么：${v.why}` : '';
    this._locks(v.locks);
    this.verdictEl.classList.add('is-on', v.ok ? 'is-ok' : 'is-bad');
    this.panel.classList.add('is-answered');
    // the right option lights up and every option shows its Chinese now (the English line gets its gloss)
    if (this.choices) {
      const want = String(v.canonical ?? '');
      this.choices.forEach((b) => { const en = b.querySelector('.iw-learn__opten')?.textContent || ''; b.classList.toggle('is-right', en === want); });
    }
    if (!prefersReducedMotion()) restartAnim(this.verdictEl, 'is-pop');
    // a wrong answer waits for 「继续」 so the correction is actually read; a right one moves on by itself
    clearTimeout(this._vT);
    if (v.ok) this._vT = setTimeout(() => this._continue(), prefersReducedMotion() ? 500 : LEARN.ui.verdictMs);
  }

  _continue() {
    const a = this._ask;
    if (!a || !a.answered || !a.next) return;
    clearTimeout(this._vT);
    const next = a.next; a.next = null;
    this._ask = null;
    next();
  }

  hide() {
    this._ask = null;
    clearTimeout(this._vT);
    window.removeEventListener('keydown', this._onKey, true);
    try { speechSynthesis?.cancel(); } catch { /* no synthesis */ }
    this.el.classList.remove('is-ask');
    if (this.on) this.el.classList.add('is-walk');
  }

  // while a question is up: 1–9 pick an option, Enter continues after the verdict (typed input handles its own Enter)
  _key(e) {
    const a = this._ask; if (!a) return;
    if (e.target === this.input) return;
    if (a.answered) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); this._continue(); } return; }
    if (this.choices && /^[1-9]$/.test(e.key)) { const i = +e.key - 1; if (this.choices[i]) { e.preventDefault(); e.stopPropagation(); this._submit(i); } }
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
  _play() {
    const a = this._ask; if (!a) return;
    const p = a.p;
    this.playBtn.classList.add('is-playing');
    const done = () => this.playBtn.classList.remove('is-playing');
    if (p.audio) {
      try { const au = new Audio(p.audio); au.onended = done; au.onerror = () => { done(); this._speak(p.tts, done); }; au.play().catch(() => { done(); this._speak(p.tts, done); }); return; } catch { /* fall through */ }
    }
    this._speak(p.tts, done);
  }
  _speak(text, done) {
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
    this.el.classList.remove('is-walk', 'is-ask'); this.el.classList.add('is-done');
    this.rScore.innerHTML = '';
    this.rScore.append(h('b', null, String(data.done)), h('span', null, ` / ${data.total} 题 做对`), h('small', null, data.locks ? ` · 门上一共 ${data.locks} 道锁` : ' · 一道锁都没有'));
    this.rDue.innerHTML = '';
    if (data.due && data.due.length) {
      this.rDue.append(h('div', { class: 'iw-learn__rlabel' }, '到期的词（明天再来）'));
      this.rDue.append(h('ul', null, data.due.map((w) => h('li', null, h('b', null, w.en), h('span', null, w.zh)))));
    } else this.rDue.append(h('div', { class: 'iw-learn__rlabel' }, '没有到期的词'));
    this.rAgain.onclick = () => { this._snd('ui_confirm'); actions.again?.(); };
    this.rMenu.onclick = () => { this._snd('ui_back'); actions.menu?.(); };
    if (!prefersReducedMotion()) restartAnim(this.results_, 'is-enter');
    setTimeout(() => this.rAgain.focus?.(), 50);
  }

  _snd(name) { this.hud.playSound?.(name); }
}
