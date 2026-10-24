/* Runs the user's sketch in isolation. Network APIs are removed before user code runs. */
importScripts('transpile.js?v=6', 'memcap.js?v=6');
/* Whitelist sandbox: capture what we need, then strip every other global from self and its prototype chain,
 * so even (()=>{}).constructor('return this')() sees no network, storage, workers or navigator. */
const transpile = Transpile.transpile, pyT = Transpile.py, memInstall = MemCap.install;
const post = self.postMessage.bind(self);
const now = performance.now.bind(performance);
const _setTimeout = setTimeout.bind(self);
const _OC = self.OffscreenCanvas, _cib = self.createImageBitmap ? self.createImageBitmap.bind(self) : null;
const _Array = Array, _typed = [Int8Array, Uint8Array, Uint8ClampedArray, Int16Array, Uint16Array, Int32Array, Uint32Array, Float32Array, Float64Array];
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
let inputs = {}, sensors = {}, t0 = now();
handler = e => {
  const m = e.data;
  if (m.t === 'in') { inputs = m.v || {}; sensors = m.s || {}; }
  else if (m.t === 'start') start(m.code, m.board, m.mods || {});
};
const hb = () => post({ t: 'hb' });
const BOARDS = {
  esp32: { vio: 3.3, bits: 4095, LED: 2, A: { A0: 36 } },
  esp8266: { vio: 3.3, bits: 1023, LED: 2, A: { A0: 17, D0: 16, D1: 5, D2: 4, D3: 0, D4: 2, D5: 14, D6: 12, D7: 13, D8: 15 } },
  uno: { vio: 5, bits: 1023, LED: 13, A: { A0: 14, A1: 15, A2: 16, A3: 17, A4: 18, A5: 19 } },
  atmega: { vio: 5, bits: 1023, LED: 13, A: { A0: 14, A1: 15, A2: 16, A3: 17, A4: 18, A5: 19 } },
  attiny: { vio: 5, bits: 1023, LED: 1, A: { A1: 2, A2: 4, A3: 3, PB0: 0, PB1: 1, PB2: 2, PB3: 3, PB4: 4 } },
  pico: { vio: 3.3, bits: 1023, LED: 25, A: { A0: 26, A1: 27, A2: 28 } },
  opi: { vio: 3.3, bits: 1023, LED: 99, A: {} },
};
const CAP = 100000;
const tooBig = n => { if (typeof n === 'number' && n > CAP) throw new RangeError('массив больше ' + CAP + ' элементов запрещён'); };
/* replace Array / TypedArrays / ArrayBuffer globals (and .constructor) with capped wrappers */
const CAPPED = memInstall(self, CAP);
const SafeArray = CAPPED.Array;

