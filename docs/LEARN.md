# INKWAVE · 关卡学习（雅思课程进游戏）— 设计契约

> 状态：第 1 版（2026-10-15），作为并行开发的契约。中文写说明，代码标识用英文。
>
> **第二版（10-16 起）：题即玩法——门不是卡片、游戏不暂停，见 [PLAY.md](PLAY.md)。** 分期做，一期一个分支 `play-<n>`，交付各记一节在本文末尾。
>
> 业主 10-15：「保留你的所有成果，现在需要彻底重构为关卡游戏类的学习，课程内容和深度和容量保持不减少，但是设计成道具赛、解密闯关赛对抗赛的各种形式，直接复用这套前端、游戏设计和所有素材，你的已有开发和素材改为在这基础上添砖加瓦，现在开始并行开发。」
> 两个仓库：**这里（`bugsyyu/inkwave`）是底子**——Splatoon 式的 4v4 泼墨射击游戏（three.js r186，纯 ES 模块、不打包，一切程序生成，有机器人、线上房间、触屏、Electron）；**`bugsyyu/IELTS-Base` 是内容和素材的来源**——她的雅思课程（三周的课、考试中心、记忆模型、录音、口语评测）和新世界的素材（场景底图、写实人物、全景、分块）。IELTS-Base 自己的开发照常继续；这边把它的东西拿过来添砖加瓦。

## 0. 一句话

**把她的雅思课程，一天一关，放进 INKWAVE 的舞台上玩：解谜闯关（一个人，答对开锁）、道具赛（答对拿道具、抢时间）、对抗赛（答题蓄墨，和机器人或朋友抢地盘）、Boss 战（周考）。题目、判分、记忆模型、估分和原来一样多、一样深、一样严；她的进度和原来是同一份。**

## 1. 原则（有冲突按这个顺序）

1. **内容不减少。** 三周课程的每一步（词、句、发音、听写、语法、场景题）、考试中心的每一种题、每一条雅思规则的判分，都要能在关卡里出现；关卡只是外壳。做不到的先留在「经典页」入口里，不删。
2. **证据模型就是内容。** 她在关卡里的每一次「当天首答」写进和 IELTS-Base 一样的证据格式（`ev-<周一>`），由同一个记忆模型（`app/base/model.js` 的半衰期、到期）排到期、由同一个考试排程（`app/exam/sched.js`）出题和估分。进度是同一份：先本机（`localStorage`），再接她今天配好的同步服务器（`IELTS-Base/server`）。**不另起一套账。**
3. **iPhone 先行。** 学习关卡不要求双摇杆瞄准：答题是一个游戏动作——点射题物、换道、踩拍子、在游戏键盘上打字开火（PLAY §3；play-8 起卡片删了，世界从不暂停）；走位用一根摇杆或自动走。热区 ≥ 44 pt。减少动态效果、深色都要好看。
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
- `src/ui/hud.js` + `src/ui/hud-learn.js`：~~答题层（题干、选项 / 输入框 / 播放按钮、对错和「为什么」、进度）；手机上占下半屏~~（play-8 更正：题卡删了——题干是顶上的题条 `src/ui/play-strip.js`，答案是舞台里的题物 `src/learn/play/`，PLAY §2–§3；`hud-learn.js` 只剩走路条、关卡结尾的结果卡和念英文的声音），热区 ≥ 44 pt。
- 数字都在 `src/config.js` 的 `LEARN`（题数、时限、道具效果、机器人答题正确率）。

事件走 `src/core/ctx.js` 的总线，照 `docs/EVENTS.md` 的样子：`learn:question`、`learn:answer`（{ id, ok, first }）、`learn:gate`、`learn:done`（play-8：没有卡片专有的事件；一道题没有玩法接得住时流程发 `learn:skip` 跳过它——三周里不会发生，`design.test` 核每个条目都有玩法）。

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
- 包里的步 → 关卡步：`symbols / symreview` → **pron**（「哪个词里有 /ʌ/？」：这个音的第一个例词对同一步里相邻三个音的例词，都是包里的词）；`grammar` 且 `k: 'pron'` → **pron**（第 2、3 周的弱读 / 连读 / 重音小测，原题原选项）；`grammar` → **choice**；`words` → **choice**（看到、听到这个词，选中文；干扰项是同一步相邻三个词的中文）；`flash` → **dictation**（听到词、打出来 = 宿主的卡片听写；`meta.typed: true`，`hint` 是中文和音标，B 先显示了提示就算辅助作答，记 `hinted: true`；play-8 更正：卡片删了，提示是游戏键盘上的「提示」键或墨雨，判分一处写在 `play/judge.js`）；`dictation` → **dictation**（整句，宿主的 `dictScore`）；`reading` → **listen**（`tts` 是整篇课文，每题都带，B 一步放一次；问题是包里的题）；`pairs` → **listen**（放词对中的一个，`stableHash(id) % 2` 决定放哪个，两个都是选项）；`write / speak / checkin / weekly / placement` → **lesson**。写句子的条目仍然计分、`judge` 能判（`input: 'write'`，走 gen.js 的 WT），只是步的 kind 先是 lesson、不进解谜关的门；口语、打卡、周复盘、入门小测的条目 `scored: false`。
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

**今日小考**（E 只代码审过）：`?learn=w1d1&kind=quiz&short=1` 和**解谜结算卡上的「今日小考」按钮**都在 headless 里跑通了。修的：审计脚本等结果卡原来按墙钟 8 秒，软件 GL 下一模拟秒要好几秒墙钟，结果卡（`finishT` 1.4 秒）还没到就超时——改成按模拟时间等；小考原来把结果写进这一天的星星（2 题的短考也能给 w1d1 一颗星）——现在只记 `w1d1:quiz` 的奖杯，结果卡不显示星、写「小考不算这一天的星星」和「课上答过的再答只算练习」；小考的备战板写「今日小考 · 傍晚一轮对抗赛」而不是「备战 · 第 1 / 1 轮」。`tools/learn/play-quiz-chain.json`：解谜短关 → 结果卡的按钮 → 8 题的 2 对 2（傍晚、zones 版舞台）→ 结果卡（play-8：这个走卡片路的脚本和 `drive-forms.js` 一起删了；小考在 `tools/learn/arena-audit.mjs --form quiz` 里跑）。

**Boss 的音乐**：`bossAudio.js` 的 `isBossMatch(m)` 认 `mode 'boss'` 和 `mode 'learn' + learnKind 'boss'`，周考里 `battle / battle_final` 也路由到 Boss 的曲子，阶段切换 `boss → boss_2 → boss_3`，打沉时收。headless 里看了 `G.music.play` 的请求序列：`boss · battle→boss · battle_final→boss · boss_2 · boss_3 · null`。

**复习日快闪翻牌**（LEVELS §1.1 / §3.1，原来是打字卡）：复习日 150 词那一步（`mechanic 'flash-flip'`）在解谜、道具赛、对抗赛里都是**翻牌**：正面中文 →「翻过来」→ 背面英文、美音音标、自动读一遍 →「记得 / 不记得」（键盘：空格翻、1 / 2 评）。自评记证据方式 **`F`**：`store.recordFirst` 加了 `how` 参数（`Model.MODES` 里有 `F`；IELTS-Base `core.js mapEvidence` 的「看词自评」就是 `[ok ? 1 : 0, 'F']`；不在 `MODES` 里的方式什么也不写）。「不记得」不上锁、不绕路，马上换成打字卡再来一次（当天首答已经是那个 `F`，打字只算练习），打字再错照常换问法、进回炉。`forms/common.js` 的 `isFlipGate / flipPrompt / flipJudge / cardFor` 三种形式共用；`hud-learn.js` 画卡（play-8 更正：卡删了——翻牌是 M8 翻牌靶 `src/learn/play/flip/`，解谜、跑酷的复习日和对抗赛 w1d7 都是它；「不熟」照旧交给打字蟹）。审计加了 `?gate=N`（短关从第 N 道门开始，复习日翻牌是 `&gate=3`）。

**E 没做的、这次做了的**：Boss W 段写句的输入框是**三行的 `<textarea>`**（一整句在眼前；回车提交、Shift+回车换行；play-8 更正：输入框随卡片删了，W 段是字弹 M4 打在装甲板上）；空答案不再能提交（原来只拦替身的 `'typed'`，A 的听写是 `'type'`）；**路标的 3D 占位**：写字墙 / 回声亭 / 打卡垫（复习日还有周报牌、入门小测牌）在出口区各一个环 + 立柱 + 中文牌子（画在画布贴图上），面朝她来的方向（解谜在对面出口、道具赛在终点；对抗赛和 Boss 没有路线，不放）——只是占位，不出题；Boss 周考答题卡的「第 n / 共几题」原来分母是 0；手机上 Boss 的段条只写段名的第一个词（「R 阅读」），不再竖着折行。

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

## 18. play-1 交付（2026-10-16，分支 `play-1`：题即玩法第 1 期——开关、题物系统、题条，解谜里的选择题走 M1 墨靶）

业主 10-16：门是弹窗卡片、游戏暂停，「完全就不是一个游戏，而是拼接了两个不同的东西」。[PLAY.md](PLAY.md) 是第二版的设计；这一期是它 §9 的第 1 项：解谜里的选择题不再是卡片，是门后浮着的墨靶——不暂停、不定身、不弹卡，点一下（桌面上准星压着按开火）她转身打一颗墨弹，墨弹真打到那一刻才判。

**先读了什么**：PLAY.md 全文（§1 的硬约束一条条核）；本文 §1、§5、§7–§9、§13、§15–§17；LEVELS §2（含 §2.6 回炉）、§5（演出、声音、相机、减少动效）；CONTRACTS（角色的 `trigger`、音效名）、EVENTS；代码：`flow.js`（门、自动走、`paused` + 卡片）、`hud-learn.js`、`engine.js` / `store.js`（`judge`、`recordFirst`）、`design.js`（`EFFECTS` / `REDUCED`）、`forms/common.js`（换问法）、`weapons.js`（`Projectiles`、`fireShooter`、`_step` / `_impact` / `_blastBurst`）、`boss.js`（`segHit` / `rayDist`）、`player.js` / `actor.js`（`aimFace*` 弹簧）、`cameraRig.js`（跟随、探杆、`dampAngle` 的超级跳取景）、`physics.js`（`cameraProbe`、`los`）、`touch.js` / `input.js`、`fx.js`、`paint.js flood`。先在两个方向各截了一张走路的图，量她和 HUD / 触屏键在屏幕上的位置，再定题物能放哪。

**先量了的（三周的真数据）**：这一期管的条目 664 个——单词选义 `choice · word` 450（都是 4 个选项，中文义项最长 6 个汉字，没有一个要横幅）、语法小测 `choice · quiz` 138（**都是 3 个选项**）、发音小测 `pron · quiz` 76（2–4 个）；两种小测合起来 35 个要横幅，都是 3 个选项。没有一个题干以「哪一个是」开头——`flow.js _altPrompt` 里「选择题换成打字」那条分支在真内容上走不到，**答错后的换问法就是同一题重排选项**（`p._perm`），所以回炉照样是墨靶。每个选项的英文都配中文、没有「看中文选英文」的题，所以靶子上英文、中文两行一起写不泄露答案。

**先定的**：
1. 开关 `LEARN.play`（`config.js`，默认开；`?play=0` / `?play=1` 盖过它）。关掉 = 和原来一字不差（同一个 `_answer`、红锁、`ui_error`；审计 `puzzle-flagoff` 跑过）。
2. 只管解谜本身：`LearnFlow` 自己（`this.constructor === LearnFlow` 且 `match.mode === 'learn'`）才有题物层；道具赛 / 对抗赛 / Boss / 双人两种都继承它，照旧是卡片，到它们那一期再换。
3. **判分只有一条路**：把 `_answer` 里「判 → 首答 → 锁 / 换问法」抽成 `_judgeRecord(g, item, p, ans) → { r, first, again }`，卡片和墨靶都调它（原想叫 `_settle`，和 Boss 的 `_settle` 撞名，改了）；墨靶交的就是选项序号（第 k 个靶 = 第 k 个选项，重排过的照卡片一样经 `p._perm` 映回）。
4. **只有有意的直接命中才答**：点在题物上（或桌面上准星压着它按下开火）→ 她转身（`aimYaw / aimPitch` + `fireFacing`，走 `actor._face` 的 `aimFace*` 弹簧，最多等 `LEARN.m1.turnFor` 0.26 s）→ 从枪口打出一颗墨弹（`Projectiles.fireShooter`，零散布、不扣墨——墨罐空了不能挡住答题），弹上记「第几题 · 第几个」（`playTag`）；`weapons.js _step` 里墨弹先问题物（在撞世界之前），打到才判。打歪落到别的题物上、她自己喷的墨、上一题还在飞的墨弹、溅射、炸弹、特殊武器都不算，只在题物上溅一点墨。**这一颗墨弹不被场景挡**（`ShotTargets.through(p)`：第一道门前的喷泉柱子挡在她枪口和题物之间时，原来点了没反应、怎么点都没反应）——它还是要真飞到题物上才判。
5. **先在屏幕上排，再放进世界**：相机用 `cameraRig` 自己的 `yaw / pitch` 缓过去（`dampAngle`，和它的超级跳取景一样；她自己一拖视角就停），停稳后**按相机此刻的样子**把排好的像素反投到前方一个平面上——探杆缩短、镜头抬升、肩后偏移都不会让题物离开排好的位置（第一版先预测取景再放，题物大了 1.4 倍、跑出屏幕）。取景的姿势是在 7 个朝向 × 4 个俯仰里挑的，每个都用 rig 自己的探杆从她站的地方试：镜杆够长（身后的台阶不把镜头顶进她头发里）、看得见她、看得见题物那片地方（近处 / 远处各六个点，喷泉、地面挡着扣分）、镜头不站在门里、转得少。她走到门口还在减速时挑的那个，等她站住再挑一次。放的时候每个题物都要离地 `LEARN.m1.clear`、她和镜头、枪口都看得见它：先拉近（最近到她前面 1.6 m），再把排布区收短（题物小一点、高一点），最后才整体抬高、而且不抬出安全区。
6. **排布**（`layoutTargets`）：安全区 = 题条（按判定出来时的高度留）下面、两边 16 px、底边以上；躲开她的身影、触屏键、小地图。竖屏 2 × 2 / 2 + 1，横屏一排（她两边各两个），横幅是图集里那块板、竖屏一行一块；放不下时先盖住她的身影（`cover: 'her'`），再不行谁都不躲（`cover: 'all'`）——**从来不丢一个选项**。超过 `LEARN.m1.bannerMax`（3）个的横幅题走卡片（三周里没有）。
7. 错是珊瑚色（`#f08a7a`），门上的锁在开关下也是珊瑚色（原来 `#ff3d5e`，太像对面的队色），错了锁弹一下；对的那个球不染她的墨（她的队色是橙的时候和珊瑚色分不开），只有外圈、牌子描边和边缘光是她的墨。镜头站进门里（1.5–3.3 m）时门上的锁和光柱淡掉。声音照 `EFFECTS.puzzle`（对 `splat_big`、错 `ui_back`、第二次错 `ui_toggle`）。

**改了什么**：
- `src/learn/play/`（纯模块都能在 Node 里跑）：`layout.js`（`layoutTargets` 等）、`pick.js`（`pickTarget`）、`hit.js`（`Boss.segHit / rayDist` 的算术、横幅的一排命中球、`ShotTargets` 登记处）、`atlas.js`（一道门一张标签图集：去重、货架式装箱、2 texel / px，装不下按 1.75 / 1.5 / … 缩）、`m1.js`（哪些条目是墨靶、题条的字）、`frametime.js`（帧时间采样）；`targets.js` `PlayTargets`（three.js：墨球 = 二十面体细分球 + 子弹墨同款清漆材质 + 慢慢晃 + 边缘光，配标签牌；长标签换圆角墨板；全是 InstancedMesh，同时最多 4 个 draw call；图集在门还差两道时画好、`renderer.initTexture` 当场上传、门开就释放；三个程序关卡加载时 `compileAsync` 预热；每帧不分配）；`run.js` `PlayRun`（出题、取景、排布 → 放置、点射、开火、判、演出、下一题、门开、`debug()`）。
- `src/ui/play-strip.js` `PlayStrip`：题条，唯一的新 DOM（`engine.prompt` 的题干 + 中文、▶ 再听 44 pt；答完在同一处写「答对了」或「差一点：是 ___」+「为什么」第一句；竖屏在钟那一排下面、挡到暂停 / 地图键时一开始就放在它们下面，横屏顶部正中、收窄不碰键；字 ≥ 17 pt；只有按钮吃触摸）。
- `src/learn/flow.js`：`this.play`；`_arrive` 在开关下不暂停、不松鼠标；`_askNext` 每题看能不能当墨靶，不能（音标、听辨、阅读、听写、单词卡、写句、课文、翻牌……）就照旧暂停 + 卡片，一题一题地切；`_judgeRecord`；锁的颜色、弹一下、近处淡掉；门开时题物收、图集放、再往后两道门画图集。
- `src/ui/hud-learn.js`：`playMode(on)`（题条出来时走路条让位）。
- `tools/learn/play-audit.mjs`：浏览器审计（见「实测」）。

**动了别人地盘的**（都很小）：`src/game/weapons.js` 三行（`_new` 里清 `playTag`；`_step` 里撞世界前先问 `G.playTargets.shotHit(p)`；撞世界那一行多问一句 `G.playTargets.through(p)`）；`src/core/touch.js` 两处（`_down` 在按钮之后、摇杆 / 看之前先问 `G.playTap.down`，点中题物的手指不出摇杆；`_up` 告诉它抬起了）；`src/main.js` 三行（`debug.frameTimes.start / stop`、每帧把 `_frame` 的耗时交给采样器）；`src/config.js` 只加了 `LEARN.play`、`LEARN.playUi`、`LEARN.m1`；`docs/PLAY.md` 更正了 3 处事实（4 个地方，见下）。

**PLAY.md 的更正**（只改事实，都标了「play-1 更正」）：
1. §1 第 1 条、§10：「DOM 里没有 `.iw-learn__panel`」→「没有显示出来的」——这个元素 `hud-learn.js` 建一次、一直在 DOM 里，用 CSS 藏。
2. §4 表：语法小测「2–3 个选项」→ 三周都是 3 个。
3. §6.1：「没点中题物 → 右半边看 / 射」→ 学习关里开火键从 B 起就藏着，没有「射」。

**给另外两期接的接口**（都在 `src/learn/play/`，纯的在 Node 里能 import）：
- `layout.js`：`layoutTargets(n, labels, aspect, safe, opts?) → { kind: 'ball' | 'banner', fits, cover?, items: [{ i, kind, x, y, r?, w, h, label: { x, y, w, h }, rect }], font, font2, rows?, d? }`（`labels = [{ text, zh }]`，`safe = { x, y, w, h }` CSS px，`opts = { avoid: [{ x, y, w, h, what? }], font, font2, bannerW, banner, maxD }`；`what: 'her'` 的框放不下时可以盖）；`isBanner(labels)`、`textWidth(s, px)`、`labelBox(label, font?, font2?)`、`bannerBox(label, w, font?, font2?)`、`wrapLines(s, maxW, px)`、`asProjected(items)`、`insideSafe(rect, safe)`、`overlaps(a, b)`。
- `pick.js`：`pickTarget(x, y, projected, opts?) → i | -1`（`projected = [{ i, kind: 'ball', cx, cy, r, label? } | { i, kind: 'banner', x, y, w, h } | { off: true }]`，`opts = { slop, minHit }`，默认 `LEARN.playUi`）。
- `hit.js`：`segSpheres(a, b, pad, spheres, out?)`、`raySpheres(o, d, max, spheres, out?)`、`plankSpheres(c, axis, w, h, target, out, k)`、`class ShotTargets`（`set(spheres, serial)`、`tag(p, target)`、`tagOf(target)`、`shotHit(p)`、`through(p)`、`clear()`、`onHit(target, point, deliberate, p)`）。挂上 `G.playTargets = registry`，`weapons.js` 就每颗墨弹问它；字弹（play-type）同样：`fireShooter` 之后 `registry.tag(list[n0], k)`。
- `atlas.js`：`gateLabels(items, promptOf, canPlay, bannerW?)`、`labelKey(label, banner)`、`packLabels(boxes, scale?, max?)`、`fitAtlas(boxes)`、`drawLabelAtlas(labels, opts?)`（DOM）、`LABEL_FONT`。
- `m1.js`：`M1_KINDS`、`isM1Item(item)`、`canPlayM1(item, p)`、`targetLabels(p)`、`answerOfTarget(p, k)`、`verdictLines(r, item) → { ok, head, why }`、`firstSentence(s, max?)`。
- `frametime.js`：`FrameTimes`、`percentile`；页面里 `__inkwave.debug.frameTimes.start()` / `.stop() → { n, p50, p95, max, mean, lost }`。
- `targets.js` `PlayTargets`（见文件头）；`run.js` `PlayRun`（`canAsk / ask / toCard / update / gateOpened / shoot / debug / dispose`）、`floodRegion(c, R)`（一块能交给 `paint.flood` 的圆）。
- `src/ui/play-strip.js`：`PlayStrip`（`show(p, { replay })`、`verdict({ ok, head, why })`、`question()`、`fit(keys)`、`rect()`、`playing(on)`、`hide()`、`setInk(hex)`、`dispose()`）、`VERDICT_H`。
- `flow.js`：`_judgeRecord(g, item, p, ans) → { r, first, again }`——唯一的判分路（字弹交一串字也走它）；`this.play`。`hud-learn.js`：`playMode(on)`。
- 触屏：`G.playTap = { down(x, y, id) → bool, up(x, y, id, cancel) }`——`touch.js` 在按钮之后、摇杆 / 看之前先问它（跑酷的滑动可以挂在同一个位置）。

**测试**（`npm run test:learn` 82 → 93，`tests/learn/play.test.mjs` 11 条；`npm run check` 222 个文件绿）：
1. `layoutTargets`：四个墨球在 390 × 844 竖屏（2 × 2 绕开她）、844 × 390 横屏（一排、她两边各两个）、iPad 820 × 1180 / 1180 × 820；三个、两个也各跑一遍——每个都在安全区里、互不重叠、不碰她 / 触屏键 / 小地图、≥ 44 pt、按选项顺序；墨球够大（手机 ≥ 56 px、iPad ≥ 80 px）又不超过标签高的 2.6 倍。
2. 63 个字符的横幅（比课程里最长的 54 还长）：四种屏都是横幅、字 ≥ 14 px、两行都在、竖屏手机一行一块、板子是图集的宽度（最多缩 20%）。
3. 她占满屏幕时（第一道门镜杆短）：横幅 / 四个 / 三个 / 两个墨球都盖住她、不盖触屏键、一个选项都不丢；整个安全区都要躲时也不丢；绕得开她时不盖。
4. `pickTarget`：中心、标签牌、外扩 16 px、小目标的 44 pt 下限、两个重叠选近的、横幅的角、两块横幅之间选近的、藏着的跳过。
5. 命中：400 条随机线段 / 射线，`segSpheres` 和 `Boss.prototype.segHit`、`raySpheres` 和 `Boss.prototype.rayDist` 逐条一样（`boss.js` 一字没动）；横幅的一排球中段都打得到、过了板头打不到。
6. 只有有意的直接命中才答：点射打中自己那个算；瞄 1 偏到 0 只溅、不答；没标记的、上一题标记的、别人的幽灵墨弹不答；穿过两个之间什么都没打到；只有这一题的那颗能穿过场景（上一题的、没标记的、题物收了以后的都不能）。扫 `weapons.js`：登记处只出现在 `_new` 和 `_step` 的三行，`_blastBurst` / `_sloshSplash` / `_updateBombs` / `applyHit` / `_impact` 里都没有——**溅射不会答题**是代码结构保证的。
7. 第 1 期的分类：三周 `canPlayM1` 的正好是 单词选义 450、语法小测 138、发音小测 76；换问法都是重排、没有一个变成打字；音标、阅读、听辨、听写、单词卡、写句、口语、课文都还是卡片；翻牌、打字换问法、5 个选项的不算。
8. **等价**：单词、语法、发音各一题 × 对 / 错，再加一个重排过的换问法：「卡片点第 k 个按钮」和「墨靶：竖屏排布 → 点第 k 个题物的中心 → `pickTarget` → `answerOfTarget`」交给同一个 `LearnFlow.prototype._judgeRecord`——`judge` 的结果、`store.recordFirst` 的参数和写下的叶子、`first`、锁、换问法、`learn:answer` 事件逐项相等；当天第二次都是 `first: false`。
9. 题条的字：错 = 「差一点：是 <对的选项>」+ 课程自己的「为什么」第一句；对 = 「答对了」。
10. 图集：三周每道 M1 门的标签去重后都装得下（≤ 1024 × 1024），单词门在 2 texel / px 下都在 1024 × 320 以内，全是球的门都是满比例，最挤的门（9 块长横幅）≥ 1.5。
11. 帧时间采样：nearest-rank 的 p50 / p95、没开不记、满了只计数不长。

**实测**（`tools/learn/play-audit.mjs`，静态服务把这个工作树放在 `/game/` 下，Chromium 软件 GL（SwiftShader）、`?quality=low`、阴影 / 泛光关、时钟冻住手动步进；`?learn=w1d1&kind=puzzle&short=1&gate=2`，两道门：单词选义 2 题 + 语法小测 2 题；横幅用 `w2d2` 第 2 道门；每次：先点错一个，再全点对走完两道门；2026-10-16 UTC，跑在哪个提交上写在括号里）：

| 视图 | 结果 | 第一道门的排布 | 出题 → 题物出来 | 点 → 墨弹出膛 / 墨弹 → 命中 / 命中 → 判 | draw call |
|---|---|---|---|---|---|
| 竖屏 390 × 844 触屏（13:50，`913916e`） | 全过，4xx 0，控制台错误 0 | 2 × 2 墨球，直径 60–62 px；第二道门 2 + 1、51 px | 1.85 s（她还在减速，站住后重挑取景），之后 0.27–0.31 s | 0.15 / 0.23 / 0 s | 58–59，第二道门 73 |
| 横屏 844 × 390 触屏（13:58，`99b0abf`） | 全过，4xx 0，错误 0 | 一排 4 个、60 px；第二道门一排 3 个 | 1.52 s，之后 0.27 s | 0.13 / 0.05 / 0 s | 81–83 / 71 |
| 桌面 1280 × 720 鼠标（14:04，`99b0abf`） | **7 条红**：第二题「准星压着按开火」的墨弹从球边擦过去、没答（题物被拉到她前面 1.6 m，`_aimFrom` 对 2 m 以内的目标改用镜头准星那条线）。`96266ca` 改成从枪口直接瞄，**改后桌面没在浏览器里重跑** | 一排 4 个、96 px | 1.5 s | 第一题 0.15 / 0.03 / 0 s | 79–81 |
| 横幅 竖屏（14:14，`d08d007`） | 全过 | 3 块横幅一行一块；图集 1024 × 576（2 texel / px） | 1.9 s，之后 0.26 s | 0.12 / 0.11 / 0 s | 60–61 |
| 横幅 横屏（14:19，`96266ca`） | 全过 | 两块并排 + 一块 | 1.51 s，之后 0.26 s | 0.04 / 0.05 / 0 s | 82–84 |

每次都核了：出题时没有显示出来的 `.iw-learn__panel`、`match.paused === false`、`learn.hold` 为假、触屏层活着、题条在、每个题物的投影都在安全区里；点错 → 墨弹落到才判、`learn:answer` 只一次且 `first: true`、点的那个珊瑚色、对的那个描她的墨、门上一把锁（珊瑚色）、题条「差一点：是 ___」+ 为什么；之后全对，换问法那题 `first: false`，两道门都开。截图都自己看过（竖横、对错、横幅），看完删了，留了 4 张给主会话（见报告）。

**帧时间**（竖屏，同一个舞台，`debug.frameTimes` 记 `main.js _frame` 里 CPU 这边一帧的毫秒数——SwiftShader 下只能比相对值，真机另说）：先空走 30 帧再采 60 帧。普通走路 p50 3.7 / p95 7.1 ms；第一道门出题、题物在（不动）p50 2.9 / p95 6.3 ms——**比走路还低**（−22% / −11%）：站着不动比走着省（没有脚步、跟随、地面探测的那部分），题物自己最多 4 个 draw call。PLAY §7 的「p95 不差过 10%」在这台机器上是满足的；它没有量到 GPU 那边（软件 GL 的时间在 `_frame` 之外）。

**其它形式的审计**（`play-audit.mjs --script` 重放现有的步骤脚本，14:25 起，`ec0b343`）：解谜卡片路（`play-desktop.json`，开关开着、卡片题照旧）、道具赛、对抗赛、Boss、道具赛竖屏（`play-forms-phone.json`）、开关关掉的解谜（`&play=0`）六个全过，4xx 0、控制台错误 0。

**在 `ec0b343` 之后没在浏览器里重跑的改动**：门的光柱 / 锁在答题时淡掉（`99b0abf`、`d08d007`，横幅两次跑过）、标签牌也要镜头看得见（`d08d007`）、点射从枪口直接瞄（`96266ca`，只有横幅横屏跑过）、答错的标签牌只洗底色（`ec0b343`）。

**拿不准的（自己定了，请主会话过目）**：
1. **阅读题没进第 1 期**：PLAY §9 第 1 项把阅读题列进 M1；这一期的任务书只要单词选义、语法小测、发音小测（阅读题要先看课文，是 M6 展板 → M1 横幅，和展板一起做更顺）。`listen · read` 60 个条目在开关下照旧是卡片；要加只改 `m1.js` 的 `M1_KINDS`（54 个字符的横幅已经按这个测过）。
2. **点射那颗墨弹穿过场景**：照任务书「墨弹真打到才判」，但第一道门前的喷泉柱子挡在她枪口和题物之间时（镜头看得见题物，枪口看不见），这一下就永远答不了。现在这颗记着这一题的墨弹不被场景挡（`weapons.js` 多一行），取景和放置也先避开挡着的姿势——正常情况下它本来就不穿什么；穿的时候是一帧的事。不想要这个就删那一行 + `ShotTargets.through`，代价是这种门会点了没反应。
3. **答错的珊瑚色只停 `LEARN.ui.verdictMs`（1.1 秒）**：照任务书。题条上 1.1 秒读一句「为什么」偏短——要更长改 `LEARN.ui.verdictMs`（卡片答对的自动继续也用它），或者给墨靶单独一个数。
4. **点射打的是一颗 shooter 墨弹**：她拿着别的武器时也一样（她的武器是 shooter 就用她武器的参数），不扣墨。桌面上「准星压着按开火」是同一颗（她自己的武器照样开火，那些墨落到题物上只溅、不算答）——按住开火扫过去不算，要压着再按。
5. **一道门一张图集最大 1024 × 1024**（PLAY §7 写的是 ≤ 1024 × 512）：按 2 texel / px 画（3 倍屏上标签不糊）；单词门都是 1024 × 128–320，语法 / 发音门有的要更高，两道装了 9 块长横幅的门缩到 1.5–1.75。同时活着的最多 3 张。要守 512 就把 `LEARN.m1.atlasScale` 降到 1.5。
6. **题物出现的时机**：题条和读音先出来，相机缓到取景、停稳后（实测 0.26–1.9 秒，见上：长的那次是她到门口还在减速）题物才弹出来；比「到门前立刻出现」慢一点，但一出来就在排好的位置上、不会跟着相机漂。第一道门那种身后是台阶、面前是喷泉的地方，镜头会侧过去 50° 左右去找一片空的地方。
7. **挤的时候题物可以盖住她**（`cover: 'her'`），不盖触屏键和小地图；她自己挡着的那个题物照样点得到（点的是题物的投影）。
8. 墨球的颜色：中性的淡紫灰（`#a39db8`，HUD 的 muted 那一路），舞台的环境反射会把它染一点，看着像墨，没去压。

**只代码审过、没在浏览器里看到的**：第二次答错（`wrong2`：`ui_toggle`、不再排回、门照开——和卡片同一个 `_judgeRecord`，单元测试里核了锁和队列）；减少动态效果（不缓相机、按当前相机直接放、只有一圈 `fx.ring`、flood 直接到终态）；转屏时正在问的题重新排布；她拿着非 shooter 武器时的点射；iPad 只在 Node 的排布测试里。

**没做的**：
1. 阅读题（`listen · read`）、音标、听辨、听写、单词卡、写句、课文、口语、翻牌、打卡 / 周报牌——这一期在开关下照旧是卡片（一题一题地暂停），各等自己的那一期。
2. 选择题答错后的「回炉」：解谜本来就没有回炉门，换问法后第二次错就给答案——照旧。PLAY §4 的「单词选义回炉换成 M4 打这个词」等 play-type 的键盘接进来。
3. 道具赛、对抗赛、Boss、双人两种：照旧卡片（`this.play` 只给解谜本身）。
4. 连对 3 / 连对 5 的演出（`EFFECTS.puzzle.streak3 / streak5`）：解谜里 B 本来没做，这一期也没加。
5. `play-quiz-chain.json`（解谜 → 小考）没重跑：`drive-forms.js` 等的是卡片，开关下解谜的墨靶它不会答，要一个认墨靶的驱动（或者加 `&play=0`）；小考本身是对抗赛那一轮，`play-forms.json` 的对抗赛跑过了。
6. 真机：iPhone 上的帧时间、手指点小球的手感、`quality=low` 下的清漆材质——SwiftShader 只能比相对值。

**交接**（收尾时写；分支 `play-1`，没推）：
- **已完成**：开关 + 题物系统 + 题条 + 解谜里三种选择题（单词选义、语法小测、发音小测）走 M1 墨靶，竖横和桌面都能答；判分和卡片同一条路（`_judgeRecord`，Node 测试逐条对拍）；其它条目在开关下照旧暂停 + 卡片；开关关掉一字不差。`npm run test:learn` 93 / 93，`npm run check` 222 个文件绿。
- **还缺**：(1) 桌面「准星压着开火」在 `96266ca` 的修法之后没在浏览器里重跑——先跑 `node tools/learn/play-audit.mjs --view desktop`（要加 `--shots <dir>` 才截图）；(2) 竖屏 / 横屏的最终截图是 `913916e` / `99b0abf` 上的，之后的四个小改动（锁和光柱淡掉、标签可见、枪口瞄准、错牌只洗底色）没截图；(3) 上面「没做的」那几条。
- **先看哪些文件**：`src/learn/play/run.js`（运行层：出题、取景 `_frame`、放置 `_place`、点射 `shoot` / `_fire`、判 `_answer`、`debug()`）→ `layout.js`（排布）→ `targets.js`（三维）→ `hit.js`（命中、`through`）；`src/learn/flow.js` 里 `this.play` 出现的地方；`tests/learn/play.test.mjs`；审计 `tools/learn/play-audit.mjs`。
- **已知坑**：
  1. 第一道门（`tidewater` 出生台阶底下、面前是喷泉）最难：她到门口还在减速，镜杆被身后台阶顶到 2–2.9 m；取景会侧过去 50° 左右找一片空地方，横屏 / 桌面有时不转（镜杆短、题物被拉近到她前面 1.6 m）。`place` 日志（`debug().log`）里有 `D`、`boom`、`blocked`、`cover`、`avoid`、`rows`、`d`，先看它。
  2. `Projectiles._aimFrom` 对 2 m 以内的目标用 `aimDir`——点射前 `_fire` 已把 `aimDir` 设成从枪口指向题物；改武器代码时别把这个顺序弄反。
  3. 点射那颗墨弹不被场景挡（`ShotTargets.through`，`weapons.js` 一行）——它要是没打到题物，会一直飞到 `life` 用完；`shot` 1.4 s 后清掉、她可以再点。
  4. 桌面上按开火时她自己的武器也开一枪（不算答），那颗常常先到、先在题物上溅一下；有意的那颗随后到才判。
  5. 审计要等题物出来再核（`untilPlaced`）——出题到题物出来 0.26–1.9 s；固定等 1.25 s 会偶尔核到还没放的题物。
  6. `LEARN.m1` 的数（`near / far / clear / frameFor / turnFor …`）都在 `config.js`，改取景先改它们。

## 19. 字弹 M4 交付（2026-10-16，分支 `play-type`：打字蟹 type rig + 游戏键盘 + 3D 墨字——独立做好、在实验室里验过，接进门的流程是下一步）

业主 10-16：「最好迅速做一个键盘模型或者更有游戏性的模型以及键盘按键映射动画，或者不需要按键映射 保留输入时的人物运用该模型武器的动画，直到输入好了就展现出立体的3d输出结果在游戏世界里，有真正的游戏性交互效果」。要打字的题占课程的一半（单词卡 900 记 `T`、听写句 206 记 `L` 带百分数、写句 102 记 `W` / `S`），所以打字本身得是玩法。PLAY §3 M4 已改成做出来的样子。

**先读了什么**：PLAY 全文（§1 不变量、§3 M4、§6.4 键盘、§7 预算）；本文 §1、§5、§8（证据方式）、§15–§17；LEVELS §5（演出、声音、减少动效）；CONTRACTS（`trigger` / `setDance`、§2 的声音名）。代码：`special-props.js` 的 `buildCrab`、`specials.js` 的 `IMPL.crab`（`propMesh` / `partMesh`、`seatY` / `seat`、`weaponHidden`）、`actor.js` 第 1012 行的座高、`character-weapons.js` 的 `GEO_KIT`、`character-mats.js` 的塑料 / 墨 / 玻璃材质、`character.js` 的 `trigger`、`fx.js`、`paint.js`、`audio.js` 的声音表、`weapons.js` 的 `fireCustom`、`engine.js` 的 `judge`、`store.js` 的 `modeOf`、`vendor/ielts/host.js` 的 `dictScore` / `lcsOk`、`cameraRig.js`（视角是 Hor+：竖屏横向很窄）、`touch.js`（触屏层挂在 window 的捕获阶段）、`tools/fx-lab.js` / `core-lab.js`（实验室怎么照着游戏搭）。

**先定的**：
1. **提交前不给对错，做成结构上的**：打字蟹、键盘、墨字在「射」之前根本拿不到答案——`press(key)` 只有一个参数，`begin({ mode, target })` 不收答案（多给的字段也不看），答案只从 `resolve()` 进来。键帽亮的是她的队色（每个键一样），纸上的字是**一个**颜色 uniform（`LEARN.type.glyph`，中性灰，没有任何输入能改它），打出去的墨字在 `resolve` 之前一律中性灰（`LEARN.type.word`）。
2. **键盘是游戏画的**（DOM，按模式建一次，按下只改 class）；每颗键的位置来自纯函数 `keyboardLayout()`，Node 测试量的就是画出来的东西。
3. **打字蟹不另起炉灶**：壳、六条腿、迫击炮就是 `getSpecialProp('crab')` 的几何，和 Crab Rig 同一套玩具塑料和她的墨；静的部分（壳 + 腿 + 打字机外壳）合成一个塑料网格 + 一个墨网格，会动的部分用 instancing。舱盖拿掉了（它正好立在左手边那几颗键上）。
4. **两个机位，不是一个**：一个画面同时框住键盘、纸和 6.5 m 外的字，竖屏里要退到 10 m 开外，键帽就小得看不见了——所以打字时框打字蟹，按「射」后弹簧过渡到墨字（键盘缩下去）。纯函数 `frameFor({ phase })`，交给 `cameraRig` 的弹簧过渡，不切镜头。
5. **一题里的先后用同步回调串**（落地 → 长字 → 判，都在 `update()` 里），对外照样给 Promise；所以固定步长的实验室脚本能一帧不差地复现每个状态。

**改了什么**（都在 `src/learn/play/type/` + `src/ui/play-keys.js`，别人的文件只有两行）：
- `keys.js`（纯）：按键集合（a–z、空格、`'`、`-`；句子再加 `. , ?`；⌫、射）；3D 键盘四排（QWERTY + 空格，⌫ / 射在右边，34 颗）；游戏键盘竖横两套版式——竖屏一行 10 个、键约 34 × 50（iOS 系统键盘的大小），上面一条「打出来的字 + ▶ 再听 + 提示」，占屏 39%（iPhone SE 41%）；横屏三行宽键约 50 × 44，▶ / 提示在前两行行首，打出来的字只在世界里的纸上，占屏 44%；实体键映射 `keyOfEvent`（大小写、Enter = 射、Backspace、弯引号算 `'`、⌘ / Ctrl 组合不算、Esc 不碰）。
- `deck-geo.js`：打字蟹的几何——蟹钳托着的打字机：键盘托（奶白壳 + 深色键槽 + 队色边条 + 螺丝）、字杆窝（深色半碗 + 奶白扇骨圈）、两根侧塔 + 托架导轨、两根插进蟹钳的立柱、墨罐托和软管；一颗键帽（厚圆角、微凹、顶上有字的 uv）；一根字杆（金属臂 + 深色字锤）和 31 根的半月扇（静止和敲击两个姿态，每根的锤正好落在滚筒的敲击点上——测试核）；滚筒 + 旋钮 + 压纸杆；墨罐玻璃和墨柱；纸卷成的弹。
- `atlas.js`：一张字图（8 × 5 格、Titan One 小写；⌫、射画成图标，WebGL 里不需要中文字体），键帽和纸共用；字体加载完自动重画。
- `mats.js`：键帽材质（塑料的光泽档 + 顶上的字 + `lit` 时染队色并自发光）；纸的材质（字从一张 14 × 32 的字格纹理读：打字机式的歪斜和深浅、刚打的字鼓一下、⌫ 的字往上飘走；撕纸、卷纸在顶点着色器里；字比格宽，每个片元看左右邻格）。采字图用 `textureGrad`、导数在统一控制流里取，格子之间不会出 mip 的方框；格号用整数安全的算法（第一版 `mod` 的浮点误差把第 0 列的 q / y / i 画成了乱码）。
- `rig.js`：`TypeRig`——`mount(actor)` / `unmount()`（藏武器、`actor.learnSeat`）、`press(key)`（这一帧键帽下沉亮队色、字杆起甩、托架和纸在 50 ms 后敲上去那一刻印字、往左走一格）、`backspace()`、`fire(text, target, onLand)`（撕 → 卷 → 跳进炮 → 后坐 + 整台蹲一下 → 抛物线 → 落地溅灰墨，船身先转向靶子）、`reset()`（新纸从滚筒里升上来）、`update(dt)`、`warm()`、`dispose()`；纯的纸模型 `paperModel / paperType / paperBack`（空格到第 9 格以后是回车「叮」、满 14 格自动换行、⌫ 跨行时纸和字对得上——测试拿一长串打打删删核过）。
- `inkword.js`：`InkWord`——`prepare(text)`（排版 + 画布 + 采样，按文字缓存：`TypeShot` 在「射」那一下、`resolve()` 在纸弹还在天上时就做，字出现的那一帧不卡）、`assemble(text, at, { from, face })`、`resolve(verdict)`、`clear()`（还在等这个字的 Promise 一律落地，流程不会卡住）、`update()`、`warm()`；墨珠 `InstancedMesh`（她的字一段、正确答案一段，同一个 draw call），iPhone low 用 20 面的珠子，其余 80 面；纯的 `layoutText`（一个词一行 0.62 m 高，长句先折行再缩，装进 4.4 × 1.9 m，不拆词）、`sampleMask`（六角格采样，间距自适应，永不超过上限，最小间距按米算——短词是饱满的墨珠不是沙子）、`typedMarks`（听写里她打的哪几个词对上了，只管显示，判分仍是宿主的 `dictScore`）、`wordBox`（给墨字机位）。
- `shot.js`：纯状态机 `typeStep`（idle → typing → firing → assembling → shown → resolving → done；判早来了就等字长好）+ `TypeShot`（打字蟹 + 墨字）+ `isReduced()`（系统的减少动效或设置里镜头震动为 0）。
- `frame.js`：两个机位（她右肩后上方；她的头要低于键盘中间那排——宽屏放宽到最远一排；打字时框住正在打的两行和十个字母后滑到左边的行首，纸上面空白的部分可以压在题条下；墨字机位在宽屏上可以拉近焦距，让字占到屏宽的八成左右，返回的 `fov` 交给 `cameraRig` 的 zoom）。
- `src/ui/play-keys.js`：`PlayKeys`——`pointerdown` 就出字（两个拇指快打）、按下染她的队色 + 回弹、长按 ⌫ 连删、提示用过变暗、`show()` / `hide()` 是带回弹的滑入滑出（减少动效时只淡入淡出）、实体键盘在捕获阶段只接打字的键（不会变成走路，Esc 照旧是暂停）、`PlayKeys.owns(e)`。
- 别人的两行：`actor.js` 第 1012 行的座高加上 `this.learnSeat`；`config.js` 加 `LEARN.type`（三个颜色、按键停留、印字延迟、回车格、墨珠上限、字高 / 框、飞行时间、判的演出时长）。
- 实验室 `tools/type-lab.html` + `type-lab.js`：游戏自己的 `Renderer`（同一套后期和调色）、`Environment`、`FX`、声音、小鱿鱼 + 打字蟹 + 一个灰墨球靶子；默认一块轻甲板（地面墨点用 fx-lab 那种圆片代替），`?stage=tidewater` 换成真的 Tidewater 关卡 + 真的 `PaintSystem`；`?quality / ?mode / ?reduced / ?shadows=0`；`window.lab`：`freeze / step(ms) / render / type(str) / press / back / submit / resolve / demo('right'|'wrong'|'pct') / next(mode) / frame / measure / warm / state`。

**接口（门的流程要调的）**：
```js
import { TypeShot } from './learn/play/type/shot.js';
import { frameFor } from './learn/play/type/frame.js';
import { wordBox } from './learn/play/type/inkword.js';
import { PlayKeys } from './ui/play-keys.js';
// 关卡载入时（或前两道门）：建好、预热——compileAsync 就地编译，不挪对象，在屏上也能跑
const shot = new TypeShot({ scene: G.scene, team, color: G.teamColors[team], quality: G.settings.quality });   // reduced 默认 isReduced()
await shot.warm(G.renderer, G.camera, G.scene);
const keys = new PlayKeys(uiRoot, { mode: 'word', color: teamHex, replay: true }); keys.hide();
// 一道要打字的题（单词卡 'word'；听写句、写句 'sentence'）
shot.mount(G.local);                  // 进舱。流程负责：停住她的移动 / 开火输入、关掉触屏层（或让 touch.js 跳过 PlayKeys.owns(e)）
shot.begin({ mode, target });         // target：字靶的 Object3D 或 Vector3；墨字长在它上方 shot.lift = 0.95 m
keys.setMode(mode); keys.clear(); keys.setHintUsed(false); keys.show();
cameraRig ← frameFor({ phase: 'type', aspect, kbFrac: keys.frac })        // 打字蟹坐标：原点在她脚下、+Z 朝靶子
keys.onKey = (k) => shot.key(k);  keys.onBackspace = () => shot.back();
keys.onHint = () => { shot.hint(); keys.setHintUsed(true); /* 题条给音标 / 首字母，这一题记 H */ };
keys.onReplay = () => { /* 再放一遍 */ };
keys.onSubmit = () => {
  const text = shot.submit(); if (text == null) return;   // 空的不发
  keys.hide();
  cameraRig ← frameFor({ phase: 'word', aspect, word: { ...wordBox(text), y: targetY + shot.lift } });   // 带 fov（宽屏会拉近）
  const v = judge(item, text);                            // 立刻判、立刻记首答：typed，hinted = shot.hinted
  shot.resolve({ ok: v.ok, pct: v.pct, right: v.canonical, toks: v.toks }).then(nextItem);   // 字长好了才演，演完 resolve
};
// 每帧 shot.update(dt)；下一题 shot.clear(); shot.begin(...)；这段打完 shot.unmount()
```
接的时候要注意的三件事：① `frameFor` 给的 `fov` 不能直接写 `camera.fov`——`cameraRig` 每帧按 `vBase + (fovKick − zoom) × 0.8` 算 fov，所以设 `zoom = (vBase − fov) / 0.8`；机位是打字蟹坐标（原点她脚下、+Z 朝靶子），按她的位置和朝向换到世界里。② `PlayKeys` 在 `enabled && visible` 时接走实体键盘的字母：暂停菜单、设置一打开，流程要 `keys.enabled = false`（或 `hide()`），不然字母会穿过暂停屏打到打字蟹上。③ 船身跟着 `actor.yaw` 转（射的时候自己转向靶子）；出题时她的朝向、移动、开火、触屏层都归流程管（`touch.js` 在 window 捕获阶段收 pointerdown，键盘拦不住，用 `PlayKeys.owns(e)` 跳过或整层停掉）。

**测试**：`npm run test:learn` 82 → 118（`type-keys` 18：8 种屏 × 两种模式的键盘版式——键 ≥ 44 高、≥ 30 宽、都在屏里且躲开安全区、不重叠、这个模式的每个键正好一次、竖屏 iOS 尺寸和占屏比例、横屏占屏比例——加模式的键集合、实体键映射；`type-rig` 7：每个键一颗键帽 / 每个能打字的键一根字杆 / 一个字图格、键帽不重叠、每根字杆落在敲击点上；Node 里按键：同一次调用里键帽动、亮、字杆起，50 ms 后印字、托架走、⌫ 擦掉，挂载 / 卸下时武器和座高；**不泄露**：同样的按键、两个不同的答案，每一帧的键帽颜色 / 矩阵 / 纸上的字 / 墨色一模一样，打错的前缀和打对的前缀一样，按键前后墨色不变，接口的参数个数，源码里没有判分字眼；珊瑚色离每个队色都远；纸模型（回车、自动换行、⌫ 跨行，一长串打打删删字和纸始终对得上）；声音名都在 CONTRACTS §2、不用 `ui_error`；`type-inkword` 5：排版、字的范围、采样上限和落点、听写的词对上、两个机位在三种屏上都框得住；`type-shot` 6：状态机、早到的判、乱序事件不改状态、固定步长下一题从打到判完（三种判）、减少动效（不跳、不震、照样打完）、听写全对上时参考句不会被一起收掉——这条是截图里抓到的 bug 的回归测试）；`npm run check` 222 个文件绿。

**实测**（headless、都在 `flock -w 9000 /tmp/ielts-browser.lock nice -n 10` 里，`/opt/pw-browsers/chromium` + SwiftShader、`?quality=high`（打字蟹那几张）/ `low`（Tidewater 那张）、固定步长 `lab.freeze() / step()`；截图看过）：
- 竖 390 × 844 触屏：打字（键帽 s 下沉亮队色、它的字杆正甩向滚筒、纸上已经印好 beautifull、键盘上一条同样的字）、句子模式（三行：空格到第 9 格回车「叮」、纸往上卷）、打错（beautifull 变珊瑚色往下塌、几颗墨拉成滴，beautiful 在上方用她的墨长出来）、打对（jump 炸开成她的墨、字下面落一大片、飞散的墨珠在地上溅点）、听写 `i usualy get up at seven`（对上的五个词炸开，usualy 留着变珊瑚色；参考句两行长在上方，usually 和 o'clock. 是珊瑚色）。
- 横 844 × 390 触屏：打字（三行宽键，打字蟹偏小，纸上的字认得出）、纸弹飞向靶子（墨字机位拉近了焦距）、打错（字占屏宽约一半）。
- 桌面 1280 × 720：打字（打字蟹占屏宽约三分之一，最好看的一档）、打对的炸开。
- 侧面特写：她坐在舱口里，每按一个键手臂就往前伸向键盘（`shoot` 让她进入 0.5 s 的举枪姿势，武器藏着，看起来是伸手去打字），字杆在敲。
- 真关卡：`?stage=tidewater&quality=low&shadows=0`（真 `Level` + 真 `PaintSystem`）：打字、打对、打对以后地上真的涂上了她的墨。
- 每组都在锁里一次一个，`4xx: 0`，控制台除了 SwiftShader 没有并行编译扩展的提示没有别的。留给主会话的 6 张见交付报告。
- **draw call / 三角形**（`lab.measure()`：打字蟹 + 墨字，开关对比）：iPhone 档（`quality=low`、阴影关——触屏默认就是关）：打字时打字蟹 **10** 个 draw call（壳、壳的墨、炮 ×2、键帽、字杆、滚筒、纸、墨罐 ×2；纸弹在天上时 11），墨字 **1** 个（她的字和正确答案同一个 `InstancedMesh`），合计 ≤ 11；三角形：打字蟹 4.65 万（其中 Crab Rig 自己的壳和腿约 2.6 万），墨字 ≤ 1.9 万（≤ 954 颗 × 20 面）。桌面 `high`（阴影 + GTAO）：每个网格还会被 GTAO 再画一遍、投影体再进一次阴影图，打字蟹 22–28、墨字 4；只留壳、墨、纸、纸弹、墨字投影（第一版什么都投影时是 32–40）。
- **每帧 JS**：`shot.update(dt)`（打字蟹 + 墨字，每帧不分配）平均 0.02–0.6 ms（打字时 0.02–0.04，两千颗墨珠在演的时候 0.3–0.6），单帧最长 ≤ 5.5 ms；这是这台机器的 CPU，不是手机。**光栅化（画布 + `getImageData` + 采样）没有消失，是挪了地方**：`submit()` 那一帧 6–11 ms（和键盘收起同一帧），`resolve()` 时正确答案那一份 3–8 ms（纸弹还在天上）；原来是在落地、字长出来的那一帧，约 9 ms。
- **预热**：`shot.warm()`（`compileAsync` 就地编译打字蟹、纸弹、墨字的材质）在这台机器上 32 ms（low）/ 73 ms（high）；SwiftShader 没有 `KHR_parallel_shader_compile`，是同步编的。
- 软件 GL 下没有帧率可言（一帧零点几秒），iPhone 上的帧时间要真机量（PLAY §7 的 p95 对比是接进流程以后的事）。

**拿不准的**：
1. **人物「操作」的样子**：只用了现成的一次性动作（每键 `shoot`、射 `throw`、对了 `jump`）。侧面看：每按一个键 `shoot` 让她进入 0.5 s 的举枪姿势（武器藏着），双手往前伸向键盘、一顿一顿，连着打就一直伸着——读得出「在操作」。但打字机位在她右肩后上方，从那里主要看到头发和肩膀，手臂只露一点；按「射」的 `throw` 也一样只在侧面看得清。要更明显得给 `character.js` 加一个打字的动作——那是别人的文件，这次没动。
2. **横屏打字时打字蟹偏小**：题条和键盘之间只剩约 150 px 高，键盘托只占屏宽约 20%（竖屏约 80%、桌面约 35%）；纸上的字还认得出，但不如竖屏。横屏没有「打出来的字」那一条（放不下），字只在纸上。要更大，可以以后做横屏的分体键盘（左右两半贴屏幕两边，中间留给世界）。
3. 打字机位竖屏里看不到靶子（靶子在画面上沿外面一点）：要把 6.5 m 外的靶子也框进来，相机得退到 8–10 m，键帽就小了。靶子在「射」之后的墨字机位里。如果业主要打字时也看见靶子，可以让字靶飘近到 4 m 再停（PLAY 的「飘近、停住等她」），或接受键帽小一点。
4. 墨字的字高 0.62 m、竖屏墨字机位里一个 10 个字母的词约占屏宽 70%；听写长句缩到一行 0.3 m 上下，iPhone low 的 480 颗墨珠时笔画是一两颗珠子宽——能认，但不如单词饱满（截图 h4）。
5. 听写里「她打的哪几个词炸开」用的是我这边的逐词对齐（`typedMarks`，只管显示）；份额和 `dictScore` 的百分数大体一致，英美拼写、数字写法不同时会差一两个词。要严格一致，流程可以用宿主的 `lcsOk` 算好传 `typedOk`（接口留了）。
6. 打字蟹约 2.3 m 长、2 m 宽（托架滑到头时纸还要伸出半米）：要放在门前开阔处，靠墙会穿模（它只是画面，没有碰撞）。

**没做的**：
1. **接进门的流程**（`flow.js` 归 play-1）：上面的接口照着接；触屏层在键盘升起时要停（`touch.js` 在 window 捕获阶段收 pointerdown，键盘拦不住）。
2. 回炉 M1 ↔ M4、跑酷的「滑行段」、联机里的打字（答案还是一串字，接法照旧）。
3. 「我的写法也对」的按钮在题条上（play-1 的 `play-strip.js`）；这里只负责把对 / 错演出来。
4. 真机：iPhone 的帧时间、触感（`pointerdown` 出字、长按连删）、横屏刘海两侧的安全区（版式测试按 47 px 算过）。

## 20. play-runner 交付（2026-10-16，分支 `play-runner`：墨浪跑酷——道具赛的跑酷版，PLAY §3 M2 / M3 · §5.2 · §6.3 · §8）

业主 10-16：「利用 INKWAVE 现有的素材和玩法二次开发出来那些跑酷、选择车道等新玩法，画风和流畅度保持一致」「如果横屏更适合游戏 则横屏不丢」。这一步只做跑酷本身：`race.js` 一行没动，跑酷是新模块 + 一个调试入口 `?learn=w1d3&kind=runner`，等主会话决定什么时候让道具赛换成它。

**先读了什么**：PLAY 全文（§1 不变量 4–6、§3 M2 / M3、§5.2、§6.3、§8）、LEVELS §2.2 / §2.4 / §5、LEARN §1 / §8 / §13；代码：`race.js`、`common.js`（`loopRoute` / `cumulative` / 机器人 / 道具）、`nav.js`（1 m 格子只记「能站人」，没有路宽；栏杆是「两格之间没有边」）、`actor.js` + `physics.js` + `PLAYER`（`swimSpeed` 11.8、`swimJumpVel` 9.4、`enemyInkDecel` 30、爬墙 / 翻上台阶）、`paint.js`（`splat` 的 roll 带、`flood` 要 `{ cells, polys, y0, y1 }`）、`subs.js` 的 Drip Curtain 着色器、`music.js`（合成曲的 `Player` 有 `bpm / t0 / stepDur / barDur / nextBarTime`；录音没有拍子）、`touch.js`、`cameraRig.js`（follow 把她放在准星上、鱿鱼吊臂固定 4.1 m；`main.js` 每帧把不是 follow / path 的镜头拉回 follow）、`engine.js` / `store.js`、`drive-forms.js`。量了三周：每个道具赛日 50–68 行选择题（听辨对子 8–10、音标 0–48）+ 30–166 个打字题；四个选项的题里没有长标签；横幅题 75 题。

**先定的**：
1. **不改 `race.js`**：`?learn=…&kind=runner` 在 `forms/index.js` 一行路由，返回 `kind: 'race'`（`match.js` 照道具赛建她 + 3 个没脑子的机器人、solo）、`Flow: RunnerFlow`。`RunnerFlow` 继承 `RaceFlow`：机器人 `_bot`（同一条路线、`BOT_ANSWER` 骰子、橡皮筋）、名次、道具袋和道具效果、`_onRight` / `_onWrong2`、星照用；只换掉卡片和定身的部分（`_place / _arrive / _askNext / _answer / _open / _finishLine / _finishDone / _results / update`）。主会话要让道具赛变成跑酷时，把 `FLOWS.race` 指向 `RunnerFlow`（或在 `LEARN.play` 开关下）即可。
2. **一行 = 一个条目，所以跑很多圈**：一天 50–68 行 × 每行 25–45 m ≈ 1.4–2 km ≈ 8–12 圈（7 张舞台的圈 158–207 m）。路线就是道具赛那一圈，首尾相接重复 N 圈（`this.path`，机器人照它跑）；检查点 = 每道门第一行的读题区起点；终点 = 她最后一行之后那一圈的起点，重答 / 没答多出来的行把终点往后挪，机器人跑同一条线。
3. **净宽量的是她的身子能到的带**：导航网格的可走带已经让开了墙（胶囊 0.46 m），所以题行要「各道的幕都在可走带里」= 道数 × 1.5 − 0.5 m（墙到墙就多于道数 × 1.5 m，PLAY 的规矩）；扫的时候栏杆（相邻两格没有走路边）、坡和台阶（比路面高 / 低 0.45 m 以上）都算到头。路线先拉直（string-pulling：直线在可走格上、每格之间有边、最多 14 m）再平滑——A* 的 8 向锯齿只平滑还是弯的，题行要一段直路（量过：只平滑、要 5 m 助跑时 7 张舞台能放两道的路线点 5–36%；拉直、3 m 助跑后 36–74%）。跳上台阶的边前后 8 m 不放行：那里墨道把她收回路中间去跳。
4. **少一道之前先往前挪**：PLAY 的顺序是「不够宽少一道，两道都放不下再挪」；少一道就是少一个选项、题变了，所以先在 10 m 内找放得下全部道的点，再在原处少一道，再往前 40 m 内找少一道以内的点，最后才降到两道（7 张舞台 w1d3 的 50 行，见下面的表）。
5. **速度只走 `PLAYER.swimSpeed`**：她自己的 `update` 里把 `swimSpeed` 乘上 `swimK`（墨潮 × 答对的加速 × 珊瑚幕的减速），珊瑚幕那 0.9 秒里 `swimDecel` 换成 `enemyInkDecel`（陷进敌墨的手感，不掉血、不用敌人的颜色）；`update` 一结束就还原（机器人从不游泳）。加速、转向、跳（`swimJumpVel`）、潜、爬墙、翻台阶全是 `actor.js` 自己的；路上的墨是真涂的（`paint.splat` 的 roll 带，前方 18 m），她在上面才是「潜在墨里」。
6. **「拍」落在换道上**（PLAY §3 M3 跑酷里）：跑酷里她管不了自己什么时候到，能踩拍子的只有换道。拍子行一出现，墨潮调到让她正好在一条小节线上到这一行（0.45–0.85 倍游速），词提前一小节放；决定这一行的那一下换道落在窗口里 = 踩准：更大的加速 + 跳出墨面一个海豚跳和 `victory` 小舞（她一直是鱿鱼，速度不丢）；踩偏、道对照样算对（`rowAnswer` 根本不收时间参数，测试核）。
7. **镜头自己拿**：INKWAVE 的 follow 镜头把她放在准星上、鱿鱼吊臂固定 4.1 m——射击对，跑酷不对（前面的路要占满屏幕，她在下面）。用 `cameraRig` 的 path 模式、不给 path：`main.js` 不拉回、rig 不动它，只加它的震动、留 gameCam（声音、瞄准）、把 `fovKick` 变成视角。她的位置、路的朝向（前方 2–9 m 的切线平均）、吊臂都是临界阻尼弹簧；竖屏高、陡、广（垂直 70°），横屏 / 桌面低、长（50°），按宽高比连续混合；墙挡在中间时吊臂快收慢放（`physics.cameraProbe`，从她头顶上方量，短了也还看着路）；一行出来时朝向和看点往这一行中间靠（PLAY §6.2，最后几米淡出）。学习局是 solo，没有开场飞入（`match.start()` 直接 playing）：`match:state → playing` 那一刻接过来——`main.js` 在同一个事件里先把 rig 切成 follow，跑酷的处理器排在后面、同一帧切回 path，那一帧 rig 不动镜头——镜头从 `startMatch` 的跟随位弹簧过去；实测开跑头 3 秒逐帧（1/30 s 一帧）镜头最大位移竖屏 0.27 m、宽屏 0.63 m（她那时 12–14 m/s），没有切。
8. **她在哪**：游泳的鱿鱼沉在自己颜色的墨里——射击里是隐身，跑酷里她得看见自己在哪条道：脚下墨面上一个白圈 + 箭头（深色描边），她对着的那道幕亮一点。
9. **长标签**：横幅幕（> 12 英文字符或 > 8 汉字，最多 3 道）；390 px 竖屏上 41 个字母的幕要到最后一秒才看得清，所以横幅行在题条里按道列出 A / B / C（幕上也印字母），她游在哪道，那一格亮。题条是替身（`hud.js`），play-1 的 `play-strip.js` 来了以后接过去。
10. **没答**：穿过空隙 = 没答，不写证据（PLAY §1 第 5 条）：第一次马上再来一行，第二次放到这一站最后，第三次留到下次（记在 `stats.skipped`）。
11. **不暂停、不定身**：跑的时候 `match.paused` 一直是假、`learn.hold` 从不置真（`RaceFlow` 构造时给第一块看板置的 `hold` 一出构造就清掉）；hud-learn 的题卡从不调用（`hud` 取值器只在最后的结果卡时给出）。结果卡出来时局停住——和每种形式的结尾一样，那时已经跑完了。

**改了什么**（新文件都在 `src/learn/play/runner/`）：
- 纯模块（Node 测）：`lanes.js`（道心、分隔线、`laneOf`：空隙 = −1、一滑一道、读题时间、拍子窗口 / 网格 / 小节线 / 脉动、`syncTide`）、`track.js`（`straighten` 拉直、`buildTrack` 闭合平滑的路、`at / project`、`clearWidths` 净宽扫描、`rowFit / placeRow` 题行放置、`roomAt`）、`detour.js`（`detourBranch` 支路、`branchLine / branchAt`）、`rows.js`（`entriesOf` 一天的队列、`rowPrompt` 这一行的选项按道排 + `_perm`、`rowLanes / isBanner`、`rowAnswer` = `judgeAnswer → store.recordFirst`、`planCourse` 静态规划）。
- 运行：`runner.js`（`RunnerFlow`）、`view.js`（一行的幕：`subs.js` 的 Drip Curtain 着色器 + 脉动 / 珊瑚 / 亮 / 流干四个 uniform，标签板，地上的分道线；她脚下的白圈箭头）、`label.js`（一个函数 `labelTexture`：CanvasTexture，等 play-1 的图集换掉）、`cam.js`（跟拍镜头）、`hud.js`（题条替身、「差一点」行、操作提示、「横过来更好玩」，样式从 JS 注入）。
- 别人地盘上的最小改动：`src/config.js` 的 `LEARN.runner` 一组数和 `TOUCH.swipe`；`src/core/touch.js` 一个标明的滑动钩子（`match.learn.swipe` 存在时，手指落在 ⏸ 和页面按钮以外就是滑动：过 26 px 一下，接着拖再一下；不出摇杆、不转视角）；`src/learn/forms/index.js` 的 `runner` 路由（`LEARN_KINDS` 多一个 `'runner'`）。
- 审计：`tools/learn/runner-audit.mjs`（自带静态服务器、SwiftShader、视口 / 触屏、三种场景：`runner` 逐行走真输入、`forms` 原来的道具赛审计、`perf` 帧时间）+ `tools/learn/runner-drive.js`（页内驱动：触屏发真的 PointerEvent 进 `touch.js`，桌面按键；逐行核不暂停 / 不定身 / 没有题卡）。

**测试**（`npm run test:learn` 82 → 94 条全绿，`npm run check` 223 个文件绿；三个新文件都是 `tests/learn/runner-*.test.mjs`）：
- `runner-lanes`（6 条，纯）：2 / 3 / 4 道的道心和分隔线、她被送到的分隔线（3 道时离她近的那条、偏心的行用它自己的）；`laneOf`：幕里 = 那一道，分隔线 / 空隙 / 外侧 = −1，「起在分隔线上、不动」三种道数都是没答；一滑一道、外道不出界；读题时间（3 个字 2.68 s、19 字 3.64 s、全课程最长的 54 字 5.74 s、封顶 6 s，最远 < 45 m）；拍子窗口（84–150 bpm 都是 0.15 s；±0.14 s 算准、±0.16 s 不算）、网格 / 小节线 / 脉动；`syncTide` 让她落在小节线上、倍数在 0.45–0.85 里。
- `runner-track`（2 条）：夹具环形走廊（5 格宽）——闭合、`project ∘ at` 还原、净宽中位数 ≈ 5 m、两 / 三道放得下、四道放不下（要 5.5 m）、四个选项的行少一道成三道、每一行各道道心都在可走格上。**7 张真舞台**（Node 里建 Level + Physics + NavGraph，和 `forms.test` 一样；Node 里没有道具的碰撞盒，所以圈长和浏览器里差几米）：道具赛那一圈拉直平滑后不离开网格、w1d3 的 50 行全部放下、每行在原地 `rowFit` 复核、各道道心在网格上、一半以上保留全部选项、降到两道的 ≤ 10%、检查点有序、每张舞台至少一条支路（从路上出发、回到路上、≥ 1.35 倍长、一半以上离路）：

  | 舞台 | 圈长 m | 能放 2 道 / 4 道的点 | w1d3 的 50 行：全部道 / 少一道 / 降到两道 | 一天的路 | 走远路找得到支路 |
  |---|---:|---|---|---|---|
  | tidewater | 158 | 59% / 23% | 44 / 6 / 0 | 1.44 km ≈ 9.1 圈 | 6 / 7 |
  | kelpline | 183 | 71% / 24% | 39 / 11 / 0 | 1.44 km ≈ 7.8 圈 | 8 / 8 |
  | halyard | 197 | 65% / 24% | 29 / 21 / 0 | 1.53 km ≈ 7.8 圈 | 7 / 9 |
  | saltpan | 176 | 74% / 10% | 35 / 15 / 0 | 1.44 km ≈ 8.2 圈 | 4 / 8 |
  | crossmarket | 158 | 71% / 35% | 45 / 5 / 0 | 1.44 km ≈ 9.1 圈 | 3 / 7 |
  | lockgate | 195 | 53% / 16% | 37 / 13 / 0 | 1.68 km ≈ 8.6 圈 | 9 / 9 |
  | terraces | 167 | 36% / 16% | 33 / 17 / 0 | 1.99 km ≈ 11.9 圈 | 7 / 7 |

- `runner-answer`（4 条，A 的真内容）：**和卡片等价**——w1d3、w1d7 每一道选择题，每一道对 / 错的道，卡片的路（`race.js _answer`：`judgeAnswer → recordFirst`）和跑酷的路（`rowAnswer`）各写一份内存里的证据，`store.evidence()` 逐字一样、判词一样、都是当天首答；同一天再答一次两边都只是练习。换个问法（重排）和变窄的行：每一道都按 `_perm` 判回原选项、显示的就是判的那一个、对的那个总在路上。穿过空隙 / 没进幕：什么都不判、证据文档是空的；同一道拍子行「踩准」「踩偏」两种说法写出来的证据一样（`rowAnswer` 只读 `{ hinted, at }`）。三周 21 天的队列：每个计分的选择题一行，共 994 行（174 个听辨对子 + 96 个音标 = 270 个拍子行）；1 106 个打字题（单词卡、听写句；写句是课程步的路标，不在道具赛的门里）在 55 段滑行段里；每道幕有字；横幅 75 题且都 ≤ 3 道。

**实测**（`tools/learn/runner-audit.mjs`，一次一个浏览器 `flock -w 9000 /tmp/ielts-browser.lock nice -n 10`；Chromium + SwiftShader，`quality=low`、阴影 / 泛光关；审计一开局就 `debug.freeze`，以 1/30 s 一帧推模拟、不画，要截图时画一帧——软件渲染一帧要一秒多；输入都是真的：竖屏 / 横屏用触屏 PointerEvent 进 `touch.js` 的滑动钩子，桌面按 A / D；每一行出现时核：没有显示的题卡（`.iw-learn.is-ask` / 可见的 `.iw-learn__panel`——hud-learn 的面板元素一直在 DOM 里，没显示过）、`match.paused === false`、`learn.hold` 假；每一行之后读她的证据叶子数；整局没有 4xx、没有控制台错误。`songs/manifest.json` 是生成的文件（`npm run music`，不进 git），审计服务器没有它时回一个空表：

| 视口 | 进的哪一段 | 走了的行（计划 → 结果） | 看到的 |
|---|---|---|---|
| 390 × 844 竖屏触屏 | `w1d3 · gate=5`（阅读题 → 听辨对子） | 错 → 珊瑚幕、7.08 → 4.36 m/s，叶子 0 → 1（首答）；对 → 炸开、7.08 → 14.17 m/s；空隙 → 没答（叶子不变，马上再来一行） | 题条 18 px、▶ 44 × 44、题条下按道列 A / B / C（横幅行整句在这里读）、名次只留她一行、「横过来更好玩」只出一次（关掉 / 9 秒 / 转横就没了） |
| 844 × 390 横屏触屏 | `gate=1`（音标 4 道拍子行）、`gate=3`（语法小测 3 道） | 错 → 珊瑚（5.94 → 4.19）、对 → 炸开（6.43 → 13.75）；空隙 → 没答 | 题条让开 ⏸、在钟下面；四道幕的字（go 去 / here 这里 …）横屏里直接读得出 |
| 1280 × 720 桌面键盘 | `gate=2`（单词 4 道 → 语法小测），一直跑到结果卡 | 9 行：错 / 对 / 没答 / 对 / 第二次错 → 走远路（支路，汇回）/ 对 / 没答 ×2 / 回炉；`learn:finish` → 结果卡「第 1 名 · 首答 · 回炉清了 · 星星 0 → 1」 | 证据写进 `ev-2026-10-12`；机器人跑满两圈（没在上一圈就「到」） |

另外：开跑头 3 秒逐帧镜头最大位移竖屏 0.27 m、宽屏 0.63 m（没有切）；原来的道具赛审计（`--scenario forms`：`drive-forms.js`，`?learn=w1d2&kind=race&short=1&fast=1`，十字市场）照样过——4 / 4 题、第一题错换问法再对、第 1 名、结果卡、证据进 `ev-2026-10-12`、无错误。

**帧时间**（`--scenario perf`，390 × 844 竖屏触屏，`quality=low`，halyard，真时间循环、不步进，各采 40 秒墙钟；跑酷先跑到第一行出来再量，道具赛在走向第一道门时量，普通 4v4 是同一舞台的涂地赛开打几秒后。**SwiftShader 上的数只能互相比，不能当手机的数**：rAF 间隔 = 整帧，含软件光栅化，主导一切；`_frame` = 游戏自己的模拟 + 发绘制调用）：

| | rAF p50 / p95（ms） | `_frame` p50 / p95 / 最大（ms） | 绘制调用 |
|---|---|---|---|
| 跑酷（她 + 3） | 1 283 / 1 650 | 10.6 / 18.8 / 2 437 | 71 |
| 道具赛（她 + 3，卡片版） | 1 500 / 3 450 | 15.3 / 2 799 / 5 958 | 126 |
| 涂地 4v4（8 人） | 1 400 / 1 733 | 17.5 / 23 / 1 291 | 116 |

跑酷 p50 / p95 都不比另外两个差（绘制调用最少：只有两行幕、四块标签板）。那一帧 2.4 s 的最大值是一行在一帧里建好四张标签画布并上传（软件 GL 上传很慢）——之后改成了「建行以后一帧画一张、淡入前画完」（`RowView.prepare`），**这一改和最后几处改动（跳边前后不放行、吊臂短时往下看、滑行段超长时重排、采样时游进对的幕）没在浏览器里复跑**：收尾时浏览器锁排了四十多分钟没轮到，按协调者的指示收了，见「交接」。

**接口（给 play-1 和 play-type 接上的地方）**：
- **play-1 的标签图集**：换 `src/learn/play/runner/label.js` 的一个函数 `labelTexture({ en, zh, banner, tag }) → { tex, aspect, dispose }`；`view.js` 的 `RowView.prepare()` 一帧调它一次（行建好以后、淡入以前），换成「一行一张图集 + 每道幕一个 UV 子矩形」只动这两处。
- **play-1 的题条 `play-strip.js`**：换 `hud.js` 的 `RunnerHud`：`ask(kind, p, opts, banner)`（`kind` = 选一条道 / 踩拍换道 / 滑行段；`opts` = 按道排好的 `{ tag, en, zh }`）、`here(lane)`（她现在在哪道）、`say(ok, text, why, ms)`（「对！」/「差一点：是 ___」）、`clear()`、`speak(text)` / ▶ 再听。跑酷比解谜多要两样：按道的选项格（竖屏一直有、横屏只给横幅行）和她所在那道的高亮。
- **道具赛换成跑酷**：`src/learn/forms/index.js` 里 `FLOWS.race` 换成 `RunnerFlow`（或者在 `LEARN.play` 开关下换）；`kind: 'runner'` 的调试路由可以留着。`race.js`、`flow.js` 跑酷都不碰（`RunnerFlow` 继承 `RaceFlow`，覆盖的方法见「先定的」第 1 条）。
- **play-type 的字弹**：`RunnerFlow.typed = async ({ items, gate, flow }) => { … }`。滑行段开始时调用（墨潮 0.85、墨道自动拐大弯，她不用管方向）；每个条目自己 `engine.judge → store.recordFirst`（单词卡 `T / H / S`，听写句 `L` + 百分数），全部做完 resolve；没 resolve 之前滑行段一直往前延伸，resolve 以后被它压过去的行会重新排。字弹的键盘若是 DOM 按钮，`touch.js` 的滑动钩子会放过按钮上的点击（`closest('button')`）。

**拿不准的（请主会话过目）**：
1. **拍子窗口**：照写 `max(0.15, 0.35 × stepDur)`，可 `music.js` 的 `stepDur` 是十六分音符（`60 / bpm / 4`），所以游戏里 84–150 bpm 的每一首都是 ±150 ms，「慢歌放宽」从不发生。要是本意是「一拍」，把 `lanes.js beatWindow` 的参数换成 `60 / bpm` 就是 84 bpm ±250 ms、128 bpm ±164 ms。
2. **少一道的顺序**：我在 PLAY 的「先少一道」之前加了「先在 10 m 内往前挪」（理由见「先定的」第 4 条）；7 张舞台上仍有 5–21 行（halyard 最多）从四个选项少到三个——少掉的是离答案最远的那个干扰项（引擎给的邻居词排在后面）。要不要允许挪得更远、换来每题都有四个选项，是取舍。
3. **题区几乎一直在**：读题区（2.5–6 s 的路）一行接一行，她大半时间在 0.6 倍的墨潮里（≈ 7 m/s），只在两行之间、答对加速时到 11.8–15 m/s。照 PLAY 的数是这样；嫌慢可以把 `LEARN.runner.after`（行和行之间的空路）加长。
4. **踩准的小舞**：她一直是鱿鱼（人形踩在墨上只有 6 m/s，加速也到不了她身上），所以「舞」是跳出墨面的一个海豚跳（真的 `swimJumpVel`，空中保持速度）+ 一圈墨环 + `setDance('victory')` 0.7 秒——鱿鱼形态下舞的身体动作看不太出来，要不要换成别的演出请过目。
5. **超级跳道具**：道具赛里是「跳到下一站跟前」；跑酷里改成「跳过一段路（≤ 34 m），落在下一行的读题区前面」——没有道具能跳过题这一条不变。
6. **检查点的位置是静态规划的**：机器人在「没有重答时」每道门第一行的位置掷骰子；她重答、没答多了，她的行往后挪，机器人的检查点不挪（终点会挪）。名次只是奖杯，不影响证据。
7. **结果卡时局停住**：`_results` 和别的形式一样 `match.paused = true`——那时她已经过了终点；跑的过程中从不。

**没做的**：
1. **打字题**：单词卡、听写句在「滑行段」里只是标明的占位（不计分）；接口留好了（`RunnerFlow.typed = async ({ items, gate, flow }) => …`，play-type 的字弹接上就计分，滑行段会一直等到它 resolve）。
2. **看板段**：只做了阅读课文（起跑前一块块读，「出发」）；单词展板、音标口型、语法讲解行（PLAY §5.2 的 M6 牌子沿路排开）没做——这一期的单词行、语法行是「直接考」。
3. **道具**：照用道具赛的；墨雨（提示，记 `H`）在道具赛里本来就只对打字题有用，跑酷里选择行用不上（滑行段接上字弹后才有用）；机器人不用道具（道具赛也没做）。
4. **真机**：iPhone 上的手感、帧时间、横竖切换没测（这台机器只有 SwiftShader）。帧时间数字只能比相对值。
5. **`race.js` 没换**：道具赛照旧是卡片版；`?kind=runner` 是调试入口。换的那一步（`FLOWS.race = RunnerFlow`，或者看 `LEARN.play`）留给主会话。
6. **标签图集**：每道幕一张 512 × 320 / 448 的 CanvasTexture（一行最多 4 张，最多同时两行），行过去就释放；play-1 的图集（一道门一张）来了以后换 `label.js` 一个函数。
7. **掉进海里**：她被墨道限制在净宽里，正常跑不会掉下去；万一掉了，是游戏自己的 5.5 秒重生，然后放回她离开的那一段路上（`_respawned`）。

**交接**（2026-10-16 收尾时）：
- **完成了**：跑酷能从头跑到结果卡（`?learn=w1d3&kind=runner`，`&short=1&gate=N` 是审计用的短关）；答题只走 `rowAnswer`（= 卡片的 `judgeAnswer → recordFirst`，测试逐条核过）；不暂停、不定身、没有题卡（三个视口逐行核过）；错 / 对 / 没答 / 走远路 / 回炉 / 机器人 / 道具 / 结果卡都在浏览器里跑过；`npm run test:learn` 94 条、`npm run check` 223 个文件绿。
- **还缺**：字弹（滑行段是占位，`RunnerFlow.typed` 等 play-type）、M6 看板路（只做了阅读课文）、`race.js` 换成跑酷（主会话一行：`FLOWS.race`）、真机、上面说的最后一批改动的浏览器复跑（`tools/learn/runner-audit.mjs --scenario runner` 三个视口 + `--scenario perf`）。
- **先看哪些文件**：`src/learn/play/runner/runner.js`（`RunnerFlow`：`_place` 路线和圈数、`_build / _appear / _settle` 一行的一生、`_tide / _steer / _bounds` 速度和方向、`_after` 她在路上哪里、`_botLap` 机器人），`track.js`（拉直、净宽、放行），`rows.js`（答题那一条路），`cam.js`，`tools/learn/runner-drive.js`（审计怎么走）。
- **已知的坑**：
  - **车道扫描**：Node 里的 Level 没有道具的碰撞盒，浏览器里的圈长会差几米（halyard 197 / 207 m），表里的数是 Node 的；路边很近的道具（吊车腿、船舷、垃圾桶）不挡她的路（网格已经让开了），但会挡镜头、挡幕。外道在题行前 3 m 以内才够宽的地方，她要在最后几米斜着游过去（`_bounds` 用助跑起点的宽度瞄准）；放行规则见「先定的」第 3、4 条。
  - **节拍**：拍子判的是她「决定这一行的那一下换道」的时刻，不是穿幕的时刻；合成曲的网格从 `G.music.current` 的 `t0 / bpm` 换算到游戏时钟（每行出来时重算一次），录音用 128 bpm 的假网格；在 `debug.freeze / step` 下音频时钟照真时间走，所以审计里「踩准」是碰运气的。窗口 ±150 ms 见「拿不准的」第 1 条。
  - **相机**：rig 的 path 模式、`path = null` 是借来的（`main.js` 只对 follow / path 以外的模式拉回 follow）；她死了（掉海里）`main.js` 会切 spectate、重生时切 follow，跑酷在 `respawn` 里拿回来。吊臂被墙压短时镜头低、标签会往屏幕上方跑——已经让它往下看，没复跑过。
  - **审计**：软件 GL 一帧 1–1.5 秒，所以 `runner-drive.js` 冻结后用 1/30 s 一帧不画地推模拟；一次跑一个视口要 3–8 分钟，浏览器锁是大家共用的。

## 21. play-3 交付（2026-10-16，分支 `play-3`：节拍台 M3 + 展板路 M6 + 回声亭 M7 + 翻牌靶 M8 + 路标——WIP：模块独立做好、Node 里验过；浏览器里节拍台的台子还没显示、其余四种没进过浏览器；接进门的流程是下一步）

PLAY §9 第 3 期：做完这一期，解谜里除了还没接的，没有一种条目非得是卡片。听辨对子 174、音标 96 是节拍台；课文 24、单词展板、语法讲解行、阅读课文是展板；口语 21 是回声亭；复习日 150 张是翻牌靶；打卡 / 周报 / 入门小测是路标。PLAY §3 的 M3 / M6 / M7 / M8 / 路标已改成做出来的样子。

**先读了什么**：PLAY 全文（§1 不变量——特别是 1 不暂停不定身没面板、2 一条判分路、3 证据如实、4 节奏不等于对错、6 错是珊瑚色、8 不加素材、9 同一个样子；§3、§4 的表、§6、§7 预算、§8 横屏）；LEVELS §1（覆盖矩阵）、§2（2.1 放门、2.6 回炉、2.7 效果）、§5（动作、声音、镜头、减少动效）；本文 §8、§15（翻牌 `F`）、§19（字弹的接口写法）；CONTRACTS（`trigger` / `setDance`、§2 的声音名）。代码：`flow.js`（门、路标的占位、`_answer` 和翻牌那一段）、`hud-learn.js`（翻牌卡 154 行起：记得 → `_submit(true)`、不记得 → `_submit(false)`）、`forms/common.js`（`boardOf`、`flipPrompt / flipJudge / cardFor`、`relearnTip`）、`forms/ui.js`（展板卡）、`engine.js`、`store.js`（`how`）、`design.js`（`MECHANICS`、`EFFECTS`、`REDUCED`）、`content.js` 的条目形状、`music.js`（`Player` 的 `stepDur / barDur / t0 / nextBarTime`，`FileTrack` 没有拍速）、`learn/audio.js`、`character.js`（`trigger('jump' / 'land')`、`setDance('victory')`）、`decor.js`（出生垫的着色器和底座）、`fx.js`、`paint.js`、`cameraRig.js`、`type/{frame,atlas,mats}.js`；play-runner 分支的 `lanes.js`（拍子函数）、play-1 分支的 `targets.js / pick.js / hit.js / run.js / play-strip.js`（题物、点射、题条、`_judgeRecord`）——只读。

**先定的**：
1. **四个玩法都不判、不写**（照 §19 字弹）：它们只交出动作——节拍台交「跳上第几块台」，翻牌靶交「认识 / 不熟」= 卡片的 `true / false`，回声亭和路标什么都不交（只有「说完了」「走完了」「开经典页」）。判和首答都在流程那一条路上（play-1 的 `_judgeRecord`）；源码里没有 `judge(` / `recordFirst` / `item.answer`，测试扫。节拍台在 `resolve()` 之前根本不知道哪块对。
2. **拍子和跑酷一个约定**：`clock.js` 的六个函数和 play-runner `lanes.js` 同名、同参数、同返回值、同窗口 `max(0.15, 0.35 × stepDur)`，合并后可以只留一份。合成曲子的第一拍从音频时钟换到游戏时钟；录音没有拍速，用 `LEARN.beat.bpm`。
3. **四块台是跳舞毯的十字**（↑ ← → ↓），不是 2 × 2：「点四个象限」「四个方向滑」「方向键」三种输入只有十字能一一对上（象限 = 离哪块台的投影近，等于屏幕的上 / 左 / 右 / 下四边）；A–D / 1–4 按选项顺序（阅读顺序：上、左、右、下）。
4. **落地才交答案、起跳定踩没踩准**：答案和画面一起（她落在那块台上的那一刻）；拍子只看她什么时候起跳。
5. **展板没有翻页键**：走到跟前就框、站着不动一直框、走出去就放；自动走（竖屏唯一的走法）在每块没看过的板前停（`nextSpot()`），按「自动走」继续。
6. **板上的字由纯函数排**：画布 1024 宽、最高 930、所有字 ≥ 54 画布像素——这三个数是从「横 844 × 390 / iPhone SE 横屏框住时最小字 ≥ 17 px」倒推的；放不下的进阅读条，从不缩字。
7. **翻牌靶的靶和 play-1 的题物同一套方法名**（`InkTargets`），合并后换成 `PlayTargets` 只改构造一处。

**改了什么**（都在 `src/learn/play/{beat,board,echo,flip}/`，别人的文件只有 `config.js` 加了 `LEARN.beat / board / echo / flip`）：
- `beat/clock.js`（纯）：拍子网格六个函数（和跑酷同一约定）+ `gridFromMusic(music, gameNow, fallbackBpm, cache)`（合成曲子换到游戏时钟；录音、没声音时一个固定的网格；不变就返回同一个对象，每帧不分配）。
- `beat/round.js`（纯）：一题的小节状态机 `BeatRound`——`start(grid, now)` 定词的小节线 W、跳的重拍 D = W + 一小节、答题小节到 D + 一小节；`tick(t)` 一个一个吐事件（`speak` / `silent` / `defer`）；`input(t, pad)` 只收一次、只从词放出来以后收，`onBeat / off` 只量离 D 多远。
- `beat/pads.js`（纯）：`stageLayout(n, aspect)` 竖横两套台子（竖屏窄而深、横屏宽而浅）、标签牌放在外侧、俯视机位按安全带二分出最近的距离再把内容居中、牌子放大到小字 ≥ 17 px；`padOfTap / padOfSwipe / padOfKey / padRegionRadius`。
- `beat/mats.js`：出生垫的底座网格（decor 的 lathe 轮廓缩到单位半径）和台面着色器（decor 的样子 + 箭头、逼近环、拍子、连击光，按实例的颜色 / 光 / 池子 / 图形）；标签牌材质（字图里的一格 + 她的墨描边 + 珊瑚色）。
- `beat/stage.js`：`BeatStage`——台子、牌子、她的跳（`carry(actor)` 在 `actor.update` 之后把她放在弧线上 / 台子上）、点 / 滑 / 键、`resolve` 的演出、`frame(aspect)` 给相机、`warm`；`beat/padset.js`：回声亭和打卡垫用的零散台子（同一套底座和台面，2 个 draw call）。
- `board/text.js`（纯）：中英文折行（中文任意两字之间、避头尾：句读不开头——上一行最后一个字带下来；英文按词、超长的词按字母）、`clampLines`（「…」）、近似字宽（Node 用）/ 画布字宽（页面用）。
- `board/paint.js`：板子说什么（`wordsSpec / soundsSpec / lessonSpec / noteSpec / passageSpec / echoSpec / signSpec`）和画布上哪里（`layoutBoard`：纯，返回绘制指令、热区、`cut`、最小字号、给阅读条的 `full`）；`drawBoard` 照指令画（深色玻璃、她的墨的边、按钮、播放 / 麦克风 / 书 / 勾 / 外链图标）。
- `board/frame.js`（纯）：`frameBoard`（正对板子、填满 HUD 顶排到屏幕下沿那一带、居中）、`boardSpots(route, n)`（沿路在她右手边、门前往回排、对着她来的方向）。
- `board/hotspot.js`（纯）：`pickHotspot`（每个热区抬到 ≥ 44 再外扩、重叠时离自己的框最近的赢）、`canvasToBoard`。
- `board/set.js`：`BoardSet`——板身和柱子各一个 `InstancedMesh`，每块板面一个四边形 + 自己的 CanvasTexture；升起的弹跳；热区投影；预热（留着一个面材质，程序常驻缓存）。`board/walk.js`：`BoardWalk`——区、取景、看过、`nextSpot`、热区动作（再听、跟读、听全文、读全文）。`board/strip.js`：阅读条（DOM，样式在 JS 里，`ReadStrip.owns(e)`）。`board/signs.js`：`Signs`（打卡垫、周报牌、入门小测牌）。
- `echo/booth.js`：`EchoBooth`。
- `flip/targets.js`：`InkTargets`（两个墨球 + 标签牌，play-1 `PlayTargets` 的方法名）+ `pickTarget`（play-1 `pick.js` 球的规则）；`flip/deck.js`：`FlipDeck`（卡片、翻、靶、`hitShapes`、`frame`）、`drawCard`、`RATE`。
- 实验室 `tools/play3-lab.html` + `play3-lab.js`：游戏自己的 `Renderer`（同一套后期和调色）、`Environment`、`FX`、声音、小鱿鱼，默认一块轻甲板（地上的墨用 fx-lab 那种圆片代替），`?stage=tidewater` 换成真关卡 + 真 `PaintSystem`；内容是真的第 1 周（`loadWeek` + `engine.judge`，实验室一条证据都不写）；`?m=beat&n=2|4 / board / read / echo / flip / signs`、`?quality / ?reduced / ?shadows=0`；`window.lab`：`freeze / step / render / measure / cost / warm / state`，每种玩法自己的 `ask / hop / tap / swipe / key / goto / hot / hotspots / stepIn / stepOut / flipCard / rate / targets`。顶上一条是题条的替身（play-1 的 `play-strip.js` 没合并）。

**接口（门的流程要调的；四个都照字弹 M4 的样子：玩法自己不判、不写，答案交给流程那一条路，流程判完再 `resolve`）**：

```js
import { BeatStage } from './learn/play/beat/stage.js';          // 节拍台 M3：听辨对子（2 块）、音标（4 块）
import { BoardWalk } from './learn/play/board/walk.js';          // 展板路 M6
import { boardSpots } from './learn/play/board/frame.js';
import { wordsSpec, soundsSpec, lessonSpec, noteSpec, passageSpec } from './learn/play/board/paint.js';
import { EchoBooth } from './learn/play/echo/booth.js';          // 回声亭 M7
import { Signs } from './learn/play/board/signs.js';             // 路标
import { FlipDeck } from './learn/play/flip/deck.js';            // 翻牌靶 M8
import { ReadStrip } from './learn/play/board/strip.js';         // ReadStrip.owns(e)：touch.js 跳过阅读条上的手指

const ink = G.teamColors[0], hex = G.teamHex[0], reduced = isReduced();   // (type/shot.js 的 isReduced)
// 关卡载入时建好、预热（compileAsync 就地编译，不挪对象）
const beat = new BeatStage({ scene: G.scene, camera: G.camera, team: 0, color: ink, reduced });
const boards = new BoardWalk({ scene: G.scene, camera: G.camera, color: hex, reduced, root: uiRoot });
const echo = new EchoBooth({ scene: G.scene, camera: G.camera, color: hex, reduced, root: uiRoot });
const signs = new Signs({ scene: G.scene, camera: G.camera, color: hex, reduced, root: uiRoot });
const flip = new FlipDeck({ scene: G.scene, camera: G.camera, color: ink, team: 0, reduced });   // 合并后可传 { targets: play-1 的 PlayTargets }
await Promise.all([beat, boards, echo, signs, flip].map((m) => m.warm(G.renderer, G.camera, G.scene)));
// 前两道门：画好这道门的东西（字图 / 板子 / 卡面），门开了 free
beat.prepare(g.id, g.items.map((it) => prompt(it).options));      // 每个条目的选项（选项顺序）
boards.prepare(g.id, specsOf(g));   // 单词 5 个一块 wordsSpec(rows, k, n)；音标 2 个一块 soundsSpec；语法 lessonSpec(title, step.meta.lesson)；阅读 passageSpec(step.meta.passage)；课文 / 打卡的话 noteSpec(title, text)
echo.prepare(g.id, speakItem);  signs.prepare('signs', [{ id, kind: 'checkin' | 'weekly' | 'placement', title, text }]);
flip.prepare(nextItems);        // 卡面，往前画 2–3 张
// 每帧（暂停时不调）
beat.update(dt, G.time); beat.carry(match.local);                 // carry 在 actor.update 之后：她的跳、她站在哪块台上
boards.update(dt, a.pos, { aspect, speed }); echo.update(dt, G.time, a.pos, { aspect, speed }); signs.update(dt, G.time, a.pos, { aspect, speed }); flip.update(dt);
// 相机：谁有 framing / frame() 就弹簧过渡过去（世界坐标 { pos, look, fov }），没有就回到跟随（减少动效：原地停）
const pose = boards.framing || echo.framing || signs.framing || (beat.phase !== 'off' && beat.frame(aspect)) || (flip.phase !== 'off' && flip.frame(aspect));
// 点击：touch.js 先问 G.playTap（play-1 加的钩子），四个都给 { down(x, y, id) → bool, up(x, y, id, cancel) }
G.playTap = beatUp ? beat.tapApi : flipUp ? flip.tapApi : boards.tapApi;   // （同一时刻只有一个在场）
addEventListener('keydown', (e) => { if (beat.key(e)) { e.preventDefault(); e.stopPropagation(); } }, true);   // 舞台在时 WASD / 方向键 / A–D 不会变成走路

// —— 节拍台：一道听辨 / 音标门
beat.mount(a);
beat.open({ origin: g.pos /* 地上 */, yaw: 路线往前的方向, n: g.items[0].options.length, aspect, her: a.pos });   // 她跳上家台
beat.on.speak = (replay) => playWord(p, { both: replay && p._tip?.speakBoth });     // 词（回炉的对子：两个都放）
beat.on.answer = (pad, info) => {                                  // 她落地了：pad 是选项序号；info.onBeat 只管舞和加速
  const { r, first } = flow._judgeRecord(g, item, p, pad);        // play-1 的那一条路（_perm / _alt 照旧映射）
  beat.resolve({ ok: r.ok, right: rightAnswerOf(item, p) /* 舞台上的序号 */, canonical: r.canonical }).then(() => flow._askNext(g));
};
beat.on.defer = () => { g.queue.push(item); flow._askNext(g); };   // 整小节没动两次：排到最后，不写证据
beat.on.say = (text, o) => strip.verdict({ ok: false, head: text });   // play-strip 合并后
beat.ask({ key: g.id, labels: p.options, now: G.time });          // 下一题；门开了 beat.close(); beat.free(g.id)
// —— 展板路：门前那一段
boards.place(g.id, boardSpots(routeToGate, specs.length));        // 她来的路的最后一段（[{ x, y, z }]，到门为止）
boards.on.speak = (text, o) => sayAudio(text, { slow: o.slow, onEnd: o.onEnd, device });
autoWalkTarget = boards.nextSpot() || g.pos;                       // 自动走：先到下一块没看过的板
boards.questionUp = !!flow.asking;                                 // 出题时阅读条收起、不开
// —— 回声亭：出口区
echo.open({ key: g.id, item, at, yaw }); echo.on.speak = …; echo.on.done = () => flow.signDone(item); echo.on.classic = () => openClassic('speak', item);
// —— 路标
signs.place('signs', spots); signs.on.checkin = (s) => writeStars(dayKey, …) /* 本机星表，照旧 */; signs.on.classic = (s) => openClassic(s.kind);
// —— 翻牌靶：复习日 150 张
flip.ask({ item, at: 她前面 LEARN.flip.ahead m 的地上, yaw: 朝她, aspect });
flip.on.speak = (text) => playWord(text);
flip.on.rate = (ans) => { const { r } = flow._judgeRecord(g, item, flipPrompt(item), ans); flip.resolve({ ok: r.ok }).then(() => flow._askNext(g)); };   // ans 就是卡片的 true / false
flip.on.typeIt = (it) => { /* _judgeRecord 已经 item._flipTyped = true 并排回队首：下一题就是字弹 M4（TypeShot）打这个词 */ };
// 射：play-1 的 ShotTargets 登记 flip.hitShapes()，有意的直接命中 → flip.hit(target)（'card' | 0 | 1）
```

接的时候要注意的：① 节拍台上 `beat.on.answer` 给的 `pad` 是**舞台上的**序号（`p.options` 的顺序）：重排过的题（`_perm`）照旧由 `_judgeRecord` 映射回原序号；`resolve` 的 `right` 也要用舞台上的序号（`forms/common.js` 的 `rightAnswerOf(item, p)`）。② `carry(actor)` 每帧在 `actor.update` 之后调：跳的时候把她放在弧线上、`vel = (0, vy, 0)`；舞台在时流程要停她的移动 / 开火输入（触屏层用 `G.playTap`，键盘用 `beat.key(e)` 吃掉）。③ 舞台约 6 × 6 m（横屏四块台最宽：两侧台子在 ±2.55 m），台子只是画面、没有碰撞：要放在门前开阔、近乎平的地方（`_groundY` 用 `G.level.groundHeight`，高差 > 0.6 m 的就按原点高）。④ 展板、回声亭、路标、翻牌的 `framing` / `frame()` 是世界坐标的 `{ pos, look, fov }`：交给 `cameraRig` 的弹簧（减少动效时不动）；`fov` 是竖直视角，和 §19 一样要换成 `zoom`。⑤ 阅读条在 window 捕获阶段的 `touch.js` 前面拦不住：`touch.js` 要跳过 `ReadStrip.owns(e)`（和 `PlayKeys.owns(e)` 一样）。

**测试**：`npm run test:learn` 118 → 147（+29）：
- `play3-beat` 12：窗口永不小于 ±150 ms、慢歌按 0.35 × stepDur 放宽（和跑酷同一约定）、`nearestBeat / onBeat / nextBar / beatPulse`；`gridFromMusic`（合成曲子换到游戏时钟、录音退到固定网格、不变就同一个对象）；一题的小节（词在小节线、跳在下一重拍、词前点不算答、一题只收一次）；**节奏不改对错**：−2.2 … +2.2 s 十一个时刻跳同一块台，交出的序号一样、`engine.judge` 一样、`recordFirst` 写的叶子一样 `[1, L]`，错台踩准了照样错；**整小节没动**：`speak0 → silent → speak1 → defer`，证据是空的；竖横 + iPhone SE + iPad + 桌面六种屏 × 2 / 4 块：都在安全带里、牌子小字 ≥ 17 px、每块台的点击区半径 ≥ 32 px、左在左上在上、屏幕四边 / 两半点到对的台；滑和键的映射；源码里没有判分；舞台本身（Node 里建）：**落地才交答案、踩准看起跳**、对且踩准才跳舞、没踩准不跳、错了那块珊瑚对的那块亮、减少动效不跳舞、两个空小节只 defer 不交答案不写证据、WASD 被吃掉 Esc 不吃；转屏台子滑到另一套、相机位姿是版式的、一道门的字图每个标签都在。
- `play3-board` 8：中英文折行（句读不开头、什么都不丢、超长词按字母断、「…」）；三周**每一块板**（单词 90 块、音标、语法讲解、课文、打卡的话、回声亭、周报 / 入门小测，共 200 多块）：字 ≥ 54 画布像素、都在画布里、热区在板内不重叠、单词板每个词一行热区 + 跟读、回声亭三个按钮、路标的经典页、截了就有「读全文」；最长的打卡话和每篇课文：板上是开头、阅读条是全文；**六种屏框住时每块板最小字 ≥ 17 px**、她的头在板下沿下面；`pickHotspot`（20 px 的按钮也是 44 + 外扩、重叠取近的）；沿路摆板（门前、右手、对着她、间距）；走近框住 / 读过 / 走开放手 / 路过不抢镜 / 停一下才框 / 转屏重框；阅读条：读全文打开、走开收起、出题时收起且打不开、听全文放整篇。
- `play3-flip` 5：卡片的「记得」交 `true`、「不记得」交 `false`（读 `hud-learn.js` 源码核）；**翻牌 → F 和卡片等价**：牌子走「升起 → 点卡 → 翻 → 射靶」，交给 `LearnFlow.prototype._answer`（流程自己的那段代码）写出的叶子和卡片的答案写出的一模一样（`[1, F]` / `[0, F]`），不熟的照旧排回队首、`_flipTyped`、不上锁；翻之前不能评；认识炸成她的墨、不熟没有珊瑚色并交给字弹；竖横两屏点卡片翻、认识在左不熟在右、按标签也点得中；靶的方法名和 play-1 一样、`hitShapes` 翻前是卡、翻后是两个靶。
- `play3-echo` 4：站进亭子放范例（英文）、走出去 = 说完了、证据没动；板上「再听」「评分 · 经典页」「说完了」（只算一次）；打卡垫踩上去只走完一次、周报牌开经典页、证据是空的；回声亭 / 板子 / 路标 / 翻牌的源码里没有判分和写证据。

`npm run check` 241 个文件绿。

**实测**（headless、`flock -w 9000 /tmp/ielts-browser.lock nice -n 10`、`/opt/pw-browsers/chromium` + SwiftShader、实验室固定步长）：只跑成了一组——节拍台竖 390 × 844（2 块，`quality=low`、阴影关）、横 844 × 390（4 块，low）、桌面 1280 × 720（4 块，high + 阴影）。**结果不对：台子、标签牌都没画出来**（画面里只有她和甲板），可 `lab.measure()` 量到舞台确实多了 draw call（竖 2 块 4 个 / 4.9 千三角形、横 4 块 4 个 / 8.2 千、桌面 high 7 个 / 1.6 万），状态机、她跳过去落在台子的位置、判定、珊瑚 / 提示的状态都对（`lab.state()`），Node 里同样的实例矩阵也对。还没查出来（见「交接」）。展板 / 课文 / 回声亭 / 翻牌 / 路标**没进过浏览器**（锁被另外两个工作流的长批次占着，排了一个多小时没轮到）；只有 Node 测试和 `npm run check`。每帧 JS、预热时间、帧时间都还没量。

**拿不准的**：
1. 四块台用十字（跳舞毯）而不是 2 × 2：「四个象限」我理解成「屏幕的上 / 左 / 右 / 下四边」（离哪块台近）。要 2 × 2 的话方向键就对不上了。
2. 跳的时机：答案在落地时交、踩准看起跳；整小节没动以「答题小节」（重拍到下一个小节线）为准。
3. 单词展板一块 5 个词：意思特别长的（「adj./n. 橙色（的） n. 橙子」）在板上截成一行加「…」，全文在「全文」里——为了横屏也 ≥ 17 px。
4. 展板取景是正对板子、水平看过去：她在镜头和板子之间、头在板下沿下面，画面里只看到她的头顶或看不到她。
5. 打卡垫「走完了」只发 `on.checkin`，星表照旧由流程写（`writeStars`）；路标的「经典页」只发 `on.classic(sign)`，开哪个地址由流程定（App 里 `../index.html`）。

**没做的**：
1. **接进门的流程**（`flow.js` 归 play-1）：接口写在上面。
2. 跑酷里的「拍子上换道」（play-runner 的）、对抗赛 / Boss 里的节拍台和回声亭。
3. 回炉的「两个词都先放一遍」「口型 tip 先给」：节拍台给了 `on.speak(replay)`，放什么由流程定。
4. 浏览器里的实测和截图（只有一组节拍台的，而且有上面那个没画出来的问题）；真机帧时间。

**交接**（10-16 收尾时写）：
- **做到哪**：
  - M3 节拍台：纯逻辑（拍子、一小节的状态机、竖横版式、输入映射）完整、测试齐；舞台（`beat/stage.js`、`beat/mats.js`）代码完整、Node 里跑得通（跳、落地交答案、对错演出、defer），**浏览器里台子和牌子没显示**——第一件要修的事。
  - M6 展板路：排版、取景、热区、走近 / 走开、阅读条都写完、Node 测试齐（三周每块板 × 六种屏）；没在浏览器里看过。
  - M7 回声亭、路标：写完、Node 测试齐；没在浏览器里看过。
  - M8 翻牌靶：写完、和卡片的 `F` 等价有测试；没在浏览器里看过。
- **先看哪些文件**：本节的「接口」；`src/learn/play/beat/stage.js`（`open / ask / update / resolve`）和 `beat/mats.js`；`tools/play3-lab.js`（`window.lab`，每种玩法一个 `M.xxx`）；测试 `tests/learn/play3-*.test.mjs`；截图脚本的写法：实验室页 `tools/play3-lab.html?m=beat&n=2&quality=low&shadows=0`，`window.lab.freeze(); lab.step(ms); lab.render(); lab.measure(); lab.state()`。
- **已知坑**：
  1. 台子不显示：先在页面里加 `?shadercheck`（`renderer.js` 默认关掉了着色器报错，坏了的着色器不出声），看台面的 `ShaderMaterial`（`padFaceMaterial`）和牌子的 `onBeforeCompile` 有没有编译错；再看 `beat.base`（就是普通的 `MeshStandardMaterial`，它也没显示，所以也可能不是着色器）——查 `renderer.properties.get(mesh.material).currentProgram`、实例矩阵（`beat.base.getMatrixAt`）、`beat.group.matrixWorld`。我排队等锁的调试脚本没轮到。
  2. 浏览器锁很挤：另外两个工作流的批次一跑几十分钟；一次多截几张、`flock` 外面别套 `timeout`（等锁的时间也算进去，会被杀）。
  3. Node 测试里 three 要在注册 `three-hook.mjs` 之后动态 `import`（静态 import 先解析，会找不到 `three`）——`paint.js`、`atlas.js` 都间接引 three。
  4. 回声亭、跟读用的 `setTimeout` 都 `unref` 了，不然 Node 测试会多等 9 秒。

## 22. play-wire 交付（2026-10-16，分支 `play-wire`：解谜里一张卡片都没有——字弹 M4、节拍台 M3、展板路 M6、回声亭 M7、翻牌靶 M8、路标接进门的流程，阅读题进 M1；PLAY §9 第 2、3 期的「接进门的流程」）

**先读了什么**：PLAY 全文（§1 的 12 条逐条核；§2 一题的生命；§3 八种玩法「已经做出来的样子」；§4 的表；§5.1；§6；§9；§10）；本文 §18（`_judgeRecord`、`G.playTap`、`G.playTargets`、`PlayRun` 的取景和放置、审计写法）、§19（字弹的接口和「接的时候要注意的三件事」）、§20（跑酷怎么拿镜头：`cam.js` 的 `rig.mode = 'path'; rig.path = null`）、§21（四个玩法的接口和注意的五件事、交接的已知坑）；代码：`flow.js` 全文、`play/run.js` 全文、`play/beat/{stage,pads,round,clock,mats,padset}.js`、`play/board/{walk,strip,signs,frame,paint,set}.js`、`play/echo/booth.js`、`play/flip/{deck,targets}.js`、`play/type/{shot,frame,rig,inkword}.js`、`ui/play-keys.js`、`ui/play-strip.js`、`ui/hud-learn.js`、`forms/common.js`（`rightAnswerOf`、`flipPrompt`、`cardFor`、`canClaim`）、`engine.js`、`store.js`（`recordFirst` 的 `typed / hinted / self`）、`design.js`、`levels.js`、`content.js`（条目和步的形状）、`core/touch.js`、`game/cameraRig.js`（`path` 模式、`zoom`、`follow` 的混合）、`game/match.js`（每帧的顺序：`updateController` → `learn.update` → actors）、`game/player.js`、`main.js`（`_frame`、`debug.freeze / step`、`shadercheck`）、`core/renderer.js`、`tools/play3-lab.js`、`tools/learn/play-audit.mjs`、`tests/learn/play*.test.mjs`。

**先定的**：
1. **先查节拍台「画不出来」**：浏览器里逐帧读像素——出题、起跳、判、判完每一帧台子和牌子都在，着色器没错。是实验室的 `lab.measure()` 把题物藏起来数 draw call，恢复 `visible` 后没再画一帧，冻住的页面之后截到的就是没有台子的那一帧。节拍台一行没改（`tools/play3-lab.js` 的 `measure()` 多画一次）。
2. **一个宿主、各站分发**：`LearnFlow` 拿 `PlayHost`（`src/learn/play/host.js`），契约和 `PlayRun` 一样（`canAsk / ask / toCard / update / gateOpened / dispose`）；M1 还是 play-1 的 `PlayRun`，其它站在 `src/learn/play/wire/`。`kindOfItem(item, p)` 是纯函数：翻牌 → M8；`canPlayM1` → M1（含单词卡回炉的「选出那个词」）；听辨 / 音标 2 或 4 选 → M3；打字 → M4；三周解谜里每个条目、每种换问法都有站（测试核）。
3. **镜头照跑酷的拿法**（`src/learn/play/cam.js`）：站的取景位姿是各自纯函数给的世界坐标 `{ pos, look, fov }`，`PlayCam` 用临界阻尼弹簧过去，`rig.mode = 'path'; rig.path = null`（`main.js` 不动 path 模式的 rig，rig 自己只加震动和算 FOV），FOV 经 `rig.zoom = (vBase − fov) / 0.8`（§19）；放回去时先把 `rig.yaw / pitch` 定在当前朝向再 `rig.follow(actor, true)`，rig 自己的 0.6 s 混合接上。M1 照旧用跟随镜头和它自己的 `dampAngle` 取景（问 M1 前先放回去）。
4. **她站着 ≠ 定身**：打字、跳台、翻牌时每帧在控制器写完意图之后、她动之前把 `intent.move / jump / fire / squid / sub / special` 清零（`match.update` 里 `learn.update` 先于 actors）；不碰 `match.paused`、没有 `learn.hold`；触屏层活着，摇杆照出（只是不动她）。
5. **判分只有 `_judgeRecord`**：字弹交一串字、节拍台交落地的台号（`resolve` 的 `right` 用 `rightAnswerOf`，舞台序号）、翻牌交 `true / false`；`_judgeRecord(g, item, p, ans, o)` 多一个 `o`：`o.hinted`（键盘的提示用过 → `H`）、`o.self`（→ `S`）；不给 `o` 就是卡片原来那一个调用。
6. **回炉**：单词卡答错 → `_altPrompt` 的 `choice-of-typed`（右边的词 + 近似词的四选）→ M1 墨球（`canPlayM1` 收它；选项只挑能当墨球的词——有汉字的、超过横幅长度的跳过）；听写句答错 → 开关下是同一句慢速再听、再打一次（原来的「四句选一句」会是四块横幅，没有玩法放得下）；听辨 / 音标答错 → 同一舞台重排。
7. **展板**：单词 5 个一板、音标 2 个一板、讲解一板、课文一板，一道门最多 `BOARDS_MAX` 6 块（复习日 48 个音标只展 12 个）；门变成「下一道」时沿前一道门到它的那段路升起（`boardSpots`）；自动走到每块没看过的板前停（`flow._autoWalk` 问 `host.autoTarget`），「自动走」再按一下走下一块或门；出题时阅读条收起。
8. **出口区**（`wire/exit.js`）：最后一道门开后进 `phase 'exit'`：回声亭在路线尽头左手、打卡垫 / 周报牌 / 入门小测牌在右手；自动走先亭子后打卡垫；**踩上打卡垫才结算**；没有打卡垫的一天（复习日）照旧门开就结算。写字墙不在出口区：它的 5 句是**最后一道门**（`flow._place` 把 `write-wall` 的步变成门，短关卡取 2 句），M4 的句子模式，记 `W`。
9. **翻牌靶的靶子**：留 play-3 的 `InkTargets`（没换成 play-1 的 `PlayTargets`：图集的 key 格式不一样，换了要改两边）。查出一个 bug：`FlipDeck` 把 `InkTargets.group` 挂在卡片的 group 下，而靶子的位置是世界坐标（`_showTargets` 自己乘过卡片的矩阵）——画出来的球被变换了两次、不在卡片旁边，投影和点击却是对的。改成挂在场景下。
10. **翻牌的镜头**：`FlipDeck.frame()` 是展板式的正对、水平——她站在镜头和卡片之间，正好把卡挡住。站里改成同一距离、镜头抬到她头上、俯视 `LEARN.flip.pitch`（0.62 rad）看卡。
11. **字弹的落点**：她前方 `FRAME.dist` 6.5 m、地面在她这一层（±0.9 m）、头到落点视线通；不通就 5.2 / 4.2 / 3.4 m 拉近（第一版落在二楼的窗台上）。**节拍台选址**：门后路线上 2–14 m 里每个路线点，量 7 个台位（家 + 四周）各自中心和四个边缘的地面高差 < 0.3、在导航网格上、家台到它 0.4 m 和 1.1 m 两条视线通（喷泉池边不算平地）；全过就用，否则分最高的。
12. **开关下不建 B 的占位路标**（它们正好立在最后一道门的题物中间）；出口区的站取代它们。

**改了什么**：
- 新：`src/learn/play/host.js`（`PlayHost`、`kindOfItem`、`stageSpot`、`facingYaw`、`autoTarget`、`exitStart / exitSpot / exitDone`、`say`、`debug`）、`src/learn/play/cam.js`（`PlayCam`、`baseVFov`）、`src/learn/play/wire/type.js`（`TypeStation`）、`wire/beat.js`（`BeatStation`、`isBeatItem`、`padLabels`）、`wire/flip.js`（`FlipStation`）、`wire/boards.js`（`BoardStation`、`gateSpecs`、`BOARDS_MAX`）、`wire/exit.js`（`ExitStation`）、`tools/learn/wire-audit.mjs`、`tests/learn/play-wire.test.mjs`。
- `src/learn/flow.js`：`new PlayHost(this)`；`_place` 追加写字墙门、`total` 在 `_place` 后算；`_judgeRecord(…, o)`；`_altPrompt` 听写慢速 / 单词回炉的选项过滤；`_autoWalk` 的停点；`_open` 进出口阶段；`_exitUpdate`；开关下不建占位路标。
- `src/learn/play/m1.js`：`M1_KINDS` 加 `read`；`canPlayM1` 收 `choice-of-typed`。`src/learn/play/flip/deck.js`：靶子挂场景。`src/learn/design.js`：`PLAY` 表 + `playOf`。`src/config.js`：`LEARN.flip.pitch`。`tools/play3-lab.js`：`measure()` 多画一帧。`tests/learn/play.test.mjs`、`design.test.mjs`：阅读题进 M1、`playOf` 全覆盖。`docs/PLAY.md`：§4 表写句 / 课文 / 翻牌三行、路标一段标「play-wire 更正」。

**动了别人地盘的**：`src/core/touch.js` 三行（两个 import + `_down` 里一句：`PlayKeys.owns(e) || ReadStrip.owns(e)`，或开关下点在题条的 ▶ / 关卡 HUD 自己的按钮上 → `return`，在 `enabled` 之后、跑酷的滑动钩子之前——不然节拍台在时点 ▶ 也算跳台）。`weapons.js`、`main.js`、`actor.js`、`cameraRig.js` 没动。`tools/learn/play-audit.mjs` 的 M1 审计读的是 `F.play.cur / T / debug()`，现在 `F.play` 是宿主（M1 在 `F.play.m1`），它只剩 `--script` 那条路（其它形式的回放）还能用；解谜的审计是 `wire-audit.mjs`。

**测试**：`npm run test:learn` 170 → 177（`play-wire` 6 条：三周每个条目每种形式都有玩法且答案形状对得上输入；解谜每道门能问的每个 prompt——引擎的、换问法的、翻牌的、「不熟」后的打字——都有站；打字证据 `T / H / L(pct) / W / S` 和不给 `o` 时与卡片同一个调用；听辨 174 · 音标 96、重排后还在台上、不是墨靶；展板数；`touch.js` 的跳过在滑动钩子之前、各站源码里没有判分；`design.test` 多一条 `playOf` 全覆盖）；`npm run check` 270 个文件绿。

**实测**（`tools/learn/wire-audit.mjs`：静态服务 `/game/`、SwiftShader、`?quality=low`、冻时钟步进；`?short=1&gate=N` 两道门各两题，自动走，每道板停一次再按「自动走」；每题核：没有显示出来的 `.iw-learn__panel`、`match.paused === false`、`learn.hold` 为假、题条在、题物 / 台子 / 键盘 / 卡片在屏内或安全区内、模拟一次点 / 打字 / 跳 / 翻能答、`learn:answer` 一次且 `first: true`；2026-10-16 UTC）：

| 关卡（`?short=1&gate=N`） | 竖 390 × 844 | 横 844 × 390 |
|---|---|---|
| `w1d1` 门 1–2：音标展板 4 块 + 节拍台 4 台 ×2；单词展板 + 墨球 ×2 | 全过（15:30，`63da822`） | 两道门全过（16:11，`c4093c0`），之后自动走卡住到 540 s 的预算——舞台选在了码头凉亭的屋顶下（镜头在屋顶外什么都看不见），门开后她站在网格外的侧台上走不出来：选址加了头顶 5 m 开阔、舞台镜头看得见家台、台位 0.75 m 内有可走节点（`4452356` / `ea6f7a5`），收台时站在网格外就回家台（`4f29a3c`）；改后见下面的复跑 |
| `w1d1` 门 4–5：听写句 M4 ×2；课文板 + 阅读题墨球 / 横幅 ×2 | 全过（15:37；两条红是审计自己的：键盘滑入动画走墙钟，第一个键点早了——审计改成等键盘停稳） | 两道门全过（16:28，`c4093c0`；听写句的灰墨字整句成形在街上），写字墙那道门没跑完（预算）；截图里阅读题的横幅和课文板挤在一起、一块横幅藏在板后 → 门开始出题时收掉它的展板（`c77acf4`） |
| `w1d1` 门 6–7（+ 写字墙）：听辨 2 台 ×2；单词卡 M4 ×2（第一个用了提示 → `H`）；写句 M4 | 全过（15:52；写字墙见复跑） | 两道门 + 写句的打字框全过（16:20，`c4093c0`），写句的「射」没跑到（预算）；单词卡的墨字打进了房子 → 字弹选朝向：门后那一向被挡就在 ±1.4 rad 里挑最长的空地（`9a35a5b`） |
| `w1d7` 门 3–4：翻牌 ×2（认识 → `F`）；讲解板 + 横幅 ×2 | 全过（16:00） | 全过（16:01；舞台 `terraces`）；翻过来以后靶子看不见——`FlipDeck` 把靶子挂在卡片 group 下又给世界坐标，画在别处（`9355973` 修） |

（复跑——写字墙 + 出口区、横屏 `w1d1` 门 1–2 改后、`w2d1`、`w1d2`——见本节末尾的更新。）

**拿不准的（自己定了，请主会话过目）**：
1. 写字墙成了最后一道门：解谜以前从不问写句（B 把它当占位路标），现在每天多 5 句、记 `W`；「我的写法也对」（`S`）没接——`_judgeRecord` 当场就写了 `W`，要先扣住首答再给她点（boss.js 的 `_settle` 那种），这一步没做。
2. 踩打卡垫才结算（有打卡垫的天）；复习日照旧门开就结算，周报牌 / 入门小测牌没站出来。「经典页」游戏里没有可开的页：发 `learn:classic { kind }` + 一句提示。
3. 星表：打卡时没写本机星表（解谜本来也不写；道具赛写）。
4. 一道门最多 6 块展板：复习日的 48 个音标只展前 12 个（展板是看的，题一个不少）。
5. 节拍台整小节没动两次 → 排到门尾、不写证据，但 `asked` 已经加过、`learn:question` 已发过一次。
6. 翻牌的靶子留 `InkTargets`（多 2 个 draw call）；「射一下翻牌」没接（只有点）。
7. 听写的 `typedOk`（她的哪几个词炸开）用宿主 `lcsOk(她的词, 参考词)`，百分数照旧是 `judge` 的。
8. 出口区的亭子 / 牌子位置用的是路线尽头附近的导航节点（像 B 的占位路标），没有做选址打分。

**没做的**：
1. 「我的写法也对」（`S`）在字弹上。
2. 复习日的周报牌 / 入门小测牌、打卡的星表。
3. 道具赛换跑酷 + 滑行段接字弹；对抗赛 / 今日小考 / Boss M5；双人；横屏键盘拆两半；删卡片——主会话另派。
4. 帧时间对比（PLAY §7）没量；真机。

**交接**（收尾时写；分支 `play-wire`，没推，从 dev `2929440` 建出）：
- **做到哪**：解谜（`kind=puzzle`）里三周每一个条目都有玩法，`_askNext` 的「照旧卡片」分支在三周的内容上走不到（`toCard` 还在：开关关掉、其它形式继承的流程照旧）。竖屏 `w1d1` 三组 + `w1d7` 翻牌、横屏四组都在浏览器里走过（上表）；写字墙 + 出口区、改过选址 / 朝向之后的横屏、`w2d1` / `w1d2` 的复跑看本节末尾。
- **先看哪些文件**：`src/learn/play/host.js`（`kindOfItem` 分站 → `ask` / `update` 的镜头和站立 → `stageSpot` / `facingYaw` / `exitStart`）→ `cam.js` → `wire/type.js`（`ask` 的朝向和落点、`_pose`、`_submit`）→ `wire/beat.js` → `wire/flip.js`（`_pose`）→ `wire/boards.js`（`gateSpecs`、`place`）→ `wire/exit.js`；`flow.js` 里 `this.play` / `phase === 'exit'` / `_altPrompt` 的几处；审计 `tools/learn/wire-audit.mjs`（`walkOn` 的板停和出口停、四个 `answerXxx`）；测试 `tests/learn/play-wire.test.mjs`。
- **已知坑**：
  1. 舞台 / 字弹 / 出口区的位置都是按导航网格、地面高差和 `physics.los` 挑的，装饰性的道具（不在物理里的）躲不开；一个关卡一个样，截图要看。
  2. 审计的每一步都是冻时钟步进，SwiftShader 下一道门 2 题约 2–3 分钟，三道门 + 出口区要 `--budget 900` 以上；键盘滑入是 CSS 动画走墙钟，打字前要等它停稳（`kbSettled`）。
  3. `cam.release` 后 rig 的 `follow(actor, true)` 把镜杆重置到 `dist`，第一帧可能穿进她身后的墙，rig 自己的探杆下一帧就收回来。
  4. `hud.playMode(true)` 在展板框住时也会调（藏走路条）；谁 `playMode(false)` 要看 `flow.phase`（`wire/boards.js` 的 `on.unframed`）。
  5. 字弹的 `TypeShot` 一题结束 `_next` 在 Promise 里回流程；流程若在同一帧里 `clear()`（换站 / 门开），`InkWord.clear()` 会让等着的 Promise 落地，不会卡。

### 更新（play-fix，2026-10-17，分支 `play-fix`：主会话看 play-wire 截图发现的几处 + 上面「没做的」「复跑」）

**先读了什么**：本节全文（「拿不准的」「没做的」「交接」）、§23（跑酷把打字镜头做对的办法：`runner/glide.js _framed`、`runner-drive.js frameCheck`；`held / decided / claim / self` 的约定；`play-strip.js` 的 `actions`）、PLAY §1 的 12 条、§3 M3 / M4 / M7 / M8 / 路标、§6、§7、§10；代码：`wire/{type,beat,exit}.js`、`host.js`、`cam.js`、`type/{frame,shot,rig}.js`、`ui/play-keys.js`、`ui/play-strip.js`、`flow.js`（`_judgeRecord`、`_exitUpdate`、`_autoWalk`）、`forms/common.js`（`canClaim / claimJudge`）、`engine.js`（写句的 `claimable`）、`echo/booth.js`、`board/{signs,walk}.js`、`beat/{pads,stage}.js`、`world/level.js`（`queryBlocks / pointInBlock`、道具的隐藏碰撞块）、`game/physics.js`、`game/cameraRig.js`（`fov` 的算法）、`main.js`（`debug.step`、`frameTimes`）；play-wire 留下的三次复跑的日志（`wire-run2-*` / `wire-run3-*`：都在出口区卡到预算用完）。

**先查清的**：
1. **打字镜头在真关卡里为什么不对**：先在 dev（`7fae9fe`）上量（审计新加的投点，见下）——竖屏 `w1d1` 门 7 第一张单词卡，镜头停稳以后打字机的点在 495–754 px，键盘顶在 548 px（大半在键盘底下），横向 287–571 px（390 宽的屏，右半边出屏）；横屏 251–407 px，键盘顶 238 px（整个在键盘底下）。镜头没在半路（审计等它停稳了才量，11 步）。两个原因：① 机位按 `frame.js` 默认的题条底边 0.1 算，解谜竖屏的题条实际在钟和暂停 / 地图键下面（底边 243 px ≈ 0.29），横屏在钟下面（113 px ≈ 0.29）；② 机位在出题那一刻按她当时的位置和选的朝向一次算死（续题时船体和选的朝向能差到 0.4 rad）——基线里量到的打字机整个往右下偏，船体朝向和选的一样（都是 1.864），只能是她出题后又挪了一点（到门前的那点滑行；站着只清意图），镜头对着的还是旧位置；③ 选朝向只看墨字落点，不看镜头那边——竖屏基线的截图里镜头隔着栏杆。
2. **准星**：基线两张截图里准星都在打字机正中。审计的「准星藏着」从来量不出东西：`.iw-xh` 是屏幕正中一个 0 × 0 的锚点，量它的框永远是 0（play-4 `runner-drive.js` 的同一个检查也是这样——跑酷那边 CSS 真的藏了，但审计证明不了）。
3. **出口区卡住**：三次复跑都停在回声亭边 1.1 m 处、自动走开着、`stall` 一直是 0——`nextSpot` 在 0.9 m 内就换到下一个停点（打卡垫），自动走却要到 0.7 m 才停：她在两个目标之间来回走，`_exitT` 每次换目标清零，40 s 的计时器永远到不了。

**改了什么**（每项一个提交）：
1. **打字镜头**（`wire/type.js`，`38e0611`）：照 play-4——先把键盘和题条立起来，再从 DOM 读题条的真实底边（+6 px）和键盘的真实占比，`frameFor` 按这条带子算、按带子缓存（每 0.4 s 再读一次：提示会重画题条、转屏）；位姿每帧按打字蟹船体的真实朝向和她的脚换到世界里（持久对象）；选朝向时把镜头也算进去（她头顶 → 镜头、镜头 → 键盘 / 纸，挡住就换方向，最远到背向路线）；横屏手机打字时题条贴顶边、一行、藏 ▶（`.iw-ps.is-typing:not(.is-runner)`，CSS 在 `wire/type.js` 里注入）。墨字机位（`30ecd95`）：按真实带子算的墨字机位更远，第一次复跑里退进了身后的喷泉雕像——现在依次试真实带子 → `frame.js` 自己的带子 → 一半距离，每个核「镜头 → 字、镜头 → 打字蟹、她头顶 → 镜头」，都不通就留在打字机位转头看字。她的头和中间那排之间留 0.05 NDC（`b8a5ab4`，`wire/type.js` 自己调 `frame.js` 导出的 `searchFrame`，规则加余量；放不下退回 `frameFor`）。`PlayCam.to` 不再每帧新建对象。
2. **藏准星**（`host.js`，`7e27fa6`）：有站位姿（打字、节拍台、翻牌）或框住的板（展板、回声亭、路标）时 HUD 加 `is-station`，`.iw-hud.is-station .iw-xh { display: none }`；M1 照旧显示（她在那里瞄）。审计改量准星里面的 `.iw-ret`（`41bae72`）。
3. **节拍台选址**（`host.stageSpot`，`f9a7c0f`）：打分加三样——舞台上（家台、四周的台、台外的牌子，按这个方向的 `stageLayout`）没有物理里的实心块（level 的 blocks，道具的隐藏碰撞块也在里面；地面以上 0.25–2.6 m，每个圆盘的中心和一圈 8 个点、两个高度，`pointInBlock`）；每块台、家台、每块牌子从舞台镜头看得见（`physics.los`，竖横两个方向的镜头都核）；她从站的地方跳上家台中间没有墙。都过才算合格；门后 2–14 m 没有合格的就往前找到 22 m，再往门前找 10 m，都没有取分最高的。
4. **「我的写法也对」（S）**（`flow.js` 只加 7 行、`wire/type.js`，`86a4068`）：`_judgeRecord` 多认两个选项——`o.hold`：`canClaim` 收的写句差一点 → `{ held: true }`，什么都不写、不加锁、不发 `learn:answer`；`o.decided` + `o.claim` → `claimJudge` 再核，站得住 → `self` → `[1, S]`；只有 `o.decided`（继续）→ 照原来的错 `[0, W]`、加锁、换问法。不给这两个的调用一字不差。字弹射 → `{ hinted, hold: true }`；扣住时墨字长好、保持中性灰，题条「差一点 — 意思到了」+「我的写法也对 / 继续」（`verdict({ actions })`），点了才 `_decide` → 同一条 `_judgeRecord` → 墨字演判定；不超时。
5. **出口区**（`wire/exit.js`，`55152eb`、`a246a39`；站点的选法见下面「复跑里新找到的」）：停点「到了」不再按距离切——自动走停在那里（自动走关了、在 1.2 m 内）才算：亭子是她进了亭子，牌子是站够 1.5 s；或讲完 / 读完 / 打过卡 / 被计时器放过。周报牌 / 入门小测牌是自动走的停点（读过 = 框住 1.2 s）；打卡垫排最后（踩上去照旧结束这一天）；没有打卡垫的一天（`w1d7`：入门小测牌、周报牌、回声亭）讲完亭子、每块牌子都看过才结算。打卡的星表照旧不写（上面拿不准的 3）。
6. **审计**（`tools/learn/wire-audit.mjs`，`41bae72`、`2aa1d51` 和各项的提交）：打字时等镜头停稳，把 `RIG_POINTS`（键盘四角、砸字点、正在打的两行、打了十个字后的行首）投到屏上：都在题条底边和键盘顶之间、她的头低于中间那排（横屏：最远那排）；准星（`.iw-ret`）在打字 / 节拍台 / 翻牌 / 框住的板上都藏着；墨字从镜头看得见、在题条下面；`--near`：第一句写句少打最后一个词 → 扣住时证据不动、两个按钮 ≥ 44 px、墨字长好灰着，点「我的写法也对」→ S；出口区每个停点都到了（没有一个是计时器放过的）、这一天结束；`--perf`：帧时间（下面）；`--exit-only`：直接用 `flow._open` 开所有门（不答题、不写证据），只看出口区；量墨靶、节拍台、打字机位之前等镜头停稳（位置 < 1 cm、朝向 < 0.003 rad 一步）。

**动了别人地盘的**：`flow.js` 7 行（一个 import、`_judgeRecord` 里两行 + 注释，只加）。`touch.js`、`weapons.js`、`main.js`、`actor.js`、`cameraRig.js`、`play-strip.js`、`run.js`、`config.js`、`duel.js`、`boss.js`、`arena/`、`runner/`：**一行没动**。`docs/PLAY.md` 三处「play-fix 更正」（§3 M4 机位、§4 表写句、路标）。

**PLAY §1 逐条核**：① 不暂停 / 不定身 / 不弹面板——审计每题核 `paused` / `hold` / 面板；扣住时世界照跑、她站着（意图清零，同打字）。② 判分只走 `_judgeRecord`——扣住和决定都走它（`o.hold / o.decided / o.claim`），站点源码里没有判分（测试核）。③ 证据如实——扣住时什么都不写；`S` 只在 `claimJudge` 站得住时记；`T / H / L / W` 的路没变。④ 节奏不等于对错、⑤ 没有误答——节拍台和墨靶的判法没动。⑥ 不惩罚——扣住不超时，错还是珊瑚色。⑦ 每句英文配中文——题条没动（横屏打字时一行，中文行太长末尾省略）。⑧ 不加素材——没加任何素材文件，CSS 在 JS 里注入。⑨ 画风流畅——镜头还是弹簧、不硬切，`PlayCam.to` 每帧不再分配，帧时间见下。⑩ 竖横都能玩——两个方向都量过、跑过。⑪ 内容一条不少——`playOf` / `kindOfItem` 没动，测试照过。⑫ 开关可退——只有开关下的站点给 `o.hold`，卡片的调用一字不差（测试核）。

**测试**：`npm run test:learn` 189 → 193（新 `tests/learn/play-fix.test.mjs` 4 条：七张舞台竖横两向、每张 5 个门位 × 2 / 4 台的选址——合格的位置独立再核台上没有块、镜头看得见，至少六成门位有合格的位置；扣住 → 我的写法也对 `[1, S]` 一次 / 继续 `[0, W]` + 锁 + 再问 / 答对和差得远不扣 / 不给 `o.hold` 照旧，站点源码里没有判分；打字机位按真实带子在竖横桌面都框得住、站点自己的机位里头比那排低 ≥ 0.05 NDC；出口区的停点——回声亭边 0.8 m 不换停点、停下才算到、复习日的牌子是停点、没有打卡垫时讲完 + 牌子都看过才结算）；`npm run check` 271 个文件。和旧选址比（同一批门位，Node）：台上有道具竖屏 6 → 0、横屏 19 → 0，台从舞台镜头看不见 7 → 0、24 → 0。

**实测**（`tools/learn/wire-audit.mjs`，静态服务 `/game/`、Chromium + SwiftShader、`?quality=low`、冻时钟步进，一次一个浏览器 `flock -w 9000 /tmp/ielts-browser.lock nice -n 10`；舞台 tidewater；2026-10-17 UTC。基线是 dev `7fae9fe` 的一份拷贝、配同一个新审计；截图在 scratchpad 的 `fix-shots/before|after/`，不进仓库）：

| | 竖 390 × 844 | 横 844 × 390 |
|---|---|---|
| 打字机位（基线，`w1d1` 门 7 第一张单词卡，镜头停稳后） | 题条底 243 px、键盘顶 548 px；打字机的点 495–754 px、横向 287–571 px（大半在键盘下、右半出屏），准星在正中 | 题条底 113 px、键盘顶 238 px；打字机 251–407 px（整个在键盘下），她看不见 |
| 打字机位（改后，每一题量） | 打字机 272–495 px，在题条（223–243）和键盘（548）之间；她的头低于中间那排 22–23 px（加余量之前 1–2 px） | 题条贴顶、一行，底边 38 px；打字机 62–222 px，键盘顶 238 px；头低于最远那排 11–12 px（加余量之前 1–2 px） |
| `w1d1` 门 7（单词卡 ×2 + 写字墙 2 句 + 出口区，`--near`） | 全过（审计自己一处：扣住那句等字长好的步数太少，已放宽）；写句 `today is` 扣住 → 证据不动 → 我的写法也对 → `[1, S]`；回声亭讲完、踩打卡垫、这一天结束，没有一个停点被计时器放过 | 同左 |
| `w1d1` 门 1–2（音标板 4 块 + 节拍台 4 台 ×2；单词板 + 墨球 ×2）+ 写字墙 + 出口区，`--perf` | 节拍台：四块台和家台都在空地上（截图：喷泉不在台上）；扣住 → S；出口区走完。一处红：第二道门第一题的墨球框住时一颗球的标签出了右边（`M1` 的取景，见拿不准的 5） | **全过**：板框住、台在安全区、墨球在安全区、打字机位、墨字看得见、出口区走完 |
| `w1d2` 门 1–2（crossmarket：音标板 + 节拍台 4 台 ×2；单词板 + 墨球 ×2）+ 写字墙 + 出口区 | — | 节拍台、墨球、写字墙第一句、准星都过；三处红：两处是审计量早了（节拍台在镜头弹过来的半路量的；第二句写句的镜头位置没动、只在转——只看位置的「停稳」一步就返回），都改成等位置和朝向都停；一处是真的：**出口区打卡垫被计时器放过**（下面「复跑里新找到的」） |
| `w1d7` 门 3–4（terraces：翻牌 ×2；讲解板 + 墨球 ×2）+ 出口区（入门小测牌、周报牌、回声亭，没有打卡垫） | **全过**：翻牌 `F` ×2；出口区亭子 → 入门小测牌（读过）→ 周报牌（读过）→ 结算 | — |
| 出口区（`--exit-only`：直接开所有门、不答题不记证据，从出生点走过去） | tidewater（`w1d1`）：亭子 → 打卡垫；terraces 复习日（`w1d7`）：亭子 → 入门小测牌 → 周报牌——都全过 | crossmarket（`w1d2`）：改站点前打卡垫被计时器放过（两次），只按走路边找时又踩早了（说完了之前就结算）；改后亭子 → 说完了 → 打卡垫，全过 |
| 最后一轮（审计等镜头停稳、出口区新站点） | `w1d1` 门 1–2 + 写字墙 + 出口区：节拍台（镜头停稳后量，11 步）、打字机位、墨字、出口区（说完了 → 打卡垫）都过；墨球那一处照旧（下面拿不准的 5：dev 上一模一样） | `w1d2`（crossmarket）门 1–2 + 写字墙 + 出口区：**全过** |

- **复跑里新找到的（crossmarket 的出口区）**：路线的终点在一段坡道上，亭子按偏移量找最近的节点找到了旁边高 1 m 的市场平台上，打卡垫在平台下面的地上；从亭子到打卡垫的路要从平台尽头「掉」下去再从平台底下绕回来——自动走只按水平距离判「走到了」，走在平台上时把平台底下那几个节点都当成走过了，最后对着平台边的栏杆走（速度一直是 5.8 m/s、`stall` 从不累计），40 s 后计时器放过打卡垫。play-wire 留下的 `w2d1` 复跑卡住的也是这里。改法在 `wire/exit.js`（`flow.js` 的自动走没动）：站点先找「离路线终点的高度差 ≤ 1 m、从终点走过去和走回来都只有走路边（没有掉、跳、爬）、从亭子走过去也是」的节点，找不到才用原来的办法；牌子和它的看板点离亭子 ≥ 3.2 m（只按走路边找时两个站都挤到了坡道上，打卡垫离亭子 1.9 m，她还在亭子的圈里就踩上了打卡垫，这一天在「说完了」之前就结束了）。审计多一条：有亭子的一天要先说完。
- **准星**：打字、节拍台、翻牌、框住展板 / 亭子 / 牌子的每一题都核了 `.iw-ret`，都藏着；墨靶时照旧在（她在瞄）。
- **墨字机位**：竖屏广场上两题都用了第三个候选（一半距离）——前两个的镜头退进了身后的喷泉 / 栏杆；横屏都是第一个。字都从镜头看得见、在题条下面。

**帧时间**（PLAY §7；`--perf`：play-1 的 `debug.frameTimes`，`main.js _frame` 的 CPU 毫秒数，每样 45 个步进帧（每帧都画），`w1d1` tidewater；SwiftShader，只能互相比）：

| `_frame` p50 / p95 / 最大（ms） | 竖 390 × 844 | 横 844 × 390 | 绘制调用（竖 / 横） |
|---|---|---|---|
| 走路（自动走，去第一道门） | 4.0 / 9.7 / 18 715 | 3.4 / 10.1 / 2 497 | 62 / 55 |
| 框住展板（音标板） | 2.7 / 5.7 / 274 | 2.9 / 7.7 / 9.5 | 55 / 59 |
| 节拍台（词放过、在听） | 2.4 / 4.7 / 6.2 | 2.3 / 4.5 / 5.7 | 52 / 52 |
| 字弹（打字蟹 + 键盘、镜头停稳） | 2.4 / 4.5 / 4.6 | 2.3 / 4.6 / 7.9 | 57 / 60 |

三个站的 p95 都比走路低（站着不动，没有脚步、跟随镜头、地面探测；play-1 量墨靶时也是这样），PLAY §7「出题时 p95 不差过走路 10%」满足。走路那一列的最大值各是一帧几秒的卡顿（这一段路上第一次画出来的东西在 SwiftShader 上编着色器 / 传贴图；两个方向落在不同的帧上），p95 不受它影响；它不在这一期改的代码里，但值得在真机上看一眼走向第一道门时有没有一顿。

**拿不准的（自己定了，请主会话过目）**：
1. **头和那排之间留 0.05 NDC**（竖屏约 20 px、横屏约 10 px）：`frame.js` 的搜索停在第一个刚好过关的机位，第一次复跑里头只低 1–2 px，截图里头发压着键盘前两排。余量让镜头高半米多、更俯一点，打字机的大小几乎不变。`frame.js` 没改——跑酷（`runner/glide.js`）还是原来的规则；要统一就把余量搬进 `frameFor`。解谜的站点只用 `frameFor` 里「只框打字蟹」那一支（`cz 1.0`），不用「靶点也露在纸上面」那一支——竖屏的带子里那一支本来就很少选得上，横屏贴顶以后也是打字蟹优先；是有意的。
2. **横屏打字时题条盖住钟**（贴顶边，和跑酷一样）：换来打字机约两倍的高度（题条底 113 → 38 px，打字机 62–222 px）。题条的中文行在一行里放不下时末尾省略（字号照 17 px）。
3. **选朝向时镜头优先于墨字的距离**：镜头那边被挡就换方向，最远到背向路线（±2.6 rad、π）；这时墨字可能落得近一些（≥ 3.4 m）。
4. **墨字机位的三个候选**都不通时留在打字机位、转头看字（字在打字蟹上方、可能小）。
5. **墨靶的取景出界（不是这一期带进来的）**：竖屏 `w1d1` 门 2 第一题，四颗球的第四颗标签出了右边 32 px（镜头停稳了也一样，第二题在界内）；拿 dev `7fae9fe` 的拷贝配同一个审计跑同一关，四个框的像素一模一样——是 play-1 的 M1 取景（`run.js`，play-5 也改过）在这个站位上的老问题，这一期没动。
6. **节拍台的牌子和不在物理里的装饰**：横屏门 1 的「sit」牌左边被茶室的阳伞伞面挡住一角（阳伞的碰撞盒只有桌椅，伞面不在物理里）；任务书要的是物理里的道具，装饰的伞面、灯串躲不开（§22 已知坑 1 照旧）。
7. **出口区「到了」的定义**：亭子 = 她进了亭子且自动走停了；牌子 = 读过（框住 1.2 s）或在牌前停够 1.5 s。手动走进亭子也算到。没有打卡垫的一天每块牌子都要「到」过才结算——牌子只看不答，这样她不会错过周报 / 入门小测的「经典页」入口。
8. **准星的审计**：play-4 的 `runner-drive.js` 用的是同一个量不出东西的写法（量 0 × 0 的锚点）。跑酷的 CSS 确实藏了准星，但它的审计证明不了；那个文件归跑酷 / play-5，这一期没改，改法见 `wire-audit.mjs xhShown`（量 `.iw-ret`）。

**没做的**：
1. 桌面 1280 × 720 没跑（任务书要竖横两向）。
2. 真机：帧时间、横竖切换、手感。
3. `w2d1` 的整关复跑没跑——它卡住的出口区和 `w1d2` 是同一个舞台（crossmarket）、同一处，已用 `w1d2` 整关和 `--exit-only` 复核；`w1d1` 门 4–5（听写 + 阅读题）只跑了 play-wire 当时的那一次。
4. 墨靶出界那一处（拿不准的 5）没修：它在 dev 上就有，归 M1 / `run.js`。

**交接**（分支 `play-fix`，没推；从 dev `7fae9fe` 建出）：
- **做到哪**：任务书八项都做了：打字镜头（竖横投点量过、截图）、藏准星（审计真的量准星了）、节拍台选址、字弹的「我的写法也对」、复习日的牌子、出口区卡住（tidewater 的来回走、crossmarket 的走不到 / 踩早了）、复跑、帧时间。最后一轮：横屏 `w1d2` 全过；竖屏 `w1d1` 只剩墨靶那一处（dev 上就有）。
- **先看哪些文件**：`src/learn/play/wire/type.js`（`ask` 的顺序：键盘 / 题条 → `_band` → `_typeFrame` → 选朝向 `_lensClear` → `_typePose` 每帧；`_pose('word')` 的三个候选；`_submit → _decide → _resolve`）→ `host.js`（`_crosshair`、`stageSpot` 的 `rate` / `along`）→ `wire/exit.js`（`nextSpot`、`_reach`、`done`）→ `flow.js _judgeRecord` 的 `o.hold / o.decided / o.claim`；审计 `tools/learn/wire-audit.mjs`（`typeFrame`、`wordFrame`、`xhShown`、`settle`、`--near`、`--perf`）；测试 `tests/learn/play-fix.test.mjs`。
- **给合并的人**：`flow.js` 只加了 7 行（`import { canClaim, claimJudge }`、`_judgeRecord` 开头两行）；`play-strip.js` / `run.js` / `config.js` 没碰，和 play-5 不冲突。`wire/type.js` 用了 `frame.js` 导出的 `searchFrame`（一直导出着，没改它）。
- **已知坑**：① 审计里键盘的滑入动画关掉了（`transition: none`）；真机上键盘滑入的那零点几秒里 `_band` 读到的键盘占比是对的（它读的是布局的高度，不是动画中的位置），题条的底边每 0.4 s 重读一次；② 选朝向（看镜头和墨字）在出题那一刻做一次；之后位姿每帧按她的脚和船体重算，她被推开镜头也跟着，但不会因此换朝向；③ 走路那一段的单帧卡顿（帧时间表）不归这一期，真机上看；④ 出口区站点要「只有走路边」时是按 nav 的边类型判的，浏览器里道具碰撞盒会让 nav 的边和 Node 里不一样（§23 已知坑 2），所以 Node 里没有测站点的选法，靠 `--exit-only` 在浏览器里核。

## 23. play-4 交付（2026-10-16，分支 `play-4`：道具赛换成墨浪跑酷 + 滑行段接字弹 + 看板段 + 跑酷收尾，PLAY §3 M2 / M3 / M4 / M6 · §4「道具赛」列 · §5.2 · §6.3 · §8 · §10）

两个子代理做的：前一个做了「道具赛换成跑酷」（`5a09e64`）和滑行段 / 看板段的半成品（`b5ea0e8`、`e03b55b`，WIP，被额度掐断，没进过浏览器）；后一个从合并 dev 接着做完。

**先读了什么**：前一个子代理三个提交的说明和代码（`runner/{runner,glide,boards,rows,cam,view,tips}.js`、`tests/learn/runner-glide.test.mjs`）；PLAY §1 的 12 条、§3 M2 / M3 / M4 / M6、§4 表、§5.2、§6.3、§8、§10；本文 §18（题条）、§19（字弹的接口、`frame.js` 的机位）、§20（跑酷，含「还缺」「已知的坑」）、§21（展板接口）、§22（`_judgeRecord(…, o)`、`wire/type.js` 的接法、`wire/boards.js`、`touch.js` 的跳过）；代码：`flow.js` 的 `_judgeRecord` / `_altPrompt`、`race.js` 的 `_answer`、`forms/common.js` 的 `canClaim / claimJudge / judgeAnswer`、`store.js modeOf`、`play/type/{shot,rig,frame}.js`、`ui/play-keys.js`、`ui/play-strip.js`、`board/{walk,frame,set}.js`、`core/touch.js`（滑动钩子在 `G.playTap` 前面）、`game/physics.js`（`cameraProbe` / `los`；道具的碰撞盒是 level 的 hidden block）、`main.js` 的看穿窗口（只在 rig 是 follow 时开）；play-5 的 `arena/type.js` 和 `boss.js _judgeRecord`（「扣住 → 我的写法也对 / 继续」）、`play-strip.js` 的 `actions`（只读）。

**先定的**：
1. **合并 dev 没有冲突**（`3178914`）：`cam.js / host.js / touch.js / play/cam.js` 只有 dev 改过；`config.js`、`play-strip.js`、文档两边各加各的。
2. **跑酷的判分一条路：`RunnerFlow._judgeRecord`**。上一个子代理的滑行段借的是 `LearnFlow._judgeRecord`——它给门加锁、把条目推进门自己的队列、用 `item._tries` 决定再问；跑酷有自己的队列，车道行又走的是 `rows.js rowAnswer`，「判分只走 `_judgeRecord`」在车道行上不成立。现在车道行（`_settle`）和打字（`glide.js`）都调 `RunnerFlow._judgeRecord(g, item, p, ans, o)`：道具赛卡片的那几行（`judgeAnswer → store.recordFirst`，`o.hinted` / `p._hinted` → `H`，自认 → `S`）+ 首答 / 答对计数 + `learn:answer` 一次；再问不再问由各自的 `e.tries` 定（同 play-runner 的车道行）。测试拿 w1d3 每道选择题对 / 错两道、单词、听写，和 `race.js _answer` 写出的证据逐字比过。`flow.js` 一行没动。
3. **「我的写法也对」照 play-5 的约定**（`boss.js _judgeRecord`、`arena/type.js`）：写句差一点、`canClaim` 说能自认 → `{ held: true }`，什么都不写、墨字保持中性灰；题条上「我的写法也对 / 继续」（play-5 的 `verdict({ actions })`，逐字照抄进 `play-strip.js`，两边合并是同一段）；她点了才 `_judgeRecord(…, { decided: true, claim })`：`claimJudge` 站得住记 `[1, S]`，「继续」记 `[0, W]` 并排「为什么」先给的再写。**不超时**（PLAY §1 第 6 条），这一句没点之前滑行段一直延伸。单词卡的 `S`：卡片和各玩法里都没有入口（`canClaim` 只收写句），跑酷里也只有 `T / H`。
4. **打字机位按真实的带子算**（主会话看 play-wire 截图说的两处）：`frameFor` 的 `topFrac` 用题条在屏上的真实底边（跑酷竖屏的题条在战绩下面，`top: 122px`，底边约在屏高的四分之一，`frame.js` 默认的 0.1 会把打字机放到题条底下），`kbFrac` 用键盘的真实占比；机位按打字蟹船体的朝向换到世界里、每帧跟着她走；射后看墨字，她游到字跟前（2.5 m）就交回跟拍镜头。准星：跑酷整局都藏（`.iw-hud.is-runner .iw-xh`），审计每题核。
5. **看板段**：PLAY §5.2。`withBoards` 在有展板的站（单词展板 5 词一块、音标 2 个一块、语法 / 发音讲解一块；和解谜的 `gateSpecs` 同样分块）前面插一段；板子在 `_build` 时立起（远处就看得见），沿路排在路外 ≥ 2.6 m、空的一侧（右手优先）、朝她来的方向；这一段墨潮 `LEARN.runner.boards.tide` 0.25、机器人同倍数慢（`fairK`）。**框哪块按路程**：BoardWalk 只在她站在观看点 2.4 m 内、慢下来时才框（`walk.js` 不归这一期改），跑酷里她从不站着——`RunnerBoards.update` 把「她这一段路对着的那块板」的观看点和「站着」交给它：从前一块板到这块板过去 0.5 m，约 2.7 s 一块；过了最后一块就放开（往前游就是翻页）。板上的热区：`touch.js` 的滑动钩子在 `G.playTap` 前面，跑酷里手指永远到不了 playTap，所以 `RunnerBoards` 自己在 window 捕获阶段收 pointerdown / up（不拦，拖动照样是滑动），`touch.js` 没动。有题 / 在打字时阅读条不开。起跑前的阅读课文照旧。
6. **道具旁边的镜头遮挡**：看穿窗口（`levelMaterial` 的 see-through）只在 rig 是 follow 时开，跑酷的镜头是 path 模式、`main.js` 不归这一期动；道具的碰撞盒在物理里，`physics.los` 看得出来。镜头到她胸口、或到正在问的那一行中间的视线被挡 → 一个弹簧把镜头升起 ≤ 2.2 m、往前 ≤ 1.2 m（看点不变：视线越过矮道具往下看），线通 0.6 s 后慢慢放下；打字 / 框板时不升。
7. **道具在打字题上**：墨雨（`hintNext`）先给提示、记 `H`（PLAY §5.2「`rain` 是提示（记 `H`）」，play-runner 时跑酷里用不上）；回声（`echoNext`）1.9 s 后再放一遍。
8. **站位姿先核视线**（浏览器里才看得见的坑，terraces 的窄街和屋顶）：打字机位每帧核「她头顶 → 镜头、镜头 → 键盘」，墨字机位算一次核「镜头 → 字、镜头 → 构图里打字蟹的位置、她头顶 → 镜头」，每块展板立起来时核「镜头 → 板的中间 / 上两角 / 下沿、路上观看点 → 镜头」；不通就交给跟拍镜头（板子不框，她路过时在跟拍镜头里看）。跟拍镜头问着一行时把看点慢慢抬高，直到那一行的中间露出题条下沿（她还在屏上为限）——terraces 上一段台阶顶上的一行原来整个藏在题条后面。
9. **「卡住」按沿路的进度判**：halyard 一圈的末尾（起跑台前 4 m）她在台阶边滑来滑去，按位置从来不算卡住，审计里在那里停了 10 分钟；现在 0.6 s 沿路前进不到 0.8 m 就算卡住（每秒跳一下、2 s 超级跳到前方 6 m 的路上、终点前 3 m 算到线）。浏览器里那一圈没有 'jump' 边（道具的栏杆碰撞盒让起跑台那条边不成立），所以 nav 的 'climb' 边也当跳边（行不放在它的助跑上、她贴路线走、到跟前跳）。
10. **看板段等它前面的滑行段打完再立**：滑行段一直要到最后一题答完，常常比计划的 34 m 长；不等的话她边打字边游过了展板（横屏 w2d3 就这样，板子在打字机位后面被「框住」、记成看过）。

**改了什么**（`src/learn/play/runner/` 是跑酷自己的目录）：
- `runner.js`：`_judgeRecord`（上面第 2、3 条）；`_settle` 走它；看板段（`_place` 里 `withBoards`、`_build` 立板、`_appear` / `_cross` / `_reap` / `_unbuild`、`_tide` 的 boards 一支、`_prepBoards` 提前一站画板、镜头 pose = 打字机位 / 框住的板）；车道相关的地方（换道、读题区、路面宽、取景）改看 `row.centers`，不再假设「不是滑行段就是车道行」；看板段等它前面的滑行段打完再立；`_unstick` 按沿路的进度判、终点前 3 m 卡住 / 停 2 s 算到线；`_bounds` 读题区里路比道带窄时路说了算；`stripBottom()`（题条底边，0.4 s 读一次 DOM）；写字墙的句子算进 `total / scoredN`；`debug()` 多 `boards`、`cam`、`loopEdges`。
- `track.js`：nav 'climb' 边也进 `T.jumps`（Node 的七张舞台一圈里都没有 climb 边，测试的数不变）。
- `glide.js`：射 → `_judgeRecord`；扣住 → `_decide(claim)` → `_resolve`；墨雨 / 回声；打字机位按真实带子；墨字机位在世界里定一次（play-type 的 'word' 构图，打字蟹位在离字 6.5 m 处，她游进画面，到字跟前交回跟拍）；题条判词留到墨字演完（2.6 s / verdictMs + 1.8 s）；进出滑行段给题条加 / 去 `is-typing`。
- `boards.js`：`withBoards`、`boardAt`（纯）、`RunnerBoards.update(dt, s, aspect)` 按路程框板、`unplace`、自己的 pointer 监听。
- `cam.js`：站位姿换对象（或同一个一帧跳 > 0.6 m）时 0.8 s 缓过去（打字 → 墨字、一块板 → 下一块，原来是硬切）；被道具挡住时升起（上面第 6 条），`occl` 计数；问着一行时抬看点（`tilt`，上面第 8 条）；她的位置不再被镜杆支点的临时向量覆盖。
- `rows.js planCourse`：boards 段占 `len` 米，检查点从板子开始。
- `tips.js`（跑酷自己的 CSS）：横屏手机上滑行段的题条贴顶、一行、藏 ▶（键盘行首有 ▶ 和提示）——横屏的带子只有屏高的 25 %，按真实题条算打字机只有约 63 px 高，贴顶后约 140 px。
- 审计：`tools/learn/runner-drive.js` 接上滑行段（手机上逐键给游戏键盘发 pointerdown、桌面发 keydown；计划 right / hint / wrong / near；镜头稳了以后把 `RIG_POINTS` 投到屏上量「打字机在题条和键盘之间、她的头低于中间那排键」；扣住时证据不能变、点题条按钮；记叶子）、看板段（框住的板 fits、点一行热区要真的念出来）、每行离跳边多远（§20 只在 Node 里验过的修正之一）；穿空隙写了证据、首答记两次、准星露出来都算错。`tools/learn/runner-audit.mjs`：默认 `?learn=w1d3&kind=race&short=1&gate=6`；`--glidePlan`、`--wallMs`；关掉键盘滑入的过渡；`forms` / `perf` 里的道具赛加 `&play=0`（开关下 `kind=race` 已经是跑酷）。

**动了别人地盘的**（都只加不改）：
- `src/ui/play-strip.js`：`verdict({ actions })`——照 play-5 逐字抄（CSS 六行、`_acts`、`show / question / hide` 里清掉；`verdict` 里一行）。play-5 合并时这一段两边一样，`hide()` 那一行两边各多一个调用，合成 `this._vT = 0; this._acts(null);`。
- `src/config.js`：`LEARN.runner.boards = { lead 7, gap 8, tail 3, side 2.6, tide 0.25, past 0.5 }`。
- `docs/PLAY.md`：三处「play-4 更正」（§4 表单词卡 / 写句、§5.2）。
- `flow.js`、`touch.js`、`host.js`、`play/cam.js`、`race.js`、`walk.js`、`main.js`：**一行没动**。

**测试**（`npm run test:learn` 182 → 189，`npm run check` 271 个文件）：
- `runner-glide`（3 → 5 条）：单词提示后 `[1, H]`、墨雨同样；听写提示后照旧 `L` 带百分数；第二次错走回炉 + 走远路（再打的那一段带 `tries: 1`）；扣住时证据为空、没有 `learn:answer`、墨字没收到判定，点「我的写法也对」→ `[1, S]`、点「继续」→ `[0, W]` 并排回去；w1d3 每道选择题对 / 错两道、单词、听写：跑酷这条路和 `race.js _answer` 写出的证据逐字一样、`learn:answer` 一次。
- `runner-boards`（新，5 条）：三周 25 站 120 块板，内容和解谜的 `gateSpecs` 一样、每站 ≤ 6；队列里每站一段、在它第一行之前；`planCourse` 不重叠、检查点从板子开始；板在路外 ≥ 2.6 m、朝她来的方向；按路程挑板、过了最后一块不框；每块约 2.7 s；`boards.js` 不判不写；镜头被挡时升起（每帧位移 < 0.12 m）、线通后放下、站位姿下不升。

**实测**（`tools/learn/runner-audit.mjs --scenario runner`，一次一个浏览器 `flock -w 9000 /tmp/ielts-browser.lock nice -n 10`；Chromium + SwiftShader、`quality=low`、冻时钟 1/30 s 步进；手机视口用触屏 PointerEvent——车道滑动进 `touch.js` 的滑动钩子、打字逐键点游戏键盘、题条按钮 `click()`、展板热区经 `RunnerBoards` 自己的监听；`?learn=…&kind=race&short=1&gate=N`——开关下 `kind=race` 就是跑酷；2026-10-16 / 17 UTC。每行 / 每题 / 每段核：没有显示出来的 `.iw-learn__panel`、`match.paused === false`、`learn.hold` 为假、准星藏着；打字机位把 `RIG_POINTS` 投到屏上量；穿空隙证据叶子数不变；首答只记一次；最后有结果卡。表里是最后一次跑的结果，前几次跑出来的问题见「先定的」8–10 和 DEVLOG）：

| 关卡（短关） | 视口 | 走了什么 | 证据 / 结果 |
|---|---|---|---|
| `w1d3 gate=6`（halyard：听辨对子 + 单词卡，写字墙 2 句） | 390 × 844 | 拍子行 ×4（错 / 对 / 空隙 / 对，两次踩准）；滑行段：单词对、单词提示后对、写句错、写句差一点（扣住 → 我的写法也对）、写句再写对 | `[0,L]` `[1,L]`、空隙叶子不变；`family [1,T]`、`parents [1,H]`、写句 `[0,W]`、`my mother is` 扣住时叶子数不变 → `[1,S]`；结果卡「6 / 6 题做对 · 4 / 6 首答」、第 1 名 |
| 同上 | 844 × 390 | 拍子行 ×4 + 单词错 → 「选义」车道行又错 → 回炉 + 走远路（支路，汇回）；写句 ×2、提示；回炉滑行段 | `[0,T]`、选义行不再写首答、走远路一次（找到支路）；结果卡 |
| `w2d3 gate=1`（terraces：复习听写 + 发音小测，写字墙 2 句） | 390 × 844 | 滑行段听写 ×2（对 / 差一个词）；看板段 1 块讲解板；车道行 ×4（错 / 对 / 空隙 / 对）；写句错 → 「为什么」先给再写对 | `[100,L]`、`[80,L]`；讲解板的框板位姿被屋顶挡（`noFrame`），跟拍镜头里路过；结果卡「6 / 6 · 4 / 6 首答」 |
| 同上 | 844 × 390 | 同上 | 同上；墨字机位 5 个里 2 个被挡 → 跟拍镜头 |
| `w1d3 gate=1`（halyard：音标展板 + 单词展板，写字墙 2 句） | 390 × 844 | 看板段 ×2（音标板、单词板，各框住、记看过，点一行热区真的念了）；拍子行 ×4；单词选义车道行 ×5（错 / 对 / 空隙 / 再问）；写句对、差一点 → 扣住 → 我的写法也对 | 写句 `[1,W]`、`[1,S]`；结果卡「5 / 6 · 4 / 6 首答」、第 1 名；起跑台前两次 `unstick`（沿路不前进 → 救出来）——前一版在那里停了 10 分钟 |
| 同上 | 844 × 390 | 同上，12 行（4 次空隙、一次第二次错 → 走远路，汇回） | 结果卡；见「拿不准的」11（起跑台前的行） |

- 打字机位（每题量，镜头弹簧稳了以后）：竖屏打字机的点在题条底边（216–263 px）和键盘顶（548 px）之间，占 264–512 px；横屏贴顶的题条底边 41 px、键盘顶 238 px，打字机 67–225 px（约 160 px 高；按原来题条位置算只有约 63 px）；她的头一律低于键盘中间那排（横屏：最远那排）。准星每题核过，从没露出来。
- 第一行到来前的镜头交接逐帧（1/60 s）：最大位移竖屏 0.42–0.83 m（那时她 12–14 m/s，一帧本来就走 0.2 m），没有切。
- 被道具挡住：halyard 竖屏 3 118 帧里 230 帧她或那一行被挡（7 %），升起后仍被挡 6 帧；terraces 248 / 3 390，升起后 7 帧。
- **§20 写明只在 Node 里过了的修正，浏览器复测**（brief 第 4 项）：① `RowView.prepare`「建行以后一帧画一张标签、淡入前画完」——每一行的截图里幕上的字都在（`row*-*.png`），帧时间的最大值见下；② 跳上台阶的边前后不放行——审计每行记离最近跳边多远：terraces 的行都离它那一条跳边 ≥ 39 m；halyard 在浏览器里一圈根本没有跳边（只有 walk / drop，见「已知的坑」2），所以这条规则在那里不起作用，起跑台前的卡住是靠 `_unstick` / `_bounds` 修的；③ 滑行段超长时重排——每一局的滑行段都比计划的 34 m 长（打两题要 40–70 m），`_glideDone` 每次都把压到她身后的行收回重排，所有局都跑到了结果卡；④ 吊臂被墙压短时往下看——**没有专门复测**（没找到稳定压短吊臂的地方，截图里看不出），留着；⑤ 采样时游进对的幕——帧时间采样里游进了对的那道（`answered: right`），见下。
- **帧时间**（`--scenario perf`，390 × 844 竖屏触屏，`quality=low`，halyard，`w1d3`，真时间循环、不步进，各采 40 s 墙钟；跑酷先跑过开头的看板段、到第一行车道、游进对的那道幕时采——幕炸开、`paint.flood`、加速、下一行在建都在采样里；滑行段和看板段本身不在采样里。道具赛是 `&play=0` 的卡片版走向第一道门；涂地 4v4 是同一舞台。SwiftShader 上的数只能互相比，和 §20 那张表比相对值）：

  | | rAF p50 / p95（ms） | `_frame` p50 / p95 / 最大（ms） | 绘制调用 |
  |---|---|---|---|
  | 跑酷（她 + 3，play-4） | 1 067 / 1 267 | 8.3 / 13.4 / 1 100 | 67 |
  | 道具赛（卡片版，`&play=0`） | 1 050 / 3 216 | 14.7 / 3 059 / 3 143 | 158 |
  | 涂地 4v4（8 人） | 1 100 / 2 550 | 13.4 / 19.3 / 1 457 | 103 |
  | §20 的跑酷（play-runner） | 1 283 / 1 650 | 10.6 / 18.8 / 2 437 | 71 |

  跑酷没有比 §20 差（每一项都更小；这台机器晚上一直有另一个子代理在跑浏览器，绝对值只作参考）；最大值 1.1 s 是采样开头那一帧（`RowView.prepare` 一帧一张标签之后，§20 那次是 2.4 s）。镜头每帧多的是两条视线（被挡升起）和打字时的两条（打字机位核查）。
- 关掉开关 `&play=0`：现成的 `play-forms.json`（桌面）和 `play-forms-phone.json`（竖屏）照过——卡片版道具赛，`w1d2` 十字市场，4 / 4、第一题错换问法再对、第 1 名、结果卡、证据进 `ev-2026-10-12`，无错误。

**拿不准的（自己定了，请主会话过目）**：
1. **跑酷有自己的 `_judgeRecord`**（不是 `LearnFlow` 那一条）：判和记的几行和 `race.js _answer` 一样，扣住的约定和 play-5 的 `boss.js _judgeRecord` 一样（`held / decided / claim / self`）。要是想全仓库只有一个 `_judgeRecord`，得让 `LearnFlow._judgeRecord` 能「不加锁、不排门队列」——那要动 `flow.js` 好几行，这一期没动。
2. **扣住不超时**：写句差一点、能自认时，墨字一直灰着、滑行段一直往前延伸（墨潮 0.3 倍），直到她点「我的写法也对」或「继续」。PLAY §1 第 6 条说没有「时间到」，所以没加。
3. **看板段每块板约 2.7 s**（墨潮 0.25 倍、板距 8 m）：一块 5 个词的单词展板读不完，可她停不下来（PLAY §1.1）；板上的词后面都会一行一行地考。嫌短就调 `LEARN.runner.boards.tide / gap`。框板时镜头离开路面；`noFrame` 的板（框板位姿被屋顶 / 墙挡）只在跟拍镜头里路过。
4. **横屏滑行段的题条盖住了圈时钟**（贴到顶边）：换来打字机两倍的高度（约 63 → 140 px）。
5. **墨字机位**：落点在她前方 速度 × 4.6 s + 2 m（约 18 m）、机位按「字长好时她在哪」定在世界里；看不见（屋顶 / 墙）就用跟拍镜头（terraces 上 5 个里有 2 个是这样）。路弯的时候她不在构图的正中，在一侧游进去。
6. **到线的判定放宽**：终点前 3 m 内卡住 0.6 s、或在这 3 m 里待了 2 s，就算到线（halyard 的起跑台台阶边上，她停在离线 0.04 m 处，结果卡永远不出来）。
7. **写字墙的句子算进结果卡的总数和首答**（`scoredN` / `total`）：卡片版道具赛从来不问写字墙，跑酷问了、记了 `W / S`，不算进去会出现「6 / 4 题做对」。星星因此可能比卡片版难一点。
8. **镜头升起 / 抬看点**：被道具挡时升起 ≤ 2.2 m；问着一行时看点最多抬 4 m、以她还在屏上为限——极端的台阶（高 5 m 以上）还是可能让幕挨着题条。
9. **单词卡的「我的写法也对」**：PLAY §4 表写了 `S`，可 `canClaim` 只收写句，卡片和各玩法都没有这个入口——照现状只有 `T / H`，PLAY 里标了更正。
10. **换个问法时不给「我的写法也对」**：写句答错后「为什么先给、再写一次」那一题标 `_alt = 'again'`，`canClaim` 就不扣住——卡片版第二次问的是选择题，本来也没有；第二次答本来也不写首答。
11. **halyard 起跑台前的行**：浏览器里那一圈没有跳边，行照样放在起跑台的坡道后面；读题区在窄坡道上时外道够不着（路说了算），横屏复跑里一次「游进对的道」成了穿空隙（没答，马上再来一次，不写证据），截图 `l-w1d3g1/runner-844x390-row2-beat.png`（幕在台子上、她在坡道下）。更好的办法是 `rowFit` 也看读题区里的高差（像跳边一样不放行），这一期没做——Node 的七张舞台测试会变，得在浏览器里再核。另外这一次复跑用的还是 `c00d8e7` 之前的代码：救她的「跳一下」把 latT 设 0，换了她的道（后来修了：问着一行时只跳不换道；超级跳越过一行的线先算没答），修后没再进浏览器。

**没做的**：
1. **整天的关卡**没在浏览器里从头跑到尾（一天 50–68 行 + 30–166 个打字题）：审计都是 `short=1` 两站各两题 + 写字墙两句；整天只在 Node 里规划过（`planCourse`）。
2. **桌面 1280 × 720**：这一期只跑了竖 390 × 844、横 844 × 390（§10 要的两个方向）；桌面用实体键盘打字的路审计里有（发 keydown），没跑。
3. **真机**：手感、帧时间、横竖切换；SwiftShader 的帧时间只能互相比。
4. **terraces 横屏第一行**：一段台阶顶上的那一行，横屏里幕还是挨着题条（竖屏抬看点后露出来了）——她在台阶下面时镜头抬不起来（她会出屏）。截图见交接。
5. **看板段读的时间**：一块板约 2.7 s，没按板上字数调；单词展板的「跟读」在跑酷里来不及跟完。
6. **机器人用道具**、**墨雨 / 回声以外的道具在滑行段上的意思**（超级跳照旧跳一段路、不跳题）。
7. **吊臂被墙压短时往下看**（§20 的修正之一）没有专门在浏览器里复测。

**交接**（分支 `play-4`，没推；dev `3eefc21` 已合进来）：
- **做到哪**：开关下道具赛就是墨浪跑酷，三种行（选择行、拍子行、滑行段）和看板段都在路上、都计分（看板段不计）；判分只有 `RunnerFlow._judgeRecord`；竖横两个方向 `w1d3`、`w2d3` 的短关跑到结果卡（上表），`&play=0` 照旧卡片版。
- **给主会话 / play-5 合并时**：
  - `src/ui/play-strip.js` 的 `actions` 和 play-5 逐字一样（CSS 六行、`_acts`、`show / question / verdict` 各一行）；`hide()` 两边各在末尾多一个调用——play-5 是 `this._acts(null)`，这边是 `this._vT = 0; this._acts(null)`，合成后者。
  - `_judgeRecord` 的扣住约定和 play-5 的 `boss.js` 一样（`{ held: true }` → `o.decided / o.claim` → `self`）；跑酷这一份在 `runner.js`，`flow.js` 没动。要统一成一个，见「拿不准的」第 1 条。
  - `config.js` 只加了 `LEARN.runner.boards / glideShow / glideReach`；play-5 加的是 `LEARN.arena`，不重叠。
  - `src/learn/play/run.js`（play-5 的 `opts.Targets`）这边没碰。
- **先看哪些文件**：`src/learn/play/runner/runner.js`（`_judgeRecord`、`_settle`、`_build` 里看板段和「等滑行段打完」、`_unstick`、`_bounds`、`stripBottom()`）→ `glide.js`（`_submit → _decide → _resolve`、`_framed` 的两个机位和视线核查）→ `boards.js`（`withBoards / boardAt / RunnerBoards.update / _clear`）→ `cam.js`（站位姿缓过去、被挡升起、抬看点）；审计 `tools/learn/runner-drive.js`（`onGlide` / `onBoards` / `frameCheck`）；测试 `tests/learn/runner-glide.test.mjs`、`runner-boards.test.mjs`。
- **已知的坑**：
  1. 站位姿（打字机位、墨字机位、框板）是纯函数在打字蟹 / 板子的坐标里算的，周围有什么只靠 `physics.los` 几条线核；装饰性的（不在物理里的）道具躲不开，路弯的地方墨字机位里她在一侧。截图要看。
  2. 浏览器里一圈的导航边和 Node 里不一样（道具的碰撞盒）：halyard 在 Node 里起跑台是一条 'jump' 边，浏览器里只有 walk / drop；跳边、终点的 `lineBack` 都按浏览器的算。审计的 boot 里有 `loopEdges / jumps`。
  3. 墨字落点按她的速度 × 4.6 s 算（约 18 m）：她加速（答对的加速、道具）时会落得更远，最远 24 m。
  4. 审计里的「踩准」是碰运气的（冻时钟下音频时钟照真时间走，§20 的坑）。halyard 的短关跑一次约 1.5 分钟、terraces 约 1.7 分钟（软件 GL、不画、要截图时画一帧）。
  5. 题条的底边每 0.4 s 才从 DOM 读一次（`stripBottom()`）；同一个站位姿一帧跳 > 0.6 m 时 cam.js 会缓 0.8 s。

## 24. play-5 交付（2026-10-16，分支 `play-5`：对抗赛 + 今日小考 → 区域里的靶场；Boss 周考 → 弱点 M5——PLAY §5.3、§5.4、§3 M5）

**先读了什么**：PLAY §1（12 条逐条核）、§3 M1 / M4 / M5 / M7、§4 表的「对抗赛」「Boss」两列、§5.3、§5.4、§6、§10；本文 §18（题物 / 题条 / `_judgeRecord`）、§19（字弹的接口）、§21（回声亭）、§22（play-wire 的「接口」「交接」）；上一个子代理的 WIP 提交 `3b80c08` 的说明和它的全部代码（`src/learn/play/arena/*`、`forms/duel.js`、`forms/boss.js` 的改动、`play-strip.js` 的 `actions`、`tests/learn/play-arena.test.mjs`、`tools/learn/arena-audit.mjs`）；dev 的 `flow.js`（`_judgeRecord(g, item, p, ans, o)`）、`play/host.js`、`play/cam.js`、`wire/type.js`、`wire/exit.js`、`type/frame.js`、`type/rig.js`（托架、纸）、`core/touch.js`（`_down` 的跳过）、`game/cameraRig.js`（FOV、path 模式）、`game/weapons.js`（墨弹先过 `G.playTargets` 再过 Boss 的命中球）、`game/specials.js`（`giveShield`）、`boss/bossModel.js` / `bossModelGeo.js`（插口）；主会话看过 play-wire 截图后指出的两处（打字机位、打字时的准星）。

**先定的**：
1. **合并**：`git merge claude/upbeat-newton-virpn1`（`3eefc21`）没有冲突——`play/cam.js` 两边逐字节一样（WIP 就是抄的 play-wire），`config.js` 自动合并；合并后 183 / 183。
2. **`_judgeRecord`**：对抗赛 / Boss 各自**覆盖**这个方法（名字和签名 `(g, item, p, ans, o)` 和 dev 的同一个，`o.hinted → H`、`o.self → S` 同义），卡片路（开关关掉）和墨靶、字弹、回声亭都只调它；不再有别的判分 / 写首答的地方（测试扫源码：两个形式里 `recordFirst(` 各一次，在 `_judgeRecord` 里）。没有改成调 `super._judgeRecord`：dev 的那条自己再判一次 `judge(item, ans)`，「我的写法也对」要的是 `judge(…, { claimed: true })` 的结果（不然 `S` 记成错），Boss 的「扣住」也要在写之前返回——这两样都得改 flow.js 不止一行。判分映射（翻牌 / 换问法 / 重排）在 `forms/common.js judgeAnswer` 和 flow.js 里各写了一遍，这是 B / E 时就有的，测试核两边写出同一片叶子；主会话合并时可以把 flow.js 那五行换成 `judgeAnswer(item, p, ans)`（一行）。
3. **对抗赛的题簇**：按屏幕排（`layoutTargets`），放在朝区域中心、离镜头 `boom + 3…8.5 m` 的平面上，躲地面、躲挡视线的东西（play-1 的三条视线），然后钉在锚点上随相机转。她离区域中心超过 `askNear` 14 m 时一题最多等 `askWait` 6 s（WIP 里有这两个键没接）。
4. **Boss 的弱点**：她离 Boss 的眼睛 ≤ `bossNear` 10.5 m（水平；墨弹射程 12.5 m，球挂在 4.5 m 高处，11 m 时审计里的墨弹落短了）时挂在插口上；远就最多等 `bossWait` 8 s，再远就浮成题簇（第一次审计里出题时她在 47.7 m 外）。
5. **字弹的机位**（主会话的①）：不用 frame.js 的 `frameFor` 打字机位（它假设题条只占顶上 10 %、横屏放宽成「头低于最远那排」、没算纸跟着托架的行程），改用纯函数 `arenaTypeFrame`：题条真实底边到键盘真实顶边的带，纸在整段行程里的四角、键盘板、打击点、打到第 10 个字的行都在带里，头低于**中间那排**；宽屏再试题条左右两侧的角落，打字机哪里大放哪里；偏离屏幕中间靠**平移**相机（转相机会把纵深卷进高度，她的头就高过键盘）。位姿在她的身体坐标里算一次、每帧按她现在的位置换到世界（对抗赛里题来时她可能还在滑）。
6. **打字时藏准星**（主会话的②）：`G.hud.xh.style.visibility = 'hidden'`，站清掉时还原（hud.js 每次换武器重写 class，不碰 inline style）。
7. **备战板**照旧停住比赛（轮与轮之间、M6 课文），见拿不准的。

**改了什么**（WIP `3b80c08` 之上；WIP 本身的清单见它的提交说明）：
- `src/learn/play/arena/host.js`：对抗赛没有回声亭，`S === this.echo` 成了 `null === null`，每帧读 `null.tapApi`——游戏一帧都走不了（第一次进浏览器就停在这）。
- `src/learn/play/arena/m1.js`：`arenaTypeFrame({ W, H, top, bottom, strip, avoid })`（纯，按屏幕缓存）、`searchRegion`、`TYPE_PTS`（含纸在托架整段行程里的四角，±1.37 m）。
- `src/learn/play/arena/type.js`：打字机位换成 `arenaTypeFrame`（先出题条、再取景；提示多一行后重取景；位姿每帧按她现在的位置换到世界）；'word' 机位传题条连判定（`VERDICT_H`）的高度；打字时藏准星；泡泡盾在原地续（原来每帧 `giveShield`，每帧放一遍 `shield_up`）。
- `src/learn/play/arena/run.js`：`_placeZone` 加回 play-1 的三条视线（横屏里标签落在矮墙后面），拉到最近还挡就题带上收、再抬高（小考横屏的石栏杆）；标签图集等 Rubik 加载完再画；点射的墨弹只认它的目标（构造时给自己的 `ShotTargets` 包一层 `shotHit`：别的选项球不吃它）；Boss：`bossNear()`、近 → 挂插口（`C.cluster 'boss'`）/ 远 → 题簇（`'zone'`）；`spreadBalls`（挤在一起的球侧推到不叠）；壳顶横幅不比屏宽；取景俯仰到 0.9 rad；`_track` 跟着球；她被打倒、复活后重新放；`_fire` 记下点射墨弹、`passes(prev)`。
- `src/learn/play/arena/targets.js`：`onTop(on)`——Boss 上的球 / 横幅 / 标签关深度测试、排在不透明物之后（光环照旧）。
- `src/learn/play/arena/alt.js`：单词卡回炉的干扰项只收单词（音标题的 `/j/` 混进来过）。
- `src/learn/play/arena/host.js`：回声亭上不出题条。
- `src/learn/forms/duel.js`：一题最多等 `askWait` 让她走近区域（`_farFromZone`）。`src/learn/forms/boss.js`：一题最多等 `bossWait` 让她走近（`_farFromBoss`，说一次「走近 Boss——答案挂在它的弱点上」）；只在她活着时出题；出题那一帧就顶住大脑（`_holdBoss`：`match.update` 里学习层在 `bossMode` 之前，不顶住它同一帧就开招）；`_wrapDamage` 旁包 `Boss.segHit`（点射的那颗墨弹不被它自己的命中球挡）。
- `src/config.js`：`LEARN.arena.bossNear`（10.5 m）`/ bossWait`（8 s）（加法）；`bossPx` 30 → 44（横屏标签太小）。
- `tools/learn/arena-audit.mjs`：`--gate`、`--far`；每个方向一个 `try`；字靶按真实相机投影真实的键帽、纸和她的头；准星；Boss 出题前把她放到它前面 8 m；平射在 Boss 上只记一行；点之前重读投影；「在命中那一帧判」取最后一条日志。
- `tests/learn/play-arena.test.mjs`：多一条——`arenaTypeFrame` 在 390 × 844 / 844 × 390（两种题条）/ 1280 × 720 / 375 × 667 / 667 × 375 上：头低于中间那排、`TYPE_PTS` 全在取景区里、取景区在题条下面或旁边、躲开 HUD 顶排；844 × 390 选左上角。
- `docs/PLAY.md`：§3 M4 机位、§3 M5、§5.3 各一段「play-5 更正」。

**动了别人地盘的**：`flow.js`、`touch.js`、`host.js`、`play/cam.js`、`weapons.js`、`main.js`、`actor.js`、`cameraRig.js` **一行没动**。共用文件只做了加法：`src/ui/play-strip.js`（WIP：`verdict` 多一个 `actions`，`this.acts`）、`src/learn/play/run.js`（WIP：构造函数多一个 `opts.Targets`）、`src/config.js`（`LEARN.arena`）。`Boss.segHit` / `Boss.applyDamage` 是在 BossFlow 里给这一局的实例包了一层（E 就这么包 `applyDamage`），boss 的文件没改。

**测试**：`npm run test:learn` 177（dev）→ 185（`play-arena` 8 条：三周每个对抗赛日 / 小考 / Boss 计划的条目都有玩法、只有翻牌落卡片；对抗赛的 `_judgeRecord` 和解谜的写同一片叶子、首答一次、墨雨提示 → `H`、锁 / 换问法 / 回炉照卡片；Boss 的写句：对 → `W`、差一点扣住不写、自认对 → `S`、继续 → `W` + 出招；回炉；题簇的局部坐标 ↔ 世界、插口、球的半径；**字弹取景**在六种屏上；Boss 挤在一起的球侧推到不叠、高度不变；源码扫描：arena 不暂停、不扣住、不自己判分，两个形式的 `recordFirst(` 各一次）；`npm run check` 277 个文件绿。收尾时再合 dev `7fae9fe`（含 play-4）：197 / 197（dev 189 + 8），278 个文件。

**实测**（`tools/learn/arena-audit.mjs`：静态服务 `/game/`、SwiftShader、`?quality=low&short=1`、冻时钟步进，竖 390 × 844（`&from=app`）和横 844 × 390 同一个浏览器；每题核：没有显示出来的 `.iw-learn__panel`、`match.paused === false`、`learn.hold` 为假、她的控制器活着、触屏层活着、题条在、Boss 在两招之间；M1 / M5：题物投影都在安全区（题条下面、两边 16 px；Boss 全宽）、**她自己的一发平射**打到题物上只溅灰、不答题，然后点正确的那个 → 墨弹 → 命中那一帧判 → 答对、`learn:answer` 一次且 `first: true`、对抗赛区域涂墨（`learn:ink`）/ Boss 掉血（`learn:bossHp`）；M4：键盘每个键在屏内、真实相机投影真实的键帽 / 纸 / 她的头——头低于中间那排、整台打字机和纸在题条和键盘之间（或宽屏题条旁边的角落）、准星藏了、对抗赛她身上有盾、在游戏键盘上一个个点出答案 → 射 → 判 → 墨字成形；S：亭子升起、站上去放范例、走出来 = 说完了、Boss 掉血、不记证据。Boss 题前审计把她放到 Boss 正前方 9 m 的可走节点上（玩家会自己走过去；`--far` 不放））：

| 关卡（`&short=1`） | 竖 390 × 844 | 横 844 × 390 |
|---|---|---|
| 对抗赛 `w1d6` 门 1–2（音标 4 选 → M1 墨球） | r2 两题全过（宿主修好后第一次能走；审计自己一条红：取了上一题的答题日志）；r6 一题全过 | r2 两题全过，但截图里标签在矮墙后（`_placeZone` 没有视线检查）→ 加上；r6 一题全过，四块标签都在墙前 |
| 对抗赛 `w1d6` 门 4–5（听写句 M4） | r2 两题判分 / 盾 / 打字全过，取景红（纸压在题条下，见先定的 5）；r3 一题全过：整台打字机和纸在题条（242）和键盘（548）之间、头低于中间那排、准星藏了、盾 4 s | r2 同；r3 一题判分全过，打字机在题条左边的角落（x 116–236、y 65–164；当时的审计只认「题条下面」，记了一条红，审计后来改成认角落） |
| 对抗赛 `w1d6` 门 5–6（阅读题 M1 横幅） | r6 一题全过 | r6 一题全过 |
| 今日小考 `w1d1`（音标、单词选义 M1） | r6 两题全过 | r6 两题全过；截图里四块标签在观景台的石栏杆后面 → 挡住时题带从下往上收、再抬高（`f0f923b`）；r7 复跑一题全过，四块标签都在栏杆前 |
| Boss `w1` L / R / W | r4：出题时她在 47.7 m 外、球看不见也打不到 → 等她走近 / 远就题簇 / 镜头跟球 / 墨弹穿过 Boss；r5：L 两题 M5、R 单词卡 M4 全过，R 横幅题时她被 Boss 打倒；r6：**L 两题 M5、R 单词卡 M4、R 横幅（她倒下两次、复活后重放后答对）、W 两句 M4 全过，HP 1 → 0.83 → 0.66 → 0.495 → 0.33 → 0.215 → 0.1**；红：两次「出题时 Boss 在出招」（→ `_holdBoss`）、横幅比屏宽 4 px（→ 封宽）、她被打倒时的几条 | r5：L 第一题全过，第二题出在她被打倒时（→ 只在她活着时出题）；r6：L 第一题全过；第二题两只眼睛上的球从她枪口看一前一后，点后面那个墨弹撞上前面那个（→ 墨弹只认目标），之后跑到批次的时限 |
| Boss `w1` L（改完以后：出题那一帧顶住大脑、墨弹只认目标、`bossNear` 10.5 m、球 44 px） | r7 三题：L 第一题 M5 全过（HP 1 → 0.83）；第二题（两只眼睛）第一发点射发出后没有命中记录、题还在，审计的下一轮再点就中了（HP 0.83 → 0.66）——见拿不准的 11；截图里眼睛上的两个球看不见、爪子盖住另外两个（Boss 的眼睛 / 爪子是透明物，在不透明的球之后画）→ 球进透明那一趟（r9） | — |
| Boss `w1` L（**最后的代码**：球进透明那一趟、合过 dev `7fae9fe`） | r9 两题 M5 全过（HP 1 → 0.83 → 0.66，两只眼睛那题第一发就中）；四个球都画在 Boss 身上看得见；一条红：Boss 侧身时最左下的 `bed` 牌出屏 10 px | r9 两题 M5 全过（HP 1 → 0.83 → 0.66），四个球都在它头上、标签读得出 |
| 对抗赛 `w1d6` 门 1（合过 dev `7fae9fe` 后的复查） | r9 一题全过 | — |
| Boss S（回声亭，`--skip-to S`：审计的手把 L / R / W 清掉） | r7：亭子升起、站上去放范例、走出来 = 说完了、Boss 掉血（0.1 → 0.05）、不记证据，全过；但她被 Boss 打倒在亭子前（审计把她送到了 Boss 跟前）、截图是倒下的画面；**r8 一张卡全过**（她留在原地，亭子板整块在屏上） | r7 两张卡全过（同上一条红）；截图里题条压住了亭子板的头两行 → 亭子上不出题条（和解谜出口的亭子一样）；**r8 一张卡全过**；板的第一行还被 Boss 的 HP 条 / 阶段牌压着（见已知坑 1） |
| 开关关掉 `&play=0`（`play-audit.mjs --script play-forms.json`） | 对抗赛 `w1d6`、Boss `w1` 卡片全过（第一题故意错、其余对；卡片停住比赛照旧；4xx 0、控制台错误 0） | — |

截图在主会话的草稿目录 `play5-shots/` 下按轮次分（`r2`–`r7`；早几轮的截图正是上面那些毛病的样子）。

**PLAY §1 的 12 条**（逐条核，开关开着）：1 不暂停 / 不定身 / 不弹面板——出题和答题时 ✓（审计每题核 `paused`、`hold`、`.iw-learn__panel`），备战板例外见拿不准的 1；2 判分一条路 ✓（两个形式各一个 `_judgeRecord`、`recordFirst(` 各一次，源码测试）；3 证据如实 ✓（叶子测试：`L / T / H / W / S`，扣住时不写；打字提交前不给对错——打字蟹、键盘、墨字是 play-type 的，没改）；4 节奏——arena 里没有节拍玩法（音标 / 听辨在对抗赛 / Boss 是 M1，PLAY §4 表）；5 没有误答 ✓（她自己的平射打到题物只溅灰，审计每题核；带标记的墨弹只认它的目标）；6 不惩罚 ✓（错是 play-1 的珊瑚色 + 锁 + 「差一点」，Boss 的「答错出一招」是 LEVELS §2.5 原有的、不掉她的血）；7 每句英文配中文 ✓（题条、标签牌照 `engine.prompt`）；8 不加素材 ✓（没有素材文件：题物全是程序生成的几何 + 现成材质）；9 画风流畅 ✓（镜头只经 `PlayCam` 弹簧和 rig 的 `dampAngle`；Boss 上的题物关深度测试是唯一的渲染状态改动；帧时间没量，见没做的）；10 竖横 ✓（实测表）；11 内容不少 ✓（`design.test` 没动、照过；arena 测试核三周对抗赛日 / 小考 / Boss 计划的每个条目都有玩法）；12 开关可退 ✓（`&play=0` 两个审计）。

**拿不准的（自己定了，请主会话过目）**：
1. **备战板停住比赛**：轮与轮之间（还有小考开始前）的备战板是 `FormsUi` 的板子、`match.paused = true`——PLAY §1 第 1 条说「学习局里任何时候」都不暂停；但它不在一轮里（区域不计时、机器人在摆姿势），§4 表把课文在对抗赛里写成「M6（备战时）」。留着；要改就是把备战板换成 M6 展板、比赛不停。
2. **题簇不一定在区域正上方**：她离区域中心 > 14 m 时等 6 s，再远就放在朝区域、她射得到的地方（≤ 镜头 + 8.5 m）。Boss 同理：> 10.5 m 等 8 s，再远就是题簇不是弱点。
3. **Boss 的球被推离插口**：四个插口挤在 1.3 m 宽、2.5 m 高里，球按「标签读得清」的大小（离 10 m 时 0.5–1.1 m）放上去会叠；球保持插口的高度、侧推到不叠。点中哪个球，掉血的火花在那个球上（插口是 `weakSockets` 给的）。
4. **Boss 的题物画在它身上**（深度测试关；arena 的球 / 横幅的材质一直走透明那一趟，不透明度 1）：它走到房子后面时题物也看得见；球被侧推以后，Boss 侧身时最外的那个牌子可能出屏几个像素（r9 竖屏 10 px）。
5. **点射的那颗墨弹穿过 Boss 自己的命中球**（`Boss.segHit` 在这一局包了一层，只放过带标记、这一题的那一颗）；她平时的墨照旧打在 Boss 上。审计里她的平射多半先打在壳上（只记一行）——「打 Boss 不算答」照样核过。
6. **字弹取景**：横屏的打字机在左上角、约 120 px 宽、纸上的字很小（PLAY §3 M4 说横屏「打出来的字只在纸上」——实际读不清）；取景框住纸的**整段行程**（±1.37 m），竖屏也因此比只框键盘小。可以改成相机跟着托架慢慢平移（框当前的纸），没做。
7. **泡泡盾在 Boss 的字弹上也给**（任务书只说对抗赛）：Boss 出题时不出招，但小蟹 / 地上的危险还在。
8. `arenaTypeFrame` 每种屏第一次算约 10–40 ms（Node），之后按屏幕缓存；真机可能翻倍，可以在 `warm()` 时先算一次。
9. 「我的写法也对」（扣住）只在 Node 里测过：审计打的都是标准答案，浏览器里没点过题条上的两个按钮。`.iw-ps__act` / 对抗赛题条的 ▶ 不在 `touch.js` 的跳过列表里：点击照常触发（触屏层在捕获阶段 `preventDefault`，不抢 click、不 `setPointerCapture`），但手指落在左 44 % 屏、`topGuard` 以下时摇杆也会冒出来一下——题条在顶上，多半碰不到。没改 touch.js。
10. Boss 的 S 段回声亭放在她面前 2.6 m 的可走节点上（舞台的码头面，不是 HULLBREAKER 背上——它背上没有可走的面）。
11. **Boss 弱点上偶尔第一发点射没有命中**（r7 竖屏两只眼睛那题；r9 两个方向都第一发就中：墨弹带标记发出、没有任何命中记录，1.4 s 后再点就中了）。查过的：Boss 自己的命中球（已放过）、别的选项球（已放过）、场景（`through` 本来就放过）；剩下的嫌疑是插口在待机动画里晃 + 侧推随镜头转、墨弹飞到时球已经挪开，或者 shooter 的弹道在 10 m / 4.5 m 高处落短。没查到底；她可以再点。
12. **Boss 在两题之间照常打她**：审计把她放到它跟前，好几次在出题前后被打倒（出题时不出招，但之前开的招、阶段 3 的危险还在）。问题还在时她倒下，复活后题物重新放（近 → 弱点、远 → 题簇）。

**没做的**：
1. 双人联机赛 / 合作赛（PLAY §9 第 6 期）、横屏进 App、删卡片。
2. 帧时间对比（PLAY §7）没量；真机没跑。
3. 横屏打字机跟着托架平移（见拿不准的 6）；`wire/type.js`（解谜的字弹，dev 的文件）同样的取景问题没改——`arenaTypeFrame` 可以直接换进去（它要题条和键盘的真实边）。
4. 备战板换成 M6 展板（见拿不准的 1）。
5. **Boss 横屏的 L / R / W 没在最后的代码上从头跑过**（横屏只有 L 段的球、r9 的复跑和 S 段；横屏 Boss 的字弹没有截图）：`NODE_PATH=… flock -w 9000 /tmp/ielts-browser.lock nice -n 10 node tools/learn/arena-audit.mjs --form boss --views landscape --n 6 --shots <dir> --budget 2400`。

**交接**（分支 `play-5`，没推；dev `3eefc21`、收尾时 `7fae9fe`（含 play-4）都已合进来——第二次合并 `play-strip.js` 取 dev 的整份（它已逐字带着 `actions`，`hide()` 是 `this._vT = 0; this._acts(null);`），LEARN 的 §23 在前、§24 在后）：
- **做到哪**：对抗赛 / 小考 / Boss 在开关下没有暂停、没有扣住、没有卡片（备战板除外，见拿不准的 1）；选择题是区域上空的题簇 / Boss 弱点上的球，打字是打字蟹（对抗赛带盾），Boss 的 S 段是回声亭。浏览器里竖横两个方向走过的见实测表。
- **先看哪些文件**：`src/learn/play/arena/host.js`（分站、镜头、站着、回声亭站）→ `arena/run.js`（`_place` 的三种放法：区域题簇 / Boss 弱点 / Boss 远时的题簇；`_orbit` / `_ride` / `_track`；`spreadBalls`；`passes`）→ `arena/type.js`（`ask` 的落点和盾、`_pose` 的两种机位、`_submit / _decide` 的扣住）→ `arena/m1.js`（`arenaKind`、`weakSockets`、`arenaTypeFrame`）→ `forms/duel.js` / `forms/boss.js` 的 `_judgeRecord`、`_ask`、`update` 里的等待；审计 `tools/learn/arena-audit.mjs`（`--form duel|quiz|boss`、`--gate`、`--far`、`--n`）。
- **接口**（play-4 要看的「扣住」）：`_judgeRecord(g, item, p, ans, o)` 在 Boss 里多认三个 `o`：`o.decided` + `o.claim`（她点了「我的写法也对」/「继续」之后再调一次；第一次调用对 `canClaim` 的句子返回 `{ held: true }`，什么都不写、不上锁、不出招）、`o.judged`（已经判好的结果）、`o.socket / o.hit`（命中的插口和点，火花放那儿）；对抗赛认 `o.judged`。字弹的扣住在 `arena/type.js _submit`：`out.held` → `strip.verdict({ ok: false, head: '差一点 — 意思到了', why, actions: [{ text: '我的写法也对', primary: true, onTap }, { text: '继续', onTap }] })`，墨字保持灰色，`_decide(claim)` 再调 `_judgeRecord(…, { decided: true, claim })`，然后 `_resolve` 演判定。
- **和 play-4 撞的（已解决）**：`src/ui/play-strip.js` 两边都改了 `this.verd` 一带、`verdict` 的签名、`hide()`——play-4 合进 dev 时已经逐字带上了这边的 `actions`，第二次合并取 dev 的整份即可（见上）。`src/config.js` 各加各的键，`src/learn/play/run.js` 这边只加了构造函数的 `opts.Targets`。
- **给主会话的**：flow.js 的判分映射五行可以换成 `judgeAnswer(item, p, ans)`（`forms/common.js`，同一套），这样全库只剩一份；解谜的字弹（`wire/type.js`）换用 `arenaTypeFrame` 能修掉主会话看到的那两处取景；准星同理（`G.hud.xh.style.visibility`）；`flow._wordPool` 也会把音标题的选项（`/j/`）收成单词卡回炉的干扰项（`_altPrompt` 只用 `/[a-z]/i` 过滤）——`arena/alt.js` 的 `WORD` 那一行可以照搬。
- **审计**：`tools/learn/arena-audit.mjs --form duel|quiz|boss [--views portrait,landscape] [--learn w1d6] [--gate N] [--n 3] [--far] [--skip-to S] [--shots dir] [--budget s]`；Boss 题前把她放到 Boss 正前方 9 m（`--far` 不放），`--skip-to S` 用审计的手清掉前面的段。
- **已知坑**：
  1. 横屏里 Boss 的 HP 条 / 阶段牌（`.iw-lf__phase`，顶上 92 px）和题条叠在一起（题条只躲 `touch.js` 顶排的两个键），回声亭板的第一行也被它们压着（亭子的取景是 play-3 `booth.js` 的，不知道 Boss 的 HUD）。
  2. 对抗赛的题簇钉在锚点上：她跑远了它就在身后，转回来才看得见（不跟着她）。
  3. 对抗赛的标签牌偶尔和机器人头上的名牌（DOM）叠在一起。
  4. 审计每一步都是冻时钟步进，SwiftShader 下一题约 1.5–2 分钟；Boss 八题两个方向要 `--budget 3000`。

## 25. play-6 交付（2026-10-17，分支 `play-6`：双人联机赛 `versus2` / 双人合作赛 `coop2` → 同样的题物，房主判——PLAY §5.5、§9 第 6 期）

**先读了什么**：PLAY §1（12 条逐条核）、§3 M1 / M4 / M6、§4 表的「对抗赛 / 小考 / 联机」一列、§5.5、§6、§10；本文 §14（中继、versus2 / coop2、线协议 `ls / ld / lq / la / lr / lc / lg`、`duo.js` 的裁判和拆题、两个浏览器的实测）、§18（题物 / 题条 / `_judgeRecord`）、§19（字弹的接口）、§22（解谜宿主 `play/host.js` + `wire/*` 的契约）、§24（play-5 的 `arena/*`：`ArenaHost`、题簇、字靶的墨圈 + 泡泡盾、`duel.js` 怎么接的）；代码：`forms/versus2.js`、`coop2.js`、`duo.js`、`duel.js`、`common.js`（`judgeAnswer`、`rightAnswerOf`）、`flow.js`（`this.play` 只给 `constructor === LearnFlow`、`_askNext`、`_altPrompt`）、`play/host.js`（`kindOfItem`、`_prep` / `_placeBoards` / 出口区）、`play/run.js`、`arena/{host,run,type,alt,m1,targets}.js`、`wire/type.js`、`board/{walk,set,paint}.js`、`ui/play-strip.js`、`ui/play-keys.js`、`type/{shot,inkword,rig}.js`（`team`）、`core/touch.js`（`G.playTap`、第 191 行 `G.match.learn.play`）、`game/weapons.js`（`G.playTargets`）、`game/match.js`（`learn.hold` 关控制器）、`forms/index.js buildNetLearn`、`net/session.js lessonOf`；测试 `duo.test.mjs`、`play-arena.test.mjs`；实测脚本 `tools/learn/net-duo.mjs`、`net-duo-coop.mjs`、`arena-audit.mjs`。

**先定的**：
1. **versus2 用 play-5 的 `ArenaHost`**（`mode 'zone'`，锚点 = 争夺中的区域中心）：对抗赛的题簇本来就是「浮在争夺中的区域上空」，选择题全是墨靶（音标 / 听辨也是，PLAY §4 这一列）、打字是打字蟹 + 脚下墨圈 + 泡泡盾。每个屏幕按自己的相机排自己的题簇，放法和对抗赛一样；**同样的是题物本身**：同一个机制、同样的标签、同样的顺序、同一个对的序号。它也挂成 `this.play`（`flow.dispose` 收它、`touch.js` 191 行见 `learn.play` 才把题条的 ▶ 留给题条——LEARN §24 拿不准的 9 在对抗赛里还在）。
2. **两边同样的题物 = 同样的提示**：`engine.prompt` 是纯的；换问法（没人答对 → 换个问法再来一次）原来用 `Math.random` 抽干扰项、排顺序，两块屏不一样。改成 `duo.js duoAltPrompt(gates, item, seed)`：打字题走 arena 的换问法（`arenaAltPrompt` 多一个可选 `rnd`），选择题同题重排（`_perm`），**随机数用题号 + 条目 id 播种**（`seedOf(q, id)`，两边都有，`lq` 一个字段都没加）。「哪一个是…」开头的题（换成打字，没有随机）交回形式自己的 `_altPrompt`——三周里没有这种题（§18）。
3. **coop2 不直接用 `PlayHost`**（任务书说「用解谜宿主的公开接口」）：`PlayHost.kindOfItem` 把听辨 / 音标送去节拍台，节拍台在小节线上**放这个词**——作答方不能听到任何东西；`PlayRun` 的标签图集只画 `canPlayM1` 的条目（听辨 / 音标的标签会是空的 `NOUV`）；它还会在路上立展板、建出口区（coop2 自己有 `_open`）。所以写了一个同契约的小宿主 `src/learn/play/duo/coop.js CoopPlay`，用的件都是现成的：墨靶 = play-5 的 `ArenaRun`（任何选择题、换问法自己一张小图集）、打字 = play-wire 的 `TypeStation`（`wire/type.js`，经它的宿主契约 `facingYaw / m1._topKeys / strip / say / reduced / resized`，play-fix 在改它，合并后自动跟上）、线索 = M6 `BoardWalk`、镜头 = `PlayCam`。
4. **线索方 = 一块展板**：她站在自己的墨垫上，展板在她面前 `LEARN.board.view`（1.7 m）、朝去门的方向（地面在她这一层、她的头和板面之间、板面和**这块板在这块屏上 `frameBoard` 的取景位**之间、板子两头都没挡就用，否则左右转着找，都不行就用题条；竖屏板宽 1.3 m——板总是框满屏宽，屏上的字一样大，2.3 m 宽的板要把镜头放到她身后 4 m，进了凉亭 / 墙里），观景点就是她站的地方——一升起镜头就框住；板上是题干、中文、怎么做（「你看得到题目：讲给 Bo 听，Bo 来选」）和「再听」（有录音时，升起时就放一遍）。`duo.js clueSpec` 是纯数据，测试核它没有任何可答的热区。
5. **作答方的「提示」**：`TypeStation._hint` 在没有 `p.hint` 时会把条目的中文放上题条——作答方「没有中文」（`splitPrompt` 的规矩）就破了。合作赛里作答方的提示键灰掉、按了只说「提示在队友那边：听队友说」，不记 `H`。
6. **线索方的判定写在题条上**：答对「Bo答对了 · 答案：…」；答错而且这题会换问法**回到她手里**时只写「差一点 — 换个问法，这次你来答」，**不写正确答案**（她马上要答它，首答要干净）；最后一次答错才写「差一点：是 ___」。作答方的题物 / 墨字照解谜演对错（珊瑚色、对的那个描她的墨）。
7. **versus2 的时间到**：站上演「时间到了：是 ___」（墨靶标出对的那个 / 打字蟹收键盘），什么都不判不写，停 `verdictMs` 再走；剩几秒在题条的小标签上（`PlayStrip.chip`，变了才写 DOM）。打字时被打倒（`ArenaType.abort`）这题还开着，她起来再出一次。
8. **墨是她那一队的**：versus2 的访客在 1 队；`ArenaRun` / `ArenaType` / `TypeShot` 原来写死 0 队——访客打字时脚下那圈墨、墨字溅到地上的墨都会是对面的颜色、涂对面的地盘、还复制到房主屏上。`ArenaHost` 多一个 `opts.team`（默认 0），一路传下去。
9. **浏览器实测用 playwright**：`net-duo.mjs` 用的 `puppeteer-core` 这台机器上没有（`/opt/node22/lib/node_modules` 只有 playwright）；新写 `tools/learn/net-duo-play.mjs`，冻页面、按消息和定时器步进的做法照 `net-duo.mjs`。coop2 默认用审计的手把两个人放到各自的墨垫上（B 的自动走不是这一期测的，3 分钟里放不下；`--walk` 照旧自动走）。
10. **两种形式的判分都只剩一条路 `_judgeRecord(g, item, p, ans, o)`**（名字、签名和 dev / play-5 的同一个，`o.hinted → H`、`o.judged` 同义）：versus2 的卡片 `_answer`、墨靶、打字蟹都调它（judge → 她自己的 store → `la` 给裁判 → 答错掉墨罐），返回 `{ r, first, again: false }`（没人答对的题由房主重排，不在这里）；coop2 只有作答方的 `_judgeRecord` 写（judge → store → `la` 给两边，`_onAnswer` 在同一帧里上锁 / 重排），线索方调用也什么都不写。两个形式都覆盖 `_askNext`——B 的会从自己的队列出题（访客那边会自己起一串题）。

**改了什么**：
- `src/learn/forms/versus2.js`：开关下建 `ArenaHost`（`team` = 她在名单里的队，`edges` / `settle` 开）、挂成 `this.play`；`_gateOf(i)` 每道题一个「一题的门」、`_prepAhead` 在 `ls` 和上一题 `lc` 时画下一题的标签图集；`_altFor` 用 `duoAltPrompt`；`_onAsk` 的题物分支（不 hold、不清意图、不 exitLock、不出卡，`learn:question` 带 `play: true`）；`_judgeRecord` / `_askNext`；`_expire` 交给站上演；倒下后重出（`q.reask`）；`_progress` 写题条的小标签；`_onInk` 题在屏上时把「X 先答对了」写进小标签（横屏上 FormsUi 的提示行压在题条上）；`_stop` 收站；`debug()` 多 `hold / paused / play / answered / arena`。卡片路的行为没变（判分改走 `_judgeRecord`，写的东西一样）。
- `src/learn/forms/coop2.js`：开关下 `this.play = new CoopPlay(this)`、每帧 `play.update`；`lg ask` 只在没有宿主时 hold；`_onAsk` 的题物分支（作答方 `play.ask(view)` + 小标签「n/N · 你答 · X说」，线索方 `play.clue(view)`）；换问法用 `duoAltPrompt`；`_judgeRecord` / `_askNext`；`_onAnswer` 给线索方 `clueVerdict`、预画下一题线索方的展板（按 `rolesFor` 推下一题谁拿线索）；门开 `play.gateOpened`；队友离开 `play.clear`；`debug()` 多 `hold / paused / play`。
- 新 `src/learn/play/duo/coop.js`：`CoopPlay`（见先定的 3–6）——`ask`（作答方：墨靶 / 打字蟹，提示键改成「提示在队友那边」）、`clue`（线索方：展板，放不下用题条；竖屏板宽 1.3 m）、`_clueSpot`（地面、头 → 板面、板面 → 这块板在这块屏上的 `frameBoard` 取景位、板两头，都清楚才放；不行就 `noBoard` 记原因）、`clueVerdict`、`prepClue`（判定空当里先画下一题的线索展板）、`facingYaw`（打字蟹的取景位不被挡的朝向）、展板框住或打字时藏准星、`_anchor`（门后 6 m 的路线点：题物浮在那里、墨字落在那边）。
- `src/learn/forms/duo.js`（加法）：`seeded`、`seedOf`、`duoAltPrompt`、`duoMechanic`、`clueSpec`。
- `src/learn/play/arena/host.js`（加法）：`opts.team` 的说明、`expire(v, ms)`。`arena/run.js`（加法）：构造里按 `opts.team` 换墨色；`opts.edges`（视线核到标签牌下沿）、`opts.settle`（rig 的模式过渡结束才放）——都默认关；`expire(v, ms)`（标出对的那个、题条说一句、`next` 照常交回 `_askNext`）。`arena/type.js`（加法）：`opts.team` → `TypeShot` / 键盘颜色 / 脚下墨圈 / 光圈；`expire(v, ms)` + `update` 里一行倒计时。`arena/alt.js`：`wordPool` / `arenaAltPrompt` 多一个可选 `rnd`（默认 `Math.random`，对抗赛 / Boss 行为不变）。
- `src/ui/play-strip.js`（加法）：`chip(text, kind)`。
- `tests/learn/duo.test.mjs` +4 条（见测试）。新 `tools/learn/net-duo-play.mjs`。
- `docs/PLAY.md` §5.5 一段「play-6 更正」。

**动了别人地盘的**：`host.js`、`cam.js`、`wire/*`、`flow.js`（play-fix 在改）、`weapons.js`、`main.js`、`actor.js`、`cameraRig.js`、`src/net/*`、`touch.js`、`hud-learn.js`、`config.js`、`run.js`（play-1 的）**一行没动**。共用文件只做了加法：`src/ui/play-strip.js`（`chip`）、`src/learn/play/arena/*`（`opts.team`、`expire`、`rnd`；`ArenaType.update` 多一行只在 `expire` 之后才走的倒计时）。`wire/type.js` 的 `TypeStation` 是经它的宿主契约用的（`facingYaw / m1._topKeys / strip / say / reduced / resized`，外加作答方改了它键盘的 `onHint` 和 `setHintUsed(true)`）。

**测试**：`npm run test:learn` 197 → 201（`duo.test.mjs` +4）：
- **versus2 两边同一道题**：三周 21 个对抗赛日的队列（每日 40 题、每题原样 + 换问法各一次，共 1680 道：1114 墨靶、566 打字蟹），两块「屏」各自从同一个 `lq` 建题——同一个机制（和 `arenaKind` 一致、没有一道落到卡片）、同样的标签同样的顺序、同一个对的序号、对的那个两边都判对；换问法全程不碰 `Math.random`（测试里把它换成会抛错的函数）；重排的选择题真的重排了（358 道）。
- **coop2 作答方才有题物**：三周解谜日的每道门每道题（原样 + 换问法，4200 道）：作答方的 view 有机制（墨靶 / 打字蟹）、没有录音 / 题干 / 中文 / 提示，墨靶的标签就是原题的选项、按序号判和原题一样；线索方的 view 没有机制、没有选项；线索展板的热区只有「再听」（有录音时才有）/「读全文」，字 ≥ 54 画布像素。
- **一条路**：`Versus2Flow.prototype._judgeRecord`：首答一次、一个 `la`（q / ok）、叶子 `[1, L]`、提示 → `H`；`Coop2Flow.prototype._judgeRecord`：作答方写一次、`la` 带 ok / why / canonical / first、第一次答错 `again`；线索方调用什么都不写不发。
- **源码**：两个形式 `recordFirst(` 各一次（在 `_judgeRecord` 里）、都覆盖 `_askNext`；versus2 的题物分支在卡片的 hold 之前 return（中间没有 paused / exitLock / hold / 清意图）；coop2 的 `hold = true` 只在「没有宿主」的分支和结果卡；`coop.js` 不判、不停、不定。
- `npm run check` 280 个文件。全套跑了 7 次：第一次有 1 条没过（当时 197 条，没记下是哪条——机器负载 ~5，`relay.test` 是真 socket 计时），之后 6 次全过。

**实测**（`tools/learn/net-duo-play.mjs`：自己起 Node 中继 + 文件服务、两个 Chromium（SwiftShader、`?quality=low`、阴影 / 泛光关、触屏），建房 → `lobby.learn.short` → 开局，开机后冻住页面、按消息和定时器、2 倍实时步进；每次都在 `flock -w 9000 /tmp/ielts-browser.lock nice -n 10` 下一次一个、每次 ≤ 3 分钟（两个浏览器开机就要 72–78 s，第一次 `paint.flush` 每页卡 ~50 s，所以第一题在 ~140 s 才出来）；每题两块屏都核：没有显示出来的 `.iw-learn__panel`、`match.paused === false`、`learn.hold` 为假、题条在；versus2：同一个机制 / 同样的标签同样的顺序 / 同一个对的序号、每个题物（球 + 标签牌 / 横幅）的投影都在安全区（题条下面、两边 16 px）、题物登记了、题条小标签有秒数，**真的点**题物（playwright 触屏 → `touch.js` → `G.playTap` → 她的墨弹 → 命中）/ 在游戏键盘上一个键一个键点、答完照样不暂停不定身，第 1 题访客先答对（按自己的钟早 1.5 s）、房主后答对 → 墨归访客，第 2 题房主答对、访客答错 → 墨归房主，两边的墨一样、区域份额一致、首答各 2 条各进各的 store、INKWAVE 的结算 + 学习条；coop2：两人在各自墨垫上、房主宣布、两边都在出题且没人被 hold，作答方有题物 / 打字蟹、题条上没有 ▶ / 题干 / 中文、题物在安全区，线索方是展板（或题条）、没有题物登记、没有键盘、没有卡片、展板热区只有「再听」/「读全文」，作答方第一次故意答错 → 两边都显示判定、线索方不给答案、这题换问法回到另一个人手里，两道门两边同步开、每台设备的首答 = 它自己的人答过的题、结果卡；2026-10-17 UTC）：

| 轮 | 形式 · 屏 · 关 | 结果 | 看到的 / 改的 |
|---|---|---|---|
| r2 / r3 | versus2 · 竖 390 × 844 · w1d1 | r2 32 / 33（结算那条是 3 分钟到了），**r3 33 / 33** | 截图 `r2/versus2-portrait-question.png`：房主一排四个、访客 2 × 2；访客下排两个球被凉亭的栏杆 / 喷泉挡住一半、房主最左的标签被路灯杆挡住一角（装饰不在物理里，视线核不到——已知坑 1） |
| r4 | coop2 · 横 844 × 390 · w1d1 | 56 / 56 | 截图 `r4/…-split.png`：线索方展板（题干 + 长元音 + 提示），作答方四个球；FormsUi 的提示行（top 18 %）压在作答方的题条上 → 不再说那一行、角色写进题条小标签；访客那块墨垫一次都没放上板 → 见 r5 |
| r5 / r6 | coop2 · 竖 · w1d1 | 56 / 56 · **56 / 56** | r5 截图：房主的展板被凉亭的梁挡得只剩下半截——找地方时核的取景位是她身后 1.4 m，frameBoard 竖屏要把 2.3 m 的板框满屏宽，镜头其实在她身后 4 m → 按这块板在这块屏上的真实取景距离核、竖屏板宽 1.3 m；r6 截图 `r6/…-split.png`：整块板在屏上、字清楚；访客那块在第 1 道门放上了板，第 2 道门四周都挡（用题条） |
| r7 / r12 | versus2 · 横 · w1d1 | **33 / 33** · 32 / 33（结算：3 分钟） | r7 截图：两边四个球都在观景台的石栏杆上面，挂在下面的标签牌落在栏杆后——标签中心擦着栏杆顶过去 → `ArenaRun opts.edges`（核到标签下沿）；r12 截图 `r12/versus2-landscape-question.png`：房主题簇拉近到 5.5 m、八块标签都在栏杆前 |
| r8 | coop2 · 横 · w2d5（听写句 M4 + 发音小测） | 51 / 53（门 2 / 结果卡：3 分钟） | 打字题全过（作答方打字蟹、题条无 ▶、线索方展板带「再听」）；截图：作答方的画面是一排栏杆柱和地面，打字蟹不在画面里 → r14 / r15 |
| r9 / r13 | versus2 · 竖 · w2d5 | 27 / 30 · 29 / 30（结算：3 分钟） | 第 1 题听写句：两边打字蟹（键盘颜色是各自队的）、都打对、墨归访客；r9 第 2 题（打字题之后的墨靶）两边的球都落到题条上面 → 打字蟹的镜头放回跟随有 0.6 s 的过渡，题簇在过渡里放了 → `ArenaRun opts.settle`；r13 全过 |
| r10 | versus2 · 竖 · w1d1 · `&play=0` | **7 / 7** | 卡片照旧：两边同一张卡、墨按自己的用时、首答各记、结算 + 学习条 |
| r11 | coop2 · 横 · w1d1 · `&play=0` | **9 / 9** | 卡片照旧：线索卡没有作答、作答卡没有录音，五题、两道门、结果卡 |
| r14 / r15 | coop2 · 竖 · w2d5 | 53 / 53 · **53 / 53** | r14 截图：打字蟹又被访客墨垫背后的栏杆挡住、走路条冒在题条上面 → 打字的朝向找一个打字机位不被挡的方向、先 hide() 再 playMode(true)；r15 截图 `r15/…-split.png`：打字机整台在画面里（左下角还压着一点栏杆柱；纸在题条下面——`wire/type.js` 的取景，play-fix 的地盘），准星 r15 之后也藏了 |
| r17 | coop2 · 横 · w2d5（最后的代码） | **53 / 53**（门、结果卡都进了 3 分钟） | 截图 `r17/…-split.png`：线索方展板带「再听」；作答方打字蟹整台在题条和键盘之间、她坐在里面、准星藏了（`fd334bd` 在浏览器里只在这一轮核过）；纸压在题条下面（`wire/type.js` 的取景） |
| r16 | versus2 · 竖 · w1d1（最后的代码：edges + settle + 小标签） | **33 / 33**（第一题 140.5 s、结算 167.7 s） | 截图 `r16/versus2-portrait-question.png`：访客的 2 × 2 下排两个球和标签都在栏杆前了；房主最左那块标签还被路灯杆挡一角（装饰，已知坑 1） |

截图（不提交）在主会话草稿目录的 `play6-shots/r*/` 下，每轮一张两边并排的（`*-c0.png` / `*-c1.png` 是各自那一张）。

「3 分钟到了」的那几条（结算 / 门 2）是预算不够，不是行为错：开机 72–78 s + 第一次 flush ~50 s 以后只剩 ~35 s，打字题、截图（两页各渲一帧 ~9–12 s）会把最后的结算挤出去；同样的检查在 r3 / r7 / r16（versus2）、r4–r6 / r14 / r15（coop2）里都过了。

**PLAY §1 的 12 条**（开关开着，两种形式）：1 不暂停 / 不定身 / 不弹面板 ✓（每题两块屏都核 `paused`、`hold`、`.iw-learn__panel`；coop2 的「站上墨垫后出题」不再 hold；打字时站着是 play-wire 的「清意图」，不是定身；结果卡上的 hold 是一局结束以后的，和解谜一样）；2 判分一条路 ✓（两个形式各一个 `_judgeRecord`，`recordFirst(` 各一次，源码测试）；3 证据如实 ✓（首答各记各的——versus2 每人自己的 store，coop2 只记作答方；提示 → `H`；coop2 作答方的提示不给中文所以没有 `H` 可记；打字提交前不给对错——打字蟹 / 键盘 / 墨字是 play-type 的，没改）；4 节奏——双人里没有节拍玩法（coop2 的听辨 / 音标也是墨靶，见先定的 3）；5 没有误答 ✓（墨靶只认点射 / 准星开火那颗带标记的墨弹；对面玩家的墨弹在本机没有标记，只在题物上溅一点灰）；6 不惩罚 ✓（错是珊瑚色 + 「差一点」；versus2 的答题时限和答错掉三成墨罐是 §14 原有的联机规矩）；7 每句英文配中文 ✓（题条、标签牌照 `engine.prompt`；coop2 作答方故意没有中文——那是线索方的一半，§5.5）；8 不加素材 ✓；9 画风流畅 ✓（同一套题物 / 打字蟹 / 展板；镜头只经 `PlayCam` 弹簧和 rig 的 `dampAngle`；标签图集在上一题关题时画、线索展板在判定的空当里先画；帧时间没量）；10 竖横 ✓（实测表）；11 内容不少 ✓（三周每道 versus2 / coop2 题、含换问法，都有玩法，测试核）；12 开关可退 ✓（`&play=0` 两轮）。

**拿不准的（自己定了，请主会话过目）**：
1. **coop2 没有直接用 `PlayHost`**，而是同契约的 `CoopPlay`（先定的 3）：play-fix 改 `TypeStation` 的宿主契约（`facingYaw / m1._topKeys / strip / say / reduced / resized`、键盘的 `onHint / setHintUsed`）时 `coop.js` 要跟着改；它用 `_clearStation` 式的清法，没有调 `PlayHost` 的私有方法。
2. **coop2 的听辨 / 音标是墨靶不是节拍台**：节拍台要在小节线上放这个词，作答方不能听；墨靶上就是两个 / 四个词，线索方念给他听。
3. **线索方 = 展板，放不下就用题条**：tidewater 的访客那块墨垫贴着观景台的栏杆，竖屏第 2 道门四周都挡，用了题条（`noBoard` 的原因在宿主 log 里）。展板是这一题现画的（判定的空当里先画下一题的——按 `rolesFor` 推下一题谁拿线索；换问法的题当场画）。
4. **作答方的「提示」不给中文、不记 `H`**（先定的 5）；作答方键盘上的 ▶ 按了没有声音（`TypeStation` 建键盘时就带着 ▶，作答方的 view 没有录音）——没藏，只是什么都不放。
5. **线索方的判定不写会回到她手里的答案**（先定的 6）；作答方的题物照解谜标出对的那个——两个人在一个房间里说话，作答方看到了也会说，但线索方屏幕上的首答是干净的。
6. **换问法的种子 = 题号 + 条目 id**，没加 `lq` 字段（房主迁移以后新房主从下一题接着出，题号照旧往下数，种子照样两边一致）。
7. **versus2 时间到了给答案**（和卡片一样：「时间到了：是 ___」+ 中文），什么都不写。
8. **打字时被打倒，这题她起来再出一次**（还在时限里的话）：play-5 的打字蟹倒下就 `abort`（对抗赛把题放回队首），versus2 的题是房主在出、还开着，所以在她复活后同一题重出，不另发消息。
9. **题簇被装饰挡**：凉亭的栏杆 / 喷泉、路灯杆不在物理里，视线核不到（play-wire 已知坑 1、play-5 已知坑 2）；`edges` 只管到标签下沿、`settle` 只管镜头过渡。真要根治得用渲染的可见性测试。
10. **`G.playTargets` 吃掉别人的墨弹**：本机的题簇浮在区域上空，对面玩家（在本机模拟的）和机器人的墨弹碰到它就停（`weapons.js` 1629 行，play-1 起就这样）——PvP 里题簇在她和对手之间时像一面小盾，两边对称。打字时脚下那圈墨会算进区域（两边都有）。桌面上准星压在题物上开火算答（和对抗赛一样）。
11. **`ArenaRun` 的 `edges` / `settle` 默认关**：对抗赛 / 小考 / Boss 也有同样的毛病（打字题后接选择题、矮墙后的标签），没替它们打开——「别改已有行为」；要开是 `duel.js` / `boss.js` 里一个字段。
12. **实测里 coop2 的两个人是审计的手放上墨垫的**（每一帧在 walk 阶段把她放到自己那块上），B 的自动走这一期没在浏览器里跑（`--walk` 可以跑，3 分钟放不下）。
13. 全套测试第一次跑时有 1 条没过（197 条那时），之后 6 次全过，没抓到是哪条；`relay.test.mjs` 是真 socket 计时，机器负载 ~5。

**没做的**：
1. 帧时间对比（PLAY §7）没量；真机没跑。
2. versus2 机器人填位、断线、房主迁移在新的题物下没在浏览器里跑（Node 里裁判照旧）；versus2 的「没人答对 → 换个问法再来」在浏览器里也没走到（每轮都有人答对），种子相同的换问法只在 Node 里核过（1680 道，含换问法）——coop2 的换问法在浏览器里走过（r4 / r6 / r8 / r14 / r15 / r17：交给另一个人）。
3. 作答方键盘的 ▶ 没藏；`wire/type.js` 的取景（纸在题条下面）、准星——play-fix 的文件，coop2 这边藏了准星、选了朝向。
4. 题物被装饰挡的根治（渲染可见性）；对抗赛 / Boss 打开 `edges` / `settle`。
5. §14 没做的照旧：coop2 墨罐共用、`deploy/` docker-compose、versus2 房主迁移时丢掉正在问的那一题。

**交接**（分支 `play-6`，没推，从 dev `c332209` 建出，没再合 dev）：
- **做到哪**：开关下 versus2 / coop2 都没有卡片、不暂停、不定身；versus2 是对抗赛的题簇 / 打字蟹，两边同一道题同样的题物、答案照旧 `la → Referee → lr → lc`；coop2 线索方展板（或题条）、作答方墨靶 / 打字蟹，判定两边同时。竖横、选择 / 打字、`&play=0` 都在浏览器里走过（上表）。
- **先看哪些文件**：`src/learn/forms/versus2.js`（`_onAsk` 的题物分支 → `_judgeRecord` → `_askNext` / `_expire`）→ `src/learn/forms/coop2.js`（`_onAsk`、`_judgeRecord`、`_onAnswer` 的 `clueVerdict`）→ `src/learn/play/duo/coop.js`（`ask` / `clue` / `_clueSpot` / `facingYaw` / `update`）→ `src/learn/forms/duo.js` 末尾（`duoAltPrompt` / `duoMechanic` / `clueSpec`）→ `arena/run.js` 的 `team / edges / settle / expire`；测试 `tests/learn/duo.test.mjs` 末尾 4 条；实测 `tools/learn/net-duo-play.mjs`。
- **接口**：`ArenaHost(flow, { mode, anchor, team, edges, settle })`、`ArenaHost.expire(v, ms)`；`PlayStrip.chip(text, kind)`；`CoopPlay` 的契约同 `PlayHost`（`canAsk / ask / clue / clueVerdict / prep / prepClue / clear / gateOpened / update / facingYaw / say / debug / dispose`）。
- **和 play-fix 撞的**：`coop.js` 用 `wire/type.js` 的 `TypeStation`（构造 `new TypeStation(host)`、`ask / update / gate / pose / still / clear / warm / dispose / debug`、`keys`）——如果 play-fix 改了它向宿主要的东西，`CoopPlay` 照着补；它若把 `arenaTypeFrame` 换进 `wire/type.js`，`CoopPlay.facingYaw` 里用的 `frameFor` 打字机位要换成同一个。没有动 `host.js / cam.js / wire/* / flow.js`。
- **实测**：`NODE_PATH=/opt/node22/lib/node_modules flock -w 9000 /tmp/ielts-browser.lock nice -n 10 node tools/learn/net-duo-play.mjs --mode versus2|coop2 --view portrait|landscape [--week 2 --day 5]（打字题） [--play 0] [--walk] --shots <dir>`；默认预算 176 s。
- **已知坑**：
  1. 题簇 / 展板被不在物理里的装饰挡（拿不准的 9）；对方玩家的名牌（DOM）偶尔压在一块标签上。
  2. 3 分钟的实测里结算常常挤不进去（见上）；要看结算就别截图（不给 `--shots`）。
  3. 线索展板是当场画的 CanvasTexture（判定空当里先画下一题的那张，猜错了就当场画）；换问法的题物标签也是当场画的小图集。

## 26. play-7 交付（2026-10-17，分支 `play-7`：横屏收尾——游戏键盘横屏拆两半、三处打字机位按中间那列取景、横屏里几处压盖；IELTS-Base 分支 `ios-landscape`：App 里只有游戏页能转横屏——PLAY §3 M4、§8、§9 第 7 期）

**先读了什么**：PLAY §1（12 条）、§2.2（题条）、§3 M4（「怎么玩」键盘竖横两套、机位和它的 play-fix / play-5 更正）、§6、§7、§8、§9 第 7 期、§10；本文 §19（`keys.js` 的排布、`frame.js`、交接里「横屏 rig 小、要拆键盘」）、§22 更新（play-fix：解谜按题条和键盘的真实位置取景、横屏打字时题条贴顶盖住钟）、§23（跑酷 `glide.js` / `cam.js`、`tips.js` 横屏题条贴顶）、§24（`arenaTypeFrame`、拿不准的 6「横屏打字机挤在左上角约 120 px」、已知坑 1「Boss 的 HP 条 / 阶段牌压题条和回声亭板」、已知坑 3「标签牌和名牌叠」）。代码：`type/{keys,frame,rig,deck-geo,mats,atlas}.js`、`ui/play-keys.js`、`ui/play-strip.js`（`fit` 在横屏写行内 `max-width`）、`wire/type.js`、`runner/{glide,cam,tips,runner}.js`、`arena/{type,m1,host,run}.js`、`board/{walk,frame}.js`、`echo/booth.js`、`play/cam.js`（`fov` 经 `cameraRig` 的 `zoom`）、`game/cameraRig.js`（`fov = vBase + (fovKick − zoom) × 0.8`，没有夹）、`ui/hud.js`（名牌 `_updMarkers`）、`ui/hud-boss.js` / `styles/hud.css`（Boss 条 `.iw-bb` 用 `--u`）、`forms/ui.js`（阶段牌、跑酷名次、道具袋）、`core/touch.js`（跳过 `PlayKeys.owns`、跑酷的滑动钩子）；三个审计。另一个子代理的 `play-6` 工作树（只读）：它改 `arena/type.js` 的构造 / `_ensure` / `ask` 里的墨圈 / 新 `expire()` / `update` 一行、`arena/host.js` 的注释和新 `expire()`、`arena/run.js`、`play-strip.js` 的 `chip`——这一期的改动都躲开了这些行。IELTS-Base：`ios/IELTSBase/{IELTSBaseApp,WebView}.swift`、`Info.plist`、`ios/README.md`、`ios/typecheck/`（README、桩、自检）、`ios/scripts/release_check.py`（iPad 要四向、iPhone 列表只要不空）。

**先定的**：
1. **横屏一律分体**（`keys.js keyboardLayout` 横屏默认 `splitLayout`，`{ split: false }` 留着原来的整条三行）：每块三行、五列字母 + 外侧一列动作键（左 ▶ / 提示 / 空格，右 ⌫ / 射 / -）。空格在左下角外侧（左拇指；句子里常用，44–55 px 宽），`-` 固定在右下角，单词 / 句子两种模式位置不变。列不错位（拇指打字用不上 QWERTY 的错行）。字母宽先缩到 30 px、再缩中间那列（中间想要屏宽 36%）。两块垫子从屏幕边一直铺到底（贴边、只有内侧上角圆），中间那列不画底、不吃触摸（触摸照旧给世界）。
2. **取景是新的纯函数**（`type/split.js splitFrame`），不改 `frame.js`（共用文件只做加法：只用它导出的 `projectRig` / `RIG_POINTS` / `FRAME`）：在列里搜相机的高、距、焦距（52° 到 0.55 倍）和一点侧移；要求整台打字机（`SPLIT_PTS`：键盘托四角、砸字点、正在打的那行和上一行、打了十个字后的行首、**纸顶**）在列里，托架走到两头时纸的四角（`SHEET_ENDS`，±1.37 m）在屏上、只能在垫子以上出列，她的头低于**中间那排**再 0.05 NDC（PLAY §3 M4 照字面，play-fix 的余量）；分数 = min(字号 / 17 px, 打字机高 / 240 px)，1.6 倍封顶（桌面那列 660 px 宽，不封顶会铺满屏）。**字号的定义**：纸上正在打的那一行、砸字那一列的一个字的 em——字格 `DECK.glyph` 0.205 m × 字图画字的 0.78 = 0.16 m——投到屏上的像素高（相当于 CSS 的 font-size；小写字母的 x 高约是它的一半）。**打字机高**：键盘托前沿到纸顶。三个审计都用 `tools/learn/land-measure.js` 拿真相机投真打字蟹的点量这两个数。
3. **列顶**（`landscape.js typingColumn`）：读 `PlayKeys.rect()` 的两块垫子内沿，列顶取压在列上的东西里最低的底边（钟那排、题条、Boss 条、阶段牌、跑酷名次、触屏顶键），每 0.4 s（跑酷）/ 换带子时（解谜）/ 出题、提示、转屏时（对抗赛）读一次；`splitFrame` 按列缓存，三个站在 `warm()` 时先算一次（第一次搜 15–80 ms，不放在打字那一帧）。
4. **题条让开钟**（任务书给的两条路里选了「题条让开」）：横屏手机上 `.iw-ps.is-typing` 的题条移到左上角、压在左垫子上方（宽 = 左垫子内沿，`--iw-pk-side`，PlayKeys 写），按需折行、字 17 px、▶ 藏（键盘上有）；钟留在顶上正中。这样列顶就是钟那排的底边（约 45 px），而且题和提示不用再省略成一行。对抗赛 / Boss 的字弹原来不加 `is-typing`，这一期加上（`_pose('type')` 里加、`clear()` 去）。
5. **Boss 的顶上一排**：HP 条缩小（`--u` 4.4 px，约 229 × 33）放到钟的左边、阶段牌放到钟的右边（约 219 × 31），都在 3–41 px 那一排；Boss 战里打字时题条的角从这一排下面 44 px 开始（`:root:has(.iw-bb:not(.is-off))`）；回声亭板的取景带顶到这一排的底边（`hudBand`，经 `BoardWalk.bandFor`）。不改 `hud-boss.js`，只在 `landscape.js` 的横屏手机 CSS 里挪。
6. **名牌让位**：`hud.js` 只加 `markerYield(on)`（名牌层加 / 去 `is-yield`），`hud.css` 一条让它透明（含屏外的箭头——Boss 回声亭时它们贴在屏底、压着板的按钮）。谁开：`arena/host.js` 每帧一个条件、变了才写——对抗赛 / 小考题物放好且没答、打字蟹在（对抗赛和 Boss）、Boss 的回声亭板框住时。
7. **iOS**：见下面 IELTS-Base 一段。

**改了什么**（INKWAVE，按提交）：
- `85abdf4` 键盘拆两半：`keys.js`（`splitLayout`、`KB.split`、输出多 `split / halves / mid`）、`play-keys.js`（两块垫子 `.iw-pk__half`、`is-split`、`rect()`、藏起来时垫子和键不吃触摸——减少动效时键盘只是淡出，原地的键不能接住手指）、`type-keys` 测试。
- `1fd3955` 三处打字机位：`type/split.js`（新）、`landscape.js`（新：`typingColumn`、横屏手机的打字题条 CSS）、`wire/type.js`（`_band` 带上列、`_typeFrame` 先试 `splitFrame`、`warm`）、`runner/glide.js`（`_column` 每 0.4 s、`_framed` 的打字机位、`warm`）、`arena/type.js`（`_pose('type')` 先试 `splitFrame`、加 / 去 `is-typing`、`warm`）、`play-keys.js` 写 `--iw-pk-side`、`land-measure.js`（新）、`wire-audit` 横屏核、`play-7.test.mjs`（新）。
- `f74def9` 压盖：`landscape.js`（Boss 条 / 阶段牌、Boss 战打字题条 44 px、`hudBand`）、`board/walk.js`（`bandFor`）、`arena/host.js`（回声亭挂 `hudBand`、名牌让位的条件）、`hud.js`（`markerYield`）、`hud.css`、`arena-audit`（横屏字弹 / 顶上一排 / 回声亭板 / 名牌的核）、`runner-drive`（横屏滑行段的核）。
- `d316cd6` Boss 横屏复跑后的修补：名牌连屏外箭头一起让、打字蟹在 / 回声亭板框住时也让；`splitFrame` 底边留 14 px；对抗赛的打字位姿按打字蟹船体的朝向换到世界（同解谜；墨字机位照旧按出题的朝向）。

**动了别人地盘的**：`flow.js`、`weapons.js`、`main.js`、`actor.js`、`cameraRig.js`、`touch.js`、`frame.js`、`play-strip.js`、`config.js`、`hud-learn.js`、`hud-boss.js`、`versus2.js` / `coop2.js` / `duo.js` / `net/*`：**一行没动**。共用文件只做了加法：`play-keys.js`（两块垫子、`rect()`、`--iw-pk-side`、几条 CSS；原有的签名和竖屏一字不差）、`hud.js`（一个方法 `markerYield`，`_updMarkers` 没动）、`styles/hud.css`（一条）、`board/walk.js`（可选的 `bandFor`，默认没有）。`keys.js` 横屏默认的排布变了（竖屏一字不差，旧的横屏留在 `{ split: false }`）。`arena/type.js`：`_toWorld` 打字位姿跟船体、`_pose('type')` 的横屏一支、`warm`、`clear` 一行、两个 import——都不在 play-6 改的那几段里；`arena/host.js`：一个 import、回声亭 `_ensure` 一行、`update` 里名牌的条件、`dispose` 一行（play-6 只加了注释和 `expire()`）。PLAY.md 五处「play-7 更正」（§2.2 题条、§3 M4 怎么玩 / 机位、§8 App、§8 压盖）。

**PLAY §1 逐条核**：① 不暂停 / 不定身 / 不弹面板——没碰流程；审计每题核 `paused` / `hold` / 面板（三处横屏、竖屏复跑都过）。② 判分一条路——没碰判分；三个站的 `_submit → _judgeRecord` 一字没动。③ 证据如实 / 提交前不给对错——键盘只是挪了位置（键的集合、`onKey` / `onSubmit` 没变），纸上的字还是那一个灰；审计里单词 `T`、提示 `H`、听写 `L` 照旧。④ 节奏、⑤ 没有误答——没碰。⑥ 不惩罚——没碰。⑦ 每句英文配中文——题条横屏打字时不再省略中文行（按需折行）。⑧ 不加素材——没有素材文件；两块垫子是 CSS，取景是数，Boss 条只是挪位置。⑨ 画风流畅——镜头还是 `PlayCam` / `runner/cam.js` 的弹簧（焦距也走 `zoom`），每帧不分配（列每 0.4 s 读一次、取景按列缓存、`warm()` 先算）；没有新的绘制。⑩ 竖横都能玩——横屏三处跑过、竖屏复跑没退化（实测表）。⑪ 内容一条不少——`playOf` / `design.test` 没动、照过。⑫ 开关可退——只动了开关下的站和键盘；`&play=0` 的卡片路不经过这些文件（卡片用 hud-learn 自己的输入）。

**测试**：`npm run test:learn` 201 → 227（`type-keys` 18 → 35：多两种横屏屏（852 × 393 刘海 59、无安全区 844 × 390），横屏两种排布都核——分体：每个键在一块垫子里、不在中间那列、左右各 15 / 12 个字母、三行、动作键在外侧且 ≥ 44、⌫ 在射上面 / ▶ 在提示上面、垫子贴边到底、中间那列 ≥ 屏宽 30% 且 ≥ 200 px，审计屏 ≥ 300 px、iPhone 15 横屏 ≥ 280 px；新 `play-7.test.mjs` 9 条：五种屏用 `frame.js` 的投影另算一遍 `splitFrame` 的结果——点在列里、纸的两头不压垫子、头低于中间那排 0.05、高度和字号（审计屏 / iPhone 15：≥ 240 px、≥ 17 px；15 Pro ≥ 16 px；SE ≥ 180 / 11；桌面 ≥ 300 / 20）、焦距在范围里、封顶；和整条键盘比（打字机的板到行 ≥ 1.5 倍、字 ≥ 1.25 倍）；字号的几何和 `deck-geo` 的 `DECK`、字图的 0.78 对上；没页面时没有列、`hudBand` 等于 `boardBand`；三个站都用 `splitFrame` / `typingColumn` / 横屏 CSS，对抗赛的题条用完去掉 `is-typing`，`hud.js` 只加了开关、`_updMarkers` 不知道它，名牌只在 zone 题物 / 打字蟹 / 回声亭板时让）；`npm run check` 278 → 281 个文件。

**IELTS-Base（分支 `ios-landscape`，`af3f385`）**：新 `ios/IELTSBase/Orientation.swift`——`AppDelegate`（`IELTSBaseApp` 用 `@UIApplicationDelegateAdaptor` 挂上）的 `application(_:supportedInterfaceOrientationsFor:)` 回答 `OrientationLock.mask`：平时 `.portrait`、游戏页 `.allButUpsideDown`、iPad 一直 `.all`；`WebView.swift` 的 `didCommit`（主页面每换一次文档：进游戏是 `location.href = 'game/index.html'`、「回课本」是 `'../index.html'`，都换文档）按地址（`isGamePage`：路径 `/game/index.html`）调 `OrientationLock.setGame`——进来放开；离开锁回竖屏、对每个窗口的根控制器 `setNeedsUpdateOfSupportedInterfaceOrientations()`、再 `requestGeometryUpdate(.iOS(interfaceOrientations: .portrait))`；同一种页面之间换页什么都不做。「游戏页按首页算」（`isStartPage`，侧滑返回关着）那一处照旧。`Info.plist` 的 iPhone 方向列表加上两个横屏（任务书说「有的系统只在列表里选」：加上，其它页由 delegate 锁回竖屏；`release_check.py` 只要求 iPad 四向、iPhone 不空，Node 的 `ios-*.test` 17/17）。`ios/README.md` 加「游戏页横屏」一节和目录表一行，`docs/BACKLOG.md` 加真机核的条目（转过去 / 转回来、刘海一侧的安全区、横着按「回课本」、横着冷启动、锁屏 / 切 App 回来、iPad），`docs/DEVLOG.md` 一条。**类型检查**：本机没有 Xcode，也没有 swiftc；临时下了 Linux 版 Swift 6.0.3（只解了编译要的部分，用完删了）跑 `ios/scripts/typecheck-linux.sh`——桩里没有方向的 API（CI 的 `ios-typecheck.yml` 动了 `ios/` 就跑，不补会红），补进 `typecheck/stubs/UIKit.swift`（`UIInterfaceOrientationMask`、delegate 的那个方法、`supportedInterfaceOrientations` / `setNeedsUpdateOfSupportedInterfaceOrientations`、`requestGeometryUpdate` / `GeometryPreferences.iOS`），`selftest/good-api-surface.swift` 加正确用法：App 0 个错误（8 个警告，和不加这一页的 HEAD 一样）、`--availability` 0 个错误、自检 17/17、`dc23c639` 仍 0 个错误。**没在 Xcode 上编过、没上真机。** `Bridge.swift` / `SchemeHandler.swift`、签名、密钥没动；`app/game/` 没同步。

**实测**（浏览器：一次一个 `flock -w 9000 /tmp/ielts-browser.lock nice -n 10`，Chromium + SwiftShader、`?quality=low`、冻时钟步进、触屏；三个审计的横屏核都经 `tools/learn/land-measure.js` 用真相机投真打字蟹的点：「打字机」= 键盘托前沿到纸顶，「字」= 正在打的那行一个字的 em；截图在 scratchpad 的 `play7-shots/`，不进仓库；2026-10-17 UTC）：

| | 改之前（dev `08a48ff`） | 改之后 |
|---|---|---|
| 解谜 `w1d1` 门 7 单词卡 ×2，横 844 × 390（`wire-audit`） | 题条贴顶 38 px、键盘顶 238 px；打字机 64–213 px（板到行 149 px；纸顶 33–41 px 压在题条下），按 Node 算字约 13.6 px；钟被题条盖着 | 键盘两块 0–270 / 574–844，列 270–574；打字机 63–355 px（**290–292 px 高**）× 275–558、**字 17.8–17.9 px**；头 299–300 低于中间那排 288；题条在左上角 8–240 × 6–42（题 + 提示两行）、钟 356–488 × 8–41 露着，互不相交；准星藏着；单词 `T`、提示后 `H`、墨字从镜头看得见 |
| 跑酷 `w1d3 gate=6` 滑行段（单词 ×2、写句 ×2，对 / 提示），横（`runner-audit`） | 题条贴顶 41 px、打字机 67–225 px（约 160 px） | 四题打字机 **290–292 px**、**字 17.9 px**，不压垫子，头低于中间那排，题条（左上角，带「滑行段 · 打字」小签）/ 钟 / 打字机互不相交；名次表在题条下面（96 px 起）没被压；准星从没露出来；结果卡「6 / 6 · 5 / 6 首答 · 4 / 4 滑行段打字答对（2 次提示）」，审计 `errors: []`、4xx 0 |
| 对抗赛 `w1d6` 门 4 听写句 ×2，横（`arena-audit --form duel --gate 4`） | （play-5：打字机在题条左边的角落 116–236 × 65–164） | 两题打字机 **293 px**、**字 17.3–17.4 px**，题条两行在左上角，钟 / 比分那排在正中，互不相交；盾在；打字蟹在时名牌让开；全过 |
| 对抗赛 `w1d6` 门 1–2 音标墨球 ×2，横（`--gate 1`） | （§24 已知坑 3：标签牌偶尔和名牌叠） | 墨球放好时屏上 3 块名牌都透明（其中一块本来会压在一个标签上），答了回来；题条 / 钟不相交；全过 |
| Boss `w1` R 单词卡 / 横幅、W 写句 ×2、S 回声亭 ×2，横（`arena-audit --form boss --skip-to R` / `W`） | 单词卡的打字机挤在左上角 130–253 × 59–162（**103 px 高**），头和中间那排齐平（审计红）；HP 条 / 阶段牌在钟下面 46–125 px，压着题条和回声亭板的第一行 | 打字机 **293–311 px**、**字 17.4–17.8 px**；HP 条 151–380 × 3–36、钟 389–456 × 8–41、阶段牌 464–683 × 7–38 在顶上一排，题条（问题时 249–594 × 51–93；打字时左上角 44 px 起）和它们不相交；回声亭板 254–590 × 102–374，在这一排下面、整块在屏上，队友名牌和屏外箭头让开；HP 0.66 → 0.495 → 0.33 → 0.215 → 0.1 → 0.05 → 0（R 段起 6 题都答对）；第一轮复跑抓到两处（打字时题条压 HP 条左半、第二句写句键盘托前沿出屏 2 px），改了（`f74def9`、`d316cd6`、`0e85576`）后 W 段 ×2 + S 段复跑**全过**：打字机 288 px、字 17.8 px，HP 条 141–370、钟 389–456、阶段牌 474–693，打字时题条 8–189 × 44–80 |
| 竖 390 × 844 复跑（核没退化：竖屏的键盘、题条、取景都没改） | play-fix / play-5 的数 | 解谜单词卡：打字机 288–490 px 在题条底 243 和键盘顶 548 之间、头低于中间那排（play-fix 时 272–495）；Boss R 单词卡 273–474（题条 243、键盘 548），顶上一排（钟、HP 条、阶段牌、题条）互不相交，全过；对抗赛听写句 275–477，打字蟹在时名牌让开，全过；跑酷滑行段四题打字机都在题条和键盘之间、结果卡「6 / 6 · 4 / 4 滑行段打字答对」，一条红：第 4 题（写句 + 提示）量的那一刻她的头比中间那排高 4 px（见拿不准的 11） |

补记（竖屏跑酷那一条红）：拿 dev `08a48ff` 的一份拷贝（`git archive`）配同一个审计跑同一关：**同一题、同一条红**（她的头 393 px、中间那排 402 px，高 9 px），前三题一样过——是 dev 上就有的，不是这一期带进来的；没追。

**拿不准的（自己定了，请主会话过目）**：
1. **字号怎么量**：「纸上的字 ≥ 17 px」取的是正在打的那行一个字的 **em**（0.16 m，相当于 CSS 的 font-size）投到屏上；小写字母实际墨迹的高（x 高）约是它的一半。要按「看得见的小写字母高 ≥ 17 px」算，就得再大一倍——那一列放不下（要么键盘再窄、要么打字机出列）。
2. **iPhone 的刘海宽度**：审计的 844 × 390 没有安全区，中间那列 304 px；真 iPhone 15 横屏（左右各 47）键盘的字母缩到 30 px、列 296 px，按 Node 算打字机约 282 px、字 17.3 px；15 Pro（59）列 280 px、约 264 px / 16.3 px（差一点）；SE 横屏（667 × 375）列只有 213 px，约 200 px / 12 px——屏太窄，没有办法在不压键盘的前提下更大。没上真机。
3. **字母 30 px 宽**（刘海机上）：比竖屏的 34 px 窄。两块各五列 + 外侧动作列 ≥ 44 px 是任务书的格局，三行；要更宽只能让中间那列变窄（打字机变小）。动作键都 ≥ 44 × 44。
4. **空格放在左下角外侧**（左拇指），不是中间：中间那列要留给打字机。句子里空格多，左拇指够得着；`-` 固定在右下角外侧。单词模式右下那一行只有 n、m 和 `-`。
5. **题条让开钟、而不是挪钟**：任务书允许「钟挪位 / 缩小，或题条让开」。挪钟要动 `hud.css` 的顶排（对抗赛那排还带着比分和区域标签），而且 Boss 战里顶上一排已经被 HP 条和阶段牌占了；题条挪到左垫子上方以后列顶就是钟那排的底边（约 45 px），题和提示还能折行不省略。代价：题条不在正中，眼睛要往左上看；Boss 战里打字时题条从 44 px 开始（顶上一排在它上面）。
6. **Boss 条缩到钟的左边**：`--u` 4.4 px（约 229 × 33，原来 360 × 53），名字和百分比的字跟着变小（约 9–10 px）；阶段牌字 12 px。没有把 HP 条整个藏起来（它在打字时也该看得见）。竖屏和桌面不变。
7. **名牌让位的范围**：任务书说「题物在时」；我让对抗赛 / 小考题物放好且没答、对抗赛和 Boss 的打字蟹在、Boss 回声亭板框住时都让，而且连屏外的箭头一起（回声亭时它们贴在屏底压着板的按钮）。让位就是透明 0.2 s，不挪。答了 / 换题 / 离开都回来。
8. **Boss 第二句写句的打字机比取景大约 6%**（第一轮 W 段：311 px，计划约 297 px；键盘托前沿出屏 2 px）。查过：船体和取景的朝向一样（2.65 / 2.65）、镜头停稳了；没查到底（可能她在 Boss 甲板的斜面上，或者打字蟹跟着她滑了一点）。改法是保守的：底边多留 14 px（列卡的是宽，不费大小），对抗赛的打字位姿改成跟船体（解谜一直这样）。改后 W 段没有再单独复跑过——见实测表最后一行的复跑。
9. **`:has()`**：Boss 战打字时题条下移用了 `:root:has(.iw-hud .iw-bb:not(.is-off))`（iOS 15.4 / Chrome 105 起有）；App 最低 iOS 16，没问题。别的都是类名。
10. **触摸**：中间那列不吃键盘的触摸，手指落在那里照旧给触屏层——打字时她站着（站点清意图），左 44% 冒出来的摇杆不会让她走；跑酷滑行段里滑动本来就不算（`_apply` 在滑行段直接返回）。没加「打字时中间那列什么都不做」。
11. **跑酷竖屏那一条红**：竖屏的跑酷这一期一行没变（`glide.js` 竖屏仍走 `frameFor`，`typingColumn` 竖屏返回 null，横屏 CSS 只在横屏媒体查询里）。那一题是「写句 + 提示」：提示让题条多一行、带子变了、镜头换到新机位要缓 0.8 s（`cam.js`），审计在提示后约 0.46 s 量的。拿 dev `08a48ff` 的拷贝配同一个审计复跑：同一题同一条红（高 9 px）——dev 上就有，多半是量在镜头缓过去的半路；没追（跑酷的审计 / `glide.js` 归 play-4）。
12. **顶上一排的右端**：阶段牌（474–693 × 7–38）的右端正好在暂停键（672–720 × 38–86）上沿的上面，挨着、不叠（审计的「互不相交」只核题条 / 钟 / HP 条 / 阶段牌 / 打字机，没核触屏顶键和「0 p」）。刘海机上触屏键会往左挪约 47 px，那时阶段牌的右段正在暂停键上方——真机看一眼（IELTS-Base BACKLOG 的条目里加了「钟、暂停键都在安全区」）。

**没做的**：
1. **真机**：帧时间（PLAY §7 的 p95 对比：这一期只改了 DOM 位置和相机位姿，没有新绘制，没量）、刘海一侧的安全区、横竖切换时取景跟上（站点每 0.4 s / 转屏时重算）、`requestGeometryUpdate` 转回竖屏——IELTS-Base 的 BACKLOG 有条目。
2. **`touch.js` 竖横逐屏审**（PLAY §9 第 7 期的另一半）：这一期只审了三处打字、Boss / 对抗赛的顶上一排和回声亭；菜单、装备、结算等的横屏没逐屏过（`touch.js` 在 App 里本来就不出「请转屏」）。
3. `app/game/` 没同步（任务书：这一期不同步）；IELTS-Base 那边只改了 iOS 外壳。
4. 桌面 1280 × 720 没进浏览器（键盘也是分体，Node 里算打字机约 460 px、字 27 px，封顶）；iPad 横屏（1180 × 820，不是「手机横屏」的媒体查询：题条不挪、列顶是题条底）只在 Node 里算过。
5. 横屏没跑「扣住」（写句差一点 → 题条上「我的写法也对 / 继续」两个 44 pt 的按钮）：`--near` 没开，左上角那块题条（约 180–260 px 宽）里两个按钮能不能并排、会不会挤到列里，只按 CSS 推过（按钮可折行），没在浏览器里看过。
6. Boss 的泡泡盾在打字机位前面（粉色的球罩着键盘，play-5 拿不准的 7 给 Boss 也加了盾）——不是这一期的，截图里看得见，没动。

**交接**（INKWAVE 分支 `play-7`：`85abdf4` → `1fd3955` → `f74def9` → `d316cd6` → 文档；IELTS-Base 分支 `ios-landscape`：`af3f385`；都没推）：
- **先看哪些文件**：`src/learn/play/type/keys.js`（`splitLayout`、`KB.split`）→ `src/ui/play-keys.js`（`.iw-pk__half`、`rect()`、`--iw-pk-side`）→ `src/learn/play/type/split.js`（`splitFrame`、`SPLIT`、`GLYPH_EM`、`SHEET_ENDS`）→ `src/learn/play/landscape.js`（横屏手机的 CSS、`typingColumn`、`hudBand`）→ 三个站里带「play-7」的几行（`wire/type.js _band / _typeFrame / warm`、`runner/glide.js _column / _framed / warm`、`arena/type.js _toWorld / _pose / warm / clear`）→ `arena/host.js`（名牌让位、回声亭 `bandFor`）；审计 `tools/learn/land-measure.js`、`wire-audit.mjs landCheck`、`runner-drive.js`（横屏那一段）、`arena-audit.mjs`（横屏字弹、顶上一排、回声亭板、名牌）；测试 `tests/learn/play-7.test.mjs`、`type-keys.test.mjs`。
- **给合并的人**：和 `play-6` 的交集只有 `arena/type.js` / `arena/host.js`，改的段落不重叠（见「动了别人地盘的」）；合并后 `versus2` / `coop2` 用 `ArenaType` 的打字在横屏也走分体和 `splitFrame`（不用改）。`docs/LEARN.md`：play-6 应该写 §25，这里是 §26，合并时两节各自保留。
- **接口**：`keys.rect()` → `{ top, h, split, mid: { x0, x1 } | null, halves }`；`typingColumn(keys)` → `{ W, H, top, bottom, x0, x1, shelf }` | null；`splitFrame(col)` → `{ pos, look, fov, fits, score, px: { y0, y1, x0, x1, h, glyph, head, row } }`（打字蟹坐标，`fov` 交给 `PlayCam` / `runner/cam.js` 的 `zoom`）；`G.hud.markerYield(bool)`；`BoardWalk.bandFor = (aspect, W, H) → band`。
- **已知坑**：① 审计里 `--max` 截短的那一关会记一条「gates opened 0 / 2」——审计自己的，不是游戏的；② 键盘的滑入是墙钟上的 CSS 过渡，审计照旧关掉；③ 题条的滑入动画在冻时钟下可能停在透明的开头（`land-measure` 不按透明度判题条）；④ `splitFrame` 第一次搜一种屏约 15–80 ms（Node），三个站都在 `warm()` 里先算；转屏以后第一次会再搜一次。

## 27. play-8 交付（2026-10-17，分支 `play-8`：删卡片 + 判分合成一条 + 整天从头跑到尾 + 桌面 + 已知小毛病——PLAY §9 第 8 期）

**先读了什么**：PLAY §1（12 条）、§4 表、§5.3、§9 第 8 期、§10、§11；本文 §18–§25 每节的「拿不准的 / 没做的 / 交接」（任务书的清单就是它们：§22 更新 5 的墨球出界、§23 拿不准的 11 的 halyard 起跑台、§24 交接的「四份同签名的 `_judgeRecord`」和 `_wordPool`、§24 拿不准的 1 的备战板、§25 拿不准的 2 / 交接的 `edges` / `settle` 和 ▶）；`flow.js`、`forms/*.js`、`play/**` 里每一处 `LEARN.play` / `hold` / `paused` / `hud.ask`；play-7 的工作树（只读：它改横屏取景、键盘、HUD 的钟和名牌，我这边一行没碰这些）。

**先定的**：
1. **证据快照先做、在基线上跑**（`tools/learn/evidence-snapshot.mjs`）：三周全部计分条目 × 六种形式（解谜、跑酷、对抗赛 + 小考、Boss、versus2、coop2）× 对 / 错 / 差一点 / 提示（键盘的、道具的）/ 扣住了再自认 / 扣住了继续 / 翻牌认识 / 不熟再打 / 换问法对错 / 回炉，每个用例在一个只有该形式原型 + 它的 `_judgeRecord` 要读的字段的替身上调用**各形式自己的** `_judgeRecord`，记下每次调用的 `first / held` 和最后的证据叶子；`Date.now` 钉死、每个用例自己的随机种子，输出排序后的 JSONL + sha256。基线在 `55c8343` 的拷贝上用同一个工具跑（工具只读不改游戏代码）；删卡片、合判分、修毛病每一步之后重跑，**128 270 个用例逐字节相同（sha256 `bae04357cce84ce7e99063b42daac9beeea48e1891152424fd543dcfc423c84f`）**——这是硬指标。
2. **一条判分路** `src/learn/play/judge.js` `judgeRecord({ item, p, ans, o, store }) → { r, first, held, self, hinted, evidence }`（纯函数）：判（`o.judged` 或 `judgeAnswer`）→ 扣住（`o.hold` + `canClaim`：不写、不算首答）→ 她的决定（`o.decided` + `o.claim` → `claimJudge`，站得住就是 `S`，否则照原样 `W`）→ 提示（`p._hinted` 或 `o.hinted` → `H`）→ 翻牌（`p._flip` → `F`）→ `store.recordFirst`。各形式的 `_judgeRecord(g, item, p, ans, o)` 只剩自己的东西：传什么 `o`（解谜原样传站点给的；跑酷和 Boss 永远 `hold: true`；对抗赛 / versus2 / coop2 只传 `judged / hinted`）和之后的队列 / 锁 / 再问一次 / 回炉 / 效果。
3. **对抗赛的备战 = M6 展板 + 走路，比赛不停**（PLAY §4「课文 · 对抗赛：M6（备战时）」；§24 拿不准的 1）：`match.paused` 不动；区域的钟顶在下一轮的时长上（`m.time = max(m.time, roundT)`，HUD 写「备战 · 第 n / N 轮」）、第一轮的 ZoneControl 用 `winner = -1` 冻着（之后每轮开打时才新建）、机器人的大脑换成一个每帧清意图的函数（`_idleBots`：站着摆 `lobby_pose`，开打时删掉换回原来的），她自己随便走。展板一次一块立在她面前（新 `arena/prep.js` `PrepStation`，站位找法从 coop2 的线索板抽成 `board/front.js frontSpot`），题条上「下一块 n / N」「开始这一轮」；往前走 `LEARN.duel.prepWalk`（6 m，config 新键）、桌面按回车也开打。展板的内容：这一步自己的板（解谜的 `gateSpecs`：单词 / 音标 / 讲解 / 课文），没有就一块说明板；小考、回炉那一轮各一块说明板。
4. **卡片版道具赛删掉，`race.js` 留成没有卡片的基类**（`RunnerFlow` 继承它的机器人、名次、道具、`_laneFlood`）：任务书给的两条路里这条改动最小；它只剩跑酷用得到的方法（没有 `_answer` / hold / 检查点出题 / 「跳过」道具）。跑酷起跑前的阅读课文原来是卡片板，改成同一个 `PrepStation`（「出发」）。
5. **复习日翻牌**：解谜、对抗赛是翻牌靶 M8（对抗赛原来走卡片：`ArenaHost` 加了一个 `FlipStation`，`arena/m1.js arenaKind` 给 `p._flip` 返回 `'flip'`）；跑酷、versus2、coop2 本来就是字弹（`T / H`）——`design.js playOf` 照实写，PLAY §4 那一格标了「play-8 更正」。
6. **一道题没有站点接**（三周里不会发生，`design.test` / `play-wire.test` 核）：`_askNext` 不再退到卡片，`console.warn` + `learn:skip { itemId, gate, type }` 跳过它（EVENTS.md 加了一行）。
7. **整天怎么跑**：SwiftShader 下一天要一个小时上下，锁是两个子代理共用的，所以分段：每段 ≤ 15 分钟，到点在题和题之间停，报告里写下一段从哪道门的第几个条目接着（`?gate=N&skip=K`，`forms/index.js` 读 `skip`：第 N 道门从第 K 个条目开，门都答完了就是写字墙的第 K 句），所有段用同一个 Chromium 配置目录**和同一个端口**（存储按源分：换了端口就是一个空的存储——第一次分段跑对抗赛时就是这样，见实测 D5）；`tools/learn/day-run.mjs` 一段一段地起（每段自己进锁）、`tools/learn/day-check.mjs` 把几段合起来核（见测试）。

**改了什么**：
- **删卡片**：`config.js` 删 `LEARN.play`（加 `LEARN.duel.prepWalk`）；`flow.js`：构造只在解谜时建 `PlayHost`、`_place` / `_buildSigns` / `_arrive` / `_askNext` / `_altPrompt` 的开关分支只剩玩法那一支、`toCard` 和卡片的 `_answer` 删掉、出题时不再 `paused / exitLock / hold`、锁一律珊瑚色；`forms/race.js`（见先定的 4）、`duel.js`（ArenaHost 一直在、备战见先定的 3）、`boss.js`（卡片分支、`_answer`、hold、`_cardPaused`、`prep()` 删掉，回声亭照旧）、`versus2.js` / `coop2.js`（卡片分支、`_answer`、hold、`hud._ask` 删掉；coop2 没有作答方宿主时只剩线索视图，结果卡时清意图）；`forms/index.js`（`flowFor`：`race` 就是 `RunnerFlow`，`runner` 是它的别名）；`forms/ui.js` 删 `showBoard / hideBoard`；`forms/common.js` 删 `boardOf` / `BOARDED`；`hud-learn.js` 删问答卡（面板 DOM、`ask / verdict / _submit / _claimOffer / _continue / _key / _play`、键盘监听、`KIND_ZH`、锁图标），留走路条、结果卡、`playMode`、声音；`styles/hud.css` 删卡片的 CSS；`i18n.js` / `menus.js` 去掉开关；`design.js` `FORM_ZH.race = '墨浪跑酷'`、`playOf` 管到七种形式。
- **别人的文件各一两行**（见「动了别人地盘的」）：`touch.js`、`match.js`、`main.js`。
- **判分**：新 `play/judge.js`；六个 `_judgeRecord` 和 `runner/rows.js rowAnswer` 都走它。
- **小毛病**：① `run.js` `_drift` + `targets.js show({ keep })`；② `flow.js` `WORD`；③ `runner/track.js rowFit`；④ `duel.js` / `boss.js` 的 `ArenaHost` 开 `edges / settle`；⑤ `runner-drive.js xhShown` 量 `.iw-ret`；⑥ `duo/coop.js` 作答方键盘不要 ▶。
- **整天才看到的**：`board/frame.js boardSpots`（短路段不叠板）、`board/walk.js`（同一位置的两块板依次框）；`runner/runner.js _respawnRows`（问着一行幕时掉进海里，那一行不算答）。
- **合并 dev（`676cca2`，play-7）之后**：`arena/host.js` 的名牌让位（`markerYield`）也管对抗赛的翻牌卡和备战展板，这两样在她面前时准星也藏起来；`arena/prep.js` 的展板按 play-7 的 `hudBand` 取景。
- **审计**（`tools/learn/`）：删 `drive.js`、`drive-forms.js`、`play-forms*.json`、`play-desktop.json`、`play-phone.json`、`play-quiz-chain.json`、`play-audit.mjs`、`net-duo-coop.mjs`（都只会走卡片）；`net-duo.mjs` 只剩大厅、`net-duo-play.mjs` 去掉 `--play 0`；`portrait-groups.mjs` 删卡片那几组；`runner-audit` 的 forms 场景和卡片道具赛的帧时间删掉；`wire-audit` / `arena-audit` / `runner-audit` 加整天分段（`--full --profile --segment --gate --skip --out`）、每一步核 PLAY §1 第 1 条，整天时不画帧地步进（每步之后更新场景图和相机矩阵、截图前画一帧，`--render` 照旧每步画）；`runner-audit --trace a,b`（游向某段路上那几行的逐步轨迹）；`net-duo-play` 核 coop2 作答方键盘没有 ▶；新 `evidence-snapshot.mjs`、`day-run.mjs`（一段一段起、每段自己进锁、按 resume 接、一天一个端口）、`day-check.mjs`（几段报告合起来核）；三个审计加 `--port`；`wire-audit` 桌面上节拍台按键答（1–4）；`arena-audit --fast`（Boss 也不画帧）。
- **文档**：LEVELS.md（§0 原则 5、§2 开头三条、§2.2 检查点和第二次错、§2.3 备战、§5 相机 / HUD / 文字、§4 / §6.4 的「hud-learn 的输入」）、本文 §1 / §5 / §8 / §15、PLAY.md 七处「play-8 更正」、EVENTS.md（`learn:gate` / `learn:question` 的说明、`learn:skip`）。

**动了别人地盘的**：
- `src/main.js` 删 2 行（`_onPointerUnlock` 里 `learn.hold` 时重新锁指针——hold 没了）。
- `src/game/match.js` 1 行（控制器的启用不再看 `learn.hold`）+ 1 行注释。
- `src/core/touch.js`：`live` 不再看 `learn.hold`；学习局里点在题条的 ▶ / 按钮上（`.iw-ps__play, .iw-ps__act, .iw-learn__btn`）照旧让给它们。
- `src/ui/hud-learn.js` / `styles/hud.css`：任务书第 1 条要删的问答卡就在这里，所以是删，不是「只做加法」——`hud.js` 一行没动；HUD 的钟、名牌、Boss HP 条（play-7）没碰。
- `src/learn/play/board/frame.js` / `walk.js`（play-3 的）：上面那两处修补；`src/learn/play/run.js` / `targets.js`（play-1 的）：墨球出界那一处；`src/learn/play/runner/track.js` / `runner.js`（play-4 的）：`rowFit` 和掉海那一处。
- `weapons.js`、`actor.js`、`cameraRig.js`、`src/ui/play-keys.js`、`src/learn/play/type/*`、横屏取景：一行没动。
- **和 play-7 的合并**（主会话让收尾前合 dev `676cca2`）：两边都改过的 `tools/learn/{wire-audit,arena-audit,runner-audit}.mjs`、`runner-drive.js`、`styles/hud.css`、`board/walk.js` 自动合上；冲突只有 `arena/host.js` 的 import（两边都要）和 PLAY §8（App 一段照 dev、触屏一行留 play-8 更正）；合并提交 `fe9772f`。

**测试**：`npm run test:learn` 205 → 216（play-8 加 11 条），合并 dev 以后 242（dev 231 + 11）；`npm run check` 合并后 285 个文件。
- 新 `judge.test.mjs`（3）：`judgeRecord` 的约定（对、当天第二次是练习、键盘提示 / 道具提示 → `H`、翻牌 `F`、扣住不写 → 自认 `S` / 继续 `W`、没有 `o.hold` 不扣、`o.judged` 就是判定）；**各形式 vs `judgeRecord`**：第 1 周每个计分条目 × 六种形式 × 对 / 错 / 提示 / 差一点扣住 / 自认 / 继续（3 000+ 个用例），形式自己的 `_judgeRecord` 写出的叶子和「同一答案、这个形式的约定」下 `judgeRecord` 写出的一样、扣不扣也一样；源码：`src/learn` 下只有 `play/judge.js` 调 `recordFirst`，六个形式的 `_judgeRecord` 各调一次 `judgeRecord`。
- 新 `play8.test.mjs`（5）：源码里没有问答卡、`LEARN.play`、`learn.hold`、`hud.ask / verdict / showBoard`，`src/learn` 下 `paused = true` 只在 `_results`；触屏层让开题条按钮；三周每个对抗赛日每一轮的备战展板都排得出来（字 ≥ 54 画布像素）、小考 / 回炉是说明板；机器人在备战里是大脑换掉（清意图）不是暂停、开打换回；打字单词的回炉选择只有单词（三周 × 解谜 / 跑酷 / 对抗赛，旧代码上这条失败：`Saturday and Sunday` 当干扰项）；跑酷掉进海里时只有她前面挂着的那一行幕按「没答」处理。
- `design.test.mjs`：三周每个条目 × 七种形式 `playOf` 有值、不是卡片、`answer` 和 `meta.input` 对得上（翻牌是 `self`）、§4 表的 `record` 用 `judgeRecord` 写出的叶子核。
- `runner-track.test.mjs` +1（合成的窄坡 / 窄台阶在读题区末尾：不放行；平而窄、宽而高、矮于 0.9 m、4 m 以外：照放）；`play3-board.test.mjs` +2（短路段的展板、同一位置两块板）；`forms / duo / play-arena / play-wire / play3-flip / play4 / runner-glide / runner-answer` 改成没有卡片的说法（`boardOf` → `gateSpecs`、`_answer` → `judgeRecord`）。
- **证据快照**：见先定的 1——基线和每次改动后逐字节相同，合并 dev 以后在合并的代码上再核一次，也相同（128 270 个用例，sha256 `bae04357…`）。

**实测**（浏览器：一次一个 `flock -w 9000 /tmp/ielts-browser.lock nice -n 10`，Chromium + SwiftShader、`?quality=low`、阴影 / 泛光关、冻时钟步进、竖屏 390 × 844 触屏（`&from=app`）；整天的都经 `tools/learn/day-run.mjs` 起、`day-check.mjs` 合起来核；报告和截图在主会话草稿目录的 `play8-out/`、`play8-shots/`，不进仓库；2026-10-17 UTC）：

| 轮 | 跑的什么 | 结果 | 看到的 / 改的 |
|---|---|---|---|
| s1 | 解谜 w1d1 短关门 1–2（合并前，删卡片之后的第一次） | 1 条失败 | 门 2 第一题 `w:monday` 的第三颗墨球标签出右边 31 px——已知小毛病 ①，复现；布局在安全区里，投影整排右移 54–64 px：镜头在墨球放下以后又挪了 0.58 m、转了 3.9° |
| s2 | 同上，`run.js _drift` 之后 | 全过 | 镜头停稳 0.5 s 后重排一次（`relaid dp 0.578 dq 0.068`），四颗都在安全区里 |
| d1 | 解谜 w1d1 **整天**（第一次） | 在门 1 前停了 600 s | 门 1 的 4 块音标板有 3 块叠在一个位置，框住的永远是第一块、自动走一次次停在那里——`boardSpots` / `BoardWalk` 修了（「改了什么」） |
| s3 | 对抗赛 w1d6 短关，竖 + 横，各 2 题 | 全过 | 备战：展板在她面前、题条「开始第 1 轮」、`paused` 假、没有 hold / 面板、机器人站着（大脑关）；之后照旧出题、点射、区域涂墨 |
| s4 | 跑酷 w1d3 短关（默认的错 / 对 / 空 / 对） | 结果卡 6 / 6、第 1 名；采样 1 047 步没破；2 条审计报错 | 写字墙那一段第二句（按「提示」以后）打字机的纸顶在题条下沿上面（纸 187–230 px、题条底 239 px）——跑酷竖屏的打字取景，不是这一期的地盘，记在交接 |
| s5 | 合作赛 coop2 w2d5 竖屏（两个页面 + 中继） | 56 / 56 | 新加的检查：作答方打字时键盘上没有 ▶（3 题都核了）——已知小毛病 ⑥ 在浏览器里核过 |
| s6 | 联机赛 versus2 w1d1 竖屏 | 33 / 33 | 删卡片之后照旧 |
| D1 | 解谜 w1d1 **整天**（合并前；之后的整天都不画帧地步进） | **一段 417 s 跑完，day-check 全过** | 85 题（节拍台 16、墨靶 34、字弹 35）、14 块展板、8 / 8 道门（含写字墙）、出口（回声亭说完、打卡垫）→ 结果卡；PLAY §1 第 1 条采样 4 618 步没破；60 个计分条目各一次首答（另 25 次是「单词第二遍」的练习）、60 片叶子；控制台 0、4xx 0。截图里门 2 那一题四颗墨球都在屏里（①） |
| D2 | 跑酷 w1d3 **整天**（halyard，合并前） | **一段 391 s 跑完，day-check 全过** | 52 行车道 + 35 题滑行段打字 → 结果卡「60 / 85 题做对 · 58 / 60 首答答对 · ★★★ · 第 1 名 · 9:00」；采样 8 026 步没破；首答 60 个各一次。**2 行**她划到了对的道、记的却是错（`w:kind`、`q:w1d3:a3:mv5i4q`，都在这一圈的 75.1 m）；起跑台坡下那一行（9.9–10.3 m）8 次都到了 |
| D3 | 跑酷 w1d3 整天（合并后，`--trace 68,80`） | 同 D2（同样那 2 行） | 轨迹：中间高台的台阶下来是窄坡，她往外道转向时从坡边掉进海里（y −1.6，卡住），海「泼倒」她、`_respawned` 把她放回路中线、latT 0，从第 1 道游过去 → 记成 [0, L]。改：回来时还挂着的那一行按「没答」（`_respawnRows`） |
| D7 | 跑酷 w1d3 整天（掉海那一行改成「没答」以后） | **一段跑完，day-check 全过** | 那 2 行变成 `learn:noanswer`（她又掉了海、回来以后那一行不算）、马上再来一次、都答对了：结果卡「60 / 85 题做对 · 一道锁都没有 · 60 / 60 首答答对 · ★★★ · 第 1 名 · 8:58」，没有一个错的首答；52 行 + 35 题打字；采样 8 007 步没破；控制台 0、4xx 0。截图 `play8-shots/runner-w1d3-portrait/`（D3 那次的：第一行、看板、打字的三个阶段） |
| K1 | 桌面 1280 × 720 解谜 w1d1 门 1 两题（键鼠） | 第一次：节拍台没答 | 审计照触屏用鼠标点台子——桌面上鼠标是镜头的；台子的键是 1–4 / A–D / 方向键，审计改成按键 |
| K2 | 同上（按键） | **全过** | 展板框住、两题节拍台按数字键答对、首答各一次、没有面板 / 暂停 / hold。截图 `play8-shots/desktop-puzzle/` |
| K3 | 桌面 1280 × 720 跑酷 w1d3 两行（键：A / D 换道） | **全过** | 看板段、两行拍子行都进了对的道、首答各一次；采样 224 步没破；控制台 0、4xx 0。截图 `play8-shots/desktop-runner/` |
| D4 | 对抗赛 w1d6 整天（合并后），第 1 段 | 34 题、7 条失败 | 失败都是 play-7 新加的「名牌让位」检查：`is-yield` 已经在、名牌透明度还在 0.04–0.49——CSS 过渡是墙钟 0.2 s，不画帧的步进到得太快；审计改成量之前等 350 ms |
| D5 | 同上，第 2 段（门 3 第 2 个起） | 31 题全过、看门狗截断；**这一段的存储是空的** | 最后一轮（「单词第二遍」25 个）里到了 780 s 不停段（审计原来「最后一轮不停」），870 s 看门狗——审计改了。day-check 把两段合起来核出 `w:school` 等 10 个词首答记了两次：第 1 段已经写过 [1, L]——三个审计每次起服务用随机端口，localStorage 按源分，同一个配置目录里第 2 段看到的是新的空存储（每段自己的「首答一次」核的是它自己看到的存储，所以没核出来）。审计加 `--port`、`day-run` 一天用一个端口；对抗赛整天重跑 |
| D6 | 解谜 w1d1 **整天**（合并 dev 以后） | **一段 421 s 跑完，day-check 全过** | 同 D1：85 题、14 块展板、8 / 8 道门、出口 → 结果卡「这一关走完了 · 60 / 85 题做对 · 一道锁都没有」；采样 4 637 步没破；60 个首答各一次、60 片叶子；控制台 0、4xx 0；墨球重排两次（镜头停稳后又挪了 0.10 m）。截图 `play8-shots/puzzle-w1d1-portrait/`（每种玩法一张 + 结果卡） |
| D8 | 对抗赛 w1d6 **整天重跑**（合并后，同一个端口） | **两段，day-check 全过** | 第 1 段 33 题（门 1 的 8 个音标；门 2 的 25 个词问到第 14 个这一轮就结束了——区域倒数数完，LEVELS §2.3 的规矩；门 3、门 4），停在题和题之间；第 2 段从门 5 接着（存储接上了：33 → 45 片叶子），26 题（门 5、门 6，门 7「单词第二遍」15 个——都是门 2 问过的词，练习），到结果卡（这一段自己的一关：「26 / 36 题做对 · 0 / 3 轮区域赢了」）。两段每轮之前都是备战展板、比赛不停、机器人站着；采样 2 632 + 2 693 步没破；45 个首答各一次；控制台 0、4xx 0。门 2 没问到的 10 个词这一天没有首答（区域赛的一轮会在题问完之前结束——设计如此，day-check 只列出来）。截图 `play8-shots/duel-w1d6-portrait/` |
| P1 | 对抗赛 w1d6 短关，竖 + 横，备战展板升起、镜头框住以后再截图（每步画） | 全过 | 展板（音标板 /ts/ /dz/）立在她面前、框在题条下面，题条「备战 · 第 1 / 2 轮 · 开始第 1 轮」；截图上准星压在板子的字上 → 翻牌卡 / 备战展板在她面前时也藏准星（`arena/host.js`，同打字蟹） |
| P2 | 同上竖屏（藏准星以后） | 全过（新检查「备战展板上没有准星」） | 截图 `play8-shots/duel-prep/duel-portrait-prep.png`（横屏那张是 P1 的 `duel-landscape-prep.png`） |
| B1 | Boss w1 整局（合并后，不画帧） | 一段 12 分钟打完：结果卡「第 1 周周考打完了 · 43 / 43 题做对」（L 20 / 20、R 20 / 20、W 3 / 3、S 6 / 6 张说完）；采样 5 657 步没破；首答 43 个各一次、43 片叶子；控制台 0、4xx 0；56 次出题里 7 次第一发点射打空（随它的「答对了 / 首答 / 掉血」各算一条，共 29 条）、4 次墨球框出安全区 | 打空：墨弹带标记发出、没有命中记录——没答、没写，这一题再出一次就中了。出界：不画帧时挂在走动 Boss 上的球落后一步，Boss 改回每步画（B2 里出界没再出现）；打空 B2 每步画也有，见下 |
| B2 | Boss w1 短关、每步画、3 题（为了截图和对照） | 3 题里 2 题第一发点射打空（再出一次就中） | 这就是 §24 拿不准的 11 的「Boss 弱点上偶尔第一发点射没有命中」——不是这一期带进来的，也不是不画帧带来的，只是整局里比 §24 的短关看到得多；打空从来不记证据。截图 `play8-shots/boss-w1-portrait/` |
| B3 | Boss w1 **横屏** 844 × 390、从 R 段起、每步画（已知小毛病 ⑦，合并 dev 以后：play-7 的横屏取景在里面） | 一段 13.7 分钟只答了 3 题（R 的两个打字词 + 一题横幅），**全过** | 打字机 293 px 高（≥ 240）、键盘拆两半（中间那列 270–574 px）、打的字 17.9 px、题条 / 钟 / HP 条 / 阶段牌 / 打字机互不压、准星藏、名牌让开。每步画的横屏 Boss 一题 3–4 分钟，整段跑不完——剩下的用 B4。截图 `play8-shots/boss-w1-landscape/` |
| B4 | 同上，R / W / S 三段整段、不画帧（`--fast`） | 一段打完：结果卡「第 1 周周考打完了 · 23 / 23 题做对」（R 20 / 20、W 3 / 3、S 6 / 6 张说完）；采样 3 367 步没破；首答 23 个各一次、23 片叶子；控制台 0、4xx 0；4 条失败 | ① 一次墨球框出安全区（不画帧时球落后走动的 Boss 一步，B1 同）。② 两次「钟和 HP 条 / 阶段牌叠了」：Boss 的钟有时写着段名（「R 阅读 · 词汇 · 语法 · 13:20」，213 px 宽），play-7 放在钟两侧的 HP 条和阶段牌按窄钟摆——横屏 HUD 那一排，play-7 的地盘，没动，记在交接。③ W 段一句长句的纸（452–679 px）伸到右半块键盘上（中间那列到 574 px）——横屏打字取景，同上 |

**PLAY §1 的 12 条**（卡片删了，没有开关可言）：① 不暂停 / 不定身 / 不弹面板 ✓——源码扫描（`play8.test`：没有问答卡、没有 `learn.hold`、`src/learn` 下 `paused = true` 只在 `_results`），审计每一步采样（整天每种形式几千步，一次都没破：实测）；对抗赛的备战也不停了；打字时站着是站点清意图（play-wire 起就这样），不是定身。② 判分一条路 ✓——`play/judge.js`，源码扫描只有它调 `recordFirst`。③ 证据如实 ✓——快照逐字节相同；§4 表的记法 `design.test` 核；跑酷掉海那一行不再记成她没选的答案。④ 节奏不等于对错——没碰（`play3-beat` 照过）。⑤ 没有误答——没碰判定；跑酷掉海回来的那一行按「没答」（同穿空隙、同超级跳越线）；对抗赛审计前两道墨球题照旧核「普通一枪不算答」。⑥ 不惩罚——锁一律珊瑚色（原来卡片关时也是）。⑦ 中文——用到的字符串都留着（题条、展板、i18n）。⑧ 不加素材 ✓——没有新文件以外的东西（代码和审计）。⑨ 画风流畅——没有新的绘制；备战展板是现成的 `BoardWalk`。⑩ 竖横 ✓——整天跑的是竖屏；对抗赛备战竖横都跑了短关；Boss 的 R / W 段横屏整段跑（实测）。⑪ 内容一条不少 ✓——`design.test` 三周每个条目 × 七种形式都有玩法、没有 `card`。⑫ 开关可退——按 PLAY §9 第 8 期删了（PLAY §1 第 12 条标了「play-8 更正」）。

**拿不准的（自己定了，请主会话过目）**：
1. **`hud-learn.js` 是删不是加**：任务书第 1 条要删的问答卡 / `clue` 卡就在 `hud-learn.js` 里，「`hud*.js` 只做加法」我理解成别动 HUD 别的东西（`hud.js` 一行没动、钟 / 名牌 / Boss HP 条是 play-7 的）。卡片的 CSS 同理从 `styles/hud.css` 删了（只留 `@keyframes iw-learn-in`，结果卡还用）。
2. **快照里少了解谜的「道具提示」用例**：`judgeRecord` 对每个形式都认 `p._hinted`（道具墨雨），原来解谜的 `_judgeRecord` 不认——解谜里没有道具（`flow.js` 没有 `bag / useProp`），这条路走不到，所以快照工具对解谜不跑这个用例，基线在 `55c8343` 上用同一个工具重跑。其余用例两边一字不差。
3. **`o.self` 没有了**：原来的卡片路有一个 `o.self`（卡片上的「我的写法也对」直接给）；玩法里自认只经「扣住 → 她点了 → `decided + claim`」这一条，`claimJudge` 站不住就照原样记 `W`。卡片删了，`o.self` 没人传，就没留。
4. **跑酷 / versus2 / coop2 的复习日是打字**（先定的 5）：PLAY §4 写的是 M8；照代码现状（play-4 / play-6 起就这样）改了 PLAY 的那一格而不是改代码——在跑酷的车道上翻牌、两个屏幕同时自评都不顺。
5. **对抗赛的复习日翻牌**：原来对抗赛 w1d7 的 150 张走卡片，现在是 `ArenaHost` 里的 `FlipStation`（解谜的 `wire/flip.js`，挂在区域题簇的锚点前）；浏览器里只在 Node 测试里核了机制 / 证据 `F`，整天的对抗赛跑的是 w1d6。
6. **备战怎么「不停」**（先定的 3）：顶钟、冻第一轮的区域、换掉机器人的大脑（每帧清意图）——没有动 `match.paused`、`zones.js`、`bots.js`；走 6 m 开打是我定的数（展板 1.7 m 在她面前，走过板子再多走一点）。桌面上鼠标被镜头占着（射击时指针锁定），所以加了回车。
7. **跑酷起跑前的阅读课文**：原来是卡片板（`LEARN.play` 关时）/ 板 + 「出发」，现在统一用 `PrepStation`（同对抗赛的备战），镜头位用它的 `pose`；起跑前没有别的看板。
8. **`_askNext` 没有站点就跳过**（先定的 6）：理论上会少问一题（不写证据）；三周里测试核过不会发生。
9. **`?skip=` 从 `location` 读**（`forms/index.js skipOf`），没经 `main.js` 传参——为了不动 `main.js`；只有审计用。
10. **`FormsUi` 的展板和 `boardOf` 删了**：它们只给卡片版的备战 / 看板段用；对抗赛的备战改用解谜的 `gateSpecs`（同一份内容画成 M6 板）。
11. **删掉的审计**：`drive.js`、`drive-forms.js`、`play-*.json`、`play-audit.mjs`、`net-duo-coop.mjs`、`portrait-groups.mjs` 的区域 / 关卡 / versus2 / Boss 组——它们只会点卡片，改成玩法等于重写，而 wire / runner / arena / net-duo-play 已经各管一种形式；`play-quiz-chain.json`（解谜结果卡 → 小考）没有重做成玩法版：小考在 `arena-audit --form quiz` 里跑，结果卡上那个按钮这一期没在浏览器里点过。
12. **`rowFit` 的 4 m / 0.9 m**：七张舞台的行数只动了一点（tidewater / saltpan / crossmarket / lockgate 不变，kelpline 四道行 39 → 36、terraces 33 → 30、halyard 29 → 31，terraces 的终点 1994 → 2049 m）。整天跑酷 w1d3 在 halyard 上：起跑台坡下那一行（这一圈的 9.9–10.3 m，§23 拿不准的 11 说的那个位置）8 次都到了她划的道；出问题的是另一处——中间高台的台阶和窄坡下来的那一行（75.1 m），见 17。Node 里 halyard 的起跑台是跳边、本来就不放行，这条规则在 Node 的七张舞台上挡下的是别处的窄坡。
13. **墨球重排是一跳**：`_drift` 在镜头停稳 0.3 s 后把题物按停住的镜头重排一次（最多两次），不是平滑跟过去；她自己转镜头、走开、瞄了以后就不再动。重排的那一下在截图里看不出来（题物还在弹出动画里），但真机上可能看得到一下位移。
14. **⑥ 藏 ▶ 是藏，不是给作答方一个能放的东西**：coop2 作答方的键盘去掉 ▶（`K.onReplay = null`、`K.replay = false` + `layout()`），录音只在线索方那边；浏览器里核过（实测 s5，三题打字都没有 ▶）。
15. **整天里同一个词问两次**：单词展板那道门问一次（选义 `L`）、「单词第二遍」再打一次（`T`）——第二次是练习、不是首答，这是课程本来的样子（`store` 照旧只认当天首答）；审计按「这一题之前今天有没有它的叶子」核。
16. **整天审计不画帧**（`--full`）：SwiftShader 下画一帧比模拟一帧贵得多，整天每步都画就跑不完；每步之后更新场景图和相机矩阵（投影、取景、可见性都和画的时候一样算），截图前画一帧。代价：只在画的时候才出的毛病（着色器、贴图上传）整天里看不到——短关的审计（每步都画）照旧在，截图也都是真画出来的。play-7 的「名牌让位」检查量的是 CSS 过渡（墙钟 0.2 s），不画帧时到得太快，对抗赛第一段因此记了 7 条假失败（`is-yield` 已经在、透明度还在 0.04–0.49），之后量之前等 350 ms 墙钟。
17. **跑酷掉海那一行按「没答」**：只管「回来时还挂着的那一行」；她为什么会从窄坡边掉下去（行放在高台台阶和窄坡下面、外道在水上，`_bounds` 在行前 9 m 就按助跑起点的宽度斜着瞄）没改——把 `rowFit` 的读题区检查拉到 9 m / 0.6 m 能挡住它，但七张舞台的四道行会少很多（saltpan 35 → 21、lockgate 出 5 行两道），我没这么做。
18. **对抗赛一天里有 10 个词没有首答**：w1d6 整天（实测 D8）门 2 的 25 个词问到第 14 个这一轮就结束了（区域倒数数完——LEVELS §2.3「倒数到 0 也是一轮的结束」），门 7「单词第二遍」又问到第 15 个结束，问的是同样的前 15 个词——剩下 10 个（w:colleague、w:boss、w:salary、w:interview、w:experience、w:skill、w:career、w:apply、w:manager、w:part-time）这一天在对抗赛里一次都没出：55 个计分条目里 10 个没有证据。按代码读是 play-5 起就这样（不是卡片删掉带来的），但没在 `55c8343` 上跑一整天对照过；要不要让一轮问完再结束（或下一轮先问上一轮剩下的），请主会话定。**主会话 10-17 定了「下一轮先问上一轮剩下的」**：`forms/common.js carryLeft`——一轮被区域倒数截断时，没问到的题接到下一轮队列的最前面（也接进它的 `items`，题簇的图集是按 `items` 画的）；最后一轮剩下的另开一轮「剩下的题」（`gate:rest`，只开一次，它自己剩的不再接），回炉门照旧跟在后面。LEVELS §2.3「倒数到 0 也是一轮的结束」不变，变的只是题不丢。Node 测试在 `forms.test.mjs`。**实测（10-17 14:40，w1d6 整天一段跑完，1 819 s）**：80 题到结果卡，**55 / 55 计分条目都有首答**（之前 45 / 55），全程 7 394 个采样步 `paused` 为假、没有面板，0 报错、0 4xx。审计上两条要知道：① 分段跑（`day-run` 的 `--gate N --skip K`）每段是新页面，上一段轮结束时接过去的题新页面里没有，所以分段跑会少 2 个（53 / 55）——核覆盖要一段跑完（`--segment 3300`）；② 区域倒数在一题正问着的时候数完，这一题随轮结束收掉、接到下一轮再问（q67 `w:major`：审计那 6 条红是它期望当场答完，不是游戏的错）；要不要让正问着的那一题答完再结束一轮，留给下一版。

**没做的**：
1. 帧时间对比（PLAY §7）、真机、TestFlight：没做（浏览器时间都给了整天）。
2. 跑酷掉海本身：只修了证据（那一行不算答），没改放行 / 转向（拿不准的 17）；halyard 中间高台下来那一行每圈会让她掉一次海、重来一次。
3. 跑酷竖屏写字墙那一段按「提示」以后打字机的纸顶到题条上面（实测 s4）——跑酷的打字取景（`runner/glide.js`），play-7 / play-fix 的地盘，没动。
4. versus2 / coop2 整局没跑（只跑了竖屏一局的短关）；解谜结果卡上的「今日小考」按钮这一期没在浏览器里点过（`play-quiz-chain.json` 删了，没重做）。
5. 对抗赛复习日（w1d7）的翻牌站（`FlipStation`）只在 Node 里核过机制和证据，整天跑的是 w1d6。
6. 桌面只跑了任务书要的两段（解谜第一道门两题、跑酷两行）；桌面的「鼠标看」是审计直接设镜头的 yaw / pitch 再开火（无头浏览器没有指针锁定）。

**交接**（分支 `play-8`，没推；从 dev `55c8343` 建出，收尾前合了 dev `676cca2`）：
- **做到哪**：卡片的代码路径没有了，玩法是唯一的路；判分一条路（`play/judge.js`），三周 × 六种形式的证据快照和 `55c8343` 逐字节相同（合并后也是）；小毛病 ①–⑥ 修了、⑦ 在合并后的代码上跑了（实测 B3 / B4：R / W / S 整段打完；两处横屏 HUD / 取景的小毛病交给 play-7 的人，见已知坑）；解谜、跑酷、对抗赛、Boss 都在浏览器里整天 / 整局跑过（实测表）。
- **先看哪些文件**：`src/learn/play/judge.js` → 各形式的 `_judgeRecord`（`flow.js`、`runner/runner.js`、`forms/{duel,boss,versus2,coop2}.js`）→ `src/learn/forms/duel.js` 的备战（`_startPrep / _prepSpecs / _showPrep / _idleBots / _roundStart`）→ `src/learn/play/arena/prep.js`、`board/front.js` → `tools/learn/day-run.mjs` / `day-check.mjs` / `evidence-snapshot.mjs`。
- **接口**：`judgeRecord({ item, p, ans, o: { judged, hinted, hold, decided, claim, at }, store }) → { r, first, held, self, hinted, evidence }`；`ArenaHost.showPrep(specs, { head, go, onGo })`、`ArenaHost.facingYaw(g, a)`；`PrepStation(host)`（`show / update / pose / tapApi / clear / debug / dispose`，宿主要 `flow / match / strip / reduced / say / facingYaw / m1._topKeys`）；`frontSpot({ a, base, spec, bw, W, H })`；`LEARN.duel.prepWalk`；事件 `learn:skip`；审计 `?skip=K`（`forms/index.js`）。
- **怎么再跑整天**：`node tools/learn/day-run.mjs --name <n> --dir <dir> --form puzzle|race|duel|boss --learn w1d1 [--shots <dir>] -- tools/learn/wire-audit.mjs --view portrait --learn w1d1 --full --segment 780 --budget 870`（对抗赛 / Boss：`arena-audit.mjs --form duel|boss --learn … --views portrait --full --segment 780 --budget 870`；跑酷：`runner-audit.mjs --scenario runner --w 390 --h 844 --touch --query '?learn=w1d3&kind=race' --plan right --glidePlan right --segment --wallMs 660000 --timeout 870`）——它自己一段一段进锁；中途断了用 `--from k --gate N --skip K` 接着。改了判分相关的东西就跑 `node tools/learn/evidence-snapshot.mjs --out <f>`，和基线 `cmp`（基线要在改之前的提交上用同一个工具跑）。
- **已知坑**：① 整天审计不画帧（拿不准的 16），只看「画出来」的东西用短关；Boss 照旧每步画（横屏太慢时用 `--fast`）。② 同一天里同一个词问两次，第二次是练习——审计按「之前今天有没有叶子」核，别改回「每题都要 first」。③ halyard 中间高台下来那一行（拿不准的 17）。④ 跑酷竖屏写字墙的打字取景（没做的 3）。⑤ 分段跑一定要同一个端口（`day-run` 管；自己手起审计时给 `--port`），否则每段一个空存储、证据接不上，每段自己的检查也看不出来。⑥ Boss 弱点上第一发点射常常打空（§24 拿不准的 11；整局 56 次出题里 7 次）——不写证据、再出一次就中，没查到根。⑦ 横屏 Boss（实测 B4）：钟写着段名时（213 px 宽）压到两侧的 HP 条和阶段牌；W 段长句的纸伸到右半块键盘上——都是 play-7 的横屏 HUD / 取景，没动。

## 28. play-9 交付（2026-10-17，分支 `play-9`：发布后的第一轮修补——Boss 弱点第一发打空、横屏 Boss 顶上一排 / 回声亭板、跑酷写字墙的提示取景、halyard 掉海、双人整局、小考按钮、帧时间）

**先读了什么**：本文 §27 的「拿不准的」（11、16、17、18）「没做的」（1、3、4）「已知坑」（③ ④ ⑥ ⑦）、§24 拿不准的 11（Boss 弱点上第一发点射没有命中）、§26 的横屏取景（`landscape.js`、`split.js`、`hudBand`）；PLAY §1（12 条）、§3 M5、§5.2、§7、§8；代码：`arena/run.js`、`play/run.js` 的点射、`weapons.js` 的 `fireShooter / _aimFrom / _ballistic / _step`（只读）、`boss/bossBrain.js` 的 `_idle / _walk`（只读）、`runner/runner.js _bounds / _steer`、`runner/track.js`、`runner/glide.js`、`runner/cam.js`、`board/walk.js`、`board/frame.js`、`echo/booth.js`、`arena/host.js`、`touch.js` 的按钮排布（只读）。第 1 项（对抗赛区域倒数在一题正问着时数完）主会话在 `play-9b` 做，这边没碰 `duel.js` 的轮结束 / 倒数和 `LEARN.duel`。

**先定的**：
1. **先找根、再改**：Boss 打空在浏览器里做对照——草稿里的探针（不进仓库）在每道题上发 8–12 颗带标记的墨弹（`onHit` 只记不答）、逐帧记那颗墨弹离它那个球最近多少、怎么死的，同时记发出那一帧 Boss 的速度 / 转速、平距、弹道有没有抬枪、她朝向差多少。在 `741bfee` 的拷贝上和改完的代码上各跑一次（结果见实测 P1 / P2）。
2. **修墨弹、不修 Boss**：出题时让 Boss 站住也能修，但那是改 Boss 的行为（`boss*.js` 不是学习层的）；墨弹是她点的、只有这一颗带标记，按它自己的球每帧修正最局部（`arena/run.js`），命中照旧是 `hit.js` 的精确球体检测，判分一字不动。
3. **跑酷掉海修放行 / 转向、不修放法**：§27 拿不准的 17 说把 `rowFit` 的读题区检查拉长能挡住，但七张舞台的四道行会少很多；改成转向时不越过「外面是海」的坡边（行一行没少）。
4. **板的取景带只在键压到字时才躲键**（见拿不准的 3）。

**改了什么**（提交见 `git log 741bfee..play-9`）：
1. **Boss 弱点第一发打空**（`84d8757`、`8a24e66`）：根有两个——① 出题时 `BossFlow` 只顶住 Boss 的出招（`bossHold`），它的大脑照样走路、转身（`bossBrain._idle → _walk`：2.9 m/s、1.25 rad/s），球挂在离它中心 2–3 m 的插口上，每秒走 3–5 m；墨弹按离膛那一帧球在哪儿瞄，飞 0.3–0.5 s。② 球离枪口超过 12.5 m（平距）时 `weapons.js _ballistic` 不抬枪（`maxDist` 就是 shooter 的射程），墨弹直飞后往下掉（`bossNear` 10.5 m + 1.5 m 余量 + 侧推，平距最远到 13 m 左右）。不是命中球、不是 `_aimFrom` 的 2 m 规则（`_fire` 先把 `aimDir` 设成从枪口指向球）、不是一帧延迟（球和命中球都按上一帧画出的骨骼，自洽）。改：`ArenaRun` 记下点射发出的那颗带标记的墨弹，每帧（学习层在弹道步进之前）用新纯函数 `steerRound(p, c, v)` 把它的速度改成「剩下的路程 ÷ 它现在的速度 = 还要飞多久，按 Boss 的走路和转身（`b.vel`、`b.turn`）把球的位置往前推这么久，重力还要掉的那截补回来」正好碰到；只修它自己那颗、只朝它自己的球，答了 / 换题 / 重放（新 serial，`reg.through`）/ 墨弹没了（池子复用时 `playTag` 清零）就停；对抗赛的题簇同样修（没有提前量）。
2. **横屏 Boss 顶上一排**（`ff0b365`）：`landscape.js` 的横屏 CSS 里 HP 条和阶段牌离中线 `max(52px, 钟宽一半 + 8px)`，钟宽一半由钟上的 ResizeObserver 写到根元素的 `--iw-clock-half`（只在钟变宽变窄时回调）；横屏手机上 Boss 的钟只写段名的第一个词（`landscapePhone()`，一个缓存的 MediaQueryList；短名按门缓存）——667 宽的手机上全名的钟 + HP 条放不下。
3. **跑酷竖屏写字墙的提示取景**（`ba0b65d`）：s4 那次的轨迹是镜头还在两个取景之间过渡——① 题条底边每 0.4 s 才读一次，提示以后要等下一次才重新取景（`glide._hint` 现在马上重读，`RunnerFlow.stripBottom(true)`）；② `runner/cam.js` 两个取景之间 0.8 s 的过渡是从「旧取景在世界里的那个点」插过去，她一直往前游，旧点留在身后，镜头落后、偏到一边——现在旧取景跟着她平移（记下过渡开始时她的位置）；取景带的顶边向上取整到 0.02（四舍五入时能高过题条底边最多 8 px）。
4. **halyard 掉海**（`46fe899`）：`track.js clearWidths` 多记每个采样两边边外一格的地面高度（`edgeL / edgeR`，没地面是 NaN）；新纯函数 `fallRoom`：从她现在的位置到瞄的点，凡是路比瞄的那块地面高 / 低 0.3 m 以上（坡、台阶）而且那一边外面是「掉下去」（没地面，或比瞄的地面低 0.5 m 以上），那一边只许在路自己的宽度里；平地、外面是同一层或更高的地面（墙、栏杆、她要去的那一层）照旧斜着走。halyard 那一行在这一圈的 68.8 m（§27 写的 75.1 m 是另一种量法），坡在 59–63 m、3.8 m 高、右边外面什么都没有。
5. **横屏回声亭板**（`f7c9297`）：见拿不准的 3。
6. **审计**（`8a24e66`、`2f17b99`）：`arena-audit` 整局结束时数每道答过的选择题发了几颗带标记的墨弹（「每题第一发就中」），S 段量回声亭板的最小字（≥ 17 px），横屏打字核多记取景时的列 / 现在的列 / 船体朝向 / 镜头离取景位 / 焦距；`land-measure.js boardFont`；`wire-audit` 出口区量回声亭板的字、`--quiz`（结果卡「今日小考」→ 小考第一题）；`net-duo-play --full`（整课）；新 `perf-forms.mjs`（帧时间分两桶）；`runner-drive` 报告带 `sea`（`RunnerFlow.seaN`，掉海一次计一次）。

**动了别人地盘的**：
- `weapons.js`、`main.js`、`actor.js`、`cameraRig.js`、`touch.js`、`boss*.js`、`hud*.js`：**一行没动**（只读了）。
- `src/learn/play/runner/cam.js`（play-4）：过渡的起点跟着她走（3 行 + 注释）。
- `src/learn/play/runner/track.js`（play-4 / play-8）：`clearWidths` 多两个数组、新 `fallRoom`；`runner.js`：`_bounds` 一段、`stripBottom(fresh)`、`seaN`。
- `src/learn/play/board/walk.js`（play-3）：`bandFor` 多传一个参数（框的那块板），默认的调用不变。
- `src/learn/play/landscape.js`（play-7）：HP 条 / 阶段牌的偏移、`watchClock`、`landscapePhone`、`hudBand(…, board)`。
- `src/learn/forms/boss.js`：钟的文字一行。
- `tools/learn/arena-audit.mjs`：主会话在 `play-9b` 也改了这个文件的「名牌让位」那几行——这边没碰那几行，只在别处加。

**测试**：`npm run test:learn` 243 → 247（新 `play9.test.mjs` 4 条），`npm run check` 285 → 286 个文件（多了 `perf-forms.mjs`）。
- `play9.test`：① 用 `weapons.js` 同样的积分（直飞 0.13 s、重力 28、阻力 0.8、60 步 / 秒）和 `hit.js` 的球体检测飞 1 656 发（枪口在 Boss 前 4–12.5 m、正前和两侧，Boss 不动 / 走 2.9 m/s 四个方向 / 两个方向转 1.25 rad/s / 又走又转，四个插口，0.5 m 的球）：不修正 864 发打空（Boss 不动而在射程——12.5 m 平距——外的 34 发全掉短），修正后 0 发；Boss 不动、在射程内不修正也全中。② `steerRound` 过了球 / 不动的墨弹不修，正前方的球不改速度。③ halyard 真实导航网格上每一行「坡下来就是行」：她在坡上的每个位置、三种前瞄距离，瞄的范围不越过外面是海的坡边（旧代码在这一圈 59.5 m 越过）、读题区起点前两个外道都瞄得到；`fallRoom` 平地不改、坡上只收窄。④ 三周 21 块回声亭板 × 844 × 390 / 852 × 393 / 667 × 375，取景带顶边在 Boss 那一排下面（47 px）时最小字都 ≥ 17 px（最小 19.1 px）。
- 七张舞台全部行对照（草稿脚本，同 `runner-track.test` 的建法）：外道最晚能瞄到的位置，改前每行都在读题区起点前 2 m 以上；改后只有 lockgate 每圈一行变成 1.5–1.75 m（那段 1 格宽的坡外侧没有地面）。
- **证据快照**：`node tools/learn/evidence-snapshot.mjs` 在 `741bfee`（改之前）和改完以后各跑一次，128 270 个用例 `cmp` 逐字节相同（sha256 `bae04357cce84ce7e99063b42daac9beeea48e1891152424fd543dcfc423c84f`，同 play-8）。

**实测**（浏览器：一次一个 `flock -w 9000 /tmp/ielts-browser.lock nice -n 10`，Chromium + SwiftShader、`?quality=low`、阴影 / 泛光关、冻时钟步进；竖屏 390 × 844 触屏（`&from=app`）、横屏 844 × 390；报告在主会话草稿目录的 `play9-out/`、截图在 `play9-shots/`，不进仓库；2026-10-17 UTC）：

| 轮 | 跑的什么 | 结果 | 看到的 / 改的 |
|---|---|---|---|
| P1 | 探针（草稿脚本）：Boss w1 整局的 L 段 10 题，每题 8 发点射（`onHit` 只记不答），**`741bfee` 的拷贝** | 80 发打空 6 发 | Boss 在走 / 转时发的 4 发里 3 发空（转身 1.25 rad/s 两次、走 2.9 m/s 一次）；球离枪口平距 > 12.5 m 的 4 发全空（`_ballistic` 不抬枪：发射仰角 = 直线仰角，直飞后掉短 0.6–1.1 m）；其余 70 发全中；她朝向差 0.03–0.18 rad、和打不打空无关 |
| P2 | 同上，改完的代码（`steerRound`），3 题 × 12 发 | **36 发全中** | 其中 32 发 Boss 在走 / 转、2 发平距 > 12.5 m |
| B1 | Boss w1 **整局**竖屏（`arena-audit --full --fast`） | 一段 832 s 打完：结果卡「第 1 周周考打完了 · 43 / 43 题做对 · 一道锁都没有」（L 20 / 20、R 20 / 20、W 3 / 3、S 6 / 6）；**每题第一发就中：23 道选择题 23 颗墨弹，打空 0**（play-8 整局 56 次出题里 7 次）；采样 5 190 步没破；控制台 0、4xx 0 | 12 条失败都不是这一期的：5 次「墨球框出安全区」（play-8 B1 有 4 次、更早的整局 35 题里 8 次——不画帧时球落后走动的 Boss 一步，见已知坑）；q22 那一题她正被 Boss 打倒（镜头是 spectate），横幅没投上屏、点不到，复活后 q23 照样答对——那 7 条随它。截图 `play9-shots/boss-w1-portrait/` |
| B2 | Boss w1 **横屏** W + S 段整段（`--full --fast --skip-to W`） | **全过** | W 段 3 句长句：打字机 274–556 px（列 270–574，不压垫子）、288–291 px 高、字 17.8–17.9 px；取景时的列和现在的列、船体和题的朝向、镜头离取景位 0.03 m、焦距 35°——和取景一致（play-8 B4 那一次纸伸到 589 px 没复现，见拿不准的 6）。S 段 6 个回声亭：板的最小字 **20.6–37.2 px**（取景带顶边 46 px；改之前 ⏸ / 加油把它压到约 88 px），板和钟 / HP 条 / 阶段牌不相交。截图 `play9-shots/boss-w1-landscape/`（`boss-landscape-m7-in.png`：板在 ⏸ 左边） |
| B3 | Boss w1 横屏短关 2 题（新核：钟写到最宽） | 1 条失败 | 钟换成全名 217 px（314–531），HP 条 76–305、阶段牌 539–758：不压、都在屏上。失败的是 q1 一颗球的标签框高出题条底边 15 px（同 B1 的「框出安全区」）；两题都第一发就中 |
| X1 | 解谜 w1d1 出口区**横屏**（`wire-audit --exit-only`） | **全过** | 出口区的回声亭板最小字 **21 px**（取景带顶边 40 px，解谜不走 `hudBand`）——解谜这边本来就 ≥ 17 px，没改 |
| X2 | 解谜 w1d1 出口区竖屏 → 结果卡 →「今日小考」（`wire-audit --exit-only --quiz`） | **全过** | 结果卡上的按钮「今日小考 · 8 题 · 傍晚一轮对抗赛」点下去 → 页面里开小考（`level.quiz`，8 题）→ 备战展板「开始」→ 第一题 `s:e`（墨靶 M1，「哪个词里有 /e/ 这个音？」），没暂停 / hold / 卡片；控制台 0、4xx 0。截图 `play9-shots/quiz-chain/`（`results-quiz`、`quiz-first`）|
| R1 | 跑酷 w1d3 短关竖屏（默认的对 / 提示 / 错 / 差一点） | 没有报错 | 写字墙第二句按「提示」以后（s4 那一题 `x:w1d3:c1:7dg6q5`，同样在提示后 0.46 s 量）：题条底 239 px、打字机最高的点 295 px、她的头 463 低于中间那排 459——s4 是 230 px、头高过那排；`sea` 0 |
| R2 | 跑酷 w1d3 **整天**（halyard，`day-run`，对 / 对） | **一段 435 s 跑完，day-check 全过** | **掉海 0 次、`learn:noanswer` 0**（play-8 D7：中间高台那一行 2 次掉海、2 次「没答」再来）；结果卡「60 / 85 题做对 · 一道锁都没有 · ★★★ · 第 1 名 · 8:25 · 60 / 60 首答答对 · 35 / 35 滑行段打字答对」（D7 是 8:58）；50 行 + 35 题打字；采样 7 611 步没破；首答 60 个各一次、60 片叶子；控制台 0、4xx 0 |
| F1 | 帧时间（`perf-forms.mjs`，竖屏，每帧都画，600 帧） | 见下表 | |
| V1 | versus2 w1d1 **整局**竖屏（`net-duo-play --full`：两个页面 + 中继，不是短关） | **147 / 147 全过** | 12 题（10 道墨靶、2 道打字）问完，房主按区域判（`answered`）→ 两边都是 INKWAVE 的结果页带答题条；每题两边同一题物、同一顺序、同一个对的，题物在安全区里，点射答，各自的首答在各自的存储里一片叶子；控制台 0。截图 `play9-shots/versus2-full/` |
| V2 | coop2 w1d1 **整局**竖屏（`net-duo-play --full`） | **745 / 745 全过** | 7 道门、81 题：一个人看线索一个人作答、轮流；作答方的题条没有 ▶ 和中文、键盘没有 ▶；第一题答错 → 两边都看到「差一点」、换个问法回到另一个人手里；两边的门一起开；两边各只记自己答的；结果卡两边都有。截图 `play9-shots/coop2-full/` |

**帧时间**（PLAY §7；`perf-forms.mjs`：`main.js _frame` 的毫秒数按这一帧台上有没有题分桶——「有题」= 区域上空的题簇 / Boss 弱点上的球放好没答、跑酷一行幕或滑行段在；「走」= 没有题、她在跑 / 游（对抗赛和 Boss 是审计的手按住 W 往前跑）；每帧都画；SwiftShader，只能互相比）：

| 形式（短关） | 有题 p50 / p95 / 最大（ms，帧数） | 走 p50 / p95 / 最大（ms，帧数） | p95 之比 | 绘制调用 |
|---|---|---|---|---|
| 跑酷 w1d3（halyard） | 4.2 / 8.3 / 9 571（406） | 4.4 / 7.4 / 11（194） | **1.12** | 67 |
| 跑酷 w1d3，先跑 300 帧再采 1 200 帧（`--warm 300`） | 4.5 / 8.7 / 8 897（648） | 4.3 / 8.7 / 26（552） | **1.00** | 71 |
| 对抗赛 w1d6（区域题簇） | 10.2 / 16.2 / 1 585（63） | 10.3 / 18.7 / 1 646（531） | 0.87 | 111 |
| Boss w1（弱点上的球） | 7.4 / 12.7 / 3 539（61） | 6.9 / 14.1 / 5 436（529） | 0.90 | 61 |

对抗赛和 Boss 出题时 p95 比走路低（她站着答、没有脚步和跟随镜头），PLAY §7 满足；最大值都是第一次画出来的东西在 SwiftShader 上编着色器 / 传贴图的那一帧。跑酷第一次量（600 帧、不预热）有题那一桶高 12 %：那一桶里有头几行第一次出来时编着色器 / 传标签贴图的帧，游的那一桶只有 194 帧；先跑 300 帧再采 1 200 帧，两桶的 p95 都是 8.7 ms（之比 1.00），满足。

**PLAY §1 的 12 条**：① 不暂停 / 不定身 / 不弹面板 ✓——没碰流程；审计每步采样（Boss 整局 5 190 步、跑酷整天 7 611 步、Boss 横屏 W + S 848 步，一次没破）。② 判分一条路 ✓——没碰 `judge.js` 和各形式的 `_judgeRecord`；证据快照逐字节相同。③ 证据如实 ✓——修正只改那颗墨弹的速度，答不答照旧看它碰没碰到自己的球；跑酷不再因为掉海把一行记成「没答」再问（整天 0 次）。④ 节奏——没碰。⑤ 没有误答 ✓——只有她点的那一颗带标记的墨弹被修正、只朝它自己那个球；平射、溅射、机器人的墨照旧（Boss 整局前两道墨球题的「普通一枪不算答」照旧核）；跑酷换道的判法没改，只是瞄的时候不越过坡边。⑥ 不惩罚——没碰。⑦ 中文 ✓——横屏手机上钟的段名缩成第一个词（「R 阅读」），中文照旧。⑧ 不加素材 ✓——没有新文件以外的东西（代码、测试、审计）。⑨ 画风流畅 ✓——没有新的绘制；镜头的过渡跟着她走（更顺）；每帧不分配：`steerRound` / `_steer` 用模块级向量、`fallRoom` 不建对象、钟的短名按门缓存、钟宽只在 ResizeObserver 回调时量；帧时间见上表。⑩ 竖横 ✓——Boss 竖屏整局、横屏 W + S、跑酷竖屏、解谜出口区横屏和竖屏。⑪ 内容不少 ✓——`design.test` 照过；跑酷七张舞台的行一行没少（`rowFit` 没改）。⑫ 开关——play-8 起没有（PLAY §1 第 12 条的 play-8 更正）。

**拿不准的（自己定了，请主会话过目）**：
1. **点射的墨弹会拐一点弯**：`steerRound` 每帧把速度对准球「还要飞多久以后在哪儿」，Boss 走得快、转得快时墨弹的轨迹会弯几度，射程外它会往上爬一截（等于点射在 Boss 身上能打到 13 m 左右）。我认为这是「点射」该有的样子（她点的是那个球，PLAY §6.1），没有做成「看起来笔直」。只修她点的那一颗；桌面上「准星压在题物上开的火」也走点射（同一个 `shoot`），一起修。versus2 里对面屏幕上看到的是她这颗墨弹的回放（`ghost`，按发射时的速度飞，不修），回放里可能看起来偏了——回放不判、不碰题物，只是画面。
2. **Boss 不站住**：也可以出题时让 Boss 停下不走不转（球就不动了），那是改 Boss 的行为（`bossBrain` 不是学习层的），而且 LEVELS §2.5 只说「出题时不出招」；没这么做。
3. **667 × 375 的横屏手机上 ⏸ 压着回声亭板右上角的板框**（伸进板的字边距 5 px，不压字）：躲开它板就小到 16.8 px，我取了字大。844 / 852 宽的屏上碰不到。
4. **跑酷「坡边外面是海」的判法**：坡 / 台阶 = 比瞄的地面高低 0.3 m 以上；「掉下去」= 边外一格没有导航节点，或节点低于瞄的地面 0.5 m 以上。墙的格子也没有节点，所以 1 格宽、两边是墙的坡也按「掉下去」处理——只是让她顺着坡走，不往墙上蹭；七张舞台里这样让外道晚一点才瞄得到的只有 lockgate 每圈一行（读题区起点前 1.5–1.75 m，原来 2 m 以上；读题区本身 3 m，够她换到外道——没在浏览器里跑 lockgate 的一天）。边外的地面比瞄的地面高（墙顶、上一层）或差不多（她要去的那一层）照旧斜着走（terraces 那一处就是这样，原样）。
5. **横屏手机上 Boss 的钟只写段名的第一个词**：HP 条 / 阶段牌按钟宽让开以后，844 宽的屏上全名也放得下（实测 B3），但 667 宽的放不下，所以缩；缩的只在横屏手机（`(max-height: 460px) and (orientation: landscape)`，和 play-7 的横屏 CSS 同一个条件），竖屏和桌面照旧全名。另外钟多数时候只写时间（HUD 自己每秒写），写段名是 `BossFlow` 在两题之间写的那几帧。
6. **W 段长句的纸伸到右半块键盘上（play-8 B4）没复现**：这一轮横屏 W 段 3 句（含 B4 出事的 `x:w1d3:c1:7dg6q5`）打字机都在 274–556 px、取景的列和现在的列一样、船体和题的朝向一样、镜头到了取景位。B4 那一次是 R 段整段打完接着 W 段（这一轮是 `--skip-to W`），也许和船体朝向的弹簧有关（`ask` 时题的朝向和她的朝向差 0.4 以内就不重设船体）；审计的横屏打字核留了这几样诊断，再碰上就看得出是哪一样。
7. **跑酷取景的过渡跟着她走**：改的是 `runner/cam.js` 两个取景之间的过渡（打字 ↔ 墨字、一块看板 ↔ 下一块），不只是提示那一下；墨字取景本身是世界里钉死的点，从「跟着她」的旧取景过渡到它，前 0.8 s 镜头会比原来更贴她一点。
8. **帧时间**：跑酷有题那一桶的 p95 比游的一桶高（见上表），预热以后两桶一样；不预热时差的是头几行第一次出现的那几帧（最大一帧 9.6 s，软件 GL 上传标签贴图——§20 的 `RowView.prepare` 已经把它分到几帧里），真机上要看出第一行时有没有一顿。

**没做的**：
1. Boss 的「墨球框出安全区」（不画帧时球落后走动的 Boss 一步、离得近时球大）：B1 5 次、B3 1 次——play-8 起就有、不是这一期的地盘，没动；画帧跑（不加 `--fast`）时少得多（play-8 B2）。
2. lockgate 的跑酷一天没在浏览器里跑（拿不准的 4）。
3. 真机、TestFlight：没有。
4. 第 1 项（对抗赛区域倒数在一题正问着时数完）是主会话在 `play-9b` 做的，这边没碰。

**交接**（分支 `play-9`，没推；从 dev `741bfee` 建出，没有合过别的）：
- **做到哪**：任务书第 2–9 项都做了：Boss 第一发打空找到两个根、修了、整局 0 次；横屏 Boss 顶上一排按钟宽让开 + 横屏手机上钟写短名；横屏回声亭板的取景不再被 ⏸ / 加油压下去（Boss 20.6–37.2 px；解谜出口区本来就 21 px）；跑酷写字墙提示以后的取景（R1 复测 s4 那一题）；halyard 不掉海（整天 0 次）；versus2 / coop2 整局各跑一次（147 / 147、745 / 745）；小考按钮一条链；帧时间三种形式各量一次；文档。
- **先看哪些文件**：`src/learn/play/arena/run.js`（`_fire` / `_steer` / `steerRound`）→ `src/learn/play/landscape.js`（`hudBand(…, board)`、`watchClock`、`landscapePhone`）→ `src/learn/play/runner/track.js`（`clearWidths` 的 `edgeL / edgeR`、`fallRoom`）→ `runner/runner.js _bounds` → `runner/cam.js` 的过渡 → `tests/learn/play9.test.mjs`；审计 `tools/learn/perf-forms.mjs`、`arena-audit`（每题第一发、回声亭板字号、钟最宽、横屏打字的诊断）、`wire-audit --quiz`、`net-duo-play --full`、`land-measure.js boardFont`。
- **接口**：`steerRound(p, c, v?) → bool`（写 `p.vel`）；`fallRoom(T, W, s0, s1, yRef, drop, margin, out)`；`clearWidths` 多回 `edgeL / edgeR`（Float32Array，NaN = 边外没有地面）；`hudBand(aspect, W, H, board?)`、`BoardWalk.bandFor(aspect, W, H, slab)`；`landscapePhone()`、`watchClock()`、CSS 变量 `--iw-clock-half`；`RunnerFlow.stripBottom(fresh)`、`RunnerFlow.seaN` / `debug().sea`；审计：`perf-forms.mjs --form runner|duel|boss [--warm N] [--frames N]`、`wire-audit --quiz`、`net-duo-play --full`、`arena-audit` 报告的 `shots` / `boardFonts` / `wideClock` / `land[].plan`、`runner-drive` 报告的 `sea`。
- **和 `play-9b` 会碰的**：`tools/learn/arena-audit.mjs`——主会话在那边改了「名牌让位」检查的几行，这边没碰那几行，加的都在别处（S 段回声亭、整局收尾、横屏顶上一排、横屏打字核）；`docs/LEARN.md` 两边都在末尾加节（§28 是这边的）、`docs/DEVLOG.md` 两边都在最上面加条。
- **已知坑**：① 整局审计 `--fast` 时 Boss 的球落后一步，「框出安全区」会有几次（没做的 1）；看打空用报告里的 `shots`（`fires` / `answers` / `extra`），别看「点中」那一条（重放题时会多点一次）。② 帧时间的「有题」「走」两桶里各有第一次画东西的那几帧，短样本用 `--warm` 先跑一段。③ `fallRoom` 依赖 `clearWidths` 的 `edgeL / edgeR`；测试里手搭的 `W` 没有这两个数组时，坡边一律当「掉下去」。

## 29. play-9b 交付（2026-10-17，主会话，分支 `play-9b`：对抗赛一轮到点等最后一题 + 双人联机赛房主迁移不丢题 + 双人合作赛共用墨罐——和子代理的 play-9（§28）并行）

**先读了什么**：§27 拿不准的 18（区域倒数在一题正问着时数完）、§14 §4 表「墨罐共用」和「没做的」第 1 条（房主迁移时正问着的题、共用墨罐）、§24 拿不准的 11；`duel.js` 的 `_roundEnd` / `update`、`zones.js` 的 `_end`、`versus2.js` 的 `_becameHost` / `_onAsk` / `_referee`、`coop2.js` 的 `onNet` / `update`、`netmatch.js`（远端角色的 `ink` 随 20 Hz 的 tick 同步）。

**先定的**：
1. **一轮到点时正问着的题先答完**（`forms/common.js` `RoundGrace`，LEVELS §2.3 加了一句）：钟到 0 或区域数完时 `_roundEnd` 不结束、把判定停下（`hold`）；钟上写「第 N 轮 · 最后一题」、对面的「答题」骰子停、不再出新题、道具键照常；答完（判完、结果看过、`asking` 清掉）才真正结束。最多等 `LEARN.duel.graceS` 8 s（打字题 `graceTypeS` 25 s），等不到就把这题放回队首（`carryLeft` 接到下一轮）、不记证据、arena 日志记一条 `withdraw`。**输赢和两边的计数按到点 / 数完那一刻算**（hold 时记下 `counts`），这期间她答对泼的墨只是画面和特殊槽，不翻盘——只有这期间区域被击倒例外（zones 自己已冻结，以它为准）。`learn:round` 多一种 `state: 'grace'`。
2. **房主迁移时正问着的题按原 q 重开**（`versus2.js`）：新房主看自己手里 `qs.get(qi + 1)` 没收到 `lc`，就 `_openAt(qi, true)`——同一个 q 重发 `lq`（多 `re: 1`）、重开裁判。每个屏幕收到带 `re` 的同号题**不动现场**：答过的把当时发的 `la` 原样再发（`q.sent`：答对 / 答错 / 过期都记着），还开着的只刷新钟（`t0`、`sec`）；没见过这题的屏幕照新题出。当天首答一天只记一次，重问不会多记（`judgeRecord` 自己挡）。
3. **coop2 共用墨罐**（`duo.js` `sharedInk`，新负载 `lk`）：每个屏幕的墨照引擎走，只把引擎这一帧对自己墨罐做的事（喷了 −、充了 +）累起来每 `LEARN.coop2.inkSync` 0.1 s 发给对方，对方加进自己的罐——从不把加过的对方份额再发回去，所以不会来回放大；一帧涨超过 `inkReset` 5 的（重生满罐）不算充墨、罐留在共用的位置；房主每秒带一次自己的刻度 `v`，访客偏得超过 2 就往回拉三成。两个人都闲着时两边的闲充都算（两个人充一个罐，快一倍——合作的意思）；答题的那颗墨弹本来就不扣墨（§18）。

**改了什么**：`forms/common.js`（`RoundGrace`）、`forms/duel.js`（`_roundEnd(winner, reason, released)`、update 的等待分支）、`forms/versus2.js`（`_openAt`、`_becameHost`、`_onAsk` 的 `re` 分支、`q.sent` / `q.closed`）、`forms/duo.js`（`sharedInk`、`LEARN_WIRE` + `lk`）、`forms/coop2.js`（`_shareInk`、`_onInk`、`tank`）、`config.js`（`LEARN.duel.graceS / graceTypeS`、`LEARN.coop2.inkSync / inkReset`）、LEVELS §2.3；`tools/learn/duel-grace-audit.mjs`（新）、`tools/learn/net-duo-play.mjs`（coop2 开局的墨罐探针、`--migrate`）、`tools/learn/arena-audit.mjs`（「名字牌让开」遇到还在淡出的牌子等 0.4 s 再采一次：整天跑里一次 0.054）。

**动了别人地盘的**：没有（`weapons.js` / `main.js` / `actor.js` / `cameraRig.js` / `zones.js` / `netmatch.js` 一行没动）。

**测试**：`npm run test:learn` 243 → 246（`forms.test` RoundGrace 一条；`duo.test` 房主迁移一条、共用墨罐一条，`LEARN_WIRE` 多 `lk`），`npm run check` 286 个文件。判分没动（`judge.js` 一字未改、`_judgeRecord` 未改），证据快照不需要重跑。

**实测**（浏览器，锁下一次一个）：
- 对抗赛 w1d6 **整天一段跑完**（`day-run` + `arena-audit --full --segment 3300`，29 分钟）：55 / 55 计分条目都有首答、首答只记一次、每个首答一个叶子、PLAY §1 第 1 条 6 687 步全守住、0 报错 0 4xx；§27 实测 ② 的那两条 FAIL（q67 轮结束时被收掉、下一轮再问）没有了；整天 `withdraw` 0 次（没有一题等不到 8 s）。剩一条和这期无关的 FAIL：q35 的名字牌还在淡出（op 0.054 > 0.05）——审计改成再采一次。
- `tools/learn/duel-grace-audit.mjs`（竖屏，缩短的对抗赛日，三轮手动制造）：① 钟到 0 时题正问着 → 等待（phase 还是 round、题还在、钟写「最后一题」、不暂停不开卡、`learn:round grace` 一次、对面骰子停）→ 点对的球 → 轮结束在答案之后、首答记一次、结果 `time` 带那一刻的计数；② 不答 → 8 s 后收回：没有答案、没有叶子、题在下一轮（剩下的题那一轮）队首、arena 日志 `withdraw`；③ 那一轮里手动击倒区域 → 等待里记的是击倒（winner 1）→ 答对 → 结果 `knockout` 带它那一刻的计数、这题拿到首答。35 / 35，322 步不变量全守住。截图 `play9b-shots/duel-grace-portrait-grace.png`（看完删）。
- **coop2 共用墨罐**（`net-duo-play.mjs --mode coop2 --view portrait`，两个真浏览器 + Node 中继，竖屏合作赛第一次跑）：57 / 57——开局探针 c0 一口气喷 40、0.6 s 内 c1 的罐跟着掉 ≥ 30；c1 分小步充 20、c0 跟着涨 ≥ 12；之后两道门、四题、换手重问、结果卡照旧。（第一次跑探针失败是探针自己的时序：开局那一帧罐的起点还没从引擎取到，第一笔被当成起点——探针改成开局后先走半秒；另外竖屏合作赛整局要 `--budget 300`，默认 176 s 不够。）
- **versus2 房主迁移**（`net-duo-play.mjs --mode versus2 --migrate`）：q 2 在两个屏幕上都出着、没人答，房主 `G.net.leave()` → 中继把房交给访客 → 访客 `isHost`、`_becameHost` 按同一个 q 重开（裁判开在 q 2 上、题还在、没人答过）→ 新房主点对 → 它的裁判关题（`res` 里有它的答案、赢家是它）、没有「过期」记录、它的 store 两题首答各一次；缩短的局只有两题，q 2 关掉后是收局（第一次跑我的检查错当成还有 q 3，已改）。

**拿不准的（自己定了）**：
1. 打字题的等待 25 s（写一句约 20 s）、墨靶 8 s——真机上嫌长嫌短都是一个数。
2. 等待期间输赢不翻盘（按到点那一刻算）：翻盘更刺激，但对面的骰子停了就不公平；留给以后要改也是 `_roundEnd` 里 `released.counts` 一处。
3. 共用墨罐两个人闲充都算、重生不算充墨：重生的人回到共用刻度（可能是空的），要去充。`inkReset` 5 对着引擎核过：引擎里墨只按速率涨（游泳 42 / s，最大步长 1 / 24 s 一帧 1.75；闲充 9 / s），一帧直接写满的只有重生（`actor.js` 构造）和远端同步（`netmatch.js`，不是本地角色）——没有一口气给一截墨的道具。访客刚发过自己的增减 0.3 s 内不吃房主的刻度（房主可能在收到那一笔之前采的）。

**没做的**：房主迁移时 coop2（不是 versus2）正问着的题——coop2 的题由房主出、答案两边都收，房主走了合作赛本来就结束（`_partnerLeft`），不用接；三人以上房间的迁移只在 relay.test 里测过。

**交接**：分支 `play-9b`（从 dev `741bfee` 建出）；合并后 IELTS-Base 那边 `app/game` 要重新同步。LEARN §14「没做的」第 1 条两样都做了（本节）。

## 30. bag-aside 交付（2026-10-17，主会话，分支 `bag-aside`：竖屏手机上道具袋压在展板的中文释义和打字机的纸上——站点在前时道具袋滑出右边）

**先读了什么**：lockgate w2d5 / w2d2 整天跑完后逐张看的竖屏截图（道具袋 `.iw-lf__bag` 贴在右边中间，展板取景时压住最右一列的中文释义，滑行段打字机取景时压住纸的右沿）；`forms/ui.js` 的 `FormsUi`（袋子是 `.iw-lf__bag`，挂在 `.iw-lf` 上）、名字牌让位的写法（`arena/host.js` 的 `markerYield`，站点在前时名字牌退到一边——这次照它做）、`runner/runner.js` 的取景状态（`glide.active`、`prepS.pose`、`bw.framing`）、`arena/host.js` 的 `tags` 标志。

**先定的**：
1. **道具袋让位，不是挪位**：平时还在右边中间（她的手够得着），只在「站点在前」时滑出右边 24 px 以外并淡掉（`.iw-lf.is-aside .iw-lf__bag`，`translate .28s` 弹簧 + `opacity .2s`，减少动态时不过渡）、`pointer-events: none`。站点在前 = 跑酷的滑行段打字（`glide.active`）、备战板（`prepS.pose`）、展板取景（`bw.framing`）；对抗赛 / Boss 的任一站点在前（`host.js` 新的 `stationUp`，就是名字牌让位用的那个 `tags` 标志：展板、打字机、回声亭、翻牌、题簇）。
2. **道具键不让**：站点在前时她还可能要用道具（备战板上就是选道具的时候），所以只让袋子（显示手里有什么的那一条），道具键和墨罐不动。
3. **`FormsUi.aside(on)`** 是唯一入口，`start()` 时归位；每种玩法在自己的 `update` 末尾按状态调一次（幂等，状态不变不碰 DOM）。

**改了什么**：`forms/ui.js`（CSS + `aside()`）、`play/runner/runner.js`（取景后 / 没开跑时各一句）、`play/arena/host.js`（`stationUp`）、`forms/duel.js` / `forms/boss.js`（arena 更新后一句）；审计：`tools/learn/runner-drive.js`（`bagRect()`，滑行段打字和展板取景的帧检查多了「道具袋不压打字机 / 不压框好的展板」，板的留白按 `rect.w*54/1024+2`）、`tools/learn/arena-audit.mjs`（展板站的 R 图多 `bag`，打字时「道具袋离开打字机」一条）。

**动了别人地盘的**：没有（`host.js` 只多存一个标志）。

**测试**：`npm run test:learn` 250 / 250、`npm run check` 287 个文件。判分没动。

**实测**（浏览器，锁下一次一个，竖屏 390×844 触屏，短关）：
- 跑酷 w1d3（`runner-audit --touch`）：新加的两条帧检查全过，`bad` 0、0 报错 0 4xx；截图里滑行段打字时右边没有袋子，展板取景时板右沿到屏幕边都是空的（看完删了）。
- 对抗赛 w1d6 短关（`arena-audit`）：全过，含新加的「打字时道具袋离开打字机」。
- Boss 短关：见 DEVLOG 这一条（审计排在锁后面）。

**拿不准的（自己定了）**：
1. 让位时袋子整个淡掉而不是缩成一个角标——她在打字 / 读板，那几秒不需要知道手里有什么；想看就等板收起来。
2. 横屏没动：横屏里袋子在右下，和板 / 打字机不交叠（§26 的横屏截图），不加状态。

**没做的**：滑行段打字的取景本身（头顶离键盘中排 0–7 px，别处留白只有 3–5 px；一处 rig 点离左沿 14 px）——另一期；真机。

**交接**：分支 `bag-aside`（从 dev `3b2e57e` 建出）；合并后 IELTS-Base 那边 `app/game` 要重新同步。

## 31. 滑行段打字取景的头部余量（2026-10-17，主会话，开发分支直接改：整天审计里头顶高过键盘中排 0–11 px）

**先读了什么**：lockgate w2d5 / w2d2 整天审计的 `day-check`（w2d2 三条 FAIL「her head is not below the keys' row」，头 489 px、中排 500 px；lockgate 那天 0–7 px）；`type/frame.js` 的 `frameFor`（打字机位的搜索：头在中排下面是一条**严格但零余量**的规则——搜出来的机位头只在中排下 0.1–3.7 px）；`wire/type.js` 的 `_typeFrame`（回声亭 / 题簇的打字站自己另搜一遍、留 `HEAD_MARGIN` 0.05 NDC，play-fix 加的）；`type/split.js`（横屏拆半的机位也留 0.05）；`runner/glide.js` 的 `_framed`（跑酷直接用 `frameFor`，没余量）；`runner/cam.js`（机位走临界阻尼弹簧，审计在 2 s 后量）。

**先定的**：
1. **余量放进 `frameFor`，不另搜**：`frameFor({ …, headMargin })` 新选项，默认 0（别的调用一字不变）；`FRAME.headMargin` 0.05 和打字站、拆半机位同一个数。跑酷的滑行段带着它搜，放不下（`fits` 假）退回零余量的那一次——和打字站的退法一样。
2. **不去追那几像素是谁的**：真机位和搜出来的差一点（她的位置插值、弹簧的尾巴、底座随她的朝向）都可能，0.05 NDC（竖屏 ≈ 21 px）把 0–11 px 的偏差盖住，不改相机。
3. **代价**：打字机在屏上矮 2 %（390 × 844、带 0.3 / 键盘 0.35：210 px 对 215 px），横屏不受影响（拆半机位本来就有余量）。

**改了什么**：`type/frame.js`（`FRAME.headMargin`、`frameFor` 的 `headMargin`）、`runner/glide.js`（带余量搜 + 退回）；`tests/learn/runner-glide.test.mjs` 多一条（六个带：有余量的机位放得下、头在中排下 ≥ 21 / 18 px、打字机还在带里、最多矮 5 %；glide.js 的调用和退回）。

**测试**：`npm run test:learn` 251 / 251、`npm run check` 287。判分没动。

**实测**（浏览器，锁下一次一个，竖屏 390 × 844 触屏）：跑酷 w1d3 短关（`runner-audit --touch`）两次滑行段打字，头在中排下 23 / 26 px（改前整天里 −11 到 +4 px），带 0.28 / 0.3、键盘 0.35，`fits` 真、打字机全在带里，`bad` 0、0 报错 0 4xx；截图看过（头在键盘下面、纸和色带都在）删了。w2d2 整天重跑排在锁后面，结果见 DEVLOG。

**没做的**：lockgate 那天一处 rig 点离左沿 14 px（`inBand` 的 x < −2）——另一个偏差，这次没碰；真机。
