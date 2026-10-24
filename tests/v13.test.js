// v13 «Любая машинка»: chassis sanitize, drive slots, mass/CoM, unconnected parts, steering, collisions, IMU, mecanum, tasks, examples
const test = require('node:test'), assert = require('node:assert');
global.window = { Solver: require('../solver.js'), Devices: require('../devices.js') };
global.window.Chassis = require('../chassis.js');
require('../parts.js'); require('../parts2.js'); require('../parts3.js'); require('../netlist.js'); require('../sanitize.js'); require('../examples.js');
const W = global.window, C = W.Chassis, R = require('../robot.js'), D = require('../devices.js'), P = W.PARTS;
const clone = o => JSON.parse(JSON.stringify(o)), EX = n => clone(W.EXAMPLES['Пример: ' + n]);
const NEW = ['4WD — парковка у стены', 'Гусеницы — объезд препятствий', 'Рулевое (серво) по линии', 'Меканум — едем боком', 'Лабиринт (сонар + VL53 + гироскоп)'];

test('v13 cleanShape: rect/round on a 5 mm grid, polygon ≤64 points within bounds', () => {
  const o = {}; C.cleanShape({ body: 'rect', size: { l: 213, w: 1e9, rad: -4 } }, o);
  assert.equal(o.body, 'rect'); assert.equal(o.size.l % 5, 0); assert.ok(o.size.w <= 400 && o.size.rad >= 0);
  const p = {}; C.cleanShape({ body: 'poly', poly: Array.from({ length: 200 }, (_, i) => [Math.cos(i) * 1e6, Math.sin(i) * 99]) }, p);
  assert.equal(p.body, 'poly'); assert.ok(p.poly.length <= 64 && p.poly.length >= 3);
  for (const [x, y] of p.poly) { assert.ok(Math.abs(x) <= C.LIM.span && Math.abs(y) <= C.LIM.span); assert.equal(x % 5, 0); }
  const q = {}; C.cleanShape({ body: 'poly', poly: [[0, 0], ['x', 1]] }, q); assert.notEqual(q.body, 'poly', 'degenerate polygon rejected');
  const b = {}; C.cleanShape({ body: '<img onerror=1>' }, b); assert.equal(b.body, 'rect');
});
test('v13 drive whitelist, wheels finite and clamped, part must be a motor', () => {
  for (const d of Object.keys(C.DRIVES)) assert.equal(C.cleanDrive(d), d);
  for (const d of ['x', '__proto__', 'constructor', 1, null]) assert.equal(C.cleanDrive(d), null);
  const ws = C.cleanWheels([{ x: NaN, y: 1e9, R: -1, grip: 9, roller: 99, part: 'M1' }, { x: 3, y: 7, part: 'S1' }, 'junk', ...Array(20).fill({ x: 0, y: 0 })], id => id === 'M1');
  assert.ok(ws.length <= C.LIM.wheels); assert.deepEqual(ws[0], { x: 0, y: 200, R: 5, roller: Math.round(Math.PI / 2 * 1e4) / 1e4, part: 'M1' });
  assert.equal(ws[1].part, undefined); assert.deepEqual([ws[1].x, ws[1].y], [5, 5]);
  const s = W.sanitizeProject({ kind: 'car', parts: [{ id: 'M1', type: 'ttmotor' }], wires: [], robot: { drive: 'rocket', wheels: [{ x: 'a' }] } });
  assert.ok(!s.robot.drive || C.DRIVES[s.robot.drive]);
  const s2 = W.sanitizeProject({ kind: 'car', parts: [{ id: 'M1', type: 'ttmotor' }], wires: [], robot: { drive: 'mecanum', wheels: [{ x: 1e9, y: -1e9, part: 'M1' }, { x: 0, y: 0, part: 'ZZ' }] } });
  assert.equal(s2.robot.drive, 'mecanum'); assert.equal(s2.robot.wheels[0].x, 200); assert.equal(s2.robot.wheels[0].part, 'M1'); assert.equal(s2.robot.wheels[1].part, undefined);
});
test('v13 drive cards place empty slots', () => {
  const n = { diff: 3, '4wd': 4, tracks: 2, steer: 4, omni: 4, mecanum: 4 };
  for (const [d, k] of Object.entries(n)) { const s = C.slots(d); assert.equal(s.length, k, d); assert.ok(s.every(w => !w.part)); assert.equal(C.SLOT_NAME[d].length, k); }
  assert.equal(C.slots('steer').filter(w => w.steer).length, 2); assert.ok(C.slots('mecanum').every(w => Math.abs(Math.abs(w.roller) - Math.PI / 4) < 1e-9));
});
test('v13 templates: trimmed names, ≤50, same check as import', () => {
  const list = [{ name: '  Мой танк  ', body: 'poly', poly: [[0, 0], [100, 0], [0, 100]], drive: 'tracks' }, { name: 'Мой танк', body: 'rect' }, { name: '', body: 'rect' }, { name: 'x'.repeat(500), drive: 'evil' }, 7, null,
    ...Array.from({ length: 80 }, (_, i) => ({ name: 'T' + i, body: 'round', size: { r: 80 } }))];
  const t = C.cleanTemplates(list); assert.ok(t.length <= 50); assert.equal(t[0].name, 'Мой танк'); assert.equal(t.filter(x => x.name === 'Мой танк').length, 1);
  assert.ok(t.every(x => x.name.length && x.name.length <= C.LIM.name && !('part' in x) && (!x.wheels || x.wheels.every(w => !w.part))));
  assert.equal(t[0].drive, 'tracks'); assert.equal(t[0].wheels.length, 2);
  const tp = C.toTemplate({ body: 'rect', size: { l: 200, w: 150, rad: 10 }, drive: '4wd', wheels: C.slots('4wd').map((w, i) => ({ ...w, part: 'M' + i })) }, ' A ');
  assert.equal(tp.name, 'A'); assert.ok(tp.wheels.every(w => !w.part));
});
test('v13 mass and centre of mass move with parts', () => {
  const parts = [{ id: 'B', type: 'liion' }], r = { body: 'rect', size: { l: 190, w: 140, rad: 10 }, mat: 'acrylic', mounts: [], wheels: C.slots('diff') };
  const a = C.mass(r, parts); r.mounts.push({ part: 'B', x: 80, y: 0 }); const b = C.mass(r, parts);
  assert.equal(b.g - a.g, 40); assert.ok(b.x > a.x + 10); assert.ok(a.g > 50 && a.g < 300);
});
test('v13 unconnected: a motor without a driver and a sensor without a data wire are flagged', () => {
  const p = EX('Лабиринт (сонар + VL53 + гироскоп)'), ids = p.robot.mounts.map(m => m.part);
  assert.deepEqual(C.unconnected(p, P, W.Netlist.nets(p), ids), []);
  p.wires = p.wires.filter(w => !/^m1/.test(w.id) && !/^U3[cd]$/.test(w.id));
  const u = C.unconnected(p, P, W.Netlist.nets(p), ids).map(x => x.part).sort(); assert.deepEqual(u, ['M1', 'U3']);
});
const mk = (drive, extra = {}) => { const wheels = C.slots(drive).map((w, i) => w.driven === false || w.caster ? w : { ...w, part: 'M' + (i + 1) });
  const parts = wheels.filter(w => w.part).map(w => ({ id: w.part, type: 'ttmotor', props: {}, _st: { rpm: 0 } }));
  const p = { kind: 'car', parts, wires: [], robot: { body: 'rect', size: { l: 190, w: 140, rad: 10 }, mat: 'acrylic', drive, wheels, mounts: wheels.filter(w => w.part).map(w => ({ part: w.part, x: w.x, y: w.y })), track: { strokes: [], start: { x: 1000, y: 700, th: 0 } }, obstacles: [], ...extra } };
  return p; };
