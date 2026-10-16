# 开发日志（INKWAVE · 关卡学习）

每一步做了什么、为什么、怎么验证的。**最新的在最上面**，时间是 UTC（北京时间 +8 小时）。设计契约在 [LEARN.md](LEARN.md)；没做完的写在各条的「没做的」里。三条分支并行：`learn-a`（内容桥、题目引擎、进度 / 证据、关卡定义；纯模块、只跑 Node 测试）、`learn-b`（模式脚手架、一关解谜、手机能开）、`learn-d`（关卡设计：LEVELS.md + design.js，纯数据）。

---

## 2026-10-16

### 14:40 play-1 交付：题即玩法第 1 期——解谜里的选择题变成墨靶，不暂停、不弹卡（分支 `play-1`，LEARN §18）

- **为什么**：业主 10-16：「门是弹窗卡片回答，游戏界面暂停，完全就不是一个游戏」。PLAY.md §9 第 1 期：开关、题物系统、题条，解谜里的选择题走 M1 墨靶。
- **先量了什么**：三周里这一期管 664 个条目（单词选义 450、语法小测 138、发音小测 76）；语法小测都是 3 个选项（PLAY 写的 2–3，更正了）；没有一个题干以「哪一个是」开头，所以答错后的换问法就是同一题重排、还是墨靶。走路时截了竖横两张图，量她和触屏键在屏幕上的位置，再定题物能放哪。
- **定了什么**：`LEARN.play` 开关（默认开，`?play=0` 退回卡片，一字不差）；只管解谜本身（其它形式继承它，照旧卡片）；判分只有一条路（`_judgeRecord`，卡片和墨靶共用，测试逐条对拍）；墨弹真打到那一刻才判，只有点射 / 准星压着开的、记着这一题这一个靶的那颗才算，而且它不被场景挡；题物先在屏幕上排好、相机停稳后按相机此刻的样子放进世界。
- **改了什么**：`src/learn/play/`（layout / pick / hit / atlas / m1 / frametime 纯模块 + targets 三维 + run 运行层）、`src/ui/play-strip.js`、`flow.js`、`hud-learn.js`、`config.js` 的 `LEARN.play / playUi / m1`；别人地盘上 `weapons.js` 3 行、`touch.js` 2 处、`main.js` 3 行；`tools/learn/play-audit.mjs`；PLAY.md 更正 3 处事实。
- **路上踩到的**：第一道门在出生台阶底下、面前是喷泉——镜头被台阶顶进她头发里、题物在喷泉后面、墨弹打在喷泉柱子上永远答不了、门上的锁和光柱横在画面里；取景改成用 rig 自己的探杆试 28 个姿势、看得见她和题物那片地方才行，她站住再挑一次；放题物也看枪口和标签；点射的墨弹从枪口直接瞄、不被场景挡；她的身影按 `PLAYER.height` 量（原来按 2 米多，四个球被挤成小小的 3 + 1）。
- **验证**：`npm run test:learn` 82 → 93、`npm run check` 绿；浏览器：竖屏、横屏、横幅竖横全过，桌面第二题墨弹擦边没答（已改，改后没重跑）；解谜卡片路、道具赛、对抗赛、Boss、道具赛竖屏、`play=0` 的老审计全过；帧时间出题时比走路还低（p50 2.9 vs 3.7 ms，SwiftShader 相对值）。
- **没做的**：阅读题、其它条目和其它形式（各等自己那一期）；连对演出；桌面改后没重跑（收尾）；真机。

### 09:30 第二版设计：题即玩法（主会话，`docs/PLAY.md`，还没开工）

- **为什么**：业主 10-16 看了 TestFlight 1121：「门是弹窗卡片回答，游戏界面暂停，完全就不是一个游戏，而是拼接了两个不同的东西」，要「射击对象或者保持节奏的某种劲舞或闯关跑酷玩法，下一版发布要改成这样」；又说横屏更适合就别丢横屏，用 INKWAVE 现成的素材和玩法做跑酷、选车道，画风和流畅度一致。
- **先量了什么**：三周 2 247 个条目按玩法分：选择题 820（单词选义 450、语法小测 138、发音小测 76、音标 96、阅读题 60）、听辨对子 174（都是 2 个选项）、要打字的 1 208（单词卡 900、听写句 206、写句 102）、只看 / 只说 45。选项标签最长 54 个字符（阅读题）。`model.js` 把「错过以后又打对」（`src === 'T'`）当单独的证据，所以单词卡不能改成选字母（那是 `H`）。导航网格只有 1 m 格子的「能站人」，没有路宽，所以跑酷的题行要先扫净宽。
- **定了什么**：八种玩法（墨靶、墨幕车道、节拍台、字弹、弱点、展板路、回声亭、翻牌靶），每个条目一种，证据方式不变；键盘是游戏自己的、当武器用，提交前不给对错；拍子只管加速和舞、不管对错；不暂停、不定身、没有面板（开关 `LEARN.play`，删卡片前能退）；道具赛改成墨浪跑酷；竖横都能玩，App 只给游戏页开横屏。分 8 期、一次一个子代理，第 8 期删卡片后才发 TestFlight。
- **改了什么**：新 `docs/PLAY.md`；LEVELS.md 三处「做题时画面不动 / 题层叠在下半屏」标作废、开头指向 PLAY；LEARN.md 开头指向 PLAY。

