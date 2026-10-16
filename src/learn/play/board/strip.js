// 展板路 M6 — the reading strip (docs/PLAY.md §3 M6): a board's whole text when it is longer than the board (the
// 200-character lesson note, a reading passage, the echo booth's sample). Not a card and not a panel: it sits in the
// lower half, scrolls, takes touches only on itself, never pauses or holds anything — the world runs on and she stands
// at the board. It opens from the board's 「读全文」 hotspot and closes on ✕ or when she walks on; it never opens while a
// question is up (blocked = true closes it and refuses to open).
//
//   const S = new ReadStrip(root, { ink })     root: #ui-root (styles from JS, as forms/ui.js)
//   S.open({ kicker, title, blocks }) → bool   blocks: [{ t: 'p' | 'en' | 'ex' | 'li' | 'tip' | 'label' | 'q' | 'gloss', … }]
//   S.close() · S.isOpen · S.blocked · S.onClose · S.dispose()
//   ReadStrip.owns(e)                          a pointer event on a strip: touch.js lets it be (scroll, ✕), as PlayKeys.owns
const CSS = `
.iw-read { position: absolute; inset: 0; pointer-events: none; z-index: 16; color: #fff; --self: #ff8a14;
  font-family: 'Rubik', system-ui, -apple-system, 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', 'WenQuanYi Zen Hei', 'Microsoft YaHei', sans-serif; -webkit-font-smoothing: antialiased; }
.iw-read.is-off { display: none; }
.iw-read * { box-sizing: border-box; }
.iw-read__box { pointer-events: auto; position: absolute; left: 50%; bottom: calc(10px + env(safe-area-inset-bottom)); translate: -50% 0; width: min(640px, calc(100vw - 32px));
  max-height: min(52vh, 460px); display: flex; flex-direction: column; border-radius: 22px; background: rgba(14, 12, 22, .9);
  border: 1.5px solid rgba(255, 255, 255, .14); border-top: 3px solid var(--self); box-shadow: 0 -6px 28px rgba(0, 0, 0, .35); touch-action: pan-y; }
.iw-read__box.is-enter { animation: iw-read-in .4s cubic-bezier(.34, 1.56, .64, 1) backwards; }
@keyframes iw-read-in { from { opacity: 0; translate: -50% 40px; } }
.iw-read__head { display: flex; align-items: center; gap: 10px; padding: 8px 8px 6px 18px; }
.iw-read__titles { flex: 1 1 auto; min-width: 0; }
.iw-read__kicker { display: block; font-size: 13px; font-weight: 700; letter-spacing: .06em; color: #a9a3b8; }
.iw-read__title { display: block; font-size: 19px; font-weight: 800; line-height: 1.3; overflow-wrap: anywhere; }
.iw-read__x { flex: 0 0 auto; width: 44px; height: 44px; border-radius: 50%; border: 0; background: rgba(255, 255, 255, .12); color: #fff; font: 800 20px/44px Rubik, system-ui, sans-serif; cursor: pointer; padding: 0; -webkit-tap-highlight-color: transparent; }
.iw-read__x:focus-visible { outline: 3px solid #fff; outline-offset: 2px; }
.iw-read__body { overflow-y: auto; -webkit-overflow-scrolling: touch; overscroll-behavior: contain; padding: 2px 18px 16px; display: flex; flex-direction: column; gap: 10px; font-size: 17px; line-height: 1.62; }
.iw-read__p { margin: 0; color: #ece8f6; }
.iw-read__en { margin: 0; font-size: 18px; font-weight: 600; color: #fff; }
.iw-read__label { margin: 4px 0 -4px; font-size: 15px; font-weight: 800; color: var(--self); letter-spacing: .04em; }
.iw-read__q { margin: 0; font-size: 19px; font-weight: 800; }
.iw-read__q small { display: block; font-size: 17px; font-weight: 600; color: #c3bdd6; }
.iw-read__li { margin: 0; padding-left: 18px; position: relative; }
.iw-read__li::before { content: ''; position: absolute; left: 2px; top: .65em; width: 8px; height: 8px; border-radius: 50%; background: var(--self); }
.iw-read__li small { display: block; color: #c3bdd6; font-size: 17px; }
.iw-read__ex { margin: 0; padding: 8px 12px; border-radius: 12px; background: rgba(255, 255, 255, .07); font-weight: 700; }
.iw-read__ex small { display: block; font-weight: 500; color: #c3bdd6; font-size: 17px; }
.iw-read__tip { margin: 0; padding: 8px 12px; border-radius: 12px; background: rgba(255, 255, 255, .06); color: #ddd8ea; }
.iw-read__gloss { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 2px 14px; }
.iw-read__gloss b { font-weight: 700; } .iw-read__gloss span { color: #c3bdd6; }
@media (orientation: portrait) and (max-width: 640px) { .iw-read__box { left: 10px; right: 10px; width: auto; translate: none; max-height: 48vh; } .iw-read__box.is-enter { animation-name: iw-read-up; } @keyframes iw-read-up { from { opacity: 0; translate: 0 40px; } } }
@media (prefers-reduced-motion: reduce) { .iw-read__box.is-enter { animation: none; } }
`;
let cssDone = false;
function ensureCss() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const s = document.createElement('style'); s.id = 'iw-read-css'; s.textContent = CSS; document.head.appendChild(s);
}
function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

