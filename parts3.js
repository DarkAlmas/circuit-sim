/* v7 part library: robotics modules built on devices.js (owned by Grok Bot, not edited here) and solver.js primitives.
 * Each stamp registers its composite device with ctx.dev(); the app calls dev.step(sol, dt) after every solve and
 * cards/drawings read the device state (p._st). Modules whose protocol is simulated in the sketch worker
 * (VL53L0X, MPU-6050, NRF24) are linked like other sensors: power + data pin on an MCU net. */
(function () {
  const D = window.Devices, L = window.PartsLib, P = window.PARTS;
  const fU = (x, u) => window.fmtUnit(x, u), fN = (x, d) => window.fmtNum(x, d);
  const vd = (p, ctx, a, b) => ctx.v(p, a) - ctx.v(p, b);
  const ok = n => n != null && n >= 0;
  const pin = (id, x, y, hint, label) => ({ id, x, y, label: label || id, hint: hint || id });
  const legs = pins => pins.map(q => `<line x1="${q.x}" y1="${q.y}" x2="${q.x}" y2="${q.y < 0 ? q.y + 10 : q.y - 10}" class="leg"/>`).join('');
  const legsX = pins => pins.map(q => `<line x1="${q.x}" y1="${q.y}" x2="${q.x < 0 ? q.x + 10 : q.x - 10}" y2="${q.y}" class="leg"/>`).join('');
  const lbls = (pins, dy) => pins.map(q => `<text x="${q.x}" y="${q.y + dy}" class="tiny lightt">${q.label}</text>`).join('');
  const clamp01 = x => Math.max(0, Math.min(1, x));
  /* load module: power-dependent current consumer from devices.js */
  function pwrLoad(p, ctx, kind) { const a = ctx.n(p, 'VCC'), b = ctx.n(p, 'GND'); p._e = ok(a) && ok(b) ? D.load(ctx, a, b, kind) : ctx.add({ type: 'R', a, b, R: 1e7 }); }
  function pwrMeas(p, sol, ctx, extra) { const I = sol.currents[p._e] || 0, U = vd(p, ctx, 'VCC', 'GND'), pinI = { VCC: I, GND: -I }; return { U, I, P: Math.abs(U * I), pinI, powered: U > 2.7, extra }; }

  /* ---------- motors: 130 / TT 1:48 / coreless 8520 ---------- */
  function motor(kind, name, draw, warn) {
    const M = D.MOTORS[kind];
    return { name, group: 'Активные', prefix: 'M', pins: L.two('+', '−'), box: [-44, -40, 88, 76], motor: kind,
      draw: (p, st) => `${L.lead}${draw(p, st)}<text x="0" y="${-30}" class="lbl">${p._st && p._st.rpm ? fN(Math.abs(p._st.rpm), 0) + ' об/мин' + (p._st.rpm < 0 ? ' ⟲' : ' ⟳') : 'M'}</text>`,
      stamp(p, ctx) { const st = p._st || (p._st = { w: 0 }); ctx.dev(D.motor(ctx, ctx.n(p, 'a'), ctx.n(p, 'b'), kind, st)); p._e = ctx.add({ type: 'R', a: ctx.n(p, 'a'), b: ctx.n(p, 'b'), R: 1e7 }); },
      measure(p, sol, ctx) { const st = p._st || {}, I = (st.I || 0) + (sol.currents[p._e] || 0), U = vd(p, ctx, 'a', 'b');
        return { U, I, P: Math.abs(U * I), pinI: { a: I, b: -I }, rpm: st.rpm || 0, extra: { 'Обороты': fN(st.rpm || 0, 0) + ' об/мин', 'Направление': !st.rpm || Math.abs(st.rpm) < 1 ? 'стоит' : st.rpm > 0 ? 'вперёд' : 'назад' } }; },
      check(p, m) { const u = Math.abs(m.U); if (u > M.Unom * (warn || 1.6)) return { level: 'warn', msg: `${M.name}: ${fN(u, 1)} В — больше номинала ${fN(M.Unom, 1)} В, перегрев и износ` };
        if (Math.abs(m.I) > 1.5) return { level: 'warn', msg: `${M.name} потребляет ${fU(Math.abs(m.I), 'А')} — питай через драйвер (L298N/DRV8833), не от вывода платы` }; } };
  }
  const rotA = p => ((p._st && p._st.ang) || 0).toFixed(1);
  P.motor = motor('m130', 'Мотор постоянного тока (130)', p => `<rect x="-22" y="-20" width="38" height="40" rx="8" fill="#b9bec5" stroke="#6a7078"/><rect x="16" y="-6" width="10" height="12" fill="#8a9099"/>
      <g transform="rotate(${rotA(p)} 0 0)"><path d="M0 -14 V14 M-14 0 H14" stroke="#333" stroke-width="3"/></g><circle r="4" fill="#555"/>`);
  P.ttmotor = motor('tt', 'Мотор TT жёлтый, редуктор 1:48 (3–6 В)', p => `<rect x="-24" y="-14" width="30" height="28" rx="3" fill="#f3c316" stroke="#a88300"/><text x="-9" y="20" class="tiny">1:48</text>
      <g transform="rotate(${rotA(p)} 14 0)"><circle cx="14" cy="0" r="20" fill="#222" stroke="#000"/><circle cx="14" cy="0" r="12" fill="#f3c316"/>${[0, 60, 120].map(a => `<path d="M14 0 L14 -12" transform="rotate(${a} 14 0)" stroke="#a88300" stroke-width="3"/><path d="M14 0 L14 12" transform="rotate(${a} 14 0)" stroke="#a88300" stroke-width="3"/>`).join('')}</g>`, 1.25);
  P.coreless = motor('m8520', 'Мотор коллекторный 8520 с винтом (3,7 В)', p => `<rect x="-10" y="-8" width="20" height="16" rx="7" fill="#9aa3ad" stroke="#555"/>
      <g transform="rotate(${rotA(p)} 0 0)"><ellipse cx="0" cy="-16" rx="5" ry="16" fill="#e33" opacity=".85"/><ellipse cx="0" cy="16" rx="5" ry="16" fill="#e33" opacity=".85"/></g><circle r="3" fill="#333"/>`, 1.3);

  /* ---------- H-bridges: L298N, DRV8833 ---------- */
  /* Inputs are read from the previous frame as a duty (pin voltage / logic level); a per-input sigma-delta turns
   * analogWrite duty into on/off frames so the motor (with inertia) averages it like real PWM. */
  function hbridge(cfg) {
    const all = [...cfg.ins, ...cfg.en];
    return { name: cfg.name, group: 'Активные', prefix: 'U', pins: cfg.pins, box: cfg.box, vmax: p => p._vs || 0,
      draw: (p, st) => cfg.draw(p, st),
      stamp(p, ctx) {
        const g = ctx.n(p, 'GND'), vs = ctx.n(p, cfg.vs), duty = p._duty || {}, acc = p._acc || (p._acc = {}), lv = {}, dv = {};
        for (const k of all) { const n = ctx.n(p, k); if (ok(n)) ctx.add({ type: 'R', a: n, b: ok(g) ? g : 0, R: 1e6 }); }
        for (const k of all) { let d = duty[k]; if (d == null) d = cfg.en.includes(k) && !(ctx.wired ? ctx.wired(p, k) : ok(ctx.n(p, k))) ? 1 : 0;
          dv[k] = clamp01(d); acc[k] = (acc[k] || 0) + dv[k]; lv[k] = acc[k] >= 0.5 ? 1 : 0; acc[k] -= lv[k]; }
        p._lv = lv; const outs = cfg.outs.flat(); for (const o of outs) ctx.add({ type: 'R', a: ctx.n(p, o), b: ok(g) ? g : 0, R: 1e7 });
        const rec = [], sub = { ...ctx, add: el => { const i = ctx.add(el); rec.push([i, el]); return i; } };
        p._rec = rec; p._ch = [];
        const powered = ok(vs) && (p._vs || 0) >= cfg.vmin && !p.burned;
        if (powered) cfg.outs.forEach(([oa, ob], c) => { const [i1, i2] = cfg.ins.slice(2 * c, 2 * c + 2), en = cfg.en[c] ? lv[cfg.en[c]] : 1;
          const s1 = lv[i1] && en, s2 = lv[i2] && en; p._ch[c] = !en ? 'выкл' : s1 && !s2 ? 'вперёд' : !s1 && s2 ? 'назад' : 'тормоз';
          if (cfg.coast(cfg.en[c] ? dv[cfg.en[c]] > 0.01 : 1, dv[i1] > 0.01, dv[i2] > 0.01)) { p._ch[c] = 'свободный ход'; return; }
          p._imax = D.hbridge(sub, vs, ctx.n(p, oa), ctx.n(p, ob), s1, s2, cfg.kind).imax; });
        if (cfg.reg) { const r5 = ctx.n(p, '5V'); p._r5 = ok(r5) && powered && p._vs > 7 ? ctx.add({ type: 'V', p: r5, n: ok(g) ? g : 0, V: 5, rInt: 0.5, iShort: 1 }) : ctx.add({ type: 'R', a: r5, b: g, R: 1e7 }); }
      },
      measure(p, sol, ctx) {
        const vio = ctx.vio || 3.3; p._vs = vd(p, ctx, cfg.vs, 'GND'); p._duty = {};
        for (const k of all) { const n = ctx.n(p, k); if (ok(n) && (!cfg.en.includes(k) || !ctx.wired || ctx.wired(p, k))) p._duty[k] = clamp01(vd(p, ctx, k, 'GND') / vio); }
        const pinI = {}; let Is = 0;
        for (const o of cfg.outs.flat()) { const n = ctx.n(p, o); let I = 0;
          for (const [i, el] of p._rec || []) { if (el.type === 'R' && el.b === n) { I += sol.currents[i]; Is += sol.currents[i]; } else if (el.type === 'V' && el.p === n) I += sol.currents[i]; }
          pinI[o] = I; }
        pinI[cfg.vs] = -Is; pinI.GND = Is; if (cfg.reg && p._r5 != null) pinI['5V'] = sol.currents[p._r5] || 0;
        const peak = Math.max(0, ...cfg.outs.flat().map(o => Math.abs(pinI[o])));
        const extra = {}; cfg.outs.forEach((_, c) => { extra['Канал ' + 'AB'[c]] = p._ch[c] || (p._vs < cfg.vmin ? 'нет питания' : '—'); });
        return { U: p._vs, I: Is, P: Math.abs(p._vs * Is), pinI, peak, extra };
      },
      check(p, m, ctx) {
        if (m.U > cfg.vabs) { if (!p.burned) { p.burned = true; ctx.dirty(); } return { level: 'burn', msg: `${cfg.short} сгорел: ${fN(m.U, 1)} В на ${cfg.vs} (максимум ${cfg.vabs} В)` }; }
        if (m.U > cfg.vrec) return { level: 'warn', msg: `${cfg.short}: ${fN(m.U, 1)} В на ${cfg.vs} — выше допустимых ${cfg.vrec} В` };
        if (m.peak > (p._imax || 2)) return { level: 'warn', msg: `${cfg.short}: ток канала ${fU(m.peak, 'А')} больше ${p._imax} А — мотор слишком мощный или заклинил` };
        if (m.U > 0.5 && m.U < cfg.vmin) return { level: 'warn', msg: `${cfg.short}: питание ${cfg.vs} ${fN(m.U, 1)} В — мало (нужно от ${cfg.vmin} В)` };
      } };
  }
  const L298_IN = ['ENA', 'IN1', 'IN2', 'IN3', 'IN4', 'ENB'];
  const l298pins = [pin('OUT1', -70, -30, 'OUT1: мотор A'), pin('OUT2', -70, -10, 'OUT2: мотор A'), pin('OUT3', 70, -30, 'OUT3: мотор B'), pin('OUT4', 70, -10, 'OUT4: мотор B'),
    pin('VS', -50, 50, 'VS (+12V): питание моторов 5–35 В'), pin('GND', -30, 50, 'GND: общий минус с платой'), pin('5V', -10, 50, '5V: выход стабилизатора (при VS > 7 В)'),
    ...L298_IN.map((k, i) => pin(k, 0 + i * 12 - 0, 50, k === 'ENA' || k === 'ENB' ? k + ': разрешение, ШИМ скорости (без провода — перемычка, всегда вкл.)' : k + ': направление')).map((q, i) => ({ ...q, x: i * 10 }))];
  P.l298n = hbridge({ name: 'Драйвер моторов L298N (2 канала)', short: 'L298N', kind: 'l298n', vs: 'VS', vmin: 4.5, vrec: 35, vabs: 46, reg: true,
    ins: ['IN1', 'IN2', 'IN3', 'IN4'], en: ['ENA', 'ENB'], outs: [['OUT1', 'OUT2'], ['OUT3', 'OUT4']], coast: en => !en, pins: l298pins, box: [-74, -56, 148, 110],
    draw: (p, st) => `${legsX(l298pins.filter(q => q.y < 0))}${legs(l298pins.filter(q => q.y > 0))}<rect x="-60" y="-50" width="140" height="90" rx="4" fill="#c4161c" stroke="#700" transform="translate(-10 0)"/>
      <rect x="-22" y="-48" width="44" height="34" fill="#111" stroke="#000"/>${[0, 1, 2, 3, 4, 5, 6].map(k => `<rect x="${-20 + k * 6}" y="-56" width="4" height="10" fill="#555"/>`).join('')}<text x="0" y="-28" class="tiny lightt">L298N</text>
      <circle cx="-48" cy="28" r="3" fill="${(p._vs || 0) > 4.5 ? '#f33' : '#400'}"/>${lbls(l298pins.filter(q => q.y > 0), -14)}<text x="-58" y="-40" class="tiny lightt">A</text><text x="58" y="-40" class="tiny lightt">B</text>
      <text x="0" y="0" class="tiny lightt">${(p._ch || []).map((s, c) => 'AB'[c] + ': ' + s).join('  ')}</text>` });
  const drvpins = [pin('AO1', -60, -20, 'AO1: мотор A'), pin('AO2', -60, 0, 'AO2: мотор A'), pin('BO2', -60, 20, 'BO2: мотор B'), pin('BO1', -60, 40, 'BO1: мотор B'),
    pin('AIN1', 60, -20, 'AIN1: ШИМ/направление A'), pin('AIN2', 60, 0, 'AIN2: ШИМ/направление A'), pin('BIN2', 60, 20, 'BIN2: ШИМ/направление B'), pin('BIN1', 60, 40, 'BIN1: ШИМ/направление B'),
    pin('VM', -20, 60, 'VM: питание моторов 2,7–10,8 В'), pin('GND', 20, 60, 'GND: общий минус с платой')];
  P.drv8833 = hbridge({ name: 'Драйвер моторов DRV8833 (2 канала)', short: 'DRV8833', kind: 'drv8833', vs: 'VM', vmin: 2.7, vrec: 10.8, vabs: 11.8,
    ins: ['AIN1', 'AIN2', 'BIN1', 'BIN2'], en: [], outs: [['AO1', 'AO2'], ['BO1', 'BO2']], coast: (en, a, b) => !a && !b, pins: drvpins, box: [-64, -36, 128, 100],
    draw: p => `${legsX(drvpins.filter(q => q.y < 60))}${legs(drvpins.filter(q => q.y === 60))}<rect x="-50" y="-32" width="100" height="84" rx="3" fill="#6b2fb3" stroke="#3a136b"/><rect x="-12" y="-6" width="24" height="24" fill="#111"/>
      <text x="0" y="-18" class="tiny lightt">DRV8833</text>${drvpins.filter(q => q.y < 60).map(q => `<text x="${q.x < 0 ? -46 : 46}" y="${q.y + 3}" class="tiny lightt" text-anchor="${q.x < 0 ? 'start' : 'end'}">${q.id}</text>`).join('')}
      <text x="0" y="34" class="tiny lightt">${(p._ch || []).map((s, c) => 'AB'[c] + ': ' + s).join(' ')}</text>${lbls(drvpins.filter(q => q.y === 60), -14)}` });

  /* ---------- Li-ion 103450 ---------- */
  P.liion = { name: 'Аккумулятор Li-ion 103450 (3,7 В, 2000 мА·ч)', group: 'Питание', prefix: 'BT', props: { soc: 80 }, source: { plus: 'p', minus: 'n' }, vmax: 4.2, srcV: p => fN((p._st && p._st.V) || D.ocv(+p.props.soc / 100), 2) + ' В',
    pins: [pin('p', -40, 0, '+ (красный провод)', '+'), pin('n', 40, 0, '− (чёрный провод)', '−')], box: [-44, -36, 88, 68],
    draw: p => { const st = p._st || {}, s = st.soc != null ? st.soc : +p.props.soc / 100, c = s > 0.5 ? '#2c2' : s > 0.2 ? '#fb2' : '#e33';
      return `${L.lead}<rect x="-22" y="-26" width="44" height="52" rx="4" fill="#2a64c8" stroke="#123c80"/><rect x="-6" y="-30" width="12" height="4" fill="#888"/><text x="0" y="-12" class="tiny lightt">103450</text>
      <text x="-14" y="-18" class="lbl">+</text><text x="14" y="-18" class="lbl">−</text>
      <rect x="-14" y="-4" width="28" height="10" fill="#0b1a33" stroke="#9ab"/><rect x="-13" y="-3" width="${(26 * s).toFixed(1)}" height="8" fill="${c}"/><text x="0" y="18" class="tiny lightt">${fN(st.V || D.ocv(s), 2)} В · ${Math.round(s * 100)}%</text>`; },
    stamp(p, ctx) { const s0 = +p.props.soc / 100; if (!p._st || p._st.set !== s0) p._st = { soc: s0, set: s0 }; ctx.dev(D.liion(ctx, ctx.n(p, 'p'), ctx.n(p, 'n'), p._st, 2.0)); },
    measure(p, sol, ctx) { const st = p._st || {}, I = st.I || 0, U = vd(p, ctx, 'p', 'n');
      return { U, I, P: Math.abs(U * I), pinI: { p: I, n: -I }, out: true, srcI: Math.abs(I), extra: { 'Заряд': fN((st.soc || 0) * 100, 1) + ' %', 'Осталось': fN((st.soc || 0) * 2000, 0) + ' мА·ч' } }; },
    check(p, m) { const st = p._st || {}; if (st.empty || m.U < 3.0) return { level: 'warn', msg: `Аккумулятор ${p.id} разряжен (${fN(m.U, 2)} В < 3,0 В) — заряди его (TP4056), глубокий разряд портит Li-ion` };
      if (Math.abs(m.I) > 2) return { level: 'warn', msg: `Ток аккумулятора ${fU(Math.abs(m.I), 'А')} — больше 1C (2 А), нагрев` }; } };

  /* ---------- boost converter (MT3608 / XL6009) ---------- */
  const bpins = [pin('IN+', -60, -12, 'VIN+: вход 2–24 В', 'IN+'), pin('IN-', -60, 12, 'VIN−: минус входа', 'IN−'), pin('OUT+', 60, -12, 'VOUT+: выход (задаётся потенциометром)', 'OUT+'), pin('OUT-', 60, 12, 'VOUT−: минус выхода', 'OUT−')];
  P.boost = { name: 'Повышающий преобразователь (MT3608/XL6009)', group: 'Питание', prefix: 'U', props: { Vout: 12 }, pins: bpins, box: [-64, -34, 128, 64], vmax: p => +p.props.Vout,
    draw: p => { const st = p._st || {};
      return `${legsX(bpins)}<rect x="-50" y="-26" width="100" height="52" rx="3" fill="#1f5bb8" stroke="#0e2a78"/><rect x="-14" y="-18" width="20" height="20" fill="#333"/><circle cx="26" cy="-10" r="7" fill="#e8c35a" stroke="#806020"/><path d="M22 -10 h8" stroke="#333" stroke-width="2"/>
      <text x="0" y="16" class="tiny lightt">→ ${fN(+p.props.Vout, 1)} В${st.on === false ? ' (выкл)' : ''}</text><circle cx="-34" cy="-14" r="3" fill="${st.on ? '#f33' : '#400'}"/>${bpins.map(q => `<text x="${q.x < 0 ? -46 : 46}" y="${q.y + 3}" class="tiny lightt" text-anchor="${q.x < 0 ? 'start' : 'end'}">${q.label}</text>`).join('')}`; },
    stamp(p, ctx) { const st = p._st || (p._st = { Iin: 0 }), n = ['IN+', 'IN-', 'OUT+', 'OUT-'].map(k => ctx.n(p, k));
      if (n.every(ok)) ctx.dev(D.boost(ctx, n[0], n[1], n[2], n[3], +p.props.Vout, st)); else { st.on = false; st.Iin = 0; st.Pout = 0; ctx.add({ type: 'R', a: n[0], b: n[1], R: 1e7 }); } },
    measure(p, sol, ctx) { const st = p._st || {}, Vin = vd(p, ctx, 'IN+', 'IN-'), Vo = vd(p, ctx, 'OUT+', 'OUT-'), Iin = st.Iin || 0, Io = Vo > 0.1 ? (st.Pout || 0) / Vo : 0;
      return { U: Vin, I: Iin, P: (st.Pout || 0) / 0.9, Vin, Vo, Iin, Io, pinI: { 'IN+': -Iin, 'IN-': Iin, 'OUT+': Io, 'OUT-': -Io },
        extra: { 'Uвх': fN(Vin, 2) + ' В', 'Uвых': fN(Vo, 2) + ' В', 'Iвх = P/(Uвх·0,9)': fU(Iin, 'А'), 'Iвых': fU(Io, 'А'), 'Pвых': fU(st.Pout || 0, 'Вт'), 'КПД': '90 %' } }; },
    check(p, m, ctx) { if (m.Vin > 28) { if (!p.burned) { p.burned = true; ctx.dirty(); } return { level: 'burn', msg: `Преобразователь сгорел: на входе ${fN(m.Vin, 1)} В (максимум 24 В)` }; }
      if (m.Vin < 2 || m.Vin > 24) return { level: 'warn', msg: `Преобразователь: вход ${fN(m.Vin, 1)} В вне диапазона 2–24 В — выключен` };
      if (+p.props.Vout < m.Vin) return { level: 'warn', msg: `Повышающий преобразователь не понижает: Uвых ${fN(+p.props.Vout, 1)} В < Uвх ${fN(m.Vin, 1)} В (на выход пройдёт ≈ Uвх)` };
      if (m.Iin > 2) return { level: 'warn', msg: `Входной ток преобразователя ${fU(m.Iin, 'А')} — больше 2 А (предел ключа MT3608)` }; } };

  /* ---------- TCRT5000 line sensor ---------- */
  const tpins = [pin('VCC', -30, 40, 'VCC 3,3–5 В'), pin('GND', -10, 40, 'GND'), pin('D0', 10, 40, 'D0: цифровой выход (LOW = белое/отражение)'), pin('A0', 30, 40, 'A0: аналоговый выход (меньше = светлее)')];
  P.tcrt5000 = { name: 'Датчик линии TCRT5000', group: 'Датчики', prefix: 'U', props: { refl: 0.9, thr: 0.5 }, pins: tpins, box: [-40, -52, 80, 96],
    draw: p => `${legs(tpins)}<rect x="-36" y="-40" width="72" height="70" rx="3" fill="#1d4fd0" stroke="#0e2a78"/><rect x="-16" y="-48" width="14" height="14" rx="2" fill="#24a"/><rect x="2" y="-48" width="14" height="14" rx="2" fill="#111"/>
      <circle cx="-22" cy="-12" r="6" fill="#4a90e2" stroke="#123"/><circle cx="20" cy="-12" r="3" fill="${p._low ? '#3f3' : '#030'}"/><text x="0" y="6" class="tiny lightt">${p.props.refl >= 0.5 ? 'белое' : 'чёрная линия'} ${Math.round(p.props.refl * 100)}%</text>${lbls(tpins, -14)}`,
    stamp(p, ctx) { const v = ctx.n(p, 'VCC'), g = ctx.n(p, 'GND'), a = ctx.n(p, 'A0'), d = ctx.n(p, 'D0');
      p._e = ok(v) && ok(g) ? D.load(ctx, v, g, 'tcrt5000') : ctx.add({ type: 'R', a: v, b: g, R: 1e7 });
      p._pu = ctx.add({ type: 'R', a: v, b: a, R: 10000 }); p._pt = ctx.add({ type: 'R', a, b: g, R: Math.max(200, 1 / Math.max(1e-7, D.tcrtCurrent(+p.props.refl))) });
      p._dpu = ctx.add({ type: 'R', a: v, b: d, R: 10000 }); p._dlo = p._low ? ctx.add({ type: 'R', a: d, b: g, R: 50 }) : null; },
    measure(p, sol, ctx) { const U = vd(p, ctx, 'VCC', 'GND'), a0 = vd(p, ctx, 'A0', 'GND'), low = U > 2.7 && a0 < +p.props.thr * U;
      if (low !== !!p._low) { p._low = low; ctx.dirty(); }
      const I = (sol.currents[p._e] || 0) + (sol.currents[p._pu] || 0) + (sol.currents[p._dpu] || 0);
      return { U, I, P: Math.abs(U * I), powered: U > 2.7, pinI: { VCC: I, GND: -I, A0: 0, D0: 0 }, extra: { 'A0': fN(a0, 2) + ' В', 'D0': low ? 'LOW (светлое)' : 'HIGH (тёмное)' } }; } };

  /* ---------- I2C sensors (values from sliders, protocol in the worker) ---------- */
  const i2c = (y, extra = []) => [pin('VCC', -30, y, 'VCC 3,3–5 В (VIN)'), pin('GND', -10, y, 'GND'), pin('SCL', 10, y, 'SCL: к выводу I2C платы'), pin('SDA', 30, y, 'SDA: к выводу I2C платы'), ...extra];
  const vpins = i2c(36);
  P.vl53l0x = { name: 'Лазерный дальномер VL53L0X (I2C)', group: 'Датчики', prefix: 'U', sensor: 'vl53', dataPin: 'SDA', props: { mm: 300 }, pins: vpins, box: [-40, -40, 80, 80],
    draw: p => `${legs(vpins)}<rect x="-36" y="-30" width="72" height="56" rx="3" fill="#6b2fb3" stroke="#3a136b"/><rect x="-10" y="-14" width="20" height="10" rx="2" fill="#111"/><circle cx="-4" cy="-9" r="2" fill="#a33"/><text x="0" y="-36" class="lbl">${fN(+p.props.mm, 0)} мм</text>${lbls(vpins, -14)}`,
    stamp: (p, ctx) => pwrLoad(p, ctx, 'vl53l0x'), measure: (p, sol, ctx) => pwrMeas(p, sol, ctx, { 'Расстояние': fN(+p.props.mm, 0) + ' мм' }) };
  const mpins = i2c(36, [pin('INT', 50, 36, 'INT: прерывание (не обязательно)')]);
  P.mpu6050 = { name: 'Гироскоп/акселерометр MPU-6050 (I2C)', group: 'Датчики', prefix: 'U', sensor: 'imu', dataPin: 'SDA', props: { pitch: 0, roll: 0, acc: 0, gz: 0 }, pins: mpins, box: [-40, -40, 100, 80],
    draw: p => `${legs(mpins)}<rect x="-36" y="-30" width="92" height="56" rx="3" fill="#1d4fd0" stroke="#0e2a78"/><rect x="0" y="-18" width="18" height="18" fill="#111" transform="rotate(${(+p.props.roll || 0).toFixed(0)} 9 -9)"/>
      <text x="10" y="-36" class="lbl">наклон ${fN(+p.props.pitch, 0)}° / ${fN(+p.props.roll, 0)}°</text>${lbls(mpins, -14)}`,
    stamp: (p, ctx) => pwrLoad(p, ctx, 'mpu6050'), measure: (p, sol, ctx) => pwrMeas(p, sol, ctx) };

  /* ---------- NRF24L01+PA+LNA ---------- */
  const npins = [pin('GND', -40, 40, 'GND'), pin('VCC', -28, 40, 'VCC: строго 3,3 В (1,9–3,6 В)!'), pin('CE', -16, 40, 'CE: к выводу платы'), pin('CSN', -4, 40, 'CSN: к выводу платы (RF24 radio(CE, CSN))'),
    pin('SCK', 8, 40, 'SCK (SPI)'), pin('MOSI', 20, 40, 'MOSI (SPI)'), pin('MISO', 32, 40, 'MISO (SPI)'), pin('IRQ', 44, 40, 'IRQ (не обязательно)')];
  P.nrf24 = { name: 'Радиомодуль NRF24L01+PA+LNA (2,4 ГГц)', group: 'Датчики', prefix: 'RF', sensor: 'nrf', dataPin: 'CSN', pins: npins, box: [-46, -96, 100, 140],
    draw: (p, st) => { const tx = p._txT && performance.now() - p._txT < 150;
      return `${legs(npins)}<rect x="-44" y="-22" width="96" height="52" rx="3" fill="#111" stroke="#000"/><rect x="-30" y="-14" width="22" height="22" fill="#2a2a2a"/><text x="10" y="0" class="tiny lightt">NRF24 PA+LNA</text>
      <rect x="36" y="-34" width="10" height="12" fill="#c9a227"/><rect x="38" y="-92" width="6" height="60" rx="3" fill="#222"/>${tx ? '<path d="M50 -80 q8 10 0 20 M56 -86 q12 16 0 32" stroke="#4cf" stroke-width="2" fill="none"/>' : ''}${p.burned ? '<text x="0" y="-30" class="lbl">сгорел</text>' : ''}`; },
    stamp(p, ctx) { const v = ctx.n(p, 'VCC'), g = ctx.n(p, 'GND'); p._e = !p.burned && ok(v) && ok(g) ? D.load(ctx, v, g, p._txT && performance.now() - p._txT < 50 ? 'nrf24pa_tx' : 'nrf24pa_rx') : ctx.add({ type: 'R', a: v, b: g, R: 1e7 }); },
    measure(p, sol, ctx) { const m = pwrMeas(p, sol, ctx); m.powered = !p.burned && m.U >= 1.9 && m.U <= 3.6; return m; },
    check(p, m, ctx) { if (m.U > 3.6) { if (!p.burned) { p.burned = true; ctx.dirty(); } return { level: 'burn', msg: `NRF24L01 сгорел: питание ${fN(m.U, 1)} В — допустимо только 1,9–3,6 В (подключай к 3,3 В, не к 5 В!)` }; }
      if (m.U > 0.5 && m.U < 1.9) return { level: 'warn', msg: `NRF24L01: мало питания (${fN(m.U, 1)} В)` }; } };

  /* ---------- ESP32-C3 SuperMini ---------- */
  const C3_L = ['5V', 'GND', '3V3', 'G4', 'G3', 'G2', 'G1', 'G0'], C3_R = ['G5', 'G6', 'G7', 'G8', 'G9', 'G10', 'G20', 'G21'];
  const c3g = id => { const m = /^G(\d+)$/.exec(id); return m ? +m[1] : null; };
  P.esp32c3 = L.mcu({ kind: 'esp32c3', name: 'ESP32-C3 SuperMini', short: 'ESP32-C3', group: 'Платы', vio: 3.3, builtin: 8, pinMax: 0.04, w: 60, L: C3_L, R: C3_R,
    supplies: { '5V': 5, '3V3': 3.3 }, gpio: c3g, lab: id => /^G\d/.test(id) ? id.slice(1) : id, pcb: '#151515', chipName: 'ESP32-C3', sub: 'RISC-V · 3,3 В', ledName: 'LED8',
    hint: id => id === 'GND' ? 'GND (земля)' : id === '5V' ? '5V (USB / вход 5 В)' : id === '3V3' ? '3V3 (выход 3,3 В)' : 'GPIO' + c3g(id) + (c3g(id) <= 4 ? ' (АЦП, A' + c3g(id) + ')' : '') + (c3g(id) === 8 ? ' — синий светодиод (горит при LOW)' : '') + (c3g(id) === 9 ? ' — кнопка BOOT' : '') + (c3g(id) >= 20 ? c3g(id) === 20 ? ' (RX)' : ' (TX)' : '') });
  P.esp32c3.ledInv = true;
  /* Over-voltage / pin-current burn lives on the board model (same idea as NRF24 > 3.6 V). 5V and VIN are power inputs and do not burn. */
  const c3stamp = P.esp32c3.stamp, c3max = 0.04;
  P.esp32c3.stamp = function (p, ctx) { if (p.burned) { p._els = {}; return; } return c3stamp.call(this, p, ctx); };
  P.esp32c3.check = function (p, m, ctx) {
    if (p.burned) return { level: 'burn', msg: p._burnMsg || 'Плата сгорела: 0 В на GPIO' };
    const vg = ctx.v(p, 'GND');
    for (const q of P.esp32c3.pins) {
      if (q.id === '5V' || q.id === 'VIN' || /^GND/.test(q.id)) continue;
      const gpio = c3g(q.id), power = q.id === '3V3';
      if (gpio == null && !power) continue;
      const u = ctx.v(p, q.id) - vg, i = Math.abs((m.pinI && m.pinI[q.id]) || 0);
      const overV = u > 3.6, overI = gpio != null && i > c3max;
      if (!overV && !overI) continue;
      p.burned = true;
      p._burnMsg = power ? `Плата сгорела: ${fN(u, 1)} В на GPIO (${q.id})` : `Плата сгорела: ${fN(u, 1)} В на GPIO${gpio}`;
      if (ctx.dirty) ctx.dirty();
      return { level: 'burn', msg: p._burnMsg };
    }
  };
})();
