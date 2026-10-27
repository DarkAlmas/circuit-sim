/* Right-hand «Помощник». Opt-in network only; Apply is explicit.
   Schematic patches go through sanitizeProject. Sketches are written into the editor
   and run later by the existing worker — this file never evals a reply. */
(function () {
  'use strict';
  var A = window.AssistantCore;
  var $ = function (s) { return document.querySelector(s); };
  var settings = A.sanitizeSettings(null);
  var mode = 'schema';
  var thread = [];
  var seq = 0;
  var busy = false;
  var pending = null;
  var frameReady = null;
  var frameOrigin = '';

  function nid() { return 'm' + (++seq); }
  function sim() { return window.__sim; }

  function loadSettings() {
    var raw = null;
    try { raw = JSON.parse(localStorage.getItem(A.SETTINGS_KEY)); } catch (e) { raw = null; }
    var clean = A.sanitizeSettings(raw);
    try {
      var next = JSON.stringify(clean);
      if (localStorage.getItem(A.SETTINGS_KEY) !== next) localStorage.setItem(A.SETTINGS_KEY, next);
    } catch (e) { /* private mode */ }
    if (!clean.remember) { try { localStorage.removeItem(A.KEY_KEY); } catch (e) { /* ignore */ } }
    return clean;
  }
  function persist() {
    settings = A.sanitizeSettings(settings);
    try { localStorage.setItem(A.SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* quota */ }
  }
  function readKey() {
    var s = '';
    try { s = A.sanitizeKey(sessionStorage.getItem(A.KEY_KEY) || ''); } catch (e) { s = ''; }
    if (s) return s;
    if (!settings.remember) return '';
    try { return A.sanitizeKey(localStorage.getItem(A.KEY_KEY) || ''); } catch (e) { return ''; }
  }
  function storeKey(value) {
    var k = A.sanitizeKey(value);
    if (!k) return false;
    try { sessionStorage.setItem(A.KEY_KEY, k); } catch (e) { /* ignore */ }
    try {
      if (settings.remember) localStorage.setItem(A.KEY_KEY, k);
      else localStorage.removeItem(A.KEY_KEY);
    } catch (e) { /* ignore */ }
    return true;
  }
  function forgetKey() {
    try { sessionStorage.removeItem(A.KEY_KEY); } catch (e) { /* ignore */ }
    try { localStorage.removeItem(A.KEY_KEY); } catch (e) { /* ignore */ }
    var input = $('#assistKey');
    if (input) input.value = '';
  }

  function flash(text) { var el = $('#assistStatus'); if (el) el.textContent = text || ''; }
  function ollamaPull() {
    return 'ollama serve, затем ollama pull ' + A.preset('ollama').model;
  }
  function syncKeyNote() {
    var el = $('#assistKeyNote');
    if (!el) return;
    if (settings.baseUrl && !A.keyRequired(settings.baseUrl)) {
      el.textContent = 'ключ не нужен';
      return;
    }
    if (settings.baseUrl && !readKey()) {
      el.textContent = 'без ключа запросы не уйдут';
      return;
    }
    el.textContent = '';
  }
  function syncHint() {
    var el = $('#assistHint');
    if (!el) return;
    var origin = settings.baseUrl ? A.endpointOrigin(settings.baseUrl) : '';
    var local = !!(settings.baseUrl && !A.keyRequired(settings.baseUrl));
    var ollama = settings.baseUrl === A.preset('ollama').baseUrl;
    if (!settings.enabled) {
      el.textContent = 'Запросы выключены: симулятор в сеть не ходит. Включите «Разрешить запросы к ИИ» — это согласие отправить вопрос. Без ключа: Ollama на этом компьютере (' + ollamaPull() + ', если сервер или модель ещё не готовы) или кнопка «Groq бесплатно». Платный OpenAI и другие https-адреса по-прежнему просят свой ключ.';
      return;
    }
    if (!settings.baseUrl) {
      el.textContent = 'Укажите OpenAI-совместимый адрес: https://… или http:// на localhost, 127.0.0.1 либо частную сеть. Локальный Ollama — http://127.0.0.1:11434/v1, ключ не нужен.';
      return;
    }
    if (!local && !readKey()) {
      el.textContent = 'Для этого https-адреса нужен API-ключ. Он останется только в этом браузере и не попадёт в проект. У Ollama на localhost ключ не нужен.';
      return;
    }
    if (local) {
      var extra = ollama ? ' Если Ollama не отвечает, в терминале: ' + ollamaPull() + '.' : '';
      el.textContent = 'Ключ не нужен. Запросы пойдут только на ' + origin + ' без заголовка Authorization.' + extra + ' «Применить» добавит детали или заменит скетч — кнопка ▶ сама не нажмётся.';
      return;
    }
    el.textContent = 'Запросы пойдут только на ' + origin + '. Прокси должен разрешать CORS. «Применить» добавит детали или заменит скетч — кнопка ▶ сама не нажмётся.';
  }
  function paint() {
    var sw = $('#assistOn');
    if (sw) sw.setAttribute('aria-checked', settings.enabled ? 'true' : 'false');
    var remember = $('#assistRemember');
    if (remember) remember.checked = settings.remember;
    var keyEl = $('#assistKey');
    if (keyEl) {
      var freeCloud = A.normalizeBase(settings.baseUrl) === A.preset('groq').baseUrl;
      keyEl.placeholder = freeCloud ? 'не нужен: Groq бесплатно, без ключа' : (readKey() ? 'ключ задан — введите новый, чтобы заменить' : 'не нужен для Ollama на localhost');
    }
    var input = $('#assistInput');
    var sendBtn = $('#assistSend');
    if (input) input.disabled = !settings.enabled;
    if (sendBtn) sendBtn.disabled = !settings.enabled || busy;
    syncKeyNote();
    syncHint();
  }
  function fill() {
    var url = $('#assistUrl'), model = $('#assistModel'), key = $('#assistKey');
    if (url) url.value = settings.baseUrl;
    if (model) model.value = settings.model;
    if (key) key.value = '';
    paint();
  }

  function showTab(which) {
    var assist = which === 'assist';
    document.body.classList.toggle('assist-open', assist);
    var paneA = $('#sideAssistPane'), paneP = $('#sidePropsPane');
    if (paneA) paneA.hidden = !assist;
    if (paneP) paneP.hidden = assist;
    var tabA = $('#sideAssist'), tabP = $('#sideProps');
    if (tabA) { tabA.classList.toggle('on', assist); tabA.setAttribute('aria-selected', assist ? 'true' : 'false'); }
    if (tabP) { tabP.classList.toggle('on', !assist); tabP.setAttribute('aria-selected', assist ? 'false' : 'true'); }
  }
  var openingAssist = false;
  function open() {
    showTab('assist');
    openingAssist = true;
    if (document.body.classList.contains('pm') && document.body.dataset.sheet !== 'props') {
      var b = $('#mProps');
      if (b) b.click();
    }
    openingAssist = false;
    var input = $('#assistInput');
    if (input) setTimeout(function () { input.focus(); }, 0);
  }
  function setMode(next) {
    if (next !== 'schema' && next !== 'code') return;
    mode = next;
    var box = $('#assistMode');
    if (!box) return;
    var buttons = box.querySelectorAll('button');
    for (var i = 0; i < buttons.length; i++) {
      var on = buttons[i].dataset.mode === mode;
      buttons[i].classList.toggle('on', on);
      buttons[i].setAttribute('aria-pressed', on ? 'true' : 'false');
    }
  }

  function gate() {
    if (!settings.enabled) return 'Запросы выключены. Включите «Разрешить запросы к ИИ».';
    if (!settings.baseUrl) return 'Укажите адрес API.';
    if (A.keyRequired(settings.baseUrl) && !readKey()) return 'Введите API-ключ — без него запрос не уйдёт.';
    return '';
  }

  function bubble(msg) {
    var empty = $('#assistEmpty');
    if (empty) empty.hidden = true;
    var log = $('#assistLog');
    if (!log) return;
    var box = document.createElement('div');
    box.className = 'amsg' + (msg.role === 'user' ? ' user' : msg.role === 'err' ? ' err' : '');
    var p = document.createElement('div');
    p.textContent = msg.text;
    box.appendChild(p);
    if (msg.proposal) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'apply';
      b.textContent = 'Применить';
      b.addEventListener('click', function () { applyMsg(msg, b); });
      box.appendChild(b);
    }
    log.appendChild(box);
    while (log.children.length > 40) log.removeChild(log.firstChild);
    log.scrollTop = log.scrollHeight;
  }
  function presentReply(which, raw) {
    var parsed = A.parseReply(A.redact(String(raw || ''), readKey()), which);
    var text = parsed.text || (parsed.proposal ? 'Можно применить блок из ответа.' : 'В ответе нет применимых данных.');
    var msg = { id: nid(), role: 'assistant', text: text, proposal: parsed.proposal };
    thread.push({ role: 'assistant', text: text });
    if (thread.length > 40) thread.shift();
    bubble(msg);
    return msg;
  }

  function focusCode() {
    if (document.body.classList.contains('pm')) {
      if (document.body.dataset.sheet !== 'code') { var b = $('#mCode'); if (b) b.click(); }
    } else {
      var t = $('#codeTab');
      if (t) t.click();
    }
  }
  function applyMsg(msg, btn) {
    var S = sim();
    if (!S || !msg.proposal) return;
    try {
      switch (msg.proposal.mode) {
        case 'code': {
          var sketch = A.sanitizeSketch(msg.proposal.sketch);
          if (!sketch) { flash('Скетч пустой.'); return; }
          S.replaceSketch(sketch);
          btn.disabled = true;
          btn.textContent = 'Применено';
          flash('Скетч записан в редактор. Запуск — кнопкой ▶: код пойдёт в прежний транслятор и worker.');
          focusCode();
          return;
        }
        case 'schema': {
          if (S.flushEditor) S.flushEditor();
          var result = A.mergePatch(S.proj, msg.proposal);
          if (!result.addedParts.length && !result.addedWires.length) {
            btn.disabled = true;
            btn.textContent = 'Не применено';
            flash('Ничего не добавлено. ' + result.notes.join(' '));
            return;
          }
          S.replaceProject(result.project);
          if (result.addedParts[0]) S.select(result.addedParts[0]);
          btn.disabled = true;
          btn.textContent = 'Применено';
          flash('Добавлено: ' + result.addedParts.concat(result.addedWires).join(', ') + '. Симуляция не запущена.');
          return;
        }
        default: {
          var unknown = msg.proposal.mode;
          throw new Error('режим ' + unknown);
        }
      }
    } catch (e) {
      flash('Не удалось применить: ' + (e && e.message ? e.message : e));
    }
  }

  function dropChannel() {
    frameReady = null;
    frameOrigin = '';
    pending = null;
    var frame = $('#assistNet');
    if (frame) frame.remove();
    if (!navigator.serviceWorker || !navigator.serviceWorker.getRegistrations) return Promise.resolve();
    return navigator.serviceWorker.getRegistrations().then(function (regs) {
      return Promise.all(regs.map(function (r) {
        var worker = r.active || r.waiting || r.installing;
        var url = worker && worker.scriptURL || '';
        if (url.indexOf('sw-assistant.js') !== -1) return r.unregister();
      }));
    }).catch(function () {});
  }
  function onNet(e) {
    if (e.origin !== location.origin) return;
    var frame = $('#assistNet');
    if (!frame || e.source !== frame.contentWindow) return;
    var m = e.data;
    if (!m || typeof m !== 'object') return;
    if (m.t === 'ready' && m.v === A.VERSION && m.o === frameOrigin && frameReady) { var go = frameReady; frameReady = null; go(); return; }
    if (m.t === 'chat' && pending && m.id === pending.id) {
      clearTimeout(pending.timer);
      var p = pending;
      pending = null;
      if (m.ok) p.resolve(m.text || '');
      else p.reject(Object.assign(new Error(m.error || 'ошибка запроса'), { status: m.status || 0, text: m.text || '' }));
    }
  }
  function waitController() {
    var start = Date.now();
    return new Promise(function (resolve, reject) {
      (function tick() {
        var c = navigator.serviceWorker.controller;
        if (c && c.scriptURL.indexOf('sw-assistant.js') !== -1 && c.scriptURL.indexOf('v=' + A.VERSION) !== -1) { resolve(); return; }
        if (Date.now() - start > 5000) { reject(new Error('сетевое окно не включилось')); return; }
        setTimeout(tick, 50);
      })();
    });
  }
  function ensureFrame(origin) {
    if (!navigator.serviceWorker) return Promise.reject(new Error('этот браузер не открывает сетевое окно для ИИ'));
    return navigator.serviceWorker.register('sw-assistant.js?v=' + A.VERSION, { updateViaCache: 'none' }).then(function () {
      return waitController();
    }).then(function () {
      var frame = $('#assistNet');
      if (!frame) {
        frame = document.createElement('iframe');
        frame.id = 'assistNet';
        frame.hidden = true;
        frame.tabIndex = -1;
        frame.setAttribute('title', 'Сеть помощника');
        frame.setAttribute('aria-hidden', 'true');
        document.body.appendChild(frame);
      }
      if (frame.dataset.origin === origin && frame.dataset.ready === '1') return frame;
      frame.dataset.ready = '';
      frame.dataset.origin = origin;
      frameOrigin = origin;
      return new Promise(function (resolve, reject) {
        var t = setTimeout(function () { frameReady = null; reject(new Error('сетевое окно не ответило')); }, 5000);
        frameReady = function () { clearTimeout(t); frame.dataset.ready = '1'; resolve(frame); };
        frame.src = 'assistant-frame.html?o=' + encodeURIComponent(origin);
      });
    });
  }
  function ask(frame, payload, key) {
    return new Promise(function (resolve, reject) {
      var id = 'q' + (++seq);
      var timer = setTimeout(function () {
        if (pending && pending.id === id) { pending = null; reject(new Error('таймаут запроса')); }
      }, 60000);
      pending = { id: id, resolve: resolve, reject: reject, timer: timer };
      frame.contentWindow.postMessage({ t: 'chat', id: id, url: payload.url, key: key, body: payload.body }, location.origin);
    });
  }

  function send() {
    if (busy) return;
    var input = $('#assistInput');
    var question = input ? input.value.trim().slice(0, 4000) : '';
    if (!question) return;
    var why = gate();
    if (why) { syncHint(); flash(why); return; }
    var S = sim();
    if (!S) { flash('Симулятор ещё не готов.'); return; }
    if (S.flushEditor) S.flushEditor();
    var storedKey = readKey();
    var key = A.normalizeBase(settings.baseUrl) === A.preset('groq').baseUrl ? '' : storedKey;
    var req = A.buildRequest({
      settings: settings,
      key: storedKey,
      mode: mode,
      catalog: A.partCatalog(window.PARTS),
      netlist: A.briefNetlist(S.proj),
      sketch: A.briefSketch($('#code') ? $('#code').value : ''),
      history: thread.slice(-6),
      question: question
    });
    if (!req) { flash('Запрос не собран. Проверьте адрес.'); return; }
    busy = true;
    if (input) input.value = '';
    paint();
    thread.push({ role: 'user', text: question });
    bubble({ id: nid(), role: 'user', text: question });
    flash('Жду ответ…');
    ensureFrame(req.origin).then(function (frame) {
      return ask(frame, req, key);
    }).then(function (raw) {
      var text = A.completionText(raw);
      if (!String(text || '').trim()) throw Object.assign(new Error('в ответе нет текста'), { text: raw, status: 200 });
      presentReply(mode, text);
      flash('');
    }).catch(function (err) {
      var detail = err && err.text ? A.explainHttp(err.status, err.text) : '';
      var msg = A.redact((err && err.message ? err.message : 'ошибка') + (detail ? ': ' + detail : ''), storedKey);
      bubble({ id: nid(), role: 'err', text: msg });
      flash('');
    }).then(function () {
      busy = false;
      paint();
    });
  }

  function bind() {
    var tab = $('#assistTab');
    if (tab) tab.addEventListener('click', open);
    var sideA = $('#sideAssist'), sideP = $('#sideProps');
    if (sideA) sideA.addEventListener('click', open);
    if (sideP) sideP.addEventListener('click', function () { showTab('props'); });
    var mProps = $('#mProps');
    if (mProps) mProps.addEventListener('click', function () { if (!openingAssist) showTab('props'); });
    var modes = $('#assistMode');
    if (modes) modes.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-mode]');
      if (b) setMode(b.dataset.mode);
    });
    var sw = $('#assistOn');
    if (sw) sw.addEventListener('click', function () {
      settings = A.sanitizeSettings({ enabled: !settings.enabled, baseUrl: settings.baseUrl, model: settings.model, remember: settings.remember });
      persist();
      paint();
      if (!settings.enabled) dropChannel();
    });
    var url = $('#assistUrl');
    if (url) url.addEventListener('change', function () {
      var norm = A.normalizeBase(url.value);
      if (!norm && url.value.trim()) flash('Адрес не подходит. Нужен https://… или http:// на localhost, 127.0.0.1 или частную сеть.');
      settings = A.sanitizeSettings({ enabled: settings.enabled, baseUrl: norm, model: settings.model, remember: settings.remember });
      persist();
      if (norm) url.value = norm;
      paint();
    });
    var model = $('#assistModel');
    if (model) model.addEventListener('change', function () {
      settings = A.sanitizeSettings({ enabled: settings.enabled, baseUrl: settings.baseUrl, model: model.value, remember: settings.remember });
      model.value = settings.model;
      persist();
    });
    var key = $('#assistKey');
    if (key) key.addEventListener('change', function () {
      if (!key.value.trim()) return;
      if (!storeKey(key.value)) { flash('Ключ не сохранён: пустой, с пробелом или длиннее 512 символов.'); return; }
      key.value = '';
      paint();
      flash('Ключ записан в браузер и не добавлен в проект.');
    });
    var remember = $('#assistRemember');
    if (remember) remember.addEventListener('change', function () {
      settings = A.sanitizeSettings({ enabled: settings.enabled, baseUrl: settings.baseUrl, model: settings.model, remember: remember.checked });
      persist();
      var k = readKey();
      try {
        if (settings.remember && k) localStorage.setItem(A.KEY_KEY, k);
        if (!settings.remember) localStorage.removeItem(A.KEY_KEY);
      } catch (e) { /* ignore */ }
    });
    var forget = $('#assistForget');
    if (forget) forget.addEventListener('click', function () { forgetKey(); paint(); flash('Ключ удалён из браузера.'); });
    var presets = $('#assistPresets');
    if (presets) presets.addEventListener('click', function (e) {
      var b = e.target.closest('button[data-preset]');
      if (!b) return;
      var name = b.dataset.preset;
      var p;
      try { p = A.preset(name); } catch (err) { return; }
      settings = A.sanitizeSettings({ enabled: settings.enabled, baseUrl: p.baseUrl, model: p.model, remember: settings.remember });
      persist();
      fill();
      switch (name) {
        case 'ollama':
          flash('Ollama на этом компьютере: ключ не нужен. В терминале: ollama serve. Если модели нет: ollama pull ' + settings.model + '.');
          return;
        case 'groq':
          flash('Groq бесплатно, без ключа: адрес прокси уже подставлен, свой ключ вставлять не нужно.');
          return;
        default: {
          var unknown = name;
          flash('Неизвестный пресет: ' + unknown);
        }
      }
    });
    var sendBtn = $('#assistSend');
    if (sendBtn) sendBtn.addEventListener('click', send);
    var input = $('#assistInput');
    if (input) input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
    });
    window.addEventListener('message', onNet);
  }

  settings = loadSettings();
  bind();
  fill();
  if (!settings.enabled) dropChannel();
  window.Assistant = {
    open: open,
    presentReply: presentReply,
    get mode() { return mode; },
    get settings() { return A.sanitizeSettings(settings); }
  };
})();
