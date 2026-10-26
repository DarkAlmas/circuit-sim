// v14.5: world3d sanitize whitelist and approximate sensor readings. No DOM, no WebGL.
const test = require('node:test'), assert = require('node:assert');
global.window = { PARTS: { resistor: { props: {} }, hcsr04: {}, ldr: {}, dht22: {}, vl53l0x: { sensor: 'vl53' }, tcrt5000: {}, pir: { sensor: 'pir' } } };
require('../sanitize.js');
require('../world3d.js');
const W = global.window, S = W.World3D;

test('sanitize drops the sensor world, including markup and unknown fields', () => {
  const raw = {
    parts: [], wires: [],
    world3d: {
      sensors: [
        { id: 's1', kind: 'ultrasonic', x: '12', y: 1, z: 2, rx: 0, ry: 1, rz: -0.5, html: '<img src=x>', onclick: 'alert(1)' },
        { id: '<script>', kind: 'ldr', x: 0, y: 0, z: 0 },
        { id: 'bad', kind: 'ultrasonic', x: 1e9, y: -1e9, z: '<svg onload=alert(1)>', rx: 99, ry: -99, rz: 'no' }
      ],
      stimuli: [
        { id: 't1', type: 'block', x: 3, y: 4, z: 5, name: '<b>x</b>' },
        { id: 't3', type: 'flashlight', x: 1, y: 2, z: 3 },
        { id: 'nope', type: 'heat', x: 0, y: 0, z: 0, id2: '<script>' }
      ],
      comment: '<script>alert(1)</script>',
      mesh: 'http://evil/a.glb'
    }
  };
  const s = W.sanitizeProject(raw);
  assert.equal(s.world3d, undefined);
  const json = JSON.stringify(s);
  assert.ok(!/[<>]/.test(json) && !json.includes('http') && !json.includes('glb'), json);
  assert.equal(W.sanitizeProject({ parts: [], wires: [], world3d: '<script>' }).world3d, undefined);
  assert.equal(W.sanitizeProject({ parts: [], wires: [], world3d: [] }).world3d, undefined);
  assert.deepEqual(W.sanitizeWorld3d(raw.world3d), { sensors: [], stimuli: [] });
  assert.deepEqual(W.sanitizeWorld3d(null), { sensors: [], stimuli: [] });
});

test('a huge sensor world is dropped on load', () => {
  const sensors = Array.from({ length: 40 }, (_, i) => ({ id: 's' + i, kind: 'pir', x: i, y: 0, z: 0 }));
  const stimuli = Array.from({ length: 60 }, (_, i) => ({ id: 't' + i, type: 'mover', x: i, y: 0, z: 0 }));
  const s = W.sanitizeProject({ parts: [], wires: [], world3d: { sensors, stimuli } });
  assert.equal(s.world3d, undefined);
  assert.deepEqual(W.WORLD3D_KINDS, ['ultrasonic', 'ldr', 'dht', 'pir']);
  assert.deepEqual(W.WORLD3D_TYPES, ['block', 'flashlight', 'heat', 'humid', 'mover', 'tape']);
});

