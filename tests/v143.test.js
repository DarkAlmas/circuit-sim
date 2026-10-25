const test = require('node:test'), assert = require('node:assert');
global.window = { Solver: require('../solver.js') };
require('../parts.js'); require('../parts2.js'); window.Devices = require('../devices.js'); require('../parts3.js');
require('../sanitize.js'); require('../netlist.js');
const W = global.window;
const wire = (id, a, ap, b, bp) => ({ id, a: { part: a, pin: ap }, b: { part: b, pin: bp } });
function run(proj, frames = 8, gpio = {}) {
  let prev = null, meas = {}, checks = {}, last = null;
  for (let f = 0; f < frames; f++) {
    const b = W.Netlist.build(proj, gpio, { vio: 3.3 });
    const sol = W.Solver.solve(b.circuit, { guess: prev && prev.length === b.circuit.nodeCount ? prev : null, dt: 0.02 });
    assert.ok(sol.ok, sol.error);
    for (const d of b.devs) d.step(sol, 0.02);
    prev = sol.v;
    const ctx = { ...b.ctx, v: (p, pin) => sol.v[b.ctx.n(p, pin)] ?? 0, dirty: () => { prev = null; } };
    for (const p of proj.parts) {
      meas[p.id] = W.PARTS[p.type].measure(p, sol, ctx);
      const d = W.PARTS[p.type]; checks[p.id] = d.check ? d.check(p, meas[p.id], ctx) : null;
    }
    last = { b, sol };
  }
  const v = (id, pin) => { const p = proj.parts.find(q => q.id === id); return last.sol.v[last.b.ctx.n(p, pin)]; };
  return { meas, checks, v, els: last.b.circuit.elements, owners: last.b.owners, n: (id, pin) => last.b.ctx.n(proj.parts.find(q => q.id === id), pin) };
}
const labels = (side) => W.PARTS.drv8833.pins.filter(q => side(q.x)).slice().sort((a, b) => a.y - b.y).map(q => q.label);

