// 展板路 M6 (src/learn/play/board/): text that fits, boards that read at ≥ 17 px once framed on a phone held either way,
// hotspots ≥ 44 pt, the long texts going to the reading strip (never while a question is up), boards along the approach,
// framing that follows her in and lets go when she walks on — on the real course (three weeks).
// 用法：node --test tests/learn/*.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadWeek, daySteps } from '../../src/learn/content.js';
import { LEARN } from '../../src/config.js';
import { wrap, clampLines, approxMeasure, charsOf } from '../../src/learn/play/board/text.js';
import { frameBoard, boardSpots } from '../../src/learn/play/board/frame.js';
import { pickHotspot, canvasToBoard } from '../../src/learn/play/board/hotspot.js';
// three and everything that imports it come in after the hook is registered (static imports resolve first)
const THREE = await import('three');
const { layoutBoard, wordsSpec, soundsSpec, lessonSpec, noteSpec, passageSpec, echoSpec, signSpec, BOARD } = await import('../../src/learn/play/board/paint.js');
const { packCells } = await import('../../src/learn/play/board/atlas.js');
const { BoardWalk } = await import('../../src/learn/play/board/walk.js');
const { ReadStrip } = await import('../../src/learn/play/board/strip.js');

const weeks = [await loadWeek(1), await loadWeek(2), await loadWeek(3)];
const SCREENS = [[390, 844], [844, 390], [375, 667], [667, 375], [1280, 720], [820, 1180]];
// every board the three weeks put up (the specs the flow will build), with where it came from
function allSpecs() {
  const out = [];
  weeks.forEach((w, wi) => {
    for (let d = 1; d <= 7; d++) for (const s of daySteps(w, d)) {
      const t = s.meta.type, tag = `w${wi + 1}d${d} ${s.id} ${t}`;
      if (t === 'words') { const rows = s.items.map((it) => ({ en: it.en, ipa: it.meta.ipaUs || it.meta.ipa, zh: it.meta.zhFull || it.zh })); for (let k = 0; k < rows.length; k += 5) out.push([tag, wordsSpec(rows.slice(k, k + 5), k / 5 + 1, Math.ceil(rows.length / 5))]); }
      if (t === 'symbols') { const rows = s.items.map((it) => ({ ipa: it.en, name: it.meta.name, tip: it.meta.tip, examples: it.meta.examples })); for (let k = 0; k < rows.length; k += 2) out.push([tag, soundsSpec(rows.slice(k, k + 2), k / 2 + 1, Math.ceil(rows.length / 2))]); }
      if (t === 'grammar' && s.meta.lesson) out.push([tag, lessonSpec(s.title, s.meta.lesson)]);
      if (t === 'reading' && s.meta.passage) out.push([tag, passageSpec(s.meta.passage)]);
      if (t === 'checkin') out.push([tag, noteSpec(s.title, s.items[0].zh)]);
      if (t === 'speak') out.push([tag, echoSpec(s.items[0])]);
      if (t === 'weekly' || t === 'placement') out.push([tag, signSpec(t, s.title, s.items[0].zh)]);
    }
  });
  return out;
}
const SPECS = allSpecs();

test('wrapping: Chinese breaks anywhere but never opens a line with punctuation; English between words', () => {
  const zh = '欢迎来上第一课！今天的目标很简单：认识 8 个元音，记住星期和月份。发音不标准完全没关系，第一天只要"认识它们"就赢了。';
  const lines = wrap(zh, 600, 56);
  assert.ok(lines.length >= 3);
  for (const l of lines) { assert.ok(approxMeasure(l, 56) <= 600 + 1, l); assert.ok(!/^[，。、！？；：）」』]/.test(l), `a line opens with punctuation: ${l}`); }
  assert.equal(lines.join('').replace(/\s/g, ''), zh.replace(/\s/g, ''), 'nothing lost');
  const en = 'Hi, I\'m Lily. I work from Monday to Friday. On Monday and Wednesday, I go to an English class after work.';
  const el = wrap(en, 700, 56);
  for (const l of el) assert.ok(approxMeasure(l, 56) <= 700 + 1 && !/^\s|\s$/.test(l));
  assert.equal(el.join(' '), en);
  assert.deepEqual(wrap('supercalifragilistic', 200, 56).join(''), 'supercalifragilistic', 'a long word breaks between letters, nothing lost');
  const c = clampLines(lines, 2, 600, 56);
  assert.ok(c.cut && c.lines.length === 2 && c.lines[1].endsWith('…'));
  assert.equal(charsOf(' a b '), 2);
});

