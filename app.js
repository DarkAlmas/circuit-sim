(function () {
  'use strict';
  const P = window.PARTS, $ = s => document.querySelector(s);
  const svg = $('#svg'), view = $('#view'), wiresL = $('#wires'), partsL = $('#partsL'), temp = $('#temp'), tip = $('#tip');
  const LS = 'circuitsim.projects', AUTO = 'circuitsim.autosave';
  const DEFAULT_CODE = window.EXAMPLES[Object.keys(window.EXAMPLES)[0]].code;
  let proj = load(), cam = { x: 500, y: 330, s: 1 }, sel = null, armed = null, drag = null, hover = null, mouse = { x: 0, y: 0 };
  let running = false, worker = null, gpio = {}, lastHb = 0, sim = null, prevV = null, raf = 0, wd = 0, lastAlert = '';
  const meas = {}, checks = {}, flowOff = {};

  function load() { try { const a = JSON.parse(localStorage.getItem(AUTO)); if (a && a.parts) return sanitizeProject(a); } catch (e) {} return sanitizeProject(window.EXAMPLES[Object.keys(window.EXAMPLES)[0]]); }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function autosave() { localStorage.setItem(AUTO, JSON.stringify(strip(proj))); }
  function strip(p) { return { parts: p.parts.map(({ id, type, x, y, rot, props }) => ({ id, type, x, y, rot, props })), wires: p.wires.map(({ id, a, b, pts }) => ({ id, a, b, pts })), code: p.code, name: p.name }; }
  const uid = pre => { let i = 1; const ids = new Set([...proj.parts, ...proj.wires].map(o => o.id)); while (ids.has(pre + i)) i++; return pre + i; };
  const part = id => proj.parts.find(p => p.id === id);
  const rotPt = (x, y, r) => { for (let i = 0; i < (r || 0) % 4; i++) [x, y] = [-y, x]; return [x, y]; };
  function pinPos(p, pin) { const q = P[p.type].pins.find(q => q.id === pin); const [x, y] = rotPt(q.x, q.y, p.rot); return [p.x + x, p.y + y]; }
  function bbox(type) { const ps = P[type].pins; let x0 = Math.min(...ps.map(q => q.x)), x1 = Math.max(...ps.map(q => q.x)), y0 = Math.min(...ps.map(q => q.y)), y1 = Math.max(...ps.map(q => q.y));
    if (P[type].mcu) { x0 = -72; x1 = 72; y0 = Math.min(y0 - 32, -60); y1 = Math.max(y1 + 22, 60); }
    if (x1 - x0 < 50) { x0 = Math.min(x0, -25); x1 = Math.max(x1, 25); } if (y1 - y0 < 40) { y0 = Math.min(y0, -22); y1 = Math.max(y1, 22); }
    return [x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8]; }
  const toWorld = (cx, cy) => { const r = svg.getBoundingClientRect(); return [(cx - r.left - cam.x) / cam.s, (cy - r.top - cam.y) / cam.s]; };
  const snap = v => Math.round(v / 10) * 10;
  const fU = (x, u) => fmtUnit(x, u);
  const triple = m => m ? `${fU(m.U, 'В')} · ${fU(Math.abs(m.I), 'А')} · ${fU(m.P, 'Вт')}` : 'нет данных';

  /* ---------- palette ---------- */
  const GROUPS = ['Платы', 'Питание', 'Пассивные', 'Полупроводники', 'Ввод/вывод'];
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
    const d = P[type]; const p = { id: uid(d.mcu ? 'U' : { resistor: 'R', led: 'D', diode: 'D', npn: 'Q', button: 'S', switch: 'S', pot: 'RV', dc: 'V', battery: 'B', gnd: 'G', voltmeter: 'PV', ammeter: 'PA' }[type] || 'X'), type, x: snap(x), y: snap(y), rot: 0, props: clone(d.props || {}) };
    proj.parts.push(p); sel = { part: p.id }; changed();
  }

  /* ---------- rendering ---------- */
  function wireColor(w, N) { const r = N.netOf(w.a.part, w.a.pin); if (N.groundRoots.has(r)) return '#9aa3b5'; if (N.plusRoots.has(r)) return '#e5484d'; return '#3fb37f'; }
  function wirePath(w) { const [ax, ay] = pinPos(part(w.a.part), w.a.pin), [bx, by] = pinPos(part(w.b.part), w.b.pin); const mx = snap((ax + bx) / 2); return `M${ax} ${ay} H${mx} V${by} H${bx}`; }
  function render() {
    view.setAttribute('transform', `translate(${cam.x} ${cam.y}) scale(${cam.s})`);
    proj.wires = proj.wires.filter(w => part(w.a.part) && part(w.b.part));
    const N = Netlist.nets(proj);
    wiresL.innerHTML = proj.wires.map(w => { const d = wirePath(w), c = wireColor(w, N);
      const black = N.groundRoots.has(N.netOf(w.a.part, w.a.pin));
      return `<path d="${d}" class="wire${sel && sel.wire === w.id ? ' sel' : ''}" data-wire="${esc(w.id)}" stroke="${black ? '#0b0d12' : c}" ${black ? 'class="gndw"' : ''}/>` +
        (running && Math.abs(w.I || 0) > 1e-6 ? `<path d="${d}" class="flow" stroke-dashoffset="${-(flowOff[w.id] || 0)}"/>` : ''); }).join('');
    partsL.innerHTML = proj.parts.map(p => { const d = P[p.type], [bx, by, bw, bh] = bbox(p.type), c = checks[p.id];
      const st = { I: meas[p.id]?.I, m: meas[p.id], burned: p.burned, led2: running && gpio[2]?.mode === 'OUTPUT' && gpio[2].val > 0 };
      return `<g class="part${sel && sel.part === p.id ? ' sel' : ''}${c ? ' ' + c.level : ''}" data-part="${esc(p.id)}" transform="translate(${p.x} ${p.y}) rotate(${(p.rot || 0) * 90})">
        <rect class="hit" x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="6"/>${d.draw(p, st)}
        ${d.pins.map(q => `<circle class="pin${armed && armed.part === p.id && armed.pin === q.id ? ' armed' : ''}" data-pin="${q.id}" cx="${q.x}" cy="${q.y}" r="3.5"><title>${q.label}</title></circle>`).join('')}</g>`; }).join('');
    $('#boardName').textContent = (proj.parts.find(p => P[p.type].mcu) && P[proj.parts.find(p => P[p.type].mcu).type].name) || 'нет платы (добавь ESP32 или ESP8266)';
    updateTip();
  }
  function changed() { prevV = null; autosave(); render(); props(); calc(); }

  /* ---------- properties panel ---------- */
  const PROP_UI = { V: ['Напряжение, В', 'number', 0.1], R: ['Сопротивление, Ом', 'number', 1], Pmax: ['Допустимая мощность, Вт', 'number', 0.05], pos: ['Положение движка', 'range', 0.01], Vf: ['Прямое напряжение Vf, В', 'number', 0.1], Imax: ['Макс. ток, А', 'number', 0.001] };
  function props() {
    const el = $('#props');
    if (sel && sel.wire) { el.innerHTML = `<p>Провод ${esc(sel.wire)}</p><div class="row"><button id="del">Удалить</button></div>`; $('#del').onclick = del; return; }
    const p = sel && part(sel.part); if (!p) { el.innerHTML = '<p class="muted">Выбери деталь или провод</p>'; return; }
    const d = P[p.type];
    el.innerHTML = `<p><b>${esc(p.id)}</b> — ${d.name}</p>` + Object.keys(p.props || {}).map(k => k === 'color'
      ? `<label class="prop">Цвет<select data-k="color">${Object.keys(LED_COLORS).map(c => `<option${c === p.props.color ? ' selected' : ''}>${esc(c)}</option>`).join('')}</select></label>`
      : `<label class="prop">${PROP_UI[k][0]}<input data-k="${k}" type="${PROP_UI[k][1]}" step="${PROP_UI[k][2]}" ${k === 'pos' ? 'min="0" max="1"' : 'min="0"'} value="${esc(p.props[k])}"></label>`).join('') +
      (p.burned ? '<p class="bad">Сгорел. Замени: кнопка ниже.</p><div class="row"><button id="fix">Заменить новым</button></div>' : '') +
      `<div class="row"><button id="rot">⟳ Повернуть (R)</button><button id="del">Удалить</button></div>`;
    el.querySelectorAll('[data-k]').forEach(i => i.oninput = () => { const k = i.dataset.k;
      p.props[k] = k === 'color' ? i.value : +i.value; if (k === 'color') { p.props.Vf = LED_COLORS[i.value][1]; props(); } prevV = null; autosave(); if (!running) render(); calc(); });
    $('#rot').onclick = rotate; $('#del').onclick = del; if ($('#fix')) $('#fix').onclick = () => { delete p.burned; delete checks[p.id]; changed(); };
  }
  function live() {
    const p = sel && part(sel.part), el = $('#live');
    if (!p) { el.innerHTML = '—'; return; } const m = meas[p.id];
    if (!m) { el.innerHTML = running ? 'нет данных' : 'Запусти симуляцию'; return; }
    el.innerHTML = `<div>U <b>${fU(m.U, 'В')}</b></div><div>I <b>${fU(m.I, 'А')}</b></div><div>P <b>${fU(m.P, 'Вт')}</b></div>` +
      (m.extra ? `<div>Iб <b>${fU(m.extra.Ib, 'А')}</b></div><div>Uбэ <b>${fU(m.extra.Vbe, 'В')}</b></div><div>β = Iк/Iб <b>${fmtNum(m.I / m.extra.Ib, 1)}</b></div>` : '') +
      Object.entries(m.pinI || {}).map(([k, i]) => `<div>вывод ${P[p.type].pins.find(q => q.id === k).label} <span>${fU(sim.ctx.v(p, k), 'В')}, ${fU(i, 'А')}</span></div>`).join('');
  }

  /* ---------- «Расчёт» panel ---------- */
  function calc() {
    const el = $('#calc'), p = sel && part(sel.part);
    if (!p) { el.innerHTML = '<span class="muted">Выбери деталь, чтобы увидеть формулы с подставленными значениями.</span>'; return; }
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
    const p = part(hover); if (!p) { tip.hidden = true; return; }
    tip.hidden = false; tip.textContent = `${p.id}: ${running ? triple(meas[p.id]) : P[p.type].name}`;
    const r = svg.getBoundingClientRect(); tip.style.left = (mouse.x - r.left + 14) + 'px'; tip.style.top = (mouse.y - r.top + 14) + 'px';
  }

  /* ---------- interaction ---------- */
  svg.addEventListener('pointerdown', e => {
    const pinEl = e.target.closest('.pin'), partEl = e.target.closest('.part'), wireEl = e.target.closest('.wire');
    if (pinEl && !(running && P[part(partEl.dataset.part).type].interactive)) {
      const t = { part: partEl.dataset.part, pin: pinEl.dataset.pin };
      if (!armed) armed = t;
      else { if (armed.part !== t.part || armed.pin !== t.pin) { const w = { id: uid('w'), a: armed, b: t }; proj.wires.push(w); sel = { wire: w.id }; } armed = null; temp.setAttribute('d', ''); changed(); }
      render(); return;
    }
    if (armed) { armed = null; temp.setAttribute('d', ''); render(); }
    if (partEl) { const p = part(partEl.dataset.part), d = P[p.type];
      sel = { part: p.id }; props(); calc(); live();
      if (running && d.interactive) { p.on = d.interactive === 'toggle' ? !p.on : true; drag = { press: p }; render(); return; }
      const [wx, wy] = toWorld(e.clientX, e.clientY); drag = { part: p, dx: wx - p.x, dy: wy - p.y }; svg.setPointerCapture(e.pointerId); render(); return; }
    if (wireEl) { sel = { wire: wireEl.dataset.wire }; props(); render(); return; }
    sel = null; props(); calc(); live(); drag = { pan: true, x: e.clientX - cam.x, y: e.clientY - cam.y }; svg.setPointerCapture(e.pointerId); render();
  });
  svg.addEventListener('pointermove', e => {
    mouse = { x: e.clientX, y: e.clientY };
    const pe = e.target.closest && e.target.closest('.part'); hover = pe ? pe.dataset.part : null;
    if (drag && drag.part) { const [wx, wy] = toWorld(e.clientX, e.clientY); drag.part.x = snap(wx - drag.dx); drag.part.y = snap(wy - drag.dy); drag.moved = true; if (!running) render(); }
    else if (drag && drag.pan) { cam.x = e.clientX - drag.x; cam.y = e.clientY - drag.y; if (!running) render(); }
    if (armed) { const [ax, ay] = pinPos(part(armed.part), armed.pin), [bx, by] = toWorld(e.clientX, e.clientY); temp.setAttribute("d", `M${ax} ${ay} L${bx} ${by}`); }
    updateTip();
  });
  svg.addEventListener('pointerup', () => { if (drag && drag.press && P[drag.press.type].interactive === 'momentary') drag.press.on = false; if (drag && drag.moved) autosave(); drag = null; if (!running) render(); });
  svg.addEventListener('pointerleave', () => { hover = null; updateTip(); });
  svg.addEventListener('wheel', e => { e.preventDefault(); const r = svg.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
    const k = Math.exp(-e.deltaY * 0.0015), s = Math.min(4, Math.max(0.25, cam.s * k)); cam.x = mx - (mx - cam.x) * s / cam.s; cam.y = my - (my - cam.y) * s / cam.s; cam.s = s; if (!running) render(); }, { passive: false });
  function rotate() { const p = sel && part(sel.part); if (p) { p.rot = ((p.rot || 0) + 1) % 4; changed(); } }
  function del() { if (!sel) return; if (sel.part) { proj.parts = proj.parts.filter(p => p.id !== sel.part); proj.wires = proj.wires.filter(w => w.a.part !== sel.part && w.b.part !== sel.part); }
    if (sel.wire) proj.wires = proj.wires.filter(w => w.id !== sel.wire); sel = null; changed(); }
  document.addEventListener('keydown', e => { if (/INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName)) return;
    if (e.key === 'r' || e.key === 'R' || e.key === 'к' || e.key === 'К') rotate(); else if (e.key === 'Delete' || e.key === 'Backspace') del(); else if (e.key === 'Escape') { armed = null; temp.setAttribute('d', ''); render(); } });

  /* ---------- simulation ---------- */
  function tick() {
    const b = Netlist.build(proj, gpio);
    const sol = Solver.solve(b.circuit, { guess: prevV && prevV.length === b.circuit.nodeCount ? prevV : null });
    prevV = sol.v; const ctx = { ...b.ctx, v: (p, pin) => sol.v[b.ctx.n(p, pin)], supplyMax: () => Netlist.supplyMax(proj), dirty: () => { prevV = null; } };
    sim = { sol, nets: b.nets, ctx };
    let alert = sol.ok ? null : { level: 'burn', msg: sol.error };
    for (const p of proj.parts) { const d = P[p.type]; const m = d.measure(p, sol, ctx); meas[p.id] = m; checks[p.id] = null;
      if (m && d.check) { const c = d.check(p, m, ctx); checks[p.id] = c || null; if (c && (!alert || c.level === 'burn')) alert = c; } }
    // wire currents & flow animation
    const deg = {}; for (const w of proj.wires) for (const e of [w.a, w.b]) deg[e.part + ':' + e.pin] = (deg[e.part + ':' + e.pin] || 0) + 1;
    const pinI = e => meas[e.part]?.pinI?.[e.pin] ?? 0;
    for (const w of proj.wires) { const ia = -pinI(w.a), ib = pinI(w.b), da = deg[w.a.part + ':' + w.a.pin], db = deg[w.b.part + ':' + w.b.pin];
      w.I = db === 1 ? ib : da === 1 ? ia : (Math.abs(ia) < Math.abs(ib) ? ia : ib);
      const sp = Math.sign(w.I) * Math.min(6, Math.sqrt(Math.abs(w.I) * 1000) * 1.5); flowOff[w.id] = ((flowOff[w.id] || 0) + sp) % 1600; }
    // inputs for the sketch
    const mcu = proj.parts.find(p => P[p.type].mcu);
    if (worker && mcu) { const v = {}; for (const q of P[mcu.type].pins) { const g = P[mcu.type].gpioOf(q.id); if (g != null) v[g] = ctx.v(mcu, q.id); } worker.postMessage({ t: 'in', v }); }
    const a = $('#alert'); const txt = alert ? alert.msg : '';
    if (txt !== lastAlert) { lastAlert = txt; a.hidden = !alert; if (alert) { a.textContent = (alert.level === 'burn' ? '🔥 ' : '⚠ ') + alert.msg; a.className = alert.level; } }
    $('#status').textContent = `Симуляция · ${b.circuit.nodeCount} узлов · ${sol.iter} итер. Ньютона`;
    render(); live(); calc();
    raf = requestAnimationFrame(tick);
  }
  const con = $('#console');
  function log(s, cls) { const span = document.createElement('span'); if (cls) span.className = cls; span.textContent = s; con.appendChild(span); if (con.textContent.length > 20000) con.textContent = con.textContent.slice(-10000); con.scrollTop = 1e9; }
  function start() {
    if (running) return; proj.code = $('#code').value; autosave();
    proj.parts.forEach(p => { delete p.burned; delete p.on; }); gpio = {}; prevV = null; lastAlert = null; con.textContent = '';
    running = true; $('#run').disabled = true; $('#stop').disabled = false;
    const mcu = proj.parts.find(p => P[p.type].mcu);
    if (mcu && proj.code.trim()) {
      worker = new Worker('worker.js?v=2'); lastHb = performance.now();
      worker.onmessage = e => { const m = e.data; lastHb = performance.now();
        if (m.t === 'pin') { const s = gpio[m.pin] || (gpio[m.pin] = { mode: 'INPUT', val: 0 }); if (m.mode) s.mode = m.mode; if (m.val != null) { s.val = m.val; if (s.mode !== 'OUTPUT' && m.val != null && !m.mode) s.mode = s.mode; } }
        else if (m.t === 'log') log(m.s); else if (m.t === 'err') { log(m.s + '\n', 'err'); showTab('console'); } };
      worker.onerror = e => { log('Ошибка скетча: ' + e.message + '\n', 'err'); showTab('console'); };
      worker.postMessage({ t: 'start', code: proj.code, board: P[mcu.type].mcu });
      wd = setInterval(() => { if (worker && performance.now() - lastHb > 2000) { worker.terminate(); worker = null; gpio = {}; prevV = null;
        log('Скетч остановлен: нет ответа 2 с (бесконечный цикл без delay?).\n', 'err'); showTab('console'); } }, 500);
    }
    $('#codePane').hidden = true; $('#codeTab').classList.remove('on');
    tick();
  }
  function stop() {
    running = false; cancelAnimationFrame(raf); clearInterval(wd); if (worker) worker.terminate(); worker = null; gpio = {}; sim = null;
    for (const k in meas) delete meas[k]; for (const k in checks) delete checks[k];
    $('#run').disabled = false; $('#stop').disabled = true; $('#status').textContent = 'Остановлено'; $('#alert').hidden = true;
    render(); live(); calc();
  }
  $('#run').onclick = start; $('#stop').onclick = stop;
  $('#codeTab').onclick = () => { const h = $('#codePane').hidden; $('#codePane').hidden = !h; $('#codeTab').classList.toggle('on', h); if (h) $('#code').focus(); };
  $('#code').oninput = () => { proj.code = $('#code').value; autosave(); };
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
  function open(data) { stop(); proj = sanitizeProject(data); proj.code = proj.code ?? DEFAULT_CODE; $('#code').value = proj.code; sel = null; fit(); changed(); }
  $('#projects').onchange = e => { const v = e.target.value; if (!v) return; open(v.startsWith('ex:') ? window.EXAMPLES[v.slice(3)] : (Object.prototype.hasOwnProperty.call(saved(), v.slice(3)) ? saved()[v.slice(3)] : {})); };
  $('#save').onclick = () => { let n = prompt('Название проекта:', proj.name || 'Мой проект'); if (!n) return; n = String(n).slice(0, 64); proj.name = n; proj.code = $('#code').value;
    const s = saved(); s[n] = { ...strip(proj), name: n }; localStorage.setItem(LS, JSON.stringify(s)); projList(n); $('#status').textContent = 'Сохранено: ' + n; };
  $('#new').onclick = () => open({ parts: [], wires: [], code: 'void setup() {\n  \n}\n\nvoid loop() {\n  \n}\n' });
  $('#export').onclick = () => { proj.code = $('#code').value; const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify({ ...strip(proj), format: 'circuitsim/1' }, null, 2)], { type: 'application/json' })); a.download = (proj.name || 'circuit') + '.json'; a.click(); };
  $('#import').onchange = async e => { const f = e.target.files[0]; if (!f) return; try { const d = JSON.parse(await f.text());
    if (!Array.isArray(d.parts) || !Array.isArray(d.wires)) throw new Error('неизвестный формат'); open(d); } catch (err) { alert('Не удалось импортировать: ' + err.message); } e.target.value = ''; };
  function fit() { if (!proj.parts.length) return; const xs = proj.parts.map(p => p.x), ys = proj.parts.map(p => p.y), r = svg.getBoundingClientRect();
    cam.s = 1; cam.x = r.width / 2 - (Math.min(...xs) + Math.max(...xs)) / 2; cam.y = r.height / 2 - (Math.min(...ys) + Math.max(...ys)) / 2; }

  palette(); projList(); $('#code').value = proj.code ?? DEFAULT_CODE; fit(); render(); props(); calc();
  window.addEventListener('resize', () => { if (!running) render(); });
  window.__sim = { get proj() { return proj; }, get meas() { return meas; }, start, stop, get gpio() { return gpio; } };
})();
