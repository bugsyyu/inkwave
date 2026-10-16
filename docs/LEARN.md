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
| 录音（课程、考试人物） | `app/audio/`（100 MB） | 不进 git：游戏装在她 App 的 `app/game/` 下，运行时按 `../audio/index.json` 找分片和偏移、Range 取这一段（§16 `src/learn/audio.js`）；没有就用设备的声音（`speechSynthesis`） |
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
2. `audio` 一律 `null`、`tts` 带文本：IELTS-Base 的录音是按 `app/audio/index.json` 的 `sets.at` 切片打包在 12 个 mp3 里的，不是一句一文件；接录音是第二阶段，先用设备的 `speechSynthesis`。（H 接上了：放的时候按 `tts` 的文字去找，`audio` 仍是 `null`，见 §16。）
3. 没有证据时 `due` 为空，道具赛就按课程顺序；B 如果想要「今天该复习的」还可以直接用 `store.due(week)`。
4. 写句、口语是 lesson 步：解谜关不出门；Boss 战把写句收进 `W` 阶段。要在日关里考写句时，加一种 kind `'write'` 即可（条目和判分都已经有了）。
5. 证据的键是条目 id 和日期，和她账上的格式一样；并账要走 `Model.mergeDoc`（按键并集），本机的 `ev` 文档在 `inkwave:learn:v1` 里，没有和 IELTS-Base 的 `localStorage` 共用——两个 origin 本来也不通。（游戏进了她 App 的 `app/game/` 以后是同一个 origin 了：H 把它们并进工作台自己的键，见 §16。）

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

## 14. F 交付（2026-10-16，分支 `learn-f`：Node 中继 + 双人联机赛 `versus2` + 双人成形合作赛 `coop2`，§10 的落地）

**中继**（`server/node/relay.mjs`，零依赖）：和 Cloudflare 版（`server/src/index.js`，留着没动）一字不差的线协议——`b|` / `s|to|` / `m|from|`、`welcome / join / leave / err`（关 4000）、房主的 `lock`、`"ping"` → `"pong"` 和 `{t:'ping',c}` → `{t:'pong',c}`、8 人、房主 = 最早进来的、静默踢人（比赛 20 s / 大厅 150 s，关 4001）、单条 64 K 字符、速率三振（关 4008）、同一条 Origin 规则。**为什么手写 WebSocket**：全局 `NODE_PATH`（`/opt/node22/lib/node_modules`）里没有 `ws`，仓库不 `npm install`；于是握手、掩码、16 / 64 位长度、分片重组、ping 帧回 pong、不协商扩展都写在 `node:http` 上（~200 行），业主的服务器只要 `node`。一个进程、一个 `Map` 的房间（空了就删）。加项：`/relay/room/<CODE>`（反向代理后的同源路径）、`RELAY_ORIGINS`（再加页面来源，`*` = 都行）、中继自己的 host 发来的页面总是放行、`--silent-match` / `--silent-lobby`（默认就是 Worker 的 20 s / 150 s，只给页面真会卡那么久的机器用——这台没有 GPU 的容器就是）、踢人时打一行日志。
- **怎么起**：`node server/node/relay.mjs [--port 8787] [--host 0.0.0.0]`（`npm run relay-node`）；`server/node/README.md` 一段：怎么起、nginx `location /relay/` 片段、`?relay=`。
- **客户端怎么指过去**（`src/net/transport.js relayURL()`）：`?relay=` 照旧最优先；本机 / 局域网照旧 `ws://<host>:8787`（Node 中继起在 8787 就直接能用）；公开站点（`*.pages.dev`）、Vercel（`*.vercel.app`，`tools/release.sh`）、GitHub Pages 和桌面版照旧连 Worker；**其它 host（业主自己的服务器）连 `wss://<host>/relay`**。
- 没做：§10 说的 `deploy/` 里和 IELTS-Base 同步服务器一起的 docker-compose——README 里只有 nginx 片段。

**房间**（INKWAVE 的大厅原样，只加项；`src/net/session.js`、`src/ui/menus.js`）：`lobby.mode` 多 `'versus2' | 'coop2'`（session 里四处原来把不认识的模式变成 `'turf'` 的地方都认了）；`lobby.learn = { week, day }`（房主在「课 · LESSON」一行选：第 1–3 周 · 第 1–7 天，只在两种学习模式出现，跟着大厅广播；`short` 是审计的短局）；MODE 箭头多两种，名字中文（「双人联机赛」「双人合作赛」，§1.4）；`coop2` 像 Boss 一样锁住队伍（大家一边）和机器人；`versus2` 的时长锁成 Zone Control 的 5:00；`startBlock()`：`coop2` 不是正好两个人就不能开（「双人合作赛要两个人：把房间码发给另一个人」），`versus2` 一个人也能开（和机器人打）。开局的 `start` 记录多 `learn: { week, day, kind, short }`；每个客户端在 `main.startNetMatch` 里用同一份课程内容建同一关（`forms/index.js buildNetLearn`：`versus2` = 当天的对抗赛计划、`coop2` = 当天的解谜计划；舞台是大厅选的，不是计划里的）。

**线上的学习负载**（同一个信封，`{k:'l…'}`；`NetMatch` 交给 `match.learn.onNet(from, d)`，比赛还在建时先存着、`bind()` 时交）：`ls` 题队列（房主 → 大家：迁移后的新房主照着接着出）· `ld` 访客的到期条目 → 房主 · `lq` 出题（`q, i, id, alt, n, total, sec`；coop2 多 `g, clue, hands`）· `la` 作答（versus2 → 房主：`ok, ms, none`；coop2 → 大家：`ok, why, canonical, first`）· `lr` 谁的墨、涂在哪（versus2：`win, by, name, z, at, r`）· `lc` 关题（versus2：`res: [[pid, 1|0|-1]…]`）· `lg` 门的状态（coop2：`ask / open`）。都是房主当裁判，和钟、区域一样。

**`versus2` 双人联机赛**（`src/learn/forms/versus2.js`；`Match.mode` 就是 `'zones'`，`learnKind: 'versus2'`——INKWAVE 的开场飞镜头、Zone Control 规则、HUD、加时、击倒、裁判、结算全照用，学习层叠在上面）：
- 题：当天对抗赛计划的门**轮流**取（不会只出前两步），前面先放两个人**合并后的到期条目**（`duo.js mergeDue`：按位置比例交错，谁的到期列表长谁的题多，同一条只出一次；最多一半），一局 12 题（短局 2 题）。
- 同一道题（`lq`）同时出给两个人；每个人在自己的屏幕上答，**首答进自己的 store**（`recordFirst({ item, ok, pct })`，不计分的 store 自己拒）。
- **先答对**按每个人「题出现在自己屏幕上起」的用时比，房主收到第一个对的答案后等 0.4 s 宽限（房主到自己是零延迟，按到达先后它就总赢）；赢的那边：房主取那一边最缺的地方（`zonePlan().hotspot`，对抗赛的同一套）、按连对算半径（`duelFlood`），广播 `lr`，**每个屏幕自己 `paint.flood`**（flood 不走复制）；答对的人特殊 +15、头上冒 INKWAVE 自己的「YEAH!」（`G.specials.cheer`）、连对 3 / 5 的庆祝照对抗赛；**答错掉三成墨罐**（§4 的「答错的掉墨」）。慢的那个人照样答完（自己的证据），对面先答对时只告诉他「X 先答对了」，不露答案。
- 没有人的那一边（一个人开、机器人填）用机器人的骰子（`BOT_ANSWER`，对抗赛那一套）答；没开机器人就没人跟他抢。
- 都答完或到时间（选择 20 s / 打字 30 s）关题（`lc`），没人答对的换个问法再来一次；3 s 后下一题。题出完房主按区域计数叫停（`Z._end(…, 'answered')`，跟着 `ze` 记录到每个屏幕）；击倒、时间 + 加时照 INKWAVE 先结束也行。
- 结算：INKWAVE 自己的 VICTORY / DEFEAT、区域计数、原因「题都答完了 · 区域领先」，下面一条「双人联机赛 · 第 n 周第 d 天 · k 题」：每个人先答对几题、答对几 / 几，和「你的当天首答 n 题（答对 m），记进了这台设备上你自己的进度」。

