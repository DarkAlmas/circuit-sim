const test = require('node:test'), assert = require('node:assert');
global.window = { Solver: require('../solver.js') };
require('../parts.js'); require('../netlist.js'); require('../shorts.js');
const fmtUnit = window.fmtUnit; global.fmtUnit = fmtUnit;
function sim(proj) {
  const b = window.Netlist.build(proj, {}); const sol = window.Solver.solve(b.circuit);
  const ctx = { ...b.ctx, v: (p, pin) => sol.v[b.ctx.n(p, pin)] }, meas = {};
  for (const p of proj.parts) meas[p.id] = window.PARTS[p.type].measure(p, sol, ctx);
  for (const w of proj.wires) { const m = meas[w.b.part]; w.I = m && m.pinI ? m.pinI[w.b.pin] || 0 : 0; }
  return { sol, meas, shorts: window.detectShorts({ proj, meas, sol }) };
}
const src = (rInt) => ({ id: 'V1', type: 'dc', x: 0, y: 0, rot: 0, props: { V: 5, rInt } });
test('dc source shorted by a wire: current limited by rInt, short detected', () => {
  const r = sim({ parts: [src(0.1)], wires: [{ id: 'w1', a: { part: 'V1', pin: 'p' }, b: { part: 'V1', pin: 'n' } }] });
  assert.ok(r.sol.ok); assert.ok(Math.abs(r.meas.V1.srcI - 50) < 1, 'I=' + r.meas.V1.srcI);
  assert.equal(r.shorts.length, 1); assert.equal(r.shorts[0].source, 'V1'); assert.ok(r.shorts[0].current > 1);
  assert.match(window.shortMessage(r.shorts[0], { parts: [src(0.1)] }), /Короткое замыкание: источник 5 В замкнут проводом напрямую/);
});
test('short through a ~0 Ω resistor names it; 220 Ω is no short', () => {
  const mk = R => ({ parts: [src(0.1), { id: 'R1', type: 'resistor', x: 0, y: 0, rot: 0, props: { R, Pmax: 0.25 } }],
    wires: [{ id: 'w1', a: { part: 'V1', pin: 'p' }, b: { part: 'R1', pin: 'a' } }, { id: 'w2', a: { part: 'R1', pin: 'b' }, b: { part: 'V1', pin: 'n' } }] });
  const p = mk(0.001), r = sim(p); assert.equal(r.shorts.length, 1); assert.ok(r.shorts[0].path.includes('R1'));
  assert.match(window.shortMessage(r.shorts[0], p), /через R1/);
  assert.equal(sim(mk(220)).shorts.length, 0);
});
test('rInt is editable: battery 1.5 Ω limits a short to 6 A', () => {
  const p = { parts: [{ id: 'B1', type: 'battery', x: 0, y: 0, rot: 0, props: { rInt: 1.5 } }], wires: [{ id: 'w1', a: { part: 'B1', pin: 'p' }, b: { part: 'B1', pin: 'n' } }] };
  const r = sim(p); assert.ok(Math.abs(r.meas.B1.srcI - 6) < 0.1); assert.equal(r.shorts.length, 1);
});
test('adapter passes solver-provided shorts through unchanged', () => {
  const s = [{ source: 'X', path: ['R9'], current: 3 }]; assert.strictEqual(window.detectShorts({ proj: { parts: [], wires: [] }, meas: {}, sol: { shorts: s } }), s);
});
