# INKWAVE · 关卡学习（雅思课程进游戏）— 设计契约

> 状态：第 1 版（2026-10-15），作为并行开发的契约。中文写说明，代码标识用英文。
> 业主 10-15：「保留你的所有成果，现在需要彻底重构为关卡游戏类的学习，课程内容和深度和容量保持不减少，但是设计成道具赛、解密闯关赛对抗赛的各种形式，直接复用这套前端、游戏设计和所有素材，你的已有开发和素材改为在这基础上添砖加瓦，现在开始并行开发。」
> 两个仓库：**这里（`bugsyyu/inkwave`）是底子**——Splatoon 式的 4v4 泼墨射击游戏（three.js r186，纯 ES 模块、不打包，一切程序生成，有机器人、线上房间、触屏、Electron）；**`bugsyyu/IELTS-Base` 是内容和素材的来源**——她的雅思课程（三周的课、考试中心、记忆模型、录音、口语评测）和新世界的素材（场景底图、写实人物、全景、分块）。IELTS-Base 自己的开发照常继续；这边把它的东西拿过来添砖加瓦。

## 0. 一句话

**把她的雅思课程，一天一关，放进 INKWAVE 的舞台上玩：解谜闯关（一个人，答对开锁）、道具赛（答对拿道具、抢时间）、对抗赛（答题蓄墨，和机器人或朋友抢地盘）、Boss 战（周考）。题目、判分、记忆模型、估分和原来一样多、一样深、一样严；她的进度和原来是同一份。**

## 1. 原则（有冲突按这个顺序）

1. **内容不减少。** 三周课程的每一步（词、句、发音、听写、语法、场景题）、考试中心的每一种题、每一条雅思规则的判分，都要能在关卡里出现；关卡只是外壳。做不到的先留在「经典页」入口里，不删。
2. **证据模型就是内容。** 她在关卡里的每一次「当天首答」写进和 IELTS-Base 一样的证据格式（`ev-<周一>`），由同一个记忆模型（`app/base/model.js` 的半衰期、到期）排到期、由同一个考试排程（`app/exam/sched.js`）出题和估分。进度是同一份：先本机（`localStorage`），再接她今天配好的同步服务器（`IELTS-Base/server`）。**不另起一套账。**
3. **iPhone 先行。** 学习关卡不要求双摇杆瞄准：答题的操作是点、选、打字、说；走位用一根摇杆或自动走。热区 ≥ 44 pt。减少动态效果、深色都要好看。
4. **每一句英文都配中文。** 课程路径上她看到的英文一律带中文（IELTS-Base 的 `gloss` 规矩）。INKWAVE 自己的英文菜单先留着，学习入口和关卡里全中文。
5. **直接复用 INKWAVE。** 舞台、角色、武器、墨、机器人、房间、HUD、音乐都照用；不重写引擎。IELTS-Base 的场景底图、她的写实模型、咖啡馆全景、分块以后作为新的舞台 / 道具加进来。
6. **隐私照旧。** `app/my-progress.*` 不打开、不复制、不上传；录音（100 MB）不进 git；仓库里不写模型名；提交末尾两行署名照 IELTS-Base。

## 2. 内容从哪里来（`IELTS-Base`）

| 东西 | 在哪里 | 怎么拿 |
|---|---|---|
| 第 1 周课程 + 课表 `SYLLABUS` | `app/index.html`（宿主里；`SYLLABUS` 在第 8306 行附近） | 导出成 `content/w1.json`（课程包格式 `ielts-workbench-course` v1，`FORMAT_NOTE` 在 5344 行附近）；`tests/base/load-host.cjs` 会起宿主，可以从它读 |
| 第 2、3 周课程包 | `docs/courses/w2.json`、`w3.json` | 原样复制进 `content/` |
| 考试题库、出题、排程、判分 | `app/exam/bank.js`、`gen.js`、`sched.js`、`mark.js`（CommonJS 可 `require`，`tests/exam/gen.test.mjs` 就这么用） | 先原样复制到 `vendor/ielts/`，ESM 包一层（`src/learn/ielts.js`）；以后改成子模块或构建时同步 |
| 记忆模型、计划 | `app/base/model.js`（`Model.memory()`：半衰期、`due`）、`plan.js` | 同上 |
| 录音（课程、考试人物） | `app/audio/`（100 MB） | 不进 git：按需从 IELTS-Base 的服务器 / 苹果素材包取；没有就用设备的声音（`speechSynthesis`） |
| 口语评测 | `app/speak-ui.js`、`speech*.js` + 语音服务器 | 第二阶段 |
| 新世界素材 | `.cache/plates`、`characters`、`panos`、`tiles`（通过 `tools/world/integrate.mjs` 导入） | 第三阶段：作为舞台 / 道具 |

## 3. 题型（第一天就要有的）

