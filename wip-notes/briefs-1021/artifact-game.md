# 任务 E：wf-artifact-game —— 不走 CI 也能把游戏交到她手上：学习版里的游戏入口

> **先看这一条（主会话 10-21 21:00 加的）**：这块活已经交给**第二组 workflow** 做了。**如果派你的提示里没有「第二组」这三个字**，说明你是第一组排着的那一份：什么都不要动（不开工作树、不改文件、不推送），直接交回：summary 写 `duplicate: 第二组在做`，inkwave / ieltsbase 的 branch 和 head 都填 `-`，changes / criteria / tests / decisions / not_done / to_decide 都是空数组，merge_notes 写 `duplicate`。提示里有「第二组」的，照下面做。


分支：IELTS-Base `wf-artifact-game`（主要）；inkwave `wf-artifact-game`（只在游戏本身要为 artifact 改的时候开）。LEARN 节号：**§51**（游戏那边有改动才写；IELTS-Base 那边的写进 `tools/artifact/README.md` 新的一节「学习版里的游戏」）。

## 为什么
业主（10-21）：「github action ci暂时没钱 你想其他办法自动推进 不需要问我」，还有「原来的界面跟流程就蛮好的 现在的游戏很好，我觉得可以给游戏加一个单独入口，我们可以点进去之后选择游戏方式」。iOS 的包只能在 macOS 上编（GitHub Actions 的 macOS 机器，现在没钱），所以修好的游戏（讲解板卡死、性能、先选玩法）没法经 TestFlight 到她手上。**她每天也用学习版**（Claude 里的 artifact，iPhone 上的 Claude App 打开）：把游戏整套放进学习版当一个单独入口，就不用等 CI。

## 已知的
- 学习版 v38：<https://claude.ai/artifact/7uzJnbXcsfdfxawgweEjCs>（主会话 10-21 新建；你**不发布**，只做打包、检查和发布计划）。打包：`tools/artifact/build.sh <提交> <out>` → `tools/build.mjs`（单文件页面：去掉 `<meta name="ielts-game">`、不带 `life/world/`、同步客户端、iOS 桥、她的进度；`build.sh` 打完断言没有游戏标记；`tests/base/artifact-build.test.mjs` 从 HEAD 打一次）。声明 db、downloads、sample、user（运行时 0.2.88）。线上 84 个文件：页面 + `audio/` 49 个 + `audio/exam/` 34 个。限制：页面 ≤ 16 MB（我们自己的预算 4 MB，现在约 3.6 MB）、**一次发布 ≤ 255 个文件、≤ 64 MB；一个版本 ≤ 511 个文件、≤ 256 MB**；只认标准网页媒体类型；`files` 里的 HTML 是另一张页面（不包骨架，要自己的 doctype / charset / viewport）。
- 游戏打包（IELTS-Base `app/game/`，inkwave `python3 tools/build-dist.py` 的 `dist/`）：349 个文件、21 MB（272 js、34 webp、22 json、13 png、3 woff2、3 css、1 txt、1 html），**没有 wasm、没有 glb**。84 + 349 = 433 ≤ 511；游戏要分两次传（≤ 255 个 / 次）。
- 学习版是 **cloud 模式**：她的数据在 artifact 的数据库里（`claude.use('db')`，`data/users/<id>/…`），**不在 localStorage**。游戏读她的数据走 localStorage 的 `ielts-workbench:data:v1`（inkwave `src/learn/workbench.js` `readBlob`；写证据 `store.js pushToWorkbench` → `Model.mergeDoc`；打卡 / 小考 / 积累本照 §39 / §41 写回那一份）。所以在学习版里游戏原样跑起来时看不到她的进度、写的也落不进她的账号。
- 预检工具：`tools/artifact/check.mjs`（发布骨架、一个装着她进度快照的 `claude.use('db')` 桩、接近 artifact 查看器的 report-only CSP、SwiftShader；最后两行必须 `NO CONSOLE ERRORS`、`NO CSP REPORTS`；截图带她的进度——看完删）。新世界演示页的多文件打包和检查可以参考：`tools/artifact/build-world-demo.py`、`check-world-demo.mjs`（只按文件表提供文件、CSP、glb 转接）、`plan-world-demo.py --max-publish`（分批计划）。

