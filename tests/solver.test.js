const test = require('node:test'), assert = require('node:assert');
const S = require('../solver.js');
const near = (a, b, rel, msg) => assert.ok(Math.abs(a - b) <= Math.abs(b) * rel, `${msg}: ${a} vs ${b}`);

test('voltage divider', () => {
  const r = S.solve({ nodeCount: 3, elements: [
    { type: 'V', p: 1, n: 0, V: 10 }, { type: 'R', a: 1, b: 2, R: 1000 }, { type: 'R', a: 2, b: 0, R: 3000 }] });
  assert.ok(r.ok); near(r.v[2], 7.5, 1e-6, 'Vout'); near(r.currents[0], 0.0025, 1e-6, 'I source');
});

test('LED + resistor: I ≈ (V - Vf)/R', () => {
  const vf = 1.8, Is = S.ledIs(vf);
  const r = S.solve({ nodeCount: 3, elements: [
    { type: 'V', p: 1, n: 0, V: 5 }, { type: 'R', a: 1, b: 2, R: 150 }, { type: 'D', a: 2, b: 0, Is, n: 2 }] });
  assert.ok(r.ok, r.error); near(r.currents[2], (5 - vf) / 150, 0.05, 'I_LED');
});

test('diode 1N4148 forward drop ~0.6-0.75V at ~4 mA', () => {
  const r = S.solve({ nodeCount: 3, elements: [
    { type: 'V', p: 1, n: 0, V: 5 }, { type: 'R', a: 1, b: 2, R: 1000 }, { type: 'D', a: 2, b: 0, ...S.presets['1N4148'] }] });
  assert.ok(r.ok); assert.ok(r.v[2] > 0.55 && r.v[2] < 0.8, 'Vd=' + r.v[2]);
});

test('NPN 2N2222 saturation and cutoff', () => {
  const mk = vb => S.solve({ nodeCount: 5, elements: [
    { type: 'V', p: 1, n: 0, V: 5 }, { type: 'V', p: 4, n: 0, V: vb },
    { type: 'R', a: 1, b: 2, R: 1000 }, { type: 'R', a: 4, b: 3, R: 10000 },
    { type: 'Q', c: 2, b: 3, e: 0, ...S.presets['2N2222'] }] });
  const on = mk(3.3); assert.ok(on.ok, on.error);
  assert.ok(on.v[2] < 0.2, 'Vce(sat)=' + on.v[2]);
  assert.ok(on.v[3] > 0.6 && on.v[3] < 0.85, 'Vbe=' + on.v[3]);
  const off = mk(0); assert.ok(off.ok); assert.ok(off.v[2] > 4.99, 'cutoff Vce=' + off.v[2]);
});

test('warm start converges fast', () => {
  const c = { nodeCount: 3, elements: [{ type: 'V', p: 1, n: 0, V: 3.3 }, { type: 'R', a: 1, b: 2, R: 220 }, { type: 'D', a: 2, b: 0, Is: S.ledIs(2), n: 2 }] };
  const a = S.solve(c), b = S.solve(c, { guess: a.v });
  assert.ok(b.ok && b.iter <= 3, 'iter=' + b.iter);
});
