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
  // (the room is created with the mode under test already set — net-duo.mjs setSettings — so the screens start on it, not on turf)
  check('lobby: INKWAVE\'s room screen on both, the same MODE on both', r.every((x) => x.screen === 'lobby') && r[0].mode === r[1].mode, JSON.stringify(r.map((x) => [x.screen, x.mode])));
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

// 关卡学习 · the guest's side through the screens themselves (docs/LEARN.md §16「只代码审过、没在浏览器里跑的」: 她作为访客进别人的房间、
// 用对的房间码进房、在房间里点「开始」). After driveLobby the guest (c1) has left and the host sits alone in 双人合作赛. Here the guest
// comes back the way she would: the online hub's join card, the five letters typed through the hub's own key routing
// (menus.handleKey → the screen's onKey), Enter = 加入; then she readies up with the room screen's own button (the host's 开始
// unblocks), and the host presses the real 开始 — both pages leave the room screen for the match. Stops there (the match itself
// is net-duo-play.mjs's).
export async function driveJoinUi({ step, ev, check, mark, say, shot }, code) {
  const until = async (i, fn, arg, n = 80, dt = 0.5) => { for (let k = 0; k < n; k++) { if (await ev(i, fn, arg)) return true; await step(dt); } return false; };
  // a click on a screen element, or a failed check naming what was missing and which screen was up (never a throw mid-run)
  const click = async (i, sel, what) => { const r = await ev(i, (q) => { const e = document.querySelector(q); if (!e) return { ok: false, screen: __inkwave.menus.current }; e.click(); return { ok: true }; }, sel); check(r.ok, `${what}: ${sel} is on the screen (c${i})`, JSON.stringify(r)); return r.ok; };
  // (after leave() the guest may already be on 'online' behind a wipe the frozen page never finishes: force the swap, no wipe)
  await ev(1, () => { __inkwave.menus.show('online', { force: true, wipe: false, light: false }); });
  await until(1, () => !!document.querySelector('.iw-hubcard--join'), undefined, 20, 0.3);
  let r = await ev(1, () => { const j = document.querySelector('.iw-hubcard--join'); return { screen: __inkwave.menus.current, card: !!j, mode: j ? j.dataset.mode : null, boxes: document.querySelectorAll('.iw-code__box').length }; });
  check('guest: the online hub, the join card idle with five boxes', r.screen === 'online' && r.card && r.mode === 'idle' && r.boxes === 5, JSON.stringify(r));
  // she taps the card and types the code
  if (!await click(1, '.iw-hubcard--join', 'guest taps the join card')) return;
  await step(0.3);
  await ev(1, (c) => { for (const ch of c) __inkwave.menus.handleKey(new KeyboardEvent('keydown', { key: ch, code: 'Key' + ch, bubbles: true, cancelable: true })); }, code);
  await step(0.2);
  r = await ev(1, () => { const j = document.querySelector('.iw-hubcard--join'); return { mode: j.dataset.mode, boxes: [...j.querySelectorAll('.iw-code__ch')].map((b) => b.textContent).join(''), lit: !!j.querySelector('.iw-minibtn.is-go.is-ready'), hint: (j.querySelector('.iw-join__hint') || {}).textContent }; });
  check('guest: the five letters sit in the boxes, 加入 lit', r.boxes === code && r.mode === 'entry' && r.lit, JSON.stringify(r));
  await shot(1, 'join-typed');
  // Enter = 加入 — but only while the card still waits in entry mode: the fifth letter arms a 320 ms auto-join (menus.js, the
  // join card), and an Enter that lands after that join has opened the room screen is an 'accept' on the guest's focused
  // 准备 button (handleKey → _nav), which readied her before she meant to (the first run of this probe). Checked and sent in
  // one page call, so the timer cannot fire in between.
  const pressed = await ev(1, () => {
    const j = document.querySelector('.iw-hubcard--join');
    if (!j || j.dataset.mode !== 'entry' || __inkwave.menus.current !== 'online') return { enter: false, mode: j ? j.dataset.mode : null, screen: __inkwave.menus.current };
    __inkwave.menus.handleKey(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    return { enter: true };
  });
  say('join-ui', 'Enter ' + JSON.stringify(pressed));
  const joined = await until(1, () => __inkwave.menus.current === 'lobby' && !!__G.net.code && __G.net.lobby.players.length === 2);
  let both = await Promise.all([0, 1].map((i) => ev(i, () => ({ code: __G.net.code, n: __G.net.lobby.players.length, host: __G.net.isHost, screen: __inkwave.menus.current, mode: __G.net.lobby.mode }))));
  check('guest joined by the code: both on the room screen, one room of two, the host unchanged, mode still 双人合作赛', joined && both[0].code === code && both[1].code === code && both[0].host && !both[1].host && both.every((x) => x.n === 2 && x.screen === 'lobby' && x.mode === 'coop2'), JSON.stringify(both));
  // before she readies: the guest sees 准备 (off) and no 开始 (the host's button); the host's 开始 is blocked, waiting for her
  const bar = () => Promise.all([0, 1].map((i) => ev(i, () => {
    const q = (s) => document.querySelector(s), vis = (e) => !!e && getComputedStyle(e).display !== 'none' && getComputedStyle(e).visibility !== 'hidden';
    const rb = q('.iw-btn--ready'), sb = q('.iw-btn--lobstart');
    return { ready: vis(rb), readyOn: !!rb && rb.classList.contains('is-on'), readyLabel: (q('.iw-btn--ready .iw-btn__label') || {}).textContent, start: vis(sb), startBlocked: !!sb && sb.classList.contains('is-blocked'),
      startSub: (q('.iw-btn--lobstart .iw-btn__sub') || {}).textContent, canStart: __G.net.canStart(), readyCount: __G.net.lobby.players.filter((p) => p.ready).length };
  })));
  r = await bar();
  check('before ready: the guest has 准备 (off) and no 开始; the host has 开始, blocked, waiting for her', r[1].ready && !r[1].readyOn && !r[1].start && r[0].start && r[0].startBlocked && !r[0].canStart, JSON.stringify(r));
  await shot(1, 'lobby-guest-unready');
  // she presses 准备 (the button itself)
  if (!await click(1, '.iw-btn--ready', 'guest presses 准备')) return;
  const readied = await until(0, () => __G.net.canStart());
  r = await bar();
  check('after ready: her button is on, the host\'s 开始 unblocked (canStart)', readied && r[1].readyOn && r[0].canStart && !r[0].startBlocked && r[0].readyCount === 1, JSON.stringify(r));
  await shot(0, 'lobby-host-ready'); await shot(1, 'lobby-guest-ready');
  // the host presses the real 开始: both pages leave the room screen for the match
  if (!await click(0, '.iw-btn--lobstart', 'host presses 开始')) return;
  const started = (await until(0, () => __G.net.state === 'match')) && (await until(1, () => __G.net.state === 'match'));
  both = await Promise.all([0, 1].map((i) => ev(i, () => ({ state: __G.net.state, screen: __inkwave.menus.current, mode: __G.net.lobby.mode }))));
  check('开始 pressed on the room screen: both sessions are in the match (双人合作赛)', started && both.every((x) => x.state === 'match'), JSON.stringify(both));
  say('join-ui', JSON.stringify(both));
  mark('joinUiDone');
}
