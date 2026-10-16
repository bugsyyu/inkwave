// 字弹 M4 — the 打字蟹 type rig (src/learn/play/type/rig.js, deck-geo.js, atlas.js, mats.js) built in Node:
//   · every key has a 3D cap (one InstancedMesh instance), every printable key a type-bar and a glyph cell
//   · the no-leak rule (PLAY §1.3): before 射 nothing can colour a key or a letter by whether it is right — the rig and
//     the keyboard take no answer, and the same keystrokes leave the same pixels-to-be (instance colours / matrices,
//     the glyph grid, the ink uniform) whatever the answer will turn out to be
//   · the carriage / paper model (wrap at the bell, hard wrap, ⌫ across a line)
//   · coral is never a team colour
// 用法：node --test tests/learn/*.test.mjs
import { register } from 'node:module';
register(new URL('./three-hook.mjs', import.meta.url));   // `three` → vendor/ (no npm install here)
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ALL_KEYS, PRINTABLE, DECK_ROWS, deckCaps } from '../../src/learn/play/type/keys.js';
import { LEARN, TEAM_PALETTES } from '../../src/config.js';
// three and everything that imports it come in after the hook is registered (static imports resolve first)
const THREE = await import('three');
const { getTypeRigGeo, DECK } = await import('../../src/learn/play/type/deck-geo.js');
const { glyphCell, GLYPH_KEYS, ATLAS } = await import('../../src/learn/play/type/atlas.js');
const { TypeRig, paperModel, paperType, paperBack } = await import('../../src/learn/play/type/rig.js');
const { TypeShot } = await import('../../src/learn/play/type/shot.js');

const T = LEARN.type;
function mockActor() {
  const calls = [];
  const character = { weaponHidden: false, weapon: { pivot: { visible: true } }, trigger: (n) => calls.push(n) };
  return { character, pos: new THREE.Vector3(0, 0, 0), yaw: 0, team: 0, calls };
}
const step = (o, s, dt = 1 / 60) => { for (let i = 0; i < Math.round(s / dt); i++) o.update(dt); };

test('every key has exactly one 3D cap; every printable key a type-bar; every key a glyph cell', () => {
  const g = getTypeRigGeo();
  const capKeys = g.caps.map((c) => c.key);
  assert.equal(new Set(capKeys).size, capKeys.length, 'no key twice');
  assert.deepEqual(capKeys.slice().sort(), ALL_KEYS.slice().sort(), 'the caps are exactly the key set');
  assert.deepEqual(DECK_ROWS.flat().map((r) => r[0]).sort(), ALL_KEYS.slice().sort());
  assert.deepEqual(g.bars.map((b) => b.key).sort(), PRINTABLE.slice().sort());
  for (const k of ALL_KEYS) { const c = glyphCell(k); assert.ok(c >= 0 && c < ATLAS.cols * ATLAS.rows, `${k} → cell ${c}`); }
  assert.equal(new Set(GLYPH_KEYS).size, GLYPH_KEYS.length);
  // the caps do not overlap on the plate (key units, centre ± half width; rows one unit apart)
  const caps = deckCaps();
  for (let i = 0; i < caps.length; i++) for (let j = i + 1; j < caps.length; j++) {
    const a = caps[i], b = caps[j];
    if (a.z !== b.z) continue;
    assert.ok(Math.abs(a.x - b.x) >= (a.w + b.w) / 2 - 1e-9, `${a.key} / ${b.key} overlap`);
  }
  // the type-bars reach the strike point from their pivots (the platen face)
  for (const b of g.bars) {
    const tip = new THREE.Vector3(0, DECK.barL, 0).applyQuaternion(b.strike).add(b.pivot);
    assert.ok(tip.distanceTo(DECK.strike) < 1e-6, `${b.key} strikes the platen`);
  }
});

