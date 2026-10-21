// 题即玩法 play-7 — the landscape phone (docs/PLAY.md §8): what the top of the screen holds while a question is up, so
// nothing covers anything — the one place for the rules three stations and the boss share (CSS from JS, as the strip's).
//   · while she types (the strip carries `is-typing`: wire/type.js, runner/glide.js, arena/type.js) the strip moves off the
//     top centre to the top-left corner, over the split keyboard's left pad (keys.js splitLayout; PlayKeys sets
//     --iw-pk-side to the pad's inner edge), in as many lines as it needs: the clock keeps the top centre and the column
//     between the pads, from under the clock to the bottom of the screen, is the typewriter's (type/split.js). Before
//     play-7 the typing strip went up to the top edge in one line over the clock (play-fix, play-4: LEARN §22 / §23).
//   · the boss's HP bar and its phase strip go up into the top row either side of the clock, smaller (on a landscape
//     phone they stood under the clock, over the question strip and the 回声亭's board: LEARN §24 已知坑 1); while she
//     types in the boss fight the strip's corner starts under that row
//   · typingColumn(keys, H?) — the open column for type/split.js: the pads' inner edges, and its top under whatever stands
//     there on the screen (the clock row, the strip, the boss's bar, the runner's standings, the touch layer's top keys)
//   · hudBand(aspect, W, H) — a board's framing band (board/frame.js boardBand) whose top clears the same row: the boss's
//     回声亭 board (arena/host.js EchoStation) is framed under the HP bar, not behind it
//   · play-9: the HP bar and the phase strip stand clear of the clock as wide as it is now — the boss's clock says its
//     phase too (「R 阅读 · 词汇 · 语法 · 13:20」, 213 px; play-8's whole landscape 周考 saw both overlapped by it): a
//     ResizeObserver on the clock keeps --iw-clock-half (half its width) on the page's root; the two sit that far plus
//     8 px from the middle, never nearer than the 52 px they had
// Desktop (no max-height: 460px) keeps every position as it was; the split keyboard still opens the column there.
import { boardBand, frameBoard, keysBand } from './board/frame.js';
import { G } from '../../core/ctx.js';
import { safeInsets } from '../../ui/safe-area.js';

const CSS = `@media (max-height: 460px) and (orientation: landscape) {
  .iw-ps.is-typing .iw-ps__box { left: calc(var(--iw-sal, env(safe-area-inset-left)) + 8px) !important; right: auto !important; translate: none !important; top: 6px !important;
    width: max-content !important; max-width: max(150px, calc(var(--iw-pk-side, 300px) - var(--iw-sal, env(safe-area-inset-left)) - 14px)) !important; padding: 6px 12px !important; gap: 8px !important; border-radius: 16px !important; }
  .iw-ps.is-typing .iw-ps__box.is-enter { animation-name: iw-ps-in-l7; }
  @keyframes iw-ps-in-l7 { from { opacity: 0; translate: 0 -8px; } }
  .iw-ps.is-typing .iw-ps__play { display: none !important; }
  .iw-ps.is-typing .iw-ps__text { display: block !important; white-space: normal !important; }
  .iw-ps.is-typing.is-verdict .iw-ps__text { display: none !important; }
  .iw-ps.is-typing .iw-ps__q, .iw-ps.is-typing .iw-ps__head { font-size: 17px !important; }
  .iw-ps.is-typing .iw-ps__zh, .iw-ps.is-typing .iw-ps__why { font-size: 17px !important; white-space: normal !important; overflow: visible !important; text-overflow: clip !important; }
  .iw-ps.is-typing .iw-ps__acts { flex-wrap: wrap; }
  :root:has(.iw-hud .iw-bb:not(.is-off)) .iw-ps.is-typing .iw-ps__box { top: 44px !important; }
  .iw-hud.is-learn .iw-bb { --u: 4.4px; left: auto; right: calc(50% + max(52px, var(--iw-clock-half, 0px) + 8px)); translate: none; top: 3px; }
  .iw-hud.is-learn .iw-bb.is-intro { animation-name: iw-bb-in7; }
  @keyframes iw-bb-in7 { from { opacity: 0; translate: 0 -12px; scale: .7; } }
  .iw-hud.is-learn .iw-bb.is-gone { animation-name: iw-bb-gone7; }
  @keyframes iw-bb-gone7 { to { opacity: 0; translate: 0 -10px; scale: .9; } }
  .iw-lf__phase { left: calc(50% + max(52px, var(--iw-clock-half, 0px) + 8px)); translate: none; top: 7px; padding: 4px 6px; gap: 4px; font-size: 12px; }
  .iw-lf__phase span { padding: 3px 7px; }
}`;
let cssDone = false;
export function ensureLandscapeCss() {
  if (cssDone || typeof document === 'undefined') return;
  cssDone = true;
  const el = document.createElement('style'); el.id = 'iw-play-landscape-css'; el.textContent = CSS; document.head.appendChild(el);
  watchClock();
}
// (play-9) a landscape phone: the media query the CSS above is for (one MediaQueryList, read per frame without allocating)
let mq = null;
export function landscapePhone() {
  if (typeof matchMedia === 'undefined') return false;
  return (mq || (mq = matchMedia('(max-height: 460px) and (orientation: landscape)'))).matches;
}
// (play-9) the clock's half width on the root, whenever its text changes its size — never per frame: the observer calls
// back only on a change of size
let clockSeen = null;
export function watchClock() {
  if (typeof document === 'undefined' || typeof ResizeObserver === 'undefined') return;
  const el = document.querySelector('.iw-hud__top .iw-timer'); if (!el || el === clockSeen) return;
  clockSeen = el;
  const set = () => { const w = el.getBoundingClientRect().width; if (w > 0) document.documentElement.style.setProperty('--iw-clock-half', Math.ceil(w / 2) + 'px'); };
  new ResizeObserver(set).observe(el);
  set();
}

