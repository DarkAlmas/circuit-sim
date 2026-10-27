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
    return { st, step(sol, dt) { const I = sol.currents[k]; st.soc = Math.max(0, Math.min(1, st.soc - I * dt / (capAh * 3600))); st.I = I; st.V = ocv(st.soc) - 0.1 * I; st.empty = st.soc <= 0; } };
  }
  // IP5306 / TP5400: заряд Li-ion до 4,2 В (rInt задаёт ток) и boost 5 В, КПД ~0,85–0,88.
  // opt.always — TP5400 держит выход, пока есть батарея или VIN. IP5306 включает KEY/защёлку или VIN.
  function powerBank(ctx, pins, st = {}, opt = {}) {
    const batP = pins.batP, batN = pins.batN, vin = pins.vin, gnd = pins.gnd, out = pins.out, key = pins.key;
    if (batN !== gnd) ctx.add({ type: 'R', a: batN, b: gnd, R: 0.02 });
    if (key != null && !opt.always) { const pu = ctx.node(); ctx.add({ type: 'V', p: pu, n: gnd, V: 3.3 }); ctx.add({ type: 'R', a: pu, b: key, R: 1e5 }); }
    const boostOn = !!st.boost, chgOn = !!st.chg;
    const vo = boostOn ? ctx.add({ type: 'V', p: out, n: gnd, V: 5, rInt: 0.08, iShort: 2.4 }) : ctx.add({ type: 'R', a: out, b: gnd, R: 1e7 });
    const ch = chgOn ? ctx.add({ type: 'V', p: batP, n: batN, V: 4.2, rInt: 1.1, iShort: 2 }) : null;
    const iin = ctx.add({ type: 'I', a: vin, b: gnd, I: Math.max(0, +st.Ivin || 0) });
    const idis = ctx.add({ type: 'I', a: batP, b: batN, I: Math.max(0, +st.Idis || 0) });
    return { st, vo, ch, iin, idis, step(sol) {
      const Vbat = sol.v[batP] - sol.v[batN], Vin = sol.v[vin] - sol.v[gnd], Vo = sol.v[out] - sol.v[gnd];
      const Vkey = key != null ? sol.v[key] - sol.v[gnd] : 3.3;
      const keyDown = !!opt.always || !!st.latch || (key != null && Vkey < 0.8);
      const batOk = Vbat >= 2.8 && Vbat <= 4.35, vinOk = Vin >= 4.4 && Vin <= 6;
      const Io = boostOn ? Math.max(0, sol.currents[vo] || 0) : 0;
      const Ichg = ch != null ? Math.max(0, sol.currents[ch] || 0) : 0;
      const Pout = Math.max(0, Vo) * Io;
      const boost = opt.always ? (batOk || vinOk) : ((batOk && keyDown) || vinOk);
      st.Vbat = Vbat; st.Vin = Vin; st.Vo = Vo; st.Io = Io; st.Ichg = Ichg; st.keyDown = !opt.always && keyDown;
      st.boost = !!boost; st.on = !!boost; st.chg = false; st.Ivin = 0; st.Idis = 0;
      if (!boost) return;
      if (vinOk) { st.chg = Vbat >= 2.5 && Vbat < 4.22; st.Ivin = (Pout + Ichg * 4.2) / (0.88 * Math.max(Vin, 1)); }
      else if (batOk) st.Idis = Pout / (0.85 * Math.max(Vbat, 2.5));
    } };
  }
  // Понижающий преобразователь: Uвых ≤ Uвх − 0,5 В, иначе просадка ~1 В. КПД 0,88. Вход 4–40 В.
  function buck(ctx, inP, inN, outP, outN, Vset = 5, st = {}) {
    const on = !!st.on, Vcmd = on ? Math.max(0, +st.Vcmd || 0) : 0;
    const vo = on && Vcmd > 0.2 ? ctx.add({ type: 'V', p: outP, n: outN, V: Vcmd, rInt: 0.08, iShort: 3 }) : ctx.add({ type: 'R', a: outP, b: outN, R: 1e7 });
    const iin = ctx.add({ type: 'I', a: inP, b: inN, I: Math.max(0, +st.Iin || 0) });
    return { st, vo, iin, step(sol) {
      const Vin = sol.v[inP] - sol.v[inN], Vo = sol.v[outP] - sol.v[outN];
      const Io = on && Vcmd > 0.2 ? Math.max(0, sol.currents[vo] || 0) : 0;
      const target = Math.max(0.8, Math.min(24, +Vset || 5)), vinOk = Vin >= 4 && Vin <= 40;
      st.Vin = Vin; st.Vo = Vo; st.Io = Io; st.target = target; st.Pout = Math.max(0, Vo) * Io;
      if (!vinOk) { st.on = false; st.reg = false; st.Vcmd = 0; st.Iin = 0; return; }
      st.on = true; st.reg = target <= Vin - 0.5; st.Vcmd = st.reg ? target : Math.max(0, Vin - 1);
      st.Iin = st.Pout / (0.88 * Math.max(Vin, 1));
    } };
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
  function hbridge(ctx, vs, outA, outB, in1, in2, kind = 'l298n', stby = true) {
    // stby false: DRV8833 standby — both outputs high-Z, no path to VM or GND
    if (!stby) return { imax: HB[kind].imax, z: true };
    hhalf(ctx, vs, outA, in1 ? 1 : 0, kind); hhalf(ctx, vs, outB, in2 ? 1 : 0, kind);
    return { imax: HB[kind].imax };
  }
  // BSS138-style bidirectional level shift, one MOSFET per channel.
  // Gate sits on the LV rail, source on LVn, drain on HVn; 10 kΩ pull-ups to each rail.
  // on=false leaves the channels high-Z (HV, LV or GND missing).
  function levelShift(ctx, hv, lv, pairs, on) {
    if (!on) return { on: false, els: [] };
    const els = [];
    for (let i = 0; i < pairs.length; i++) {
      const lo = pairs[i][0], hi = pairs[i][1];
      els.push({
        rL: ctx.add({ type: 'R', a: lv, b: lo, R: 10000 }),
        rH: ctx.add({ type: 'R', a: hv, b: hi, R: 10000 }),
        m: ctx.add({ type: 'M', d: hi, g: lv, s: lo, K: 0.4, Vth: 1.0, lambda: 0.01 })
      });
    }
    return { on: true, els };
  }
  // простые потребители для модулей (средний ток, А)
  const LOADS = { esp32c3: 0.08, mpu6050: 0.004, nrf24pa_tx: 0.115, nrf24pa_rx: 0.045, tcrt5000: 0.02, vl53l0x: 0.019, hcsr04: 0.015 };
  function load(ctx, p, n, kind, Vmin = 1.9) { // ток-потребитель, отключается при низком питании
    const R = 3.3 / (LOADS[kind] || 0.01); return ctx.add({ type: 'R', a: p, b: n, R });
  }
  // TCRT5000: выход фототранзистора, refl 0 (чёрное) … 1 (белое) → ток коллектора до 1 мА
  function tcrtCurrent(refl) { return 1e-3 * Math.max(0, Math.min(1, refl)); }
  function context() { const els = []; let n = 1; return { els, node: () => n++, nodeCount: () => n, add: e => (els.push(e), els.length - 1) }; }
  const api = { MOTORS, motor, liion, ocv, boost, buck, powerBank, hbridge, HB, LOADS, load, tcrtCurrent, context, levelShift };
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

// ---- general vehicle: N wheels, steering, tracks (least-squares kinematics + lag) ----
(function(){
  var api=(typeof module!=='undefined'&&module.exports)?module.exports:window.Devices;
  function solve3(A,b){var m=A.map(function(r,i){return r.concat([b[i]]);});
    for(var i=0;i<3;i++){var p=i;for(var k=i+1;k<3;k++)if(Math.abs(m[k][i])>Math.abs(m[p][i]))p=k;
      var t=m[i];m[i]=m[p];m[p]=t;if(Math.abs(m[i][i])<1e-12)return[0,0,0];
      for(k=0;k<3;k++)if(k!==i){var f=m[k][i]/m[i][i];for(var j=i;j<4;j++)m[k][j]-=f*m[i][j];}}
    return[m[0][3]/m[0][0],m[1][3]/m[1][1],m[2][3]/m[2][2]];}
  // opts.wheels:[{x,y,R,driven(true),grip(1)}]; track = wheel with grip<1 (skid)
  api.vehicle=function(opts){
    opts=opts||{};var c=api.car(opts);
    c.wheels=opts.wheels||[{x:0,y:-0.065,R:0.033},{x:0,y:0.065,R:0.033},{x:0.1,y:0,R:0.01,driven:false,caster:true}];
    c.tau=opts.tau||0.05; c.vx=0;c.vy=0;c.ax=0;
    var s0=c.step, r0=c.reset;
    c.reset=function(p){r0(p);c.vx=c.vy=c.ax=0;return c;};
    // input: rpm[] per wheel (null for free), steer[] rad per wheel (0 default)
    c.drive=function(rpm,steer,dt,sample,hit){
      var A=[[0,0,0],[0,0,0],[0,0,0]],b=[0,0,0];
      c.wheels.forEach(function(w,i){
        if(w.caster)return;
        var a=(steer&&steer[i])||0,ca=Math.cos(a),sa=Math.sin(a),g=w.grip==null?1:w.grip;
        // longitudinal row (only if driven), lateral row (no side slip)
        var rows=[],sp=(rpm&&rpm[i]!=null)?rpm[i]*2*Math.PI/60*w.R:null;
        if(w.roller!=null){ // mecanum/omni: only velocity along (a+roller) is constrained
          var u=a+w.roller,cu=Math.cos(u),su=Math.sin(u);
          if(sp!=null)rows.push([[cu,su,-w.y*cu+w.x*su],sp*Math.cos(w.roller),1]);
        } else {
          if(w.driven!==false&&sp!=null)rows.push([[ca,sa,-w.y*ca+w.x*sa],sp,1]);
          rows.push([[-sa,ca,w.y*sa+w.x*ca],0,g]);
        }
        rows.forEach(function(r){for(var p=0;p<3;p++){b[p]+=r[2]*r[0][p]*r[1];for(var q=0;q<3;q++)A[p][q]+=r[2]*r[0][p]*r[0][q];}});
      });
      for(var p=0;p<3;p++)A[p][p]+=1e-6;
      var t=solve3(A,b),k=Math.min(1,dt/c.tau),ovx=c.vx;
      c.vx+=(t[0]-c.vx)*k;c.vy+=(t[1]-c.vy)*k;c.w+=(t[2]-c.w)*k;c.ax=(c.vx-ovx)/dt;
      var co=Math.cos(c.th),si=Math.sin(c.th);
      c.th+=c.w*dt;c.x+=(c.vx*co-c.vy*si)*dt;c.y+=(c.vx*si+c.vy*co)*dt;c.v=c.vx;
      // reuse sensor code with zero wheel input (no motion)
      var sv=c.v,sw=c.w;c.v=0;c.w=0;s0.call(c,0,0,0,sample,hit);c.v=sv;c.w=sw;
      c.imu={gz:c.w,ax:c.ax,ay:c.vx*c.w}; // MPU6050: rad/s, m/s^2
      return c;
    };
    return c;
  };
})();

// ---- collisions: rectangular body vs axis-aligned boxes/walls ----
(function(){
  var api=(typeof module!=='undefined'&&module.exports)?module.exports:window.Devices;
  var base=api.vehicle;
  api.vehicle=function(opts){
    opts=opts||{};var c=base(opts),b=opts.body||{l:0.2,w:0.15};
    c.obstacles=opts.obstacles||[]; // [{x,y,w,h}] x,y = min corner, metres
    c.bump=false;var d0=c.drive;
    // body: {l,w} rectangle, {r} circle, or {poly:[[x,y],...]} (body coords, m)
    var loc=[];
    if(b.poly){b.poly.forEach(function(p,i){var q=b.poly[(i+1)%b.poly.length];
      for(var k=0;k<4;k++)loc.push([p[0]+(q[0]-p[0])*k/4,p[1]+(q[1]-p[1])*k/4]);});}
    else if(b.r){for(var k=0;k<24;k++)loc.push([b.r*Math.cos(k*Math.PI/12),b.r*Math.sin(k*Math.PI/12)]);}
    else{for(var i=0;i<=4;i++)for(var j=0;j<=4;j++){if(i>0&&i<4&&j>0&&j<4)continue;loc.push([(i/4-.5)*b.l,(j/4-.5)*b.w]);}}
    function pts(){var co=Math.cos(c.th),si=Math.sin(c.th);
      return loc.map(function(p){return[c.x+p[0]*co-p[1]*si,c.y+p[0]*si+p[1]*co];});}
    c.drive=function(rpm,steer,dt,sample,hit){
      d0(rpm,steer,dt,sample,hit);c.bump=false;
      for(var it=0;it<4;it++){var moved=false;
        pts().forEach(function(p){c.obstacles.forEach(function(o){
          if(p[0]>o.x&&p[0]<o.x+o.w&&p[1]>o.y&&p[1]<o.y+o.h){
            var dx=[o.x-p[0],o.x+o.w-p[0]],dy=[o.y-p[1],o.y+o.h-p[1]];
            var mx=Math.abs(dx[0])<Math.abs(dx[1])?dx[0]:dx[1],my=Math.abs(dy[0])<Math.abs(dy[1])?dy[0]:dy[1];
            if(Math.abs(mx)<Math.abs(my))c.x+=mx;else c.y+=my;moved=true;c.bump=true;}});});
        if(!moved)break;}
      if(c.bump){c.vx*=0.2;c.vy*=0.2;c.w*=0.5;c.v=c.vx;}
      return c;};
    return c;
  };
})();
