// 墨浪跑酷 audit (tools/learn/runner-audit.mjs evaluates this in the page): drives a running ?learn=…&kind=runner level
// through its real inputs — synthetic touch pointers on a phone (src/core/touch.js's swipe hook), the keyboard otherwise —
// on the game's audit clock (__inkwave.debug.freeze / _frame stepping: a software-GL frame takes seconds; the rules need
// no picture). Per row it checks the PLAY §1 invariants while the row is asked: no question card shown
// (.iw-learn.is-ask / a visible .iw-learn__panel), match.paused false, match.learn.hold falsy. The plan per row comes from
// window.__runPlan (an array of 'right' | 'wrong' | 'none', cycled; default: wrong, right, none, right…), the right lane
// from the flow's own record (never read off the stage). window.__runShots(row, n) → true asks for a screenshot pause:
// the driver resolves with { shot: n } and the harness calls it again to carry on (window.__runState keeps the place).
(async () => {
  const W = window, G = W.__G, I = W.__inkwave, M = () => I.match, F = () => M() && M().learn;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const S = W.__runState || (W.__runState = { rows: [], errors: [], checks: [], n: 0, done: false, t0: Date.now(), acted: new Set(), shotsTaken: 0 });
  const plan = W.__runPlan || ['wrong', 'right', 'none', 'right'];
  const step = async (ms) => {   // the sim without the renderer (one draw at the end so a shot is current)
    // (frames of 1/30 s: main.js runs the match in two 1/60 sub-steps then — the same physics — and the dear per-frame
    // parts once: the paint atlas, the minimap, the HUD)
    const fdt = W.__runDt || 1 / 30, n = Math.max(1, Math.round(ms / 1000 / fdt));
    I._skipRender = true;
    try { for (let i = 0; i < n; i++) I._frame(fdt); } finally { I._skipRender = false; }
    await sleep(0);
  };
  const render = () => { I._frame(1 / 60); };
  const touch = !!(I.input && I.input.touch && I.input.touch.active);
  // one swipe through the real input path: pointer events on a phone (the touch layer's swipe hook), keys otherwise
  let pid = 40;
  const swipe = async (dir) => {
    if (touch) {
      // a thumb's flick: 60 px in five moves (a real one fires pointermove every few ms on the way)
      const cx = innerWidth * 0.5, cy = innerHeight * 0.62, id = ++pid, d = 60;
      const to = { left: [-d, 0], right: [d, 0], up: [0, -d], down: [0, d] }[dir];
      const target = document.elementFromPoint(cx, cy) || window;
      const ev = (type, x, y) => target.dispatchEvent(new PointerEvent(type, { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true }));
      ev('pointerdown', cx, cy);
      for (let k = 1; k <= 5; k++) ev('pointermove', cx + (to[0] * k) / 5, cy + (to[1] * k) / 5);
      ev('pointerup', cx + to[0], cy + to[1]);
      await step(34);
    } else {
      const code = { left: 'KeyA', right: 'KeyD', up: 'KeyW', down: 'KeyS' }[dir];
      I.debug.key(code, true); await step(17); I.debug.key(code, false); await step(17);
    }
  };
  const cardShown = () => {
    const root = document.querySelector('.iw-learn'), p = document.querySelector('.iw-learn__panel');
    const r = p ? p.getBoundingClientRect() : null, vis = !!(r && r.width > 1 && r.height > 1 && getComputedStyle(p).visibility !== 'hidden' && getComputedStyle(p).display !== 'none');
    return { ask: !!(root && root.classList.contains('is-ask')), panelVisible: vis, panelInDom: !!p };
  };
  const evDoc = () => { try { return JSON.parse(localStorage.getItem('inkwave:learn:v1') || '{}'); } catch (e) { return {}; } };
  const leaves = (id) => { const ev = (evDoc().ev) || {}; let n = 0; for (const k in ev) { const it = ev[k] && ev[k].it && ev[k].it[id]; if (it) for (const d in it) n += Object.keys(it[d]).length; } return n; };
  try {
    if (!S.frozen) {
      const t = Date.now(); while (!F() && Date.now() - t < 120000) await sleep(200);
      I.debug.freeze(); S.frozen = true;
      let sim = 0; while (M().state !== 'playing' && sim < 20000 && !(M().state === 'intro' && M().stateT > 3.6)) { await step(500); sim += 500; }
      // the hand-over from the intro's fly-in to the runner's camera: frame by frame across it, the largest jump of the
      // lens between two frames (a cut would be metres; the spring moves a few centimetres a frame)
      const cam = G.camera.position, jumps = []; let prev = cam.clone(), f = 0, at = -1;
      while (f++ < 90) { const was = M().state; await step(17); jumps.push(+cam.distanceTo(prev).toFixed(3)); prev = cam.clone(); if (was !== 'playing' && M().state === 'playing') at = jumps.length; if (at > 0 && jumps.length > at + 30) break; }
      S.camHandover = { atFrame: at, maxJump: Math.max(...jumps), aroundSwitch: jumps.slice(Math.max(0, at - 3), at + 4), mode: G.rig && G.rig.mode };
      const Fl = F();
      console.log('[run] playing after', ((Date.now() - S.t0) / 1000).toFixed(1), 's wall');
      S.boot = { kind: M().learnKind, runner: !!Fl.runner, stage: I.mapDef && I.mapDef.id, actors: M().actors.length, touch, win: innerWidth + 'x' + innerHeight, lap: +Fl.T.len.toFixed(1), laps: Fl.laps, rowsPlanned: Fl.plan.rows.length, gates: Fl.gates.length, camMode: G.rig && G.rig.mode };
      // a reading board before the start (PLAY §4: M6 before the run): 出发
      let k = 0; while (Fl.prep && Fl.prep() && k++ < 6) { const go = document.querySelector('.iw-lf__go'); if (go) go.click(); await step(200); }
      await step(300);
    }
    const Fl = F();
    const until = Date.now() + (W.__runWallMs || 240000);
    while (Date.now() < until) {
      if (Fl.phase === 'done' || document.querySelector('.iw-learn.is-done')) break;
      await step(100);
      if (Fl.prep && Fl.prep()) { const go = document.querySelector('.iw-lf__board.is-on .iw-lf__go'); if (go) { S.boards = (S.boards || 0) + 1; go.click(); } continue; }   // a reading board before the start: 出发
      if ((S.tick = (S.tick || 0) + 1) % 20 === 0) console.log('[run] t', ((Date.now() - S.t0) / 1000).toFixed(0), 's · s', Fl.sNow.toFixed(1), 'phase', Fl.phase, 'rows', S.rows.length, 'speed', Math.hypot(M().local.vel.x, M().local.vel.z).toFixed(1));
      const row = Fl._shown && Fl._shown();
      if (!row || row.kind === 'glide') continue;
      const key = row.item.id + '@' + row.s.toFixed(1);
      let rec;
      if (S.shotPending && S.shotPending.key === key) { rec = S.shotPending; S.shotPending = null; }
      else {
        if (S.acted.has(key)) continue;
        S.acted.add(key);
        // the invariants while a row is asked
        const c = cardShown();
        const chk = { item: row.item.id, kind: row.kind, lanes: row.lanes, paused: M().paused, hold: !!Fl.hold, cardAsk: c.ask, panelVisible: c.panelVisible, camMode: G.rig && G.rig.mode, swimK: +Fl.swimK.toFixed(2), submerged: !!M().local.submerged };
        S.checks.push(chk);
        if (chk.paused || chk.hold || chk.cardAsk || chk.panelVisible) S.errors.push('invariant broken while a row is asked: ' + JSON.stringify(chk));
        const mode = plan[S.n % plan.length]; S.n++;
        const right = Fl.rightAnswer();
        const want = mode === 'right' ? right : mode === 'wrong' ? (right === 0 ? 1 : right - 1) : null;
        rec = { key, n: S.n, item: row.item.id, kind: row.kind, lanes: row.lanes, mode, right, want, banner: row.banner, lead: row.lead, D: +row.D.toFixed(1), q: row.p.text, labels: row.labels.map((l) => [l.en, l.zh].filter(Boolean).join(' ')), leavesBefore: leaves(row.item.id) };
        // a screenshot while the row is up and readable (the harness takes it and runs this script again)
        if (W.__runShots && W.__runShots(row, S.shotsTaken)) {
          let g = 0; while (row.s - Fl.sNow > (W.__runShotAt || 9) && g++ < 300) await step(50);
          if (rec.want != null) { const target = row.centers[rec.want]; let k = 0; while (Math.abs(Fl.latT - target) > 0.05 && k++ < 6) await swipe(target < Fl.latT ? 'left' : 'right'); rec.preSwiped = true; }
          await step(250); render(); S.shotsTaken++; S.shotPending = rec;
          return JSON.stringify({ shot: S.shotsTaken, row: rec, dbg: Fl.debug() });
        }
      }
      const want = rec.want;
      // swipe to the wanted lane (from the divider she starts on); 'none' leaves her in the gap
      if (want != null && !rec.preSwiped) {
        const target = row.centers[want];
        let k = 0; while (Math.abs(Fl.latT - target) > 0.05 && k++ < 6) await swipe(target < Fl.latT ? 'left' : 'right');
      }
      rec.latT = +Fl.latT.toFixed(2);
      // swim through: until the row is done; measure her speed just before and just after
      const spd = () => { const a = M().local; return Math.hypot(a.vel.x, a.vel.z); };
      let g = 0; while (row.state !== 'done' && g++ < 400) { if (row.s - Fl.sNow < 1.2 && rec.vBefore == null) rec.vBefore = +spd().toFixed(2); await step(50); }
      const ans = [...Fl.log].reverse().find((e) => (e.name === 'learn:answer' || e.name === 'learn:noanswer') && e.itemId === row.item.id);
      rec.event = ans ? ans.name : null; rec.ok = ans ? ans.ok : null; rec.first = ans ? ans.first : null; rec.lane = ans ? ans.lane : null; rec.beat = ans ? ans.beat : null;
      rec.dCross = +Fl.dNow.toFixed(2);
      rec.states = row.view ? row.view.curtains.map((cc) => cc.state + (cc.k ? ':coral' + cc.k.toFixed(2) : '')) : null;
      rec.slowT = +Fl.slowT.toFixed(2); rec.boostT = +Fl.boostT.toFixed(2);
      if (W.__runShotAfter && rec.ok && !S.afterShot) { await step(80); render(); rec.burstShot = true; S.burstPending = true; }
      if (!S.burstPending) { await step(450); rec.vAfter = +spd().toFixed(2); }
      rec.leavesAfter = leaves(row.item.id);
      rec.verdict = ((document.querySelector('.iw-ps.is-verdict:not(.is-off) .iw-ps__verdict') || document.querySelector('.iw-ps__note.is-on') || {}).textContent || '').trim();
      S.rows.push(rec);
      // one shot just after the first right curtain: the burst into her ink (fx.explosion + paint.flood)
      if (W.__runShotAfter && rec.ok && !S.afterShot && rec.burstShot) { S.afterShot = true; S.burstPending = false; S.shotsTaken++; return JSON.stringify({ shot: S.shotsTaken, row: rec, dbg: Fl.debug(), after: true }); }
      if (W.__runMaxRows && S.rows.length >= W.__runMaxRows) break;
    }
    // to the finish and the results card (simulated seconds)
    if (!W.__runMaxRows) { let g = 0; while (!document.querySelector('.iw-learn.is-done') && g++ < 900) await step(200); }
  } catch (e) { S.errors.push(String(e && e.stack || e)); }
  const Fl = F();
  S.done = true;
  const out = { boot: S.boot, camHandover: S.camHandover, boards: S.boards || 0, rows: S.rows, checks: S.checks.length, checkSample: S.checks.slice(0, 3), errors: S.errors, wallMs: Date.now() - S.t0 };
  out.final = Fl && Fl.debug ? Fl.debug() : null;
  out.log = Fl ? Fl.log.map((e) => e.name.replace('learn:', '') + (e.ok != null ? (e.ok ? '+' : '-') : '') + (e.first ? '*' : '') + (e.beat ? '♪' : '')).join(' ') : null;
  out.results = (document.querySelector('.iw-learn__results') || {}).innerText || null;
  out.cov = G.paint ? G.paint.coverage().map((c) => +c.toFixed(4)) : null;
  out.evDocs = Object.keys(evDoc().ev || {});
  render();
  return JSON.stringify(out);
})()
