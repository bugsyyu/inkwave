// src/learn/audio.js, the pure part: where the recordings are (quiet at the dev server's root), which recording a text gets
// (the lesson's Clips.at / Clips.plan over its own speechChunks), and the clip's bytes — a Range request, or the whole shard
// sliced when a server ignores Range — with a fake server; no browser, no app/audio/ needed.
// 用法：node --test tests/learn/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { ielts } from '../../src/learn/ielts.js';
import { createClips, clipsBase } from '../../src/learn/audio.js';

const loc = (href) => { const u = new URL(href); return { href: u.href, pathname: u.pathname, protocol: u.protocol, search: u.search }; };

test('clipsBase: ../audio/ only from a game/ folder (her App, her server), ?audio= names another, ?noclips and file: are off, the dev root makes no request', () => {
  assert.equal(clipsBase(loc('ielts-base://app/game/index.html?learn=w1d1&from=app')), 'ielts-base://app/audio/');
  assert.equal(clipsBase(loc('https://her.example/game/')), 'https://her.example/audio/');
  assert.equal(clipsBase(loc('https://her.example/ielts/game/index.html')), 'https://her.example/ielts/audio/', 'a sub-path deployment');
  assert.equal(clipsBase(loc('http://localhost:8491/?learn=w1d1&kind=puzzle')), '', 'this repo\'s dev server: no ../audio/, no request');
  assert.equal(clipsBase(loc('http://localhost:8491/index.html')), '');
  assert.equal(clipsBase(loc('http://localhost:8491/?audio=http://127.0.0.1:9000/clips')), 'http://127.0.0.1:9000/clips/');
  assert.equal(clipsBase(loc('http://localhost:8491/?audio=../a/')), 'http://localhost:8491/a/');
  assert.equal(clipsBase(loc('ielts-base://app/game/index.html?noclips')), '');
  assert.equal(clipsBase(loc('file:///Users/x/app/game/index.html')), '', 'from disk: the lesson does not fetch either');
});

// a made-up index in the real format: texts + sets[set] = { shards, speed, at: [[shard, offset, length] | null] }
function fakeServer({ range = true } = {}) {
  const texts = ['Monday', 'monday', 'Monday.', 'I have an English class on Monday.', 'Mr. Lee is my teacher.', 'He is kind.', 'cup', 'cap', 'Wednesday'];
  const shard = (n) => Uint8Array.from({ length: 64 }, (_, i) => (n * 64 + i) % 251);
  const at = (set) => texts.map((t, i) => (set === 'us-slow' && i >= 3 && i <= 5 ? null : set === 'gb' && t === 'cap' ? null : [i % 2, (i * 7) % 40, 5 + (i % 3)]));
  const index = { v: 1, model: 'x', voices: {}, names: { us: 'A', gb: 'B' }, texts, sets: { us: { shards: 2, speed: 1, at: at('us') }, gb: { shards: 2, speed: 1, at: at('gb') }, 'us-slow': { shards: 2, speed: 0.8, at: at('us-slow') }, 'gb-slow': { shards: 2, speed: 0.8, at: at('gb-slow') } } };
  const log = [];
  const fetch = async (url, o) => {
    const rel = url.replace('https://her.example/audio/', ''), rg = o && o.headers && o.headers.Range;
    log.push(rel + (rg ? ' ' + rg : ''));
    if (rel === 'index.json') return { ok: true, status: 200, json: async () => JSON.parse(JSON.stringify(index)) };
    const m = /^(us|gb|us-slow|gb-slow)-(\d+)\.mp3$/.exec(rel);
    if (!m || +m[2] > 1) return { ok: false, status: 404 };
    const b = shard(+m[2]);
    if (range && rg) { const [a, z] = rg.replace('bytes=', '').split('-').map(Number); return { ok: true, status: 206, arrayBuffer: async () => b.slice(a, z + 1).buffer }; }
    return { ok: true, status: 200, arrayBuffer: async () => b.slice().buffer };
  };
  return { fetch, log, index, shard };
}

