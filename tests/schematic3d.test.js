// v14.5.7: schematic pose, passive silhouettes, sagging wires, live visuals. No DOM, no WebGL, no new sanitize fields.
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
  function Vec() {
    this.x = 0; this.y = 0; this.z = 0;
    this.set = (x, y, z) => { this.x = x; this.y = y; this.z = z; };
  }
  function Mesh(geo, material) {
    this.geometry = geo; this.material = material; this.userData = {};
    this.position = new Vec();
    this.scale = new Vec(); this.scale.set(1, 1, 1);
    this.rotation = { x: 0, y: 0, z: 0 };
    this.quaternion = { setFromUnitVectors() {} };
    this.visible = true;
  }
  function Group() {
    this.children = []; this.userData = {}; this.visible = true;
    this.position = new Vec();
    this.scale = new Vec(); this.scale.set(1, 1, 1);
    this.rotation = { x: 0, y: 0, z: 0 };
    this.add = c => { this.children.push(c); };
  }
  function Vector3() {}
  function Geo() {}
  function Mat(o) {
    this.color = o && o.color;
    this.emissive = o && o.emissive || 0;
    this.emissiveIntensity = o && o.emissiveIntensity || 0;
    this.opacity = o && o.opacity == null ? 1 : o.opacity;
  }
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
  assert.ok(tubes.children.length >= 3, 'sag splits a span into more than one tube');
  assert.equal(tubes.children[0].material.color, 0x4c7dff);
  assert.ok(tubes.children.some(c => c.material.color === S.WIRE_NEUTRAL));
  assert.ok(tubes.children.some(c => c.position.y < S.WIRE_Y - 0.05), 'a span dips below the pin plane');
  assert.ok(tubes.children.every(c => c.userData.r === S.WIRE_R));
  const arc = S.sagPoints({ x: 0, y: S.WIRE_Y, z: 0 }, { x: 12, y: S.WIRE_Y, z: 0 });
  assert.equal(arc[0].y, S.WIRE_Y);
  assert.equal(arc[arc.length - 1].y, S.WIRE_Y);
  assert.ok(arc[1].y < S.WIRE_Y);
  assert.equal(S.wireRadius({ color: 'красный', a: { pin: 'a' }, b: { pin: 'b' } }), S.WIRE_POWER_R);
  assert.equal(S.wireRadius({ color: 'чёрный', a: { pin: '2' }, b: { pin: 'a' } }), S.WIRE_POWER_R);
  assert.equal(S.wireRadius({ a: { pin: 'GND' }, b: { pin: 'b' } }), S.WIRE_POWER_R);
  assert.equal(S.wireRadius({ a: { pin: '3V3' }, b: { pin: '15' } }), S.WIRE_POWER_R);
  assert.equal(S.wireRadius({ a: { pin: 'GND2' }, b: { pin: 'a' } }), S.WIRE_POWER_R);
  assert.equal(S.wireRadius({ color: 'синий', a: { pin: 'a' }, b: { pin: 'b' } }), S.WIRE_R);
  assert.ok(S.WIRE_POWER_R > S.WIRE_R);
  const power = S.buildWires(lib, s.parts, [{ id: 'wp', a: { part: 'R1', pin: 'a' }, b: { part: 'R2', pin: 'b' }, color: 'красный' }]);
  assert.ok(power.children.length >= 1 && power.children.every(c => c.userData.r === S.WIRE_POWER_R && c.material.color === 0xe5484d));
});

