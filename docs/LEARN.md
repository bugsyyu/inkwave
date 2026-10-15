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
| **双人联机赛 `versus2`**（业主 10-15 晚加） | 线上房间（`G.net`），两个人各一队，其余位置机器人填或空着 | 两个人同一道题同时出：先答对的那个喷墨占地 / 充特殊，答错的掉墨；到期的词两个人共用一份（谁的到期谁的题多）；结算是地盘 + 答对数。走同一个中继，不新开一套。 |
| **双人成形合作赛 `coop2`**（业主 10-15 晚加；「双人成行」的路子） | 线上房间，两个人同一队，没有敌人 | 一关要两个人一起才过得去：门有两块墨垫，两个人各站一块才开；题是拆开的——一个人听得到录音、另一个人才有输入框（听写）；一个人看中文、另一个人看英文（翻译 / 搭配）；一个人读题干、另一个人选答案（阅读）；墨罐共用（一个人喷光了另一个人得去充）。两个人都答过才算「当天首答」各记一份。 |

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

## 10. 联机：基于服务器的双人联机赛、双人成形合作赛（业主 10-15 晚）

业主：「还有基于服务器的双人联机赛、双人成形合作赛，完全基于 INKWAVE 这边的源码和风格进行改造。」

- **照 INKWAVE 的联机原样用**（`docs/NET.md`）：房间码、大厅（`G.net.lobby`：名字、队、装备、准备）、房主跑机器人和钟、每人自己模拟自己的人、20 Hz 的 tick 经中继转发、断线由机器人接管、房主迁移——一个字不改。学习的东西作为**新的负载**走同一个信封：`{k:'lq', …}`（出题：房主出、广播题 id 和种子）、`{k:'la', …}`（作答：谁、题 id、对错、用时）、`{k:'lg', …}`（门 / 区域的状态）。模式名进 `lobby.mode`：`'versus2' | 'coop2'`（和 `turf | zones | boss` 并列）。
- **服务器**：INKWAVE 的中继是 Cloudflare 的 Worker + Durable Object（`server/src/index.js`，只做转发）。业主要「基于服务器」——给它写一个 **Node 版**（`server/node/relay.mjs`，`ws` 库，一个进程、一个 Map 的房间），**线格式一字不差**（`b|` `s|to|` `m|from|`、`welcome / join / leave / err / lock / ping-pong`、人数上限 8、锁房、静默踢人、速率限制），能和 IELTS-Base 的同步服务器一起用 docker-compose 跑在业主自己的服务器上（`deploy/`）；页面从业主的服务器打开时自动连它（`relayURL()` 加一条：同源的 `wss://<host>/relay`），`?relay=` 照旧可以指到别处。Cloudflare 那份留着不删。
- **双人**：房间就是现成的；两个人进来、房主选 `versus2` 或 `coop2`、开始。`versus2` 两个人分两队（机器人填位可关）；`coop2` 两个人同一队、没有敌人（像 `puzzle` 的舞台）。单人时 `coop2` 不能开（要两个人），`versus2` 可以和机器人打。
- **风格**：大厅、HUD、结算全用 INKWAVE 自己的样子（墨色、字体、表情、「YEAH」），学习的答题层（`hud-learn.js`）叠在上面；中文照 §1.4。
- **节奏**：竖切片 C（等 A、B 交回后开）：Node 中继 + `versus2` 两个人同一道题的第一版；`coop2` 第二步（两块墨垫 + 拆题）。本机测试：两个 headless 浏览器连本机的 Node 中继（照 `tools/net-test.mjs` 的路子），都在锁里。
