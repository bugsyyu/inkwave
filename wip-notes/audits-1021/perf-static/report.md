# 排查 X2：游戏每帧代码里的浪费（只读）

（任务书要求把报告写进 `/tmp/claude-0/-home-user-IELTS-Base/256af91b-3170-5ad5-bfb8-0fa22698f111/scratchpad/audit-perf-static/report.md`，但工具拒绝子 agent 写报告文件，回的是「Subagents should return findings as text, not write report files」。所以报告全文就放在这个字段里，那个路径下没有文件。）

业主：「还有个问题，很卡，手机上真的很卡，你需要深入做体系化优化」。这一份从读代码出发，找 `wf-perf` 的量具照不到的浪费，给下一轮的修补备好清单。两个仓库都没改；没跑浏览器（任务书不让）；只在 Node 里量了几个纯函数（数字只能横向比）。

## 结论（先说）

`wf-perf` 管的是 GPU 那一半（画质阶梯、像素、辉光 / AO / 阴影、后期通道合并、墨图集晾干）。主线程这一半还有三块大的，它的量具看不到：量具把时钟冻住、每帧走 1/60 s，只量 16 帧，也不带账号。

1. **打字题的机位搜索把主线程卡住 35–315 ms**（V8，这台机器）。出题、按「射」、点提示、转屏的时候都会搜。`type/frame.js` 的 `search()` 是暴力网格，大约 1 万个机位，每个机位要新建 50–70 个临时数组 / 对象。我用标量重写了一版（同一个网格、同样的浮点运算顺序）：7 个情形的结果 7/7 逐字节相同，**快 4.5–5.7 倍**。只改一个纯函数，测试现成。
2. **小地图每帧都更新，所有玩法都是**：它被隐藏、设置里关掉、或是在学习关里，照样更新。墨一变，它就分 3 带、每 0.15 s 重画一次墨层：每 9 帧里有 3 帧，每帧多出 2.8–8.3 ms。不管墨变没变，它还以 20 Hz 合成整张画布 2–3 次，再加上 DOM 画布的上传。`minimap.js` 自己的注释写着它是「手机上最大的一项每帧开销」。光这一项就能让 LiveGov 拿不到 120 Hz：它的门槛是每帧 JS 的 p90 ≤ 5 ms，而带墨层的帧占了三分之一。
3. **慢帧会把整份模拟跑两遍**（`main.js:1452`）：dt > 22 ms 时 `m.update` 跑两次。两次里包括学习关的 flow 和所有站点、站点相机、机器人的脑子、boss，还有每个角色的整套姿势 / IK / 头发。越卡越要多算一倍，是正反馈。量具的时钟每帧 1/60，永远看不到。

接下来是事件里一下子做的大块活：
- 学习站点的着色器预热按错了渲染目标，而且时机晚于开场预热，第一次用到的东西会在关中途编译（要先用 `?proglog` 确认）；
- 过门那一帧同步准备后面两道门（标签图集、最多 6 张 1024 px 的展板画布）；
- 展板贴图第一次画的时候才上传；
- 每次首答 0.8 s 后，把她整个工作台数据 `JSON.stringify` 再 `setItem`；5 s 后 `mirrorSend` 又 `getItem` + `JSON.parse` 一遍，再 `postMessage` 给 App。

再往下是一串中小的：HUD 墨罐每帧读 `clientWidth`，强制布局；HUD 每帧几十个临时对象；屏幕外的小孩也照样摆全套姿势；弹丸实例缓冲每帧整块上传 64 KB；7 个特效池空着也提交；按键和 HUD 弹动用 `void el.offsetWidth` 强制重排；等等。

`wf-perf` 正在改的都没重复报（见「已经在改的」一节）。主线程省下来的时间会直接变成 LiveGov 往上走（更高的档、120 Hz）的余量。

## 分支和提交（只看，没改）

