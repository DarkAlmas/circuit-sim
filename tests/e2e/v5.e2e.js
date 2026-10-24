// v5: new-project cards, Uno matrix lights, Pico ring, Orange Pi HDMI frame, watchdog, array cap, CSP clean, 1920x1080 + mobile.
const { chromium } = require('playwright-core'); const assert = require('assert');
const URL = process.argv[2] || 'http://localhost:8765/';
(async () => { const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const pg = await b.newPage({ viewport: { width: 1920, height: 1080 } }); const errs = [];
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(URL); await pg.waitForTimeout(300);
  const card = async k => { await pg.click('#new'); await pg.click(`.ncard[data-kind="${k}"]`); await pg.waitForTimeout(200); };
  await pg.click('#new'); assert.ok(await pg.$$eval('.ncard', x => x.length) >= 8); await pg.click('#newClose');
  // Uno + matrix
  await card('uno'); await pg.click('#run'); await pg.waitForTimeout(1200);
  const lit = await pg.$$eval('[data-part="H1"] .mxon', x => x.length); console.log('matrix lit dots', lit); assert.ok(lit >= 28);
  await pg.click('#stop');
  // Pico ring
  await card('pico'); await pg.click('#run'); await pg.waitForTimeout(1000);
  const px = await pg.evaluate(() => (window.__sim.proj.parts.find(p => p.id === 'H1')._mod || {}).px || []); console.log('ring pixels', px.filter(Boolean).length); assert.ok(px.filter(Boolean).length >= 10);
  await pg.click('#stop');
  // Orange Pi HDMI
  await card('opi'); await pg.click('#run'); await pg.waitForTimeout(1500);
  const img = await pg.$eval('[data-part="M1"] image', e => e.getAttribute('href').slice(0, 22)).catch(() => ''); console.log('monitor image', img); assert.ok(img.startsWith('data:image/png;base64'));
  const ledI = await pg.evaluate(() => { const r = []; return new Promise(res => { let n = 0; const t = setInterval(() => { r.push(window.__sim.meas.D1.I); if (++n > 20) { clearInterval(t); res(Math.max(...r)); } }, 50); }); });
  console.log('opi LED max I', ledI); assert.ok(ledI > 0.003);
  await pg.dblclick('[data-part="M1"] .hit', { force: true }).catch(() => {}); await pg.evaluate(() => { const r = document.querySelector('[data-part="M1"] .hit').getBoundingClientRect(); for (let i = 0; i < 2; i++) { document.querySelector('#svg').dispatchEvent(new PointerEvent('pointerdown', { clientX: r.x + 20, clientY: r.y + 20, bubbles: true, pointerId: 1 })); document.querySelector('#svg').dispatchEvent(new PointerEvent('pointerup', { clientX: r.x + 20, clientY: r.y + 20, bubbles: true, pointerId: 1 })); } });
  await pg.waitForTimeout(400); const full = await pg.$eval('#hdmiFull', e => !e.hidden); console.log('fullscreen open', full); assert.ok(full);
  await pg.screenshot({ path: '/tmp/v5-hdmi.png' }); await pg.keyboard.press('Escape'); await pg.click('#stop');
  await pg.screenshot({ path: '/tmp/v5-1920.png' });
  const lay = await pg.evaluate(() => ({ l: document.querySelector('#left').offsetWidth, r: document.querySelector('#right').offsetWidth, code: document.querySelector('#codeDock #codePane') != null, h: document.querySelector('#bottom').offsetHeight }));
  console.log('layout', lay); assert.ok(lay.l === 260 && lay.r === 320 && lay.code && lay.h > 300);
  // watchdog + array cap
  await card('uno'); await pg.fill('#code', 'void setup(){}\nvoid loop(){ while(true){} }'); await pg.click('#run'); await pg.waitForTimeout(3200);
  let con = await pg.$eval('#console', e => e.textContent); assert.ok(/нет ответа 2 с/.test(con)); await pg.click('#stop');
  await pg.fill('#code', 'void setup(){ Serial.println(Array(100000000).length); }\nvoid loop(){ delay(100); }'); await pg.click('#run'); await pg.waitForTimeout(800);
  con = await pg.$eval('#console', e => e.textContent); console.log('array cap:', con.trim().slice(0, 80)); assert.ok(/массив больше/.test(con)); await pg.click('#stop');
  const csp = errs.filter(e => /Content Security Policy|Refused/.test(e)); console.log('CSP errors', csp.length, errs.slice(0, 3)); assert.equal(csp.length, 0);
  // mobile
  const m = await b.newPage({ viewport: { width: 390, height: 844 } }); await m.goto(URL); await m.waitForTimeout(200);
  const d = await m.evaluate(() => ({ sw: document.documentElement.scrollWidth, vw: innerWidth, pane: document.querySelector('#codePane').hidden, dock: document.body.classList.contains('dock') }));
  console.log('mobile', d); assert.ok(d.sw <= d.vw && d.pane && !d.dock); await m.screenshot({ path: '/tmp/v5-mobile.png' });
  console.log('v5 e2e OK'); await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
