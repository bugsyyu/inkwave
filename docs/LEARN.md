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
4. **每一句英文都配中文。** 课程路径上她看到的英文一律带中文（IELTS-Base 的 `gloss` 规矩）。~~INKWAVE 自己的英文菜单先留着~~（10-16 起，G：游戏壳默认全中文，INKWAVE 原来的英文在 `?lang=en`，见 §15）；英文只出现在题目本身里。
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

## 8. A 交付（2026-10-15，分支 `learn-a`：内容桥 + 题目引擎 + 进度 / 证据 + 关卡定义，纯模块、Node 测试）

**拿东西**：`node tools/learn/export-ielts.mjs <IELTS-Base 目录>`（可重复跑，同一提交上两次字节相同）。它用 IELTS-Base 自己的 `tests/base/load-host.cjs` 在 vm 里起宿主（`progress: null`，不碰她的进度），调宿主自己的 `formatExampleWeek()` 把第 1 周写成课程包 `content/w1.json`（`words[3]` 美音音标、词对中文都在，和她导出的「课程格式说明」一个来源），`w2.json`、`w3.json` 原样复制，`symbols.json` 是宿主的 `SYMBOLS / SYM_GROUPS / SYM_LIST / SYM_US`（`Model.buildIndex` 给 `s:` 条目中文和例词要用）。`vendor/ielts/` 里 `model.js bank.js gen.js sched.js mark.js` 一字不改；`host.js` 是宿主页面里 `dictScore` 和它调的函数（`esc fdUs toks normTok lcsOk NUM_1 NUM_10 NUM_ORD numWords dictWords tokMarks dictScore`）按名字找到、逐字抄出来、套上和其它文件一样的 UMD 壳（`var window = root`，让 `fdUs` 在 Node 里也找得到 `BaseEngine.Model`）。`SOURCE.json` 记 IELTS-Base 提交号、日期、每个文件的 sha256、宿主函数的行号。工具自检：`host.js` 的 `dictScore` 在几组向量上和活宿主算得一样；`w1.json` 建出的 378 个条目 id、中文、音标和活宿主索引一样。

**CommonJS → 浏览器怎么走**（`src/learn/ielts.js`）：这些文件是 UMD——有 `module` 就 `module.exports`，否则挂到 `window.BaseEngine.<名字>`；它们互相的 `require()` 都是惰性的、带 try/catch、退路是 `BaseEngine`。所以按 ES 模块依次 `import()`（model → bank → gen → sched → mark → host）时 `module` 不存在，每个都登记到 `globalThis.BaseEngine`，惰性 require 失败后读 `BaseEngine`。页面和 Node（`package.json` 是 `"type": "module"`，`.js` 就是 ESM）一条路，不打包、不加 `<script>`、不改文件。`await ielts()` → `{ Model, Bank, Gen, Sched, Mark, Host }`；`ieltsNow()` 同步拿（没加载会抛）；`loadWeek()` 会先 `await ielts()`，所以 B 只要先 `await loadWeek(n)`，之后 `daySteps / prompt / judge / store / levels` 都是同步的。

