// 字弹 M4 (docs/PLAY.md §3 M4) — the typing keys, in one place: which keys exist, where they sit on the 3D typewriter
// deck (rig.js) and on the game's own on-screen keyboard (src/ui/play-keys.js), and what a physical key means. Pure (no
// three, no DOM), so Node tests check the layouts at phone sizes.
//
// Key ids are the characters they type ('a'…'z', ' ', "'", '-', '.', ',', '?') plus two actions: 'back' (⌫) and 'fire'
// (射 = Enter). 提示 / ▶ are buttons of the keyboard, not keys: they type nothing and have no cap on the deck.
// Nothing here knows an answer — a key is a key (§1.3: no correctness before 射).

export const LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
export const PUNCT_WORD = ["'", '-'];                 // a word can have them (o'clock, T-shirt)
export const PUNCT_SENT = ['.', ',', '?'];           // sentences only (judging ignores them anyway: dictScore / WT)
export const ACTIONS = ['back', 'fire'];
/** every key the deck has a cap for (the deck shows all of them in either mode) */
export const ALL_KEYS = [...LETTERS, ' ', ...PUNCT_WORD, ...PUNCT_SENT, ...ACTIONS];
/** the printable keys: each has a type-bar on the deck and a glyph in the atlas */
export const PRINTABLE = [...LETTERS, ...PUNCT_WORD, ...PUNCT_SENT];

/** keys the on-screen keyboard offers in a mode ('word' = a flash-card word, 'sentence' = dictation / written sentence) */
export function keysFor(mode) {
  return mode === 'sentence' ? [...LETTERS, ' ', ...PUNCT_WORD, ...PUNCT_SENT, ...ACTIONS] : [...LETTERS, ' ', ...PUNCT_WORD, ...ACTIONS];
}

/** what a key shows on its cap */
export function keyLabel(k) {
  if (k === 'back') return '⌫';
  if (k === 'fire') return '射';
  if (k === ' ') return '';
  return k;
}

// ---------------------------------------------------------------------------------------------- the 3D deck
// Rows of the typewriter deck, far row first (the far row is the one nearest the type-bars, as on a real machine);
// [key, width in key units, x offset in units before it]. A centred row; the deck builder turns units into metres.
export const DECK_ROWS = [
  [['q', 1], ['w', 1], ['e', 1], ['r', 1], ['t', 1], ['y', 1], ['u', 1], ['i', 1], ['o', 1], ['p', 1], ['back', 1.5]],
  [['a', 1, 0.3], ['s', 1], ['d', 1], ['f', 1], ['g', 1], ['h', 1], ['j', 1], ['k', 1], ['l', 1], ["'", 1], ['fire', 1.6]],
  [['z', 1, 0.65], ['x', 1], ['c', 1], ['v', 1], ['b', 1], ['n', 1], ['m', 1], [',', 1], ['.', 1], ['?', 1], ['-', 1]],
  [[' ', 5.6]],
];

/** The deck's caps in key units: [{ key, row, x (centre, units from the deck centre; +x = the typist's LEFT), z (rows from
 *  the far row), w }]. Rows are centred; the typist's left is +X in rig space (she faces +Z, her right is −X). */
export function deckCaps() {
  const out = [];
  DECK_ROWS.forEach((row, r) => {
    let total = 0;
    for (const [, w, off = 0] of row) total += off + w;
    let u = -total / 2;
    for (const [key, w, off = 0] of row) {
      u += off;
      // reading order runs left → right on her screen, i.e. +X → −X in rig space
      out.push({ key, row: r, x: -(u + w / 2), z: r, w });
      u += w;
    }
  });
  return out;
}

// ---------------------------------------------------------------------------------------------- physical keys
/** A keydown → a key id, or null (not a typing key). Letters ignore case; Enter = 射, Backspace = ⌫. Modifier combos
 *  (⌘ / Ctrl / Alt) are never typing. `mode` limits punctuation to what the mode offers. */
export function keyOfEvent(e, mode = 'word') {
  if (!e || e.metaKey || e.ctrlKey || e.altKey) return null;
  if (e.key === 'Enter' || e.code === 'Enter' || e.code === 'NumpadEnter') return 'fire';
  if (e.key === 'Backspace' || e.code === 'Backspace') return 'back';
  const k = typeof e.key === 'string' ? e.key : '';
  if (k.length !== 1) return null;
  const c = k === '’' || k === '‘' ? "'" : k.toLowerCase();
  if (c === ' ') return ' ';
  if (c >= 'a' && c <= 'z') return c;
  if (PUNCT_WORD.includes(c)) return c;
  if (mode === 'sentence' && PUNCT_SENT.includes(c)) return c;
  return null;
}

