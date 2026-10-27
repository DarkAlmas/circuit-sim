// v14.6: IP5306, TP5400, buck, and the local «⚡ Питание» mode.
const test = require('node:test'), assert = require('node:assert');
global.window = { Solver: require('../solver.js') };
require('../parts.js'); require('../parts2.js'); window.Devices = require('../devices.js'); require('../parts3.js');
require('../sanitize.js'); require('../netlist.js');
const W = global.window;
const wire = (id, a, ap, b, bp) => ({ id, a: { part: a, pin: ap }, b: { part: b, pin: bp } });
function run(proj, frames = 8, gpio = {}, hooks = {}) {
  let prev = null, meas = {}, checks = {}, v = () => 0;
  for (let f = 0; f < frames; f++) {
    const b = W.Netlist.build(proj, gpio, { vio: 3.3, ...hooks });
    const sol = W.Solver.solve(b.circuit, { guess: prev && prev.length === b.circuit.nodeCount ? prev : null, dt: 0.02 });
    assert.ok(sol.ok, sol.error);
    for (const d of b.devs) d.step(sol, 0.02);
    prev = sol.v;
    const ctx = { ...b.ctx, v: (p, pin) => sol.v[b.ctx.n(p, pin)] ?? 0, dirty: () => { prev = null; } };
    v = (id, pin) => { const p = proj.parts.find(x => x.id === id); return ctx.v(p, pin); };
    for (const p of proj.parts) {
      meas[p.id] = W.PARTS[p.type].measure(p, sol, ctx);
      const d = W.PARTS[p.type];
      checks[p.id] = d.check ? d.check(p, meas[p.id], ctx) : null;
    }
  }
  return { meas, checks, v };
}
const proj = (parts, wires) => W.sanitizeProject({ parts, wires });

test('legacy boards stay powered when «Питание» is off', () => {
  const p = proj([{ id: 'U1', type: 'esp32' }], []);
  const r = run(p, 4);
  assert.ok(Math.abs(r.v('U1', '3V3') - r.v('U1', 'GND') - 3.3) < 0.05);
  assert.equal(r.meas.U1.powered, true);
  assert.equal(r.checks.U1, null);
});

test('«Питание» on: bare ESP32 is dead, USB or VIN brings it back', () => {
  const dead = proj([{ id: 'U1', type: 'esp32' }], []);
  const rd = run(dead, 6, { 2: { mode: 'OUTPUT', val: 1 } }, { portPower: true });
  assert.ok(Math.abs(rd.v('U1', '3V3')) < 0.2, '3V3 ' + rd.v('U1', '3V3'));
  assert.equal(rd.meas.U1.powered, false);
  assert.equal(rd.checks.U1.level, 'warn');
  assert.ok(Math.abs(rd.v('U1', '2')) < 0.5, 'gpio ' + rd.v('U1', '2'));

  const usb = proj([{ id: 'U1', type: 'esp32' }], []);
  usb.parts[0].usb = true;
  const ru = run(usb, 4, { 2: { mode: 'OUTPUT', val: 1 } }, { portPower: true });
  assert.ok(Math.abs(ru.v('U1', 'VIN') - 5) < 0.3, 'VIN ' + ru.v('U1', 'VIN'));
  assert.ok(Math.abs(ru.v('U1', '3V3') - 3.3) < 0.15, '3V3 ' + ru.v('U1', '3V3'));
  assert.ok(ru.v('U1', '2') > 3, 'gpio ' + ru.v('U1', '2'));
  assert.equal(ru.meas.U1.powered, true);

  const vin = proj([
    { id: 'U1', type: 'esp32' },
    { id: 'V1', type: 'dc', props: { V: 5, rInt: 0.1 } },
  ], [wire('a', 'V1', 'p', 'U1', 'VIN'), wire('b', 'V1', 'n', 'U1', 'GND')]);
  const rv = run(vin, 8, { 2: { mode: 'OUTPUT', val: 1 } }, { portPower: true });
  assert.ok(Math.abs(rv.v('U1', '3V3') - 3.3) < 0.2, '3V3 from VIN ' + rv.v('U1', '3V3'));
  assert.equal(rv.meas.U1.powered, true);
  assert.ok(rv.v('U1', '2') > 3);
});

