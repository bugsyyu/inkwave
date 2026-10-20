// src/ui/book-pages/notes.js — 积累本, a page of the 课本 the game draws itself (游戏为主体 第三期第二步, docs/LEARN.md §43).
// The lesson page's 积累本 (app/index.html mountNotes / refreshNotes / addNote / delItem), same data, the game's look: the
// type tabs with their counts, a search, her notes newest first as sticker cards; 记一条 opens a sheet (the type, the three
// fields with the page's labels and hints and limits); 删除 asks twice. Writes go through src/learn/notes.js (her latest
// blob, only notes[id], the mirror follows). Without her blob: a line pointing to 今天的课, nothing is created.
import { h, restartAnim } from '../ui-util.js';
import { ielts } from '../../learn/ielts.js';
import { readBlob, invalidate, DATA_KEY } from '../../learn/workbench.js';
import { NOTE_TYPES, NOTE_MAX, noteLabels, noteList, newNote, saveNote, deleteNote, todayOf, uid, fmtMD, repeatGuard } from '../../learn/notes.js';
import { pageFrame, stickerBtn, field, ownKeys, delBtn, emptyNote, sheet, chipRow, reveal, SEARCH_SVG, PLUS, CHECK } from './kit.js';

// a sticker colour per type (the bookmark's yellow for 生词)
export const TYPE_C = { word: '#ffd21a', para: '#5cc8ff', expr: '#ff5f8f', story: '#3ddc97' };
// what she was filtering, searching and writing: kept for the session (the book opens and closes)
const S = { t: 'all', q: '', draft: null, type: 'word' };
const again = repeatGuard();

