// src/ui/checkin-card.js — 打卡 (游戏为主体 第二期, docs/LEARN.md §39): the lesson page's check-in form as a card of the
// game's own. 「今天感觉怎么样？」 (the page's three MOODS as stickers) + 「今天最难的地方，或者想问老师的问题」 (one to three
// lines) + 保存打卡; a saved check-in shows what she wrote and can be changed. Saving writes her account exactly as the page
// does (workbench.js saveCheckin) and lands like a stamp. Ways in: the 打卡垫 at a level's end (play/wire/exit.js), the main
// menu's 今天的打卡 and the course map's (menus.js). Never while the 课本 is open: the page in the book holds the same data.
//
//   openCheckin({ week, day, from, onClose }) → card | null      null: no card (no workbench / no check-in that day / book)
//     onClose({ saved, entry }) after it has gone
//   bookOpen() · checkinFor(week, day) (= checkinView on this page's storage) · isOpen()
// The card is DOM over everything (its own .iw-ui host, z 40); keys typed in it never reach the game; it fits the visual
// viewport, so the soft keyboard on a phone never covers the note. Motion is transform / opacity; reduced motion: fades.
import { h, colorVars, prefersReducedMotion, restartAnim, splatSVG } from './ui-util.js';
import { GLYPHS } from './ui-icons.js';
import { inkBurst } from './menu-art.js';
import { G } from '../core/ctx.js';
import { ielts } from '../learn/ielts.js';
import { saveCheckin, NOTE_MAX } from '../learn/workbench.js';
import { MOODS, checkinView, checkinGate } from '../learn/checkin.js';

function storage() { try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch (e) { return null; } }
// the 课本 is up: its frame is on the page (menus.js _scr_book), or the menus are on its screen
export function bookOpen() {
  try { return (typeof document !== 'undefined' && !!document.querySelector('.iw-book__frame')) || G.menus?.current === 'book'; } catch (e) { return false; }
}
export function checkinFor(week, day) { try { return checkinView(storage(), week, day); } catch (e) { return null; } }
let live = null;
export function isOpen() { return !!live; }

const sfx = (name, volume = 0.5) => { try { G.audio?.play?.(name, { volume }); } catch (e) { /* audio is optional */ } };
const md = (ymd) => { const m = /^\d{4}-(\d{2})-(\d{2})$/.exec(ymd || ''); return m ? `${+m[1]} 月 ${+m[2]} 日` : ''; };

