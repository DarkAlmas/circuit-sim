/* Strict validation of untrusted project data (import, localStorage, examples). */
(function () {
  const ID = /^[A-Za-z0-9_-]{1,32}$/;
  const NUM = { V: [0, 1000], R: [0.001, 1e9], Pmax: [0.001, 1000], pos: [0, 1], Vf: [0.1, 10], Imax: [0.0001, 10], beta: [1, 2000], rInt: [0.001, 100],
    C: [1e-12, 1], L: [1e-9, 10], lux: [0, 100000], temp: [-40, 125], hum: [0, 100], dist: [2, 400], K: [0.001, 100], Vth: [0.1, 10], lambda: [0, 1],
    /* v7 */ refl: [0, 1], thr: [0, 1], mm: [30, 2000], pitch: [-90, 90], roll: [-180, 180], acc: [-2, 2], gz: [-250, 250], soc: [0, 100], Vout: [5, 32] };
  const BOOL = new Set(['p']);
  const KINDS = ['esp32', 'esp8266', 'uno', 'attiny', 'pico', 'opi', 'analog', 'empty', 'esp32c3', 'line', 'car'];
  const LIMITS = { parts: 500, wires: 2000, pts: 50, code: 100000, importBytes: 2 * 1024 * 1024 };
  const num = (v, lo, hi, d) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : d; };
  function sanitizeProject(raw) {
    const P = window.PARTS, out = { parts: [], wires: [], code: '' };
    if (!raw || typeof raw !== 'object') throw new Error('не объект');
    const ids = new Set();
    for (const p of Array.isArray(raw.parts) ? raw.parts.slice(0, LIMITS.parts) : []) {
      if (!p || typeof p !== 'object' || typeof p.type !== 'string' || !Object.prototype.hasOwnProperty.call(P, p.type)) continue;
      if (typeof p.id !== 'string' || !ID.test(p.id) || ids.has(p.id)) continue;
      const d = P[p.type], props = {};
      for (const [k, def] of Object.entries(d.props || {})) {
        const v = p.props && typeof p.props === 'object' ? p.props[k] : undefined;
        if (k === 'color') props.color = typeof v === 'string' && Object.prototype.hasOwnProperty.call(window.LED_COLORS, v) ? v : def;
        else if (BOOL.has(k)) props[k] = typeof v === 'boolean' ? v : !!def;
        else props[k] = NUM[k] ? num(v, NUM[k][0], NUM[k][1], def) : def;
      }
      ids.add(p.id);
      out.parts.push({ id: p.id, type: p.type, x: num(p.x, -1e5, 1e5, 0), y: num(p.y, -1e5, 1e5, 0), rot: ((Math.round(num(p.rot, 0, 1e6, 0)) % 4) + 4) % 4, props });
    }
    const byId = new Map(out.parts.map(p => [p.id, p])), wids = new Set();
    const end = e => { if (!e || typeof e !== 'object' || typeof e.part !== 'string' || typeof e.pin !== 'string') return null;
      const p = byId.get(e.part); if (!p || !P[p.type].pins.some(q => q.id === e.pin)) return null; return { part: e.part, pin: e.pin }; };
    for (const w of Array.isArray(raw.wires) ? raw.wires.slice(0, LIMITS.wires) : []) {
      if (!w || typeof w.id !== 'string' || !ID.test(w.id) || wids.has(w.id)) continue;
      const a = end(w.a), b = end(w.b); if (!a || !b) continue;
      const pts = Array.isArray(w.pts) ? w.pts.slice(0, LIMITS.pts).filter(q => Array.isArray(q) && q.length === 2 && q.every(Number.isFinite)).map(q => [q[0], q[1]]) : [];
      wids.add(w.id); out.wires.push({ id: w.id, a, b, pts });
    }
    out.code = typeof raw.code === 'string' ? raw.code.slice(0, LIMITS.code) : '';
    // v7: per-MCU sketches for extra boards (keys must be existing MCU part ids)
    if (raw.codes && typeof raw.codes === 'object' && !Array.isArray(raw.codes)) { const codes = {}; let total = 0;
      for (const [k, v] of Object.entries(raw.codes).slice(0, 8)) { const p = byId.get(k); if (!p || !P[p.type].mcu || typeof v !== 'string') continue;
        const c = v.slice(0, LIMITS.code); if (total + c.length > LIMITS.code * 4) break; total += c.length; codes[k] = c; }
      if (Object.keys(codes).length) out.codes = codes; }
    if (typeof raw.name === 'string') out.name = raw.name.slice(0, 64);
    if (typeof raw.kind === 'string' && KINDS.includes(raw.kind)) out.kind = raw.kind;
    // v9: robot car (chassis mounts, track strokes, boxes) — every field validated here first
    if (raw.robot && typeof raw.robot === 'object' && !Array.isArray(raw.robot)) out.robot = sanitizeRobot(raw.robot, byId);
    return out;
  }
  const RL = { mounts: 40, strokes: 100, pts: 4000, boxes: 30 };
  const pt = (q, w, h) => Array.isArray(q) && q.length >= 2 && Number.isFinite(+q[0]) && Number.isFinite(+q[1]) ? [Math.round(num(q[0], 0, w, 0)), Math.round(num(q[1], 0, h, 0))] : null;
  function sanitizeRobot(r, byId) {
    const o = { body: r.body === 'round' ? 'round' : 'rect', mat: r.mat === 'black' ? 'black' : 'acrylic', mounts: [], caster: r.caster !== false, track: {}, obstacles: [], speed: num(r.speed, 0.5, 4, 1) };
    const seen = new Set();
    for (const m of Array.isArray(r.mounts) ? r.mounts.slice(0, RL.mounts) : []) {
      if (!m || typeof m.part !== 'string' || !byId.has(m.part) || seen.has(m.part)) continue; seen.add(m.part);
      o.mounts.push({ part: m.part, x: Math.round(num(m.x, -150, 150, 0)), y: Math.round(num(m.y, -150, 150, 0)) }); }
    const t = r.track && typeof r.track === 'object' ? r.track : {}, PR = ['oval', 'eight', 'zigzag', 'cross', ''];
    o.track.preset = typeof t.preset === 'string' && PR.includes(t.preset) ? t.preset : '';
    o.track.w = Math.round(num(t.w, 10, 40, 20)); o.track.strokes = []; let total = 0;
    for (const s of Array.isArray(t.strokes) ? t.strokes.slice(0, RL.strokes) : []) { if (!Array.isArray(s)) continue;
      const q = s.slice(0, RL.pts - total).map(v => pt(v, 2000, 1400)).filter(Boolean); if (!q.length) continue; total += q.length; o.track.strokes.push(q); if (total >= RL.pts) break; }
    const st = t.start && typeof t.start === 'object' ? t.start : {};
    o.track.start = { x: Math.round(num(st.x, 0, 2000, 1000)), y: Math.round(num(st.y, 0, 1400, 250)), th: num(st.th, -7, 7, 0) };
    for (const b of Array.isArray(r.obstacles) ? r.obstacles.slice(0, RL.boxes) : []) { if (!b || typeof b !== 'object') continue;
      o.obstacles.push({ x: Math.round(num(b.x, 0, 2000, 0)), y: Math.round(num(b.y, 0, 1400, 0)), w: Math.round(num(b.w, 20, 400, 100)), h: Math.round(num(b.h, 20, 400, 100)) }); }
    return o;
  }
  /* Parse untrusted JSON text (file import) with a size cap before sanitizing. */
  function parseProjectText(text) {
    if (typeof text !== 'string') throw new Error('не текст');
    if (text.length > LIMITS.importBytes) throw new Error('файл больше 2 МБ');
    const d = JSON.parse(text);
    if (!d || !Array.isArray(d.parts) || !Array.isArray(d.wires)) throw new Error('неизвестный формат');
    return sanitizeProject(d);
  }
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  window.sanitizeProject = sanitizeProject; window.parseProjectText = parseProjectText; window.SANITIZE_LIMITS = LIMITS; window.ROBOT_LIMITS = RL; window.PROJECT_KINDS = KINDS; window.esc = esc; window.ID_RE = ID;
})();
