/* v14.7: Orange Pi OS image (.img/.iso) attach → IndexedDB. No in-browser boot:
   real Orange Pi OS runs on the desktop via QEMU (PC Bot). window.OpiOs.getImage(partId) is the hook for that bridge. */
(function () {
  const PRESETS = { 'Allwinner H3': { cpuCores: 4, cpuMhz: 1300, ramMb: 1024 }, 'Allwinner H5': { cpuCores: 4, cpuMhz: 1400, ramMb: 1024 },
    'Allwinner H6': { cpuCores: 4, cpuMhz: 1800, ramMb: 2048 }, 'Rockchip RK3566': { cpuCores: 4, cpuMhz: 1800, ramMb: 4096 } };
  const RAM = [512, 1024, 2048, 4096, 8192], DISK = [4, 8, 16, 32, 64, 128];
  const SOFT = 256 * 1024 * 1024, HARD = 2 * 1024 * 1024 * 1024, EXT = /\.(img|iso|xz|gz|zip)$/i;
  const fmtSize = n => n >= 1073741824 ? (n / 1073741824).toFixed(2) + ' ГБ' : n >= 1048576 ? (n / 1048576).toFixed(1) + ' МБ' : Math.round(n / 1024) + ' КБ';
  const summary = pr => `${String(pr.cpuModel || '').replace(/^(Allwinner|Rockchip) /, '')} · ${pr.cpuCores}×${(pr.cpuMhz / 1000).toFixed(1).replace('.', ',')} ГГц · ${pr.ramMb >= 1024 ? pr.ramMb / 1024 + ' ГБ' : pr.ramMb + ' МБ'} · диск ${pr.diskGb} ГБ`;
  function check(file) {
    if (!file || !EXT.test(file.name)) return { ok: false, msg: 'Нужен файл .img, .iso, .xz, .gz или .zip' };
    if (file.size > HARD) return { ok: false, msg: 'Образ больше 2 ГБ — слишком большой для браузера' };
    return { ok: true, warn: file.size > SOFT ? 'Образ больше 256 МБ — хранится только в этой вкладке, после перезагрузки прикрепи заново' : '' };
  }
  const mem = {};
  function db() { return new Promise((res, rej) => { if (typeof indexedDB === 'undefined') return rej(new Error('нет IndexedDB'));
    const r = indexedDB.open('opi-os', 1); r.onupgradeneeded = () => r.result.createObjectStore('img'); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }); }
  async function tx(mode, fn) { const d = await db(); return new Promise((res, rej) => { const t = d.transaction('img', mode), q = fn(t.objectStore('img')); t.oncomplete = () => res(q && q.result); t.onerror = () => rej(t.error); }); }
  async function attach(partId, file) {
    const c = check(file); if (!c.ok) throw new Error(c.msg);
    const meta = { name: file.name, size: file.size, mime: file.type || 'application/octet-stream', ts: Date.now(), id: 'opi-sd-' + partId };
    mem[partId] = { blob: file, meta };
    if (file.size <= SOFT) { try { await tx('readwrite', s => s.put({ blob: file, meta }, meta.id)); } catch (e) { c.warn = 'IndexedDB недоступен — образ только в этой вкладке'; } }
    return { meta, warn: c.warn };
  }
  async function getImage(partId) { if (mem[partId]) return mem[partId]; try { const v = await tx('readonly', s => s.get('opi-sd-' + partId)); return v || null; } catch (e) { return null; } }
  async function eject(partId) { delete mem[partId]; try { await tx('readwrite', s => s.delete('opi-sd-' + partId)); } catch (e) { /* ok */ } }
  async function exportImage(partId) {
    const v = await getImage(partId); if (!v) return false;
    const a = document.createElement('a'), u = URL.createObjectURL(v.blob); a.href = u; a.download = v.meta.name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000); return true;
  }
  const api = { PRESETS, RAM, DISK, SOFT, HARD, fmtSize, summary, check, attach, getImage, eject, exportImage };
  if (typeof window !== 'undefined') window.OpiOs = api;
  if (typeof module !== 'undefined') module.exports = api;
})();
