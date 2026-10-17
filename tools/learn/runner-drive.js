// 墨浪跑酷 audit (tools/learn/runner-audit.mjs evaluates this in the page): drives a running ?learn=…&kind=runner level
// through its real inputs — synthetic touch pointers on a phone (src/core/touch.js's swipe hook), the keyboard otherwise —
// on the game's audit clock (__inkwave.debug.freeze / _frame stepping: a software-GL frame takes seconds; the rules need
// no picture). Per row it checks the PLAY §1 invariants while the row is asked: no question card shown
// (.iw-learn.is-ask / a visible .iw-learn__panel), match.paused false, match.learn.hold falsy. The plan per row comes from
// window.__runPlan (an array of 'right' | 'wrong' | 'none', cycled; default: wrong, right, none, right…), the right lane
// from the flow's own record (never read off the stage). window.__runShots(row, n) → true asks for a screenshot pause:
// the driver resolves with { shot: n } and the harness calls it again to carry on (window.__runState keeps the place).
// play-4: the 滑行段 (glide.js) — each typed item typed key by key on the game keyboard (pointer events on its keys on a
// phone, keydown on a desktop), 射, the ink word, a held sentence decided on the strip's buttons; per item: the invariants,
// the crosshair hidden, the type frame measured (the rig's points projected: her head below the keys' middle row, the
// typewriter between the strip and the keyboard), the evidence leaf. The 看板段 (boards.js): the invariants, each board
// framed as she comes, a tap on a word row (its own listeners). window.__glidePlan: 'right' | 'hint' | 'wrong' | 'near'
// cycled per typed item; window.__glideShots: a shot of the first type frame / ink word / held strip / framed board.
// play-8 — a whole day (PLAY §10): every stepped frame samples PLAY §1 rule 1 (match.paused false, no learn.hold, no
// .iw-learn__panel shown) from the start line to the results card; window.__runSegment: when the wall clock
// (__runWallMs) is out, stop at the next row / item boundary inside the checkpoints and report `resume` — the next
// segment's ?gate= / ?skip= (the gate she is on, after its first items already answered right, in order)
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
    sample();
    await sleep(0);
  };
  // (play-8) PLAY §1 rule 1 on every step, until the results card
  S.inv = S.inv || { samples: 0, breaks: [] };
  function sample() {
    const Fl = F(); if (!Fl || Fl.phase === 'done' || document.querySelector('.iw-learn.is-done')) return;
    const p = document.querySelector('.iw-learn__panel'), b = p && p.getBoundingClientRect(), shown = !!(b && b.width > 0 && b.height > 0 && getComputedStyle(p).display !== 'none');
    S.inv.samples++;
    if ((M().paused || Fl.hold || shown) && S.inv.breaks.length < 20) S.inv.breaks.push({ paused: M().paused, hold: !!Fl.hold, panel: shown, phase: Fl.phase, state: M().state, s: Fl.sNow != null ? +(+Fl.sNow).toFixed(1) : null });
  }
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
  const leafOf = (id) => { const ev = (evDoc().ev) || {}; for (const k in ev) { const it = ev[k] && ev[k].it && ev[k].it[id]; if (it) { const d = Object.keys(it).sort().pop(); const day = it[d]; const t = Object.keys(day).sort().pop(); return day[t]; } } return null; };
  const rect = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return b.width > 0 && b.height > 0 ? { x: Math.round(b.left), y: Math.round(b.top), w: Math.round(b.width), h: Math.round(b.height), bottom: Math.round(b.bottom) } : null; };
  // (the crosshair as drawn: .iw-ret inside the .iw-xh anchor — the anchor is a 0 × 0 point at the screen's centre, its
  // own box never shows, so measuring it proved nothing; play-8, as wire-audit.mjs xhShown does)
  const xhShown = () => { const e = document.querySelector('.iw-xh'), r = e && e.querySelector('.iw-ret'); if (!r) return false; const cs = getComputedStyle(e), cr = getComputedStyle(r), b = r.getBoundingClientRect(); return cs.display !== 'none' && cs.visibility !== 'hidden' && cr.display !== 'none' && cr.visibility !== 'hidden' && b.width > 0 && b.height > 0; };
  const invariants = (what) => { const c = cardShown(); const chk = { what, paused: M().paused, hold: !!F().hold, cardAsk: c.ask, panelVisible: c.panelVisible, crosshair: xhShown(), camMode: G.rig && G.rig.mode }; S.checks.push(chk); if (chk.paused || chk.hold || chk.cardAsk || chk.panelVisible) S.errors.push('invariant broken (' + what + '): ' + JSON.stringify(chk)); return chk; };
  // a press on the game keyboard: the key's own pointerdown on a phone (play-keys acts on it), keydown on a desktop
  const press = (k) => {
    const K = F().glide.keys;
    if (touch) { const el = K.keyEls.get(k); if (!el || el.style.display === 'none') return false; const r = el.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + r.height / 2, id = ++pid; el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true })); window.dispatchEvent(new PointerEvent('pointerup', { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, bubbles: true })); return true; }
    const key = k === 'fire' ? 'Enter' : k === 'back' ? 'Backspace' : k;
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })); window.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
    return true;
  };
  const tapBtn = (sel) => { const K = F().glide.keys, el = K.btnEls.get(sel); if (!el) return false; const r = el.getBoundingClientRect(), id = ++pid; el.dispatchEvent(new PointerEvent('pointerdown', { pointerId: id, pointerType: touch ? 'touch' : 'mouse', clientX: r.left + 4, clientY: r.top + 4, bubbles: true, cancelable: true, isPrimary: true })); window.dispatchEvent(new PointerEvent('pointerup', { pointerId: id, pointerType: touch ? 'touch' : 'mouse', bubbles: true })); return true; };
  // the type frame on the screen: the rig's points (frame.js RIG_POINTS, in the rig's own frame) projected with the live camera
  let FR = null;
  const frameCheck = async () => {
    FR = FR || await import('/src/learn/play/type/frame.js');
    const Gl = F().glide, rig = Gl.shot && Gl.shot.rig; if (!rig || !rig.root) return null;
    const R = FR.RIG_POINTS, root = rig.root, cam = G.camera, V3 = cam.position.constructor;
    root.updateMatrixWorld(true); cam.updateMatrixWorld(true);
    const P = (p) => { const v = new V3(p[0], p[1], p[2]).applyMatrix4(root.matrixWorld).project(cam); return [Math.round(((v.x + 1) / 2) * innerWidth), Math.round(((1 - v.y) / 2) * innerHeight)]; };
    const st = rect('.iw-ps:not(.is-off) .iw-ps__box'), kb = document.querySelector('.iw-pk:not(.is-off) .iw-pk__panel'), kbTop = kb ? Math.round(kb.getBoundingClientRect().top) : innerHeight;
    const top = st ? st.bottom : 0;
    const rigPts = [...R.plate, R.strike, ...R.textLines].map(P), head = P(R.head), row = P(innerWidth / innerHeight > 1.4 ? [0, 1.16, 1.12] : R.midRow), paper = R.paperTop.map(P);
    const inBand = rigPts.every(([x, y]) => y >= top - 2 && y <= kbTop + 2 && x >= -2 && x <= innerWidth + 2);
    return { stripBottom: top, kbTop, ys: rigPts.map((q) => q[1]), xs: rigPts.map((q) => q[0]), head, row, paper, inBand, headBelowRow: head[1] > row[1], band: Gl._f ? { top: Gl._f.top, kb: Gl._f.kb, fits: Gl._f.fits } : null };
  };
  const textFor = (mode, right, kind) => {
    const clean = (t) => String(t || '').toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z ' .,?-]/g, '').replace(/\s+/g, ' ').trim();
    const r = clean(right);
    if (mode === 'wrong') { if (kind === 'word') return r.length > 2 ? r.slice(0, -2) + r.slice(-1) + r.slice(-2, -1) + (r.length < 4 ? 'x' : '') : r + 'x'; const w = r.split(' '); return w.slice(0, Math.max(1, Math.ceil(w.length / 2))).join(' ') + ' blah'; }
    if (mode === 'near') { if (kind === 'word') return r.slice(0, -1) || r + 'x'; const w = r.replace(/[.?!]$/, '').split(' '); return w.slice(0, Math.max(1, w.length - 1)).join(' '); }
    return r;
  };
  const gPlan = W.__glidePlan || ['right', 'hint', 'wrong', 'near'];
  const gShot = (name) => { if (!W.__glideShots) return false; S.gShots = S.gShots || new Set(); if (S.gShots.has(name)) return false; S.gShots.add(name); return true; };
  S.gDone = S.gDone || new Set(); S.gN = S.gN || 0; S.glides = S.glides || []; S.boardRecs = S.boardRecs || [];
  // one typed item, resumable across the harness's screenshot pauses (S.g keeps the stage)
  const onGlide = async () => {
    const Fl = F(), Gl = Fl.glide, C = Gl.cur;
    if (!C) return null;
    const key = C.item.id + '#' + Gl.stats.asked;
    if (S.gDone.has(key)) return null;
    let g = S.g && S.g.key === key ? S.g : null;
    if (!g) {
      const mode = gPlan[S.gN % gPlan.length];
      g = S.g = { key, n: ++S.gN, item: C.item.id, kind: C.item.meta && C.item.meta.kind, typeMode: C.mode, plan: mode, stage: 'new', leavesBefore: leaves(C.item.id), q: C.p.text, alt: !!(C.e.slow || C.e.why || C.e.retype), relearn: !!C.e.relearn };
    }
    for (let guard = 0; guard < 12; guard++) {
      if (g.stage === 'new') {
        g.inv = invariants('glide ' + g.item);
        g.kbUp = !!Gl.keys.visible; if (!g.kbUp) S.errors.push('glide ' + g.item + ': the game keyboard is not up');
        g.preRight = Fl.rightAnswer();   // (the flow's own record of the text to type; the rig has never seen it)
        await step(1600);   // the lens springs into the type frame
        if (g.plan === 'hint') { tapBtn('hint'); await step(60); g.hintStrip = ((document.querySelector('.iw-ps__zh') || {}).textContent || '').slice(0, 60); }
        g.text = textFor(g.plan === 'hint' ? 'right' : g.plan, g.preRight, g.kind);
        for (const ch of g.text) press(ch);
        await step(400);
        g.typed = Gl.shot.text;
        g.frame = await frameCheck();
        g.lensBlocked = (G.time || 0) < (Gl._blockUntil || 0);   // (the type pose was under a roof / past a wall: the chase camera has her — glide.js)
        if (g.lensBlocked) S.blockedTypes = (S.blockedTypes || 0) + 1;
        else if (g.frame && !g.frame.inBand) S.errors.push('glide ' + g.item + ': the rig is not between the strip and the keyboard ' + JSON.stringify(g.frame));
        if (g.frame && !g.lensBlocked && !g.frame.headBelowRow) S.errors.push('glide ' + g.item + ': her head is not below the keys\' row ' + JSON.stringify(g.frame));
        if (g.inv.crosshair) S.errors.push('glide ' + g.item + ': the crosshair shows while she types');
        g.stage = 'fire';
        if (gShot('type-' + g.typeMode)) { render(); return 'type-' + g.typeMode; }
      }
      if (g.stage === 'fire') {
        press('fire');
        await step(34);
        // the shell flies, the word forms (grey): stop the moment it has formed — the first frame of its verdict, or
        // (held) standing grey, waiting for her tap
        // (TypeShot's own phase: firing → assembling → shown | resolving — the ink word's may still be the last item's 'done')
        let k = 0; while (k++ < 300) { const ph = Gl.shot && Gl.shot.phase; if (ph === 'shown' || ph === 'resolving' || ph === 'done') break; await step(17); }
        g.held = !!Gl.held; g.wordPhase = Gl.shot && Gl.shot.word ? Gl.shot.word.phase : null; g.shotPhase = Gl.shot ? Gl.shot.phase : null;
        g.wordCam = { pose: !!(Gl.cur && Gl.cur.wpose), passed: !!(Gl.cur && Gl.cur.passed), frame: Gl._fw || null };
        g.leavesHeld = g.held ? leaves(g.item) : null;
        if (g.held && g.leavesHeld !== g.leavesBefore) S.errors.push('glide ' + g.item + ': evidence written while held');
        g.stage = g.held ? 'decide' : g.plan === 'wrong' ? 'wrongShot' : 'wait';
        if (gShot('word-' + g.typeMode)) { render(); return 'word-' + g.typeMode; }
      }
      if (g.stage === 'wrongShot') {   // a missed word plays its verdict: coral, sagging, the right spelling growing above it
        g.stage = 'wait';
        if (W.__glideShots && !(S.gShots && S.gShots.has('word-wrong'))) { await step(1100); if (gShot('word-wrong')) { render(); return 'word-wrong'; } }
      }
      if (g.stage === 'decide') {
        g.acts = [...document.querySelectorAll('.iw-ps__act')].map((b) => b.textContent);
        if (gShot('held')) { g.stage = 'decide2'; render(); return 'held'; }
        g.stage = 'decide2';
      }
      if (g.stage === 'decide2') {
        const btns = [...document.querySelectorAll('.iw-ps__act')];
        const b = btns.find((x) => x.textContent === (g.plan === 'near' ? '我的写法也对' : '继续')) || btns[0];
        g.decided = b ? b.textContent : null; if (b) b.click(); else S.errors.push('glide ' + g.item + ': held, but no buttons on the strip');
        await step(60);
        g.stage = 'wait';
      }
      if (g.stage === 'wait') {
        const C0 = Gl.cur; let k = 0;
        while (k++ < 200 && Gl.cur === C0 && Gl.active) await step(50);
        const ans = [...Fl.log].reverse().find((e) => e.name === 'learn:answer' && e.itemId === g.item);
        g.ok = ans ? ans.ok : null; g.first = ans ? ans.first : null; g.self = ans ? !!ans.self : null; g.hinted = ans ? !!ans.hinted : null;
        g.leavesAfter = leaves(g.item); g.leaf = leafOf(g.item);
        g.verdict = ((document.querySelector('.iw-ps.is-verdict:not(.is-off) .iw-ps__verdict') || document.querySelector('.iw-ps__note.is-on') || {}).textContent || '').trim().slice(0, 80);
        S.glides.push(g); S.gDone.add(key); S.g = null;
        return null;
      }
    }
    return null;
  };
  // a 看板段: the invariants once, each board framed as she comes (the framing measured), one tap on a word row
  const onBoards = async (row) => {
    const Fl = F(), bw = Fl.bw, key = 'boards@' + row.s0.toFixed(1);
    let b = S.b && S.b.key === key ? S.b : null;
    if (!b) { b = S.b = { key, gate: row.gate, n: row.n, framed: [], inv: invariants('boards'), tide: null }; S.boardRecs.push(b); }
    b.tide = +Fl.tideK.toFixed(2); b.fairK = +Fl.fairK.toFixed(2);
    const W2 = bw.walk; if (!W2 || W2.framed < 0) return null;
    const i = W2.framed;
    if (b.framed.some((f) => f.i === i)) return null;
    await step(1300);   // the lens comes round
    if (W2.framed !== i) return null;
    const d = bw.debug(), f = { i, fits: d.framing ? d.framing.fits : null, rect: d.framing ? d.framing.rect : null, read: W2.list[i] ? W2.list[i].read : null, cam: G.camera.position.toArray().map((v) => +v.toFixed(1)) };
    // a tap on the first row hotspot (a word: it is spoken) — through the boards' own pointer listeners
    if (!S.boardTapped) {
      const hot = W2.set.project(W2.list[i].b, G.camera, innerWidth, innerHeight).find((h) => /^row:|^listen|^follow|^more/.test(h.id));
      if (hot) {
        S.boardTapped = true; let said = 0; const sp = Fl._speak; Fl._speak = function (...a) { said++; return sp.apply(this, a); };
        const x = hot.rect.x + hot.rect.w / 2, y = hot.rect.y + hot.rect.h / 2, id = ++pid, tgt = document.elementFromPoint(x, y) || window;
        tgt.dispatchEvent(new PointerEvent('pointerdown', { pointerId: id, pointerType: touch ? 'touch' : 'mouse', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true }));
        tgt.dispatchEvent(new PointerEvent('pointerup', { pointerId: id, pointerType: touch ? 'touch' : 'mouse', clientX: x, clientY: y, bubbles: true, cancelable: true, isPrimary: true }));
        await step(60); Fl._speak = sp;
        const opened = !!(W2.strip && W2.strip.isOpen);
        f.tap = { id: hot.id, said, opened };
        if (hot.id === 'more' ? !opened : !said) S.errors.push('boards: a tap on ' + hot.id + (hot.id === 'more' ? ' opened no reading strip' : ' said nothing'));
        if (opened && gShot('board-more')) { render(); b.framed.push(f); return 'board-more'; }
      }
    }
    b.framed.push(f);
    if (f.fits === false) S.errors.push('boards: a framed board does not fit ' + JSON.stringify(f));
    if (gShot('board')) { render(); return 'board'; }
    return null;
  };
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
      S.boot = { kind: M().learnKind, runner: !!Fl.runner, stage: I.mapDef && I.mapDef.id, actors: M().actors.length, touch, win: innerWidth + 'x' + innerHeight, lap: +Fl.T.len.toFixed(1), laps: Fl.laps, rowsPlanned: Fl.plan.rows.length, gates: Fl.gates.length, camMode: G.rig && G.rig.mode, loopEdges: Fl.loopEdges, jumps: (Fl.T.jumps || []).map((j) => +j.toFixed(1)) };
      // a reading board before the start (PLAY §4: M6 before the run): 出发
      // (play-8: an M6 board in front of her at the start line and the strip's 「下一块」 / 「出发！」 — no card)
      let k = 0; while (Fl.prep && Fl.prep() && k++ < 12) { await step(200); S.startBoards = Object.assign(S.startBoards || {}, { framed: (S.startBoards && S.startBoards.framed) || !!(Fl.prepS && Fl.prepS.board && Fl.prepS.board.framed >= 0), paused: M().paused }); const go = document.querySelector('.iw-ps:not(.is-off) .iw-ps__act.is-primary'); if (go) go.click(); }
      await step(300);
    }
    const Fl = F();
    const until = Date.now() + (W.__runWallMs || 240000);
    while (Date.now() < until || (W.__runSegment && !S.resume)) {
      if (Fl.phase === 'done' || document.querySelector('.iw-learn.is-done')) break;
      // (a segment's wall clock is out: stop here — between rows — unless she is past the last checkpoint)
      if (W.__runSegment && Date.now() >= until) {
        const k = Fl.cur, g = Fl.gates[k];
        if (g && Fl.phase !== 'final') {
          const base = k === 0 ? (W.__runSkip || 0) : 0; let done = 0;
          while (done < g.items.length && (Fl.right.has(g.items[done].id) || !(g.items[done].meta && g.items[done].meta.scored))) done++;
          // (every item of this checkpoint answered: the next segment starts at the next one — never a gate with nothing in it)
          if (done >= g.items.length) { if (k + 1 < Fl.gates.length) { S.resume = { gate: (W.__runGate || 1) + k + 1, skip: 0, of: Fl.gates[k + 1].items.length, title: Fl.gates[k + 1].title }; break; } }
          else { S.resume = { gate: (W.__runGate || 1) + k, skip: base + done, of: base + g.items.length, title: g.title }; break; }
        }
      }
      await step(100);
      if (Fl.prep && Fl.prep()) { const go = document.querySelector('.iw-ps:not(.is-off) .iw-ps__act.is-primary'); if (go) { S.boards = (S.boards || 0) + 1; go.click(); } continue; }   // a reading board before the start: 出发
      if ((S.tick = (S.tick || 0) + 1) % 20 === 0) console.log('[run] t', ((Date.now() - S.t0) / 1000).toFixed(0), 's · s', Fl.sNow.toFixed(1), 'phase', Fl.phase, 'rows', S.rows.length, 'speed', Math.hypot(M().local.vel.x, M().local.vel.z).toFixed(1));
      const row = Fl._shown && Fl._shown();
      if (!row) continue;
      if (row.kind === 'glide') { const sh = await onGlide(); if (sh) return JSON.stringify({ shot: sh, glide: S.g, dbg: Fl.debug() }); continue; }
      if (row.kind === 'boards') { const sh = await onBoards(row); if (sh) return JSON.stringify({ shot: sh, boards: S.b, dbg: Fl.debug() }); continue; }
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
        // (LEARN §20, re-checked in the browser by play-4: no row on a jump-up edge's approach — runIn + 8 m past one, 2 m before one)
        { const T = Fl.T, R = Fl.RR; let past = Infinity, before = Infinity; for (const j of T.jumps || []) { const d = (((row.s - j) % T.len) + T.len) % T.len; past = Math.min(past, d); before = Math.min(before, T.len - d); }
          rec.jumpPast = past === Infinity ? null : +past.toFixed(1); rec.jumpBefore = before === Infinity ? null : +before.toFixed(1);
          if (past < R.runIn + 8 || before < R.runOut + 1) S.errors.push('a row on a jump edge\'s approach: ' + JSON.stringify({ item: rec.item, past, before })); }
        // a screenshot while the row is up and readable (the harness takes it and runs this script again)
        if (W.__runShots && W.__runShots(row, S.shotsTaken)) {
          let g = 0; while (row.s - Fl.sNow > (W.__runShotAt || 9) && g++ < 300) await step(50);
          if (rec.want != null) { const target = row.centers[rec.want]; let k = 0; while (Math.abs(Fl.latT - target) > 0.05 && k++ < 6) await swipe(target < Fl.latT ? 'left' : 'right'); rec.preSwiped = true; }
          await step(250); render(); S.shotsTaken++; S.shotPending = rec;
          return JSON.stringify({ shot: 'row' + S.shotsTaken + '-' + rec.kind, row: rec, dbg: Fl.debug() });
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
      if (W.__runShotAfter && rec.ok && !S.afterShot && rec.burstShot) { S.afterShot = true; S.burstPending = false; S.shotsTaken++; return JSON.stringify({ shot: 'row' + S.shotsTaken + '-burst', row: rec, dbg: Fl.debug(), after: true }); }
      if (rec.mode === 'none' && rec.leavesAfter !== rec.leavesBefore) S.errors.push('through the gap wrote evidence: ' + rec.item);
      if (W.__runMaxRows && S.rows.length >= W.__runMaxRows) break;
    }
    // to the finish and the results card (simulated seconds)
    if (!W.__runMaxRows && !S.resume) { let g = 0; while (!document.querySelector('.iw-learn.is-done') && !(Fl._hudOn && Fl.finishT < 0) && g++ < 900) await step(200); }
  } catch (e) { S.errors.push(String(e && e.stack || e)); }
  const Fl = F();
  S.done = true;
  // 首答只记一次: per item, at most one learn:answer with first = true
  const firsts = {}; if (Fl) for (const e of Fl.log) if (e.name === 'learn:answer' && e.first) firsts[e.itemId] = (firsts[e.itemId] || 0) + 1;
  const twice = Object.keys(firsts).filter((k) => firsts[k] > 1); if (twice.length) S.errors.push('first answer recorded twice: ' + twice.join(', '));
  const xhAny = S.checks.filter((c) => c.crosshair).length;
  const resultsShown = !!(Fl && Fl._hudOn && Fl.finishT < 0 && M().paused);   // (the results card: the run is over, the match held — as every form ends)
  if (!W.__runMaxRows && !S.resume && !resultsShown) S.errors.push('no results card at the end (phase ' + (Fl && Fl.phase) + ')');
  if (S.inv.breaks.length) S.errors.push('PLAY §1 rule 1 broken while she played: ' + JSON.stringify(S.inv.breaks.slice(0, 3)));
  const out = { resultsShown, boot: S.boot, camHandover: S.camHandover, boards: S.boards || 0, rows: S.rows, glides: S.glides, boardStretches: S.boardRecs, checks: S.checks.length, crosshairShown: xhAny, firstsOnce: !twice.length, typeLensBlocked: S.blockedTypes || 0, checkSample: S.checks.slice(0, 3), errors: S.errors, wallMs: Date.now() - S.t0 };
  out.final = Fl && Fl.debug ? Fl.debug() : null;
  out.log = Fl ? Fl.log.map((e) => e.name.replace('learn:', '') + (e.ok != null ? (e.ok ? '+' : '-') : '') + (e.first ? '*' : '') + (e.beat ? '♪' : '')).join(' ') : null;
  out.results = (document.querySelector('.iw-learn__results') || {}).innerText || null;
  out.cov = G.paint ? G.paint.coverage().map((c) => +c.toFixed(4)) : null;
  out.evDocs = Object.keys(evDoc().ev || {});
  out.resume = S.resume || null; out.invariants = S.inv;
  out.answers = Fl ? Fl.log.filter((e) => e.name === 'learn:answer').map((e) => [e.itemId, e.ok ? 1 : 0, e.first ? 1 : 0]) : [];
  out.evidence = evDoc().ev || {};
  render();
  return JSON.stringify(out);
})()
