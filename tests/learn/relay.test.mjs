// server/node/relay.mjs — the Node relay speaks the Cloudflare Worker's wire format word for word (docs/NET.md,
// LEARN.md §14): welcome / join / leave / err, "b|" fan-out, "s|to|" to one member, "m|from|" in, ping / pong, the host's
// lock, the 8-player cap, host election by join order, the origin rule, the silence sweep, the size and rate caps — and
// the hand-written RFC 6455 framing (16- and 64-bit lengths, masking, fragments, control frames).
// Real sockets on 127.0.0.1 with Node's own WebSocket client; no npm install.
// 用法：node --test tests/learn/*.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from 'node:http';
import { connect as tcp } from 'node:net';
import { randomBytes } from 'node:crypto';
import { createRelay, PROTO, MAX, SILENT_LOBBY } from '../../server/node/relay.mjs';

const ORIGIN = 'http://localhost:8490';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a client: every frame it gets, in order; next(pred) waits for the first unread one that matches
function client(port, code, name, { create = false, v = PROTO, origin = ORIGIN, path = '/room/' } = {}) {
  const url = `ws://127.0.0.1:${port}${path}${code}?name=${encodeURIComponent(name)}&v=${v}${create ? '&create=1' : ''}`;
  const ws = new WebSocket(url, { headers: { Origin: origin } });
  const C = { ws, got: [], closed: null, waiters: [], failed: false };
  const pump = () => { for (const w of C.waiters.slice()) { const i = C.got.findIndex((x, k) => k >= w.from && w.pred(x)); if (i >= 0) { C.waiters.splice(C.waiters.indexOf(w), 1); w.from = i + 1; w.res(C.got[i]); } } };
  ws.onmessage = (e) => { C.got.push(typeof e.data === 'string' ? e.data : ''); pump(); };
  ws.onclose = (e) => { C.closed = { code: e.code, reason: e.reason }; for (const w of C.waiters.splice(0)) w.rej(new Error('closed ' + e.code + ' ' + e.reason)); };
  ws.onerror = () => { C.failed = true; };
  C.next = (pred, ms = 2000) => new Promise((res, rej) => {
    const w = { pred: typeof pred === 'string' ? (x) => x.startsWith(pred) || x.includes(`"t":"${pred}"`) : pred, res, rej, from: 0 };
    C.waiters.push(w); pump();
    setTimeout(() => { const i = C.waiters.indexOf(w); if (i >= 0) { C.waiters.splice(i, 1); rej(new Error('timeout waiting')); } }, ms);
  });
  C.json = async (t, ms) => JSON.parse(await C.next((x) => { try { return x[0] === '{' && JSON.parse(x).t === t; } catch { return false; } }, ms));
  C.send = (s) => ws.send(s);
  C.close = () => { try { ws.close(); } catch { /* gone */ } };
  C.ended = () => new Promise((res) => { if (C.closed) res(C.closed); else ws.addEventListener('close', () => res(C.closed)); });
  return C;
}

async function withRelay(fn, opts = {}) {
  const relay = createRelay({ quiet: true, ...opts });
  const port = await relay.listen(0, '127.0.0.1');
  const clients = [];
  const mk = (...a) => { const c = client(port, ...a); clients.push(c); return c; };
  try { await fn({ relay, port, mk }); } finally { for (const c of clients) c.close(); await sleep(20); await relay.close(); }
}

