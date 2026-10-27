/* Serves the assistant frame with connect-src locked to the origin in ?o=.
   Every other request is left to the network. The main page CSP stays connect-src 'none'. */
importScripts('assistant-core.js?v=14.6.3');
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) { event.waitUntil(self.clients.claim()); });
self.addEventListener('fetch', function (event) {
  var req = event.request;
  if (req.method !== 'GET') return;
  var url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin !== self.location.origin || !/\/assistant-frame\.html$/.test(url.pathname)) return;
  event.respondWith(render(url));
});
function render(url) {
  var doc = self.AssistantCore && self.AssistantCore.frameDocument(url.searchParams.get('o') || '');
  if (!doc) {
    return new Response('forbidden', {
      status: 403,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Security-Policy': "default-src 'none'",
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }
  return new Response(doc.html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': doc.csp,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff'
    }
  });
}