来自课程包里真有的东西：
- **听写 `dictation`**：听（录音 / 设备声音）→ 打字；英美拼写都算对，大小写不查（IELTS-Base §7.13）；当天只认首答。
- **选择 `choice`**：词义、搭配、语法点、场景题的单选 / 多选。
- **听力 `listen`**：一段话（录音 / 设备声音）→ 打字或选择；雅思规则（字数限制、单复数、改口干扰）照题库。
- **发音 `pron`**：重音 / 弱读 / 音节（课程包的 `rows`）→ 选出重读音节、排出弱读。
- 第二阶段：**口语 `speak`**（语音服务器）、**写句 `write`**（`mark.js` 的关键形式）。

判分一律调 IELTS-Base 的函数（`mark.js`、`gen.js` 的校验），不自己写一套。

## 4. 四种关卡 ↔ INKWAVE 的模式（各一句话；竖切片会修正）

| 课程形式 | 游戏模式 | 一句话 |
|---|---|---|
| **解密闯关 `puzzle`** | 一个人、一张舞台、没有敌人 | 一天的课是一串房间 / 门：走到门前出一题，答对门开（墨色涂开一条路），答错门上多一道锁、题换个问法再来；一天学完 = 走到出口。 |
| **道具赛 `race`** | 一张舞台的一条路线、计时、检查点 | 每个检查点一题：答对拿道具（加速、满墨、超级跳），答错绕路；和机器人比谁先到；到期的词排在前面的检查点。 |
| **对抗赛 `duel`** | Zone Control 换皮，4v4，机器人填位、线上房间 | 答题就是蓄墨：答对一题喷一片墨 / 充特殊，答错掉墨；机器人按难度「答题」；占住区域倒数。 |
| **Boss 战 `boss`** | HULLBREAKER 不变 | 周考：听、读、写、说四段各是 Boss 的一个阶段；每答对一题打掉一截血；估分照 `sched.js`。 |

## 5. 模块边界（两条分支各自按这个做）

```
src/learn/
  content.js   内容桥：读 content/w*.json 和 vendor/ielts/*（题库、出题）；给出「第 n 周第 d 天的步」和「到期的条目」
  engine.js    题目引擎（纯函数）：spec → prompt；answer → judge（调 IELTS-Base 的判分）；不碰 DOM
  levels.js    关卡定义：{ week, day, kind: puzzle|race|duel|boss, stage, rules }，从内容算出来
  flow.js      关卡流程：选关 → 进舞台 → 一题一题 → 结果 → 写证据；接 match.js 的事件
  store.js     进度 + 证据：localStorage 键 `inkwave:learn:v1`；证据格式 = IELTS-Base 的 ev-<周一>
  ielts.js     vendor/ielts/* 的 ESM 包装（CommonJS → 模块）
content/       w1.json w2.json w3.json（课程包）
vendor/ielts/  bank.js gen.js sched.js mark.js model.js（原样复制，带来源提交号）
```
进游戏的三个钩子（只改这三处，其余不动）：
- `src/game/match.js`：`mode: 'learn'`，`opts.learn = { kind, level }`；`puzzle` 单人无敌人（像 practice），`race` 单人 + 机器人跑路线，`duel` 走 `zones` 的规则，`boss` 走 `boss`。
- `src/ui/menus.js`：主菜单多一项 **「学习 · Learn」** → 选周 / 选天 / 选形式 → 开局。
- `src/ui/hud.js` + `src/ui/hud-learn.js`：答题层（题干、选项 / 输入框 / 播放按钮、对错和「为什么」、进度）；手机上占下半屏，热区 ≥ 44 pt。
- 数字都在 `src/config.js` 的 `LEARN`（题数、时限、道具效果、机器人答题正确率）。

事件走 `src/core/ctx.js` 的总线，照 `docs/EVENTS.md` 的样子：`learn:question`、`learn:answer`（{ id, ok, first }）、`learn:gate`、`learn:done`。

## 6. 节奏（先竖切片，再铺开）

1. **竖切片**（现在，两条分支并行）：A 内容桥 + 题目引擎（纯模块、node 测试、不开浏览器）；B 模式脚手架 + 一关解谜（第 1 周第 1 天，一张舞台，离线，手机能开），`npm run smoke` 绿。
2. 道具赛、对抗赛、Boss 战各一关；机器人答题。
3. 三周全部内容进关卡；证据和到期接通；经典页入口（不丢任何一种题）。
4. 口语、写句；同步服务器。
5. IELTS-Base 的素材进舞台（底图场景、她、全景、分块）。

## 7. 规矩

- 分支 `claude/upbeat-newton-virpn1`（和 IELTS-Base 同名）；**不推 `main`**。每个 agent 自己的 worktree。
- 不 `npm install`（Electron 几百 MB）；headless 用 `/opt/pw-browsers/chromium`（`tools/play.mjs` 的 `chromePath()` 或 NODE_PATH 上的 playwright）。
- **浏览器的活一次一个，都在共用的锁里**：`flock -w 9000 /tmp/ielts-browser.lock nice -n 10 …`（IELTS-Base 的整套测试对时间敏感，和它抢 CPU 会把它弄红）。
- 测试：`npm run check`（语法）、`node --test tests/learn/*.test.mjs`（纯模块）、`npm run smoke`（锁里）。
- 文档：这份契约改了就改这里；日志记在 `docs/DEVLOG.md`（新建，格式照 IELTS-Base：最新在上，UTC）。

