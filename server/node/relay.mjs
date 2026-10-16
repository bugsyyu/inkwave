// INKWAVE online relay — the Node version (docs/NET.md, docs/LEARN.md §10, §14). One process, one Map of rooms.
//
// The same wire format as the Cloudflare Worker (server/src/index.js), word for word, so the game's transport
// (src/net/transport.js) cannot tell them apart:
//
//   GET /room/<CODE>?name=<name>&create=1&v=<proto>   (WebSocket upgrade) → the room for that code
//   GET /relay/room/<CODE>?…                          the same, behind a reverse proxy at /relay (same-origin pages)
//   GET /health (or /relay/health)                    → "ok"
//
// client → room:  "b|<payload>" broadcast to everyone else · "s|<toId>|<payload>" to one member ·
//                 {"t":"lock","v":bool} (host: refuse new joins while a match runs) · "ping" → "pong" ·
//                 {"t":"ping","c":n} → {"t":"pong","c":n}
// room → client:  "m|<fromId>|<payload>" · {"t":"welcome","id","host","members":[{id,name}]} · {"t":"join","m":{id,name}} ·
//                 {"t":"leave","id","host"} · {"t":"err","e":"…"} (then close 4000)
// The room never parses game payloads; it tracks membership (id, name, join order), elects the host (the oldest
// member), refuses joins that can't work (unknown code, full, match running), drops sockets silent for 20 s in a match
// (150 s in the lobby), caps message size and rate (4008 "Too many messages").
//
// No dependencies: the WebSocket server side (RFC 6455) is written here on node:http — the repository never runs
// `npm install` and the `ws` package is not on this machine; it also means the owner's server needs only `node`.
// Text frames only (the game sends nothing else); fragmented frames are reassembled; no extensions are negotiated
// (a browser's permessage-deflate offer is declined by not answering it).
//
//   node server/node/relay.mjs [--port 8787] [--host 0.0.0.0] [--quiet]
//   env: PORT, HOST, RELAY_ORIGINS="https://a.example,https://b.example" (extra page origins; "*" = any)
//
// In code (tests): const r = createRelay({ quiet: true }); const port = await r.listen(0); … await r.close();
import { createServer } from 'node:http';
import { createHash, randomBytes } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const PROTO = 1, MAX = 8;
export const MSG_MAX = 65536, RATE = 90, BURST_STRIKES = 4;
export const SILENT_MATCH = 20000, SILENT_LOBBY = 150000, SWEEP = 4000;
const FRAME_MAX = 1 << 20;   // bytes in one message on the wire (a 64 K-character string is at most ~256 KB of UTF-8)
const CODE = /^[A-Z0-9]{4,8}$/;
const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
// the Worker's rule: the game's own site, plus local dev and LAN play
const ORIGIN_OK = (o) => /^https:\/\/([a-z0-9-]+\.)?inkwave-aah\.pages\.dev$/.test(o)
  || /^https?:\/\/(localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+|[a-z0-9-]+\.local)(:\d+)?$/.test(o);

// ---------------------------------------------------------------------------------------------- one WebSocket
class Conn {
  constructor(sock, onText, onEnd) {
    this.sock = sock; this.onText = onText; this.onEnd = onEnd;
    this.buf = Buffer.alloc(0); this.frag = null; this.closed = false; this.ended = false;
    sock.setNoDelay(true);
    sock.on('data', (d) => this._data(d));
    sock.on('close', () => this._end());
    sock.on('error', () => this._end());
  }
  _end() { if (this.ended) return; this.ended = true; this.closed = true; try { this.sock.destroy(); } catch { /* gone */ } this.onEnd?.(); }

  _data(d) {
    this.buf = this.buf.length ? Buffer.concat([this.buf, d]) : d;
    for (;;) {
      const b = this.buf;
      if (b.length < 2) return;
      const fin = (b[0] & 0x80) !== 0, op = b[0] & 0x0f, masked = (b[1] & 0x80) !== 0;
      let len = b[1] & 0x7f, off = 2;
      if (len === 126) { if (b.length < 4) return; len = b.readUInt16BE(2); off = 4; }
      else if (len === 127) {
        if (b.length < 10) return;
        const hi = b.readUInt32BE(2), lo = b.readUInt32BE(6);
        if (hi) { this.close(1009, 'Message too big'); return; }
        len = lo; off = 10;
      }
      if (!masked) { this.close(1002, 'Unmasked frame'); return; }   // RFC 6455 §5.1: clients always mask
      if (len > FRAME_MAX || (this.frag && this.frag.size + len > FRAME_MAX)) { this.close(1009, 'Message too big'); return; }
      if (b.length < off + 4 + len) return;
      const mask = b.subarray(off, off + 4), data = Buffer.from(b.subarray(off + 4, off + 4 + len));
      for (let i = 0; i < len; i++) data[i] ^= mask[i & 3];
      this.buf = b.subarray(off + 4 + len);
      if (op >= 0x8) { this._control(op, data); if (this.closed) return; continue; }
      if (op === 0x0) {                                   // continuation
        if (!this.frag) { this.close(1002, 'Bad continuation'); return; }
        this.frag.parts.push(data); this.frag.size += len;
        if (fin) { const f = this.frag; this.frag = null; this._message(f.op, Buffer.concat(f.parts)); }
      } else if (op === 0x1 || op === 0x2) {
        if (this.frag) { this.close(1002, 'Expected continuation'); return; }
        if (fin) this._message(op, data); else this.frag = { op, parts: [data], size: len };
      } else { this.close(1002, 'Bad opcode'); return; }
      if (this.closed) return;
    }
  }
  _control(op, data) {
    if (op === 0x8) {                                     // close: answer it (once) and hang up
      const code = data.length >= 2 ? data.readUInt16BE(0) : 1000;
      this.close(code === 1005 || code === 1006 || code < 1000 || code >= 5000 ? 1000 : code, '');
    } else if (op === 0x9) this._frame(0xA, data);        // ping → pong (same payload)
    // 0xA pong: nothing to do
  }
  _message(op, data) { if (op === 0x1) this.onText?.(data.toString('utf8')); }   // binary: ignored, like the Worker

