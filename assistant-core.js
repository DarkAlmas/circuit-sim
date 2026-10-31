/* Assistant proposals, settings and the one-origin network policy.
   No fetch and no eval: the page stays offline until the user opts in,
   and a sketch is only text until the existing worker transpiles it. */
(function () {
  'use strict';
  var VERSION = '14.7.2';
  var SETTINGS_KEY = 'circuitsim.assistant';
  var KEY_KEY = 'circuitsim.assistant.key';
  var DEFAULT_BASE = 'http://127.0.0.1:11434/v1';
  var DEFAULT_MODEL = 'llama3.2';
  /* Free cloud path. The browser sends no key; the proxy holds its own. */
  var GROQ_PROXY = 'https://circuit-sim-ai-proxy.vercel.app/v1';
  var HTTPS_ORIGIN = /^https:\/\/[A-Za-z0-9.-]{1,253}(?::[0-9]{1,5})?$/;
  var HTTP_ORIGIN = /^http:\/\/(?:localhost|\[::1\]|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[0-1])(?:\.\d{1,3}){2})(?::[0-9]{1,5})?$/;
  var MODEL_RE = /^[A-Za-z0-9._:@+/-]{1,64}$/;
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

  /* Loopback and private http need no key. The free Groq proxy needs no browser key.
     Every other https address still does. */
  function keyRequired(input) {
    if (normalizeBase(typeof input === 'string' ? input : '') === GROQ_PROXY) return false;
    var origin = endpointOrigin(typeof input === 'string' ? input : '');
    if (!origin) return true;
    return origin.indexOf('http://') !== 0;
  }

  function preset(name) {
    switch (name) {
      case 'ollama': return { baseUrl: DEFAULT_BASE, model: DEFAULT_MODEL };
      case 'groq': return { baseUrl: GROQ_PROXY, model: 'openai/gpt-oss-20b' };
      default: {
        var unknown = name;
        throw new Error('неизвестный пресет: ' + unknown);
      }
    }
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
    var out = { enabled: false, baseUrl: DEFAULT_BASE, model: DEFAULT_MODEL, remember: false };
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

  function limits() {
    var L = deps().LIMITS || {};
    return { parts: L.parts || 500, wires: L.wires || 2000 };
  }

  /* A cut-off model reply still yields every complete object. Incomplete tail is dropped. */
  function salvageJson(src) {
    var s = String(src || '').trim();
    if (!s || (s.charAt(0) !== '{' && s.charAt(0) !== '[')) return null;
    try { return JSON.parse(s); } catch (e0) { /* repair */ }
    var cuts = [];
    var inStr = false, esc = false;
    var depth = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (inStr) {
        if (esc) esc = false;
        else if (c === '\\') esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') { inStr = true; continue; }
      if (c === '{' || c === '[') depth++;
      else if ((c === '}' || c === ']') && depth) depth--;
      else if (c === ',' && depth) cuts.push(i);
    }
    function closeAndParse(body) {
      var t = body.replace(/[\s,]+$/, '');
      var st = [], str = false, es = false;
      for (var n = 0; n < t.length; n++) {
        var ch = t.charAt(n);
        if (str) {
          if (es) es = false;
          else if (ch === '\\') es = true;
          else if (ch === '"') str = false;
          continue;
        }
        if (ch === '"') { str = true; continue; }
        if (ch === '{' || ch === '[') st.push(ch);
        else if ((ch === '}' || ch === ']') && st.length) st.pop();
      }
      if (str) t = t.replace(/"[^"\\]*$/, '').replace(/[\s,:]+$/, '');
      t = t.replace(/([{,])\s*"[^"\\]*"\s*$/, '$1');
      t = t.replace(/[\s,]+$/, '');
      t = t.replace(/:\s*$/, ':null');
      while (st.length) t += st.pop() === '{' ? '}' : ']';
      try {
        var parsed = JSON.parse(t);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
      } catch (err) { return null; }
    }
    var hit = closeAndParse(s);
    if (hit) return hit;
    var tries = 0;
    for (var k = cuts.length - 1; k >= 0 && tries < 80; k--, tries++) {
      hit = closeAndParse(s.slice(0, cuts[k]));
      if (hit) return hit;
    }
    return null;
  }

  function fencedBlocks(src) {
    var blocks = [];
    var i = 0;
    while (i < src.length) {
      var open = src.indexOf('```', i);
      if (open < 0) break;
      var lineEnd = src.indexOf('\n', open + 3);
      var start = lineEnd < 0 ? src.length : lineEnd + 1;
      var close = src.indexOf('```', start);
      if (close < 0) { blocks.push(src.slice(start)); break; }
      blocks.push(src.slice(start, close));
      i = close + 3;
    }
    return blocks;
  }

  /* Bare JSON, a ``` fence, or "json" then an object. Trailing prose is cut off. */
  function jsonCandidates(src) {
    var blocks = fencedBlocks(src);
    var t = String(src || '').trim();
    var at = t.indexOf('{');
    if (at >= 0) blocks.push(t.slice(at));
    return blocks;
  }

  function proposalFrom(block, mode) {
    var direct = null;
    try { direct = JSON.parse(String(block || '').trim()); } catch (e) { direct = null; }
    var repaired = false;
    var j = direct && typeof direct === 'object' && !Array.isArray(direct) ? direct : null;
    if (!j) {
      j = salvageJson(block);
      repaired = !!j;
    }
    if (!j || typeof j !== 'object' || Array.isArray(j)) return null;
    var cap = limits();
    switch (mode) {
      case 'schema': {
        var parts = Array.isArray(j.parts) ? j.parts.slice(0, cap.parts) : [];
        var wires = Array.isArray(j.wires) ? j.wires.slice(0, cap.wires) : [];
        var nets = Array.isArray(j.nets) ? j.nets.slice(0, cap.wires) : [];
        var sketch = typeof j.sketch === 'string' ? j.sketch : '';
        if (!parts.length && !wires.length && !nets.length && !sketch.trim()) return null;
        var proposal = { mode: 'schema', parts: parts, wires: wires, nets: nets };
        if (sketch) proposal.sketch = sketch;
        if (Array.isArray(j.parts) && j.parts.length > parts.length) proposal.partsCut = true;
        if (Array.isArray(j.wires) && j.wires.length > wires.length) proposal.wiresCut = true;
        if (j.sketches && typeof j.sketches === 'object' && !Array.isArray(j.sketches)) proposal.sketches = j.sketches;
        if (typeof j.board === 'string') proposal.board = j.board;
        if (repaired) proposal.repaired = true;
        return proposal;
      }
      case 'code': {
        if (typeof j.sketch !== 'string' || !j.sketch.trim()) return null;
        return { mode: 'code', sketch: j.sketch, repaired: repaired };
      }
      default: {
        var unknown = mode;
        throw new Error('неизвестный режим: ' + unknown);
      }
    }
  }

  function parseReply(raw, mode) {
    var src = String(raw || '').slice(0, 200000);
    var blocks = jsonCandidates(src);
    var proposal = null;
    var i;
    for (i = blocks.length - 1; i >= 0 && !proposal; i--) {
      try {
        var direct = JSON.parse(String(blocks[i] || '').trim());
        if (direct && typeof direct === 'object' && !Array.isArray(direct)) proposal = proposalFrom(JSON.stringify(direct), mode);
      } catch (e) { /* this candidate is truncated or has trailing prose */ }
    }
    for (i = blocks.length - 1; i >= 0 && !proposal; i--) proposal = proposalFrom(blocks[i], mode);
    var text = proposal ? src.replace(/```(?:json)?[^\n]*\n?[\s\S]*?(?:```|$)/gi, '').trim() : src.trim();
    if (proposal && text.charAt(0) === '{') text = '';
    if (proposal && /^json\b/i.test(text) && text.indexOf('{') !== -1) text = text.slice(0, text.indexOf('{')).replace(/json\s*$/i, '').trim();
    return { text: text, proposal: proposal };
  }

  function sanitizeSketch(raw) {
    if (typeof raw !== 'string') return null;
    var s = raw.replace(/\u0000/g, '').slice(0, deps().LIMITS.code || 100000);
    if (!s.trim()) return null;
    /* Model sometimes leaves JSON escapes as text (one line with literal \n). Unfold once. */
    var realNl = (s.match(/\n/g) || []).length;
    var escNl = (s.match(/\\n/g) || []).length;
    if (escNl && realNl < 2) {
      s = s.replace(/\\([nrt"'\\])/g, function (_, c) {
        if (c === 'n') return '\n';
        if (c === 'r') return '\r';
        if (c === 't') return '\t';
        if (c === '"') return '"';
        if (c === "'") return "'";
        return '\\';
      });
    }
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

  function resolvePin(type, pin) {
    var pins = (deps().PARTS[type] && deps().PARTS[type].pins) || [];
    if (!pins.length || typeof pin !== 'string') return '';
    var raw = pin.trim();
    if (!raw || raw.length > 32) return '';
    var i;
    for (i = 0; i < pins.length; i++) if (pins[i].id === raw) return pins[i].id;
    var low = raw.toLowerCase();
    var idHits = [];
    for (i = 0; i < pins.length; i++) if (String(pins[i].id).toLowerCase() === low) idHits.push(pins[i].id);
    if (idHits.length === 1) return idHits[0];
    var gpio = /^(?:gpio|io|d)(\d+)$/i.exec(raw);
    if (gpio) {
      for (i = 0; i < pins.length; i++) if (pins[i].id === gpio[1]) return pins[i].id;
    }
    var labelHits = [];
    for (i = 0; i < pins.length; i++) if (String(pins[i].label || '').toLowerCase() === low) labelHits.push(pins[i].id);
    if (labelHits.length === 1) return labelHits[0];
    if (/^gnd$/i.test(raw)) {
      for (i = 0; i < pins.length; i++) if (pins[i].id === 'GND') return 'GND';
    }
    if (/^(?:3v3|3\.3v|vcc)$/i.test(raw)) {
      for (i = 0; i < pins.length; i++) if (pins[i].id === '3V3') return '3V3';
    }
    return '';
  }

  function endOf(e, map, types) {
    var partName = '', pinName = '';
    if (typeof e === 'string') {
      var dot = e.indexOf('.');
      if (dot < 1) return null;
      partName = e.slice(0, dot);
      pinName = e.slice(dot + 1);
    } else if (e && typeof e === 'object' && typeof e.part === 'string' && (typeof e.pin === 'string' || typeof e.pin === 'number')) {
      partName = e.part;
      pinName = String(e.pin);
    } else return null;
    if (!map.has(partName)) return null;
    var part = map.get(partName);
    var pin = resolvePin(types.get(part), pinName);
    if (!pin) return null;
    return { part: part, pin: pin };
  }

  /* «Применить» replaces the canvas. Old parts are not kept and ids are not remapped onto them. */
  function replacePatch(project, patch) {
    var D = deps();
    if (typeof D.sanitizeProject !== 'function') throw new Error('нет sanitize');
    var base = project && typeof project === 'object' ? project : {};
    var cap = limits();
    var partsIn = patch && Array.isArray(patch.parts) ? patch.parts.slice(0, cap.parts) : [];
    var wiresIn = patch && Array.isArray(patch.wires) ? patch.wires.slice(0, cap.wires) : [];
    var netsIn = patch && Array.isArray(patch.nets) ? patch.nets.slice(0, cap.wires) : [];
    var used = new Set();
    var map = new Map();
    var types = new Map();
    var fresh = [];
    var notes = [];
    var slot = 0;
    if (patch && patch.repaired) notes.push('ответ обрезан: взяты только целые объекты');
    if (patch && patch.partsCut) notes.push('список деталей обрезан по лимиту');
    if (patch && patch.wiresCut) notes.push('список проводов обрезан по лимиту');
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
        row.x = 80 + (slot % 6) * 140;
        row.y = 80 + Math.floor(slot / 6) * 110;
        slot++;
      }
      types.set(id, row.type);
      fresh.push(row);
    }
    var seenEdge = new Set();
    var freshWires = [];
    var skipped = 0;
    function pushWire(a, b, rw) {
      if (!a || !b || (a.part === b.part && a.pin === b.pin)) { skipped++; return; }
      var k1 = a.part + '.' + a.pin, k2 = b.part + '.' + b.pin;
      var key = k1 < k2 ? k1 + '|' + k2 : k2 + '|' + k1;
      if (seenEdge.has(key)) return;
      seenEdge.add(key);
      var wid = rw && typeof rw.id === 'string' && D.ID.test(rw.id) && !used.has(rw.id) ? rw.id : alloc('w', used);
      if (!wid) { skipped++; return; }
      used.add(wid);
      var wire = { id: wid, a: a, b: b };
      if (rw && Array.isArray(rw.pts)) wire.pts = rw.pts.slice(0, 50);
      if (rw && typeof rw.color === 'string') wire.color = rw.color;
      freshWires.push(wire);
    }
    for (var w = 0; w < wiresIn.length; w++) {
      var rw = wiresIn[w];
      pushWire(endOf(rw && rw.a, map, types), endOf(rw && rw.b, map, types), rw);
    }
    for (var n = 0; n < netsIn.length; n++) {
      var net = netsIn[n];
      var pins = net && Array.isArray(net.pins) ? net.pins : (Array.isArray(net) ? net : []);
      var ends = [];
      for (var e = 0; e < pins.length; e++) {
        var end = endOf(pins[e], map, types);
        if (end) ends.push(end);
        else skipped++;
      }
      for (var c = 1; c < ends.length; c++) pushWire(ends[0], ends[c], null);
    }
    if (skipped) notes.push('провод без своих выводов');
    var mcus = fresh.filter(function (q) { return !!(D.PARTS[q.type] && D.PARTS[q.type].mcu); });
    var primary = mcus.length ? mcus[0].id : '';
    /* Full replace: never keep the previous sketch or codes (no append / leftover FastLED). */
    var code = '';
    var codes = {};
    var wrote = false;
    var editorBoard = '';
    function putSketch(id, text) {
      var s = sanitizeSketch(text);
      if (!s) return;
      var target = id && map.has(id) ? map.get(id) : id;
      if (!target || target === primary) { code = s; editorBoard = primary; wrote = true; return; }
      var known = false;
      for (var i = 0; i < mcus.length; i++) if (mcus[i].id === target) known = true;
      if (!known) return;
      codes[target] = s;
      wrote = true;
      if (!editorBoard) editorBoard = target;
    }
    var board = patch && typeof patch.board === 'string' ? patch.board : '';
    if (patch && typeof patch.sketch === 'string') putSketch(board || primary, patch.sketch);
    var extra = patch && patch.sketches && typeof patch.sketches === 'object' && !Array.isArray(patch.sketches) ? patch.sketches : null;
    if (extra) {
      for (var sid in extra) {
        if (!Object.prototype.hasOwnProperty.call(extra, sid)) continue;
        putSketch(sid, extra[sid]);
      }
    }
    var merged = { parts: fresh, wires: freshWires, code: code, name: base.name, kind: base.kind };
    if (Object.keys(codes).length) merged.codes = codes;
    var out = D.sanitizeProject(merged);
    if (freshWires.length && out.wires.length < freshWires.length) notes.push('часть проводов отброшена');
    var seen = {};
    var uniq = [];
    for (var u = 0; u < notes.length && uniq.length < 6; u++) if (!seen[notes[u]]) { seen[notes[u]] = 1; uniq.push(notes[u]); }
    return {
      project: out,
      replaced: true,
      partIds: out.parts.map(function (q) { return q.id; }),
      wireIds: out.wires.map(function (q) { return q.id; }),
      sketchApplied: wrote,
      editorBoard: editorBoard,
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
    '«Применить» в режиме схемы заменяет холст целиком этим JSON (старые детали удаляются, отмена — кнопка Отменить) и записывает sketch в редактор кода платы.',
    'После текста один блок ```json и ничего после него. JSON должен быть закончен: не обрывай массивы.',
    'Режим «схема»: {"parts":[{"id":"R1","type":"resistor","x":120,"y":80,"rot":0,"props":{"R":220}},{"id":"D1","type":"led","x":240,"y":80,"rot":0,"props":{"color":"красный"}},{"id":"U1","type":"esp32","x":0,"y":0}],"wires":[{"id":"w1","a":{"part":"U1","pin":"2"},"b":{"part":"R1","pin":"a"}},{"id":"w2","a":{"part":"R1","pin":"b"},"b":{"part":"D1","pin":"a"}},{"id":"w3","a":{"part":"D1","pin":"b"},"b":{"part":"U1","pin":"GND"}}],"nets":[{"pins":[{"part":"U1","pin":"GND"},{"part":"D1","pin":"b"}]}],"sketch":"void setup(){ pinMode(2, OUTPUT); }\\nvoid loop(){ digitalWrite(2, HIGH); delay(500); digitalWrite(2, LOW); delay(500); }"}',
    'parts — полная новая схема с нуля. Не копируй детали из блока «Схема» и не оставляй старые (ленту WS2812 и прочие), если пользователь не просил их сохранить. type — только id из списка. pin — id в скобках, не подпись на корпусе. У платы числовой вывод пиши как id, например "2", не "GPIO2".',
    'wires — полный список только для новой схемы. Каждый нужный контакт — отдельный провод между двумя выводами. Не пиши «и так далее», не пропускай землю, питание и сигнал, даже если схема большая. nets дублирует те же узлы короче: все выводы одной сети в pins. Достаточно полного wires или полного nets.',
    'sketch обязателен и с нуля: полный новый текст, не дописывай к текущему скетчу из блока «Скетч». Arduino C или Python для Orange Pi. Для второй платы — "sketches":{"U2":"полный текст"} с id из parts.',
    'Режим «код»: только {"sketch":"полный текст скетча"}, без parts и wires. Схему не предлагай.',
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

  function modeHint(mode) {
    switch (mode) {
      case 'schema': return 'Нужна полная схема: все parts, все wires или nets на каждый узел и sketch. Применить заменит холст.';
      case 'code': return 'Нужен только полный sketch. Схему не меняй.';
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
    var key = sanitizeKey(o.key);
    if (keyRequired(settings.baseUrl) && !key) return null;
    var question = redact(String(o.question || '').slice(0, 4000), key);
    if (!question.trim()) return null;
    var history = Array.isArray(o.history) ? o.history.slice(-6) : [];
    var messages = [{ role: 'system', content: SYSTEM }];
    for (var i = 0; i < history.length; i++) {
      var h = history[i];
      if (!h || (h.role !== 'user' && h.role !== 'assistant') || typeof h.text !== 'string') continue;
      messages.push({ role: h.role, content: redact(h.text.slice(0, 1500), key) });
    }
    var user = [
      'Режим: ' + modeLabel(o.mode),
      modeHint(o.mode),
      'Детали (type(пины)): ' + redact(String(o.catalog || '').slice(0, 7000), key),
      'Схема: ' + redact(String(o.netlist || '').slice(0, 2500), key),
      'Скетч: ' + redact(String(o.sketch || '').slice(0, 4000), key),
      'Вопрос: ' + question
    ].join('\n');
    messages.push({ role: 'user', content: user });
    return {
      url: url,
      origin: origin,
      body: { model: settings.model, temperature: 0.2, max_tokens: 8192, stream: false, messages: messages }
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
    DEFAULT_BASE: DEFAULT_BASE, DEFAULT_MODEL: DEFAULT_MODEL,
    endpointOrigin: endpointOrigin, normalizeBase: normalizeBase, chatUrl: chatUrl, httpHostOk: httpHostOk,
    keyRequired: keyRequired, preset: preset,
    frameCsp: frameCsp, frameDocument: frameDocument,
    sanitizeSettings: sanitizeSettings, sanitizeKey: sanitizeKey, redact: redact,
    parseReply: parseReply, sanitizeSketch: sanitizeSketch, replacePatch: replacePatch,
    partCatalog: partCatalog, briefNetlist: briefNetlist, briefSketch: briefSketch,
    buildRequest: buildRequest, completionText: completionText, explainHttp: explainHttp
  };
  globalThis.AssistantCore = api;
  if (typeof globalThis.window === 'object' && globalThis.window) globalThis.window.AssistantCore = api;
})();
