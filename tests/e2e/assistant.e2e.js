// Assistant panel: offline by default, Apply does not eval, opt-in CSP is one origin. ?v=14.6.2.
const { chromium } = require('playwright-core');
const assert = require('assert');
const URL = process.argv[2] || 'http://127.0.0.1:8765/';
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROME || '/usr/bin/google-chrome', args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  const errors = [];
  const dialogs = [];
  const csp = [];
  const external = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
  page.on('console', m => { if (/Content Security Policy|Refused to connect/i.test(m.text())) csp.push(m.text()); });
  page.on('request', r => {
    const u = r.url();
    if (!u.startsWith(URL) && !u.startsWith('data:') && !u.startsWith('blob:')) external.push(u);
  });
  const ok = (c, m) => { assert.ok(c, m); console.log('✓', m); };

  await page.goto(URL);
  await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await page.reload();
  await page.waitForTimeout(400);

  const meta = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content);
  ok(meta.includes("connect-src 'none'") && !/unsafe-inline|unsafe-eval/.test(meta), 'main CSP still connect-src none');
  ok(await page.evaluate(() => [...document.scripts].filter(s => s.src).every(s => /\?v=14\.6\.2$/.test(s.src))), 'scripts ?v=14.6.2');
  await page.evaluate(() => fetch('https://example.com/leak').catch(() => {}));
  await page.waitForTimeout(200);
  ok(csp.some(t => /example\.com/.test(t)), 'main page fetch is refused by CSP: ' + csp.join(' | '));
  const regs = await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).map(r => ((r.active || r.installing || r.waiting || {}).scriptURL) || ''));
  ok(!regs.some(u => u.includes('sw-assistant')), 'no assistant service worker by default');

  await page.click('#assistTab');
  const labels = await page.evaluate(() => ({
    tab: document.querySelector('#sideAssist').textContent,
    schema: document.querySelector('#assistMode [data-mode=schema]').textContent,
    code: document.querySelector('#assistMode [data-mode=code]').textContent,
    send: document.querySelector('#assistSend').textContent,
    opt: document.querySelector('#assistOn').getAttribute('aria-label'),
    on: document.querySelector('#assistOn').getAttribute('aria-checked'),
    hidden: document.querySelector('#sidePropsPane').hidden
  }));
  ok(labels.tab.includes('Помощник') && labels.schema === 'Схема' && labels.code === 'Код' && labels.send === 'Отправить', 'Russian panel labels');
  ok(labels.opt === 'Разрешить запросы к ИИ' && labels.on === 'false' && labels.hidden, 'opt-in off, properties hidden while the assistant is open');
  await page.click('#assistMode [data-mode=code]');
  ok(await page.evaluate(() => Assistant.mode === 'code'), 'mode switches to code');
  await page.click('#assistMode [data-mode=schema]');
  ok(await page.evaluate(() => Assistant.mode === 'schema'), 'mode switches back to schema');

  const beforeNet = external.length;
  await page.fill('#assistInput', 'нарисуй светодиод');
  await page.click('#assistSend');
  ok(/выключен/i.test(await page.textContent('#assistStatus')), 'send explains that requests are off');
  ok(external.length === beforeNet, 'no network while opt-in is off: ' + external.slice(beforeNet).join(' '));

  const codeBefore = await page.inputValue('#code');
  await page.evaluate(() => {
    window.__before = __sim.proj.parts.map(p => p.id);
    Assistant.presentReply('code', 'Мигнуть.\n```json\n{"sketch":"void setup(){ alert(1); fetch(\\"https://evil.example\\"); }\\nvoid loop(){ delay(10); }"}\n```');
  });
  await page.click('#assistLog button.apply');
  const sketch = await page.inputValue('#code');
  ok(sketch.includes('alert(1)') && sketch.includes('evil.example') && sketch !== codeBefore, 'Apply writes the sketch into the editor');
  ok(dialogs.length === 0, 'sketch was not evaled');
  ok(await page.evaluate(() => document.querySelectorAll('#assistLog img, #assistLog script, body > img').length === 0), 'reply is not HTML');

  await page.evaluate(() => {
    Assistant.presentReply('schema', 'Резистор.\n```json\n{"parts":[{"id":"R1","type":"resistor","props":{"R":470,"evil":"<img onerror=alert(1)>"}},{"id":"ZZ","type":"<script>","props":{}}],"wires":[{"id":"wH","a":{"part":"R1","pin":"a"},"b":{"part":"NOPE","pin":"a"},"hack":1}],"code":"pwned"}\n```');
  });
  const applies = await page.$$('#assistLog button.apply:not([disabled])');
  await applies[applies.length - 1].click();
  await page.waitForTimeout(200);
  const added = await page.evaluate(() => __sim.proj.parts.filter(p => !window.__before.includes(p.id)).map(p => ({ id: p.id, type: p.type, keys: Object.keys(p).sort(), props: p.props, propKeys: Object.keys(p.props || {}).sort() })));
  ok(added.length === 1 && added[0].type === 'resistor' && added[0].props.R === 470, 'one whitelisted resistor was added ' + JSON.stringify(added));
  ok(added[0].propKeys.join() === 'Pmax,R' && added[0].keys.join() === 'id,props,rot,type,x,y', 'extra keys dropped');
  ok(await page.evaluate(() => !__sim.proj.parts.some(p => p.type === '<script>' || p.id === 'ZZ') && !__sim.proj.wires.some(w => w.id === 'wH')), 'unknown part and dangling wire dropped');
  ok((await page.inputValue('#code')).includes('alert(1)'), 'schematic apply keeps the editor sketch');
  ok(await page.evaluate(() => !__sim.running), 'Apply does not start the simulation');
  ok(dialogs.length === 0, 'no dialogs after apply');

  await page.fill('#assistKey', 'sk-test-SECRET-xyz');
  await page.dispatchEvent('#assistKey', 'change');
  ok(await page.inputValue('#assistKey') === '', 'key field is cleared after save');
  const leaked = await page.evaluate(() => ({
    dom: document.documentElement.innerHTML.includes('sk-test-SECRET-xyz'),
    local: JSON.stringify(localStorage).includes('SECRET'),
    proj: JSON.stringify(__sim.proj).includes('SECRET'),
    session: sessionStorage.getItem('circuitsim.assistant.key'),
    settings: localStorage.getItem('circuitsim.assistant')
  }));
  ok(!leaked.dom && !leaked.local && !leaked.proj && leaked.session === 'sk-test-SECRET-xyz', 'key stays in sessionStorage only ' + JSON.stringify(leaked));
  ok(!leaked.settings.includes('SECRET') && leaked.settings.includes('"enabled":false'), 'settings blob has no key and stays opted out until the toggle');

  await page.fill('#assistUrl', 'http://8.8.8.8/v1');
  await page.dispatchEvent('#assistUrl', 'change');
  ok(await page.evaluate(() => Assistant.settings.baseUrl === ''), 'public http address is rejected');
  await page.fill('#assistUrl', 'https://assistant-test.invalid/v1');
  await page.dispatchEvent('#assistUrl', 'change');
  await page.click('#assistOn');
  ok(await page.evaluate(() => Assistant.settings.enabled && Assistant.settings.baseUrl === 'https://assistant-test.invalid/v1'), 'opt-in stores only the validated base URL');

  const mid = external.length;
  await page.fill('#assistInput', 'привет');
  await page.click('#assistSend');
  await page.waitForSelector('#assistLog .err', { timeout: 20000 });
  ok(external.slice(mid).every(u => u.startsWith('https://assistant-test.invalid/')), 'opt-in contacts only the chosen origin: ' + external.slice(mid).join(' '));
  ok(external.slice(mid).length > 0, 'the frame actually attempted the request');
  ok(!csp.some(t => /assistant-test\.invalid/.test(t) && /Content Security Policy/i.test(t)), 'chosen origin is not blocked by CSP');

  const frame = page.frames().find(f => f.url().includes('assistant-frame.html'));
  ok(frame, 'assistant frame loaded');
  const frameCsp = await frame.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content);
  ok(frameCsp.includes('connect-src https://assistant-test.invalid') && frameCsp.includes("frame-ancestors 'self'") && !frameCsp.includes('*'), 'frame CSP is the one origin');
  const cspBefore = csp.length;
  await frame.evaluate(() => fetch('https://blocked-test.invalid/nope').catch(() => {}));
  await page.waitForTimeout(300);
  ok(csp.slice(cspBefore).some(t => /blocked-test\.invalid/.test(t)), 'other origins are still refused: ' + csp.slice(cspBefore).join(' | '));
  const metaAfter = await page.evaluate(() => document.querySelector('meta[http-equiv="Content-Security-Policy"]').content);
  ok(metaAfter.includes("connect-src 'none'"), 'main document CSP did not widen');
  ok(errors.length === 0, 'no page errors: ' + errors.join(' | '));
  console.log('assistant e2e OK');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
