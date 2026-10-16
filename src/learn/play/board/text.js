// 展板路 M6 — text on a board: wrapping Chinese and English, fitting a block into lines (pure; Node-tested with an
// approximate measure, the page with the canvas's own measureText).
//
//   approxMeasure(text, px)           a measure without a canvas: CJK / full-width 1 em, Latin by class (Rubik's widths)
//   canvasMeasure(ctx)                → (text, px, weight) the canvas's own (sets ctx.font)
//   wrap(text, maxW, px, measure, weight) → [line …]   CJK breaks between any two characters (but no line opens with
//                                     ，。、！？；：）」』… and none ends with （「『); Latin between words; a word longer
//                                     than the line breaks between letters
//   clampLines(lines, n, measure…)    → { lines, cut }   at most n lines, the last one ending in … when text was cut
//   charsOf(text)                     the visible characters (for the strip's tests)
const CJK = /[⺀-鿿豈-﫿︰-﹏＀-￯　-〿]/;
const NO_START = new Set('，。、！？；：）」』】〉》”’,.!?;:)]}%…—'.split(''));
const NO_END = new Set('（「『【〈《“‘([{'.split(''));

export function approxMeasure(text, px) {
  let w = 0;
  for (const ch of String(text)) {
    if (CJK.test(ch)) w += 1.0;
    else if (ch === ' ') w += 0.27;
    else if (/[iljI.,:;'!|]/.test(ch)) w += 0.3;
    else if (/[mwMW@]/.test(ch)) w += 0.86;
    else if (/[A-Z0-9]/.test(ch)) w += 0.64;
    else if (/[ɐ-˿]/.test(ch)) w += 0.56;   // IPA
    else w += 0.55;
  }
  return w * px;
}
export function canvasMeasure(ctx, family) {
  return (text, px, weight = 600) => { ctx.font = `${weight} ${px}px ${family}`; return ctx.measureText(String(text)).width; };
}
export function charsOf(text) { return [...String(text || '')].filter((c) => !/\s/.test(c)).length; }

// tokens: a CJK character is a token; a run of Latin (a word + the space after it) is a token
function tokens(text) {
  const out = [];
  let buf = '';
  for (const ch of String(text)) {
    if (CJK.test(ch)) { if (buf) { out.push(buf); buf = ''; } out.push(ch); }
    else if (ch === ' ') { buf += ch; out.push(buf); buf = ''; }
    else buf += ch;
  }
  if (buf) out.push(buf);
  return out;
}

export function wrap(text, maxW, px, measure = approxMeasure, weight = 600) {
  const lines = [];
  for (const para of String(text ?? '').split('\n')) {
    const toks = tokens(para);
    let line = '';
    for (let i = 0; i < toks.length; i++) {
      let t = toks[i];
      const trial = line + t;
      if (measure(trial.trimEnd(), px, weight) <= maxW || !line) {
        // a single Latin word wider than the line: break it between letters
        if (!line && measure(t.trimEnd(), px, weight) > maxW && !CJK.test(t)) {
          let part = '';
          for (const ch of t) { if (measure(part + ch, px, weight) > maxW && part) { lines.push(part); part = ''; } part += ch; }
          line = part; continue;
        }
        line = trial; continue;
      }
      // kinsoku: a closing mark never opens a line (it joins this one); an opening mark never ends one (it moves on)
      if (NO_START.has(t[0]) && t.length === 1) {
        // a closing mark never opens a line: the line's last character goes down with it
        const ch = [...line];
        if (ch.length > 1) { const last = ch.pop(); lines.push(ch.join('').trimEnd()); line = last + t; } else line += t;
        continue;
      }
      let carry = '';
      while (line.length > 1 && NO_END.has(line[line.length - 1])) { carry = line[line.length - 1] + carry; line = line.slice(0, -1); }
      lines.push(line.trimEnd());
      line = carry + t.replace(/^ +/, '');
    }
    if (line.trim() || !lines.length) lines.push(line.trimEnd());
  }
  return lines.filter((l, i, a) => l !== '' || (i > 0 && i < a.length - 1));
}

// at most n lines; the last one ends with … when the text went on (shortened until it fits with it)
export function clampLines(lines, n, maxW, px, measure = approxMeasure, weight = 600) {
  if (lines.length <= n) return { lines, cut: false };
  const out = lines.slice(0, n);
  let last = out[n - 1];
  while (last && measure(last + '…', px, weight) > maxW) last = [...last].slice(0, -1).join('');
  out[n - 1] = last.replace(/[，,、\s]+$/, '') + '…';
  return { lines: out, cut: true };
}
