// 题即玩法 play-1 (docs/PLAY.md §3 M1, §6; docs/LEARN.md §18): the ink targets' pure parts — where the objects go on a
// phone held either way and on an iPad (layoutTargets), which object a tap is on (pickTarget), a round meeting one
// (the boss's own segment / ray vs sphere arithmetic, checked against Boss.segHit / rayDist themselves), only a
// deliberate direct hit answering (never splash), which items are ink targets now, and that an ink target's pick goes
// through exactly the card's judge → recordFirst (first-of-day included).
// 用法：node --test tests/learn/*.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));   // `three` → vendor/ (flow.js and boss.js import it)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadWeek, daySteps } from '../../src/learn/content.js';
import { prompt } from '../../src/learn/engine.js';
import { store, setBackend } from '../../src/learn/store.js';
import { planDay } from '../../src/learn/design.js';
import { LEARN } from '../../src/config.js';
import { layoutTargets, isBanner, insideSafe, overlaps, asProjected, textWidth, labelBox } from '../../src/learn/play/layout.js';
import { pickTarget } from '../../src/learn/play/pick.js';
import { segSpheres, raySpheres, plankSpheres, ShotTargets } from '../../src/learn/play/hit.js';
import { gateLabels, packLabels, fitAtlas } from '../../src/learn/play/atlas.js';
import { isM1Item, canPlayM1, targetLabels, answerOfTarget, verdictLines, firstSentence } from '../../src/learn/play/m1.js';
import { FrameTimes, percentile } from '../../src/learn/play/frametime.js';

const { LearnFlow } = await import('../../src/learn/flow.js');
const { Boss } = await import('../../src/boss/boss.js');