test('every board of the three weeks: every text ≥ the minimum font, inside the canvas, hotspots inside and not overlapping', () => {
  assert.ok(SPECS.length > 150, `${SPECS.length} boards`);
  const kinds = new Set(SPECS.map(([, s]) => s.kind));
  for (const k of ['words', 'sounds', 'lesson', 'passage', 'note', 'echo', 'sign']) assert.ok(kinds.has(k), k);
  for (const [tag, spec] of SPECS) {
    const L = layoutBoard(spec);
    assert.ok(L.minFont >= BOARD.minFont, `${tag}: ${L.minFont} px`);
    assert.ok(L.H <= 930 && L.H > 200, `${tag}: H ${L.H}`);
    for (const op of L.ops) if (op.op === 'text') {
      assert.ok(op.y <= L.H + 1 && op.y - op.px >= -1, `${tag}: "${op.text}" off the canvas`);
      if (op.align === 'left') assert.ok(op.x + approxMeasure(op.text, op.px, op.weight) <= L.W - BOARD.pad * 0.5 + 2, `${tag}: "${op.text}" past the right edge`);
    }
    for (const h of L.hotspots) assert.ok(h.x >= 0 && h.y >= 0 && h.x + h.w <= L.W && h.y + h.h <= L.H + 1, `${tag}: hotspot ${h.id} inside`);
    for (let i = 0; i < L.hotspots.length; i++) for (let j = i + 1; j < L.hotspots.length; j++) {
      const a = L.hotspots[i], b = L.hotspots[j];
      assert.ok(a.x + a.w <= b.x + 1 || b.x + b.w <= a.x + 1 || a.y + a.h <= b.y + 1 || b.y + b.h <= a.y + 1, `${tag}: ${a.id} / ${b.id} overlap`);
    }
    // what a board needs: the word boards a row per word + 跟读; the echo booth its three; a cut text 看全文
    if (spec.kind === 'words') { assert.equal(L.hotspots.filter((h) => h.id.startsWith('row:')).length, spec.rows.length, tag); assert.ok(L.hotspots.some((h) => h.id === 'follow')); }
    if (spec.kind === 'echo') for (const id of ['replay', 'done', 'classic']) assert.ok(L.hotspots.some((h) => h.id === id), `${tag}: ${id}`);
    if (spec.kind === 'sign') assert.ok(L.hotspots.some((h) => h.id === 'classic'), tag);
    if (L.cut) assert.ok(L.hotspots.some((h) => h.id === 'more') && L.full && L.full.length, `${tag}: cut, so 看全文`);
  }
});

test('the long texts: the 200-character note and the passages show their start and 看全文; the strip gets all of it', () => {
  const notes = SPECS.filter(([, s]) => s.kind === 'note'), pas = SPECS.filter(([, s]) => s.kind === 'passage');
  const longest = notes.reduce((a, b) => (charsOf(b[1].blocks[0].text) > charsOf(a[1].blocks[0].text) ? b : a));
  assert.ok(charsOf(longest[1].blocks[0].text) >= 150, 'the longest teacher\'s note is long');
  const L = layoutBoard(longest[1]);
  const shown = L.ops.filter((o) => o.op === 'text' && o.px === BOARD.body).map((o) => o.text).join('');
  assert.ok(shown.length > 30, 'the board shows the start');
  if (L.cut) assert.equal(L.full[0].text, longest[1].blocks[0].text, 'the strip has every character');
  for (const [tag, s] of pas) {
    const P = layoutBoard(s);
    assert.ok(P.cut, `${tag}: a passage does not fit a board`);
    assert.ok(P.hotspots.some((h) => h.id === 'more') && P.hotspots.some((h) => h.id === 'listen'), tag);
    assert.ok(P.full.some((b) => b.t === 'en' && b.text.length > 300), `${tag}: the whole passage in the strip`);
  }
});

test('framed on a phone either way, every board reads at ≥ 17 px and every hotspot is ≥ 44 pt to a thumb', () => {
  const W0 = LEARN.board.w;
  for (const [tag, spec] of SPECS) {
    const L = layoutBoard(spec), h = (W0 * L.H) / L.W;
    for (const [W, H] of SCREENS) {
      const f = frameBoard({ w: W0 + 0.14, h: h + 0.14, bottom: LEARN.board.bottom - 0.07 }, W / H, { W, H });
      assert.ok(f.fits, `${tag} ${W}×${H}: the board fits the band`);
      const scale = (f.rect.w * (W0 / (W0 + 0.14))) / L.W;   // screen px per canvas px (the face inside the slab's rim)
      const font = L.minFont * scale;
      assert.ok(font >= LEARN.board.font - 0.01, `${tag} ${W}×${H}: smallest text ${font.toFixed(1)} px`);
      // hotspots: drawn ≥ 44 high or wide enough — and pickHotspot raises any to 44 round its centre
      for (const hs of L.hotspots) assert.ok(hs.h * scale >= 30, `${tag} ${W}×${H}: ${hs.id} ${(hs.h * scale).toFixed(0)} px tall drawn`);
    }
  }
  // the board stands over her head: from the framing camera her head (1.45 m, at the viewing spot) is under its lower edge
  for (const [W, H] of SCREENS) {
    const f = frameBoard({ w: 2.44, h: 2.0, bottom: LEARN.board.bottom - 0.07 }, W / H, { W, H });
    const camY = f.pos[1], d = f.pos[2], head = Math.atan2(1.5 - camY, d - LEARN.board.view), edge = Math.atan2(LEARN.board.bottom - camY, d);
    assert.ok(head < edge, `${W}×${H}: her head below the board's edge on the screen`);
  }
});

