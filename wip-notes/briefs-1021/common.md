# 共同规矩（每个子 agent 先读完这一份，再读自己的任务书）

你是「雅思工作台 / IELTS Base」的开发子 agent，主会话派你来做一块活。全程中文写文档和汇报（代码注释跟周围的风格走，英文为主）。

## 产品和人
- **她**：学习者，零基础 → 雅思学术类 7.0，每天学约 5 小时，主要用 iPhone（带灵动岛的机型，TestFlight 里装着 build 1151），时区新加坡。界面是中文，每句英文配中文。
- **业主**：和主会话对话的人。他今天（2026-10-21）说的原话（引用时用「」原样写，别把主会话的话写成业主说的）：
  1. （截图：第 2 周第 3 天，解密闯关的讲解板）「他到这儿就卡住了，然后我点那个读全文的话，它也没有那个语音权限，也没有让我读，然后也进行不了下一步，点左下角地图没有反应，点右上角地图，它也没有反应。就在这一步卡死了。」
  2. 「还有个问题，很卡，手机上真的很卡，你需要深入做体系化优化」
  3. 「原来的界面跟流程就蛮好的 现在的游戏很好，我觉得可以给游戏加一个单独入口，我们可以点进去之后选择游戏方式」
  4. 「不需要旧的学习版链接，重建就行」「允许你启动8个opus 5.5 max的workflow ultracode高质量推进」「自主推进不要停」「github action ci暂时没钱 你想其他办法自动推进 不需要问我」
- 业主的长期标准（10-17）：「所有你们自己新开发的游戏组件，都要和原风格一样融合，而且要比原风格都更精细……3A大作的交互节奏」；「丝滑」优先（不掉帧）。界面（10-20，inkwave docs/LEARN.md §47）：一样东西一种材质（玻璃上不叠贴纸的粗墨描边和硬投影）、中文不描边不硬加粗（`font-synthesis: none`）、字不许出框、对比度 ≥ 4.5 : 1、一屏模糊 ≤ 4 层、只动 transform / opacity、点按区 ≥ 44 pt、减少动态效果时只淡入。

## 两个仓库
- **IELTS-Base**：`/home/user/IELTS-Base`，开发分支 `io/hopeful-turing-fnxytg`（现在 `fd996ed`，从它开你的分支）。经典工作台 `app/index.html`（很大，只做定点修改），iOS 壳 `ios/`，服务器 `server/`。`app/game/` 是 inkwave 的打包结果（`tools/game/sync-inkwave.sh` 拷进来，**你不跑同步**，主会话合并后同步）。
- **inkwave**（关卡学习游戏，three.js r186，纯 ES 模块）：`/home/user/inkwave`，开发分支 `io/hopeful-turing-fnxytg`（= `088c6dd`，从它开你的分支）。**它的 `main` 从不推。**设计和交付记录在 `docs/LEARN.md`（§1–§47；每节「先读了什么 / 先定的 / 改了什么 / 测试 / 拿不准的 / 没做的 / 交接」）、`docs/PLAY.md`（题即玩法）、`docs/LEVELS.md`。游戏写她账号的规矩：LEARN §39 / §41（写前重读最新的、只改要改的、她没有数据不建、同样的存两次只写一次、按她的时区、写完 `invalidate()` + `mirror()`）。
- **工作树**：各开各的，别在主工作区改。
  - `git -C /home/user/inkwave worktree add -b <分支> /home/user/inkwave/.claude/worktrees/<分支> io/hopeful-turing-fnxytg`
  - `git -C /home/user/IELTS-Base worktree add -b <分支> /home/user/IELTS-Base/.claude/worktrees/<分支> io/hopeful-turing-fnxytg`
  - inkwave 的克隆是浅的（开发分支取了 300 层）；推之前不用 unshallow。
