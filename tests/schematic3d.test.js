// v14.5.8: schematic pose, passive silhouettes, wire tubes that clear the table. No DOM, no WebGL context, no new sanitize fields.
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

test('boards and world3d sensors keep their schematic footprints', () => {
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
  assert.equal(S.kindOf('not-a-part'), 'generic');
});

function fakeThree() {
  function Mesh(geo, material) {
    this.geometry = geo; this.material = material; this.userData = {};
    this.position = { set() {} };
    this.rotation = { x: 0, y: 0, z: 0 };
    this.quaternion = { setFromUnitVectors() {} };
  }
  function Group() {
    this.children = []; this.userData = {};
    this.position = { set() {} };
    this.rotation = { y: 0 };
    this.add = c => { this.children.push(c); };
  }
  function Vector3() {}
  function Geo() {}
  function Mat(o) { this.color = o && o.color; }
  return {
    Group, Mesh, Vector3,
    BoxGeometry: Geo, CylinderGeometry: Geo, SphereGeometry: Geo, TorusGeometry: Geo,
    MeshStandardMaterial: Mat
  };
}

test('passive bodies are one group-colored mesh, larger than the generic slab', () => {
  const slab = S.footprint('not-a-part');
  assert.equal(slab.w, 4.8);
  assert.equal(slab.d, 2.16);
  assert.equal(slab.h, 1.5);
  const lib = S.createLib(fakeThree());
  for (const type of ['resistor', 'cap', 'ecap', 'inductor', 'pot']) {
    const f = S.footprint(type);
    assert.ok(f.w > slab.w && f.d > slab.d && f.h > slab.h, type + ' ' + JSON.stringify(f) + ' vs slab');
    assert.equal(S.kindOf(type), type, type);
    const g = S.build(lib, { type, x: 0, y: 0, rot: 0 });
    assert.equal(g.userData.kind, type, type);
    assert.equal(g.children.length, 1, type + ' is a single body');
    assert.equal(g.children[0].material.color, S.GROUP_COLOR['Пассивные'], type);
  }
  const board = S.footprint('breadboard');
  assert.equal(board.kind, 'breadboard');
  assert.equal(board.h, 2.2);
  assert.equal(board.w, Math.round(P.breadboard.box[2] * S.SCALE * 1000) / 1000);
  assert.ok(board.w > slab.w && board.d > slab.d && board.h > slab.h);
  const bb = S.build(lib, { type: 'breadboard' });
  assert.equal(bb.children.length, 1);
  assert.equal(bb.children[0].material.color, S.GROUP_COLOR['Пассивные']);
});

