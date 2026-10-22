# 任务 D：wf-classic —— App 打开是原来的工作台；游戏是一个单独入口，进去先选游戏方式

> **先看这一条（主会话 10-21 21:00 加的）**：这块活已经交给**第二组 workflow** 做了。**如果派你的提示里没有「第二组」这三个字**，说明你是第一组排着的那一份：什么都不要动（不开工作树、不改文件、不推送），直接交回：summary 写 `duplicate: 第二组在做`，inkwave / ieltsbase 的 branch 和 head 都填 `-`，changes / criteria / tests / decisions / not_done / to_decide 都是空数组，merge_notes 写 `duplicate`。提示里有「第二组」的，照下面做。


分支：IELTS-Base `wf-classic`、inkwave `wf-classic`。LEARN 节号：**§49**。

## 业主原话（10-21）
「原来的界面跟流程就蛮好的 现在的游戏很好，我觉得可以给游戏加一个单独入口，我们可以点进去之后选择游戏方式」
—— 这推翻了 10-17 的「游戏为主体」（`docs/GAME-FIRST.md`：「以后直接游戏模式取代原有的雅思整个app的原有设计，游戏不再是子版块，而是主体」）。现在：**经典工作台（今天 / 复盘 / 考试 / 路线 / 更多，加天光）是 App 的主界面和流程；游戏是一个单独入口；进了游戏先选游戏方式。**

## 现在是什么样（要改的）
- IELTS-Base `app/index.html` 第 15 行起的 `<head>` 脚本：带游戏的构建（`<meta name="ielts-game">`）、没 `?classic`、没 `#页面`、这次会话没选过课本、不是自动化浏览器（自动化要 `?gamefirst`）→ `<html class="gf-boot">`（盖一层底色、天光不起）；`boot()` 末尾 `gameFirst()`（约第 5441–5480 行）等 `WB.native.settle()` 后 `location.replace(gameFirstUrl())` 跳进 `game/index.html?from=app&today=wXdY`。经典页底栏 / 目录里有「关卡 Levels」（`data-view="game"`，`openGame()` 第 5095 行：`game/index.html?learn=wNdM&from=app`——直接开今天那一关、不经过菜单）。手机的底栏只露 5 个（今天、复盘、考试、路线、更多），「关卡」在「更多」里，不好找。
- inkwave（`from=app`）：标题画面（点一下）→ 主菜单 `_scr_main`（`src/ui/menus.js`）：「开始今天的关 · 第 N 周 · 第 M 天 · 形式 · 要复习 K 个」、课程地图、今天的打卡、今日小考（当天该考时）、选关（`_scr_learn`：选周 / 天 / 形式）、课本（`_scr_book`）、回课本（`../index.html?classic=1`）……「开始今天的关」按 `design.js planFor(w, d)` 的形式自动开（解密闯关 / 墨浪跑酷 / 对抗赛；复习日墨浪跑酷 + review）。看门狗起不来就回经典页（`?classic=1&why=…`）。

## 要做的
1. **App 打开是工作台**：去掉 `gf-boot` 的自动跳（保留代码，用一个清楚的开关关掉，默认关；以后业主要改回来改一处就行；`?gamefirst` 这类测试参数照你判断留或删）。启动画面、天光、`native.js` 的启动服务（找回、镜像、提醒）照经典页原来的样子。`gameFirstUrl()` 还要给游戏入口算「她的今天」。
2. **工作台里的游戏入口（单独、好找）**：
   - 底栏 / 目录：「关卡」改成「游戏」（英文 Game），手机底栏上要一眼看得到（你定：放进 5 个里、或者替换一个、或者在「今天」页的显眼处；截图比较后定，写理由）。
   - 「今天」页：在今天的课旁边一张卡（「用游戏学今天的内容 · 选一种玩法 ›」这一类的话，你定措辞），一下进游戏。
   - 入口去游戏的地址：`game/index.html?from=app&today=wXdY`（不再直接开某一关）→ 游戏里先选玩法。
   - 学习版（Claude 里的链接，`tools/build.mjs` 去掉了 `ielts-game` 标记、不带游戏）的样子不变：没有游戏时入口不出现（现在 v36 起就是这样藏的，照它）。另一个 agent（`wf-artifact-game`）在研究把游戏放进学习版，它会动 `tools/build.mjs` / `tools/artifact/` 和学习版里入口的「有没有游戏」判断——你别改那几处，入口的样子和地址照「有游戏就出现」写，它接得上。
