// 关卡学习 audit: drives one gate of the puzzle level through the DOM (tools/play.mjs evalFile step).
// Expects the level to be running (?learn=w1d1&kind=puzzle). Auto-walks to the first gate, answers the first item
// WRONG, the next one right, then the first one again (it comes back in another form) right, so the gate opens.
// Returns a JSON summary: every verdict seen, the bus log (learn:*), the ink coverage after the trail, phase.
// The walk and the ink pour are stepped with the game's own audit clock (__inkwave.debug.freeze / step: fixed 60 Hz
// sim, one render per step) — on a software-GL box the live loop runs a frame a second and the sim with it.
(async () => {
  const W = window, G = W.__G, DBG = W.__inkwave.debug;
  const L = () => W.__inkwave.match && W.__inkwave.match.learn, H = () => G.hud.learn;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (f, ms = 30000, what = '') => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timeout: ' + what); await sleep(100); } };
  // advance the simulation in 2 s chunks until f() holds (sim time, not wall time)
  const stepUntil = async (f, maxMs, what) => { let t = 0; while (!f()) { if (t >= maxMs) throw new Error('timeout(sim ' + t + ' ms): ' + what); DBG.step(2000); t += 2000; await sleep(0); } return t; };
  const out = { steps: [], errors: [] };
  await until(() => L() && W.__inkwave.match.state === 'playing', 60000, 'level playing');
  const F = L();
  out.gates = F.gates.map((g) => ({ i: g.index + 1, n: g.items.length, kind: g.kind, pos: [+g.pos.x.toFixed(1), +g.pos.y.toFixed(1), +g.pos.z.toFixed(1)] }));
  out.pathLen = F.path.length;
  const p0 = W.__inkwave.match.local.pos.clone();
  DBG.freeze();
  F.autoWalk(true);
  out.simMsToGate = await stepUntil(() => F.phase === 'ask' && H()._ask && !H()._ask.answered, 90000, 'reach gate 1');
  out.walked = +p0.distanceTo(W.__inkwave.match.local.pos).toFixed(1);
  out.pausedAtGate = W.__inkwave.match.paused;
  out.touchLiveAtGate = W.__inkwave.touch ? W.__inkwave.touch.enabled : null;
  const answer = async (mode) => {
    const a = H()._ask, p = a.p;
    const right = p.tts;   // a dictation's prompt speaks the item itself; its alt form (a choice) lists it
    let picked = null;
    if (p.type === 'typed') {
      const inp = document.querySelector('.iw-learn__input');
      inp.focus(); inp.value = mode === 'right' ? right : 'zzz';
      picked = inp.value;
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    } else {
      const btns = [...document.querySelectorAll('.iw-learn__opt')];
      const idx = btns.findIndex((b) => b.querySelector('.iw-learn__opten').textContent === right);
      const k = mode === 'right' ? Math.max(0, idx) : (idx === 0 ? 1 : 0);
      picked = btns[k].querySelector('.iw-learn__opten').textContent;
      btns[k].click();
    }
    await until(() => document.querySelector('.iw-learn__verdict').classList.contains('is-on'), 8000, 'verdict');
    const okCls = document.querySelector('.iw-learn__verdict').classList.contains('is-ok');
    out.steps.push({ type: p.type, q: p.text, mode, picked, ok: okCls, verdict: document.querySelector('.iw-learn__vtext').textContent, why: document.querySelector('.iw-learn__why').textContent,
      glossShown: !!document.querySelector('.iw-learn__panel.is-answered') });
    await sleep(120);
    document.querySelector('.iw-learn__next').click();
    await sleep(150);
  };
  try {
    await answer('wrong');
    await until(() => H()._ask && !H()._ask.answered, 8000, 'q2');
    await answer('right');
    await until(() => H()._ask && !H()._ask.answered, 8000, 'q1 again');
    await answer('right');
    await until(() => F.cur === 1, 8000, 'gate 1 open');
    DBG.step(3500);   // the ink pours on to gate 2 (timed on the game clock)
  } catch (e) { out.errors.push(String(e && e.message || e)); }
  DBG.unfreeze();
  out.cov = G.paint.coverage().map((c) => +c.toFixed(4));
  out.log = F.log;
  out.phase = F.phase; out.paused = W.__inkwave.match.paused; out.cur = F.cur;
  out.locks = F.gates.map((g) => g.locks);
  out.store = JSON.parse(localStorage.getItem('inkwave:learn:v1') || 'null');
  return JSON.stringify(out);
})()
