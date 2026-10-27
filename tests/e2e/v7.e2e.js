// v7: line robot (ESP32-C3 + TCRT5000 + DRV8833 + TT) spins motors, NRF24 pair delivers packets, boost computes input current.
const { chromium } = require('playwright-core'); const assert = require('assert');
const URL = process.argv[2] || 'http://localhost:8765/';
(async () => { const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const pg = await b.newPage({ viewport: { width: 1920, height: 1080 } }); const errs = [];
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(URL); await pg.waitForTimeout(400);
  const v7 = await pg.evaluate(() => [...document.scripts].filter(s => s.src).every(s => /\?v=(7|8|9|10|11|12|13|14|14\.1|14\.2|14\.3|14\.4|14\.5|14\.5\.1|14\.5\.2|14\.5\.3|14\.5\.5|14\.5\.6|14\.5\.7|14\.5\.9|14\.6\.0|14\.6\.1|14\.6\.4)$/.test(s.src)) && !!window.Devices); console.log('scripts ?v=7 + devices.js', v7); assert.ok(v7);
  await pg.click('#new'); const n = await pg.$$eval('.ncard', x => x.map(e => e.dataset.kind)); console.log('cards', n.join(',')); assert.ok(n.includes('esp32c3') && n.includes('line'));
  await pg.click('.ncard[data-kind="line"]'); await pg.waitForTimeout(300);
  await pg.click('#run'); await pg.waitForTimeout(2500);
  let r = await pg.evaluate(() => { const S = window.__sim, P = S.proj.parts, g = id => P.find(p => p.id === id); return { m1: g('M1')._st.rpm, m2: g('M2')._st.rpm, soc: g('BT1')._st.soc, err: document.querySelector('#status').textContent }; });
  console.log('line robot on white', JSON.stringify(r)); assert.ok(r.m1 > 20 && r.m2 > 20);
  await pg.evaluate(() => { window.__sim.proj.parts.find(p => p.id === 'S1').props.refl = 0.05; }); await pg.waitForTimeout(1500);
  r = await pg.evaluate(() => { const P = window.__sim.proj.parts, g = id => P.find(p => p.id === id); return { m1: g('M1')._st.rpm, m2: g('M2')._st.rpm }; });
  console.log('left sensor on black line', JSON.stringify(r)); assert.ok(r.m1 < 0 && r.m2 > 20);
  await pg.screenshot({ path: '/tmp/v7.png' }); await pg.click('#stop');
  // NRF24 pair
  await pg.selectOption('#projects', 'ex:Пример: NRF24 — передатчик и приёмник (2 × ESP32-C3)'); await pg.waitForTimeout(300);
  const cf = await pg.$eval('#codeFor', e => ({ h: e.hidden, o: [...e.options].map(o => o.value) })); console.log('codeFor', JSON.stringify(cf)); assert.ok(!cf.h && cf.o.includes('U2'));
  await pg.click('#run'); await pg.waitForTimeout(3000);
  const rf = await pg.evaluate(() => ({ s: window.__sim.rf.sent, d: window.__sim.rf.delivered, t: document.querySelector('#console').textContent.slice(-300) }));
  console.log('rf', rf.s, rf.d, JSON.stringify(rf.t)); assert.ok(rf.s > 0 && rf.d > 0 && /отправлено/.test(rf.t) && /принято/.test(rf.t)); await pg.click('#stop');
  // boost
  await pg.selectOption('#projects', 'ex:Пример: Повышающий преобразователь 3,7 → 12 В'); await pg.waitForTimeout(300);
  await pg.click('#run'); await pg.waitForTimeout(1200);
  const bo = await pg.evaluate(() => window.__sim.meas.U1); console.log('boost', JSON.stringify(bo));
  assert.ok(Math.abs(bo.Vo - 12) < 0.3 && Math.abs(bo.Iin - 1.2 / (0.9 * bo.Vin)) < 0.05); await pg.click('#stop');
  console.log('console errors', errs); assert.equal(errs.length, 0); await b.close(); console.log('V7 E2E OK'); })().catch(e => { console.error(e); process.exit(1); });
