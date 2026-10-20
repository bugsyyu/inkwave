// src/ui/book-pages/log.js — 学习日志, a page of the 课本 the game draws itself (游戏为主体 第三期第二步, docs/LEARN.md §43).
// The lesson page's 学习日志 (app/index.html mountLog / refreshLog / addLogFromForm / delLog), same data, the game's look:
// the last 14 days as ink bars (the minutes of the steps she ticked and what she added), the last 7 days by 科目, the last
// 60 days that have anything (steps done, the total, each added entry with its 删除); 补记一条 opens a sheet (the day — not
// to come, the last 60 only —, the 科目, the minutes 0–600, a note ≤ 100; a note alone with 0 minutes is fine; a quick
// second press is not a new entry). Writes go through src/learn/notes.js. Without her blob: a line pointing to 今天的课.
import { h, restartAnim } from '../ui-util.js';
import { ielts } from '../../learn/ielts.js';
import { readBlob, invalidate, DATA_KEY } from '../../learn/workbench.js';
import { MODULES, LOG_MODULES, LOG_NOTE_MAX, LOG_MIN_MAX, LOG_DAYS, logView, checkLog, saveLog, deleteLog, todayOf, uid, fmtH, fmtDur, fmtMD, weekdayOf, repeatGuard } from '../../learn/notes.js';
import { addDays } from '../../learn/exams.js';
import { pageFrame, stickerBtn, field, ownKeys, delBtn, emptyNote, sheet, chipRow, reveal, PLUS, CHECK, MINUS_SVG } from './kit.js';

// a sticker colour per 科目 (the bookmarks' palette)
export const MOD_C = { vocab: '#ffd21a', listening: '#5cc8ff', reading: '#3ddc97', writing: '#ff9e7a', speaking: '#ff5f8f', grammar: '#a98bff', pron: '#c6f432', mock: '#ff8a14', review: '#d7d0e8', other: '#9a93ad' };
// what she was writing, kept for the session; the form's own memory (the page keeps 科目 / 分钟 / 日期 after 记录)
const S = { draft: null };
const again = repeatGuard();

