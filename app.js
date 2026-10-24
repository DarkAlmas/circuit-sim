(function () {
  'use strict';
  const P = window.PARTS, $ = s => document.querySelector(s);
  const svg = $('#svg'), view = $('#view'), wiresL = $('#wires'), partsL = $('#partsL'), temp = $('#temp'), tip = $('#tip');
  const LS = 'circuitsim.projects', AUTO = 'circuitsim.autosave';
  const DEFAULT_CODE = window.EXAMPLES[Object.keys(window.EXAMPLES)[0]].code;
  let proj = load(), cam = { x: 500, y: 330, s: 1 }, sel = null, armed = null, drag = null, hover = null, mouse = { x: 0, y: 0 };
  let running = false, worker = null, gpio = {}, lastHb = 0, sim = null, prevV = null, raf = 0, wd = 0, lastAlert = '';
  const meas = {}, checks = {}, flowOff = {}, pointers = new Map(); let lastDown = null, hist = [], lastJ = null, shorts = [], shortSet = new Set(), shortSig = '';

  function load() { try { const a = JSON.parse(localStorage.getItem(AUTO)); if (a && a.parts) return sanitizeProject(a); } catch (e) {} return sanitizeProject(window.EXAMPLES[Object.keys(window.EXAMPLES)[0]]); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function autosave() { const j = JSON.stringify(strip(proj)); if (lastJ !== null && j !== lastJ) { hist.push(lastJ); if (hist.length > 100) hist.shift(); } lastJ = j; localStorage.setItem(AUTO, j); }
  function undo() { if (!hist.length) return; const j = hist.pop(); lastJ = j; proj = sanitizeProject(JSON.parse(j)); proj.code = proj.code || $('#code').value; sel = null; prevV = null; localStorage.setItem(AUTO, j); render(); props(); calc(); }
  const locked = () => running && !shorts.length;
  function strip(p) { return { parts: p.parts.map(({ id, type, x, y, rot, props }) => ({ id, type, x, y, rot, props })), wires: p.wires.map(({ id, a, b, pts }) => ({ id, a, b, pts })), code: p.code, codes: p.codes, name: p.name, kind: p.kind, robot: p.robot }; }
  const uid = pre => { let i = 1; const ids = new Set([...proj.parts, ...proj.wires].map(o => o.id)); while (ids.has(pre + i)) i++; return pre + i; };
  const part = id => proj.parts.find(p => p.id === id);
  const rotPt = (x, y, r) => { for (let i = 0; i < (r || 0) % 4; i++) [x, y] = [-y, x]; return [x, y]; };
  function pinPos(p, pin) { const q = P[p.type].pins.find(q => q.id === pin); const [x, y] = rotPt(q.x, q.y, p.rot); return [p.x + x, p.y + y]; }
  function bbox(type) { if (P[type].box) return P[type].box; const ps = P[type].pins; let x0 = Math.min(...ps.map(q => q.x)), x1 = Math.max(...ps.map(q => q.x)), y0 = Math.min(...ps.map(q => q.y)), y1 = Math.max(...ps.map(q => q.y));
    if (P[type].mcu) { x0 = -72; x1 = 72; y0 = Math.min(y0 - 32, -60); y1 = Math.max(y1 + 22, 60); }
    if (x1 - x0 < 50) { x0 = Math.min(x0, -25); x1 = Math.max(x1, 25); } if (y1 - y0 < 40) { y0 = Math.min(y0, -22); y1 = Math.max(y1, 22); }
    return [x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8]; }
  const toWorld = (cx, cy) => { const r = svg.getBoundingClientRect(); return [(cx - r.left - cam.x) / cam.s, (cy - r.top - cam.y) / cam.s]; };
  const snap = v => Math.round(v / 10) * 10;
  const fU = (x, u) => fmtUnit(x, u);
  const triple = m => m ? `${fU(m.U, 'В')} · ${fU(Math.abs(m.I), 'А')} · ${fU(m.P, 'Вт')}` : 'нет данных';

  /* ---------- palette ---------- */
  const GROUPS = ['Платы', 'Питание', 'Микросхемы', 'Индикация', 'Активные', 'Датчики', 'Пассивные', 'Полупроводники', 'Ввод/вывод'];
  function palette() {
    const q = $('#search').value.trim().toLowerCase();
    $('#palette').innerHTML = GROUPS.map(g => { const items = Object.entries(P).filter(([k, d]) => d.group === g && (!q || d.name.toLowerCase().includes(q)));
      return items.length ? `<div class="grp">${g}</div>` + items.map(([k, d]) => `<div class="item" draggable="true" data-type="${k}">${d.name}</div>`).join('') : ''; }).join('') || '<p class="muted">Ничего не найдено</p>';
  }
  $('#search').oninput = palette;
  $('#palette').addEventListener('dragstart', e => { const t = e.target.closest('.item'); if (t) e.dataTransfer.setData('text/part', t.dataset.type); });
  $('#palette').addEventListener('click', e => { const t = e.target.closest('.item'); if (!t) return; const r = svg.getBoundingClientRect(); addPart(t.dataset.type, ...toWorld(r.left + r.width / 2, r.top + r.height / 2)); });
  svg.addEventListener('dragover', e => e.preventDefault());
  svg.addEventListener('drop', e => { e.preventDefault(); const t = e.dataTransfer.getData('text/part'); if (t) addPart(t, ...toWorld(e.clientX, e.clientY)); });
  function addPart(type, x, y) {
    const d = P[type]; const p = { id: uid(d.prefix || (d.mcu ? 'U' : null) || { resistor: 'R', led: 'D', diode: 'D', npn: 'Q', button: 'S', switch: 'S', pot: 'RV', dc: 'V', battery: 'B', gnd: 'G', breadboard: 'BB', voltmeter: 'PV', ammeter: 'PA' }[type] || 'X'), type, x: snap(x), y: snap(y), rot: 0, props: clone(d.props || {}) };
    proj.parts.push(p); sel = { part: p.id }; changed();
  }

  /* ---------- rendering ---------- */
  function wireColor(w, N) { const r = N.netOf(w.a.part, w.a.pin); if (N.groundRoots.has(r)) return '#9aa3b5'; if (N.plusRoots.has(r)) return '#e5484d'; return '#3fb37f'; }
  function wirePts(w) { const a = pinPos(part(w.a.part), w.a.pin), b = pinPos(part(w.b.part), w.b.pin);
    if (w.pts && w.pts.length) return [a, ...w.pts, b]; const mx = snap((a[0] + b[0]) / 2); return [a, [mx, a[1]], [mx, b[1]], b]; }
  function wirePath(w) { const q = wirePts(w).filter((p, i, A) => !i || p[0] !== A[i - 1][0] || p[1] !== A[i - 1][1]); if (q.length < 3) return `M${q[0]} L${q[q.length - 1]}`;
    let d = `M${q[0][0]} ${q[0][1]}`; // smooth corners: short quadratic fillets
    for (let i = 1; i < q.length - 1; i++) { const [px, py] = q[i - 1], [cx, cy] = q[i], [nx, ny] = q[i + 1];
      const l1 = Math.hypot(cx - px, cy - py), l2 = Math.hypot(nx - cx, ny - cy), r = Math.min(8, l1 / 2, l2 / 2);
      d += ` L${cx - (cx - px) / l1 * r} ${cy - (cy - py) / l1 * r} Q${cx} ${cy} ${cx + (nx - cx) / l2 * r} ${cy + (ny - cy) / l2 * r}`; }
    const z = q[q.length - 1]; return d + ` L${z[0]} ${z[1]}`; }
  function render() {
    view.setAttribute('transform', `translate(${cam.x} ${cam.y}) scale(${cam.s})`);
    proj.wires = proj.wires.filter(w => part(w.a.part) && part(w.b.part));
    const N = Netlist.nets(proj);
    const blink = Math.floor(performance.now() / 500) % 2 === 0;
    wiresL.innerHTML = proj.wires.map(w => { const d = wirePath(w), c = wireColor(w, N), isSel = sel && sel.wire === w.id, sh = shortSet.has(w.id);
      const black = N.groundRoots.has(N.netOf(w.a.part, w.a.pin));
      return (isSel ? `<path d="${d}" class="wsel"/>` : '') + `<path d="${d}" class="wire${black ? ' gndw' : ''}${sh ? ' short' + (blink ? ' on' : '') : ''}${isSel ? ' sel' : ''}" data-wire="${esc(w.id)}" stroke="${black ? '#0b0d12' : c}"/>` +
        (running && !shorts.length && Math.abs(w.I || 0) > 1e-6 ? `<path d="${d}" class="flow" stroke-dashoffset="${-(flowOff[w.id] || 0)}"/>` : '') +
        `<path d="${d}" class="whit" data-wire="${esc(w.id)}"/>` +
        (isSel && !locked() ? (w.pts || []).map((q, i) => `<circle class="bend" data-wire="${esc(w.id)}" data-i="${i}" cx="${q[0]}" cy="${q[1]}" r="5"/>`).join('') +
          ['a', 'b'].map(k => { const q = pinPos(part(w[k].part), w[k].pin); return `<circle class="wend" data-wire="${esc(w.id)}" data-end="${k}" cx="${q[0]}" cy="${q[1]}" r="${(9 / cam.s).toFixed(2)}"/>`; }).join('') : ''); }).join('');
    partsL.innerHTML = [...proj.parts].sort((a, b) => !!P[b.type].strips - !!P[a.type].strips).map(p => { const d = P[p.type], [bx, by, bw, bh] = bbox(p.type), c = checks[p.id];
      const bi = d.builtin ?? 2, dk = d.display, link = links[p.id];
      const st = { I: meas[p.id]?.I, m: meas[p.id], burned: p.burned, running, led2: running && gpioOf(p.id)[bi]?.mode === 'OUTPUT' && (d.ledInv ? !(gpioOf(p.id)[bi].val > 0) : gpioOf(p.id)[bi].val > 0),
        mod: dk ? p._mod : null, img: dk ? imgs[dk] : null, on: link ? link.on : undefined, why: link ? link.why : '', anim: animT[p.id] || 0 };
      const sh = shortSet.has(p.id) || shorts.some(z => z.source === p.id), t = performance.now() / 1000;
      const smoke = p.burned ? [0, 1, 2].map(k => { const f = ((t * 0.6 + k / 3) % 1); return `<circle class="smoke" cx="${Math.sin((t + k) * 2) * 6 * f}" cy="${by - 4 - f * 40}" r="${4 + f * 10}" opacity="${(0.55 * (1 - f)).toFixed(2)}"/>`; }).join('') : '';
      return `<g class="part${sel && sel.part === p.id ? ' sel' : ''}${c ? ' ' + c.level : ''}${p.burned ? ' burned' : ''}${sh ? ' short' + (blink ? ' on' : '') : ''}" data-part="${esc(p.id)}" transform="translate(${p.x} ${p.y}) rotate(${(p.rot || 0) * 90})">
        <rect class="hit" x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="6"/><g class="art">${d.draw(p, st)}</g>${smoke}
        ${d.pins.map(q => `<circle class="pin${d.strips ? ' hole' : ''}${armed && armed.part === p.id && armed.pin === q.id ? ' armed' : ''}" data-pin="${q.id}" cx="${q.x}" cy="${q.y}" r="${d.strips ? 3 : 4}"/>`).join('')}</g>`; }).join('');
    $('#simbar').hidden = !running; $('#simbar').classList.toggle('bad', !!shorts.length); $('#svg').classList.toggle('locked', locked());
    syncCodeFor(); placeFloat();
    $('#boardName').textContent = (proj.parts.find(p => P[p.type].mcu) && P[proj.parts.find(p => P[p.type].mcu).type].name) || 'нет платы';
    updateTip();
  }
  function changed() { prevV = null; autosave(); render(); props(); calc(); }

  /* ---------- properties panel ---------- */
  const PROP_UI = { V: ['Напряжение', 'В', 0.1], R: ['Сопротивление', 'Ом', 1], Pmax: ['Допустимая мощность', 'Вт', 0.05], pos: ['Положение движка', '', 0.01], Vf: ['Прямое напряжение Vf', 'В', 0.1], Imax: ['Макс. ток', 'А', 0.001], beta: ['Коэффициент усиления β (hFE)', '', 1], rInt: ['Внутреннее сопротивление rInt', 'Ом', 0.01],
    C: ['Ёмкость', 'Ф', 'any'], L: ['Индуктивность', 'Гн', 'any'] };
  const SLIDERS = { lux: ['Освещённость', 'лк', 0, 1000, 1], temp: ['Температура', '°C', -40, 125, 0.5], hum: ['Влажность', '%', 0, 100, 1], dist: ['Расстояние', 'см', 2, 400, 1],
    refl: ['Отражение (0 — чёрная линия, 1 — белое)', '', 0, 1, 0.05], thr: ['Порог компаратора D0 (потенциометр)', '× VCC', 0, 1, 0.05], mm: ['Расстояние', 'мм', 30, 2000, 5],
    pitch: ['Наклон вперёд/назад (pitch)', '°', -90, 90, 1], roll: ['Крен (roll)', '°', -180, 180, 1], acc: ['Ускорение вперёд', 'g', -2, 2, 0.05], gz: ['Поворот (гироскоп Z)', '°/с', -250, 250, 5],
    soc: ['Заряд', '%', 0, 100, 1], Vout: ['Uвых (подстроечный резистор)', 'В', 5, 32, 0.5] };
  const E12V = []; for (let e = 0; e <= 6; e++) for (const m of [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2]) E12V.push(+(m * Math.pow(10, e)).toPrecision(3));
  const RUNITS = [['Ом', 1], ['кОм', 1e3], ['МОм', 1e6]];
  function icon(p) { const [bx, by, bw, bh] = bbox(p.type); return `<svg class="ico" viewBox="${bx} ${by} ${bw} ${bh}"><g>${P[p.type].draw({ ...p, burned: false }, { I: 0 })}</g></svg>`; }
  function maxes(p) { const pr = p.props || {};
    if (p.type === 'resistor') return { P: pr.Pmax, I: Math.sqrt(pr.Pmax / pr.R), U: Math.sqrt(pr.Pmax * pr.R) };
    if (p.type === 'led') return { I: pr.Imax, P: pr.Imax * pr.Vf * 1.2, U: pr.Vf * 1.3 };
    if (p.type === 'diode') return { I: 0.3, P: 0.5, U: 1.2 };
    if (p.type === 'npn') return { I: 0.6, P: 0.5, U: 40 };
    if (P[p.type].source || P[p.type].mcu) return { I: window.SHORT_LIMIT_A, P: null, U: null };
    return {}; }
  function commitProp() { prevV = null; autosave(); if (!running) render(); live(); calc(); }
  function props() {
    const el = $('#props');
    if (sel && sel.wire) { el.innerHTML = `<div class="phead"><b>Провод ${esc(sel.wire)}</b><button id="del" class="danger">Удалить</button></div><p class="muted">Двойной щелчок по проводу добавляет точку изгиба, по точке удаляет её. Точки можно перетаскивать.</p>`; $('#del').onclick = del; return; }
    const p = sel && part(sel.part); if (!p) { el.innerHTML = '<p class="muted">Выбери деталь или провод. Провод: коснитесь линии (или правый клик / долгое нажатие — меню).</p>'; return; }
    const d = P[p.type], pr = p.props || {};
    let h = `<div class="phead">${icon(p)}<div class="pname"><b>${esc(p.id)}</b><span>${d.name}</span></div><button id="del" class="danger">Удалить</button></div>`;
    const keys = Object.keys(pr);
    if (keys.length) { h += '<h4>Параметры</h4>';
      for (const k of keys) {
        if (k === 'color') h += `<div class="prop">Цвет<div class="swatches">${Object.entries(LED_COLORS).map(([n, c]) => `<button class="sw${n === pr.color ? ' on' : ''}" data-color="${esc(n)}" title="${esc(n)}"><svg viewBox="0 0 20 20"><circle cx="10" cy="10" r="8" fill="${c[0]}"/></svg></button>`).join('')}</div></div>`;
        else if (k === 'R' && p.type === 'resistor') { const u = RUNITS.filter(x => pr.R >= x[1]).pop() || RUNITS[0];
          h += `<label class="prop">Сопротивление<span class="rrow"><input data-k="R" type="number" min="0" step="any" value="${esc(+(pr.R / u[1]).toPrecision(6))}"><select id="runit">${RUNITS.map(x => `<option value="${x[1]}"${x === u ? ' selected' : ''}>${x[0]}</option>`).join('')}</select>
            <select id="e12"><option value="">E12…</option>${E12V.map(v => `<option value="${v}"${v === pr.R ? ' selected' : ''}>${esc(fmtUnit(v, 'Ом'))}</option>`).join('')}</select></span></label>
            <div class="bands">${resistorBands(pr.R).map(c => `<svg viewBox="0 0 10 20"><rect width="10" height="20" fill="${c}"/></svg>`).join('')}</div>`; }
        else if (SLIDERS[k]) { const [nm, u, lo, hi, stp] = SLIDERS[k]; h += `<label class="prop">${nm}: <b class="sv" data-sv="${k}">${esc(pr[k])}</b> ${u}<input data-k="${k}" type="range" min="${lo}" max="${hi}" step="${stp}" value="${esc(pr[k])}"></label>`; }
        else { const ui = PROP_UI[k] || [k, '', 'any']; h += `<label class="prop">${ui[0]}${ui[1] ? ', ' + ui[1] : ''}<input data-k="${k}" type="${k === 'pos' ? 'range' : 'number'}" step="${ui[2]}" ${k === 'pos' ? 'min="0" max="1"' : 'min="0"'} value="${esc(pr[k])}"></label>`; }
      } }
    h += '<h4>Сейчас</h4>';
    if (p.burned) h += `<div class="burnt">🔥 Сгорела<button id="fix">Заменить</button></div>`;
    h += `<div class="cards">${['U', 'I', 'P'].map(q => `<div class="card" data-q="${q}"><span class="cl">${q}</span><b class="cv">—</b><div class="bar"><i></i></div></div>`).join('')}</div>
      <div id="extra" class="live"></div>
      <div class="row"><button id="rot">⟳ Повернуть (R)</button><a href="#" id="showCalc" class="link">Показать расчёт</a></div>`;
    el.innerHTML = h;
    el.querySelectorAll('input[data-k]').forEach(i => { i.oninput = () => { const k = i.dataset.k; let v = +i.value; if (!Number.isFinite(v)) return;
      if (k === 'R') v *= +$('#runit').value; p.props[k] = SLIDERS[k] ? v : Math.max(k === 'R' || k === 'rInt' ? 0.001 : 0, v); const sv = el.querySelector(`[data-sv="${k}"]`); if (sv) sv.textContent = String(v);
      if (k === 'R') { const bs = el.querySelectorAll('.bands rect'); resistorBands(p.props.R).forEach((c, j) => bs[j].setAttribute('fill', c)); }
      commitProp(); }; });
    if ($('#runit')) $('#runit').onchange = () => { const i = el.querySelector('input[data-k="R"]'); p.props.R = Math.max(0.001, +i.value * +$('#runit').value); commitProp(); props(); };
    if ($('#e12')) $('#e12').onchange = e => { if (!e.target.value) return; p.props.R = +e.target.value; commitProp(); props(); };
    el.querySelectorAll('[data-color]').forEach(b => b.onclick = () => { const n = b.dataset.color; if (!Object.prototype.hasOwnProperty.call(LED_COLORS, n)) return; p.props.color = n; p.props.Vf = LED_COLORS[n][1]; commitProp(); props(); });
    $('#rot').onclick = rotate; $('#del').onclick = del; $('#showCalc').onclick = e => { e.preventDefault(); showTab('calc'); };
    if ($('#fix')) $('#fix').onclick = () => { delete p.burned; delete checks[p.id]; lastAlert = null; changed(); };
    live();
  }
  function live() {
    const p = sel && part(sel.part), el = $('#props'); if (!p) return;
    const m = meas[p.id], mx = maxes(p), isShort = shortSet.has(p.id) || shorts.some(z => z.source === p.id);
    el.querySelectorAll('.card').forEach(c => { const q = c.dataset.q, v = m ? Math.abs(m[q]) : null, u = { U: 'В', I: 'А', P: 'Вт' }[q];
      const cv = c.querySelector('.cv'), bar = c.querySelector('.bar i');
      if (isShort) { cv.textContent = 'КЗ'; c.className = 'card red'; bar.style.width = '100%'; return; }
      if (p.burned) { cv.textContent = 'Сгорела'; c.className = 'card dead'; bar.style.width = '0'; return; }
      cv.textContent = m && Number.isFinite(m[q]) ? fU(m[q], u) : (running ? '—' : 'стоп');
      const r = mx[q] && v != null ? v / mx[q] : null; c.querySelector('.bar').hidden = r == null;
      if (r != null) { bar.style.width = Math.min(100, r * 100).toFixed(1) + '%'; c.className = 'card ' + (r <= 0.7 ? 'green' : r <= 1 ? 'orange' : 'red'); } else c.className = 'card'; });
    const ex = $('#extra'); if (!ex) return;
    ex.textContent = '';
    const row = (k, v) => { const d = document.createElement('div'); const a = document.createElement('span'); a.textContent = k; const b = document.createElement('b'); b.textContent = v; d.append(a, b); ex.appendChild(d); };
    if (m && !isShort && m.extra) { row('Iб', fU(m.extra.Ib, 'А')); row('Uбэ', fU(m.extra.Vbe, 'В')); row('β = Iк/Iб', fmtNum(m.I / m.extra.Ib, 1)); }
  }

  /* ---------- «Расчёт» panel ---------- */
  function calc() {
    const el = $('#calc'), p = sel && part(sel.part);
    if (!p) { el.innerHTML = '<span class="muted">Выбери деталь, чтобы увидеть формулы с подставленными значениями.</span>'; return; }
    if (shortSet.has(p.id) || shorts.some(z => z.source === p.id)) { el.textContent = shortMessage(shorts[0], proj) + '. Токи не показаны: ограничены только внутренним сопротивлением источника (rInt).'; return; }
    const m = meas[p.id]; if (!m || !sim) { el.innerHTML = '<span class="muted">Запусти симуляцию (▶), чтобы рассчитать.</span>'; return; }
    const L = [], v = pin => sim.ctx.v(p, pin);
    if (p.type === 'resistor') {
      L.push(`<span class="f">Закон Ома:</span> I = U / R = ${fU(m.U, 'В')} / ${fU(p.props.R, 'Ом')} = <b>${fU(m.I, 'А')}</b>`);
      L.push(`<span class="f">Мощность:</span> P = U · I = ${fU(m.U, 'В')} · ${fU(m.I, 'А')} = <b>${fU(m.P, 'Вт')}</b> (= I²·R)  ${m.P > p.props.Pmax ? '<span class="bad">больше допустимых ' + fU(p.props.Pmax, 'Вт') + '</span>' : '<span class="ok">в норме, допустимо ' + fU(p.props.Pmax, 'Вт') + '</span>'}`);
    } else if (p.type === 'led' || p.type === 'diode') {
      L.push(`<span class="f">Напряжение:</span> U = φA − φK = ${fU(v('a'), 'В')} − ${fU(v('b'), 'В')} = <b>${fU(m.U, 'В')}</b>`);
      L.push(`<span class="f">Шокли:</span> I = Is·(e^(U/(n·Vt)) − 1) = <b>${fU(m.I, 'А')}</b>`);
      L.push(`<span class="f">Мощность:</span> P = U · I = ${fU(m.U, 'В')} · ${fU(m.I, 'А')} = <b>${fU(m.P, 'Вт')}</b>`);
      if (p.type === 'led') { const Vs = Netlist.supplyMax(proj), Rn = (Vs - p.props.Vf) / 0.015;
        L.push(`<span class="f">Подбор резистора:</span> R = (Uпит − Vf) / I = (${fU(Vs, 'В')} − ${fU(p.props.Vf, 'В')}) / 15 мА = ${fU(Rn, 'Ом')} → ближайший ряда E12: <b>${fU(e12up(Rn), 'Ом')}</b>`); }
    } else if (p.type === 'npn') {
      L.push(`Iк = <b>${fU(m.I, 'А')}</b>, Iб = <b>${fU(m.extra.Ib, 'А')}</b>, β = Iк / Iб = <b>${fmtNum(m.I / m.extra.Ib, 1)}</b> (hFE ≈ 200${m.I / m.extra.Ib < 150 ? ', значит транзистор в насыщении' : ''})`);
      L.push(`Iэ = Iк + Iб = ${fU(m.I, 'А')} + ${fU(m.extra.Ib, 'А')} = <b>${fU(m.I + m.extra.Ib, 'А')}</b>`);
      L.push(`P = Uкэ·Iк + Uбэ·Iб = ${fU(m.U, 'В')}·${fU(m.I, 'А')} + ${fU(m.extra.Vbe, 'В')}·${fU(m.extra.Ib, 'А')} = <b>${fU(m.P, 'Вт')}</b>`);
    } else {
      L.push(`U = <b>${fU(m.U, 'В')}</b>, I = <b>${fU(m.I, 'А')}</b>, P = U · I = <b>${fU(m.P, 'Вт')}</b>`);
    }
    // Kirchhoff's current law for each pin's node
    const N = sim.nets;
    for (const q of P[p.type].pins) {
      const root = N.netOf(p.id, q.id); if (N.groundRoots.has(root) && P[p.type].mcu) continue;
      const terms = [];
      for (const o of proj.parts) { const mo = meas[o.id]; if (!mo || !mo.pinI) continue;
        for (const [pin, i] of Object.entries(mo.pinI)) if (N.netOf(o.id, pin) === root && Math.abs(i) > 1e-9) terms.push([`${esc(o.id)}.${P[o.type].pins.find(z => z.id === pin).label}`, -i]); }
      if (terms.length < 2) continue;
      const sum = terms.reduce((a, t) => a + t[1], 0);
      L.push(`<span class="f">1-й закон Кирхгофа</span>, узел вывода ${q.label} (${fU(v(q.id), 'В')}): ΣI = ${terms.map(([n, i], k) => `${i < 0 ? '− ' : k ? '+ ' : ''}${fU(Math.abs(i), 'А')} <span class="muted">(${n})</span>`).join(' ')} = <b>${fU(Math.abs(sum) < 1e-7 ? 0 : sum, 'А')}</b>`);
    }
    if (P[p.type].pins.length === 2) L.push(`<span class="f">2-й закон Кирхгофа:</span> сумма падений напряжений в любом замкнутом контуре равна ЭДС источников. Падение на этой детали: ${fU(m.U, 'В')}`);
    el.innerHTML = L.join('<br>');
  }

  /* ---------- tooltip ---------- */
  function updateTip() {
    if (!hover) { tip.hidden = true; return; }
    const p = part(hover.part); if (!p) { tip.hidden = true; return; }
    const q = hover.pin && P[p.type].pins.find(z => z.id === hover.pin);
    tip.hidden = false; tip.textContent = q ? `${p.id} · ${q.hint || q.label}${running && sim && !shorts.length ? ' · ' + fU(sim.ctx.v(p, q.id), 'В') : ''}` : `${p.id}: ${running ? (shorts.length && (shortSet.has(p.id) || shorts.some(z => z.source === p.id)) ? 'КЗ' : triple(meas[p.id])) : P[p.type].name}`;
    const r = svg.getBoundingClientRect(); tip.style.left = (mouse.x - r.left + 14) + 'px'; tip.style.top = (mouse.y - r.top + 14) + 'px';
  }

  /* ---------- interaction ---------- */
  function pinchStart() { const [a, b] = [...pointers.values()]; drag = { pinch: true, d0: Math.hypot(a.x - b.x, a.y - b.y), s0: cam.s, c0: [(a.x + b.x) / 2, (a.y + b.y) / 2], cam0: { ...cam } }; }
  function zoomAt(cx, cy, s) { const r = svg.getBoundingClientRect(), mx = cx - r.left, my = cy - r.top; s = Math.min(4, Math.max(0.25, s));
    cam.x = mx - (mx - cam.x) * s / cam.s; cam.y = my - (my - cam.y) * s / cam.s; cam.s = s; }
  svg.addEventListener('pointerdown', e => {
    { const t = performance.now(), L = lastDown; lastDown = { t, x: e.clientX, y: e.clientY }; if (L && t - L.t < 400 && Math.hypot(e.clientX - L.x, e.clientY - L.y) < 6 && pointers.size === 0) { lastDown = null; onDbl(e); return; } }
    if (e.isPrimary) pointers.clear(); pointers.set(e.pointerId, { x: e.clientX, y: e.clientY }); try { svg.setPointerCapture(e.pointerId); } catch (_) {}
    if (pointers.size === 2) { if (drag && drag.press && P[drag.press.type].interactive === 'momentary') drag.press.on = false; pinchStart(); return; }
    if (pointers.size > 2) return;
    closeMenu(); const touch = e.pointerType === 'touch' || e.pointerType === 'pen';
    let pinEl = e.target.closest('.pin'), partEl = e.target.closest('.part'); let wireEl = bestWire(e.clientX, e.clientY, e.target.closest('.whit, .wire')); const bendEl = e.target.closest('.bend'), endEl = e.target.closest('.wend') || document.elementsFromPoint(e.clientX, e.clientY).find(el => el.classList && el.classList.contains('wend'));
    if (!pinEl && touch && !endEl && !bendEl) { const np = nearestPin(e.clientX, e.clientY, wireEl ? 7 : partEl ? 12 : 22); if (np) { pinEl = np.pinEl; partEl = np.partEl; } }
    if (pinEl && touch && !wireMode && !armed && !wiresAt({ part: partEl.dataset.part, pin: pinEl.dataset.pin }).length) { const w = wireNear(e.clientX, e.clientY, 8); if (w) { wireEl = w; pinEl = null; partEl = null; } }
    if (!pinEl && !wireEl && partEl && !e.target.closest('.knob, .btnp')) { const w = wireNear(e.clientX, e.clientY, touch ? 9 : 5); if (w) { wireEl = w; partEl = null; } }
    if (!pinEl) startLong(e);
    const knobEl = e.target.closest('.knob'); if (knobEl && partEl) { const p = part(partEl.dataset.part); sel = { part: p.id }; props(); drag = { knob: p, x0: e.clientX, y0: e.clientY, pos0: p.props.pos }; return; }
    if (endEl && !locked()) { const w = proj.wires.find(x => x.id === endEl.dataset.wire); if (w) { drag = { wend: w, end: endEl.dataset.end }; return; } }
    if (bendEl && !locked()) { const w = proj.wires.find(x => x.id === bendEl.dataset.wire); drag = { bend: w, i: +bendEl.dataset.i }; return; }
    if (pinEl && !locked() && !(running && P[part(partEl.dataset.part).type].interactive)) {
      const t = { part: partEl.dataset.part, pin: pinEl.dataset.pin };
      if (!armed) { const ws = wiresAt(t);
        if (touch && !wireMode && ws.length) { const k = t.part + ':' + t.pin; pinCycle = pinCycle && pinCycle.k === k ? { k, i: (pinCycle.i + 1) % ws.length } : { k, i: 0 };
          sel = { wire: ws[ws.length - 1 - pinCycle.i].id }; props(); calc(); render(); return; }
        armed = { ...t, pts: [] }; }
      else { if (armed.part !== t.part || armed.pin !== t.pin) { const ex = proj.wires.find(w => same(w.a, armed) && same(w.b, t) || same(w.a, t) && same(w.b, armed));
          if (ex) sel = { wire: ex.id }; else { const w = { id: uid('w'), a: { part: armed.part, pin: armed.pin }, b: t, pts: armed.pts.slice() }; proj.wires.push(w); sel = { wire: w.id }; } }
        armed = null; temp.setAttribute('d', ''); changed(); }
      render(); return;
    }
    if (armed && touch && !partEl && !wireEl) { drag = { pan: true, x: e.clientX - cam.x, y: e.clientY - cam.y, armTap: [e.clientX, e.clientY] }; return; }
    if (armed) { armed = null; temp.setAttribute('d', ''); render(); }
    if (partEl) { const p = part(partEl.dataset.part), d = P[p.type];
      sel = { part: p.id }; props(); calc();
      if (running && d.interactive) { p.on = d.interactive === 'toggle' ? !p.on : true; drag = { press: p }; render(); return; }
      if (locked()) { drag = { pan: true, x: e.clientX - cam.x, y: e.clientY - cam.y }; render(); return; }
      const [wx, wy] = toWorld(e.clientX, e.clientY); drag = { part: p, dx: wx - p.x, dy: wy - p.y }; render(); return; }
    if (wireEl) { sel = { wire: wireEl.dataset.wire }; pinCycle = null; props(); calc(); drag = { pan: true, x: e.clientX - cam.x, y: e.clientY - cam.y }; render(); return; }
    sel = null; props(); calc(); drag = { pan: true, x: e.clientX - cam.x, y: e.clientY - cam.y }; render();
  });
  svg.addEventListener('pointermove', e => {
    if (lp && Math.hypot(e.clientX - lp.x, e.clientY - lp.y) > 8) cancelLong();
    mouse = { x: e.clientX, y: e.clientY }; if (pointers.has(e.pointerId)) pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pe = e.target.closest && e.target.closest('.part'), pn = e.target.closest && e.target.closest('.pin');
    hover = pe ? { part: pe.dataset.part, pin: pn ? pn.dataset.pin : null } : null;
    if (drag && drag.pinch && pointers.size >= 2) { const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y), c = [(a.x + b.x) / 2, (a.y + b.y) / 2];
      cam = { ...drag.cam0 }; zoomAt(drag.c0[0], drag.c0[1], drag.s0 * d / Math.max(1, drag.d0)); cam.x += c[0] - drag.c0[0]; cam.y += c[1] - drag.c0[1]; if (!running) render(); }
    else if (drag && drag.part) { const [wx, wy] = toWorld(e.clientX, e.clientY); const nx = snap(wx - drag.dx), ny = snap(wy - drag.dy); if (nx !== drag.part.x || ny !== drag.part.y) { drag.part.x = nx; drag.part.y = ny; drag.moved = true; } if (!running) render(); }
    else if (drag && drag.knob) { drag.knob.props.pos = Math.min(1, Math.max(0, drag.pos0 + ((e.clientX - drag.x0) - (e.clientY - drag.y0)) / 150)); drag.moved = true; const i = document.querySelector('#props input[data-k="pos"]'); if (i) i.value = drag.knob.props.pos; prevV = null; if (!running) render(); }
    else if (drag && drag.bend) { const [wx, wy] = toWorld(e.clientX, e.clientY); drag.bend.pts[drag.i] = [snap(wx), snap(wy)]; drag.moved = true; if (!running) render(); }
    else if (drag && drag.wend) { const o = drag.wend[drag.end === 'a' ? 'b' : 'a'], [ax, ay] = pinPos(part(o.part), o.pin), [bx, by] = toWorld(e.clientX, e.clientY); temp.setAttribute('d', `M${ax} ${ay} L${bx} ${by}`); drag.moved = true; }
    else if (drag && drag.pan) { if (drag.armTap && Math.hypot(e.clientX - drag.armTap[0], e.clientY - drag.armTap[1]) < 8) return; drag.armTap = null; cam.x = e.clientX - drag.x; cam.y = e.clientY - drag.y; if (!running) render(); }
    if (armed) drawTemp(...toWorld(e.clientX, e.clientY));
    updateTip();
  });
  const up = e => { pointers.delete(e.pointerId); cancelLong(); if (drag && drag.pinch) { drag = null; return; }
    if (drag && drag.armTap && armed) { armed.pts.push(toWorld(...drag.armTap).map(snap)); drawTemp(...toWorld(...drag.armTap)); drag = null; render(); return; }
    if (drag && drag.wend) { const w = drag.wend, k = drag.end, o = w[k === 'a' ? 'b' : 'a']; drag = null; temp.setAttribute('d', '');
      const np = pinUnder(e.clientX, e.clientY); if (np && !(np.part === o.part && np.pin === o.pin) && !same(np, w[k])) { w[k] = np; changed(); } else render(); return; }
    if (drag && drag.press && P[drag.press.type].interactive === 'momentary') drag.press.on = false; if (drag && drag.moved) { autosave(); prevV = null; } drag = null; if (!running) render(); };
  svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up); window.addEventListener('pointerup', e => pointers.delete(e.pointerId), true); window.addEventListener('pointercancel', e => pointers.delete(e.pointerId), true);
  svg.addEventListener('pointerleave', () => { hover = null; updateTip(); });
  // double-click is detected manually: pointer capture + re-render swallow native dblclick events
  function onDbl(e) { const tg = document.elementFromPoint(e.clientX, e.clientY); if (!tg) return;
    const pg = tg.closest('.part'); if (pg && part(pg.dataset.part) && P[part(pg.dataset.part).type].display === 'hdmi') { openHdmi(); return; }
    if (locked()) return;
    const bendEl = tg.closest('.bend'); if (bendEl) { const w = proj.wires.find(x => x.id === bendEl.dataset.wire); w.pts.splice(+bendEl.dataset.i, 1); changed(); return; }
    const wireEl = tg.closest('.whit, .wire'); if (!wireEl) return; const w = proj.wires.find(x => x.id === wireEl.dataset.wire); if (!w) return;
    addBend(w, ...toWorld(e.clientX, e.clientY)); }
  svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, cam.s * Math.exp(-e.deltaY * 0.0015)); if (!running) render(); }, { passive: false });
  const same = (x, y) => x.part === y.part && x.pin === y.pin;
  const wiresAt = t => proj.wires.filter(w => same(w.a, t) || same(w.b, t));
  let wireMode = false, pinCycle = null, lp = null;
  function drawTemp(bx, by) { if (!armed) return; const [ax, ay] = pinPos(part(armed.part), armed.pin); temp.setAttribute('d', `M${ax} ${ay}` + armed.pts.map(q => ` L${q[0]} ${q[1]}`).join('') + ` L${bx} ${by}`); }
  function bestWire(cx, cy, hit) { if (!hit) return null; const c = document.elementsFromPoint(cx, cy).filter(el => el.classList && el.classList.contains('whit'));
    if (c.length < 2) return hit; let best = hit, bd = Infinity;
    for (const el of c) { const L = el.getTotalLength(), m = el.getScreenCTM(); if (!m) continue; for (let i = 0; i <= 48; i++) { const q = el.getPointAtLength(L * i / 48), d = Math.hypot(q.x * m.a + q.c * 0 + m.e - cx, q.y * m.d + m.f - cy); if (d < bd) { bd = d; best = el; } } }
    return best; }
  function wireNear(cx, cy, rad) { let best = null, bd = rad; for (const el of document.elementsFromPoint(cx, cy)) { if (!el.classList || !el.classList.contains('whit')) continue;
      const L = el.getTotalLength(), m = el.getScreenCTM(); if (!m) continue; for (let i = 0; i <= 64; i++) { const q = el.getPointAtLength(L * i / 64), d = Math.hypot(q.x * m.a + m.e - cx, q.y * m.d + m.f - cy); if (d < bd) { bd = d; best = el; } } } return best; }
  function nearestPin(cx, cy, rad) { let best = null, bd = rad; for (const el of partsL.querySelectorAll('.pin')) { const r = el.getBoundingClientRect(), d = Math.hypot(r.x + r.width / 2 - cx, r.y + r.height / 2 - cy);
    if (d < bd) { bd = d; best = el; } } return best ? { pinEl: best, partEl: best.closest('.part') } : null; }
  function pinUnder(cx, cy) { const tg = document.elementFromPoint(cx, cy); let pe = tg && tg.closest && tg.closest('.pin'); if (!pe) { const n = nearestPin(cx, cy, 22); pe = n && n.pinEl; }
    return pe ? { part: pe.closest('.part').dataset.part, pin: pe.dataset.pin } : null; }
  function startLong(e) { cancelLong(); if (e.pointerType === 'mouse' || locked()) return; const x = e.clientX, y = e.clientY, t0 = e.target; lp = { x, y, t: setTimeout(() => { lp = null; if (pointers.size > 1) return;
    if (drag && drag.part && drag.moved) return; drag = null; openMenu(x, y, t0); }, 500) }; }
  function cancelLong() { if (lp) { clearTimeout(lp.t); lp = null; } }
  function cancelArm() { armed = null; temp.setAttribute('d', ''); render(); }
  function addBend(w, wx, wy) { const Q = wirePts(w); let best = 0, bd = Infinity; for (let i = 0; i < Q.length - 1; i++) { const [x1, y1] = Q[i], [x2, y2] = Q[i + 1], L = (x2 - x1) ** 2 + (y2 - y1) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((wx - x1) * (x2 - x1) + (wy - y1) * (y2 - y1)) / L)), dd = Math.hypot(wx - x1 - t * (x2 - x1), wy - y1 - t * (y2 - y1)); if (dd < bd) { bd = dd; best = i; } }
    if (!w.pts || !w.pts.length) w.pts = Q.slice(1, -1).map(q => [q[0], q[1]]);
    const inner = w.pts.length === Q.length - 2 ? best : Math.min(best, w.pts.length); w.pts.splice(inner, 0, [snap(wx), snap(wy)]); sel = { wire: w.id }; changed(); }
  function dup() { const p = sel && part(sel.part); if (!p || locked()) return; const d = P[p.type]; addPart(p.type, p.x + 40, p.y + 40); const q = part(sel.part); q.props = clone(p.props); q.rot = p.rot; changed(); }
  /* context menu (long press / right click) and floating buttons: DOM via createElement/textContent only */
  const menu = document.createElement('div'); menu.id = 'ctxmenu'; menu.hidden = true; $('#center').appendChild(menu);
  const fdel = document.createElement('button'); fdel.id = 'wireDel'; fdel.className = 'fbtn danger'; fdel.textContent = '🗑 Удалить провод'; fdel.hidden = true; $('#center').appendChild(fdel);
  const fcan = document.createElement('button'); fcan.id = 'wireCancel'; fcan.className = 'fbtn'; fcan.textContent = '✕ Отменить провод'; fcan.hidden = true; $('#center').appendChild(fcan);
  fdel.addEventListener('pointerdown', e => e.stopPropagation()); fdel.onclick = () => { if (sel && sel.wire) del(); };
  fcan.addEventListener('pointerdown', e => e.stopPropagation()); fcan.onclick = cancelArm;
  menu.addEventListener('pointerdown', e => e.stopPropagation());
  function closeMenu() { menu.hidden = true; menu.textContent = ''; }
  function openMenu(cx, cy, t0) { if (locked()) return; const tg = t0 && t0.isConnected ? t0 : document.elementFromPoint(cx, cy); if (!tg || !tg.closest) return;
    const we = tg.closest('.whit, .wire') || wireNear(cx, cy, 9), pe = tg.closest('.part'), items = [];
    if (we) { const w = proj.wires.find(x => x.id === we.dataset.wire); if (!w) return; sel = { wire: w.id }; const [wx, wy] = toWorld(cx, cy);
      items.push(['🗑 Удалить провод', del, 'danger'], ['↯ Добавить изгиб', () => addBend(w, wx, wy)]); }
    else if (pe && part(pe.dataset.part)) { sel = { part: pe.dataset.part }; items.push(['🗑 Удалить', del, 'danger'], ['⟳ Повернуть', rotate], ['⧉ Дублировать', dup]); }
    else return;
    props(); calc(); render(); menu.textContent = '';
    for (const [t, fn, c] of items) { const b = document.createElement('button'); b.textContent = t; if (c) b.className = c; b.onclick = () => { closeMenu(); fn(); }; menu.appendChild(b); }
    const r = $('#center').getBoundingClientRect(); menu.hidden = false;
    menu.style.left = Math.max(4, Math.min(cx - r.left, r.width - menu.offsetWidth - 4)) + 'px'; menu.style.top = Math.max(4, Math.min(cy - r.top, r.height - menu.offsetHeight - 4)) + 'px'; }
  svg.addEventListener('contextmenu', e => { e.preventDefault(); if (!menu.hidden) return; cancelLong(); drag = null; openMenu(e.clientX, e.clientY); });
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target)) closeMenu(); }, true);
  function placeFloat() { const w = sel && sel.wire && !locked() && proj.wires.find(x => x.id === sel.wire), el = w && wiresL.querySelector(`.whit[data-wire="${CSS.escape(w.id)}"]`);
    if (el) { const L = el.getTotalLength(), q = el.getPointAtLength(L / 2), cw = $('#center').clientWidth; fdel.hidden = false;
      fdel.style.left = Math.max(4, Math.min(cam.x + q.x * cam.s - fdel.offsetWidth / 2, cw - fdel.offsetWidth - 4)) + 'px'; fdel.style.top = Math.max(4, cam.y + q.y * cam.s - fdel.offsetHeight - 14) + 'px'; }
    else fdel.hidden = true;
    fcan.hidden = !armed; }
  /* mobile bottom bar: sheets for parts / properties / code, and wire mode */
  function sheet(k) { const cur = document.body.dataset.sheet || ''; const nx = cur === k ? '' : k; document.body.dataset.sheet = nx;
    for (const [id, v] of [['mParts', 'parts'], ['mProps', 'props']]) $('#' + id).classList.toggle('on', nx === v);
    if (cur === 'code' && !desktop()) { $('#codePane').hidden = true; $('#codeTab').classList.remove('on'); $('#mCode').classList.remove('on'); } }
  $('#mParts').onclick = () => sheet('parts'); $('#mProps').onclick = () => sheet('props');
  $('#mCode').onclick = () => { $('#mParts').classList.remove('on'); $('#mProps').classList.remove('on'); const open = document.body.dataset.sheet !== 'code'; document.body.dataset.sheet = open ? 'code' : '';
    if ($('#codePane').hidden === open) $('#codeTab').click(); $('#mCode').classList.toggle('on', open); };
  $('#mWire').onclick = () => { wireMode = !wireMode; $('#mWire').classList.toggle('on', wireMode); $('#mWire').setAttribute('aria-pressed', String(wireMode)); if (!wireMode) cancelArm();
    showHint(wireMode ? 'Режим «Провод»: коснитесь первого вывода, затем второго. Пустое место — изгиб.' : 'Провод: коснитесь линии, чтобы выделить'); };
  $('#palette').addEventListener('click', () => { if (document.body.dataset.sheet === 'parts') sheet('parts'); });
  const hintEl = document.createElement('div'); hintEl.id = 'mhint'; hintEl.hidden = true; $('#center').appendChild(hintEl); let hintT = 0;
  function showHint(t) { hintEl.textContent = t; hintEl.hidden = false; clearTimeout(hintT); hintT = setTimeout(() => { hintEl.hidden = true; }, 3500); }
  function rotate() { if (locked()) return; const p = sel && part(sel.part); if (p) { p.rot = ((p.rot || 0) + 1) % 4; changed(); } }
  function del() { if (!sel || locked()) return; if (sel.part) { proj.parts = proj.parts.filter(p => p.id !== sel.part); proj.wires = proj.wires.filter(w => w.a.part !== sel.part && w.b.part !== sel.part); }
    if (sel.wire) proj.wires = proj.wires.filter(w => w.id !== sel.wire); sel = null; closeMenu(); changed(); }
  document.addEventListener('keydown', e => { if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z' || e.key === 'я' || e.code === 'KeyZ')) { e.preventDefault(); if (!locked()) undo(); return; }
    if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') rotate(); else if (e.key === 'Delete' || e.key === 'Backspace') del(); else if (e.key === 'Escape') { closeMenu(); cancelArm(); } });

  /* ---------- simulation ---------- */
  function tick() {
    const mcus = proj.parts.filter(p => P[p.type].mcu), gpioBy = {}; for (const id in extra) gpioBy[id] = extra[id].gpio; if (mcus[0]) gpioBy[mcus[0].id] = gpio;
    // v9: move the robot car first (motor rpm from the previous frame), so this frame's stamp already sees the new sensor readings
    if (window.RobotUI) RobotUI.onTick(proj, Math.min(0.05, Math.max(1e-4, lastT ? (performance.now() - lastT) / 1000 : 1 / 60)));
    const b = Netlist.build(proj, gpio, { gpioBy, vio: mcus[0] ? P[mcus[0].type].vio : 3.3 });
    // transient step: real time between frames (clamped), state re-keyed by owner part + ordinal so it survives netlist changes
    const now = performance.now(), dt = Math.min(0.05, Math.max(1e-4, lastT ? (now - lastT) / 1000 : 1 / 60)); lastT = now;
    const keys = elKeys(b.owners), st = { vC: {}, iL: {} };
    keys.forEach((k, i) => { if (k in simState.vC) st.vC[i] = simState.vC[k]; if (k in simState.iL) st.iL[i] = simState.iL[k]; });
    const sol = Solver.solve(b.circuit, { guess: prevV && prevV.length === b.circuit.nodeCount ? prevV : null, dt, state: st });
    if (sol.state) { simState = { vC: {}, iL: {} }; for (const i in sol.state.vC) simState.vC[keys[i]] = sol.state.vC[i]; for (const i in sol.state.iL) simState.iL[keys[i]] = sol.state.iL[i]; }
    for (const d of b.devs || []) d.step(sol, dt); // devices.js composite parts (motors, Li-ion, boost)
    simTime += dt;
    prevV = sol.v; const ctx = { ...b.ctx, v: (p, pin) => sol.v[b.ctx.n(p, pin)], supplyMax: () => Netlist.supplyMax(proj), dirty: () => { prevV = null; } };
    sim = { sol, nets: b.nets, ctx };
    let alert = sol.ok ? null : { level: 'burn', msg: sol.error };
    for (const p of proj.parts) { meas[p.id] = P[p.type].measure(p, sol, ctx); checks[p.id] = null; }
    // wire currents & flow animation
    const deg = {}; for (const w of proj.wires) for (const e of [w.a, w.b]) deg[e.part + ':' + e.pin] = (deg[e.part + ':' + e.pin] || 0) + 1;
    const pinI = e => meas[e.part]?.pinI?.[e.pin] ?? 0;
    for (const w of proj.wires) { const ia = -pinI(w.a), ib = pinI(w.b), da = deg[w.a.part + ':' + w.a.pin], db = deg[w.b.part + ':' + w.b.pin];
      w.I = db === 1 ? ib : da === 1 ? ia : (Math.abs(ia) < Math.abs(ib) ? ia : ib);
      const sp = Math.sign(w.I) * Math.min(6, Math.sqrt(Math.abs(w.I) * 1000) * 1.5); flowOff[w.id] = ((flowOff[w.id] || 0) + sp) % 1600; }
    shorts = Array.isArray(sol.shortCircuits) ? mapShorts(sol.shortCircuits, b.owners) : detectShorts({ proj, meas, sol }); shortSet = new Set(shorts.flatMap(z => z.path));
    const sig = shorts.map(z => z.source + ':' + z.path.join(',')).join('|');
    if (sig !== shortSig) { shortSig = sig; $('#shortMsg').textContent = shorts.length ? shortMessage(shorts[0], proj) : ''; $('#simText').hidden = !!shorts.length; $('#shortBox').hidden = !shorts.length; }
    if (shorts.length) { alert = { level: 'burn', msg: shortMessage(shorts[0], proj) };
      for (const z of shorts) for (const id of [z.source, ...z.path]) if (meas[id]) meas[id] = { ...meas[id], U: NaN, I: NaN, P: NaN, short: true }; }
    else for (const p of proj.parts) { const d = P[p.type], m = meas[p.id];
      if (m && d.check) { const c = d.check(p, m, ctx); checks[p.id] = c || null; if (c && (!alert || c.level === 'burn')) alert = c; } }
    // inputs for the sketch
    const mcu = mcus[0];
    links = {}; for (const p of proj.parts) { const d = P[p.type]; if (!d.display && !d.sensor) continue;
      let l = null; for (const m of mcus) { const x = linkState(p, m, b.nets, meas[p.id]); if (x.on) { l = { ...x, mcu: m.id }; break; } if (!l) l = x; } links[p.id] = l || linkState(p, null, b.nets, meas[p.id]); }
    for (const p of proj.parts) { const d = P[p.type];
      if (d.motor && p._st) { p._st.ang = (((p._st.ang || 0) + Math.max(-50, Math.min(50, (p._st.rpm || 0) * 6 * dt))) % 360 + 360) % 360; animT[p.id] = p._st.ang; } }
    const rfMods = proj.parts.filter(p => P[p.type].sensor === 'nrf' && links[p.id] && links[p.id].on);
    const sendIn = (w, m) => { const v = {}; for (const q of P[m.type].pins) { const g = P[m.type].gpioOf(q.id); if (g != null) v[g] = ctx.v(m, q.id); }
      const s = {}; for (const p of proj.parts) { const d = P[p.type], l = links[p.id]; if (!d.sensor || !l || !l.on || (l.mcu && l.mcu !== m.id)) continue; const pr = p.props;
        if (d.sensor === 'dht') { s.temp = pr.temp; s.hum = pr.hum; } else if (d.sensor === 'sonar') s.dist = pr.dist; else if (d.sensor === 'vl53') s.mm = pr.mm;
        else if (d.sensor === 'imu') s.imu = { pitch: pr.pitch, roll: pr.roll, acc: pr.acc, gz: pr.gz }; else if (d.sensor === 'nrf') { s.nrf = true; s.rfPeer = rfMods.some(o => o !== p); } }
      const tu = proj.robot && proj.robot.tune; if (tu) { const c = (v, hi) => Number.isFinite(+v) ? Math.max(0, Math.min(hi, +v)) : null; s.tune = { kp: c(tu.kp, 300), kd: c(tu.kd, 300), base: c(tu.base, 255) }; } // v11: PID sliders, clamped again (live edits)
      w.postMessage({ t: 'in', v, s }); };
    if (worker && mcu) sendIn(worker, mcu);
    for (const id in extra) { const m = part(id); if (m) sendIn(extra[id].w, m); }
    const a = $('#alert'); const txt = alert ? alert.msg : '';
    if (txt !== lastAlert) { lastAlert = txt; a.hidden = !alert; if (alert) { a.textContent = (shorts.length ? '' : alert.level === 'burn' ? '🔥 ' : '⚠ ') + alert.msg; a.className = alert.level; } }
    if (sel && sel.part && part(sel.part) && !!part(sel.part).burned !== !!$('#fix')) props();
    $('#status').textContent = shorts.length ? 'Пауза: короткое замыкание' : `Симуляция · t=${simTime.toFixed(2)} с · ${b.circuit.nodeCount} узлов · ${sol.iter} итер. Ньютона`;
    render(); live(); calc();
    raf = requestAnimationFrame(tick);
  }
  let simState = { vC: {}, iL: {} }, simTime = 0, lastT = 0;
  const elKeys = owners => { const c = {}; return owners.map(o => { c[o] = (c[o] || 0) + 1; return o + '#' + c[o]; }); };
  /* solver shortCircuits use element indices -> map to part ids (+ wires carrying the short current) */
  function mapShorts(list, owners) { const out = [];
    for (const z of list) { const src = owners[z.source]; const sp = src && part(src); if (!sp || !(P[sp.type].source || P[sp.type].mcu)) continue;
      const path = [...new Set(z.path.map(j => owners[j]).filter(id => id && id !== src && part(id) && !P[part(id).type].source && !P[part(id).type].mcu))];
      for (const w of proj.wires) if (Math.abs(w.I || 0) > 0.5 * Math.abs(z.current)) path.push(w.id);
      if (!out.some(o => o.source === src)) out.push({ source: src, path, current: Math.abs(z.current) }); }
    return out; }
  /* display/sensor modules: need power and a data pin on the same net as some MCU pin (protocol itself is not simulated) */
  let links = {}, imgs = {}, animT = {};
  function linkState(p, mcu, nets, m) {
    const d = P[p.type], data = d.dataPin || (d.pins.find(q => /^(DIN|DI|SDA|SIG|DATA|IN|TRIG|HDMI)$/.test(q.id)) || {}).id;
    if (!mcu) return { on: false, why: 'нет платы' };
    if (d.display === 'hdmi') { const a = nets.netOf ? nets.netOf(p.id, 'HDMI') : null, mb = P[mcu.type].pins.some(q => q.id === 'HDMI') && nets.netOf ? nets.netOf(mcu.id, 'HDMI') : null;
      return a != null && a === mb ? { on: true } : { on: false, why: 'Нет сигнала' }; }
    if (m && m.powered === false) return { on: false, why: 'нет питания' };
    if (!data || !nets.netOf) return { on: true };
    const n = nets.netOf(p.id, data); const ok = P[mcu.type].pins.some(q => P[mcu.type].gpioOf(q.id) != null && nets.netOf(mcu.id, q.id) === n);
    return ok ? { on: true } : { on: false, why: 'данные не подключены' };
  }
  const cv = {}; let hdmiThumbT = 0;
  function onFrame(k, bmp) {
    let c = cv[k]; if (!c) { c = cv[k] = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height; }
    c.getContext('2d').drawImage(bmp, 0, 0); bmp.close && bmp.close();
    if (k === 'hdmi') { const fc = $('#hdmiCanvas'); if (!$('#hdmiFull').hidden) fc.getContext('2d').drawImage(c, 0, 0);
      const t = performance.now(); if (t - hdmiThumbT < 100) return; hdmiThumbT = t;
      const th = cv.hth || (cv.hth = Object.assign(document.createElement('canvas'), { width: 320, height: 180 })); th.getContext('2d').drawImage(c, 0, 0, 320, 180); imgs.hdmi = th.toDataURL('image/png'); }
    else imgs[k] = c.toDataURL('image/png');
  }
  function lcdImage(lines) { const c = cv.lcd || (cv.lcd = Object.assign(document.createElement('canvas'), { width: 336, height: 84 })), g = c.getContext('2d');
    g.clearRect(0, 0, 336, 84); g.fillStyle = '#1b2a06'; g.font = 'bold 30px monospace'; g.textBaseline = 'top';
    lines.slice(0, 2).forEach((l, r) => [...String(l).slice(0, 16)].forEach((ch, i) => g.fillText(ch, 4 + i * 20.7, 6 + r * 40))); imgs.lcd = c.toDataURL('image/png'); }
  function onMod(m) { const target = proj.parts.find(p => P[p.type].display === m.k); if (!target) return;
    if (m.k === 'strip') { target._mod = { px: Array.isArray(m.px) ? m.px.slice(0, 256).map(x => x | 0) : [] }; }
    else if (m.k === 'matrix') target._mod = { rows: Array.isArray(m.rows) ? m.rows.slice(0, 8).map(x => x & 255) : [] };
    else if (m.k === 'servo') target._mod = { a: Math.max(0, Math.min(180, +m.a || 0)) };
    else if (m.k === 'lcd' && Array.isArray(m.lines)) { target._mod = {}; lcdImage(m.lines.map(String)); } }
  const con = $('#console');
  function log(s, cls) { const span = document.createElement('span'); if (cls) span.className = cls; span.textContent = s; con.appendChild(span); if (con.textContent.length > 20000) con.textContent = con.textContent.slice(-10000); con.scrollTop = 1e9; }
  /* sketch worker lifecycle: a crashed/hung worker (exception, OOM, infinite loop) is torn down, a fresh idle
   * worker is created right away, the console explains what happened, and the next Run uses the fresh worker. */
  let spare = null, crashes = 0;
  const newWorker = () => new Worker('worker.js?v=8');
  function takeWorker() { const w = spare || newWorker(); spare = null; return w; }
  function crash(msg) { if (!worker) return; worker.onmessage = worker.onerror = null; try { worker.terminate(); } catch (e) {} worker = null; gpio = {}; prevV = null; crashes++;
    try { spare = newWorker(); } catch (e) { spare = null; }
    log(msg + '\nВоркер перезапущен. Исправь код и нажми «Стоп» → «Запустить».\n', 'err'); showTab('console'); $('#status').textContent = 'Скетч упал — воркер перезапущен'; }
  /* v7: extra boards (2nd ESP32-C3 with NRF24 etc.) run their own sketch (proj.codes[id]) in their own worker */
  let extra = {}, rf = { sent: 0, delivered: 0, last: null };
  const gpioOf = id => (extra[id] ? extra[id].gpio : gpio) || {};
  function relayRf(fromId, m) {
    const mine = proj.parts.find(p => P[p.type].sensor === 'nrf' && links[p.id] && links[p.id].on && links[p.id].mcu === fromId); if (!mine) return;
    mine._txT = performance.now(); rf.sent++;
    const pkt = { t: 'rfin', addr: String(m.addr).slice(0, 40), ch: m.ch | 0, data: m.data };
    for (const p of proj.parts) { if (p === mine || P[p.type].sensor !== 'nrf' || !links[p.id] || !links[p.id].on) continue; const to = links[p.id].mcu;
      const w = to === (proj.parts.find(q => P[q.type].mcu) || {}).id ? worker : extra[to] && extra[to].w; if (w && to !== fromId) { w.postMessage(pkt); rf.delivered++; rf.last = { from: fromId, to, data: m.data }; } } }
  function onWorkerMsg(id, setGpio, m) {
    if (m.t === 'pin') { const g = setGpio(), s = g[m.pin] || (g[m.pin] = { mode: 'INPUT', val: 0 }); if (m.mode) s.mode = m.mode; if (m.val != null) s.val = m.val; }
    else if (m.t === 'mod') onMod(m); else if (m.t === 'frame' && (m.k === 'oled' || m.k === 'hdmi') && m.bmp) onFrame(m.k, m.bmp);
    else if (m.t === 'rf') relayRf(id, m);
    else if (m.t === 'log') log(m.s); else if (m.t === 'err') { log(m.s + '\n', 'err'); showTab('console'); } }
  function runExtra(m, code) {
    const e = extra[m.id] = { w: newWorker(), gpio: {}, hb: performance.now() };
    const kill = msg => { if (!extra[m.id]) return; try { e.w.terminate(); } catch (x) {} delete extra[m.id]; prevV = null; crashes++; log('[' + m.id + '] ' + msg + '\n', 'err'); showTab('console'); };
    e.kill = kill;
    e.w.onmessage = ev => { e.hb = performance.now(); const x = ev.data; if (x.t === 'log') log('[' + m.id + '] ' + x.s); else onWorkerMsg(m.id, () => e.gpio, x); };
    e.w.onerror = ev => { ev.preventDefault && ev.preventDefault(); kill('Скетч упал: ' + (ev.message || 'ошибка')); };
    e.w.postMessage({ t: 'start', code, board: P[m.type].mcu, mods: {} });
  }
  function runSketch(mcu) {
    worker = takeWorker(); lastHb = performance.now();
    const id = mcu.id; worker.onmessage = e => { lastHb = performance.now(); onWorkerMsg(id, () => gpio, e.data); };
    worker.onerror = e => { e.preventDefault && e.preventDefault(); const t = String(e.message || '');
      crash(/memory|allocation|Invalid array length|Invalid typed array length|buffer/i.test(t) ? 'Скетч упал: не хватило памяти (слишком большой массив?).' : 'Скетч упал: ' + (t || 'неизвестная ошибка') + '.'); };
    worker.onmessageerror = () => crash('Скетч упал: повреждённое сообщение.');
    const mods = {}; for (const p of proj.parts) { const d = P[p.type]; if (d.display === 'strip') mods.strip = Math.max(mods.strip || 0, d.n || 0); else if (d.display) mods[d.display] = 1; }
    worker.postMessage({ t: 'start', code: proj.code, board: P[mcu.type].mcu, mods });
    clearInterval(wd); wd = setInterval(() => { if (worker && performance.now() - lastHb > 2000) crash('Скетч остановлен: нет ответа 2 с (бесконечный цикл без delay или нехватка памяти).');
      for (const k in extra) if (performance.now() - extra[k].hb > 2000) extra[k].kill('Скетч остановлен: нет ответа 2 с.'); }, 500);
  }
  function start() {
    if (running) return; saveEditor(); autosave();
    proj.parts.forEach(p => { delete p.burned; delete p.on; delete p._mod; }); gpio = {}; imgs = {}; links = {}; prevV = null; simState = { vC: {}, iL: {} }; simTime = 0; lastT = 0; lastAlert = null; con.textContent = '';
    running = true; $('#run').disabled = true; $('#stop').disabled = false;
    proj.parts.forEach(p => { delete p._st; delete p._txT; delete p._low; delete p._duty; delete p._acc; delete p._vs; }); extra = {}; rf = { sent: 0, delivered: 0, last: null };
    const mcus = proj.parts.filter(p => P[p.type].mcu), mcu = mcus[0];
    if (mcu && proj.code.trim()) {
      runSketch(mcu);
    }
    for (const m of mcus.slice(1)) { const c = proj.codes && proj.codes[m.id]; if (c && c.trim()) runExtra(m, c); }
    if (!desktop()) { $('#codePane').hidden = true; $('#codeTab').classList.remove('on'); }
    tick();
  }
  function stop() {
    running = false; shorts = []; shortSet = new Set(); shortSig = ''; $('#shortBox').hidden = true; $('#simText').hidden = false; cancelAnimationFrame(raf); clearInterval(wd); if (worker) worker.terminate(); worker = null; gpio = {}; sim = null; for (const k in extra) try { extra[k].w.terminate(); } catch (e) {} extra = {};
    for (const k in meas) delete meas[k]; for (const k in checks) delete checks[k]; proj.parts.forEach(p => { delete p.burned; delete p._mod; }); links = {}; imgs = {};
    $('#run').disabled = false; $('#stop').disabled = true; $('#status').textContent = 'Остановлено'; $('#alert').hidden = true;
    render(); live(); calc(); if (window.RobotUI) RobotUI.onStop();
  }
  $('#run').onclick = start; $('#stop').onclick = stop;
  $('#codeTab').onclick = () => { if (desktop()) { $('#bottom').classList.remove('min'); $('#code').focus(); return; } const h = $('#codePane').hidden; $('#codePane').hidden = !h; $('#codeTab').classList.toggle('on', h); if (h) $('#code').focus(); };
  $('#code').oninput = () => { saveEditor(); autosave(); };
  /* code target: with 2+ boards a selector chooses whose sketch is in the editor (first board = proj.code) */
  let codeTarget = null, codeForSig = '';
  function saveEditor() { const v = $('#code').value, m = proj.parts.filter(p => P[p.type].mcu);
    if (codeTarget && m[0] && codeTarget !== m[0].id && m.some(p => p.id === codeTarget)) { proj.codes = proj.codes || {}; proj.codes[codeTarget] = v; } else proj.code = v; }
  function syncCodeFor() { const sel2 = $('#codeFor'); if (!sel2) return; const m = proj.parts.filter(p => P[p.type].mcu), sig = m.map(p => p.id).join(',');
    if (sig === codeForSig) return; codeForSig = sig; sel2.textContent = '';
    for (const p of m) { const o = document.createElement('option'); o.value = p.id; o.textContent = p.id + ' · ' + P[p.type].name; sel2.appendChild(o); }
    sel2.hidden = m.length < 2; if (!m.some(p => p.id === codeTarget)) codeTarget = m[0] ? m[0].id : null; sel2.value = codeTarget || ''; }
  function setCodeTarget(id) { saveEditor(); const m = proj.parts.filter(p => P[p.type].mcu); codeTarget = id; $('#code').value = m[0] && id !== m[0].id ? (proj.codes && proj.codes[id]) || '' : proj.code || ''; $('#codeFor').value = id; }
  $('#codeFor').onchange = e => setCodeTarget(e.target.value);
  $('#code').addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); document.execCommand('insertText', false, '  '); } });

  /* ---------- bottom panel ---------- */
  function showTab(t) { document.querySelectorAll('.tabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === t)); $('#calc').hidden = t !== 'calc'; con.hidden = t !== 'console'; $('#bottom').classList.remove('min'); }
  document.querySelectorAll('.tabs [data-tab]').forEach(b => b.onclick = () => showTab(b.dataset.tab));
  $('#collapse').onclick = () => { const f = $('#bottom'); f.classList.toggle('min'); $('#collapse').textContent = f.classList.contains('min') ? '▴' : '▾'; };

  /* ---------- projects ---------- */
  const saved = () => { try { const o = JSON.parse(localStorage.getItem(LS)); return o && typeof o === 'object' && !Array.isArray(o) ? o : {}; } catch (e) { return {}; } };
  function projList(selName) {
    const sel_ = $('#projects'); sel_.textContent = '';
    const opt = (v, t, on) => { const o = document.createElement('option'); o.value = v; o.textContent = t; if (on) o.selected = true; return o; };
    sel_.appendChild(opt('', '— проекты —'));
    const g1 = document.createElement('optgroup'); g1.label = 'Примеры'; Object.keys(window.EXAMPLES).forEach(n => g1.appendChild(opt('ex:' + n, n))); sel_.appendChild(g1);
    const g2 = document.createElement('optgroup'); g2.label = 'Сохранённые'; Object.keys(saved()).forEach(n => g2.appendChild(opt('my:' + n, n.slice(0, 64), n === selName))); sel_.appendChild(g2);
  }
  function open(data) { stop(); codeTarget = null; codeForSig = ''; proj = sanitizeProject(data); proj.code = proj.code ?? DEFAULT_CODE; $('#code').value = proj.code; sel = null; fit(); changed(); if (window.RobotUI) RobotUI.onOpen(); }
  $('#projects').onchange = e => { const v = e.target.value; if (!v) return; open(v.startsWith('ex:') ? window.EXAMPLES[v.slice(3)] : (Object.prototype.hasOwnProperty.call(saved(), v.slice(3)) ? saved()[v.slice(3)] : {})); };
  $('#save').onclick = () => { let n = prompt('Название проекта:', proj.name || 'Мой проект'); if (!n) return; n = String(n).slice(0, 64); proj.name = n; proj.code = $('#code').value;
    const s = saved(); s[n] = { ...strip(proj), name: n }; localStorage.setItem(LS, JSON.stringify(s)); projList(n); $('#status').textContent = 'Сохранено: ' + n; };
  /* new-project chooser (cards built with createElement/textContent only) */
  const NEWP = [['esp32', '📶', 'ESP32', 'Wi-Fi плата, 3,3 В, мигалка'], ['esp8266', '📡', 'ESP8266', 'NodeMCU, кнопка и светодиод'], ['uno', '🟦', 'Arduino Uno', '5 В, матрица 8×8 MAX7219'], ['esp32c3', '🔹', 'ESP32-C3 SuperMini', 'RISC-V, 3,3 В, LED на GPIO8'], ['line', '🤖', 'Робот по линии', 'ESP32-C3, 2×TCRT5000, DRV8833, 2 мотора TT, 103450'], ['car', '🏎', 'Робот-машинка', 'Шасси, колёса, датчики и трасса с чёрной линией'],
    ['attiny', '🐜', 'ATtiny85 на макетке', 'DIP-8 чип, батарейка, светодиод'], ['pico', '🍓', 'Raspberry Pi Pico', '3,3 В, лента WS2812'], ['opi', '🖥', 'Orange Pi (Python + HDMI)', 'Python, монитор 1920×1080'],
    ['analog', '🔋', 'Чистая электроника', 'Батарейка, резистор, светодиод'], ['empty', '⬜', 'Пустой', 'Чистый лист']];
  function newDialog() { const m = $('#newModal'), g = $('#newCards'); g.textContent = '';
    for (const [k, ic, nm, ln] of NEWP) { const b = document.createElement('button'); b.className = 'ncard'; b.dataset.kind = k;
      const i = document.createElement('span'); i.className = 'nic'; i.textContent = ic; const t = document.createElement('b'); t.textContent = nm; const s2 = document.createElement('span'); s2.className = 'muted'; s2.textContent = ln;
      b.append(i, t, s2); b.onclick = () => { m.hidden = true; const st = window.STARTERS && window.STARTERS[k]; open(st ? JSON.parse(JSON.stringify(st)) : { parts: [], wires: [], code: '' }); }; g.appendChild(b); }
    m.hidden = false; }
  $('#new').onclick = newDialog; $('#newClose').onclick = () => { $('#newModal').hidden = true; };
  $('#newModal').addEventListener('click', e => { if (e.target.id === 'newModal') e.target.hidden = true; });
  function openHdmi() { const o = $('#hdmiFull'), fc = $('#hdmiCanvas'); o.hidden = false; const g = fc.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, 1920, 1080);
    if (cv.hdmi) g.drawImage(cv.hdmi, 0, 0); else { g.fillStyle = '#888'; g.font = '64px sans-serif'; g.textAlign = 'center'; g.fillText('Нет сигнала', 960, 540); g.textAlign = 'start'; } }
  $('#hdmiClose').onclick = () => { $('#hdmiFull').hidden = true; };
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { $('#hdmiFull').hidden = true; $('#newModal').hidden = true; } });
  /* desktop: code editor docks into the bottom panel, Serial on the right */
  const desktop = () => window.matchMedia('(min-width: 900px)').matches;
  function layout() { const cp = $('#codePane'), dock = $('#codeDock'); if (!dock) return;
    if (desktop()) { if (cp.parentNode !== dock) dock.appendChild(cp); cp.hidden = false; document.body.classList.add('dock'); }
    else { if (cp.parentNode === dock) $('#center').appendChild(cp); document.body.classList.remove('dock'); } }
  window.matchMedia('(min-width: 900px)').addEventListener('change', layout);
  $('#export').onclick = () => { proj.code = $('#code').value; const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ ...strip(proj), format: 'circuitsim/1' }, null, 2)], { type: 'application/json' })); a.download = (proj.name || 'circuit') + '.json'; a.click(); };
  $('#import').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { if (f.size > window.SANITIZE_LIMITS.importBytes) throw new Error('файл больше 2 МБ');
    open(parseProjectText(await f.text())); } catch (err) { alert('Не удалось импортировать: ' + err.message); } e.target.value = ''; };
  function fit() { if (!proj.parts.length) return; const xs = proj.parts.map(p => p.x), ys = proj.parts.map(p => p.y), r = svg.getBoundingClientRect();
    cam.s = Math.min(1, Math.max(0.4, Math.min(r.width / (Math.max(...xs) - Math.min(...xs) + 200), r.height / (Math.max(...ys) - Math.min(...ys) + 200))));
    cam.x = r.width / 2 - cam.s * (Math.min(...xs) + Math.max(...xs)) / 2; cam.y = r.height / 2 - cam.s * (Math.min(...ys) + Math.max(...ys)) / 2; }

  $('#showShort').onclick = () => { const z = shorts[0]; if (!z) return; const ids = new Set([z.source, ...z.path]), pts = [];
    for (const p of proj.parts) if (ids.has(p.id)) pts.push([p.x, p.y]); for (const w of proj.wires) if (ids.has(w.id)) pts.push(...wirePts(w));
    const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]), r = svg.getBoundingClientRect(), w = Math.max(...xs) - Math.min(...xs) + 160, h = Math.max(...ys) - Math.min(...ys) + 160;
    cam.s = Math.min(2.5, Math.max(0.25, Math.min(r.width / w, r.height / h))); cam.x = r.width / 2 - cam.s * (Math.min(...xs) + Math.max(...xs)) / 2; cam.y = r.height / 2 - cam.s * (Math.min(...ys) + Math.max(...ys)) / 2; render(); };
  lastJ = JSON.stringify(strip(proj));
  layout(); palette(); projList(); $('#code').value = proj.code ?? DEFAULT_CODE; fit(); render(); props(); calc();
  window.addEventListener('resize', () => { if (!running) render(); });
  window.__sim = { get proj() { return proj; }, get running() { return running; }, changed() { changed(); }, select(id) { sel = id && part(id) ? { part: id } : null; render(); props(); }, get sel() { return sel; }, get wireMode() { return wireMode; }, get armed() { return armed; }, get meas() { return meas; }, start, stop, undo, get gpio() { return gpio; }, get shorts() { return shorts; }, get crashes() { return crashes; }, get simTime() { return simTime; }, get hasWorker() { return !!worker; }, get worker() { return worker; }, get hasSpare() { return !!spare; }, get rf() { return rf; }, get extra() { return Object.keys(extra); }, codeFor: id => setCodeTarget(id), get cam() { return cam; }, render: () => render(), select: id => { sel = { part: id }; props(); calc(); render(); } };
})();