test('Uno needs USB, barrel VIN or 5V; 5 V on VIN does not start it', () => {
  const bare = proj([{ id: 'U1', type: 'uno' }], []);
  const rb = run(bare, 4, {}, { portPower: true });
  assert.ok(Math.abs(rb.v('U1', '5V')) < 0.2);
  assert.equal(rb.meas.U1.powered, false);

  const barrel = proj([
    { id: 'U1', type: 'uno' },
    { id: 'V1', type: 'dc', props: { V: 9, rInt: 0.1 } },
  ], [wire('a', 'V1', 'p', 'U1', 'VIN'), wire('b', 'V1', 'n', 'U1', 'GND')]);
  const r9 = run(barrel, 8, {}, { portPower: true });
  assert.ok(Math.abs(r9.v('U1', '5V') - 5) < 0.25, '5V ' + r9.v('U1', '5V'));
  assert.ok(Math.abs(r9.v('U1', '3V3') - 3.3) < 0.2);
  assert.equal(r9.meas.U1.powered, true);

  const five = proj([
    { id: 'U1', type: 'uno' },
    { id: 'V1', type: 'dc', props: { V: 5, rInt: 0.1 } },
  ], [wire('a', 'V1', 'p', 'U1', 'VIN'), wire('b', 'V1', 'n', 'U1', 'GND')]);
  const r5 = run(five, 6, {}, { portPower: true });
  assert.equal(r5.meas.U1.powered, false);
});

test('buck regulates onto a load and does not boost', () => {
  const ok = proj([
    { id: 'U1', type: 'buck', props: { Vout: 5 } },
    { id: 'V1', type: 'dc', props: { V: 12, rInt: 0.05 } },
    { id: 'R1', type: 'resistor', props: { R: 100, Pmax: 1 } },
  ], [
    wire('a', 'V1', 'p', 'U1', 'IN+'), wire('b', 'V1', 'n', 'U1', 'IN-'),
    wire('c', 'U1', 'OUT+', 'R1', 'a'), wire('d', 'U1', 'OUT-', 'R1', 'b'),
    wire('e', 'U1', 'IN-', 'U1', 'OUT-'),
  ]);
  const r = run(ok, 8);
  const vo = r.v('U1', 'OUT+') - r.v('U1', 'OUT-');
  assert.ok(Math.abs(vo - 5) < 0.25, 'Vo ' + vo);
  assert.ok(Math.abs(r.meas.R1.I - 0.05) < 0.01, 'Iload ' + r.meas.R1.I);
  assert.match(r.meas.U1.extra['Режим'], /регулирует/);

  const sag = proj([
    { id: 'U1', type: 'buck', props: { Vout: 12 } },
    { id: 'V1', type: 'dc', props: { V: 5, rInt: 0.05 } },
    { id: 'R1', type: 'resistor', props: { R: 100, Pmax: 1 } },
  ], [
    wire('a', 'V1', 'p', 'U1', 'IN+'), wire('b', 'V1', 'n', 'U1', 'IN-'),
    wire('c', 'U1', 'OUT+', 'R1', 'a'), wire('d', 'R1', 'b', 'U1', 'OUT-'),
  ]);
  const s = run(sag, 8);
  const vs = s.v('U1', 'OUT+') - s.v('U1', 'OUT-');
  assert.ok(vs < 5.5 && vs > 2, 'sag ' + vs);
  assert.match(s.checks.U1.msg, /не повышает/);

  const low = proj([
    { id: 'U1', type: 'buck', props: { Vout: 5 } },
    { id: 'V1', type: 'dc', props: { V: 3, rInt: 0.05 } },
  ], [wire('a', 'V1', 'p', 'U1', 'IN+'), wire('b', 'V1', 'n', 'U1', 'IN-')]);
  const z = run(low, 6);
  assert.ok(Math.abs(z.v('U1', 'OUT+') - z.v('U1', 'OUT-')) < 0.3);
  assert.match(z.checks.U1.msg, /4–40/);
});

