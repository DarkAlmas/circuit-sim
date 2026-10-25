// Settings UI: hold menu defaults off, three controls, prefs persist, junk localStorage is dropped. ?v=14.5.2.
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

  ok(await pg.evaluate(() => [...document.scripts].every(s => !s.src || /\?v=14\.5\.2$/.test(s.src)) && /style\.css\?v=14\.5\.2$/.test(document.querySelector('link[rel=stylesheet]').href)), 'cache stays ?v=14.5.2');
  const csp = await pg.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content);
  ok(csp.startsWith("default-src 'self'") && csp.includes("script-src 'self'") && !/unsafe-inline/.test(csp), 'CSP unchanged');
  const UI_KEYS = 'canvasProps,codeFont,holdMenu,labelFont,showDelBtn,showWireBtn';
  ok(await pg.evaluate(() => __sim.ui.holdMenu === false && __sim.ui.canvasProps === true && __sim.ui.labelFont === 'normal' && __sim.ui.showWireBtn === true && __sim.ui.showDelBtn === true && __sim.ui.codeFont === 14), 'defaults: hold off, canvas props on, wire and delete on, code font 14');
  const codeFs = () => pg.evaluate(() => ({ pm: document.body.classList.contains('pm'), fs: getComputedStyle(document.querySelector('#code')).fontSize, ui: __sim.ui.codeFont }));
  let cfs = await codeFs();
  ok(!cfs.pm && cfs.ui === 14 && cfs.fs === '14px', 'desktop #code computed size is 14px');
  await pg.evaluate(() => __sim.setUi({ codeFont: 16 }));
  cfs = await codeFs();
  ok(!cfs.pm && cfs.ui === 16 && cfs.fs === '16px', 'desktop #code is 16px after setUi({codeFont:16})');
  await pg.evaluate(() => __sim.setUi({ codeFont: 14 }));
  cfs = await codeFs();
  ok(!cfs.pm && cfs.fs === '14px' && cfs.ui === 14, 'desktop #code returns to 14px');

  await pg.click('#simMore');
  const dlg = await pg.evaluate(() => {
    const m = document.querySelector('#simSettings'), box = m.querySelector('.sbox').getBoundingClientRect();
    return { hidden: m.hidden, title: document.querySelector('#simSettingsTitle').textContent, close: document.querySelector('#simSettingsClose').textContent,
      rows: [...m.querySelectorAll('.srow')].map(r => r.querySelector('span').textContent), hint: document.querySelector('#simSettingsHint').textContent,
      hold: document.querySelector('#setHold').getAttribute('aria-checked'), canv: document.querySelector('#setCanvas').getAttribute('aria-checked'),
      font: document.querySelector('#setFont button.on').dataset.font,
      fonts: [...document.querySelectorAll('#setFont button')].map(b => b.textContent + ':' + b.dataset.font),
      wire: document.querySelector('#setWire').getAttribute('aria-checked'), del: document.querySelector('#setDel').getAttribute('aria-checked'),
      code: document.querySelector('#setCodeFont button.on').dataset.size,
      codes: [...document.querySelectorAll('#setCodeFont button')].map(b => b.textContent + ':' + b.dataset.size),
      top: box.top, bottomGap: innerHeight - box.bottom };
  });
  ok(!dlg.hidden && dlg.title === 'Настройки симулятора' && dlg.close === 'Закрыть', 'dialog title and Закрыть');
  ok(dlg.rows.join('|') === 'Меню по удержанию|Свойства на схеме|Шрифт подписей|Кнопка «Провод»|Кнопка «Удалить»|Шрифт кода' && dlg.rows.length === 6, 'six settings rows');
  ok(dlg.hint === 'Удаление, поворот и дублирование — в Свойствах и на нижней панели.', 'hint under the rows');
  ok(dlg.hold === 'false' && dlg.canv === 'true' && dlg.font === 'normal' && dlg.wire === 'true' && dlg.del === 'true' && dlg.code === '14', 'controls match defaults');
  ok(dlg.fonts.join('|') === 'Мелкий:small|Обычный:normal|Крупный:large', 'font segments');
  ok(dlg.codes.join('|') === '14:14|16:16', 'code font is 14 or 16');
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
  ok(saved.holdMenu === true && saved.canvasProps === false && saved.labelFont === 'large' && saved.showWireBtn === true && saved.showDelBtn === true && saved.codeFont === 14 && Object.keys(saved).sort().join() === UI_KEYS, 'saved only the known keys');
  ok(await pg.evaluate(() => document.querySelector('#canvasCards').hidden === true), 'canvas cards hide when toggled off');
  const fs1 = await pg.evaluate(() => parseFloat(getComputedStyle(document.querySelector('#svg .lbl')).fontSize));
  ok(fs1 > fs0, 'large labels are bigger (' + fs0 + ' → ' + fs1 + ')');
  ok(await pg.evaluate(() => !!document.querySelector('#props #del') && !!document.querySelector('#props #rot')), 'delete and rotate stay in Свойства');

  await pg.evaluate(() => localStorage.setItem('circuitsim.ui', JSON.stringify({ holdMenu: 'yes', canvasProps: 0, labelFont: 'xxl', evil: '<img>', font: 'large' })));
  await pg.reload(); await pg.waitForTimeout(300);
  const dropped = await pg.evaluate(() => JSON.parse(localStorage.getItem('circuitsim.ui')));
  ok(dropped.holdMenu === false && dropped.canvasProps === true && dropped.labelFont === 'normal' && dropped.showWireBtn === true && dropped.showDelBtn === true && dropped.codeFont === 14 && Object.keys(dropped).length === 6, 'invalid values and unknown keys dropped');

  await pg.evaluate(() => localStorage.setItem('circuitsim.ui', JSON.stringify({ holdMenu: true, canvasProps: false, labelFont: 'small', extra: true })));
  await pg.reload(); await pg.waitForTimeout(300);
  const kept = await pg.evaluate(() => ({ ui: __sim.ui, lfs: document.querySelector('#svg').dataset.lfs, fs: parseFloat(getComputedStyle(document.querySelector('#svg .lbl')).fontSize), keys: Object.keys(JSON.parse(localStorage.getItem('circuitsim.ui'))).sort() }));
  ok(kept.ui.holdMenu === true && kept.ui.canvasProps === false && kept.ui.labelFont === 'small' && kept.lfs === 'small' && kept.keys.join() === UI_KEYS && kept.fs < fs0, 'valid prefs persist, extra key dropped, small labels');
  await pg.evaluate(() => { localStorage.setItem('pmFont', '16'); localStorage.removeItem('circuitsim.ui'); });
  await pg.reload(); await pg.waitForTimeout(300);
  const mig = await pg.evaluate(() => ({ code: __sim.ui.codeFont, pm: localStorage.getItem('pmFont'), ui: JSON.parse(localStorage.getItem('circuitsim.ui')), fs: getComputedStyle(document.body).getPropertyValue('--codefs').trim() }));
  ok(mig.code === 16 && mig.pm === null && mig.ui.codeFont === 16 && mig.ui.showWireBtn === true && !('pmFont' in mig.ui) && mig.fs === '16px', 'pmFont 16 migrates into codeFont and the old key is removed');
  await pg.evaluate(() => { localStorage.setItem('pmFont', '16'); localStorage.setItem('circuitsim.ui', JSON.stringify({ codeFont: 14, holdMenu: false, canvasProps: true, labelFont: 'normal', showWireBtn: true, showDelBtn: true })); });
  await pg.reload(); await pg.waitForTimeout(300);
  ok(await pg.evaluate(() => __sim.ui.codeFont === 14 && localStorage.getItem('pmFont') === null), 'a saved codeFont is kept and leftover pmFont is still dropped');

  await pg.evaluate(() => __sim.setUi({ holdMenu: false, canvasProps: true, labelFont: 'normal' }));
  await pg.evaluate(() => __sim.select('R1'));
  const part = await pg.evaluate(() => { const e = document.querySelector('.part[data-part="R1"] .hit').getBoundingClientRect(); return { x: e.x + e.width / 2, y: e.y + e.height / 2 }; });
  await pg.mouse.click(part.x, part.y, { button: 'right' }); await pg.waitForTimeout(100);
  const rc = await pg.evaluate(() => { const m = document.querySelector('#ctxmenu'); return m && !m.hidden ? [...m.children].map(b => b.textContent) : []; });
  ok(rc.some(t => /Повернуть/.test(t)) && rc.some(t => /Дублировать/.test(t)), 'right-click part menu stays when hold is off');
  await pg.keyboard.press('Escape');
  await pg.waitForTimeout(450);
  const partMenu = items => items.some(t => /Удалить/.test(t)) && items.some(t => /Повернуть/.test(t)) && items.some(t => /Дублировать/.test(t));
  const atPart = (x, y, fire) => pg.evaluate(({ x, y, fire }) => {
    const svg = document.querySelector('#svg'), m = document.querySelector('#ctxmenu');
    m.hidden = true; m.textContent = '';
    const base = { bubbles: true, cancelable: true, clientX: x, clientY: y, isPrimary: true };
    if (fire === 'touch-then-mouse' || fire === 'touch-then-button') {
      svg.dispatchEvent(new PointerEvent('pointerdown', { ...base, pointerId: 9, pointerType: 'touch' }));
      svg.dispatchEvent(new PointerEvent('pointerup', { ...base, pointerId: 9, pointerType: 'touch' }));
    }
    let ev;
    if (fire === 'touch-then-mouse') {
      ev = new PointerEvent('contextmenu', { ...base, button: 2, pointerId: 3, pointerType: 'mouse' });
      Object.defineProperty(ev, 'sourceCapabilities', { value: { firesTouchEvents: true } });
    } else if (fire === 'touch-then-button') ev = new MouseEvent('contextmenu', { ...base, button: 2 });
    else ev = new PointerEvent('contextmenu', { ...base, button: 2, pointerId: 4, pointerType: fire });
    svg.dispatchEvent(ev);
    return { pm: document.body.classList.contains('pm'), hold: __sim.ui.holdMenu, items: m.hidden ? [] : [...m.children].map(b => b.textContent) };
  }, { x, y, fire });
  const mouseAfter = await atPart(part.x, part.y, 'touch-then-mouse');
  ok(!mouseAfter.pm && mouseAfter.hold === false && partMenu(mouseAfter.items), 'hold off: mouse contextmenu opens the part menu after a touch ' + JSON.stringify(mouseAfter));
  const bareRight = await atPart(part.x, part.y, 'touch-then-button');
  ok(partMenu(bareRight.items), 'hold off: right-button contextmenu without pointerType still opens after a touch ' + JSON.stringify(bareRight));
  const touchCtx = await atPart(part.x, part.y, 'touch');
  ok(!partMenu(touchCtx.items) && !touchCtx.items.some(t => /Повернуть/.test(t)), 'hold off: touch contextmenu does not open the part menu ' + JSON.stringify(touchCtx));
  const penCtx = await atPart(part.x, part.y, 'pen');
  ok(!penCtx.items.some(t => /Повернуть/.test(t)), 'hold off: pen contextmenu does not open the part menu ' + JSON.stringify(penCtx));
  await pg.waitForTimeout(450);
  await pg.evaluate(p => { const el = document.elementFromPoint(p.x, p.y); el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, pointerId: 11, pointerType: 'touch', isPrimary: true })); }, part);
  await pg.waitForTimeout(560);
  const held = await pg.evaluate(() => { const m = document.querySelector('#ctxmenu'); return m.hidden ? [] : [...m.children].map(b => b.textContent); });
  ok(!partMenu(held), 'hold off: long-press does not open the part menu ' + JSON.stringify(held));
  const synth = await pg.evaluate(p => {
    const svg = document.querySelector('#svg'), m = document.querySelector('#ctxmenu');
    svg.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, button: 2 }));
    return m.hidden ? [] : [...m.children].map(b => b.textContent);
  }, part);
  ok(!partMenu(synth), 'hold off: synthetic contextmenu just after long-press stays gated ' + JSON.stringify(synth));
  await pg.evaluate(p => document.querySelector('#svg').dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, pointerId: 11, pointerType: 'touch', isPrimary: true })), part);
  await pg.waitForTimeout(350);
  const after = await pg.evaluate(p => {
    const svg = document.querySelector('#svg'), m = document.querySelector('#ctxmenu');
    m.hidden = true; m.textContent = '';
    svg.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: p.x, clientY: p.y, button: 2 }));
    return m.hidden ? [] : [...m.children].map(b => b.textContent);
  }, part);
  ok(partMenu(after), 'right-button contextmenu opens again once the long-press window has passed ' + JSON.stringify(after));
  await pg.keyboard.press('Escape');

  const hist0 = await pg.evaluate(() => { const u = document.querySelector('#undo'), r = document.querySelector('#redo');
    return { u: u.disabled, r: r.disabled, place: u.parentElement.tagName === 'HEADER' && u.previousElementSibling.id === 'status' && r.nextElementSibling.id === 'simMore',
      label: u.getAttribute('aria-label') + '/' + r.getAttribute('aria-label'), title: u.title + '/' + r.title, text: u.textContent + r.textContent }; });
  ok(hist0.u && hist0.r && hist0.place && hist0.label === 'Отменить/Повторить' && hist0.title === 'Отменить/Повторить' && hist0.text === '↩↪', 'desktop ↩/↪ sit between status and ⋯, disabled with empty stacks');
  await pg.evaluate(() => { __sim.select('R1'); __sim.del(); });
  ok(await pg.evaluate(() => !document.querySelector('#undo').disabled && document.querySelector('#redo').disabled && !__sim.proj.parts.some(p => p.id === 'R1')), 'delete enables Отменить only');
  await pg.click('#undo');
  ok(await pg.evaluate(() => __sim.proj.parts.some(p => p.id === 'R1') && document.querySelector('#undo').disabled && !document.querySelector('#redo').disabled), 'Отменить restores the part and enables Повторить');
  await pg.click('#redo');
  ok(await pg.evaluate(() => !__sim.proj.parts.some(p => p.id === 'R1') && !document.querySelector('#undo').disabled && document.querySelector('#redo').disabled), 'Повторить reapplies the delete');
  await pg.keyboard.press('Control+z');
  ok(await pg.evaluate(() => __sim.proj.parts.some(p => p.id === 'R1')), 'Ctrl+Z still undoes');
  await pg.keyboard.press('Control+y');
  ok(await pg.evaluate(() => !__sim.proj.parts.some(p => p.id === 'R1')), 'Ctrl+Y redoes');
  await pg.keyboard.press('Control+z');
  await pg.keyboard.press('Control+Shift+Z');
  ok(await pg.evaluate(() => !__sim.proj.parts.some(p => p.id === 'R1')), 'Ctrl+Shift+Z redoes');
  await pg.keyboard.press('Control+z');
  await pg.evaluate(() => { const p = __sim.proj.parts.find(x => x.id === 'R1'); p.x += 40; __sim.changed(); });
  ok(await pg.evaluate(() => document.querySelector('#redo').disabled && __sim.proj.parts.some(p => p.id === 'R1')), 'a new edit clears the redo stack');

  const mc = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const ph = await mc.newPage(); ph.on('pageerror', e => errs.push(e.message));
  await ph.goto(URL); await ph.evaluate(() => localStorage.clear()); await ph.reload(); await ph.waitForTimeout(400);
  ok(await ph.evaluate(() => document.body.classList.contains('pm') && innerWidth <= 390 && getComputedStyle(document.querySelector('#code')).fontSize === '14px'), 'phone body.pm #code is 14px at ~390px');
  await ph.tap('#pmMore'); await ph.tap('#pmSettings');
  const sheet = await ph.evaluate(() => { const box = document.querySelector('#simSettings .sbox').getBoundingClientRect(); return { hidden: document.querySelector('#simSettings').hidden, bottomGap: Math.round(innerHeight - box.bottom), w: Math.round(box.width), iw: innerWidth }; });
  ok(!sheet.hidden && sheet.bottomGap <= 2 && sheet.w >= sheet.iw - 2, 'phone settings is a bottom sheet (' + JSON.stringify(sheet) + ')');
  await ph.screenshot({ path: '/tmp/settings-phone.png' });
  await ph.click('#simSettingsClose');
  const cdp = await mc.newCDPSession(ph);
  const lpress = async (x, y) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] }); await ph.waitForTimeout(650); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await ph.waitForTimeout(120); };
  const closeSheet = async () => { if (await ph.evaluate(() => document.body.dataset.sheet === 'props')) await ph.tap('#mProps'); };
  const hit = () => ph.evaluate(() => { const e = document.querySelector('.part[data-part="R1"] .hit').getBoundingClientRect(); return [e.x + e.width / 2, e.y + e.height / 2]; });
  // Dispatch on #svg: a contextmenu fired on an inner SVG shape does not reliably reach the svg listener.
  const touchMenu = (x, y) => ph.evaluate(({ x, y }) => {
    const svg = document.querySelector('#svg'), m = document.querySelector('#ctxmenu');
    if (m) { m.hidden = true; m.textContent = ''; }
    const o = { bubbles: true, cancelable: true, clientX: x, clientY: y, pointerId: 4, pointerType: 'touch', isPrimary: true };
    svg.dispatchEvent(new PointerEvent('pointerdown', o));
    svg.dispatchEvent(new PointerEvent('contextmenu', { ...o, button: 2 }));
    return m && !m.hidden ? [...m.children].map(b => b.textContent) : [];
  }, { x, y });
  const partActs = items => items.some(t => /Повернуть/.test(t)) || items.some(t => /Дублировать/.test(t));
  await closeSheet(); const xy = await hit(); await lpress(xy[0], xy[1]);
  ok(await ph.evaluate(() => { const m = document.querySelector('#ctxmenu'); return !m || m.hidden; }), 'part long-press menu is off by default');
  await closeSheet(); const xyT = await hit();
  const touchOff = await touchMenu(xyT[0], xyT[1]);
  ok(!partActs(touchOff), 'touch contextmenu does not open the part menu when hold is off ' + JSON.stringify(touchOff));
  await ph.evaluate(() => __sim.setUi({ holdMenu: true })); await closeSheet();
  const xy2 = await hit(); await lpress(xy2[0], xy2[1]);
  const opened = await ph.evaluate(() => { const m = document.querySelector('#ctxmenu'); return m && !m.hidden ? [...m.children].map(b => b.textContent) : []; });
  ok(opened.some(t => /Повернуть/.test(t)) && opened.some(t => /Дублировать/.test(t)) && opened.some(t => /Удалить/.test(t)), 'part hold menu appears when enabled');
  await ph.evaluate(() => { const m = document.querySelector('#ctxmenu'); if (m) m.hidden = true; });
  await closeSheet(); const xy3 = await hit();
  const touchOn = await touchMenu(xy3[0], xy3[1]);
  ok(touchOn.some(t => /Повернуть/.test(t)) && touchOn.some(t => /Дублировать/.test(t)), 'touch contextmenu opens the part menu when hold is on ' + JSON.stringify(touchOn));
  await ph.evaluate(() => { const m = document.querySelector('#ctxmenu'); if (m) m.hidden = true; __sim.setUi({ holdMenu: false }); });
  await closeSheet();
  const mid = await ph.evaluate(() => { const el = document.querySelector('.whit[data-wire="w1"]'), L = el.getTotalLength(), q = el.getPointAtLength(L * 0.5), m = el.getScreenCTM(); return [q.x * m.a + m.e, q.y * m.d + m.f]; });
  await lpress(mid[0], mid[1]);
  const wireMenu = await ph.evaluate(p => { const m = document.querySelector('#ctxmenu'); const hit = document.elementFromPoint(p[0], p[1]); return { items: m && !m.hidden ? [...m.children].map(b => b.textContent) : [], hit: hit ? (hit.id || hit.getAttribute('class') || hit.tagName) : 'none', sheet: document.body.dataset.sheet || '' }; }, mid);
  ok(wireMenu.items.some(t => /Удалить провод/.test(t)) && wireMenu.items.some(t => /изгиб/.test(t)), 'wire long-press menu stays while part hold menu is off ' + JSON.stringify(wireMenu));
  await closeSheet();
  const wireCtx = await touchMenu(mid[0], mid[1]);
  ok(wireCtx.some(t => /Удалить провод/.test(t)) && wireCtx.some(t => /изгиб/.test(t)), 'wire touch contextmenu stays while part hold is off ' + JSON.stringify(wireCtx));
  const slot = await ph.evaluate(() => { const u = document.querySelector('#undo'), r = document.querySelector('#redo'), d = document.querySelector('#mDel');
    const ids = [...d.parentElement.children].map(e => e.id);
    return { bar: u.parentElement.id === 'mbar' && r.parentElement.id === 'mbar', left: ids.indexOf('undo') === ids.indexOf('mDel') - 2 && ids.indexOf('redo') === ids.indexOf('mDel') - 1,
      label: u.getAttribute('aria-label') + '/' + r.getAttribute('aria-label'), title: u.title + '/' + r.title }; });
  ok(slot.bar && slot.left && slot.label === 'Отменить/Повторить' && slot.title === 'Отменить/Повторить', 'phone ↩/↪ sit left of 🗑 ' + JSON.stringify(slot));
  ok(await ph.evaluate(() => !!document.querySelector('#mDel')), 'bottom bar still has delete');
  ok(await ph.evaluate(() => !document.querySelector('#pmFont') && document.querySelector('#undo').parentElement.tagName !== 'HEADER'), 'phone ⋯ menu has no code-font item and undo is not in the header');
  const chrome0 = await ph.evaluate(() => { const vis = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0; return { wire: vis(document.querySelector('#mWire')), del: vis(document.querySelector('#mDel')) }; });
  ok(chrome0.wire && chrome0.del, 'Провод and 🗑 start visible');
  await ph.evaluate(() => __sim.setUi({ showWireBtn: false, showDelBtn: false, codeFont: 16 }));
  const chrome1 = await ph.evaluate(() => { const vis = el => !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
    return { wire: vis(document.querySelector('#mWire')), del: vis(document.querySelector('#mDel')), fs: getComputedStyle(document.body).getPropertyValue('--codefs').trim(),
      code: getComputedStyle(document.querySelector('#code')).fontSize, pm: document.body.classList.contains('pm'),
      wireSw: document.querySelector('#setWire').getAttribute('aria-checked'), delSw: document.querySelector('#setDel').getAttribute('aria-checked') }; });
  ok(!chrome1.wire && !chrome1.del && chrome1.fs === '16px' && chrome1.code === '16px' && chrome1.pm && chrome1.wireSw === 'false' && chrome1.delSw === 'false', 'settings hide Провод and 🗑 and phone #code is 16px ' + JSON.stringify(chrome1));
  await ph.evaluate(() => __sim.setUi({ showWireBtn: true, showDelBtn: true }));
  ok(await ph.evaluate(() => getComputedStyle(document.querySelector('#mWire')).display !== 'none' && getComputedStyle(document.querySelector('#mDel')).display !== 'none'), 'turning the toggles back on shows Провод and 🗑');

  assert.deepEqual(errs, [], errs.join('\n'));
  await b.close(); console.log('settings e2e ok');
})().catch(e => { console.error(e); process.exit(1); });
