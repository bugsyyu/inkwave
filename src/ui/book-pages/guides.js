// src/ui/book-pages/guides.js — 学习方法 (with its 资源), a page of the 课本 the game draws itself (游戏为主体 第三期第三步,
// docs/LEARN.md §45). The lesson page's 学习方法 (app/index.html mountGuides / guideHTML / refreshGuides / toggleFlag /
// copyText) and 资源 (mountResources), same text, same data, the game's look: a row of sticker tabs — the page's eight and
// 资源 —, under it the tab's text as the page fills it (src/learn/guides.js fillGuide: the same string), its parts drawn as
// stickers — a score table in its own sideways scroller, the 错误原因 as chips, a prompt box with 「复制这段指令」 (the
// exact PROMPTS text; in the App too: copyText's way), the 语法清单 (已学完 n / 16, each one a check that writes her account:
// toggleFlag('grammar', i)). 资源: groups of name / address / why, links open outside the game (target=_blank: Safari in
// the App), never in its own window. Only the exported tables go in as markup (they are the page's own); her data only
// gives numbers. Which tab: kept for the session (the page's S.guide); first 考试概览; from 'resources' it opens on 资源.
import { h, restartAnim } from '../ui-util.js';
import { GLYPHS } from '../ui-icons.js';
import { ielts } from '../../learn/ielts.js';
import { readBlob, invalidate, DATA_KEY } from '../../learn/workbench.js';
import { loadGuides, guideProfile, fillGuide, grammarView, doneText, toggleGrammar } from '../../learn/guides.js';
import { todayOf } from '../../learn/notes.js';
import { pageFrame, stickerBtn, ownKeys, emptyNote, sheet, CHECK } from './kit.js';

// a sticker colour per tab (the bookmark's lime first)
export const TAB_C = { overview: '#c6f432', vocab: '#ffd21a', grammar: '#5cc8ff', pron: '#a98bff', listening: '#3ddc97', reading: '#ff9e7a', writing: '#ff5f8f', speaking: '#ff8a14', resources: '#d7d0e8' };
export const RES = 'resources';
const LINK_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"/></svg>';
// the tab she was on (S.tab, 资源 too) and the last of the eight (S.guide: 学习方法's own bookmark comes back to it)
const S = { tab: null, guide: 'overview' };
const COPIED = '已复制，粘贴到和 Claude 的对话里就能用。';
const inApp = () => { try { return /[?&]from=app(&|$)/.test(location.search) || !!(window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.ielts); } catch (e) { return false; } };

// copyText(text) → Promise<'copied' | 'manual'>: the lesson page's copyText — the clipboard, else a hidden field and the
// copy command (WKWebView), else the text in a sheet to copy by hand. The menus' focus comes back to `back`.
export async function copyText(ctx, text, back) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(text); ctx.toast(COPIED, { kind: 'good' }); return 'copied'; }
  } catch (e) { /* fall through */ }
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.style.position = 'fixed'; ta.style.top = '0'; ta.style.opacity = '0'; ta.style.fontSize = '16px';
  document.body.appendChild(ta);
  ta.select();
  try { ta.setSelectionRange(0, ta.value.length); } catch (e) { /* iOS selects only with this */ }
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  if (back) ctx.focus(back);
  if (ok) { ctx.toast(COPIED, { kind: 'good' }); return 'copied'; }
  copyBox(ctx, text, back);
  return 'manual';
}
// 请手动复制 (showCopyBox): the text selected in a field of a sheet
function copyBox(ctx, text, back) {
  const box = h('textarea', { class: 'iw-bp-in iw-bg-copybox', readonly: '', 'aria-label': '手动复制' });
  box.value = text;
  const done = stickerBtn(ctx, { id: 'gd-copy-ok', cls: 'iw-bp-btn--go', icon: CHECK, label: '好了', accept: () => close() });
  const body = h('div', { class: 'iw-bps__body' }, h('p', { class: 'iw-bg-copynote' }, inApp() ? '这里没能自动复制。长按下面的文字，选"全选"，再选"拷贝"。' : '这个浏览器不让网页自动复制。长按下面的文字，选"全选"，再选"拷贝"（电脑上按 Ctrl+C）。'), box);
  const sh = sheet(ctx, { tape: '请手动复制', kicker: 'COPY', cls: 'iw-bps--copy', body, foot: [done], onBack: () => close() });
  ownKeys(sh.el, { esc: () => close() });   // (⌘C / Ctrl+C there is hers, not the game's)
  function close() { sh.close(() => { if (back) ctx.focus(back); }); }
  ctx.focus(done);
  setTimeout(() => { try { box.focus({ preventScroll: true }); box.select(); box.setSelectionRange(0, box.value.length); } catch (e) { /* ignore */ } }, 60);
}

