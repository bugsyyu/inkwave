// 关卡学习 audit for the forms (tools/play.mjs evalFile step): drives the running level through G.learn's API and
// the DOM. Expects ?learn=…&kind=<form>&short=1. For every question: the first one wrong, the rest right (the
// answer comes from the flow's own debug accessor, never from reading the stage). Returns a JSON summary: the bus log
// (learn:*), the effects seen (checkpoints / zone ink / boss HP), the results card, console errors are the harness's.
(async () => {
  const W = window, G = W.__G;
  const M = () => W.__inkwave.match, L = () => M() && M().learn, H = () => G.hud.learn;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const until = async (f, ms = 30000, what = '') => { const t = Date.now(); while (!f()) { if (Date.now() - t > ms) throw new Error('timeout: ' + what); await sleep(100); } };
  const out = { steps: [], errors: [], effects: [] };
  try {
    await until(() => L() && M().state === 'playing', 90000, 'level playing');
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
      await sleep(150);
      document.querySelector('.iw-learn__next').click();
      await sleep(200);
      return ok;
    };
    let n = 0, wrongDone = false;
    const t0 = Date.now();
    while (Date.now() - t0 < 300000) {
      if (F.phase === 'done' || document.querySelector('.iw-learn.is-done')) break;
      // let the form bring the next question up (auto-walk to the next checkpoint when the form walks)
      if (F.prep && F.prep()) { const go = document.querySelector('.iw-lf__go'); if (go) { out.boards = (out.boards || 0) + 1; go.click(); } await sleep(400); continue; }
      if (!(H()._ask && !H()._ask.answered)) {
        if (F.autoWalk && !F.auto && F.phase === 'walk') F.autoWalk(true);
        await sleep(200); continue;
      }
      const mode = !wrongDone ? 'wrong' : 'right';
      const ok = await answer(mode);
      if (mode === 'wrong' && !ok) wrongDone = true;
      if (mode === 'wrong' && ok) wrongDone = true;   // (could not miss: fine)
      n++;
      if (F.effects) out.effects.push(F.effects());
    }
    out.answered = n;
    await until(() => document.querySelector('.iw-learn.is-done'), 60000, 'results card');
    out.results = document.querySelector('.iw-learn__results') && document.querySelector('.iw-learn__results').innerText.slice(0, 400);
  } catch (e) { out.errors.push(String(e && e.message || e)); }
  const F = L();
  out.log = F ? F.log.map((e) => e.name + (e.ok != null ? (e.ok ? '+' : '-') : '') + (e.first ? '*' : '')).join(' ') : null;
  out.done = F ? F.log.find((e) => e.name === 'learn:done') : null;
  out.final = F && F.debug ? F.debug() : null;
  out.cov = G.paint.coverage().map((c) => +c.toFixed(4));
  out.store = Object.keys(JSON.parse(localStorage.getItem('inkwave:learn:v1') || '{"ev":{}}').ev);
  out.stars = localStorage.getItem('inkwave:learn:design:v1');
  return JSON.stringify(out);
})()
