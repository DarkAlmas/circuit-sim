// v14.7.2: Orange Pi specs + OS image meta (no in-browser boot).
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

// v14.7.2: phone hooks
{ const fs = require('fs'), path = require('path'), assert = require('assert');
  const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8'), css = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');
  assert.ok(/dz\.onclick = \(\) => \$\('#opiFile'\)\.click\(\)/.test(app), 'tap drop zone opens picker');
  assert.ok(app.includes('Прикрепи .img/.iso. Бут ОС — на ПК.'), 'short phone copy');
  assert.ok(css.includes('body.pm .opidrop') && css.includes('body.pm #opiPick'), 'phone css'); }

// v14.7.2: hints + quick pick + palette copy + sanitize osHintId
test('v14.7.2 hints, attachExisting, sanitize', async () => {
  assert.ok(O.HINTS.length >= 4 && O.HINTS.every(h => /^[a-z0-9-]+$/.test(h.id) && !('url' in h) && O.PRESETS[h.cpu]));
  await O.attach('A1', { name: 'armbian.img.xz', size: O.SOFT + 5 });
  const list = await O.listRecent(); assert.ok(list.some(m => m.id === 'opi-sd-A1'));
  const r = await O.attachExisting('B2', 'opi-sd-A1'); assert.equal(r.meta.id, 'opi-sd-B2'); assert.equal(r.meta.name, 'armbian.img.xz');
  assert.equal((await O.getImage('B2')).meta.name, 'armbian.img.xz');
  await assert.rejects(O.attachExisting('C3', 'opi-sd-none'));
  const ok = W.sanitizeProject({ parts: [{ id: 'U1', type: 'opi', props: { osHintId: 'armbian-jammy-pc' } }] }).parts[0].props;
  assert.equal(ok.osHintId, 'armbian-jammy-pc');
  const bad = W.sanitizeProject({ parts: [{ id: 'U1', type: 'opi', props: { osHintId: 'https://x/<a>', osImageUrl: 'https://evil' } }] }).parts[0].props;
  assert.equal(bad.osHintId, ''); assert.ok(!('osImageUrl' in bad));
  assert.equal(W.PARTS.opi.name, 'Orange Pi (конфиг + образ → QEMU)');
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'opi-os.js'), 'utf8'); assert.ok(!/fetch\(|XMLHttpRequest|https?:\/\//.test(src));
});