test('hotspot picking: ≥ 44 pt round any hotspot, nearest wins, nothing outside', () => {
  const rects = [{ x: 100, y: 100, w: 20, h: 20 }, { x: 150, y: 100, w: 120, h: 40 }];
  assert.equal(pickHotspot(110, 110, rects), 0);
  assert.equal(pickHotspot(110 + 28, 110, rects), 0, 'the 20 px button is 44 + slop to a thumb');
  assert.equal(pickHotspot(200, 120, rects), 1);
  assert.equal(pickHotspot(146, 110, rects), 1, 'in both grown boxes: the nearer own box');
  assert.equal(pickHotspot(400, 400, rects), -1);
  const L = layoutBoard(wordsSpec([{ en: 'Monday', ipa: 'ˈmʌndeɪ', zh: '星期一' }]));
  const b = canvasToBoard(L.hotspots[0], L, 2.3, (2.3 * L.H) / L.W);
  assert.ok(b[0] < b[2] && b[1] < b[3] && Math.abs(b[0]) <= 1.15 + 1e-9);
  assert.deepEqual(packCells([{ w: 10, h: 5 }, { w: 10, h: 8 }, { w: 10, h: 5 }], 22).rects.map((r) => [r.x, r.y]), [[0, 0], [12, 0], [0, 10]]);
});

test('boards along the approach: before the gate, to her right, facing her, gap apart, the last nearest the gate', () => {
  const route = []; for (let z = 0; z <= 30; z += 1) route.push({ x: 0, y: 0, z });   // she walks +Z to a gate at z = 30
  const S = boardSpots(route, 3);
  assert.equal(S.length, 3);
  assert.ok(S[0].z < S[1].z && S[1].z < S[2].z && S[2].z < 30, 'in walking order, before the gate');
  assert.ok(Math.abs(S[1].z - S[0].z - LEARN.board.gap) < 0.7);
  for (const s of S) {
    assert.ok(s.x < 0, 'her right is −X walking +Z');
    assert.ok(Math.cos(s.yaw) < -0.8, 'facing back down the route, towards her');
    assert.ok(s.view.z < s.z, 'the viewing spot is on her side');
  }
});

test('play-8: a stretch too short for its boards (a whole day\'s first gate near the spawn) — they close up, then take both sides of the route; never two on one spot, all before the gate', () => {
  for (const [len, n] of [[12, 4], [9, 4], [16, 5], [7, 3], [30, 4]]) {
    const route = []; for (let z = 0; z <= len; z += 0.5) route.push({ x: 0, y: 0, z });
    const S = boardSpots(route, n);
    assert.equal(S.length, n);
    for (const s of S) assert.ok(s.z >= -0.01 && s.z < len, `${len} m / ${n}: before the gate (${s.z.toFixed(2)})`);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      const a = S[i], b = S[j], dB = Math.hypot(a.x - b.x, a.z - b.z), dV = Math.hypot(a.view.x - b.view.x, a.view.z - b.view.z);
      assert.ok(dB >= 1.39 && dV >= 1.0, `${len} m / ${n}: boards ${i}, ${j} apart (${dB.toFixed(2)} m, views ${dV.toFixed(2)} m)`);
      if (a.x * b.x > 0) assert.ok(Math.abs(a.z - b.z) >= 2.79, `${len} m / ${n}: two on one side a board's width apart`);
    }
    for (const s of S) assert.ok(s.view.z < s.z + 1e-6, 'each faces her coming');
  }
  // a long enough stretch: as before — her right, gap apart
  const route = []; for (let z = 0; z <= 30; z++) route.push({ x: 0, y: 0, z });
  assert.ok(boardSpots(route, 3).every((s) => s.x < 0));
});

