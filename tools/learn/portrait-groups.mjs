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
  // (play-8: the zone / level / versus2 / boss walks that stood here measured the question card — gone with the cards.
  // A question on the phone is measured where it now is, on the stage: tools/learn/wire-audit.mjs (the puzzle),
  // arena-audit.mjs (the duel / quiz / boss), runner-audit.mjs (墨浪跑酷), net-duo-play.mjs (versus2 / coop2).)
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
