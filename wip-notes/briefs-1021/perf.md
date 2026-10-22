# 任务 P：wf-perf —— 手机上很卡：体系化的性能优化

分支：inkwave `wf-perf`（主要）；IELTS-Base `wf-perf`（只在要动 `ios/` 或 IELTS-Base 的测试时开）。LEARN 节号：**§50**。

## 业主原话（10-21）
「还有个问题，很卡，手机上真的很卡，你需要深入做体系化优化」。她的手机：带灵动岛的 iPhone（14 Pro 或更新，ProMotion 120 Hz），装的是 TestFlight build 1151（10-20 上午；还没有毛玻璃界面）。下一个包会带上毛玻璃（`backdrop-filter`，LEARN §47）——**它在关卡里不许再加 GPU 负担**。

## 已知的（先读，别从头猜）
- 画质调度：`src/core/device.js`（机型档 top / high / base）、`src/core/render-gov.js`（台阶 0–4、整局帧时间升降档、120 帧稳不住稳 60、发热降档、「显示帧率」读出「帧 · 密度 · 档」）、`src/config.js` 的 `RENDER_STEPS` / `RENDER_START = { top: 0, high: 2, base: 3 }` / `renderDensity` / `densityFloor` / `QUALITY` / `TOUCH`、`src/core/renderer.js`、`src/core/shader-warm.js`；LEARN §31（hd-render：iPhone 3D 2 倍密度 + 辉光）、§33（render-gov）、§40 / §42（着色器预热、加载）。
- **top 档从台阶 0 起**：阴影 2048 + AO + 辉光 + 密度 2.5、像素预算 3.2 M；393 × 852、DPR 3 的手机上 = 2.5 倍密度 ≈ 982 × 2130 ≈ 2.09 M 像素，主通道 + AO + 辉光链，还想跑 120 帧。这很可能就是「很卡」的头号嫌疑（要量、要证明，别只凭这一条）。
- 工具：`tools/learn/perf-forms.mjs`（跑酷 / 对抗赛 / Boss 每帧代价，按「答题 / 走路」分桶）、`wire-audit.mjs --perf`（解密闯关）、`hitch-probe.mjs --native iphone16`（每阶段的着色器程序数和长任务）、`parity-shots.mjs --native iphone16|iphone15|iphone12 --dpr 3`（原版 vs 学习关的画面对照）、`main.js` 的 `debug.frameTimes`、`?quality=` / `?lazycompile`。

## 要做的
1. **先量，建基线**（同一台机器、同一次运行里前后对比；SwiftShader 只能横向比，所以要用和 GPU 无关也能比的量）：每种玩法（解密闯关 `w2d3` terraces 黄昏——她卡住的那一关；墨浪跑酷；对抗赛；复习日；主菜单；加载）在 393 × 852、DPR 3（`--native` 那套）、CDP CPU 降速 4× 下：
   - 每帧 JS（sim + 提交绘制）p50 / p95 / max、长任务（PerformanceObserver ≥ 50 ms）、GC（堆增长 / 秒、每秒分配）；
   - `renderer.info`：每帧绘制次数、三角形、程序数、纹理数 / 估算显存；
   - **每帧要着色的像素**（GPU 代理）：每个渲染目标的宽 × 高 × 用到的通道数（主通道、深度预通道、AO、阴影图、辉光的每一级、后期、墨的绘制贴图更新）加起来——按每个台阶 × 她的屏幕算一张表；
   - DOM：关卡里每秒的样式重算 / 布局次数（CDP `Performance.getMetrics` 的 RecalcStyleCount / LayoutCount）、合成层数、正在跑的 CSS 动画数、有 `backdrop-filter` 的元素数。
2. **体系化地改**（每一条都要量出前后、写进 LEARN §50 的表）：
   - **起点和调度**：手机上起点要保守（稳 60 帧为先），有余量持续 N 秒才往上一档；掉帧时下得快（几百毫秒内），上得慢；120 帧只在持续有余量时开（ProMotion 上 120 帧跑不满时节奏会抖——宁可稳 60）；像素预算按整屏算，不按 DPR 写死；发热 / 低电量照旧降。让「显示帧率」的读数能告诉我们真机上发生了什么（台阶、密度、像素、帧时间分位）。
   - **GPU 的浪费**：辉光（半分辨率、级数）、AO（手机上值不值）、阴影（尺寸、只在需要时重画：静的东西不每帧重画）、后期链、透明叠层（展板、粒子、墨）、过高的密度；墨的绘制贴图（更新多大一块、多频繁）。
   - **CPU / JS 的浪费**：每帧分配（临时 Vector3 / 数组 / 闭包）、每帧的 DOM 写读（HUD 只在值变了才写，绝不在帧里读布局）、O(n²) 的查找、不可见的东西还在更新、音频解码在主线程、展板画布排字（分帧 / 空闲时画）。
   - **加载 / 卡顿**：开局、过门、框住展板、出口区这些一下子的长任务（着色器、贴图上传、几何生成）挪进加载画面或分帧（§40 / §42 的做法）。
   - **毛玻璃**：关卡进行中 `backdrop-filter` 元素数 = 0（关卡里的 HUD / 题条 / 阅读条用实玻璃 `iw-glass-solid` 那一路，不模糊），菜单上 ≤ 4 层不变；写进测试。
3. **画面**：不许为了快把画面弄丑：最高的台阶在快的机器上和现在一样好；默认起点降下来以后，用 `parity-shots --dpr 3` 拍前后，看过（不提交），写清楚哪一档看得出差别。
4. **把判据写进测试**（`tests/learn/` 单元：调度的状态机——起点、降档要多快、升档要多慢、120 帧的条件、像素预算的表；关卡里 `backdrop-filter` 0 个；能在 Node 里算的「每帧像素」表的上限）；审计工具的数字写进 LEARN §50（前 / 后、每种玩法）。`npm run test:learn`、`npm run check`、证据快照逐字节不变；IELTS-Base 八个游戏 e2e 用 `--game <你的 dist>` 过一遍。
5. **真机**：我们没有真机。把「真机上要看什么、怎么看」（开「显示帧率」看哪几个数、哪种读数说明还卡在哪）写进 LEARN §50 和汇报，主会话转给业主。

## 不要碰
`src/ui/menus.js` 的主菜单 / 选关（`wf-classic`）；`src/learn/play/`、`src/ui/hud-learn.js`、`styles/hud.css`、`src/core/touch.js` 的「往前走」/ 展板交互（`wf-softlock`）——你要改它们里面的性能问题（比如 HUD 每帧写 DOM、展板画布排字）可以，但只改性能、改动小、在汇报里写清楚哪几行（合并时会和它冲突）。

> **复查的 agent 注意（主会话 10-21 22:00 加）**：复查这一条分支时，另外完整读 `/tmp/claude-0/-home-user-IELTS-Base/256af91b-3170-5ad5-bfb8-0fa22698f111/scratchpad/wf/perf-extra.md`，照它把里面确认的问题在同一个分支上修掉。实现的 agent 不用管这一段。