test('DRV8833 is red and matches the breakout pinout', () => {
  const svg = W.PARTS.drv8833.draw({ id: 'D1' }, {});
  assert.match(svg, /fill="#e2231a"/);
  assert.doesNotMatch(svg, /#6b2fb3/);
  assert.deepEqual(labels(x => x < 0), ['VM', 'NC', 'GND', 'AO1', 'AO2', 'BO2', 'BO1']);
  assert.deepEqual(labels(x => x > 0), ['NC', 'AIN2', 'AIN1', 'STBY', 'BIN1', 'BIN2', 'NC', 'GND']);
  const ids = W.PARTS.drv8833.pins.map(q => q.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.includes('STBY') && ids.includes('GND2') && ids.includes('NC1'));
});

test('DRV8833: STBY low coasts both channels, pull-up or HIGH drives, NC pins are open, GND2 is ground', () => {
  const base = (extra) => W.sanitizeProject({ parts: [
    { id: 'V1', type: 'dc', props: { V: 5, rInt: 0.05 } }, { id: 'D1', type: 'drv8833' }, { id: 'R1', type: 'resistor', props: { R: 10, Pmax: 5 } }],
    wires: [wire('vm', 'V1', 'p', 'D1', 'VM'), wire('g', 'V1', 'n', 'D1', 'GND2'), wire('a', 'D1', 'AO1', 'R1', 'a'), wire('b', 'D1', 'AO2', 'R1', 'b'),
      wire('in', 'V1', 'p', 'D1', 'AIN1'), ...extra] });
  const low = run(base([wire('sb', 'D1', 'STBY', 'V1', 'n')]), 6);
  assert.ok(Math.abs(low.meas.R1.U) < 0.25, 'stby low U ' + low.meas.R1.U);
  assert.match(low.meas.D1.extra['Канал A'], /ожидание/);
  assert.match(low.meas.D1.extra.STBY, /LOW/);
  const high = run(base([wire('sb', 'D1', 'STBY', 'V1', 'p')]), 6);
  assert.ok(high.meas.R1.U > 3.5, 'stby high U ' + high.meas.R1.U);
  assert.match(high.meas.D1.extra.STBY, /HIGH/);
  const open = run(base([]), 6);
  assert.ok(open.meas.R1.U > 3.5, 'pull-up U ' + open.meas.R1.U);
  const nc = W.sanitizeProject({ parts: [{ id: 'V1', type: 'dc', props: { V: 5 } }, { id: 'D1', type: 'drv8833' }],
    wires: [wire('a', 'V1', 'p', 'D1', 'NC1'), wire('b', 'V1', 'n', 'D1', 'NC2')] });
  assert.equal(nc.wires.length, 2);
  const r = run(nc, 2);
  assert.ok(r.v('D1', 'NC1') - r.v('D1', 'NC2') > 4.5, 'nc delta ' + (r.v('D1', 'NC1') - r.v('D1', 'NC2')));
  const touch = n => r.els.filter((e, i) => r.owners[i] === 'D1' && [e.a, e.b, e.p, e.n, e.d, e.g, e.s].includes(n)).length;
  for (const id of ['NC1', 'NC2', 'NC3']) assert.equal(touch(r.n('D1', id)), 0, id);
  assert.notEqual(r.n('D1', 'NC1'), r.n('D1', 'NC2'));
  assert.notEqual(r.n('D1', 'NC1'), r.n('D1', 'GND'));
});

test('4-channel level converter shifts both ways and stays off without a rail', () => {
  const d = W.PARTS.lvlshift;
  assert.equal(d.group, 'Интерфейсы');
  assert.match(d.draw({ id: 'U1' }, {}), /fill="#1357b8"/);
  assert.match(d.draw({ id: 'U1' }, {}), /4 канала/);
  const left = d.pins.filter(q => q.x < 0).slice().sort((a, b) => a.y - b.y).map(q => q.id);
  const right = d.pins.filter(q => q.x > 0).slice().sort((a, b) => a.y - b.y).map(q => q.id);
  assert.deepEqual(left, ['LV1', 'LV2', 'LV3', 'LV4', 'LV', 'GND']);
  assert.deepEqual(right, ['HV1', 'HV2', 'HV3', 'HV4', 'HV']);
  const proj = W.sanitizeProject({ parts: [
    { id: 'U1', type: 'esp32c3' }, { id: 'V1', type: 'dc', props: { V: 5, rInt: 0.05 } }, { id: 'LS', type: 'lvlshift' }],
    wires: [wire('lv', 'U1', '3V3', 'LS', 'LV'), wire('g1', 'U1', 'GND', 'LS', 'GND'), wire('hv', 'V1', 'p', 'LS', 'HV'), wire('g2', 'V1', 'n', 'LS', 'GND'),
      wire('c1', 'U1', 'G5', 'LS', 'LV1'), wire('c3', 'LS', 'HV3', 'LS', 'GND')] });
  const lo = run(proj, 6, { 5: { mode: 'OUTPUT', val: 0 } });
  assert.ok(lo.v('LS', 'HV1') < 0.4, 'HV1 ' + lo.v('LS', 'HV1'));
  assert.ok(lo.v('LS', 'LV1') < 0.4, 'LV1 ' + lo.v('LS', 'LV1'));
  assert.ok(lo.v('LS', 'LV3') < 0.4, 'LV3 ' + lo.v('LS', 'LV3'));
  assert.ok(lo.v('LS', 'HV2') > 4.5, 'HV2 ' + lo.v('LS', 'HV2'));
  assert.ok(lo.v('LS', 'LV2') > 3.0, 'LV2 ' + lo.v('LS', 'LV2'));
  assert.equal(lo.meas.LS.powered, true);
  assert.match(lo.meas.LS.extra['Режим'], /двунаправленный/);
  const hi = run(proj, 6, { 5: { mode: 'OUTPUT', val: 1 } });
  assert.ok(hi.v('LS', 'HV1') > 4.5, 'HV1 high ' + hi.v('LS', 'HV1'));
  assert.ok(hi.v('LS', 'LV1') > 2.8, 'LV1 high ' + hi.v('LS', 'LV1'));
  const dead = W.sanitizeProject({ parts: [
    { id: 'V1', type: 'dc', props: { V: 5, rInt: 0.05 } }, { id: 'LS', type: 'lvlshift' }, { id: 'R1', type: 'resistor', props: { R: 10000 } }],
    wires: [wire('hv', 'V1', 'p', 'LS', 'HV'), wire('g', 'V1', 'n', 'LS', 'GND'), wire('pu', 'V1', 'p', 'R1', 'a'), wire('pu2', 'R1', 'b', 'LS', 'HV1'), wire('lo', 'LS', 'LV1', 'LS', 'GND')] });
  const off = run(dead, 6);
  assert.ok(off.v('LS', 'HV1') > 4, 'unpowered HV1 ' + off.v('LS', 'HV1'));
  assert.equal(off.meas.LS.powered, false);
  assert.ok(off.checks.LS && /HV, LV и GND/.test(off.checks.LS.msg), JSON.stringify(off.checks.LS));
});
