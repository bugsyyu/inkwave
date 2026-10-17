// 题即玩法 play-7 — what the browser audits measure while she types (wire-audit.mjs, runner-drive.js, arena-audit.mjs),
// in the page: the typewriter as the live camera sees it (the rig's own points through its world matrix — not the frame
// search's numbers), and what stands at the top of the screen.
//   typeCheck({ root, camera, keys }) → {
//     split           the keyboard is the landscape split (PlayKeys.rect())
//     rig: [y0, y1], xs: [x0, x1], h   the typewriter's span on the screen: the key plate's front edge to the top of the
//                     sheet (type/split.js SPLIT_PTS — the plate, the strike point, the line being typed and the one above,
//                     the first letter after ten, the sheet's top corners), px
//     glyph           a typed letter's size: one em of the line being typed (split.js GLYPH_EM: 0.16 m on the sheet at the
//                     strike column — the atlas draws Titan One at 0.78 of a 0.205 m glyph cell) projected, px
//     head, row, headBelowRow    her head and the keys' middle row (y px): the head lower on the screen
//     onPads          rig points that fall on either keyboard pad (split) — must be none
//     rects           { strip, clock, bar, phase } on the screen (null when not shown) and overlaps: [[a, b], …] between
//                     them and with the typewriter's box ('rig')
//   }
export async function typeCheck({ root, camera, keys }) {
  const base = new URL('../../src/learn/play/type/', import.meta.url).href;
  const SP = await import(base + 'split.js'), FR = await import(base + 'frame.js');
  const V3 = camera.position.constructor, W = innerWidth, H = innerHeight;
  root.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  const P = (p) => { const v = new V3(p[0], p[1], p[2]).applyMatrix4(root.matrixWorld).project(camera); return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H, v.z]; };
  const pts = SP.SPLIT_PTS.map(P), ys = pts.map((q) => q[1]), xs = pts.map((q) => q[0]);
  const g = SP.GLYPH_EM.map(P), head = P(FR.RIG_POINTS.head), row = P(FR.RIG_POINTS.midRow);
  const kr = keys && keys.rect ? keys.rect() : null, split = !!(kr && kr.split);
  const inside = (q, r) => q[0] > r.x + 1 && q[0] < r.x + r.w - 1 && q[1] > r.y + 1 && q[1] < r.y + r.h - 1;
  const onPads = split ? pts.filter((q) => kr.halves.some((r) => inside(q, r))).map((q) => q.map(Math.round)) : [];
  // (opacity is not a test here: the strip's slide-in is a CSS animation on wall time and the audits freeze the game's
  // clock — a strip caught at the start of it reads as see-through though it is about to stand there)
  const box = (sel) => {
    const el = document.querySelector(sel); if (!el) return null;
    const cs = getComputedStyle(el); if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    const b = el.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height) } : null;
  };
  const rects = {
    strip: box('.iw-ps:not(.is-off) .iw-ps__box'), clock: box('.iw-hud__top .iw-timer'),
    bar: box('.iw-bb:not(.is-off)'), phase: document.querySelector('.iw-lf:not(.is-off) .iw-lf__phase:not(:empty)') ? box('.iw-lf:not(.is-off) .iw-lf__phase') : null,
  };
  const rig = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  const hit = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const all = { ...rects, rig }, names = Object.keys(all), overlaps = [];
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) if (hit(all[names[i]], all[names[j]])) overlaps.push([names[i], names[j]]);
  return {
    split, rig: [Math.round(rig.y), Math.round(rig.y + rig.h)], xs: [Math.round(rig.x), Math.round(rig.x + rig.w)], h: Math.round(rig.h),
    glyph: +Math.abs(g[1][1] - g[0][1]).toFixed(1), head: Math.round(head[1]), row: Math.round(row[1]), headBelowRow: head[1] > row[1],
    onScreen: pts.every((q) => q[0] >= -2 && q[0] <= W + 2 && q[1] >= -2 && q[1] <= H + 2 && q[2] < 1),
    onPads, pads: split ? kr.halves : null, mid: split ? kr.mid : null, rects, overlaps,
  };
}

// play-9 — a framed board (展板 / 回声亭 / 路标: board/walk.js BoardWalk) as the live camera sees it: its face on the
// screen and the smallest text on it (the layout's minFont canvas px × the face's screen px per canvas px), the band it
// was framed into (frame.js / landscape.js hudBand) and what stood at the top of the screen then (for a band pushed down)
//   boardFont({ walk, camera }) → { framed, face: [x, y, w, h], font, band, plan: [x, y, w, h], tops: [[sel, x, y, w, h]] } | { framed: -1 }
export function boardFont({ walk, camera }) {
  if (!walk || walk.framed < 0) return { framed: -1 };
  const b = walk.list[walk.framed].b, L = b.entry.layout, W = innerWidth, H = innerHeight, V3 = camera.position.constructor;
  b.group.updateMatrixWorld(true); camera.updateMatrixWorld(true);
  const c = [[-1, 0], [1, 0], [-1, 1], [1, 1]].map(([sx, sy]) => { const v = new V3(sx * b.w / 2, b.bottom + sy * b.h, 0.07).applyMatrix4(b.group.matrixWorld).project(camera); return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H]; });
  const x0 = Math.min(...c.map((q) => q[0])), x1 = Math.max(...c.map((q) => q[0])), y0 = Math.min(...c.map((q) => q[1])), y1 = Math.max(...c.map((q) => q[1]));
  const f = walk.framing && walk.framing.frame;
  const tops = [];
  for (const sel of ['.iw-ps:not(.is-off) .iw-ps__box', '.iw-hud__top', '.iw-hud__top .iw-timer', '.iw-bb:not(.is-off)', '.iw-lf:not(.is-off) .iw-lf__phase', '.iw-lf:not(.is-off) .iw-lf__rank', '.iw-touch__btn']) for (const el of document.querySelectorAll(sel)) {
    const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0) || r.top > H * 0.45) continue;
    const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity < 0.05) continue;
    tops.push([sel, Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]);
  }
  return { framed: walk.framed, face: [x0, y0, x1 - x0, y1 - y0].map(Math.round), font: +(L.minFont * (x1 - x0) / L.W).toFixed(1), band: f && f.band ? { top: f.band.top, bottom: f.band.bottom, side: f.band.side } : null, plan: f && f.rect ? [f.rect.x, f.rect.y, f.rect.w, f.rect.h].map(Math.round) : null, tops };
}