3. **游戏里先选游戏方式**（inkwave `from=app`）：标题画面之后的第一屏就是「选游戏方式」：今天的内容（第 N 周第 M 天，标题）用哪种玩：
   - 解密闯关、墨浪跑酷、对抗赛（每种一张卡：一句话说是什么样的玩法、大概几分钟；今天计划的那种标「今天推荐」）；复习日照它的规矩（复习关 / 墨浪跑酷 review）。
   - 复习关（有到期的词时，「要复习 K 个」）、今日小考（经典页今天也出小考时，照 §41）、双人（联机能用时；不能用就不放）。
   - 次要的一排：选别的一天（选关）、课程地图、「回到工作台」（`../index.html?classic=1`，这次会话记住）。
   - **去掉**主菜单上的「课本」和「今天的打卡」（经典页的流程里本来就有；代码留着、入口关掉）；关卡结束的结果卡：「再来一关」「换一种玩法」（回到选玩法）「回到工作台」。
   - 开局：`startLearn({ week, day, kind })`（`kind` 就是她选的形式；三种形式对每一天都能开——`design.js` 的 `alt`），证据、打卡垫、小考写她账号的规矩全不变（LEARN §39 / §41）。
   - 画风照 §47 的玻璃规矩（一样东西一种材质、中文不描边、字不出框、对比度、≥ 44 pt、横竖屏、白天 / 黄昏、减少动态效果只淡入），用 IELTS-Base 的 `node tools/game/ui-glass-shots.mjs --game <dist> --out <草稿目录>/wf-classic --tag after`（锁里；字出框或对比度 < 4.5 : 1 时退出码 1）量；手柄 / 键盘的焦点顺序接好（`_bind` / `_nav`）。
4. **测试**：IELTS-Base `tests/game-first-e2e.mjs` 照新流程改（App 打开留在工作台；「游戏」入口 → 游戏 → 选玩法这一屏 → 选一种 → 开的是今天那一天那种形式；「回到工作台」回来、这次会话不再自动去游戏；构建里没游戏时没有入口；游戏起不来自己回工作台）——改的是断言要测的东西，不是放宽；其余七个游戏 e2e（book、checkin、exams、notes、weeks、guides、teacher）原来是从 `index.html` 一路跳进游戏的：改成从入口进或直接开 `game/index.html?from=app&today=…`，课本 / 打卡这些只是从主菜单拿掉了入口，功能本身的测试照旧（必要时直接调到那一屏）；单元（`tests/base/game-first*.test.mjs`、`embed`、`native-shim` 这些涉及启动决定的）照新的决定改；inkwave `tests/learn/` 里菜单顺序 / 首屏的测试照新菜单改；八个游戏 e2e + 经典页 8 个浏览器测试 + 单元 + test:learn 全过。
5. **文档**：inkwave LEARN §49；IELTS-Base `docs/GAME-FIRST.md` 开头加一段「10-21 业主改回来了」（原话、现在的样子、第三期 / 第四期的计划先停），后面的历史照留。`app/native.js` 的启动服务没变就不用改。

## 不要碰
展板 / HUD / 触屏层（`wf-softlock` 在改 `src/learn/play/`、`src/ui/hud-learn.js`、`styles/hud.css`、`src/core/touch.js`）；渲染 / 画质（`wf-perf`）；`tools/build.mjs`、`tools/artifact/`（`wf-artifact-game`）。`styles/ui.css` 只加你自己的一节（末尾），玻璃的旋钮不动。
