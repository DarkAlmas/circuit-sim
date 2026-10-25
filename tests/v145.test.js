// v14.5.1: PIR part, motion whitelist, OUT level, NTC temperature from the 3D heat sample.
const test = require('node:test'), assert = require('node:assert');
global.window = { Solver: require('../solver.js') };
require('../parts.js'); require('../parts2.js'); window.Devices = require('../devices.js'); require('../parts3.js');
require('../sanitize.js'); require('../netlist.js'); require('../world3d.js');
const W = global.window;
const wire = (id, a, ap, b, bp) => ({ id, a: { part: a, pin: ap }, b: { part: b, pin: bp } });

function settle(proj, n = 4) {
  let prev = null, last = null;
  for (let f = 0; f < n; f++) {
    const b = W.Netlist.build(proj, {}, { vio: 5 });
    const sol = W.Solver.solve(b.circuit, { guess: prev && prev.length === b.circuit.nodeCount ? prev : null, dt: 0.02 });
    assert.ok(sol.ok, sol.error);
    prev = sol.v;
    const ctx = { ...b.ctx, v: (p, pin) => sol.v[b.ctx.n(p, pin)] ?? 0, supplyMax: () => 5, dirty: () => { prev = null; } };
    const meas = {};
    for (const p of proj.parts) meas[p.id] = W.PARTS[p.type].measure(p, sol, ctx);
    last = { meas, ctx };
  }
  return last;
}

test('HC-SR501 is a powered sensor with motion, and sanitize keeps only a boolean', () => {
  const d = W.PARTS.pir;
  assert.equal(d.group, 'Датчики');
  assert.equal(d.sensor, 'pir');
  assert.equal(d.props.motion, false);
  assert.deepEqual(d.pins.map(q => q.id), ['VCC', 'OUT', 'GND']);
  const quiet = d.draw({ props: { motion: false } }, {});
  const hot = d.draw({ props: { motion: true } }, {});
  assert.match(quiet, /тихо/); assert.match(hot, /движение/);
  assert.match(hot, />VCC</); assert.match(hot, />OUT</); assert.match(hot, />GND</);
  const s = W.sanitizeProject({ parts: [
    { id: 'P1', type: 'pir', props: { motion: true, html: '<img src=x onerror=alert(1)>' } },
    { id: 'P2', type: 'pir', props: { motion: 'true' } },
    { id: 'P3', type: 'pir' }
  ], wires: [] });
  assert.equal(s.parts[0].props.motion, true);
  assert.deepEqual(Object.keys(s.parts[0].props), ['motion']);
  assert.equal(s.parts[1].props.motion, false);
  assert.equal(s.parts[2].props.motion, false);
  assert.ok(!/[<>]/.test(JSON.stringify(s.parts)));
});

test('powered PIR drives OUT high only while motion is set', () => {
  const proj = W.sanitizeProject({
    parts: [{ id: 'V1', type: 'dc', props: { V: 5, rInt: 0.1 } }, { id: 'P1', type: 'pir', props: { motion: false } }],
    wires: [wire('w1', 'V1', 'p', 'P1', 'VCC'), wire('w2', 'V1', 'n', 'P1', 'GND')]
  });
  const pir = proj.parts.find(p => p.id === 'P1');
  let s = settle(proj);
  assert.equal(s.meas.P1.powered, true);
  assert.ok(s.ctx.v(pir, 'OUT') < 0.4, 'quiet OUT ' + s.ctx.v(pir, 'OUT'));
  assert.match(s.meas.P1.extra['Движение'], /LOW/);
  pir.props.motion = true;
  s = settle(proj);
  assert.ok(Math.abs(s.ctx.v(pir, 'OUT') - 3.3) < 0.05, 'motion OUT ' + s.ctx.v(pir, 'OUT'));
  assert.match(s.meas.P1.extra['Движение'], /HIGH/);
  const bare = W.sanitizeProject({ parts: [{ id: 'P1', type: 'pir', props: { motion: true } }], wires: [] });
  const dead = settle(bare);
  assert.equal(dead.meas.P1.powered, false);
  assert.match(dead.meas.P1.extra['Движение'], /LOW/);
});

test('NTC temperature follows the 3D heat sample and does not gain a humidity prop', () => {
  const proj = {
    parts: [
      { id: 'N1', type: 'ntc', props: { temp: 25 } },
      { id: 'U3', type: 'dht22', props: { temp: 24, hum: 45 } }
    ],
    world3d: {
      sensors: [{ id: 'd', kind: 'dht', x: 0, y: 80, z: 0 }],
      stimuli: [{ id: 'h', type: 'heat', x: 0, y: 80, z: 0 }, { id: 'u', type: 'humid', x: 0, y: 80, z: 25 }]
    }
  };
  W.World3D.applyReadings(proj);
  assert.equal(proj.parts[0].props.temp, 64);
  assert.equal('hum' in proj.parts[0].props, false);
  assert.equal(proj.parts[1].props.temp, 64);
  assert.equal(proj.parts[1].props.hum, 73);
});
