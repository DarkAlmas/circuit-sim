const test = require('node:test'), assert = require('node:assert');
global.window = { Solver: require('../solver.js') };
require('../parts.js'); require('../parts2.js'); window.Devices = require('../devices.js'); require('../parts3.js');
require('../sanitize.js'); require('../netlist.js'); require('../shorts.js'); require('../examples.js');
const W = global.window, T = require('../transpile.js');
W.fmtNum = W.fmtNum || ((x, d) => (+x).toFixed(d ?? 2)); W.fmtUnit = W.fmtUnit || ((x, u) => (+x).toPrecision(3) + ' ' + u);
const wire = (id, a, ap, b, bp) => ({ id, a: { part: a, pin: ap }, b: { part: b, pin: bp } });
/* mini app loop: build → solve → dev.step → measure → check (like app.js tick) */
function run(proj, frames = 200, gpio = {}, dt = 0.02, gpioBy) {
  let prev = null, meas = {}, checks = {}; const avg = {};
  for (let f = 0; f < frames; f++) {
    const b = W.Netlist.build(proj, gpio, { gpioBy, vio: 3.3 }), sol = W.Solver.solve(b.circuit, { guess: prev && prev.length === b.circuit.nodeCount ? prev : null, dt });
    assert.ok(sol.ok, sol.error); for (const d of b.devs) d.step(sol, dt); prev = sol.v;
    const ctx = { ...b.ctx, v: (p, pin) => sol.v[b.ctx.n(p, pin)] ?? 0, dirty: () => { prev = null; } };
    for (const p of proj.parts) { meas[p.id] = W.PARTS[p.type].measure(p, sol, ctx); const d = W.PARTS[p.type]; checks[p.id] = d.check ? d.check(p, meas[p.id], ctx) : null;
      if (p._st && p._st.rpm != null && f >= frames / 2) avg[p.id] = (avg[p.id] || 0) + p._st.rpm / (frames - Math.ceil(frames / 2)); }
  }
  return { meas, checks, avg };
}
test('sanitize: v7 props clamped, codes only for MCU ids', () => {
  const p = W.sanitizeProject({ parts: [{ id: 'S1', type: 'tcrt5000', props: { refl: 7, thr: -1 } }, { id: 'B1', type: 'boost', props: { Vout: 99 } }, { id: 'U1', type: 'esp32c3' }, { id: 'U2', type: 'esp32c3' },
    { id: 'I1', type: 'mpu6050', props: { pitch: 500, roll: 'x', gz: -999 } }, { id: 'L1', type: 'vl53l0x', props: { mm: 1 } }, { id: 'BT', type: 'liion', props: { soc: 300 } }], wires: [],
    codes: { U2: 'void loop(){}', S1: 'x', nope: 'y', U1: 5 }, kind: 'line' });
  const by = Object.fromEntries(p.parts.map(q => [q.id, q.props]));
  assert.equal(by.S1.refl, 1); assert.equal(by.S1.thr, 0); assert.equal(by.B1.Vout, 32); assert.equal(by.I1.pitch, 90); assert.equal(by.I1.roll, 0); assert.equal(by.I1.gz, -250);
  assert.equal(by.L1.mm, 30); assert.equal(by.BT.soc, 100); assert.deepEqual(p.codes, { U2: 'void loop(){}' }); assert.equal(p.kind, 'line');
});
test('DRV8833 + TT motor: PWM duty sets speed, swapping inputs reverses', () => {
  const mk = () => W.sanitizeProject({ parts: [{ id: 'U1', type: 'esp32c3' }, { id: 'D1', type: 'drv8833' }, { id: 'M1', type: 'ttmotor' }, { id: 'BT', type: 'liion', props: { soc: 100 } }],
    wires: [wire('a', 'U1', 'G5', 'D1', 'AIN1'), wire('b', 'U1', 'G6', 'D1', 'AIN2'), wire('c', 'D1', 'AO1', 'M1', 'a'), wire('d', 'D1', 'AO2', 'M1', 'b'),
      wire('e', 'BT', 'p', 'D1', 'VM'), wire('f', 'BT', 'n', 'D1', 'GND'), wire('g', 'D1', 'GND', 'U1', 'GND')] });
  const rpm = (g5, g6) => { const p = mk(); return run(p, 150, { 5: { mode: 'OUTPUT', val: g5 }, 6: { mode: 'OUTPUT', val: g6 } }).avg.M1; };
  const full = rpm(1, 0), half = rpm(0.5, 0), rev = rpm(0, 1), off = rpm(0, 0);
  assert.ok(full > 50, 'full ' + full); assert.ok(half > 10 && half < full * 0.8, 'half ' + half + ' full ' + full); assert.ok(rev < -50, 'rev ' + rev); assert.ok(Math.abs(off) < 1, 'off ' + off);
});
test('L298N: ~2 V drop, ENA unconnected = jumper on, ENA low = off', () => {
  const mk = en => W.sanitizeProject({ parts: [{ id: 'V1', type: 'dc', props: { V: 12 } }, { id: 'U1', type: 'uno' }, { id: 'D1', type: 'l298n' }, { id: 'M1', type: 'motor' }],
    wires: [wire('a', 'U1', 'D8', 'D1', 'IN1'), wire('c', 'D1', 'OUT1', 'M1', 'a'), wire('d', 'D1', 'OUT2', 'M1', 'b'), wire('e', 'V1', 'p', 'D1', 'VS'), wire('f', 'V1', 'n', 'D1', 'GND'), wire('g', 'D1', 'GND', 'U1', 'GND'),
      ...(en ? [wire('h', 'U1', 'D9', 'D1', 'ENA')] : [])] });
  let p = mk(false), r = run(p, 60, { 8: { mode: 'OUTPUT', val: 1 } });
  const U = r.meas.M1.U; assert.ok(U > 8 && U < 10.5, 'motor U ' + U);
  p = mk(true); r = run(p, 60, { 8: { mode: 'OUTPUT', val: 1 }, 9: { mode: 'OUTPUT', val: 0 } }); assert.ok(Math.abs(r.meas.M1.U) < 0.5, 'EN low ' + r.meas.M1.U);
});
test('boost: Iin = P/(Uin·0.9), out-of-range input warns', () => {
  const p = W.sanitizeProject(W.EXAMPLES['Пример: Повышающий преобразователь 3,7 → 12 В']); const r = run(p, 40);
  const m = r.meas.U1, Pout = 12 * 12 / 120; assert.ok(Math.abs(m.Vo - 12) < 0.2, 'Vo ' + m.Vo);
  assert.ok(Math.abs(m.Iin - Pout / (0.9 * m.Vin)) < 0.03, `Iin ${m.Iin} vs ${Pout / (0.9 * m.Vin)}`); assert.ok(!r.checks.U1, JSON.stringify(r.checks.U1));
  const q = W.sanitizeProject({ parts: [{ id: 'V1', type: 'dc', props: { V: 1 } }, { id: 'U1', type: 'boost' }, { id: 'R1', type: 'resistor', props: { R: 100 } }],
    wires: [wire('a', 'V1', 'p', 'U1', 'IN+'), wire('b', 'V1', 'n', 'U1', 'IN-'), wire('c', 'U1', 'OUT+', 'R1', 'a'), wire('d', 'U1', 'OUT-', 'R1', 'b')] });
  assert.match(run(q, 20).checks.U1.msg, /2–24 В/);
});
test('Li-ion discharges by current, empty warns; NRF burns at 5 V', () => {
  const p = W.sanitizeProject({ parts: [{ id: 'BT', type: 'liion', props: { soc: 1 } }, { id: 'R1', type: 'resistor', props: { R: 2 } }], wires: [wire('a', 'BT', 'p', 'R1', 'a'), wire('b', 'BT', 'n', 'R1', 'b')] });
  const r = run(p, 400, {}, 0.05); assert.ok(p.parts[0]._st.soc < 0.01); assert.ok(r.checks.BT && /разряжен/.test(r.checks.BT.msg));
  const q = W.sanitizeProject({ parts: [{ id: 'V1', type: 'dc', props: { V: 5 } }, { id: 'RF', type: 'nrf24' }], wires: [wire('a', 'V1', 'p', 'RF', 'VCC'), wire('b', 'V1', 'n', 'RF', 'GND')] });
  const r2 = run(q, 3); assert.equal(r2.checks.RF.level, 'burn'); assert.ok(q.parts[1].burned);
});
test('TCRT5000: white → D0 LOW & low A0, black → D0 HIGH', () => {
  const mk = refl => W.sanitizeProject({ parts: [{ id: 'U1', type: 'esp32c3' }, { id: 'S1', type: 'tcrt5000', props: { refl } }], wires: [wire('a', 'S1', 'VCC', 'U1', '3V3'), wire('b', 'S1', 'GND', 'U1', 'GND')] });
  const w = run(mk(0.9), 5).meas.S1, k = run(mk(0.05), 5).meas.S1; assert.match(w.extra.D0, /LOW/); assert.match(k.extra.D0, /HIGH/);
});
test('line robot starter: both TT motors spin forward on white', () => {
  const p = W.sanitizeProject(W.STARTERS.line); const gp = { 5: { mode: 'OUTPUT', val: 220 / 255 }, 6: { mode: 'OUTPUT', val: 0 }, 7: { mode: 'OUTPUT', val: 220 / 255 }, 10: { mode: 'OUTPUT', val: 0 } };
  run(p, 150, gp); for (const id of ['M1', 'M2']) assert.ok(p.parts.find(q => q.id === id)._st.rpm > 30, id);
});
test('transpile: RF24 / VL53L0X / MPU6050 idioms', () => {
  const js = T.transpile('RF24 radio(2, 7);\nconst byte address[6] = "00001";\nsensors_event_t a, g, t;\nint16_t ax, ay, az;\nvoid loop(){ radio.read(&x, sizeof(x)); mpu.getAcceleration(&ax, &ay, &az); mpu.getEvent(&a, &g, &t); long q = 0xE1LL; }');
  assert.match(js, /var radio = __lib\('RF24', 2, 7\)/); assert.match(js, /const address = "00001"/); assert.match(js, /var a = \{\}, g = \{\}, t = \{\}/);
  assert.match(js, /x = radio\.read\( __sizeof\(x\)\)/); assert.match(js, /\[ax, ay, az\] = mpu\.getAcceleration\(\)/); assert.match(js, /getEvent\(a, g, t\)/); assert.match(js, /= 0xE1;/);
});
