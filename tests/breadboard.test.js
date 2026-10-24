const test = require('node:test'), assert = require('node:assert');
global.window = global.window || {}; window.Solver = require('../solver.js');
require('../parts.js'); require('../netlist.js');
function solve(pr) { const b = window.Netlist.build(pr, {}); const sol = window.Solver.solve(b.circuit); const ctx = { ...b.ctx, v: (p, pin) => sol.v[b.ctx.n(p, pin)] };
  return { b, sol, m: id => { const p = pr.parts.find(x => x.id === id); return window.PARTS[p.type].measure(p, sol, ctx); } }; }
// BB1 at (400,300): hole column i (1-based) at x = 240 + 10 i, row c at y = 260
const proj = () => ({ parts: [{ id: 'BB1', type: 'breadboard', x: 400, y: 300, rot: 0, props: {} }, { id: 'V1', type: 'dc', x: 150, y: 300, rot: 0, props: { V: 5, rInt: 0.1 } },
  { id: 'R1', type: 'resistor', x: 340, y: 260, rot: 0, props: { R: 220, Pmax: 0.25 } }, { id: 'D1', type: 'led', x: 420, y: 260, rot: 0, props: { color: 'красный', Vf: 1.8, Imax: 0.02 } }],
  wires: [{ id: 'w1', a: { part: 'V1', pin: 'p' }, b: { part: 'BB1', pin: 'a6' } }, { id: 'w2', a: { part: 'BB1', pin: 'e22' }, b: { part: 'V1', pin: 'n' } }] });
test('breadboard: R and LED plugged into one strip conduct without wires between them', () => {
  const r = solve(proj()); assert.ok(r.sol.ok, r.sol.error); const I = r.m('D1').I; assert.ok(I > 0.01 && I < 0.016, 'I=' + I);
});
test('breadboard: moving the LED off the holes breaks the circuit; empty holes add no nodes', () => {
  const p = proj(); p.parts[3].y = 265; const r = solve(p); assert.ok(Math.abs(r.m('D1').I || 0) < 1e-6);
  assert.ok(r.b.circuit.nodeCount < 12, 'nodes=' + r.b.circuit.nodeCount);
});