**`coop2` 双人成形合作赛**（`src/learn/forms/coop2.js`，继承 B 的 `LearnFlow`：同一条路线上的门、门环 / 锁 / 光柱、墨路、自动走、换问法、结果卡；`Match.mode 'learn'`，两个人都在 0 队，没有敌人、没有钟）：
- **两块墨垫**：每道门在路线两侧各一块（`padNodes`：门所在节点横向 2.4 m，贴到导航图上；太窄——桥、楼梯、墙边、水边——就放在路线本身门前门后，回头坡上再往前，保证两块分得开）；房主看两个人的位置，两块都有不同的人站着 0.4 s → 广播 `lg ask`，两边同时开始出题。自动走会把你带到你自己那块（房间的进人顺序：房主 0 号、另一个 1 号）。
- **题拆两半**（`splitPrompt`）：一个屏幕是「线索」——题干、中文、▶ 录音，**没有作答**（「你听得到：把听到的念给队友（一个字母一个字母拼也行），队友来打字」「你看得到题目：讲给队友听，队友来选」）；另一个屏幕是「作答」——输入框 / 选项，**没有录音、没有题干、没有中文**（「队友听得到录音：听队友说，把它打出来」）。角色每题互换。作答的人判分，判定（对错、为什么、正确写法）两边同时显示。
- 答错：门上一道锁，这道题换个问法排回队尾，**交给另一个人答**；再错照 B 的规矩给答案走人。门的题都过了 → 两边同时开门，**只有房主倒墨路**（它的 splat 走复制，两边都看得到；两边都倒就是两遍）。
- 证据：**每台设备只记它自己的人亲手作答的那题**（作答的一方；角色互换，一道门下来两个人都有首答，各记各的 store）。
- 最后一道门 → B 的结果卡两边都出：「两个人一起走完了！」、两个人一起答对几 / 几、你来答的几 / 几、你讲给队友的几题、你的首答；房主的「回到房间」（30 s 后自己回），访客「等房主回房间」，「离开房间」。队友中途离开 → 「队友离开了房间 · 双人合作要两个人」，直接结果卡。

**纯函数**（`src/learn/forms/duo.js`，Node 能跑）：`mergeDue · spreadGates · buildQueue · canRequeue · answerTime · Referee（open / answer / leave / tick → ink / close）· settle · tally · rolesFor · splitPrompt · padSpots · padNodes · padsApart · padsHeld · LEARN_WIRE · validQ`。数字在 `config.js LEARN.versus2 / LEARN.coop2`。E 的 `common.js`（`botRoll`、`duelFlood`、`streakKind`、`judgeAnswer`、`rightAnswerOf`、`shortenLevel`）和 `duel.js` 的 `zoneCellsXYZ`（改成导出）直接复用。

**B / E 的文件里改了什么**：`flow.js` 自动走 3 行（一帧超过 1/45 s 时局面分两个子步，第二个子步把第一个子步自己写的移动当成玩家推了摇杆、把自动走关了——慢手机上也会；现在记住自己写的移动）；`hud-learn.js` 认一种 `type: 'clue'` 的卡（没有作答，只有一行说明）；versus2 把 B 加在触屏层上的 `is-learn` 去掉（那个类藏了开火 / 副武器 / 特殊 / 欢呼四个键——单人关卡里答题是唯一的动作，可 versus2 是一局真的 Zone Control；E 的单人对抗赛照旧藏着）；`duel.js` 一个 `export`。`match.js`：`learnKind` 认 `versus2`（mode `zones`）/ `coop2`（单人式 solo），`_setupRoster` 末尾按 `o.learn.Flow` 建学习层；`netmatch.js`：`l…` 负载路由 + 缓冲；`main.js`：`startNetMatch` 建关、`netMatchGo` 对 solo 直接亮 HUD、`_judge` 把 `learn` 数据交给结算。

**测试**：`npm run test:learn` 59 / 59（原来 43 + `relay.test.mjs` 8 条：HTTP 路由、建房 / 进房 / 拒绝、转发、锁房 / 满员 / 房主迁移、Origin、静默 / 超长 / 刷屏、手写帧、可配的静默时限——真 socket、Node 自带的 WebSocket 客户端；`duo.test.mjs` 8 条：合并到期 / 题队列、裁判（按自己用时不按到达、宽限、骰子、超时、离开）、结算、拆题（作答那边看不到要答的英文）、墨垫在夹具和 **7 张真舞台**的导航图上）；`npm run check` 206 个文件绿。

**两个 headless 浏览器的实测**（`node tools/learn/net-duo.mjs --mode versus2|coop2 [--lobby]`：自己起 Node 中继和文件服务，两个 Chromium，`?quality=low`、阴影 / 泛光关、400 × 225；都在 `flock /tmp/ielts-browser.lock` 里一次一个，每次 ≤ 3 分钟）：
- 这台机器没有 GPU：两个浏览器同时开机 72–80 s；比赛的**第一次 `paint.flush` 在每个页面上卡 ~48 s**（SwiftShader，换不换舞台都一样）——所以页面开机后就冻结（建房、开局、建关、ready / go 只靠消息和定时器），比赛按 1/24 s 一帧分小块步进（不超过 2 倍实时：一个步进的客户端每模拟 1/20 s 发一个 tick，中继限速 90 条 / 秒），中继起成 `--silent-match 150000`；INKWAVE 的裁判动画走 HUD 自己的 rAF 时钟，结束后把它的调试倍速（`hud.timeScale`）开到 25。前几次没有这些时，中继按规矩把两个卡住的页面踢了（日志「timed out (silent 24 s)」）——中继是对的。
- **versus2**（第 1 周第 1 天短局，1 对 1 不开机器人）：建房 78 s（两人同房、访客看到 `versus2 · w1d1`）→ 两人进关 83 s（同一关、两个角色、0 / 1 队）→ 同一道题（`s:iː`，选择）两边相隔 15 ms 出现 → 第 1 题访客先答（按自己的时钟快 1.5 s），房主后答但先到裁判——**墨归访客** → 第 2 题房主答对、访客答错 → 墨归房主 → 两边区域份额一样（`[0.092, 0]`）→ 题答完房主叫停（`answered`，平手按份额判给 0 队）→ 两边 INKWAVE 的结算 + 学习条（「Ann 先答对 1 · 答对 2 / 2；Bo 先答对 1 · 答对 1 / 2」）158 s；两边的首答各进各的 `ev-2026-10-12`；无控制台错误。
- **coop2**（同一天，两道门各两题）：两人自动走到各自的墨垫（129 s，前面那 48 s 是 flush）→ 房主宣布、两边同时出题 → 5 题全部拆成两半（线索那边没有作答、有录音的题录音只在线索那边；作答那边 4 个选项、没有录音）→ 第一题作答的人答错 → 两边都显示判定、门上一道锁 → 换个问法交给另一个人答对 → 两道门两边都开 → 两边的结果卡（165 s）；首答各记各的（3 / 2 条）；无控制台错误。
- **大厅**（`--lobby`，800 × 450）：两边都是 INKWAVE 的房间屏；房主点 MODE ▶ 三下到「双人联机赛」→ 两边的 MODE 都变、「课 · LESSON」一行出现（只在学习模式）、时长锁成 5:00 + OVERTIME；房主在自己屏幕上点「第 2 周」「3」→ 访客的大厅数据和屏幕都是第 2 周第 3 天；再 ▶ 到「双人合作赛」→ 两边队伍和机器人都锁住、两个人可以开；访客走了 → 房主的「开始」变成「双人合作赛要两个人：把房间码发给另一个人」。截图看过后删了（窄屏上「课」一行的 7 个天数按钮挤，能点）。

