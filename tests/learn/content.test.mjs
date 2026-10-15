// src/learn/content.js: the three weeks load, every step has one of the five kinds, every item carries the id IELTS-Base's
// index gives it (so the evidence is hers), every English item has its Chinese (LEARN §1 #4), nothing of a day is dropped.
// 用法：node --test tests/learn/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWeek, daySteps, dayOf, weekIndex, itemOf, KINDS } from '../../src/learn/content.js';

const CJK = /[一-鿿]/;
const LATIN = /[A-Za-z]/;
const allSteps = (w) => w.days.flatMap((d) => daySteps(w, d.n));

test('loadWeek(1..3): seven days each, every step one of the five kinds, step ids unique in a day, minutes as the pack says', async () => {
  for (const n of [1, 2, 3]) {
    const w = await loadWeek(n);
    assert.equal(w.id, 'w' + n); assert.equal(Number(w.n), n); assert.ok(CJK.test(w.title), w.title);
    assert.equal(w.days.length, 7);
    for (const d of w.days) {
      const steps = daySteps(w, d.n);
      const packSteps = ['a', 'b', 'c'].flatMap((s) => d[s] || []);
      assert.equal(steps.length, packSteps.length, d.id + ': every step of the pack becomes a game step');
      const ids = new Set(steps.map((s) => s.id));
      assert.equal(ids.size, steps.length, d.id + ' step ids unique');
      steps.forEach((s, i) => {
        assert.ok(KINDS.includes(s.kind), s.id + ' kind ' + s.kind);
        assert.equal(s.id, d.id + ':' + packSteps[i].id);
        assert.equal(s.minutes, Number(packSteps[i].m) || 0);
        assert.ok(s.title && typeof s.title === 'string');
        assert.ok(Array.isArray(s.items));
        assert.equal(s.meta.day.id, d.id);
      });
    }
  }
});

test('every item: id, en, zh, tts, audio, meta.kind / meta.input; choice items have ≥ 2 options with the answer in range; every scored English item has Chinese', async () => {
  const seen = { kinds: new Set(), inputs: new Set() };
  let items = 0, noZh = [];
  for (const n of [1, 2, 3]) {
    const w = await loadWeek(n);
    for (const s of allSteps(w)) for (const it of s.items) {
      items++;
      assert.equal(typeof it.id, 'string'); assert.ok(it.id, s.id);
      assert.equal(typeof it.en, 'string'); assert.equal(typeof it.zh, 'string');
      assert.ok(it.tts === null || typeof it.tts === 'string');
      assert.equal(it.audio, null, 'no audio files yet: audio stays null, tts carries the text');
      assert.ok(it.meta && typeof it.meta.kind === 'string' && typeof it.meta.input === 'string', s.id);
      assert.equal(it.meta.step, s.id);
      seen.kinds.add(it.meta.kind); seen.inputs.add(it.meta.input);
      if (it.meta.input === 'choice') {
        assert.ok(Array.isArray(it.options) && it.options.length >= 2, it.id + ' options');
        assert.ok(Number.isInteger(it.answer) && it.answer >= 0 && it.answer < it.options.length, it.id + ' answer');
        it.options.forEach((o) => { assert.equal(typeof o.en, 'string'); assert.equal(typeof o.zh, 'string'); });
        const seenOpt = new Set(it.options.map((o) => o.en + '|' + o.zh));
        assert.equal(seenOpt.size, it.options.length, it.id + ' options distinct');
      }
      // a quiz stem may itself be Chinese around an English fragment (「在 a cup of tea 里，of 通常读成？」): that is its Chinese
      const hasZh = CJK.test(it.zh) || ((it.meta.kind === 'quiz' || it.meta.kind === 'read') && CJK.test(it.en));
      if (it.meta.scored && LATIN.test(it.en) && !hasZh) noZh.push(it.id);
    }
  }
  assert.deepEqual(noZh, [], 'English without Chinese');
  assert.ok(items > 2000, 'items ' + items);
  assert.deepEqual([...seen.kinds].sort(), ['dict', 'lesson', 'pair', 'quiz', 'read', 'speak', 'sym', 'word', 'write']);
  assert.deepEqual([...seen.inputs].sort(), ['choice', 'read', 'type', 'write']);
});