test('live visuals follow the same readings the 2D view already uses', () => {
  const lit = S.liveVisual({ type: 'led', props: { color: 'зелёный' } }, { running: true, m: { I: 0.01 } });
  assert.equal(lit.lit, true);
  assert.ok(lit.glow > 0.5 && lit.glow <= 1);
  assert.equal(lit.color, 0x30ff50);
  const dark = S.liveVisual({ type: 'led', props: { color: 'красный' } }, { running: false, m: { I: 0.02 } });
  assert.equal(dark.lit, false);
  assert.equal(dark.glow, 0);
  const burned = S.liveVisual({ type: 'led', burned: true, props: { color: 'красный' } }, { running: true, m: { I: 0.02 } });
  assert.equal(burned.lit, false);
  const rgb = S.liveVisual({ type: 'rgbled' }, { running: true, m: { ch: [0.012, 0, 0] } });
  assert.equal(rgb.lit, true);
  assert.equal(rgb.color, 0xff0000);
  const pir = S.liveVisual({ type: 'pir', props: { motion: true } }, {});
  assert.equal(pir.motion, true);
  assert.equal(pir.glow, 1);
  const quiet = S.liveVisual({ type: 'pir', props: { motion: false } }, {});
  assert.equal(quiet.motion, false);
  const hot = S.liveVisual({ type: 'dht22', props: { temp: 60, hum: 90 } }, {});
  const room = S.liveVisual({ type: 'dht22', props: { temp: 24, hum: 45 } }, {});
  assert.ok(hot.warm > room.warm && hot.wet > room.wet);
  assert.notEqual(hot.color, room.color);
  const bright = S.liveVisual({ type: 'ldr', props: { lux: 8000 } }, {});
  const dim = S.liveVisual({ type: 'ldr', props: { lux: 10 } }, {});
  assert.ok(bright.glow > dim.glow);
  const near = S.liveVisual({ type: 'hcsr04', props: { dist: 20 } }, {});
  const far = S.liveVisual({ type: 'hcsr04', props: { dist: 300 } }, {});
  assert.ok(near.beamLen < far.beamLen);
  assert.equal(near.hit, true);
  assert.equal(far.hit, true);
  const miss = S.liveVisual({ type: 'hcsr04', props: { dist: 400 } }, {});
  assert.equal(miss.hit, false);
  const buzz = S.liveVisual({ type: 'buzzer' }, { running: true, m: { I: 0.02 }, now: 0 });
  assert.equal(buzz.on, true);
  assert.equal(S.liveVisual({ type: 'buzzer' }, { running: false, m: { I: 0.02 } }).on, false);
  assert.equal(S.liveVisual({ type: 'motor' }, { running: true, anim: 90 }).spin, 90);
  assert.equal(S.liveVisual({ type: 'servo' }, { on: true, mod: { a: 30 } }).angle, 30);
  assert.equal(S.liveVisual({ type: 'servo' }, { on: false, mod: { a: 30 } }).angle, 90);
  const withBlock = S.liveVisual({ type: 'hcsr04', props: { dist: 40 } }, { stimuli: { block: true, flashlight: true, heat: true, humid: true, mover: true } });
  assert.equal(withBlock.stand.block, false);
  const noBlock = S.liveVisual({ type: 'hcsr04', props: { dist: 40 } }, { stimuli: { block: false } });
  assert.equal(noBlock.stand.block, true);
  const lib = S.createLib(fakeThree());
  const led = S.build(lib, { type: 'led', props: { color: 'красный' } });
  const lens = led.children.find(c => c.userData.fx === 'lens');
  assert.ok(lens, 'LED keeps a lens to light');
  S.applyLive(led, S.liveVisual({ type: 'led', props: { color: 'красный' } }, { running: true, m: { I: 0.015 } }));
  assert.equal(led.userData.live.lit, true);
  assert.ok(lens.material.emissiveIntensity > 0.5);
  assert.equal(lens.material.emissive, 0xff3030);
  const halo = led.children.find(c => c.userData.fx === 'halo');
  assert.equal(halo.visible, true);
  S.applyLive(led, S.liveVisual({ type: 'led', props: { color: 'красный' } }, { running: false }));
  assert.equal(halo.visible, false);
  assert.equal(lens.material.emissiveIntensity, 0);
  const pirMesh = S.build(lib, { type: 'pir' });
  S.applyLive(pirMesh, S.liveVisual({ type: 'pir', props: { motion: true } }, { stimuli: { mover: false } }));
  const dome = pirMesh.children.find(c => c.userData.fx === 'dome');
  const fig = pirMesh.children.find(c => c.userData.stand === 'mover');
  assert.ok(dome.material.emissiveIntensity > 0.5);
  assert.equal(fig.visible, true);
  S.applyLive(pirMesh, S.liveVisual({ type: 'pir', props: { motion: false } }, { stimuli: { mover: true } }));
  assert.equal(fig.visible, false);
  const fit = S.fitView([{ x: -10, z: -8 }, { x: 14, z: 6 }]);
  assert.ok(fit && fit.position.y > S.TABLE_Y && fit.dist >= 46 && fit.dist <= 210);
  const wide = S.fitView([{ x: -90, z: -40 }, { x: 90, z: 40 }]);
  assert.ok(wide.dist > fit.dist);
  assert.equal(S.fitView([]), null);
});

test('source stays local and procedural', () => {
  const src = fs.readFileSync(path.join(__dirname, '../schematic3d.js'), 'utf8');
  assert.equal(/https?:\/\//.test(src), false);
  assert.equal(/GLTF|ObjectLoader|FileLoader/.test(src), false);
  assert.equal(/fetch\s*\(/.test(src), false);
});
