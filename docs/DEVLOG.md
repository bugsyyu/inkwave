# 开发日志（INKWAVE · 关卡学习）

每一步做了什么、为什么这样做、怎么验证的。**最新的在最上面**，时间是 UTC（北京时间 +8 小时）。设计契约在 [LEARN.md](LEARN.md)。

---

## 2026-10-15

### 21:40 关卡学习 B：解密闯关竖切片——第 1 周第 1 天一关，Tidewater 上离线能走、手机能开（分支 `learn-b`；LEARN.md §9）

- **为什么**：LEARN.md §6 的第一步：A 做内容桥 + 题目引擎（纯模块），B 做模式脚手架 + 一关解谜，两边并行；B 这边先用一个接口一样的替身（`src/learn/engine-stub.js`），A 落地后改 `src/learn/api.js` 一个文件。
- **改了什么**：三个钩子——`match.js` 的 `mode: 'learn'`（单人无敌人无钟的 `solo`，`match.learn` 每帧先于 `paused` 早退跑）；`menus.js` 的「学习 · LEARN」屏（选周 / 选天 / 选形式，只有解密闯关能开）和 `?learn=w1d1&kind=puzzle`；`hud.js` 挂 `hud-learn.js` 答题层。关卡本体 `src/learn/flow.js`：门沿 `G.nav` 的 A* 路线（出生点 → 对面出口，不走攀墙边）按距离摆，走近 3 m 停住出题，答对门开、墨路铺到下一道门，答错上锁、换个问法排到队尾，最后一道门出结果卡；当天首答进 `store`。`config.js` 的 `LEARN`。自动走（`autoWalk`）给手机竖屏和脚本用。
- **三个钩子之外**：`src/core/touch.js` 三处（关卡 `paused` 时触屏键不活——拇指按在答题卡上不是摇杆；关卡允许竖屏）。工具：`tools/serve.py` 在没有 IPv6 的容器里退回 IPv4（原来 `AF_INET6` 直接 `EAFNOSUPPORT`）；`tools/chrome.mjs` root 下补 `--no-sandbox`（Chrome 拒绝以 root 起）；`tools/play.mjs` 加 `--touch`（触屏 + 粗指针 + 2x，并把 `touchControls` 钉成 `on`，因为 headless 的触屏模拟不改 `(pointer: coarse)`）。
- **验证**：`npm run check` 绿（184 个文件）；`node --test tests/learn/*.test.mjs` 5/5（替身的契约：每道题恰好落一道门、一道门一个步、判分不看大小写 / 英美拼写、首答只认一次）；`./tools/smoke.sh 8491` 绿（原来的模式没动）；`tools/learn/play-desktop.json` + `drive.js`（1280×720）：开关、自动走到第一道门、第一题故意答错（上锁）、第二题答对、第一题换成四选一再答对、门开、墨路铺到第二道门（`G.paint.coverage()[0] > 0`），总线上 `learn:question / learn:answer / learn:gate` 的顺序对，无控制台错误；手机 390×844 `--touch`（`tools/learn/play-phone.json`）：触屏模式起、竖屏不弹「转过来」、答题卡占下半屏、输入框 48 px / 字 18 px、按钮 ≥ 44 px，截图看过后删了。__RESULTS__
- **还缺**：A 的真内容 / 判分 / 记忆模型（替身只有 14 条样例）；题的时限；另三种形式；录音；门的样子（环 + 浮标 + 光柱）；真机 iPhone 上的键盘弹出和第一帧。
