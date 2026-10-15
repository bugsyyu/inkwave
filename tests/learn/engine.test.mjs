// src/learn/engine.js: judge() is IELTS-Base's check — dictation (host dictScore: British = American, digits, case, 80 %),
// a typed word (Model.spellCheck), choice / listen / pron (the index), a written sentence (WT key forms) — and every
// `why` is Chinese. prompt() gives the five input shapes.
// 用法：node --test tests/learn/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWeek, daySteps } from '../../src/learn/content.js';
import { prompt, judge } from '../../src/learn/engine.js';

const CJK = /[一-鿿]/;
let steps = null;
const day1 = async () => { if (!steps) steps = daySteps(await loadWeek(1), 1); return steps; };
const stepOf = async (t) => (await day1()).find((s) => s.meta.type === t);
// an item of our own shape, for vectors the week does not contain
const dictItem = (ref, zh) => ({ id: 'd:test', en: ref, zh, tts: ref, audio: null, meta: { kind: 'dict', input: 'type', scored: true, step: 'test', ref } });
const wordItem = (en, zh) => ({ id: 'w:' + en.toLowerCase(), en, zh, tts: en, audio: null, meta: { kind: 'word', input: 'type', typed: true, scored: true, step: 'test', ref: en, hint: zh } });
const writeItem = (ref, zh) => ({ id: 'x:test', en: ref, zh, tts: null, audio: null, meta: { kind: 'write', input: 'write', scored: true, step: 'test', ref } });
function zhWhy(v, label) { assert.equal(typeof v.why, 'string'); assert.ok(CJK.test(v.why), label + ': why in Chinese: ' + v.why); assert.equal(typeof v.canonical, 'string'); }

test('dictation: the host\'s score — 88 % with a swallowed ending passes (80 %), case never matters, British = American, digits are words, empty is not an answer', async () => {
  const it = (await stepOf('dictation')).items[4];
  assert.equal(it.en, 'The course starts on the fifth of September.');
  let v = judge(it, 'the course start on the fifth of september');
  assert.equal(v.ok, true); assert.equal(v.pct, 88); assert.match(v.why, /88%/); assert.match(v.why, /starts（词尾吞了，写成了 start）/); assert.equal(v.canonical, it.en); assert.equal(v.zh, '课程九月五号开始。'); zhWhy(v, 'LD 88');
  v = judge(it, 'THE COURSE STARTS ON THE FIFTH OF SEPTEMBER.');
  assert.equal(v.ok, true); assert.equal(v.pct, 100); assert.match(v.why, /100%，过了/); assert.ok(v.toks.every((t) => t.ok !== false)); zhWhy(v, 'LD caps');
  v = judge(it, 'the course on the fifth');
  assert.equal(v.ok, false); assert.equal(v.pct, 63); assert.match(v.why, /还没到 80%/); assert.match(v.why, /starts（/); zhWhy(v, 'LD 63');
  v = judge(it, '   ');
  assert.equal(v.ok, false); assert.equal(v.pct, 0); assert.equal(v.why, '还没写。');
  v = judge(dictItem('My favourite colour is blue.', '我最喜欢的颜色是蓝色。'), 'my favorite color is blue');
  assert.equal(v.ok, true); assert.equal(v.pct, 100, '英美拼法同一个词');
  v = judge(dictItem('It costs thirteen pounds.', '它要十三英镑。'), 'it costs 13 pounds');
  assert.equal(v.ok, true); assert.equal(v.pct, 100, '13 = thirteen');
  v = judge(dictItem('I relax at the weekend.', '我周末放松一下。'), 'I relax the weekend');
  assert.equal(v.ok, true); assert.equal(v.pct, 80, '4 of 5: exactly the pass mark'); assert.match(v.why, /80%，过了/); assert.match(v.why, /at（弱读小词没听出）/);
  const p = prompt(it);
  assert.equal(p.type, 'type'); assert.equal(p.tts, it.en); assert.ok(CJK.test(p.text)); assert.ok(!p.text.includes('September'), 'the sentence is heard, not shown');
});

