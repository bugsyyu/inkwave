# ui-glass (docs/LEARN.md §47): the menus' Chinese display face — ZCOOL KuaiLe (站酷快乐体, SIL OFL 1.1), cut down to the
# Chinese the game's own interface says (every CJK character, CJK punctuation and full-width form in src/**/*.js and
# index.html, comments left out). Run it again whenever new interface text comes in; a character missing from the cut
# falls back to the system's face (PingFang SC on her phone) for that one glyph.
#   python3 tools/fonts/subset-zh.py [--src <ZCOOLKuaiLe-Regular.ttf>]     (needs fonttools + brotli: pip install fonttools brotli)
# Without --src it fetches the font from Google Fonts' repository and checks it against the hash below.
# Writes assets/fonts/ZCOOLKuaiLe-ui.woff2 (budget 400 KB) and assets/fonts/ZCOOLKuaiLe-OFL.txt, prints the counts.
import glob, hashlib, os, re, sys, tempfile, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
URL = 'https://raw.githubusercontent.com/google/fonts/main/ofl/zcoolkuaile/'
SHA = '812a6fc1fe54b6d73a419245c32dfeba8aa33104d5be90d1cf6af082007cb71d'   # ZCOOLKuaiLe-Regular.ttf
OUT = os.path.join(ROOT, 'assets', 'fonts', 'ZCOOLKuaiLe-ui.woff2')
BUDGET = 400 * 1024

def wanted():
    chars = set()
    for f in sorted(glob.glob(os.path.join(ROOT, 'src', '**', '*.js'), recursive=True)) + [os.path.join(ROOT, 'index.html')]:
        s = open(f, encoding='utf8').read()
        s = re.sub(r'/\*[\s\S]*?\*/', '', s)
        s = re.sub(r'(?m)(^|[^:\\])//.*$', r'\1', s)
        for c in s:
            o = ord(c)
            if 0x3400 <= o <= 0x9fff or 0x3000 <= o <= 0x303f or 0xff00 <= o <= 0xffef or c in '“”‘’—…·':
                chars.add(c)
    return chars

def main():
    from fontTools import subset
    from fontTools.ttLib import TTFont
    src = sys.argv[sys.argv.index('--src') + 1] if '--src' in sys.argv else None
    tmp = tempfile.mkdtemp()
    if not src:
        src = os.path.join(tmp, 'ZCOOLKuaiLe-Regular.ttf')
        urllib.request.urlretrieve(URL + 'ZCOOLKuaiLe-Regular.ttf', src)
        urllib.request.urlretrieve(URL + 'OFL.txt', os.path.join(tmp, 'OFL.txt'))
    if hashlib.sha256(open(src, 'rb').read()).hexdigest() != SHA:
        sys.exit('not the ZCOOL KuaiLe this was made with (sha256 differs): ' + src)
    lic = os.path.join(os.path.dirname(src), 'OFL.txt')
    chars = wanted()
    cmap = TTFont(src).getBestCmap()
    have = sorted(c for c in chars if ord(c) in cmap)
    missing = sorted(c for c in chars if ord(c) not in cmap)
    opts = subset.Options()
    opts.flavor = 'woff2'
    opts.layout_features = ['*']
    opts.name_IDs = ['*']          # (the copyright and the licence stay in the font)
    opts.notdef_outline = True
    font = subset.load_font(src, opts)
    sub = subset.Subsetter(opts)
    sub.populate(text=''.join(have))
    sub.subset(font)
    font['name'].setName('ZCOOL KuaiLe IW', 1, 3, 1, 0x409)   # a family name of our own: never mistaken for an installed copy
    subset.save_font(font, OUT, opts)
    if os.path.exists(lic):
        open(os.path.join(ROOT, 'assets', 'fonts', 'ZCOOLKuaiLe-OFL.txt'), 'w', encoding='utf8').write(open(lic, encoding='utf8').read())
    size = os.path.getsize(OUT)
    print('characters wanted %d, in the font %d, not in it %d %s' % (len(chars), len(have), len(missing), ''.join(missing)))
    print('%s: %d bytes (budget %d)' % (os.path.relpath(OUT, ROOT), size, BUDGET))
    if size > BUDGET:
        sys.exit('over the budget')

main()