export function mount(host, ctx, view) {
  const ls = ctx.ls;
  let gone = false, T = null, Host = null, cur = null, art = null, swapT = 0;
  const fr = pageFrame({ cls: 'iw-bp--guides', kicker: 'HOW TO LEARN', title: '学习方法', lead: ' ' });
  const lead = fr.head.querySelector('.iw-bp__lead');
  host.appendChild(fr.el);
  const en = h('p', { class: 'iw-bg-en', lang: 'en' }), zh = h('p', { class: 'iw-bg-zh' });
  fr.head.append(h('div', { class: 'iw-bg-stage' }, en, zh));

  // the tabs: the page's eight and 资源; they stay at the top of the leaf as it scrolls
  const tabs = h('div', { class: 'iw-bp-tabs iw-bg-tabs', role: 'tablist', 'aria-label': '学习方法' });
  const bar = h('div', { class: 'iw-bg-bar iw-bp__in', style: { '--i': 1 } }, tabs);
  const stage = h('div', { class: 'iw-bg-stagebox' });
  fr.body.append(bar, stage);
  let tabEls = [];
  const wait = h('p', { class: 'iw-bp-muted iw-bg-wait' }, '翻开学习方法……');
  stage.appendChild(wait);

  // her profile (the guides read her hours, her dates, her target and her 语法清单) — read when the page opens and after a write
  const profile = () => { const b = readBlob(ls); return guideProfile(b ? b.o.profile : null, todayOf(ls, ctx.now()), T.profile); };

  function build(id) {
    const a = h('article', { class: 'iw-bg-art' + (id === RES ? ' iw-bg-art--res' : ''), role: 'tabpanel', 'aria-label': id === RES ? '资源' : (T.tabs.find((t) => t[0] === id) || [, ''])[1], style: { '--c': TAB_C[id] } });
    if (id === RES) resources(a); else guide(a, id);
    // layered: the first blocks come in one after another (the rest are below the fold)
    let i = 0;
    for (const n of a.children) { if (i > 9) break; n.classList.add('iw-bp__in'); n.style.setProperty('--i', i++); }
    return a;
  }

  // a guide: the page's own string, then its parts drawn as the game's
  function guide(a, id) {
    const p = profile();
    a.innerHTML = fillGuide(id, p, T, Host);   // (GUIDES: the lesson page's text, exported — never her words)
    a.querySelectorAll('.table-wrap').forEach((w) => { w.className = 'iw-bg-table'; });
    a.querySelectorAll('.chips').forEach((c) => {
      c.className = 'iw-bg-chips';
      [...c.children].forEach((s, i) => { s.className = 'iw-bg-chip'; s.style.setProperty('--r', (((i * 7) % 5) - 2) * 0.8 + 'deg'); });
    });
    a.querySelectorAll('.prompt').forEach((box) => {
      const k = ((box.querySelector('textarea') || {}).id || '').replace(/^pr-/, '');
      box.replaceWith(prompt(k));
    });
    const list = a.querySelector('#grammar-list');
    if (list) {
      const head = list.previousElementSibling && list.previousElementSibling.querySelector('#grammar-count') ? list.previousElementSibling : null;
      const g = checklist(p);
      if (head) head.remove();
      list.replaceWith(g);
    }
    // a link in the text: to another page of the 课本 by the book; out of the game in a new window, never in its own
    a.querySelectorAll('a[href]').forEach((l, i) => {
      const href = l.getAttribute('href') || '';
      if (href[0] === '#') { ctx.bind(l, { id: 'gd-in-' + i, accept: () => ctx.go(href.slice(1)) }); l.addEventListener('click', (e) => e.preventDefault()); return; }
      outLink(l, 'gd-out-' + i);
    });
  }
  function outLink(l, id) {
    l.target = '_blank'; l.rel = 'noopener noreferrer';
    // (a tap opens it itself; the pad / keys press it)
    ctx.bind(l, { id, accept: (src) => { if (src !== 'mouse') l.click(); } });
  }

  // a prompt to copy: the exact PROMPTS text, in a box that scrolls, and the sticker button
  function prompt(k) {
    const text = T.prompts[k] || '';
    const t = h('pre', { class: 'iw-bg-prompt__t', tabindex: '-1' });
    t.textContent = text;
    const btn = stickerBtn(ctx, { id: 'gd-copy-' + k, cls: 'iw-bp-btn--go iw-bg-copy', icon: GLYPHS.copy, label: '复制这段指令', accept: () => copy() });
    const label = btn.querySelector('.iw-bp-btn__t');
    let t0 = 0;
    async function copy() {
      ctx.sfx('ui_confirm');
      const how = await copyText(ctx, text, btn);
      if (gone || how !== 'copied') return;
      restartAnim(btn, 'is-done');
      if (!ctx.reduced) ctx.burst(btn, { count: 12, dist: 9, size: 1.1, ring: true });
      btn.classList.add('is-copied'); label.textContent = '已复制';
      clearTimeout(t0); t0 = setTimeout(() => { btn.classList.remove('is-copied'); label.textContent = '复制这段指令'; }, 1800);
    }
    return h('div', { class: 'iw-bg-prompt' }, h('small', { class: 'iw-bg-prompt__k' }, 'PROMPT'), t, btn);
  }

  // 语法清单: 已学完 n / 16 and a check per point; a tap writes her account (every tap switches it; what shows is stored)
  let gl = null;
  function checklist(p) {
    const has = !!readBlob(ls);
    const v = grammarView(p.grammar, T);
    const count = h('b', { class: 'iw-bg-count__n' }, doneText(v));
    const fill = h('i', { class: 'iw-bg-count__fill' });
    const items = v.items.map((x) => {
      const b = h('button', { class: 'iw-bg-check' + (x.on ? ' is-on' : ''), role: 'checkbox', 'aria-checked': String(x.on), style: { '--i': x.i } },
        h('span', { class: 'iw-bg-check__box', html: GLYPHS.check }),
        h('span', { class: 'iw-bg-check__t' }, h('b', null, (x.i + 1) + '. ' + x.title), h('span', null, x.desc)));
      ctx.bind(b, { id: 'gd-g-' + x.i, accept: () => flip(x.i, b) });
      return b;
    });
    const none = has ? null : emptyNote('这台设备上还没有你的学习数据。先在课本里开始学习（翻到「今天的课」做完开头的设置），学完一项就能在这里勾上。',
      stickerBtn(ctx, { id: 'gd-today', cls: 'iw-bp-btn--add', label: '翻到今天的课', accept: () => ctx.go('today') }));
    const el = h('section', { class: 'iw-bg-gram' + (has ? '' : ' is-off') },
      h('div', { class: 'iw-bg-count' }, h('span', null, '已学完 '), count, h('span', { class: 'iw-bg-count__t' }, fill)), none, h('div', { class: 'iw-bg-checks' }, items));
    gl = { el, count, fill, items };
    paintCount(v);
    return el;
  }
  function paintCount(v) { gl.count.textContent = doneText(v); gl.fill.style.setProperty('--w', (v.total ? v.done / v.total : 0).toFixed(4)); }
  function paintChecks(pop) {
    if (!gl || !gl.el.isConnected) return;
    const v = grammarView(profile().grammar, T);
    v.items.forEach((x) => { const b = gl.items[x.i]; b.classList.toggle('is-on', x.on); b.setAttribute('aria-checked', String(x.on)); });
    paintCount(v);
    if (pop) restartAnim(gl.count, 'is-pop');
  }
  function flip(i, b) {
    if (!readBlob(ls, { fresh: true })) { ctx.sfx('ui_error'); ctx.toast('先在课本里开始学习（翻到「今天的课」做完开头的设置），学完一项再来勾。'); return; }
    const r = toggleGrammar(ls, i, T.grammar.length);
    if (!r.ok) { ctx.sfx('ui_error'); ctx.toast(r.reason === 'save' ? '没能保存：这台设备的存储空间可能满了。' : '没能保存，再试一次。', { kind: 'error' }); return; }
    paintChecks(true);
    ctx.sfx(r.on ? 'ui_confirm' : 'ui_toggle');
    if (!ctx.reduced) { restartAnim(b, r.on ? 'is-tick' : 'is-untick'); if (r.on) ctx.burst(b.firstChild, { count: 8, dist: 6, size: 0.9 }); }
  }

  // 资源: the page's lead, then each group a panel; a name with an address is a link out of the game
  function resources(a) {
    a.appendChild(h('p', { class: 'iw-bg-reslead' }, T.pages.resources.lead));
    T.resources.forEach((g, gi) => {
      const rows = g.items.map((r, ri) => {
        const name = r.u ? h('a', { class: 'iw-bg-res__n', href: r.u }, h('b', null, r.n), h('i', { class: 'iw-bg-res__go', html: LINK_SVG })) : h('b', { class: 'iw-bg-res__n' }, r.n);
        if (r.u) outLink(name, 'gd-r-' + gi + '-' + ri);
        return h('div', { class: 'iw-bg-res' }, name, r.u ? h('span', { class: 'iw-bg-res__u', lang: 'en' }, r.u.replace(/^https?:\/\//, '')) : null, h('p', { class: 'iw-bg-res__d' }, r.d));
      });
      a.appendChild(h('section', { class: 'iw-bg-group', style: { '--c': Object.values(TAB_C)[gi % 8] } }, h('h3', { class: 'iw-bg-group__h' }, g.g), rows));
    });
  }

  // a tab: the old text fades out where it stands (out of the flow: nothing jumps), the new one comes in layered
  function pick(id, by) {
    if (gone || !T || id === cur) return;
    cur = id; S.tab = id; if (id !== RES) S.guide = id;
    tabEls.forEach((b) => { const on = b.dataset.t === id; b.classList.toggle('is-on', on); b.setAttribute('aria-selected', String(on)); });
    const on = tabEls.find((b) => b.dataset.t === id);
    if (on && tabs.scrollTo) tabs.scrollTo({ left: Math.max(0, on.offsetLeft + on.offsetWidth / 2 - tabs.clientWidth / 2), behavior: ctx.reduced ? 'auto' : 'smooth' });
    const head = id === RES ? T.pages.resources : T.pages.guides;
    fr.head.querySelector('.iw-bp__title').textContent = head.stage[2];
    fr.head.querySelector('.iw-bp__kicker').textContent = id === RES ? 'LIBRARY' : 'HOW TO LEARN';
    lead.textContent = id === RES ? '' : head.lead;
    en.textContent = head.stage[3]; zh.textContent = head.stage[4];
    const old = art;
    gl = null;
    art = build(id);
    if (old) {
      // (the tabs stay where they are: the leaf scrolls back only when the tabs had gone up under its top)
      const hid = -parseFloat(getComputedStyle(bar).top) || 0;   // (the bar sticks with its top padding above the leaf)
      const top = stage.offsetTop - (bar.offsetHeight - hid) - parseFloat(getComputedStyle(bar).marginBottom || 0);
      if (fr.scroll.scrollTop > top) fr.scroll.scrollTop = top;
      old.style.top = old.offsetTop + 'px';
      old.classList.add('is-leaving');
      clearTimeout(swapT);
      swapT = setTimeout(() => old.remove(), ctx.reduced ? 160 : 220);
    }
    stage.appendChild(art);
    if (by) ctx.sfx('ui_toggle');
  }

  function ready() {
    if (gone) return;
    wait.remove();
    tabEls = T.tabs.map(([id, label]) => [id, label]).concat([[RES, '资源']]).map(([id, label], i) => {
      const b = h('button', { class: 'iw-bp-tab iw-bg-tab', role: 'tab', style: { '--c': TAB_C[id], '--i': i } }, h('b', null, label));
      b.dataset.t = id;
      ctx.bind(b, { id: 'gd-t-' + id, accept: () => pick(id, true) });
      return b;
    });
    tabs.append(...tabEls);
    pick(view === RES ? RES : S.tab || 'overview');
  }

  // the lesson page in the book wrote her blob: read it again (the 语法清单 shows what is stored)
  const onStore = (e) => { if (e.key === DATA_KEY) { invalidate(); paintChecks(false); } };
  addEventListener('storage', onStore);
  readBlob(ls, { fresh: true });
  Promise.all([loadGuides(), ielts()]).then(([t, I]) => { T = t; Host = I.Host; ready(); }, (e) => {
    console.error('[guides]', e);
    if (!gone) wait.replaceWith(emptyNote('学习方法没能打开。合上课本再翻开试一次。'));
  });

  return {
    el: fr.el,
    // the book turned to 学习方法 or 资源 while this page is up (ielts:go resources, the bookmark): switch here
    show(v) { pick(v === RES ? RES : S.guide); },
    flush() {},
    onFocus(el, nav) {
      if (!nav) return;
      if (tabs.contains(el) && tabs.scrollTo) tabs.scrollTo({ left: Math.max(0, el.offsetLeft + el.offsetWidth / 2 - tabs.clientWidth / 2), behavior: ctx.reduced ? 'auto' : 'smooth' });
      else if (fr.scroll.contains(el)) {
        // (into view below the tabs, which stay at the top of the leaf)
        const r = el.getBoundingClientRect(), s = fr.scroll.getBoundingClientRect(), top = s.top + bar.offsetHeight + 12;
        if (r.top < top || r.bottom > s.bottom - 16) fr.scroll.scrollBy({ top: r.top - top - (s.bottom - top) * 0.3, behavior: ctx.reduced ? 'auto' : 'smooth' });
      }
    },
    destroy() { gone = true; clearTimeout(swapT); removeEventListener('storage', onStore); },
  };
}
