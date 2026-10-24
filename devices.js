/* Составные детали поверх solver.js: каждая даёт примитивы (R, V, I) и шаг состояния.
 * build(ctx) -> элементы; после solve вызвать step(sol, dt). Работает в браузере (window.Devices) и Node. */
(function (root) {
  'use strict';
  const MOTORS = { // R обмотки (Ом), kE (В·с/рад), J (кг·м²), трение b, Imax, Uном
    m130:  { R: 2.5, kE: 0.0045, J: 2e-6,  b: 2e-7, Unom: 3,   name: 'Мотор 130' },
    tt:    { R: 7.5, kE: 0.25,   J: 5e-4,  b: 2e-4, Unom: 6,   name: 'Мотор TT с редуктором' },
    m8520: { R: 0.6, kE: 0.0011, J: 3e-7,  b: 1e-7, Unom: 3.7, name: 'Мотор 8520 с винтом', prop: 1e-9 }
  };
  // мотор: a —R— m —(ЭДС kE·ω)— b. ω в рад/с, rpm в state
  function motor(ctx, a, b, kind = 'm130', st = { w: 0 }) {
    const p = MOTORS[kind] || MOTORS.m130, m = ctx.node();
    const r = ctx.add({ type: 'R', a, b: m, R: p.R });
    ctx.add({ type: 'V', p: m, n: b, V: p.kE * st.w });
    return { st, kind, step(sol, dt) { const I = sol.currents[r];
      const load = p.b * st.w + (p.prop || 0) * st.w * Math.abs(st.w);
      st.w += dt * (p.kE * I - load) / p.J; st.I = I; st.rpm = st.w * 60 / (2 * Math.PI); } };
  }
  // Li-ion 103450: ЭДС по заряду 3.0…4.2 В, rInt 0.1 Ом, 2000 мА·ч
  const ocv = s => 3.0 + 1.2 * Math.max(0, Math.min(1, s)) - 0.15 * Math.exp(-20 * s);
  function liion(ctx, p, n, st = { soc: 1 }, capAh = 2.0) {
    const k = ctx.add({ type: 'V', p, n, V: ocv(st.soc), rInt: 0.1, iShort: 4 });
    return { st, step(sol, dt) { const I = sol.currents[k]; st.soc = Math.max(0, st.soc - I * dt / (capAh * 3600)); st.I = I; st.V = ocv(st.soc) - 0.1 * I; st.empty = st.soc <= 0; } };
  }
  // повышающий преобразователь (MT3608/XL6009): вход 2–24 В, выход задаётся, КПД 0.9
  function boost(ctx, inP, inN, outP, outN, Vout = 12, st = { Iin: 0 }) {
    const iin = ctx.add({ type: 'I', a: inP, b: inN, I: st.Iin || 0 });
    const vo = ctx.add({ type: 'V', p: outP, n: outN, V: st.on === false ? 0 : Vout, rInt: 0.05, iShort: 3 });
    return { st, step(sol) { const Vin = sol.v[inP] - sol.v[inN], Io = sol.currents[vo];
      st.on = Vin >= 2 && Vin <= 24; const P = st.on ? Math.max(0, Vout * Io) : 0;
      st.Iin = st.on ? P / (0.9 * Math.max(Vin, 0.5)) : 0; st.Pout = P; } };
  }
  // H-мост: L298N (падение ~1 В на ключ, 2 А) и DRV8833 (0.36 Ом на ключ, 1.5 А)
  const HB = { l298n: { ron: 0.5, vdrop: 1.0, imax: 2 }, drv8833: { ron: 0.36, vdrop: 0, imax: 1.5 } };
  function hhalf(ctx, vs, out, level, kind) { // level: 1 = к питанию, 0 = к земле, null = отключено
    const h = HB[kind]; if (level == null) return null;
    const m = ctx.node();
    if (level) { ctx.add({ type: 'V', p: vs, n: m, V: h.vdrop }); return ctx.add({ type: 'R', a: m, b: out, R: h.ron }); }
    ctx.add({ type: 'V', p: m, n: 0, V: 0 }); ctx.add({ type: 'V', p: out, n: m, V: h.vdrop }); return null;
  }
  function hbridge(ctx, vs, outA, outB, in1, in2, kind = 'l298n') {
    hhalf(ctx, vs, outA, in1 ? 1 : 0, kind); hhalf(ctx, vs, outB, in2 ? 1 : 0, kind);
    return { imax: HB[kind].imax };
  }
  // простые потребители для модулей (средний ток, А)
  const LOADS = { esp32c3: 0.08, mpu6050: 0.004, nrf24pa_tx: 0.115, nrf24pa_rx: 0.045, tcrt5000: 0.02, vl53l0x: 0.019, hcsr04: 0.015 };
  function load(ctx, p, n, kind, Vmin = 1.9) { // ток-потребитель, отключается при низком питании
    const R = 3.3 / (LOADS[kind] || 0.01); return ctx.add({ type: 'R', a: p, b: n, R });
  }
  // TCRT5000: выход фототранзистора, refl 0 (чёрное) … 1 (белое) → ток коллектора до 1 мА
  function tcrtCurrent(refl) { return 1e-3 * Math.max(0, Math.min(1, refl)); }
  function context() { const els = []; let n = 1; return { els, node: () => n++, nodeCount: () => n, add: e => (els.push(e), els.length - 1) }; }
  const api = { MOTORS, motor, liion, ocv, boost, hbridge, HB, LOADS, load, tcrtCurrent, context };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Devices = api;
})(typeof window !== 'undefined' ? window : globalThis);

