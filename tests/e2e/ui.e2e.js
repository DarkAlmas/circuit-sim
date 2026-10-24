// Run: NODE_PATH=<dir with playwright-core> node tests/e2e/ui.e2e.js [baseURL] [shotDir]
const { chromium } = require('playwright-core'); const assert = require('assert');
const URL = process.argv[2] || 'http://localhost:8765/', SHOT = process.argv[3] || '/tmp';
const P = (pr) => ({ parts: pr.parts, wires: pr.wires, code: pr.code || '' });
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
  const pg = await b.newPage({ viewport: { width: 1400, height: 860 } }); const errs = [];
  pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (/Content Security Policy|Refused/i.test(m.text())) errs.push(m.text()); });
  pg.on('dialog', d => d.accept('x'));
  await pg.goto(URL); await pg.evaluate(() => localStorage.clear()); await pg.reload();
  const load = proj => pg.evaluate(j => { const f = new File([j], 'p.json'); const dt = new DataTransfer(); dt.items.add(f); const i = document.querySelector('#import'); i.files = dt.files; i.dispatchEvent(new Event('change')); }, JSON.stringify(proj)).then(() => pg.waitForTimeout(250));
  const box = sel => pg.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
  // --- short circuit: 5 V through R1, R edited to ~0
  const shortProj = { parts: [{ id: 'V1', type: 'dc', x: 300, y: 300, rot: 0, props: { V: 5, rInt: 0.1 } }, { id: 'R1', type: 'resistor', x: 400, y: 200, rot: 0, props: { R: 220, Pmax: 0.25 } }],
    wires: [{ id: 'w1', a: { part: 'V1', pin: 'p' }, b: { part: 'R1', pin: 'a' } }, { id: 'w2', a: { part: 'R1', pin: 'b' }, b: { part: 'V1', pin: 'n' } }] };
  await load(shortProj); await pg.waitForTimeout(200);
  await pg.evaluate(() => window.__sim.select('R1'));
  const bands1 = await pg.evaluate(() => [...document.querySelectorAll('#props .bands rect')].map(r => r.getAttribute('fill')).join());
  await pg.fill('#props input[data-k="R"]', '0.001'); await pg.waitForTimeout(100);
  const bands2 = await pg.evaluate(() => [...document.querySelectorAll('#props .bands rect')].map(r => r.getAttribute('fill')).join());
  assert.notEqual(bands1, bands2, 'resistor bands follow value');
  await pg.click('#run'); await pg.waitForTimeout(700);
  const sh = await pg.evaluate(() => ({ bar: document.querySelector('#simbar').className, msg: document.querySelector('#shortMsg').textContent, cards: [...document.querySelectorAll('#props .card .cv')].map(c => c.textContent), alert: document.querySelector('#alert').textContent, blink: document.querySelectorAll('.wire.short').length, flow: document.querySelectorAll('.flow').length, n: window.__sim.shorts.length }));
  assert.equal(sh.n, 1); assert.match(sh.msg, /⚡ Короткое замыкание: источник 5 В замкнут через R1 \(1 мОм\)\. Симуляция остановлена/); assert.deepEqual(sh.cards, ['КЗ', 'КЗ', 'КЗ']);
  assert.ok(sh.bar.includes('bad') && sh.blink === 2 && sh.flow === 0, JSON.stringify(sh)); assert.match(sh.alert, /Короткое замыкание/);
  await pg.screenshot({ path: SHOT + '/short.png' });
  const cam0 = await pg.evaluate(() => ({ ...window.__sim.cam })); await pg.click('#showShort'); const cam1 = await pg.evaluate(() => ({ ...window.__sim.cam }));
  assert.notDeepEqual(cam0, cam1, 'Показать zooms');
  await pg.fill('#props input[data-k="R"]', '220'); await pg.waitForTimeout(500);
  const res = await pg.evaluate(() => ({ n: window.__sim.shorts.length, I: window.__sim.meas.R1.I, bar: document.querySelector('#simbar').className, txt: document.querySelector('#simText').hidden }));
  assert.equal(res.n, 0); assert.ok(Math.abs(res.I - 5 / 220.1) < 1e-3, 'resumed I=' + res.I); assert.ok(!res.bar.includes('bad') && !res.txt);
  // view-only while running: drag must not move a part
  const r1 = await box('[data-part="R1"] .hit'); await pg.mouse.move(r1.x, r1.y); await pg.mouse.down(); await pg.mouse.move(r1.x + 80, r1.y + 60, { steps: 4 }); await pg.mouse.up();
  assert.equal(await pg.evaluate(() => window.__sim.proj.parts.find(p => p.id === 'R1').x), 400, 'locked during sim');
  await pg.click('#stop');
  // --- burnout: LED straight on 5 V with 10 Ω
  const burn = { parts: [{ id: 'V1', type: 'dc', x: 300, y: 300, rot: 0, props: { V: 5, rInt: 0.1 } }, { id: 'R1', type: 'resistor', x: 400, y: 200, rot: 0, props: { R: 10, Pmax: 5 } }, { id: 'D1', type: 'led', x: 520, y: 200, rot: 0, props: { color: 'синий', Vf: 1.8, Imax: 0.02 } }],
    wires: [{ id: 'w1', a: { part: 'V1', pin: 'p' }, b: { part: 'R1', pin: 'a' } }, { id: 'w2', a: { part: 'R1', pin: 'b' }, b: { part: 'D1', pin: 'a' } }, { id: 'w3', a: { part: 'D1', pin: 'b' }, b: { part: 'V1', pin: 'n' } }] };
  await load(burn); await pg.evaluate(() => window.__sim.select('D1')); await pg.click('#run'); await pg.waitForTimeout(600);
  const bu = await pg.evaluate(() => ({ g: !!document.querySelector('[data-part="D1"].burned'), smoke: document.querySelectorAll('[data-part="D1"] .smoke').length, card: document.querySelector('#props .card .cv').textContent, fix: !!document.querySelector('#fix') }));
  if (!bu.g) console.log(await pg.evaluate(() => JSON.stringify([window.__sim.proj.parts, document.querySelector("#alert").textContent, window.__sim.shorts, document.querySelector("#status").textContent, window.__sim.meas.D1, document.querySelector("#console").textContent])));
  assert.ok(bu.g && bu.smoke === 3 && bu.card === 'Сгорела' && bu.fix, JSON.stringify(bu)); await pg.screenshot({ path: SHOT + '/burn.png' });
  await pg.evaluate(() => { window.__sim.proj.parts.find(p => p.id === 'R1').props.R = 220; }); await pg.click('#fix'); await pg.waitForTimeout(300); assert.equal(await pg.evaluate(() => !!window.__sim.proj.parts.find(p => p.id === 'D1').burned), false, 'Заменить restores'); await pg.click('#stop');
  // --- live cards & bars: 220 Ω LED
  await pg.evaluate(() => { const p = window.__sim.proj.parts.find(p => p.id === 'R1'); p.props.R = 150; delete p.burned; }); await pg.evaluate(() => window.__sim.select('D1')); await pg.click('#run'); await pg.waitForTimeout(500);
  const cards = await pg.evaluate(() => [...document.querySelectorAll('#props .card')].map(c => c.className + ':' + c.querySelector('.cv').textContent + ':' + c.querySelector('.bar i').style.width));
  assert.ok(cards[1].includes('мА') && /green|orange|red/.test(cards[1]), cards.join(' | ')); await pg.click('#stop');
  // --- wire bend (dblclick), undo, delete, rotate, zoom
  const wb = await pg.evaluate(() => { const p = document.querySelector('[data-wire="w3"].wire'), L = p.getTotalLength(), pt = p.getPointAtLength(L / 2), m = p.getScreenCTM(); return { x: pt.x * m.a + m.e, y: pt.y * m.d + m.f }; });
  await pg.mouse.dblclick(wb.x, wb.y); await pg.waitForTimeout(100);
  const pts = await pg.evaluate(() => (window.__sim.proj.wires.find(w => w.id === "w3").pts || []).length); assert.ok(pts >= 1, 'bend added');
  assert.equal(await pg.evaluate(() => document.querySelectorAll('.wsel').length), 1, 'white outline on selected wire');
  await pg.keyboard.press('Control+z'); assert.equal(await pg.evaluate(() => window.__sim.proj.wires.find(w => w.id === "w3").pts.length), 0, 'undo bend');
  await pg.evaluate(() => window.__sim.select('R1')); await pg.keyboard.press('r'); assert.equal(await pg.evaluate(() => window.__sim.proj.parts.find(p => p.id === 'R1').rot), 1);
  await pg.keyboard.press('Delete'); assert.equal(await pg.evaluate(() => window.__sim.proj.parts.some(p => p.id === 'R1')), false);
  await pg.keyboard.press('Control+z'); assert.equal(await pg.evaluate(() => window.__sim.proj.parts.some(p => p.id === 'R1')), true, 'undo delete');
  const s0 = await pg.evaluate(() => window.__sim.cam.s); await pg.mouse.move(700, 400); await pg.mouse.wheel(0, -300); await pg.waitForTimeout(50);
  assert.ok(await pg.evaluate(() => window.__sim.cam.s) > s0, 'wheel zoom');
  // --- pin hover label
  const pin = await box('[data-part="D1"] .pin[data-pin="a"]'); await pg.mouse.move(pin.x, pin.y); await pg.waitForTimeout(50);
  assert.match(await pg.textContent('#tip'), /Анод \+/);
  // --- breadboard: LED + resistor plugged into holes, no wires between them
  const bb = { parts: [{ id: 'BB1', type: 'breadboard', x: 400, y: 300, rot: 0, props: {} }, { id: 'V1', type: 'dc', x: 150, y: 300, rot: 0, props: { V: 5, rInt: 0.1 } },
      { id: 'R1', type: 'resistor', x: 340, y: 260, rot: 0, props: { R: 220, Pmax: 0.25 } }, { id: 'D1', type: 'led', x: 420, y: 260, rot: 0, props: { color: 'красный', Vf: 1.8, Imax: 0.02 } }],
    wires: [{ id: 'w1', a: { part: 'V1', pin: 'p' }, b: { part: 'BB1', pin: 'a7' } }, { id: 'w2', a: { part: 'BB1', pin: 'e18' }, b: { part: 'V1', pin: 'n' } }] };
  // R1 pins at x 300/380 -> columns 16/24? compute: hole x = 400-150+10(i-1); R1.a=300 -> i=6, R1.b=380 -> i=14; D1.a=380 -> 14, D1.b=460 -> 22. y=260 -> row c (top half)
  bb.wires[0].b.pin = 'a6'; bb.wires[1].a.pin = 'e22';
  await load(bb); await pg.click('#run'); await pg.waitForTimeout(500);
  const bI = await pg.evaluate(() => window.__sim.meas.D1 && window.__sim.meas.D1.I);  if (!(bI > 0.005)) console.log(await pg.evaluate(() => JSON.stringify([window.__sim.proj, document.querySelector('#console').textContent, document.querySelector('#status').textContent]))); assert.ok(bI > 0.005 && bI < 0.02, 'breadboard LED I=' + bI);
  await pg.screenshot({ path: SHOT + '/breadboard.png' }); await pg.click('#stop');
  // --- example + desktop screenshot
  await pg.selectOption('#projects', { index: 1 }); await pg.waitForTimeout(200); await pg.click('#run'); await pg.waitForTimeout(800); await pg.screenshot({ path: SHOT + '/desktop.png' }); await pg.click('#stop');
  // --- mobile viewport with touch pinch
  const mc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); const mp = await mc.newPage();
  mp.on('pageerror', e => errs.push('mobile: ' + e.message)); await mp.goto(URL); await mp.waitForTimeout(300);
  const lay = await mp.evaluate(() => { const r = document.querySelector('#svg').getBoundingClientRect(); return { w: r.width, h: r.height, sw: document.documentElement.scrollWidth }; });
  assert.ok(lay.w > 300 && lay.h > 250 && lay.sw <= 400, JSON.stringify(lay));
  const ms0 = await mp.evaluate(() => window.__sim.cam.s);
  const cdp = await mc.newCDPSession(mp); const c = await mp.evaluate(() => { const r = document.querySelector('#svg').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  const tp = (d) => [{ x: c[0] - d, y: c[1], id: 1 }, { x: c[0] + d, y: c[1], id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp(30) });
  for (const d of [45, 60, 80]) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp(d) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await mp.waitForTimeout(100);
  const ms1 = await mp.evaluate(() => window.__sim.cam.s); assert.ok(ms1 > ms0 * 1.5, 'pinch zoom ' + ms0 + ' -> ' + ms1);
  await mp.screenshot({ path: SHOT + '/mobile.png' });
  assert.deepEqual(errs, []); console.log('ui e2e OK'); await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