- inkwave 开发分支 `io/hopeful-turing-fnxytg` = `088c6dd339ec54047ef09133c384703e725ef493`（本报告的行号都按它）。
- inkwave `wf-perf` = `589dde0f1afbba324732323eac21999801ef85c1`，工作树里还有没提交的 8 个文件：`src/config.js`、`src/core/render-gov.js`、`src/core/renderer.js`、`src/fx/screenfx.js`、`src/main.js`、`styles/touch.css`、`tests/learn/render-gov.test.mjs`、`tools/learn/perf-probe.mjs`。
- IELTS-Base `io/hopeful-turing-fnxytg` = `fd996edd21a87938cf8a0a185f8a46cf23931c8c`（没碰）。
- 我的探针都在 `/tmp/claude-0/-home-user-IELTS-Base/256af91b-3170-5ad5-bfb8-0fa22698f111/scratchpad/audit-perf-static/probe/`：
  - `frame-search.mjs`、`frame-search-noalloc.mjs`、`split-search.mjs`、`minimap-ink.mjs`、`bounds.mjs`、`blob-json.mjs`；
  - 上一级目录里另有一张读过的文件清单 `files.txt`；
  - 数据全是现编的，没读她的任何数据。

## 方法

- 读：从 `src/main.js` 的 `_loop` → `_frame` → `_updateHud` 往下，读完每帧都会走到的代码：
  - 模拟、物理、导航、机器人；
  - 墨、特效、弹丸、相机；
  - 学习关的 flow、`play/host.js` 和各站点、`arena/`、`runner/`、展板、题条、游戏键盘；
  - HUD、触屏、音频、菜单。
  - 也读了事件里的大块活：开局、过门、出题、射、结果、存储。
- 量：只在 Node 22.22 里量纯函数。机器是 Intel Xeon 2.1 GHz、4 核，V8。数字只能横向比，她手机（JSC）上的绝对值不知道。`wf-perf` 的量具用 CDP 降速 4× 当手机；A15 / A16 的单核未必比这台慢那么多，所以真机大概是这些数的 1–4 倍。没有真机数据，我没换算。
- 没跑浏览器、没截图、没跑仓库里的测试，因为两个仓库都没改。

## 清单（按「预计收益 / 改动大小」排；行号按 088c6dd）

### 1.【高】打字题的机位搜索：出题 / 射 / 提示 / 转屏时主线程卡 35–315 ms

**位置**
- `src/learn/play/type/frame.js:27-67`：`project()` 和 `search()`。
- 调用的地方：
  - `wire/type.js:194` / `:204` / `:228` / `:297`；
  - `wire/type.js:162-163` / `:301`（这里的结果按带缓存）；
  - `arena/type.js:115` / `:160` / `:169` / `:257`；
  - `runner/glide.js:273` / `:294`；
  - `arena/m1.js:167`。

**代价**
- 网格：B 从 1.2 到 14、H 从 1.8（word 阶段 2.8）到 10，步长都是 0.1，约 9.4k–10.7k 个机位。
- 每次 `project()` 新建 5 个数组，还要重算相机基底和 `tan`。每个机位另外新建 `cam`、`look`、闭包 `P`、`cand`、`ndc`，还有字面量数组。
- 合计一次搜索 50–75 万个短命对象。`frameFor('type')` 搜 2 次；`frameFor('word')` 最多搜 8 次。

**量过的（V8，每次的平均）**

| 情形 | 现在 | 标量版 | 倍数 |
|---|---|---|---|
| type 竖屏 | 34.1 ms | 7.6 ms | ×4.5 |
| type 竖屏 + headMargin | 35.6 ms | 6.2 ms | ×5.7 |
| type 横屏 | 35.8 ms | 7.0 ms | ×5.1 |
| word 竖屏 | 51.7 ms | 10.8 ms | ×4.8 |
| word 横屏 | 104.7 ms | 18.3 ms | ×5.7 |
| word 竖屏、没有题条 | 52.9 ms | 10.4 ms | ×5.1 |
| word 长词 | 12.5 ms | 2.3 ms | ×5.5 |

- 7 个情形的输出 7/7 逐字节相同（JSON 相等）。
- `splitFrame` 不命中缓存时 17–23 ms。
- 解密闯关的「射」最多试 3 次 `frameFor('word')`：竖屏约 155 ms，横屏约 315 ms。

**wf-perf**：没改。它的量具步进 16 帧，碰不上这个时刻。