// ---------------------------------------------------------------------------------------------- the on-screen keyboard
// Layout of the game keyboard in CSS px, from the viewport and the safe-area insets.
//   portrait  — iOS-like rows of 10 (≈ 35 × 50 at 390 wide) under a strip with the typed line, ▶ and 提示; ≈ 40 % of
//               the screen with the home-indicator inset.
//   landscape — three rows of wide keys (≈ 50 × 44 at 844); ▶ and 提示 open the first two rows and the typed line is
//               only on the paper in the world (there is no room for a strip); ≈ 45 % of the screen.
// → { orient, w, h, top, unit, strip: { x, y, w, h } | null (landscape), keys: [{ key, x, y, w, h }], buttons: [{ id: 'hint' | 'replay', … }] }
// Every rect is inside the viewport and clear of the insets (tests/learn/type-keys.test.mjs).
export const KB = {
  portrait: { side: 3, gap: 5, rowGap: 9, keyH: [44, 0.059, 52], strip: 46, pad: 8, bottom: 6, btn: [64, 50] },
  landscape: { side: 8, gap: 6, rowGap: 5, keyH: [44, 0, 44], strip: 0, pad: 5, bottom: 5, maxW: 1000 },
  minW: 30, minH: 44,
};

function rowsFor(orient, mode, replay) {
  const s = mode === 'sentence';
  if (orient === 'portrait') {
    return [
      [['q'], ['w'], ['e'], ['r'], ['t'], ['y'], ['u'], ['i'], ['o'], ['p']],
      [['a', 1, 0.5], ['s'], ['d'], ['f'], ['g'], ['h'], ['j'], ['k'], ['l']],
      [['z', 1, 0.5], ['x'], ['c'], ['v'], ['b'], ['n'], ['m'], ['back', 1.5, 0.5]],
      s ? [["'"], ['-'], [','], [' ', 3.4], ['.'], ['?'], ['fire', 2.1]] : [["'"], ['-'], [' ', 5], ['fire', 2.6]],
    ];
  }
  return [
    [replay ? ['replay', 1.25] : ['_', 1.25], ['q'], ['w'], ['e'], ['r'], ['t'], ['y'], ['u'], ['i'], ['o'], ['p'], ['back', 1.6]],
    [['hint', 1.25], ['a', 1, 0.3], ['s'], ['d'], ['f'], ['g'], ['h'], ['j'], ['k'], ['l'], ["'"], ['fire', 1.85]],
    s ? [['_', 1.25], ['z', 1, 0.6], ['x'], ['c'], ['v'], ['b'], ['n'], ['m'], [','], ['.'], ['?'], ['-'], [' ', 1.75]]
      : [['_', 1.25], ['z', 1, 0.6], ['x'], ['c'], ['v'], ['b'], ['n'], ['m'], ['-'], [' ', 3.75]],
  ];
}
const BUTTONS = new Set(['hint', 'replay']);

/** vp { w, h } in CSS px, safe { top, right, bottom, left } = env(safe-area-inset-*), mode 'word' | 'sentence',
 *  opts { replay: false } hides ▶ */
export function keyboardLayout(vp, safe = {}, mode = 'word', opts = {}) {
  const W = vp.w, H = vp.h;
  const sL = safe.left || 0, sR = safe.right || 0, sB = safe.bottom || 0;
  const orient = W >= H ? 'landscape' : 'portrait';
  const P = KB[orient], replay = opts.replay !== false;
  const rows = rowsFor(orient, mode, replay);
  const usable = W - sL - sR - 2 * P.side;
  const avail = Math.min(usable, P.maxW || Infinity);
  const x0 = sL + P.side + (usable - avail) / 2;
  // one unit = a letter key's width; the row that needs the most room decides it (offsets also take a gap)
  const measure = (row) => { let units = 0, gaps = -1; for (const [, w = 1, off = 0] of row) { units += w + off; gaps += off ? 2 : 1; } return { units, gaps }; };
  let U = Infinity;
  for (const row of rows) { const m = measure(row); U = Math.min(U, (avail - m.gaps * P.gap) / m.units); }
  const keyH = Math.round(Math.min(P.keyH[2], Math.max(P.keyH[0], H * P.keyH[1]))), nRows = rows.length;
  const kbH = P.pad + P.strip + (P.strip ? P.rowGap : 0) + nRows * keyH + (nRows - 1) * P.rowGap + P.bottom + sB;
  const top = H - kbH;
  const keys = [], buttons = [];
  rows.forEach((row, r) => {
    const m = measure(row), rowW = m.units * U + m.gaps * P.gap;
    let x = x0 + (avail - rowW) / 2;
    const y = top + P.pad + P.strip + (P.strip ? P.rowGap : 0) + r * (keyH + P.rowGap);
    for (const [key, w = 1, off = 0] of row) {
      if (off) x += off * U + P.gap;
      const rect = { x: Math.round(x), y: Math.round(y), w: Math.round(w * U), h: keyH };
      if (BUTTONS.has(key)) buttons.push({ id: key, ...rect });
      else if (key !== '_') keys.push({ key, ...rect });
      x += w * U + P.gap;
    }
  });
  const sy = top + P.pad;
  let stripRight = x0 + avail;
  if (orient === 'portrait') {
    const [bw, rw] = P.btn;
    stripRight -= bw;
    buttons.push({ id: 'hint', x: Math.round(stripRight), y: Math.round(sy), w: bw, h: 44 });
    if (replay) { stripRight -= rw + 6; buttons.push({ id: 'replay', x: Math.round(stripRight), y: Math.round(sy), w: rw, h: 44 }); }
    stripRight -= 8;
  }
  const strip = orient === 'portrait' ? { x: Math.round(x0), y: Math.round(sy), w: Math.round(stripRight - x0), h: 44 } : null;
  return { orient, w: W, h: kbH, top: Math.round(top), unit: U, strip, keys, buttons };
}
