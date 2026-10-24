/* Simplified Arduino C -> async JS transpiler. Used inside the worker and by tests. */
(function (root) {
  const TYPES = '(?:unsigned\\s+)?(?:long\\s+long|int|float|double|long|bool|boolean|byte|String|char|uint8_t|uint16_t|uint32_t|int8_t|int16_t|int32_t|size_t|word|short|uint64_t)';
  const LIBS = 'Servo|Adafruit_NeoPixel|LiquidCrystal_I2C|Adafruit_SSD1306|DHT|LedControl|NewPing|RF24|VL53L0X|Adafruit_VL53L0X|MPU6050|Adafruit_MPU6050';
  function transpile(src) {
    let s = src.replace(/^\s*#include.*$/gm, '')
      .replace(/^\s*#define\s+(\w+)\s+(.+)$/gm, 'const $1 = $2;')
      .replace(new RegExp('^(\\s*)(' + LIBS + ')\\s+(\\w+)\\s*(?:=\\s*\\w+\\s*)?(?:\\(([^;]*)\\))?\\s*;', 'gm'), (m, ind, cls, name, args) => `${ind}var ${name} = __lib('${cls}'${args ? ', ' + args : ''});`);
    // v7: struct-like result holders, pointer args, sizeof, 64-bit literal suffixes
    s = s.replace(/^(\s*)(?:VL53L0X_RangingMeasurementData_t|sensors_event_t)\s+([\w\s,]+);/gm, (m, ind, list) => ind + 'var ' + list.split(',').map(x => x.trim() + ' = {}').join(', ') + ';');
    s = s.replace(/(\w+)\.(getAcceleration|getRotation|getMotion6)\s*\(([^)]*)\)/g, (m, o, fn, args) => `[${args.replace(/&/g, '')}] = ${o}.${fn}()`);
    s = s.replace(/(\w+)\.read\s*\(\s*&\s*(\w+)\s*,([^;]*)\)/g, '$2 = $1.read($3)');
    s = s.replace(/([(,]\s*)&(?=[A-Za-z_])/g, '$1');
    s = s.replace(/\b(0x[0-9A-Fa-f]+|\d+)(?:ULL|LL|UL|U|L)\b/g, '$1');
    s = s.replace(/\bsizeof\s*\(/g, '__sizeof(');
    const names = new Set(['delay', 'delayMicroseconds']);
    s = s.replace(new RegExp('\\b(?:void|' + TYPES + ')\\s*\\*?\\s+(\\w+)\\s*\\(([^)]*)\\)\\s*\\{', 'g'), (m, name, params) => {
      names.add(name);
      const ps = params.trim() === '' || params.trim() === 'void' ? '' :
        params.split(',').map(p => p.trim().split(/\s+|\*|&/).filter(Boolean).pop()).join(', ');
      return `async function __DEF_${name}(${ps}) {`;
    });
    s = s.replace(/\(\s*(?:int|float|long|double|byte|unsigned\s+long|bool)\s*\)/g, '');
    s = s.replace(new RegExp('\\b(const\\s+)?' + TYPES + '\\s+(?=[A-Za-z_])', 'g'), (m, c) => c ? 'const ' : 'let ');
    s = s.replace(/\b(let|const)\s+(\w+)\s*(?:\[\s*\d*\s*\])+\s*=\s*\{([^}]*)\}/g, '$1 $2 = [$3]');
    s = s.replace(/\b(let|const)\s+(\w+)\s*(?:\[\s*\d*\s*\])+\s*=\s*("(?:[^"\\]|\\.)*")/g, '$1 $2 = $3');
    s = s.replace(/\b(let|const)\s+(\w+)\s*\[\s*(\d+)\s*\]\s*;/g, '$1 $2 = new Array($3).fill(0);');
    for (const n of names) s = s.replace(new RegExp('(?<![\\w.])' + n + '\\s*\\(', 'g'), `await ${n}(`);
    s = s.replace(/__DEF_/g, '');
    return s;
  }
  /* Python subset -> async JS (Orange Pi). Indentation blocks, def/if/elif/else/while/for-in/try, hoisted locals. */
  const PY_ASYNC = ['sleep'];
  function py(src) {
    if (src.length > 100000) throw new Error('слишком длинная программа');
    const strs = [];
    const prot = line => line.replace(/f?("([^"\\]|\\.)*"|'([^'\\]|\\.)*')/g, m => { let t;
      if (m[0] === 'f') t = '`' + m.slice(2, -1).replace(/`/g, '\\`').replace(/\$/g, '\\$').replace(/\{([^{}]*)\}/g, '${$1}') + '`'; else t = m;
      strs.push(t); return '\u0001' + (strs.length - 1) + '\u0002'; });
    const lines = src.replace(/\r/g, '').replace(/\t/g, '    ').split('\n');
    const defs = new Set();
    for (const l of lines) { const m = /^\s*def\s+(\w+)/.exec(l); if (m) defs.add(m[1]); }
    const out = [], stack = [{ ind: -1, decl: new Set(), glob: new Set(), at: 0, fn: true }];
    const scope = () => { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].fn) return stack[i]; };
    const expr = e => { e = e.replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null')
        .replace(/\bnot\s+/g, '!').replace(/\s+and\s+/g, ' && ').replace(/\s+or\s+/g, ' || ').replace(/\bis\s+!/g, '!==').replace(/\bis\b/g, '===')
        .replace(/([\w\])]+)\s*\/\/\s*([\w(]+)/g, 'Math.floor($1 / $2)').replace(/\.append\(/g, '.push(')
        .replace(/\[([^\[\]]*)\]\s*\*\s*(\w+)/g, '__rep([$1], $2)')
        .replace(/(\w+)\s+in\s+(\w+)/g, '__in($1, $2)').replace(/\blambda\b/g, () => { throw new Error('lambda не поддерживается'); });
      e = e.replace(/\btime\.sleep\s*\(/g, 'await time.sleep(');
      for (const n of [...defs, ...PY_ASYNC]) e = e.replace(new RegExp('(?<![\\w.])' + n + '\\s*\\(', 'g'), 'await ' + n + '(');
      return e; };
    let n = 0;
    for (const raw of lines) { n++;
      let l = prot(raw); const hash = l.indexOf('#'); if (hash >= 0) l = l.slice(0, hash);
      if (!l.trim()) continue;
      const ind = l.match(/^ */)[0].length; l = l.trim();
      while (ind <= stack[stack.length - 1].ind) { const b = stack.pop(); out.push('}'); if (b.fn) b.close(); }
      if (/^(import|from)\s/.test(l)) continue;
      if (/^class\s/.test(l)) throw new Error(`строка ${n}: class не поддерживается`);
      let m;
      const open = (head, fn) => { out.push(head + ' {'); const b = { ind, fn, decl: new Set(), glob: new Set(), at: out.length }; if (fn) { out.push(''); b.close = () => { out[b.at] = b.decl.size ? 'let ' + [...b.decl].join(', ') + ';' : ''; }; } stack.push(b); };
      if ((m = /^def\s+(\w+)\s*\(([^)]*)\)\s*:$/.exec(l))) { open(`async function ${m[1]}(${m[2]})`, true); m[2].split(',').map(x => x.trim().split('=')[0].trim()).filter(Boolean).forEach(a => stack[stack.length - 1].glob.add(a)); continue; }
      if ((m = /^if\s+(.+):$/.exec(l))) { open(`if (${expr(m[1])})`); continue; }
      if ((m = /^elif\s+(.+):$/.exec(l))) { open(`else if (${expr(m[1])})`); continue; }
      if (/^else\s*:$/.test(l)) { open('else'); continue; }
      if ((m = /^while\s+(.+):$/.exec(l))) { open(`while (${expr(m[1])})`); continue; }
      if ((m = /^for\s+(\w+)\s+in\s+(.+):$/.exec(l))) { open(`for (const ${m[1]} of __iter(${expr(m[2])}))`); continue; }
      if (/^try\s*:$/.test(l)) { open('try'); continue; }
      if ((m = /^except\b.*:$/.exec(l))) { open('catch (__e)'); continue; }
      if (/:$/.test(l)) throw new Error(`строка ${n}: не понимаю «${l.replace(/\u0001(\d+)\u0002/g, '…')}»`);
      if ((m = /^global\s+(.+)$/.exec(l))) { m[1].split(',').forEach(x => scope().glob.add(x.trim())); continue; }
      if (l === 'pass') { out.push(';'); continue; }
      if ((m = /^return\b(.*)$/.exec(l))) { out.push('return ' + expr(m[1]) + ';'); continue; }
      if ((m = /^([\w ,]+?)\s*=(?!=)\s*(.+)$/.exec(l)) && /^[A-Za-z_]\w*(\s*,\s*[A-Za-z_]\w*)*$/.test(m[1].trim())) {
        const names = m[1].split(',').map(x => x.trim()), sc = scope();
        for (const v of names) if (!sc.glob.has(v) && !(sc === stack[0] ? false : stack[0].decl.has(v) && sc.glob.has(v))) sc.decl.add(v);
        out.push(names.length > 1 ? `[${names.join(', ')}] = [${expr(m[2])}];` : `${names[0]} = ${expr(m[2])};`); continue; }
      out.push(expr(l) + ';');
    }
    while (stack.length > 1) { const b = stack.pop(); out.push('}'); if (b.fn) b.close(); }
    const top = stack[0]; const funcs = new Set(defs);
    const head = top.decl.size ? 'let ' + [...top.decl].filter(v => !funcs.has(v)).join(', ') + ';' : '';
    // module-level names must be visible inside defs: hoist them above the main body
    return (head.length > 4 ? head : '') + '\nasync function __main() {\n' + out.join('\n').replace(/\u0001(\d+)\u0002/g, (x, i) => strs[+i]) + '\n}';
  }
  const api = { transpile, py };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.Transpile = api;
})(typeof self !== 'undefined' ? self : this);