### 07:15 I 工作流交付：App 里竖着拿手机能走到的每一屏（分支 `learn-i`，LEARN §17）

- **先读了什么**：LEARN 全文（§1 原则、§14–§16 的「没做的」）、DEVLOG 10-16 的四条；`menus.js` 的屏系统、`touch.js` 的竖屏门、`showcase.js` 的取景、`session.js` 的房间；IELTS-Base `app/exam/ui.js` 的 claim、`app/exam/sched.js` 周报里的「自评」、gen.js 的 `claimable`（只读，没碰 `app/my-progress.*`）。
- **先定的**：主会话定了 App 里藏「对战」；I 把它做成一个开关（`LEARN.appLearnOnly`），连装备页的「练习」、房间的三种对战模式一起收，只在 `from=app` 且中文界面时生效。每屏用一个脚本量，不靠截图目测：真触屏点进去、动画走完、量 44 pt / 被盖 / 出屏 / 裁字 / 折行、用屏自己的返回键回去。
- **改了什么**：见 LEARN §17——联机 hub / 房间 / 武器抽屉 / 表情 / 装备 / 换装 / 结算 / 联机暂停的竖屏版式和中文（字典 502 → 862 条）、手机上能输房间码、机器人中文昵称、竖屏 HUD（钟不再被门条压、触屏上排键 ≥ 44 pt、出题时触屏层不活）、写句的「我的写法也对」（`S`）、审计脚本。提交 10 个：开关 + 审计 → hub / 码 → 房间 / 装备 / 换装 → 结算 / 暂停 / HUD → versus2 组 → 「我的写法也对」→ 审计横屏开关 → `?lang=en` 不跟开关 → 关卡收尾 → 文档。
- **路上踩到的**：① 手机上**进不了别人的房间**——房间码格子是听实体键盘的 `<span>`，点了不弹键盘；盖了一个透明的真输入框。② 换装屏点格子报 `t is not a function`：参数名把 `t()` 盖住了（G 的字典进来以后才会炸）。③ 审计里的假象，都改在脚本里、不改游戏：入场动画没走完时按钮量出来是 0；`extra` 在量之前求值，钟量在 HUD 落下来之前（y = −19）；触屏层是在放开题卡的**下一帧**开的，紧接着量就是「没活」；versus2 的 HUD 开场是 3 秒墙钟、两倍速步进时一直藏着。④ Boss 的写句近似答案不好凑：在页面里拿 `engine.js` 对第 1 周 30 句做删词 / 换词，30 / 30 都有 `claimable` 的变体。⑤ 容器 05:00 前后重启过一次，没提交的改动检查后照常提交。
- **验证**：`npm run test:learn` 82 / 82（+ `claim.test.mjs` 3 条、i18n 扫描多盖 8 个方法和一条「对照表一项不少」），`npm run check` 212 个文件绿。headless 都在 `flock -w 9000 /tmp/ielts-browser.lock nice -n 10` 里、一次一组、每组 ≤ 3 分钟（`/opt/pw-browsers/chromium`、`?quality=low`、阴影 / 泛光关、模拟时钟）：390×844 触屏 8 组（menus、kit、online、room、zone、level、versus2——真起一个本地中继开房、对机器人打完到结算再回房间、boss——真点一次「我的写法也对」记 `[1, 'S']`、真跳过一次记 `[0, 'W']`），表在 LEARN §17，每屏进得去、回得来、溢出 0、最小目标 ≥ 44；`--lang en` 一组；1280×720 桌面横屏（`--web --desktop`）联机两屏。截图和日志看完删了。
- **没做的**：清单第 4 项（coop2 共用墨罐、房主迁移时正在问的那题）没做——要两个客户端才验证得了，接手的位置写在 §17；访客那一侧、对的房间码、点「开始」、coop2 开局后的竖屏、真 iPhone 键盘只代码审过。没推、没 `npm install`（`node_modules` 是指向 learn-b 的软链，被 exclude 挡着）。

### 02:15 F 工作流交付：Node 中继 + 双人联机赛 versus2 + 双人成形合作赛 coop2（分支 `learn-f`，LEARN §14）

