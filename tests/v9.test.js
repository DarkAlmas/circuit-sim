const test = require('node:test'), assert = require('node:assert');
global.window = { Solver: require('../solver.js'), Devices: require('../devices.js') };
require('../parts.js'); require('../parts2.js'); require('../parts3.js'); require('../sanitize.js');
const W = global.window, R = require('../robot.js'), D = require('../devices.js');
test('v9 presets: 4 tracks, start on the line', () => {
  assert.deepEqual(Object.keys(R.PRESETS), ['oval', 'eight', 'zigzag', 'cross']);
  for (const k of Object.keys(R.PRESETS)) { const t = R.preset(k), s = R.sampler(R.raster(t));
    assert.ok(t.strokes.length && t.w === 30, k); assert.ok(s(t.start.x / 1000, t.start.y / 1000) < 0.5, k + ' start on black'); }
});
test('v9 sampler: white 0.9, black 0.05, outside the field darker', () => {
  const s = R.sampler(R.raster({ w: 30, strokes: [[[100, 700], [1900, 700]]] }));
  assert.ok(Math.abs(s(1, 0.7) - 0.05) < 1e-9); assert.ok(Math.abs(s(1, 1.0) - 0.9) < 1e-9); assert.ok(s(-0.5, 0.7) < 0.5);
});
test('v9 raycast: box and wall', () => {
  const d = R.raycast(500, 700, 0, [{ x: 1000, y: 650, w: 100, h: 100 }]); assert.ok(Math.abs(d - 450) <= 6, 'box ' + d);
  const w = R.raycast(500, 700, Math.PI, []); assert.ok(Math.abs(w - 500) <= 6, 'wall ' + w);
});
test('v9 sanitizeRobot clamps and drops unknown parts', () => {
  const s = W.sanitizeProject({ kind: 'car', parts: [{ id: 'M1', type: 'ttmotor' }], wires: [],
    robot: { body: '<x>', mat: 1, mounts: [{ part: 'M1', x: 999, y: 0 }, { part: 'ZZ', x: 0, y: 0 }], track: { w: 99, strokes: [[[-5, 2], [9e9, 0]]] }, obstacles: [{ x: 1, y: 1, w: 1, h: 1e6 }], speed: 100 } });
  const r = s.robot; assert.equal(s.kind, 'car'); assert.equal(r.body, 'rect'); assert.deepEqual(r.mounts, [{ part: 'M1', x: 150, y: 0 }]);
  assert.equal(r.track.w, 40); assert.deepEqual(r.track.strokes[0][1], [2000, 0]); assert.equal(r.obstacles[0].h, 400); assert.equal(r.speed, 4);
});
test('v9 car follows the oval with a bang-bang controller and completes a lap', () => {
  const ex = W.EXAMPLES || {}; const proj = { parts: [{ id: 'M1', type: 'ttmotor', props: {} }, { id: 'M2', type: 'ttmotor', props: {} }, { id: 'S1', type: 'tcrt5000', props: { refl: 0.9 } }, { id: 'S2', type: 'tcrt5000', props: { refl: 0.9 } }],
    robot: { mounts: [{ part: 'M1', x: 0, y: 72 }, { part: 'M2', x: 0, y: -72 }, { part: 'S1', x: 78, y: 8 }, { part: 'S2', x: 78, y: -8 }], track: R.preset('oval'), obstacles: [] } };
  const run = R.create(proj, W.PARTS, D); const [M1, M2, S1, S2] = proj.parts; M1._st = { rpm: 0 }; M2._st = { rpm: 0 }; let last = 0;
  for (let i = 0; i < 2500 && !run.laps.length; i++) { const l = S1.props.refl < 0.5, r = S2.props.refl < 0.5;
    last = l && !r ? -1 : !l && r ? 1 : l && r ? 0 : last; M1._st.rpm = last < 0 ? 15 : last > 0 ? 120 : 80; M2._st.rpm = last > 0 ? 15 : last < 0 ? 120 : 80; run.step(0.02); }
  assert.equal(run.laps.length, 1, 'dist=' + run.dist); assert.ok(run.laps[0].offs <= 1);
});
test('v9 defaultMounts places wheels on both sides and sensors in front', () => {
  const m = R.defaultMounts({ parts: [{ id: 'M1', type: 'ttmotor' }, { id: 'M2', type: 'ttmotor' }, { id: 'S1', type: 'tcrt5000' }] }, W.PARTS);
  const by = Object.fromEntries(m.map(x => [x.part, x])); assert.ok(by.M1.y > 0 && by.M2.y < 0 && by.S1.x > 40);
});