**API 照契约，多出来的都是加项**：
- `content.js`：`loadWeek(n)` 返回课程包里的 `week`（`{ id, n, title, days }`，`days` 就是包里的天，带 `a/b/c`）；`daySteps(week, d)` 的 Step 多一个 `meta`：`{ type（包里的 type）, k（科目）, sess, day: { id, n, title, teacher }, scored（计分条目数）, lesson?（语法讲解的行）, passage?（阅读：title titleZh en zh gloss parse）, from?（flash 来自哪些步）}`。Item 的 `meta` 固定有 `{ kind, input, step, scored }`：`kind` 是 IELTS-Base 索引里的种类（`word dict quiz read pair sym write speak lesson`），`input` 是作答方式 `'type' | 'choice' | 'write' | 'read'`；引擎按这两个分派。**id 就是 IELTS-Base 的条目 id**（`w:monday`、`d:w1d1:b1:jawo5t`、`q:w1d1:a3:…`、`q:w1d1:b2:q:…`、`p:cap|cup`、`s:ʌ`、`x:…`、`k:…`），所以证据可以直接并进她的账。另有 `setLoader(fn)`（Node / Electron 自己读文件）、`weekIndex(week)`、`itemOf(id)`、`dayOf(week, d)`、`KINDS`。
- 包里的步 → 关卡步：`symbols / symreview` → **pron**（「哪个词里有 /ʌ/？」：这个音的第一个例词对同一步里相邻三个音的例词，都是包里的词）；`grammar` 且 `k: 'pron'` → **pron**（第 2、3 周的弱读 / 连读 / 重音小测，原题原选项）；`grammar` → **choice**；`words` → **choice**（看到、听到这个词，选中文；干扰项是同一步相邻三个词的中文）；`flash` → **dictation**（听到词、打出来 = 宿主的卡片听写；`meta.typed: true`，`hint` 是中文和音标，B 先显示了提示就算辅助作答，记 `hinted: true`）；`dictation` → **dictation**（整句，宿主的 `dictScore`）；`reading` → **listen**（`tts` 是整篇课文，每题都带，B 一步放一次；问题是包里的题）；`pairs` → **listen**（放词对中的一个，`stableHash(id) % 2` 决定放哪个，两个都是选项）；`write / speak / checkin / weekly / placement` → **lesson**。写句子的条目仍然计分、`judge` 能判（`input: 'write'`，走 gen.js 的 WT），只是步的 kind 先是 lesson、不进解谜关的门；口语、打卡、周复盘、入门小测的条目 `scored: false`。
- `engine.js`：`prompt(item)` 的 `type` 是 `'type' | 'choice' | 'write' | 'read'`；选词义时 `options[].text` 是中文、`zh` 空，其余 `text` 英文、`zh` 中文；听写和拼词的 `text` 是中文指令，句子只在 `tts` 里（听，不看）；拼词多 `hint: { zh, ipa }`。`judge(item, answer)` 固定 `{ ok, why, canonical }`，另给：听写 `pct, zh, toks`（错因 `sp / fw / end / mis` 已译成「拼写 / 弱读小词没听出 / 词尾吞了 / 没听出」）；拼词 `close`（`fdClose` 的「很接近」，可做「我的写法也对」）、`ops`；写句 `claimable, forms, coverage`。选择题的 `answer` 可以是序号、数字字符串或选项原文。没计分的条目 `judge` 返回 `{ ok: true, why: '看完就好，不计分。' }`——**流程不要对它们 `recordFirst`**（store 也会拒绝）。
- `store.js`：`recordFirst({ itemId | item, ok, pct?, day?, at?, hinted?, self?, typed? })`，`day` 默认设备今天、`at` 默认现在（她的手机就在她的时区，和宿主的墙钟一致）；听写请传 `judge` 给的 `pct`（叶子存百分数，和 `core.record` 一样）；返回 `{ first, doc, date, hms, leaf }` 或 `{ first: false }`（当天已有首答）/`{ first: false, reason }`（索引里没有这个条目、没计分、方式不对——`core.record` 也是这样不写）。方式照 `core.js mapEvidence`：课上作答 `L`，打字的词 `T`（提示后 `H`，「我的写法也对」`S`），写句 `W`（自认对 `S`）。`due(week, asOf?)` = `Model.answers` + `Model.memory` 的 `due`（p < 0.6 或上次错），最该复习的在前；没答过的不算到期（它们是「新」的，不是「到期」）。`progress(week, day)` = 这天计分条目里有过证据的 / 全部（单词和它的卡片算一个）。`evidence()` 就是 `{ 'ev-<周一>': { v: 2, it: { 条目: { 日期: { 时分秒: [结果, 方式] } } } } }`，以后交给 `Model.mergeDoc` 并进她的账。另有 `setBackend({ getItem, setItem })`、`KEY`、`reset()`、`hasEvOn()`、`hasAny()`。
- `levels.js`：四个函数都返回 `{ kind, stage: 'tidewater', week, day, title, teacher, gates: [{ id: 'gate:<步>', stepId, kind, title, minutes, items, pos: null }], signs }`；`gates` 是这天每个要作答的步（lesson 步是 `signs`），**步里的条目全在**（复习日 `symreview` 48 个、`flash fromWeek` 150 个是故意的，每道门问几个由 flow.js 定）。`raceLevel` 把 `store.due(week)` 到期的条目排到各自检查点前面、有到期的检查点排前面，`due` 字段给到期的 id；`duelLevel` 多 `rules: { mode: 'zones', teams: 2 }`；`bossLevel(week)` 是整周：每道门多 `phase`（`L` 听力 / 发音、`R` 单词 / 语法 / 阅读、`W` 写句，`S` 口语等语音服务器）和 `day`，按阶段再按天排。