**修法**
1. `search()` 改成标量：每个机位只算一次基底，点直接投影，不新建数组；规则拿到的 `P` 每次搜索只建一个闭包；`cand` 只在它赢了的时候才建。`probe/frame-search-noalloc.mjs` 的 `searchFast` 可以直接搬过去，结果逐字节相同。
2. `frameFor('word')` 按取整以后的参数缓存。
3. 打字的时候就按正确答案的词框，在空闲帧把 word 机位算好；网格可以按 B 分列，分摊到几帧里。
4. 可选：粗网格搜完再细搜。这会改变结果，要拿审计网格和暴力搜索逐个对。

**她会看到**：按「射」或出打字题时，画面停 0.05–0.3 s。

### 2.【高】小地图：每帧都更新，所有玩法都是，被隐藏或设置关掉也一样

**位置**
- `src/main.js:1684`：`this.minimap.update(dt)` 没有任何条件；`:1785` 那一行只决定要不要把画布交给 HUD。
- `src/game/minimap.js:344-375`：墨变了就每 0.15 s 分 3 带重画墨层；不管墨变没变都约 20 Hz 合成一次（`:14` `MAP_COMPOSE_EVERY = 3`）。
- `:293-341`：`_drawInk` 逐像素算两遍，然后两次 `putImageData`（`:338-339`）。
- `:377-492`：`_compose`，每次 2–3 次整张 `drawImage`。

**代价**
- 画布（7 px/m）216k–561k px，RGBA 0.83–2.14 MB。
- 墨层一带 2.8 / 3.8 / 8.3 ms，整张 8.7 / 10.5 / 24.0 ms（halyard / tidewater / kelpline；合成数据、边缘很多的上限，V8，不含 `putImageData`）。墨一直在变的时候，每 9 帧里有 3 帧要画一带。
- 合成 20 Hz，再加 DOM 画布的上传。
- 注释里量过：Adreno 730 上平均每帧 8.8 ms、峰值 189 ms，那是改成 20 Hz 之前的数。
- 角上的小地图其实很小：竖屏长边约 57 CSS px，在 3× 屏上约 170 物理像素；画布却有 644–770 px，竖屏多算约 4 倍，横屏约 2–2.5 倍。

**玩法**：所有比赛态。学习关里也显示着：没有 `is-learn` 的 CSS 藏它，`config.js:870` 默认 `minimap: true`。

**wf-perf**：没改。

**修法**
1. 设置关了、又没在瞄超级跳 / 打击的时候跳过 `update`，只记下 `paint.version`；再显示的时候强制画一次整张。
2. 合成加脏标记：墨层版本没变、闪光层 ≥ 0.45 s、没有特效 / 云 / 炸弹 / 副武器 / 特殊武器 / 超级跳线 / 区域，就不合成。
3. 墨层每帧给一个像素预算（≤ 40k px），不再固定分 3 带。
4. 学习关用 3.5 px/m 建（`main.js:431`）：角上仍然 ≥ 1:1，墨层、合成、上传都变成四分之一。

**她会看到**：跑酷、对抗赛里每秒好几次的小顿挫；120 Hz 的手机一直被压在 60。

### 3.【高】慢帧会把整份模拟跑两遍（子步）

**位置**
- `src/main.js:1452-1453`。
- `src/game/match.js:211-270`：学习关、机器人的脑子、每个角色的 `update`（`actor.js:1015` 的 `ch.update`，整套姿势 / IK / 头发，`character.js:1318-1366`）、boss、O(n²) 推挤。
- 跑酷的包装 `runner.js:156-166` 每个子步都跑一次 `_after`（`:470-514`），里面的 `RunnerCam` 每次都新建数组。
- 头发自己已经分了子步（`character.js:3838`）。

**代价**：帧长 > 22.2 ms 时全部乘 2，而且是正反馈。

**wf-perf**：没改。量具每帧走 1/60，`sub` 永远是 1。

**修法**
- 只给物理分子步：`Match.update` 拆成 `step(dt)`（移动、碰撞、发射计时、推挤，按子步跑）和 `tick(dt)`（学习关、脑子、boss、`_finishFrame`，每帧一次）。
- 最小的改法：传 `{ last, frameDt }`，`learn.update` 只在第一个子步跑，`_finishFrame` 和跑酷的 `_after` 只在最后一个子步跑。
- 审计和测试的时钟是冻住的 1/60，结果完全不变。

