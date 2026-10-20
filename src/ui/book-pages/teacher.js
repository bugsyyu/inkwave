// src/ui/book-pages/teacher.js — 老师, a page of the 课本 the game draws itself (游戏为主体 第三期第三步, docs/LEARN.md §46).
// The lesson page's 找老师 (app/index.html mountTeacher), the game's look, section by section: 我们怎么一起学 (the App's
// words), 老师笔记, 本周周报 (a letter: its text is the lesson page's own — weekReport goes on into core.js and the exams —
// asked of the page in the book, ctx.ask; 复制周报 and the format file the App gives: 下载课程格式说明), 课程包 (her weeks;
// 导入课程包 picks a file, 粘贴课程包 opens a sheet over the keyboard), 随时找我 (the templates, each opens to be copied).
// Her blob is read at once for what the game knows itself; the report fills in when the page answers (null: a line and
// the way to the lesson page's own 老师). Imports go through src/learn/teacher.js (her latest blob, packs / teacher.notes
// only, the mirror follows); after one the page is asked again (a new week: a new report, and her today moves on).
import { h, restartAnim, splatSVG } from '../ui-util.js';
import { GLYPHS } from '../ui-icons.js';
import { ielts } from '../../learn/ielts.js';
import { readBlob, invalidate, DATA_KEY } from '../../learn/workbench.js';
import { loadedWeek } from '../../learn/content.js';
import { answerOf } from '../../learn/book.js';
import { BOOK_URL } from '../../learn/app.js';
import { LEAD, HOW, HOW_NOTE, NOTES_NOTE, ASK_NOTE, SAY, FILE_MAX, FORMAT_NAME, TEACHER_TEMPLATES, notesText, notesMeta, packList, importPack, classicAt } from '../../learn/teacher.js';
import { pageFrame, stickerBtn, ownKeys, emptyNote, sheet, reveal, PLUS, CHECK } from './kit.js';

export const DOWN_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4 V15 M6.5 10 L12 15.5 L17.5 10" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/><path d="M5 20 H19" stroke="currentColor" stroke-width="3.2" stroke-linecap="round"/></svg>';
// what she was pasting, and which templates were open: kept for the session (the book opens and closes)
const S = { draft: '', open: new Set() };