**定下来的、要主会话过目的**：
1. 关卡里的作答写什么方式：选择 / 听辨 / 听写 / 音标记 `L`（它就是这一天的课），打字的词 `T/H/S`，写句 `W/S`。宿主的课里没有「选词义」这种题，考试写的是 `K`；记 `L` 是把关卡当课上作答，排程上没有区别（`Model.memory` 不看方式，只有 `T` 影响「亲手拼对」的落成）。
2. `audio` 一律 `null`、`tts` 带文本：IELTS-Base 的录音是按 `app/audio/index.json` 的 `sets.at` 切片打包在 12 个 mp3 里的，不是一句一文件；接录音是第二阶段，先用设备的 `speechSynthesis`。
3. 没有证据时 `due` 为空，道具赛就按课程顺序；B 如果想要「今天该复习的」还可以直接用 `store.due(week)`。
4. 写句、口语是 lesson 步：解谜关不出门；Boss 战把写句收进 `W` 阶段。要在日关里考写句时，加一种 kind `'write'` 即可（条目和判分都已经有了）。
5. 证据的键是条目 id 和日期，和她账上的格式一样；并账要走 `Model.mergeDoc`（按键并集），本机的 `ev` 文档在 `inkwave:learn:v1` 里，没有和 IELTS-Base 的 `localStorage` 共用——两个 origin 本来也不通。

**验证**：`npm run test:learn`（`node --test tests/learn/*.test.mjs`，22 条：引擎加载和 SOURCE.json 的 sha256、三周 2 000+ 条目每条有中文、w1d1 十步和 id、复习日 48 / 150、听写 / 拼词 / 选择 / 听辨 / 发音 / 写句的判分向量和 why 全中文、当天首答、叶子格式 `Model.validLeaf`、到期、进度、存取、四种关卡），`npm run check` 绿。没开浏览器。

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

## 10. 联机：基于服务器的双人联机赛、双人成形合作赛（业主 10-15 晚）

业主：「还有基于服务器的双人联机赛、双人成形合作赛，完全基于 INKWAVE 这边的源码和风格进行改造。」

- **照 INKWAVE 的联机原样用**（`docs/NET.md`）：房间码、大厅（`G.net.lobby`：名字、队、装备、准备）、房主跑机器人和钟、每人自己模拟自己的人、20 Hz 的 tick 经中继转发、断线由机器人接管、房主迁移——一个字不改。学习的东西作为**新的负载**走同一个信封：`{k:'lq', …}`（出题：房主出、广播题 id 和种子）、`{k:'la', …}`（作答：谁、题 id、对错、用时）、`{k:'lg', …}`（门 / 区域的状态）。模式名进 `lobby.mode`：`'versus2' | 'coop2'`（和 `turf | zones | boss` 并列）。
- **服务器**：INKWAVE 的中继是 Cloudflare 的 Worker + Durable Object（`server/src/index.js`，只做转发）。业主要「基于服务器」——给它写一个 **Node 版**（`server/node/relay.mjs`，`ws` 库，一个进程、一个 Map 的房间），**线格式一字不差**（`b|` `s|to|` `m|from|`、`welcome / join / leave / err / lock / ping-pong`、人数上限 8、锁房、静默踢人、速率限制），能和 IELTS-Base 的同步服务器一起用 docker-compose 跑在业主自己的服务器上（`deploy/`）；页面从业主的服务器打开时自动连它（`relayURL()` 加一条：同源的 `wss://<host>/relay`），`?relay=` 照旧可以指到别处。Cloudflare 那份留着不删。
- **双人**：房间就是现成的；两个人进来、房主选 `versus2` 或 `coop2`、开始。`versus2` 两个人分两队（机器人填位可关）；`coop2` 两个人同一队、没有敌人（像 `puzzle` 的舞台）。单人时 `coop2` 不能开（要两个人），`versus2` 可以和机器人打。
- **风格**：大厅、HUD、结算全用 INKWAVE 自己的样子（墨色、字体、表情、「YEAH」），学习的答题层（`hud-learn.js`）叠在上面；中文照 §1.4。
- **节奏**：竖切片 C（等 A、B 交回后开）：Node 中继 + `versus2` 两个人同一道题的第一版；`coop2` 第二步（两块墨垫 + 拆题）。本机测试：两个 headless 浏览器连本机的 Node 中继（照 `tools/net-test.mjs` 的路子），都在锁里。