test('readings: block, flashlight, heat, humid, mover', () => {
  const hit = S.compute({
    sensors: [{ id: 's1', kind: 'ultrasonic', x: 0, y: 80, z: 0, rx: 0, ry: 0 }],
    stimuli: [{ id: 't1', type: 'block', x: 0, y: 80, z: -50 }]
  });
  assert.equal(hit.sensors[0].dist, 41);
  const miss = S.compute({
    sensors: [{ id: 's1', kind: 'ultrasonic', x: 0, y: 80, z: 0, rx: 0, ry: 0 }],
    stimuli: [{ id: 't1', type: 'block', x: 40, y: 80, z: -50 }]
  });
  assert.equal(miss.sensors[0].dist, 400);
  const lit = S.compute({
    sensors: [{ id: 'r', kind: 'ldr', x: 0, y: 80, z: 20 }],
    stimuli: [{ id: 'l', type: 'flashlight', x: 0, y: 81, z: -40 }]
  });
  assert.ok(lit.sensors[0].lux > 100 && lit.sensors[0].lux < 100000, String(lit.sensors[0].lux));
  const dark = S.compute({
    sensors: [{ id: 'r', kind: 'ldr', x: 0, y: 80, z: 20 }],
    stimuli: [{ id: 'l', type: 'flashlight', x: 0, y: 81, z: 80 }]
  });
  assert.equal(dark.sensors[0].lux, 100);
  const climate = S.compute({
    sensors: [{ id: 'd', kind: 'dht', x: 0, y: 80, z: 0 }],
    stimuli: [{ id: 'h', type: 'heat', x: 0, y: 80, z: 0 }, { id: 'u', type: 'humid', x: 0, y: 80, z: 25 }]
  });
  assert.equal(climate.sensors[0].temp, 64);
  assert.equal(climate.sensors[0].hum, 90);
  const see = S.compute({
    sensors: [{ id: 'p', kind: 'pir', x: 0, y: 80, z: 0, rx: 0, ry: 0 }],
    stimuli: [{ id: 'm', type: 'mover', x: 0, y: 80, z: -40 }]
  });
  assert.equal(see.sensors[0].motion, true);
  const hide = S.compute({
    sensors: [{ id: 'p', kind: 'pir', x: 0, y: 80, z: 0, rx: 0, ry: 0 }],
    stimuli: [{ id: 'm', type: 'mover', x: 0, y: 80, z: 40 }]
  });
  assert.equal(hide.sensors[0].motion, false);
  const wide = S.compute({
    sensors: [{ id: 'p', kind: 'pir', x: 0, y: 80, z: 0, rx: 0, ry: 0 }],
    stimuli: [{ id: 'm', type: 'mover', x: 80, y: 80, z: -10 }]
  });
  assert.equal(wide.sensors[0].motion, false);
  const cone = S.compute({
    sensors: [{ id: 's1', kind: 'ultrasonic', x: 0, y: 80, z: 0, rx: 0, ry: 0 }],
    stimuli: [{ id: 't1', type: 'block', x: 18, y: 80, z: -80 }]
  });
  assert.equal(cone.sensors[0].dist, 72, 'block inside the 12° beam but off the boresight');
  const near = S.compute({
    sensors: [{ id: 'r', kind: 'ldr', x: 0, y: 80, z: 20 }],
    stimuli: [{ id: 'l', type: 'flashlight', x: 0, y: 80, z: -20 }]
  });
  const far = S.compute({
    sensors: [{ id: 'r', kind: 'ldr', x: 0, y: 80, z: 20 }],
    stimuli: [{ id: 'l', type: 'flashlight', x: 0, y: 80, z: -80 }]
  });
  const past = S.compute({
    sensors: [{ id: 'r', kind: 'ldr', x: 0, y: 80, z: 20 }],
    stimuli: [{ id: 'l', type: 'flashlight', x: 0, y: 80, z: -130 }]
  });
  assert.ok(near.sensors[0].lux > far.sensors[0].lux && far.sensors[0].lux > 100, near.sensors[0].lux + ' / ' + far.sensors[0].lux);
  assert.equal(past.sensors[0].lux, 100);
  const shade = S.compute({
    sensors: [{ id: 'r', kind: 'ldr', x: 0, y: 80, z: 20 }],
    stimuli: [{ id: 'l', type: 'flashlight', x: 0, y: 80, z: -40 }, { id: 'b', type: 'block', x: 0, y: 80, z: -10 }]
  });
  assert.equal(shade.sensors[0].lux, 100);
  const body = S.compute({
    sensors: [{ id: 'p', kind: 'pir', x: 0, y: 80, z: 0, rx: 0, ry: 0 }],
    stimuli: [{ id: 'm', type: 'mover', x: 36, y: 80, z: -40 }]
  });
  assert.equal(body.sensors[0].motion, true, 'figurine body enters the 40° cone');
  const wall = S.compute({
    sensors: [{ id: 'p', kind: 'pir', x: 0, y: 80, z: 0, rx: 0, ry: 0 }],
    stimuli: [{ id: 'm', type: 'mover', x: 0, y: 80, z: -40 }, { id: 'b', type: 'block', x: 0, y: 80, z: -20 }]
  });
  assert.equal(wall.sensors[0].motion, false);
});

test('humid inside R50 rises well above ambient 45; outside stays ambient; heat stays linear', () => {
  const dht = { id: 'd', kind: 'dht', x: 8, y: 82, z: 16 };
  const humAt = (x, y, z) => S.compute({
    sensors: [dht],
    stimuli: [{ id: 'u', type: 'humid', x, y, z }]
  }).sensors[0].hum;
  assert.equal(humAt(8, 82, 16), 100, 'steam on the DHT');
  assert.ok(humAt(8, 82, 16) >= 80);
  // Palette slots: DHT is the 3rd sensor, steam the 4th stimulus — ~48.8 cm, still inside R50.
  const slotted = humAt(36, 82, -24);
  assert.ok(slotted >= 80 && slotted > 45, 'inside the sphere (' + slotted + ')');
  assert.equal(humAt(8, 82, 16 + 49), 80);
  assert.equal(humAt(8, 82, 16 + 50), 45);
  assert.equal(humAt(8, 82, 16 + 80), 45);
  const bare = S.compute({ sensors: [dht], stimuli: [] }).sensors[0];
  assert.equal(bare.hum, 45);
  assert.equal(bare.temp, 24);
  const warm = z => S.compute({
    sensors: [dht],
    stimuli: [{ id: 'h', type: 'heat', x: 8, y: 82, z }]
  }).sensors[0];
  assert.equal(warm(16).temp, 64);
  assert.equal(warm(16).hum, 45);
  assert.equal(warm(16 + 25).temp, 44);
  assert.equal(warm(16 + 49).temp, 24.8);
  assert.equal(warm(16 + 50).temp, 24);
});

