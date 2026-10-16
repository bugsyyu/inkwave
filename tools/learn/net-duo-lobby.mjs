// 关卡学习 · two players online — the lobby check for tools/learn/net-duo.mjs --lobby (docs/LEARN.md §14): INKWAVE's own
// room screen on both pages, the host switching MODE through the screen's own arrows to 双人联机赛 and 双人合作赛, the
// 课 · LESSON row (week / day) — picked on the host's screen, shown on the guest's — and the one-side rules of coop2
// (team row and bots locked, the start rule). Stops before the start (the match runs are the other two scripts).
export async function driveLobby({ step, ev, check, mark, say, shot }) {
  const both = (fn, ...a) => Promise.all([0, 1].map((i) => ev(i, fn, ...a)));
  await both(() => { __inkwave.menus.show('lobby'); });
  await step(0.6);
  const read = () => both(() => {
    const q = (s) => document.querySelector(s);
    const vis = (s) => { const e = q(s); return !!e && getComputedStyle(e).display !== 'none'; };
    return { screen: __inkwave.menus.current, mode: (q('.iw-lob__modename') || {}).textContent || null, lesson: vis('.iw-lset--lesson'),
      week: (q('.iw-lset--lesson .iw-seg:first-child .iw-seg__opt.is-sel') || {}).textContent || null, day: (q('.iw-lset--lesson .iw-seg:last-child .iw-seg__opt.is-sel') || {}).textContent || null,
      note: (q('.iw-lset--lesson .iw-lset__note') || {}).textContent || null, teamLocked: !!q('.iw-lob__team.is-locked'), botsLocked: !!q('.iw-lset--bots.is-locked'),
      learnClass: !!q('.iw-lobby.is-learnmode'), start: (q('.iw-btn--lobstart .iw-btn__sub') || {}).textContent || null, block: __G.net.startBlock(), lobbyMode: __G.net.lobby.mode, lobbyLearn: __G.net.lobby.learn };
  });
  let r = await read();
  check('lobby: INKWAVE\'s room screen on both, MODE turf to start with', r.every((x) => x.screen === 'lobby') && r[0].mode === 'TURF WAR', JSON.stringify(r.map((x) => [x.screen, x.mode])));
  // the host clicks MODE ▶ to 双人联机赛 (turf → zones → boss → versus2), the guest's screen follows
  for (let k = 0; k < 6 && (await ev(0, () => __G.net.lobby.mode)) !== 'versus2'; k++) { await ev(0, () => document.querySelector('.iw-lob__modearrows .is-r').click()); await step(0.3); }
  await step(0.6);
  r = await read();
  check('MODE 双人联机赛 on both screens, the 课 row shown (learning modes only), versus2\'s note', r.every((x) => x.mode === '双人联机赛' && x.lesson && x.learnClass) && /同一道题/.test(r[1].note || ''), JSON.stringify(r.map((x) => [x.mode, x.lesson, x.week, x.day, x.note])));
  // the host picks 第 2 周 · 第 3 天 on its own screen
  await ev(0, () => { const segs = document.querySelectorAll('.iw-lset--lesson .iw-seg'); [...segs[0].querySelectorAll('.iw-seg__opt')][1].click(); });
  await step(0.3);
  await ev(0, () => { const segs = document.querySelectorAll('.iw-lset--lesson .iw-seg'); [...segs[1].querySelectorAll('.iw-seg__opt')][2].click(); });
  await step(0.6);
  r = await read();
  check('课: the host picked 第 2 周 · 第 3 天, the guest\'s lobby and screen show it', r[1].lobbyLearn.week === 2 && r[1].lobbyLearn.day === 3 && r[1].week === '第 2 周' && r[1].day === '3', JSON.stringify(r.map((x) => [x.lobbyLearn, x.week, x.day])));
  await shot(0, 'lobby-host'); await shot(1, 'lobby-guest');
  // ▶ to 双人合作赛: one side — team row and bots locked; two players → can start
  await ev(0, () => document.querySelector('.iw-lob__modearrows .is-r').click());
  await step(0.8);
  r = await read();
  check('MODE 双人合作赛: team row and bots locked on both screens, two players → no start block', r.every((x) => x.mode === '双人合作赛' && x.teamLocked && x.botsLocked) && r[0].block === null, JSON.stringify(r.map((x) => [x.mode, x.teamLocked, x.botsLocked, x.block, x.note])));
  // the coop2 start rule with one player: the guest leaves → the host's start is blocked with the Chinese reason
  await ev(1, () => __G.net.leave());
  await step(1.2);
  const one = await ev(0, () => ({ n: __G.net.lobby.players.length, block: __G.net.startBlock(), sub: (document.querySelector('.iw-btn--lobstart .iw-btn__sub') || {}).textContent }));
  check('coop2 alone: the start is blocked (双人合作赛要两个人)', one.n === 1 && /两个人/.test(one.block || ''), JSON.stringify(one));
  mark('lobbyDone');
}