## 12. D 交付（2026-10-15，分支 `learn-d`：关卡设计——文档 + 数据 + 测试，不开浏览器）

业主：「关于游戏关卡的设计一定要花大量精力 详细 好玩 充分且精准对应覆盖一切雅思体系化课程」「人物动作什么直接用给你的仓库」。联机的两种（§10）暂缓，只设计单人和带机器人的四种。

- **设计圣经 [LEVELS.md](LEVELS.md)**：§0 原则（好玩的都是真的、内容不减少任务不堆积、证据就是内容、不惩罚、iPhone 先行、全中文、只用 INKWAVE 自己的东西、数据驱动）；§1 覆盖矩阵——课程包 13 种步 × 科目 → 机制 / 形式 / 用 INKWAVE 什么画 / 怎么判怎么记，三周 221 步、2 247 条目、2 202 计分**全覆盖、missing = 0**，考试中心的今日小考 / 周考 L R W S / 满月月考 / 自由练习也各有位置，做不成机制的四样（入门小测、周报生成、口语评分、打卡备注）标「经典页」并写明为什么；§2 四种形式的细则（目标、舞台、放门规则跑在 `G.nav` 上、题 → 效果表、道具 = `SUBS / SPECIALS` 换皮、机器人按 `DIFFICULTY` 三档的「答题」骰子、回炉 = 夯实、星和解锁照课程的 `dayDone`）；§3 三周 × 7 天每一天的表（从数据打印：门、题数、分钟 = 课程的、layout tag 位置、记录方式）+ 复习日的特别设计 + 周考 Boss 四段；§4 第 4–17 周课表每个主题的机制和状态（ready / needs / classic）；§5 手感与演出（squidkid 的 `trigger / setDance`、墨色、相机、CONTRACTS 的音效名、减少动态效果）；§6 数据形状、每日表生成规则、节奏模型、给 A / B / config 的 6 条提案。
- **数据 `src/learn/design.js`**（纯数据 + 纯函数，不碰 DOM）：`MECHANICS`（15 种机制）、`mechanicOf(step)`、`EXAM_MECHANICS`、`SPOTS`（7 张舞台沿路线的 layout tag）、`DAY_PLAN[w][d]`（`{ form, alt, stage, time, minutes, gates, signs, extras }`）、`BOSS_STAGE`、`PROPS / PROPS_OF / PROP_DROP`、`BOT_ANSWER / BOTS_OF`、`EFFECTS / REDUCED / SFX / TRIGGERS / DANCES / BANNERS`、`RULES / RETRY / UNLOCK / STARS / stars()`、`PACE / estimateMinutes()`、`coverage(weeks)`、`dayPlanFor(week, d)`（第 4 周起没有手排表的周按同样规则从课程包现算）、`planDay(week, d, form?)`（A 的关卡克隆 + 设计）、`bossPlan(week)`（听 20 读 20 写 3 句 说 4 问 + 2 句朗读，按 HP 分段）、`quizPlan(week, d, misses)`（8 题）、`freePlan(week, opts)`、`SYLLABUS_MECHANICS`、`dayTable()`。`tools/learn/print-levels.mjs` 把 §3 的表打印出来。
- **A 的 `levels.js` 形状没动**（它的测试照旧）：`planDay` 返回 A 的对象的克隆，加 `form / alt / stage（按天选，不再只是 tidewater）/ time（day | dusk）/ minutes / review / route / rules / props / bots / retry / extras`，每道门和路标多 `design: { mechanic, ask, batch, minutes, at, spot }`；`pos` 仍是 `null`（flow.js 按 LEVELS §2.1 的规则算）。Boss 另有 `bossPlan` 的形状（LEVELS §6.1）。
- **验证**：`tests/learn/design.test.mjs` 8 条（`npm run test:learn` 30 / 30：A 22 + D 8），`npm run check` 187 个文件绿。
- **定了、要主会话过目的**：复习日 150 张卡默认翻牌自评（40 分钟 150 张 = 每张 16 秒，宿主的卡片自测节奏），记 `F` 要 A 的 `store` 加一个参数（LEVELS §6.4 提案 1）；Boss 第一版用课程条目按 EXAM 的题量出题，第二版换 `sched.plan + gen.render`（提案 4）；今日小考是出口后的一轮对抗赛；道具没有一个跳过题（超级跳省路、墨雨记 `H`）；学习关的数字先在 `design.js`，B 接的时候搬进 `config.js` 的 `LEARN`（提案 3）。