test('the rig in Node: a key press moves its own cap + bar in the same call, prints on impact, steps the carriage', () => {
  const rig = new TypeRig({ team: 0, color: '#ff8a14' });
  const a = mockActor();
  rig.mount(a);
  step(rig, 0.5);   // settle the mount squash
  assert.equal(a.character.weaponHidden, true, 'the weapon is hidden like the crab does it');
  assert.equal(a.learnSeat, getTypeRigGeo().seatAt.y, 'the kid is seated (actor.learnSeat)');
  const i = rig.keyIndex.get('j'), b = rig.barIndex.get('j');
  assert.ok(rig.press('j'));
  assert.ok(rig.capState[i * 4] > 0, 'the cap is already moving');
  assert.equal(rig.capAttr.getZ(i), 1, 'and lit');
  assert.equal(rig.barState[b * 3 + 2], 1, 'its type-bar swings');
  assert.equal(a.calls.at(-1), 'shoot', 'the kid hits the key (character.trigger)');
  const x0 = rig.carriage.position.x;
  assert.equal(rig.textTex.image.data[0], 0, 'nothing printed before the bar lands');
  step(rig, 0.2);
  assert.equal(rig.textTex.image.data[0], glyphCell('j') + 1, 'the glyph printed at column 0');
  assert.ok(rig.carriage.position.x > x0, 'the carriage stepped (toward her left, +X)');
  assert.equal(rig.text, 'j');
  rig.backspace(); step(rig, 0.1);
  assert.equal(rig.text, ''); assert.equal(rig.textTex.image.data[0], 0, '⌫ wiped it');
  rig.unmount();
  assert.equal(a.character.weaponHidden, false); assert.equal(a.learnSeat, 0);
});

// snapshot of everything a viewer could see of the rig's colours and letters
function look(rig) {
  return JSON.stringify({
    lit: Array.from(rig.capAttr.array), caps: Array.from(rig.caps.instanceMatrix.array).map((v) => +v.toFixed(5)),
    glyphs: Array.from(rig.textTex.image.data), ink: rig.paperMat.userData.uniforms.uInk.value.getHexString(),
    team: rig.capMat.userData.uniforms.uTeam.value.getHexString(), legend: rig.capMat.userData.uniforms.uLegend.value.getHexString(),
  });
}

test('no leak (PLAY §1.3): before 射 the same keystrokes look the same whether the answer will be right or wrong', () => {
  // the item is "receive"; one player types it right, one types "recieve" — compare key by key while they share a prefix,
  // and compare whole runs of the SAME keystrokes under two different answers (the rig can't be told the answer at all)
  const run = (keys, answer) => {
    const shot = new TypeShot({ team: 0, color: '#ff8a14' });
    shot.mount(mockActor());
    shot.begin({ mode: 'word', target: new THREE.Vector3(0, 1.4, 6.5), answer });   // an extra field is ignored
    const frames = [];
    for (const k of keys) { shot.key(k); step(shot, 0.12); frames.push(look(shot.rig)); }
    return frames;
  };
  const right = run('receive', 'receive'), wrong = run('receive', 'recieve');
  assert.deepEqual(right, wrong, 'identical frames for identical keys, whatever the answer');
  const typo = run('recieve', 'receive');
  assert.deepEqual(typo.slice(0, 3), right.slice(0, 3), 'the shared prefix looks the same');
  // the colours a press can produce: her team colour on the cap, the neutral grey on the paper — constants
  const rig = new TypeRig({ team: 0, color: '#ff8a14' });
  const ink0 = rig.paperMat.userData.uniforms.uInk.value.getHexString();
  assert.equal('#' + ink0, T.glyph.toLowerCase());
  for (const k of 'qzx') rig.press(k);
  step(rig, 0.3);
  assert.equal(rig.paperMat.userData.uniforms.uInk.value.getHexString(), ink0, 'the ink never changes');
  assert.equal(rig.capMat.userData.uniforms.uTeam.value.getHexString(), new THREE.Color('#ff8a14').getHexString());
  // no API before 射 takes an answer
  assert.equal(TypeRig.prototype.press.length, 1);
  assert.equal(TypeRig.prototype.backspace.length, 0);
  assert.equal(TypeShot.prototype.key.length, 1);
  assert.equal(TypeShot.prototype.submit.length, 0);
});

