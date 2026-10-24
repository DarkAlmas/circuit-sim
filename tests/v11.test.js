const test = require('node:test'), assert = require('node:assert');
global.window = { Solver: require('../solver.js'), Devices: require('../devices.js') };
require('../parts.js'); require('../parts2.js'); require('../parts3.js'); require('../sanitize.js'); require('../examples.js');
const W = global.window, R = require('../robot.js'), T = require('../transpile.js');
test('v11 jitter: steady turn ≈ 0, bang-bang wiggle large, wraps ±π', () => {
  const smooth = [], wig = [], wrap = []; for (let i = 0; i < 600; i++) { const t = i / 60; smooth.push([t, 0.8 * t]); wig.push([t, 0.8 * t + 0.08 * Math.sign(Math.sin(t * 2 * Math.PI * 3))]); wrap.push([t, ((0.8 * t + Math.PI) % (2 * Math.PI)) - Math.PI]); }
  assert.ok(R.jitter(smooth) < 1e-9); assert.ok(R.jitter(wrap) < 1e-6); assert.ok(R.jitter(wig) > 1);
});
test('v11 sanitize robot.tune: finite, clamped, optional', () => {
  const mk = tune => W.sanitizeProject({ kind: 'car', parts: [], wires: [], robot: { tune } }).robot;
  assert.deepEqual(mk({ kp: 1e9, kd: -5, base: 'x' }).tune, { kp: 300, kd: 0, base: 180 });
  assert.deepEqual(mk({ kp: 25.55, kd: NaN, base: 99.6 }).tune, { kp: 25.6, kd: 150, base: 100 });
  assert.ok(!('tune' in mk(undefined))); assert.ok(!('tune' in mk([1, 2])));
});
test('v11 PID example: 5 analog TCRT on ADC pins, sketch transpiles, old example kept as простой', () => {
  const ex = Object.entries(W.EXAMPLES || {}); const get = n => (ex.find(([k]) => k === n) || [])[1];
  const pid = get('Пример: Плавная езда (ПИД)'), simple = get('Пример: Робот-машинка на трассе (простой)');
  assert.ok(pid && simple, Object.keys(W.EXAMPLES || {}).join(','));
  assert.equal(pid.parts.filter(p => p.type === 'tcrt5000').length, 5);
  assert.equal(pid.wires.filter(w => w.a && w.a.pin === 'A0' || w.from && w.from.pin === 'A0' || JSON.stringify(w).includes('"A0"')).length, 5);
  assert.ok(/analogRead/.test(pid.code) && /param\("kp"/.test(pid.code) && !/digitalRead/.test(pid.code));
  const s = W.sanitizeProject(pid); assert.deepEqual(s.robot.tune, { kp: 25, kd: 150, base: 180 });
  assert.doesNotThrow(() => new Function('return async () => {' + (T.transpile || T)(pid.code) + '}'));
});
