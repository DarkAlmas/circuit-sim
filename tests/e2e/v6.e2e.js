// v6: memory caps inside the worker, crash -> recreate worker + clear error + rerun works, C transient + U label, P-MOSFET, solver shorts.
const { chromium } = require('playwright-core'); const assert = require('assert');
const URL = process.argv[2] || 'http://localhost:8765/';
(async () => { const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  const pg = await b.newPage({ viewport: { width: 1920, height: 1080 } }); const errs = [];
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(URL); await pg.waitForTimeout(300);
  const v6 = await pg.evaluate(() => [...document.scripts].filter(s => s.src).every(s => /\?v=6$/.test(s.src))); console.log('all scripts ?v=6', v6); assert.ok(v6);
  const card = async k => { await pg.click('#new'); await pg.click(`.ncard[data-kind="${k}"]`); await pg.waitForTimeout(200); };
  const con = () => pg.$eval('#console', e => e.textContent).catch(() => pg.evaluate(() => document.body.innerText));
  // 1) huge typed array / buffer / Array are refused inside the worker
  await card('uno');
  await pg.fill('#code', 'void setup(){ Serial.begin(9600);\n try { var a = new Uint8Array(2000000000); Serial.println(a.length); } catch(e) { Serial.println("T:" + e.message); }\n try { var b = new ArrayBuffer(1000000000); } catch(e) { Serial.println("B:" + e.message); }\n try { var c = [].constructor(2000000000); } catch(e) { Serial.println("A:" + e.message); }\n Serial.println("alive"); }\nvoid loop(){ delay(100); }');
  await pg.click('#run'); await pg.waitForTimeout(1200); let t = await con();
  console.log('cap output', JSON.stringify(t.slice(-260))); assert.ok(/T:.*запрещён/.test(t) && /B:.*запрещён/.test(t) && /A:.*запрещён/.test(t) && /alive/.test(t));
  // 2) worker crash (OOM-like error event) -> clear message, fresh worker, re-run works
  await pg.evaluate(() => window.__sim.worker.onerror({ message: 'Uncaught RangeError: Out of memory', preventDefault() {} })); await pg.waitForTimeout(300);
  t = await con(); const st = await pg.evaluate(() => ({ c: window.__sim.crashes, w: window.__sim.hasWorker, s: window.__sim.hasSpare, st: document.querySelector('#status').textContent }));
  console.log('after crash', st, JSON.stringify(t.slice(-160))); assert.ok(st.c === 1 && !st.w && st.s && /не хватило памяти/.test(t) && /перезапущен/.test(t));
  await pg.click('#stop'); await pg.fill('#code', 'void setup(){ Serial.begin(9600); Serial.println("rerun-ok"); }\nvoid loop(){ delay(100); }');
  await pg.click('#run'); await pg.waitForTimeout(1000); t = await con(); console.log('rerun', /rerun-ok/.test(t)); assert.ok(/rerun-ok/.test(t)); await pg.click('#stop');
  // 3) RC transient + capacitor voltage label; P-MOSFET; solver short mapping
  const r = await pg.evaluate(async () => { const S = window.__sim, w = (id, a, ap, bb, bp) => ({ id, a: { part: a, pin: ap }, b: { part: bb, pin: bp } });
    const P = S.proj; P.parts.length = 0; P.wires.length = 0;
    P.parts.push({ id: 'V1', type: 'dc', x: 0, y: 0, rot: 0, props: { V: 5, rInt: 0.1 } }, { id: 'R1', type: 'resistor', x: 200, y: 0, rot: 0, props: { R: 1000, Pmax: 0.25 } }, { id: 'C1', type: 'ecap', x: 400, y: 0, rot: 0, props: { C: 0.0005 } });
    P.wires.push(w('w1', 'V1', 'p', 'R1', 'a'), w('w2', 'R1', 'b', 'C1', 'a'), w('w3', 'C1', 'b', 'V1', 'n'));
    S.start(); const u = []; for (let i = 0; i < 6; i++) { await new Promise(r => setTimeout(r, 200)); u.push(S.meas.C1.U); }
    const lbl = (document.querySelector('[data-part="C1"] .capv') || {}).textContent; S.stop(); return { u, lbl, t: S.simTime }; });
  console.log('RC U(t)', r.u.map(x => x.toFixed(2)).join(' '), 'label', r.lbl); assert.ok(r.u[0] < r.u[5] && r.u[0] < 4 && r.u[5] > 3.5 && /В/.test(r.lbl || ''));
  const q = await pg.evaluate(async () => { const S = window.__sim, w = (id, a, ap, bb, bp) => ({ id, a: { part: a, pin: ap }, b: { part: bb, pin: bp } }); const P = S.proj; P.parts.length = 0; P.wires.length = 0;
    P.parts.push({ id: 'V1', type: 'dc', x: 0, y: 0, rot: 0, props: { V: 5, rInt: 0.1 } }, { id: 'Q1', type: 'pmosfet', x: 200, y: 0, rot: 0, props: { K: 1, Vth: 2, lambda: 0.01 } }, { id: 'R1', type: 'resistor', x: 400, y: 0, rot: 0, props: { R: 100, Pmax: 1 } });
    P.wires.push(w('w1', 'V1', 'p', 'Q1', 's'), w('w2', 'Q1', 'd', 'R1', 'a'), w('w3', 'R1', 'b', 'V1', 'n'), w('w4', 'Q1', 'g', 'V1', 'n'));
    S.start(); await new Promise(r => setTimeout(r, 300)); const I = S.meas.R1.I; S.stop();
    P.parts.splice(1, 1); P.wires.length = 0; P.parts[1].props.R = 0.001; P.wires.push(w('w1', 'V1', 'p', 'R1', 'a'), w('w2', 'R1', 'b', 'V1', 'n'));
    S.start(); await new Promise(r => setTimeout(r, 300)); const sh = JSON.parse(JSON.stringify(S.shorts)), msg = document.querySelector('#shortMsg').textContent; S.stop(); return { I, sh, msg }; });
  console.log('PMOS load I', q.I, 'shorts', JSON.stringify(q.sh), q.msg); assert.ok(Math.abs(q.I) > 0.03 && q.sh.length === 1 && q.sh[0].source === 'V1' && q.sh[0].path.includes('R1') && /Короткое/.test(q.msg));
  const pal = await pg.evaluate(() => document.body.innerHTML.includes('IRF9540')); console.log('P-MOSFET in palette', pal); assert.ok(pal);
  console.log('console errors', errs); assert.equal(errs.length, 0); await b.close(); console.log('V6 E2E OK'); })().catch(e => { console.error(e); process.exit(1); });
