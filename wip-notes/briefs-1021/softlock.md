# 任务 A：wf-softlock —— 关卡里任何时候都有看得见的「往前走」，讲解板卡死修好

分支：inkwave `wf-softlock`（必须）；IELTS-Base `wf-softlock`（只在你要加 IELTS-Base 那边的 e2e 时开）。LEARN 节号：**§48**。

## 她碰到的（业主原话见 common.md 第 1 条）
截图：第 2 周第 3 天（`w2d3`，解密闯关，舞台 terraces，黄昏），她做完第 1 道门（`w2d3:a1` 开场抽查，听写），走向第 2 道门（`w2d3:a2` pron-quiz）路上的讲解板：标题「发音和听力：点餐时的弱读；can 还是 can't；日期」，第一段 + 表头「小词 单独念 在句子里」，底下一个「读全文」。HUD：顶上「第 2 周 · 第 3 天」的钟（被灵动岛盖住了一半——safe area 也要看）、⏸、「地图」（右上，橙色）、右下「潜墨」「跳」、左下一张带她的小人和橙色箭头的卡（她以为是地图）。**屏幕上没有「下一道门 · 自动走」那条。**她点「读全文」——没反应（她以为是要她自己读出来、会要麦克风权限）；点左下角和右上角的「地图」——都没反应；「进行不了下一步」。

## 主会话已经复现、查到的
- 探针（`/tmp/claude-0/-home-user-IELTS-Base/256af91b-3170-5ad5-bfb8-0fa22698f111/scratchpad/probe/board-stuck.mjs`，可以拿去改）：IELTS-Base 的 `app/` 起静态服务，`game/index.html?learn=w2d3&kind=puzzle&gate=2&from=app&quality=low&nofullscreen&noclips`，393 × 852、isMobile、hasTouch、DPR 1；开局时 `.iw-learn` 是 `is-walk`、「自动走」在 (161,67) 101 × 44；真点一下「自动走」→ 走到第一块讲解板被框住：`.iw-learn` 变 `is-play`、整条 walk bar `visibility: hidden; opacity: 0`（含「自动走」）、`F.auto` false、`W.questionUp` false。
- 原因：`src/learn/play/wire/boards.js` `_ensure()` 里 `W.on.framed = (i) => { …; this.flow.hud?.playMode?.(true); }`（注释：横屏时 walk bar 压住展板顶边，所以框住时收起来）。`flow.js _autoWalk` 走到展板的观看点就 `autoWalk(false)` 停下（「自动走」再按一下才走）。竖屏手机没有看得见的摇杆（`src/core/touch.js` 左边 44% 有个按下才出现的浮动摇杆，她不知道；i18n 的提示是「手机竖着拿也能玩：点「自动走」，它会带你走到下一道门。」）→ 框住讲解板时她**没有任何看得见的办法往前走**。同样的「框住就收起 walk bar」还在：`wire/exit.js`（出口的回声亭、告示牌）、`arena/host.js`、`duo/coop.js`、`forms/coop2.js`、`run.js`、`host.js`（问题站点时收起是对的——题条在；要查的是「没有题、只是框住了东西」的时候）。
- 所有审计工具都是用代码直接 `F.autoWalk(true)` / `F._open()` 往前走的，所以这类「界面上没有路」从来没被测出来。
- 「读全文」（`board/paint.js` 的 `more` 热点）：在 393 宽上投出来约 46 × 19 px；`board/hotspot.js pickHotspot` 把命中区放大到 44 + 10 slop；无头里点开了阅读条（`board/strip.js`，z 16，在 `#ui-root`）。**她手机上为什么没反应还没查清**：可能当时主线程正被长任务占着（她也说很卡：DPR 3、120 Hz 设备、展板的 2D 画布排字 + 贴图上传、着色器），也可能是 iOS 上触点 / 投影 / 层级的问题。
- 「地图」：触屏键 `map` → `input.touchMapToggle()`（探针里 `input.touch.map` 变 true），关卡里到底画不画东西、她看得到什么没查；左下角那张卡是什么、能不能点没查。

