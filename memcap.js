/* Size caps for Array, every TypedArray and ArrayBuffer inside the sketch worker.
 * Replaces the globals (and prototype.constructor) with checking wrappers so that neither
 * `new Uint8Array(2e9)` nor `[].constructor(2e9)` / `Function('return Uint8Array')()` can allocate huge buffers. */
(function (root) {
  const TYPED = ['Int8Array', 'Uint8Array', 'Uint8ClampedArray', 'Int16Array', 'Uint16Array', 'Int32Array', 'Uint32Array', 'Float32Array', 'Float64Array', 'BigInt64Array', 'BigUint64Array'];
  function makeCaps(g, CAP) {
    const err = (what) => new g.RangeError(what + ' больше ' + CAP + ' элементов запрещён');
    const chk = (n, what) => { if (typeof n === 'number' && !(n <= CAP)) { if (n !== n || n > CAP) throw err(what); } };
    const lenOf = x => { if (x == null || typeof x !== 'object' && typeof x !== 'string') return undefined; const l = x.length; return typeof l === 'number' ? l : undefined; };
    const A = g.Array, AB = g.ArrayBuffer, BYTES = CAP * 8;
    const out = {};
    // Array
    const SafeArray = function Array(...a) { if (a.length === 1) chk(a[0], 'массив'); return new A(...a); };
    SafeArray.from = function (x, f, t) { chk(lenOf(x), 'массив'); if (lenOf(x) === undefined && x != null && typeof x[g.Symbol.iterator] === 'function') { const r = []; for (const v of x) { if (r.length >= CAP) throw err('массив'); r.push(v); } x = r; } return A.from(x, f, t); };
    SafeArray.of = (...a) => A.of(...a); SafeArray.isArray = A.isArray; SafeArray.prototype = A.prototype;
    out.Array = [A, SafeArray];
    // ArrayBuffer (bytes)
    if (AB) {
      const chkB = n => { if (typeof n === 'number' && (n !== n || n > BYTES)) throw new g.RangeError('буфер больше ' + BYTES + ' байт запрещён'); };
      const SafeAB = function ArrayBuffer(n, opt) { if (!new.target) throw new g.TypeError("Constructor ArrayBuffer requires 'new'"); chkB(+n); if (opt && typeof opt === 'object') chkB(+opt.maxByteLength); return new AB(n, opt); };
      SafeAB.isView = AB.isView; SafeAB.prototype = AB.prototype;
      for (const m of ['resize', 'transfer', 'transferToFixedLength']) { const f = AB.prototype[m]; if (typeof f === 'function') Object.defineProperty(AB.prototype, m, { value: function (n) { chkB(+n); return f.apply(this, arguments); }, writable: false, configurable: false }); }
      const sl = AB.prototype.slice; // slice cannot grow beyond the source
      out.ArrayBuffer = [AB, SafeAB]; void sl;
    }
    // Typed arrays (elements)
    for (const name of TYPED) { const T = g[name]; if (!T) continue;
      const collect = x => { const r = []; for (const v of x) { if (r.length >= CAP) throw err('массив'); r.push(v); } return r; };
      const F = function (n, ...rest) { if (!new.target) throw new g.TypeError(`Constructor ${name} requires 'new'`);
        if (typeof n === 'number' || typeof n === 'string' || typeof n === 'boolean') chk(+n, 'массив');
        else if (n && typeof n === 'object' && !(AB && n instanceof AB) && !(g.SharedArrayBuffer && n instanceof g.SharedArrayBuffer)) {
          const l = lenOf(n); if (l === undefined && typeof n[g.Symbol.iterator] === 'function') n = collect(n); else chk(l, 'массив'); }
        return new T(n, ...rest); };
      Object.defineProperty(F, 'name', { value: name });
      F.BYTES_PER_ELEMENT = T.BYTES_PER_ELEMENT; F.prototype = T.prototype;
      F.from = function (x, f, t) { const l = lenOf(x); if (l === undefined && x != null && typeof x[g.Symbol.iterator] === 'function') x = collect(x); else chk(l, 'массив'); return T.from(x, f, t); };
      F.of = (...a) => T.of(...a);
      out[name] = [T, F]; }
    return out;
  }
  function install(g, CAP) {
    const caps = makeCaps(g, CAP), res = {};
    for (const [name, [orig, wrap]] of Object.entries(caps)) {
      try { Object.defineProperty(orig.prototype, 'constructor', { value: wrap, writable: false, configurable: false, enumerable: false }); } catch (e) {}
      try { Object.defineProperty(g, name, { value: wrap, writable: false, configurable: false, enumerable: false }); } catch (e) { g[name] = wrap; }
      res[name] = wrap; }
    return res;
  }
  const api = { makeCaps, install, TYPED };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MemCap = api;
})(typeof self !== 'undefined' ? self : this);
