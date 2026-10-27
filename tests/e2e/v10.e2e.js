// v10: Devices.car rangers — rotate handle / #rDir, ray hits a box, ⟲ На старт = car.reset(), drag the car to set the start.
const { chromium } = require('playwright-core'); const assert = require('assert');
const URL = process.argv[2] || 'http://localhost:8765/';
const EX = 'ex:Пример: Робот-машинка на трассе (простой)';
(async () => { const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' }); const errs = [];
  const pg = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(URL); await pg.waitForTimeout(300);
  assert.ok(await pg.evaluate(() => [...document.scripts].filter(s => s.src).every(s => /\?v=(10|11|12|13|14|14\.1|14\.2|14\.3|14\.4|14\.5|14\.5\.1|14\.5\.2|14\.5\.3|14\.5\.5|14\.5\.6|14\.5\.7|14\.5\.9|14\.6\.0|14\.6\.1|14\.6\.5|14\.6\.7)$/.test(s.src))));
  await pg.selectOption('#projects', EX); await pg.waitForTimeout(300);
  // add a VL53L0X mounted at the nose, looking forward
  await pg.evaluate(() => { const p = __sim.proj; p.parts.push({ id: 'L1', type: 'vl53l0x', x: -320, y: 300, rot: 0, props: {} }); p.robot.mounts.push({ part: 'L1', x: 90, y: 0 }); __sim.changed(); __sim.select('L1'); });
  await pg.click('#rtabs [data-rtab="chassis"]'); await pg.waitForTimeout(150);
  assert.ok(await pg.isVisible('#rDir'), '#rDir shown for a distance sensor');
  // rotate handle: at body (90 + 60, 0); chassis screen = centre + (-y·k, -x·k); drag it to the left side (body +y)
  const cvb = await pg.evaluate(() => { const r = document.querySelector('#rcanvas').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; });
  const k = Math.min(cvb[2], cvb[3]) / 340, cx = cvb[0] + cvb[2] / 2, cy = cvb[1] + cvb[3] / 2, S = (bx, by) => [cx - by * k, cy - bx * k];
  await pg.mouse.move(...S(150, 0)); await pg.mouse.down(); await pg.mouse.move(...S(110, 40), { steps: 3 }); await pg.mouse.move(...S(90, 60), { steps: 3 }); await pg.mouse.up();
  const d1 = await pg.evaluate(() => __sim.proj.robot.mounts.find(m => m.part === 'L1').dir); console.log('dir after rotate drag', d1); assert.ok(Math.abs(d1 - Math.PI / 2) < 0.02);
  assert.equal(await pg.inputValue('#rDir'), '90');
  await pg.fill('#rDir', '0'); await pg.dispatchEvent('#rDir', 'change');
  assert.ok(!(await pg.evaluate(() => __sim.proj.robot.mounts.find(m => m.part === 'L1').dir)), 'dir 0 via input');
  // track: box right in front of the start, the forward ray must hit it
  await pg.click('#rtabs [data-rtab="track"]'); await pg.waitForTimeout(150);
  await pg.evaluate(() => { const r = __sim.proj.robot, s = r.track.start; r.obstacles.push({ x: Math.round(s.x + Math.cos(s.th) * 400), y: Math.round(s.y + Math.sin(s.th) * 400), w: 100, h: 100 }); __sim.changed(); });
  await pg.click('#rPlay'); await pg.waitForTimeout(400); await pg.click('#rPause'); await pg.waitForTimeout(100);
  const ray = await pg.evaluate(() => { const d = RobotUI.run.car.dist[0]; return { hit: d.hit, d: d.d, mm: __sim.proj.parts.find(p => p.id === 'L1').props.mm }; });
  console.log('ray', JSON.stringify(ray)); assert.ok(ray.hit && ray.d < 0.4 && Math.abs(ray.mm - ray.d * 1000) < 5);
  // reset returns to the start
  const st0 = await pg.evaluate(() => ({ ...__sim.proj.robot.track.start }));
  await pg.click('#rReset'); const c0 = await pg.evaluate(() => { const c = RobotUI.run.car; return [c.x * 1000, c.y * 1000, RobotUI.run.dist]; });
  console.log('after reset', c0, st0); assert.ok(Math.abs(c0[0] - st0.x) < 1 && Math.abs(c0[1] - st0.y) < 1 && c0[2] === 0);
  // drag the car while paused -> new start; reset goes back there
  const tb = await pg.evaluate(() => { const r = document.querySelector('#rcanvas').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
  await pg.mouse.move(tb[0], tb[1]); await pg.mouse.down(); await pg.mouse.move(tb[0] + 40, tb[1] + 30, { steps: 5 }); await pg.mouse.up(); await pg.waitForTimeout(100);
  const st1 = await pg.evaluate(() => ({ ...__sim.proj.robot.track.start })); console.log('new start', st1); assert.ok(st1.x !== st0.x || st1.y !== st0.y);
  await pg.click('#rPlay'); await pg.waitForTimeout(500); await pg.click('#rPause'); await pg.click('#rReset');
  const c1 = await pg.evaluate(() => [RobotUI.run.car.x * 1000, RobotUI.run.car.y * 1000]); assert.ok(Math.abs(c1[0] - st1.x) < 1 && Math.abs(c1[1] - st1.y) < 1, 'reset to dragged start');
  // restore and drive a bit for the screenshot with rays
  await pg.evaluate(() => { const r = __sim.proj.robot; r.track.start.x = 0; }); await pg.selectOption('#projects', EX); await pg.waitForTimeout(300);
  await pg.evaluate(() => { const p = __sim.proj; p.parts.push({ id: 'L1', type: 'vl53l0x', x: -320, y: 300, rot: 0, props: {} }); p.robot.mounts.push({ part: 'L1', x: 90, y: 0 }); p.robot.obstacles.push({ x: 1000, y: 700, w: 160, h: 160 }); __sim.changed(); });
  await pg.click('#rtabs [data-rtab="track"]'); await pg.click('#rPlay'); await pg.waitForTimeout(6000);
  const run = await pg.evaluate(() => ({ dist: Math.round(RobotUI.run.dist), offs: RobotUI.run.offs })); console.log('6 s drive', JSON.stringify(run)); assert.ok(run.dist > 1000);
  await pg.screenshot({ path: '/tmp/v10.png' });
  console.log('errors', errs); assert.deepEqual(errs, []); await b.close(); console.log('v10 e2e ok');
})().catch(e => { console.error(e); process.exit(1); });
