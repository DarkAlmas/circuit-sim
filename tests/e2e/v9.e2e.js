// v9: «Робот-машинка» — tabs Схема/Шасси/Трасса, chassis↔schematic selection link, car drives the oval by the ESP32 sketch; desktop + 390px touch phone.
const { chromium } = require('playwright-core'); const assert = require('assert');
const URL = process.argv[2] || 'http://localhost:8765/';
const EX = 'ex:Пример: Робот-машинка на трассе (простой)';
(async () => { const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' }); const errs = [];
  const watch = pg => { pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); pg.on('pageerror', e => errs.push(e.message)); };
  /* ---- desktop 1920×1080 ---- */
  const pg = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage(); watch(pg);
  await pg.goto(URL); await pg.waitForTimeout(300);
  assert.ok(await pg.evaluate(() => [...document.scripts].filter(s => s.src).every(s => /\?v=(9|10|11|12|13|14|14\.1|14\.2|14\.3|14\.4|14\.5|14\.5\.1|14\.5\.2|14\.5\.3|14\.5\.5|14\.5\.6|14\.5\.7|14\.5\.9|14\.6\.0)$/.test(s.src)) && !!window.Robot && !!window.RobotUI));
  assert.ok(await pg.evaluate(() => document.querySelector('#rtabs').hidden), 'tabs hidden for non-car projects');
  // new-project card exists
  await pg.click('#new'); assert.ok(await pg.isVisible('.ncard[data-kind="car"]')); await pg.click('#newClose');
  await pg.selectOption('#projects', EX); await pg.waitForTimeout(300);
  const tabs = await pg.evaluate(() => [...document.querySelectorAll('#rtabs button')].map(x => x.textContent)); console.log('tabs', tabs); assert.deepEqual(tabs, ['Схема', 'Шасси', 'Трасса']);
  assert.equal(await pg.evaluate(() => RobotUI.tab), 'chassis');
  // chassis: click the left wheel (M1 at x=0,y=72 mm) -> selects M1 in the schematic
  const cvb = await pg.evaluate(() => { const r = document.querySelector('#rcanvas').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
  const k = Math.min(cvb[2], cvb[3]) / 340; await pg.mouse.click(cvb[0] + cvb[2] / 2 - 72 * k, cvb[1] + cvb[3] / 2); await pg.waitForTimeout(100);
  console.log('chassis click -> sel', await pg.evaluate(() => __sim.sel && __sim.sel.part)); assert.equal(await pg.evaluate(() => __sim.sel && __sim.sel.part), 'M1');
  // drag S1 sensor a bit forward and see the mount move
  await pg.mouse.move(cvb[0] + cvb[2] / 2 - 13 * k, cvb[1] + cvb[3] / 2 - 78 * k); await pg.mouse.down(); await pg.mouse.move(cvb[0] + cvb[2] / 2 - 13 * k, cvb[1] + cvb[3] / 2 - 84 * k, { steps: 4 }); await pg.mouse.up();
  const s1 = await pg.evaluate(() => __sim.proj.robot.mounts.find(m => m.part === 'S1')); console.log('S1 mount', JSON.stringify(s1)); assert.ok(s1.x >= 82);
  await pg.evaluate(() => { const m = __sim.proj.robot.mounts.find(m => m.part === 'S1'); m.x = 78; m.y = 13; __sim.changed(); });
  // body / material controls
  await pg.selectOption('#rBody', 'round'); await pg.selectOption('#rMat', 'black'); assert.deepEqual(await pg.evaluate(() => [__sim.proj.robot.body, __sim.proj.robot.mat]), ['round', 'black']);
  await pg.selectOption('#rBody', 'rect'); await pg.selectOption('#rMat', 'acrylic');
  // schematic: select S2 there, chassis highlights the same part
  await pg.click('#rtabs [data-rtab="schema"]'); assert.ok(await pg.evaluate(() => document.querySelector('#rpane').hidden));
  await pg.evaluate(() => __sim.select('S2')); await pg.click('#rtabs [data-rtab="chassis"]'); assert.equal(await pg.evaluate(() => __sim.sel.part), 'S2');
  // track: presets, run, the car follows the oval by itself
  await pg.click('#rtabs [data-rtab="track"]'); await pg.waitForTimeout(100);
  const pres = await pg.evaluate(() => [...document.querySelectorAll('#rPreset option')].map(o => o.textContent).slice(1, 5)); console.log('presets', pres); assert.deepEqual(pres, ['Овал', 'Восьмёрка', 'Зигзаг', 'С перекрёстком']);
  await pg.click('#rPlay'); await pg.waitForTimeout(9000);
  const st = await pg.evaluate(() => { const r = RobotUI.run; return { dist: Math.round(r.dist), offs: r.offs, trail: r.trail.length, on: r.trail.filter(q => q[2]).length, rpm: [Math.round(r.rpmL), Math.round(r.rpmR)], refl: __sim.proj.parts.filter(p => p.type === 'tcrt5000').map(p => p.props.refl), laps: r.laps.length }; });
  console.log('after 9 s', JSON.stringify(st)); assert.ok(st.dist > 1500, 'car drove'); assert.ok(st.on / st.trail > 0.8, 'mostly on the line'); assert.ok(st.rpm[0] > 0 || st.rpm[1] > 0);
  await pg.screenshot({ path: '/tmp/v9.png' });
  await pg.click('#rPause'); await pg.waitForTimeout(200); const sm = await pg.textContent('#rsum'); console.log('summary', sm); assert.match(sm, /сходов/);
  await pg.click('#rReset'); assert.equal(await pg.evaluate(() => RobotUI.run.trail.length), 0);
  // boxes + distance sensor raycast (pure API)
  assert.equal(await pg.evaluate(() => Robot.raycast(100, 700, 0, [{ x: 600, y: 700, w: 100, h: 100 }])), 452);
  await pg.click('#stop');
  /* ---- phone 390px touch ---- */
  const mc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); const mp = await mc.newPage(); watch(mp);
  await mp.goto(URL); await mp.waitForTimeout(300); await mp.selectOption('#projects', EX); await mp.waitForTimeout(300);
  assert.equal(await mp.evaluate(() => RobotUI.tab), 'track');
  const lay = await mp.evaluate(() => { const c = document.querySelector('#rcanvas').getBoundingClientRect(); return { w: c.width, h: c.height, sw: document.documentElement.scrollWidth, btn: [...document.querySelectorAll('#rTrBar button, #pmTabs button:not([hidden])')].map(x => x.getBoundingClientRect().height) }; });
  console.log('phone layout', JSON.stringify(lay)); assert.ok(lay.w >= 380 && lay.h > 350 && lay.sw <= 390 && lay.btn.every(h => h >= 44));
  // brush a stroke with a finger
  await mp.tap('#rBrush'); const n0 = await mp.evaluate(() => __sim.proj.robot.track.strokes.length);
  const c = await mp.evaluate(() => { const r = document.querySelector('#rcanvas').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  const cdp = await mc.newCDPSession(mp), tp = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y }] });
  await tp('touchStart', c[0] - 60, c[1]); for (let i = 1; i <= 8; i++) await tp('touchMove', c[0] - 60 + i * 15, c[1] + i * 3); await tp('touchEnd'); await mp.waitForTimeout(150);
  const s2 = await mp.evaluate(() => { const s = __sim.proj.robot.track.strokes; return [s.length, s[s.length - 1].length]; }); console.log('brush stroke', s2); assert.ok(s2[0] === n0 + 1 && s2[1] >= 5);
  await mp.tap('#rBrush');
  // schematic & code as bottom sheets over the track
  await mp.tap('#pmTabs [data-ptab=code]'); assert.equal(await mp.evaluate(() => getComputedStyle(document.querySelector('#codePane')).display !== 'none' && document.body.dataset.sheet), 'code'); await mp.tap('#pmTabs [data-ptab=track]'); // v12: portrait tabs replace #mCode
  await mp.tap('#rPlay'); await mp.waitForTimeout(3000); const md = await mp.evaluate(() => RobotUI.run.dist); console.log('phone drive mm', Math.round(md)); assert.ok(md > 300);
  await mp.screenshot({ path: '/tmp/v9-phone.png' });
  // import sanitization of robot fields
  const bad = await mp.evaluate(() => { const p = sanitizeProject({ parts: [{ id: 'M1', type: 'ttmotor' }], wires: [], kind: 'car', robot: { body: '<img>', mat: 1, mounts: [{ part: 'M1', x: 1e9 }, { part: 'zz' }], track: { preset: 'x', w: 999, strokes: [[[1, 2], ['a', 3], [5e9, -4]]] }, obstacles: Array(99).fill({ x: 1, y: 1, w: 1, h: 1 }), speed: 99 } }); return p.robot; });
  console.log('sanitized', JSON.stringify(bad).slice(0, 200)); assert.equal(bad.body, 'rect'); assert.equal(bad.mounts.length, 1); assert.equal(bad.mounts[0].x, 150); assert.equal(bad.track.w, 40); assert.deepEqual(bad.track.strokes[0], [[1, 2], [2000, 0]]); assert.equal(bad.obstacles.length, 30); assert.equal(bad.speed, 4);
  console.log('errors', errs); assert.equal(errs.length, 0); await b.close(); console.log('v9 e2e OK');
})().catch(e => { console.error(e); process.exit(1); });
