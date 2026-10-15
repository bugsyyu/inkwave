# 开发日志（INKWAVE · 关卡学习）

每一步做了什么、为什么、怎么验证的。**最新的在最上面**，时间是 UTC（北京时间 +8 小时）。设计契约在 [LEARN.md](LEARN.md)；没做完的写在各条的「没做的」里。两条分支并行：`learn-a`（内容桥、题目引擎、进度 / 证据、关卡定义；纯模块、只跑 Node 测试）、`learn-b`（模式脚手架、一关解谜、手机能开）。

---

## 2026-10-15

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
