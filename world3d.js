/* v14.5.2: 3D sensor world. Stimulus math is unchanged (US cone 12°/400 cm,
 * flashlight 22°/140 cm, heat|humid spheres R50, PIR 40°/280 cm, table 86×46).
 * Humidity stays obvious anywhere inside the R50 steam sphere (about 80% at the
 * rim, 100% at the source, ambient 45% outside). Heat keeps the linear falloff.
 * Readings land on schematic props in kind order: hcsr04.dist, ldr.lux,
 * dht22.temp/hum, pir.motion, and ntc.temp from the same climate sample.
 * Floating #w3tags refresh in the same call as applyReadings. Cones and spheres
 * draw only for the selected or hovered object. VL53 and TCRT stay on the robot track.
 * v14.5.5: «Схема 3D» puts Schematic3D meshes on this table (pose from part x/y/rot).
 * v14.5.6: passive silhouettes and wire tubes join that view. Stimulus math is untouched.
 * v14.5.7: «Схема 3D» stays on the running sim. Meshes repaint from the same readings
 * and measure() the 2D view uses. Stimulus math below is unchanged.
 * That view does not move schematic parts and does not change how readings are written.
 * Three.js is vendored (vendor/three). No network. DOM is createElement/textContent only.
 * window.World3D.getReadings() / the world3d-readings event are the solver hook. */
