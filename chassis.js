/* v13: «Любая машинка» — корпус, карточки привода (слоты колёс), масса и центр масс, проверка «не подключено», шаблоны «Мои шасси».
 * Чистая логика без DOM (window.Chassis и Node). Координаты корпуса в мм: x вперёд, y влево. */
(function (root) {
  'use strict';
  const Q = Math.PI / 4, H = Math.PI / 2;
  const DRIVES = { diff: '2 колеса + опора', '4wd': '4WD', tracks: 'Гусеницы', steer: 'Рулевое как у машины', omni: 'Омни', mecanum: 'Меканум' };
  const BODIES = ['rect', 'round', 'poly'];
  const W = (x, y, o) => Object.assign({ x, y, R: 33 }, o || {});
  /* empty wheel/motor slots of a drive card (part: '' = пустой слот, мотор ставится перетаскиванием или автоматически) */
  function slots(drive) {
    switch (drive) {
      case '4wd': return [W(55, 72), W(55, -72), W(-55, 72), W(-55, -72)];
      case 'tracks': return [W(0, 78, { R: 20, grip: 0.3, track: true }), W(0, -78, { R: 20, grip: 0.3, track: true })];
      case 'steer': return [W(-60, 72), W(-60, -72), W(60, 72, { driven: false, steer: true }), W(60, -72, { driven: false, steer: true })];
      // omni: model of an omni wheel = only the rolling direction is constrained (roller 0 in Devices.vehicle); «+» layout, front/back wheels across
      case 'omni': return [W(80, 0, { R: 30, ang: H, roller: 0, omni: true }), W(-80, 0, { R: 30, ang: H, roller: 0, omni: true }), W(0, 80, { R: 30, roller: 0, omni: true }), W(0, -80, { R: 30, roller: 0, omni: true })];
      case 'mecanum': return [W(60, 72, { R: 30, roller: -Q }), W(60, -72, { R: 30, roller: Q }), W(-60, 72, { R: 30, roller: Q }), W(-60, -72, { R: 30, roller: -Q })];
      default: return [W(0, 72), W(0, -72), W(-72, 0, { R: 10, driven: false, caster: true })];
    }
  }
  const SLOT_NAME = { diff: ['левое', 'правое', 'опора'], '4wd': ['пер. лев.', 'пер. прав.', 'зад. лев.', 'зад. прав.'], tracks: ['лев. гусеница', 'прав. гусеница'],
    steer: ['зад. лев.', 'зад. прав.', 'руль лев.', 'руль прав.'], omni: ['перед', 'зад', 'лев.', 'прав.'], mecanum: ['пер. лев.', 'пер. прав.', 'зад. лев.', 'зад. прав.'] };
  /* body outline (mm) */
  function shape(r) { const s = r.size || {};
    if (r.body === 'poly' && Array.isArray(r.poly) && r.poly.length >= 3) return { kind: 'poly', poly: r.poly };
    if (r.body === 'round') return { kind: 'round', r: s.r || 90 };
    return { kind: 'rect', l: s.l || 190, w: s.w || 140, rad: s.rad == null ? 10 : s.rad }; }
  function vehicleBody(r) { const s = shape(r);
    return s.kind === 'poly' ? { poly: s.poly.map(p => [p[0] / 1000, p[1] / 1000]) } : s.kind === 'round' ? { r: s.r / 1000 } : { l: s.l / 1000, w: s.w / 1000 }; }
  function area(s) { if (s.kind === 'round') return Math.PI * s.r * s.r; if (s.kind === 'rect') return s.l * s.w - (4 - Math.PI) * s.rad * s.rad;
    let a = 0; s.poly.forEach((p, i) => { const q = s.poly[(i + 1) % s.poly.length]; a += p[0] * q[1] - q[0] * p[1]; }); return Math.abs(a / 2); }
  function centroid(s) { if (s.kind !== 'poly') return [0, 0]; let a = 0, cx = 0, cy = 0;
    s.poly.forEach((p, i) => { const q = s.poly[(i + 1) % s.poly.length], c = p[0] * q[1] - q[0] * p[1]; a += c; cx += (p[0] + q[0]) * c; cy += (p[1] + q[1]) * c; });
    return Math.abs(a) < 1e-9 ? [0, 0] : [cx / (3 * a), cy / (3 * a)]; }
  /* masses, g (typical hobby parts) */
  const MASS = { ttmotor: 30, motor: 18, coreless: 6, esp32: 10, esp32c3: 4, esp8266: 9, uno: 25, pico: 4, l298n: 30, drv8833: 3, liion: 40, battery: 45, tcrt5000: 3, hcsr04: 9, vl53l0x: 2, mpu6050: 2, servo: 9, boost: 5 };
  const DENS = { acrylic: 1.19e-3 * 3, black: 1.05e-3 * 3 }; // g/mm² for a 3 mm plate
  const wheelMass = w => w.caster ? 8 : w.track ? 40 : w.roller != null ? (w.omni ? 25 : 30) : 15;
  function mass(r, parts) { const s = shape(r), bm = area(s) * (DENS[r.mat] || DENS.acrylic), c = centroid(s); let m = bm, mx = bm * c[0], my = bm * c[1];
    const add = (g, x, y) => { m += g; mx += g * x; my += g * y; };
    for (const mt of r.mounts || []) { const p = parts.find(q => q.id === mt.part); if (p) add(MASS[p.type] || 5, mt.x, mt.y); }
    const ws = Array.isArray(r.wheels) && r.wheels.length ? r.wheels : null;
    if (ws) ws.forEach(w => add(wheelMass(w), w.x, w.y));
    else { for (const mt of r.mounts || []) { const p = parts.find(q => q.id === mt.part); if (p && /motor|coreless/.test(p.type)) add(15, mt.x, mt.y); } if (r.caster) add(8, -72, 0); }
    return { g: Math.round(m), x: Math.round(mx / m), y: Math.round(my / m), body: Math.round(bm) }; }
  /* which chassis parts are not wired up in «Схема» */
  const PWR = /^(VCC|GND\d?|5V|3V3|VIN|VS|VM|\+|−|p|n|a|b)$/;
  function unconnected(proj, P, nets, ids) { const out = [], byNet = new Map();
    for (const p of proj.parts) for (const q of P[p.type].pins) { const n = nets.netOf(p.id, q.id); if (n == null) continue; if (!byNet.has(n)) byNet.set(n, []); byNet.get(n).push([p, q.id]); }
    const peers = (p, pin) => { const n = nets.netOf(p.id, pin); return n == null ? [] : (byNet.get(n) || []).filter(([o]) => o !== p); };
    const isDrv = t => /^(l298n|drv8833|mosfet|relay)$/.test(t);
    const toMcu = (p, pins) => pins.some(pin => peers(p, pin).some(([o, op]) => P[o.type].mcu && P[o.type].gpioOf && P[o.type].gpioOf(op) != null));
    for (const id of ids) { const p = proj.parts.find(q => q.id === id); if (!p) continue; const d = P[p.type];
      if (d.motor) { const ok = ['a', 'b'].some(pin => peers(p, pin).some(([o]) => isDrv(o.type))); if (!ok) out.push({ part: id, why: 'мотор без драйвера' }); continue; }
      if (isDrv(p.type) && !/mosfet|relay/.test(p.type)) { const ins = d.pins.map(q => q.id).filter(k => /IN|EN/.test(k)); if (!toMcu(p, ins)) out.push({ part: id, why: 'драйвер без проводов к плате' }); continue; }
      if (d.sensor || p.type === 'tcrt5000' || d.display === 'servo') { const sig = d.pins.map(q => q.id).filter(k => !PWR.test(k));
        if (!toMcu(p, sig)) out.push({ part: id, why: d.display === 'servo' ? 'серво без провода к плате' : 'датчик без провода к плате' }); } }
    return out; }
  /* steering angle from the servo (0..180°, 90 = прямо) → rad, + влево, ±40° */
  const steerOf = a => Number.isFinite(+a) ? Math.max(-0.7, Math.min(0.7, (+a - 90) * Math.PI / 180)) : 0;
  /* wheels for Devices.vehicle (m) + which motor drives each wheel */
  function vehicleWheels(r, motorMounts) {
    if (Array.isArray(r.wheels) && r.wheels.length) return r.wheels.map(w => ({ w: { x: w.x / 1000, y: w.y / 1000, R: w.R / 1000, driven: w.driven !== false, grip: w.grip == null ? 1 : w.grip, caster: !!w.caster, ...(w.roller != null ? { roller: w.roller } : {}) }, part: w.part || '', ang: w.ang || 0, steer: !!w.steer }));
    // legacy (v9–v12 projects): the two motor mounts are the wheels, + optional ball caster
    const wl = motorMounts.slice().sort((a, b) => b.y - a.y), L = wl[0], R = wl.length > 1 ? wl[wl.length - 1] : null, out = [];
    const tr = L && R ? Math.max(0.04, Math.abs(L.y - R.y) / 1000) : 0.13;
    out.push({ w: { x: L ? L.x / 1000 : 0, y: tr / 2, R: 0.033 }, part: L ? L.part : '', ang: 0 });
    out.push({ w: { x: R ? R.x / 1000 : 0, y: -tr / 2, R: 0.033 }, part: R ? R.part : '', ang: 0 });
    return out; }
  /* --- sanitizing (shared by import, localStorage and templates) --- */
  const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  const g5 = v => Math.round(v / 5) * 5;
  const LIM = { poly: 64, wheels: 8, templates: 50, name: 40, span: 200 };
  function cleanShape(r, o) { o.body = BODIES.includes(r.body) ? r.body : 'rect';
    const s = r.size && typeof r.size === 'object' && !Array.isArray(r.size) ? r.size : {};
    if (r.size !== undefined) { const l = g5(num(s.l, 40, 400, 190)), w = g5(num(s.w, 40, 400, 140));
      o.size = { l, w, rad: g5(num(s.rad, 0, Math.min(l, w) / 2, 10)), r: g5(num(s.r, 20, 200, 90)) }; }
    if (o.body === 'poly') { const pts = Array.isArray(r.poly) ? r.poly.slice(0, LIM.poly) : [];
      const q = pts.filter(p => Array.isArray(p) && p.length >= 2 && Number.isFinite(+p[0]) && Number.isFinite(+p[1])).map(p => [g5(num(p[0], -LIM.span, LIM.span, 0)), g5(num(p[1], -LIM.span, LIM.span, 0))]);
      if (q.length >= 3) o.poly = q; else o.body = 'rect'; }
    return o; }
  function cleanWheels(list, isMotor) { const out = [];
    for (const w of Array.isArray(list) ? list.slice(0, LIM.wheels) : []) { if (!w || typeof w !== 'object' || Array.isArray(w)) continue;
      const o = { x: g5(num(w.x, -LIM.span, LIM.span, 0)), y: g5(num(w.y, -LIM.span, LIM.span, 0)), R: Math.round(num(w.R, 5, 60, 33)) };
      const grip = Math.round(num(w.grip, 0.05, 1, 1) * 100) / 100; if (grip !== 1) o.grip = grip;
      if (w.roller != null) { const ro = num(w.roller, -Math.PI / 2, Math.PI / 2, null); if (ro != null) o.roller = Math.round(ro * 1e4) / 1e4; }
      const ang = Math.round(num(w.ang, -Math.PI, Math.PI, 0) * 1e4) / 1e4; if (ang) o.ang = ang;
      for (const k of ['steer', 'caster', 'track', 'omni']) if (w[k] === true) o[k] = true;
      if (w.driven === false) o.driven = false;
      if (typeof w.part === 'string' && isMotor && isMotor(w.part)) o.part = w.part;
      out.push(o); }
    return out; }
  function cleanDrive(v) { return typeof v === 'string' && Object.prototype.hasOwnProperty.call(DRIVES, v) ? v : null; }
  /* template = chassis without schematic bindings: {name, body, size, poly, mat, caster, drive, wheels} */
  function cleanTemplate(t) { if (!t || typeof t !== 'object' || Array.isArray(t)) return null;
    const name = typeof t.name === 'string' ? t.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, LIM.name) : ''; if (!name) return null;
    const o = cleanShape(t, { name }); o.mat = t.mat === 'black' ? 'black' : 'acrylic'; o.caster = t.caster !== false;
    const d = cleanDrive(t.drive); if (d) { o.drive = d; o.wheels = cleanWheels(t.wheels, null); if (!o.wheels.length) o.wheels = slots(d); }
    return o; }
  function cleanTemplates(list) { const out = [], seen = new Set();
    for (const t of Array.isArray(list) ? list.slice(0, LIM.templates * 2) : []) { const c = cleanTemplate(t); if (!c || seen.has(c.name)) continue; seen.add(c.name); out.push(c); if (out.length >= LIM.templates) break; }
    return out; }
  function toTemplate(r, name) { return cleanTemplate({ name, body: r.body, size: r.size || shape(r), poly: r.poly, mat: r.mat, caster: r.caster, drive: r.drive || 'diff', wheels: (r.wheels && r.wheels.length ? r.wheels : slots('diff')).map(w => { const c = { ...w }; delete c.part; return c; }) }); }
  const api = { DRIVES, BODIES, SLOT_NAME, MASS, LIM, slots, shape, vehicleBody, area, centroid, mass, unconnected, steerOf, vehicleWheels, cleanShape, cleanWheels, cleanDrive, cleanTemplate, cleanTemplates, toTemplate, g5 };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Chassis = api;
})(typeof window !== 'undefined' ? window : globalThis);