- **提交和推送**：每完成一个能跑的小步就提交并推到**你自己的分支**（`git push -u origin <分支>`；网络失败按 2/4/8/16 秒重试）——容器会重启，没推的全丢。不开 PR、不合并、不推别的分支、不发布任何 artifact、不触发 GitHub Actions（没钱）。提交信息中英文都行，**末尾两行**：
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01N4Zp87LZZRF8D6wGMNh5x6
  ```
  仓库里任何文件都**不写模型名**（这两行除外）。
- **文档**：inkwave 的 `docs/LEARN.md` 末尾加你自己那一节（节号见任务书，别动别人的节）。IELTS-Base 的 `docs/DEVLOG.md`、`BACKLOG.md`、`NEXT-SESSION.md`、`README.md` **不要改**（主会话写）；IELTS-Base 那边要记的写进你的汇报。

## 测试（改了什么跑什么；测试不许跳过、禁用、放宽）
- 先 `export NODE_PATH=/opt/node22/lib/node_modules`（playwright 在全局；脚本里 `createRequire(import.meta.url)('playwright')`，ESM 的 import 不认 NODE_PATH）。Chromium 让 Playwright 自己找（别传 executablePath）。
- **浏览器一次只跑一个**（整台机器共用，另一个子 agent 也在跑）：`flock -w 9000 /tmp/ielts-browser.lock nice -n 10 <命令>`。机器 4 个 CPU、没有显卡，WebGL 是 SwiftShader：很慢，数字只能横向比（同一次运行里前后对比）。
- inkwave：`npm run test:learn`（现在 408 条）、`npm run check`（313 个文件）；改判分 / 题路径前后 `node tools/learn/evidence-snapshot.mjs --out <文件>` 要逐字节相同（sha256 `bae04357…c84f`，128 270 个情形）。审计工具在 `tools/learn/`（`wire-audit.mjs`、`runner-audit.mjs`、`arena-audit.mjs`、`day-run.mjs` + `day-check.mjs`、`perf-forms.mjs`、`hitch-probe.mjs`、`parity-shots.mjs`、`map-shot.mjs`；各文件开头有用法）。`python3 tools/build-dist.py` 打 `dist/`（IELTS-Base 的 e2e 用 `--game <这个 dist>`，用完删）。
- IELTS-Base：单元 `bash tests/run-unit.sh`（锁里，1 078 条；新工作树里没有 `.cache/tools/` 的 KTX-Software 时「ktx2 一套」那 1 条跳过，原来就这样）；服务器 `cd server && node --test test/*.test.js`（195）；游戏为主体的八个 e2e（`tests/game-first-e2e.mjs`、`book-e2e`、`checkin-e2e`、`exams-e2e`、`notes-e2e`、`weeks-e2e`、`guides-e2e`、`teacher-e2e`）；经典页 8 个（`tests/tz-e2e.mjs`、`scroll-mood-e2e.mjs`、`flash-dict-e2e.mjs`、`exam/e2e-exam.mjs`、`base/e2e-base.mjs`、`e2e-sync.mjs`、`base/cloud-e2e.mjs`、`touch-targets-e2e.mjs`）。**GitHub Actions 没钱**：CI 跑不了，合并前主会话在本机跑全；你交之前把和你改动相关的都跑过。
- SwiftShader 上动画放得很晚：测试里点之前等「一帧在 5 秒内回话」或有限时长的动画放完（`getAnimations()`），不要加长超时、不要放宽断言。要测「紧接着的第二下」在页面里同一个任务中按。
- 计时类断言失败先查原因；CDP 的 `Emulation.setCPUThrottlingRate` 能复现慢机器。

## 隐私（硬规矩）
- `app/my-progress.js` / `.json` 是她的个人进度：不打印、不贴进汇报、不复制；grep / 复制 `app/` 时排除 `my-progress.*`；不进任何打包结果。git 历史里的旧快照也一样（测试由 `tests/progress-snapshot.cjs` 读进内存）。从她数据派生的夹具不上传。
- 截图可能带着她的进度：看完就删（写死路径删），不提交、不上传。自己写的探针用现编的学员。
- 不要用 `ArtifactData` 往任何学习版的 `data/users/…` 写。

## 环境
- 草稿目录：`/tmp/claude-0/-home-user-IELTS-Base/256af91b-3170-5ad5-bfb8-0fa22698f111/scratchpad/` —— 你的临时文件放在里面**以你分支名命名的子目录**（另一个 agent 同时在用）。
- 后台命令用工具自带的后台运行，别用 `&` / `disown`；找进程看 `/proc/<PID>/cmdline`，不用 `pkill -f`，不杀别人的进程。
- 看图：`convert <大图> -resize 1600x1600\> -quality 85 <草稿目录>/<你>/x.jpg` 再用 Read 看。
- 磁盘约 30 GB 空闲；dist / 截图 / 探针用完删。

## 交回（你的最后一条输出就是返回值，按任务要求的结构）
结论先行；两个仓库各自的分支名和最后的提交（40 位）；改了什么（文件和要点）；判据逐条（写进测试的具体数字，前后对比）；跑过的测试和结果；截图路径（看过的，没提交）；拿不准的（你自己定了什么）；没做的和原因；要业主 / 主会话定的；合并时要注意的（会和谁冲突、生成的文件怎么处理）。