function memory() { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); } }; }
function rnd(seed) { let a = seed >>> 0; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// the screens: the safe area (strip on top, HUD top buttons, 16 px sides, the bottom controls) and what no object may
// cover — her silhouette (measured: portrait x 145–245, y 441–787; landscape x 400–445, y 204–364 at 844 × 390), the
// touch buttons, the minimap — as the runtime measures them (src/learn/play/run.js safeArea)
const SCREENS = {
  phonePortrait: { W: 390, H: 844, safe: { x: 16, y: 187, w: 358, h: 507 }, avoid: [{ x: 138, y: 432, w: 114, h: 412 }] },
  phoneLandscape: { W: 844, H: 390, safe: { x: 16, y: 121, w: 812, h: 259 }, avoid: [{ x: 386, y: 196, w: 72, h: 194 }, { x: 660, y: 240, w: 184, h: 150 }, { x: 0, y: 255, w: 96, h: 135 }] },
  padPortrait: { W: 820, H: 1180, safe: { x: 16, y: 200, w: 788, h: 820 }, avoid: [{ x: 330, y: 600, w: 160, h: 580 }, { x: 640, y: 1040, w: 180, h: 140 }] },
  padLandscape: { W: 1180, H: 820, safe: { x: 16, y: 170, w: 1148, h: 560 }, avoid: [{ x: 520, y: 410, w: 140, h: 410 }, { x: 960, y: 560, w: 220, h: 260 }, { x: 0, y: 560, w: 140, h: 260 }] },
};
const WORD = [{ text: '星期一', zh: '' }, { text: '星期二', zh: '' }, { text: '星期三', zh: '' }, { text: '星期四', zh: '' }];
const QUIZ3 = [{ text: '名词', zh: '' }, { text: '动词', zh: '' }, { text: '形容词', zh: '' }];
const PRON2 = [{ text: 'sheep', zh: '羊' }, { text: 'ship', zh: '船' }];
// the longest labels in the three weeks: a reading answer (54 = 41 English + 13 Chinese) and a grammar one (48)
const LONG = [
  { text: 'She goes to an English class after work on Monday.', zh: '她周一下班后去上英语课。' },
  { text: 'He relaxes with his friends.', zh: '他和朋友们放松。' },
  { text: 'They call their parents on Sunday.', zh: '他们周日给父母打电话。' },
];

function checkLayout(name, L, S, n) {
  assert.equal(L.items.length, n, `${name}: one object per option`);
  for (const it of L.items) {
    assert.ok(insideSafe(it.rect, S.safe), `${name}: object ${it.i} inside the safe area ${JSON.stringify(it.rect)}`);
    for (const a of S.avoid) assert.ok(!overlaps(it.rect, a), `${name}: object ${it.i} clear of ${JSON.stringify(a)}`);
    assert.ok(it.rect.w >= LEARN.playUi.minHit && it.rect.h >= LEARN.playUi.minHit, `${name}: ≥ 44 pt (${it.rect.w.toFixed(0)}×${it.rect.h.toFixed(0)})`);
  }
  for (let a = 0; a < L.items.length; a++) for (let b = a + 1; b < L.items.length; b++) assert.ok(!overlaps(L.items[a].rect, L.items[b].rect), `${name}: objects ${a} and ${b} apart`);
  assert.ok(L.fits, `${name}: fits`);
}

test('layoutTargets: four word balls on a phone held upright (2 × 2 round her), on its side (one row past her), on an iPad both ways', () => {
  for (const [name, S] of Object.entries(SCREENS)) {
    const L = layoutTargets(4, WORD, S.W / S.H, S.safe, { avoid: S.avoid });
    assert.equal(L.kind, 'ball', name);
    checkLayout(name, L, S, 4);
    if (S.W < S.H) assert.notDeepEqual(L.rows, [4], `${name}: upright never one row of four`);
    else assert.equal(L.rows.length, 1, `${name}: on its side one row (${JSON.stringify(L.rows)})`);
    assert.ok(L.d >= (S.W < 500 || S.H < 500 ? 56 : 90), `${name}: balls big enough to tap and read: ${L.d.toFixed(0)} px`);
    // the order on screen is the option order: left to right, then top to bottom
    const ys = L.items.map((it) => Math.round(it.y)), xs = L.items.map((it) => it.x);
    for (let k = 1; k < 4; k++) assert.ok(ys[k] > ys[k - 1] + 1 || (Math.abs(ys[k] - ys[k - 1]) <= 1 && xs[k] > xs[k - 1]), `${name}: reading order`);
  }
  for (const [name, S] of Object.entries(SCREENS)) {
    checkLayout(name + ' ×3', layoutTargets(3, QUIZ3, S.W / S.H, S.safe, { avoid: S.avoid }), S, 3);
    checkLayout(name + ' ×2', layoutTargets(2, PRON2, S.W / S.H, S.safe, { avoid: S.avoid }), S, 2);
  }
});

test('layoutTargets: a 54-character label makes banners — stacked one per row both ways, wrapped, inside the safe area, never under 14 px', () => {
  assert.ok(isBanner(LONG) && !isBanner(WORD) && !isBanner(QUIZ3));
  assert.ok(isBanner([{ text: 'Monday and Wednesday', zh: '周一和周三' }]), '13+ English characters');
  assert.ok(isBanner([{ text: '/ɒv/，读得很清楚', zh: '' }]) === false && isBanner([{ text: '又轻又短又快又弱的音', zh: '' }]), '9+ Chinese characters');
  assert.ok(LONG[0].text.length + LONG[0].zh.length > 54, '(longer than the courses\' longest, 54)');
  for (const [name, S] of Object.entries(SCREENS)) {
    const L = layoutTargets(3, LONG, S.W / S.H, S.safe, { avoid: S.avoid });
    assert.equal(L.kind, 'banner', name);
    checkLayout(name + ' banners', L, S, 3);
    assert.ok(L.font >= 14, `${name}: font ${L.font}`);
    for (let k = 1; k < 3; k++) assert.ok(L.items[k].y >= L.items[k - 1].y + L.items[k - 1].h, `${name}: stacked, one per row`);
    assert.ok(L.items.every((it) => it.lines >= 2), `${name}: both lines on every plank`);
    if (S.W < S.H) assert.ok(L.items.every((it) => it.w >= S.safe.w * 0.5), `${name}: upright a plank is wide`);
  }
});

test('pickTarget: a hit inside, the 16 px slop around, a 44 pt floor for a small object, the nearest of two overlapping, banners as rectangles, objects off screen ignored', () => {
  const S = SCREENS.phonePortrait;
  const L = layoutTargets(4, WORD, S.W / S.H, S.safe, { avoid: S.avoid });
  const P = asProjected(L.items);
  for (const it of L.items) {
    assert.equal(pickTarget(it.x, it.y, P), it.i, 'the ball\'s centre');
    assert.equal(pickTarget(it.label.x + it.label.w / 2, it.label.y + it.label.h - 2, P), it.i, 'its label plate');
    assert.equal(pickTarget(it.x + it.r + 12, it.y, P), it.i, 'just outside the disc: within the slop');
  }
  assert.equal(pickTarget(2, 2, P), -1, 'the corner is nothing');
  // a tiny ball: the 44 pt floor + 16 px slop → 38 px from its centre still picks it
  const tiny = [{ i: 7, kind: 'ball', cx: 100, cy: 100, r: 6 }];
  assert.equal(pickTarget(100 + 37, 100, tiny), 7);
  assert.equal(pickTarget(100 + 40, 100, tiny), -1);
  // overlap: two discs whose slop rings overlap — the one the tap is (nearer) on wins either way
  const two = [{ i: 0, kind: 'ball', cx: 100, cy: 100, r: 30 }, { i: 1, kind: 'ball', cx: 170, cy: 100, r: 30 }];
  assert.equal(pickTarget(134, 100, two), 0); assert.equal(pickTarget(136, 100, two), 1);
  assert.equal(pickTarget(131, 100, two), 0, 'on the edge of 0, inside 1\'s slop: 0');
  // banners: rectangles (a corner counts, unlike a disc); slop on every side; stacked ones split at the gap
  const B = [{ i: 0, kind: 'banner', x: 20, y: 200, w: 340, h: 60 }, { i: 1, kind: 'banner', x: 20, y: 270, w: 340, h: 60 }];
  assert.equal(pickTarget(22, 202, B), 0, 'the corner');
  assert.equal(pickTarget(20 + 340 + 15, 230, B), 0, 'right of it within the slop');
  assert.equal(pickTarget(190, 264, B), 0); assert.equal(pickTarget(190, 266, B), 1, 'between two planks: the nearer');
  assert.equal(pickTarget(190, 258, [null, { off: true }, ...B.slice(1)]), 1, 'hidden / behind-the-camera entries are skipped (the next one\'s slop still reaches)');
  assert.equal(pickTarget(190, 230, [null, { off: true }, ...B.slice(1)]), -1);
});

test('the hit test is the boss\'s: segSpheres = Boss.segHit and raySpheres = Boss.rayDist on 400 random rounds (same entry point, same nearest sphere)', () => {
  const R = rnd(7);
  const v = (s = 6) => ({ x: (R() - 0.5) * s, y: (R() - 0.5) * s, z: (R() - 0.5) * s });
  for (let k = 0; k < 400; k++) {
    const shapes = Array.from({ length: 1 + ((R() * 4) | 0) }, () => ({ pos: v(4), r: 0.2 + R() * 0.9, active: R() > 0.1, weak: false }));
    const boss = { visible: true, dead: false, model: { hitShapes: shapes }, crabs: new Map(), _segCrabs: () => null };
    const a = v(10), b = v(10), pad = R() * 0.2;
    const want = Boss.prototype.segHit.call(boss, a, b, pad);
    const spheres = shapes.map((h, i) => ({ x: h.pos.x, y: h.pos.y, z: h.pos.z, r: h.r, active: h.active, target: i }));
    const got = segSpheres(a, b, pad, spheres);
    if (!want) { assert.equal(got, null, `round ${k}: both miss`); continue; }
    assert.ok(got, `round ${k}: both hit`);
    assert.equal(spheres[got.index].target, shapes.indexOf(want.target), `round ${k}: the same sphere`);
    assert.ok(Math.abs(got.t - want.t) < 1e-12 && Math.abs(got.dist - want.dist) < 1e-9, `round ${k}: the same entry`);
    assert.ok(Math.abs(got.point.x - want.point.x) < 1e-9 && Math.abs(got.point.z - want.point.z) < 1e-9);
    const d = v(2), L = Math.hypot(d.x, d.y, d.z) || 1; d.x /= L; d.y /= L; d.z /= L;
    const rd = Boss.prototype.rayDist.call(boss, a, d, 20), rs = raySpheres(a, d, 20, spheres);
    if (rd < 0) assert.equal(rs, null); else assert.ok(rs && Math.abs(rs.dist - rd) < 1e-12, `ray ${k}`);
  }
  // a banner plank is a row of overlapping spheres: a round anywhere along its middle band meets it, a round past its end does not
  const sph = [], n = plankSpheres({ x: 0, y: 2, z: 10 }, { x: 1, y: 0, z: 0 }, 4, 0.8, 2, sph);
  assert.ok(n >= 4 && sph.every((s) => s.target === 2));
  for (const x of [-1.8, -1, 0, 0.7, 1.8]) assert.ok(segSpheres({ x, y: 2, z: 0 }, { x, y: 2, z: 20 }, 0.05, sph), `plank hit at x = ${x}`);
  assert.equal(segSpheres({ x: 2.6, y: 2, z: 0 }, { x: 2.6, y: 2, z: 20 }, 0.05, sph), null, 'past its end');
});

test('only a deliberate direct hit answers: a tapped / crosshair round on its own object counts; a stray round, a round from an earlier question and splash never do', () => {
  const T = new ShotTargets(), hits = [];
  T.onHit = (target, point, deliberate) => hits.push({ target, deliberate });
  const spheres = [{ x: -2, y: 2, z: 10, r: 0.6, target: 0 }, { x: 2, y: 2, z: 10, r: 0.6, target: 1 }];
  T.set(spheres, 5);
  const round = (x, tag) => ({ prev: { x, y: 2, z: 9 }, pos: { x, y: 2, z: 10.5 }, size: 0.15, playTag: tag, ghost: false });
  assert.equal(T.shotHit(T.tag(round(2, 0), 1)), true); assert.deepEqual(hits.pop(), { target: 1, deliberate: true });
  assert.equal(T.shotHit(T.tag(round(-2, 0), 1)), true, 'aimed at 1, spread onto 0: it splats on 0 …');
  assert.deepEqual(hits.pop(), { target: 0, deliberate: false }, '… and answers nothing');
  assert.equal(T.shotHit(round(2, 0)), true); assert.deepEqual(hits.pop(), { target: 1, deliberate: false }, 'an untagged (sprayed) round');
  const old = T.tag(round(2, 0), 1); T.set(spheres, 6);
  assert.equal(T.shotHit(old), true); assert.deepEqual(hits.pop(), { target: 1, deliberate: false }, 'tagged for the last question');
  assert.equal(T.shotHit({ ...round(0, 0), prev: { x: 0, y: 2, z: 9 }, pos: { x: 0, y: 2, z: 10.5 } }), false, 'between the two: nothing');
  assert.equal(T.shotHit({ ...T.tag(round(2, 0), 1), ghost: true }), false, 'another player\'s ghost round never');
  // splash: weapons.js reaches the registry from Projectiles._step only — never from a blast's burst, a slosher's
  // splash, a bomb, a special, a roller / brush / charger, or the trail's drips
  const src = readFileSync(new URL('../../src/game/weapons.js', import.meta.url), 'utf8');
  const uses = src.split('\n').map((l, i) => [l, i]).filter(([l]) => /playTargets|playTag/.test(l));
  assert.equal(uses.length, 2, 'two lines: the pool reset and the direct-hit check');
  const fnAt = (line) => { const lines = src.split('\n'); for (let i = line; i >= 0; i--) { const m = /^  (?:async )?(\w+)\(.*\)\s*\{\s*$/.exec(lines[i]); if (m) return m[1]; } return null; };
  assert.deepEqual(uses.map(([, i]) => fnAt(i)), ['_new', '_step']);
  const step = src.slice(src.indexOf('  _step(p, dt) {'), src.indexOf('  // a blob / drop / blast connecting with the boss'));
  assert.ok(step.indexOf('G.playTargets.shotHit(p)') < step.indexOf('G.physics.segment(p.prev, p.pos'), 'a direct hit, before the round can meet the world');
  for (const fn of ['_blastBurst', '_sloshSplash', '_updateBombs', 'applyHit', '_impact']) {
    const at = src.indexOf(`  ${fn}(`), body = src.slice(at, src.indexOf('\n  }\n', at));
    assert.ok(at > 0 && !/playTargets/.test(body), `${fn} never reaches the question objects`);
  }
});

test('phase 1: which items are ink targets — 单词选义 450 · 语法小测 138 · 发音小测 76 = 664 of the three weeks; their reworded retry stays an ink target; every other item keeps the card', async () => {
  const count = {}, card = {};
  let retryTyped = 0;
  for (const n of [1, 2, 3]) {
    const w = await loadWeek(n);
    for (const d of w.days) for (const s of daySteps(w, d.n)) for (const it of s.items) {
      const k = s.kind + '·' + it.meta.kind, p = prompt(it);
      if (canPlayM1(it, p)) {
        count[k] = (count[k] || 0) + 1;
        assert.ok(isM1Item(it));
        assert.equal(targetLabels(p).length, p.options.length);
        const alt = LearnFlow.prototype._altPrompt.call({}, it);
        if (canPlayM1(it, alt)) assert.ok(alt._perm && alt.options.length === p.options.length, 'the retry reshuffles the same options');
        else retryTyped++;
      } else card[k] = (card[k] || 0) + 1;
    }
  }
  assert.deepEqual(count, { 'choice·word': 450, 'choice·quiz': 138, 'pron·quiz': 76 });
  assert.equal(retryTyped, 0, 'no stem starts 「哪一个是」: no retry turns into typing');
  for (const k of ['pron·sym', 'listen·read', 'listen·pair', 'dictation·dict', 'dictation·word', 'lesson·write', 'lesson·speak', 'lesson·lesson']) assert.ok(card[k] > 0 && !count[k], k + ' keeps the card in phase 1');
  // what does not play: a flip card, a typed rewording, a 5-option choice
  const w1 = await loadWeek(1), word = daySteps(w1, 1).find((s) => s.kind === 'choice').items[0];
  assert.equal(canPlayM1(word, { ...prompt(word), _flip: true }), false);
  assert.equal(canPlayM1(word, { type: 'typed', _alt: 'typed-of-choice' }), false);
  assert.equal(canPlayM1(word, { ...prompt(word), options: Array(5).fill({ text: 'x' }) }), false);
});

test('an ink target\'s pick is the card\'s answer: the same judge → recordFirst call (word, grammar, pron, a reshuffled retry), first of the day once, the same lock and retry', async () => {
  const w1 = await loadWeek(1), w2 = await loadWeek(2);
  const word = daySteps(w1, 1).find((s) => s.kind === 'choice' && s.items[0].meta.kind === 'word').items[2];
  const quiz = daySteps(w1, 1).find((s) => s.items[0].meta.kind === 'quiz' && s.kind === 'choice').items[1];
  const pron = daySteps(w2, 1).find((s) => s.kind === 'pron' && s.items[0].meta.kind === 'quiz').items[0];
  const calls = [], orig = store.recordFirst;
  store.recordFirst = (a) => { const r = orig.call(store, a); calls.push({ a: { ...a, at: 0, item: a.item && a.item.id }, first: r.first, leaf: r.leaf || null }); return r; };
  try {
    const run = (path, it, p, pick) => {
      setBackend(memory()); store.load(); calls.length = 0;
      const log = [], F = { firsts: 0, right: new Set(), P: LEARN.puzzle, _emit: (name, payload) => log.push({ name, ...payload }), _styleGates() {} };
      const g = { id: 'gate:t', locks: 0, queue: [] }, item = { ...it, _tries: 0, _form: null };
      let ans = pick;
      if (path === 'm1') {
        // the objects as laid out on a phone, the tap on object `pick`, the index it maps to
        const S = SCREENS.phonePortrait, L = layoutTargets(p.options.length, targetLabels(p), S.W / S.H, S.safe, { avoid: S.avoid });
        const t = L.items[pick], k = pickTarget(t.x ?? t.x + t.w / 2, t.y ?? t.y + t.h / 2, asProjected(L.items));
        ans = answerOfTarget(p, k);
      }
      const one = LearnFlow.prototype._judgeRecord.call(F, g, item, p, ans);
      const two = LearnFlow.prototype._judgeRecord.call(F, g, item, p, ans);   // the same pick again today: practice
      return { r: one.r, first: one.first, again: one.again, first2: two.first, locks: g.locks, queue: g.queue.map((x) => x.id), log, calls: calls.slice(), firsts: F.firsts };
    };
    for (const it of [word, quiz, pron]) {
      const p = prompt(it);
      for (const pick of [it.answer, (it.answer + 1) % p.options.length]) {
        const A = run('card', it, p, pick), B = run('m1', it, p, pick);
        assert.deepEqual(B, A, `${it.id} pick ${pick}: the same judge, the same store call and leaf, the same lock / retry, the same events`);
        assert.equal(A.first, true, 'first of the day'); assert.equal(A.first2, false, 'the second the same day is practice');
        assert.equal(A.r.ok, pick === it.answer);
        assert.deepEqual(A.calls[0].leaf, [pick === it.answer ? 1 : 0, 'L'], 'a lesson answer: L, as the card writes it');
      }
    }
    // the reworded retry (options reshuffled): object k is the reshuffled option k, mapped back through p._perm
    const alt = LearnFlow.prototype._altPrompt.call({}, quiz);
    const k = alt._perm.indexOf(quiz.answer);
    const A = run('card', quiz, alt, k), B = run('m1', quiz, alt, k);
    assert.deepEqual(B, A); assert.equal(A.r.ok, true);
  } finally { store.recordFirst = orig; }
});

test('the strip\'s words: 答对了; 差一点：是 <the right option> + the first sentence of 为什么 (the course\'s own, not 「不对。正确答案…」)', async () => {
  const w1 = await loadWeek(1);
  const word = daySteps(w1, 1).find((s) => s.kind === 'choice').items[0], quiz = daySteps(w1, 1).find((s) => s.items[0].meta.kind === 'quiz').items[0];
  const { judge } = await import('../../src/learn/engine.js');
  const vw = verdictLines(judge(word, (word.answer + 1) % 4), word);
  assert.equal(vw.head, '差一点：是 ' + word.options[word.answer].zh);
  assert.ok(vw.why.includes(word.en) && vw.why.endsWith('。'), vw.why);
  const vq = verdictLines(judge(quiz, (quiz.answer + 1) % 3), quiz);
  assert.ok(vq.head.startsWith('差一点：是 ') && !/不对|正确答案/.test(vq.why), JSON.stringify(vq));
  assert.equal(vq.why, firstSentence(quiz.meta.why));
  const ok = verdictLines(judge(quiz, quiz.answer), quiz);
  assert.equal(ok.ok, true); assert.equal(ok.head, '答对了'); assert.ok(!/^答对了/.test(ok.why));
  assert.equal(firstSentence('第一句。第二句。'), '第一句。');
  assert.ok(firstSentence('x'.repeat(80)).length <= 46);
});

test('one label atlas per gate: a gate\'s distinct labels, shelf-packed into at most LEARN.m1.atlasMax² — a word gate at 2 texels per px in 1024 × 512, the longest banner gates at ≥ 1.5', async () => {
  let worst = { h: 0 }, wordMax = 0, minScale = 9;
  const can = (it, p) => canPlayM1(it, p);
  for (const n of [1, 2, 3]) {
    const w = await loadWeek(n);
    for (const d of w.days) for (const g of planDay(w, d.n, 'puzzle').gates) {
      const labs = gateLabels(g.items, prompt, can, 340);
      if (!labs.length) continue;
      const P = fitAtlas(labs);
      assert.ok(P.fits && P.w <= LEARN.m1.atlasMax && P.h <= LEARN.m1.atlasMax, `w${n}d${d.n} ${g.id}: ${labs.length} labels fit (${P.w}×${P.h} at ${P.scale})`);
      minScale = Math.min(minScale, P.scale);
      if (P.h > worst.h) worst = { h: P.h, gate: `w${n}d${d.n} ${g.id}`, n: labs.length, scale: P.scale };
      if (labs.every((l) => !l.banner)) { assert.equal(P.scale, LEARN.m1.atlasScale, 'ball labels at full scale'); if (g.items.every((it) => it.meta.kind === 'word')) wordMax = Math.max(wordMax, P.h); }
      for (let a = 0; a < P.rects.length; a++) for (let b = a + 1; b < P.rects.length; b++) assert.ok(!overlaps(P.rects[a], P.rects[b]));
    }
  }
  assert.ok(wordMax > 0 && wordMax <= 512, 'a word gate (25 meanings) packs into 1024 × ' + wordMax);
  assert.ok(minScale >= 1.5, 'never under 1.5 texels per px: ' + minScale + ' ' + JSON.stringify(worst));
  // the measures the layout and the atlas share
  assert.equal(textWidth('星期一', 17), 51); assert.equal(labelBox({ text: '星期一', zh: '' }).w, 75);
  assert.equal(packLabels([{ w: 2000, h: 10 }]).fits, false, 'a box wider than the sheet does not fit');
});

test('the frame-time sampler: p50 / p95 by nearest rank over a preallocated ring; off until started; overflow counted, not grown', () => {
  const S = new FrameTimes(8);
  S.push(99); assert.equal(S.stats().n, 0, 'off');
  S.start(); for (const v of [5, 1, 4, 2, 3, 10, 6, 7, 8, 9]) S.push(v);
  const s = S.stop();
  assert.equal(s.n, 8); assert.equal(s.lost, 2); assert.equal(s.p50, 4); assert.equal(s.p95, 10); assert.equal(s.max, 10);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2); assert.equal(percentile([], 0.5), 0);
});
