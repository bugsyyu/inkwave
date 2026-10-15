# 开发日志（INKWAVE · 关卡学习）

每一步做了什么、为什么这样做、怎么验证的。**最新的在最上面**，时间是 UTC（北京时间 +8 小时）。设计契约在 [LEARN.md](LEARN.md)。

---

## 2026-10-15

### 23:23 关卡学习 B：解密闯关竖切片——第 1 周第 1 天一关，Tidewater 上离线能走、手机能开（分支 `learn-b`；LEARN.md §9）

- **为什么**：LEARN.md §6 的第一步：A 做内容桥 + 题目引擎（纯模块），B 做模式脚手架 + 一关解谜，两边并行；B 这边先用一个接口一样的替身（`src/learn/engine-stub.js`），A 落地后改 `src/learn/api.js` 一个文件。
- **改了什么**：三个钩子——`match.js` 的 `mode: 'learn'`（单人无敌人无钟的 `solo`，`match.learn` 每帧先于 `paused` 早退跑）；`menus.js` 的「学习 · LEARN」屏（选周 / 选天 / 选形式，只有解密闯关能开）和 `?learn=w1d1&kind=puzzle`；`hud.js` 挂 `hud-learn.js` 答题层。关卡本体 `src/learn/flow.js`：门沿 `G.nav` 的 A* 路线（出生点 → 对面出口，不走攀墙边）按距离摆，走近 3 m 停住出题，答对门开、墨路铺到下一道门，答错上锁、换个问法排到队尾，最后一道门出结果卡；当天首答进 `store`。`config.js` 的 `LEARN`。自动走（`autoWalk`）给手机竖屏和脚本用。
- **三个钩子之外**：`src/core/touch.js` 三处（关卡 `paused` 时触屏键不活——拇指按在答题卡上不是摇杆；关卡允许竖屏）。工具：`tools/serve.py` 在没有 IPv6 的容器里退回 IPv4（原来 `AF_INET6` 直接 `EAFNOSUPPORT`）；`tools/chrome.mjs` root 下补 `--no-sandbox`（Chrome 拒绝以 root 起）；`tools/play.mjs` 加 `--touch`（触屏 + 粗指针 + 2x，并把 `touchControls` 钉成 `on`，因为 headless 的触屏模拟不改 `(pointer: coarse)`）。
- **这台机器**：容器里没有 GPU、以 root 跑，headless Chrome 原来建不出 WebGL 上下文（`BindToCurrentSequence failed`），改走 ANGLE + SwiftShader 后能跑，但原档画质一帧 1.5 s（smoke 的 `perf.render` 1551 ms，180 s 内走不出 intro）；所以审计都用 `?quality=low` + `--settings {"shadows":false,"bloom":false}` + 小窗口，走路和铺墨用 `__inkwave.debug.freeze / step` 走模拟时钟。每次浏览器都在 `flock -w 9000 /tmp/ielts-browser.lock nice -n 10` 里，排在 IELTS-Base 的整套测试和另一条工作流后面（一次等了 30 多分钟）。
- **验证**：`npm run check` 绿（184 个文件）；`node --test tests/learn/*.test.mjs` 5/5（替身的契约：每道题恰好落一道门、一道门一个步、判分不看大小写 / 英美拼写、首答只认一次）。桌面 960×540（`tools/learn/play-desktop.json` + `drive.js`，`?learn=w1d1&kind=puzzle`）：开进关卡（mode learn、1 个角色、7 道门、HUD 的钟读「第 1 周 · 第 1 天」）；门沿 78 个节点的路线从 z −34.5 到 +34.5 每 ≈ 11 m 一道（听写 3 道、选择 2、听力 1、重音 1，每道 2 题）；自动走 2 s 模拟时间到第一道门（走了 6 m），到门即 `paused`；第一题 Wednesday 故意答 zzz → 「不对，门上多了一道锁。待会儿换个问法再来 · 为什么：正确写法：Wednesday（星期三），你写的是「zzz」」；第二题 February 答对；第一题换成四选一回来、选 Wednesday 答对 → 门开（锁 1）、墨路铺到第二道门（`G.paint.coverage()[0]` 0.006）、自动走接着把她带到第二道门出题；总线 `learn:gate(opened:false) → learn:question → learn:answer{ok:false,first:true} → … → learn:answer{ok:true,first:false}（重问不算首答）→ learn:gate(opened:true, locks 1)`；`localStorage['inkwave:learn:v1']` 里两条首答、两条证据；无控制台错误（只有 KHR_parallel_shader_compile 的 warn）。手机 390×844 `--touch --dpr 1`（`tools/learn/play-phone.json`）：触屏模式起（`touchMode` true）、竖屏不弹「转过来」（`.iw-touch-rotate` 没 `is-armed`）、自动走 2 s 模拟时间到第一道门、到门 `paused`、触屏键不活（`touch.enabled` false）；答题卡占下半屏（390×422）、题干「听写：听一遍，把这个词打出来」+「星期三」、▶ 听 84×44、输入框 250×48 字 18 px、提交 100×48；截图看过（卡在下半屏、中文在前、门的光柱在后面、没有英文提示）后按路径删了。`./tools/smoke.sh 8491`（原来的模式）：原档画质下游戏起来了但一帧 1.55 s，180 s 的等待里还在 intro；`SMOKE_URL_EXTRA='&quality=low' SMOKE_ARGS='--w 960 --h 540 --settings {…}'` 那一次：开机 51.6 s、一帧 0.40 s，到 `eval` 时 `state: playing`、8 个角色、机器人已经开始涂（turf [1,0,…]）、没有 `[error]` / pageerror——游戏是好的，但 play.mjs 固定 180 s 的 `until` 先到期，smoke.sh 把「until timeout」判成 FAIL。于是 `play.mjs` 加了 `--until <秒>`（smoke.sh 的注释里给了 `--until 420` 的写法）；按主会话的要求没有再跑一次（锁一次排 10–30 分钟）。**这台机器上 smoke 还没有一次「SMOKE OK」**：有 GPU 的机器照常 `npm run smoke`，这台机器用上面的环境变量再跑一次就行。
- **还缺**：A 的真内容 / 判分 / 记忆模型（替身只有 14 条样例）；题的时限；另三种形式；录音；门的样子（环 + 浮标 + 光柱）；真机 iPhone 上的键盘弹出和第一帧。
