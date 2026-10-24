const test = require('node:test'), assert = require('node:assert');
global.window = { Solver: require('../solver.js'), Devices: require('../devices.js') };
require('../parts.js'); require('../parts2.js'); require('../parts3.js'); require('../sanitize.js');
const W = global.window, R = require('../robot.js'), D = require('../devices.js');
test('v10 hitter: box and field wall in metres', () => {
  const h = R.hitter([{ x: 1000, y: 650, w: 100, h: 100 }]);
  assert.ok(Math.abs(h(0.5, 0.7, 1, 0, 4) - 0.45) < 0.01);
  assert.ok(Math.abs(h(0.5, 0.7, -1, 0, 4) - 0.5) < 0.01);
  assert.equal(h(0.5, 0.7, -1, 0, 0.2), Infinity);
});
test('v10 sanitize mount dir: clamp, round, omit zero', () => {
  const s = W.sanitizeProject({ kind: 'car', parts: [{ id: 'U', type: 'vl53l0x' }, { id: 'V', type: 'vl53l0x' }], wires: [],
    robot: { mounts: [{ part: 'U', x: 0, y: 0, dir: 1.23456 }, { part: 'V', x: 0, y: 0, dir: 99 }] } });
  assert.equal(s.robot.mounts[0].dir, 1.23); assert.ok(Math.abs(s.robot.mounts[1].dir) <= Math.PI + 1e-9);
  const z = W.sanitizeProject({ kind: 'car', parts: [{ id: 'U', type: 'vl53l0x' }], wires: [], robot: { mounts: [{ part: 'U', x: 0, y: 0, dir: 0 }] } });
  assert.ok(!('dir' in z.robot.mounts[0]));
});
function mk(extra) {
  const proj = { parts: [{ id: 'M1', type: 'ttmotor', props: {} }, { id: 'M2', type: 'ttmotor', props: {} }, { id: 'S1', type: 'tcrt5000', props: { refl: 0.9 } }, { id: 'S2', type: 'tcrt5000', props: { refl: 0.9 } }].concat(extra ? [extra.p] : []),
    robot: { mounts: [{ part: 'M1', x: 0, y: 72 }, { part: 'M2', x: 0, y: -72 }, { part: 'S1', x: 78, y: 8 }, { part: 'S2', x: 78, y: -8 }].concat(extra ? [extra.m] : []), track: R.preset('oval'), obstacles: extra ? extra.o : [] } };
  const run = R.create(proj, W.PARTS, D); proj.parts[0]._st = { rpm: 80 }; proj.parts[1]._st = { rpm: 80 }; return { run, proj };
}
test('v10 reset returns to start; reset(pose) sets a new start', () => {
  const { run } = mk(); for (let i = 0; i < 50; i++) run.step(0.02); assert.ok(run.dist > 0);
  run.reset(); assert.equal(run.dist, 0); assert.equal(run.laps.length, 0);
  run.reset({ x: 500, y: 400, th: 0 }); for (let i = 0; i < 5; i++) run.step(0.02); run.reset();
  assert.ok(Math.abs(run.car.x - 0.5) < 1e-6 && Math.abs(run.car.y - 0.4) < 1e-6);
});
test('v10 distance sensor sees a box via car rangers', () => {
  const { run, proj } = mk({ p: { id: 'L1', type: 'vl53l0x', props: {} }, m: { part: 'L1', x: 80, y: 0, dir: 0 }, o: [{ x: 1000, y: 700, w: 100, h: 100 }] });
  run.reset({ x: 500, y: 700, th: 0 }); const d = run.car.dist[0];
  assert.ok(d.hit && Math.abs(d.d - 0.37) < 0.02, JSON.stringify(d)); assert.ok(Math.abs(proj.parts[4].props.mm - 370) < 20);
});