const httpGet = (port, path, headers = {}) => new Promise((res, rej) => {
  const r = request({ host: '127.0.0.1', port, path, headers }, (resp) => { let b = ''; resp.on('data', (d) => (b += d)); resp.on('end', () => res({ status: resp.statusCode, body: b, headers: resp.headers })); });
  r.on('error', rej); r.end();
});
// a raw upgrade request (to set Host / Origin freely): resolves with the HTTP status line's code
const upgrade = (port, path, headers) => new Promise((res, rej) => {
  const r = request({ host: '127.0.0.1', port, path, headers: { Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13', 'Sec-WebSocket-Key': randomBytes(16).toString('base64'), ...headers } });
  r.on('upgrade', (resp, sock) => { sock.destroy(); res(resp.statusCode); });
  r.on('response', (resp) => { resp.resume(); res(resp.statusCode); });
  r.on('error', rej); r.end();
});

test('relay HTTP: /health and /relay/health answer ok; other paths 404; a room path without an upgrade is 426; a bad code 400', async () => {
  await withRelay(async ({ port }) => {
    const h = await httpGet(port, '/health');
    assert.equal(h.status, 200); assert.equal(h.body, 'ok'); assert.equal(h.headers['access-control-allow-origin'], '*');
    assert.equal((await httpGet(port, '/relay/health')).body, 'ok');
    assert.equal((await httpGet(port, '/nope')).status, 404);
    assert.equal((await httpGet(port, '/room/ABCDE')).status, 426);
    assert.equal((await httpGet(port, '/room/AB')).status, 400);
    assert.equal(await upgrade(port, '/room/AB', { Origin: ORIGIN }), 400);
  });
});

test('relay rooms: create → welcome (you are host), join → welcome with both and a join for the host; unknown code, taken code, old client refused with err + 4000', async () => {
  await withRelay(async ({ mk }) => {
    const a = mk('K7QXM', 'Ann', { create: true });
    const wa = await a.json('welcome');
    assert.equal(wa.host, wa.id); assert.deepEqual(wa.members, [{ id: wa.id, name: 'Ann' }]); assert.match(wa.id, /^[0-9A-Z]{4}$/);
    const b = mk('k7qxm', 'Bo b!', {});   // (codes are case-insensitive; names keep letters, digits, space and ._-!?')
    const wb = await b.json('welcome');
    assert.equal(wb.host, wa.id); assert.deepEqual(wb.members.map((m) => m.name), ['Ann', 'Bo b!']);
    const j = await a.json('join'); assert.deepEqual(j.m, { id: wb.id, name: 'Bo b!' });
    const nf = mk('ZZZZZ', 'X', {}); assert.equal((await nf.json('err')).e, 'Room not found'); assert.equal((await nf.ended()).code, 4000);
    const tk = mk('K7QXM', 'X', { create: true }); assert.equal((await tk.json('err')).e, 'Room code taken');
    const old = mk('K7QXM', 'X', { v: 0 }); assert.match((await old.json('err')).e, /refresh/);
  });
});

test('relay fan-out: "b|" reaches everyone else as "m|<from>|…", "s|<to>|" only its target; ping → pong (text and JSON)', async () => {
  await withRelay(async ({ mk }) => {
    const a = mk('ROOM1', 'A', { create: true }); const ida = (await a.json('welcome')).id;
    const b = mk('ROOM1', 'B'); const idb = (await b.json('welcome')).id;
    const c = mk('ROOM1', 'C'); const idc = (await c.json('welcome')).id;
    a.send('b|{"k":"t","x":1}');
    assert.equal(await b.next('m|'), `m|${ida}|{"k":"t","x":1}`);
    assert.equal(await c.next('m|'), `m|${ida}|{"k":"t","x":1}`);
    c.send(`s|${idb}|{"k":"lq","q":3}`);
    assert.equal(await b.next((x) => x.includes('"lq"')), `m|${idc}|{"k":"lq","q":3}`);
    await sleep(60);
    assert.ok(!a.got.some((x) => x.includes('"lq"')), 'a direct message only reaches its target');
    assert.ok(!a.got.some((x) => x.startsWith(`m|${ida}`)), 'nobody hears themselves');
    a.send('ping'); assert.equal(await a.next((x) => x === 'pong'), 'pong');
    a.send('{"t":"ping","c":42}'); assert.deepEqual(JSON.parse(await a.next((x) => x.includes('"pong"'))), { t: 'pong', c: 42 });
  });
});

test('relay lock / cap / host election: only the host locks; a locked room refuses "Match in progress"; the 9th is "Room is full"; the host leaving hands the room to the next oldest', async () => {
  await withRelay(async ({ mk }) => {
    const a = mk('LOCKS', 'A', { create: true }); const ida = (await a.json('welcome')).id;
    const b = mk('LOCKS', 'B'); const idb = (await b.json('welcome')).id;
    b.send('{"t":"lock","v":true}'); await sleep(40);   // not the host: ignored
    const c = mk('LOCKS', 'C'); await c.json('welcome');
    a.send('{"t":"lock","v":true}'); await sleep(40);
    const d = mk('LOCKS', 'D'); assert.equal((await d.json('err')).e, 'Match in progress');
    a.send('{"t":"lock","v":false}'); await sleep(40);
    const more = [];
    for (let i = 0; i < MAX - 3; i++) { const x = mk('LOCKS', 'P' + i); await x.json('welcome'); more.push(x); }
    const full = mk('LOCKS', 'Late'); assert.equal((await full.json('err')).e, 'Room is full');
    a.close();
    const lv = await b.json('leave');
    assert.equal(lv.id, ida); assert.equal(lv.host, idb);
  });
});

test('relay origin rule: the game\'s site and LAN pass, a stranger is 403, RELAY_ORIGINS adds one, and a page served from the relay\'s own host (same-origin /relay) passes', async () => {
  await withRelay(async ({ port }) => {
    assert.equal(await upgrade(port, '/room/ABCDE', { Origin: 'https://inkwave-aah.pages.dev' }), 101);
    assert.equal(await upgrade(port, '/room/ABCDE', { Origin: 'http://192.168.1.20:8490' }), 101);
    assert.equal(await upgrade(port, '/room/ABCDE', { Origin: 'https://evil.example' }), 403);
    assert.equal(await upgrade(port, '/room/ABCDE', {}), 403);
    assert.equal(await upgrade(port, '/relay/room/ABCDE', { Origin: 'https://her.example', Host: 'her.example' }), 101);
    assert.equal(await upgrade(port, '/relay/room/ABCDE', { Origin: 'https://her.example', 'X-Forwarded-Host': 'her.example' }), 101);
    assert.equal(await upgrade(port, '/room/ABCDE', { Origin: 'https://friend.example' }), 101);
  }, { origins: 'https://friend.example' });
});

test('relay hygiene: a silent socket is swept (4001) and the others get its leave; oversized messages are dropped; a flood is cut off (4008)', async () => {
  let fake = Date.now();
  await withRelay(async ({ mk }) => {
    const a = mk('SWEEP', 'A', { create: true }); await a.json('welcome');
    const b = mk('SWEEP', 'B'); const idb = (await b.json('welcome')).id;
    a.send('b|' + 'x'.repeat(70000));          // > MSG_MAX: never fanned out
    a.send('b|small');
    assert.equal((await b.next('m|')).endsWith('|small'), true);
    // a's clock jumps past the lobby allowance; b is the one that stayed silent
    a.send('ping'); await a.next((x) => x === 'pong');
    fake += SILENT_LOBBY + 5000;
    a.send('ping');
    await sleep(80);
    const lv = await a.json('leave', 3000);
    assert.equal(lv.id, idb);
    assert.equal((await b.ended()).code, 4001);
    const c = mk('SWEEP', 'C'); await c.json('welcome');
    for (let i = 0; i < 300; i++) c.send('b|{}');
    assert.equal((await c.ended()).code, 4008);
  }, { now: () => fake, sweep: 30 });
});

test('relay framing (RFC 6455 by hand): 16- and 64-bit lengths both ways, fragments reassembled, ping frames answered with pong, unmasked frames refused', async () => {
  await withRelay(async ({ port, mk }) => {
    const a = mk('FRAME', 'A', { create: true }); const ida = (await a.json('welcome')).id;
    const b = mk('FRAME', 'B'); await b.json('welcome');
    const mid = 'y'.repeat(60000);   // 126: a 16-bit length
    a.send('b|' + mid); assert.equal(await b.next('m|'), `m|${ida}|${mid}`);
    const big = '中'.repeat(30000);  // 90 000 bytes of UTF-8 under MSG_MAX characters: 127, a 64-bit length both ways
    a.send('b|' + big); assert.equal(await b.next((x) => x.endsWith('中')), `m|${ida}|${big}`);
    // a raw client: handshake, a fragmented text frame, a ping frame, then an unmasked frame
    const s = tcp(port, '127.0.0.1');
    let raw = Buffer.alloc(0);
    s.on('data', (d) => { raw = Buffer.concat([raw, d]); });
    await new Promise((r) => s.once('connect', r));
    s.write(`GET /room/FRAME?name=R&v=${PROTO} HTTP/1.1\r\nHost: x\r\nOrigin: ${ORIGIN}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: ${randomBytes(16).toString('base64')}\r\n\r\n`);
    await sleep(80);
    assert.match(raw.toString('latin1'), /^HTTP\/1\.1 101/);
    assert.ok(!/Sec-WebSocket-Extensions/i.test(raw.toString('latin1')), 'no extension negotiated');
    const frame = (fin, op, text, mask = true) => {
      const p = Buffer.from(text), m = randomBytes(4), out = [Buffer.from([(fin ? 0x80 : 0) | op, (mask ? 0x80 : 0) | p.length])];
      if (mask) { for (let i = 0; i < p.length; i++) p[i] ^= m[i & 3]; out.push(m); }
      out.push(p); return Buffer.concat(out);
    };
    s.write(Buffer.concat([frame(false, 0x1, 'b|he'), frame(false, 0x0, 'll'), frame(true, 0x0, 'o')]));
    assert.match(await b.next((x) => x.endsWith('|hello')), /^m\|[0-9A-Z]{4}\|hello$/);
    raw = Buffer.alloc(0);
    s.write(frame(true, 0x9, 'hb'));
    await sleep(60);
    assert.deepEqual([...raw.subarray(0, 4)], [0x8a, 2, 104, 98], 'pong with the same payload');
    raw = Buffer.alloc(0);
    s.write(frame(true, 0x1, 'b|x', false));
    await sleep(60);
    assert.equal(raw[0], 0x88); assert.equal(raw.readUInt16BE(2), 1002);
    s.destroy();
  });
});