test('no leak, static: the rig, its materials, the keys and the on-screen keyboard never read a verdict', () => {
  const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  for (const f of ['src/learn/play/type/rig.js', 'src/learn/play/type/mats.js', 'src/learn/play/type/keys.js', 'src/learn/play/type/atlas.js', 'src/learn/play/type/deck-geo.js', 'src/ui/play-keys.js']) {
    const code = strip(readFileSync(new URL('../../' + f, import.meta.url), 'utf8'));
    for (const bad of [/\bjudge\b/, /\bcanonical\b/, /\banswer\b/, /\bverdict\b/, /\.ok\b/, /\bcorrect\b/, /\bcoral\b/, /\bpct\b/]) assert.ok(!bad.test(code), `${f} mentions ${bad}`);
  }
});

test('coral is never a team colour (LEVELS §5) and differs from the neutral inks', () => {
  const coral = new THREE.Color(T.coral);
  const far = (hex) => { const c = new THREE.Color(hex); return Math.abs(c.r - coral.r) + Math.abs(c.g - coral.g) + Math.abs(c.b - coral.b); };
  for (const p of TEAM_PALETTES) for (const hex of [p.a, p.b]) assert.ok(far(hex) > 0.25, `coral vs ${p.id} ${hex}: ${far(hex).toFixed(2)}`);
  assert.ok(far(T.word) > 0.25 && far(T.glyph) > 0.25);
});

test('paper model: a space at the bell returns the carriage, a full line wraps, ⌫ goes back up a line', () => {
  const pm = paperModel();
  for (let i = 0; i < T.wrapAt; i++) paperType(pm, 'a');
  assert.deepEqual(pm.lines, [T.wrapAt]);
  const r = paperType(pm, ' ');
  assert.ok(r.ret && r.col === -1, 'the space became a carriage return');
  assert.equal(pm.line, 1); assert.equal(pm.col, 0);
  const pm2 = paperModel();
  for (let i = 0; i < DECK.cols; i++) paperType(pm2, 'b');
  const w = paperType(pm2, 'c');
  assert.ok(w.ret && w.col === 0 && w.line === 1, 'a letter past the last column goes to the next line');
  assert.deepEqual(paperBack(pm2), { col: 0, line: 1, back: false, empty: false });
  const up = paperBack(pm2);
  assert.ok(up.back && !up.empty && up.line === 0 && up.col === DECK.cols - 1, '⌫ at the start of a wrapped line erases the last letter above');
  const sp = paperBack(pm);
  assert.ok(sp.back && sp.empty && sp.line === 0 && sp.col === T.wrapAt, '⌫ over a space-return only un-returns');
  assert.equal(paperBack(paperModel()), null, 'nothing to erase on a fresh sheet');
  // the text and the paper agree, whatever is typed and erased
  const pm3 = paperModel(); let text = '';
  const seq = 'the quick brown fox jumps over the lazy dog again\b\b\b\b\b\bxyzzyxyzzyxyzzy\b\b';
  for (const ch of seq) {
    if (ch === '\b') { if (text) { paperBack(pm3); text = text.slice(0, -1); } }
    else { paperType(pm3, ch); text += ch; }
    const glyphs = pm3.lines.reduce((a, n) => a + n, 0) + pm3.wraps.filter((w) => w === 'space').length;
    assert.equal(glyphs, text.length, `after ${JSON.stringify(text)}`);
  }
});

test('every sound the rig and the ink word play is a CONTRACTS §2 name (PLAY §1.8), never ui_error', () => {
  const doc = readFileSync(new URL('../../docs/CONTRACTS.md', import.meta.url), 'utf8');
  const sec = doc.slice(doc.indexOf('SFX names (all must exist)'), doc.indexOf('Music: original'));
  const names = new Set((sec.match(/`([^`]+)`/g) || []).flatMap((s) => s.slice(1, -1).split(/\s+/)).map((n) => n.replace(/\(.*$/, '')).filter(Boolean));
  assert.ok(names.has('ui_click') && names.has('bomb_throw') && names.size > 40, 'the contract list parsed');
  for (const f of ['src/learn/play/type/rig.js', 'src/learn/play/type/inkword.js']) {
    const src = readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
    const used = [...src.matchAll(/_play\('([a-z_]+)'/g)].map((m) => m[1]);
    assert.ok(used.length, f);
    for (const n of used) { assert.ok(names.has(n), `${f}: ${n} is not in CONTRACTS §2`); assert.notEqual(n, 'ui_error'); }
  }
});