## 13. E 交付（2026-10-15，分支 `learn-e`：道具赛、对抗赛、Boss 战三种形式 + 今日小考，建在 B 的解谜切片和 A 的真内容上）

**先切了什么**：`src/learn/api.js` 从替身改成 A 的四件（B 预留的一处切换）。切完露出三处小不兼容，各改一行：`flow.js` 的换问法按「不是选择题」判（A 的 `type` 是 `'type'`，替身是 `'typed'`）、重排选项用引擎自己的选项文本（单词题的选项是中文，原来会把英文答案露出来）、结果卡的到期用关卡带的 `weekRef`（A 的 `store.due` 要周对象）；首答把 `item / pct` 一起交给 `store`；`flow.js` 记下正在问的题（`asking`）给形式和审计读；`hud-learn` 的题型名多认 `type / write / read`。`main.js` 的 `startLearn` 改走 `src/learn/forms/index.js` 的 `buildLearn`。**B 的文件里就这些**（`flow.js` 5 行、`hud-learn.js` 1 行、`match.js` 一个 `kind` 分支、`menus.js` 三个按钮亮起 + 副标）。

**形式各一个文件**（`src/learn/forms/`，都继承 B 的 `LearnFlow`：门的网格、自动走、换问法、墨路、结果卡照用）：
- `race.js` **道具赛**（LEVELS §2.2）：环线 = 出生点 → 对面（B 的拉回点）→ 另一条道回出生点（`common.js loopRoute`：自己的 A*，回程给去路 6 m 内的节点加代价，7 张舞台共享 5–40%）；检查点沿环线按距离放（第一道 ≥ 10 m、间距 ≥ 12 m，放不下的门并进最后一道，题一道不少；到期的排前是 A 的 `raceLevel`）。一站三段：**看板**（`boardOf`：单词的音标和中文、音标的口型 tip 和例词、语法讲解行、课文；钟停、机器人摆 `lobby_pose`、她点「走」；复习日没有）→ **抢跑** → **答题**（她定住 `match.learn.hold`，机器人照跑）。3 个机器人**没有脑子**（`match.js` 不给它们 `BotBrain`），`race.js` 沿同一条环线驾驭它们：到检查点按 `BOT_ANSWER[difficulty]` 掷骰子（延迟 + 橡皮筋 `rubber × min(领先的站数, cap)`），对了小跳继续，错了等 `detour` 秒；先到终点的第一个机器人 feed「X 先到了，没关系」（`xp_tick`）。她答对：门开、墨路铺到下一站、`PROP_DROP.race` 掉道具进 3 格的道具袋（HUD 右侧，点或按 F / Q 用）；连对 3 护盾、连对 5 墨道（到下一站的路全涂）。第二次错：门开但**绕路** = 在门前等 8 秒（HUD「绕路中 … n 秒」，第一版没有铺另一条长道，LEVELS §2.2 已改），护盾免；条目进回炉队列；终点前**回炉门**把它们换一种形式再问一次（带 `relearnTip`：口型 tip、讲解、两个词都放、慢放）。道具：超级跳 = `actor.superJump` 到下一站前 3 个节点（题照出）、墨雨 = 下一题给中文提示并记 `hinted → H`、回声 = 1.9 秒后再放一遍、墨幕 = 后面的机器人停 3 秒、墨弹 = 最近的机器人停 3 秒。名次只是奖杯（`inkwave:learn:design:v1` 的 `trophies`），星按学习算。
- `duel.js` **对抗赛**（§2.3）：舞台用 zones 版几何；一道门一轮。**备战**（轮间，`match.paused`）：展板学下一步 → 「开始这一轮」；每轮新建一个中央区域的 `ZoneControl`（`final = true`、`nextSwap = ∞`：不轮换、没有「最后 30 秒」；区域擦干净、两边 100），轮时 = 门的分钟夹在 60–300 秒；题按 `askGap` 节奏来，答题时她定住但**倒数照走**、队友和对面照打；答对 → `zonePlan().hotspot` 最缺的那块 `paint.flood` 2.5 m（连对 +0.5，上限 4.5）+ 特殊 +15，连对 3 特殊槽满并给护盾、连对 5 跳 1 秒舞；答错不掉墨，换问法再来，第二次进回炉（护盾：对面下一次「答题」作废）。对面 4 个机器人照 zones 的脑子打，另外每 `duelCadence` 秒掷一次骰子，对了泼 `duelFlood` m；她的 3 个队友不答题。`match.endZones` 被接管：击倒只结束一轮；倒数到 0 也只是一轮；她答完题轮就结束。轮末 `times_up → judge_drumroll → judge_reveal` + 横幅；最后一轮之后回炉轮；结果卡写赢了几轮（奖杯）、首答、回炉、星。**今日小考**（§1.2）：`kind: 'quiz'`——`quizPlan` 的 8 题一轮、她 + 1 对 2（`match.js` 认 `opts.learn.sides`），解谜的结果卡第 1–6 天多一个「今日小考」按钮（`forms/index.js` 听 `learn:done` 挂上去；复习日没有）。
- `boss.js` **Boss 战**（§2.5）：`bossPlan(week)` 的四段 L / R / W / S = 四道门；小队 = 她 + 3（`LEARN.boss.squad`），HULLBREAKER、`BossMode`、`bossBrain` 原样跑，**只有她的答案伤它**：`boss.applyDamage` 在实例上包一层，小队和她自己的子弹只让模型闪一下。题在 Boss **两招之间**出（空闲：可见、没有招、不在吼、不无敌），答题时 `match.paused`（Boss 只在她答完后才出招）；答对 = 一次弱点命中 `applyDamage(她, 段 / 题数 × maxHp, weak)`（HUD 的条、碎屑、数字、66 / 33% 的阶段切换都是 Boss 自己的；L / R 一题 1/20 段，W 的 3 句各三分之一，S 的 6 张卡各六分之一）；答错 → `brain.force` 这一段的一招 + `cool = 0`，她躲 3 秒再来下一题（换问法；第二次进回炉）；连对 3 特殊槽满、连对 5 逼它冲撞（撞墙 = 眩晕）。每段有预算（`LEARN.boss.phaseTime` 14 / 14 / 10 / 6 分钟，只在 Boss 动的时候走），到了「这一段的时间到了，剩下的留到另一天」、Boss 落到段底换段；S 段是卡片（问题 + 范例 + 句型，「说完了」= 一击，不计分、不记证据，标「评分等语音服务器」）。打死后 4 秒出结果卡（局 `paused` 住，INKWAVE 自己的 Boss 结算不来抢）：每段首答对几 / 几、时间到跳过几题、用时（奖杯）。
- `common.js`（纯，Node 可跑）和 `ui.js`（道具袋、一行提示、名次表、Boss 段条、看板 / 备战 / 口语卡、结果卡的附加行；样式从 JS 注入，没动 `hud.css`）。