test('applyReadings does not write HC-SR04, LDR, DHT22, PIR, VL53 or TCRT', () => {
  const proj = {
    parts: [
      { id: 'U2', type: 'hcsr04', props: { dist: 50 } },
      { id: 'U9', type: 'hcsr04', props: { dist: 50 } },
      { id: 'R1', type: 'ldr', props: { lux: 100 } },
      { id: 'U3', type: 'dht22', props: { temp: 24, hum: 45 } },
      { id: 'V1', type: 'vl53l0x', props: { mm: 300 } },
      { id: 'T1', type: 'tcrt5000', props: { refl: 0.9, thr: 0.5 } },
      { id: 'P1', type: 'pir', props: { motion: false } }
    ],
    world3d: {
      sensors: [
        { id: 's1', kind: 'ultrasonic', x: 0, y: 80, z: 0, rx: 0, ry: 0 },
        { id: 's2', kind: 'ultrasonic', x: 0, y: 80, z: 0, rx: 0, ry: Math.PI },
        { id: 'r', kind: 'ldr', x: 0, y: 80, z: 20 },
        { id: 'd', kind: 'dht', x: 0, y: 80, z: 0 },
        { id: 'p', kind: 'pir', x: 0, y: 80, z: 0, rx: 0, ry: 0 }
      ],
      stimuli: [
        { id: 't1', type: 'block', x: 0, y: 80, z: -50 },
        { id: 'l', type: 'flashlight', x: 0, y: 81, z: -40 },
        { id: 'h', type: 'heat', x: 0, y: 80, z: 0 },
        { id: 'u', type: 'humid', x: 0, y: 80, z: 25 },
        { id: 'm', type: 'mover', x: 0, y: 80, z: -40 }
      ]
    }
  };
  const readings = S.applyReadings(proj);
  assert.equal(proj.parts[0].props.dist, 50);
  assert.equal(proj.parts[1].props.dist, 50);
  assert.equal(proj.parts[2].props.lux, 100);
  assert.equal(proj.parts[3].props.temp, 24);
  assert.equal(proj.parts[3].props.hum, 45);
  assert.equal(proj.parts[4].props.mm, 300);
  assert.equal(proj.parts[5].props.refl, 0.9);
  assert.equal(proj.parts[6].props.motion, false);
  assert.equal(readings.sensors.length, 5);
  assert.equal(readings.sensors[0].dist, 41);
  assert.deepEqual(S.getReadings().sensors.map(s => s.kind), []);
});

test('PIR motion and NTC temperature stay on the part when a world sample is present', () => {
  const proj = {
    parts: [
      { id: 'N1', type: 'ntc', props: { temp: 25 } },
      { id: 'U3', type: 'dht22', props: { temp: 24, hum: 45 } },
      { id: 'P1', type: 'pir', props: {} }
    ],
    world3d: {
      sensors: [
        { id: 'd', kind: 'dht', x: 0, y: 80, z: 0 },
        { id: 'p', kind: 'pir', x: 0, y: 80, z: 0, rx: 0, ry: 0 }
      ],
      stimuli: [
        { id: 'h', type: 'heat', x: 0, y: 80, z: 0 },
        { id: 'u', type: 'humid', x: 0, y: 80, z: 25 },
        { id: 'm', type: 'mover', x: 0, y: 80, z: -40 }
      ]
    }
  };
  S.applyReadings(proj);
  assert.equal(proj.parts[0].props.temp, 25);
  assert.equal(proj.parts[0].props.hum, undefined);
  assert.equal(proj.parts[1].props.temp, 24);
  assert.equal(proj.parts[1].props.hum, 45);
  assert.equal(proj.parts[2].props.motion, undefined);
});