test('IP5306 boosts from a latched key or charges from VIN; TP5400 boosts without a key', () => {
  const boost = proj([
    { id: 'U1', type: 'ip5306' },
    { id: 'BT1', type: 'liion', props: { soc: 80 } },
    { id: 'R1', type: 'resistor', props: { R: 100, Pmax: 1 } },
  ], [
    wire('a', 'BT1', 'p', 'U1', 'BAT+'), wire('b', 'BT1', 'n', 'U1', 'BAT-'),
    wire('c', 'U1', '5V', 'R1', 'a'), wire('d', 'R1', 'b', 'U1', 'GND'),
  ]);
  boost.parts[0].keyLatch = true;
  const on = run(boost, 8);
  const vo = on.v('U1', '5V') - on.v('U1', 'GND');
  assert.ok(vo > 4.5, 'Vo ' + vo);
  assert.ok(on.meas.BT1.I > 0.02, 'Idisch ' + on.meas.BT1.I);

  const off = proj([
    { id: 'U1', type: 'ip5306' },
    { id: 'BT1', type: 'liion', props: { soc: 80 } },
  ], [wire('a', 'BT1', 'p', 'U1', 'BAT+'), wire('b', 'BT1', 'n', 'U1', 'BAT-')]);
  const quiet = run(off, 6);
  assert.ok(Math.abs(quiet.v('U1', '5V') - quiet.v('U1', 'GND')) < 0.5);

  const chg = proj([
    { id: 'U1', type: 'ip5306' },
    { id: 'BT1', type: 'liion', props: { soc: 50 } },
    { id: 'V1', type: 'dc', props: { V: 5, rInt: 0.05 } },
  ], [
    wire('a', 'BT1', 'p', 'U1', 'BAT+'), wire('b', 'BT1', 'n', 'U1', 'BAT-'),
    wire('c', 'V1', 'p', 'U1', 'VIN'), wire('d', 'V1', 'n', 'U1', 'GND'),
  ]);
  const c = run(chg, 8);
  assert.ok(c.meas.BT1.I < -0.05, 'Icharge ' + c.meas.BT1.I);
  assert.ok(c.v('U1', '5V') - c.v('U1', 'GND') > 4.5);

  const tp = proj([
    { id: 'U1', type: 'tp5400' },
    { id: 'BT1', type: 'liion', props: { soc: 80 } },
    { id: 'R1', type: 'resistor', props: { R: 100, Pmax: 1 } },
  ], [
    wire('a', 'BT1', 'p', 'U1', 'BAT+'), wire('b', 'BT1', 'n', 'U1', 'BAT-'),
    wire('c', 'U1', '5V', 'R1', 'a'), wire('d', 'R1', 'b', 'U1', 'GND'),
  ]);
  const t = run(tp, 8);
  assert.ok(t.v('U1', '5V') - t.v('U1', 'GND') > 4.5, 'TP ' + t.v('U1', '5V'));
});

test('new parts only keep whitelisted numeric props; port power is not a project field', () => {
  const p = W.sanitizeProject({
    portPower: true,
    parts: [
      { id: 'U1', type: 'buck', props: { Vout: 100, evil: 'x' } },
      { id: 'U2', type: 'buck', props: { Vout: 0.5 } },
      { id: 'U3', type: 'ip5306', props: { Vout: 9, usb: true } },
      { id: 'U4', type: 'tp5400', props: { Vout: 9 } },
      { id: 'U5', type: 'nope' },
    ],
    wires: [],
  });
  const by = Object.fromEntries(p.parts.map(x => [x.id, x]));
  assert.deepEqual(by.U1.props, { Vout: 24 });
  assert.equal(by.U2.props.Vout, 0.8);
  assert.deepEqual(by.U3.props, {});
  assert.deepEqual(by.U4.props, {});
  assert.equal(by.U5, undefined);
  assert.equal(p.portPower, undefined);
  const ui = W.sanitizeUiSettings;
  assert.equal(ui({ portPower: true }).portPower, true);
  assert.equal(ui({ portPower: false }).portPower, false);
  assert.equal(ui({ portPower: 'true' }).portPower, false);
  assert.equal(ui({ portPower: 1 }).portPower, false);
  assert.equal(ui({ portPower: null }).portPower, false);
});

test('catalog glyphs: USB on boards, Vout on the buck, short names', () => {
  const draw = (type, extra) => W.PARTS[type].draw({ id: 'pv', type, props: { ...(W.PARTS[type].props || {}), ...extra }, usb: type === 'esp32' }, { powered: true });
  assert.match(draw('esp32'), /usbport/);
  assert.match(draw('esp32'), /Micro/);
  assert.match(draw('esp32c3'), /Type-C/);
  assert.match(draw('uno'), /usbport/);
  assert.match(draw('uno'), />USB</);
  assert.equal(W.PARTS.ip5306.name, '🔋 IP5306');
  assert.equal(W.PARTS.tp5400.name, '🔋 TP5400');
  assert.equal(W.PARTS.buck.name, '⬇️ Buck');
  assert.match(draw('buck', { Vout: 5 }), /class="knob"/);
  assert.match(draw('buck', { Vout: 5 }), /Vout 5 В/);
  assert.match(draw('ip5306'), /IP5306/);
  assert.match(draw('tp5400'), /TP5400/);
  assert.equal(W.PARTS.ip5306.group, 'Питание');
});