**数字**：全在 `config.js LEARN`（`gate / race / duel / boss / quiz / bots / props / streak / relearnMax / starsKey`），`design.js` 只读它（LEVELS §6.4 提案 3 完成）。

**怎么开**：菜单 学习 · LEARN → 选周 / 天 / 形式 → 开始；或 `?learn=w1d2&kind=race`、`?learn=w1d6&kind=duel`、`?learn=w1&kind=boss`、`?learn=w1d1&kind=quiz`；`&short=1` 是审计用的短关（两道门各两题、钟 60 秒）。

**验证**：`npm run test:learn` 43 / 43（A 22 + D 8 + B 5 + E 8：夹具图和 **7 张真舞台的 nav 图**（Level + Physics + NavGraph 在 Node 里建）上环线两条道不同、不进对面出生区、检查点放得下；骰子、橡皮筋、名次；掉落表不出护盾 / 墨道、袋满不掉；半径到上限；HP 段、每题掉血、预算 2640 秒；回炉去重上限 12、星只涨；判分映射、展板、提示、短关）；`npm run check` 199 文件绿。headless（`tools/learn/play-forms.json` + `drive-forms.js`：第一题故意错、其余答对，答案从 `flow.asking` 读）：三条都在 `&short=1&quality=low&fast=1`（审计脚本一建好关卡就 `debug.freeze`，`_skipRender` 下连跑 `_frame(1/60)` 推模拟——软件 GL 下 4v4 一帧要几秒，测的是规则不是渲染）：
  - **道具赛** `?learn=w1d2&kind=race`（十字市场）：环线 77 / 78 节点、共享 5.3%、一圈 171.6 m；两块看板点「出发 / 走」；音标门第一题故意错 → 「换个问法」再对、单词门两题对；每答对掉一个道具（袋里 `curtain, echo, curtain`，连对 3 护盾）；两道门开、墨路铺到下一站（涂了 8%）；`learn:finish`（第 1 名）→ `learn:done` → 结果卡「4 / 4 题做对 · 第 1 名 · 3 / 4 首答答对 · 星星 0 → 1」；证据写进 `ev-2026-10-12`；无控制台错误。
  - **对抗赛** `?learn=w1d6&kind=duel`（集装箱码头，zones 几何，8 人）：两轮备战板 → 开始；第一题错不掉墨、换问法再对；每答对区域份额涨（我方 0 → 0.062 → 0.201 → 0.22 → 0.391，对面按节奏「答题」到 0.309）、特殊 +15 → +15 → 连对 3 满（190）并给护盾（袋里 `echo, shield`）；轮按「题答完」结束（60 秒的短轮没人占到 80%，100 / 100）；`learn:ink` × 5、`learn:round`、`learn:done`；结果卡「0 / 2 轮赢（奖杯）· 3 / 4 首答 · 星 0 → 1」；`inkwave:learn:design:v1` 写了 `stars.w1d6 = 1、trophies.w1d6 = "0/2"`。
  - **Boss 战** `?learn=w1&kind=boss`（海滨广场傍晚，她 + 3）：第一题错 → `learn:bossMove`（slam）、躲 3 秒 → 下一题；答对 HP 1 → 0.83 → 0.66（Boss 进第 2 阶段）→ 0.495 → 0.33（第 3 阶段）→ 0.215 → 0.1，`learn:bossHp` 每击；W 段两句写句（`WT`）都判对；S 段两张卡「说完了」= 最后两击 → 打死 → 4 秒后结果卡「第 1 周周考打完了 · L 首答对 1 / 2 · R 2 / 2 · W 2 / 2 · S 2 / 2 张说完了 · 用时 0:30」；局停在 `finish`（INKWAVE 的 Boss 结算没来抢）；无控制台错误。
  - 手机 390 × 844 `--touch`（道具赛，`&nofullscreen`）：触屏模式起、竖屏不弹「转过来」、看板卡占下半屏、「听」按钮和「出发」键 ≥ 44 px；截图看过后按路径删了。