- **先读了什么**：LEARN 全文（§5 模块边界、§10 联机、§13 E 交付）、NET.md、EVENTS.md、`server/src/index.js`（Worker 的线协议）、`src/net/*`（session / transport / netmatch 的 `onMessage`、`sendResult`、房主迁移）、`src/learn/forms/*`（对抗赛的 `zonePlan().hotspot` + `paint.flood`、`common.js` 的纯函数）、`flow.js`、`hud-learn.js`、`match.js` / `main.js` 的联机路径（`startNetMatch`、`netMatchGo`、`_judge`）、`zones.js`（`netEvent`、`_end` 的 `ze`）、`menus.js` 的房间屏和结算屏、`tools/net-test.mjs` / `play.mjs` / `chrome.mjs`。
- **先定的**：中继手写 WebSocket（全局 NODE_PATH 里没有 `ws`，不 `npm install`）；versus2 就是一局 INKWAVE 的 Zone Control（`mode 'zones'` + 学习层），不另造一种局——开场、规则、HUD、加时、裁判、结算原样；coop2 走 B 的解谜舞台（`mode 'learn'`、solo、两个人一队）；房主当学习的裁判（和钟、区域一样），学习负载走同一个信封（`{k:'l…'}`）；`paint.flood` 不走复制，所以墨由房主定点、每个屏幕自己涂；「先答对」按各自屏幕上的用时比（房主到自己是零延迟）。
- **改了什么**：见 LEARN §14（中继、房间、负载、两种模式的规则、纯函数、B / E 文件里的改动、测试、实测、拿不准的、没做的）。提交：中继 → versus2 竖切片 → coop2（含 B 自动走的修）→ 文档。
- **路上踩到的**：① 两个浏览器连上后都被中继踢掉——不是中继错：步进时一次 `evaluate` 跑 30 帧，页面主线程堵住，ping 发不出去，20 s 静默按规矩踢；改成 4 帧一块。② 还是踢——加了中继的踢人日志才看清：比赛的**第一次 `paint.flush` 在每个页面卡 ~48 s**（SwiftShader，换不换舞台都一样，`--profile` 量出来 46.8 s 全在 `paint.flush`），中继给这台机器起成 `--silent-match 150000`（默认仍是 Worker 的 20 s）。③ 步进比实时快时一个客户端每秒发一百多个 tick，会撞中继的 90 条 / 秒——限成最多 2 倍实时。④ 页面在菜单里没冻结时，背景的 4v4 演示局让大厅的轮询都等超时——开机就冻结，建房、开局、建关、ready / go 都只靠消息和定时器。⑤ INKWAVE 的裁判动画跑在 HUD 自己的 rAF 时钟上，GPU 被占满时几乎不走——结束后用它自带的调试倍速 `hud.timeScale`。⑥ coop2 两个人一步都不走：B 的自动走在一帧 > 1/45 s 时（局面分两个子步）把自己上一个子步写的移动当成「玩家推了摇杆」关掉了——慢手机上也会，修在 `flow.js`。⑦ 墨垫在 halyard 的回头坡上两块挨着（不同高度）——`padsApart` 认「隔一层楼」也算分开，退回路线上时再往前找。
- **验证**：`npm run test:learn` 59 / 59、`npm run check` 206 文件绿；两个 headless 浏览器（都在 `flock -w 9000 /tmp/ielts-browser.lock nice -n 10` 里，一次一个、每次 ≤ 3 分钟）：versus2 8 / 8（建房 78 s、两人进关 83 s、同一道题相隔 15 ms、第 1 题访客按自己的时钟快 1.5 s 拿到墨、第 2 题房主、两边份额一样、各自的首答、两边结算带学习条 158 s）；coop2 全过（墨垫 129 s、5 题全拆两半、答错换人、两道门两边都开、结果卡 165 s）；大厅 6 / 6（MODE 箭头、「课」一行两边一致、coop2 的锁和两人规则）；截图看过都删了；三次都没有控制台错误。前面十几次没跑完的都是上面那几条坑。
- **没做的**：见 LEARN §14 末尾（docker-compose、墨罐共用、迁移时正在问的题、机器人填位 / 断线 / 迁移没实测、手机竖屏）。没推、没 `npm install`（`node_modules` 是指向 B 工作树的软链，被 `.git/info/exclude` 挡着）。

### 02:10 H 工作流交付：录音接入、进度并进她的证据、iPhone / WKWebView 下的稳妥（分支 `learn-h`，LEARN §16）

