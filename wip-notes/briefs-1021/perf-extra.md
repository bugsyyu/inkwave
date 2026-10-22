# wf-perf 复查要一并看的（主会话 10-21 22:00 加；只给 wf-perf 的复查 agent）

只读排查 X2（每帧代码的浪费）的完整报告在 `/tmp/claude-0/-home-user-IELTS-Base/256af91b-3170-5ad5-bfb8-0fa22698f111/scratchpad/audit-perf-static/report.md`（`findings.json` 同目录）。CPU 那一大半交给了另一个新分支 `wf-perf-cpu`（打字机位搜索、小地图每帧、慢帧子步、存储写、屏幕外角色、弹丸 / 特效缓冲……），**你别做那些**。属于渲染这一边、要你在 `wf-perf` 上核对并修掉的两条：
1. **学习站点的着色器预热编错了目标**：`targets.js:207`、`board/set.js:150`、`beat/` 的预热没设渲染目标，编出来是画布那一版程序（sRGB 输出、色调映射），比赛画进的是合成器的 HDR 目标（线性、NoToneMapping）——第一次真画时又编一遍（卡一下）。用 `?probe` / `hitch-probe.mjs` 证实，修成和真画同一个目标、同一套程序（`board/set.js` 那几行 `wf-softlock` 也动过，改小、写进汇报）。
2. **每一趟场景渲染（主通道、GTAO 法线、港口反射）都重新遍历整棵场景树的 `updateMatrixWorld`**，反射每帧还新建 hide / vis 数组——一帧只更新一次矩阵（`matrixWorldAutoUpdate` 之类），反射不再每帧分配。
