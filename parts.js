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
  const BAND = ['#111', '#8b4513', '#e02020', '#ff8c00', '#ffd700', '#22a033', '#1f5fd0', '#8a2be2', '#888', '#f4f4f4'];
  function bands(R) { R = Math.max(0.1, +R || 0); let e = Math.floor(Math.log10(R)) - 1, d = Math.round(R / Math.pow(10, e)); if (d >= 100) { d = Math.round(d / 10); e++; }
    const mul = e >= 0 && e <= 9 ? BAND[e] : e === -1 ? '#d4af37' : '#c0c0c0'; return [BAND[Math.floor(d / 10)], BAND[d % 10], mul, '#d4af37']; }
  const r2 = (p, ctx, R) => ctx.add({ type: 'R', a: ctx.n(p, 'a'), b: ctx.n(p, 'b'), R });
  const meas2 = (p, sol, ctx, I) => { const U = ctx.v(p, 'a') - ctx.v(p, 'b'); return { U, I, P: Math.abs(U * I), pinI: { a: I, b: -I } }; };
  // source with internal resistance rInt (handled inside the solver's V element)
  function source(p, ctx, plus, minus, V, Rint) {
    // solver-native internal resistance + short-circuit limit (sol.shortCircuits)
    p._r = p._v = ctx.add({ type: 'V', p: ctx.n(p, plus), n: ctx.n(p, minus), V, rInt: Rint, iShort: window.SHORT_LIMIT_A || 1 });
  }

  function board(kind) {
    const L = kind === 'esp32' ? ESP32_L : ESP8266_L, R = kind === 'esp32' ? ESP32_R : ESP8266_R;
    const H = Math.max(L.length, R.length) * 20 + 40;
    const hintOf = id => /^GND/.test(id) ? 'GND (земля)' : /^3V3/.test(id) ? '3V3 (питание 3,3 В)' : id === 'VIN' ? 'VIN (5 В от USB)' : id === 'A0' ? 'A0 (аналоговый вход)' : (kind === 'esp32' ? 'GPIO' + id : id + ' (GPIO' + NODEMCU[id] + ')');
    const lab = id => id.replace(/^GND2$/, 'GND').replace('3V3b', '3V3');
    const pins = [...L.map((id, i) => ({ id, x: -80, y: -H / 2 + 30 + i * 20, label: lab(id), hint: hintOf(id) })), ...R.map((id, i) => ({ id, x: 80, y: -H / 2 + 30 + i * 20, label: lab(id), hint: hintOf(id) }))];
    const gpioOf = id => kind === 'esp32' ? (/^\d+$/.test(id) ? +id : null) : (NODEMCU[id] ?? null);
    return {
      name: kind === 'esp32' ? 'ESP32 DevKit' : 'ESP8266 NodeMCU', group: 'Платы', mcu: kind, vio: 3.3, builtin: 2, pins, gpioOf,
      ground: id => id.startsWith('GND'),
      box: kind === 'esp32' ? [-84, -H / 2 - 6, 168, H + 12] : [-84, -H / 2 - 6, 168, H + 12],
      draw: (p, st) => { const T = -H / 2, B = H / 2, e32 = kind === 'esp32';
        const mod = e32 ? `<rect x="-36" y="${T + 4}" width="72" height="92" rx="2" fill="#1d1f22" stroke="#3a3d42"/>
          <path d="M-28 ${T + 22} v-12 h8 v12 h8 v-12 h8 v12 h8 v-12 h8 v12 h8 v-12 h8 v12" stroke="#c9a227" stroke-width="1.6" fill="none"/>
          <rect x="-32" y="${T + 30}" width="64" height="62" rx="2" class="shield"/><rect x="-27" y="${T + 35}" width="54" height="52" rx="1" fill="none" stroke="#8c939c" stroke-width=".7"/>
          <text x="0" y="${T + 56}" class="chip">ESP-WROOM-32</text><text x="0" y="${T + 68}" class="tiny">Wi-Fi · BT</text>`
          : `<rect x="-34" y="${T + 6}" width="68" height="84" rx="2" fill="#173a8a" stroke="#2d55b0"/>
          <path d="M-26 ${T + 24} h40 v-10 h-40 v-6 h46" stroke="#c9a227" stroke-width="1.6" fill="none"/>
          <rect x="-28" y="${T + 32}" width="56" height="52" rx="2" class="shield"/><text x="0" y="${T + 56}" class="chip">ESP-12E</text><text x="0" y="${T + 68}" class="tiny">ESP8266EX</text>`;
        return `<rect x="-78" y="${T}" width="156" height="${H}" rx="5" class="pcbk"/>
        ${mod}
        ${pins.map(q => `<rect x="${q.x < 0 ? -78 : 70}" y="${q.y - 4}" width="8" height="8" fill="#0c0c0c" stroke="#444"/><circle cx="${q.x < 0 ? -74 : 74}" cy="${q.y}" r="2.2" fill="#d4b13a"/><line x1="${q.x}" y1="${q.y}" x2="${q.x < 0 ? -78 : 78}" y2="${q.y}" class="lead"/><text x="${q.x < 0 ? -66 : 66}" y="${q.y + 3.5}" class="plabel blbl" text-anchor="${q.x < 0 ? 'start' : 'end'}">${q.label}</text>`).join('')}
        <rect x="-38" y="${B - 30}" width="14" height="10" rx="2" fill="#bbb" stroke="#777"/><circle cx="-31" cy="${B - 25}" r="3" fill="#333"/><text x="-31" y="${B - 34}" class="tiny lightt">EN</text>
        <rect x="24" y="${B - 30}" width="14" height="10" rx="2" fill="#bbb" stroke="#777"/><circle cx="31" cy="${B - 25}" r="3" fill="#333"/><text x="31" y="${B - 34}" class="tiny lightt">BOOT</text>
        <rect x="-14" y="${B - 16}" width="28" height="18" rx="2" fill="#c0c4c9" stroke="#80868d"/><rect x="-9" y="${B - 10}" width="18" height="6" rx="1" fill="#555"/>
        <rect x="-16" y="${B - 40}" width="8" height="5" rx="1" fill="#d22"/><text x="-12" y="${B - 44}" class="tiny lightt">PWR</text>
        ${st.led2 && e32 ? `<circle cx="12" cy="${B - 38}" r="9" fill="#3af" opacity=".5" filter="url(#glow)"/>` : ''}<rect x="8" y="${B - 40}" width="8" height="5" rx="1" fill="${st.led2 && e32 ? '#6cf' : '#1a3550'}"/><text x="12" y="${B - 44}" class="tiny lightt">IO2</text>`; },
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
        const srcI = Math.max(0, ...Object.keys(pinI).filter(k => /^(3V3|VIN)/.test(k)).map(k => Math.abs(pinI[k])));
        return { U: 3.3, I: Object.values(pinI).reduce((a, b) => a + Math.max(0, -b), 0), P, pinI, out: true, srcI };
      }
    };
  }

  const PARTS = {
    esp32: board('esp32'),
    esp8266: board('esp8266'),
    dc: { name: 'Источник питания', group: 'Питание', props: { V: 5, rInt: 0.1 },
      pins: [{ id: 'p', x: 0, y: -40, label: '+' }, { id: 'n', x: 0, y: 40, label: '−' }], source: { plus: 'p', minus: 'n' },
      draw: p => `<rect x="-26" y="-26" width="52" height="52" rx="5" fill="#2c3340" stroke="#151a22"/><rect x="-20" y="-20" width="40" height="14" rx="2" fill="#0d1a10"/><line x1="0" y1="-40" x2="0" y2="-26" class="lead"/><line x1="0" y1="26" x2="0" y2="40" class="lead"/><text x="0" y="-8" class="lbl">+</text><text x="0" y="16" class="lbl">${fmtNum(p.props.V)} В</text>`,
      stamp: (p, ctx) => source(p, ctx, 'p', 'n', +p.props.V, Math.max(0.001, +p.props.rInt || 0.1)),
      measure: (p, sol, ctx) => { const I = sol.currents[p._r]; return { U: ctx.v(p, 'p') - ctx.v(p, 'n'), I, P: Math.abs(I * (ctx.v(p, 'p') - ctx.v(p, 'n'))), pinI: { p: I, n: -I }, out: true, srcI: Math.abs(I) }; } },
    battery: { name: 'Батарейка 9 В', group: 'Питание', props: { rInt: 1.5 },
      pins: [{ id: 'p', x: 0, y: -40, label: '+' }, { id: 'n', x: 0, y: 40, label: '−' }], source: { plus: 'p', minus: 'n' },
      box: [-26, -44, 52, 88],
      draw: () => `<path d="M0 -40 V-34" class="leg"/><path d="M0 40 V-12" class="leg" opacity="0"/>
        <rect x="-22" y="-30" width="44" height="70" rx="4" fill="#2b2b2b" stroke="#111"/><rect x="-22" y="-12" width="44" height="40" fill="#e0b020"/><rect x="-22" y="16" width="44" height="12" fill="#222"/>
        <text x="0" y="6" class="chip">9V</text><rect x="-12" y="-36" width="10" height="7" rx="2" fill="#c9ced4" stroke="#888"/><path d="M10 -36 l4 3 v4 h-8 v-4z" fill="#c9ced4" stroke="#888"/>
        <text x="-7" y="-20" class="tiny lightt">+</text><text x="10" y="-20" class="tiny lightt">−</text><path d="M10 -30 C 30 -30 30 40 0 40" stroke="#b8c0cc" stroke-width="2" fill="none"/>`,
      stamp: (p, ctx) => source(p, ctx, 'p', 'n', 9, Math.max(0.001, +p.props.rInt || 1.5)),
      measure: (p, sol, ctx) => PARTS.dc.measure(p, sol, ctx) },
    gnd: { name: 'Земля (GND)', group: 'Питание', pins: [{ id: 'g', x: 0, y: -20, label: 'GND' }], ground: () => true,
      draw: () => `<line x1="0" y1="-20" x2="0" y2="0" class="lead"/><line x1="-14" y1="0" x2="14" y2="0" class="sym"/><line x1="-9" y1="5" x2="9" y2="5" class="sym"/><line x1="-4" y1="10" x2="4" y2="10" class="sym"/>`,
      stamp() {}, measure: () => null },
    resistor: { name: 'Резистор', group: 'Пассивные', props: { R: 220, Pmax: 0.25 }, pins: two('1', '2'),
      draw: p => { const b = bands(p.props.R); return `${lead}<rect x="-22" y="-8" width="44" height="16" rx="7" class="res"/><rect x="-14" y="-7" width="28" height="14" fill="#e3c99a"/>
        <rect x="-15" y="-8" width="4" height="16" fill="${b[0]}" class="band"/><rect x="-8" y="-7" width="4" height="14" fill="${b[1]}" class="band"/><rect x="-1" y="-7" width="4" height="14" fill="${b[2]}" class="band"/><rect x="10" y="-8" width="4" height="16" fill="${b[3]}" class="band"/>
        <rect x="-20" y="-6" width="40" height="3" rx="1.5" fill="#fff" opacity=".25"/><text x="0" y="-13" class="lbl">${fmtUnit(p.props.R, 'Ом')}</text>`; },
      stamp: (p, ctx) => { p._e = r2(p, ctx, p.burned ? 1e9 : Math.max(0.001, +p.props.R)); },
      measure: (p, sol, ctx) => meas2(p, sol, ctx, sol.currents[p._e]),
      check(p, m, ctx) { if (p.burned || m.P > p.props.Pmax * 2) { if (!p.burned) { p.burned = true; p.burnP = m.P; ctx.dirty(); } m = { P: p.burnP }; } if (p.burned) return { level: 'burn', msg: `Резистор перегрет: ${fmtUnit(m.P, 'Вт')} при допустимых ${fmtUnit(p.props.Pmax, 'Вт')}. Увеличь сопротивление или возьми резистор мощнее` };
        if (m.P > p.props.Pmax) return { level: 'warn', msg: `Резистор перегружен: ${fmtUnit(m.P, 'Вт')} > ${fmtUnit(p.props.Pmax, 'Вт')}` }; } },
    pot: { name: 'Потенциометр', group: 'Пассивные', props: { R: 10000, pos: 0.5 },
      pins: [{ id: 'a', x: -40, y: 0, label: '1' }, { id: 'w', x: 0, y: 30, label: 'W' }, { id: 'b', x: 40, y: 0, label: '2' }],
      box: [-44, -30, 88, 64],
      draw: p => { const ang = -135 + 270 * p.props.pos; return `${lead}<path d="M0 30 V14" class="leg"/>
        <rect x="-22" y="-20" width="44" height="34" rx="4" fill="#1f5fbf" stroke="#123c80"/><circle cx="0" cy="-3" r="13" fill="#e8e8e8" stroke="#999"/>
        <g class="knob" transform="rotate(${ang} 0 -3)"><circle cx="0" cy="-3" r="10" fill="#d0d0d0"/><rect x="-1.5" y="-13" width="3" height="10" fill="#555"/></g>
        <text x="0" y="-24" class="lbl">${fmtUnit(p.props.R, 'Ом')} · ${Math.round(p.props.pos * 100)}%</text>`; },
      stamp: (p, ctx) => { const R = +p.props.R, k = Math.min(1, Math.max(0, +p.props.pos));
        p._e1 = ctx.add({ type: 'R', a: ctx.n(p, 'a'), b: ctx.n(p, 'w'), R: Math.max(1, R * k) });
        p._e2 = ctx.add({ type: 'R', a: ctx.n(p, 'w'), b: ctx.n(p, 'b'), R: Math.max(1, R * (1 - k)) }); },
      measure: (p, sol, ctx) => { const i1 = sol.currents[p._e1], i2 = sol.currents[p._e2];
        const U = ctx.v(p, 'a') - ctx.v(p, 'b'); const P = Math.abs((ctx.v(p, 'a') - ctx.v(p, 'w')) * i1) + Math.abs((ctx.v(p, 'w') - ctx.v(p, 'b')) * i2);
        return { U, I: i1, P, pinI: { a: i1, w: i2 - i1, b: -i2 } }; } },
    led: { name: 'Светодиод', group: 'Индикация', props: { color: 'красный', Vf: 1.8, Imax: 0.02 }, pins: [{ id: 'a', x: -40, y: 0, label: 'A', hint: 'Анод +' }, { id: 'b', x: 40, y: 0, label: 'K', hint: 'Катод −' }],
      box: [-44, -46, 88, 70],
      draw: (p, st) => { const c = LED_COLORS[p.props.color]?.[0] || '#f33', b = st.burned ? 0 : Math.min(1, (st.I || 0) / 0.015);
        return `<path d="M-40 0 H-5 V-12" class="leg"/><path d="M40 0 H5 V-12" class="leg"/>
          ${b > 0.01 ? `<circle cx="0" cy="-26" r="${18 + 14 * b}" fill="${c}" opacity="${0.55 * b}" filter="url(#glow)"/>` : ''}
          <rect x="-13" y="-14" width="26" height="5" rx="1.5" fill="${c}" fill-opacity=".55" stroke="${c}" stroke-opacity=".8"/>
          <path d="M-11 -14 V-32 A11 11 0 0 1 11 -32 V-14 Z" fill="${c}" fill-opacity="${0.28 + 0.6 * b}" stroke="${c}" stroke-opacity=".9" stroke-width="1.2"/>
          <path d="M-5 -14 V-24 L-1 -27 M5 -14 V-22 L1 -24" stroke="#cfd6df" stroke-width="1.2" fill="none" opacity=".6"/>
          <path d="M-7 -33 A7 7 0 0 1 -2 -39" stroke="#fff" stroke-width="2" fill="none" opacity="${0.35 + 0.5 * b}"/>
          <text x="-30" y="12" class="plabel">+</text><text x="26" y="12" class="plabel">−</text>`; },
      stamp: (p, ctx) => { p._e = p.burned ? r2(p, ctx, 1e9) : ctx.add({ type: 'D', a: ctx.n(p, 'a'), b: ctx.n(p, 'b'), Is: S.ledIs(+p.props.Vf), n: 2 }); },
      measure: (p, sol, ctx) => { const I = p.burned ? 0 : (p.burned ? 0 : sol.currents[p._e]); return meas2(p, sol, ctx, I); },
      check(p, m, ctx) {
        const I = m.I, max = +p.props.Imax || 0.02;
        if (p.burned || I > max * 1.5) { if (!p.burned) { p.burned = true; p.burnI = I; ctx.dirty(); }
          const Vs = ctx.supplyMax(), R = e12up((Vs - p.props.Vf) / 0.015);
          return { level: 'burn', msg: `Светодиод сгорел: ${fmtUnit(p.burnI, 'А')} при максимуме ${fmtUnit(max, 'А')}. Поставь резистор от ${fmtUnit(R, 'Ом')}` }; }
        if (I > max) return { level: 'warn', msg: `Светодиод перегружен: ${fmtUnit(I, 'А')} > ${fmtUnit(max, 'А')}` };
        if (-m.U > 5) return { level: 'warn', msg: 'Обратное напряжение на светодиоде больше 5 В' }; } },
    diode: { name: 'Диод 1N4148', group: 'Полупроводники', pins: [{ id: 'a', x: -40, y: 0, label: 'A', hint: 'Анод +' }, { id: 'b', x: 40, y: 0, label: 'K', hint: 'Катод −' }],
      draw: () => `${lead}<rect x="-18" y="-6" width="36" height="12" rx="5" fill="#161616" stroke="#000"/><rect x="9" y="-6" width="4" height="12" fill="#a8adb3"/><rect x="-15" y="-4" width="26" height="2" rx="1" fill="#fff" opacity=".18"/>`,
      stamp: (p, ctx) => { p._e = ctx.add({ type: 'D', a: ctx.n(p, 'a'), b: ctx.n(p, 'b'), ...S.presets['1N4148'] }); },
      measure: (p, sol, ctx) => meas2(p, sol, ctx, sol.currents[p._e]),
      check: (p, m) => m.I > 0.3 ? { level: 'warn', msg: `Ток диода ${fmtUnit(m.I, 'А')} больше допустимых 300 мА` } : null },
    npn: { name: 'NPN 2N2222', group: 'Полупроводники', props: { beta: 200 }, box: [-44, -44, 88, 88],
      pins: [{ id: 'c', x: 20, y: -40, label: 'C', hint: 'Коллектор' }, { id: 'b', x: -40, y: 0, label: 'B', hint: 'База' }, { id: 'e', x: 20, y: 40, label: 'E', hint: 'Эмиттер' }],
      draw: () => `<path d="M-40 0 H-14" class="leg"/><path d="M20 -40 V-22 H6" class="leg"/><path d="M20 40 V22 H6" class="leg"/>
        <path d="M-14 -24 H8 A24 24 0 0 1 8 24 H-14 Z" fill="#1c1c1e" stroke="#444"/><rect x="-14" y="-24" width="3" height="48" fill="#333"/>
        <text x="2" y="-4" class="tiny lightt">2N</text><text x="2" y="6" class="tiny lightt">2222</text>
        <text x="28" y="-30" class="plabel">C</text><text x="-38" y="-6" class="plabel">B</text><text x="28" y="36" class="plabel">E</text>`,
      stamp: (p, ctx) => { p._e = ctx.add({ type: 'Q', c: ctx.n(p, 'c'), b: ctx.n(p, 'b'), e: ctx.n(p, 'e'), ...S.presets['2N2222'], bf: Math.max(1, +(p.props && p.props.beta) || 200) }); },
      measure: (p, sol, ctx) => { const q = sol.currents[p._e]; const vce = ctx.v(p, 'c') - ctx.v(p, 'e'), vbe = ctx.v(p, 'b') - ctx.v(p, 'e');
        return { U: vce, I: q.ic, P: Math.abs(vce * q.ic + vbe * q.ib), pinI: { c: q.ic, b: q.ib, e: q.ie }, extra: { Ib: q.ib, Vbe: vbe } }; },
      check: (p, m) => m.P > 0.5 ? { level: 'warn', msg: `Транзистор перегрет: ${fmtUnit(m.P, 'Вт')} (макс. 0,5 Вт)` } : (m.I > 0.6 ? { level: 'warn', msg: 'Ток коллектора больше 600 мА' } : null) },
    button: { name: 'Кнопка', group: 'Ввод/вывод', pins: two('1', '2'), interactive: 'momentary',
      draw: p => `${lead}<rect x="-20" y="-20" width="40" height="40" rx="3" fill="#2a2a2a" stroke="#111"/><circle cx="-14" cy="-14" r="2" fill="#666"/><circle cx="14" cy="-14" r="2" fill="#666"/><circle cx="-14" cy="14" r="2" fill="#666"/><circle cx="14" cy="14" r="2" fill="#666"/>
        <circle r="${p.on ? 9 : 11}" cy="${p.on ? 1 : 0}" fill="${p.on ? '#8a1c1c' : '#c62828'}" stroke="#4a0a0a" stroke-width="1.5"/>${p.on ? '' : '<circle r="11" fill="none" stroke="#fff" stroke-opacity=".18" stroke-dasharray="10 60"/>'}`,
      stamp: (p, ctx) => { p._e = r2(p, ctx, p.on ? 0.05 : 1e9); }, measure: (p, sol, ctx) => meas2(p, sol, ctx, sol.currents[p._e]) },
    switch: { name: 'Переключатель', group: 'Ввод/вывод', pins: two('1', '2'), interactive: 'toggle',
      draw: p => `${lead}<circle cx="-20" cy="0" r="3" fill="#ddd"/><circle cx="20" cy="0" r="3" fill="#ddd"/><line x1="-20" y1="0" x2="${p.on ? 20 : 14}" y2="${p.on ? 0 : -16}" class="sym" stroke-width="3"/><rect x="-24" y="-24" width="48" height="34" fill="transparent"/>`,
      stamp: (p, ctx) => { p._e = r2(p, ctx, p.on ? 0.05 : 1e9); }, measure: (p, sol, ctx) => meas2(p, sol, ctx, sol.currents[p._e]) },
    breadboard: { name: 'Макетная плата', group: 'Пассивные', board: true, box: [-160, -80, 310, 160],
      pins: (() => { const ps = []; for (let i = 0; i < 30; i++) for (let r = 0; r < 10; r++) ps.push({ id: 'abcdefghij'[r] + (i + 1), x: -150 + 10 * i, y: r < 5 ? -60 + 10 * r : 20 + 10 * (r - 5), label: 'abcdefghij'[r] + (i + 1), hint: 'ряд ' + (i + 1) + (r < 5 ? ' (a–e)' : ' (f–j)') }); return ps; })(),
      strips: (() => { const g = []; for (let i = 1; i <= 30; i++) { g.push(['a', 'b', 'c', 'd', 'e'].map(c => c + i)); g.push(['f', 'g', 'h', 'i', 'j'].map(c => c + i)); } return g; })(),
      draw: () => `<rect x="-160" y="-76" width="310" height="152" rx="5" fill="#f1efe8" stroke="#c9c5b8"/><rect x="-160" y="-6" width="310" height="12" fill="#e2dfd5"/>
        ${'abcdefghij'.split('').map((c, r) => `<text x="-156" y="${(r < 5 ? -60 + 10 * r : 20 + 10 * (r - 5)) + 3}" class="bbl">${c}</text>`).join('')}
        ${[1, 5, 10, 15, 20, 25, 30].map(i => `<text x="${-150 + 10 * (i - 1)}" y="-68" class="bbl" text-anchor="middle">${i}</text>`).join('')}`,
      stamp() {}, measure: () => null },
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
  window.PartsLib = { two, lead, r2, meas2, source, bands, LED_COLORS };
  window.PARTS = PARTS; window.resistorBands = bands; window.LED_COLORS = LED_COLORS; window.fmtUnit = fmtUnit; window.fmtNum = fmtNum; window.e12up = e12up;
})();