**拿不准、按 §1 的顺序自己定的**：
1. coop2 的「两个人都答过才算当天首答，各记一份」：按 §1.2（证据就是内容）定成**每台设备只记自己亲手作答的题**，角色每题互换、答错换人再答，一道门下来两个人都有首答；没有把「线索」那一方也记一份（他没有作答）。要「两个人每题都记」就得每题问两遍（各当一次作答）。
2. versus2 的「答错的掉墨」照 §4 做成掉三成墨罐（LEVELS §0 的「不惩罚」管的是学习，墨罐是游戏的）；不动证据。
3. versus2 就是一局 INKWAVE 的 Zone Control（5:00 + 加时，击倒照样结束），题答完就按计数叫停；没有像单人对抗赛那样一门一轮、轮间备战板（两个人的房间没法停钟等一个人看板）。
4. 先答对按「各自屏幕上的用时」比 + 0.4 s 宽限，用时是客户端自己报的（朋友之间，不防作弊）。
5. 线上的两种用大厅选的舞台，不用当天计划的舞台；versus2 用当天的对抗赛计划出题、coop2 用当天的解谜计划。

**没做的**：`deploy/` 的 docker-compose；coop2 的**墨罐共用**（§4 表里「一个人喷光了另一个人得去充」）；coop2 的「一个人看中文、另一个人看英文」只按题目自带的方向拆（中→英的题线索那边是中文、作答那边是英文选项；没有另做一套英→中）；versus2 在房主迁移时丢掉正在问的那一题（新房主从下一题接着出）；两种模式都只在 1 对 1 / 2 人测过，没测机器人填位的 versus2、断线、房主迁移；手机竖屏没截图；Electron 版照旧连 Worker。

## 15. G 交付（2026-10-16，分支 `learn-g`：游戏壳中文化 + 学习关的收尾打磨）

**中文化**（业主今天发版，先做的这一条）：
- **字典 `src/ui/i18n.js`**：一张表 `键 → [English, 中文]`（约 450 条），`t(key, vars)` 取当前语言、`{name}` 占位；`LANG` 默认 `'zh'`，**`?lang=en` 是 INKWAVE 原来的英文**（表的第一列就是原来的字符串，一字没改）。`gameName(kind, id, en)` 给武器 / 副武器 / 特殊武器 / 舞台 / 难度 / 段位的中文名，`teamName()` 给墨色队名（橘子队、钴蓝队…），`TIPS_ZH` 是载入页的小贴士（讲关卡的，不是翻译涂地赛的贴士）。有 `document` 时把 `<html lang>` 设成 `zh-CN` / `en`。纯模块，Node 能 import。
- **走字典的**（不散改字符串）：载入页（`main.js` 的进度字、小贴士）、标题页、主菜单（对战 / 联机 / 学习 · LEARN / 回课本 / 装备 / 换装 / 设置 / 怎么玩 / 制作人员、各项说明、段位、胜场、经验、当前装备，INKWAVE 的副标题「泼墨大乱斗」）、学习屏（第几周 / 第几天）、暂停菜单、设置（四页每一项的名字和说明、开 / 关、恢复默认、右边实时预览的说明、难度说明）、怎么玩（规则卡、按键表）、制作人员、装备 / 换装的标题；HUD（`hud.js`：准备好了吗？/ 开始！/ 还剩 1 分钟！/ 时间到！/ 一举拿下！、耶！、墨不够了、区域播报「我们占住了！」等、罚分、裁判、被击倒的卡、连杀、阵容、超级跳地图）；Boss 的 HUD（`hud-boss.js` + `boss-art.js`：破船巨蟹、锈壳里的大怪物、第 2 阶段！/ 壳裂开了！、暴怒、破绽！、弱点！、招式名、打沉了！；学习局的标题卡写「周考」不写「公测」）；击倒的信息条（`main.js`）；触屏键（跳 / 潜墨 / 地图 / 耶）和竖屏提示条（`touch.js`）。INKWAVE 的「更新了什么」卡片（`news.js`）是英文的产品新闻：中文壳、`?learn=`、`?from=app` 都不弹。默认的玩家名 `Player` 在主菜单上显示为「我」（存的值不变：它是外观的种子）。关卡里 HUD 的钟一行显示（「第 1 周 · 第 1 天」原来在钟里折成两行）。
- **学习局的暂停菜单**（`menus.js _scr_pauseLearn`）：原来学习局暂停时右边是涂地赛的面板（剩余时间、涂地、击倒、队伍）——换成这一关自己的：学习关卡 · 解密闯关（或道具赛 / 对抗赛 / Boss 战 / 今日小考）、第几周第几天、舞台中文名和这一天的题目、门（轮 / 段）几 / 几、答对、首答、锁；三个按钮：继续 / 设置 / 离开这一关。
- **竖屏**（她竖着拿手机从 App 进来）：`styles/ui.css` 末尾的竖屏段给**主菜单、学习屏、设置、学习局的暂停**一列的版式（按钮全宽、字 ≥ 15 px、热区 ≥ 44 px、键盘提示条藏起来）；`touch.js` 的「把手机横过来」条只盖其它 INKWAVE 屏（选模式、装备、换装、联机…，它们还是横屏的版式）。`?from=app` 时主菜单的第一个大按钮是「学习」、下面是「回课本」。
- **字体**：Titan One、Rubik 没有汉字。`styles/ui.css` 给 `'Titan One'` 加了一个只管汉字的别名（`unicode-range` 指到系统的粗黑体：苹方中粗、冬青黑体 W6、思源黑体 Bold、微软雅黑 Bold），拉丁字母还是原来的 Titan One；中文时描边细一点。