- **先读了什么**：LEARN §2 / §5 / §8 / §13，`src/learn/*.js`、`vendor/ielts/model.js`（`mergeDoc`、`validLeaf`、`answers` 取当天最早的）；IELTS-Base 的 `app/index.html`（`Clips`：`index.json` → `[分片, 偏移, 长度]`、`at()` 的查法、`plan()` 的「每段都有才放」、`<audio>` 优先的理由、`CLIP_SILENT` 解锁；`LOCAL_KEY` / `localBlob()` / `S.base`；`tzPlace()` 默认新加坡），`app/base/core.js`（`record` 的 `hasEvOn`、`mergeDoc`、`DERIVED_V = 2`），`app/sync.js`（`pendingChanges` 对每篇算摘要），`ios/IELTSBase/SchemeHandler.swift`（单段 Range、206、MIME 表）、`WebView.swift`（`mediaTypesRequiringUserActionForPlayback = []`、默认数据存储、非首页开侧滑），`docs/native-integration.md` §5 / §7。没打开 `app/my-progress.*`；测试和浏览器里用的都是编出来的工作台。
- **先定的**：录音照课上的顺序放（`<audio>` 先、Web Audio 后、设备声音最后），不是字面上的「解码后播」——iPhone 静音键开着时只有 `<audio>` 有声音（IELTS-Base 查过 WebKit 源码，native-integration §7）；解码那条路用 INKWAVE 自己的 AudioContext。并账的「当天首答」取宿主写入时的规矩：她那天已有答案就不进。她的时钟和切句都从宿主逐字抄（导出工具），不自己写一份。
- **改了什么**：导出工具多抄 8 个宿主名字并在 IELTS-Base `e881096` 上重跑（`content/` 没变）；`src/learn/audio.js`（新）；`src/learn/workbench.js`（新）；`store.js` 的 `exportDoc / exportDocs / pushToWorkbench / attachWorkbench`、她的时钟、只读她的历史；`api.js` 在页面里挂 `attachWorkbench`；`hud-learn.js` 播放四处；`touch.js` 竖屏门；`main.js` 全屏条件；`menus.js` 小图三行；`index.html` 信标。
- **路上踩到的**：竖屏 App 里页面一隐藏，关卡暂停菜单就被「Turn your device」盖住（headless 实测 `is-armed`、`display: flex`），App 转不过来就出不去——`from=app` 不再亮门。headless Chromium 不管 `--autoplay-policy` 都让媒体自动放，Safari 的「先点一下」只能拿桩模拟（`play()` 在可信事件前拒、`AudioContext.state` 挂起）；这一模拟抓到解锁监听摘得太早（脚本合成的点击先到、被拒，真点击时已经没监听了），改成放成了才摘。服务器不认 Range 时两片的缓存会让同一分片在一道门里重下几次，改成留一个音色的 12 片。
- **验证**：`npm run test:learn` 52 / 52（+ `audio.test.mjs` 4、`workbench.test.mjs` 5），`npm run check` 201 个文件绿。课本认不认：用 IELTS-Base 自己的 `load-host.cjs` 把活宿主起在并过的编造 blob 上，`Model.answers` 画出了游戏的三条（半衰期、`lastMiss` 都对）。headless 都在 `flock -w … /tmp/ielts-browser.lock nice -n 10` 里、每次 ≤ 3 分钟、一次一个（共 15 次，含几次改脚本重跑）：按 IELTS-Base `app/` 布局的小服务器上 `game/index.html?learn=w1d1&kind=puzzle&from=app&quality=low`——第一道听的题 Monday 走 `index.json` + `us-5.mp3 206 bytes=4652-10839`、`<audio>` 放（clip）、点「听」走缓存；答对 0.8 秒后编出来的工作台 blob 里多了 `ev-2026-10-12` 的 9 条；页面隐藏 → 暂停菜单、声音停、门不亮；不认 Range 的服务器：200 整片、之后不再发 Range；模拟 Safari：先换设备的声音、真点击后放录音；开发服务器根目录：`/audio/` 零请求；`from=app` 主菜单 / 模式页只请求 `-sm` 图、门不亮。都无控制台错误、无未处理的 rejection、`from=app` 无信标。截图（暂停菜单、主菜单）看过即删。
- **真机待验 / 没做的**：见 LEARN §16 末尾——WKWebView 里的 Range、blob `<audio>`、同 origin 的 `localStorage`、iOS 16.4+ 导入表、后台时的 `visibilitychange`、内存；IELTS-Base 那边建议游戏页不开侧滑返回、改完要重跑 `sync-inkwave.sh`；竖屏菜单挤；考试人物录音没接。

### 02:00 G 工作流交付：中文化之后的收尾——竖屏菜单、今日小考跑通、Boss 音乐、复习日翻牌（F）、写句多行、路标占位（分支 `learn-g`，LEARN §15）

- **竖屏**：她竖着拿手机，原来 INKWAVE 的菜单在竖屏下是 16:9 的缩小版（主菜单按钮一百来像素宽、学习局暂停的面板图标撑满半屏）——主菜单、学习屏、设置、学习局暂停加了竖屏版式，「横过来」条只盖其它屏；`?from=app` 时「学习」是第一个大按钮。
- **今日小考**：直接开和从解谜结算卡的按钮开都跑到了结果卡。路上的两处：审计等结果卡按墙钟算，软件 GL 下等不到（改成按模拟时间）；小考把结果写进了这一天的星星（改成只记自己的奖杯）。
- **Boss 音乐**：`bossAudio.js` 只认 `mode 'boss'`，学习局的周考是 `mode 'learn'`——加了 `isBossMatch`，请求序列 `boss · battle→boss · battle_final→boss · boss_2 · boss_3 · null`。
- **复习日翻牌**：150 词那一步是翻牌（中文 → 翻过来 → 记得 / 不记得），证据方式 `F`（`store.recordFirst` 加 `how`，`F` 在 `Model.MODES` 里、就是宿主的看词自评），不记得马上打一遍（练习）；`flip.test.mjs` 4 条。
- **E 留下的**：写句三行输入框、空答案不提交、路标（写字墙 / 回声亭 / 打卡垫）的 3D 占位、Boss 题号分母、手机上 Boss 段条不折行、关卡的钟一行。
- **验证**：`npm run test:learn` 53 / 53、`npm run check` 200 绿；浏览器（锁里、一次一个）：390 × 844 触屏四屏的溢出检查和截图、翻牌正反面截图和 F 证据、Boss 写句截图，960 × 540 小考两条、Boss 音乐、路标截图；截图看完按路径删了。细节和「只代码审过 / 没做的」在 LEARN §15。