export function mount(host, ctx) {
  const ls = ctx.ls;
  let gone = false, sh = null, keep = null, fresh = null, today = null;
  const add = stickerBtn(ctx, { id: 'lg-add', cls: 'iw-bp-btn--add', icon: PLUS, label: '补记一条', accept: () => compose() });
  const fr = pageFrame({ cls: 'iw-bp--log', kicker: 'STUDY LOG', title: '学习日志', lead: '勾选今日任务会自动记下时长；计划外的学习在这里补记。', action: h('div', { class: 'iw-bp__acts' }, add) });
  host.appendChild(fr.el);
  ownKeys(fr.el);

  // the two charts (their shape is made once; a re-read only moves the bars) and the list
  const bars = Array.from({ length: 14 }, (_, i) => {
    const bar = h('i', { class: 'iw-bp-bar__b' }), lbl = h('span', { class: 'iw-bp-bar__l' });
    const col = h('div', { class: 'iw-bp-bar', style: { '--i': i } }, h('span', { class: 'iw-bp-bar__w' }, bar), lbl);
    return { col, bar, lbl };
  });
  const sum = h('p', { class: 'iw-bp-cap' });
  const mods = h('div', { class: 'iw-bp-mods' });
  const panel = (kicker, title, ...kids) => h('section', { class: 'iw-bp-panel iw-bp__in' }, h('h3', { class: 'iw-bp-sec' }, h('small', null, kicker), title), ...kids);
  const p14 = panel('TWO WEEKS', '最近 14 天', h('div', { class: 'iw-bp-chart' }, bars.map((b) => b.col)), sum);
  const p7 = panel('THIS WEEK', '最近 7 天各科用时', mods);
  p14.style.setProperty('--i', 1); p7.style.setProperty('--i', 2);
  const charts = h('div', { class: 'iw-bp-charts' }, p14, p7);
  const days = h('div', { class: 'iw-bp-days' });
  fr.body.append(charts, days);

  function render(anim) {
    if (gone) return;
    const b = readBlob(ls);
    if (!b) { noData(); return; }
    add.hidden = false; charts.hidden = false;
    if (!today) return;
    const v = logView(b.o, today);
    const max = Math.max(240, ...v.days.map((d) => d.m));
    v.days.forEach((d, i) => {
      const x = bars[i];
      x.bar.style.setProperty('--h', (d.m / max).toFixed(4));
      x.col.classList.toggle('is-today', d.today); x.col.classList.toggle('is-zero', !d.m);
      x.col.title = fmtMD(d.date) + '：' + d.m + ' 分钟';
      x.lbl.textContent = String(+d.date.slice(8, 10));
    });
    sum.textContent = '14 天共 ' + fmtH(v.sum) + ' 小时，平均每天 ' + v.avg + ' 分钟';
    const mx = Math.max(1, ...v.mods.map((r) => r[1]));
    mods.replaceChildren(...(v.mods.length
      ? v.mods.map(([k, m], i) => h('div', { class: 'iw-bp-hbar', style: { '--c': MOD_C[k] || MOD_C.other, '--w': (m / mx).toFixed(4), '--i': i } },
        h('span', { class: 'iw-bp-hbar__k' }, (MODULES[k] || MODULES.other)), h('span', { class: 'iw-bp-hbar__t' }, h('i')), h('span', { class: 'iw-bp-hbar__v' }, fmtDur(m))))
      : [h('p', { class: 'iw-bp-muted' }, '最近 7 天还没有记录。勾选今日任务后，这里会按科目统计。')]));
    days.classList.toggle('is-quiet', !anim);
    days.replaceChildren(...(v.list.length
      ? [h('h3', { class: 'iw-bp-sec iw-bp__in', style: { '--i': 3 } }, h('small', null, 'SIXTY DAYS'), '最近 60 天')].concat(v.list.map((x, i) => day(x, i, anim)))
      : [emptyNote('还没有学习记录。去「今天的课」勾掉第一项任务吧，或者点「补记一条」。')]));
    if (fresh) {
      const el = days.querySelector('.is-new');
      if (el) setTimeout(() => { reveal(fr.scroll, el, ctx.reduced); if (!ctx.reduced) ctx.burst(el, { count: 12, dist: 9, size: 1.1 }); }, 120);
      fresh = null;
    }
  }
  // a day of the 60: its date and weekday, 完成 N 项任务, the total; each added entry with its 科目, minutes, note, 删除
  const day = (x, i, anim) => h('article', { class: 'iw-bp-day' + (anim && i < 10 ? ' iw-bp__in' : ''), style: { '--i': Math.min(i, 9) + 4 } },
    h('header', { class: 'iw-bp-day__h' },
      h('b', { class: 'iw-bp-day__d' }, fmtMD(x.date)), h('span', { class: 'iw-bp-day__w' }, '周' + weekdayOf(x.date)),
      x.doneN ? h('span', { class: 'iw-bp-day__n' }, '完成 ' + x.doneN + ' 项任务') : null,
      h('span', { class: 'iw-bp-day__t' }, fmtDur(x.total))),
    x.entries.map((e) => {
      const k = MODULES[e.k] ? e.k : 'other';
      const row = h('div', { class: 'iw-bp-entry' + (e.id === fresh ? ' is-new' : ''), style: { '--c': MOD_C[k] } },
        h('span', { class: 'iw-bp-entry__k' }, MODULES[k]),
        Number(e.m) ? h('span', { class: 'iw-bp-entry__m' }, Number(e.m) + ' 分钟') : null,
        e.n ? h('span', { class: 'iw-bp-entry__n' }, String(e.n)) : h('span', { class: 'iw-bp-entry__n' }),
        delBtn(ctx, { id: 'lg-del-' + e.id, label: '删除这条补记', onDelete: (btn) => drop(e, x.date.slice(0, 7), btn) }));
      row.dataset.id = e.id == null ? '' : String(e.id);
      return row;
    }));
  function noData() {
    add.hidden = true; charts.hidden = true;
    const go = stickerBtn(ctx, { id: 'lg-today', cls: 'iw-bp-btn--add', label: '翻到今天的课', accept: () => ctx.go('today') });
    days.replaceChildren(emptyNote('这台设备上还没有你的学习数据。先在课本里开始学习（翻到「今天的课」做完开头的设置），学习日志就会记下来。', go));
  }

  function drop(e, ym, btn) {
    const r = deleteLog(ls, e.id, ym);
    if (!r.ok) { ctx.toast(r.reason === 'save' ? '没能保存：这台设备的存储空间可能满了。' : '没能删除，再试一次。', { kind: 'error' }); return; }
    ctx.sfx('ui_back'); ctx.toast('已删除。');
    const el = btn.closest('.iw-bp-entry');
    if (el) el.classList.add('is-gone');
    setTimeout(() => { render(false); ctx.focus(add); }, ctx.reduced ? 120 : 230);
  }

  // 补记一条: the sheet — 日期 (the last 60 days, not to come), 科目, 分钟 (− / +, 0–600), 备注, 记录
  function compose() {
    if (sh || gone || !readBlob(ls) || !today) return;
    ctx.sfx('ui_confirm');
    const d = S.draft || { d: today, k: 'vocab', m: '30', n: '' };
    const date = h('input', { class: 'iw-bp-in', type: 'date', min: addDays(today, -(LOG_DAYS - 1)), max: today, value: d.d });
    const min = h('input', { class: 'iw-bp-in iw-bp-in--num', type: 'number', inputmode: 'numeric', min: '0', max: String(LOG_MIN_MAX), step: '5', value: String(d.m), enterkeyhint: 'next' });
    const note = h('input', { class: 'iw-bp-in', maxlength: String(LOG_NOTE_MAX), placeholder: '比如：词汇量测试，结果 3200 词', autocomplete: 'off', enterkeyhint: 'done' });
    note.value = d.n;
    const step = (s) => { const v = Math.max(0, Math.min(LOG_MIN_MAX, (parseInt(min.value, 10) || 0) + s)); min.value = String(v); ctx.sfx('ui_click'); restartAnim(fM.row, 'is-tick'); };
    const less = stickerBtn(ctx, { id: 'lg-less', cls: 'iw-bp-btn--step', icon: MINUS_SVG, label: '', aria: '少 5 分钟', accept: () => step(-5) });
    const more = stickerBtn(ctx, { id: 'lg-more', cls: 'iw-bp-btn--step', icon: PLUS, label: '', aria: '多 5 分钟', accept: () => step(5) });
    const fD = field(ctx, { id: 'lg-f-d', label: '日期', input: date });
    const fM = field(ctx, { id: 'lg-f-m', label: '分钟', input: min, hint: '只写备注时填 0' });
    const fN = field(ctx, { id: 'lg-f-n', label: '备注', input: note, cls: 'is-wide' });
    const mins = h('div', { class: 'iw-bp-stepper' }, less, fM.row, more);
    const mods = chipRow(ctx, { name: 'lg-k', value: d.k, cls: 'is-grid', items: LOG_MODULES.map((k) => ({ id: k, label: MODULES[k], c: MOD_C[k] })) });
    const later = stickerBtn(ctx, { id: 'lg-later', cls: 'iw-bp-btn--ghost', label: '收起', accept: () => back() });
    const save = stickerBtn(ctx, { id: 'lg-save', cls: 'iw-bp-btn--go', icon: CHECK, label: '记录', accept: () => submit() });
    const body = h('div', { class: 'iw-bps__body' }, h('div', { class: 'iw-bps__chipset' }, h('div', { class: 'iw-bps__lab' }, '科目'), mods.el), h('div', { class: 'iw-bps__grid' }, fD.row, mins, fN.row));
    keep = () => { S.draft = { d: date.value, k: mods.value(), m: min.value, n: note.value }; };
    function back() { keep(); ctx.sfx('ui_back'); closeSheet(); }
    function closeSheet(then) { const s = sh; if (!s) return; keep = null; s.close(() => { if (sh === s) sh = null; if (then) then(); else ctx.focus(add); }); }
    function submit() {
      if (!sh || sh.busy) return;
      const g = { d: date.value, k: mods.value(), m: min.value, n: note.value };
      const now = todayOf(ls, ctx.now()), c = checkLog(g, now);
      if (!c.ok) {
        sh.msg(c.msg); sh.nope();
        (c.why === 'empty' ? min : c.why === 'date' || c.why === 'future' || c.why === 'old' ? date : note).focus();
        return;
      }
      if (again([c.d, c.k, c.m, c.n].join('|'), Date.now())) return;   // (a double tap, a second Enter)
      const entry = { id: uid(), d: c.d, k: c.k, m: c.m, n: c.n };
      const r = saveLog(ls, entry);
      if (!r.ok) {
        sh.msg(r.reason === 'save' ? '没能保存：这台设备的存储空间可能满了。' : r.reason === 'no-workbench' ? '这里没有你的课本数据，没存上。' : '没能保存，再试一次。');
        sh.nope(); return;
      }
      // the page keeps the day, the 科目 and the minutes for the next one; the note goes
      sh.busy = true; S.draft = { d: c.d, k: c.k, m: String(c.m), n: '' }; fresh = entry.id; today = now;
      ctx.sfx('ui_confirm'); ctx.burst(save, { count: 14, dist: 10, size: 1.2, ring: true });
      restartAnim(save, 'is-done');
      setTimeout(() => closeSheet(() => { render(false); ctx.toast(c.m ? '已记录。' : '已记下这条备注。', { kind: 'good' }); ctx.focus(add); }), ctx.reduced ? 120 : 260);
    }
    sh = sheet(ctx, { tape: '补记一条', kicker: 'ADD A DAY', cls: 'iw-bps--log', body, foot: [later, save], onBack: back });
    ownKeys(sh.el, { enter: (t) => { if (t === min) note.focus(); else submit(); }, esc: () => back() });
    ctx.focus(mods.chips.find((c) => c.classList.contains('is-on')) || save);
  }

  const onStore = (e) => { if (e.key === DATA_KEY) { invalidate(); render(false); } };
  addEventListener('storage', onStore);
  readBlob(ls, { fresh: true });
  render(true);   // (no blob: the line at once; else the charts wait for her clock)
  ielts().then(() => { if (gone) return; today = todayOf(ls, ctx.now()); render(true); }, (e) => { console.error('[book log]', e); });

  return {
    el: fr.el,
    flush() { if (keep) keep(); },
    onFocus(el, nav) { if (nav && fr.scroll.contains(el)) reveal(fr.scroll, el, ctx.reduced); },
    destroy() { gone = true; removeEventListener('storage', onStore); if (keep) keep(); if (sh) { sh.close(); sh = null; } },
  };
}
