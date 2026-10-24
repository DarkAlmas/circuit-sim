const test = require('node:test'), assert = require('node:assert');
global.window = { Solver: require('../solver.js') };
require('../parts.js'); require('../netlist.js'); require('../examples.js');
const clone = o => JSON.parse(JSON.stringify(o));
function run(name, gpio) {
  const pr = clone(window.EXAMPLES[name]);
  const b = window.Netlist.build(pr, gpio); const sol = window.Solver.solve(b.circuit);
  const ctx = { ...b.ctx, v: (p, pin) => sol.v[b.ctx.n(p, pin)] };
  const m = id => { const p = pr.parts.find(x => x.id === id); return window.PARTS[p.type].measure(p, sol, ctx); };
  return { sol, m };
}
test('blink example: LED ~6 mA when GPIO2 HIGH, 0 when LOW', () => {
  const on = run('Пример: мигание светодиодом (ESP32)', { 2: { mode: 'OUTPUT', val: 1 } });
  assert.ok(on.sol.ok); const I = on.m('D1').I; assert.ok(I > 0.004 && I < 0.008, 'I=' + I);
  const off = run('Пример: мигание светодиодом (ESP32)', { 2: { mode: 'OUTPUT', val: 0 } });
  assert.ok(Math.abs(off.m('D1').I) < 1e-6);
});
test('transistor example: LED ~13 mA from 5V when base driven', () => {
  const r = run('Пример: транзистор включает светодиод от 5 В', { 13: { mode: 'OUTPUT', val: 1 } });
  assert.ok(r.sol.ok, r.sol.error); const I = r.m('D1').I; assert.ok(I > 0.011 && I < 0.015, 'I=' + I);
  assert.ok(r.m('Q1').U < 0.2, 'Vce=' + r.m('Q1').U);
});