### 00:45 G 工作流：游戏壳中文化（分支 `learn-g`，LEARN §15）

- **为什么**：她从雅思 App 的「关卡」进来，英文只能出现在题目本身里（LEARN §1.4）；业主今天发版，这一条先做先交。
- **改了什么**：`src/ui/i18n.js` 一张表（键 → 英文 / 中文），默认中文，`?lang=en` 是原来的英文；载入页、标题、主菜单、学习屏、暂停（学习局有了自己的面板）、设置（含实时预览的说明）、怎么玩、制作人员、HUD 的横幅 / 区域播报 / 裁判 / 被击倒卡 / 连杀、Boss 的 HUD、触屏键、竖屏提示条都走 `t()`；武器 / 舞台 / 队名有中文名；汉字的显示字体（`Titan One` 的汉字别名到系统粗黑体）。
- **验证**：`tests/learn/i18n.test.mjs` 5 条（键全有中文、占位符一致、专名全有中文、扫描她路上的代码没有漏网的英文字符串）；`npm run test:learn` 48 / 48，`npm run check` 200 文件绿。浏览器（锁里，390 × 844 触屏，`?learn=w1d1&kind=puzzle&short=1&from=app`）：关卡、暂停、主菜单、学习屏、设置五屏都是中文，没有溢出 / 折行的按钮字；**但竖屏下 INKWAVE 的菜单是 16:9 的缩小版**（主菜单按钮一百来像素宽），下一步做竖屏排版。

### 00:20 E 工作流交付：道具赛、对抗赛、Boss 战三种形式 + 今日小考（分支 `learn-e`，LEARN §13）

- **先读了什么**：LEARN §1 / §4 / §5 / §8 / §9 / §12，LEVELS 全文（§2.2–§2.8 的规则、§3 的表、§5 的演出名、§6 的数据形状），`design.js`、`flow.js`、`hud-learn.js`、`match.js`、`zones.js`、`bots.js`（`zonePlan` / `hotspot`、`_bossTick` 认 `G.boss`）、`boss.js` / `bossMode.js` / `bossBrain.js`（`force`、`checkPhase`、`applyDamage`）、`nav.js`、`paint.js`（`flood` 只要 `region.cells`）、`main.js`（指针锁丢了就暂停的那一处）。
- **先定的**：B 的切片建在替身上，而 D 的 `design.js` 直接吃 A 的模块——两边各一个 `store` 写同一个 `localStorage` 键、形状不同（替身的 `load` 会把 A 的文档当成自己的然后 `s.first[key]` 炸）。所以第一步就是 B 预留的切换：`api.js` 改成 A 的四件，B 切片露出的三处不兼容各改一行（换问法按 `type !== 'choice'`、重排选项用引擎的选项文本、到期用 `weekRef`）。切完 `?learn=w1d1&kind=puzzle&short=1` 在真内容上开得起来（音标门、换问法、墨路、证据 `ev-2026-10-12`）。
- **改了什么**：数字进 `config.js LEARN`、`design.js` 只读它（D 的 8 条照旧绿）；`match.js` 认 `learnKind`（道具赛 1 队 1+3 没脑子的机器人、对抗赛 4v4 + ZoneControl、Boss 1+3 + BossMode、`sides` 给小考的 2 对 3、`hold` 时她的控制器停、`new (o.learn.Flow || LearnFlow)`）；`main.js` 的 `startLearn` 走 `forms/index.js`、`?learn=w1&kind=boss`、`&short=1`、对抗赛建 zones 版舞台、`learn.hold` 时松开鼠标不算暂停；三种形式各一个文件 + `common.js`（纯）+ `ui.js`（表现）；菜单三种形式亮起。细节在 LEARN §13。
- **路上踩到的**：A 的 `puzzleLevel(week, day)` 要周对象、`head()` 写 `week: 'w1'`（HUD 会显示「第 w1 周」）——`buildLearn` 把数字周 / 天盖回去、周对象放在 `weekRef`；A 的听写题 `type: 'type'` 让 B 的换问法走进选择题分支、`item.options` 不存在就炸；对抗赛 / 道具赛答题不暂停局，松开指针锁会被 `main.js` 当成「失焦暂停」弹出暂停菜单——加了 `learn.hold` 的例外；Boss 的 W 段 D 算一题（`hitPerRight` 是整段），流程逐句判，所以每句打掉三分之一，测试里 `toFixed(4)` 的四舍五入要给 1e-3 的余量；Boss HUD 在局开始时按 `match.mode === 'boss'` 关掉了，`boss.js` 每帧看一眼没开就开回去；真舞台的 nav 图在 Node 里 258 ms 就建好了，所以环线的测试直接跑 7 张舞台而不只是夹具。
- **验证**：`npm run test:learn` 43 / 43，`npm run check` 199 文件绿；headless 都在共用锁里一次一个（锁被 B 的跑和 IELTS-Base 的 e2e 排着，每次等几分钟）：race w1d2 short：环线 77 / 78 节点共享 5%、两块看板、错 → 换问法 → 对、每答对掉道具、两道门开墨路 8%、第 1 名、`learn:done`、结果卡、星 0 → 1；duel w1d6 short：两轮备战 + 轮、区域份额 0 → 0.39（对面 0.31）、特殊 +15 → 满 + 护盾、`learn:ink / round / done`、星 + 奖杯写进 `inkwave:learn:design:v1`；boss w1 short：错 → slam → 躲、对 → HP 1 → 0.83 → 0.66（阶段 2）→ 0.33（阶段 3）→ 0.1、写句判对、S 卡两击打死、每段首答计数的结果卡；手机 390 × 844 的道具赛看板截图看过删了。三条都无控制台错误。容器 23:27 UTC 重启过一次（服务器、队列、等待者都没了），重起后按 race → duel → boss 重跑的就是这三条。
- **没做的**：见 LEARN §13 末尾；没推、没 `npm install`（`node_modules` 是指向 B 工作树的软链，不进 git）。