const go = (p, rpm, secs) => { const run = R.create(p, P, D); p.parts.forEach((q, i) => { if (q._st) q._st.rpm = rpm[i]; }); for (let t = 0; t < secs; t += 0.02) run.step(0.02); return run; };
test('v13 mecanum strafes sideways without turning; 4WD and tracks drive straight', () => {
  const m = go(mk('mecanum'), [-120, 120, 120, -120], 1.5); const dx = m.car.x - 1, dy = m.car.y - 0.7;
  assert.ok(Math.abs(dy) > 0.15, 'sideways ' + dy); assert.ok(Math.abs(dx) < 0.05, 'no forward ' + dx); assert.ok(Math.abs(m.car.th) < 0.1);
  for (const d of ['4wd', 'tracks']) { const r = go(mk(d), [150, 150, 150, 150], 1); assert.ok(r.car.x - 1 > 0.2, d); assert.ok(Math.abs(r.car.y - 0.7) < 0.02, d); }
});
test('v13 steering servo turns the car left/right', () => {
  const p = mk('steer'); p.parts.push({ id: 'SV', type: 'servo', props: {}, _mod: { a: 130 } }); const l = go(p, [150, 150], 1.5); assert.ok(l.car.th > 0.3, 'left ' + l.car.th); assert.ok(l.steer > 0.5);
  const q = mk('steer'); q.parts.push({ id: 'SV', type: 'servo', props: {}, _mod: { a: 50 } }); const r = go(q, [150, 150], 1.5); assert.ok(r.car.th < -0.3, 'right');
  assert.equal(C.steerOf(90), 0); assert.ok(C.steerOf(1e9) <= 0.7 && C.steerOf('x') === 0);
});
test('v13 collisions: walls and boxes stop the car and count bumps once per hit', () => {
  const p = mk('4wd', { obstacles: [{ x: 1300, y: 700, w: 100, h: 300 }] }); const r = go(p, [200, 200, 200, 200], 3);
  assert.equal(r.bumps, 1); assert.ok(r.car.x * 1000 < 1250 - 90, 'stopped before the box ' + r.car.x); assert.ok(r.flashT > 0);
  const w = mk('diff'); w.robot.track.start = { x: 1000, y: 700, th: Math.PI }; const rw = go(w, [200, 200], 6); assert.ok(rw.bumps >= 1); assert.ok(rw.car.x > 0.08, 'wall holds');
  rw.reset(); assert.equal(rw.bumps, 0);
});
test('v13 MPU6050 on the chassis reads the turn rate (v.imu)', () => {
  const p = mk('diff'); p.parts.push({ id: 'G', type: 'mpu6050', props: {} }); p.robot.mounts.push({ part: 'G', x: 0, y: 0 });
  const r = go(p, [-100, 100], 1); assert.ok(p.parts.find(q => q.id === 'G').props.gz > 60, 'gz °/s ' + p.parts.find(q => q.id === 'G').props.gz);
  const q = mk('diff'); q.parts.push({ id: 'G', type: 'mpu6050', props: {} }); q.robot.mounts.push({ part: 'G', x: 0, y: 0 }); go(q, [100, -100], 1); assert.ok(q.parts.find(x => x.id === 'G').props.gz < -60);
});
test('v13 tasks: maze, avoid, park with judges', () => {
  for (const k of ['maze', 'avoid', 'park']) { const t = R.preset(k); assert.equal(t.task.kind, k); assert.ok(t.obstacles.length); assert.deepEqual(t.strokes, []); }
  const p = mk('4wd', { obstacles: R.preset('park').obstacles }); p.robot.track = { preset: 'park', strokes: [], start: { x: 1500, y: 700, th: 0 } };
  const r = R.create(p, P, D); for (let t = 0; t < 2; t += 0.02) r.step(0.02); assert.ok(r.done && r.done.ok, JSON.stringify(r.done)); assert.ok(/Припарковался/.test(r.done.msg));
});
test('v13 examples survive sanitize with drive, wheels and motors; tasks set', () => {
  const want = { '4WD — парковка у стены': ['4wd', 'park'], 'Гусеницы — объезд препятствий': ['tracks', 'avoid'], 'Рулевое (серво) по линии': ['steer', 'oval'], 'Меканум — едем боком': ['mecanum', ''], 'Лабиринт (сонар + VL53 + гироскоп)': ['diff', 'maze'] };
  for (const n of NEW) { const e = EX(n), s = W.sanitizeProject(e); assert.equal(s.robot.drive, want[n][0], n); assert.equal(s.robot.track.preset, want[n][1], n);
    assert.deepEqual(s.robot.wheels.map(w => w.part || ''), e.robot.wheels.map(w => w.part || ''), n); assert.ok(s.code.length > 200);
    const ids = [...new Set(s.robot.mounts.map(m => m.part))]; assert.deepEqual(C.unconnected(s, P, W.Netlist.nets(s), ids), [], n + ' all wired'); }
});