**她会看到**：卡起来之后很难恢复。

### 4.【中高，先确认】学习站点的预热按错了渲染目标，而且时机晚于开场预热

**位置**
- 站点的 `warm()` 都没有设渲染目标：`targets.js:207`、`board/set.js:150`、`beat/stage.js:416`、`beat/padset.js:56`、`flip/deck.js:264`、`flip/targets.js:139`、`type/rig.js:483`、`type/inkword.js:455`、`runner/runner.js:939`。第三个参数 `G.scene` 是 three 的 `targetScene`，不是渲染目标；`src/learn` 里没有一处 `setRenderTarget`。
- 对比 `character.js:1078-1081` 的注释「programs are keyed by the render target … compile against one of those」。
- 时机：
  - `play/host.js:64` 的 `_warmT = 0.05`，到 `:104` 才跑，晚于 `main.js:951` 的 `_warmStage`；
  - `arena/host.js:84/165`、`duo/coop.js:183` 也一样；
  - 打字机要到 `mount()`（`type/rig.js:193-194`）才进场景；
  - 跑酷 `_warm` 编完马上把那一行拿掉。

**代价**：预热编的是画布那一版程序，比赛画进合成器的 HDR 目标要的是另一版。所以第一次真正画到它的那一帧，才在 WebKit 上同步编译，一个变体几十到几百 ms。

**怎么确认**：用 `?proglog`（`main.js:181-188`，`__progKeys`）加 `day-run.mjs`，或者 `hitch-probe.mjs --level 120`，看淡入以后还有没有新建的程序。

**wf-perf**：没改。它的 `warmPasses` 只管后期通道。

**修法**
1. 站点的编译都包上 `setRenderTarget(G.post?.composer?.readBuffer || warmTarget())`，可以抽一个 `compileForMatch` 放进 `core/shader-warm.js`。
2. `_warmStage` 之前同步跑宿主的 `_warmAll`。
3. 打字机在场景里留一个隐藏的实例。

**她会看到**：第一道打字题、第一块展板、第一个节拍台出来的时候画面冻一下。

### 5.【中高】过门那一帧：同步准备后面两道门

**位置**：`play/host.js:153-161` 的 `gateOpened` → `_prep`（`:133-142`）+ `_placeBoards`。对每一道新的门：
- `beat.prepare`：标签图集；
- `boards.prepare`（`wire/boards.js:72-79`）：最多 6 张展板（`:20`），每张一张 1024 × ≤930 的画布，`drawBoard`（`board/paint.js:255-301`：渐变、裁剪、大号的中英文字）。

开场的 `_warmAll`（`:127-132`）一次准备 3 道门。

**代价**：估计开门那一帧有 30–100 ms，正好叠在开门的动画和特效上。

**wf-perf**：没改。

**修法**：放进准备队列，每帧做一件，或者每帧给 4 ms 的预算。开场的也走这个队列，在淡入完成之前做完。

### 6.【中】展板贴图第一次画到才上传；Titan One 到了还要再传一遍

**位置**
- `board/set.js:56-57`：`CanvasTexture`，`anisotropy = 8`，生成 mipmap，没有 `initTexture`。
- `:62-67`：字体到了就整张重画。

**代价**：一张约 3.8 MB，加上 mipmap 约 5 MB，同一段路上的几张会在同一帧一起上传。内存上，最多 3 道门的展板同时活着，每张还留着一张画布。

**修法**
- 队列里每帧 `renderer.initTexture` 一张。
- 字体在加载画面就加载好。
- 上传完、字体也到了以后释放画布。

### 7.【中】首答以后推到她账号：整个工作台数据序列化、写入，5 s 后再读一遍、解析一遍

**位置**
- `store.js:119-120`：每次首答都 `save()`，再 `soon()`。
- 0.8 s 后 `pushToWorkbench`（`:197-210`）→ `workbench.js:143-157` 的 `pushEvidence`：
  - `readBlob(fresh)`：`getItem` 整份，再和缓存逐字比较；
  - 整份 `JSON.stringify`；
  - 整份 `setItem`。
