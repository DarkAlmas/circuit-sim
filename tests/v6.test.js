const test = require('node:test'), assert = require('node:assert');
global.window = { Solver: require('../solver.js') };
require('../parts.js'); require('../parts2.js'); require('../sanitize.js'); require('../netlist.js'); require('../shorts.js');
const W = global.window, M = require('../memcap.js');
// fake worker global made of node's real constructors
// isolated realm (like the worker's global) so node's own Array stays untouched
const fake = () => require('node:vm').runInNewContext('this');
test('memcap: oversized arrays/buffers throw, normal sizes work', () => {
  const g = fake(), C = M.install(g, 100000), arr = g.Array.prototype;
  for (const f of [() => new C.Uint8Array(2e9), () => new C.Float64Array(1e6), () => C.Array(2e9), () => new C.Array(200000), () => new g.Object().constructor && arr.constructor(2e9),
    () => new C.ArrayBuffer(1e9), () => C.Uint8Array.from({ length: 2e9 }), () => C.Array.from({ length: 1e6 }), () => new C.Int32Array({ length: 5e8 })])
    assert.throws(f, /запрещён/);
  assert.equal(new C.Uint8Array(1000).length, 1000); assert.ok(new C.Uint8Array(10) instanceof g.Uint8Array);
  assert.equal(C.Array(5).length, 5); assert.deepEqual(C.Array.from([1, 2]), [1, 2]); assert.equal(new C.ArrayBuffer(64).byteLength, 64);
  assert.deepEqual([...C.Uint8Array.of(1, 2)], [1, 2]);
  // restore node's Array.prototype.constructor so other tests are unaffected
});
test('sanitize: MOSFET K/Vth/lambda clamped, C/L kept', () => {
  const p = W.sanitizeProject({ parts: [{ id: 'Q1', type: 'pmosfet', props: { K: 1e9, Vth: -5, lambda: 'x' } }, { id: 'C1', type: 'cap', props: { C: 1e-6 } }, { id: 'L1', type: 'inductor', props: { L: 99 } }], wires: [] });
  const q = p.parts[0].props; assert.equal(q.K, 100); assert.equal(q.Vth, 0.1); assert.equal(q.lambda, 0.01);
  assert.equal(p.parts[1].props.C, 1e-6); assert.equal(p.parts[2].props.L, 10);
});
const wire = (id, a, ap, b, bp) => ({ id, a: { part: a, pin: ap }, b: { part: b, pin: bp } });
test('parts use C / M elements, owners tracked; RC transient charges', () => {
  const proj = W.sanitizeProject({ parts: [{ id: 'V1', type: 'dc', props: { V: 5 } }, { id: 'R1', type: 'resistor', props: { R: 1000 } }, { id: 'C1', type: 'ecap', props: { C: 1e-4 } }],
    wires: [wire('w1', 'V1', 'p', 'R1', 'a'), wire('w2', 'R1', 'b', 'C1', 'a'), wire('w3', 'C1', 'b', 'V1', 'n')] });
  const b = W.Netlist.build(proj, {}); assert.ok(b.circuit.elements.some(e => e.type === 'C')); assert.equal(b.owners.length, b.circuit.elements.length);
  let st, sol; for (let i = 0; i < 100; i++) { sol = W.Solver.solve(b.circuit, { dt: 1e-3, state: st }); st = sol.state; }
  const ci = b.circuit.elements.findIndex(e => e.type === 'C'), e = b.circuit.elements[ci]; const U = sol.v[e.a] - sol.v[e.b];
  assert.ok(Math.abs(U - 5 * (1 - Math.exp(-1))) < 0.1, String(U));
  const ctx = { ...b.ctx, v: (p, pin) => sol.v[b.ctx.n(p, pin)] }; const m = W.PARTS.ecap.measure(proj.parts[2], sol, ctx); assert.ok(Math.abs(m.U - U) < 1e-9);
});
test('PMOSFET part conducts with gate at 0', () => {
  const proj = W.sanitizeProject({ parts: [{ id: 'V1', type: 'dc', props: { V: 5 } }, { id: 'Q1', type: 'pmosfet' }, { id: 'R1', type: 'resistor', props: { R: 100 } }],
    wires: [wire('w1', 'V1', 'p', 'Q1', 's'), wire('w2', 'Q1', 'd', 'R1', 'a'), wire('w3', 'R1', 'b', 'V1', 'n'), wire('w4', 'Q1', 'g', 'V1', 'n')] });
  const b = W.Netlist.build(proj, {}); assert.ok(b.circuit.elements.some(e => e.type === 'M' && e.p === true));
  const sol = W.Solver.solve(b.circuit, {}); assert.ok(sol.ok); const ctx = { ...b.ctx, v: (p, pin) => sol.v[b.ctx.n(p, pin)] };
  const m = W.PARTS.pmosfet.measure(proj.parts[1], sol, ctx); assert.ok(Math.abs(m.I) > 0.03, String(m.I));
});
test('short: solver reports shortCircuits with element indices mapping to parts', () => {
  const proj = W.sanitizeProject({ parts: [{ id: 'V1', type: 'dc', props: { V: 5 } }, { id: 'R1', type: 'resistor', props: { R: 0.001 } }],
    wires: [wire('w1', 'V1', 'p', 'R1', 'a'), wire('w2', 'R1', 'b', 'V1', 'n')] });
  const b = W.Netlist.build(proj, {}); const sol = W.Solver.solve(b.circuit, {});
  assert.equal(sol.shortCircuits.length, 1); assert.equal(b.owners[sol.shortCircuits[0].source], 'V1'); assert.ok(sol.shortCircuits[0].path.map(j => b.owners[j]).includes('R1'));
});