**今日小考**（E 只代码审过）：`?learn=w1d1&kind=quiz&short=1` 和**解谜结算卡上的「今日小考」按钮**都在 headless 里跑通了。修的：审计脚本等结果卡原来按墙钟 8 秒，软件 GL 下一模拟秒要好几秒墙钟，结果卡（`finishT` 1.4 秒）还没到就超时——改成按模拟时间等；小考原来把结果写进这一天的星星（2 题的短考也能给 w1d1 一颗星）——现在只记 `w1d1:quiz` 的奖杯，结果卡不显示星、写「小考不算这一天的星星」和「课上答过的再答只算练习」；小考的备战板写「今日小考 · 傍晚一轮对抗赛」而不是「备战 · 第 1 / 1 轮」。`tools/learn/play-quiz-chain.json`：解谜短关 → 结果卡的按钮 → 8 题的 2 对 2（傍晚、zones 版舞台）→ 结果卡。

**Boss 的音乐**：`bossAudio.js` 的 `isBossMatch(m)` 认 `mode 'boss'` 和 `mode 'learn' + learnKind 'boss'`，周考里 `battle / battle_final` 也路由到 Boss 的曲子，阶段切换 `boss → boss_2 → boss_3`，打沉时收。headless 里看了 `G.music.play` 的请求序列：`boss · battle→boss · battle_final→boss · boss_2 · boss_3 · null`。

**复习日快闪翻牌**（LEVELS §1.1 / §3.1，原来是打字卡）：复习日 150 词那一步（`mechanic 'flash-flip'`）在解谜、道具赛、对抗赛里都是**翻牌**：正面中文 →「翻过来」→ 背面英文、美音音标、自动读一遍 →「记得 / 不记得」（键盘：空格翻、1 / 2 评）。自评记证据方式 **`F`**：`store.recordFirst` 加了 `how` 参数（`Model.MODES` 里有 `F`；IELTS-Base `core.js mapEvidence` 的「看词自评」就是 `[ok ? 1 : 0, 'F']`；不在 `MODES` 里的方式什么也不写）。「不记得」不上锁、不绕路，马上换成打字卡再来一次（当天首答已经是那个 `F`，打字只算练习），打字再错照常换问法、进回炉。`forms/common.js` 的 `isFlipGate / flipPrompt / flipJudge / cardFor` 三种形式共用；`hud-learn.js` 画卡。审计加了 `?gate=N`（短关从第 N 道门开始，复习日翻牌是 `&gate=3`）。

**E 没做的、这次做了的**：Boss W 段写句的输入框是**三行的 `<textarea>`**（一整句在眼前；回车提交、Shift+回车换行）；空答案不再能提交（原来只拦替身的 `'typed'`，A 的听写是 `'type'`）；**路标的 3D 占位**：写字墙 / 回声亭 / 打卡垫（复习日还有周报牌、入门小测牌）在出口区各一个环 + 立柱 + 中文牌子（画在画布贴图上），面朝她来的方向（解谜在对面出口、道具赛在终点；对抗赛和 Boss 没有路线，不放）——只是占位，不出题；Boss 周考答题卡的「第 n / 共几题」原来分母是 0；手机上 Boss 的段条只写段名的第一个词（「R 阅读」），不再竖着折行。

**测试**：`npm run test:learn` 53 / 53（原 43 + `i18n.test.mjs` 6：每个键都有英文和中文、占位符两边一致、Node 里默认中文、`?lang=en` 是原来的英文、每把武器 / 副武器 / 特殊武器 / 舞台 / 队名 / 难度都有中文名、**扫描**她会经过的代码——`menus.js` 的载入 / 标题 / 主菜单 / 学习屏 / 暂停 / 设置 / 怎么玩 / 制作人员和共用控件、`hud.js`、`hud-boss.js`、`hud-learn.js`、`forms/ui.js`、`touch.js`、`boss-art.js`、设置预览、`main.js` 的进度字和击倒信息——没有不经过 `t()` 的英文字符串（白名单只有键名和专名），再一条确认扫描会咬人；+ `flip.test.mjs` 4：复习日恰好一道 150 张的翻牌门、别的天还是打字卡；翻牌的正反面和判定；`cardFor` 的三种去向；`recordFirst({ how: 'F' })` 的叶子 `Model.validLeaf` 认、方式不对不写、一天一个首答、「不记得」第二天到期）；`npm run check` 200 文件绿。

**浏览器里跑通的**（都在 `flock /tmp/ielts-browser.lock` 里、一次一个，`?quality=low`、阴影 / 泛光关、模拟时钟 `debug.freeze` + `_frame` 步进；截图看过就按路径删了）：
- 390 × 844 触屏 `?learn=w1d1&kind=puzzle&short=1&from=app`：关卡 HUD（自动走 108 × 44，触屏键中文）、学习局暂停（继续 / 设置 / 离开这一关 约 360 × 52–60，面板四格统计）、主菜单（竖屏一列，学习第一）、学习屏、设置——每屏跑了一个溢出检查（按钮字有没有被裁、折行、出屏），**都没有**；屏上剩的英文只有键帽（TAB）和机器人的名字。
- 390 × 844 触屏 `?learn=w1d7&kind=race&short=1&gate=3`：翻牌正面（翻过来 140 × 44）、背面（听 84 × 44、记得 175 × 52、不记得 175 × 52）；不记得 → 打字卡 → 记得；证据 `w:monday [0,"F"]`、`w:tuesday [1,"F"]`、语法 `[1,"L"]`。
- 390 × 844 触屏 `?learn=w1&kind=boss&short=1`：停在 W 段的写句题看三行输入框（提交 100 × 44），回车提交两句都判对，打完出结果卡。
- 960 × 540 `?learn=w1d1&kind=quiz&short=1` 到结果卡；`play-quiz-chain.json`（解谜 → 按钮 → 小考）到结果卡，无控制台错误。
- 960 × 540 `?learn=w1&kind=boss&short=1` 的音乐请求序列（上面）；`?learn=w1d1&kind=puzzle&short=1` 站在最后一道门前看三块路标。

**只代码审过、没进浏览器的**：`?lang=en` 在页面里（Node 测试覆盖了字典）；矮一点的手机竖屏（iPhone SE 375 × 667：主菜单一列从 128 px 起、9 个按钮，只在 844 高看过）；页面标题（中文时 `document.title` 是「INKWAVE · 泼墨大乱斗」）；对抗赛 / 解谜里的翻牌（和道具赛共用一套 helper，只跑了道具赛）；最后一次改的 Boss 题号分母和段条（改完没再开浏览器）；手机横屏下的设置、怎么玩。

**要知道的**：中文是**整个游戏的默认**（不只学习入口：网页版、Electron 都是），英文要 `?lang=en`——想让不是从 App 来的访客默认英文，改 `i18n.js` 的 `LANG` 一行（例如没有 `?learn` / `?from=app` / `?lang=zh` 时取 `en`），这次没动。小考的奖杯记在 `inkwave:learn:design:v1` 的 `w1d1:quiz` 键下（`stars` 里也多一个值为 0 的 `w1d1:quiz`）：以后把 `stars` 当成「每一天」来列的地方要跳过 `:quiz` 的键。F 的联机学习形式（versus2 / coop2）暂停时走原来的联机暂停（`learn && !online` 才用学习局的暂停面板），是有意的。

**没做的**：装备 / 换装屏的内容（武器卡、外观项；中文名已经在字典里，没接到那两屏）、INKWAVE 自己的结算屏（学习关不走它）、联机大厅几屏（F 的地盘）、对战的选模式 / 选舞台屏——这些屏在竖屏下仍是横屏版式 + 提示条；机器人的名字（Squiddo、Nori…）是名字没翻；路标只是占位（不能走进去答写句 / 听回声亭）；手机竖屏时 HUD 的钟被「下一道门」条压着（B 的布局，没动）。

