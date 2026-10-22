# scratch (wf-softlock, third agent): the parts of LEARN §48 that do not wait for this round's runs
#   python3 -I fill48-static.py <learn48-v3.md>   (edits in place; every replacement must hit exactly once)
import sys
p = sys.argv[1]
s = open(p, encoding='utf-8').read()

def rep(old_start, new, end='\n'):
    global s
    i = s.find(old_start)
    assert i >= 0 and s.find(old_start, i + 1) < 0, ('not exactly once', old_start[:40])
    j = s.find(end, i)
    assert j >= 0
    s = s[:i] + new + s[j:]

def sub(old, new):
    global s
    assert s.count(old) == 1, ('not exactly once', old[:60], s.count(old))
    s = s.replace(old, new)

# the note under the title: three agents, two restarts, this round's rules
rep('（10-22 约 02:45 UTC 容器重启',
    '（这一节是三个子代理接力写完的。做这一块的子代理 10-21 21:02 起提交了 16 个，正在查「第 2 道门开后往前走一帧几秒」时，'
    '10-22 约 02:45 UTC 容器重启，它没交回汇报；第一个接手的照提交和草稿核了一遍，查到是藏起来的小地图照样在画、修了（`f802d3a`），'
    '排着整套测试时 04:35 又重启了一次；第二个接手的照主会话 04:40 定的新规矩——分支上不跑全套 e2e，只跑 `test:learn`、`check` 和'
    '至多 2–3 个证明改动的浏览器运行——在最后的代码上重跑了这几样（6× 的量具改前改后、w2d3 竖屏的 tap-walk），写完这一节；'
    '其余的合并以后由主会话统一跑（见「交接」）。）')

sub('接手时另读了：前一个的 16 个提交、它的草稿和量具输出、`wf-perf-cpu` 的 `3569214`（小地图看不见就不画，读这里的 `is-nomap`）。',
    '两次接手时另读了：前面的提交、草稿和量具输出、主会话 10-22 的两份接手说明、`wf-perf-cpu` 的 `3569214`（小地图看不见就不画，读这里的 `is-nomap`）。')

sub('前一个子代理在查它（实验脚本一层层藏 DOM），没查完就被打断了——藏 `#ui-root`、藏画布都不变，变慢只跟帧数有关。⟨MM⟩',
    '做这一块的子代理在查它（实验脚本一层层藏 DOM）时被打断了；第一个接手的接着排除：藏 `#ui-root`、藏画布、不画，'
    '变慢都只跟走过的帧数有关；GPU 进程里那一下是 `RasterDecoderImpl::DoEndRasterCHROMIUM::Flush`（2D 画布的栅格化，不是 WebGL），'
    '主线程的 CPU 采样 164 s 里 `uniformMatrix4fv` 一个就占 80 s——是在等 GPU 进程；剩下的就是这张一直不上屏、一直在画的 2D 画布。'
    '修了（先定的 15）以后，同一个量具、同一批里：⟨MM⟩')

sub('**改了什么**（inkwave，`088c6dd..wf-softlock`，⟨NCOMMITS⟩ 个提交，36 个文件 +⟨PLUS⟩ / −⟨MINUS⟩；`src` + `styles` 29 个文件）：',
    '**改了什么**（inkwave，`088c6dd..wf-softlock`：到 `f802d3a` 为止 17 个提交、36 个文件 +1 732 / −107，`src` + `styles` 29 个文件；'
    '最后一个提交是这一节）：')

sub('、`play3-board.test.mjs` 两条测试的标题改叫「看全文」——说的事一样，没有放宽。',
    '、`play3-board.test.mjs` 两条测试的标题、一句注释和一条断言的说明改叫「看全文」——说的事一样，没有放宽。')

sub('和 `wf-perf-cpu` 试合并：代码不冲突，合起来 `test:learn` 458 / 458。', '⟨MERGE⟩')

# 没做的: what this round did not run on the final code
sub('5. 横屏时 ⏸ 靠到角上，正好在 HUD 的特殊槽（右上角那个圆）上面一点——和改前「地图」键在那儿一样，没动。',
    '5. 横屏时 ⏸ 靠到角上，正好在 HUD 的特殊槽（右上角那个圆）上面一点——和改前「地图」键在那儿一样，没动。\n'
    '6. 最后的代码上没跑的（主会话 10-22 04:40 的新规矩：分支上不排全套）：IELTS-Base 的八个游戏 e2e、4× 的量具、tap-walk 的其余几段。'
    '那几段前面两个子代理跑过、都过了，各在当时的提交上（见「判据和实测」的表）：w2d3 横屏 `341f002`、w2d3 出口区 `b9c69a5`、'
    'w2d7 出口区 `0075796`、w1d3 跑酷 `341f002`、w1d6 对抗赛竖屏 `db21845`、w2d7 跑酷 / w1d6 对抗赛横屏 / Boss `39158c6`——'
    '最后一个提交 `f802d3a`（藏起来的小地图不画）它们都没覆盖到，这一轮的 w2d3 竖屏覆盖了。合并后由主会话统一跑。')

open(p, 'w', encoding='utf-8').write(s)
print('ok', s.count('⟨'), 'placeholders left')
