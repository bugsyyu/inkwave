// 关卡学习 audit for the forms (tools/play.mjs evalFile step): drives the running level through G.learn's API and
// the DOM. Expects ?learn=…&kind=<form>&short=1. For every question: the first one wrong, the rest right (the
// answer comes from the flow's own debug accessor, never from reading the stage). Returns a JSON summary: the bus log
// (learn:*), the effects seen (checkpoints / zone ink / boss HP), the results card, console errors are the harness's.
(async () => {
  const W = window, G = W.__G;
  const M = () => W.__inkwave.match, L = () => M() && M().learn, H = () => G.hud.learn;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  // fast: once the level runs, the real-time loop is frozen and the simulation stepped (main.js debug.freeze / step),
  // so a minute of race or zone countdown costs a few renders instead of a minute of wall clock
  const FAST = /fast=1/.test(location.search);
  let frozen = false;
  // stepping without a render: debug.step draws one frame per call, and under software GL a frame of a 4v4 takes
  // seconds; the rules do not need the picture, so the frames run with the renderer skipped and one draw at the end
  const adv = async (ms) => {
    if (!frozen) { await sleep(Math.min(ms, 200)); return; }
    const I = W.__inkwave, n = Math.max(1, Math.round(ms / (1000 / 60)));
    I._skipRender = true;
    try { for (let i = 0; i < n; i++) I._frame(1 / 60); } finally { I._skipRender = false; }
    await sleep(0);
  };
  const until = async (f, ms = 30000, what = '') => { const t = Date.now(); let sim = 0; while (!f()) { if (Date.now() - t > ms || sim > ms * 3) throw new Error('timeout: ' + what); await adv(frozen ? 400 : 100); sim += 400; } };
  const out = { steps: [], errors: [], effects: [] }; const T0 = Date.now();
  try {
    // (software GL renders a 4v4 at well under a frame a second: freeze as soon as the level exists and step the
    // simulation through the intro, so the audit measures the rules and not the renderer)
    await until(() => L(), 120000, 'level built');
    if (FAST && W.__inkwave.debug) { W.__inkwave.debug.freeze(); frozen = true; out.fast = true; }
    // (the boss's squad bots are show only — their brains are the dearest part of a stepped frame, so the audit parks them)
    if (FAST && M().learnKind === 'boss' && W.__inkwave.debug.freezeBots) W.__inkwave.debug.freezeBots();
    await until(() => L() && M().state === 'playing', 60000, 'level playing');
    const F = L(), kind = M().learnKind;
    out.kind = kind; out.stage = W.__inkwave.mapDef && W.__inkwave.mapDef.id; out.actors = M().actors.length; out.teams = [...new Set(M().actors.map((a) => a.team))];
    out.boot = F.debug ? F.debug() : null;
    // the right answer of the live question, from the flow's own record of it (never from the stage)
    const rightOf = (F, p) => {
      const A = F.asking; if (!A) return null;
      const it = A.item;
      if (p._alt === 'choice-of-typed') return (p.options || []).findIndex((o) => o.text === (it.meta && it.meta.ref || it.en));
      if (p._alt === 'typed-of-choice') return it.options[it.answer].en;
      if (p.type === 'choice') return p._perm ? p._perm.indexOf(it.answer) : it.answer;
      return (it.meta && it.meta.ref) || it.en;
    };
    const answer = async (mode) => {
      const a = H()._ask, p = a.p;
      const want = rightOf(F, p);
      let picked = null;
      if (p.type === 'choice') {
        const btns = [...document.querySelectorAll('.iw-learn__opt')];
        let k = typeof want === 'number' ? want : btns.findIndex((b) => b.querySelector('.iw-learn__opten').textContent === String(want));
        if (k < 0) k = 0;
        if (mode === 'wrong') k = k === 0 ? 1 : 0;
        picked = btns[k].querySelector('.iw-learn__opten').textContent;
        btns[k].click();
      } else {
        const inp = document.querySelector('.iw-learn__input');
        inp.focus(); inp.value = mode === 'right' ? String(want || '') : 'zzz zzz';
        picked = inp.value;
        inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      }
      await until(() => document.querySelector('.iw-learn__verdict').classList.contains('is-on'), 8000, 'verdict');
      const ok = document.querySelector('.iw-learn__verdict').classList.contains('is-ok');
      out.steps.push({ type: p.type, q: p.text, mode, picked, ok, why: document.querySelector('.iw-learn__why').textContent.slice(0, 60) });
      await adv(150);
      document.querySelector('.iw-learn__next').click();
      await adv(200);
      return ok;
    };
    let n = 0, wrongDone = false;
    const t0 = Date.now(); out.tAtPlaying = Date.now() - T0;
    while (Date.now() - t0 < (FAST ? 75000 : 300000)) {
      if (F.phase === 'done' || document.querySelector('.iw-learn.is-done')) break;
      // let the form bring the next question up (auto-walk to the next checkpoint when the form walks)
      if (F.prep && F.prep()) { const go = document.querySelector('.iw-lf__go'); if (go) { out.boards = (out.boards || 0) + 1; go.click(); } await adv(1000); continue; }
      if (!(H()._ask && !H()._ask.answered)) {
        if (F.autoWalk && !F.auto && (F.phase === 'walk' || F.phase === 'final')) F.autoWalk(true);
        await adv(1000); continue;
      }
      const mode = !wrongDone ? 'wrong' : 'right';
      const ok = await answer(mode);
      if (mode === 'wrong' && !ok) wrongDone = true;
      if (mode === 'wrong' && ok) wrongDone = true;   // (could not miss: fine)
      n++;
      if (F.effects) out.effects.push(F.effects());
    }
    out.answered = n; out.tLoop = Date.now() - t0; out.simT = F.t;
    // (the last answer → the round's close → the results: a few seconds of simulation, each stepped frame dearer than real
    // time under software GL — so the wait is counted in simulated seconds as well as wall clock)
    await until(() => document.querySelector('.iw-learn.is-done'), FAST ? 30000 : 60000, 'results card (finishT ' + (F.finishT != null ? (+F.finishT).toFixed(2) : '?') + ', phase ' + F.phase + ')');
    out.results = document.querySelector('.iw-learn__results') && document.querySelector('.iw-learn__results').innerText.slice(0, 400);
  } catch (e) { out.errors.push(String(e && e.message || e)); }
  if (frozen) { try { W.__inkwave.debug.step(16.7); W.__inkwave.debug.unfreeze(); } catch (e) { /* fine */ } }
  const F = L();
  out.log = F ? F.log.map((e) => e.name + (e.ok != null ? (e.ok ? '+' : '-') : '') + (e.first ? '*' : '')).join(' ') : null;
  out.done = F ? F.log.find((e) => e.name === 'learn:done') : null;
  out.final = F && F.debug ? F.debug() : null;
  out.cov = G.paint.coverage().map((c) => +c.toFixed(4));
  out.store = Object.keys(JSON.parse(localStorage.getItem('inkwave:learn:v1') || '{"ev":{}}').ev);
  out.stars = localStorage.getItem('inkwave:learn:design:v1');
  return JSON.stringify(out);
})()