test('ensurePairs does not add sensors or stimuli', () => {
  const proj = {
    parts: [
      { id: 'U2', type: 'hcsr04', props: { dist: 50 } },
      { id: 'R1', type: 'ldr', props: { lux: 100 } },
      { id: 'U3', type: 'dht22', props: { temp: 24, hum: 45 } },
      { id: 'N1', type: 'ntc', props: { temp: 25 } },
      { id: 'P1', type: 'pir', props: { motion: false } },
      { id: 'T1', type: 'tcrt5000', props: { refl: 0.9, thr: 0.5 } },
      { id: 'M1', type: 'mpu6050', props: { pitch: 0, roll: 0, acc: 0, gz: 0 } },
      { id: 'V1', type: 'vl53l0x', props: { mm: 300 } }
    ],
    world3d: { sensors: [], stimuli: [] }
  };
  const added = S.ensurePairs(proj);
  assert.deepEqual(added, { sensors: 0, stimuli: 0 });
  assert.deepEqual(proj.world3d, { sensors: [], stimuli: [] });
  assert.equal(proj.parts.find(p => p.id === 'V1').props.mm, 300);
  assert.equal(proj.parts.find(p => p.id === 'U2').props.dist, 50);
  proj.parts.push({ id: 'U9', type: 'hcsr04', props: { dist: 50 } });
  const again = S.ensurePairs(proj);
  assert.deepEqual(again, { sensors: 0, stimuli: 0 });
  assert.equal(proj.world3d.sensors.length, 0);
  assert.equal(proj.world3d.stimuli.length, 0);
});

test('board extras do not move TCRT or MPU, and the climate formulas stay', () => {
  const climate = S.compute({
    sensors: [{ id: 'd', kind: 'dht', x: 0, y: 80, z: 0 }],
    stimuli: [{ id: 'h', type: 'heat', x: 0, y: 80, z: 0 }, { id: 'u', type: 'humid', x: 0, y: 80, z: 25 }]
  }).sensors[0];
  assert.equal(climate.temp, 64);
  assert.equal(climate.hum, 90);
  const line = {
    parts: [
      { id: 'T', type: 'tcrt5000', x: 0, y: 0, props: { refl: 0.4, thr: 0.5 } },
      { id: 'M', type: 'mpu6050', x: 0, y: 0, props: { pitch: 0, roll: 0, acc: 0, gz: 0 } },
      { id: 'V', type: 'vl53l0x', x: 0, y: 0, props: { mm: 300 } }
    ],
    world3d: {
      stimuli: [
        { id: 'tape', type: 'tape', x: 0, y: 78, z: 0 },
        { id: 'mv', type: 'mover', x: 10, y: 78, z: 0 }
      ]
    }
  };
  assert.equal(S.applyBoard(line), false);
  assert.equal(line.parts[0].props.refl, 0.4);
  assert.equal(line.parts[1].props.gz, 0);
  assert.equal(line.parts[2].props.mm, 300);
  line.world3d.stimuli[0].z = 80;
  S.applyBoard(line);
  assert.equal(line.parts[0].props.refl, 0.4);
  global.window.RobotUI = { run: {}, paused: false };
  S.applyBoard(line);
  assert.equal(line.parts[0].props.refl, 0.4, 'the track still owns reflectance');
  delete global.window.RobotUI;
  const lines = S.liveLines(line, { sensors: [{ id: 's1', kind: 'ultrasonic', dist: 41 }] }, { running: true, simTime: 1.2, meas: { D1: { I: 0.008 } } });
  assert.ok(lines[0].includes('Симуляция') && lines[0].includes('1.20'));
  assert.ok(lines.some(s => s.includes('41 см')));
  const stopped = S.liveLines({ parts: [{ id: 'D1', type: 'led', props: { color: 'красный' } }] }, { sensors: [] }, { running: false });
  assert.ok(stopped[0].includes('Остановлено'));
  assert.equal(stopped.some(s => s.startsWith('LED')), false);
});

test('tag screen X stays to the right of a left palette and above the anchor', () => {
  const stage = { left: 168, top: 40, right: 980, bottom: 760 };
  const pal = { left: 0, top: 40, right: 168, bottom: 760 };
  const min = S.tagMinScreen(stage, pal);
  assert.equal(min, 176);
  const half = 72;
  const raw = 20;
  const center = S.clampTagX(raw, half, stage.left, min);
  assert.ok(stage.left + raw - half < min, 'unclamped PIR label would sit under the palette');
  assert.ok(stage.left + center - half >= min - 1e-6);
  assert.equal(S.clampTagX(240, half, stage.left, min), 240);
  const phoneStage = { left: 0, top: 92, right: 390, bottom: 760 };
  const phonePal = { left: 0, top: 760, right: 390, bottom: 820 };
  assert.equal(S.tagMinScreen(phoneStage, phonePal), 8);
  const over = { left: 0, top: 40, right: 168, bottom: 760 };
  const overStage = { left: 0, top: 40, right: 980, bottom: 760 };
  assert.equal(S.tagMinScreen(overStage, over), 176);
});
