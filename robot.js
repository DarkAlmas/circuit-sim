/* v9: «Робот-машинка» — трасса (растр 2 мм), пресеты, лучи дальномеров и прогон машинки на Devices.car.
 * Чистая логика без DOM: работает в браузере (window.Robot) и в Node (тесты). Координаты поля в мм, ось y вверх. */
(function (root) {
  'use strict';
  const FIELD = { w: 2000, h: 1400 }, CELL = 2, GW = FIELD.w / CELL, GH = FIELD.h / CELL;
  const PRESETS = { oval: 'Овал', eight: 'Восьмёрка', zigzag: 'Зигзаг', cross: 'С перекрёстком' };
  const CX = 1000, CY = 700;
  const ell = (t, a = 700, b = 450) => [CX + a * Math.cos(t), CY + b * Math.sin(t)];
  const loop = (f, n) => { const o = []; for (let i = 0; i <= n; i++) o.push(f(i / n * 2 * Math.PI).map(v => Math.round(v))); return o; };
  function chaikin(pts, k) { for (let j = 0; j < k; j++) { const o = [pts[0]]; for (let i = 0; i < pts.length - 1; i++) { const [a, b] = [pts[i], pts[i + 1]];
    o.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]], [0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]]); } o.push(pts[pts.length - 1]); pts = o; }
    return pts.map(q => q.map(Math.round)); }
  function preset(name) {
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
  const ROLE = d => d.motor ? 'wheel' : d.mcu ? 'board' : d.sensor === 'vl53' || d.sensor === 'sonar' ? 'dist' : d.source && /liion|battery/i.test(d.name + (d.prefix || '')) ? 'bat' : null;
  function roleOf(P, type) { const d = P[type]; if (!d) return null; if (type === 'tcrt5000') return 'line'; if (type === 'liion' || d.prefix === 'BT') return 'bat'; return ROLE(d); }
  /* default chassis placement for a schematic part (body coords mm: x forward, y left) */
  function defaultMounts(proj, P) { const out = [], cnt = {};
    for (const p of proj.parts) { const r = roleOf(P, p.type); if (!r) continue; const i = cnt[r] = (cnt[r] || 0) + 1;
      if (r === 'wheel' && i > 2) continue;
      const pos = r === 'wheel' ? [0, i === 1 ? 72 : -72] : r === 'line' ? [76, 0] : r === 'dist' ? [92, (i - 1) * 30] : r === 'bat' ? [-42, (i - 1) * 26 - 0] : r === 'board' ? [22, (i - 1) * 30] : [0, 0];
      out.push({ part: p.id, x: pos[0], y: pos[1] }); }
    const ls = out.filter(m => roleOf(P, (proj.parts.find(p => p.id === m.part) || {}).type) === 'line');
    ls.forEach((m, i) => { m.y = Math.round((((ls.length - 1) / 2) - i) * 16); });
    return out; }
  /* one run of the car on the track. parts: proj.parts (live objects with _st and props) */
  function create(proj, P, Devices) {
    const R = proj.robot, byId = id => proj.parts.find(p => p.id === id), ms = R.mounts.map(m => ({ ...m, p: byId(m.part) })).filter(m => m.p);
    const role = m => roleOf(P, m.p.type), wheels = ms.filter(m => role(m) === 'wheel'), lines = ms.filter(m => role(m) === 'line'), dists = ms.filter(m => role(m) === 'dist');
    const wl = wheels.slice().sort((a, b) => b.y - a.y), L = wl[0], Rw = wl.length > 1 ? wl[wl.length - 1] : null;
    const track = L && Rw ? Math.max(0.04, Math.abs(L.y - Rw.y) / 1000) : 0.13, st = R.track.start;
    const rangeOf = m => m.p.type === 'vl53l0x' ? 2 : 4; // VL53L0X ≈ 2 м, HC-SR04 ≈ 4 м
    const car = Devices.car({ track, wheelR: 0.033, mass: 0.35 + 0.05 * ms.length, x: st.x / 1000, y: st.y / 1000, th: st.th, sensors: lines.map(m => ({ x: m.x / 1000, y: m.y / 1000 })),
      rangers: dists.map(m => ({ x: m.x / 1000, y: m.y / 1000, dir: m.dir || 0, max: rangeOf(m) })) });
    const hit = hitter(R.obstacles);
    const grid = raster(R.track), sample = sampler(grid);
    const run = { car, grid, sample, lines, dists, L, R: Rw, track, t: 0, dist: 0, offs: 0, off: false, trail: [], lap: null, laps: [], wasFar: false, rpmL: 0, rpmR: 0, dvals: {},
      step(dt) { const rl = L && L.p._st ? L.p._st.rpm || 0 : 0, rr = Rw && Rw.p._st ? Rw.p._st.rpm || 0 : 0; run.rpmL = rl; run.rpmR = rr;
        const n = Math.max(1, Math.ceil(dt / 0.01)), h = dt / n, x0 = car.x, y0 = car.y;
        for (let i = 0; i < n; i++) { car.step(rl, rr, h, sample, hit);
          // field border is a wall: the car stops at it (keeps turning in place) instead of driving off into the void
          const m = 0.06; car.x = Math.max(m, Math.min(FIELD.w / 1000 - m, car.x)); car.y = Math.max(m, Math.min(FIELD.h / 1000 - m, car.y)); }
        car.step(rl, rr, 0, sample, hit); // dt=0: no motion, just re-read the sensors at the final (wall-clamped) pose
        run.t += dt; run.dist += Math.hypot(car.x - x0, car.y - y0) * 1000;
        run.sense();
        const raw = lines.length ? car.vals.some(v => v.refl < 0.5) || sample(car.x, car.y) < 0.5 : sample(car.x, car.y) < 0.5;
        // a short wiggle between the sensors is normal line following; "off the line" = no black under any sensor for > 0.25 s
        run.lost = raw ? 0 : (run.lost || 0) + dt; const onLine = run.lost <= 0.25;
        if (!onLine && !run.off && run.dist > 20) run.offs++; run.off = !onLine;
        const X = Math.round(car.x * 1000), Y = Math.round(car.y * 1000), lt = run.trail[run.trail.length - 1];
        if (!lt || Math.hypot(lt[0] - X, lt[1] - Y) > 4) { run.trail.push([X, Y, onLine ? 1 : 0]); if (run.trail.length > 6000) run.trail.splice(0, 1000); }
        const far = Math.hypot(X - st.x, Y - st.y); if (far > 300) run.wasFar = true;
        const dth = Math.abs(((car.th - st.th) % (2 * Math.PI) + 3 * Math.PI) % (2 * Math.PI) - Math.PI); // lap = back at the start AND heading the same way (the eight crosses its start twice)
        if (run.wasFar && far < 70 && run.dist > 1000 && dth < Math.PI / 3) { run.wasFar = false; const lap = { time: run.t - (run.lapStart || 0), offs: run.offs - (run.lapOffs || 0) }; run.laps.push(lap); run.lap = lap; run.lapStart = run.t; run.lapOffs = run.offs; }
        return run; },
      // v10: sensors are computed by Devices.car after the step, so the schematic sees them in this very frame (no lag).
      // TCRT D0 comparator is pre-set from the same formula as parts3.js (a0 = U·Rpt/(Rpt+10k) < thr·U), so the sketch reads it now, not next frame.
      sense() { lines.forEach((m, i) => { const v = car.vals[i]; if (!v) return; const refl = Math.max(0, Math.min(1, v.refl)); m.p.props.refl = refl;
          const rpt = Math.max(200, 1 / Math.max(1e-7, Devices.tcrtCurrent ? Devices.tcrtCurrent(refl) : 1e-3 * refl)), low = rpt / (rpt + 10000) < +(m.p.props.thr ?? 0.5);
          if (m.p._low !== undefined || low) m.p._low = low; });
        dists.forEach((m, i) => { const r = car.dist[i]; if (!r) return; const d = r.d * 1000; run.dvals[m.part] = d;
          if (m.p.type === 'vl53l0x') m.p.props.mm = Math.max(30, Math.min(2000, Math.round(d))); else m.p.props.dist = Math.max(2, Math.min(400, Math.round(d / 10))); }); },
      // «На старт» / drag on pause: Devices.car.reset() (with a pose it also becomes the new start)
      reset(pose) { if (pose) { car.reset({ x: pose.x / 1000, y: pose.y / 1000, th: pose.th }); st.x = pose.x; st.y = pose.y; st.th = pose.th; } else car.reset();
        Object.assign(run, { t: 0, dist: 0, offs: 0, off: false, lost: 0, trail: [], lap: null, laps: [], wasFar: false, lapStart: 0, lapOffs: 0, _shown: false, _nl: 0 });
        car.step(0, 0, 0, sample, hit); run.sense(); return run; } };
    car.step(0, 0, 0, sample, hit); run.sense();
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
  const api = { FIELD, CELL, GW, GH, PRESETS, preset, raster, sampler, raycast, hitter, roleOf, defaultMounts, create, chaikin };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Robot = api;
})(typeof window !== 'undefined' ? window : globalThis);
