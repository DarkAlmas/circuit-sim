const test = require('node:test'), assert = require('node:assert');
const { transpile } = require('../transpile.js');
test('transpiles typical sketch to valid async JS', async () => {
  const js = transpile(`#define LED 2
int count = 0; const int pins[3] = {1,2,3};
void blink(int ms) { digitalWrite(LED, HIGH); delay(ms); }
void setup() { pinMode(LED, OUTPUT); }
void loop() { for (int i = 0; i < 3; i++) { blink(10); } count++; float x = (float)count / 2; }`);
  assert.match(js, /await blink\(10\)/); assert.match(js, /await delay\(ms\)/); assert.match(js, /async function loop\(\)/);
  const log = [];
  const f = new Function('digitalWrite', 'pinMode', 'delay', 'HIGH', 'OUTPUT', js + ';return {setup,loop}');
  const { setup, loop } = f((p, v) => log.push([p, v]), () => {}, async () => {}, 1, 'OUTPUT');
  await setup(); await loop(); assert.equal(log.length, 3);
});
