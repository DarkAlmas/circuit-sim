// v11: «Плавная езда (ПИД)» — analog TCRT + PD; heading jitter on the oval vs the simple bang-bang car; live Kp/Kd/base sliders.
const { chromium } = require('playwright-core'); const assert = require('assert');
const URL = process.argv[2] || 'http://localhost:8765/';
const PID = 'ex:Пример: Плавная езда (ПИД)', SIMPLE = 'ex:Пример: Робот-машинка на трассе (простой)';
(async () => { const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' }); const errs = [];
  const page = async () => { const pg = await (await b.newContext({ viewport: { width: 1920, height: 1080 } })).newPage();
    pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); pg.on('pageerror', e => errs.push(e.message)); await pg.goto(URL); await pg.waitForTimeout(300); return pg; };
  const drive = async (pg, ex, secs) => { await pg.selectOption('#projects', ex); await pg.waitForTimeout(300); await pg.click('#rtabs [data-rtab="track"]'); await pg.click('#rPlay'); await pg.waitForTimeout(secs * 1000);
    return pg.evaluate(() => { const r = RobotUI.run; return { jit: +Robot.jitter(r.hd, 2).toFixed(3), offs: r.offs, laps: r.laps.map(l => +l.time.toFixed(1)), dist: Math.round(r.dist) }; }); };
  const [p1, p2] = [await page(), await page()];
  assert.ok(await p1.evaluate(() => [...document.scripts].filter(s => s.src).every(s => /\?v=(11|12|13|14|14\.1|14\.2)$/.test(s.src))));
  const [pid, simple] = await Promise.all([drive(p1, PID, 20), drive(p2, SIMPLE, 20)]);
  console.log('oval 20 s  PID', JSON.stringify(pid), ' simple', JSON.stringify(simple));
  assert.equal(pid.offs, 0, 'PID: no off-line'); assert.ok(pid.laps.length >= 1 && pid.laps.every(t => t < 14.6), 'PID lap faster than v9 (14.6 s)');
  assert.ok(pid.jit < 1.2, 'PID heading jitter ' + pid.jit); assert.ok(simple.jit > 2 * pid.jit, 'bang-bang wiggles much more');
  await p1.screenshot({ path: '/tmp/v11.png' });
  // sliders: visible only for the PID project, change driving immediately
  assert.ok(await p1.isVisible('#rTkp') && await p1.isVisible('#rTkd') && await p1.isVisible('#rTbase')); assert.ok(!(await p2.isVisible('#rTkp')));
  await p1.fill('#rTbase', '0'); await p1.dispatchEvent('#rTbase', 'input'); await p1.fill('#rTkp', '0'); await p1.dispatchEvent('#rTkp', 'input');
  assert.deepEqual(await p1.evaluate(() => __sim.proj.robot.tune), { kp: 0, kd: 150, base: 0 });
  await p1.waitForTimeout(1500); const d0 = await p1.evaluate(() => RobotUI.run.dist); await p1.waitForTimeout(1000); const d1 = await p1.evaluate(() => RobotUI.run.dist);
  console.log('base=0, Kp=0 → moved in 1 s', Math.round(d1 - d0), 'mm'); assert.ok(d1 - d0 < 20, 'car stops when base=0');
  await p1.fill('#rTbase', '180'); await p1.dispatchEvent('#rTbase', 'input'); await p1.fill('#rTkp', '25'); await p1.dispatchEvent('#rTkp', 'input');
  await p1.waitForTimeout(1500); const d2 = await p1.evaluate(() => RobotUI.run.dist); assert.ok(d2 - d1 > 200, 'drives again');
  // tune survives save → sanitize → reload
  await p1.evaluate(() => { __sim.proj.robot.tune.kd = 1e9; __sim.changed(); }); await p1.reload(); await p1.waitForTimeout(400);
  const tu = await p1.evaluate(() => __sim.proj.robot && __sim.proj.robot.tune); console.log('after reload', JSON.stringify(tu)); assert.ok(tu && tu.kd <= 300);
  console.log('errors', errs); assert.deepEqual(errs, []); await b.close(); console.log('v11 e2e ok');
})().catch(e => { console.error(e); process.exit(1); });
