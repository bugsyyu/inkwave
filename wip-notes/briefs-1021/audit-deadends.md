# 排查 X1：学习关卡里「没路走 / 点了没反应」的地方（只读，不改代码）

你只读、不改：不开工作树、不提交、不推送；临时文件放草稿目录的 `audit-deadends/` 子目录。先读 `common.md`（同目录）。

## 背景
她（业主原话见 common.md 第 1 条）在第 2 周第 3 天的讲解板前卡死：镜头框住展板时 HUD 把「下一道门 · 自动走」整条收起来（`src/learn/play/wire/boards.js` 的 `W.on.framed → hud.playMode(true)`），竖屏没有看得见的摇杆，于是没有任何看得见的路；「读全文」点了没反应、两个「地图」点了没反应。子 agent `wf-softlock` 正在修这一处并做「只点屏幕上按钮走完整关」的审计（它的分支 `wf-softlock`，两个仓库；你可以 `git -C /home/user/inkwave diff io/hopeful-turing-fnxytg...origin/wf-softlock` 只读地看它改到哪了，别重复报它已经修的）。

## 要做的
在 inkwave（`/home/user/inkwave`，开发分支）里**读代码**，把所有可能让她「没有看得见的路往前走」或「点了没反应」的状态找出来，每条要有代码证据（文件:行、触发的条件、她在屏幕上看到什么），按严重程度排：
1. **每种玩法 × 每个阶段 × 横竖屏**：解密闯关（展板、站点 m1 / type / beat / flip、出口区的回声亭 / 告示牌 / 打卡垫、复习日）、墨浪跑酷（行、滑行段、展板、终点）、对抗赛（准备展板、每一轮、Boss）、双人（versus2 / coop2、线索板、等对方）、今日小考、复习关、结果卡。每个阶段：她靠什么往前（按钮 / 自动 / 计时），这个东西什么时候会被藏起来、被盖住、被禁掉，什么条件下永远等不到（`flow.js` 的 phase、`hud-learn.js` 的 is-walk / is-play / is-done、`play/host.js` 的 kind、站点的 still / hold、计时器、`match.paused`、`menus.current`）。
2. **点了被吃掉**：`src/core/touch.js` 的路由（`_btnAt`、`G.playTap`、跑酷的 swipe 钩子、左边 44% 的浮动摇杆、topGuard、portrait gate）、层级（`#ui-root` 里各层的 z-index 和 `pointer-events`：`.iw-learn` z 18、阅读条 z 16、题条、游戏键盘、暂停菜单），看起来能点但不能点的东西（左下角那张带小人和箭头的卡是什么？），关卡里的「地图」键到底画不画东西。
3. **iOS 上特有的等不到**：`speechSynthesis` 的 `onend` 不来（WKWebView 里常见）、音频解锁、`visualViewport`、safe area（顶上的钟被灵动岛盖住）、横竖屏切换、App 切后台回来（`visibilitychange`、`pause` 菜单）、`requestAnimationFrame` 停了的时候计时器还在不在走。
4. 每条：严重程度（卡死 / 要摸索才能走 / 难看）、证据、她看到什么、建议怎么修（一两句）、`wf-softlock` 是不是已经修了。

## 交回
结构化的清单（按严重程度排）；另外把完整的报告写成 `audit-deadends/report.md`（路径写在汇报里）。
