// Blue LED (Vf 3) at 5 V through 220 Ω should light at ~9 mA; also checks 390px dropdown fits.
const { chromium } = require('playwright-core'); const assert = require('assert');
const URL = process.argv[2] || 'http://localhost:8765/';
(async () => { const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' }); const pg = await b.newPage();
  await pg.goto(URL); const j = JSON.stringify({ parts: [{ id: 'V1', type: 'dc', x: 300, y: 300, rot: 0, props: { V: 5, rInt: 0.1 } }, { id: 'R1', type: 'resistor', x: 400, y: 200, rot: 0, props: { R: 220, Pmax: 0.25 } }, { id: 'D1', type: 'led', x: 520, y: 200, rot: 0, props: { color: 'синий', Vf: 3, Imax: 0.02 } }],
    wires: [{ id: 'w1', a: { part: 'V1', pin: 'p' }, b: { part: 'R1', pin: 'a' } }, { id: 'w2', a: { part: 'R1', pin: 'b' }, b: { part: 'D1', pin: 'a' } }, { id: 'w3', a: { part: 'D1', pin: 'b' }, b: { part: 'V1', pin: 'n' } }] });
  await pg.evaluate(j => { const dt = new DataTransfer(); dt.items.add(new File([j], 'p.json')); const i = document.querySelector('#import'); i.files = dt.files; i.dispatchEvent(new Event('change')); }, j);
  await pg.waitForTimeout(300); await pg.click('#run'); await pg.waitForTimeout(800);
  const r = await pg.evaluate(() => ({ I: window.__sim.meas.D1.I, burned: !!window.__sim.proj.parts.find(p => p.id === 'D1').burned }));
  console.log('blue LED I =', (r.I * 1000).toFixed(2), 'mA'); assert.ok(r.I > 0.0085 && r.I < 0.0095 && !r.burned);
  const m = await b.newPage({ viewport: { width: 390, height: 844 } }); await m.goto(URL); await m.waitForTimeout(200);
  const d = await m.evaluate(() => ({ right: document.querySelector('#projects').getBoundingClientRect().right, vw: innerWidth, sw: document.documentElement.scrollWidth }));
  console.log('390px dropdown', d); assert.ok(d.right <= d.vw && d.sw <= d.vw); console.log('blue LED e2e OK'); await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