export function mount(host, ctx) {
  const ls = ctx.ls;
  let gone = false, sh = null, keep = null, ans = null, asking = 0, fmtBtnFmt = 'dl', freshWeek = null;
  const fr = pageFrame({ cls: 'iw-bp--teacher', kicker: 'TEACHER', title: '找老师', lead: LEAD });
  host.appendChild(fr.el);
  ownKeys(fr.el);
  const panel = (i, kicker, title, extra, ...kids) => h('section', { class: 'iw-bp-panel iw-bt-sec iw-bp__in', style: { '--i': i }, 'data-sec': kicker.toLowerCase().replace(/ /g, '-') },
    h('h3', { class: 'iw-bp-sec' }, h('small', null, kicker), h('span', { class: 'iw-bt-sec__t' }, title, extra || null)), ...kids);
  const pill = () => h('span', { class: 'iw-bt-pill' });

  // 我们怎么一起学 — the App's three lines and its note
  const how = panel(1, 'HOW WE WORK', '我们怎么一起学', null,
    h('ol', { class: 'iw-bt-how' }, HOW.map(([b, t], i) => h('li', { style: { '--n': '"' + (i + 1) + '"' } }, h('b', null, b), t))),
    h('p', { class: 'iw-bp-muted' }, HOW_NOTE));

  // 老师笔记
  const notesPill = pill(), notesEl = h('p', { class: 'iw-bt-notes' });
  const notes = panel(2, 'NOTES', '老师笔记', notesPill, notesEl, h('p', { class: 'iw-bp-muted' }, NOTES_NOTE));

  // 本周周报 — the letter (the page's own words, once it answers), 复制周报, the format file
  const weekPill = pill();
  const letter = h('div', { class: 'iw-bt-letter', role: 'document', 'aria-label': '周报' });
  const paper = h('div', { class: 'iw-bt-paper' }, letter);
  const copyRep = stickerBtn(ctx, { id: 'tc-copy', cls: 'iw-bp-btn--go', icon: GLYPHS.copy, label: '复制周报', accept: () => { if (ans) copy(ans.report, copyRep); else wait(copyRep); } });
  const fmtBtn = stickerBtn(ctx, { id: 'tc-format', cls: '', icon: DOWN_SVG, label: '下载课程格式说明', accept: () => { if (ans) format(); else wait(fmtBtn); } });
  const repActs = h('div', { class: 'iw-bt-acts' }, copyRep, fmtBtn);
  const week = panel(3, 'YOUR WEEK', '本周周报', weekPill, paper, repActs);

  // 课程包 — her weeks, 导入课程包 (a file), 粘贴课程包 (a sheet)
  const packsEl = h('ul', { class: 'iw-bt-packs' });
  const file = h('input', { type: 'file', accept: '.json,application/json', hidden: true, class: 'iw-bt-file', tabindex: '-1', 'aria-hidden': 'true' });
  const pick = stickerBtn(ctx, { id: 'tc-pick', cls: 'iw-bp-btn--add', icon: PLUS, label: '导入课程包', accept: () => { ctx.sfx('ui_confirm'); try { file.click(); } catch (e) { /* the sheet still works */ } } });
  const paste = stickerBtn(ctx, { id: 'tc-paste', cls: '', icon: GLYPHS.paste, label: '粘贴课程包', accept: () => compose() });
  const packs = panel(4, 'COURSE PACKS', '课程包', null, packsEl, h('div', { class: 'iw-bt-acts' }, pick, paste), file);

  // 随时找我 — each template opens to its text and 复制
  const tplBox = h('div', { class: 'iw-bt-tpls' });
  const ask = panel(5, 'ASK ME', '随时找我', null, h('p', { class: 'iw-bp-muted iw-bt-asknote' }, ASK_NOTE), tplBox);

  const all = [how, notes, week, packs, ask];
  fr.body.append(...all);

  /* ---------- drawing ---------- */
  function drawNotes(text, meta) { notesEl.textContent = text; notesPill.textContent = meta; }
  function drawPacks(list) {
    packsEl.replaceChildren(...list.map((x, i) => h('li', { class: 'iw-bt-pack' + (x.fresh ? ' is-new' : ''), style: { '--i': i } },
      h('b', { class: 'iw-bt-pack__t' }, x.title),
      h('span', { class: 'iw-bt-pack__m' }, h('i', { class: 'iw-bt-tag' + (x.builtin ? ' is-built' : '') }, x.builtin ? '内置' : '已导入'), x.days + ' 天'))));
  }
  const sig = (x) => JSON.stringify(x);
  let tplSig = '';
  function drawTemplates(list) {
    if (sig(list) === tplSig) return;
    tplSig = sig(list);
    tplBox.replaceChildren(...list.map(([title, text], i) => {
      const body = h('div', { class: 'iw-bt-tpl__b' }, h('p', { class: 'iw-bt-tpl__x' }, text));
      const cp = stickerBtn(ctx, { id: 'tc-tpl-copy-' + i, cls: 'iw-bp-btn--go iw-bt-tpl__copy', icon: GLYPHS.copy, label: '复制', accept: () => copy(text, cp) });
      body.appendChild(cp);
      const head = h('button', { class: 'iw-bt-tpl__h', 'aria-expanded': 'false' }, h('b', null, title), h('i', { class: 'iw-bt-tpl__chev', html: GLYPHS.next }));
      const card = h('article', { class: 'iw-bt-tpl', style: { '--i': i } }, head, body);
      const set = (on, by) => {
        card.classList.toggle('is-open', on); head.setAttribute('aria-expanded', String(on)); body.hidden = !on; cp.hidden = !on;
        if (on) S.open.add(title); else S.open.delete(title);
        if (on && by && !ctx.reduced) restartAnim(body, 'is-in');
      };
      ctx.bind(head, { id: 'tc-tpl-' + i, accept: () => { ctx.sfx('ui_toggle'); set(!card.classList.contains('is-open'), true); if (card.classList.contains('is-open')) setTimeout(() => reveal(fr.scroll, body, ctx.reduced), 60); } });
      set(S.open.has(title), false);
      return card;
    }));
  }
  // the letter: 正在生成 (an ink blot) → the report | the page did not answer
  const blot = () => h('i', { class: 'iw-bt-blot', html: splatSVG({ seed: 29, cls: 'iw-fa', r: 46, arms: 8, drops: 3 }) });
  function letterWait() {
    letter.classList.remove('is-text', 'is-none'); letter.classList.add('is-wait');
    letter.replaceChildren(h('div', { class: 'iw-bt-letter__wait' }, blot(), h('span', null, '正在按你这一周的记录生成……')));
    copyRep.classList.add('is-wait'); fmtBtn.classList.add('is-wait');
  }
  function letterText(a, anim) {
    letter.classList.remove('is-wait', 'is-none'); letter.classList.add('is-text');
    const t = h('p', { class: 'iw-bt-letter__t' }, a.report);
    letter.replaceChildren(t);
    letter.scrollTop = 0;
    if (anim) restartAnim(paper, 'is-fill');
    copyRep.classList.remove('is-wait'); fmtBtn.classList.remove('is-wait');
  }
  function letterNone() {
    letter.classList.remove('is-wait', 'is-text'); letter.classList.add('is-none');
    const go = stickerBtn(ctx, { id: 'tc-classic', cls: 'iw-bp-btn--add', label: '到经典页的老师里复制', accept: () => { ctx.sfx('ui_confirm'); classicAt(ls, 'teacher', ctx.now()); location.href = BOOK_URL; } });
    const again = stickerBtn(ctx, { id: 'tc-again', cls: 'iw-bp-btn--ghost', label: '再试一次', accept: () => askNow(null) });
    letter.replaceChildren(h('div', { class: 'iw-bt-letter__none' }, h('p', null, '这一周的周报这次没能从课本里拿到。到经典页的「找老师」里一样能复制。'), h('div', { class: 'iw-bt-acts' }, go, again)));
  }
  function setFormat(fmt) {
    if (fmt === fmtBtnFmt) return;
    fmtBtnFmt = fmt;
    fmtBtn.querySelector('.iw-bp-btn__t').textContent = fmt === 'copy' ? '复制课程格式说明' : '下载课程格式说明';
    fmtBtn.querySelector('.iw-bp-btn__ic').innerHTML = fmt === 'copy' ? GLYPHS.copy : DOWN_SVG;
  }

  // everything the game knows itself, from her latest blob (the page's answer, when it comes, has the last word)
  function local() {
    const b = readBlob(ls);
    if (!b) return false;
    drawNotes(notesText(b.o), notesMeta(b.o));
    drawPacks(packList(b.o, loadedWeek(1)).map((x) => Object.assign(x, { fresh: x.id === freshWeek })));
    return true;
  }
  function fill(a, anim) {
    weekPill.textContent = a.title;
    letterText(a, anim);
    setFormat(a.fmt);
    if (a.notes) drawNotes(a.notes.text, a.notes.meta);
    if (a.weeks) drawPacks(a.weeks.map((x) => Object.assign({}, x, { fresh: x.id === freshWeek })));
    if (a.templates) drawTemplates(a.templates);
  }
  // ask the page in the book; after(a): what follows a fresh answer (an import: her today moves on)
  function askNow(after) {
    const my = ++asking;
    ans = null;
    letterWait();
    const q = ctx.ask ? ctx.ask('teacher') : Promise.resolve(null);
    q.then((raw) => {
      if (gone || my !== asking) return;
      const a = answerOf(raw);
      if (!a) { ans = null; letterNone(); return; }
      ans = a;
      fill(a, true);
      freshWeek = null;
      if (after) after(a);
    }, () => { if (!gone && my === asking) letterNone(); });
  }

  /* ---------- doing ---------- */
  function wait(btn) { ctx.sfx('ui_error'); if (!ctx.reduced) restartAnim(btn, 'is-nope'); }
  function done(btn) { ctx.sfx('ui_confirm'); if (!ctx.reduced) { restartAnim(btn, 'is-done'); ctx.burst(btn, { count: 12, dist: 9, size: 1.1 }); } }
  // copyText's three ways (app/index.html): the clipboard, a selected textarea and execCommand (the App's web view), a box to copy by hand
  async function copy(text, btn) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); done(btn); ctx.toast(SAY.copied, { kind: 'good' }); return true; }
    } catch (e) { /* the next way */ }
    const ta = h('textarea', { readonly: '', style: { position: 'fixed', top: '0', left: '0', opacity: '0', fontSize: '16px' } });
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try { ta.setSelectionRange(0, ta.value.length); } catch (e) { /* iOS selects only with this */ }
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    ta.remove();
    if (ok) { done(btn); ctx.toast(SAY.copied, { kind: 'good' }); } else byHand(text);
    return ok;
  }
  function byHand(text) {
    if (sh) return;
    const box = h('textarea', { class: 'iw-bp-in iw-bp-in--area iw-bt-hand', readonly: '' });
    box.value = text;
    const ok = stickerBtn(ctx, { id: 'tc-hand-ok', cls: 'iw-bp-btn--go', icon: CHECK, label: '好了', accept: () => closeSheet() });
    sh = sheet(ctx, { tape: '请手动复制', kicker: 'COPY', cls: 'iw-bps--hand', body: h('div', { class: 'iw-bps__body' }, h('p', { class: 'iw-bt-hand__p' }, '这里没能自动复制。长按下面的文字，选"全选"，再选"拷贝"。'), box), foot: [ok], onBack: () => closeSheet() });
    ownKeys(sh.el, { esc: () => closeSheet() });
    setTimeout(() => { try { box.focus({ preventScroll: true }); box.select(); box.setSelectionRange(0, box.value.length); } catch (e) { /* ignore */ } }, 320);
    ctx.focus(ok);
  }
  // the format file: what the App's lesson page gives (下载: an <a download> blob — her App turns it into a download and the
  // share sheet, WebView.swift; 复制 where the page offers that instead)
  function format() {
    if (ans.fmt === 'copy') { copy(ans.format, fmtBtn); return; }
    let ok = false;
    try {
      const url = URL.createObjectURL(new Blob([ans.format], { type: 'application/json' }));
      const a = h('a', { href: url, download: FORMAT_NAME, hidden: true });
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      ok = true;
    } catch (e) { ok = false; }
    if (ok) { done(fmtBtn); ctx.toast(SAY.downloaded, { kind: 'good' }); } else ctx.toast(SAY.dlFail, { kind: 'error' });
  }
  // an import (a file's text, or what she pasted): written, then the page is asked again — a new week, a new report
  function take(text, src) {
    const r = importPack(ls, text, ctx.now());
    if (!r.ok) return r;
    freshWeek = r.week.id;
    local();
    if (r.notes && !ctx.reduced) restartAnim(notes, 'is-ping');
    ctx.toast(r.msg, { kind: 'good', ms: 6000 });
    done(src);
    // (a new week: the page says her today again — the menu's 开始今天的关 and the map follow)
    askNow((a) => { if (a.today && ctx.today) ctx.today(a.today.slice(Math.max(0, a.today.indexOf('?')))); });
    return r;
  }
  file.addEventListener('change', () => {
    const f = file.files && file.files[0];
    file.value = '';
    if (!f) return;
    if (f.size > FILE_MAX) { ctx.toast(SAY.file, { kind: 'error' }); ctx.sfx('ui_error'); return; }
    const rd = new FileReader();
    rd.onload = () => { if (gone) return; const r = take(String(rd.result || ''), pick); if (!r.ok) { ctx.toast(r.msg, { kind: 'error', ms: 6000 }); ctx.sfx('ui_error'); } };
    rd.onerror = () => { ctx.toast(SAY.read, { kind: 'error' }); };
    rd.readAsText(f, 'utf-8');
  });

  // 粘贴课程包: a sheet with the box (over the soft keyboard), 收起 / 导入
  function compose() {
    if (sh || gone || !readBlob(ls)) return;
    ctx.sfx('ui_confirm');
    const ta = h('textarea', { class: 'iw-bp-in iw-bp-in--area iw-bt-paste', 'aria-label': '粘贴课程包', placeholder: '把老师发来的课程包整段粘贴在这里', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' });
    ta.value = S.draft;
    const later = stickerBtn(ctx, { id: 'tc-later', cls: 'iw-bp-btn--ghost', label: '收起', accept: () => back() });
    const go = stickerBtn(ctx, { id: 'tc-import', cls: 'iw-bp-btn--go', icon: CHECK, label: '导入', accept: () => submit() });
    keep = () => { S.draft = ta.value; };
    function back() { keep(); ctx.sfx('ui_back'); closeSheet(); }
    function submit() {
      if (!sh || sh.busy) return;
      if (!ta.value.trim()) { sh.msg(SAY.paste); sh.nope(); ta.focus(); return; }
      const r = take(ta.value, go);
      if (!r.ok) { sh.msg(r.msg); sh.nope(); return; }
      sh.busy = true; S.draft = '';
      setTimeout(() => closeSheet(() => ctx.focus(paste)), ctx.reduced ? 120 : 260);
    }
    sh = sheet(ctx, { tape: '粘贴课程包', kicker: 'PASTE A PACK', cls: 'iw-bps--paste', body: h('div', { class: 'iw-bps__body' }, ta), foot: [later, go], onBack: back });
    ownKeys(sh.el, { enter: () => submit(), esc: () => back() });
    ctx.focus(go);
  }
  function closeSheet(then) {
    const s = sh;
    if (!s) return;
    keep = null;
    s.close(() => { if (sh === s) sh = null; if (then) then(); else ctx.focus(paste); });
  }

  // no blob on this device: the line, and the way to 今天的课 (nothing to import into)
  function noData() {
    all.slice(1).forEach((x) => { x.hidden = true; });
    const go = stickerBtn(ctx, { id: 'tc-today', cls: 'iw-bp-btn--add', label: '翻到今天的课', accept: () => ctx.go('today') });
    fr.body.appendChild(emptyNote('这台设备上还没有你的学习数据。先在课本里开始学习（翻到「今天的课」做完开头的设置），周报和课程包就都在这里了。', go));
  }

  // the lesson page in the book (an iframe of the same origin) saved her blob: read it again
  const onStore = (e) => { if (e.key === DATA_KEY) { invalidate(); if (!gone && !ans) local(); } };
  addEventListener('storage', onStore);
  readBlob(ls, { fresh: true });
  drawTemplates(TEACHER_TEMPLATES);
  if (local()) askNow(null); else noData();
  ielts().catch(() => {});   // (her wall clock for an import's date: the host's tzParts)

  return {
    el: fr.el,
    // 合上: an import is written the moment it is taken; a sheet still open keeps its draft
    flush() { if (keep) keep(); },
    onFocus(el, nav) { if (nav && fr.scroll.contains(el)) reveal(fr.scroll, el, ctx.reduced); },
    destroy() { gone = true; removeEventListener('storage', onStore); if (keep) keep(); if (sh) { sh.close(); sh = null; } },
  };
}