test('w1d1: the ten steps of the pack, in order, with their kinds and item counts; ids are the index\'s (w:monday, s:ʌ, p:cap|cup, d:w1d1:b1:…)', async () => {
  const w = await loadWeek(1);
  const steps = daySteps(w, 1);
  assert.deepEqual(steps.map((s) => s.id.split(':')[1] + ':' + s.kind + ':' + s.items.length),
    ['a1:pron:8', 'a2:choice:25', 'a3:choice:6', 'b1:dictation:5', 'b2:listen:3', 'b3:listen:8', 'b4:dictation:25', 'c1:lesson:5', 'c2:lesson:1', 'c3:lesson:1']);
  const by = (t) => steps.find((s) => s.meta.type === t);
  assert.equal(by('symbols').items[5].id, 's:ʌ');
  assert.equal(by('words').items[0].id, 'w:monday');
  assert.equal(by('flash').items[0].id, 'w:monday', 'the flash cards are the same items as the word list');
  assert.ok(by('pairs').items.some((it) => it.id === 'p:cap|cup'));
  assert.match(by('dictation').items[0].id, /^d:w1d1:b1:[0-9a-z]{6}$/);
  assert.match(by('grammar').items[0].id, /^q:w1d1:a3:[0-9a-z]{6}$/);
  assert.match(by('reading').items[0].id, /^q:w1d1:b2:q:[0-9a-z]{6}$/);
  assert.match(by('write').items[0].id, /^x:w1d1:c1:[0-9a-z]{6}$/);
  assert.equal(by('speak').items[0].id, 'k:w1d1:c2');
  // the index behind it is IELTS-Base's: the same ids, and itemOf finds them
  const index = weekIndex(w);
  for (const s of steps) for (const it of s.items) if (it.meta.kind !== 'lesson') assert.ok(index.items.has(it.id), it.id);
  assert.equal(itemOf('w:monday').item.kind, 'word');
  assert.equal(itemOf('no:such'), null);
  // what each kind carries
  const sym = by('symbols').items[5];
  assert.equal(sym.en, '/ʌ/'); assert.ok(CJK.test(sym.zh)); assert.equal(sym.options[sym.answer].en, sym.meta.examples[0].en); assert.equal(sym.options.length, 4);
  const word = by('words').items[0];
  assert.equal(word.en, 'Monday'); assert.equal(word.tts, 'Monday'); assert.equal(word.options[word.answer].zh, '星期一'); assert.equal(word.meta.ipa, 'ˈmʌndeɪ');
  const card = by('flash').items[0];
  assert.equal(card.meta.input, 'type'); assert.equal(card.meta.typed, true); assert.equal(card.meta.ref, 'Monday'); assert.equal(card.meta.hint, '星期一');
  const q = by('grammar').items[0];
  assert.equal(q.en, 'cheap 是什么词性？'); assert.equal(q.options[q.answer].en, '形容词'); assert.ok(q.meta.why);
  assert.ok(Array.isArray(by('grammar').meta.lesson) && by('grammar').meta.lesson.length > 0, 'the lesson rows travel with the quiz');
  const d = by('dictation').items[4];
  assert.equal(d.en, 'The course starts on the fifth of September.'); assert.equal(d.tts, d.en); assert.equal(d.zh, '课程九月五号开始。'); assert.equal(d.meta.ref, d.en);
  const r = by('reading').items[0];
  assert.equal(r.tts, by('reading').meta.passage.en, 'a reading question plays the passage'); assert.ok(by('reading').meta.passage.zh);
  const p = by('pairs').items.find((it) => it.id === 'p:cap|cup');
  assert.deepEqual(p.options, [{ en: 'cap', zh: '帽子' }, { en: 'cup', zh: '杯子' }]); assert.equal(p.tts, p.options[p.answer].en);
  const x = by('write').items[1];
  assert.equal(x.zh, '我的生日在十月。'); assert.equal(x.meta.ref, 'My birthday is in October.'); assert.equal(x.meta.input, 'write'); assert.equal(x.meta.scored, true);
  const k = by('speak').items[0];
  assert.equal(k.meta.scored, false); assert.ok(k.meta.model && k.meta.phrases.length);
  assert.equal(by('checkin').items[0].zh, dayOf(w, 1).teacher);
});

test('the review day keeps everything: 48 sounds, the week\'s 150 words as cards, the week\'s pairs; w2/w3 pron steps are the pack\'s own stress / weak-form quizzes', async () => {
  const w1 = await loadWeek(1);
  const d7 = daySteps(w1, 7);
  assert.deepEqual(d7.map((s) => s.id.split(':')[1] + ':' + s.kind + ':' + s.items.length), ['a1:pron:48', 'a2:listen:10', 'a3:dictation:150', 'b1:choice:10', 'b2:lesson:1', 'b3:lesson:1', 'c1:lesson:1']);
  const w2 = await loadWeek(2), w3 = await loadWeek(3);
  for (const w of [w2, w3]) {
    const steps = allSteps(w);
    assert.equal(steps.length, 77);
    assert.equal(steps.reduce((a, s) => a + s.items.length, 0), 752);
    const pron = steps.filter((s) => s.kind === 'pron');
    assert.equal(pron.length, 7, w.id + ' a pron lesson every day (step a2; the review day too)');
    pron.forEach((s) => { assert.equal(s.meta.k, 'pron'); assert.ok(s.items.length >= 3); assert.equal(s.items[0].meta.input, 'choice'); });
  }
  assert.equal(w2.days[0].a[2].words[0].length, 4, 'the packs carry the US IPA');
  assert.equal(w1.days[0].a[1].words[0].length, 4, 'the exported week 1 does too (formatExampleWeek)');
});