test('every catalog part has a silhouette; unknown types stay a slab', () => {
  const lib = S.createLib(fakeThree());
  const generic = [];
  for (const type of Object.keys(P)) {
    const kind = S.kindOf(type);
    if (kind === 'generic') generic.push(type);
    const g = S.build(lib, { id: 'X', type, x: 10, y: 20, rot: 1 });
    assert.equal(g.userData.kind, kind, type);
    assert.ok(g.children.length >= 1, type);
    assert.equal(typeof g.raycast, 'function', type + ' is not pickable');
  }
  assert.deepEqual(generic, [], 'slab fallback: ' + generic.join(','));
  const led = S.build(lib, { type: 'led' });
  assert.equal(led.userData.kind, 'led');
  assert.ok(led.children.length >= 3, 'LED keeps a dome and legs');
  const wires = S.buildWires(lib, [], []);
  assert.equal(wires.userData.role, 'wires');
  assert.equal(typeof wires.raycast, 'function');
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

test('wire tubes follow sanitized pin endpoints and bend points', () => {
  const raw = {
    parts: [
      { id: 'R1', type: 'resistor', x: 0, y: 0, rot: 0 },
      { id: 'R2', type: 'resistor', x: 80, y: 0, rot: 1 },
      { id: 'D1', type: 'led', x: -40, y: 20, rot: 2, props: { color: 'красный' } }
    ],
    wires: [
      { id: 'w1', a: { part: 'R1', pin: 'b' }, b: { part: 'R2', pin: 'a' }, color: 'синий', pts: [[40, 20]], mesh: 'http://evil/a.glb' },
      { id: 'w2', a: { part: 'R1', pin: 'a' }, b: { part: 'D1', pin: 'a' } },
      { id: 'nope', a: { part: 'R1', pin: 'no-pin' }, b: { part: 'R2', pin: 'a' }, color: 'пурпурный' }
    ]
  };
  const s = global.window.sanitizeProject(raw);
  assert.equal(s.wires.length, 2);
  assert.equal(s.wires[0].color, 'синий');
  assert.equal(Object.prototype.hasOwnProperty.call(s.wires[1], 'color'), false);
  assert.equal(JSON.stringify(s).includes('glb'), false);
  assert.equal(JSON.stringify(s).includes('http'), false);
  const pts = S.wirePoints(s.parts, s.wires[0]);
  assert.equal(pts.length, 3);
  assert.equal(pts[0].y, S.WIRE_Y);
  assert.equal(pts[1].y, S.WIRE_Y);
  assert.equal(pts[2].y, S.WIRE_Y);
  const r1 = s.parts[0], pinB = P.resistor.pins.find(q => q.id === 'b');
  const at = S.pose(r1), loc = S.localToTable(r1, pinB.x, pinB.y);
  assert.equal(pts[0].x, Math.round((at.x + loc.x) * 1000) / 1000);
  assert.equal(pts[0].z, Math.round((at.z + loc.z) * 1000) / 1000);
  assert.equal(pts[1].x, 4.8);
  assert.equal(pts[1].z, 2.4);
  const spun = S.wirePoints(s.parts, s.wires[0])[2];
  const r2 = s.parts[1], pinA = P.resistor.pins.find(q => q.id === 'a');
  const at2 = S.pose(r2), loc2 = S.localToTable(r2, pinA.x, pinA.y);
  assert.equal(spun.x, Math.round((at2.x + loc2.x) * 1000) / 1000);
  assert.equal(spun.z, Math.round((at2.z + loc2.z) * 1000) / 1000);
  assert.equal(r2.rot, 1);
  assert.equal(S.wireColorHex('синий'), 0x4c7dff);
  assert.equal(S.wireColorHex(undefined), S.WIRE_NEUTRAL);
  assert.equal(S.wireColorHex('пурпурный'), S.WIRE_NEUTRAL);
  assert.deepEqual(S.wirePoints(s.parts, { a: { part: 'R1', pin: 'missing' }, b: { part: 'R2', pin: 'a' } }), []);
  const lib = S.createLib(fakeThree());
  const tubes = S.buildWires(lib, s.parts, s.wires);
  const spans = tubes.children.filter(c => c.userData.kind === 'span');
  const joints = tubes.children.filter(c => c.userData.kind === 'joint');
  assert.ok(spans.length > 3, 'each span is an arc, not one straight tube');
  assert.equal(joints.length, 5, 'a metal joint at every anchor');
  assert.ok(spans.some(c => c.userData.sag > 0 && c.userData.y < S.WIRE_Y), 'the middle of a span sags');
  assert.equal(spans[0].material.color, 0x4c7dff);
  assert.equal(spans[0].userData.r, S.WIRE_R);
  assert.ok(spans.some(c => c.material.color === S.WIRE_NEUTRAL));
  const arc = S.sagSpan({ x: 0, y: S.WIRE_Y, z: 0 }, { x: 12, y: S.WIRE_Y, z: 0 });
  assert.equal(arc[0].y, S.WIRE_Y);
  assert.equal(arc[arc.length - 1].y, S.WIRE_Y);
  assert.ok(arc[2].sag > 0 && arc[2].y < S.WIRE_Y);
});

test('unnamed wires take the schematic stroke; power is thicker', () => {
  require('../netlist.js');
  const raw = {
    parts: [
      { id: 'V1', type: 'dc', x: 0, y: 0, rot: 0, props: { V: 5, rInt: 0.1 } },
      { id: 'R1', type: 'resistor', x: 120, y: 0, rot: 0, props: { R: 220, Pmax: 0.25 } }
    ],
    wires: [
      { id: 'wp', a: { part: 'V1', pin: 'p' }, b: { part: 'R1', pin: 'a' } },
      { id: 'wg', a: { part: 'V1', pin: 'n' }, b: { part: 'R1', pin: 'b' } }
    ]
  };
  const s = global.window.sanitizeProject(raw);
  const plus = S.wireLook(s.parts, s.wires, s.wires[0]);
  const gnd = S.wireLook(s.parts, s.wires, s.wires[1]);
  assert.equal(plus.role, 'plus');
  assert.equal(plus.color, S.WIRE_PLUS);
  assert.equal(plus.r, S.WIRE_R_POWER);
  assert.ok(plus.r > S.WIRE_R);
  assert.equal(gnd.role, 'gnd');
  assert.equal(gnd.color, S.WIRE_GND);
  assert.equal(gnd.r, S.WIRE_R);
  const tubes = S.buildWires(S.createLib(fakeThree()), s.parts, s.wires);
  const spans = tubes.children.filter(c => c.userData.kind === 'span');
  assert.ok(spans.some(c => c.material.color === S.WIRE_PLUS && c.userData.r === S.WIRE_R_POWER));
  assert.ok(spans.some(c => c.material.color === S.WIRE_GND && c.userData.r === S.WIRE_R));
  assert.equal(/https?:\/\//.test(JSON.stringify(s)), false);
});

test('a long sag clears the tabletop, including the thicker power tube', () => {
  assert.equal(S.WIRE_SAG, 2.4);
  assert.ok(S.WIRE_Y > S.TABLE_Y + S.WIRE_SAG);
  const arc = S.sagSpan({ x: 0, y: S.WIRE_Y, z: 0 }, { x: 40, y: S.WIRE_Y, z: 0 });
  assert.equal(arc[0].y, S.WIRE_Y);
  assert.equal(arc[arc.length - 1].y, S.WIRE_Y);
  const low = Math.min(...arc.map(p => p.y));
  assert.ok(Math.abs(S.WIRE_Y - low - S.WIRE_SAG) < 1e-9, 'full sag on a long span');
  assert.ok(low - S.WIRE_R_POWER >= S.TABLE_Y + 0.2, 'power insulation stays above the wood, low=' + low);
});

test('rendered tubes run from pin to pin above the table', () => {
  const THREE = require('../vendor/three/three.min.js');
  require('../netlist.js');
  const raw = {
    parts: [
      { id: 'U1', type: 'esp32', x: 0, y: 0, rot: 0 },
      { id: 'P1', type: 'pir', x: 280, y: 40, rot: 0, props: { motion: false } }
    ],
    wires: [
      { id: 'wp', a: { part: 'U1', pin: '3V3' }, b: { part: 'P1', pin: 'VCC' } },
      { id: 'wg', a: { part: 'U1', pin: 'GND' }, b: { part: 'P1', pin: 'GND' } },
      { id: 'ws', a: { part: 'U1', pin: '2' }, b: { part: 'P1', pin: 'OUT' } }
    ]
  };
  const s = global.window.sanitizeProject(raw);
  const want = {
    wp: { color: S.WIRE_PLUS, r: S.WIRE_R_POWER },
    wg: { color: S.WIRE_GND, r: S.WIRE_R },
    ws: { color: S.WIRE_SIGNAL, r: S.WIRE_R }
  };
  const g = S.buildWires(S.createLib(THREE), s.parts, s.wires);
  const spans = g.children.filter(c => c.userData.kind === 'span');
  assert.ok(spans.length >= 12, 'three full arcs, not pin stubs');
  for (const w of s.wires) {
    const anchors = S.wirePoints(s.parts, w);
    const arc = S.sagSpan(anchors[0], anchors[1]);
    assert.ok(Math.hypot(anchors[1].x - anchors[0].x, anchors[1].z - anchors[0].z) > 8, w.id);
    const mine = spans.filter(m => m.material.color.getHex() === want[w.id].color && m.userData.r === want[w.id].r);
    assert.equal(mine.length, arc.length - 1, w.id);
    let nearA = Infinity, nearB = Infinity, longest = 0;
    for (const m of mine) {
      m.updateMatrixWorld(true);
      const h = m.geometry.parameters.height * m.scale.y;
      longest = Math.max(longest, h);
      const top = new THREE.Vector3(0, m.geometry.parameters.height / 2, 0).applyMatrix4(m.matrixWorld);
      const bot = new THREE.Vector3(0, -m.geometry.parameters.height / 2, 0).applyMatrix4(m.matrixWorld);
      const yMin = Math.min(top.y, bot.y) - m.userData.r;
      assert.ok(yMin > S.TABLE_Y, w.id + ' bottom ' + yMin);
      for (const p of [top, bot]) {
        nearA = Math.min(nearA, Math.hypot(p.x - anchors[0].x, p.y - anchors[0].y, p.z - anchors[0].z));
        nearB = Math.min(nearB, Math.hypot(p.x - anchors[1].x, p.y - anchors[1].y, p.z - anchors[1].z));
      }
    }
    assert.ok(longest > 2, w.id + ' has a real span, longest=' + longest);
    assert.ok(nearA < 0.05 && nearB < 0.05, w.id + ' reaches both pins ' + nearA.toFixed(4) + ' ' + nearB.toFixed(4));
  }
});

test('source stays local and procedural', () => {
  const src = fs.readFileSync(path.join(__dirname, '../schematic3d.js'), 'utf8');
  assert.equal(/https?:\/\//.test(src), false);
  assert.equal(/GLTF|ObjectLoader|FileLoader/.test(src), false);
  assert.equal(/fetch\s*\(/.test(src), false);
});