export class ReadStrip {
  constructor(root, o = {}) {
    this.isOpen = false; this._blocked = false; this.onClose = null;
    if (typeof document === 'undefined' || !root) { this.el = null; return; }
    ensureCss();
    this.kicker = el('span', 'iw-read__kicker'); this.title = el('span', 'iw-read__title');
    this.x = el('button', 'iw-read__x', '✕'); this.x.type = 'button'; this.x.setAttribute('aria-label', '收起');
    this.x.addEventListener('click', () => this.close());
    this.body = el('div', 'iw-read__body');
    const titles = el('div', 'iw-read__titles'); titles.append(this.kicker, this.title);
    const head = el('div', 'iw-read__head'); head.append(titles, this.x);
    this.box = el('div', 'iw-read__box'); this.box.setAttribute('role', 'region'); this.box.setAttribute('aria-label', '全文');
    this.box.append(head, this.body);
    this.el = el('div', 'iw-read is-off'); this.el.setAttribute('aria-hidden', 'true'); this.el.append(this.box);
    this.el.style.setProperty('--self', o.ink || '#ff8a14');
    root.appendChild(this.el);
  }
  static owns(e) { const t = e && e.target; return !!(t && t.closest && t.closest('.iw-read__box')); }
  setInk(hex) { this.el?.style.setProperty('--self', hex); }
  get blocked() { return this._blocked; }
  set blocked(on) { this._blocked = !!on; if (on) this.close(); }

  open({ kicker = '', title = '', blocks = [] } = {}) {
    if (this._blocked) return false;
    if (!this.el) { this.isOpen = true; return true; }
    this.kicker.textContent = kicker; this.title.textContent = title;
    this.body.textContent = '';
    for (const b of blocks) this.body.append(this._block(b));
    this.body.scrollTop = 0;
    this.el.classList.remove('is-off'); this.el.setAttribute('aria-hidden', 'false');
    this.box.classList.remove('is-enter'); void this.box.offsetWidth; this.box.classList.add('is-enter');
    this.isOpen = true;
    return true;
  }
  _block(b) {
    switch (b.t) {
      case 'en': return el('p', 'iw-read__en', b.text);
      case 'label': return el('p', 'iw-read__label', b.text);
      case 'tip': return el('p', 'iw-read__tip', '提示：' + b.text);
      case 'q': { const p = el('p', 'iw-read__q', b.en); if (b.zh) p.append(el('small', null, b.zh)); return p; }
      case 'ex': { const p = el('p', 'iw-read__ex', b.en); if (b.zh) p.append(el('small', null, b.zh)); return p; }
      case 'li': { const p = el('p', 'iw-read__li', b.text); if (b.sub) p.append(el('small', null, b.sub)); return p; }
      case 'gloss': { const g = el('dl', 'iw-read__gloss'); for (const [a, z] of b.rows || []) g.append(el('b', null, a), el('span', null, z)); return g; }
      default: return el('p', 'iw-read__p', b.text);
    }
  }
  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    if (this.el) { this.el.classList.add('is-off'); this.el.setAttribute('aria-hidden', 'true'); }
    this.onClose?.();
  }
  dispose() { this.close(); this.el?.remove(); }
}
