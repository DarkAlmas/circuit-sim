/* v14.5.7: low-poly schematic on the same table as the v14.5 stimulus world.
 * Procedural Three.js primitives only — no GLB, no network, no new project fields.
 * v14.5.6: passives and the other generic-slab parts get a body silhouette in the
 * 2D group color. «Пассивные» are one mesh, a bit larger in plan than the old
 * 4.8×2.16×1.5 slab, with no bands, legs, or labels. Wire tubes follow pin
 * endpoints (and sanitized bend points) in the same table space.
 * v14.5.7: those tubes sag (a light arc), power leads are a bit thicker, and
 * meshes stay live with the running sim — LED/PIR/DHT/LDR/HC-SR04 and the
 * actuators read the same props and measure() the 2D view already uses.
 *
 * Pose. The schematic SVG origin is the part origin (translate x y, then rotate(rot*90)
 * clockwise because SVG +Y points down). The table is the world3d table: +X right,
 * +Y up, +Z away from the camera that sits on −Z. Table Y = 74 is the top surface.
 *
 *   tableX = schematicX * SCALE
 *   tableZ = schematicY * SCALE
 *   yaw    = −rot * π/2     (rot is 0..3 quarter-turns, same as the SVG)
 *
 * SCALE is 0.12 table-units per SVG unit, so a DevKit drawn ~168×312 px is about
 * 20×37 on a 180×100 table and parts laid out a few hundred pixels apart do not
 * stack on top of each other. Local +Y (down the symbol) becomes table +Z before
 * yaw; localToTable() applies the yaw. This view does not move parts and does not
 * write sensor readings. Meshes are visual only — the 2D canvas stays the editor.
 */
