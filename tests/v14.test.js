const test = require('node:test'), assert = require('node:assert');
global.window = { Solver: require('../solver.js') };
require('../parts.js'); require('../parts2.js'); window.Devices = require('../devices.js'); require('../parts3.js');
require('../sanitize.js'); require('../netlist.js'); require('../examples.js');
const W = global.window, T = require('../transpile.js');
const wire = (id, a, ap, b, bp) => ({ id, a: { part: a, pin: ap }, b: { part: b, pin: bp } });
function run(proj, frames = 8, gpio = {}, dt = 0.02) {
  let prev = null, meas = {}, checks = {};
  for (let f = 0; f < frames; f++) {
    const b = W.Netlist.build(proj, gpio, { vio: 3.3 }), sol = W.Solver.solve(b.circuit, { guess: prev && prev.length === b.circuit.nodeCount ? prev : null, dt });
    assert.ok(sol.ok, sol.error); for (const d of b.devs) d.step(sol, dt); prev = sol.v;
    const ctx = { ...b.ctx, v: (p, pin) => sol.v[b.ctx.n(p, pin)] ?? 0, dirty: () => { prev = null; } };
    for (const p of proj.parts) { meas[p.id] = W.PARTS[p.type].measure(p, sol, ctx); const d = W.PARTS[p.type]; checks[p.id] = d.check ? d.check(p, meas[p.id], ctx) : null; }
  }
  return { meas, checks };
}
const previewOf = type => {
  const d = W.PARTS[type];
  const p = { id: 'pv', type, x: 0, y: 0, rot: 0, props: JSON.parse(JSON.stringify(d.props || {})), on: false };
  const st = { I: 0.012, m: { U: 0, I: 0.012 }, burned: false, running: false, led2: false, on: false };
  const raw = d.draw(p, st);
  return { raw, inner: W.stripPinTexts(raw, d.pins) };
};

test('wire color whitelist survives sanitize and unknown values are dropped', () => {
  const p = W.sanitizeProject({ parts: [{ id: 'R1', type: 'resistor' }, { id: 'R2', type: 'resistor', x: 80 }],
    wires: [{ id: 'w1', a: { part: 'R1', pin: 'a' }, b: { part: 'R2', pin: 'a' }, color: 'синий' },
      { id: 'w2', a: { part: 'R1', pin: 'b' }, b: { part: 'R2', pin: 'b' }, color: '<script>' },
      { id: 'w3', a: { part: 'R1', pin: 'a' }, b: { part: 'R2', pin: 'b' }, color: 'purple' }] });
  const by = Object.fromEntries(p.wires.map(w => [w.id, w.color]));
  assert.equal(by.w1, 'синий'); assert.equal(by.w2, undefined); assert.equal(by.w3, undefined);
  assert.equal(W.WIRE_COLORS['синий'], '#4c7dff'); assert.equal(W.WIRE_COLORS['чёрный'], '#1a1d24');
});

test('pin labels: HC-SR04, USB-UART, Li-ion 103450', () => {
  const h = W.PARTS.hcsr04.draw({ props: { dist: 87 } }, {});
  for (const t of ['Vcc', 'Trig', 'Echo', 'Gnd']) assert.match(h, new RegExp('>' + t + '<'));
  assert.deepEqual(W.PARTS.hcsr04.pins.map(q => q.label), ['Vcc', 'Trig', 'Echo', 'Gnd']);
  assert.deepEqual(W.PARTS.hcsr04.pins.map(q => q.id), ['VCC', 'TRIG', 'ECHO', 'GND']);
  const u = W.PARTS.usbuart.draw({}, {});
  for (const t of ['5V', '3V3', 'GND', 'TX', 'RX']) assert.match(u, new RegExp('>' + t + '<'));
  const li = W.PARTS.liion.draw({ props: { soc: 80 } }, {});
  assert.match(li, />\+</); assert.match(li, />−</);
  assert.match(li, /class="lbl">\+</); assert.match(li, /class="lbl">−</);
});