function walkOf() {
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(52, 390 / 844, 0.1, 300);
  const W = new BoardWalk({ scene, camera, color: '#ff8a14' });
  const steps = daySteps(weeks[0], 1), words = steps.find((s) => s.meta.type === 'words').items, read = steps.find((s) => s.meta.type === 'reading');
  W.prepare('g1', [wordsSpec(words.slice(0, 5).map((it) => ({ en: it.en, ipa: it.meta.ipa, zh: it.zh })), 1, 5), passageSpec(read.meta.passage)]);
  const route = []; for (let z = 0; z <= 30; z++) route.push({ x: 0, y: 0, z });
  W.place('g1', boardSpots(route, 2));
  return { W, scene, camera };
}

test('play-8: two boards at one viewing spot — once the first is read, the other is framed where she stands (the auto-walk is not sent back to it for ever)', () => {
  const { W } = walkOf();
  W.clear();
  const route = []; for (let z = 0; z <= 30; z++) route.push({ x: 0, y: 0, z });
  const s = boardSpots(route, 1)[0];
  W.place('g1', [s, { ...s }]);
  const events = []; W.on.framed = (i) => events.push('framed' + i); W.on.read = (i) => events.push('read' + i);
  const her = new THREE.Vector3(s.view.x, 0, s.view.z);
  for (let k = 0; k < 200; k++) W.update(1 / 60, her, { aspect: 390 / 844, speed: 0 });
  assert.deepEqual(events, ['framed0', 'read0', 'framed1', 'read1']);
  assert.equal(W.nextSpot(), null, 'both read: on to the gate');
});

test('the walk: framed while she stands at a board, let go when she walks on; read after a moment; the next spot for the auto-walk', () => {
  const { W } = walkOf();
  const events = [];
  W.on.framed = (i) => events.push('framed' + i); W.on.read = (i) => events.push('read' + i);
  const her = new THREE.Vector3(0, 0, 2);
  W.update(1 / 60, her, { aspect: 390 / 844, speed: 3 });
  assert.equal(W.framed, -1);
  const s0 = W.nextSpot();
  assert.equal(s0.i, 0);
  her.set(s0.x, 0, s0.z);
  for (let k = 0; k < 90; k++) W.update(1 / 60, her, { aspect: 390 / 844, speed: 0 });
  assert.equal(W.framed, 0); assert.ok(W.framing && W.framing.pos.y > 2, 'a pose to spring to');
  assert.deepEqual(events, ['framed0', 'read0']);
  assert.equal(W.nextSpot().i, 1);
  assert.ok(W.inZone(her));
  // walking past at speed does not grab the camera for a frame
  her.set(0, 0, 45);
  W.update(1 / 60, her, { aspect: 390 / 844, speed: 4 });
  assert.equal(W.framed, -1, 'out of the zone: back to following her');
  assert.equal(W.framing, null);
  her.set(W.list[1].view.x, 0, W.list[1].view.z); W.update(1 / 60, her, { aspect: 390 / 844, speed: 4 });
  assert.equal(W.framed, -1, 'walking through at speed: not yet');
  for (let k = 0; k < 30; k++) W.update(1 / 60, her, { aspect: 390 / 844, speed: 4 });
  assert.equal(W.framed, 1, 'she lingers: framed');
  // turning the phone re-frames
  const p0 = W.framing.pos.clone();
  W.update(1 / 60, her, { aspect: 844 / 390, speed: 0 });
  assert.ok(W.framing.pos.distanceTo(p0) > 0.01);
});

test('the reading strip: 看全文 opens it at the board; it closes when she walks on; it never opens while a question is up', () => {
  const { W } = walkOf();
  const s1 = W.list[1].view, her = new THREE.Vector3(s1.x, 0, s1.z);
  for (let k = 0; k < 30; k++) W.update(1 / 60, her, { aspect: 1, speed: 0 });
  assert.equal(W.framed, 1);
  assert.equal(W.activate('more'), true);
  assert.equal(W.strip.isOpen, true);
  her.z += 6; W.update(1 / 60, her, { aspect: 1, speed: 3 });
  assert.equal(W.strip.isOpen, false, 'walking on closes it');
  her.z -= 6; for (let k = 0; k < 30; k++) W.update(1 / 60, her, { aspect: 1, speed: 0 });
  W.activate('more'); assert.equal(W.strip.isOpen, true);
  W.questionUp = true;
  assert.equal(W.strip.isOpen, false, 'a question comes up: it closes');
  W.activate('more'); assert.equal(W.strip.isOpen, false, 'and will not open');
  W.questionUp = false;
  W.activate('more'); assert.equal(W.strip.isOpen, true);
  const spoken = []; W.on.speak = (t) => spoken.push(t);
  W.activate('listen'); assert.ok(spoken[0].startsWith('Hi, I\'m Lily'));
  assert.equal(ReadStrip.owns({ target: null }), false);
});
