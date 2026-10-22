# wf-softlock 进度（第四个接手的，10-22 05:3x UTC 起；上一个的记录在 PROGRESS-r3.md）

## 已有
- inkwave wf-softlock = f802d3a（origin 一致，05:3x 核过），17 个提交。
- 上一个：代码通读、§48 草稿 learn48-v3.md（剩 ⟨…⟩ 占位；查到的 10、先定的 15 说小地图是原因——不对，要改）、bh-head-6（f802d3a 6×：walk3 p50 4286 ms）。

## 查 walk3 慢帧（05:3x 起）
- 已知：1× 也慢（new-1p：p50 2702 ms），所以不是主线程；CPU 采样全是 WebGL 调用在等 GPU 进程；GPU 追踪里 Vulkan 提交一次 6 s、2D 栅格化 flush 一次 6.6 s。
- 开始慢的位置：第 2 道门开后约 47 个画了的帧（各次不一样：47–59）——像是 GPU 进程的队列积满了才显出来，GPU 每帧的活可能从框住第一块板起就多了。
- 竖屏 keysBand 只把相机抬高 0.22 m（距离一样 5.79 m）：相机位置不太像原因。
- probe/w3-why.mjs（每帧哪张 2D 画布在画、哪张贴图在传、合成层的 paintCount、慢了以后一样样关）：why-head/，05:39 起跑。
- probe/w3-fill.mjs（降像素比看是不是填充、板带换回 088c6dd 的、相机附近的网格藏起来、透明的藏起来）：还没跑。

## 还剩
- 修 walk3 → 同一次运行量前后（board-hitch 6×，088c6dd vs 修后）→ 提交推送。
- tap-walk w2d3 竖屏（最后的提交）、test:learn、check、证据快照。
- §48 填完进 docs/LEARN.md、提交推送、交回。
- 收尾删：base/（量完）、pre-guard/、merge5/、ib/（临时工作树）、截图。

## 正在跑 / 在等
- w3-why（f802d3a，1×）：why-head/log.txt。