## 16. H 交付（2026-10-16，分支 `learn-h`：录音接入 + 进度并进她的证据 + iPhone / WKWebView 下的稳妥）

游戏现在住在 IELTS-Base 的 `app/game/`（`tools/game/sync-inkwave.sh` 复制 `dist/`），App 的「关卡」打开 `game/index.html?learn=w1d1&from=app`：和她的课本**同一个 origin**（`ielts-base://app`，或她的服务器），`../audio/` 就是 `app/audio/`。H 用的就是这两点。

**录音（`src/learn/audio.js`）**——照课上的做法（`app/index.html` 的 `Clips`），不另起一套：
- 找哪段：宿主自己的 `speechChunks` 切句（导出工具从宿主逐字抄进 `vendor/ielts/host.js`），每段照原样 / 去句末标点 / 加句号 / 大写的单词再查小写；**每段都有录音才放录音**，缺一段整段用设备的声音。口音读她的 `profile.accent`（工作台的设置），慢放用 `-slow` 那套、没有就平常那套 0.8 倍不变调；「内置的真人感录音」关了就不用。`item.audio` 仍是 `null`——放的时候按 `tts` 的文字找（宿主也是这样：加一周录音时分片里的偏移都会变）。
- 取字节：Range 请求（`bytes=offset-(offset+length-1)`；她 App 的 `SchemeHandler` 支持单段 Range、回 206；nginx 也支持），只拿这一段（几 KB），片段缓存 64 段；服务器不认 Range 回 200 整片（python 的 http.server）就整片留着切（最多一个音色的 12 片）。`index.json` 带 `no-cache`。
- 播放：先 `<audio>` 放 blob（iPhone 静音键开着也有声音：WebKit 给 `<audio>` 的是 playback 类别，只有 Web Audio 的页面是 ambient、跟静音键走——IELTS-Base `docs/native-integration.md` §7），blob 被拒才用 Web Audio（解码在 INKWAVE 自己的 `G.audio.ctx` 上，iOS 限制一个页面开几个 context），再不行设备的声音。一次只放一段（新的一段先停旧的，旧的 `onEnd` 照样回调），多段之间 220 / 320 ms；页面隐藏、离开就停；放的时候音乐让一让（`G.audio.duck`）。
- 解锁：Safari 网页要手势——第一次真点击 / 按键在同一个 `<audio>` 上放宿主的静音片段（`CLIP_SILENT`）、恢复 AudioContext；**放成了才算解锁**（被拒就等下一下；被「听」那段在同一下点击里接走算解锁）。没解锁时自动朗读被拒只是换设备的声音，不报错、不留未处理的 rejection。App 里 `WebView.swift` 设了 `mediaTypesRequiringUserActionForPlayback = []`，不用解锁、直接跳过（免得为一段静音把她的音乐停了）。
- 本地开发安静：只有页面在 `game/` 目录里（`…/game/` 或 `…/game/index.html`）才去 `../audio/` 找，或 `?audio=<base>` 指定；`?noclips` 关；`file:` 不取。仓库根目录的开发服务器上一个请求都不发。
- 接进去：`hud-learn.js` 的 `_play` / `_speak` 交给 `audio.say()`（原来的 `speechSynthesis` 原样搬成 `_device` 当退路），`hide` / `end` 停的是录音或设备声音；形式里的回声道具、回炉慢放、看板每行的「听」都走 `_speak`，所以都有录音了。回炉的听写第一遍慢放（`relearnTip.slow`）。`G.learnAudio.status()` 给审计看（放的是 clip / webaudio / device、哪套、几段、Range 还是整片）。
- 覆盖（她 App 里现在的 `index.json`，游戏要念的不同文字）：美音第 1 周 234 / 234、第 2 周 278 / 278、第 3 周 267 / 268（缺 bought）；英音 232 / 234、277 / 278、262 / 268。

**进度并进她的证据（`src/learn/workbench.js`、`store.js`）**：
- 她的账在工作台的 `localStorage['ielts-workbench:data:v1']`（`{ profile, days, …, base }`，`base['ev-<周一>'] = { v: 2, it }`，`app/base/core.js` 的文档）。`store.exportDoc(某周 id | 那周某天 | 不给 = 本周)` 产出她的格式（只留 `validLeaf` 的叶子），`exportDocs()` 是全部；`store.pushToWorkbench()` → `workbench.pushEvidence()`：游戏的叶子先按**当天首答**筛——她那天已经有这个条目的答案就不进（`core.record` 的 `hasEvOn`：她账上先有的就是那天的首答）——其余用 IELTS-Base 自己的 `Model.mergeDoc` 按键并。**幂等**：第二次跑一个叶子都不加、她的键一个字节都不变、也不重写；写之前总是重读她的 blob；她 blob 里别的字段 / 别的文档原样不动（同一个值、同一段 JSON 文本）。没有工作台（没有带 `profile` 的 blob：纯 INKWAVE、开发、Electron）一个键也不建。
- 什么时候推：`api.js` 在页面里 `store.attachWorkbench()`——每次首答后 0.8 秒、页面隐藏 / `pagehide` 时、开局补推上一页没推的（WebContent 进程可能被 iOS 杀掉、没有 `pagehide`；`inkwave:learn:v1` 里记 `n` / `pushed`）。推完以后，四周以前、她账上每个（条目, 日期）都有答案的周从游戏这份里删掉（两份共用她 5 MB 的 `localStorage`）。
- 方式照 §8：选择 / 听辨 / 听写 / 音标 `L`，打字的词 `T / H / S`，写句 `W / S`。
- 反过来只读：她今天在课上答过的条目，游戏里不再算当天首答（`recordFirst` → `{ first: false }`）；`due()` / `progress()` 连她的历史一起读（内存里并，不复制进游戏的键）。
- 她的时钟：工作台按「设置 → 时区」的墙钟记日期（没设是新加坡，`'device'` 才是设备的），游戏也用宿主同样的 `tzPlaceOf` / `tzParts`（导出工具逐字抄来）——有工作台时游戏的答案和课上的答案落在同一天；没有工作台用设备的时钟。
- 她的同步：`app/sync.js` 的 `pendingChanges()` 对每篇本机文档算摘要，所以并进来的周下次同步就推上她的服务器；App 的原生镜像只跟着工作台自己的保存走（她下次在课本里做任何事时）。两个桌面标签页同时开着课本和游戏时，课本那页内存里的旧 `S` 下次保存会盖掉并进来的周——游戏会在下一次推的时候再并一遍（幂等），手机 App 里两页不会同时活着。

