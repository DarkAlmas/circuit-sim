// Simulator UI prefs: known keys only, strict booleans, font small|normal|large.
const test = require('node:test'), assert = require('node:assert');
global.window = {};
require('../sanitize.js');
const s = window.sanitizeUiSettings;
const defaults = { holdMenu: false, canvasProps: true, labelFont: 'normal', showWireBtn: true, showDelBtn: true, codeFont: 14, portPower: false };
const keys = ['canvasProps', 'codeFont', 'holdMenu', 'labelFont', 'portPower', 'showDelBtn', 'showWireBtn'];

test('ui settings default when missing or junk', () => {
  for (const raw of [undefined, null, 0, 'true', [], true, 1]) assert.deepEqual(s(raw), defaults);
  assert.deepEqual(s({}), defaults);
  assert.equal(window.UI_SETTINGS_KEY, 'circuitsim.ui');
});

test('ui settings keep only strict booleans and small|normal|large', () => {
  assert.deepEqual(s({ holdMenu: 'true', canvasProps: 1, labelFont: 'huge', evil: '<script>', font: 'large' }), defaults);
  assert.deepEqual(s({ holdMenu: false, canvasProps: false, labelFont: 'small' }), { holdMenu: false, canvasProps: false, labelFont: 'small', showWireBtn: true, showDelBtn: true, codeFont: 14, portPower: false });
  assert.deepEqual(s({ holdMenu: true, canvasProps: true, labelFont: 'large', extra: 1 }), { holdMenu: true, canvasProps: true, labelFont: 'large', showWireBtn: true, showDelBtn: true, codeFont: 14, portPower: false });
  for (const f of ['small', 'normal', 'large']) assert.equal(s({ labelFont: f }).labelFont, f);
  assert.equal(s({ labelFont: 'Large' }).labelFont, 'normal');
  assert.equal(s({ labelFont: ' normal ' }).labelFont, 'normal');
  assert.equal(s({ holdMenu: false }).holdMenu, false);
  assert.equal(s({ canvasProps: false }).canvasProps, false);
  assert.equal(s({ holdMenu: null }).holdMenu, false);
  assert.equal(s({ canvasProps: 'false' }).canvasProps, true);
  assert.equal(s({ showWireBtn: false }).showWireBtn, false);
  assert.equal(s({ showDelBtn: false }).showDelBtn, false);
  assert.equal(s({ showWireBtn: 'false' }).showWireBtn, true);
  assert.equal(s({ showDelBtn: 0 }).showDelBtn, true);
  assert.equal(s({ codeFont: 16 }).codeFont, 16);
  assert.equal(s({ codeFont: 14 }).codeFont, 14);
  assert.equal(s({ codeFont: '16' }).codeFont, 14);
  assert.equal(s({ codeFont: 15 }).codeFont, 14);
  assert.equal(s({ codeFont: 13 }).codeFont, 14);
  assert.equal(s({ pmFont: '16' }).codeFont, 14);
  assert.equal(s({ portPower: true }).portPower, true);
  assert.equal(s({ portPower: false }).portPower, false);
  assert.equal(s({ portPower: 'true' }).portPower, false);
  assert.equal(s({ portPower: 1 }).portPower, false);
  assert.equal(s({ portPower: null }).portPower, false);
  const a = s({ holdMenu: true }); a.evil = 1; a.holdMenu = 'no';
  assert.deepEqual(s(undefined), defaults);
  assert.deepEqual(Object.keys(s({ holdMenu: true, nope: false, pmFont: '16' })).sort(), keys);
});