/* displays: everything is drawn to buffers here, posted at most 30 fps */
const makeDisplays = function (mods) {
  const dirty = new Set(), N = Math.max(0, Math.min(256, mods.strip | 0));
  const px = new _Array(N).fill(0), rows = new _Array(8).fill(0), lcdL = ['                ', '                '];
  let bright = 255, lcdC = 0, lcdR = 0;
  const mk = (w, h) => { if (!_OC) return null; const c = new _OC(w, h), g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, w, h); return { c, g }; };
  const O = mods.oled ? mk(128, 64) : null, Hd = mods.hdmi ? mk(1920, 1080) : null;
  let last = 0, timer = false, busy = false;
  const flush = () => { const t = now(); if (t - last < 33) { if (!timer) { timer = true; _setTimeout(() => { timer = false; flush(); }, 34 - (t - last)); } return; }
    last = t;
    for (const k of dirty) {
      if (k === 'strip') post({ t: 'mod', k, px: px.map(c => { const r = ((c >> 16) & 255) * bright / 255, g = ((c >> 8) & 255) * bright / 255, b = (c & 255) * bright / 255; return (r << 16) | (g << 8) | b; }) });
      else if (k === 'matrix') post({ t: 'mod', k, rows: rows.slice() });
      else if (k === 'lcd') post({ t: 'mod', k, lines: lcdL.slice() });
      else if ((k === 'oled' || k === 'hdmi') && _cib) { const D = k === 'oled' ? O : Hd; if (!D || busy) { if (busy) { dirty.add(k); continue; } continue; } busy = true;
        _cib(D.c).then(bmp => { busy = false; post({ t: 'frame', k, bmp }, [bmp]); }, () => { busy = false; }); }
    }
    dirty.clear(); };
  const mark = k => { dirty.add(k); };
  const col = (r, g, b) => g === undefined ? (r >>> 0) & 0xffffff : ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
  const strip = {
    begin() {}, show() { mark('strip'); flush(); }, clear() { px.fill(0); mark('strip'); }, numPixels: () => N, setBrightness(b) { bright = Math.max(0, Math.min(255, b | 0)); },
    Color: (r, g, b) => col(r, g, b), ColorHSV(h, s = 255, v = 255) { h = ((h % 65536) + 65536) % 65536 / 65536 * 6; const i = Math.floor(h), f = h - i, V = v, P = v * (1 - s / 255), Q = v * (1 - s / 255 * f), T = v * (1 - s / 255 * (1 - f)); const [r, g, b] = [[V, T, P], [Q, V, P], [P, V, T], [P, Q, V], [T, P, V], [V, P, Q]][i % 6]; return col(r, g, b); },
    setPixelColor(i, r, g, b) { i |= 0; if (i >= 0 && i < N) { px[i] = col(r, g, b); mark('strip'); } },
    getPixelColor: i => px[i | 0] || 0,
    fill(r, g, b) { px.fill(col(r ?? 0, g, b)); mark('strip'); },
    setXY(x, y, r, g, b) { const w = Math.round(Math.sqrt(N)); x |= 0; y |= 0; if (x >= 0 && y >= 0 && x < w && y < w) this.setPixelColor(y * w + x, r, g, b); },
  };
  strip.setPixel = strip.setPixelColor;
  const matrix = {
    set(x, y, on = 1) { x |= 0; y |= 0; if (x < 0 || y < 0 || x > 7 || y > 7) return; rows[y] = on ? rows[y] | (1 << x) : rows[y] & ~(1 << x); mark('matrix'); },
    row(y, bits) { y |= 0; if (y >= 0 && y < 8) { rows[y] = bits & 255; mark('matrix'); } }, clear() { rows.fill(0); mark('matrix'); }, show() { mark('matrix'); flush(); },
    // LedControl compatibility
    shutdown() {}, setIntensity() {}, clearDisplay() { matrix.clear(); }, setLed(a, r, c, s) { matrix.set(c, r, s); }, setRow(a, r, v) { matrix.row(r, v); },
  };
  const lcd = {
    init() {}, begin() {}, backlight() {}, noBacklight() {}, clear() { lcdL[0] = lcdL[1] = ' '.repeat(16); lcdC = lcdR = 0; mark('lcd'); },
    setCursor(c, r) { lcdC = Math.max(0, Math.min(15, c | 0)); lcdR = Math.max(0, Math.min(1, r | 0)); },
    print(s) { s = String(s).slice(0, 32); for (const ch of s) { if (lcdC > 15) break; const L = lcdL[lcdR]; lcdL[lcdR] = L.slice(0, lcdC) + ch + L.slice(lcdC + 1); lcdC++; } mark('lcd'); },
  };
  // OLED (Adafruit_SSD1306-like + simple API)
  let tx = 0, ty = 0, tsz = 1, tcol = 1;
  const og = () => O && O.g, oc = c => (c ? '#fff' : '#000');
  const oled = {
    begin() { return true; }, clearDisplay() { const g = og(); if (g) { g.fillStyle = '#000'; g.fillRect(0, 0, 128, 64); } tx = ty = 0; mark('oled'); }, display() { mark('oled'); flush(); },
    setTextSize(s) { tsz = Math.max(1, Math.min(4, s | 0)); }, setTextColor(c) { tcol = c ? 1 : 0; }, setCursor(x, y) { tx = x | 0; ty = y | 0; },
    print(s) { const g = og(); if (!g) return; s = String(s).slice(0, 200); g.fillStyle = oc(tcol); g.font = (8 * tsz) + 'px monospace'; g.textBaseline = 'top';
      for (const ch of s) { if (ch === '\n') { tx = 0; ty += 8 * tsz; continue; } g.fillText(ch, tx, ty); tx += 6 * tsz; if (tx > 122) { tx = 0; ty += 8 * tsz; } } mark('oled'); },
    println(s = '') { oled.print(String(s) + '\n'); },
    drawPixel(x, y, c = 1) { const g = og(); if (g) { g.fillStyle = oc(c); g.fillRect(x | 0, y | 0, 1, 1); mark('oled'); } },
    fillRect(x, y, w, h, c = 1) { const g = og(); if (g) { g.fillStyle = oc(c); g.fillRect(x, y, w, h); mark('oled'); } },
    drawRect(x, y, w, h, c = 1) { const g = og(); if (g) { g.strokeStyle = oc(c); g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); mark('oled'); } },
    drawLine(a, b, c2, d, c = 1) { const g = og(); if (g) { g.strokeStyle = oc(c); g.lineWidth = 1; g.beginPath(); g.moveTo(a + 0.5, b + 0.5); g.lineTo(c2 + 0.5, d + 0.5); g.stroke(); mark('oled'); } },
    drawCircle(x, y, r, c = 1) { const g = og(); if (g) { g.strokeStyle = oc(c); g.beginPath(); g.arc(x, y, Math.min(200, Math.abs(r)), 0, 7); g.stroke(); mark('oled'); } },
    fillCircle(x, y, r, c = 1) { const g = og(); if (g) { g.fillStyle = oc(c); g.beginPath(); g.arc(x, y, Math.min(200, Math.abs(r)), 0, 7); g.fill(); mark('oled'); } },
  };
  oled.clear = oled.clearDisplay; oled.text = (x, y, s) => { oled.setCursor(x, y); oled.print(s); }; oled.pixel = oled.drawPixel; oled.rect = oled.drawRect; oled.show = oled.display;
  // HDMI 1920x1080 screen for the Orange Pi
  const C = v => typeof v === 'string' ? v.slice(0, 40) : Array.isArray(v) ? `rgb(${v[0] | 0},${v[1] | 0},${v[2] | 0})` : '#fff';
  const hg = () => Hd && Hd.g;
  const screen = { width: 1920, height: 1080,
    fill(c = '#000') { const g = hg(); if (g) { g.fillStyle = C(c); g.fillRect(0, 0, 1920, 1080); mark('hdmi'); } },
    rect(x, y, w, h, c = '#fff', fill = true) { const g = hg(); if (!g) return; if (fill) { g.fillStyle = C(c); g.fillRect(x, y, w, h); } else { g.strokeStyle = C(c); g.lineWidth = 4; g.strokeRect(x, y, w, h); } mark('hdmi'); },
    circle(x, y, r, c = '#fff', fill = true) { const g = hg(); if (!g) return; g.beginPath(); g.arc(x, y, Math.min(4000, Math.abs(r)), 0, 7); if (fill) { g.fillStyle = C(c); g.fill(); } else { g.strokeStyle = C(c); g.lineWidth = 4; g.stroke(); } mark('hdmi'); },
    line(a, b, c2, d, c = '#fff', w = 4) { const g = hg(); if (!g) return; g.strokeStyle = C(c); g.lineWidth = Math.min(200, w); g.beginPath(); g.moveTo(a, b); g.lineTo(c2, d); g.stroke(); mark('hdmi'); },
    text(x, y, s, c = '#fff', size = 48) { const g = hg(); if (!g) return; g.fillStyle = C(c); g.font = Math.max(6, Math.min(400, size | 0)) + 'px sans-serif'; g.textBaseline = 'top'; g.fillText(String(s).slice(0, 500), x, y); mark('hdmi'); },
    show() { mark('hdmi'); flush(); },
  };
  return { strip, matrix, lcd, oled, screen, flush, dirty };
};