## 要做的
1. **能不能跑**：在 `check.mjs` 那样的 artifact 模拟里（只提供文件表里的文件、相同的 CSP、页面在 iframe 里的话照 artifact 的 sandbox 属性），从学习版页面进 `game/index.html`，游戏能起来（标题 → 选玩法 / 主菜单 → 开一关 → 打完第一道门 → 回到学习版）。CSP / 媒体类型 / 模块加载 / worker / 字体 / 音频 / 全屏 / 横屏 / 存储哪里不行就修（游戏那边要改的在 inkwave 分支改，尽量小，普通 INKWAVE 和 App 里的行为不变）。iOS 的 Claude App 里 artifact 是 WKWebView 里的 iframe：没有 `webkit.messageHandlers.ielts`（原生桥），横屏锁不了，60 帧——游戏要能在这种环境里安静地退化（`from=` 换一个值，比如 `from=learn`，或者别的你定的办法区分「App」和「学习版」）。
2. **她的数据进出**（这是关键，照 §39 / §41 的规矩，宁可少做也不能写坏她的账号）：
   - 进游戏前，学习版页面（cloud 模式）把游戏需要的那份交给它：同源 storage 里放一份她的数据的**只读副本**（游戏要的：今天第几周第几天、她的课程包、证据历史 `base['ev-…']`、打卡 / 小考要读的那几处……你列清楚），游戏照读本地那一套读它。这份副本是缓存，不是存档：每次进游戏重写、回来清掉或标旧。
   - 游戏写的（证据 `ev-<周一>` 的叶子、打卡、小考、积累本……）回来时由**学习版页面**并回她的账号：用经典页自己的写法（`Model.mergeDoc` / 各自的 Save，照 §39 / §41：写前重读最新的、只改要改的、她没有数据不建、同样的存两次只写一次、按她的时区），走 cloud 的保存（`Save.doc` / `cloudBulk` 那一路），只推变了的那几篇。合并必须幂等（来回两次、同一份证据再并一次 = 一个字节都不变）。
   - 先只做你能证明对的那几样（证据一定要；打卡、小考如果能用同一条路就一起；积累本 / 学习日志可以先不做，写进「没做的」）。
   - **测试**：真的经典页 cloud 模式（`tests/base/load-host.cjs`、`tests/base/cloud-e2e.mjs` 的 db 桩）：进游戏前交出去的副本和她账号的一样；游戏写了一笔证据以后回来，她账号里多的就是那一笔、其余文档逐字节不变、同步推的只有变了的那几篇；再来一次什么都不写；她没有数据时什么都不建。用现编的学员，不用她的快照做写的测试。
3. **入口**：学习版里显示游戏入口（「有没有游戏」的判断从「有没有 `ielts-game` 标记」改成能认学习版带了游戏的那种构建——**入口长什么样、在哪由 `wf-classic` 定**（它在改 `app/index.html` 的入口按钮和「今天」页的卡片）；你只管「学习版这个构建有游戏 → 入口出现、地址对」，别改入口的样子那几行，免得冲突；需要的话加一个你自己的小标记 / 判断函数，写清楚合并时怎么接）。
4. **打包和发布计划**：`tools/artifact/build.sh` / `build.mjs` 加一个带游戏的学习版构建（游戏文件从 `app/game/` 来；页面预算照旧 ≤ 4 MB，游戏不进页面本身）；一个分批发布计划脚本（≤ 255 个文件、≤ 64 MB 一批，列出每批的 `files` 映射：发布路径 → 源文件，主会话直接拿去用）；`check.mjs`（或新的检查脚本）加一段：从学习版页面进游戏、开今天的关、答一题、回来、她的账号（桩）里多了那一笔证据。`tests/base/artifact-build.test.mjs` 照旧守着页面本身。
5. **不发布**：主会话先发到一个**测试链接**（不碰她的 v38 链接）看真的 artifact 里跑不跑得起来，再决定。把「主会话发布时怎么做」写清楚（几批、每批的 files、要不要传 `capabilities`、发完怎么核对）。

## 不要碰
入口按钮和「今天」页卡片的样子（`wf-classic`）；游戏的展板 / HUD（`wf-softlock`）；渲染 / 画质（`wf-perf`）。`app/index.html` 只加你自己的函数 / 小段，别动别人的段落；改了哪几行写进汇报。
