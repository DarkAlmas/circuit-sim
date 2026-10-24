/* Simplified Arduino C -> async JS transpiler. Used inside the worker and by tests. */
(function (root) {
  const TYPES = '(?:unsigned\\s+)?(?:long\\s+long|int|float|double|long|bool|boolean|byte|String|char|uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t|size_t|word|short)';
  function transpile(src) {
    let s = src.replace(/^\s*#include.*$/gm, '')
      .replace(/^\s*#define\s+(\w+)\s+(.+)$/gm, 'const $1 = $2;');
    const names = new Set(['delay', 'delayMicroseconds']);
    s = s.replace(new RegExp('\\b(?:void|' + TYPES + ')\\s*\\*?\\s+(\\w+)\\s*\\(([^)]*)\\)\\s*\\{', 'g'), (m, name, params) => {
      names.add(name);
      const ps = params.trim() === '' || params.trim() === 'void' ? '' :
        params.split(',').map(p => p.trim().split(/\s+|\*|&/).filter(Boolean).pop()).join(', ');
      return `async function __DEF_${name}(${ps}) {`;
    });
    s = s.replace(/\(\s*(?:int|float|long|double|byte|unsigned\s+long|bool)\s*\)/g, '');
    s = s.replace(new RegExp('\\b(const\\s+)?' + TYPES + '\\s+(?=[A-Za-z_])', 'g'), (m, c) => c ? 'const ' : 'let ');
    s = s.replace(/\b(let|const)\s+(\w+)\s*\[\s*\d*\s*\]\s*=\s*\{([^}]*)\}/g, '$1 $2 = [$3]');
    s = s.replace(/\b(let|const)\s+(\w+)\s*\[\s*(\d+)\s*\]\s*;/g, '$1 $2 = new Array($3).fill(0);');
    for (const n of names) s = s.replace(new RegExp('(?<![\\w.])' + n + '\\s*\\(', 'g'), `await ${n}(`);
    s = s.replace(/__DEF_/g, '');
    return s;
  }
  const api = { transpile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Transpile = api;
})(typeof self !== 'undefined' ? self : this);