- 5 s 后 `mirrorSend`（`:318-330`）：`getItem` 整份 → `JSON.parse` 整份（只为了确认有 profile）→ `postMessage` 整份。

**代价**
- 她的数据多大我不知道（没读）。合成数据，V8：1 MB 8.9 / 7.5 ms，2 MB 9.5 / 14.6 ms，4 MB 27.1 / 40.5 ms（stringify / parse）。
- 再加上 WebKit 存储的拷贝和持久化，估计 0.8 s 处停 20–80 ms，5 s 处停 10–50 ms。
- 量具不带账号，看不到。

**wf-perf**：没改。

**修法**
1. 刚写进去的 `cache.raw` 还有效（没有人调过 `invalidate()`）的时候，`mirrorSend` 直接发它。
2. 序列化改成增量的：顶层字段的 JSON 文本缓存起来，`base` 里只重新序列化变了的那几份 `ev-<周一>`，要和原来逐字节相同。
3. 推的时机挪到安静的时候。这一条要定。

**她会看到**：每答对一题，过一会儿顿一下，几秒以后再顿一下。

### 8.【中】HUD 墨罐：每帧强制同步布局，每次画都新建渐变

**位置**
- `hud.js:1521`：`clientWidth` / `clientHeight`，前面同一帧里已经写过样式。
- `:1559-1560`：`createLinearGradient`，加上 `cDeep + '66'` 字符串。
- `_updTank`（`:1479-1516`）：只有满、闲着、晃动也停了才不画，转相机就会带动晃动。

**wf-perf**：量具能看到布局次数，但没改。

**修法**：尺寸在 resize 时缓存；渐变按液面高度缓存；晃动时限 30 Hz 重画。

### 9.【中】HUD 每帧的临时对象

**位置**
- `main.js:1772`：`teamSummary()`（`match.js:300-307`）。
- `:1774-1796`：每帧新建 `frame` 和它的子对象。
- `:1795`：`zones.state()`（`zones.js:416-424`）再展开一次。
- `:1768`：一个闭包。
- `hud.js:1734-1735`：`fit` 闭包和解构出来的数组；`:1749-1752`：每个点拼一个 key 字符串。
- `hud.js:979`：`zkey`。

**代价**：估计解密闯关每帧 15–25 个，对抗赛每帧 50–60 个。

**wf-perf**：量具的 `gc` 能看到，但没改。

**修法**：常驻的 `frame`，原地填；`state(out)`；用数值比较代替字符串 key。

### 10.【中】屏幕外的小孩照样摆全套姿势

**位置**：`actor.js:1015`、`character.js:1318-1366`、`character.js:561-567` 的 `_camHook`。

**修法**
- 用游戏自己的帧号（`main.js` 的 `_frameN`）记「上一帧画到没有」。不能用 `info.render.frame`：它每一趟 `render` 都加一。
- 没画到、又不是她本人的角色：只更新根节点，dt 累加，每 4 帧摆一次完整的姿势，头发暂停。

**玩法**：对抗赛、测验、赛跑、跑酷。

### 11.【中低，改动极小】弹丸实例缓冲：每帧整块上传 64 KB

**位置**：`weapons.js:631` 的 `MAX_BLOBS = 700`；`:1940-1943` 每帧整块 `needsUpdate`，没有设范围，空着也传。

**修法**：照 `fx.js:645-655` 的 `markUpdated` 设 `updateRanges`；`n` 和上一帧都是 0 就不传；`visible = n > 0`。

### 12.【中低，改动极小】7 个特效池空着也提交

**位置**：`fx.js:740/872/944/1027/1084/1157`，都是 `frustumCulled = false`，一直 `visible`。`markUpdated` 用 `max(1, n)`。

**代价**：three r186 对 `primcount = 0` 也照样走 `setProgram`、VAO 和状态设置（`three.module.js:2295/4341` 才返回）。

**修法**：`visible = n > 0`。

### 13.【中低】跑酷 `_floodRow` 扫整个面的每一格

