// Assistant: parse, sanitize, opt-in settings. No network and no eval of a reply.
const test = require('node:test'), assert = require('node:assert'), fs = require('node:fs'), path = require('node:path');
global.window = { Solver: require('../solver.js') };
require('../parts.js');
require('../sanitize.js');
require('../assistant-core.js');
const A = globalThis.AssistantCore;
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');

test('page CSP stays connect-src none and scripts are versioned', () => {
  const html = read('index.html');
  const m = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert.ok(m, 'csp meta');
  assert.ok(m[1].includes("connect-src 'none'"));
  assert.ok(!/connect-src\s+https?:/.test(m[1]));
  assert.ok(html.includes('assistant-core.js?v=14.7.2') && html.includes('assistant.js?v=14.7.2'));
  assert.ok(html.includes('style.css?v=14.7.2'));
  assert.equal(A.VERSION, '14.7.2');
  assert.ok(read('sw-assistant.js').includes('assistant-core.js?v=14.7.2'));
  assert.ok(read('assistant-net.js').includes("VERSION = '14.7.2'"));
  assert.ok(read('app.js').includes("new Worker('worker.js?v=14.7.2')"));
});

test('assistant sources do not eval, inject HTML, or call a CDN', () => {
  for (const name of ['assistant.js', 'assistant-core.js', 'assistant-net.js', 'sw-assistant.js']) {
    const s = read(name);
    assert.ok(!/\beval\s*\(/.test(s), name);
    assert.ok(!/new\s+Function/.test(s), name);
    assert.ok(!/\.innerHTML\b/.test(s), name);
    assert.ok(!/cdn|unpkg|jsdelivr|googleapis/.test(s), name);
    assert.ok(!/sk-[A-Za-z0-9]{8,}/.test(s), name);
  }
  assert.ok(!/localStorage|sessionStorage/.test(read('assistant-net.js')));
});

test('endpoint allow-list: https anywhere, http only loopback and private', () => {
  assert.equal(A.endpointOrigin('https://api.openai.com/v1'), 'https://api.openai.com');
  assert.equal(A.endpointOrigin('http://127.0.0.1:11434/v1'), 'http://127.0.0.1:11434');
  assert.equal(A.endpointOrigin('http://localhost:8080/v1'), 'http://localhost:8080');
  assert.equal(A.endpointOrigin('http://192.168.1.20:11434/v1'), 'http://192.168.1.20:11434');
  assert.equal(A.endpointOrigin('http://10.0.0.8/v1'), 'http://10.0.0.8');
  assert.equal(A.endpointOrigin('http://172.16.0.4:1234/v1'), 'http://172.16.0.4:1234');
  assert.equal(A.endpointOrigin('http://[::1]:11434/v1'), 'http://[::1]:11434');
  for (const bad of ['http://8.8.8.8/v1', 'http://1.2.3.4', 'javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'https://user:pass@api.openai.com/v1', 'https://evil.com/"><script>', 'ws://127.0.0.1/', '', null, 'https://', 'http://localhost.evil.com/v1'])
    assert.equal(A.endpointOrigin(bad), '', String(bad));
  assert.equal(A.chatUrl('https://api.openai.com/v1'), 'https://api.openai.com/v1/chat/completions');
  assert.equal(A.chatUrl('http://127.0.0.1:11434/v1'), 'http://127.0.0.1:11434/v1/chat/completions');
  assert.equal(A.chatUrl('https://api.openai.com/v1/chat/completions'), 'https://api.openai.com/v1/chat/completions');
  assert.equal(A.chatUrl('https://api.openai.com/v1?token=secret#x'), 'https://api.openai.com/v1/chat/completions');
  assert.equal(A.normalizeBase('http://8.8.8.8/v1'), '');
});

test('local Ollama needs no key; https OpenAI-style still does', () => {
  const fresh = A.sanitizeSettings(undefined);
  assert.equal(fresh.enabled, false);
  assert.equal(fresh.baseUrl, 'http://127.0.0.1:11434/v1');
  assert.equal(fresh.model, 'llama3.2');
  assert.equal(fresh.key, undefined);
  assert.equal(A.sanitizeSettings({ baseUrl: '' }).baseUrl, '');
  assert.equal(A.keyRequired('http://127.0.0.1:11434/v1'), false);
  assert.equal(A.keyRequired('http://localhost:11434/v1'), false);
  assert.equal(A.keyRequired('http://[::1]:11434/v1'), false);
  assert.equal(A.keyRequired('http://192.168.1.20:11434/v1'), false);
  assert.equal(A.keyRequired('http://10.0.0.8/v1'), false);
  assert.equal(A.keyRequired('http://172.16.0.4:1234/v1'), false);
  assert.equal(A.keyRequired('https://api.openai.com/v1'), true);
  assert.equal(A.keyRequired('https://api.groq.com/openai/v1'), true);
  assert.equal(A.keyRequired('https://circuit-sim-ai-proxy.vercel.app/v1'), false);
  assert.equal(A.keyRequired('https://circuit-sim-ai-proxy.vercel.app/v1/'), false);
  assert.equal(A.keyRequired('https://circuit-sim-ai-proxy.vercel.app/other'), true);
  assert.equal(A.keyRequired('https://circuit-sim-ai-proxy.vercel.app.evil.example/v1'), true);
  assert.equal(A.keyRequired('http://8.8.8.8/v1'), true);
  assert.equal(A.keyRequired(''), true);
  const ollama = A.preset('ollama');
  const groq = A.preset('groq');
  assert.deepEqual(ollama, { baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3.2' });
  assert.deepEqual(groq, { baseUrl: 'https://circuit-sim-ai-proxy.vercel.app/v1', model: 'openai/gpt-oss-20b' });
  assert.ok(ollama.model.length <= 64 && groq.model.length <= 64);
  assert.equal(A.keyRequired(ollama.baseUrl), false);
  assert.equal(A.keyRequired(groq.baseUrl), false);
  const localSettings = A.sanitizeSettings({ enabled: true, baseUrl: ollama.baseUrl, model: ollama.model });
  const local = A.buildRequest({ settings: localSettings, mode: 'schema', catalog: 'resistor(a,b)', question: 'мигни' });
  assert.ok(local);
  assert.equal(local.url, 'http://127.0.0.1:11434/v1/chat/completions');
  assert.equal(local.origin, 'http://127.0.0.1:11434');
  assert.equal(local.body.model, 'llama3.2');
  assert.ok(!('key' in local));
  const free = A.buildRequest({ settings: { enabled: true, baseUrl: groq.baseUrl, model: groq.model }, mode: 'code', question: 'мигни' });
  assert.ok(free);
  assert.equal(free.url, 'https://circuit-sim-ai-proxy.vercel.app/v1/chat/completions');
  assert.equal(free.origin, 'https://circuit-sim-ai-proxy.vercel.app');
  assert.equal(free.body.model, 'openai/gpt-oss-20b');
  assert.ok(!('key' in free));
  assert.equal(A.buildRequest({ settings: { enabled: true, baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' }, mode: 'schema', question: 'мигни' }), null);
  const paid = A.buildRequest({ settings: { enabled: true, baseUrl: 'https://api.groq.com/openai/v1', model: 'openai/gpt-oss-20b' }, key: 'gsk-user-pasted', mode: 'code', question: 'мигни' });
  assert.equal(paid.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal(paid.body.model, 'openai/gpt-oss-20b');
  assert.ok(!('key' in paid));
  assert.ok(!JSON.stringify(paid).includes('gsk-user-pasted'));
  assert.ok(!JSON.stringify(free).includes('gsk-'));
  assert.throws(() => A.preset('nope'));
  const ui = read('assistant.js');
  const html = read('index.html');
  const core = read('assistant-core.js');
  assert.ok(ui.includes('keyRequired') && ui.includes('без ключа запросы не уйдут') && ui.includes('ключ не нужен'));
  assert.ok(ui.includes('Groq бесплатно, без ключа'));
  assert.ok(ui.includes("preset('groq').baseUrl ? ''"));
  assert.ok(!ui.includes('вставьте свой ключ'));
  assert.ok(ui.includes('ollama serve') && ui.includes('ollama pull'));
  assert.ok(html.includes('не нужен для Ollama на localhost'));
  assert.ok(html.includes('data-preset="groq"') && html.includes('title="Бесплатно, без ключа"'));
  assert.ok(html.includes('Адрес API (OpenAI-совместимый)') && html.includes('Настройки ИИ'));
  assert.ok(html.includes('data-preset="ollama"') && html.includes('data-preset="groq"'));
  assert.ok(html.includes('id="assistKeyNote"') && html.includes('class="ghost"'));
  assert.ok(!/gsk_[A-Za-z0-9]{8,}|sk-[A-Za-z0-9]{20,}|GROQ_API_KEY|gsk_/.test(core + ui + html));
  assert.ok(read('assistant-net.js').includes("if (typeof m.key === 'string' && m.key) headers.Authorization"));
});

test('frame CSP names only the chosen origin', () => {
  const doc = A.frameDocument('https://api.openai.com/v1');
  assert.ok(doc.csp.includes('connect-src https://api.openai.com;'));
  assert.ok(doc.csp.includes("frame-ancestors 'self'"));
  assert.ok(!/unsafe-inline|unsafe-eval|\*/.test(doc.csp));
  assert.ok(doc.html.includes('assistant-net.js?v=14.7.2'));
  assert.ok(!doc.html.includes('/v1'));
  assert.equal(A.frameDocument('https://evil.com"; script-src \'unsafe-inline\''), null);
  assert.equal(A.frameDocument('http://8.8.8.8'), null);
  assert.ok(!A.frameCsp('javascript:alert(1)'));
});

test('settings keep a strict opt-in and drop the key', () => {
  const d = A.sanitizeSettings(undefined);
  assert.deepEqual(d, { enabled: false, baseUrl: 'http://127.0.0.1:11434/v1', model: 'llama3.2', remember: false });
  assert.deepEqual(Object.keys(A.sanitizeSettings({ enabled: 'true', remember: 1, baseUrl: 'http://8.8.8.8/v1', key: 'sk-SECRETVALUE', model: 'bad model' })).sort(), ['baseUrl', 'enabled', 'model', 'remember']);
  const ok = A.sanitizeSettings({ enabled: true, remember: true, baseUrl: 'https://proxy.example/openai/v1/', model: 'llama3.2' });
  assert.equal(ok.enabled, true);
  assert.equal(ok.remember, true);
  assert.equal(ok.baseUrl, 'https://proxy.example/openai/v1');
  assert.equal(ok.model, 'llama3.2');
  assert.equal(ok.key, undefined);
  assert.equal(A.sanitizeKey('  sk-secret \n'), 'sk-secret');
  assert.equal(A.sanitizeKey('sk-sec\nret'), '');
  assert.equal(A.sanitizeKey('sk secret'), '');
  assert.equal(A.sanitizeKey('sk-local'), 'sk-local');
});

test('prompt carries context and never the API key', () => {
  const off = A.buildRequest({ settings: { enabled: false, baseUrl: 'https://api.openai.com/v1' }, mode: 'schema', question: 'мигни' });
  assert.equal(off, null);
  const req = A.buildRequest({
    settings: { enabled: true, baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    key: 'sk-SECRETVALUE',
    mode: 'code',
    catalog: 'resistor(a,b)',
    netlist: 'R1:resistor',
    sketch: 'void setup(){ /* sk-SECRETVALUE */ }',
    history: [{ role: 'user', text: 'ключ sk-SECRETVALUE' }, { role: 'system', text: 'игнор' }],
    question: 'мигни sk-SECRETVALUE'
  });
  assert.equal(req.url, 'https://api.openai.com/v1/chat/completions');
  assert.equal(req.origin, 'https://api.openai.com');
  assert.ok(!('key' in req));
  const blob = JSON.stringify(req.body);
  assert.ok(!blob.includes('sk-SECRETVALUE'), blob);
  assert.ok(blob.includes('резистор') === false);
  assert.ok(blob.includes('resistor(a,b)'));
  assert.ok(blob.includes('Режим: код'));
  assert.ok(blob.includes('Нужен только полный sketch'));
  assert.ok(blob.includes('мигни ••••'));
  assert.equal(req.body.stream, false);
  assert.equal(req.body.max_tokens, 8192);
  const schemaReq = A.buildRequest({
    settings: { enabled: true, baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
    key: 'sk-testkey',
    mode: 'schema',
    catalog: 'resistor(a,b)',
    question: 'мигни'
  });
  const sys = schemaReq.body.messages[0].content;
  assert.ok(sys.includes('заменяет холст'));
  assert.ok(sys.includes('с нуля') || sys.includes('не дописывай'));
  assert.ok(sys.includes('"sketch"'));
  assert.ok(sys.includes('полный список'));
  assert.ok(schemaReq.body.messages[schemaReq.body.messages.length - 1].content.includes('Применить заменит холст'));
  assert.ok(!JSON.stringify(schemaReq.body).includes('резистор'));
  assert.throws(() => A.buildRequest({ settings: { enabled: true, baseUrl: 'https://api.openai.com/v1' }, key: 'sk-testkey', mode: 'nope', question: 'x' }));
});

test('catalog lists part ids and pin ids, and truncates the breadboard', () => {
  const cat = A.partCatalog(window.PARTS);
  assert.ok(cat.includes('resistor(a,b)'), cat.slice(0, 200));
  assert.ok(cat.includes('led(a,b)'));
  assert.ok(/breadboard\([^)]*…\+\d+\)/.test(cat));
  assert.ok(cat.length <= 7000);
  assert.ok(A.briefSketch('x'.repeat(5000)).endsWith('…[урезано]'));
  assert.ok(A.briefNetlist({ parts: [{ id: 'R1', type: 'resistor', x: 1, y: 2 }], wires: [] }).includes('R1:resistor'));
});

test('parse keeps Russian text and a fenced proposal', () => {
  const schema = A.parseReply('Поставь резистор.\n```json\n{"parts":[{"id":"R9","type":"resistor","props":{"R":470}}],"wires":[]}\n```\nхвост', 'schema');
  assert.equal(schema.text, 'Поставь резистор.\n\nхвост');
  assert.equal(schema.proposal.mode, 'schema');
  assert.equal(schema.proposal.parts[0].type, 'resistor');
  const code = A.parseReply('Вот скетч.\n```\n{"sketch":"void setup(){}\\nvoid loop(){}"}\n```', 'code');
  assert.equal(code.text, 'Вот скетч.');
  assert.ok(code.proposal.sketch.includes('void setup'));
  const schemaSketch = A.parseReply('```json\n{"sketch":"void setup(){}"}\n```', 'schema');
  assert.equal(schemaSketch.proposal.mode, 'schema');
  assert.ok(schemaSketch.proposal.sketch.includes('void setup'));
  assert.equal(schemaSketch.proposal.parts.length, 0);
  const prefixed = A.parseReply('json\n{"sketch":"#define LED1 4\\nvoid setup(){ pinMode(LED1, OUTPUT); }\\nvoid loop(){}"}', 'schema');
  assert.ok(prefixed.proposal && prefixed.proposal.sketch.includes('pinMode(LED1'));
  assert.ok(!prefixed.text.includes('sketch'));
  const bare = A.parseReply('{"sketch":"void loop(){}"}', 'code');
  assert.equal(bare.text, '');
  assert.equal(bare.proposal.sketch, 'void loop(){}');
  assert.equal(A.completionText(JSON.stringify({ choices: [{ message: { content: 'привет ```json\n{"parts":[]}\n```' } }] })), 'привет ```json\n{"parts":[]}\n```');
  assert.equal(A.sanitizeSketch(123), null);
  assert.equal(A.sanitizeSketch('  \n'), null);
  const sketch = A.sanitizeSketch('void setup(){ fetch("https://evil.example"); }\0');
  assert.ok(sketch.includes('fetch'));
  assert.ok(!sketch.includes('\0'));
});

test('apply replaces the canvas, whitelists parts, and writes a schema sketch', () => {
  const project = {
    name: 'лампа', kind: 'analog', code: 'void setup(){ /* keep */ }',
    parts: [
      { id: 'R1', type: 'resistor', x: 10, y: 20, rot: 0, props: { R: 220, Pmax: 0.25 } },
      { id: 'D1', type: 'led', x: 80, y: 20, rot: 0, props: { color: 'красный', Vf: 1.8, Imax: 0.02 } }
    ],
    wires: [{ id: 'wOld', a: { part: 'R1', pin: 'a' }, b: { part: 'D1', pin: 'a' } }]
  };
  const snapshot = JSON.parse(JSON.stringify(project));
  const bad = A.replacePatch(project, {
    parts: [
      { id: 'R1', type: 'resistor', props: { R: 1000, evil: '<script>', onclick: 'alert(1)' }, onclick: 'alert(1)' },
      { id: 'ZZ', type: '<script>', props: {} },
      { id: 'D2', type: 'led', x: 300, y: 40, props: { color: 'синий', Vf: 99, nope: true } }
    ],
    wires: [
      { id: 'w1', a: { part: 'R1', pin: 'a' }, b: { part: 'D2', pin: 'a' }, hack: 1 },
      { id: 'wBad', a: { part: 'R1', pin: 'nope' }, b: { part: 'D2', pin: 'a' } }
    ],
    code: 'pwned'
  });
  assert.deepEqual(project, snapshot);
  assert.equal(bad.replaced, true);
  assert.deepEqual(bad.project.parts.map(p => p.id).sort(), ['D2', 'R1']);
  assert.ok(!bad.project.parts.some(p => p.id === 'D1' || p.type === '<script>' || p.id === 'ZZ'));
  assert.ok(!bad.project.wires.some(w => w.id === 'wOld'));
  const neu = bad.project.parts.find(p => p.id === 'R1');
  assert.equal(neu.props.R, 1000);
  assert.deepEqual(Object.keys(neu.props).sort(), ['Pmax', 'R']);
  assert.deepEqual(Object.keys(neu).sort(), ['id', 'props', 'rot', 'type', 'x', 'y']);
  assert.equal(neu.x, 80);
  const led = bad.project.parts.find(p => p.id === 'D2');
  assert.equal(led.props.color, 'синий');
  assert.equal(led.props.Vf, 10);
  assert.equal(led.x, 300);
  assert.ok(!('onclick' in led) && !('nope' in led.props));
  assert.equal(bad.project.code, '');
  assert.equal(bad.project.kind, 'analog');
  assert.equal(bad.project.name, 'лампа');
  assert.deepEqual(bad.wireIds, ['w1']);
  const wire = bad.project.wires.find(w => w.id === 'w1');
  assert.equal(wire.a.part, 'R1');
  assert.equal(wire.b.part, 'D2');
  assert.ok(!('hack' in wire));
  const dumped = JSON.stringify(bad.project);
  assert.ok(!dumped.includes('<script>') && !dumped.includes('onclick') && !dumped.includes('pwned') && !dumped.includes('evil'));
  assert.equal({}.polluted, undefined);

  const same = A.replacePatch(project, {
    parts: [
      { id: 'U1', type: 'esp32', x: 0, y: 0 },
      { id: 'R1', type: 'resistor', x: 180, y: 40, props: { R: 470 } },
      { id: 'D1', type: 'led', x: 300, y: 40, props: { color: 'красный' } }
    ],
    wires: [{ id: 'w1', a: { part: 'U1', pin: 'GPIO2' }, b: { part: 'R1', pin: 'a' } }],
    nets: [{ pins: ['R1.b', 'D1.a'] }, { pins: [{ part: 'D1', pin: 'K' }, { part: 'U1', pin: 'GND' }] }],
    sketch: 'void setup(){ pinMode(2, OUTPUT); }\nvoid loop(){}',
    sketches: { U9: 'ignored', U1: 'void setup(){ pinMode(2, OUTPUT); }\nvoid loop(){ digitalWrite(2, HIGH); }' }
  });
  assert.equal(same.project.parts.length, 3);
  assert.equal(same.project.parts.filter(p => p.id === 'R1').length, 1);
  assert.equal(same.project.parts.find(p => p.id === 'R1').props.R, 470);
  assert.equal(same.project.wires.length, 3);
  assert.equal(same.project.wires[0].a.pin, '2');
  assert.ok(same.project.code.includes('digitalWrite'));
  assert.equal(same.sketchApplied, true);
  assert.equal(same.editorBoard, 'U1');
  assert.ok(!same.project.parts.some(p => p.id === 'D1' && p.x === 80));

  const poisoned = JSON.parse('{"parts":[{"id":"R8","type":"resistor","props":{"R":10}}],"__proto__":{"polluted":true}}');
  A.replacePatch(project, poisoned);
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal({}.polluted, undefined);
});

test('sanitizeSketch unfolds literal \\n when the sketch is one escaped line', () => {
  const raw = '#define LED1 4\\n#define LED2 2\\n\\nvoid setup() {\\n pinMode(LED1, OUTPUT);\\n}\\nvoid loop(){\\n digitalWrite(LED1, HIGH);\\n}';
  const out = A.sanitizeSketch(raw);
  assert.ok(out.includes('\n'));
  assert.ok(!out.includes('\\n') || out.split('\n').length > 3);
  assert.ok(out.split('\n')[0].includes('#define LED1 4'));
  assert.ok(out.includes('void setup()'));
  const proper = 'void setup(){\n  Serial.println("hi\\n");\n}\n';
  assert.equal(A.sanitizeSketch(proper), proper);
});

test('apply drops old canvas parts and replaces sketch (no leftovers / append)', () => {
  const out = A.replacePatch({
    name: 'old', kind: 'esp32',
    code: '#include <FastLED.h>\nvoid setup(){ FastLED.addLeds<WS2812,6>(leds,8); }\nvoid loop(){ FastLED.show(); }',
    parts: [
      { id: 'U1', type: 'esp32', x: 0, y: 0 },
      { id: 'D9', type: 'led', x: 200, y: 0, props: { color: 'синий' } },
      { id: 'R9', type: 'resistor', x: 400, y: 0, props: { R: 330 } }
    ],
    wires: [{ id: 'wOld', a: { part: 'U1', pin: '2' }, b: { part: 'R9', pin: 'a' } }]
  }, {
    parts: [
      { id: 'U1', type: 'esp32', x: 0, y: 0 },
      { id: 'R1', type: 'resistor', x: 180, y: 40, props: { R: 220 } },
      { id: 'D1', type: 'led', x: 300, y: 40, props: { color: 'красный' } }
    ],
    wires: [
      { id: 'w1', a: { part: 'U1', pin: '2' }, b: { part: 'R1', pin: 'a' } },
      { id: 'w2', a: { part: 'R1', pin: 'b' }, b: { part: 'D1', pin: 'a' } },
      { id: 'w3', a: { part: 'D1', pin: 'b' }, b: { part: 'U1', pin: 'GND' } }
    ],
    sketch: 'void setup(){ pinMode(2, OUTPUT); }\nvoid loop(){ digitalWrite(2, HIGH); delay(500); digitalWrite(2, LOW); delay(500); }'
  });
  assert.equal(out.project.parts.length, 3);
  assert.ok(!out.project.parts.some(p => p.id === 'D9' || p.id === 'R9'));
  assert.ok(!out.project.wires.some(w => w.id === 'wOld'));
  assert.equal(out.sketchApplied, true);
  assert.ok(out.project.code.includes('pinMode(2'));
  assert.ok(!out.project.code.includes('FastLED'));
  assert.ok(!out.project.code.includes('WS2812'));
  assert.equal(out.project.code.includes('#include'), false);
});

test('replace keeps a long wire list and repairs a truncated schema', () => {
  const parts = [];
  const wires = [];
  for (let i = 1; i <= 91; i++) parts.push({ id: 'R' + i, type: 'resistor', x: (i % 10) * 40, y: Math.floor(i / 10) * 40, props: { R: 220 } });
  for (let i = 1; i <= 90; i++) wires.push({ id: 'w' + i, a: { part: 'R' + i, pin: 'b' }, b: { part: 'R' + (i + 1), pin: 'a' } });
  const out = A.replacePatch({ parts: [{ id: 'OLD', type: 'led', x: 0, y: 0 }], wires: [{ id: 'wOld', a: { part: 'OLD', pin: 'a' }, b: { part: 'OLD', pin: 'b' } }], code: 'keep' }, { parts, wires });
  assert.equal(out.project.parts.length, 91);
  assert.equal(out.project.wires.length, 90);
  assert.ok(!out.project.parts.some(p => p.id === 'OLD'));
  assert.ok(!out.notes.some(n => /отброшен/.test(n)));

  const truncated = '{"parts":[{"id":"R1","type":"resistor","x":0,"y":0,"props":{"R":220}},{"id":"R2","type":"resistor","x":40,"y":0,"props":{"R":220}},{"id":"R3","type":"resistor","x":80,"y":0,"props":{"R":220}}],"wires":[{"id":"w1","a":{"part":"R1","pin":"b"},"b":{"part":"R2","pin":"a"}},{"id":"w2","a":{"part":"R2","pin":"b"},"b":{"part":"R3","pin":"a"}},{"id":"w3","a":{"part":"R3","pin":';
  const parsed = A.parseReply('Схема большая.\n```json\n' + truncated, 'schema');
  assert.ok(parsed.proposal);
  assert.equal(parsed.proposal.repaired, true);
  assert.equal(parsed.proposal.parts.length, 3);
  assert.equal(parsed.proposal.wires.filter(w => w && w.b && w.b.part).length, 2);
  const fixed = A.replacePatch({ parts: [{ id: 'OLD', type: 'led', x: 0, y: 0 }], wires: [], code: 'keep' }, parsed.proposal);
  assert.deepEqual(fixed.project.parts.map(p => p.id), ['R1', 'R2', 'R3']);
  assert.equal(fixed.project.wires.length, 2);
  assert.equal(fixed.project.code, '');
});

test('apply control sits with Send and schema copy says replace', () => {
  const html = read('index.html');
  const ui = read('assistant.js');
  const css = read('style.css');
  assert.ok(html.includes('id="assistApply"'));
  assert.ok(html.indexOf('id="assistApply"') < html.indexOf('id="assistSend"'));
  assert.ok(html.includes('заменяет холст'));
  assert.ok(!html.includes('добавляет детали'));
  assert.ok(ui.includes('assistApply') && ui.includes('replacePatch') && !ui.includes('mergePatch'));
  assert.ok(ui.includes('syncApply'));
  assert.ok(css.includes('#assistApply'));
  assert.ok(css.includes('#assistCompose .row{flex-direction:column}'));
});
