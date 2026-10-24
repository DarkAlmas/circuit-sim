/* Builds a solver circuit from a project {parts, wires}. */
(function () {
  const key = (pid, pin) => pid + ':' + pin;
  function nets(project) {
    const P = window.PARTS, parent = new Map();
    const find = k => { while (parent.get(k) !== k) { parent.set(k, parent.get(parent.get(k))); k = parent.get(k); } return k; };
    const mk = k => { if (!parent.has(k)) parent.set(k, k); };
    for (const p of project.parts) for (const q of P[p.type].pins) mk(key(p.id, q.id));
    // breadboard: strips are connected; any part pin sitting on a hole joins that hole
    const rot = (x, y, r) => { for (let i = 0; i < (r || 0) % 4; i++) [x, y] = [-y, x]; return [x, y]; };
    const pos = (p, q) => { const [x, y] = rot(q.x, q.y, p.rot); return (p.x + x) + ',' + (p.y + y); };
    const holes = new Map(), bbIds = new Set();
    for (const p of project.parts) { const d = P[p.type]; if (!d.strips) continue; bbIds.add(p.id);
      for (const g of d.strips) for (let i = 1; i < g.length; i++) parent.set(find(key(p.id, g[i])), find(key(p.id, g[0])));
      for (const q of d.pins) holes.set(pos(p, q), key(p.id, q.id)); }
    if (holes.size) for (const p of project.parts) { if (bbIds.has(p.id)) continue; for (const q of P[p.type].pins) { const h = holes.get(pos(p, q)); if (h) parent.set(find(key(p.id, q.id)), find(h)); } }
    for (const w of project.wires) { const a = key(w.a.part, w.a.pin), b = key(w.b.part, w.b.pin); if (!parent.has(a) || !parent.has(b)) continue; parent.set(find(a), find(b)); }
    let groundRoots = new Set(), plusRoots = new Set();
    for (const p of project.parts) { const d = P[p.type];
      for (const q of d.pins) { const k = find(key(p.id, q.id));
        if (d.ground && d.ground(q.id)) groundRoots.add(k);
        if (d.source && q.id === d.source.plus) plusRoots.add(k);
        if (d.mcu && (d.supplies ? Object.prototype.hasOwnProperty.call(d.supplies, q.id) : /^(3V3|VIN)/.test(q.id))) plusRoots.add(k); } }
    if (!groundRoots.size) { const s = project.parts.find(p => P[p.type].source); if (s) groundRoots.add(find(key(s.id, P[s.type].source.minus))); }
    const node = new Map(); let n = 1;
    for (const k of parent.keys()) { if (bbIds.has(k.slice(0, k.indexOf(':')))) continue; const r = find(k); if (!node.has(r)) node.set(r, groundRoots.has(r) ? 0 : n++); }
    for (const k of parent.keys()) { const r = find(k); if (!node.has(r)) node.set(r, groundRoots.has(r) ? 0 : -1); }
    return { find, node, allKeys: parent.keys(), count: n, groundRoots, plusRoots, bbIds, netOf: (pid, pin) => find(key(pid, pin)) };
  }
  function build(project, gpio = {}, hooks = {}) {
    const P = window.PARTS, N = nets(project), elements = [], owners = [], devs = []; let cur = null;
    let count = N.count;
    const ctx = {
      n: (p, pin) => N.node.get(N.find(key(p.id, pin))),
      node: () => count++,
      add: el => { owners.push(cur); return elements.push(el) - 1; },
      gpio: (g, id) => ((hooks.gpioBy && id && hooks.gpioBy[id]) || gpio)[g],
      dev: d => { if (d) devs.push(d); return d; },
      vio: hooks.vio || 3.3,
      wired: (p, pin) => { if (!N.sz) { N.sz = new Map(); for (const k of [...N.allKeys]) { const r = N.find(k); N.sz.set(r, (N.sz.get(r) || 0) + 1); } } return (N.sz.get(N.find(key(p.id, pin))) || 0) > 1; },
    };
    for (const p of project.parts) { cur = p.id; P[p.type].stamp(p, ctx); }
    return { circuit: { nodeCount: count, elements }, nets: N, ctx, owners, devs };
  }
  function supplyMax(project) {
    let m = 0; for (const p of project.parts) { if (p.type === 'dc') m = Math.max(m, +p.props.V); if (p.type === 'battery') m = Math.max(m, 9); if (window.PARTS[p.type].mcu) m = Math.max(m, window.PARTS[p.type].vio || 3.3); const vm = window.PARTS[p.type].vmax; if (vm) m = Math.max(m, typeof vm === 'function' ? vm(p) : vm); }
    return m || 5;
  }
  window.Netlist = { build, nets, supplyMax };
})();
