// v14.5: 3D tab — place sensors, drag stimuli, readings, sanitize round-trip, schema still there.
const { chromium } = require('playwright-core'); const assert = require('assert');
const URL = process.argv[2] || 'http://localhost:8765/';
const SHOT = process.argv[3] || '/tmp';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader'] });
  const pg = await b.newPage({ viewport: { width: 1400, height: 860 } });
  const errs = [], net = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (/Content Security Policy|Refused/i.test(m.text())) errs.push(m.text()); });
  pg.on('request', r => { const u = r.url(); if (!u.startsWith(URL) && !u.startsWith('data:') && !u.startsWith('blob:')) net.push(u); });
  await pg.goto(URL); await pg.evaluate(() => localStorage.clear()); await pg.reload(); await pg.waitForTimeout(400);
  const ok = (c, m) => { assert.ok(c, m); console.log('✓', m); };

  const csp = await pg.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content);
  ok(csp.includes("connect-src 'none'") && csp.includes("script-src 'self'") && !/unsafe-inline|unsafe-eval/.test(csp), 'CSP unchanged');
  const scripts = await pg.evaluate(() => [...document.scripts].filter(s => s.src).map(s => s.src));
  const origin = new globalThis.URL(URL).origin;
  ok(scripts.every(s => s.startsWith(origin) && /\?v=14\.5$/.test(s)), 'scripts are same-origin ?v=14.5');
  ok(scripts.some(s => s.includes('/vendor/three/three.min.js')), 'Three.js vendored');
  ok(await pg.evaluate(() => [...document.querySelectorAll('#rtabs button')].map(b => b.textContent).join() === 'Схема,Шасси,Трасса'), 'robot tabs unchanged');
  ok(await pg.evaluate(() => !!document.querySelector('#undo') && !!document.querySelector('#redo') && !!document.querySelector('#simMore') && !!document.querySelector('#setHold')), 'undo and hold-menu chrome still present');

  await pg.evaluate(() => {
    const p = __sim.proj;
    p.parts.push({ id: 'U2', type: 'hcsr04', x: 200, y: 0, rot: 0, props: { dist: 50 } });
    p.parts.push({ id: 'R9', type: 'ldr', x: 200, y: 80, rot: 0, props: { lux: 100 } });
    p.parts.push({ id: 'U3', type: 'dht22', x: 200, y: 160, rot: 0, props: { temp: 24, hum: 45 } });
    p.parts.push({ id: 'V9', type: 'vl53l0x', x: 200, y: 240, rot: 0, props: { mm: 300 } });
  });
  await pg.click('#w3tab'); await pg.waitForTimeout(400);
  ok(await pg.evaluate(() => World3D.active && !document.querySelector('#w3pane').hidden && document.querySelector('#w3fail').hidden), '3D pane open, WebGL ok');
  const kinds = ['ultrasonic', 'ldr', 'dht', 'pir'];
  const types = ['block', 'flashlight', 'heat', 'humid', 'mover'];
  for (const k of kinds) await pg.click(`#w3pal button[data-kind="${k}"]`);
  for (const t of types) await pg.click(`#w3pal button[data-type="${t}"]`);
  await pg.waitForTimeout(200);
  const placed = await pg.evaluate(() => ({
    s: __sim.proj.world3d.sensors.map(s => s.kind),
    t: __sim.proj.world3d.stimuli.map(s => s.type),
    dist: __sim.proj.parts.find(p => p.type === 'hcsr04').props.dist,
    lux: __sim.proj.parts.find(p => p.type === 'ldr').props.lux,
    temp: __sim.proj.parts.find(p => p.type === 'dht22').props.temp,
    hum: __sim.proj.parts.find(p => p.type === 'dht22').props.hum,
    mm: __sim.proj.parts.find(p => p.type === 'vl53l0x').props.mm,
    read: World3D.getReadings().sensors.map(s => s.kind + ':' + (s.dist ?? s.lux ?? s.temp ?? s.motion)),
    label: document.querySelector('#w3tags .w3tag').textContent
  }));
  console.log('placed', JSON.stringify(placed));
  ok(placed.s.join() === kinds.join() && placed.t.join() === types.join(), 'four sensors and five stimuli');
  ok(placed.dist === 31 && /31 см/.test(placed.label), 'ultrasonic hits the cube, label shows cm');
  ok(placed.lux > 100, 'flashlight raises LDR lux (' + placed.lux + ')');
  ok(placed.temp > 24, 'heat raises DHT temp (' + placed.temp + ')');
  ok(placed.mm === 300, 'VL53 millimeters left alone');

  async function dragStim(type, dx, dy) {
    const info = await pg.evaluate(t => {
      const o = __sim.proj.world3d.stimuli.find(s => s.type === t);
      return { id: o.id, x: o.x, z: o.z, p: World3D.screenPos('stimulus', o.id) };
    }, type);
    assert.ok(info.p && !info.p.behind, type + ' on screen ' + JSON.stringify(info.p));
    await pg.mouse.move(info.p.x, info.p.y);
    await pg.mouse.down();
    await pg.mouse.move(info.p.x + dx, info.p.y + dy, { steps: 8 });
    await pg.mouse.up();
    await pg.waitForTimeout(50);
    const after = await pg.evaluate(t => { const o = __sim.proj.world3d.stimuli.find(s => s.type === t); return { x: o.x, z: o.z }; }, type);
    ok(after.x !== info.x || after.z !== info.z, 'dragged ' + type + ' ' + info.x + ',' + info.z + ' → ' + after.x + ',' + after.z);
    return after;
  }
  await dragStim('block', 220, 0);
  const far = await pg.evaluate(() => ({ dist: __sim.proj.parts.find(p => p.type === 'hcsr04').props.dist, label: [...document.querySelectorAll('#w3tags .w3tag')].map(n => n.textContent).join(' | ') }));
  console.log('after drag', JSON.stringify(far));
  ok(far.dist === 400 && /400 см/.test(far.label), 'cube left the beam, distance is 400 cm');
  for (const t of ['flashlight', 'heat', 'humid', 'mover']) await dragStim(t, 70, 12);

  // put the figurine in front of the PIR and read motion
  await pg.evaluate(() => {
    const pir = __sim.proj.world3d.sensors.find(s => s.kind === 'pir');
    const m = __sim.proj.world3d.stimuli.find(s => s.type === 'mover');
    m.x = pir.x; m.y = pir.y; m.z = pir.z - 30;
    World3D.onOpen();
  });
  await pg.waitForTimeout(100);
  const motion = await pg.evaluate(() => World3D.getReadings().sensors.find(s => s.kind === 'pir').motion);
  ok(motion === true, 'mover inside the PIR cone');

  const saved = await pg.evaluate(() => JSON.parse(JSON.stringify(__sim.proj.world3d)));
  await pg.reload(); await pg.waitForTimeout(400);
  const loaded = await pg.evaluate(() => {
    const s = sanitizeProject(JSON.parse(JSON.stringify(__sim.proj)));
    return { world: s.world3d, dist: __sim.proj.parts.find(p => p.id === 'U2').props.dist, mm: __sim.proj.parts.find(p => p.id === 'V9').props.mm };
  });
  ok(JSON.stringify(loaded.world.sensors.map(s => s.kind)) === JSON.stringify(saved.sensors.map(s => s.kind)), 'reload keeps sensors');
  ok(loaded.world.stimuli.length === 5 && loaded.world.stimuli.every(t => ['block', 'flashlight', 'heat', 'humid', 'mover'].includes(t.type)), 'reload keeps stimuli via sanitize');
  ok(loaded.dist === 400 && loaded.mm === 300, 'saved HC-SR04 distance survived reload, VL53 did not');
  await pg.click('#w3tab'); await pg.waitForTimeout(300);
  await pg.click('#w3reset');
  ok(await pg.evaluate(() => __sim.proj.world3d.stimuli.length === 0 && __sim.proj.world3d.sensors.length === 4), 'reset clears stimuli only');
  await pg.screenshot({ path: SHOT + '/world3d.png' });

  await pg.click('#w3tab'); await pg.waitForTimeout(200);
  const back = await pg.evaluate(() => {
    const c = document.querySelector('#center').getBoundingClientRect();
    const el = document.elementFromPoint(c.left + c.width * 0.55, c.top + c.height * 0.55);
    const node = el && (el.closest('#svg') || el);
    return { w3: World3D.active, svg: !!(node && node.closest && node.closest('#svg')), undo: !!document.querySelector('#undo'), hold: !!document.querySelector('#setHold') };
  });
  ok(!back.w3 && back.svg && back.undo && back.hold, 'schema is back, undo and hold menu remain');
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  ok(net.length === 0, 'no off-origin requests ' + net.join(' '));

  // phone tab
  const mc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const ph = await mc.newPage();
  ph.on('pageerror', e => errs.push('phone ' + e.message));
  await ph.goto(URL); await ph.waitForTimeout(400);
  const tabs = await ph.evaluate(() => [...document.querySelectorAll('#pmTabs button')].filter(b => !b.hidden).map(b => b.textContent).join());
  ok(tabs === 'Схема,3D,Код', 'phone tabs ' + tabs);
  await ph.tap('#pmTabs [data-ptab=world]'); await ph.waitForTimeout(400);
  const lay = await ph.evaluate(() => {
    const cv = document.querySelector('#w3cv').getBoundingClientRect();
    const btn = document.querySelector('#w3pal button').getBoundingClientRect();
    return { w: cv.width, h: cv.height, bh: btn.height, on: World3D.active };
  });
  ok(lay.on && lay.w > 200 && lay.h > 200 && lay.bh >= 44, 'phone 3D canvas ' + JSON.stringify(lay));
  await ph.screenshot({ path: SHOT + '/world3d-phone.png' });
  await b.close();
  console.log('world3d e2e ok');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