test('LED lights only on forward current above 1 mA and warns on reverse', () => {
  const p = { props: { color: 'красный', Vf: 1.8 } }, draw = st => W.PARTS.led.draw(p, st);
  const on = draw({ I: 0.01, burned: false, running: true, m: { U: 1.8 } });
  assert.match(on, /glow/); assert.doesNotMatch(on, /обратное включение/);
  const dim = draw({ I: 0.0005, burned: false, running: true, m: { U: 0.2 } });
  assert.doesNotMatch(dim, /glow/); assert.doesNotMatch(dim, /fill-opacity="0\.28/);
  const rev = draw({ I: -0.01, burned: false, running: true, m: { U: -2 } });
  assert.match(rev, /обратное включение/); assert.doesNotMatch(rev, /glow/); assert.doesNotMatch(rev, /0\.28/);
  const idle = draw({ I: 0, burned: false, running: false, m: { U: 0 } });
  assert.doesNotMatch(idle, /обратное включение/); assert.doesNotMatch(idle, /glow/);
});

test('ESP32-C3 burns above 3.6 V on GPIO or 3V3, not on its 5V pin', () => {
  const burn = (pin, extra = []) => W.sanitizeProject({ parts: [{ id: 'U1', type: 'esp32c3' }, { id: 'V1', type: 'dc', props: { V: 5, rInt: 0.1 } }, ...extra],
    wires: [wire('a', 'V1', 'p', 'U1', pin), wire('b', 'V1', 'n', 'U1', 'GND')] });
  const g = burn('G5'), rg = run(g, 4);
  assert.equal(rg.checks.U1.level, 'burn'); assert.match(rg.checks.U1.msg, /Плата сгорела: .+ В на GPIO5/); assert.ok(g.parts[0].burned);
  const rail = burn('3V3'), rr = run(rail, 4);
  assert.equal(rr.checks.U1.level, 'burn'); assert.match(rr.checks.U1.msg, /Плата сгорела: .+ В на GPIO/); assert.ok(rail.parts[0].burned);
  const vin = burn('5V'), rv = run(vin, 6);
  assert.ok(!vin.parts[0].burned, JSON.stringify(rv.checks.U1));
  const alone = W.sanitizeProject({ parts: [{ id: 'U1', type: 'esp32c3' }], wires: [] });
  run(alone, 4); assert.ok(!alone.parts[0].burned);
  const cur = W.sanitizeProject({ parts: [{ id: 'U1', type: 'esp32c3' }, { id: 'R1', type: 'resistor', props: { R: 10, Pmax: 5 } }],
    wires: [wire('a', 'U1', 'G5', 'R1', 'a'), wire('b', 'R1', 'b', 'U1', 'GND')] });
  const rc = run(cur, 4, { 5: { mode: 'OUTPUT', val: 1 } });
  assert.equal(rc.checks.U1.level, 'burn'); assert.match(rc.checks.U1.msg, /Плата сгорела: .+ В на GPIO5/); assert.ok(cur.parts[0].burned);
});

test('HC-SR04 link requires Trig, Echo and power; example uses distanceCm', () => {
  const ex = W.sanitizeProject(W.EXAMPLES['Пример: Uno и HC-SR04']);
  const N = W.Netlist.nets(ex), mcu = ex.parts.find(p => p.type === 'uno'), sonar = ex.parts.find(p => p.type === 'hcsr04');
  const ok = W.PARTS.hcsr04.link(sonar, mcu, N, { powered: true, U: 5 });
  assert.equal(ok.on, true);
  const drop = W.sanitizeProject({ ...ex, wires: ex.wires.filter(w => w.id !== 'w4') });
  const bad = W.PARTS.hcsr04.link(drop.parts.find(p => p.type === 'hcsr04'), drop.parts.find(p => p.type === 'uno'), W.Netlist.nets(drop), { powered: true, U: 5 });
  assert.equal(bad.on, false); assert.match(bad.why, /HC-SR04 не подключён/); assert.match(bad.why, /Echo/);
  const dead = W.PARTS.hcsr04.link(sonar, mcu, N, { powered: false, U: 0 });
  assert.match(dead.why, /питания/);
  const js = T.transpile(W.EXAMPLES['Пример: Uno и HC-SR04'].code);
  assert.match(js, /sonar\.distanceCm/); assert.doesNotMatch(js, /\bdevice\b/);
  assert.equal(ex.parts.find(p => p.type === 'hcsr04').props.dist, 87);
});

test('every catalog part has its own draw and a unique pin-stripped preview', () => {
  const keys = Object.keys(W.PARTS);
  const seen = new Map();
  for (const k of keys) {
    const d = W.PARTS[k];
    assert.equal(typeof d.draw, 'function', k + ' has no draw');
    assert.ok(d.group, k + ' has no group');
    const { raw, inner } = previewOf(k);
    assert.ok(inner && inner.length > 8, k + ' preview empty');
    assert.doesNotMatch(inner, /class="plabel|class="blbl/);
    const prev = seen.get(inner);
    assert.ok(!prev, k + ' preview collides with ' + prev);
    seen.set(inner, k);
    assert.ok(raw.length >= inner.length);
  }
  const h = previewOf('hcsr04');
  assert.doesNotMatch(h.inner, /Vcc|Trig|Echo|Gnd/);
  assert.match(h.raw, /Vcc/); assert.match(h.inner, /<circle/);
  const li = previewOf('liion');
  assert.match(li.inner, />\+</); assert.match(li.inner, />−</);
  assert.match(previewOf('resistor').inner, /class="band"/);
  assert.match(previewOf('led').inner, /#ff3030/);
  assert.match(previewOf('nrf24').inner, /y="-92"/);
  assert.match(previewOf('l298n').inner, /L298N/);
  assert.ok(keys.length > 40);
});