export function openCheckin({ week, day, from = 'menu', onClose = null } = {}) {
  if (live) return null;
  const view = checkinFor(week, day);
  if (checkinGate({ view, book: bookOpen() }) !== 'ok') return null;
  const reduced = prefersReducedMotion(), saved = view.saved;
  let mood = (saved && saved.mood) || '', busy = false, gone = false;

  // the host: an .iw-ui of its own over the menus and the level's HUD, in the menus' accent (her ink)
  const host = h('div', { class: 'iw-ui iw-ci-host' });
  const menusEl = G.menus?.el;
  const inks = menusEl && menusEl.style ? Array.from(menusEl.style).filter((p) => p.startsWith('--')) : [];
  if (inks.length) for (const p of inks) host.style.setProperty(p, menusEl.style.getPropertyValue(p));
  else if (G.teamHex?.[0]) colorVars(host, 'a', G.teamHex[0]);

  const faces = MOODS.map(([id, label, face], i) => {
    const b = h('button', { type: 'button', class: 'iw-ci__mood' + (mood === id ? ' is-on' : ''), role: 'radio', 'aria-checked': String(mood === id), style: { '--i': i, '--tilt': `${[-3, 1.5, 3.5][i]}deg` } },
      h('span', { class: 'iw-ci__face' }, h('span', { class: 'iw-ci__emoji', 'aria-hidden': 'true' }, face)), h('b', null, label));
    b.dataset.mood = id;
    return b;
  });
  const note = h('textarea', { class: 'iw-ci__note', rows: '1', maxlength: String(NOTE_MAX), placeholder: '写一句就好，也可以不写', enterkeyhint: 'done', autocomplete: 'off' });
  note.value = (saved && saved.note) || '';
  const count = h('span', { class: 'iw-ci__count', 'aria-live': 'polite' });
  const msg = h('p', { class: 'iw-ci__msg', role: 'status' });
  const save = h('button', { type: 'button', class: 'iw-ci__save' }, h('i', { html: GLYPHS.check }), h('span', null, view.done ? '保存修改' : '保存打卡'));
  const later = h('button', { type: 'button', class: 'iw-ci__later' }, view.done ? '关上' : '先不写');
  const stamp = h('div', { class: 'iw-ci__stamp', 'aria-hidden': 'true' },
    h('span', { class: 'iw-ci__stampink', html: splatSVG({ seed: 23, cls: 'iw-fa', r: 60, arms: 10, drops: 5 }) }),
    h('span', { class: 'iw-ci__seal' }, h('b', null, '已打卡'), h('small', null, '')));
  const title = 'iw-ci-title-' + view.dayId;
  const card = h('section', { class: 'iw-ci__card', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': title },
    h('span', { class: 'iw-ci__splat', html: splatSVG({ seed: 61, cls: 'iw-fa', r: 58, arms: 9, drops: 4 }) }),
    h('div', { class: 'iw-ci__tape' }, h('span', null, `打卡 · 第 ${view.week} 周第 ${view.day} 天`)),
    h('h2', { class: 'iw-ci__title', id: title }, '今天感觉怎么样？'),
    h('div', { class: 'iw-ci__moods', role: 'radiogroup', 'aria-label': '今天感觉怎么样' }, faces),
    h('label', { class: 'iw-ci__field' }, h('span', { class: 'iw-ci__lab' }, '今天最难的地方，或者想问老师的问题'), note, count),
    view.done ? h('p', { class: 'iw-ci__was' }, h('i', { html: GLYPHS.check }), `已保存 · ${md(saved.date)}`) : null,
    msg,
    h('div', { class: 'iw-ci__foot' }, later, save),
    stamp);
  const vp = h('div', { class: 'iw-ci__vp' }, card);
  const el = h('div', { class: 'iw-ci' + (reduced ? ' is-reduced' : '') + (from === 'level' ? ' is-level' : '') }, h('div', { class: 'iw-ci__scrim' }), vp);
  host.appendChild(el);
  (document.getElementById('ui-root') || document.body).appendChild(host);

  // the note: one line that grows to three (then it scrolls), the count once she nears the page's 500
  const grow = () => {
    note.style.height = 'auto';
    const lh = parseFloat(getComputedStyle(note).lineHeight) || 22, pad = note.offsetHeight - note.clientHeight + 16;
    note.style.height = Math.min(note.scrollHeight, lh * 3 + pad) + 'px';
    const n = note.value.length;
    count.textContent = n > NOTE_MAX - 100 ? `${n} / ${NOTE_MAX}` : '';
  };
  // the visual viewport: the card's box follows it (the soft keyboard shrinks it on a phone; WKWebView may scroll it)
  const vv = typeof visualViewport !== 'undefined' ? visualViewport : null;
  const fit = () => {
    if (!vv) return;
    vp.style.top = Math.max(0, vv.offsetTop) + 'px';
    vp.style.height = vv.height + 'px';
    el.classList.toggle('is-kb', innerHeight - vv.height > 120);
  };
  if (vv) { vv.addEventListener('resize', fit); vv.addEventListener('scroll', fit); }
  fit();

  const pick = (b) => {
    if (busy) return;
    mood = b.dataset.mood;
    for (const f of faces) { const on = f.dataset.mood === mood; f.classList.toggle('is-on', on); f.setAttribute('aria-checked', String(on)); }
    if (!reduced) restartAnim(b, 'is-pick');
    sfx('ui_toggle', 0.35);
  };
  // the press: the frame the finger lands (pointerdown), not on the click after it
  const press = (b) => { b.addEventListener('pointerdown', () => { b.classList.add('is-down'); }); for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => b.classList.remove('is-down')); };
  faces.forEach((b) => { press(b); b.addEventListener('click', () => pick(b)); });
  press(save); press(later);
  note.addEventListener('input', grow);
  note.addEventListener('focus', () => { el.classList.add('is-typing'); setTimeout(() => { try { note.scrollIntoView({ block: 'nearest' }); } catch (e) { /* old engines */ } }, 300); });
  note.addEventListener('blur', () => el.classList.remove('is-typing'));

  const close = (res) => {
    if (gone) return;
    gone = true;
    if (vv) { vv.removeEventListener('resize', fit); vv.removeEventListener('scroll', fit); }
    try { if (document.activeElement && el.contains(document.activeElement)) document.activeElement.blur(); } catch (e) { /* ignore */ }
    el.classList.add('is-out');
    setTimeout(() => { host.remove(); if (live === api) live = null; try { onClose && onClose(res); } catch (e) { console.error('[checkin]', e); } }, reduced ? 180 : 300);
  };
  const doSave = async () => {
    if (busy || gone) return;
    busy = true; save.disabled = true; msg.textContent = '';
    let r = null;
    try {
      await ielts();   // (her wall clock: the host's tzParts)
      r = saveCheckin(storage(), view.dayId, { mood, note: note.value }, new Date(), { step: view.step });
    } catch (e) { r = { ok: false, reason: 'error' }; }
    if (!r || !r.ok) {
      busy = false; save.disabled = false;
      msg.textContent = r && r.reason === 'save' ? '没能保存：这台设备的存储空间可能满了。' : r && r.reason === 'no-workbench' ? '这里没有你的课本数据，打卡没存上。' : '没能保存，再试一次。';
      restartAnim(card, 'is-nope'); sfx('ui_error', 0.3);
      return;
    }
    // the stamp: it comes down (anticipation, the slam, a hit-stop), ink spatters, the card gives under it
    stamp.querySelector('small').textContent = md(r.date);
    el.classList.add('is-stamped');
    sfx('stamp_slam', 0.42);
    if (!reduced) {
      setTimeout(() => {
        restartAnim(card, 'is-hit');
        const s = stamp.getBoundingClientRect();
        inkBurst(el, { x: s.left + s.width / 2, y: s.top + s.height / 2, color: 'var(--a)', count: 14, dist: 12, size: 1.2 });
      }, 150);
    }
    setTimeout(() => close({ saved: true, entry: r.entry, changed: r.changed }), reduced ? 700 : 1100);
  };
  save.addEventListener('click', doSave);
  later.addEventListener('click', () => { if (!busy) { sfx('ui_back', 0.3); close({ saved: false }); } });
  el.querySelector('.iw-ci__scrim').addEventListener('click', () => { if (!busy && from !== 'level') close({ saved: false }); });
  // keys typed here are the card's (the game's input listens on window, after this): Esc closes, ⌘ / Ctrl + Enter saves
  el.addEventListener('keydown', (e) => {
    e.stopPropagation();
    if (e.key === 'Escape') { e.preventDefault(); if (!busy) close({ saved: false }); }
    else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); doSave(); }
  });
  el.addEventListener('keyup', (e) => e.stopPropagation());

  try { document.exitPointerLock?.(); } catch (e) { /* not locked */ }
  sfx('ui_confirm', 0.4);
  requestAnimationFrame(() => { grow(); el.classList.add('is-in'); (faces.find((f) => f.classList.contains('is-on')) || faces[0]).focus({ preventScroll: true }); });
  const api = { el, view, close: () => close({ saved: false }), save: doSave };
  live = api;
  return api;
}