const start = function (code, board, mods) {
  const B = BOARDS[board] || BOARDS.esp32;
  const out = s => post({ t: 'log', s: String(s).slice(0, 2000) });
  const pinOut = (pin, mode, val) => post({ t: 'pin', pin: +pin, mode, val });
  const V = p => inputs[+p] ?? 0;
  const D = makeDisplays(mods);
  const delay = ms => { hb(); if (D.dirty.size) D.flush(); return new Promise(r => _setTimeout(r, Math.max(0, +ms || 0))); };
  const servo = { attach(p) { this.pin = p; }, write(a) { a = Math.max(0, Math.min(180, +a || 0)); this.a = a; post({ t: 'mod', k: 'servo', a }); }, read() { return this.a ?? 90; }, detach() {} };
  const dht = { begin() {}, readTemperature: () => +(sensors.temp ?? NaN), readHumidity: () => +(sensors.hum ?? NaN) };
  const sonar = { distanceCm: () => +(sensors.dist ?? 0), ping_cm: () => Math.round(+(sensors.dist ?? 0)) };
  const LIB = { Servo: () => servo, Adafruit_NeoPixel: () => D.strip, LiquidCrystal_I2C: () => D.lcd, Adafruit_SSD1306: () => D.oled, DHT: () => dht, LedControl: () => D.matrix, NewPing: () => sonar };
  const rt = {
    HIGH: 1, LOW: 0, INPUT: 'INPUT', OUTPUT: 'OUTPUT', INPUT_PULLUP: 'INPUT_PULLUP', true: true,
    LED_BUILTIN: B.LED, ...B.A,
    NEO_GRB: 0, NEO_RGB: 0, NEO_KHZ800: 0, DHT22: 22, DHT11: 11, SSD1306_SWITCHCAPVCC: 2, WHITE: 1, BLACK: 0, SSD1306_WHITE: 1, SSD1306_BLACK: 0,
    pinMode: (p, m) => pinOut(p, m, null),
    digitalWrite: (p, v) => pinOut(p, null, v ? 1 : 0),
    analogWrite: (p, v) => pinOut(p, null, Math.max(0, Math.min(255, v)) / 255),
    digitalRead: p => V(p) > B.vio / 2 ? 1 : 0,
    analogRead: p => Math.round(Math.max(0, Math.min(B.vio, V(p))) / B.vio * B.bits),
    tone: p => pinOut(p, 'OUTPUT', 1), noTone: p => pinOut(p, null, 0),
    delay, delayMicroseconds: us => new Promise(r => _setTimeout(r, us / 1000)),
    millis: () => Math.floor(now() - t0), micros: () => Math.floor((now() - t0) * 1000),
    map: (x, a, b, c, d) => Math.trunc((x - a) * (d - c) / (b - a) + c),
    constrain: (x, a, b) => Math.min(b, Math.max(a, x)),
    random: (a, b) => b === undefined ? Math.floor(Math.random() * a) : Math.floor(a + Math.random() * (b - a)),
    min: Math.min, max: Math.max, abs: Math.abs, sqrt: Math.sqrt, pow: Math.pow, round: Math.round,
    Serial: { begin() {}, print: s => out(s), println: (s = '') => out(String(s) + '\n') },
    matrix: D.matrix, strip: D.strip, setPixel: D.strip.setPixelColor, show: () => { D.strip.show(); D.matrix.show(); },
    oled: D.oled, lcd: D.lcd, screen: D.screen, servo, dht, sonar,
    __lib: (cls) => LIB[cls] ? LIB[cls]() : (() => { throw new Error('неизвестная библиотека ' + cls); })(),
    Array: SafeArray,
  };
  for (const n of Object.keys(CAPPED)) rt[n] = CAPPED[n];
  const isPy = board === 'opi';
  if (isPy) {
    const P = { IN: 'INPUT', OUT: 'OUTPUT', HIGH: 1, LOW: 0, BCM: 0, BOARD: 1, PUD_UP: 'UP', PUD_DOWN: 'DOWN',
      setmode() {}, setwarnings() {}, cleanup() {}, setup: (p, m, pud) => pinOut(p, m === 'OUTPUT' ? 'OUTPUT' : pud === 'UP' ? 'INPUT_PULLUP' : 'INPUT', null),
      output: (p, v) => pinOut(p, null, v ? 1 : 0), input: p => V(p) > B.vio / 2 ? 1 : 0 };
    Object.assign(rt, {
      GPIO: P, time: { sleep: s => delay((+s || 0) * 1000), time: () => (now() - t0) / 1000 + 1.7e9, monotonic: () => (now() - t0) / 1000 },
      sleep: s => delay((+s || 0) * 1000),
      print: (...a) => out(a.map(x => x === true ? 'True' : x === false ? 'False' : x === null ? 'None' : Array.isArray(x) ? '[' + x.join(', ') + ']' : String(x)).join(' ') + '\n'),
      range: (a, b, c = 1) => { if (b === undefined) { b = a; a = 0; } const r = []; if (!c) throw new Error('шаг range = 0'); for (let i = a; c > 0 ? i < b : i > b; i += c) { if (r.length >= CAP) throw new RangeError('range больше ' + CAP); r.push(i); } return r; },
      __iter: x => typeof x === 'string' ? x.split('') : x, __in: (a, b) => typeof b === 'string' ? b.includes(a) : Array.isArray(b) ? b.includes(a) : b != null && Object.prototype.hasOwnProperty.call(b, a),
      __rep: (a, n) => { n |= 0; if (a.length * n > CAP) throw new RangeError('список больше ' + CAP); let r = []; for (let i = 0; i < n; i++) r = r.concat(a); return r; },
      len: x => x == null ? 0 : (x.length ?? Object.keys(x).length), str: x => x === true ? 'True' : x === false ? 'False' : String(x), int: x => Math.trunc(+x), float: x => +x,
      abs: Math.abs, rgb: (r, g, b) => `rgb(${r | 0},${g | 0},${b | 0})`, math: { sin: Math.sin, cos: Math.cos, pi: Math.PI, sqrt: Math.sqrt, floor: Math.floor },
      random: { randint: (a, b) => Math.floor(a + Math.random() * (b - a + 1)), random: Math.random },
    });
  }
  let js;
  try { js = isPy ? pyT(code) : transpile(code); } catch (e) { post({ t: 'err', s: 'Ошибка разбора: ' + e.message }); return; }
  const names = Object.keys(rt).filter(k => k !== 'true');
  const shadow = ['self', 'globalThis', 'fetch', 'importScripts', 'XMLHttpRequest', 'WebSocket', 'navigator', 'postMessage', 'Worker', 'OffscreenCanvas', 'createImageBitmap'];
  const tail = isPy ? 'return {setup: null, loop: null, main: __main};' : "return {setup: typeof setup==='function'?setup:null, loop: typeof loop==='function'?loop:null};";
  let fn;
  try {
    fn = new Function(...names, ...shadow, `"use strict";\n${js}\n;${tail}`);
  } catch (e) { post({ t: 'err', s: 'Ошибка компиляции: ' + e.message + '\n--- JS ---\n' + js.slice(0, 4000) }); return; }
  (async () => {
    try {
      const { setup, loop, main } = fn(...names.map(k => rt[k]), ...shadow.map(() => undefined));
      t0 = now();
      if (main) { await main(); D.flush(); hb(); out('\n[программа завершилась]\n'); for (;;) { await delay(500); } }
      if (setup) await setup();
      hb();
      if (loop) for (;;) { await loop(); hb(); if (D.dirty.size) D.flush(); await new Promise(r => _setTimeout(r, 0)); }
    } catch (e) { post({ t: 'err', s: 'Ошибка выполнения: ' + e.message }); }
  })();
}