// ---- Robot car (differential drive) ----
(function(){
  var api = (typeof module!=='undefined'&&module.exports)?module.exports:(window.Devices=window.Devices||{});
  // opts: {track(m), wheelR(m), mass(kg), kind(motor), sensors:[{x,y}] (body coords, m)}
  api.car = function(opts){
    opts=opts||{};
    var c={x:opts.x||0,y:opts.y||0,th:opts.th||0,v:0,w:0,
      track:opts.track||0.13, R:opts.wheelR||0.033, m:opts.mass||0.4,
      sensors:opts.sensors||[{x:0.08,y:-0.01},{x:0.08,y:0.01}], vals:[]};
    c.J=c.m*c.track*c.track/6;
    // rpmL/rpmR from motor states; sample(x,y)->reflectance 0..1
    c.step=function(rpmL,rpmR,dt,sample){
      var vl=rpmL*2*Math.PI/60*c.R, vr=rpmR*2*Math.PI/60*c.R;
      var vT=(vl+vr)/2, wT=(vr-vl)/c.track, k=Math.min(1,dt/0.05); // inertia/slip lag
      c.v+=(vT-c.v)*k; c.w+=(wT-c.w)*k;
      c.th+=c.w*dt; c.x+=c.v*Math.cos(c.th)*dt; c.y+=c.v*Math.sin(c.th)*dt;
      var s=Math.sin(c.th),co=Math.cos(c.th);
      c.vals=c.sensors.map(function(p){var wx=c.x+p.x*co-p.y*s, wy=c.y+p.x*s+p.y*co;
        return {x:wx,y:wy,refl:sample?sample(wx,wy):1};});
      return c;
    };
    return c;
  };
})();

// ---- car extensions: reset + directional distance sensors ----
(function(){
  var api=(typeof module!=='undefined'&&module.exports)?module.exports:window.Devices;
  var base=api.car;
  api.car=function(opts){
    opts=opts||{}; var c=base(opts), st={x:c.x,y:c.y,th:c.th};
    c.rangers=opts.rangers||[]; // [{x,y,dir(rad, body), max(m)}]
    c.dist=[];
    c.reset=function(p){p=p||st;c.x=p.x;c.y=p.y;c.th=p.th||0;c.v=0;c.w=0;c.vals=[];c.dist=[];
      if(p!==st){st={x:c.x,y:c.y,th:c.th};}return c;};
    var s0=c.step;
    // hit(x,y,dx,dy,max) -> distance or Infinity (from the UI's obstacle map)
    c.step=function(l,r,dt,sample,hit){
      s0(l,r,dt,sample);
      var s=Math.sin(c.th),co=Math.cos(c.th);
      c.dist=c.rangers.map(function(g){
        var wx=c.x+g.x*co-g.y*s, wy=c.y+g.x*s+g.y*co, a=c.th+(g.dir||0), mx=g.max||2;
        var d=hit?hit(wx,wy,Math.cos(a),Math.sin(a),mx):Infinity;
        return {x:wx,y:wy,dir:a,d:Math.min(d,mx),hit:d<mx};
      });
      return c;
    };
    return c;
  };
})();
