// What her App says about the device (IELTS-Base ios HighRefresh.swift puts it in the page): window.__IELTS_NATIVE.display =
// { maxFps, highRefresh } (a ProMotion screen with WebKit's 60 fps clamp off: rAF at 120) and .device = { model, memGB, cores }.
// A web browser or a dev machine has none of it: cls null, and the game renders as it always has (no render steps).

// 'top' | 'high' | 'base' for an Apple model id ('iPhone16,1', 'iPad16,3') and its memory; null when there is no model.
// iPhones by chip generation (the N of iPhoneN,m): 16 on = A17 Pro and later → top; 15 = A16 → high; 14 = A15 → high with the
// 6 GB Pros, base with 4 GB; 13 and older → base. iPads by memory: 8 GB on (M-class) top, 6 GB high, else base.
export function deviceClass(model, memGB) {
  const m = /^(iPhone|iPad)(\d+),\d+$/.exec(String(model || ''));
  if (!m) return null;
  const n = +m[2], mem = +memGB || 0;
  if (m[1] === 'iPad') return mem >= 8 ? 'top' : mem >= 6 ? 'high' : 'base';
  if (n >= 16) return 'top';
  if (n === 15) return 'high';
  if (n === 14) return mem >= 5.5 ? 'high' : 'base';
  return 'base';
}

export function deviceInfo(win = globalThis) {
  let N = null;
  try { N = win && win.__IELTS_NATIVE; } catch { /* a cross-origin frame */ }
  const dev = (N && N.device) || {}, dis = (N && N.display) || {};
  const model = typeof dev.model === 'string' ? dev.model : null, memGB = +dev.memGB || 0;
  return {
    native: !!N, model, memGB, cores: +dev.cores || 0,
    maxFps: +dis.maxFps || 0, highRefresh: dis.highRefresh === true,
    cls: deviceClass(model, memGB),
  };
}
