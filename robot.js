/* v9: «Робот-машинка» — трасса (растр 2 мм), пресеты, лучи дальномеров и прогон машинки на Devices.car.
 * Чистая логика без DOM: работает в браузере (window.Robot) и в Node (тесты). Координаты поля в мм, ось y вверх. */
(function (root) {
  'use strict';
  const FIELD = { w: 2000, h: 1400 }, CELL = 2, GW = FIELD.w / CELL, GH = FIELD.h / CELL;
  const PRESETS = { oval: 'Овал', eight: 'Восьмёрка', zigzag: 'Зигзаг', cross: 'С перекрёстком', maze: '🧩 Лабиринт', avoid: '🚧 Объезд препятствий', park: '🅿 Парковка у стены' };
  /* v13: tasks without a line — walls/boxes are obstacles (centre x,y, w,h in mm, ≤400 each), the goal is checked in run.step */
  const bar = (x0, x1, y, h = 40) => { const o = []; for (let x = x0; x < x1; x += 400) { const w = Math.min(400, x1 - x); o.push({ x: x + w / 2, y, w, h }); } return o; };
  const TASKS = {
    maze: { preset: 'maze', w: 20, strokes: [], start: { x: 220, y: 220, th: 0 }, obstacles: [...bar(0, 1600, 450), ...bar(400, 2000, 900)], task: { kind: 'maze', goal: { x: 1750, y: 1150, r: 160 } } },
    avoid: { preset: 'avoid', w: 20, strokes: [], start: { x: 200, y: 700, th: 0 }, obstacles: [{ x: 700, y: 640, w: 160, h: 160 }, { x: 1150, y: 1000, w: 200, h: 160 }, { x: 1250, y: 350, w: 160, h: 200 }, { x: 1650, y: 750, w: 160, h: 220 }], task: { kind: 'avoid', dist: 3000 } },
    park: { preset: 'park', w: 20, strokes: [], start: { x: 400, y: 700, th: 0 }, obstacles: [{ x: 1730, y: 700, w: 60, h: 400 }], task: { kind: 'park', lo: 50, hi: 150 } } };
  const CX = 1000, CY = 700;
  const ell = (t, a = 700, b = 450) => [CX + a * Math.cos(t), CY + b * Math.sin(t)];
  const loop = (f, n) => { const o = []; for (let i = 0; i <= n; i++) o.push(f(i / n * 2 * Math.PI).map(v => Math.round(v))); return o; };
  function chaikin(pts, k) { for (let j = 0; j < k; j++) { const o = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]];
    o.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]); } o.push(pts[pts.length - 1]); pts = o; }
    return pts.map(q => q.map(Math.round)); }
  function preset(name) {
    if (TASKS[name]) return JSON.parse(JSON.stringify(TASKS[name]));
    if (name === 'eight') return { preset: name, w: 30, strokes: [loop(t => [CX + 700 * Math.sin(t), CY + 420 * Math.sin(2 * t)], 160)], start: { x: CX, y: CY, th: Math.atan2(840, 700) } };
    if (name === 'zigzag') { const p = [[1000, 300], [1700, 300], [1700, 1100], [1450, 800], [1200, 1100], [950, 800], [700, 1100], [450, 800], [300, 1100], [300, 300], [1000, 300]];
      return { preset: name, w: 30, strokes: [chaikin(p, 4)], start: { x: 1000, y: 300, th: 0 } }; }
    if (name === 'cross') { const t = -2.2, s = ell(t);
      return { preset: name, w: 30, strokes: [loop(ell, 120), [[CX, 120], [CX, 1280]]], start: { x: Math.round(s[0]), y: Math.round(s[1]), th: Math.atan2(450 * Math.cos(t), -700 * Math.sin(t)) } }; }
    return { preset: 'oval', w: 30, strokes: [loop(ell, 120)], start: { x: CX, y: CY - 450, th: 0 } };
  }
  /* black line raster: 1 byte per 2×2 mm cell */
  function raster(track) { const g = new Uint8Array(GW * GH), r = Math.max(2, (track.w || 20) / 2) / CELL, ri = Math.ceil(r);
    const disc = (x, y) => { const cx = x / CELL, cy = y / CELL; for (let j = -ri; j <= ri; j++) for (let i = -ri; i <= ri; i++) { if (i * i + j * j > r * r) continue;
      const gx = Math.round(cx + i), gy = Math.round(cy + j); if (gx >= 0 && gy >= 0 && gx < GW && gy < GH) g[gy * GW + gx] = 1; } };
    for (const s of track.strokes || []) { if (s.length === 1) disc(s[0][0], s[0][1]);
      for (let k = 0; k < s.length - 1; k++) { const [x1, y1] = s[k], [x2, y2] = s[k + 1], n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / CELL));
        for (let t = 0; t <= n; t++) disc(x1 + (x2 - x1) * t / n, y1 + (y2 - y1) * t / n); } }
    return g; }
  /* reflectance of a ~6 mm spot: white paper 0.9, black tape 0.05; off the field (floor) 0.3 */
  function sampler(g) { return (xm, ym) => { const gx = Math.round(xm * 1000 / CELL), gy = Math.round(ym * 1000 / CELL); let b = 0, n = 0;
    for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) { const x = gx + i, y = gy + j; n++; if (x < 0 || y < 0 || x >= GW || y >= GH) b += 0.7; else b += g[y * GW + x]; }
    return +(0.9 - 0.85 * b / n).toFixed(3); }; }
  /* distance (mm) from (x,y) along th to the first box or the field edge (walls), capped at max */
  function raycast(x, y, th, obstacles, max = 2000) { const c = Math.cos(th), s = Math.sin(th);
    for (let d = 0; d <= max; d += 4) { const px = x + c * d, py = y + s * d;
      if (px < 0 || py < 0 || px > FIELD.w || py > FIELD.h) return d;
      for (const o of obstacles || []) if (Math.abs(px - o.x) <= o.w / 2 && Math.abs(py - o.y) <= o.h / 2) return d; }
    return max; }
  const ROLE = d => d.display === 'servo' ? 'servo' : d.sensor === 'imu' ? 'imu' : /Драйвер моторов/.test(d.name || '') ? 'driver' : d.motor ? 'wheel' : d.mcu ? 'board' : d.sensor === 'vl53' || d.sensor === 'sonar' ? 'dist' : d.source && /liion|battery/i.test(d.name + (d.prefix || '')) ? 'bat' : null;
  function roleOf(P, type) { const d = P[type]; if (!d) return null; if (type === 'tcrt5000') return 'line'; if (type === 'liion' || d.prefix === 'BT') return 'bat'; return ROLE(d); }
  /* default chassis placement for a schematic part (body coords mm: x forward, y left) */
  function defaultMounts(proj, P) { const out = [], cnt = {};
    for (const p of proj.parts) { const r = roleOf(P, p.type); if (!r) continue; const i = cnt[r] = (cnt[r] || 0) + 1;
      if (r === 'wheel' && i > 2) continue;
      const pos = r === 'wheel' ? [0, i === 1 ? 72 : -72] : r === 'line' ? [76, 0] : r === 'dist' ? [92, (i - 1) * 30] : r === 'bat' ? [-42, (i - 1) * 26 - 0] : r === 'board' ? [22, (i - 1) * 30] : r === 'driver' ? [-20, (i - 1) * 40] : r === 'servo' ? [60, 0] : r === 'imu' ? [0, -40] : [0, 0];
      out.push({ part: p.id, x: pos[0], y: pos[1] }); }
    const ls = out.filter(m => roleOf(P, (proj.parts.find(p => p.id === m.part) || {}).type) === 'line');
    ls.forEach((m, i) => { m.y = Math.round((((ls.length - 1) / 2) - i) * 16); });
    return out; }
  /* one run of the car on the track. parts: proj.parts (live objects with _st and props).
     v13: Devices.vehicle — any wheel layout from the drive card (or the two legacy motor mounts), servo steering, body vs boxes/walls, MPU6050 */
  const CH = () => root.Chassis || (typeof require === 'function' ? require('./chassis.js') : null);
  const toM = o => ({ x: (o.x - o.w / 2) / 1000, y: (o.y - o.h / 2) / 1000, w: o.w / 1000, h: o.h / 1000 });
  const WALLS = [{ x: -1, y: -1, w: 1, h: FIELD.h / 1000 + 2 }, { x: FIELD.w / 1000, y: -1, w: 1, h: FIELD.h / 1000 + 2 }, { x: -1, y: -1, w: FIELD.w / 1000 + 2, h: 1 }, { x: -1, y: FIELD.h / 1000, w: FIELD.w / 1000 + 2, h: 1 }];
  function frontOf(C, r) { const s = C.shape(r); return s.kind === 'round' ? s.r : s.kind === 'rect' ? s.l / 2 : Math.max(...s.poly.map(p => p[0])); }
  function create(proj, P, Devices) {
    const C = CH(), R = proj.robot, byId = id => proj.parts.find(p => p.id === id), ms = R.mounts.map(m => ({ ...m, p: byId(m.part) })).filter(m => m.p);
    const role = m => roleOf(P, m.p.type), motors = ms.filter(m => role(m) === 'wheel'), lines = ms.filter(m => role(m) === 'line'), dists = ms.filter(m => role(m) === 'dist'), imus = ms.filter(m => role(m) === 'imu');
    const st = R.track.start, wh = C.vehicleWheels(R, motors), front = frontOf(C, R), task = (TASKS[R.track.preset] || {}).task || null, hasLine = R.track.strokes.length > 0;
    const rangeOf = m => m.p.type === 'vl53l0x' ? 2 : 4; // VL53L0X ≈ 2 м, HC-SR04 ≈ 4 м
    const car = Devices.vehicle({ wheels: wh.map(q => q.w), tau: 0.05, body: C.vehicleBody(R), obstacles: [], x: st.x / 1000, y: st.y / 1000, th: st.th, sensors: lines.map(m => ({ x: m.x / 1000, y: m.y / 1000 })),
      rangers: dists.map(m => ({ x: m.x / 1000, y: m.y / 1000, dir: m.dir || 0, max: rangeOf(m) })) });
    const hit = hitter(R.obstacles);
    const grid = raster(R.track), sample = sampler(grid);
    const L = motors.find(m => m.part === wh[0].part) || null, Rw = wh[1] ? motors.find(m => m.part === wh[1].part) || null : null;
    const rpmOf = q => { const m = q.part && byId(q.part); return m && m._st ? m._st.rpm || 0 : null; };
    const servo = () => proj.parts.find(p => P[p.type].display === 'servo');
    const run = { car, grid, sample, lines, dists, imus, wheels: wh, L, R: Rw, task, t: 0, dist: 0, offs: 0, off: false, trail: [], lap: null, laps: [], wasFar: false, rpmL: 0, rpmR: 0, dvals: {}, hd: [],
      bumps: 0, flashT: -1, done: null, still: 0, steer: 0, _lb: -9,
      step(dt) { const rpm = wh.map(rpmOf), sv = servo(), sa = C.steerOf(sv && sv._mod ? sv._mod.a : 90), steer = wh.map(q => (q.ang || 0) + (q.steer ? sa : 0));
        run.steer = wh.some(q => q.steer) ? sa : 0; run.rpm = rpm; run.rpmL = rpm[0] || 0; run.rpmR = rpm[1] || 0;
        car.obstacles = R.obstacles.map(toM).concat(WALLS); // boxes can be moved/added live
        const n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n, x0 = car.x, y0 = car.y;
        for (let i = 0; i < n; i++) { car.drive(rpm, steer, h, sample, hit);
          if (car.bump) { const tb = run.t + i * h; if (tb - run._lb > 0.3) { run.bumps++; run.flashT = tb; } run._lb = tb; } // pressing against a wall = one bump
          const m = 0.03; car.x = Math.max(m, Math.min(FIELD.w / 1000 - m, car.x)); car.y = Math.max(m, Math.min(FIELD.h / 1000 - m, car.y)); }
        car.step(0, 0, 0, sample, hit); // no motion, just re-read the sensors at the final pose
        run.t += dt; const dd = Math.hypot(car.x - x0, car.y - y0) * 1000; run.dist += dd;
        run.hd.push([run.t, car.th]); if (run.hd.length > 20000) run.hd.splice(0, 5000);
        run.sense();
        let onLine = true;
        if (hasLine) { const raw = lines.length ? car.vals.some(v => v.refl < 0.5) || sample(car.x, car.y) < 0.5 : sample(car.x, car.y) < 0.5;
          run.lost = raw ? 0 : (run.lost || 0) + dt; onLine = run.lost <= 0.25;
          if (!onLine && !run.off && run.dist > 20) run.offs++; run.off = !onLine; }
        const X = Math.round(car.x * 1000), Y = Math.round(car.y * 1000), lt = run.trail[run.trail.length - 1];
        if (!lt || Math.hypot(lt[0] - X, lt[1] - Y) > 4) { run.trail.push([X, Y, onLine ? 1 : 0]); if (run.trail.length > 6000) run.trail.splice(0, 1000); }
        if (hasLine) { const far = Math.hypot(X - st.x, Y - st.y); if (far > 300) run.wasFar = true;
          const dth = Math.abs(((car.th - st.th) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI);
          if (run.wasFar && far < 70 && run.dist > 1000 && dth < Math.PI / 3) { run.wasFar = false; const lap = { time: run.t - (run.lapStart || 0), offs: run.offs - (run.lapOffs || 0) }; run.laps.push(lap); run.lap = lap; run.lapStart = run.t; run.lapOffs = run.offs; } }
        run.still = dd / Math.max(dt, 1e-6) < 5 ? run.still + dt : 0; // < 5 mm/s
        if (task && !run.done) run.judge(X, Y);
        return run; },
      gap() { return Math.max(0, hit(car.x, car.y, Math.cos(car.th), Math.sin(car.th), 3) * 1000 - front); },
      judge(X, Y) { const k = task.kind, tt = run.t.toFixed(1) + ' с';
        if (k === 'maze' && Math.hypot(X - task.goal.x, Y - task.goal.y) < task.goal.r) run.done = { ok: true, msg: '🏁 Лабиринт пройден за ' + tt + ' · ударов: ' + run.bumps };
        if (k === 'avoid') { if (run.bumps) run.done = { ok: false, msg: '💥 Столкновение на ' + Math.round(run.dist) + ' мм — попробуй объезжать раньше' };
          else if (run.dist >= task.dist) run.done = { ok: true, msg: '🏁 Проехал ' + (task.dist / 1000) + ' м без столкновений за ' + tt }; }
        if (k === 'park') { if (run.bumps) run.done = { ok: false, msg: '💥 Удар о стену — тормози раньше' };
          else if (run.still >= 1 && run.t > 1.5) { const g = Math.round(run.gap()); if (g >= task.lo && g <= task.hi) run.done = { ok: true, msg: '🅿 Припарковался: ' + g + ' мм до стены за ' + tt }; } } },
      sense() { lines.forEach((m, i) => { const v = car.vals[i]; if (!v) return; const refl = Math.max(0, Math.min(1, v.refl)); m.p.props.refl = refl;
          const rpt = Math.max(200, 1 / Math.max(1e-7, Devices.tcrtCurrent ? Devices.tcrtCurrent(refl) : 1e-3 * refl)), low = rpt / (rpt + 10000) < +(m.p.props.thr ?? 0.5);
          if (m.p._low !== undefined || low) m.p._low = low; });
        dists.forEach((m, i) => { const r = car.dist[i]; if (!r) return; const d = r.d * 1000; run.dvals[m.part] = d;
          if (m.p.type === 'vl53l0x') m.p.props.mm = Math.max(30, Math.min(2000, Math.round(d))); else m.p.props.dist = Math.max(2, Math.min(400, Math.round(d / 10))); });
        const im = car.imu; if (im) for (const m of imus) { m.p.props.gz = Math.max(-250, Math.min(250, Math.round(im.gz * 1800 / Math.PI) / 10)); m.p.props.acc = Math.max(-2, Math.min(2, Math.round(im.ax / 9.80665 * 1000) / 1000)); } },
      reset(pose) { if (pose) { car.reset({ x: pose.x / 1000, y: pose.y / 1000, th: pose.th }); st.x = pose.x; st.y = pose.y; st.th = pose.th; } else car.reset();
        Object.assign(run, { t: 0, dist: 0, offs: 0, off: false, lost: 0, trail: [], hd: [], lap: null, laps: [], wasFar: false, lapStart: 0, lapOffs: 0, _shown: false, _nl: 0, bumps: 0, flashT: -1, done: null, still: 0, _lb: -9 });
        car.imu = { gz: 0, ax: 0, ay: 0 }; car.step(0, 0, 0, sample, hit); run.sense(); return run; } };
    car.imu = { gz: 0, ax: 0, ay: 0 }; car.step(0, 0, 0, sample, hit); run.sense();
    return run; }
  /* ray vs boxes (mm) and field walls, in metres for Devices.car: hit(x,y,dx,dy,max) -> distance or Infinity */
  function hitter(obstacles) { const bx = (obstacles || []).map(o => [(o.x - o.w / 2) / 1000, (o.y - o.h / 2) / 1000, (o.x + o.w / 2) / 1000, (o.y + o.h / 2) / 1000]);
    bx.push([-1, -1, 0, FIELD.h / 1000 + 1], [FIELD.w / 1000, -1, FIELD.w / 1000 + 1, FIELD.h / 1000 + 1], [-1, -1, FIELD.w / 1000 + 1, 0], [-1, FIELD.h / 1000, FIELD.w / 1000 + 1, FIELD.h / 1000 + 1]);
    return (x, y, dx, dy, max) => { let best = Infinity;
      for (const [x0, y0, x1, y1] of bx) { let t0 = 0, t1 = max, ok = true;
        for (const [p, d, lo, hi] of [[x, dx, x0, x1], [y, dy, y0, y1]]) {
          if (Math.abs(d) < 1e-12) { if (p < lo || p > hi) { ok = false; break; } continue; }
          let a = (lo - p) / d, b = (hi - p) / d; if (a > b) [a, b] = [b, a]; t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) { ok = false; break; } }
        if (ok && t0 < best) best = t0; }
      return best; }; }
  /* v11: heading jitter = RMS of (turn rate − its 0.5 s moving average), rad/s. Smooth driving ≈ 0; bang-bang wiggle is large.
     hd: [[t, th], …] (th unwrapped here); from: skip the first seconds (start-up) */
  function jitter(hd, from = 0, win = 0.5) { const s = hd.filter(q => q[0] >= from); if (s.length < 3) return 0; const w = [];
    for (let i = 1; i < s.length; i++) { const dt = s[i][0] - s[i - 1][0]; if (dt <= 0) continue; let d = s[i][1] - s[i - 1][1]; d = ((d + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI; w.push([s[i][0], d / dt]); }
    let sum = 0, n = 0, a = 0, b = 0, acc = 0;
    for (let i = 0; i < w.length; i++) { const t = w[i][0];
      while (b < w.length && w[b][0] <= t + win / 2) acc += w[b++][1];
      while (w[a][0] < t - win / 2) acc -= w[a++][1];
      const m = acc / (b - a), e = w[i][1] - m; sum += e * e; n++; }
    return n ? Math.sqrt(sum / n) : 0; }
  const api = { TASKS, jitter, FIELD, CELL, GW, GH, PRESETS, preset, raster, sampler, raycast, hitter, roleOf, defaultMounts, create, chaikin };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Robot = api;
})(typeof window !== 'undefined' ? window : globalThis);
