// 关卡学习 I (docs/LEARN.md §17): the in-page half of tools/learn/portrait-audit.mjs. Defines window.__iwMeasure(scopes, back)
// — one measurement of what is on screen now, for a phone held upright (390 × 844, 1 css px = 1 pt):
//   targets   every visible tap target (button, [data-nav], input, textarea, a segment option) in the scopes: its box,
//             whether it is under 44 pt, partly off screen, or covered by something else at its centre (a tap there
//             would land on the other thing)
//   clipped   text cut off by its own box (overflow hidden / ellipsis and scrollWidth > clientWidth)
//   wrapped   a short label (≤ 12 characters) of a tap target broken over two lines
//   offscreen text or a target that sticks out of the viewport (not counting things inside a scroller, which are listed
//             under scrollers — reachable by scrolling)
//   back      the control named by `back` (the screen's way back): found, box, ≥ 44 pt, on screen
// scopes: CSS selectors (default: the open modal, else the menu screen). Pure DOM reads; changes nothing.
window.__iwMeasure = function (scopes, back) {
  // entrance animations (pop-ins, fades) to their end state first: the boxes she sees once the screen has settled
  for (const a of document.getAnimations()) { try { if (a.effect && a.effect.getComputedTiming().endTime !== Infinity) a.finish(); } catch (e) { /* infinite */ } }
  const vw = innerWidth, vh = innerHeight;
  const M = window.__inkwave && window.__inkwave.menus;
  let roots = [];
  if (scopes && scopes.length) for (const s of scopes) roots.push(...document.querySelectorAll(s));
  else roots = [(M && M._modal) || (M && M._scr && M._scr.el) || document.body];
  roots = roots.filter(Boolean);
  const styleOf = new Map();
  const cs = (el) => { let c = styleOf.get(el); if (!c) { c = getComputedStyle(el); styleOf.set(el, c); } return c; };
  const shown = (el) => {
    if (!el || !el.isConnected) return false;
    for (let p = el; p && p !== document.documentElement; p = p.parentElement) {
      const c = cs(p);
      if (c.display === 'none' || c.visibility === 'hidden' || +c.opacity < 0.05) return false;
    }
    const r = el.getBoundingClientRect();
    return r.width > 0.5 && r.height > 0.5;
  };
  const box = (r) => ({ x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) });
  const label = (el) => {
    const t = (el.getAttribute('aria-label') || el.textContent || el.value || el.placeholder || '').replace(/\s+/g, ' ').trim();
    return t.slice(0, 40) || '<' + el.tagName.toLowerCase() + '.' + String(el.className || '').split(' ').filter(Boolean).slice(0, 2).join('.') + '>';
  };
  const scroller = (el) => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const c = cs(p);
      if (/(auto|scroll)/.test(c.overflowY + c.overflowX) && (p.scrollHeight > p.clientHeight + 1 || p.scrollWidth > p.clientWidth + 1)) return p;
    }
    return null;
  };
  const out = { screen: M ? M.current : null, modal: !!(M && M._modal), gate: !!document.querySelector('.iw-touch-rotate.is-armed'), vw, vh,
    targets: [], small: [], covered: [], clipped: [], wrapped: [], offscreen: [], scrollers: [], back: null, minTarget: null };
  const seen = new Set();
  const TSEL = 'button, [data-nav], input, textarea, select, a[href], .iw-seg__opt, .iw-touch__btn';
  for (const root of roots) {
    const cands = [...(root.matches && root.matches(TSEL) ? [root] : []), ...root.querySelectorAll(TSEL)];
    for (const el of cands) {
      if (seen.has(el) || !shown(el)) continue;
      // a [data-nav] row that holds its own buttons (a settings row, a segmented control) is measured through those
      if (el.matches('[data-nav]') && !el.matches('button, input, textarea') && el.querySelector('button, .iw-seg__opt, input')) { seen.add(el); continue; }
      seen.add(el);
      const r = el.getBoundingClientRect(), b = box(r), name = label(el);
      const t = { name, ...b, small: r.width < 43.5 || r.height < 43.5, out: r.left < -1 || r.top < -1 || r.right > vw + 1 || r.bottom > vh + 1 };
      const sc = scroller(el);
      if (t.out && sc) { t.out = false; t.scroll = true; }
      const cx = Math.min(vw - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(vh - 1, Math.max(0, r.top + r.height / 2));
      const hit = document.elementFromPoint(cx, cy);
      if (hit && hit !== el && !el.contains(hit) && !hit.contains(el) && !t.scroll) t.covered = label(hit) + ' ' + String(hit.className || '').split(' ')[0];
      out.targets.push(t);
      if (t.small) out.small.push(t);
      if (t.covered) out.covered.push(t);
      if (t.out) out.offscreen.push({ kind: 'target', ...t });
      // a short label broken over two lines
      const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        const s = n.textContent.replace(/\s+/g, ' ').trim();
        if (!s || s.length > 12) continue;
        if (!shown(n.parentElement)) continue;
        const rg = document.createRange(); rg.selectNodeContents(n);
        const tops = new Set([...rg.getClientRects()].filter((q) => q.width > 0.5).map((q) => Math.round(q.top / 4)));
        if (tops.size > 1) out.wrapped.push({ text: s, in: name });
      }
    }
    // text cut off by its box, and text sticking out of the viewport
    for (const el of root.querySelectorAll('*')) {
      if (el.closest('svg') || !el.childNodes.length) continue;
      let txt = '';
      for (const n of el.childNodes) if (n.nodeType === 3) txt += n.textContent;
      txt = txt.replace(/\s+/g, ' ').trim();
      if (!txt || !shown(el)) continue;
      const c = cs(el);
      if ((c.overflowX !== 'visible' || c.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1) out.clipped.push({ text: txt.slice(0, 40), w: el.clientWidth, need: el.scrollWidth });
      const r = el.getBoundingClientRect();
      if (r.left < -1 || r.right > vw + 1 || r.top < -1 || r.bottom > vh + 1) {
        const sc = scroller(el);
        if (sc) continue;
        out.offscreen.push({ kind: 'text', text: txt.slice(0, 40), ...box(r) });
      }
    }
  }
  for (const root of roots) for (const el of [root, ...root.querySelectorAll('*')]) {
    if (!shown(el)) continue;
    const c = cs(el);
    if (/(auto|scroll)/.test(c.overflowY) && el.scrollHeight > el.clientHeight + 1) out.scrollers.push({ cls: String(el.className || '').split(' ')[0], ...box(el.getBoundingClientRect()), content: el.scrollHeight });
  }
  if (back) {
    const el = [...document.querySelectorAll(back)].find(shown);
    if (el) { const r = el.getBoundingClientRect(); out.back = { name: label(el), ...box(r), ok: r.width >= 43.5 && r.height >= 43.5 && r.left >= -1 && r.top >= -1 && r.right <= vw + 1 && r.bottom <= vh + 1 }; }
    else out.back = { found: false };
  }
  const m = out.targets.filter((x) => !x.scroll).sort((a, b) => Math.min(a.w, a.h) - Math.min(b.w, b.h))[0];
  out.minTarget = m ? { name: m.name, w: m.w, h: m.h } : null;
  return out;
};
// a tap point for the first shown element matching sel (its centre), or null
window.__iwCenter = function (sel) {
  const el = [...document.querySelectorAll(sel)].find((e) => { const r = e.getBoundingClientRect(); const c = getComputedStyle(e); return r.width > 0 && r.height > 0 && c.visibility !== 'hidden' && c.display !== 'none'; });
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
};