**位置**：`runner.js:628-655`。对比 `run.js:502-522` 的 `floodRegion`，那边先限定了范围。每次还新建一个 region，`paint.js:734-786` 就跟着新建一份几何，一直留到 `clear()`（`:925-926`）。

**代价**：估计每答对一题 1–10 ms。

**修法**：照 `floodRegion` 限定 i/j 的范围；每一行生成的时候就把 region 算好，答对时直接用。

### 14.【中低】游戏键盘：每按一个键强制重排；`safeInsets` 强制样式计算

**位置**：`play-keys.js:215-220` 的 `_flash`（`void el.offsetWidth`）；`:95-102` 的 `safeInsets`，`layout()`（`:175-194`）每次都调。

**修法**：弹动改用 `el.animate()`，或者在两个类之间轮换；`safeInsets` 缓存，只在 resize / 转屏时重新量。

### 15.【中低】HUD `_restart` 在事件里强制重排

**位置**：`hud.js:1984-1988`。调它的地方有命中、击倒、涂地数字（`_turfPop` `:1676-1684`，涂墨的时候每秒约 2.5 次）、区域受罚 / 夺取、特殊武器就绪、死亡标记。

**修法**：和第 14 条一样。

### 16.【中低】节拍台选位置：出题那一下做几千次射线检测

**位置**：`play/host.js:203-298` 的 `stageSpot`，`wire/beat.js:66` 在每道门的第一道节拍题时调。

**代价**：估计 10–50 ms。

**修法**：在准备队列里预先算好，出题时只检查她当前位置的视线。

### 17.【低】M1 墨靶的 `_frame` / `_place`

**位置**：`run.js:176-213` / `:248-316`，约 800 次射线检测；`:131-146` 读布局。

**修法**：预先算的部分放进队列；题条的矩形每题只读一次。

### 18.【低】`FormsUi.setRank` 每 0.5 s 整个重建排名表

**位置**：`forms/ui.js:109`；`runner.js:242` 调。

**修法**：行元素留着，只改变了的文字和顺序。

### 19.【低】音频每帧 9 次 `setTargetAtTime`

**位置**：`audio.js:174-190`；`:333-339`；`main.js:1605-1657`。

**修法**：做脏检查，位置、方向、音量没怎么变就不排。

### 20.【低】菜单 `_updateCursor` 每帧读布局

**位置**：`menus.js:786-810`，只在有焦点的界面开着时。

**修法**：只在焦点换了、resize 时重新量。

### 21.【低（帧）/ 内存，要定】联机大厅开机就预载，之后一直挂着

**位置**：`main.js:495`；`showcase.js:1581` 和 `:2105-2118`；`lobbySet-tex.js:60` 的 `DA = 2048`。

**代价**：估计显存 16–21 MB。

**修法**：`from=app` 的时候不预载，第一次打开联机再建。

### 22.【低】解密闯关的门没有合并成实例

每道门约 3 次透明绘制。

### 23.【低】零星的每帧分配

- `actor.js:370` 的 `winp`；
- `race.js` `_bot` 的 `still` 闭包；
- `runner/cam.js` 的 `slice` / `map`；
- `play/cam.js:75`；
- `flow.js:247` / `:306`；
- `runner.js:239` 的时钟字符串；
- `ghostMute`；
- `main.js:283`；
- `paint.js` 的 `splat`（`:466-544`）和 `coverage()`（`:887-889`，`main.js:865` 每帧调）；
- `weapon:impact` 的 `clone`；
- `teamKey`；
- `screenfx` 的 `_decayAll`；
- `getGamepads`；
- `bots.js:1785`，和约 `:570` 每帧的 `regionStats`。

### 24.【低-中，等 wf-perf 合了再改】每一趟场景渲染都遍历一次 `updateMatrixWorld`

**位置**：主通道、GTAO 法线、港口反射（`environment.js:1813-1889`，它每帧还新建数组）。

**修法**：`scene.matrixWorldAutoUpdate = false`，每帧手动更新一次。这碰的是 `renderer.js`，要等 `wf-perf` 合进来。

## wf-perf 已经在改的（不重复报）

