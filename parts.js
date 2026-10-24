/* Part library. Each part: pins (local coords), draw(p, st) -> SVG, stamp(p, ctx), measure(p, sol, ctx). */
(function () {
  const S = window.Solver;
  const ESP32_L = ['3V3', 'GND', '15', '2', '4', '16', '17', '5', '18', '19', '21', '22', '23'];
  const ESP32_R = ['VIN', 'GND2', '13', '12', '14', '27', '26', '25', '33', '32', '35', '34', '36'];
  const ESP8266_L = ['A0', 'GND', '3V3', 'VIN'];
  const ESP8266_R = ['D0', 'D1', 'D2', 'D3', 'D4', '3V3b', 'GND2', 'D5', 'D6', 'D7', 'D8'];
  const NODEMCU = { D0: 16, D1: 5, D2: 4, D3: 0, D4: 2, D5: 14, D6: 12, D7: 13, D8: 15, A0: 17 };
  const LED_COLORS = { 'красный': ['#ff3030', 1.8], 'зелёный': ['#30ff50', 2.1], 'жёлтый': ['#ffd020', 2.0], 'синий': ['#3080ff', 3.0], 'белый': ['#ffffff', 3.1] };

  const two = (a, b) => [{ id: 'a', x: -40, y: 0, label: a }, { id: 'b', x: 40, y: 0, label: b }];
  const lead = '<line x1="-40" y1="0" x2="-20" y2="0" class="lead"/><line x1="20" y1="0" x2="40" y2="0" class="lead"/>';
  const r2 = (p, ctx, R) => ctx.add({ type: 'R', a: ctx.n(p, 'a'), b: ctx.n(p, 'b'), R });
  const meas2 = (p, sol, ctx, I) => { const U = ctx.v(p, 'a') - ctx.v(p, 'b'); return { U, I, P: Math.abs(U * I), pinI: { a: I, b: -I } }; };
  // source with internal resistance: + pin -> R -> internal node -> V -> - pin
  function source(p, ctx, plus, minus, V, Rint) {
    const m = ctx.node();
    p._r = ctx.add({ type: 'R', a: m, b: ctx.n(p, plus), R: Rint });
    p._v = ctx.add({ type: 'V', p: m, n: ctx.n(p, minus), V });
  }

  function board(kind) {
    const L = kind === 'esp32' ? ESP32_L : ESP8266_L, R = kind === 'esp32' ? ESP32_R : ESP8266_R;
    const H = Math.max(L.length, R.length) * 20 + 40;
    const lab = id => id.replace(/^GND2$/, 'GND').replace('3V3b', '3V3');
    const pins = [...L.map((id, i) => ({ id, x: -80, y: -H / 2 + 30 + i * 20, label: lab(id) })), ...R.map((id, i) => ({ id, x: 80, y: -H / 2 + 30 + i * 20, label: lab(id) }))];
    const gpioOf = id => kind === 'esp32' ? (/^\d+$/.test(id) ? +id : null) : (NODEMCU[id] ?? null);
    return {
      name: kind === 'esp32' ? 'ESP32 DevKit' : 'ESP8266 NodeMCU', group: 'Платы', mcu: kind, pins, gpioOf,
      ground: id => id.startsWith('GND'),
      draw: (p, st) => `<rect x="-70" y="${-H / 2}" width="140" height="${H}" rx="6" class="pcb"/>
        <rect x="-30" y="${-H / 2 + 8}" width="60" height="44" rx="2" fill="#bbb" stroke="#888"/>
        <text x="0" y="${-H / 2 + 34}" class="chip">${kind === 'esp32' ? 'ESP32' : 'ESP8266'}</text>
        <rect x="-12" y="${H / 2 - 14}" width="24" height="14" fill="#aaa"/>
        <circle cx="0" cy="${H / 2 - 30}" r="4" fill="${st.led2 ? '#4af' : '#234'}"/>
        ${pins.map(q => `<text x="${q.x < 0 ? -64 : 64}" y="${q.y + 4}" class="plabel" text-anchor="${q.x < 0 ? 'start' : 'end'}">${q.label}</text><line x1="${q.x}" y1="${q.y}" x2="${q.x < 0 ? -70 : 70}" y2="${q.y}" class="lead"/>`).join('')}`,
      stamp(p, ctx) {
        p._els = {};
        for (const q of pins) {
          if (q.id.startsWith('3V3')) { source(p, ctx, q.id, 'GND', 3.3, 0.1); p._els[q.id] = p._r; }
          else if (q.id === 'VIN') { source(p, ctx, 'VIN', 'GND', 5, 0.1); p._els[q.id] = p._r; }
          else { const g = gpioOf(q.id); if (g == null) continue;
            const s = ctx.gpio(g) || { mode: 'INPUT' };
            if (s.mode === 'OUTPUT') { const m = ctx.node(); p._els[q.id] = ctx.add({ type: 'R', a: m, b: ctx.n(p, q.id), R: 25 }); ctx.add({ type: 'V', p: m, n: 0, V: 3.3 * (s.val || 0) }); }
            else if (s.mode === 'INPUT_PULLUP') { const m = ctx.node(); p._els[q.id] = ctx.add({ type: 'R', a: m, b: ctx.n(p, q.id), R: 45000 }); ctx.add({ type: 'V', p: m, n: 0, V: 3.3 }); }
          }
        }
      },
      measure(p, sol, ctx) {
        const pinI = {}; let P = 0;
        for (const id in p._els) { const i = sol.currents[p._els[id]]; pinI[id] = i; P += Math.abs(ctx.v(p, id) * i); }
        return { U: 3.3, I: Object.values(pinI).reduce((a, b) => a + Math.max(0, -b), 0), P, pinI, out: true };
      }
    };
  }

  const PARTS = {
    esp32: board('esp32'),
    esp8266: board('esp8266'),
    dc: { name: 'Источник питания', group: 'Питание', props: { V: 5 },
      pins: [{ id: 'p', x: 0, y: -40, label: '+' }, { id: 'n', x: 0, y: 40, label: '−' }], source: { plus: 'p', minus: 'n' },
      draw: p => `<rect x="-26" y="-26" width="52" height="52" rx="5" class="body"/><line x1="0" y1="-40" x2="0" y2="-26" class="lead"/><line x1="0" y1="26" x2="0" y2="40" class="lead"/><text x="0" y="-8" class="lbl">+</text><text x="0" y="16" class="lbl">${fmtNum(p.props.V)} В</text>`,
      stamp: (p, ctx) => source(p, ctx, 'p', 'n', +p.props.V, 0.05),
      measure: (p, sol, ctx) => { const I = sol.currents[p._r]; return { U: ctx.v(p, 'p') - ctx.v(p, 'n'), I, P: Math.abs(I * (ctx.v(p, 'p') - ctx.v(p, 'n'))), pinI: { p: I, n: -I }, out: true }; } },
    battery: { name: 'Батарейка 9 В', group: 'Питание', props: {},
      pins: [{ id: 'p', x: 0, y: -40, label: '+' }, { id: 'n', x: 0, y: 40, label: '−' }], source: { plus: 'p', minus: 'n' },
      draw: () => `<rect x="-20" y="-30" width="40" height="60" rx="4" fill="#333" stroke="#999"/><rect x="-20" y="-30" width="40" height="18" fill="#c83"/><line x1="0" y1="-40" x2="0" y2="-30" class="lead"/><line x1="0" y1="30" x2="0" y2="40" class="lead"/><text x="0" y="10" class="lbl">9В</text>`,
      stamp: (p, ctx) => source(p, ctx, 'p', 'n', 9, 1.5),
      measure: (p, sol, ctx) => PARTS.dc.measure(p, sol, ctx) },
    gnd: { name: 'Земля (GND)', group: 'Питание', pins: [{ id: 'g', x: 0, y: -20, label: 'GND' }], ground: () => true,
      draw: () => `<line x1="0" y1="-20" x2="0" y2="0" class="lead"/><line x1="-14" y1="0" x2="14" y2="0" class="sym"/><line x1="-9" y1="5" x2="9" y2="5" class="sym"/><line x1="-4" y1="10" x2="4" y2="10" class="sym"/>`,
      stamp() {}, measure: () => null },
    resistor: { name: 'Резистор', group: 'Пассивные', props: { R: 220, Pmax: 0.25 }, pins: two('1', '2'),
      draw: p => `${lead}<rect x="-20" y="-7" width="40" height="14" rx="3" class="res"/><text x="0" y="-12" class="lbl">${fmtUnit(p.props.R, 'Ом')}</text>`,
      stamp: (p, ctx) => { p._e = r2(p, ctx, +p.props.R); },
      measure: (p, sol, ctx) => meas2(p, sol, ctx, sol.currents[p._e]),
      check(p, m) { if (m.P > p.props.Pmax * 2) return { level: 'burn', msg: `Резистор перегрет: ${fmtUnit(m.P, 'Вт')} при допустимых ${fmtUnit(p.props.Pmax, 'Вт')}. Увеличь сопротивление или возьми резистор мощнее` };
        if (m.P > p.props.Pmax) return { level: 'warn', msg: `Резистор перегружен: ${fmtUnit(m.P, 'Вт')} > ${fmtUnit(p.props.Pmax, 'Вт')}` }; } },
    pot: { name: 'Потенциометр', group: 'Пассивные', props: { R: 10000, pos: 0.5 },
      pins: [{ id: 'a', x: -40, y: 0, label: '1' }, { id: 'w', x: 0, y: 30, label: 'W' }, { id: 'b', x: 40, y: 0, label: '2' }],
      draw: p => `${lead}<line x1="0" y1="10" x2="0" y2="30" class="lead"/><rect x="-20" y="-7" width="40" height="14" rx="3" class="res"/><path d="M${-20 + 40 * p.props.pos} 14 l-5 8 h10z" fill="#fc6"/><text x="0" y="-12" class="lbl">${fmtUnit(p.props.R, 'Ом')} · ${Math.round(p.props.pos * 100)}%</text>`,
      stamp: (p, ctx) => { const R = +p.props.R, k = Math.min(1, Math.max(0, +p.props.pos));
        p._e1 = ctx.add({ type: 'R', a: ctx.n(p, 'a'), b: ctx.n(p, 'w'), R: Math.max(1, R * k) });
        p._e2 = ctx.add({ type: 'R', a: ctx.n(p, 'w'), b: ctx.n(p, 'b'), R: Math.max(1, R * (1 - k)) }); },
      measure: (p, sol, ctx) => { const i1 = sol.currents[p._e1], i2 = sol.currents[p._e2];
        const U = ctx.v(p, 'a') - ctx.v(p, 'b'); const P = Math.abs((ctx.v(p, 'a') - ctx.v(p, 'w')) * i1) + Math.abs((ctx.v(p, 'w') - ctx.v(p, 'b')) * i2);
        return { U, I: i1, P, pinI: { a: i1, w: i2 - i1, b: -i2 } }; } },
    led: { name: 'Светодиод', group: 'Полупроводники', props: { color: 'красный', Vf: 1.8, Imax: 0.02 }, pins: two('A', 'K'),
      draw: (p, st) => { const c = LED_COLORS[p.props.color]?.[0] || '#f33', b = st.burned ? 0 : Math.min(1, (st.I || 0) / 0.015);
        return `${lead}<path d="M-12 -12 L12 0 L-12 12 Z" fill="${st.burned ? '#222' : c}" fill-opacity="${st.burned ? 1 : 0.35 + 0.65 * b}" class="sym"/><line x1="12" y1="-12" x2="12" y2="12" class="sym"/>
          ${b > 0.01 ? `<circle r="${16 + 12 * b}" fill="${c}" opacity="${0.45 * b}" filter="url(#glow)"/>` : ''}${st.burned ? '<path d="M-8 -16 l16 32 M8 -16 l-16 32" stroke="#f33" stroke-width="3"/>' : ''}`; },
      stamp: (p, ctx) => { p._e = p.burned ? r2(p, ctx, 1e9) : ctx.add({ type: 'D', a: ctx.n(p, 'a'), b: ctx.n(p, 'b'), Is: S.ledIs(+p.props.Vf), n: 2 }); },
      measure: (p, sol, ctx) => { const I = p.burned ? 0 : (p.burned ? 0 : sol.currents[p._e]); return meas2(p, sol, ctx, I); },
      check(p, m, ctx) {
        const I = m.I, max = +p.props.Imax || 0.02;
        if (p.burned || I > max * 1.5) { if (!p.burned) { p.burned = true; p.burnI = I; ctx.dirty(); }
          const Vs = ctx.supplyMax(), R = e12up((Vs - p.props.Vf) / 0.015);
          return { level: 'burn', msg: `Светодиод сгорел: ${fmtUnit(p.burnI, 'А')} при максимуме ${fmtUnit(max, 'А')}. Поставь резистор от ${fmtUnit(R, 'Ом')}` }; }
        if (I > max) return { level: 'warn', msg: `Светодиод перегружен: ${fmtUnit(I, 'А')} > ${fmtUnit(max, 'А')}` };
        if (-m.U > 5) return { level: 'warn', msg: 'Обратное напряжение на светодиоде больше 5 В' }; } },
    diode: { name: 'Диод 1N4148', group: 'Полупроводники', pins: two('A', 'K'),
      draw: () => `${lead}<rect x="-20" y="-7" width="40" height="14" rx="3" fill="#f2a654"/><rect x="10" y="-7" width="5" height="14" fill="#222"/>`,
      stamp: (p, ctx) => { p._e = ctx.add({ type: 'D', a: ctx.n(p, 'a'), b: ctx.n(p, 'b'), ...S.presets['1N4148'] }); },
      measure: (p, sol, ctx) => meas2(p, sol, ctx, sol.currents[p._e]),
      check: (p, m) => m.I > 0.3 ? { level: 'warn', msg: `Ток диода ${fmtUnit(m.I, 'А')} больше допустимых 300 мА` } : null },
    npn: { name: 'NPN 2N2222', group: 'Полупроводники',
      pins: [{ id: 'c', x: 20, y: -40, label: 'C' }, { id: 'b', x: -40, y: 0, label: 'B' }, { id: 'e', x: 20, y: 40, label: 'E' }],
      draw: () => `<circle r="24" class="body"/><line x1="-40" y1="0" x2="-8" y2="0" class="lead"/><line x1="-8" y1="-14" x2="-8" y2="14" class="sym"/>
        <line x1="-8" y1="-6" x2="20" y2="-24" class="sym"/><line x1="20" y1="-24" x2="20" y2="-40" class="lead"/><line x1="-8" y1="6" x2="20" y2="24" class="sym"/><line x1="20" y1="24" x2="20" y2="40" class="lead"/><path d="M20 24 l-9 -1 l4 -7z" fill="#ddd"/>
        <text x="30" y="-30" class="plabel">C</text><text x="-36" y="-6" class="plabel">B</text><text x="30" y="36" class="plabel">E</text>`,
      stamp: (p, ctx) => { p._e = ctx.add({ type: 'Q', c: ctx.n(p, 'c'), b: ctx.n(p, 'b'), e: ctx.n(p, 'e'), ...S.presets['2N2222'] }); },
      measure: (p, sol, ctx) => { const q = sol.currents[p._e]; const vce = ctx.v(p, 'c') - ctx.v(p, 'e'), vbe = ctx.v(p, 'b') - ctx.v(p, 'e');
        return { U: vce, I: q.ic, P: Math.abs(vce * q.ic + vbe * q.ib), pinI: { c: q.ic, b: q.ib, e: q.ie }, extra: { Ib: q.ib, Vbe: vbe } }; },
      check: (p, m) => m.P > 0.5 ? { level: 'warn', msg: `Транзистор перегрет: ${fmtUnit(m.P, 'Вт')} (макс. 0,5 Вт)` } : (m.I > 0.6 ? { level: 'warn', msg: 'Ток коллектора больше 600 мА' } : null) },
    button: { name: 'Кнопка', group: 'Ввод/вывод', pins: two('1', '2'), interactive: 'momentary',
      draw: (p, st) => `${lead}<rect x="-20" y="-16" width="40" height="32" rx="4" class="body"/><circle r="10" fill="${p.on ? '#d33' : '#a22'}" stroke="#600" stroke-width="${p.on ? 4 : 1}"/>`,
      stamp: (p, ctx) => { p._e = r2(p, ctx, p.on ? 0.05 : 1e9); }, measure: (p, sol, ctx) => meas2(p, sol, ctx, sol.currents[p._e]) },
    switch: { name: 'Переключатель', group: 'Ввод/вывод', pins: two('1', '2'), interactive: 'toggle',
      draw: p => `${lead}<circle cx="-20" cy="0" r="3" fill="#ddd"/><circle cx="20" cy="0" r="3" fill="#ddd"/><line x1="-20" y1="0" x2="${p.on ? 20 : 14}" y2="${p.on ? 0 : -16}" class="sym" stroke-width="3"/><rect x="-24" y="-24" width="48" height="34" fill="transparent"/>`,
      stamp: (p, ctx) => { p._e = r2(p, ctx, p.on ? 0.05 : 1e9); }, measure: (p, sol, ctx) => meas2(p, sol, ctx, sol.currents[p._e]) },
    voltmeter: { name: 'Вольтметр', group: 'Ввод/вывод', pins: two('+', '−'),
      draw: (p, st) => `${lead}<rect x="-24" y="-16" width="48" height="32" rx="4" fill="#ffd34d" stroke="#a80"/><rect x="-19" y="-11" width="38" height="16" fill="#cde3c0"/><text x="0" y="2" class="meter">${st.m ? fmtNum(st.m.U, 2) : '—'}</text><text x="0" y="13" class="tiny">V</text>`,
      stamp: (p, ctx) => { p._e = r2(p, ctx, 1e7); }, measure: (p, sol, ctx) => meas2(p, sol, ctx, sol.currents[p._e]) },
    ammeter: { name: 'Амперметр', group: 'Ввод/вывод', pins: two('+', '−'),
      draw: (p, st) => `${lead}<rect x="-24" y="-16" width="48" height="32" rx="4" fill="#6cf" stroke="#058"/><rect x="-19" y="-11" width="38" height="16" fill="#cde3c0"/><text x="0" y="2" class="meter">${st.m ? fmtNum(st.m.I * 1000, 1) : '—'}</text><text x="0" y="13" class="tiny">mA</text>`,
      stamp: (p, ctx) => { p._e = r2(p, ctx, 0.001); }, measure: (p, sol, ctx) => meas2(p, sol, ctx, sol.currents[p._e]) },
  };

  const E12 = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];
  function e12up(r) { if (!(r > 0)) return 10; const d = Math.pow(10, Math.floor(Math.log10(r))); for (const e of [...E12, 10]) if (e * d >= r * 0.999) return +(e * d).toPrecision(3); }
  function fmtNum(x, d = 2) { if (!isFinite(x)) return '—'; return (+x.toFixed(d)).toString().replace('.', ','); }
  function fmtUnit(x, u) {
    if (x == null || !isFinite(x)) return '—';
    const a = Math.abs(x), pre = [[1e6, 'М'], [1e3, 'к'], [1, ''], [1e-3, 'м'], [1e-6, 'мк'], [1e-9, 'н']];
    if (a < 1e-12) return '0 ' + u;
    for (const [k, s] of pre) if (a >= k * 0.9995) { const v = x / k; return fmtNum(v, Math.abs(v) >= 100 ? 0 : Math.abs(v) >= 10 ? 1 : 2) + ' ' + s + u; }
    return fmtNum(x / 1e-9, 1) + ' н' + u;
  }
  window.PARTS = PARTS; window.LED_COLORS = LED_COLORS; window.fmtUnit = fmtUnit; window.fmtNum = fmtNum; window.e12up = e12up;
})();