export function mount(host, ctx) {
  const ls = ctx.ls;
  let gone = false, sh = null, fresh = null, keep = null;
  const add = stickerBtn(ctx, { id: 'nb-add', cls: 'iw-bp-btn--add', icon: PLUS, label: '记一条', accept: () => compose() });
  const count = h('span', { class: 'iw-bp__count' });
  const fr = pageFrame({ cls: 'iw-bp--notes', kicker: 'NOTEBOOK', title: '积累本', lead: '生词、同义替换、好的表达和口语素材都放这里。阅读和听力里遇到的同义替换最值得记。', action: h('div', { class: 'iw-bp__acts' }, add, count) });
  host.appendChild(fr.el);
  ownKeys(fr.el);

  // the type tabs (a tab and its count) and the search
  const tabs = [['all', '全部']].concat(Object.keys(NOTE_TYPES).map((k) => [k, NOTE_TYPES[k]])).map(([id, label], i) => {
    const n = h('i', { class: 'iw-bp-tab__n' }, '0');
    const b = h('button', { class: 'iw-bp-tab', role: 'tab', style: { '--c': TYPE_C[id] || '#fff', '--i': i } }, h('b', null, label), n);
    b.dataset.t = id; b._n = n;
    ctx.bind(b, { id: 'nb-t-' + id, accept: () => { if (S.t !== id) { S.t = id; ctx.sfx('ui_toggle'); list(true); } } });
    return b;
  });
  const q = h('input', { class: 'iw-bp-search__in', type: 'search', placeholder: '搜索', 'aria-label': '搜索积累本', enterkeyhint: 'search', autocomplete: 'off', spellcheck: 'false' });
  q.value = S.q;
  const search = field(ctx, { id: 'nb-q', cls: 'iw-bp-search', label: h('i', { class: 'iw-bp-search__ic', html: SEARCH_SVG }), input: q });
  let qT = 0;
  q.addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(() => { S.q = q.value; list(false); }, 90); });
  const filters = h('div', { class: 'iw-bp-filters iw-bp__in', style: { '--i': 1 } }, h('div', { class: 'iw-bp-tabs', role: 'tablist', 'aria-label': '按类型筛选' }, tabs), search.row);
  const items = h('div', { class: 'iw-bp-notes' });
  fr.body.append(filters, items);

  // the cards (her words as text nodes, never as markup)
  const card = (n, i, anim) => {
    const t = NOTE_TYPES[n.t] ? n.t : '';
    const pair = h('div', { class: 'iw-bp-note__pair' }, h('b', { class: 'iw-bp-note__en', lang: 'en' }, String(n.en == null ? '' : n.en)),
      n.zh ? h('span', { class: 'iw-bp-note__sep', 'aria-hidden': 'true' }, n.t === 'para' ? '↔' : '') : null,
      n.zh ? h('span', { class: 'iw-bp-note__zh' }, String(n.zh)) : null);
    const del = delBtn(ctx, { id: 'nb-del-' + n.id, label: '删除这一条', onDelete: (b) => drop(n, b) });
    const el = h('article', { class: 'iw-bp-note' + (anim ? ' iw-bp__in' : '') + (n.id === fresh ? ' is-new' : ''), style: { '--c': TYPE_C[t] || '#9a93ad', '--i': Math.min(i, 9) + 2, '--tilt': ((i % 3) - 1) * 0.35 + 'deg' } },
      h('span', { class: 'iw-bp-note__type' }, NOTE_TYPES[n.t] || '其他'),
      pair,
      n.ex ? h('p', { class: 'iw-bp-note__ex' }, String(n.ex)) : null,
      h('footer', { class: 'iw-bp-note__foot' }, h('span', { class: 'iw-bp-note__d' }, fmtMD(n.d)), del));
    el.dataset.id = n.id == null ? '' : String(n.id);
    return el;
  };
  function list(anim) {
    if (gone) return;
    const b = readBlob(ls);
    if (!b) { noData(); return; }
    add.hidden = false; filters.hidden = false;
    const r = noteList(b.o.notes, S);
    r.tabs.forEach(([id, , c], i) => { const el = tabs[i]; el._n.textContent = String(c); const on = S.t === id; el.classList.toggle('is-on', on); el.setAttribute('aria-selected', String(on)); });
    count.textContent = r.total ? '共 ' + r.total + ' 条' : '';
    const typing = document.activeElement === q;
    items.classList.toggle('is-quiet', !anim);
    items.replaceChildren(...(r.items.length ? r.items.map((n, i) => card(n, i, (anim && i < 12) || n.id === fresh)) : [emptyNote(r.total ? '没有找到匹配的条目。' : '积累本还是空的。点「记一条」，把今天遇到的生词或同义替换记下来。')]));
    if (typing && document.activeElement !== q) q.focus({ preventScroll: true });
    if (fresh) {
      const el = items.querySelector('.is-new');
      if (el) setTimeout(() => { reveal(fr.scroll, el, ctx.reduced); if (!ctx.reduced) ctx.burst(el, { count: 12, dist: 9, size: 1.1 }); }, 120);
      fresh = null;
    }
  }
  function noData() {
    add.hidden = true; filters.hidden = true;
    const go = stickerBtn(ctx, { id: 'nb-today', cls: 'iw-bp-btn--add', label: '翻到今天的课', accept: () => ctx.go('today') });
    items.replaceChildren(emptyNote('这台设备上还没有你的学习数据。先在课本里开始学习（翻到「今天的课」做完开头的设置），积累本就能用了。', go));
  }

  // 删除: the card shrinks away, then the list without it
  function drop(n, btn) {
    const r = deleteNote(ls, n.id);
    if (!r.ok) { ctx.toast(r.reason === 'save' ? '没能保存：这台设备的存储空间可能满了。' : '没能删除，再试一次。', { kind: 'error' }); return; }
    ctx.sfx('ui_back'); ctx.toast('已删除。');
    const el = btn.closest('.iw-bp-note');
    const next = el && (el.nextElementSibling || el.previousElementSibling);
    const nextId = next && next.dataset.id;
    if (el) el.classList.add('is-gone');
    setTimeout(() => {
      list(false);
      const f = nextId ? items.querySelector(`[data-id="${CSS.escape(nextId)}"] .iw-bp-del`) : null;
      ctx.focus(f || add);
    }, ctx.reduced ? 120 : 230);
  }

  // 记一条: the sheet — the type (its labels and hints follow it), 英文 / 中文 / 例句, 加入积累本
  function compose() {
    if (sh || gone || !readBlob(ls)) return;
    ctx.sfx('ui_confirm');
    const d = S.draft || { t: S.type, en: '', zh: '', ex: '' };
    const en = h('input', { class: 'iw-bp-in', maxlength: String(NOTE_MAX.en), autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'next', lang: 'en' });
    const zh = h('input', { class: 'iw-bp-in', maxlength: String(NOTE_MAX.zh), autocomplete: 'off', enterkeyhint: 'next' });
    const ex = h('textarea', { class: 'iw-bp-in iw-bp-in--area', maxlength: String(NOTE_MAX.ex), rows: '2' });
    en.value = d.en; zh.value = d.zh; ex.value = d.ex;
    const fEn = field(ctx, { id: 'nb-f-en', label: '', input: en }), fZh = field(ctx, { id: 'nb-f-zh', label: '', input: zh }), fEx = field(ctx, { id: 'nb-f-ex', label: '', input: ex, cls: 'is-wide' });
    const label = (t) => {
      const L = noteLabels(t);
      fEn.lab.textContent = L.en; fZh.lab.textContent = L.zh; fEx.lab.textContent = L.ex;
      en.placeholder = L.hints[0]; zh.placeholder = L.hints[1]; ex.placeholder = L.hints[2];
    };
    const types = chipRow(ctx, { name: 'nb-type', value: d.t, items: Object.keys(NOTE_TYPES).map((k) => ({ id: k, label: NOTE_TYPES[k], c: TYPE_C[k] })), onPick: (t) => { S.type = t; label(t); } });
    label(d.t);
    const grow = () => { ex.style.height = 'auto'; ex.style.height = Math.min(ex.scrollHeight + 2, 132) + 'px'; };
    ex.addEventListener('input', grow);
    const later = stickerBtn(ctx, { id: 'nb-later', cls: 'iw-bp-btn--ghost', label: '收起', accept: () => back() });
    const save = stickerBtn(ctx, { id: 'nb-save', cls: 'iw-bp-btn--go', icon: CHECK, label: '加入积累本', accept: () => submit() });
    const body = h('div', { class: 'iw-bps__body' }, h('div', { class: 'iw-bps__chipset' }, h('div', { class: 'iw-bps__lab' }, '类型'), types.el), h('div', { class: 'iw-bps__grid' }, fEn.row, fZh.row, fEx.row));
    keep = () => { S.draft = { t: types.value(), en: en.value, zh: zh.value, ex: ex.value }; };
    function back() { keep(); ctx.sfx('ui_back'); closeSheet(); }
    function closeSheet(then) { const s = sh; if (!s) return; keep = null; s.close(() => { if (sh === s) sh = null; if (then) then(); else ctx.focus(add); }); }
    function submit() {
      if (!sh || sh.busy) return;
      const g = { t: types.value(), en: en.value, zh: zh.value, ex: ex.value };
      if (!g.en.trim()) { sh.msg('先填第一栏。'); sh.nope(); en.focus(); return; }
      if (again([g.t, g.en, g.zh, g.ex].join('|'), Date.now())) return;   // (a double tap, a second Enter)
      const entry = newNote(g, todayOf(ls, ctx.now()), uid());
      const r = saveNote(ls, entry);
      if (!r.ok) {
        sh.msg(r.reason === 'save' ? '没能保存：这台设备的存储空间可能满了。' : r.reason === 'no-workbench' ? '这里没有你的课本数据，没存上。' : '没能保存，再试一次。');
        sh.nope(); return;
      }
      sh.busy = true; S.draft = null; fresh = entry.id;
      ctx.sfx('ui_confirm'); ctx.burst(save, { count: 14, dist: 10, size: 1.2, ring: true });
      restartAnim(save, 'is-done');
      setTimeout(() => closeSheet(() => { list(false); ctx.toast('已加入积累本。', { kind: 'good' }); ctx.focus(add); }), ctx.reduced ? 120 : 260);
    }
    sh = sheet(ctx, { tape: '记一条', kicker: 'KEEP ONE', cls: 'iw-bps--note', body, foot: [later, save], onBack: back });
    ownKeys(sh.el, { enter: (t) => { if (t === en) zh.focus(); else submit(); }, esc: () => back() });
    ctx.focus(types.chips.find((c) => c.classList.contains('is-on')) || save);
    requestAnimationFrame(grow);
  }

  // the lesson page in the book (an iframe of the same origin) saved her blob: read it again
  const onStore = (e) => { if (e.key === DATA_KEY) { invalidate(); list(false); } };
  addEventListener('storage', onStore);
  // first paint: her latest blob (the page in the book may have written it since the game read it)
  readBlob(ls, { fresh: true });
  list(true);
  ielts().catch(() => {});   // (her wall clock for 记一条's date: the host's tzParts)

  return {
    el: fr.el,
    // 合上: nothing waits to be written (a note is saved the moment she adds it); a sheet still open keeps its draft
    flush() { if (keep) keep(); },
    onFocus(el, nav) { if (nav && fr.scroll.contains(el)) reveal(fr.scroll, el, ctx.reduced); },
    destroy() { gone = true; clearTimeout(qT); removeEventListener('storage', onStore); if (keep) keep(); if (sh) { sh.close(); sh = null; } },
  };
}
