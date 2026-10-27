// v14: wire sheet, bends, pin labels, Uno+HC-SR04, LED reverse text, ESP32-C3 burn, unique 56×56 catalog thumbs.
const { chromium } = require('playwright-core'); const assert = require('assert');
const URL = process.argv[2] || 'http://localhost:8765/';
const SHOT = process.argv[3] || '/tmp';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const pg = await b.newPage({ viewport: { width: 1400, height: 860 } }); const errs = [];
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (/Content Security Policy|Refused/i.test(m.text())) errs.push(m.text()); });
  await pg.goto(URL); await pg.evaluate(() => localStorage.clear()); await pg.reload(); await pg.waitForTimeout(300);
  const ok = (c, m) => { assert.ok(c, m); console.log('✓', m); };
  ok(await pg.evaluate(() => [...document.scripts].filter(s => s.src).every(s => /\?v=14\.6\.6$/.test(s.src))), 'scripts ?v=14.6.6');

  const thumbs = await pg.evaluate(() => {
    const items = [...document.querySelectorAll('#palette .item')];
    const html = items.map(it => { const s = it.querySelector('svg.thumb'); return s ? s.outerHTML : ''; });
    const names = items.map(it => it.querySelector('.nm') && it.querySelector('.nm').textContent);
    return { n: items.length, parts: Object.keys(PARTS).length, ico: document.querySelectorAll('#palette .ico').length,
      emoji: items.some(it => { const c = it.cloneNode(true); const nm = c.querySelector('.nm'); if (nm) nm.remove(); return /[\u{1F300}-\u{1FAFF}]/u.test(c.textContent); }), missing: html.filter(h => !h).length,
      unique: new Set(html).size, beside: items.every(it => it.querySelector('svg.thumb') && it.querySelector('.nm')),
      w: items[0] && items[0].querySelector('svg.thumb').getBoundingClientRect().width,
      hcsr: (document.querySelector('#palette .item[data-type="hcsr04"] svg.thumb') || {}).textContent || '',
      li: (document.querySelector('#palette .item[data-type="liion"] svg.thumb') || {}).textContent || '',
      names };
  });
  ok(thumbs.n === thumbs.parts && thumbs.n > 40, 'every catalog part has a row (' + thumbs.n + ')');
  ok(thumbs.ico === 0 && !thumbs.emoji && thumbs.missing === 0, 'no shared group icons');
  ok(thumbs.unique === thumbs.n && thumbs.beside, 'each thumb is unique and sits with the name');
  ok(Math.abs(thumbs.w - 56) < 1, 'thumb is 56px (' + thumbs.w + ')');
  ok(!/Vcc|Trig|Echo|Gnd/.test(thumbs.hcsr) && /\+/.test(thumbs.li) && /−/.test(thumbs.li), 'HC-SR04 thumb has no pin names; Li-ion keeps +/−');
  await pg.fill('#search', 'светодиод');
  const searched = await pg.evaluate(() => { const it = document.querySelector('#palette .item'); const cs = getComputedStyle(document.querySelector('#palette'));
    return { thumb: !!it.querySelector('svg.thumb'), name: it.querySelector('.nm').textContent, cols: cs.gridTemplateColumns }; });
  ok(searched.thumb && /светодиод/i.test(searched.name) && !searched.cols.includes('repeat(1'), 'search keeps the thumb beside the name');
  await pg.fill('#search', '');
  await pg.screenshot({ path: SHOT + '/v14-palette.png' });

  await pg.selectOption('#projects', 'ex:Пример: Uno и HC-SR04'); await pg.waitForTimeout(400);
  const labels = await pg.evaluate(() => document.querySelector('[data-part="U2"] .art').textContent);
  ok(/Vcc/.test(labels) && /Trig/.test(labels) && /Echo/.test(labels) && /Gnd/.test(labels), 'HC-SR04 pin labels on the canvas');
  await pg.evaluate(() => { const p = { id: 'BT1', type: 'liion', x: 400, y: 200, rot: 0, props: { soc: 80 } }; __sim.proj.parts.push(p); __sim.changed(); });
  await pg.waitForTimeout(100);
  ok(await pg.evaluate(() => /\+/.test(document.querySelector('[data-part="BT1"] .art').textContent) && /−/.test(document.querySelector('[data-part="BT1"] .art').textContent)), '103450 shows + and −');

  const mid = await pg.evaluate(() => { const el = document.querySelector('[data-wire="w1"].wire'), L = el.getTotalLength(), q = el.getPointAtLength(L / 2), t = el.getScreenCTM(); return { x: q.x * t.a + t.e, y: q.y * t.d + t.f }; });
  await pg.mouse.click(mid.x, mid.y); await pg.waitForTimeout(150);
  const sheet = await pg.evaluate(() => ({ title: document.querySelector('#wireTitle') && document.querySelector('#wireTitle').textContent, del: document.querySelectorAll('#props #del').length, delText: document.querySelector('#props #del').textContent, colors: [...document.querySelectorAll('[data-wcolor]')].map(b => b.dataset.wcolor) }));
  ok(sheet.title === 'Свойства провода' && sheet.del === 1 && sheet.delText === 'Удалить провод', 'wire sheet, one delete');
  const extra = await pg.evaluate(() => ({ wireDel: !!document.querySelector('#wireDel'), labels: [...document.querySelectorAll('button')].filter(b => /Удалить провод/.test(b.textContent)).map(b => b.id) }));
  ok(!extra.wireDel && extra.labels.length === 1 && extra.labels[0] === 'del', 'no floating Удалить провод');
  await pg.mouse.click(mid.x, mid.y, { button: 'right' }); await pg.waitForTimeout(100);
  const menu = await pg.evaluate(() => { const m = document.querySelector('#ctxmenu'); return m && !m.hidden ? [...m.children].map(b => b.textContent) : []; });
  ok(menu.some(t => /изгиб/.test(t)) && menu.some(t => /Удалить провод/.test(t)), 'right-click menu has delete and bend');
  await pg.keyboard.press('Escape');
  ok(sheet.colors.join() === 'красный,чёрный,синий,зелёный,жёлтый,белый', 'six wire colors');
  await pg.click('[data-wcolor="синий"]'); await pg.waitForTimeout(100);
  ok(await pg.evaluate(() => document.querySelector('[data-wire="w1"].wire').getAttribute('stroke')) === '#4c7dff', 'wire turns blue');
  await pg.mouse.dblclick(mid.x, mid.y); await pg.waitForTimeout(150);
  const n1 = await pg.evaluate(() => (__sim.proj.wires.find(w => w.id === 'w1').pts || []).length);
  ok(n1 >= 1, 'double-click adds a bend');
  const bend = await pg.evaluate(m => { let best = null, bd = 1e9; for (const el of document.querySelectorAll('.bend')) { const r = el.getBoundingClientRect(), cx = r.x + r.width / 2, cy = r.y + r.height / 2, d = Math.hypot(cx - m.x, cy - m.y); if (d < bd) { bd = d; best = { x: cx, y: cy }; } } return best; }, mid);
  await pg.mouse.dblclick(bend.x, bend.y); await pg.waitForTimeout(200);
  const n2 = await pg.evaluate(() => { const w = __sim.proj.wires.find(x => x.id === 'w1'); return w ? (w.pts || []).length : -1; });
  ok(n2 >= 0 && n2 < n1, 'double-click removes the bend (' + n2 + ' < ' + n1 + ')');
  await pg.click('#props #del'); await pg.waitForTimeout(100);
  ok(await pg.evaluate(() => !__sim.proj.wires.some(w => w.id === 'w1')), 'sheet deletes the wire');

  await pg.evaluate(() => { const ex = EXAMPLES['Пример: Uno и HC-SR04']; __sim.stop(); const p = __sim.proj; p.parts = JSON.parse(JSON.stringify(ex.parts)); p.wires = JSON.parse(JSON.stringify(ex.wires)); p.code = ex.code; document.querySelector('#code').value = ex.code; __sim.changed(); });
  await pg.click('#run'); await pg.waitForTimeout(1800);
  const happy = await pg.evaluate(() => document.querySelector('#console').textContent);
  ok(/расстояние 87 см/.test(happy) && !/не подключён/.test(happy), 'Uno + HC-SR04 prints 87 cm');
  await pg.click('#stop');
  await pg.evaluate(() => { const p = __sim.proj; p.wires = p.wires.filter(w => w.b.pin !== 'ECHO' && w.a.pin !== 'ECHO'); __sim.changed(); });
  await pg.click('#run'); await pg.waitForTimeout(1500);
  const bad = await pg.evaluate(() => ({ t: document.querySelector('#console').textContent, err: !!document.querySelector('#console .err') }));
  ok(bad.err && /HC-SR04 не подключён/.test(bad.t) && !/расстояние/.test(bad.t), 'wrong wiring fails honestly');
  await pg.click('#stop');

  const rev = { parts: [{ id: 'V1', type: 'dc', x: 200, y: 300, rot: 0, props: { V: 5, rInt: 0.1 } }, { id: 'R1', type: 'resistor', x: 340, y: 200, rot: 0, props: { R: 220, Pmax: 0.25 } }, { id: 'D1', type: 'led', x: 480, y: 200, rot: 0, props: { color: 'красный', Vf: 1.8, Imax: 0.02 } }],
    wires: [{ id: 'w1', a: { part: 'V1', pin: 'p' }, b: { part: 'R1', pin: 'a' } }, { id: 'w2', a: { part: 'R1', pin: 'b' }, b: { part: 'D1', pin: 'b' } }, { id: 'w3', a: { part: 'D1', pin: 'a' }, b: { part: 'V1', pin: 'n' } }] };
  await pg.evaluate(j => { const p = __sim.proj; p.parts = j.parts; p.wires = j.wires; p.code = ''; __sim.changed(); }, rev);
  await pg.click('#run'); await pg.waitForTimeout(700);
  const led = await pg.evaluate(() => document.querySelector('[data-part="D1"] .art').textContent);
  ok(/обратное включение/.test(led), 'reverse LED shows the warning');
  await pg.click('#stop');

  const burn = { parts: [{ id: 'U1', type: 'esp32c3', x: 200, y: 200, rot: 0 }, { id: 'V1', type: 'dc', x: 500, y: 200, rot: 0, props: { V: 5, rInt: 0.1 } }],
    wires: [{ id: 'w1', a: { part: 'V1', pin: 'p' }, b: { part: 'U1', pin: 'G5' } }, { id: 'w2', a: { part: 'V1', pin: 'n' }, b: { part: 'U1', pin: 'GND' } }] };
  await pg.evaluate(j => { const p = __sim.proj; p.parts = j.parts; p.wires = j.wires; p.code = ''; __sim.changed(); }, burn);
  await pg.click('#run'); await pg.waitForTimeout(800);
  const smoked = await pg.evaluate(() => ({ burned: !!document.querySelector('[data-part="U1"].burned'), smoke: document.querySelectorAll('[data-part="U1"] .smoke').length, err: document.querySelector('#console .err') && document.querySelector('#console .err').textContent }));
  ok(smoked.burned && smoked.smoke >= 1 && /Плата сгорела: .+ В на GPIO5/.test(smoked.err || ''), 'ESP32-C3 burns, smoke, red console line');
  await pg.screenshot({ path: SHOT + '/v14-burn.png' });
  await pg.click('#stop');

  const phone = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const pp = await phone.newPage(); await pp.goto(URL); await pp.waitForTimeout(400);
  await pp.evaluate(() => { const p = __sim.proj; p.parts.length = 0; p.wires.length = 0; __sim.changed(); });
  await pp.tap('#mParts'); await pp.fill('#search', 'резист');
  const cols = await pp.evaluate(() => getComputedStyle(document.querySelector('#palette')).gridTemplateColumns.split(' ').length);
  const still = await pp.evaluate(() => { const it = document.querySelector('#palette .item'); return { cols: getComputedStyle(document.querySelector('#palette')).gridTemplateColumns.split(' ').length, thumb: !!it.querySelector('svg.thumb'), name: !!it.querySelector('.nm') }; });
  ok(cols === 4 && still.cols === 4 && still.thumb && still.name, 'portrait search stays 4 columns with a thumb');
  await pp.screenshot({ path: SHOT + '/v14-palette-phone.png' });

  assert.deepEqual(errs, [], errs.join('\n'));
  await b.close();
  console.log('v14 e2e ok');
})().catch(e => { console.error(e); process.exit(1); });
