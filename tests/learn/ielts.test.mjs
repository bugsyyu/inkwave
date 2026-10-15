// src/learn/ielts.js + vendor/ielts/*: the copied IELTS-Base engine loads as ES modules in Node (the same path the page
// takes), the copies are the bytes SOURCE.json says (verbatim), and the host's dictScore scores as the lesson does.
// 用法：node --test tests/learn/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { ielts, ieltsNow, ieltsLoaded } from '../../src/learn/ielts.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const VENDOR = path.join(ROOT, 'vendor', 'ielts');
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

test('vendor/ielts/* register on BaseEngine when imported as ES modules; the handle has the six modules', async () => {
  assert.equal(ieltsLoaded(), false);
  assert.throws(() => ieltsNow(), /not loaded/);
  const I = await ielts();
  assert.equal(ieltsLoaded(), true);
  assert.equal(ieltsNow(), I);
  assert.equal(await ielts(), I, 'one load');
  for (const k of ['Model', 'Bank', 'Gen', 'Sched', 'Mark', 'Host']) assert.equal(typeof I[k], 'object', k);
  assert.equal(typeof I.Model.buildIndex, 'function');
  assert.equal(typeof I.Gen.check, 'function');
  assert.equal(typeof I.Sched.state, 'function');
  assert.equal(typeof I.Mark.combine, 'function');
  assert.equal(typeof I.Bank.FORMATS, 'object');
  assert.equal(typeof I.Host.dictScore, 'function');
});

test('SOURCE.json: every copied file still has the sha256 recorded at export (verbatim copies, nothing edited by hand)', () => {
  const src = JSON.parse(fs.readFileSync(path.join(VENDOR, 'SOURCE.json'), 'utf8'));
  assert.match(src.commit, /^[0-9a-f]{40}$/);
  assert.equal(src.repo, 'bugsyyu/IELTS-Base');
  for (const [name, f] of Object.entries(src.files)) {
    const buf = fs.readFileSync(path.join(VENDOR, name));
    assert.equal(sha256(buf), f.sha256, name + ' changed since the export');
    assert.equal(buf.length, f.bytes, name);
  }
  assert.equal(sha256(fs.readFileSync(path.join(VENDOR, src.host.file))), src.host.sha256, 'host.js changed since the export');
  for (const name of ['esc', 'fdUs', 'toks', 'normTok', 'lcsOk', 'numWords', 'dictWords', 'tokMarks', 'dictScore']) {
    const r = src.host.lines[name];
    assert.ok(Array.isArray(r) && r[0] > 0 && r[1] >= r[0], 'host line range for ' + name);
  }
  for (const name of ['w1.json', 'w2.json', 'w3.json', 'symbols.json']) {
    assert.equal(sha256(fs.readFileSync(path.join(ROOT, 'content', name))), src.content[name].sha256, 'content/' + name + ' changed since the export');
  }
});

test('host.js dictScore: the lesson\'s score — percent and per-word marks, British = American, digits as words, case never matters', async () => {
  const { Host, Model } = await ielts();
  let r = Host.dictScore('The course starts on the fifth of September.', 'the course start on the fifth of september');
  assert.equal(r.pct, 88); assert.equal(r.good, 7); assert.equal(r.n, 8);
  assert.match(r.html, /class="tok miss">starts</);
  assert.equal(Host.dictScore('My favourite colour is blue.', 'my favorite color is blue').pct, 100, '英美拼法同一个词');
  assert.equal(Host.dictScore('It costs thirteen pounds.', 'IT COSTS 13 POUNDS').pct, 100, '数字写成阿拉伯数字也对，大小写不看');
  assert.equal(Host.dictScore('I have an English class on Monday.', '').pct, 0);
  assert.equal(Host.fdUs('colour'), Model.usForm('colour'), 'fdUs reaches BaseEngine.Model through the UMD root');
  assert.deepEqual(Host.numWords('21st'), ['twenty', 'first']);
});
