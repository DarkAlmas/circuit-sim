/* v14.5.5: low-poly schematic on the same table as the v14.5 stimulus world.
 * Procedural Three.js primitives only — no GLB, no network, no new project fields.
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
 * yaw; localToTable() applies the yaw. Wires stay on the 2D canvas — this view
 * does not move parts and does not write sensor readings.
 */
(function () {
  'use strict';
  const SCALE = 0.12;
  const TABLE_Y = 74;
  const LIFT = 0.2;
  const KIND_OF = {
    esp32: 'esp32', esp8266: 'esp8266', esp32c3: 'esp32c3', uno: 'uno', pico: 'pico', opi: 'opi',
    atmega328: 'dip', attiny85: 'dip', dht22: 'dht', hcsr04: 'hcsr04', pir: 'pir', ldr: 'ldr'
  };
  const FALLBACK = {
    esp32: [168, 312], esp8266: [168, 272], esp32c3: [128, 222], uno: [188, 382], pico: [148, 462],
    opi: [188, 282], dip: [148, 48], dht: [68, 94], hcsr04: [108, 72], pir: [80, 96], ldr: [88, 60],
    generic: [40, 18]
  };
  const THICK = {
    esp32: 1.8, esp8266: 1.8, esp32c3: 1.6, uno: 1.8, pico: 1.6, opi: 1.8, dip: 2.2,
    dht: 8, hcsr04: 1.8, pir: 1.6, ldr: 2.2, generic: 1.5
  };
  const GROUP_COLOR = {
    'Платы': 0x243044, 'Датчики': 0x2c6b45, 'Пассивные': 0xc4a574, 'Питание': 0x2c3340,
    'Индикация': 0x3d4f78, 'Активные': 0x3e4a5c, 'Микросхемы': 0x1c1c1e, 'Интерфейсы': 0x3a4658
  };

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
  function footprint(type) {
    const kind = kindOf(type);
    const [w, d] = svgBox(type, kind);
    return { w: q(w * SCALE), d: q(d * SCALE), h: THICK[kind] || THICK.generic, kind };
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
    function mesh(geometry, material) { return new THREE.Mesh(geometry, material); }
    return { THREE, geo, mat, box, cyl, dome, mesh };
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
    const dome = lib.mesh(lib.dome(Math.max(1.6, s.w * 0.28)), lib.mat(0xf7f7fb, 0.22, 0.04, 0.92));
    dome.position.y = s.h;
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
    const d = window.PARTS && part && window.PARTS[part.type];
    const color = (d && Object.prototype.hasOwnProperty.call(GROUP_COLOR, d.group) && GROUP_COLOR[d.group]) || 0x4a5568;
    const g = new lib.THREE.Group();
    add(g, lib, s.w, s.h, s.d, color, 0, s.h / 2, 0, 0.74, 0.04);
    g.userData.kind = 'generic';
    return g;
  }
  function build(lib, part) {
    const kind = kindOf(part && part.type);
    switch (kind) {
      case 'esp32': return esp32(lib, part);
      case 'esp8266': return esp8266(lib, part);
      case 'esp32c3': return esp32c3(lib, part);
      case 'uno': return uno(lib, part);
      case 'pico': return pico(lib, part);
      case 'opi': return opi(lib, part);
      case 'dip': return dip(lib, part);
      case 'dht': return dht(lib, part);
      case 'hcsr04': return hcsr04(lib, part);
      case 'pir': return pir(lib, part);
      case 'ldr': return ldr(lib, part);
      case 'generic': return generic(lib, part);
      default: { const never = kind; throw new Error('schematic3d: ' + never); }
    }
  }

  const api = {
    SCALE, TABLE_Y, LIFT, KIND_OF,
    kindOf, footprint, pose, localToTable, svgBox, createLib, build
  };
  window.Schematic3D = api;
})();
