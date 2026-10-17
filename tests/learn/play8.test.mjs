// 题即玩法 play-8 (docs/PLAY.md §1 rule 1, §9 phase 8; LEARN §27): the cards are gone —
//   · the sources: no question card (hud-learn.js has none), no LEARN.play switch, no learn.hold, no pause for a question
//     (match.paused = true only where a level's results card comes up), the touch layer leaves the strip's buttons alone
//   · the duel's 备战 between rounds: M6 boards for every round of every duel day (the step's own boards, else a note;
//     the 今日小考 and the 回炉 round a note), laid out like any board; the bots stand by their brains being switched off,
//     not by a pause — and switched back on
// 用法：node --test tests/learn/*.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { loadWeek } from '../../src/learn/content.js';
import { LEARN } from '../../src/config.js';
import { planDay } from '../../src/learn/design.js';
const { DuelFlow } = await import('../../src/learn/forms/duel.js');
const { layoutBoard } = await import('../../src/learn/play/board/paint.js');

const ROOT = new URL('../../src/', import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), 'utf8');
const code = (f) => read(f).replace(/\/\/.*$/gm, '');
function files(dir) { const out = []; for (const e of readdirSync(new URL(dir, ROOT), { withFileTypes: true })) { if (e.isDirectory()) out.push(...files(dir + e.name + '/')); else if (e.name.endsWith('.js')) out.push(dir + e.name); } return out; }

test('the sources: no question card, no LEARN.play, no learn.hold, no pause for a question (only a results card pauses a finished level)', () => {
  const H = code('ui/hud-learn.js');
  assert.ok(!/iw-learn__panel|\bask\(p, opts\)|verdict\(v, next|_submit\(|KIND_ZH/.test(H), 'hud-learn.js: no question card');
  assert.ok(/results\(data, actions\)/.test(H) && /walk\(info, flags\)/.test(H) && /_speak\(text, done, o\)/.test(H), 'hud-learn.js keeps the walk bar, the results card and the voice');
  assert.equal('play' in LEARN, false, 'config.js: no LEARN.play');
  const learn = files('learn/');
  for (const f of [...learn, 'ui/i18n.js', 'ui/menus.js', 'core/touch.js', 'game/match.js', 'main.js']) {
    const src = code(f);
    assert.ok(!/LEARN\.play\b/.test(src), `${f}: no LEARN.play`);
    assert.ok(!/learn\??\.hold\b/.test(src) && !(f.startsWith('learn/') && /\bthis\.hold\s*=/.test(src)), `${f}: no learn.hold`);
    assert.ok(!/hud\??\.(ask|verdict)\(/.test(src) && !/\.showBoard\(/.test(src), `${f}: no card asked`);
    if (f.startsWith('learn/')) for (const m of src.matchAll(/paused\s*=\s*true/g)) {
      const before = src.slice(0, m.index), fn = before.slice(before.lastIndexOf('\n  _') + 4).match(/^[a-zA-Z]+/);
      assert.equal(fn && fn[0], 'results', `${f}: match.paused = true only in _results (the level is over), not in ${fn && fn[0]}`);
    }
  }
  // the touch layer: a finger on the strip's ▶ or its buttons (「开始这一轮」 / 「我的写法也对」) is the strip's, in every form
  assert.match(code('core/touch.js'), /G\.match\?\.learn && e\.target && e\.target\.closest && e\.target\.closest\('\.iw-ps__play, \.iw-ps__act, \.iw-learn__btn'\)/);
});

test('the duel\'s 备战 between rounds: M6 boards for every round of every duel day (the step\'s own, else a note), the quiz and the 回炉 round a note; every one lays out', async () => {
  const W = [await loadWeek(1), await loadWeek(2), await loadWeek(3)];
  let n = 0, boards = 0;
  for (const w of W) for (const d of w.days) {
    const level = { ...planDay(w, d.n, 'duel'), week: w.n, day: d.n, weekRef: w };
    const F = Object.assign(Object.create(DuelFlow.prototype), { level, gates: level.gates });
    for (const g of level.gates) {
      const specs = F._prepSpecs(g);
      assert.ok(specs.length >= 1 && specs.length <= 6, `${w.id} d${d.n} ${g.id}: ${specs.length} boards`);
      for (const sp of specs) { const L = layoutBoard(sp); assert.ok(L.H > 0 && L.minFont >= 54, `${g.id}: ${sp.kind} lays out`); }
      n++; boards += specs.length;
    }
  }
  assert.ok(n > 50 && boards > n, `${n} rounds, ${boards} boards`);
  const F = Object.assign(Object.create(DuelFlow.prototype), { level: { quiz: true, gates: [] } });
  const q = F._prepSpecs({ items: [{ en: 'a', zh: '一' }], title: '今日小考' });
  assert.equal(q.length, 1); assert.match(q[0].title, /今日小考/);
  const R = Object.assign(Object.create(DuelFlow.prototype), { level: { gates: [] } })._prepSpecs({ _relearnGate: true, items: [{ en: 'cup', zh: '杯子' }] });
  assert.match(R[0].title, /回炉/); assert.match(R[0].blocks[0].text, /cup/);
});

test('the bots stand through the 备战 by their brains being switched off (intents zeroed every frame), not by a pause — and come back', () => {
  const brain = { update() { this.ran = (this.ran || 0) + 1; this.a.intent.move.x = 1; } };
  const bot = { bot: Object.create(brain), isLocal: false, intent: { move: { x: 0, y: 0, z: 0, set(x, y, z) { this.x = x; this.y = y; this.z = z; } }, fire: true, jump: true } };
  bot.bot.a = bot;
  const F = Object.assign(Object.create(DuelFlow.prototype), { match: { actors: [bot, { isLocal: true, bot: null }] } });
  F._idleBots(true);
  bot.intent.fire = true; bot.bot.update(1 / 60);
  assert.equal(bot.intent.fire, false); assert.equal(bot.intent.move.x, 0); assert.ok(!bot.bot.ran, 'the brain does not run');
  F._idleBots(false);
  bot.bot.update(1 / 60);
  assert.equal(bot.bot.ran, 1, 'the brain runs again'); assert.equal(bot.intent.move.x, 1);
});
