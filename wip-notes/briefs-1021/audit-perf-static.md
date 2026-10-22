# 排查 X2：游戏每帧代码里的浪费（只读，不改代码）

你只读、不改：不开工作树、不提交、不推送；临时文件放草稿目录的 `audit-perf-static/` 子目录。先读 `common.md`（同目录）。可以在 Node 里跑不开浏览器的小测（比如单独量一个纯函数），**不要跑浏览器**（浏览器锁留给正在改代码的 agent）。

## 背景
业主：「还有个问题，很卡，手机上真的很卡，你需要深入做体系化优化」。子 agent `wf-perf` 正在改（分支 `wf-perf`；只读地看 `git -C /home/user/inkwave diff io/hopeful-turing-fnxytg...origin/wf-perf` 它改到哪了，别重复报它已经改的）——它从量出发，主攻画质调度、像素量、辉光 / AO / 阴影、墨的贴图。你从**读代码**出发，找它的量不容易照到的浪费，给下一轮的修补备好清单。

## 要做的
在 inkwave（`/home/user/inkwave`，开发分支）里，从 `src/main.js` 的主循环（`_loop` / `_frame` / `_updateHud`）往下，把**每帧都会走到**的代码全读一遍（模拟、物理、导航、机器人、墨的绘制、粒子、相机、学习关的 flow / play 站点 / 展板 / 题条、HUD、触屏、音频），找：
1. **每帧分配**：`new THREE.Vector3/Matrix4/Color/…`、数组 / 对象字面量、闭包、`map/filter/forEach` 生成的临时数组、字符串拼接（尤其在 HUD 里）——标出每帧大概分配多少（几个对象 / 帧 × 有几个实体）。
2. **每帧的 DOM**：写样式 / 文本（值没变也写的）、读布局（`getBoundingClientRect`、`offsetWidth`、`getComputedStyle`——读写交错会强制同步布局）、`classList.toggle` 每帧、CSS 变量每帧改、`innerHTML`。
3. **算法**：每帧 O(n²) 的查找、对所有实体的遍历里再遍历、每帧排序、射线 / 碰撞在不可见或很远的东西上也算、每帧重建的几何 / 包围盒。
4. **GPU 提交的浪费**（代码层面）：每帧 `needsUpdate = true`（材质 / 纹理 / 几何属性）、每帧新建材质或改 defines（会重编着色器）、`texSubImage2D` 上传整张贴图、看不见的物体没有剔除、透明物体的排序、`renderer.render` 被调多次（多个场景 / 相机 / 渲染目标）。
5. **事件里的大块同步活**：过门、开局、框住展板、出口区、结果卡这些时刻一下子做的事（几何生成、画布排字、贴图上传、JSON 解析、存储读写——`localStorage` 的读写在 iOS 上很慢，尤其每帧读 `ielts-workbench:data:v1` 那种大的）。
6. 每条：文件:行、每帧 / 每次多少代价（能估就估：对象数、DOM 写的次数、复杂度、贴图的字节）、在哪种玩法 / 哪个阶段、`wf-perf` 有没有在改、建议的修法（具体到怎么改）。按「预计收益 / 改动大小」排。

## 交回
结构化的清单（按收益排）；完整报告写成 `audit-perf-static/report.md`（路径写在汇报里）。