test('which recording: the lesson\'s pieces and lookups; every piece recorded or the device voice says it all; slow, accent', async () => {
  const { Host } = await ielts();
  let accent = 'us';
  const S = fakeServer(), C = createClips({ fetch: S.fetch, base: 'https://her.example/audio/', accent: () => accent, chunks: Host.speechChunks });
  assert.equal(C.plan('Monday'), null, 'nothing before the index is loaded');
  await C.load();
  assert.deepEqual(C.at('us', 'Monday'), S.index.sets.us.at[0], 'as written');
  assert.deepEqual(C.at('us', 'Monday!'), S.index.sets.us.at[0], 'without its stop');
  assert.deepEqual(C.at('us', 'Wednesday.'), S.index.sets.us.at[8], 'without its stop (the list writes "Wednesday")');
  assert.deepEqual(C.at('us', 'Cup'), S.index.sets.us.at[6], 'a capitalised word as in the word list');
  assert.equal(C.at('us', 'CUP'), null, 'only a Capitalised word is lowered');
  assert.equal(C.at('xx', 'cup'), null);
  // a passage in the lesson's pieces (speechChunks keeps "Mr." inside its sentence)
  let p = C.plan('I have an English class on Monday. Mr. Lee is my teacher. He is kind.');
  assert.deepEqual(p.chunks, ['I have an English class on Monday.', 'Mr. Lee is my teacher.', 'He is kind.']);
  assert.deepEqual([p.set, p.rate, p.at.length], ['us', 1, 3]);
  assert.equal(C.plan('I have an English class on Monday. Nobody recorded this one.'), null, 'one piece missing: the device voice says the whole text');
  // slow: the slow take when every piece has one, else the everyday take at 0.8
  assert.deepEqual([C.plan('cup', true).set, C.plan('cup', true).rate], ['us-slow', 1]);
  assert.deepEqual([C.plan('He is kind.', true).set, C.plan('He is kind.', true).rate], ['us', 0.8]);
  accent = 'gb';
  assert.equal(C.plan('cup').set, 'gb');
  assert.equal(C.plan('cap'), null, 'her accent has no recording of it: the device voice (no silent switch to the other accent)');
  assert.equal(C.plan(''), null);
});

test('the clip\'s bytes: a Range request (206) gives exactly the clip; a server that ignores Range sends the shard once, then slices', async () => {
  const S = fakeServer({ range: true }), C = createClips({ fetch: S.fetch, base: 'https://her.example/audio/', chunks: (t) => [t] });
  await C.load();
  const a = C.at('us', 'cup');
  const b = new Uint8Array(await C.bytes('us', a));
  assert.deepEqual([...b], [...S.shard(a[0]).slice(a[1], a[1] + a[2])]);
  assert.equal(S.log[1], 'us-' + a[0] + '.mp3 bytes=' + a[1] + '-' + (a[1] + a[2] - 1));
  await C.bytes('us', a);
  assert.equal(S.log.length, 2, 'the same clip again comes from memory');
  assert.equal(C.n.range, 1);

  const T = fakeServer({ range: false }), D = createClips({ fetch: T.fetch, base: 'https://her.example/audio/', chunks: (t) => [t], maxShards: 2 });
  await D.load();
  const x = D.at('us', 'Monday'), y = D.at('us', 'monday'), z = D.at('us', 'Monday.');   // shards 0, 1, 0
  assert.deepEqual([...new Uint8Array(await D.bytes('us', x))], [...T.shard(x[0]).slice(x[1], x[1] + x[2])]);
  assert.equal(D.range, false, 'the server ignored Range: no more Range requests');
  assert.deepEqual([...new Uint8Array(await D.bytes('us', z))], [...T.shard(z[0]).slice(z[1], z[1] + z[2])]);
  assert.equal(T.log.filter((l) => l.startsWith('us-0.mp3')).length, 1, 'shard 0 fetched once');
  await D.bytes('us', y);
  await D.bytes('gb', D.at('gb', 'cup'));
  assert.ok(D.shards.size <= 2, 'kept up to the limit (a voice set\'s twelve by default)');
  assert.ok(T.log.every((l) => !/bytes=/.test(l) || l.startsWith('us-0.mp3')), 'only the first request asked for a range');
});

test('no recordings (404, a broken index, no base): off, quietly — plan() is null and the caller uses the device voice', async () => {
  const C = createClips({ fetch: async () => ({ ok: false, status: 404 }), base: 'https://her.example/audio/' });
  assert.equal(await C.load(), null);
  assert.equal(C.off, true);
  assert.equal(C.plan('Monday'), null);
  const D = createClips({ fetch: async () => ({ ok: true, status: 200, json: async () => ({ v: 2 }) }), base: 'https://her.example/audio/' });
  assert.equal(await D.load(), null);
  const E = createClips({ fetch: async () => { throw new TypeError('Failed to fetch'); }, base: 'https://her.example/audio/' });
  assert.equal(await E.load(), null);
  const F = createClips({ fetch: null, base: '' });
  assert.equal(F.off, true);
  assert.equal(await F.load(), null);
});
