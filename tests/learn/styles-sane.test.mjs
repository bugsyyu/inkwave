// The style sheets parse as written: braces balance outside comments and strings, and no merge left a conflict marker behind.
// (10-20: a union of two branches' new sections in styles/ui.css kept a literal ======= line and lost the } that closed the
// first section's reduced-motion block, so the browser read the whole 老师 section as part of that @media — its paper lost
// its ink outline on every normal device. Nothing else noticed: npm run check reads only scripts.)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHEETS = fs.readdirSync(path.join(ROOT, 'styles')).filter((f) => f.endsWith('.css')).map((f) => path.join('styles', f));

// depth of { } outside comments and strings, line by line: the first line where it goes below 0, and where it ends
function braces(css) {
  let depth = 0, line = 1, under = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '\n') line++;
    else if (c === '/' && css[i + 1] === '*') { const j = css.indexOf('*/', i + 2); const end = j < 0 ? css.length : j + 2; line += (css.slice(i, end).match(/\n/g) || []).length; i = end - 1; }
    else if (c === '"' || c === "'") { let j = i + 1; while (j < css.length && css[j] !== c && css[j] !== '\n') j += css[j] === '\\' ? 2 : 1; i = j; }
    else if (c === '{') depth++;
    else if (c === '}' && --depth < 0 && !under) under = line;
  }
  return { depth, under };
}

test('every style sheet: braces balance, no merge conflict markers', () => {
  assert.ok(SHEETS.length > 0);
  for (const f of SHEETS) {
    const css = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const marks = css.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => /^(<{7}|={7}|>{7})( |$)/.test(l));
    assert.deepEqual(marks, [], f + ': conflict markers left by a merge');
    const b = braces(css);
    assert.equal(b.under, 0, f + ': a } with nothing open (line ' + b.under + ')');
    assert.equal(b.depth, 0, f + ': ' + b.depth + ' block(s) never closed');
  }
});

test('the 老师 and 学习方法 sections are top level (not inside another block)', () => {
  const css = fs.readFileSync(path.join(ROOT, 'styles', 'ui.css'), 'utf8');
  for (const sel of ['.iw-bt-paper {', '.iw-bg-art {']) {
    const at = css.indexOf(sel);
    assert.ok(at > 0, sel);
    assert.equal(braces(css.slice(0, at)).depth, 0, sel + ' sits inside an open block');
  }
});
