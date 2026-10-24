/* Runs the user's sketch in isolation. Network APIs are removed before user code runs. */
importScripts('transpile.js');
/* Whitelist sandbox: capture what we need, then strip every other global from self and its prototype chain,
 * so even (()=>{}).constructor('return this')() sees no network, storage, workers or navigator. */
const transpile = Transpile.transpile;
const post = self.postMessage.bind(self);
const now = performance.now.bind(performance);
const _setTimeout = setTimeout.bind(self);
let handler = null;
self.addEventListener('message', e => handler && handler(e));
const KEEP = new Set(['Object', 'Function', 'Array', 'Number', 'parseFloat', 'parseInt', 'Infinity', 'NaN', 'undefined', 'Boolean', 'String', 'Symbol',
  'Date', 'Promise', 'RegExp', 'Error', 'AggregateError', 'EvalError', 'RangeError', 'ReferenceError', 'SyntaxError', 'TypeError', 'URIError',
  'globalThis', 'JSON', 'Math', 'Intl', 'ArrayBuffer', 'Uint8Array', 'Int8Array', 'Uint16Array', 'Int16Array', 'Uint32Array', 'Int32Array',
  'Float32Array', 'Float64Array', 'Uint8ClampedArray', 'BigUint64Array', 'BigInt64Array', 'DataView', 'Map', 'BigInt', 'Set', 'WeakMap', 'WeakSet',
  'Proxy', 'Reflect', 'decodeURI', 'decodeURIComponent', 'encodeURI', 'encodeURIComponent', 'escape', 'unescape', 'eval', 'isFinite', 'isNaN',
  'console', 'setTimeout', 'clearTimeout', 'self', 'constructor']);
for (let o = self; o && o !== Object.prototype; o = Object.getPrototypeOf(o)) {
  for (const k of Reflect.ownKeys(o)) {
    if (typeof k !== 'string' || KEEP.has(k)) continue;
    try { delete o[k]; } catch (e) {}
    if (Object.getOwnPropertyDescriptor(o, k)) { try { Object.defineProperty(o, k, { value: undefined, writable: false, configurable: false }); } catch (e) {} }
  }
}
let inputs = {}, t0 = now();
handler = e => {
  const m = e.data;
  if (m.t === 'in') inputs = m.v;
  else if (m.t === 'start') start(m.code, m.board);
};
const hb = () => post({ t: 'hb' });
const start = function (code, board) {
  const out = s => post({ t: 'log', s: String(s) });
  const pinOut = (pin, mode, val) => post({ t: 'pin', pin: +pin, mode, val });
  const V = p => inputs[+p] ?? 0;
  const rt = {
    HIGH: 1, LOW: 0, INPUT: 'INPUT', OUTPUT: 'OUTPUT', INPUT_PULLUP: 'INPUT_PULLUP', true: true,
    LED_BUILTIN: 2, D0: 16, D1: 5, D2: 4, D3: 0, D4: 2, D5: 14, D6: 12, D7: 13, D8: 15, A0: board === 'esp8266' ? 17 : 36,
    pinMode: (p, m) => pinOut(p, m, null),
    digitalWrite: (p, v) => pinOut(p, null, v ? 1 : 0),
    analogWrite: (p, v) => pinOut(p, null, Math.max(0, Math.min(255, v)) / 255),
    digitalRead: p => V(p) > 1.65 ? 1 : 0,
    analogRead: p => Math.round(Math.max(0, Math.min(3.3, V(p))) / 3.3 * (board === 'esp8266' ? 1023 : 4095)),
    delay: ms => { hb(); return new Promise(r => _setTimeout(r, Math.max(0, ms))); },
    delayMicroseconds: us => new Promise(r => _setTimeout(r, us / 1000)),
    millis: () => Math.floor(now() - t0), micros: () => Math.floor((now() - t0) * 1000),
    map: (x, a, b, c, d) => Math.trunc((x - a) * (d - c) / (b - a) + c),
    constrain: (x, a, b) => Math.min(b, Math.max(a, x)),
    random: (a, b) => b === undefined ? Math.floor(Math.random() * a) : Math.floor(a + Math.random() * (b - a)),
    min: Math.min, max: Math.max, abs: Math.abs, sqrt: Math.sqrt, pow: Math.pow, round: Math.round,
    Serial: { begin() {}, print: s => out(s), println: (s = '') => out(String(s) + '\n') },
  };
  let js;
  try { js = transpile(code); } catch (e) { post({ t: 'err', s: 'Ошибка разбора: ' + e.message }); return; }
  const names = Object.keys(rt).filter(k => k !== 'true');
  const shadow = ['self', 'globalThis', 'fetch', 'importScripts', 'XMLHttpRequest', 'WebSocket', 'navigator', 'postMessage', 'Worker'];
  let fn;
  try {
    fn = new Function(...names, ...shadow, `"use strict";\n${js}\n;return {setup: typeof setup==='function'?setup:null, loop: typeof loop==='function'?loop:null};`);
  } catch (e) { post({ t: 'err', s: 'Ошибка компиляции: ' + e.message + '\n--- JS ---\n' + js }); return; }
  (async () => {
    try {
      const { setup, loop } = fn(...names.map(k => rt[k]), ...shadow.map(() => undefined));
      t0 = now();
      if (setup) await setup();
      hb();
      if (loop) for (;;) { await loop(); hb(); await new Promise(r => _setTimeout(r, 0)); }
    } catch (e) { post({ t: 'err', s: 'Ошибка выполнения: ' + e.message }); }
  })();
}
