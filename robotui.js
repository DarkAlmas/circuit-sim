/* v9: UI «Робот-машинка» — вкладки «Схема / Шасси / Трасса», конструктор шасси и трасса на canvas.
 * Только createElement/textContent и canvas (без innerHTML). Данные проекта — proj.robot (проверяется в sanitize.js). */
(function () {
  'use strict';
  const R = window.Robot, P = window.PARTS, $ = s => document.querySelector(s);
  const el = (tag, props, kids) => { const e = document.createElement(tag); Object.assign(e, props || {}); for (const k of kids || []) e.append(k); return e; };
  let S = null, tab = 'schema', run = null, paused = true, last = 0, raf = 0, dragM = null, brush = null, mode = 'move', grid = null, gridSig = '';
  const sim = () => window.__sim, proj = () => sim().proj;
  const isCar = p => !!(p && (p.robot || p.kind === 'car'));
  /* --- DOM --- */
  const center = $('#center'), tabs = el('div', { id: 'rtabs', hidden: true });
  const tb = {}; for (const [k, t] of [['schema', 'Схема'], ['chassis', 'Шасси'], ['track', 'Трасса']]) { tb[k] = el('button', { textContent: t }); tb[k].dataset.rtab = k; tb[k].onclick = () => show(k); tabs.append(tb[k]); }
  const pane = el('div', { id: 'rpane', hidden: true }), bar = el('div', { className: 'rbar' }), cv = el('canvas', { id: 'rcanvas' }), sum = el('div', { id: 'rsum', hidden: true }), sens = el('div', { id: 'rsens' });
  pane.append(bar, cv, sens, sum); center.prepend(tabs); center.append(pane);
  const g = cv.getContext('2d');
  // chassis toolbar
  const opt = (s, list) => { for (const [v, t] of list) s.append(el('option', { value: v, textContent: t })); return s; };
  const selBody = opt(el('select', { id: 'rBody', title: 'Корпус' }), [['rect', '▭ Прямоугольная'], ['round', '◯ Круглая']]);
  const selMat = opt(el('select', { id: 'rMat', title: 'Материал' }), [['acrylic', 'Акрил'], ['black', 'Чёрный пластик']]);
  const bCaster = el('button', { id: 'rCaster', textContent: '◉ Шаровая опора' }), chHint = el('span', { className: 'rhint', textContent: 'Перетаскивай детали по платформе. Выделение связано со «Схемой».' });
  const inDir = el('input', { id: 'rDir', type: 'number', min: '-180', max: '180', step: '15', title: 'Направление датчика расстояния, ° (0 — вперёд, 90 — влево, −90 — вправо)' });
  const dirW = el('label', { className: 'rdir', hidden: true }, [el('span', { textContent: '📏 Направление, °' }), inDir]);
  const chBar = el('div', { className: 'rgrp', id: 'rChBar' }, [selBody, selMat, bCaster, dirW, chHint]);
  const selDist = () => { const r = proj().robot, id = sim().sel && sim().sel.part; return r && id ? r.mounts.find(m => m.part === id && roleOf(m.part) === 'dist') : null; };
  // track toolbar
  const selPre = opt(el('select', { id: 'rPreset', title: 'Готовая трасса' }), [['', 'Трасса…'], ...Object.entries(R.PRESETS)]);
  const bBrush = el('button', { id: 'rBrush', textContent: '🖌 Кисть' }), bBox = el('button', { id: 'rBox', textContent: '📦 Коробка' }), bClear = el('button', { id: 'rClear', textContent: '🧽 Очистить' });
  const bPlay = el('button', { id: 'rPlay', className: 'go', textContent: '▶' }), bPause = el('button', { id: 'rPause', textContent: '⏸' }), bReset = el('button', { id: 'rReset', textContent: '⟲ На старт' });
  const spd = el('input', { id: 'rSpeed', type: 'range', min: '0.5', max: '4', step: '0.5', value: '1', title: 'Скорость симуляции' }), spdL = el('span', { className: 'rspd', textContent: '×1' });
  // v11: live PID sliders — the sketch reads them with param("kp"/"kd"/"base") every loop, so a change acts immediately
  const TUNE = [['kp', 'Kp', 0, 300, 1], ['kd', 'Kd', 0, 300, 1], ['base', 'База', 0, 255, 5]], tIn = {}, tOut = {};
  const pidW = el('div', { className: 'rpid', hidden: true }, TUNE.map(([k, t, lo, hi, st]) => { tIn[k] = el('input', { id: 'rT' + k, type: 'range', min: String(lo), max: String(hi), step: String(st), title: t });
    tOut[k] = el('span', { className: 'rpidv' }); return el('label', {}, [el('span', { textContent: t }), tIn[k], tOut[k]]); }));
  const trBar = el('div', { className: 'rgrp', id: 'rTrBar' }, [selPre, bBrush, bBox, bClear, bPlay, bPause, bReset, el('label', { className: 'rspdw' }, [spd, spdL]), pidW]);
  for (const [k, , lo, hi] of TUNE) tIn[k].oninput = () => { const r = proj().robot; if (!r || !r.tune) return; const v = Number(tIn[k].value);
    if (!Number.isFinite(v)) return; r.tune[k] = Math.max(lo, Math.min(hi, v)); tOut[k].textContent = String(r.tune[k]); save(); };
  bar.append(chBar, trBar);
  /* --- data --- */
  function ensure() { const p = proj(); if (!isCar(p)) return null;
    if (!p.robot) p.robot = sanitizeProject({ parts: p.parts.map(q => ({ ...q })), wires: [], robot: { mounts: [], track: { preset: 'oval' } } }).robot || { body: 'rect', mat: 'acrylic', mounts: [], caster: true, track: { preset: 'oval', w: 20, strokes: [], start: { x: 1000, y: 250, th: 0 } }, obstacles: [], speed: 1 };
    const r = p.robot;
    if (!r.track.strokes.length && r.track.preset) { const pr = R.preset(r.track.preset); r.track.strokes = pr.strokes; r.track.start = pr.start; }
    // keep mounts in sync with the schematic: drop removed parts, add new chassis-able ones
    const ids = new Set(p.parts.map(q => q.id)); r.mounts = r.mounts.filter(m => ids.has(m.part));
    const have = new Set(r.mounts.map(m => m.part)), def = R.defaultMounts(p, P);
    for (const m of def) if (!have.has(m.part)) r.mounts.push(m);
    return r; }
  const save = () => { const s = sim(); if (s.changed) s.changed(); };
  /* --- tabs --- */
  function show(k) { tab = k; for (const b of Object.values(tb)) b.classList.toggle('on', b.dataset.rtab === k);
    pane.hidden = k === 'schema'; chBar.hidden = k !== 'chassis'; trBar.hidden = k !== 'track'; document.body.dataset.rtab = k;
    if (k !== 'schema') { ensure(); syncBar(); resize(); } loop(); }
  function syncBar() { const r = proj().robot; if (!r) return; selBody.value = r.body; selMat.value = r.mat; bCaster.classList.toggle('on', r.caster); selPre.value = r.track.preset || '';
    spd.value = String(r.speed); spdL.textContent = '×' + r.speed; bBrush.classList.toggle('on', mode === 'brush'); bBox.classList.toggle('on', mode === 'box');
    bPlay.disabled = !paused && sim().running; bPause.disabled = paused;
    pidW.hidden = !r.tune; if (r.tune) for (const [k] of TUNE) { if (document.activeElement !== tIn[k]) tIn[k].value = String(r.tune[k]); tOut[k].textContent = String(r.tune[k]); }
    const dm = selDist(); dirW.hidden = !dm; if (dm && document.activeElement !== inDir) inDir.value = String(Math.round((dm.dir || 0) * 180 / Math.PI)); }
  function onOpen() { const p = proj(); run = null; paused = true; sum.hidden = true; grid = null; gridSig = '';
    tabs.hidden = !isCar(p); document.body.classList.toggle('carproj', isCar(p)); if (isCar(p)) { ensure(); show(window.innerWidth < 900 ? 'track' : 'chassis'); } else show('schema'); }
  /* --- geometry --- */
  let W = 0, H = 0, dpr = 1;
  function resize() { const r = center.getBoundingClientRect(), b = bar.getBoundingClientRect(); dpr = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(100, r.width); H = Math.max(100, r.height - b.height - sens.getBoundingClientRect().height - (tabs.hidden ? 0 : tabs.getBoundingClientRect().height));
    cv.style.width = W + 'px'; cv.style.height = H + 'px'; cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); draw(); }
  window.addEventListener('resize', () => { if (tab !== 'schema') resize(); });
  // chassis view: body x forward = screen up, body y left = screen left. scale k px/mm
  const chK = () => Math.min(W, H) / 340, chToS = (x, y) => [W / 2 - y * chK(), H / 2 - x * chK()], chToB = (sx, sy) => [(H / 2 - sy) / chK(), (W / 2 - sx) / chK()];
  // track view: field mm, y up
  const trK = () => Math.min(W / R.FIELD.w, H / R.FIELD.h) * 0.98, trO = () => [(W - R.FIELD.w * trK()) / 2, (H - R.FIELD.h * trK()) / 2];
  const trToS = (x, y) => { const k = trK(), [ox, oy] = trO(); return [ox + x * k, oy + (R.FIELD.h - y) * k]; };
  const trToF = (sx, sy) => { const k = trK(), [ox, oy] = trO(); return [(sx - ox) / k, R.FIELD.h - (sy - oy) / k]; };
  const roleOf = id => { const p = proj().parts.find(q => q.id === id); return p ? R.roleOf(P, p.type) : null; };
  /* --- drawing --- */
  const SIZE = { wheel: [66, 26], line: [22, 16], dist: [18, 46], bat: [36, 18], board: [52, 28] };
  const ROT_R = 60; // v10: rotate handle of a distance sensor, mm from its mount along dir
  function drawCarBody(r, hl, rays) { const mat = r.mat === 'black' ? ['#1d1f24', '#40444d'] : ['rgba(190,225,255,0.35)', '#9fd0ff'];
    g.fillStyle = mat[0]; g.strokeStyle = mat[1]; g.lineWidth = 2; g.beginPath();
    if (r.body === 'round') g.arc(0, 0, 90, 0, Math.PI * 2); else g.roundRect ? g.roundRect(-95, -70, 190, 140, 10) : g.rect(-95, -70, 190, 140);
    g.fill(); g.stroke();
    if (r.caster) { g.fillStyle = '#c9ced6'; g.beginPath(); g.arc(-72, 0, 9, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#6a7078'; g.stroke(); }
    for (const m of r.mounts) { const ro = roleOf(m.part); if (!ro) continue; g.save(); g.translate(m.x, m.y); const on = hl === m.part;
      if (ro === 'dist') { g.rotate(m.dir || 0); if (rays) { g.strokeStyle = 'rgba(255,170,0,0.6)'; g.lineWidth = 2; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(10, 0); g.lineTo(ROT_R, 0); g.stroke(); g.setLineDash([]);
        g.fillStyle = '#ffaa00'; g.beginPath(); g.arc(ROT_R, 0, 7, 0, 7); g.fill(); } }
      if (ro === 'line') { g.fillStyle = 'rgba(255,60,60,0.18)'; g.beginPath(); g.moveTo(-4, -5); g.lineTo(18, -9); g.lineTo(18, 9); g.lineTo(-4, 5); g.fill();
        g.fillStyle = 'rgba(255,60,60,0.35)'; g.beginPath(); g.arc(18, 0, 5, 0, Math.PI * 2); g.fill(); }
      const [a, b] = SIZE[ro] || [20, 20];
      if (ro === 'wheel') { g.fillStyle = '#f3c316'; g.fillRect(-14, m.y > 0 ? -34 : 6, 28, 28); g.fillStyle = '#111'; g.fillRect(-a / 2, m.y > 0 ? 2 : -2 - b, a, b);
        g.strokeStyle = '#333'; for (let i = -30; i <= 30; i += 6) { g.beginPath(); g.moveTo(i, m.y > 0 ? 2 : -2); g.lineTo(i, m.y > 0 ? 2 + b : -2 - b); g.stroke(); } }
      else { g.fillStyle = ro === 'line' ? '#1d4fd0' : ro === 'dist' ? (P[proj().parts.find(q => q.id === m.part).type].sensor === 'vl53' ? '#6b2fb3' : '#1b6fbf') : ro === 'bat' ? '#2b6e3a' : '#22303f';
        g.fillRect(-b / 2, -a / 2, b, a); if (ro === 'dist' && a > 30) { g.fillStyle = '#ccc'; g.beginPath(); g.arc(b / 2 - 2, -11, 7, 0, 7); g.arc(b / 2 - 2, 11, 7, 0, 7); g.fill(); } }
      if (on) { g.strokeStyle = '#ffd34d'; g.lineWidth = 3; g.strokeRect(-a / 2 - 4, -a / 2 - 4, a + 8, a + 8); }
      g.restore(); } }
  function drawChassis() { const r = proj().robot, k = chK(); g.fillStyle = '#12161f'; g.fillRect(0, 0, W, H);
    g.save(); g.translate(W / 2, H / 2); g.scale(k, k); g.rotate(-Math.PI / 2); g.scale(1, -1); // body x→up, y→left
    const sl = sim().sel && sim().sel.part; drawCarBody(r, sl, true); g.restore();
    g.fillStyle = '#d8dee9'; g.font = '12px system-ui'; g.textAlign = 'center';
    for (const m of r.mounts) { const ro = roleOf(m.part); if (!ro) continue; const [sx, sy] = chToS(m.x, m.y); g.fillText(m.part + (ro === 'wheel' ? (m.y > 0 ? ' (лев.)' : ' (прав.)') : ''), sx, sy + (ro === 'wheel' ? (m.y > 0 ? 0 : 0) : 4)); }
    g.fillStyle = '#8a94a8'; g.fillText('▲ вперёд', W / 2, 16); }
  function ensureGrid(r) { const sig = JSON.stringify([r.track.w, r.track.strokes.length, r.track.strokes.reduce((a, s) => a + s.length, 0), r.track.strokes[0] && r.track.strokes[0][1]]);
    if (!grid || sig !== gridSig) { grid = R.raster(r.track); gridSig = sig; } return grid; }
  function drawTrack() { const r = proj().robot, k = trK(); g.fillStyle = '#2a2f38'; g.fillRect(0, 0, W, H);
    const [x0, y0] = trToS(0, R.FIELD.h); g.fillStyle = '#fafafa'; g.fillRect(x0, y0, R.FIELD.w * k, R.FIELD.h * k);
    g.strokeStyle = '#111'; g.lineWidth = r.track.w * k; g.lineCap = g.lineJoin = 'round';
    for (const s of r.track.strokes) { g.beginPath(); s.forEach((q, i) => { const [x, y] = trToS(q[0], q[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); if (s.length === 1) { const [x, y] = trToS(s[0][0], s[0][1]); g.lineTo(x + 0.1, y); } g.stroke(); }
    for (const o of r.obstacles) { const [x, y] = trToS(o.x - o.w / 2, o.y + o.h / 2); g.fillStyle = '#b5814a'; g.fillRect(x, y, o.w * k, o.h * k); g.strokeStyle = '#7a5228'; g.lineWidth = 1.5; g.strokeRect(x, y, o.w * k, o.h * k); }
    const st = r.track.start, [sx, sy] = trToS(st.x, st.y); g.strokeStyle = '#2ecc71'; g.lineWidth = 2; g.setLineDash([4, 3]); g.beginPath(); g.arc(sx, sy, 70 * k, 0, 7); g.stroke(); g.setLineDash([]);
    if (run) { g.lineWidth = Math.max(1.5, 4 * k); for (let i = 1; i < run.trail.length; i++) { const a = run.trail[i - 1], b = run.trail[i];
      g.strokeStyle = b[2] ? '#1fa3ff' : '#ff3030'; g.beginPath(); g.moveTo(...trToS(a[0], a[1])); g.lineTo(...trToS(b[0], b[1])); g.stroke(); } }
    const c = run ? run.car : { x: st.x / 1000, y: st.y / 1000, th: st.th }, [cx, cy] = trToS(c.x * 1000, c.y * 1000);
    g.save(); g.translate(cx, cy); g.scale(k, k); g.scale(1, -1); g.rotate(c.th); drawCarBody(r, sim().sel && sim().sel.part); g.restore();
    // v10: ray of every distance sensor (from Devices.car rangers): orange — free, red — hits a box/wall
    if (run) for (const d of run.car.dist || []) { const [ax, ay] = trToS(d.x * 1000, d.y * 1000), [bx2, by2] = trToS((d.x + Math.cos(d.dir) * d.d) * 1000, (d.y + Math.sin(d.dir) * d.d) * 1000);
      g.strokeStyle = d.hit ? 'rgba(230,40,40,0.85)' : 'rgba(255,160,0,0.6)'; g.lineWidth = 2; g.setLineDash(d.hit ? [] : [5, 4]); g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx2, by2); g.stroke(); g.setLineDash([]);
      if (d.hit) { g.fillStyle = '#e62828'; g.beginPath(); g.arc(bx2, by2, 4, 0, 7); g.fill(); } }
    // labels over the car
    const lines = []; if (run) { const ls = run.lines.map((m, i) => m.part + ' ' + (run.car.vals[i] ? run.car.vals[i].refl.toFixed(2) : '—')).join('  '); if (ls) lines.push('👁 ' + ls);
      for (const m of run.dists) lines.push('📏 ' + m.part + ' ' + Math.round(run.dvals[m.part] || 0) + ' мм' + (m.dir ? ' (' + Math.round(m.dir * 180 / Math.PI) + '°)' : ''));
      lines.push('⟳ L ' + Math.round(run.rpmL) + ' · R ' + Math.round(run.rpmR) + ' об/мин'); }
    const bat = proj().parts.find(q => q.type === 'liion'); if (bat) lines.push('🔋 ' + Math.round(100 * (bat._st && bat._st.soc != null ? bat._st.soc : bat.props.soc / 100)) + '%');
    if (run) lines.push('⏱ ' + run.t.toFixed(1) + ' с · сходов: ' + run.offs);
    sens.textContent = lines.join('\n'); // v12: same values as text under the track (shown on portrait phones)
    g.font = '12px system-ui'; const tw = Math.max(...lines.map(t => g.measureText(t).width), 10), bx = Math.min(Math.max(4, cx - tw / 2 - 6), W - tw - 16), by = Math.max(4, cy - 120 * k - lines.length * 15 - 10);
    g.fillStyle = 'rgba(20,26,36,0.82)'; g.fillRect(bx, by, tw + 12, lines.length * 15 + 6); g.fillStyle = '#e8eef8'; g.textAlign = 'left';
    lines.forEach((t, i) => g.fillText(t, bx + 6, by + 15 + i * 15)); }
  function draw() { if (tab === 'schema' || !proj().robot) return; g.setTransform(dpr, 0, 0, dpr, 0, 0); tab === 'chassis' ? drawChassis() : drawTrack(); }
  function loop() { cancelAnimationFrame(raf); if (tab === 'schema') return; const f = () => { draw(); syncBar(); raf = requestAnimationFrame(f); }; raf = requestAnimationFrame(f); }
  /* --- physics hook from app.js tick (after devices step, before measure) --- */
  function onTick(p, dt) { if (!isCar(p) || !p.robot) return; if (!run) { ensure(); run = R.create(p, P, window.Devices); }
    if (paused) return; run.step(dt * p.robot.speed);
    if (run.lap && !run._shown) { run._shown = true; summary('🏁 Круг: ' + run.lap.time.toFixed(1) + ' с · сходов с линии: ' + run.lap.offs + (run.laps.length > 1 ? ' · кругов: ' + run.laps.length : '')); }
    if (run.lap && run.laps.length !== run._nl) { run._nl = run.laps.length; run._shown = false; } }
  function summary(t) { sum.textContent = t; sum.hidden = false; }
  function reset() { run = null; const p = proj(); if (p.robot) { ensure(); run = R.create(p, P, window.Devices); } sum.hidden = true; draw(); }
  function onStop() { paused = true; if (run && run.t > 0) summary(run.lap ? '🏁 Лучший круг: ' + Math.min(...run.laps.map(l => l.time)).toFixed(1) + ' с · сходов всего: ' + run.offs : '⏸ Время: ' + run.t.toFixed(1) + ' с · сходов с линии: ' + run.offs + ' (круг не завершён)'); }
  /* --- controls --- */
  selBody.onchange = () => { proj().robot.body = selBody.value; save(); draw(); };
  selMat.onchange = () => { proj().robot.mat = selMat.value; save(); draw(); };
  bCaster.onclick = () => { const r = proj().robot; r.caster = !r.caster; save(); draw(); };
  selPre.onchange = () => { const v = selPre.value; if (!v) return; const r = proj().robot, pr = R.preset(v); r.track.preset = v; r.track.strokes = pr.strokes; r.track.start = pr.start; save(); reset(); };
  bBrush.onclick = () => { mode = mode === 'brush' ? 'move' : 'brush'; syncBar(); };
  bBox.onclick = () => { mode = mode === 'box' ? 'move' : 'box'; syncBar(); };
  bClear.onclick = () => { const r = proj().robot; r.track.strokes = []; r.track.preset = ''; r.obstacles = []; save(); reset(); };
  bPlay.onclick = () => { if (!run) reset(); paused = false; sum.hidden = true; if (!sim().running) sim().start(); syncBar(); };
  bPause.onclick = () => { onStop(); syncBar(); };
  bReset.onclick = () => { paused = true; if (run) { run.reset(); sum.hidden = true; draw(); } else reset(); syncBar(); }; // v10: Devices.car.reset()
  inDir.onchange = () => { const m = selDist(); if (!m) return; const d = Math.max(-180, Math.min(180, Math.round(+inDir.value || 0)));
    m.dir = Math.round(d * Math.PI / 180 * 100) / 100; if (!m.dir) delete m.dir; run = null; save(); draw(); };
  spd.oninput = () => { proj().robot.speed = +spd.value; spdL.textContent = '×' + spd.value; save(); };
  const pos = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  cv.addEventListener('pointerdown', e => { const r = proj().robot; if (!r) return; const [sx, sy] = pos(e); cv.setPointerCapture(e.pointerId);
    if (tab === 'chassis') { const [bx, by] = chToB(sx, sy); let best = null, bd = 30;
      for (const m of r.mounts) { if (roleOf(m.part) !== 'dist') continue; const a = m.dir || 0;
        if (Math.hypot(m.x + Math.cos(a) * ROT_R - bx, m.y + Math.sin(a) * ROT_R - by) < 14) { dragM = { m, rot: true }; sim().select(m.part); draw(); return; } }
      for (const m of r.mounts) { const d = Math.hypot(m.x - bx, m.y - by); if (d < bd) { bd = d; best = m; } }
      if (best) { dragM = { m: best, dx: best.x - bx, dy: best.y - by }; sim().select(best.part); } else sim().select(null); draw(); return; }
    const [fx, fy] = trToF(sx, sy);
    if (mode === 'brush') { brush = [[Math.round(fx), Math.round(fy)]]; r.track.strokes.push(brush); r.track.preset = ''; return; }
    if (mode === 'box') { const i = r.obstacles.findIndex(o => Math.abs(fx - o.x) <= o.w / 2 && Math.abs(fy - o.y) <= o.h / 2);
      if (i >= 0) r.obstacles.splice(i, 1); else if (r.obstacles.length < (window.ROBOT_LIMITS ? window.ROBOT_LIMITS.boxes : 30)) r.obstacles.push({ x: Math.round(fx), y: Math.round(fy), w: 100, h: 100 }); save(); return; }
    if (paused) { dragM = { start: true }; } });
  cv.addEventListener('pointermove', e => { const r = proj().robot; if (!r) return; const [sx, sy] = pos(e);
    if (dragM && dragM.rot) { const [bx, by] = chToB(sx, sy); let a = Math.atan2(by - dragM.m.y, bx - dragM.m.x);
      for (const q of [0, Math.PI / 2, -Math.PI / 2, Math.PI, -Math.PI]) if (Math.abs(a - q) < 0.09) a = q; // snap to forward / sides / back
      dragM.m.dir = Math.round(a * 100) / 100; if (!dragM.m.dir) delete dragM.m.dir; draw(); }
    else if (dragM && dragM.m) { const [bx, by] = chToB(sx, sy); dragM.m.x = Math.max(-150, Math.min(150, Math.round(bx + dragM.dx))); dragM.m.y = Math.max(-150, Math.min(150, Math.round(by + dragM.dy))); draw(); }
    else if (dragM && dragM.start) { const [fx, fy] = trToF(sx, sy); const pose = { x: Math.round(Math.max(60, Math.min(1940, fx))), y: Math.round(Math.max(60, Math.min(1340, fy))), th: run ? run.car.th : r.track.start.th };
      r.track.start.x = pose.x; r.track.start.y = pose.y; r.track.start.th = pose.th; if (run) run.reset(pose); dragM.moved = true; sum.hidden = true; draw(); }
    else if (brush) { const [fx, fy] = trToF(sx, sy), l = brush[brush.length - 1], total = r.track.strokes.reduce((a, s) => a + s.length, 0);
      if (Math.hypot(fx - l[0], fy - l[1]) > 8 && total < (window.ROBOT_LIMITS ? window.ROBOT_LIMITS.pts : 4000)) { brush.push([Math.round(Math.max(0, Math.min(2000, fx))), Math.round(Math.max(0, Math.min(1400, fy)))]); grid = null; draw(); } } });
  const up = () => { if (dragM || brush) { if (dragM && dragM.m) run = null; const keep = dragM && dragM.start; dragM = null;
      if (keep) { save(); return; } // car stays where it was put (Devices.car remembers it as the new start)
      brush = null; grid = null; save(); if (!sim().running || paused) reset(); } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  window.RobotUI = { onOpen, onTick, onStop, show, get run() { return run; }, get paused() { return paused; }, get tab() { return tab; }, reset };
  if (window.__sim) onOpen();
})();
