// v8: wires are easy to select/delete on a phone (390px, touch) and on desktop; long press menu, Ctrl+Z, end re-wiring, mobile sheets.
const { chromium } = require('playwright-core'); const assert = require('assert');
const URL = process.argv[2] || 'http://localhost:8765/';
const EX = 'ex:Пример: мигание светодиодом (ESP32)';
(async () => { const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' }); const errs = [];
  const mc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }); const pg = await mc.newPage();
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(URL); await pg.waitForTimeout(300);
  const v8 = await pg.evaluate(() => [...document.scripts].filter(s => s.src).every(s => /\?v=(8|9|10|11|12|13|14|14\.1|14\.2|14\.3|14\.4|14\.5|14\.5\.1|14\.5\.2|14\.5\.3|14\.5\.5|14\.5\.6|14\.5\.7|14\.5\.9|14\.6\.0|14\.6\.1|14\.6\.5|14\.7\.0)$/.test(s.src))); console.log('scripts ?v=8', v8); assert.ok(v8);
  const cdp = await mc.newCDPSession(pg);
  const load = async () => { await pg.selectOption('#projects', EX); await pg.waitForTimeout(250); };
  const mid = (id, f = 0.5) => pg.evaluate(([id, f]) => { const el = document.querySelector(`.whit[data-wire="${id}"]`), L = el.getTotalLength(), q = el.getPointAtLength(L * f), m = el.getScreenCTM(); return [q.x * m.a + m.e, q.y * m.d + m.f]; }, [id, f]);
  const pinXY = (p, pin) => pg.evaluate(([p, pin]) => { const r = document.querySelector(`.part[data-part="${p}"] .pin[data-pin="${pin}"]`).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, [p, pin]);
  const wires = () => pg.evaluate(() => window.__sim.proj.wires.map(w => w.id).join(','));
  const sel = () => pg.evaluate(() => window.__sim.sel && window.__sim.sel.wire);
  // layout: full-screen canvas + bottom bar with 44px buttons, sheets hidden
  const lay = await pg.evaluate(() => { const s = document.querySelector('#svg').getBoundingClientRect(), bar = [...document.querySelectorAll('#mbar button')].map(x => x.getBoundingClientRect().height).filter(h => h > 0); // portrait bar = Детали·Провод·Свойства·↩·↪·🗑
    return { w: s.width, h: s.height, bar, left: getComputedStyle(document.querySelector('#left')).display, sw: document.documentElement.scrollWidth }; });
  console.log('mobile layout', JSON.stringify(lay)); assert.ok(lay.w >= 380 && lay.h > 450 && lay.bar.length === 6 && lay.bar.every(h => h >= 44) && lay.left === 'none' && lay.sw <= 390);
  await pg.tap('#mParts'); assert.equal(await pg.evaluate(() => getComputedStyle(document.querySelector('#left')).display), 'block'); await pg.tap('#mParts');
  await load();
  // 1) tap beside the line (7px off, misses the 3px stroke) selects the wire; no floating #wireDel (menu stays closed). Delete is in «Свойства провода».
  let [x, y] = await mid('w1'); await pg.touchscreen.tap(x, y - 7); await pg.waitForTimeout(100);
  console.log('tap near wire -> sel', await sel()); assert.equal(await sel(), 'w1');
  const popped = await pg.evaluate(() => { const e = document.querySelector('#wireDel'); const m = document.querySelector('#ctxmenu'); const items = m && !m.hidden ? [...m.children].map(b => b.textContent) : []; return { wireDel: !!e, menuDel: items.some(t => /Удалить провод/.test(t)) }; });
  console.log('no popup delete', popped); assert.equal(popped.wireDel, false); assert.equal(popped.menuDel, false);
  if (await pg.evaluate(() => document.body.dataset.sheet !== 'props')) await pg.tap('#mProps');
  const del1 = await pg.$('#props #del'); assert.ok(del1); assert.match(await del1.textContent(), /Удалить провод/); await del1.tap(); await pg.waitForTimeout(100); console.log('after sheet delete', await wires()); assert.ok(!(await wires()).split(',').includes('w1'));
  // Ctrl+Z restores it
  await pg.keyboard.press('Control+z'); await pg.waitForTimeout(100); console.log('after Ctrl+Z', await wires()); assert.ok((await wires()).split(',').includes('w1'));
  // 2) the friend's flow: tap one end, tap the other end -> the existing wire is selected (no duplicate), Delete works
  await pg.tap('#mWire'); const n0 = (await wires()).split(',').length;
  let a = await pinXY('R1', 'a'), c = await pinXY('D1', 'a');
  await pg.touchscreen.tap(a[0] + 9, a[1] + 9); await pg.touchscreen.tap(c[0], c[1]); await pg.waitForTimeout(100);
  const s2 = await sel(), n1 = (await wires()).split(',').length; console.log('two end taps -> sel', s2, 'wires', n0, n1); assert.equal(s2, 'w2'); assert.equal(n1, n0);
  if (await pg.evaluate(() => document.body.dataset.sheet !== 'props')) await pg.tap('#mProps'); /* v12: selection auto-opens Свойства */ const pd = await pg.$('#props #del'); assert.ok(pd); await pd.tap(); await pg.waitForTimeout(100); await pg.tap('#mProps');
  console.log('props Удалить', await wires()); assert.ok(!(await wires()).split(',').includes('w2')); await pg.keyboard.press('Control+z'); await pg.waitForTimeout(100);
  // wire mode: empty-space tap adds a bend, then second pin finishes; Escape-free cancel button exists
  a = await pinXY('U1', '4'); await pg.touchscreen.tap(a[0], a[1]); assert.ok(await pg.evaluate(() => !document.querySelector('#wireCancel').hidden));
  await pg.touchscreen.tap(a[0] - 40, a[1] - 120); const pts = await pg.evaluate(() => window.__sim.armed && window.__sim.armed.pts.length); console.log('bend while drawing', pts); assert.equal(pts, 1);
  await pg.tap('#wireCancel'); assert.equal(await pg.evaluate(() => window.__sim.armed), null); await pg.tap('#mWire');
  // 3) outside wire mode: tap on a connected pin selects its wire, Delete key works
  c = await pinXY('D1', 'b'); console.log('at pin', c, await pg.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e ? (e.id || e.getAttribute('class')) : 'none'; }, c)); await pg.touchscreen.tap(c[0], c[1]); await pg.waitForTimeout(100); console.log('tap connected pin -> sel', await sel(), await pg.evaluate(() => JSON.stringify([window.__sim.wireMode, window.__sim.armed, window.__sim.proj.wires]))); assert.equal(await sel(), 'w3');
  await pg.keyboard.press('Delete'); await pg.waitForTimeout(100); assert.ok(!(await wires()).split(',').includes('w3')); await pg.keyboard.press('Control+z');
  // 4) long press on a wire -> menu with delete and bend; long press on a part -> rotate / duplicate
  const lpress = async (x, y) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); await pg.waitForTimeout(650); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await pg.waitForTimeout(100); };
  [x, y] = await mid('w1'); await lpress(x, y);
  let mi = await pg.evaluate(() => { const m = document.querySelector('#ctxmenu'); return m.hidden ? null : [...m.children].map(b => b.textContent); }); console.log('wire menu', mi); assert.ok(mi && mi.some(t => /Удалить провод/.test(t)) && mi.some(t => /изгиб/.test(t)));
  await pg.evaluate(() => [...document.querySelectorAll('#ctxmenu button')].find(b => /изгиб/.test(b.textContent)).click()); const bp = await pg.evaluate(() => window.__sim.proj.wires.find(w => w.id === 'w1').pts.length); assert.ok(bp >= 1);
  if (await pg.evaluate(() => document.body.dataset.sheet === 'props')) await pg.tap('#mProps'); // sheet covers the wire; menu delete is on the canvas
  [x, y] = await mid('w1', 0.62); await lpress(x, y);
  await pg.evaluate(() => [...document.querySelectorAll('#ctxmenu button')].find(b => /Удалить провод/.test(b.textContent)).click());
  console.log('menu delete', await wires()); assert.ok(!(await wires()).split(',').includes('w1'));
  await pg.evaluate(() => window.__sim.setUi({ holdMenu: true })); // component hold menu is off until «Меню по удержанию»
  const r = await pg.evaluate(() => { const e = document.querySelector('.part[data-part="R1"] .hit').getBoundingClientRect(); return [e.x + e.width / 2, e.y + e.height / 2]; }); await lpress(...r);
  mi = await pg.evaluate(() => [...document.querySelector('#ctxmenu').children].map(b => b.textContent)); console.log('part menu', mi); assert.ok(mi.some(t => /Повернуть/.test(t)) && mi.some(t => /Дублировать/.test(t)));
  const np = await pg.evaluate(() => window.__sim.proj.parts.length); await pg.evaluate(() => [...document.querySelectorAll('#ctxmenu button')].find(b => /Дублировать/.test(b.textContent)).click());
  assert.equal(await pg.evaluate(() => window.__sim.proj.parts.length), np + 1); await pg.screenshot({ path: '/tmp/v8-mobile.png' });
  // 5) breadboard wires: select & delete via tap; drag selected wire end to re-wire
  await pg.evaluate(() => { const P = window.__sim.proj, w = (id, a, ap, bb, bp) => ({ id, a: { part: a, pin: ap }, b: { part: bb, pin: bp }, pts: [] }); P.parts.length = 0; P.wires.length = 0;
    P.parts.push({ id: 'BB1', type: 'breadboard', x: 0, y: 120, rot: 0, props: {} }, { id: 'U1', type: 'esp32c3', x: 0, y: -120, rot: 0, props: {} });
    const pins = window.PARTS.breadboard.pins; P.wires.push(w('w1', 'U1', 'G5', 'BB1', pins[40].id), w('w2', 'U1', 'GND', 'BB1', pins[80].id)); window.__sim.render(); });
  [x, y] = await mid('w1'); console.log('bbat', x, y, await pg.evaluate(([x, y]) => document.elementsFromPoint(x, y).slice(0, 5).map(e => e.getAttribute('class') || e.tagName).join(','), [x + 6, y])); await pg.touchscreen.tap(x + 6, y); await pg.waitForTimeout(100); console.log('breadboard wire sel', await sel()); assert.equal(await sel(), 'w1');
  if (await pg.evaluate(() => document.body.dataset.sheet === 'props')) await pg.tap('#mProps'); // v12: close the auto-opened Свойства sheet (it covers the wire end)
  const end = await pg.evaluate(() => { const e = document.querySelector('.wend[data-end="b"]').getBoundingClientRect(); return [e.x + e.width / 2, e.y + e.height / 2]; });
  const tgt = await pinXY('U1', 'G6');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: end[0], y: end[1], id: 1 }] });
  for (let k = 1; k <= 5; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: end[0] + (tgt[0] - end[0]) * k / 5, y: end[1] + (tgt[1] - end[1]) * k / 5, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await pg.waitForTimeout(100);
  const rw = await pg.evaluate(() => window.__sim.proj.wires.find(w => w.id === 'w1').b); console.log('re-wired end', JSON.stringify(rw)); assert.deepEqual(rw, { part: 'U1', pin: 'G6' });
  [x, y] = await mid('w2'); console.log('w2at', await pg.evaluate(([x, y]) => document.elementsFromPoint(x, y).slice(0, 5).map(e => (e.id || e.getAttribute('class') || e.tagName) + (e.dataset && e.dataset.wire || '')).join(','), [x, y])); await pg.touchscreen.tap(x, y); await pg.waitForTimeout(100); console.log('w2sel', await sel());
  assert.equal(await pg.evaluate(() => !!document.querySelector('#wireDel')), false);
  if (await pg.evaluate(() => document.body.dataset.sheet !== 'props')) await pg.tap('#mProps');
  await (await pg.$('#props #del')).tap(); await pg.waitForTimeout(100); assert.equal(await wires(), 'w1');
  // desktop: right click offers bend and «Удалить провод»; no floating #wireDel. Sheet still has delete. Two clicks on the ends select instead of duplicating.
  const d = await b.newPage({ viewport: { width: 1400, height: 860 } }); d.on('pageerror', e => errs.push(e.message)); await d.goto(URL); await d.waitForTimeout(300);
  await d.selectOption('#projects', EX); await d.waitForTimeout(250);
  const dm = await d.evaluate(() => { const el = document.querySelector('.whit[data-wire="w1"]'), q = el.getPointAtLength(el.getTotalLength() / 2), m = el.getScreenCTM(); return [q.x * m.a + m.e, q.y * m.d + m.f]; });
  await d.mouse.click(dm[0], dm[1], { button: 'right' }); await d.waitForTimeout(100);
  const dmi = await d.evaluate(() => [...document.querySelector('#ctxmenu').children].map(b => b.textContent)); console.log('desktop right-click menu', dmi); assert.ok(dmi.some(t => /изгиб/.test(t)) && dmi.some(t => /Удалить провод/.test(t)));
  assert.equal(await d.evaluate(() => !!document.querySelector('#wireDel')), false);
  assert.match(await d.$eval('#props #del', e => e.textContent), /Удалить провод/);
  await d.click('#ctxmenu button.danger'); const dw = await d.evaluate(() => window.__sim.proj.wires.map(w => w.id)); assert.ok(!dw.includes('w1'));
  await d.keyboard.press('Control+z'); await d.waitForTimeout(100);
  const pxy = (p, pin) => d.evaluate(([p, pin]) => { const r = document.querySelector(`.part[data-part="${p}"] .pin[data-pin="${pin}"]`).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, [p, pin]);
  const p1 = await pxy('R1', 'a'), p2 = await pxy('D1', 'a'); await d.mouse.click(...p1); await d.mouse.click(...p2); await d.waitForTimeout(100);
  const ds = await d.evaluate(() => ({ s: window.__sim.sel && window.__sim.sel.wire, n: window.__sim.proj.wires.length })); console.log('desktop two-end click', ds); assert.ok(ds.s === 'w2' && ds.n === 3);
  await d.keyboard.press('Backspace'); assert.equal(await d.evaluate(() => window.__sim.proj.wires.length), 2);
  console.log('console errors', errs); assert.equal(errs.length, 0); await b.close(); console.log('V8 E2E OK'); })().catch(e => { console.error(e); process.exit(1); });