// what may stand at the top of the column (each only while it is on the screen)
const ROW_SEL = ['.iw-ps:not(.is-off) .iw-ps__box', '.iw-hud__top', '.iw-bb:not(.is-off)', '.iw-lf:not(.is-off) .iw-lf__phase', '.iw-lf:not(.is-off) .iw-lf__rank'];
const KEY_SEL = ['.iw-touch__btn'], TOP_SEL = [...ROW_SEL, ...KEY_SEL];
function topOver(x0, x1, H, floor = 0, sels = TOP_SEL) {
  let top = floor;
  if (typeof document === 'undefined') return top;
  for (const sel of sels) for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect();
    if (!(r.width > 0 && r.height > 0) || r.top > H * 0.45 || r.right <= x0 || r.left >= x1) continue;
    if (getComputedStyle(el).visibility === 'hidden' || +getComputedStyle(el).opacity < 0.05) continue;
    top = Math.max(top, r.bottom + 4);
  }
  return Math.round(top);
}

/** the split keyboard's open column, for type/split.js splitFrame: { W, H, top, bottom, x0, x1, shelf } — or null when the
 *  keyboard is not split (portrait: the stations keep frame.js's band) */
export function typingColumn(keys) {
  const r = keys && keys.rect ? keys.rect() : null;
  if (!r || !r.split || !r.mid || typeof innerWidth === 'undefined') return null;
  const W = innerWidth, H = innerHeight, { x0, x1 } = r.mid;
  return { W, H, top: topOver(x0, x1, H, 0), bottom: H, x0, x1, shelf: r.top };
}

/** a board's framing band under the top row (the middle 70 % of the screen: where a framed board stands); with the board
 *  ({ w, h, bottom }: what walk.js frames — play-9) the touch layer's top-row keys count only where they would stand over
 *  the board's text: on a landscape phone ⏸ and 加油 hang in the top right (844 × 390: x 672–760, y 39–82) — inside that
 *  70 % — and pushed the boss's 回声亭 board down under them, its text under 17 px (LEARN §28). Framed under the clock row
 *  the board stands clear of them (844: x 222–621); on a 667 × 375 phone ⏸ reaches 5 px past the board's margin at its
 *  top-right corner — over its rim, not its text: let be (pushed under it, the text would be 16.8 px) */
const BOARD_PAD = 54 / 1024;   // (board/paint.js BOARD.pad / BOARD.W: the margin round a board's text, of its width)
export function hudBand(aspect, W, H, board = null) {
  const b = boardBand(aspect, W, H);
  if (!board) return { ...b, top: Math.max(b.top, topOver(W * 0.15, W * 0.85, H, 0) + 2) };
  let band = { ...b, top: Math.max(b.top, topOver(W * 0.15, W * 0.85, H, 0, ROW_SEL) + 2) };
  for (let k = 0; k < 3; k++) {
    const r = frameBoard(board, aspect, { W, H, band }).rect, pad = r.w * BOARD_PAD + 8;
    const t = topOver(r.x + pad, r.x + r.w - pad, H, 0, KEY_SEL) + 2;
    if (t <= band.top || t <= r.y + pad) break;
    band = { ...band, top: t };
  }
  return band;
}

/** LEARN §48: the band a framed board fills while the HUD shows its keys (board/frame.js keysBand), on this screen now — the
 *  safe area, and on a phone turned what the touch layer's live keys reach in from the right edge */
export function keysBandNow(aspect, W, H) {
  const T = G.touch;
  let reach = 0;
  if (aspect >= 1 && T && T.enabled) for (const b of T.buttons) if (!b.off) reach = Math.max(reach, W - (b.cx - b.r));
  return keysBand(aspect, W, H, { ...safeInsets(), reach: Math.ceil(reach) });
}
