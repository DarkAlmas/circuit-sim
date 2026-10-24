const test = require('node:test'), assert = require('node:assert');
global.window = { Solver: require('../solver.js') };
require('../parts.js'); require('../parts2.js'); require('../sanitize.js'); require('../netlist.js'); require('../examples.js');
const W = global.window, T = require('../transpile.js');
test('every starter sanitizes and solves', () => {
  for (const [k, s] of Object.entries(W.STARTERS)) {
    const p = W.sanitizeProject(s); assert.equal(p.parts.length, s.parts.length, k); assert.equal(p.wires.length, s.wires.length, k);
    if (!p.parts.length) continue;
    const b = W.Netlist.build(p, {}); const sol = W.Solver.solve(b.circuit, {}); assert.ok(sol.ok, k + ': ' + sol.error);
  }
});
test('starter code transpiles', () => {
  for (const [k, s] of Object.entries(W.STARTERS)) { if (!s.code) continue;
    const js = k === 'opi' ? T.py(s.code) : T.transpile(s.code); assert.doesNotThrow(() => new Function('"use strict";' + js), k); }
});
test('python transpiler rejects class/lambda', () => {
  assert.throws(() => T.py('class A:\n    pass'), /class/); assert.throws(() => T.py('f = lambda x: x'), /lambda/);
});