**没做的 / 要主会话过目的**：绕路第一版是等 8 秒不是长道；对抗赛的「1 minute left!」/ 倒数是 INKWAVE 自己的英文横幅；Boss 的音乐导演（`bossAudio.js` 只认 `match.mode === 'boss'`）在学习局里不起、吼声 / 脚步照有；Boss 第二版的 `sched.plan + gen.render` 场景题和估分没做；复习日的快闪翻牌（F 方式）仍按卡片打字问；写字墙 / 回声亭 / 打卡垫作为路标还没有 3D 位置（结果卡上也没列）；写句（W 段）用的是单行输入框；机器人在舞台楼梯上的卡住用「1.6 秒不动就跳 + 下一个节点」兜底。

## 15. G 交付（2026-10-16，分支 `learn-g`：游戏壳中文化 + 学习关的收尾打磨）

**中文化**（业主今天发版，先做的这一条）：
- **字典 `src/ui/i18n.js`**：一张表 `键 → [English, 中文]`（约 400 条），`t(key, vars)` 取当前语言、`{name}` 占位；`LANG` 默认 `'zh'`，**`?lang=en` 是 INKWAVE 原来的英文**（英文一字没改，就是原来的字符串）。`gameName(kind, id, en)` 给武器 / 副武器 / 特殊武器 / 舞台 / 难度 / 段位的中文名，`teamName()` 给墨色队名（橘子队、钴蓝队…），`TIPS_ZH` 是载入页的小贴士（讲关卡的，不是翻译涂地赛的贴士）。有 `document` 时把 `<html lang>` 设成 `zh-CN` / `en`。纯模块，Node 能 import。
- **改成走字典的**（不散改字符串，原来的英文都进了表的第一列）：载入页（`main.js` 的进度字、TIP）、标题页、主菜单（对战 / 联机 / 学习 · LEARN / 回课本 / 装备 / 换装 / 设置 / 怎么玩 / 制作人员、各项说明、段位、胜场、经验、当前装备）、学习屏（第几周 / 第几天）、暂停菜单、设置（四页每一项的名字和说明、开 / 关、恢复默认、右边的实时预览的说明）、怎么玩（规则卡、按键表）、制作人员、装备 / 换装的标题；HUD（`hud.js`：准备好了吗？/ 开始！/ 还剩 1 分钟！/ 时间到！/ 一举拿下！、耶！、墨不够了、区域的「我们占住了！」等、罚分、裁判、被击倒的卡、连杀、阵容、超级跳的地图）、Boss 的 HUD（`hud-boss.js` + `boss-art.js`：破船巨蟹、锈壳里的大怪物、第 2 阶段！/ 壳裂开了！、暴怒、破绽！、弱点！、招式名、打沉了！；学习局的标题卡写「周考」不写「公测」）、击倒的信息条（`main.js`）、触屏键（跳 / 潜墨 / 地图 / 耶）、竖屏提示条（`touch.js`）。INKWAVE 的「更新了什么」卡片（`news.js`）是英文的产品新闻：中文壳、`?learn=`、`?from=app` 都不弹。默认的玩家名 `Player` 在主菜单上显示为「我」（存的值不变：它是外观的种子）。
- **学习局的暂停菜单**（`menus.js _scr_pauseLearn`）：原来学习局暂停时右边是涂地赛的面板（剩余时间、涂地、击倒、队伍）——换成这一关自己的：学习关卡 · 解密闯关（或道具赛 / 对抗赛 / Boss 战 / 今日小考）、第几周第几天、舞台中文名和这一天的题目、门（轮 / 段）几 / 几、答对、首答、锁；三个按钮：继续 / 设置 / 离开这一关。
- **字体**：Titan One、Rubik 没有汉字。`styles/ui.css` 末尾给 `'Titan One'` 加了一个只管汉字的别名（`unicode-range` 指到系统的粗黑体：苹方中粗、冬青黑体 W6、思源黑体 Bold、微软雅黑 Bold），拉丁字母还是原来的 Titan One；中文时描边细一点（`.13em`）。
- **测试** `tests/learn/i18n.test.mjs`（5 条）：每个键都有英文和中文、占位符两边一致、`TIPS_ZH` 全中文；Node 里默认中文；每把武器 / 副武器 / 特殊武器 / 舞台 / 墨色队名 / 难度都有中文名；**扫描**她会经过的代码（`menus.js` 的载入 / 标题 / 主菜单 / 学习屏 / 暂停 / 设置 / 怎么玩 / 制作人员和共用的控件、设置行、`hud.js`、`hud-boss.js`、`hud-learn.js`、`forms/ui.js`、`touch.js` 的触屏键和竖屏条、`boss-art.js` 的名字、`menu-art.js` 的设置预览、`main.js` 的进度字和击倒信息）里不经过 `t()` 的英文字符串，白名单只有键名（Enter / Esc / TAB…）和专名（INKWAVE、字体、作者、许可证）；再一条确认扫描会咬人。

**没有中文化的**（不在她的路上，或者归 F）：联机大厅的几屏（`_scr_online` / `_scr_lobby`，F 在改，照约定没动）、对战的选模式 / 选舞台、装备 / 换装屏的内容（武器卡、外观项）、INKWAVE 自己的结算屏（学习关不走它，结果卡是 `hud-learn.js` 的中文卡）、机器人的名字（Squiddo、Nori… 是名字）。

