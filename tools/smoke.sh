#!/bin/sh
# Boot the game, play 8 s on autopilot, report state + any console errors. Exit 1 on errors.
# usage: tools/smoke.sh [port]   default 8490 — pass a port when something else already owns it (two servers can
# bind the same port on Windows via SO_REUSEADDR, and then you are testing whichever one answers).
# SMOKE_URL_EXTRA / SMOKE_ARGS: more URL params and play.mjs arguments — on a box without a GPU (software GL renders the
# stock tier at over a second a frame, and the match never leaves its intro inside the wait) run it as
#   SMOKE_URL_EXTRA='&quality=low' SMOKE_ARGS='--w 960 --h 540 --settings {"shadows":false,"bloom":false}' tools/smoke.sh
cd "$(dirname "$0")/.."
PORT="${1:-8490}"
OUT=$(node tools/play.mjs "http://localhost:${PORT}/?autostart=60&autopilot&shadercheck${SMOKE_URL_EXTRA}" '[{"until":"window.__inkwave && __inkwave.match && __inkwave.match.state===\"playing\" && __inkwave.match.local"},{"wait":8000},{"eval":"JSON.stringify({state:__inkwave.match.state,t:+__inkwave.match.time.toFixed(1),boot:__inkwave.bootMs,fps:__inkwave.fps,perf:__inkwave.perf,turf:__inkwave.match.actors.map(a=>Math.round(a.stats.turf))})","log":"smoke"}]' $SMOKE_ARGS 2>&1)
echo "$OUT" | grep -v "Failed to fetch\|404\|preload"
echo "$OUT" | grep -qiE "\[error\]|pageerror|until timeout|eval error" && { echo "SMOKE FAIL"; exit 1; }
echo "$OUT" | grep -q "smoke ->" || { echo "SMOKE FAIL (no result — is the dev server on :${PORT} up?)"; exit 1; }
echo "SMOKE OK"
