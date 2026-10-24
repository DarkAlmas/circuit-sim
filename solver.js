/* Circuit solver: Modified Nodal Analysis + Newton-Raphson.
 * Works in browser (window.Solver) and Node (module.exports). See README. */
(function (root) {
  'use strict';
  const VT = 0.025852; // thermal voltage at 27 °C
  const GMIN = 1e-12;
  const EXPMAX = 40;

  // exp with linear continuation above EXPMAX to avoid overflow
  // xmax is chosen per device so the exponential stays exact up to ~100 A
  // (fixed cap broke LEDs with tiny Is, e.g. Vf=3 V: exp argument ~58 > 40)
  function lexp(x, xmax = EXPMAX) {
    const EXPMAX = xmax;
    if (x <= EXPMAX) { const e = Math.exp(x); return [e, e]; }
    const e = Math.exp(EXPMAX); return [e * (1 + x - EXPMAX), e];
  }

  function xcap(Is) { return Math.min(700, Math.max(EXPMAX, Math.log(100 / Is))); }

  // Nonlinear device models: return {f: currents INTO device per terminal, J: df/dv}
  const models = {
    D(el, v) { // terminals [a, b]
      const n = el.n || 1, Is = el.Is || 1e-14, nvt = n * VT;
      const vd = v[0] - v[1];
      const [e, de] = lexp(vd / nvt, xcap(Is));
      const id = Is * (e - 1) + GMIN * vd, g = Is * de / nvt + GMIN;
      return { f: [id, -id], J: [[g, -g], [-g, g]] };
    },
    Q(el, v) { // NPN, terminals [c, b, e]
      const Is = el.Is || 1e-14, bf = el.bf || 100, br = el.br || 1;
      const vbe = v[1] - v[2], vbc = v[1] - v[0];
      const xc = xcap(Is), [ebe, debe] = lexp(vbe / VT, xc), [ebc, debc] = lexp(vbc / VT, xc);
      const gbe = Is * debe / VT + GMIN, gbc = Is * debc / VT + GMIN;
      const ic = Is * (ebe - ebc) - Is / br * (ebc - 1) - GMIN * vbc;
      const ib = Is / bf * (ebe - 1) + Is / br * (ebc - 1) + GMIN * (vbe + vbc);
      const dIc_be = gbe, dIc_bc = -gbc - gbc / br;
      const dIb_be = gbe / bf, dIb_bc = gbc / br;
      // to node voltages [c,b,e]: dvbe = db - de, dvbc = db - dc
      const rowC = [-dIc_bc, dIc_be + dIc_bc, -dIc_be];
      const rowB = [-dIb_bc, dIb_be + dIb_bc, -dIb_be];
      const rowE = rowC.map((x, i) => -(x + rowB[i]));
      return { f: [ic, ib, -(ic + ib)], J: [rowC, rowB, rowE] };
    }
  };
  models.M = function (el, v) { // MOSFET level-1, terminals [d, g, s]; el.p = true for PMOS
    const sg = el.p ? -1 : 1, K = el.K || 0.1, vth = el.Vth || 2, lam = el.lambda || 0.01;
    let vd = sg * v[0], vg = sg * v[1], vs = sg * v[2], swap = false;
    if (vd < vs) { [vd, vs] = [vs, vd]; swap = true; }
    const vgs = vg - vs, vds = vd - vs, vov = vgs - vth;
    let id = 0, gm = 0, gds = 0;
    if (vov > 0) {
      if (vds < vov) { id = K * (vov * vds - vds * vds / 2) * (1 + lam * vds); gm = K * vds * (1 + lam * vds); gds = K * (vov - vds) * (1 + lam * vds) + K * (vov * vds - vds * vds / 2) * lam; }
      else { id = K / 2 * vov * vov * (1 + lam * vds); gm = K * vov * (1 + lam * vds); gds = K / 2 * vov * vov * lam; }
    }
    gds += GMIN; id += GMIN * vds;
    // id flows frame-drain -> frame-source; map back to real terminals
    const Jd = swap ? [gm + gds, -gm, -gds] : [gds, gm, -gm - gds];
    const fd = sg * (swap ? -id : id); // current into real drain
    return { f: [fd, 0, -fd], J: [Jd, [0, 0, 0], Jd.map(x => -x)] };
  };
  const terms = { D: el => [el.a, el.b], Q: el => [el.c, el.b, el.e], M: el => [el.d, el.g, el.s] };

  function lu(A, z, n) { // Gaussian elimination with partial pivoting, in place
    for (let k = 0; k < n; k++) {
      let p = k, m = Math.abs(A[k][k]);
      for (let i = k + 1; i < n; i++) if (Math.abs(A[i][k]) > m) { m = Math.abs(A[i][k]); p = i; }
      if (m < 1e-18) return null;
      if (p !== k) { [A[k], A[p]] = [A[p], A[k]]; [z[k], z[p]] = [z[p], z[k]]; }
      for (let i = k + 1; i < n; i++) {
        const f = A[i][k] / A[k][k]; if (!f) continue;
        for (let j = k; j < n; j++) A[i][j] -= f * A[k][j];
        z[i] -= f * z[k];
      }
    }
    const x = new Float64Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = z[i]; for (let j = i + 1; j < n; j++) s -= A[i][j] * x[j];
      x[i] = s / A[i][i];
    }
    return x;
  }

  /**
   * solve(circuit, opts)
   * circuit = { nodeCount, elements: [...] }  node 0 = ground
   * elements: {type:'R',a,b,R} | {type:'V',p,n,V} | {type:'I',a,b,I}
   *           {type:'D',a,b,Is,n} | {type:'Q',c,b,e,Is,bf,br}
   *           {type:'M',d,g,s,K,Vth,lambda,p} (MOSFET, p:true = PMOS)
   *           {type:'C',a,b,C} | {type:'L',a,b,L}   V also takes rInt (Ом), iShort (А)
   * opts.dt (с) + opts.state (из прошлого шага) включают расчёт во времени
   * opts = { guess: Float64Array of node voltages, maxIter, tol, maxStep }
   * returns { ok, v, iter, currents[], error, state, shortCircuits[{source,current,path[]} — индексы элементов] }
   */
  function solve(circuit, opts = {}) {
    const N = circuit.nodeCount, els = circuit.elements;
    const maxIter = opts.maxIter || 400, tol = opts.tol || 1e-7, maxStep = opts.maxStep || 0.15;
    const vsrc = []; els.forEach((el, i) => { if (el.type === 'V') vsrc.push(i); });
    const size = N - 1 + vsrc.length;
    const vIdx = new Map(vsrc.map((ei, k) => [ei, N - 1 + k]));
    let v = new Float64Array(N);
    if (opts.guess && opts.guess.length === N) v.set(opts.guess);
    const hasNL = els.some(el => models[el.type]);
    const dt = opts.dt > 0 ? opts.dt : 0, st = opts.state || {};
    const prevC = i => (st.vC && st.vC[i]) || 0, prevL = i => (st.iL && st.iL[i]) || 0;
    let x = null, iter = 0, converged = false;
    for (iter = 1; iter <= maxIter; iter++) {
      const A = Array.from({ length: size }, () => new Float64Array(size));
      const z = new Float64Array(size);
      const add = (r, c, g) => { if (r > 0 && c > 0) A[r - 1][c - 1] += g; };
      const addZ = (r, val) => { if (r > 0) z[r - 1] += val; };
      for (let k = 1; k < N; k++) A[k - 1][k - 1] += GMIN;
      els.forEach((el, i) => {
        switch (el.type) {
          case 'R': { const g = 1 / Math.max(el.R, 1e-9); add(el.a, el.a, g); add(el.b, el.b, g); add(el.a, el.b, -g); add(el.b, el.a, -g); break; }
          case 'I': addZ(el.a, -el.I); addZ(el.b, el.I); break;
          case 'C': { // backward Euler companion; DC = open circuit
            if (!dt) break;
            const g = el.C / dt, vp = prevC(i); add(el.a, el.a, g); add(el.b, el.b, g); add(el.a, el.b, -g); add(el.b, el.a, -g);
            addZ(el.a, g * vp); addZ(el.b, -g * vp); break; }
          case 'L': { // backward Euler companion; DC = 1 mOhm
            const g = dt ? dt / el.L : 1e3, ip = dt ? prevL(i) : 0;
            add(el.a, el.a, g); add(el.b, el.b, g); add(el.a, el.b, -g); add(el.b, el.a, -g);
            addZ(el.a, -ip); addZ(el.b, ip); break; }
          case 'V': { const k = vIdx.get(i); if (el.p > 0) { A[el.p - 1][k] += 1; A[k][el.p - 1] += 1; } if (el.n > 0) { A[el.n - 1][k] -= 1; A[k][el.n - 1] -= 1; } z[k] += el.V; if (el.rInt > 0) A[k][k] -= el.rInt; break; }
          default: {
            const t = terms[el.type](el), vt = t.map(n => v[n]);
            const { f, J } = models[el.type](el, vt);
            for (let a = 0; a < t.length; a++) {
              let rhs = f[a];
              for (let b = 0; b < t.length; b++) { add(t[a], t[b], J[a][b]); rhs -= J[a][b] * vt[b]; }
              addZ(t[a], -rhs);
            }
          }
        }
      });
      x = lu(A, z, size);
      if (!x) return { ok: false, error: 'Схема не решается (вырожденная матрица: параллельные идеальные источники?)', v, iter, currents: [] };
      const vn = new Float64Array(N); for (let k = 1; k < N; k++) vn[k] = x[k - 1];
      if (!hasNL) { v = vn; converged = true; break; }
      // damping: limit change of any junction voltage per iteration
      let maxJ = 0;
      els.forEach(el => { if (!terms[el.type]) return; const t = terms[el.type](el);
        for (let a = 0; a < t.length; a++) for (let b = a + 1; b < t.length; b++)
          maxJ = Math.max(maxJ, Math.abs((vn[t[a]] - vn[t[b]]) - (v[t[a]] - v[t[b]]))); });
      const alpha = maxJ > maxStep ? maxStep / maxJ : 1;
      let dmax = 0;
      for (let k = 1; k < N; k++) { const d = (vn[k] - v[k]) * alpha; dmax = Math.max(dmax, Math.abs(d)); v[k] += d; }
      if (alpha === 1 && dmax < tol * (1 + Math.max(...v.map(Math.abs)))) { converged = true; break; }
    }
    // final branch currents of voltage sources (from last linear solve)
    const currents = els.map((el, i) => {
      switch (el.type) {
        case 'R': return (v[el.a] - v[el.b]) / Math.max(el.R, 1e-9);
        case 'I': return el.I;
        case 'C': return dt ? el.C / dt * ((v[el.a] - v[el.b]) - prevC(i)) : 0;
        case 'L': return (dt ? prevL(i) + dt / el.L * (v[el.a] - v[el.b]) : 1e3 * (v[el.a] - v[el.b]));
        case 'V': return -x[vIdx.get(i)]; // current delivered out of + terminal
        default: { const t = terms[el.type](el); const f = models[el.type](el, t.map(n => v[n])).f;
          if (el.type === 'D') return f[0];
          if (el.type === 'M') return { id: f[0], ig: 0, is: f[2] };
          return { ic: f[0], ib: f[1], ie: f[2] }; }
      }
    });
    // state for next time step
    const state = { vC: {}, iL: {} };
    els.forEach((el, i) => { if (el.type === 'C') state.vC[i] = v[el.a] - v[el.b]; if (el.type === 'L') state.iL[i] = currents[i]; });
    // short circuits: a source delivering more than iShort (default 1 A)
    const shorts = [];
    els.forEach((el, i) => { if (el.type !== 'V') return; const I = currents[i], lim = el.iShort || 1;
      if (Math.abs(I) > lim) shorts.push({ source: i, current: I,
        path: els.map((e, j) => j).filter(j => j !== i && typeof currents[j] === 'number' && Math.abs(currents[j]) > 0.5 * Math.abs(I)) }); });
    return { ok: converged, error: converged ? null : 'Нет сходимости Ньютона', v, iter, currents, state, shortCircuits: shorts };
  }

  // helpers for device parameters
  function ledIs(vf, n = 2, iRef = 0.01) { return iRef / (Math.exp(vf / (n * VT)) - 1); }
  const presets = {
    '1N4148': { Is: 2.52e-9, n: 1.752 },
    '2N2222': { Is: 1e-14, bf: 200, br: 3 }
  };
  const api = { solve, ledIs, presets, VT, GMIN };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Solver = api;
})(typeof self !== 'undefined' ? self : this);