**iPhone / WKWebView**（App：`ielts-base://app`，`SchemeHandler` 供文件、只竖屏）：
- 竖屏门：`src/core/touch.js` 在 `from=app` 时永远不亮「Turn your device」——headless 竖屏实测原来：页面隐藏 → 关卡暂停 → 暂停菜单被这块门盖住，App 转不过来就出不去（菜单页也一样）。普通浏览器里关卡的暂停菜单也不再盖（关卡本来就竖屏玩）。`from=app` 时其它模式的触屏键竖屏也活着。
- 全屏 / 横屏锁：`main.js` 在 `from=app` 时不挂第一下点击的 `requestFullscreen` + `orientation.lock('landscape')`（iPhone 本来没有元素全屏、会安静跳过；iPad 的 WKWebView 要 `elementFullscreenEnabled` 才有）。指针锁只在非触屏模式请求、都在 try / catch 里。
- 信标：`index.html` 在 `from=app` 或页面在 `game/` 目录里时关 `/__inkwave_error/`（`?beacon` 照样开）。App 里主机名是 `app` 本来就关；原来在她局域网的服务器上每次开都会发一个 `gpu` 信标、回 404。
- 页面隐藏：触屏模式下关卡暂停（暂停菜单），录音 / 设备声音停；回来是暂停菜单、点「继续」。
- 内存：手机（粗指针）或 `from=app` 菜单只用 640 px 的舞台图（模式卡三张、预载 16 张小图）；原来预载 16 张 1920×1080（解码后每张约 8 MB）+ 16 张小图。
- 路径：`index.html` 的导入表、`loadModule`、`ielts.js` / `content.js` 的 `new URL(…, import.meta.url)`、`fetch('assets/…')`、`songs/manifest.json` 都是相对的，在 `app/game/` 下照样对；`SchemeHandler` 的 MIME 表有 js / json / webp / woff2 / mp3。
- `localStorage`：`WebView.swift` 用 `WKWebsiteDataStore.default()`，IELTS-Base `docs/native-integration.md` §5.9：`ielts-base://app` 的 `localStorage` 持久、进备份；游戏和课本同一个 origin，所以并账可行。

**导出工具**：`tools/learn/export-ielts.mjs` 多抄宿主的 `speechChunks`、`CLIP_SILENT`、`TZ_PLACES / TZ_DEFAULT / tzFmt / tzDevice / tzParts / tzPlaceOf`（`const X = [` 的表按方括号配平），自检多三项（和活宿主逐字比）；文件头写了 IELTS-Base 更新课程以后怎么重跑、`git diff --stat` 怎么看。在 IELTS-Base `e881096` 上重跑：`content/` 一字没变，`SOURCE.json` 的提交号 `adf4369 → e881096`、宿主行号 +1。

**验证**：
- `npm run test:learn` 52 / 52（新增 `audio.test.mjs` 4 条：录音在哪、找哪段、Range 206 / 整片 200、没有录音时安静；`workbench.test.mjs` 5 条：她的当天首答留下、并进去、第二次一字节不变不重写、新会话再跑不变、没工作台不建键、四种时区设置、她的历史算到期和进度、旧周删了照样算、开局补推和首答后稍等再推），`npm run check` 201 个文件绿。
- 她的课本认不认（Node，不开浏览器）：游戏记三条（听写 85%、卡片 T、语法错）→ 推进一个编出来的工作台 blob → 用 IELTS-Base 自己的 `tests/base/load-host.cjs` 把**活宿主**起在这个 blob 上（只读，`progress` 给的是编出来的对象）→ 宿主的 `S.base` 交给 `Model.answers` / `Model.memory`：三个条目都在宿主的索引里、都画出来了（`w:monday` 她 10-13 的一次加上游戏 10-15 的一次，半衰期涨到 3.49 天；语法那题 `lastMiss` 是 10-15）。
- headless（锁里，`/opt/pw-browsers/chromium` + SwiftShader，390×844 触屏，`?quality=low`、阴影 / 泛光关，模拟时钟 `debug.freeze / step`；一个按 IELTS-Base `app/` 布局的小服务器：`/game/` = 这个工作树，`/audio/` = IELTS-Base 的 `app/audio/` 只读；一个**编出来的**工作台 blob）：`game/index.html?learn=w1d1&kind=puzzle&from=app` 起关（约 41 s）、自动走到门、音标题没有朗读、第一道听的题 Monday：`index.json` 200 + `us-5.mp3 206 bytes=4652-10839`、`how: clip`；点「听」再放一遍走缓存；答对后 0.8 秒她的 blob 里 `ev-2026-10-12` 多了这几条（`n` = `pushed` = 9）；页面隐藏 → 暂停菜单、正在放的停了、门不亮；无控制台错误、无未处理的 rejection、无信标。服务器不认 Range：第一次 200 整片、之后不再发 Range、整片切。模拟 Safari（`play()` 在真点击前被拒、AudioContext 挂起）：自动朗读换设备的声音、没有报错；真点「听」→ 解锁、放录音。仓库根目录（开发服务器）：`/audio/` 一个请求都没有，用设备的声音，不建她的键。`from=app` 主菜单 / 模式页：门不亮，只请求 `-sm` 的舞台图。截图看过即删。
- **真机待验**：WKWebView 里 `fetch` 带 `Range` 到 `ielts-base://` 的 206（`SchemeHandler` 代码支持）；`<audio>` 放 blob MP3（宿主一直这么放）和静音键；`localStorage` 在 `ielts-base://app/game/` 和课本共用（同 origin，WebKit 按 origin 存）；导入表要 iOS 16.4+；`visibilitychange` 在 App 进后台时；内存（WebGL + 菜单图）不被系统杀；Safari 网页上第一下点击的解锁（headless Chromium 不管 `--autoplay-policy` 都放行，只能拿桩模拟）。

**动了别人地盘的几行**（都没改界面文字）：`src/ui/hud-learn.js` 播放四处（`import`、`_play` / `_speak` / `_device`、`hide` / `end` 的停）；`src/ui/menus.js` 三行（`stageArt` 的小图、预载循环、模式页背景的 `-sm` 替换）；`src/core/touch.js` 三处（`FROM_APP` 时门 / 触屏键）；`src/main.js` 一个条件；`index.html` 启动段的信标判断。

**没做的 / 要主会话过目的**：
1. IELTS-Base 那边（不归这里改）：`WebView.swift` 在首页以外都开着侧滑返回（`allowsBackForwardNavigationGestures = !isStartPage`），游戏页从左边缘一滑就回课本、关卡丢了（证据有 `pagehide` 和每题 0.8 秒的推，不丢）——建议把 `game/` 也当首页、不开侧滑。改完游戏要在 IELTS-Base 跑一次 `bash tools/game/sync-inkwave.sh <这个仓库>` 才进 App。
2. `from=app` 时竖屏里的 INKWAVE 菜单（主菜单、暂停菜单）是横屏排的，能点但挤；暂停菜单的「继续」「离开这一关」不到 44 pt——G 的中文化 / 菜单在管这块。turf / zones / boss 在竖屏 App 里能开、触屏键活着，但不是为竖屏做的；要不要在 `from=app` 时只留学习入口，主会话定。
3. 课本的同步、原生镜像不知道游戏写了她的键：下次她在课本里保存时镜像跟上，下次同步时推上服务器。要更快可以让课本在 `pageshow` / 回到首页时重读 `localStorage`（IELTS-Base 那边）。
4. 机器人「答题」不放录音（只有她的题放）；考试人物的录音（`app/audio/exam/`）还没接——Boss 战第二版换 `sched.plan + gen.render` 的场景题时一起接（`ExamClips` 的做法一样）。
5. 游戏这份证据不带写句的「我的写法也对」（`S`）的界面——引擎和 store 都认，`hud-learn` 还没有那颗按钮。
6. `hud-learn.js` 文件头的注释还写着「item.audio when the course has a recording」——是 G 的文件，没去改注释。