---

## 2026-10-15

### 23:23 关卡学习 B：解密闯关竖切片——第 1 周第 1 天一关，Tidewater 上离线能走、手机能开（分支 `learn-b`；LEARN.md §9）

- **为什么**：LEARN.md §6 的第一步：A 做内容桥 + 题目引擎（纯模块），B 做模式脚手架 + 一关解谜，两边并行；B 这边先用一个接口一样的替身（`src/learn/engine-stub.js`），A 落地后改 `src/learn/api.js` 一个文件。
- **改了什么**：三个钩子——`match.js` 的 `mode: 'learn'`（单人无敌人无钟的 `solo`，`match.learn` 每帧先于 `paused` 早退跑）；`menus.js` 的「学习 · LEARN」屏（选周 / 选天 / 选形式，只有解密闯关能开）和 `?learn=w1d1&kind=puzzle`；`hud.js` 挂 `hud-learn.js` 答题层。关卡本体 `src/learn/flow.js`：门沿 `G.nav` 的 A* 路线（出生点 → 对面出口，不走攀墙边）按距离摆，走近 3 m 停住出题，答对门开、墨路铺到下一道门，答错上锁、换个问法排到队尾，最后一道门出结果卡；当天首答进 `store`。`config.js` 的 `LEARN`。自动走（`autoWalk`）给手机竖屏和脚本用。
- **三个钩子之外**：`src/core/touch.js` 三处（关卡 `paused` 时触屏键不活——拇指按在答题卡上不是摇杆；关卡允许竖屏）。工具：`tools/serve.py` 在没有 IPv6 的容器里退回 IPv4（原来 `AF_INET6` 直接 `EAFNOSUPPORT`）；`tools/chrome.mjs` root 下补 `--no-sandbox`（Chrome 拒绝以 root 起）；`tools/play.mjs` 加 `--touch`（触屏 + 粗指针 + 2x，并把 `touchControls` 钉成 `on`，因为 headless 的触屏模拟不改 `(pointer: coarse)`）。
- **这台机器**：容器里没有 GPU、以 root 跑，headless Chrome 原来建不出 WebGL 上下文（`BindToCurrentSequence failed`），改走 ANGLE + SwiftShader 后能跑，但原档画质一帧 1.5 s（smoke 的 `perf.render` 1551 ms，180 s 内走不出 intro）；所以审计都用 `?quality=low` + `--settings {"shadows":false,"bloom":false}` + 小窗口，走路和铺墨用 `__inkwave.debug.freeze / step` 走模拟时钟。每次浏览器都在 `flock -w 9000 /tmp/ielts-browser.lock nice -n 10` 里，排在 IELTS-Base 的整套测试和另一条工作流后面（一次等了 30 多分钟）。
- **验证**：`npm run check` 绿（184 个文件）；`node --test tests/learn/*.test.mjs` 5/5（替身的契约：每道题恰好落一道门、一道门一个步、判分不看大小写 / 英美拼写、首答只认一次）。桌面 960×540（`tools/learn/play-desktop.json` + `drive.js`，`?learn=w1d1&kind=puzzle`）：开进关卡（mode learn、1 个角色、7 道门、HUD 的钟读「第 1 周 · 第 1 天」）；门沿 78 个节点的路线从 z −34.5 到 +34.5 每 ≈ 11 m 一道（听写 3 道、选择 2、听力 1、重音 1，每道 2 题）；自动走 2 s 模拟时间到第一道门（走了 6 m），到门即 `paused`；第一题 Wednesday 故意答 zzz → 「不对，门上多了一道锁。待会儿换个问法再来 · 为什么：正确写法：Wednesday（星期三），你写的是「zzz」」；第二题 February 答对；第一题换成四选一回来、选 Wednesday 答对 → 门开（锁 1）、墨路铺到第二道门（`G.paint.coverage()[0]` 0.006）、自动走接着把她带到第二道门出题；总线 `learn:gate(opened:false) → learn:question → learn:answer{ok:false,first:true} → … → learn:answer{ok:true,first:false}（重问不算首答）→ learn:gate(opened:true, locks 1)`；`localStorage['inkwave:learn:v1']` 里两条首答、两条证据；无控制台错误（只有 KHR_parallel_shader_compile 的 warn）。手机 390×844 `--touch --dpr 1`（`tools/learn/play-phone.json`）：触屏模式起（`touchMode` true）、竖屏不弹「转过来」（`.iw-touch-rotate` 没 `is-armed`）、自动走 2 s 模拟时间到第一道门、到门 `paused`、触屏键不活（`touch.enabled` false）；答题卡占下半屏（390×422）、题干「听写：听一遍，把这个词打出来」+「星期三」、▶ 听 84×44、输入框 250×48 字 18 px、提交 100×48；截图看过（卡在下半屏、中文在前、门的光柱在后面、没有英文提示）后按路径删了。`./tools/smoke.sh 8491`（原来的模式）：原档画质下游戏起来了但一帧 1.55 s，180 s 的等待里还在 intro；`SMOKE_URL_EXTRA='&quality=low' SMOKE_ARGS='--w 960 --h 540 --settings {…}'` 那一次：开机 51.6 s、一帧 0.40 s，到 `eval` 时 `state: playing`、8 个角色、机器人已经开始涂（turf [1,0,…]）、没有 `[error]` / pageerror——游戏是好的，但 play.mjs 固定 180 s 的 `until` 先到期，smoke.sh 把「until timeout」判成 FAIL。于是 `play.mjs` 加了 `--until <秒>`（smoke.sh 的注释里给了 `--until 420` 的写法）；按主会话的要求没有再跑一次（锁一次排 10–30 分钟）。**这台机器上 smoke 还没有一次「SMOKE OK」**：有 GPU 的机器照常 `npm run smoke`，这台机器用上面的环境变量再跑一次就行。
- **还缺**：A 的真内容 / 判分 / 记忆模型（替身只有 14 条样例）；题的时限；另三种形式；录音；门的样子（环 + 浮标 + 光柱）；真机 iPhone 上的键盘弹出和第一帧。

