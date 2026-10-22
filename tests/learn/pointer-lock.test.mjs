// 学习版 (LEARN §51): the game in a frame sandboxed without allow-pointer-lock (Claude's viewer around the learning version)
// gets every pointer-lock request refused, each with a console error — it asks once and never again on that page. Every other
// refusal (a gesture missing, an option unsupported, the user's own unlock just before) as before: a plain retry, and the next
// requestLock asks again. A touch device never asks.
import test from 'node:test';
import assert from 'node:assert/strict';

const nop = () => {};
globalThis.window = { addEventListener: nop, removeEventListener: nop };
globalThis.document = { addEventListener: nop, removeEventListener: nop, pointerLockElement: null, exitPointerLock: nop };
const { Input } = await import('../../src/core/input.js');

// (Chromium's words for a sandboxed frame; the other two are its refusals of a lock that may come later)
const SANDBOXED = "Blocked pointer lock on an element because the element's frame is sandboxed and the 'allow-pointer-lock' permission is not set.";
const EXITED = 'The user has exited the lock before this request was completed.';
const canvas = (refuse) => { const calls = []; return { calls, requestPointerLock(o) { calls.push(o === undefined ? 'plain' : o); return refuse(o); } }; };
const tick = () => new Promise((r) => setTimeout(r, 0));

test('a sandboxed frame (no allow-pointer-lock): asked once — no plain retry, no request on the next answer or resume', async () => {
  const c = canvas(() => Promise.reject(new DOMException(SANDBOXED, 'SecurityError')));
  const input = new Input(c);
  input.requestLock();
  await tick();
  assert.deepEqual(c.calls, [{ unadjustedMovement: true }]);
  assert.equal(input._noLock, true);
  input.requestLock(); input.requestLock();
  await tick();
  assert.equal(c.calls.length, 1, 'never again on this page');
  assert.equal(input.locked, false);
});

test('an engine that throws the sandbox refusal instead of rejecting: the same', async () => {
  const c = canvas(() => { throw new DOMException(SANDBOXED, 'SecurityError'); });
  const input = new Input(c);
  input.requestLock(); input.requestLock();
  await tick();
  assert.deepEqual(c.calls, [{ unadjustedMovement: true }]);
  assert.equal(input._noLock, true);
});

test('every other refusal as before: the plain retry, and the next requestLock asks again', async () => {
  for (const [msg, name] of [['A user gesture is required to request Pointer Lock.', 'NotAllowedError'], ['The options asked for in this request are not supported on this platform.', 'NotSupportedError'], [EXITED, 'SecurityError']]) {
    const c = canvas(() => Promise.reject(new DOMException(msg, name)));
    const input = new Input(c);
    input.requestLock();
    await tick(); await tick();
    assert.deepEqual(c.calls, [{ unadjustedMovement: true }, 'plain'], name + ': the plain retry');
    assert.equal(input._noLock, false, name);
    input.requestLock();
    await tick(); await tick();
    assert.equal(c.calls.length, 4, name + ': asked again');
  }
  // a lock that is granted: one request, nothing remembered
  const ok = canvas(() => Promise.resolve());
  const input = new Input(ok);
  input.requestLock();
  await tick();
  assert.deepEqual(ok.calls, [{ unadjustedMovement: true }]);
  assert.equal(input._noLock, false);
});

test('a touch device never asks (no pointer to lock)', async () => {
  const c = canvas(() => Promise.resolve());
  const input = new Input(c);
  input.setTouchMode(true);
  input.requestLock();
  await tick();
  assert.deepEqual(c.calls, []);
});
