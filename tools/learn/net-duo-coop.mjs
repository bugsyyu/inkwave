// 关卡学习 · two players online — the coop2 (双人成形合作赛) script for tools/learn/net-duo.mjs (docs/LEARN.md §14).
// Both players auto-walk to the gate, each onto their pad; the host declares the gate; every question shows the clue
// half on one screen and the answer form on the other; the hands side answers (the very first answer wrong: the item
// comes back reworded to the OTHER player's hands); the gate opens on both; on to the last gate and the results.
export async function driveCoop({ step, live, answer, state, shot, ev, check, mark, say, sleep, R, budgetLeft }) {
  const both = (fn, ...a) => Promise.all([0, 1].map((i) => ev(i, fn, ...a)));
  const dbg = () => both(() => __inkwave.match.learn.debug());
  await both(() => __inkwave.match.learn.autoWalk(true));
  const seen = new Map();
  let wrongDone = false, asks = 0, shots = 0, lastGateCheck = -1, splits = [], retry = null, lastSig = '', iter = 0;
  while (budgetLeft() > 6000) {
    await step(0.5);
    const D = await dbg();
    // walking: keep auto-walk on (the gate opening turns it off)
    for (const i of [0, 1]) if (D[i].phase === 'walk') await ev(i, () => { const F = __inkwave.match.learn; if (!F.auto) F.autoWalk(true); });
    if (D[0].phase === 'ask' && D[1].phase === 'ask' && lastGateCheck !== D[0].cur) {
      lastGateCheck = D[0].cur;
      if (!R.t.padsHeld) mark('padsHeld');
      check(`gate ${D[0].cur + 1}: both on their pads, the host declared it, both screens asking`, D[0].cur === D[1].cur && D[0].on && D[0].on.every(Boolean), `pads ${JSON.stringify(D[0].pads)} held by ${JSON.stringify(D[0].on)}`);
    }
    const L = await Promise.all([live(0), live(1)]);
    if (L[0] && L[1] && L[0].q && L[0].q === L[1].q && !seen.has(L[0].q)) {
      const q = L[0].q;
      seen.set(q, true); asks++;
      const hands = L[0].role === 'hands' ? 0 : 1, clue = 1 - hands;
      const x = L[hands], c = L[clue];
      const split = { q, hands: 'c' + hands, handsType: x.type, handsForm: x.type === 'choice' ? x.opts + ' options' : x.hasInput ? 'input' : 'none', handsSound: x.play, clueType: c.type, clueForm: c.hasInput || c.opts ? 'FORM' : 'none', clueSound: c.play, clueText: c.text, sameItem: x.id === c.id || !c.id };
      splits.push(split);
      if (!R.t.split) { mark('split'); if (R.shotQ && shots++ < 1) { await shot(0, 'split'); await shot(1, 'split'); } }
      check(`q${q}: split — the clue screen has the stem${c.play ? ' and the sound' : ''} and no form, the other has the form and no sound`, c.type === 'clue' && !c.hasInput && !c.opts && !x.play && (x.type === 'choice' ? x.opts > 0 : x.hasInput), JSON.stringify(split));
      if (retry && retry.id === x.id) check('the re-ask (reworded) went to the other player\'s hands', retry.hands !== hands, `first c${retry.hands}, now c${hands}`);
      const right = wrongDone;
      say(`q${q}: c${hands} answers ${right ? 'right' : 'wrong'}:`, await answer(hands, right));
      if (!right) { wrongDone = true; retry = { id: x.id, hands }; }
      await step(0.2);
      const V = await both(() => ({ on: document.querySelector('.iw-learn__verdict').classList.contains('is-on'), ok: document.querySelector('.iw-learn__verdict').classList.contains('is-ok'), why: document.querySelector('.iw-learn__why').textContent.slice(0, 80) }));
      check(`q${q}: the verdict on both screens`, V[0].on && V[1].on && V[0].ok === V[1].ok && V[0].ok === right, JSON.stringify(V));
      await sleep(200);
      await both(() => { const b = document.querySelector('.iw-learn__next'); if (b && document.querySelector('.iw-learn__verdict.is-on')) b.click(); });
    }
    const S = await Promise.all([state(0), state(1)]);
    const sig = D.map((d, i) => `${d.phase} gate ${d.cur + 1}/${d.gates} on ${JSON.stringify(d.on)} q ${d.q ? d.q.q + d.q.role[0] : '-'} ${S[i].net}${S[i].err ? '!' + S[i].err : ''}`).join(' | ');
    if (sig !== lastSig) { lastSig = sig; say(sig); }
    if (++iter % 8 === 1) say('  where:', D.map((d) => `me ${JSON.stringify(d.me)} auto ${d.auto} path ${JSON.stringify(d.path)} pads ${JSON.stringify(d.pads)}`).join(' | '));
    if (S.some((x) => x.net !== 'match')) { say('a client left the match'); break; }
    if (S.every((s) => s.learnCard)) { mark('results'); break; }
  }
  const S = await Promise.all([state(0), state(1)]), D = await dbg();
  R.final = S.map((x, i) => ({ log: x.log, card: x.learnCard, ev: x.ev, dbg: D[i] }));
  for (const [i, x] of S.entries()) say(`c${i} log: ${x.log}`);
  R.splits = splits;
  const opened = S.map((x) => (x.log.match(/gate\b/g) || []).length);
  check('gates opened on both screens, in step', D[0].cur === D[1].cur && D[0].cur === D[0].gates, `${D[0].cur}/${D[0].gates} vs ${D[1].cur}/${D[1].gates}, gate events ${opened}`);
  check('roles swapped: both players answered and both gave clues', D.every((d) => d.mine.asked >= 1 && d.mine.clues >= 1), JSON.stringify(D.map((d) => d.mine)));
  check('evidence: each screen recorded only its own player\'s answers', D.every((d) => d.mine.firsts <= d.mine.asked) && S.every((x) => x.ev.length >= 1), JSON.stringify(S.map((x) => x.ev)) + ' ' + JSON.stringify(D.map((d) => [d.mine.firsts, d.mine.asked])));
  check('results: B\'s results card on both screens, with the pair\'s lines', S.every((x) => x.learnCard && /两个人/.test(x.learnCard)), JSON.stringify(S.map((x) => (x.learnCard || '').replace(/\s+/g, ' ').slice(0, 160))));
  if (budgetLeft() > 12000) { await shot(0, 'results'); await shot(1, 'results'); }
}
