// 题即玩法 play-4 (docs/PLAY.md §5.2, LEARN §23): the race is 墨浪跑酷 under LEARN.play — the flow pick, the names, and the
// one label painter (play-1's atlas.js) drawing the runner's lane-wide plates: every curtain of the three weeks' race
// days gets a readable plate, nothing cut, a row's plates in one small sheet.
// 用法：node --test tests/learn/play4.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));   // `three` → vendor/ (no npm install here)
import test from 'node:test';
import assert from 'node:assert/strict';
import { LEARN } from '../../src/config.js';
import { loadWeek } from '../../src/learn/content.js';
import { planDay, FORM_ZH } from '../../src/learn/design.js';
import { t, TIPS_ZH } from '../../src/ui/i18n.js';
import { entriesOf, rowPrompt, rowLabels, rowLanes, isBanner } from '../../src/learn/play/runner/rows.js';
import { fitLabel, packLabels } from '../../src/learn/play/atlas.js';
const { flowFor } = await import('../../src/learn/forms/index.js');
const { RunnerFlow } = await import('../../src/learn/play/runner/runner.js');
const { RaceFlow } = await import('../../src/learn/forms/race.js');
const { PLATE } = await import('../../src/learn/play/runner/view.js');

const R = LEARN.runner;
const WEEKS = [await loadWeek(1), await loadWeek(2), await loadWeek(3)];

test('the race form is the runner under LEARN.play and race.js\'s card race without it (the id stays race); the names follow', () => {
  assert.equal(flowFor('race', true), RunnerFlow);
  assert.equal(flowFor('race', false), RaceFlow);
  assert.ok(RunnerFlow.prototype instanceof RaceFlow, 'the runner is built on the race (bots, props, standings)');
  assert.equal(flowFor('puzzle', true), flowFor('puzzle', false));
  // (Node has no location: LEARN.play is on here, as it is by default in the page)
  assert.equal(LEARN.play, true);
  assert.equal(FORM_ZH.race, '墨浪跑酷');
  assert.match(t('main.learnSub'), /墨浪跑酷/); assert.doesNotMatch(t('main.learnSub'), /道具赛/);
  assert.match(t('desc.learn'), /墨浪跑酷/);
  assert.ok(TIPS_ZH.some((s) => /墨浪跑酷/.test(s)) && !TIPS_ZH.some((s) => /^道具赛/.test(s)), 'the loading tip');
});

test('one label painter: every curtain of every race day of the three weeks gets a plate from atlas.js fitLabel — the text whole, the font ≥ 26 px, a row\'s plates in one sheet ≤ 1024 px', () => {
  let rows = 0, banners = 0, minFont = 999, maxSheet = 0;
  for (const w of WEEKS) for (const d of w.days) {
    const level = planDay(w, d.n, 'race');
    for (const e of entriesOf(level.gates)) {
      if (e.kind === 'glide') continue;
      const p = rowPrompt(e.item, {}), labels = rowLabels(e.item, p), banner = labels.some((l) => isBanner(l, R.banner));
      const lanes = rowLanes(e.item, p, R.banner);
      const plates = labels.slice(0, lanes).map((l, i) => fitLabel({ text: l.en, zh: l.zh, tag: 'ABCD'[i] }, PLATE.w, banner ? PLATE.bannerH : PLATE.h, { big: banner ? 64 : 92, small: 26, lines: banner ? 4 : 2 }));
      for (const [i, P] of plates.entries()) {
        const l = labels[i];
        assert.ok(P.fixed && P.w === PLATE.w && P.font >= 26 && P.font2 >= 26, `${e.item.id}: ${JSON.stringify(P)}`);
        // whole: the wrapped lines put back together are the label (no … , nothing dropped)
        const squash = (s) => String(s).replace(/\s+/g, '');
        assert.equal(squash(P.la.join('')), squash(l.en), `${e.item.id} lane ${i}: the line`);
        if (l.zh && l.zh !== l.en) assert.equal(squash(P.lb.join('')), squash(l.zh), `${e.item.id} lane ${i}: the Chinese`);
        assert.equal(P.tag, 'ABCD'[i]);
        assert.ok(P.top > 0, 'the chip row');
        minFont = Math.min(minFont, P.font);
      }
      const S = packLabels(plates, 1, 1024);
      assert.ok(S.fits && S.w === 1024 && S.h <= 1024, `${e.item.id}: ${plates.length} plates → ${S.w} × ${S.h}`);
      maxSheet = Math.max(maxSheet, S.h);
      rows++; if (banner) banners++;
    }
  }
  assert.ok(rows > 900 && banners > 60, `${rows} rows, ${banners} banner rows`);
  assert.ok(maxSheet <= 768, `the tallest sheet ${maxSheet}`);
  // a banner plate: a long line wraps to a few lines at a smaller face; a word's meaning fills the plate in big type
  const big = fitLabel({ text: '去', zh: '' }, PLATE.w, PLATE.h, { big: 92, small: 26, lines: 2 });
  assert.ok(big.font === 92 && big.la.length === 1, JSON.stringify(big));
  const long = fitLabel({ text: 'The committee has been discussing the proposal since Monday.', zh: '委员会从周一起就在讨论这个提案。', tag: 'B' }, PLATE.w, PLATE.bannerH, { big: 64, small: 26, lines: 4 });
  assert.ok(long.la.length >= 2 && long.la.length <= 4 && long.font >= 26 && long.lb.length <= 2, JSON.stringify(long));
});