test('a typed word (the card dictation): letters decide, case never, British = American, a digit is not a word, a near miss is marked close', async () => {
  const card = (await stepOf('flash')).items[0];
  assert.equal(card.en, 'Monday');
  for (const x of ['Monday', 'monday', 'MONDAY', ' monday ']) { const v = judge(card, x); assert.equal(v.ok, true, x); assert.equal(v.why, '拼对了。'); assert.equal(v.canonical, 'Monday'); }
  let v = judge(card, 'Mondy');
  assert.equal(v.ok, false); assert.match(v.why, /拼写不对：写成了 Mondy，应该是 Monday/); assert.ok(Array.isArray(v.ops) && v.ops.some((o) => o[0] === '-' && o[1] === 'a')); zhWhy(v, 'VS spell');
  assert.equal(judge(card, '').why, '还没写。');
  v = judge(wordItem('favourite', '最喜欢的'), 'favorite');
  assert.equal(v.ok, true); assert.match(v.why, /英美拼法都算对/);
  v = judge(wordItem('colour', '颜色'), 'COLOR');
  assert.equal(v.ok, true);
  v = judge(wordItem('October', '十月'), 'Octorber');
  assert.equal(v.ok, false); assert.match(v.why, /拼写不对/); assert.equal(v.close, false);
  v = judge(wordItem('fifteen', '十五'), '15');
  assert.equal(v.ok, false); assert.match(v.why, /数字要写成英文单词：fifteen/);
  v = judge(wordItem('living room', '客厅'), 'living-room');
  assert.equal(v.ok, false); assert.equal(v.close, true, 'a hyphen instead of a space: close (「我的写法也对」)');
  const p = prompt(card);
  assert.equal(p.type, 'type'); assert.equal(p.tts, 'Monday'); assert.deepEqual(p.hint, { zh: '星期一', ipa: 'ˈmʌndeɪ' }); assert.ok(!p.text.includes('Monday'));
});

test('choice: the grammar quiz by index, numeric string or option text; the explanation travels in why', async () => {
  const q = (await stepOf('grammar')).items[0];
  assert.equal(q.answer, 2);
  let v = judge(q, 2);
  assert.equal(v.ok, true); assert.match(v.why, /^答对了。/); assert.match(v.why, /形容词/); assert.equal(v.canonical, '形容词'); zhWhy(v, 'GF ok');
  v = judge(q, '2'); assert.equal(v.ok, true);
  v = judge(q, '形容词'); assert.equal(v.ok, true, 'the option text is accepted too');
  v = judge(q, 0);
  assert.equal(v.ok, false); assert.match(v.why, /不对。正确答案：形容词/); zhWhy(v, 'GF wrong');
  v = judge(q, null);
  assert.equal(v.ok, false); assert.match(v.why, /还没选/);
  const word = (await stepOf('words')).items[0];
  v = judge(word, word.answer); assert.equal(v.ok, true); assert.equal(v.why, '对，Monday 是「星期一」。'); assert.equal(v.canonical, '星期一');
  v = judge(word, (word.answer + 1) % word.options.length); assert.equal(v.ok, false); assert.match(v.why, /Monday 是「星期一」，不是「/);
  const p = prompt(word);
  assert.equal(p.type, 'choice'); assert.equal(p.text, 'Monday'); assert.ok(CJK.test(p.zh)); assert.equal(p.options.length, 4); assert.equal(p.options[word.answer].text, '星期一');
  const pq = prompt(q);
  assert.equal(pq.type, 'choice'); assert.equal(pq.text, q.en); assert.deepEqual(pq.options.map((o) => o.text), ['名词', '动词', '形容词']);
});

test('listen: a minimal pair (one word played, both offered) and a reading passage (played, then its question)', async () => {
  const pr = (await stepOf('pairs')).items.find((it) => it.id === 'p:cap|cup');
  const played = pr.options[pr.answer].en, other = pr.options[1 - pr.answer].en;
  let v = judge(pr, pr.answer);
  assert.equal(v.ok, true); assert.equal(v.why, '对了，是 ' + played + '（' + pr.options[pr.answer].zh + '）。'); assert.equal(v.canonical, played);
  v = judge(pr, 1 - pr.answer);
  assert.equal(v.ok, false); assert.ok(v.why.includes(played) && v.why.includes(other)); assert.match(v.why, /再听一下/); zhWhy(v, 'LP');
  v = judge(pr, played); assert.equal(v.ok, true, 'the word itself as the answer');
  const p = prompt(pr);
  assert.equal(p.type, 'choice'); assert.equal(p.tts, played); assert.deepEqual(p.options.map((o) => o.text), ['cap', 'cup']); assert.deepEqual(p.options.map((o) => o.zh), ['帽子', '杯子']);
  const rd = await stepOf('reading'), r0 = rd.items[0];
  const pr0 = prompt(r0);
  assert.equal(pr0.type, 'choice'); assert.equal(pr0.tts, rd.meta.passage.en); assert.equal(pr0.text, 'How many days does Lily work every week?'); assert.equal(pr0.zh, 'Lily 每周工作几天？');
  v = judge(r0, r0.answer); assert.equal(v.ok, true); assert.match(v.why, /from Monday to Friday/);
  v = judge(r0, (r0.answer + 1) % 3); assert.equal(v.ok, false); assert.match(v.why, /正确答案：Five/); zhWhy(v, 'read');
});