  _frame(op, payload) {
    if (this.closed || this.sock.destroyed) return false;
    const n = payload.length;
    const head = n < 126 ? Buffer.from([0x80 | op, n]) : n < 65536 ? Buffer.from([0x80 | op, 126, n >> 8, n & 255]) : Buffer.alloc(10);
    if (n >= 65536) { head[0] = 0x80 | op; head[1] = 127; head.writeUInt32BE(0, 2); head.writeUInt32BE(n, 6); }
    try { this.sock.write(Buffer.concat([head, payload])); return true; } catch { return false; }
  }
  send(text) { return this._frame(0x1, Buffer.from(text, 'utf8')); }
  close(code = 1000, reason = '') {
    if (this.closed) return;
    let r = Buffer.from(String(reason || ''), 'utf8');
    if (r.length > 123) r = r.subarray(0, 123);
    const p = Buffer.alloc(2 + r.length); p.writeUInt16BE(code, 0); r.copy(p, 2);
    this._frame(0x8, p);
    this.closed = true;
    try { this.sock.end(); } catch { /* gone */ }
    setTimeout(() => this._end(), 1500).unref?.();   // the peer's close reply ends it sooner
  }
}

// ---------------------------------------------------------------------------------------------- the relay
export function createRelay(opts = {}) {
  const quiet = !!opts.quiet;
  const extra = String(opts.origins ?? process.env.RELAY_ORIGINS ?? '').split(',').map((s) => s.trim().replace(/\/$/, '')).filter(Boolean);
  const log = (...a) => { if (!quiet) console.log('[relay]', ...a); };
  const rooms = new Map();   // code → { code, members: Map(id → member), seq, locked }
  const now = opts.now || (() => Date.now());

  // the page's origin: the Worker's list, RELAY_ORIGINS, or the relay's own host (a same-origin page behind a proxy)
  function originOk(req) {
    const o = String(req.headers.origin || '');
    if (ORIGIN_OK(o) || extra.includes('*') || extra.includes(o)) return true;
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
    try { return !!o && new URL(o).host.toLowerCase() === host; } catch { return false; }
  }

  const live = (room) => [...room.members.values()].filter((m) => !m.gone).sort((a, b) => a.seq - b.seq);
  const hostOf = (room) => { const ms = live(room); return ms.length ? ms[0].id : null; };

  function gone(room, m) {
    if (!m || m.gone) return;
    m.gone = true;
    room.members.delete(m.id);
    const out = JSON.stringify({ t: 'leave', id: m.id, host: hostOf(room) });
    for (const x of live(room)) x.conn.send(out);
    if (!live(room).length) { room.locked = false; rooms.delete(room.code); log(`room ${room.code} closed`); }
  }

  function message(room, me, msg) {
    if (me.gone) return;
    const t = now();
    me.seen = t;
    if (msg === 'ping') { me.conn.send('pong'); return; }   // (the Worker's runtime answers this one without the room)
    if (msg.length > MSG_MAX) return;                       // oversized: dropped, never fanned out
    const r = me.rate;
    if (t - r.t >= 1000) { r.strikes = r.n > RATE ? r.strikes + 1 : Math.max(0, r.strikes - 1); r.t = t; r.n = 0; }
    if (++r.n > RATE * 3 || r.strikes >= BURST_STRIKES) { me.conn.close(4008, 'Too many messages'); gone(room, me); return; }
    const c = msg.charCodeAt(0);
    if (c === 98 /* b */ && msg.charCodeAt(1) === 124) {
      const out = 'm|' + me.id + '|' + msg.slice(2);
      for (const x of live(room)) if (x !== me) x.conn.send(out);
      return;
    }
    if (c === 115 /* s */ && msg.charCodeAt(1) === 124) {
      const k = msg.indexOf('|', 2);
      if (k < 0) return;
      const to = room.members.get(msg.slice(2, k));
      if (to && !to.gone) to.conn.send('m|' + me.id + '|' + msg.slice(k + 1));
      return;
    }
    if (c === 123 /* { */) {
      let o; try { o = JSON.parse(msg); } catch { return; }
      if (o.t === 'ping') me.conn.send(JSON.stringify({ t: 'pong', c: o.c }));
      else if (o.t === 'lock' && hostOf(room) === me.id) room.locked = !!o.v;
    }
  }

  function join(req, sock, code, url) {
    const key = req.headers['sec-websocket-key'];
    sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n'
      + `Sec-WebSocket-Accept: ${createHash('sha1').update(key + GUID).digest('base64')}\r\n\r\n`);
    let room = rooms.get(code);
    const ms = room ? live(room) : [];
    let me = null;
    const conn = new Conn(sock, (text) => { if (me && room) message(room, me, text); }, () => { if (me && room) gone(room, me); });
    const fail = (e) => { conn.send(JSON.stringify({ t: 'err', e })); conn.close(4000, e); };
    const create = url.searchParams.get('create') === '1';
    if (+(url.searchParams.get('v') || 0) !== PROTO) return fail('Please refresh the page — the game was updated');
    if (create && ms.length) return fail('Room code taken');
    if (!create && !ms.length) return fail('Room not found');
    if (ms.length >= MAX) return fail('Room is full');
    if (room && room.locked && ms.length) return fail('Match in progress');
    if (!room) { room = { code, members: new Map(), seq: 0, locked: false }; rooms.set(code, room); log(`room ${code} opened`); }
    if (!ms.length) room.locked = false;
    const name = (url.searchParams.get('name') || 'Player').replace(/[^\p{L}\p{N} ._\-!?']/gu, '').slice(0, 16) || 'Player';
    let id;
    do { id = randomBytes(4).readUInt32BE(0).toString(36).slice(-4).toUpperCase().padStart(4, '0'); } while (room.members.has(id));
    const t = now();
    me = { id, name, seq: room.seq++, at: t, seen: t, conn, gone: false, rate: { t, n: 0, strikes: 0 } };
    room.members.set(id, me);
    const all = live(room);
    conn.send(JSON.stringify({ t: 'welcome', id, host: all[0].id, members: all.map((m) => ({ id: m.id, name: m.name })) }));
    const j = JSON.stringify({ t: 'join', m: { id, name } });
    for (const m of all) if (m !== me) m.conn.send(j);
  }

  const reply = (res, status, body, headers = {}) => { res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8', ...headers }); res.end(body); };
  const route = (path) => {
    const p = path.replace(/^\/relay(?=\/|$)/, '') || '/';
    if (p === '/health') return { health: true };
    const m = p.match(/^\/room\/([A-Za-z0-9]+)$/);
    return m ? { code: m[1].toUpperCase() } : null;
  };

  const server = createServer((req, res) => {
    const url = new URL(req.url, 'http://relay');
    const r = route(url.pathname);
    if (r && r.health) return reply(res, 200, 'ok', { 'access-control-allow-origin': '*' });
    if (!r) return reply(res, 404, 'INKWAVE relay');
    if (!CODE.test(r.code)) return reply(res, 400, 'bad code');
    return reply(res, 426, 'expected websocket');
  });
  server.on('upgrade', (req, sock) => {
    const refuse = (status, text) => { try { sock.end(`HTTP/1.1 ${status} ${text}\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(text)}\r\nConnection: close\r\n\r\n${text}`); } catch { /* gone */ } };
    sock.on('error', () => { /* a reset before the handshake */ });
    const url = new URL(req.url, 'http://relay');
    const r = route(url.pathname);
    if (!r || r.health) return refuse(404, 'INKWAVE relay');
    if (!CODE.test(r.code)) return refuse(400, 'bad code');
    if (String(req.headers.upgrade || '').toLowerCase() !== 'websocket' || !req.headers['sec-websocket-key'] || req.headers['sec-websocket-version'] !== '13') return refuse(426, 'expected websocket');
    if (!originOk(req)) return refuse(403, 'forbidden');
    join(req, sock, r.code, url);
  });

  // liveness sweep: a socket whose pings stopped is a player whose connection died without closing
  const sweep = setInterval(() => {
    const t = now();
    for (const room of [...rooms.values()]) {
      const limit = room.locked ? SILENT_MATCH : SILENT_LOBBY;
      for (const m of live(room)) if (t - Math.max(m.at, m.seen) > limit) { m.conn.close(4001, 'Connection timed out'); gone(room, m); }
    }
  }, opts.sweep || SWEEP);
  sweep.unref?.();

  return {
    server, rooms,
    listen(port = 8787, host = '0.0.0.0') {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => { server.off('error', reject); const p = server.address().port; log(`listening on ${host}:${p}`); resolve(p); });
      });
    },
    close() {
      clearInterval(sweep);
      for (const room of rooms.values()) for (const m of room.members.values()) m.conn._end();
      rooms.clear();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

// ---------------------------------------------------------------------------------------------- command line
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  const relay = createRelay({ quiet: args.includes('--quiet') });
  const port = +opt('port', process.env.PORT || 8787), host = opt('host', process.env.HOST || '0.0.0.0');
  relay.listen(port, host).catch((e) => { console.error('[relay]', e.message); process.exit(1); });
  const stop = () => relay.close().then(() => process.exit(0));
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