### 22:16 D 工作流交付：关卡设计圣经 LEVELS.md + 设计数据 design.js + 8 条测试（分支 `learn-d`，LEARN §12）

- **先读了什么**：LEARN.md 的契约和 A 的 §8；三周课程包每一步（用 A 的 `daySteps` 数：67 / 77 / 77 步，743 / 752 / 752 条目，每天 225 分钟、复习日 195 / 210）；IELTS-Base 的 `SYLLABUS`（17 周）、EXAM.md §1–§2（今日小考 8 题 6 分钟、周考听 20 读 20 写 1 说 1 一天一段 10 天窗口、满月月考、自由练习、不惩罚、当天首答）、DESIGN.md §1–§2（侦察 → 排工 → 施工 → 夯实 → 放下；做题时画面不动；没有数据变化就没有动画）；INKWAVE 的 `config.js`（`OFFLINE_MAPS` 7 张、`SUBS / SPECIALS / DIFFICULTY / TIMES`）、7 张舞台的 layout 和 tag、`zones.js` / `zones-data.js`、BOSS.md、`bots.js`、`touch.js`、CONTRACTS.md 的角色动作 / 音效 / HUD 名单。
- **定下来的设计**（细节全在 [LEVELS.md](LEVELS.md)）：一步一门、题全问、分钟就是课程的；学习在前（展板）题在后；门最多卡两次就开，错了换问法再问、出口前回炉门换一种形式再问、明天到期排最前（夯实）；四种形式——解谜（无敌无钟、A* 路线上按 layout tag 放门）、道具赛（环线、看板段钟停、检查点、道具 = 副武器 / 特殊换皮、机器人掷骰子答题）、对抗赛（zones 中央区、答对泼墨、队友不答题、对面按节奏掷骰子）、Boss（周考四段 = HULLBREAKER 四段 HP，一天一段）；复习日固定道具赛整圈、150 张快闪翻牌；今日小考 = 出口后一轮对抗赛；星只涨不掉、解锁照 `dayDone`。舞台按当天主题选、每周 7 张各一次、第 1 周白天第 2 周傍晚第 3 周交替；Boss 不和复习日同舞台。
- **数据和验证**：`design.js` 的 `DAY_PLAN` 由课程步按规则生成，第 4 周起 `dayPlanFor(week, d)` 对任何导入的周按同样规则现算（以后的周不用重新设计；用 w1 的内容冒充 w4 核过），§3 的表用 `tools/learn/print-levels.mjs` 打印进文档；测试核三周 221 步 `missing = []`、21 天分钟 = 课程 ±20%（节奏模型估的也在 ±20% 内）、舞台都是离线 7 张、道具都指向真的 `SUBS / SPECIALS`、音效 / 动作 / 舞 / 横幅名都在 CONTRACTS.md、Boss 20 / 20 / 3 句 / 4 问 + 2 句且同步不相邻、小考 8 题。`npm run test:learn` 30 / 30，`npm run check` 187 文件绿；没开浏览器、没 `npm install`。
- **路上改的**：Boss 的选题一开始按天排序取前 20，全落在第 1 天——改成每一档（到期 / 新 / 答过）按天轮着取再按题型交错；同一个词在单词门、卡片门、复习日卡片里是同一个 id，考试池先去重；一开始把 CONTRACTS.md 的音效名单连 `(loop; pitch/volume ≈ speed)` 的注释一起切成了名字，解析先去括号再只收 `[a-z_]+`。
- **没做的 / 提案**（LEVELS §6.4）：翻牌自评记 `F` 要 A 的 `store` 加参数；星表和「走完」进度另开一个键；学习关的数字搬进 `config.js` 的 `LEARN`；Boss 第二版用 `sched.plan + gen.render` 出场景题和估分；放门、自动走、三种新输入（表格、三扇门、配对）在 B 的 flow / hud-learn；`match.js` 的 `mode: 'learn'`。没碰 `src/game/*`、`src/ui/*`、A 的四个文件。

