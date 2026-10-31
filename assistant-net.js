/* Fetch bridge for the assistant frame. CSP of this document allows one origin.
   The API key arrives only in a same-origin postMessage and is not read from storage. */
(function () {
  'use strict';
  var VERSION = '14.7.2';
  var here = location.origin;
  var allowed = '';
  try { allowed = new URL(new URLSearchParams(location.search).get('o') || '').origin; } catch (e) { allowed = ''; }
  if (!allowed || allowed === 'null') return;
  var parentOrigin = '';
  try { parentOrigin = parent.location.origin; } catch (e) { parentOrigin = ''; }
  if (parentOrigin !== here) return;
  function post(data) { parent.postMessage(data, here); }
  post({ t: 'ready', v: VERSION, o: allowed });
  addEventListener('message', function (e) {
    if (e.origin !== here || e.source !== parent) return;
    var m = e.data;
    if (!m || m.t !== 'chat' || typeof m.id !== 'string' || typeof m.url !== 'string') return;
    var url;
    try { url = new URL(m.url); } catch (err) {
      post({ t: 'chat', id: m.id, ok: false, error: 'некорректный адрес' });
      return;
    }
    if (url.origin !== allowed || (url.protocol !== 'https:' && url.protocol !== 'http:')) {
      post({ t: 'chat', id: m.id, ok: false, error: 'адрес вне разрешённого узла' });
      return;
    }
    var headers = { 'Content-Type': 'application/json' };
    /* Empty key (local Ollama) sends no Authorization. A pasted key is Bearer only. */
    if (typeof m.key === 'string' && m.key) headers.Authorization = 'Bearer ' + m.key;
    fetch(url.href, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(m.body && typeof m.body === 'object' ? m.body : {}),
      mode: 'cors',
      credentials: 'omit',
      cache: 'no-store',
      redirect: 'error',
      referrerPolicy: 'no-referrer'
    }).then(function (res) {
      return res.text().then(function (text) {
        post({ t: 'chat', id: m.id, ok: res.ok, status: res.status, text: String(text || '').slice(0, 200000) });
      });
    }).catch(function () {
      post({ t: 'chat', id: m.id, ok: false, error: 'сеть, CORS или политика безопасности отклонили запрос' });
    });
  });
})();
