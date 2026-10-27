// v14.5.9: «Схема 3D» loads on the table. The sensor world (Мир, stimuli, auto-pairs) is gone.
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
  ok(scripts.every(s => s.startsWith(origin) && /\?v=14\.6\.6$/.test(s)), 'scripts are same-origin ?v=14.6.6');
  ok(scripts.some(s => s.includes('/schematic3d.js')) && scripts.some(s => s.includes('/vendor/three/three.min.js')), 'schematic3d and vendored Three.js');

  await pg.click('#w3tab'); await pg.waitForTimeout(400);
  const opened = await pg.evaluate(() => ({
    active: World3D.active,
    view: World3D.view,
    fail: document.querySelector('#w3fail').hidden,
    tab: document.querySelector('#w3tab').textContent,
    mir: [...document.querySelectorAll('#w3pal button')].some(b => b.textContent === 'Мир' || b.dataset.view === 'world' || b.dataset.kind || b.dataset.type),
    world: __sim.proj.world3d
  }));
  ok(opened.active && opened.view === 'schema' && opened.fail && opened.tab === 'Схема 3D' && !opened.mir && opened.world == null, 'Схема 3D opens with no Мир palette ' + JSON.stringify(opened));
  const laid = await pg.evaluate(() => {
    const want = ['esp32', 'esp8266', 'esp32c3', 'uno', 'pico', 'opi', 'dht22', 'hcsr04', 'pir', 'ldr'];
    __sim.proj.parts.push(
      { id: 'U4', type: 'uno', x: -420, y: 180, rot: 0, props: {} },
      { id: 'U5', type: 'esp32c3', x: -420, y: -180, rot: 0, props: {} },
      { id: 'U6', type: 'esp8266', x: 420, y: -180, rot: 0, props: {} },
      { id: 'U7', type: 'pico', x: 460, y: 40, rot: 1, props: {} },
      { id: 'U8', type: 'opi', x: 460, y: 220, rot: 0, props: {} },
      { id: 'U2', type: 'hcsr04', x: 220, y: 40, rot: 0, props: { dist: 50 } },
      { id: 'U3', type: 'dht22', x: 220, y: 160, rot: 1, props: { temp: 24, hum: 45 } },
      { id: 'P1', type: 'pir', x: 220, y: 280, rot: 0, props: { motion: false } },
      { id: 'R9', type: 'ldr', x: -180, y: 160, rot: 2, props: { lux: 100 } }
    );
    __sim.changed();
    return { view: World3D.view, fail: document.querySelector('#w3fail').hidden, want };
  });
  ok(laid.view === 'schema' && laid.fail, 'schema view stays on');
  await pg.waitForTimeout(250);
  const detail = await pg.evaluate(() => {
    const ang = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
    const rows = World3D.schemaDetail();
    const parts = __sim.proj.parts;
    const bad = [];
    for (const p of parts) {
      const pose = Schematic3D.pose(p);
      const row = rows.find(r => r.id === p.id);
      if (!row) { bad.push(p.id + ' missing'); continue; }
      if (row.kind !== Schematic3D.kindOf(p.type)) bad.push(p.id + ' kind ' + row.kind);
      if (Math.abs(row.x - pose.x) > 1e-6 || Math.abs(row.z - pose.z) > 1e-6 || Math.abs(row.y - pose.y) > 1e-6) bad.push(p.id + ' pos');
      if (ang(row.yaw, pose.yaw) > 1e-4) bad.push(p.id + ' yaw ' + row.yaw + ' vs ' + pose.yaw);
      if (row.n < 1) bad.push(p.id + ' empty');
    }
    const kinds = rows.map(r => r.kind);
    return {
      bad, n: rows.length, parts: parts.length,
      kinds,
      boards: ['esp32', 'esp8266', 'esp32c3', 'uno', 'pico', 'opi'].every(k => kinds.includes(k)),
      sensors: ['dht', 'hcsr04', 'pir', 'ldr'].every(k => kinds.includes(k)),
      passives: kinds.includes('resistor') && kinds.includes('led'),
      wires: World3D.schemaWireCount(),
      deep: Math.min(...rows.filter(r => ['esp32', 'esp8266', 'esp32c3', 'uno', 'pico', 'opi', 'dht', 'hcsr04', 'pir', 'ldr'].includes(r.kind)).map(r => r.n))
    };
  });
  console.log('schema', JSON.stringify({ n: detail.n, kinds: detail.kinds, deep: detail.deep, wires: detail.wires, bad: detail.bad }));
  ok(detail.bad.length === 0 && detail.n === detail.parts && detail.boards && detail.sensors && detail.passives && detail.wires >= 3 && detail.deep >= 3, 'meshes posed from the schematic ' + detail.bad.join('; '));
  await pg.screenshot({ path: SHOT + '/schematic3d.png' });

  const before = await pg.evaluate(() => {
    const p = __sim.proj.parts.find(x => x.id === 'U1');
    return { x: p.x, y: p.y, rot: p.rot, wires: __sim.proj.wires.length };
  });
  const at = await pg.evaluate(() => World3D.schemaScreen('U1'));
  ok(at && !at.behind, 'ESP32 on screen ' + JSON.stringify(at));
  await pg.mouse.click(at.x, at.y);
  await pg.waitForTimeout(80);
  const afterClick = await pg.evaluate(() => {
    const p = __sim.proj.parts.find(x => x.id === 'U1');
    return { x: p.x, y: p.y, rot: p.rot, wires: __sim.proj.wires.length };
  });
  ok(afterClick.x === before.x && afterClick.y === before.y && afterClick.rot === before.rot && afterClick.wires === before.wires, 'clicking a mesh does not move the part or drop wires');

  await pg.evaluate(() => { __sim.select('U3'); __sim.rotate(); });
  await pg.waitForTimeout(200);
  const spun = await pg.evaluate(() => {
    const p = __sim.proj.parts.find(x => x.id === 'U3');
    const row = World3D.schemaDetail().find(r => r.id === 'U3');
    const pose = Schematic3D.pose(p);
    const ang = Math.abs(Math.atan2(Math.sin(row.yaw - pose.yaw), Math.cos(row.yaw - pose.yaw)));
    return { rot: p.rot, ang, wires: __sim.proj.wires.length };
  });
  ok(spun.rot === 2 && spun.ang < 1e-4 && spun.wires === before.wires, 'rotate() updates the table yaw');

  const kept = await pg.evaluate(() => {
    const dht = __sim.proj.parts.find(p => p.type === 'dht22');
    const before = { temp: dht.props.temp, hum: dht.props.hum, dist: __sim.proj.parts.find(p => p.type === 'hcsr04').props.dist };
    __sim.proj.world3d = { sensors: [{ id: 'd', kind: 'dht', x: 0, y: 80, z: 0 }], stimuli: [{ id: 'h', type: 'heat', x: 0, y: 80, z: 0 }] };
    World3D.applyReadings(__sim.proj);
    World3D.ensurePairs(__sim.proj);
    return { before, temp: dht.props.temp, hum: dht.props.hum, dist: __sim.proj.parts.find(p => p.type === 'hcsr04').props.dist, view: World3D.view, added: __sim.proj.world3d && __sim.proj.world3d.stimuli && __sim.proj.world3d.stimuli.length };
  });
  ok(kept.temp === kept.before.temp && kept.hum === kept.before.hum && kept.dist === kept.before.dist && kept.view === 'schema' && kept.added === 1, 'stimuli do not rewrite sensor props ' + JSON.stringify(kept));

  await pg.click('#w3run'); await pg.waitForTimeout(300);
  const ran = await pg.evaluate(() => ({ running: __sim.running, view: World3D.view, bar: document.querySelector('#w3run').textContent, wires: World3D.schemaWireCount() }));
  ok(ran.running && ran.view === 'schema' && ran.bar === '■ Стоп' && ran.wires >= 3, '▶ runs inside Схема 3D ' + JSON.stringify(ran));
  await pg.click('#w3run'); await pg.waitForTimeout(150);

  await pg.click('#w3tab'); await pg.waitForTimeout(200);
  const back = await pg.evaluate(() => {
    const c = document.querySelector('#center').getBoundingClientRect();
    const el = document.elementFromPoint(c.left + c.width * 0.55, c.top + c.height * 0.55);
    const pane = document.querySelector('#w3pane');
    __sim.select('R1'); __sim.rotate();
    const p = __sim.proj.parts.find(x => x.id === 'R1');
    const svg = document.querySelector('[data-part="R1"]').getAttribute('transform');
    return {
      w3: World3D.active, pane: pane.hidden,
      inCenter: !!(el && el.closest && el.closest('#center')),
      blocked: !!(el && el.closest && el.closest('#w3pane')),
      rot: p.rot, transform: svg, wires: __sim.proj.wires.length
    };
  });
  ok(!back.w3 && back.pane && back.inCenter && !back.blocked && back.rot === 1 && /rotate\(90\)/.test(back.transform) && back.wires === before.wires, '2D schematic is back ' + JSON.stringify(back));
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  ok(net.length === 0, 'no off-origin requests ' + net.join(' '));

  const mc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const ph = await mc.newPage();
  ph.on('pageerror', e => errs.push('phone ' + e.message));
  await ph.goto(URL); await ph.waitForTimeout(400);
  await ph.tap('#pmTabs [data-ptab=world]'); await ph.waitForTimeout(300);
  const phone = await ph.evaluate(() => {
    const cv = document.querySelector('#w3cv').getBoundingClientRect();
    return { view: World3D.view, n: World3D.schemaCount(), w: cv.width, h: cv.height, fail: document.querySelector('#w3fail').hidden };
  });
  ok(phone.view === 'schema' && phone.n >= 3 && phone.w > 200 && phone.h > 200 && phone.fail, 'phone schema view ' + JSON.stringify(phone));
  await ph.screenshot({ path: SHOT + '/schematic3d-phone.png' });
  ok(errs.length === 0, 'no phone errors ' + errs.join(' | '));
  await b.close();
  console.log('schematic3d e2e ok');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
