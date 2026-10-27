/* v14.5.8: low-poly schematic on the same table as the v14.5 stimulus world.
 * Procedural Three.js primitives only — no GLB, no network, no new project fields.
 * v14.5.6: passives and the other generic-slab parts get a body silhouette in the
 * 2D group color. Wire anchors follow pin endpoints (and sanitized bend points).
 * v14.5.7: each span sags (a light arc), insulation matches the schematic stroke
 * (named color, else ground / power / signal), and power is a little thicker.
 * Pin joints are metal spheres. LED and PIR domes can glow from the live sim.
 * v14.5.8: the arc is lifted clear of the table. Anchors used to sit at TABLE_Y+0.85
 * and then dip by up to 2.4, so the span sank into the tabletop and only a stub
 * at each pin stayed visible.
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
    usbuart: 'module', boost: 'module', buck: 'module', ip5306: 'module', tp5400: 'module', l298n: 'module', drv8833: 'module', lvlshift: 'module',
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
  const WIRE_R = 0.55;
  const WIRE_R_POWER = 0.78;
  /* Table mesh is a 4-unit box centered at TABLE_Y - 2, so the top is TABLE_Y.
   * The centerline has to clear that top by the thickest radius plus a gap even
   * at the bottom of the sag, or the tube is buried and only the pin ends show. */
  const WIRE_SAG = 2.4;
  const WIRE_CLEAR = 0.35;
  const WIRE_Y = TABLE_Y + WIRE_R_POWER + WIRE_SAG + WIRE_CLEAR;
  const WIRE_NEUTRAL = 0x9aa3b5;
  const WIRE_SIGNAL = 0x3fb37f;
  const WIRE_PLUS = 0xe5484d;
  const WIRE_GND = 0x0b0d12;
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
    function box(w, h, d) { const a = qd(w), b = qd(h), c = qd(d); return geo('b' + a + 'x' + b + 'x' + c, () => new THREE.BoxGeometry(a, b, c)); }
    function cyl(r, h, seg) { const a = qd(r), b = qd(h); return geo('c' + a + 'x' + b + 'x' + seg, () => new THREE.CylinderGeometry(a, a, b, seg)); }
    function dome(r) { const a = qd(r); return geo('d' + a, () => new THREE.SphereGeometry(a, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2)); }
    function ball(r) { const a = qd(r); return geo('s' + a, () => new THREE.SphereGeometry(a, 12, 8)); }
    function torus(r, tube) {
      const a = qd(r), b = qd(tube);
      return geo('t' + a + 'x' + b, () => new THREE.TorusGeometry(a, b, 6, 10));
    }
    function mesh(geometry, material) { return new THREE.Mesh(geometry, material); }
    return { THREE, geo, mat, box, cyl, dome, ball, torus, mesh };
  }

  function add(g, lib, w, h, d, color, x, y, z, rough, metal) {
    const m = lib.mesh(lib.box(w, h, d), lib.mat(color, rough == null ? 0.72 : rough, metal == null ? 0.05 : metal));
    m.position.set(x, y, z);
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
    add(g, lib, q(Math.min(1.4, w * 0.08)), 0.4, q(Math.min(1.4, w * 0.08)), 0xffd34d, 0, h + 0.25, -d * 0.44, 0.45, 0.12);
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
  function pinsAt(g, lib, w, d, n) {
    const span = Math.min(w * 0.7, (n - 1) * 1.6);
    for (let i = 0; i < n; i++) {
      const x = n === 1 ? 0 : -span / 2 + (span * i) / (n - 1);
      add(g, lib, 0.7, 1.2, 1.6, 0xd4b13a, x, 0.7, d * 0.52, 0.4, 0.55);
    }
  }
  function dht(lib, part) {
    const s = sizeOf(part, 'dht'), g = new lib.THREE.Group();
    add(g, lib, s.w, s.h, s.d, 0xf4f4f4, 0, s.h / 2, 0, 0.55, 0.02);
    for (let i = 0; i < 4; i++) add(g, lib, s.w * 0.62, 0.3, 0.4, 0xb7bec6, 0, s.h + 0.16, -s.d * 0.24 + i * s.d * 0.14, 0.6, 0.05);
    pinsAt(g, lib, s.w, s.d, 3);
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
      const pup = lib.mesh(lib.cyl(Math.max(0.55, s.w * 0.07), 0.7, 12), lib.mat(0x1a1d24, 0.5, 0.1));
      pup.position.set(x, s.h + 1.35, -s.d * 0.08);
      g.add(pup);
    }
    pinsAt(g, lib, s.w, s.d, 4);
    g.userData.kind = 'hcsr04';
    return g;
  }
  function pir(lib, part) {
    const s = sizeOf(part, 'pir'), g = new lib.THREE.Group();
    add(g, lib, s.w, s.h, s.d, 0x1a6b3c, 0, s.h / 2, 0, 0.68, 0.04);
    const dome = lib.mesh(lib.dome(Math.max(1.6, s.w * 0.28)), lensMat(lib, 0xf7f7fb, 0.92));
    dome.position.y = s.h;
    dome.userData.glow = 'pir';
    g.add(dome);
    add(g, lib, 0.7, 0.45, 0.7, 0xff3b30, s.w * 0.28, s.h + 0.3, s.d * 0.18, 0.45, 0.1);
    pinsAt(g, lib, s.w, s.d, 3);
    g.userData.kind = 'pir';
    return g;
  }
  function ldr(lib, part) {
    const s = sizeOf(part, 'ldr'), g = new lib.THREE.Group();
    const disc = lib.mesh(lib.cyl(Math.max(1.2, s.w * 0.28), s.h, 16), lib.mat(0xe8c89a, 0.6, 0.04));
    disc.position.y = s.h / 2;
    g.add(disc);
    for (let i = -1; i <= 1; i++) add(g, lib, s.w * 0.36, 0.28, 0.35, 0xbb3333, 0, s.h + 0.15, i * 0.7, 0.5, 0.05);
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
  function lensMat(lib, color, opacity) {
    return new lib.THREE.MeshStandardMaterial({
      color, roughness: 0.25, metalness: 0.04, transparent: opacity < 1, opacity,
      emissive: 0x000000, emissiveIntensity: 0
    });
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
    const dome = lib.mesh(lib.dome(wide ? 1.55 : 1.25), lensMat(lib, 0xf4f1ea, 0.94));
    dome.position.y = 2.0;
    dome.userData.glow = 'led';
    g.add(dome);
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
    const m = lib.mesh(lib.ball(1.35), lib.mat(groupColor(part && part.type), 0.5, 0.06));
    m.position.y = 1.35;
    g.add(m);
    g.userData.kind = 'bead';
    return g;
  }
  function motorShape(lib, part) {
    const g = new lib.THREE.Group();
    const body = lib.mesh(lib.cyl(2.1, 3.4, 14), lib.mat(groupColor(part && part.type), 0.5, 0.18));
    body.rotation.z = Math.PI / 2;
    body.position.y = 2.1;
    g.add(body);
    const shaft = lib.mesh(lib.cyl(0.45, 1.6, 8), lib.mat(0xc5cad1, 0.35, 0.55));
    shaft.rotation.z = Math.PI / 2;
    shaft.position.set(2.4, 2.1, 0);
    g.add(shaft);
    g.userData.kind = 'motor';
    return g;
  }
  function servoShape(lib, part) {
    const g = new lib.THREE.Group();
    add(g, lib, 5.4, 2.4, 3.2, groupColor(part && part.type), 0, 1.2, 0, 0.6, 0.08);
    const horn = lib.mesh(lib.cyl(1.1, 0.45, 10), lib.mat(0xe8e8e8, 0.5, 0.08));
    horn.position.set(1.2, 2.6, 0);
    g.add(horn);
    g.userData.kind = 'servo';
    return g;
  }
  function relayShape(lib, part) {
    const g = new lib.THREE.Group();
    add(g, lib, 5.2, 2.6, 4.4, groupColor(part && part.type), 0, 1.3, 0, 0.62, 0.08);
    const coil = lib.mesh(lib.cyl(0.9, 1.2, 10), lib.mat(0xc9a46a, 0.55, 0.2));
    coil.rotation.z = Math.PI / 2;
    coil.position.set(-0.6, 2.9, 0);
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
    add(g, lib, Math.max(1.2, q(s.w * 0.28)), 0.7, Math.max(1.0, q(s.d * 0.22)), 0x16181c, 0, s.h + 0.35, -s.d * 0.08, 0.55, 0.12);
    g.userData.kind = 'module';
    return g;
  }
  function panelShape(lib, part) {
    const s = sizeOf(part, 'panel');
    const g = new lib.THREE.Group();
    add(g, lib, s.w, s.h, s.d, groupColor(part && part.type), 0, s.h / 2, 0, 0.6, 0.08);
    add(g, lib, q(s.w * 0.78), 0.2, q(s.d * 0.62), 0x10141c, 0, s.h + 0.1, -s.d * 0.04, 0.4, 0.15);
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
      const dot = lib.mesh(lib.dome(Math.min(0.7, s.d * 0.22)), lib.mat(0xd7dde6, 0.35, 0.08));
      dot.position.set(x, h, 0);
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
      case 'button': g = upright(lib, 'button', 1.8, 1.8, color); break;
      case 'switch': g = fixedBox(lib, part, 'switch', 4.4, 1.4, 2.2); break;
      case 'meter': g = fixedBox(lib, part, 'meter', 5.2, 2.4, 3.2); break;
      case 'supply': g = fixedBox(lib, part, 'supply', 4.8, 3.0, 3.4); break;
      case 'battery': g = boxed(lib, part, 'battery'); break;
      case 'gnd': g = upright(lib, 'gnd', 1.5, 2.0, color); break;
      case 'cell': g = boxed(lib, part, 'cell'); break;
      case 'buzzer': g = upright(lib, 'buzzer', 2.0, 1.7, color); break;
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
  /* Same stroke the 2D canvas uses: a named insulation color, else ground / power / signal.
   * Without a netlist (unit tests of geometry) an unnamed wire stays the neutral gray. */
  function wireLook(parts, wires, wire) {
    const table = window.WIRE_COLORS;
    const named = !!(wire && typeof wire.color === 'string' && table && Object.prototype.hasOwnProperty.call(table, wire.color));
    if (named) return { color: wireColorHex(wire.color), role: 'named', r: WIRE_R };
    const netsFn = window.Netlist && window.Netlist.nets;
    if (typeof netsFn !== 'function' || !wire || !wire.a) return { color: WIRE_NEUTRAL, role: 'plain', r: WIRE_R };
    try {
      const nets = netsFn({ parts: Array.isArray(parts) ? parts : [], wires: Array.isArray(wires) ? wires : [] });
      const root = nets.netOf(wire.a.part, wire.a.pin);
      if (nets.groundRoots.has(root)) return { color: WIRE_GND, role: 'gnd', r: WIRE_R };
      if (nets.plusRoots.has(root)) return { color: WIRE_PLUS, role: 'plus', r: WIRE_R_POWER };
    } catch (e) { return { color: WIRE_NEUTRAL, role: 'plain', r: WIRE_R }; }
    return { color: WIRE_SIGNAL, role: 'signal', r: WIRE_R };
  }
  /* Light catenary: ends stay on the anchor, the middle dips by at most WIRE_SAG. */
  function sagSpan(a, b) {
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (!(len >= 0.2)) return [];
    const drop = Math.min(WIRE_SAG, Math.max(0.55, len * 0.12));
    const n = 4;
    const pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const bow = 4 * t * (1 - t);
      pts.push({
        x: q(a.x + dx * t),
        y: q(a.y + dy * t - drop * bow),
        z: q(a.z + dz * t),
        sag: q(drop * bow)
      });
    }
    return pts;
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
  function addTube(g, lib, a, b, color, radius, sag) {
    const r = radius || WIRE_R;
    const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
    const len = Math.hypot(dx, dy, dz);
    if (!(len >= 0.05)) return;
    const geo = lib.cyl(r, len, 8);
    const m = lib.mesh(geo, lib.mat(color, 0.62, 0.04));
    const gh = geo.parameters && geo.parameters.height;
    if (m.scale && gh) m.scale.set(1, len / gh, 1);
    m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    m.quaternion.setFromUnitVectors(new lib.THREE.Vector3(0, 1, 0), new lib.THREE.Vector3(dx / len, dy / len, dz / len));
    m.userData.kind = 'span';
    m.userData.r = r;
    m.userData.sag = sag || 0;
    m.userData.y = q((a.y + b.y) / 2);
    g.add(m);
  }
  function addJoint(g, lib, p) {
    const m = lib.mesh(lib.ball(q(WIRE_R * 1.65)), lib.mat(0xd5dbe3, 0.32, 0.62));
    m.position.set(p.x, p.y, p.z);
    m.userData.kind = 'joint';
    m.userData.r = q(WIRE_R * 1.65);
    g.add(m);
  }
  function buildWires(lib, parts, wires) {
    const g = new lib.THREE.Group();
    g.userData.role = 'wires';
    const list = Array.isArray(wires) ? wires : [];
    for (const w of list) {
      const anchors = wirePoints(parts, w);
      const look = wireLook(parts, list, w);
      for (let i = 1; i < anchors.length; i++) {
        const span = sagSpan(anchors[i - 1], anchors[i]);
        let drop = 0;
        for (const p of span) if (p.sag > drop) drop = p.sag;
        for (let k = 1; k < span.length; k++) addTube(g, lib, span[k - 1], span[k], look.color, look.r, drop);
      }
      for (const p of anchors) addJoint(g, lib, p);
    }
    return silence(g);
  }

  const api = {
    SCALE, TABLE_Y, LIFT, WIRE_Y, WIRE_SAG, WIRE_R, WIRE_R_POWER, WIRE_NEUTRAL, WIRE_SIGNAL, WIRE_PLUS, WIRE_GND,
    KIND_OF, GROUP_COLOR,
    kindOf, footprint, pose, localToTable, svgBox, createLib, build,
    pinPoint, wirePoints, wireColorHex, wireLook, sagSpan, buildWires
  };
  window.Schematic3D = api;
})();