## 要做的
1. **不变式**：学习关卡（解密闯关的展板 / 站点 / 出口区、墨浪跑酷的展板、对抗赛的准备展板、双人的线索板、复习日、Boss、小考）里，竖屏 390 × 844、横屏 844 × 390（触屏）任何时刻，只要她不是正在答题（题条 / 站点自己在），屏幕上一定有一个**看得见、点得到（≥ 44 pt、在 safe area 里、没被盖住）的「往前走」**——「自动走」或者等价的「继续 ›」。框住展板时可以让它挪位置 / 变小 / 变成展板旁的一颗键（横屏不压展板），**不能没有**。展板读完（`BD.readS`）以后这颗键要醒目一点（轻轻跳一下，不是一直闪）。
2. **「读全文」改叫「看全文」**（「听全文」不变；`board/paint.js` 和用到它的地方、i18n、LEARN 里的说法）；查清它在手机上点不开的可能原因并修（命中区、层级、被别的层吃掉触点、主线程长任务）；必要时给阅读条一个 DOM 的入口（不只靠 3D 热点）。
3. **「地图」在关卡里**：要么点了有东西（关卡的地图：她在哪、路线、下一道门；照原版地图的画风），要么在学习关卡里不放这颗键（别放一个点了没反应的键）。你定，写理由。左下角那张卡：如果看着像能点但不能点，让它别像按钮，或者给它用处。
4. **顶上的钟被灵动岛盖住**：查 safe area（`env(safe-area-inset-top)` 在 App 的 WKWebView 里，`viewport-fit=cover`），HUD 顶排整体避开（无头里模拟不了 safe area：用 CSS 变量注入一个 59 px 的顶 inset 截图看）。
5. **只用屏幕上的按钮走完整关的审计**（新工具，`tools/learn/tap-walk.mjs` 或类似）：真触屏点（`page.touchscreen.tap` 点元素中心 / 展板热点的投影），**不许**调 `autoWalk` / `_open` / `debug.step` 这类捷径；答题用各玩法真的输入（参考 `wire-audit.mjs` 的 `answerM1` / `answerType` / `answerBeat` / `answerFlip`，它们是点屏幕的）；每秒采样一次不变式（第 1 条），没有看得见的路超过 3 秒、又不在答题 → FAIL，附截图和状态。至少跑：`w2d3` 解密闯关竖屏 + 横屏（从开局走过第 1、2 道门和中间的讲解板）、一个墨浪跑酷的天、一个对抗赛的天、复习日（`w2d7`）的一段、整关的出口区（`?gate=` 跳到最后一道门）。跑出来的新卡点一并修。
6. **讲解板那一下的主线程**：CPU 降速 4× / 6×（CDP）、DPR 3，量框住展板前后的长任务（画展板、贴图上传、阅读条）；有 > 200 ms 的就拆（空闲时提前画、分帧上传）。
7. 测试：`tests/learn/` 加单元（HUD 状态机：框住展板时「往前走」可见；`more` → 「看全文」；地图键的去留）；审计工具的结果写进 LEARN §48；`npm run test:learn`、`npm run check`、证据快照不变；IELTS-Base 的八个游戏 e2e 用 `--game <你的 dist>` 跑一遍（菜单顺序断言要是变了照实改断言，不放宽）。

## 不要碰
`src/ui/menus.js` 的主菜单 / 选关（另一个 agent `wf-classic` 在改「进游戏先选玩法」）；渲染管线、画质调度（`wf-perf` 在改）——主线程那条要是落在渲染上，写进汇报，别自己大改。

> **复查的 agent 注意（主会话 10-21 22:00 加）**：复查这一条分支时，另外完整读 `/tmp/claude-0/-home-user-IELTS-Base/256af91b-3170-5ad5-bfb8-0fa22698f111/scratchpad/wf/softlock-extra.md`，照它把里面确认的问题在同一个分支上修掉。实现的 agent 不用管这一段。
