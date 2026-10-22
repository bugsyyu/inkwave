// scratch: the framing distance for a word board / the lesson board, 088c6dd's band vs keysBand (portrait, landscape)
const root = process.argv[2];
const { frameBoard, boardBand, keysBand } = await import(root + '/src/learn/play/board/frame.js');
const { LEARN } = await import(root + '/src/config.js');
const BD = LEARN.board;
for (const [W, H] of [[390, 844], [844, 390]]) {
  const aspect = W / H;
  for (const h of [1.6, 2.2, 2.6]) {
    const slab = { w: BD.w + 0.14, h: h + 0.14, bottom: BD.bottom - 0.07 };
    const a = frameBoard(slab, aspect, { W, H }), b = keysBand ? frameBoard(slab, aspect, { W, H, band: keysBand(aspect, W, H, {}) }) : null;
    console.log(`${W}x${H} board h ${h}: old band ${JSON.stringify(boardBand(aspect, W, H))} d ${a.d.toFixed(2)} pos ${a.pos.join(',')}` + (b ? ` | keys band ${JSON.stringify(b.band)} d ${b.d.toFixed(2)} pos ${b.pos.join(',')}` : ''));
  }
}
console.log('BD', JSON.stringify({ w: BD.w, bottom: BD.bottom, zone: BD.zone, side: BD.side, gap: BD.gap }));
