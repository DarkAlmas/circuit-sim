const test = require('node:test'), assert = require('node:assert');
global.window = { Solver: require('../solver.js') };
require('../parts.js'); require('../sanitize.js');
const bad = require('./fixtures/malicious.json');
test('malicious import is neutralized', () => {
  const s = window.sanitizeProject(bad);
  assert.deepEqual(s.parts.map(p => p.id), ['R1', 'D1']);
  const r = s.parts[0];
  assert.equal(r.x, 0); assert.equal(r.y, 0); assert.ok([0,1,2,3].includes(r.rot)); assert.equal(r.props.R, 220);
  assert.ok(!('evil' in r.props) && !('onclick' in r));
  assert.equal(s.parts[1].props.color, 'красный');
  assert.deepEqual(s.wires.map(w => w.id), ['w1']);
  const json = JSON.stringify(s.parts) + JSON.stringify(s.wires);
  assert.ok(!/[<>"]/.test(json.replace(/\\"|"/g, '')), json);
  assert.equal(window.esc('<a href="x">'), '&lt;a href=&quot;x&quot;&gt;');
});
test('garbage input', () => { assert.throws(() => window.sanitizeProject(null)); assert.deepEqual(window.sanitizeProject({}).parts, []); });
