# INKWAVE relay — Node version

`relay.mjs` is the online relay as one Node process: the same wire format as the Cloudflare Worker in `server/src/`
(rooms by code, `b|` / `s|to|` / `m|from|`, `welcome / join / leave / err / lock`, ping / pong, 8 players, host = the
oldest member, silence sweep, size and rate caps), so the game connects to either without knowing which. No
dependencies: the WebSocket side is written on `node:http` (Node 18+; developed on 22). Contract: `docs/NET.md`;
why it exists: `docs/LEARN.md` §10 / §14.

**Start it**

```sh
node server/node/relay.mjs                 # ws://0.0.0.0:8787  (npm run relay-node does the same)
node server/node/relay.mjs --port 9000 --host 127.0.0.1 --quiet
PORT=9000 RELAY_ORIGINS=https://my.example node server/node/relay.mjs
node server/node/relay.mjs --silent-match 150000   # (a test box on software GL: pages stall for tens of seconds)
```

A socket that sends nothing for 20 s in a match (150 s in the lobby) is dropped, as on the Worker;
`--silent-match` / `--silent-lobby` (or `RELAY_SILENT_MATCH` / `RELAY_SILENT_LOBBY`, ms) raise that only for machines whose
pages really stall that long — the two-player test on a container without a GPU does (`tools/learn/net-duo.mjs`).

`GET /health` answers `ok`. Rooms are `GET /room/<CODE>` (WebSocket); every path also works under `/relay`
(`/relay/room/<CODE>`, `/relay/health`) for a reverse proxy. Pages may connect from the game's own site, from
`localhost` / LAN addresses, from any origin listed in `RELAY_ORIGINS` (comma-separated, `*` = any), and from the relay's
own host (a page served by the same server through the proxy).

**Point the game at it** (`src/net/transport.js` `relayURL()`)

- On this machine or the LAN (`localhost`, `192.168.…`, `*.local`) the game already looks for a relay on port 8787 —
  start the Node relay there instead of `wrangler dev` and nothing else changes.
- From the owner's own server: serve the game's files and proxy `/relay` to the relay; a page from any host that is not
  the public site connects to `wss://<that host>/relay` by itself. nginx:

  ```nginx
  location /relay/ {
    proxy_pass http://127.0.0.1:8787;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 1h;
  }
  ```
- Anywhere else: add `?relay=ws://<host>:<port>` (or `wss://…/relay`) to the game's address.

**Test it**: `node --test tests/learn/relay.test.mjs` (real sockets on 127.0.0.1); the two-player learning modes on two
headless browsers: `node tools/learn/net-duo.mjs` (starts its own relay and file server).
