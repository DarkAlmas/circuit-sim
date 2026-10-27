// Assistant panel: offline by default, Apply does not eval, opt-in CSP is one origin. ?v=14.6.5.
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
  ok(await page.evaluate(() => [...document.scripts].filter(s => s.src).every(s => /\?v=14\.6\.5$/.test(s.src))), 'scripts ?v=14.6.5');
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
  ok(await page.evaluate(() => Assistant.settings.baseUrl === 'http://127.0.0.1:11434/v1' && Assistant.settings.model === 'llama3.2' && !Assistant.settings.enabled), 'default endpoint is local Ollama and still opted out');
  ok((await page.textContent('#assistKeyNote')).trim() === 'ключ не нужен', 'ollama localhost does not need a key');
  ok((await page.getAttribute('#assistKey', 'placeholder')).includes('не нужен для Ollama'), 'key placeholder names Ollama');
  ok((await page.textContent('#assistCfg')).includes('Адрес API (OpenAI-совместимый)') && (await page.textContent('#assistCfg')).includes('Настройки ИИ'), 'settings heading and API label');
  ok(/выключен/i.test(await page.textContent('#assistHint')) && /ollama serve/.test(await page.textContent('#assistHint')), 'hint explains the switch and ollama serve');
  const gated = await page.evaluate(() => ({ input: document.querySelector('#assistInput').disabled, send: document.querySelector('#assistSend').disabled, w: document.querySelector('#right').offsetWidth }));
  ok(gated.input && gated.send, 'chat and send are disabled until opt-in');
  ok(gated.w >= 320 && gated.w <= 400, 'assist pane is wide enough: ' + gated.w);
  ok(await page.evaluate(() => document.querySelector('#assistCfg .srow > span').getClientRects().length === 1), 'opt-in label stays on one line');
  ok(await page.evaluate(() => {
    const pane = document.querySelector('#right').getBoundingClientRect();
    const inside = sel => { const r = document.querySelector(sel).getBoundingClientRect(); return r.top >= pane.top - 1 && r.bottom <= pane.bottom + 2 && r.height > 0; };
    return inside('#assistOn') && inside('#assistSend') && inside('#assistInput');
  }), 'opt-in and the composer stay inside the pane');
  const look = await page.evaluate(() => ({
    box: getComputedStyle(document.querySelector('#assistRemember')).backgroundColor,
    forget: getComputedStyle(document.querySelector('#assistForget')).backgroundColor,
    send: getComputedStyle(document.querySelector('#assistSend')).backgroundColor
  }));
  ok(look.box === 'rgb(15, 19, 27)', 'remember checkbox stays dark: ' + look.box);
  ok(look.forget === 'rgba(0, 0, 0, 0)', 'forget key is a ghost button: ' + look.forget);
  ok(look.send === 'rgb(44, 51, 68)', 'send is grey while opt-in is off: ' + look.send);
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('#assistSend')).opacity === '1'), 'disabled send is not a faded green');
  ok(await page.evaluate(() => document.querySelector('#assistKeyRow').hidden === true), 'ollama hides the API key field');
  const beforePresets = external.length;
  await page.click('#assistPresetGroq');
  ok(await page.evaluate(() => Assistant.settings.baseUrl === 'https://circuit-sim-ai-proxy.vercel.app/v1' && Assistant.settings.model === 'openai/gpt-oss-20b'), 'Groq preset fills the free proxy and model');
  ok((await page.textContent('#assistKeyNote')).trim() === 'ключ не нужен', 'Groq proxy does not ask for a key');
  ok((await page.getAttribute('#assistKey', 'placeholder')).includes('без ключа'), 'Groq placeholder says no key');
  ok(await page.evaluate(() => document.querySelector('#assistKeyRow').hidden === true), 'Groq proxy hides the API key field');
  ok((await page.textContent('#assistStatus')).includes('без ключа'), 'Groq flash says no key');
  await page.click('#assistPresetOllama');
  ok(await page.evaluate(() => Assistant.settings.baseUrl === 'http://127.0.0.1:11434/v1' && Assistant.settings.model === 'llama3.2'), 'Ollama preset restores the local endpoint');
  ok((await page.textContent('#assistKeyNote')).trim() === 'ключ не нужен', 'Ollama preset clears the key requirement');
  ok(external.length === beforePresets, 'presets do not touch the network: ' + external.slice(beforePresets).join(' '));
  await page.click('#assistMode [data-mode=code]');
  ok(await page.evaluate(() => Assistant.mode === 'code'), 'mode switches to code');
  await page.click('#assistMode [data-mode=schema]');
  ok(await page.evaluate(() => Assistant.mode === 'schema'), 'mode switches back to schema');

  ok(external.length === beforePresets, 'no network while opt-in is off: ' + external.slice(beforePresets).join(' '));

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

  await page.fill('#assistUrl', 'https://assistant-test.invalid/v1');
  await page.dispatchEvent('#assistUrl', 'change');
  ok(await page.evaluate(() => document.querySelector('#assistKeyRow').hidden === false), 'a keyed https address shows the API key');
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
  ok(await page.evaluate(() => !document.querySelector('#assistInput').disabled && !document.querySelector('#assistSend').disabled), 'chat enables with the opt-in switch');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('#assistSend')).backgroundColor === 'rgb(31, 107, 58)'), 'send turns green after opt-in');

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

  const phone = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const phoneErr = [];
  phone.on('pageerror', e => phoneErr.push(e.message));
  await phone.goto(URL);
  await phone.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
  await phone.reload();
  await phone.waitForTimeout(400);
  ok(await phone.evaluate(() => document.body.classList.contains('pm')), 'phone layout is on');
  await phone.click('#pmMore');
  await phone.click('#pmAssist');
  await phone.waitForTimeout(300);
  const phoneUi = await phone.evaluate(() => {
    const span = document.querySelector('#assistCfg .srow > span');
    const right = document.querySelector('#right').getBoundingClientRect();
    const meta = document.querySelector('meta[http-equiv="Content-Security-Policy"]').content;
    return {
      open: document.body.dataset.sheet === 'props' && document.querySelector('#sideAssistPane').hidden === false,
      note: document.querySelector('#assistKeyNote').textContent.trim(),
      disabled: document.querySelector('#assistInput').disabled && document.querySelector('#assistSend').disabled,
      lines: span.getClientRects().length,
      rightW: Math.round(right.width),
      urlIn: (() => { const u = document.querySelector('#assistUrl').getBoundingClientRect(); return u.height > 20 && u.top >= right.top && u.bottom <= right.bottom + 2; })(),
      modelIn: (() => { const m = document.querySelector('#assistModel').getBoundingClientRect(); return m.height > 20 && m.top >= right.top && m.bottom <= right.bottom + 2; })(),
      csp: meta.includes("connect-src 'none'")
    };
  });
  ok(phoneUi.open && phoneUi.note === 'ключ не нужен' && phoneUi.disabled, 'phone assistant is opted out without a key: ' + JSON.stringify(phoneUi));
  ok(phoneUi.lines === 1 && phoneUi.rightW >= 360 && phoneUi.urlIn && phoneUi.modelIn && phoneUi.csp, 'phone labels fit, API fields are on screen, CSP stays closed: ' + JSON.stringify(phoneUi));
  const phoneLay = await phone.evaluate(() => {
    const box = sel => document.querySelector(sel).getBoundingClientRect();
    const mode = box('#assistMode');
    const body = document.querySelector('#assistCfgBody');
    const right = box('#right');
    const presets = [...document.querySelectorAll('#assistPresets button')].map(b => b.getBoundingClientRect());
    const send = getComputedStyle(document.querySelector('#assistSend'));
    const tabs = [...document.querySelectorAll('#sideTabs button')].map(b => b.getBoundingClientRect());
    const model = document.querySelector('label.prop:has(#assistModel)').getBoundingClientRect();
    const shown = (el, view) => el.top >= view.top - 1 && el.bottom <= view.bottom + 2 && el.height > 8;
    return {
      modeH: Math.round(mode.height),
      bodyH: Math.round(body.clientHeight),
      noInner: body.scrollHeight <= body.clientHeight + 1 && getComputedStyle(body).overflowY === 'visible',
      stacked: presets[1].top >= presets[0].bottom - 1,
      presetW: presets.map(p => Math.round(p.width)),
      presetsIn: presets.every(p => shown(p, right)),
      sendBg: send.backgroundColor,
      sendOp: send.opacity,
      keyHidden: document.querySelector('#assistKeyRow').hidden,
      tabsOverlap: tabs[0].right > tabs[1].left + 1,
      tabW: tabs.map(t => Math.round(t.width)),
      modelIn: shown(model, right),
      hint: getComputedStyle(document.querySelector('#assistHint')).color,
      rightW: Math.round(right.width)
    };
  });
  ok(phoneLay.modeH >= 36 && phoneLay.modeH <= 44, 'phone mode toggle is a short strip: ' + JSON.stringify(phoneLay));
  ok(phoneLay.bodyH >= 240 && phoneLay.noInner, 'phone settings have no nested scroller: ' + JSON.stringify(phoneLay));
  ok(phoneLay.stacked && phoneLay.presetsIn && phoneLay.presetW.every(w => w >= 240), 'phone presets are one column: ' + JSON.stringify(phoneLay));
  ok(phoneLay.sendBg === 'rgb(44, 51, 68)' && phoneLay.sendOp === '1', 'phone send is grey while opted out: ' + JSON.stringify(phoneLay));
  ok(phoneLay.keyHidden && !phoneLay.tabsOverlap && phoneLay.tabW.every(w => w >= 120), 'phone key hidden, tabs do not overlap: ' + JSON.stringify(phoneLay));
  ok(phoneLay.modelIn && phoneLay.hint === 'rgb(213, 222, 234)' && phoneLay.rightW >= 360, 'phone model label and hint contrast: ' + JSON.stringify(phoneLay));
  await phone.evaluate(() => { const r = document.querySelector('#right'); r.scrollTop = r.scrollHeight; });
  ok(await phone.evaluate(() => {
    const s = document.querySelector('#assistSend').getBoundingClientRect();
    const right = document.querySelector('#right').getBoundingClientRect();
    return s.height >= 44 && s.top >= right.top - 1 && s.bottom <= right.bottom + 2 && getComputedStyle(document.querySelector('#assistSend')).backgroundColor === 'rgb(44, 51, 68)';
  }), 'scrolled sheet shows a grey send button');
  await phone.evaluate(() => { document.querySelector('#right').scrollTop = 0; });
  await phone.click('#assistOn');
  ok(await phone.evaluate(() => !document.querySelector('#assistSend').disabled && Assistant.settings.enabled && getComputedStyle(document.querySelector('#assistSend')).backgroundColor === 'rgb(31, 107, 58)'), 'phone opt-in enables send');
  await phone.click('#assistPresetGroq');
  ok((await phone.textContent('#assistKeyNote')).trim() === 'ключ не нужен', 'phone Groq preset does not ask for a key');
  ok(await phone.evaluate(() => document.querySelector('#assistKeyRow').hidden && Assistant.settings.baseUrl === 'https://circuit-sim-ai-proxy.vercel.app/v1' && Assistant.settings.model === 'openai/gpt-oss-20b'), 'phone Groq stays the keyless proxy');
  await phone.fill('#assistInput', 'привет');
  ok(await phone.inputValue('#assistInput') === 'привет', 'phone chat accepts text after opt-in');
  ok(phoneErr.length === 0, 'no phone page errors: ' + phoneErr.join(' | '));
  console.log('assistant e2e OK');
  await browser.close();
})().catch(e => { console.error('FAIL', e); process.exit(1); });
