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
  assert.ok(html.includes('assistant-core.js?v=14.6.0') && html.includes('assistant.js?v=14.6.0'));
  assert.ok(html.includes('style.css?v=14.6.0'));
  assert.equal(A.VERSION, '14.6.0');
  assert.ok(read('sw-assistant.js').includes('assistant-core.js?v=14.6.0'));
  assert.ok(read('assistant-net.js').includes("VERSION = '14.6.0'"));
  assert.ok(read('app.js').includes("new Worker('worker.js?v=14.6.0')"));
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
  assert.equal(A.chatUrl('https://api.openai.com/v1/chat/completions'), 'https://api.openai.com/v1/chat/completions');
  assert.equal(A.chatUrl('https://api.openai.com/v1?token=secret#x'), 'https://api.openai.com/v1/chat/completions');
  assert.equal(A.normalizeBase('http://8.8.8.8/v1'), '');
});

test('frame CSP names only the chosen origin', () => {
  const doc = A.frameDocument('https://api.openai.com/v1');
  assert.ok(doc.csp.includes('connect-src https://api.openai.com;'));
  assert.ok(doc.csp.includes("frame-ancestors 'self'"));
  assert.ok(!/unsafe-inline|unsafe-eval|\*/.test(doc.csp));
  assert.ok(doc.html.includes('assistant-net.js?v=14.6.0'));
  assert.ok(!doc.html.includes('/v1'));
  assert.equal(A.frameDocument('https://evil.com"; script-src \'unsafe-inline\''), null);
  assert.equal(A.frameDocument('http://8.8.8.8'), null);
  assert.ok(!A.frameCsp('javascript:alert(1)'));
});

test('settings keep a strict opt-in and drop the key', () => {
  const d = A.sanitizeSettings(undefined);
  assert.deepEqual(d, { enabled: false, baseUrl: '', model: 'gpt-4o-mini', remember: false });
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
  assert.ok(blob.includes('мигни ••••'));
  assert.equal(req.body.stream, false);
  assert.throws(() => A.buildRequest({ settings: { enabled: true, baseUrl: 'https://api.openai.com/v1' }, mode: 'nope', question: 'x' }));
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
  const wrong = A.parseReply('```json\n{"sketch":"void setup(){}"}\n```', 'schema');
  assert.equal(wrong.proposal, null);
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

test('apply keeps the circuit, whitelists parts, and does not run the sketch', () => {
  const project = {
    name: 'лампа', kind: 'analog', code: 'void setup(){ /* keep */ }',
    parts: [
      { id: 'R1', type: 'resistor', x: 10, y: 20, rot: 0, props: { R: 220, Pmax: 0.25 } },
      { id: 'D1', type: 'led', x: 80, y: 20, rot: 0, props: { color: 'красный', Vf: 1.8, Imax: 0.02 } }
    ],
    wires: []
  };
  const snapshot = JSON.parse(JSON.stringify(project));
  const linked = A.mergePatch(project, { parts: [], wires: [{ id: 'w9', a: { part: 'R1', pin: 'a' }, b: { part: 'D1', pin: 'a' }, evil: true }] });
  assert.deepEqual(project, snapshot);
  assert.deepEqual(linked.addedParts, []);
  assert.deepEqual(linked.addedWires, ['w9']);
  assert.equal(linked.project.code, project.code);
  assert.equal(linked.project.kind, 'analog');
  assert.ok(!('evil' in linked.project.wires[0]));

  const bad = A.mergePatch(project, {
    parts: [
      { id: 'R1', type: 'resistor', props: { R: 1000, evil: '<script>', onclick: 'alert(1)' }, onclick: 'alert(1)' },
      { id: 'ZZ', type: '<script>', props: {} },
      { id: 'D2', type: 'led', x: 300, y: 40, props: { color: 'синий', Vf: 99, nope: true } }
    ],
    wires: [
      { id: 'w1', a: { part: 'R1', pin: 'a' }, b: { part: 'D2', pin: 'a' }, hack: 1 },
      { id: 'wBad', a: { part: 'R1', pin: 'nope' }, b: { part: 'D2', pin: 'a' } }
    ],
    sketch: 'ignored in schema mode',
    code: 'pwned'
  });
  assert.deepEqual(project, snapshot);
  assert.ok(bad.addedParts.includes('D2'));
  assert.ok(!bad.addedParts.includes('R1'));
  assert.ok(!bad.project.parts.some(p => p.type === '<script>' || p.id === 'ZZ'));
  const neu = bad.project.parts.find(p => p.id !== 'R1' && p.type === 'resistor');
  assert.ok(neu && neu.id !== 'R1');
  assert.equal(neu.props.R, 1000);
  assert.deepEqual(Object.keys(neu.props).sort(), ['Pmax', 'R']);
  assert.deepEqual(Object.keys(neu).sort(), ['id', 'props', 'rot', 'type', 'x', 'y']);
  assert.equal(neu.x, 240);
  const led = bad.project.parts.find(p => p.id === 'D2');
  assert.equal(led.props.color, 'синий');
  assert.equal(led.props.Vf, 10);
  assert.equal(led.x, 300);
  assert.ok(!('onclick' in led) && !('nope' in led.props));
  const old = bad.project.parts.find(p => p.id === 'R1');
  assert.equal(old.props.R, 220);
  assert.equal(bad.project.code, 'void setup(){ /* keep */ }');
  assert.ok(bad.addedWires.includes('w1'));
  assert.ok(!bad.addedWires.includes('wBad'));
  const wire = bad.project.wires.find(w => w.id === 'w1');
  assert.equal(wire.a.part, neu.id);
  assert.equal(wire.b.part, 'D2');
  assert.ok(!('hack' in wire));
  const dumped = JSON.stringify(bad.project);
  assert.ok(!dumped.includes('<script>') && !dumped.includes('onclick') && !dumped.includes('pwned') && !dumped.includes('evil'));
  assert.equal({}.polluted, undefined);

  const poisoned = JSON.parse('{"parts":[{"id":"R8","type":"resistor","props":{"R":10}}],"__proto__":{"polluted":true}}');
  A.mergePatch(project, poisoned);
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal({}.polluted, undefined);
});