(function () {
  'use strict';
  const SCALE = 0.12;
  const TABLE_Y = 74;
  const LIFT = 0.2;
  const KIND_OF = {
    esp32: 'esp32', esp8266: 'esp8266', esp32c3: 'esp32c3', uno: 'uno', pico: 'pico', opi: 'opi',
    atmega328: 'dip', attiny85: 'dip', ne555: 'dip', hc595: 'dip',
    dht22: 'dht', hcsr04: 'hcsr04', pir: 'pir', ldr: 'ldr', ntc: 'bead',
    resistor: 'resistor', cap: 'cap', ecap: 'ecap', inductor: 'inductor', pot: 'pot', breadboard: 'breadboard',
    led: 'led', rgbled: 'led', diode: 'diode', npn: 'to92',
    mosfet: 'to220', pmosfet: 'to220', lm7805: 'to220', ams1117: 'to220',
    button: 'button', switch: 'switch', voltmeter: 'meter', ammeter: 'meter',
    dc: 'supply', battery: 'battery', liion: 'cell', gnd: 'gnd',
    buzzer: 'buzzer', motor: 'motor', ttmotor: 'motor', coreless: 'motor', servo: 'servo', relay: 'relay',
    usbuart: 'module', boost: 'module', l298n: 'module', drv8833: 'module', lvlshift: 'module',
    tcrt5000: 'module', vl53l0x: 'module', mpu6050: 'module', nrf24: 'module',
    oled: 'panel', lcd1602: 'panel', monitor: 'panel', seg7: 'panel', wsm8: 'panel', wsm16: 'panel', max7219: 'panel',
    strip8: 'strip', ring16: 'ring'
  };
  const FALLBACK = {
    esp32: [168, 312], esp8266: [168, 272], esp32c3: [128, 222], uno: [188, 382], pico: [148, 462],
    opi: [188, 282], dip: [148, 48], dht: [68, 94], hcsr04: [108, 72], pir: [80, 96], ldr: [88, 60],
    generic: [40, 18]
  };
  const THICK = {
    esp32: 1.8, esp8266: 1.8, esp32c3: 1.6, uno: 1.8, pico: 1.6, opi: 1.8, dip: 2.2,
    dht: 8, hcsr04: 1.8, pir: 1.6, ldr: 2.2, generic: 1.5,
    module: 1.8, panel: 1.6, strip: 1.2, ring: 1.4, battery: 3.6, cell: 2.4
  };
  /* Generic slab for an unboxed part is FALLBACK 40×18 × SCALE → 4.8×2.16, height 1.5.
   * Passive bodies sit above that in every axis so a high camera still reads the shape.
   * One primitive, group color only — the pins stay on the schematic coordinates. */
  const PASSIVE = {
    resistor: { len: 6.8, r: 1.5 },
    cap: { r: 2.6, h: 2.3 },
    ecap: { r: 2.5, h: 4.4 },
    inductor: { r: 1.85, tube: 0.95 },
    pot: { r: 2.55, h: 2.6 }
  };
  const BREAD_H = 2.2;
  const WIRE_Y = TABLE_Y + 0.85;
  const WIRE_R = 0.32;
  const WIRE_POWER_R = 0.48;
  const SAG_K = 0.11;
  const SAG_MAX = 1.7;
  const WIRE_NEUTRAL = 0x9aa3b5;
  const GROUP_COLOR = {
    'Платы': 0x243044, 'Датчики': 0x2c6b45, 'Пассивные': 0xc4a574, 'Питание': 0x2c3340,
    'Индикация': 0x3d4f78, 'Активные': 0x3e4a5c, 'Микросхемы': 0x1c1c1e, 'Интерфейсы': 0x3a4658,
    'Полупроводники': 0x1c1c1e, 'Ввод/вывод': 0x3f3a36
  };
  const PASSIVE_COLOR = GROUP_COLOR['Пассивные'];

  function q(v) { return Math.round(v * 1000) / 1000; }
  function finite(v) { const n = +v; return Number.isFinite(n) ? n : 0; }
  function quarters(rot) {
    const n = Math.round(finite(rot));
    return ((n % 4) + 4) % 4;
  }
  function kindOf(type) {
    return Object.prototype.hasOwnProperty.call(KIND_OF, type) ? KIND_OF[type] : 'generic';
  }
  function svgBox(type, kind) {
    const d = window.PARTS && window.PARTS[type];
    const b = d && d.box;
    const fb = FALLBACK[kind] || FALLBACK.generic;
    let w = fb[0], dep = fb[1];
    if (b && Number.isFinite(+b[2]) && Number.isFinite(+b[3]) && +b[2] > 4 && +b[3] > 4) { w = +b[2]; dep = +b[3]; }
    return [Math.min(420, Math.max(12, w)), Math.min(420, Math.max(12, dep))];
  }
  function passiveFootprint(kind) {
    const p = PASSIVE[kind];
    if (!p) return null;
    if (kind === 'resistor') return { w: p.len, d: q(p.r * 2), h: q(p.r * 2), kind };
    if (kind === 'inductor') {
      const outer = q((p.r + p.tube) * 2);
      return { w: outer, d: outer, h: q(p.tube * 2), kind };
    }
    const dia = q(p.r * 2);
    return { w: dia, d: dia, h: p.h, kind };
  }
  function footprint(type) {
    const kind = kindOf(type);
    if (kind === 'breadboard') {
      const box = svgBox(type, kind);
      return { w: q(box[0] * SCALE), d: q(box[1] * SCALE), h: BREAD_H, kind };
    }
    const body = passiveFootprint(kind);
    if (body) return body;
    const [w, d] = svgBox(type, kind);
    return { w: q(w * SCALE), d: q(d * SCALE), h: THICK[kind] || THICK.generic, kind };
  }
  function groupColor(type) {
    const d = window.PARTS && type && window.PARTS[type];
    const g = d && d.group;
    if (g && Object.prototype.hasOwnProperty.call(GROUP_COLOR, g)) return GROUP_COLOR[g];
    return 0x4a5568;
  }
  function pose(part) {
    const p = part && typeof part === 'object' ? part : {};
    const rot = quarters(p.rot);
    return { x: q(finite(p.x) * SCALE), y: TABLE_Y + LIFT, z: q(finite(p.y) * SCALE), yaw: -rot * Math.PI / 2, rot };
  }
  /* Schematic-local point (lx right, ly down) → table offset from the part origin. */
  function localToTable(part, lx, ly) {
    const yaw = pose(part).yaw;
    const x = finite(lx) * SCALE, z = finite(ly) * SCALE;
    const c = Math.cos(yaw), s = Math.sin(yaw);
    return { x: q(x * c + z * s), z: q(-x * s + z * c) };
  }

  function createLib(THREE) {
    if (!THREE) throw new Error('schematic3d: no THREE');
    const geos = new Map(), mats = new Map();
    function geo(key, make) {
      let g = geos.get(key);
      if (!g) { g = make(); geos.set(key, g); }
      return g;
    }
    function qd(v) { const n = Math.round(v * 20) / 20; return n === 0 ? 0.2 : n; }
    function mat(hex, rough, metal, opacity) {
      const op = opacity == null ? 1 : opacity;
      const key = hex + ':' + rough + ':' + metal + ':' + op;
      let m = mats.get(key);
      if (!m) {
        const o = { color: hex, roughness: rough, metalness: metal };
        if (op < 1) { o.transparent = true; o.opacity = op; }
        m = new THREE.MeshStandardMaterial(o);
        mats.set(key, m);
      }
      return m;
    }
    /* Live meshes must not share a material — emissive is per part. */
    function fresh(hex, rough, metal, opacity) {
      const op = opacity == null ? 1 : opacity;
      const o = {
        color: hex,
        roughness: rough == null ? 0.72 : rough,
        metalness: metal == null ? 0.05 : metal,
        emissive: 0x000000,
        emissiveIntensity: 0
      };
      if (op < 1) { o.transparent = true; o.opacity = op; o.depthWrite = false; }
      return new THREE.MeshStandardMaterial(o);
    }
    function box(w, h, d) { const a = qd(w), b = qd(h), c = qd(d); return geo('b' + a + 'x' + b + 'x' + c, () => new THREE.BoxGeometry(a, b, c)); }
    function cyl(r, h, seg) { const a = qd(r), b = qd(h); return geo('c' + a + 'x' + b + 'x' + seg, () => new THREE.CylinderGeometry(a, a, b, seg)); }
    function dome(r) { const a = qd(r); return geo('d' + a, () => new THREE.SphereGeometry(a, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)); }
    function ball(r) { const a = qd(r); return geo('s' + a, () => new THREE.SphereGeometry(a, 12, 8)); }
    function torus(r, tube) {
      const a = qd(r), b = qd(tube);
      return geo('t' + a + 'x' + b, () => new THREE.TorusGeometry(a, b, 6, 10));
    }
    function mesh(geometry, material) { return new THREE.Mesh(geometry, material); }
    return { THREE, geo, mat, fresh, box, cyl, dome, ball, torus, mesh };
  }

  function add(g, lib, w, h, d, color, x, y, z, rough, metal, fx) {
    const r = rough == null ? 0.72 : rough, met = metal == null ? 0.05 : metal;
    const material = fx ? lib.fresh(color, r, met) : lib.mat(color, r, met);
    const m = lib.mesh(lib.box(w, h, d), material);
    m.position.set(x, y, z);
    if (fx) m.userData.fx = fx;
    g.add(m);
    return m;
  }
  function sizeOf(part, kind) {
    const [sw, sd] = svgBox(part && part.type, kind);
    return { w: q(sw * SCALE), d: q(sd * SCALE), h: THICK[kind] || THICK.generic };
  }
  function board(lib, part, o) {
    const kind = o.kind;
    const s = sizeOf(part, kind);
    const w = s.w, d = s.d, h = s.h;
    const g = new lib.THREE.Group();
    add(g, lib, w, h, d, o.color, 0, h / 2, 0, o.rough, o.metal);
    if (o.headers !== false) {
      const hw = Math.max(0.7, q(w * 0.05)), hy = 1.7, hd = q(d * 0.84);
      add(g, lib, hw, hy, hd, 0x141414, -w * 0.46, h + hy / 2, 0, 0.55, 0.18);
      add(g, lib, hw, hy, hd, 0x141414, w * 0.46, h + hy / 2, 0, 0.55, 0.18);
    }
    if (o.module) add(g, lib, q(w * o.module[0]), 1.15, q(d * o.module[1]), o.moduleColor || 0xd5d8de, 0, h + 0.58, -d * (o.moduleAt == null ? 0.16 : o.moduleAt), 0.4, 0.25);
    if (o.antenna) add(g, lib, q(w * 0.36), 0.28, q(d * 0.09), 0xc9a227, 0, h + (o.module ? 1.3 : 0.4), -d * 0.38, 0.35, 0.55);
    if (o.chip) add(g, lib, q(w * o.chip[0]), 0.85, q(d * o.chip[1]), 0x16181c, o.chipX || 0, h + 0.45, o.chipZ == null ? d * 0.02 : o.chipZ, 0.62, 0.12);
    if (o.usb) add(g, lib, q(Math.max(1.4, w * 0.16)), 2.3, q(Math.max(1.1, d * 0.06)), 0xc5cad1, o.usbX || 0, 1.25, d * 0.5, 0.32, 0.48);
    add(g, lib, q(Math.min(1.4, w * 0.08)), 0.4, q(Math.min(1.4, w * 0.08)), 0xffd34d, 0, h + 0.25, -d * 0.44, 0.45, 0.12, 'boardled');
    g.userData.kind = kind;
    return g;
  }
  function esp32(lib, part) {
    return board(lib, part, { kind: 'esp32', color: 0x1b1e22, module: [0.46, 0.28], moduleColor: 0x2c3138, antenna: true, chip: [0.34, 0.16], chipZ: null, usb: true });
  }
  function esp8266(lib, part) {
    return board(lib, part, { kind: 'esp8266', color: 0x173a8a, rough: 0.7, module: [0.42, 0.3], moduleColor: 0xd5d8de, antenna: true, usb: true });
  }
  function esp32c3(lib, part) {
    return board(lib, part, { kind: 'esp32c3', color: 0x151515, module: [0.5, 0.22], moduleColor: 0x3a3f46, antenna: true, chip: [0.28, 0.12], usb: true });
  }
  function uno(lib, part) {
    const g = board(lib, part, { kind: 'uno', color: 0x0f6f86, rough: 0.66, chip: [0.28, 0.16], chipZ: 0, usb: true, usbX: 0 });
    const s = sizeOf(part, 'uno');
    const jack = lib.mesh(lib.cyl(Math.max(0.9, s.w * 0.055), Math.max(1.2, s.d * 0.07), 10), lib.mat(0x1a1a1a, 0.5, 0.35));
    jack.rotation.x = Math.PI / 2;
    jack.position.set(-s.w * 0.36, 1.5, s.d * 0.4);
    g.add(jack);
    return g;
  }
  function pico(lib, part) {
    return board(lib, part, { kind: 'pico', color: 0x1f7a3a, rough: 0.68, chip: [0.4, 0.12], usb: true });
  }
  function opi(lib, part) {
    const g = board(lib, part, { kind: 'opi', color: 0x1a1c1f, chip: [0.34, 0.18], headers: true });
    const s = sizeOf(part, 'opi');
    add(g, lib, q(s.w * 0.16), 2.4, q(s.d * 0.1), 0xb7bcc4, s.w * 0.32, 1.4, -s.d * 0.36, 0.35, 0.4);
    return g;
  }
  function dip(lib, part) {
    const g = board(lib, part, { kind: 'dip', color: 0x1c1c1e, headers: false, chip: [0.7, 0.45] });
    return g;
  }
  function stand(mesh, kind) {
    mesh.userData.fx = 'standin';
    mesh.userData.stand = kind;
    mesh.visible = false;
    return mesh;
  }
  function pinsAt(g, lib, w, d, n) {
    const span = Math.min(w * 0.7, (n - 1) * 1.6);
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 0 : -span / 2 + (span * i) / (n - 1);
      add(g, lib, 0.7, 1.2, 1.6, 0xd4b13a, x, 0.7, d * 0.52, 0.4, 0.55);
    }
  }
  function dht(lib, part) {
    const s = sizeOf(part, 'dht'), g = new lib.THREE.Group();
    add(g, lib, s.w, s.h, s.d, 0xf4f4f4, 0, s.h / 2, 0, 0.55, 0.02, 'body');
    for (let i = 0; i < 4; i++) add(g, lib, s.w * 0.62, 0.3, 0.4, 0xb7bec6, 0, s.h + 0.16, -s.d * 0.24 + i * s.d * 0.14, 0.6, 0.05);
    pinsAt(g, lib, s.w, s.d, 3);
    const flame = lib.mesh(lib.cyl(0.42, 1.15, 8), lib.fresh(0xff9f1c, 0.4, 0.05));
    flame.position.set(s.w * 0.72, s.h + 0.7, 0);
    stand(flame, 'heat');
    g.add(flame);
    const puff = lib.mesh(lib.ball(0.62), lib.fresh(0xd7f3ff, 0.25, 0.02, 0.55));
    puff.position.set(-s.w * 0.72, s.h + 0.85, 0);
    stand(puff, 'humid');
    g.add(puff);
    g.userData.kind = 'dht';
    return g;
  }
  function hcsr04(lib, part) {
    const s = sizeOf(part, 'hcsr04'), g = new lib.THREE.Group();
    add(g, lib, s.w, s.h, s.d, 0x1d4fd0, 0, s.h / 2, 0, 0.62, 0.06);
    for (const x of [-s.w * 0.26, s.w * 0.26]) {
      const eye = lib.mesh(lib.cyl(Math.max(1.1, s.w * 0.14), 1.5, 14), lib.mat(0xd5d8de, 0.4, 0.15));
      eye.position.set(x, s.h + 0.75, -s.d * 0.08);
      g.add(eye);
      const pup = lib.mesh(lib.cyl(Math.max(0.55, s.w * 0.07), 0.7, 12), lib.fresh(0x1a1d24, 0.5, 0.1));
      pup.position.set(x, s.h + 1.35, -s.d * 0.08);
      pup.userData.fx = 'eye';
      g.add(pup);
    }
    const beam = lib.mesh(lib.cyl(0.28, 1, 8), lib.fresh(0x4c7dff, 0.35, 0.08, 0.45));
    beam.rotation.x = -Math.PI / 2;
    beam.userData.fx = 'beam';
    beam.userData.z0 = -s.d * 0.42;
    beam.position.set(0, s.h * 0.72, beam.userData.z0);
    g.add(beam);
    const cube = lib.mesh(lib.box(1.15, 1.15, 1.15), lib.fresh(0x9aa3b2, 0.62, 0.08));
    cube.position.set(s.w * 0.62, s.h * 0.7, -s.d * 0.1);
    stand(cube, 'block');
    g.add(cube);
    pinsAt(g, lib, s.w, s.d, 4);
    g.userData.kind = 'hcsr04';
    return g;
  }
  function pir(lib, part) {
    const s = sizeOf(part, 'pir'), g = new lib.THREE.Group();
    add(g, lib, s.w, s.h, s.d, 0x1a6b3c, 0, s.h / 2, 0, 0.68, 0.04);
    const dome = lib.mesh(lib.dome(Math.max(1.6, s.w * 0.28)), lib.fresh(0xf7f7fb, 0.22, 0.04, 0.92));
    dome.position.y = s.h;
    dome.userData.fx = 'dome';
    g.add(dome);
    add(g, lib, 0.7, 0.45, 0.7, 0xff3b30, s.w * 0.28, s.h + 0.3, s.d * 0.18, 0.45, 0.1, 'pip');
    const fig = new lib.THREE.Group();
    const body = lib.mesh(lib.box(0.7, 1.1, 0.4), lib.fresh(0x3d5a80, 0.6, 0.06));
    body.position.y = 0.55;
    const head = lib.mesh(lib.ball(0.38), lib.fresh(0xf2c9a0, 0.5, 0.04));
    head.position.y = 1.35;
    fig.add(body, head);
    fig.position.set(0, s.h + 0.2, -s.d * 0.72);
    stand(fig, 'mover');
    g.add(fig);
    pinsAt(g, lib, s.w, s.d, 3);
    g.userData.kind = 'pir';
    return g;
  }
  function ldr(lib, part) {
    const s = sizeOf(part, 'ldr'), g = new lib.THREE.Group();
    const disc = lib.mesh(lib.cyl(Math.max(1.2, s.w * 0.28), s.h, 16), lib.fresh(0xe8c89a, 0.6, 0.04));
    disc.position.y = s.h / 2;
    disc.userData.fx = 'disc';
    g.add(disc);
    for (let i = -1; i <= 1; i++) add(g, lib, s.w * 0.36, 0.28, 0.35, 0xbb3333, 0, s.h + 0.15, i * 0.7, 0.5, 0.05);
    const lamp = lib.mesh(lib.ball(0.7), lib.fresh(0xfff2a8, 0.3, 0.05));
    lamp.position.set(0, s.h + 1.7, 0);
    stand(lamp, 'flashlight');
    g.add(lamp);
    g.userData.kind = 'ldr';
    return g;
  }
  function generic(lib, part) {
    const s = sizeOf(part, 'generic');
    const g = new lib.THREE.Group();
    add(g, lib, s.w, s.h, s.d, groupColor(part && part.type), 0, s.h / 2, 0, 0.74, 0.04);
    g.userData.kind = 'generic';
    return g;
  }
  function axial(lib, kind, len, r, color) {
    const g = new lib.THREE.Group();
    const m = lib.mesh(lib.cyl(r, len, 12), lib.mat(color, 0.58, 0.08));
    m.rotation.z = Math.PI / 2;
    m.position.y = r;
    g.add(m);
    g.userData.kind = kind;
    return g;
  }
  function upright(lib, kind, r, h, color) {
    const g = new lib.THREE.Group();
    const m = lib.mesh(lib.cyl(r, h, 12), lib.mat(color, 0.58, 0.08));
    m.position.y = h / 2;
    g.add(m);
    g.userData.kind = kind;
    return g;
  }
  function passiveCoil(lib) {
    const g = new lib.THREE.Group();
    const p = PASSIVE.inductor;
    const m = lib.mesh(lib.torus(p.r, p.tube), lib.mat(PASSIVE_COLOR, 0.58, 0.08));
    m.rotation.x = Math.PI / 2;
    m.position.y = p.tube;
    g.add(m);
    g.userData.kind = 'inductor';
    return g;
  }
  function passiveBoard(lib, part) {
    const [sw, sd] = svgBox(part && part.type, 'breadboard');
    const g = new lib.THREE.Group();
    add(g, lib, q(sw * SCALE), BREAD_H, q(sd * SCALE), PASSIVE_COLOR, 0, BREAD_H / 2, 0, 0.78, 0.04);
    g.userData.kind = 'breadboard';
    return g;
  }
  function fixedBox(lib, part, kind, w, h, d) {
    const g = new lib.THREE.Group();
    add(g, lib, w, h, d, groupColor(part && part.type), 0, h / 2, 0, 0.68, 0.06);
    g.userData.kind = kind;
    return g;
  }
  function ledShape(lib, part) {
    const g = new lib.THREE.Group();
    const wide = !!(part && part.type === 'rgbled');
    const n = wide ? 4 : 2;
    const span = wide ? 3.2 : 2.2;
    add(g, lib, wide ? 4.2 : 2.6, 0.7, 1.6, groupColor(part && part.type), 0, 0.35, 0, 0.6, 0.08);
    for (let i = 0; i < n; i++) {
      const x = -span / 2 + span * i / (n - 1);
      add(g, lib, 0.28, 2.0, 0.28, 0xc5cad1, x, 1.0, 0, 0.4, 0.5);
    }
    const dome = lib.mesh(lib.dome(wide ? 1.55 : 1.25), lib.fresh(0xf4f1ea, 0.25, 0.04, 0.94));
    dome.position.y = 2.0;
    dome.userData.fx = 'lens';
    g.add(dome);
    const halo = lib.mesh(lib.ball(wide ? 2.35 : 1.85), lib.fresh(0xff3030, 0.3, 0.02, 0.01));
    halo.position.y = 2.55;
    halo.userData.fx = 'halo';
    halo.visible = false;
    g.add(halo);
    g.userData.kind = 'led';
    return g;
  }
  function to220(lib, part) {
    const g = new lib.THREE.Group();
    add(g, lib, 3.4, 1.5, 4.6, groupColor(part && part.type), 0, 0.75, 0.3, 0.55, 0.12);
    add(g, lib, 2.6, 0.35, 1.8, 0xc5cad1, 0, 1.7, -1.6, 0.35, 0.55);
    g.userData.kind = 'to220';
    return g;
  }
  function bead(lib, part) {
    const g = new lib.THREE.Group();
    const m = lib.mesh(lib.ball(1.35), lib.fresh(groupColor(part && part.type), 0.5, 0.06));
    m.position.y = 1.35;
    m.userData.fx = 'bead';
    g.add(m);
    g.userData.kind = 'bead';
    return g;
  }
  function buzzerShape(lib, part) {
    const g = new lib.THREE.Group();
    const cap = lib.mesh(lib.cyl(2.0, 1.7, 14), lib.fresh(groupColor(part && part.type), 0.55, 0.08));
    cap.position.y = 0.85;
    cap.userData.fx = 'cap';
    g.add(cap);
    for (let i = 0; i < 2; i++) {
      const wave = lib.mesh(lib.torus(2.35 + i * 0.55, 0.1), lib.fresh(0xffd34d, 0.4, 0.08, 0.2));
      wave.rotation.x = Math.PI / 2;
      wave.position.y = 2.05 + i * 0.28;
      wave.userData.fx = 'wave';
      wave.userData.wave = i;
      wave.visible = false;
      g.add(wave);
    }
    g.userData.kind = 'buzzer';
    return g;
  }
  function motorShape(lib, part) {
    const g = new lib.THREE.Group();
    const body = lib.mesh(lib.cyl(2.1, 3.4, 14), lib.mat(groupColor(part && part.type), 0.5, 0.18));
    body.rotation.z = Math.PI / 2;
    body.position.y = 2.1;
    g.add(body);
    const hub = new lib.THREE.Group();
    hub.position.set(2.4, 2.1, 0);
    hub.userData.fx = 'shaft';
    const shaft = lib.mesh(lib.cyl(0.45, 1.6, 8), lib.mat(0xc5cad1, 0.35, 0.55));
    shaft.rotation.z = Math.PI / 2;
    const stripe = lib.mesh(lib.box(0.18, 1.45, 0.5), lib.mat(0x2a2e33, 0.5, 0.2));
    stripe.rotation.z = Math.PI / 2;
    hub.add(shaft, stripe);
    g.add(hub);
    g.userData.kind = 'motor';
    return g;
  }
  function servoShape(lib, part) {
    const g = new lib.THREE.Group();
    add(g, lib, 5.4, 2.4, 3.2, groupColor(part && part.type), 0, 1.2, 0, 0.6, 0.08);
    const horn = new lib.THREE.Group();
    horn.position.set(1.2, 2.6, 0);
    horn.userData.fx = 'horn';
    const disk = lib.mesh(lib.cyl(1.1, 0.45, 10), lib.mat(0xe8e8e8, 0.5, 0.08));
    const arm = lib.mesh(lib.box(0.32, 0.18, 1.55), lib.mat(0xf7f7f7, 0.5, 0.06));
    arm.position.set(0.15, 0.32, 0.7);
    horn.add(disk, arm);
    g.add(horn);
    g.userData.kind = 'servo';
    return g;
  }
  function relayShape(lib, part) {
    const g = new lib.THREE.Group();
    add(g, lib, 5.2, 2.6, 4.4, groupColor(part && part.type), 0, 1.3, 0, 0.62, 0.08);
    const coil = lib.mesh(lib.cyl(0.9, 1.2, 10), lib.fresh(0xc9a46a, 0.55, 0.2));
    coil.rotation.z = Math.PI / 2;
    coil.position.set(-0.6, 2.9, 0);
    coil.userData.fx = 'coil';
    g.add(coil);
    g.userData.kind = 'relay';
    return g;
  }
  function boxed(lib, part, kind) {
    const s = sizeOf(part, kind);
    const g = new lib.THREE.Group();
    add(g, lib, s.w, s.h, s.d, groupColor(part && part.type), 0, s.h / 2, 0, 0.66, 0.08);
    if (kind === 'battery' || kind === 'cell') add(g, lib, Math.max(0.8, s.w * 0.22), 0.55, Math.max(0.6, s.d * 0.16), 0xc5cad1, 0, s.h + 0.28, -s.d * 0.18, 0.4, 0.4);
    g.userData.kind = kind;
    return g;
  }
  function moduleShape(lib, part) {
    const s = sizeOf(part, 'module');
    const g = new lib.THREE.Group();
    add(g, lib, s.w, s.h, s.d, groupColor(part && part.type), 0, s.h / 2, 0, 0.68, 0.06);
    add(g, lib, Math.max(1.2, q(s.w * 0.28)), 0.7, Math.max(1.0, q(s.d * 0.22)), 0x16181c, 0, s.h + 0.35, -s.d * 0.08, 0.55, 0.12, 'chip');
    const beam = lib.mesh(lib.cyl(0.22, 1, 8), lib.fresh(0xff5544, 0.4, 0.08, 0.5));
    beam.rotation.x = -Math.PI / 2;
    beam.userData.fx = 'beam';
    beam.userData.z0 = -s.d * 0.62;
    beam.position.set(0, s.h * 0.7, beam.userData.z0);
    beam.visible = false;
    g.add(beam);
    g.userData.kind = 'module';
    return g;
  }
  function panelShape(lib, part) {
    const s = sizeOf(part, 'panel');
    const g = new lib.THREE.Group();
    add(g, lib, s.w, s.h, s.d, groupColor(part && part.type), 0, s.h / 2, 0, 0.6, 0.08);
    add(g, lib, q(s.w * 0.78), 0.2, q(s.d * 0.62), 0x10141c, 0, s.h + 0.1, -s.d * 0.04, 0.4, 0.15, 'screen');
    g.userData.kind = 'panel';
    return g;
  }
  function stripShape(lib, part) {
    const s = sizeOf(part, 'strip');
    const g = new lib.THREE.Group();
    const h = Math.min(s.h, 1.2);
    add(g, lib, s.w, h, s.d, groupColor(part && part.type), 0, h / 2, 0, 0.62, 0.06);
    const n = 4;
    for (let i = 0; i < n; i++) {
      const x = -s.w * 0.36 + (s.w * 0.72) * i / (n - 1);
      const dot = lib.mesh(lib.dome(Math.min(0.7, s.d * 0.22)), lib.fresh(0xd7dde6, 0.35, 0.08));
      dot.position.set(x, h, 0);
      dot.userData.fx = 'pixel';
      dot.userData.i = i;
      g.add(dot);
    }
    g.userData.kind = 'strip';
    return g;
  }
  function ringShape(lib, part) {
    const s = sizeOf(part, 'ring');
    const g = new lib.THREE.Group();
    const tube = Math.max(0.55, Math.min(s.w, s.d) * 0.08);
    const r = Math.max(1.4, Math.min(s.w, s.d) * 0.32 - tube);
    const m = lib.mesh(lib.torus(r, tube), lib.mat(groupColor(part && part.type), 0.55, 0.1));
    m.rotation.x = Math.PI / 2;
    m.position.y = tube;
    g.add(m);
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2;
      const dot = lib.mesh(lib.ball(Math.max(0.35, tube * 0.7)), lib.fresh(0xd7dde6, 0.35, 0.08));
      dot.position.set(Math.cos(a) * r, tube + 0.15, Math.sin(a) * r);
      dot.userData.fx = 'pixel';
      dot.userData.i = i;
      g.add(dot);
    }
    g.userData.kind = 'ring';
    return g;
  }
  function silence(obj) {
    const kill = o => { if (o) o.raycast = function () {}; };
    if (obj && typeof obj.traverse === 'function') obj.traverse(kill);
    else if (obj && obj.children) { kill(obj); for (const c of obj.children) kill(c); }
    else kill(obj);
    return obj;
  }
  function build(lib, part) {
    const kind = kindOf(part && part.type);
    const color = part && part.type ? groupColor(part.type) : PASSIVE_COLOR;
    let g;
    switch (kind) {
      case 'esp32': g = esp32(lib, part); break;
      case 'esp8266': g = esp8266(lib, part); break;
      case 'esp32c3': g = esp32c3(lib, part); break;
      case 'uno': g = uno(lib, part); break;
      case 'pico': g = pico(lib, part); break;
      case 'opi': g = opi(lib, part); break;
      case 'dip': g = dip(lib, part); break;
      case 'dht': g = dht(lib, part); break;
      case 'hcsr04': g = hcsr04(lib, part); break;
      case 'pir': g = pir(lib, part); break;
      case 'ldr': g = ldr(lib, part); break;
      case 'resistor': g = axial(lib, 'resistor', PASSIVE.resistor.len, PASSIVE.resistor.r, PASSIVE_COLOR); break;
      case 'cap': g = upright(lib, 'cap', PASSIVE.cap.r, PASSIVE.cap.h, PASSIVE_COLOR); break;
      case 'ecap': g = upright(lib, 'ecap', PASSIVE.ecap.r, PASSIVE.ecap.h, PASSIVE_COLOR); break;
      case 'inductor': g = passiveCoil(lib); break;
      case 'pot': g = upright(lib, 'pot', PASSIVE.pot.r, PASSIVE.pot.h, PASSIVE_COLOR); break;
      case 'breadboard': g = passiveBoard(lib, part); break;
      case 'led': g = ledShape(lib, part); break;
      case 'diode': g = axial(lib, 'diode', 6.2, 0.95, color); break;
      case 'to92': g = upright(lib, 'to92', 1.5, 3.2, color); break;
      case 'to220': g = to220(lib, part); break;
      case 'button': {
        g = upright(lib, 'button', 1.8, 1.8, color);
        g.children[0].userData.fx = 'press';
        g.children[0].userData.y0 = 0.9;
        break;
      }
      case 'switch': {
        g = fixedBox(lib, part, 'switch', 4.4, 1.4, 2.2);
        g.children[0].userData.fx = 'press';
        break;
      }
      case 'meter': {
        g = fixedBox(lib, part, 'meter', 5.2, 2.4, 3.2);
        const needle = lib.mesh(lib.box(0.12, 0.22, 1.25), lib.fresh(0x1a1d24, 0.4, 0.3));
        needle.position.set(0, 2.55, 0.35);
        needle.userData.fx = 'needle';
        g.add(needle);
        break;
      }
      case 'supply': g = fixedBox(lib, part, 'supply', 4.8, 3.0, 3.4); break;
      case 'battery': g = boxed(lib, part, 'battery'); break;
      case 'gnd': g = upright(lib, 'gnd', 1.5, 2.0, color); break;
      case 'cell': g = boxed(lib, part, 'cell'); break;
      case 'buzzer': g = buzzerShape(lib, part); break;
      case 'motor': g = motorShape(lib, part); break;
      case 'servo': g = servoShape(lib, part); break;
      case 'relay': g = relayShape(lib, part); break;
      case 'bead': g = bead(lib, part); break;
      case 'module': g = moduleShape(lib, part); break;
      case 'panel': g = panelShape(lib, part); break;
      case 'strip': g = stripShape(lib, part); break;
      case 'ring': g = ringShape(lib, part); break;
      case 'generic': g = generic(lib, part); break;
      default: { const never = kind; throw new Error('schematic3d: ' + never); }
    }
    return silence(g);
  }
  function wireColorHex(name) {
    const table = window.WIRE_COLORS;
    if (typeof name === 'string' && table && Object.prototype.hasOwnProperty.call(table, name)) {
      const hex = table[name];
      if (typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex)) return parseInt(hex.slice(1), 16);
    }
    return WIRE_NEUTRAL;
  }
  function pinPoint(part, pin) {
    const at = pose(part);
    const loc = localToTable(part, pin ? pin.x : 0, pin ? pin.y : 0);
    return { x: q(at.x + loc.x), y: WIRE_Y, z: q(at.z + loc.z) };
  }
  function wirePoints(parts, wire) {
    if (!wire || !wire.a || !wire.b) return [];
    const list = Array.isArray(parts) ? parts : [];
    const byId = new Map();
    for (const p of list) if (p && p.id) byId.set(p.id, p);
    const end = e => {
      const p = e && byId.get(e.part);
      const d = p && window.PARTS && window.PARTS[p.type];
      const pin = d && Array.isArray(d.pins) ? d.pins.find(q => q.id === e.pin) : null;
      if (!p || !pin) return null;
      return pinPoint(p, pin);
    };
    const a = end(wire.a), b = end(wire.b);
    if (!a || !b) return [];
    const mid = [];
    if (Array.isArray(wire.pts)) {
      for (const pt of wire.pts) {
        if (!Array.isArray(pt) || pt.length < 2 || !Number.isFinite(+pt[0]) || !Number.isFinite(+pt[1])) continue;
        mid.push({ x: q(finite(pt[0]) * SCALE), y: WIRE_Y, z: q(finite(pt[1]) * SCALE) });
      }
    }
    const out = [];
    for (const p of [a, ...mid, b]) {
      const prev = out[out.length - 1];
      if (prev && prev.x === p.x && prev.z === p.z) continue;
      out.push(p);
    }
    return out;
  }
  function isPowerPin(pin) {
    return typeof pin === 'string' && /^(gnd\d*|3v3b?|vin|vcc|5v|vbat|bat)$/i.test(pin);
  }
  function wirePower(wire) {
    if (!wire) return false;
    if (wire.color === 'красный' || wire.color === 'чёрный') return true;
    return isPowerPin(wire.a && wire.a.pin) || isPowerPin(wire.b && wire.b.pin);
  }
  function wireRadius(wire) { return wirePower(wire) ? WIRE_POWER_R : WIRE_R; }
  /* Quadratic-free sine sag: ends stay on the pin, the middle dips toward the table. */
  function sagPoints(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const horiz = Math.hypot(dx, dz);
    const drop = Math.min(SAG_MAX, horiz * SAG_K);
    const n = drop < 0.06 ? 1 : 3;
    const out = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const sag = drop * Math.sin(Math.PI * t);
      out.push({ x: q(a.x + dx * t), y: q(a.y + dy * t - sag), z: q(a.z + dz * t) });
    }
    return out;
  }
  function addTube(g, lib, a, b, color, radius, sag) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (!(len >= 0.12)) return;
    const r = radius > 0 ? radius : WIRE_R;
    const m = lib.mesh(lib.cyl(r, len, 7), lib.mat(color, 0.55, 0.08));
    m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    m.quaternion.setFromUnitVectors(new lib.THREE.Vector3(0, 1, 0), new lib.THREE.Vector3(dx / len, dy / len, dz / len));
    m.userData.r = r;
    m.userData.sag = sag || 0;
    g.add(m);
  }
  function buildWires(lib, parts, wires) {
    const g = new lib.THREE.Group();
    g.userData.role = 'wires';
    const list = Array.isArray(wires) ? wires : [];
    for (const w of list) {
      const pts = wirePoints(parts, w);
      const color = wireColorHex(w && w.color);
      const radius = wireRadius(w);
      for (let i = 1; i < pts.length; i++) {
        const samples = sagPoints(pts[i - 1], pts[i]);
        const mid = samples[Math.floor(samples.length / 2)];
        const baseY = (pts[i - 1].y + pts[i].y) / 2;
        const sag = q(Math.max(0, baseY - mid.y));
        for (let k = 1; k < samples.length; k++) addTube(g, lib, samples[k - 1], samples[k], color, radius, sag);
      }
    }
    return silence(g);
  }
  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function mixColor(a, b, t) {
    const u = clamp01(t);
    const ch = (c, s) => (c >> s) & 255;
    const r = Math.round(ch(a, 16) + (ch(b, 16) - ch(a, 16)) * u);
    const g = Math.round(ch(a, 8) + (ch(b, 8) - ch(a, 8)) * u);
    const bl = Math.round(ch(a, 0) + (ch(b, 0) - ch(a, 0)) * u);
    return (r << 16) | (g << 8) | bl;
  }
  function ledCss(name) {
    const row = window.LED_COLORS && window.LED_COLORS[name];
    const hex = row && row[0];
    if (typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex)) return parseInt(hex.slice(1), 16);
    return 0xff3030;
  }
  function stimuliOf(st) {
    const s = st && st.stimuli;
    if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
    return { block: !!s.block, flashlight: !!s.flashlight, heat: !!s.heat, humid: !!s.humid, mover: !!s.mover };
  }
  function standOn(have, key) { return !have || !have[key]; }
  function heatColor(temp) {
    const neutral = 0xf4f4f4;
    if (temp >= 18) return mixColor(neutral, 0xe07a2f, clamp01((temp - 18) / 42));
    return mixColor(neutral, 0x7eb6e8, clamp01((18 - temp) / 28));
  }
  /* Plain description of how a part should look. Reads the same signals as the 2D draw(). */
  function liveVisual(part, st) {
    const p = part && typeof part === 'object' ? part : {};
    const s = st && typeof st === 'object' ? st : {};
    const kind = kindOf(p.type);
    const props = p.props && typeof p.props === 'object' && !Array.isArray(p.props) ? p.props : {};
    const m = s.m && typeof s.m === 'object' ? s.m : null;
    const running = !!s.running;
    const have = stimuliOf(s);
    const visual = { kind, running, stand: { block: false, flashlight: false, heat: false, humid: false, mover: false } };
    const I = m && Number.isFinite(+m.I) ? +m.I : (Number.isFinite(+s.I) ? +s.I : 0);
    switch (kind) {
      case 'led': {
        if (p.type === 'rgbled') {
          const ch = m && Array.isArray(m.ch) ? m.ch : [0, 0, 0];
          const k = [0, 1, 2].map(i => Math.min(1, Math.max(0, +ch[i] || 0) / 0.012));
          const b = Math.max(k[0], k[1], k[2]);
          visual.lit = running && !p.burned && !s.burned && b > 0.02;
          visual.glow = visual.lit ? b : 0;
          visual.color = (Math.round(255 * k[0]) << 16) | (Math.round(255 * k[1]) << 8) | Math.round(255 * k[2]);
        } else {
          visual.lit = running && !p.burned && !s.burned && I > 0.001;
          visual.glow = visual.lit ? Math.min(1, I / 0.015) : 0;
          visual.color = ledCss(props.color);
        }
        break;
      }
      case 'pir': {
        visual.motion = !!props.motion;
        visual.glow = visual.motion ? 1 : 0;
        visual.color = 0xff3b30;
        visual.stand.mover = standOn(have, 'mover');
        break;
      }
      case 'dht': {
        const temp = finite(props.temp), hum = finite(props.hum);
        visual.temp = temp;
        visual.hum = hum;
        visual.warm = clamp01((temp - 18) / 42);
        visual.wet = clamp01((hum - 40) / 60);
        visual.color = heatColor(temp);
        visual.stand.heat = standOn(have, 'heat');
        visual.stand.humid = standOn(have, 'humid');
        break;
      }
      case 'bead': {
        const temp = finite(props.temp);
        visual.temp = temp;
        visual.warm = clamp01((temp - 18) / 42);
        visual.color = heatColor(temp);
        break;
      }
      case 'ldr': {
        const lux = finite(props.lux);
        visual.lux = lux;
        visual.glow = clamp01(Math.log10(Math.max(1, lux + 1)) / 4.2);
        visual.color = 0xfff1c2;
        visual.stand.flashlight = standOn(have, 'flashlight');
        break;
      }
      case 'hcsr04': {
        const dist = Number.isFinite(+props.dist) ? +props.dist : 50;
        visual.dist = dist;
        visual.hit = dist < 390;
        visual.beamLen = q(0.7 + Math.min(Math.max(dist, 2), 160) * 0.038);
        visual.glow = visual.hit ? 0.85 : 0.15;
        visual.color = 0x4c7dff;
        visual.stand.block = standOn(have, 'block');
        break;
      }
      case 'buzzer': {
        const now = Number.isFinite(+s.now) ? +s.now : 0;
        visual.on = running && I > 0.005;
        visual.pulse = visual.on ? 0.35 + 0.65 * Math.abs(Math.sin(now / 140)) : 0;
        visual.color = 0xffd34d;
        break;
      }
      case 'motor': {
        visual.spin = running ? finite(s.anim) : 0;
        visual.rpm = p._st && Number.isFinite(+p._st.rpm) ? +p._st.rpm : 0;
        break;
      }
      case 'servo': {
        visual.angle = s.on && s.mod && Number.isFinite(+s.mod.a) ? Math.max(0, Math.min(180, +s.mod.a)) : 90;
        break;
      }
      case 'relay': {
        visual.on = !!p._on;
        visual.glow = visual.on ? 0.75 : 0;
        visual.color = 0xff9f1c;
        break;
      }
      case 'button':
      case 'switch':
        visual.pressed = !!p.on;
        break;
      case 'meter': {
        if (p.type === 'ammeter') visual.needle = Math.max(-1, Math.min(1, (m ? +m.I || 0 : 0) / 0.5));
        else visual.needle = Math.max(-1, Math.min(1, (m ? +m.U || 0 : 0) / 12));
        break;
      }
      case 'strip':
      case 'ring': {
        const px = s.on && s.mod && Array.isArray(s.mod.px) ? s.mod.px : [];
        visual.px = px.slice(0, 64).map(c => c | 0);
        break;
      }
      case 'panel': {
        visual.glow = 0;
        visual.color = 0x10141c;
        if (s.on) {
          visual.glow = 0.55;
          visual.color = p.type === 'oled' || p.type === 'monitor' ? 0x9fd0ff : 0x9bc53d;
        }
        if (m && m.seg) {
          const keys = Object.keys(m.seg);
          if (keys.some(k => +m.seg[k] > 0.0005)) { visual.glow = 0.9; visual.color = 0xff3030; }
        }
        if (s.mod && Array.isArray(s.mod.rows) && s.mod.rows.some(r => (r | 0) & 255)) { visual.glow = 0.85; visual.color = 0xff3030; }
        break;
      }
      case 'module': {
        if (p.type === 'vl53l0x') {
          const mm = finite(props.mm);
          visual.mm = mm;
          visual.beamLen = q(0.6 + Math.min(Math.max(mm, 30), 800) * 0.004);
          visual.showBeam = true;
          visual.color = 0xff5544;
        } else if (p.type === 'tcrt5000') {
          visual.refl = finite(props.refl);
          visual.glow = clamp01(visual.refl);
          visual.color = 0xff5533;
        } else if (p.type === 'mpu6050') {
          visual.pitch = finite(props.pitch);
          visual.roll = finite(props.roll);
        } else if (p.type === 'nrf24') {
          const now = Number.isFinite(+s.now) ? +s.now : 0;
          visual.tx = !!(p._txT && now - p._txT < 150);
          visual.glow = visual.tx ? 1 : 0;
          visual.color = 0x4c7dff;
        }
        break;
      }
      case 'esp32':
      case 'esp8266':
      case 'esp32c3':
      case 'uno':
      case 'pico':
      case 'opi':
      case 'dip':
        visual.led2 = !!s.led2;
        break;
      case 'resistor':
      case 'cap':
      case 'ecap':
      case 'inductor':
      case 'pot':
      case 'breadboard':
      case 'diode':
      case 'to92':
      case 'to220':
      case 'supply':
      case 'battery':
      case 'gnd':
      case 'cell':
      case 'generic':
        break;
      default: {
        const never = kind;
        throw new Error('schematic3d: ' + never);
      }
    }
    return visual;
  }
  function setHex(material, key, hex) {
    if (!material) return;
    const slot = material[key];
    const n = hex >>> 0;
    if (slot && typeof slot.setHex === 'function') slot.setHex(n);
    else material[key] = n;
  }
  function setEmissive(material, hex, intensity) {
    setHex(material, 'emissive', hex);
    if (material) material.emissiveIntensity = intensity;
  }
  function setOpacity(material, op) {
    if (!material) return;
    material.opacity = op;
    material.transparent = op < 1;
  }
  function walkFx(obj, fn) {
    if (!obj) return;
    if (obj.userData && obj.userData.fx) fn(obj);
    const kids = obj.children || [];
    for (let i = 0; i < kids.length; i++) walkFx(kids[i], fn);
  }
  function applyLive(group, visual) {
    if (!group || !visual) return group;
    group.userData.live = visual;
    const glow = Number.isFinite(+visual.glow) ? +visual.glow : 0;
    const color = Number.isFinite(+visual.color) ? visual.color : 0xffffff;
    walkFx(group, m => {
      const fx = m.userData.fx;
      const mat = m.material;
      switch (fx) {
        case 'lens': {
          if (visual.lit) { setHex(mat, 'color', color); setEmissive(mat, color, 0.35 + glow * 0.7); setOpacity(mat, 0.96); }
          else { setHex(mat, 'color', 0xf4f1ea); setEmissive(mat, 0, 0); setOpacity(mat, 0.94); }
          break;
        }
        case 'halo': {
          m.visible = !!(visual.lit && glow > 0.02);
          setHex(mat, 'color', color);
          setEmissive(mat, color, glow);
          setOpacity(mat, m.visible ? 0.18 + 0.45 * glow : 0);
          if (m.scale && m.scale.set) m.scale.set(0.75 + glow, 0.75 + glow, 0.75 + glow);
          break;
        }
        case 'dome': {
          if (visual.motion) { setHex(mat, 'color', 0xffe4e1); setEmissive(mat, 0xff3b30, 0.85); }
          else { setHex(mat, 'color', 0xf7f7fb); setEmissive(mat, 0, 0); }
          break;
        }
        case 'pip':
          setEmissive(mat, 0xff3b30, visual.motion ? 0.95 : 0.05);
          break;
        case 'body':
          if (Number.isFinite(+visual.color)) setHex(mat, 'color', visual.color);
          setEmissive(mat, 0x7ec8e3, visual.wet ? 0.12 * visual.wet : 0);
          break;
        case 'bead':
          if (Number.isFinite(+visual.color)) setHex(mat, 'color', visual.color);
          setEmissive(mat, visual.color || 0, visual.warm ? 0.25 * visual.warm : 0);
          break;
        case 'disc':
          setEmissive(mat, 0xfff1c2, glow);
          setHex(mat, 'color', mixColor(0xe8c89a, 0xfff6d8, glow));
          break;
        case 'eye':
          setEmissive(mat, color, glow);
          break;
        case 'beam': {
          const len = +visual.beamLen;
          const show = visual.showBeam !== false && len > 0 && (visual.kind === 'hcsr04' || visual.showBeam === true);
          m.visible = !!show;
          if (show && m.scale && m.scale.set) m.scale.set(1, len, 1);
          if (show && m.position) m.position.z = (+m.userData.z0 || 0) - len / 2;
          if (show) setEmissive(mat, color, 0.35 + 0.4 * (visual.hit ? 1 : 0.2));
          break;
        }
        case 'standin': {
          const key = m.userData.stand;
          const show = !!(visual.stand && visual.stand[key]);
          m.visible = show;
          if (!show) break;
          if (key === 'heat' && m.scale && m.scale.set) {
            const k = 0.55 + (visual.warm || 0);
            m.scale.set(k, k, k);
            setEmissive(mat, 0xff9f1c, 0.25 + (visual.warm || 0) * 0.7);
          } else if (key === 'humid') setOpacity(mat, 0.25 + 0.65 * (visual.wet || 0));
          else if (key === 'flashlight') setEmissive(mat, 0xfff2a8, 0.2 + glow * 0.9);
          else if (key === 'block') setEmissive(mat, 0x4c7dff, visual.hit ? 0.45 : 0);
          else if (key === 'mover') {
            const paint = node => { if (node && node.material) setEmissive(node.material, 0xffd34d, visual.motion ? 0.7 : 0); };
            paint(m);
            for (const c of m.children || []) paint(c);
          }
          break;
        }
        case 'cap':
          setEmissive(mat, 0xffd34d, visual.on ? 0.25 + (visual.pulse || 0) * 0.6 : 0);
          break;
        case 'wave': {
          m.visible = !!visual.on;
          const k = 1 + (visual.pulse || 0) * (0.15 + 0.2 * (m.userData.wave || 0));
          if (m.scale && m.scale.set) m.scale.set(k, k, k);
          setOpacity(mat, visual.on ? 0.25 + 0.5 * (visual.pulse || 0) : 0);
          break;
        }
        case 'shaft':
          if (m.rotation) m.rotation.x = (visual.spin || 0) * Math.PI / 180;
          break;
        case 'horn':
          if (m.rotation) m.rotation.y = ((visual.angle == null ? 90 : visual.angle) - 90) * Math.PI / 180;
          break;
        case 'coil':
          setEmissive(mat, 0xff9f1c, visual.on ? 0.75 : 0);
          break;
        case 'press':
          if (visual.kind === 'button') {
            const y0 = m.userData.y0 == null ? 0.9 : m.userData.y0;
            if (m.position) m.position.y = visual.pressed ? y0 - 0.35 : y0;
            if (m.scale && m.scale.set) m.scale.set(1, visual.pressed ? 0.72 : 1, 1);
          } else if (m.rotation) m.rotation.z = visual.pressed ? 0.45 : 0;
          break;
        case 'needle':
          if (m.rotation) m.rotation.z = (visual.needle || 0) * 0.9;
          break;
        case 'pixel': {
          const px = visual.px && visual.px[m.userData.i | 0];
          const on = (px | 0) !== 0;
          setHex(mat, 'color', on ? (px | 0) : 0x2a2a2a);
          setEmissive(mat, on ? (px | 0) : 0, on ? 0.8 : 0);
          break;
        }
        case 'screen':
          setHex(mat, 'color', color);
          setEmissive(mat, color, glow);
          break;
        case 'boardled':
          if (visual.led2) { setHex(mat, 'color', 0x66ccff); setEmissive(mat, 0x66ccff, 0.9); }
          else { setHex(mat, 'color', 0xffd34d); setEmissive(mat, 0, 0); }
          break;
        case 'chip':
          setEmissive(mat, color, glow);
          break;
        default: {
          const never = fx;
          throw new Error('schematic3d: ' + never);
        }
      }
    });
    if (visual.pitch != null && group.rotation) group.rotation.x = visual.pitch * Math.PI / 180 * 0.35;
    if (visual.roll != null && group.rotation) group.rotation.z = visual.roll * Math.PI / 180 * 0.35;
    return group;
  }
  function fitView(points) {
    const list = Array.isArray(points) ? points.filter(p => p && Number.isFinite(+p.x) && Number.isFinite(+p.z)) : [];
    if (!list.length) return null;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const p of list) {
      minX = Math.min(minX, +p.x); maxX = Math.max(maxX, +p.x);
      minZ = Math.min(minZ, +p.z); maxZ = Math.max(maxZ, +p.z);
    }
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2;
    const span = Math.max(maxX - minX, maxZ - minZ, 28);
    const dist = Math.min(210, Math.max(46, span * 0.92));
    return {
      dist: q(dist),
      target: { x: q(cx), y: q(TABLE_Y + 8), z: q(cz) },
      position: { x: q(cx + span * 0.08), y: q(TABLE_Y + dist * 0.58), z: q(cz - dist * 0.82) }
    };
  }

  const api = {
    SCALE, TABLE_Y, LIFT, WIRE_Y, WIRE_R, WIRE_POWER_R, WIRE_NEUTRAL, KIND_OF, GROUP_COLOR,
    kindOf, footprint, pose, localToTable, svgBox, createLib, build,
    pinPoint, wirePoints, wireColorHex, wirePower, wireRadius, sagPoints, buildWires,
    liveVisual, applyLive, fitView
  };
  window.Schematic3D = api;
})();
