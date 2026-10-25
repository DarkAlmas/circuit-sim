// Settings UI: hold menu defaults off, three controls, prefs persist, junk localStorage is dropped. ?v=14.3.
const { chromium } = require('playwright-core'); const assert = require('assert');
const URL = process.argv[2] || 'http://localhost:8765/';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const errs = [];
  const pg = await b.newPage({ viewport: { width: 1400, height: 860 } });
  pg.on('pageerror', e => errs.push(e.message));
  pg.on('console', m => { if (/Content Security Policy|Refused/i.test(m.text())) errs.push(m.text()); });
  await pg.goto(URL); await pg.evaluate(() => localStorage.clear()); await pg.reload(); await pg.waitForTimeout(300);
  const ok = (c, m) => { assert.ok(c, m); console.log('✓', m); };

  ok(await pg.evaluate(() => [...document.scripts].every(s => !s.src || /\?v=14\.3$/.test(s.src)) && /style\.css\?v=14\.3/.test(document.querySelector('link[rel=stylesheet]').href)), 'cache stays ?v=14.3');
  const csp = await pg.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content);
  ok(csp.startsWith("default-src 'self'") && csp.includes("script-src 'self'") && !/unsafe-inline/.test(csp), 'CSP unchanged');
  ok(await pg.evaluate(() => __sim.ui.holdMenu === false && __sim.ui.canvasProps === true && __sim.ui.labelFont === 'normal'), 'defaults: hold off, canvas props on, font normal');

  await pg.click('#simMore');
  const dlg = await pg.evaluate(() => {
    const m = document.querySelector('#simSettings'), box = m.querySelector('.sbox').getBoundingClientRect();
    return { hidden: m.hidden, title: document.querySelector('#simSettingsTitle').textContent, close: document.querySelector('#simSettingsClose').textContent,
      rows: [...m.querySelectorAll('.srow')].map(r => r.querySelector('span').textContent), hint: document.querySelector('#simSettingsHint').textContent,
      hold: document.querySelector('#setHold').getAttribute('aria-checked'), canv: document.querySelector('#setCanvas').getAttribute('aria-checked'),
      font: document.querySelector('#setFont button.on').dataset.font,
      fonts: [...document.querySelectorAll('#setFont button')].map(b => b.textContent + ':' + b.dataset.font),
      top: box.top, bottomGap: innerHeight - box.bottom };
  });
  ok(!dlg.hidden && dlg.title === 'Настройки симулятора' && dlg.close === 'Закрыть', 'dialog title and Закрыть');
  ok(dlg.rows.join('|') === 'Меню по удержанию|Свойства на схеме|Шрифт подписей' && dlg.rows.length === 3, 'three rows only');
  ok(dlg.hint === 'Удаление, поворот и дублирование — в Свойствах и на нижней панели.', 'hint under the rows');
  ok(dlg.hold === 'false' && dlg.canv === 'true' && dlg.font === 'normal', 'controls match defaults');
  ok(dlg.fonts.join('|') === 'Мелкий:small|Обычный:normal|Крупный:large', 'font segments');
  ok(dlg.bottomGap > 40 && dlg.top > 40, 'desktop dialog is centered');
  await pg.screenshot({ path: '/tmp/settings-desktop.png' });

  await pg.keyboard.press('Escape');
  await pg.evaluate(() => __sim.select('R1'));
  const cards = await pg.evaluate(() => ({ hidden: document.querySelector('#canvasCards').hidden, qs: [...document.querySelectorAll('#canvasCards [data-q]')].map(e => e.dataset.q + ':' + e.querySelector('b').textContent) }));
  ok(!cards.hidden && cards.qs.map(s => s.split(':')[0]).join() === 'U,I,P' && cards.qs.every(s => /стоп|—/.test(s)), 'U/I/P cards on the selected part');
  const fs0 = await pg.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#svg .lbl')).fontSize));

  await pg.click('#simMore');
  await pg.click('#setHold'); await pg.click('#setCanvas'); await pg.click('#setFont [data-font="large"]');
  const saved = await pg.evaluate(() => JSON.parse(localStorage.getItem('circuitsim.ui')));
  ok(saved.holdMenu === true && saved.canvasProps === false && saved.labelFont === 'large' && Object.keys(saved).sort().join() === 'canvasProps,holdMenu,labelFont', 'saved only the three known keys');
  ok(await pg.evaluate(() => document.querySelector('#canvasCards').hidden === true), 'canvas cards hide when toggled off');
  const fs1 = await pg.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#svg .lbl')).fontSize));
  ok(fs1 > fs0, 'large labels are bigger (' + fs0 + ' → ' + fs1 + ')');
  ok(await pg.evaluate(() => !!document.querySelector('#props #del') && !!document.querySelector('#props #rot')), 'delete and rotate stay in Свойства');

  await pg.evaluate(() => localStorage.setItem('circuitsim.ui', JSON.stringify({ holdMenu: 'yes', canvasProps: 0, labelFont: 'xxl', evil: '<img>', font: 'large' })));
  await pg.reload(); await pg.waitForTimeout(300);
  const dropped = await pg.evaluate(() => JSON.parse(localStorage.getItem('circuitsim.ui')));
  ok(dropped.holdMenu === false && dropped.canvasProps === true && dropped.labelFont === 'normal' && Object.keys(dropped).length === 3, 'invalid values and unknown keys dropped');

  await pg.evaluate(() => localStorage.setItem('circuitsim.ui', JSON.stringify({ holdMenu: true, canvasProps: false, labelFont: 'small', extra: true })));
  await pg.reload(); await pg.waitForTimeout(300);
  const kept = await pg.evaluate(() => ({ ui: __sim.ui, lfs: document.querySelector('#svg').dataset.lfs, fs: parseFloat(getComputedStyle(document.querySelector('#svg .lbl')).fontSize), keys: Object.keys(JSON.parse(localStorage.getItem('circuitsim.ui'))).sort() }));
  ok(kept.ui.holdMenu === true && kept.ui.canvasProps === false && kept.ui.labelFont === 'small' && kept.lfs === 'small' && kept.keys.join() === 'canvasProps,holdMenu,labelFont' && kept.fs < fs0, 'valid prefs persist, extra key dropped, small labels');

  await pg.evaluate(() => __sim.setUi({ holdMenu: false, canvasProps: true, labelFont: 'normal' }));
  await pg.evaluate(() => __sim.select('R1'));
  const part = await pg.evaluate(() => { const e = document.querySelector('.part[data-part="R1"] .hit').getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; });
  await pg.mouse.click(part.x, part.y, { button: 'right' }); await pg.waitForTimeout(100);
  const rc = await pg.evaluate(() => { const m = document.querySelector('#ctxmenu'); return m && !m.hidden ? [...m.children].map(b => b.textContent) : []; });
  ok(rc.some(t => /Повернуть/.test(t)) && rc.some(t => /Дублировать/.test(t)), 'right-click part menu stays when hold is off');
  await pg.keyboard.press('Escape');

  const mc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const ph = await mc.newPage(); ph.on('pageerror', e => errs.push(e.message));
  await ph.goto(URL); await ph.evaluate(() => localStorage.clear()); await ph.reload(); await ph.waitForTimeout(400);
  await ph.tap('#pmMore'); await ph.tap('#pmSettings');
  const sheet = await ph.evaluate(() => { const box = document.querySelector('#simSettings .sbox').getBoundingClientRect(); return { hidden: document.querySelector('#simSettings').hidden, bottomGap: Math.round(innerHeight - box.bottom), w: Math.round(box.width), iw: innerWidth }; });
  ok(!sheet.hidden && sheet.bottomGap <= 2 && sheet.w >= sheet.iw - 2, 'phone settings is a bottom sheet (' + JSON.stringify(sheet) + ')');
  await ph.screenshot({ path: '/tmp/settings-phone.png' });
  await ph.click('#simSettingsClose');
  const cdp = await mc.newCDPSession(ph);
  const lpress = async (x, y) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); await ph.waitForTimeout(650); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await ph.waitForTimeout(120); };
  const closeSheet = async () => { if (await ph.evaluate(() => document.body.dataset.sheet === 'props')) await ph.tap('#mProps'); };
  const hit = () => ph.evaluate(() => { const e = document.querySelector('.part[data-part="R1"] .hit').getBoundingClientRect(); return [e.x + e.width / 2, e.y + e.height / 2]; });
  await closeSheet(); const xy = await hit(); await lpress(xy[0], xy[1]);
  ok(await ph.evaluate(() => { const m = document.querySelector('#ctxmenu'); return !m || m.hidden; }), 'part long-press menu is off by default');
  await ph.evaluate(() => __sim.setUi({ holdMenu: true })); await closeSheet();
  const xy2 = await hit(); await lpress(xy2[0], xy2[1]);
  const opened = await ph.evaluate(() => { const m = document.querySelector('#ctxmenu'); return m && !m.hidden ? [...m.children].map(b => b.textContent) : []; });
  ok(opened.some(t => /Повернуть/.test(t)) && opened.some(t => /Дублировать/.test(t)) && opened.some(t => /Удалить/.test(t)), 'part hold menu appears when enabled');
  await ph.evaluate(() => { const m = document.querySelector('#ctxmenu'); if (m) m.hidden = true; __sim.setUi({ holdMenu: false }); });
  await closeSheet();
  const mid = await ph.evaluate(() => { const el = document.querySelector('.whit[data-wire="w1"]'), L = el.getTotalLength(), q = el.getPointAtLength(L * 0.5), m = el.getScreenCTM(); return [q.x * m.a + m.e, q.y * m.d + m.f]; });
  await lpress(mid[0], mid[1]);
  const wireMenu = await ph.evaluate(p => { const m = document.querySelector('#ctxmenu'); const hit = document.elementFromPoint(p[0], p[1]); return { items: m && !m.hidden ? [...m.children].map(b => b.textContent) : [], hit: hit ? (hit.id || hit.getAttribute('class') || hit.tagName) : 'none', sheet: document.body.dataset.sheet || '' }; }, mid);
  ok(wireMenu.items.some(t => /Удалить провод/.test(t)) && wireMenu.items.some(t => /изгиб/.test(t)), 'wire long-press menu stays while part hold menu is off ' + JSON.stringify(wireMenu));
  ok(await ph.evaluate(() => !!document.querySelector('#mDel')), 'bottom bar still has delete');

  assert.deepEqual(errs, [], errs.join('\n'));
  await b.close(); console.log('settings e2e ok');
})().catch(e => { console.error(e); process.exit(1); });
