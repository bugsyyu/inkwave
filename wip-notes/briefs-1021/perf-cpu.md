# 任务 P2：wf-perf-cpu —— 每帧和「一下子」的 CPU 浪费（和 wf-perf 并行）

分支：inkwave `wf-perf-cpu`（从 `io/hopeful-turing-fnxytg` 开）。LEARN 节号：**§52**。

## 为什么
业主：「还有个问题，很卡，手机上真的很卡，你需要深入做体系化优化」。`wf-perf` 在改渲染那一边（画质调度、像素量、辉光 / AO / 阴影、墨的贴图、`renderer.js`、`render-gov.js`、`config.js`、`main.js` 的调度那几处）。只读排查 X2 从代码里找到一批 **CPU / 主线程**的浪费，报告：`/tmp/claude-0/-home-user-IELTS-Base/256af91b-3170-5ad5-bfb8-0fa22698f111/scratchpad/audit-perf-static/report.md`（`findings.json` 同目录；行号指 `088c6dd`，先核对）。你做这一半。

## 要做的（按收益排；每条量前后，数字进 LEARN §52 和测试）
1. **慢帧时模拟跑两遍**（`main.js:1452-1453`、`match.js:211-270`）：`dt > 1/45 s` 时整套 `m.update`（学习关 flow 和站点、相机、机器人的脑子、每个角色的姿势 / IK / 头发、boss、O(n²) 推挤）跑两遍——慢的那一帧更慢，越卡越卡。改成不会自己把自己拖垮：子步只给真正要稳定步长的那部分（物理 / 碰撞），其余每帧一次；或者子步有上限、超了就丢时间（游戏时钟慢一点也比卡死好）。量：CPU 降速 6× 下连续几秒的帧时间分布前后。
2. **小地图每帧都在更新**（`main.js:1684, 1785`、`game/minimap.js`）：藏起来、设置关掉也照样——墨一变每 0.15 s 分 3 带逐像素重画墨层、两次 `putImageData`、约 20 Hz 合成整张画布 2–3 次再加 DOM。看不见就不画（`wf-softlock` 在学习关里把小地图藏了——`is-nomap`——藏的时候一点都不算）；看得见时只在墨真的变了才重画。
3. **打字题的机位暴力搜索**（`learn/play/type/frame.js:27-67`）：约 1 万个机位、每个新建 50–70 个临时数组 / 对象，出题、按「射」、点提示、转屏时同步卡住主线程。改成分层 / 早停的搜索、复用临时对象、把每帧的结果缓存到转屏为止；量前后的那一下多少毫秒（CPU 降速 4× / 6×）。
4. **首答的存储写**（`learn/store.js:119-120, 197-221`、`learn/workbench.js`）：每次首答同步 `save()` 一次；0.8 s 后 `pushToWorkbench` 把整个 `ielts-workbench:data:v1` `getItem` 出来、逐字比较、整份 `JSON.stringify`、整份 `setItem`——她的数据很大，iOS 上很慢。合并写（几次首答一起、空闲时）、只序列化变了的那一篇（`Model.mergeDoc` 的结果和 `ev-<周一>`）……**她账号的写法一个字节都不许变**（LEARN §16 / §39 / §41：写出来的整段文本要和现在逐字节相同；IELTS-Base 的 `tests/base/game-*.test.mjs` 是对照测试，必须照过），证据快照 sha256 不变。
5. **屏幕外的角色每帧照样摆全套姿势、IK、头发**（`game/actor.js:1015`、`game/character.js:1318-13xx`；`_camHook` 记了画到它的帧号却没用来跳过）——屏幕外的降频或跳过（回到屏幕上那一帧补上，不能看得出跳）。
6. **弹丸的实例缓冲每帧整块上传**（`game/weapons.js:631, 1940-1943`，MAX_BLOBS 700，没有 `updateRanges`，空的也传、也提交一次空绘制）；**7 个特效实例池**（`fx/fx.js` 645-655 等）`frustumCulled = false`、空着也 visible、`markUpdated` 用 `max(1, n)`——只传用到的那段，空的不画。
7. **跑酷每答对一题的 `_floodRow`**（`learn/play/runner/runner.js:628-655`）：每格一次带数组解构的 `inPoly`、每次新建 region 和一份 flood 几何一直留到关卡结束——复用、限量。
8. 其余低的（`forms/ui.js:109` 排名表每 0.5 s `innerHTML` 重建；`audio/audio.js` 听者 9 个 AudioParam 每帧 `setTargetAtTime`、音量没变也重设；零星的每帧分配；开机就预载联机大厅 2048² 的贴花图集）：能小改就改。
9. **不做的**（别人的地盘）：`main.js` 的画质调度 / 密度 / 后期、`renderer.js`、`render-gov.js`、`config.js` 的 RENDER_*、`world/paint.js`（`wf-perf`）；展板 / 触屏 / HUD 的「往前走」、`board/set.js`、`play-keys.js`、`learn/play/host.js`、`wire/*`（`wf-softlock`）；`ui/menus.js`（`wf-classic`）；`ui/hud.js`（`wf-perf` 动过 6 行，你要改它的墨罐读布局、`_restart` 的 `offsetWidth` 也可以，改小、写进汇报）。`main.js` 你只动子步和小地图那几行（会和 `wf-perf` 冲突，合并时主会话接，写清楚是哪几行）。
10. 测试：`tests/learn/` 加单元（子步的规矩、小地图看不见不画、打字机位搜索的结果和旧的一样（同样的输入选同一个机位或同样好的）且分配有上限、存储写的整段文本逐字节不变）；`npm run test:learn`、`npm run check`、证据快照不变；量具可以用 `wf-perf` 分支上的 `tools/learn/perf-probe.mjs`（`git show origin/wf-perf:tools/learn/perf-probe.mjs > <草稿>/…`），或者你自己的。IELTS-Base 的 `tests/base/game-*.test.mjs`、八个游戏 e2e 用 `--game <你的 dist>` 过一遍。
