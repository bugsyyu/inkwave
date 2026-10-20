// src/ui/book-pages/kit.js — the parts the 课本's own pages share (游戏为主体 第三期第二步, docs/LEARN.md §43): a page's
// frame (kicker, title, lead, the scroller), a sticker chip / button, a field, the lesson page's two-step delete (armed),
// and the sheet a page writes in (记一条 / 补记一条: over the whole book, in the menus' focus, out of the soft keyboard's way).
//
// A page is a module with mount(host, ctx) → { destroy(), flush?(), onFocus?(el, nav) } (book.js NATIVE_PAGES). ctx, from
// menus.js _scr_book:
//   ls · now() · reduced                     her storage, the clock, prefers-reduced-motion
//   bind(el, { id, accept, type })           the menus' focus and press (menus _bind + _fx): pad / keys reach every button
//   sfx(name) · toast(text, opts) · burst(el, opts)
//   go(view)                                 turn the book to another page ('game': close it)
//   layer                                    the book's screen: a sheet goes here (the page itself clips and is transformed)
//   modal(el, onBack) · unmodal(el)          a sheet takes the menus' focus and Esc / B while it is up
//   focus(el) · nav(dir)
// Motion is CSS (transform / opacity), nothing runs per frame; reduced motion fades.
import { h, restartAnim, splatSVG } from '../ui-util.js';
import { GLYPHS } from '../ui-icons.js';

export const SEARCH_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" fill="none" stroke="currentColor" stroke-width="3"/><path d="M15.5 15.5 L21 21" stroke="currentColor" stroke-width="3.4" stroke-linecap="round"/></svg>';
export const MINUS_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12 H19" stroke="currentColor" stroke-width="3.6" stroke-linecap="round"/></svg>';

// the page's frame: a scroller with the kicker (Titan One, the English line), the title, the lead and the page's action
export function pageFrame({ cls, kicker, title, lead, action }) {
  const head = h('header', { class: 'iw-bp__head iw-bp__in', style: { '--i': 0 } },
    h('small', { class: 'iw-bp__kicker' }, kicker),
    h('h2', { class: 'iw-bp__title' }, title),
    lead ? h('p', { class: 'iw-bp__lead' }, lead) : null,
    action || null);
  const body = h('div', { class: 'iw-bp__body' });
  const scroll = h('div', { class: 'iw-bp__scroll' }, head, body);
  const el = h('div', { class: 'iw-bp ' + (cls || '') }, scroll);
  return { el, scroll, head, body };
}

// a sticker button (the press sinks on the frame the finger lands: ctx.bind adds is-down on pointerdown)
export function stickerBtn(ctx, { id, cls = '', label, icon = null, sub = null, accept, aria = null }) {
  const b = h('button', { class: 'iw-bp-btn ' + cls, 'aria-label': aria || null },
    icon ? h('i', { class: 'iw-bp-btn__ic', html: icon }) : null,
    h('span', { class: 'iw-bp-btn__t' }, label, sub ? h('small', null, sub) : null));
  ctx.bind(b, { id, accept: (src) => accept && accept(src) });
  return b;
}

// a field: the label row takes the focus (pad / keys: accept puts the caret in the input)
export function field(ctx, { id, label, input, hint = null, cls = '' }) {
  const lab = h('span', { class: 'iw-bp-field__lab' }, label);
  const row = h('label', { class: 'iw-bp-field ' + cls }, lab, input, hint ? h('small', { class: 'iw-bp-field__hint' }, hint) : null);
  ctx.bind(row, { id, type: 'row', accept: () => { try { input.focus({ preventScroll: true }); } catch (e) { input.focus(); } } });
  input.addEventListener('pointerdown', () => ctx.focus(row));
  return { row, lab, input };
}

// keys typed in a page or a sheet are its own (the game's input listens on window, after this): Enter in a one-line
// field and Esc go to the page; the rest only reach the field
export function ownKeys(root, { enter = null, esc = null } = {}) {
  root.addEventListener('keydown', (e) => {
    const t = e.target, typing = t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT');
    if (!typing) return;
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); if (esc) esc(t); else t.blur(); }
    else if ((e.key === 'Enter' || e.key === 'NumpadEnter') && (t.tagName !== 'TEXTAREA' || e.metaKey || e.ctrlKey) && !e.isComposing) { e.preventDefault(); if (enter) enter(t); else t.blur(); }
  });
  root.addEventListener('keyup', (e) => { const t = e.target; if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) e.stopPropagation(); });
}

// the lesson page's two-step delete (app/index.html armed): the first press arms (「再点一次确认删除」), the confirming
// press must come more than 450 ms later (a double tap never deletes), back to 删除 after 3 s
export const ARM_MS = 450, ARM_RESET = 3000;
export function armed(el, now = Date.now(), timer = setTimeout) {
  if (el.dataset.armed === '1') return now - Number(el.dataset.armedAt || 0) > ARM_MS;
  el.dataset.armed = '1';
  el.dataset.armedAt = String(now);
  el.classList.add('is-armed');
  const t = el.querySelector('.iw-bp-del__t');
  if (t) t.textContent = '再点一次确认删除';
  timer(() => { if (el.isConnected) { el.dataset.armed = ''; el.classList.remove('is-armed'); if (t) t.textContent = '删除'; } }, ARM_RESET);
  return false;
}
export function delBtn(ctx, { id, label, onDelete }) {
  const b = h('button', { class: 'iw-bp-del', 'aria-label': label }, h('span', { class: 'iw-bp-del__t' }, '删除'));
  ctx.bind(b, { id, accept: () => { if (armed(b)) onDelete(b); else ctx.sfx('ui_toggle'); } });
  return b;
}