## 17. I 交付（2026-10-16，分支 `learn-i`：App 里竖着拿手机能走到的每一屏）

App 的「关卡」打开 `game/index.html?learn=w<n>d<d>&from=app`，iPhone 只竖屏、转不过来。H 让竖屏提示条在 `from=app` 下不亮（§16），G 给主菜单 / 学习屏 / 设置 / 学习局暂停做了竖屏版式（§15）；剩下的屏还是横屏版式挤在竖屏里，转不过来的她点进去就可能出不来。I 把从 `from=app` 的主菜单能点到的每一屏过了一遍。

**App 里只留学习（一个开关）**：`src/config.js` 的 `LEARN.appLearnOnly: true`。`from=app` **且是中文界面**时：主菜单没有「对战」（涂地 / 区域 / Boss 对机器人那几屏和比赛都是横屏做的）；装备页没有「练习」（开的是一局横屏的靶场）；房间的 MODE 只在双人联机赛 / 双人合作赛之间切；她开的房间默认双人联机赛。**改回**：`appLearnOnly: false`，App 里就是 INKWAVE 的整套菜单。网页版（没有 `from=app`）和 `?lang=en`（原版 INKWAVE，带着 `from=app` 也一样）都不受影响。

**竖屏版式 + 中文**（`styles/ui.css` 末尾的竖屏块，`@media (orientation: portrait) and (max-width: 640px)`；字全走 G 的 `t()`，字典 502 → 862 条）：
- 每屏的返回键 44 pt，键位提示条（Enter / Esc / A / B）在竖屏里藏起来；怎么玩一列可滚，制作人员照旧是自动往上滚的字幕。
- 联机 hub：建房、输房间码、粘贴。**输房间码**原来是五个 `<span>` 格子听实体键盘——手机上点格子什么都不会弹出来，进不了别人的房间。触屏模式下格子上盖一个透明的真 `<input>`（`inputmode=text`、自动大写、最多 8 位），点格子弹手机自己的键盘，输满 5 位自动进；错码的提示中文（`JOIN_ERR`）。
- 房间：上面房间码和人数，中间 3D 阵容（`showcase.js` 竖屏时把镜头框在房间码和设置之间），设置成一张可滚的卡（MODE、「课」一行……），底下武器 / 外观 / 表情、队伍、准备 / 开始。武器抽屉加了 ✕（原来只能按 Esc / B 关），表情轮盘居中；双人合作赛一个人时「开始」挡着、说要两个人。
- 装备 / 换装：小鱿鱼站在标题下面的一条里（`showcase.js` 竖屏取景），下面是可滚的列表。武器 / 副武器 / 特殊武器的说明、换装的选项名和预设、名牌称号进了字典（这些中文是 I 写的，不是 G 的）。
- 机器人昵称：一组 20 个中文昵称（`i18n.js` 的 `BOT_ZH`，小鱿、墨墨薇……），对战、房间、制作人员名单都用；`?lang=en` 用原名。联机时是房主起名字。
- 结算（双人联机赛走 INKWAVE 的区域赛结算）：一列可滚，奖章、区域赛的胜负原因、经验分项、回房间倒数都是中文。
- 联机暂停：按钮在上、本局面板在下。

**比赛里（双人联机赛是一局真的 Zone Control）**：HUD 在竖屏里按宽度放大（`styles/hud.css`，`--u: min(1.6vw, 1.1vh)`）；触屏上排键（暂停 / 耶 / 地图）挪到顶栏和门条下面，竖屏里每个键 ≥ 44 pt（`touch.js` `_layout`）；**出题时（`learn.hold`）触屏层不活**——点卡片不会同时当摇杆 / 开火，答完的下一帧又活；小地图上「TAB 地图」的键盘提示在竖屏里藏起来。

**竖屏 HUD（清单第 2 项）**：关卡「下一道门」条挪到 HUD 顶栏下面，钟不再被压（实测钟 y 4–23、门条 y 58–120）。H 说暂停菜单按钮不到 44 pt：那是 G 的竖屏暂停合进来以前量的横屏版式；现在学习局暂停 374×54、联机 / 对战暂停 374×52、「离开这一关」的确认 156×48，都过了。结束卡上「今日小考 · 8 题 · 傍晚一轮对抗赛」竖屏里一行放得下。

**写句的「我的写法也对」（清单第 3 项）**：照 IELTS-Base 考试的做法（`app/exam/ui.js` 的 claim、`app/exam/sched.js` 周报里的「自评」）：
- 判分（A 的 `engine.judge` → gen.js）说 `claimable`（没对、不空、覆盖 ≥ 0.6、没有关键形式错）时，卡片判「差一点 — 意思到了」，说明改成「意思到了，和参考句不完全一样（参考：…）。如果你觉得自己的写法也对，可以点「我的写法也对」。」（原来同样的句子会说「和参考句差得多」），卡上多一个 44 pt 的「我的写法也对」。
- 答案先**压着不记**。点了：用 gen.js 自己的 `{ claimed: true }` 再判一遍，站得住才算——当天首答记 `[1, 'S']`（`store.recordFirst({ self: true })`，`store.js` 第 69 行约好的 W / S），算打中 Boss 一下，卡上写「已记下：你的写法（周报里请老师看）」。不点直接「继续」：照常记 `[0, 'W']`、照常换问法 / Boss 出招。
- 改的地方：`engine.judge(item, answer, opts)` 多一个可选参数；`forms/common.js` 的 `canClaim` / `claimJudge`；`boss.js` 的 W 段（`_settle`）；`hud-learn.js` 的按钮和说明；换过问法的、回炉的题不给。现在只有 Boss 周考的 W 段出写句（关卡里的写字墙还是路标占位，§15）。
- `tests/learn/claim.test.mjs` 3 条：哪些句子能点（My mum is kind. 对 My mother is kind. 能；差得远 / 关键形式错 / 本来就对的不能；换问法 / 回炉的不给）、点了再判（站得住 / 站不住）、store 里的叶子（压着时什么都没记、点了 `[1, 'S']` 且一天一次、第二天不点 `[0, 'W']`、答对 `[1, 'W']`）。

**审计脚本** `tools/learn/portrait-audit.mjs`（+ `portrait-groups.mjs` 每组怎么走、`portrait-measure.js` 页面里的量法）：390×844 触屏、`--dpr 1`、`?quality=low`、阴影 / 泛光关、减少动效、模拟时钟；每屏真点进去（`touchscreen.tap`），把入场动画走完再量：触控目标 < 44 pt 的、被别的东西盖住的、出屏的（可滚的容器里不算）、按钮字被裁的、短标签折行的、可滚的容器，再用屏自己的返回键回去。`--group menus | kit | online | room | zone | level | versus2 | boss`，每组 ≤ 3 分钟；`--shots <目录>` 截图、`--lang en`、`--web`（不带 `from=app`）、`--desktop`（不模拟触屏）、`--w / --h`。

**逐屏表**（390×844 竖屏触屏，pt = CSS px；「溢出」= 裁字 / 折行 / 出屏 / 被盖 / < 44 pt 的个数；最后一次全跑：2026-10-16 06:30–07:05 UTC）

