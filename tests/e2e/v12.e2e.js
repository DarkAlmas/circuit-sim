// v12: portrait phone UI at 360×780 and 390×844 with touch — top bar ▶/⋯, tabs Схема/Шасси/Трасса/Код, parts & props sheets,
// wiring, deleting a wire, running an example, editing code with the keyboard open (symbol strip), robot track + PID sliders.
const { chromium } = require('playwright-core'); const assert = require('assert');
const URL = process.argv[2] || 'http://localhost:8765/';
const BLINK = 'ex:Пример: мигание светодиодом (ESP32)', PID = 'ex:Пример: Плавная езда (ПИД)';
async function phone(b, W, H) {
  const errs = [], mc = await b.newContext({ viewport: { width: W, height: H }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }), pg = await mc.newPage();
  pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); }); pg.on('pageerror', e => errs.push(e.message));
  await pg.goto(URL); await pg.waitForTimeout(400);
  const cdp = await mc.newCDPSession(pg), touch = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const swipe = async (x0, y0, x1, y1, n = 8) => { await touch('touchStart', x0, y0); for (let i = 1; i <= n; i++) { await touch('touchMove', x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n); await pg.waitForTimeout(16); } await touch('touchEnd'); await pg.waitForTimeout(900); }; // pause so the next tap is not taken as a double-tap
  const ev = (f, a) => pg.evaluate(f, a), sheet = () => ev(() => document.body.dataset.sheet || '');
  const rect = s => ev(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height, b: r.bottom, cx: r.x + r.width / 2, cy: r.y + r.height / 2 }; }, s);
  const noHScroll = () => ev(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth);
  const tag = `[${W}×${H}]`;
  const ok = (c, m) => { assert.ok(c, tag + ' ' + m); console.log(tag, '✓', m); };

  ok(await ev(() => [...document.scripts].filter(s => s.src).every(s => /\?v=(12|13|14|14\.1|14\.2|14\.3|14\.4|14\.5|14\.5\.1|14\.5\.2|14\.5\.3|14\.5\.5)$/.test(s.src)) && document.body.classList.contains('pm')), 'scripts ?v=12+, portrait UI on');
  ok((await (await fetch(new globalThis.URL('app.js?v=14.5.5', URL))).text()).includes("new Worker('worker.js?v=14.5.5')"), 'worker cache key v=14.5.5');
  // top bar 48px, tabs, bottom bar, touch targets, text size, no horizontal scroll
  const L = await ev(() => { const vis = e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden'; };
    const btns = [...document.querySelectorAll('header button, header select, #pmTabs button, #mbar button, #pmFit')].filter(vis);
    return { hdr: document.querySelector('header').getBoundingClientRect().height, tabs: [...document.querySelectorAll('#pmTabs button')].filter(vis).map(b => b.textContent),
      bar: [...document.querySelectorAll('#mbar button')].filter(vis).map(b => [b.textContent, Math.round(b.getBoundingClientRect().height)]),
      minBtn: Math.min(...btns.map(b => Math.min(b.getBoundingClientRect().height, b.getBoundingClientRect().width))), minFont: Math.min(...btns.map(b => parseFloat(getComputedStyle(b).fontSize))),
      play: document.querySelector('#pmPlay').getBoundingClientRect(), svg: document.querySelector('#svg').getBoundingClientRect().width }; });
  console.log(tag, 'layout', JSON.stringify({ ...L, play: [Math.round(L.play.x + L.play.width / 2)] }));
  ok(L.hdr <= 50 && L.hdr >= 46, 'top bar 48px'); ok(Math.abs(L.play.x + L.play.width / 2 - W / 2) < 2, '▶ centred');
  ok(L.tabs.join() === 'Схема,3D,Код', 'tabs Схема/3D/Код (no robot)'); ok(L.bar.map(b => b[0]).join('|') === '＋ Детали|〰 Провод|⚙ Свойства|↩|↪|🗑' && L.bar.every(b => b[1] >= 56), 'bottom bar: undo/redo left of delete, 56px');
  ok(L.minBtn >= 44 && L.minFont >= 14, 'touch targets ≥44px, text ≥14px'); ok(Math.abs(L.svg - W) < 2, 'canvas full width'); ok(await noHScroll(), 'no horizontal scroll');
  // ⋯ menu
  await pg.tap('#pmMore'); ok(await pg.isVisible('#pmMenu #pmSave') && await pg.isVisible('#pmExport') && await pg.isVisible('#pmExamples'), '⋯ menu: save/export/examples');
  await pg.touchscreen.tap(W / 2, H / 2); ok(!(await pg.isVisible('#pmMenu')), 'menu closes on outside tap');

  // 1) add parts from the 60% sheet (4-column grid), placed at the view centre, then moved
  const parts = () => ev(() => __sim.proj.parts.map(p => p.id + ':' + p.type));
  const add = async type => { const n0 = await parts(); await pg.tap('#mParts');
    const g = await ev(() => ({ cols: getComputedStyle(document.querySelector('#palette')).gridTemplateColumns.split(' ').length, h: document.querySelector('#left').getBoundingClientRect().height / innerHeight }));
    ok(g.cols === 4 && Math.abs(g.h - 0.6) < 0.03, 'Детали sheet 60%, 4 columns');
    await pg.fill('#search', type === 'resistor' ? 'резист' : 'светодиод'); await pg.tap(`#palette .item[data-type="${type}"]`); await pg.waitForTimeout(150);
    const n1 = await parts(), nw = n1.find(x => !n0.includes(x)); ok(nw && nw.endsWith(':' + type), 'added ' + nw); return nw.split(':')[0]; };
  // start from an empty schematic
  await ev(() => { const p = __sim.proj; p.parts.length = 0; p.wires.length = 0; __sim.select(null); __sim.changed(); __sim.render(); });
  const R = await add('resistor');
  const pr = await rect(`.part[data-part="${R}"]`), sv = await rect('#svg');
  ok(Math.abs(pr.cx - sv.cx) < 40 && Math.abs(pr.cy - sv.cy) < 60, 'placed at the view centre');
  if (await sheet()) await pg.tap(await sheet() === 'props' ? '#mProps' : '#mParts');
  const D = await add('led'); if (await sheet() === 'props') await pg.tap('#mProps');
  let dr = await rect(`.part[data-part="${D}"]`); const x0 = await ev(id => __sim.proj.parts.find(p => p.id === id).x, D);
  await swipe(dr.cx, dr.cy, dr.cx + 90, dr.cy - 10, 10); if (await sheet() === 'props') await pg.tap('#mProps');
  const x1 = await ev(id => __sim.proj.parts.find(p => p.id === id).x, D); ok(x1 - x0 > 40, 'part moved by finger (' + Math.round(x1 - x0) + ')');
  // ⤢ fits everything
  await ev(() => { __sim.cam.x += 2000; __sim.render(); }); await pg.tap('#pmFit'); await pg.waitForTimeout(100);
  dr = await rect(`.part[data-part="${D}"]`); ok(dr.x >= 0 && dr.x + dr.w <= W, '⤢ fits the circuit');
  // 2) wire it in Провод mode
  const pin = (p, i) => ev(([p, i]) => { const e = document.querySelectorAll(`.part[data-part="${p}"] .pin`)[i].getBoundingClientRect(); return [e.x + e.width / 2, e.y + e.height / 2]; }, [p, i]);
  await pg.tap('#mWire'); const w0 = await ev(() => __sim.proj.wires.length); let a = await pin(R, 1), c = await pin(D, 0);
  await pg.touchscreen.tap(a[0], a[1]); await pg.touchscreen.tap(c[0], c[1]); await pg.waitForTimeout(150); await pg.tap('#mWire');
  if (await sheet() === 'props') await pg.tap('#mProps');
  const wid = await ev(() => __sim.proj.wires.length && __sim.proj.wires[__sim.proj.wires.length - 1].id);
  ok(await ev(() => __sim.proj.wires.length) === w0 + 1, 'wire drawn ' + wid);
  // 3) tap the wire → Свойства opens itself at 40% with U/I/P in one row; drag handle snaps; 🗑 deletes it
  const m = await ev(id => { const el = document.querySelector(`.whit[data-wire="${id}"]`), q = el.getPointAtLength(el.getTotalLength() / 2), t = el.getScreenCTM(); return [q.x * t.a + t.e, q.y * t.d + t.f]; }, wid);
  await pg.touchscreen.tap(m[0], m[1]); await pg.waitForTimeout(400);
  ok(await ev(() => __sim.sel && __sim.sel.wire) === wid && await sheet() === 'props', 'selecting opens Свойства');
  const pp = await ev(() => { const r = document.querySelector('#right').getBoundingClientRect(), cs = [...document.querySelectorAll('#props .card')].map(c => c.getBoundingClientRect()); return { h: r.height / innerHeight, top: r.top, cards: cs.map(c => Math.round(c.top)), cw: cs.map(c => c.right <= innerWidth) }; });
  ok(Math.abs(pp.h - 0.4) < 0.03 && pp.top > H * 0.3, 'Свойства 40%, circuit visible above');   const hd = await rect('#right .pmHandle'); await swipe(hd.cx, hd.cy, hd.cx, hd.cy - H * 0.45);
  ok(await ev(() => document.querySelector('#right').getBoundingClientRect().height / innerHeight) > 0.85, 'handle drag snaps to full');
  const hd2 = await rect('#right .pmHandle'); await swipe(hd2.cx, hd2.cy, hd2.cx, hd2.cy + H * 0.45);
  ok(Math.abs(await ev(() => document.querySelector('#right').getBoundingClientRect().height / innerHeight) - 0.4) < 0.03, 'drag down snaps to half');
  await pg.tap('#mDel'); await pg.waitForTimeout(150); ok(!(await ev(id => __sim.proj.wires.some(w => w.id === id), wid)), '🗑 deleted the wire');
  if (await sheet() === 'props') await pg.tap('#mProps');
  const rr = await rect(`.part[data-part="${R}"] .body, .part[data-part="${R}"]`); await pg.touchscreen.tap(rr.cx, rr.cy); await pg.waitForTimeout(300);
  const cd = await ev(() => [...document.querySelectorAll('#props .card')].map(c => { const r = c.getBoundingClientRect(); return [Math.round(r.top), r.right <= innerWidth, r.width]; }));
  ok(await sheet() === 'props' && cd.length === 3 && new Set(cd.map(c => c[0])).size === 1 && cd.every(c => c[1] && c[2] > 60), 'tap a part → Свойства with U·I·P cards in one row');
  await pg.tap('#mProps');
  await pg.tap('#mParts'); const hp = await rect('#left .pmHandle'); await swipe(hp.cx, hp.cy, hp.cx, H - 20);
  ok(await sheet() === '', 'swipe down closes a sheet');

  // 4) run an example from the menu, ▶/⏸ in the top bar
  await pg.tap('#pmMore'); await pg.tap('#pmExamples'); await pg.selectOption('#projects', BLINK); await pg.waitForTimeout(400);
  await pg.tap('#pmPlay'); await pg.waitForTimeout(1500); ok(await ev(() => __sim.running) && (await pg.textContent('#pmPlay')) === '⏸', 'example runs, button shows ⏸');
  await pg.screenshot({ path: `/tmp/v12-${W}.png` });
  await pg.tap('#pmPlay'); await pg.waitForTimeout(200); ok(!(await ev(() => __sim.running)) && (await pg.textContent('#pmPlay')) === '▶', '⏸ stops');

  // 5) code tab: full screen, 14px, keyboard open → editor above it, symbol strip on top of the keyboard
  await pg.tap('#pmTabs [data-ptab=code]'); await pg.waitForTimeout(150);
  const cp = await rect('#codePane'); ok(Math.abs(cp.w - W) < 2 && cp.h > H * 0.5 && await ev(() => getComputedStyle(document.querySelector('#code')).fontSize) === '14px', 'code full screen, 14px');
  const ser = await rect('footer#bottom'); ok(ser && ser.h <= 80 && ser.b <= H + 1, 'Serial is a collapsed sheet');
  await pg.tap('#bside .pmHandle'); ok((await rect('footer#bottom')).h > H * 0.3, 'Serial expands on tap'); await pg.tap('#bside .pmHandle'); ok((await rect('footer#bottom')).h <= 80, 'Serial collapses');
  const KB = Math.round(H * 0.4);
  await pg.tap('#code'); await ev(k => { Object.defineProperty(visualViewport, 'height', { configurable: true, get: () => innerHeight - k }); visualViewport.dispatchEvent(new Event('resize')); }, KB); await pg.waitForTimeout(100);
  const ta = await rect('#code'), sy = await rect('#pmSym');
  ok(ta.b <= H - KB - sy.h + 1 && Math.abs(sy.b - (H - KB)) < 2 && ta.h > 80, 'editor and symbol strip stay above the keyboard');
  ok(!(await pg.isVisible('footer#bottom')), 'Serial hidden while typing');
  await ev(() => { const t = document.querySelector('#code'); t.focus(); t.setSelectionRange(0, 0); });
  await pg.keyboard.type('int k'); for (const s of ['=', '(', ')', ';', '⇥']) await pg.tap(`#pmSym button:text-is("${s}")`);
  const head = await ev(() => document.querySelector('#code').value.slice(0, 12)); ok(head.startsWith('int k=();  '), 'typed + symbols inserted at caret: ' + JSON.stringify(head));
  ok(await ev(() => document.activeElement && document.activeElement.id === 'code'), 'keyboard stays open (focus kept)');
  ok(await ev(() => (__sim.proj.code || JSON.stringify(__sim.proj)).includes('int k=();')), 'edit saved into the project');
  await ev(() => { delete visualViewport.height; visualViewport.dispatchEvent(new Event('resize')); });
  ok(await noHScroll(), 'no horizontal scroll (code)');

  // 6) robot: Шасси/Трасса tabs, full-width track, Kp/Kd/speed sliders and sensor values below it
  await pg.tap('#pmTabs [data-ptab=schema]'); await pg.selectOption('#projects', PID); await pg.waitForTimeout(400);
  ok((await ev(() => [...document.querySelectorAll('#pmTabs button')].filter(b => !b.hidden).map(b => b.textContent))).join() === 'Схема,3D,Шасси,Трасса,Код', 'robot tabs');
  await pg.tap('#pmTabs [data-ptab=track]'); await pg.waitForTimeout(200);
  const cv = await rect('#rcanvas'), sn = await rect('#rsens'), kp = await rect('#rTkp'), sp = await rect('#rSpeed');
  ok(Math.abs(cv.w - W) < 2 && cv.h > H * 0.3, 'track full width'); ok(sn.y >= cv.b - 1 && kp.y >= cv.b && sp.y >= cv.b && kp.b <= H && sp.b <= H, 'sliders + sensors below the track');
  await pg.tap('#pmPlay'); await pg.waitForTimeout(2500); const d1 = await ev(() => RobotUI.run && RobotUI.run.dist);
  ok(d1 > 200 && (await pg.textContent('#pmPlay')) === '⏸', 'car drives from ▶ (' + Math.round(d1) + ' mm)');
  ok(/👁/.test(await pg.textContent('#rsens')), 'sensor values shown: ' + (await pg.textContent('#rsens')).split('\n')[0]);
  await pg.fill('#rTkp', '60'); await pg.dispatchEvent('#rTkp', 'input'); await pg.fill('#rTkd', '90'); await pg.dispatchEvent('#rTkd', 'input');
  await pg.fill('#rTbase', '220'); await pg.dispatchEvent('#rTbase', 'input'); await pg.waitForTimeout(100);
  const tune = await ev(() => __sim.proj.robot.tune); ok(tune.kp === 60 && tune.kd === 90 && tune.base > 200, 'sliders change tune ' + JSON.stringify(tune));
  await pg.tap('#pmPlay'); ok(await ev(() => RobotUI.paused), '⏸ pauses the car');
  ok(await noHScroll(), 'no horizontal scroll (track)');
  console.log(tag, 'errors', errs); assert.equal(errs.length, 0); await mc.close();
}
(async () => { const b = await chromium.launch({ executablePath: '/usr/bin/google-chrome' });
  await phone(b, 360, 780); await phone(b, 390, 844);
  // landscape phone + desktop keep the old layout
  for (const [w, h] of [[844, 390], [1280, 800]]) { const p = await (await b.newContext({ viewport: { width: w, height: h }, hasTouch: w < 900 })).newPage(); await p.goto(URL); await p.waitForTimeout(300);
    const r = await p.evaluate(() => ({ pm: document.body.classList.contains('pm'), tabs: getComputedStyle(document.querySelector('#pmTabs')).display, run: getComputedStyle(document.querySelector('#run')).display }));
    assert.ok(!r.pm && r.tabs === 'none' && r.run !== 'none', 'old layout at ' + w); console.log(`[${w}×${h}] ✓ old side-panel layout kept`); await p.context().close(); }
  await b.close(); console.log('v12 e2e OK');
})().catch(e => { console.error(e); process.exit(1); });
