// v14.7.0: Orange Pi specs + OS image meta (no in-browser boot).
const test = require('node:test'), assert = require('node:assert');
global.window = { Solver: require('../solver.js') };
require('../parts.js'); require('../parts2.js'); window.Devices = require('../devices.js'); require('../parts3.js'); require('../sanitize.js');
const O = require('../opi-os.js'), W = global.window;
test('opi default specs', () => {
  const pr = W.PARTS.opi.props;
  assert.equal(pr.ramMb, 1024); assert.equal(pr.diskGb, 8); assert.equal(pr.cpuCores, 4); assert.equal(pr.cpuMhz, 1300); assert.equal(pr.cpuModel, 'Allwinner H3');
  for (const k of ['osImageName', 'osImageSize', 'osImageId']) assert.ok(k in pr);
  assert.equal(O.summary(pr), 'H3 · 4×1,3 ГГц · 1 ГБ · диск 8 ГБ');
});
test('sanitize keeps valid specs, clamps and drops junk', () => {
  const s = W.sanitizeProject({ parts: [{ id: 'U1', type: 'opi', props: { ramMb: 4096, diskGb: 9999, cpuCores: 99, cpuModel: 'Rockchip RK3566', osImageName: 'Orangepi.img', osImageSize: 5, osImageId: 'opi-sd-U1', blob: 'x' } }] });
  const p = s.parts[0].props;
  assert.equal(p.ramMb, 4096); assert.equal(p.diskGb, 1024); assert.equal(p.cpuCores, 8); assert.equal(p.cpuModel, 'Rockchip RK3566'); assert.equal(p.osImageName, 'Orangepi.img'); assert.ok(!('blob' in p));
  const b = W.sanitizeProject({ parts: [{ id: 'U1', type: 'opi', props: { cpuModel: '<x>', osImageName: '<script>.img', osImageId: 'evil' } }] }).parts[0].props;
  assert.equal(b.cpuModel, 'Allwinner H3'); assert.equal(b.osImageName, ''); assert.equal(b.osImageId, '');
});
test('image check: ext, 2 GB hard cap, 256 MB warn', () => {
  assert.ok(O.check({ name: 'a.iso', size: 10 }).ok); assert.ok(O.check({ name: 'a.img', size: 10 }).ok);
  assert.ok(!O.check({ name: 'a.exe', size: 10 }).ok); assert.ok(!O.check({ name: 'a.img', size: O.HARD + 1 }).ok);
  assert.ok(O.check({ name: 'a.img', size: O.SOFT + 1 }).warn);
});