- 墨图集只在有湿墨的时候晾干，后面的 mip 重建跟着省掉（`_dryLeft`）。
- LiveGov 实时阶梯：每帧调密度、辉光、AO、60 / 120 Hz 的节奏，`RENDER_RUNGS` / `RENDER_LIVE`。
- 加载画面里把每个后期通道都编译好（`warmPasses`）。
- `GTAOInPlace`：AO 原地相乘，省掉一趟整屏拷贝。
- `BloomIntoGrade`：辉光合成放进调色那一趟。
- `OUT_FRAG`：输出步骤放进 SMAA 前面的最后一趟。
- 学习关 / 跑酷里触屏按钮不做模糊。
- 量具里另外量了阴影、屏幕特效的 GPU、`backdrop-filter`、合成层。

## 量过的数（Node 22.22，V8，Xeon 2.1 GHz）

- `frameFor`：12.5–104.7 ms → 标量版 2.3–18.3 ms（×4.5–5.7），7/7 相同（`probe/frame-search-noalloc.mjs`）。
- `splitFrame`：17–23 ms（`probe/split-search.mjs`）。
- 小地图画布：216k–561k px（`probe/bounds.mjs`）。
- 墨层：一带 2.8–8.3 ms，整张 8.7–24.0 ms（`probe/minimap-ink.mjs`）。
- 工作台数据 JSON：1 / 2 / 4 MB 时 stringify 8.9 / 9.5 / 27.1 ms，parse 7.5 / 14.6 / 40.5 ms（`probe/blob-json.mjs`）。

## 拿不准的

- 真机上的绝对值（V8 和 JSC 不一样），按 1–4 倍估的。
- 第 4 条是读 three 的程序缓存键和 `character.js` 的注释推出来的，要 `?proglog` 确认；有的变体可能能直接复用现成的程序。
- 第 7 条：她的数据有多大不知道。
- 第 2 条：iOS 上 2D 画布是不是 GPU 后端，决定合成以后要不要重新上传，不确定。
- 第 3 条：`m.update` 在真机上占一帧多少，不知道。
- 第 10 条：对抗赛里屏幕外平均有几个角色，是估的。

## 没做的和原因

- 没改代码、没开工作树、没提交：这次只读。
- 没跑浏览器，所以没跑 `?proglog`、`hitch-probe`、`perf-probe`：浏览器锁留给改代码的 agent。
- 没跑仓库里的测试：两个仓库都没改。
- 没看截图。
- report.md 没写成：工具拒绝子 agent 写报告文件。

## 要业主 / 主会话定的

1. **学习关里要不要角上的小地图。** 业主转述她：「点左下角地图没有反应，点右上角地图，它也没有反应」，她会去点它，所以要先和修讲解板卡死的那一路对一下。保留的话，按第 2 条的办法做，看起来和现在一样。
2. **推到她账号的时机**（第 7 条，LEARN §39 / §41）。挪到安静的时候，进程被杀时会多丢几题。不改时机的那两步（发 `cache.raw`、增量序列化）可以先做。
3. **她的 App 里要不要预载联机大厅**（第 21 条）。业主说过「我们可以点进去之后选择游戏方式」，要看游戏入口里有没有联机。
4. **学习关里要不要显示涂地对战的 HUD 部件**（墨罐、特殊武器槽、涂地数字）。不显示的话，第 8、15 条在学习关里就没有了。

## 合并时要注意的

- `main.js`：`wf-perf` 改了 `_loop`、`_frame` 末尾的 `_ftMs`、`_updateHud` 里 `fps` 那一行、`_dynRes` / `_govWin` / `_onPower`。第 2、3 条的改动在同样的函数里，等它合进开发分支以后再开分支。
- `renderer.js`：第 24 条要等 `wf-perf` 合了再做。
- 第 1 条：机位测试、`wire-audit` / `runner-audit` / `arena-audit` / `parity-shots` 应该完全不变，`evidence-snapshot` 不受影响。
- 第 3 条：审计和测试都是 `sub = 1`，结果应该不变。
- 第 7 条碰她账号的写入路径：照 LEARN §39 / §41 的规矩来，增量序列化要有逐字节对照的测试，改完要跑 IELTS-Base 那 8 个游戏为主体的 e2e。
- 没有生成的文件；探针都在草稿目录，不进任何仓库。