| 屏 | 怎么进 | 进得去 | 回得来 | 溢出 | 最小目标 |
|---|---|---|---|---|---|
| 主菜单（from=app） | 关卡结束卡「回到菜单」（审计也用 `?skipTitle&from=app` 直开） | ✓ | —（根；「回到课本」走 `../index.html`，回 App 的页，审计里没有 App） | 0 | 359×53 |
| 学习（选周 / 天） | 主菜单「学习」 | ✓ | ✓ 返回 | 0 | 50×44（返回） |
| 设置 | 主菜单「设置」；关卡暂停「设置」 | ✓ / ✓ | ✓ 返回 → 主菜单 / ✓ 返回 → 暂停 | 0 | 50×44 |
| 怎么玩 | 主菜单 | ✓ | ✓ 返回 | 0（正文一列可滚） | 50×44 |
| 制作人员 | 主菜单 | ✓ | ✓ 返回 | 0（量到「出屏 35」是自动往上滚的字幕的下半截，设计如此） | 50×44 |
| 联机 hub | 主菜单「联机」 | ✓ | ✓ 返回 → 主菜单 | 0 | 86×45（粘贴） |
| 输房间码（错码） | 点格子：焦点到 `<input>`（inputmode text），打 ZZZZZ | ✓ | ✓ | 0；「没有这个房间」中文 | 85×44 |
| 房间（她是房主，双人联机赛） | hub「建房」 | ✓ | ✓ 离开 → 确认 → hub | 0（设置卡可滚） | 106×44 |
| 房间 · 武器抽屉 | 武器 | ✓ | ✓ ✕ | 0 | 44×44（✕） |
| 房间 · 换装 | 外观 | ✓ | ✓ 返回 → 房间 | 0 | 50×44 |
| 房间 · 表情轮盘 | 表情 | ✓ | ✓ 点一个就关 | 0 | 94×51 |
| 房间 · MODE ▶ 双人合作赛 | MODE 右箭头 | ✓ | （同一屏） | 0；一个人时「开始」挡着 | 106×44 |
| 离开房间的确认 | 离开 | ✓ | ✓ 离开 → hub | 0 | 157×51 |
| 装备 | 主菜单 | ✓ | ✓ 返回 | 0（列表可滚；没有「练习」） | 50×44 |
| 换装 | 主菜单 | ✓ | ✓ 返回 | 0 | 50×44 |
| 关卡 · 走路 | App 直开 `?learn=w1d1` | ✓ | 走暂停 | 0；钟和门条不重叠 | 108×44（自动走） |
| 关卡 · 题卡 | 自动走到门 | ✓ | 答完继续 | 0 | 176×48 |
| 关卡 · 暂停 | 暂停键 | ✓ | ✓ 继续 | 0 | 374×54 |
| 关卡 · 离开这一关的确认 | 暂停「离开这一关」 | ✓ | ✓ 接着答 | 0 | 156×48 |
| 关卡 · 结束卡 | 全答对（4 / 4） | ✓ | ✓ 回到菜单 → 主菜单 | 0 | 326×52 |
| 双人联机赛 · 题卡 | 真房间（本次起的中继）对机器人 | ✓ | — | 0；出题时触屏层不活 | 176×48 |
| 双人联机赛 · 打着 | 答完 | ✓ | 走暂停 | 0；触屏 8 个键都活 | 48×48（地图） |
| 联机暂停 | 暂停键 | ✓ | ✓ 回到对局 | 0；「对局还在继续」 | 374×52 |
| 双人联机赛 · 结算 | 题答完、房主收局 | ✓ | ✓ 回房间（在可滚一列的下面，滚到再点）→ 房间 | 0 | —（目标都在折线下） |
| Boss 周考 · 写句「我的写法也对」 | `?learn=w1&kind=boss` | ✓ | — | 0 | 100×44（提交） |

另外：`zone` 组用对抗赛（`w1d6`）替身先量了比赛 HUD / 联机暂停 / 注入的区域赛结算（和上表一致）；`--lang en` 跑了 `menus` 组（主菜单有「play」、各屏英文）；`--web --desktop` 在 1280×720 跑了联机 hub 和房间（横屏网页版的版式照旧、中文）。截图都看过、删了。

**只代码审过、没在浏览器里跑的**：她作为**访客**进别人的房间（准备键、等房主的样子——审计都是她当房主）；用对的房间码进房（只跑了错码）；在房间里点「开始」（versus2 组用 API 开局，跑的是开局之后）；双人合作赛开局后的一切（竖屏没跑过，F 在横屏两人跑过）；房主迁移；真 iPhone 键盘弹起来盖住房间码时的样子；制作人员的手指拖动；Boss 周考的暂停（和关卡暂停是同一屏 `_scr_pauseLearn`）。

**动了别人地盘的**：A 的 `engine.js`（`judge` 的第三个参数、`claimable` 的说明）；E 的 `boss.js` W 段；G 的 `menus.js` / `i18n.js` / `menu-art.js` / `ui.css`（竖屏块、字典）；F 的 `session.js`（App 里开的房间默认双人联机赛、房主给机器人起中文名）；B 的 `hud-learn.js`（按钮）；`touch.js`、`showcase.js`、`main.js`（结算的经验分项走字典）、`match.js`（机器人昵称）。

**没做的 / 要主会话过目的**：
1. **第 4 项没做**：coop2 的共用墨罐、房主迁移时正在问的那道题——两样都要两个客户端、房主中途走掉才验证得了，单看代码不能算做完。接手的位置：`versus2.js` 的 `_becameHost()` 现在把 `this.q` 丢掉、从下一题接着出；每个客户端都拿着 `q.id / q.n / q.total`（`_onAsk`），新房主在这里把没答完的那题按原 id 重发一个 `lq` 就行（当天首答一天只记一次，重问不会多记）；coop2 的墨现在没有任何联机负载，共用要新加一种。
2. 开关管得比主菜单宽：装备页的「练习」、房间的三种对战模式、App 里开房的默认模式都跟着 `appLearnOnly` 走；`?lang=en` 不跟（照「网页版和 ?lang=en 不受影响」）。
3. 她在 App 里进一个网页版房主开的涂地 / 区域 / Boss 房间，还是会进一局横屏做的比赛（触屏键活着、能玩、挤）——模式是房主定的，没拦。
4. 换装的选项名、预设、名牌称号、武器说明、20 个机器人昵称的中文是 I 写的，请过目；联机时机器人名字是房主那边的语言（中文房主、英文访客也看到中文名）；默认名字「Player」没动。
5. 出题时触屏层不活，网页版的触屏（不是 App）也一样——卡片上的一下点不该同时是摇杆。
6. HUD 竖屏按宽度放大、触屏上排键挪下来，网页版手机竖屏也一样。
7. 「我的写法也对」算打中 Boss 一下（和答对一样）；`engine.judge` 多了参数、`claimable` 的说明改了字，是 A 的文件。
8. `?lang=en` 下 from=app 的主菜单「学习」那颗按钮的副标题（中文）被省略号截了（282 / 315 px）——不在她的路上，没改。
9. 双人联机赛的审计里 HUD 用 `setVisible(true)` 显出来：`main.js` 的 `_intro` 是 3 秒墙钟，审计按两倍速步进时开场先走完、HUD 就一直藏着；手机上开场是真时间，不受影响。
