/* v9: UI «Робот-машинка» — вкладки «Схема / Шасси / Трасса», конструктор шасси и трасса на canvas.
 * Только createElement/textContent и canvas (без innerHTML). Данные проекта — proj.robot (проверяется в sanitize.js). */
(function () {
  'use strict';
  const R = window.Robot, C = window.Chassis, P = window.PARTS, $ = s => document.querySelector(s);
  const el = (tag, props, kids) => { const e = document.createElement(tag); Object.assign(e, props || {}); for (const k of kids || []) e.append(k); return e; };
  let dragV = null, ucT = 0, uc = [], S = null, tab = 'schema', run = null, paused = true, last = 0, raf = 0, dragM = null, brush = null, mode = 'move', grid = null, gridSig = '';
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
  const selBody = opt(el('select', { id: 'rBody', title: 'Корпус' }), [['rect', '▭ Прямоугольная'], ['round', '◯ Круглая'], ['poly', '⬠ Многоугольник']]);
  const selMat = opt(el('select', { id: 'rMat', title: 'Материал' }), [['acrylic', 'Акрил'], ['black', 'Чёрный пластик']]);
  const bCaster = el('button', { id: 'rCaster', textContent: '◉ Шаровая опора' }), chHint = el('span', { className: 'rhint', textContent: 'Перетаскивай детали по платформе. Выделение связано со «Схемой».' });
  const inDir = el('input', { id: 'rDir', type: 'number', min: '-180', max: '180', step: '15', title: 'Направление датчика расстояния, ° (0 — вперёд, 90 — влево, −90 — вправо)' });
  const dirW = el('label', { className: 'rdir', hidden: true }, [el('span', { textContent: '📏 Направление, °' }), inDir]);
  // v13: body size in mm (5 mm grid), polygon vertices, drive cards, rotate/add any part, mass, «Мои шасси»
  const mmIn = (id, t, lo, hi) => el('input', { id, type: 'number', min: String(lo), max: String(hi), step: '5', title: t });
  const inL = mmIn('rL', 'Длина корпуса, мм', 40, 400), inW = mmIn('rW', 'Ширина корпуса, мм', 40, 400), inRad = mmIn('rRad', 'Скругление углов, мм', 0, 200), inRr = mmIn('rRr', 'Радиус, мм', 20, 200);
  const lab = (t, i) => el('label', { className: 'rdir' }, [el('span', { textContent: t }), i]);
  const wL = lab('Д, мм', inL), wW = lab('Ш, мм', inW), wRad = lab('⌒, мм', inRad), wRr = lab('R, мм', inRr);
  const bVAdd = el('button', { id: 'rVAdd', textContent: '＋ вершина', title: 'Добавить вершину на самой длинной стороне' }), bVDel = el('button', { id: 'rVDel', textContent: '－ вершина' });
  const drives = el('div', { className: 'rdrives', id: 'rDrives' }, Object.entries(C.DRIVES).map(([k, t]) => { const b = el('button', { className: 'rcard', textContent: t, title: 'Привод: ' + t }); b.dataset.drive = k; b.onclick = () => setDrive(k); return b; }));
  const bRot = el('button', { id: 'rRot', textContent: '⟳ 15°', title: 'Повернуть выделенную деталь на 15°' }), bAdd = el('button', { id: 'rAdd', textContent: '➕ На шасси', title: 'Поставить выделенную в «Схеме» деталь на шасси' });
  const massL = el('span', { id: 'rMass', className: 'rmass' });
  const tplSel = el('select', { id: 'rTpl', title: 'Мои шасси' }), tplName = el('input', { id: 'rTplName', type: 'text', maxLength: 40, placeholder: 'Имя шасси' });
  const bTplSave = el('button', { id: 'rTplSave', textContent: '💾 В «Мои шасси»' }), bTplDel = el('button', { id: 'rTplDel', textContent: '🗑', title: 'Удалить шаблон' });
  const tplW = el('span', { className: 'rtpl' }, [tplSel, tplName, bTplSave, bTplDel]);
  const chBar = el('div', { className: 'rgrp', id: 'rChBar' }, [selBody, wL, wW, wRad, wRr, bVAdd, bVDel, selMat, bCaster, drives, bRot, bAdd, dirW, massL, tplW, chHint]);
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
    if (!r.track.strokes.length && r.track.preset) { const pr = R.preset(r.track.preset); if (pr.strokes.length) { r.track.strokes = pr.strokes; r.track.start = pr.start; } }
    // keep mounts in sync with the schematic: drop removed parts, add new chassis-able ones
    const ids = new Set(p.parts.map(q => q.id)); r.mounts = r.mounts.filter(m => ids.has(m.part));
    const have = new Set(r.mounts.map(m => m.part)), def = R.defaultMounts(p, P);
    for (const m of def) if (!have.has(m.part)) r.mounts.push(m);
    if (r.wheels) for (const w of r.wheels) if (w.part && !ids.has(w.part)) delete w.part;
    return r; }
  /* v13: chassis helpers */
  const TPL_KEY = 'circuit-sim.chassis-templates';
  const loadTpl = () => { try { return C.cleanTemplates(JSON.parse(localStorage.getItem(TPL_KEY) || '[]')); } catch (e) { return []; } };
  const storeTpl = l => { try { localStorage.setItem(TPL_KEY, JSON.stringify(C.cleanTemplates(l))); } catch (e) { /* quota/private mode */ } };
  function refreshTpl(sel) { const l = loadTpl(), v = sel != null ? sel : tplSel.value;
    tplSel.replaceChildren(el('option', { value: '', textContent: '📂 Мои шасси (' + l.length + ')' }), ...l.map(t => el('option', { value: t.name, textContent: t.name }))); tplSel.value = l.some(t => t.name === v) ? v : ''; }
  const isMotorId = id => { const q = proj().parts.find(p => p.id === id); return !!(q && P[q.type].motor); };
  // a motor dropped near a free driven slot takes it (and sits exactly on it); dragged away — the slot is empty again
  function snap(r, m) { if (!r.wheels || !isMotorId(m.part)) return; for (const w of r.wheels) if (w.part === m.part) delete w.part;
    let best = null, bd = 32; for (const w of r.wheels) { if (w.part || w.caster || w.driven === false) continue; const d = Math.hypot(w.x - m.x, w.y - m.y); if (d < bd) { bd = d; best = w; } }
    if (best) { best.part = m.part; m.x = best.x; m.y = best.y; } }
  function setDrive(k) { const r = proj().robot; if (!C.cleanDrive(k)) return; r.drive = k; r.wheels = C.slots(k); r.caster = k === 'diff';
    for (const m of r.mounts) snap(r, m); run = null; save(); draw(); }
  function curSize(r) { const s = C.shape(r), o = r.size || {}; return { l: s.l || o.l || 190, w: s.w || o.w || 140, rad: s.rad != null ? s.rad : o.rad != null ? o.rad : 10, r: s.r || o.r || 90 }; }
  function setShape(patch) { const r = proj().robot, o = C.cleanShape({ body: patch.body || r.body, size: { ...curSize(r), ...(patch.size || {}) }, poly: patch.poly || r.poly }, {});
    r.body = o.body; r.size = o.size; if (o.poly) r.poly = o.poly; else delete r.poly; run = null; save(); draw(); }
  function uncon(force) { const p = proj(), r = p.robot; if (!r) return []; if (force || performance.now() - ucT > 500) { ucT = performance.now();
      try { uc = C.unconnected(p, P, window.Netlist.nets(p), [...new Set(r.mounts.map(m => m.part).concat((r.wheels || []).map(w => w.part).filter(Boolean)))]); } catch (e) { uc = []; } } return uc; }
  const selMount = () => { const r = proj().robot, id = sim().sel && sim().sel.part; return r && id ? r.mounts.find(m => m.part === id) : null; };
  const save = () => { const s = sim(); if (s.changed) s.changed(); };
  /* --- tabs --- */
  function show(k) { tab = k; for (const b of Object.values(tb)) b.classList.toggle('on', b.dataset.rtab === k);
    pane.hidden = k === 'schema'; chBar.hidden = k !== 'chassis'; trBar.hidden = k !== 'track'; document.body.dataset.rtab = k;
    if (k !== 'schema') { ensure(); syncBar(); resize(); } loop(); }
  function syncBar() { const r = proj().robot; if (!r) return; selBody.value = r.body; selMat.value = r.mat; bCaster.classList.toggle('on', r.caster); selPre.value = r.track.preset || '';
    spd.value = String(r.speed); spdL.textContent = '×' + r.speed; bBrush.classList.toggle('on', mode === 'brush'); bBox.classList.toggle('on', mode === 'box');
    bPlay.disabled = !paused && sim().running; bPause.disabled = paused;
    pidW.hidden = !r.tune; if (r.tune) for (const [k] of TUNE) { if (document.activeElement !== tIn[k]) tIn[k].value = String(r.tune[k]); tOut[k].textContent = String(r.tune[k]); }
    const sh = C.shape(r), cs = curSize(r), act = document.activeElement;
    wL.hidden = wW.hidden = wRad.hidden = sh.kind !== 'rect'; wRr.hidden = sh.kind !== 'round'; bVAdd.hidden = bVDel.hidden = sh.kind !== 'poly';
    for (const [i, v] of [[inL, cs.l], [inW, cs.w], [inRad, cs.rad], [inRr, cs.r]]) if (act !== i) i.value = String(v);
    for (const b of drives.children) b.classList.toggle('on', b.dataset.drive === (r.drive || ''));
    const ms = C.mass(r, proj().parts); massL.textContent = '⊕ Масса ' + ms.g + ' г'; bRot.disabled = !selMount();
    const sid = sim().sel && sim().sel.part; bAdd.disabled = !sid || r.mounts.some(m => m.part === sid) || r.mounts.length >= 40; bTplDel.disabled = !tplSel.value;
    const dm = selDist(); dirW.hidden = !dm; if (dm && document.activeElement !== inDir) inDir.value = String(Math.round((dm.dir || 0) * 180 / Math.PI)); }
  function onOpen() { const p = proj(); run = null; paused = true; sum.hidden = true; grid = null; gridSig = '';
    refreshTpl(); tabs.hidden = !isCar(p); document.body.classList.toggle('carproj', isCar(p)); if (isCar(p)) { ensure(); show(window.innerWidth < 900 ? 'track' : 'chassis'); } else show('schema'); }
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
  const SIZE = { wheel: [66, 26], line: [22, 16], dist: [18, 46], bat: [36, 18], board: [52, 28], driver: [43, 43], servo: [24, 12], imu: [20, 16], other: [18, 18] };
  const COL = { bat: '#2b6e3a', driver: '#b3262e', servo: '#2a64c4', imu: '#5a3fa0', other: '#555c66', board: '#22303f' };
  function bodyPath(r) { const s = C.shape(r); g.beginPath();
    if (s.kind === 'round') g.arc(0, 0, s.r, 0, Math.PI * 2); else if (s.kind === 'poly') { s.poly.forEach((q, i) => i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1])); g.closePath(); }
    else g.roundRect ? g.roundRect(-s.l / 2, -s.w / 2, s.l, s.w, Math.min(s.rad, s.l / 2, s.w / 2)) : g.rect(-s.l / 2, -s.w / 2, s.l, s.w); }
  function drawWheels(r, sa) { for (const w of r.wheels) { g.save(); g.translate(w.x, w.y); g.rotate((w.ang || 0) + (w.steer ? sa : 0));
      const empty = !w.part && w.driven !== false && !w.caster, L = w.track ? 180 : w.R * 2, T = w.track ? 30 : w.caster ? w.R * 2 : 18;
      if (w.caster) { g.fillStyle = '#c9ced6'; g.beginPath(); g.arc(0, 0, w.R, 0, 7); g.fill(); g.strokeStyle = '#6a7078'; g.stroke(); g.restore(); continue; }
      if (empty) { g.strokeStyle = '#8fa0b8'; g.lineWidth = 2; g.setLineDash([5, 4]); g.strokeRect(-L / 2, -T / 2, L, T); g.setLineDash([]); g.fillStyle = 'rgba(143,160,184,0.15)'; g.fillRect(-L / 2, -T / 2, L, T); g.restore(); continue; }
      g.fillStyle = w.driven === false ? '#2b2f36' : '#111'; g.fillRect(-L / 2, -T / 2, L, T); g.strokeStyle = '#555'; g.lineWidth = 1.5;
      if (w.roller != null && !w.omni) { const t = Math.tan(w.roller) * T / 2; for (let i = -L / 2 + 6; i <= L / 2 - 6; i += 8) { g.beginPath(); g.moveTo(i - t, -T / 2); g.lineTo(i + t, T / 2); g.stroke(); } }
      else if (w.omni) { g.fillStyle = '#9aa3b0'; for (let i = -L / 2 + 6; i <= L / 2 - 6; i += 10) g.fillRect(i - 3, -T / 2, 6, T); }
      else for (let i = -L / 2 + 4; i <= L / 2 - 4; i += 6) { g.beginPath(); g.moveTo(i, -T / 2); g.lineTo(i, T / 2); g.stroke(); }
      g.restore(); } }
  const ROT_R = 60; // v10: rotate handle of a distance sensor, mm from its mount along dir
  function drawCarBody(r, hl, rays) { const mat = r.mat === 'black' ? ['#1d1f24', '#40444d'] : ['rgba(190,225,255,0.35)', '#9fd0ff'];
    g.fillStyle = mat[0]; g.strokeStyle = mat[1]; g.lineWidth = 2; bodyPath(r); g.fill(); g.stroke();
    const veh = !!(r.wheels && r.wheels.length); if (veh) drawWheels(r, run && run.steer || 0);
    if (r.caster && !veh) { g.fillStyle = '#c9ced6'; g.beginPath(); g.arc(-72, 0, 9, 0, Math.PI * 2); g.fill(); g.strokeStyle = '#6a7078'; g.stroke(); }
    for (const m of r.mounts) { const ro = roleOf(m.part) || 'other'; g.save(); g.translate(m.x, m.y); g.rotate(m.dir || 0); const on = hl === m.part;
      if (ro === 'dist') { if (rays) { g.strokeStyle = 'rgba(255,170,0,0.6)'; g.lineWidth = 2; g.setLineDash([6, 4]); g.beginPath(); g.moveTo(10, 0); g.lineTo(ROT_R, 0); g.stroke(); g.setLineDash([]);
        g.fillStyle = '#ffaa00'; g.beginPath(); g.arc(ROT_R, 0, 7, 0, 7); g.fill(); } }
      if (ro === 'line') { g.fillStyle = 'rgba(255,60,60,0.18)'; g.beginPath(); g.moveTo(-4, -5); g.lineTo(18, -9); g.lineTo(18, 9); g.lineTo(-4, 5); g.fill();
        g.fillStyle = 'rgba(255,60,60,0.35)'; g.beginPath(); g.arc(18, 0, 5, 0, Math.PI * 2); g.fill(); }
      const [a, b] = SIZE[ro] || [20, 20];
      if (ro === 'wheel' && veh) { g.fillStyle = '#f3c316'; g.fillRect(-14, -14, 28, 28); g.strokeStyle = '#8a6d00'; g.lineWidth = 1.5; g.strokeRect(-14, -14, 28, 28); }
      else if (ro === 'wheel') { g.fillStyle = '#f3c316'; g.fillRect(-14, m.y > 0 ? -34 : 6, 28, 28); g.fillStyle = '#111'; g.fillRect(-a / 2, m.y > 0 ? 2 : -2 - b, a, b);
        g.strokeStyle = '#333'; for (let i = -30; i <= 30; i += 6) { g.beginPath(); g.moveTo(i, m.y > 0 ? 2 : -2); g.lineTo(i, m.y > 0 ? 2 + b : -2 - b); g.stroke(); } }
      else { g.fillStyle = ro === 'line' ? '#1d4fd0' : ro === 'dist' ? (P[proj().parts.find(q => q.id === m.part).type].sensor === 'vl53' ? '#6b2fb3' : '#1b6fbf') : COL[ro] || '#22303f';
        g.fillRect(-b / 2, -a / 2, b, a); if (ro === 'dist' && a > 30) { g.fillStyle = '#ccc'; g.beginPath(); g.arc(b / 2 - 2, -11, 7, 0, 7); g.arc(b / 2 - 2, 11, 7, 0, 7); g.fill(); } }
      if (on) { g.strokeStyle = '#ffd34d'; g.lineWidth = 3; g.strokeRect(-a / 2 - 4, -a / 2 - 4, a + 8, a + 8); }
      g.restore(); } }
  function drawChassis() { const r = proj().robot, k = chK(); g.fillStyle = '#12161f'; g.fillRect(0, 0, W, H);
    g.save(); g.translate(W / 2, H / 2); g.scale(k, k); g.rotate(-Math.PI / 2); g.scale(1, -1); // body x→up, y→left
    const sl = sim().sel && sim().sel.part; drawCarBody(r, sl, true); g.restore();
    g.fillStyle = '#d8dee9'; g.font = '12px system-ui'; g.textAlign = 'center';
    const veh = !!(r.wheels && r.wheels.length);
    for (const m of r.mounts) { const ro = roleOf(m.part) || 'other'; const [sx, sy] = chToS(m.x, m.y); g.fillText(m.part + (ro === 'wheel' && !veh ? (m.y > 0 ? ' (лев.)' : ' (прав.)') : ''), sx, sy + 4); }
    if (veh) { const nm = C.SLOT_NAME[r.drive] || []; g.fillStyle = '#8fa0b8'; g.font = '11px system-ui';
      r.wheels.forEach((w, i) => { if (w.part || w.caster || w.driven === false) return; const [sx, sy] = chToS(w.x, w.y); g.fillText('＋ ' + (nm[i] || 'слот'), sx, sy + 4); }); }
    // v13: polygon vertex handles
    const sh = C.shape(r); if (sh.kind === 'poly') for (const q of sh.poly) { const [sx, sy] = chToS(q[0], q[1]); g.fillStyle = '#ffd34d'; g.fillRect(sx - 6, sy - 6, 12, 12); g.strokeStyle = '#222'; g.lineWidth = 1; g.strokeRect(sx - 6, sy - 6, 12, 12); }
    // v13: centre of mass ⊕ and mass
    const ms = C.mass(r, proj().parts), [mx, my] = chToS(ms.x, ms.y); g.strokeStyle = '#ff5ab4'; g.lineWidth = 2; g.beginPath(); g.arc(mx, my, 9, 0, 7); g.moveTo(mx - 9, my); g.lineTo(mx + 9, my); g.moveTo(mx, my - 9); g.lineTo(mx, my + 9); g.stroke();
    g.fillStyle = '#ff9ad2'; g.font = '12px system-ui'; g.textAlign = 'left'; g.fillText('⊕ Масса ' + ms.g + ' г', 8, H - 10); g.textAlign = 'center';
    // v13: orange «!» on a part that is not wired up in «Схема»
    for (const u of uncon()) { const m = r.mounts.find(q => q.part === u.part); if (!m) continue; const [sx, sy] = chToS(m.x, m.y); const x = sx + 14, y = sy - 16;
      g.fillStyle = '#ff8c1a'; g.beginPath(); g.arc(x, y, 9, 0, 7); g.fill(); g.fillStyle = '#111'; g.font = 'bold 13px system-ui'; g.fillText('!', x, y + 5); }
    g.fillStyle = '#8a94a8'; g.font = '12px system-ui'; g.fillText('▲ вперёд', W / 2, 16); }
  function ensureGrid(r) { const sig = JSON.stringify([r.track.w, r.track.strokes.length, r.track.strokes.reduce((a, s) => a + s.length, 0), r.track.strokes[0] && r.track.strokes[0][1]]);
    if (!grid || sig !== gridSig) { grid = R.raster(r.track); gridSig = sig; } return grid; }
  function drawTrack() { const r = proj().robot, k = trK(); g.fillStyle = '#2a2f38'; g.fillRect(0, 0, W, H);
    const [x0, y0] = trToS(0, R.FIELD.h); g.fillStyle = '#fafafa'; g.fillRect(x0, y0, R.FIELD.w * k, R.FIELD.h * k);
    g.strokeStyle = '#111'; g.lineWidth = r.track.w * k; g.lineCap = g.lineJoin = 'round';
    for (const s of r.track.strokes) { g.beginPath(); s.forEach((q, i) => { const [x, y] = trToS(q[0], q[1]); i ? g.lineTo(x, y) : g.moveTo(x, y); }); if (s.length === 1) { const [x, y] = trToS(s[0][0], s[0][1]); g.lineTo(x + 0.1, y); } g.stroke(); }
    for (const o of r.obstacles) { const [x, y] = trToS(o.x - o.w / 2, o.y + o.h / 2); g.fillStyle = '#b5814a'; g.fillRect(x, y, o.w * k, o.h * k); g.strokeStyle = '#7a5228'; g.lineWidth = 1.5; g.strokeRect(x, y, o.w * k, o.h * k); }
    const tk = (R.TASKS[r.track.preset] || {}).task; // v13: goal of the task
    if (tk && tk.goal) { const [gx, gy] = trToS(tk.goal.x, tk.goal.y); g.fillStyle = 'rgba(46,204,113,0.25)'; g.beginPath(); g.arc(gx, gy, tk.goal.r * k, 0, 7); g.fill(); g.fillStyle = '#1e8a4c'; g.font = '14px system-ui'; g.textAlign = 'center'; g.fillText('🏁', gx, gy + 5); }
    if (tk && tk.kind === 'park' && r.obstacles[0]) { const o = r.obstacles[0], [zx, zy] = trToS(o.x - o.w / 2 - tk.hi, o.y + o.h / 2); g.fillStyle = 'rgba(46,204,113,0.22)'; g.fillRect(zx, zy, (tk.hi - tk.lo) * k, o.h * k); }
    const st = r.track.start, [sx, sy] = trToS(st.x, st.y); g.strokeStyle = '#2ecc71'; g.lineWidth = 2; g.setLineDash([4, 3]); g.beginPath(); g.arc(sx, sy, 70 * k, 0, 7); g.stroke(); g.setLineDash([]);
    if (run) { g.lineWidth = Math.max(1.5, 4 * k); for (let i = 1; i < run.trail.length; i++) { const a = run.trail[i - 1], b = run.trail[i];
      g.strokeStyle = b[2] ? '#1fa3ff' : '#ff3030'; g.beginPath(); g.moveTo(...trToS(a[0], a[1])); g.lineTo(...trToS(b[0], b[1])); g.stroke(); } }
    const c = run ? run.car : { x: st.x / 1000, y: st.y / 1000, th: st.th }, [cx, cy] = trToS(c.x * 1000, c.y * 1000);
    g.save(); g.translate(cx, cy); g.scale(k, k); g.scale(1, -1); g.rotate(c.th); drawCarBody(r, sim().sel && sim().sel.part);
    if (run && run.flashT >= 0 && run.t - run.flashT < 0.4) { g.strokeStyle = '#ff2a2a'; g.lineWidth = 10; bodyPath(r); g.stroke(); } g.restore(); // v13: bump flash
    // v10: ray of every distance sensor (from Devices.car rangers): orange — free, red — hits a box/wall
    if (run) for (const d of run.car.dist || []) { const [ax, ay] = trToS(d.x * 1000, d.y * 1000), [bx2, by2] = trToS((d.x + Math.cos(d.dir) * d.d) * 1000, (d.y + Math.sin(d.dir) * d.d) * 1000);
      g.strokeStyle = d.hit ? 'rgba(230,40,40,0.85)' : 'rgba(255,160,0,0.6)'; g.lineWidth = 2; g.setLineDash(d.hit ? [] : [5, 4]); g.beginPath(); g.moveTo(ax, ay); g.lineTo(bx2, by2); g.stroke(); g.setLineDash([]);
      if (d.hit) { g.fillStyle = '#e62828'; g.beginPath(); g.arc(bx2, by2, 4, 0, 7); g.fill(); } }
    // labels over the car
    const lines = []; if (run) { const ls = run.lines.map((m, i) => m.part + ' ' + (run.car.vals[i] ? run.car.vals[i].refl.toFixed(2) : '—')).join('  '); if (ls) lines.push('👁 ' + ls);
      for (const m of run.dists) lines.push('📏 ' + m.part + ' ' + Math.round(run.dvals[m.part] || 0) + ' мм' + (m.dir ? ' (' + Math.round(m.dir * 180 / Math.PI) + '°)' : ''));
      lines.push('⟳ L ' + Math.round(run.rpmL) + ' · R ' + Math.round(run.rpmR) + ' об/мин'); }
    const bat = proj().parts.find(q => q.type === 'liion'); if (bat) lines.push('🔋 ' + Math.round(100 * (bat._st && bat._st.soc != null ? bat._st.soc : bat.props.soc / 100)) + '%');
    if (run) lines.push('⏱ ' + run.t.toFixed(1) + ' с · ' + (r.track.strokes.length ? 'сходов: ' + run.offs + ' · ' : '') + '💥 ударов: ' + run.bumps);
    if (run && run.done) lines.push((run.done.ok ? '✅ ' : '❌ ') + run.done.msg);
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
    if (run.lap && run.laps.length !== run._nl) { run._nl = run.laps.length; run._shown = false; }
    if (run.done && !run._doneShown) { run._doneShown = true; summary((run.done.ok ? '✅ ' : '❌ ') + run.done.msg); } }
  function summary(t) { sum.textContent = t; sum.hidden = false; }
  function reset() { run = null; const p = proj(); if (p.robot) { ensure(); run = R.create(p, P, window.Devices); } sum.hidden = true; draw(); }
  function onStop() { paused = true; if (run && run.done) summary((run.done.ok ? '✅ ' : '❌ ') + run.done.msg); else if (run && run.t > 0 && !r0().track.strokes.length) summary('⏸ Время: ' + run.t.toFixed(1) + ' с · ударов: ' + run.bumps); else if (run && run.t > 0) summary(run.lap ? '🏁 Лучший круг: ' + Math.min(...run.laps.map(l => l.time)).toFixed(1) + ' с · сходов всего: ' + run.offs : '⏸ Время: ' + run.t.toFixed(1) + ' с · сходов с линии: ' + run.offs + ' (круг не завершён)'); }
  const r0 = () => proj().robot;
  /* --- controls --- */
  selBody.onchange = () => { const r = proj().robot, v = selBody.value, cs = curSize(r);
    if (v === 'poly' && !(r.poly && r.poly.length >= 3)) { const l = cs.l / 2, w = cs.w / 2; setShape({ body: 'poly', poly: [[l + 30, 0], [l, w], [-l, w], [-l, -w], [l, -w]] }); } else setShape({ body: v }); };
  for (const [i, k] of [[inL, 'l'], [inW, 'w'], [inRad, 'rad'], [inRr, 'r']]) i.onchange = () => { const v = Number(i.value); if (Number.isFinite(v)) setShape({ size: { [k]: v } }); };
  bVAdd.onclick = () => { const sh = C.shape(proj().robot); if (sh.kind !== 'poly' || sh.poly.length >= C.LIM.poly) return; const q = sh.poly; let bi = 0, bd = -1;
    q.forEach((a, i) => { const b = q[(i + 1) % q.length], d = Math.hypot(a[0] - b[0], a[1] - b[1]); if (d > bd) { bd = d; bi = i; } });
    const a = q[bi], b = q[(bi + 1) % q.length], nq = q.slice(); nq.splice(bi + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]); setShape({ poly: nq }); };
  bVDel.onclick = () => { const sh = C.shape(proj().robot); if (sh.kind === 'poly' && sh.poly.length > 3) setShape({ poly: sh.poly.slice(0, -1) }); };
  bRot.onclick = () => { const m = selMount(); if (!m) return; let d = Math.round((m.dir || 0) * 180 / Math.PI / 15) * 15 + 15; if (d > 180) d -= 360;
    m.dir = Math.round(d * Math.PI / 180 * 100) / 100; if (!m.dir) delete m.dir; run = null; save(); draw(); };
  bAdd.onclick = () => { const r = proj().robot, id = sim().sel && sim().sel.part; if (!r || !id || r.mounts.some(m => m.part === id) || r.mounts.length >= 40) return;
    const m = { part: id, x: 0, y: 0 }; r.mounts.push(m); snap(r, m); run = null; save(); draw(); };
  tplSel.onchange = () => { const t = loadTpl().find(q => q.name === tplSel.value); if (!t) return; const r = proj().robot;
    r.body = t.body; if (t.size) r.size = { ...t.size }; else delete r.size; if (t.poly) r.poly = t.poly.map(q => q.slice()); else delete r.poly; r.mat = t.mat; r.caster = t.caster;
    if (t.drive) { r.drive = t.drive; r.wheels = t.wheels.map(w => ({ ...w })); for (const m of r.mounts) snap(r, m); } else { delete r.drive; delete r.wheels; }
    tplName.value = t.name; run = null; save(); draw(); };
  bTplSave.onclick = () => { const r = proj().robot, name = (tplName.value || '').replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 40); if (!name) { tplName.focus(); return; }
    const t = C.toTemplate(r, name); if (!t) return; const l = loadTpl().filter(q => q.name !== name); if (l.length >= C.LIM.templates) l.shift(); l.push(t); storeTpl(l); refreshTpl(name); };
  bTplDel.onclick = () => { const v = tplSel.value; if (!v) return; storeTpl(loadTpl().filter(q => q.name !== v)); refreshTpl(''); };
  window.addEventListener('storage', e => { if (e.key === TPL_KEY) refreshTpl(); });
  selMat.onchange = () => { proj().robot.mat = selMat.value; save(); draw(); };
  bCaster.onclick = () => { const r = proj().robot; r.caster = !r.caster; save(); draw(); };
  selPre.onchange = () => { const v = selPre.value; if (!v) return; const r = proj().robot, pr = R.preset(v); r.track.preset = v; r.track.strokes = pr.strokes; r.track.start = pr.start;
    if (pr.obstacles) r.obstacles = pr.obstacles; else if (R.TASKS[r.track.preset]) r.obstacles = []; grid = null; save(); reset(); };
  bBrush.onclick = () => { mode = mode === 'brush' ? 'move' : 'brush'; syncBar(); };
  bBox.onclick = () => { mode = mode === 'box' ? 'move' : 'box'; syncBar(); };
  bClear.onclick = () => { const r = proj().robot; r.track.strokes = []; r.track.preset = ''; r.obstacles = []; save(); reset(); };
  bPlay.onclick = () => { if (!run) reset(); paused = false; sum.hidden = true;
    const u = uncon(true); if (u.length) summary('⚠ Не подключено в «Схеме»: ' + u.map(x => x.part + ' — ' + x.why).join('; ')); // v13 hint, the run still starts
    if (!sim().running) sim().start(); syncBar(); };
  bPause.onclick = () => { onStop(); syncBar(); };
  bReset.onclick = () => { paused = true; if (run) { run.reset(); sum.hidden = true; draw(); } else reset(); syncBar(); }; // v10: Devices.car.reset()
  inDir.onchange = () => { const m = selDist(); if (!m) return; const d = Math.max(-180, Math.min(180, Math.round(+inDir.value || 0)));
    m.dir = Math.round(d * Math.PI / 180 * 100) / 100; if (!m.dir) delete m.dir; run = null; save(); draw(); };
  spd.oninput = () => { proj().robot.speed = +spd.value; spdL.textContent = '×' + spd.value; save(); };
  const pos = e => { const b = cv.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top]; };
  cv.addEventListener('pointerdown', e => { const r = proj().robot; if (!r) return; const [sx, sy] = pos(e); cv.setPointerCapture(e.pointerId);
    if (tab === 'chassis') { const [bx, by] = chToB(sx, sy); let best = null, bd = 30;
      const sh = C.shape(r); if (sh.kind === 'poly') { const i = sh.poly.findIndex(q => { const [qx, qy] = chToS(q[0], q[1]); return Math.abs(qx - sx) < 12 && Math.abs(qy - sy) < 12; }); if (i >= 0) { dragV = { i }; return; } }
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
    if (dragV) { const [bx, by] = chToB(sx, sy), q = C.shape(r).poly.map(p => p.slice()); q[dragV.i] = [C.g5(Math.max(-200, Math.min(200, bx))), C.g5(Math.max(-200, Math.min(200, by)))]; r.poly = q; dragV.moved = true; draw(); }
    else if (dragM && dragM.rot) { const [bx, by] = chToB(sx, sy); let a = Math.atan2(by - dragM.m.y, bx - dragM.m.x);
      for (const q of [0, Math.PI / 2, -Math.PI / 2, Math.PI, -Math.PI]) if (Math.abs(a - q) < 0.09) a = q; // snap to forward / sides / back
      dragM.m.dir = Math.round(a * 100) / 100; if (!dragM.m.dir) delete dragM.m.dir; draw(); }
    else if (dragM && dragM.m) { const [bx, by] = chToB(sx, sy); dragM.m.x = Math.max(-150, Math.min(150, Math.round(bx + dragM.dx))); dragM.m.y = Math.max(-150, Math.min(150, Math.round(by + dragM.dy))); draw(); }
    else if (dragM && dragM.start) { const [fx, fy] = trToF(sx, sy); const pose = { x: Math.round(Math.max(60, Math.min(1940, fx))), y: Math.round(Math.max(60, Math.min(1340, fy))), th: run ? run.car.th : r.track.start.th };
      r.track.start.x = pose.x; r.track.start.y = pose.y; r.track.start.th = pose.th; if (run) run.reset(pose); dragM.moved = true; sum.hidden = true; draw(); }
    else if (brush) { const [fx, fy] = trToF(sx, sy), l = brush[brush.length - 1], total = r.track.strokes.reduce((a, s) => a + s.length, 0);
      if (Math.hypot(fx - l[0], fy - l[1]) > 8 && total < (window.ROBOT_LIMITS ? window.ROBOT_LIMITS.pts : 4000)) { brush.push([Math.round(Math.max(0, Math.min(2000, fx))), Math.round(Math.max(0, Math.min(1400, fy)))]); grid = null; draw(); } } });
  const up = () => { if (dragV) { const pq = r0().poly; dragV = null; if (pq) setShape({ poly: pq }); return; }
    if (dragM && dragM.m && !dragM.rot) snap(r0(), dragM.m);
    if (dragM || brush) { if (dragM && dragM.m) run = null; const keep = dragM && dragM.start; dragM = null;
      if (keep) { save(); return; } // car stays where it was put (Devices.car remembers it as the new start)
      brush = null; grid = null; save(); if (!sim().running || paused) reset(); } };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  window.RobotUI = { onOpen, onTick, onStop, show, get run() { return run; }, get paused() { return paused; }, get tab() { return tab; }, reset, setDrive, uncon: () => uncon(true), refreshTpl, TPL_KEY };
  if (window.__sim) onOpen();
})();