## 9. B 交付（2026-10-15，分支 `learn-b`：解密闯关竖切片）

**做了什么**：第 1 周第 1 天在 Tidewater Plaza 上的一关，离线、手机能开。
- `src/game/match.js`：`mode: 'learn'`、`opts.learn = { kind: 'puzzle', level }`：单人、无敌人、无钟（和 practice 一样走 `solo`），舞台是真的；`match.learn` 是 `LearnFlow`，先于 `paused` 的早退每帧 `update`（出题时的「停」就是 `paused`）。
- `src/learn/flow.js`：门 = 导航图（`G.nav`，A*，不走攀墙边）上从出生点到对面出口一路按距离摆的点（`LEARN.puzzle.gates` 道，第一道离出生点 ≥ `firstGateMin` m，两道之间 ≥ `minGateGap` m，摆不下的门把题并进最后一道，**题一道不少**）；每道门带一个步的题。走到 `gateRadius`（3 m）内：`paused` + 松开鼠标 → 答题层开。答对 → 记；答错 → 门上多一道锁，这道题换个问法排到这道门的队尾再问一次（听写 → 四选一、中→英选择 → 听写、重音 / 听力选择 → 选项重排），再错就给正确答案走人。门的题都过了 → 门开：音效 + 墨花，墨路（`G.paint.splat`，`inkRadius`、`inkStep`）沿路线铺到下一道门。最后一道门 → `learn:done` → 结果卡（做对 / 共几题、到期的词、「再来一关」/「回到菜单」）。当天首答写进 `store.recordFirst`。
  自动走：`match.learn.autoWalk(true)`（答题层的「自动走」）沿导航路线走到下一道门、跳台阶；推摇杆就拿回控制。手机竖屏没有摇杆，靠它。
- `src/ui/hud-learn.js` + `styles/hud.css`：答题层 `#ui-root > .iw-learn`（z 18：在 HUD 和触屏键之上、暂停菜单之下）。中文优先：题干中文，每句英文配中文（选项的中文在判完后显出，中→英不漏答案）；听写是真的 `<input>`（Enter / 「提交」）、选择按钮（1–9 键也行）、▶（`item.audio` 有录音放录音，没有就 `speechSynthesis` 的美音）、对错 + 「为什么」、「继续」、进度「第 3 / 14 题 · 门 2 / 8」、锁。≤ 640 px 宽占下半屏；热区 ≥ 44 pt、字 ≥ 16 px（iOS 不缩放）；深色；`prefers-reduced-motion` 关动画。HUD 的钟读「第 1 周 · 第 1 天」。
- `src/ui/menus.js`：主菜单「学习 · LEARN」→ `learn` 屏：周（1–3）/ 天（1–7）分段、四种形式（只有解密闯关能选，另三种灰着带名字和锁）、「开始」；暂停菜单里关卡的「继续 / 离开这一关」是中文。`?learn=w1d1&kind=puzzle` 直接开关。
- 事件（`src/core/ctx.js`）：`learn:question { itemId, gate, type, form }`、`learn:answer { itemId, ok, first, gate }`、`learn:gate { id, index, total, locks, opened }`、`learn:done { done, total, due, firsts, locks }`；都记在 `match.learn.log`。
- `src/config.js`：`LEARN`（周 / 天数、门数、距离、墨半径、自动走、UI 热区 / 判定停留 / 朗读语速）。

**怎么开**：`node tools/py.mjs tools/serve.py 8491` → `http://localhost:8491/?learn=w1d1&kind=puzzle`（手机加 `&nofullscreen` 看地址栏）。菜单：标题 → 主菜单 → 学习 · LEARN → 开始。

**什么是替身**：`src/learn/engine-stub.js` 顶着 A 的 `content.js` / `engine.js` / `store.js` / `levels.js`，接口一字不差（`loadWeek` / `daySteps` / `prompt` / `judge` / `store` / `puzzleLevel`），内容是第 1 周第 1 天的 14 条样例（6 听写、4 选择、2 听力、2 重音）；第 2、3 周和第 2–7 天都答同一天。判分是简版（大小写、标点、几对英美拼写）；到期 = 今天首答错的。进度在 `localStorage['inkwave:learn:v1']`。**切换只改 `src/learn/api.js` 一个文件**（里面写好了换成 A 模块的四行）。换题的另一种问法在 `flow.js` 里拼，仍经同一个 `judge()`。

**除三个钩子外碰的**：`src/core/touch.js` 三处小改（关卡 `paused` 时触屏键不活；关卡允许竖屏，不弹「转过来」）；`tools/serve.py`（容器没有 IPv6 时退回 IPv4）、`tools/chrome.mjs`（root 下 `--no-sandbox`）、`tools/play.mjs`（`--touch`）。

**还没有**：题的时限（`questionTime` 0）；道具赛 / 对抗赛 / Boss 战；录音；口语 / 写句；同步服务器；门的 3D 形状只是环 + 浮标 + 光柱；`lesson` 步不是门。
