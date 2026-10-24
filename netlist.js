/* Builds a solver circuit from a project {parts, wires}. */
(function () {
  const key = (pid, pin) => pid + ':' + pin;
  function nets(project) {
    const P = window.PARTS, parent = new Map();
    const find = k => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
    const mk = k => { if (!parent.has(k)) parent.set(k, k); };
    for (const p of project.parts) for (const q of P[p.type].pins) mk(key(p.id, q.id));
    for (const w of project.wires) { const a = key(w.a.part, w.a.pin), b = key(w.b.part, w.b.pin); if (!parent.has(a) || !parent.has(b)) continue; parent.set(find(a), find(b)); }
    let groundRoots = new Set(), plusRoots = new Set();
    for (const p of project.parts) { const d = P[p.type];
      for (const q of d.pins) { const k = find(key(p.id, q.id));
        if (d.ground && d.ground(q.id)) groundRoots.add(k);
        if (d.source && q.id === d.source.plus) plusRoots.add(k);
        if (d.mcu && /^(3V3|VIN)/.test(q.id)) plusRoots.add(k); } }
    if (!groundRoots.size) { const s = project.parts.find(p => P[p.type].source); if (s) groundRoots.add(find(key(s.id, P[s.type].source.minus))); }
    const node = new Map(); let n = 1;
    for (const k of parent.keys()) { const r = find(k); if (!node.has(r)) node.set(r, groundRoots.has(r) ? 0 : n++); }
    return { find, node, count: n, groundRoots, plusRoots, netOf: (pid, pin) => find(key(pid, pin)) };
  }
  function build(project, gpio = {}, hooks = {}) {
    const P = window.PARTS, N = nets(project), elements = [];
    let count = N.count;
    const ctx = {
      n: (p, pin) => N.node.get(N.find(key(p.id, pin))),
      node: () => count++,
      add: el => elements.push(el) - 1,
      gpio: g => gpio[g],
    };
    for (const p of project.parts) P[p.type].stamp(p, ctx);
    return { circuit: { nodeCount: count, elements }, nets: N, ctx };
  }
  function supplyMax(project) {
    let m = 0; for (const p of project.parts) { if (p.type === 'dc') m = Math.max(m, +p.props.V); if (p.type === 'battery') m = Math.max(m, 9); if (window.PARTS[p.type].mcu) m = Math.max(m, 3.3); }
    return m || 5;
  }
  window.Netlist = { build, nets, supplyMax };
})();
