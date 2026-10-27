/* Assistant proposals, settings and the one-origin network policy.
   No fetch and no eval: the page stays offline until the user opts in,
   and a sketch is only text until the existing worker transpiles it. */
(function () {
  'use strict';
  var VERSION = '14.6.1';
  var SETTINGS_KEY = 'circuitsim.assistant';
  var KEY_KEY = 'circuitsim.assistant.key';
  var HTTPS_ORIGIN = /^https:\/\/[A-Za-z0-9.-]{1,253}(?::[0-9]{1,5})?$/;
  var HTTP_ORIGIN = /^http:\/\/(?:localhost|\[::1\]|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?::[0-9]{1,5})?$/;
  var MODEL_RE = /^[A-Za-z0-9._:@+/-]{1,64}$/;
  var PIN_RE = /^[A-Za-z0-9_-]{1,32}$/;
  var PRE = { resistor: 'R', ldr: 'R', ntc: 'R', led: 'D', diode: 'D', npn: 'Q', button: 'S', switch: 'S', pot: 'RV', dc: 'V', battery: 'B', gnd: 'G', breadboard: 'BB', voltmeter: 'PV', ammeter: 'PA' };

  function deps() {
    var w = (typeof globalThis.window === 'object' && globalThis.window) || globalThis;
    return {
      PARTS: w.PARTS || {},
      sanitizeProject: w.sanitizeProject,
      ID: w.ID_RE || /^[A-Za-z0-9_-]{1,32}$/,
      LIMITS: w.SANITIZE_LIMITS || { code: 100000 }
    };
  }

  function httpHostOk(hostname) {
    var h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (h === 'localhost' || h === '::1') return true;
    var m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
    if (!m) return false;
    var o = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    if (o.some(function (n) { return n > 255; })) return false;
    if (o[0] === 127 || o[0] === 10) return true;
    if (o[0] === 192 && o[1] === 168) return true;
    if (o[0] === 172 && o[1] >= 16 && o[1] <= 31) return true;
    return false;
  }

  function endpointOrigin(input) {
    if (typeof input !== 'string') return '';
    var s = input.trim();
    if (!s || s.length > 512 || /[\s"'<>]/.test(s)) return '';
    var u;
    try { u = new URL(s); } catch (e) { return ''; }
    if (u.username || u.password || !u.origin || u.origin === 'null') return '';
    if (u.port && (+u.port < 1 || +u.port > 65535)) return '';
    if (u.protocol === 'https:' && HTTPS_ORIGIN.test(u.origin)) return u.origin;
    if (u.protocol === 'http:' && HTTP_ORIGIN.test(u.origin) && httpHostOk(u.hostname)) return u.origin;
    return '';
  }

  function normalizeBase(input) {
    if (!endpointOrigin(input)) return '';
    var u = new URL(String(input).trim());
    u.hash = '';
    u.search = '';
    u.username = '';
    u.password = '';
    var path = u.pathname.replace(/\/+$/, '');
    if (path === '/') path = '';
    return u.origin + path;
  }

  function chatUrl(base) {
    var norm = normalizeBase(base);
    if (!norm) return '';
    var u = new URL(norm);
    var path = u.pathname.replace(/\/+$/, '');
    if (!path.endsWith('/chat/completions')) path += '/chat/completions';
    u.pathname = path;
    return u.href;
  }

  function frameCsp(origin) {
    var safe = endpointOrigin(origin);
    if (!safe) return '';
    return "default-src 'none'; script-src 'self'; style-src 'none'; img-src 'none'; connect-src " + safe
      + "; worker-src 'none'; frame-src 'none'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
  }

  function frameDocument(origin) {
    var csp = frameCsp(origin);
    if (!csp || csp.indexOf('"') !== -1) return null;
    var src = 'assistant-net.js?v=' + VERSION;
    var html = '<!doctype html><html lang="ru"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="'
      + csp + '"><title>net</title></head><body><script src="' + src + '"></script></body></html>';
    return { csp: csp, html: html, script: src };
  }

  function sanitizeSettings(raw) {
    var out = { enabled: false, baseUrl: '', model: 'gpt-4o-mini', remember: false };
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
    if (raw.enabled === true) out.enabled = true;
    if (raw.remember === true) out.remember = true;
    if (typeof raw.baseUrl === 'string') out.baseUrl = normalizeBase(raw.baseUrl);
    if (typeof raw.model === 'string' && MODEL_RE.test(raw.model)) out.model = raw.model;
    return out;
  }

  function sanitizeKey(raw) {
    if (typeof raw !== 'string') return '';
    var t = raw.trim();
    if (!t || t.length > 512 || /\s/.test(t) || /[\u0000-\u001f\u007f]/.test(t)) return '';
    return t;
  }

  function redact(text, key) {
    var s = typeof text === 'string' ? text : '';
    if (typeof key !== 'string' || key.length < 8 || s.indexOf(key) === -1) return s;
    return s.split(key).join('••••');
  }

  function proposalFrom(block, mode) {
    var j;
    try { j = JSON.parse(block); } catch (e) { return null; }
    if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
    switch (mode) {
      case 'schema': {
        var parts = Array.isArray(j.parts) ? j.parts.slice(0, 40) : [];
        var wires = Array.isArray(j.wires) ? j.wires.slice(0, 80) : [];
        if (!parts.length && !wires.length) return null;
        return { mode: 'schema', parts: parts, wires: wires };
      }
      case 'code': {
        if (typeof j.sketch !== 'string' || !j.sketch.trim()) return null;
        return { mode: 'code', sketch: j.sketch };
      }
      default: {
        var unknown = mode;
        throw new Error('неизвестный режим: ' + unknown);
      }
    }
  }

  function parseReply(raw, mode) {
    var src = String(raw || '').slice(0, 200000);
    var re = /```(?:json)?[^\n]*\n?([\s\S]*?)```/gi;
    var blocks = [];
    var m;
    while ((m = re.exec(src))) blocks.push(m[1]);
    if (!blocks.length && src.trim().charAt(0) === '{') blocks.push(src.trim());
    var proposal = null;
    for (var i = blocks.length - 1; i >= 0 && !proposal; i--) proposal = proposalFrom(blocks[i], mode);
    var text = proposal ? src.replace(/```(?:json)?[^\n]*\n?[\s\S]*?```/gi, '').trim() : src.trim();
    if (proposal && text.charAt(0) === '{') text = '';
    return { text: text, proposal: proposal };
  }

  function sanitizeSketch(raw) {
    if (typeof raw !== 'string') return null;
    var s = raw.replace(/\u0000/g, '').slice(0, deps().LIMITS.code || 100000);
    if (!s.trim()) return null;
    return s;
  }

  function prefixFor(type) {
    var d = deps().PARTS[type] || {};
    if (typeof d.prefix === 'string' && d.prefix) return d.prefix;
    if (d.mcu) return 'U';
    return PRE[type] || 'X';
  }

  function alloc(prefix, used) {
    var p = String(prefix || 'X').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 8) || 'X';
    for (var i = 1; i < 10000; i++) {
      var id = (p + i).slice(0, 32);
      if (!used.has(id)) return id;
    }
    return '';
  }

  function cleanPart(raw) {
    var D = deps();
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    if (typeof raw.type !== 'string' || !Object.prototype.hasOwnProperty.call(D.PARTS, raw.type)) return null;
    if (typeof D.sanitizeProject !== 'function') throw new Error('нет sanitize');
    var src = raw.props && typeof raw.props === 'object' && !Array.isArray(raw.props) ? raw.props : {};
    var def = D.PARTS[raw.type].props || {};
    var props = {};
    for (var k in def) if (Object.prototype.hasOwnProperty.call(def, k) && Object.prototype.hasOwnProperty.call(src, k)) props[k] = src[k];
    var draft = { id: 'Tmp1', type: raw.type, rot: raw.rot, props: props };
    if (Number.isFinite(Number(raw.x))) draft.x = Number(raw.x);
    if (Number.isFinite(Number(raw.y))) draft.y = Number(raw.y);
    var one = D.sanitizeProject({ parts: [draft], wires: [] });
    return one.parts[0] || null;
  }

  function anchor(project) {
    var parts = project && Array.isArray(project.parts) ? project.parts : [];
    var maxX = -Infinity, minY = Infinity, any = false;
    for (var i = 0; i < parts.length; i++) {
      if (Number.isFinite(+parts[i].x)) { any = true; if (+parts[i].x > maxX) maxX = +parts[i].x; }
      if (Number.isFinite(+parts[i].y) && +parts[i].y < minY) minY = +parts[i].y;
    }
    if (!any) return { x: 80, y: 80 };
    return { x: maxX + 160, y: Number.isFinite(minY) ? minY : 80 };
  }

  function endOf(e, map, projectIds) {
    if (!e || typeof e !== 'object' || typeof e.part !== 'string' || typeof e.pin !== 'string' || !PIN_RE.test(e.pin)) return null;
    var part = map.has(e.part) ? map.get(e.part) : (projectIds.has(e.part) ? e.part : '');
    if (!part) return null;
    return { part: part, pin: e.pin };
  }

  function mergePatch(project, patch) {
    var D = deps();
    if (typeof D.sanitizeProject !== 'function') throw new Error('нет sanitize');
    var base = project && typeof project === 'object' ? project : {};
    var partsIn = patch && Array.isArray(patch.parts) ? patch.parts.slice(0, 40) : [];
    var wiresIn = patch && Array.isArray(patch.wires) ? patch.wires.slice(0, 80) : [];
    var used = new Set();
    var projectIds = new Set();
    var oldParts = Array.isArray(base.parts) ? base.parts : [];
    var oldWires = Array.isArray(base.wires) ? base.wires : [];
    for (var i = 0; i < oldParts.length; i++) if (oldParts[i] && oldParts[i].id) { used.add(oldParts[i].id); projectIds.add(oldParts[i].id); }
    for (var j = 0; j < oldWires.length; j++) if (oldWires[j] && oldWires[j].id) used.add(oldWires[j].id);
    var map = new Map();
    var fresh = [];
    var notes = [];
    var spot = anchor(base);
    var slot = 0;
    for (var p = 0; p < partsIn.length; p++) {
      var raw = partsIn[p];
      var cleaned = cleanPart(raw);
      if (!cleaned) { notes.push('деталей нет в списке'); continue; }
      var given = raw && typeof raw.id === 'string' ? raw.id : '';
      var id = given && D.ID.test(given) && !used.has(given) ? given : alloc(prefixFor(cleaned.type), used);
      if (!id) { notes.push('нет свободного id'); continue; }
      used.add(id);
      if (given && !map.has(given)) map.set(given, id);
      var row = { id: id, type: cleaned.type, x: cleaned.x, y: cleaned.y, rot: cleaned.rot, props: cleaned.props };
      if (!raw || !Number.isFinite(Number(raw.x)) || !Number.isFinite(Number(raw.y))) {
        row.x = spot.x;
        row.y = spot.y + slot * 100;
        slot++;
      }
      fresh.push(row);
    }
    var freshWires = [];
    for (var w = 0; w < wiresIn.length; w++) {
      var rw = wiresIn[w];
      var a = endOf(rw && rw.a, map, projectIds);
      var b = endOf(rw && rw.b, map, projectIds);
      if (!a || !b) { notes.push('провод без своих выводов'); continue; }
      var wid = rw && typeof rw.id === 'string' && D.ID.test(rw.id) && !used.has(rw.id) ? rw.id : alloc('w', used);
      if (!wid) continue;
      used.add(wid);
      var wire = { id: wid, a: a, b: b };
      if (Array.isArray(rw.pts)) wire.pts = rw.pts.slice(0, 50);
      if (typeof rw.color === 'string') wire.color = rw.color;
      freshWires.push(wire);
    }
    var merged = {
      parts: oldParts.concat(fresh),
      wires: oldWires.concat(freshWires),
      code: typeof base.code === 'string' ? base.code : '',
      codes: base.codes, name: base.name, kind: base.kind, robot: base.robot
    };
    var out = D.sanitizeProject(merged);
    var oldP = new Set(oldParts.map(function (q) { return q && q.id; }));
    var oldW = new Set(oldWires.map(function (q) { return q && q.id; }));
    var addedWires = out.wires.filter(function (q) { return !oldW.has(q.id); }).map(function (q) { return q.id; });
    if (freshWires.length && addedWires.length < freshWires.length) notes.push('часть проводов отброшена');
    var seen = {};
    var uniq = [];
    for (var n = 0; n < notes.length && uniq.length < 6; n++) if (!seen[notes[n]]) { seen[notes[n]] = 1; uniq.push(notes[n]); }
    return {
      project: out,
      addedParts: out.parts.filter(function (q) { return !oldP.has(q.id); }).map(function (q) { return q.id; }),
      addedWires: addedWires,
      notes: uniq
    };
  }

  function partCatalog(parts) {
    var src = parts || deps().PARTS;
    var keys = Object.keys(src).filter(function (k) { return src[k] && Array.isArray(src[k].pins); }).sort();
    var out = [];
    var n = 0;
    for (var i = 0; i < keys.length; i++) {
      var pins = src[keys[i]].pins.map(function (p) { return p.id; });
      var body = pins.length > 16 ? keys[i] + '(' + pins.slice(0, 8).join(',') + ',…+' + (pins.length - 8) + ')' : keys[i] + '(' + pins.join(',') + ')';
      if (n + body.length > 7000) break;
      out.push(body);
      n += body.length + 1;
    }
    return out.join(' ');
  }

  function briefNetlist(project) {
    if (!project || !Array.isArray(project.parts)) return '';
    var parts = project.parts.slice(0, 80).map(function (p) { return p.id + ':' + p.type + '@' + p.x + ',' + p.y; });
    var wires = (project.wires || []).slice(0, 120).map(function (w) {
      return w.id + ':' + (w.a && w.a.part) + '.' + (w.a && w.a.pin) + '-' + (w.b && w.b.part) + '.' + (w.b && w.b.pin);
    });
    return ('детали ' + parts.join(' ') + '\nпровода ' + wires.join(' ')).slice(0, 2500);
  }

  function briefSketch(code) {
    var s = typeof code === 'string' ? code : '';
    if (s.length <= 4000) return s;
    return s.slice(0, 4000) + '\n…[урезано]';
  }

  var SYSTEM = [
    'Ты помощник симулятора схем «Схемотехник». Отвечай по-русски, коротко.',
    'Не пиши, что схема уже изменена: пользователь сам нажимает «Применить».',
    'После текста один блок ```json и ничего после него.',
    'Режим «схема»: {"parts":[{"id":"R1","type":"resistor","x":120,"y":80,"rot":0,"props":{"R":220}}],"wires":[{"id":"w1","a":{"part":"R1","pin":"a"},"b":{"part":"D1","pin":"a"}}]}',
    'type и pin — только id из списка (pin — это id в скобках, не подпись на корпусе). Лишние поля отбрасываются.',
    'Чтобы соединить новую деталь с уже стоящей, укажи id стоящей и не создавай новую с тем же id.',
    'Режим «код»: {"sketch":"полный текст скетча"} — Arduino C или Python для Orange Pi.',
    'Не вставляй HTML и не проси выполнить код на странице.'
  ].join('\n');

  function modeLabel(mode) {
    switch (mode) {
      case 'schema': return 'схема';
      case 'code': return 'код';
      default: {
        var unknown = mode;
        throw new Error('неизвестный режим: ' + unknown);
      }
    }
  }

  function buildRequest(opts) {
    var o = opts || {};
    var settings = sanitizeSettings(o.settings);
    if (!settings.enabled || !settings.baseUrl) return null;
    var url = chatUrl(settings.baseUrl);
    var origin = endpointOrigin(settings.baseUrl);
    if (!url || !origin) return null;
    var question = redact(String(o.question || '').slice(0, 4000), o.key);
    if (!question.trim()) return null;
    var history = Array.isArray(o.history) ? o.history.slice(-6) : [];
    var messages = [{ role: 'system', content: SYSTEM }];
    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      if (!h || (h.role !== 'user' && h.role !== 'assistant') || typeof h.text !== 'string') continue;
      messages.push({ role: h.role, content: redact(h.text.slice(0, 1500), o.key) });
    }
    var user = [
      'Режим: ' + modeLabel(o.mode),
      'Детали (type(пины)): ' + redact(String(o.catalog || '').slice(0, 7000), o.key),
      'Схема: ' + redact(String(o.netlist || '').slice(0, 2500), o.key),
      'Скетч: ' + redact(String(o.sketch || '').slice(0, 4000), o.key),
      'Вопрос: ' + question
    ].join('\n');
    messages.push({ role: 'user', content: user });
    return {
      url: url,
      origin: origin,
      body: { model: settings.model, temperature: 0.2, stream: false, messages: messages }
    };
  }

  function completionText(raw) {
    var j;
    try { j = JSON.parse(raw); } catch (e) { return String(raw || ''); }
    if (!j || typeof j !== 'object') return '';
    var c = j.choices && j.choices[0];
    var msg = c && c.message;
    if (!msg) return '';
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.content)) return msg.content.map(function (p) { return p && typeof p.text === 'string' ? p.text : ''; }).join('');
    return '';
  }

  function explainHttp(status, raw) {
    var msg = '';
    try {
      var j = JSON.parse(raw);
      if (j && j.error && typeof j.error.message === 'string') msg = j.error.message;
      else if (j && typeof j.message === 'string') msg = j.message;
    } catch (e) { /* not JSON */ }
    if (!msg) msg = String(raw || '').replace(/\s+/g, ' ').slice(0, 300);
    return (status ? 'HTTP ' + status : '') + (msg ? ' ' + msg : '');
  }

  var api = {
    VERSION: VERSION, SETTINGS_KEY: SETTINGS_KEY, KEY_KEY: KEY_KEY,
    endpointOrigin: endpointOrigin, normalizeBase: normalizeBase, chatUrl: chatUrl, httpHostOk: httpHostOk,
    frameCsp: frameCsp, frameDocument: frameDocument,
    sanitizeSettings: sanitizeSettings, sanitizeKey: sanitizeKey, redact: redact,
    parseReply: parseReply, sanitizeSketch: sanitizeSketch, mergePatch: mergePatch,
    partCatalog: partCatalog, briefNetlist: briefNetlist, briefSketch: briefSketch,
    buildRequest: buildRequest, completionText: completionText, explainHttp: explainHttp
  };
  globalThis.AssistantCore = api;
  if (typeof globalThis.window === 'object' && globalThis.window) globalThis.window.AssistantCore = api;
})();
