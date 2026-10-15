# 开发日志（INKWAVE · 关卡学习）

每一步做了什么、为什么、怎么验证的。**最新的在最上面**，时间是 UTC（北京时间 +8 小时）。设计契约在 [LEARN.md](LEARN.md)；没做完的写在各条的「没做的」里。三条分支并行：`learn-a`（内容桥、题目引擎、进度 / 证据、关卡定义；纯模块、只跑 Node 测试）、`learn-b`（模式脚手架、一关解谜、手机能开）、`learn-d`（关卡设计：LEVELS.md + design.js，纯数据）。

---

## 2026-10-15

### 22:16 D 工作流交付：关卡设计圣经 LEVELS.md + 设计数据 design.js + 8 条测试（分支 `learn-d`，LEARN §12）

- **先读了什么**：LEARN.md 的契约和 A 的 §8；三周课程包每一步（用 A 的 `daySteps` 数：67 / 77 / 77 步，743 / 752 / 752 条目，每天 225 分钟、复习日 195 / 210）；IELTS-Base 的 `SYLLABUS`（17 周）、EXAM.md §1–§2（今日小考 8 题 6 分钟、周考听 20 读 20 写 1 说 1 一天一段 10 天窗口、满月月考、自由练习、不惩罚、当天首答）、DESIGN.md §1–§2（侦察 → 排工 → 施工 → 夯实 → 放下；做题时画面不动；没有数据变化就没有动画）；INKWAVE 的 `config.js`（`OFFLINE_MAPS` 7 张、`SUBS / SPECIALS / DIFFICULTY / TIMES`）、7 张舞台的 layout 和 tag、`zones.js` / `zones-data.js`、BOSS.md、`bots.js`、`touch.js`、CONTRACTS.md 的角色动作 / 音效 / HUD 名单。
- **定下来的设计**（细节全在 [LEVELS.md](LEVELS.md)）：一步一门、题全问、分钟就是课程的；学习在前（展板）题在后；门最多卡两次就开，错了换问法再问、出口前回炉门换一种形式再问、明天到期排最前（夯实）；四种形式——解谜（无敌无钟、A* 路线上按 layout tag 放门）、道具赛（环线、看板段钟停、检查点、道具 = 副武器 / 特殊换皮、机器人掷骰子答题）、对抗赛（zones 中央区、答对泼墨、队友不答题、对面按节奏掷骰子）、Boss（周考四段 = HULLBREAKER 四段 HP，一天一段）；复习日固定道具赛整圈、150 张快闪翻牌；今日小考 = 出口后一轮对抗赛；星只涨不掉、解锁照 `dayDone`。舞台按当天主题选、每周 7 张各一次、第 1 周白天第 2 周傍晚第 3 周交替；Boss 不和复习日同舞台。
- **数据和验证**：`design.js` 的 `DAY_PLAN` 由课程步按规则生成（以后的周不用重新设计），§3 的表用 `tools/learn/print-levels.mjs` 打印进文档；测试核三周 221 步 `missing = []`、21 天分钟 = 课程 ±20%（节奏模型估的也在 ±20% 内）、舞台都是离线 7 张、道具都指向真的 `SUBS / SPECIALS`、音效 / 动作 / 舞 / 横幅名都在 CONTRACTS.md、Boss 20 / 20 / 3 句 / 4 问 + 2 句且同步不相邻、小考 8 题。`npm run test:learn` 30 / 30，`npm run check` 187 文件绿；没开浏览器、没 `npm install`。
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
