// v14.5.5: schematic → table pose. No DOM, no WebGL, no new sanitize fields.
const test = require('node:test'), assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
global.window = { Solver: require('../solver.js') };
require('../parts.js'); require('../parts2.js'); window.Devices = require('../devices.js'); require('../parts3.js');
require('../sanitize.js');
require('../schematic3d.js');
const S = global.window.Schematic3D;
const P = global.window.PARTS;

test('pose maps schematic X right and Y down onto the stimulus table', () => {
  assert.equal(S.SCALE, 0.12);
  assert.equal(S.TABLE_Y, 74);
  const p = S.pose({ x: 100, y: -50, rot: 1 });
  assert.equal(p.x, 12);
  assert.equal(p.z, -6);
  assert.equal(p.y, 74.2);
  assert.equal(p.rot, 1);
  assert.equal(p.yaw, -Math.PI / 2);
  const back = S.pose({ x: 0, y: 0, rot: 2 });
  assert.equal(back.yaw, -Math.PI);
  const left = S.pose({ x: 10, y: 20, rot: 3 });
  assert.equal(left.rot, 3);
  assert.equal(left.yaw, -3 * Math.PI / 2);
  assert.equal(S.pose({ x: 1e5, y: -1e5, rot: 0 }).x, 12000);
  assert.equal(S.pose({ rot: -1 }).rot, 3);
  assert.equal(S.pose({ rot: 4 }).rot, 0);
  assert.equal(S.pose(null).x, 0);
  assert.ok(Number.isFinite(S.pose({ x: 'no', y: 'no' }).z));
});

test('local +Y (down the symbol) follows the SVG quarter turns', () => {
  const down = (rot) => S.localToTable({ rot }, 0, 1);
  const right = (rot) => S.localToTable({ rot }, 1, 0);
  assert.deepEqual(down(0), { x: 0, z: S.SCALE });
  assert.deepEqual(right(0), { x: S.SCALE, z: 0 });
  assert.ok(down(1).x < 0 && Math.abs(down(1).z) < 1e-9, JSON.stringify(down(1)));
  assert.ok(Math.abs(right(1).x) < 1e-9 && right(1).z > 0);
  assert.ok(down(2).z < 0 && Math.abs(down(2).x) < 1e-9);
  assert.ok(down(3).x > 0 && Math.abs(down(3).z) < 1e-9);
});

test('boards and world3d sensors have footprints; passives stay generic', () => {
  const modeled = {
    esp32: 'esp32', esp8266: 'esp8266', esp32c3: 'esp32c3', uno: 'uno', pico: 'pico', opi: 'opi',
    atmega328: 'dip', attiny85: 'dip', dht22: 'dht', hcsr04: 'hcsr04', pir: 'pir', ldr: 'ldr'
  };
  for (const [type, kind] of Object.entries(modeled)) {
    assert.equal(S.kindOf(type), kind, type);
    const f = S.footprint(type);
    const box = P[type].box;
    assert.ok(box, type + ' has a schematic box');
    assert.equal(f.w, Math.round(Math.min(420, box[2]) * S.SCALE * 1000) / 1000, type + ' width');
    assert.equal(f.d, Math.round(Math.min(420, box[3]) * S.SCALE * 1000) / 1000, type + ' depth');
    assert.ok(f.h >= 1.5, type + ' height ' + f.h);
  }
  for (const type of ['resistor', 'led', 'cap', 'breadboard']) assert.equal(S.kindOf(type), 'generic', type);
  assert.equal(S.kindOf('not-a-part'), 'generic');
  const board = S.footprint('esp32'), slug = S.footprint('resistor');
  assert.ok(board.w > slug.w && board.d > slug.d, 'a DevKit is larger than an unboxed passive');
});

test('schematic meshes do not widen the sanitize whitelist', () => {
  const raw = {
    parts: [{ id: 'U1', type: 'esp32', x: 10, y: 20, rot: 1, props: {} }],
    wires: [],
    world3d: { sensors: [{ id: 's1', kind: 'dht', x: 1, y: 2, z: 3 }], stimuli: [], mesh: 'http://evil/a.glb', url: 'https://cdn.example/x' }
  };
  const s = global.window.sanitizeProject(raw);
  assert.deepEqual(Object.keys(s.world3d).sort(), ['sensors', 'stimuli']);
  assert.equal(s.world3d.sensors.length, 1);
  assert.equal(s.parts[0].rot, 1);
  assert.equal(JSON.stringify(s).includes('http'), false);
});

test('source stays local and procedural', () => {
  const src = fs.readFileSync(path.join(__dirname, '../schematic3d.js'), 'utf8');
  assert.equal(/https?:\/\//.test(src), false);
  assert.equal(/GLTF|ObjectLoader|FileLoader/.test(src), false);
});
