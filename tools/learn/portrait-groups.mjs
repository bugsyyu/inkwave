// 关卡学习 I (docs/LEARN.md §17): the screen walks of tools/learn/portrait-audit.mjs, one per --group. Each gets the runner's
// helpers: ev (page.evaluate) · step(n) (n frames of the frozen game clock) · cur() · waitFor(fn, ms, what, ...args) ·
// tap(selector) (a real touch tap at the element's centre) · measure(name, { scopes, back, reached, note, extra }) ·
// visit(mainMenuId, screen, backSelector) · say · sleep · page.
export const GROUPS = {
  // main · 学习 · 设置 · 怎么玩 · 制作人员
  async menus(c) {
    const main = await c.measure('main', { extra: await c.ev(() => [...document.querySelectorAll('.iw-main__menu [data-id]')].map((b) => b.dataset.id)) });
    main.backOk = null;
    await c.visit('learn', 'learn');
    await c.visit('settings', 'settings');
    await c.visit('howto', 'howto');
    await c.visit('credits', 'credits');
  },
  // 装备 · 换装
  async kit(c) {
    await c.visit('loadout', 'loadout', '.iw-backbtn', { settle: 1800 });
    await c.visit('locker', 'locker', '.iw-backbtn', { settle: 1800 });
  },
  // 联机 (1 of 2): the hub · a room code typed on the phone's own keyboard (a wrong one: the error) · create → the room ·
  // its weapon drawer · the locker from the room and back into it
  async online(c) {
    const R = await c.visit('online', 'online', '.iw-backbtn', { keepOpen: true });
    if (!R.reached) return;
    // the code: tap the boxes — on a phone that must bring up a keyboard (an <input> gets the focus)
    await c.tap('.iw-code__box', 'code box');
    const kb = await c.ev(() => ({ tag: document.activeElement && document.activeElement.tagName, mode: document.activeElement && document.activeElement.getAttribute('inputmode'), entry: !!document.querySelector('.iw-hubcard--join.is-entry') }));
    await c.page.keyboard.type('ZZZZZ', { delay: 40 });
    await c.waitFor(() => !!document.querySelector('.iw-jstat.is-on') || !!document.querySelector('.iw-hubcard--join.is-err'), 15000, 'join error');
    await c.measure('online-join-error', { back: '.iw-backbtn', extra: { focusOnTap: kb, error: await c.ev(() => (document.querySelector('.iw-jstat__txt') || {}).textContent || null) } });
    const lobby = await openRoom(c);
    if (!lobby) return;
    // the weapon drawer (a modal over the room), closed by its ✕
    await c.tap('.iw-lob__wchip', 'weapon chip');
    const drawer = await c.waitFor(() => !!document.querySelector('.iw-ldr'), 5000, 'weapon drawer');
    const dr = await c.measure('lobby-weapons', { reached: drawer, back: '.iw-ldr__close' });
    await c.tap('.iw-ldr__close', 'drawer ✕');
    dr.backOk = await c.waitFor(() => !__inkwave.menus._modal, 5000, 'drawer closed');
    // the locker from the room, and back into it
    await c.tap('.iw-lob__lchip', 'look chip');
    const lk = await c.waitFor(() => __inkwave.menus.current === 'locker', 8000, 'locker');
    const lrow = await c.measure('lobby-locker', { reached: lk, back: '.iw-backbtn' });
    if (lk) { await c.tap('.iw-backbtn', 'locker back'); lrow.backOk = await c.waitFor(() => __inkwave.menus.current === 'lobby', 8000, 'back in the room'); }
  },
  // 联机 (2 of 2): create → the room · the emote wheel · MODE ▶ 双人合作赛 · leave (the modal) → the hub → back to main
  async room(c) {
    const lobby = await openRoom(c);
    if (!lobby) return;
    await c.tap('.iw-lob__emote', 'emote');
    const wheel = await c.waitFor(() => !!document.querySelector('.iw-emowheel'), 5000, 'emote wheel');
    const wr = await c.measure('lobby-emotes', { reached: wheel });
    await c.tap('.iw-emowheel .iw-emo', 'an emote');
    wr.backOk = await c.waitFor(() => !__inkwave.menus._modal, 5000, 'wheel closed');
    await c.tap('.iw-lob__modearrows .is-r', 'mode ▶');
    await c.step(3);
    await c.measure('lobby-coop2', { back: '.iw-lob__leave', extra: await c.ev(() => ({ mode: __G.net.lobby.mode, block: __G.net.startBlock(), squad: (document.querySelector('.iw-lob__squadlock') || {}).textContent })) });
    await c.tap('.iw-lob__leave', 'leave');
    await c.waitFor(() => !!document.querySelector('.iw-modal'), 5000, 'leave modal');
    const lv = await c.measure('lobby-leave', {});
    await c.tap('.iw-modal .iw-btn--danger', 'LEAVE');
    lobby.backOk = lv.backOk = await c.waitFor(() => __inkwave.menus.current === 'online', 10000, 'back on the hub');
    await c.tap('.iw-backbtn', 'hub back');
    const hub = { name: 'online → main', reached: true, backOk: await c.waitFor(() => __inkwave.menus.current === 'main', 8000, 'back to main from online') };
    c.rows.push(hub);
  },
  // Zone Control on the phone (see the runner's header): HUD + question card, play, the room's pause, the results
  async zone(c) {
    const HUD = ['.iw-learn', '.iw-hud', '.iw-lf', '.iw-touch'];
    await c.waitFor(() => !!(__inkwave.match && __inkwave.match.learn), 90000, 'the level built');
    await c.ev(async () => { for (let i = 0; i < 30 && __inkwave.match.state !== 'playing'; i++) { __inkwave.debug.step(500); await new Promise((r) => setTimeout(r, 0)); } });
    // versus2 keeps the four weapon keys (forms/versus2.js removes is-learn from the touch layer); show them the same way
    await c.ev(() => { __G.touch && __G.touch.el.classList.remove('is-learn'); });
    const go = await c.ev(() => !!window.__iwCenter('.iw-lf__go'));
    if (go) await c.tap('.iw-lf__go', 'prep: go');
    // step the game clock until a question is up
    await c.ev(async () => { const L = __inkwave.match.learn; for (let i = 0; i < 40 && !(L.asking && __G.hud.learn._ask); i++) { __inkwave.debug.step(1000); await new Promise((r) => setTimeout(r, 0)); } });
    const q = await c.measure('zone-question', { scopes: HUD, extra: await c.ev(() => ({ asking: !!__inkwave.match.learn.asking, hold: !!__inkwave.match.learn.hold, touchLive: __G.touch && __G.touch.enabled, type: __G.hud.learn._ask && __G.hud.learn._ask.p.type })) });
    // answer it right (the audits read the right answer off the form) and play on
    await c.ev(() => { const L = __inkwave.match.learn, a = L.rightAnswer ? L.rightAnswer() : null, H = __G.hud.learn; if (H.choices && typeof a === 'number') H.choices[a].click(); else if (H.input) { H.input.value = String(a); H._submit(H.input.value); } });
    await c.ev(async () => { const L = __inkwave.match.learn; for (let i = 0; i < 20 && L.hold; i++) { __inkwave.debug.step(500); await new Promise((r) => setTimeout(r, 0)); } });
    const play = await c.measure('zone-play', { scopes: HUD, extra: await c.ev(() => ({ hold: !!__inkwave.match.learn.hold, touchLive: __G.touch && __G.touch.enabled, timer: (document.querySelector('.iw-timer__txt') || {}).textContent })) });
    q.backOk = null; play.backOk = null;
    // the room's pause: the battle pause (online: the match runs on) — G.netm stood in only while it is measured
    await c.ev(() => { window.__iwNetm = __G.netm; __G.netm = { audit: true }; __inkwave.menus.show('pause'); });
    const pz = await c.measure('room-pause', { noStep: true, back: '.iw-pause__menu [data-id="resume"]', extra: await c.ev(() => ({ screen: __inkwave.menus.current, title: (document.querySelector('.iw-pause__live') || {}).textContent })) });
    await c.ev(() => { __G.netm = window.__iwNetm || null; delete window.__iwNetm; });   // (before any game frame runs again)
    await c.tap('.iw-pause__menu [data-id="resume"]', 'back to the match');
    pz.backOk = await c.ev(() => __inkwave.menus.current === null);
    // the results of a 双人联机赛: INKWAVE's Zone Control results with the questions strip (data as main.js _judge builds it)
    await c.ev(() => {
      const m = __inkwave.match, act = m.actors;
      const data = { win: true, percents: [38.4, 31.2], colors: [__G.teamHex[0], __G.teamHex[1]], teamNames: __inkwave.palette.names,
        players: act.map((a, i) => ({ name: a.name, team: a.team, weapon: a.weaponId, turf: 420 - i * 37, splats: (i * 3) % 4, deaths: i % 3, isSelf: a.isLocal, bot: !!a.isBot, zoneTurf: 60 - i * 5 })),
        xp: { gained: 1700, levelBefore: 3, levelAfter: 4, xpBefore: 1500, xpAfter: 650, xpToNextBefore: 1850, xpToNextAfter: 2200 },
        mapName: '十字市场', mode: 'zones', zones: { counts: [0, 41], penalty: [0, 6], winner: 0, reason: 'answered', overtime: false, overtimeT: 0 },
        learn: { form: 'versus2', week: 1, day: 6, asked: 12, total: 12, rows: [{ name: '我', team: 0, self: true, wins: 7, right: 10, answered: 12 }, { name: '小鱿', team: 1, self: false, wins: 5, right: 9, answered: 12 }], mine: { right: 10, firstRight: 8, firsts: 11, wins: 7 } },
        online: true };
      __inkwave.menus.showResults(data); __inkwave.menus.show('results');
    });
    // (its timeline runs on the menus' clock, frozen here: end the podium intro and the count-ups as a tap would)
    await c.ev(() => { const r = document.querySelector('.iw-results'); if (r) { r.classList.remove('is-intro'); r.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); } });
    const rs = await c.measure('results', { back: '.iw-res__btns [data-id="leave"], .iw-res__btns [data-id="toroom"], .iw-res__btns [data-id="home"]', extra: await c.ev(() => ({ title: (document.querySelector('.iw-res__title') || {}).textContent, tags: [...document.querySelectorAll('.iw-res__tag')].map((e) => e.textContent), strip: (document.querySelector('.iw-res__learnhd') || {}).textContent })) });
    rs.backOk = null;
  },
  // a level on the phone (?learn=w1d1&kind=puzzle&short=1&from=app): the walk HUD — the clock and the next-gate bar must not
  // overlap (I §2) — the level's pause, then auto-walk to the first gate and its question
  async level(c) {
    const HUD = ['.iw-learn', '.iw-hud', '.iw-touch'];
    await c.waitFor(() => !!(__inkwave.match && __inkwave.match.learn), 90000, 'the level built');
    await c.ev(async () => { const ok = () => __inkwave.match && __inkwave.match.state === 'playing' && document.querySelector('.iw-learn.is-walk') && document.querySelector('.iw-learn__walk').getBoundingClientRect().width > 0;
      for (let i = 0; i < 60 && !ok(); i++) { __inkwave.debug.step(500); await new Promise((r) => setTimeout(r, 0)); } });
    const box = () => c.ev(() => { const b = (s) => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height), r: Math.round(r.right), b: Math.round(r.bottom) }; };
      const T = b('.iw-hud .iw-timer'), W = b('.iw-learn__walk'), hit = T && W && !(T.r <= W.x || W.r <= T.x || T.b <= W.y || W.b <= T.y);
      return { timer: T, walk: W, overlap: !!hit, clock: (document.querySelector('.iw-timer__txt') || {}).textContent }; });
    const walk = await c.measure('level-walk', { scopes: HUD, extra: await box() });
    walk.backOk = null;
    await c.ev(() => __inkwave.pause());
    await c.waitFor(() => __inkwave.menus.current === 'pause', 5000, 'pause');
    const pz = await c.measure('level-pause', { back: '.iw-pause__menu [data-id="resume"]' });
    // 离开这一关 → its confirm (the modal), then 接着答
    await c.tap('.iw-pause__menu [data-id="quit"]', 'leave level');
    const mq = await c.waitFor(() => !!document.querySelector('.iw-modal'), 5000, 'leave modal');
    const md = await c.measure('level-pause-leave', { reached: mq });
    await c.tap('.iw-modal .iw-btn--modal', 'keep going');
    md.backOk = await c.waitFor(() => !__inkwave.menus._modal, 5000, 'modal closed');
    await c.tap('.iw-pause__menu [data-id="resume"]', 'resume');
    pz.backOk = await c.waitFor(() => __inkwave.menus.current === null, 5000, 'resumed');
    await c.ev(async () => { const L = __inkwave.match.learn; L.autoWalk(true); for (let i = 0; i < 60 && !(L.phase === 'ask' && __G.hud.learn._ask); i++) { __inkwave.debug.step(1000); await new Promise((r) => setTimeout(r, 0)); } });
    const q = await c.measure('level-question', { scopes: HUD, extra: await c.ev(() => ({ phase: __inkwave.match.learn.phase, type: __G.hud.learn._ask && __G.hud.learn._ask.p.type })) });
    q.backOk = null;
    // answer every question right (auto-walk between the gates) to the end card, then 回到菜单 → the main menu
    await c.ev(async () => {
      const L = __inkwave.match.learn, H = __G.hud.learn, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      for (let i = 0; i < 160 && !document.querySelector('.iw-learn.is-done'); i++) {
        const A = H._ask;
        if (A && !A.answered) {
          const p = A.p, want = p.type === 'flip' ? true : (L.asking && (p.type === 'choice' ? (p._perm ? p._perm.indexOf(L.asking.item.answer) : p._alt === 'choice-of-typed' ? p.options.findIndex((o) => o.text === ((L.asking.item.meta && L.asking.item.meta.ref) || L.asking.item.en)) : L.asking.item.answer) : ((L.asking.item.meta && L.asking.item.meta.ref) || L.asking.item.en)));
          if (p.type === 'choice' && H.choices) H.choices[Math.max(0, want)].click(); else if (H.input) { H.input.value = String(want); H._submit(H.input.value); }
          await sleep(30);
        } else if (A && A.answered) H._continue();
        else { if (!L.auto) L.autoWalk(true); }
        __inkwave.debug.step(1000); await sleep(0);
      }
    });
    const done = await c.ev(() => !!document.querySelector('.iw-learn.is-done'));
    const rc = await c.measure('level-results', { scopes: ['.iw-learn'], reached: done, back: '.iw-learn__results .iw-learn__big.is-dim', extra: await c.ev(() => ({ score: (document.querySelector('.iw-learn__rscore') || {}).textContent })) });
    if (done) { await c.tap('.iw-learn__results .iw-learn__big.is-dim', '回到菜单'); rc.backOk = await c.waitFor(() => __inkwave.menus.current === 'main', 20000, 'main menu after the level'); }
  },
  // a real 双人联机赛 on the phone: a room on this run's relay, 双人联机赛 short (2 questions) against the bots, started from
  // the session API (the room screen's own countdown runs on the menus' clock, frozen here); the match stepped at ≤ 2×
  // real time with the renderer skipped (the relay drops a socket that floods it) — then rendered for the measurements:
  // a question up, the room's pause (the real one: G.netm), and, if the budget allows, the results
  async versus2(c) {
    const HUD = ['.iw-learn', '.iw-hud', '.iw-lf', '.iw-touch'];
    await c.ev(async () => { await __G.net.create('Ann'); __G.net.setSettings({ mode: 'versus2', learn: { week: 1, day: 1, short: true }, bots: true }); });
    c.say('room', JSON.stringify(await c.ev(() => ({ code: __G.net.code, mode: __G.net.lobby.mode, learn: __G.net.lobby.learn, block: __G.net.startBlock() }))));
    await c.ev(() => __G.net.start());
    const built = await c.waitFor(() => !!(__G.net.state === 'match' && __inkwave.match && __inkwave.match.learn && __inkwave.match.learnKind === 'versus2'), 60000, 'the match built');
    if (!built) return;
    c.say('match built', JSON.stringify(await c.ev(() => ({ actors: __inkwave.match.actors.length, names: __inkwave.match.actors.map((a) => a.name), state: __inkwave.match.state }))));
    // step: 1/24 s frames, 4 a chunk, paced to ≤ 2× real time
    const stepUntil = async (pred, maxSec, what) => {
      const t0 = Date.now(); let sim = 0;
      while (sim < maxSec) {
        if (await c.ev(pred)) return true;
        await c.ev(() => { const I = __inkwave; I._skipRender = true; try { for (let j = 0; j < 4; j++) I._frame(1 / 24); } finally { I._skipRender = false; } });
        sim += 4 / 24;
        const ahead = (sim * 1000) / 2 - (Date.now() - t0); if (ahead > 0) await c.sleep(ahead);
      }
      c.say('step timeout:', what); return false;
    };
    const up = await stepUntil(() => !!(__G.hud.learn._ask && !__G.hud.learn._ask.answered), 40, 'a question');
    // (main.js _intro shows the HUD from a 3 s wall-clock timer if the intro is still running; stepped at 2× the intro is
    // over by then and the HUD would stay hidden — on a phone the intro runs in real time. Shown here as it would be.)
    await c.ev(() => __G.hud.setVisible(true));
    const t0 = Date.now(); await c.ev(() => __inkwave.debug.step(16.7)); c.say(`first render ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    const q = await c.measure('v2-question', { scopes: HUD, reached: up, extra: await c.ev(() => ({ kind: __inkwave.match.learnKind, mode: __inkwave.match.mode, state: __inkwave.match.state, hud: __G.hud.el.className, hold: !!__inkwave.match.learn.hold, touchLive: __G.touch && __G.touch.enabled, weaponKeys: [...document.querySelectorAll('.iw-touch__btn')].filter((b) => getComputedStyle(b).display !== 'none').length, prog: (document.querySelector('.iw-learn__prog') || {}).textContent })) });
    q.backOk = null;
    await c.ev(() => { const F = __inkwave.match.learn, a = F.rightAnswer ? F.rightAnswer() : null, H = __G.hud.learn; if (H.choices && typeof a === 'number') H.choices[a].click(); else if (H.input) { H.input.value = String(a); H._submit(H.input.value); } });
    await stepUntil(() => !__inkwave.match.learn.hold, 8, 'the card gone');
    const pl = await c.measure('v2-play', { scopes: HUD, extra: await c.ev(() => ({ touchLive: __G.touch && __G.touch.enabled, weaponKeys: [...document.querySelectorAll('.iw-touch.is-live .iw-touch__btn')].filter((b) => getComputedStyle(b).display !== 'none').length, timer: (document.querySelector('.iw-timer__txt') || {}).textContent })) });
    pl.backOk = null;
    // the room's pause (online: the match runs on underneath)
    await c.ev(() => __inkwave.pause());
    const pz = await c.measure('v2-pause', { back: '.iw-pause__menu [data-id="resume"]', extra: await c.ev(() => ({ screen: __inkwave.menus.current, live: (document.querySelector('.iw-pause__live') || {}).textContent, quit: (document.querySelector('.iw-pause__menu [data-id="quit"]') || {}).textContent })) });
    await c.tap('.iw-pause__menu [data-id="resume"]', 'back to the match');
    pz.backOk = await c.ev(() => __inkwave.menus.current === null);
    // on to the end: the second question (answered right), the host calls the match, INKWAVE's judge (its animation runs on
    // the HUD's own clock: sped up as F's script does), then the results — the real ones, with the questions strip
    const answerUp = () => c.ev(() => { const F = __inkwave.match.learn, A = __G.hud.learn._ask; if (!A || A.answered) return false; const a = F.rightAnswer ? F.rightAnswer() : null, H = __G.hud.learn; if (H.choices && typeof a === 'number') H.choices[a].click(); else if (H.input) { H.input.value = String(a); H._submit(H.input.value); } return true; });
    const t1 = Date.now();
    while (Date.now() - t1 < 45000) {
      await answerUp();
      if (await c.ev(() => { const m = __inkwave.match; if (m && (m.state === 'judge' || m.state === 'results') && __G.hud) __G.hud.timeScale = 25; return __inkwave.menus.current === 'results'; })) break;
      await stepUntil(() => __inkwave.menus.current === 'results' || !!(__G.hud.learn._ask && !__G.hud.learn._ask.answered), 3, 'next');
    }
    const inRes = await c.ev(() => __inkwave.menus.current === 'results');
    c.say('results?', inRes, JSON.stringify(await c.ev(() => ({ state: __inkwave.match && __inkwave.match.state, hud: __G.hud && __G.hud.el.className }))));
    if (!inRes) return;
    await c.ev(() => { const r = document.querySelector('.iw-results'); if (r) { r.classList.remove('is-intro'); r.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); } });
    const rs = await c.measure('v2-results', { back: '.iw-res__btns [data-id="toroom"], .iw-res__btns [data-id="leave"]', extra: await c.ev(() => ({ title: (document.querySelector('.iw-res__title') || {}).textContent, tags: [...document.querySelectorAll('.iw-res__tag')].map((e) => e.textContent.trim()), strip: (document.querySelector('.iw-res__learn') || {}).textContent, online: !!document.querySelector('.iw-res__lobby') })) });
    rs.backOk = null;
  },
  // the week's 周考 on the phone (?learn=w1&kind=boss&short=1&from=app): L and R answered right, then the W phase's two
  // sentences — the first a near miss claimed with 「我的写法也对」 (evidence S, a hit), the second a near miss she goes on from
  // (evidence W, a miss) — the card with the claim measured, and the two leaves read back from the store
  async boss(c) {
    await c.waitFor(() => !!(__inkwave.match && __inkwave.match.learn), 90000, 'the level built');
    await c.ev(() => { if (__inkwave.debug.freezeBots) __inkwave.debug.freezeBots(); });
    const out = await c.ev(async () => {
      const W = window, L = __inkwave.match.learn, H = __G.hud.learn, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const adv = async (ms) => { const I = __inkwave; I._skipRender = true; try { for (let i = 0; i < Math.round(ms / 16.7); i++) I._frame(1 / 60); } finally { I._skipRender = false; } await sleep(0); };
      const o = { steps: [] };
      for (let i = 0; i < 200; i++) {
        const A = H._ask;
        if (A && !A.answered && L.asking) {
          const p = A.p, it = L.asking.item;
          if (p.type === 'write') { o.write = { id: it.id, ref: (it.meta && it.meta.ref) || it.en, phase: L.asking.gate && L.asking.gate.phase }; break; }
          const want = L.rightAnswer();
          if (p.type === 'choice' && H.choices) H.choices[Math.max(0, want)].click(); else if (H.input) { H.input.value = String(want); H._submit(H.input.value); }
          o.steps.push(p.type);
          await adv(100); H._continue(); await adv(200);
        } else if (L.prep && L.prep()) { const go = document.querySelector('.iw-lf__go'); if (go) go.click(); await adv(800); }
        else await adv(800);
      }
      return o;
    });
    c.say('to the W phase', JSON.stringify(out));
    if (!out.write) return;
    // a near miss: the first variant of the reference (a word left out, or one swapped for another) that IELTS-Base's own
    // check() calls claimable — asked of the page's engine module (the same instance the level judges with)
    const nearOf = (id) => c.ev(async (id) => {
      const { judge } = await import('/src/learn/engine.js');
      const it = __inkwave.match.learn.asking.item, ref = (it.meta && it.meta.ref) || it.en, ws = ref.replace(/[.?!]$/, '').split(' ');
      const tries = [], end = /\?$/.test(ref) ? '?' : '.';
      const put = (arr) => tries.push(arr.filter((x) => x !== null).join(' ') + end);
      for (let i = 0; i < ws.length; i++) put(ws.map((w, k) => (k === i ? null : w)));                          // one word left out
      for (let i = 0; i < ws.length; i++) put(ws.map((w, k) => (k === i ? 'stuff' : w)));                       // one swapped
      for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) {
        put(ws.map((w, k) => (k === i || k === j ? null : w)));                                                  // two left out
        put(ws.map((w, k) => (k === i || k === j ? 'stuff' : w)));                                               // two swapped
        put(ws.map((w, k) => (k === i ? null : k === j ? 'stuff' : w)));                                         // one of each
      }
      for (const t of tries) { const r = judge(it, t); if (!r.ok && r.claimable) return t; }
      return null;
    }, id);
    const near1 = await nearOf(out.write.id);
    c.say('near miss', near1);
    await c.ev((a) => { const H = __G.hud.learn; H.input.value = a; H._submit(a); }, near1 || 'zzz');
    await c.step(2);
    const held = await c.ev(() => ({ claimShown: getComputedStyle(__G.hud.learn.claimEl).display !== 'none', held: !!__inkwave.match.learn._claimHeld, verdict: __G.hud.learn.vText.textContent, why: __G.hud.learn.vWhy.textContent }));
    const card = await c.measure('boss-claim', { scopes: ['.iw-learn'], reached: held.claimShown, extra: held });
    card.backOk = null;
    const before = await c.ev((id) => { const s = JSON.parse(localStorage.getItem('inkwave:learn:v1') || '{}'); return JSON.stringify(s.ev || {}).includes(id); }, out.write.id);
    await c.tap('.iw-learn__claim', '我的写法也对');
    const after = await c.ev(() => ({ verdict: __G.hud.learn.vText.textContent, note: __G.hud.learn.claimNote.textContent, ok: __G.hud.learn.verdictEl.classList.contains('is-ok') }));
    await c.ev(() => __G.hud.learn._continue());
    await c.step(3);
    // the second sentence: a near miss again, and 继续 without claiming
    const out2 = await c.ev(async () => {
      const L = __inkwave.match.learn, H = __G.hud.learn, sleep = (ms) => new Promise((r) => setTimeout(r, ms));
      const adv = async (ms) => { const I = __inkwave; I._skipRender = true; try { for (let i = 0; i < Math.round(ms / 16.7); i++) I._frame(1 / 60); } finally { I._skipRender = false; } await sleep(0); };
      for (let i = 0; i < 60 && !(H._ask && !H._ask.answered && H._ask.p.type === 'write'); i++) await adv(800);
      return H._ask && H._ask.p.type === 'write' ? { id: L.asking.item.id, ref: (L.asking.item.meta && L.asking.item.meta.ref) || L.asking.item.en } : null;
    });
    let leaves = null, second = null;
    if (out2) {
      const near2 = await nearOf(out2.id);
      c.say('near miss 2', near2);
      await c.ev((a) => { const H = __G.hud.learn; H.input.value = a; H._submit(a); }, near2 || 'zzz');
      await c.step(2);
      second = await c.ev(() => ({ claimShown: getComputedStyle(__G.hud.learn.claimEl).display !== 'none', verdict: __G.hud.learn.vText.textContent }));
      await c.tap('.iw-learn__next', '继续 (no claim)');
      await c.step(3);
    }
    leaves = await c.ev((ids) => { const s = JSON.parse(localStorage.getItem('inkwave:learn:v1') || '{}'), out = {}; for (const d of Object.values(s.ev || {})) for (const id of ids) if (d.it && d.it[id]) out[id] = d.it[id]; return out; }, [out.write.id, out2 && out2.id].filter(Boolean));
    const log = await c.ev(() => (__inkwave.match.learn.log || []).filter((e) => e.name === 'learn:answer').slice(-3));
    c.rows.push({ name: 'boss-claim → S / W', reached: true, backOk: null, extra: { first: out.write, heldBeforeClaim: !before, afterClaim: after, second: out2, secondCard: second, leaves, log } });
    c.say('claim', JSON.stringify({ heldBeforeClaim: !before, after, second, leaves }));
  },
};

// from main: 联机 → the hub → 开一个房间 (this run's relay) → the room; its row (back = 离开, checked by the caller)
async function openRoom(c) {
  if ((await c.cur()) !== 'online') {
    await c.tap('.iw-main__menu [data-id="online"]', 'online');
    await c.waitFor(() => __inkwave.menus.current === 'online', 8000, 'hub');
  }
  // (software GL: the hub's first frames build the lobby set — tens of seconds on this box; a room asked for meanwhile
  // times out its own connect. Let those frames finish first.)
  const t0 = Date.now(); await c.step(3); c.say(`hub frames ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  await c.ev(() => { const j = document.querySelector('.iw-hubcard--join'); if (j) j.classList.remove('is-err'); });
  await c.tap('.iw-hubcard--create', 'create');
  const ok = await c.waitFor(() => __inkwave.menus.current === 'lobby' && __G.net && __G.net.state === 'lobby', 30000, 'room');
  const row = await c.measure('lobby', { back: '.iw-lob__leave', reached: ok, extra: ok ? await c.ev(() => ({ mode: __G.net.lobby.mode, code: __G.net.code, learn: __G.net.lobby.learn })) : null });
  return ok ? row : null;
}