// the empty page and her blob missing: a splat, a line, and the way on
export function emptyNote(text, more = null) {
  return h('div', { class: 'iw-bp-empty iw-bp__in', style: { '--i': 2 } },
    h('i', { class: 'iw-bp-empty__splat', html: splatSVG({ seed: 41, cls: 'iw-fa', r: 54, arms: 8, drops: 4 }) }),
    h('p', null, text), more);
}

// sheet(ctx, { tape, kicker, cls, body, onBack }) → { el, card, msg(text), nope(), close(then), closed }
// A card over the whole book (the menus' focus stays in it; Esc / B is onBack); its box follows the visual viewport, so
// on a phone the soft keyboard never covers the field being typed in (src/ui/checkin-card.js's way).
export function sheet(ctx, { tape, kicker = '', cls = '', body, foot, onBack }) {
  const reduced = ctx.reduced;
  const msgEl = h('p', { class: 'iw-bps__msg', role: 'status' });
  const card = h('section', { class: 'iw-bps__card', role: 'dialog', 'aria-modal': 'true', 'aria-label': tape },
    h('span', { class: 'iw-bps__splat', html: splatSVG({ seed: 19, cls: 'iw-fa', r: 58, arms: 9, drops: 4 }) }),
    h('div', { class: 'iw-bps__tape' }, h('span', null, tape), kicker ? h('small', null, kicker) : null),
    body, msgEl, h('div', { class: 'iw-bps__foot' }, foot));
  const vp = h('div', { class: 'iw-bps__vp' }, card);
  const scrim = h('div', { class: 'iw-bps__scrim' });
  const el = h('div', { class: 'iw-bps ' + cls + (reduced ? ' is-reduced' : '') }, scrim, vp);
  ctx.layer.appendChild(el);
  const vv = typeof visualViewport !== 'undefined' ? visualViewport : null;
  // (no keyboard: the CSS box, the whole screen; with it: the visible part above the keyboard)
  const fit = () => {
    const kb = !!vv && innerHeight - vv.height > 120;
    el.classList.toggle('is-kb', kb);
    vp.style.top = kb ? Math.max(0, vv.offsetTop) + 'px' : '';
    vp.style.height = kb ? vv.height + 'px' : '';
  };
  if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); }
  addEventListener('resize', fit);
  fit();
  // the field she types in stays in view as the keyboard comes up
  el.addEventListener('focusin', (e) => {
    const t = e.target;
    if (!t || (t.tagName !== 'INPUT' && t.tagName !== 'TEXTAREA')) return;
    el.classList.add('is-typing');
    setTimeout(() => { try { t.scrollIntoView({ block: 'nearest' }); } catch (x) { /* old engines */ } }, 300);
  });
  el.addEventListener('focusout', () => el.classList.remove('is-typing'));
  scrim.addEventListener('click', () => { if (!api.closed) onBack(); });
  ctx.modal(el, () => onBack());
  requestAnimationFrame(() => el.classList.add('is-in'));
  const api = {
    el, card, closed: false,
    msg(text) { msgEl.textContent = text || ''; },
    nope() { if (!reduced) { restartAnim(card, 'is-nope'); restartAnim(vp, 'is-nope'); } ctx.sfx('ui_error'); },   // (ui-glass: its frame shakes instead)
    close(then) {
      if (api.closed) return;
      api.closed = true;
      if (vv) { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); }
      removeEventListener('resize', fit);
      try { if (document.activeElement && el.contains(document.activeElement)) document.activeElement.blur(); } catch (e) { /* ignore */ }
      ctx.unmodal(el);
      el.classList.add('is-out');
      setTimeout(() => { el.remove(); if (then) then(); }, reduced ? 160 : 280);
    },
  };
  return api;
}

// a radio row of sticker chips (a note's type, a log's 科目): [{ id, label, c }] → { el, value(), set(id) }
export function chipRow(ctx, { name, items, value, cls = '', onPick = null }) {
  let cur = value;
  const chips = items.map((it, i) => {
    const b = h('button', { class: 'iw-bp-chip', role: 'radio', 'aria-checked': String(it.id === cur), style: { '--c': it.c, '--i': i } }, h('b', null, it.label));
    b.dataset.v = it.id;
    ctx.bind(b, { id: name + '-' + it.id, accept: () => { set(it.id, true); } });
    return b;
  });
  const el = h('div', { class: 'iw-bp-chips ' + cls, role: 'radiogroup', 'aria-label': name }, chips);
  function set(id, by) {
    cur = id;
    chips.forEach((b) => { const on = b.dataset.v === id; b.classList.toggle('is-on', on); b.setAttribute('aria-checked', String(on)); if (on && by && !ctx.reduced) restartAnim(b, 'is-pick'); });
    if (by) { ctx.sfx('ui_toggle'); if (onPick) onPick(id); }
  }
  set(cur, false);
  return { el, chips, value: () => cur, set };
}

// a focused element brought into the page's scroller (pad / keys): only when it is out of view, vertically
export function reveal(scroll, el, reduced) {
  const r = el.getBoundingClientRect(), s = scroll.getBoundingClientRect();
  if (r.top < s.top + 16 || r.bottom > s.bottom - 16) scroll.scrollBy({ top: r.top - s.top - s.height * 0.36, behavior: reduced ? 'auto' : 'smooth' });
}

export const CHECK = GLYPHS.check, PLUS = GLYPHS.plus, CLOSE = GLYPHS.close;
