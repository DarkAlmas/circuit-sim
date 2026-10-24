/* Strict validation of untrusted project data (import, localStorage, examples). */
(function () {
  const ID = /^[A-Za-z0-9_-]{1,32}$/;
  const NUM = { V: [0, 1000], R: [0.001, 1e9], Pmax: [0.001, 1000], pos: [0, 1], Vf: [0.1, 10], Imax: [0.0001, 10], beta: [1, 2000] };
  const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  function sanitizeProject(raw) {
    const P = window.PARTS, out = { parts: [], wires: [], code: '' };
    if (!raw || typeof raw !== 'object') throw new Error('не объект');
    const ids = new Set();
    for (const p of Array.isArray(raw.parts) ? raw.parts.slice(0, 500) : []) {
      if (!p || typeof p !== 'object' || typeof p.type !== 'string' || !Object.prototype.hasOwnProperty.call(P, p.type)) continue;
      if (typeof p.id !== 'string' || !ID.test(p.id) || ids.has(p.id)) continue;
      const d = P[p.type], props = {};
      for (const [k, def] of Object.entries(d.props || {})) {
        const v = p.props && typeof p.props === 'object' ? p.props[k] : undefined;
        if (k === 'color') props.color = typeof v === 'string' && Object.prototype.hasOwnProperty.call(window.LED_COLORS, v) ? v : def;
        else props[k] = NUM[k] ? num(v, NUM[k][0], NUM[k][1], def) : def;
      }
      ids.add(p.id);
      out.parts.push({ id: p.id, type: p.type, x: num(p.x, -1e5, 1e5, 0), y: num(p.y, -1e5, 1e5, 0), rot: ((Math.round(num(p.rot, 0, 1e6, 0)) % 4) + 4) % 4, props });
    }
    const byId = new Map(out.parts.map(p => [p.id, p])), wids = new Set();
    const end = e => { if (!e || typeof e !== 'object' || typeof e.part !== 'string' || typeof e.pin !== 'string') return null;
      const p = byId.get(e.part); if (!p || !P[p.type].pins.some(q => q.id === e.pin)) return null; return { part: e.part, pin: e.pin }; };
    for (const w of Array.isArray(raw.wires) ? raw.wires.slice(0, 2000) : []) {
      if (!w || typeof w.id !== 'string' || !ID.test(w.id) || wids.has(w.id)) continue;
      const a = end(w.a), b = end(w.b); if (!a || !b) continue;
      const pts = Array.isArray(w.pts) ? w.pts.slice(0, 50).filter(q => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite)).map(q => [q[0], q[1]]) : [];
      wids.add(w.id); out.wires.push({ id: w.id, a, b, pts });
    }
    out.code = typeof raw.code === 'string' ? raw.code.slice(0, 100000) : '';
    if (typeof raw.name === 'string') out.name = raw.name.slice(0, 64);
    return out;
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  window.sanitizeProject = sanitizeProject; window.esc = esc; window.ID_RE = ID;
})();
