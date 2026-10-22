# wf-softlock 进度（第三个接手的，10-22 04:4x UTC 起）

## 已有（前两个做的，都已推送）
- inkwave wf-softlock = f802d3a（origin 一致），17 个提交，088c6dd..f802d3a。
- 第二个接手的在 f802d3a 上跑过：test:learn 428/428、证据快照 bae04357…c84f 相同（final/testlearn.log、final/ev-f802d3a.jsonl）。
- LEARN §48 草稿：learn48-final.md（有占位 ⟨…⟩ 没填），还没进 docs/LEARN.md。
- IELTS-Base 没开分支。

## 正在做
- 代码通读完（088c6dd..f802d3a），没找到要改的；和另外四个分支 merge-tree 都不冲突。
- §48 第三版草稿：learn48-v3.md（静态部分已改好：probe/fill48-static.py 跑过了，不要再跑）；剩 ⟨MM⟩ ⟨HEAD⟩ ⟨TWTABLE⟩ ⟨BHTABLE⟩ ⟨MERGE⟩ ⟨E2E⟩ ⟨SHOTS⟩ ⟨RENDER⟩ 等这一轮的数。
- 量具表：node probe/bh-table.mjs final/bh-base-6.json final/bh-head-6.json。
- 收尾要删：base/、pre-guard/（inkwave 的临时工作树，git worktree remove）、ib/（IELTS-Base 的临时工作树，里面她的进度文件已被前一个删掉、没有副本）、final/shots-*（截图看完就删）。
- f802d3a 的小地图修补以前没量过（mm-pre 没跑完）：bh-head-6 的 walk3 就是验证。

## 还剩
- 2–3 个浏览器测试（新规矩）：见下。
- npm run test:learn、npm run check、证据快照（在最后的提交上）。
- §48 填完、提交、推送。

## 重要：f802d3a 没修好 walk3
- bh-head-6（f802d3a，6×，05:08 完）：walk3 p50 4286 ms、最长 36 150 ms（088c6dd 以前量的 6×：44.5 ms）。从 walk3 第 2 帧就慢。小地图那个假设不对（guard 是生效的：G.hud 有设）。
- 3D 的活两边一样（draw calls 49–93、63 万三角形）；差别在 3D 以外（DOM 合成 / 栅格化 / 2D 画布）。walk3 里一直有板子框住：这个分支框住时走路条（键）看得见，088c6dd 框住时藏起。
- 下一步：probe/w3-onset.mjs（慢了以后一样样关掉：.iw-learn、#ui-root、触屏层、不画；再追踪 3 帧的绘制 / 栅格化），结果在 w3o-head/。
- p-g2（tap-walk）和 bh-base-6 都没跑（锁里排 7 个；bh-base-6 撤了）：修好后在最后的代码上跑 p-g2 + 一次量具。

## 正在跑 / 在等
- 05:18 起后台：w3-onset（f802d3a，1×）排锁。