(function () {
  'use strict';
  const KINDS = ['ultrasonic', 'ldr', 'dht', 'pir'];
  const TYPES = ['block', 'flashlight', 'heat', 'humid', 'mover'];
  const TABLE_Y = 74, TABLE_HX = 86, TABLE_HZ = 46;
  const BLOCK = 18, HEAT_R = 50, HUM_R = 50, FLASH_R = 140, PIR_R = 280, SONAR_R = 400, SONAR_VIS = 160;
  const FLASH_ANG = 22 * Math.PI / 180, PIR_ANG = 40 * Math.PI / 180, SONAR_ANG = 12 * Math.PI / 180;
  const AMB = { lux: 100, temp: 24, hum: 45 };
  // Linear sphereGain left the outer R50 shell at +1% (45 → 46). A floor keeps
  // the steam obvious inside the sphere; the source still reaches 100%.
  const HUM_EDGE = 35, HUM_PEAK = 55;
  const REST = { ultrasonic: 6, ldr: 4, dht: 8, pir: 7, block: 9, flashlight: 7, heat: 8, humid: 8, mover: 11 };
  const SENSOR_Z = 16, STIM_Z = -24;
  const FLASH_DIR = norm([0, -0.15, 1]);
  const FLASH_I = 800000; // lux·cm²: about 500 lx at 40 cm on the beam axis, before ambient
  const MOVER_R = 6; // figurine body, cm — the cone test uses the body, not only the origin
  const PART_KIND = { hcsr04: 'ultrasonic', ldr: 'ldr', dht22: 'dht', ntc: 'ntc', pir: 'pir' };

  function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
  function forward(rx, ry) {
    const cp = Math.cos(rx || 0), sp = Math.sin(rx || 0), cy = Math.cos(ry || 0), sy = Math.sin(ry || 0);
    return [sy * cp, -sp, -cy * cp];
  }
  function rayAabb(o, d, b0, b1, maxT) {
    let t0 = 0, t1 = maxT;
    for (let i = 0; i < 3; i++) {
      if (Math.abs(d[i]) < 1e-9) { if (o[i] < b0[i] || o[i] > b1[i]) return null; continue; }
      let a = (b0[i] - o[i]) / d[i], b = (b1[i] - o[i]) / d[i];
      if (a > b) { const s = a; a = b; b = s; }
      if (a > t0) t0 = a;
      if (b < t1) t1 = b;
      if (t0 > t1) return null;
    }
    return t0;
  }
  function sphereGain(c, r, p) {
    const d = Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
    return d >= r ? 0 : 1 - d / r;
  }
  function dot(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
  function sub(a, b) { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
  function xyz(o) { return [+o.x || 0, +o.y || 0, +o.z || 0]; }
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function aabbOf(o, h) { const c = xyz(o); return [[c[0] - h, c[1] - h, c[2] - h], [c[0] + h, c[1] + h, c[2] + h]]; }
  function closestOnAabb(p, b0, b1) {
    return [Math.min(b1[0], Math.max(b0[0], p[0])), Math.min(b1[1], Math.max(b0[1], p[1])), Math.min(b1[2], Math.max(b0[2], p[2]))];
  }
  function unknown(v) { throw new Error('world3d: ' + v); }
  /* Left palette: tag's screen-left stays at palette.right + 8. A bottom chip row is not a left strip. */
  function tagMinScreen(stage, pal) {
    const palW = Math.max(0, pal.right - pal.left), palH = Math.max(0, pal.bottom - pal.top);
    const vertical = pal.bottom > stage.top + 8 && pal.top < stage.bottom - 8;
    const leftCol = vertical && palW > 40 && pal.right <= stage.left + 2 && palH >= 44;
    const leftOver = vertical && palW > 40 && palH > palW && pal.left <= stage.left + 2 && pal.right < stage.left + (stage.right - stage.left) * 0.5;
    if (leftCol || leftOver) return pal.right + 8;
    return stage.left + 8;
  }
  function clampTagX(center, half, stageLeft, minScreen) {
    const screenLeft = stageLeft + center - half;
    if (!(screenLeft < minScreen)) return center;
    return minScreen - stageLeft + half;
  }

  /* Segment a→b crosses a block. Endpoints themselves do not count (sensor or stimulus inside a cube). */
  function segmentBlocked(a, b, blocks) {
    const v = sub(b, a), len = Math.hypot(v[0], v[1], v[2]);
    if (len < 1e-6) return false;
    const dir = [v[0] / len, v[1] / len, v[2] / len];
    for (const block of blocks) {
      const [b0, b1] = aabbOf(block, BLOCK / 2);
      const t = rayAabb(a, dir, b0, b1, len);
      if (t != null && t > 0.4 && t < len - 0.4) return true;
    }
    return false;
  }
  /* First echo inside the 12° beam: boresight ray, else the ray toward the nearest point of the cube that still lies in the cone. */
  function sonarDist(origin, fwd, blocks) {
    let best = SONAR_R;
    const consider = dir => {
      if (!dir) return;
      for (const block of blocks) {
        const [b0, b1] = aabbOf(block, BLOCK / 2);
        const t = rayAabb(origin, dir, b0, b1, best);
        if (t != null && t < best) best = t;
      }
    };
    consider(fwd);
    for (const block of blocks) {
      const [b0, b1] = aabbOf(block, BLOCK / 2);
      const q = closestOnAabb(origin, b0, b1);
      const v = sub(q, origin);
      const dist = Math.hypot(v[0], v[1], v[2]);
      if (dist < 1e-6) { best = 0; continue; }
      const dir = [v[0] / dist, v[1] / dist, v[2] / dist];
      const along = dot(dir, fwd);
      const ang = Math.acos(clamp(along, -1, 1));
      if (ang <= SONAR_ANG + 1e-4) consider(dir);
      else if (along > 0) {
        const perp = [dir[0] - fwd[0] * along, dir[1] - fwd[1] * along, dir[2] - fwd[2] * along];
        const pl = Math.hypot(perp[0], perp[1], perp[2]);
        if (pl > 1e-8) {
          const ca = Math.cos(SONAR_ANG), sa = Math.sin(SONAR_ANG);
          consider([fwd[0] * ca + perp[0] / pl * sa, fwd[1] * ca + perp[1] / pl * sa, fwd[2] * ca + perp[2] / pl * sa]);
        }
      }
    }
    return best;
  }
  /* Spotlight: hard cutoff at the cone, cosine window to the rim, inverse-square, then clamp. */
  function spotLux(apex, axis, ang, range, p) {
    const v = sub(p, apex), dist = Math.hypot(v[0], v[1], v[2]);
    if (dist < 1e-6 || dist > range) return 0;
    const along = dot(v, axis) / dist;
    if (along <= Math.cos(ang)) return 0;
    const g = (along - Math.cos(ang)) / (1 - Math.cos(ang));
    const d = Math.max(dist, 4);
    return FLASH_I * g / (d * d);
  }
  /* Figurine is a small body. Motion if that body meets the PIR cone and nothing solid is in the way. */
  function moverSeen(apex, fwd, center, blocks) {
    const v = sub(center, apex), dist = Math.hypot(v[0], v[1], v[2]);
    if (dist <= MOVER_R) return true;
    if (segmentBlocked(apex, center, blocks)) return false;
    const along = dot(v, fwd);
    const a = Math.acos(clamp(along / dist, -1, 1));
    const extra = Math.asin(clamp(MOVER_R / dist, 0, 1));
    if (a > PIR_ANG + extra) return false;
    if (along < -MOVER_R) return false;
    if (dist - MOVER_R > PIR_R) return false;
    return true;
  }

  function compute(world) {
    const sensors = world && Array.isArray(world.sensors) ? world.sensors : [];
    const stimuli = world && Array.isArray(world.stimuli) ? world.stimuli : [];
    const blocks = stimuli.filter(s => s && s.type === 'block');
    const lights = stimuli.filter(s => s && s.type === 'flashlight');
    const heats = stimuli.filter(s => s && s.type === 'heat');
    const hums = stimuli.filter(s => s && s.type === 'humid');
    const movers = stimuli.filter(s => s && s.type === 'mover');
    const out = [];
    for (const s of sensors) {
      if (!s) continue;
      const kind = s.kind, p = xyz(s), fwd = forward(s.rx, s.ry);
      switch (kind) {
        case 'ultrasonic': {
          const dist = sonarDist(p, fwd, blocks);
          out.push({ id: s.id, kind, dist: Math.round(clamp(dist, 2, SONAR_R)) });
          break;
        }
        case 'ldr': {
          let lux = AMB.lux;
          for (const L of lights) {
            const apex = xyz(L);
            if (segmentBlocked(apex, p, blocks)) continue;
            lux += spotLux(apex, FLASH_DIR, FLASH_ANG, FLASH_R, p);
          }
          out.push({ id: s.id, kind, lux: Math.round(clamp(lux, 0, 100000)) });
          break;
        }
        case 'dht': {
          let temp = AMB.temp, hum = AMB.hum;
          for (const h of heats) temp += 40 * sphereGain(xyz(h), HEAT_R, p);
          for (const h of hums) {
            const g = sphereGain(xyz(h), HUM_R, p);
            if (g > 0) hum += HUM_EDGE + (HUM_PEAK - HUM_EDGE) * g;
          }
          out.push({ id: s.id, kind, temp: Math.round(clamp(temp, -40, 125) * 10) / 10, hum: Math.round(clamp(hum, 0, 100)) });
          break;
        }
        case 'pir': {
          let motion = false;
          for (const m of movers) if (moverSeen(p, fwd, xyz(m), blocks)) { motion = true; break; }
          out.push({ id: s.id, kind, motion });
          break;
        }
        default: unknown(kind);
      }
    }
    return { sensors: out };
  }

  function partKind(type) {
    if (PART_KIND[type]) return PART_KIND[type];
    const d = window.PARTS && window.PARTS[type];
    if (!d) return type === 'pir' ? 'pir' : null;
    if (d.sensor === 'pir' || type === 'pir') return 'pir';
    if (d.sensor === 'sonar') return 'ultrasonic';
    if (d.sensor === 'dht') return 'dht';
    return null;
  }
  function writePart(p, r) {
    if (!p.props || typeof p.props !== 'object' || Array.isArray(p.props)) {
      if (r.kind !== 'pir') return false;
      p.props = {};
    }
    let changed = false;
    const set = (k, v) => { if (p.props[k] !== v) { p.props[k] = v; changed = true; } };
    switch (r.kind) {
      case 'ultrasonic': set('dist', r.dist); break;
      case 'ldr': set('lux', r.lux); break;
      case 'dht': set('temp', r.temp); set('hum', r.hum); break;
      case 'ntc': set('temp', r.temp); break;
      case 'pir': set('motion', !!r.motion); break;
      default: unknown(r.kind);
    }
    return changed;
  }
  function clone(r) { return { sensors: r.sensors.map(s => Object.assign({}, s)) }; }
  function sigOf(r) { return r.sensors.map(s => [s.id, s.kind, s.dist, s.lux, s.temp, s.hum, s.motion].join(':')).join('|'); }

  let last = { sensors: [] }, lastSig = '';
  let syncTags = () => {};
  function applyReadings(p) {
    try {
      const readings = compute(p && p.world3d);
      last = readings;
      if (p && Array.isArray(p.parts)) {
        // Same kind, schematic order: 1st ultrasonic sensor → 1st HC-SR04, and so on.
        // NTC is not a 3D kind; it copies temperature from the DHT sample at the same index.
        const buckets = { ultrasonic: [], ldr: [], dht: [], pir: [] };
        const ntcs = [];
        for (const part of p.parts) {
          const k = partKind(part.type);
          if (k === 'ntc') ntcs.push(part);
          else if (k && buckets[k]) buckets[k].push(part);
        }
        const used = { ultrasonic: 0, ldr: 0, dht: 0, pir: 0 };
        let ntcUsed = 0;
        for (const r of readings.sensors) {
          const part = buckets[r.kind] && buckets[r.kind][used[r.kind]++];
          if (part) writePart(part, r);
          if (r.kind === 'dht' && ntcs[ntcUsed]) writePart(ntcs[ntcUsed++], { kind: 'ntc', temp: r.temp });
        }
      }
      const sig = sigOf(readings);
      if (sig !== lastSig) {
        lastSig = sig;
        if (typeof window.dispatchEvent === 'function' && typeof window.CustomEvent === 'function') window.dispatchEvent(new CustomEvent('world3d-readings', { detail: clone(readings) }));
      }
      try { syncTags(); } catch (e) { /* the overlay must not drop a reading */ }
      return clone(readings);
    } catch (e) { return { sensors: [] }; }
  }

  const api = {
    KINDS, TYPES,
    compute,
    applyReadings,
    tagMinScreen,
    clampTagX,
    getReadings() { const p = window.__sim && window.__sim.proj; return applyReadings(p || { parts: [], world3d: null }); },
    get active() { return false; },
    show() {},
    onOpen() {},
    removeSelected() { return false; },
    yawSelected() { return false; },
    screenPos() { return null; }
  };
  window.World3D = api;
  if (typeof document === 'undefined') return;

  const $ = s => document.querySelector(s);
  const el = (tag, props, kids) => { const e = document.createElement(tag); if (props) Object.assign(e, props); for (const k of kids || []) e.append(k); return e; };
  const proj = () => window.__sim && window.__sim.proj;
  const lim = () => window.WORLD3D_LIMITS || { sensors: 32, stimuli: 48 };
  let active = false, renderer = null, scene = null, camera = null, controls = null, raf = 0;
  let pickRoot = null, zoneRoot = null, ring = null, groups = new Map(), tagEls = new Map();
  let selected = null, drag = null, hoverPick = null, dirty = true, zoneKeys = [];
  let caster = null, ptr = null, hitV = null;
  let schemaRoot = null, schemaLib = null, schemaSig = null, view = 'world';
  let camHeld = false, savedWorldCam = null;

  const center = $('#center');
  const btn = el('button', { type: 'button', id: 'w3tab', textContent: '3D', title: '3D-мир датчиков' });
  btn.setAttribute('aria-pressed', 'false');
  const rt = $('#rtabs'); if (rt) rt.after(btn); else if (center) center.prepend(btn);
  const pal = el('aside', { id: 'w3pal' });
  pal.append(el('div', { className: 'w3sec', textContent: 'Вид' }));
  const bWorld = el('button', { type: 'button', className: 'w3btn w3view on', textContent: 'Мир', title: 'Датчики и воздействия' });
  const bSchema = el('button', { type: 'button', className: 'w3btn w3view', textContent: 'Схема 3D', title: 'Детали схемы на столе. Воздействия остаются.' });
  bWorld.dataset.view = 'world'; bSchema.dataset.view = 'schema';
  bWorld.setAttribute('aria-pressed', 'true'); bSchema.setAttribute('aria-pressed', 'false');
  bWorld.onclick = () => setView('world'); bSchema.onclick = () => setView('schema');
  pal.append(bWorld, bSchema);
  pal.append(el('div', { className: 'w3sec', textContent: 'Датчики' }));
  const SENS_UI = [['ultrasonic', 'УЗ', 'Ультразвук — расстояние до куба'], ['ldr', 'LDR', 'Фоторезистор — свет фонаря'], ['dht', 'DHT', 'Температура и влажность'], ['pir', 'PIR', 'Движение фигурки в секторе']];
  const STIM_UI = [['block', 'Куб', 'Препятствие для ультразвука'], ['flashlight', 'Фонарь', 'Свет в конусе для LDR'], ['heat', 'Тепло', 'Нагрев в радиусе для DHT'], ['humid', 'Пар', 'Влажность в радиусе для DHT'], ['mover', 'Фигурка', 'Движение для PIR']];
  for (const [k, t, title] of SENS_UI) { const b = el('button', { type: 'button', className: 'w3btn w3k-' + k, textContent: t, title }); b.dataset.kind = k; b.onclick = () => addSensor(k); pal.append(b); }
  pal.append(el('div', { className: 'w3sec', textContent: 'Воздействия' }));
  for (const [k, t, title] of STIM_UI) { const b = el('button', { type: 'button', className: 'w3btn w3k-' + k, textContent: t, title }); b.dataset.type = k; b.onclick = () => addStim(k); pal.append(b); }
  const bReset = el('button', { type: 'button', id: 'w3reset', className: 'w3btn w3act', textContent: 'Сброс воздействий', title: 'Сброс воздействий' });
  const bDel = el('button', { type: 'button', id: 'w3del', className: 'w3btn w3act', textContent: 'Удалить', title: 'Удалить выбранное' });
  const bYawL = el('button', { type: 'button', id: 'w3yawL', className: 'w3btn w3act', textContent: '↺ 15°', title: 'Повернуть датчик влево' });
  const bYawR = el('button', { type: 'button', id: 'w3yawR', className: 'w3btn w3act', textContent: '↻ 15°', title: 'Повернуть датчик вправо' });
  bReset.onclick = () => resetStimuli(); bDel.onclick = () => removeSelected(); bYawL.onclick = () => yawSelected(1); bYawR.onclick = () => yawSelected(-1);
  const HINT_WORLD = 'ЛКМ по пустому — обзор, ПКМ — сдвиг, колесо — масштаб. Тяни объект по столу.';
  const HINT_SCHEMA = 'Симуляция идёт и здесь. Детали живые. Воздействия можно двигать. Саму схему правь на вкладке «Схема».';
  const hint = el('p', { className: 'w3hint', textContent: HINT_WORLD });
  const stat = el('p', { id: 'w3stat', className: 'w3hint', textContent: '' });
  const readEl = el('p', { id: 'w3read', hidden: true, textContent: '' });
  pal.append(bReset, bDel, bYawL, bYawR, hint, stat, readEl);
  const stage = el('div', { id: 'w3stage' });
  const canvas = el('canvas', { id: 'w3cv' });
  const tags = el('div', { id: 'w3tags' });
  const fail = el('p', { id: 'w3fail', hidden: true, textContent: 'WebGL недоступен. Показания World3D.getReadings() всё равно считаются.' });
  stage.append(canvas, tags, fail);
  const pane = el('div', { id: 'w3pane', hidden: true });
  pane.append(pal, stage);
  if (center) center.append(pane);
  if (rt) rt.addEventListener('click', e => { if (e.target.closest('button')) show(false); });
  btn.onclick = () => show(!active);

  function world() { const p = proj(); return p && p.world3d && typeof p.world3d === 'object' && !Array.isArray(p.world3d) ? p.world3d : null; }
  function ensure() {
    const p = proj(); if (!p) return null;
    if (!p.world3d || typeof p.world3d !== 'object' || Array.isArray(p.world3d)) p.world3d = { sensors: [], stimuli: [] };
    if (!Array.isArray(p.world3d.sensors)) p.world3d.sensors = [];
    if (!Array.isArray(p.world3d.stimuli)) p.world3d.stimuli = [];
    return p.world3d;
  }
  function alloc(pre) {
    const w = ensure(), ids = new Set(w.sensors.map(s => s.id).concat(w.stimuli.map(s => s.id)));
    let i = 1; while (ids.has(pre + i)) i++; return pre + i;
  }
  function q2(v) { return Math.round(clamp(v, -1e5, 1e5) * 100) / 100; }
  function slot(i, z0) { return { x: q2(-48 + (i % 4) * 28), z: q2(z0 - Math.floor(i / 4) * 16) }; }
  function setStat(msg) {
    if (msg) { stat.textContent = msg; return; }
    const w = world(), nT = w ? w.stimuli.length : 0;
    if (view === 'schema') {
      const n = proj() && Array.isArray(proj().parts) ? proj().parts.length : 0;
      const shown = schemaPartNodes().length;
      stat.textContent = 'Схема 3D · деталей ' + n + (shown && shown < n ? ' · на столе ' + shown : '') + ' · воздействий ' + nT;
      return;
    }
    const nS = w ? w.sensors.length : 0;
    stat.textContent = 'Датчиков ' + nS + ' · объектов ' + nT + (selected ? ' · ' + selected.id : '');
  }
  function syncChrome() {
    const sens = !!(selected && selected.role === 'sensor');
    bYawL.disabled = bYawR.disabled = !sens; bDel.disabled = !selected; setStat();
  }
  function commit() {
    applyReadings(proj()); updateZones();
    const s = window.__sim; if (s && s.changed) s.changed(); syncChrome();
    if (active && renderer && camera) { renderer.render(scene, camera); syncTags(); }
  }

  function addSensor(kind) {
    if (!KINDS.includes(kind)) return;
    const w = ensure(); if (!w) return;
    if (w.sensors.length >= lim().sensors) { setStat('Лимит датчиков'); return; }
    const at = slot(w.sensors.length, SENSOR_Z);
    const s = { id: alloc('s'), kind, x: at.x, y: q2(TABLE_Y + REST[kind]), z: at.z, rx: 0, ry: 0, rz: 0 };
    w.sensors.push(s); selected = { role: 'sensor', id: s.id }; dirty = true; rebuild(); commit();
  }
  function addStim(type) {
    if (!TYPES.includes(type)) return;
    const w = ensure(); if (!w) return;
    if (w.stimuli.length >= lim().stimuli) { setStat('Лимит объектов'); return; }
    const at = slot(w.stimuli.length, STIM_Z);
    const t = { id: alloc('t'), type, x: at.x, y: q2(TABLE_Y + REST[type]), z: at.z };
    w.stimuli.push(t); selected = { role: 'stimulus', id: t.id }; dirty = true; rebuild(); commit();
  }
  function resetStimuli() {
    const w = world(); if (!w || !w.stimuli.length) return;
    w.stimuli = []; if (selected && selected.role === 'stimulus') selected = null;
    dirty = true; rebuild(); commit();
  }
  function removeSelected() {
    const w = world(); if (!w || !selected) return false;
    const arr = selected.role === 'sensor' ? w.sensors : w.stimuli;
    const i = arr.findIndex(o => o.id === selected.id); if (i < 0) return false;
    arr.splice(i, 1); selected = null; drag = null; dirty = true; rebuild(); commit(); return true;
  }
  function yawSelected(sign) {
    const w = world(); if (!w || !selected || selected.role !== 'sensor') return false;
    const s = w.sensors.find(o => o.id === selected.id); if (!s) return false;
    let deg = Math.round((s.ry || 0) * 180 / Math.PI / 15) * 15 + sign * 15;
    while (deg > 180) deg -= 360; while (deg < -180) deg += 360;
    s.ry = Math.round(deg * Math.PI / 180 * 10000) / 10000;
    syncGroup(s, 'sensor'); commit(); return true;
  }

  const SCHEMA_MAX = 160;
  const WIRE_MAX = 400;
  function schemaPartNodes() {
    if (!schemaRoot) return [];
    return schemaRoot.children.filter(c => c.userData && c.userData.role === 'schematic');
  }
  function mix(h, n) { return Math.imul(h ^ n, 16777619); }
  function hashStr(h, s) {
    const str = s || '';
    for (let i = 0; i < str.length; i++) h = mix(h, str.charCodeAt(i));
    return h;
  }
  function schemaHash(parts, wires) {
    let h = 2166136261;
    const n = Math.min(parts.length, SCHEMA_MAX);
    for (let i = 0; i < n; i++) {
      const p = parts[i];
      h = hashStr(h, p && p.id);
      h = hashStr(h, p && p.type);
      h = mix(h, Math.round(p && p.x || 0));
      h = mix(h, Math.round(p && p.y || 0));
      h = mix(h, ((p && p.rot) | 0) & 3);
    }
    h = mix(h, parts.length);
    const ws = Array.isArray(wires) ? wires : [];
    const m = Math.min(ws.length, WIRE_MAX);
    for (let i = 0; i < m; i++) {
      const w = ws[i];
      h = hashStr(h, w && w.id);
      h = hashStr(h, w && w.color);
      h = hashStr(h, w && w.a && w.a.part);
      h = hashStr(h, w && w.a && w.a.pin);
      h = hashStr(h, w && w.b && w.b.part);
      h = hashStr(h, w && w.b && w.b.pin);
      const pts = w && Array.isArray(w.pts) ? w.pts : [];
      h = mix(h, pts.length);
      const kn = Math.min(pts.length, 50);
      for (let k = 0; k < kn; k++) {
        const pt = pts[k];
        h = mix(h, Math.round(pt && pt[0] || 0));
        h = mix(h, Math.round(pt && pt[1] || 0));
      }
    }
    return mix(h, ws.length);
  }
  function applyView() {
    const schema = view === 'schema';
    if (schemaRoot) schemaRoot.visible = schema;
    if (pickRoot) for (const c of pickRoot.children) if (c.userData && c.userData.role === 'sensor') c.visible = !schema;
    if (tags) tags.hidden = schema;
    if (bWorld) { bWorld.classList.toggle('on', !schema); bWorld.setAttribute('aria-pressed', schema ? 'false' : 'true'); }
    if (bSchema) { bSchema.classList.toggle('on', schema); bSchema.setAttribute('aria-pressed', schema ? 'true' : 'false'); }
    if (hint) hint.textContent = schema ? HINT_SCHEMA : HINT_WORLD;
    if (ring && schema && selected && selected.role === 'sensor') ring.visible = false;
    syncChrome();
  }
  function clearSchema() {
    if (!schemaRoot) return;
    while (schemaRoot.children.length) schemaRoot.remove(schemaRoot.children[0]);
  }
  function refreshSchema(force) {
    if (view !== 'schema' || !schemaRoot || !schemaLib || !window.Schematic3D) return;
    const project = proj();
    const parts = (project && Array.isArray(project.parts)) ? project.parts : [];
    const wires = (project && Array.isArray(project.wires)) ? project.wires : [];
    const drawnWires = wires.slice(0, WIRE_MAX);
    const sig = schemaHash(parts, drawnWires);
    if (!force && sig === schemaSig) return;
    schemaSig = sig;
    clearSchema();
    const S = window.Schematic3D;
    const n = Math.min(parts.length, SCHEMA_MAX);
    for (let i = 0; i < n; i++) {
      const p = parts[i];
      if (!p || typeof p !== 'object') continue;
      let g;
      try { g = S.build(schemaLib, p); } catch (e) { continue; }
      const at = S.pose(p);
      g.position.set(at.x, at.y, at.z);
      g.rotation.y = at.yaw;
      g.userData.role = 'schematic';
      g.userData.id = p.id;
      g.userData.type = p.type;
      schemaRoot.add(g);
    }
    if (typeof S.buildWires === 'function') {
      try {
        const wg = S.buildWires(schemaLib, parts, drawnWires);
        if (wg) schemaRoot.add(wg);
      } catch (e) { /* a bad tube must not drop the parts already on the table */ }
    }
    if (!camHeld) fitSchema();
  }
  function rememberWorldCam() {
    if (!camera || !controls || savedWorldCam) return;
    savedWorldCam = {
      px: camera.position.x, py: camera.position.y, pz: camera.position.z,
      tx: controls.target.x, ty: controls.target.y, tz: controls.target.z
    };
  }
  function restoreWorldCam() {
    if (!savedWorldCam || !camera || !controls) return;
    camera.position.set(savedWorldCam.px, savedWorldCam.py, savedWorldCam.pz);
    controls.target.set(savedWorldCam.tx, savedWorldCam.ty, savedWorldCam.tz);
    savedWorldCam = null;
    controls.update();
  }
  function fitSchema() {
    if (!camera || !controls || !window.Schematic3D || typeof Schematic3D.fitView !== 'function') return;
    const pts = schemaPartNodes().map(g => ({ x: g.position.x, z: g.position.z }));
    const fit = Schematic3D.fitView(pts);
    if (!fit) return;
    controls.target.set(fit.target.x, fit.target.y, fit.target.z);
    camera.position.set(fit.position.x, fit.position.y, fit.position.z);
    camera.updateProjectionMatrix();
    controls.update();
  }
  function setView(next) {
    if (next !== 'world' && next !== 'schema') return;
    if (next === view) return;
    const prev = view;
    view = next;
    if (active && !renderer) boot();
    applyView();
    if (view === 'schema') {
      camHeld = false;
      rememberWorldCam();
      refreshSchema(true);
      fitSchema();
    } else {
      if (prev === 'schema') restoreWorldCam();
      updateSel();
      if (active) syncTags();
    }
    if (readEl) readEl.hidden = view !== 'schema';
  }

  function boot() {
    if (renderer) return true;
    const THREE = window.THREE;
    if (!THREE || !THREE.WebGLRenderer || !THREE.OrbitControls) { fail.hidden = false; return false; }
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
      if (!renderer.getContext()) throw new Error('no webgl');
      renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
      renderer.setClearColor(0xd4d6db, 1);
      scene = new THREE.Scene();
      camera = new THREE.PerspectiveCamera(48, 1, 0.5, 2000);
      // Sensors face −Z, stimuli sit in front of them. Look from that side
      // so a click on a stimulus is not swallowed by the sensor behind it.
      camera.position.set(70, 96, -132);
      scene.add(new THREE.AmbientLight(0xffffff, 0.72));
      const sun = new THREE.DirectionalLight(0xfff7ee, 0.85); sun.position.set(60, 140, 80); scene.add(sun);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(520, 520), new THREE.MeshStandardMaterial({ color: 0xc8c6c2, roughness: 0.95 }));
      floor.rotation.x = -Math.PI / 2; floor.position.y = -0.2; scene.add(floor);
      const top = new THREE.Mesh(new THREE.BoxGeometry(180, 4, 100), new THREE.MeshStandardMaterial({ color: 0xc4a484, roughness: 0.8 }));
      top.position.y = TABLE_Y - 2; scene.add(top);
      const legMat = new THREE.MeshStandardMaterial({ color: 0x7a624c, roughness: 0.85 });
      for (const [x, z] of [[78, 40], [78, -40], [-78, 40], [-78, -40]]) {
        const leg = new THREE.Mesh(new THREE.BoxGeometry(6, 72, 6), legMat); leg.position.set(x, 36, z); scene.add(leg);
      }
      pickRoot = new THREE.Group(); zoneRoot = new THREE.Group(); scene.add(pickRoot, zoneRoot);
      schemaRoot = new THREE.Group(); schemaRoot.visible = false; schemaRoot.frustumCulled = false; scene.add(schemaRoot);
      if (window.Schematic3D && window.Schematic3D.createLib) schemaLib = window.Schematic3D.createLib(THREE);
      ring = new THREE.Mesh(new THREE.RingGeometry(8, 10.5, 28), new THREE.MeshBasicMaterial({ color: 0xffd34d, side: THREE.DoubleSide }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = TABLE_Y + 0.3; ring.visible = false; scene.add(ring);
      controls = new THREE.OrbitControls(camera, canvas);
      controls.target.set(0, 58, 0); controls.enableDamping = true; controls.dampingFactor = 0.08;
      controls.maxPolarAngle = Math.PI / 2 - 0.06; controls.minDistance = 18; controls.maxDistance = 420;
      controls.addEventListener('start', () => { camHeld = true; });
      controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE; controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
      controls.update();
      caster = new THREE.Raycaster(); ptr = new THREE.Vector2(); hitV = new THREE.Vector3();
      fail.hidden = true; dirty = true; return true;
    } catch (e) { renderer = null; fail.hidden = false; return false; }
  }
  function resize() {
    if (!renderer) return;
    const w = Math.max(1, stage.clientWidth), h = Math.max(1, stage.clientHeight);
    renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  function loop() {
    if (!active || !renderer) { raf = 0; return; }
    controls.update();
    if (view === 'schema') refreshSchema(false);
    paintLive();
    renderer.render(scene, camera); syncTags();
    raf = requestAnimationFrame(loop);
  }
  function show(on) {
    active = on === undefined ? !active : !!on;
    pane.hidden = !active; btn.classList.toggle('on', active); btn.setAttribute('aria-pressed', active ? 'true' : 'false');
    document.body.dataset.w3 = active ? '1' : '';
    if (!active) {
      cancelAnimationFrame(raf); raf = 0; drag = null; if (controls) controls.enabled = true;
      const s = window.__sim; if (s && s.render) s.render();
      return;
    }
    if (!boot()) return;
    if (controls) controls.enabled = true;
    resize(); if (dirty) rebuild(); else { syncAll(); applyView(); }
    if (view === 'schema') { refreshSchema(true); if (!camHeld) fitSchema(); }
    applyReadings(proj()); updateZones(); paintLive(); syncChrome();
    if (!raf) loop(); else if (renderer && camera) { renderer.render(scene, camera); syncTags(); }
    requestAnimationFrame(() => { if (active) resize(); });
  }

  function disposeObj(o) {
    if (o.geometry) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) if (m && m.dispose) m.dispose();
  }
  function clearGroup(g) {
    if (!g) return;
    while (g.children.length) { const c = g.children[0]; c.traverse(disposeObj); g.remove(c); }
  }
  function mat(color, extra) { return new window.THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.72, metalness: 0.04 }, extra || {})); }
  function mesh(geo, color, extra) { return new window.THREE.Mesh(geo, mat(color, extra)); }
  function aimNegZ(obj, fwd) { obj.quaternion.setFromUnitVectors(new window.THREE.Vector3(0, 0, -1), new window.THREE.Vector3(fwd[0], fwd[1], fwd[2])); }
  function mute(o) { o.raycast = function () {}; return o; }

  function makeSensor(kind) {
    const THREE = window.THREE, g = new THREE.Group();
    switch (kind) {
      case 'ultrasonic': {
        g.add(mesh(new THREE.BoxGeometry(22, 10, 12), 0x1d4fd0));
        for (const x of [-6, 6]) { const eye = mesh(new THREE.CylinderGeometry(3.1, 3.1, 2, 14), 0xd5d8de); eye.rotation.x = Math.PI / 2; eye.position.set(x, 0, -6.2); g.add(eye);
          const pup = mesh(new THREE.CylinderGeometry(1.5, 1.5, 1.2, 12), 0x1a1d24); pup.rotation.x = Math.PI / 2; pup.position.set(x, 0, -7.2); pup.userData.fx = 'eye'; g.add(pup); }
        const beam = mute(mesh(new THREE.CylinderGeometry(0.7, 0.7, 1, 8), 0x4c7dff, { transparent: true, opacity: 0.4, emissive: 0x4c7dff, emissiveIntensity: 0.25 }));
        beam.rotation.x = -Math.PI / 2; beam.userData.fx = 'beam'; beam.position.set(0, 0, -8); g.add(beam);
        const cube = mute(mesh(new THREE.BoxGeometry(4.2, 4.2, 4.2), 0x9aa3b2));
        cube.userData.fx = 'standin'; cube.userData.stand = 'block'; cube.visible = false; cube.position.set(12, 2, -4); g.add(cube);
        break;
      }
      case 'ldr': {
        const disc = mesh(new THREE.CylinderGeometry(6, 6, 2.4, 20), 0xe8c89a); disc.position.y = 0; disc.userData.fx = 'disc'; g.add(disc);
        for (const z of [-2.2, 0, 2.2]) { const line = mesh(new THREE.BoxGeometry(8, 0.5, 0.7), 0xb33); line.position.set(0, 1.3, z); g.add(line); }
        const lamp = mute(mesh(new THREE.SphereGeometry(1.7, 12, 8), 0xfff2a8, { emissive: 0xfff2a8, emissiveIntensity: 0.25 }));
        lamp.userData.fx = 'standin'; lamp.userData.stand = 'flashlight'; lamp.visible = false; lamp.position.set(0, 8, 0); g.add(lamp);
        break;
      }
      case 'dht': {
        const body = mesh(new THREE.BoxGeometry(12, 16, 8), 0xf4f4f4); body.userData.fx = 'body'; g.add(body);
        for (let i = 0; i < 4; i++) { const slit = mesh(new THREE.BoxGeometry(8, 0.6, 0.5), 0xb9c0c8); slit.position.set(0, 4 - i * 2.4, -4.1); g.add(slit); }
        const flame = mute(mesh(new THREE.ConeGeometry(1.6, 4.2, 8), 0xff9f1c, { emissive: 0xff9f1c, emissiveIntensity: 0.35 }));
        flame.userData.fx = 'standin'; flame.userData.stand = 'heat'; flame.visible = false; flame.position.set(8, 6, 0); g.add(flame);
        const puff = mute(mesh(new THREE.SphereGeometry(1.8, 10, 8), 0xd7f3ff, { transparent: true, opacity: 0.55 }));
        puff.userData.fx = 'standin'; puff.userData.stand = 'humid'; puff.visible = false; puff.position.set(-8, 7, 0); g.add(puff);
        break;
      }
      case 'pir': {
        g.add(mesh(new THREE.BoxGeometry(14, 4, 10), 0xe6e6ea));
        const dome = mesh(new THREE.SphereGeometry(5, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), 0xf7f7fb, { transparent: true, opacity: 0.9, emissive: 0x000000, emissiveIntensity: 0 });
        dome.position.y = 2; dome.userData.fx = 'dome'; g.add(dome);
        const fig = mute(mesh(new THREE.BoxGeometry(2.2, 5, 1.4), 0x3d5a80));
        fig.userData.fx = 'standin'; fig.userData.stand = 'mover'; fig.visible = false; fig.position.set(0, 3, -10); g.add(fig);
        break;
      }
      default: unknown(kind);
    }
    const nose = mesh(new THREE.ConeGeometry(1.4, 6, 8), 0xffd34d);
    nose.rotation.x = -Math.PI / 2; nose.position.z = -8; g.add(nose);
    return g;
  }
  function makeStim(type) {
    const THREE = window.THREE, g = new THREE.Group();
    switch (type) {
      case 'block': {
        const box = mesh(new THREE.BoxGeometry(BLOCK, BLOCK, BLOCK), 0x9aa3b2);
        g.add(box);
        g.add(new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: 0x2c3340 })));
        break;
      }
      case 'flashlight': {
        const body = mesh(new THREE.CylinderGeometry(3.2, 3.6, 16, 12), 0xf0c14a); body.rotation.x = Math.PI / 2; g.add(body);
        const head = mesh(new THREE.CylinderGeometry(5.4, 3.4, 6, 14), 0xfff4c2); head.rotation.x = Math.PI / 2; head.position.z = 10; g.add(head);
        const lens = mesh(new THREE.CircleGeometry(4.2, 16), 0xfffef6, { emissive: 0xfff2a8, emissiveIntensity: 0.7 });
        lens.position.z = 13.1; g.add(lens);
        aimNegZ(g, [-FLASH_DIR[0], -FLASH_DIR[1], -FLASH_DIR[2]]);
        break;
      }
      case 'heat': {
        g.add(mesh(new THREE.SphereGeometry(7, 18, 12), 0xe85d04, { emissive: 0xff6a00, emissiveIntensity: 0.28 }));
        const flame = mesh(new THREE.ConeGeometry(3.2, 8, 10), 0xffd166, { emissive: 0xff9f1c, emissiveIntensity: 0.4 });
        flame.position.y = 9; g.add(flame);
        break;
      }
      case 'humid': {
        g.add(mesh(new THREE.SphereGeometry(7, 18, 12), 0x8fd3e8, { transparent: true, opacity: 0.8, roughness: 0.25 }));
        for (let i = 0; i < 3; i++) { const puff = mesh(new THREE.SphereGeometry(1.7 - i * 0.25, 8, 6), 0xf4fbff); puff.position.set((i - 1) * 1.6, 8 + i * 3, 0); g.add(puff); }
        break;
      }
      case 'mover': {
        for (const x of [-1.6, 1.6]) { const leg = mesh(new THREE.BoxGeometry(2.2, 8, 2.2), 0x2f3a4a); leg.position.set(x, -7, 0); g.add(leg); }
        const body = mesh(new THREE.BoxGeometry(7, 8, 3.4), 0x3d5a80); g.add(body);
        const head = mesh(new THREE.SphereGeometry(2.5, 12, 10), 0xf2c9a0); head.position.y = 6.2; g.add(head);
        break;
      }
      default: unknown(type);
    }
    return g;
  }
  function labelOf(r) {
    switch (r.kind) {
      case 'ultrasonic': return 'УЗ ' + r.id + ' · ' + r.dist + ' см';
      case 'ldr': return 'LDR ' + r.id + ' · ' + r.lux + ' лк';
      case 'dht': return 'DHT ' + r.id + ' · ' + r.temp.toFixed(1) + '°C  ' + r.hum + '%';
      case 'pir': return 'PIR ' + r.id + ' · ' + (r.motion ? 'движение' : 'тихо');
      default: unknown(r.kind);
    }
  }
  function rebuildTags() {
    tags.textContent = ''; tagEls = new Map();
    const w = world(); if (!w) return;
    for (const s of w.sensors) {
      const t = el('div', { className: 'w3tag' }); t.dataset.id = s.id; tags.append(t); tagEls.set(s.id, t);
    }
  }
  function rebuild() {
    if (!renderer) { dirty = true; return; }
    clearGroup(pickRoot); groups = new Map();
    const w = world() || { sensors: [], stimuli: [] };
    for (const s of w.sensors) {
      const g = makeSensor(s.kind); g.userData = { role: 'sensor', id: s.id, kind: s.kind }; pickRoot.add(g); groups.set('sensor:' + s.id, g); syncGroup(s, 'sensor');
    }
    for (const t of w.stimuli) {
      const g = makeStim(t.type); g.userData = { role: 'stimulus', id: t.id, type: t.type }; pickRoot.add(g); groups.set('stimulus:' + t.id, g); syncGroup(t, 'stimulus');
    }
    if (selected && !groups.has(selected.role + ':' + selected.id)) selected = null;
    rebuildTags(); updateSel(); updateZones(); applyView(); dirty = false; syncChrome();
  }
  function syncGroup(o, role) {
    const g = groups.get(role + ':' + o.id); if (!g) return;
    g.position.set(o.x, o.y, o.z);
    if (role === 'sensor') aimNegZ(g, forward(o.rx, o.ry));
  }
  function syncAll() { const w = world(); if (!w) return; for (const s of w.sensors) syncGroup(s, 'sensor'); for (const t of w.stimuli) syncGroup(t, 'stimulus'); updateSel(); }
  function focusList() {
    const w = world(); if (!w) return [];
    const seen = new Set(), out = [];
    const add = (role, id) => {
      if (!role || id == null || id === '') return;
      const key = role + '\0' + id;
      if (seen.has(key)) return;
      const obj = (role === 'sensor' ? w.sensors : w.stimuli).find(o => o && o.id === id);
      if (!obj) return;
      seen.add(key); out.push({ role, obj });
    };
    if (hoverPick) add(hoverPick.role, hoverPick.id);
    if (drag) add(drag.role, drag.id);
    if (selected) add(selected.role, selected.id);
    return out;
  }
  function zoneCone(len, ang, color) {
    const THREE = window.THREE;
    const geo = new THREE.ConeGeometry(Math.max(0.2, Math.tan(ang) * len), len, 28, 1, true);
    geo.translate(0, -len / 2, 0); geo.rotateX(Math.PI / 2);
    return new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.32, depthWrite: false, side: THREE.DoubleSide }));
  }
  function pushCone(obj, len, ang, color, dir) {
    const cone = zoneCone(len, ang, color);
    cone.position.set(obj.x, obj.y, obj.z); aimNegZ(cone, dir); zoneRoot.add(cone);
  }
  function drawZone(item, byId) {
    const o = item.obj;
    if (item.role === 'sensor' && o.kind === 'ultrasonic') {
      const dist = (byId.get(o.id) && byId.get(o.id).dist) || SONAR_VIS;
      pushCone(o, Math.min(SONAR_VIS, Math.max(8, dist)), SONAR_ANG, 0x4c7dff, forward(o.rx, o.ry));
      return true;
    }
    if (item.role === 'sensor' && o.kind === 'pir') {
      pushCone(o, Math.min(160, PIR_R), PIR_ANG, 0xb388ff, forward(o.rx, o.ry));
      return true;
    }
    if (item.role === 'stimulus' && o.type === 'flashlight') { pushCone(o, FLASH_R, FLASH_ANG, 0xf5d76e, FLASH_DIR); return true; }
    if (item.role === 'stimulus' && o.type === 'heat') { zoneRoot.add(zoneSphere(o, HEAT_R, 0xe85d04)); return true; }
    if (item.role === 'stimulus' && o.type === 'humid') { zoneRoot.add(zoneSphere(o, HUM_R, 0x3ec6e0)); return true; }
    return false;
  }
  function updateZones() {
    if (!zoneRoot) { zoneKeys = []; return; }
    clearGroup(zoneRoot);
    const w = world(); if (!w) { zoneKeys = []; return; }
    const byId = new Map(last.sensors.map(r => [r.id, r]));
    const keys = [];
    for (const item of focusList()) {
      if (view === 'schema' && item.role === 'sensor') continue;
      if (drawZone(item, byId)) keys.push(item.role + ':' + item.obj.id);
    }
    zoneKeys = keys.sort();
  }
  function zoneSphere(o, r, color) {
    const m = new window.THREE.Mesh(new window.THREE.SphereGeometry(r, 20, 14), new window.THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.22, depthWrite: false }));
    m.position.set(o.x, o.y, o.z); return m;
  }
  function updateSel() {
    if (!ring) return;
    const w = world(), o = selected && w ? (selected.role === 'sensor' ? w.sensors : w.stimuli).find(x => x.id === selected.id) : null;
    ring.visible = !!o && !(view === 'schema' && selected.role === 'sensor');
    if (o) ring.position.set(o.x, TABLE_Y + 0.35, o.z);
  }
  function hotSensor(id) {
    return (hoverPick && hoverPick.role === 'sensor' && hoverPick.id === id) || (selected && selected.role === 'sensor' && selected.id === id);
  }
  function paintTags() {
    for (const [id, node] of tagEls) {
      const r = last.sensors.find(s => s.id === id);
      if (!r) { node.hidden = true; continue; }
      try { node.textContent = labelOf(r); } catch (e) { node.textContent = id; }
      node.classList.toggle('on', hotSensor(id));
    }
  }
  function placeTags() {
    if (!camera) return;
    const w = stage.getBoundingClientRect();
    const pr = pal.getBoundingClientRect();
    const minScreen = tagMinScreen(w, pr);
    const THREE = window.THREE, v = new THREE.Vector3();
    const data = world();
    for (const [id, node] of tagEls) {
      const s = data && data.sensors.find(q => q.id === id);
      if (!s) { node.hidden = true; continue; }
      v.set(s.x, s.y + 12, s.z).project(camera);
      if (v.z > 1) { node.hidden = true; continue; }
      node.hidden = false;
      const raw = (v.x * 0.5 + 0.5) * w.width;
      node.style.left = raw + 'px';
      node.style.top = (-v.y * 0.5 + 0.5) * w.height + 'px';
      const center = clampTagX(raw, node.offsetWidth / 2, w.left, minScreen);
      if (center !== raw) node.style.left = center + 'px';
    }
  }
  syncTags = () => { if (!active || view === 'schema') return; paintTags(); placeTags(); };
  function ndc(e) {
    const r = canvas.getBoundingClientRect();
    ptr.x = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
    ptr.y = -((e.clientY - r.top) / Math.max(1, r.height)) * 2 + 1;
  }
  function pick(e) {
    if (!caster || !camera || !pickRoot) return null;
    ndc(e); caster.setFromCamera(ptr, camera);
    const hits = caster.intersectObjects(pickRoot.children, true);
    for (const h of hits) { let o = h.object; while (o && !o.userData.role) o = o.parent; if (o && o.userData.role) return o.userData; }
    return null;
  }
  function planeAt(e, y) {
    ndc(e); caster.setFromCamera(ptr, camera);
    const plane = new window.THREE.Plane(new window.THREE.Vector3(0, 1, 0), -y);
    return caster.ray.intersectPlane(plane, hitV) ? hitV : null;
  }
  function screenOf(o) {
    if (!camera || !o) return null;
    const v = new window.THREE.Vector3(o.x, o.y, o.z).project(camera);
    const r = canvas.getBoundingClientRect();
    return { x: r.left + (v.x * 0.5 + 0.5) * r.width, y: r.top + (-v.y * 0.5 + 0.5) * r.height, behind: v.z > 1 };
  }

  canvas.addEventListener('pointerdown', e => {
    if (!active || !renderer || e.button > 0) return;
    const hit = pick(e);
    if (!hit) { selected = null; hoverPick = null; updateSel(); updateZones(); syncChrome(); paintTags(); return; }
    e.preventDefault(); e.stopImmediatePropagation();
    if (controls) controls.enabled = false;
    selected = { role: hit.role, id: hit.id }; hoverPick = { role: hit.role, id: hit.id };
    const obj = (hit.role === 'sensor' ? world().sensors : world().stimuli).find(o => o.id === hit.id);
    drag = { pid: e.pointerId, role: hit.role, id: hit.id, y: obj ? obj.y : TABLE_Y };
    updateSel(); updateZones(); syncChrome(); paintTags();
    canvas.setPointerCapture(e.pointerId);
  }, true);
  canvas.addEventListener('pointermove', e => {
    if (!active) return;
    if (drag && e.pointerId === drag.pid) {
      const w = world(); if (!w) return;
      const arr = drag.role === 'sensor' ? w.sensors : w.stimuli;
      const o = arr.find(x => x.id === drag.id); if (!o) return;
      const p = planeAt(e, drag.y); if (!p) return;
      o.x = q2(clamp(p.x, -TABLE_HX + 8, TABLE_HX - 8));
      o.z = q2(clamp(p.z, -TABLE_HZ + 8, TABLE_HZ - 8));
      syncGroup(o, drag.role); updateSel();
      applyReadings(proj()); updateZones();
      if (renderer && camera) renderer.render(scene, camera);
      syncTags();
      return;
    }
    const hit = pick(e);
    const next = hit ? { role: hit.role, id: hit.id } : null;
    const same = !!hoverPick === !!next && (!next || (hoverPick.role === next.role && hoverPick.id === next.id));
    if (!same) { hoverPick = next; updateZones(); }
    paintTags();
  });
  function endDrag(e) {
    if (!drag || (e && e.pointerId != null && e.pointerId !== drag.pid)) return;
    drag = null; if (controls) controls.enabled = true; commit();
  }
  canvas.addEventListener('pointerup', endDrag);
  canvas.addEventListener('pointercancel', endDrag);
  canvas.addEventListener('pointerleave', () => {
    if (!active || drag || !hoverPick) return;
    hoverPick = null; updateZones(); paintTags();
  });
  window.addEventListener('resize', () => { if (active) resize(); });
  if (window.ResizeObserver && stage) new ResizeObserver(() => { if (active) resize(); }).observe(stage);

  function stimulusPresent() {
    const w = world();
    const have = { block: false, flashlight: false, heat: false, humid: false, mover: false };
    if (w && Array.isArray(w.stimuli)) {
      for (const t of w.stimuli) if (t && Object.prototype.hasOwnProperty.call(have, t.type)) have[t.type] = true;
    }
    return have;
  }
  function schemaReadout() {
    const sim = window.__sim;
    const running = !!(sim && sim.running);
    const parts = (proj() && Array.isArray(proj().parts)) ? proj().parts : [];
    const bits = [];
    const num = v => { const n = +v; return Number.isFinite(n) ? n : 0; };
    for (const p of parts) {
      if (!p || bits.length >= 6) break;
      const pr = p.props || {};
      if (p.type === 'led' || p.type === 'rgbled') {
        let st = { running };
        if (sim && typeof sim.liveOf === 'function') { try { st = sim.liveOf(p.id) || st; } catch (e) { /* the line still lists other parts */ } }
        const v = window.Schematic3D && Schematic3D.liveVisual ? Schematic3D.liveVisual(p, st) : null;
        if (v && v.lit) bits.push(p.id + ' светит');
      } else if (p.type === 'hcsr04') bits.push('УЗ ' + Math.round(num(pr.dist)) + ' см');
      else if (p.type === 'ldr') bits.push('LDR ' + Math.round(num(pr.lux)) + ' лк');
      else if (p.type === 'dht22') bits.push('DHT ' + num(pr.temp).toFixed(1) + '°C ' + Math.round(num(pr.hum)) + '%');
      else if (p.type === 'ntc') bits.push('NTC ' + num(pr.temp).toFixed(1) + '°C');
      else if (p.type === 'pir') bits.push('PIR ' + (pr.motion ? 'движение' : 'тихо'));
      else if (p.type === 'vl53l0x') bits.push('VL53 ' + Math.round(num(pr.mm)) + ' мм');
      else if (p.type === 'buzzer' && sim && typeof sim.liveOf === 'function') {
        let st = null; try { st = sim.liveOf(p.id); } catch (e) { st = null; }
        if (st && st.running && st.m && st.m.I > 0.005) bits.push(p.id + ' звук');
      }
    }
    return (running ? '● симуляция' : 'стоп') + (bits.length ? ' · ' + bits.join(' · ') : '');
  }
  function setEm(mesh, hex, intensity) {
    const mat = mesh && mesh.material;
    if (!mat) return;
    if (mat.emissive && typeof mat.emissive.setHex === 'function') mat.emissive.setHex(hex);
    else mat.emissive = hex;
    mat.emissiveIntensity = intensity;
  }
  function paintSchemaLive() {
    if (!schemaRoot || !window.Schematic3D || typeof Schematic3D.liveVisual !== 'function' || typeof Schematic3D.applyLive !== 'function') return;
    const project = proj();
    const parts = project && Array.isArray(project.parts) ? project.parts : [];
    const byId = new Map();
    for (const p of parts) if (p && p.id) byId.set(p.id, p);
    const have = stimulusPresent();
    const sim = window.__sim;
    const now = typeof performance !== 'undefined' && performance.now ? performance.now() : 0;
    for (const g of schemaPartNodes()) {
      const p = byId.get(g.userData.id);
      if (!p) continue;
      let st = { running: !!(sim && sim.running), stimuli: have, now };
      if (sim && typeof sim.liveOf === 'function') {
        try {
          const live = sim.liveOf(p.id);
          if (live) st = Object.assign({}, live, { stimuli: have, now });
        } catch (e) { /* props and the fallback state still paint */ }
      } else if (sim && sim.meas && sim.meas[p.id]) st.m = sim.meas[p.id];
      try { Schematic3D.applyLive(g, Schematic3D.liveVisual(p, st)); } catch (e) { /* one part must not blank the table */ }
    }
  }
  function paintWorldLive() {
    if (!groups || !groups.size) return;
    const have = stimulusPresent();
    const byId = new Map(last.sensors.map(r => [r.id, r]));
    const THREE = window.THREE;
    for (const [key, g] of groups) {
      if (key.indexOf('sensor:') !== 0 || !g) continue;
      const r = byId.get(key.slice(7));
      if (!r) continue;
      g.traverse(m => {
        const fx = m.userData && m.userData.fx;
        if (!fx) return;
        if (fx === 'eye' && r.kind === 'ultrasonic') setEm(m, 0x4c7dff, r.dist < 390 ? 0.8 : 0.12);
        else if (fx === 'beam' && r.kind === 'ultrasonic') {
          const len = Math.min(70, Math.max(6, +r.dist || 6));
          if (m.scale && m.scale.set) m.scale.set(1, len, 1);
          m.position.z = -8 - len / 2;
          setEm(m, 0x4c7dff, r.dist < 390 ? 0.55 : 0.12);
        } else if (fx === 'disc' && r.kind === 'ldr') {
          const glow = Math.max(0, Math.min(1, Math.log10(Math.max(1, (r.lux || 0) + 1)) / 4.2));
          setEm(m, 0xfff1c2, glow);
        } else if (fx === 'body' && r.kind === 'dht' && m.material && m.material.color && m.material.color.setHex) {
          const warm = Math.max(0, Math.min(1, ((r.temp || 0) - 18) / 42));
          m.material.color.setHex(0xf4f4f4);
          if (THREE && m.material.color.lerp) m.material.color.lerp(new THREE.Color(0xe07a2f), warm);
        } else if (fx === 'dome' && r.kind === 'pir') setEm(m, 0xff3b30, r.motion ? 0.85 : 0);
        else if (fx === 'standin') {
          const name = m.userData.stand;
          const show = !!(name && !have[name]);
          m.visible = show;
          if (!show) return;
          if (name === 'flashlight') setEm(m, 0xfff2a8, Math.max(0, Math.min(1, Math.log10(Math.max(1, (r.lux || 0) + 1)) / 4.2)));
          else if (name === 'heat') {
            const k = 0.65 + Math.max(0, Math.min(1, ((r.temp || 0) - 18) / 42));
            if (m.scale && m.scale.set) m.scale.set(k, k, k);
            setEm(m, 0xff9f1c, k);
          } else if (name === 'humid' && m.material) m.material.opacity = 0.25 + 0.6 * Math.max(0, Math.min(1, ((r.hum || 0) - 40) / 60));
          else if (name === 'block') setEm(m, 0x4c7dff, r.dist < 390 ? 0.5 : 0);
          else if (name === 'mover') setEm(m, 0xffd34d, r.motion ? 0.75 : 0);
        }
      });
    }
  }
  function paintLive() {
    try { paintWorldLive(); } catch (e) { /* world tint must not stop the frame */ }
    if (view !== 'schema') {
      if (readEl) readEl.hidden = true;
      return;
    }
    try { paintSchemaLive(); } catch (e) { /* schematic tint must not stop the frame */ }
    if (readEl) { readEl.hidden = false; readEl.textContent = schemaReadout(); }
  }

  api.show = show;
  api.paintLive = paintLive;
  api.onOpen = () => {
    dirty = true; schemaSig = null; selected = null; hoverPick = null; drag = null;
    if (active) { rebuild(); if (view === 'schema') refreshSchema(true); applyReadings(proj()); updateZones(); }
  };
  api.setView = setView;
  api.schemaCount = () => schemaPartNodes().length;
  api.schemaDetail = () => schemaPartNodes().map(c => ({
    id: c.userData.id, type: c.userData.type, kind: c.userData.kind, n: c.children.length,
    x: c.position.x, y: c.position.y, z: c.position.z, yaw: c.rotation.y
  }));
  api.schemaWireCount = () => {
    if (!schemaRoot) return 0;
    const g = schemaRoot.children.find(c => c.userData && c.userData.role === 'wires');
    return g ? g.children.length : 0;
  };
  api.schemaWireInfo = () => {
    if (!schemaRoot) return [];
    const g = schemaRoot.children.find(c => c.userData && c.userData.role === 'wires');
    if (!g) return [];
    return g.children.map(c => ({
      y: c.position.y,
      r: c.userData && c.userData.r,
      sag: c.userData && c.userData.sag
    }));
  };
  api.schemaLive = () => schemaPartNodes().map(c => ({ id: c.userData.id, type: c.userData.type, live: c.userData.live || null }));
  api.viewDistance = () => {
    if (!camera || !controls || !camera.position.distanceTo) return 0;
    return camera.position.distanceTo(controls.target);
  };
  api.schemaScreen = id => {
    if (!schemaRoot) return null;
    const g = schemaPartNodes().find(c => c.userData && c.userData.id === id);
    if (!g) return null;
    return screenOf({ x: g.position.x, y: g.position.y + 8, z: g.position.z });
  };
  Object.defineProperty(api, 'view', { get() { return view; } });
  api.zoneKeys = () => zoneKeys.slice();
  api.removeSelected = removeSelected;
  api.yawSelected = yawSelected;
  api.screenPos = (role, id) => { const w = world(); if (!w) return null; const o = (role === 'sensor' ? w.sensors : w.stimuli).find(x => x.id === id); return screenOf(o); };
  Object.defineProperty(api, 'active', { get() { return active; } });
  if (window.__sim) api.onOpen();
})();
