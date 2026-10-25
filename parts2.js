/* v5 part library: more boards (Uno, Pico, Orange Pi), programmable chips, displays, actuators, sensors, ICs, passives.
 * Everything here uses only R/V/D/Q elements of solver.js (owned by Grok Bot); nonlinear parts (MOSFET, relay,
 * regulators) are approximated as state switches updated from the previous solution (1 frame lag). */
(function () {
  const S = window.Solver, L = window.PartsLib, P = window.PARTS, { two, lead, r2, meas2, source } = L;
  const fU = (x, u) => window.fmtUnit(x, u), fN = (x, d) => window.fmtNum(x, d);
  const hex = c => '#' + ((c >>> 0) & 0xffffff).toString(16).padStart(6, '0');
  const imgOk = s => typeof s === 'string' && /^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/.test(s) ? s : '';
  const vdiff = (p, ctx, a, b) => ctx.v(p, a) - ctx.v(p, b);
  const pinsI = (p, sol) => { const o = {}; for (const k in p._els || {}) o[k] = sol.currents[p._els[k]]; return o; };

  /* ---------- programmable boards and chips ---------- */
  function mcu(c) {
    let pins;
    if (c.dip) { const n = c.top.length, x0 = -10 * Math.floor(n / 2);
      pins = [...c.bot.map((id, i) => ({ id, x: x0 + 10 * i, y: 20, label: c.lab ? c.lab(id) : id, hint: c.hint(id) })),
        ...c.top.map((id, i) => ({ id, x: x0 + 10 * i, y: -20, label: c.lab ? c.lab(id) : id, hint: c.hint(id) }))];
    } else { const H = Math.max(c.L.length, c.R.length) * 20 + 50; c.H = H;
      pins = [...c.L.map((id, i) => ({ id, x: -c.w, y: -H / 2 + 40 + i * 20, label: c.lab ? c.lab(id) : id, hint: c.hint(id) })),
        ...c.R.map((id, i) => ({ id, x: c.w, y: -H / 2 + 40 + i * 20, label: c.lab ? c.lab(id) : id, hint: c.hint(id) }))]; }
    const gnd = c.gnd || 'GND';
    const def = {
      name: c.name, group: c.group, mcu: c.kind, vio: c.vio, builtin: c.builtin, pins, gpioOf: id => c.gpio(id), prefix: 'U',
      supplies: c.dip ? undefined : c.supplies, chip: !!c.dip, lang: c.lang || 'c',
      ground: c.dip ? undefined : id => /^GND/.test(id),
      box: c.dip ? [pins[0].x - 9, -24, (c.top.length - 1) * 10 + 18, 48] : [-c.w - 4, -c.H / 2 - 6, 2 * c.w + 8, c.H + 12],
      draw: (p, st) => c.dip ? drawDip(c, pins, p, st) : drawBoard(c, pins, p, st),
      stamp(p, ctx) {
        p._els = {};
        if (c.dip) { p._q = ctx.add({ type: 'R', a: ctx.n(p, c.vcc), b: ctx.n(p, gnd), R: 5000 }); p._els[c.vcc] = p._q;
          for (const [a, b] of c.bridge || []) ctx.add({ type: 'R', a: ctx.n(p, a), b: ctx.n(p, b), R: 0.01 }); }
        else for (const id in c.supplies) { source(p, ctx, id, gnd, c.supplies[id], 0.1); p._els[id] = p._r; }
        const powered = !c.dip || (p._pw || 0) > 2.7, ref = ctx.n(p, gnd);
        for (const q of pins) { const g = c.gpio(q.id); if (g == null || !powered) continue;
          const s = ctx.gpio(g, p.id) || { mode: 'INPUT' };
          if (s.mode === 'OUTPUT') { const m = ctx.node(); p._els[q.id] = ctx.add({ type: 'R', a: m, b: ctx.n(p, q.id), R: 25 }); ctx.add({ type: 'V', p: m, n: ref > 0 ? ref : 0, V: c.vio * (s.val || 0) }); }
          else if (s.mode === 'INPUT_PULLUP') { const m = ctx.node(); p._els[q.id] = ctx.add({ type: 'R', a: m, b: ctx.n(p, q.id), R: 40000 }); ctx.add({ type: 'V', p: m, n: ref > 0 ? ref : 0, V: c.vio }); } }
      },
      measure(p, sol, ctx) {
        const pinI = pinsI(p, sol); let Pw = 0; for (const id in pinI) Pw += Math.abs(ctx.v(p, id) * pinI[id]);
        if (c.dip) { const pw = vdiff(p, ctx, c.vcc, gnd); if ((pw > 2.7) !== ((p._pw || 0) > 2.7)) ctx.dirty(); p._pw = pw; pinI[c.vcc] = -pinI[c.vcc]; }
        const srcI = c.dip ? 0 : Math.max(0, ...Object.keys(pinI).filter(k => k in c.supplies).map(k => Math.abs(pinI[k])));
        return { U: c.dip ? p._pw : c.vio, I: Object.entries(pinI).filter(([k]) => !(c.supplies && k in c.supplies)).reduce((a, [, b]) => a + Math.max(0, -b), 0), P: Pw, pinI, out: !c.dip, srcI };
      },
      check(p, m) {
        if (c.dip && !(p._pw > 2.7)) return { level: 'warn', msg: `${c.short} не запитан: подключи ${c.vcc} к +${c.vio} В и ${gnd} к минусу` };
        for (const q of pins) { if (c.gpio(q.id) == null) continue; const i = Math.abs(m.pinI[q.id] || 0); if (i > c.pinMax) return { level: 'warn', msg: `Ток вывода ${q.label} ${fU(i, 'А')} больше допустимых ${fU(c.pinMax, 'А')} для ${c.short}. Поставь резистор` }; }
      },
    };
    return def;
  }
  function drawBoard(c, pins, p, st) {
    const T = -c.H / 2, B = c.H / 2, W = c.w - 2;
    return `<rect x="${-W}" y="${T}" width="${2 * W}" height="${c.H}" rx="6" fill="${c.pcb}" stroke="#000" stroke-width="1.5"/>
      <rect x="-14" y="${T - 4}" width="28" height="16" rx="2" fill="#c0c4c9" stroke="#80868d"/><rect x="-9" y="${T + 1}" width="18" height="6" rx="1" fill="#555"/>
      ${c.extra ? c.extra(T, B, W) : ''}
      <rect x="-26" y="${T + 40}" width="52" height="52" rx="2" fill="#1d1f22" stroke="#3a3d42"/><text x="0" y="${T + 64}" class="chip lightt">${c.chipName}</text><text x="0" y="${T + 76}" class="tiny lightt">${c.sub}</text>
      ${pins.map(q => `<rect x="${q.x < 0 ? -W : W - 8}" y="${q.y - 4}" width="8" height="8" fill="#0c0c0c" stroke="#444"/><circle cx="${q.x < 0 ? -W + 4 : W - 4}" cy="${q.y}" r="2.2" fill="#d4b13a"/><line x1="${q.x}" y1="${q.y}" x2="${q.x < 0 ? -W : W}" y2="${q.y}" class="lead"/><text x="${q.x < 0 ? -W + 12 : W - 12}" y="${q.y + 3.5}" class="plabel blbl" text-anchor="${q.x < 0 ? 'start' : 'end'}">${q.label}</text>`).join('')}
      <rect x="-16" y="${B - 22}" width="8" height="5" rx="1" fill="#d22"/><text x="-12" y="${B - 26}" class="tiny lightt">PWR</text>
      ${st.led2 ? `<circle cx="12" cy="${B - 20}" r="9" fill="#fb3" opacity=".5" filter="url(#glow)"/>` : ''}<rect x="8" y="${B - 22}" width="8" height="5" rx="1" fill="${st.led2 ? '#fd6' : '#4a3a10'}"/><text x="12" y="${B - 26}" class="tiny lightt">${c.ledName}</text>`;
  }
  function drawDip(c, pins, p, st) {
    const x0 = pins[0].x - 6, w = (c.top.length - 1) * 10 + 12;
    return `${pins.map(q => `<rect x="${q.x - 2}" y="${q.y < 0 ? -20 : 12}" width="4" height="8" fill="#c9ced4"/>`).join('')}
      <rect x="${x0}" y="-13" width="${w}" height="26" rx="2" fill="#1c1c1e" stroke="#000"/><path d="M${x0} -4 a4 4 0 0 1 0 8" fill="#333"/>
      <circle cx="${x0 + 6}" cy="8" r="1.6" fill="#333"/><text x="${x0 + w / 2}" y="2" class="tiny lightt">${c.chipName}</text>
      ${(p._pw || 0) > 2.7 && st.led2 !== undefined ? '' : ''}`;
  }
  const UNO_L = ['IOREF', 'RST', '3V3', '5V', 'GND', 'GND2', 'A0', 'A1', 'A2', 'A3', 'A4', 'A5'];
  const UNO_R = ['D13', 'D12', 'D11', 'D10', 'D9', 'D8', 'D7', 'D6', 'D5', 'D4', 'D3', 'D2', 'D1', 'D0', 'GND3', 'AREF'];
  const arduinoGpio = id => { let m = /^D(\d+)$/.exec(id); if (m) return +m[1]; m = /^A([0-5])$/.exec(id); if (m) return 14 + +m[1]; return null; };
  const arduinoHint = id => /^GND/.test(id) ? 'GND (земля)' : id === '5V' ? '5V (питание 5 В)' : id === '3V3' ? '3V3 (3,3 В, до 50 мА)' : /^A\d/.test(id) ? id + ' (аналоговый вход, цифровой ' + arduinoGpio(id) + ')' : /^D\d/.test(id) ? 'цифровой вывод ' + id.slice(1) + ([3, 5, 6, 9, 10, 11].includes(arduinoGpio(id)) ? ' (ШИМ ~)' : '') : id;
  const glab = id => id.replace(/^GND\d$/, 'GND');
  L.mcu = mcu;
  P.uno = mcu({ kind: 'uno', name: 'Arduino Uno (ATmega328P)', short: 'Arduino Uno', group: 'Платы', vio: 5, builtin: 13, pinMax: 0.04, w: 90, L: UNO_L, R: UNO_R,
    supplies: { '5V': 5, '3V3': 3.3, IOREF: 5 }, gpio: arduinoGpio, hint: arduinoHint, lab: glab, pcb: '#0f6f86', chipName: 'ATmega328P', sub: '16 МГц · 5 В', ledName: 'L',
    extra: (T, B, W) => `<rect x="${-W + 8}" y="${B - 40}" width="30" height="26" rx="3" fill="#222" stroke="#000"/><text x="${-W + 23}" y="${B - 44}" class="tiny lightt">DC</text><text x="0" y="${B - 40}" class="chip lightt">UNO</text>` });
  const PICO_L = ['GP0', 'GP1', 'GND', 'GP2', 'GP3', 'GP4', 'GP5', 'GND2', 'GP6', 'GP7', 'GP8', 'GP9', 'GND3', 'GP10', 'GP11', 'GP12', 'GP13', 'GND4', 'GP14', 'GP15'];
  const PICO_R = ['VBUS', 'VSYS', 'GND5', '3V3', 'GP28', 'GND6', 'GP27', 'GP26', 'RUN', 'GP22', 'GND7', 'GP21', 'GP20', 'GP19', 'GP18', 'GND8', 'GP17', 'GP16'];
  const picoGpio = id => { const m = /^GP(\d+)$/.exec(id); return m ? +m[1] : null; };
  P.pico = mcu({ kind: 'pico', name: 'Raspberry Pi Pico (RP2040)', short: 'Pico', group: 'Платы', vio: 3.3, builtin: 25, pinMax: 0.012, w: 70, L: PICO_L, R: PICO_R,
    supplies: { VBUS: 5, VSYS: 4.8, '3V3': 3.3 }, gpio: picoGpio, lab: glab, pcb: '#1f7a3a', chipName: 'RP2040', sub: '133 МГц · 3,3 В', ledName: 'GP25',
    hint: id => /^GND/.test(id) ? 'GND (земля)' : id === 'VBUS' ? 'VBUS (5 В от USB)' : id === 'VSYS' ? 'VSYS (≈4,8 В)' : id === '3V3' ? '3V3 (выход 3,3 В)' : /^GP2[678]$/.test(id) ? id + ' (ADC' + (picoGpio(id) - 26) + ', A' + (picoGpio(id) - 26) + ')' : /^GP/.test(id) ? 'GPIO' + picoGpio(id) : id });
  const OPI_L = ['3V3', '5V', 'GND', 'G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7'];
  const OPI_R = ['HDMI', '5Vb', 'GND2', 'G8', 'G9', 'G10', 'G11', 'G12', 'G13', 'G14', 'G15'];
  P.opi = mcu({ kind: 'opi', lang: 'python', name: 'Orange Pi (Python + HDMI)', short: 'Orange Pi', group: 'Платы', vio: 3.3, builtin: null, pinMax: 0.016, w: 90, L: OPI_L, R: OPI_R,
    supplies: { '3V3': 3.3, '5V': 5, '5Vb': 5 }, gpio: id => { const m = /^G(\d+)$/.exec(id); return m ? +m[1] : null; }, pcb: '#1b1b1b', chipName: 'Allwinner H3', sub: 'Linux · Python', ledName: 'ACT',
    lab: id => id === 'HDMI' ? 'HDMI' : /^G\d/.test(id) ? 'GPIO' + id.slice(1) : glab(id).replace('5Vb', '5V'),
    hint: id => id === 'HDMI' ? 'HDMI-выход: соедини с монитором' : /^GND/.test(id) ? 'GND (земля)' : /^5V/.test(id) ? '5V' : id === '3V3' ? '3V3' : 'GPIO' + id.slice(1) + ' (номер для GPIO.setup)',
    extra: (T, B, W) => `<rect x="${W - 40}" y="${T + 6}" width="30" height="14" rx="2" fill="#aaa" stroke="#555"/><text x="${W - 25}" y="${T + 30}" class="tiny lightt">HDMI</text><rect x="${-W + 8}" y="${T + 6}" width="30" height="22" fill="#9aa" stroke="#555"/><text x="${-W + 23}" y="${T + 36}" class="tiny lightt">LAN</text>` });
  P.opi.measure = (base => (p, sol, ctx) => { const m = base(p, sol, ctx); delete m.pinI.HDMI; return m; })(P.opi.measure);
  // DIP chips: pins straddle the breadboard gap (rows e/f)
  P.atmega328 = mcu({ kind: 'atmega', name: 'ATmega328P (DIP-28)', short: 'ATmega328P', group: 'Микросхемы', vio: 5, builtin: 13, pinMax: 0.04, dip: true, vcc: 'VCC', chipName: 'ATMEGA328P',
    bot: ['RST', 'D0', 'D1', 'D2', 'D3', 'D4', 'VCC', 'GND', 'X1', 'X2', 'D5', 'D6', 'D7', 'D8'], top: ['A5', 'A4', 'A3', 'A2', 'A1', 'A0', 'GND2', 'AREF', 'AVCC', 'D13', 'D12', 'D11', 'D10', 'D9'],
    bridge: [['GND', 'GND2'], ['VCC', 'AVCC']], gpio: arduinoGpio, hint: id => id === 'VCC' || id === 'AVCC' ? id + ' (+5 В)' : id === 'X1' || id === 'X2' ? 'кварц 16 МГц (в симуляторе не нужен)' : arduinoHint(id), lab: glab });
  P.attiny85 = mcu({ kind: 'attiny', name: 'ATtiny85 (DIP-8)', short: 'ATtiny85', group: 'Микросхемы', vio: 5, builtin: 1, pinMax: 0.04, dip: true, vcc: 'VCC', chipName: 'ATTINY85',
    bot: ['PB5', 'PB3', 'PB4', 'GND'], top: ['VCC', 'PB2', 'PB1', 'PB0'], gpio: id => { const m = /^PB([0-4])$/.exec(id); return m ? +m[1] : null; },
    hint: id => id === 'VCC' ? 'VCC (+5 В)' : id === 'GND' ? 'GND' : id === 'PB5' ? 'PB5 / RESET' : id + ' (pinMode(' + id.slice(2) + '))' + ({ PB2: ', A1', PB4: ', A2', PB3: ', A3' }[id] || '') });

  /* ---------- displays (driven by the sketch API, powered electrically) ---------- */
  const PWR3 = (y0, dataPin, dx = 20) => [{ id: 'VCC', x: -dx, y: y0, label: 'VCC', hint: 'VCC (+5 В или 3,3 В)' }, { id: dataPin, x: 0, y: y0, label: dataPin, hint: dataPin + ': к выводу платы' }, { id: 'GND', x: dx, y: y0, label: 'GND', hint: 'GND' }];
  function display(o) {
    return Object.assign({ group: 'Индикация', prefix: 'H', dataPin: o.dataPin || 'DIN',
      stamp(p, ctx) { const I = Math.max(0.001, o.load ? o.load(p) : 0.02); p._e = ctx.add({ type: 'R', a: ctx.n(p, 'VCC'), b: ctx.n(p, 'GND'), R: (o.vnom || 5) / I }); p._Iset = I; },
      measure(p, sol, ctx) { const I = sol.currents[p._e], U = vdiff(p, ctx, 'VCC', 'GND'); return { U, I, P: Math.abs(U * I), pinI: { VCC: I, GND: -I }, powered: U > 2.5 }; },
    }, o);
  }
  const wsLoad = n => p => { const px = (p._mod && p._mod.px) || []; let s = 0; for (let i = 0; i < n; i++) { const c = px[i] | 0; s += ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255); } return 0.001 * n + s / 765 * 0.06; };
  function wsDraw(n, layout) {
    return (p, st) => { const px = st.on && st.mod && st.mod.px || [];
      let h = layout.frame;
      for (let i = 0; i < n; i++) { const [x, y] = layout.pos(i), c = px[i] | 0, on = c !== 0;
        h += `<rect x="${x - layout.s / 2}" y="${y - layout.s / 2}" width="${layout.s}" height="${layout.s}" rx="1" fill="#f2f2f2" opacity=".85"/><circle cx="${x}" cy="${y}" r="${layout.s * 0.36}" fill="${on ? hex(c) : '#2a2a2a'}"/>${on ? `<circle cx="${x}" cy="${y}" r="${layout.s * 0.62}" fill="${hex(c)}" opacity=".35"/>` : ''}`; }
      return h + (st.on === false && st.running ? `<text x="0" y="${layout.msgY}" class="lbl warnt">${st.why || ''}</text>` : ''); };
  }
  const gridLayout = (k, s) => { const W = k * s; return { s, msgY: -W / 2 - 8, frame: `<rect x="${-W / 2 - 6}" y="${-W / 2 - 6}" width="${W + 12}" height="${W + 12}" rx="3" fill="#0d0d0d" stroke="#333"/><path d="M-20 ${W / 2 + 6} V${W / 2 + 20} M0 ${W / 2 + 6} V${W / 2 + 20} M20 ${W / 2 + 6} V${W / 2 + 20}" class="leg"/>`, pos: i => [-W / 2 + s / 2 + (i % k) * s, -W / 2 + s / 2 + Math.floor(i / k) * s] }; };
  P.wsm8 = display({ name: 'Матрица WS2812 8×8', display: 'strip', n: 64, pins: PWR3(60, 'DIN'), box: [-58, -58, 116, 122], load: wsLoad(64), draw: wsDraw(64, gridLayout(8, 13)) });
  P.wsm16 = display({ name: 'Матрица WS2812 16×16', display: 'strip', n: 256, pins: PWR3(100, 'DIN'), box: [-90, -90, 180, 194], load: wsLoad(256), draw: wsDraw(256, gridLayout(16, 10.5)) });
  P.strip8 = display({ name: 'Лента WS2812 (8 LED)', display: 'strip', n: 8, box: [-94, -26, 188, 50], pins: [{ id: 'VCC', x: -90, y: -10, label: '5V', hint: '5V' }, { id: 'DIN', x: -90, y: 0, label: 'DIN', hint: 'DIN: к выводу платы' }, { id: 'GND', x: -90, y: 10, label: 'GND', hint: 'GND' }],
    load: wsLoad(8), draw: wsDraw(8, { s: 18, msgY: -18, frame: '<rect x="-84" y="-14" width="172" height="28" rx="3" fill="#f5f5f5" stroke="#bbb"/>', pos: i => [-70 + i * 21, 0] }) });
  P.ring16 = display({ name: 'Кольцо WS2812 (16 LED)', display: 'strip', n: 16, box: [-56, -56, 112, 96], pins: PWR3(40, 'DIN'),
    load: wsLoad(16), draw: wsDraw(16, { s: 12, msgY: -56, frame: '<circle r="50" fill="none" stroke="#111" stroke-width="16"/><path d="M-20 34 V40 M0 34 V40 M20 34 V40" class="leg"/>', pos: i => [Math.sin(i / 16 * 2 * Math.PI) * 50, -Math.cos(i / 16 * 2 * Math.PI) * 50] }) });
  P.max7219 = display({ name: 'Матрица 8×8 MAX7219', display: 'matrix', box: [-60, -60, 120, 128],
    pins: [{ id: 'VCC', x: -40, y: 60, label: 'VCC', hint: 'VCC +5 В' }, { id: 'GND', x: -20, y: 60, label: 'GND', hint: 'GND' }, { id: 'DIN', x: 0, y: 60, label: 'DIN', hint: 'DIN: к выводу платы' }, { id: 'CS', x: 20, y: 60, label: 'CS', hint: 'CS' }, { id: 'CLK', x: 40, y: 60, label: 'CLK', hint: 'CLK' }],
    load: p => { let k = 0; for (const r of (p._mod && p._mod.rows) || []) for (let b = 0; b < 8; b++) k += (r >> b) & 1; return 0.008 + k * 0.004; },
    draw: (p, st) => { const rows = st.on && st.mod && st.mod.rows || []; let h = '<rect x="-56" y="-56" width="112" height="112" rx="3" fill="#0a0a0a" stroke="#333"/><rect x="-56" y="44" width="112" height="12" fill="#1b4fa0"/><path d="M-40 56 V60 M-20 56 V60 M0 56 V60 M20 56 V60 M40 56 V60" class="leg"/>';
      for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { const on = ((rows[y] | 0) >> x) & 1; h += `<circle class="${on ? 'mxon' : 'mxoff'}" cx="${-45.5 + x * 13}" cy="${-49 + y * 12}" r="5" fill="${on ? '#ff2a2a' : '#3a1414'}"/>${on ? `<circle cx="${-45.5 + x * 13}" cy="${-49 + y * 12}" r="7.5" fill="#ff3030" opacity=".35"/>` : ''}`; }
      return h + (st.on === false && st.running ? `<text x="0" y="-62" class="lbl warnt">${st.why || ''}</text>` : ''); } });
  const I2C = y => [{ id: 'GND', x: -30, y, label: 'GND', hint: 'GND' }, { id: 'VCC', x: -10, y, label: 'VCC', hint: 'VCC 3,3–5 В' }, { id: 'SCL', x: 10, y, label: 'SCL', hint: 'SCL (I2C)' }, { id: 'SDA', x: 30, y, label: 'SDA', hint: 'SDA (I2C): к выводу платы' }];
  P.oled = display({ name: 'OLED SSD1306 128×64 (I2C)', display: 'oled', dataPin: 'SDA', vnom: 3.3, box: [-74, -44, 148, 90], pins: I2C(-40), load: () => 0.02,
    draw: (p, st) => { const im = st.on ? imgOk(st.img) : ''; return `<path d="M-30 -40 V-34 M-10 -40 V-34 M10 -40 V-34 M30 -40 V-34" class="leg"/><rect x="-70" y="-34" width="140" height="76" rx="4" fill="#1d3b8f" stroke="#0d1f55"/><rect x="-66" y="-26" width="132" height="66" fill="#000"/>${im ? `<image href="${im}" x="-64" y="-24" width="128" height="64" class="pix"/>` : ''}${st.on === false && st.running ? `<text x="0" y="10" class="lbl warnt">${st.why || ''}</text>` : ''}`; } });
  P.lcd1602 = display({ name: 'LCD 16×2 (I2C)', display: 'lcd', dataPin: 'SDA', box: [-104, -44, 208, 90], pins: I2C(-40), load: () => 0.025,
    draw: (p, st) => { const im = st.on ? imgOk(st.img) : ''; return `<path d="M-30 -40 V-34 M-10 -40 V-34 M10 -40 V-34 M30 -40 V-34" class="leg"/><rect x="-100" y="-34" width="200" height="76" rx="3" fill="#0b5d1e" stroke="#063b12"/><rect x="-88" y="-20" width="176" height="50" fill="#222"/><rect x="-84" y="-16" width="168" height="42" fill="${st.on ? '#9bc53d' : '#3d5418'}"/>${im ? `<image href="${im}" x="-84" y="-16" width="168" height="42"/>` : ''}`; } });
  P.monitor = { name: 'HDMI-монитор 1920×1080', group: 'Индикация', display: 'hdmi', prefix: 'M', dataPin: 'HDMI', box: [-164, -100, 328, 210],
    pins: [{ id: 'HDMI', x: -160, y: 80, label: 'HDMI', hint: 'HDMI-вход: соедини с выводом HDMI у Orange Pi. Двойной щелчок — на весь экран' }],
    draw: (p, st) => { const im = st.on ? imgOk(st.img) : ''; return `<rect x="-150" y="-96" width="300" height="180" rx="6" fill="#111" stroke="#333" stroke-width="2"/><rect x="-142" y="-88" width="284" height="160" fill="#05070a"/>
      ${im ? `<image href="${im}" x="-142" y="-88" width="284" height="160"/>` : `<text x="0" y="-8" class="lbl">${st.running ? 'Нет сигнала' : '1920×1080'}</text><text x="0" y="10" class="tiny lightt">${st.running ? (st.why || '') : 'двойной щелчок — на весь экран'}</text>`}
      <rect x="-20" y="84" width="40" height="14" fill="#222"/><rect x="-50" y="96" width="100" height="8" rx="3" fill="#2a2a2a"/><path d="M-160 80 H-150" class="leg"/>`; },
    stamp() {}, measure: () => ({ U: 0, I: 0, P: 0, pinI: {} }) };

  /* ---------- RGB LED, 7-segment ---------- */
  const RGBV = [['R', '#ff3030', 1.9], ['G', '#30ff50', 2.9], ['B', '#3080ff', 3.0]];
  P.rgbled = { name: 'RGB-светодиод (общий катод)', group: 'Индикация', prefix: 'D', box: [-34, -50, 68, 74],
    pins: [{ id: 'R', x: -30, y: 20, label: 'R', hint: 'анод красного' }, { id: 'K', x: -10, y: 20, label: '−', hint: 'общий катод (−)' }, { id: 'G', x: 10, y: 20, label: 'G', hint: 'анод зелёного' }, { id: 'B', x: 30, y: 20, label: 'B', hint: 'анод синего' }],
    draw: (p, st) => { const I = (st.m && st.m.ch) || [0, 0, 0], k = I.map(i => Math.min(1, Math.max(0, i) / 0.012)), col = `rgb(${Math.round(255 * k[0])},${Math.round(255 * k[1])},${Math.round(255 * k[2])})`, b = Math.max(...k);
      return `<path d="M-30 20 V0 M-10 20 V0 M10 20 V0 M30 20 V0" class="leg"/>${b > 0.02 ? `<circle cx="0" cy="-22" r="${18 + 12 * b}" fill="${col}" opacity="${0.6 * b}" filter="url(#glow)"/>` : ''}
        <path d="M-13 0 V-26 A13 13 0 0 1 13 -26 V0 Z" fill="${b > 0.02 ? col : '#ddd'}" fill-opacity="${b > 0.02 ? 0.85 : 0.35}" stroke="#bbb"/>`; },
    stamp(p, ctx) { p._ch = RGBV.map(([id, , vf]) => ctx.add({ type: 'D', a: ctx.n(p, id), b: ctx.n(p, 'K'), Is: S.ledIs(vf), n: 2 })); },
    measure(p, sol, ctx) { const ch = p._ch.map(e => sol.currents[e]), I = ch.reduce((a, b) => a + b, 0); return { U: Math.max(...RGBV.map(([id]) => vdiff(p, ctx, id, 'K'))), I, P: RGBV.reduce((a, [id], i) => a + Math.abs(vdiff(p, ctx, id, 'K') * ch[i]), 0), ch, pinI: { R: ch[0], G: ch[1], B: ch[2], K: -I } }; },
    check: (p, m) => m.ch.some(i => i > 0.03) ? { level: 'warn', msg: `RGB-светодиод перегружен: ${fU(Math.max(...m.ch), 'А')} на канал (макс. 20 мА). Поставь резисторы на каждый цвет` } : null };
  const SEG = { a: 'M-12 -30 h24', b: 'M14 -28 v24', c: 'M14 4 v24', d: 'M-12 30 h24', e: 'M-14 4 v24', f: 'M-14 -28 v24', g: 'M-12 0 h24' };
  const SEGP = ['g', 'f', 'COM', 'a', 'b', 'e', 'd', 'COM2', 'c', 'dp'];
  P.seg7 = { name: '7-сегментный индикатор (общий катод)', group: 'Индикация', prefix: 'H', box: [-44, -64, 88, 128],
    pins: SEGP.map((id, i) => ({ id, x: -40 + (i % 5) * 20, y: i < 5 ? -60 : 60, label: id.replace('COM2', 'COM'), hint: /^COM/.test(id) ? 'общий катод (−)' : 'сегмент ' + id })),
    draw: (p, st) => { const I = (st.m && st.m.seg) || {}; const on = s => (I[s] || 0) > 0.0005;
      return `<path d="M-40 -60 V-46 M-20 -60 V-46 M0 -60 V-46 M20 -60 V-46 M40 -60 V-46 M-40 60 V46 M-20 60 V46 M0 60 V46 M20 60 V46 M40 60 V46" class="leg"/><rect x="-34" y="-46" width="68" height="92" rx="3" fill="#161616" stroke="#000"/>
        ${Object.entries(SEG).map(([s, d]) => `<path d="${d}" stroke="${on(s) ? '#ff3030' : '#3a1515'}" stroke-width="6" stroke-linecap="round" transform="skewX(-6)"/>`).join('')}<circle cx="22" cy="32" r="3.5" fill="${on('dp') ? '#ff3030' : '#3a1515'}"/>`; },
    stamp(p, ctx) { p._s = {}; for (const s of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'dp']) p._s[s] = ctx.add({ type: 'D', a: ctx.n(p, s), b: ctx.n(p, 'COM'), Is: S.ledIs(2.0), n: 2 }); p._cc = ctx.add({ type: 'R', a: ctx.n(p, 'COM2'), b: ctx.n(p, 'COM'), R: 0.01 }); },
    measure(p, sol, ctx) { const seg = {}; let I = 0, Pw = 0; const pinI = {}; for (const s in p._s) { seg[s] = sol.currents[p._s[s]]; I += seg[s]; pinI[s] = seg[s]; Pw += Math.abs(seg[s] * 2); }
      const icc = sol.currents[p._cc]; pinI.COM2 = icc; pinI.COM = -I - icc; return { U: 2, I, P: Pw, seg, pinI }; },
    check: (p, m) => Object.values(m.seg).some(i => i > 0.03) ? { level: 'warn', msg: 'Сегмент индикатора перегружен (больше 20 мА). Поставь резисторы' } : null };

  /* ---------- active: MOSFET, relay, motor, servo, buzzer ---------- */
  const sw = (p, ctx, a, b, on) => ctx.add({ type: 'R', a: ctx.n(p, a), b: ctx.n(p, b), R: on ? 0.03 : 1e9 });
  const mos = (pch) => ({ name: pch ? 'MOSFET IRF9540 (P-канал)' : 'MOSFET IRLZ44N (N-канал)', group: 'Активные', prefix: 'Q', box: [-44, -44, 88, 88],
    props: pch ? { K: 1, Vth: 2, lambda: 0.01 } : { K: 2, Vth: 1.8, lambda: 0.01 }, p: pch,
    pins: [{ id: 'd', x: 20, y: -40, label: 'D', hint: pch ? 'Сток (к нагрузке)' : 'Сток (к нагрузке)' }, { id: 'g', x: -40, y: 0, label: 'G', hint: pch ? 'Затвор (0 В = открыт)' : 'Затвор (к выводу платы)' }, { id: 's', x: 20, y: 40, label: 'S', hint: pch ? 'Исток (к плюсу питания)' : 'Исток (к GND)' }],
    draw: (p, st) => `<path d="M-40 0 H-14" class="leg"/><path d="M20 -40 V-22 H6" class="leg"/><path d="M20 40 V22 H6" class="leg"/><rect x="-14" y="-26" width="28" height="44" rx="2" fill="#151515" stroke="#444"/><rect x="-16" y="-34" width="32" height="10" fill="#bfc4ca"/><circle cy="-29" r="3" fill="#777"/>
      <text x="0" y="-4" class="tiny lightt">${pch ? 'IRF' : 'IRLZ'}</text><text x="0" y="6" class="tiny lightt">${pch ? '9540' : '44N'}</text>${st && st.m && Math.abs(st.m.I) > 1e-3 ? '<circle cx="0" cy="12" r="2" fill="#4f4"/>' : ''}<text x="28" y="-30" class="plabel">D</text><text x="-38" y="-6" class="plabel">G</text><text x="28" y="36" class="plabel">S</text>`,
    stamp(p, ctx) { const pr = p.props || {}; p._g = ctx.add({ type: 'R', a: ctx.n(p, 'g'), b: ctx.n(p, 's'), R: 1e7 });
      p._e = ctx.add({ type: 'M', d: ctx.n(p, 'd'), g: ctx.n(p, 'g'), s: ctx.n(p, 's'), K: +pr.K || 1, Vth: +pr.Vth || 2, lambda: +pr.lambda || 0, p: pch }); },
    measure(p, sol, ctx) { const c = sol.currents[p._e] || { id: 0, ig: 0, is: 0 }, ig = sol.currents[p._g] || 0, I = c.id, U = vdiff(p, ctx, 'd', 's'), vgs = vdiff(p, ctx, 'g', 's');
      return { U, I, P: Math.abs(U * I), pinI: { d: I, g: c.ig + ig, s: c.is - ig }, extra: { Vgs: vgs } }; },
    check: (p, m) => m.P > 2 ? { level: 'warn', msg: `MOSFET греется: ${fU(m.P, 'Вт')} — нужен радиатор` } : null });
  P.mosfet = mos(false); P.pmosfet = mos(true);
  P.relay = { name: 'Реле 5 В', group: 'Активные', prefix: 'K', box: [-44, -44, 88, 88],
    pins: [{ id: 'c1', x: -40, y: -20, label: 'IN+', hint: 'катушка +' }, { id: 'c2', x: -40, y: 20, label: 'IN−', hint: 'катушка −' }, { id: 'com', x: 40, y: 0, label: 'COM', hint: 'общий контакт' }, { id: 'no', x: 40, y: -30, label: 'NO', hint: 'нормально разомкнутый' }, { id: 'nc', x: 40, y: 30, label: 'NC', hint: 'нормально замкнутый' }],
    draw: p => `<path d="M-40 -20 H-30 M-40 20 H-30 M30 0 H40 M30 -30 H40 M30 30 H40" class="leg"/><rect x="-30" y="-38" width="60" height="76" rx="3" fill="#1d4fd0" stroke="#0e2a78"/><text x="0" y="-22" class="tiny lightt">SRD-05VDC</text>
      <path d="M-20 -8 q5 -6 10 0 q5 6 10 0 q5 -6 10 0" stroke="#e0b030" stroke-width="2" fill="none"/><line x1="18" y1="${p._on ? -24 : 24}" x2="26" y2="0" stroke="#ddd" stroke-width="2.5"/><circle cx="${p._on ? 20 : 20}" cy="${p._on ? -26 : 26}" r="2" fill="#ddd"/>${p._on ? '<circle cx="-18" cy="26" r="3" fill="#f33"/>' : ''}`,
    stamp(p, ctx) { p._c = ctx.add({ type: 'R', a: ctx.n(p, 'c1'), b: ctx.n(p, 'c2'), R: 70 }); p._no = sw(p, ctx, 'com', 'no', p._on); p._nc = sw(p, ctx, 'com', 'nc', !p._on); },
    measure(p, sol, ctx) { const I = sol.currents[p._c], on = Math.abs(I) > 0.05; if (on !== !!p._on) { p._on = on; ctx.dirty(); } const ino = sol.currents[p._no], inc = sol.currents[p._nc];
      return { U: vdiff(p, ctx, 'c1', 'c2'), I, P: Math.abs(vdiff(p, ctx, 'c1', 'c2') * I), pinI: { c1: I, c2: -I, com: ino + inc, no: -ino, nc: -inc }, extra: { 'Контакты': on ? 'COM–NO замкнуты' : 'COM–NC замкнуты' } }; },
    check: (p, m, ctx) => Math.abs(m.I) > 0.01 && Math.abs(m.I) < 0.05 ? { level: 'warn', msg: 'Реле не срабатывает: мало тока через катушку (нужно ≈70 мА при 5 В). Управляй реле через транзистор или модуль' } : null };
  P.motor = { name: 'Мотор постоянного тока', group: 'Активные', prefix: 'M', pins: two('+', '−'), box: [-44, -34, 88, 64],
    draw: (p, st) => { const a = ((st.anim || 0) % 360).toFixed(1); return `${lead}<rect x="-22" y="-20" width="38" height="40" rx="8" fill="#b9bec5" stroke="#6a7078"/><rect x="16" y="-6" width="10" height="12" fill="#8a9099"/>
      <g transform="rotate(${a} 0 0)"><path d="M0 -14 V14 M-14 0 H14" stroke="#333" stroke-width="3"/></g><circle r="4" fill="#555"/><text x="0" y="-26" class="lbl">M</text>`; },
    stamp: (p, ctx) => { p._e = r2(p, ctx, 8); }, measure: (p, sol, ctx) => meas2(p, sol, ctx, sol.currents[p._e]),
    check: (p, m) => Math.abs(m.I) > 1.2 ? { level: 'warn', msg: `Мотор потребляет ${fU(Math.abs(m.I), 'А')} — не питай его от вывода платы, нужен транзистор/MOSFET` } : null };
  P.servo = { name: 'Сервопривод SG90', group: 'Активные', prefix: 'M', display: 'servo', dataPin: 'SIG', box: [-44, -44, 88, 76],
    pins: [{ id: 'GND', x: -40, y: 20, label: 'GND', hint: 'GND (коричневый)' }, { id: 'VCC', x: -40, y: 0, label: '+5V', hint: '+5 В (красный)' }, { id: 'SIG', x: -40, y: -20, label: 'SIG', hint: 'сигнал (оранжевый): к выводу платы' }],
    draw: (p, st) => { const ang = st.on && st.mod ? st.mod.a : 90; return `<path d="M-40 -20 H-26" stroke="#f90" stroke-width="2"/><path d="M-40 0 H-26" stroke="#d22" stroke-width="2"/><path d="M-40 20 H-26" stroke="#753" stroke-width="2"/>
      <rect x="-26" y="-18" width="56" height="36" rx="3" fill="#1d4fd0" stroke="#0e2a78"/><circle cx="14" cy="0" r="9" fill="#eee"/><g transform="rotate(${(ang - 90).toFixed(1)} 14 0)"><path d="M14 -4 L14 -32 L18 -30 L18 4 Z" fill="#f4f4f4" stroke="#aaa"/></g><text x="0" y="28" class="tiny lightt">${Math.round(ang)}°</text>`; },
    stamp(p, ctx) { p._e = ctx.add({ type: 'R', a: ctx.n(p, 'VCC'), b: ctx.n(p, 'GND'), R: 25 }); p._s = ctx.add({ type: 'R', a: ctx.n(p, 'SIG'), b: ctx.n(p, 'GND'), R: 1e6 }); },
    measure(p, sol, ctx) { const I = sol.currents[p._e], U = vdiff(p, ctx, 'VCC', 'GND'); return { U, I, P: Math.abs(U * I), pinI: { VCC: I, GND: -I - sol.currents[p._s], SIG: sol.currents[p._s] }, powered: U > 4 }; } };
  P.buzzer = { name: 'Зуммер (активный)', group: 'Активные', prefix: 'BZ', pins: two('+', '−'), box: [-44, -40, 88, 64],
    draw: (p, st) => { const on = st.m && st.m.I > 0.005, t = Date.now() / 120 % 3; return `${lead}<circle r="20" fill="#151515" stroke="#000"/><circle r="4" fill="#333"/><text x="-14" y="-12" class="tiny lightt">+</text>
      ${on ? [0, 1, 2].map(k => `<path d="M${24 + ((k + t) % 3) * 6} -10 q6 10 0 20" stroke="#ffd34d" stroke-width="2" fill="none" opacity="${(1 - ((k + t) % 3) / 3).toFixed(2)}"/>`).join('') : ''}`; },
    stamp: (p, ctx) => { p._e = ctx.add({ type: 'D', a: ctx.n(p, 'a'), b: ctx.n(p, 'b'), Is: S.ledIs(1.5), n: 2 }); p._r = r2(p, ctx, 1e6); },
    measure: (p, sol, ctx) => meas2(p, sol, ctx, sol.currents[p._e] + sol.currents[p._r]) };

  /* ---------- sensors (values set with sliders) ---------- */
  const ldrR = lux => Math.min(1e6, Math.max(80, 10000 * Math.pow(10 / Math.max(0.1, lux), 0.8)));
  const ntcR = t => 10000 * Math.exp(3950 * (1 / (t + 273.15) - 1 / 298.15));
  P.ldr = { name: 'Фоторезистор GL5528', group: 'Датчики', prefix: 'R', props: { lux: 100 }, pins: two('1', '2'), box: [-44, -36, 88, 60],
    draw: p => `${lead}<circle r="16" fill="#e8c89a" stroke="#a88a5a"/><path d="M-10 -6 h20 M-10 0 h20 M-10 6 h20" stroke="#b33" stroke-width="2"/><text x="0" y="-22" class="lbl">${fN(p.props.lux, 0)} лк · ${fU(ldrR(p.props.lux), 'Ом')}</text>`,
    stamp: (p, ctx) => { p._e = r2(p, ctx, ldrR(+p.props.lux)); }, measure: (p, sol, ctx) => meas2(p, sol, ctx, sol.currents[p._e]) };
  P.ntc = { name: 'Термистор NTC 10 кОм', group: 'Датчики', prefix: 'R', props: { temp: 25 }, pins: two('1', '2'), box: [-44, -36, 88, 52],
    draw: p => `${lead}<ellipse rx="12" ry="9" fill="#2b5fbf" stroke="#123c80"/><path d="M-20 0 H-12 M12 0 H20" class="leg"/><text x="0" y="-16" class="lbl">${fN(p.props.temp, 1)} °C · ${fU(ntcR(+p.props.temp), 'Ом')}</text>`,
    stamp: (p, ctx) => { p._e = r2(p, ctx, ntcR(+p.props.temp)); }, measure: (p, sol, ctx) => meas2(p, sol, ctx, sol.currents[p._e]) };
  const pw3 = (p, ctx) => { p._e = ctx.add({ type: 'R', a: ctx.n(p, 'VCC'), b: ctx.n(p, 'GND'), R: 2500 }); };
  const pw3m = (p, sol, ctx) => { const I = sol.currents[p._e], U = vdiff(p, ctx, 'VCC', 'GND'); return { U, I, P: Math.abs(U * I), pinI: { VCC: I, GND: -I }, powered: U > 2.7 }; };
  P.dht22 = { name: 'DHT22 (температура/влажность)', group: 'Датчики', prefix: 'U', sensor: 'dht', dataPin: 'DATA', props: { temp: 24, hum: 45 }, box: [-34, -46, 68, 94],
    pins: [{ id: 'VCC', x: -20, y: 40, label: '+', hint: 'VCC' }, { id: 'DATA', x: 0, y: 40, label: 'OUT', hint: 'DATA: к выводу платы (dht.readTemperature())' }, { id: 'GND', x: 20, y: 40, label: '−', hint: 'GND' }],
    draw: p => `<path d="M-20 40 V30 M0 40 V30 M20 40 V30" class="leg"/><rect x="-28" y="-42" width="56" height="72" rx="4" fill="#f0f0f0" stroke="#aaa"/>${[0, 1, 2, 3, 4].map(k => `<rect x="-20" y="${-34 + k * 9}" width="40" height="5" rx="2" fill="#bbb"/>`).join('')}<text x="0" y="16" class="tiny">${fN(p.props.temp, 1)}°C ${fN(p.props.hum, 0)}%</text>`,
    stamp: pw3, measure: pw3m };
  P.hcsr04 = { name: 'Дальномер HC-SR04', group: 'Датчики', prefix: 'U', sensor: 'sonar', dataPin: 'ECHO', props: { dist: 50 }, box: [-54, -36, 108, 72],
    pins: [{ id: 'VCC', x: -30, y: 30, label: 'Vcc', hint: 'Vcc +5 В' }, { id: 'TRIG', x: -10, y: 30, label: 'Trig', hint: 'Trig: к выводу платы' }, { id: 'ECHO', x: 10, y: 30, label: 'Echo', hint: 'Echo: к выводу платы (sonar.distanceCm())' }, { id: 'GND', x: 30, y: 30, label: 'Gnd', hint: 'Gnd' }],
    draw: p => `<path d="M-30 30 V20 M-10 30 V20 M10 30 V20 M30 30 V20" class="leg"/><rect x="-50" y="-30" width="100" height="50" rx="3" fill="#1d4fd0" stroke="#0e2a78"/><circle cx="-26" cy="-6" r="16" fill="#ccc" stroke="#888"/><circle cx="26" cy="-6" r="16" fill="#ccc" stroke="#888"/><circle cx="-26" cy="-6" r="10" fill="#333"/><circle cx="26" cy="-6" r="10" fill="#333"/><text x="0" y="-34" class="lbl">${fN(p.props.dist, 0)} см</text>
      <text x="-30" y="16" class="plabel" text-anchor="middle">Vcc</text><text x="-10" y="16" class="plabel" text-anchor="middle">Trig</text><text x="10" y="16" class="plabel" text-anchor="middle">Echo</text><text x="30" y="16" class="plabel" text-anchor="middle">Gnd</text>`,
    stamp: pw3, measure: pw3m,
    /* TRIG and ECHO must each land on an MCU GPIO; power is Vcc−Gnd above 2.7 V (ESP32 3V3 robots still count). */
    link(p, mcu, nets, m) {
      if (!mcu) return { on: false, why: 'HC-SR04 не подключён: нет платы' };
      if (!m || m.powered === false || !(m.U > 2.7)) return { on: false, why: 'HC-SR04 не подключён: нет питания (Vcc и Gnd)' };
      const onGpio = pin => { const n = nets.netOf(p.id, pin); return P[mcu.type].pins.some(q => P[mcu.type].gpioOf(q.id) != null && nets.netOf(mcu.id, q.id) === n); };
      if (!onGpio('TRIG')) return { on: false, why: 'HC-SR04 не подключён: Trig не на выводе платы' };
      if (!onGpio('ECHO')) return { on: false, why: 'HC-SR04 не подключён: Echo не на выводе платы' };
      return { on: true };
    } };
  /* HC-SR501: OUT is a push-pull 3.3 V / 0 V once the module has power. One frame of lag, same as the relay. */
  P.pir = { name: 'Датчик движения HC-SR501 (PIR)', group: 'Датчики', prefix: 'U', sensor: 'pir', dataPin: 'OUT', props: { motion: false }, box: [-40, -48, 80, 96],
    pins: [{ id: 'VCC', x: -20, y: 40, label: 'VCC', hint: 'VCC +5 В' }, { id: 'OUT', x: 0, y: 40, label: 'OUT', hint: 'OUT: HIGH при движении (digitalRead)' }, { id: 'GND', x: 20, y: 40, label: 'GND', hint: 'GND' }],
    draw: p => { const on = !!(p.props && p.props.motion);
      return `<path d="M-20 40 V28 M0 40 V28 M20 40 V28" class="leg"/><rect x="-34" y="-16" width="68" height="44" rx="3" fill="#1a6b3c" stroke="#0d3d22"/>
      <ellipse cx="0" cy="-16" rx="16" ry="14" fill="${on ? '#f7f8ff' : '#c5c9d4'}" stroke="#8e96a6"/><ellipse cx="-4" cy="-20" rx="7" ry="4" fill="#fff" opacity=".45"/>
      <circle cx="22" cy="6" r="3.2" fill="${on ? '#ff3b30' : '#4a1010'}"/><text x="0" y="14" class="tiny lightt">${on ? 'движение' : 'тихо'}</text>
      <text x="-20" y="22" class="plabel" text-anchor="middle">VCC</text><text x="0" y="22" class="plabel" text-anchor="middle">OUT</text><text x="20" y="22" class="plabel" text-anchor="middle">GND</text>`; },
    stamp(p, ctx) {
      pw3(p, ctx);
      const g = ctx.n(p, 'GND'), o = ctx.n(p, 'OUT');
      if (p._pwr) { p._outV = true; p._out = ctx.add({ type: 'V', p: o, n: g, V: p._hot ? 3.3 : 0, rInt: 220 }); }
      else { p._outV = false; p._out = ctx.add({ type: 'R', a: o, b: g, R: 1e7 }); }
    },
    measure(p, sol, ctx) {
      const m = pw3m(p, sol, ctx), io = sol.currents[p._out] || 0;
      if (p._outV) { m.pinI.OUT = -io; m.pinI.GND += io; } else { m.pinI.OUT = io; m.pinI.GND -= io; }
      const hot = !!(m.powered && p.props && p.props.motion);
      if (hot !== !!p._hot || !!m.powered !== !!p._pwr) { p._hot = hot; p._pwr = !!m.powered; ctx.dirty(); }
      m.extra = { 'Движение': hot ? 'есть (OUT = HIGH)' : 'нет (OUT = LOW)' };
      return m;
    } };

  /* ---------- ICs ---------- */
  function vis(name, top, bot, chip, note) {
    const n = top.length, x0 = -10 * Math.floor(n / 2);
    const pins = [...bot.map((id, i) => ({ id, x: x0 + 10 * i, y: 20, label: id, hint: id + ' · ' + note })), ...top.map((id, i) => ({ id: id + (bot.includes(id) ? '_' : ''), x: x0 + 10 * i, y: -20, label: id, hint: id + ' · ' + note }))];
    return { name, group: 'Микросхемы', prefix: 'U', pins, box: [x0 - 9, -24, (n - 1) * 10 + 18, 48], visual: true,
      draw: () => `${pins.map(q => `<rect x="${q.x - 2}" y="${q.y < 0 ? -20 : 12}" width="4" height="8" fill="#c9ced4"/>`).join('')}<rect x="${x0 - 6}" y="-13" width="${(n - 1) * 10 + 12}" height="26" rx="2" fill="#1c1c1e" stroke="#000"/><path d="M${x0 - 6} -4 a4 4 0 0 1 0 8" fill="#333"/><text x="${x0 - 6 + ((n - 1) * 10 + 12) / 2}" y="2" class="tiny lightt">${chip}</text>`,
      stamp(p, ctx) { const g = pins.find(q => q.id === 'GND'), v = pins.find(q => q.id === 'VCC'); if (g && v) p._e = ctx.add({ type: 'R', a: ctx.n(p, 'VCC'), b: ctx.n(p, 'GND'), R: 1e5 }); },
      measure: () => ({ U: 0, I: 0, P: 0, pinI: {} }) };
  }
  P.ne555 = vis('Таймер NE555 (только вид)', ['VCC', 'DIS', 'THR', 'CV'], ['GND', 'TRIG', 'OUT', 'RST'], 'NE555', 'логика 555 пока не моделируется');
  P.hc595 = vis('Сдвиговый регистр 74HC595 (только вид)', ['VCC', 'Q0', 'DS', 'OE', 'STCP', 'SHCP', 'MR', 'Q7S'], ['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7', 'GND'], '74HC595', 'логика регистра пока не моделируется');
  function reg(name, Vout, drop) {
    return { name, group: 'Питание', prefix: 'U', box: [-44, -40, 88, 70],
      pins: [{ id: 'in', x: -40, y: 20, label: 'IN', hint: `вход (≥ ${fN(Vout + drop, 1)} В)` }, { id: 'gnd', x: 0, y: 20, label: 'GND', hint: 'GND' }, { id: 'out', x: 40, y: 20, label: 'OUT', hint: `выход ${fN(Vout, 1)} В` }],
      draw: () => `<path d="M-40 20 H-14 V8 M0 20 V8 M40 20 H14 V8" class="leg"/><rect x="-22" y="-36" width="44" height="14" fill="#bfc4ca"/><circle cy="-29" r="4" fill="#777"/><rect x="-20" y="-22" width="40" height="30" fill="#151515"/><text x="0" y="-8" class="tiny lightt">${name.split(' ')[0]}</text><text x="0" y="2" class="tiny lightt">${fN(Vout, 1)} В</text>`,
      stamp(p, ctx) { p._q = ctx.add({ type: 'R', a: ctx.n(p, 'in'), b: ctx.n(p, 'gnd'), R: 1000 }); p._e = ctx.add({ type: 'V', p: ctx.n(p, 'in'), n: ctx.n(p, 'out'), V: p._drop ?? drop }); },
      measure(p, sol, ctx) { const vin = vdiff(p, ctx, 'in', 'gnd'), want = Math.max(drop, vin - Vout), I = sol.currents[p._e]; // series pass element: drop = Vin - Vout
        if (Math.abs(want - (p._drop ?? drop)) > 0.002) { p._drop = want; ctx.dirty(); }
        const iq = sol.currents[p._q]; return { U: vdiff(p, ctx, 'out', 'gnd'), I: -I, P: Math.abs((vin - vdiff(p, ctx, 'out', 'gnd')) * I), pinI: { in: -I + iq, out: I, gnd: -iq }, extra: { Vin: vin } }; },
      check: (p, m) => m.extra.Vin > 0.5 && m.extra.Vin < Vout + drop - 0.01 ? { level: 'warn', msg: `${name}: входное ${fU(m.extra.Vin, 'В')} меньше ${fN(Vout + drop, 1)} В — стабилизатор не держит выход` } : (m.P > 1.5 ? { level: 'warn', msg: `${name} греется: ${fU(m.P, 'Вт')} — нужен радиатор` } : null) };
  }
  P.lm7805 = reg('LM7805 стабилизатор 5 В', 5, 2);
  P.ams1117 = reg('AMS1117 стабилизатор 3,3 В', 3.3, 1.1);

  /* ---------- passives: real C / L with transients (solver state carried between frames) ---------- */
  const capM = (p, sol, ctx) => { const m = meas2(p, sol, ctx, sol.currents[p._e] || 0); m.extra = { Q: (+p.props.C || 0) * m.U }; return m; };
  P.cap = { name: 'Конденсатор керамический', group: 'Пассивные', prefix: 'C', props: { C: 1e-7 }, pins: two('1', '2'),
    draw: (p, st) => `<path d="M-40 0 H-5 M40 0 H5" class="leg"/><ellipse rx="10" ry="12" fill="#d9a23a" stroke="#8a6010"/><text x="0" y="-16" class="lbl">${fU(p.props.C, 'Ф')}</text>${st && st.m && st.running ? `<text x="0" y="26" class="lbl capv">${fU(st.m.U, 'В')}</text>` : ''}`,
    stamp: (p, ctx) => { p._e = ctx.add({ type: 'C', a: ctx.n(p, 'a'), b: ctx.n(p, 'b'), C: +p.props.C || 1e-9 }); }, measure: capM };
  P.ecap = { name: 'Конденсатор электролитический', group: 'Пассивные', prefix: 'C', props: { C: 1e-4 }, pins: [{ id: 'a', x: -40, y: 0, label: '+', hint: 'плюс' }, { id: 'b', x: 40, y: 0, label: '−', hint: 'минус (полоса)' }], box: [-44, -40, 88, 68],
    draw: (p, st) => { const vmax = 16, f = st && st.m && st.running ? Math.max(0, Math.min(1, st.m.U / vmax)) : 0;
      return `<path d="M-40 0 H-8 V-8 M40 0 H8 V-8" class="leg"/><rect x="-12" y="-36" width="24" height="30" rx="4" fill="#1a3a9a" stroke="#0a1a5a"/><rect x="5" y="-36" width="6" height="30" fill="#c8d0e0"/>${f > 0 ? `<rect x="-10" y="${-8 - 26 * f}" width="14" height="${26 * f}" fill="#3fb37f" opacity=".6"/>` : ''}<text x="0" y="-38" class="lbl">${fU(p.props.C, 'Ф')}</text>${st && st.m && st.running ? `<text x="0" y="22" class="lbl capv">${fU(st.m.U, 'В')}</text>` : ''}`; },
    stamp: (p, ctx) => { p._e = ctx.add({ type: 'C', a: ctx.n(p, 'a'), b: ctx.n(p, 'b'), C: +p.props.C || 1e-9 }); }, measure: capM,
    check: (p, m) => m.U < -0.5 ? { level: 'warn', msg: 'Электролитический конденсатор включён наоборот — может вздуться' } : null };
  P.inductor = { name: 'Катушка индуктивности', group: 'Пассивные', prefix: 'L', props: { L: 1e-4 }, pins: two('1', '2'),
    draw: p => `${lead}<path d="M-20 0 q5 -12 10 0 q5 -12 10 0 q5 -12 10 0 q5 -12 10 0" stroke="#c87533" stroke-width="3" fill="none"/><text x="0" y="-16" class="lbl">${fU(p.props.L, 'Гн')}</text>`,
    stamp: (p, ctx) => { p._e = ctx.add({ type: 'L', a: ctx.n(p, 'a'), b: ctx.n(p, 'b'), L: +p.props.L || 1e-6 }); }, measure: (p, sol, ctx) => meas2(p, sol, ctx, sol.currents[p._e] || 0) };
  P.pot.group = 'Пассивные'; P.button.group = 'Ввод/вывод';

  /* USB-UART / power breakout: 5 V and 3.3 V rails plus TX/RX labels. Two sources; the second must not overwrite the first current id. */
  P.usbuart = { name: 'USB-UART (5V, 3V3, TX, RX)', group: 'Питание', prefix: 'U', source: { plus: '5V', minus: 'GND' }, supplies: { '5V': 5, '3V3': 3.3 },
    ground: id => id === 'GND', box: [-48, -40, 96, 80],
    pins: [{ id: '5V', x: -40, y: -16, label: '5V', hint: '5 В' }, { id: '3V3', x: -40, y: 0, label: '3V3', hint: '3,3 В' }, { id: 'GND', x: -40, y: 16, label: 'GND', hint: 'GND' },
      { id: 'TX', x: 40, y: -8, label: 'TX', hint: 'TX' }, { id: 'RX', x: 40, y: 8, label: 'RX', hint: 'RX' }],
    draw: () => `<rect x="-34" y="-28" width="68" height="56" rx="4" fill="#243044" stroke="#121820"/>
      <rect x="-12" y="-34" width="24" height="12" rx="2" fill="#c0c4c9" stroke="#80868d"/><rect x="-7" y="-31" width="14" height="6" rx="1" fill="#3a3a3a"/>
      <text x="0" y="2" class="tiny lightt">USB-UART</text>
      <text x="-28" y="-12" class="plabel">5V</text><text x="-28" y="4" class="plabel">3V3</text><text x="-28" y="20" class="plabel">GND</text>
      <text x="18" y="-4" class="plabel">TX</text><text x="18" y="12" class="plabel">RX</text>`,
    stamp(p, ctx) { source(p, ctx, '5V', 'GND', 5, 0.1); const r5 = p._r; source(p, ctx, '3V3', 'GND', 3.3, 0.1); p._r5 = r5; p._r3 = p._r; },
    measure(p, sol, ctx) { const i5 = sol.currents[p._r5] || 0, i3 = sol.currents[p._r3] || 0, U = vdiff(p, ctx, '5V', 'GND');
      return { U, I: i5 + i3, P: Math.abs(U * i5) + Math.abs((ctx.v(p, '3V3') - ctx.v(p, 'GND')) * i3), pinI: { '5V': i5, '3V3': i3, GND: -(i5 + i3), TX: 0, RX: 0 }, out: true, srcI: Math.abs(i5) + Math.abs(i3) }; } };
})();
