// v13 «Любая машинка»: body shapes in mm, drive cards, free placement + 15° rotation, mass/CoM, unconnected «!» + ▶ hint,
// «Мои шасси» templates, collisions, MPU6050, tasks maze/avoid/park, new examples — on desktop and on a 390×844 portrait touch phone.
const { chromium } = require('playwright-core'); const assert = require('assert');
const URL = process.argv[2] || 'http://localhost:8765/';
const EXN = n => 'ex:Пример: ' + n;
async function device(b, phone) {
  const W = phone ? 390 : 1920, H = phone ? 844 : 1080, tag = phone ? '[phone 390×844]' : '[desktop]', errs = [];
  const ctx = await b.newContext(phone ? { viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: W, height: H } });
  const newPage = async () => { const pg = await ctx.newPage(); pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); pg.on('pageerror', e => errs.push(e.message)); await pg.goto(URL); await pg.waitForTimeout(400); return pg; };
  const pg = await newPage(), ev = (f, a) => pg.evaluate(f, a), ok = (c, m) => { assert.ok(c, tag + ' ' + m); console.log(tag, '✓', m); };
  const press = (s, p = pg) => phone ? p.tap(s) : p.click(s);
  const tab = async (k, p = pg) => { if (phone) await p.tap(`#pmTabs [data-ptab=${k}]`); else await p.click(`#rtabs [data-rtab="${k}"]`); await p.waitForTimeout(150); };
  const load = async (n, p = pg) => { if (phone) await p.tap('#pmTabs [data-ptab=schema]'); await p.selectOption('#projects', EXN(n)); await p.waitForTimeout(400); };
  const play = async (p = pg) => { if (phone) await p.tap('#pmPlay'); else await p.click('#rPlay'); };
  const robot = () => ev(() => __sim.proj.robot);
  ok(await ev(() => [...document.scripts].filter(s => s.src).every(s => /\?v=(13|14|14\.1|14\.2|14\.3|14\.4|14\.5|14\.5\.1|14\.5\.2|14\.5\.3|14\.5\.5|14\.5\.6|14\.5\.7|14\.5\.9|14\.6\.0)$/.test(s.src)) && !!window.Chassis), 'scripts ?v=13, chassis.js loaded');
  if (phone) ok(await ev(() => document.body.classList.contains('pm')), 'portrait phone UI');
  await load('Робот-машинка на трассе (простой)'); await tab('chassis');
  // 1) body: rect/round/poly sized in mm on a 5 mm grid
  await pg.selectOption('#rBody', 'rect'); await pg.fill('#rL', '213'); await pg.dispatchEvent('#rL', 'change'); await pg.fill('#rW', '152'); await pg.dispatchEvent('#rW', 'change');
  let r = await robot(); ok(r.body === 'rect' && r.size.l === 215 && r.size.w === 150, 'rect 213×152 → ' + r.size.l + '×' + r.size.w + ' мм (grid 5)');
  await pg.selectOption('#rBody', 'round'); await pg.fill('#rRr', '97'); await pg.dispatchEvent('#rRr', 'change'); r = await robot(); ok(r.body === 'round' && r.size.r === 95, 'circle r=95 мм');
  await pg.selectOption('#rBody', 'poly'); r = await robot(); const n0 = r.poly.length; await press('#rVAdd'); r = await robot();
  ok(r.body === 'poly' && r.poly.length === n0 + 1 && r.poly.every(p => p[0] % 5 === 0 && p[1] % 5 === 0), 'polygon ' + n0 + ' → ' + r.poly.length + ' vertices on the grid');
  await press('#rVDel'); ok((await robot()).poly.length === n0, '－ вершина');
  // 2) drive cards place empty slots
  const cards = await ev(() => [...document.querySelectorAll('#rDrives .rcard')].map(b => b.dataset.drive + ':' + b.textContent));
  ok(cards.join('|') === 'diff:2 колеса + опора|4wd:4WD|tracks:Гусеницы|steer:Рулевое как у машины|omni:Омни|mecanum:Меканум', 'six drive cards');
  for (const [d, n] of [['4wd', 4], ['tracks', 2], ['steer', 4], ['omni', 4], ['mecanum', 4], ['diff', 3]]) { await press(`#rDrives [data-drive="${d}"]`); r = await robot();
    ok(r.drive === d && r.wheels.length === n, `card ${d}: ${n} slots, ${r.wheels.filter(w => w.part).length} taken by motors`); }
  await press('#rDrives [data-drive="mecanum"]'); r = await robot(); ok(r.wheels.filter(w => !w.part).length >= 2, 'mecanum: empty slots shown (motors only snap when close)');
  // 3) free placement (drag), 15° rotation, ⊕ centre of mass + «Масса … г»
  const cvr = await ev(() => { const b = document.querySelector('#rcanvas').getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; });
  const toS = (x, y) => { const k = Math.min(cvr.w, cvr.h) / 340; return [cvr.x + cvr.w / 2 - y * k, cvr.y + cvr.h / 2 - x * k]; };
  const m0 = r.mounts.find(m => m.part === 'BT1'), [sx, sy] = toS(m0.x, m0.y), com = () => ev(() => Chassis.mass(__sim.proj.robot, __sim.proj.parts).x), c0 = await com();
  if (phone) { const cdp = await ctx.newCDPSession(pg), t = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await t('touchStart', sx, sy); for (let i = 1; i <= 8; i++) { await t('touchMove', sx, sy - 6 * i); await pg.waitForTimeout(16); } await t('touchEnd'); }
  else { await pg.mouse.move(sx, sy); await pg.mouse.down(); for (let i = 1; i <= 8; i++) await pg.mouse.move(sx, sy - 6 * i); await pg.mouse.up(); }
  await pg.waitForTimeout(200); r = await robot(); const m1 = r.mounts.find(m => m.part === 'BT1');
  ok(m1.x > m0.x + 20, 'battery dragged forward ' + m0.x + ' → ' + m1.x + ' мм'); ok(await ev(() => __sim.sel && __sim.sel.part) === 'BT1', 'selection linked to «Схема»');
  await press('#rRot'); await press('#rRot'); r = await robot(); ok(Math.round(r.mounts.find(m => m.part === 'BT1').dir * 180 / Math.PI) === 30, '⟳15° twice → 30°');
  const mass1 = await pg.textContent('#rMass'), c1 = await com(); ok(/Масса \d+ г/.test(mass1) && /⊕/.test(mass1) && c1 > c0, `«${mass1}», ⊕ moved forward ${c0} → ${c1} мм`);
  // ➕ На шасси: any part of the schematic
  await ev(() => { __sim.proj.parts.push({ id: 'U9', type: 'mpu6050', x: -300, y: 400, rot: 0, props: {} }); __sim.changed(); __sim.select('U9'); });
  await press('#rAdd'); r = await robot(); ok(r.mounts.some(m => m.part === 'U9'), '➕ На шасси places MPU6050');
  // 4) orange «!» + ▶ hint for unconnected chassis parts
  const un = await ev(() => RobotUI.uncon().map(u => u.part + ':' + u.why)); ok(un.some(u => u.startsWith('U9:')), '«!» on ' + un.join(', '));
  await ev(() => { __sim.proj.wires = __sim.proj.wires.filter(w => !/^w1[34]$/.test(w.id)); __sim.changed(); });
  await tab('track'); await play(); await pg.waitForTimeout(400); const hint = await pg.textContent('#rsum');
  ok(/Не подключено/.test(hint) && /M2 — мотор без драйвера/.test(hint) && /U9/.test(hint), 'hint: ' + hint.slice(0, 90)); await ev(() => __sim.stop ? __sim.stop() : document.getElementById('rReset').click());
  // 5) «Мои шасси»: save, reuse in another project, delete (names via textContent only)
  await tab('chassis'); await press('#rDrives [data-drive="tracks"]'); await pg.selectOption('#rBody', 'poly');
  const NAME = '  <b>Танк</b> ' + (phone ? 'P' : 'D') + '  ', CLEAN = NAME.trim(); await pg.fill('#rTplName', NAME); await press('#rTplSave'); await pg.waitForTimeout(100);
  const opts = await ev(() => [...document.querySelectorAll('#rTpl option')].map(o => o.textContent)); ok(opts.includes(CLEAN) && !(await ev(() => !!document.querySelector('#rTpl b'))), 'template saved as text «' + CLEAN + '»');
  const stored = await ev(k => JSON.parse(localStorage.getItem(k)), await ev(() => RobotUI.TPL_KEY)); ok(stored.length >= 1 && stored.every(t => !t.wheels.some(w => w.part)), 'stored without motor bindings');
  await load('4WD — парковка у стены'); await tab('chassis'); r = await robot(); ok(r.drive === '4wd' && r.body === 'rect', 'other project: 4WD rect');
  await pg.selectOption('#rTpl', CLEAN); await pg.waitForTimeout(150); r = await robot(); ok(r.drive === 'tracks' && r.body === 'poly' && r.wheels.length === 2, 'template applied: tracks + polygon');
  await press('#rTplDel'); ok(!(await ev(() => [...document.querySelectorAll('#rTpl option')].map(o => o.textContent))).includes(CLEAN), 'template deleted');
  // localStorage junk is cleaned on load
  await ev(k => { localStorage.setItem(k, JSON.stringify([...Array(70)].map((_, i) => ({ name: ' t' + i + ' ', body: 'poly', poly: [...Array(300)].map((_, j) => [j, 1e9]), drive: i % 2 ? 'warp' : '4wd' })))); RobotUI.refreshTpl(); }, await ev(() => RobotUI.TPL_KEY));
  ok(await ev(() => document.querySelectorAll('#rTpl option').length) === 51, '≤50 templates from localStorage');
  await ev(k => localStorage.removeItem(k), await ev(() => RobotUI.TPL_KEY)); await ev(() => RobotUI.refreshTpl());
  // 6..9) tasks & examples run in parallel pages
  const task = async (n, secs, f) => { const p = await newPage(); await load(n, p); await tab('track', p); await play(p); const t0 = Date.now(); let res;
    while (Date.now() - t0 < secs * 1000) { await p.waitForTimeout(500); res = await p.evaluate(f); if (res.stop) break; } await p.close(); return res; };
  const done = () => { const r = RobotUI.run; return { stop: !!(r.done), done: r.done, bumps: r.bumps, t: +r.t.toFixed(1) }; };
  const [park, avoid, maze, steer, mec, bump] = await Promise.all([
    task('4WD — парковка у стены', 20, done), task('Гусеницы — объезд препятствий', 45, done),
    task('Лабиринт (сонар + VL53 + гироскоп)', 90, () => { const r = RobotUI.run, g = __sim.proj.parts.find(p => p.id === 'U4'); window.__gz = Math.max(window.__gz || 0, Math.abs(g.props.gz || 0)); return { stop: !!r.done, done: r.done, gz: window.__gz, bumps: r.bumps }; }),
    task('Рулевое (серво) по линии', 25, () => { const r = RobotUI.run, s = __sim.proj.parts.find(p => p.id === 'M3'); window.__sa = Math.max(window.__sa || 0, Math.abs(r.steer)); return { stop: r.laps.length > 0, laps: r.laps.length, offs: r.offs, sa: window.__sa, a: s._mod && s._mod.a }; }),
    task('Меканум — едем боком', 2.6, () => { const c = RobotUI.run.car; return { stop: false, x: Math.round(c.x * 1000), y: Math.round(c.y * 1000), th: +c.th.toFixed(2) }; }),
    (async () => { const p = await newPage(); await load('4WD — парковка у стены', p); await p.evaluate(() => { const c = document.getElementById('code'); c.value = c.value.replace('else sp = 0;', 'else sp = 200;').replace('else if (cm > 11) sp = 70;', ''); __sim.proj.code = c.value; __sim.changed(); });
      await tab('track', p); await play(p); await p.waitForTimeout(5000); const o = await p.evaluate(() => ({ bumps: RobotUI.run.bumps, flash: RobotUI.run.flashT, done: RobotUI.run.done })); if (phone) await p.screenshot({ path: '/tmp/v13-phone-bump.png' }); await p.close(); return o; })()]);
  console.log(tag, JSON.stringify({ park, avoid, maze, steer, mec, bump }));
  ok(bump.bumps >= 1 && bump.flash > 0 && bump.done && !bump.done.ok, 'collision with the wall: 💥 ' + bump.bumps + ', flash, «' + bump.done.msg + '»');
  ok(park.done && park.done.ok, 'Парковка у стены: ' + park.done.msg); ok(avoid.done && avoid.done.ok && avoid.bumps === 0, 'Объезд препятствий: ' + (avoid.done && avoid.done.msg));
  ok(maze.done && maze.done.ok && maze.gz > 30, 'Лабиринт: ' + (maze.done && maze.done.msg) + ', MPU gz up to ' + maze.gz + ' °/s');
  ok(steer.laps >= 1 && steer.sa > 0.3, 'Рулевое: servo steers (' + steer.sa.toFixed(2) + ' рад), lap done');
  ok(Math.abs(mec.y - 450) > 100 && Math.abs(mec.th) < 0.15, 'Меканум: sideways to y=' + mec.y + ' without turning (th ' + mec.th + ')');
  // final screenshot: maze example on the chassis tab
  await load('Лабиринт (сонар + VL53 + гироскоп)'); await tab('chassis'); await pg.waitForTimeout(300);
  ok(await ev(() => document.documentElement.scrollWidth <= innerWidth), 'no horizontal scroll');
  await pg.screenshot({ path: phone ? '/tmp/v13-phone.png' : '/tmp/v13.png' });
  console.log(tag, 'errors', errs); assert.deepEqual(errs, []); await ctx.close();
}
(async () => { const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' }); await device(b, false); await device(b, true); await b.close(); console.log('v13 e2e ok'); })().catch(e => { console.error(e); process.exit(1); });
