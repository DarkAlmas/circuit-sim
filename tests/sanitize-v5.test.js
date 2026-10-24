const test = require('node:test'), assert = require('node:assert');
global.window = { Solver: require('../solver.js') };
require('../parts.js'); require('../parts2.js'); require('../sanitize.js');
const W = global.window;
test('v5 part types survive and props are clamped', () => {
  const s = W.sanitizeProject({ kind: 'uno', parts: [
    { id: 'U1', type: 'uno', x: 0, y: 0 }, { id: 'H1', type: 'wsm8', x: 10, y: 0 }, { id: 'S1', type: 'ntc', props: { temp: 999 } },
    { id: 'S2', type: 'ldr', props: { lux: -5 } }, { id: 'S3', type: 'dht22', props: { temp: 'x', hum: 200 } }, { id: 'S4', type: 'hcsr04', props: { dist: 1e9 } },
    { id: 'C1', type: 'cap', props: { C: 5 } }, { id: 'L1', type: 'inductor', props: { L: 0 } }, { id: 'M1', type: 'monitor' }, { id: 'U2', type: 'opi' },
    { id: 'X1', type: '__proto__' }, { id: 'X2', type: 'constructor' }], wires: [{ id: 'w1', a: { part: 'U2', pin: 'HDMI' }, b: { part: 'M1', pin: 'HDMI' } }] });
  assert.deepEqual(s.parts.map(p => p.id), ['U1', 'H1', 'S1', 'S2', 'S3', 'S4', 'C1', 'L1', 'M1', 'U2']);
  const by = Object.fromEntries(s.parts.map(p => [p.id, p.props]));
  assert.equal(by.S1.temp, 125); assert.equal(by.S2.lux, 0); assert.equal(by.S3.temp, 24); assert.equal(by.S3.hum, 100); assert.equal(by.S4.dist, 400);
  assert.equal(by.C1.C, 1); assert.equal(by.L1.L, 1e-9); assert.equal(s.kind, 'uno'); assert.equal(s.wires.length, 1);
});
test('kind whitelist and import size cap', () => {
  assert.equal(W.sanitizeProject({ kind: '<script>', parts: [], wires: [] }).kind, undefined);
  assert.throws(() => W.parseProjectText('x'.repeat(2 * 1024 * 1024 + 1)), /2 МБ/);
  assert.throws(() => W.parseProjectText('{"parts":1}'), /формат/);
  assert.equal(W.parseProjectText('{"parts":[],"wires":[],"kind":"opi"}').kind, 'opi');
});
test('part and wire count limits', () => {
  const parts = Array.from({ length: 600 }, (_, i) => ({ id: 'R' + i, type: 'resistor' }));
  const wires = Array.from({ length: 2500 }, (_, i) => ({ id: 'w' + i, a: { part: 'R0', pin: 'a' }, b: { part: 'R1', pin: 'b' }, pts: Array(80).fill([0, 0]) }));
  const s = W.sanitizeProject({ parts, wires });
  assert.equal(s.parts.length, 500); assert.equal(s.wires.length, 2000); assert.equal(s.wires[0].pts.length, 50);
});