test('pron: which word has the sound (week 1), the pack\'s stress quiz (week 3)', async () => {
  const sym = (await stepOf('symbols')).items[5];
  assert.equal(sym.en, '/ʌ/');
  let v = judge(sym, sym.answer);
  assert.equal(v.ok, true); assert.match(v.why, /^对，cup（杯子） 里有 \/ʌ\/。/); assert.equal(v.canonical, 'cup'); zhWhy(v, 'PS ok');
  v = judge(sym, (sym.answer + 1) % 4);
  assert.equal(v.ok, false); assert.match(v.why, /^\/ʌ\/ 在 cup（杯子） 里，/); assert.match(v.why, /里没有。/); zhWhy(v, 'PS wrong');
  const p = prompt(sym);
  assert.equal(p.type, 'choice'); assert.equal(p.text, '哪个词里有 /ʌ/ 这个音？'); assert.equal(p.zh, '短元音'); assert.equal(p.options.length, 4); assert.equal(p.options[sym.answer].text, 'cup');
  const w3 = await loadWeek(3), st = daySteps(w3, 1).find((s) => s.kind === 'pron'), q = st.items[0];
  assert.equal(q.en, 'museum 的重音在哪个音节？'); assert.deepEqual(q.options.map((o) => o.en), ['mu', 'se', 'um']); assert.equal(q.answer, 1);
  v = judge(q, 1); assert.equal(v.ok, true); assert.match(v.why, /mu-SE-um/);
  v = judge(q, 0); assert.equal(v.ok, false); assert.match(v.why, /正确答案：se/);
});

test('write (WT key forms): case never matters, be / third-person -s / article / time preposition are named in Chinese; lesson items are not scored', async () => {
  const x = (await stepOf('write')).items[1];
  assert.equal(x.meta.ref, 'My birthday is in October.');
  let v = judge(x, 'my birthday is in october');
  assert.equal(v.ok, true); assert.equal(v.why, '句子对了。'); assert.equal(v.canonical, 'My birthday is in October.');
  v = judge(x, 'My birthday is on October.');
  assert.equal(v.ok, false); assert.match(v.why, /时间介词：on → in October/); zhWhy(v, 'WT prep');
  v = judge(x, 'my birthday on october');
  assert.equal(v.ok, false); assert.match(v.why, /少了 be 动词 is/); assert.equal(v.claimable, false);
  v = judge(writeItem('Lily works from Monday to Friday.', 'Lily 周一到周五上班。'), 'Lily work from Monday to Friday.');
  assert.equal(v.ok, false); assert.match(v.why, /第三人称单数要加 -s：work → works/);
  v = judge(writeItem('I am a student.', '我是学生。'), 'I am student.');
  assert.equal(v.ok, false); assert.match(v.why, /名词前要加冠词/);
  v = judge(writeItem('Tomorrow is Saturday.', '明天是星期六。'), 'tromroww is sterday');
  assert.equal(v.ok, false); assert.match(v.why, /拼写：tromroww → Tomorrow/);
  assert.equal(judge(x, '').why, '还没写。');
  assert.equal(prompt(x).type, 'write'); assert.equal(prompt(x).text, '我的生日在十月。');
  const sp = (await stepOf('speak')).items[0];
  v = judge(sp, 'anything');
  assert.equal(v.ok, true); assert.equal(v.why, '看完就好，不计分。'); assert.equal(prompt(sp).type, 'read'); assert.equal(prompt(sp).zh, '你最喜欢星期几？为什么？');
});

test('every judge() of day 1, right and wrong, speaks Chinese and names the canonical answer', async () => {
  for (const s of await day1()) for (const it of s.items) {
    const answers = it.meta.input === 'choice' ? [it.answer, (it.answer + 1) % it.options.length] : it.meta.input === 'read' ? [''] : [it.meta.ref, 'zzz'];
    for (const a of answers) { const v = judge(it, a); zhWhy(v, it.id + ' ← ' + a); assert.equal(typeof v.ok, 'boolean'); }
    const p = prompt(it);
    assert.ok(['type', 'choice', 'write', 'read'].includes(p.type), it.id); assert.equal(typeof p.text, 'string'); assert.equal(typeof p.zh, 'string');
  }
});
