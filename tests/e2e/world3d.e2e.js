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
  ok(scripts.every(s => s.startsWith(origin) && /\?v=14\.5\.2$/.test(s)), 'scripts are same-origin ?v=14.5.2');
  ok(scripts.some(s => s.includes('/vendor/three/three.min.js')), 'Three.js vendored');
  ok(await pg.evaluate(() => [...document.querySelectorAll('#rtabs button')].map(b => b.textContent).join() === 'Схема,Шасси,Трасса'), 'robot tabs unchanged');
  ok(await pg.evaluate(() => !!document.querySelector('#undo') && !!document.querySelector('#redo') && !!document.querySelector('#simMore') && !!document.querySelector('#setHold')), 'undo and hold-menu chrome still present');

  ok(await pg.evaluate(() => {
    const item = document.querySelector('#palette .item[data-type="pir"]');
    const pins = window.PARTS.pir && window.PARTS.pir.pins.map(q => q.id).join();
    return !!item && pins === 'VCC,OUT,GND' && window.PARTS.pir.props.motion === false && window.PARTS.pir.sensor === 'pir';
  }), 'PIR is in the palette with VCC/OUT/GND and motion off');
  await pg.evaluate(() => {
    const p = __sim.proj;
    p.parts.push({ id: 'U2', type: 'hcsr04', x: 200, y: 0, rot: 0, props: { dist: 50 } });
    p.parts.push({ id: 'R9', type: 'ldr', x: 200, y: 80, rot: 0, props: { lux: 100 } });
    p.parts.push({ id: 'U3', type: 'dht22', x: 200, y: 160, rot: 0, props: { temp: 24, hum: 45 } });
    p.parts.push({ id: 'V9', type: 'vl53l0x', x: 200, y: 240, rot: 0, props: { mm: 300 } });
    p.parts.push({ id: 'P1', type: 'pir', x: 200, y: 320, rot: 0, props: {} });
  });
  await pg.click('#w3tab'); await pg.waitForTimeout(400);
  ok(await pg.evaluate(() => World3D.active && !document.querySelector('#w3pane').hidden && document.querySelector('#w3fail').hidden), '3D pane open, WebGL ok');
  const desk = await pg.evaluate(() => {
    const pal = document.querySelector('#w3pal').getBoundingClientRect();
    const stage = document.querySelector('#w3stage').getBoundingClientRect();
    const reset = document.querySelector('#w3reset');
    return { dir: getComputedStyle(document.querySelector('#w3pal')).flexDirection, palRight: pal.right, stageLeft: stage.left, palW: pal.width, palH: pal.height, label: reset.textContent, title: reset.title };
  });
  ok(desk.dir === 'column' && desk.palH > desk.palW && desk.palRight <= desk.stageLeft + 1, 'desktop palette stays a left column ' + JSON.stringify(desk));
  ok(desk.label === 'Сброс воздействий' && desk.title === 'Сброс воздействий', 'reset label is Сброс воздействий');
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
  ok(placed.hum >= 80, 'default steam is inside R50 and raises humidity (' + placed.hum + ')');
  const live = await pg.evaluate(() => {
    const dht = __sim.proj.world3d.sensors.find(s => s.kind === 'dht');
    const heat = __sim.proj.world3d.stimuli.find(s => s.type === 'heat');
    const part = __sim.proj.parts.find(p => p.type === 'dht22');
    const tag = document.querySelector('#w3tags .w3tag[data-id="' + dht.id + '"]');
    const prev = { x: heat.x, y: heat.y, z: heat.z, temp: part.props.temp, text: tag.textContent };
    heat.x = dht.x; heat.y = dht.y; heat.z = dht.z;
    World3D.applyReadings(__sim.proj);
    const temp = part.props.temp, text = tag.textContent;
    heat.x = prev.x; heat.y = prev.y; heat.z = prev.z;
    World3D.applyReadings(__sim.proj);
    return { prevTemp: prev.temp, temp, text, restored: part.props.temp, same: text.includes(Number(temp).toFixed(1)) };
  });
  ok(live.temp > live.prevTemp && live.same && live.restored === live.prevTemp, 'DHT tag matches the reading in the same applyReadings call ' + JSON.stringify(live));
  ok(placed.mm === 300, 'VL53 millimeters left alone');
  const humSpan = await pg.evaluate(() => {
    const dht = __sim.proj.world3d.sensors.find(s => s.kind === 'dht');
    const u = __sim.proj.world3d.stimuli.find(s => s.type === 'humid');
    const saved = { x: u.x, y: u.y, z: u.z };
    const read = () => { World3D.getReadings(); return __sim.proj.parts.find(p => p.type === 'dht22').props.hum; };
    u.x = dht.x; u.y = dht.y; u.z = dht.z;
    const onSensor = read();
    u.z = dht.z + 80;
    const outside = read();
    u.x = saved.x; u.y = saved.y; u.z = saved.z;
    read();
    return { onSensor, outside };
  });
  ok(humSpan.onSensor >= 80 && humSpan.onSensor <= 100, 'steam on the DHT → ' + humSpan.onSensor);
  ok(humSpan.outside === 45, 'steam outside R50 stays at ambient 45');
  const blockAt = await pg.evaluate(() => World3D.screenPos('stimulus', __sim.proj.world3d.stimuli.find(s => s.type === 'block').id));
  await pg.mouse.click(blockAt.x, blockAt.y);
  await pg.waitForTimeout(120);
  await pg.screenshot({ path: SHOT + '/world3d.png' });

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
  const motion = await pg.evaluate(() => {
    const read = World3D.getReadings().sensors.find(s => s.kind === 'pir').motion;
    const part = __sim.proj.parts.find(p => p.type === 'pir');
    const svg = window.PARTS.pir.draw(part, {});
    return { read, prop: part.props.motion, label: /движение/.test(svg) };
  });
  ok(motion.read === true && motion.prop === true && motion.label, 'mover inside the PIR cone sets props.motion');

  await pg.evaluate(() => {
    const w = __sim.proj.world3d;
    const pir = w.sensors.find(s => s.kind === 'pir');
    const flash = w.stimuli.find(s => s.type === 'flashlight');
    pir.x = 0; pir.y = 81; pir.z = -10;
    for (const t of w.stimuli) { t.x = 78; t.y = 81; t.z = 30; }
    flash.x = 48; flash.y = 81; flash.z = -10;
    World3D.onOpen();
  });
  const z0 = await pg.evaluate(() => World3D.zoneKeys());
  ok(z0.length === 0, 'zones stay off until something is selected or hovered ' + JSON.stringify(z0));
  await pg.waitForTimeout(200);
  const pirAt = await pg.evaluate(() => World3D.screenPos('sensor', __sim.proj.world3d.sensors.find(s => s.kind === 'pir').id));
  await pg.mouse.click(pirAt.x, pirAt.y);
  await pg.waitForTimeout(80);
  const z1 = await pg.evaluate(() => {
    const id = __sim.proj.world3d.sensors.find(s => s.kind === 'pir').id;
    return { keys: World3D.zoneKeys(), id };
  });
  ok(z1.keys.length === 1 && z1.keys[0] === 'sensor:' + z1.id, 'only the selected PIR cone ' + JSON.stringify(z1));
  const flashAt = await pg.evaluate(() => World3D.screenPos('stimulus', __sim.proj.world3d.stimuli.find(s => s.type === 'flashlight').id));
  await pg.mouse.move(flashAt.x, flashAt.y);
  await pg.waitForTimeout(80);
  const z2 = await pg.evaluate(() => {
    const pir = __sim.proj.world3d.sensors.find(s => s.kind === 'pir').id;
    const flash = __sim.proj.world3d.stimuli.find(s => s.type === 'flashlight').id;
    return { keys: World3D.zoneKeys(), want: ['sensor:' + pir, 'stimulus:' + flash].sort() };
  });
  ok(JSON.stringify(z2.keys) === JSON.stringify(z2.want), 'hover adds only that stimulus zone ' + JSON.stringify(z2));
  await pg.mouse.move(8, 8);
  await pg.waitForTimeout(80);
  const z3 = await pg.evaluate(() => World3D.zoneKeys());
  ok(z3.length === 1 && z3[0] === z1.keys[0], 'leaving the canvas drops the hover zone ' + JSON.stringify(z3));

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
  ok(await pg.evaluate(() => {
    const w = __sim.proj.world3d, dht = __sim.proj.parts.find(p => p.type === 'dht22'), pir = __sim.proj.parts.find(p => p.type === 'pir');
    return w.stimuli.length === 0 && w.sensors.length === 4 && dht.props.temp === 24 && dht.props.hum === 45 && pir.props.motion === false;
  }), 'reset clears stimuli only and readings return to ambient');
  const readTag = () => pg.evaluate(() => {
    const pir = __sim.proj.world3d.sensors.find(s => s.kind === 'pir');
    const tag = document.querySelector('#w3tags .w3tag[data-id="' + pir.id + '"]');
    const cv = document.querySelector('#w3cv').getBoundingClientRect();
    const pr = document.querySelector('#w3pal').getBoundingClientRect();
    const sp = World3D.screenPos('sensor', pir.id);
    const tr = tag.getBoundingClientRect();
    const visible = !!(sp && !tag.hidden && tr.width > 8 && tr.top > cv.top && tr.bottom < cv.bottom && tr.left < cv.right);
    return { visible, left: tr.left, top: tr.top, palRight: pr.right, sy: sp ? sp.y : 0, sx: sp ? sp.x : 0, anchorLeft: sp ? sp.x - tr.width / 2 : 0, cvTop: cv.top, cvBottom: cv.bottom };
  });
  const clipped = c => c.visible && c.anchorLeft < c.palRight + 8;
  let clip = await readTag();
  const panFrom = await pg.evaluate(() => { const r = document.querySelector('#w3cv').getBoundingClientRect(); return { x: r.left + r.width * 0.62, y: r.top + r.height * 0.62 }; });
  for (let i = 0; i < 8 && !clipped(clip); i++) {
    await pg.mouse.move(panFrom.x, panFrom.y);
    await pg.mouse.down({ button: 'right' });
    await pg.mouse.move(panFrom.x - 140, panFrom.y, { steps: 4 });
    await pg.mouse.up({ button: 'right' });
    await pg.waitForTimeout(80);
    clip = await readTag();
  }
  ok(clipped(clip) && clip.left >= clip.palRight + 8 - 1 && clip.top < clip.sy, 'PIR tag stays right of the palette and above the sensor ' + JSON.stringify(clip));

  await pg.click('#w3tab'); await pg.waitForTimeout(200);
  const back = await pg.evaluate(() => {
    const c = document.querySelector('#center').getBoundingClientRect();
    const el = document.elementFromPoint(c.left + c.width * 0.55, c.top + c.height * 0.55);
    const node = el && (el.closest('#svg') || el);
    return { w3: World3D.active, svg: !!(node && node.closest && node.closest('#svg')), undo: !!document.querySelector('#undo'), hold: !!document.querySelector('#setHold') };
  });
  ok(!back.w3 && back.svg && back.undo && back.hold, 'schema is back, undo and hold menu remain');
  await pg.evaluate(() => { const p = __sim.proj.parts.find(x => x.type === 'hcsr04'); p.props.dist = 123; __sim.start(); });
  await pg.waitForTimeout(280);
  ok(await pg.evaluate(() => __sim.proj.parts.find(x => x.type === 'hcsr04').props.dist === 123), '3D closed: running sim leaves the distance slider alone');
  await pg.evaluate(() => __sim.stop());
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
    const pal = document.querySelector('#w3pal').getBoundingClientRect();
    const stage = document.querySelector('#w3stage').getBoundingClientRect();
    const btn = document.querySelector('#w3pal button').getBoundingClientRect();
    const btns = [...document.querySelectorAll('#w3pal button')].slice(0, 2).map(b => b.getBoundingClientRect());
    return {
      w: cv.width, h: cv.height, bh: btn.height, on: World3D.active,
      dir: getComputedStyle(document.querySelector('#w3pal')).flexDirection,
      palTop: pal.top, stageBottom: stage.bottom, palW: pal.width, palH: pal.height,
      row: Math.abs(btns[0].top - btns[1].top) < 6 && btns[1].left > btns[0].right - 4
    };
  });
  ok(lay.on && lay.w > 200 && lay.h > 200 && lay.bh >= 44, 'phone 3D canvas ' + JSON.stringify(lay));
  ok(lay.dir === 'row' && lay.row && lay.palW > lay.palH && lay.palTop + 2 >= lay.stageBottom, 'phone palette is a bottom chip row ' + JSON.stringify(lay));
  await ph.screenshot({ path: SHOT + '/world3d-phone.png' });
  await b.close();
  console.log('world3d e2e ok');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