### 21:40 A 工作流交付：她的课程和 IELTS-Base 的引擎进了仓库，纯模块四件套 + 22 条测试（分支 `learn-a`，LEARN §8）

- **拿东西**（`tools/learn/export-ielts.mjs <IELTS-Base>`，提交 `be828b7`）：第 1 周原来只在 IELTS-Base 的 `app/index.html` 里（`const W1`），没有课程包文件。不另写一份转换，用宿主自己的 `formatExampleWeek()`——就是她点「课程格式说明」时导出的那份——写成 `content/w1.json`；宿主按 IELTS-Base 自己的 `tests/base/load-host.cjs` 在 vm 里起（照 `course-w3.test.mjs` 的做法把加载器复制到临时目录、多取几个内部名字），`progress: null`，她的进度文件没有被读。`w2 / w3` 原样复制；`symbols.json` 是宿主的音标表。`vendor/ielts/` 五个文件一字不改；`dictScore` 是页面函数、不在模块里，按名字找到、逐字抄进 `host.js`，行号记在 `SOURCE.json`。工具自检两条：抄出来的 `dictScore` 和活宿主在几组向量上算得一样；`w1.json` 建出的 378 个条目 id、中文、音标和活宿主索引一样。跑两次字节相同（日期取 IELTS-Base 的提交时间）。
- **CommonJS → 浏览器**（`src/learn/ielts.js`）：试了一下就定了——这些 UMD 文件按 ES 模块 `import()` 时 `module` 不存在，自己挂到 `globalThis.BaseEngine`，彼此的惰性 `require()`（都带 try/catch）失败后也读 `BaseEngine`。页面和 Node 一条路，不打包、不加 `<script>`。路上踩到一个：仓库是 `"type": "module"`，`require()` 一个 `.js` 得到的是空的 ESM 命名空间，导出工具的自检也改成 `import()` 后读 `BaseEngine`。
- **内容桥**（`content.js`）：不自己给条目编号，用 `Model.buildIndex` 建索引，id 就是她证据里的（`w:monday`、`d:w1d1:b1:jawo5t`、`p:cap|cup`、`s:ʌ`）。十一种包里的步映射到五种关卡步（表在 LEARN §8）；三周 7 天、复习日的 48 个音标和 150 张卡都在。第 2、3 周的「发音」是 `k: 'pron'` 的 grammar 步（弱读、连读、重音的小测），原题原选项。
- **判分**（`engine.js`）：一律 `gen.js` 的 `check()`——听写 `LD` 配宿主的 `dictScore`（88% 的「starts 写成 start」过、80% 刚好过、英美同词、13 = thirteen、大小写不看）、拼词 `VS`（`Model.spellCheck`；`favorite` = `favourite`，`15` 不算 `fifteen`，`living-room` 算「很接近」）、写句 `WT`（be、第三人称 -s、冠词、时间介词、拼写，名字译成中文）、选择按索引。空 ctx 就能跑，不需要考试的 `genCtx`（先用 spike 试过 `patternOf(sub, undefined)`、`writeForms` 不抛）。
- **证据**（`store.js`）：格式就是 `ev-<周一>`（`v: 2`、`[结果, 方式]`，每片叶子过 `Model.validLeaf`）；当天首答照 `core.record`：同一条目同一天第二次返回 `{ first: false }`、不写。到期不另写规则：`Model.answers` + `Model.memory`。测试里顺手核了半衰期：答对一次 h = 1.3，第二天 p = 2^(-1/1.3) ≈ 0.587 已经 < 0.6，是到期的（一开始测试写成「不到期」，错在我，改了测试）。
- **关卡**（`levels.js`）：数据，一步一门，条目全在；道具赛到期的排前；Boss 战整周按 L / R / W 分阶段（口语等语音服务器）。
- **验证**：`npm run test:learn` 22 / 22（`nice -n 10`，0.5 s），`npm run check` 185 个文件绿。没开浏览器、没 `npm install`。
- **定了、要主会话过目的**：关卡作答的证据方式（`L`；打字的词 `T/H/S`；写句 `W/S`）；`audio` 先 `null`（IELTS-Base 的录音是切片打包的）；写句、口语先是 lesson 步；并账走 `Model.mergeDoc`。细节在 LEARN §8。
- **没做的**：口语 / 写句进日关（第二阶段）；录音接入；同步服务器；IELTS-Base 更新后要重跑导出（`SOURCE.json` 的提交号会变，测试核 sha256）。
