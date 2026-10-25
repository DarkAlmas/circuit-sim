'use strict';
/* v12: portrait phone UI (≤600px, portrait). Pure DOM (createElement/textContent), no innerHTML.
   Re-uses the existing controls (#run/#stop, #mParts/#mWire/#mProps/#mCode, #rtabs, RobotUI) so the desktop/landscape layout is untouched. */
(function () {
  const $ = s => document.querySelector(s), body = document.body;
  const el = (t, a = {}, kids = []) => { const e = document.createElement(t); Object.assign(e, a); for (const k of kids) e.append(k); return e; };
  const mq = window.matchMedia('(max-width:600px) and (orientation:portrait)');
  const sim = () => window.__sim, RUI = () => window.RobotUI;
  const vh = () => (window.visualViewport ? window.innerHeight : window.innerHeight);

  /* top bar: project select doubles as the project name, ▶/⏸ in the centre, ⋯ menu */
  const header = $('header');
  const bPlay = el('button', { id: 'pmPlay', className: 'go', textContent: '▶', title: 'Запустить / пауза' });
  const bMore = el('button', { id: 'pmMore', textContent: '⋯', title: 'Меню' });
  bMore.setAttribute('aria-haspopup', 'menu'); bPlay.setAttribute('aria-label', 'Запустить');
  header.append(bPlay, bMore);
  const menu = el('div', { id: 'pmMenu', hidden: true }); menu.setAttribute('role', 'menu');
  const mi = (id, txt, fn) => { const b = el('button', { id, textContent: txt }); b.setAttribute('role', 'menuitem'); b.onclick = () => { menu.hidden = true; fn(); }; menu.append(b); return b; };
  mi('pmSave', '💾 Сохранить', () => $('#save').click());
  mi('pmNew', '＋ Новый проект', () => $('#new').click());
  mi('pmExamples', '📂 Проекты и примеры', () => { const s = $('#projects'); s.focus(); try { s.showPicker && s.showPicker(); } catch (e) { /* not allowed without gesture in some browsers */ } });
  mi('pmExport', '⬇ Экспорт', () => $('#export').click());
  mi('pmImport', '⬆ Импорт', () => $('#import').click());
  mi('pmSettings', '⚙ Настройки', () => { const s = window.__sim; if (s) s.openSettings(); });
  const bFont = mi('pmFont', '', () => { const f = font() === 14 ? 16 : 14; try { localStorage.setItem('pmFont', String(f)); } catch (e) {} applyFont(); });
  const font = () => { let f = 14; try { f = +localStorage.getItem('pmFont') === 16 ? 16 : 14; } catch (e) {} return f; };
  function applyFont() { const f = font(); body.style.setProperty('--codefs', f + 'px'); bFont.textContent = '⚙ Шрифт кода: ' + f + ' px'; }
  applyFont();
  body.append(menu);
  bMore.onclick = e => { e.stopPropagation(); menu.hidden = !menu.hidden; };
  document.addEventListener('pointerdown', e => { if (!menu.hidden && !menu.contains(e.target) && e.target !== bMore) menu.hidden = true; });

  function playing() { const r = RUI(); if (r && r.tab === 'track') return r.run && !r.paused; return !$('#stop').disabled; }
  bPlay.onclick = () => { const r = RUI();
    if (r && r.tab === 'track') { (r.paused || !r.run ? $('#rPlay') : $('#rPause')).click(); }
    else (playing() ? $('#stop') : $('#run')).click();
    sync(); };

  /* tabs: Схема / Шасси / Трасса / Код */
  const tabs = el('nav', { id: 'pmTabs' }); tabs.setAttribute('role', 'tablist');
  const T = {}; for (const [k, t] of [['schema', 'Схема'], ['chassis', 'Шасси'], ['track', 'Трасса'], ['code', 'Код']]) {
    const b = el('button', { textContent: t }); b.dataset.ptab = k; b.setAttribute('role', 'tab'); b.onclick = () => go(k); T[k] = b; tabs.append(b); }
  header.after(tabs);
  function go(k) { if (!body.classList.contains('pm')) return; menu.hidden = true;
    const codeOpen = body.dataset.sheet === 'code';
    if (k === 'code') { const r = RUI(); if (r && r.tab !== 'schema') { const sb = $('#rtabs [data-rtab=schema]'); if (sb) sb.click(); } if (!codeOpen) $('#mCode').click(); }
    else { if (codeOpen) $('#mCode').click(); else if (body.dataset.sheet) closeSheet();
      const rb = $('#rtabs [data-rtab=' + k + ']'); if (rb && !$('#rtabs').hidden) rb.click(); }
    body.dataset.ptab = k; sync(); }

  /* schema: ⤢ fit + 🗑 in the bottom bar */
  const bFit = el('button', { id: 'pmFit', className: 'fbtn', textContent: '⤢', title: 'Вся схема' }); bFit.onclick = () => sim() && sim().fit();
  $('#center').append(bFit);
  const bDel = el('button', { id: 'mDel', textContent: '🗑', title: 'Удалить выделенное' }); bDel.setAttribute('aria-label', 'Удалить');
  bDel.onclick = () => { if (sim() && sim().sel) { sim().del(); closeSheet(); } };
  $('#mbar').append(bDel);

  /* bottom sheets with drag handle + snap points (peek / half / full); swipe down closes */
  function closeSheet() { const s = body.dataset.sheet; if (s === 'parts') $('#mParts').click(); else if (s === 'props') $('#mProps').click(); }
  const SNAP = { left: [0.3, 0.6, 0.9], right: [0.25, 0.4, 0.9], bside: [0.08, 0.45, 0.85] };
  function handle(host, key) { const h = el('div', { className: 'pmHandle' }); h.append(el('i')); h.setAttribute('aria-label', 'Потяни, чтобы изменить размер');
    host.prepend(h); let y0 = 0, h0 = 0, on = false, moved = false;
    h.addEventListener('pointerdown', e => { if (!body.classList.contains('pm')) return; on = true; moved = false; y0 = e.clientY; const box = key === 'bside' ? $('#bottom') : host; h0 = box.getBoundingClientRect().height; h.setPointerCapture(e.pointerId); e.preventDefault(); });
    h.addEventListener('pointermove', e => { if (!on) return; const d = y0 - e.clientY; if (Math.abs(d) > 6) moved = true; setH(key, Math.max(30, h0 + d) / vh()); });
    const up = e => { if (!on) return; on = false; const box = key === 'bside' ? $('#bottom') : host, f = box.getBoundingClientRect().height / vh(), sn = SNAP[key];
      if (!moved) { if (key === 'bside') { const open = body.dataset.ser !== 'open'; body.dataset.ser = open ? 'open' : ''; setH(key, null); } return; }
      if (key === 'bside') { const open = f > 0.2; body.dataset.ser = open ? 'open' : ''; setH(key, open ? nearest(f, sn.slice(1)) : null); return; }
      if (f < sn[0] * 0.75) { setH(key, null); closeSheet(); return; }
      setH(key, nearest(f, sn)); };
    h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up); }
  const nearest = (f, a) => a.reduce((b, x) => Math.abs(x - f) < Math.abs(b - f) ? x : b, a[0]);
  function setH(key, f) { const v = '--h-' + key; if (f == null) body.style.removeProperty(v); else body.style.setProperty(v, Math.round(Math.min(0.92, f) * 1000) / 10 + 'vh'); }
  handle($('#left'), 'left'); handle($('#right'), 'right'); handle($('#bside'), 'bside');
  // closing a sheet resets its height to the default snap
  new MutationObserver(() => { if (!body.dataset.sheet) { setH('left', null); setH('right', null); } sync(); }).observe(body, { attributes: true, attributeFilter: ['data-sheet'] });

  /* «Свойства» opens itself (40%) when something gets selected on the schema */
  let lastSel = '';
  function selKey() { const s = sim() && sim().sel; return s ? (s.wire ? 'w' + s.wire : 'p' + (s.part || '')) : ''; }

  // keep the selected part/wire visible above the 40% sheet (pan the view up if the sheet covers it)
  function reveal() { const S = sim(), s = S && S.sel; if (!s) return; const q = s.wire ? '[data-wire="' + CSS.escape(s.wire) + '"]' : '[data-part="' + CSS.escape(s.part || '') + '"]';
    let r = null; for (const e of document.querySelectorAll('#svg ' + q)) { const b = e.getBoundingClientRect(); if (!r || b.width * b.height > r.width * r.height) r = b; } if (!r) return;
    const top = $('#right').getBoundingClientRect().top, svgTop = $('#svg').getBoundingClientRect().top;
    const need = Math.min(r.bottom - (top - 24), r.top - svgTop - 8); if (need > 0) { S.cam.y -= need; S.render(); } }

  // a tap (not a pan/drag) on a part or wire opens Свойства even if it was already selected
  let tap0 = null; const svgEl = $('#svg');
  svgEl.addEventListener('pointerdown', e => { tap0 = e.isPrimary ? [e.clientX, e.clientY, Date.now()] : null; });
  svgEl.addEventListener('pointerup', e => { const t = tap0; tap0 = null; if (!t || Math.hypot(e.clientX - t[0], e.clientY - t[1]) > 8 || Date.now() - t[2] > 600) return;
    setTimeout(() => { const S = sim(); if (body.classList.contains('pm') && body.dataset.ptab === 'schema' && S && S.sel && !S.wireMode && !S.armed && body.dataset.sheet !== 'props' && body.dataset.sheet !== 'parts') { $('#mProps').click(); lastSel = selKey(); requestAnimationFrame(reveal); } }, 0); });

  /* code: symbol strip over the keyboard */
  const sym = el('div', { id: 'pmSym' }); sym.setAttribute('aria-label', 'Символы');
  for (const c of ['{', '}', '(', ')', ';', '=', '<', '>', '"', '/', 'Tab']) { const b = el('button', { textContent: c === 'Tab' ? '⇥' : c }); b.dataset.ins = c === 'Tab' ? '  ' : c; b.title = c; sym.append(b); }
  sym.addEventListener('pointerdown', e => e.preventDefault()); // keep the textarea focused (keyboard stays open)
  sym.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; const ta = $('#code'); if (ta.readOnly || ta.disabled) return;
    ta.focus(); const a = ta.selectionStart, z = ta.selectionEnd; ta.setRangeText(b.dataset.ins, a, z, 'end'); ta.dispatchEvent(new Event('input', { bubbles: true })); });
  body.append(sym);

  /* keyboard: visualViewport → --kb so the editor ends above it */
  function kb() { const v = window.visualViewport; const k = v ? Math.max(0, Math.round(window.innerHeight - v.height - v.offsetTop)) : 0;
    body.style.setProperty('--kb', k + 'px'); body.classList.toggle('kbopen', k > 80); }
  if (window.visualViewport) { visualViewport.addEventListener('resize', kb); visualViewport.addEventListener('scroll', kb); }
  window.addEventListener('resize', kb);

  function sync() { const pm = body.classList.contains('pm'); if (!pm) return;
    const r = RUI(), car = !$('#rtabs') || !$('#rtabs').hidden;
    T.chassis.hidden = T.track.hidden = !car;
    let k = body.dataset.sheet === 'code' ? 'code' : (r && car && r.tab !== 'schema' ? r.tab : 'schema');
    if (!car && (k === 'chassis' || k === 'track')) k = 'schema';
    body.dataset.ptab = k; for (const [n, b] of Object.entries(T)) { b.classList.toggle('on', n === k); b.setAttribute('aria-selected', String(n === k)); }
    const p = playing(); bPlay.textContent = p ? '⏸' : '▶'; bPlay.classList.toggle('go', !p); bPlay.setAttribute('aria-label', p ? 'Пауза' : 'Запустить');
    bDel.disabled = !(sim() && sim().sel);
    const sk = selKey(); if (sk && sk !== lastSel && k === 'schema' && body.dataset.sheet !== 'parts' && body.dataset.sheet !== 'props') { $('#mProps').click(); requestAnimationFrame(reveal); }
    lastSel = sk; }

  function apply() { const on = mq.matches; body.classList.toggle('pm', on);
    if (on) { body.dataset.ptab = body.dataset.ptab || 'schema'; kb(); sync(); } else { menu.hidden = true; delete body.dataset.ptab; }
    window.dispatchEvent(new Event('resize')); }
  mq.addEventListener ? mq.addEventListener('change', apply) : mq.addListener(apply);
  ['click', 'pointerup', 'keyup', 'change'].forEach(t => document.addEventListener(t, () => setTimeout(sync, 0)));
  setInterval(sync, 300);
  apply();
  window.__pm = { go, sync, get on() { return body.classList.contains('pm'); } };
})();
