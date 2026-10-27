// v14.5.9: «Мир датчиков» is not in the UI. «Схема 3D» still opens, runs, and leaves slider props alone.
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
  ok(await pg.evaluate(() => [...document.querySelectorAll('#rtabs button')].map(b => b.textContent).join() === 'Схема,Шасси,Трасса'), 'robot tabs unchanged');
  ok(await pg.evaluate(() => !!document.querySelector('#undo') && !!document.querySelector('#redo') && !!document.querySelector('#simMore') && !!document.querySelector('#setHold')), 'undo and hold-menu chrome still present');

  const gone = await pg.evaluate(() => {
    const texts = [...document.querySelectorAll('button')].map(b => b.textContent);
    const pal = [...document.querySelectorAll('#w3pal button')].map(b => ({ t: b.textContent, kind: b.dataset.kind || '', type: b.dataset.type || '', view: b.dataset.view || '' }));
    return {
      mir: texts.includes('Мир'),
      reset: !!document.querySelector('#w3reset'),
      pal,
      tab: document.querySelector('#w3tab').textContent
    };
  });
  ok(!gone.mir && !gone.reset && gone.tab === 'Схема 3D' && gone.pal.length === 1 && gone.pal[0].t === '▶ Запустить' && !gone.pal[0].kind && !gone.pal[0].type && !gone.pal[0].view, 'no Мир palette ' + JSON.stringify(gone));

  await pg.evaluate(() => {
    const p = __sim.proj;
    p.parts.push({ id: 'U2', type: 'hcsr04', x: 200, y: 0, rot: 0, props: { dist: 50 } });
    p.parts.push({ id: 'R9', type: 'ldr', x: 200, y: 80, rot: 0, props: { lux: 100 } });
    p.parts.push({ id: 'U3', type: 'dht22', x: 200, y: 160, rot: 0, props: { temp: 24, hum: 45 } });
    p.parts.push({ id: 'V9', type: 'vl53l0x', x: 200, y: 240, rot: 0, props: { mm: 300 } });
    p.parts.push({ id: 'P1', type: 'pir', x: 200, y: 320, rot: 0, props: { motion: false } });
    p.world3d = { sensors: [{ id: 's', kind: 'ultrasonic', x: 0, y: 80, z: 0 }], stimuli: [{ id: 't', type: 'block', x: 0, y: 80, z: -40 }] };
  });
  await pg.click('#w3tab'); await pg.waitForTimeout(400);
  const open = await pg.evaluate(() => {
    const h = __sim.proj.parts.find(p => p.type === 'hcsr04');
    const d = __sim.proj.parts.find(p => p.type === 'dht22');
    World3D.ensurePairs(__sim.proj);
    World3D.applyReadings(__sim.proj);
    World3D.setView('world');
    return {
      active: World3D.active,
      view: World3D.view,
      fail: document.querySelector('#w3fail').hidden,
      pane: !document.querySelector('#w3pane').hidden,
      wires: World3D.schemaWireCount(),
      n: World3D.schemaCount(),
      dist: h.props.dist,
      lux: __sim.proj.parts.find(p => p.type === 'ldr').props.lux,
      temp: d.props.temp,
      hum: d.props.hum,
      mm: __sim.proj.parts.find(p => p.type === 'vl53l0x').props.mm,
      motion: __sim.proj.parts.find(p => p.type === 'pir').props.motion,
      stim: __sim.proj.world3d && __sim.proj.world3d.stimuli ? __sim.proj.world3d.stimuli.length : -1
    };
  });
  ok(open.active && open.view === 'schema' && open.fail && open.pane && open.wires >= 3 && open.n >= 3, 'Схема 3D opens ' + JSON.stringify(open));
  ok(open.dist === 50 && open.lux === 100 && open.temp === 24 && open.hum === 45 && open.mm === 300 && open.motion === false && open.stim === 1, 'stimuli do not rewrite sensor props ' + JSON.stringify(open));
  await pg.screenshot({ path: SHOT + '/world3d.png' });

  await pg.click('#w3run'); await pg.waitForTimeout(350);
  const ran = await pg.evaluate(() => ({
    running: __sim.running,
    view: World3D.view,
    live: document.querySelector('#w3live').textContent,
    bar: document.querySelector('#w3run').textContent,
    dist: __sim.proj.parts.find(p => p.type === 'hcsr04').props.dist
  }));
  ok(ran.running && ran.view === 'schema' && /Симуляция/.test(ran.live) && /HC-SR04/.test(ran.live) && ran.bar === '■ Стоп' && ran.dist === 50, 'run stays in Схема 3D and keeps the slider ' + JSON.stringify(ran));
  await pg.click('#w3run'); await pg.waitForTimeout(150);
  ok(await pg.evaluate(() => !__sim.running && document.querySelector('#w3run').textContent === '▶ Запустить'), 'stop from Схема 3D');

  const loaded = await pg.evaluate(() => {
    const raw = JSON.parse(JSON.stringify(__sim.proj));
    raw.world3d = { sensors: [{ id: 's', kind: 'dht', x: 1, y: 2, z: 3 }], stimuli: [{ id: 'h', type: 'heat', x: 0, y: 0, z: 0 }], mesh: 'http://evil/a.glb' };
    const s = sanitizeProject(raw);
    return { world: s.world3d, http: JSON.stringify(s).includes('http'), dist: s.parts.find(p => p.id === 'U2').props.dist };
  });
  ok(loaded.world === undefined && !loaded.http && loaded.dist === 50, 'sanitize drops world3d ' + JSON.stringify(loaded));

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
  ok(await pg.evaluate(() => __sim.proj.parts.find(x => x.type === 'hcsr04').props.dist === 123), 'running sim leaves the distance slider alone');
  await pg.evaluate(() => __sim.stop());
  ok(errs.length === 0, 'no page errors ' + errs.join(' | '));
  ok(net.length === 0, 'no off-origin requests ' + net.join(' '));

  const mc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const ph = await mc.newPage();
  ph.on('pageerror', e => errs.push('phone ' + e.message));
  await ph.goto(URL); await ph.waitForTimeout(400);
  const tabs = await ph.evaluate(() => [...document.querySelectorAll('#pmTabs button')].filter(b => !b.hidden).map(b => b.textContent).join());
  ok(tabs === 'Схема,3D,Код', 'phone tabs ' + tabs);
  ok(await ph.evaluate(() => ![...document.querySelectorAll('#pmTabs button')].some(b => b.textContent === 'Мир')), 'phone has no Мир tab');
  await ph.tap('#pmTabs [data-ptab=world]'); await ph.waitForTimeout(400);
  const lay = await ph.evaluate(() => {
    const cv = document.querySelector('#w3cv').getBoundingClientRect();
    const btn = document.querySelector('#w3run').getBoundingClientRect();
    const kinds = document.querySelectorAll('#w3pal button[data-kind], #w3pal button[data-type], #w3pal button[data-view]').length;
    return { w: cv.width, h: cv.height, bh: btn.height, on: World3D.active, view: World3D.view, n: World3D.schemaCount(), fail: document.querySelector('#w3fail').hidden, kinds };
  });
  ok(lay.on && lay.view === 'schema' && lay.n >= 3 && lay.w > 200 && lay.h > 200 && lay.bh >= 44 && lay.fail && lay.kinds === 0, 'phone opens Схема 3D ' + JSON.stringify(lay));
  await ph.screenshot({ path: SHOT + '/world3d-phone.png' });
  ok(errs.length === 0, 'no phone errors ' + errs.join(' | '));
  await b.close();
  console.log('world3d e2e ok');
})().catch(e => { console.error('FAIL', e); process.exit(1); });
