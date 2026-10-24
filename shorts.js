/* Short-circuit detection, app-side adapter.
   detectShorts(result) -> [{ source, path, current }]
   result = { proj, meas, sol }. When solver.js starts returning sol.shorts (same shape), this function just passes them through. */
(function () {
  const LIMIT = 1, PATH_I = 0.5;
  function detectShorts(result) {
    const { proj, meas, sol } = result;
    if (sol && Array.isArray(sol.shorts)) return sol.shorts;
    const P = window.PARTS, out = [];
    for (const p of proj.parts) {
      const d = P[p.type], m = meas[p.id];
      if (!(d.source || d.mcu) || !m || !(m.srcI > LIMIT)) continue;
      const path = [];
      for (const o of proj.parts) { if (o === p) continue; const mo = meas[o.id]; if (!mo || P[o.type].source || P[o.type].mcu) continue;
        const pi = mo.pinI ? Object.values(mo.pinI).map(Math.abs) : [Math.abs(mo.I || 0)];
        if (Math.max(0, ...pi) > PATH_I) path.push(o.id); }
      for (const w of proj.wires) if (Math.abs(w.I || 0) > PATH_I) path.push(w.id);
      out.push({ source: p.id, path, current: m.srcI });
    }
    return out;
  }
  function shortMessage(s, proj) {
    const P = window.PARTS, src = proj.parts.find(p => p.id === s.source);
    const V = src.type === 'dc' ? fmtUnit(+src.props.V, 'В') : src.type === 'battery' ? '9 В' : P[src.type].srcV ? P[src.type].srcV(src) + ' (' + src.id + ')' : '3,3 В (' + src.id + ')';
    const via = s.path.map(id => proj.parts.find(p => p.id === id)).filter(Boolean)
      .map(p => p.type === 'resistor' ? `${p.id} (${fmtUnit(+p.props.R, 'Ом')})` : p.type === 'pot' ? `${p.id} (движок)` : p.id);
    return `⚡ Короткое замыкание: источник ${V} замкнут ${via.length ? 'через ' + via.join(', ') : 'проводом напрямую'}. Симуляция остановлена`;
  }
  window.detectShorts = detectShorts; window.shortMessage = shortMessage; window.SHORT_LIMIT_A = LIMIT;
})();
